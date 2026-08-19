/**
 * Azərbaycan altyazı addon — Cloudflare Worker.
 *
 * Why a Worker is needed at all:
 * During playback Stremio does not ask for /subtitles/movie/tt1375666.json.
 * It appends the video's hash, size and filename:
 *
 *   /subtitles/movie/tt1375666/videoHash=8e2b1f&videoSize=1471263&filename=x.mkv.json
 *
 * Static hosting has no file at that address, answers 404, and no subtitles
 * appear. This Worker ignores the trailing part and answers from the index
 * that `npm run build` generates.
 *
 * It runs in either of two modes, and picks automatically:
 *
 *   1. Deployed from GitHub (wrangler.toml, `[assets]` binding present)
 *      The Worker also serves dist/ — manifest, .vtt files, web page. One
 *      deployment is the entire addon. Nothing to configure.
 *
 *   2. Pasted into the Cloudflare dashboard by hand (no assets binding)
 *      Files live on GitHub Pages; set SITE below to that address.
 */

// Only used in mode 2. Ignored when deployed from the repository.
const SITE = 'https://USERNAME.github.io/REPOSITORY';

// Android compatibility.
//
// Stremio's Android app fetches subtitle files with an HTTP client that falls
// back to ISO-8859-1 when it is unsure of the encoding, so UTF-8 Azerbaijani
// letters arrive as "hÉ™lÉ™" instead of "hələ". Desktop sniffs the bytes and
// gets it right, which is why the same file looks fine on a computer.
//
// Stremio's own streaming server has an endpoint that downloads a subtitle and
// detects its encoding properly — it is what the official OpenSubtitles addon
// uses for exactly this reason. Routing through it sidesteps the app's decoder
// entirely. It only exists on desktop and Android, not in a browser, so the
// direct URL is offered alongside it as a fallback.
//
// Set to false to go back to a single, direct entry.
const ANDROID_COMPAT_ENTRY = true;
const STREMIO_SERVER = 'http://127.0.0.1:11470/subtitles.vtt?from=';
const FALLBACK_LABEL = 'Azərbaycan (ehtiyat)';

const INDEX_TTL_MS = 60 * 1000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

let cachedIndex = null;
let cachedAt = 0;

function withCors(response, overrides = {}) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  for (const [key, value] of Object.entries(overrides)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * Splits the addon request path.
 * Handles /subtitles/{type}/{id}.json and /subtitles/{type}/{id}/{extra}.json,
 * with the id either raw (tt0903747:1:2) or percent-encoded (tt0903747%3A1%3A2).
 */
function parseSubtitleRequest(pathname) {
  const segments = pathname.split('/').filter((part) => part !== '');
  if (segments.length < 3 || segments[0] !== 'subtitles') return null;

  const rest = segments.slice(2);
  const last = rest[rest.length - 1];
  if (!last.endsWith('.json')) return null;
  rest[rest.length - 1] = last.slice(0, -5);

  let id = rest[0];
  try {
    id = decodeURIComponent(id);
  } catch (error) {
    // fall back to the raw value
  }
  return { type: segments[1], id };
}

async function loadIndex(env, base) {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < INDEX_TTL_MS) return cachedIndex;

  try {
    const request = new Request(`${base}/subs.json`);
    const response = env.ASSETS
      ? await env.ASSETS.fetch(request)
      : await fetch(request, { cf: { cacheTtl: 60, cacheEverything: true } });
    if (response.ok) {
      cachedIndex = await response.json();
      cachedAt = now;
    }
  } catch (error) {
    // Keep serving the previous copy rather than going dark.
  }
  return cachedIndex || { videos: {} };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = decodeURI(url.pathname);

    // Where the .vtt files live: this Worker itself, or the static site.
    const base = env.ASSETS ? url.origin : ((env && env.SITE) || SITE).replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const subtitleRequest = parseSubtitleRequest(pathname);
    if (subtitleRequest) {
      const index = await loadIndex(env, base);
      const video = index.videos && index.videos[subtitleRequest.id];
      const subtitles = [];
      for (const sub of (video ? video.subtitles : [])) {
        // Paths are stored relative so the addon works on any hostname.
        const direct = sub.path ? `${base}/${sub.path}` : sub.url;

        if (ANDROID_COMPAT_ENTRY) {
          subtitles.push({
            id: `${sub.id}-srv`,
            url: `${STREMIO_SERVER}${encodeURIComponent(direct)}`,
            lang: sub.lang,
          });
          // Shown under its own name so a customer whose player cannot reach
          // the local server has something obvious to switch to.
          subtitles.push({ id: sub.id, url: direct, lang: FALLBACK_LABEL });
        } else {
          subtitles.push({ id: sub.id, url: direct, lang: sub.lang });
        }
      }
      return json({ subtitles, cacheMaxAge: 300 });
    }

    // The manifest ships with relative artwork paths so one build works on any
    // hostname. Stremio needs absolute URLs, so fill them in per request.
    if (pathname === '/manifest.json' && env.ASSETS) {
      const upstream = await env.ASSETS.fetch(request);
      if (upstream.ok) {
        try {
          const manifest = await upstream.json();
          for (const key of ['logo', 'background']) {
            if (manifest[key] && !/^https?:\/\//i.test(manifest[key])) {
              manifest[key] = `${base}/${String(manifest[key]).replace(/^\/+/, '')}`;
            }
          }
          return json(manifest);
        } catch (error) {
          // Malformed manifest: hand back whatever the file actually says.
        }
      }
      return withCors(upstream);
    }

    // Everything else is a file: the .vtt files, artwork, the web page.
    if (env.ASSETS) {
      // Say the encoding out loud for subtitles. Without an explicit charset,
      // Android's player falls back to a legacy codepage and Azerbaijani
      // letters arrive mangled, even though the file itself is good UTF-8.
      const overrides = /\.vtt$/i.test(pathname)
        ? { 'content-type': 'text/vtt; charset=utf-8' }
        : {};
      return withCors(await env.ASSETS.fetch(request), overrides);
    }

    if (pathname === '/' || pathname === '') {
      return Response.redirect(`${base}/`, 302);
    }
    return Response.redirect(`${base}${pathname}`, 302);
  },
};

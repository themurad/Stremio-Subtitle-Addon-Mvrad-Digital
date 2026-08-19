/**
 * Azərbaycan altyazı addon — Cloudflare Worker.
 */

const SITE = 'https://USERNAME.github.io/REPOSITORY';

// Stremio's Android app decodes subtitle files as ISO-8859-1, so UTF-8
// Azerbaijani letters arrive as "hÉ™lÉ™" instead of "hələ". Routing through
// Stremio's own streaming server bypasses that decoder.
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

    const base = env.ASSETS ? url.origin : ((env && env.SITE) || SITE).replace(/\/+$/, '');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const subtitleRequest = parseSubtitleRequest(pathname);
    if (subtitleRequest) {
      const index = await loadIndex(env, base);
      const video = index.videos && index.videos[subtitleRequest.id];
      const available = video ? video.subtitles : [];
      const absolute = (sub) => (sub.path ? `${base}/${sub.path}` : sub.url);

      const subtitles = [];
      for (const sub of available) {
        const named = available.length > 1 && sub.label
          ? `Azərbaycan · ${sub.label}`
          : sub.lang;

        subtitles.push(
          ANDROID_COMPAT_ENTRY
            ? {
                id: `${sub.id}-srv`,
                url: `${STREMIO_SERVER}${encodeURIComponent(absolute(sub))}`,
                lang: named,
              }
            : { id: sub.id, url: absolute(sub), lang: named },
        );
      }

      if (ANDROID_COMPAT_ENTRY && available.length) {
        subtitles.push({
          id: available[0].id,
          url: absolute(available[0]),
          lang: FALLBACK_LABEL,
        });
      }

      return json({ subtitles, cacheMaxAge: 300 });
    }

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

    if (env.ASSETS) {
      const overrides = {};

      if (/\.vtt$/i.test(pathname)) {
        overrides['content-type'] = 'text/vtt; charset=utf-8';
      }

      // Keep pages fresh so a newly added film shows up immediately instead of
      // sitting behind a cache and looking like the upload failed.
      if (/\.(html|json)$/i.test(pathname) || pathname === '/' || pathname === '') {
        overrides['cache-control'] = 'public, max-age=0, must-revalidate';
      }

      return withCors(await env.ASSETS.fetch(request), overrides);
    }

    if (pathname === '/' || pathname === '') {
      return Response.redirect(`${base}/`, 302);
    }
    return Response.redirect(`${base}${pathname}`, 302);
  },
};

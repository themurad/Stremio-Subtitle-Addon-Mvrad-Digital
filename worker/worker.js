/**
 * Azərbaycan altyazı addon — Cloudflare Worker.
 *
 * Why this exists:
 * During playback Stremio asks for subtitles at a URL that carries the video's
 * hash, size and filename, e.g.
 *   /subtitles/movie/tt1375666/videoHash=8e2b…&videoSize=1471263?&filename=x.mkv.json
 * A plain static host has no file at that address, so it answers 404 and no
 * subtitles show up. This Worker ignores the extra part and answers from the
 * index the build publishes.
 *
 * Setup (about two minutes, free, no card):
 *   1. dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *   2. Paste this whole file over the template, press Deploy
 *   3. Change SITE below to your GitHub Pages address
 *   4. In Stremio install:  https://<your-worker>.workers.dev/manifest.json
 *
 * You never need to touch it again — it reads the subtitle list live, so new
 * films you push to GitHub appear on their own.
 */

// ---------------------------------------------------------------------------
const SITE = 'https://USERNAME.github.io/REPOSITORY'; // <- change this one line
// ---------------------------------------------------------------------------

const INDEX_TTL_MS = 5 * 60 * 1000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

let cachedIndex = null;
let cachedAt = 0;

async function loadIndex(base) {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < INDEX_TTL_MS) return cachedIndex;
  try {
    const response = await fetch(`${base}/subs.json`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    });
    if (response.ok) {
      cachedIndex = await response.json();
      cachedAt = now;
    }
  } catch (error) {
    // Keep serving the previous copy rather than going dark.
  }
  return cachedIndex || { videos: {} };
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
    // keep the raw value
  }
  return { type: segments[1], id };
}

export default {
  async fetch(request, env) {
    const base = ((env && env.SITE) || SITE).replace(/\/+$/, '');
    const url = new URL(request.url);
    const pathname = decodeURI(url.pathname);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (pathname === '/manifest.json') {
      const upstream = await fetch(`${base}/manifest.json`, {
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
      });
    }

    const subtitleRequest = parseSubtitleRequest(pathname);
    if (subtitleRequest) {
      const index = await loadIndex(base);
      const video = index.videos && index.videos[subtitleRequest.id];
      const subtitles = video
        ? video.subtitles.map((sub) => ({ id: sub.id, url: sub.url, lang: sub.lang }))
        : [];
      return json({ subtitles, cacheMaxAge: 300 });
    }

    if (pathname === '/' || pathname === '') {
      return Response.redirect(`${base}/`, 302);
    }

    // Anything else (posters, .vtt files) lives on the static site.
    return Response.redirect(`${base}${pathname}`, 302);
  },
};

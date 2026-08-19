// Vercel alternative to the Cloudflare Worker.
//
// If you deploy this repository to Vercel (Add New -> Project -> import the
// repo -> Deploy), vercel.json points every /subtitles/... request here, and
// this handler answers it no matter what videoHash/videoSize/filename Stremio
// appends to the URL.
//
// Install URL in Stremio: https://<your-project>.vercel.app/manifest.json

const INDEX_TTL_MS = 5 * 60 * 1000;

let cachedIndex = null;
let cachedAt = 0;

function originOf(request) {
  const proto = request.headers['x-forwarded-proto'] || 'https';
  const host = request.headers['x-forwarded-host'] || request.headers.host;
  return `${proto}://${host}`;
}

async function loadIndex(origin) {
  const now = Date.now();
  if (cachedIndex && now - cachedAt < INDEX_TTL_MS) return cachedIndex;
  try {
    const response = await fetch(`${origin}/subs.json`);
    if (response.ok) {
      cachedIndex = await response.json();
      cachedAt = now;
    }
  } catch (error) {
    // fall through and reuse whatever we had
  }
  return cachedIndex || { videos: {} };
}

function parseSubtitleRequest(pathname) {
  const segments = pathname.split('/').filter(Boolean);
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

export default async function handler(request, response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', '*');
  response.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  response.setHeader('content-type', 'application/json; charset=utf-8');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return;
  }

  const origin = originOf(request);
  const pathname = decodeURI(new URL(request.url, origin).pathname);
  const subtitleRequest = parseSubtitleRequest(pathname);

  if (!subtitleRequest) {
    response.status(404).end(JSON.stringify({ subtitles: [] }));
    return;
  }

  const index = await loadIndex(origin);
  const video = index.videos && index.videos[subtitleRequest.id];
  const subtitles = video
    ? video.subtitles.map((sub) => ({ id: sub.id, url: sub.url, lang: sub.lang }))
    : [];

  response.status(200).end(JSON.stringify({ subtitles, cacheMaxAge: 300 }));
}

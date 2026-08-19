// Turns a Stremio addon request path into an answer.
//
// Stremio asks for subtitles at either of these shapes:
//   /subtitles/movie/tt1375666.json
//   /subtitles/movie/tt1375666/videoHash=8e2...&videoSize=1234&filename=x.mkv.json
//   /subtitles/series/tt0903747:1:2/videoHash=...json      (colon sometimes %3A)
//
// The second shape is the normal one during playback, and it is exactly the one
// plain static hosting cannot serve — which is why this router exists.

export function parseSubtitleRequest(pathname) {
  const segments = pathname.split('/').filter((part) => part !== '');
  if (segments.length < 3) return null;
  if (segments[0] !== 'subtitles') return null;

  const type = segments[1];
  const rest = segments.slice(2);

  // The last segment always carries the .json suffix.
  const last = rest[rest.length - 1];
  if (!last.endsWith('.json')) return null;
  rest[rest.length - 1] = last.slice(0, -'.json'.length);

  const rawId = rest[0];
  const extra = rest.length > 1 ? rest.slice(1).join('/') : '';

  let id;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }

  return { type, id, extra };
}

export function subtitlesFor(index, type, id) {
  const video = index?.videos?.[id];
  if (!video) return [];
  if (video.type && type && video.type !== type) return [];
  return video.subtitles.map((sub) => ({
    id: sub.id,
    url: sub.url,
    lang: sub.lang,
  }));
}

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
};

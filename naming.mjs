// Works out what video a subtitle file belongs to, purely from its name.
//
// The goal is that you never have to edit a config file: name the file
// anything you like as long as the IMDb id is somewhere in it, or just use the
// movie title and let the build look it up.
//
// All of these work:
//   tt1375666.srt
//   tt1375666 Inception.srt
//   Inception (2010) tt1375666 [BluRay].srt
//   tt0903747-1-2.srt
//   tt0903747 S01E02.srt
//   Breaking Bad/tt0903747/S01E02.srt
//   Inception 2010.srt                  <- resolved online by title

const IMDB_ID = /tt(\d{7,10})/i;
const SEASON_EPISODE = /\bs(\d{1,3})[\s._-]*e(\d{1,4})\b/i;
const CROSS_FORM = /\b(\d{1,3})x(\d{1,4})\b/i;
const YEAR = /\b(19\d{2}|20\d{2})\b/;

// Right after the IMDb id: tt0903747-1-2, tt0903747:1:2, tt0903747.1.2
const TRAILING_NUMBERS = /^[\s._:-]*(\d{1,3})[\s._:-](\d{1,4})\b/;

const NOISE = new Set([
  'srt', 'vtt', 'sub', 'az', 'aze', 'azerbaijani', 'azerbaycan', 'azərbaycan',
  'altyazi', 'altyazı', 'subtitle', 'subtitles', 'movie', 'movies', 'series',
  'tv', 'show', 'shows', 'film', 'filmler',
]);

function tidy(value) {
  return value
    .replace(/[._]+/g, ' ')
    .replace(/[\s-]{2,}/g, ' ')
    .replace(/^[\s\-–—:,]+|[\s\-–—:,]+$/g, '')
    .trim();
}

/**
 * @param {string} relativePath path under subtitles/, e.g. "series/tt0903747 S01E02.srt"
 * @returns {{
 *   imdbId: string|null, season: number|null, episode: number|null,
 *   type: 'movie'|'series', label: string, title: string|null, year: number|null,
 *   typeHint: 'movie'|'series'|null
 * }}
 */
export function parseSubtitleName(relativePath) {
  const withoutExtension = relativePath.replace(/\.[a-z0-9]{2,4}$/i, '');
  const segments = withoutExtension.split('/').filter(Boolean);

  let typeHint = null;
  if (/^movies?$/i.test(segments[0] || '')) typeHint = 'movie';
  if (/^(series|tv|shows?)$/i.test(segments[0] || '')) typeHint = 'series';

  const searchable = segments.join(' / ');

  const idMatch = IMDB_ID.exec(searchable);
  const imdbId = idMatch ? `tt${idMatch[1]}` : null;

  let season = null;
  let episode = null;

  const se = SEASON_EPISODE.exec(searchable);
  if (se) {
    season = Number(se[1]);
    episode = Number(se[2]);
  }

  if (season === null) {
    const cross = CROSS_FORM.exec(searchable);
    if (cross) {
      season = Number(cross[1]);
      episode = Number(cross[2]);
    }
  }

  // Only trust bare "1-2" style numbers when they sit directly after the id,
  // so "tt1375666 - 1080p" is not mistaken for season 1 episode 080.
  if (season === null && idMatch) {
    const afterId = searchable.slice(idMatch.index + idMatch[0].length);
    const trailing = TRAILING_NUMBERS.exec(afterId);
    if (trailing) {
      season = Number(trailing[1]);
      episode = Number(trailing[2]);
    }
  }

  const isSeries = season !== null && episode !== null;
  const type = isSeries ? 'series' : (typeHint === 'series' ? 'series' : 'movie');

  // Whatever is left of the name becomes the human-readable label and, when
  // there is no IMDb id, the title we look up online.
  let remainder = searchable;
  if (idMatch) remainder = remainder.replace(idMatch[0], ' ');
  if (se) remainder = remainder.replace(se[0], ' ');
  const cross = CROSS_FORM.exec(remainder);
  if (season !== null && cross) remainder = remainder.replace(cross[0], ' ');
  if (season !== null && !se && !cross) {
    remainder = remainder.replace(TRAILING_NUMBERS, ' ');
  }
  if (typeHint) remainder = remainder.replace(/^[^/]*\//, ' ');
  remainder = remainder.replace(/\//g, ' ');

  const yearMatch = YEAR.exec(remainder);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  const bracket = /[[(]([^\])]+)[\])]/.exec(remainder);
  const bracketLabel = bracket ? tidy(bracket[1]) : '';

  const words = tidy(remainder.replace(/[[(][^\])]*[\])]/g, ' '))
    .split(/\s+/)
    .filter((word) => word && !NOISE.has(word.toLowerCase()));

  const titleWords = words.filter((word) => !YEAR.test(word));
  const title = titleWords.length ? titleWords.join(' ') : null;

  // Text in [brackets] is treated as the release label ("BluRay", "WEB-DL");
  // otherwise the leftover words act as the label so two files for the same
  // film can still be told apart in Stremio's subtitle menu.
  const label = bracketLabel || tidy(words.join(' '));

  return {
    imdbId,
    season,
    episode,
    type,
    typeHint,
    label,
    title,
    year,
  };
}

/** Stremio's video id: tt1375666 for a film, tt0903747:1:2 for an episode. */
export function toVideoId({ imdbId, season, episode }) {
  if (!imdbId) return null;
  if (season !== null && episode !== null) return `${imdbId}:${season}:${episode}`;
  return imdbId;
}

export const __test__ = { tidy };

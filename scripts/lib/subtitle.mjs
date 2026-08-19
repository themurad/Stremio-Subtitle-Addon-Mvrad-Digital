// Parses SRT / WebVTT / MicroDVD text into cues and re-emits clean WebVTT.
//
// Stremio plays WebVTT natively, so shipping already-valid UTF-8 WebVTT means
// the player never has to guess an encoding or repair a format. That is what
// makes the subtitles "just work".

const TIME = String.raw`(\d{1,3}):(\d{1,2}):(\d{1,2})[.,](\d{1,3})`;
const TIME_SHORT = String.raw`(\d{1,2}):(\d{1,2})[.,](\d{1,3})`;

const CUE_LINE = new RegExp(
  String.raw`^\s*(?:${TIME}|${TIME_SHORT})\s*-->\s*(?:${TIME}|${TIME_SHORT})\s*(.*)$`,
);

const MICRODVD_LINE = /^\{(\d+)\}\{(\d+)\}(.*)$/;

function toSeconds(h, m, s, ms) {
  const millis = Number(String(ms).padEnd(3, '0'));
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + millis / 1000;
}

// The cue regex has two alternatives per timestamp (h:m:s.ms and m:s.ms), so a
// match yields 4 groups for the long form or 3 for the short form.
function readTimestampGroups(groups) {
  if (groups[0] !== undefined) {
    return { seconds: toSeconds(groups[0], groups[1], groups[2], groups[3]), used: 4 };
  }
  return { seconds: toSeconds(0, groups[4], groups[5], groups[6]), used: 7 };
}

function formatTimestamp(totalSeconds) {
  const clamped = Math.max(0, totalSeconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  const pad = (n, width = 2) => String(n).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

function cleanText(raw, options) {
  let text = raw;

  if (options.stripAssTags) {
    // {\an8}, {\pos(...)}, {\i1} and friends: SSA overrides that leak into SRT.
    text = text.replace(/\{\\[^}]*\}/g, '');
  }
  if (options.stripFontTags) {
    // <font color="#ffffff"> is not valid WebVTT and some players show it raw.
    text = text.replace(/<\/?font[^>]*>/gi, '');
  }

  // WebVTT treats a bare "-->" inside cue text as a parse error.
  text = text.replace(/-->/g, '- - >');

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();
}

const PROMO = /(opensubtitles|subscene|addic7ed|yifysubtitles|www\.|https?:\/\/|reklam|çeviri:|tərcümə:)/i;

function isPromoCue(text) {
  const stripped = text.replace(/<[^>]*>/g, '').trim();
  if (!stripped) return true;
  if (!PROMO.test(stripped)) return false;
  // Only drop it when the promo is basically the whole cue.
  return stripped.split(/\s+/).length <= 12;
}

function parseMicroDvd(text, fps) {
  const cues = [];
  let effectiveFps = fps;

  for (const line of text.split('\n')) {
    const match = MICRODVD_LINE.exec(line.trim());
    if (!match) continue;
    const [, startFrame, endFrame, body] = match;

    // {1}{1}23.976 declares the frame rate in the first cue.
    if (startFrame === '1' && endFrame === '1' && /^[\d.]+$/.test(body.trim())) {
      const declared = Number(body.trim());
      if (declared > 1 && declared < 200) effectiveFps = declared;
      continue;
    }

    cues.push({
      start: Number(startFrame) / effectiveFps,
      end: Number(endFrame) / effectiveFps,
      text: body
        .replace(/\{[^}]*\}/g, '')
        .split('|')
        .join('\n'),
    });
  }
  return cues;
}

function parseTimed(text) {
  const lines = text.split('\n');
  const cues = [];
  let index = 0;

  while (index < lines.length) {
    const match = CUE_LINE.exec(lines[index]);
    if (!match) {
      index += 1;
      continue;
    }

    const groups = match.slice(1);
    const start = readTimestampGroups(groups);
    const end = readTimestampGroups(groups.slice(start.used));

    const body = [];
    index += 1;
    while (index < lines.length && lines[index].trim() !== '') {
      // A stray cue number on its own line before the next timestamp.
      if (CUE_LINE.test(lines[index])) break;
      if (/^\d+$/.test(lines[index].trim()) && index + 1 < lines.length && CUE_LINE.test(lines[index + 1])) break;
      body.push(lines[index]);
      index += 1;
    }

    cues.push({ start: start.seconds, end: end.seconds, text: body.join('\n') });
  }

  return cues;
}

/**
 * @param {string} text decoded subtitle text (any of SRT / VTT / MicroDVD)
 * @param {{stripFontTags?:boolean, stripAssTags?:boolean, removePromoCues?:boolean, microDvdFps?:number}} options
 * @returns {{ vtt: string, cueCount: number, format: string, warnings: string[] }}
 */
export function toWebVtt(text, options = {}) {
  const settings = {
    stripFontTags: true,
    stripAssTags: true,
    removePromoCues: false,
    microDvdFps: 23.976,
    ...options,
  };
  const warnings = [];

  const isMicroDvd = /^\s*\{\d+\}\{\d+\}/m.test(text);
  const format = isMicroDvd ? 'microdvd' : /^\s*WEBVTT/.test(text) ? 'vtt' : 'srt';

  let cues = isMicroDvd
    ? parseMicroDvd(text, settings.microDvdFps)
    : parseTimed(text);

  cues = cues
    .map((cue) => ({ ...cue, text: cleanText(cue.text, settings) }))
    .filter((cue) => cue.text.length > 0)
    .filter((cue) => !(settings.removePromoCues && isPromoCue(cue.text)));

  // Guard against files whose cues are out of order or have zero length.
  cues.sort((a, b) => a.start - b.start);
  let fixedTimings = 0;
  for (const cue of cues) {
    if (!(cue.end > cue.start)) {
      cue.end = cue.start + 1.5;
      fixedTimings += 1;
    }
  }
  if (fixedTimings > 0) {
    warnings.push(`${fixedTimings} cue(s) had a zero or negative duration and were given 1.5s`);
  }

  const body = cues
    .map((cue, i) => `${i + 1}\n${formatTimestamp(cue.start)} --> ${formatTimestamp(cue.end)}\n${cue.text}`)
    .join('\n\n');

  return {
    vtt: `WEBVTT\n\n${body}\n`,
    cueCount: cues.length,
    format,
    warnings,
  };
}

export const __test__ = { parseTimed, parseMicroDvd, formatTimestamp, cleanText };

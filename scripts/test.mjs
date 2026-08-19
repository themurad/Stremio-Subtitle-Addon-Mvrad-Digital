// Self-check for the subtitle pipeline. Runs in CI before every publish.
//
//   npm test
//
// No network, no dependencies. Test files are generated in memory in the
// awkward encodings Azerbaijani subtitles actually arrive in.

import { decodeSubtitle } from './lib/decode.mjs';
import { toWebVtt } from './lib/subtitle.mjs';
import { parseSubtitleName, toVideoId } from './lib/naming.mjs';
import { parseSubtitleRequest, subtitlesFor } from './lib/router.mjs';

let passed = 0;
const failures = [];

function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    passed += 1;
  } else {
    failures.push(`${name}\n    expected: ${b}\n    actual:   ${a}`);
  }
}

function ok(name, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

// Build an exact reverse table for a single-byte codepage so the tests encode
// text the same way a Windows text editor would.
function singleByteEncoder(encoding) {
  const decoder = new TextDecoder(encoding);
  const map = new Map();
  for (let byte = 0; byte < 256; byte++) {
    const char = decoder.decode(Uint8Array.of(byte));
    if (!map.has(char)) map.set(char, byte);
  }
  return (text) => Uint8Array.from([...text].map((char) => {
    if (!map.has(char)) throw new Error(`${encoding} cannot represent "${char}"`);
    return map.get(char);
  }));
}

const cp1254 = singleByteEncoder('windows-1254');
const latin1 = singleByteEncoder('windows-1252');

const SRT_BODY = (line) => `1
00:00:01,000 --> 00:00:03,500
${line}

2
00:00:04,000 --> 00:00:06,000
İkinci sətir
`;

// ---------------------------------------------------------------------------
// Encoding detection and repair
// ---------------------------------------------------------------------------
{
  const line = 'Işıq söndü, qapı bağlandı';
  const bytes = cp1254(SRT_BODY(line).replace('İkinci sətir', 'Ikinci setir'));
  const result = decodeSubtitle(bytes);
  ok('windows-1254 is detected', /1254|8859-9/.test(result.encoding), `got ${result.encoding}`);
  ok('windows-1254 letters survive', result.text.includes(line), result.text.slice(0, 80));
}

{
  const text = SRT_BODY('Ən gözəl şəkil, əlbəttə');
  const result = decodeSubtitle(Buffer.from(text, 'utf8'));
  check('utf-8 is passed through', result.encoding, 'utf-8');
  ok('the schwa survives utf-8', result.text.includes('Ən gözəl şəkil, əlbəttə'));
}

{
  // The classic "Ã¼" damage: a UTF-8 file was read through a latin-1 editor and
  // then saved again as UTF-8, so every accented letter is now two characters.
  const original = 'Ən gözəl şəkil';
  const damaged = new TextDecoder('windows-1252').decode(Buffer.from(original, 'utf8'));
  const result = decodeSubtitle(Buffer.from(damaged, 'utf8'));
  ok('double-encoded utf-8 is repaired', result.text.includes(original), result.text);
  ok('the repair is reported', result.repaired.some((note) => note.includes('double-encoded')), JSON.stringify(result.repaired));
}

{
  // windows-1254 read as latin-1: s-cedilla/dotless-i/g-breve become thorn/y-acute/eth.
  const result = decodeSubtitle(latin1('Iþýq baðlandý'));
  ok('latin-1 over Turkish is repaired', result.text.includes('Işıq bağlandı'), result.text);
}

{
  const text = 'Salam, Ә hərfi';
  const result = decodeSubtitle(Buffer.from(text, 'utf8'));
  ok('Cyrillic schwa becomes Latin schwa', result.text.includes('Ə hərfi'), result.text);
}

{
  const text = SRT_BODY('Ən gözəl şəkil');
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const result = decodeSubtitle(utf16);
  ok('utf-16 with BOM is decoded', result.text.includes('Ən gözəl şəkil'), result.encoding);
}

{
  const result = decodeSubtitle(Buffer.from(`﻿${SRT_BODY('Ən gözəl')}`, 'utf8'));
  ok('the utf-8 BOM is stripped', !result.text.startsWith('﻿'));
}

// ---------------------------------------------------------------------------
// SRT / MicroDVD -> WebVTT
// ---------------------------------------------------------------------------
{
  const { vtt, cueCount, format } = toWebVtt(SRT_BODY('Ən gözəl şəkil'));
  check('srt is recognised', format, 'srt');
  check('both cues are kept', cueCount, 2);
  ok('the file starts with WEBVTT', vtt.startsWith('WEBVTT\n\n'));
  ok('commas become dots in timings', vtt.includes('00:00:01.000 --> 00:00:03.500'), vtt.slice(0, 120));
  ok('the text is carried over', vtt.includes('Ən gözəl şəkil'));
}

{
  const microDvd = '{1}{1}23.976\n{100}{200}Birinci sətir|İkinci sətir\n{300}{400}Son\n';
  const { vtt, cueCount, format } = toWebVtt(microDvd);
  check('microdvd is recognised', format, 'microdvd');
  check('microdvd cue count', cueCount, 2);
  ok('the pipe becomes a line break', vtt.includes('Birinci sətir\nİkinci sətir'), vtt);
  ok('frames become seconds', vtt.includes('00:00:04.171'), vtt.slice(0, 200));
}

{
  const alreadyVtt = 'WEBVTT\n\n1\n00:00:02.000 --> 00:00:04.000\nSalam\n';
  const { format, cueCount } = toWebVtt(alreadyVtt);
  check('vtt input is recognised', format, 'vtt');
  check('vtt cue survives', cueCount, 1);
}

{
  const messy = '1\n00:00:01,000 --> 00:00:03,000\n{\\an8}<font color="#ffcc00">Yuxarıda</font>\n';
  const { vtt } = toWebVtt(messy, { stripAssTags: true, stripFontTags: true });
  ok('ass override tags are stripped', !vtt.includes('{\\an8}'), vtt);
  ok('font tags are stripped', !vtt.includes('<font'), vtt);
  ok('the words survive the strip', vtt.includes('Yuxarıda'));
}

{
  const backwards = '1\n00:00:05,000 --> 00:00:05,000\nSıfır uzunluq\n';
  const { vtt } = toWebVtt(backwards);
  ok('zero-length cues get a duration', vtt.includes('00:00:05.000 --> 00:00:06.500'), vtt);
}

// ---------------------------------------------------------------------------
// File naming
// ---------------------------------------------------------------------------
const nameCases = [
  ['tt1375666.srt', 'movie', 'tt1375666'],
  ['tt1375666 Inception.srt', 'movie', 'tt1375666'],
  ['Inception (2010) tt1375666 [BluRay].srt', 'movie', 'tt1375666'],
  ['movies/tt1375666 - 1080p - x264.srt', 'movie', 'tt1375666'],
  ['tt0903747 S01E02.srt', 'series', 'tt0903747:1:2'],
  ['tt0903747-1-2.srt', 'series', 'tt0903747:1:2'],
  ['tt0903747.1.2.srt', 'series', 'tt0903747:1:2'],
  ['series/Breaking Bad/tt0903747/S02E05.srt', 'series', 'tt0903747:2:5'],
  ['tt0903747 1x03.srt', 'series', 'tt0903747:1:3'],
];
for (const [file, expectedType, expectedId] of nameCases) {
  const info = parseSubtitleName(file);
  check(`naming: ${file} -> type`, info.type, expectedType);
  check(`naming: ${file} -> id`, toVideoId(info), expectedId);
}

{
  const info = parseSubtitleName('Inception 2010.srt');
  check('a title-only file exposes its title', info.title, 'Inception');
  check('a title-only file exposes its year', info.year, 2010);
  check('a title-only file has no id yet', info.imdbId, null);
}

{
  const bluray = parseSubtitleName('tt1375666 [BluRay].srt');
  const web = parseSubtitleName('tt1375666 [WEB-DL].srt');
  check('bracket label 1', bluray.label, 'BluRay');
  check('bracket label 2', web.label, 'WEB-DL');
}

// ---------------------------------------------------------------------------
// Request routing - the shapes Stremio actually sends
// ---------------------------------------------------------------------------
const routeCases = [
  ['/subtitles/movie/tt1375666.json', 'movie', 'tt1375666'],
  ['/subtitles/movie/tt1375666/videoHash=8e2b1f&videoSize=1471263&filename=x.mkv.json', 'movie', 'tt1375666'],
  ['/subtitles/series/tt0903747:1:2.json', 'series', 'tt0903747:1:2'],
  ['/subtitles/series/tt0903747%3A1%3A2.json', 'series', 'tt0903747:1:2'],
  ['/subtitles/series/tt0903747%3A1%3A2/videoHash=abc&videoSize=1.json', 'series', 'tt0903747:1:2'],
  ['/subtitles/movie/tt1375666/filename=Inception.2010.BluRay.mkv.json', 'movie', 'tt1375666'],
];
for (const [path, expectedType, expectedId] of routeCases) {
  const parsed = parseSubtitleRequest(path);
  ok(`routing: ${path}`, parsed !== null, 'did not parse at all');
  if (parsed) {
    check(`routing type: ${path}`, parsed.type, expectedType);
    check(`routing id: ${path}`, parsed.id, expectedId);
  }
}

check('a non-addon path is ignored', parseSubtitleRequest('/index.html'), null);
check('a stream path is ignored', parseSubtitleRequest('/stream/movie/tt1.json'), null);

{
  const index = {
    videos: {
      'tt1375666': { type: 'movie', subtitles: [{ id: 'az-1', url: 'https://x/a.vtt', lang: 'aze' }] },
    },
  };
  check('a known film resolves', subtitlesFor(index, 'movie', 'tt1375666').length, 1);
  check('an unknown film returns nothing', subtitlesFor(index, 'movie', 'tt9999999'), []);
  check('the wrong type returns nothing', subtitlesFor(index, 'series', 'tt1375666'), []);
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} check(s) passed`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}
console.log('Subtitle pipeline looks healthy.\n');

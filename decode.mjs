// Turns a subtitle file of unknown encoding into clean UTF-8 text.
//
// Azerbaijani subtitles in the wild are a mess: some are UTF-8, many come from
// Turkish sites as windows-1254, some are windows-1251 (Cyrillic Azerbaijani),
// and plenty have been saved twice through the wrong codepage so the letters
// e-schwa, g-breve, dotless-i, o/u-umlaut, s/c-cedilla arrive as garbage.
// This module fixes all of those.

const AZ_LETTERS = 'əƏğĞıIİiöÖşŞüÜçÇ';

// Characters that should basically never appear in a real subtitle. Their
// presence is the strongest signal that we picked the wrong codepage.
// C0 controls (minus tab/LF/CR), DEL, C1 controls, and U+FFFD.
const JUNK_SOURCE = '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\uFFFD]';
const JUNK_GLOBAL = new RegExp(JUNK_SOURCE, 'g');
const JUNK_ONE = new RegExp(JUNK_SOURCE);

// Classic damage: a windows-1254 / ISO-8859-9 file read as latin-1.
// Latin-1 renders s-cedilla, dotless-i and g-breve as thorn / y-acute / eth.
const LATIN1_OVER_TURKISH = {
  'þ': 'ş', // thorn      -> s-cedilla
  'Þ': 'Ş',
  'ý': 'ı', // y-acute    -> dotless i
  'Ý': 'İ', // Y-acute    -> dotted I
  'ð': 'ğ', // eth        -> g-breve
  'Ð': 'Ğ',
};

// Cyrillic look-alikes that show up when an Azerbaijani file has been through
// a Russian codepage, plus stand-ins people type by hand for the schwa.
const LOOKALIKES = {
  'ә': 'ə', // Cyrillic schwa -> Latin schwa
  'Ә': 'Ə',
  'ҹ': 'c',
  'Ҹ': 'C',
  'ғ': 'ğ',
  'Ғ': 'Ğ',
  'һ': 'h',
  'Һ': 'H',
  'ө': 'ö',
  'Ө': 'Ö',
  'ү': 'ü',
  'Ү': 'Ü',
  'ǝ': 'ə', // turned e, sometimes used as a schwa stand-in
};

const CANDIDATES = [
  'windows-1254', // Turkish / Azerbaijani Latin - by far the most common
  'iso-8859-9',
  'windows-1251', // Cyrillic Azerbaijani / Russian
  'windows-1250', // Central European
  'windows-1252', // Western European
];

const CYRILLIC_ONE = /[Ѐ-ӿ]/;
const PLAIN_LATIN = /[a-zA-Z]/;
const ORDINARY = /[ \n\r\t.,!?:;'"()\[\]\-–—0-9]/;

// A UTF-8 byte pair seen through a single-byte codepage: the lead byte lands in
// the C0-DF range and the continuation byte lands in 80-BF (or whatever the
// codepage maps those to).
const MOJIBAKE_PAIR = new RegExp(
  '[\\u00C2-\\u00C5\\u00D0-\\u00D1]' +
  '[\\u0080-\\u00BF\\u0152-\\u017E\\u2013-\\u2122]',
  'g',
);

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function detectBom(buf) {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { encoding: 'utf-8', offset: 3 };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { encoding: 'utf-16le', offset: 2 };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { encoding: 'utf-16be', offset: 2 };
  }
  return null;
}

// UTF-16 without a BOM is still common on Windows. Lots of alternating zero
// bytes is the giveaway.
function looksLikeUtf16(buf) {
  const n = Math.min(buf.length, 4096);
  if (n < 16) return null;
  let evenZero = 0;
  let oddZero = 0;
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) {
      if (i % 2 === 0) evenZero++;
      else oddZero++;
    }
  }
  const half = n / 2;
  if (oddZero > half * 0.3 && evenZero < half * 0.05) return 'utf-16le';
  if (evenZero > half * 0.3 && oddZero < half * 0.05) return 'utf-16be';
  return null;
}

function tryDecode(buf, encoding, { fatal = false } = {}) {
  try {
    return new TextDecoder(encoding, { fatal }).decode(buf);
  } catch {
    return null;
  }
}

// Higher is better. Rewards Azerbaijani letters and ordinary text, punishes
// control characters, replacement characters and stray symbols.
function score(text) {
  if (!text) return -Infinity;
  const sample = text.slice(0, 20000);
  let points = 0;

  for (const ch of sample) {
    if (AZ_LETTERS.includes(ch)) points += 6;
    else if (PLAIN_LATIN.test(ch)) points += 1;
    else if (ORDINARY.test(ch)) points += 0.5;
    else if (CYRILLIC_ONE.test(ch)) points += 0.4; // Cyrillic is plausible
    else if (JUNK_ONE.test(ch)) points -= 40;
    else points -= 2;
  }

  MOJIBAKE_PAIR.lastIndex = 0;
  const mojibake = (sample.match(MOJIBAKE_PAIR) || []).length;
  points -= mojibake * 25;

  return points / Math.max(sample.length, 1);
}

// Exact character -> byte tables for the codepages a file may have been read
// through. Built by decoding every byte, so they are always correct.
const reverseTables = new Map();
function reverseTable(encoding) {
  if (!reverseTables.has(encoding)) {
    const decoder = new TextDecoder(encoding);
    const map = new Map();
    for (let byte = 0; byte < 256; byte++) {
      const char = decoder.decode(Uint8Array.of(byte));
      if (!map.has(char)) map.set(char, byte);
    }
    reverseTables.set(encoding, map);
  }
  return reverseTables.get(encoding);
}

// A UTF-8 file that was decoded as if it were single-byte and saved again, so
// every accented letter is now two characters ("Ã¼" instead of "ü"). Re-encode
// through the codepage that did the damage, then decode as UTF-8 properly.
function repairDoubleEncoded(text) {
  MOJIBAKE_PAIR.lastIndex = 0;
  const damaged = MOJIBAKE_PAIR.test(text);
  MOJIBAKE_PAIR.lastIndex = 0;
  if (!damaged) return text;

  let best = text;
  let bestScore = score(text);

  for (const encoding of ['windows-1252', 'windows-1254']) {
    const table = reverseTable(encoding);
    const bytes = new Uint8Array(text.length);
    let usable = true;
    for (let i = 0; i < text.length; i++) {
      const byte = table.get(text[i]);
      if (byte === undefined) { usable = false; break; }
      bytes[i] = byte;
    }
    if (!usable) continue;

    let fixed;
    try {
      fixed = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      continue;
    }
    const value = score(fixed);
    if (value > bestScore) {
      best = fixed;
      bestScore = value;
    }
  }

  return best;
}

function applyMap(text, map) {
  let out = text;
  for (const [from, to] of Object.entries(map)) {
    out = out.split(from).join(to);
  }
  return out;
}

// Only swap thorn / y-acute / eth when the file looks Turkish or Azerbaijani
// rather than, say, Icelandic.
function repairLatin1OverTurkish(text) {
  const hits = (text.match(/[þÞýÝðÐ]/g) || []).length;
  if (hits === 0) return text;
  if (!PLAIN_LATIN.test(text)) return text;
  const candidate = applyMap(text, LATIN1_OVER_TURKISH);
  return score(candidate) >= score(text) ? candidate : text;
}

function finish(rawText, encoding, repaired) {
  let text = rawText;

  const afterDouble = repairDoubleEncoded(text);
  if (afterDouble !== text) {
    repaired.push('re-decoded double-encoded UTF-8');
    text = afterDouble;
  }

  const afterLatin = repairLatin1OverTurkish(text);
  if (afterLatin !== text) {
    repaired.push('latin-1 over Turkish codepage (thorn/y-acute/eth restored)');
    text = afterLatin;
  }

  const afterLookalikes = applyMap(text, LOOKALIKES);
  if (afterLookalikes !== text) {
    repaired.push('Cyrillic look-alike letters mapped to Azerbaijani Latin');
    text = afterLookalikes;
  }

  // Normalise line endings, then drop any leftover control junk.
  text = text.replace(/\r\n?/g, '\n').replace(JUNK_GLOBAL, '');

  return { text, encoding, repaired };
}

/**
 * Decode a subtitle file of unknown encoding.
 * @param {Buffer|Uint8Array} buffer raw bytes
 * @returns {{ text: string, encoding: string, repaired: string[] }}
 */
export function decodeSubtitle(buffer) {
  const buf = Uint8Array.from(buffer);
  const repaired = [];

  // 1. An explicit BOM is the truth, no guessing needed.
  const bom = detectBom(buf);
  if (bom) {
    const text = stripBom(tryDecode(buf.subarray(bom.offset), bom.encoding) || '');
    return finish(text, `${bom.encoding} (BOM)`, repaired);
  }

  // 2. BOM-less UTF-16.
  const utf16 = looksLikeUtf16(buf);
  if (utf16) {
    return finish(stripBom(tryDecode(buf, utf16) || ''), utf16, repaired);
  }

  // 3. Valid UTF-8 is almost certainly actually UTF-8.
  const strictUtf8 = tryDecode(buf, 'utf-8', { fatal: true });
  if (strictUtf8 !== null) {
    return finish(stripBom(strictUtf8), 'utf-8', repaired);
  }

  // 4. Otherwise score every plausible legacy codepage and take the winner.
  let best = null;
  for (const encoding of CANDIDATES) {
    const text = tryDecode(buf, encoding);
    if (text === null) continue;
    const value = score(text);
    if (!best || value > best.value) best = { encoding, text, value };
  }

  if (!best) {
    return finish(tryDecode(buf, 'utf-8') || '', 'utf-8 (lossy fallback)', repaired);
  }
  return finish(stripBom(best.text), best.encoding, repaired);
}

export const __test__ = { score, repairLatin1OverTurkish, repairDoubleEncoded };

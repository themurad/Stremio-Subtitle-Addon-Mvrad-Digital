// Runs the real Worker against the real dist/ output, without deploying.
//
//   npm run verify
//
// It fakes Cloudflare's ASSETS binding with the local dist/ folder and then
// asks for exactly the URLs Stremio asks for during playback, including the
// videoHash/videoSize/filename form that static hosting cannot answer.
//
// The important assertion is that every subtitle URL is absolute, points at
// the host that made the request, and actually resolves to a file.

import { readFile, stat } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

import worker from '../worker/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const ORIGIN = 'https://addon.example.workers.dev';

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  // Deliberately bare, with no charset — this is the worst case a static asset
  // server can hand back, and the Worker has to correct it.
  '.vtt': 'text/vtt',
};

// Stand-in for Cloudflare's static asset server.
const ASSETS = {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const file = join(DIST, path === '/' ? 'index.html' : decodeURIComponent(path).replace(/^\/+/, ''));
    if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    try {
      await stat(file);
      return new Response(await readFile(file), {
        status: 200,
        headers: { 'content-type': MIME[extname(file)] || 'application/octet-stream' },
      });
    } catch {
      return new Response('not found', { status: 404 });
    }
  },
};

const env = { ASSETS };
const failures = [];
let passed = 0;

function ok(name, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

async function get(path) {
  return worker.fetch(new Request(`${ORIGIN}${path}`), env);
}

// --- the manifest ----------------------------------------------------------
{
  const response = await get('/manifest.json');
  ok('manifest responds 200', response.status === 200, `got ${response.status}`);
  ok('manifest allows cross-origin', response.headers.get('access-control-allow-origin') === '*');
  const manifest = await response.json();
  ok('manifest declares the subtitles resource',
    manifest.resources?.some((resource) => (resource.name || resource) === 'subtitles'),
    JSON.stringify(manifest.resources));
  ok('manifest covers movies and series',
    ['movie', 'series'].every((type) => manifest.types?.includes(type)),
    JSON.stringify(manifest.types));
}

// --- every video in the index, through the URL Stremio really sends --------
const index = JSON.parse(await readFile(join(DIST, 'subs.json'), 'utf8'));
const videoIds = Object.keys(index.videos || {});
ok('the index contains at least one video', videoIds.length > 0, `found ${videoIds.length}`);

for (const videoId of videoIds) {
  const video = index.videos[videoId];
  const extra = 'videoHash=8e2b1f4a9c&videoSize=1471262962&filename=Film.2024.1080p.mkv';
  const paths = [
    `/subtitles/${video.type}/${encodeURIComponent(videoId)}.json`,
    `/subtitles/${video.type}/${encodeURIComponent(videoId)}/${extra}.json`,
    `/subtitles/${video.type}/${videoId}/${extra}.json`,
  ];

  for (const path of paths) {
    const response = await get(path);
    ok(`200 for ${path}`, response.status === 200, `got ${response.status}`);
    ok(`CORS on ${path}`, response.headers.get('access-control-allow-origin') === '*');

    const body = await response.json();
    ok(`${videoId} returns a subtitle`, body.subtitles?.length > 0, JSON.stringify(body));

    // Two entries per subtitle: one routed through Stremio's own streaming
    // server so Android stops guessing the encoding, and one direct for
    // players that cannot reach that server.
    const viaServer = (body.subtitles || []).filter((s) => s.url.includes('127.0.0.1:11470'));
    const directOnes = (body.subtitles || []).filter((s) => !s.url.includes('127.0.0.1:11470'));
    ok(`${videoId} offers a server-routed entry`, viaServer.length > 0);
    ok(`${videoId} offers a direct fallback`, directOnes.length > 0);
    ok(`${videoId} has exactly one direct browser fallback`,
      directOnes.length === 1, JSON.stringify(directOnes.map((s) => s.lang)));
    ok(`${videoId} routed entries carry a usable language name`,
      viaServer.every((s) => typeof s.lang === 'string' && s.lang.length > 0),
      JSON.stringify(viaServer.map((s) => s.lang)));
    ok(`${videoId} routed entries are distinguishable from each other`,
      new Set(viaServer.map((s) => s.lang)).size === viaServer.length,
      JSON.stringify(viaServer.map((s) => s.lang)));
    ok(`${videoId} every entry has a unique id`,
      new Set(body.subtitles.map((s) => s.id)).size === body.subtitles.length,
      JSON.stringify(body.subtitles.map((s) => s.id)));

    for (const subtitle of body.subtitles || []) {
      // Unwrap the proxy so both kinds are checked against the real file.
      const target = subtitle.url.includes('127.0.0.1:11470')
        ? decodeURIComponent(subtitle.url.split('?from=')[1] || '')
        : subtitle.url;

      ok(`${videoId} url resolves to an absolute address on this host`,
        target.startsWith(`${ORIGIN}/`),
        `${subtitle.url} -> ${target}`);

      const fileResponse = await get(new URL(target).pathname);
      ok(`${videoId} subtitle file exists`, fileResponse.status === 200, `${subtitle.url} -> ${fileResponse.status}`);

      // Android was decoding subtitles with a legacy codepage because nothing
      // told it otherwise. Both of these must hold: the header names the
      // encoding, and the bytes announce it too.
      const contentType = fileResponse.headers.get('content-type') || '';
      ok(`${videoId} subtitle declares utf-8 in its content-type`,
        /charset=utf-8/i.test(contentType), contentType);

      // Check the bytes, not the decoded string: Response.text() silently
      // swallows a leading BOM, so a string check would always look like the
      // BOM was missing even when it is there.
      const bytes = new Uint8Array(await fileResponse.clone().arrayBuffer());
      ok(`${videoId} subtitle starts with a UTF-8 BOM`,
        bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
        `first bytes ${[...bytes.slice(0, 3)].map((b) => b.toString(16)).join(' ')}`);

      const text = await fileResponse.text();
      ok(`${videoId} subtitle is WebVTT`,
        text.replace(/^﻿/, '').startsWith('WEBVTT'), text.slice(0, 40));
      ok(`${videoId} subtitle has no replacement characters`, !text.includes('�'));
    }
  }
}

// --- a film we do not have -------------------------------------------------
{
  const response = await get('/subtitles/movie/tt0000001/videoHash=zz.json');
  ok('an unknown film answers 200, not an error', response.status === 200, `got ${response.status}`);
  const body = await response.json();
  ok('an unknown film returns an empty list', Array.isArray(body.subtitles) && body.subtitles.length === 0);
}

// --- the web page ----------------------------------------------------------
{
  const response = await get('/');
  ok('the web page loads', response.status === 200, `got ${response.status}`);
}

console.log(`\n${passed} check(s) passed against dist/`);
if (failures.length) {
  console.error(`\n${failures.length} FAILED:\n`);
  for (const failure of failures) console.error(`  - ${failure}\n`);
  process.exit(1);
}
console.log('The deployed addon will answer every request shape Stremio sends.\n');

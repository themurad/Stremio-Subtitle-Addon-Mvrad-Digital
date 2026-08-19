// Local preview. Serves dist/ with the same routing the Cloudflare Worker uses,
// so what you test here is what Stremio gets in production.
//
//   npm start          build + serve on http://127.0.0.1:8080
//
// Then in Stremio: Addons -> paste http://127.0.0.1:8080/manifest.json

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSubtitleRequest, subtitlesFor, CORS_HEADERS } from './lib/router.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

async function readIndex() {
  try {
    return JSON.parse(await readFile(join(DIST, 'subs.json'), 'utf8'));
  } catch {
    return { videos: {} };
  }
}

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { ...CORS_HEADERS, 'content-type': type });
  response.end(body);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURI(url.pathname);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, CORS_HEADERS);
    response.end();
    return;
  }

  const subtitleRequest = parseSubtitleRequest(pathname);
  if (subtitleRequest) {
    const index = await readIndex();
    const subtitles = subtitlesFor(index, subtitleRequest.type, subtitleRequest.id);
    send(response, 200, JSON.stringify({ subtitles, cacheMaxAge: 60 }));
    return;
  }

  const target = join(DIST, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  if (!target.startsWith(DIST)) {
    send(response, 403, JSON.stringify({ error: 'forbidden' }));
    return;
  }

  try {
    const info = await stat(target);
    const file = info.isDirectory() ? join(target, 'index.html') : target;
    const body = await readFile(file);
    send(response, 200, body, MIME[extname(file)] || 'application/octet-stream');
  } catch {
    send(response, 404, JSON.stringify({ error: 'not found', path: pathname }));
  }
});

server.listen(PORT, () => {
  console.log(`\n  Addon running:  http://127.0.0.1:${PORT}/manifest.json`);
  console.log(`  Web page:       http://127.0.0.1:${PORT}/\n`);
  console.log('  In Stremio go to Addons and paste the first URL.\n');
});

// Builds the addon from whatever is sitting in subtitles/.
//
//   node scripts/build.mjs
//
// Output goes to dist/ and is what gets published to GitHub Pages.

import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeSubtitle } from './lib/decode.mjs';
import { toWebVtt } from './lib/subtitle.mjs';
import { parseSubtitleName, toVideoId } from './lib/naming.mjs';
import { MetadataCache } from './lib/cinemeta.mjs';
import { renderIndexPage } from './lib/page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'subtitles');
const OUT_DIR = join(ROOT, 'dist');
const CACHE_FILE = join(ROOT, '.cache', 'cinemeta.json');

const SUBTITLE_EXTENSIONS = /\.(srt|vtt|sub|txt)$/i;

// Returns null when the addon's public address is not known at build time —
// which is the normal case on Cloudflare, where the Worker serves the files
// itself and resolves paths against whatever hostname the request arrived on.
function resolveSiteUrl(config) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  if (config.siteUrl) return config.siteUrl.replace(/\/+$/, '');

  // GitHub Actions knows the Pages address.
  const repository = process.env.GITHUB_REPOSITORY;
  if (repository && !process.env.CF_PAGES && !process.env.WORKERS_CI) {
    const [owner, name] = repository.split('/');
    if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
      return `https://${owner.toLowerCase()}.github.io`;
    }
    return `https://${owner.toLowerCase()}.github.io/${name}`;
  }
  return null;
}

async function walk(dir, base = dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full, base)));
    } else if (SUBTITLE_EXTENSIONS.test(entry.name)) {
      files.push(relative(base, full).split('\\').join('/'));
    }
  }
  return files.sort();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ğ/g, 'g')
    .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function writeFileEnsured(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents);
}

async function main() {
  const config = JSON.parse(await readFile(join(ROOT, 'addon.config.json'), 'utf8'));
  const siteUrl = resolveSiteUrl(config);
  const lang = config.lang || 'aze';

  const cache = new MetadataCache(CACHE_FILE);
  await cache.load();

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const files = await walk(SOURCE_DIR);
  const entries = new Map(); // videoId -> { type, videoId, imdbId, subtitles: [] }
  const skipped = [];
  const notes = [];

  for (const relativePath of files) {
    const absolute = join(SOURCE_DIR, relativePath);
    const info = parseSubtitleName(relativePath);

    // No IMDb id in the name? Ask Cinemeta what this title is.
    if (!info.imdbId && config.lookupTitlesOnline && info.title) {
      const found = await cache.searchByTitle(info.type, info.title, info.year);
      if (found?.id) {
        info.imdbId = found.id;
        notes.push(`"${relativePath}" matched to ${found.id} (${found.name}${found.releaseInfo ? ` ${found.releaseInfo}` : ''}) by title`);
      }
    }

    if (!info.imdbId) {
      skipped.push({
        file: relativePath,
        reason: 'no IMDb id in the file name, and the title could not be matched online',
        reasonAz: 'faylın adında IMDb nömrəsi yoxdur və ad üzrə tapılmadı',
      });
      continue;
    }

    const videoId = toVideoId(info);
    const raw = await readFile(absolute);
    const decoded = decodeSubtitle(raw);
    const converted = toWebVtt(decoded.text, {
      ...(config.cleanup || {}),
      microDvdFps: config.microDvdFps,
    });

    if (converted.cueCount === 0) {
      skipped.push({
        file: relativePath,
        reason: 'no readable subtitle lines found in the file',
        reasonAz: 'faylın içində oxunaqlı altyazı sətri tapılmadı',
      });
      continue;
    }

    if (!entries.has(videoId)) {
      entries.set(videoId, {
        videoId,
        type: info.type,
        imdbId: info.imdbId,
        season: info.season,
        episode: info.episode,
        subtitles: [],
      });
    }
    const entry = entries.get(videoId);

    const suffix = info.label ? `-${slugify(info.label)}` : '';
    const baseName = `${videoId.replace(/:/g, '-')}${suffix}` || videoId.replace(/:/g, '-');
    let outputName = `${baseName}.az.vtt`;
    let attempt = 2;
    while (entry.subtitles.some((sub) => sub.file.endsWith(`/${outputName}`))) {
      outputName = `${baseName}-${attempt}.az.vtt`;
      attempt += 1;
    }

    const outputPath = `files/${info.type}/${outputName}`;
    await writeFileEnsured(join(OUT_DIR, outputPath), converted.vtt);

    entry.subtitles.push({
      id: `az-${entry.subtitles.length + 1}`,
      file: outputPath,
      label: info.label || '',
      source: relativePath,
      encoding: decoded.encoding,
      repaired: decoded.repaired,
      format: converted.format,
      cues: converted.cueCount,
      warnings: converted.warnings,
    });
  }

  // Pull titles and posters so the web page is readable.
  for (const entry of entries.values()) {
    const meta = await cache.meta(entry.type, entry.imdbId);
    entry.title = meta?.name || null;
    entry.poster = meta?.poster || null;
    entry.year = meta?.releaseInfo || null;
  }

  const sorted = [...entries.values()].sort((a, b) =>
    (a.title || a.videoId).localeCompare(b.title || b.videoId, 'az'),
  );

  // ---- index consumed by the Cloudflare Worker / Vercel handler -------------
  const index = {
    generatedAt: new Date().toISOString(),
    siteUrl,
    lang,
    videoCount: sorted.length,
    subtitleCount: sorted.reduce((total, entry) => total + entry.subtitles.length, 0),
    videos: Object.fromEntries(
      sorted.map((entry) => [
        entry.videoId,
        {
          type: entry.type,
          title: entry.title,
          subtitles: entry.subtitles.map((sub) => ({
            id: sub.id,
            // Relative, so the same build works on any hostname. Whoever
            // answers the request turns it into an absolute URL.
            path: sub.file,
            ...(siteUrl ? { url: `${siteUrl}/${sub.file}` } : {}),
            lang,
            label: sub.label,
          })),
        },
      ]),
    ),
  };
  await writeFileEnsured(join(OUT_DIR, 'subs.json'), `${JSON.stringify(index, null, 2)}\n`);

  // ---- static per-video responses ------------------------------------------
  // Only written when the public address is known (the GitHub Pages setup).
  // Stremio needs absolute subtitle URLs, and a static file cannot work them
  // out. On Cloudflare the Worker answers these paths instead.
  if (siteUrl) {
    for (const entry of sorted) {
      const payload = {
        subtitles: entry.subtitles.map((sub) => ({
          id: sub.id,
          url: `${siteUrl}/${sub.file}`,
          lang,
        })),
        cacheMaxAge: 3600,
      };
      await writeFileEnsured(
        join(OUT_DIR, 'subtitles', entry.type, `${entry.videoId}.json`),
        `${JSON.stringify(payload)}\n`,
      );
    }
  }

  // ---- manifest ------------------------------------------------------------
  const manifest = {
    id: config.id,
    version: config.version,
    name: config.name,
    description: config.description,
    logo: config.logo || undefined,
    background: config.background || undefined,
    types: ['movie', 'series'],
    resources: [
      { name: 'subtitles', types: ['movie', 'series'], idPrefixes: ['tt'] },
    ],
    catalogs: [],
    behaviorHints: { configurable: false, configurationRequired: false },
  };
  await writeFileEnsured(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // ---- extras -------------------------------------------------------------
  await writeFileEnsured(join(OUT_DIR, '.nojekyll'), '');

  // Netlify / Cloudflare Pages: strip Stremio's videoHash/videoSize/filename
  // segment so the static file above answers the request.
  await writeFileEnsured(
    join(OUT_DIR, '_redirects'),
    '/subtitles/:type/:id/*  /subtitles/:type/:id.json  200\n',
  );

  const report = {
    generatedAt: index.generatedAt,
    siteUrl,
    videoCount: index.videoCount,
    subtitleCount: index.subtitleCount,
    notes,
    skipped,
    videos: sorted.map((entry) => ({
      videoId: entry.videoId,
      type: entry.type,
      title: entry.title,
      subtitles: entry.subtitles.map((sub) => ({
        source: sub.source,
        encoding: sub.encoding,
        repaired: sub.repaired,
        format: sub.format,
        cues: sub.cues,
        warnings: sub.warnings,
      })),
    })),
  };
  await writeFileEnsured(join(OUT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

  await writeFileEnsured(
    join(OUT_DIR, 'index.html'),
    renderIndexPage({ config, manifest, siteUrl, entries: sorted, skipped, notes }),
  );

  await cache.save();

  // ---- console + GitHub Actions summary ------------------------------------
  const lines = [];
  lines.push(siteUrl
    ? `Addon built for ${siteUrl}`
    : 'Addon built with relative paths (served by the Cloudflare Worker)');
  lines.push(`${index.videoCount} video(s), ${index.subtitleCount} subtitle file(s)`);
  for (const entry of sorted) {
    for (const sub of entry.subtitles) {
      const repairs = sub.repaired.length ? ` — repaired: ${sub.repaired.join('; ')}` : '';
      lines.push(`  ${entry.videoId}  ${entry.title || ''}  [${sub.encoding} -> utf-8, ${sub.cues} cues]${repairs}`);
    }
  }
  for (const note of notes) lines.push(`  note: ${note}`);
  for (const item of skipped) lines.push(`  SKIPPED ${item.file} — ${item.reason}`);
  lines.push('');
  lines.push(siteUrl
    ? `Install URL: ${siteUrl}/manifest.json`
    : 'Install URL: https://<your-worker>.workers.dev/manifest.json');
  const output = lines.join('\n');
  console.log(output);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      '## Azərbaycan altyazı addon',
      '',
      `**${index.videoCount}** video, **${index.subtitleCount}** altyazı faylı.`,
      '',
      '```',
      output,
      '```',
    ].join('\n');
    await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a' });
  }

  if (skipped.length) {
    console.log(`\n${skipped.length} file(s) were skipped — see the list above.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

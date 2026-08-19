// Talks to Cinemeta, the metadata addon Stremio itself ships with.
// Free, no API key, no account. Used for two things:
//   1. turning a plain title like "Inception 2010" into tt1375666
//   2. fetching the poster and title so the addon's web page looks nice
//
// Every call fails soft: if Cinemeta is unreachable the build still succeeds,
// it just has less metadata to show.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const BASE = 'https://v3-cinemeta.strem.io';
const TIMEOUT_MS = 10000;

export class MetadataCache {
  constructor(file) {
    this.file = file;
    this.data = {};
    this.dirty = false;
    this.online = true;
  }

  async load() {
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8'));
    } catch {
      this.data = {};
    }
  }

  async save() {
    if (!this.dirty) return;
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    this.dirty = false;
  }

  async fetchJson(url) {
    if (!this.online) return null;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      // One hard failure means we are offline or blocked; stop trying so the
      // build does not stall on dozens of timeouts.
      this.online = false;
      return null;
    }
  }

  /** Look up an IMDb id from a title. Returns null when unsure. */
  async searchByTitle(type, title, year) {
    const key = `search:${type}:${title.toLowerCase()}:${year || ''}`;
    if (key in this.data) return this.data[key];

    const url = `${BASE}/catalog/${type}/top/search=${encodeURIComponent(title)}.json`;
    const payload = await this.fetchJson(url);
    const metas = payload?.metas || [];

    let chosen = null;
    if (metas.length) {
      const byYear = year
        ? metas.find((meta) => String(meta.releaseInfo || '').startsWith(String(year)))
        : null;
      chosen = byYear || metas[0];
    }

    const result = chosen
      ? { id: chosen.id, name: chosen.name, releaseInfo: chosen.releaseInfo || null, poster: chosen.poster || null }
      : null;

    if (this.online) {
      this.data[key] = result;
      this.dirty = true;
    }
    return result;
  }

  /** Title / poster / year for an IMDb id. */
  async meta(type, imdbId) {
    const key = `meta:${type}:${imdbId}`;
    if (key in this.data) return this.data[key];

    const payload = await this.fetchJson(`${BASE}/meta/${type}/${imdbId}.json`);
    const meta = payload?.meta;
    const result = meta
      ? {
          name: meta.name || null,
          poster: meta.poster || null,
          releaseInfo: meta.releaseInfo || meta.year || null,
        }
      : null;

    if (this.online) {
      this.data[key] = result;
      this.dirty = true;
    }
    return result;
  }
}

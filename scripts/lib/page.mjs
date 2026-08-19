// The addon's own web page: an install button plus a list of everything the
// addon currently serves. Written to dist/index.html by the build.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function episodeLabel(entry) {
  if (entry.type !== 'series') return '';
  const season = String(entry.season).padStart(2, '0');
  const episode = String(entry.episode).padStart(2, '0');
  return `S${season}E${episode}`;
}

export function renderIndexPage({ config, manifest, siteUrl, entries, skipped, notes }) {
  // When the addon is served by the Cloudflare Worker the hostname is not known
  // at build time, so the page fills these in from the browser's own address.
  const manifestUrl = siteUrl ? `${siteUrl}/manifest.json` : '/manifest.json';
  const deepLink = siteUrl
    ? `stremio://${manifestUrl.replace(/^https?:\/\//, '')}`
    : '#';
  const fillFromBrowser = siteUrl
    ? ''
    : `<script>
        (function () {
          var url = location.origin + '/manifest.json';
          document.getElementById('manifest-url').textContent = url;
          document.getElementById('manifest-link').href = url;
          document.getElementById('install-link').href = 'stremio://' + location.host + '/manifest.json';
        })();
      </script>`;

  const rows = entries.map((entry) => {
    const badge = episodeLabel(entry);
    const poster = entry.poster
      ? `<img class="poster" src="${escapeHtml(entry.poster)}" alt="" loading="lazy">`
      : '<div class="poster placeholder"></div>';
    const subs = entry.subtitles
      .map((sub) => `<li>${escapeHtml(sub.label || 'Azərbaycan dili')} <span class="dim">· ${sub.cues} sətir</span></li>`)
      .join('');
    const subline = [entry.title ? entry.videoId : null, entry.year]
      .filter(Boolean)
      .map((part) => escapeHtml(part))
      .join(' · ');
    return `
      <article class="card">
        ${poster}
        <div class="meta">
          <h3>${escapeHtml(entry.title || entry.videoId)} ${badge ? `<span class="badge">${badge}</span>` : ''}</h3>
          ${subline ? `<p class="dim mono">${subline}</p>` : ''}
          <ul class="subs">${subs}</ul>
        </div>
      </article>`;
  }).join('');

  const problems = skipped.length
    ? `<section class="warn">
         <h2>Əlavə edilməyən fayllar (${skipped.length})</h2>
         <p>Bu faylların adında IMDb nömrəsi (<code>tt…</code>) tapılmadı və ya faylın içi oxunmadı. Adına IMDb nömrəsini əlavə edin.</p>
         <ul>${skipped.map((item) => `<li><code>${escapeHtml(item.file)}</code> — ${escapeHtml(item.reasonAz || item.reason)}</li>`).join('')}</ul>
       </section>`
    : '';

  const matched = notes.length
    ? `<section class="note">
         <h2>Ada görə tapılanlar</h2>
         <ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>
       </section>`
    : '';

  return `<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.name)}</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0d0f14;
    --panel: #161a22;
    --line: #262c38;
    --text: #e8ebf0;
    --dim: #8b93a3;
    --accent: #7b5cff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 48px 20px 96px;
    background: var(--bg);
    color: var(--text);
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .wrap { max-width: 940px; margin: 0 auto; }
  h1 { font-size: 30px; margin: 0 0 8px; letter-spacing: -0.02em; }
  h2 { font-size: 18px; margin: 40px 0 12px; }
  p { margin: 0 0 12px; }
  .dim { color: var(--dim); }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  .lead { color: var(--dim); max-width: 60ch; }
  .install {
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
    margin: 28px 0 8px;
  }
  .btn {
    display: inline-block; padding: 12px 22px; border-radius: 10px;
    background: var(--accent); color: #fff; text-decoration: none; font-weight: 600;
  }
  .btn.secondary { background: var(--panel); border: 1px solid var(--line); color: var(--text); }
  .url {
    display: block; margin-top: 10px; padding: 12px 14px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    word-break: break-all;
  }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 14px; margin-top: 16px;
  }
  .card {
    display: flex; gap: 12px; padding: 12px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 12px;
  }
  .card h3 { font-size: 15px; margin: 0 0 4px; }
  .poster { width: 62px; height: 92px; object-fit: cover; border-radius: 6px; flex: none; }
  .poster.placeholder { background: #222836; }
  .meta { min-width: 0; }
  .badge {
    display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 11px;
    background: #2a3140; color: var(--dim); vertical-align: middle;
  }
  ul.subs { margin: 8px 0 0; padding-left: 18px; font-size: 14px; }
  .warn, .note {
    margin-top: 32px; padding: 16px 18px; border-radius: 12px;
    border: 1px solid var(--line); background: var(--panel);
  }
  .warn { border-color: #6b3b2a; }
  .empty { padding: 28px; border: 1px dashed var(--line); border-radius: 12px; color: var(--dim); }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  footer { margin-top: 56px; color: var(--dim); font-size: 13px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(config.name)}</h1>
  <p class="lead">${escapeHtml(config.description)}</p>

  <div class="install">
    <a class="btn" id="install-link" href="${escapeHtml(deepLink)}">Stremio-ya əlavə et</a>
    <a class="btn secondary" id="manifest-link" href="${escapeHtml(manifestUrl)}">manifest.json</a>
  </div>
  <code class="url" id="manifest-url">${escapeHtml(siteUrl ? manifestUrl : '…')}</code>
  <p class="dim" style="margin-top:10px">Düymə işləmirsə: Stremio → Addons → yuxarıdakı axtarış sahəsinə bu ünvanı yapışdırın.</p>

  <h2>İçindəkilər — ${entries.length} video, ${entries.reduce((total, entry) => total + entry.subtitles.length, 0)} altyazı</h2>
  ${entries.length ? `<div class="grid">${rows}</div>` : '<div class="empty">Hələ heç bir altyazı yoxdur. <code>subtitles/</code> qovluğuna .srt faylı atın.</div>'}

  ${matched}
  ${problems}

  <h2>Yeni film əlavə etmək</h2>
  <ol>
    <li>GitHub-da <code>subtitles/</code> qovluğunu açın.</li>
    <li><b>Add file → Upload files</b> ilə .srt faylını atın.</li>
    <li>Faylın adında IMDb nömrəsi olsun: <code>tt1375666.srt</code> və ya <code>tt1375666 Inception.srt</code>.</li>
    <li>Serial üçün: <code>tt0903747 S01E02.srt</code>.</li>
    <li>Commit edin — 1-2 dəqiqəyə addon özü yenilənir.</li>
  </ol>

  <footer>
    v${escapeHtml(manifest.version)} · son yenilənmə ${escapeHtml(new Date().toISOString().slice(0, 16).replace('T', ' '))} UTC
  </footer>
</div>
${fillFromBrowser}
</body>
</html>
`;
}

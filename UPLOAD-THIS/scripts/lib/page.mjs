// Two pages come out of the build:
//
//   index.html  — what customers see. Install help, how to switch subtitles on,
//                 the catalogue, FAQ. Nothing about how the addon is maintained.
//   panel.html  — your own view: which files were skipped, what encoding each
//                 was found in. Not linked from anywhere public.

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contactButton(contact) {
  if (!contact || !contact.type || contact.type === 'none' || !contact.value) return '';
  const value = String(contact.value).trim();
  const handle = value.replace(/^@/, '');
  const map = {
    telegram: { href: `https://t.me/${handle}`, label: 'Telegram' },
    whatsapp: { href: `https://wa.me/${value.replace(/[^0-9]/g, '')}`, label: 'WhatsApp' },
    instagram: { href: `https://instagram.com/${handle}`, label: 'Instagram' },
    email: { href: `mailto:${value}`, label: 'E-poçt' },
  };
  const target = map[contact.type];
  if (!target) return '';
  return `<a class="btn ghost" href="${escapeHtml(target.href)}" target="_blank" rel="noopener">${target.label} ilə yazın</a>`;
}

const SHARED_STYLE = `
  :root {
    color-scheme: dark;
    --bg: #0b0d13;
    --panel: #14171f;
    --panel2: #191d27;
    --line: #252b38;
    --text: #eef0f5;
    --dim: #949cb0;
    --accent: #7d5cff;
    --accent2: #5b3ce0;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 16px/1.65 Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 980px; margin: 0 auto; padding: 0 20px; }
  a { color: inherit; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .dim { color: var(--dim); }
`;

export function renderIndexPage({ config, manifest, siteUrl, entries }) {
  const manifestUrl = siteUrl ? `${siteUrl}/manifest.json` : '/manifest.json';
  const deepLink = siteUrl ? `stremio://${manifestUrl.replace(/^https?:\/\//, '')}` : '#';

  const movies = entries.filter((entry) => entry.type === 'movie');
  const seriesEpisodes = entries.filter((entry) => entry.type === 'series');
  const seriesCount = new Set(seriesEpisodes.map((entry) => entry.imdbId)).size;

  const countText = [
    movies.length ? `${movies.length} film` : '',
    seriesCount ? `${seriesCount} serial (${seriesEpisodes.length} bölüm)` : '',
  ].filter(Boolean).join(' · ') || 'Kolleksiya hazırlanır';

  // A series gets one card for the whole show, not one per episode — otherwise
  // a single sitcom would bury every film in the grid.
  const shows = new Map();
  for (const entry of seriesEpisodes) {
    const existing = shows.get(entry.imdbId);
    if (existing) existing.episodes += 1;
    else shows.set(entry.imdbId, { ...entry, episodes: 1 });
  }

  const card = ({ poster, title, fallback, year, chip }) => `<article class="film">
      ${poster ? `<img src="${escapeHtml(poster)}" alt="" loading="lazy">` : '<div class="ph"></div>'}
      <div class="film-t">${escapeHtml(title || fallback)}${chip ? ` <span class="chip">${escapeHtml(chip)}</span>` : ''}</div>
      ${year ? `<div class="film-y dim">${escapeHtml(year)}</div>` : ''}
    </article>`;

  const cards = [
    ...movies.map((entry) => card({
      poster: entry.poster,
      title: entry.title,
      fallback: entry.videoId,
      year: entry.year,
    })),
    ...[...shows.values()].map((show) => card({
      poster: show.poster,
      title: show.title,
      fallback: show.imdbId,
      year: show.year,
      chip: `${show.episodes} bölüm`,
    })),
  ].join('');

  const catalogue = config.showCatalog === false
    ? `<p class="dim">Kolleksiyada hazırda <b>${escapeHtml(countText)}</b> var və mütəmadi genişlənir.</p>`
    : (entries.length
      ? `<div class="films">${cards}</div>`
      : '<p class="dim">Kolleksiya hazırlanır — tezliklə.</p>');

  const support = contactButton(config.contact);

  return `<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(config.name)} — Stremio üçün Azərbaycan altyazıları</title>
<meta name="description" content="${escapeHtml(config.description)}">
<meta property="og:title" content="${escapeHtml(config.name)}">
<meta property="og:description" content="${escapeHtml(config.tagline || config.description)}">
<meta property="og:image" content="logo.png">
<link rel="icon" href="logo.png">
<style>
${SHARED_STYLE}
  .hero { padding: 68px 0 44px; text-align: center; position: relative; overflow: hidden; }
  .hero::before {
    content: ''; position: absolute; left: 50%; top: -260px; width: 760px; height: 520px;
    transform: translateX(-50%); pointer-events: none;
    background: radial-gradient(circle, rgba(125,92,255,.28), transparent 66%);
  }
  .hero img.logo { width: 92px; height: 92px; border-radius: 22px; position: relative; }
  h1 { font-size: clamp(30px, 6vw, 46px); margin: 20px 0 8px; letter-spacing: -1.2px; position: relative; }
  .tagline { color: var(--dim); font-size: 18px; margin: 0 auto 30px; max-width: 38ch; position: relative; }
  .cta { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; position: relative; }
  .btn {
    display: inline-block; padding: 14px 28px; border-radius: 12px; text-decoration: none;
    font-weight: 600; background: linear-gradient(135deg, var(--accent), var(--accent2)); color: #fff;
  }
  .btn.ghost { background: var(--panel2); border: 1px solid var(--line); color: var(--text); }
  .urlrow {
    display: flex; gap: 8px; align-items: stretch; max-width: 620px; margin: 18px auto 0; position: relative;
  }
  .urlrow input {
    flex: 1; min-width: 0; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--panel); color: var(--text); font-family: ui-monospace, Menlo, monospace; font-size: 13px;
  }
  .urlrow button {
    padding: 12px 18px; border-radius: 10px; border: 1px solid var(--line);
    background: var(--panel2); color: var(--text); font: inherit; font-size: 14px; cursor: pointer;
  }
  .urlrow button:hover { border-color: var(--accent); }
  .free { color: var(--dim); font-size: 14px; margin-top: 14px; position: relative; }

  section { padding: 40px 0; border-top: 1px solid var(--line); }
  h2 { font-size: 23px; margin: 0 0 6px; letter-spacing: -0.4px; }
  h2 + .sub { color: var(--dim); margin: 0 0 22px; }

  .tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .tabs label {
    padding: 9px 16px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line);
    cursor: pointer; font-size: 14px; user-select: none;
  }
  input[name="tab"] { position: absolute; opacity: 0; pointer-events: none; }
  .pane { display: none; }
  #t1:checked ~ .tabs label[for="t1"],
  #t2:checked ~ .tabs label[for="t2"],
  #t3:checked ~ .tabs label[for="t3"],
  #t4:checked ~ .tabs label[for="t4"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  #t1:checked ~ #p1, #t2:checked ~ #p2, #t3:checked ~ #p3, #t4:checked ~ #p4 { display: block; }

  ol.steps { counter-reset: s; list-style: none; padding: 0; margin: 0; }
  ol.steps li {
    counter-increment: s; position: relative; padding: 0 0 18px 46px; margin: 0;
  }
  ol.steps li::before {
    content: counter(s); position: absolute; left: 0; top: 0;
    width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
    background: var(--panel2); border: 1px solid var(--line); font-size: 14px; font-weight: 600; color: var(--accent);
  }
  ol.steps li b { font-weight: 600; }
  .tip {
    margin-top: 8px; padding: 14px 16px; border-radius: 12px;
    background: rgba(125,92,255,.08); border: 1px solid rgba(125,92,255,.28); font-size: 15px;
  }
  .note { padding: 14px 16px; border-radius: 12px; background: var(--panel); border: 1px solid var(--line); font-size: 15px; }

  .films { display: grid; grid-template-columns: repeat(auto-fill, minmax(126px, 1fr)); gap: 16px; }
  .film img, .film .ph {
    width: 100%; aspect-ratio: 2/3; object-fit: cover; border-radius: 10px;
    background: var(--panel2); display: block;
  }
  .film-t { font-size: 13.5px; margin-top: 8px; line-height: 1.35; }
  .film-y { font-size: 12px; }
  .chip {
    display: inline-block; padding: 0 6px; border-radius: 20px; font-size: 10.5px;
    background: var(--panel2); color: var(--dim); vertical-align: middle;
  }

  details {
    border: 1px solid var(--line); border-radius: 12px; background: var(--panel);
    padding: 14px 16px; margin-bottom: 10px;
  }
  details summary { cursor: pointer; font-weight: 600; list-style: none; }
  details summary::-webkit-details-marker { display: none; }
  details summary::after { content: ' +'; color: var(--accent); }
  details[open] summary::after { content: ' –'; }
  details p { margin: 10px 0 0; color: var(--dim); }

  footer { padding: 34px 0 60px; border-top: 1px solid var(--line); color: var(--dim); font-size: 14px; }
  footer .frow { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
</style>
</head>
<body>

<div class="hero">
  <div class="wrap">
    <img class="logo" src="logo.png" alt="">
    <h1>${escapeHtml(config.name)}</h1>
    <p class="tagline">${escapeHtml(config.tagline || '')}</p>
    <div class="cta">
      <a class="btn" id="install-link" href="${escapeHtml(deepLink)}">Stremio-ya əlavə et</a>
      ${support}
    </div>
    <div class="urlrow">
      <input id="manifest-url" readonly value="${escapeHtml(siteUrl ? manifestUrl : '')}">
      <button type="button" id="copy-btn">Kopyala</button>
    </div>
    <p class="free">Pulsuz · Qeydiyyat tələb olunmur · ${escapeHtml(countText)}</p>
  </div>
</div>

<div class="wrap">

  <section>
    <h2>Bu nədir?</h2>
    <p class="sub">Stremio üçün altyazı əlavəsidir. Bir dəfə quraşdırırsınız, sonra istənilən film və ya serialı açanda altyazı menyusunda <b>«Azərbaycan dili»</b> variantı görünür. Ayrıca fayl yükləmək, altyazını əl ilə seçmək lazım deyil.</p>
    <div class="note">Bu əlavə film və ya video yayımlamır — yalnız altyazı verir. Filmləri həmişəki kimi Stremio-da baxırsınız.</div>
  </section>

  <section>
    <h2>Necə quraşdırılır?</h2>
    <p class="sub">Cihazınızı seçin.</p>

    <input type="radio" name="tab" id="t1" checked>
    <input type="radio" name="tab" id="t2">
    <input type="radio" name="tab" id="t3">
    <input type="radio" name="tab" id="t4">

    <div class="tabs">
      <label for="t1">Kompüter</label>
      <label for="t2">Android / TV</label>
      <label for="t3">iPhone / iPad</label>
      <label for="t4">Brauzer</label>
    </div>

    <div class="pane" id="p1">
      <ol class="steps">
        <li>Stremio proqramını açın (Windows, macOS və ya Linux).</li>
        <li>Yuxarı sağdakı <b>puzzle</b> ikonuna — <b>Addons</b> bölməsinə keçin.</li>
        <li>Səhifənin yuxarısındakı <b>Addon Repository URL</b> sahəsinə yuxarıdakı ünvanı yapışdırın.</li>
        <li><b>Install</b> düyməsinə basın. Hamısı budur.</li>
      </ol>
      <div class="tip">Ən asan yol: yuxarıdakı <b>«Stremio-ya əlavə et»</b> düyməsinə basın — proqram özü açılır və quraşdırma pəncərəsi çıxır.</div>
    </div>

    <div class="pane" id="p2">
      <ol class="steps">
        <li>Stremio tətbiqini açın.</li>
        <li>Sol menyudan <b>Addons</b> bölməsinə keçin.</li>
        <li>Yuxarıdakı ünvan sahəsinə linki yazın və <b>Install</b> basın.</li>
      </ol>
      <div class="tip"><b>Android TV üçün məsləhət:</b> pultla uzun link yazmaq əziyyətdir. Kompüterdə və ya telefonda <b>eyni Stremio hesabına</b> daxil olub quraşdırın — əlavə televizorda avtomatik görünəcək. Qonaq (guest) hesabda sinxronizasiya işləmir, ona görə e-poçt ilə qeydiyyatdan keçin.</div>
    </div>

    <div class="pane" id="p3">
      <div class="note" style="margin-bottom:16px">App Store-da tam funksiyalı Stremio tətbiqi yoxdur. iPhone və iPad-də Stremio brauzer versiyası ilə istifadə olunur.</div>
      <ol class="steps">
        <li>Safari-də <b>web.stremio.com</b> ünvanını açın.</li>
        <li><b>Paylaş</b> → <b>Ana ekrana əlavə et</b> — tətbiq kimi işləyəcək.</li>
        <li>Hesabınıza daxil olun.</li>
        <li><b>Addons</b> → ünvanı yapışdırın → <b>Install</b>.</li>
      </ol>
    </div>

    <div class="pane" id="p4">
      <ol class="steps">
        <li><b>web.stremio.com</b> ünvanını açın.</li>
        <li>Hesabınıza daxil olun.</li>
        <li><b>Addons</b> bölməsində ünvanı yapışdırın və <b>Install</b> basın.</li>
      </ol>
    </div>
  </section>

  <section>
    <h2>Altyazını necə açmaq olar?</h2>
    <p class="sub">Quraşdırdıqdan sonra ən çox verilən sual budur.</p>
    <ol class="steps">
      <li>Filmi və ya serialı <b>oynadın</b> — baxış başlasın.</li>
      <li>Ekranın aşağısındakı <b>altyazı (CC)</b> ikonuna toxunun.</li>
      <li>Siyahıdan <b>Azərbaycan dili</b> seçin.</li>
    </ol>
    <div class="tip">Altyazı siyahısı yalnız <b>film oynamağa başlayandan sonra</b> görünür — filmin təsvir səhifəsində yox. Əgər siyahıda «Azərbaycan dili» yoxdursa, deməli bu film hələ kolleksiyaya əlavə olunmayıb.</div>
  </section>

  <section>
    <h2>Kolleksiya</h2>
    <p class="sub">${escapeHtml(countText)} — siyahı mütəmadi genişlənir.</p>
    ${catalogue}
  </section>

  <section>
    <h2>Suallar</h2>

    <details>
      <summary>Altyazı görünmür, nə edim?</summary>
      <p>Əvvəlcə filmi oynadın — altyazı menyusu yalnız baxış başlayandan sonra aktiv olur. Hələ də yoxdursa, bu film kolleksiyada olmaya bilər. Stremio-nu bağlayıb yenidən açmaq da kömək edir.</p>
    </details>

    <details>
      <summary>Pulludur?</summary>
      <p>Xeyr. Əlavə tamamilə pulsuzdur, qeydiyyat və ya abunə tələb olunmur.</p>
    </details>

    <details>
      <summary>Hansı cihazlarda işləyir?</summary>
      <p>Windows, macOS, Linux, Android, Android TV və brauzer (web.stremio.com). iPhone və iPad-də brauzer versiyası ilə işləyir.</p>
    </details>

    <details>
      <summary>Altyazı filmdən tez və ya gec gedir</summary>
      <p>Bu, altyazının deyil, video faylının fərqli versiyasından olur. Stremio-da baxış zamanı altyazı parametrlərində <b>gecikmə (delay)</b> ayarını irəli-geri sürüşdürərək uyğunlaşdıra bilərsiniz.</p>
    </details>

    <details>
      <summary>Hərflər düzgün görünmür (ə, ğ, ş, ı)</summary>
      <p>Bütün altyazılar UTF-8 formatına çevrilib, ona görə Azərbaycan hərfləri düzgün görünməlidir. Problem varsa, Stremio-nun altyazı parametrlərində şrifti dəyişməyi yoxlayın.</p>
    </details>

    <details>
      <summary>Filmi əlavə edə bilərsiniz?</summary>
      <p>Kolleksiya mütəmadi genişlənir. ${support ? 'Aşağıdakı əlaqə düyməsi ilə yazın.' : 'Yeni filmlər müntəzəm əlavə olunur — bir müddət sonra yenidən yoxlayın.'}</p>
    </details>
  </section>

  <footer>
    <div class="frow">
      <div>${escapeHtml(config.brand || config.name)} · ${escapeHtml(countText)}</div>
      <div>Son yenilənmə: ${escapeHtml(new Date().toISOString().slice(0, 10))}</div>
    </div>
  </footer>
</div>

<script>
  (function () {
    var url = ${siteUrl ? JSON.stringify(manifestUrl) : 'location.origin + "/manifest.json"'};
    var field = document.getElementById('manifest-url');
    field.value = url;
    document.getElementById('install-link').href = 'stremio://' + url.replace(/^https?:\\/\\//, '');
    document.getElementById('copy-btn').addEventListener('click', function () {
      var button = this;
      field.select();
      var done = function () { button.textContent = 'Kopyalandı'; setTimeout(function () { button.textContent = 'Kopyala'; }, 1600); };
      if (navigator.clipboard) { navigator.clipboard.writeText(url).then(done, done); }
      else { try { document.execCommand('copy'); } catch (e) {} done(); }
    });
  })();
</script>
</body>
</html>
`;
}

export function renderPanelPage({ config, siteUrl, entries, skipped, notes }) {
  const rows = entries.flatMap((entry) => entry.subtitles.map((sub) => `
    <tr>
      <td class="mono">${escapeHtml(entry.videoId)}</td>
      <td>${escapeHtml(entry.title || '—')}</td>
      <td>${escapeHtml(sub.source)}</td>
      <td>${escapeHtml(sub.encoding)}</td>
      <td>${sub.cues}</td>
      <td>${sub.repaired.length ? escapeHtml(sub.repaired.join('; ')) : '—'}</td>
      <td>${sub.warnings.length ? escapeHtml(sub.warnings.join('; ')) : '—'}</td>
    </tr>`)).join('');

  return `<!doctype html>
<html lang="az">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Panel — ${escapeHtml(config.name)}</title>
<style>
${SHARED_STYLE}
  body { padding: 40px 0; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 34px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { color: var(--dim); font-weight: 600; }
  .box { padding: 14px 16px; border: 1px solid var(--line); border-radius: 12px; background: var(--panel); margin-bottom: 10px; }
  .warn { border-color: #6b3b2a; }
  ul { margin: 8px 0 0; padding-left: 20px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Panel</h1>
  <p class="dim">Yalnız sizin üçün — bu səhifəyə heç bir yerdən keçid yoxdur.</p>

  <h2>Fayllar (${entries.reduce((total, entry) => total + entry.subtitles.length, 0)})</h2>
  <table>
    <thead><tr><th>ID</th><th>Ad</th><th>Fayl</th><th>Encoding</th><th>Sətir</th><th>Düzəliş</th><th>Xəbərdarlıq</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="dim">Boş</td></tr>'}</tbody>
  </table>

  ${skipped.length ? `<h2>Əlavə edilməyən fayllar (${skipped.length})</h2>
  <div class="box warn"><ul>${skipped.map((item) => `<li><code>${escapeHtml(item.file)}</code> — ${escapeHtml(item.reasonAz || item.reason)}</li>`).join('')}</ul></div>` : ''}

  ${notes.length ? `<h2>Ada görə tapılanlar</h2>
  <div class="box"><ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul></div>` : ''}

  <h2>Ünvanlar</h2>
  <div class="box mono">
    ${escapeHtml(siteUrl || '')}/manifest.json<br>
    ${escapeHtml(siteUrl || '')}/subs.json<br>
    ${escapeHtml(siteUrl || '')}/report.json
  </div>
</div>
</body>
</html>
`;
}

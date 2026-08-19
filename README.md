# Azərbaycan Altyazılar — Stremio addon

Your own Azerbaijani subtitle addon for Stremio, running on Cloudflare Workers.
Drop an `.srt` file into `subtitles/`, and a minute later it is playing in
Stremio. No server to rent, no database, no API keys.

**Install URL:** `https://stremio-subtitle-addon-mvrad-digital.muradismayilovvlog.workers.dev/manifest.json`

---

## Yeni film əlavə etmək (30 saniyə)

1. GitHub-da bu repozitoriyada **`subtitles/`** qovluğunu açın
2. **Add file → Upload files** → `.srt` faylını sürüşdürün
3. Faylın adında IMDb nömrəsi olsun — məsələn `tt1375666.srt`
4. **Commit changes**

Vəssalam. Cloudflare özü yenidən qurur, 1–2 dəqiqədən sonra altyazı Stremio-da
görünür. Nə kod, nə terminal lazımdır.

IMDb nömrəsini haradan tapmaq olar: filmin IMDb səhifəsinin ünvanında var —
`imdb.com/title/`**`tt1375666`**`/`. Stremio-da filmin səhifəsində də eyni
nömrə görünür.

---

## File naming

The build reads the IMDb id straight out of the file name. Everything else in
the name is yours to use.

| File name | What it becomes |
| --- | --- |
| `tt1375666.srt` | the film Inception |
| `tt1375666 Inception.srt` | same, easier to recognise in the folder |
| `Inception (2010) tt1375666 [BluRay].srt` | same film, shown in Stremio as "BluRay" |
| `tt1375666 [WEB-DL].srt` | a second subtitle for the same film |
| `tt0903747 S01E02.srt` | Breaking Bad, season 1, episode 2 |
| `tt0903747-1-2.srt` | the same episode, shorter |
| `series/Breaking Bad/tt0903747/S02E05.srt` | folders work too |
| `Inception 2010.srt` | no id — looked up by title automatically |

Anything in `[square brackets]` becomes the label Stremio shows when a film has
more than one subtitle, so a BluRay and a WEB-DL version can sit side by side.

`.srt`, `.vtt` and MicroDVD `.sub` files are all accepted.

---

## What happens to your subtitle file

Azerbaijani subtitles are usually a mess of encodings, which is why letters
come out as `Ä±` or `þ` in other addons. Every file goes through this on the
way in:

- **Encoding detection** — UTF-8, UTF-16, windows-1254, ISO-8859-9,
  windows-1251, windows-1250, windows-1252
- **Damage repair** — files saved through the wrong codepage twice (`Ã¼` →
  `ü`), files read as latin-1 (`þýð` → `şığ`), Cyrillic look-alikes (`Ә` → `Ə`)
- **Format conversion** — SRT and MicroDVD become WebVTT, which Stremio plays
  natively so it never has to guess an encoding
- **Cleanup** — `<font>` and `{\an8}` tags removed, broken timings fixed

The result is plain UTF-8 WebVTT, so **ə ğ ı İ ö ş ü ç** all render correctly.

Stremio is told the language is `aze`, which it displays as
**"Azərbaycan dili"** in the subtitle menu.

---

## How it is deployed

Cloudflare is connected to this repository (Workers & Pages → your project →
Settings → Build). On every push it runs:

```
Build command:   npm run build      # subtitles/ -> dist/
Deploy command:  npx wrangler deploy
```

`wrangler.toml` tells Wrangler to publish `worker/index.js` together with
`dist/` as static assets, so a single Worker serves the manifest, the subtitle
files and the addon's web page.

### Why the Worker is not optional

When Stremio plays a video it does **not** ask for
`/subtitles/movie/tt1375666.json`. It asks for something like:

```
/subtitles/movie/tt1375666/videoHash=8e2b1f&videoSize=1471263&filename=Inception.mkv.json
```

A static host has no file at that address, answers 404, and no subtitles
appear. `worker/index.js` ignores that trailing part and answers correctly.
It also adds the CORS headers Stremio needs — which is why `wrangler.toml`
sets `run_worker_first = true`.

Subtitle URLs are stored relative and made absolute per request, so the addon
works on the `workers.dev` address, on a custom domain, and on `localhost`
without any configuration.

---

## Testing before you push

```bash
npm run build     # convert everything in subtitles/ into dist/
npm test          # check the encoding and conversion pipeline
npm run verify    # build, then replay the exact URLs Stremio sends
npm start         # build, then serve on http://127.0.0.1:8080
```

`npm start` prints a `http://127.0.0.1:8080/manifest.json` URL you can install
in the desktop Stremio to try changes before pushing.

After each build, `dist/report.json` lists every file, the encoding it was
found in, and any repairs applied — the first place to look when a subtitle
renders wrong.

GitHub Actions runs `npm test` and `npm run verify` on every push, so a badly
named or unreadable file shows up as a red cross on the commit.

---

## Troubleshooting

**A film shows no subtitles at all.** Open the addon's web page (the Worker's
root URL). If the film is not listed, the file name had no IMDb id — the page
names every skipped file and why.

**Subtitles appear in the menu but never load.** The subtitle URLs are pointing
somewhere unreachable. Open `/subs.json` on the Worker: every entry should have
a relative `"path"`, not an absolute `"url"` with a hostname baked in.

**Letters look wrong.** Check `report.json` for that file's detected encoding.
If detection guessed wrong, open the `.srt` in a text editor, save it as UTF-8,
and re-upload.

**Stremio still shows the old list.** Stremio caches subtitle responses
briefly. Stop playback and start it again.

---

## Layout

```
subtitles/                 <- you only ever touch this folder
wrangler.toml              <- Cloudflare deployment config
worker/index.js            <- the addon endpoint
scripts/build.mjs          <- converts subtitles/ into dist/
scripts/lib/decode.mjs     <- encoding detection and repair
scripts/lib/subtitle.mjs   <- SRT / MicroDVD -> WebVTT
scripts/lib/naming.mjs     <- reads IMDb id and episode from file names
scripts/verify.mjs         <- replays Stremio's real requests against dist/
api/subtitles.js           <- only needed if you host on Vercel instead
.github/workflows/         <- runs the checks on every push
addon.config.json          <- addon name, description, options
```

No `npm install` needed — plain Node, zero dependencies.

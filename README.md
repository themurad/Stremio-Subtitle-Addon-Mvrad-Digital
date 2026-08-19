# Azərbaycan Altyazılar — Stremio addon

Your own Azerbaijani subtitle addon for Stremio. Drop an `.srt` file into
`subtitles/`, and a minute later it is playing in Stremio. No server to rent,
no database, no API keys.

---

## Yeni film əlavə etmək (30 saniyə)

1. GitHub-da bu repozitoriyada **`subtitles/`** qovluğunu açın
2. **Add file → Upload files** → `.srt` faylını sürüşdürün
3. Faylın adında IMDb nömrəsi olsun — məsələn `tt1375666.srt`
4. **Commit changes**

Vəssalam. 1–2 dəqiqədən sonra altyazı Stremio-da görünür. Heç nə etmək lazım
deyil — nə kod, nə terminal.

IMDb nömrəsini haradan tapmaq olar: filmin IMDb səhifəsinin ünvanında var —
`imdb.com/title/`**`tt1375666`**`/`. Stremio-da filmin səhifəsində də eyni nömrə
görünür.

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
more than one subtitle, so you can keep a BluRay and a WEB-DL version side by
side.

`.srt`, `.vtt` and MicroDVD `.sub` files are all accepted.

---

## What happens to your subtitle file

Azerbaijani subtitles are usually a mess of encodings, which is why letters
come out as `Ä±` or `þ` in other addons. Every file is put through this on the
way in:

- **Encoding detection** — UTF-8, UTF-16, windows-1254, ISO-8859-9,
  windows-1251, windows-1250, windows-1252
- **Damage repair** — files saved through the wrong codepage twice (`Ã¼` →
  `ü`), files read as latin-1 (`þýð` → `şığ`), Cyrillic look-alikes (`Ә` → `Ə`)
- **Format conversion** — SRT and MicroDVD become WebVTT, which Stremio plays
  natively so it never has to guess an encoding
- **Cleanup** — `<font>` and `{\an8}` tags removed, broken timings fixed

The result is plain UTF-8 WebVTT, so **ə ğ ı İ ö ş ü ç** all render correctly.

The subtitle is announced to Stremio as `aze`, which Stremio displays as
**"Azərbaycan dili"** in the subtitle menu.

---

## First-time setup

### 1. Turn on GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions**

Push anything and the included workflow builds and publishes the addon. Your
addon page will be at `https://<username>.github.io/<repo>/`.

### 2. Deploy the Worker — do not skip this

This is the part that makes it work *every time*.

When Stremio plays a video it does not ask for
`/subtitles/movie/tt1375666.json`. It asks for something like:

```
/subtitles/movie/tt1375666/videoHash=8e2b1f&videoSize=1471263&filename=Inception.mkv.json
```

GitHub Pages has no file at that address, so it answers 404 and no subtitles
appear. `worker/worker.js` ignores that trailing part and answers correctly.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages**
   → **Create** → **Worker** (free, no card needed)
2. Paste the whole contents of `worker/worker.js` over the template
3. Change the `SITE` line at the top to your GitHub Pages address
4. **Deploy**

Then install this URL in Stremio:

```
https://<your-worker>.workers.dev/manifest.json
```

You never touch the Worker again — it reads the subtitle list live, so films
you add later show up on their own.

> **Alternative:** deploy this repo to [Vercel](https://vercel.com) instead
> (import the repo, press Deploy). `vercel.json` and `api/subtitles.js` handle
> the same thing, and Vercel rebuilds on every push. Use one or the other, not
> both.

### 3. Install in Stremio

Stremio → **Addons** → paste the manifest URL into the search box at the top →
**Install**. Or just open the addon's web page and press
**"Stremio-ya əlavə et"**.

---

## Testing locally

```bash
npm run build     # convert everything in subtitles/ into dist/
npm start         # build, then serve on http://127.0.0.1:8080
npm test          # check the encoding/conversion pipeline
```

`npm start` prints a `http://127.0.0.1:8080/manifest.json` URL you can install
in the desktop Stremio to try changes before pushing.

After each build, `dist/report.json` lists every file, the encoding it was
found in, and any repairs that were applied — useful when a subtitle looks
wrong.

---

## Troubleshooting

**A film shows no subtitles.** Open your addon's web page. If the film is not
in the list, the file name had no IMDb id — the page shows exactly which files
were skipped and why.

**Subtitles show for some films but not others during playback.** The Worker
step was skipped. See "Deploy the Worker" above.

**Letters look wrong.** Check `dist/report.json` (or the Actions log) for that
file's detected encoding. If the detection guessed wrong, open the `.srt` in a
text editor, save it as UTF-8, and re-upload.

**Stremio still shows the old list.** Stremio caches subtitle responses briefly.
Stop and restart playback.

---

## Layout

```
subtitles/                 <- you only ever touch this folder
scripts/build.mjs          <- converts subtitles/ into dist/
scripts/lib/decode.mjs     <- encoding detection and repair
scripts/lib/subtitle.mjs   <- SRT / MicroDVD -> WebVTT
scripts/lib/naming.mjs     <- reads IMDb id and episode from file names
worker/worker.js           <- Cloudflare Worker (the addon endpoint)
api/subtitles.js           <- Vercel equivalent
.github/workflows/         <- builds and publishes on every push
addon.config.json          <- addon name, description, options
```

Nothing here needs `npm install` — it is plain Node with no dependencies.

# Maintenance

Everything in this file is for you, not for customers. Nothing here is linked
from `README.md` or from the public page.

> **Make this repository private.** Hiding these notes does not hide anything
> while the repo is public — the build scripts in `scripts/` describe the whole
> system to anyone who opens them. Cloudflare Workers Builds deploys from a
> private repo exactly the same way, so there is no cost to switching:
> **Settings → General → Danger Zone → Change repository visibility → Private.**

---

## Adding a film or episode

Upload the file into `subtitles/` on GitHub (**Add file → Upload files**),
commit, and Cloudflare rebuilds within a couple of minutes.

The IMDb id in the file name is what matters. Everything else is free text.

| File name | What it becomes |
| --- | --- |
| `tt1375666.srt` | the film Inception |
| `tt1375666 Inception.srt` | same, easier to recognise in the folder |
| `Inception (2010) tt1375666 [BluRay].srt` | same film, labelled "BluRay" in Stremio |
| `tt1375666 [WEB-DL].srt` | a second subtitle for the same film |
| `tt0903747 S01E02.srt` | Breaking Bad, season 1, episode 2 |
| `tt0903747-1-2.srt` | the same episode, shorter |
| `series/Breaking Bad/tt0903747/S02E05.srt` | folders work too |
| `Inception 2010.srt` | no id — looked up by title automatically |

Text in `[square brackets]` becomes the label shown when one film has more than
one subtitle. `.srt`, `.vtt` and MicroDVD `.sub` are all accepted.

The IMDb id is in the IMDb address: `imdb.com/title/`**`tt1375666`**`/`.

---

## What happens to each file

- **Encoding detection** — UTF-8, UTF-16, windows-1254, ISO-8859-9,
  windows-1251, windows-1250, windows-1252
- **Damage repair** — double-encoded UTF-8 (`Ã¼` → `ü`), windows-1254 read as
  latin-1 (`þýð` → `şığ`), Cyrillic look-alikes (`Ә` → `Ə`)
- **Conversion** — SRT and MicroDVD become WebVTT, which Stremio plays natively
  so it never has to guess an encoding
- **Cleanup** — `<font>` and `{\an8}` tags removed, broken timings repaired

Output is plain UTF-8 WebVTT. The language is declared as `aze`, which Stremio
displays as "Azərbaycan dili".

---

## Your pages

| URL | Purpose |
| --- | --- |
| `/` | The customer page |
| `/panel.html` | Yours — skipped files, detected encodings, repairs applied |
| `/report.json` | The same data as raw JSON |
| `/subs.json` | The index the Worker answers from |

After any push, `/panel.html` is the first place to look if a film did not show
up. A file that was skipped is almost always missing its IMDb id.

---

## Customer-facing text

All of it comes from `addon.config.json`:

| Field | Where it shows |
| --- | --- |
| `name` | Page title and the addon's name inside Stremio |
| `description` | **The text Stremio shows in its addon list** |
| `tagline` | Under the title on the page |
| `brand` | Page footer |
| `contact` | Adds a support button — `{"type": "telegram", "value": "@yourname"}`, or `whatsapp` (phone number), `instagram`, `email`, `none` |
| `showCatalog` | `false` hides the film list, shows only the count |

Artwork lives in `assets/`. `logo.png` is what Stremio shows next to the addon
name — keep it square.

---

## Deployment

Cloudflare is connected to this repository and runs on every push:

```
Build command:   npm run build      # subtitles/ -> dist/
Deploy command:  npx wrangler deploy
```

`wrangler.toml` publishes `worker/index.js` together with `dist/` as static
assets, so one Worker serves the manifest, the subtitle files and both pages.

### Why the Worker is not optional

During playback Stremio does not request `/subtitles/movie/tt1375666.json`. It
requests something like:

```
/subtitles/movie/tt1375666/videoHash=8e2b1f&videoSize=1471263&filename=Inception.mkv.json
```

Static hosting has no file at that address, answers 404, and no subtitles
appear. `worker/index.js` ignores the trailing part and answers correctly. It
also adds the CORS headers Stremio needs — which is why `wrangler.toml` sets
`run_worker_first = true`.

Subtitle URLs are stored relative and made absolute per request, so the addon
works on `workers.dev`, on a custom domain, and on localhost with no config.

---

## Testing before you push

```bash
npm run build     # convert everything in subtitles/ into dist/
npm test          # check the encoding and conversion pipeline
npm run verify    # build, then replay the exact URLs Stremio sends
npm start         # build, then serve on http://127.0.0.1:8080
```

GitHub Actions runs `npm test` and `npm run verify` on every push, so a badly
named or unreadable file shows up as a red cross on the commit rather than as
silence in Stremio.

---

## Troubleshooting

**A film shows no subtitles.** Open `/panel.html`. It lists every skipped file
and why — usually a missing IMDb id in the name.

**Subtitles appear in the menu but never load.** Open `/subs.json`. Every entry
should have a relative `"path"`, not an absolute `"url"` with a hostname in it.

**Letters look wrong.** Check the detected encoding for that file in
`/panel.html`. If detection guessed wrong, open the file in a text editor, save
it as UTF-8, and re-upload.

**Stremio still shows the old list.** Stremio caches subtitle responses
briefly. Stop playback and start it again.

---

## Layout

```
subtitles/                 <- the only folder you normally touch
addon.config.json          <- name, description, contact, catalogue on/off
assets/                    <- logo.png and background.png
wrangler.toml              <- Cloudflare deployment config
worker/index.js            <- the addon endpoint
scripts/build.mjs          <- converts subtitles/ into dist/
scripts/lib/page.mjs       <- the customer page and your panel page
scripts/lib/decode.mjs     <- encoding detection and repair
scripts/lib/subtitle.mjs   <- SRT / MicroDVD -> WebVTT
scripts/lib/naming.mjs     <- reads IMDb id and episode from file names
scripts/verify.mjs         <- replays Stremio's real requests against dist/
api/subtitles.js           <- only needed if you host on Vercel instead
.github/workflows/         <- runs the checks on every push
```

No `npm install` needed — plain Node, zero dependencies.

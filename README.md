# AZ Subtitles — Stremio GitHub Pages Addon

Free static Stremio subtitle addon for your own Azerbaijani `.srt` files.

## First setup

1. Create a **public GitHub repository** named `az-subtitles-stremio`.
2. Upload everything from this project to that repository.
3. Keep the default branch as `main`.
4. Open **Settings → Pages**.
5. Under **Build and deployment → Source**, choose **GitHub Actions**.
6. Commit/push. The included workflow builds and publishes the addon.
7. Your manifest URL becomes:

   `https://YOUR_GITHUB_USERNAME.github.io/az-subtitles-stremio/manifest.json`

8. In Stremio, open **Add-ons**, paste that manifest URL, and install it.

## Current first movie

- Obsession (2025)
- IMDb: `tt37287335`
- Language: Azerbaijani (`aze`)
- Source release: YTS WEBRip
- Stremio timing correction: `+750 ms`

The original source SRT stays unchanged. `build.py` applies the configured timing offset only to the published copy.

## Add a new movie

Upload the Azerbaijani SRT into `source_srt/`, then add a new entry to `data/movies.json`.

Example:

```json
"tt1234567": {
  "title": "Movie Name (2026)",
  "type": "movie",
  "subtitles": [
    {
      "id": "aze-main",
      "lang": "aze",
      "source": "source_srt/Movie.Name.Azerbaijani.srt",
      "output_name": "Movie.Name.Azerbaijani.srt",
      "offset_ms": 0
    }
  ]
}
```

Commit the changes. GitHub Actions rebuilds the Stremio addon automatically.

## Add from Windows with one command

```bat
python add_movie.py tt1234567 "Movie Name (2026)" "C:\Subtitles\movie.srt"
```

For subtitles 0.75 seconds later:

```bat
python add_movie.py tt1234567 "Movie Name (2026)" "C:\Subtitles\movie.srt" --offset-ms 750
```

For subtitles 0.75 seconds earlier:

```bat
python add_movie.py tt1234567 "Movie Name (2026)" "C:\Subtitles\movie.srt" --offset-ms -750
```

Then commit/push the changed files.

## Multiple releases for one movie

Add another subtitle object inside the movie's `subtitles` array with a unique `id`, source file, and timing offset.

## Build locally

```bat
python build.py --base-url https://YOUR_GITHUB_USERNAME.github.io/az-subtitles-stremio
```

Generated files appear in `_site/`.

## Notes

- Use the correct IMDb ID (`tt...`).
- Keep SRT files UTF-8.
- Positive `offset_ms` = subtitle appears later.
- Negative `offset_ms` = subtitle appears earlier.
- Your PC does not need to stay on after GitHub Pages deploys it.

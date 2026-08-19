#!/usr/bin/env python3
from pathlib import Path
import argparse
import json
import os
import re
import shutil

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "movies.json"
MANIFEST_FILE = ROOT / "manifest.template.json"
SITE = ROOT / "_site"

TIME_RE = re.compile(r"(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2}),(?P<ms>\d{3})")

def time_to_ms(value):
    m = TIME_RE.fullmatch(value.strip())
    if not m:
        raise ValueError(f"Invalid SRT timestamp: {value}")
    return (
        int(m["h"]) * 3600000
        + int(m["m"]) * 60000
        + int(m["s"]) * 1000
        + int(m["ms"])
    )

def ms_to_time(value):
    value = max(0, int(value))
    h, value = divmod(value, 3600000)
    m, value = divmod(value, 60000)
    s, ms = divmod(value, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def shift_srt(text, offset_ms):
    if not offset_ms:
        return text

    def repl(match):
        start = ms_to_time(time_to_ms(match.group(1)) + offset_ms)
        end = ms_to_time(time_to_ms(match.group(2)) + offset_ms)
        return f"{start} --> {end}"

    return re.sub(
        r"(\d{2}:\d{2}:\d{2},\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2},\d{3})",
        repl,
        text,
    )

def infer_base_url():
    explicit = os.getenv("BASE_URL")
    if explicit:
        return explicit.rstrip("/")

    repo = os.getenv("GITHUB_REPOSITORY", "")
    if "/" in repo:
        owner, name = repo.split("/", 1)
        return f"https://{owner}.github.io/{name}"

    return "https://YOUR_GITHUB_USERNAME.github.io/az-subtitles-stremio"

def validate_imdb_id(imdb_id):
    if not re.fullmatch(r"tt\d+", imdb_id):
        raise ValueError(f"Invalid IMDb ID: {imdb_id}")

def build(base_url):
    if SITE.exists():
        shutil.rmtree(SITE)

    (SITE / "subtitles" / "movie").mkdir(parents=True)
    (SITE / "srt").mkdir(parents=True)

    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    (SITE / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (SITE / ".nojekyll").write_text("", encoding="utf-8")

    db = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    built_movies = 0
    built_subtitles = 0

    for imdb_id, movie in db.items():
        validate_imdb_id(imdb_id)
        if movie.get("type", "movie") != "movie":
            raise ValueError(f"{imdb_id}: this starter currently supports movies only")

        results = []
        out_dir = SITE / "srt" / imdb_id
        out_dir.mkdir(parents=True, exist_ok=True)

        for entry in movie.get("subtitles", []):
            src = ROOT / entry["source"]
            if not src.exists():
                raise FileNotFoundError(f"{imdb_id}: subtitle source not found: {src}")

            output_name = entry.get("output_name") or src.name
            offset_ms = int(entry.get("offset_ms", 0))
            srt_text = src.read_text(encoding="utf-8-sig")
            srt_text = shift_srt(srt_text, offset_ms)

            out_file = out_dir / output_name
            out_file.write_text(srt_text, encoding="utf-8")

            results.append({
                "id": entry["id"],
                "lang": entry.get("lang", "aze"),
                "url": f"{base_url}/srt/{imdb_id}/{output_name}"
            })
            built_subtitles += 1

        endpoint = SITE / "subtitles" / "movie" / f"{imdb_id}.json"
        endpoint.write_text(
            json.dumps({"subtitles": results}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        built_movies += 1

    index = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AZ Subtitles for Stremio</title>
</head>
<body>
  <h1>AZ Subtitles</h1>
  <p>Curated Azerbaijani subtitles for Stremio.</p>
  <p>Manifest: <code>{base_url}/manifest.json</code></p>
  <p>Movies currently configured: {built_movies}</p>
</body>
</html>
"""
    (SITE / "index.html").write_text(index, encoding="utf-8")

    print(f"Built {built_movies} movie(s), {built_subtitles} subtitle file(s)")
    print(f"Manifest: {base_url}/manifest.json")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", help="Override public base URL")
    args = parser.parse_args()
    base = (args.base_url or infer_base_url()).rstrip("/")
    build(base)

if __name__ == "__main__":
    main()

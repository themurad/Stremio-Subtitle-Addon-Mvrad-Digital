#!/usr/bin/env python3
from pathlib import Path
import argparse
import json
import re
import shutil

ROOT = Path(__file__).resolve().parent
DB = ROOT / "data" / "movies.json"
SOURCE_DIR = ROOT / "source_srt"

def main():
    p = argparse.ArgumentParser(description="Add/update one Azerbaijani movie subtitle.")
    p.add_argument("imdb_id", help="IMDb ID, e.g. tt37287335")
    p.add_argument("title", help='Movie title, e.g. "Obsession (2025)"')
    p.add_argument("srt", help="Path to Azerbaijani .srt")
    p.add_argument("--id", default="aze-main", help="Unique subtitle ID")
    p.add_argument("--lang", default="aze", help="Stremio language code")
    p.add_argument("--offset-ms", type=int, default=0,
                   help="Shift all cues. Positive = later; negative = earlier.")
    args = p.parse_args()

    if not re.fullmatch(r"tt\d+", args.imdb_id):
        raise SystemExit("IMDb ID must look like tt1234567")

    src = Path(args.srt)
    if not src.exists():
        raise SystemExit(f"File not found: {src}")
    if src.suffix.lower() != ".srt":
        raise SystemExit("Please provide an .srt file")

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = re.sub(r"[^A-Za-z0-9._-]+", ".", src.name)
    copied = SOURCE_DIR / f"{args.imdb_id}.{safe_name}"
    shutil.copy2(src, copied)

    db = json.loads(DB.read_text(encoding="utf-8"))
    rel = copied.relative_to(ROOT).as_posix()

    db[args.imdb_id] = {
        "title": args.title,
        "type": "movie",
        "subtitles": [{
            "id": args.id,
            "lang": args.lang,
            "source": rel,
            "output_name": copied.name,
            "offset_ms": args.offset_ms
        }]
    }

    DB.write_text(json.dumps(db, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Added {args.title} ({args.imdb_id})")
    print(f"Saved subtitle to {rel}")
    print("Commit/push the changes to GitHub. Pages will rebuild automatically.")

if __name__ == "__main__":
    main()

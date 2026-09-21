"""Vectorize existing light-theme hint images with the Recraft API.

Converts data/images/{level}/light/{category}/png/{file}.png into
data/images/{level}/light/{category}/svg/{file}.svg: first Recraft's
vectorize endpoint, then its removeBackground endpoint on the resulting svg
so the picture sits on a transparent background instead of the pale one the
prompt asked for (see tools/images/data/{level}/style.json). Dark mode does
not get its own svg: the app inverts this one at runtime. This never
generates new pictures, only redraws pngs already produced by generate.py.
Same --level/--category hierarchy as generate.py.

    export RECRAFT_API_KEY=...
    python3 tools/images/vectorize.py                              # every png
    python3 tools/images/vectorize.py --level=n5                   # one level
    python3 tools/images/vectorize.py --level=n5 --category=numbers,nature
    python3 tools/images/vectorize.py --category=numbers           # error: no level given
    python3 tools/images/vectorize.py --all                        # redo svgs that already exist
    python3 tools/images/vectorize.py --dry-run
"""

import argparse
import os
import sys
import time

import requests

from generate import png_dir, plan, svg_dir, words

VECTORIZE_API = "https://external.api.recraft.ai/v1/images/vectorize"
REMOVE_BACKGROUND_API = "https://external.api.recraft.ai/v1/images/removeBackground"


def call(api, filename, content_type, data, session):
    for attempt in range(4):
        r = session.post(api, files={"file": (filename, data, content_type)}, timeout=180)
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 3:
            time.sleep(5 * 2**attempt)  # ponytail: fixed backoff, honour Retry-After if rate limits bite
            continue
        r.raise_for_status()
        url = r.json()["image"]["url"]
        return session.get(url, timeout=180).content
    raise RuntimeError("unreachable")


def vectorize(png_path, session):
    svg = call(VECTORIZE_API, png_path.name, "image/png", png_path.read_bytes(), session)
    return call(REMOVE_BACKGROUND_API, "image.svg", "image/svg+xml", svg, session)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--level", metavar="LEVEL", help="only this level, e.g. n5")
    ap.add_argument("--category", metavar="CAT[,CAT...]", help="only these categories; requires --level")
    ap.add_argument("--all", action="store_true", help="redo svgs that already exist")
    ap.add_argument("--dry-run", action="store_true", help="print the pngs that would be sent, call nothing")
    ap.add_argument("--limit", type=int, help="stop after N images")
    args = ap.parse_args()

    todo = []
    for level, category in plan(args):
        light_png = png_dir(level, category, "light")
        light_svg = svg_dir(level, category)
        for w in words(level, category):
            png_path = light_png / w["file"]
            svg_path = light_svg / (png_path.stem + ".svg")
            if not png_path.exists():
                continue
            if svg_path.exists() and not args.all:
                continue
            todo.append((level, category, png_path, svg_path))
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for level, category, png_path, svg_path in todo:
            print(f"{level}/{category}: {png_path.name} -> {svg_path.name}")
        return
    if not todo:
        print("nothing to do")
        return
    if not (key := os.environ.get("RECRAFT_API_KEY")):
        sys.exit("RECRAFT_API_KEY is not set")

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {key}"
    print(f"{len(todo)} image(s)")
    for i, (level, category, png_path, svg_path) in enumerate(todo, 1):
        svg_path.parent.mkdir(parents=True, exist_ok=True)
        svg_path.write_bytes(vectorize(png_path, session))
        print(f"[{i}/{len(todo)}] {level}/{category}/{svg_path.name}")


if __name__ == "__main__":
    main()

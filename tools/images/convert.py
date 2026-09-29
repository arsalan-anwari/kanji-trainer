#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2", "opencv-python-headless>=4.10", "pillow>=11", "rich>=13"]
# ///
"""Turn each png of a pack into the 512 px transparent WebP the app loads.

The paper is taken out first, at full size (transform.py), then the picture is
scaled down. The png is deleted once its WebP is written. Same
--pack/--category/--all flags and skiplist handling as generate.py: by default
only pictures not yet judged good are converted, which is what a fresh generate
run produced.

    scripts/convert_images.sh --all                        # every png of every pack
    scripts/convert_images.sh --pack=n5-base --category=numbers
    scripts/convert_images.sh --dry-run
"""

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import console, track
from generate import add_filters, plan, png_dir, skiplist, words
from transform import ALPHA_QUALITY, QUALITY, transform

SIZE = 512


def convert(png, webp):
    with Image.open(png) as image:
        rgba = Image.fromarray(transform(np.asarray(image.convert("RGB"))), "RGBA")
    rgba.resize((SIZE, SIZE), Image.LANCZOS).save(webp, "WEBP", quality=QUALITY, alpha_quality=ALPHA_QUALITY, method=6)
    png.unlink()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_filters(ap, "convert every png, ignoring the skiplists")
    args = ap.parse_args()

    todo = []
    for pack, category in plan(args):
        skip = set() if args.all else skiplist(pack, category)
        for w in words(pack, category):
            if w["file"] in skip:
                continue
            png = png_dir(pack, category, w["subcategory"]) / w["file"]
            if png.exists():
                todo.append((pack, category, w["subcategory"], png))
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for *_, png in todo:
            print(f"{png} -> {png.with_suffix('.webp')}")
        return
    if not todo:
        print("nothing to do")
        return

    before = after = 0
    for *_, png in track(todo, "converting", group=lambda item: item[:3]):
        webp = png.with_suffix(".webp")
        before += png.stat().st_size
        convert(png, webp)
        after += webp.stat().st_size
    console.print(f"[bold green]done:[/] {len(todo)} png, {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB of webp")


if __name__ == "__main__":
    main()

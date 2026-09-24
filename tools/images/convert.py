"""Turn each light and dark png of a pack into the 512 px WebP the app loads.

The png is deleted once its WebP is written. Same --pack/--category/--all flags
and skiplist handling as generate.py: by default only pictures not yet judged
good are converted, which is what a fresh generate/invert run produced.

    python3 tools/images/convert.py --all                        # every png of every pack
    python3 tools/images/convert.py --pack=n5-base --category=numbers
    python3 tools/images/convert.py --dry-run
"""

import argparse

from PIL import Image

from generate import add_filters, plan, png_dir, skiplist, words

SIZE = 512
QUALITY = 80


def convert(png, webp):
    with Image.open(png) as image:
        image.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS).save(webp, "WEBP", quality=QUALITY, method=6)
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
            for theme in ("light", "dark"):
                png = png_dir(pack, category, w["subcategory"], theme) / w["file"]
                if png.exists():
                    todo.append((pack, theme, png))
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for pack, theme, png in todo:
            print(f"{pack}/{theme}: {png.name} -> {png.with_suffix('.webp').name}")
        return
    if not todo:
        print("nothing to do")
        return

    before = after = 0
    for i, (pack, theme, png) in enumerate(todo, 1):
        webp = png.with_suffix(".webp")
        before += png.stat().st_size
        convert(png, webp)
        after += webp.stat().st_size
        print(f"[{i}/{len(todo)}] {pack}/{theme}/{webp.name}")
    print(f"{before / 1e6:.1f} MB of png -> {after / 1e6:.1f} MB of webp")


if __name__ == "__main__":
    main()

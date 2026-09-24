"""Derive the dark-theme png variant from each light-theme png.

Converts data/packs/{pack}/images/light/{category}/{subcategory}/{file}.png into
data/packs/{pack}/images/dark/{category}/{subcategory}/{file}.png with a hue-preserving
invert: RGB invert followed by a 180 degree hue rotation, the same
"smart invert" a browser does for `filter: invert(1) hue-rotate(180deg)`.
A pale background goes dark and dark linework goes light while each color
keeps its hue, rather than the color-shifting mess a plain RGB invert gives
you (red would come out cyan). Runs entirely locally: no API, no cost.

Same --pack/--category hierarchy as generate.py. A dark picture counts as
existing in either format, so a converted WebP is not redone from nothing.

    python3 tools/images/invert.py                              # every png
    python3 tools/images/invert.py --pack=n5-base               # one pack
    python3 tools/images/invert.py --pack=n5-base --category=numbers,nature
    python3 tools/images/invert.py --category=numbers           # error: no pack given
    python3 tools/images/invert.py --all                        # redo darks that already exist
    python3 tools/images/invert.py --dry-run
"""

import argparse

from PIL import Image, ImageOps

from generate import add_filters, plan, png_dir, words


def smart_invert(image):
    image = image.convert("RGBA")
    r, g, b, a = image.split()
    inverted = ImageOps.invert(Image.merge("RGB", (r, g, b)))
    h, s, v = inverted.convert("HSV").split()
    h = h.point(lambda x: (x + 128) % 256)
    rotated = Image.merge("HSV", (h, s, v)).convert("RGB")
    r2, g2, b2 = rotated.split()
    return Image.merge("RGBA", (r2, g2, b2, a))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_filters(ap, "redo dark pngs that already exist")
    args = ap.parse_args()

    todo = []
    for pack, category in plan(args):
        for w in words(pack, category):
            subcategory = w["subcategory"]
            light_path = png_dir(pack, category, subcategory, "light") / w["file"]
            dark_path = png_dir(pack, category, subcategory, "dark") / w["file"]
            if not light_path.exists():
                continue
            if (dark_path.exists() or dark_path.with_suffix(".webp").exists()) and not args.all:
                continue
            todo.append((pack, category, light_path, dark_path))
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for pack, category, light_path, dark_path in todo:
            print(f"{light_path} -> {dark_path}")
        return
    if not todo:
        print("nothing to do")
        return

    print(f"{len(todo)} image(s)")
    for i, (pack, category, light_path, dark_path) in enumerate(todo, 1):
        dark_path.parent.mkdir(parents=True, exist_ok=True)
        smart_invert(Image.open(light_path)).save(dark_path)
        print(f"[{i}/{len(todo)}] {dark_path}")


if __name__ == "__main__":
    main()

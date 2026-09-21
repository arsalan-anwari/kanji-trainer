"""Derive the dark-theme png variant from each light-theme png.

Converts data/images/{level}/light/{category}/png/{file}.png into
data/images/{level}/dark/{category}/png/{file}.png with a hue-preserving
invert: RGB invert followed by a 180 degree hue rotation, the same
"smart invert" a browser does for `filter: invert(1) hue-rotate(180deg)`.
A pale background goes dark and dark linework goes light while each color
keeps its hue, rather than the color-shifting mess a plain RGB invert gives
you (red would come out cyan). Runs entirely locally: no API, no cost.

Same --level/--category hierarchy as generate.py and vectorize.py.

    python3 tools/images/invert.py                              # every png
    python3 tools/images/invert.py --level=n5                   # one level
    python3 tools/images/invert.py --level=n5 --category=numbers,nature
    python3 tools/images/invert.py --category=numbers           # error: no level given
    python3 tools/images/invert.py --all                        # redo darks that already exist
    python3 tools/images/invert.py --dry-run
"""

import argparse

from PIL import Image, ImageOps

from generate import plan, png_dir, words


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
    ap.add_argument("--level", metavar="LEVEL", help="only this level, e.g. n5")
    ap.add_argument("--category", metavar="CAT[,CAT...]", help="only these categories; requires --level")
    ap.add_argument("--all", action="store_true", help="redo dark pngs that already exist")
    ap.add_argument("--dry-run", action="store_true", help="print the pngs that would be inverted, do nothing")
    ap.add_argument("--limit", type=int, help="stop after N images")
    args = ap.parse_args()

    todo = []
    for level, category in plan(args):
        light_dir = png_dir(level, category, "light")
        dark_dir = png_dir(level, category, "dark")
        for w in words(level, category):
            light_path = light_dir / w["file"]
            dark_path = dark_dir / w["file"]
            if not light_path.exists():
                continue
            if dark_path.exists() and not args.all:
                continue
            todo.append((level, category, light_path, dark_path))
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for level, category, light_path, dark_path in todo:
            print(f"{level}/{category}: {light_path.name} -> dark/{dark_path.name}")
        return
    if not todo:
        print("nothing to do")
        return

    print(f"{len(todo)} image(s)")
    for i, (level, category, light_path, dark_path) in enumerate(todo, 1):
        dark_path.parent.mkdir(parents=True, exist_ok=True)
        smart_invert(Image.open(light_path)).save(dark_path)
        print(f"[{i}/{len(todo)}] {level}/{category}/{dark_path.name}")


if __name__ == "__main__":
    main()

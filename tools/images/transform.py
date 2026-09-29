#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=2", "opencv-python-headless>=4.10", "pillow>=11", "rich>=13"]
# ///
"""Take the paper out of each pack picture: a transparent WebP of the ink alone.

The pictures are ink on a photographed sheet: an off-white with grain, a warm
cast and a shadow across it, and that same off-white inside faces, aprons and
highlights. No mask can tell the two apart, so none is cut:

1. the paper colour is estimated from the bright pixels alone, blurred across
   the drawing, so large black areas cannot drag it down, and divided out:
   paper becomes pure white, shadow and cast gone;
2. levels clip the grain to white and the deepest ink to black, keeping the
   greys in between;
3. white becomes transparency (GIMP's colour to alpha): a pixel's alpha is how
   far it is from white, its colour the ink that gives it back when laid on
   white. The drawing's own antialiasing becomes the soft edge.

White inside a drawing turns transparent too, which reads right on any light
surface; the dark themes put the picture on a light plate (.picture-plate in
kaizen-ui's theme.css).

Same --pack/--category/--all flags and skiplist handling as generate.py: by
default only pictures not yet judged good are transformed. A picture that is
already transparent is always left alone, so a rerun changes nothing; the
originals stay on the Hugging Face dataset until the next upload. convert.py
runs the same step on every new png, before it scales it down.

    scripts/transform_images.sh --all                        # every picture of every pack
    scripts/transform_images.sh --pack=n5-base --category=numbers
    scripts/transform_images.sh --all --preview=tmp/preview  # before/after sheets, pictures untouched
    scripts/transform_images.sh --dry-run
    scripts/transform_images.sh --check                      # self-test on a synthetic picture
"""

import argparse
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import console, track
from generate import OUT, add_filters, plan, png_dir, skiplist, words

WHITE = 0.94  # share of the paper colour at and above which a pixel is paper: clips the grain
BLACK = 0.10  # share at and below which it is solid ink
SPREAD = 6  # blur radius of the paper estimate, in 1/64ths of the picture: larger follows the shadow less closely
QUALITY = 80
ALPHA_QUALITY = 50  # lossless alpha (100) doubles the files and takes seconds each; 50 looks the same
SCREEN = (249, 247, 241)  # --projector-screen, light theme
PLATE = (235, 231, 222)  # --picture-plate in kaizen-ui's theme.css, dark themes


def paper(rgb):
    """The paper colour under every pixel: a blur over the paper pixels alone.

    A masked blur (normalised convolution) only ever averages real paper, so a
    large black area is bridged by the paper around it; far from any paper it
    settles on the sheet's median colour.
    """
    small = cv2.resize(rgb, (64, 64), interpolation=cv2.INTER_AREA).astype(np.float32)
    light = small.mean(2)
    floor = 0.75 * np.percentile(light, 95)  # the darkest a shadowed corner of the sheet gets
    keep = light > floor
    for _ in range(3):  # re-estimate without the greys that sit below the paper
        weight = keep.astype(np.float32)
        median = np.median(small[keep], 0)
        sheet = (cv2.GaussianBlur(small * weight[..., None], (0, 0), SPREAD) + 1e-3 * median) / (
            cv2.GaussianBlur(weight, (0, 0), SPREAD)[..., None] + 1e-3
        )
        keep = (light > sheet.mean(2) - 12) & (light > floor)
    return np.maximum(cv2.resize(sheet, rgb.shape[1::-1], interpolation=cv2.INTER_CUBIC), 1)


def transform(rgb):
    """RGB uint8 array of ink on paper -> RGBA uint8 array of the ink alone."""
    level = np.clip((rgb / paper(rgb) - BLACK) / (WHITE - BLACK), 0, 1)
    alpha = 1 - level.min(2)
    ink = (level - (1 - alpha[..., None])) / np.maximum(alpha[..., None], 1e-3)
    return (np.dstack([np.clip(ink, 0, 1), alpha]) * 255).round().astype(np.uint8)


def transparent(path):
    with Image.open(path) as image:
        return image.mode == "RGBA"


def on(rgba, colour):
    alpha = rgba[..., 3:] / 255
    return (rgba[..., :3] * alpha + np.array(colour) * (1 - alpha)).round().astype(np.uint8)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    add_filters(ap, "transform every picture, ignoring the skiplists")
    ap.add_argument("--preview", metavar="DIR", type=Path, help="write before/after sheets to DIR, leave the pictures alone")
    args = ap.parse_args()

    todo, done = [], 0
    for pack, category in plan(args):
        skip = set() if args.all else skiplist(pack, category)
        for w in words(pack, category):
            webp = (png_dir(pack, category, w["subcategory"]) / w["file"]).with_suffix(".webp")
            if w["file"] in skip or not webp.exists():
                continue
            if transparent(webp):
                done += 1
            else:
                todo.append((pack, category, w["subcategory"], webp))
    if done:
        console.print(f"[cyan]↷ skipping {done} already transparent[/]")
    if args.limit:
        todo = todo[: args.limit]

    if args.dry_run:
        for *_, webp in todo:
            print(webp)
        return
    if not todo:
        print("nothing to do")
        return

    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
    for *_, webp in track(todo, "transforming", group=lambda item: item[:3]):
        with Image.open(webp) as image:
            rgb = np.asarray(image.convert("RGB"))
        rgba = transform(rgb)
        if args.preview:
            sheet = np.hstack([rgb, on(rgba, SCREEN), on(rgba, PLATE), on(rgba, (255, 255, 255))])
            Image.fromarray(sheet).save(args.preview / "_".join(webp.relative_to(OUT).with_suffix(".png").parts))
        else:
            Image.fromarray(rgba, "RGBA").save(webp, "WEBP", quality=QUALITY, alpha_quality=ALPHA_QUALITY, method=6)
    console.print(f"[bold green]done:[/] {len(todo)} picture(s)" + (f" previewed in {args.preview}" if args.preview else ""))


def check():
    # Paper with a shadow across it, a black bar, a grey bar and a red square.
    x = np.linspace(0, 1, 256)[None, :, None]
    sheet = (np.array([222, 219, 212]) * (1 - 0.15 * x) * np.ones((256, 256, 3))).round()
    sheet[40:60, 20:236] = 10
    sheet[100:120, 20:236] = sheet[100:120, 20:236] * 0.5
    sheet[160:220, 100:160] = [200, 60, 40]
    out = transform(sheet.astype(np.uint8)).astype(int)
    assert out[5:30, :, 3].max() == 0, "paper, shadow included, must be fully transparent"
    assert out[45:55, 30:226, 3].min() == 255 and out[45:55, 30:226, :3].max() == 0, "black ink must stay solid black"
    assert 100 < out[110, 128, 3] < 200 and np.ptp(out[110, 30:226, 3]) <= 3, "grey must stay one even grey"
    red = out[190, 130]
    assert red[3] > 200 and red[0] > 150 and red[1] < 60 and red[2] < 60, f"colour must survive, got {red}"
    print("ok")


if __name__ == "__main__":
    check() if "--check" in sys.argv else main()

"""Regenerate src-tauri/icons/icon.png: the shared plate with a single glyph on it.

The plate (rounded outline, cream fill, thin border) is inherited from Kana
Trainer and read back out of the existing icon, so only the glyph changes here.
Rerun `npx tauri icon src-tauri/icons/icon.png` afterwards to refresh the set.
"""

import pathlib

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ICON = pathlib.Path(__file__).resolve().parent.parent / "src-tauri" / "icons" / "icon.png"
FONT = "/usr/share/fonts/google-noto-sans-cjk-vf-fonts/NotoSansCJK-VF.ttc"
CHAR = "\u7df4"
CREAM = (247, 242, 231, 255)
INK = (29, 27, 23, 255)
SIZE = 512
FONT_SIZE = 232  # sized so the kanji reads at the same weight as Kana Trainer's あ
SS = 4  # supersample, for a clean glyph edge

im = Image.open(ICON).convert("RGBA")
# Wipe the old glyph; the plate, its border and the rounded outline stay untouched.
ImageDraw.Draw(im).rectangle((120, 120, 391, 391), fill=CREAM)

font = ImageFont.truetype(FONT, FONT_SIZE * SS, index=0)
font.set_variation_by_name(b"Bold")
layer = Image.new("L", (SIZE * SS, SIZE * SS), 0)
ImageDraw.Draw(layer).text((SIZE * SS // 2,) * 2, CHAR, font=font, fill=255, anchor="mm")

# Centre the glyph on its ink box rather than its em box, as the あ is.
ys, xs = np.nonzero(np.array(layer) > 128)
dx = (SIZE * SS - 1) / 2 - (xs.min() + xs.max()) / 2
dy = (SIZE * SS - 1) / 2 - (ys.min() + ys.max()) / 2
layer = layer.transform(layer.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy), Image.BILINEAR)

im.paste(Image.new("RGBA", (SIZE, SIZE), INK), (0, 0), layer.resize((SIZE, SIZE), Image.LANCZOS))
im.save(ICON)
print(f"wrote {ICON}")

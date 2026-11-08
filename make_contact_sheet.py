"""
Assembles verify_cones renders into a 4×2 contact sheet.
Run with plain Python (requires Pillow).
"""
import pathlib, sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("pip install Pillow")
    sys.exit(1)

CONE_DIR = pathlib.Path(__file__).parent / "meshyout" / "verify_cones"
LABELS = ["SE","S","SW","W","NW","N","NE","E"]

imgs = []
for d in range(8):
    p = CONE_DIR / f"dir{d}_{LABELS[d]}.png"
    if not p.exists():
        print(f"Missing: {p}")
        sys.exit(1)
    imgs.append(Image.open(p).convert("RGBA"))

W, H = imgs[0].size
COLS, ROWS = 4, 2
PAD = 4
LABEL_H = 28

sheet = Image.new("RGBA", (COLS*(W+PAD)+PAD, ROWS*(H+PAD+LABEL_H)+PAD), (40,40,40,255))
draw = ImageDraw.Draw(sheet)

for i, (img, label) in enumerate(zip(imgs, LABELS)):
    col = i % COLS
    row = i // COLS
    x = PAD + col*(W+PAD)
    y = PAD + row*(H+PAD+LABEL_H)
    sheet.paste(img, (x, y))
    draw.text((x + W//2, y + H + 4), f"dir{i} {label}", fill=(255,255,100,255), anchor="mt")

out = CONE_DIR / "contact_sheet.png"
sheet.save(out)
print(f"Saved contact sheet: {out} ({sheet.width}×{sheet.height})")

"""
Contact sheet: 8 probe renders in a 4x2 grid with measured angles labelled.
"""
import pathlib
from PIL import Image, ImageDraw

CONE_DIR = pathlib.Path(__file__).parent / "meshyout" / "verify_cones3"
LABELS   = ["SE","S","SW","W","NW","N","NE","E"]
ANGLES   = [90.0, 28.8, 1.3, 334.1, 270.0, 205.9, 178.7, 151.2]

imgs = [Image.open(CONE_DIR / f"dir{d}_{LABELS[d]}.png").convert("RGBA") for d in range(8)]
W, H = imgs[0].size
COLS, ROWS = 4, 2; PAD = 4; LH = 30

sheet = Image.new("RGBA", (COLS*(W+PAD)+PAD, ROWS*(H+PAD+LH)+PAD), (30,30,30,255))
draw  = ImageDraw.Draw(sheet)
for i, (img, label, angle) in enumerate(zip(imgs, LABELS, ANGLES)):
    col, row = i % COLS, i // COLS
    x = PAD + col*(W+PAD); y = PAD + row*(H+PAD+LH)
    sheet.paste(img, (x, y))
    draw.text((x+W//2, y+H+4), f"dir{i} {label}  {angle}deg", fill=(255,255,100,255), anchor="mt")

out = CONE_DIR / "contact_sheet.png"
sheet.save(out)
print(f"Saved {out}")

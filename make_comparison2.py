"""
Side-by-side: Blender cone probe (left) vs in-game screenshot (right)
for each of 8 movement directions. 4 columns × 2 rows.
Left cell: probe render (cropped to 384x384 inner area, then scaled to CELL).
Right cell: game screenshot (cropped around character center).
"""
import pathlib
from PIL import Image, ImageDraw

ROOT     = pathlib.Path(__file__).parent
CONE_DIR = ROOT / "meshyout" / "verify_cones3"
GAME_DIR = ROOT / "game" / "pw_out" / "8dir"

MOVES  = [("E",0),("SE",7),("S",5),("SW",4),("W",4),("NW",3),("N",1),("NE",0)]
LABELS = ["SE","S","SW","W","NW","N","NE","E"]
ANGLES = [90.0, 28.8, 1.3, 334.1, 270.0, 205.9, 178.7, 151.2]

CELL = 240   # px per cell
PAD  = 4

items = []
for move_name, dir_idx in MOVES:
    cone = Image.open(CONE_DIR / f"dir{dir_idx}_{LABELS[dir_idx]}.png").convert("RGBA")
    game = Image.open(GAME_DIR / f"move_{move_name}_expect_dir{dir_idx}.png").convert("RGBA")

    cone = cone.resize((CELL, CELL), Image.LANCZOS)

    # Crop game screenshot around character center
    gw, gh = game.size
    cx, cy = gw // 2, int(gh * 0.42)
    half = CELL // 2
    l, t = max(0,cx-half), max(0,cy-half)
    r_, b_ = min(gw,cx+half), min(gh,cy+half)
    game_crop = game.crop((l, t, r_, b_)).resize((CELL, CELL), Image.LANCZOS)

    pair = Image.new("RGBA", (CELL*2+PAD*3, CELL+PAD*2+28), (25,25,25,255))
    pair.paste(cone, (PAD, PAD))
    pair.paste(game_crop, (PAD+CELL+PAD, PAD))
    draw = ImageDraw.Draw(pair)
    draw.text((PAD+CELL//2,     PAD+CELL+4), f"dir{dir_idx} {LABELS[dir_idx]} {ANGLES[dir_idx]}deg", fill=(255,255,100,255), anchor="mt")
    draw.text((PAD+CELL+PAD+CELL//2, PAD+CELL+4), f"move {move_name}", fill=(100,255,100,255), anchor="mt")
    items.append(pair)

PW, PH = items[0].size
COLS, ROWS = 4, 2
sheet = Image.new("RGBA", (COLS*PW+PAD, ROWS*PH+PAD), (15,15,15,255))
for i, item in enumerate(items):
    sheet.paste(item, (PAD//2 + (i%COLS)*PW, PAD//2 + (i//COLS)*PH))

out = ROOT / "meshyout" / "verify_cones3" / "comparison.png"
sheet.save(out)
print(f"Saved {out}  ({sheet.width}x{sheet.height})")

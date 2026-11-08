"""
Assembles a side-by-side comparison: for each movement direction,
Blender red-cone render (left) vs in-game screenshot (right).
Layout: 8 rows × 2 columns.
"""
import pathlib, sys
try:
    from PIL import Image, ImageDraw
except ImportError:
    print("pip install Pillow"); sys.exit(1)

ROOT      = pathlib.Path(__file__).parent
CONE_DIR  = ROOT / "meshyout" / "verify_cones"
GAME_DIR  = ROOT / "game" / "pw_out" / "8dir"

# movement direction → expected dir index (from compute_dir_angles.py)
MOVES = [
    ("E",  0), ("SE", 7), ("S",  5), ("SW", 4),
    ("W",  4), ("NW", 3), ("N",  1), ("NE", 0),
]
CONE_LABELS = ["SE","S","SW","W","NW","N","NE","E"]

COLS = 2   # Blender | Game
ROWS = len(MOVES)
CONE_H = 384
GAME_W, GAME_H = 210, 300  # crop game screenshot to character area

rows_imgs = []
for move_name, dir_idx in MOVES:
    cone_path = CONE_DIR / f"dir{dir_idx}_{CONE_LABELS[dir_idx]}.png"
    game_path = GAME_DIR / f"move_{move_name}_expect_dir{dir_idx}.png"

    cone = Image.open(cone_path).convert("RGBA").resize((CONE_H, CONE_H), Image.LANCZOS)
    game = Image.open(game_path).convert("RGBA")

    # Crop center strip of game screenshot (character is around center)
    gw, gh = game.size
    cx = gw // 2
    cy = int(gh * 0.45)
    half_w = GAME_W // 2
    half_h = GAME_H // 2
    game_crop = game.crop((cx - half_w, cy - half_h, cx + half_w, cy + half_h))
    game_crop = game_crop.resize((CONE_H, CONE_H), Image.LANCZOS)

    # Side by side
    pair = Image.new("RGBA", (CONE_H * 2 + 8, CONE_H + 32), (30, 30, 30, 255))
    pair.paste(cone, (0, 0))
    pair.paste(game_crop, (CONE_H + 8, 0))

    draw = ImageDraw.Draw(pair)
    draw.text((CONE_H // 2, CONE_H + 4),
              f"dir{dir_idx} ({CONE_LABELS[dir_idx]}) face",
              fill=(255,255,100,255), anchor="mt")
    draw.text((CONE_H + 8 + CONE_H // 2, CONE_H + 4),
              f"move {move_name}",
              fill=(100,255,100,255), anchor="mt")
    rows_imgs.append(pair)

pw, ph = rows_imgs[0].size
sheet = Image.new("RGBA", (pw, ph * ROWS), (20, 20, 20, 255))
for i, img in enumerate(rows_imgs):
    sheet.paste(img, (0, i * ph))

out = ROOT / "meshyout" / "verify_cones" / "comparison.png"
sheet.save(out)
print(f"Saved: {out} ({sheet.width}×{sheet.height})")

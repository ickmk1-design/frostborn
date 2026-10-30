"""
Frostborn — Sprite sheet packer
Assembles rendered frames into sprite sheets for all animations.

Layout per sheet:
  Rows    = 8 directions (dir0 = SE/front, clockwise)
  Columns = N frames of that animation

Output:
  meshyout/<char>/sheets/spritesheet_<anim>.png  + .json
  game/public/assets/sprites/<char>/spritesheet_<anim>.png  + .json

USAGE:
  py pack_sprites.py --character hero
  py pack_sprites.py --character worker_new
  py pack_sprites.py --character all
"""

import json, pathlib, argparse
from PIL import Image

ROOT   = pathlib.Path(__file__).parent
N_DIRS = 8
ANIMS  = ["walk", "idle", "chop", "carry_walk", "cheer"]

CHAR_CONFIGS = {
    "hero":       ROOT / "meshyout/hero",
    "worker_new": ROOT / "meshyout/worker_new",
}

def pack(char: str, char_dir: pathlib.Path, anim: str):
    src = char_dir / "frames" / anim
    if not src.exists():
        print(f"  SKIP {char}/{anim}: frames not found")
        return

    frames_by_dir: dict[int, list[pathlib.Path]] = {}
    for p in sorted(src.glob("dir*.png")):
        parts = p.stem.split("_")
        d = int(parts[0].replace("dir", ""))
        frames_by_dir.setdefault(d, []).append(p)

    if not frames_by_dir:
        print(f"  SKIP {char}/{anim}: no frames in {src}")
        return

    n_frames = min(len(v) for v in frames_by_dir.values())
    print(f"  {char}/{anim}: {len(frames_by_dir)} dirs × {n_frames} frames", end=" ... ", flush=True)

    sample = Image.open(frames_by_dir[0][0])
    FW, FH = sample.size

    sheet_w = FW * n_frames
    sheet_h = FH * N_DIRS
    sheet   = Image.new("RGBA", (sheet_w, sheet_h), (0, 0, 0, 0))

    meta = {
        "character": char,
        "anim":      anim,
        "frameW":    FW,
        "frameH":    FH,
        "nDirs":     N_DIRS,
        "nFrames":   n_frames,
        "dirLabels": ["SE", "S", "SW", "W", "NW", "N", "NE", "E"],
    }

    for dir_idx in range(N_DIRS):
        dir_frames = frames_by_dir.get(dir_idx, [])
        for fi in range(n_frames):
            img = Image.open(dir_frames[fi]).convert("RGBA") if fi < len(dir_frames) \
                  else Image.new("RGBA", (FW, FH), (0, 0, 0, 0))
            if img.size != (FW, FH):
                img = img.resize((FW, FH), Image.LANCZOS)
            sheet.paste(img, (fi * FW, dir_idx * FH))

    # Save to meshyout/<char>/sheets/
    sheets_dir = char_dir / "sheets"
    sheets_dir.mkdir(parents=True, exist_ok=True)
    out_png  = sheets_dir / f"spritesheet_{anim}.png"
    out_json = sheets_dir / f"spritesheet_{anim}.json"
    sheet.save(out_png, "PNG")
    out_json.write_text(json.dumps(meta, indent=2))
    kb = out_png.stat().st_size // 1024
    print(f"{sheet_w}×{sheet_h}px, {kb} KB")

    # Also copy to game/public/assets/sprites/<char>/
    game_dir = ROOT / "game/public/assets/sprites" / char
    game_dir.mkdir(parents=True, exist_ok=True)
    import shutil
    shutil.copy(out_png,  game_dir / out_png.name)
    shutil.copy(out_json, game_dir / out_json.name)
    print(f"    -> {game_dir / out_png.name}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--character", choices=["hero", "worker_new", "all"], default="all")
    args = parser.parse_args()

    chars = list(CHAR_CONFIGS.keys()) if args.character == "all" else [args.character]

    for char in chars:
        print(f"\n=== {char} ===")
        for anim in ANIMS:
            pack(char, CHAR_CONFIGS[char], anim)

    print("\nDone.")

if __name__ == "__main__":
    main()

"""
Frostborn — Sprite atlas optimizer
Resamples frames, trims transparency, packs into 4096×4096 WebP atlases.

Input:  meshyout/<char>/frames/<anim>/dir<DD>_f<FFF>.png
Output: game/public/assets/sprites/<out_folder>/
  atlas_<n>.webp   (primary)
  atlas_<n>.png    (PNG fallback)
  atlas.json       (Phaser multi-atlas JSON)

USAGE:
  py optimize_sprites.py --character hero
  py optimize_sprites.py --character worker_new
  py optimize_sprites.py --character all
"""

import json, pathlib, argparse
from PIL import Image

ROOT     = pathlib.Path(__file__).parent
MAX_SIZE = 4096
PAD      = 2
FRAME_SRC = 192   # source frame dimensions
N_DIRS   = 8

# Target frame counts per animation (resampled from full renders)
TARGET_FRAMES = {
    'walk':       12,
    'idle':       24,
    'chop':       16,
    'carry_walk': 12,
    'cheer':      12,
}
ANIMS = list(TARGET_FRAMES.keys())

# (game_key, frames_dir, out_dir)
CHAR_CONFIGS = {
    'hero': (
        'hero',
        ROOT / 'meshyout/hero',
        ROOT / 'game/public/assets/sprites/hero',
    ),
    'worker_new': (
        'worker',
        ROOT / 'meshyout/worker_new',
        ROOT / 'game/public/assets/sprites/worker_new',
    ),
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def resample_indices(total: int, target: int) -> list[int]:
    """Return `target` evenly-spaced indices spanning [0, total-1]."""
    if total <= target:
        return list(range(total))
    return [round(i * (total - 1) / (target - 1)) for i in range(target)]


def trim_alpha(img: Image.Image, pad: int = 2):
    """
    Crop to bounding box of non-transparent pixels (with `pad` pixel margin).
    Returns (cropped_img, src_x, src_y) — offset within the original frame.
    """
    bbox = img.getbbox()
    if bbox is None:
        return img.crop((0, 0, 4, 4)), 0, 0
    x0 = max(0, bbox[0] - pad)
    y0 = max(0, bbox[1] - pad)
    x1 = min(img.width,  bbox[2] + pad)
    y1 = min(img.height, bbox[3] + pad)
    return img.crop((x0, y0, x1, y1)), x0, y0


# ── Collect ────────────────────────────────────────────────────────────────────

def collect(game_key: str, frames_dir: pathlib.Path) -> list[tuple]:
    """
    Load, resample, and trim all animation frames.
    Returns list of (name, cropped_img, src_x, src_y) tuples.
    """
    entries = []
    for anim in ANIMS:
        target = TARGET_FRAMES[anim]
        src = frames_dir / 'frames' / anim
        if not src.exists():
            print(f'  SKIP {game_key}/{anim}: frames not found')
            continue

        actual_total = 0
        for d in range(N_DIRS):
            dir_frames = sorted(src.glob(f'dir{d:02d}_*.png'))
            if not dir_frames:
                print(f'  SKIP {game_key}/{anim}/dir{d}: no frames')
                continue
            actual_total = max(actual_total, len(dir_frames))

            indices = resample_indices(len(dir_frames), target)
            for fi, src_idx in enumerate(indices):
                img = Image.open(dir_frames[src_idx]).convert('RGBA')
                cropped, sx, sy = trim_alpha(img)
                name = f'{game_key}_{anim}_d{d}_f{fi}'
                entries.append((name, cropped, sx, sy))

        print(f'  {game_key}/{anim}: {actual_total} -> {target} frames/dir')

    print(f'  Total sprites to pack: {len(entries)}')
    return entries


# ── Pack ───────────────────────────────────────────────────────────────────────

def pack(entries: list[tuple]) -> list[list[tuple]]:
    """
    Shelf-first bin packer. Sprites sorted by height desc for better utilisation.
    Returns list of pages; each page = list of (name, img, px, py, sx, sy).
    """
    # Sort by height descending (better row fill), keep original name for tracing
    by_height = sorted(entries, key=lambda e: -e[1].height)

    pages: list[list] = []
    cur: list = []
    cx = PAD
    cy = PAD
    row_h = 0

    for name, img, sx, sy in by_height:
        w, h = img.size

        if cx + w + PAD > MAX_SIZE:   # new row
            cx = PAD
            cy += row_h + PAD
            row_h = 0

        if cy + h + PAD > MAX_SIZE:   # new page
            pages.append(cur)
            cur = []
            cx = PAD
            cy = PAD
            row_h = 0

        cur.append((name, img, cx, cy, sx, sy))
        cx += w + PAD
        row_h = max(row_h, h)

    if cur:
        pages.append(cur)
    return pages


# ── Render & save ──────────────────────────────────────────────────────────────

def render_page(page: list[tuple]) -> tuple[Image.Image, int, int]:
    """Composite sprites onto an RGBA canvas; return (canvas, used_w, used_h)."""
    max_x = max_y = 0
    for _, img, px, py, _, _ in page:
        max_x = max(max_x, px + img.width)
        max_y = max(max_y, py + img.height)

    used_w = min(MAX_SIZE, max_x + PAD)
    used_h = min(MAX_SIZE, max_y + PAD)
    canvas = Image.new('RGBA', (used_w, used_h), (0, 0, 0, 0))
    for _, img, px, py, _, _ in page:
        canvas.paste(img, (px, py))
    return canvas, used_w, used_h


def build_json(pages_meta: list[tuple]) -> dict:
    """Build Phaser multi-atlas JSON from packed page metadata."""
    textures = []
    for page_idx, (page, used_w, used_h) in enumerate(pages_meta):
        frames = []
        for name, img, px, py, sx, sy in page:
            fw, fh = img.size
            frames.append({
                'filename': name,
                'rotated':  False,
                'trimmed':  True,
                'sourceSize':       {'w': FRAME_SRC, 'h': FRAME_SRC},
                'spriteSourceSize': {'x': sx, 'y': sy, 'w': fw, 'h': fh},
                'frame':            {'x': px, 'y': py, 'w': fw, 'h': fh},
            })
        textures.append({
            'image':  f'atlas_{page_idx}.webp',
            'format': 'RGBA8888',
            'size':   {'w': used_w, 'h': used_h},
            'scale':  1,
            'frames': frames,
        })
    return {
        'textures': textures,
        'meta': {
            'app':     'Frostborn',
            'version': '1.0',
            'scale':   '1',
            'animFrameCounts': TARGET_FRAMES,  # convenience for GameScene
        },
    }


# ── Main ───────────────────────────────────────────────────────────────────────

def optimize(config_key: str) -> tuple[int, int]:
    game_key, frames_dir, out_dir = CHAR_CONFIGS[config_key]
    print(f'\n=== {config_key} (game key: {game_key}) ===')

    entries  = collect(game_key, frames_dir)
    pages    = pack(entries)
    out_dir.mkdir(parents=True, exist_ok=True)

    total_webp = total_png = 0
    pages_meta = []

    for idx, page in enumerate(pages):
        canvas, used_w, used_h = render_page(page)

        webp_path = out_dir / f'atlas_{idx}.webp'
        png_path  = out_dir / f'atlas_{idx}.png'

        canvas.save(str(webp_path), 'WEBP', quality=85, method=6)
        canvas.save(str(png_path),  'PNG',  compress_level=9)

        wb = webp_path.stat().st_size
        pb = png_path.stat().st_size
        total_webp += wb
        total_png  += pb

        fill = sum(img.width * img.height for _, img, *_ in page) / (used_w * used_h)
        print(f'  Page {idx}: {used_w}×{used_h}px | {len(page)} sprites | '
              f'fill {fill:.0%} | WebP {wb//1024}KB | PNG {pb//1024}KB')

        pages_meta.append((page, used_w, used_h))

    atlas_json = build_json(pages_meta)
    (out_dir / 'atlas.json').write_text(json.dumps(atlas_json, indent=2))
    print(f'  atlas.json written')

    return total_webp, total_png


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--character', choices=['hero', 'worker_new', 'all'], default='all')
    args = parser.parse_args()

    keys = list(CHAR_CONFIGS.keys()) if args.character == 'all' else [args.character]

    total_webp = total_png = 0
    for k in keys:
        wb, pb = optimize(k)
        total_webp += wb
        total_png  += pb

    print(f'\n{"="*50}')
    print(f'  Total WebP: {total_webp / 1024:.0f} KB  ({total_webp / 1024 / 1024:.2f} MB)')
    print(f'  Total PNG:  {total_png  / 1024:.0f} KB  ({total_png  / 1024 / 1024:.2f} MB)')
    print('Done.')


if __name__ == '__main__':
    main()

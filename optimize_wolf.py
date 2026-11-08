"""
Frostborn — Animal sprite atlas optimizer (wolf, bear, etc.)
Packs rendered frames into WebP + PNG atlases for Phaser multiatlas.

USAGE:
  py optimize_wolf.py --character wolf
  py optimize_wolf.py --character bear

Output: game/public/assets/sprites/<character>/atlas.json + atlas_N.webp + atlas_N.png
"""

import json, pathlib, argparse, shutil
from PIL import Image

ROOT     = pathlib.Path(__file__).parent
MAX_SIZE = 4096
PAD      = 2
FRAME_SRC = 192
N_DIRS   = 8

TARGET_FRAMES = {
    'walk':   12,
    'run':    10,
    'attack': 12,
    'hit':    8,
    'death':  14,
    'idle':   10,
}
ANIMS = list(TARGET_FRAMES.keys())


def resample_indices(total: int, target: int) -> list:
    if total <= target:
        return list(range(total))
    return [round(i * (total - 1) / (target - 1)) for i in range(target)]


def trim_alpha(img: Image.Image, pad: int = 2):
    bbox = img.getbbox()
    if bbox is None:
        return img.crop((0,0,4,4)), 0, 0
    x0 = max(0, bbox[0]-pad); y0 = max(0, bbox[1]-pad)
    x1 = min(img.width, bbox[2]+pad); y1 = min(img.height, bbox[3]+pad)
    return img.crop((x0,y0,x1,y1)), x0, y0


def collect(game_key: str, frames_dir: pathlib.Path) -> list:
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
                print(f'  SKIP {game_key}/{anim}/dir{d}: no frames'); continue
            actual_total = max(actual_total, len(dir_frames))
            indices = resample_indices(len(dir_frames), target)
            for fi, src_idx in enumerate(indices):
                img = Image.open(dir_frames[src_idx]).convert('RGBA')
                cropped, sx, sy = trim_alpha(img)
                entries.append((f'{game_key}_{anim}_d{d}_f{fi}', cropped, sx, sy))
        print(f'  {game_key}/{anim}: {actual_total} -> {target} frames/dir')
    print(f'  Total: {len(entries)} sprites')
    return entries


def pack_bin(entries: list) -> list:
    by_height = sorted(entries, key=lambda e: -e[1].height)
    pages, cur = [], []
    cx = cy = PAD; row_h = 0
    for name, img, sx, sy in by_height:
        w, h = img.size
        if cx + w + PAD > MAX_SIZE: cx = PAD; cy += row_h + PAD; row_h = 0
        if cy + h + PAD > MAX_SIZE: pages.append(cur); cur = []; cx = cy = PAD; row_h = 0
        cur.append((name, img, cx, cy, sx, sy)); cx += w + PAD; row_h = max(row_h, h)
    if cur: pages.append(cur)
    return pages


def render_page(page: list):
    max_x = max_y = 0
    for _,img,px,py,_,_ in page: max_x=max(max_x,px+img.width); max_y=max(max_y,py+img.height)
    uw = min(MAX_SIZE,max_x+PAD); uh = min(MAX_SIZE,max_y+PAD)
    canvas = Image.new('RGBA',(uw,uh),(0,0,0,0))
    for _,img,px,py,_,_ in page: canvas.paste(img,(px,py))
    return canvas, uw, uh


def build_json(game_key: str, pages_meta: list) -> dict:
    textures = []
    for idx,(page,uw,uh) in enumerate(pages_meta):
        frames = []
        for name,img,px,py,sx,sy in page:
            fw,fh = img.size
            frames.append({'filename':name,'rotated':False,'trimmed':True,
                'sourceSize':{'w':FRAME_SRC,'h':FRAME_SRC},
                'spriteSourceSize':{'x':sx,'y':sy,'w':fw,'h':fh},
                'frame':{'x':px,'y':py,'w':fw,'h':fh}})
        textures.append({'image':f'atlas_{idx}.webp','format':'RGBA8888',
            'size':{'w':uw,'h':uh},'scale':1,'frames':frames})
    return {'textures':textures,'meta':{'app':'Frostborn','version':'1.0','scale':'1',
        'animFrameCounts':TARGET_FRAMES}}


def optimize(character: str):
    game_key   = character  # atlas frame names: wolf_walk_d0_f0, bear_attack_d3_f2 …
    frames_dir = ROOT / 'meshyout' / character
    out_dir    = ROOT / 'game/public/assets/sprites' / character
    print(f'\n=== {character} ===')
    entries  = collect(game_key, frames_dir)
    if not entries: print('  Nothing to pack.'); return
    pages    = pack_bin(entries)
    out_dir.mkdir(parents=True, exist_ok=True)
    pages_meta = []
    for idx, page in enumerate(pages):
        canvas,uw,uh = render_page(page)
        webp = out_dir / f'atlas_{idx}.webp'
        png  = out_dir / f'atlas_{idx}.png'
        canvas.save(str(webp),'WEBP',quality=85,method=6)
        canvas.save(str(png), 'PNG', compress_level=9)
        fill = sum(img.width*img.height for _,img,*_ in page)/(uw*uh)
        print(f'  Page {idx}: {uw}×{uh}  {len(page)} sprites  fill {fill:.0%}  '
              f'WebP {webp.stat().st_size//1024}KB  PNG {png.stat().st_size//1024}KB')
        pages_meta.append((page,uw,uh))
    (out_dir/'atlas.json').write_text(json.dumps(build_json(game_key,pages_meta),indent=2))
    print(f'  atlas.json -> {out_dir}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--character', default='wolf')
    args = parser.parse_args()
    optimize(args.character)
    print('\nDone.')

if __name__ == '__main__':
    main()

from PIL import Image
import numpy as np
from pathlib import Path

SRC = Path('C:/Users/ickmk/FrostbornGame/ad-refs/assets_v1')
OUT = Path('C:/Users/ickmk/Frostborn/game/public/assets')

MAPPING = [
    ('Karlı Dört Taş Kümesi.png',                    'prop_rock_cluster_01.png'),
    ('Kar Kaplı Stilize Çalı.png',                   'prop_snow_bush_01.png'),
    ('Kar Kaplı Alçak Poligonlu Kaya Platformu.png', 'prop_cliff_edge_01.png'),
]

def remove_white_bg(img):
    img = img.convert('RGBA')
    data = np.array(img, dtype=float)
    r, g, b, a = data[...,0], data[...,1], data[...,2], data[...,3]
    whiteness = (
        ((r.clip(230,255)-230)/25) *
        ((g.clip(230,255)-230)/25) *
        ((b.clip(230,255)-230)/25)
    )
    data[..., 3] = np.clip(a * (1 - whiteness), 0, 255)
    return Image.fromarray(data.clip(0,255).astype('uint8'), 'RGBA')

for src_name, dst_name in MAPPING:
    src = SRC / src_name
    img = Image.open(src)
    img = remove_white_bg(img)
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    side = max(w, h)
    square = Image.new('RGBA', (side, side), (0,0,0,0))
    square.paste(img, ((side-w)//2, (side-h)//2))
    square = square.resize((512, 512), Image.LANCZOS)
    out_path = OUT / dst_name
    square.save(out_path, 'PNG')
    print(f'  {src_name} -> {dst_name}  ({out_path.stat().st_size//1024} KB)')

print('Done.')

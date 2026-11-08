"""Generate 3 game assets with OpenAI gpt-image-1 — transparent background."""
import base64, io, urllib.request
from pathlib import Path
from openai import OpenAI
from PIL import Image
import numpy as np

client = OpenAI()
OUT = Path('C:/Users/ickmk/Frostborn/game/public/assets')
OUT.mkdir(exist_ok=True)

# Style to match the existing assets in the game (isometric, slightly cartoonish,
# clean lighting from upper-left — same look as the pine trees / buildings already in game)
STYLE = (
    "isometric 2.5D game prop sprite, mobile game art style matching classic tower defense, "
    "vibrant saturated colors, soft cel-shaded warm lighting from upper-left, clean crisp outlines, "
    "slightly cartoonish appealing style, winter arctic snowy theme, "
    "object centered on canvas, transparent background, 512x512 PNG"
)

ASSETS = [
    ('prop_snowy_rock_cluster',
     f"A compact cluster of 3 rounded grey boulders, tops dusted with thick white snow, "
     f"small icicles on the sides, warm grey stone color. {STYLE}"),
    ('prop_snow_bush_small',
     f"A single small round bush entirely covered in fluffy white snow forming a perfect dome mound, "
     f"a few dark green leaves peeking through at the base. {STYLE}"),
    ('prop_snowy_cliff_edge',
     f"A chunky L-shaped snowy cliff edge piece, grey rock face visible on the front and right sides, "
     f"thick snow layer on the top flat surface, icicles hanging from the bottom edge. {STYLE}"),
]

def remove_white_bg(img_rgba):
    """Replace near-white pixels with transparency."""
    data = np.array(img_rgba, dtype=float)
    r, g, b = data[...,0], data[...,1], data[...,2]
    # 0 = not white, 1 = pure white — smooth edge
    whiteness = ((r.clip(230,255)-230)/25) * ((g.clip(230,255)-230)/25) * ((b.clip(230,255)-230)/25)
    data[..., 3] = np.clip((1 - whiteness) * 255, 0, 255)
    return Image.fromarray(data.clip(0,255).astype('uint8'), 'RGBA')

for key, prompt in ASSETS:
    out_path = OUT / f'{key}.png'
    print(f'\nGenerating {key} ...')

    img_bytes = None

    # gpt-image-1 with explicit transparent background
    for attempt, kwargs in [
        ('gpt-image-1 transparent', dict(model='gpt-image-1', prompt=prompt, n=1,
                                          size='1024x1024', quality='high',
                                          background='transparent')),
        ('gpt-image-1 auto',        dict(model='gpt-image-1', prompt=prompt, n=1,
                                          size='1024x1024', quality='high')),
    ]:
        if img_bytes is not None:
            break
        try:
            response = client.images.generate(**kwargs)
            raw = response.data[0]
            if hasattr(raw, 'b64_json') and raw.b64_json:
                img_bytes = base64.b64decode(raw.b64_json)
            elif hasattr(raw, 'url') and raw.url:
                with urllib.request.urlopen(raw.url) as u:
                    img_bytes = u.read()
            print(f'  [{attempt}] ok  ({len(img_bytes)//1024} KB raw)')
        except Exception as e:
            print(f'  [{attempt}] failed: {e}')

    if img_bytes is None:
        print(f'  SKIPPED — no image bytes')
        continue

    img = Image.open(io.BytesIO(img_bytes)).convert('RGBA')

    # Check corner pixel — if fully opaque near-white, remove white bg
    cx, cy = 4, 4
    corner = img.getpixel((cx, cy))
    if corner[3] > 200 and corner[0] > 225 and corner[1] > 225 and corner[2] > 225:
        img = remove_white_bg(img)
        print(f'  White background removed')
    else:
        print(f'  Corner pixel: {corner[:3]} alpha={corner[3]} — bg looks transparent or dark, keeping as-is')

    # Resize to 512×512 (native assets are ~128–256 px display size but high-res source is fine)
    img = img.resize((512, 512), Image.LANCZOS)
    img.save(out_path, 'PNG')
    print(f'  Saved {out_path}  ({out_path.stat().st_size // 1024} KB)')

print('\nDone!')

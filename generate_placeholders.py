"""Generate placeholder isometric sprites for the missing assets using PIL."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math

OUT = Path('C:/Users/ickmk/Frostborn/game/public/assets')
OUT.mkdir(exist_ok=True)
S = 512  # canvas size

def new_canvas():
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))

def ellipse_gradient(draw, cx, cy, rx, ry, top_col, bot_col, alpha=255):
    for t in range(100, -1, -1):
        f = t / 100
        r = int(top_col[0]*f + bot_col[0]*(1-f))
        g = int(top_col[1]*f + bot_col[1]*(1-f))
        b = int(top_col[2]*f + bot_col[2]*(1-f))
        a = int(alpha * min(1, t/20 + 0.8))
        draw.ellipse([cx - rx*f, cy - ry*f, cx + rx*f, cy + ry*f], fill=(r,g,b,a))

# ── snowy rock cluster ────────────────────────────────────────────────────────
img = new_canvas(); d = ImageDraw.Draw(img)
rocks = [(200,310,110,80), (310,330,90,65), (255,260,130,95), (160,350,80,55)]
# shadows
for cx,cy,rx,ry in rocks:
    d.ellipse([cx-rx+10, cy-10, cx+rx+10, cy+30], fill=(40,45,60,90))
# rock bodies
for cx,cy,rx,ry in rocks:
    # dark base
    d.ellipse([cx-rx, cy-ry//3, cx+rx, cy+ry], fill=(90,88,98,255))
    # mid
    d.ellipse([cx-rx+5, cy-ry//3+2, cx+rx-5, cy+ry-4], fill=(110,106,118,255))
    # top highlight (grey)
    d.ellipse([cx-rx//2, cy-ry//3-2, cx+rx//2, cy+ry//4], fill=(140,136,148,255))
    # snow cap (white)
    d.ellipse([cx-rx//2+5, cy-ry//3-6, cx+rx//2-5, cy+ry//5], fill=(240,245,255,245))
img = img.filter(ImageFilter.SMOOTH)
img.save(OUT/'prop_snowy_rock_cluster.png', 'PNG')
print('  prop_snowy_rock_cluster.png')

# ── snow bush small ───────────────────────────────────────────────────────────
img = new_canvas(); d = ImageDraw.Draw(img)
# shadow ellipse
d.ellipse([140, 320, 370, 380], fill=(30,40,80,80))
# bush body — layered spheres for snow mound effect
layers = [(256,280,120,110),(230,270,80,75),(280,270,80,75),(256,230,90,85)]
for cx,cy,rx,ry in layers:
    d.ellipse([cx-rx, cy-ry, cx+rx, cy+ry], fill=(220,228,248,255))
# mid highlights
for cx,cy,rx,ry in layers:
    d.ellipse([cx-rx//2, cy-ry//2, cx+rx//2, cy], fill=(245,250,255,200))
# tiny shadow line under snow
d.ellipse([156,330, 356,370], fill=(160,175,210,100))
img = img.filter(ImageFilter.SMOOTH)
img.save(OUT/'prop_snow_bush_small.png', 'PNG')
print('  prop_snow_bush_small.png')

# ── snowy cliff edge ──────────────────────────────────────────────────────────
img = new_canvas(); d = ImageDraw.Draw(img)
# isometric cliff: dark front face, lighter top face
pts_front = [(130,320), (256,390), (382,320), (382,220), (256,290), (130,220)]
d.polygon(pts_front, fill=(80,76,88,255))
# front face lighter band
d.polygon([(130,320),(256,390),(256,290),(130,220)], fill=(95,90,105,255))
# top face (snow)
pts_top = [(130,220),(256,290),(382,220),(256,150)]
d.polygon(pts_top, fill=(220,232,248,255))
# snow edge highlight
d.polygon([(256,150),(382,220),(376,215),(256,144)], fill=(245,250,255,230))
# rock texture lines on front
d.line([(180,230),(220,255),(200,340)], fill=(65,62,72,180), width=2)
d.line([(300,225),(280,300),(320,345)], fill=(65,62,72,180), width=2)
img = img.filter(ImageFilter.SMOOTH)
img.save(OUT/'prop_snowy_cliff_edge.png', 'PNG')
print('  prop_snowy_cliff_edge.png')

# ── lantern post ──────────────────────────────────────────────────────────────
img = new_canvas(); d = ImageDraw.Draw(img)
# shadow on ground
d.ellipse([210,440,300,470], fill=(20,25,40,80))
# pole (brown wood)
pole_x = 248; pole_w = 16
d.rectangle([pole_x, 180, pole_x+pole_w, 455], fill=(100,65,30,255))
d.rectangle([pole_x+2, 182, pole_x+pole_w-2, 453], fill=(120,80,42,255))
# cross brace
d.rectangle([pole_x-20,350, pole_x+pole_w+20,358], fill=(90,58,25,255))
# lantern housing (iron-grey box)
lx,ly,lw,lh = 220,120,72,64
d.rectangle([lx,ly,lx+lw,ly+lh], fill=(55,55,65,255))
# warm glow fill inside
d.rectangle([lx+6,ly+6,lx+lw-6,ly+lh-6], fill=(255,160,40,220))
# glow blur
glow = Image.new('RGBA',(S,S),(0,0,0,0))
gd = ImageDraw.Draw(glow)
for r in range(50,0,-5):
    alpha = int(r*2)
    gd.ellipse([lx+lw//2-r, ly+lh//2-r, lx+lw//2+r, ly+lh//2+r], fill=(255,140,0,alpha))
glow = glow.filter(ImageFilter.GaussianBlur(12))
img = Image.alpha_composite(img, glow)
d2 = ImageDraw.Draw(img)
# lantern housing frame on top
d2.rectangle([lx,ly,lx+lw,ly+lh], outline=(65,65,78,255), width=4)
d2.line([(lx+lw//2,ly),(lx+lw//2,ly+lh)], fill=(65,65,78,200), width=2)
d2.line([(lx,ly+lh//2),(lx+lw,ly+lh//2)], fill=(65,65,78,200), width=2)
# snow on top of lantern
d2.ellipse([lx-6,ly-14,lx+lw+6,ly+10], fill=(225,235,250,230))
img = img.filter(ImageFilter.SMOOTH)
img.save(OUT/'prop_lantern_post_01.png', 'PNG')
print('  prop_lantern_post_01.png')

print('Done — 4 placeholder sprites saved.')

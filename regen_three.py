"""Regenerate 3 assets with updated family-friendly prompts (user review 2026-11-13)."""
import base64, os, time
from pathlib import Path
from openai import OpenAI

BASE   = Path(__file__).parent
OUT    = BASE / "game" / "public" / "assets" / "sprites" / "stations_v1"
MASTER = Path("C:/Users/ickmk/FrostbornGame/ad-refs/style_refs/master.png")
LOG    = BASE / "asset_gen.log"

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
STYLE = ("Match the art style of the attached reference image exactly. "
         "Single isolated object, isometric 3/4 top-down view, transparent "
         "background, no text, no ground plane. ")

PROMPTS = {
  # 1. Butcher: no hanging hook / frame (reads as gallows), no blood.
  "station_butcher_table_01":
    "A sturdy heavy wooden butcher block table on four thick legs, a shiny "
    "iron cleaver resting flat on top of the block (handle visible), two or "
    "three fresh raw red meat cuts stacked on the block, no hanging frame, "
    "no overhead structure, no hook, no blood, no drips, no pools, clean "
    "appearance, family-friendly.",
  # 2. Fish cleaning: no blood, knife lying flat (not stabbed), bucket of
  # water, scattered silver scales.
  "station_fish_cleaning_table_01":
    "A simple wooden cleaning table on four legs, one whole raw arctic "
    "trout lying flat on the table, a small iron filleting knife resting "
    "flat beside the fish with its blade on the table (not stuck in "
    "anything), a wooden bucket of water on the floor next to the table, "
    "a few scattered silver fish scales on the tabletop, no blood, no "
    "drips, clean appearance, family-friendly.",
  # 3. Lookout: match worker palette (blue parka, orange scarf, fur-trim
  # hood), bow, same scale as worker renders.
  "character_survivor_lookout_01":
    "A standing survivor figure in cold-weather gear, dark blue heavy "
    "parka jacket, bright orange scarf wrapped around the neck, fur-trim "
    "hooded hood pulled up, dark pants, boots. Holding a simple wooden "
    "bow at the ready with an arrow nocked, bow held to the side. Slight "
    "3/4 isometric view, standing upright, full-body visible, same realistic "
    "adult proportions as a standard worker sprite (not chibi, not big-headed).",
}

def gen(name, prompt):
    out = OUT / f"{name}.png"
    out.unlink(missing_ok=True)
    with open(MASTER, "rb") as f: master = f.read()
    try:
        resp = client.images.edit(
            model="gpt-image-1.5",
            image=[("master.png", master, "image/png")],
            prompt=STYLE + prompt,
            size="1024x1024",
            quality="medium",
            background="transparent",
        )
        png = base64.b64decode(resp.data[0].b64_json)
        out.write_bytes(png)
        with LOG.open("a") as lf:
            lf.write(f"{time.strftime('%H:%M:%S')} OK {name} (regen, {len(png)/1024:.0f} KB)\n")
        print(f"OK {name}")
    except Exception as e:
        with LOG.open("a") as lf:
            lf.write(f"{time.strftime('%H:%M:%S')} FAIL {name}: {e}\n")
        print(f"FAIL {name}: {e}")

for n, p in PROMPTS.items():
    gen(n, p)
print("done")

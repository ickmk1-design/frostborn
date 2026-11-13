"""
Generate new station/building/item assets in master.png style via gpt-image-1.
Writes to game/public/assets/sprites/<key>.png and records progress in
STATUS_asset_gen.log so a dying session can resume via `recover_run.py` style.

Run: OPENAI_API_KEY in env, then: python gen_new_stations.py
"""
import base64, json, os, sys, time
from pathlib import Path
from openai import OpenAI

BASE     = Path(__file__).parent
OUT_DIR  = BASE / "game" / "public" / "assets" / "sprites" / "stations_v1"
MASTER   = Path("C:/Users/ickmk/FrostbornGame/ad-refs/style_refs/master.png")
LOG      = BASE / "asset_gen.log"

OUT_DIR.mkdir(parents=True, exist_ok=True)
if not MASTER.exists():
    print(f"FATAL: master.png not found at {MASTER}"); sys.exit(1)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))
if not client.api_key:
    print("FATAL: OPENAI_API_KEY not set in env"); sys.exit(1)

# Each prompt follows the master.png style: isometric 3/4 top-down, single
# isolated object, transparent background, no text.
STYLE_PREFIX = (
    "Match the art style of the attached reference image exactly. "
    "Single isolated object, isometric 3/4 top-down view, transparent "
    "background, no text, no ground plane. "
)

ASSETS = {
    "station_ice_hole_01": "A circular hole drilled through thick blue ice, fishing-line stake planted next to it with a small bucket of bait, frosted edges, clear dark water visible in the hole.",
    "tile_pier_plank_01": "A square wooden pier/boardwalk tile, weathered brown planks with iron nail heads, snow dusted on top, 80x40 px iso tile proportions.",
    "tile_water_frozen_01": "A square tile of partially frozen water: dark blue-green water with scattered pale ice floes and cracks, iso tile proportions.",
    "resource_fish_raw_01": "A single raw silver-grey arctic trout on its side, slick wet scales, one visible fin, small.",
    "station_fish_cleaning_table_01": "A low wooden cleaning table with a stained cutting board, a fillet knife planted in it, a small drip bucket underneath.",
    "station_cook_pot_01": "A cast-iron cauldron on a stone ring with a small flame underneath, steam curling from the top, wooden ladle resting on the rim.",
    "station_lumber_mill_01": "A small lumber mill shed: a spinning circular saw blade visible through an open front, log feed chute on one side, plank output rack on the other, snow on the roof.",
    "resource_plank_01": "A small stack of three freshly cut wooden planks, light tan wood with darker grain, tied with twine.",
    "building_cabin_stage1_01": "The foundation stage of a log cabin: four corner stones placed on cleared ground, first base-layer logs being laid, construction ropes visible.",
    "building_cabin_stage2_01": "The walls-up stage of a log cabin: four corner stones with full timber log walls at waist height, no roof yet, visible wood joinery.",
    "building_cabin_finished_01": "A finished log cabin: horizontal timber walls, snow-covered pitched roof with chimney and small puff of smoke, one small window with warm interior glow, heavy wooden door.",
    "station_butcher_table_01": "A heavy wooden butcher table with a cleaver stuck in the surface, a meat hook hanging over it from a simple timber frame, fresh red meat scraps.",
    "station_meat_grinder_01": "A hand-cranked metal meat grinder on a short wooden stand: cylindrical body, large crank handle on one side, funnel feed on top, mince output tray.",
    "tile_conveyor_belt_01": "A single tile of a dark metal conveyor belt with rollers on each end and a textured rubber belt surface, iso tile proportions.",
    "resource_meat_chunk_01": "A single raw red meat chunk, roughly cubic, glistening and fresh.",
    "resource_meat_ground_01": "A small pile of ground red mince meat, textured and glistening.",
    "station_supply_sled_01": "A long wooden cargo sled with iron-shod runners, visible rope harness up front, open cargo bed with a tarpaulin folded back.",
    "tile_sled_dock_01": "A square boardwalk dock tile with heavy wheel tracks pressed into the snow, two iron tie-rings on the side, iso tile proportions.",
    "building_watchtower_01": "A tall wooden watchtower on four timber legs with a railed lookout platform at the top, small ladder climbing one side, snow-dusted shingle roof over the platform, 3-4 stories tall.",
    "character_survivor_lookout_01": "A standing survivor figure in cold-weather gear holding a primitive bow with an arrow nocked, looking down and to the side, isometric 3/4 view.",
    "projectile_arrow_01": "A single wooden arrow with a grey iron tip and brown fletching, lying horizontal.",
}

def gen(name: str, prompt: str) -> bool:
    out_path = OUT_DIR / f"{name}.png"
    if out_path.exists():
        print(f"SKIP {name} (exists)")
        return True
    full_prompt = STYLE_PREFIX + prompt
    with open(MASTER, "rb") as f:
        master_bytes = f.read()
    try:
        # Image edit with the master as a style reference.
        resp = client.images.edit(
            model="gpt-image-1.5",
            image=[("master.png", master_bytes, "image/png")],
            prompt=full_prompt,
            size="1024x1024",
            quality="medium",
            background="transparent",
        )
        b64 = resp.data[0].b64_json
        png = base64.b64decode(b64)
        out_path.write_bytes(png)
        with LOG.open("a") as lf:
            lf.write(f"{time.strftime('%H:%M:%S')} OK {name} ({len(png)/1024:.0f} KB)\n")
        print(f"OK   {name} ({len(png)/1024:.0f} KB)")
        return True
    except Exception as e:
        with LOG.open("a") as lf:
            lf.write(f"{time.strftime('%H:%M:%S')} FAIL {name}: {e}\n")
        print(f"FAIL {name}: {e}")
        return False

if __name__ == "__main__":
    LOG.write_text(f"{time.strftime('%Y-%m-%d %H:%M:%S')} start — {len(ASSETS)} assets\n")
    for name, prompt in ASSETS.items():
        gen(name, prompt)
    LOG.open("a").write(f"{time.strftime('%H:%M:%S')} done\n")
    print(f"Done. Output in: {OUT_DIR}")

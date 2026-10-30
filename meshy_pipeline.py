"""
Frostborn — Meshy character pipeline
image-to-3D → rig → walk (built-in) → idle (Animation API) → download GLBs

COST SUMMARY  (run with --dry-run to see without spending):
  image-to-3D + 2K texture  : 30 credits
  rigging                   :  0 credits
  idle animation (1 action) :  3 credits
  ─────────────────────────────────────────
  TOTAL                     : 33 credits

REQUIRED PLAN:
  Meshy Pro  $20 / month  → 1,000 credits
  (API keys unavailable on the free plan)
  Sign up at: https://app.meshy.ai/settings/api-keys
  Cancel after first month if you only need this one character.

USAGE:
  pip install requests python-dotenv pillow
  set MESHY_API_KEY=your_key_here   (or add to .env)
  py meshy_pipeline.py              (full run)
  py meshy_pipeline.py --dry-run    (print plan only, spend nothing)

OUTPUT:
  meshyout/character_model.glb       raw 3-D mesh
  meshyout/character_rigged.glb      rigged + walk animation baked in
  meshyout/character_idle.glb        idle animation applied
  meshyout/pipeline_ids.json         task IDs for resuming
"""

import os, sys, time, json, base64, math, pathlib, argparse
import requests
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(dotenv_path=pathlib.Path(r"C:\Users\ickmk\FrostbornGame\ad-refs\.env"), override=True)

MESHY_KEY  = os.getenv("MESHY_API_KEY", "")
BASE_URL   = "https://api.meshy.ai/openapi/v1"

# Resolved in main() after arg parsing
SOURCE_IMG = None
OUT_DIR    = None
IDS_FILE   = None

CHAR_CONFIGS = {
    "worker": {
        "img": "game/public/assets/character_survivor_worker_01.png",
        "out": "meshyout",
    },
    "hero": {
        "img": "game/public/assets/character_hero_01.png",
        "out": "meshyout/hero",
    },
    "worker_new": {
        "img": "game/public/assets/character_worker_01_new.png",
        "out": "meshyout/worker_new",
    },
}

HEADERS = lambda: {"Authorization": f"Bearer {MESHY_KEY}", "Content-Type": "application/json"}
POLL_INTERVAL = 6   # seconds between status checks
TIMEOUT_SEC   = 600 # 10-minute max per task

# ── Helpers ───────────────────────────────────────────────────────────────────

def check_key():
    if not MESHY_KEY:
        print("ERROR: MESHY_API_KEY not set.  Add it to your .env or environment.")
        sys.exit(1)

def post(path, payload):
    r = requests.post(f"{BASE_URL}{path}", headers=HEADERS(), json=payload)
    if not r.ok:
        print(f"  API error {r.status_code}: {r.text}")
    r.raise_for_status()
    return r.json()

def get(path):
    r = requests.get(f"{BASE_URL}{path}", headers=HEADERS())
    r.raise_for_status()
    return r.json()

def poll(path, label):
    """Poll a task until SUCCEEDED, return the completed task dict."""
    deadline = time.time() + TIMEOUT_SEC
    while time.time() < deadline:
        data = get(path)
        status = data.get("status", "?")
        pct    = data.get("progress", 0)
        print(f"  {label}: {status} {pct}%", end="\r", flush=True)
        if status == "SUCCEEDED":
            print(f"  {label}: SUCCEEDED          ")
            return data
        if status in ("FAILED", "CANCELED"):
            print(f"\nERROR: Task {label} {status}")
            print(json.dumps(data, indent=2))
            sys.exit(1)
        time.sleep(POLL_INTERVAL)
    print(f"\nERROR: Timeout waiting for {label}")
    sys.exit(1)

def download(url, dest: pathlib.Path):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        print(f"  (already exists) {dest.name}")
        return
    print(f"  Downloading -> {dest.name} ...", end=" ", flush=True)
    r = requests.get(url, stream=True)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(65536):
            f.write(chunk)
    kb = dest.stat().st_size // 1024
    print(f"{kb} KB")

def load_ids():
    if IDS_FILE.exists():
        return json.loads(IDS_FILE.read_text())
    return {}

def save_ids(ids):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    IDS_FILE.write_text(json.dumps(ids, indent=2))

def img_to_b64(path: pathlib.Path) -> str:
    data = path.read_bytes()
    b64  = base64.b64encode(data).decode()
    return f"data:image/png;base64,{b64}"

def _lib_items(data):
    """Normalize animation library response - may be list or {'result': [...]}."""
    if isinstance(data, list):
        return data
    return data.get("result", data.get("data", []))

def find_action_id(queries, require_word=None, reject_words=None):
    """Search animation library, return first matching action_id."""
    reject_words = reject_words or []
    for query in queries:
        data = get(f"/animations/library?category=BodyMovements&search={query}&page_size=20")
        for item in _lib_items(data):
            name = item.get("name", "").lower()
            if require_word and require_word not in name:
                continue
            if any(w in name for w in reject_words):
                continue
            print(f"  Found [{item['action_id']}] {item['name']}")
            return item["action_id"]
    # Fallback: dump first page and pick first item
    data = get("/animations/library?category=BodyMovements&page_size=5")
    items = _lib_items(data)
    if items:
        print(f"  Fallback [{items[0]['action_id']}] {items[0]['name']}")
        return items[0]["action_id"]
    raise RuntimeError(f"No animation found for queries: {queries}")

# ── Pipeline steps ─────────────────────────────────────────────────────────────

def step1_image_to_3d(ids, dry):
    if "i3d_task" in ids:
        print(f"[1] Image-to-3D: reusing {ids['i3d_task']}")
        return ids["i3d_task"]

    print("[1] Image-to-3D + 2K PBR texture  (30 credits)")
    if dry:
        print("    DRY RUN - skipping API call")
        return None

    payload = {
        "image_url":          img_to_b64(SOURCE_IMG),
        "ai_model":           "meshy-6",        # use Meshy-6 (30 credits at 2K)
        "should_texture":     True,
        "texture_resolution": "2k",
        "enable_pbr":         True,
        "pose_mode":          "a-pose",          # A-pose preferred for rigging
        "target_formats":     ["glb"],
        "origin_at":          "bottom",
        # Orientation note: Meshy requires character face → +Z for rigging.
        # A-pose + image-to-3D naturally produces +Z forward in output GLB.
    }
    resp = post("/image-to-3d", payload)
    task_id = resp["result"]
    print(f"    task_id = {task_id}")
    ids["i3d_task"] = task_id
    save_ids(ids)
    return task_id

def step2_poll_and_download_model(ids, task_id, dry):
    if dry or not task_id:
        return
    if (OUT_DIR / "character_model.glb").exists():
        print("[2] Model GLB already downloaded")
        return

    print("[2] Waiting for image-to-3D ...")
    data = poll(f"/image-to-3d/{task_id}", "image-to-3D")
    model_url = data.get("model_urls", {}).get("glb")
    if not model_url:
        print("ERROR: no GLB URL in response"); sys.exit(1)
    download(model_url, OUT_DIR / "character_model.glb")

def step2b_remesh(ids, dry):
    if "remesh_task" in ids:
        print(f"[2b] Remesh: reusing {ids['remesh_task']}")
        return ids["remesh_task"]

    print("[2b] Remesh to 200k faces  (0 credits) - required before rigging")
    if dry:
        print("    DRY RUN - skipping API call")
        return None

    payload = {
        "input_task_id":  ids["i3d_task"],
        "target_polycount": 200000,
        "resize_height":    1.7,
    }
    resp = post("/remesh", payload)
    task_id = resp["result"]
    print(f"    task_id = {task_id}")
    ids["remesh_task"] = task_id
    save_ids(ids)
    return task_id

def step2c_poll_remesh(ids, remesh_task, dry):
    if dry or not remesh_task:
        return
    print("[2c] Waiting for remesh ...")
    poll(f"/remesh/{remesh_task}", "remesh")

def step3_rigging(ids, dry):
    if "rig_task" in ids:
        print(f"[3] Rigging: reusing {ids['rig_task']}")
        return ids["rig_task"]

    print("[3] Rigging  (0 credits) - walk & run animations included")
    if dry:
        print("    DRY RUN - skipping API call")
        return None

    input_task = ids.get("remesh_task") or ids["i3d_task"]
    payload = {
        "input_task_id": input_task,
        "height_meters": 1.7,
    }
    resp = post("/rigging", payload)
    task_id = resp["result"]
    print(f"    task_id = {task_id}")
    ids["rig_task"] = task_id
    save_ids(ids)
    return task_id

def step4_poll_and_download_rig(ids, rig_task, dry):
    if dry or not rig_task:
        return
    if (OUT_DIR / "character_rigged.glb").exists():
        print("[4] Rigged GLB already downloaded")
        return

    print("[4] Waiting for rigging ...")
    data = poll(f"/rigging/{rig_task}", "rigging")

    # Download rigged base character
    rig_url = data.get("rigged_character_glb_url")
    if rig_url:
        download(rig_url, OUT_DIR / "character_rigged_base.glb")

    # Download walk animation GLB (free with rigging)
    walk_url = (data.get("basic_animations") or {}).get("walking", {}).get("glb_url") or \
               (data.get("basic_animations") or {}).get("walking", {}).get("glbUrl")
    if walk_url:
        download(walk_url, OUT_DIR / "character_walk.glb")
        print("  Walk animation: included in basic_animations OK")
    else:
        # Fall back to base rigged model (animation may be embedded)
        if rig_url:
            import shutil
            shutil.copy(OUT_DIR / "character_rigged_base.glb", OUT_DIR / "character_walk.glb")
        print("  Walk URL not found in response - keys:", list((data.get("basic_animations") or {}).keys()))

# Curated action IDs from the Meshy animation library.
# To find IDs: GET /animations/library?search=<term>&page_size=20
ANIM_ACTION_IDS = {
    "walk":       30,   # Casual Walk
    "idle":       335,  # Axe Breathe and Look Around
    "chop":       237,  # Charged Axe Chop
    "carry_walk": 551,  # Carry Heavy Object Walk
    "cheer":      59,   # Victory Cheer
}

def step5_animations(ids, dry):
    need = [n for n in ANIM_ACTION_IDS if n not in ids.get("anim_tasks", {})]
    if not need:
        print("[5] Animations: all reusing cached task IDs")
        return

    print(f"[5] Animations via Animation API  (3 credits each x {len(need)} remaining)")
    if dry:
        print("    DRY RUN - skipping API call")
        return

    ids.setdefault("anim_tasks", {})
    ids.setdefault("action_ids", {})

    for name in need:
        action_id = ANIM_ACTION_IDS[name]
        print(f"  Requesting [{name}] action_id={action_id} ...")
        payload = {
            "rig_task_id": ids["rig_task"],
            "action_ids":  [action_id],
        }
        resp = post("/animations", payload)
        task_id = resp["result"]
        print(f"  [{name}] task_id = {task_id}")
        ids["anim_tasks"][name] = task_id
        ids["action_ids"][name] = action_id
        save_ids(ids)

def step6_poll_and_download_anims(ids, dry):
    if dry:
        return

    anim_tasks = ids.get("anim_tasks", {})
    for name, task_id in anim_tasks.items():
        dest = OUT_DIR / f"character_{name}.glb"
        if dest.exists():
            print(f"[6] {name} GLB already downloaded")
            continue
        print(f"[6] Waiting for [{name}] animation ...")
        data = poll(f"/animations/{task_id}", name)
        anim_url = (data.get("result") or {}).get("animation_glb_url")
        if not anim_url:
            # Try top-level key
            anim_url = data.get("animation_glb_url")
        if not anim_url:
            print(f"ERROR: no animation_glb_url for {name}")
            print(json.dumps(data, indent=2)); sys.exit(1)
        download(anim_url, dest)

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    global SOURCE_IMG, OUT_DIR, IDS_FILE
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Print plan only, spend 0 credits")
    parser.add_argument("--character", choices=list(CHAR_CONFIGS.keys()), default="worker",
                        help="Which character to process (default: worker)")
    args = parser.parse_args()
    dry = args.dry_run

    cfg = CHAR_CONFIGS[args.character]
    ROOT = pathlib.Path(__file__).parent
    SOURCE_IMG = ROOT / cfg["img"]
    OUT_DIR    = ROOT / cfg["out"]
    IDS_FILE   = OUT_DIR / "pipeline_ids.json"
    print(f"Character: {args.character}  |  Source: {SOURCE_IMG.name}  |  Out: {OUT_DIR}")

    print("=" * 60)
    print("Frostborn - Meshy Character Pipeline")
    print("=" * 60)
    if dry:
        print("*** DRY RUN - no credits will be spent ***\n")

    print("\nCredit breakdown:")
    print("  Image-to-3D + 2K texture : 30 credits")
    print("  Rigging                  :  0 credits")
    print("  Animations (5 x 3cr)     : 15 credits")
    print("  TOTAL                    : 45 credits\n")
    print("Required: Meshy Pro ($20/mo, 1 000 credits)")
    print("  https://app.meshy.ai/settings/api-keys\n")

    if not dry:
        check_key()

    ids = load_ids()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    i3d_task    = step1_image_to_3d(ids, dry)
    step2_poll_and_download_model(ids, i3d_task, dry)
    remesh_task = step2b_remesh(ids, dry)
    step2c_poll_remesh(ids, remesh_task, dry)
    rig_task    = step3_rigging(ids, dry)
    step4_poll_and_download_rig(ids, rig_task, dry)
    step5_animations(ids, dry)
    step6_poll_and_download_anims(ids, dry)

    print("\nOK Pipeline complete!")
    if not dry:
        anims = ["walk", "idle", "chop", "carry_walk", "cheer"]
        for a in anims:
            f = OUT_DIR / f"character_{a}.glb"
            if f.exists():
                print(f"  {f.name}  ({f.stat().st_size // 1024} KB)")
        print(f"\nNext: blender --background --python render_sprites.py -- --anim walk --dirs 1")

if __name__ == "__main__":
    main()

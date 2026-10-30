"""
Generate a low-poly axe model via Meshy text-to-3D, same chibi style as the characters.
Output: meshyout/axe/axe.glb
"""
import os, sys, time, json, pathlib, requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=pathlib.Path(r"C:\Users\ickmk\FrostbornGame\ad-refs\.env"), override=True)
MESHY_KEY = os.getenv("MESHY_API_KEY", "")
BASE_URL  = "https://api.meshy.ai/openapi/v2"
OUT_DIR   = pathlib.Path(__file__).parent / "meshyout/axe"
IDS_FILE  = OUT_DIR / "axe_ids.json"

HEADERS = lambda: {"Authorization": f"Bearer {MESHY_KEY}", "Content-Type": "application/json"}
POLL_INTERVAL = 6
TIMEOUT_SEC   = 600

def poll(path, label):
    deadline = time.time() + TIMEOUT_SEC
    while time.time() < deadline:
        r = requests.get(f"{BASE_URL}{path}", headers=HEADERS())
        r.raise_for_status()
        data = r.json()
        status = data.get("status", "?")
        pct    = data.get("progress", 0)
        print(f"  {label}: {status} {pct}%", end="\r", flush=True)
        if status == "SUCCEEDED":
            print(f"  {label}: SUCCEEDED          ")
            return data
        if status in ("FAILED", "CANCELED"):
            print(f"\nERROR: {label} {status}")
            print(json.dumps(data, indent=2))
            sys.exit(1)
        time.sleep(POLL_INTERVAL)
    print(f"\nERROR: Timeout waiting for {label}")
    sys.exit(1)

def download(url, dest):
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
    print(f"{dest.stat().st_size // 1024} KB")

OUT_DIR.mkdir(parents=True, exist_ok=True)
ids = json.loads(IDS_FILE.read_text()) if IDS_FILE.exists() else {}

if "task_id" not in ids:
    print("[1] text-to-3D: axe model (1 credit)")
    payload = {
        "mode": "preview",
        "prompt": (
            "A small cute chibi-style woodcutting axe, low-poly 3D model. "
            "Wooden handle, grey metal blade. Simple and chunky proportions. "
            "Same soft 3D art style as a chibi character. "
            "No background, isolated object."
        ),
        "art_style": "realistic",
        "negative_prompt": "low quality, noisy, text, watermark",
    }
    r = requests.post(f"{BASE_URL}/text-to-3d", headers=HEADERS(), json=payload)
    r.raise_for_status()
    task_id = r.json()["result"]
    print(f"  task_id = {task_id}")
    ids["task_id"] = task_id
    IDS_FILE.write_text(json.dumps(ids, indent=2))
else:
    print(f"[1] Reusing task_id: {ids['task_id']}")

data = poll(f"/text-to-3d/{ids['task_id']}", "text-to-3d axe")
glb_url = (data.get("model_urls") or {}).get("glb") or data.get("glb_url")
if not glb_url:
    print("ERROR: no GLB URL"); sys.exit(1)
download(glb_url, OUT_DIR / "axe.glb")

print("\nDone. axe.glb ready.")

"""
Generate hero + worker character images via OpenAI image API.
Style reference: character_survivor_worker_01.png (existing blue parka character)
"""
import os, sys, base64, pathlib, requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=pathlib.Path(r"C:\Users\ickmk\FrostbornGame\ad-refs\.env"), override=True)
OPENAI_KEY = os.getenv("OPENAI_API_KEY", "")
if not OPENAI_KEY:
    print("ERROR: OPENAI_API_KEY not set"); sys.exit(1)

OUT_DIR = pathlib.Path(__file__).parent / "game/public/assets"

CHARACTERS = {
    "character_hero_01": (
        "A cute 3D-rendered isometric game character, full body, front 3/4 view, "
        "T-pose: arms slightly away from body, legs shoulder-width apart. "
        "Character wears a bright red parka with hood up and brown fur trim around the hood. "
        "Clean bare back with nothing strapped to it. Cute simple face: two small black dot eyes, "
        "pink round cheeks, tiny smile. Dark brown boots. "
        "Pure white / transparent background. "
        "Match the exact same art style, proportions, soft 3D lighting, and chibi-like look "
        "as the reference blue parka character."
    ),
    "character_worker_01_new": (
        "A cute 3D-rendered isometric game character, full body, front 3/4 view, "
        "T-pose: arms slightly away from body, legs shoulder-width apart. "
        "Character wears a bright blue parka with hood up, bright orange scarf around neck, "
        "small grey rectangular backpack on the back. "
        "Cute simple face: two small black dot eyes, pink round cheeks, tiny smile. "
        "Dark brown boots. "
        "Pure white / transparent background. "
        "Match the exact same art style, proportions, soft 3D lighting, and chibi-like look "
        "as the reference blue parka character."
    ),
}

# Load reference image as base64
ref_path = pathlib.Path(__file__).parent / "game/public/assets/character_survivor_worker_01.png"
ref_b64 = base64.b64encode(ref_path.read_bytes()).decode()

headers = {
    "Authorization": f"Bearer {OPENAI_KEY}",
    "Content-Type": "application/json",
}

for filename, prompt in CHARACTERS.items():
    out_path = OUT_DIR / f"{filename}.png"
    if out_path.exists():
        print(f"  (already exists) {out_path.name}")
        continue

    print(f"\nGenerating {filename} ...")
    payload = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "n": 1,
        "size": "1024x1024",
        "quality": "high",
    }
    r = requests.post("https://api.openai.com/v1/images/generations", headers=headers, json=payload)
    if not r.ok:
        print(f"  ERROR {r.status_code}: {r.text[:300]}")
        continue
    data = r.json()
    img_b64 = data["data"][0].get("b64_json")
    if img_b64:
        out_path.write_bytes(base64.b64decode(img_b64))
        print(f"  Saved: {out_path.name}  ({out_path.stat().st_size // 1024} KB)")
    else:
        url = data["data"][0].get("url")
        if url:
            img_data = requests.get(url).content
            out_path.write_bytes(img_data)
            print(f"  Saved via URL: {out_path.name}  ({out_path.stat().st_size // 1024} KB)")
        else:
            print(f"  ERROR: no image data in response")

print("\nDone.")

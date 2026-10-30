"""Generate 2 walk poses for the survivor worker character."""
import base64, os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(override=True)
load_dotenv(Path(r"C:\Users\ickmk\FrostbornGame\ad-refs\.env"), override=True)

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
REF = Path(r"C:\Users\ickmk\FrostbornGame\ad-refs\assets_v1\character_survivor_worker_01.png")
OUT = Path(r"C:\Users\ickmk\Frostborn\game\public\assets")

CAM = "strict isometric top-down view, camera at 45 degrees elevation from upper-left"
STYLE = (
    "The attached image shows the EXACT character to recreate — same blue hooded parka "
    "with hood up, round featureless head, bright orange scarf, small grey backpack, "
    "chunky toy-like low-poly proportions. Match the art style exactly. "
)

POSES = [
    {
        "file": "character_survivor_walk_left.png",
        "prompt": (
            f"{STYLE}Animate this character in a walking step: left leg forward and slightly raised, "
            f"right leg back, right arm swinging forward, left arm back. {CAM}. "
            "Transparent background, no text, no ground plane."
        ),
    },
    {
        "file": "character_survivor_walk_right.png",
        "prompt": (
            f"{STYLE}Animate this character in a walking step: right leg forward and slightly raised, "
            f"left leg back, left arm swinging forward, right arm back. {CAM}. "
            "Transparent background, no text, no ground plane."
        ),
    },
]

total_tokens = 0
for pose in POSES:
    print(f"Generating {pose['file']} ...")
    r = client.images.edit(
        model="gpt-image-1",
        image=("character_survivor_worker_01.png", REF.open("rb"), "image/png"),
        prompt=pose["prompt"],
        size="1024x1024",
        quality="medium",
        background="transparent",
        n=1,
    )
    out = OUT / pose["file"]
    out.write_bytes(base64.b64decode(r.data[0].b64_json))
    tokens = getattr(getattr(r, "usage", None), "total_tokens", 0)
    total_tokens += tokens
    print(f"  OK  {out.stat().st_size//1024} KB  tokens={tokens}")

RATE = 40 / 1_000_000
print(f"\nTotal tokens: {total_tokens}  Est. cost: ${total_tokens * RATE:.3f}")

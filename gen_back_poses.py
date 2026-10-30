"""Generate 3 back-view poses for the survivor worker character."""
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
    "with hood up, round featureless head, bright orange scarf visible at neck, small grey backpack, "
    "chunky toy-like low-poly proportions. Match the art style exactly. "
    "This is the BACK VIEW — the character faces directly AWAY from the camera; "
    "show the blue hood from behind, the grey backpack clearly on the back, "
    "orange scarf peeking out at sides. Do NOT show the face. "
)

POSES = [
    {
        "file": "character_survivor_back_idle.png",
        "prompt": (
            f"{STYLE}Idle standing pose seen from behind: upright posture, "
            "both feet on the ground, arms relaxed at sides, backpack fully visible. "
            f"{CAM}. Transparent background, no text, no ground plane."
        ),
    },
    {
        "file": "character_survivor_back_left.png",
        "prompt": (
            f"{STYLE}Walking step seen from behind: left leg forward and slightly raised, "
            "right leg back, right arm swinging forward, left arm back. "
            f"{CAM}. Transparent background, no text, no ground plane."
        ),
    },
    {
        "file": "character_survivor_back_right.png",
        "prompt": (
            f"{STYLE}Walking step seen from behind: right leg forward and slightly raised, "
            "left leg back, left arm swinging forward, right arm back. "
            f"{CAM}. Transparent background, no text, no ground plane."
        ),
    },
]

RATE = 40 / 1_000_000
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

print(f"\nTotal tokens: {total_tokens}  Est. cost: ${total_tokens * RATE:.3f}")

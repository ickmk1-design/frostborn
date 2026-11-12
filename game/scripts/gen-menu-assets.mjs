import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = 'gpt-image-1';
const FALLBACK_MODEL = 'dall-e-3';

const images = [
  {
    outPath: path.join(ROOT, 'public/assets/menu_keyart.png'),
    size: '1024x1792',
    quality: 'high',
    prompt:
      'A cozy snowy camp at dusk, painted in a warm 3D cartoon style (like a mobile game key art). Lower-middle: a large glowing campfire with a black iron cauldron over it, casting warm orange light on the snow. Left of the fire: a cheerful character in a red parka with a fur-trimmed hood, holding a wooden axe, standing proudly. Right of the fire: two shorter characters in blue parkas holding tools. Surrounding the camp: tall snow-covered pine trees creating a forest. In the dark forest background at the far edge: 2-3 dark grey wolves barely visible in shadows, only their glowing amber eyes visible, small and distant and slightly menacing. A wooden fence/palisade partly surrounds the camp. The sky is dark blue twilight with a few stars visible. Top 30% of image: calm dark sky with distant snowy treetops — keep this area uncluttered for a logo overlay. Bottom 30%: slightly darker, simpler snow ground — keep uncluttered for button overlay. No text, no UI elements, no HUD, no labels. Cinematic depth of field, warm campfire glow illuminating the scene.',
  },
  {
    outPath: path.join(ROOT, 'public/assets/menu_logo.png'),
    size: '1024x1024',
    quality: 'high',
    prompt:
      "Title text artwork for a mobile game, transparent or black background. Two lines of text, centered: First line 'FROSTBORN' in large bold icy letters — the letters are made of frost/ice with snow sitting on top of each letter, slight blue-white glow, cold crystalline texture. Second line 'Last Camp' in smaller warm golden-orange letters with a subtle fiery glow, contrasting warmly with the icy FROSTBORN above. Dramatic, cinematic game title style. No other elements, no background scene, no decorations. Just the two lines of text on a solid black background.",
  },
];

async function generateImage(spec, useFallback = false) {
  const model = useFallback ? FALLBACK_MODEL : MODEL;
  console.log(`Generating: ${path.basename(spec.outPath)} (model=${model}, size=${spec.size})...`);

  // gpt-image-1 supports b64_json; dall-e-3 supports url or b64_json
  const params = {
    model,
    prompt: spec.prompt,
    size: spec.size,
    quality: spec.quality,
    output_format: 'png',
    n: 1,
  };

  // dall-e-3 doesn't accept output_format; remove it
  if (useFallback) {
    delete params.output_format;
    // dall-e-3 only supports 'standard' or 'hd' quality, map 'high' -> 'hd'
    if (params.quality === 'high') params.quality = 'hd';
    // dall-e-3 portrait size is 1024x1792 — supported; keep size as-is
  }

  let response;
  try {
    response = await client.images.generate(params);
  } catch (err) {
    if (!useFallback && (err.status === 404 || err.status === 400 || (err.message && err.message.includes('model')))) {
      console.warn(`gpt-image-1 not available (${err.message}), falling back to dall-e-3...`);
      return generateImage(spec, true);
    }
    throw err;
  }

  const item = response.data[0];
  let buffer;

  if (item.b64_json) {
    buffer = Buffer.from(item.b64_json, 'base64');
  } else if (item.url) {
    console.log(`  Downloading from URL...`);
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Failed to download image: ${res.status} ${res.statusText}`);
    buffer = Buffer.from(await res.arrayBuffer());
  } else {
    throw new Error('No image data returned from API');
  }

  fs.mkdirSync(path.dirname(spec.outPath), { recursive: true });
  fs.writeFileSync(spec.outPath, buffer);
  const sizeKB = (buffer.length / 1024).toFixed(1);
  console.log(`  Saved ${path.basename(spec.outPath)} — ${sizeKB} KB (${buffer.length} bytes)`);
  return { path: spec.outPath, bytes: buffer.length };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY environment variable is not set.');
    process.exit(1);
  }

  const results = [];
  for (const spec of images) {
    const result = await generateImage(spec);
    results.push(result);
  }

  console.log('\n--- Summary ---');
  for (const r of results) {
    const stat = fs.statSync(r.path);
    console.log(`${r.path}  —  ${(stat.size / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message || err);
  process.exit(1);
});

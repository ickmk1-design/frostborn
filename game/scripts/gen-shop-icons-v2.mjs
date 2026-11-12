/**
 * Generates 8 shop item icons using gpt-image-2 with master.png as a style reference.
 * Style: polished 3D cartoon, soft lighting, saturated colors, transparent background.
 * Output: public/assets/ui/shop/<key>.webp  (512×512)
 * Also writes: scripts/shop_icons_contact.png  (contact sheet preview)
 *
 * Run: node scripts/gen-shop-icons-v2.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const OpenAI = require('openai').default ?? require('openai');
const sharp   = require('sharp');
const fs      = require('fs');
const path    = require('path');

const API_KEY     = process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }

const client = new OpenAI({ apiKey: API_KEY });

const SCRIPT_DIR  = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT        = path.resolve(SCRIPT_DIR, '..');
const MASTER_PATH = path.resolve(ROOT, '..', '..', 'FrostbornGame', 'ad-refs', 'style_refs', 'master.png');
const OUT_DIR     = path.join(ROOT, 'public', 'assets', 'ui', 'shop');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Style suffix appended to every prompt
const STYLE = [
  'Polished 3D cartoon render, same art style as the reference image.',
  'Smooth clay/plastic textures, soft diffuse lighting, clean warm shadows.',
  'Saturated friendly colors, brown/orange wood tones, fluffy white snow accents.',
  'Single object centered on a fully transparent background.',
  'No outlines, no pixel art, no dark atmosphere, no text.',
  'Mobile game icon style (Clash of Clans / Supercell quality).',
].join(' ');

const ICONS = [
  {
    key: 'shop_icon_starter',
    prompt: `An open wooden treasure chest overflowing with gold coins, a small hand-axe peeking out, frosty ice dripping off the lid. ${STYLE}`,
  },
  {
    key: 'shop_icon_no_ads',
    prompt: `A round wooden shield with a bold red circle-and-slash "no" symbol painted on it, light dusting of snow on the rim. ${STYLE}`,
  },
  {
    key: 'shop_icon_coins_small',
    prompt: `A small neat stack of 4 shiny gold coins with a slight icy frost glint. ${STYLE}`,
  },
  {
    key: 'shop_icon_coins_medium',
    prompt: `A medium pile of 10–12 shiny gold coins, slightly scattered, warm golden shine. ${STYLE}`,
  },
  {
    key: 'shop_icon_coins_large',
    prompt: `A large overflowing pile of gold coins spilling from a small brown leather pouch, sparkling golden light. ${STYLE}`,
  },
  {
    key: 'shop_icon_worker',
    prompt: `A cheerful cartoon worker character in a blue parka and orange hat, holding a wooden log under one arm, friendly smile. Same character design as the reference image. ${STYLE}`,
  },
  {
    key: 'shop_icon_backpack',
    prompt: `A large sturdy brown leather backpack overstuffed with supplies, wooden handle visible at the top, snow-dusted buckles. ${STYLE}`,
  },
  {
    key: 'shop_icon_axe',
    prompt: `A single gleaming hand-axe with a wooden handle wrapped in leather cord, sharp steel blade with a frosty blue glint. ${STYLE}`,
  },
];

async function generate(icon) {
  const outPath = path.join(OUT_DIR, `${icon.key}.webp`);
  console.log(`  generating: ${icon.key} …`);

  // Read master.png as a File-like object for the style reference
  const masterBuf = fs.readFileSync(MASTER_PATH);
  const masterFile = await OpenAI.toFile(masterBuf, 'master.png', { type: 'image/png' });

  const response = await client.images.edit({
    model: 'gpt-image-2',
    image: [masterFile],
    prompt: icon.prompt,
    n: 1,
    size: '1024x1024',
    quality: 'high',
    output_format: 'png',
  });

  const b64 = response.data[0].b64_json;
  if (!b64) throw new Error('No b64_json in response');

  const pngBuf = Buffer.from(b64, 'base64');
  await sharp(pngBuf)
    .resize(512, 512, { fit: 'cover', position: 'center' })
    .webp({ quality: 90 })
    .toFile(outPath);

  console.log(`  saved: ${icon.key}.webp`);
  return pngBuf;
}

async function buildContactSheet(buffers) {
  const COLS = 4;
  const CELL = 256;
  const PAD  = 6;
  const ROWS = Math.ceil(buffers.length / COLS);
  const W    = COLS * (CELL + PAD) + PAD;
  const H    = ROWS * (CELL + PAD) + PAD + 24;

  const composites = [];
  for (let i = 0; i < buffers.length; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const resized = await sharp(buffers[i])
      .resize(CELL, CELL, { fit: 'cover' })
      .png().toBuffer();
    composites.push({
      input: resized,
      left: PAD + col * (CELL + PAD),
      top:  24 + PAD + row * (CELL + PAD),
    });
  }

  const sheetPath = path.join(SCRIPT_DIR, 'shop_icons_contact.png');
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 50, g: 50, b: 60, alpha: 255 } },
  }).composite(composites).png({ compressionLevel: 6 }).toFile(sheetPath);

  console.log(`\nContact sheet: ${sheetPath}  (${W}×${H})`);
}

console.log('Generating shop icons with master.png style reference…\n');
const rawBuffers = [];
for (const icon of ICONS) {
  try {
    const buf = await generate(icon);
    rawBuffers.push(buf);
  } catch (e) {
    console.error(`  ERROR ${icon.key}:`, e.message ?? e);
    rawBuffers.push(null);
  }
}

const validBuffers = rawBuffers.filter(Boolean);
if (validBuffers.length > 0) await buildContactSheet(validBuffers);
console.log('\nDone.');

/**
 * Generates 8 shop item icons using the OpenAI gpt-image-1 model.
 * Output: public/assets/ui/shop/<key>.webp  (512×512, transparent bg)
 * Run: node scripts/gen-shop-icons.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs    = require('fs');
const path  = require('path');
const https = require('https');

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) { console.error('OPENAI_API_KEY not set'); process.exit(1); }

const sharp = require('sharp');

const OUT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public', 'assets', 'ui', 'shop');
fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = 'Isometric pixel-art game icon on a transparent background, Viking winter survival theme, hand-painted style, warm candlelight glow, 512×512.';

const ICONS = [
  {
    key: 'shop_icon_starter',
    prompt: `${BASE} A glowing wooden treasure chest with golden coin overflow, furs and a small axe peeking out, frosty ice crystals on the lid. Warm amber glow. No text.`,
  },
  {
    key: 'shop_icon_no_ads',
    prompt: `${BASE} A Viking shield with a bold red "no" symbol (circle-slash) painted on it in ice-blue and white. Snow dusted edges. No text.`,
  },
  {
    key: 'shop_icon_coins_small',
    prompt: `${BASE} A small neat stack of 3–4 gold coins with a snowflake embossed on them, frosty glint. No text.`,
  },
  {
    key: 'shop_icon_coins_medium',
    prompt: `${BASE} A medium pile of shiny gold coins with a slight icy frost on top, warm golden glow. No text.`,
  },
  {
    key: 'shop_icon_coins_large',
    prompt: `${BASE} A large overflowing pile of gold coins spilling from a small pouch, sparkling with frost crystals and warm golden light. No text.`,
  },
  {
    key: 'shop_icon_worker',
    prompt: `${BASE} A sturdy Viking worker figure in a fur coat holding a wooden log, cheerful expression, breath visible in cold air. No text.`,
  },
  {
    key: 'shop_icon_backpack',
    prompt: `${BASE} A large leather Viking backpack with fur trim, overstuffed with supplies, wooden canteen attached. Frosty buckles. No text.`,
  },
  {
    key: 'shop_icon_axe',
    prompt: `${BASE} A gleaming sharp Viking hand-axe with an ice-blue razor edge, wooden handle wrapped in leather. Frosty glint on blade. No text.`,
  },
];

function postJson(url, data, headers) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const opts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    };
    const u = new URL(url);
    opts.hostname = u.hostname;
    opts.path     = u.pathname + u.search;
    opts.port     = 443;
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve({ status: res.statusCode, body: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, body: text }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      const mod = u.startsWith('https') ? https : require('http');
      mod.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return get(res.headers.location);
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    };
    get(url);
  });
}

async function generate(icon) {
  const outPath = path.join(OUT_DIR, `${icon.key}.webp`);
  if (fs.existsSync(outPath)) {
    console.log(`  skip (exists): ${icon.key}`);
    return;
  }
  console.log(`  generating: ${icon.key} …`);

  const res = await postJson('https://api.openai.com/v1/images/generations', {
    model: 'gpt-image-2',
    prompt: icon.prompt,
    n: 1,
    size: '1024x1024',
    quality: 'medium',
    output_format: 'png',
  }, { Authorization: `Bearer ${API_KEY}` });

  if (res.status !== 200 || !res.body?.data?.[0]) {
    console.error(`  FAILED ${icon.key}:`, JSON.stringify(res.body).slice(0, 300));
    return;
  }

  let pngBuf;
  if (res.body.data[0].b64_json) {
    pngBuf = Buffer.from(res.body.data[0].b64_json, 'base64');
  } else if (res.body.data[0].url) {
    pngBuf = await fetchUrl(res.body.data[0].url);
  } else {
    console.error(`  FAILED ${icon.key}: no image data`);
    return;
  }

  // Convert to 512×512 WebP
  await sharp(pngBuf)
    .resize(512, 512, { fit: 'cover', position: 'center' })
    .webp({ quality: 90 })
    .toFile(outPath);

  console.log(`  saved: ${outPath}`);
}

console.log('Generating shop icons …');
for (const icon of ICONS) {
  await generate(icon);
}
console.log('Done.');

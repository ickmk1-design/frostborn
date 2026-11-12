/**
 * Extracts wolf_walk frames from atlas_0.webp and assembles an 8-direction
 * contact sheet (one row per direction, columns = frames 0-11).
 * Output: scripts/wolf_walk_contact.png
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const sharp = require('sharp');
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root  = join(__dir, '..');
const atlas = JSON.parse(readFileSync(join(root, 'public/assets/sprites/wolf/atlas.json'), 'utf8'));
const frames = atlas.textures[0].frames;

const DIRS   = [0, 1, 2, 3, 4, 5, 6, 7];
const NFRAME = 12;
const CELL   = 100; // display size per cell
const PAD    = 2;

// Group frames by direction
const byDir = {};
for (const f of frames) {
  const m = f.filename.match(/^wolf_walk_d(\d+)_f(\d+)$/);
  if (!m) continue;
  const d = parseInt(m[1], 10);
  const fi = parseInt(m[2], 10);
  if (!byDir[d]) byDir[d] = [];
  byDir[d][fi] = f;
}

const sheetW = NFRAME * (CELL + PAD) + PAD;
const sheetH = DIRS.length * (CELL + PAD) + PAD + 20; // +20 for header

const atlasImg = sharp(join(root, 'public/assets/sprites/wolf/atlas.json').replace('atlas.json', 'atlas_0.webp'));

// We'll build composite input array for sharp
const composites = [];

// Label each row with direction number
for (let ri = 0; ri < DIRS.length; ri++) {
  const d = DIRS[ri];
  const rowFrames = byDir[d] || [];
  for (let fi = 0; fi < NFRAME; fi++) {
    const f = rowFrames[fi];
    if (!f) continue;
    const { x, y, w, h } = f.frame;
    const ss = f.spriteSourceSize;
    const src = f.sourceSize;

    const cellX = PAD + fi * (CELL + PAD);
    const cellY = 20 + PAD + ri * (CELL + PAD);

    // Scale: fit sourceSize into CELL×CELL
    const scale = CELL / Math.max(src.w, src.h);
    const dstW  = Math.round(src.w * scale);
    const dstH  = Math.round(src.h * scale);

    // Extract the actual frame pixels from atlas
    const rawBuffer = await sharp(join(root, 'public/assets/sprites/wolf/atlas_0.webp'))
      .extract({ left: x, top: y, width: w, height: h })
      .resize(Math.round(w * scale), Math.round(h * scale), { fit: 'fill', kernel: 'lanczos3' })
      .toBuffer();

    // Place onto a dstW×dstH canvas at the spriteSourceSize offset
    const offsetX = Math.round(ss.x * scale);
    const offsetY = Math.round(ss.y * scale);

    const cellBuf = await sharp({
      create: { width: dstW, height: dstH, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 255 } },
    }).composite([{ input: rawBuffer, left: offsetX, top: offsetY, blend: 'over' }])
      .png().toBuffer();

    composites.push({ input: cellBuf, left: cellX + Math.round((CELL - dstW) / 2), top: cellY + Math.round((CELL - dstH) / 2) });
  }
}

// Row labels (simple colored rectangle as label marker)
for (let ri = 0; ri < DIRS.length; ri++) {
  const cellY = 20 + PAD + ri * (CELL + PAD);
  // Draw a thin colored bar at left edge as direction indicator
  const bar = await sharp({
    create: { width: 3, height: CELL, channels: 4, background: { r: 255, g: 165, b: 0, alpha: 200 } },
  }).png().toBuffer();
  composites.push({ input: bar, left: PAD, top: cellY });
}

const outPath = join(__dir, 'wolf_walk_contact.png');
await sharp({
  create: { width: sheetW, height: sheetH, channels: 4, background: { r: 80, g: 80, b: 80, alpha: 255 } },
}).composite(composites).png({ compressionLevel: 6 }).toFile(outPath);

console.log('Contact sheet written to', outPath);
console.log('Dimensions:', sheetW, 'x', sheetH, 'px');
console.log('Each row = one direction (d0–d7), columns = frames 0–11');
console.log('Row order: d0 d1 d2 d3 d4 d5 d6 d7');

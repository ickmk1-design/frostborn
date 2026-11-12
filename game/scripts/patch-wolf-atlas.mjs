/**
 * Patches wolf (and deer) atlas.json to add 40px of top headroom without
 * regenerating the atlas image. All pixel data stays the same; only the
 * JSON metadata changes:
 *
 *   sourceSize.h:        192  → 232
 *   spriteSourceSize.y:  old  → old + 40
 *   spriteSourceSize.b:  old  → recalculated
 *
 * Run from game/:  node scripts/patch-wolf-atlas.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const TOP_PAD = 40;

function patchAtlas(atlasPath) {
  const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
  let changed = 0;

  for (const tex of atlas.textures) {
    for (const f of tex.frames) {
      const ss = f.spriteSourceSize;
      const src = f.sourceSize;

      if (src.h === 192) {
        src.h = 192 + TOP_PAD;
        ss.y  = ss.y + TOP_PAD;
        ss.b  = ss.y + ss.h;
        changed++;
      }
    }
  }

  fs.writeFileSync(atlasPath, JSON.stringify(atlas, null, 2), 'utf8');
  console.log(`Patched ${changed} frames in ${atlasPath}`);
}

const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
patchAtlas(path.join(root, 'public/assets/sprites/wolf/atlas.json'));
patchAtlas(path.join(root, 'public/assets/sprites/deer/atlas.json'));
console.log('Done. Update wolf displaySize in GameScene: 80 → 97, eye-glow factor unchanged.');

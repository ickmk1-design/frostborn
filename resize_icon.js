const fs = require('fs');
const { spawnSync } = require('child_process');

const src = 'C:/Users/ickmk/Frostborn/game/icon.png';
const dst = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';

try {
  const sharp = require('sharp');
  sharp(src).resize(512, 512).toFile(dst, (err) => {
    if (err) {
      console.log('Sharp error:', err.message);
      tryMagick();
    } else {
      console.log('SUCCESS: play_icon_512.png created with sharp');
    }
  });
} catch(e) {
  console.log('Sharp not available:', e.message);
  tryMagick();
}

function tryMagick() {
  const r1 = spawnSync('magick', [src, '-resize', '512x512', dst], { encoding: 'utf8' });
  if (r1.status === 0) { console.log('SUCCESS via magick'); return; }
  const r2 = spawnSync('convert', [src, '-resize', '512x512', dst], { encoding: 'utf8' });
  if (r2.status === 0) { console.log('SUCCESS via convert'); return; }
  const r3 = spawnSync('ffmpeg', ['-i', src, '-vf', 'scale=512:512', dst, '-y'], { encoding: 'utf8' });
  if (r3.status === 0) { console.log('SUCCESS via ffmpeg'); return; }
  fs.copyFileSync(src, dst);
  console.log('Copied icon as-is (resize not available)');
}

const https = require('https');
const fs = require('fs');

const API_KEY = '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';

const prompt = `Wide horizontal mobile game banner, 1024x500 pixels. Isometric low-poly 3D style, vibrant cartoon look. Scene: cozy winter survival camp at dusk. Left two-thirds: wooden camp with snow-covered log cabin, roaring campfire with orange glow, stacked wood logs, small tent, wooden perimeter fence. Cute cartoon boy character in red fur-trimmed parka holding an axe stands near the campfire. Snow-covered pine trees surround the camp. Blue-purple twilight sky with stars just appearing. Right third: intentionally simpler/darker for text overlay. Warm orange fire glow contrasts cold blue-white snow. Style matches a premium mobile strategy game store banner. No text, no UI elements.`;

function makeRequest(size, model) {
  const payload = { model, prompt, n: 1, size };
  const body = JSON.stringify(payload);
  const options = {
    hostname: 'api.openai.com',
    path: '/v1/images/generations',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function downloadUrl(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        fs.writeFileSync(dest, buf);
        resolve(buf.length);
      });
    }).on('error', reject);
  });
}

function tryCrop(inputPath, outputPath) {
  const { spawnSync } = require('child_process');
  // Try magick for crop
  const r = spawnSync('magick', [inputPath, '-gravity', 'North', '-crop', '1024x500+0+0', '+repage', outputPath], { encoding: 'utf8' });
  if (r.status === 0) { console.log('Cropped to 1024x500 with magick'); return true; }
  const r2 = spawnSync('convert', [inputPath, '-gravity', 'North', '-crop', '1024x500+0+0', '+repage', outputPath], { encoding: 'utf8' });
  if (r2.status === 0) { console.log('Cropped to 1024x500 with convert'); return true; }
  fs.copyFileSync(inputPath, outputPath);
  console.log('Saved raw (crop not available)');
  return false;
}

async function main() {
  const rawPath = 'C:/Users/ickmk/Frostborn/store_assets/feature_graphic_raw.png';
  const finalPath = 'C:/Users/ickmk/Frostborn/store_assets/feature_graphic.png';

  // Try different models/sizes
  const attempts = [
    { model: 'gpt-image-1', size: '1536x1024' },
    { model: 'chatgpt-image-latest', size: '1536x1024' },
    { model: 'gpt-image-2', size: '1536x1024' },
    { model: 'gpt-image-2', size: '1024x1024' },
    { model: 'chatgpt-image-latest', size: '1024x1024' }
  ];
  for (const { model, size } of attempts) {
    console.log(`Trying model=${model} size=${size}...`);
    try {
      const resp = await makeRequest(size, model);
      if (resp.error) {
        console.log(`Error for ${size}:`, resp.error.message);
        continue;
      }
      const img = resp.data && resp.data[0];
      if (!img) { console.log('No image in response'); continue; }

      if (img.b64_json) {
        const buf = Buffer.from(img.b64_json, 'base64');
        fs.writeFileSync(rawPath, buf);
        console.log(`Saved raw image (${buf.length} bytes)`);
      } else if (img.url) {
        const bytes = await downloadUrl(img.url, rawPath);
        console.log(`Downloaded image (${bytes} bytes)`);
      } else {
        console.log('No image data found');
        continue;
      }

      tryCrop(rawPath, finalPath);
      console.log('DONE: feature_graphic.png saved');
      return;
    } catch(e) {
      console.error(`Failed for ${size}:`, e.message);
    }
  }
  console.error('All attempts failed');
}

main();

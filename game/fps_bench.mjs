/**
 * FPS benchmark — load Endless, let it run WITHOUT fighting, spawn a bunch of
 * wolves manually to simulate wave 5+ pressure, and sample FPS continuously
 * for 60s. Output: avg/min FPS. Deterministic — no bot behavior.
 */
import { webkit } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 7783);
const DURATION_MS = 60_000;
const WOLF_INJECT_COUNT = 10;    // simulate late-wave pressure
const SAMPLE_MS = 200;

function serve(distDir, port) {
  const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.json': 'application/json', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  };
  const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    const file = path.join(distDir, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('404: ' + url); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

async function main() {
  const server = await serve(path.join(__dirname, 'dist'), PORT);
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log(`[pageerror] ${e.message}`); });

  await page.goto(`http://localhost:${PORT}/?endless=1&noaudio=1`);
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => !!(window.__game?.scene?.getScene('EndlessScene')?.playerSprite));
    if (ok) break;
    await page.waitForTimeout(250);
  }

  // Wait 3s for first wave trigger (fires at t=2s) and settling
  await page.waitForTimeout(3500);

  // Inject extra wolves to simulate wave 5+ pressure
  const injected = await page.evaluate((N) => {
    const sc = window.__game.scene.getScene('EndlessScene');
    let n = 0;
    for (let i = 0; i < N; i++) {
      // bypass cap by calling spawnWolf directly
      if (sc.wolves.length >= 15) break;
      sc.spawnWolf(i % 5 === 0 ? 'betawolf' : 'wolf');
      n++;
    }
    return n;
  }, WOLF_INJECT_COUNT);
  console.log(`[bench] injected ${injected} extra wolves`);

  // Continuously move player in a slow circle so wolves attack in-view
  const start = Date.now();
  const samples = [];
  const JOY_X = 196, JOY_Y = 700;
  let angle = 0;
  while (Date.now() - start < DURATION_MS) {
    const sampleBatch = await page.evaluate(() => {
      const sc = window.__game.scene.getScene('EndlessScene');
      return {
        fps: sc.game.loop.actualFps,
        wolves: (sc.wolves || []).filter(w => w.state !== 'dead').length,
        hp: sc.playerHp,
        sec: sc.survivedSec,
        dead: sc.playerDead,
      };
    });
    samples.push(sampleBatch.fps);
    if (!sampleBatch.dead) {
      angle = (angle + 0.3) % (Math.PI * 2);
      await page.mouse.move(JOY_X, JOY_Y);
      await page.mouse.down();
      await page.mouse.move(JOY_X + Math.cos(angle) * 40, JOY_Y + Math.sin(angle) * 40, { steps: 2 });
      await page.waitForTimeout(SAMPLE_MS);
      await page.mouse.up();
    } else {
      await page.waitForTimeout(SAMPLE_MS);
    }
  }

  const valid = samples.filter(f => f > 0);
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  const min = Math.min(...valid);
  const sorted = [...valid].sort((a, b) => a - b);
  const p05 = sorted[Math.floor(sorted.length * 0.05)];
  console.log(`\n=== Endless FPS Bench (${WOLF_INJECT_COUNT} injected wolves, ${DURATION_MS/1000}s) ===`);
  console.log(`Samples: ${valid.length}  Avg: ${avg.toFixed(1)}  Min: ${min.toFixed(1)}  P05: ${p05.toFixed(1)}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 3).join('\n'));

  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });

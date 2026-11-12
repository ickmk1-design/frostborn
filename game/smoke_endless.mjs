/**
 * Quick smoke test: load Endless, log all console messages + any page error,
 * run for 30s, then dump wave/FPS/wolves state. Used to sanity-check the build
 * before kicking off a 10-minute playtest.
 */
import { webkit } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 7782;

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
  page.on('console', m => console.log(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}\n${e.stack || ''}`));

  await page.goto(`http://localhost:${PORT}/?endless=1&noaudio=1`);
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => {
      const g = window.__game;
      const sc = g?.scene?.getScene('EndlessScene');
      return !!(sc && sc.scene?.isActive?.() && sc.playerSprite);
    }).catch(() => false);
    if (ok) break;
    await page.waitForTimeout(250);
  }
  console.log('[smoke] scene ready, running 25s...');

  const JOY_X = 196; const JOY_Y = 700;
  for (let i = 0; i < 25; i++) {
    const deg = (i * 45) % 360;
    const rad = deg * Math.PI / 180;
    await page.mouse.move(JOY_X, JOY_Y);
    await page.mouse.down();
    await page.mouse.move(JOY_X + Math.cos(rad) * 55, JOY_Y + Math.sin(rad) * 55, { steps: 2 });
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.waitForTimeout(100);
  }

  const state = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('EndlessScene');
    return {
      wave: sc.waveNum, sec: sc.survivedSec, hp: sc.playerHp,
      wolves: (sc.wolves || []).filter(w => w.state !== 'dead').length,
      fps: sc.game.loop.actualFps,
      dead: sc.playerDead,
    };
  });
  console.log('[smoke] final state', state);

  await browser.close();
  server.close();
}

main().catch(e => { console.error(e); process.exit(1); });

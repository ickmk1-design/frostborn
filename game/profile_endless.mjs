/**
 * Endless CPU-throttled FPS profiler.
 * Launches Chromium, applies 2x CPU throttle via CDP, plays Endless for ~150s,
 * reports min/avg/p95 FPS and the 10 longest frames split by late window.
 *
 * Run: node profile_endless.mjs
 */

import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const PORT = 7781;
const THROTTLE = 2;             // 2x = roughly a mid-tier mobile vs headless desktop
const PROFILE_SECONDS = 180;    // needs > 2*120 to reach wave 3+ with current timing
const LATE_WINDOW_START_SEC = 60;

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
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

async function main() {
  const server = await serve(DIST, PORT);
  console.log(`static server on http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (Linux; Android 10; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`CPU throttle: ${THROTTLE}x`);

  await page.goto(`http://localhost:${PORT}/?endless=1&noaudio=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });

  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return false;
      const sc = g.scene.getScene('EndlessScene');
      return !!(sc && sc.scene?.isActive?.() && sc.playerSprite);
    });
    if (ready) break;
    await page.waitForTimeout(500);
  }
  console.log('EndlessScene ready — profiling for', PROFILE_SECONDS, 's');

  // Install per-frame hook with late-window splitting
  await page.evaluate(({ N, lateSec }) => {
    const w = window;
    w.__frameTimes = new Float32Array(N);
    w.__frameIdx = 0;
    w.__frameCount = 0;
    w.__lateFrames = [];
    w.__lateSec = lateSec;
    const sc = w.__game.scene.getScene('EndlessScene');
    const orig = sc.update.bind(sc);
    sc.update = function (time, delta) {
      w.__frameTimes[w.__frameIdx] = delta;
      w.__frameIdx = (w.__frameIdx + 1) % N;
      w.__frameCount++;
      if ((sc.survivedSec || 0) >= w.__lateSec) w.__lateFrames.push(delta);
      return orig(time, delta);
    };
  }, { N: 20000, lateSec: LATE_WINDOW_START_SEC });

  // Drive bot (basic: move toward nearest wolf OR fire)
  const start = Date.now();
  while ((Date.now() - start) / 1000 < PROFILE_SECONDS) {
    const st = await page.evaluate(() => {
      const g = window.__game;
      const sc = g?.scene?.getScene('EndlessScene');
      if (!sc) return null;
      let nx = sc.fireX, ny = sc.fireY;
      let minD = Infinity;
      for (const w of (sc.wolves || [])) {
        if (w.state === 'dead') continue;
        const d = Math.hypot(sc.playerLX - w.lx, sc.playerLY - w.ly);
        if (d < minD) { minD = d; nx = w.lx; ny = w.ly; }
      }
      const toX = sc.carriedLogs > 0 ? sc.fireX : (minD < 220 ? nx : sc.fireX);
      const toY = sc.carriedLogs > 0 ? sc.fireY : (minD < 220 ? ny : sc.fireY);
      const sx = (toX - sc.cameras.main.scrollX) * sc.cameras.main.zoom;
      const sy = (toY - sc.cameras.main.scrollY) * sc.cameras.main.zoom;
      const px = (sc.playerLX - sc.cameras.main.scrollX) * sc.cameras.main.zoom;
      const py = (sc.playerLY - sc.cameras.main.scrollY) * sc.cameras.main.zoom;
      const a = Math.atan2(sy - py, sx - px);
      return { deg: (a * 180 / Math.PI + 360) % 360 };
    }).catch(() => null);
    if (st) {
      const rad = st.deg * Math.PI / 180;
      await page.mouse.move(196, 700);
      await page.mouse.down();
      await page.mouse.move(196 + Math.cos(rad) * 55, 700 + Math.sin(rad) * 55, { steps: 2 });
      await page.waitForTimeout(600);
      await page.mouse.up();
    }
    await page.waitForTimeout(80);
  }

  const stats = await page.evaluate(() => {
    const summarise = (arr) => {
      arr = arr.filter(x => x > 0).slice().sort((a, b) => a - b);
      const n = arr.length;
      if (!n) return { n: 0 };
      const sum = arr.reduce((a, b) => a + b, 0);
      const avg = sum / n;
      const p50 = arr[Math.floor(n * 0.50)];
      const p95 = arr[Math.floor(n * 0.95)];
      const p99 = arr[Math.floor(n * 0.99)];
      const max = arr[n - 1];
      return {
        n, avg, p50, p95, p99, max,
        minFps: 1000 / max, avgFps: 1000 / avg, p95Fps: 1000 / p95,
        top10: arr.slice(-10),
      };
    };
    const sc = window.__game.scene.getScene('EndlessScene');
    return {
      all: summarise(Array.from(window.__frameTimes)),
      late: summarise(window.__lateFrames),
      waveNum: sc.waveNum,
      survivedSec: sc.survivedSec,
      aliveWolves: (sc.wolves || []).filter(w => w.state !== 'dead').length,
      totalWolves: (sc.wolves || []).length,
    };
  });

  const print = (lbl, s) => {
    if (!s.n) { console.log(`\n=== ${lbl} === (no samples)`); return; }
    console.log(`\n=== ${lbl} ===`);
    console.log(`Frames sampled: ${s.n}`);
    console.log(`Avg frame: ${s.avg.toFixed(1)}ms  (${s.avgFps.toFixed(1)} FPS)`);
    console.log(`p50 frame: ${s.p50.toFixed(1)}ms`);
    console.log(`p95 frame: ${s.p95.toFixed(1)}ms  (${s.p95Fps.toFixed(1)} FPS)`);
    console.log(`p99 frame: ${s.p99.toFixed(1)}ms`);
    console.log(`Max frame: ${s.max.toFixed(1)}ms  (${s.minFps.toFixed(1)} FPS min)`);
    console.log(`Top 10 longest frames (ms):`, s.top10.map(x => x.toFixed(0)).join(', '));
  };

  print(`Endless (${THROTTLE}x CPU, full run)`, stats.all);
  print(`Endless late window (t>=${LATE_WINDOW_START_SEC}s)`, stats.late);
  console.log(`\nFinal: wave=${stats.waveNum} survived=${stats.survivedSec.toFixed(1)}s aliveWolves=${stats.aliveWolves}/${stats.totalWolves}`);

  await browser.close();
  server.close();
}

main().catch(err => { console.error(err); process.exit(1); });

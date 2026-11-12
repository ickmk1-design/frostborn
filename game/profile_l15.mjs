/**
 * L15 CPU-throttled FPS profiler.
 * Launches Chromium, applies 4x CPU throttle via CDP, plays L15 for 90s,
 * reports min/avg/p95 FPS and the 10 longest frames.
 *
 * Run: node profile_l15.mjs
 */

import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5177';
const THROTTLE = 4;
const PROFILE_SECONDS = 90;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    userAgent: 'Mozilla/5.0 (Linux; Android 10; Pixel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => {
    if (m.type() === 'error') console.log('[err]', m.text().substring(0, 200));
  });

  // CDP CPU throttling
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`CPU throttle: ${THROTTLE}x`);

  // Load L15 with noaudio (fastest startup)
  await page.goto(`${BASE_URL}/?level=15&noaudio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });

  // Wait for GameScene
  let ready = false;
  for (let i = 0; i < 40; i++) {
    ready = await page.evaluate(() => !!(window.__game && window.__game.scene.getScene('GameScene')));
    if (ready) break;
    await page.waitForTimeout(500);
  }
  if (!ready) { console.error('GameScene never ready'); await browser.close(); return; }
  console.log('GameScene ready — profiling for', PROFILE_SECONDS, 's');

  // Install per-frame hook: capture delta (ms) for every Phaser update() call.
  const installed = await page.evaluate((N) => {
    const w = window;
    try {
      w.__frameTimes = new Float32Array(N);
      w.__frameIdx = 0;
      w.__frameCount = 0;
      const sc = w.__game.scene.getScene('GameScene');
      if (!sc || typeof sc.update !== 'function') return 'no-scene';
      const orig = sc.update.bind(sc);
      sc.update = function (time, delta) {
        w.__frameTimes[w.__frameIdx] = delta;
        w.__frameIdx = (w.__frameIdx + 1) % N;
        w.__frameCount++;
        return orig(time, delta);
      };
      return 'ok';
    } catch (e) { return 'err:' + e.message; }
  }, 10000);
  console.log('Install:', installed);

  const start = Date.now();
  while ((Date.now() - start) / 1000 < PROFILE_SECONDS) {
    await page.mouse.move(196, 700);
    await page.mouse.down();
    await page.mouse.move(196 + Math.cos(2.4) * 55, 700 + Math.sin(2.4) * 55, { steps: 3 });
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await page.waitForTimeout(100);
  }

  const stats = await page.evaluate(() => {
    if (!window.__frameTimes) return null;
    const arr = Array.from(window.__frameTimes).filter(x => x > 0);
    if (arr.length === 0) return { empty: true, count: window.__frameCount };
    arr.sort((a, b) => a - b);
    const n = arr.length;
    const sum = arr.reduce((a, b) => a + b, 0);
    const avg = sum / n;
    const p50 = arr[Math.floor(n * 0.50)];
    const p95 = arr[Math.floor(n * 0.95)];
    const p99 = arr[Math.floor(n * 0.99)];
    const max = arr[n - 1];
    const minFps = 1000 / max;
    const avgFps = 1000 / avg;
    const p95Fps = 1000 / p95;
    const top10 = arr.slice(-10);
    return { n, avg, p50, p95, p99, max, minFps, avgFps, p95Fps, top10 };
  });

  if (!stats) { console.error('No stats — hook failed'); }
  else if (stats.empty) { console.error('No frames captured — count=', stats.count); }
  else {
    console.log('\n=== L15 FPS Profile (4x CPU throttle,', PROFILE_SECONDS, 's) ===');
    console.log(`Frames sampled: ${stats.n}`);
    console.log(`Avg frame: ${stats.avg.toFixed(1)}ms  (${stats.avgFps.toFixed(1)} FPS)`);
    console.log(`p50 frame: ${stats.p50.toFixed(1)}ms`);
    console.log(`p95 frame: ${stats.p95.toFixed(1)}ms  (${stats.p95Fps.toFixed(1)} FPS)`);
    console.log(`p99 frame: ${stats.p99.toFixed(1)}ms`);
    console.log(`Max frame: ${stats.max.toFixed(1)}ms  (${stats.minFps.toFixed(1)} FPS min)`);
    console.log(`Top 10 longest frames (ms):`, stats.top10.map(x => x.toFixed(0)).join(', '));
  }

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });

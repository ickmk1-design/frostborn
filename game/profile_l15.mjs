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

  // CDP CPU throttling
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  console.log(`CPU throttle: ${THROTTLE}x`);

  // Load L15 with noaudio (fastest startup)
  await page.goto(`${BASE_URL}/?level=15&noaudio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });

  // Wait for GameScene
  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => !!(window.__game && window.__game.scene.getScene('GameScene')));
    if (ready) break;
    await page.waitForTimeout(500);
  }
  console.log('GameScene ready — profiling for', PROFILE_SECONDS, 's');

  // Install per-frame hook: capture delta (ms) for every Phaser update() call.
  // Store in a ring buffer to keep memory bounded and avoid feedback loops.
  await page.evaluate((N) => {
    const w = window;
    w.__frameTimes = new Float32Array(N);
    w.__frameIdx = 0;
    w.__frameCount = 0;
    const sc = w.__game.scene.getScene('GameScene');
    const orig = sc.update.bind(sc);
    sc.update = function (time, delta) {
      w.__frameTimes[w.__frameIdx] = delta;
      w.__frameIdx = (w.__frameIdx + 1) % N;
      w.__frameCount++;
      return orig(time, delta);
    };
  }, 10000);

  // Simple joystick drive: walk SW toward survivors for 60s
  const start = Date.now();
  while ((Date.now() - start) / 1000 < PROFILE_SECONDS) {
    // Drag SW 1.2s, release 0.1s
    await page.mouse.move(196, 700);
    await page.mouse.down();
    await page.mouse.move(196 + Math.cos(2.4) * 55, 700 + Math.sin(2.4) * 55, { steps: 3 });
    await page.waitForTimeout(1200);
    await page.mouse.up();
    await page.waitForTimeout(100);
  }

  // Extract frame-time buffer
  const stats = await page.evaluate(() => {
    const arr = Array.from(window.__frameTimes).filter(x => x > 0);
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
    // Top 10 longest frames
    const top10 = arr.slice(-10);
    return { n, avg, p50, p95, p99, max, minFps, avgFps, p95Fps, top10 };
  });

  console.log('\n=== L15 FPS Profile (4x CPU throttle,', PROFILE_SECONDS, 's) ===');
  console.log(`Frames sampled: ${stats.n}`);
  console.log(`Avg frame: ${stats.avg.toFixed(1)}ms  (${stats.avgFps.toFixed(1)} FPS)`);
  console.log(`p50 frame: ${stats.p50.toFixed(1)}ms`);
  console.log(`p95 frame: ${stats.p95.toFixed(1)}ms  (${stats.p95Fps.toFixed(1)} FPS)`);
  console.log(`p99 frame: ${stats.p99.toFixed(1)}ms`);
  console.log(`Max frame: ${stats.max.toFixed(1)}ms  (${stats.minFps.toFixed(1)} FPS min)`);
  console.log(`Top 10 longest frames (ms):`, stats.top10.map(x => x.toFixed(0)).join(', '));

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });

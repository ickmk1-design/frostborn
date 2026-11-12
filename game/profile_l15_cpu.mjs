/**
 * L15 CDP CPU Profiler.
 * Launches Chromium, applies 4x CPU throttle, plays L15 for 60s,
 * captures CPU profiler trace, aggregates self-time by function name,
 * reports top-20 hotspots.
 *
 * Run: node profile_l15_cpu.mjs
 */

import { chromium } from 'playwright';
import { writeFile } from 'fs/promises';

const BASE_URL = 'http://localhost:5177';
const THROTTLE = 4;
const PROFILE_SECONDS = 60;

async function main() {
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

  await page.goto(`${BASE_URL}/?level=15&noaudio`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });

  for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => !!(window.__game && window.__game.scene.getScene('GameScene')));
    if (ready) break;
    await page.waitForTimeout(500);
  }
  console.log('GameScene ready — warming up 5s, then profiling', PROFILE_SECONDS, 's');

  // warmup
  await page.waitForTimeout(5000);

  // Start CPU profiler
  await client.send('Profiler.enable');
  await client.send('Profiler.setSamplingInterval', { interval: 100 }); // 100us = finer
  await client.send('Profiler.start');

  // Simulate gameplay
  const start = Date.now();
  const drag = async (deg, ms) => {
    const rad = deg * Math.PI / 180;
    const ex = 196 + Math.cos(rad) * 55;
    const ey = 700 + Math.sin(rad) * 55;
    await page.mouse.move(196, 700);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 3 });
    await page.waitForTimeout(ms);
    await page.mouse.up();
    await page.waitForTimeout(80);
  };

  let angle = 220;
  while ((Date.now() - start) / 1000 < PROFILE_SECONDS) {
    await drag(angle, 1400);
    angle = (angle + 35) % 360;
  }

  const { profile } = await client.send('Profiler.stop');

  // Aggregate self-time by function
  const nodeMap = new Map();
  for (const n of profile.nodes) nodeMap.set(n.id, n);

  // Compute self-times from samples/timeDeltas
  const selfTicksByNode = new Map();
  if (profile.samples && profile.timeDeltas) {
    for (let i = 0; i < profile.samples.length; i++) {
      const id = profile.samples[i];
      const dt = profile.timeDeltas[i] || 0;
      selfTicksByNode.set(id, (selfTicksByNode.get(id) || 0) + dt);
    }
  }

  const totalUs = profile.endTime - profile.startTime;

  const rows = [];
  for (const [id, us] of selfTicksByNode) {
    const node = nodeMap.get(id);
    if (!node) continue;
    const f = node.callFrame;
    const name = (f.functionName || '(anonymous)') +
      ' @ ' + (f.url ? f.url.split('/').slice(-1)[0] : '?') +
      ':' + (f.lineNumber ?? '?');
    rows.push({ name, us, pct: (us / totalUs) * 100 });
  }
  rows.sort((a, b) => b.us - a.us);

  console.log('\n=== Top 20 self-time hotspots ===');
  for (const r of rows.slice(0, 20)) {
    console.log(`${r.pct.toFixed(2).padStart(6)}%  ${(r.us / 1000).toFixed(0).padStart(6)}ms  ${r.name}`);
  }

  await writeFile('cpu_profile_raw.json', JSON.stringify(profile));
  console.log('\nRaw profile saved to cpu_profile_raw.json');

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });

// capture_agentB.mjs — captures L7, L11, L14 screenshots using the same
// setup as capture_review.mjs, but limited to those three for agentB's
// signature-structure verification.
import { chromium } from 'playwright';
import sharp from 'sharp';
import path from 'path';
import { mkdir } from 'fs/promises';

const BASE    = process.env.CAP_URL || 'http://localhost:8912/';
const OUT_DIR = 'C:/Users/ickmk/Frostborn/store_assets/review';
const VW_W    = 393;
const VW_H    = 852;
const DPR     = 3;
const OUT_W   = 1290;
const OUT_H   = 2796;
const JOY_X    = 196;
const JOY_Y    = 700;
const JOY_DRAG = 55;

async function drag(page, angleDeg, durationMs) {
  const rad = angleDeg * Math.PI / 180;
  const ex  = JOY_X + Math.cos(rad) * JOY_DRAG;
  const ey  = JOY_Y + Math.sin(rad) * JOY_DRAG;
  await page.mouse.move(JOY_X, JOY_Y);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 4 });
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
  await page.waitForTimeout(80);
}

async function readState(page) {
  return page.evaluate(() => {
    const g = window.__game; if (!g) return null;
    const sc = g.scene.getScene('GameScene'); if (!sc) return null;
    return {
      playerLX: sc.playerLX, playerLY: sc.playerLY,
      fuel: sc.fuel, coins: sc.coins,
      rescued: sc.rescuedCount,
      survivors: (sc.survivors ?? []).map(s => ({ state: s.state, lx: s.lx, ly: s.ly })),
    };
  }).catch(() => null);
}

async function walkTo(page, tx, ty, timeoutMs = 4000, stopR = 40) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const s = await readState(page);
    if (!s) return false;
    const dx = tx - s.playerLX, dy = ty - s.playerLY;
    const d = Math.hypot(dx, dy);
    if (d < stopR) return true;
    const deg = Math.round((Math.atan2(dy, dx) * 180 / Math.PI + 360)) % 360;
    const snap = Math.round(deg / 45) * 45;
    await drag(page, snap, Math.min(900, d * 6));
  }
  return false;
}

async function thawNearest(page, n, timeoutMs = 60_000) {
  const t0 = Date.now();
  let start = await readState(page);
  if (!start) return;
  let seen = start.rescued;
  while (Date.now() - t0 < timeoutMs) {
    const s = await readState(page);
    if (!s) return;
    if (s.rescued - seen >= n) return;
    let best = null; let bd = 1e9;
    for (const sv of s.survivors) {
      if (sv.state !== 'frozen') continue;
      const d = Math.hypot(sv.lx - s.playerLX, sv.ly - s.playerLY);
      if (d < bd) { bd = d; best = sv; }
    }
    if (!best) break;
    await walkTo(page, best.lx, best.ly, 12_000, 60);
    await page.waitForTimeout(4000);
  }
}

async function captureLevel(browser, lvl, thaw, wait, label) {
  const ctx = await browser.newContext({
    viewport: { width: VW_W, height: VW_H },
    deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${BASE}?level=${lvl}&noaudio=1`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => {
    const sc = window.__game?.scene?.getScene?.('GameScene');
    return sc && sc.sceneTimeMs > 1500;
  }, { timeout: 120_000, polling: 500 });
  await page.waitForTimeout(2000);
  await thawNearest(page, thaw, 60_000);
  await page.waitForTimeout(wait);
  const buf = await page.screenshot({ omitBackground: false });
  await ctx.close();
  const outPath = path.join(OUT_DIR, `agentB_L${lvl}_${label}.png`);
  await sharp(buf).resize(OUT_W, OUT_H, { fit: 'cover', position: 'centre' }).png().toFile(outPath);
  console.log(`[OK] L${lvl} → ${outPath}`);
  return outPath;
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    await captureLevel(browser, 7,  2, 10_000, 'mill');
    await captureLevel(browser, 11, 2, 10_000, 'butcher');
    await captureLevel(browser, 14, 2, 10_000, 'tower');
  } finally { await browser.close(); }
})();

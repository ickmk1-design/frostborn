// capture_review.mjs — mid-game screenshots that actually show the stations
// working. Drives the hero (thaw survivors, chop a tree, visit stations) so
// the chain has time to produce before capture.

import { chromium } from 'playwright';
import sharp from 'sharp';
import path from 'path';
import { mkdir } from 'fs/promises';

const BASE    = process.env.CAP_URL || 'http://localhost:8911/';
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
      stages: (sc.goalStages ?? []).length, stage: sc.currentStageIdx,
      rescued: sc.rescuedCount, tentBuilt: sc.tentBuilt,
      planksProduced: sc.planksProduced ?? 0,
      planksAvailable: sc.planksAvailable ?? 0,
      cookedServed: sc.cookedServed ?? 0,
      animalsKilled: sc.animalsKilled ?? 0,
      supplyRuns: sc.supplyRunsCompleted ?? 0,
      survivors: (sc.survivors ?? []).map(s => ({ state: s.state, lx: s.lx, ly: s.ly })),
      stations: (sc.stations ?? []).map(st => ({
        kind: st.cfg?.kind, worker: st.workerId, out: st.outputCount, in: st.inputCount,
      })),
      animals: (sc.animals ?? []).map(a => ({ state: a.state, hp: a.hp })),
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
  let seenRescued = 0;
  const startSt = await readState(page);
  if (startSt) seenRescued = startSt.rescued;
  while (Date.now() - t0 < timeoutMs) {
    const s = await readState(page);
    if (!s) return;
    if (s.rescued - seenRescued >= n) return;
    const frozen = s.survivors.filter(sv => sv.state === 'frozen' || sv.state === 'thawing');
    if (frozen.length === 0) break;
    let bd = Infinity, best = null;
    for (const sv of frozen) {
      const d = Math.hypot(sv.lx - s.playerLX, sv.ly - s.playerLY);
      if (d < bd) { bd = d; best = sv; }
    }
    if (!best) break;
    await walkTo(page, best.lx, best.ly, 12_000, 60);
    await page.waitForTimeout(4000);
  }
}

async function loiter(page, waitMs) {
  await page.waitForTimeout(waitMs);
}

const PLAN = [
  { lvl: 1,  label: 'L1 First Fire',    thaw: 0, wait: 10_000 },
  { lvl: 2,  label: 'L2 Second Thaw',   thaw: 1, wait: 10_000 },
  { lvl: 3,  label: 'L3 Dusk',          thaw: 1, wait: 12_000 },
  { lvl: 4,  label: 'L4 Blizzard',      thaw: 1, wait: 12_000 },
  { lvl: 5,  label: 'L5 Pier',          thaw: 1, wait: 14_000 },
  { lvl: 6,  label: 'L6 Cook Pot',      thaw: 1, wait: 14_000 },
  { lvl: 7,  label: 'L7 Lumber Mill',   thaw: 1, wait: 14_000 },
  { lvl: 8,  label: 'L8 First Cabin',   thaw: 2, wait: 14_000 },
  { lvl: 9,  label: 'L9 Crew',          thaw: 2, wait: 14_000 },
  { lvl: 10, label: 'L10 Hunting',      thaw: 2, wait: 14_000 },
  { lvl: 11, label: 'L11 Grinder',      thaw: 2, wait: 16_000 },
  { lvl: 12, label: 'L12 Supply Sled',  thaw: 2, wait: 18_000 },
  { lvl: 13, label: 'L13 Village',      thaw: 3, wait: 18_000 },
  { lvl: 14, label: 'L14 Night Watch',  thaw: 2, wait: 16_000 },
  { lvl: 15, label: 'L15 Grand Alpha',  thaw: 2, wait: 15_000 },
];

async function captureLevel(browser, p) {
  const ctx = await browser.newContext({
    viewport: { width: VW_W, height: VW_H },
    deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(`${BASE}?level=${p.lvl}&noaudio=1`, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction(() => {
    const sc = window.__game?.scene?.getScene?.('GameScene');
    return sc && sc.sceneTimeMs > 1500;
  }, { timeout: 120_000, polling: 500 });
  await page.waitForTimeout(2000);
  await thawNearest(page, p.thaw, 60_000);
  await loiter(page, p.wait);
  const buf = await page.screenshot({ omitBackground: false });
  const state = await readState(page);
  await ctx.close();
  const outPath = path.join(OUT_DIR, `L${p.lvl}.png`);
  await sharp(buf).resize(OUT_W, OUT_H, { fit: 'cover', position: 'centre' }).png().toFile(outPath);
  const manned = state ? state.stations.filter(st => st.worker >= 0).length : 0;
  const nStations = state?.stations.length ?? 0;
  console.log(`[OK] L${p.lvl} manned=${manned}/${nStations} planks=${state?.planksProduced} served=${state?.cookedServed} runs=${state?.supplyRuns} kills=${state?.animalsKilled} stage=${state?.stage}/${state?.stages} rescued=${state?.rescued}`);
  return outPath;
}

async function makeContactSheet(paths) {
  // Thumbnails to keep final sheet under a reasonable size (15 × 1290×2796
  // would exceed 50 MP sharp limit). Scale each cell to 430×932.
  const cellW = 430, cellH = 932;
  const gutter = 12;
  const cols = 3, rows = Math.ceil(paths.length / cols);
  const sheetW = cellW * cols + gutter * (cols + 1);
  const sheetH = cellH * rows + gutter * (rows + 1);
  const bg = await sharp({
    create: { width: sheetW, height: sheetH, channels: 3, background: { r: 24, g: 24, b: 28 } },
  }).png().toBuffer();
  const composites = [];
  for (let i = 0; i < paths.length; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    const x = gutter + c * (cellW + gutter);
    const y = gutter + r * (cellH + gutter);
    const thumb = await sharp(paths[i]).resize(cellW, cellH, { fit: 'cover' }).png().toBuffer();
    composites.push({ input: thumb, left: x, top: y });
  }
  await sharp(bg).composite(composites).png().toFile(path.join(OUT_DIR, 'contact_sheet.png'));
  console.log(`[OK] contact_sheet.png saved (${sheetW}x${sheetH})`);
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const paths = [];
  try {
    for (const p of PLAN) {
      try { const out = await captureLevel(browser, p); paths.push(out); }
      catch (e) { console.log(`[FAIL] L${p.lvl}: ${e.message}`); }
    }
    if (paths.length >= 1) await makeContactSheet(paths);
  } finally { await browser.close(); }
})();

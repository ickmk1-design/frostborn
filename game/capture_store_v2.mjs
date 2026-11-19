/**
 * Frostborn store-asset capture script (v2)
 *
 * - 10 iPhone 6.9" screenshots (1290×2796 portrait PNG) saved to
 *   C:/Users/ickmk/Frostborn/store_assets/iphone_69/iphone_<n>.png
 * - 5 IAP review screenshots (1024×1536 portrait PNG, soft-highlight overlay)
 *   saved to C:/Users/ickmk/Frostborn/store_assets/iap_review/<productId>.png
 *
 * Uses Playwright (chromium) against the live web build and sharp to resize.
 * Reuses the virtual-joystick drag primitive from playtest_bot.js.
 */

import { chromium } from 'playwright';
import sharp from 'sharp';
import { mkdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL      = 'https://cytbilisim.com/frostborn/game/';
const IPHONE_DIR    = 'C:/Users/ickmk/Frostborn/store_assets/iphone_69';
const IAP_DIR       = 'C:/Users/ickmk/Frostborn/store_assets/iap_review';
const VP_PHONE      = { width: 393, height: 852 };
const DPR_PHONE     = 4;
const VP_IAP        = { width: 1024, height: 1536 };

// Joystick geometry — mirrors playtest_bot.js
const JOY_X    = 196;
const JOY_Y    = 700;
const JOY_DRAG = 55;

// Iso projection helper
const TW = 80, TH = 40;
function isoToScreen(ix, iy, ox, oy) {
  return { x: ox + (ix - iy) * TW / 2, y: oy + (ix + iy) * TH / 2 };
}
function angleBetween(fx, fy, tx, ty) { return Math.atan2(ty - fy, tx - fx); }
function snapAngle(rad) {
  const deg = ((rad * 180 / Math.PI) + 360) % 360;
  return Math.round(deg / 45) * 45;
}

async function drag(page, angleDeg, durationMs) {
  const rad = angleDeg * Math.PI / 180;
  const ex = JOY_X + Math.cos(rad) * JOY_DRAG;
  const ey = JOY_Y + Math.sin(rad) * JOY_DRAG;
  await page.mouse.move(JOY_X, JOY_Y);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 3 });
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
  await page.waitForTimeout(80);
}

async function readState(page) {
  return page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const sc = g.scene.getScene('GameScene');
    if (!sc) return null;
    const trees = (sc.trees ?? []).map(t => ({
      x: (t.sprite?.x ?? t.x ?? 0),
      y: (t.sprite?.y ?? t.y ?? 0),
      logCount: t.logCount ?? 0,
    }));
    return {
      coins:           sc.coins         ?? 0,
      fuel:            sc.fuel          ?? 0,
      fuelMax:         sc.cfg?.fire?.fuelMax ?? 100,
      rescuedCount:    sc.rescuedCount  ?? 0,
      tentBuilt:       sc.tentBuilt     ?? false,
      gameOver:        sc.gameOver      ?? false,
      playerDead:      sc.playerDead    ?? false,
      playerLX:        sc.playerLX      ?? 0,
      playerLY:        sc.playerLY      ?? 0,
      carriedLogs:     sc.carriedLogs   ?? 0,
      coinsPaidForTent:sc.coinsPaidForTent ?? 0,
      fishCaught:      sc.fishCaught    ?? 0,
      planksProduced:  sc.planksProduced ?? 0,
      currentStageIdx: sc.currentStageIdx ?? 0,
      fireX:           sc.fireX         ?? 0,
      fireY:           sc.fireY         ?? 0,
      padX:            sc.padX          ?? 0,
      padY:            sc.padY          ?? 0,
      trees,
      survivors: (sc.survivors ?? []).map(s => ({ state: s.state, lx: s.lx, ly: s.ly, workerState: s.workerState, workerHaulId: s.workerHaulId })),
      animals:   (sc.animals   ?? []).map(a => ({ state: a.state, lx: a.lx, ly: a.ly })),
      stations:  (sc.stations  ?? []).map(st => ({ kind: st.cfg?.kind ?? st.kind ?? '', outputCount: st.outputCount ?? 0, inputCount: st.inputCount ?? 0 })),
    };
  }).catch(() => null);
}

async function waitForScene(page, timeoutMs = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const ok = await page.evaluate(() => !!(window.__game && window.__game.scene.getScene('GameScene'))).catch(() => false);
    if (ok) {
      // Give it another second so textures/entities are seated
      await page.waitForTimeout(1200);
      return true;
    }
    await page.waitForTimeout(400);
  }
  return false;
}

async function gotoLevel(page, n) {
  await page.goto(`${BASE_URL}?level=${n}&noaudio=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });
  const ok = await waitForScene(page);
  if (!ok) throw new Error(`L${n}: GameScene not ready`);
  await page.locator('canvas').click({ position: { x: 196, y: 426 }, force: true });
  await page.waitForTimeout(400);
}

// Walk toward target at cur player pos
async function walkToward(page, state, tx, ty, ms) {
  const deg = snapAngle(angleBetween(state.playerLX, state.playerLY, tx, ty));
  await drag(page, deg, ms);
}

// Flatten PNG against black (kill alpha) and resize to 1290×2796 cover crop
async function finalizePhone(bufPng, dstPath) {
  const img = sharp(bufPng);
  const meta = await img.metadata();
  // Re-decode because sharp needs a buffer each time (immutable chain is fine with `.pipeline()` but this is simplest)
  await sharp(bufPng)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .resize(1290, 2796, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(dstPath);
  return meta;
}

async function finalizeIAP(bufPng, dstPath) {
  // IAP shots are already 1024×1536 from the viewport; just flatten.
  await sharp(bufPng)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .resize(1024, 1536, { fit: 'cover', position: 'centre' })
    .png()
    .toFile(dstPath);
}

async function captureDom(page) {
  // Capture page as PNG (non-alpha)
  return await page.screenshot({ type: 'png', omitBackground: false });
}

// -----------------------------------------------------------------------------
// Individual iPhone captures
// -----------------------------------------------------------------------------

async function iphone_1(page, log) {
  await gotoLevel(page, 1);
  await page.waitForTimeout(3000);
  // Walk south toward the nearest frozen survivor so one is near center of the
  // frame; the camera follows the hero, so moving hero south brings the
  // survivor into the lower half while fire/pad stay visible above.
  for (let step = 0; step < 10; step++) {
    const s = await readState(page);
    if (!s) break;
    const tgt = s.survivors.find(x => x.state === 'frozen');
    if (!tgt) break;
    const d = Math.hypot(tgt.lx - s.playerLX, tgt.ly - s.playerLY);
    if (d < 200) break; // close enough: survivor in lower half
    const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, tgt.lx, tgt.ly));
    await drag(page, deg, 1000);
  }
  await page.waitForTimeout(500);
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_1.png');
  await finalizePhone(buf, dst);
  log('iphone_1', { state: await readState(page) });
  return dst;
}

async function iphone_2(page, log) {
  await gotoLevel(page, 1);
  await page.waitForTimeout(800);
  // Walk south toward nearest frozen survivor; stop once one is 'thawing'
  const t0 = Date.now();
  let reached = false;
  while (Date.now() - t0 < 25000) {
    const s = await readState(page);
    if (!s || s.gameOver || s.playerDead) break;
    const sv = s.survivors.find(x => x.state === 'thawing');
    if (sv) { reached = true; break; }
    const near = s.survivors.find(x => x.state === 'frozen');
    if (!near) break;
    const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, near.lx, near.ly));
    await drag(page, deg, 700);
  }
  // Wait so thaw bar is about half (thaw time 3s → wait ~1.3s)
  await page.waitForTimeout(1300);
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_2.png');
  await finalizePhone(buf, dst);
  log('iphone_2', { state: await readState(page), reached });
  return dst;
}

async function iphone_3(page, log) {
  await gotoLevel(page, 2);
  await page.waitForTimeout(1500);
  const s0 = await readState(page);
  const firePos = { x: s0.fireX, y: s0.fireY };
  const padPos  = (s0.padX && s0.padY) ? { x: s0.padX, y: s0.padY } : null;
  const padCost = 65; // L2 tent pad cost

  // Run up to 3 fire cycles so we have >= padCost coins
  for (let cyc = 0; cyc < 4; cyc++) {
    let s = await readState(page);
    if (!s || s.trees.length === 0) break;
    // nearest tree
    let best = null, bd = Infinity;
    for (const t of s.trees) {
      const d = Math.hypot(t.x - s.playerLX, t.y - s.playerLY);
      if (d < bd) { bd = d; best = t; }
    }
    // Walk to tree
    for (let i = 0; i < 10; i++) {
      s = await readState(page);
      const d = Math.hypot(best.x - s.playerLX, best.y - s.playerLY);
      if (d < 55) break;
      const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, best.x, best.y));
      await drag(page, deg, 800);
    }
    await page.waitForTimeout(2200);
    // Walk back to fire
    for (let i = 0; i < 12; i++) {
      s = await readState(page);
      const d = Math.hypot(firePos.x - s.playerLX, firePos.y - s.playerLY);
      if (d < 55) break;
      const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, firePos.x, firePos.y));
      await drag(page, deg, 800);
    }
    await page.waitForTimeout(700);
    s = await readState(page);
    if (s && s.coins >= padCost) break;
  }
  // Walk to pad and start paying
  if (padPos) {
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      const s = await readState(page);
      if (!s) break;
      if (s.coinsPaidForTent > 0 && s.coinsPaidForTent < padCost) break;
      if (s.tentBuilt) break;
      const d = Math.hypot(padPos.x - s.playerLX, padPos.y - s.playerLY);
      if (d > 40) {
        const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, padPos.x, padPos.y));
        await drag(page, deg, 600);
      } else {
        await page.waitForTimeout(500);
      }
    }
    // Pay bar now visibly partial — a short dwell to let paint settle
    await page.waitForTimeout(600);
  }
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_3.png');
  await finalizePhone(buf, dst);
  log('iphone_3', { state: await readState(page) });
  return dst;
}

async function iphone_4(page, log) {
  await gotoLevel(page, 4);
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const s = await readState(page);
    if (!s) break;
    const hauling = s.survivors.find(w => w.workerState === 'haul' && w.workerHaulId === 'fish_raw');
    const station = s.stations.find(st => (st.kind || '').toLowerCase().includes('fish') && (st.outputCount ?? 0) > 0);
    if (hauling || station) break;
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(500);
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_4.png');
  await finalizePhone(buf, dst);
  log('iphone_4', { state: await readState(page) });
  return dst;
}

async function iphone_5(page, log) {
  await gotoLevel(page, 5);
  const t0 = Date.now();
  while (Date.now() - t0 < 50000) {
    const s = await readState(page);
    if (!s) { await page.waitForTimeout(500); continue; }
    if (s.fishCaught >= 1 && (Date.now() - t0) > 25000) break;
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(500);
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_5.png');
  await finalizePhone(buf, dst);
  log('iphone_5', { state: await readState(page) });
  return dst;
}

async function iphone_6(page, log) {
  await gotoLevel(page, 6);
  const t0 = Date.now();
  let gotIt = false;
  while (Date.now() - t0 < 60000) {
    const s = await readState(page);
    if (!s) { await page.waitForTimeout(500); continue; }
    const lunger = s.animals.find(a => a.state === 'lunge' || a.state === 'windup');
    if (lunger) {
      // Point hero toward it
      const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, lunger.lx, lunger.ly));
      await drag(page, deg, 300);
      gotIt = true;
      break;
    }
    await page.waitForTimeout(400);
  }
  if (!gotIt) { /* Fallback: capture whatever we have, may show chase/idle */ }
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_6.png');
  await finalizePhone(buf, dst);
  log('iphone_6', { state: await readState(page), gotLunge: gotIt });
  return dst;
}

async function iphone_7(page, log) {
  await gotoLevel(page, 7);
  await page.waitForTimeout(1200);
  const s0 = await readState(page);
  const firePos = { x: s0.fireX, y: s0.fireY };
  // Get all frozen survivor positions from live state
  const frozens = s0.survivors.filter(x => x.state === 'frozen').map(x => ({ x: x.lx, y: x.ly }));
  // Thaw first 2 by walking out and standing in range for ~4s each
  for (let i = 0; i < Math.min(2, frozens.length); i++) {
    const f = frozens[i];
    for (let step = 0; step < 15; step++) {
      const s = await readState(page);
      if (!s) break;
      const d = Math.hypot(f.x - s.playerLX, f.y - s.playerLY);
      if (d < 70) break;
      const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, f.x, f.y));
      await drag(page, deg, 900);
    }
    await page.waitForTimeout(4500);
    // Walk back near fire so follower survivor becomes worker
    for (let step = 0; step < 12; step++) {
      const s = await readState(page);
      if (!s) break;
      const d = Math.hypot(firePos.x - s.playerLX, firePos.y - s.playerLY);
      if (d < 60) break;
      const deg = snapAngle(angleBetween(s.playerLX, s.playerLY, firePos.x, firePos.y));
      await drag(page, deg, 900);
    }
    await page.waitForTimeout(1500);
  }
  // Wait for planks to be produced
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const s = await readState(page);
    if (!s) break;
    if (s.planksProduced > 0) break;
    // Keep fire topped up by doing idle moves
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(500);
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_7.png');
  await finalizePhone(buf, dst);
  log('iphone_7', { state: await readState(page) });
  return dst;
}

async function iphone_8(page, log) {
  await gotoLevel(page, 8);
  await page.waitForTimeout(1500);
  // Wait for mill to produce ≥10 planks (up to 90s)
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const s = await readState(page);
    if (!s) { await page.waitForTimeout(500); continue; }
    if (s.planksProduced >= 10) break;
    await page.waitForTimeout(1000);
  }
  // Now walk to cabin pad
  const s = await readState(page);
  if (s && s.padX && s.padY) {
    const padPos = { x: s.padX, y: s.padY };
    for (let i = 0; i < 25; i++) {
      const s2 = await readState(page);
      if (!s2) break;
      if (s2.coinsPaidForTent > 0) break;
      const d = Math.hypot(padPos.x - s2.playerLX, padPos.y - s2.playerLY);
      if (d > 45) {
        const deg = snapAngle(angleBetween(s2.playerLX, s2.playerLY, padPos.x, padPos.y));
        await drag(page, deg, 700);
      } else {
        await page.waitForTimeout(600);
      }
    }
    // Dwell so build bar is visibly partial
    await page.waitForTimeout(1200);
  }
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_8.png');
  await finalizePhone(buf, dst);
  log('iphone_8', { state: await readState(page) });
  return dst;
}

async function iphone_9(page, log) {
  await gotoLevel(page, 9);
  await page.waitForTimeout(45000);
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_9.png');
  await finalizePhone(buf, dst);
  log('iphone_9', { state: await readState(page) });
  return dst;
}

async function iphone_10(page, log) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });
  await page.waitForTimeout(5000);
  const buf = await captureDom(page);
  const dst = path.join(IPHONE_DIR, 'iphone_10.png');
  await finalizePhone(buf, dst);
  log('iphone_10', { menu: true });
  return dst;
}

// -----------------------------------------------------------------------------
// IAP review captures (1024×1536 iPad portrait, highlight overlay)
// -----------------------------------------------------------------------------

// Open ShopScene directly via scene.start on __game.
async function openShop(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 15000 });
  // Wait for MainMenu / game to be ready
  for (let i = 0; i < 40; i++) {
    const hasGame = await page.evaluate(() => !!(window.__game && window.__game.scene)).catch(() => false);
    if (hasGame) break;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1500);
  // Start ShopScene directly
  await page.evaluate(() => {
    const g = window.__game;
    // Stop other scenes
    for (const key of ['MainMenuScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','SettingsScene','EndlessScene','ChapterTeaserScene']) {
      try { g.scene.stop(key); } catch {}
    }
    try { g.scene.start('ShopScene', { from: 'MainMenuScene' }); } catch {}
  });
  // Wait for shop to be fully created
  for (let i = 0; i < 40; i++) {
    const ok = await page.evaluate(() => {
      const g = window.__game;
      const sc = g?.scene.getScene('ShopScene');
      return !!(sc && sc.sys && sc.sys.isActive() && sc.coinBalanceText);
    }).catch(() => false);
    if (ok) break;
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1200);
}

// Read shop layout: card geometry per item. We have access to scene container y
// and item sizes based on H. Return array of { id, cy, h } in current container coords.
async function readShopLayout(page) {
  return page.evaluate(() => {
    const g = window.__game;
    const sc = g.scene.getScene('ShopScene');
    if (!sc) return null;
    const W = sc.scale.width, H = sc.scale.height;
    const safeT = Math.max(Math.round(H * 0.04), 16);
    const headerH = Math.max(56, safeT + 48);
    const topBarH = safeT + 54;
    const featuredH = Math.round(H * 0.165);
    const rowH = Math.round(H * 0.098);
    const gap = 8;
    const cardW = W * 0.92;
    const listStartY = Math.max(topBarH + 10, headerH + 10);

    // Same order as ShopScene items[]
    const order = [
      { id: 'starter_pack', featured: true },
      { id: 'remove_ads' },
      { id: 'coins_small' },
      { id: 'coins_medium' },
      { id: 'coins_large' },
      { id: 'extra_worker' },
      { id: 'carry_plus2' },
      { id: 'fast_chop' },
    ];
    let curY = 0;
    const rects = [];
    for (const it of order) {
      const h = it.featured ? featuredH : rowH;
      const cy = curY + h / 2;
      rects.push({ id: it.id, cy, h, cardW });
      curY += h + gap;
    }
    const totalListH = curY - gap;
    // container.y is also relevant
    const container = sc.children.list.find(o => o.type === 'Container');
    return {
      W, H, headerH, listStartY, totalListH, cardW,
      containerY: container ? container.y : listStartY,
      containerInitialY: listStartY,
      rects,
    };
  });
}

// Scroll the Phaser shop container so that a target card is placed at `targetCardScreenY` on screen.
// cy and container.y relate as: screenY = container.y + cy.
async function scrollShopTo(page, productId, targetScreenY) {
  await page.evaluate(({ productId, targetScreenY }) => {
    const sc = window.__game.scene.getScene('ShopScene');
    const container = sc.children.list.find(o => o.type === 'Container');
    const W = sc.scale.width, H = sc.scale.height;
    const safeT = Math.max(Math.round(H * 0.04), 16);
    const headerH = Math.max(56, safeT + 48);
    const topBarH = safeT + 54;
    const featuredH = Math.round(H * 0.165);
    const rowH = Math.round(H * 0.098);
    const gap = 8;
    const listStartY = Math.max(topBarH + 10, headerH + 10);
    const order = [
      { id: 'starter_pack', featured: true },
      { id: 'remove_ads' },
      { id: 'coins_small' },
      { id: 'coins_medium' },
      { id: 'coins_large' },
      { id: 'extra_worker' },
      { id: 'carry_plus2' },
      { id: 'fast_chop' },
    ];
    let curY = 0, foundCy = 0, foundH = 0;
    for (const it of order) {
      const h = it.featured ? featuredH : rowH;
      const cy = curY + h / 2;
      if (it.id === productId) { foundCy = cy; foundH = h; }
      curY += h + gap;
    }
    const totalListH = curY - gap;
    const bottomH = 50;
    const minScrollY = listStartY + Math.min(0, H - listStartY - totalListH - bottomH);
    // Want: container.y + foundCy ≈ targetScreenY
    let desiredY = targetScreenY - foundCy;
    if (desiredY < minScrollY) desiredY = minScrollY;
    if (desiredY > listStartY) desiredY = listStartY;
    container.y = desiredY;
  }, { productId, targetScreenY });
  await page.waitForTimeout(250);
}

// Compute card rect in screen coords after scroll
async function cardScreenRect(page, productId) {
  return page.evaluate((productId) => {
    const sc = window.__game.scene.getScene('ShopScene');
    const container = sc.children.list.find(o => o.type === 'Container');
    const W = sc.scale.width, H = sc.scale.height;
    const safeT = Math.max(Math.round(H * 0.04), 16);
    const headerH = Math.max(56, safeT + 48);
    const featuredH = Math.round(H * 0.165);
    const rowH = Math.round(H * 0.098);
    const gap = 8;
    const cardW = W * 0.92;
    const order = [
      { id: 'starter_pack', featured: true },
      { id: 'remove_ads' },
      { id: 'coins_small' },
      { id: 'coins_medium' },
      { id: 'coins_large' },
      { id: 'extra_worker' },
      { id: 'carry_plus2' },
      { id: 'fast_chop' },
    ];
    let curY = 0, foundCy = 0, foundH = 0;
    for (const it of order) {
      const h = it.featured ? featuredH : rowH;
      const cy = curY + h / 2;
      if (it.id === productId) { foundCy = cy; foundH = h; }
      curY += h + gap;
    }
    const screenCy = container.y + foundCy;
    const cx = W / 2;
    const x = cx - cardW / 2;
    const y = screenCy - foundH / 2;
    return { x, y, w: cardW, h: foundH, screenCy, headerH };
  }, productId);
}

// Inject a DOM overlay highlight at a given rect (CSS px, same coord system as the Phaser canvas CSS size).
async function injectHighlight(page, rect) {
  await page.evaluate(({ rect }) => {
    // Remove any previous overlay
    const prev = document.getElementById('__iap_highlight');
    if (prev) prev.remove();
    const div = document.createElement('div');
    div.id = '__iap_highlight';
    const canvas = document.querySelector('canvas');
    const cb = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    // Convert from Phaser internal coords to CSS pixels: we set the viewport to
    // match Phaser's logical size, so scale factor is cb.width / sc.scale.width.
    const scW = window.__game.scene.getScene('ShopScene').scale.width;
    const scH = window.__game.scene.getScene('ShopScene').scale.height;
    const sx = cb.width / scW;
    const sy = cb.height / scH;
    const left = cb.left + rect.x * sx;
    const top  = cb.top  + rect.y * sy;
    const w    = rect.w * sx;
    const h    = rect.h * sy;
    Object.assign(div.style, {
      position: 'fixed',
      left:  (left - 6) + 'px',
      top:   (top - 6) + 'px',
      width: (w + 12) + 'px',
      height:(h + 12) + 'px',
      border: '12px solid #44ff88',
      borderRadius: '20px',
      boxShadow: '0 0 40px 10px rgba(68,255,136,0.5)',
      opacity: '0.75',
      pointerEvents: 'none',
      zIndex: 99999,
      boxSizing: 'border-box',
    });
    document.body.appendChild(div);
  }, { rect });
  // Give the browser one frame to paint
  await page.waitForTimeout(150);
}

async function clearHighlight(page) {
  await page.evaluate(() => {
    const prev = document.getElementById('__iap_highlight');
    if (prev) prev.remove();
  });
}

async function captureIAP(page, productId, log) {
  // Scroll so target card center sits a bit below the header
  const layout = await readShopLayout(page);
  // Place target card so its top is just below the header (card top ≈ headerH + 20)
  // We want the CARD CENTER at headerH + h/2 + 20; but we don't know h ahead cheaply — use conservative: header + 160.
  // Actually just center-of-card target = headerH + 150. For feature it's bigger; still fine.
  const targetY = layout.headerH + 160;
  await scrollShopTo(page, productId, targetY);
  await page.waitForTimeout(300);
  const rect = await cardScreenRect(page, productId);
  await injectHighlight(page, rect);
  await page.waitForTimeout(250);
  const buf = await captureDom(page);
  const dst = path.join(IAP_DIR, `${productId}.png`);
  await finalizeIAP(buf, dst);
  await clearHighlight(page);
  log(`iap:${productId}`, { rect });
  return dst;
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  await mkdir(IPHONE_DIR, { recursive: true });
  await mkdir(IAP_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  const report = [];
  const log = (label, info) => { report.push({ label, info }); console.log(`[ok] ${label}`); };

  // ── Phone captures ──────────────────────────────────────────────────────────
  const phoneShots = [
    { name: 'iphone_1',  fn: iphone_1 },
    { name: 'iphone_2',  fn: iphone_2 },
    { name: 'iphone_3',  fn: iphone_3 },
    { name: 'iphone_4',  fn: iphone_4 },
    { name: 'iphone_5',  fn: iphone_5 },
    { name: 'iphone_6',  fn: iphone_6 },
    { name: 'iphone_7',  fn: iphone_7 },
    { name: 'iphone_8',  fn: iphone_8 },
    { name: 'iphone_9',  fn: iphone_9 },
    { name: 'iphone_10', fn: iphone_10 },
  ];
  for (const shot of phoneShots) {
    const ctx = await browser.newContext({
      viewport: VP_PHONE,
      deviceScaleFactor: DPR_PHONE,
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    });
    const page = await ctx.newPage();
    const conErrs = [];
    page.on('console', m => { if (m.type() === 'error') conErrs.push(m.text()); });
    page.on('pageerror', e => conErrs.push(e.message));
    try {
      const dst = await shot.fn(page, log);
      report.push({ file: dst });
      if (conErrs.length) console.log(`  [console errs on ${shot.name}: ${conErrs.length}]`);
    } catch (e) {
      console.log(`[FAIL] ${shot.name}: ${e.message}`);
      report.push({ label: shot.name, info: { error: e.message } });
    }
    await ctx.close();
  }

  // ── IAP captures ────────────────────────────────────────────────────────────
  const iapIds = ['remove_ads', 'starter_pack', 'coins_small', 'coins_medium', 'coins_large'];
  const iapCtx = await browser.newContext({
    viewport: VP_IAP,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const iapPage = await iapCtx.newPage();
  try {
    await openShop(iapPage);
  } catch (e) {
    console.log(`[FAIL] openShop: ${e.message}`);
  }
  for (const id of iapIds) {
    try {
      const dst = await captureIAP(iapPage, id, log);
      report.push({ file: dst });
    } catch (e) {
      console.log(`[FAIL] iap:${id}: ${e.message}`);
      report.push({ label: `iap:${id}`, info: { error: e.message } });
    }
  }
  await iapCtx.close();
  await browser.close();

  // Final report
  console.log('\n=== CAPTURE REPORT ===');
  for (const r of report) console.log(JSON.stringify(r));
}

main().catch(e => { console.error(e); process.exit(1); });

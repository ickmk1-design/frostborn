/**
 * App Store / IAP review screenshots for Frostborn.
 * - 5 iPad 13" game captures at 2064x2752 portrait PNG
 * - 5 IAP-review captures (same shop screen) at 1024x1536 portrait PNG
 *
 * Launches Chromium via Playwright against the live web build at
 * https://cytbilisim.com/frostborn/game/.
 *
 * Output:
 *   C:/Users/ickmk/Frostborn/store_assets/ipad_13/ipad_{1..5}.png
 *   C:/Users/ickmk/Frostborn/store_assets/iap_review/{productId}.png
 */

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'fs/promises';
import sharp from 'sharp';
import path from 'path';

const BASE = 'https://cytbilisim.com/frostborn/game/';
const IPAD_DIR = 'C:/Users/ickmk/Frostborn/store_assets/ipad_13';
const IAP_DIR  = 'C:/Users/ickmk/Frostborn/store_assets/iap_review';

const IPAD_VP = { width: 2064, height: 2752 };
const IAP_VP  = { width: 1024, height: 1536 };

// Report rows accumulated for the final log
const report = [];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function waitForGame(page, { requireScene = 'GameScene', timeoutMs = 40000 } = {}) {
  await page.waitForFunction(
    (scn) => !!(window.__game && window.__game.scene && window.__game.scene.getScene(scn)),
    requireScene,
    { timeout: timeoutMs },
  ).catch(() => { /* fall through; flag later */ });
}

async function readState(page) {
  return page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const sc = g.scene.getScene('GameScene');
    if (!sc) return null;
    return {
      fuel:            sc.fuel ?? 0,
      fuelMax:         sc.cfg?.fire?.fuelMax ?? 100,
      currentStageIdx: sc.currentStageIdx ?? 0,
      playerLX:        sc.playerLX ?? 0,
      playerLY:        sc.playerLY ?? 0,
      playerDead:      sc.playerDead ?? false,
      gameOver:        sc.gameOver ?? false,
      goalStages:      (sc.goalStages ?? []).map(s => ({ type: s.type, target: s.target })),
      animals:         (sc.animals ?? []).map(a => ({ state: a.state, lx: a.lx, ly: a.ly })),
      survivors:       (sc.survivors ?? []).map(s => ({ state: s.state, workerState: s.workerState })),
      fireX:           sc.fireX ?? 0,
      fireY:           sc.fireY ?? 0,
      fish:            (sc.fish ?? sc.fishList ?? []).length ?? 0,
      planks:          sc.planks ?? sc.plankCount ?? 0,
    };
  }).catch(() => null);
}

// Drag the virtual joystick: pointer down at (ox,oy) then drag toward angle.
async function drag(page, ox, oy, angleDeg, px, durationMs) {
  const rad = angleDeg * Math.PI / 180;
  const ex = ox + Math.cos(rad) * px;
  const ey = oy + Math.sin(rad) * px;
  await page.mouse.move(ox, oy);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 3 });
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
  await page.waitForTimeout(80);
}

// Save flattened PNG (no alpha) at exact viewport size.
async function savePng(buf, outPath, targetW, targetH) {
  const dir = path.dirname(outPath);
  await mkdir(dir, { recursive: true });
  // Flatten against black, remove alpha, normalize dimensions (safety).
  const img = sharp(buf)
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .resize(targetW, targetH, { fit: 'cover', position: 'center' })
    .png({ compressionLevel: 9 });
  const out = await img.toBuffer();
  await writeFile(outPath, out);
  const md = await sharp(out).metadata();
  return { bytes: out.length, w: md.width, h: md.height };
}

// Try to detect that GameScene has gone (shop replaced it)
async function waitForScene(page, name, timeoutMs = 20000) {
  return page.waitForFunction(
    (n) => !!(window.__game && window.__game.scene.getScene(n) && window.__game.scene.getScene(n).scene.isActive()),
    name,
    { timeout: timeoutMs },
  ).catch(() => false);
}

// ── iPad 13" captures ─────────────────────────────────────────────────────────
async function captureIpad(browser) {
  const context = await browser.newContext({
    viewport: IPAD_VP,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
  });
  const page = await context.newPage();
  page.on('response', r => { if (r.status() >= 400) console.log(`  [${r.status()}] ${r.url()}`); });

  // ── 1. L1 camp overview ─────────────────────────────────────────────────────
  {
    const url = `${BASE}?level=1&noaudio=1`;
    console.log(`\n[iPad 1/5] L1 camp overview — ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    await page.waitForTimeout(5000);

    // Nudge hero a short distance east so he's near the fire but not on top.
    // Joystick spawns wherever pointer-downs — use the lower-right open area.
    const ox = IPAD_VP.width * 0.25;
    const oy = IPAD_VP.height * 0.80;
    await drag(page, ox, oy, 0 /* east */, 120, 600);
    await page.waitForTimeout(800);

    const state = await readState(page);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const info = await savePng(buf, `${IPAD_DIR}/ipad_1.png`, IPAD_VP.width, IPAD_VP.height);
    report.push({
      slot: 'ipad_1', file: `${IPAD_DIR}/ipad_1.png`,
      w: info.w, h: info.h, bytes: info.bytes,
      note: `L1 stage=${state?.currentStageIdx ?? '?'} fuel=${state?.fuel?.toFixed?.(0) ?? '?'}`,
    });
  }

  // ── 2. L5 fishing chain ─────────────────────────────────────────────────────
  {
    const url = `${BASE}?level=5&noaudio=1`;
    console.log(`\n[iPad 2/5] L5 fishing — ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    // Wait up to 25s for workers to engage ice holes / a fish to appear.
    const deadline = Date.now() + 25000;
    let state = null;
    while (Date.now() < deadline) {
      await page.waitForTimeout(1500);
      state = await readState(page);
      const workersBusy = state?.survivors?.some(s => s.workerState && s.workerState !== 'idle') ?? false;
      if ((state?.fish ?? 0) > 0 || workersBusy) break;
    }
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const info = await savePng(buf, `${IPAD_DIR}/ipad_2.png`, IPAD_VP.width, IPAD_VP.height);
    report.push({
      slot: 'ipad_2', file: `${IPAD_DIR}/ipad_2.png`,
      w: info.w, h: info.h, bytes: info.bytes,
      note: `L5 stage=${state?.currentStageIdx ?? '?'} fish=${state?.fish ?? 0} workerStates=${(state?.survivors ?? []).map(s => s.workerState).filter(Boolean).join(',') || 'none'}`,
    });
  }

  // ── 3. L6 wolves attack ─────────────────────────────────────────────────────
  {
    const url = `${BASE}?level=6&noaudio=1`;
    console.log(`\n[iPad 3/5] L6 wolves — ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    // Walk hero into the middle so he aggros wolves.
    const ox = IPAD_VP.width * 0.30;
    const oy = IPAD_VP.height * 0.78;
    // Hunt-mode: drive hero around for ~40s or until a wolf is lunging/windup.
    const deadline = Date.now() + 40000;
    let state = null;
    let bestBuf = null;
    while (Date.now() < deadline) {
      // Rotate direction so we explore outward from camp.
      const deg = Math.floor(Math.random() * 360);
      await drag(page, ox, oy, deg, 180, 700);
      state = await readState(page);
      const hostile = (state?.animals ?? []).some(a => a.state === 'lunge' || a.state === 'windup' || a.state === 'bite' || a.state === 'chase');
      if (hostile) {
        bestBuf = await page.screenshot({ type: 'png', fullPage: false });
        break;
      }
    }
    if (!bestBuf) bestBuf = await page.screenshot({ type: 'png', fullPage: false });
    const info = await savePng(bestBuf, `${IPAD_DIR}/ipad_3.png`, IPAD_VP.width, IPAD_VP.height);
    report.push({
      slot: 'ipad_3', file: `${IPAD_DIR}/ipad_3.png`,
      w: info.w, h: info.h, bytes: info.bytes,
      note: `L6 stage=${state?.currentStageIdx ?? '?'} wolfStates=${(state?.animals ?? []).map(a => a.state).join(',') || 'none'}`,
    });
  }

  // ── 4. L8 cabin building ────────────────────────────────────────────────────
  {
    const url = `${BASE}?level=8&noaudio=1`;
    console.log(`\n[iPad 4/5] L8 cabin — ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    // Wait for the mill cycle to start producing — ~25s.
    await page.waitForTimeout(25000);
    // Now steer hero toward the first build-pad using the game's own padX/padY.
    const s0 = await readState(page);
    if (s0 && s0.playerLX && s0.playerLY) {
      // Phaser scene has padX/padY exposed indirectly via the Bot; easiest: drive south-east toward map center.
      // Repeated short drags for 10s.
      const ox = IPAD_VP.width * 0.30;
      const oy = IPAD_VP.height * 0.78;
      for (let i = 0; i < 6; i++) {
        await drag(page, ox, oy, 30 + i * 10, 200, 900);
      }
    }
    await page.waitForTimeout(2500);
    const state = await readState(page);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const info = await savePng(buf, `${IPAD_DIR}/ipad_4.png`, IPAD_VP.width, IPAD_VP.height);
    report.push({
      slot: 'ipad_4', file: `${IPAD_DIR}/ipad_4.png`,
      w: info.w, h: info.h, bytes: info.bytes,
      note: `L8 stage=${state?.currentStageIdx ?? '?'} planks=${state?.planks ?? 0}`,
    });
  }

  // ── 5. Shop screen (iPad) ───────────────────────────────────────────────────
  {
    const url = BASE;
    console.log(`\n[iPad 5/5] Shop — ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for Phaser game to be alive. Any scene ok.
    await page.waitForFunction(() => !!(window.__game && window.__game.scene), { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(2500);
    // Jump straight to the shop scene.
    await page.evaluate(() => {
      const g = window.__game; if (!g) return;
      // Stop all active scenes except Boot/Load, then start ShopScene so it renders correctly.
      const toStop = ['MainMenuScene', 'LevelSelectScene', 'GameScene', 'UIScene', 'EndlessScene'];
      for (const k of toStop) {
        const s = g.scene.getScene(k);
        if (s && s.scene.isActive()) s.scene.stop();
      }
      g.scene.start('ShopScene', { from: 'LevelSelectScene' });
    });
    await waitForScene(page, 'ShopScene', 10000);
    await page.waitForTimeout(2000);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const info = await savePng(buf, `${IPAD_DIR}/ipad_5.png`, IPAD_VP.width, IPAD_VP.height);
    report.push({
      slot: 'ipad_5', file: `${IPAD_DIR}/ipad_5.png`,
      w: info.w, h: info.h, bytes: info.bytes,
      note: 'ShopScene active (start of list, featured starter_pack visible)',
    });
  }

  await context.close();
}

// ── IAP review captures ───────────────────────────────────────────────────────
// Open the shop at iPad 11" portrait (1024x1536), then for each product, scroll
// the shop container so that product's card is centered vertically.
async function captureIapReview(browser) {
  const context = await browser.newContext({
    viewport: IAP_VP,
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: false,
  });
  const page = await context.newPage();

  console.log(`\n[IAP] Loading shop at ${IAP_VP.width}x${IAP_VP.height}`);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.__game && window.__game.scene), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  await page.evaluate(() => {
    const g = window.__game; if (!g) return;
    const toStop = ['MainMenuScene', 'LevelSelectScene', 'GameScene', 'UIScene', 'EndlessScene'];
    for (const k of toStop) {
      const s = g.scene.getScene(k);
      if (s && s.scene.isActive()) s.scene.stop();
    }
    g.scene.start('ShopScene', { from: 'LevelSelectScene' });
  });
  await waitForScene(page, 'ShopScene', 10000);
  await page.waitForTimeout(2000);

  const productIds = ['starter_pack', 'remove_ads', 'coins_small', 'coins_medium', 'coins_large'];

  for (const pid of productIds) {
    console.log(`  [IAP] ${pid}`);
    // Compute the target card's Y relative to ShopScene's list container, then
    // slide the container so the card is centered.
    const shift = await page.evaluate((targetId) => {
      const g = window.__game;
      const shop = g.scene.getScene('ShopScene');
      if (!shop) return { ok: false, reason: 'no shop scene' };
      // Find the scroll container (depth 10, with children).
      const cont = shop.children.list.find(o => o.type === 'Container' && o.depth === 10);
      if (!cont) return { ok: false, reason: 'no container' };
      // Collect the y-centres of each card. Cards are a 'Graphics' + text.
      // Using known layout math from ShopScene:
      const W = shop.scale.width, H = shop.scale.height;
      const safeT = Math.max(Math.round(H * 0.04), 16);
      const topBarH   = safeT + 54;
      const headerH   = Math.max(56, safeT + 48);
      const featuredH = Math.round(H * 0.165);
      const rowH      = Math.round(H * 0.098);
      const gap       = 8;
      const bottomH   = 50;
      const items = ['starter_pack','remove_ads','coins_small','coins_medium','coins_large','extra_worker','carry_plus2','fast_chop'];
      const featured = ['starter_pack'];
      let totalListH = 0;
      const centers = {};
      let y = 0;
      for (const id of items) {
        const h = featured.includes(id) ? featuredH : rowH;
        centers[id] = y + h / 2;
        y += h + gap;
        totalListH = y;
      }
      totalListH -= gap;
      const listStartY = Math.max(topBarH + 10, headerH + 10);
      const minScrollY = listStartY + Math.min(0, H - listStartY - bottomH - totalListH);
      // We want the target card's absolute screen Y = H/2.
      // Container's y + targetCenterInContainer = H/2  →  cont.y = H/2 - targetCenter
      const targetContY = H / 2 - centers[targetId];
      const clamped = Math.min(listStartY, Math.max(minScrollY, targetContY));
      cont.y = clamped;
      return { ok: true, requestedY: targetContY, clampedY: clamped, listStartY, minScrollY, center: centers[targetId] };
    }, pid);

    await page.waitForTimeout(500);
    const buf = await page.screenshot({ type: 'png', fullPage: false });
    const info = await savePng(buf, `${IAP_DIR}/${pid}.png`, IAP_VP.width, IAP_VP.height);
    report.push({
      slot: `iap_${pid}`, file: `${IAP_DIR}/${pid}.png`,
      w: info.w, h: info.h, bytes: info.bytes,
      note: `Shop scrolled ${pid} centered (y=${shift?.clampedY?.toFixed(0) ?? '?'})`,
    });
  }

  await context.close();
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Launching Chromium headless…');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--autoplay-policy=no-user-gesture-required'],
  });

  try {
    await captureIpad(browser);
    await captureIapReview(browser);
  } catch (err) {
    console.error('Capture error:', err);
  } finally {
    await browser.close();
  }

  // Print the report
  console.log('\n────────────── REPORT ──────────────');
  for (const r of report) {
    console.log(`${r.slot.padEnd(14)} ${r.w}x${r.h}  ${(r.bytes / 1024).toFixed(0)} KB  ${r.file}`);
    console.log(`  ${r.note}`);
  }
})();

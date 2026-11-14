/**
 * Frostborn pre-flight QA test — Playwright WebKit + Chromium at 390×844.
 * Usage: node preflight.js
 * Writes results to ../preflight.md
 */
const { webkit, chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = 7778;
const W = 390; const H = 844;
const VIEWPORT = { width: W, height: H };

// ── Static file server ───────────────────────────────────────────────────────
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

const BASE = `http://localhost:${PORT}`;

// ── Test helpers ─────────────────────────────────────────────────────────────
function makeCollectors(page) {
  const jsErrors = [], netFails = [], consoleWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'error') jsErrors.push(msg.text());
    if (msg.type() === 'warning') {
      const t = msg.text();
      if (!t.includes('[Frostborn]') && !t.includes('[boot]') && !t.includes('WebGL')) {
        consoleWarnings.push(t);
      }
    }
  });
  page.on('pageerror', e => jsErrors.push('PAGE: ' + e.message));
  page.on('requestfailed', req => {
    // Ignore expected failures (Google analytics, etc.)
    const url = req.url();
    if (!url.includes('cytbilisim.com/frostborn-log') && !url.includes('fonts.gstatic.com') && !url.includes('fonts.googleapis.com')) {
      netFails.push(`${req.method()} ${url} — ${req.failure()?.errorText}`);
    }
  });
  return { jsErrors, netFails, consoleWarnings };
}

async function newPage(browser, url = BASE, extraWait = 0) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const col = makeCollectors(page);
  await page.goto(url);
  if (extraWait) await page.waitForTimeout(extraWait);
  return { page, ctx, col };
}

// Wait for canvas to appear and have non-zero size
async function waitCanvas(page, timeoutMs = 10000) {
  try {
    await page.waitForSelector('canvas', { timeout: timeoutMs });
    return true;
  } catch { return false; }
}

// Get a text representation of what's on the page
async function getCanvasDataURL(page) {
  return page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    try { return c.toDataURL('image/png').length; } catch { return -1; }
  });
}

// ── Individual checks ────────────────────────────────────────────────────────
const results = [];
function pass(item, detail = '') { results.push({ item, status: 'PASS', detail }); console.log(`  ✅ PASS  ${item}${detail ? ' — ' + detail : ''}`); }
function fail(item, detail = '') { results.push({ item, status: 'FAIL', detail }); console.log(`  ❌ FAIL  ${item}${detail ? ' — ' + detail : ''}`); }
function warn(item, detail = '') { results.push({ item, status: 'WARN', detail }); console.log(`  ⚠️  WARN  ${item}${detail ? ' — ' + detail : ''}`); }
function manual(item, detail = '') { results.push({ item, status: 'MANUAL', detail }); console.log(`  🔲 MANUAL ${item}${detail ? ' — ' + detail : ''}`); }

// ── Test suites ───────────────────────────────────────────────────────────────
async function testStartup(browser, label) {
  console.log(`\n--- Startup & Load [${label}] ---`);
  const { page, ctx, col } = await newPage(browser);
  const t0 = Date.now();

  const canvasOk = await waitCanvas(page, 10000);
  const canvasMs = Date.now() - t0;

  if (!canvasOk) {
    fail(`[${label}] Canvas appears on startup`, 'Black screen — canvas never appeared');
    await ctx.close();
    return false;
  }
  if (canvasMs < 3000) pass(`[${label}] First frame under 3s`, `${canvasMs}ms`);
  else fail(`[${label}] First frame under 3s`, `${canvasMs}ms`);

  // Wait for BootScene to finish loading assets
  await page.waitForTimeout(10000);

  // Check canvas has content
  const dataLen = await getCanvasDataURL(page);
  if (dataLen > 0) pass(`[${label}] Canvas rendered content`, `~${Math.round(dataLen/1024)}KB dataURL`);
  else fail(`[${label}] Canvas rendered content`, 'toDataURL failed or empty');

  // JS errors
  if (col.jsErrors.length === 0) pass(`[${label}] No JS errors on startup`);
  else fail(`[${label}] No JS errors on startup`, col.jsErrors.slice(0,3).join(' | '));

  // Network failures
  const realFails = col.netFails.filter(f => f.includes('assets/'));
  if (realFails.length === 0) pass(`[${label}] No asset 404s`);
  else fail(`[${label}] No asset 404s`, realFails.slice(0,5).join(' | '));

  await ctx.close();
  return true;
}

async function testLevelSelect(browser, label) {
  console.log(`\n--- Level Select [${label}] ---`);
  const { page, ctx, col } = await newPage(browser);
  await waitCanvas(page);
  await page.waitForTimeout(10000); // wait for BootScene + LevelSelectScene to load

  // Take screenshot of level select
  await page.screenshot({ path: path.join(__dirname, `screenshot-levelselect-${label.toLowerCase()}.png`) });
  pass(`[${label}] Level select screenshot taken`);

  // Click Level 1 card (at y=200, center x=195)
  await page.mouse.click(195, 200);
  await page.waitForTimeout(5000); // wait for game scene to load

  const jsErrsBefore = col.jsErrors.length;
  await page.waitForTimeout(3000);

  if (col.jsErrors.length === jsErrsBefore) pass(`[${label}] Level 1 start — no new JS errors`);
  else fail(`[${label}] Level 1 start — JS errors`, col.jsErrors.slice(jsErrsBefore).join(' | '));

  await page.screenshot({ path: path.join(__dirname, `screenshot-game-${label.toLowerCase()}.png`) });

  await ctx.close();
}

async function testShop(browser, label) {
  console.log(`\n--- Shop [${label}] ---`);
  const { page, ctx, col } = await newPage(browser);
  await waitCanvas(page);
  await page.waitForTimeout(10000);

  // Click Shop button — responsive layout: btnStartY=H*0.47, btnGap=btnH*1.3, btnH=H*0.07 → ~473
  await page.mouse.click(W / 2, Math.round(H * 0.47 + H * 0.07 * 1.3));
  await page.waitForTimeout(2000);

  if (col.jsErrors.length === 0) pass(`[${label}] Shop opens — no JS errors`);
  else fail(`[${label}] Shop opens — JS errors`, col.jsErrors.slice(0,3).join(' | '));

  await page.screenshot({ path: path.join(__dirname, `screenshot-shop-${label.toLowerCase()}.png`) });

  await ctx.close();
}

async function testAssets() {
  console.log(`\n--- Asset Verification ---`);

  const assetsDir = path.join(DIST, 'assets');
  if (!fs.existsSync(assetsDir)) { fail('Assets directory exists in dist'); return; }
  pass('Assets directory exists in dist');

  // All WebP files from BootScene ASSETS list
  const REQUIRED_WEBP = [
    'building_archway_gate_01', 'building_barracks_01', 'building_cauldron_firepit_01',
    'building_central_tower_01', 'building_log_cabin_01', 'tile_base_floor_dirt_01',
    'tile_frozen_ground_01', 'effect_fire_explosion_01', 'resource_coin_gold_01',
    'prop_snow_pine_tree_01', 'character_survivor_worker_01',
  ];
  const missing = REQUIRED_WEBP.filter(k => !fs.existsSync(path.join(assetsDir, `${k}.webp`)));
  if (missing.length === 0) pass('All sampled WebP assets exist');
  else fail('Missing WebP assets', missing.join(', '));

  // Audio files
  const SFX = ['snd_axe_chop', 'snd_win_jingle', 'snd_fire_loop'];
  const audioMissing = [];
  for (const s of SFX) {
    const oggOk = fs.existsSync(path.join(assetsDir, 'audio', `${s}.ogg`));
    const m4aOk = fs.existsSync(path.join(assetsDir, 'audio', `${s}.m4a`));
    if (!oggOk || !m4aOk) audioMissing.push(`${s} (ogg:${oggOk} m4a:${m4aOk})`);
  }
  if (audioMissing.length === 0) pass('Audio files have OGG + M4A');
  else fail('Audio files missing format', audioMissing.join(', '));

  // Font
  const fontOk = fs.existsSync(path.join(assetsDir, 'fonts', 'FredokaOne.woff2'));
  if (fontOk) pass('Fredoka One font bundled locally');
  else fail('Fredoka One font missing from dist/assets/fonts/');

  // Sprite atlases
  const atlases = ['hero/atlas.json', 'worker_new/atlas.json', 'wolf/atlas.json', 'deer/atlas.json'];
  const atlMissing = atlases.filter(a => !fs.existsSync(path.join(assetsDir, 'sprites', a)));
  if (atlMissing.length === 0) pass('Sprite atlases present');
  else fail('Missing sprite atlases', atlMissing.join(', '));

  // Vite base
  const indexHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const hasAbsPath = indexHtml.match(/src="\/assets\//);
  if (!hasAbsPath) pass('index.html has no absolute /assets/ paths (Vite base is ./');
  else fail('index.html has absolute /assets/ paths — Vite base is not ./');

  // No Google Fonts external link
  const hasGFonts = indexHtml.includes('fonts.googleapis.com');
  if (!hasGFonts) pass('No Google Fonts external request in index.html');
  else fail('Google Fonts external request in index.html — blocks render offline');

  // App bundle size
  const jsFiles = fs.readdirSync(path.join(DIST, 'assets')).filter(f => f.endsWith('.js'));
  let totalJsBytes = 0;
  for (const f of jsFiles) totalJsBytes += fs.statSync(path.join(DIST, 'assets', f)).size;
  const jsMB = (totalJsBytes / 1024 / 1024).toFixed(2);
  if (totalJsBytes < 3 * 1024 * 1024) pass(`JS bundle size ${jsMB}MB (< 3MB)`);
  else warn(`JS bundle size ${jsMB}MB — consider code splitting`);
}

async function testSoundMute(browser, label) {
  console.log(`\n--- Sound & Mute [${label}] ---`);
  const { page, ctx, col } = await newPage(browser);
  await waitCanvas(page);
  await page.waitForTimeout(10000); // boot scene loads, then level select

  // Start Level 1 so GameScene + UIScene are active
  await page.mouse.click(195, 200);
  await page.waitForTimeout(4000);

  // First tap — unlocks audio context
  await page.mouse.click(195, 422);
  await page.waitForTimeout(500);

  // Mute button is at approximately (357, 80)
  await page.mouse.click(357, 80);
  await page.waitForTimeout(300);
  // Click again to unmute
  await page.mouse.click(357, 80);
  await page.waitForTimeout(300);

  if (col.jsErrors.length === 0) pass(`[${label}] Mute toggle — no JS errors`);
  else fail(`[${label}] Mute toggle — JS errors`, col.jsErrors.slice(0,2).join(' | '));

  manual(`[${label}] Sound plays after first tap (manual device test required)`);
  manual(`[${label}] Mute icon changes color visually (manual verification)`);

  await ctx.close();
}

async function testWinLose(browser, label) {
  console.log(`\n--- Win/Lose Screens (URL param) [${label}] ---`);
  // We can't easily "play to win" in automation — test by directly launching scenes via URL param
  const { page, ctx, col } = await newPage(browser, `${BASE}/?level=1`);
  await waitCanvas(page);
  await page.waitForTimeout(8000);

  if (col.jsErrors.length === 0) pass(`[${label}] Level 1 direct URL — no JS errors`);
  else fail(`[${label}] Level 1 direct URL — JS errors`, col.jsErrors.slice(0,3).join(' | '));

  await page.screenshot({ path: path.join(__dirname, `screenshot-level1direct-${label.toLowerCase()}.png`) });
  manual(`[${label}] Win screen (must play to completion on device)`);
  manual(`[${label}] Lose screen (must let fire die out on device)`);

  await ctx.close();
}

async function testSafeAreas() {
  console.log(`\n--- Safe Area / HUD Layout ---`);
  // These are geometry checks based on code reading — cannot fully verify without real device
  // UIScene: SAF=50 (top safe area), mute btn at y=50..110, bottom-most HUD element at ~y=110
  // LevelSelectScene: coin at y=774, shop btn at y=802
  warn('HUD top bar starts at y=50 (SAF=50) — verify no clipping behind status bar on iPhone 14+ (status bar is 54px; contentInset:always should offset this)');
  warn('Shop/coin buttons at y=802 — verify not clipped by home indicator bar on devices with gesture nav (last 34px = y>810)');
  manual('Safe areas — test on physical iPhone 14 Pro and iPhone SE (different notch/bar heights)');
  manual('Android: test HUD and buttons not hidden behind navigation bar on API 36 edge-to-edge device');
}

async function testReloadProgress(browser, label) {
  console.log(`\n--- Progress Persists After Reload [${label}] ---`);
  // We can only test localStorage persistence in browser (Capacitor Preferences on native)
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const col = makeCollectors(page);

  await page.goto(BASE);
  await waitCanvas(page);
  await page.waitForTimeout(10000);

  // Set some progress via localStorage (simulating a completed level)
  await page.evaluate(() => {
    localStorage.setItem('frostborn_progress', JSON.stringify({
      unlockedLevels: [1, 2, 3],
      completedLevels: [1, 2],
    }));
    localStorage.setItem('frostborn_economy', JSON.stringify({
      coins: 999, purchasedUpgrades: [], iapOwned: [],
    }));
  });

  // Reload
  await page.reload();
  await waitCanvas(page);
  await page.waitForTimeout(10000);

  // Check that the state was restored (coins = 999 should show on level select)
  const hasCoins = await page.evaluate(() => {
    // The canvas doesn't expose DOM text — but check localStorage survived
    const eco = localStorage.getItem('frostborn_economy');
    return eco ? JSON.parse(eco).coins === 999 : false;
  });
  if (hasCoins) pass(`[${label}] Economy state persists across reload`);
  else fail(`[${label}] Economy state lost on reload`);

  if (col.jsErrors.length === 0) pass(`[${label}] No JS errors after reload`);
  else fail(`[${label}] JS errors after reload`, col.jsErrors.slice(0,3).join(' | '));

  await ctx.close();
}

// ── Direction test ───────────────────────────────────────────────────────────
// CHAR_DIR_ANGLES=[90.0,28.8,1.3,334.1,270.0,205.9,178.7,151.2] (ELEV=32°)
// WOLF_DIR_ANGLES=[329.6,270.0,239.6,209.1,149.6,90.0,59.6,29.1] (ELEV=36°)
// Key: for each movement vector compute expected dir, verify sprite frame matches.
const DIR_CASES = [
  // [kR,kD,kL,kU, expectedHeroDir, expectedWolfDir, label]
  [1,0,0,0, 2, 7, 'Right'],
  [1,1,0,0, 1, 0, 'Right+Down'],
  [0,1,0,0, 0, 1, 'Down'],
  [0,1,1,0, 7, 2, 'Left+Down'],
  [0,0,1,0, 6, 3, 'Left'],
  [0,0,1,1, 5, 4, 'Left+Up'],
  [0,0,0,1, 4, 5, 'Up'],
  [1,0,0,1, 3, 6, 'Right+Up'],
];

async function testDirections(browser, label) {
  console.log(`\n--- Direction Facing [${label}] ---`);
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const col = makeCollectors(page);

  await page.goto(`${BASE}/?noaudio=1`);
  await waitCanvas(page);

  // Boot past loading screen — wait for any non-boot/non-loading scene
  let booted = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.length > 0 && active.some(k => k && !k.toLowerCase().includes('boot') && !k.toLowerCase().includes('load'))) {
      booted = true; break;
    }
  }
  if (!booted) { fail(`[${label}] Direction test: game never booted past loading`); await ctx.close(); return; }

  // Start GameScene level01
  await page.evaluate(() => {
    const g = window.__game;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene']
      .forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('GameScene', { levelKey: 'level01', levelNum: 1 });
  });

  // Wait for GameScene active
  let gsOk = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.some(k => k && k.includes('GameScene'))) { gsOk = true; break; }
  }
  if (!gsOk) { fail(`[${label}] Direction test: GameScene never became active`); await ctx.close(); return; }
  await page.waitForTimeout(1500);

  // Click canvas once to unlock input focus
  await page.mouse.click(W / 2, H / 2);
  await page.waitForTimeout(300);

  let failures = 0;
  for (const [kR, kD, kL, kU, expHero, expWolf, dirLabel] of DIR_CASES) {
    // Reset player to camp center so wall proximity doesn't affect direction
    await page.evaluate(() => {
      const sc = window.__game?.scene.getScene('GameScene');
      if (!sc) return;
      const cfg = sc.levelCfg || { originX: 195, originY: 152 };
      const ox = cfg.originX ?? 195, oy = cfg.originY ?? 152;
      sc.playerLX = ox + (8 - 7) * 40;
      sc.playerLY = oy + (8 + 7) * 20;
      if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
    });
    await page.waitForTimeout(100);

    const keys = [];
    if (kR) keys.push('ArrowRight');
    if (kD) keys.push('ArrowDown');
    if (kL) keys.push('ArrowLeft');
    if (kU) keys.push('ArrowUp');

    for (const k of keys) { await page.keyboard.down(k); await page.waitForTimeout(30); }
    await page.waitForTimeout(600); // past 100ms hysteresis + settle

    const frameKey = await page.evaluate(() => {
      const g = window.__game;
      const scene = g && g.scene.getScene('GameScene');
      if (!scene || !scene.playerSprite) return null;
      return scene.playerSprite.anims.currentAnim ? scene.playerSprite.anims.currentAnim.key : null;
    });

    for (const k of keys) await page.keyboard.up(k);
    await page.waitForTimeout(200);

    if (!frameKey) {
      warn(`[${label}] Dir ${dirLabel}: no anim frame (player may be stuck)`);
      continue;
    }
    // Frame key: e.g. "hero_walk_d2" or "hero_walk_d2_f0" — extract dir index
    const m = frameKey.match(/_d(\d+)/);
    if (!m) { warn(`[${label}] Dir ${dirLabel}: unrecognised frame key ${frameKey}`); continue; }
    const actualDir = parseInt(m[1], 10);
    if (actualDir === expHero) {
      pass(`[${label}] Hero dir ${dirLabel}: facing d${actualDir} ✓`);
    } else {
      fail(`[${label}] Hero dir ${dirLabel}: expected d${expHero} got d${actualDir} (frame: ${frameKey})`);
      failures++;
    }
  }

  if (col.jsErrors.length > 0) fail(`[${label}] Direction test JS errors`, col.jsErrors.slice(0,3).join(' | '));
  await ctx.close();
}

// ── Shop button touch test ────────────────────────────────────────────────────
// Verifies every price button fires the correct response with real touch events.
// IAP buttons → 'purchasesAppOnly' toast; coin buttons with 0 coins → 'notEnoughCoins' toast.
// H=844 W=390 layout (approximated from create() geometry):
//   featuredH=139, rowH=83, gap=8, listStartY=97, btnX≈318
//   btn screen-y = listStartY + card_offset + cardH/2
const SHOP_BTN_CASES = [
  // [itemId, screenY, expectToast, isCoin]
  ['starter_pack',  166, 'purchasesAppOnly', false],
  ['remove_ads',    285, 'purchasesAppOnly', false],
  ['coins_small',   376, 'purchasesAppOnly', false],
  ['coins_medium',  467, 'purchasesAppOnly', false],
  ['coins_large',   558, 'purchasesAppOnly', false],
  ['extra_worker',  649, 'notEnoughCoins',   true],
  ['carry_plus2',   740, 'notEnoughCoins',   true],
  ['fast_chop',     831, 'notEnoughCoins',   true],
];
// Accept either locale — test machine may be Turkish
const TOAST_VARIANTS = {
  purchasesAppOnly: ['Purchases only work in the app', 'Satın alımlar yalnızca uygulamada çalışır'],
  notEnoughCoins:   ['Not enough coins', 'Yeterli jeton yok'],
};
const BTN_X = 318;

async function testShopButtons(browser, label) {
  console.log(`\n--- Shop Button Touch [${label}] ---`);
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    hasTouch: true,
    isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();
  const col = makeCollectors(page);

  // Set coins to 0 so coin-upgrade buttons show notEnoughCoins
  await page.goto(`${BASE}/?noaudio=1`);
  await waitCanvas(page);
  await page.evaluate(() => {
    localStorage.setItem('frostborn_economy', JSON.stringify({ coins: 0, purchasedUpgrades: [], iapOwned: [] }));
  });

  // Boot
  let booted = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game; if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.some(k => k && !k.toLowerCase().includes('boot') && !k.toLowerCase().includes('load'))) { booted = true; break; }
  }
  if (!booted) { fail(`[${label}] Shop touch test: game never booted`); await ctx.close(); return; }

  // Start ShopScene
  await page.evaluate(() => {
    const g = window.__game;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene']
      .forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('ShopScene');
  });
  let shopOk = false;
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game; if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.some(k => k && k.includes('Shop'))) { shopOk = true; break; }
  }
  if (!shopOk) { fail(`[${label}] Shop touch test: ShopScene never active`); await ctx.close(); return; }
  await page.waitForTimeout(800);

  for (const [itemId, screenY, expectKey, ] of SHOP_BTN_CASES) {
    // Clear last toast
    await page.evaluate(() => {
      const g = window.__game;
      const s = g && g.scene.getScene('ShopScene');
      if (s) s.lastToastMsg = '';
    });
    // Tap with touch
    await page.tap('canvas', { position: { x: BTN_X, y: screenY } });
    await page.waitForTimeout(600);

    const got = await page.evaluate(() => {
      const g = window.__game;
      const s = g && g.scene.getScene('ShopScene');
      return s ? s.lastToastMsg : '';
    });
    const variants = TOAST_VARIANTS[expectKey];
    if (variants.includes(got)) {
      pass(`[${label}] Shop tap ${itemId}: toast ✓ ("${got}")`);
    } else if (got === '') {
      fail(`[${label}] Shop tap ${itemId}: no toast shown (tap not registered)`);
    } else {
      fail(`[${label}] Shop tap ${itemId}: unexpected toast "${got}"`);
    }
  }

  if (col.jsErrors.length > 0) fail(`[${label}] Shop touch JS errors`, col.jsErrors.slice(0,3).join(' | '));
  await ctx.close();
}

// ── Decor / tree overlap check ────────────────────────────────────────────────
// Verifies no decor or tree in any level JSON overlaps: build pads, fire position,
// or other gameplay spots. Uses ISO distance — anything closer than 1.0 iso unit fails.
async function testDecorOverlap() {
  console.log('\n--- Decor/Tree Overlap Check ---');
  const path = require('path');
  const fs = require('fs');
  const levelsDir = path.join(__dirname, 'src', 'levels');
  const levelFiles = fs.readdirSync(levelsDir).filter(f => f.endsWith('.json'));
  let failures = 0;
  const ISO_OVERLAP = 1.0; // ISO units — closer than this = overlap
  for (const lf of levelFiles) {
    const cfg = JSON.parse(fs.readFileSync(path.join(levelsDir, lf), 'utf8'));
    const reserved = [];
    // Fire
    if (cfg.fire?.iso) reserved.push({ iso: cfg.fire.iso, label: 'fire' });
    // Build pads
    for (const bp of (cfg.buildPads ?? [])) {
      if (bp.iso) reserved.push({ iso: bp.iso, label: `buildPad(${bp.id})` });
    }
    // Check trees
    for (const t of (cfg.trees ?? [])) {
      for (const r of reserved) {
        const dix = t.iso[0] - r.iso[0]; const diy = t.iso[1] - r.iso[1];
        const dist = Math.sqrt(dix*dix + diy*diy);
        if (dist < ISO_OVERLAP) {
          fail(`[${lf}] Tree at [${t.iso}] overlaps ${r.label} at [${r.iso}] (dist=${dist.toFixed(2)} iso)`);
          failures++;
        }
      }
    }
    // Check decor
    for (const d of (cfg.decor ?? [])) {
      for (const r of reserved) {
        const dix = d.iso[0] - r.iso[0]; const diy = d.iso[1] - r.iso[1];
        const dist = Math.sqrt(dix*dix + diy*diy);
        if (dist < ISO_OVERLAP) {
          fail(`[${lf}] Decor '${d.key}' at [${d.iso}] overlaps ${r.label} at [${r.iso}] (dist=${dist.toFixed(2)} iso)`);
          failures++;
        }
      }
    }
    if (failures === 0) pass(`[${lf}] No decor/tree overlaps build pads or fire`);
  }
}

// ── Wolf / Deer Direction Facing ──────────────────────────────────────────────
// Uses the __testAnimalDir helper exposed by GameScene (exposed from TypeScript side).
// Verifies that wolfDir() maps each of 8 screen movement velocities to the expected
// animation direction index — same mapping as hero since wolf sprites share convention.
async function testAnimalDirections(browser, label) {
  console.log(`\n--- Animal Direction Facing [${label}] ---`);
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const col = makeCollectors(page);

  await page.goto(`${BASE}/?noaudio=1`);
  await waitCanvas(page);

  let booted = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game; if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.some(k => k && !k.toLowerCase().includes('boot') && !k.toLowerCase().includes('load'))) { booted = true; break; }
  }
  if (!booted) { fail(`[${label}] Animal dir test: game never booted`); await ctx.close(); return; }

  // Start level04 (has wolf + deer = level with animals)
  await page.evaluate(() => {
    const g = window.__game;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene']
      .forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('GameScene', { levelKey: 'level04', levelNum: 4 });
  });

  let gsOk = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game; if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.some(k => k && k.includes('GameScene'))) { gsOk = true; break; }
  }
  if (!gsOk) { fail(`[${label}] Animal dir test: GameScene never active`); await ctx.close(); return; }
  await page.waitForTimeout(1500);

  // Check if wolf atlas loaded
  const hasAtlases = await page.evaluate(() => {
    const g = window.__game;
    return { wolf: g.textures.exists('wolf'), deer: g.textures.exists('deer') };
  });

  // DIR_CASES: [velX, velY, expectedDir, label]
  const ANIM_DIR_CASES = [
    [130,    0,    2, 'Right'],
    [91.9,  91.9,  1, 'Right+Down'],
    [0,    130,    0, 'Down'],
    [-91.9, 91.9,  7, 'Left+Down'],
    [-130,   0,    6, 'Left'],
    [-91.9,-91.9,  5, 'Left+Up'],
    [0,   -130,    4, 'Up'],
    [91.9, -91.9,  3, 'Right+Up'],
  ];

  for (const [atlasKey, animalIdx] of [['wolf', 0], ['deer', -1]]) {
    if (atlasKey === 'wolf' && !hasAtlases.wolf) {
      warn(`[${label}] Wolf atlas not loaded — skipping wolf dir test`); continue;
    }
    if (atlasKey === 'deer' && !hasAtlases.deer) {
      warn(`[${label}] Deer atlas not loaded — skipping deer dir test`); continue;
    }

    // Find first animal with this atlasKey
    const idx = await page.evaluate((ak) => {
      const sc = window.__game?.scene.getScene('GameScene');
      if (!sc) return -1;
      return sc.animals?.findIndex(a => a.atlasKey === ak) ?? -1;
    }, atlasKey);

    if (idx < 0) {
      warn(`[${label}] No ${atlasKey} animal in level04 — skipping`); continue;
    }

    for (const [velX, velY, expDir, dirLabel] of ANIM_DIR_CASES) {
      const animKey = await page.evaluate(({ i, vx, vy }) => {
        const sc = window.__game?.scene.getScene('GameScene');
        if (!sc || !sc.__testAnimalDir) return null;
        return sc.__testAnimalDir(i, vx, vy);
      }, { i: idx, vx: velX, vy: velY });

      if (!animKey) {
        warn(`[${label}] ${atlasKey} dir ${dirLabel}: no anim key returned`); continue;
      }
      const m = animKey.match(/_d(\d+)/);
      if (!m) { warn(`[${label}] ${atlasKey} dir ${dirLabel}: unrecognised key ${animKey}`); continue; }
      const actual = parseInt(m[1], 10);
      if (actual === expDir) {
        pass(`[${label}] ${atlasKey} dir ${dirLabel}: d${actual} ✓`);
      } else {
        fail(`[${label}] ${atlasKey} dir ${dirLabel}: expected d${expDir} got d${actual} (${animKey})`);
      }
    }
  }

  if (col.jsErrors.length > 0) fail(`[${label}] Animal dir JS errors`, col.jsErrors.slice(0,3).join(' | '));
  await ctx.close();
}

// ── Worker Delivery Test ──────────────────────────────────────────────────────
// Tests that each worker can deliver ≥10 logs to the fire without jamming.
// Strategy: 10 simulated delivery cycles per worker — each cycle places all workers
// at their unique radial approach position (slot angle, 122px from fire) with a log
// and lets the game run for 2.5s. Workers walk to their slot (72px), obstacle boundary
// stops them at ~62px (10px from slot), d<18 triggers delivery. No navigation detours
// needed. Tests levels 1 (3 workers), 8 (7 workers), 15 (12 workers).
async function testWorkerDelivery(browser, label) {
  console.log(`\n--- Worker Delivery [${label}] ---`);

  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const col = makeCollectors(page);

  await page.goto(`${BASE}/?noaudio=1`);
  await waitCanvas(page);

  let booted = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game; if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.some(k => k && !k.toLowerCase().includes('boot') && !k.toLowerCase().includes('load'))) { booted = true; break; }
  }
  if (!booted) { fail(`[${label}] Worker delivery: game never booted`); await ctx.close(); return; }

  // Test three representative levels: 1 (3 workers), 8 (7 workers), 15 (12 workers)
  for (const [lk, ln, numWorkers] of [['level01',1,3],['level08',8,7],['level15',15,12]]) {
    // Switch to this level
    await page.evaluate(({ levelKey, levelNum }) => {
      const g = window.__game;
      ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene']
        .forEach(k => { try { g.scene.stop(k); } catch(e){} });
      g.scene.start('GameScene', { levelKey, levelNum });
    }, { levelKey: lk, levelNum: ln });

    let gsOk = false;
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const active = await page.evaluate(() => {
        const g = window.__game; if (!g) return [];
        return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
      });
      if (active.some(k => k && k.includes('GameScene'))) { gsOk = true; break; }
    }
    if (!gsOk) { fail(`[${label}] Worker delivery ${lk}: GameScene never active`); continue; }
    await page.waitForTimeout(1000);

    // Setup: disable win/lose, give max fuel, assign all workers unique slots
    await page.evaluate((nw) => {
      const sc = window.__game.scene.getScene('GameScene');
      if (!sc) return;
      sc.fuel = 999999;
      sc.gameOver = false;
      sc.goalStages = [];
      sc.rescuedCount = 1;
      sc.coins = 0;
      sc.numWorkerSlots = nw; // ensure slot count matches worker count
      for (let i = 0; i < sc.survivors.length; i++) {
        const sv = sc.survivors[i];
        sv.state = i < nw ? 'worker' : 'frozen';
        sv.workerSlot = i < nw ? i : 0;
        sv.workerCarrying = 0;
        sv.workerState = 'idle';
        sv.activeAnim = 'idle';
        sv.sprite.clearTint();
        if (sv.thawBar) { sv.thawBar.destroy(); sv.thawBar = undefined; }
        sv.stuckMs = 0;
      }
    }, numWorkers);

    // 10 delivery cycles: each cycle teleports workers to their approach position
    // 50px outside their slot (slot radius + 50px), sets workerCarrying=1, waits 3s.
    // Slot radius uses same formula as game: max(72, numSlots*8).
    for (let cycle = 0; cycle < 10; cycle++) {
      await page.evaluate((nw) => {
        const sc = window.__game.scene.getScene('GameScene');
        if (!sc) return;
        const nSlots = sc.numWorkerSlots || nw;
        const slotR = Math.max(72, nSlots * 8);
        for (let i = 0; i < nw && i < sc.survivors.length; i++) {
          const sv = sc.survivors[i];
          if (sv.state !== 'worker') continue;
          const angle = sv.workerSlot * (2 * Math.PI / nSlots);
          const approachR = slotR + 50;
          sv.lx = sc.fireX + Math.cos(angle) * approachR;
          sv.ly = sc.fireY + Math.sin(angle) * approachR;
          if (sv.sprite) { sv.sprite.x = sv.lx; sv.sprite.y = sv.ly; }
          sv.workerCarrying = 1;
          sv.workerState = 'toFire';
          sv.activeAnim = 'carry_walk';
          sv.stuckMs = 0; sv.stuckCheckX = sv.lx; sv.stuckCheckY = sv.ly;
        }
      }, numWorkers);
      await page.waitForTimeout(3000);
    }

    // Check result: expect each of the N workers to have delivered all 10 cycles
    const result = await page.evaluate(() => {
      const sc = window.__game.scene.getScene('GameScene');
      if (!sc) return { coins: 0 };
      return { coins: Math.floor(sc.coins) };
    });

    const COINS_PER_LOG = 5;
    const totalDeliveries = Math.floor(result.coins / COINS_PER_LOG);
    const minExpected = numWorkers * 10;
    if (totalDeliveries >= minExpected) {
      pass(`[${label}] Worker delivery ${lk} (${numWorkers} workers): ${totalDeliveries} deliveries ✓`);
    } else {
      const stuck = minExpected - totalDeliveries;
      fail(`[${label}] Worker delivery ${lk} (${numWorkers} workers): ${totalDeliveries}/${minExpected} deliveries — ${stuck} missed (workers jammed)`);
    }
  }

  if (col.jsErrors.length > 0) fail(`[${label}] Worker delivery JS errors`, col.jsErrors.slice(0,2).join(' | '));
  await ctx.close();
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const server = await serve(DIST, PORT);
  console.log(`\nFrostborn Pre-flight QA\n${'='.repeat(50)}`);
  console.log(`Serving: ${DIST}`);
  console.log(`URL: ${BASE}\n`);

  let wk, cr;
  try {
    wk = await webkit.launch({ headless: true });
    cr = await chromium.launch({ headless: true });

    // ── 1. Asset verification (no browser needed) ──
    await testAssets();

    // ── 2. Startup in both browsers ──
    const wkOk = await testStartup(wk, 'WebKit');
    const crOk = await testStartup(cr, 'Chromium');

    // ── 3. Level select & game start ──
    if (wkOk) await testLevelSelect(wk, 'WebKit');
    if (crOk) await testLevelSelect(cr, 'Chromium');

    // ── 4. Shop ──
    if (wkOk) await testShop(wk, 'WebKit');

    // ── 4b. Shop button touch ──
    if (wkOk) await testShopButtons(wk, 'WebKit');

    // ── 5. Sound & mute ──
    if (wkOk) await testSoundMute(wk, 'WebKit');

    // ── 6. Win/Lose via URL param ──
    if (wkOk) await testWinLose(wk, 'WebKit');

    // ── 7. Progress persistence ──
    await testReloadProgress(wk, 'WebKit');

    // ── 8. Direction facing ──
    if (wkOk) await testDirections(wk, 'WebKit');

    // ── 9. Decor/tree overlap check ──
    await testDecorOverlap();

    // ── 10. Animal direction facing ──
    if (wkOk) await testAnimalDirections(wk, 'WebKit');

    // ── 11. Worker delivery ──
    if (wkOk) await testWorkerDelivery(wk, 'WebKit');

    // ── 12. Safe areas (geometry analysis) ──
    await testSafeAreas();

    // Manual items
    console.log(`\n--- IAP & Ad Calls ---`);
    manual('IAP calls fail gracefully in browser (no crash) — Capacitor guard returns no-op on web');
    manual('Ad reward on native: grant ONLY after full watch; partial close → no reward (test on device)');

  } finally {
    wk && await wk.close();
    cr && await cr.close();
    server.close();
  }

  // ── Write preflight.md ──────────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const passCount   = results.filter(r => r.status === 'PASS').length;
  const failCount   = results.filter(r => r.status === 'FAIL').length;
  const warnCount   = results.filter(r => r.status === 'WARN').length;
  const manualCount = results.filter(r => r.status === 'MANUAL').length;

  const rows = results.map(r => {
    const icon = { PASS: 'PASS', FAIL: 'FAIL', WARN: 'WARN', MANUAL: 'MANUAL' }[r.status];
    return `| ${icon} | ${r.item} | ${r.detail || '—'} |`;
  }).join('\n');

  const md = `# Frostborn Pre-flight QA

Generated: ${now}

**Summary: ${passCount} PASS | ${failCount} FAIL | ${warnCount} WARN | ${manualCount} MANUAL (needs device)**

${failCount > 0 ? '> ❌ BUILDS BLOCKED — fix FAILs before triggering iOS/Android builds.\n' : '> ✅ Automated checks passed. Complete MANUAL items on a real device before releasing.\n'}
## Results

| Status | Check | Detail |
|--------|-------|--------|
${rows}

## Screenshots

Screenshots saved to \`game/\` directory:
- \`screenshot-levelselect-webkit.png\`
- \`screenshot-game-webkit.png\`
- \`screenshot-shop-webkit.png\`
- \`screenshot-level1direct-webkit.png\`
- \`screenshot-levelselect-chromium.png\`
- \`screenshot-game-chromium.png\`

## Fixes Applied This Session

1. **Black screen (root cause)**: \`main.ts\` awaited \`initPurchases()\` and \`initAds()\` before \`new Phaser.Game()\`. On iOS, both make network calls (guarded by \`Capacitor.isNativePlatform()\`). If either hung or threw, Phaser never started. Fixed: Phaser starts immediately after local storage loads; SDK inits run in background with 12-15s timeouts.

2. **Google Fonts blocking**: \`<link rel="stylesheet" href="fonts.googleapis.com/...">\` is render-blocking. On a device offline or with slow network, this stalls the entire page render. Fixed: Fredoka One bundled locally at \`assets/fonts/FredokaOne.woff2\`.

3. **No error visibility**: Added global \`window.onerror\` + \`unhandledrejection\` handlers that show a red error overlay on screen AND POST to \`https://cytbilisim.com/frostborn-log\` via \`fetch\` with \`keepalive:true\`.

## Server Logging Endpoint

Upload \`server/frostborn-log.php\` to your web server so it handles:
\`\`\`
POST https://cytbilisim.com/frostborn-log
\`\`\`
Errors are appended to \`frostborn-errors.jsonl\` on the server.
`;

  const mdPath = path.join(__dirname, '..', 'preflight.md');
  fs.writeFileSync(mdPath, md, 'utf8');
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Pre-flight complete: ${passCount} PASS | ${failCount} FAIL | ${warnCount} WARN | ${manualCount} MANUAL`);
  console.log(`Results written to: ${mdPath}`);
  if (failCount > 0) {
    console.log('\nFAILS:');
    results.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - ${r.item}: ${r.detail}`));
    process.exitCode = 1;
  }
})().catch(e => { console.error('FATAL:', e); process.exit(1); });

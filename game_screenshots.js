/**
 * Game review screenshots: levels 1-4 (start + mid-game), shop, settings,
 * level select, pause popup. WebKit at 393×852.
 */
const { webkit } = require('C:/Users/ickmk/Frostborn/game/node_modules/playwright');
const fs = require('fs');

const OUT_DIR = 'C:/Users/ickmk/Frostborn/review_screenshots';
const BASE = 'http://localhost:4173/?noaudio=1';
const W = 393, H = 852;

async function wait(page, ms) { await page.waitForTimeout(ms); }

async function shot(page, name) {
  const p = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path: p });
  console.log(`✓ ${name}`);
  return p;
}

async function waitForScene(page, sceneName, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const active = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return null;
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.key);
    });
    if (active && active.some(k => k && k.includes(sceneName))) return active;
    // Only early-exit on boot/load → non-boot transition (not scene→scene)
    if (!sceneName && active && active.length > 0 && !active.some(k => k && (k.toLowerCase().includes('boot') || k.toLowerCase().includes('load')))) return active;
    await wait(page, 500);
  }
  return null;
}

async function goToScene(page, sceneKey, extraWaitMs = 2000) {
  await page.evaluate((key) => {
    const g = window.__game;
    if (!g) return;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene'].forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start(key);
  }, sceneKey);
  await waitForScene(page, sceneKey, 25000);
  await wait(page, extraWaitMs);
}

async function navigateToScene(page, sceneKey) {
  await goToScene(page, sceneKey);
}

// isoToScreen: ox=195, oy=152, tileW=80, tileH=40
function isoToScreen(ix, iy) {
  return { lx: 195 + (ix - iy) * 40, ly: 152 + (ix + iy) * 20 };
}

async function teleportPlayer(page, isoX, isoY) {
  const { lx, ly } = isoToScreen(isoX, isoY);
  await page.evaluate(({ x, y }) => {
    const g = window.__game;
    if (!g) return;
    const scene = g.scene.getScene('GameScene');
    if (!scene) return;
    // TypeScript private fields are plain JS props in compiled output
    scene.playerLX = x; scene.playerLY = y;
    if (scene.playerSprite) { scene.playerSprite.x = x; scene.playerSprite.y = y; }
    scene.cameras.main.centerOn(x, y);
  }, { x: lx, y: ly });
  await wait(page, 1200);
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();

  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));

  console.log('Loading game...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForSelector('canvas', { timeout: 10000 });

  // Wait for game to boot past loading screen
  console.log('Waiting for boot...');
  await waitForScene(page, 'MainMenu', 30000);
  await wait(page, 1000);
  await shot(page, '00_main_menu');

  // ── Level Select ─────────────────────────────────────────────────────────────
  await goToScene(page, 'LevelSelectScene', 1500);
  await shot(page, '01_level_select');

  // ── Level 1 ──────────────────────────────────────────────────────────────────
  await goToScene(page, 'GameScene', 500);
  // GameScene needs levelIndex; use evaluate with data
  await page.evaluate(() => {
    const g = window.__game;
    if (!g) return;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene'].forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('GameScene', { levelKey: 'level01', levelNum: 1 });
  });
  await waitForScene(page, 'GameScene', 25000);
  await wait(page, 2000);
  await shot(page, '02_level01_start');
  await wait(page, 12000);
  await shot(page, '03_level01_midgame');

  // ── Pause popup — pause button is in UIScene at (W-26, CTR_Y=74) ─────────────
  await page.click('canvas', { position: { x: 367, y: 74 } });
  await wait(page, 1200);
  await shot(page, '04_pause_popup');
  // Dismiss by clicking canvas center
  await page.click('canvas', { position: { x: W/2, y: H/2 } });
  await wait(page, 500);

  // ── Level 2 ── (wolves at iso [5,15] and [11,15]) ────────────────────────────
  await page.evaluate(() => {
    const g = window.__game;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene'].forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('GameScene', { levelKey: 'level02', levelNum: 2 });
  });
  await waitForScene(page, 'GameScene', 25000);
  await wait(page, 2000);
  await shot(page, '05_level02_start');
  // Move player between the wolves
  await teleportPlayer(page, 8, 15);
  await wait(page, 5000);
  await shot(page, '06_level02_wolves');

  // ── Level 3 ── (wolves deeper, iso ~[8,18]) ───────────────────────────────────
  await page.evaluate(() => {
    const g = window.__game;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene'].forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('GameScene', { levelKey: 'level03', levelNum: 3 });
  });
  await waitForScene(page, 'GameScene', 25000);
  await wait(page, 2000);
  await shot(page, '07_level03_start');
  await teleportPlayer(page, 8, 17);
  await wait(page, 5000);
  await shot(page, '08_level03_wolves');

  // ── Level 4 ── (alpha wolf at iso [8,20], regular wolves at [5,17] [11,17]) ──
  await page.evaluate(() => {
    const g = window.__game;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene'].forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('GameScene', { levelKey: 'level04', levelNum: 4 });
  });
  await waitForScene(page, 'GameScene', 25000);
  await wait(page, 2000);
  await shot(page, '09_level04_start');
  // Move just north of alpha wolf (wolf at [8,20], player at [8,16])
  await teleportPlayer(page, 8, 16);
  await wait(page, 3000);
  await shot(page, '10_level04_alphawolf_visible');
  // Wait for aggro and combat
  await wait(page, 6000);
  await shot(page, '10b_level04_alphawolf_combat');

  // ── Shop ─────────────────────────────────────────────────────────────────────
  await goToScene(page, 'ShopScene', 1500);
  await shot(page, '11_shop');

  // ── Settings — stop ShopScene and use setTimeout to start SettingsScene ──────
  await page.evaluate(() => {
    const g = window.__game;
    // Stop all then wait one Phaser frame before starting SettingsScene
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene'].forEach(k => { try { g.scene.stop(k); } catch(e){} });
    setTimeout(() => { try { g.scene.start('SettingsScene'); } catch(e){ console.error('Settings start failed:', e); } }, 300);
  });
  await waitForScene(page, 'SettingsScene', 15000);
  await wait(page, 2000);
  await shot(page, '12_settings');

  await browser.close();
  console.log(`\nAll screenshots in: ${OUT_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });

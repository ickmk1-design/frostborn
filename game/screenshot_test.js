/**
 * Screenshot verification for HP bar and wall collision.
 * Run with: node screenshot_test.js
 */
const { webkit } = require('playwright');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DIST = path.join(__dirname, 'dist');
const PORT = 7779;
const BASE = `http://localhost:${PORT}`;
const W = 393; const H = 852;
const SHOTS_DIR = path.join(__dirname, 'screenshots');
if (!fs.existsSync(SHOTS_DIR)) fs.mkdirSync(SHOTS_DIR);

function serve(distDir, port) {
  const MIME = { '.html':'text/html','.js':'application/javascript','.css':'text/css',
    '.webp':'image/webp','.png':'image/png','.json':'application/json','.ogg':'audio/ogg','.m4a':'audio/mp4',
    '.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf' };
  const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    const file = path.join(distDir, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

async function bootToGameScene(page, levelKey = 'level03', levelNum = 3) {
  await page.goto(`${BASE}/?noaudio=1`);
  await page.waitForSelector('canvas', { timeout: 10000 });

  // Wait for boot past loading screen
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
  if (!booted) throw new Error('Game never booted');

  // Switch to GameScene
  await page.evaluate(({ lk, ln }) => {
    const g = window.__game;
    ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene']
      .forEach(k => { try { g.scene.stop(k); } catch(e){} });
    g.scene.start('GameScene', { levelKey: lk, levelNum: ln });
  }, { lk: levelKey, ln: levelNum });

  // Wait for GameScene active
  let gsOk = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500);
    const active = await page.evaluate(() => {
      const g = window.__game; if (!g) return [];
      return g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key);
    });
    if (active.some(k => k && k.includes('GameScene'))) { gsOk = true; break; }
  }
  if (!gsOk) throw new Error('GameScene never became active');
  await page.waitForTimeout(1500);
}

async function run() {
  const server = await serve(DIST, PORT);
  console.log(`Server at ${BASE}`);

  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const page = await ctx.newPage();

  await bootToGameScene(page, 'level03', 3);

  // Check initial state
  const initState = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    return { playerHp: sc.playerHp, playerHpMax: sc.playerHpMax, playerLX: Math.round(sc.playerLX), playerLY: Math.round(sc.playerLY), hpBarDepth: sc.playerHpBarGfx?.depth };
  });
  console.log('Initial state:', initState);

  // ── Test 1: HP bar at 60% ─────────────────────────────────────────────────
  console.log('\nTest 1: HP bar at 60%...');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    sc.playerHp = Math.floor(sc.playerHpMax * 0.6);
    // Move player outside camp to disable regen (iso 8,15 → south outside wall)
    sc.playerLX = 195 + (8 - 15) * 40;  // ox + (ix-iy)*HW
    sc.playerLY = 152 + (8 + 15) * 20;  // oy + (ix+iy)*HH
    if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS_DIR, '01_hpbar_60pct.png') });
  const state1 = await page.evaluate(() => { const sc = window.__game.scene.getScene('GameScene'); return { hp: sc.playerHp, max: sc.playerHpMax }; });
  console.log('  HP state:', state1, '→ screenshots/01_hpbar_60pct.png');

  // ── Test 2: HP bar at 20% (red) ───────────────────────────────────────────
  console.log('Test 2: HP bar at 20%...');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    sc.playerHp = Math.max(1, Math.floor(sc.playerHpMax * 0.2));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS_DIR, '02_hpbar_20pct.png') });
  console.log('  → screenshots/02_hpbar_20pct.png');

  // ── Test 3: Wolf at south palisade ────────────────────────────────────────
  console.log('Test 3: Wolf at south palisade...');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    if (!sc.animals?.length) return;
    const ox = 195, oy = 152, HW = 40, HH = 20;
    // Place wolf just south of camp (iy=12.8) trying to reach player
    sc.animals[0].lx = ox + (8 - 13.0) * HW;
    sc.animals[0].ly = oy + (8 + 13.0) * HH;
    sc.animals[0].state = 'circle';
    sc.animals[0].stateTimer = 5000;
    // Player inside camp south area
    sc.playerLX = ox + (8 - 11) * HW;
    sc.playerLY = oy + (8 + 11) * HH;
    if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS_DIR, '03_wolf_south_wall.png') });
  console.log('  → screenshots/03_wolf_south_wall.png');

  // ── Test 4: Wolf approaching east wall ────────────────────────────────────
  console.log('Test 4: Wolf at east wall...');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    if (!sc.animals?.length) return;
    const ox = 195, oy = 152, HW = 40, HH = 20;
    sc.animals[0].lx = ox + (14 - 7) * HW;
    sc.animals[0].ly = oy + (14 + 7) * HH;
    sc.animals[0].state = 'circle';
    sc.animals[0].stateTimer = 5000;
    sc.playerLX = ox + (12 - 7) * HW;
    sc.playerLY = oy + (12 + 7) * HH;
    if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS_DIR, '04_wolf_east_wall.png') });
  console.log('  → screenshots/04_wolf_east_wall.png');

  // ── Test 5: Alpha wolf at west wall ────────────────────────────────────────
  console.log('Test 5: Alpha at west wall...');
  await bootToGameScene(page, 'level04', 4);
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    if (!sc.animals?.length) return;
    const alpha = sc.animals.find(a => a.isBoss) || sc.animals[0];
    const ox = 195, oy = 152, HW = 40, HH = 20;
    // Place alpha just outside west wall (ix=3), at iy=7
    alpha.lx = ox + (1.0 - 7) * HW;  // ix=1.0, well outside wall
    alpha.ly = oy + (1.0 + 7) * HH;
    alpha.state = 'circle';
    alpha.stateTimer = 5000;
    if (alpha.sprite) { alpha.sprite.x = alpha.lx; alpha.sprite.y = alpha.ly; }
    // Player inside camp (west side)
    sc.playerLX = ox + (5 - 7) * HW;
    sc.playerLY = oy + (5 + 7) * HH;
    if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, '05_alpha_west_wall.png') });
  console.log('  → screenshots/05_alpha_west_wall.png');

  // ── Test 6: Alpha wolf at south wall ───────────────────────────────────────
  console.log('Test 6: Alpha at south wall...');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    if (!sc.animals?.length) return;
    const alpha = sc.animals.find(a => a.isBoss) || sc.animals[0];
    const ox = 195, oy = 152, HW = 40, HH = 20;
    // Place alpha just outside south wall (iy=12), at ix=8
    alpha.lx = ox + (8 - 15) * HW;
    alpha.ly = oy + (8 + 15) * HH;
    alpha.state = 'circle';
    alpha.stateTimer = 5000;
    if (alpha.sprite) { alpha.sprite.x = alpha.lx; alpha.sprite.y = alpha.ly; }
    sc.playerLX = ox + (8 - 11) * HW;
    sc.playerLY = oy + (8 + 11) * HH;
    if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, '06_alpha_south_wall.png') });
  console.log('  → screenshots/06_alpha_south_wall.png');

  // ── Test 7: Alpha wolf at east wall ────────────────────────────────────────
  console.log('Test 7: Alpha at east wall...');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    if (!sc.animals?.length) return;
    const alpha = sc.animals.find(a => a.isBoss) || sc.animals[0];
    const ox = 195, oy = 152, HW = 40, HH = 20;
    alpha.lx = ox + (15 - 7) * HW;
    alpha.ly = oy + (15 + 7) * HH;
    alpha.state = 'circle';
    alpha.stateTimer = 5000;
    if (alpha.sprite) { alpha.sprite.x = alpha.lx; alpha.sprite.y = alpha.ly; }
    sc.playerLX = ox + (12 - 7) * HW;
    sc.playerLY = oy + (12 + 7) * HH;
    if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, '07_alpha_east_wall.png') });
  console.log('  → screenshots/07_alpha_east_wall.png');

  // ── Test 8: Alpha wolf at north wall ───────────────────────────────────────
  console.log('Test 8: Alpha at north wall...');
  await page.evaluate(() => {
    const sc = window.__game.scene.getScene('GameScene');
    if (!sc.animals?.length) return;
    const alpha = sc.animals.find(a => a.isBoss) || sc.animals[0];
    const ox = 195, oy = 152, HW = 40, HH = 20;
    alpha.lx = ox + (8 - 1) * HW;
    alpha.ly = oy + (8 + 1) * HH;
    alpha.state = 'circle';
    alpha.stateTimer = 5000;
    if (alpha.sprite) { alpha.sprite.x = alpha.lx; alpha.sprite.y = alpha.ly; }
    sc.playerLX = ox + (8 - 4) * HW;
    sc.playerLY = oy + (8 + 4) * HH;
    if (sc.playerSprite) { sc.playerSprite.x = sc.playerLX; sc.playerSprite.y = sc.playerLY; }
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, '08_alpha_north_wall.png') });
  console.log('  → screenshots/08_alpha_north_wall.png');

  await browser.close();
  server.close();
  console.log('\nAll screenshots saved to screenshots/');
}

run().catch(err => { console.error(err); process.exit(1); });

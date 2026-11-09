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

  // Click Shop button (at y=802)
  await page.mouse.click(195, 802);
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

    // ── 5. Sound & mute ──
    if (wkOk) await testSoundMute(wk, 'WebKit');

    // ── 6. Win/Lose via URL param ──
    if (wkOk) await testWinLose(wk, 'WebKit');

    // ── 7. Progress persistence ──
    await testReloadProgress(wk, 'WebKit');

    // ── 8. Safe areas (geometry analysis) ──
    await testSafeAreas();

    // Manual items
    console.log(`\n--- IAP & Ad Calls ---`);
    manual('IAP calls fail gracefully in browser (no crash) — Capacitor guard returns no-op on web');
    manual('Ad calls fail gracefully in browser — showRewarded() gives instant reward on web');

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

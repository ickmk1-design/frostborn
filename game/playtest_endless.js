/**
 * Frostborn Endless Winter playtest bot.
 *
 * Launches a self-hosted static server on port 7779 against ./dist, opens
 * Endless Winter via ?endless=1, drives the joystick toward wolves + logs,
 * tolerates deaths (one revive attempt will fail in dev since ads aren't
 * native — the bot simply restarts via scene.restart from the overlay).
 *
 * Success criterion: waves_survived >= 5.
 * Reports: waves_survived, total_seconds, min_fps, avg_fps, deaths.
 */

const { webkit } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = 7779;
const VIEWPORT = { width: 393, height: 852 };
const RUN_TIMEOUT_MS = 24 * 60 * 1000;   // 24 min hard cap — wave 10 target needs ~20 min at 120s/wave
const TICK_MS = 500;                      // bot decision cadence
const MIN_WAVES_REQUIRED = 5;

const JOY_X = 196;
const JOY_Y = 700;
const JOY_DRAG = 55;

// ── static server (mirrors preflight.js) ─────────────────────────────────────
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

// ── helpers ──────────────────────────────────────────────────────────────────
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

async function drag(page, angleDeg, durationMs) {
  const rad = angleDeg * Math.PI / 180;
  const ex = JOY_X + Math.cos(rad) * JOY_DRAG;
  const ey = JOY_Y + Math.sin(rad) * JOY_DRAG;
  await page.mouse.move(JOY_X, JOY_Y);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 3 });
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}

async function readState(page) {
  return page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const sc = g.scene.getScene('EndlessScene');
    if (!sc || !sc.scene?.isActive?.()) return null;
    const camScrollX = sc.cameras?.main?.scrollX ?? 0;
    const camScrollY = sc.cameras?.main?.scrollY ?? 0;
    return {
      waveNum: sc.waveNum ?? 0,
      waveActive: sc.waveActive ?? false,
      waveTimer: sc.waveTimer ?? 0,
      survivedSec: sc.survivedSec ?? 0,
      playerLX: sc.playerLX ?? 0, playerLY: sc.playerLY ?? 0,
      playerHp: sc.playerHp ?? 0, playerHpMax: sc.playerHpMax ?? 10,
      playerDead: sc.playerDead ?? false,
      fireX: sc.fireX ?? 0, fireY: sc.fireY ?? 0,
      fuel: sc.fuel ?? 0,
      freezeMeter: sc.freezeMeter ?? 0,
      gameOver: sc.gameOver ?? false,
      carriedLogs: sc.carriedLogs ?? 0,
      coins: sc.coins ?? 0,
      fps: sc.game?.loop?.actualFps ?? 0,
      camScrollX, camScrollY,
      camZoom: sc.cameras?.main?.zoom ?? 1,
      viewW: sc.cameras?.main?.width ?? 393,
      viewH: sc.cameras?.main?.height ?? 852,
      trees: (sc.trees ?? []).map(t => ({ lx: t.lx, ly: t.ly, cd: t.onCooldown })),
      nearestWolf: (() => {
        let best = null; let bd = Infinity;
        for (const w of (sc.wolves ?? [])) {
          if (w.state === 'dead') continue;
          const d = Math.hypot((sc.playerLX ?? 0) - w.lx, (sc.playerLY ?? 0) - w.ly);
          if (d < bd) { bd = d; best = { lx: w.lx, ly: w.ly, state: w.state, dist: d }; }
        }
        return best;
      })(),
      revivedThisRun: sc.revivedThisRun ?? false,
      deathOverlayOpen: !!sc.deathOverlay,
    };
  }).catch(() => null);
}

// Convert a WORLD (lx/ly) coordinate to the on-screen px the mouse should drag toward.
// The joystick drives movement in screen-space of the input, not world-space, so we
// need the direction from player screen-pos to target screen-pos.
function worldToScreen(state, wx, wy) {
  if (!state) return { x: JOY_X, y: JOY_Y };
  const sx = (wx - state.camScrollX) * state.camZoom;
  const sy = (wy - state.camScrollY) * state.camZoom;
  return { x: sx, y: sy };
}

function dirDegToward(state, targetWX, targetWY) {
  const ps = worldToScreen(state, state.playerLX, state.playerLY);
  const ts = worldToScreen(state, targetWX, targetWY);
  const a = Math.atan2(ts.y - ps.y, ts.x - ps.x);
  const deg = ((a * 180 / Math.PI) + 360) % 360;
  return Math.round(deg / 45) * 45;
}

// ── the bot ──────────────────────────────────────────────────────────────────
async function runBot() {
  // Make sure dist exists
  if (!fs.existsSync(DIST)) {
    console.error('dist/ not found — run `npm run build` first.');
    process.exit(1);
  }

  const server = await serve(DIST, PORT);
  console.log(`[endless-bot] static server up on ${BASE}`);

  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const fpsSamples = [];
  const lateFpsSamples = [];           // FPS samples from waves 5-10 window (t>=240s)
  const LATE_FPS_START_SEC = 240;      // skip waves 1-2 warmup
  let minFps = 999;
  let lateMinFps = 999;
  let deaths = 0;
  let maxWave = 0;
  let lastFuelActionMs = 0;
  let lastWolfActionMs = 0;

  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('PAGE: ' + e.message));

  await page.goto(`${BASE}/?endless=1&noaudio=1`);
  console.log('[endless-bot] page loaded, waiting for EndlessScene');

  // Wait for EndlessScene active
  const t0 = Date.now();
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => {
      const g = window.__game;
      if (!g) return false;
      const sc = g.scene.getScene('EndlessScene');
      return !!(sc && sc.scene?.isActive?.() && sc.playerSprite);
    }).catch(() => false);
    if (ok) { ready = true; break; }
  }
  if (!ready) {
    console.error('[endless-bot] EndlessScene never became active');
    await browser.close(); server.close();
    process.exit(2);
  }
  console.log(`[endless-bot] scene ready after ${Date.now() - t0}ms`);

  // Give the game a sec to settle
  await page.waitForTimeout(1000);

  const runStart = Date.now();
  while (Date.now() - runStart < RUN_TIMEOUT_MS) {
    const state = await readState(page);
    if (!state) { await page.waitForTimeout(TICK_MS); continue; }

    // Sample FPS
    const fps = Math.round(state.fps || 0);
    if (fps > 0) {
      fpsSamples.push(fps);
      if (fps < minFps) minFps = fps;
      // Late-window sample (waves 5-10 performance focus)
      if ((state.survivedSec || 0) >= LATE_FPS_START_SEC) {
        lateFpsSamples.push(fps);
        if (fps < lateMinFps) lateMinFps = fps;
      }
    }

    maxWave = Math.max(maxWave, state.waveNum);

    // If game over / death overlay: try revive (fails in web → not granted),
    // then click try-again via scene restart. Simpler: just restart page with ?endless=1
    // when a death overlay appears, but that breaks waves-survived counting.
    // Instead: once dead and overlay open, bail out — we've reached the end.
    if (state.playerDead && state.deathOverlayOpen) {
      deaths++;
      console.log(`[endless-bot] death at wave ${state.waveNum}, t=${state.survivedSec.toFixed(1)}s`);
      break;
    }

    const now = Date.now();

    // PRIORITY 1 — If fuel low, drop logs OR go to a tree
    const fuelLow = state.fuel < 55;
    const atFire = dist(state.playerLX, state.playerLY, state.fireX, state.fireY) < 90;

    if (state.carriedLogs > 0 && atFire) {
      // Already here, just wait a beat for drop
      await page.waitForTimeout(TICK_MS);
      continue;
    }

    if (state.carriedLogs >= 3 || (state.carriedLogs > 0 && fuelLow)) {
      // Head to fire
      if (now - lastFuelActionMs > 200) {
        const deg = dirDegToward(state, state.fireX, state.fireY);
        await drag(page, deg, 650);
        lastFuelActionMs = now;
        continue;
      }
    }

    if (state.carriedLogs < 3 && (fuelLow || state.carriedLogs === 0)) {
      // Find nearest available tree
      const trees = (state.trees || []).filter(t => !t.cd);
      if (trees.length > 0) {
        let best = trees[0]; let bd = dist(state.playerLX, state.playerLY, best.lx, best.ly);
        for (const t of trees) {
          const d = dist(state.playerLX, state.playerLY, t.lx, t.ly);
          if (d < bd) { bd = d; best = t; }
        }
        const deg = dirDegToward(state, best.lx, best.ly);
        await drag(page, deg, 650);
        continue;
      }
    }

    // PRIORITY 2 — if a wolf is near (within 180px), attack it
    const w = state.nearestWolf;
    if (w && w.dist < 220 && !fuelLow) {
      if (now - lastWolfActionMs > 150) {
        const deg = dirDegToward(state, w.lx, w.ly);
        // Short burst: close distance to <80 so player-attack range triggers
        await drag(page, deg, 350);
        lastWolfActionMs = now;
        continue;
      }
    }

    // PRIORITY 3 — stay near the fire / camp when idle
    if (!atFire) {
      const deg = dirDegToward(state, state.fireX, state.fireY);
      await drag(page, deg, 400);
    } else {
      await page.waitForTimeout(TICK_MS);
    }
  }

  // Final sample
  const finalState = await readState(page);
  const totalSec = finalState ? finalState.survivedSec : (Date.now() - runStart) / 1000;
  const wavesSurvived = Math.max(maxWave, finalState?.waveNum ?? 0);

  // Take a final screenshot for debugging
  try { await page.screenshot({ path: path.join(__dirname, 'endless_final.png') }); } catch {}

  const avgFps = fpsSamples.length
    ? Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length)
    : 0;
  const lateAvgFps = lateFpsSamples.length
    ? Math.round(lateFpsSamples.reduce((a, b) => a + b, 0) / lateFpsSamples.length)
    : 0;

  const report = {
    waves_survived: wavesSurvived,
    total_seconds: Math.round(totalSec * 10) / 10,
    min_fps: minFps === 999 ? 0 : minFps,
    avg_fps: avgFps,
    // Late-window (waves 5-10): skip warmup, this is the target for the fix
    late_min_fps: lateMinFps === 999 ? 0 : lateMinFps,
    late_avg_fps: lateAvgFps,
    late_samples: lateFpsSamples.length,
    deaths,
    passed: wavesSurvived >= MIN_WAVES_REQUIRED,
    console_errors: consoleErrors.slice(0, 5),
  };

  console.log('\n[endless-bot] RESULT');
  console.log(JSON.stringify(report, null, 2));

  // Persist report next to playtest_report.md
  try {
    fs.writeFileSync(
      path.join(__dirname, 'playtest_endless_report.json'),
      JSON.stringify(report, null, 2),
    );
  } catch {}

  await browser.close();
  server.close();
  process.exit(report.passed ? 0 : 3);
}

runBot().catch(e => {
  console.error('[endless-bot] fatal', e);
  process.exit(99);
});

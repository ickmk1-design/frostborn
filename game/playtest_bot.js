/**
 * Frostborn Automated Playtest Bot v3
 * Runs all 15 levels via Playwright (WebKit, mobile portrait 393×852).
 * Uses real virtual-joystick drags — no internal teleport or state injection.
 *
 * Outputs:
 *   playtest_screenshots/levelNN_tNNN.png
 *   playtest_report.md
 */

import { webkit } from 'playwright';
import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE_URL       = process.env.BOT_URL || 'http://localhost:8911';
const VIEWPORT       = { width: 393, height: 852 };
// Per-level bot timeout = balance target max + 2 min (bot-only cap; real players have no timer).
function levelTimeout(n) {
  const b = BALANCE[n];
  const minutes = (b ? b.max : 10) + 2;
  return minutes * 60 * 1000;
}
const SCREENSHOT_INT = 5000;             // ms between screenshots
const STALL_LIMIT    = 90 * 1000;        // 90s stall detection
const STUCK_LIMIT    = 8 * 1000;         // 8s entity stuck detection

// Joystick geometry — fixed to lower portion of screen
const JOY_X     = 196;
const JOY_Y     = 700;
const JOY_DRAG  = 55;   // px drag radius (60px max per spec)

// Fire hysteresis:
//   - CRITICAL: fuel below this triggers refill-until-safe, interrupting any task.
//   - SAFE: refill loop runs cycles until fuel reaches SAFE (so one critical
//     event doesn't require another in 5s).
//   - TOPUP: between stages (when currentStageIdx advances) refuel if below.
// Once committed to a stage, bot stays on it unless fuel falls below CRITICAL —
// prevents the old oscillation of "interrupt at 40%, top up at 60%, interrupt again".
const FIRE_CRITICAL_PCT = 0.35;
const FIRE_SAFE_PCT     = 0.70;
const FIRE_TOPUP_PCT    = 0.55;

// isoToScreen helper (mirrors isoUtils.ts)
// tileW=80, tileH=40
const TW = 80, TH = 40;
function isoToScreen(ix, iy, ox, oy) {
  return { x: ox + (ix - iy) * TW / 2, y: oy + (ix + iy) * TH / 2 };
}
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function angle(fx, fy, tx, ty) { return Math.atan2(ty - fy, tx - fx); }

// ── Mini nav-grid — built from level cfg + static colliders. Same shape as
// the in-game NavGrid in src/systems/navgrid.ts so the bot plans with the
// same topology (walls + gate) that the game uses.
class BotNavGrid {
  constructor() { this.cell = 24; }
  build(cfg) {
    const ox = cfg.originX ?? 195; const oy = cfg.originY ?? 152;
    this.ox = ox; this.oy = oy;
    const obs = [];
    const fp = isoToScreen(cfg.fire.iso[0], cfg.fire.iso[1], ox, oy);
    obs.push({ x: fp.x, y: fp.y, r: 62 });
    for (const t of (cfg.trees ?? [])) {
      const p = isoToScreen(t.iso[0], t.iso[1], ox, oy);
      obs.push({ x: p.x, y: p.y, r: 12 });
    }
    for (const s of (cfg.stations ?? [])) {
      const p = isoToScreen(s.iso[0], s.iso[1], ox, oy);
      obs.push({ x: p.x, y: p.y, r: 14 });
    }
    const allIso = [
      ...(cfg.walls ?? []),
      ...(cfg.trees ?? []).map(t => t.iso),
      ...(cfg.frozenSurvivors ?? []).map(s => s.iso),
      cfg.fire.iso,
      ...(cfg.buildPads ?? []).map(p => p.iso),
      ...(cfg.stations ?? []).map(s => s.iso),
      ...(cfg.decor ?? []).map(d => d.iso),
    ];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [ix, iy] of allIso) {
      const p = isoToScreen(ix, iy, ox, oy);
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    }
    const PAD = 200;
    this.minX = minX - PAD; this.minY = minY - PAD;
    this.maxX = maxX + PAD; this.maxY = maxY + PAD;
    this.cols = Math.max(1, Math.ceil((this.maxX - this.minX) / this.cell));
    this.rows = Math.max(1, Math.ceil((this.maxY - this.minY) / this.cell));
    this.b = new Uint8Array(this.cols * this.rows);
    for (const o of obs) {
      const c0c = Math.floor((o.x - o.r - this.minX) / this.cell);
      const c0r = Math.floor((o.y - o.r - this.minY) / this.cell);
      const c1c = Math.floor((o.x + o.r - this.minX) / this.cell);
      const c1r = Math.floor((o.y + o.r - this.minY) / this.cell);
      const r2 = o.r * o.r;
      for (let r = c0r; r <= c1r; r++) {
        if (r < 0 || r >= this.rows) continue;
        for (let c = c0c; c <= c1c; c++) {
          if (c < 0 || c >= this.cols) continue;
          const cx = this.minX + (c + 0.5) * this.cell;
          const cy = this.minY + (r + 0.5) * this.cell;
          if ((cx - o.x) ** 2 + (cy - o.y) ** 2 <= r2) this.b[r * this.cols + c] = 1;
        }
      }
    }
    const gateSet = new Set();
    for (const [gx, gy] of (cfg.gate ?? [])) gateSet.add(`${gx},${gy}`);
    for (const [wx, wy] of (cfg.walls ?? [])) {
      if (gateSet.has(`${wx},${wy}`)) continue;
      const p = isoToScreen(wx, wy, ox, oy);
      const x0 = p.x - TW / 2 + 4; const y0 = p.y - TH / 2 + 2;
      const x1 = p.x + TW / 2 - 4; const y1 = p.y + TH / 2 - 2;
      const c0c = Math.floor((x0 - this.minX) / this.cell);
      const c0r = Math.floor((y0 - this.minY) / this.cell);
      const c1c = Math.floor((x1 - this.minX) / this.cell);
      const c1r = Math.floor((y1 - this.minY) / this.cell);
      for (let r = c0r; r <= c1r; r++) {
        if (r < 0 || r >= this.rows) continue;
        for (let c = c0c; c <= c1c; c++) {
          if (c < 0 || c >= this.cols) continue;
          this.b[r * this.cols + c] = 1;
        }
      }
    }
    for (const [gx, gy] of (cfg.gate ?? [])) {
      const p = isoToScreen(gx, gy, ox, oy);
      const cc = Math.floor((p.x - this.minX) / this.cell);
      const rr = Math.floor((p.y - this.minY) / this.cell);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r = rr + dr; const c = cc + dc;
        if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
        this.b[r * this.cols + c] = 0;
      }
    }
  }
  _blocked(x, y) {
    const c = Math.floor((x - this.minX) / this.cell);
    const r = Math.floor((y - this.minY) / this.cell);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    return this.b[r * this.cols + c] === 1;
  }
  _nearest(x, y, maxRings = 10) {
    const c0 = Math.floor((x - this.minX) / this.cell);
    const r0 = Math.floor((y - this.minY) / this.cell);
    for (let ring = 0; ring <= maxRings; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (ring > 0 && Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const r = r0 + dr; const c = c0 + dc;
          if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
          if (!this.b[r * this.cols + c]) return { r, c };
        }
      }
    }
    return null;
  }
  _los(x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.ceil(d / (this.cell * 0.6)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (this._blocked(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
    }
    return true;
  }
  // Returns an array of waypoints (screen coords), or [] if no path.
  findPath(fromX, fromY, toX, toY) {
    const s = this._nearest(fromX, fromY); const g = this._nearest(toX, toY);
    if (!s || !g) return [];
    if (this._los(fromX, fromY, toX, toY)) return [{ x: toX, y: toY }];
    if (s.r === g.r && s.c === g.c) return [{ x: toX, y: toY }];
    const sIdx = s.r * this.cols + s.c; const gIdx = g.r * this.cols + g.c;
    const gScore = new Map(); const fScore = new Map(); const came = new Map();
    gScore.set(sIdx, 0);
    const h = (r, c) => { const dr = Math.abs(r - g.r); const dc = Math.abs(c - g.c); return (dr + dc) + (1.414 - 2) * Math.min(dr, dc); };
    fScore.set(sIdx, h(s.r, s.c));
    // Priority queue via simple binary heap
    const heap = [sIdx];
    const cmp = (a, b) => (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity);
    const push = v => { heap.push(v); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (cmp(heap[i], heap[p]) < 0) { const t = heap[i]; heap[i] = heap[p]; heap[p] = t; i = p; } else break; } };
    const pop = () => { if (heap.length === 0) return undefined; const top = heap[0]; const last = heap.pop(); if (heap.length > 0) { heap[0] = last; let i = 0; const n = heap.length; while (true) { const l = 2 * i + 1; const r = 2 * i + 2; let m = i; if (l < n && cmp(heap[l], heap[m]) < 0) m = l; if (r < n && cmp(heap[r], heap[m]) < 0) m = r; if (m === i) break; const t = heap[i]; heap[i] = heap[m]; heap[m] = t; i = m; } } return top; };
    const DIRS = [[-1,-1,1.414],[-1,0,1],[-1,1,1.414],[0,-1,1],[0,1,1],[1,-1,1.414],[1,0,1],[1,1,1.414]];
    let iters = 0;
    while (heap.length > 0 && iters < 8000) {
      iters++;
      const cur = pop();
      if (cur === gIdx) {
        const cells = [cur]; let n = cur;
        while ((n = came.get(n)) !== undefined) cells.unshift(n);
        const way = [];
        for (let i = 1; i < cells.length; i++) {
          const rr = Math.floor(cells[i] / this.cols); const cc = cells[i] % this.cols;
          way.push({ x: this.minX + (cc + 0.5) * this.cell, y: this.minY + (rr + 0.5) * this.cell });
        }
        if (way.length > 0) way[way.length - 1] = { x: toX, y: toY };
        // Smooth via line-of-sight
        const out = []; let cx = fromX, cy = fromY; let i = 0;
        while (i < way.length) {
          let j = way.length - 1;
          while (j > i && !this._los(cx, cy, way[j].x, way[j].y)) j--;
          out.push(way[j]); cx = way[j].x; cy = way[j].y; i = j + 1;
        }
        return out;
      }
      const cr = Math.floor(cur / this.cols); const cc = cur % this.cols;
      for (const [dr, dc, w] of DIRS) {
        const nr = cr + dr; const nc = cc + dc;
        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
        if (this.b[nr * this.cols + nc]) continue;
        if (dr !== 0 && dc !== 0) {
          if (this.b[cr * this.cols + nc] || this.b[nr * this.cols + cc]) continue;
        }
        const nIdx = nr * this.cols + nc;
        const tentative = (gScore.get(cur) ?? Infinity) + w;
        if (tentative < (gScore.get(nIdx) ?? Infinity)) {
          came.set(nIdx, cur);
          gScore.set(nIdx, tentative);
          fScore.set(nIdx, tentative + h(nr, nc));
          push(nIdx);
        }
      }
    }
    return [];
  }
}

// Output dirs
const SCREENSHOTS_DIR = path.join(__dirname, 'playtest_screenshots');
const REPORT_PATH     = path.join(__dirname, 'playtest_report.md');

// Balance targets from balance.md
const BALANCE = {
  1:  { min: 3,  max: 4,  note: 'Logs+thawing. No new mechanics.' },
  2:  { min: 5,  max: 6,  note: 'Wolves+5 survivors.' },
  3:  { min: 5,  max: 6,  note: 'Faster drain, 4 survivors, 2 wolves.' },
  4:  { min: 7,  max: 8,  note: 'Hunt+rescue 3.' },
  5:  { min: 7,  max: 8,  note: 'Hunt 2, build, rescue 5.' },
  6:  { min: 7,  max: 8,  note: 'Rescue+build+hunt+rescue.' },
  7:  { min: 9,  max: 10, note: 'Hunt, build, two rescue waves.' },
  8:  { min: 9,  max: 10, note: '3-wolf hunt + 7 survivors.' },
  9:  { min: 9,  max: 10, note: 'Rescue 8 + defend 3 raids.' },
  10: { min: 12, max: 15, note: 'Full systems, 5 survivors.' },
  11: { min: 12, max: 15, note: 'Rescue 8 + 8 animals (est.).' },
  12: { min: 12, max: 15, note: '9 survivors, 9 animals (est.).' },
  13: { min: 12, max: 15, note: '10 survivors, 10 animals (est.).' },
  14: { min: 12, max: 15, note: '11 survivors, 10 animals (est.).' },
  15: { min: 12, max: 15, note: '12 survivors, 11 animals (est.).' },
};

// ── Joystick drag primitive ───────────────────────────────────────────────────
async function drag(page, angleDeg, durationMs) {
  const rad = angleDeg * Math.PI / 180;
  const ex = JOY_X + Math.cos(rad) * JOY_DRAG;
  const ey = JOY_Y + Math.sin(rad) * JOY_DRAG;
  await page.mouse.move(JOY_X, JOY_Y);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 3 });
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
  await page.waitForTimeout(60);
}

// ── Scene state reader ────────────────────────────────────────────────────────
async function readState(page) {
  return page.evaluate(() => {
    const g = window.__game;
    if (!g) return null;
    const sc = g.scene.getScene('GameScene');
    if (!sc) return null;
    return {
      coins:           sc.coins         ?? 0,
      fuel:            sc.fuel          ?? 0,
      fuelMax:         sc.cfg?.fire?.fuelMax ?? 100,
      freezeMeter:     sc.freezeMeter   ?? 0,
      rescuedCount:    sc.rescuedCount  ?? 0,
      tentBuilt:       sc.tentBuilt     ?? false,
      gameOver:        sc.gameOver      ?? false,
      playerDead:      sc.playerDead    ?? false,
      playerLX:        sc.playerLX      ?? 0,
      playerLY:        sc.playerLY      ?? 0,
      playerHp:        sc.playerHp      ?? 0,
      playerHpMax:     sc.playerHpMax   ?? 10,
      playerLastDir:   sc.playerLastDir ?? 0,
      carriedLogs:     sc.carriedLogs   ?? 0,
      carriedMeat:     sc.carriedMeat   ?? 0,
      goalStages:      (sc.goalStages   ?? []).map(s => ({ type: s.type, target: s.target })),
      currentStageIdx: sc.currentStageIdx ?? 0,
      animalsKilled:   sc.animalsKilled ?? 0,
      cookedServed:    sc.cookedServed  ?? 0,
      planksProduced:  sc.planksProduced ?? 0,
      planksAvailable: sc.planksAvailable ?? 0,
      supplyRunsCompleted: sc.supplyRunsCompleted ?? 0,
      fishCaught:      sc.fishCaught    ?? 0,
      fireX:           sc.fireX         ?? 0,
      fireY:           sc.fireY         ?? 0,
      padX:            sc.padX          ?? 0,
      padY:            sc.padY          ?? 0,
      fps:             sc.game?.loop?.actualFps ?? 0,
      survivors: (sc.survivors ?? []).map(s => ({
        state: s.state, lx: s.lx, ly: s.ly, stuckMs: s.stuckMs ?? 0,
      })),
      animals: (sc.animals ?? []).map((a, idx) => ({
        idx,
        state: a.state, lx: a.lx, ly: a.ly, hp: a.hp, maxHp: a.maxHp ?? a.hp,
        huntTargetIdx: a.huntTargetIdx ?? -1,
        atlasKey: a.atlasKey ?? '',
        aggroRange: a.spec?.aggroRange ?? 0,
        attackRange: a.spec?.attackRange ?? 0,
      })),
      meatDrops: (sc.meatDrops ?? []).map(m => ({
        lx: m.lx, ly: m.ly,
        alpha: m.sprite?.alpha ?? 1,
      })),
      workers: (sc.survivors ?? []).filter(s => s.state === 'worker').map((s, i) => ({
        idx: i, workerState: s.workerState, lx: s.lx, ly: s.ly,
      })),
    };
  }).catch(() => null);
}

// ── Direction calculator ──────────────────────────────────────────────────────
function snapAngle(rad) {
  const deg = ((rad * 180 / Math.PI) + 360) % 360;
  return Math.round(deg / 45) * 45;
}

// Walk toward (tx,ty) from current player position
async function walkTo(page, state, tx, ty, durationMs) {
  const px = state.playerLX || JOY_X;
  const py = state.playerLY || 400;
  const a = angle(px, py, tx, ty);
  const deg = snapAngle(a);
  await drag(page, deg, durationMs);
}

// ── Level bot class ───────────────────────────────────────────────────────────
class Bot {
  constructor(page, levelNum, cfg) {
    this.page      = page;
    this.num       = levelNum;
    this.cfg       = cfg;

    const ox = cfg.originX ?? 195;
    const oy = cfg.originY ?? 152;

    // Pre-compute world positions
    this.firePos    = isoToScreen(cfg.fire.iso[0], cfg.fire.iso[1], ox, oy);
    this.padPos     = cfg.buildPads?.[0]
      ? isoToScreen(cfg.buildPads[0].iso[0], cfg.buildPads[0].iso[1], ox, oy)
      : null;
    this.padCost    = cfg.buildPads?.[0]?.costCoins ?? 65;
    this.treePoses  = (cfg.trees ?? []).map(t => isoToScreen(t.iso[0], t.iso[1], ox, oy));
    this.survPoses  = (cfg.frozenSurvivors ?? []).map(s => isoToScreen(s.iso[0], s.iso[1], ox, oy));
    this.animPoses  = (cfg.animals ?? []).map(a => isoToScreen(a.iso[0], a.iso[1], ox, oy));
    this.fuelMax    = cfg.fire.fuelMax ?? 100;

    // Timing & metrics
    this.t0            = Date.now();
    this.screenshots   = 0;
    this.lastSS        = 0;
    this.fpsSamples    = [];
    this.issues        = [];
    this.goalTimes     = [];
    this.deaths        = 0;
    this.lastStageIdx  = -1;
    this.stageT0       = Date.now();

    // Navigation stuck detection
    this.navPrevX      = -9999;
    this.navPrevY      = -9999;
    this.navPrevMs     = Date.now();
    this.navStuckMs    = 0;         // accumulated ms without movement toward target

    // Nav-grid for hero pathfinding (same topology as game NavGrid).
    this.navGrid = new BotNavGrid();
    this.navGrid.build(cfg);
    this._path = null;
    this._pathIdx = 0;
    this._pathTgtX = NaN; this._pathTgtY = NaN;

    // Stall detection
    this.lastMoveX     = -9999;
    this.lastMoveY     = -9999;
    this.lastMoveMs    = Date.now();
    this.goalStalledMs = Date.now();
    this.prevGoalIdx   = 0;

    // Worker stuck map
    this.workerPrev    = new Map();

    // Hysteresis: track whether we need to top up fuel between stages
    this.needsTopUp = false;

    // ── Hunt tracker ────────────────────────────────────────────────────────
    // Keyed by animal index; records hp seen on previous dwell. 3 consecutive
    // dwells with no HP decrement → skip this animal.
    this.huntState = {
      currentIdx:       -1,
      lastHp:           -1,
      noProgressDwells: 0,
      postKillLoiterMs: 0,
      postKillTarget:   null,
    };

    // ── Rescue blacklist ────────────────────────────────────────────────────
    // Survivors (by iso-ish key) that failed to make progress for 20s on the
    // current stage. Reset on new stage / new level.
    this.rescueBlacklist = new Set();
    this.rescueTargetKey = '';
    this.rescueTargetT0  = Date.now();
    this.rescueTargetLastHp = -1;
    this.rescueTargetLastRescued = 0;

    // ── 30s no-progress hard cap ────────────────────────────────────────────
    // Tracks the last time ANY of these counters moved: rescued, animalsKilled,
    // cooked, planks, supplyRuns, hero drift >60px. If 30s pass with no
    // movement → force a task switch and emit [botstall]. INFO [botstall] line
    // also emitted every 15s even before the 30s cutoff.
    this.progressT0 = Date.now();
    this.progressSnapshot = null;
    this.lastBotstallLogMs = 0;
    this.lastForcedSwitchMs = 0;
    this.forceAltStageUntil = 0;   // when > now, pick fallback task in main loop

    // Result
    this.won           = false;
  }

  elapsed() { return (Date.now() - this.t0) / 1000; }

  issue(sev, msg) {
    this.issues.push({ sev, msg, t: this.elapsed() });
    console.log(`  [${sev}] t=${this.elapsed().toFixed(0)}s: ${msg}`);
  }

  async screenshot(state, label) {
    const now = Date.now();
    if (now - this.lastSS < SCREENSHOT_INT) return;
    this.lastSS = now;
    const tSec  = Math.floor(this.elapsed());
    const lpad  = String(this.num).padStart(2,'0');
    const tpad  = String(tSec).padStart(3,'0');
    const fname = `level${lpad}_t${tpad}${label ? '_' + label : ''}.png`;
    try {
      await this.page.screenshot({ path: path.join(SCREENSHOTS_DIR, fname) });
      this.screenshots++;
    } catch {}
    // FPS samples pushed in main loop; only log a low-FPS issue here (per screenshot cadence).
    if (state?.fps && this.elapsed() >= 1 && state.fps < 25) {
      this.issue('MINOR', `Low FPS: ${Math.round(state.fps)}`);
    }
  }

  // ── Smart navigation: path-plan with nav-grid, walk toward the next
  // waypoint. If no progress in 2.5s, repath; if still stuck, perpendicular
  // detour as a last resort.
  async navigateTo(state, tx, ty, stepMs = 1200) {
    const px = state.playerLX, py = state.playerLY;
    const d = dist(px, py, tx, ty);
    if (d < 50) return; // already close enough

    // Rebuild the path if the target changed or the path ran out.
    const pathStale = !this._path || this._pathIdx >= this._path.length
      || Math.hypot(tx - this._pathTgtX, ty - this._pathTgtY) > 24;
    if (pathStale) {
      this._path = this.navGrid.findPath(px, py, tx, ty);
      this._pathIdx = 0;
      this._pathTgtX = tx; this._pathTgtY = ty;
    }
    // Advance waypoints already reached.
    while (this._path && this._pathIdx < this._path.length) {
      const wp = this._path[this._pathIdx];
      if (Math.hypot(wp.x - px, wp.y - py) < 32) this._pathIdx++; else break;
    }
    const wp = (this._path && this._pathIdx < this._path.length)
      ? this._path[this._pathIdx] : { x: tx, y: ty };

    // Progress check — distance to the FINAL target, not the current waypoint
    // (waypoints change as the hero advances, which would false-trigger stalls).
    const prevDist = dist(this.navPrevX, this.navPrevY, tx, ty);
    const currDist = dist(px, py, tx, ty);
    const progressPx = prevDist - currDist;

    if (this.navPrevX !== -9999 && Date.now() - this.navPrevMs > 2500 && progressPx < 10) {
      // First stall → force repath. If that repath also failed to find a
      // route, fall back to a perpendicular detour.
      const freshPath = this.navGrid.findPath(px, py, tx, ty);
      if (freshPath.length === 0 || (this._path && JSON.stringify(freshPath) === JSON.stringify(this._path))) {
        const mainAngle = angle(px, py, tx, ty);
        const perpAngle = mainAngle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
        const perpDeg = snapAngle(perpAngle);
        await drag(this.page, perpDeg, 900);
      } else {
        this._path = freshPath; this._pathIdx = 0;
        this._pathTgtX = tx; this._pathTgtY = ty;
      }
      this.navPrevMs = Date.now();
      this.navPrevX = px; this.navPrevY = py;
      return;
    }

    this.navPrevX = px; this.navPrevY = py;
    this.navPrevMs = Date.now();

    const a = angle(px, py, wp.x, wp.y);
    const deg = snapAngle(a);
    const legD = dist(px, py, wp.x, wp.y);
    await drag(this.page, deg, Math.min(stepMs, legD * 8));
  }

  // ── Core fire loop ─────────────────────────────────────────────────────────
  // Walk to nearest available tree, pick up a log (or wait for cooldown if carrying),
  // then walk back to fire to drop.
  async fireCycle(state, treeMs, fireMs) {
    // Pick nearest tree to player
    let best = null, bd = Infinity;
    for (const tp of this.treePoses) {
      const d = dist(state.playerLX, state.playerLY, tp.x, tp.y);
      if (d < bd) { bd = d; best = tp; }
    }
    if (!best) return;

    // Go to tree
    await this.navigateTo(state, best.x, best.y, treeMs);
    // Wait at tree for log collect interval (~1.4s) — longer wait if carrying to allow 2nd log
    await this.page.waitForTimeout(2200);

    // Try to pick up 2nd log (stack carrying) — wait at tree through cooldown if fuel allows
    const st1 = await readState(this.page) || state;
    if (st1 && st1.carriedLogs === 0 && !st1.playerDead) {
      // No log collected yet — wait a bit more
      await this.page.waitForTimeout(1800);
    }

    // Go to fire
    const st2 = await readState(this.page) || state;
    await this.navigateTo(st2, this.firePos.x, this.firePos.y, fireMs);
    await this.page.waitForTimeout(300);
  }

  // ── Dispatch by stage type ─────────────────────────────────────────────────
  async doStage(stage, state) {
    switch (stage.type) {
      case 'rescueSurvivors': await this.doRescue(stage, state); break;
      case 'buildStructure':  await this.doBuild(stage, state);  break;
      case 'huntAnimals':     await this.doHunt(stage, state);   break;
      case 'collectLogs':     await this.doCollectLogs(stage, state); break;
      case 'fishCaught':
      case 'cookedServed':
      case 'planksProduced':
      case 'planksStocked':
        await this.doTendAndDefend(stage, state);
        break;
      default:
        // Unknown — stay near fire
        await this.navigateTo(state, this.firePos.x, this.firePos.y, 600);
    }
  }

  // Station-production stages (fishCaught, cookedServed): hero tends the fire
  // but ALSO intercepts any wolf that aggros onto a worker — real players
  // defend their fishermen; the bot must too, otherwise the chain deadlocks.
  async doTendAndDefend(stage, state) {
    // Hostile wolf hunting a worker? Go kill it first.
    const hunter = (state.animals ?? []).find(a =>
      a.state !== 'dead' && a.state !== 'flee' && (a.huntTargetIdx ?? -1) >= 0,
    );
    if (hunter) {
      const d = dist(state.playerLX, state.playerLY, hunter.lx, hunter.ly);
      if (d > 60) {
        await this.navigateTo(state, hunter.lx, hunter.ly, Math.min(1800, d * 8));
      } else {
        // Attack range — stand still so hero auto-chops.
        await this.page.waitForTimeout(220);
      }
      return;
    }
    // No hunter — top up fuel when low, otherwise idle by the fire.
    const fuelPct = state.fuel / this.fuelMax;
    if (fuelPct < 0.6) {
      await this.fireCycle(state, 1200, 1200);
    } else {
      await this.navigateTo(state, this.firePos.x, this.firePos.y + 40, 700);
      await this.page.waitForTimeout(400);
    }
  }

  async doRescue(stage, state) {
    const need = (stage.target) - state.rescuedCount;
    if (need <= 0) return;

    // Health retreat: if HP < 30%, move toward camp center first
    if (state.playerHp < state.playerHpMax * 0.3 && state.playerHpMax > 0) {
      await this.navigateTo(state, this.firePos.x, this.firePos.y + 60, 1500);
      return;
    }

    // Never leave for a rescue trip with fuel below 50% — a trip can run 60-120s and
    // some survivors are deep-south. Workers keep the fire alive while we're away,
    // but only if fuel starts high enough to survive the round-trip.
    if (state.fuel / this.fuelMax < 0.50) {
      await this.fireCycle(state, 1500, 1500);
      return;
    }

    // Pick nearest frozen survivor from live state; fall back to static positions
    const frozen = state.survivors.filter(s => s.state === 'frozen' || s.state === 'thawing');
    // All remaining survivors are already thawed (following) — return to fire and wait for them.
    const following = state.survivors.filter(s => s.state === 'following');
    if (frozen.length === 0 && following.length > 0) {
      // Go to fire and idle to let followers catch up and become workers.
      await this.navigateTo(state, this.firePos.x, this.firePos.y, 1500);
      await this.page.waitForTimeout(1200);
      return;
    }
    // Build candidate list (frozen survivors) with a stable key, filtered by
    // blacklist. Sort by distance ascending.
    const candidates = [];
    if (frozen.length > 0) {
      for (const sv of frozen) {
        const key = `${Math.round(sv.lx / 24)},${Math.round(sv.ly / 24)}`;
        if (this.rescueBlacklist.has(key)) continue;
        candidates.push({ key, x: sv.lx, y: sv.ly, state: sv.state });
      }
      // All blacklisted — clear and retry (second-nearest gets a fresh chance next)
      if (candidates.length === 0) {
        this.rescueBlacklist.clear();
        for (const sv of frozen) {
          const key = `${Math.round(sv.lx / 24)},${Math.round(sv.ly / 24)}`;
          candidates.push({ key, x: sv.lx, y: sv.ly, state: sv.state });
        }
      }
    } else if (this.survPoses.length > 0) {
      for (let i = 0; i < this.survPoses.length; i++) {
        const sp = this.survPoses[i];
        const key = `static${i}`;
        if (this.rescueBlacklist.has(key)) continue;
        candidates.push({ key, x: sp.x, y: sp.y, state: 'frozen' });
      }
    }

    if (candidates.length === 0) return;

    candidates.sort((a, b) =>
      dist(state.playerLX, state.playerLY, a.x, a.y) -
      dist(state.playerLX, state.playerLY, b.x, b.y),
    );
    const target = candidates[0];

    // ── Per-target stall watchdog: if we've been focused on the same survivor
    // for ≥ 20 s and rescuedCount hasn't advanced, blacklist it and try the
    // next-nearest on the next tick.
    if (this.rescueTargetKey !== target.key) {
      this.rescueTargetKey = target.key;
      this.rescueTargetT0 = Date.now();
      this.rescueTargetLastRescued = state.rescuedCount;
    } else {
      if (state.rescuedCount > this.rescueTargetLastRescued) {
        // Progress — reset
        this.rescueTargetT0 = Date.now();
        this.rescueTargetLastRescued = state.rescuedCount;
      } else if (Date.now() - this.rescueTargetT0 > 20000) {
        this.rescueBlacklist.add(target.key);
        this.issue('MINOR', `Rescue target ${target.key} unreachable (20s no progress) — blacklisted`);
        this.rescueTargetKey = '';
        this.rescueTargetT0  = Date.now();
        this.navPrevX = -9999; this.navPrevY = -9999;
        this._path = null;
        return;
      }
    }

    const d = dist(state.playerLX, state.playerLY, target.x, target.y);
    if (d > 70) {
      await this.navigateTo(state, target.x, target.y, Math.min(2500, d * 10));
    } else {
      // Stand still to thaw
      await this.page.waitForTimeout(1500);
    }
  }

  async doBuild(stage, state) {
    if (!this.padPos) return;

    // Health retreat
    if (state.playerHp < state.playerHpMax * 0.3 && state.playerHpMax > 0) {
      await this.navigateTo(state, this.firePos.x, this.firePos.y + 60, 1200);
      return;
    }

    if (state.coins < this.padCost) {
      // Not enough coins — do a fire cycle to earn more coins
      await this.fireCycle(state, 1500, 1500);
      return;
    }
    const d = dist(state.playerLX, state.playerLY, this.padPos.x, this.padPos.y);
    if (d > 60) {
      await this.navigateTo(state, this.padPos.x, this.padPos.y, Math.min(2500, d * 10));
    } else {
      // On pad — dwell for full coin-drain time: costCoins/payRateCoinsPerSec + margin.
      // payRateCoinsPerSec ≈ 13–16, so 90 coins / 13 = 6.9s, 150 / 16 = 9.4s.
      // Dwell for 12s to cover all pad costs with margin.
      // During dwell, keep nudging toward pad (dragging away breaks payment).
      const dwellMs = 12000;
      const start = Date.now();
      while (Date.now() - start < dwellMs) {
        // Small nudge to stay on pad
        const st = await readState(this.page) || state;
        if (st.tentBuilt) break;  // done!
        const pd = dist(st.playerLX, st.playerLY, this.padPos.x, this.padPos.y);
        if (pd > 40) {
          await this.navigateTo(st, this.padPos.x, this.padPos.y, 500);
        } else {
          await this.page.waitForTimeout(400);
        }
      }
    }
  }

  async doHunt(stage, state) {
    // Health retreat: if HP < 30%, retreat to fire first
    if (state.playerHp < state.playerHpMax * 0.3 && state.playerHpMax > 0) {
      await this.navigateTo(state, this.firePos.x, this.firePos.y + 60, 1500);
      return;
    }

    // Never start a hunt with fuel below 35% — a hunt stage can run 60-120s and the fire
    // will die if we commit now. Top up first.
    if (state.fuel / this.fuelMax < 0.35) {
      await this.fireCycle(state, 1500, 1500);
      return;
    }

    const hs = this.huntState;

    // ── Post-kill loiter: walk to meat drop(s) and dwell for auto-pickup ────
    if (hs.postKillLoiterMs > 0 && hs.postKillTarget) {
      // Prefer the real meat drop list — pick the nearest meat sprite that's
      // still alive. If nothing in the list, fall back to the stored kill pos.
      let mt = hs.postKillTarget;
      if (state.meatDrops && state.meatDrops.length > 0) {
        let bd = Infinity;
        for (const md of state.meatDrops) {
          if (md.alpha <= 0.05) continue;
          const d = dist(state.playerLX, state.playerLY, md.lx, md.ly);
          if (d < bd) { bd = d; mt = { x: md.lx, y: md.ly }; }
        }
      }
      const d = dist(state.playerLX, state.playerLY, mt.x, mt.y);
      if (d > 50) {
        await this.navigateTo(state, mt.x, mt.y, Math.min(1500, d * 8));
      } else {
        await this.page.waitForTimeout(250);
        hs.postKillLoiterMs -= 250;
      }
      if (hs.postKillLoiterMs <= 0) { hs.postKillTarget = null; }
      return;
    }

    // ── Pick target ─────────────────────────────────────────────────────────
    const live = state.animals.filter(a => a.state !== 'dead');
    if (live.length === 0) {
      // No live animals — should not normally happen mid-stage. Idle briefly.
      await this.page.waitForTimeout(400);
      return;
    }

    // Keep the current target if it's still alive and within range; otherwise
    // pick the nearest live one. Skip animals this hunt gave up on.
    let target = null;
    if (hs.currentIdx >= 0) {
      const t = live.find(a => a.idx === hs.currentIdx);
      if (t) {
        const dSelf = dist(state.playerLX, state.playerLY, t.lx, t.ly);
        // Give up if it fled > 400 px away (will lock to nearest below).
        if (dSelf < 400 && hs.noProgressDwells < 3) target = t;
      }
    }
    if (!target) {
      let bd = Infinity;
      for (const a of live) {
        if (hs.currentIdx === a.idx && hs.noProgressDwells >= 3) continue;
        const d = dist(state.playerLX, state.playerLY, a.lx, a.ly);
        if (d < bd) { bd = d; target = a; }
      }
      // All in blacklist? Clear and retry any.
      if (!target) {
        hs.currentIdx = -1; hs.noProgressDwells = 0; hs.lastHp = -1;
        for (const a of live) {
          const d = dist(state.playerLX, state.playerLY, a.lx, a.ly);
          if (d < bd) { bd = d; target = a; }
        }
      }
      if (target) {
        hs.currentIdx = target.idx;
        hs.lastHp = target.hp;
        hs.noProgressDwells = 0;
      }
    }

    if (!target) {
      await this.page.waitForTimeout(400);
      return;
    }

    // Predict next position: iso roam animals move ≈ 50 px/s; project 0.3 s.
    // This keeps navigateTo targeting the animal's ~future cell so the hero
    // meets it instead of chasing stale coords.
    const px = state.playerLX, py = state.playerLY;
    const d = dist(px, py, target.lx, target.ly);
    const HIT = 70;  // matches effRange floor in GameScene.ts
    if (d > HIT) {
      // Lead a bit toward the animal's roam center (we don't have velocity
      // in-state — but we can predict small drift by biasing toward the animal
      // and overshooting by ~20 px so we close the gap).
      const ang = angle(px, py, target.lx, target.ly);
      const leadX = target.lx + Math.cos(ang) * 20;
      const leadY = target.ly + Math.sin(ang) * 20;
      await this.navigateTo(state, leadX, leadY, Math.min(1500, d * 8));
      return;
    }

    // In hit range — stop driving so hero auto-attack can connect. Dwell
    // 400 ms, then re-read HP. If HP didn't drop over the last dwell AND we
    // weren't repositioning, count a no-progress dwell.
    await this.page.waitForTimeout(450);
    const after = await readState(this.page);
    if (!after) return;
    const live2 = after.animals.find(a => a.idx === target.idx);
    if (!live2 || live2.state === 'dead') {
      // Kill confirmed — set up post-kill loiter at the drop position.
      hs.postKillTarget = { x: target.lx, y: target.ly };
      hs.postKillLoiterMs = 1200;
      hs.currentIdx = -1; hs.lastHp = -1; hs.noProgressDwells = 0;
      return;
    }
    if (hs.lastHp >= 0 && live2.hp < hs.lastHp) {
      hs.noProgressDwells = 0;
    } else {
      hs.noProgressDwells++;
    }
    hs.lastHp = live2.hp;
    // Fire tending is handled by the main-loop hysteresis — no in-task interrupt.
  }

  async doCollectLogs(stage, state) {
    // Generic log collection — walk to nearest tree and bring back to fire
    await this.fireCycle(state, 1500, 1500);
  }

  // ── Worker/entity QA checks ────────────────────────────────────────────────
  checkEntities(state) {
    for (const w of state.workers) {
      const key = `w${w.idx}`;
      const prev = this.workerPrev.get(key);
      if (!prev) {
        this.workerPrev.set(key, { x: w.lx, y: w.ly, t: Date.now() });
      } else if (Date.now() - prev.t >= STUCK_LIMIT) {
        const moved = dist(prev.x, prev.y, w.lx, w.ly);
        if (moved < 8 && w.workerState !== 'chopping' && w.workerState !== 'atStation' && w.workerState !== 'fleeing') {
          this.issue('MINOR', `Worker ${w.idx} stuck ${STUCK_LIMIT/1000}s (state=${w.workerState}, moved=${moved.toFixed(0)}px)`);
        }
        this.workerPrev.set(key, { x: w.lx, y: w.ly, t: Date.now() });
      }
    }
  }

  // ── Stall diagnostic ───────────────────────────────────────────────────────
  // Returns a short descriptive string about why the current stage may be stuck.
  diagnoseStall(state, stage) {
    const px = state.playerLX, py = state.playerLY;
    const parts = [];
    parts.push(`player@(${px.toFixed(0)},${py.toFixed(0)}) fuel=${state.fuel.toFixed(0)} hp=${state.playerHp}/${state.playerHpMax}`);
    parts.push(`counters[rescued=${state.rescuedCount} kills=${state.animalsKilled} cooked=${state.cookedServed} planks=${state.planksProduced} supply=${state.supplyRunsCompleted} carriedLogs=${state.carriedLogs} carriedMeat=${state.carriedMeat}]`);

    switch (stage.type) {
      case 'rescueSurvivors': {
        const need = stage.target - state.rescuedCount;
        const frozen = state.survivors.filter(s => s.state === 'frozen' || s.state === 'thawing');
        parts.push(`need=${need} rescued=${state.rescuedCount} frozen=${frozen.length}`);
        if (frozen.length > 0) {
          let bd = Infinity; let best = null;
          for (const sv of frozen) {
            const d = dist(px, py, sv.lx, sv.ly);
            if (d < bd) { bd = d; best = sv; }
          }
          parts.push(`nearestFrozen@(${best.lx.toFixed(0)},${best.ly.toFixed(0)}) d=${bd.toFixed(0)}px state=${best.state}`);
        } else {
          // No live frozen survivors but target not met — map config issue?
          parts.push('NO_FROZEN_SURVIVORS_LEFT target not reachable');
        }
        break;
      }
      case 'huntAnimals': {
        const live = state.animals.filter(a => a.state !== 'dead');
        parts.push(`kills=${state.animalsKilled}/${stage.target} liveAnimals=${live.length}`);
        if (live.length > 0) {
          let bd = Infinity; let best = null;
          for (const a of live) {
            const d = dist(px, py, a.lx, a.ly);
            if (d < bd) { bd = d; best = a; }
          }
          parts.push(`nearestAnimal@(${best.lx.toFixed(0)},${best.ly.toFixed(0)}) d=${bd.toFixed(0)}px hp=${best.hp} state=${best.state}`);
        } else {
          parts.push(`NO_LIVE_ANIMALS — target=${stage.target} not spawnable`);
        }
        break;
      }
      case 'buildStructure': {
        parts.push(`coins=${state.coins.toFixed(0)}/${this.padCost} tentBuilt=${state.tentBuilt}`);
        if (this.padPos) {
          const d = dist(px, py, this.padPos.x, this.padPos.y);
          parts.push(`pad@(${this.padPos.x.toFixed(0)},${this.padPos.y.toFixed(0)}) d=${d.toFixed(0)}px`);
        }
        break;
      }
      case 'cookedServed':
      case 'planksProduced':
      case 'planksStocked':
      case 'supplyRunsCompleted':
      case 'fishCaught': {
        const workers = (state.workers ?? []);
        parts.push(`workers=${workers.length}`);
        if (workers.length > 0) {
          const states = workers.map(w => w.workerState).join(',');
          parts.push(`workerStates=[${states}]`);
        }
        break;
      }
      default:
        parts.push(`unknownStageType=${stage.type}`);
    }
    return parts.join(' | ');
  }

  // ── Main run loop ──────────────────────────────────────────────────────────
  async run() {
    console.log(`  Level ${this.num}: starting loop`);
    const page  = this.page;
    const toMs = levelTimeout(this.num);
    const tEnd = this.t0 + toMs;
    let goChecks = 0;

    let nullStateMs = 0;    // track how long readState returns null
    const NULL_STATE_LOSE_MS = 8000;  // after 8s of null state → scene transitioned away → treat as lose

    while (Date.now() < tEnd) {
      const state = await readState(page);

      if (!state) {
        nullStateMs += 400;
        await page.waitForTimeout(400);
        if (nullStateMs >= NULL_STATE_LOSE_MS) {
          // Scene transitioned away (most likely LoseScene after freeze) — treat as level end
          this.issue('MAJOR', `GameScene gone for ${(nullStateMs/1000).toFixed(0)}s — likely lose/freeze at stage ${this.lastStageIdx}`);
          break;
        }
        continue;
      }
      nullStateMs = 0;  // reset on successful state read

      // Expose fuelMax from cfg if available, otherwise use our constructor value
      if (state.fuelMax && state.fuelMax > 0) this.fuelMax = state.fuelMax;

      // FPS sampling every readState tick (ignoring first 1s for load spike).
      if (state?.fps && this.elapsed() >= 1) {
        this.fpsSamples.push(state.fps);
      }

      await this.screenshot(state);

      // ── Win / Lose detection ───────────────────────────────────────────
      if (state.gameOver) {
        goChecks++;
        if (goChecks >= 2) {
          const allDone = state.currentStageIdx >= state.goalStages.length;
          if (allDone) {
            this.won = true;
            const elapsed = this.elapsed();
            console.log(`  Level ${this.num} WIN in ${(elapsed/60).toFixed(1)} min`);
          } else {
            console.log(`  Level ${this.num} LOSE/gameOver at stage ${state.currentStageIdx}/${state.goalStages.length}`);
            this.issue('MAJOR', `Level ended (lose) at stage ${state.currentStageIdx}/${state.goalStages.length} at t=${this.elapsed().toFixed(0)}s`);
          }
          break;
        }
        await page.waitForTimeout(500);
        continue;
      }
      goChecks = 0;

      // ── Death detection ────────────────────────────────────────────────
      if (state.playerDead) {
        this.deaths++;
        if (this.deaths <= 5) this.issue('MINOR', `Player died (death #${this.deaths}) at stage ${state.currentStageIdx}`);
        // Reset nav tracking after respawn
        this.navPrevX = -9999; this.navPrevY = -9999;
        await page.waitForTimeout(3500);
        continue;
      }

      // ── Stage progression ──────────────────────────────────────────────
      if (state.currentStageIdx !== this.lastStageIdx) {
        const stageElapsed = (Date.now() - this.stageT0) / 1000;
        if (this.lastStageIdx >= 0) {
          this.goalTimes.push({ stage: this.lastStageIdx, sec: stageElapsed });
          console.log(`  Stage ${this.lastStageIdx} complete in ${stageElapsed.toFixed(1)}s`);
        }
        this.lastStageIdx = state.currentStageIdx;
        this.stageT0 = Date.now();
        this.goalStalledMs = Date.now();
        // Reset nav tracking on stage change
        this.navPrevX = -9999; this.navPrevY = -9999;
        // Mark as a "stage boundary" — allow one opportunistic fuel top-up before pursuing the new goal.
        this.needsTopUp = true;
        // Per-stage trackers reset.
        this.rescueBlacklist.clear();
        this.rescueTargetKey = '';
        this.rescueTargetT0  = Date.now();
        this.rescueTargetLastRescued = state.rescuedCount;
        this.huntState.currentIdx = -1; this.huntState.lastHp = -1;
        this.huntState.noProgressDwells = 0;
        this.huntState.postKillLoiterMs = 0; this.huntState.postKillTarget = null;
        this.progressT0 = Date.now();
        this.progressSnapshot = null;
        this.forceAltStageUntil = 0;
      }

      // ── 30s no-progress hard cap with 15s [botstall] INFO logs ────────
      // Progress counters: rescued, animalsKilled, cooked, planks, supplyRuns,
      // hero drift > 60 px. Any change → reset 30s timer. 15s before the 30s
      // cutoff fires we also log one INFO [botstall] line.
      {
        const snap = {
          rescued: state.rescuedCount, kills: state.animalsKilled,
          cooked: state.cookedServed, planks: state.planksProduced,
          supply: state.supplyRunsCompleted,
          px: state.playerLX, py: state.playerLY,
        };
        if (!this.progressSnapshot) {
          this.progressSnapshot = { ...snap, anchorX: snap.px, anchorY: snap.py };
          this.progressT0 = Date.now();
        } else {
          const p = this.progressSnapshot;
          const drift = Math.hypot(snap.px - p.anchorX, snap.py - p.anchorY);
          const changed =
            snap.rescued !== p.rescued || snap.kills !== p.kills ||
            snap.cooked  !== p.cooked  || snap.planks !== p.planks ||
            snap.supply  !== p.supply  || drift > 60;
          if (changed) {
            this.progressSnapshot = { ...snap, anchorX: snap.px, anchorY: snap.py };
            this.progressT0 = Date.now();
            this.lastBotstallLogMs = 0;
          } else {
            const idle = Date.now() - this.progressT0;
            if (idle >= 15000 && Date.now() - this.lastBotstallLogMs >= 15000
                && state.currentStageIdx < state.goalStages.length) {
              const cur  = state.goalStages[state.currentStageIdx];
              const diag = this.diagnoseStall(state, cur);
              console.log(`  [botstall] reason=no-progress stage=${state.currentStageIdx} goal=${cur.type} idle=${(idle/1000).toFixed(0)}s msg=${diag}`);
              this.lastBotstallLogMs = Date.now();
            }
            if (idle >= 30000 && state.currentStageIdx < state.goalStages.length
                && Date.now() - this.lastForcedSwitchMs > 15000) {
              const cur = state.goalStages[state.currentStageIdx];
              const diag = this.diagnoseStall(state, cur);
              console.log(`  [botstall] reason=30s-cap stage=${state.currentStageIdx} goal=${cur.type} msg=${diag}`);
              // Force task switch for 6 s. Rescue → fire; hunt → rescue;
              // build → chop a log; other → fire cycle.
              this.forceAltStageUntil = Date.now() + 6000;
              this.lastForcedSwitchMs  = Date.now();
              // Reset 30s window so we don't re-trigger every tick.
              this.progressT0 = Date.now();
              // Also flush any sticky nav/hunt/rescue state that may be causing the stall.
              this.navPrevX = -9999; this.navPrevY = -9999;
              this._path = null;
              this.huntState.currentIdx = -1; this.huntState.noProgressDwells = 0;
            }
          }
        }
      }

      // ── Goal stall check with diagnostic logging ──────────────────────
      if (state.currentStageIdx < state.goalStages.length) {
        if (Date.now() - this.goalStalledMs > STALL_LIMIT) {
          const cur = state.goalStages[state.currentStageIdx];
          const diag = this.diagnoseStall(state, cur);
          this.issue('MAJOR', `Stage ${state.currentStageIdx} (${cur.type}:${cur.target}) stalled >90s — ${diag}`);
          this.goalStalledMs = Date.now();
          // Force random unstick
          await drag(page, (Math.random() * 360) | 0, 800);
          this.navPrevX = -9999; this.navPrevY = -9999;
          continue;
        }
      }

      // ── Entity QA ──────────────────────────────────────────────────────
      this.checkEntities(state);

      // ── Nav-stall watchdog ────────────────────────────────────────────
      // If the player hasn't drifted more than 80px (Euclidean) from its
      // anchor in 12s, treat as stalled: the bot is probably oscillating
      // against a wall or circling a wolf, and needs a fire-waypoint reset
      // to escape. Measuring drift (not instantaneous movement) ignores
      // local wiggle. 80px is roughly one tile away.
      {
        const px = state.playerLX, py = state.playerLY;
        const drift = Math.hypot(px - this.lastMoveX, py - this.lastMoveY);
        if (drift > 80) {
          this.lastMoveX = px; this.lastMoveY = py; this.lastMoveMs = Date.now();
        } else if (Date.now() - this.lastMoveMs > 12000) {
          this.issue('MINOR', `Nav-stall 12s at (${px.toFixed(0)},${py.toFixed(0)}) — fire-waypoint reset`);
          await this.fireCycle(state, 1000, 1000);
          this.lastMoveX = px; this.lastMoveY = py; this.lastMoveMs = Date.now();
          this.navPrevX = -9999; this.navPrevY = -9999;
          continue;
        }
      }

      // ── Action decision (with hysteresis) ──────────────────────────────
      // Only CRITICAL fuel interrupts the current task. Below the critical threshold
      // the fire is <~4s from going out on late levels, so we must break off.
      // Between stages (needsTopUp), we may do one fire cycle before pursuing the new goal.
      const fuelPct      = state.fuel / this.fuelMax;
      const fuelCritical = fuelPct < FIRE_CRITICAL_PCT;
      const stagesDone   = state.currentStageIdx >= state.goalStages.length;

      if (stagesDone) {
        // Waiting for win scene to load
        await page.waitForTimeout(400);
        continue;
      }

      const curStage = state.goalStages[state.currentStageIdx];

      if (fuelCritical) {
        // Emergency: refill until SAFE so we don't cycle back here immediately.
        // Loop up to 3 cycles (cap avoids infinite loops when trees are on long cooldown).
        for (let cyc = 0; cyc < 3; cyc++) {
          await this.fireCycle(state, 700, 1000);
          const stCheck = await readState(this.page) || state;
          if (stCheck.playerDead || stCheck.gameOver) break;
          if ((stCheck.fuel / this.fuelMax) >= FIRE_SAFE_PCT) break;
        }
        this.needsTopUp = false;  // emergency counts as the top-up
      } else if (this.needsTopUp && fuelPct < FIRE_TOPUP_PCT && curStage.type !== 'buildStructure') {
        // Stage boundary opportunity: one fire cycle before committing to the next task.
        await this.fireCycle(state, 1200, 1200);
        this.needsTopUp = false;
      } else if (Date.now() < this.forceAltStageUntil) {
        // Hard-cap forced task switch (30s no progress). Pick a fallback that
        // can't deadlock on the same obstacle as the current stage.
        this.needsTopUp = false;
        const t = curStage.type;
        if (t === 'rescueSurvivors') {
          // Top up fire — gives workers a chance to chop and animals to move.
          await this.fireCycle(state, 1200, 1200);
        } else if (t === 'huntAnimals') {
          // Fall back to a rescue tick to give the animals time to drift closer
          // (plus clear any sticky hunt target).
          await this.doRescue({ target: state.rescuedCount + 1 }, state);
        } else if (t === 'buildStructure') {
          // Chop a log → coins at the fire cycle increments naturally.
          await this.fireCycle(state, 1200, 1200);
        } else {
          await this.fireCycle(state, 1200, 1200);
        }
      } else {
        // Committed to current stage — stay on it.
        this.needsTopUp = false;
        await this.doStage(curStage, state);
      }

      await page.waitForTimeout(50);
    }

    if (Date.now() >= tEnd && !this.won) {
      this.issue('BLOCKER', `Level ${this.num} TIMED OUT (${(toMs/60000)|0} min). Reached stage ${this.lastStageIdx}.`);
    }

    return this.summary(await readState(page));
  }

  summary(finalState) {
    const elapsed = this.elapsed();
    const fpsAvg  = this.fpsSamples.length
      ? (this.fpsSamples.reduce((a,b)=>a+b,0) / this.fpsSamples.length).toFixed(1)
      : 'n/a';
    const fpsMin  = this.fpsSamples.length ? Math.min(...this.fpsSamples).toFixed(0) : 'n/a';
    return {
      levelNum:  this.num,
      elapsed,
      won:       this.won,
      deaths:    this.deaths,
      issues:    this.issues,
      goalTimes: this.goalTimes,
      fpsAvg, fpsMin,
      screenshots: this.screenshots,
      finalState,
      consoleErrors: this.consoleErrors ?? [],
      fpsSpikes:    this.fpsSpikes ?? [],
    };
  }
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function main() {
  await mkdir(SCREENSHOTS_DIR, { recursive: true });

  // Load all level configs
  const cfgs = [];
  for (let n = 1; n <= 15; n++) {
    const fp  = path.join(__dirname, 'src', 'levels', `level${String(n).padStart(2,'0')}.json`);
    cfgs.push(JSON.parse(await readFile(fp, 'utf8')));
  }

  // Ensure server is up
  const serverUp = await fetch(`${BASE_URL}/index.html`).then(() => true).catch(() => false);
  if (!serverUp) {
    console.error('Server not responding at', BASE_URL, '— start it first');
    process.exit(1);
  }
  console.log('Server is up at', BASE_URL);

  // Playwright/WebKit resources accumulate across contexts during long multi-level
  // runs. The scene-transition leak probe confirmed Phaser teardown is clean
  // (textures/tweens/timers/heap all flat L1→L8) and FPS stays 21-25, so the
  // cumulative slow-down is in the browser process itself. Mitigation: relaunch
  // the WebKit browser every CONTEXT_RESTART_EVERY levels so each batch starts
  // fresh. 3 picked per operator guidance.
  const CONTEXT_RESTART_EVERY = 1;
  let browser = await webkit.launch({ headless: true });
  const results  = [];

  // Optional LEVELS env var — comma-separated list (e.g. "6" or "12,13,14,15").
  // Omit to run all 15.
  const levelsEnv = (process.env.LEVELS || '').trim();
  const levelNums = levelsEnv
    ? levelsEnv.split(',').map(s => parseInt(s.trim(), 10)).filter(n => n >= 1 && n <= 15)
    : Array.from({ length: 15 }, (_, i) => i + 1);

  let levelsSinceRestart = 0;
  for (const n of levelNums) {
    console.log(`\n=== Level ${n} ===`);
    const cfg = cfgs[n - 1];

    if (levelsSinceRestart >= CONTEXT_RESTART_EVERY) {
      try { await browser.close(); } catch {}
      browser = await webkit.launch({ headless: true });
      levelsSinceRestart = 0;
      console.log(`  [bot] relaunched browser (every ${CONTEXT_RESTART_EVERY} levels)`);
    }
    levelsSinceRestart++;

    const ctx = await browser.newContext({
      viewport:  VIEWPORT,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      isMobile:  true,
      hasTouch:  true,
    });
    const page = await ctx.newPage();

    const conErrs = [];
    const fpsSpikes = [];
    page.on('console', m => {
      if (m.type() === 'error') {
        conErrs.push({ t: Date.now(), text: m.text() });
        console.log(`  [err] ${m.text().substring(0,120)}`);
      } else if (m.type() === 'log' && m.text().startsWith('[FPS-spike]')) {
        fpsSpikes.push({ t: Date.now(), text: m.text() });
      } else if (m.type() === 'log' && (m.text().startsWith('[tel]') || m.text().startsWith('[chain]') || m.text().startsWith('[stations]') || m.text().startsWith('[stage]'))) {
        console.log(`  ${m.text()}`);
      }
    });
    page.on('pageerror', e => {
      conErrs.push({ t: Date.now(), text: e.message });
      console.log(`  [pageerr] ${e.message.substring(0,120)}`);
    });

    let result;
    try {
      // Navigate using ?level=N parameter — BootScene handles this directly
      await page.goto(`${BASE_URL}/?level=${n}&noaudio`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await page.waitForSelector('canvas', { timeout: 15000 });

      // Let Phaser load assets (preload phase). Check for GameScene ready.
      let sceneReady = false;
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(500);
        const hasScene = await page.evaluate(() => {
          const g = window.__game;
          return !!(g && g.scene.getScene('GameScene'));
        }).catch(() => false);
        if (hasScene) { sceneReady = true; break; }
      }

      if (!sceneReady) {
        throw new Error('GameScene never became available after 20s');
      }

      // Click canvas to give focus (needed for input)
      await page.locator('canvas').click({ position: { x: 196, y: 426 }, force: true });
      await page.waitForTimeout(500);

      // Initial screenshot
      const lpad = String(n).padStart(2,'0');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `level${lpad}_t000.png`) });

      const bot = new Bot(page, n, cfg);
      bot.consoleErrors = conErrs;
      bot.fpsSpikes = fpsSpikes;
      result = await bot.run();
    } catch (err) {
      console.error(`  Level ${n} crashed:`, err.message);
      result = {
        levelNum: n, elapsed: 0, won: false, deaths: 0,
        issues: [{ sev: 'BLOCKER', msg: `Crash: ${err.message}`, t: 0 }],
        goalTimes: [], fpsAvg: 'n/a', fpsMin: 'n/a',
        screenshots: 0, finalState: null, consoleErrors: conErrs,
      };
    }

    // Final screenshot
    try {
      const lpad = String(n).padStart(2,'0');
      const tpad = String(Math.floor(result.elapsed)).padStart(3,'0');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `level${lpad}_t${tpad}_final.png`) });
    } catch {}

    results.push(result);
    await ctx.close();
  }

  await browser.close();

  // Write report
  const md = buildReport(results, cfgs);
  await writeFile(REPORT_PATH, md, 'utf8');
  console.log('\nReport written to', REPORT_PATH);
}

// ── Report builder ────────────────────────────────────────────────────────────
function buildReport(results, cfgs) {
  const ts = new Date().toISOString().replace('T',' ').slice(0,19);
  const L  = [];

  L.push(`# Frostborn Automated Playtest Report`);
  L.push(`\nGenerated: ${ts}  |  Platform: WebKit headless (Playwright)  |  Viewport: 393×852`);
  L.push(`\n---\n`);

  // Primary summary table (per task spec: Level | Completed | Time | Deaths | FPS min | FPS avg)
  // FPS min/avg exclude the first 1s of each level (load spike).
  L.push(`## Summary (15-level playtest)\n`);
  L.push(`| Level | Completed | Time (actual vs target) | Deaths | FPS min (post-1s) | FPS avg |`);
  L.push(`|-------|-----------|-------------------------|--------|-------------------|---------|`);

  for (const r of results) {
    const bt   = BALANCE[r.levelNum];
    const mins = (r.elapsed / 60).toFixed(1);
    const tgt  = bt ? `${bt.min}–${bt.max} min` : 'TBD';
    const yn   = r.won ? 'Y' : 'N';
    let timeStr;
    if (bt && r.won) {
      const m = r.elapsed / 60;
      let vs = 'on target';
      if (m < bt.min)      vs = `${((bt.min - m)*60).toFixed(0)}s fast`;
      else if (m > bt.max) vs = `${((m - bt.max)*60).toFixed(0)}s slow`;
      timeStr = `${mins} min (target ${tgt} — ${vs})`;
    } else {
      timeStr = `${mins} min (target ${tgt})`;
    }
    L.push(`| L${r.levelNum} | ${yn} | ${timeStr} | ${r.deaths} | ${r.fpsMin} | ${r.fpsAvg} |`);
  }

  L.push(`\n---\n`);

  // Legacy extended table
  L.push(`## Extended Summary\n`);
  L.push(`| # | Name | Time | Target | vs Target | Deaths | Issues | FPS avg | FPS min |`);
  L.push(`|---|------|------|--------|-----------|--------|--------|---------|---------|`);

  for (const r of results) {
    const cfg  = cfgs[r.levelNum - 1];
    const name = cfg.name ?? `L${r.levelNum}`;
    const bt   = BALANCE[r.levelNum];
    const tgt  = bt ? `${bt.min}–${bt.max} min` : 'TBD';
    const mins = (r.elapsed / 60).toFixed(1);
    const status = r.won ? '✅ WIN' : '❌ DNF';
    let vs = '—';
    if (bt && r.won) {
      const m = r.elapsed / 60;
      if (m < bt.min) vs = `${((bt.min - m)*60).toFixed(0)}s fast`;
      else if (m > bt.max) vs = `${((m - bt.max)*60).toFixed(0)}s slow`;
      else vs = 'on target';
    }
    const iss = r.issues.length;
    L.push(`| L${r.levelNum} | ${name} | ${mins} min ${status} | ${tgt} | ${vs} | ${r.deaths} | ${iss} | ${r.fpsAvg} | ${r.fpsMin} |`);
  }

  L.push(`\n---\n`);

  // Per-level sections
  L.push(`## Per-Level Details\n`);
  for (const r of results) {
    const cfg  = cfgs[r.levelNum - 1];
    const name = cfg.name ?? `L${r.levelNum}`;
    const bt   = BALANCE[r.levelNum];
    const mins = (r.elapsed / 60).toFixed(1);
    const status = r.won ? 'WIN' : 'DNF';

    L.push(`### Level ${r.levelNum}: ${name}\n`);
    L.push(`**Result**: ${status} | **Time**: ${mins} min | **Deaths**: ${r.deaths} | **FPS**: avg ${r.fpsAvg}, min ${r.fpsMin}`);
    L.push(`\n**Balance target**: ${bt ? `${bt.min}–${bt.max} min` : 'TBD'} — ${bt?.note ?? '—'}`);

    // Stage chain
    const chain = (cfg.stages ?? []).map((s,i) => `${i+1}. ${s.type}(${s.target})`).join(' → ');
    L.push(`\n**Stage chain**: ${chain}`);

    // Stage times
    if (r.goalTimes.length > 0) {
      L.push(`\n**Stage completion times**:`);
      for (const gt of r.goalTimes) L.push(`- Stage ${gt.stage}: ${gt.sec.toFixed(1)}s`);
    }

    // Issues
    const blockers = r.issues.filter(i => i.sev === 'BLOCKER');
    const majors   = r.issues.filter(i => i.sev === 'MAJOR');
    const minors   = r.issues.filter(i => i.sev === 'MINOR');

    if (r.issues.length > 0) {
      L.push(`\n**Issues (${r.issues.length} total)**:\n`);
      for (const iss of blockers) L.push(`- 🔴 BLOCKER t=${iss.t.toFixed(0)}s: ${iss.msg}`);
      for (const iss of majors)   L.push(`- 🟠 MAJOR   t=${iss.t.toFixed(0)}s: ${iss.msg}`);
      for (const iss of minors.slice(0,5)) L.push(`- 🟡 MINOR   t=${iss.t.toFixed(0)}s: ${iss.msg}`);
      if (minors.length > 5) L.push(`- ... (${minors.length - 5} more minor issues)`);
    } else {
      L.push(`\n**Issues**: none`);
    }

    if (r.consoleErrors && r.consoleErrors.length > 0) {
      L.push(`\n**Console errors**: ${r.consoleErrors.length}`);
      for (const e of r.consoleErrors.slice(0,3)) L.push(`- ${e.text.substring(0,100)}`);
    }

    if (r.fpsSpikes && r.fpsSpikes.length > 0) {
      L.push(`\n**FPS spikes (>50ms frame)**: ${r.fpsSpikes.length}`);
      for (const s of r.fpsSpikes.slice(0,5)) L.push(`- ${s.text.substring(0,140)}`);
      if (r.fpsSpikes.length > 5) L.push(`- ... (${r.fpsSpikes.length - 5} more)`);
    }

    L.push('');
  }

  return L.join('\n');
}

main().catch(console.error);

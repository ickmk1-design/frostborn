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
const BASE_URL       = 'http://localhost:5177';
const VIEWPORT       = { width: 393, height: 852 };
const LEVEL_TIMEOUT  = 10 * 60 * 1000;   // 10 min per level
const SCREENSHOT_INT = 5000;             // ms between screenshots
const STALL_LIMIT    = 90 * 1000;        // 90s stall detection
const STUCK_LIMIT    = 8 * 1000;         // 8s entity stuck detection

// Joystick geometry — fixed to lower portion of screen
const JOY_X     = 196;
const JOY_Y     = 700;
const JOY_DRAG  = 55;   // px drag radius (60px max per spec)

// Fire priority threshold — if fuel < this fraction of fuelMax, drop everything and feed fire
const FIRE_PRIORITY_PCT = 0.40;   // 40% of fuelMax

// isoToScreen helper (mirrors isoUtils.ts)
// tileW=80, tileH=40
const TW = 80, TH = 40;
function isoToScreen(ix, iy, ox, oy) {
  return { x: ox + (ix - iy) * TW / 2, y: oy + (ix + iy) * TH / 2 };
}
function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
function angle(fx, fy, tx, ty) { return Math.atan2(ty - fy, tx - fx); }

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
      goalStages:      (sc.goalStages   ?? []).map(s => ({ type: s.type, target: s.target })),
      currentStageIdx: sc.currentStageIdx ?? 0,
      animalsKilled:   sc.animalsKilled ?? 0,
      fireX:           sc.fireX         ?? 0,
      fireY:           sc.fireY         ?? 0,
      padX:            sc.padX          ?? 0,
      padY:            sc.padY          ?? 0,
      fps:             sc.game?.loop?.actualFps ?? 0,
      survivors: (sc.survivors ?? []).map(s => ({
        state: s.state, lx: s.lx, ly: s.ly, stuckMs: s.stuckMs ?? 0,
      })),
      animals: (sc.animals ?? []).map(a => ({
        state: a.state, lx: a.lx, ly: a.ly, hp: a.hp,
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

    // Stall detection
    this.lastMoveX     = -9999;
    this.lastMoveY     = -9999;
    this.lastMoveMs    = Date.now();
    this.goalStalledMs = Date.now();
    this.prevGoalIdx   = 0;

    // Worker stuck map
    this.workerPrev    = new Map();

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
    if (state?.fps) {
      this.fpsSamples.push(state.fps);
      if (state.fps < 25) this.issue('MINOR', `Low FPS: ${Math.round(state.fps)}`);
    }
  }

  // ── Smart navigation: walk toward target, detour if stuck ──────────────────
  // Tracks movement progress; if no progress in 3s, tries a perpendicular detour.
  async navigateTo(state, tx, ty, stepMs = 1200) {
    const px = state.playerLX, py = state.playerLY;
    const d = dist(px, py, tx, ty);
    if (d < 50) return; // already close enough

    // Check if we're making progress toward target
    const prevDist = dist(this.navPrevX, this.navPrevY, tx, ty);
    const currDist = dist(px, py, tx, ty);
    const progressPx = prevDist - currDist;

    if (this.navPrevX !== -9999 && Date.now() - this.navPrevMs > 2500 && progressPx < 10) {
      // Stuck — try perpendicular detour
      const mainAngle = angle(px, py, tx, ty);
      const perpAngle = mainAngle + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
      const perpDeg = snapAngle(perpAngle);
      await drag(this.page, perpDeg, 900);
      this.navPrevMs = Date.now();
      this.navPrevX = px; this.navPrevY = py;
      return;
    }

    this.navPrevX = px; this.navPrevY = py;
    this.navPrevMs = Date.now();

    const a = angle(px, py, tx, ty);
    const deg = snapAngle(a);
    await drag(this.page, deg, Math.min(stepMs, d * 8));
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
      default:
        // Unknown — stay near fire
        await this.navigateTo(state, this.firePos.x, this.firePos.y, 600);
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

    // Pick nearest frozen survivor from live state; fall back to static positions
    let target = null;
    const frozen = state.survivors.filter(s => s.state === 'frozen' || s.state === 'thawing');
    // All remaining survivors are already thawed (following) — return to fire and wait for them.
    const following = state.survivors.filter(s => s.state === 'following');
    if (frozen.length === 0 && following.length > 0) {
      // Go to fire and idle to let followers catch up and become workers.
      await this.navigateTo(state, this.firePos.x, this.firePos.y, 1500);
      await this.page.waitForTimeout(1200);
      return;
    }
    if (frozen.length > 0) {
      let bd = Infinity;
      for (const sv of frozen) {
        const d = dist(state.playerLX, state.playerLY, sv.lx, sv.ly);
        if (d < bd) { bd = d; target = { x: sv.lx, y: sv.ly }; }
      }
    } else if (this.survPoses.length > 0) {
      let bd = Infinity;
      for (const sp of this.survPoses) {
        const d = dist(state.playerLX, state.playerLY, sp.x, sp.y);
        if (d < bd) { bd = d; target = sp; }
      }
    }

    if (!target) return;

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

    // Pick nearest live animal
    const live = state.animals.filter(a => a.state !== 'dead');
    let target = null, bd = Infinity;

    if (live.length > 0) {
      for (const a of live) {
        const d = dist(state.playerLX, state.playerLY, a.lx, a.ly);
        if (d < bd) { bd = d; target = { x: a.lx, y: a.ly }; }
      }
    } else if (this.animPoses.length > 0) {
      for (const ap of this.animPoses) {
        const d = dist(state.playerLX, state.playerLY, ap.x, ap.y);
        if (d < bd) { bd = d; target = ap; }
      }
    }

    if (!target) {
      await this.page.waitForTimeout(500);
      return;
    }

    const d = dist(state.playerLX, state.playerLY, target.x, target.y);
    if (d > 65) {
      await this.navigateTo(state, target.x, target.y, Math.min(2000, d * 8));
    } else {
      // Near animal — keep pressing toward it (attack)
      await walkTo(this.page, state, target.x, target.y, 500);
      await this.page.waitForTimeout(150);
    }

    // After hunting also check fire
    const st2 = await readState(this.page) || state;
    if (st2.fuel < this.fuelMax * 0.35 && this.treePoses.length > 0) {
      await this.fireCycle(st2, 1200, 1200);
    }
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
        if (moved < 8 && w.workerState !== 'chopping') {
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
    parts.push(`player@(${px.toFixed(0)},${py.toFixed(0)}) fuel=${state.fuel.toFixed(0)}`);

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
      default:
        parts.push(`unknownStageType=${stage.type}`);
    }
    return parts.join(' | ');
  }

  // ── Main run loop ──────────────────────────────────────────────────────────
  async run() {
    console.log(`  Level ${this.num}: starting loop`);
    const page  = this.page;
    const tEnd  = this.t0 + LEVEL_TIMEOUT;
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

      // ── Action decision ────────────────────────────────────────────────
      // Priority 1 — FIRE TENDING: fuel < 40% of fuelMax → drop everything, feed fire.
      // fuelDrainPerSec ~5.5 on later levels; at 40% with 100 fuelMax = 40 fuel → ~7s before empty.
      const fuelPct      = state.fuel / this.fuelMax;
      const fuelLow      = fuelPct < FIRE_PRIORITY_PCT;
      const fuelCritical = fuelPct < 0.15;
      const stagesDone   = state.currentStageIdx >= state.goalStages.length;

      if (stagesDone) {
        // Waiting for win scene to load
        await page.waitForTimeout(400);
        continue;
      }

      const curStage = state.goalStages[state.currentStageIdx];

      if (fuelCritical) {
        // Emergency: drop everything, rush to nearest tree then fire
        await this.fireCycle(state, 700, 1000);
      } else if (fuelLow) {
        // Fire priority: collect log and deliver before anything else
        await this.fireCycle(state, 1300, 1300);
      } else {
        // Pursue current goal
        await this.doStage(curStage, state);

        // After goal action, opportunistically top up fuel if below 60%
        // Skip during buildStructure — we don't want to drag the bot off the payment pad.
        if (curStage.type !== 'buildStructure') {
          const st2 = await readState(page) || state;
          if (st2 && !st2.gameOver && !st2.playerDead) {
            const st2FuelPct = st2.fuel / this.fuelMax;
            if (st2FuelPct < 0.60 && this.treePoses.length > 0) {
              await this.fireCycle(st2, 1000, 1000);
            }
          }
        }
      }

      await page.waitForTimeout(50);
    }

    if (Date.now() >= tEnd && !this.won) {
      this.issue('BLOCKER', `Level ${this.num} TIMED OUT (10 min). Reached stage ${this.lastStageIdx}.`);
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

  const browser = await webkit.launch({ headless: true });
  const results  = [];

  for (let n = 1; n <= 15; n++) {
    console.log(`\n=== Level ${n} ===`);
    const cfg = cfgs[n - 1];

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

  // Summary table
  L.push(`## Summary Table\n`);
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

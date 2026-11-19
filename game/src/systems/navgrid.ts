// ─────────────────────────────────────────────────────────────────────────────
// NavGrid — shared A* pathfinding for workers, animals, and the bot hero.
//
// Grid cells live in SCREEN space (24 px). Blocked cells come from:
//   • Obstacle circles (fire, trees, stations, build pads, decor colliders)
//   • Wall tiles from cfg.walls (shrunk 4px from tile edges to leave a crack)
//   • Gate tiles from cfg.gate always override back to open
//
// The grid is built once on scene create and recomputed whenever a building
// completes or a dynamic obstacle is added/removed (call `markDirty()` then
// the next `findPath` call re-runs `recompute`).
//
// Path smoothing uses line-of-sight to collapse diagonal zig-zags into a few
// long segments the steering/wall-slide layer can follow comfortably.
// ─────────────────────────────────────────────────────────────────────────────

import { isoToScreen, TILE_W, TILE_H } from '../isoUtils';

export interface NavObstacle { x: number; y: number; r: number; }
export interface NavBounds { minX: number; minY: number; maxX: number; maxY: number; }
export interface Waypoint { x: number; y: number; }

const CELL = 24;

export class NavGrid {
  cellSize = CELL;
  minX = 0; minY = 0; maxX = 0; maxY = 0;
  cols = 0; rows = 0;
  blocked!: Uint8Array;
  dirty = false;

  // Instrumentation — total A* calls + cumulative wall-clock ms spent in findPath.
  // Reset per-level in build(); read via `scene.navGrid.stats`.
  stats = { calls: 0, totalMs: 0, pathLenSum: 0, straightSum: 0, emptyResults: 0 };

  private _obstacles: NavObstacle[] = [];
  private _walls: Array<[number, number]> = [];
  private _gate: Array<[number, number]> = [];
  private _originX = 0;
  private _originY = 0;

  build(cfg: any, obstacles: NavObstacle[], bounds: NavBounds): void {
    this._originX = cfg.originX;
    this._originY = cfg.originY;
    this._walls = ((cfg.walls as Array<[number, number]>) ?? []).slice();
    this._gate  = ((cfg.gate  as Array<[number, number]>) ?? []).slice();
    this._obstacles = obstacles.slice();
    this.minX = bounds.minX; this.minY = bounds.minY;
    this.maxX = bounds.maxX; this.maxY = bounds.maxY;
    this.cols = Math.max(1, Math.ceil((this.maxX - this.minX) / CELL));
    this.rows = Math.max(1, Math.ceil((this.maxY - this.minY) / CELL));
    this.blocked = new Uint8Array(this.cols * this.rows);
    this.stats = { calls: 0, totalMs: 0, pathLenSum: 0, straightSum: 0, emptyResults: 0 };
    this.recompute();
  }

  setObstacles(obstacles: NavObstacle[]): void {
    this._obstacles = obstacles.slice();
    this.markDirty();
  }

  markDirty(): void { this.dirty = true; }

  recompute(): void {
    this.blocked.fill(0);
    // ── Obstacle circles ────────────────────────────────────────────────────
    for (const o of this._obstacles) {
      const c0 = this._toCell(o.x - o.r, o.y - o.r);
      const c1 = this._toCell(o.x + o.r, o.y + o.r);
      const r2 = o.r * o.r;
      for (let r = c0.r; r <= c1.r; r++) {
        if (r < 0 || r >= this.rows) continue;
        for (let c = c0.c; c <= c1.c; c++) {
          if (c < 0 || c >= this.cols) continue;
          const cx = this.minX + (c + 0.5) * CELL;
          const cy = this.minY + (r + 0.5) * CELL;
          const dx = cx - o.x; const dy = cy - o.y;
          if (dx * dx + dy * dy <= r2) this.blocked[r * this.cols + c] = 1;
        }
      }
    }
    // ── Wall tiles — exclude gate tiles ─────────────────────────────────────
    const gateSet = new Set<string>();
    for (const [gx, gy] of this._gate) gateSet.add(`${gx},${gy}`);
    const HW = TILE_W / 2; const HH = TILE_H / 2;
    for (const [wx, wy] of this._walls) {
      if (gateSet.has(`${wx},${wy}`)) continue;
      const p = isoToScreen(wx, wy, this._originX, this._originY);
      // Shrink 4 px from each edge so adjacent cells next to the wall stay
      // walkable and A* can slide along the inner face.
      const x0 = p.x - HW + 4; const y0 = p.y - HH + 2;
      const x1 = p.x + HW - 4; const y1 = p.y + HH - 2;
      const c0 = this._toCell(x0, y0); const c1 = this._toCell(x1, y1);
      for (let r = c0.r; r <= c1.r; r++) {
        if (r < 0 || r >= this.rows) continue;
        for (let c = c0.c; c <= c1.c; c++) {
          if (c < 0 || c >= this.cols) continue;
          this.blocked[r * this.cols + c] = 1;
        }
      }
    }
    // ── Gate tiles always open (overrides any wall/obstacle blocking) ───────
    for (const [gx, gy] of this._gate) {
      const p = isoToScreen(gx, gy, this._originX, this._originY);
      const cell = this._toCell(p.x, p.y);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = cell.r + dr; const c = cell.c + dc;
          if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
          this.blocked[r * this.cols + c] = 0;
        }
      }
    }
    this.dirty = false;
  }

  isBlocked(x: number, y: number): boolean {
    const c = Math.floor((x - this.minX) / CELL);
    const r = Math.floor((y - this.minY) / CELL);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    return this.blocked[r * this.cols + c] === 1;
  }

  isReachable(fromX: number, fromY: number, toX: number, toY: number): boolean {
    return this.findPath(fromX, fromY, toX, toY).length > 0;
  }

  // Returns waypoints in screen coords — empty array means no path.
  // First waypoint is the next step after `from`; last is `(toX,toY)`.
  findPath(fromX: number, fromY: number, toX: number, toY: number): Waypoint[] {
    if (this.dirty) this.recompute();
    const _t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    this.stats.calls++;
    this.stats.straightSum += Math.hypot(toX - fromX, toY - fromY);
    const _done = (out: Waypoint[]) => {
      const _t1 = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      this.stats.totalMs += _t1 - _t0;
      if (out.length === 0) this.stats.emptyResults++;
      else {
        let plen = 0; let px = fromX, py = fromY;
        for (const w of out) { plen += Math.hypot(w.x - px, w.y - py); px = w.x; py = w.y; }
        this.stats.pathLenSum += plen;
      }
      return out;
    };
    const start = this._nearestOpen(fromX, fromY);
    const goal  = this._nearestOpen(toX, toY);
    if (!start || !goal) return _done([]);
    if (start.r === goal.r && start.c === goal.c) return _done([{ x: toX, y: toY }]);

    // If goal is directly visible, skip A* entirely.
    if (this._lineOfSight(fromX, fromY, toX, toY)) return _done([{ x: toX, y: toY }]);

    const sIdx = start.r * this.cols + start.c;
    const gIdx = goal.r  * this.cols + goal.c;
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();
    const came   = new Map<number, number>();
    gScore.set(sIdx, 0);
    fScore.set(sIdx, this._h(start.r, start.c, goal.r, goal.c));
    const open = new MinHeap<number>((a, b) =>
      (fScore.get(a) ?? Infinity) - (fScore.get(b) ?? Infinity),
    );
    open.push(sIdx);

    const DIRS: Array<[number, number, number]> = [
      [-1,-1,1.414], [-1, 0, 1], [-1, 1, 1.414],
      [ 0,-1, 1],                 [ 0, 1, 1],
      [ 1,-1,1.414], [ 1, 0, 1], [ 1, 1, 1.414],
    ];
    const MAX_ITERS = 8000;
    let iters = 0;

    while (open.size() > 0 && iters < MAX_ITERS) {
      iters++;
      const cur = open.pop()!;
      if (cur === gIdx) {
        // Reconstruct cells
        const cells: number[] = [cur];
        let n: number | undefined = cur;
        while ((n = came.get(n)) !== undefined) cells.unshift(n);
        const waypoints: Waypoint[] = [];
        for (let i = 1; i < cells.length; i++) {
          const ci = cells[i];
          const rr = Math.floor(ci / this.cols);
          const cc = ci % this.cols;
          waypoints.push({
            x: this.minX + (cc + 0.5) * CELL,
            y: this.minY + (rr + 0.5) * CELL,
          });
        }
        if (waypoints.length > 0) waypoints[waypoints.length - 1] = { x: toX, y: toY };
        return _done(this._smooth(fromX, fromY, waypoints));
      }
      const cr = Math.floor(cur / this.cols);
      const cc = cur % this.cols;
      for (const [dr, dc, w] of DIRS) {
        const nr = cr + dr; const nc = cc + dc;
        if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
        if (this.blocked[nr * this.cols + nc]) continue;
        // Prevent corner-cutting through a blocked diagonal
        if (dr !== 0 && dc !== 0) {
          if (this.blocked[cr * this.cols + nc] || this.blocked[nr * this.cols + cc]) continue;
        }
        const nIdx = nr * this.cols + nc;
        const tentative = (gScore.get(cur) ?? Infinity) + w;
        if (tentative < (gScore.get(nIdx) ?? Infinity)) {
          came.set(nIdx, cur);
          gScore.set(nIdx, tentative);
          fScore.set(nIdx, tentative + this._h(nr, nc, goal.r, goal.c));
          open.push(nIdx);
        }
      }
    }
    return _done([]);
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private _toCell(x: number, y: number): { r: number; c: number } {
    return {
      c: Math.floor((x - this.minX) / CELL),
      r: Math.floor((y - this.minY) / CELL),
    };
  }

  private _nearestOpen(x: number, y: number, maxRings = 10): { r: number; c: number } | null {
    const c0 = Math.floor((x - this.minX) / CELL);
    const r0 = Math.floor((y - this.minY) / CELL);
    for (let ring = 0; ring <= maxRings; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (ring > 0 && Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const r = r0 + dr; const c = c0 + dc;
          if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
          if (!this.blocked[r * this.cols + c]) return { r, c };
        }
      }
    }
    return null;
  }

  private _h(r: number, c: number, gr: number, gc: number): number {
    // Octile heuristic
    const dr = Math.abs(r - gr); const dc = Math.abs(c - gc);
    return (dr + dc) + (1.414 - 2) * Math.min(dr, dc);
  }

  private _smooth(sx: number, sy: number, waypoints: Waypoint[]): Waypoint[] {
    if (waypoints.length <= 1) return waypoints;
    const out: Waypoint[] = [];
    let cx = sx, cy = sy;
    let i = 0;
    while (i < waypoints.length) {
      let j = waypoints.length - 1;
      while (j > i && !this._lineOfSight(cx, cy, waypoints[j].x, waypoints[j].y)) j--;
      out.push(waypoints[j]);
      cx = waypoints[j].x; cy = waypoints[j].y;
      i = j + 1;
    }
    return out;
  }

  private _lineOfSight(x0: number, y0: number, x1: number, y1: number): boolean {
    const d = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.ceil(d / (CELL * 0.6)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (this.isBlocked(x, y)) return false;
    }
    return true;
  }
}

class MinHeap<T> {
  private data: T[] = [];
  constructor(private cmp: (a: T, b: T) => number) {}
  size(): number { return this.data.length; }
  push(v: T): void {
    this.data.push(v);
    let i = this.data.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(this.data[i], this.data[p]) < 0) {
        const t = this.data[i]; this.data[i] = this.data[p]; this.data[p] = t;
        i = p;
      } else break;
    }
  }
  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      const n = this.data.length;
      let i = 0;
      while (true) {
        const l = 2 * i + 1; const r = 2 * i + 2;
        let m = i;
        if (l < n && this.cmp(this.data[l], this.data[m]) < 0) m = l;
        if (r < n && this.cmp(this.data[r], this.data[m]) < 0) m = r;
        if (m === i) break;
        const t = this.data[i]; this.data[i] = this.data[m]; this.data[m] = t;
        i = m;
      }
    }
    return top;
  }
}

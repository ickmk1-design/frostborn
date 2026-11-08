import Phaser from 'phaser';
import level01 from '../levels/level01.json';
import level02 from '../levels/level02.json';
import level03 from '../levels/level03.json';
import level04 from '../levels/level04.json';
import level05 from '../levels/level05.json';
import level06 from '../levels/level06.json';
import level07 from '../levels/level07.json';
import level08 from '../levels/level08.json';
import level09 from '../levels/level09.json';
import level10 from '../levels/level10.json';
import level11 from '../levels/level11.json';
import level12 from '../levels/level12.json';
import level13 from '../levels/level13.json';
import level14 from '../levels/level14.json';
import level15 from '../levels/level15.json';
import { isoToScreen, screenToIso, TILE_W, TILE_H } from '../isoUtils';

const LEVEL_CONFIGS: Record<string, any> = {
  level01, level02, level03, level04, level05,
  level06, level07, level08, level09, level10,
  level11, level12, level13, level14, level15,
};
let cfg: any = level01;

type WorkerState = 'idle' | 'toTree' | 'chopping' | 'toFire';

interface TreeNode { sprite: Phaser.GameObjects.Image; onCooldown: boolean; }

interface Survivor {
  sprite: Phaser.GameObjects.Sprite;
  state: 'frozen' | 'following' | 'thawing' | 'worker';
  thawProgress: number;
  thawBar?: Phaser.GameObjects.Graphics;
  iceGfx?: Phaser.GameObjects.Graphics;
  frostEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  workerState?: WorkerState;
  workerTarget?: TreeNode;
  workerCarrying: number;
  bobOffset: number;
  lx: number; ly: number;
  waddlePhase: number;
  waddleBobY: number;
  baseScaleX: number;
  baseScaleY: number;
  lastDir: number;
  pendingDir: number;
  pendingDirMs: number;
  activeAnim: string;
  treeIndex: number;
}

interface AnimalEntity {
  sprite: Phaser.GameObjects.Sprite;
  atlasKey: string;
  baseTint: number;
  isBoss: boolean;
  eyeGlow?: Phaser.GameObjects.Image;
  summonedMinions: boolean;
  displaySize: number;
  dir: number;
  hp: number; maxHp: number;
  lx: number; ly: number;
  state: 'roam' | 'circle' | 'windup' | 'lunge' | 'backoff' | 'flee' | 'dead';
  bobPhase: number;
  roamCenterX: number; roamCenterY: number; roamRadius: number;
  targetLx: number; targetLy: number;
  roamChangeMs: number; hitFlashMs: number;
  deathMs: number; respawnMs: number;
  spawnLx: number; spawnLy: number;
  biteMs: number;
  fleeMs: number;
  circleAngle: number;
  circleDir: number;
  stateTimer: number;
  lungeTargetX: number; lungeTargetY: number;
  spec: {
    hp: number; speed: number; aggroSpeed: number;
    aggroRange: number; circleDistancePx: number;
    attackRange: number; attackIntervalMs: number;
    biteIntervalMs: number; biteDamage: number; knockbackPx: number;
    meatDrop: number; meatPerHit: number;
    respawnDelaySec: number; fleeBelowHpPct: number; fleeTimeSec: number;
    windupMs: number; lungeSpeedPx: number;
    backoffDistPx: number; backoffSpeedPx: number;
    displayScale?: number; furTint?: number;
    summonAtHpPct?: number; summonCount?: number;
  };
}
interface MeatDrop {
  sprite: Phaser.GameObjects.Image;
  lx: number; ly: number;
  bobPhase: number;
}

const CHAR_SIZE = 76;         // displaySize for all character sprites
const BOB_AMP   = 1.5;        // px, subtle bob while moving
const BOB_HZ    = 5;          // cycles/sec
const TRAIL_SPACING = 64;     // px between trail followers

export default class GameScene extends Phaser.Scene {
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerLX = 0; private playerLY = 0;
  private lastVelX = 0; private lastVelY = 0;
  private playerWaddlePhase = 0;
  private playerBobY = 0;
  private playerBaseScaleX = 0;
  private playerBaseScaleY = 0;
  private playerLastDir = 0;
  private pendingDir = -1;
  private pendingDirMs = 0;

  private trees: TreeNode[] = [];
  private fireSprite!: Phaser.GameObjects.Image;
  private fireX = 0; private fireY = 0;
  private survivors: Survivor[] = [];
  private nextWorkerTreeIndex = 0;

  private padGfx!: Phaser.GameObjects.Graphics;
  private padLabel!: Phaser.GameObjects.Text;
  private padX = 0; private padY = 0;
  private tentSprite: Phaser.GameObjects.Image | null = null;

  private coins = 0; private fuel = 0;
  private freezeMeter = 0; private rescuedCount = 0;
  private tentBuilt = false; private gameOver = false;
  private coinsPaidForTent = 0; private carriedLogs = 0;

  private logIcons: Phaser.GameObjects.Image[] = [];
  private dropZoneGfx!: Phaser.GameObjects.Graphics;

  private joyActive = false;
  private joyOX = 0; private joyOY = 0;
  private joyCX = 0; private joyCY = 0;

  private snowDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hintArrowGfx!: Phaser.GameObjects.Graphics;

  private hintTimer = 0;

  private shadowGfx!: Phaser.GameObjects.Graphics;
  private decorSprites: Phaser.GameObjects.Image[] = [];

  private fireSoundRef?: Phaser.Sound.BaseSound;
  private windSoundRef?: Phaser.Sound.BaseSound;
  private footprintEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private padSignGfx!: Phaser.GameObjects.Graphics;
  private lastFootprintTime = 0;
  private fireGlowImg!: Phaser.GameObjects.Image;

  private depthGroup: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> = [];
  private obstacles: Array<{ x: number; y: number; r: number }> = [];

  private animals: AnimalEntity[] = [];
  private meatDrops: MeatDrop[] = [];
  private carriedMeat = 0;
  private cookQueue = 0;
  private cookTimer = 0;
  private meatIcons: Phaser.GameObjects.Image[] = [];
  private playerAttackMs = 0;
  private playerHp = 0;
  private playerHpMax = 0;
  private playerDead = false;
  private playerDeadMs = 0;
  private playerFlashMs = 0;
  private playerKnockVX = 0;
  private playerKnockVY = 0;
  private playerHpBarGfx!: Phaser.GameObjects.Graphics;
  private animalsKilled = 0;
  private goalStages: Array<{type:string; target:number|string; hintText:string; completedText?:string}> = [];
  private currentStageIdx = 0;
  private stageBannerMs = 0;
  private stageBannerText = '';

  // dev-only debug overlay
  private debugDirText!: Phaser.GameObjects.Text;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };


  constructor() { super({ key: 'GameScene' }); }

  private currentLevelNum = 1;

  init(data?: { levelKey?: string; levelNum?: number }): void {
    cfg = LEVEL_CONFIGS[(data?.levelKey) ?? 'level01'] ?? level01;
    this.currentLevelNum = data?.levelNum ?? 1;
  }

  // ── create ────────────────────────────────────────────────────────────────

  create(): void {
    this.trees = []; this.survivors = []; this.logIcons = [];
    this.depthGroup = []; this.decorSprites = []; this.tentSprite = null; this.obstacles = [];
    this.nextWorkerTreeIndex = 1; // tree 0 is above fire and blocked; workers start at tree 1

    const ox = cfg.originX; const oy = cfg.originY;

    // ── Procedural textures ───────────────────────────────────────────────
    const makeTex = (key: string, r: number, g: number, b: number, a: number, size: number) => {
      if (this.textures.exists(key)) return;
      const gfx = this.make.graphics({ add: false } as any);
      const half = size / 2;
      gfx.fillStyle(Phaser.Display.Color.GetColor(r, g, b), a).fillCircle(half, half, half - 0.5);
      gfx.generateTexture(key, size, size); gfx.destroy();
    };
    makeTex('snowpuff',  255, 255, 255, 1.0,  9);
    makeTex('frostpuff', 153, 220, 255, 0.85, 9);
    makeTex('smokepuff', 170, 170, 170, 0.6,  28);
    makeTex('steampuff', 221, 238, 255, 0.65, 20);
    makeTex('woodchip',  160, 100,  40, 1.0,  7);

    // Footprint texture: two paired boot sole ovals (Fix 3)
    if (!this.textures.exists('footstep')) {
      const fpCanvas = document.createElement('canvas');
      fpCanvas.width = 20; fpCanvas.height = 14;
      const fpCtx = fpCanvas.getContext('2d')!;
      fpCtx.fillStyle = 'rgba(90, 70, 50, 0.85)';
      // Left boot sole — slightly tilted
      fpCtx.save();
      fpCtx.translate(6, 7);
      fpCtx.rotate(-0.25);
      fpCtx.beginPath();
      fpCtx.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
      fpCtx.fill();
      fpCtx.restore();
      // Right boot sole — tilted opposite
      fpCtx.save();
      fpCtx.translate(14, 7);
      fpCtx.rotate(0.25);
      fpCtx.beginPath();
      fpCtx.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
      fpCtx.fill();
      fpCtx.restore();
      this.textures.addCanvas('footstep', fpCanvas as HTMLCanvasElement);
    }

    // Slash mark VFX texture — 3 diagonal lines
    if (!this.textures.exists('slashmark')) {
      const sc = document.createElement('canvas');
      sc.width = 32; sc.height = 32;
      const sCtx = sc.getContext('2d')!;
      sCtx.strokeStyle = '#ff4444'; sCtx.lineWidth = 2.5; sCtx.lineCap = 'round';
      sCtx.globalAlpha = 0.9;
      [[4,6,18,22],[9,4,23,20],[14,4,26,18]].forEach(([x1,y1,x2,y2]) => {
        sCtx.beginPath(); sCtx.moveTo(x1,y1); sCtx.lineTo(x2,y2); sCtx.stroke();
      });
      this.textures.addCanvas('slashmark', sc as HTMLCanvasElement);
    }

    // ── Ground ────────────────────────────────────────────────────────────
    // Snow outside
    this.add.graphics().fillStyle(0xd8eaf8, 1).fillRect(-800, -800, 4000, 4000).setDepth(-10);
    // Snow texture variation — tiny stipple dots only, no big blobs
    const snowGfx = this.add.graphics().setDepth(-9);
    for (let i = 0; i < 400; i++) {
      const t = (i * 1.618) % 1; const u = (i * 2.718) % 1;
      const sx = -600 + t * 2400; const sy = -600 + u * 2400;
      snowGfx.fillStyle(0xbbd8f0, 0.06 + (i % 4) * 0.03).fillCircle(sx, sy, 1 + (i % 3) * 0.5);
    }
    // Snow sparkles
    const sparkGfx = this.add.graphics().setDepth(-8);
    for (let i = 0; i < 120; i++) {
      const t = (i * 2.414) % 1; const u = (i * 3.141) % 1;
      const sx = -500 + t * 2000; const sy = -500 + u * 2000;
      // skip inside camp
      const isoPos = screenToIso(sx, sy, ox, oy);
      if (isoPos.ix >= 3 && isoPos.ix <= 13 && isoPos.iy >= 3 && isoPos.iy <= 12) continue;
      sparkGfx.fillStyle(0xffffff, 0.3 + (i % 5) * 0.12).fillCircle(sx, sy, 1.5 + (i % 3) * 0.5);
    }
    // Camp floor (dirt)
    const campPoly = [
      isoToScreen(3,  3,  ox, oy), isoToScreen(13, 3,  ox, oy),
      isoToScreen(13, 12, ox, oy), isoToScreen(3,  12, ox, oy),
    ];
    this.add.graphics().fillStyle(0x9a7848, 1).fillPoints(campPoly as any, true).setDepth(-5);
    // Dirt texture dots
    const dotGfx = this.add.graphics().setDepth(-4);
    for (let i = 0; i < 80; i++) {
      const t = (i * 1.618) % 1; const u = (i * 2.718) % 1;
      const p = isoToScreen(3.5 + t * 9, 3.5 + u * 8, ox, oy);
      const shade = i % 3 === 0 ? 0x7a5830 : i % 3 === 1 ? 0x8a7040 : 0xb09060;
      dotGfx.fillStyle(shade, 0.28 + (i % 4) * 0.07).fillCircle(p.x, p.y, 2 + (i % 4));
    }
    // Feathered dirt→snow blend at walls (pebbles near edge)
    const blendGfx = this.add.graphics().setDepth(-3);
    for (let i = 0; i < 40; i++) {
      const t = (i * 1.414) % 1;
      const wallPt = isoToScreen(3 + t * 10, 3, ox, oy); // north wall
      blendGfx.fillStyle(0xd8eaf8, 0.18 + (i % 3) * 0.1).fillCircle(wallPt.x, wallPt.y + 4, 5 + (i % 4) * 2);
    }

    // ── South path — soft feathered packed snow, no hard edges ──────────
    // Build via many overlapping low-alpha circles so edges feather naturally.
    // S-curve sway uses golden-ratio jitter to break strict diagonal regularity.
    {
      const pathGfx = this.add.graphics().setDepth(-7);
      const bootGfx = this.add.graphics().setDepth(-6.5);
      const sledGfx = this.add.graphics().setDepth(-6.8);
      const STEPS = 32;
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const tiy = 12 + t * 14;
        const jitter = (i * 1.618) % 1; // deterministic, non-repeating
        const sway = Math.sin(t * Math.PI * 2.1) * 0.26 + (jitter - 0.5) * 0.08;
        const cp = isoToScreen(8.5 + sway, tiy, ox, oy);
        // Three concentric passes accumulate to ~20% opacity at centre, fading to 0 at edges
        pathGfx.fillStyle(0xbcd4e9, 0.016).fillCircle(cp.x, cp.y, 82);
        pathGfx.fillStyle(0xbbd3e8, 0.022).fillCircle(cp.x, cp.y, 56);
        pathGfx.fillStyle(0xbad2e7, 0.030).fillCircle(cp.x, cp.y, 38);
      }
      // Boot prints — staggered left/right ovals
      for (let i = 2; i < STEPS - 1; i += 3) {
        const t = i / STEPS;
        const tiy = 12 + t * 14;
        const jitter = (i * 1.618) % 1;
        const sway = Math.sin(t * Math.PI * 2.1) * 0.26 + (jitter - 0.5) * 0.08;
        const cp = isoToScreen(8.5 + sway, tiy, ox, oy);
        bootGfx.fillStyle(0xa8c4dc, 0.13);
        bootGfx.fillEllipse(cp.x - 7, cp.y - 3, 9, 15);
        bootGfx.fillEllipse(cp.x + 7, cp.y + 2, 9, 15);
      }
      // Sled tracks — two thin lines following the same curve
      sledGfx.lineStyle(1.5, 0xa8c2da, 0.17);
      for (let pass = 0; pass < 2; pass++) {
        const side = pass === 0 ? -0.36 : 0.36;
        sledGfx.beginPath();
        for (let i = 0; i <= STEPS; i++) {
          const t = i / STEPS;
          const tiy = 12 + t * 14;
          const jitter = (i * 1.618) % 1;
          const sway = Math.sin(t * Math.PI * 2.1) * 0.26 + (jitter - 0.5) * 0.08;
          const cp = isoToScreen(8.5 + sway + side, tiy, ox, oy);
          if (i === 0) sledGfx.moveTo(cp.x, cp.y); else sledGfx.lineTo(cp.x, cp.y);
        }
        sledGfx.strokePath();
      }
    }

    // ── Walls ─────────────────────────────────────────────────────────────
    for (const coord of cfg.walls) {
      const [wx, wy] = coord as [number, number];
      const pos = isoToScreen(wx, wy, ox, oy);
      const flipX = wy !== 3 && wy !== 12 && (wx === 3 || wx === 13);
      const ws = this.add.image(pos.x, pos.y, 'building_perimeter_wall_wooden')
        .setDisplaySize(82, 82).setOrigin(0.5, 0.85).setFlipX(flipX);
      // Walls are static — set depth once instead of pushing to depthGroup
      let wallDepth: number;
      if (wy === 3) {
        // North wall: sort by iy only so they never occlude characters inside
        wallDepth = cfg.originY + wy * cfg.tileH;
      } else if (wx === 13) {
        // East wall: sort by iy only
        wallDepth = cfg.originY + wy * cfg.tileH;
      } else {
        // West and south walls: use screen y (pos.y)
        wallDepth = pos.y;
      }
      ws.setDepth(wallDepth);
    }
    for (const [gx, gy] of cfg.gate) {
      const pos = isoToScreen(gx, gy, ox, oy);
      const pg = this.add.graphics().setDepth(pos.y);
      pg.fillStyle(0x6b3a1f, 1).fillRect(pos.x - 4, pos.y - 32, 8, 32);
      pg.lineStyle(1, 0x3d1f08, 1).strokeRect(pos.x - 4, pos.y - 32, 8, 32);
    }

    // ── Trees — inside camp scaled to 70px so they don't block fire/pad/gate (Fix 6)
    for (const td of cfg.trees) {
      const [tx, ty] = td.iso as [number, number];
      const pos = isoToScreen(tx, ty, ox, oy);
      const sp = this.add.image(pos.x, pos.y, 'prop_snow_pine_tree_01')
        .setDisplaySize(70, 70).setOrigin(0.5, 0.85);
      this.depthGroup.push(sp);
      this.trees.push({ sprite: sp, onCooldown: false });
      this.obstacles.push({ x: pos.x, y: pos.y, r: 20 });
    }

    // ── Decor ─────────────────────────────────────────────────────────────
    const DECOR_SIZES: Record<string, number> = {
      'prop_snow_pine_tree_01': 110, 'prop_frozen_tree_dead_01': 90,
      'tile_snow_drift_mound_01': 70, 'prop_barrel_01': 55,
      'prop_igloo_01': 100, 'building_storage_crate_stacks': 80,
      'resource_wood_logs_01': 50, 'prop_bench_01': 70,
      'prop_rock_cluster_01': 90, 'prop_snow_bush_01': 75, 'prop_cliff_edge_01': 100,
      'prop_lantern_post_01': 65,
    };
    if ((cfg as any).decor) {
      for (const d of (cfg as any).decor as Array<{ key: string; iso: [number, number] }>) {
        const [dx, dy] = d.iso;
        const dp = isoToScreen(dx, dy, ox, oy);
        const sz = DECOR_SIZES[d.key] ?? 90;
        const ds = this.add.image(dp.x, dp.y, d.key)
          .setDisplaySize(sz, sz).setOrigin(0.5, 0.85);
        this.depthGroup.push(ds);
        this.decorSprites.push(ds);
      }
    }

    // ── Procedural world fill — seeded scatter, min 72px spacing ─────────
    {
      let seed = 7919;
      const rng = (): number => {
        seed = (seed * 1664525 + 1013904223) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const FILL = [
        'prop_snow_pine_tree_01', 'prop_snow_pine_tree_01', 'prop_snow_pine_tree_01',
        'prop_frozen_tree_dead_01', 'prop_frozen_tree_dead_01',
        'prop_rock_cluster_01', 'prop_rock_cluster_01',
        'prop_snow_bush_01',
        'tile_snow_drift_mound_01',
      ];
      const taken: Array<{ x: number; y: number }> = this.decorSprites.map(d => ({ x: d.x, y: d.y }));
      const MIN2 = 72 * 72;
      for (let gix = -6; gix <= 20; gix += 2.5) {
        for (let giy = -5; giy <= 26; giy += 2.5) {
          const jix = gix + (rng() - 0.5) * 1.4;
          const jiy = giy + (rng() - 0.5) * 1.4;
          if (jix >= 2.4 && jix <= 13.6 && jiy >= 2.4 && jiy <= 12.6) continue;
          if (jix >= 7.3 && jix <= 9.7 && jiy >= 11.5) continue;
          if (rng() > 0.38) continue;
          const pos = isoToScreen(jix, jiy, ox, oy);
          let ok = true;
          for (const t of taken) {
            const dx = pos.x - t.x; const dy = pos.y - t.y;
            if (dx * dx + dy * dy < MIN2) { ok = false; break; }
          }
          if (!ok) continue;
          const key = FILL[Math.floor(rng() * FILL.length)];
          const sz = DECOR_SIZES[key] ?? 90;
          this.add.image(pos.x, pos.y, key).setDisplaySize(sz, sz).setOrigin(0.5, 0.85)
            .setDepth(pos.y);
          taken.push({ x: pos.x, y: pos.y });
        }
      }
    }

    // ── Fire & smoke ──────────────────────────────────────────────────────
    const fi = cfg.fire.iso as [number, number];
    const fp = isoToScreen(fi[0], fi[1], ox, oy);
    this.fireX = fp.x; this.fireY = fp.y;

    // Fire glow — soft radial gradient texture (Fix 4)
    if (!this.textures.exists('fire_glow')) {
      const glowSize = 160;
      const gc = document.createElement('canvas');
      gc.width = gc.height = glowSize;
      const gCtx = gc.getContext('2d')!;
      const grad = gCtx.createRadialGradient(glowSize / 2, glowSize / 2, 0, glowSize / 2, glowSize / 2, glowSize / 2);
      grad.addColorStop(0,   'rgba(255, 140, 20, 0.55)');
      grad.addColorStop(0.3, 'rgba(255, 80,  0, 0.30)');
      grad.addColorStop(0.7, 'rgba(255, 40,  0, 0.10)');
      grad.addColorStop(1,   'rgba(255, 0,   0, 0)');
      gCtx.fillStyle = grad;
      gCtx.fillRect(0, 0, glowSize, glowSize);
      this.textures.addCanvas('fire_glow', gc as HTMLCanvasElement);
    }
    this.fireGlowImg = this.add.image(this.fireX, this.fireY, 'fire_glow')
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(5)
      .setOrigin(0.5, 0.5);

    this.fireSprite = this.add.image(this.fireX, this.fireY, 'building_cauldron_firepit_01')
      .setDisplaySize(115, 115).setOrigin(0.5, 0.85);
    this.depthGroup.push(this.fireSprite);
    this.obstacles.push({ x: this.fireX, y: this.fireY, r: 48 });

    this.add.particles(this.fireX, this.fireY - 42, 'smokepuff', {
      speed: { min: 12, max: 26 }, angle: { min: 258, max: 282 },
      scale: { start: 0.22, end: 1.6 }, alpha: { start: 0.48, end: 0 },
      lifespan: 3000, frequency: 480, gravityY: -14,
    }).setDepth(this.fireY + 8);
    this.add.particles(this.fireX, this.fireY - 28, 'steampuff', {
      speed: { min: 20, max: 40 }, angle: { min: 250, max: 290 },
      scale: { start: 0.15, end: 0.65 }, alpha: { start: 0.55, end: 0 },
      lifespan: 1200, frequency: 190, gravityY: -18,
    }).setDepth(this.fireY + 9);

    this.dropZoneGfx = this.add.graphics().setDepth(2).setAlpha(0);
    this.dropZoneGfx.lineStyle(1.5, 0xffffff, 0.35);
    this.dropZoneGfx.strokeCircle(this.fireX, this.fireY, cfg.player.dropRangePx * 0.88);

    // ── Build pad ─────────────────────────────────────────────────────────
    const pad = cfg.buildPads[0];
    const pi2 = pad.iso as [number, number];
    const pp = isoToScreen(pi2[0], pi2[1], ox, oy);
    this.padX = pp.x; this.padY = pp.y;

    this.padGfx = this.add.graphics().setDepth(6);
    this.drawPadOutline();
    this.tweens.add({ targets: this.padGfx, alpha: { from: 0.28, to: 0.75 }, yoyo: true, repeat: -1, duration: 1100 });

    // Sign — positioned between fire (y≈469) and pad (y≈548) to avoid both
    this.padSignGfx = this.add.graphics().setDepth(10);
    const sx = this.padX, sy = this.padY - 42;
    // Sign plank: 164px wide
    this.padSignGfx.fillStyle(0x6B4226, 1).fillRoundedRect(sx - 82, sy - 44, 164, 44, 6);
    this.padSignGfx.fillStyle(0x8B5E3C, 1).fillRoundedRect(sx - 80, sy - 42, 160, 40, 5);
    this.padSignGfx.lineStyle(2, 0x4A2F1A, 1).strokeRoundedRect(sx - 82, sy - 44, 164, 44, 6);
    this.padSignGfx.lineStyle(1, 0x7A5035, 0.4).lineBetween(sx - 72, sy - 34, sx + 72, sy - 34);
    this.padSignGfx.lineStyle(1, 0x7A5035, 0.4).lineBetween(sx - 72, sy - 22, sx + 72, sy - 22);
    // Short post pointing down to pad
    this.padSignGfx.fillStyle(0x6B4226, 1).fillRect(sx - 3, sy, 6, 42);
    this.padLabel = this.add.text(sx - 10, sy - 22,
      `Build Tent  ${pad.costCoins}`, {
        fontFamily: "'Fredoka One', cursive",
        fontSize: '14px', color: '#ffe0b0', align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(11);
    // Coin icon next to price (avoids emoji rendering issues)
    this.add.image(sx + this.padLabel.width / 2 - 2, sy - 22, 'resource_coin_gold_01')
      .setDisplaySize(14, 14).setDepth(11).setOrigin(0, 0.5);

    // ── Player ────────────────────────────────────────────────────────────
    const si = cfg.player.startIso as [number, number];
    const sp2 = isoToScreen(si[0], si[1], ox, oy);
    this.playerLX = sp2.x; this.playerLY = sp2.y;
    this.playerSprite = this.add.sprite(sp2.x, sp2.y, 'hero', 'hero_walk_d0_f0')
      .setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0);
    this.depthGroup.push(this.playerSprite);
    this.playerHpBarGfx = this.add.graphics().setDepth(1005);
    this.playerBaseScaleX = this.playerSprite.scaleX;
    this.playerBaseScaleY = this.playerSprite.scaleY;

    this.snowDust = this.add.particles(0, 0, 'snowpuff', {
      speed: { min: 18, max: 38 }, angle: { min: 100, max: 260 },
      scale: { start: 0.6, end: 0.08 }, alpha: { start: 0.45, end: 0 },
      lifespan: 280,
    }).setDepth(4);

    // Drop shadows (drawn below characters each frame)
    this.shadowGfx = this.add.graphics().setDepth(2);

    // Footprint emitter — small paired boot prints (Fix 3)
    this.footprintEmitter = this.add.particles(0, 0, 'footstep', {
      lifespan: 2500, speed: 0,
      alpha: { start: 0.25, end: 0 },
      scale: { start: 0.65, end: 0.65 },
      emitting: false,
    }).setDepth(-1);

    // ── Frozen survivors ──────────────────────────────────────────────────
    // Ice block dimensions proportional to CHAR_SIZE
    const IW = 60; const IH = 76; const IXO = 30; const IYO = 76;

    for (const svd of cfg.frozenSurvivors) {
      const svIso = svd.iso as [number, number];
      const svPos = isoToScreen(svIso[0], svIso[1], ox, oy);

      // Ice block
      const iceGfx = this.add.graphics().setDepth(svPos.y - 1);
      iceGfx.fillStyle(0x99ddff, 0.42).lineStyle(2, 0xbbedff, 0.85);
      iceGfx.fillRoundedRect(svPos.x - IXO, svPos.y - IYO, IW, IH, 8);
      iceGfx.strokeRoundedRect(svPos.x - IXO, svPos.y - IYO, IW, IH, 8);
      // Inner frost shimmer
      iceGfx.lineStyle(1, 0xeef8ff, 0.3);
      iceGfx.strokeRoundedRect(svPos.x - IXO + 4, svPos.y - IYO + 4, IW - 8, IH - 8, 5);

      // Frost particles drifting up from the ice block
      const frostEmitter = this.add.particles(svPos.x, svPos.y - IYO / 2, 'frostpuff', {
        speed: { min: 6, max: 18 },
        angle: { min: 195, max: 345 },
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 1600,
        frequency: 200,
        gravityY: -12,
      }).setDepth(svPos.y + 4);

      const sp3 = this.add.sprite(svPos.x, svPos.y, 'worker', 'worker_walk_d4_f0')
        .setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0).setTint(0x88ccff);
      this.depthGroup.push(sp3);

      this.survivors.push({
        sprite: sp3, state: 'frozen', thawProgress: 0,
        thawBar: this.add.graphics(), iceGfx, frostEmitter,
        workerCarrying: 0, bobOffset: Math.random() * Math.PI * 2,
        lx: svPos.x, ly: svPos.y,
        waddlePhase: Math.random() * Math.PI * 2,
        waddleBobY: 0,
        baseScaleX: sp3.scaleX, baseScaleY: sp3.scaleY,
        lastDir: 4, pendingDir: -1, pendingDirMs: 0,
        activeAnim: 'walk',
        treeIndex: 0,
      });
    }

    // ── Log icons (stacked on player back) ────────────────────────────────
    for (let i = 0; i < 4; i++) {
      this.logIcons.push(
        this.add.image(0, 0, 'resource_wood_logs_01')
          .setDisplaySize(42, 42).setVisible(false).setDepth(1001)
      );
    }

    // Meat carry icons
    this.meatIcons = [];
    for (let i = 0; i < 4; i++) {
      this.meatIcons.push(
        this.add.image(0, 0, 'resource_meat_icon_red')
          .setDisplaySize(36, 36).setVisible(false).setDepth(1001)
      );
    }

    // Animal spawns from level config
    this.animals = []; this.meatDrops = [];
    this.animalsKilled = 0;
    if ((cfg as any).animals) {
      for (const ad of (cfg as any).animals as any[]) {
        const defaultSpec = { hp:3, speed:60, aggroSpeed:95, aggroRange:110, circleDistancePx:125, attackRange:88, attackIntervalMs:1300, biteIntervalMs:1200, biteDamage:1, knockbackPx:140, meatDrop:2, meatPerHit:1, respawnDelaySec:60, fleeBelowHpPct:0.4, fleeTimeSec:4, windupMs:380, lungeSpeedPx:340, backoffDistPx:155, backoffSpeedPx:210 };
        const spec = { ...defaultSpec, ...((cfg as any).animalConfig ?? {})[ad.type] };
        const pos = isoToScreen(ad.iso[0], ad.iso[1], ox, oy);
        const rcIso = ad.roamCenter as [number,number];
        const rcPos = isoToScreen(rcIso[0], rcIso[1], ox, oy);
        const radiusPx = (ad.roamRadius ?? 3) * cfg.tileW * 0.75;
        const charType = (ad.type as string) ?? 'wolf';
        const atlasKey = charType === 'alphawolf' ? 'wolf' : charType;
        const isBoss = charType === 'alphawolf';
        const hasAtlas = this.textures.exists(atlasKey);
        const displayScale = spec.displayScale ?? 1;
        const displaySize = Math.round(80 * displayScale);
        const sp = hasAtlas
          ? this.add.sprite(pos.x, pos.y, atlasKey, `${atlasKey}_walk_d0_f0`).setDisplaySize(displaySize, displaySize).setOrigin(0.5, 1.0)
          : this.add.sprite(pos.x, pos.y, 'enemy_grey_wolf_01').setDisplaySize(displaySize > 80 ? displaySize : 70, displaySize > 80 ? displaySize : 70).setOrigin(0.5, 1.0);
        this.depthGroup.push(sp);
        const baseTint = spec.furTint ?? 0xffffff;
        if (baseTint !== 0xffffff) sp.setTint(baseTint);
        let eyeGlow: Phaser.GameObjects.Image | undefined;
        if (isBoss && hasAtlas) {
          if (!this.textures.exists('wolfeyeglow')) this.createEyeGlowTexture();
          eyeGlow = this.add.image(pos.x, pos.y - displaySize * 0.78, 'wolfeyeglow')
            .setDisplaySize(40, 20).setBlendMode(Phaser.BlendModes.ADD).setDepth(pos.y + 2);
        }
        const animal: AnimalEntity = {
          sprite: sp, atlasKey, baseTint, isBoss, eyeGlow, summonedMinions: false, displaySize,
          hp: spec.hp, maxHp: spec.hp,
          lx: pos.x, ly: pos.y, state: 'roam', dir: 0,
          bobPhase: Math.random() * Math.PI * 2,
          roamCenterX: rcPos.x, roamCenterY: rcPos.y, roamRadius: radiusPx,
          targetLx: pos.x, targetLy: pos.y,
          roamChangeMs: 0, hitFlashMs: 0, deathMs: 0, respawnMs: 0,
          spawnLx: pos.x, spawnLy: pos.y, biteMs: 0, fleeMs: 0,
          circleAngle: Math.random() * Math.PI * 2, circleDir: Math.random() > 0.5 ? 1 : -1, stateTimer: 0, lungeTargetX: 0, lungeTargetY: 0,
          spec,
        };
        this.pickRoamTarget(animal);
        this.animals.push(animal);
      }
    }

    // Goal stages from level config
    this.goalStages = (cfg as any).stages ?? [];
    this.currentStageIdx = 0;
    this.stageBannerMs = 0;
    this.stageBannerText = '';

    // ── Misc ──────────────────────────────────────────────────────────────
    this.hintArrowGfx = this.add.graphics().setDepth(1100);

    // ── Camera — zoom=0.7, bounds from actual level content ───────────────
    this.cameras.main.setZoom(0.7);
    {
      const allIso: [number, number][] = [
        ...(cfg.walls as [number, number][]),
        ...cfg.trees.map((t: any) => t.iso as [number, number]),
        ...cfg.frozenSurvivors.map((s: any) => s.iso as [number, number]),
        cfg.fire.iso as [number, number],
        ...cfg.buildPads.map((p: any) => p.iso as [number, number]),
        ...((cfg as any).decor as Array<{ iso: [number, number] }>).map(d => d.iso),
      ];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [ix, iy] of allIso) {
        const p = isoToScreen(ix, iy, ox, oy);
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const PAD = 500;
      this.cameras.main.setBounds(
        minX - PAD, minY - PAD,
        (maxX - minX) + PAD * 2,
        (maxY - minY) + PAD * 2,
      );
    }
    this.cameras.main.startFollow(this.playerSprite, true, 0.08, 0.08);

    // ── Ambient sounds ─────────────────────────────────────────────────────
    if (this.sound.get('snd_fire_loop') === null) {
      this.fireSoundRef = this.sound.add('snd_fire_loop', { loop: true, volume: 0.30 });
      this.fireSoundRef.play();
    }
    if (this.sound.get('snd_wind_loop') === null) {
      this.windSoundRef = this.sound.add('snd_wind_loop', { loop: true, volume: 0.18 });
      this.windSoundRef.play();
    }

    // ── Joystick input (visuals are in UIScene) ───────────────────────────
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.joyActive = true; this.joyOX = this.joyCX = p.x; this.joyOY = this.joyCY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.joyActive && p.isDown) { this.joyCX = p.x; this.joyCY = p.y; }
    });
    this.input.on('pointerup', () => { this.joyActive = false; });

    // ── Debug keyboard + overlay (visible only with ?debug in URL) ────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasdKeys = this.input.keyboard!.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as any;
    const isDebugMode = typeof window !== 'undefined' && window.location.search.includes('debug');
    this.debugDirText = this.add.text(0, 0, '', {
      fontSize: '18px', color: '#ffff00', stroke: '#000', strokeThickness: 4,
    }).setDepth(3000).setOrigin(0.5, 1).setVisible(isDebugMode);

    // ── Launch UIScene (HUD layer) ────────────────────────────────────────
    this.scene.launch('UIScene');

    // Rewarded ad: refill fuel to 60% when UIScene emits the reward
    this.events.on('fuel-refill', () => {
      this.fuel = cfg.fire.fuelMax * 0.6;
      this.freezeMeter = 0;
    });

    // ── State reset ────────────────────────────────────────────────────────
    this.coins = 0; this.fuel = cfg.fire.fuelMax;
    this.freezeMeter = 0; this.rescuedCount = 0;
    this.tentBuilt = false; this.gameOver = false;
    this.coinsPaidForTent = 0; this.carriedLogs = 0;
    this.hintTimer = 0;
    this.lastVelX = 0; this.lastVelY = 0;
    this.playerWaddlePhase = 0; this.playerBobY = 0;
    this.playerLastDir = 0;
    this.carriedMeat = 0; this.cookQueue = 0; this.cookTimer = 0;
    this.playerAttackMs = 0; this.animalsKilled = 0; this.currentStageIdx = 0;
    this.playerHp = cfg.player.maxHp ?? 10;
    this.playerHpMax = cfg.player.maxHp ?? 10;
    this.playerDead = false; this.playerDeadMs = 0; this.playerFlashMs = 0;
    this.playerKnockVX = 0; this.playerKnockVY = 0;

    // Register animations from texture atlases
    const ANIM_DEFS: Record<string, { frames: number; fps: number }> = {
      walk:       { frames: 12, fps: 12 },
      chop:       { frames: 16, fps: 12 },
      carry_walk: { frames: 12, fps: 12 },
      cheer:      { frames: 12, fps: 12 },
    };
    for (const char of ['hero', 'worker'] as const) {
      for (const [anim, { frames: nFrames, fps }] of Object.entries(ANIM_DEFS)) {
        for (let d = 0; d < 8; d++) {
          const animKey = `${char}_${anim}_d${d}`;
          if (this.anims.exists(animKey)) continue;
          this.anims.create({
            key: animKey,
            frames: Array.from({ length: nFrames }, (_, fi) => ({
              key:   char,
              frame: `${char}_${anim}_d${d}_f${fi}`,
            })),
            frameRate: fps,
            repeat: -1,
          });
        }
      }
    }

    // Animal animations — register for each atlas that is loaded
    const ANIMAL_ANIM_DEF: Record<string, { frames: number; fps: number; loop: boolean }> = {
      walk:   { frames: 12, fps: 12, loop: true  },
      run:    { frames: 10, fps: 14, loop: true  },
      attack: { frames: 12, fps: 14, loop: false },
      hit:    { frames: 8,  fps: 14, loop: false },
      death:  { frames: 14, fps: 10, loop: false },
    };
    for (const char of ['wolf', 'deer']) {
      if (!this.textures.exists(char)) continue;
      for (const [anim, { frames: nf, fps, loop }] of Object.entries(ANIMAL_ANIM_DEF)) {
        for (let d = 0; d < 8; d++) {
          const key = `${char}_${anim}_d${d}`;
          if (this.anims.exists(key)) continue;
          this.anims.create({
            key,
            frames: Array.from({ length: nf }, (_, fi) => ({ key: char, frame: `${char}_${anim}_d${d}_f${fi}` })),
            frameRate: fps,
            repeat: loop ? -1 : 0,
          });
        }
      }
    }
  }

  private drawPadOutline(): void {
    const px = this.padX; const py = this.padY;
    this.padGfx.clear();
    this.padGfx.lineStyle(2.5, 0x66aaff, 1);
    this.padGfx.beginPath();
    this.padGfx.moveTo(px, py - 24); this.padGfx.lineTo(px + 42, py);
    this.padGfx.lineTo(px, py + 24); this.padGfx.lineTo(px - 42, py);
    this.padGfx.closePath(); this.padGfx.strokePath();
    this.padGfx.fillStyle(0x4488ff, 0.07);
    this.padGfx.fillPoints([
      { x: px, y: py - 24 } as any, { x: px + 42, y: py } as any,
      { x: px, y: py + 24 } as any, { x: px - 42, y: py } as any,
    ], true);
  }

  // Maps screen-space velocity to the direction index whose rendered facing
  // angle is nearest to the movement angle.
  // Values measured from Blender cone probes: cone centroid vs origin marker,
  // same camera as render_sprites.py (ELEV=32°, AZIM=45°, to_track_quat("-Z","Y")).
  // Screen convention: right=0°, down=90°.
  private static readonly DIR_SCREEN_ANGLES = [90.0, 28.8, 1.3, 334.1, 270.0, 205.9, 178.7, 151.2];
  private velToDir(velX: number, velY: number): number {
    if (velX * velX + velY * velY < 20 * 20) return -1;
    const angleDeg = (Math.atan2(velY, velX) * 180 / Math.PI + 360) % 360;
    let best = 0, bestDiff = Infinity;
    for (let i = 0; i < 8; i++) {
      const diff = Math.abs(((angleDeg - GameScene.DIR_SCREEN_ANGLES[i] + 540) % 360) - 180);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best;
  }

  private wolfDir(dx: number, dy: number): number {
    if (dx * dx + dy * dy < 4) return -1;
    return this.velToDir(dx, dy);
  }

  // Shared hysteresis: hold a new direction for 100ms before committing.
  private stepDir(
    lastDir: number, pendingDir: number, pendingMs: number,
    rawDir: number, delta: number,
  ): { lastDir: number; pendingDir: number; pendingMs: number } {
    if (rawDir < 0 || rawDir === lastDir) {
      return { lastDir, pendingDir: -1, pendingMs: 0 };
    }
    if (rawDir !== pendingDir) {
      return { lastDir, pendingDir: rawDir, pendingMs: 0 };
    }
    const ms2 = pendingMs + delta;
    if (ms2 >= 100) {
      return { lastDir: pendingDir, pendingDir: -1, pendingMs: 0 };
    }
    return { lastDir, pendingDir, pendingMs: ms2 };
  }

  private playCharAnim(sprite: Phaser.GameObjects.Sprite, char: string, anim: string, dir: number): void {
    const key = `${char}_${anim}_d${dir}`;
    if (this.anims.exists(key) && sprite.anims.getName() !== key) sprite.play(key, true);
  }

  private showStaticWalk(sprite: Phaser.GameObjects.Sprite, char: string, dir: number): void {
    if (sprite.anims.isPlaying) sprite.anims.stop();
    sprite.setFrame(`${char}_walk_d${dir}_f0`);
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(time: number, delta: number): void {
    if (this.gameOver) return;
    const dt = delta / 1000;

    // Player respawn countdown while dead
    if (this.playerDead) {
      this.playerDeadMs = Math.max(0, this.playerDeadMs - delta);
      if (this.playerDeadMs <= 0) {
        this.playerDead = false;
        this.playerHp = this.playerHpMax;
        this.playerLX = this.fireX + 40; this.playerLY = this.fireY + 20;
        this.playerSprite.setAngle(0).setAlpha(1).clearTint();
        this.cameras.main.shake(120, 0.005);
      }
    }

    // Joystick velocity
    let velX = 0; let velY = 0;

    // Player hit flash
    if (this.playerFlashMs > 0) {
      this.playerFlashMs = Math.max(0, this.playerFlashMs - delta);
      this.playerSprite.setTint(this.playerFlashMs > 0 ? 0xff2222 : 0xffffff);
      if (this.playerFlashMs <= 0) this.playerSprite.clearTint();
    }
    // Knockback velocity
    if (this.playerKnockVX !== 0 || this.playerKnockVY !== 0) {
      const decay = Math.min(1, delta / 100);
      this.playerKnockVX *= (1 - decay); this.playerKnockVY *= (1 - decay);
      if (Math.abs(this.playerKnockVX) < 3) this.playerKnockVX = 0;
      if (Math.abs(this.playerKnockVY) < 3) this.playerKnockVY = 0;
      velX += this.playerKnockVX; velY += this.playerKnockVY;
    }

    if (!this.playerDead) {
    if (this.joyActive) {
      const dx = this.joyCX - this.joyOX; const dy = this.joyCY - this.joyOY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 12) { const inv = cfg.player.speedPx / len; velX = dx * inv; velY = dy * inv; }
    }
    // Debug keyboard override (arrow keys / WASD)
    {
      const kL = this.cursors.left.isDown  || this.wasdKeys.left.isDown;
      const kR = this.cursors.right.isDown || this.wasdKeys.right.isDown;
      const kU = this.cursors.up.isDown    || this.wasdKeys.up.isDown;
      const kD = this.cursors.down.isDown  || this.wasdKeys.down.isDown;
      const kx = (kR ? 1 : 0) - (kL ? 1 : 0);
      const ky = (kD ? 1 : 0) - (kU ? 1 : 0);
      if (kx !== 0 || ky !== 0) {
        const klen = Math.sqrt(kx * kx + ky * ky);
        velX = (kx / klen) * cfg.player.speedPx;
        velY = (ky / klen) * cfg.player.speedPx;
      }
    }
    } // end !this.playerDead
    const isMoving = velX !== 0 || velY !== 0;
    if (isMoving) { this.lastVelX = velX; this.lastVelY = velY; }

    // Project velocity away from walls before applying movement
    const projPV = this.projectVelocityFromWalls(velX, velY, this.playerLX, this.playerLY);
    velX = projPV.vx; velY = projPV.vy;

    // Player movement + constraints
    const prevLX = this.playerLX; const prevLY = this.playerLY;
    this.playerLX += velX * dt;
    this.playerLY += velY * dt;
    const po = this.constrainToObstacles(this.playerLX, this.playerLY);
    const ps = this.applySeparation(po.x, po.y, null);
    const pc = this.wallConstrain(prevLX, prevLY, ps.x, ps.y);
    this.playerLX = pc.x; this.playerLY = pc.y;

    // Player bob (subtle, only while moving)
    if (isMoving) this.playerWaddlePhase += dt * BOB_HZ * Math.PI * 2;
    this.playerBobY = isMoving ? Math.sin(this.playerWaddlePhase) * BOB_AMP : 0;

    // Apply player animation + position
    // Only use joystick velocity for facing — separation/constraint forces are excluded.
    const pvx = isMoving ? velX : this.lastVelX;
    const pvy = isMoving ? velY : this.lastVelY;
    const rawDir = this.velToDir(pvx, pvy);
    const pds = this.stepDir(this.playerLastDir, this.pendingDir, this.pendingDirMs, rawDir, delta);
    this.playerLastDir = pds.lastDir; this.pendingDir = pds.pendingDir; this.pendingDirMs = pds.pendingMs;
    if (isMoving) {
      this.playCharAnim(this.playerSprite, 'hero', 'walk', this.playerLastDir);
    } else {
      this.showStaticWalk(this.playerSprite, 'hero', this.playerLastDir);
    }
    this.playerSprite.x = this.playerLX;
    this.playerSprite.y = this.playerLY + this.playerBobY;

    // Debug overlay: direction index + movement arrow (only in ?debug mode)
    if (this.debugDirText.visible) {
      const DBG_ARROWS = ['→↓','↓','←↓','←','←↑','↑','→↑','→'];
      const moveArrow = isMoving ? ` ${DBG_ARROWS[this.playerLastDir] ?? ''}` : ' idle';
      this.debugDirText.setText(`d${this.playerLastDir}${moveArrow}`);
      this.debugDirText.setPosition(this.playerLX, this.playerLY - 90);
    }

    // Snow dust + footprints on step (Fix 3: throttle footprints to ~350ms)
    if (isMoving && Math.abs(Math.sin(this.playerWaddlePhase)) < 0.08) {
      const normLen = Math.sqrt(velX * velX + velY * velY);
      if (normLen > 0) {
        this.snowDust.emitParticleAt(
          this.playerLX - (velX / normLen) * 10,
          this.playerLY - (velY / normLen) * 6, 2,
        );
      }
      if (time - this.lastFootprintTime > 350) {
        const walkAngleDeg = Math.atan2(velY, velX) * 180 / Math.PI;
        this.footprintEmitter.emitParticleAt(this.playerLX, this.playerLY, 1);
        (this.footprintEmitter as any).setParticleRotation?.(walkAngleDeg);
        this.lastFootprintTime = time;
      }
    }

    // Log icons stacked on player's back, synced with bob
    const backOffX = (this.playerLastDir >= 2 && this.playerLastDir <= 4) ? 6 : -6;
    for (let i = 0; i < 4; i++) {
      this.logIcons[i].setVisible(i < this.carriedLogs);
      if (i < this.carriedLogs) {
        this.logIcons[i].setPosition(
          this.playerLX + backOffX,
          this.playerLY + this.playerBobY - 58 - i * 14,
        );
        this.logIcons[i].setDepth(this.playerSprite.depth - 1 + i);
      }
    }

    this.dropZoneGfx.setAlpha(this.carriedLogs > 0 || this.carriedMeat > 0 ? 1 : 0);

    // Tree collection
    for (const tree of this.trees) {
      const dx = this.playerLX - tree.sprite.x; const dy = this.playerLY - tree.sprite.y;
      if (dx*dx + dy*dy < cfg.player.collectRangePx ** 2 && !tree.onCooldown && this.carriedLogs < cfg.player.carryCapacity) {
        this.carriedLogs++;
        tree.onCooldown = true;
        this.time.delayedCall(cfg.treeLogCooldownMs, () => { tree.onCooldown = false; });
        this.tweens.add({
          targets: this.playerSprite,
          scaleX: { from: this.playerBaseScaleX * 1.2, to: this.playerBaseScaleX },
          scaleY: { from: this.playerBaseScaleY * 1.2, to: this.playerBaseScaleY },
          duration: 180, ease: 'Back.Out',
        });
        const fi = this.add.image(tree.sprite.x, tree.sprite.y - 20, 'resource_wood_logs_01')
          .setDisplaySize(28, 28).setAlpha(0).setDepth(2000);
        this.tweens.add({ targets: fi, y: tree.sprite.y - 72, alpha: { from: 1, to: 0 }, duration: 900, onComplete: () => fi.destroy() });
      }
    }

    // Fire drop
    const fdx = this.playerLX - this.fireX; const fdy = this.playerLY - this.fireY;
    if (this.carriedLogs > 0 && fdx*fdx + fdy*fdy < cfg.player.dropRangePx ** 2) {
      const n = this.carriedLogs;
      this.fuel = Math.min(cfg.fire.fuelMax, this.fuel + cfg.fire.fuelPerLog * n);
      this.coins += cfg.fire.coinsPerLog * n;
      this.carriedLogs = 0;
      this.sound.play('snd_log_drop', { volume: 0.65 });
      this.time.delayedCall(250, () => this.sound.play('snd_coin_pickup', { volume: 0.55 }));
      this.spawnCoinFly(n);
      this.tweens.add({
        targets: this.fireSprite,
        scaleX: { from: this.fireSprite.scaleX * 1.18, to: this.fireSprite.scaleX },
        scaleY: { from: this.fireSprite.scaleY * 1.18, to: this.fireSprite.scaleY },
        duration: 240, ease: 'Back.Out',
      });
    }

    // Build pad
    const padCfg = cfg.buildPads[0];
    let onPadWithNoCoins = false;
    if (!this.tentBuilt) {
      const pdx = this.playerLX - this.padX; const pdy = this.playerLY - this.padY;
      const inPadRange = pdx*pdx + pdy*pdy < padCfg.standRangePx ** 2;
      if (inPadRange && this.coins > 0) {
        const pay = Math.min(this.coins, padCfg.payRateCoinsPerSec * dt);
        this.coins -= pay; this.coinsPaidForTent += pay;
        if (this.coinsPaidForTent >= padCfg.costCoins) this.buildTent();
      } else if (inPadRange && this.coins === 0) {
        onPadWithNoCoins = true;
      }
    }

    // Fuel & freeze
    this.fuel = Math.max(0, this.fuel - cfg.fire.fuelDrainPerSec * dt);
    if (this.fuel === 0) {
      this.freezeMeter += cfg.fire.freezeRatePerSec * dt;
      if (this.freezeMeter >= cfg.fire.freezeMax) { this.loseGame(); return; }
    } else {
      this.freezeMeter = Math.max(0, this.freezeMeter - 2 * dt);
    }

    // HP regen near fire or inside camp walls
    if (!this.playerDead && this.playerHp < this.playerHpMax) {
      const nearFire = (this.playerLX - this.fireX)**2 + (this.playerLY - this.fireY)**2 < 160**2;
      const isoPos = screenToIso(this.playerLX, this.playerLY, cfg.originX, cfg.originY);
      const inCamp = isoPos.ix >= 3 && isoPos.ix <= 13 && isoPos.iy >= 3 && isoPos.iy <= 12;
      if (nearFire || inCamp) {
        this.playerHp = Math.min(this.playerHpMax, this.playerHp + (cfg.player.hpRegenPerSec ?? 0.5) * dt);
      }
    }

    // ── Survivors ────────────────────────────────────────────────────────

    let nearFrozen: Survivor | null = null; let nearDist = Infinity;

    // Frozen & thawing — shiver, hint detection, thaw progress
    for (const sv of this.survivors) {
      if (sv.state !== 'frozen' && sv.state !== 'thawing') continue;

      const shiver = Math.sin(time * 14 + sv.bobOffset) * 2.5;
      sv.sprite.x = sv.lx + shiver;
      sv.sprite.y = sv.ly;
      if (sv.iceGfx) sv.iceGfx.x = shiver;

      if (sv.state === 'frozen') {
        const distPl = Math.sqrt((this.playerLX - sv.lx) ** 2 + (this.playerLY - sv.ly) ** 2);
        if (distPl < nearDist) { nearDist = distPl; nearFrozen = sv; }

        if (distPl < cfg.survivorFollowRangePx) {
          sv.state = 'following';
          this.sound.play('snd_ice_shatter', { volume: 0.7 });
          // Remove all frozen visuals with ice shatter
          sv.iceGfx?.destroy(); sv.iceGfx = undefined;
          sv.frostEmitter?.destroy(); sv.frostEmitter = undefined;
          sv.sprite.clearTint();
          this.add.particles(sv.lx, sv.ly - 38, 'effect_ice_freeze_shatter', {
            speed: { min: 70, max: 190 }, angle: { min: 0, max: 360 },
            scale: { start: 0.14, end: 0 }, alpha: { start: 1, end: 0 },
            lifespan: 600, emitting: false,
          }).explode(18);
          const excl = this.add.text(sv.lx, sv.ly - 80, '!', {
            fontFamily: "'Fredoka One', cursive", fontSize: '34px', color: '#ffff00', stroke: '#000000', strokeThickness: 5,
          }).setOrigin(0.5, 1).setDepth(sv.sprite.depth + 20);
          this.tweens.add({ targets: excl, y: sv.ly - 145, alpha: 0, duration: 1100, ease: 'Quad.Out', onComplete: () => excl.destroy() });
        }
      }

      if (sv.state === 'thawing') {
        sv.thawProgress = Math.min(1, sv.thawProgress + dt / cfg.survivorThawTimeSec);
        if (sv.thawBar) {
          sv.thawBar.clear();
          const bw = 52; const bx = sv.lx - bw / 2; const by = sv.ly - 102;
          sv.thawBar.fillStyle(0x333333, 0.8).fillRect(bx, by, bw, 7);
          sv.thawBar.fillStyle(0x44aaff, 1).fillRect(bx, by, bw * sv.thawProgress, 7);
          sv.thawBar.setDepth(sv.sprite.depth + 2);
        }
        if (sv.thawProgress >= 1) this.thawSurvivor(sv);
      }
    }

    // Single-file trail following: each follower targets the one in front at TRAIL_SPACING
    let tlLX = this.playerLX; let tlLY = this.playerLY;
    for (const sv of this.survivors) {
      if (sv.state !== 'following') continue;
      const svPrevLx = sv.lx; const svPrevLy = sv.ly;

      const dx = tlLX - sv.lx; const dy = tlLY - sv.ly;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > TRAIL_SPACING) {
        const speed = cfg.workerWalkSpeed;
        const move = Math.min(d - TRAIL_SPACING, speed * dt);
        sv.lx += (dx / d) * move;
        sv.ly += (dy / d) * move;
      }

      const co = this.constrainToObstacles(sv.lx, sv.ly);
      const wc = this.wallConstrain(svPrevLx, svPrevLy, co.x, co.y);
      sv.lx = wc.x; sv.ly = wc.y;

      const svVX = (sv.lx - svPrevLx) / dt;
      const svVY = (sv.ly - svPrevLy) / dt;
      const svMoving = svVX * svVX + svVY * svVY > 20 * 20;
      const svRawDir = this.velToDir(svVX, svVY);
      const svDs = this.stepDir(sv.lastDir, sv.pendingDir, sv.pendingDirMs, svRawDir, delta);
      sv.lastDir = svDs.lastDir; sv.pendingDir = svDs.pendingDir; sv.pendingDirMs = svDs.pendingMs;
      sv.activeAnim = 'walk';
      if (svMoving && Math.abs(Math.sin(sv.waddlePhase + 1.5)) < 0.1 && time - this.lastFootprintTime > 350)
        this.footprintEmitter.emitParticleAt(sv.lx, sv.ly);
      this.applyCharWaddle(sv, dt, svMoving);

      // Reached fire → start thawing
      if ((sv.lx - this.fireX) ** 2 + (sv.ly - this.fireY) ** 2 < cfg.survivorThawRangePx ** 2) {
        sv.state = 'thawing';
      }

      // This survivor becomes the leader for the next follower
      tlLX = sv.lx; tlLY = sv.ly;
    }

    // Workers
    for (const sv of this.survivors) {
      if (sv.state === 'worker') this.updateWorker(sv, dt, delta);
    }

    // Camera (needed for depth sort + fire glow below)
    const cam = this.cameras.main;

    // Hint arrows — draw at world positions, scale offsets by 1/zoom so they stay the same visual size
    this.hintArrowGfx.clear();
    {
      const iz = 1 / cam.zoom;
      if (nearFrozen) {
        const wx = nearFrozen.lx, wy = nearFrozen.ly;
        const a = 0.55 + 0.45 * Math.sin(time / 190);
        this.hintArrowGfx.fillStyle(0xffff33, a);
        this.hintArrowGfx.fillTriangle(wx, wy - 94*iz, wx - 10*iz, wy - 108*iz, wx + 10*iz, wy - 108*iz);
        this.hintArrowGfx.fillRect(wx - 4*iz, wy - 122*iz, 8*iz, 16*iz);
      }
      if (!this.tentBuilt && this.coins > 0 && !nearFrozen) {
        const a = 0.6 + 0.4 * Math.sin(time / 200);
        this.hintArrowGfx.fillStyle(0x44ff88, a);
        this.hintArrowGfx.fillTriangle(this.padX, this.padY - 48*iz, this.padX - 10*iz, this.padY - 62*iz, this.padX + 10*iz, this.padY - 62*iz);
        this.hintArrowGfx.fillRect(this.padX - 4*iz, this.padY - 76*iz, 8*iz, 16*iz);
      }
    }

    // Drop shadows (single graphics pass, depth between ground and sprites)
    this.shadowGfx.clear();
    this.shadowGfx.fillStyle(0x000000, 0.20);
    this.shadowGfx.fillEllipse(this.playerLX, this.playerLY, 44, 16);
    this.shadowGfx.fillEllipse(this.fireX, this.fireY, 62, 24);
    for (const tree of this.trees) this.shadowGfx.fillEllipse(tree.sprite.x, tree.sprite.y, 54, 20);
    for (const sv of this.survivors) this.shadowGfx.fillEllipse(sv.lx, sv.ly, 42, 15);
    for (const ds of this.decorSprites) this.shadowGfx.fillEllipse(ds.x, ds.y, 44, 16);
    if (this.tentSprite) this.shadowGfx.fillEllipse(this.tentSprite.x, this.tentSprite.y, 70, 26);

    // ── Animals ────────────────────────────────────────────────────────────────
    this.playerAttackMs = Math.max(0, this.playerAttackMs - delta);

    // Player attacks nearest wolf in range — triggered when wolf comes close enough
    if (!this.playerDead && this.playerAttackMs <= 0) {
      let nearestAnimal: AnimalEntity | null = null;
      let nearestDist2 = Infinity;
      for (const a of this.animals) {
        if (a.state === 'dead') continue;
        const d2 = (this.playerLX - a.lx)**2 + (this.playerLY - a.ly)**2;
        if (d2 < a.spec.attackRange**2 && d2 < nearestDist2) { nearestDist2 = d2; nearestAnimal = a; }
      }
      if (nearestAnimal) {
        const a = nearestAnimal;
        // Lock facing to wolf direction
        const toWolfDir = this.velToDir(a.lx - this.playerLX, a.ly - this.playerLY);
        if (toWolfDir >= 0) this.playerLastDir = toWolfDir;
        this.playerAttackMs = a.spec.attackIntervalMs;
        this.playCharAnim(this.playerSprite, 'hero', 'chop', this.playerLastDir);
        const hitTarget = a;
        this.time.delayedCall(220, () => {
          if (this.gameOver || hitTarget.state === 'dead') return;
          this.sound.play('snd_axe_chop', { volume: 0.55 });
          hitTarget.hp--; hitTarget.hitFlashMs = 180;
          // Impact burst at wolf
          this.add.particles(hitTarget.lx, hitTarget.ly - 20, 'woodchip', {
            speed:{min:50,max:110}, angle:{min:190,max:350},
            scale:{start:0.9,end:0.1}, alpha:{start:1,end:0},
            lifespan:320, emitting:false,
          }).explode(8);
          // Per-hit meat
          if (hitTarget.spec.meatPerHit > 0 && this.carriedMeat < cfg.player.carryCapacity) {
            this.spawnMeatFromHit(hitTarget.lx, hitTarget.ly);
          }
          // Attack drives wolf into lunge-interrupted → backoff, then back to circle
          if (hitTarget.state === 'lunge') {
            hitTarget.state = 'backoff'; hitTarget.stateTimer = 500;
          } else if (hitTarget.state !== 'flee') {
            hitTarget.state = 'backoff'; hitTarget.stateTimer = 400;
          }
          if (hitTarget.hp <= 0) {
            this.killAnimal(hitTarget);
          } else {
            if (hitTarget.hp < hitTarget.maxHp * hitTarget.spec.fleeBelowHpPct) {
              hitTarget.state = 'flee'; hitTarget.fleeMs = hitTarget.spec.fleeTimeSec * 1000;
            }
            if (hitTarget.isBoss && !hitTarget.summonedMinions && hitTarget.hp <= hitTarget.maxHp * (hitTarget.spec.summonAtHpPct ?? 0.5)) {
              hitTarget.summonedMinions = true;
              this.summonWolves(hitTarget, hitTarget.spec.summonCount ?? 2);
            }
          }
        });
        this.time.delayedCall(a.spec.attackIntervalMs - 80, () => {
          if (!this.gameOver) this.playCharAnim(this.playerSprite, 'hero', 'walk', this.playerLastDir);
        });
      }
    }

    for (const a of this.animals) {
      if (a.state === 'dead') {
        if (a.deathMs > 0) {
          a.deathMs = Math.max(0, a.deathMs - delta);
          a.sprite.setAlpha(a.deathMs / 600).setAngle(a.sprite.angle + delta * 0.12);
        }
        a.respawnMs = Math.max(0, a.respawnMs - delta);
        if (a.respawnMs <= 0 && a.deathMs <= 0) this.respawnAnimal(a);
        continue;
      }

      // Track previous position for direction computation
      const prevAnimalLx = a.lx; const prevAnimalLy = a.ly;

      const distToPlayer = Math.sqrt((this.playerLX - a.lx)**2 + (this.playerLY - a.ly)**2);

      if (a.state === 'flee') {
        // ── Flee: run away from player ──────────────────────────────────────
        a.fleeMs = Math.max(0, a.fleeMs - delta);
        if (a.fleeMs <= 0) { a.state = 'roam'; a.sprite.setTint(a.baseTint); }
        const fdx = a.lx - this.playerLX; const fdy = a.ly - this.playerLY;
        const flen = Math.sqrt(fdx*fdx + fdy*fdy);
        if (flen > 0) { a.lx += (fdx/flen)*a.spec.aggroSpeed*dt; a.ly += (fdy/flen)*a.spec.aggroSpeed*dt; }
        if (a.hitFlashMs <= 0) a.sprite.setTint(0xff9966);

      } else if (a.state === 'circle') {
        // ── Circle: orbit player at circleDistancePx ─────────────────────────
        const orbitSpeedRad = 0.9; // rad/s
        a.circleAngle += a.circleDir * orbitSpeedRad * dt;
        const targetX = this.playerLX + Math.cos(a.circleAngle) * a.spec.circleDistancePx;
        const targetY = this.playerLY + Math.sin(a.circleAngle) * a.spec.circleDistancePx * 0.5; // iso squish
        const cdx = targetX - a.lx; const cdy = targetY - a.ly;
        const clen = Math.sqrt(cdx*cdx + cdy*cdy);
        const circleSpeed = a.spec.aggroSpeed * 0.75;
        if (clen > 4) { a.lx += (cdx/clen)*circleSpeed*dt; a.ly += (cdy/clen)*circleSpeed*dt; }
        if (a.hitFlashMs <= 0) a.sprite.setTint(0xffccaa); // slight warm tint = alert
        // Count down to next lunge
        a.stateTimer = Math.max(0, a.stateTimer - delta);
        if (a.stateTimer <= 0) { a.state = 'windup'; a.stateTimer = a.spec.windupMs; a.lungeTargetX = this.playerLX; a.lungeTargetY = this.playerLY; }
        // If player walks away, drop back to roam
        if (distToPlayer > a.spec.aggroRange * 2.5) { a.state = 'roam'; a.sprite.setTint(a.baseTint); }

      } else if (a.state === 'windup') {
        // ── Windup: pause, crouch (scale pulse), face player ─────────────────
        a.stateTimer = Math.max(0, a.stateTimer - delta);
        // Scale pulse: 1.0 → 0.88 → 1.0 over windupMs (crouch effect)
        const windPct = 1 - a.stateTimer / a.spec.windupMs;
        const crouchScale = 1 - 0.12 * Math.sin(windPct * Math.PI);
        const baseDispSize = 70;
        const natW = a.sprite.width / a.sprite.scaleX || baseDispSize;
        const bs = baseDispSize / natW;
        a.sprite.setScale(bs * (2 - crouchScale), bs * crouchScale);
        if (a.hitFlashMs <= 0) a.sprite.setTint(0xff8844); // orange-red = about to attack
        // Capture fresh player position each frame of windup
        a.lungeTargetX = this.playerLX; a.lungeTargetY = this.playerLY;
        if (a.stateTimer <= 0) { a.state = 'lunge'; a.stateTimer = 500; }

      } else if (a.state === 'lunge') {
        // ── Lunge: fast dash toward captured player position ──────────────────
        a.stateTimer = Math.max(0, a.stateTimer - delta);
        const ldx = a.lungeTargetX - a.lx; const ldy = a.lungeTargetY - a.ly;
        const llen = Math.sqrt(ldx*ldx + ldy*ldy);
        if (llen > 10) { a.lx += (ldx/llen)*a.spec.lungeSpeedPx*dt; a.ly += (ldy/llen)*a.spec.lungeSpeedPx*dt; }
        if (a.hitFlashMs <= 0) a.sprite.setTint(0xff4422);
        // Bite if reached player
        a.biteMs = Math.max(0, a.biteMs - delta);
        if (!this.playerDead && a.biteMs <= 0 && distToPlayer < a.spec.attackRange * 0.8) {
          a.biteMs = a.spec.biteIntervalMs;
          this.hitPlayer(a);
          a.state = 'backoff'; a.stateTimer = 500;
        } else if (a.stateTimer <= 0 || llen < 8) {
          // Missed or timer expired — back off
          a.state = 'backoff'; a.stateTimer = 450;
        }

      } else if (a.state === 'backoff') {
        // ── Backoff: retreat after bite or miss ───────────────────────────────
        a.stateTimer = Math.max(0, a.stateTimer - delta);
        const bdx = a.lx - this.playerLX; const bdy = a.ly - this.playerLY;
        const blen = Math.sqrt(bdx*bdx + bdy*bdy);
        if (blen < a.spec.backoffDistPx) {
          if (blen > 1) { a.lx += (bdx/blen)*a.spec.backoffSpeedPx*dt; a.ly += (bdy/blen)*a.spec.backoffSpeedPx*dt; }
        }
        if (a.hitFlashMs <= 0) a.sprite.setTint(0xffccaa);
        if (a.stateTimer <= 0) {
          // Reenter circle, pick new orbit angle + direction + timer before next windup
          a.state = 'circle';
          a.circleAngle = Math.atan2(a.ly - this.playerLY, a.lx - this.playerLX);
          a.circleDir = Math.random() > 0.5 ? 1 : -1;
          a.stateTimer = 1500 + Math.random() * 2000; // 1.5–3.5s before next lunge
        }

      } else {
        // ── Roam: wander randomly ─────────────────────────────────────────────
        a.roamChangeMs = Math.max(0, a.roamChangeMs - delta);
        if (a.roamChangeMs <= 0) this.pickRoamTarget(a);
        const ax = a.targetLx - a.lx; const ay = a.targetLy - a.ly;
        const ad2 = ax*ax + ay*ay;
        if (ad2 > 64) { const ad=Math.sqrt(ad2); a.lx+=(ax/ad)*a.spec.speed*dt; a.ly+=(ay/ad)*a.spec.speed*dt; }
        if (distToPlayer < a.spec.aggroRange) {
          a.state = 'circle';
          a.circleAngle = Math.atan2(a.ly - this.playerLY, a.lx - this.playerLX);
          a.circleDir = Math.random() > 0.5 ? 1 : -1;
          a.stateTimer = 800 + Math.random() * 1200;
        }
      }

      // Animal direction + animation (runs every frame, after movement)
      {
        const hasAtlas = this.textures.exists(a.atlasKey);
        const mvdx = a.lx - prevAnimalLx; const mvdy = a.ly - prevAnimalLy;
        const rawDir = this.wolfDir(mvdx * 20, mvdy * 20); // amplify for velToDir threshold
        if (rawDir >= 0) a.dir = rawDir;

        if (hasAtlas) {
          let wantAnim = '';
          if (a.state === 'lunge' || a.state === 'windup') wantAnim = `${a.atlasKey}_attack_d${a.dir}`;
          else if (a.state === 'flee')                      wantAnim = `${a.atlasKey}_run_d${a.dir}`;
          else                                               wantAnim = `${a.atlasKey}_walk_d${a.dir}`;

          if (this.anims.exists(wantAnim) && a.sprite.anims.getName() !== wantAnim) {
            a.sprite.play(wantAnim, true);
          }
        }
      }

      // Bob (suppress during windup — the scale animation replaces it)
      if (a.state !== 'windup') {
        a.bobPhase += dt * 4.5;
        a.sprite.setPosition(a.lx, a.ly + Math.sin(a.bobPhase) * 2.5);
      } else {
        a.sprite.setPosition(a.lx, a.ly);
      }

      // Hit flash overrides all tints
      if (a.hitFlashMs > 0) {
        a.hitFlashMs = Math.max(0, a.hitFlashMs - delta);
        a.sprite.setTint(a.hitFlashMs > 0 ? 0xff3333 : a.baseTint);
        if (a.hitFlashMs <= 0 && a.state !== 'flee' && a.state !== 'circle' && a.state !== 'windup' && a.state !== 'lunge' && a.state !== 'backoff') a.sprite.setTint(a.baseTint);
      }

      // Eye glow (boss only) — pulse slightly and follow head
      if (a.eyeGlow) {
        const pulse = 0.85 + 0.15 * Math.sin(a.bobPhase * 2.5);
        a.eyeGlow.setPosition(a.lx, a.ly - a.displaySize * 0.78)
          .setAlpha(pulse).setDepth(a.ly + 2);
      }

      // Shadow
      this.shadowGfx.fillEllipse(a.lx, a.ly, 54 * (a.displaySize / 80), 20 * (a.displaySize / 80));
    }
    // ── Meat drops ─────────────────────────────────────────────────────────────
    for (const md of this.meatDrops) {
      if (md.sprite.alpha <= 0) continue;
      md.bobPhase += dt * 2.5;
      md.sprite.setY(md.ly + Math.sin(md.bobPhase) * 3);
      const mdx = this.playerLX - md.lx; const mdy = this.playerLY - md.ly;
      if (mdx*mdx + mdy*mdy < cfg.player.collectRangePx**2 && this.carriedMeat < cfg.player.carryCapacity && md.sprite.alpha > 0) {
        this.carriedMeat++;
        md.sprite.setAlpha(0);
        this.tweens.add({ targets: md.sprite, y: md.ly - 48, alpha: { from: 1, to: 0 }, duration: 400, onComplete: () => md.sprite.destroy() });
      }
    }
    // ── Meat carry icons ───────────────────────────────────────────────────────
    const mOff = (this.playerLastDir >= 2 && this.playerLastDir <= 4) ? 6 : -6;
    for (let i = 0; i < 4; i++) {
      this.meatIcons[i].setVisible(i < this.carriedMeat);
      if (i < this.carriedMeat) {
        this.meatIcons[i].setPosition(this.playerLX + mOff, this.playerLY + this.playerBobY - 58 - i * 14);
        this.meatIcons[i].setDepth(this.playerSprite.depth - 1 + i);
      }
    }
    // ── Cooking drop + timer ───────────────────────────────────────────────────
    const cookCfg = (cfg as any).cookingConfig;
    if (cookCfg && this.carriedMeat > 0) {
      const fdx2 = this.playerLX - this.fireX; const fdy2 = this.playerLY - this.fireY;
      if (fdx2*fdx2 + fdy2*fdy2 < cfg.player.dropRangePx**2) {
        this.cookQueue += this.carriedMeat; this.carriedMeat = 0;
        this.sound.play('snd_log_drop', { volume: 0.45 });
      }
    }
    if (cookCfg && this.cookQueue > 0) {
      this.cookTimer -= delta;
      if (this.cookTimer <= 0) {
        this.cookQueue--; this.cookTimer = cookCfg.cookTimeMs;
        this.coins += cookCfg.meatToCoins;
        this.time.delayedCall(120, () => this.sound.play('snd_coin_pickup', { volume: 0.45 }));
        const p = this.add.text(this.fireX, this.fireY - 50, `+${cookCfg.meatToCoins}`, {
          fontFamily:"'Fredoka One',cursive", fontSize:'24px', color:'#ff9944', stroke:'#000', strokeThickness:4,
        }).setOrigin(0.5,1).setDepth(1003);
        this.tweens.add({ targets: p, y: this.fireY - 120, alpha: 0, duration: 1200, ease:'Quad.Out', onComplete: ()=>p.destroy() });
      }
    }
    // ── Stage-advance banner ───────────────────────────────────────────────────
    if (this.stageBannerMs > 0) {
      this.stageBannerMs = Math.max(0, this.stageBannerMs - delta);
    }

    // Depth sort — cauldron has origin 0.85 so add 17px to sort by its stone-ring base
    for (const sp of this.depthGroup) {
      sp.setDepth(sp === this.fireSprite ? sp.y + 17 : sp.y);
    }

    // Player HP bar (world-space, above head, only when not full)
    this.playerHpBarGfx.clear();
    if (!this.playerDead && this.playerHp < this.playerHpMax) {
      const bw = 44; const bx = this.playerLX - bw / 2;
      const by = this.playerLY - CHAR_SIZE - 10;
      this.playerHpBarGfx.fillStyle(0x222222, 0.8).fillRoundedRect(bx - 1, by - 1, bw + 2, 8, 3);
      const pct = this.playerHp / this.playerHpMax;
      const col = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2222;
      this.playerHpBarGfx.fillStyle(col, 1).fillRoundedRect(bx, by, Math.max(0, bw * pct), 6, 2);
    }

    // Fire glow — animated radial gradient
    const fuelPct = this.fuel / cfg.fire.fuelMax;
    const flickerScale = 0.9 + 0.2 * Math.sin(time / 180) + 0.1 * Math.sin(time / 73);
    const baseScale = 0.6 + fuelPct * 0.8;
    this.fireGlowImg.setScale(baseScale * flickerScale);
    this.fireGlowImg.setAlpha(0.4 + fuelPct * 0.5);

    // Fire loop volume tracks fuel
    const fSnd = this.fireSoundRef as Phaser.Sound.WebAudioSound;
    if (fSnd?.setVolume) fSnd.setVolume(0.08 + fuelPct * 0.38);

    // HUD data — emitted to UIScene each frame
    this.hintTimer += delta;
    let hintMsg = '';
    if (this.hintTimer < cfg.hintDurationSec * 1000) {
      if (this.hintTimer < 8000) hintMsg = 'Walk near trees to collect logs!';
      else if (this.carriedLogs > 0) hintMsg = 'Carry logs to the fire!';
      else if (!this.tentBuilt && this.coins >= 10) hintMsg = 'Stand on the blue pad to build the tent!';
      else if (nearFrozen && nearDist > cfg.survivorFollowRangePx) hintMsg = 'Walk up to a frozen survivor!';
    }
    // Goal text from active stage or legacy tent progress
    this.advanceGoalStage();
    let goalStr: string;
    if (this.goalStages.length > 0 && this.currentStageIdx < this.goalStages.length) {
      goalStr = this.goalStages[this.currentStageIdx].hintText;
    } else if (this.goalStages.length > 0) {
      goalStr = 'All goals complete!';
    } else {
      goalStr = this.tentBuilt ? 'Tent built \u2713' : `Tent: ${Math.floor(this.coinsPaidForTent)}/${padCfg.costCoins}`;
    }
    if (this.stageBannerMs > 0) goalStr = this.stageBannerText;
    const bannerAlpha = (this.stageBannerMs > 0)
      ? Math.min(1, this.stageBannerMs / 400)
      : (this.goalStages.length > 0 || (!this.tentBuilt && this.coins >= 1 && this.rescuedCount > 0))
        ? 0.72 + 0.28 * Math.sin(time / 320)
        : 0;
    const hintAlpha = hintMsg ? 0.6 + 0.4 * Math.sin(this.hintTimer / 280) : 0;

    this.events.emit('hud-update', {
      fuelPct,
      showFreeze: this.fuel <= 0,
      freezePct:  this.freezeMeter / cfg.fire.freezeMax,
      coins:      Math.floor(this.coins),
      goalText:   goalStr,
      survivors:  this.rescuedCount,
      bannerAlpha,
      hintText:   hintMsg,
      hintAlpha,
      fps:        Math.round(this.game.loop.actualFps),
      joyActive:  this.joyActive,
      joyOX:      this.joyOX,
      joyOY:      this.joyOY,
      joyCX:        this.joyCX,
      joyCY:        this.joyCY,
      showCoinShop: onPadWithNoCoins,
    });
  }

  // Apply bob + animation to a survivor sprite.
  // animOverride allows callers to force a specific animation (e.g. 'chop').
  // Direction must be updated in sv.lastDir by caller before calling this.
  private applyCharWaddle(sv: Survivor, dt: number, isMoving: boolean, animOverride?: string): void {
    if (isMoving) sv.waddlePhase += dt * BOB_HZ * Math.PI * 2;
    sv.waddleBobY = isMoving ? Math.sin(sv.waddlePhase) * BOB_AMP : 0;

    if (animOverride === 'chop') {
      this.playCharAnim(sv.sprite, 'worker', 'chop', sv.lastDir);
    } else if (isMoving) {
      this.playCharAnim(sv.sprite, 'worker', sv.activeAnim, sv.lastDir);
    } else {
      this.showStaticWalk(sv.sprite, 'worker', sv.lastDir);
    }

    sv.sprite.x = sv.lx;
    sv.sprite.y = sv.ly + sv.waddleBobY;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private spawnWoodChips(x: number, y: number): void {
    this.add.particles(x, y, 'woodchip', {
      speed: { min: 55, max: 140 }, angle: { min: 190, max: 350 },
      scale: { start: 1.1, end: 0.1 }, alpha: { start: 1, end: 0 },
      lifespan: 520, emitting: false,
    }).explode(14);
  }

  private spawnFlyingLog(fromX: number, fromY: number, toX: number, toY: number): void {
    const log = this.add.image(fromX, fromY, 'resource_wood_logs_01')
      .setDisplaySize(26, 26).setAlpha(1).setDepth(2001);
    this.tweens.add({
      targets: log,
      x: toX, y: toY - 30,
      duration: 700,
      ease: 'Quad.In',
      onUpdate: (_, target) => {
        (target as Phaser.GameObjects.Image).setDepth(2001);
      },
      onComplete: () => {
        this.tweens.add({ targets: log, alpha: 0, duration: 200, onComplete: () => log.destroy() });
        this.tweens.add({
          targets: this.fireSprite,
          scaleX: { from: this.fireSprite.scaleX * 1.12, to: this.fireSprite.scaleX },
          scaleY: { from: this.fireSprite.scaleY * 1.12, to: this.fireSprite.scaleY },
          duration: 200, ease: 'Back.Out',
        });
      },
    });
  }

  private spawnCoinFly(count: number): void {
    // Floating "+N" popup at fire position (world space)
    const coinAmt = count * cfg.fire.coinsPerLog;
    const popup = this.add.text(this.fireX, this.fireY - 60, `+${coinAmt}`, {
      fontFamily: "'Fredoka One', cursive", fontSize: '28px', color: '#ffd700',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(1003);
    this.tweens.add({ targets: popup, y: this.fireY - 130, alpha: 0, duration: 1300, ease: 'Quad.Out', onComplete: () => popup.destroy() });

    const cam = this.cameras.main;
    const fsx = this.fireX - cam.scrollX; const fsy = this.fireY - cam.scrollY;
    for (let i = 0; i < Math.min(count, 6); i++) {
      const c = this.add.image(fsx + Phaser.Math.Between(-10, 10), fsy + Phaser.Math.Between(-10, 10), 'resource_coin_gold_01')
        .setDisplaySize(18, 18).setScrollFactor(0).setDepth(1002);
      this.tweens.add({ targets: c, x: 258, y: 32, duration: 480 + i * 70, delay: i * 55, ease: 'Cubic.Out', onComplete: () => c.destroy() });
    }
  }

  private buildTent(): void {
    this.tentBuilt = true;
    this.padGfx.destroy(); this.padLabel.destroy();
    this.tentSprite = this.add.image(this.padX, this.padY, 'building_tent_canvas_01')
      .setDisplaySize(104, 104).setOrigin(0.5, 0.85);
    this.depthGroup.push(this.tentSprite);
    this.obstacles.push({ x: this.padX, y: this.padY, r: 30 });
    this.tweens.add({
      targets: this.tentSprite,
      scaleX: { from: 0, to: this.tentSprite.scaleX },
      scaleY: { from: 0, to: this.tentSprite.scaleY },
      duration: 380, ease: 'Back.Out',
    });
    this.cameras.main.shake(320, 0.007);
    this.sound.play('snd_build_complete', { volume: 0.75 });
    this.advanceGoalStage();
    this.checkWin();
  }

  private thawSurvivor(s: Survivor): void {
    s.state = 'worker'; s.workerState = 'idle'; s.activeAnim = 'idle';
    s.sprite.clearTint();
    s.thawBar?.destroy(); s.thawBar = undefined;
    s.treeIndex = this.nextWorkerTreeIndex;
    this.nextWorkerTreeIndex = (this.nextWorkerTreeIndex + 1) % Math.max(1, this.trees.length);
    this.rescuedCount++;
    this.advanceGoalStage();
    this.checkWin();
  }

  private updateWorker(w: Survivor, dt: number, delta: number): void {
    if (!w.workerState) w.workerState = 'idle';
    const prevLxW = w.lx; const prevLyW = w.ly;

    switch (w.workerState) {
      case 'idle': {
        const assigned = this.trees[Math.min(w.treeIndex, this.trees.length - 1)];
        if (assigned && !assigned.onCooldown) { w.workerTarget = assigned; w.workerState = 'toTree'; w.activeAnim = 'walk'; }
        break;
      }
      case 'toTree': {
        if (!w.workerTarget) { w.workerState = 'idle'; break; }
        const tx = w.workerTarget.sprite.x; const ty = w.workerTarget.sprite.y;
        const dx = tx - w.lx; const dy = ty - w.ly; const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 30) {
          w.workerState = 'chopping';
          w.activeAnim = 'chop';
          // Face the tree
          const toTreeDir = this.velToDir(tx - w.lx, ty - w.ly);
          if (toTreeDir >= 0) w.lastDir = toTreeDir;
          // Tree shake + chop sounds
          const treeSprite = w.workerTarget!.sprite;
          this.tweens.add({ targets: treeSprite, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: 80, ease: 'Sine.InOut', onComplete: () => { treeSprite.angle = 0; } });
          this.sound.play('snd_axe_chop', { volume: 0.60 });
          this.time.delayedCall(1500, () => { if (w.workerState === 'chopping') this.sound.play('snd_axe_chop', { volume: 0.60 }); });
          this.time.delayedCall(3000, () => { if (w.workerState === 'chopping') this.sound.play('snd_axe_chop', { volume: 0.60 }); });
          // Wood chips burst at each axe swing (~every 1.5s)
          this.spawnWoodChips(tx, ty - 24);
          this.time.delayedCall(1500, () => { if (w.workerState === 'chopping') this.spawnWoodChips(tx, ty - 24); });
          this.time.delayedCall(3000, () => { if (w.workerState === 'chopping') this.spawnWoodChips(tx, ty - 24); });
          this.time.delayedCall(cfg.workerChopIntervalMs, () => {
            if (w.workerState === 'chopping') {
              w.workerCarrying = 1; w.workerState = 'toFire'; w.activeAnim = 'carry_walk';
              this.spawnFlyingLog(tx, ty - 20, this.fireX, this.fireY);
            }
          });
        } else {
          const wvTree = this.projectVelocityFromWalls((dx/d)*cfg.workerWalkSpeed, (dy/d)*cfg.workerWalkSpeed, w.lx, w.ly);
          w.lx += wvTree.vx*dt; w.ly += wvTree.vy*dt;
          const wSep = this.applySeparation(w.lx, w.ly, w);
          const wo = this.constrainToObstacles(wSep.x, wSep.y);
          const wc = this.wallConstrain(prevLxW, prevLyW, wo.x, wo.y);
          w.lx = wc.x; w.ly = wc.y;
        }
        break;
      }
      case 'chopping': break;
      case 'toFire': {
        const dx = this.fireX - w.lx; const dy = this.fireY - w.ly; const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 52) {
          this.fuel = Math.min(cfg.fire.fuelMax, this.fuel + cfg.fire.fuelPerLog);
          this.coins += cfg.fire.coinsPerLog; w.workerCarrying = 0; w.workerState = 'idle'; w.activeAnim = 'idle';
        } else {
          const wvFire = this.projectVelocityFromWalls((dx/d)*cfg.workerWalkSpeed, (dy/d)*cfg.workerWalkSpeed, w.lx, w.ly);
          w.lx += wvFire.vx*dt; w.ly += wvFire.vy*dt;
          const wSep = this.applySeparation(w.lx, w.ly, w);
          const wo = this.constrainToObstacles(wSep.x, wSep.y);
          const wc = this.wallConstrain(prevLxW, prevLyW, wo.x, wo.y);
          w.lx = wc.x; w.ly = wc.y;
        }
        break;
      }
    }

    const workerMoving = w.workerState === 'toTree' || w.workerState === 'toFire';
    const wVX = (w.lx - prevLxW) / dt;
    const wVY = (w.ly - prevLyW) / dt;
    const wRawDir = this.velToDir(wVX, wVY);
    const wDs = this.stepDir(w.lastDir, w.pendingDir, w.pendingDirMs, wRawDir, delta);
    w.lastDir = wDs.lastDir; w.pendingDir = wDs.pendingDir; w.pendingDirMs = wDs.pendingMs;
    w.activeAnim = w.workerCarrying > 0 ? 'carry_walk' : 'walk';
    const animOverride = w.workerState === 'chopping' ? 'chop' : undefined;
    this.applyCharWaddle(w, dt, workerMoving, animOverride);
    w.sprite.setDepth(w.sprite.y);
  }

  private applySeparation(lx: number, ly: number, self: Survivor | null): { x: number; y: number } {
    const SEP_R = 30;
    let rx = lx; let ry = ly;
    if (self !== null) {
      const dx = rx - this.playerLX; const dy = ry - this.playerLY;
      const d2 = dx*dx + dy*dy;
      if (d2 < SEP_R*SEP_R && d2 > 0.01) {
        const d = Math.sqrt(d2); rx = this.playerLX + (dx/d)*SEP_R; ry = this.playerLY + (dy/d)*SEP_R;
      }
    }
    for (const sv of this.survivors) {
      if (sv === self || sv.state === 'frozen' || sv.state === 'following') continue;
      const dx = rx - sv.lx; const dy = ry - sv.ly;
      const d2 = dx*dx + dy*dy;
      if (d2 < SEP_R*SEP_R && d2 > 0.01) {
        const d = Math.sqrt(d2); rx = sv.lx + (dx/d)*SEP_R; ry = sv.ly + (dy/d)*SEP_R;
      }
    }
    return { x: rx, y: ry };
  }

  private loseGame(): void {
    this.gameOver = true;
    this.time.delayedCall(800, () => {
      this.scene.stop('UIScene');
      this.scene.start('LoseScene', { levelNum: this.currentLevelNum });
    });
  }

  private checkWin(): void {
    const done = this.goalStages.length > 0
      ? this.currentStageIdx >= this.goalStages.length
      : this.rescuedCount >= cfg.goal.survivorsToRescue && this.tentBuilt;
    if (done && !this.gameOver) {
      this.gameOver = true;
      this.sound.play('snd_win_jingle', { volume: 0.70 });
      this.tweens.add({ targets: this.cameras.main, zoom: 1.65, duration: 1100, ease: 'Quad.InOut' });
      this.time.delayedCall(1200, () => { this.scene.stop('UIScene'); this.scene.start('WinScene', { levelNum: this.currentLevelNum }); });
    }
  }

  private pickRoamTarget(a: AnimalEntity): void {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * a.roamRadius;
    a.targetLx = a.roamCenterX + Math.cos(angle) * r;
    a.targetLy = a.roamCenterY + Math.sin(angle) * r;
    a.roamChangeMs = 3000 + Math.random() * 4000;
  }

  private killAnimal(a: AnimalEntity): void {
    a.state = 'dead'; a.deathMs = 600;
    a.respawnMs = a.spec.respawnDelaySec * 1000;
    a.sprite.clearTint();
    if (a.eyeGlow) a.eyeGlow.setVisible(false);
    this.animalsKilled++;
    // Drop meat
    for (let i = 0; i < a.spec.meatDrop; i++) {
      const mx = a.lx + (Math.random() - 0.5) * 36;
      const my = a.ly + (Math.random() - 0.5) * 20;
      const ms = this.add.image(mx, my, 'resource_meat_pile_01')
        .setDisplaySize(46, 46).setOrigin(0.5, 0.85).setDepth(my + 1);
      this.meatDrops.push({ sprite: ms, lx: mx, ly: my, bobPhase: Math.random() * Math.PI * 2 });
    }
    this.advanceGoalStage();
  }

  private hitPlayer(a: AnimalEntity): void {
    if (this.playerDead || this.playerFlashMs > 60) return;
    this.playerHp = Math.max(0, this.playerHp - a.spec.biteDamage);
    this.playerFlashMs = 380;
    // Knockback away from wolf
    const kdx = this.playerLX - a.lx; const kdy = this.playerLY - a.ly;
    const klen = Math.sqrt(kdx*kdx + kdy*kdy);
    if (klen > 0) { this.playerKnockVX = (kdx/klen)*a.spec.knockbackPx; this.playerKnockVY = (kdy/klen)*a.spec.knockbackPx; }
    // Slash VFX on player
    this.add.particles(this.playerLX, this.playerLY - 30, 'slashmark', {
      speed:{min:20,max:60}, angle:{min:220,max:320},
      scale:{start:0.9,end:0.4}, alpha:{start:1,end:0},
      lifespan:280, emitting:false,
    }).explode(5);
    this.cameras.main.shake(140, 0.0045);
    this.sound.play('snd_ice_shatter', { volume: 0.38 });
    if (this.playerHp <= 0) this.killPlayer();
  }

  private killPlayer(): void {
    if (this.playerDead) return;
    this.playerDead = true; this.playerDeadMs = 3000;
    this.carriedLogs = 0; this.carriedMeat = 0;
    this.tweens.add({ targets: this.playerSprite, angle: 90, alpha: 0.4, duration: 350 });
    this.cameras.main.shake(280, 0.009);
  }

  private spawnMeatFromHit(fromX: number, fromY: number): void {
    const ms = this.add.image(fromX, fromY - 20, 'resource_meat_icon_red')
      .setDisplaySize(26, 26).setDepth(2001);
    const targetX = this.playerLX + ((this.playerLastDir >= 2 && this.playerLastDir <= 4) ? 6 : -6);
    const targetY = this.playerLY - 58 - this.carriedMeat * 14;
    this.tweens.add({
      targets: ms, x: targetX, y: targetY,
      duration: 380, ease: 'Quad.Out',
      onComplete: () => { ms.destroy(); if (this.carriedMeat < cfg.player.carryCapacity) this.carriedMeat++; },
    });
  }

  private respawnAnimal(a: AnimalEntity): void {
    a.hp = a.maxHp; a.lx = a.spawnLx; a.ly = a.spawnLy;
    a.state = 'roam'; a.summonedMinions = false;
    a.sprite.setAlpha(1).setAngle(0).setPosition(a.lx, a.ly).setTint(a.baseTint);
    if (a.eyeGlow) a.eyeGlow.setVisible(true).setPosition(a.lx, a.ly - a.displaySize * 0.78);
    this.pickRoamTarget(a);
  }

  private createEyeGlowTexture(): void {
    const c = document.createElement('canvas'); c.width = 32; c.height = 14;
    const ctx = c.getContext('2d')!;
    for (const ex of [8, 24]) {
      const g = ctx.createRadialGradient(ex, 7, 0, ex, 7, 9);
      g.addColorStop(0, 'rgba(255,40,0,1)'); g.addColorStop(0.4, 'rgba(255,20,0,0.7)'); g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 14);
    }
    this.textures.addCanvas('wolfeyeglow', c);
  }

  private summonWolves(alpha: AnimalEntity, count: number): void {
    const wolfSpec = { ...((cfg as any).animalConfig?.wolf ?? {}), respawnDelaySec: 999 };
    const defaultSpec = { hp:3, speed:60, aggroSpeed:95, aggroRange:110, circleDistancePx:125, attackRange:88, attackIntervalMs:1300, biteIntervalMs:1200, biteDamage:1, knockbackPx:140, meatDrop:0, meatPerHit:0, respawnDelaySec:999, fleeBelowHpPct:0.4, fleeTimeSec:4, windupMs:380, lungeSpeedPx:340, backoffDistPx:155, backoffSpeedPx:210 };
    const spec = { ...defaultSpec, ...wolfSpec };
    const hasAtlas = this.textures.exists('wolf');
    // Flash the boss red to signal the summon
    alpha.sprite.setTint(0xff0000);
    this.time.delayedCall(300, () => { if (alpha.state !== 'dead') alpha.sprite.setTint(alpha.baseTint); });
    this.cameras.main.shake(200, 0.007);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 / count) * i + Math.PI * 0.25;
      const sx = alpha.lx + Math.cos(angle) * 90;
      const sy = alpha.ly + Math.sin(angle) * 55;
      const sp = hasAtlas
        ? this.add.sprite(sx, sy, 'wolf', 'wolf_walk_d0_f0').setDisplaySize(80, 80).setOrigin(0.5, 1.0)
        : this.add.sprite(sx, sy, 'enemy_grey_wolf_01').setDisplaySize(70, 70).setOrigin(0.5, 1.0);
      sp.setAlpha(0);
      this.tweens.add({ targets: sp, alpha: 1, duration: 400 });
      this.depthGroup.push(sp);
      const minion: AnimalEntity = {
        sprite: sp, atlasKey: 'wolf', baseTint: 0xffffff, isBoss: false,
        eyeGlow: undefined, summonedMinions: false, displaySize: 80,
        hp: spec.hp, maxHp: spec.hp, dir: 0,
        lx: sx, ly: sy, state: 'circle',
        bobPhase: Math.random() * Math.PI * 2,
        roamCenterX: alpha.lx, roamCenterY: alpha.ly, roamRadius: 150,
        targetLx: sx, targetLy: sy,
        roamChangeMs: 0, hitFlashMs: 0, deathMs: 0, respawnMs: 0,
        spawnLx: sx, spawnLy: sy, biteMs: 0, fleeMs: 0,
        circleAngle: angle, circleDir: i % 2 === 0 ? 1 : -1,
        stateTimer: 800 + i * 400,
        lungeTargetX: 0, lungeTargetY: 0, spec,
      };
      this.animals.push(minion);
    }
  }

  private advanceGoalStage(): void {
    if (this.currentStageIdx >= this.goalStages.length) return;
    const s = this.goalStages[this.currentStageIdx];
    let met = false;
    if (s.type === 'rescueSurvivors') met = this.rescuedCount >= (s.target as number);
    else if (s.type === 'buildStructure') met = this.tentBuilt;
    else if (s.type === 'huntAnimals') met = this.animalsKilled >= (s.target as number);
    if (met) {
      this.currentStageIdx++;
      if (s.completedText) {
        this.stageBannerText = s.completedText;
        this.stageBannerMs = 2500;
      }
      this.checkWin();
    }
  }

  // Gate is at iy=12, opening at ix=8–9 (gate posts), visible gap.
  // Collision corridor is wider than visual (1.5× char width) for playability.
  // Corner assist nudges the player into the opening if they're within 1 tile of it.
  // Projects a screen-space velocity so it cannot push the character through a wall.
  // lx/ly are the character's current screen-space position.
  private projectVelocityFromWalls(velX: number, velY: number, lx: number, ly: number): { vx: number; vy: number } {
    const ox = cfg.originX; const oy = cfg.originY;
    const HW = TILE_W / 2; const HH = TILE_H / 2;
    const BUF = 0.72;
    const GATE_MIN = 7.0; const GATE_MAX = 10.0;

    // Screen → iso velocity
    let vix = (velX / HW + velY / HH) / 2;
    let viy = (-velX / HW + velY / HH) / 2;

    // Current iso position
    const { ix, iy } = screenToIso(lx, ly, ox, oy);

    // North wall
    if (iy <= 3 + BUF && viy < 0) viy = 0;
    // South wall (gate opening ix 7–10 passes freely)
    if (iy >= 12 - BUF && viy > 0) {
      if (ix < GATE_MIN || ix > GATE_MAX) viy = 0;
    }
    // West wall
    if (ix <= 3 + BUF && vix < 0) vix = 0;
    // East wall
    if (ix >= 13 - BUF && vix > 0) vix = 0;

    // Iso → screen velocity
    return {
      vx: (vix - viy) * HW,
      vy: (vix + viy) * HH,
    };
  }

  private wallConstrain(prevSx: number, prevSy: number, newSx: number, newSy: number): { x: number; y: number } {
    const ox = cfg.originX; const oy = cfg.originY;
    const HW = TILE_W / 2; const HH = TILE_H / 2;
    const GATE_MIN = 7.0; const GATE_MAX = 10.0;
    const GATE_CENTER = (GATE_MIN + GATE_MAX) / 2;
    const CORNER_R = 1.1; // iso tiles of corner assist
    const M = 0.65;

    const p = screenToIso(prevSx, prevSy, ox, oy);
    let { ix, iy } = screenToIso(newSx, newSy, ox, oy);

    // North wall
    if ((p.iy >= 3) !== (iy >= 3)) iy = p.iy >= 3 ? 3 + M : 3 - M;

    // South wall (gate at ix 7–10)
    if ((p.iy <= 12) !== (iy <= 12)) {
      if (ix >= GATE_MIN && ix <= GATE_MAX) {
        // Within gate opening — pass through freely
      } else {
        const nearEdge = ix < GATE_MIN ? GATE_MIN : GATE_MAX;
        const distToGate = Math.abs(ix - nearEdge);
        if (distToGate <= CORNER_R) {
          // Corner assist: slide ix toward opening and allow crossing
          ix = ix < GATE_CENTER ? GATE_MIN + 0.12 : GATE_MAX - 0.12;
        } else {
          // Block crossing
          iy = p.iy <= 12 ? 12 - M : 12 + M;
        }
      }
    }

    // West wall
    if ((p.ix >= 3) !== (ix >= 3)) ix = p.ix >= 3 ? 3 + M : 3 - M;
    // East wall
    if ((p.ix <= 13) !== (ix <= 13)) ix = p.ix <= 13 ? 13 - M : 13 + M;

    return { x: ox + (ix - iy) * HW, y: oy + (ix + iy) * HH };
  }

  private constrainToObstacles(sx: number, sy: number): { x: number; y: number } {
    let rx = sx; let ry = sy;
    for (const obs of this.obstacles) {
      const dx = rx - obs.x; const dy = ry - obs.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < obs.r * obs.r && d2 > 0.01) {
        const d = Math.sqrt(d2); rx = obs.x + (dx/d)*obs.r; ry = obs.y + (dy/d)*obs.r;
      }
    }
    return { x: rx, y: ry };
  }
}

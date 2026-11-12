import Phaser from 'phaser';
import { isoToScreen, screenToIso, TILE_W, TILE_H } from '../isoUtils';
import { safePlay, safeAdd } from '../utils/safeMedia';
import { t, tFmt } from '../i18n';
import { PLAYER_SPEED_MULT, WORKER_SPEED_MULT, BASE_WALK_SPEED, PLAYER_ACCEL_MS, PLAYER_DECEL_MS } from '../config/tuning';
import { showRewarded } from '../services/ads';
import { addCoins } from '../services/economy';
import { getEndlessBest, saveEndlessBest } from '../progress';
import { FF, makeButton, drawPanel } from '../ui/theme';

// ── Static map config — larger open snow field, one central fire ──────────────
const MAP = {
  tileW: TILE_W, tileH: TILE_H,
  originX: 400, originY: 240,
  // Map bounds in iso tiles — larger than L15 (which was 10x9 interior; here ~24x24)
  minIx: -10, maxIx: 10,
  minIy: -10, maxIy: 10,
  fireIso: [0, 0] as [number, number],
  playerStartIso: [0, -2] as [number, number],
};

// ── Wave design ────────────────────────────────────────────────────────────────
const WAVE_DURATION_SEC = 120;        // 2 min per wave
const WOLF_BASE_COUNT = 3;
const WOLVES_PER_WAVE = 1;            // +1 wolf / wave (round robin w/ +2 occasionally)
const FUEL_DRAIN_WAVE_MUL = 1.15;     // per wave
const ALPHA_WAVE = 5;                 // beta wolves start
const GRAND_ALPHA_WAVE = 8;           // grandalpha start
const BLIZZARD_CHANCE_PER_WAVE = 0.35;
const BASE_FUEL_DRAIN = 4.0;          // start lenient so bot can refuel
const INITIAL_FUEL = 100;
const FUEL_MAX = 100;
const FUEL_PER_LOG = 22;
const FREEZE_RATE = 5;
const FREEZE_MAX = 100;
const TREE_LOG_COOLDOWN_MS = 6500;
const SURVIVORS_PER_WAVE_MIN = 1;
const SURVIVORS_PER_WAVE_MAX = 3;

const CHAR_SIZE = 76;
const BOB_AMP = 1.5;
const BOB_HZ = 5;

interface TreeNode { sprite: Phaser.GameObjects.Image; onCooldown: boolean; lx: number; ly: number; }

interface Survivor {
  sprite: Phaser.GameObjects.Sprite;
  shadowImg?: Phaser.GameObjects.Image;
  state: 'frozen' | 'following' | 'worker';
  lx: number; ly: number;
  lastDir: number;
  pendingDir: number;
  pendingDirMs: number;
  iceGfx?: Phaser.GameObjects.Graphics;
  // Worker state
  workerState?: 'idle' | 'toTree' | 'chopping' | 'toFire';
  workerTreeIdx?: number;
  workerCarrying: number;
  workerChopMs?: number;
}

interface WolfSpec {
  hp: number; speed: number; aggroSpeed: number;
  aggroRange: number; attackRange: number;
  biteIntervalMs: number; biteDamage: number; knockbackPx: number;
  windupMs: number; lungeSpeedPx: number;
  backoffDistPx: number; backoffSpeedPx: number;
  displayScale: number; furTint: number;
  coinsOnKill: number;
}

interface Wolf {
  sprite: Phaser.GameObjects.Sprite;
  spec: WolfSpec;
  hp: number; maxHp: number;
  lx: number; ly: number;
  dir: number;
  state: 'roam' | 'circle' | 'windup' | 'lunge' | 'backoff' | 'dead';
  stateTimer: number;
  biteMs: number;
  hitFlashMs: number;
  deathMs: number;
  lungeTargetX: number; lungeTargetY: number;
  circleAngle: number; circleDir: number;
  roamChangeMs: number; roamTargetX: number; roamTargetY: number;
  bobPhase: number;
  displaySize: number;
  // Cached last-applied tint — avoid redundant setTint() per frame that marks the
  // quad dirty on every call even for same color. -1 means "no tint applied yet".
  lastTint: number;
  // Cached last-played animation key — avoid per-frame anims.exists + getName lookups.
  lastAnimKey: string;
  // AI tick throttle — off-screen/roam wolves only re-evaluate every ~150ms. Each
  // wolf accumulates delta here; when it crosses the per-state threshold we run
  // AI and reset. Visible/combat states tick every frame.
  aiAccumMs: number;
  // Cached inView bool from last depth/shadow pass — avoids reading x/y twice.
  cachedInView: boolean;
  // Pre-baked shadow Image for this wolf — scaled once, just repositioned each frame.
  shadowImg: Phaser.GameObjects.Image;
}

const WOLF_SPECS: Record<string, WolfSpec> = {
  wolf: {
    hp: 8, speed: 70, aggroSpeed: 118, aggroRange: 230,
    attackRange: 96, biteIntervalMs: 1100, biteDamage: 1, knockbackPx: 150,
    windupMs: 340, lungeSpeedPx: 360, backoffDistPx: 155, backoffSpeedPx: 210,
    displayScale: 1.0, furTint: 0xffffff, coinsOnKill: 8,
  },
  betawolf: {
    hp: 16, speed: 72, aggroSpeed: 120, aggroRange: 240,
    attackRange: 104, biteIntervalMs: 1150, biteDamage: 2, knockbackPx: 190,
    windupMs: 360, lungeSpeedPx: 360, backoffDistPx: 168, backoffSpeedPx: 215,
    displayScale: 1.4, furTint: 0xaaccff, coinsOnKill: 20,
  },
  grandalpha: {
    hp: 30, speed: 60, aggroSpeed: 100, aggroRange: 260,
    attackRange: 120, biteIntervalMs: 1550, biteDamage: 3, knockbackPx: 240,
    windupMs: 580, lungeSpeedPx: 310, backoffDistPx: 195, backoffSpeedPx: 190,
    displayScale: 1.9, furTint: 0xffaa66, coinsOnKill: 40,
  },
};

export default class EndlessScene extends Phaser.Scene {
  // World
  private fireX = 0; private fireY = 0;
  private fireSprite!: Phaser.GameObjects.Image;
  private fireGlow!: Phaser.GameObjects.Image;

  // Player
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerLX = 0; private playerLY = 0;
  private playerVelX = 0; private playerVelY = 0;
  private playerLastDir = 0; private pendingDir = -1; private pendingDirMs = 0;
  private lastVelX = 0; private lastVelY = 0;
  private playerWaddlePhase = 0; private playerBobY = 0;
  private playerHp = 10; private playerHpMax = 10;
  private playerFlashMs = 0;
  private playerKnockVX = 0; private playerKnockVY = 0;
  private playerDead = false;
  private playerAttackMs = 0;
  private carriedLogs = 0;
  private logIcons: Phaser.GameObjects.Image[] = [];
  private playerHpBarGfx!: Phaser.GameObjects.Graphics;

  // Game state
  private trees: TreeNode[] = [];
  private survivors: Survivor[] = [];
  private wolves: Wolf[] = [];
  private depthGroup: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> = [];

  private coins = 0;
  private fuel = INITIAL_FUEL;
  private freezeMeter = 0;
  private gameOver = false;
  private sceneTimeMs = 0;

  // Wave state
  private waveNum = 0;
  private waveTimer = 0;               // ms counting UP toward next wave
  private waveActive = false;
  private survivedSec = 0;
  private revivedThisRun = false;
  private blizzardActiveMs = 0;
  private blizzardCooldownMs = 0;
  private blizzardEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // HUD overlay (own HUD; cannot use UIScene)
  private waveText!: Phaser.GameObjects.Text;
  private timeText!: Phaser.GameObjects.Text;
  private fuelBarGfx!: Phaser.GameObjects.Graphics;
  private coinsText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private waveBanner!: Phaser.GameObjects.Text;
  private waveBannerMs = 0;

  // Input
  private joyActive = false;
  private joyOX = 0; private joyOY = 0; private joyCX = 0; private joyCY = 0;
  private joyGfx!: Phaser.GameObjects.Graphics;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

  // Pooled single-shot emitters
  private woodchipEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private iceShatterEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private slashEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private snowDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shadowGfx!: Phaser.GameObjects.Graphics;       // legacy — kept but no longer redrawn per frame
  private staticShadowGfx!: Phaser.GameObjects.Graphics; // trees + fire — drawn once in create()
  // Pre-baked shadow texture + reusable Image sprites per dynamic entity. Moves
  // the per-frame cost of fillEllipse into native scene-graph positioning.
  private playerShadowImg!: Phaser.GameObjects.Image;

  // Sounds
  private fireSoundRef?: Phaser.Sound.BaseSound;
  private windSoundRef?: Phaser.Sound.BaseSound;

  // Death overlay
  private deathOverlay?: Phaser.GameObjects.Container;

  // Perf caches — populated in create() to avoid per-frame lookups
  private hasWolfAtlas = false;
  // Last-rendered HUD values — skip setText if unchanged (Phaser still hashes).
  private hudLastWave = -1;
  private hudLastSec = -1;
  private hudLastCoins = -1;
  private hudLastHp = -1;
  private hudLastHpMax = -1;
  private hudLastFps = -1;
  private hudLastFuelPct = -1;
  private hudLastFreezePct = -1;
  // Last-set tint per wolf — avoid redundant setTint which marks quads dirty.
  // Stored as a number on the wolf object directly (see _lastTint).

  // Hard cap on concurrent alive wolves to keep perf sane at late waves.
  private static readonly WOLF_HARD_CAP = 10;
  // Despawn distance for non-aggressive roaming wolves.
  private static readonly WOLF_DESPAWN_DIST2 = 1100 * 1100;
  // Distance (squared) within which a wolf updates every frame; outside it
  // throttles to WOLF_FAR_AI_INTERVAL_MS.
  private static readonly WOLF_NEAR_AI_DIST2 = 700 * 700;
  private static readonly WOLF_FAR_AI_INTERVAL_MS = 160;

  // Dir angle table — matches GameScene so sprite frames align
  private static readonly DIR_ANGLES = [90.0, 28.8, 1.3, 334.1, 270.0, 205.9, 178.7, 151.2];

  // Pre-interned animation keys to avoid per-frame string concatenation on the
  // wolf AI hot path. Indexed [0..7].
  private static readonly WOLF_WALK_KEYS = [
    'wolf_walk_d0', 'wolf_walk_d1', 'wolf_walk_d2', 'wolf_walk_d3',
    'wolf_walk_d4', 'wolf_walk_d5', 'wolf_walk_d6', 'wolf_walk_d7',
  ];
  private static readonly WOLF_ATTACK_KEYS = [
    'wolf_attack_d0', 'wolf_attack_d1', 'wolf_attack_d2', 'wolf_attack_d3',
    'wolf_attack_d4', 'wolf_attack_d5', 'wolf_attack_d6', 'wolf_attack_d7',
  ];

  // Depth-sort throttle — only re-emit depth on the moving set every N ms.
  private depthSortMs = 0;
  // Snow dust emission throttle — the original emitted ~2 particles per bob
  // trough (~5Hz), which is a lot of particle churn at 10+ wolves nearby.
  private snowDustAccum = 0;

  // Reused view-rect scratch — avoids closure alloc per frame.
  private viewL = 0; private viewR = 0; private viewT = 0; private viewB = 0;

  constructor() { super({ key: 'EndlessScene' }); }

  // ── preload: reuse GameScene preload asset list ─────────────────────────────
  preload(): void {
    const W = this.scale.width; const H = this.scale.height;
    const CX = W / 2;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(1000);
    bg.fillStyle(0x0a0f1e, 1).fillRect(0, 0, W, H);
    const barW = Math.min(W * 0.72, 300);
    const barH = 14;
    const barX = CX - barW / 2;
    const barY = H / 2 + 20;
    const barBg = this.add.graphics().setScrollFactor(0).setDepth(1001);
    barBg.fillStyle(0x223355, 1).fillRoundedRect(barX, barY, barW, barH, barH / 2);
    const barFill = this.add.graphics().setScrollFactor(0).setDepth(1001);
    const loadText = this.add.text(CX, barY - 18, t('loading'), {
      fontFamily: FF, fontSize: '18px', color: '#aaddff',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1001);
    this.load.on('progress', (v: number) => {
      barFill.clear();
      barFill.fillStyle(0x44aaff, 1).fillRoundedRect(barX, barY, barW * v, barH, barH / 2);
    });
    this.load.on('complete', () => {
      bg.destroy(); barBg.destroy(); barFill.destroy(); loadText.destroy();
    });

    const IMG = [
      'building_cauldron_firepit_01', 'building_tent_canvas_01',
      'effect_blizzard_snow_particles', 'effect_ice_freeze_shatter',
      'prop_snow_pine_tree_01', 'prop_frozen_tree_dead_01', 'prop_rock_cluster_01',
      'prop_barrel_01', 'prop_lantern_post_01', 'prop_igloo_01',
      'tile_snow_drift_mound_01', 'resource_wood_logs_01', 'resource_coin_gold_01',
      'enemy_grey_wolf_01',
    ];
    for (const k of IMG) if (!this.textures.exists(k)) this.load.image(k, `assets/${k}.webp`);

    if (!this.textures.exists('hero'))
      this.load.multiatlas('hero', 'assets/sprites/hero/atlas.json', 'assets/sprites/hero/');
    if (!this.textures.exists('worker'))
      this.load.multiatlas('worker', 'assets/sprites/worker_new/atlas.json', 'assets/sprites/worker_new/');
    if (!this.textures.exists('wolf'))
      this.load.multiatlas('wolf', 'assets/sprites/wolf/atlas.json', 'assets/sprites/wolf/');

    const noAudio = new URLSearchParams(window.location.search).has('noaudio');
    if (!noAudio) {
      const SFX = ['snd_axe_chop', 'snd_log_drop', 'snd_coin_pickup', 'snd_fire_loop', 'snd_wind_loop', 'snd_ice_shatter'];
      for (const k of SFX) if (!this.cache.audio.exists(k)) this.load.audio(k, `assets/audio/${k}.m4a`);
    }
  }

  // ── create ─────────────────────────────────────────────────────────────────
  create(): void {
    // State reset
    this.trees = []; this.survivors = []; this.wolves = []; this.depthGroup = [];
    this.coins = 0; this.fuel = INITIAL_FUEL; this.freezeMeter = 0;
    this.gameOver = false; this.sceneTimeMs = 0;
    this.waveNum = 0; this.waveTimer = 0; this.waveActive = false;
    this.survivedSec = 0; this.revivedThisRun = false;
    this.blizzardActiveMs = 0; this.blizzardCooldownMs = 40_000;
    this.playerHp = 10; this.playerHpMax = 10;
    this.playerDead = false; this.playerFlashMs = 0;
    this.playerVelX = 0; this.playerVelY = 0;
    this.playerKnockVX = 0; this.playerKnockVY = 0;
    this.carriedLogs = 0; this.playerAttackMs = 0;
    // HUD diff cache reset
    this.hudLastWave = -1; this.hudLastSec = -1; this.hudLastCoins = -1;
    this.hudLastHp = -1; this.hudLastHpMax = -1; this.hudLastFps = -1;
    this.hudLastFuelPct = -1; this.hudLastFreezePct = -1;
    // Cache wolf atlas existence (otherwise this.textures.exists runs per wolf per frame)
    this.hasWolfAtlas = this.textures.exists('wolf');

    // Procedural textures
    const makeTex = (key: string, r: number, g: number, b: number, a: number, size: number) => {
      if (this.textures.exists(key)) return;
      const gfx = this.make.graphics({ add: false } as any);
      const half = size / 2;
      gfx.fillStyle(Phaser.Display.Color.GetColor(r, g, b), a).fillCircle(half, half, half - 0.5);
      gfx.generateTexture(key, size, size); gfx.destroy();
    };
    makeTex('snowpuff',  255, 255, 255, 1.0, 9);
    makeTex('frostpuff', 153, 220, 255, 0.85, 9);
    makeTex('woodchip',  160, 100, 40, 1.0, 7);

    if (!this.textures.exists('slashmark')) {
      const sc = document.createElement('canvas');
      sc.width = 32; sc.height = 32;
      const ctx = sc.getContext('2d')!;
      ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.globalAlpha = 0.9;
      [[4,6,18,22],[9,4,23,20],[14,4,26,18]].forEach(([x1,y1,x2,y2]) => {
        ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
      });
      this.textures.addCanvas('slashmark', sc as HTMLCanvasElement);
    }

    // Register animations (hero + worker + wolf)
    const ANIM_DEFS: Record<string, { frames: number; fps: number }> = {
      walk: { frames: 12, fps: 12 }, chop: { frames: 16, fps: 12 },
    };
    for (const char of ['hero', 'worker'] as const) {
      if (!this.textures.exists(char)) continue;
      for (const [anim, { frames: nf, fps }] of Object.entries(ANIM_DEFS)) {
        for (let d = 0; d < 8; d++) {
          const key = `${char}_${anim}_d${d}`;
          if (this.anims.exists(key)) continue;
          this.anims.create({
            key,
            frames: Array.from({ length: nf }, (_, fi) => ({ key: char, frame: `${char}_${anim}_d${d}_f${fi}` })),
            frameRate: fps, repeat: -1,
          });
        }
      }
    }
    if (this.textures.exists('wolf')) {
      const WDEF: Record<string, { frames: number; fps: number; loop: boolean }> = {
        walk: { frames: 12, fps: 12, loop: true },
        attack: { frames: 12, fps: 14, loop: false },
      };
      for (const [anim, { frames: nf, fps, loop }] of Object.entries(WDEF)) {
        for (let d = 0; d < 8; d++) {
          const key = `wolf_${anim}_d${d}`;
          if (this.anims.exists(key)) continue;
          this.anims.create({
            key,
            frames: Array.from({ length: nf }, (_, fi) => ({ key: 'wolf', frame: `wolf_${anim}_d${d}_f${fi}` })),
            frameRate: fps, repeat: loop ? -1 : 0,
          });
        }
      }
    }

    // ── Ground — one big snow plane, cheap scatter decor ─────────────────────
    this.add.graphics().fillStyle(0xd8eaf8, 1).fillRect(-2400, -2400, 5000, 5000).setDepth(-10);
    const snowGfx = this.add.graphics().setDepth(-9);
    for (let i = 0; i < 700; i++) {
      const t2 = (i * 1.618) % 1; const u = (i * 2.718) % 1;
      const sx = -2000 + t2 * 4400; const sy = -2000 + u * 4400;
      snowGfx.fillStyle(0xbbd8f0, 0.06 + (i % 4) * 0.03).fillCircle(sx, sy, 1 + (i % 3) * 0.5);
    }
    // Sparkles
    const sparkGfx = this.add.graphics().setDepth(-8);
    for (let i = 0; i < 220; i++) {
      const t2 = (i * 2.414) % 1; const u = (i * 3.141) % 1;
      const sx = -1800 + t2 * 3600; const sy = -1800 + u * 3600;
      sparkGfx.fillStyle(0xffffff, 0.3 + (i % 5) * 0.12).fillCircle(sx, sy, 1.5 + (i % 3) * 0.5);
    }

    // Camp dirt ring around the fire
    const fi = MAP.fireIso;
    const fp = isoToScreen(fi[0], fi[1], MAP.originX, MAP.originY);
    this.fireX = fp.x; this.fireY = fp.y;
    const CAMP_RING = 220;
    const campGfx = this.add.graphics().setDepth(-5);
    campGfx.fillStyle(0x9a7848, 1).fillEllipse(this.fireX, this.fireY + 10, CAMP_RING * 2.3, CAMP_RING);

    // Fire glow
    if (!this.textures.exists('fire_glow')) {
      const glowSize = 160;
      const gc = document.createElement('canvas'); gc.width = gc.height = glowSize;
      const gCtx = gc.getContext('2d')!;
      const grad = gCtx.createRadialGradient(glowSize/2, glowSize/2, 0, glowSize/2, glowSize/2, glowSize/2);
      grad.addColorStop(0, 'rgba(255,140,20,0.55)');
      grad.addColorStop(0.3, 'rgba(255,80,0,0.30)');
      grad.addColorStop(0.7, 'rgba(255,40,0,0.10)');
      grad.addColorStop(1, 'rgba(255,0,0,0)');
      gCtx.fillStyle = grad; gCtx.fillRect(0, 0, glowSize, glowSize);
      this.textures.addCanvas('fire_glow', gc as HTMLCanvasElement);
    }
    this.fireGlow = this.add.image(this.fireX, this.fireY, 'fire_glow')
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(5).setOrigin(0.5);

    // Fire sprite
    this.fireSprite = this.add.image(this.fireX, this.fireY, 'building_cauldron_firepit_01')
      .setDisplaySize(115, 115).setOrigin(0.5, 0.85);
    this.depthGroup.push(this.fireSprite);

    // Smoke + steam
    this.add.particles(this.fireX, this.fireY - 42, 'snowpuff', {
      speed: { min: 12, max: 26 }, angle: { min: 258, max: 282 },
      scale: { start: 0.22, end: 1.6 }, alpha: { start: 0.48, end: 0 },
      lifespan: 3000, frequency: 480, gravityY: -14, tint: 0xaaaaaa,
    }).setDepth(this.fireY + 8);

    // ── Trees — ring around the fire for log farming ───────────────────────
    const TREE_POSITIONS: [number, number][] = [
      [-3, -3], [3, -3], [-5, 0], [5, 0], [-3, 3], [3, 3],
      [-6, -6], [6, -6], [-6, 6], [6, 6], [0, -7], [0, 7],
    ];
    for (const [tx, ty] of TREE_POSITIONS) {
      const pos = isoToScreen(tx, ty, MAP.originX, MAP.originY);
      const sp = this.add.image(pos.x, pos.y, 'prop_snow_pine_tree_01')
        .setDisplaySize(78, 78).setOrigin(0.5, 0.85);
      this.depthGroup.push(sp);
      this.trees.push({ sprite: sp, onCooldown: false, lx: pos.x, ly: pos.y });
    }

    // ── Decor scatter for atmosphere (outside dirt ring, cheap) ────────────
    let seed = 7919;
    const rng = (): number => { seed = (seed * 1664525 + 1013904223) & 0x7fffffff; return seed / 0x7fffffff; };
    const DECOR_KEYS = ['prop_frozen_tree_dead_01','prop_rock_cluster_01','tile_snow_drift_mound_01','prop_barrel_01'];
    for (let i = 0; i < 70; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 400 + rng() * 700;
      const sx = this.fireX + Math.cos(ang) * rad;
      const sy = this.fireY + Math.sin(ang) * rad * 0.6;
      const key = DECOR_KEYS[Math.floor(rng() * DECOR_KEYS.length)];
      if (!this.textures.exists(key)) continue;
      const ds = this.add.image(sx, sy, key).setDisplaySize(72, 72).setOrigin(0.5, 0.85);
      ds.setDepth(sy);
    }

    // ── Pooled emitters ────────────────────────────────────────────────────
    this.snowDust = this.add.particles(0, 0, 'snowpuff', {
      speed: { min: 18, max: 38 }, angle: { min: 100, max: 260 },
      scale: { start: 0.6, end: 0.08 }, alpha: { start: 0.45, end: 0 },
      lifespan: 280,
    }).setDepth(4);
    this.woodchipEmitter = this.add.particles(0, 0, 'woodchip', {
      speed: { min: 55, max: 140 }, angle: { min: 190, max: 350 },
      scale: { start: 1.1, end: 0.1 }, alpha: { start: 1, end: 0 },
      lifespan: 520, emitting: false,
    }).setDepth(2100);
    this.iceShatterEmitter = this.add.particles(0, 0, 'effect_ice_freeze_shatter', {
      speed: { min: 70, max: 190 }, angle: { min: 0, max: 360 },
      scale: { start: 0.14, end: 0 }, alpha: { start: 1, end: 0 },
      lifespan: 600, emitting: false,
    }).setDepth(2100);
    this.slashEmitter = this.add.particles(0, 0, 'slashmark', {
      speed: { min: 20, max: 60 }, angle: { min: 220, max: 320 },
      scale: { start: 0.9, end: 0.4 }, alpha: { start: 1, end: 0 },
      lifespan: 280, emitting: false,
    }).setDepth(2100);

    // Blizzard emitter — follows the camera, bursts during blizzard events.
    // Uses the 'effect_blizzard_snow_particles' texture; falls back to snowpuff.
    // Freq relaxed from 25 → 55ms (18 particles/s instead of 40) — the storm
    // still reads as heavy but costs 55% less particle churn.
    const blizKey = this.textures.exists('effect_blizzard_snow_particles') ? 'effect_blizzard_snow_particles' : 'snowpuff';
    this.blizzardEmitter = this.add.particles(0, 0, blizKey, {
      speed: { min: 240, max: 420 }, angle: { min: 170, max: 200 },
      scale: { start: 0.35, end: 0.05 }, alpha: { start: 0.6, end: 0 },
      lifespan: 1200, frequency: 55, emitting: false,
    }).setScrollFactor(0).setDepth(3500);

    // Shadow layers — split static (trees + fire, drawn once) from dynamic
    // (player + wolves + survivors, redrawn each frame). Prior impl redrew
    // all ~30 ellipses every frame.
    this.staticShadowGfx = this.add.graphics().setDepth(1);
    this.staticShadowGfx.fillStyle(0x000000, 0.20);
    this.staticShadowGfx.fillEllipse(this.fireX, this.fireY, 62, 24);
    for (const tree of this.trees) {
      this.staticShadowGfx.fillEllipse(tree.lx, tree.ly, 54, 20);
    }
    this.shadowGfx = this.add.graphics().setDepth(2);

    // Pre-render a reusable ellipse shadow texture — dynamic shadows are drawn
    // as Images scaled to the right size, so we never hit the earcut/fillEllipse
    // path per frame (that was eating ~20% CPU in the L15 profile and showed up
    // similarly here).
    if (!this.textures.exists('endless_shadow_tex')) {
      const SW = 64; const SH = 24;
      const sc = document.createElement('canvas');
      sc.width = SW; sc.height = SH;
      const sctx = sc.getContext('2d')!;
      sctx.fillStyle = 'rgba(0,0,0,0.20)';
      sctx.beginPath();
      sctx.ellipse(SW/2, SH/2, SW/2 - 1, SH/2 - 1, 0, 0, Math.PI * 2);
      sctx.fill();
      this.textures.addCanvas('endless_shadow_tex', sc as HTMLCanvasElement);
    }
    // Player shadow — persistent Image we just reposition each frame.
    this.playerShadowImg = this.add.image(0, 0, 'endless_shadow_tex')
      .setDisplaySize(44, 16).setDepth(2);

    // ── Player sprite ──────────────────────────────────────────────────────
    const ps = isoToScreen(MAP.playerStartIso[0], MAP.playerStartIso[1], MAP.originX, MAP.originY);
    this.playerLX = ps.x; this.playerLY = ps.y;
    this.playerSprite = this.textures.exists('hero')
      ? this.add.sprite(ps.x, ps.y, 'hero', 'hero_walk_d0_f0').setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0)
      : this.add.sprite(ps.x, ps.y, '__DEFAULT').setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0);
    this.depthGroup.push(this.playerSprite);
    this.playerHpBarGfx = this.add.graphics().setDepth(1500);

    // Log icons stacked on back
    for (let i = 0; i < 4; i++) {
      this.logIcons.push(
        this.add.image(0, 0, 'resource_wood_logs_01').setDisplaySize(42, 42).setVisible(false).setDepth(1001),
      );
    }

    // ── Camera ─────────────────────────────────────────────────────────────
    this.cameras.main.setZoom(0.7);
    this.cameras.main.setBounds(-2200, -2200, 4800, 4800);
    this.cameras.main.startFollow(this.playerSprite, true, 0.08, 0.08);

    // ── Sounds ─────────────────────────────────────────────────────────────
    if (this.sound.get('snd_fire_loop') === null) {
      this.fireSoundRef = safeAdd(this, 'snd_fire_loop', { loop: true, volume: 0.30 }) ?? undefined;
      this.fireSoundRef?.play();
    }
    if (this.sound.get('snd_wind_loop') === null) {
      this.windSoundRef = safeAdd(this, 'snd_wind_loop', { loop: true, volume: 0.22 }) ?? undefined;
      this.windSoundRef?.play();
    }

    // ── Input: joystick + keyboard ─────────────────────────────────────────
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.joyActive = true; this.joyOX = this.joyCX = p.x; this.joyOY = this.joyCY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.joyActive && p.isDown) { this.joyCX = p.x; this.joyCY = p.y; }
    });
    this.input.on('pointerup', () => { this.joyActive = false; });
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasdKeys = this.input.keyboard!.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as any;

    // ── HUD (own, no UIScene) ──────────────────────────────────────────────
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(2800);
    this.buildHud();

    // Fire first wave sequence — schedule first wave kickoff after 2s intro delay
    this.waveTimer = 0;
    this.scheduleNextWave(true);
  }

  // ── HUD construction ───────────────────────────────────────────────────────
  private buildHud(): void {
    const W = this.scale.width;
    const safeT = Math.max(Math.round(this.scale.height * 0.04), 16);

    this.waveText = this.add.text(12, safeT, tFmt('endlessWave', { n: 1 }), {
      fontFamily: FF, fontSize: '20px', fontStyle: 'bold',
      color: '#ffdd66', stroke: '#2a1800', strokeThickness: 4,
    }).setScrollFactor(0).setDepth(2900);

    this.timeText = this.add.text(12, safeT + 24, '00:00', {
      fontFamily: FF, fontSize: '16px',
      color: '#d8f4ff', stroke: '#001a44', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(2900);

    this.coinsText = this.add.text(W - 12, safeT, '0', {
      fontFamily: FF, fontSize: '18px', fontStyle: 'bold',
      color: '#ffd700', stroke: '#3a2000', strokeThickness: 3,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(2900);

    this.hpText = this.add.text(W - 12, safeT + 22, '10/10', {
      fontFamily: FF, fontSize: '14px',
      color: '#ff8888', stroke: '#330000', strokeThickness: 3,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(2900);

    this.fuelBarGfx = this.add.graphics().setScrollFactor(0).setDepth(2900);

    this.waveBanner = this.add.text(W / 2, this.scale.height * 0.22, '', {
      fontFamily: FF, fontSize: '28px', fontStyle: 'bold',
      color: '#ffaa00', stroke: '#330800', strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(2950).setAlpha(0);

    this.fpsText = this.add.text(W - 12, this.scale.height - 10, '', {
      fontFamily: FF, fontSize: '11px', color: '#88aaaa',
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(2900);
  }

  // ── Wave scheduling ────────────────────────────────────────────────────────
  // Model: a new wave triggers every WAVE_DURATION_SEC. Wolves from the
  // previous wave persist (killed ones don't respawn). waveNum = highest
  // wave number triggered. First wave fires 2s after scene start.
  private scheduleNextWave(first: boolean): void {
    this.waveActive = true; // always "between" waves; used only for HUD banner
    this.waveTimer = first ? 2000 : WAVE_DURATION_SEC * 1000;
  }

  private startWave(): void {
    this.waveNum++;

    // Award end-of-previous-wave coin bonus (for the wave the player survived)
    if (this.waveNum > 1) {
      const bonus = 10 + Math.min(20, (this.waveNum - 1) * 2);
      this.coins += bonus;
      void addCoins(bonus);
    }

    // Spawn wolves — cap total alive to keep perf sane
    const MAX_ALIVE = EndlessScene.WOLF_HARD_CAP;
    // Count alive wolves without allocating via .filter
    let aliveCount = 0;
    for (const w of this.wolves) if (w.state !== 'dead') aliveCount++;
    const slot = Math.max(0, MAX_ALIVE - aliveCount);
    let wolfCount = Math.min(slot, WOLF_BASE_COUNT + Math.floor((this.waveNum - 1) * WOLVES_PER_WAVE));
    for (let i = 0; i < wolfCount; i++) { this.spawnWolf('wolf'); aliveCount++; }

    // Beta wolves from wave ALPHA_WAVE
    if (this.waveNum >= ALPHA_WAVE) {
      const betaCount = Math.min(3, 1 + Math.floor((this.waveNum - ALPHA_WAVE) / 2));
      for (let i = 0; i < betaCount; i++) {
        if (aliveCount >= MAX_ALIVE) break;
        this.spawnWolf('betawolf'); aliveCount++;
      }
    }
    // Grand alphas from wave GRAND_ALPHA_WAVE
    if (this.waveNum >= GRAND_ALPHA_WAVE) {
      const grandCount = Math.min(2, 1 + Math.floor((this.waveNum - GRAND_ALPHA_WAVE) / 3));
      for (let i = 0; i < grandCount; i++) {
        if (aliveCount >= MAX_ALIVE) break;
        this.spawnWolf('grandalpha'); aliveCount++;
      }
    }

    // Spawn frozen survivors around the camp (1-3 per wave)
    const svCount = Phaser.Math.Between(SURVIVORS_PER_WAVE_MIN, SURVIVORS_PER_WAVE_MAX);
    for (let i = 0; i < svCount; i++) this.spawnFrozenSurvivor();

    // Blizzard trigger
    if (Math.random() < BLIZZARD_CHANCE_PER_WAVE && this.waveNum >= 2 && this.blizzardCooldownMs <= 0) {
      this.triggerBlizzard();
    }

    // Banner + alpha announcement
    if (this.waveNum === ALPHA_WAVE || this.waveNum === GRAND_ALPHA_WAVE) {
      this.showBanner(t('endlessAlphasAppear'), 0xff6622);
    } else {
      this.showBanner(tFmt('endlessWaveIncoming', { n: this.waveNum }), 0xffaa00);
    }

    // Schedule the next wave
    this.waveTimer = WAVE_DURATION_SEC * 1000;
  }

  private showBanner(msg: string, color: number): void {
    this.waveBanner.setText(msg).setColor(`#${color.toString(16).padStart(6, '0')}`);
    this.waveBannerMs = 1800;
    this.waveBanner.setAlpha(0);
    this.tweens.add({ targets: this.waveBanner, alpha: 1, duration: 200 });
  }

  private triggerBlizzard(): void {
    this.blizzardActiveMs = 8000;
    this.blizzardCooldownMs = 60_000;
    this.blizzardEmitter.start();
    this.showBanner(t('endlessBlizzard'), 0x88ccff);
  }

  private spawnWolf(kind: 'wolf' | 'betawolf' | 'grandalpha'): void {
    const spec = WOLF_SPECS[kind];
    // Spawn off-camera: random angle, 420-580 px from player
    const ang = Math.random() * Math.PI * 2;
    const r = 420 + Math.random() * 160;
    const sx = this.playerLX + Math.cos(ang) * r;
    const sy = this.playerLY + Math.sin(ang) * r * 0.65;
    const baseSize = 144;
    const displaySize = Math.round(baseSize * spec.displayScale);
    const hasAtlas = this.textures.exists('wolf');
    const sprite = hasAtlas
      ? this.add.sprite(sx, sy, 'wolf', 'wolf_walk_d0_f0').setDisplaySize(displaySize, displaySize).setOrigin(0.5, 1.0)
      : this.add.sprite(sx, sy, 'enemy_grey_wolf_01').setDisplaySize(displaySize * 0.55, displaySize * 0.55).setOrigin(0.5, 1.0);
    if (spec.furTint !== 0xffffff) sprite.setTint(spec.furTint);
    this.depthGroup.push(sprite);

    // Pre-baked shadow — scaled to wolf display size once, repositioned per frame.
    const sScale = spec.displayScale;
    const shadowImg = this.add.image(sx, sy, 'endless_shadow_tex')
      .setDisplaySize(54 * sScale, 20 * sScale).setDepth(2);

    const wolf: Wolf = {
      sprite, spec, hp: spec.hp, maxHp: spec.hp,
      lx: sx, ly: sy, dir: 0,
      state: 'roam', stateTimer: 0, biteMs: 0, hitFlashMs: 0, deathMs: 0,
      lungeTargetX: 0, lungeTargetY: 0,
      circleAngle: 0, circleDir: Math.random() > 0.5 ? 1 : -1,
      roamChangeMs: 0, roamTargetX: sx, roamTargetY: sy,
      bobPhase: Math.random() * Math.PI * 2, displaySize,
      lastTint: spec.furTint, lastAnimKey: '',
      aiAccumMs: 0, cachedInView: false,
      shadowImg,
    };
    this.pickWolfRoam(wolf);
    this.wolves.push(wolf);
  }

  private spawnFrozenSurvivor(): void {
    // Random position in a ring 220-400px from fire
    const ang = Math.random() * Math.PI * 2;
    const r = 260 + Math.random() * 180;
    const sx = this.fireX + Math.cos(ang) * r;
    const sy = this.fireY + Math.sin(ang) * r * 0.65;

    const sprite = this.textures.exists('worker')
      ? this.add.sprite(sx, sy, 'worker', 'worker_walk_d0_f0').setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0).setTint(0x88ccff)
      : this.add.sprite(sx, sy, '__DEFAULT').setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0);
    this.depthGroup.push(sprite);

    const iceGfx = this.add.graphics().setDepth(sy - 1);
    const IW = 56, IH = 72, IXO = 28, IYO = 76;
    iceGfx.fillStyle(0x99ddff, 0.38).lineStyle(2, 0xbbedff, 0.80);
    iceGfx.fillRoundedRect(sx - IXO, sy - IYO, IW, IH, 7);
    iceGfx.strokeRoundedRect(sx - IXO, sy - IYO, IW, IH, 7);

    const shadowImg = this.add.image(sx, sy, 'endless_shadow_tex')
      .setDisplaySize(42, 15).setDepth(2);

    this.survivors.push({
      sprite, shadowImg, state: 'frozen',
      lx: sx, ly: sy,
      lastDir: 4, pendingDir: -1, pendingDirMs: 0,
      iceGfx, workerCarrying: 0,
    });
  }

  // ── Dir helpers ────────────────────────────────────────────────────────────
  private velToDir(velX: number, velY: number): number {
    if (velX * velX + velY * velY < 20 * 20) return -1;
    const angleDeg = (Math.atan2(velY, velX) * 180 / Math.PI + 360) % 360;
    let best = 0, bestDiff = Infinity;
    for (let i = 0; i < 8; i++) {
      const diff = Math.abs(((angleDeg - EndlessScene.DIR_ANGLES[i] + 540) % 360) - 180);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best;
  }

  // Scratch result buffer for stepDir — avoids allocating a 3-field object per
  // entity per frame (player + N survivors + N workers).
  private _dirResult = { lastDir: 0, pendingDir: -1, pendingMs: 0 };
  private stepDir(
    lastDir: number, pendingDir: number, pendingMs: number,
    rawDir: number, delta: number,
  ): { lastDir: number; pendingDir: number; pendingMs: number } {
    const r = this._dirResult;
    if (rawDir < 0 || rawDir === lastDir) {
      r.lastDir = lastDir; r.pendingDir = -1; r.pendingMs = 0;
      return r;
    }
    if (rawDir !== pendingDir) {
      r.lastDir = lastDir; r.pendingDir = rawDir; r.pendingMs = 0;
      return r;
    }
    const ms2 = pendingMs + delta;
    if (ms2 >= 100) {
      r.lastDir = pendingDir; r.pendingDir = -1; r.pendingMs = 0;
      return r;
    }
    r.lastDir = lastDir; r.pendingDir = pendingDir; r.pendingMs = ms2;
    return r;
  }

  // Pre-interned walk/chop anim key tables for hero + worker. Avoids string
  // concat per call on the movement hot path.
  private static readonly HERO_WALK = ['hero_walk_d0','hero_walk_d1','hero_walk_d2','hero_walk_d3','hero_walk_d4','hero_walk_d5','hero_walk_d6','hero_walk_d7'];
  private static readonly HERO_CHOP = ['hero_chop_d0','hero_chop_d1','hero_chop_d2','hero_chop_d3','hero_chop_d4','hero_chop_d5','hero_chop_d6','hero_chop_d7'];
  private static readonly WORKER_WALK = ['worker_walk_d0','worker_walk_d1','worker_walk_d2','worker_walk_d3','worker_walk_d4','worker_walk_d5','worker_walk_d6','worker_walk_d7'];
  private static readonly WORKER_CHOP = ['worker_chop_d0','worker_chop_d1','worker_chop_d2','worker_chop_d3','worker_chop_d4','worker_chop_d5','worker_chop_d6','worker_chop_d7'];
  private static readonly HERO_FRAMES = ['hero_walk_d0_f0','hero_walk_d1_f0','hero_walk_d2_f0','hero_walk_d3_f0','hero_walk_d4_f0','hero_walk_d5_f0','hero_walk_d6_f0','hero_walk_d7_f0'];
  private static readonly WORKER_FRAMES = ['worker_walk_d0_f0','worker_walk_d1_f0','worker_walk_d2_f0','worker_walk_d3_f0','worker_walk_d4_f0','worker_walk_d5_f0','worker_walk_d6_f0','worker_walk_d7_f0'];

  private playCharAnim(sprite: Phaser.GameObjects.Sprite, char: string, anim: string, dir: number): void {
    // Lookup pre-interned key. anims.exists was the single most costly call on
    // some frames — we drop it because create() guarantees the 32 keys exist.
    const key = anim === 'chop'
      ? (char === 'hero' ? EndlessScene.HERO_CHOP[dir] : EndlessScene.WORKER_CHOP[dir])
      : (char === 'hero' ? EndlessScene.HERO_WALK[dir] : EndlessScene.WORKER_WALK[dir]);
    const curAnim = (sprite.anims as any).currentAnim;
    if (!curAnim || curAnim.key !== key) sprite.play(key, true);
  }

  private showStaticFrame(sprite: Phaser.GameObjects.Sprite, char: string, dir: number): void {
    if (sprite.anims.isPlaying) sprite.anims.stop();
    sprite.setFrame(char === 'hero' ? EndlessScene.HERO_FRAMES[dir] : EndlessScene.WORKER_FRAMES[dir]);
  }

  private pickWolfRoam(w: Wolf): void {
    const ang = Math.random() * Math.PI * 2;
    const r = 60 + Math.random() * 180;
    w.roamTargetX = w.lx + Math.cos(ang) * r;
    w.roamTargetY = w.ly + Math.sin(ang) * r;
    w.roamChangeMs = 3000 + Math.random() * 4000;
  }

  // ── update loop ────────────────────────────────────────────────────────────
  update(time: number, delta: number): void {
    if (this.gameOver) return;
    const dt = delta / 1000;
    this.sceneTimeMs += delta;
    this.survivedSec = this.sceneTimeMs / 1000;

    // Wave timer — counts down to next wave trigger
    this.waveTimer -= delta;
    if (this.waveTimer <= 0) this.startWave();
    if (this.waveBannerMs > 0) {
      this.waveBannerMs = Math.max(0, this.waveBannerMs - delta);
      if (this.waveBannerMs <= 300) this.waveBanner.setAlpha(this.waveBannerMs / 300);
    }

    // Blizzard
    if (this.blizzardActiveMs > 0) {
      this.blizzardActiveMs = Math.max(0, this.blizzardActiveMs - delta);
      // Keep emitter positioned over screen
      const cam = this.cameras.main;
      this.blizzardEmitter.setPosition(cam.width * 1.1, 0);
      if (this.blizzardActiveMs <= 0) this.blizzardEmitter.stop();
    } else if (this.blizzardCooldownMs > 0) {
      this.blizzardCooldownMs = Math.max(0, this.blizzardCooldownMs - delta);
    }

    // Player revive timer / death handling
    if (this.playerDead) {
      // We don't auto-respawn. We wait for death overlay interaction.
      this.updateHud(delta);
      return;
    }

    // Hit flash — only toggle tint on state transitions, not every frame.
    if (this.playerFlashMs > 0) {
      const wasFlashing = this.playerFlashMs > 0;
      this.playerFlashMs = Math.max(0, this.playerFlashMs - delta);
      if (wasFlashing && this.playerFlashMs <= 0) this.playerSprite.clearTint();
    }
    // Knockback decay
    if (this.playerKnockVX !== 0 || this.playerKnockVY !== 0) {
      const decay = Math.min(1, delta / 100);
      this.playerKnockVX *= (1 - decay); this.playerKnockVY *= (1 - decay);
      if (Math.abs(this.playerKnockVX) < 3) this.playerKnockVX = 0;
      if (Math.abs(this.playerKnockVY) < 3) this.playerKnockVY = 0;
    }

    // Input
    let targetVelX = 0, targetVelY = 0;
    const baseSpeed = 120 * PLAYER_SPEED_MULT;
    if (this.joyActive) {
      const dx = this.joyCX - this.joyOX; const dy = this.joyCY - this.joyOY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 12) { const inv = baseSpeed / len; targetVelX = dx * inv; targetVelY = dy * inv; }
    }
    const kL = this.cursors.left.isDown || this.wasdKeys.left.isDown;
    const kR = this.cursors.right.isDown || this.wasdKeys.right.isDown;
    const kU = this.cursors.up.isDown || this.wasdKeys.up.isDown;
    const kD = this.cursors.down.isDown || this.wasdKeys.down.isDown;
    const kx = (kR ? 1 : 0) - (kL ? 1 : 0);
    const ky = (kD ? 1 : 0) - (kU ? 1 : 0);
    if (kx !== 0 || ky !== 0) {
      const klen = Math.sqrt(kx * kx + ky * ky);
      targetVelX = (kx / klen) * baseSpeed;
      targetVelY = (ky / klen) * baseSpeed;
    }

    const hasInput = targetVelX !== 0 || targetVelY !== 0;
    const tConst = hasInput ? PLAYER_ACCEL_MS : PLAYER_DECEL_MS;
    const lFactor = 1 - Math.exp(-delta / tConst);
    this.playerVelX += (targetVelX - this.playerVelX) * lFactor;
    this.playerVelY += (targetVelY - this.playerVelY) * lFactor;
    if (!hasInput && Math.abs(this.playerVelX) < 4) this.playerVelX = 0;
    if (!hasInput && Math.abs(this.playerVelY) < 4) this.playerVelY = 0;

    const velX = this.playerVelX + (hasInput ? 0 : this.playerKnockVX);
    const velY = this.playerVelY + (hasInput ? 0 : this.playerKnockVY);
    const isMoving = velX !== 0 || velY !== 0;
    if (hasInput) { this.lastVelX = targetVelX; this.lastVelY = targetVelY; }

    this.playerLX += velX * dt;
    this.playerLY += velY * dt;

    // Keep player in map bounds (soft)
    const pIso = screenToIso(this.playerLX, this.playerLY, MAP.originX, MAP.originY);
    if (pIso.ix < MAP.minIx || pIso.ix > MAP.maxIx || pIso.iy < MAP.minIy || pIso.iy > MAP.maxIy) {
      const cx = Phaser.Math.Clamp(pIso.ix, MAP.minIx, MAP.maxIx);
      const cy = Phaser.Math.Clamp(pIso.iy, MAP.minIy, MAP.maxIy);
      const bp = isoToScreen(cx, cy, MAP.originX, MAP.originY);
      this.playerLX = bp.x; this.playerLY = bp.y;
    }

    // Bob
    if (isMoving) this.playerWaddlePhase += dt * BOB_HZ * Math.PI * 2;
    this.playerBobY = isMoving ? Math.sin(this.playerWaddlePhase) * BOB_AMP : 0;

    const pvx = isMoving ? this.playerVelX : this.lastVelX;
    const pvy = isMoving ? this.playerVelY : this.lastVelY;
    const rawDir = this.velToDir(pvx, pvy);
    const pds = this.stepDir(this.playerLastDir, this.pendingDir, this.pendingDirMs, rawDir, delta);
    this.playerLastDir = pds.lastDir; this.pendingDir = pds.pendingDir; this.pendingDirMs = pds.pendingMs;
    if (isMoving) {
      this.playCharAnim(this.playerSprite, 'hero', 'walk', this.playerLastDir);
      const spd = Math.sqrt(this.playerVelX * this.playerVelX + this.playerVelY * this.playerVelY);
      if (spd > 0) this.playerSprite.anims.timeScale = spd / BASE_WALK_SPEED;
    } else {
      this.showStaticFrame(this.playerSprite, 'hero', this.playerLastDir);
      this.playerSprite.anims.timeScale = 1;
    }
    this.playerSprite.x = this.playerLX;
    this.playerSprite.y = this.playerLY + this.playerBobY;

    // Snow dust on step — throttle to at most every 180ms so we don't flood the
    // particle system at wave 5+ when the player is constantly moving.
    this.snowDustAccum = Math.max(0, this.snowDustAccum - delta);
    if (isMoving && this.snowDustAccum <= 0 && Math.abs(Math.sin(this.playerWaddlePhase)) < 0.1) {
      const normLen = Math.sqrt(velX * velX + velY * velY);
      if (normLen > 0) this.snowDust.emitParticleAt(
        this.playerLX - (velX / normLen) * 10, this.playerLY - (velY / normLen) * 6, 1,
      );
      this.snowDustAccum = 180;
    }

    // Log icons stacked on back — only touch visible icons; and only when we
    // actually carry logs. Prior impl set 4 invisible icons every frame.
    if (this.carriedLogs > 0) {
      const backOffX = (this.playerLastDir >= 2 && this.playerLastDir <= 4) ? 6 : -6;
      const baseY = this.playerLY + this.playerBobY - 58;
      const baseDepth = this.playerSprite.depth - 1;
      for (let i = 0; i < 4; i++) {
        const show = i < this.carriedLogs;
        if (this.logIcons[i].visible !== show) this.logIcons[i].setVisible(show);
        if (show) {
          this.logIcons[i].setPosition(this.playerLX + backOffX, baseY - i * 14);
          this.logIcons[i].setDepth(baseDepth + i);
        }
      }
    } else if (this.logIcons[0].visible) {
      // Hide once when we drop logs
      for (let i = 0; i < 4; i++) this.logIcons[i].setVisible(false);
    }

    // ── Tree collection ─────────────────────────────────────────────────────
    const COLLECT_RANGE = 82; const DROP_RANGE = 90;
    for (const tree of this.trees) {
      const dx = this.playerLX - tree.lx; const dy = this.playerLY - tree.ly;
      if (dx * dx + dy * dy < COLLECT_RANGE * COLLECT_RANGE && !tree.onCooldown && this.carriedLogs < 4) {
        this.carriedLogs++;
        tree.onCooldown = true;
        this.time.delayedCall(TREE_LOG_COOLDOWN_MS, () => { tree.onCooldown = false; });
        const fi2 = this.add.image(tree.lx, tree.ly - 20, 'resource_wood_logs_01')
          .setDisplaySize(28, 28).setAlpha(0).setDepth(2000);
        this.tweens.add({ targets: fi2, y: tree.ly - 72, alpha: { from: 1, to: 0 }, duration: 900, onComplete: () => fi2.destroy() });
      }
    }

    // ── Fire drop ───────────────────────────────────────────────────────────
    const fdx = this.playerLX - this.fireX; const fdy = this.playerLY - this.fireY;
    if (this.carriedLogs > 0 && fdx * fdx + fdy * fdy < DROP_RANGE * DROP_RANGE) {
      const n = this.carriedLogs;
      this.fuel = Math.min(FUEL_MAX, this.fuel + FUEL_PER_LOG * n);
      this.coins += 3 * n;
      this.carriedLogs = 0;
      safePlay(this, 'snd_log_drop', { volume: 0.65 });
      this.time.delayedCall(250, () => safePlay(this, 'snd_coin_pickup', { volume: 0.55 }));
      this.tweens.add({
        targets: this.fireSprite,
        scaleX: { from: this.fireSprite.scaleX * 1.18, to: this.fireSprite.scaleX },
        scaleY: { from: this.fireSprite.scaleY * 1.18, to: this.fireSprite.scaleY },
        duration: 240, ease: 'Back.Out',
      });
    }

    // ── Fuel + freeze (scaled by wave) ─────────────────────────────────────
    const drainScale = Math.pow(FUEL_DRAIN_WAVE_MUL, Math.max(0, this.waveNum - 1));
    const blizzardMul = this.blizzardActiveMs > 0 ? 2.2 : 1.0;
    this.fuel = Math.max(0, this.fuel - BASE_FUEL_DRAIN * drainScale * blizzardMul * dt);
    if (this.fuel === 0) {
      this.freezeMeter += FREEZE_RATE * dt;
      if (this.freezeMeter >= FREEZE_MAX) { this.triggerDeath(); return; }
    } else {
      this.freezeMeter = Math.max(0, this.freezeMeter - 2 * dt);
    }

    // HP regen near fire
    if (this.playerHp < this.playerHpMax) {
      if ((this.playerLX - this.fireX) ** 2 + (this.playerLY - this.fireY) ** 2 < 180 * 180) {
        this.playerHp = Math.min(this.playerHpMax, this.playerHp + 0.35 * dt);
      }
    }

    // ── Survivors (frozen → follow → worker) ───────────────────────────────
    const THAW_RANGE = 90;
    for (const sv of this.survivors) {
      if (sv.state === 'frozen') {
        const ddx = this.playerLX - sv.lx; const ddy = this.playerLY - sv.ly;
        if (ddx * ddx + ddy * ddy < THAW_RANGE * THAW_RANGE) {
          sv.state = 'following';
          sv.iceGfx?.destroy(); sv.iceGfx = undefined;
          sv.sprite.clearTint();
          this.iceShatterEmitter.emitParticleAt(sv.lx, sv.ly - 38, 18);
          safePlay(this, 'snd_ice_shatter', { volume: 0.6 });
        }
      }
    }

    // Trail follow single-file
    let trailX = this.playerLX, trailY = this.playerLY;
    const TRAIL_SPACING = 64;
    for (const sv of this.survivors) {
      if (sv.state !== 'following') continue;
      const dx = trailX - sv.lx; const dy = trailY - sv.ly;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > TRAIL_SPACING) {
        const spd = 80 * WORKER_SPEED_MULT;
        const mv = Math.min(d - TRAIL_SPACING, spd * dt);
        sv.lx += (dx / d) * mv; sv.ly += (dy / d) * mv;
      }
      // Dir
      const svRawDir = this.velToDir(dx, dy);
      const svDs = this.stepDir(sv.lastDir, sv.pendingDir, sv.pendingDirMs, svRawDir, delta);
      sv.lastDir = svDs.lastDir; sv.pendingDir = svDs.pendingDir; sv.pendingDirMs = svDs.pendingMs;
      if (d > TRAIL_SPACING * 0.5) this.playCharAnim(sv.sprite, 'worker', 'walk', sv.lastDir);
      else this.showStaticFrame(sv.sprite, 'worker', sv.lastDir);
      sv.sprite.setPosition(sv.lx, sv.ly);
      // If reached fire → become worker
      if ((sv.lx - this.fireX) ** 2 + (sv.ly - this.fireY) ** 2 < 110 * 110) {
        sv.state = 'worker'; sv.workerState = 'idle'; sv.workerCarrying = 0;
      }
      trailX = sv.lx; trailY = sv.ly;
    }

    // Workers (simple loop: pick random tree → walk → chop → to fire → deposit)
    for (const sv of this.survivors) {
      if (sv.state !== 'worker') continue;
      this.updateWorker(sv, dt, delta);
    }

    // ── Player attack (nearest wolf in range) ──────────────────────────────
    this.playerAttackMs = Math.max(0, this.playerAttackMs - delta);
    if (this.playerAttackMs <= 0) {
      let nearest: Wolf | null = null; let nd2 = Infinity;
      for (const w of this.wolves) {
        if (w.state === 'dead') continue;
        const d2 = (this.playerLX - w.lx) ** 2 + (this.playerLY - w.ly) ** 2;
        if (d2 < 100 * 100 && d2 < nd2) { nd2 = d2; nearest = w; }
      }
      if (nearest) {
        const w = nearest;
        const toDir = this.velToDir(w.lx - this.playerLX, w.ly - this.playerLY);
        if (toDir >= 0) this.playerLastDir = toDir;
        this.playerAttackMs = 900;
        this.playCharAnim(this.playerSprite, 'hero', 'chop', this.playerLastDir);
        const target = w;
        this.time.delayedCall(220, () => {
          if (this.gameOver || target.state === 'dead') return;
          safePlay(this, 'snd_axe_chop', { volume: 0.55 });
          target.hp--; target.hitFlashMs = 180;
          this.woodchipEmitter.emitParticleAt(target.lx, target.ly - 20, 8);
          if (target.state === 'lunge') { target.state = 'backoff'; target.stateTimer = 500; }
          else { target.state = 'backoff'; target.stateTimer = 400; }
          if (target.hp <= 0) this.killWolf(target);
        });
        this.time.delayedCall(820, () => {
          if (!this.gameOver && !this.playerDead) this.playCharAnim(this.playerSprite, 'hero', 'walk', this.playerLastDir);
        });
      }
    }

    // ── Wolves AI ──────────────────────────────────────────────────────────
    this.updateWolves(delta, dt, time);

    // ── Shadows ─────────────────────────────────────────────────────────────
    // Reuse scratch view-rect (populated once/frame, no closure alloc).
    const cam = this.cameras.main;
    const camLeft = cam.scrollX - 100;
    const camRight = cam.scrollX + cam.width / cam.zoom + 100;
    const camTop = cam.scrollY - 100;
    const camBottom = cam.scrollY + cam.height / cam.zoom + 100;
    this.viewL = camLeft; this.viewR = camRight; this.viewT = camTop; this.viewB = camBottom;

    // Dynamic shadows — pre-baked Image sprites per entity, just repositioned
    // and visibility-toggled per frame. No fillEllipse / earcut cost.
    this.playerShadowImg.setPosition(this.playerLX, this.playerLY);
    for (let si = 0; si < this.survivors.length; si++) {
      const sv = this.survivors[si];
      const vis = sv.lx >= camLeft && sv.lx <= camRight && sv.ly >= camTop && sv.ly <= camBottom;
      if (sv.shadowImg) {
        if (sv.shadowImg.visible !== vis) sv.shadowImg.setVisible(vis);
        if (vis) sv.shadowImg.setPosition(sv.lx, sv.ly);
      }
    }
    for (let wi = 0; wi < this.wolves.length; wi++) {
      const w = this.wolves[wi];
      const alive = w.state !== 'dead';
      const vis = alive && w.cachedInView;
      if (w.shadowImg.visible !== vis) w.shadowImg.setVisible(vis);
      if (vis) w.shadowImg.setPosition(w.lx, w.ly);
    }

    // ── Player HP bar ──────────────────────────────────────────────────────
    this.playerHpBarGfx.clear();
    if (this.playerHp < this.playerHpMax) {
      const bw = 44; const bx = this.playerLX - bw / 2;
      const by = this.playerLY + this.playerBobY - CHAR_SIZE - 10 - (this.carriedLogs > 0 ? this.carriedLogs * 14 + 20 : 0);
      this.playerHpBarGfx.fillStyle(0x222222, 0.8).fillRoundedRect(bx - 1, by - 1, bw + 2, 8, 3);
      const pct = this.playerHp / this.playerHpMax;
      const col = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2222;
      this.playerHpBarGfx.fillStyle(col, 1).fillRoundedRect(bx, by, Math.max(0, bw * pct), 6, 2);
    }

    // ── Fire glow anim — throttle to every ~100ms. The flicker is eye-candy;
    // 10Hz is indistinguishable from 60Hz and saves a setScale WebGL quad
    // dirty every frame.
    if ((this.sceneTimeMs | 0) % 96 < delta) {
      const fuelPct = this.fuel / FUEL_MAX;
      const flicker = 0.9 + 0.2 * Math.sin(time / 180) + 0.1 * Math.sin(time / 73);
      this.fireGlow.setScale((0.6 + fuelPct * 0.8) * flicker).setAlpha(0.4 + fuelPct * 0.5);
      const fSnd = this.fireSoundRef as Phaser.Sound.WebAudioSound;
      if (fSnd?.setVolume) fSnd.setVolume(0.08 + fuelPct * 0.38);
    }

    // ── Depth sort — throttle to ~15Hz. The isometric depth is driven by y,
    // which only changes meaningfully on sub-tile movement; redoing every frame
    // was pointless.
    this.depthSortMs += delta;
    if (this.depthSortMs >= 66) {
      this.depthSortMs = 0;
      const dg = this.depthGroup;
      const fireRef = this.fireSprite;
      for (let di = 0; di < dg.length; di++) {
        const sp = dg[di];
        const x = sp.x; const y = sp.y;
        if (x < camLeft || x > camRight || y < camTop || y > camBottom) continue;
        // Bucket y into 2-px buckets — sub-pixel bob causes cache miss otherwise.
        const by2 = y | 0;
        if ((sp as any)._lastDepthY === by2) continue;
        (sp as any)._lastDepthY = by2;
        sp.setDepth(sp === fireRef ? y + 17 : y);
      }
    }

    // HUD + joystick render
    this.updateHud(delta);
    this.renderJoystick();
  }

  // Scratch for worker moveToward — avoids closure allocation per worker/frame.
  private _wMoveD = 0;
  private _workerMoveTo(sv: Survivor, tx: number, ty: number, dt: number, delta: number, speed: number): void {
    const dx = tx - sv.lx; const dy = ty - sv.ly;
    const d = Math.sqrt(dx * dx + dy * dy);
    this._wMoveD = d;
    if (d > 2) {
      const mv = Math.min(d, speed * dt);
      sv.lx += (dx / d) * mv; sv.ly += (dy / d) * mv;
    }
    const rd = this.velToDir(dx, dy);
    const sd = this.stepDir(sv.lastDir, sv.pendingDir, sv.pendingDirMs, rd, delta);
    sv.lastDir = sd.lastDir; sv.pendingDir = sd.pendingDir; sv.pendingDirMs = sd.pendingMs;
    if (d > 4) this.playCharAnim(sv.sprite, 'worker', 'walk', sv.lastDir);
    else this.showStaticFrame(sv.sprite, 'worker', sv.lastDir);
    sv.sprite.setPosition(sv.lx, sv.ly);
  }

  private updateWorker(sv: Survivor, dt: number, delta: number): void {
    if (!sv.workerState) sv.workerState = 'idle';
    const WORKER_SPEED = 78 * WORKER_SPEED_MULT;

    if (sv.workerState === 'idle') {
      // Pick a random tree
      if (this.trees.length > 0) {
        sv.workerTreeIdx = Math.floor(Math.random() * this.trees.length);
        sv.workerState = 'toTree';
      }
    }
    if (sv.workerState === 'toTree') {
      const t2 = this.trees[sv.workerTreeIdx ?? 0];
      if (!t2) { sv.workerState = 'idle'; return; }
      this._workerMoveTo(sv, t2.lx, t2.ly, dt, delta, WORKER_SPEED);
      if (this._wMoveD < 60) {
        sv.workerState = 'chopping'; sv.workerChopMs = 5500;
        this.playCharAnim(sv.sprite, 'worker', 'chop', sv.lastDir);
      }
    } else if (sv.workerState === 'chopping') {
      sv.workerChopMs = (sv.workerChopMs ?? 0) - delta;
      if ((sv.workerChopMs ?? 0) <= 0) {
        sv.workerCarrying++;
        sv.workerState = 'toFire';
      }
    } else if (sv.workerState === 'toFire') {
      this._workerMoveTo(sv, this.fireX, this.fireY - 10, dt, delta, WORKER_SPEED);
      if (this._wMoveD < 70) {
        if (sv.workerCarrying > 0) {
          this.fuel = Math.min(FUEL_MAX, this.fuel + FUEL_PER_LOG * sv.workerCarrying);
          sv.workerCarrying = 0;
        }
        sv.workerState = 'idle';
      }
    }
  }

  // Cached tint set — Phaser.setTint marks the WebGL quad dirty even when color
  // is unchanged. Bypassing redundant calls saves meaningful draw-batch work at
  // 18+ wolves × 60 Hz.
  private setWolfTint(w: Wolf, tint: number): void {
    if (w.lastTint === tint) return;
    w.lastTint = tint;
    w.sprite.setTint(tint);
  }

  // ── Wolf AI ────────────────────────────────────────────────────────────────
  private updateWolves(delta: number, dt: number, _time: number): void {
    const cam = this.cameras.main;
    const camLeft = cam.scrollX - 150;
    const camRight = cam.scrollX + cam.width / cam.zoom + 150;
    const camTop = cam.scrollY - 150;
    const camBottom = cam.scrollY + cam.height / cam.zoom + 150;
    // Cache atlas existence (don't hash-lookup per wolf per frame)
    const hasAtlas = this.hasWolfAtlas;
    // Pre-compute aggro-cull squared radius multiplier
    const DESPAWN_D2 = EndlessScene.WOLF_DESPAWN_DIST2;
    const NEAR_D2 = EndlessScene.WOLF_NEAR_AI_DIST2;
    const FAR_AI_MS = EndlessScene.WOLF_FAR_AI_INTERVAL_MS;

    // Iterate with for-i so we can splice-free remove at the end. We collect
    // destroyed indices and compact in one pass to avoid per-element splices.
    let writeIdx = 0;
    for (let ri = 0; ri < this.wolves.length; ri++) {
      const w = this.wolves[ri];

      if (w.state === 'dead') {
        if (w.deathMs > 0) {
          w.deathMs = Math.max(0, w.deathMs - delta);
          if (w.sprite.active) {
            w.sprite.setAlpha(w.deathMs / 600).setAngle(w.sprite.angle + delta * 0.12);
            w.shadowImg.setAlpha(w.deathMs / 600);
            if (w.deathMs <= 0) {
              const di = this.depthGroup.indexOf(w.sprite);
              if (di >= 0) this.depthGroup.splice(di, 1);
              w.sprite.destroy();
              w.shadowImg.destroy();
              continue; // drop from wolves list (writeIdx not advanced)
            }
          }
        } else {
          continue; // drop stale dead entries
        }
        // keep in list while death anim plays
        if (writeIdx !== ri) this.wolves[writeIdx] = w;
        writeIdx++;
        continue;
      }

      // Squared distance — cheaper than sqrt, and most state checks use squared radii.
      const dpx = this.playerLX - w.lx;
      const dpy = this.playerLY - w.ly;
      const d2ToPlayer = dpx * dpx + dpy * dpy;

      // Despawn stale far roamers that will never catch up.
      if (w.state === 'roam' && d2ToPlayer > DESPAWN_D2) {
        const di = this.depthGroup.indexOf(w.sprite);
        if (di >= 0) this.depthGroup.splice(di, 1);
        w.sprite.destroy();
        w.shadowImg.destroy();
        continue;
      }

      // Off-screen + far from player: throttle AI to FAR_AI_MS. Wolves pending
      // a tick accumulate delta; wolves that just fired a tick on this frame get
      // a `thisFrameDt` matching the accumulated interval (not raw delta).
      const inViewHere = w.lx >= camLeft && w.lx <= camRight && w.ly >= camTop && w.ly <= camBottom;
      w.cachedInView = inViewHere;
      const isCombat = (w.state !== 'roam');
      const canThrottle = !inViewHere && !isCombat && d2ToPlayer > NEAR_D2;
      if (canThrottle) {
        w.aiAccumMs += delta;
        if (w.aiAccumMs < FAR_AI_MS) {
          if (writeIdx !== ri) this.wolves[writeIdx] = w;
          writeIdx++;
          continue;
        }
      }
      const effDelta = canThrottle ? w.aiAccumMs : delta;
      const effDt = effDelta / 1000;
      w.aiAccumMs = 0;

      // Off-screen roam: skip full AI (cheap heartbeat only).
      if (w.state === 'roam' && !inViewHere) {
        const aggroExt = w.spec.aggroRange * 1.8;
        if (d2ToPlayer > aggroExt * aggroExt) {
          w.roamChangeMs = Math.max(0, w.roamChangeMs - effDelta);
          if (writeIdx !== ri) this.wolves[writeIdx] = w;
          writeIdx++;
          continue;
        }
      }

      const prevLx = w.lx; const prevLy = w.ly;
      // Squared check for state transitions that compare against aggroRange*k
      const aggroRange = w.spec.aggroRange;
      const aggroR2 = aggroRange * aggroRange;

      if (w.state === 'circle') {
        w.circleAngle += w.circleDir * 0.9 * effDt;
        const tx = this.playerLX + Math.cos(w.circleAngle) * 140;
        const ty = this.playerLY + Math.sin(w.circleAngle) * 140 * 0.5;
        const dx = tx - w.lx; const dy = ty - w.ly;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 4) { w.lx += (dx / d) * w.spec.aggroSpeed * 0.75 * effDt; w.ly += (dy / d) * w.spec.aggroSpeed * 0.75 * effDt; }
        if (w.hitFlashMs <= 0) this.setWolfTint(w, 0xffccaa);
        w.stateTimer = Math.max(0, w.stateTimer - effDelta);
        if (w.stateTimer <= 0) { w.state = 'windup'; w.stateTimer = w.spec.windupMs; w.lungeTargetX = this.playerLX; w.lungeTargetY = this.playerLY; }
        else if (d2ToPlayer > aggroR2 * 6.25) { // (2.5)^2 = 6.25
          w.state = 'roam'; this.setWolfTint(w, w.spec.furTint); this.pickWolfRoam(w);
        }
      } else if (w.state === 'windup') {
        w.stateTimer = Math.max(0, w.stateTimer - effDelta);
        const prog = 1 - w.stateTimer / w.spec.windupMs;
        const bs = w.displaySize / 192;
        const crouch = 1 - 0.12 * Math.sin(prog * Math.PI);
        w.sprite.setScale(bs * (2 - crouch), bs * crouch);
        if (w.hitFlashMs <= 0) this.setWolfTint(w, 0xff8844);
        w.lungeTargetX = this.playerLX; w.lungeTargetY = this.playerLY;
        if (w.stateTimer <= 0) {
          w.state = 'lunge'; w.stateTimer = 500;
          w.sprite.setDisplaySize(w.displaySize, w.displaySize);
        }
      } else if (w.state === 'lunge') {
        w.stateTimer = Math.max(0, w.stateTimer - effDelta);
        const dx = w.lungeTargetX - w.lx; const dy = w.lungeTargetY - w.ly;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 10) { w.lx += (dx / d) * w.spec.lungeSpeedPx * effDt; w.ly += (dy / d) * w.spec.lungeSpeedPx * effDt; }
        if (w.hitFlashMs <= 0) this.setWolfTint(w, 0xff4422);
        w.biteMs = Math.max(0, w.biteMs - effDelta);
        const biteR = w.spec.attackRange * 0.8;
        if (!this.playerDead && w.biteMs <= 0 && d2ToPlayer < biteR * biteR) {
          w.biteMs = w.spec.biteIntervalMs;
          this.hitPlayer(w);
          w.state = 'backoff'; w.stateTimer = 500;
        } else if (w.stateTimer <= 0 || d < 8) { w.state = 'backoff'; w.stateTimer = 450; }
      } else if (w.state === 'backoff') {
        w.stateTimer = Math.max(0, w.stateTimer - effDelta);
        const dx = w.lx - this.playerLX; const dy = w.ly - this.playerLY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < w.spec.backoffDistPx && d > 1) {
          w.lx += (dx / d) * w.spec.backoffSpeedPx * effDt;
          w.ly += (dy / d) * w.spec.backoffSpeedPx * effDt;
        }
        if (w.hitFlashMs <= 0) this.setWolfTint(w, 0xffccaa);
        if (w.stateTimer <= 0) {
          w.state = 'circle';
          w.circleAngle = Math.atan2(w.ly - this.playerLY, w.lx - this.playerLX);
          w.circleDir = Math.random() > 0.5 ? 1 : -1;
          w.stateTimer = 300 + Math.random() * 400;
        }
      } else {
        // Roam
        w.roamChangeMs = Math.max(0, w.roamChangeMs - effDelta);
        if (w.roamChangeMs <= 0) this.pickWolfRoam(w);
        const dx = w.roamTargetX - w.lx; const dy = w.roamTargetY - w.ly;
        const d2 = dx * dx + dy * dy;
        if (d2 > 64) { const d = Math.sqrt(d2); w.lx += (dx / d) * w.spec.speed * effDt; w.ly += (dy / d) * w.spec.speed * effDt; }
        if (d2ToPlayer < aggroR2) {
          w.state = 'circle';
          w.circleAngle = Math.atan2(w.ly - this.playerLY, w.lx - this.playerLX);
          w.circleDir = Math.random() > 0.5 ? 1 : -1;
          w.stateTimer = 800 + Math.random() * 1200;
        }
      }

      // Animation + dir — only touch anim system when the target key actually
      // changed. Uses pre-interned key tables (no string concat on hot path).
      if (hasAtlas) {
        const mvdx = w.lx - prevLx; const mvdy = w.ly - prevLy;
        const rd = this.velToDir(mvdx * 20, mvdy * 20);
        if (rd >= 0) w.dir = rd;
        const attackState = (w.state === 'lunge' || w.state === 'windup');
        const want = attackState
          ? EndlessScene.WOLF_ATTACK_KEYS[w.dir]
          : EndlessScene.WOLF_WALK_KEYS[w.dir];
        if (w.lastAnimKey !== want) {
          // Fallback path extremely rare — attack anims always registered in create().
          // We optimistically play `want`; Phaser throws if missing, but this is 8 dirs
          // × 2 states = 16 pre-created in create(), so `want` is always valid.
          w.sprite.play(want, true);
          w.lastAnimKey = want;
        }
      }

      // Bob (except windup where we scale). Only bob when in view — off-screen
      // wolves don't need Math.sin per frame.
      if (w.state !== 'windup') {
        if (inViewHere) {
          w.bobPhase += effDt * 4.5;
          w.sprite.setPosition(w.lx, w.ly + Math.sin(w.bobPhase) * 2.5);
        } else {
          w.sprite.setPosition(w.lx, w.ly);
        }
      } else {
        w.sprite.setPosition(w.lx, w.ly);
      }

      // Hit flash (overrides cached state tint)
      if (w.hitFlashMs > 0) {
        w.hitFlashMs = Math.max(0, w.hitFlashMs - effDelta);
        this.setWolfTint(w, w.hitFlashMs > 0 ? 0xff3333 : w.spec.furTint);
      }

      if (writeIdx !== ri) this.wolves[writeIdx] = w;
      writeIdx++;
    }
    // Trim removed/despawned entries
    if (writeIdx !== this.wolves.length) this.wolves.length = writeIdx;
  }

  private killWolf(w: Wolf): void {
    w.state = 'dead'; w.deathMs = 600;
    w.sprite.clearTint();
    this.coins += w.spec.coinsOnKill;
    void addCoins(w.spec.coinsOnKill);
  }

  private hitPlayer(w: Wolf): void {
    if (this.playerDead || this.playerFlashMs > 60) return;
    this.playerHp = Math.max(0, this.playerHp - w.spec.biteDamage);
    this.playerFlashMs = 380;
    this.playerSprite.setTint(0xff2222);
    const kdx = this.playerLX - w.lx; const kdy = this.playerLY - w.ly;
    const klen = Math.sqrt(kdx * kdx + kdy * kdy);
    if (klen > 0) {
      this.playerKnockVX = (kdx / klen) * w.spec.knockbackPx;
      this.playerKnockVY = (kdy / klen) * w.spec.knockbackPx;
    }
    this.slashEmitter.emitParticleAt(this.playerLX, this.playerLY - 30, 5);
    this.cameras.main.shake(140, 0.0045);
    safePlay(this, 'snd_ice_shatter', { volume: 0.38 });
    if (this.playerHp <= 0) this.triggerDeath();
  }

  // ── Death + revive flow ───────────────────────────────────────────────────
  private triggerDeath(): void {
    if (this.playerDead) return;
    this.playerDead = true;
    this.tweens.add({ targets: this.playerSprite, angle: 90, alpha: 0.4, duration: 350 });
    this.cameras.main.shake(280, 0.009);
    void saveEndlessBest(Math.round(this.survivedSec), this.waveNum);
    // Show death overlay after a short beat
    this.time.delayedCall(700, () => this.showDeathOverlay());
  }

  private showDeathOverlay(): void {
    if (this.deathOverlay) return;
    const W = this.scale.width; const H = this.scale.height;
    const CX = W / 2;

    const cont = this.add.container(0, 0).setScrollFactor(0).setDepth(5000);
    this.deathOverlay = cont;

    const dim = this.add.rectangle(CX, H / 2, W, H, 0x000000, 0.78);
    cont.add(dim);

    const panelW = W * 0.86;
    const panelH = H * 0.55;
    const panelY = H * 0.5;
    const panel = this.add.graphics();
    panel.fillStyle(0x12192a, 0.95).fillRoundedRect(CX - panelW/2, panelY - panelH/2, panelW, panelH, 16);
    panel.lineStyle(2, 0x5588aa, 1).strokeRoundedRect(CX - panelW/2, panelY - panelH/2, panelW, panelH, 16);
    cont.add(panel);

    const title = this.add.text(CX, panelY - panelH * 0.32, t('endlessGameOver'), {
      fontFamily: FF, fontSize: `${Math.round(W * 0.09)}px`, fontStyle: 'bold',
      color: '#88ccff', stroke: '#001a44', strokeThickness: 4,
    }).setOrigin(0.5);
    cont.add(title);

    const mins = Math.floor(this.survivedSec / 60);
    const secs = Math.floor(this.survivedSec % 60);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    const info = this.add.text(CX, panelY - panelH * 0.1,
      `${tFmt('endlessWave', { n: this.waveNum })} · ${tFmt('endlessSurvived', { time: timeStr })}`, {
      fontFamily: FF, fontSize: '16px', color: '#aaddff', align: 'center', wordWrap: { width: panelW * 0.85 },
    }).setOrigin(0.5);
    cont.add(info);

    // Best record check
    const best = getEndlessBest();
    if (best.wave === this.waveNum && best.seconds === Math.round(this.survivedSec)) {
      const nr = this.add.text(CX, panelY - panelH * 0.0, t('endlessNewRecord'), {
        fontFamily: FF, fontSize: '18px', fontStyle: 'bold', color: '#ffd700',
        stroke: '#2a1800', strokeThickness: 3,
      }).setOrigin(0.5);
      cont.add(nr);
    }

    const btnW = panelW * 0.78;
    const btnH = Math.round(this.scale.height * 0.07);
    const btnGap = btnH + 10;
    const btnStartY = panelY + panelH * 0.1;

    // Revive (if not used)
    if (!this.revivedThisRun) {
      const { bg: adBg, label: adLabel, zone: adZone } = makeButton(this, CX, btnStartY, t('endlessRevive'), {
        w: btnW, h: btnH, fontSize: '18px', depth: 1,
        bgColor: 0x1a1a00, borderColor: 0x886600,
      });
      cont.add([adBg, adLabel, adZone]);
      adZone.on('pointerup', () => {
        adZone.disableInteractive(); adLabel.setText('Loading...');
        showRewarded(
          () => {
            this.revivedThisRun = true;
            this.applyRevive();
          },
          () => { adLabel.setText(t('adNotAvailable')); this.time.delayedCall(1500, () => { adLabel.setText(t('endlessRevive')); adZone.setInteractive({ useHandCursor: true }); }); },
          () => { adLabel.setText(t('adsAppOnly')); this.time.delayedCall(1500, () => { adLabel.setText(t('endlessRevive')); adZone.setInteractive({ useHandCursor: true }); }); },
        );
      });
    } else {
      const used = this.add.text(CX, btnStartY, t('endlessReviveUsed'), {
        fontFamily: FF, fontSize: '16px', color: '#778899',
      }).setOrigin(0.5);
      cont.add(used);
    }

    // Try again (restarts endless)
    const { bg: retryBg, label: retryLabel, zone: retryZone } = makeButton(this, CX, btnStartY + btnGap, t('tryAgain'), {
      w: btnW, h: btnH, fontSize: '20px', depth: 1,
      bgColor: 0x225522, borderColor: 0x44aa44,
    });
    cont.add([retryBg, retryLabel, retryZone]);
    retryZone.on('pointerup', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.restart());
    });

    // Menu
    const { bg: menuBg, label: menuLabel, zone: menuZone } = makeButton(this, CX, btnStartY + btnGap * 2, t('menu'), {
      w: btnW * 0.65, h: btnH * 0.82, fontSize: '16px', depth: 1,
      bgColor: 0x112244, borderColor: 0x2255aa,
    });
    cont.add([menuBg, menuLabel, menuZone]);
    menuZone.on('pointerup', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('MainMenuScene'));
    });
  }

  private applyRevive(): void {
    // Teardown overlay
    this.deathOverlay?.destroy();
    this.deathOverlay = undefined;

    // Restore state
    this.playerDead = false;
    this.playerHp = this.playerHpMax;
    this.fuel = FUEL_MAX * 0.6;
    this.freezeMeter = 0;
    this.playerSprite.setAngle(0).setAlpha(1).clearTint();
    // Teleport back to fire
    this.playerLX = this.fireX; this.playerLY = this.fireY + 30;
    this.cameras.main.shake(120, 0.005);
    // Clear all wolves (fresh start to the current wave)
    for (const w of this.wolves) {
      if (w.state !== 'dead' && w.sprite.active) {
        const di = this.depthGroup.indexOf(w.sprite);
        if (di >= 0) this.depthGroup.splice(di, 1);
        w.sprite.destroy();
        w.shadowImg.destroy();
      }
    }
    this.wolves = [];
  }

  // ── HUD update + joystick render ──────────────────────────────────────────
  // Every setText + fuel-bar redraw dirties a Phaser batch. We diff against
  // the cached last-rendered values and skip the work when nothing changed.
  private updateHud(_delta: number): void {
    const curWave = Math.max(1, this.waveNum);
    if (curWave !== this.hudLastWave) {
      this.hudLastWave = curWave;
      this.waveText.setText(tFmt('endlessWave', { n: curWave }));
    }
    const curSec = Math.floor(this.survivedSec);
    if (curSec !== this.hudLastSec) {
      this.hudLastSec = curSec;
      const mins = Math.floor(curSec / 60);
      const secs = curSec % 60;
      this.timeText.setText(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    }
    const curCoins = Math.floor(this.coins);
    if (curCoins !== this.hudLastCoins) {
      this.hudLastCoins = curCoins;
      this.coinsText.setText(String(curCoins));
    }
    const curHp = Math.ceil(this.playerHp);
    if (curHp !== this.hudLastHp || this.playerHpMax !== this.hudLastHpMax) {
      this.hudLastHp = curHp; this.hudLastHpMax = this.playerHpMax;
      this.hpText.setText(`${curHp}/${this.playerHpMax}`);
    }
    const curFps = Math.round(this.game.loop.actualFps);
    if (curFps !== this.hudLastFps) {
      this.hudLastFps = curFps;
      this.fpsText.setText(`FPS ${curFps}`);
    }

    // Fuel bar — redraw only when bucketed % changed (200 buckets → smooth enough)
    const fuelPctRaw = this.fuel / FUEL_MAX;
    const freezePctRaw = this.freezeMeter / FREEZE_MAX;
    const fuelBucket = Math.round(fuelPctRaw * 200);
    const freezeBucket = Math.round(freezePctRaw * 200);
    if (fuelBucket !== this.hudLastFuelPct || freezeBucket !== this.hudLastFreezePct) {
      this.hudLastFuelPct = fuelBucket;
      this.hudLastFreezePct = freezeBucket;
      const W = this.scale.width;
      const safeT = Math.max(Math.round(this.scale.height * 0.04), 16);
      const barW = Math.min(W * 0.4, 220);
      const barH = 10;
      const bx = W / 2 - barW / 2;
      const by = safeT + 4;
      this.fuelBarGfx.clear();
      this.fuelBarGfx.fillStyle(0x332200, 0.8).fillRoundedRect(bx - 2, by - 2, barW + 4, barH + 4, 4);
      const pct = fuelPctRaw;
      const col = pct > 0.5 ? 0xff8800 : pct > 0.2 ? 0xff4400 : 0x5588aa;
      this.fuelBarGfx.fillStyle(col, 1).fillRoundedRect(bx, by, Math.max(0, barW * pct), barH, 3);
      this.fuelBarGfx.lineStyle(1, 0xffffff, 0.3).strokeRoundedRect(bx, by, barW, barH, 3);
      if (this.fuel <= 0) {
        this.fuelBarGfx.fillStyle(0x66ccff, 0.8).fillRoundedRect(bx, by, barW * freezePctRaw, barH, 3);
      }
    }
  }

  private renderJoystick(): void {
    this.joyGfx.clear();
    if (this.joyActive) {
      let cxs = this.joyCX; let cys = this.joyCY;
      const dx = cxs - this.joyOX; const dy = cys - this.joyOY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 60) { cxs = this.joyOX + (dx / len) * 60; cys = this.joyOY + (dy / len) * 60; }
      this.joyGfx.lineStyle(2, 0xffffff, 0.28).strokeCircle(this.joyOX, this.joyOY, 60);
      this.joyGfx.fillStyle(0xffffff, 0.5).fillCircle(cxs, cys, 22);
    }
  }
}

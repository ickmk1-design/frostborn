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
import { safePlay, safeAdd } from '../utils/safeMedia';
import { t, tFmt, getLang } from '../i18n';
import { PLAYER_SPEED_MULT, WORKER_SPEED_MULT, BASE_WALK_SPEED, PLAYER_ACCEL_MS, PLAYER_DECEL_MS } from '../config/tuning';

const LEVEL_CONFIGS: Record<string, any> = {
  level01, level02, level03, level04, level05,
  level06, level07, level08, level09, level10,
  level11, level12, level13, level14, level15,
};
let cfg: any = level01;

import {
  readStationsFromCfg, pickStationForWorker,
  DEFAULT_CYCLE_MS, HAUL_DESTINATION,
  type StationConfig, type StationInstance, type StationKind,
} from '../systems/stations';
import { STATION_PRODUCES, STATION_CONSUMES, type ResourceId } from '../systems/resources';
import { NavGrid, type Waypoint } from '../systems/navgrid';

type WorkerState = 'idle' | 'toTree' | 'chopping' | 'toFire' | 'fleeing'
  | 'toStation' | 'atStation' | 'haul';

interface TreeNode { sprite: Phaser.GameObjects.Image; onCooldown: boolean; }

interface Survivor {
  sprite: Phaser.GameObjects.Sprite;
  state: 'frozen' | 'following' | 'thawing' | 'worker';
  thawProgress: number;
  thawBar?: Phaser.GameObjects.Graphics;
  iceGfx?: Phaser.GameObjects.Graphics;
  frostEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  shadow?: Phaser.GameObjects.Image;
  workerState?: WorkerState;
  workerTarget?: TreeNode;
  workerCarrying: number;
  // Station runtime (null when using legacy tree loop)
  workerStation?: StationInstance | null;
  workerHaulId?: ResourceId | null;    // resource being hauled; null when not hauling
  workerHaulDest?: { kind: 'fire' } | { kind: 'station'; station: StationInstance } | null;
  carrySprites?: Phaser.GameObjects.Image[];  // stacked item sprites held in front of body while hauling
  fleeMs?: number;                 // ms remaining of forced huddle-at-fire while fleeing
  // NavGrid path following
  path?: Waypoint[];
  pathIdx?: number;
  pathTargetX?: number;
  pathTargetY?: number;
  pathAttempts?: number;
  repathCooldownMs?: number;
  // Telemetry
  telRepaths?: number;
  telStuckEvents?: number;
  telTimeIdleMs?: number;
  telTimeWalkingMs?: number;
  telTimeWorkingMs?: number;
  telTimeFleeingMs?: number;
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
  workerSlot: number;
  stuckMs: number;
  stuckCheckX: number;
  stuckCheckY: number;
}

interface AnimalEntity {
  sprite: Phaser.GameObjects.Sprite;
  shadow?: Phaser.GameObjects.Image;
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
  // Wave 4 — "Wolves at the Lake": wolves can target workers at stations as
  // well as the player. -1 = player, >=0 = index into this.survivors.
  huntTargetIdx: number;
  // Shared pathfinding fields (nav-grid)
  path?: Waypoint[];
  pathIdx?: number;
  pathTargetX?: number;
  pathTargetY?: number;
  pathAttempts?: number;
  stuckMs: number;
  stuckCheckX: number;
  stuckCheckY: number;
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

// Generic duck type for anything that follows a nav-grid path (Survivor,
// AnimalEntity, dev/test utilities). Keeps the helpers interface-agnostic.
type PathState = {
  lx: number; ly: number;
  path?: Waypoint[];
  pathIdx?: number;
  pathTargetX?: number;
  pathTargetY?: number;
  pathAttempts?: number;
  stuckMs: number;
  stuckCheckX: number;
  stuckCheckY: number;
};

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
  private playerVelX = 0;
  private playerVelY = 0;

  private _loadingUI: Phaser.GameObjects.GameObject[] = [];
  private trees: TreeNode[] = [];
  // Wave 1 scaffold: stations loaded from cfg.stations[] (empty on current levels).
  private stationCfgs: StationConfig[] = [];
  private stations: StationInstance[] = [];
  private fireSprite!: Phaser.GameObjects.Image;
  private fireX = 0; private fireY = 0;
  // Centroid of all station sprites (visual bias for camera lerp when hero
  // is near the fire — used so signature structures sit above the camp).
  private _stationsCentroidX = 0;
  private _stationsCentroidY = 0;
  private _hasStationsCentroid = false;
  private survivors: Survivor[] = [];
  private nextWorkerTreeIndex = 0;
  private nextWorkerSlot = 0;
  private numWorkerSlots = 4;

  private padGfx!: Phaser.GameObjects.Graphics;
  private padLabel!: Phaser.GameObjects.Text;
  private padX = 0; private padY = 0;
  private signSW = 164;
  private signSX = 0;
  private signSY = 0;
  private tentSprite: Phaser.GameObjects.Image | null = null;

  private coins = 0; private fuel = 0;
  private freezeMeter = 0; private rescuedCount = 0;
  private blizzardMs = 0;  // ms remaining in blizzard event (Wave 12)
  private blizzardTriggered = false;
  private tentBuilt = false; private gameOver = false;
  private coinsPaidForTent = 0; private carriedLogs = 0;
  private sceneTimeMs = 0;

  private logIcons: Phaser.GameObjects.Image[] = [];
  private dropZoneGfx!: Phaser.GameObjects.Graphics;

  private joyActive = false;
  private joyOX = 0; private joyOY = 0;
  private joyCX = 0; private joyCY = 0;

  private snowDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hintArrowGfx!: Phaser.GameObjects.Graphics;
  private _hintArrowDrawn = false;

  private hintTimer = 0;

  private decorSprites: Phaser.GameObjects.Image[] = [];
  // Dedicated shadow images (pre-rendered ellipse texture, positioned per frame).
  // Replaces per-frame fillEllipse which triggered earcut triangulation + texImage2D
  // upload on every entity each frame — a top hotspot on L15.
  private playerShadow!: Phaser.GameObjects.Image;
  private fireShadow!: Phaser.GameObjects.Image;
  private tentShadow: Phaser.GameObjects.Image | null = null;
  private treeShadows: Phaser.GameObjects.Image[] = [];

  private fireSoundRef?: Phaser.Sound.BaseSound;
  private windSoundRef?: Phaser.Sound.BaseSound;
  private footprintEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private padSignGfx!: Phaser.GameObjects.Graphics;
  private lastFootprintTime = 0;
  private fireGlowImg!: Phaser.GameObjects.Image;

  // Pooled single-shot emitters (woodchip / ice shatter / slash) — constructed
  // once in create() and re-triggered via explodeAt(). Avoids allocating a new
  // ParticleEmitter GameObject on every hit (major GC pressure on L12-L15).
  private woodchipEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private iceShatterEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private slashEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  private depthGroup: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> = [];
  private obstacles: Array<{ x: number; y: number; r: number }> = [];
  private navGrid = new NavGrid();

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
  private _hpBarDrawn = false;
  // Scratch output objects for per-frame helpers — avoids allocating a new
  // {x,y} / {vx,vy} / {ix,iy} on every call (called ~4-6x per entity per frame
  // = ~100+ allocs/frame on L15 → noticeable GC pressure).
  private _scratchXY = { x: 0, y: 0 };
  private _scratchXY2 = { x: 0, y: 0 };
  private _scratchXY3 = { x: 0, y: 0 };
  private _scratchVV = { vx: 0, vy: 0 };
  private _scratchIso = { ix: 0, iy: 0 };
  private _scratchIso2 = { ix: 0, iy: 0 };
  private animalsKilled = 0;
  private fishCaught = 0;
  private cookedServed = 0;
  private planksProduced = 0;
  private planksAvailable = 0;
  private supplyRunsCompleted = 0;
  private goalStages: Array<{type:string; target:number|string; hintText:string; hintTextTr?:string; completedText?:string; completedTextTr?:string}> = [];
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

  // ── preload ───────────────────────────────────────────────────────────────
  // All heavy game assets live here so the main menu opens instantly.
  // Phaser caches every key — restarts and level changes skip the download.

  preload(): void {
    const W = this.scale.width; const H = this.scale.height;
    const CX = W / 2;

    // Loading UI — fixed to camera so it doesn't move with the iso world
    const bg = this.add.graphics().setScrollFactor(0).setDepth(1000);
    bg.fillStyle(0x0a0f1e, 1).fillRect(0, 0, W, H);

    const barW = Math.min(W * 0.72, 300);
    const barH = 14;
    const barX = CX - barW / 2;
    const barY = H / 2 + 20;

    const barBg = this.add.graphics().setScrollFactor(0).setDepth(1001);
    barBg.fillStyle(0x223355, 1).fillRoundedRect(barX, barY, barW, barH, barH / 2);

    const barFill = this.add.graphics().setScrollFactor(0).setDepth(1001);

    const loadingText = this.add.text(CX, barY - 18, t('loading'), {
      fontFamily: "GameFont, cursive", fontSize: '18px', color: '#aaddff',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(1001);

    this.load.on('progress', (v: number) => {
      barFill.clear();
      barFill.fillStyle(0x44aaff, 1).fillRoundedRect(barX, barY, barW * v, barH, barH / 2);
    });

    // Keep refs so create() destroys them after the game world is ready
    this._loadingUI = [bg, barBg, barFill, loadingText];

    const GAME_ASSETS = [
      'building_archway_gate_01', 'building_barracks_01',
      'building_central_tower_01', 'building_conveyor_belt_system', 'building_furnace_heating_01',
      'building_giant_wheel_grinder', 'building_log_cabin_01', 'building_lumber_mill_01',
      'building_perimeter_wall_wooden', 'building_research_lab_01', 'building_road_grid_01',
      'building_small_hut_01', 'building_storage_crate_stacks', 'building_tent_canvas_01',
      'building_tunnel_arch_01', 'building_turret_defense_01', 'building_upgrade_scaffold_01',
      'building_watchtower_01', 'character_enemy_troop_01', 'character_survivor_worker_01',
      'character_survivor_walk_left', 'character_survivor_walk_right',
      'character_survivor_back_idle', 'character_survivor_back_left', 'character_survivor_back_right',
      'effect_blizzard_snow_particles', 'effect_fire_explosion_01', 'effect_ice_freeze_shatter',
      'effect_smoke_chimney_01', 'effect_sparkle_reward_burst', 'enemy_grey_wolf_01',
      'prop_barrel_01', 'prop_bench_01', 'prop_blue_resource_crystal', 'prop_campfire_01',
      'prop_frozen_tree_dead_01', 'prop_green_resource_crate', 'prop_igloo_01',
      'prop_meat_table_01', 'prop_snow_pine_tree_01', 'prop_vehicle_excavator_01',
      'prop_vehicle_snowmobile_01', 'prop_warning_sign_red',
      'resource_food_icon_green', 'resource_meat_icon_red', 'resource_meat_log_roll_01',
      'resource_meat_pile_01', 'resource_wood_logs_01', 'resource_wood_planks_01',
      'tile_base_floor_dirt_01', 'tile_frozen_ground_01', 'tile_road_paved_urban_01',
      'tile_snow_drift_mound_01',
    ];

    for (const key of GAME_ASSETS) {
      if (!this.textures.exists(key))
        this.load.image(key, `assets/${key}.webp`);
    }

    if (!this.textures.exists('hero'))
      this.load.multiatlas('hero', 'assets/sprites/hero/atlas.json', 'assets/sprites/hero/');
    if (!this.textures.exists('worker'))
      this.load.multiatlas('worker', 'assets/sprites/worker_new/atlas.json', 'assets/sprites/worker_new/');
    if (!this.textures.exists('wolf'))
      this.load.multiatlas('wolf', 'assets/sprites/wolf/atlas.json', 'assets/sprites/wolf/');
    if (!this.textures.exists('deer'))
      this.load.multiatlas('deer', 'assets/sprites/deer/atlas.json', 'assets/sprites/deer/');
    if (!this.textures.exists('stag'))
      this.load.multiatlas('stag', 'assets/sprites/stag/atlas.json', 'assets/sprites/stag/');

    for (const k of ['prop_rock_cluster_01', 'prop_snow_bush_01', 'prop_cliff_edge_01', 'prop_lantern_post_01']) {
      if (!this.textures.exists(k)) this.load.image(k, `assets/${k}.webp`);
    }

    // Wave 1-2 station assets (21 PNGs — PNG not WebP for alpha fidelity).
    const STATION_ASSETS = [
      'station_ice_hole_01', 'tile_pier_plank_01', 'tile_water_frozen_01',
      'resource_fish_raw_01', 'station_fish_cleaning_table_01', 'station_cook_pot_01',
      'station_lumber_mill_01', 'resource_plank_01',
      'building_cabin_stage1_01', 'building_cabin_stage2_01', 'building_cabin_finished_01',
      'station_butcher_table_01', 'station_meat_grinder_01', 'tile_conveyor_belt_01',
      'resource_meat_chunk_01', 'resource_meat_ground_01',
      'station_supply_sled_01', 'tile_sled_dock_01',
      'character_survivor_lookout_01', 'projectile_arrow_01',
    ];
    for (const k of STATION_ASSETS) {
      if (!this.textures.exists(k))
        this.load.image(k, `assets/sprites/stations_v1/${k}.png`);
    }

    const noAudio = new URLSearchParams(window.location.search).has('noaudio');
    if (!noAudio) {
      const SFX = [
        'snd_axe_chop', 'snd_log_drop', 'snd_coin_pickup',
        'snd_fire_loop', 'snd_wind_loop', 'snd_ice_shatter',
        'snd_build_complete', 'snd_win_jingle',
      ];
      for (const k of SFX) {
        if (!this.cache.audio.exists(k)) this.load.audio(k, `assets/audio/${k}.m4a`);
      }
    }

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      if (file.key === 'wolf') console.warn('[Frostborn] Wolf atlas not found');
      if (file.key === 'deer') console.warn('[Frostborn] Deer atlas not found');
    });
  }

  // ── create ────────────────────────────────────────────────────────────────

  create(): void {
    // Remove loading UI now that the game world is about to render
    for (const obj of this._loadingUI) obj.destroy();
    this._loadingUI = [];

    this.trees = []; this.survivors = []; this.logIcons = [];
    this.depthGroup = []; this.decorSprites = []; this.tentSprite = null; this.obstacles = [];
    this.nextWorkerTreeIndex = 1; // tree 0 is above fire and blocked; workers start at tree 1
    this.nextWorkerSlot = 0;
    this.numWorkerSlots = Math.max(4, cfg.frozenSurvivors?.length ?? 4);
    // Wave 1 scaffold — stations scaffold (empty for levels without `stations: []`).
    this.stationCfgs = readStationsFromCfg(cfg);
    this.stations = [];

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

    // Pre-rendered shadow ellipse. Used as an Image sprite under each entity.
    // Baked to a 64x24 texture (large enough to cover alpha wolf when scaled).
    // We scale per-entity via setDisplaySize() — no per-frame earcut cost.
    if (!this.textures.exists('entity_shadow')) {
      const sg = this.make.graphics({ add: false } as any);
      sg.fillStyle(0x000000, 0.20);
      sg.fillEllipse(32, 12, 60, 22);
      sg.generateTexture('entity_shadow', 64, 24);
      sg.destroy();
    }

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
    // Extend snow well beyond any possible camera bound so the dark background
    // can never peek through at the edges.
    this.add.graphics().fillStyle(0xd8eaf8, 1).fillRect(-2500, -2500, 9000, 9000).setDepth(-10);
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
    for (const [gx, gy] of (cfg.gate ?? [])) {
      const pos = isoToScreen(gx, gy, ox, oy);
      const pg = this.add.graphics().setDepth(pos.y);
      pg.fillStyle(0x6b3a1f, 1).fillRect(pos.x - 4, pos.y - 32, 8, 32);
      pg.lineStyle(1, 0x3d1f08, 1).strokeRect(pos.x - 4, pos.y - 32, 8, 32);
    }

    // ── Trees — inside camp scaled to 70px so they don't block fire/pad/gate (Fix 6)
    this.treeShadows = [];
    for (const td of cfg.trees) {
      const [tx, ty] = td.iso as [number, number];
      const pos = isoToScreen(tx, ty, ox, oy);
      // Static shadow (trees don't move — set once, no per-frame work)
      const shadow = this.add.image(pos.x, pos.y, 'entity_shadow')
        .setDisplaySize(54, 20).setDepth(2);
      this.treeShadows.push(shadow);
      const sp = this.add.image(pos.x, pos.y, 'prop_snow_pine_tree_01')
        .setDisplaySize(70, 70).setOrigin(0.5, 0.85);
      this.depthGroup.push(sp);
      this.trees.push({ sprite: sp, onCooldown: false });
      // Shrunk collider to the visible trunk base (was 20) so the hero only stops
      // when actually touching the trunk — small radius also lets him slide past.
      this.obstacles.push({ x: pos.x, y: pos.y, r: 12 });
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
    // agentB round2 — sparse `tile_water_frozen_01` tiles leave gaps between
    // them, which reads as scattered diamonds rather than a lake. Fill a soft
    // convex hull behind the water tiles in ice-blue, then draw the tiles on
    // top for texture detail. Depth -3 sits above snow (-10/-9) and camp
    // floor (-5), but below all decor sprites (which use depthGroup y-depth).
    if ((cfg as any).decor) {
      const waterPts: Array<{ x: number; y: number }> = [];
      for (const d of (cfg as any).decor as Array<{ key: string; iso: [number, number] }>) {
        if (d.key !== 'tile_water_frozen_01') continue;
        const wp = isoToScreen(d.iso[0], d.iso[1], ox, oy);
        waterPts.push(wp);
      }
      if (waterPts.length >= 3) {
        // Andrew monotone-chain convex hull — small N, in-place sort is fine.
        const pts = waterPts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
        const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
          (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        const lower: Array<{ x: number; y: number }> = [];
        for (const p of pts) {
          while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
          lower.push(p);
        }
        const upper: Array<{ x: number; y: number }> = [];
        for (let i = pts.length - 1; i >= 0; i--) {
          const p = pts[i];
          while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
          upper.push(p);
        }
        const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
        // Centroid for the pad outward — expand the hull ~40 px so the ice-blue
        // fill reaches beyond the outermost water tile centres.
        let cx = 0, cy = 0;
        for (const h of hull) { cx += h.x; cy += h.y; }
        cx /= hull.length; cy /= hull.length;
        const EXPAND = 44;
        const padded = hull.map(h => {
          const vx = h.x - cx; const vy = h.y - cy;
          const vl = Math.max(1, Math.sqrt(vx * vx + vy * vy));
          return { x: h.x + (vx / vl) * EXPAND, y: h.y + (vy / vl) * EXPAND };
        });
        const lakeGfx = this.add.graphics().setDepth(-3);
        lakeGfx.fillStyle(0x7fb8d8, 0.85).fillPoints(padded as any, true);
        lakeGfx.lineStyle(2, 0xbfe4f3, 0.55).strokePoints(padded as any, true);
        // Soft inner highlight for a bit of lake sheen.
        const innerPts = padded.map(h => {
          const vx = h.x - cx; const vy = h.y - cy;
          const vl = Math.max(1, Math.sqrt(vx * vx + vy * vy));
          return { x: h.x - (vx / vl) * 18, y: h.y - (vy / vl) * 18 };
        });
        lakeGfx.fillStyle(0xaad8ee, 0.28).fillPoints(innerPts as any, true);
      }
      for (const d of (cfg as any).decor as Array<{ key: string; iso: [number, number] }>) {
        const [dx, dy] = d.iso;
        const dp = isoToScreen(dx, dy, ox, oy);
        const sz = DECOR_SIZES[d.key] ?? 90;
        const ds = this.add.image(dp.x, dp.y, d.key)
          .setDisplaySize(sz, sz).setOrigin(0.5, 0.85);
        this.depthGroup.push(ds);
        this.decorSprites.push(ds);
        // Wave 8 — conveyor belts tween a small "roller" dot east-to-west over
        // the strip so the player can see the belt moving. Cheap: per-strip one
        // sprite + one yoyo tween.
        if (d.key === 'tile_conveyor_belt_01') {
          const r = this.add.image(dp.x, dp.y - 10, 'resource_meat_chunk_01')
            .setDisplaySize(16, 16).setDepth(dp.y + 1).setAlpha(0.85);
          this.tweens.add({
            targets: r, x: { from: dp.x - 26, to: dp.x + 26 },
            duration: 1500, repeat: -1, ease: 'Linear',
          });
        }
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

    // Fire shadow (static — set once)
    this.fireShadow = this.add.image(this.fireX, this.fireY, 'entity_shadow')
      .setDisplaySize(62, 24).setDepth(2);

    this.fireSprite = this.add.image(this.fireX, this.fireY, 'building_cauldron_firepit_01')
      .setDisplaySize(115, 115).setOrigin(0.5, 0.85);
    this.depthGroup.push(this.fireSprite);
    this.obstacles.push({ x: this.fireX, y: this.fireY, r: 62 });

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

    this.dropZoneGfx = this.add.graphics().setDepth(2).setVisible(false);
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

    // Sign — beside the pad (offset right so it doesn't cover the pad diamond)
    this.padSignGfx = this.add.graphics().setDepth(10);
    const sx = this.padX + 76, sy = this.padY - 10;
    const remaining0 = pad.costCoins;

    this.padLabel = this.add.text(sx, sy - 22,
      `${t('buildTentSign')}  ${remaining0}`, {
        fontFamily: "GameFont, cursive",
        fontSize: '15px', color: '#ffe0b0', align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(11);

    if (this.textures.exists('resource_coin_gold_01')) {
      this.add.image(sx + this.padLabel.width / 2 + 11, sy - 22, 'resource_coin_gold_01')
        .setDisplaySize(14, 14).setDepth(11).setOrigin(0, 0.5);
    }

    this.signSW = Math.max(140, this.padLabel.width + 44);
    this.signSX = sx; this.signSY = sy;
    this.drawPadSign(sx, sy, this.signSW, 0);

    // ── Player ────────────────────────────────────────────────────────────
    const si = cfg.player.startIso as [number, number];
    const sp2 = isoToScreen(si[0], si[1], ox, oy);
    this.playerLX = sp2.x; this.playerLY = sp2.y;
    // Player shadow (dynamic — moves with player)
    this.playerShadow = this.add.image(sp2.x, sp2.y, 'entity_shadow')
      .setDisplaySize(44, 16).setDepth(2);
    this.playerSprite = this.add.sprite(sp2.x, sp2.y, 'hero', 'hero_walk_d0_f0')
      .setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0);
    this.depthGroup.push(this.playerSprite);
    this.playerHpBarGfx = this.add.graphics().setDepth(1500);
    this.playerBaseScaleX = this.playerSprite.scaleX;
    this.playerBaseScaleY = this.playerSprite.scaleY;

    this.snowDust = this.add.particles(0, 0, 'snowpuff', {
      speed: { min: 18, max: 38 }, angle: { min: 100, max: 260 },
      scale: { start: 0.6, end: 0.08 }, alpha: { start: 0.45, end: 0 },
      lifespan: 280,
    }).setDepth(4);

    // Drop shadows (drawn below characters each frame)
    // (shadowGfx removed — shadows are now per-entity Image sprites with pre-baked texture)

    // Footprint emitter — small paired boot prints (Fix 3)
    this.footprintEmitter = this.add.particles(0, 0, 'footstep', {
      lifespan: 2500, speed: 0,
      alpha: { start: 0.25, end: 0 },
      scale: { start: 0.65, end: 0.65 },
      emitting: false,
    }).setDepth(-1);

    // Pooled single-shot emitters — one instance each, re-aimed per hit.
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

    // ── Frozen survivors ──────────────────────────────────────────────────
    // Ice block dimensions proportional to CHAR_SIZE
    const IW = 56; const IH = 72; const IXO = 28; const IYO = 76;

    for (const svd of cfg.frozenSurvivors) {
      const svIso = svd.iso as [number, number];
      const svPos = isoToScreen(svIso[0], svIso[1], ox, oy);

      // Ice block — translucent front face + isometric top face for 3D look
      const iceGfx = this.add.graphics().setDepth(svPos.y - 1);
      // Front face
      iceGfx.fillStyle(0x99ddff, 0.38).lineStyle(2, 0xbbedff, 0.80);
      iceGfx.fillRoundedRect(svPos.x - IXO, svPos.y - IYO, IW, IH, 7);
      iceGfx.strokeRoundedRect(svPos.x - IXO, svPos.y - IYO, IW, IH, 7);
      // Isometric top face (lighter, parallelogram above the block)
      const th = 14; // top-face height
      iceGfx.fillStyle(0xddf4ff, 0.55);
      iceGfx.fillPoints([
        { x: svPos.x - IXO,        y: svPos.y - IYO } as any,
        { x: svPos.x - IXO + IW,   y: svPos.y - IYO } as any,
        { x: svPos.x - IXO + IW + 10, y: svPos.y - IYO - th } as any,
        { x: svPos.x - IXO + 10,   y: svPos.y - IYO - th } as any,
      ], true);
      iceGfx.lineStyle(1.5, 0xddf4ff, 0.70);
      iceGfx.strokePoints([
        { x: svPos.x - IXO,        y: svPos.y - IYO } as any,
        { x: svPos.x - IXO + IW,   y: svPos.y - IYO } as any,
        { x: svPos.x - IXO + IW + 10, y: svPos.y - IYO - th } as any,
        { x: svPos.x - IXO + 10,   y: svPos.y - IYO - th } as any,
      ], true);
      // Inner frost shimmer on front face
      iceGfx.lineStyle(1, 0xeef8ff, 0.3);
      iceGfx.strokeRoundedRect(svPos.x - IXO + 4, svPos.y - IYO + 4, IW - 8, IH - 8, 4);

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

      const sp3 = this.add.sprite(svPos.x, svPos.y, 'worker', 'worker_walk_d0_f0')
        .setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0).setTint(0x88ccff);
      this.depthGroup.push(sp3);

      // Per-survivor shadow image (positioned each frame — but no earcut cost)
      const svShadow = this.add.image(svPos.x, svPos.y, 'entity_shadow')
        .setDisplaySize(42, 15).setDepth(2);

      this.survivors.push({
        sprite: sp3, state: 'frozen', thawProgress: 0,
        thawBar: this.add.graphics(), iceGfx, frostEmitter,
        shadow: svShadow,
        workerCarrying: 0, bobOffset: Math.random() * Math.PI * 2,
        lx: svPos.x, ly: svPos.y,
        waddlePhase: Math.random() * Math.PI * 2,
        waddleBobY: 0,
        baseScaleX: sp3.scaleX, baseScaleY: sp3.scaleY,
        lastDir: 4, pendingDir: -1, pendingDirMs: 0,
        activeAnim: 'walk',
        treeIndex: 0,
        workerSlot: 0, stuckMs: 0, stuckCheckX: svPos.x, stuckCheckY: svPos.y,
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
        const WOLF_TYPES = new Set(['wolf','alphawolf','alphawolf2','betawolf','grandalpha']);
        const atlasKey = WOLF_TYPES.has(charType) ? 'wolf' : charType;
        const isBoss = charType !== 'wolf';
        const hasAtlas = this.textures.exists(atlasKey);
        const displayScale = spec.displayScale ?? 1;
        const baseSize = atlasKey === 'deer' ? 136 : atlasKey === 'stag' ? 148 : WOLF_TYPES.has(charType) ? 144 : 80;
        const displaySize = Math.round(baseSize * displayScale);
        // agentB round2 — stag origin 0.92→0.95 so feet touch the shadow on
        // standing frames; deer stays 1.0. Shadow scales get an extra boost
        // for stags since antlers push the sprite centre further up.
        const spOriginY = atlasKey === 'stag' ? 0.95 : 1.0;
        const sp = hasAtlas
          ? this.add.sprite(pos.x, pos.y, atlasKey, `${atlasKey}_walk_d0_f0`).setDisplaySize(displaySize, displaySize).setOrigin(0.5, spOriginY)
          : this.add.sprite(pos.x, pos.y, 'enemy_grey_wolf_01').setDisplaySize(displaySize > 80 ? displaySize : 70, displaySize > 80 ? displaySize : 70).setOrigin(0.5, 1.0);
        this.depthGroup.push(sp);
        const baseTint = spec.furTint ?? 0xffffff;
        if (baseTint !== 0xffffff) sp.setTint(baseTint);
        let eyeGlow: Phaser.GameObjects.Image | undefined;
        // Eye glow removed — per-frame head tracking not feasible without frame-level bone data
        // Per-animal shadow (dynamic — moves + scales with animal)
        const shadowBaseForScale = atlasKey === 'deer' ? 136 : atlasKey === 'stag' ? 148 : 144;
        const shScale = displaySize / shadowBaseForScale;
        const shadowW = atlasKey === 'stag' ? 68 : 54;  // stag: wider pad
        const shadowH = atlasKey === 'stag' ? 24 : 20;
        const animalShadow = this.add.image(pos.x, pos.y, 'entity_shadow')
          .setDisplaySize(shadowW * shScale, shadowH * shScale).setDepth(2);
        const animal: AnimalEntity = {
          sprite: sp, shadow: animalShadow, atlasKey, baseTint, isBoss, eyeGlow, summonedMinions: false, displaySize,
          hp: spec.hp, maxHp: spec.hp,
          lx: pos.x, ly: pos.y, state: 'roam', dir: 0,
          bobPhase: Math.random() * Math.PI * 2,
          roamCenterX: rcPos.x, roamCenterY: rcPos.y, roamRadius: radiusPx,
          targetLx: pos.x, targetLy: pos.y,
          roamChangeMs: 0, hitFlashMs: 0, deathMs: 0, respawnMs: 0,
          spawnLx: pos.x, spawnLy: pos.y, biteMs: 0, fleeMs: 0,
          circleAngle: Math.random() * Math.PI * 2, circleDir: Math.random() > 0.5 ? 1 : -1, stateTimer: 0, lungeTargetX: 0, lungeTargetY: 0, huntTargetIdx: -1,
          spec,
          stuckMs: 0, stuckCheckX: pos.x, stuckCheckY: pos.y,
        };
        this.pickRoamTarget(animal);
        this.animals.push(animal);
      }
    }

    // ── Dev: `?spawnTest=stag` spawns a stag near the player for preflight dir checks ─
    if (typeof window !== 'undefined' && window.location.search.includes('spawnTest=stag')) {
      this._spawnTestAnimal('stag', 120, 80);
    }

    // ── Station runtime instances from cfg.stations[] (empty on current L1-L15).
    for (const scfg of this.stationCfgs) {
      const [six, siy] = scfg.iso;
      const sp = isoToScreen(six, siy, ox, oy);
      const spriteKey = this.stationSpriteKey(scfg.kind);
      let sprite: Phaser.GameObjects.Image | null = null;
      if (spriteKey && this.textures.exists(spriteKey)) {
        sprite = this.add.image(sp.x, sp.y, spriteKey)
          .setDisplaySize(96, 96).setOrigin(0.5, 0.85);
        this.depthGroup.push(sprite);
        // Tap-to-bump priority: cycles 0 → -1 → -2 → 0 so the player can
        // toggle a station off without reloading. Visual tint (in update())
        // confirms the state.
        sprite.setInteractive({ useHandCursor: true });
        const bump = () => {
          const inst = this.stations.find(st => st.sprite === sprite);
          if (!inst) return;
          inst.priorityBump = inst.priorityBump > -2 ? inst.priorityBump - 1 : 0;
          // Visual nudge so the tap feels responsive.
          this.tweens.add({ targets: sprite, scaleX: { from: (sprite as Phaser.GameObjects.Image).scaleX * 1.12, to: (sprite as Phaser.GameObjects.Image).scaleX }, scaleY: { from: (sprite as Phaser.GameObjects.Image).scaleY * 1.12, to: (sprite as Phaser.GameObjects.Image).scaleY }, duration: 180, ease: 'Back.Out' });
        };
        sprite.on('pointerup', bump);
      }
      const pileText = this.add.text(sp.x, sp.y - 70, '', {
        fontFamily: 'GameFont, cursive', fontSize: '11px', color: '#ffe8b0',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(1200).setVisible(false);
      const inst: StationInstance = {
        cfg: scfg, sx: sp.x, sy: sp.y, sprite, pileSprites: [], inputPileSprites: [], pileText,
        workerId: -1, cycleMs: 0, priorityBump: scfg.priorityBump ?? 0,
        outputCount: 0, inputCount: 0,
      };
      this.stations.push(inst);
      // Small obstacle at the base of the sprite so entities can't walk
      // through it, but small enough that an incoming worker reaches the
      // station interaction radius before colliding. Old 28 caused workers
      // to orbit outside the station on L5.
      this.obstacles.push({ x: sp.x, y: sp.y, r: 14 });
    }

    // Goal stages from level config
    this.goalStages = (cfg as any).stages ?? [];
    this.currentStageIdx = 0;
    this.stageBannerMs = 0;
    this.stageBannerText = '';

    // ── Misc ──────────────────────────────────────────────────────────────
    this.hintArrowGfx = this.add.graphics().setDepth(1100);

    // ── Camera — zoom=0.78, tighter bounds around meaningful content ──────
    // agentB round2: PAD was 500 → camp read as tiny speck. Dropped to 180 and
    // the bounds now include stations + animals iso so the camera can't scroll
    // out into empty snow voids. Zoom bumped 0.70 → 0.78 so signature
    // structures (mill, butcher row, watchtower) read clearly on screenshots.
    this.cameras.main.setZoom(0.78);
    {
      const allIso: [number, number][] = [
        ...(cfg.walls as [number, number][]),
        ...cfg.trees.map((t: any) => t.iso as [number, number]),
        ...cfg.frozenSurvivors.map((s: any) => s.iso as [number, number]),
        cfg.fire.iso as [number, number],
        ...cfg.buildPads.map((p: any) => p.iso as [number, number]),
        ...((cfg as any).stations ?? []).map((s: any) => s.iso as [number, number]),
        ...((cfg as any).animals ?? []).map((a: any) => a.iso as [number, number]),
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
      const PAD = 180;
      this.cameras.main.setBounds(
        minX - PAD, minY - PAD,
        (maxX - minX) + PAD * 2,
        (maxY - minY) + PAD * 2,
      );
      // ── NavGrid — snap to a tight world rect (stations/survivors/fire)
      // plus a 200px margin on each side, so A* search space stays small.
      const NAV_PAD = 200;
      this.navGrid.build(cfg, this.obstacles, {
        minX: minX - NAV_PAD, minY: minY - NAV_PAD,
        maxX: maxX + NAV_PAD, maxY: maxY + NAV_PAD,
      });

      // ── Stations centroid (used by signature-structure camera bias below).
      const sts = ((cfg as any).stations ?? []) as Array<{ iso: [number, number] }>;
      if (sts.length > 0) {
        let sx = 0, sy = 0;
        for (const s of sts) {
          const p = isoToScreen(s.iso[0], s.iso[1], ox, oy);
          sx += p.x; sy += p.y;
        }
        this._stationsCentroidX = sx / sts.length;
        this._stationsCentroidY = sy / sts.length;
        this._hasStationsCentroid = true;
      } else {
        this._hasStationsCentroid = false;
      }
    }
    this.cameras.main.startFollow(this.playerSprite, true, 0.08, 0.08);

    // ── Ambient sounds ─────────────────────────────────────────────────────
    if (this.sound.get('snd_fire_loop') === null) {
      this.fireSoundRef = safeAdd(this, 'snd_fire_loop', { loop: true, volume: 0.30 }) ?? undefined;
      this.fireSoundRef?.play();
    }
    if (this.sound.get('snd_wind_loop') === null) {
      this.windSoundRef = safeAdd(this, 'snd_wind_loop', { loop: true, volume: 0.18 }) ?? undefined;
      this.windSoundRef?.play();
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
    this.coins = 0;
    this.fuel = (cfg.fire as any).initialFuel ?? cfg.fire.fuelMax;
    this.sceneTimeMs = 0;
    this.freezeMeter = 0; this.rescuedCount = 0;
    this.tentBuilt = false; this.gameOver = false;
    this.coinsPaidForTent = 0; this.carriedLogs = 0;
    this.hintTimer = 0;
    this.lastVelX = 0; this.lastVelY = 0;
    this.playerVelX = 0; this.playerVelY = 0;
    this.playerWaddlePhase = 0; this.playerBobY = 0;
    this.playerLastDir = 0;
    this.carriedMeat = 0; this.cookQueue = 0; this.cookTimer = 0;
    this.playerAttackMs = 0; this.animalsKilled = 0; this.currentStageIdx = 0;
    this.fishCaught = 0; this.cookedServed = 0;
    // Wave 5+ counters — missing resets caused stages to auto-complete
    // when a prior level's counters bled through on scene restart.
    this.planksProduced = 0; this.planksAvailable = 0;
    this.supplyRunsCompleted = 0;
    this.blizzardMs = 0; this.blizzardTriggered = false;
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
    for (const char of ['wolf', 'deer', 'stag']) {
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

    // Warmup pass — forces GPU shader compile + texture upload for resources
    // the player will hit in the first few seconds. Without this, the first
    // chop / shatter / wolf anim stalls the main thread for 50-150ms, which
    // is what the L1 min=11 FPS dip was tracking.
    this.runWarmupPass();

    // Signal UIScene to show level start banner
    this.time.delayedCall(300, () => {
      this.events.emit('level-start', { levelNum: this.currentLevelNum, levelName: cfg.name ?? '' });
    });
  }

  private runWarmupPass(): void {
    // Emit each pooled particle emitter once far off-screen so the particle
    // shader is compiled on the first render cycle instead of mid-combat.
    const OFF = -99999;
    this.woodchipEmitter.emitParticleAt(OFF, OFF, 2);
    this.iceShatterEmitter.emitParticleAt(OFF, OFF, 2);
    this.slashEmitter.emitParticleAt(OFF, OFF, 2);
    this.snowDust.emitParticleAt(OFF, OFF, 2);
    this.footprintEmitter.emitParticleAt(OFF, OFF, 1);

    // Pre-bind each character atlas by rendering one invisible frame of its
    // walk animation. Phaser uploads atlas textures lazily on first draw;
    // doing it here means the player, workers, wolves and deer are already
    // GPU-resident before the player can move.
    const warmupSprites: Phaser.GameObjects.Sprite[] = [];
    for (const key of ['hero', 'worker', 'wolf', 'deer', 'stag']) {
      if (!this.textures.exists(key)) continue;
      // Each atlas uses the `${key}_walk_d0_f0` frame; the particle-free
      // pre-draw forces the texture into the GPU without affecting gameplay.
      const sp = this.add.sprite(OFF, OFF, key, `${key}_walk_d0_f0`)
        .setDisplaySize(1, 1).setAlpha(0.001).setDepth(-99999);
      warmupSprites.push(sp);
    }
    // Drop the warmup sprites on the next tick — the GPU upload is already
    // queued from create()'s display-list flush.
    this.time.delayedCall(50, () => warmupSprites.forEach(s => s.destroy()));

    // Nudge audio decode by playing each loop at zero volume for 1 frame.
    // Phaser decodes on load, but iOS WebAudio occasionally stalls on first
    // play — a warm play avoids a 100-300ms hitch at the first real sound.
    if (this.cache.audio.exists('snd_fire_loop')) {
      const s = this.sound.add('snd_fire_loop', { volume: 0 });
      try { s.play(); s.stop(); s.destroy(); } catch {}
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

  private drawPadSign(sx: number, sy: number, sw: number, progressPct: number): void {
    const half = sw / 2;
    this.padSignGfx.clear();
    // Dark border plank
    this.padSignGfx.fillStyle(0x6B4226, 1).fillRoundedRect(sx - half, sy - 48, sw, 46, 6);
    // Light face
    this.padSignGfx.fillStyle(0x8B5E3C, 1).fillRoundedRect(sx - half + 2, sy - 46, sw - 4, 42, 5);
    // Progress fill (green, left-to-right)
    if (progressPct > 0 && progressPct < 1) {
      const fillW = (sw - 8) * progressPct;
      this.padSignGfx.fillStyle(0x44aa44, 0.4).fillRoundedRect(sx - half + 4, sy - 44, fillW, 38, 4);
    }
    // Border
    this.padSignGfx.lineStyle(2, 0x4A2F1A, 1).strokeRoundedRect(sx - half, sy - 48, sw, 46, 6);
    // Grain lines
    this.padSignGfx.lineStyle(1, 0x7A5035, 0.4).lineBetween(sx - half + 10, sy - 36, sx + half - 10, sy - 36);
    this.padSignGfx.lineStyle(1, 0x7A5035, 0.4).lineBetween(sx - half + 10, sy - 24, sx + half - 10, sy - 24);
    // Post
    this.padSignGfx.fillStyle(0x6B4226, 1).fillRect(sx - 3, sy - 2, 6, 44);
  }

  private updatePadSign(): void {
    const pad = cfg.buildPads[0];
    const remainingC = Math.max(0, pad.costCoins - Math.floor(this.coinsPaidForTent));
    const pct = Math.min(1, this.coinsPaidForTent / pad.costCoins);
    const plankReq = pad.costPlanks ?? 0;
    const plankLabel = plankReq > 0 ? `  ${Math.min(plankReq, this.planksAvailable)}/${plankReq}📜` : '';
    this.padLabel.setText(`${t('buildTentSign')}  ${remainingC}🪙${plankLabel}`);
    this.drawPadSign(this.signSX, this.signSY, this.signSW, pct);
  }

  // Maps screen-space velocity to the direction index whose rendered facing
  // angle is nearest to the movement angle.
  // Screen convention: right=0°, down=90°.
  // Hero/worker: ELEV=32°, measured from Blender cone probes (commit 5fc0fa7).
  private static readonly CHAR_DIR_ANGLES = [90.0, 28.8, 1.3, 334.1, 270.0, 205.9, 178.7, 151.2];
  // Wolf/deer: ELEV=36°, measured after quadruped re-render.
  private static readonly WOLF_DIR_ANGLES = [90.0, 28.8, 1.3, 334.1, 270.0, 205.9, 178.7, 151.2];

  private velToDir(velX: number, velY: number, angles = GameScene.CHAR_DIR_ANGLES): number {
    if (velX * velX + velY * velY < 20 * 20) return -1;
    const angleDeg = (Math.atan2(velY, velX) * 180 / Math.PI + 360) % 360;
    let best = 0, bestDiff = Infinity;
    for (let i = 0; i < 8; i++) {
      const diff = Math.abs(((angleDeg - angles[i] + 540) % 360) - 180);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    return best;
  }

  private wolfDir(dx: number, dy: number): number {
    if (dx * dx + dy * dy < 4) return -1;
    return this.velToDir(dx, dy, GameScene.WOLF_DIR_ANGLES);
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
    this.sceneTimeMs += delta;

    // agentB round2 — signature-structure camera bias. When the hero is close
    // to the fire the stations usually sit off-centre (e.g. L7 mill at [9,9]
    // while hero + fire are at [8,7]). Apply a camera follow offset pointing
    // *away* from the stations centroid (so the camera drifts toward the
    // stations — a negative offset moves the lens with the content). Strength
    // ramps 1 → 0 as hero moves > 260px away from the fire, so free-roam
    // still gets a hero-locked camera.
    if (this._hasStationsCentroid) {
      const cam = this.cameras.main;
      const dxf = this.playerLX - this.fireX;
      const dyf = this.playerLY - this.fireY;
      const distToFire = Math.sqrt(dxf*dxf + dyf*dyf);
      const NEAR = 180; const FAR = 420;
      const near01 = distToFire < NEAR ? 1 : distToFire > FAR ? 0 : 1 - (distToFire - NEAR) / (FAR - NEAR);
      // Direction from fire toward stations centroid (what we want to reveal).
      const bx = this._stationsCentroidX - this.fireX;
      const by = this._stationsCentroidY - this.fireY;
      const bias = 110 * near01; // up to 110 px of camera lead toward the stations
      const bLen = Math.max(1, Math.sqrt(bx*bx + by*by));
      cam.setFollowOffset(-(bx / bLen) * bias, -(by / bLen) * bias);
    }

    // Watchtower — fires arrows at nearest live wolf within range.
    // No worker required — tower is "manned" by its lookout sprite as soon as
    // it stands. Each cycle (default 1.2 s) spawns one arrow that tweens into
    // the target and applies damage on landing.
    for (const st of this.stations) {
      if (st.cfg.kind !== 'watchtower') continue;
      const cycle = st.cfg.cycleMs ?? DEFAULT_CYCLE_MS.watchtower;
      st.cycleMs = Math.max(0, st.cycleMs - delta);
      if (st.cycleMs > 0) continue;
      let best: AnimalEntity | null = null;
      let bestD2 = 240 * 240;
      for (const a of this.animals) {
        if (a.state === 'dead') continue;
        if (a.atlasKey !== 'wolf') continue;
        const d2 = (a.lx - st.sx) ** 2 + (a.ly - st.sy) ** 2;
        if (d2 < bestD2) { bestD2 = d2; best = a; }
      }
      if (!best) { st.cycleMs = cycle * 0.25; continue; }
      const target = best;
      const arrow = this.add.image(st.sx, st.sy - 40, 'projectile_arrow_01')
        .setDepth(2000).setDisplaySize(28, 8);
      this.tweens.add({
        targets: arrow, x: target.lx, y: target.ly - 20,
        duration: 320, ease: 'Linear',
        onComplete: () => {
          arrow.destroy();
          if (target.state === 'dead') return;
          target.hp -= 1; target.hitFlashMs = 180;
          this.woodchipEmitter.emitParticleAt(target.lx, target.ly - 20, 5);
          if (target.hp <= 0) this.killAnimal(target);
        },
      });
      st.cycleMs = cycle;
    }

    // Supply sled — check readiness each frame regardless of worker (sled is
    // passive once inputs arrive, no manning required).
    for (const st of this.stations) {
      if (st.cfg.kind !== 'supply_sled') continue;
      const inv = st.inputsByResource ?? (st.inputsByResource = {});
      const needMeat = 10; const needPlanks = 5; const payout = 200;
      if ((inv.meat_ground ?? 0) >= needMeat && (inv.plank ?? 0) >= needPlanks) {
        inv.meat_ground -= needMeat; inv.plank -= needPlanks;
        for (let i = 0; i < needMeat + needPlanks; i++) this.popPileSprite(st, true);
        this.coins += payout;
        this.supplyRunsCompleted += 1;
        this.advanceGoalStage();
        safePlay(this, 'snd_build_complete', { volume: 0.55 });
        const spr = st.sprite as Phaser.GameObjects.Image;
        this.tweens.add({
          targets: spr,
          x: { from: st.sx, to: st.sx + 300 },
          alpha: { from: 1, to: 0 }, duration: 900, ease: 'Quad.In',
          onComplete: () => { spr.setPosition(st.sx, st.sy).setAlpha(1); },
        });
      }
    }

    // Station manned-time accumulator (telemetry at WIN/LOSE).
    for (const st of this.stations) {
      if (st.workerId >= 0) {
        const anyst = st as unknown as { telMannedMs?: number };
        anyst.telMannedMs = (anyst.telMannedMs ?? 0) + delta;
      }
    }

    // Station visuals — tint reflects manned state and player-bumped priority.
    // Unmanned stations dim; bumped stations get a warm glow so the player
    // sees the result of tapping. Cheap per-frame tint set, no object alloc.
    for (const st of this.stations) {
      const spr = st.sprite as Phaser.GameObjects.Image;
      if (!spr) continue;
      if (st.workerId >= 0) {
        if (st.priorityBump < 0) spr.setTint(0xffe3a8);   // bumped + manned
        else                      spr.clearTint();         // manned (normal)
      } else {
        if (st.priorityBump < 0) spr.setTint(0xffdc8a);   // bumped + waiting
        else                      spr.setTint(0x9fa4aa);   // idle / dim
      }
    }

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

    // Player hit flash
    if (this.playerFlashMs > 0) {
      this.playerFlashMs = Math.max(0, this.playerFlashMs - delta);
      this.playerSprite.setTint(this.playerFlashMs > 0 ? 0xff2222 : 0xffffff);
      if (this.playerFlashMs <= 0) this.playerSprite.clearTint();
    }
    // Knockback decay
    if (this.playerKnockVX !== 0 || this.playerKnockVY !== 0) {
      const decay = Math.min(1, delta / 100);
      this.playerKnockVX *= (1 - decay); this.playerKnockVY *= (1 - decay);
      if (Math.abs(this.playerKnockVX) < 3) this.playerKnockVX = 0;
      if (Math.abs(this.playerKnockVY) < 3) this.playerKnockVY = 0;
    }

    // Compute target input velocity (joystick / keyboard)
    let targetVelX = 0; let targetVelY = 0;
    if (!this.playerDead) {
      const baseSpeed = cfg.player.speedPx * PLAYER_SPEED_MULT;
      if (this.joyActive) {
        const dx = this.joyCX - this.joyOX; const dy = this.joyCY - this.joyOY;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 12) { const inv = baseSpeed / len; targetVelX = dx * inv; targetVelY = dy * inv; }
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
          targetVelX = (kx / klen) * baseSpeed;
          targetVelY = (ky / klen) * baseSpeed;
        }
      }
    }

    // Smooth velocity toward target: 80ms ramp-up, 40ms brake
    const hasInput = targetVelX !== 0 || targetVelY !== 0;
    const tConst = hasInput ? PLAYER_ACCEL_MS : PLAYER_DECEL_MS;
    const lFactor = 1 - Math.exp(-delta / tConst);
    this.playerVelX += (targetVelX - this.playerVelX) * lFactor;
    this.playerVelY += (targetVelY - this.playerVelY) * lFactor;
    if (!hasInput && Math.abs(this.playerVelX) < 4) this.playerVelX = 0;
    if (!hasInput && Math.abs(this.playerVelY) < 4) this.playerVelY = 0;

    // Final velocity: smoothed input + knockback (knockback suppressed when player has input)
    let velX = this.playerVelX + (hasInput ? 0 : this.playerKnockVX);
    let velY = this.playerVelY + (hasInput ? 0 : this.playerKnockVY);

    const isMoving = velX !== 0 || velY !== 0;
    // inputVX/Y: smoothed direction only (excludes knockback, so facing never flips on hit)
    const inputVX = this.playerVelX; const inputVY = this.playerVelY;
    if (hasInput) { this.lastVelX = targetVelX; this.lastVelY = targetVelY; }
    else if (this.playerVelX !== 0 || this.playerVelY !== 0) { this.lastVelX = this.playerVelX; this.lastVelY = this.playerVelY; }

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
    // Use input velocity (pre-projection) so facing reflects pressed keys, not wall deflection.
    const pvx = isMoving ? inputVX : this.lastVelX;
    const pvy = isMoving ? inputVY : this.lastVelY;
    const rawDir = this.velToDir(pvx, pvy);
    const pds = this.stepDir(this.playerLastDir, this.pendingDir, this.pendingDirMs, rawDir, delta);
    this.playerLastDir = pds.lastDir; this.pendingDir = pds.pendingDir; this.pendingDirMs = pds.pendingMs;
    // While the hero is in an attack swing, keep the chop animation; don't let the
    // walk/idle frame overwrite it every tick (the old behaviour made the swing
    // invisible — hero just stood there and damage appeared out of nowhere).
    if (this.playerAttackMs > 0) {
      // Attack anim was started inside the attack branch; just hold it.
      this.playerSprite.anims.timeScale = 1;
    } else if (isMoving) {
      this.playCharAnim(this.playerSprite, 'hero', 'walk', this.playerLastDir);
      const spd = Math.sqrt(this.playerVelX * this.playerVelX + this.playerVelY * this.playerVelY);
      if (spd > 0) this.playerSprite.anims.timeScale = spd / BASE_WALK_SPEED;
    } else {
      this.showStaticWalk(this.playerSprite, 'hero', this.playerLastDir);
      this.playerSprite.anims.timeScale = 1;
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

    // Log icons stacked IN FRONT of the player (direction-aware), synced with bob.
    // 8-dir facing → front offset vector. Stack grows upward 1-N like the ads.
    const dirAng = (this.playerLastDir / 8) * Math.PI * 2 + Math.PI / 2; // dir0=down
    const fX = Math.cos(dirAng) * 18;
    const fY = Math.sin(dirAng) * 12 + 4;
    for (let i = 0; i < 4; i++) {
      this.logIcons[i].setVisible(i < this.carriedLogs);
      if (i < this.carriedLogs) {
        this.logIcons[i].setPosition(
          this.playerLX + fX,
          this.playerLY + this.playerBobY - CHAR_SIZE * 0.4 + fY - i * 10,
        );
        this.logIcons[i].setDepth(this.playerSprite.depth + 20 + i);
      }
    }
    // Keep hero animation on carry_walk while carrying logs (not just walk).
    if (this.carriedLogs > 0 && this.playerAttackMs <= 0 && isMoving) {
      this.playCharAnim(this.playerSprite, 'hero', 'carry_walk', this.playerLastDir);
    }

    this.dropZoneGfx.setVisible(this.carriedLogs > 0 || this.carriedMeat > 0);

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
      safePlay(this, 'snd_log_drop', { volume: 0.65 });
      this.time.delayedCall(250, () => safePlay(this, 'snd_coin_pickup', { volume: 0.55 }));
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
      const plankReq = padCfg.costPlanks ?? 0;
      const planksOk = plankReq === 0 || this.planksAvailable >= plankReq;
      if (inPadRange && this.coins > 0 && planksOk) {
        // Pay-in deposits full cost in ~2.5s regardless of per-level config so the
        // build never feels like dwelling. Progress persists via coinsPaidForTent even
        // if the player leaves and returns (never reset mid-level).
        const scaledRate = Math.max(padCfg.payRateCoinsPerSec ?? 0, padCfg.costCoins / 2.5);
        const pay = Math.min(this.coins, scaledRate * dt);
        this.coins -= pay; this.coinsPaidForTent += pay;
        this.updatePadSign();
        if (this.coinsPaidForTent >= padCfg.costCoins) {
          // Cabin-style pad: also deduct plank stock when complete.
          if (plankReq > 0) this.planksAvailable -= plankReq;
          this.buildTent();
        }
      } else if (inPadRange && this.coins === 0) {
        onPadWithNoCoins = true;
        this.updatePadSign();
      }
    }

    // Fuel & freeze — with optional warmup period where drain is scaled down.
    // For the first `warmupSec` seconds, drain is scaled by `warmupMul`; then over the next
    // `warmupSec` seconds it ramps linearly back to 1.0. This keeps the opening survivable
    // (per balance target: idle fire ≥ 90s) while preserving mid/late-level challenge.
    const warmupSec = (cfg.fire as any).fuelDrainWarmupSec ?? 0;
    const warmupMul = (cfg.fire as any).fuelDrainWarmupMul ?? 1;
    let drainMul = 1;
    if (warmupSec > 0 && warmupMul < 1) {
      const tSec = this.sceneTimeMs / 1000;
      if (tSec < warmupSec) {
        drainMul = warmupMul;
      } else if (tSec < warmupSec * 2) {
        const prog = (tSec - warmupSec) / warmupSec; // 0 → 1
        drainMul = warmupMul + (1 - warmupMul) * prog;
      }
    }
    // Wave 12 — blizzard event: triggers once rescuedCount hits threshold.
    // Multiplies fuel drain + freeze rate for a fixed duration; snow emitter
    // scales up for visual drama.
    const blz = (cfg as any).blizzard;
    if (blz && !this.blizzardTriggered && this.rescuedCount >= blz.triggerAtRescued) {
      this.blizzardTriggered = true;
      this.blizzardMs = (blz.durationSec ?? 60) * 1000;
      this.cameras.main.shake(180, 0.006);
      this.stageBannerText = getLang() === 'tr' ? 'KAR FIRTINASI!' : 'BLIZZARD!';
      this.stageBannerMs = 2500;
    }
    let blzFuelMul = 1; let blzFreezeMul = 1;
    if (this.blizzardMs > 0) {
      this.blizzardMs = Math.max(0, this.blizzardMs - delta);
      blzFuelMul = (blz?.fuelDrainMultiplier ?? 2);
      blzFreezeMul = (blz?.freezeMultiplier ?? 1.5);
    }
    this.fuel = Math.max(0, this.fuel - cfg.fire.fuelDrainPerSec * drainMul * blzFuelMul * dt);
    if (this.fuel === 0) {
      this.freezeMeter += cfg.fire.freezeRatePerSec * blzFreezeMul * dt;
      if (this.freezeMeter >= cfg.fire.freezeMax) { this.loseGame(); return; }
    } else {
      this.freezeMeter = Math.max(0, this.freezeMeter - 2 * dt);
    }

    // HP regen near fire or inside camp walls
    if (!this.playerDead && this.playerHp < this.playerHpMax) {
      const nearFire = (this.playerLX - this.fireX)**2 + (this.playerLY - this.fireY)**2 < 160**2;
      // Inline screenToIso — avoid per-frame object alloc
      const ox = cfg.originX; const oy = cfg.originY;
      const ix = ((this.playerLX - ox) / 40 + (this.playerLY - oy) / 20) / 2;
      const iy = ((this.playerLY - oy) / 20 - (this.playerLX - ox) / 40) / 2;
      const inCamp = ix >= 3 && ix <= 13 && iy >= 3 && iy <= 12;
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
          // Claim a unique ring slot right now so each thawed survivor heads for
          // its own spot around the fire — no queueing, no overlap.
          sv.workerSlot = this.nextWorkerSlot;
          this.nextWorkerSlot = (this.nextWorkerSlot + 1) % Math.max(1, this.numWorkerSlots);
          safePlay(this, 'snd_ice_shatter', { volume: 0.7 });
          // Remove all frozen visuals with ice shatter
          sv.iceGfx?.destroy(); sv.iceGfx = undefined;
          sv.frostEmitter?.destroy(); sv.frostEmitter = undefined;
          sv.sprite.clearTint();
          this.iceShatterEmitter.emitParticleAt(sv.lx, sv.ly - 38, 18);
          const excl = this.add.text(sv.lx, sv.ly - 80, '!', {
            fontFamily: "GameFont, cursive", fontSize: '34px', color: '#ffff00', stroke: '#000000', strokeThickness: 5,
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

    // Loose-group following: every follower steers toward the player directly, with
    // applySeparation pushing them apart. Replaces the old single-file trail that
    // jammed followers at the gate. Once close to camp, each picks a unique ring slot
    // around the fire and walks to it before thawing — no queueing.
    const slotR = Math.max(90, this.numWorkerSlots * 10);
    for (const sv of this.survivors) {
      if (sv.state !== 'following') continue;
      const svPrevLx = sv.lx; const svPrevLy = sv.ly;

      // Pick a ring slot the first time this follower crosses into camp range.
      if (sv.workerSlot === 0 && this.nextWorkerSlot > 0) {
        // Already assigned (default 0 can be ambiguous, so use a flag via stuckCheck)
      }
      // Target: ring slot if assigned, else follow player loosely
      const ringAngle = (sv.workerSlot >= 0 ? sv.workerSlot : 0) * (2 * Math.PI / Math.max(1, this.numWorkerSlots));
      const slotX = this.fireX + Math.cos(ringAngle) * slotR;
      const slotY = this.fireY + Math.sin(ringAngle) * slotR * 0.6; // iso squish

      // If near the fire area, target the ring slot; otherwise follow the player.
      const distToFire = Math.hypot(sv.lx - this.fireX, sv.ly - this.fireY);
      const useRingTarget = distToFire < cfg.survivorThawRangePx * 2;
      const tgtX = useRingTarget ? slotX : this.playerLX;
      const tgtY = useRingTarget ? slotY : this.playerLY;

      const dx = tgtX - sv.lx; const dy = tgtY - sv.ly;
      const d = Math.sqrt(dx * dx + dy * dy);
      const stopR = useRingTarget ? 6 : 68;  // ring slot: nearly on top; follow player: loose radius
      if (d > stopR) {
        const speed = cfg.workerWalkSpeed * WORKER_SPEED_MULT;
        // Pathing for the slow drift toward the ring slot — the player-follow
        // target moves fast so we only path when going to the ring.
        if (useRingTarget && d > 48) {
          this.ensurePathA(sv, tgtX, tgtY);
          const moved = this.followPathA(sv, speed, dt, true);
          if (!moved) {
            const move = Math.min(d - stopR, speed * dt);
            sv.lx += (dx / d) * move;
            sv.ly += (dy / d) * move;
          }
          const sr = this.checkStuck(sv, delta);
          if (sr === 'giveup') {
            sv.pathAttempts = 0;
            sv.path = undefined; sv.pathIdx = 0;
            sv.pathTargetX = undefined; sv.pathTargetY = undefined;
          }
        } else {
          const move = Math.min(d - stopR, speed * dt);
          sv.lx += (dx / d) * move;
          sv.ly += (dy / d) * move;
          sv.stuckMs = 0; sv.pathAttempts = 0;
        }
      } else {
        sv.stuckMs = 0; sv.pathAttempts = 0;
      }

      // Separation (reused) so the group spreads and never stacks at the gate.
      const sep = this.applySeparation(sv.lx, sv.ly, sv);
      const co = this.constrainToObstacles(sep.x, sep.y);
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

      // Arrived at ring slot → start thawing in place
      if (useRingTarget && d < 10) {
        // Face the fire while thawing
        const toFireDir = this.velToDir(this.fireX - sv.lx, this.fireY - sv.ly);
        if (toFireDir >= 0) sv.lastDir = toFireDir;
        sv.state = 'thawing';
      }
    }

    // Workers
    for (const sv of this.survivors) {
      if (sv.state === 'worker') { this.updateWorker(sv, dt, delta); this.syncCarrySprite(sv); }
    }

    // Camera (needed for depth sort + fire glow below)
    const cam = this.cameras.main;

    // Hint arrows — only redraw when something is visible; otherwise setVisible(false)
    // so the Graphics object is culled from the WebGL render entirely.
    const showFrozenHint = !!nearFrozen;
    const showPadHint = !this.tentBuilt && this.coins > 0 && !nearFrozen;
    if (showFrozenHint || showPadHint) {
      this.hintArrowGfx.clear();
      const iz = 1 / cam.zoom;
      if (showFrozenHint && nearFrozen) {
        const wx = nearFrozen.lx, wy = nearFrozen.ly;
        const a = 0.55 + 0.45 * Math.sin(time / 190);
        this.hintArrowGfx.fillStyle(0xffff33, a);
        this.hintArrowGfx.fillTriangle(wx, wy - 94*iz, wx - 10*iz, wy - 108*iz, wx + 10*iz, wy - 108*iz);
        this.hintArrowGfx.fillRect(wx - 4*iz, wy - 122*iz, 8*iz, 16*iz);
      }
      if (showPadHint) {
        const a = 0.6 + 0.4 * Math.sin(time / 200);
        this.hintArrowGfx.fillStyle(0x44ff88, a);
        this.hintArrowGfx.fillTriangle(this.padX, this.padY - 48*iz, this.padX - 10*iz, this.padY - 62*iz, this.padX + 10*iz, this.padY - 62*iz);
        this.hintArrowGfx.fillRect(this.padX - 4*iz, this.padY - 76*iz, 8*iz, 16*iz);
      }
      if (!this._hintArrowDrawn) { this.hintArrowGfx.setVisible(true); this._hintArrowDrawn = true; }
    } else if (this._hintArrowDrawn) {
      this.hintArrowGfx.clear().setVisible(false);
      this._hintArrowDrawn = false;
    }

    // Drop shadows — per-entity Image sprites (pre-rendered ellipse texture).
    // Position each shadow under its entity; off-screen entities get their shadow
    // toggled off. NO per-frame fillEllipse / earcut / texImage2D cost — a top
    // L15 hotspot (was ~21% of frame time via GraphicsWebGLRenderer + texImage2D).
    // Camera bounds for off-screen culling (with margin to avoid pop-in)
    const camLeft   = cam.scrollX - 80;
    const camRight  = cam.scrollX + cam.width / cam.zoom + 80;
    const camTop    = cam.scrollY - 80;
    const camBottom = cam.scrollY + cam.height / cam.zoom + 80;
    const inView = (x: number, y: number) => x >= camLeft && x <= camRight && y >= camTop && y <= camBottom;
    this.playerShadow.setPosition(this.playerLX, this.playerLY);
    // Fire, trees, tent are static — set in create()/buildTent, no per-frame work.
    for (const sv of this.survivors) {
      if (!sv.shadow) continue;
      const visible = sv.sprite.alpha > 0 && inView(sv.lx, sv.ly);
      sv.shadow.setVisible(visible);
      if (visible) sv.shadow.setPosition(sv.lx, sv.ly);
    }

    // ── Animals ────────────────────────────────────────────────────────────────
    this.playerAttackMs = Math.max(0, this.playerAttackMs - delta);

    // Player attacks nearest wolf in range — triggered when wolf comes close enough
    if (!this.playerDead && this.playerAttackMs <= 0) {
      let nearestAnimal: AnimalEntity | null = null;
      let nearestDist2 = Infinity;
      for (const a of this.animals) {
        if (a.state === 'dead') continue;
        const d2 = (this.playerLX - a.lx)**2 + (this.playerLY - a.ly)**2;
        // Peaceful animals (stags) have attackRange=0; use a floor so the
        // hero can still land a melee hit at ~70px.
        const effRange = Math.max(a.spec.attackRange, 70);
        if (d2 < effRange * effRange && d2 < nearestDist2) { nearestDist2 = d2; nearestAnimal = a; }
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
          safePlay(this, 'snd_axe_chop', { volume: 0.55 });
          hitTarget.hp--; hitTarget.hitFlashMs = 180;
          // Impact burst at wolf (pooled emitter)
          this.woodchipEmitter.emitParticleAt(hitTarget.lx, hitTarget.ly - 20, 8);
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
            if ((hitTarget.atlasKey === 'deer' || hitTarget.atlasKey === 'stag')
                && hitTarget.hp < hitTarget.maxHp * hitTarget.spec.fleeBelowHpPct) {
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
          if (a.sprite.active) {
            a.sprite.setAlpha(a.deathMs / 600).setAngle(a.sprite.angle + delta * 0.12);
            if (a.deathMs <= 0) {
              // Death animation complete — destroy sprite, remove from depth group
              const di = this.depthGroup.indexOf(a.sprite);
              if (di >= 0) this.depthGroup.splice(di, 1);
              a.sprite.destroy();
            }
          }
        }
        a.respawnMs = Math.max(0, a.respawnMs - delta);
        if (a.respawnMs <= 0 && a.deathMs <= 0) this.respawnAnimal(a);
        continue;
      }

      // Off-screen roaming animals: skip the full AI/anim update this frame.
      // We still tick the roam timer so they'll pick a fresh target when they
      // re-enter view. Aggroed animals (circle/windup/lunge/backoff/flee) are
      // always near the player, so they stay in view and keep updating.
      if (a.state === 'roam' && !inView(a.lx, a.ly)) {
        const d2Fast = (this.playerLX - a.lx) ** 2 + (this.playerLY - a.ly) ** 2;
        if (d2Fast > (a.spec.aggroRange * 1.8) ** 2) {
          a.roamChangeMs = Math.max(0, a.roamChangeMs - delta);
          continue;
        }
      }

      // Track previous position for direction computation
      const prevAnimalLx = a.lx; const prevAnimalLy = a.ly;

      const distToPlayer = Math.sqrt((this.playerLX - a.lx)**2 + (this.playerLY - a.ly)**2);

      if (a.state === 'flee') {
        // ── Flee: run away from player ──────────────────────────────────────
        a.fleeMs = Math.max(0, a.fleeMs - delta);
        if (a.fleeMs <= 0) { a.state = 'roam'; a.huntTargetIdx = -1; a.sprite.setTint(a.baseTint); }
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
        if (distToPlayer > a.spec.aggroRange * 2.5) { a.state = 'roam'; a.huntTargetIdx = -1; a.sprite.setTint(a.baseTint); }

      } else if (a.state === 'windup') {
        // ── Windup: pause, crouch (scale pulse), face player ─────────────────
        a.stateTimer = Math.max(0, a.stateTimer - delta);
        // Scale pulse based on the wolf's own displaySize so alpha wolves stay large
        const windPct = 1 - a.stateTimer / a.spec.windupMs;
        const crouchScale = 1 - 0.12 * Math.sin(windPct * Math.PI);
        const bs = a.displaySize / 192; // 192 = wolf atlas sourceSize.w
        a.sprite.setScale(bs * (2 - crouchScale), bs * crouchScale);
        if (a.hitFlashMs <= 0) a.sprite.setTint(0xff8844); // orange-red = about to attack
        // Capture fresh player position each frame of windup
        a.lungeTargetX = this.playerLX; a.lungeTargetY = this.playerLY;
        if (a.stateTimer <= 0) {
          a.state = 'lunge'; a.stateTimer = 500;
          a.sprite.setDisplaySize(a.displaySize, a.displaySize); // restore display size after crouch
        }

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
          a.huntTargetIdx = -1;
        } else if (a.huntTargetIdx >= 0 && (a.stateTimer <= 0 || llen < 8)) {
          // Wolf lunged at a worker and reached/timed out. One attempt only.
          // If the hero is within 250 px, immediately switch to hunting the hero.
          // Otherwise retreat (backoff) and clear the worker target so the
          // wolf doesn't spin up another worker-hunt on the next tick.
          if (distToPlayer < 250) {
            a.state = 'windup';
            a.stateTimer = a.spec.windupMs;
            a.lungeTargetX = this.playerLX; a.lungeTargetY = this.playerLY;
            a.huntTargetIdx = -1;
          } else {
            a.state = 'backoff'; a.stateTimer = 600;
            a.huntTargetIdx = -1;
          }
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
          a.state = 'circle';
          a.circleAngle = Math.atan2(a.ly - this.playerLY, a.lx - this.playerLX);
          a.circleDir = Math.random() > 0.5 ? 1 : -1;
          // Wolves re-engage fast; deer (and summoned minions) wait longer
          a.stateTimer = a.atlasKey === 'deer' ? 1500 + Math.random() * 2000 : 300 + Math.random() * 400;
        }

      } else {
        // ── Roam: wander randomly ─────────────────────────────────────────────
        a.roamChangeMs = Math.max(0, a.roamChangeMs - delta);
        if (a.roamChangeMs <= 0) this.pickRoamTarget(a);
        const ax = a.targetLx - a.lx; const ay = a.targetLy - a.ly;
        const ad2 = ax*ax + ay*ay;
        if (ad2 > 64) {
          // Pathing for roaming animals so they walk around trees/fences
          // instead of grinding into them (needed for L8+ with heavy decor).
          this.ensurePathA(a, a.targetLx, a.targetLy);
          const moved = this.followPathA(a, a.spec.speed, dt, false);
          if (!moved) {
            const ad = Math.sqrt(ad2);
            a.lx += (ax/ad)*a.spec.speed*dt;
            a.ly += (ay/ad)*a.spec.speed*dt;
          }
          const sr = this.checkStuck(a, delta);
          if (sr === 'giveup') { this.pickRoamTarget(a); a.pathAttempts = 0; }
        } else {
          a.stuckMs = 0; a.pathAttempts = 0;
        }
        // Pick the closest viable target (player or a worker outside the fire ring).
        // Workers get hunted when wolves can reach them, breaking production chains
        // until the hero clears the wolves — "Wolves at the Lake" (Wave 4).
        let bestTx = this.playerLX, bestTy = this.playerLY, bestIdx = -1;
        let bestD2 = (this.playerLX - a.lx)**2 + (this.playerLY - a.ly)**2;
        // Rule: max 1 wolf hunts workers at a time. If any OTHER wolf already
        // has a worker target, this wolf must go after the player.
        const anotherHunting = this.animals.some(b =>
          b !== a && b.state !== 'dead' && b.huntTargetIdx >= 0,
        );
        if (!anotherHunting) {
          for (let wi = 0; wi < this.survivors.length; wi++) {
            const w = this.survivors[wi];
            if (w.state !== 'worker') continue;
            if (w.workerState === 'fleeing') continue;
            if (w.workerState !== 'atStation' && w.workerState !== 'haul') continue;
            const fdx = w.lx - this.fireX, fdy = w.ly - this.fireY;
            if (fdx*fdx + fdy*fdy < 85*85) continue;
            const d2 = (w.lx - a.lx)**2 + (w.ly - a.ly)**2;
            if (d2 < bestD2 && d2 < (a.spec.aggroRange * 1.2)**2) {
              bestD2 = d2; bestTx = w.lx; bestTy = w.ly; bestIdx = wi;
            }
          }
        }
        if (bestD2 < a.spec.aggroRange * a.spec.aggroRange) {
          // Charge on sight — skip the leisurely orbit and commit to windup+lunge.
          a.state = 'windup';
          a.stateTimer = a.spec.windupMs;
          a.lungeTargetX = bestTx; a.lungeTargetY = bestTy;
          a.huntTargetIdx = bestIdx;
          // Trigger flee on the targeted worker.
          if (bestIdx >= 0) {
            const fleeWorker = this.survivors[bestIdx];
            fleeWorker.workerState = 'fleeing';
            // 8-second huddle at fire — prevents an instant re-flee loop when the
            // same wolf is still alive and roaming nearby after the worker came
            // back out. Worker returns to its station after the timer OR when the
            // hunting wolf is dead.
            fleeWorker.fleeMs = 8000;
            if (fleeWorker.workerStation) {
              fleeWorker.workerStation.workerId = -1;
              fleeWorker.workerStation = null;
            }
            if (fleeWorker.workerHaulId) {
              fleeWorker.workerHaulId = null;
              fleeWorker.workerHaulDest = null;
            }
          }
        }
      }

      // Keep animal outside palisade (iso 3,3–13,12) with body-radius margin.
      // Catch-all: push to nearest outer wall whenever the body overlaps the boundary.
      // Handles normal approach, fast lunges, and wolves spawned near the wall.
      {
        const ox = cfg.originX; const oy = cfg.originY;
        const HW = TILE_W / 2; const HH = TILE_H / 2;
        const wallMargin = a.displaySize / 80 + 0.5; // body half-width in ISO units (~2.3 wolf, ~3.375 alpha)
        const outerW = 3 - wallMargin, outerE = 13 + wallMargin;
        const outerN = 3 - wallMargin, outerS = 12 + wallMargin;

        // Inline screenToIso — avoid per-animal per-frame object alloc
        const ix0 = ((a.lx - ox) / HW + (a.ly - oy) / HH) / 2;
        const iy0 = ((a.ly - oy) / HH - (a.lx - ox) / HW) / 2;

        if (ix0 > outerW && ix0 < outerE && iy0 > outerN && iy0 < outerS) {
          // Inside or within margin — push to nearest outer edge
          const dW = ix0 - outerW, dE = outerE - ix0, dN = iy0 - outerN, dS = outerS - iy0;
          const minD = Math.min(dW, dE, dN, dS);
          let newIx = ix0, newIy = iy0;
          if      (minD === dW) newIx = outerW;
          else if (minD === dE) newIx = outerE;
          else if (minD === dN) newIy = outerN;
          else                  newIy = outerS;

          a.lx = ox + (newIx - newIy) * HW;
          a.ly = oy + (newIx + newIy) * HH;
          if (a.state === 'lunge' || a.state === 'windup') {
            a.state = 'backoff'; a.stateTimer = 300;
          } else if (a.state === 'roam') {
            this.pickRoamTarget(a); // blocked roam target — pick a new one outside wall
          }
          // circle/backoff stay in state: wolf paces along wall following the player
        }
      }

      // ── Animal-animal separation (roam-only) ────────────────────────────
      // Only spread wolves while they're idle-wandering. Pre-Wave-4 wolves
      // clustered near the player; spreading them during circle/windup/lunge
      // scattered them across choke-points on L9 and the bot could no longer
      // reach deep-south survivors in time. Restricting sep to 'roam' keeps
      // the visual anti-overlap for idle packs and reproduces pre-Wave-4
      // combat positioning.
      if (a.state === 'roam') {
        const sepR = Math.max(24, a.displaySize * 0.30);
        const sepR2 = sepR * sepR;
        for (const b of this.animals) {
          if (b === a) continue;
          if (b.state === 'lunge' || b.state === 'flee') continue;
          const dxs = a.lx - b.lx; const dys = a.ly - b.ly;
          const d2s = dxs*dxs + dys*dys;
          if (d2s < sepR2 && d2s > 0.01) {
            const ds = Math.sqrt(d2s);
            const push = (sepR - ds) * 0.5;
            const ux = dxs / ds; const uy = dys / ds;
            a.lx += ux * push; a.ly += uy * push;
          }
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

          // Fall back to walk when the requested anim doesn't exist (missing frames)
          if (!this.anims.exists(wantAnim)) wantAnim = `${a.atlasKey}_walk_d${a.dir}`;

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

      // Shadow — only when sprite is visible and on-screen
      if (a.shadow) {
        const visible = a.sprite.alpha > 0 && inView(a.lx, a.ly);
        a.shadow.setVisible(visible);
        if (visible) a.shadow.setPosition(a.lx, a.ly);
      }
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
        safePlay(this, 'snd_log_drop', { volume: 0.45 });
      }
    }
    if (cookCfg && this.cookQueue > 0) {
      this.cookTimer -= delta;
      if (this.cookTimer <= 0) {
        this.cookQueue--; this.cookTimer = cookCfg.cookTimeMs;
        this.coins += cookCfg.meatToCoins;
        this.time.delayedCall(120, () => safePlay(this, 'snd_coin_pickup', { volume: 0.45 }));
        const p = this.add.text(this.fireX, this.fireY - 50, `+${cookCfg.meatToCoins}`, {
          fontFamily:"GameFont,cursive", fontSize:'24px', color:'#ff9944', stroke:'#000', strokeThickness:4,
        }).setOrigin(0.5,1).setDepth(1003);
        this.tweens.add({ targets: p, y: this.fireY - 120, alpha: 0, duration: 1200, ease:'Quad.Out', onComplete: ()=>p.destroy() });
      }
    }
    // ── Stage-advance banner ───────────────────────────────────────────────────
    if (this.stageBannerMs > 0) {
      this.stageBannerMs = Math.max(0, this.stageBannerMs - delta);
    }

    // Depth sort — only update depth for on-screen sprites whose y actually moved.
    // We cache the last applied y on the sprite itself. Calling setDepth marks
    // the display list dirty for a re-sort; skipping unchanged sprites reduces
    // dirty flags from ~100/frame (L15) to ~a dozen moving entities.
    for (const sp of this.depthGroup) {
      if (!inView(sp.x, sp.y)) continue;
      const y = sp.y;
      if ((sp as any)._lastDepthY === y) continue;
      (sp as any)._lastDepthY = y;
      sp.setDepth(sp === this.fireSprite ? y + 17 : y);
    }

    // Player HP bar (world-space, above head + any carried items)
    // Skip entire redraw when HP is full or player is dead; also setVisible(false)
    // so the Graphics object is culled from the WebGL render entirely.
    if (!this.playerDead && this.playerHp < this.playerHpMax) {
      this.playerHpBarGfx.clear();
      const bw = 44; const bx = this.playerLX - bw / 2;
      // Anchor the HP bar just above the hero's head. The old formula shifted it up
      // by (carriedLogs * 14 + 20) which stacked a full character-height for a
      // 4-log carry — the bar would detach and float near the fence.
      const by = this.playerLY + this.playerBobY - CHAR_SIZE - 14;
      this.playerHpBarGfx.fillStyle(0x222222, 0.8).fillRoundedRect(bx - 1, by - 1, bw + 2, 8, 3);
      const pct = this.playerHp / this.playerHpMax;
      const col = pct > 0.5 ? 0x44ff44 : pct > 0.25 ? 0xffaa00 : 0xff2222;
      this.playerHpBarGfx.fillStyle(col, 1).fillRoundedRect(bx, by, Math.max(0, bw * pct), 6, 2);
      if (!this._hpBarDrawn) { this.playerHpBarGfx.setVisible(true); this._hpBarDrawn = true; }
    } else if (this._hpBarDrawn) {
      this.playerHpBarGfx.clear().setVisible(false);
      this._hpBarDrawn = false;
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
      if (this.hintTimer < 8000) hintMsg = t('walkToTrees');
      else if (this.carriedLogs > 0) hintMsg = t('carryToFire');
      else if (!this.tentBuilt && this.coins >= 10) hintMsg = t('standOnPad');
      else if (nearFrozen && nearDist > cfg.survivorFollowRangePx) hintMsg = t('walkToSurvivor');
    }
    // Goal text from active stage or legacy tent progress
    this.advanceGoalStage();
    let goalStr: string;
    if (this.goalStages.length > 0 && this.currentStageIdx < this.goalStages.length) {
      const stage = this.goalStages[this.currentStageIdx];
      goalStr = (getLang() === 'tr' && stage.hintTextTr) ? stage.hintTextTr : stage.hintText;
    } else if (this.goalStages.length > 0) {
      goalStr = t('allGoalsComplete');
    } else {
      if (this.tentBuilt) {
        goalStr = t('tentBuiltOk');
      } else {
        const remaining = Math.max(0, padCfg.costCoins - Math.floor(this.coinsPaidForTent));
        goalStr = tFmt('tentProgress', { left: remaining });
      }
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
      survivorGoal: cfg.goal.survivorsToRescue,
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
      levelNum:   this.currentLevelNum,
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
      sv.sprite.anims.timeScale = (cfg.workerWalkSpeed * WORKER_SPEED_MULT) / BASE_WALK_SPEED;
    } else {
      this.showStaticWalk(sv.sprite, 'worker', sv.lastDir);
      sv.sprite.anims.timeScale = 1;
    }

    sv.sprite.x = sv.lx;
    sv.sprite.y = sv.ly + sv.waddleBobY;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private spawnWoodChips(x: number, y: number): void {
    this.woodchipEmitter.emitParticleAt(x, y, 14);
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
      fontFamily: "GameFont, cursive", fontSize: '28px', color: '#ffd700',
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
    // Pad can be a tent (coins only) or a cabin (planks + coins). Use the
    // asset key the level config provides so both render correctly.
    const padCfg = cfg.buildPads[0];
    const assetKey = padCfg.asset ?? 'building_tent_canvas_01';
    const isCabin = assetKey.startsWith('building_cabin');
    this.tentShadow = this.add.image(this.padX, this.padY, 'entity_shadow')
      .setDisplaySize(isCabin ? 86 : 70, isCabin ? 30 : 26).setDepth(2);
    this.tentSprite = this.add.image(this.padX, this.padY, assetKey)
      .setDisplaySize(isCabin ? 118 : 104, isCabin ? 118 : 104).setOrigin(0.5, 0.85);
    this.depthGroup.push(this.tentSprite);
    this.obstacles.push({ x: this.padX, y: this.padY, r: 30 });
    this.navGrid.setObstacles(this.obstacles);
    this.tweens.add({
      targets: this.tentSprite,
      scaleX: { from: 0, to: this.tentSprite.scaleX },
      scaleY: { from: 0, to: this.tentSprite.scaleY },
      duration: 380, ease: 'Back.Out',
    });
    this.cameras.main.shake(320, 0.007);
    safePlay(this, 'snd_build_complete', { volume: 0.75 });
    this.advanceGoalStage();
    this.checkWin();
  }

  private thawSurvivor(s: Survivor): void {
    s.state = 'worker'; s.workerState = 'idle'; s.activeAnim = 'idle';
    s.sprite.clearTint();
    s.thawBar?.destroy(); s.thawBar = undefined;
    // Small steam puff + ice crack at completion (user-visible "thawed" cue).
    this.iceShatterEmitter.emitParticleAt(s.lx, s.ly - 28, 10);
    s.treeIndex = this.nextWorkerTreeIndex;
    this.nextWorkerTreeIndex = (this.nextWorkerTreeIndex + 1) % Math.max(1, this.trees.length);
    // workerSlot was claimed when state → 'following'; do not re-assign.
    s.stuckMs = 0; s.stuckCheckX = s.lx; s.stuckCheckY = s.ly;
    this.rescuedCount++;
    this.advanceGoalStage();
    this.checkWin();
  }

  // Sprite key for a resource item — used for visible piles + carry overlays.
  private resourceSpriteKey(rid: ResourceId): string {
    switch (rid) {
      case 'log':         return 'resource_wood_logs_01';
      case 'fish_raw':    return 'resource_fish_raw_01';
      case 'fish_clean':  return 'resource_fish_raw_01';
      case 'cooked':      return 'resource_fish_raw_01';
      case 'plank':       return 'resource_plank_01';
      case 'meat_raw':    return 'resource_meat_chunk_01';
      case 'meat_ground': return 'resource_meat_ground_01';
      default:            return '';
    }
  }

  // Add a small sprite on the station's pile. Sprites stack diagonally so a
  // stack of 3-6 is clearly visible like in the reference ads.
  private pushPileSprite(station: StationInstance, rid: ResourceId, isInput: boolean): void {
    const key = this.resourceSpriteKey(rid);
    if (!key || !this.textures.exists(key)) return;
    const arr = isInput ? (station.inputPileSprites as Phaser.GameObjects.Image[])
                        : (station.pileSprites as Phaser.GameObjects.Image[]);
    const idx = arr.length;
    // Stack: output goes to right of station foot; input goes to left.
    const side = isInput ? -1 : 1;
    const dx = side * (28 + (idx % 3) * 6);
    const dy = -6 - Math.floor(idx / 3) * 10;
    const sp = this.add.image(station.sx + dx, station.sy + dy, key)
      .setDisplaySize(26, 26).setOrigin(0.5, 1.0).setDepth(station.sy + 2);
    arr.push(sp);
    // Count badge updates for piles > 6 (we only render 6 sprites max to keep perf)
    if (arr.length > 6) sp.setVisible(false);
    this.refreshStationPileText(station);
  }

  private popPileSprite(station: StationInstance, isInput: boolean): void {
    const arr = isInput ? (station.inputPileSprites as Phaser.GameObjects.Image[])
                        : (station.pileSprites as Phaser.GameObjects.Image[]);
    const sp = arr.pop();
    if (sp) sp.destroy();
    this.refreshStationPileText(station);
  }

  private refreshStationPileText(station: StationInstance): void {
    const tx = station.pileText as Phaser.GameObjects.Text;
    const total = station.outputCount + station.inputCount;
    if (total > 6) {
      tx.setText(`×${total}`).setVisible(true);
    } else {
      tx.setVisible(false);
    }
  }

  // Sprite key for each station kind (pulled from the stations_v1 asset set).
  private stationSpriteKey(kind: StationKind): string {
    switch (kind) {
      case 'ice_hole':       return 'station_ice_hole_01';
      case 'cleaning_table': return 'station_fish_cleaning_table_01';
      case 'cook_pot':       return 'station_cook_pot_01';
      case 'lumber_mill':    return 'station_lumber_mill_01';
      case 'butcher_table':  return 'station_butcher_table_01';
      case 'meat_grinder':   return 'station_meat_grinder_01';
      case 'supply_sled':    return 'station_supply_sled_01';
      case 'watchtower':     return 'building_watchtower_01';
      case 'fire':           return '';
      default:               return '';
    }
  }

  // Resolve the destination for a hauler holding this resource. Prefers a
  // consumer station of the mapped kind; falls back to the fire ("drop here").
  // Wave 7 fallback: meat_raw with no meat_grinder routes to the cook_pot
  // (which consumes meat_raw as an alternate input).
  private resolveHaulDest(
    rid: ResourceId,
  ): { kind: 'fire' } | { kind: 'station'; station: StationInstance } {
    const target = HAUL_DESTINATION[rid];
    // Planks: if a supply_sled exists on this level, haul planks to it first.
    if (rid === 'plank') {
      const sleds = this.stations.filter(s => s.cfg.kind === 'supply_sled');
      if (sleds.length > 0) {
        sleds.sort((a, b) => (a.inputsByResource?.plank ?? 0) - (b.inputsByResource?.plank ?? 0));
        return { kind: 'station', station: sleds[0] };
      }
    }
    if (target === 'fire') return { kind: 'fire' };
    let candidates = this.stations.filter(s => s.cfg.kind === target);
    if (candidates.length === 0 && rid === 'meat_raw') {
      candidates = this.stations.filter(s => s.cfg.kind === 'cook_pot');
    }
    if (candidates.length === 0 && rid === 'meat_ground') {
      // Wave 8 fallback: no supply_sled yet → feed cook_pot with ground meat
      // so the butcher → grinder → cook chain closes without L12 content.
      candidates = this.stations.filter(s => s.cfg.kind === 'cook_pot');
    }
    if (candidates.length === 0) return { kind: 'fire' };
    // Sort supply_sled by (meat_ground count) ascending so haulers spread.
    if (candidates[0].cfg.kind === 'supply_sled') {
      candidates.sort((a, b) =>
        (a.inputsByResource?.[rid] ?? 0) - (b.inputsByResource?.[rid] ?? 0));
    } else {
      candidates.sort((a, b) => a.inputCount - b.inputCount);
    }
    return { kind: 'station', station: candidates[0] };
  }

  // Convert a delivered resource unit at the fire to in-game gameplay effect.
  // For logs this reproduces the existing fuel+coin reward; for fish_raw +
  // cooked etc. it awards coins for now (future waves will route via stages).
  private deliverToFire(rid: ResourceId): void {
    if (rid === 'log') {
      this.fuel = Math.min(cfg.fire.fuelMax, this.fuel + cfg.fire.fuelPerLog);
      this.coins += cfg.fire.coinsPerLog;
    } else if (rid === 'fish_raw' || rid === 'fish_clean') {
      // L4: counts as fish caught for the stage; L5 funnels through cook_pot
      // first so "delivery to fire" for a fish typically is cooked food.
      this.fishCaught += 1;
      this.coins += 6;
      this.advanceGoalStage();
    } else if (rid === 'cooked') {
      this.cookedServed += 1;
      this.coins += 10;
      this.fuel = Math.min(cfg.fire.fuelMax, this.fuel + Math.floor(cfg.fire.fuelPerLog / 2));
      this.advanceGoalStage();
    } else if (rid === 'plank') {
      // Planks pile at the fire for cabin construction.
      this.planksAvailable += 1;
      this.coins += 3;
      this.advanceGoalStage();
    } else {
      // meat_raw/ground etc. fallback.
      this.coins += 5;
    }
  }

  // Stacked item sprites held IN FRONT of the worker's body while hauling.
  // Uses the real resource art (resource_fish_raw_01, resource_plank_01, etc.)
  // with carry_walk anim driven by the `activeAnim = 'carry_walk'` set in the
  // haul branch. Stack height scales with haul count (currently 1 per worker,
  // reads as 1-N when carrying is expanded).
  private syncCarrySprite(w: Survivor): void {
    const haulId = w.workerHaulId ?? null;
    const n = haulId ? 1 : 0;            // workers carry 1 unit per haul cycle
    if (!w.carrySprites) w.carrySprites = [];
    // Destroy excess sprites
    while (w.carrySprites.length > n) {
      const sp = w.carrySprites.pop(); if (sp) sp.destroy();
    }
    if (n === 0) return;
    const key = this.resourceSpriteKey(haulId!);
    if (!key || !this.textures.exists(key)) return;
    // Front-of-body offset based on facing direction (8 dirs).
    const ang = (w.lastDir / 8) * Math.PI * 2 + Math.PI / 2;  // dir 0 = down
    const fx = Math.cos(ang) * 16;
    const fy = Math.sin(ang) * 10 + CHAR_SIZE * 0.1;
    for (let i = 0; i < n; i++) {
      if (!w.carrySprites[i]) {
        w.carrySprites[i] = this.add.image(0, 0, key)
          .setDisplaySize(22, 22).setOrigin(0.5, 0.8).setDepth(w.sprite.depth + 20 + i);
      }
      const sp = w.carrySprites[i];
      sp.setTexture(key);
      sp.x = w.lx + fx;
      sp.y = w.ly + w.waddleBobY - CHAR_SIZE * 0.4 - i * 8 + fy;
      sp.setDepth(w.sprite.depth + 20 + i);
    }
    // Ensure carry_walk anim plays (worker atlas has it).
    if (w.activeAnim !== 'carry_walk') w.activeAnim = 'carry_walk';
  }

  // ─── NavGrid follower (generic across workers, survivors, animals) ────────
  // A "path agent" is any object with lx/ly + path state fields.
  //
  // Recompute policy: only recompute when the target actually changes.
  // An "exhausted" path (pathIdx >= length) stays exhausted — the caller does
  // the last-leg direct approach. This stops oscillating units (pushed back
  // by separation/collision) from calling A* every frame.
  private ensurePathA(a: PathState, tx: number, ty: number): boolean {
    if (a.pathTargetX !== tx || a.pathTargetY !== ty) {
      const p = this.navGrid.findPath(a.lx, a.ly, tx, ty);
      a.path = p; a.pathIdx = 0; a.pathTargetX = tx; a.pathTargetY = ty;
      (a as unknown as { telRepaths?: number }).telRepaths =
        ((a as unknown as { telRepaths?: number }).telRepaths ?? 0) + 1;
      return p.length > 0;
    }
    return !!a.path && a.pathIdx != null && a.pathIdx < a.path.length;
  }

  // Follows the active path at `speed` px/s. If `project` is true the velocity
  // is passed through projectVelocityFromWalls for wall-slide (used for the
  // hero/worker who live inside the camp). Animals already clamp themselves
  // to the camp outer edge in a dedicated post-step so they skip projection.
  private followPathA(a: PathState, speed: number, dt: number, project: boolean): boolean {
    if (!a.path || a.pathIdx == null || a.pathIdx >= a.path.length) return false;
    while (a.pathIdx < a.path.length) {
      const wp = a.path[a.pathIdx];
      const dx = wp.x - a.lx; const dy = wp.y - a.ly;
      if (dx * dx + dy * dy < 22 * 22) { a.pathIdx++; continue; }
      break;
    }
    if (a.pathIdx >= a.path.length) return false;
    const wp = a.path[a.pathIdx];
    const dx = wp.x - a.lx; const dy = wp.y - a.ly;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    let vx = (dx / d) * speed; let vy = (dy / d) * speed;
    if (project) {
      const proj = this.projectVelocityFromWalls(vx, vy, a.lx, a.ly);
      vx = proj.vx; vy = proj.vy;
    }
    a.lx += vx * dt; a.ly += vy * dt;
    const dir = this.velToDir(vx, vy);
    if (dir >= 0 && 'lastDir' in a) {
      (a as unknown as { lastDir: number }).lastDir = dir;
    }
    return true;
  }

  // 1 s stuck (<4px moved) → force repath (by invalidating target cache).
  // 3 failed repaths → return 'giveup'. The caller decides what give-up means.
  private checkStuck(a: PathState, delta: number): 'ok' | 'repath' | 'giveup' {
    a.stuckMs += delta;
    if (a.stuckMs < 1000) return 'ok';
    const movedSq = (a.lx - a.stuckCheckX) ** 2 + (a.ly - a.stuckCheckY) ** 2;
    a.stuckMs = 0; a.stuckCheckX = a.lx; a.stuckCheckY = a.ly;
    if (movedSq >= 16) { a.pathAttempts = 0; return 'ok'; }
    (a as unknown as { telStuckEvents?: number }).telStuckEvents =
      ((a as unknown as { telStuckEvents?: number }).telStuckEvents ?? 0) + 1;
    a.pathAttempts = (a.pathAttempts ?? 0) + 1;
    // Invalidate the cached target so the next ensurePath call recomputes.
    a.path = undefined; a.pathIdx = 0;
    a.pathTargetX = undefined; a.pathTargetY = undefined;
    return (a.pathAttempts ?? 0) >= 3 ? 'giveup' : 'repath';
  }

  // ─── Worker-specific wrappers that handle "give up" by releasing station ──
  private ensurePath(w: Survivor, tx: number, ty: number): boolean {
    return this.ensurePathA(w, tx, ty);
  }
  private followPath(w: Survivor, speed: number, dt: number): boolean {
    return this.followPathA(w, speed, dt, true);
  }
  private stuckRepath(w: Survivor, delta: number): boolean {
    const r = this.checkStuck(w, delta);
    if (r !== 'giveup') return false;
    if (w.workerStation) { w.workerStation.workerId = -1; w.workerStation = null; }
    w.workerHaulId = null; w.workerHaulDest = null;
    w.workerState = 'idle';
    w.pathAttempts = 0;
    return true;
  }

  private updateWorker(w: Survivor, dt: number, delta: number): void {
    if (!w.workerState) w.workerState = 'idle';
    const prevLxW = w.lx; const prevLyW = w.ly;
    // Telemetry accounting (per-frame per-worker — microscopic cost).
    switch (w.workerState) {
      case 'idle':      w.telTimeIdleMs    = (w.telTimeIdleMs    ?? 0) + delta; break;
      case 'toTree':
      case 'toFire':
      case 'toStation':
      case 'haul':      w.telTimeWalkingMs = (w.telTimeWalkingMs ?? 0) + delta; break;
      case 'chopping':
      case 'atStation': w.telTimeWorkingMs = (w.telTimeWorkingMs ?? 0) + delta; break;
      case 'fleeing':   w.telTimeFleeingMs = (w.telTimeFleeingMs ?? 0) + delta; break;
    }

    switch (w.workerState) {
      case 'fleeing': {
        // NavGrid path through palisade gate; fallback to projectVelocityFromWalls
        // if the grid can't find a path.
        const dxF = this.fireX - w.lx; const dyF = this.fireY - w.ly;
        const dF = Math.sqrt(dxF*dxF + dyF*dyF);
        if (dF > 55) {
          const fleeSpeed = cfg.workerWalkSpeed * WORKER_SPEED_MULT * 1.5;
          this.ensurePath(w, this.fireX, this.fireY);
          const moved = this.followPath(w, fleeSpeed, dt);
          if (!moved) {
            const wvF = this.projectVelocityFromWalls((dxF/dF)*fleeSpeed, (dyF/dF)*fleeSpeed, w.lx, w.ly);
            w.lx += wvF.vx * dt; w.ly += wvF.vy * dt;
          }
          const toFireDir = this.velToDir(dxF, dyF);
          if (toFireDir >= 0) w.lastDir = toFireDir;
          w.activeAnim = 'walk';
          this.applyCharWaddle(w, dt, true);
          // Safety: if blocked (stuck 3 s with <10 px progress), drop fleeing.
          w.stuckMs += delta;
          if (w.stuckMs >= 3000) {
            const movedSq = (w.lx - w.stuckCheckX) ** 2 + (w.ly - w.stuckCheckY) ** 2;
            if (movedSq < 100) {
              w.workerState = 'idle'; w.stuckMs = 0;
              w.path = undefined; w.pathIdx = 0;
            } else {
              w.stuckMs = 0; w.stuckCheckX = w.lx; w.stuckCheckY = w.ly;
            }
          }
        } else {
          // Safe at fire. Count down the 8 s huddle timer; worker returns to
          // idle when the timer hits 0 OR when no wolf is physically hunting
          // anyone (huntTargetIdx < 0 across all live animals).
          w.fleeMs = Math.max(0, (w.fleeMs ?? 0) - delta);
          const noHunters = this.animals.every(a =>
            a.state === 'dead' || a.state === 'flee' || a.huntTargetIdx < 0,
          );
          if (w.fleeMs <= 0 || noHunters) {
            w.workerState = 'idle'; w.stuckMs = 0; w.fleeMs = 0;
          }
        }
        const soCo = this.constrainToObstacles(w.lx, w.ly);
        const soWc = this.wallConstrain(prevLxW, prevLyW, soCo.x, soCo.y);
        w.lx = soWc.x; w.ly = soWc.y;
        return;
      }
      case 'idle': {
        // Station runtime: if this level has stations[], prefer them over trees.
        // Workers pick the highest-priority unmanned station via STATION_PRIORITY
        // (fire > food > production > export) with the player's tap-to-bump applied.
        if (this.stations.length > 0) {
          const st = pickStationForWorker(this.stations, w.lx, w.ly);
          if (st) {
            st.workerId = this.survivors.indexOf(w);
            w.workerStation = st;
            w.workerState = 'toStation';
            w.activeAnim = 'walk';
            w.stuckMs = 0; w.stuckCheckX = w.lx; w.stuckCheckY = w.ly;
            break;
          }
          // No unmanned station — fall through to legacy tree loop
        }
        // Cycle through ALL trees to find one not on cooldown.
        // Fix: previously used a fixed treeIndex which could point to an always-on-cooldown tree
        // (e.g. Worker 1 always assigned treeIndex=1 but level may have only 1 tree, or the tree
        // is permanently on cooldown for that worker while another worker handles it).
        let found: TreeNode | undefined;
        for (let ti = 0; ti < this.trees.length; ti++) {
          const candidate = this.trees[(w.treeIndex + ti) % this.trees.length];
          if (candidate && !candidate.onCooldown) { found = candidate; break; }
        }
        if (found) {
          w.workerTarget = found; w.workerState = 'toTree'; w.activeAnim = 'walk';
          w.stuckMs = 0; w.stuckCheckX = w.lx; w.stuckCheckY = w.ly;
        }
        // If all trees on cooldown, stay idle — will retry next frame (cooldown is short ~5s)
        break;
      }
      case 'toStation': {
        const st = w.workerStation;
        if (!st) { w.workerState = 'idle'; break; }
        const dx = st.sx - w.lx; const dy = st.sy - w.ly; const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 36) {
          w.workerState = 'atStation';
          w.stuckMs = 0; w.pathAttempts = 0;
          w.path = undefined; w.pathIdx = 0; w.pathTargetX = undefined; w.pathTargetY = undefined;
          const kind = st.cfg.kind;
          w.activeAnim = (kind === 'ice_hole' || kind === 'butcher_table' || kind === 'lumber_mill') ? 'chop' : 'idle';
          const toStDir = this.velToDir(st.sx - w.lx, st.sy - w.ly);
          if (toStDir >= 0) w.lastDir = toStDir;
          st.cycleMs = st.cfg.cycleMs ?? DEFAULT_CYCLE_MS[st.cfg.kind] ?? 4000;
        } else {
          this.ensurePath(w, st.sx, st.sy);
          const moved = this.followPath(w, cfg.workerWalkSpeed * WORKER_SPEED_MULT, dt);
          if (!moved) {
            const speed = cfg.workerWalkSpeed * WORKER_SPEED_MULT;
            const pv = this.projectVelocityFromWalls((dx / d) * speed, (dy / d) * speed, w.lx, w.ly);
            w.lx += pv.vx * dt; w.ly += pv.vy * dt;
          }
          if (this.stuckRepath(w, delta)) break;
        }
        break;
      }
      case 'atStation': {
        const st = w.workerStation;
        if (!st) { w.workerState = 'idle'; break; }
        // Wave 9 — supply sled: multi-input station. Needs 10 meat_ground + 5
        // planks to complete a run. On completion: pay 200 coins, reset inputs,
        // increment supplyRunsCompleted, trigger a sled-departure tween.
        if (st.cfg.kind === 'supply_sled') {
          const inv = st.inputsByResource ?? (st.inputsByResource = {});
          const needMeat = 10; const needPlanks = 5; const payout = 200;
          if ((inv.meat_ground ?? 0) >= needMeat && (inv.plank ?? 0) >= needPlanks) {
            inv.meat_ground -= needMeat; inv.plank -= needPlanks;
            // Remove the matching visual pile sprites (quick visual flush).
            for (let i = 0; i < needMeat + needPlanks; i++) this.popPileSprite(st, true);
            this.coins += payout;
            this.supplyRunsCompleted += 1;
            this.advanceGoalStage();
            safePlay(this, 'snd_build_complete', { volume: 0.55 });
            this.tweens.add({
              targets: st.sprite as Phaser.GameObjects.Image,
              x: { from: st.sx, to: st.sx + 300 },
              alpha: { from: 1, to: 0 }, duration: 900, ease: 'Quad.In',
              onComplete: () => {
                const spr = st.sprite as Phaser.GameObjects.Image;
                spr.setPosition(st.sx, st.sy).setAlpha(1);
              },
            });
          }
          // No worker production cycle for supply_sled — it waits on haulers.
          w.activeAnim = 'idle';
          break;
        }
        // Consumer stations need an input unit before each cycle.
        const needInput = STATION_CONSUMES[st.cfg.kind];
        // Lumber mills pull directly from the fire fuel pool (logs stockpile)
        // instead of requiring a separate worker to haul logs — fuel is already
        // the global log inventory and this keeps the Wave 5 chain simple.
        if (needInput === 'log' && st.inputCount < 1 && this.fuel >= cfg.fire.fuelPerLog) {
          this.fuel -= cfg.fire.fuelPerLog;
          st.inputCount += 1;
          this.pushPileSprite(st, 'log' as ResourceId, true);
        }
        if (needInput && st.inputCount <= 0) {
          w.activeAnim = 'idle';
          break;
        }
        // Count down the production cycle.
        st.cycleMs = Math.max(0, st.cycleMs - delta);
        if (st.cycleMs <= 0) {
          // Consume one input (if required).
          if (needInput) {
            st.inputCount = Math.max(0, st.inputCount - 1);
            this.popPileSprite(st, true);
          }
          const produces = STATION_PRODUCES[st.cfg.kind];
          if (produces) {
            // Build a visible pile. Worker keeps producing up to BATCH_SIZE before hauling.
            st.outputCount += 1;
            if (produces === 'plank') {
              this.planksProduced += 1;
              this.advanceGoalStage();
            }
            this.pushPileSprite(st, produces, false);
            const BATCH = 3;
            if (st.outputCount >= BATCH) {
              // Switch to haul: pop one unit, carry it to destination, come back.
              st.outputCount -= 1;
              this.popPileSprite(st, false);
              w.workerHaulId = produces;
              w.workerHaulDest = this.resolveHaulDest(produces);
              w.workerState = 'haul';
              w.activeAnim = 'carry_walk';
              // Keep station reserved for this worker — they'll come back.
            } else {
              // Restart a new cycle so the pile keeps growing until BATCH.
              st.cycleMs = st.cfg.cycleMs ?? DEFAULT_CYCLE_MS[st.cfg.kind] ?? 4000;
            }
          } else {
            // No output (e.g. supply_sled payout-only) — just reset.
            st.workerId = -1;
            w.workerStation = null;
            w.workerState = 'idle';
          }
        }
        break;
      }
      case 'haul': {
        const dst = w.workerHaulDest;
        if (!dst || !w.workerHaulId) { w.workerState = 'idle'; break; }
        const tx = dst.kind === 'fire' ? this.fireX : dst.station.sx;
        const ty = dst.kind === 'fire' ? this.fireY : dst.station.sy;
        const dx = tx - w.lx; const dy = ty - w.ly; const d = Math.sqrt(dx*dx + dy*dy);
        const arriveR = dst.kind === 'fire' ? 72 : 40;  // fire's 62 px obstacle keeps us outside
        if (d < arriveR) {
          // Drop the resource
          if (dst.kind === 'fire') {
            this.deliverToFire(w.workerHaulId);
          } else {
            // Supply sled tracks per-resource counts (multi-input station).
            if (dst.station.cfg.kind === 'supply_sled') {
              if (!dst.station.inputsByResource) dst.station.inputsByResource = {};
              const rid = w.workerHaulId;
              dst.station.inputsByResource[rid] = (dst.station.inputsByResource[rid] ?? 0) + 1;
            } else {
              dst.station.inputCount += 1;
            }
            this.pushPileSprite(dst.station, w.workerHaulId, true);
          }
          w.workerHaulId = null; w.workerHaulDest = null;
          // If this worker still has a station assigned AND it still has pile, return to haul more.
          if (w.workerStation && w.workerStation.outputCount > 0) {
            const st = w.workerStation;
            const produces = STATION_PRODUCES[st.cfg.kind];
            if (produces) {
              st.outputCount -= 1;
              this.popPileSprite(st, false);
              w.workerHaulId = produces;
              w.workerHaulDest = this.resolveHaulDest(produces);
              w.activeAnim = 'carry_walk';
              // Stay in haul state (dest already set)
              break;
            }
          }
          // Otherwise release the station and idle.
          if (w.workerStation) { w.workerStation.workerId = -1; w.workerStation = null; }
          w.workerState = 'idle';
          w.activeAnim = 'idle';
          w.path = undefined; w.pathIdx = 0; w.pathTargetX = undefined; w.pathTargetY = undefined;
          w.pathAttempts = 0; w.stuckMs = 0;
        } else {
          this.ensurePath(w, tx, ty);
          const moved = this.followPath(w, cfg.workerWalkSpeed * WORKER_SPEED_MULT, dt);
          if (!moved) {
            const speed = cfg.workerWalkSpeed * WORKER_SPEED_MULT;
            const pv = this.projectVelocityFromWalls((dx / d) * speed, (dy / d) * speed, w.lx, w.ly);
            w.lx += pv.vx * dt; w.ly += pv.vy * dt;
          }
          if (this.stuckRepath(w, delta)) break;
        }
        break;
      }
      case 'toTree': {
        if (!w.workerTarget) { w.workerState = 'idle'; break; }
        const tx = w.workerTarget.sprite.x; const ty = w.workerTarget.sprite.y;
        const dx = tx - w.lx; const dy = ty - w.ly; const d = Math.sqrt(dx*dx + dy*dy);
        if (d < 30) {
          w.path = undefined; w.pathIdx = 0; w.pathTargetX = undefined; w.pathTargetY = undefined;
          w.pathAttempts = 0;
          w.workerState = 'chopping'; w.stuckMs = 0;
          w.activeAnim = 'chop';
          // Face the tree
          const toTreeDir = this.velToDir(tx - w.lx, ty - w.ly);
          if (toTreeDir >= 0) w.lastDir = toTreeDir;
          // Tree shake + chop sounds
          const treeSprite = w.workerTarget!.sprite;
          this.tweens.add({ targets: treeSprite, angle: { from: -4, to: 4 }, yoyo: true, repeat: 3, duration: 80, ease: 'Sine.InOut', onComplete: () => { treeSprite.angle = 0; } });
          safePlay(this, 'snd_axe_chop', { volume: 0.60 });
          this.time.delayedCall(1500, () => { if (w.workerState === 'chopping') safePlay(this, 'snd_axe_chop', { volume: 0.60 }); });
          this.time.delayedCall(3000, () => { if (w.workerState === 'chopping') safePlay(this, 'snd_axe_chop', { volume: 0.60 }); });
          // Wood chips burst at each axe swing (~every 1.5s)
          this.spawnWoodChips(tx, ty - 24);
          this.time.delayedCall(1500, () => { if (w.workerState === 'chopping') this.spawnWoodChips(tx, ty - 24); });
          this.time.delayedCall(3000, () => { if (w.workerState === 'chopping') this.spawnWoodChips(tx, ty - 24); });
          this.time.delayedCall(cfg.workerChopIntervalMs, () => {
            if (w.workerState === 'chopping') {
              w.workerCarrying = 1; w.workerState = 'toFire'; w.activeAnim = 'carry_walk';
              w.stuckMs = 0; w.stuckCheckX = w.lx; w.stuckCheckY = w.ly;
              this.spawnFlyingLog(tx, ty - 20, this.fireX, this.fireY);
            }
          });
        } else {
          this.ensurePath(w, tx, ty);
          const moved = this.followPath(w, cfg.workerWalkSpeed * WORKER_SPEED_MULT, dt);
          if (!moved) {
            const speed = cfg.workerWalkSpeed * WORKER_SPEED_MULT;
            const pv = this.projectVelocityFromWalls((dx / d) * speed, (dy / d) * speed, w.lx, w.ly);
            w.lx += pv.vx * dt; w.ly += pv.vy * dt;
          }
          const wSep = this.applySeparation(w.lx, w.ly, w);
          const wo = this.constrainToObstacles(wSep.x, wSep.y);
          const wc = this.wallConstrain(prevLxW, prevLyW, wo.x, wo.y);
          w.lx = wc.x; w.ly = wc.y;
          if (this.stuckRepath(w, delta)) break;
        }
        break;
      }
      case 'chopping': break;
      case 'toFire': {
        // Navigate to a unique drop slot around the fire (outside the 62px obstacle radius).
        // Slot radius scales with worker count so adjacent slots never overlap separation zone.
        const FIRE_OBS_R = 62;
        const slotAngle = w.workerSlot * (2 * Math.PI / this.numWorkerSlots);
        const slotR = Math.max(72, this.numWorkerSlots * 8); // e.g. 72 for ≤9, 96 for 12
        const slotX = this.fireX + Math.cos(slotAngle) * slotR;
        const slotY = this.fireY + Math.sin(slotAngle) * slotR;
        const dx = slotX - w.lx; const dy = slotY - w.ly; const d = Math.sqrt(dx*dx + dy*dy);
        const deliverThresh = slotR - FIRE_OBS_R + 8; // always reachable from obstacle boundary
        if (d < deliverThresh) {
          this.fuel = Math.min(cfg.fire.fuelMax, this.fuel + cfg.fire.fuelPerLog);
          this.coins += cfg.fire.coinsPerLog; w.workerCarrying = 0; w.workerState = 'idle'; w.activeAnim = 'idle';
          w.stuckMs = 0; w.pathAttempts = 0;
          w.path = undefined; w.pathIdx = 0; w.pathTargetX = undefined; w.pathTargetY = undefined;
        } else {
          this.ensurePath(w, slotX, slotY);
          const moved = this.followPath(w, cfg.workerWalkSpeed * WORKER_SPEED_MULT, dt);
          if (!moved) {
            const speed = cfg.workerWalkSpeed * WORKER_SPEED_MULT;
            const pv = this.projectVelocityFromWalls((dx / d) * speed, (dy / d) * speed, w.lx, w.ly);
            w.lx += pv.vx * dt; w.ly += pv.vy * dt;
          }
          const wSep = this.applySeparation(w.lx, w.ly, w);
          const wo = this.constrainToObstacles(wSep.x, wSep.y);
          const wc = this.wallConstrain(prevLxW, prevLyW, wo.x, wo.y);
          w.lx = wc.x; w.ly = wc.y;
          if (this.stuckRepath(w, delta)) break;
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
    // agentB round2 — visual-only station slot offset so multiple workers
    // sitting atStation don't stack into a single sprite. Pure cosmetic (does
    // not touch w.lx / w.ly, so station production + arrival logic is
    // untouched). workerSlot % 4 → 4 angular positions around the station.
    if (w.workerState === 'atStation' && w.workerStation) {
      const st = w.workerStation;
      const slot = ((w.workerSlot % 4) + 4) % 4;
      const ang = slot * (Math.PI / 2) + Math.PI * 0.25; // 45°, 135°, 225°, 315°
      const OFF = 18;
      w.sprite.x = st.sx + Math.cos(ang) * OFF;
      w.sprite.y = st.sy + Math.sin(ang) * OFF + w.waddleBobY;
    }
    w.sprite.setDepth(w.sprite.y);
  }

  // Returns a reused scratch object (do not retain the reference).
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
    this._scratchXY.x = rx; this._scratchXY.y = ry;
    return this._scratchXY;
  }

  private loseGame(): void {
    this.gameOver = true;
    this._dumpTelemetry('LOSE');
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
      this._dumpTelemetry('WIN');
      safePlay(this, 'snd_win_jingle', { volume: 0.70 });
      this.tweens.add({ targets: this.cameras.main, zoom: 1.65, duration: 1100, ease: 'Quad.InOut' });
      this.time.delayedCall(1200, () => { this.scene.stop('UIScene'); this.scene.start('WinScene', { levelNum: this.currentLevelNum }); });
    }
  }

  private _dumpTelemetry(reason: string): void {
    const ng = this.navGrid.stats;
    const sec = Math.max(1, this.sceneTimeMs / 1000);
    const avgPath = ng.pathLenSum > 0 ? (ng.pathLenSum / Math.max(1, ng.calls - ng.emptyResults)) : 0;
    const avgStraight = ng.straightSum > 0 ? (ng.straightSum / Math.max(1, ng.calls)) : 0;
    const navSummary = `[tel] L${this.currentLevelNum} ${reason} t=${sec.toFixed(1)}s | A*calls=${ng.calls} (${(ng.calls / sec).toFixed(2)}/s) ms=${ng.totalMs.toFixed(0)} empty=${ng.emptyResults} avgPath=${avgPath.toFixed(0)}px avgStraight=${avgStraight.toFixed(0)}px`;
    console.log(navSummary);
    // Chain-output accounting — confirms that production stages fired, not
    // just "coincidence" wins where stations were bypassed.
    console.log(`[chain] L${this.currentLevelNum} planks=${this.planksProduced} fish=${this.fishCaught} cooked=${this.cookedServed} kills=${this.animalsKilled} supplyRuns=${this.supplyRunsCompleted} rescued=${this.rescuedCount} tent=${this.tentBuilt}`);
    // Per-station "manned" time snapshot (approx via telMannedMs tracked below).
    const parts: string[] = [];
    for (const st of this.stations) {
      const kind = st.cfg.kind;
      const mms = (st as unknown as { telMannedMs?: number }).telMannedMs ?? 0;
      parts.push(`${kind}=${Math.round(mms/1000)}s`);
    }
    if (parts.length > 0) console.log(`[stations] L${this.currentLevelNum} manned ${parts.join(' ')}`);
    const workers = this.survivors.filter(s => s.state === 'worker');
    for (let i = 0; i < workers.length; i++) {
      const w = workers[i];
      const rep = w.telRepaths ?? 0;
      const stuck = w.telStuckEvents ?? 0;
      const idle = Math.round((w.telTimeIdleMs ?? 0) / 1000);
      const walk = Math.round((w.telTimeWalkingMs ?? 0) / 1000);
      const work = Math.round((w.telTimeWorkingMs ?? 0) / 1000);
      const flee = Math.round((w.telTimeFleeingMs ?? 0) / 1000);
      const rpm = (rep / (sec / 60)).toFixed(2);
      console.log(`[tel] W${i} repaths=${rep} (${rpm}/min) stuck=${stuck} idle=${idle}s walk=${walk}s work=${work}s flee=${flee}s`);
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
    a.huntTargetIdx = -1;
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
    // Slash VFX on player (pooled emitter)
    this.slashEmitter.emitParticleAt(this.playerLX, this.playerLY - 30, 5);
    this.cameras.main.shake(140, 0.0045);
    safePlay(this, 'snd_ice_shatter', { volume: 0.38 });
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
    // Recreate sprite (old one was destroyed after death animation)
    const hasAtlas = this.textures.exists(a.atlasKey);
    const sp = hasAtlas
      ? this.add.sprite(a.spawnLx, a.spawnLy, a.atlasKey, `${a.atlasKey}_walk_d0_f0`)
          .setDisplaySize(a.displaySize, a.displaySize).setOrigin(0.5, 1.0)
      : this.add.sprite(a.spawnLx, a.spawnLy, 'enemy_grey_wolf_01')
          .setDisplaySize(a.displaySize > 80 ? a.displaySize : 70, a.displaySize > 80 ? a.displaySize : 70)
          .setOrigin(0.5, 1.0);
    if (a.baseTint !== 0xffffff) sp.setTint(a.baseTint);
    this.depthGroup.push(sp);
    a.sprite = sp;

    a.hp = a.maxHp; a.lx = a.spawnLx; a.ly = a.spawnLy;
    a.state = 'roam'; a.summonedMinions = false; a.huntTargetIdx = -1;
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

  // Dev-only helper: spawn a single harmless animal at (player + ox, player + oy).
  // Used by preflight's direction test for atlases that don't appear in any level yet.
  private _spawnTestAnimal(atlasKey: string, ox: number, oy: number): void {
    if (!this.textures.exists(atlasKey)) return;
    const sx = this.playerLX + ox; const sy = this.playerLY + oy;
    const sp = this.add.sprite(sx, sy, atlasKey, `${atlasKey}_walk_d0_f0`)
      .setDisplaySize(140, 140).setOrigin(0.5, 1.0);
    this.depthGroup.push(sp);
    const shadow = this.add.image(sx, sy, 'entity_shadow').setDisplaySize(60, 22).setDepth(2);
    const spec = { hp:9999, speed:0, aggroSpeed:0, aggroRange:0, circleDistancePx:140,
      attackRange:0, attackIntervalMs:1200, biteIntervalMs:1200, biteDamage:0, knockbackPx:0,
      meatDrop:0, meatPerHit:0, respawnDelaySec:999, fleeBelowHpPct:0, fleeTimeSec:0,
      windupMs:0, lungeSpeedPx:0, backoffDistPx:0, backoffSpeedPx:0 };
    const a: AnimalEntity = {
      sprite: sp, shadow, atlasKey, baseTint: 0xffffff, isBoss: false,
      eyeGlow: undefined, summonedMinions: false, displaySize: 140,
      hp: spec.hp, maxHp: spec.hp, dir: 0,
      lx: sx, ly: sy, state: 'roam',
      bobPhase: 0, roamCenterX: sx, roamCenterY: sy, roamRadius: 40,
      targetLx: sx, targetLy: sy,
      roamChangeMs: 99999, hitFlashMs: 0, deathMs: 0, respawnMs: 0,
      spawnLx: sx, spawnLy: sy, biteMs: 0, fleeMs: 0,
      circleAngle: 0, circleDir: 1, stateTimer: 0,
      lungeTargetX: 0, lungeTargetY: 0, huntTargetIdx: -1, spec,
      stuckMs: 0, stuckCheckX: sx, stuckCheckY: sy,
    };
    this.animals.push(a);
    (window as unknown as { __testStag?: AnimalEntity }).__testStag = a;
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
        ? this.add.sprite(sx, sy, 'wolf', 'wolf_walk_d0_f0').setDisplaySize(97, 97).setOrigin(0.5, 1.0)
        : this.add.sprite(sx, sy, 'enemy_grey_wolf_01').setDisplaySize(70, 70).setOrigin(0.5, 1.0);
      sp.setAlpha(0);
      this.tweens.add({ targets: sp, alpha: 1, duration: 400 });
      this.depthGroup.push(sp);
      const minionShadow = this.add.image(sx, sy, 'entity_shadow')
        .setDisplaySize(54 * (97 / 144), 20 * (97 / 144)).setDepth(2);
      const minion: AnimalEntity = {
        sprite: sp, shadow: minionShadow, atlasKey: 'wolf', baseTint: 0xffffff, isBoss: false,
        eyeGlow: undefined, summonedMinions: false, displaySize: 97,
        hp: spec.hp, maxHp: spec.hp, dir: 0,
        lx: sx, ly: sy, state: 'circle',
        bobPhase: Math.random() * Math.PI * 2,
        roamCenterX: alpha.lx, roamCenterY: alpha.ly, roamRadius: 150,
        targetLx: sx, targetLy: sy,
        roamChangeMs: 0, hitFlashMs: 0, deathMs: 0, respawnMs: 0,
        spawnLx: sx, spawnLy: sy, biteMs: 0, fleeMs: 0,
        circleAngle: angle, circleDir: i % 2 === 0 ? 1 : -1,
        stateTimer: 800 + i * 400,
        lungeTargetX: 0, lungeTargetY: 0, huntTargetIdx: -1, spec,
        stuckMs: 0, stuckCheckX: sx, stuckCheckY: sy,
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
    else if (s.type === 'fishCaught') met = this.fishCaught >= (s.target as number);
    else if (s.type === 'cookedServed') met = this.cookedServed >= (s.target as number);
    else if (s.type === 'planksProduced') met = this.planksProduced >= (s.target as number);
    else if (s.type === 'planksStocked')  met = this.planksAvailable >= (s.target as number);
    else if (s.type === 'supplyRunsCompleted') met = this.supplyRunsCompleted >= (s.target as number);
    if (met) {
      // Diagnostic: fired-stage telemetry so the bot log shows exactly when
      // and from which counter each stage advanced.
      const t = (this.sceneTimeMs / 1000).toFixed(1);
      console.log(`[stage] L${this.currentLevelNum} idx=${this.currentStageIdx} type=${s.type} target=${s.target} t=${t}s | rescued=${this.rescuedCount} tent=${this.tentBuilt} kills=${this.animalsKilled} cooked=${this.cookedServed} planks=${this.planksProduced} supplyRuns=${this.supplyRunsCompleted}`);
      this.currentStageIdx++;
      const banner = (getLang() === 'tr' && s.completedTextTr) ? s.completedTextTr : s.completedText;
      if (banner) {
        this.stageBannerText = banner;
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
  // Returns a reused scratch object (do not retain the reference).
  private projectVelocityFromWalls(velX: number, velY: number, lx: number, ly: number): { vx: number; vy: number } {
    // Levels with no walls in cfg (e.g. open-map L6 fishing) must not be
    // blocked by the legacy hardcoded camp rectangle. Skip the wall clamp
    // and return the input velocity.
    if (!cfg.walls || cfg.walls.length === 0) {
      this._scratchVV.vx = velX; this._scratchVV.vy = velY;
      return this._scratchVV;
    }
    const ox = cfg.originX; const oy = cfg.originY;
    const HW = TILE_W / 2; const HH = TILE_H / 2;
    const BUF = 0.72;
    const GATE_MIN = 7.0; const GATE_MAX = 10.0;

    // Screen → iso velocity
    let vix = (velX / HW + velY / HH) / 2;
    let viy = (-velX / HW + velY / HH) / 2;

    // Current iso position (inline — avoid screenToIso object alloc)
    const ix = ((lx - ox) / HW + (ly - oy) / HH) / 2;
    const iy = ((ly - oy) / HH - (lx - ox) / HW) / 2;

    // Walls clamp velocity only while the hero is within a narrow band of
    // the wall line (not a half-plane). Half-plane logic broke the hero in
    // the south area — any viy > 0 south of iy=12 was zeroed, so the hero
    // drifted east instead of moving straight south to deep rescues.
    const nearNorth = iy >= 3 - BUF && iy <= 3 + BUF;
    const nearSouth = iy >= 12 - BUF && iy <= 12 + BUF;
    const nearWest  = ix >= 3 - BUF && ix <= 3 + BUF;
    const nearEast  = ix >= 13 - BUF && ix <= 13 + BUF;
    const inYBand   = iy >= 3 && iy <= 12;
    // North wall: hero approaching from inside (viy < 0) crossing iy=3.
    if (nearNorth && viy < 0) viy = 0;
    // South wall (gate opening ix 7–10 passes freely).
    if (nearSouth && viy > 0 && (ix < GATE_MIN || ix > GATE_MAX)) viy = 0;
    if (nearSouth && viy < 0 && (ix < GATE_MIN || ix > GATE_MAX)) viy = 0;
    // East/West walls: only block when inside the camp's iy band.
    if (inYBand && nearWest && vix < 0) vix = 0;
    if (inYBand && nearEast && vix > 0) vix = 0;

    // Iso → screen velocity (reuse scratch)
    this._scratchVV.vx = (vix - viy) * HW;
    this._scratchVV.vy = (vix + viy) * HH;
    return this._scratchVV;
  }

  // Returns a reused scratch object (do not retain the reference).
  private wallConstrain(prevSx: number, prevSy: number, newSx: number, newSy: number): { x: number; y: number } {
    // No cfg walls → no hardcoded camp rectangle (L6 fishing open map).
    if (!cfg.walls || cfg.walls.length === 0) {
      this._scratchXY2.x = newSx; this._scratchXY2.y = newSy;
      return this._scratchXY2;
    }
    const ox = cfg.originX; const oy = cfg.originY;
    const HW = TILE_W / 2; const HH = TILE_H / 2;
    const GATE_MIN = 7.0; const GATE_MAX = 10.0;
    const GATE_CENTER = (GATE_MIN + GATE_MAX) / 2;
    const CORNER_R = 1.1; // iso tiles of corner assist
    const M = 0.65;

    // Inline screenToIso — avoids 2x object alloc per call
    const pIx = ((prevSx - ox) / HW + (prevSy - oy) / HH) / 2;
    const pIy = ((prevSy - oy) / HH - (prevSx - ox) / HW) / 2;
    let ix = ((newSx - ox) / HW + (newSy - oy) / HH) / 2;
    let iy = ((newSy - oy) / HH - (newSx - ox) / HW) / 2;

    // North wall (always blocks)
    if ((pIy >= 3) !== (iy >= 3)) iy = pIy >= 3 ? 3 + M : 3 - M;

    // South wall (gate at ix 7–10) — blocks south→north and north→south
    // outside the gate, in both directions.
    if ((pIy <= 12) !== (iy <= 12)) {
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
          iy = pIy <= 12 ? 12 - M : 12 + M;
        }
      }
    }

    // East/West walls — only block crossing when the hero is inside the iy
    // band of the camp. Below iy=12 the hero roams freely for hunts/rescues.
    const inYBand = (Math.min(pIy, iy) >= 3) && (Math.max(pIy, iy) <= 12);
    if (inYBand && (pIx >= 3) !== (ix >= 3)) ix = pIx >= 3 ? 3 + M : 3 - M;
    if (inYBand && (pIx <= 13) !== (ix <= 13)) ix = pIx <= 13 ? 13 - M : 13 + M;

    this._scratchXY2.x = ox + (ix - iy) * HW;
    this._scratchXY2.y = oy + (ix + iy) * HH;
    return this._scratchXY2;
  }

  // Returns a reused scratch object (do not retain the reference).
  private constrainToObstacles(sx: number, sy: number): { x: number; y: number } {
    let rx = sx; let ry = sy;
    for (const obs of this.obstacles) {
      const dx = rx - obs.x; const dy = ry - obs.y;
      const d2 = dx*dx + dy*dy;
      if (d2 < obs.r * obs.r && d2 > 0.01) {
        const d = Math.sqrt(d2); rx = obs.x + (dx/d)*obs.r; ry = obs.y + (dy/d)*obs.r;
      }
    }
    this._scratchXY3.x = rx; this._scratchXY3.y = ry;
    return this._scratchXY3;
  }

  // Dev/test helper — directly applies wolfDir and plays the animation; returns anim key
  private __testAnimalDir(animalIdx: number, velX: number, velY: number): string {
    const a = this.animals[animalIdx];
    if (!a) return '';
    const rawDir = this.wolfDir(velX, velY);
    if (rawDir >= 0) a.dir = rawDir;
    if (!this.textures.exists(a.atlasKey)) return '';
    const wantAnim = `${a.atlasKey}_walk_d${a.dir}`;
    if (this.anims.exists(wantAnim)) a.sprite.play(wantAnim, true);
    return a.sprite.anims.currentAnim?.key ?? '';
  }
}

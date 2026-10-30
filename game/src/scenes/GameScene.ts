import Phaser from 'phaser';
import cfg from '../levels/level01.json';
import { isoToScreen, screenToIso, TILE_W, TILE_H } from '../isoUtils';

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
  lastVelX: number; lastVelY: number;
  waddlePhase: number;
  waddleBobY: number;
  baseScaleX: number;
  baseScaleY: number;
  lastDir: number;
  activeAnim: string;
  treeIndex: number;
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
  private joyGfx!: Phaser.GameObjects.Graphics;

  private snowDust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hintArrowGfx!: Phaser.GameObjects.Graphics;
  private buildBannerText!: Phaser.GameObjects.Text;

  private fuelBg!: Phaser.GameObjects.Graphics;
  private fuelFill!: Phaser.GameObjects.Graphics;
  private fuelLabel!: Phaser.GameObjects.Text;
  private freezeBar!: Phaser.GameObjects.Graphics;
  private freezeLabel!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private fpsText!: Phaser.GameObjects.Text;
  private hintTimer = 0;

  private depthGroup: Array<Phaser.GameObjects.Image | Phaser.GameObjects.Sprite> = [];
  private obstacles: Array<{ x: number; y: number; r: number }> = [];

  constructor() { super({ key: 'GameScene' }); }

  // ── create ────────────────────────────────────────────────────────────────

  create(): void {
    this.trees = []; this.survivors = []; this.logIcons = [];
    this.depthGroup = []; this.tentSprite = null; this.obstacles = [];
    this.nextWorkerTreeIndex = 0;

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

    // ── Ground ────────────────────────────────────────────────────────────
    this.add.graphics().fillStyle(0xc8dff0, 1).fillRect(-800, -800, 4000, 4000).setDepth(-10);
    const campPoly = [
      isoToScreen(3,  3,  ox, oy), isoToScreen(13, 3,  ox, oy),
      isoToScreen(13, 12, ox, oy), isoToScreen(3,  12, ox, oy),
    ];
    this.add.graphics().fillStyle(0xa08050, 1).fillPoints(campPoly as any, true).setDepth(-5);
    const dotGfx = this.add.graphics().setDepth(-4);
    for (let i = 0; i < 55; i++) {
      const t = (i * 1.618) % 1; const u = (i * 2.718) % 1;
      const p = isoToScreen(3.5 + t * 9, 3.5 + u * 8, ox, oy);
      dotGfx.fillStyle(0x8a7040, 0.35).fillCircle(p.x, p.y, 2.5 + (i % 3));
    }

    // ── Walls ─────────────────────────────────────────────────────────────
    for (const coord of cfg.walls) {
      const [wx, wy] = coord as [number, number];
      const pos = isoToScreen(wx, wy, ox, oy);
      const flipX = wy !== 3 && wy !== 12 && (wx === 3 || wx === 13);
      const ws = this.add.image(pos.x, pos.y, 'building_perimeter_wall_wooden')
        .setDisplaySize(82, 82).setOrigin(0.5, 0.85).setFlipX(flipX);
      this.depthGroup.push(ws);
    }
    for (const [gx, gy] of cfg.gate) {
      const pos = isoToScreen(gx, gy, ox, oy);
      const pg = this.add.graphics().setDepth(pos.y);
      pg.fillStyle(0x6b3a1f, 1).fillRect(pos.x - 4, pos.y - 32, 8, 32);
      pg.lineStyle(1, 0x3d1f08, 1).strokeRect(pos.x - 4, pos.y - 32, 8, 32);
    }

    // ── Trees ─────────────────────────────────────────────────────────────
    for (const td of cfg.trees) {
      const [tx, ty] = td.iso as [number, number];
      const pos = isoToScreen(tx, ty, ox, oy);
      const sp = this.add.image(pos.x, pos.y, 'prop_snow_pine_tree_01')
        .setDisplaySize(128, 128).setOrigin(0.5, 0.85);
      this.depthGroup.push(sp);
      this.trees.push({ sprite: sp, onCooldown: false });
      this.obstacles.push({ x: pos.x, y: pos.y, r: 26 });
    }

    // ── Fire & smoke ──────────────────────────────────────────────────────
    const fi = cfg.fire.iso as [number, number];
    const fp = isoToScreen(fi[0], fi[1], ox, oy);
    this.fireX = fp.x; this.fireY = fp.y;

    const glow = this.add.graphics().setDepth(1);
    glow.fillStyle(0xff6600, 1).fillCircle(this.fireX, this.fireY, 38);
    this.tweens.add({ targets: glow, alpha: { from: 0.12, to: 0.48 }, yoyo: true, repeat: -1, duration: 1400 });

    this.fireSprite = this.add.image(this.fireX, this.fireY, 'building_cauldron_firepit_01')
      .setDisplaySize(115, 115).setOrigin(0.5, 0.85);
    this.depthGroup.push(this.fireSprite);
    this.obstacles.push({ x: this.fireX, y: this.fireY, r: 30 });

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

    this.padLabel = this.add.text(this.padX, this.padY - 46,
      `Build Tent\n${pad.costCoins} coins`, {
        fontSize: '14px', color: '#ffffff',
        stroke: '#000000', strokeThickness: 4, align: 'center',
      }).setOrigin(0.5, 1).setDepth(10);

    // ── Player ────────────────────────────────────────────────────────────
    const si = cfg.player.startIso as [number, number];
    const sp2 = isoToScreen(si[0], si[1], ox, oy);
    this.playerLX = sp2.x; this.playerLY = sp2.y;
    this.playerSprite = this.add.sprite(sp2.x, sp2.y, 'hero', 'hero_idle_d0_f0')
      .setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0);
    if (this.anims.exists('hero_idle_d0')) this.playerSprite.play('hero_idle_d0');
    this.depthGroup.push(this.playerSprite);
    this.playerBaseScaleX = this.playerSprite.scaleX;
    this.playerBaseScaleY = this.playerSprite.scaleY;

    this.snowDust = this.add.particles(0, 0, 'snowpuff', {
      speed: { min: 18, max: 38 }, angle: { min: 100, max: 260 },
      scale: { start: 0.6, end: 0.08 }, alpha: { start: 0.45, end: 0 },
      lifespan: 280,
    }).setDepth(4);

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

      const sp3 = this.add.sprite(svPos.x, svPos.y, 'worker', 'worker_idle_d4_f0')
        .setDisplaySize(CHAR_SIZE, CHAR_SIZE).setOrigin(0.5, 1.0).setTint(0x88ccff);
      if (this.anims.exists('worker_idle_d4')) sp3.play('worker_idle_d4');
      this.depthGroup.push(sp3);

      this.survivors.push({
        sprite: sp3, state: 'frozen', thawProgress: 0,
        thawBar: this.add.graphics(), iceGfx, frostEmitter,
        workerCarrying: 0, bobOffset: Math.random() * Math.PI * 2,
        lx: svPos.x, ly: svPos.y,
        lastVelX: 0, lastVelY: 0,
        waddlePhase: Math.random() * Math.PI * 2,
        waddleBobY: 0,
        baseScaleX: sp3.scaleX, baseScaleY: sp3.scaleY,
        lastDir: 4, activeAnim: 'idle',
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

    // ── Misc ──────────────────────────────────────────────────────────────
    this.hintArrowGfx = this.add.graphics().setScrollFactor(0).setDepth(1100);

    // ── Camera (zoom so character reads clearly on phone) ─────────────────
    this.cameras.main.startFollow(this.playerSprite, true, 0.08, 0.08);
    this.cameras.main.setBounds(-500, -500, 2500, 2500);
    this.cameras.main.setZoom(1.25);

    // ── Joystick ──────────────────────────────────────────────────────────
    this.joyGfx = this.add.graphics().setScrollFactor(0).setDepth(1000);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.joyActive = true; this.joyOX = this.joyCX = p.x; this.joyOY = this.joyCY = p.y;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.joyActive && p.isDown) { this.joyCX = p.x; this.joyCY = p.y; }
    });
    this.input.on('pointerup', () => { this.joyActive = false; });

    // ── Screen snowfall ───────────────────────────────────────────────────
    this.add.particles(195, 0, 'snowpuff', {
      speedX: { min: -25, max: 25 }, speedY: { min: 55, max: 130 },
      scale: { start: 0.9, end: 0.2 }, alpha: { start: 0.45, end: 0 },
      lifespan: 5500, frequency: 75,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-195, 0, 390, 1) } as any,
    }).setScrollFactor(0).setDepth(997);

    // ── UI ────────────────────────────────────────────────────────────────
    const uiStyle = { stroke: '#000', strokeThickness: 3 };
    this.fuelBg   = this.add.graphics().setScrollFactor(0).setDepth(999);
    this.fuelFill = this.add.graphics().setScrollFactor(0).setDepth(999);
    this.fuelLabel = this.add.text(14, 18, 'FUEL', { fontSize: '12px', color: '#ff9900', fontStyle: 'bold', ...uiStyle })
      .setScrollFactor(0).setDepth(999);
    this.freezeBar   = this.add.graphics().setScrollFactor(0).setDepth(999);
    this.freezeLabel = this.add.text(14, 54, 'FREEZING!', { fontSize: '12px', color: '#88ccff', fontStyle: 'bold', ...uiStyle })
      .setScrollFactor(0).setDepth(999).setVisible(false);
    this.add.image(303, 28, 'resource_coin_gold_01').setDisplaySize(22, 22).setScrollFactor(0).setDepth(999);
    this.coinText = this.add.text(318, 19, '0', { fontSize: '17px', color: '#ffd700', fontStyle: 'bold', ...uiStyle })
      .setScrollFactor(0).setDepth(999);
    this.goalText = this.add.text(195, 12, '', { fontSize: '12px', color: '#aaddff', ...uiStyle })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(999);
    this.buildBannerText = this.add.text(195, 80, 'Build the tent!', {
      fontSize: '17px', color: '#44ff88', fontStyle: 'bold',
      stroke: '#003318', strokeThickness: 5, backgroundColor: '#00441188',
      padding: { x: 14, y: 7 },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(1002).setAlpha(0);
    this.hintText = this.add.text(195, 748, '', { fontSize: '14px', color: '#ffff88', align: 'center', ...uiStyle })
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(998);
    this.fpsText = this.add.text(385, 10, '', { fontSize: '11px', color: '#ffff00' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(1003);

    // ── State reset ────────────────────────────────────────────────────────
    this.coins = 0; this.fuel = cfg.fire.fuelMax;
    this.freezeMeter = 0; this.rescuedCount = 0;
    this.tentBuilt = false; this.gameOver = false;
    this.coinsPaidForTent = 0; this.carriedLogs = 0;
    this.hintTimer = 0;
    this.lastVelX = 0; this.lastVelY = 0;
    this.playerWaddlePhase = 0; this.playerBobY = 0;
    this.playerLastDir = 0;

    // Register animations from texture atlases
    const ANIM_FRAMES: Record<string, number> = {
      walk: 12, idle: 8, chop: 16, carry_walk: 12, cheer: 12,
    };
    for (const char of ['hero', 'worker'] as const) {
      for (const [anim, nFrames] of Object.entries(ANIM_FRAMES)) {
        for (let d = 0; d < 8; d++) {
          const animKey = `${char}_${anim}_d${d}`;
          if (this.anims.exists(animKey)) continue;
          this.anims.create({
            key: animKey,
            frames: Array.from({ length: nFrames }, (_, fi) => ({
              key:   char,
              frame: `${char}_${anim}_d${d}_f${fi}`,
            })),
            frameRate: 12,
            repeat: -1,
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

  // Maps screen-space velocity to sprite direction index (0=SE .. 7=E, clockwise).
  // Returns -1 when velocity is below threshold (caller should keep last dir).
  private velToDir(velX: number, velY: number): number {
    if (Math.abs(velX) < 5 && Math.abs(velY) < 5) return -1;
    const angleDeg = (Math.atan2(velY, velX) * 180 / Math.PI + 360) % 360;
    // dir0=SE corresponds to screen angle 45°
    return Math.round(((angleDeg - 45 + 360) % 360) / 45) % 8;
  }

  private playCharAnim(sprite: Phaser.GameObjects.Sprite, char: string, anim: string, dir: number): void {
    const key = `${char}_${anim}_d${dir}`;
    if (this.anims.exists(key) && sprite.anims.getName() !== key) sprite.play(key, true);
  }

  // ── update ────────────────────────────────────────────────────────────────

  update(time: number, delta: number): void {
    if (this.gameOver) return;
    const dt = delta / 1000;

    // Joystick velocity
    let velX = 0; let velY = 0;
    if (this.joyActive) {
      const dx = this.joyCX - this.joyOX; const dy = this.joyCY - this.joyOY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 8) { const inv = cfg.player.speedPx / len; velX = dx * inv; velY = dy * inv; }
    }
    const isMoving = velX !== 0 || velY !== 0;
    if (isMoving) { this.lastVelX = velX; this.lastVelY = velY; }

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
    const pvx = isMoving ? velX : this.lastVelX;
    const pvy = isMoving ? velY : this.lastVelY;
    const pDir = this.velToDir(pvx, pvy);
    if (pDir >= 0) this.playerLastDir = pDir;
    this.playCharAnim(this.playerSprite, 'hero', isMoving ? 'walk' : 'idle', this.playerLastDir);
    this.playerSprite.x = this.playerLX;
    this.playerSprite.y = this.playerLY + this.playerBobY;

    // Snow dust on step (every ~100ms of movement)
    if (isMoving && Math.abs(Math.sin(this.playerWaddlePhase)) < 0.08) {
      const normLen = Math.sqrt(velX * velX + velY * velY);
      if (normLen > 0) {
        this.snowDust.emitParticleAt(
          this.playerLX - (velX / normLen) * 10,
          this.playerLY - (velY / normLen) * 6, 2,
        );
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

    this.dropZoneGfx.setAlpha(this.carriedLogs > 0 ? 1 : 0);

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
    if (!this.tentBuilt) {
      const pdx = this.playerLX - this.padX; const pdy = this.playerLY - this.padY;
      if (pdx*pdx + pdy*pdy < padCfg.standRangePx ** 2 && this.coins > 0) {
        const pay = Math.min(this.coins, padCfg.payRateCoinsPerSec * dt);
        this.coins -= pay; this.coinsPaidForTent += pay;
        if (this.coinsPaidForTent >= padCfg.costCoins) this.buildTent();
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
            fontSize: '30px', color: '#ffff00', stroke: '#000000', strokeThickness: 5,
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

      const mvx = sv.lx - svPrevLx; const mvy = sv.ly - svPrevLy;
      const svMoving = Math.abs(mvx) + Math.abs(mvy) > 0.05;
      if (svMoving) { sv.lastVelX = mvx * 60; sv.lastVelY = mvy * 60; }
      sv.activeAnim = svMoving ? 'walk' : 'idle';
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
      if (sv.state === 'worker') this.updateWorker(sv, dt);
    }

    // Hint arrows (UI, scroll-space)
    this.hintArrowGfx.clear();
    const cam = this.cameras.main;
    if (nearFrozen) {
      const sx = nearFrozen.lx - cam.scrollX; const sy = nearFrozen.ly - cam.scrollY;
      const a = 0.55 + 0.45 * Math.sin(time / 190);
      this.hintArrowGfx.fillStyle(0xffff33, a);
      this.hintArrowGfx.fillTriangle(sx, sy - 108 + 14, sx - 10, sy - 108, sx + 10, sy - 108);
      this.hintArrowGfx.fillRect(sx - 4, sy - 122, 8, 16);
    }
    if (!this.tentBuilt && this.coins > 0 && !nearFrozen) {
      const px = this.padX - cam.scrollX; const py = this.padY - cam.scrollY;
      const a = 0.6 + 0.4 * Math.sin(time / 200);
      this.hintArrowGfx.fillStyle(0x44ff88, a);
      this.hintArrowGfx.fillTriangle(px, py - 62 + 14, px - 10, py - 62, px + 10, py - 62);
      this.hintArrowGfx.fillRect(px - 4, py - 76, 8, 16);
    }

    // Depth sort
    for (const sp of this.depthGroup) sp.setDepth(sp.y);

    // Joystick
    this.joyGfx.clear();
    if (this.joyActive) {
      let cx = this.joyCX; let cy = this.joyCY;
      const dx = cx - this.joyOX; const dy = cy - this.joyOY;
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len > 60) { cx = this.joyOX + dx/len*60; cy = this.joyOY + dy/len*60; }
      this.joyGfx.lineStyle(2, 0xffffff, 0.28).strokeCircle(this.joyOX, this.joyOY, 60);
      this.joyGfx.fillStyle(0xffffff, 0.5).fillCircle(cx, cy, 22);
    }

    // Fuel bar
    const pct = this.fuel / cfg.fire.fuelMax;
    this.fuelBg.clear().fillStyle(0x1a1a1a, 0.85).fillRoundedRect(14, 36, 160, 12, 4);
    this.fuelFill.clear().fillStyle(pct > 0.4 ? 0xff7700 : 0xff2200, 1)
      .fillRoundedRect(14, 36, Math.max(0, 160 * pct), 12, 4);
    const showF = this.fuel <= 0;
    this.freezeLabel.setVisible(showF);
    this.freezeBar.clear();
    if (showF) {
      this.freezeBar.fillStyle(0x001133, 0.65).fillRoundedRect(14, 70, 160, 12, 4);
      this.freezeBar.fillStyle(0x44aaff, 1).fillRoundedRect(14, 70, 160 * (this.freezeMeter / cfg.fire.freezeMax), 12, 4);
    }

    this.coinText.setText(String(Math.floor(this.coins)));
    const tentStr = this.tentBuilt ? 'Tent: OK'
      : `Tent: ${Math.floor(this.coinsPaidForTent)}/${padCfg.costCoins}`;
    this.goalText.setText(`Rescued: ${this.rescuedCount}/3  ${tentStr}`);

    const showBanner = !this.tentBuilt && this.coins >= 1 && this.rescuedCount > 0;
    this.buildBannerText.setAlpha(showBanner ? 0.6 + 0.4 * Math.sin(time / 320) : 0);

    this.hintTimer += delta;
    let hintMsg = '';
    if (this.hintTimer < cfg.hintDurationSec * 1000) {
      if (this.hintTimer < 8000) hintMsg = 'Walk near trees to collect logs!';
      else if (this.carriedLogs > 0) hintMsg = 'Carry logs to the fire!';
      else if (!this.tentBuilt && this.coins >= 10) hintMsg = 'Stand on the blue pad to build the tent!';
      else if (nearFrozen && nearDist > cfg.survivorFollowRangePx) hintMsg = 'Walk up to a frozen survivor!';
    }
    this.hintText.setText(hintMsg);
    this.hintText.setAlpha(hintMsg ? 0.6 + 0.4 * Math.sin(this.hintTimer / 280) : 0);
    this.fpsText.setText(`${Math.round(this.game.loop.actualFps)} fps`);
  }

  // Apply bob + animation to a survivor sprite.
  // animOverride allows callers to force a specific animation (e.g. 'chop').
  private applyCharWaddle(sv: Survivor, dt: number, isMoving: boolean, animOverride?: string): void {
    if (isMoving) sv.waddlePhase += dt * BOB_HZ * Math.PI * 2;
    sv.waddleBobY = isMoving ? Math.sin(sv.waddlePhase) * BOB_AMP : 0;

    const dir = this.velToDir(sv.lastVelX, sv.lastVelY);
    if (dir >= 0) sv.lastDir = dir;

    const anim = animOverride ?? sv.activeAnim;
    this.playCharAnim(sv.sprite, 'worker', anim, sv.lastDir);

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
    const cam = this.cameras.main;
    const fsx = this.fireX - cam.scrollX; const fsy = this.fireY - cam.scrollY;
    for (let i = 0; i < Math.min(count, 6); i++) {
      const c = this.add.image(fsx + Phaser.Math.Between(-10, 10), fsy + Phaser.Math.Between(-10, 10), 'resource_coin_gold_01')
        .setDisplaySize(18, 18).setScrollFactor(0).setDepth(1002);
      this.tweens.add({ targets: c, x: 314, y: 28, duration: 480 + i * 70, delay: i * 55, ease: 'Cubic.Out', onComplete: () => c.destroy() });
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
    this.checkWin();
  }

  private thawSurvivor(s: Survivor): void {
    s.state = 'worker'; s.workerState = 'idle'; s.activeAnim = 'idle';
    s.sprite.clearTint();
    s.thawBar?.destroy(); s.thawBar = undefined;
    s.treeIndex = this.nextWorkerTreeIndex;
    this.nextWorkerTreeIndex = (this.nextWorkerTreeIndex + 1) % Math.max(1, this.trees.length);
    this.rescuedCount++;
    this.checkWin();
  }

  private updateWorker(w: Survivor, dt: number): void {
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
          w.lx += (dx/d)*cfg.workerWalkSpeed*dt; w.ly += (dy/d)*cfg.workerWalkSpeed*dt;
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
          w.lx += (dx/d)*cfg.workerWalkSpeed*dt; w.ly += (dy/d)*cfg.workerWalkSpeed*dt;
          const wSep = this.applySeparation(w.lx, w.ly, w);
          const wo = this.constrainToObstacles(wSep.x, wSep.y);
          const wc = this.wallConstrain(prevLxW, prevLyW, wo.x, wo.y);
          w.lx = wc.x; w.ly = wc.y;
        }
        break;
      }
    }

    const mvx = w.lx - prevLxW; const mvy = w.ly - prevLyW;
    const workerMoving = w.workerState === 'toTree' || w.workerState === 'toFire';
    if (Math.abs(mvx) + Math.abs(mvy) > 0.05) { w.lastVelX = mvx * 60; w.lastVelY = mvy * 60; }
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
    this.time.delayedCall(800, () => this.scene.start('LoseScene'));
  }

  private checkWin(): void {
    if (this.rescuedCount >= cfg.goal.survivorsToRescue && this.tentBuilt) {
      this.gameOver = true;
      this.time.delayedCall(1200, () => this.scene.start('WinScene'));
    }
  }

  // Gate is at iy=12, opening at ix=8–9 (gate posts), visible gap.
  // Collision corridor is wider than visual (1.5× char width) for playability.
  // Corner assist nudges the player into the opening if they're within 1 tile of it.
  private wallConstrain(prevSx: number, prevSy: number, newSx: number, newSy: number): { x: number; y: number } {
    const ox = cfg.originX; const oy = cfg.originY;
    const HW = TILE_W / 2; const HH = TILE_H / 2;
    const GATE_MIN = 7.0; const GATE_MAX = 10.0;
    const GATE_CENTER = (GATE_MIN + GATE_MAX) / 2;
    const CORNER_R = 1.1; // iso tiles of corner assist
    const M = 0.28;

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

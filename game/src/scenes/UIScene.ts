import Phaser from 'phaser';
import { showRewarded } from '../services/ads';

interface HudUpdateData {
  fuelPct:      number;
  showFreeze:   boolean;
  freezePct:    number;
  coins:        number;
  goalText:     string;
  survivors:    number;
  bannerAlpha:  number;
  hintText:     string;
  hintAlpha:    number;
  fps:          number;
  joyActive:    boolean;
  joyOX:        number;
  joyOY:        number;
  joyCX:        number;
  joyCY:        number;
  showCoinShop: boolean;
}

export default class UIScene extends Phaser.Scene {
  // Bar graphics
  private barGfx!: Phaser.GameObjects.Graphics;

  // Fuel
  private fuelBg!:    Phaser.GameObjects.Graphics;
  private fuelFill!:  Phaser.GameObjects.Graphics;
  private freezeBar!: Phaser.GameObjects.Graphics;

  // Coin
  private coinText!: Phaser.GameObjects.Text;

  // Survivors
  private survivorIcons: Phaser.GameObjects.Graphics[] = [];

  // Mute
  private muteBtnText!: Phaser.GameObjects.Text;

  // Overlay buttons
  private refuelBtn!:   Phaser.GameObjects.Text;
  private coinShopBtn!: Phaser.GameObjects.Text;

  // Joy
  private joyGfx!: Phaser.GameObjects.Graphics;

  // Banners
  private buildBannerText!: Phaser.GameObjects.Text;
  private hintTextObj!:     Phaser.GameObjects.Text;
  private fpsText!:         Phaser.GameObjects.Text;

  private isDebugMode = false;

  constructor() { super({ key: 'UIScene' }); }

  create(): void {
    this.isDebugMode = typeof window !== 'undefined' && window.location.search.includes('debug');
    const FF = "'Fredoka One', cursive";

    // ── Screen-space textures & effects (must live here — UIScene zoom=1) ─
    if (!this.textures.exists('snowdot')) {
      const sdCanvas = document.createElement('canvas');
      sdCanvas.width = 8; sdCanvas.height = 8;
      const sdCtx = sdCanvas.getContext('2d')!;
      sdCtx.beginPath(); sdCtx.arc(4, 4, 3.5, 0, Math.PI * 2);
      sdCtx.fillStyle = '#ffffff'; sdCtx.fill();
      this.textures.addCanvas('snowdot', sdCanvas as HTMLCanvasElement);
    }
    const vigKey = 'fb_vignette';
    if (!this.textures.exists(vigKey)) {
      const vc = document.createElement('canvas');
      vc.width = 390; vc.height = 844;
      const vCtx = vc.getContext('2d')!;
      const grad = vCtx.createRadialGradient(195, 422, 160, 195, 422, 480);
      grad.addColorStop(0,    'rgba(10,15,45,0)');
      grad.addColorStop(0.72, 'rgba(10,15,45,0)');
      grad.addColorStop(1,    'rgba(10,15,45,0.13)');
      vCtx.fillStyle = grad; vCtx.fillRect(0, 0, 390, 844);
      this.textures.addCanvas(vigKey, vc as HTMLCanvasElement);
    }
    this.add.image(195, 422, vigKey).setDepth(994);
    this.add.particles(195, 0, 'snowdot', {
      speedX: { min: -15, max: 15 }, speedY: { min: 60, max: 120 },
      scale: { start: 0.35, end: 0.15 },
      alpha: { start: 0.85, end: 0 },
      tint: { onEmit: () => Phaser.Utils.Array.GetRandom([0xffffff, 0xddeeff, 0xeef4ff]) } as any,
      lifespan: { min: 5000, max: 8000 },
      frequency: 60,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-195, 0, 390, 1) } as any,
    }).setDepth(997);

    // Layout constants
    const SAF      = 50;              // safe area top
    const BAR_H    = 60;              // bar height
    const CTR_Y    = SAF + BAR_H / 2; // = 80
    const BANNER_Y = SAF + BAR_H + 10; // = 120

    // ── 1. Bar background ─────────────────────────────────────────────────
    this.barGfx = this.add.graphics().setDepth(10);
    this.barGfx.fillStyle(0x0a0f1e, 0.90).fillRect(0, SAF, 390, BAR_H);
    this.barGfx.lineStyle(1, 0x2a3a5a, 0.7).lineBetween(0, SAF + BAR_H, 390, SAF + BAR_H);
    // Thin vertical dividers
    this.barGfx.lineStyle(1, 0x2a3a5a, 0.5);
    this.barGfx.lineBetween(172, SAF + 10, 172, SAF + BAR_H - 10);
    this.barGfx.lineBetween(262, SAF + 10, 262, SAF + BAR_H - 10);
    this.barGfx.lineBetween(334, SAF + 10, 334, SAF + BAR_H - 10);

    // ── 2. Fire icon ──────────────────────────────────────────────────────
    this.add.image(18, CTR_Y, 'building_cauldron_firepit_01')
      .setDisplaySize(28, 28).setDepth(12);

    // ── 3. FUEL label ─────────────────────────────────────────────────────
    this.add.text(50, SAF + 8, 'FUEL', {
      fontFamily: FF, fontSize: '11px', color: '#ff9900',
      stroke: '#000000', strokeThickness: 2,
    }).setDepth(12);

    // ── 4. Fuel bar bg ────────────────────────────────────────────────────
    this.fuelBg = this.add.graphics().setDepth(11);
    this.fuelBg.fillStyle(0x1a2033, 1).fillRoundedRect(50, SAF + 22, 110, 10, 3);

    // ── 5. Fuel bar fill ──────────────────────────────────────────────────
    this.fuelFill = this.add.graphics().setDepth(12);

    // ── 6. Freeze bar ─────────────────────────────────────────────────────
    this.freezeBar = this.add.graphics().setDepth(12);

    // ── 7. Coin icon ──────────────────────────────────────────────────────
    this.add.image(180, CTR_Y, 'resource_coin_gold_01')
      .setDisplaySize(22, 22).setDepth(12);

    // ── 8. Coin text ──────────────────────────────────────────────────────
    this.coinText = this.add.text(205, CTR_Y, '0', {
      fontFamily: FF, fontSize: '22px', color: '#ffd700',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0, 0.5).setDepth(12);

    // ── 9. Survivor section ───────────────────────────────────────────────
    this.add.text(268, SAF + 8, 'SAVED', {
      fontFamily: FF, fontSize: '10px', color: '#88ddff',
      stroke: '#000', strokeThickness: 2,
    }).setDepth(12);
    this.survivorIcons = [0, 1, 2].map(() => this.add.graphics().setDepth(12));

    // ── 10. Mute button ───────────────────────────────────────────────────
    const muteBgGfx = this.add.graphics().setDepth(11);
    muteBgGfx.fillStyle(0x1a2244, 0.9).fillRoundedRect(337, SAF + 10, 40, 40, 8);
    muteBgGfx.lineStyle(1, 0x2a3a5a, 0.7).strokeRoundedRect(337, SAF + 10, 40, 40, 8);

    this.muteBtnText = this.add.text(357, CTR_Y, '♪', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#aaccff',
    }).setOrigin(0.5, 0.5).setDepth(13)
      .setInteractive(new Phaser.Geom.Rectangle(335, SAF + 8, 44, 44), Phaser.Geom.Rectangle.Contains);
    this.muteBtnText.on('pointerup', () => {
      const gs = this.scene.get('GameScene');
      gs.sound.mute = !gs.sound.mute;
      this.muteBtnText.setColor(gs.sound.mute ? '#ff4455' : '#aaccff');
    });

    // ── 11. Build banner ──────────────────────────────────────────────────
    this.buildBannerText = this.add.text(195, BANNER_Y, 'Build the tent!', {
      fontFamily: FF, fontSize: '17px', color: '#44ff88',
      stroke: '#003318', strokeThickness: 5,
      backgroundColor: '#00441199',
      padding: { x: 14, y: 7 },
    }).setOrigin(0.5, 0).setAlpha(0).setDepth(13);

    // ── 12. Hint text ─────────────────────────────────────────────────────
    this.hintTextObj = this.add.text(195, 748, '', {
      fontFamily: FF, fontSize: '19px', color: '#ffffff', align: 'center',
      stroke: '#000000', strokeThickness: 5,
      backgroundColor: '#000000aa',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5, 0).setDepth(10);

    // ── 13. FPS text (debug only) ─────────────────────────────────────────
    this.fpsText = this.add.text(385, 10, '', {
      fontSize: '11px', color: '#ffff00',
    }).setOrigin(1, 0).setDepth(13).setVisible(this.isDebugMode);

    // ── 14. Joystick graphics ─────────────────────────────────────────────
    this.joyGfx = this.add.graphics().setDepth(13);

    // ── 15. "Watch Ad — Refuel" overlay (hidden until freeze starts) ──────
    this.refuelBtn = this.add.text(195, 748, 'Watch Ad — Refuel', {
      fontFamily: FF, fontSize: '17px', color: '#88ffdd',
      backgroundColor: '#001a14', padding: { x: 18, y: 10 },
      stroke: '#005544', strokeThickness: 1,
    }).setOrigin(0.5, 1).setDepth(20).setVisible(false).setInteractive({ useHandCursor: true });

    this.refuelBtn.on('pointerdown', () => {
      this.refuelBtn.disableInteractive().setText('Loading...');
      showRewarded(
        () => {
          this.scene.get('GameScene').events.emit('fuel-refill');
          this.refuelBtn.setVisible(false).setText('Watch Ad — Refuel');
        },
        () => {
          this.refuelBtn.setText('Watch Ad — Refuel').setInteractive({ useHandCursor: true });
        },
      );
    });

    // ── 16. "Need coins → Shop" popup (shown when on pad with 0 coins) ───
    this.coinShopBtn = this.add.text(195, 700, 'Need coins!  Shop', {
      fontFamily: FF, fontSize: '16px', color: '#ffd700',
      backgroundColor: '#1a1400', padding: { x: 16, y: 8 },
      stroke: '#664400', strokeThickness: 1,
    }).setOrigin(0.5, 1).setDepth(20).setVisible(false).setInteractive({ useHandCursor: true });

    this.coinShopBtn.on('pointerdown', () => {
      const gs = this.scene.get('GameScene');
      gs.scene.stop('UIScene');
      gs.scene.start('ShopScene', { from: 'LevelSelectScene' });
    });

    // ── 17. GameScene event subscription ─────────────────────────────────
    const gs = this.scene.get('GameScene');
    gs.events.on('hud-update', this.onHudUpdate, this);

    // Stop UIScene when GameScene shuts down
    gs.events.once('shutdown', () => this.scene.stop('UIScene'));

    // Draw initial survivor icons (grey)
    this.drawSurvivorIcons(0);
  }

  private drawSurvivorIcons(count: number): void {
    const SAF   = 50;
    const CTR_Y = SAF + 30; // = 80
    const xs    = [270, 290, 310];
    for (let i = 0; i < 3; i++) {
      const ic     = this.survivorIcons[i];
      const filled = i < count;
      ic.clear();
      ic.fillStyle(filled ? 0x44ff88 : 0x445566, filled ? 1 : 0.6)
        .fillCircle(xs[i], CTR_Y, 7);
    }
  }

  private onHudUpdate(data: HudUpdateData): void {
    const SAF   = 50;

    // Fuel fill
    this.fuelFill.clear();
    const fuelColor = data.fuelPct > 0.5 ? 0xff8800 : data.fuelPct > 0.25 ? 0xff4400 : 0xff1111;
    this.fuelFill.fillStyle(fuelColor, 1)
      .fillRoundedRect(50, SAF + 22, Math.max(0, 110 * data.fuelPct), 10, 3);

    // Freeze bar — drawn over fuel bar
    this.freezeBar.clear();
    if (data.showFreeze) {
      this.freezeBar.fillStyle(0x44aaff, 1)
        .fillRoundedRect(50, SAF + 22, 110 * data.freezePct, 10, 3);
    }

    // Coin
    this.coinText.setText(String(data.coins));

    // Survivor icons
    this.drawSurvivorIcons(data.survivors);

    // Banner
    this.buildBannerText.setText(data.goalText);
    this.buildBannerText.setAlpha(data.bannerAlpha);

    // Refuel + coin-shop overlays
    this.refuelBtn.setVisible(data.showFreeze && !this.refuelBtn.text.startsWith('Loading'));
    this.coinShopBtn.setVisible(data.showCoinShop);

    // Hint + FPS
    this.hintTextObj.setText(data.hintText).setAlpha(data.hintAlpha);
    if (this.isDebugMode) this.fpsText.setText(`${data.fps} fps`);

    // Joystick
    this.joyGfx.clear();
    if (data.joyActive) {
      let cxs = data.joyCX; let cys = data.joyCY;
      const dx = cxs - data.joyOX; const dy = cys - data.joyOY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 60) {
        cxs = data.joyOX + (dx / len) * 60;
        cys = data.joyOY + (dy / len) * 60;
      }
      this.joyGfx.lineStyle(2, 0xffffff, 0.28).strokeCircle(data.joyOX, data.joyOY, 60);
      this.joyGfx.fillStyle(0xffffff, 0.5).fillCircle(cxs, cys, 22);
    }
  }
}

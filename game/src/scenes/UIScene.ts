import Phaser from 'phaser';
import { showRewarded } from '../services/ads';
import { t, tFmt } from '../i18n';

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
  levelNum:     number;
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

  // Overlay buttons
  private refuelBtn!:   Phaser.GameObjects.Text;

  // Toast
  private toastGfx!: Phaser.GameObjects.Graphics;
  private toastText!: Phaser.GameObjects.Text;
  private toastTimer = 0;

  // Joy
  private joyGfx!: Phaser.GameObjects.Graphics;

  // Banners
  private buildBannerText!: Phaser.GameObjects.Text;
  private hintTextObj!:     Phaser.GameObjects.Text;
  private fpsText!:         Phaser.GameObjects.Text;

  // Level badge + start banner
  private levelBadge!: Phaser.GameObjects.Text;
  private levelStartBanner!: Phaser.GameObjects.Text;

  // Pause overlay
  private pauseGroup: Phaser.GameObjects.GameObject[] = [];
  private isPaused = false;
  private isMuted  = false;

  // Safe area (computed from CSS env)
  private safeTop = 0;

  private isDebugMode = false;

  constructor() { super({ key: 'UIScene' }); }

  create(): void {
    this.isDebugMode = typeof window !== 'undefined' && window.location.search.includes('debug');
    const FF = "GameFont, cursive";

    // Compute iOS/Android safe area inset from CSS env variable
    try {
      const el = document.createElement('div');
      el.style.paddingTop = 'env(safe-area-inset-top, 0px)';
      el.style.position = 'fixed';
      document.body.appendChild(el);
      this.safeTop = parseInt(getComputedStyle(el).paddingTop) || 0;
      document.body.removeChild(el);
    } catch { this.safeTop = 0; }

    const W = this.scale.width;
    const H = this.scale.height;
    const CX = W / 2;
    const CY = H / 2;

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
      vc.width = W; vc.height = H;
      const vCtx = vc.getContext('2d')!;
      const grad = vCtx.createRadialGradient(CX, CY, 160, CX, CY, Math.max(W, H) * 0.6);
      grad.addColorStop(0,    'rgba(10,15,45,0)');
      grad.addColorStop(0.72, 'rgba(10,15,45,0)');
      grad.addColorStop(1,    'rgba(10,15,45,0.13)');
      vCtx.fillStyle = grad; vCtx.fillRect(0, 0, W, H);
      this.textures.addCanvas(vigKey, vc as HTMLCanvasElement);
    }
    this.add.image(CX, CY, vigKey).setDepth(994);
    this.add.particles(CX, 0, 'snowdot', {
      speedX: { min: -15, max: 15 }, speedY: { min: 60, max: 120 },
      scale: { start: 0.35, end: 0.15 },
      alpha: { start: 0.85, end: 0 },
      tint: { onEmit: () => Phaser.Utils.Array.GetRandom([0xffffff, 0xddeeff, 0xeef4ff]) } as any,
      lifespan: { min: 5000, max: 8000 },
      frequency: 60,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-CX, 0, W, 1) } as any,
    }).setDepth(997);

    // Layout constants
    const SAF      = Math.max(44, this.safeTop + 4); // dynamic safe area top
    const BAR_H    = 60;              // bar height
    const CTR_Y    = SAF + BAR_H / 2; // = 80
    const BANNER_Y = SAF + BAR_H + 10; // = 120

    // ── 1. Bar background ─────────────────────────────────────────────────
    this.barGfx = this.add.graphics().setDepth(10);
    this.barGfx.fillStyle(0x0a0f1e, 0.90).fillRect(0, SAF, W, BAR_H);
    this.barGfx.lineStyle(1, 0x2a3a5a, 0.7).lineBetween(0, SAF + BAR_H, W, SAF + BAR_H);
    // Thin vertical dividers
    this.barGfx.lineStyle(1, 0x2a3a5a, 0.5);
    this.barGfx.lineBetween(172, SAF + 10, 172, SAF + BAR_H - 10);
    this.barGfx.lineBetween(262, SAF + 10, 262, SAF + BAR_H - 10);
    this.barGfx.lineBetween(334, SAF + 10, 334, SAF + BAR_H - 10);

    // ── 2. Fire icon ──────────────────────────────────────────────────────
    this.add.image(18, CTR_Y, 'building_cauldron_firepit_01')
      .setDisplaySize(28, 28).setDepth(12);

    // ── 3. FUEL label ─────────────────────────────────────────────────────
    this.add.text(50, SAF + 8, t('fuelLabel'), {
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
    this.add.text(268, SAF + 8, t('savedLabel'), {
      fontFamily: FF, fontSize: '10px', color: '#88ddff',
      stroke: '#000', strokeThickness: 2,
    }).setDepth(12);
    this.survivorIcons = [0, 1, 2].map(() => this.add.graphics().setDepth(12));

    // ── 10. Pause button (round wooden, top-right of HUD) ─────────────────
    const pBtnX = W - 26; const pBtnY = CTR_Y; const pBtnR = 18;
    const pBg = this.add.graphics().setDepth(11);
    pBg.fillStyle(0x5c3010, 1).fillCircle(pBtnX, pBtnY, pBtnR);
    pBg.lineStyle(2, 0xd48030, 1).strokeCircle(pBtnX, pBtnY, pBtnR);
    pBg.lineStyle(1, 0xffdda0, 0.25).strokeCircle(pBtnX, pBtnY, pBtnR - 3);
    const pIco = this.add.graphics().setDepth(12);
    pIco.fillStyle(0xffe0b0, 1);
    pIco.fillRect(pBtnX - 7, pBtnY - 7, 4, 14);
    pIco.fillRect(pBtnX + 3, pBtnY - 7, 4, 14);
    const pHit = this.add.circle(pBtnX, pBtnY, pBtnR + 10, 0, 0)
      .setInteractive({ useHandCursor: true }).setDepth(14);
    pHit.on('pointerdown', () => this.tweens.add({ targets: [pBg, pIco], scaleX: 0.86, scaleY: 0.86, duration: 60 }));
    pHit.on('pointerup', () => {
      this.tweens.add({ targets: [pBg, pIco], scaleX: 1, scaleY: 1, duration: 100, ease: 'Back.Out' });
      this.openPause();
    });
    pHit.on('pointerout', () => this.tweens.add({ targets: [pBg, pIco], scaleX: 1, scaleY: 1, duration: 80 }));

    // Android back button = pause
    this.input.keyboard?.on('keydown-ESC', () => { if (!this.isPaused) this.openPause(); });

    // ── 11. Build banner ──────────────────────────────────────────────────
    this.buildBannerText = this.add.text(CX, BANNER_Y, 'Build the tent!', {
      fontFamily: FF, fontSize: '17px', color: '#44ff88',
      stroke: '#003318', strokeThickness: 5,
      backgroundColor: '#00441199',
      padding: { x: 14, y: 7 },
    }).setOrigin(0.5, 0).setAlpha(0).setDepth(13);

    // ── 12. Hint text ─────────────────────────────────────────────────────
    this.hintTextObj = this.add.text(CX, H - 96, '', {
      fontFamily: FF, fontSize: '19px', color: '#ffffff', align: 'center',
      stroke: '#000000', strokeThickness: 5,
      backgroundColor: '#000000aa',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5, 0).setDepth(10);

    // ── 13. FPS text (debug only) ─────────────────────────────────────────
    this.fpsText = this.add.text(W - 5, 10, '', {
      fontSize: '11px', color: '#ffff00',
    }).setOrigin(1, 0).setDepth(13).setVisible(this.isDebugMode);

    // ── 14. Joystick graphics ─────────────────────────────────────────────
    this.joyGfx = this.add.graphics().setDepth(13);

    // ── 15. "Watch Ad — Refuel" overlay (hidden until freeze starts) ──────
    this.refuelBtn = this.add.text(CX, H - 48, 'Watch Ad — Refuel', {
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
          this.showToast(t('adNotAvailable'));
          this.refuelBtn.setText('Watch Ad — Refuel').setInteractive({ useHandCursor: true });
        },
        () => {
          this.showToast(t('adsAppOnly'));
          this.refuelBtn.setText('Watch Ad — Refuel').setInteractive({ useHandCursor: true });
        },
      );
    });

    // ── 16. Toast system (replaces persistent coinShopBtn) ────────────────
    this.toastGfx = this.add.graphics().setDepth(20).setAlpha(0);
    this.toastText = this.add.text(CX, H - 100, '', {
      fontFamily: FF, fontSize: '16px', color: '#ffd700',
      backgroundColor: '#1a1400', padding: { x: 16, y: 8 },
      stroke: '#664400', strokeThickness: 1,
    }).setOrigin(0.5, 1).setDepth(21).setAlpha(0).setInteractive({ useHandCursor: true });

    this.toastText.on('pointerdown', () => {
      const gs = this.scene.get('GameScene');
      gs.scene.stop('UIScene');
      gs.scene.start('ShopScene', { from: 'LevelSelectScene' });
    });

    // ── 17. Level badge (small text under HUD bar, near pause button) ────────
    this.levelBadge = this.add.text(W - 54, SAF + BAR_H + 4, '', {
      fontFamily: FF, fontSize: '11px', color: '#aabbcc',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0).setAlpha(0.7).setDepth(13);

    // ── 18. Level start banner (shown for 2s at scene launch) ─────────────
    this.levelStartBanner = this.add.text(CX, CY - 60, '', {
      fontFamily: FF, fontSize: '28px', fontStyle: 'bold',
      color: '#ffe8b0', stroke: '#3a1a06', strokeThickness: 6,
      backgroundColor: '#00000099',
      padding: { x: 24, y: 12 },
    }).setOrigin(0.5).setAlpha(0).setDepth(50);

    // ── 19. GameScene event subscription ─────────────────────────────────
    const gs = this.scene.get('GameScene');
    gs.events.on('hud-update', this.onHudUpdate, this);

    gs.events.on('level-start', (data: { levelNum: number; levelName: string }) => {
      const badge = tFmt('levelLabel', { n: data.levelNum });
      const name  = data.levelName ? `${badge}: ${data.levelName}` : badge;
      this.levelStartBanner.setText(name).setAlpha(1);
      this.tweens.add({
        targets: this.levelStartBanner,
        alpha: 0,
        delay: 1800,
        duration: 600,
        ease: 'Sine.In',
      });
    });

    // Stop UIScene when GameScene shuts down
    gs.events.once('shutdown', () => this.scene.stop('UIScene'));

    // Draw initial survivor icons (grey)
    this.drawSurvivorIcons(0);
  }

  private openPause(): void {
    if (this.isPaused) return;
    this.isPaused = true;
    const gs = this.scene.get('GameScene');
    gs.scene.pause();

    const W = this.scale.width; const H = this.scale.height; const CX = W / 2; const CY = H / 2;
    const FF = "GameFont, cursive";
    const overlay = this.add.graphics().setDepth(900);
    overlay.fillStyle(0x000000, 0.68).fillRect(0, 0, W, H);

    const panelW = Math.min(W * 0.82, 300); const panelH = 294;
    const panelG = this.add.graphics().setDepth(901);
    panelG.fillStyle(0x3d2008, 0.96).fillRoundedRect(CX - panelW / 2, CY - panelH / 2, panelW, panelH, 16);
    panelG.lineStyle(2.5, 0xd48030, 1).strokeRoundedRect(CX - panelW / 2, CY - panelH / 2, panelW, panelH, 16);
    panelG.lineStyle(1, 0xffcc80, 0.2).strokeRoundedRect(CX - panelW / 2 + 3, CY - panelH / 2 + 3, panelW - 6, panelH - 6, 14);

    const title = this.add.text(CX, CY - panelH / 2 + 26, t('paused'), {
      fontFamily: FF, fontSize: '22px', fontStyle: 'bold',
      color: '#ffe8b0', stroke: '#3a1a06', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(902);

    const btnW = panelW * 0.78; const btnH = 46; const btnGap = 10;
    const btnY0 = CY - panelH / 2 + 70;
    const labels: Array<{ key: string; action: () => void }> = [
      { key: 'continue', action: () => this.closePause() },
      { key: 'restart',  action: () => { this.closePause(); gs.scene.restart(); } },
      { key: 'settings', action: () => {
          this.closePause();
          this.scene.stop('UIScene');
          gs.scene.stop();
          gs.scene.start('SettingsScene', { from: 'MainMenuScene' });
        }
      },
      { key: 'mainMenu', action: () => {
          this.closePause();
          this.scene.stop('UIScene');
          gs.scene.stop();
          gs.scene.start('MainMenuScene');
        }
      },
    ];
    const btnObjs: Phaser.GameObjects.GameObject[] = [overlay, panelG, title];
    labels.forEach((item, i) => {
      const cy = btnY0 + i * (btnH + btnGap);
      const bg = this.add.graphics().setDepth(902);
      bg.fillStyle(0x4a2810, 1).fillRoundedRect(CX - btnW / 2, cy - btnH / 2, btnW, btnH, 10);
      bg.lineStyle(2, 0xd48030, 1).strokeRoundedRect(CX - btnW / 2, cy - btnH / 2, btnW, btnH, 10);
      bg.fillStyle(0xddeeff, 0.60).fillRoundedRect(CX - btnW / 2 + 4, cy - btnH / 2 + 1, btnW - 8, 6, 3);
      const lbl = this.add.text(CX, cy + 1, t(item.key as Parameters<typeof t>[0]), {
        fontFamily: FF, fontSize: '18px', fontStyle: 'bold',
        color: '#fff4de', stroke: '#3a1a06', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(903);
      const hit = this.add.rectangle(CX, cy, btnW, btnH, 0, 0)
        .setInteractive({ useHandCursor: true }).setDepth(904);
      hit.on('pointerdown', () => this.tweens.add({ targets: [bg, lbl], scaleX: 0.93, scaleY: 0.93, duration: 55 }));
      hit.on('pointerup', () => {
        this.tweens.add({ targets: [bg, lbl], scaleX: 1, scaleY: 1, duration: 100, ease: 'Back.Out' });
        item.action();
      });
      hit.on('pointerout', () => this.tweens.add({ targets: [bg, lbl], scaleX: 1, scaleY: 1, duration: 80 }));
      btnObjs.push(bg, lbl, hit);
    });
    this.pauseGroup = btnObjs;
    this.input.keyboard?.on('keydown-ESC', () => this.closePause());
  }

  private closePause(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.pauseGroup.forEach(o => (o as any).destroy?.());
    this.pauseGroup = [];
    this.scene.get('GameScene').scene.resume();
    this.input.keyboard?.removeAllListeners('keydown-ESC');
    this.input.keyboard?.on('keydown-ESC', () => { if (!this.isPaused) this.openPause(); });
  }

  showToast(msg: string): void {
    if (this.toastTimer > 0) return; // already showing
    this.toastText.setText(msg);
    this.toastText.setAlpha(1);
    this.toastGfx.setAlpha(1);
    this.toastTimer = 2500;
    this.time.delayedCall(2500, () => {
      this.tweens.add({ targets: [this.toastText, this.toastGfx], alpha: 0, duration: 400 });
      this.toastTimer = 0;
    });
  }

  private drawSurvivorIcons(count: number): void {
    const SAF   = Math.max(44, this.safeTop + 4);
    const CTR_Y = SAF + 30;
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
    const SAF   = Math.max(44, this.safeTop + 4);

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

    // Refuel overlay
    this.refuelBtn.setVisible(data.showFreeze && !this.refuelBtn.text.startsWith('Loading'));

    // Coin shop toast
    if (data.showCoinShop) {
      this.showToast(t('needCoins'));
    }

    // Level badge
    if (data.levelNum) this.levelBadge.setText(tFmt('levelLabel', { n: data.levelNum }));

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

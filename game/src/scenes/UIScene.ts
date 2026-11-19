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
  survivorGoal: number;
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
  private survivorCountText!: Phaser.GameObjects.Text;

  // Overlay buttons — refuel is now a wooden pill with gauge icon + label.
  private refuelBtn!:   Phaser.GameObjects.Container;
  private refuelLabel!: Phaser.GameObjects.Text;
  private refuelLoading = false;

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

  // Objective pill (compact banner shown after the full banner collapses).
  private objPillBg!:   Phaser.GameObjects.Graphics;
  private objPillText!: Phaser.GameObjects.Text;
  private bannerFullMs = 0;        // ms left on the full banner before it collapses
  private lastStageSignature = ''; // cheap "stage changed" detector

  // Coin flash (yellow bounce when coins increase).
  private lastCoins = 0;
  private coinFlashMs = 0;

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
    this.isDebugMode = typeof window !== 'undefined' && (
      window.location.search.includes('debug') ||
      (() => { try { return localStorage.getItem('fb_debug') === '1'; } catch { return false; } })()
    );
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
    // Up to 5 slot dots for small levels; text "x/N" replaces them for bigger goals.
    this.survivorIcons = [0, 1, 2, 3, 4].map(() => this.add.graphics().setDepth(12));
    this.survivorCountText = this.add.text(270, SAF + 30, '', {
      fontFamily: FF, fontSize: '16px', color: '#ffe8b0',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(12).setVisible(false);

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

    // ── 13. FPS text (debug mode only; top-right, below the HUD bar) ──────
    this.fpsText = this.add.text(W - 10, SAF + BAR_H + 56, '', {
      fontSize: '11px', color: '#ffff00',
    }).setOrigin(1, 0).setDepth(13).setVisible(this.isDebugMode);

    // ── 14. Joystick graphics ─────────────────────────────────────────────
    this.joyGfx = this.add.graphics().setDepth(13);

    // ── 15. "Watch Ad — Refuel" wooden pill (hidden until fuel < 35%) ─────
    // agentB round2 — restyled from the old plain text button to a round
    // wooden pill with a small fuel-gauge icon, visually consistent with the
    // pause button. Shown only when fuel is actually low (<35%), not just
    // during freeze. Width is dynamic (label + icon + padding).
    {
      const btnLabel = t('watchAdRefuel');
      const btnFontSize = 15;
      const iconR = 10;
      const padX = 14;
      // Build inside a container so we can show/hide the whole thing cheaply.
      this.refuelBtn = this.add.container(CX, H - 56).setDepth(20).setVisible(false);
      // Measure label width with a hidden probe to get the right pill width.
      const probe = this.add.text(0, 0, btnLabel, {
        fontFamily: FF, fontSize: `${btnFontSize}px`,
      }).setVisible(false);
      const textW = probe.width;
      probe.destroy();
      const pillW = textW + iconR * 2 + padX * 3 + 10;
      const pillH = 44;

      const pillBg = this.add.graphics();
      pillBg.fillStyle(0x5c3010, 0.95).fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pillBg.lineStyle(2.5, 0xd48030, 1).strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, pillH / 2);
      pillBg.lineStyle(1, 0xffdda0, 0.3).strokeRoundedRect(-pillW / 2 + 3, -pillH / 2 + 3, pillW - 6, pillH - 6, pillH / 2 - 3);

      // Simple fuel-flame icon drawn with Graphics (no texture needed).
      const icon = this.add.graphics();
      const ix = -pillW / 2 + padX + iconR;
      icon.fillStyle(0xff8a3a, 1).fillCircle(ix, 1, iconR);        // outer flame
      icon.fillStyle(0xffd680, 1).fillCircle(ix, 1, iconR * 0.6);   // inner glow
      icon.fillStyle(0xfff6c0, 1).fillCircle(ix, -1, iconR * 0.28); // highlight

      this.refuelLabel = this.add.text(ix + iconR + 6, 0, btnLabel, {
        fontFamily: FF, fontSize: `${btnFontSize}px`,
        color: '#ffe8b0', stroke: '#2a1200', strokeThickness: 3,
      }).setOrigin(0, 0.5);

      const hit = this.add.rectangle(0, 0, pillW + 16, pillH + 16, 0, 0)
        .setInteractive({ useHandCursor: true });

      this.refuelBtn.add([pillBg, icon, this.refuelLabel, hit]);
      hit.on('pointerdown', () => this.tweens.add({ targets: this.refuelBtn, scaleX: 0.92, scaleY: 0.92, duration: 60 }));
      hit.on('pointerup', () => {
        this.tweens.add({ targets: this.refuelBtn, scaleX: 1, scaleY: 1, duration: 100, ease: 'Back.Out' });
        if (this.refuelLoading) return;
        this.refuelLoading = true;
        this.refuelLabel.setText('Loading...');
        showRewarded(
          () => {
            this.scene.get('GameScene').events.emit('fuel-refill');
            this.refuelBtn.setVisible(false);
            this.refuelLabel.setText(btnLabel);
            this.refuelLoading = false;
          },
          () => {
            this.showToast(t('adNotAvailable'));
            this.refuelLabel.setText(btnLabel);
            this.refuelLoading = false;
          },
          () => {
            this.showToast(t('adsAppOnly'));
            this.refuelLabel.setText(btnLabel);
            this.refuelLoading = false;
          },
        );
      });
      hit.on('pointerout', () => this.tweens.add({ targets: this.refuelBtn, scaleX: 1, scaleY: 1, duration: 80 }));
    }

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

    // ── 17. Level badge — part of the top bar so it always sits ABOVE the
    // gameplay (was 11px, alpha 0.7, which overlapped fence sprites in some
    // levels). agentB round2: promoted to 22px gold text matching the coin
    // counter, pinned inside the HUD bar above the pause button.
    this.levelBadge = this.add.text(W - 54, CTR_Y, '', {
      fontFamily: FF, fontSize: '22px', color: '#ffd700',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(1, 0.5).setAlpha(1).setDepth(12);

    // ── 17b. Compact objective pill (top-right, under the HUD bar).
    // Shows `🪵 6/6` style compact progress once the full banner collapses.
    // agentB round2 — stays hidden until the first stage advance arrives.
    const pillY = SAF + BAR_H + 10;
    this.objPillBg = this.add.graphics().setDepth(13).setAlpha(0);
    this.objPillText = this.add.text(W - 12, pillY + 2, '', {
      fontFamily: FF, fontSize: '15px', color: '#ffe8b0',
      stroke: '#2a1200', strokeThickness: 3,
    }).setOrigin(1, 0).setAlpha(0).setDepth(14);

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

    // Draw initial survivor icons (grey) — goal will be refreshed on first hud-update
    this.drawSurvivorIcons(0, 3);
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

  private drawSurvivorIcons(count: number, goal: number): void {
    const SAF   = Math.max(44, this.safeTop + 4);
    const CTR_Y = SAF + 30;
    const useText = goal > 5;
    if (useText) {
      // Hide all dot icons and show compact "x/N" text instead.
      for (const ic of this.survivorIcons) ic.clear();
      this.survivorCountText.setText(`${count}/${goal}`).setVisible(true);
    } else {
      this.survivorCountText.setVisible(false);
      const slots = Math.max(1, goal || 3);
      const spacing = 16;
      const x0 = 272;
      for (let i = 0; i < this.survivorIcons.length; i++) {
        const ic = this.survivorIcons[i];
        ic.clear();
        if (i >= slots) continue;
        const filled = i < count;
        ic.fillStyle(filled ? 0x44ff88 : 0x445566, filled ? 1 : 0.6)
          .fillCircle(x0 + i * spacing, CTR_Y, 6);
      }
    }
  }

  // agentB round2 — collapse the verbose objective banner into a compact
  // pill with an emoji + the first "X/Y" fraction we can find in the text.
  // Falls back to a short truncated string if no counter is present.
  private compactObjective(txt: string): string {
    if (!txt) return '';
    const frac = txt.match(/(\d+)\s*\/\s*(\d+)/);
    const lower = txt.toLowerCase();
    let icon = '';
    if (/odun|log|wood|kütük|k\u00fct\u00fck/i.test(txt)) icon = '🪵';
    else if (/bal[ıi]k|fish/i.test(txt)) icon = '🐟';
    else if (/et|meat/i.test(txt)) icon = '🥩';
    else if (/yemek|cook|pişir|pi\u015fir/i.test(lower)) icon = '🍲';
    else if (/plank|tahta/i.test(txt)) icon = '🪵';
    else if (/kurt|wolf/i.test(txt)) icon = '🐺';
    else if (/çad[ıi]r|tent|çad\u0131r/i.test(txt)) icon = '⛺';
    else if (/kule|watchtower/i.test(lower)) icon = '🏹';
    else icon = '🎯';
    if (frac) return `${icon} ${frac[1]}/${frac[2]}`;
    const shortened = txt.length > 22 ? txt.slice(0, 20) + '…' : txt;
    return `${icon} ${shortened}`;
  }

  private onHudUpdate(data: HudUpdateData): void {
    const SAF   = Math.max(44, this.safeTop + 4);
    const dtMs  = this.game.loop.delta;

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

    // Coin — flash yellow + bounce when it increases so wins are legible.
    // agentB round2 verification hook (task #9): if `[chain]` telemetry
    // reports a delivery but this flash never fires, the UIScene refresh is
    // broken, not the GameScene coin increment.
    if (data.coins > this.lastCoins) {
      this.coinFlashMs = 420;
      this.tweens.add({
        targets: this.coinText, scaleX: 1.22, scaleY: 1.22, duration: 120, yoyo: true, ease: 'Sine.InOut',
      });
    }
    this.lastCoins = data.coins;
    if (this.coinFlashMs > 0) {
      this.coinFlashMs = Math.max(0, this.coinFlashMs - dtMs);
      this.coinText.setColor(this.coinFlashMs > 0 ? '#ffff55' : '#ffd700');
    }
    this.coinText.setText(String(data.coins));

    // Survivor icons / count
    this.drawSurvivorIcons(data.survivors, data.survivorGoal);

    // Banner — full banner shows for 3s on each stage change, then collapses
    // to a compact pill at the top-right with just icon + target.
    // agentB round2: banner collapse feature (task #6).
    const sig = data.goalText;
    if (sig !== this.lastStageSignature && sig.length > 0) {
      this.lastStageSignature = sig;
      this.bannerFullMs = 3000;
    }
    if (this.bannerFullMs > 0) this.bannerFullMs = Math.max(0, this.bannerFullMs - dtMs);
    this.buildBannerText.setText(data.goalText);
    const fullVisible = this.bannerFullMs > 0 || data.bannerAlpha > 0.95; // keep for stage-change ping
    this.buildBannerText.setAlpha(fullVisible ? Math.min(1, data.bannerAlpha) : 0);
    // Compact pill
    const pillLabel = this.compactObjective(data.goalText);
    if (pillLabel && !fullVisible) {
      this.objPillText.setText(pillLabel).setAlpha(1);
      // Size + draw pill bg
      const padX = 10; const padY = 6;
      const w = this.objPillText.width + padX * 2;
      const h = this.objPillText.height + padY * 2;
      const x = this.scale.width - 12 - w;
      const y = SAF + 60 + 6; // just under HUD bar
      this.objPillBg.clear()
        .fillStyle(0x0a0f1e, 0.78).fillRoundedRect(x, y, w, h, 10)
        .lineStyle(1.5, 0xd48030, 0.8).strokeRoundedRect(x, y, w, h, 10)
        .setAlpha(1);
      this.objPillText.setPosition(x + w - padX, y + padY);
    } else {
      this.objPillBg.clear().setAlpha(0);
      this.objPillText.setAlpha(0);
    }

    // Refuel overlay — show ONLY when fuel < 35% OR during active freeze
    // countdown (agentB round2 task #8). Previously shown on freeze only.
    const showRefuel = (data.fuelPct < 0.35 || data.showFreeze) && !this.refuelLoading;
    this.refuelBtn.setVisible(showRefuel || this.refuelLoading);

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

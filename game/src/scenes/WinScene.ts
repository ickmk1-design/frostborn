import Phaser from 'phaser';
import { markComplete, levelNumToKey } from '../progress';
import { showRewarded } from '../services/ads';
import { addCoins } from '../services/economy';
import { FF, drawPanel, makeButton } from '../ui/theme';
import { t } from '../i18n';

const CONFETTI_COLORS = [0xff4444, 0xff9922, 0xffee22, 0x44dd44, 0x44aaff, 0xcc44ff, 0xff88cc];
const NEXT_LEVEL: Record<number, number> = { 1:2, 2:3, 3:4, 4:5, 5:6, 6:7, 7:8, 8:9, 9:10, 10:11, 11:12, 12:13, 13:14, 14:15 };

export default class WinScene extends Phaser.Scene {
  constructor() { super({ key: 'WinScene' }); }

  create(data?: { levelNum?: number; coinsEarned?: number }): void {
    const levelNum = data?.levelNum ?? 1;
    const coinsEarned = data?.coinsEarned ?? 50;
    void markComplete(levelNum);
    const nextNum = NEXT_LEVEL[levelNum];

    const W = this.scale.width;
    const H = this.scale.height;
    const CX = W / 2;

    // Dim overlay
    this.add.rectangle(CX, H / 2, W, H, 0x000820, 0.88);

    // Confetti
    if (!this.textures.exists('confetti')) {
      const g = this.make.graphics({ add: false } as any);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 8);
      g.generateTexture('confetti', 4, 8);
      g.destroy();
    }
    this.time.delayedCall(80, () => {
      for (const col of CONFETTI_COLORS) {
        this.add.particles(CX, -10, 'confetti', {
          speed: { min: 140, max: 420 }, angle: { min: 60, max: 120 },
          gravityY: 380, lifespan: 3200, scale: { min: 0.6, max: 1.4 },
          rotate: { min: 0, max: 360 }, tint: col, quantity: 6, frequency: -1,
          emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-CX, 0, W, 1) } as any,
        }).explode(6);
      }
    });

    // Popup panel
    const panelW = W * 0.88;
    const panelH = H * 0.68;
    const panelY = H * 0.5;
    drawPanel(this, CX, panelY, panelW, panelH, { depth: 5 });

    // Stars
    const starGfx = this.add.graphics().setDepth(10);
    const starY = panelY - panelH * 0.28;
    const starSpacing = Math.min(panelW * 0.22, 72);
    for (let i = 0; i < 3; i++) {
      starGfx.fillStyle(0xffd700, 1); starGfx.lineStyle(2, 0xffaa00, 1);
      this.drawStar(starGfx, CX + (i - 1) * starSpacing, starY, 28, 12);
    }
    starGfx.setAlpha(0).setScale(0.3);
    this.tweens.add({ targets: starGfx, alpha: 1, scaleX: 1, scaleY: 1, duration: 480, ease: 'Back.Out', delay: 120 });

    // Title
    const title = this.add.text(CX, panelY - panelH * 0.14, t('youWin'), {
      fontFamily: FF, fontSize: `${Math.round(W * 0.08)}px`, fontStyle: 'bold',
      color: '#ffe566', stroke: '#aa6600', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setDepth(10);
    this.tweens.add({ targets: title, alpha: 1, y: title.y - 6, duration: 500, ease: 'Quad.Out', delay: 200 });

    // Level + coins
    const sub = this.add.text(CX, panelY - panelH * 0.03, `Level ${levelNum} · +${coinsEarned} coins`, {
      fontFamily: FF, fontSize: '18px', color: '#aaddff',
    }).setOrigin(0.5).setAlpha(0).setDepth(10);
    this.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 400 });

    // Stacked buttons
    const btnW = panelW * 0.8;
    const btnH = Math.round(H * 0.07);
    const btnGap = btnH + 12;
    const btnStartY = panelY + panelH * 0.14;

    // Watch Ad button
    const { bg: adBg, label: adLabel, zone: adZone } = makeButton(this, CX, btnStartY, t('watchAdCoins'), {
      w: btnW, h: btnH, fontSize: '18px', depth: 10,
      bgColor: 0x1a1a00, borderColor: 0x886600,
    });
    adBg.setAlpha(0); adLabel.setAlpha(0);
    this.tweens.add({ targets: [adBg, adLabel], alpha: 1, duration: 350, delay: 540 });
    adZone.on('pointerup', () => {
      adZone.disableInteractive(); adLabel.setText('Loading...');
      showRewarded(
        () => { addCoins(coinsEarned); adLabel.setText('Claimed!').setStyle({ color: '#44ff88' }); },
        () => {
          adLabel.setText(t('adNotAvailable'));
          this.time.delayedCall(2000, () => { if (!adLabel.scene) return; adLabel.setText(t('watchAdCoins')); });
          adZone.setInteractive({ useHandCursor: true });
        },
        () => {
          adLabel.setText(t('adsAppOnly'));
          this.time.delayedCall(2000, () => { if (!adLabel.scene) return; adLabel.setText(t('watchAdCoins')); });
          adZone.setInteractive({ useHandCursor: true });
        },
      );
    });

    // Next Level button
    if (nextNum) {
      const { bg: nextBg, label: nextLabel, zone: nextZone } = makeButton(this, CX, btnStartY + btnGap, t('nextLevel'), {
        w: btnW, h: btnH, fontSize: '22px', depth: 10,
        bgColor: 0x225522, borderColor: 0x44ff44,
      });
      nextBg.setAlpha(0); nextLabel.setAlpha(0);
      this.tweens.add({ targets: [nextBg, nextLabel], alpha: 1, duration: 380, delay: 650 });
      this.time.delayedCall(1050, () => {
        this.tweens.add({ targets: [nextBg, nextLabel], scaleX: 1.03, scaleY: 1.03, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      });
      nextZone.on('pointerup', () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(310, () => this.scene.start('GameScene', { levelKey: levelNumToKey(nextNum), levelNum: nextNum }));
      });

      // Menu
      const { bg: menuBg, label: menuLabel, zone: menuZone } = makeButton(this, CX, btnStartY + btnGap * 2, t('menu'), {
        w: btnW * 0.65, h: btnH * 0.8, fontSize: '18px', depth: 10,
        bgColor: 0x112244, borderColor: 0x2255aa,
      });
      menuBg.setAlpha(0); menuLabel.setAlpha(0);
      this.tweens.add({ targets: [menuBg, menuLabel], alpha: 1, duration: 350, delay: 800 });
      menuZone.on('pointerup', () => {
        this.cameras.main.fadeOut(220, 0, 0, 0);
        this.time.delayedCall(230, () => this.scene.start('LevelSelectScene'));
      });
    } else {
      // Last level — only menu
      const { bg: menuBg, label: menuLabel, zone: menuZone } = makeButton(this, CX, btnStartY + btnGap, t('menu'), {
        w: btnW, h: btnH, fontSize: '22px', depth: 10,
        bgColor: 0x112244, borderColor: 0x2255aa,
      });
      menuBg.setAlpha(0); menuLabel.setAlpha(0);
      this.tweens.add({ targets: [menuBg, menuLabel], alpha: 1, duration: 350, delay: 650 });
      menuZone.on('pointerup', () => {
        this.cameras.main.fadeOut(220, 0, 0, 0);
        this.time.delayedCall(230, () => this.scene.start('LevelSelectScene'));
      });
    }
  }

  private drawStar(g: Phaser.GameObjects.Graphics, cx: number, cy: number, outerR: number, innerR: number): void {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const r = i % 2 === 0 ? outerR : innerR;
      pts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.closePath(); g.fillPath(); g.strokePath();
  }
}

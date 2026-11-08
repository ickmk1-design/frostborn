import Phaser from 'phaser';
import { markComplete, levelNumToKey } from '../progress';
import { showRewarded } from '../services/ads';
import { addCoins } from '../services/economy';

const CONFETTI_COLORS = [0xff4444, 0xff9922, 0xffee22, 0x44dd44, 0x44aaff, 0xcc44ff, 0xff88cc];

const NEXT_LEVEL: Record<number, number> = { 1: 2, 2: 4 };

export default class WinScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WinScene' });
  }

  create(data?: { levelNum?: number; coinsEarned?: number }): void {
    const levelNum = data?.levelNum ?? 1;
    markComplete(levelNum);
    const nextNum = NEXT_LEVEL[levelNum];

    const W = 390; const H = 844; const CX = W / 2;

    this.add.rectangle(CX, H / 2, W, H, 0x000820, 0.88);

    if (!this.textures.exists('confetti')) {
      const g = this.make.graphics({ add: false } as any);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 4, 8);
      g.generateTexture('confetti', 4, 8);
      g.destroy();
    }

    this.time.delayedCall(80, () => {
      for (const col of CONFETTI_COLORS) {
        this.add.particles(CX, -10, 'confetti', {
          speed: { min: 140, max: 420 },
          angle: { min: 60, max: 120 },
          gravityY: 380,
          lifespan: 3200,
          scale: { min: 0.6, max: 1.4 },
          rotate: { min: 0, max: 360 },
          tint: col,
          quantity: 6,
          frequency: -1,
          emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-CX, 0, W, 1) } as any,
        }).explode(6);
      }
    });

    this.time.delayedCall(200, () => {
      if (this.textures.exists('effect_sparkle_reward_burst')) {
        this.add.particles(CX, 320, 'effect_sparkle_reward_burst', {
          speed: { min: 60, max: 180 }, angle: { min: 0, max: 360 },
          scale: { start: 0.6, end: 0 }, alpha: { start: 1, end: 0 },
          lifespan: 900, quantity: 1, frequency: -1,
        }).explode(18);
      }
    });

    const starGfx = this.add.graphics().setDepth(10);
    for (let i = 0; i < 3; i++) {
      this.drawStar(starGfx, CX + (i - 1) * 72, 230, 28, 12);
    }
    starGfx.fillStyle(0xffd700, 1).lineStyle(2, 0xffaa00, 1);
    // redraw with correct style
    starGfx.clear();
    for (let i = 0; i < 3; i++) {
      starGfx.fillStyle(0xffd700, 1); starGfx.lineStyle(2, 0xffaa00, 1);
      this.drawStar(starGfx, CX + (i - 1) * 72, 230, 28, 12);
    }
    starGfx.setAlpha(0).setScale(0.3);
    this.tweens.add({ targets: starGfx, alpha: 1, scaleX: 1, scaleY: 1, duration: 480, ease: 'Back.Out', delay: 120 });

    const title = this.add.text(CX, 320, 'YOU WIN!', {
      fontSize: '54px', color: '#ffe566', fontStyle: 'bold',
      stroke: '#aa6600', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0).setDepth(10);
    this.tweens.add({ targets: title, alpha: 1, y: 310, duration: 500, ease: 'Quad.Out', delay: 200 });

    const sub = this.add.text(CX, 380, `Level ${levelNum} complete!`, {
      fontSize: '18px', color: '#aaddff', align: 'center',
    }).setOrigin(0.5).setAlpha(0).setDepth(10);
    this.tweens.add({ targets: sub, alpha: 1, duration: 400, delay: 420 });

    // Double coins rewarded ad button
    const adBtn = this.add.text(CX, 460, 'Watch Ad — 2× Coins', {
      fontSize: '17px', color: '#ffee88', backgroundColor: '#1a1a00',
      padding: { x: 18, y: 10 }, stroke: '#886600', strokeThickness: 1,
    }).setOrigin(0.5).setAlpha(0).setDepth(10).setInteractive({ useHandCursor: true });

    this.tweens.add({ targets: adBtn, alpha: 1, duration: 350, delay: 540 });

    adBtn.on('pointerdown', () => {
      adBtn.disableInteractive().setText('Loading...');
      showRewarded(
        () => { addCoins(data?.coinsEarned ?? 50); adBtn.setText('Claimed!').setStyle({ color: '#44ff88' }); },
        () => { adBtn.setText('Watch Ad — 2× Coins').setInteractive({ useHandCursor: true }); },
      );
    });

    const btnY = nextNum ? 490 : 500;

    // Next Level button (only if there is a next level)
    if (nextNum) {
      const btn = this.add.text(CX, btnY, `Level ${nextNum}  ->`, {
        fontSize: '24px', color: '#ffffff', backgroundColor: '#225522',
        padding: { x: 28, y: 14 }, stroke: '#44ff44', strokeThickness: 2,
      }).setOrigin(0.5).setAlpha(0).setDepth(10).setInteractive({ useHandCursor: true });

      this.tweens.add({ targets: btn, alpha: 1, duration: 380, delay: 650 });
      btn.on('pointerover', () => btn.setStyle({ color: '#ccffcc' }));
      btn.on('pointerout', () => btn.setStyle({ color: '#ffffff' }));
      btn.on('pointerdown', () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(310, () => {
          this.scene.start('GameScene', { levelKey: levelNumToKey(nextNum), levelNum: nextNum });
        });
      });
      this.time.delayedCall(1050, () => {
        this.tweens.add({ targets: btn, scaleX: 1.04, scaleY: 1.04, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      });
    }

    // Level Select button
    const mapBtn = this.add.text(CX, nextNum ? btnY + 72 : btnY, 'Level Select', {
      fontSize: '18px', color: '#aaccff', backgroundColor: '#112244',
      padding: { x: 22, y: 10 }, stroke: '#2255aa', strokeThickness: 1,
    }).setOrigin(0.5).setAlpha(0).setDepth(10).setInteractive({ useHandCursor: true });

    this.tweens.add({ targets: mapBtn, alpha: 1, duration: 350, delay: 800 });
    mapBtn.on('pointerover', () => mapBtn.setStyle({ color: '#ddeeff' }));
    mapBtn.on('pointerout', () => mapBtn.setStyle({ color: '#aaccff' }));
    mapBtn.on('pointerdown', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('LevelSelectScene'));
    });
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

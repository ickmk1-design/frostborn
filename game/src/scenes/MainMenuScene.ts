import Phaser from 'phaser';
import { FF } from '../ui/theme';
import { t } from '../i18n';

export default class MainMenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MainMenuScene' }); }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const CX = W / 2;
    const safeT = Math.max(Math.round(H * 0.04), 16);

    // ── Background: cover-fit, anchored at centre ─────────────────────────────
    const tex   = this.textures.get('menu_bg').getSourceImage();
    const imgW  = tex.width  as number;   // 1080
    const imgH  = tex.height as number;   // 1919
    const scale = Math.max(W / imgW, H / imgH);
    const dispW = imgW * scale;
    const dispH = imgH * scale;

    this.add.image(CX, H / 2, 'menu_bg')
      .setOrigin(0.5, 0.5).setScale(scale).setDepth(0);

    // Convert normalised image coords → screen coords (cover-crop, centre anchor)
    const img2s = (nx: number, ny: number) => ({
      x: (nx - 0.5) * dispW + CX,
      y: (ny - 0.5) * dispH + H / 2,
    });

    // ── Soft top gradient — sky readable for logo ─────────────────────────────
    const ft = this.add.graphics().setDepth(2);
    ft.fillGradientStyle(0x020510, 0x020510, 0x020510, 0x020510, 0.72, 0.72, 0, 0);
    ft.fillRect(0, 0, W, H * 0.28);

    // ── Soft bottom gradient — snow area for buttons ──────────────────────────
    const fb = this.add.graphics().setDepth(2);
    fb.fillGradientStyle(0x020510, 0x020510, 0x020510, 0x020510, 0, 0, 0.82, 0.82);
    fb.fillRect(0, H * 0.70, W, H * 0.30);

    // ── Campfire warm glow  (image-relative: 0.56, 0.65) ─────────────────────
    const firePos = img2s(0.56, 0.65);
    const glowR   = W * 0.26;
    const glow    = this.add.circle(firePos.x, firePos.y, glowR, 0xff5500, 0.14).setDepth(1);
    this.tweens.add({
      targets: glow,
      alpha:  { from: 0.08, to: 0.22 },
      scaleX: { from: 1.00, to: 1.18 },
      scaleY: { from: 1.00, to: 1.18 },
      duration: 820, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });
    // Second, faster flicker layer
    const flicker = this.add.circle(firePos.x, firePos.y, glowR * 0.5, 0xffaa00, 0.10).setDepth(1);
    this.tweens.add({
      targets: flicker,
      alpha: { from: 0.06, to: 0.18 },
      duration: 180, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      delay: 90,
    });

    // ── Steam from cauldron (just above fire centre) ───────────────────────────
    if (!this.textures.exists('menu_steam')) {
      const sc = document.createElement('canvas');
      sc.width = 8; sc.height = 8;
      const ctx = sc.getContext('2d')!;
      ctx.beginPath(); ctx.arc(4, 4, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      this.textures.addCanvas('menu_steam', sc as HTMLCanvasElement);
    }
    const steamPos = img2s(0.56, 0.60);
    this.add.particles(steamPos.x, steamPos.y, 'menu_steam', {
      speedX: { min: -6, max: 6 },
      speedY: { min: -28, max: -14 },
      scale:  { start: 0.4, end: 0 },
      alpha:  { start: 0.22, end: 0 },
      lifespan: { min: 1200, max: 2200 },
      frequency: 180,
    }).setDepth(3);

    // ── Wolf eyes deep in the forest (image-relative) ─────────────────────────
    const addEyes = (nx: number, ny: number, startDelay: number) => {
      const pos = img2s(nx, ny);
      const sp  = W * 0.023;
      const r   = W * 0.009;
      const L = this.add.circle(pos.x - sp, pos.y, r, 0xff8800, 0.80).setDepth(3);
      const R = this.add.circle(pos.x + sp, pos.y, r, 0xff8800, 0.80).setDepth(3);

      const blink = () => {
        this.time.delayedCall(Phaser.Math.Between(3000, 8000), () => {
          this.tweens.add({
            targets: [L, R],
            scaleY: { from: 1, to: 0.05 },
            duration: 65, yoyo: true, ease: 'Quad.In',
            onComplete: blink,
          });
        });
      };
      this.time.delayedCall(startDelay, blink);

      this.tweens.add({
        targets: [L, R],
        alpha: { from: 0.80, to: 0.22 },
        duration: Phaser.Math.Between(1400, 2400),
        yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });
    };
    addEyes(0.42, 0.34, 400);
    addEyes(0.57, 0.34, 1600);

    // ── Falling snow ──────────────────────────────────────────────────────────
    if (!this.textures.exists('menu_snow')) {
      const sc = document.createElement('canvas');
      sc.width = 6; sc.height = 6;
      const sctx = sc.getContext('2d')!;
      sctx.beginPath(); sctx.arc(3, 3, 2.5, 0, Math.PI * 2);
      sctx.fillStyle = '#ffffff'; sctx.fill();
      this.textures.addCanvas('menu_snow', sc as HTMLCanvasElement);
    }
    this.add.particles(CX, 0, 'menu_snow', {
      speedX: { min: -18, max: 18 },
      speedY: { min: 35, max: 80 },
      scale:  { start: 0.5, end: 0.1 },
      alpha:  { start: 0.75, end: 0 },
      lifespan: { min: 4000, max: 8000 },
      frequency: 90,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-CX, 0, W, 1) } as any,
    }).setDepth(4);

    // ── Logo — in the sky band ────────────────────────────────────────────────
    const logoFS = Math.round(Math.min(W * 0.128, 52));
    const logoY  = safeT + H * 0.08;

    const logoTxt = this.add.text(CX, logoY, 'FROSTBORN', {
      fontFamily: FF, fontSize: `${logoFS}px`, fontStyle: 'bold',
      color: '#d8f4ff', stroke: '#0a2266', strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 2, color: '#4499ff', blur: 12, fill: true },
    }).setOrigin(0.5).setDepth(10);

    const subTxt = this.add.text(CX, logoY + logoFS * 1.15, 'Last Camp', {
      fontFamily: FF, fontSize: `${Math.round(logoFS * 0.50)}px`, fontStyle: 'bold',
      color: '#ffcc55', stroke: '#5a2800', strokeThickness: 3,
      shadow: { offsetX: 0, offsetY: 2, color: '#ff8800', blur: 8, fill: true },
    }).setOrigin(0.5).setDepth(10);

    // Gentle bob
    this.tweens.add({
      targets: [logoTxt, subTxt],
      y: `+=${Math.round(H * 0.007)}`,
      duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    // ── Wooden buttons — empty snow area ─────────────────────────────────────
    const makeWoodBtn = (
      cx: number, cy: number, label: string,
      w: number, h: number, primary: boolean,
    ): Phaser.GameObjects.Rectangle => {
      const r      = Math.min(h / 3, 18);
      const bgCol  = primary ? 0x7a3f14 : 0x4a2810;
      const borCol = primary ? 0xd48030 : 0x8a5020;
      const shCol  = primary ? 0x3a1a06 : 0x25100a;

      const cont = this.add.container(cx, cy).setDepth(10);

      const shadow = this.add.graphics();
      shadow.fillStyle(shCol, 0.55);
      shadow.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, r);

      const bgGfx = this.add.graphics();
      bgGfx.fillStyle(bgCol, 1);
      bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, r);
      bgGfx.lineStyle(2.5, borCol, 1);
      bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
      bgGfx.lineStyle(1.5, 0xffdda0, 0.22);
      bgGfx.strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, r - 1);

      const snow = this.add.graphics();
      snow.fillStyle(0xddeeff, 0.78);
      snow.fillRoundedRect(-w / 2 + 5, -h / 2 - 4, w - 10, 8, 4);

      const fs  = primary ? Math.round(h * 0.47) : Math.round(h * 0.42);
      const lbl = this.add.text(0, 1, label, {
        fontFamily: FF, fontSize: `${fs}px`, fontStyle: 'bold',
        color: '#fff4de', stroke: '#3a1a06', strokeThickness: 3,
      }).setOrigin(0.5);

      cont.add([shadow, bgGfx, snow, lbl]);

      const zone = this.add.rectangle(cx, cy, w, h, 0, 0)
        .setInteractive({ useHandCursor: true })
        .setDepth(14) as Phaser.GameObjects.Rectangle;

      zone.on('pointerdown', () => {
        this.tweens.add({ targets: cont, scaleX: 0.93, scaleY: 0.93, duration: 55, ease: 'Quad.In' });
      });
      const reset = () => {
        this.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, duration: 110, ease: 'Back.Out' });
      };
      zone.on('pointerup', reset);
      zone.on('pointerout', () => {
        this.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, duration: 90 });
      });

      return zone;
    };

    const bigW  = Math.min(W * 0.70, 280);
    const bigH  = Math.round(H * 0.075);
    const smW   = Math.min(W * 0.42, 164);
    const smH   = Math.round(H * 0.062);
    const playY = H * 0.76;
    const rowY  = playY + bigH / 2 + smH / 2 + 12;

    const playZone = makeWoodBtn(CX, playY, t('play'), bigW, bigH, true);
    playZone.on('pointerup', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('LevelSelectScene'));
    });

    const shopZone = makeWoodBtn(CX - smW / 2 - 6, rowY, t('shop'), smW, smH, false);
    shopZone.on('pointerup', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start('ShopScene', { from: 'MainMenuScene' }));
    });

    const settZone = makeWoodBtn(CX + smW / 2 + 6, rowY, t('settings'), smW, smH, false);
    settZone.on('pointerup', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start('SettingsScene'));
    });

    this.add.text(CX, H - safeT - 8, 'v1.0', {
      fontFamily: FF, fontSize: '12px', color: '#3a4f66',
    }).setOrigin(0.5).setDepth(10);
  }
}

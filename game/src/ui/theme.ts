import Phaser from 'phaser';

export const FF = "GameFont, cursive";

export const Colors = {
  bg: 0x0d1428,
  bgDark: 0x060c18,
  panel: 0x1a2540,
  panelBorder: 0x3366aa,
  gold: 0xffd700,
  goldText: '#ffd700',
  white: '#ffffff',
  blue: '#aaddff',
  green: '#44ff88',
  red: '#ff4444',
  muted: '#7799bb',
  btnPrimary: 0x2255aa,
  btnPrimaryBorder: 0x4488ee,
  btnSecondary: 0x1a3a1a,
  btnSecondaryBorder: 0x44aa44,
  btnDanger: 0x331111,
  // Wood palette
  wood:        0x5c3010,
  woodDark:    0x3d2008,
  woodLight:   0x7a4a1a,
  woodBorder:  0xd48030,
  woodBorderDim: 0x8a5020,
  woodText:    '#fff4de',
};

// ── Shared key-art blurred background ────────────────────────────────────────
export function drawKeyArtBg(scene: Phaser.Scene, W: number, H: number): void {
  if (scene.textures.exists('menu_bg_blur')) {
    const tex = scene.textures.get('menu_bg_blur').getSourceImage();
    const s = Math.max(W / (tex.width as number), H / (tex.height as number));
    scene.add.image(W / 2, H / 2, 'menu_bg_blur')
      .setOrigin(0.5, 0.5).setScale(s).setDepth(0);
  } else {
    const bg = scene.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x020510, 0x020510, 0x08152a, 0x08152a, 1);
    bg.fillRect(0, 0, W, H);
  }
  // Extra dark scrim for readability
  const scrim = scene.add.graphics().setDepth(1);
  scrim.fillStyle(0x000000, 0.40);
  scrim.fillRect(0, 0, W, H);

  // Falling snow
  if (!scene.textures.exists('menu_snow')) {
    const sc = document.createElement('canvas');
    sc.width = 6; sc.height = 6;
    const ctx = sc.getContext('2d')!;
    ctx.beginPath(); ctx.arc(3, 3, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    scene.textures.addCanvas('menu_snow', sc as HTMLCanvasElement);
  }
  scene.add.particles(W / 2, 0, 'menu_snow', {
    speedX: { min: -15, max: 15 }, speedY: { min: 28, max: 68 },
    scale: { start: 0.4, end: 0.1 }, alpha: { start: 0.55, end: 0 },
    lifespan: { min: 4000, max: 8000 }, frequency: 110,
    emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-W / 2, 0, W, 1) } as any,
  }).setDepth(2);
}

// ── Wooden panel ─────────────────────────────────────────────────────────────
export function drawWoodPanel(
  scene: Phaser.Scene,
  cx: number, cy: number, w: number, h: number,
  opts: { depth?: number; alpha?: number; radius?: number } = {},
): Phaser.GameObjects.Graphics {
  const r   = opts.radius ?? 16;
  const dep = opts.depth ?? 5;
  const alp = opts.alpha ?? 0.92;
  const g = scene.add.graphics().setDepth(dep);
  g.fillStyle(Colors.woodDark, alp);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
  g.lineStyle(2, Colors.woodBorder, 1);
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, r);
  g.lineStyle(1, 0xffdda0, 0.18);
  g.strokeRoundedRect(cx - w / 2 + 3, cy - h / 2 + 3, w - 6, h - 6, r - 2);
  return g;
}

// ── Wooden button (Container-based, scales correctly on press) ─────────────
export type WoodVariant = 'primary' | 'secondary' | 'green' | 'gold';

export function makeWoodButton(
  scene: Phaser.Scene,
  cx: number, cy: number,
  label: string,
  opts: { w?: number; h?: number; variant?: WoodVariant; depth?: number; fontSize?: string } = {},
): { cont: Phaser.GameObjects.Container; zone: Phaser.GameObjects.Rectangle } {
  const w   = opts.w ?? 200;
  const h   = opts.h ?? 50;
  const dep = opts.depth ?? 10;
  const r   = Math.min(h / 3, 18);
  const v   = opts.variant ?? 'secondary';

  const bgCol  = v === 'primary' ? 0x7a3f14 : v === 'green' ? 0x2a5a14 : v === 'gold' ? 0x5a3a00 : 0x4a2810;
  const borCol = v === 'primary' ? 0xd48030 : v === 'green' ? 0x5aaa2a : v === 'gold' ? 0xd4aa00 : 0x8a5020;
  const shCol  = v === 'primary' ? 0x3a1a06 : v === 'green' ? 0x152e08 : v === 'gold' ? 0x2a1a00 : 0x25100a;

  const cont = scene.add.container(cx, cy).setDepth(dep);

  const shadow = scene.add.graphics();
  shadow.fillStyle(shCol, 0.55);
  shadow.fillRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, r);

  const bgGfx = scene.add.graphics();
  bgGfx.fillStyle(bgCol, 1);
  bgGfx.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  bgGfx.lineStyle(2.5, borCol, 1);
  bgGfx.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  bgGfx.lineStyle(1.5, 0xffdda0, 0.20);
  bgGfx.strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, r - 1);

  const fs = opts.fontSize ?? `${Math.round(h * 0.44)}px`;
  const lbl = scene.add.text(0, 1, label, {
    fontFamily: FF, fontSize: fs, fontStyle: 'bold',
    color: Colors.woodText, stroke: '#3a1a06', strokeThickness: 3,
  }).setOrigin(0.5);

  cont.add([shadow, bgGfx, lbl]);

  const zone = scene.add.rectangle(cx, cy, w, h, 0, 0)
    .setInteractive({ useHandCursor: true })
    .setDepth(dep + 2) as Phaser.GameObjects.Rectangle;

  zone.on('pointerdown', () => {
    scene.tweens.add({ targets: cont, scaleX: 0.93, scaleY: 0.93, duration: 55, ease: 'Quad.In' });
  });
  const reset = () => scene.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, duration: 110, ease: 'Back.Out' });
  zone.on('pointerup', reset);
  zone.on('pointerout', () => scene.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, duration: 90 }));

  return { cont, zone };
}

// ── Round wooden back button ──────────────────────────────────────────────────
export function makeBackButton(
  scene: Phaser.Scene,
  x: number, y: number,
  onClick: () => void,
  depth = 20,
): Phaser.GameObjects.Container {
  const r    = 22;
  const cont = scene.add.container(x, y).setDepth(depth);

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x1a0a00, 0.5);
  shadow.fillCircle(2, 3, r);

  const bg = scene.add.graphics();
  bg.fillStyle(Colors.wood, 1);
  bg.fillCircle(0, 0, r);
  bg.lineStyle(2, Colors.woodBorder, 1);
  bg.strokeCircle(0, 0, r);
  bg.lineStyle(1, 0xffdda0, 0.25);
  bg.strokeCircle(0, 0, r - 3);

  const arrow = scene.add.text(-1, 1, '‹', {
    fontFamily: FF, fontSize: '28px', fontStyle: 'bold',
    color: Colors.woodText,
  }).setOrigin(0.5);

  cont.add([shadow, bg, arrow]);

  const hit = scene.add.circle(x, y, r + 10, 0xffffff, 0)
    .setInteractive({ useHandCursor: true })
    .setDepth(depth + 1);

  hit.on('pointerdown', () => scene.tweens.add({ targets: cont, scaleX: 0.86, scaleY: 0.86, duration: 60 }));
  hit.on('pointerup', () => {
    scene.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, duration: 100, ease: 'Back.Out' });
    onClick();
  });
  hit.on('pointerout', () => scene.tweens.add({ targets: cont, scaleX: 1, scaleY: 1, duration: 80 }));

  return cont;
}

// ── Screen title in icy logo style ────────────────────────────────────────────
export function makeScreenTitle(
  scene: Phaser.Scene,
  cx: number, y: number,
  text: string,
  depth = 20,
): Phaser.GameObjects.Text {
  const W  = scene.scale.width;
  const fs = Math.round(Math.min(W * 0.088, 36));
  return scene.add.text(cx, y, text, {
    fontFamily: FF, fontSize: `${fs}px`, fontStyle: 'bold',
    color: '#d8f4ff', stroke: '#0a2266', strokeThickness: 5,
    shadow: { offsetX: 0, offsetY: 2, color: '#4499ff', blur: 10, fill: true },
  }).setOrigin(0.5).setDepth(depth);
}

// ── Coin display helper (image + text side by side) ───────────────────────────
export function coinLabel(
  scene: Phaser.Scene,
  x: number, y: number,
  amount: string | number,
  fontSize = '17px',
  depth = 10,
): [Phaser.GameObjects.Image | null, Phaser.GameObjects.Text] {
  const iconSize = 20;
  let icon: Phaser.GameObjects.Image | null = null;
  if (scene.textures.exists('resource_coin_gold_01')) {
    icon = scene.add.image(x, y, 'resource_coin_gold_01')
      .setDisplaySize(iconSize, iconSize).setDepth(depth).setOrigin(1, 0.5);
  }
  const txt = scene.add.text(x + (icon ? 4 : 0), y, String(amount), {
    fontFamily: FF, fontSize, fontStyle: 'bold',
    color: Colors.goldText,
    stroke: '#3a2000', strokeThickness: 2,
  }).setOrigin(0, 0.5).setDepth(depth);
  return [icon, txt];
}

// ── Legacy helpers (kept for GameScene / UIScene / WinScene / LoseScene) ─────
export interface ButtonResult {
  bg: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  zone: Phaser.GameObjects.Rectangle;
}

export function makeButton(
  scene: Phaser.Scene,
  cx: number, cy: number,
  text: string,
  opts: {
    w?: number; h?: number; fontSize?: string;
    bgColor?: number; borderColor?: number; textColor?: string;
    depth?: number;
  } = {},
): ButtonResult {
  const w = opts.w ?? 280;
  const h = opts.h ?? 56;
  const bg = scene.add.graphics().setDepth(opts.depth ?? 10);
  bg.fillStyle(opts.bgColor ?? Colors.btnPrimary, 1);
  bg.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, Math.min(h / 4, 16));
  bg.lineStyle(2, opts.borderColor ?? Colors.btnPrimaryBorder, 1);
  bg.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, Math.min(h / 4, 16));

  const label = scene.add.text(cx, cy, text, {
    fontFamily: FF, fontSize: opts.fontSize ?? '22px',
    color: opts.textColor ?? Colors.white,
  }).setOrigin(0.5).setDepth((opts.depth ?? 10) + 1);

  const zone = scene.add.rectangle(cx, cy, w, h, 0xffffff, 0)
    .setInteractive({ useHandCursor: true })
    .setDepth((opts.depth ?? 10) + 2) as Phaser.GameObjects.Rectangle;

  zone.on('pointerdown', () => {
    scene.tweens.add({ targets: [bg, label], scaleX: 0.95, scaleY: 0.95, duration: 60, ease: 'Quad.In' });
  });
  const reset = () => scene.tweens.add({ targets: [bg, label], scaleX: 1, scaleY: 1, duration: 100, ease: 'Back.Out' });
  zone.on('pointerup', reset);
  zone.on('pointerout', () => scene.tweens.add({ targets: [bg, label], scaleX: 1, scaleY: 1, duration: 80 }));

  return { bg, label, zone };
}

export function drawBg(scene: Phaser.Scene, w: number, h: number): void {
  const bg = scene.add.graphics();
  bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x0d1a2e, 0x0d1a2e, 1);
  bg.fillRect(0, 0, w, h);
}

export function drawSnowflakes(scene: Phaser.Scene, w: number, h: number, count = 28): void {
  for (let i = 0; i < count; i++) {
    const x = Phaser.Math.Between(0, w);
    const y = Phaser.Math.Between(0, h);
    const r = Phaser.Math.FloatBetween(1, 3);
    scene.add.circle(x, y, r, 0xaaddff, Phaser.Math.FloatBetween(0.1, 0.4));
  }
}

export function drawPanel(
  scene: Phaser.Scene,
  cx: number, cy: number, w: number, h: number,
  opts: { bgColor?: number; borderColor?: number; alpha?: number; radius?: number; depth?: number } = {},
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(opts.depth ?? 5);
  g.fillStyle(opts.bgColor ?? Colors.panel, opts.alpha ?? 1);
  g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, opts.radius ?? 16);
  g.lineStyle(2, opts.borderColor ?? Colors.panelBorder, 1);
  g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, opts.radius ?? 16);
  return g;
}

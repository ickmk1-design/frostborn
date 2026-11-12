import Phaser from 'phaser';
import { drawPanel, makeButton, FF } from '../ui/theme';
import { t } from '../i18n';
import { setNotifyOptIn, isNotifyOptedIn, isEndlessUnlocked } from '../progress';

/**
 * "New chapters coming soon" teaser screen.
 * Launched from:
 *   - WinScene after L15 (data.returnTo = 'LevelSelectScene')
 *   - LevelSelectScene when tapping the locked "coming soon" node
 */
export default class ChapterTeaserScene extends Phaser.Scene {
  constructor() { super({ key: 'ChapterTeaserScene' }); }

  create(data?: { returnTo?: string }): void {
    const W  = this.scale.width;
    const H  = this.scale.height;
    const CX = W / 2;
    const returnTo = data?.returnTo ?? 'MainMenuScene';

    // Dim backdrop
    this.add.rectangle(CX, H / 2, W, H, 0x02051a, 0.85);

    // Snow particle ambiance — reuse the menu_snow procedural texture if present
    if (!this.textures.exists('menu_snow')) {
      const sc = document.createElement('canvas');
      sc.width = 6; sc.height = 6;
      const ctx = sc.getContext('2d')!;
      ctx.beginPath(); ctx.arc(3, 3, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      this.textures.addCanvas('menu_snow', sc as HTMLCanvasElement);
    }
    this.add.particles(CX, 0, 'menu_snow', {
      speedX: { min: -15, max: 15 }, speedY: { min: 28, max: 68 },
      scale: { start: 0.4, end: 0.1 }, alpha: { start: 0.55, end: 0 },
      lifespan: { min: 4000, max: 8000 }, frequency: 110,
      emitZone: { type: 'random', source: new Phaser.Geom.Rectangle(-CX, 0, W, 1) } as any,
    }).setDepth(2);

    // Panel
    const panelW = W * 0.90;
    const panelH = H * 0.60;
    const panelY = H * 0.5;
    drawPanel(this, CX, panelY, panelW, panelH, { depth: 5 });

    // Title
    this.add.text(CX, panelY - panelH * 0.32, t('comingSoonTitle'), {
      fontFamily: FF, fontSize: `${Math.round(W * 0.07)}px`, fontStyle: 'bold',
      color: '#88ccff', stroke: '#001a44', strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 2, color: '#2266aa', blur: 10, fill: true },
      align: 'center', wordWrap: { width: panelW * 0.9 },
    }).setOrigin(0.5).setDepth(10);

    // Body
    this.add.text(CX, panelY - panelH * 0.12, t('comingSoonBody'), {
      fontFamily: FF, fontSize: '16px', color: '#aaddff',
      align: 'center', wordWrap: { width: panelW * 0.85 },
    }).setOrigin(0.5).setDepth(10);

    // Buttons
    const btnW = panelW * 0.80;
    const btnH = Math.round(H * 0.07);
    const btnGap = btnH + 12;
    const btnStartY = panelY + panelH * 0.05;

    // Endless CTA — only enabled if unlocked
    const unlocked = isEndlessUnlocked();
    const { zone: ctaZone, label: ctaLabel } = makeButton(this, CX, btnStartY, t('comingSoonCta'), {
      w: btnW, h: btnH, fontSize: '20px', depth: 10,
      bgColor: unlocked ? 0x224477 : 0x222233,
      borderColor: unlocked ? 0x5599ff : 0x3a3a55,
    });
    if (!unlocked) { ctaLabel.setAlpha(0.5); }
    ctaZone.on('pointerup', () => {
      if (!unlocked) return;
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('EndlessScene'));
    });

    // Notify opt-in
    const notifyLabelText = isNotifyOptedIn() ? t('comingSoonNotified') : t('comingSoonNotify');
    const { zone: notifyZone, label: notifyLabel } = makeButton(this, CX, btnStartY + btnGap, notifyLabelText, {
      w: btnW, h: btnH * 0.85, fontSize: '15px', depth: 10,
      bgColor: 0x1a2a44, borderColor: 0x3366aa,
    });
    notifyZone.on('pointerup', async () => {
      if (isNotifyOptedIn()) return;
      let granted = true;
      try {
        if (typeof Notification !== 'undefined' && Notification.requestPermission) {
          const perm = await Notification.requestPermission();
          granted = perm === 'granted';
        }
      } catch { granted = false; }
      if (granted) {
        await setNotifyOptIn(true);
        notifyLabel.setText(t('comingSoonNotified'));
      } else {
        notifyLabel.setText(t('comingSoonBlocked'));
      }
    });

    // Close / back
    const { zone: backZone } = makeButton(this, CX, btnStartY + btnGap * 2 + 4, t('menu'), {
      w: btnW * 0.6, h: btnH * 0.75, fontSize: '16px', depth: 10,
      bgColor: 0x112244, borderColor: 0x2255aa,
    });
    backZone.on('pointerup', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start(returnTo));
    });
  }
}

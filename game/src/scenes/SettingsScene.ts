import Phaser from 'phaser';
import { FF, drawKeyArtBg, makeBackButton, makeScreenTitle, makeWoodButton, drawWoodPanel } from '../ui/theme';
import { t } from '../i18n';

const PREF_MUSIC = 'fb_music';
const PREF_SFX   = 'fb_sfx';
const PREF_VIB   = 'fb_vibration';

function getPref(key: string, def = true): boolean {
  try { const v = localStorage.getItem(key); return v === null ? def : v === '1'; } catch { return def; }
}
function setPref(key: string, val: boolean): void {
  try { localStorage.setItem(key, val ? '1' : '0'); } catch {}
}

export default class SettingsScene extends Phaser.Scene {
  private fromScene = 'MainMenuScene';
  constructor() { super({ key: 'SettingsScene' }); }

  init(data?: { from?: string }): void {
    this.fromScene = (data as any)?.from ?? 'MainMenuScene';
  }

  create(): void {
    const W    = this.scale.width;
    const H    = this.scale.height;
    const CX   = W / 2;
    const safeT = Math.max(Math.round(H * 0.04), 16);

    drawKeyArtBg(this, W, H);

    makeBackButton(this, safeT + 24, safeT + 24, () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start(this.fromScene));
    });

    makeScreenTitle(this, CX, safeT + 24, t('settingsTitle'));

    // ── Layout measurements ───────────────────────────────────────────────────
    const panelW  = Math.min(W * 0.90, 360);
    const rowH    = Math.round(Math.min(H * 0.072, 54));
    const rowGap  = rowH + 10;
    const restH   = Math.round(rowH * 0.84);
    const linkH   = Math.round(rowH * 0.68);
    const rows    = 3;
    const totalInner = rows * rowH + (rows - 1) * 10 + 20 + restH + 16 + linkH + 28;
    const panelCY = safeT + 80 + totalInner / 2;

    drawWoodPanel(this, CX, panelCY, panelW, totalInner + 24, { depth: 5 });

    let rowY = panelCY - totalInner / 2 + rowH / 2 + 12;

    // ── Toggles ───────────────────────────────────────────────────────────────
    const addToggle = (labelKey: string, prefKey: string): void => {
      let val = getPref(prefKey, true);

      this.add.text(CX - panelW * 0.38, rowY, t(labelKey as Parameters<typeof t>[0]), {
        fontFamily: FF, fontSize: `${Math.round(rowH * 0.44)}px`,
        color: '#d8f0ff',
      }).setOrigin(0, 0.5).setDepth(10);

      const trackW = Math.round(W * 0.145);
      const trackH = Math.round(rowH * 0.52);
      const trackX = CX + panelW * 0.38 - trackW;
      const trackY = rowY - trackH / 2;
      const knobR  = trackH / 2 - 2;

      const gfx = this.add.graphics().setDepth(11);
      const redraw = (on: boolean) => {
        gfx.clear();
        gfx.fillStyle(on ? 0xc06010 : 0x2a1a08, 1);
        gfx.fillRoundedRect(trackX, trackY, trackW, trackH, trackH / 2);
        gfx.lineStyle(1.5, on ? 0xe8901a : 0x5a3012, 1);
        gfx.strokeRoundedRect(trackX, trackY, trackW, trackH, trackH / 2);
        const kx = on ? trackX + trackW - trackH / 2 : trackX + trackH / 2;
        gfx.fillStyle(0xeef5ff, 1);
        gfx.fillCircle(kx, rowY, knobR);
        gfx.lineStyle(1, 0xaaccee, 0.6);
        gfx.strokeCircle(kx, rowY, knobR);
        gfx.fillStyle(0xffffff, 0.55);
        gfx.fillEllipse(kx - knobR * 0.25, rowY - knobR * 0.35, knobR, knobR * 0.6);
      };
      redraw(val);

      this.add.rectangle(trackX + trackW / 2, rowY, trackW + 14, trackH + 14, 0xffffff, 0)
        .setInteractive({ useHandCursor: true }).setDepth(13)
        .on('pointerup', () => { val = !val; setPref(prefKey, val); redraw(val); });

      rowY += rowGap;
    };

    addToggle('music',     PREF_MUSIC);
    addToggle('sfx',       PREF_SFX);
    addToggle('vibration', PREF_VIB);

    rowY += 6;

    // ── Restore purchases ─────────────────────────────────────────────────────
    const { zone: restZone } = makeWoodButton(this, CX, rowY + restH / 2, t('restorePurchases'), {
      w: panelW * 0.78, h: restH, variant: 'secondary', depth: 10,
      fontSize: `${Math.round(restH * 0.40)}px`,
    });
    restZone.on('pointerup', async () => {
      const { restorePurchases } = await import('../services/purchases');
      await restorePurchases().catch(() => {});
    });
    rowY += restH + 12;

    // ── Privacy + Terms ───────────────────────────────────────────────────────
    const halfW = (panelW * 0.78) / 2 - 5;
    const { zone: privZone } = makeWoodButton(this, CX - halfW / 2 - 5, rowY + linkH / 2, t('privacy'), {
      w: halfW, h: linkH, variant: 'secondary', depth: 10,
      fontSize: `${Math.round(linkH * 0.40)}px`,
    });
    privZone.on('pointerup', () => window.open('https://cytbilisim.com/frostborn/privacy', '_blank'));

    const { zone: termsZone } = makeWoodButton(this, CX + halfW / 2 + 5, rowY + linkH / 2, t('terms'), {
      w: halfW, h: linkH, variant: 'secondary', depth: 10,
      fontSize: `${Math.round(linkH * 0.40)}px`,
    });
    termsZone.on('pointerup', () => window.open('https://cytbilisim.com/frostborn/terms', '_blank'));

    this.add.text(CX, H - safeT - 10, 'v1.0', {
      fontFamily: FF, fontSize: '12px', color: '#3a4f66',
    }).setOrigin(0.5).setDepth(10);
  }
}

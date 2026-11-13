import Phaser from 'phaser';
import { FF, drawKeyArtBg, makeBackButton, makeScreenTitle, makeWoodButton, drawWoodPanel } from '../ui/theme';
import { t } from '../i18n';
import { unlockAllLevels } from '../progress';
import { addCoins } from '../services/economy';

const PREF_MUSIC = 'fb_music';
const PREF_SFX   = 'fb_sfx';
const PREF_VIB   = 'fb_vibration';
const DEBUG_FLAG = 'fb_debug';

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

    const debugUnlocked = (() => {
      try { return localStorage.getItem(DEBUG_FLAG) === '1'; } catch { return false; }
    })();
    const versionLabel = debugUnlocked ? 'v1.0 · DEBUG' : 'v1.0';
    const versionText = this.add.text(CX, H - safeT - 10, versionLabel, {
      fontFamily: FF, fontSize: '12px', color: debugUnlocked ? '#88ffdd' : '#3a4f66',
    }).setOrigin(0.5).setDepth(10);

    versionText.setInteractive({ useHandCursor: false });
    if (debugUnlocked) {
      // Already unlocked — single tap re-opens the menu.
      versionText.on('pointerup', () => this.openDebugMenu());
    } else {
      // 5 taps within 1.8s window unlock the hidden debug menu.
      let tapCount = 0;
      let tapResetTimer: Phaser.Time.TimerEvent | null = null;
      versionText.on('pointerup', () => {
        tapCount++;
        if (tapResetTimer) tapResetTimer.remove();
        tapResetTimer = this.time.delayedCall(1800, () => { tapCount = 0; });
        if (tapCount >= 5) {
          tapCount = 0;
          try { localStorage.setItem(DEBUG_FLAG, '1'); } catch {}
          versionText.setText('v1.0 · DEBUG').setColor('#88ffdd');
          this.openDebugMenu();
        }
      });
    }
  }

  private openDebugMenu(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const CX = W / 2;
    const CY = H / 2;

    // Dim backdrop
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.72)
      .setOrigin(0).setDepth(1000).setInteractive();

    const panelW = Math.min(W * 0.84, 320);
    const rowH = 44;
    const rows = 5; // title + 4 actions
    const panelH = 24 + rows * rowH + 20;
    drawWoodPanel(this, CX, CY, panelW, panelH, { depth: 1001 });

    const title = this.add.text(CX, CY - panelH / 2 + 22, 'Debug Menu', {
      fontFamily: FF, fontSize: '16px', color: '#88ffdd',
    }).setOrigin(0.5).setDepth(1002);

    const made: Phaser.GameObjects.GameObject[] = [dim, title];
    const closeAll = () => { made.forEach(o => o.destroy()); };

    const btnY = (i: number) => CY - panelH / 2 + 24 + rowH * (i + 0.6);

    const mkBtn = (i: number, label: string, onTap: () => void) => {
      const { cont, zone } = makeWoodButton(this, CX, btnY(i), label, {
        w: panelW - 32, h: rowH - 8, variant: 'primary', depth: 1002,
        fontSize: '14px',
      });
      zone.on('pointerup', onTap);
      made.push(cont, zone);
    };

    mkBtn(0, 'Unlock all levels', async () => {
      await unlockAllLevels();
      flashToast(this, 'All 15 levels unlocked');
    });
    mkBtn(1, '+1000 coins', () => {
      addCoins(1000);
      flashToast(this, '+1000 coins');
    });
    mkBtn(2, 'Jump to level…', () => {
      const n = window.prompt('Jump to level (1-15)?', '1');
      const lvl = Math.max(1, Math.min(15, parseInt(n || '0', 10)));
      if (!lvl || isNaN(lvl)) return;
      closeAll();
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start('GameScene', { levelKey: `level${String(lvl).padStart(2, '0')}`, levelNum: lvl }));
    });
    mkBtn(3, 'Start Endless', () => {
      closeAll();
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start('EndlessScene'));
    });

    // Close via backdrop tap
    dim.on('pointerup', closeAll);
  }
}

function flashToast(scene: Phaser.Scene, msg: string): void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const toast = scene.add.text(W / 2, H * 0.82, msg, {
    fontFamily: FF, fontSize: '14px', color: '#ffffff',
    backgroundColor: '#111a2cdd', padding: { x: 14, y: 8 },
  }).setOrigin(0.5).setDepth(2000);
  scene.tweens.add({
    targets: toast, alpha: { from: 1, to: 0 }, delay: 1200, duration: 500,
    onComplete: () => toast.destroy(),
  });
}

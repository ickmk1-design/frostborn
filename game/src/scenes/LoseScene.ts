import Phaser from 'phaser';
import { levelNumToKey } from '../progress';
import { showRewarded } from '../services/ads';
import { FF, drawPanel, makeButton } from '../ui/theme';
import { t } from '../i18n';

export default class LoseScene extends Phaser.Scene {
  constructor() { super({ key: 'LoseScene' }); }

  create(data?: { levelNum?: number }): void {
    const levelNum = data?.levelNum ?? 1;
    const W = this.scale.width;
    const H = this.scale.height;
    const CX = W / 2;

    this.add.rectangle(CX, H / 2, W, H, 0x000000, 0.75);

    // Popup panel
    const panelW = W * 0.86;
    const panelH = H * 0.5;
    const panelY = H * 0.5;
    drawPanel(this, CX, panelY, panelW, panelH, { depth: 5 });

    this.add.text(CX, panelY - panelH * 0.3, t('youFroze'), {
      fontFamily: FF, fontSize: `${Math.round(W * 0.1)}px`, fontStyle: 'bold',
      color: '#88ccff', stroke: '#002244', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(10);

    this.add.text(CX, panelY - panelH * 0.14, t('frozeOver'), {
      fontFamily: FF, fontSize: '18px', color: '#aaddff',
    }).setOrigin(0.5).setDepth(10);

    // Stacked buttons with proper spacing
    const btnW = panelW * 0.8;
    const btnH = Math.round(H * 0.07);
    const btnGap = btnH + 14;
    const btnStartY = panelY + panelH * 0.06;

    const { zone: reviveZone, label: reviveLabel } = makeButton(this, CX, btnStartY, t('watchAdRevive'), {
      w: btnW, h: btnH, fontSize: '18px', depth: 10,
      bgColor: 0x001a1a, borderColor: 0x005544,
    });
    reviveZone.on('pointerup', () => {
      reviveZone.disableInteractive(); reviveLabel.setText('Loading...');
      showRewarded(
        () => {
          this.cameras.main.fadeOut(200, 0, 0, 0);
          this.time.delayedCall(210, () => this.scene.start('GameScene', { levelKey: levelNumToKey(levelNum), levelNum, revive: true }));
        },
        () => {
          reviveLabel.setText(t('adNotAvailable'));
          this.time.delayedCall(2000, () => { if (!reviveLabel.scene) return; reviveLabel.setText(t('watchAdRevive')); });
          reviveZone.setInteractive({ useHandCursor: true });
        },
        () => {
          reviveLabel.setText(t('adsAppOnly'));
          this.time.delayedCall(2000, () => { if (!reviveLabel.scene) return; reviveLabel.setText(t('watchAdRevive')); });
          reviveZone.setInteractive({ useHandCursor: true });
        },
      );
    });

    const { zone: retryZone } = makeButton(this, CX, btnStartY + btnGap, t('tryAgain'), {
      w: btnW, h: btnH, fontSize: '22px', depth: 10,
      bgColor: 0x333344, borderColor: 0x5566aa,
    });
    retryZone.on('pointerup', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('GameScene', { levelKey: levelNumToKey(levelNum), levelNum }));
    });

    const { zone: mapZone } = makeButton(this, CX, btnStartY + btnGap * 2, t('menu'), {
      w: btnW * 0.65, h: btnH * 0.8, fontSize: '18px', depth: 10,
      bgColor: 0x112244, borderColor: 0x2255aa,
    });
    mapZone.on('pointerup', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('LevelSelectScene'));
    });
  }
}

import Phaser from 'phaser';
import { levelNumToKey } from '../progress';
import { showRewarded } from '../services/ads';

export default class LoseScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoseScene' });
  }

  create(data?: { levelNum?: number }): void {
    const levelNum = data?.levelNum ?? 1;
    const W = 390; const CX = W / 2;

    this.add.rectangle(CX, 422, W, 844, 0x000000, 0.75);

    this.add.text(CX, 290, 'You Froze...', {
      fontSize: '48px', color: '#88ccff', fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(CX, 358, 'The camp froze over.', {
      fontSize: '20px', color: '#aaddff',
    }).setOrigin(0.5);

    const retryBtn = this.add.text(CX, 460, '[ Try Again ]', {
      fontSize: '22px', color: '#ffff88',
      backgroundColor: '#333344', padding: { x: 20, y: 12 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    retryBtn.on('pointerover', () => retryBtn.setStyle({ color: '#ffffcc' }));
    retryBtn.on('pointerout', () => retryBtn.setStyle({ color: '#ffff88' }));
    retryBtn.on('pointerdown', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => {
        this.scene.start('GameScene', { levelKey: levelNumToKey(levelNum), levelNum });
      });
    });

    const reviveBtn = this.add.text(CX, 460 - 46, 'Watch Ad — Revive', {
      fontSize: '17px', color: '#88ffee', backgroundColor: '#001a1a',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    reviveBtn.on('pointerdown', () => {
      reviveBtn.disableInteractive().setText('Loading...');
      showRewarded(
        () => {
          this.cameras.main.fadeOut(200, 0, 0, 0);
          this.time.delayedCall(210, () => {
            this.scene.start('GameScene', { levelKey: levelNumToKey(levelNum), levelNum, revive: true });
          });
        },
        () => { reviveBtn.setText('Watch Ad — Revive').setInteractive({ useHandCursor: true }); },
      );
    });

    const mapBtn = this.add.text(CX, 540, 'Level Select', {
      fontSize: '18px', color: '#aaccff',
      backgroundColor: '#112244', padding: { x: 22, y: 10 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    mapBtn.on('pointerover', () => mapBtn.setStyle({ color: '#ddeeff' }));
    mapBtn.on('pointerout', () => mapBtn.setStyle({ color: '#aaccff' }));
    mapBtn.on('pointerdown', () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('LevelSelectScene'));
    });
  }
}

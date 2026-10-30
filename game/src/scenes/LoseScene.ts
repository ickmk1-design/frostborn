import Phaser from 'phaser';

export default class LoseScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LoseScene' });
  }

  create(): void {
    this.add.rectangle(195, 422, 390, 844, 0x000000, 0.75);
    this.add
      .text(195, 300, 'You Froze...', {
        fontSize: '48px',
        color: '#88ccff',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.add
      .text(195, 370, 'The camp froze over.', {
        fontSize: '20px',
        color: '#aaddff',
      })
      .setOrigin(0.5);
    const btn = this.add
      .text(195, 480, '[ Try Again ]', {
        fontSize: '22px',
        color: '#ffff88',
        backgroundColor: '#333344',
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive();
    btn.on('pointerdown', () => this.scene.start('GameScene'));
  }
}

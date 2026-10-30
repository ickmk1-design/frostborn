import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import GameScene from './scenes/GameScene';
import WinScene from './scenes/WinScene';
import LoseScene from './scenes/LoseScene';

new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#1a1a2e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 390,
    height: 844,
  },
  scene: [BootScene, GameScene, WinScene, LoseScene],
});

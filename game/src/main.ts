import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import LevelSelectScene from './scenes/LevelSelectScene';
import GameScene from './scenes/GameScene';
import UIScene from './scenes/UIScene';
import WinScene from './scenes/WinScene';
import LoseScene from './scenes/LoseScene';
import ShopScene from './scenes/ShopScene';
import { loadProgress } from './progress';
import { loadEconomy } from './services/economy';
import { initAppLifecycle } from './services/appLifecycle';
import { initAds } from './services/ads';
import { initPurchases } from './services/purchases';

async function boot(): Promise<void> {
  // Load persisted data before Phaser starts so scenes have sync access
  await loadProgress();
  await loadEconomy();

  // Native services (no-ops on web)
  await initAppLifecycle();
  await initPurchases();
  await initAds();

  new Phaser.Game({
    type: Phaser.AUTO,
    backgroundColor: '#1a1a2e',
    parent: 'game',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 390,
      height: 844,
    },
    scene: [BootScene, LevelSelectScene, GameScene, UIScene, WinScene, LoseScene, ShopScene],
  });
}

boot();

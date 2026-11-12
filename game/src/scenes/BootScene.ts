import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Images needed before main menu renders.
    this.load.image('building_cauldron_firepit_01', 'assets/building_cauldron_firepit_01.webp');
    this.load.image('resource_coin_gold_01', 'assets/resource_coin_gold_01.webp');
    this.load.image('menu_bg', 'assets/ui/menu_bg.webp');
    this.load.image('menu_bg_blur', 'assets/ui/menu_bg_blur.webp');
    // Shop item icons
    for (const key of [
      'shop_icon_starter', 'shop_icon_no_ads',
      'shop_icon_coins_small', 'shop_icon_coins_medium', 'shop_icon_coins_large',
      'shop_icon_worker', 'shop_icon_backpack', 'shop_icon_axe',
    ]) {
      this.load.image(key, `assets/ui/shop/${key}.webp`);
    }
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const levelParam = params.get('level');
    if (levelParam) {
      const num = parseInt(levelParam, 10);
      const key = `level${String(num).padStart(2, '0')}`;
      this.scene.start('GameScene', { levelKey: key, levelNum: num });
    } else {
      this.scene.start('MainMenuScene');
    }
  }
}

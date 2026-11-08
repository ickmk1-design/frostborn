import Phaser from 'phaser';
import { getCoins, hasUpgrade, buyUpgrade, hasIap } from '../services/economy';
import { getOfferings, purchasePackage, restorePurchases } from '../services/purchases';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';

interface ShopItem {
  id: string;
  label: string;
  desc: string;
  price: string;
  coinCost?: number;
  owned: () => boolean;
  buy: () => Promise<boolean>;
  pkg?: PurchasesPackage;
}

export default class ShopScene extends Phaser.Scene {
  private fromScene = 'LevelSelectScene';

  constructor() { super({ key: 'ShopScene' }); }

  init(data?: { from?: string }): void {
    this.fromScene = data?.from ?? 'LevelSelectScene';
  }

  async create(): Promise<void> {
    const W = 390; const H = 844; const CX = W / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x0d1428, 0x0d1428, 1);
    bg.fillRect(0, 0, W, H);

    // Header
    this.add.text(CX, 60, 'SHOP', {
      fontSize: '34px', fontStyle: 'bold', color: '#ffe566',
      stroke: '#885500', strokeThickness: 3,
    }).setOrigin(0.5);

    // Coin balance — icon + number
    this.add.image(CX - 36, 100, 'resource_coin_gold_01').setDisplaySize(22, 22).setOrigin(0.5);
    const coinText = this.add.text(CX - 22, 100, String(getCoins()), {
      fontSize: '18px', color: '#ffd700',
    }).setOrigin(0, 0.5);
    void coinText; // updated after purchases

    // Back button
    const back = this.add.text(24, 44, '< Back', {
      fontSize: '16px', color: '#aaccff', backgroundColor: '#112244',
      padding: { x: 10, y: 6 },
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
    back.on('pointerdown', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start(this.fromScene));
    });

    // Load IAP packages
    const pkgs = await getOfferings();
    const pkgMap: Record<string, PurchasesPackage> = {};
    for (const p of pkgs) pkgMap[p.identifier] = p;

    function iapPrice(id: string, fallback: string): string {
      return pkgMap[id]?.product.priceString ?? fallback;
    }

    const items: ShopItem[] = [
      // ── IAP products ────────────────────────────────────────────────────────
      {
        id: 'remove_ads',
        label: 'Remove Ads',
        desc: 'No more interstitials, ever.',
        price: iapPrice('remove_ads', '$3.99'),
        owned: () => hasIap('remove_ads'),
        buy: async () => {
          const pkg = pkgMap['remove_ads'];
          if (!pkg) return false;
          return purchasePackage(pkg);
        },
        pkg: pkgMap['remove_ads'],
      },
      {
        id: 'starter_pack',
        label: 'Starter Pack',
        desc: '1000 coins + extra worker + remove ads',
        price: iapPrice('starter_pack', '$1.99'),
        owned: () => hasIap('starter_pack'),
        buy: async () => {
          const pkg = pkgMap['starter_pack'];
          if (!pkg) return false;
          return purchasePackage(pkg);
        },
        pkg: pkgMap['starter_pack'],
      },
      {
        id: 'coins_small',
        label: '250 Coins',
        desc: 'Small coin pack',
        price: iapPrice('coins_small', '$0.99'),
        owned: () => false,
        buy: async () => {
          const pkg = pkgMap['coins_small'];
          if (!pkg) return false;
          return purchasePackage(pkg);
        },
        pkg: pkgMap['coins_small'],
      },
      {
        id: 'coins_medium',
        label: '900 Coins',
        desc: 'Medium coin pack',
        price: iapPrice('coins_medium', '$2.99'),
        owned: () => false,
        buy: async () => {
          const pkg = pkgMap['coins_medium'];
          if (!pkg) return false;
          return purchasePackage(pkg);
        },
        pkg: pkgMap['coins_medium'],
      },
      {
        id: 'coins_large',
        label: '2500 Coins',
        desc: 'Large coin pack — best value',
        price: iapPrice('coins_large', '$6.99'),
        owned: () => false,
        buy: async () => {
          const pkg = pkgMap['coins_large'];
          if (!pkg) return false;
          return purchasePackage(pkg);
        },
        pkg: pkgMap['coins_large'],
      },
      // ── Coin upgrades ────────────────────────────────────────────────────────
      {
        id: 'extra_worker',
        label: 'Extra Worker',
        desc: 'Start each level with +1 worker',
        price: '200 coins',
        coinCost: 200,
        owned: () => hasUpgrade('extra_worker'),
        buy: async () => buyUpgrade('extra_worker', 200),
      },
      {
        id: 'carry_plus2',
        label: 'Bigger Backpack',
        desc: 'Carry capacity +2',
        price: '150 coins',
        coinCost: 150,
        owned: () => hasUpgrade('carry_plus2'),
        buy: async () => buyUpgrade('carry_plus2', 150),
      },
      {
        id: 'fast_chop',
        label: 'Sharp Axe',
        desc: 'Chop 25% faster',
        price: '175 coins',
        coinCost: 175,
        owned: () => hasUpgrade('fast_chop'),
        buy: async () => buyUpgrade('fast_chop', 175),
      },
    ];

    const startY = 142; const rowH = 82;
    items.forEach((item, i) => {
      const cy = startY + i * rowH;
      this.drawShopRow(CX, cy, item, coinText);
    });

    // Restore purchases button
    const restoreY = startY + items.length * rowH + 20;
    const restore = this.add.text(CX, restoreY, 'Restore Purchases', {
      fontSize: '14px', color: '#7799aa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    restore.on('pointerdown', async () => {
      restore.setText('Restoring...');
      await restorePurchases();
      restore.setText('Restored!');
      this.time.delayedCall(1500, () => restore.setText('Restore Purchases'));
      coinText.setText(String(getCoins()));
    });
  }

  private drawShopRow(
    cx: number, cy: number,
    item: ShopItem,
    coinText: Phaser.GameObjects.Text,
  ): void {
    const W = 350; const H = 72;
    const x = cx - W / 2; const y = cy - H / 2;
    const owned = item.owned();

    const card = this.add.graphics();
    card.fillStyle(owned ? 0x0d2a0d : 0x0d1428, 1);
    card.fillRoundedRect(x, y, W, H, 8);
    card.lineStyle(1, owned ? 0x33aa33 : 0x224466, 1);
    card.strokeRoundedRect(x, y, W, H, 8);

    this.add.text(x + 12, cy - 14, item.label, {
      fontSize: '15px', fontStyle: 'bold', color: owned ? '#88ee88' : '#ddeeff',
    });
    this.add.text(x + 12, cy + 8, item.desc, {
      fontSize: '11px', color: '#7799aa',
    });

    if (owned) {
      this.add.text(cx + W / 2 - 12, cy, 'OWNED', {
        fontSize: '12px', color: '#44cc44',
      }).setOrigin(1, 0.5);
    } else {
      const btnX = cx + W / 2 - 12;
      // For coin-priced items show icon + number; for IAP show price string
      if (item.coinCost !== undefined) {
        const icon = this.add.image(btnX - 46, cy, 'resource_coin_gold_01')
          .setDisplaySize(18, 18).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        const num  = this.add.text(btnX - 26, cy, String(item.coinCost), {
          fontSize: '14px', color: '#ffd700', backgroundColor: '#332200',
          padding: { x: 8, y: 5 },
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });

        const doBuy = async () => {
          icon.disableInteractive(); num.disableInteractive(); num.setText('...');
          const ok = await item.buy();
          if (ok) {
            coinText.setText(String(getCoins()));
            card.clear();
            card.fillStyle(0x0d2a0d, 1).fillRoundedRect(x, y, W, H, 8);
            card.lineStyle(1, 0x33aa33, 1).strokeRoundedRect(x, y, W, H, 8);
            icon.destroy(); num.destroy();
            this.add.text(btnX, cy, 'OWNED', { fontSize: '12px', color: '#44cc44' }).setOrigin(1, 0.5);
          } else {
            num.setText(String(item.coinCost)).setInteractive({ useHandCursor: true });
            icon.setInteractive({ useHandCursor: true });
          }
        };
        icon.on('pointerdown', doBuy);
        num.on('pointerdown', doBuy);
      } else {
        const btn = this.add.text(btnX, cy, item.price, {
          fontSize: '14px', color: '#ffe566', backgroundColor: '#332200',
          padding: { x: 10, y: 5 },
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover', () => btn.setStyle({ color: '#fff0aa' }));
        btn.on('pointerout',  () => btn.setStyle({ color: '#ffe566' }));
        btn.on('pointerdown', async () => {
          btn.disableInteractive().setText('...');
          const ok = await item.buy();
          if (ok) {
            coinText.setText(String(getCoins()));
            card.clear();
            card.fillStyle(0x0d2a0d, 1).fillRoundedRect(x, y, W, H, 8);
            card.lineStyle(1, 0x33aa33, 1).strokeRoundedRect(x, y, W, H, 8);
            btn.destroy();
            this.add.text(btnX, cy, 'OWNED', { fontSize: '12px', color: '#44cc44' }).setOrigin(1, 0.5);
          } else {
            btn.setText(item.price).setInteractive({ useHandCursor: true });
          }
        });
      }
    }
  }
}

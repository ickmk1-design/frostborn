import Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import { getCoins, hasUpgrade, buyUpgrade, hasIap } from '../services/economy';
import { getOfferings, purchasePackage, restorePurchases } from '../services/purchases';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { FF, Colors, drawKeyArtBg, makeBackButton, makeScreenTitle, drawWoodPanel } from '../ui/theme';
import { t, getLang } from '../i18n';

interface ShopItem {
  id: string;
  label: string;
  desc: string;
  price: string;
  coinCost?: number;
  bestValue?: boolean;
  featured?: boolean;
  owned: () => boolean;
  buy: () => Promise<boolean>;
}

export default class ShopScene extends Phaser.Scene {
  private fromScene = 'LevelSelectScene';
  private toastText!: Phaser.GameObjects.Text;
  private toastBg!: Phaser.GameObjects.Graphics;
  private toastTween?: Phaser.Tweens.Tween;
  private coinBalanceText!: Phaser.GameObjects.Text;
  // Set true while the user is scrolling (> 8px drag) — buttons check this to block accidental fires
  public listDragging = false;
  // Last toast message shown — read by automated tests
  public lastToastMsg = '';

  constructor() { super({ key: 'ShopScene' }); }

  init(data?: { from?: string }): void {
    this.fromScene = (data as any)?.from ?? 'LevelSelectScene';
  }

  async create(): Promise<void> {
    const W    = this.scale.width;
    const H    = this.scale.height;
    const CX   = W / 2;
    const safeT = Math.max(Math.round(H * 0.04), 16);

    drawKeyArtBg(this, W, H);

    // Back button
    makeBackButton(this, safeT + 24, safeT + 24, () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start(this.fromScene));
    }, 20);

    // Title
    makeScreenTitle(this, CX, safeT + 24, t('shopTitle'));

    // Coin balance — top right
    const coinBarX = W - safeT - 10;
    if (this.textures.exists('resource_coin_gold_01')) {
      this.add.image(coinBarX - 46, safeT + 24, 'resource_coin_gold_01')
        .setDisplaySize(24, 24).setDepth(21);
    }
    this.coinBalanceText = this.add.text(coinBarX - 20, safeT + 24, String(getCoins()), {
      fontFamily: FF, fontSize: '18px', fontStyle: 'bold',
      color: Colors.goldText, stroke: '#3a2000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(21);

    // Load IAP packages
    let pkgMap: Record<string, PurchasesPackage> = {};
    try {
      const pkgs = await getOfferings();
      for (const p of pkgs) pkgMap[p.identifier] = p;
    } catch { /* ok if fails in browser */ }

    const iapPrice = (id: string, fb: string) => pkgMap[id]?.product.priceString ?? fb;
    const isNative = Capacitor.isNativePlatform();
    const isTr     = getLang() === 'tr';

    const items: ShopItem[] = [
      {
        id: 'starter_pack', featured: true,
        label: isTr ? 'Başlangıç Paketi' : 'Starter Pack',
        desc:  isTr ? '1000 jeton + ekstra işçi + reklamsız' : '1000 coins + extra worker + remove ads',
        price: iapPrice('starter_pack', '$1.99'),
        owned: () => hasIap('starter_pack'),
        buy: async () => {
          if (!isNative) { this.showToast(t('purchasesAppOnly')); return false; }
          const pkg = pkgMap['starter_pack']; if (!pkg) return false;
          return purchasePackage(pkg);
        },
      },
      {
        id: 'remove_ads',
        label: isTr ? 'Reklamsız' : 'Remove Ads',
        desc:  isTr ? 'Reklam yok, sonsuza dek.' : 'No more ads, ever.',
        price: iapPrice('remove_ads', '$3.99'),
        owned: () => hasIap('remove_ads'),
        buy: async () => {
          if (!isNative) { this.showToast(t('purchasesAppOnly')); return false; }
          const pkg = pkgMap['remove_ads']; if (!pkg) return false;
          return purchasePackage(pkg);
        },
      },
      {
        id: 'coins_small',
        label: isTr ? '250 Jeton' : '250 Coins',
        desc:  isTr ? 'Küçük jeton paketi' : 'Small coin pack',
        price: iapPrice('coins_small', '$0.99'),
        owned: () => false,
        buy: async () => {
          if (!isNative) { this.showToast(t('purchasesAppOnly')); return false; }
          const pkg = pkgMap['coins_small']; if (!pkg) return false;
          return purchasePackage(pkg);
        },
      },
      {
        id: 'coins_medium',
        label: isTr ? '900 Jeton' : '900 Coins',
        desc:  isTr ? 'Orta jeton paketi' : 'Medium coin pack',
        price: iapPrice('coins_medium', '$2.99'),
        owned: () => false,
        buy: async () => {
          if (!isNative) { this.showToast(t('purchasesAppOnly')); return false; }
          const pkg = pkgMap['coins_medium']; if (!pkg) return false;
          return purchasePackage(pkg);
        },
      },
      {
        id: 'coins_large', bestValue: true,
        label: isTr ? '2500 Jeton' : '2500 Coins',
        desc:  isTr ? 'Büyük paket — en iyi değer' : 'Large pack — best value',
        price: iapPrice('coins_large', '$6.99'),
        owned: () => false,
        buy: async () => {
          if (!isNative) { this.showToast(t('purchasesAppOnly')); return false; }
          const pkg = pkgMap['coins_large']; if (!pkg) return false;
          return purchasePackage(pkg);
        },
      },
      {
        id: 'extra_worker',
        label: isTr ? 'Ekstra İşçi' : 'Extra Worker',
        desc:  isTr ? 'Her bölüme +1 işçiyle başla' : 'Start each level with +1 worker',
        price: '200', coinCost: 200,
        owned: () => hasUpgrade('extra_worker'),
        buy: async () => buyUpgrade('extra_worker', 200),
      },
      {
        id: 'carry_plus2',
        label: isTr ? 'Büyük Çanta' : 'Bigger Backpack',
        desc:  isTr ? 'Taşıma kapasitesi +2' : 'Carry capacity +2',
        price: '150', coinCost: 150,
        owned: () => hasUpgrade('carry_plus2'),
        buy: async () => buyUpgrade('carry_plus2', 150),
      },
      {
        id: 'fast_chop',
        label: isTr ? 'Keskin Balta' : 'Sharp Axe',
        desc:  isTr ? '%25 daha hızlı keser' : 'Chop 25% faster',
        price: '175', coinCost: 175,
        owned: () => hasUpgrade('fast_chop'),
        buy: async () => buyUpgrade('fast_chop', 175),
      },
    ];

    // ── Scroll list ───────────────────────────────────────────────────────────
    const topBarH   = safeT + 54;
    const bottomH   = 50;
    const featuredH = Math.round(H * 0.165);
    const rowH      = Math.round(H * 0.098);
    const gap       = 8;
    const cardW     = W * 0.92;

    // Calculate total list height
    let totalListH = 0;
    items.forEach(item => { totalListH += (item.featured ? featuredH : rowH) + gap; });
    totalListH -= gap;

    const listStartY = topBarH + 10;
    const container  = this.add.container(0, listStartY).setDepth(10);

    let curY = 0;
    items.forEach(item => {
      const h = item.featured ? featuredH : rowH;
      this.buildCard(container, CX, curY + h / 2, cardW, h, item);
      curY += h + gap;
    });

    // Scroll clamp
    const minScrollY = listStartY + Math.min(0, H - listStartY - totalListH - bottomH);
    let dragStartY = 0; let contStartY = listStartY;
    let scrollVel = 0; let lastDragY = 0; let lastDragTime = 0;

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      this.listDragging = false;
      dragStartY = ptr.y; contStartY = container.y;
      scrollVel = 0; lastDragY = ptr.y; lastDragTime = ptr.downTime;
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (ptr.isDown) {
        // Only commit to a drag after 8px — keeps taps from moving the list
        if (!this.listDragging && Math.abs(ptr.y - dragStartY) > 8) this.listDragging = true;
        if (this.listDragging) {
          container.y = Phaser.Math.Clamp(contStartY + (ptr.y - dragStartY), minScrollY, listStartY);
          const now = this.time.now;
          const elapsed = now - lastDragTime;
          if (elapsed > 0) scrollVel = (ptr.y - lastDragY) / elapsed * 16;
          lastDragY = ptr.y; lastDragTime = now;
        }
      }
    });
    this.input.on('pointerup', () => {
      if (this.listDragging && Math.abs(scrollVel) > 0.5) {
        const target = Phaser.Math.Clamp(container.y + scrollVel * 12, minScrollY, listStartY);
        this.tweens.add({ targets: container, y: target, duration: 500, ease: 'Quad.Out' });
      }
      this.listDragging = false;
      scrollVel = 0;
    });

    // Top/bottom fade masks
    const topFade = this.add.graphics().setDepth(18);
    topFade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.7, 0.7, 0, 0);
    topFade.fillRect(0, 0, W, topBarH);

    const botFade = this.add.graphics().setDepth(18);
    botFade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.7, 0.7);
    botFade.fillRect(0, H - bottomH, W, bottomH);

    // Toast
    this.toastBg   = this.add.graphics().setDepth(100).setAlpha(0);
    this.toastText = this.add.text(CX, H + 60, '', {
      fontFamily: FF, fontSize: '15px', color: '#ffffff',
      padding: { x: 18, y: 10 },
    }).setOrigin(0.5, 1).setDepth(101).setAlpha(0);
  }

  // ── Card builder ─────────────────────────────────────────────────────────────
  private buildCard(
    cont: Phaser.GameObjects.Container,
    cx: number, cy: number,
    cardW: number, cardH: number,
    item: ShopItem,
  ): void {
    const owned  = item.owned();
    const r      = 12;
    const x      = cx - cardW / 2;
    const y      = cy - cardH / 2;
    const isFeat = !!item.featured;

    // Card background
    const card = this.add.graphics();
    if (isFeat) {
      card.fillStyle(0x4a2a08, 0.96);
      card.fillRoundedRect(x, y, cardW, cardH, r);
      card.lineStyle(2.5, 0xe8903a, 1);
      card.strokeRoundedRect(x, y, cardW, cardH, r);
      card.lineStyle(1, 0xffcc80, 0.25);
      card.strokeRoundedRect(x + 3, y + 3, cardW - 6, cardH - 6, r - 2);
    } else {
      card.fillStyle(owned ? 0x1a3a12 : 0x2e1808, 0.92);
      card.fillRoundedRect(x, y, cardW, cardH, r);
      card.lineStyle(1.5, owned ? 0x44aa33 : 0x7a4a1a, 1);
      card.strokeRoundedRect(x, y, cardW, cardH, r);
    }
    cont.add(card);

    // Icon area
    const iconSize = Math.round(cardH * 0.56);
    const iconX    = x + 14 + iconSize / 2;
    const iconBg   = this.add.graphics();
    const iconColor = isFeat ? 0x7a4a14
      : item.id.startsWith('coins') ? 0x5a3a00
      : item.id === 'remove_ads'    ? 0x3a1414
      : item.id === 'extra_worker'  ? 0x14305a
      : item.id === 'carry_plus2'   ? 0x2a3a14
      : 0x1a2a3a;
    iconBg.fillStyle(iconColor, 0.9);
    iconBg.fillRoundedRect(iconX - iconSize / 2, cy - iconSize / 2, iconSize, iconSize, 8);
    cont.add(iconBg);

    // Icon image
    const iconKey =
      item.id === 'starter_pack'  ? 'shop_icon_starter' :
      item.id === 'remove_ads'    ? 'shop_icon_no_ads' :
      item.id === 'coins_small'   ? 'shop_icon_coins_small' :
      item.id === 'coins_medium'  ? 'shop_icon_coins_medium' :
      item.id === 'coins_large'   ? 'shop_icon_coins_large' :
      item.id === 'extra_worker'  ? 'shop_icon_worker' :
      item.id === 'carry_plus2'   ? 'shop_icon_backpack' : 'shop_icon_axe';
    if (this.textures.exists(iconKey)) {
      const iconImg = this.add.image(iconX, cy, iconKey)
        .setDisplaySize(iconSize, iconSize).setOrigin(0.5);
      cont.add(iconImg);
    }

    // Text area
    const textX   = x + 14 + iconSize + 10;
    const availW  = cardW - (14 + iconSize + 10) - 10 - (owned ? 70 : 90);
    const labelFS = isFeat ? Math.round(cardH * 0.16) : Math.round(cardH * 0.24);
    const descFS  = Math.round(cardH * 0.15);

    const labelY  = isFeat ? cy - cardH * 0.22 : cy - cardH * 0.13;
    const descY   = isFeat ? cy + cardH * 0.10  : cy + cardH * 0.09;

    const lbl = this.add.text(textX, labelY, item.label, {
      fontFamily: FF, fontSize: `${labelFS}px`, fontStyle: 'bold',
      color: owned ? '#88ee88' : isFeat ? '#ffe8b0' : '#d8f0ff',
      ...(isFeat ? {} : { wordWrap: { width: availW } }),
    }).setOrigin(0, 0.5);

    const desc = this.add.text(textX, descY, item.desc, {
      fontFamily: FF, fontSize: `${descFS}px`,
      color: owned ? '#55aa55' : '#9aabb8',
      wordWrap: { width: availW },
    }).setOrigin(0, 0);
    cont.add([lbl, desc]);

    // "BEST VALUE" ribbon
    if (item.bestValue && !owned) {
      const ribbonW = Math.round(cardW * 0.26);
      const ribbonH = Math.round(cardH * 0.26);
      const rx = x + cardW - ribbonW / 2 - 2;
      const ry = y + ribbonH / 2 - 2;
      const ribbon = this.add.graphics();
      ribbon.fillStyle(0xcc2200, 1);
      ribbon.fillRoundedRect(rx - ribbonW / 2, ry - ribbonH / 2, ribbonW, ribbonH, 6);
      ribbon.lineStyle(1.5, 0xff6644, 1);
      ribbon.strokeRoundedRect(rx - ribbonW / 2, ry - ribbonH / 2, ribbonW, ribbonH, 6);
      const isTr = getLang() === 'tr';
      const ribbonTxt = this.add.text(rx, ry, isTr ? 'EN İYİ\nDEĞER' : 'BEST\nVALUE', {
        fontFamily: FF, fontSize: `${Math.round(ribbonH * 0.38)}px`, fontStyle: 'bold',
        color: '#ffffff', align: 'center',
      }).setOrigin(0.5);
      cont.add([ribbon, ribbonTxt]);
    }

    // Owned badge
    if (owned) {
      const badge = this.add.text(x + cardW - 12, cy, '✓ OWNED', {
        fontFamily: FF, fontSize: `${Math.round(cardH * 0.20)}px`, fontStyle: 'bold',
        color: '#44cc44', stroke: '#0a2a0a', strokeThickness: 2,
      }).setOrigin(1, 0.5);
      cont.add(badge);
      return;
    }

    // ── Price button ─────────────────────────────────────────────────────────
    const btnW   = Math.round(cardW * 0.26);
    const btnH   = Math.round(cardH * 0.44);
    const btnX   = x + cardW - 12 - btnW / 2;
    const btnCol = item.coinCost !== undefined ? 0x5a3a00 : 0x1a4a1a;
    const borCol = item.coinCost !== undefined ? 0xd4aa00 : 0x44aa22;

    // Sub-container so the whole button shakes as a unit
    const btnCont = this.add.container(btnX, cy);
    cont.add(btnCont);

    const btnBg = this.add.graphics();
    btnBg.fillStyle(btnCol, 1);
    btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
    btnBg.lineStyle(2, borCol, 1);
    btnBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 8);
    btnCont.add(btnBg);

    // Price label (coordinates relative to btnCont origin)
    let priceLbl: Phaser.GameObjects.GameObject[];
    if (item.coinCost !== undefined) {
      const coinFS  = Math.round(btnH * 0.38);
      const coinTxt = this.add.text(2, 1, item.price, {
        fontFamily: FF, fontSize: `${coinFS}px`, fontStyle: 'bold',
        color: Colors.goldText, stroke: '#2a1800', strokeThickness: 2,
      }).setOrigin(0.5);
      priceLbl = [coinTxt];
      if (this.textures.exists('resource_coin_gold_01')) {
        const coinIcon = this.add.image(-btnW / 2 + 12, 0, 'resource_coin_gold_01')
          .setDisplaySize(Math.round(btnH * 0.4), Math.round(btnH * 0.4));
        priceLbl.push(coinIcon);
        coinTxt.setX(8);
      }
    } else {
      const priceTxt = this.add.text(0, 0, item.price, {
        fontFamily: FF, fontSize: `${Math.round(btnH * 0.36)}px`, fontStyle: 'bold',
        color: '#ccffcc', stroke: '#0a2a0a', strokeThickness: 2,
      }).setOrigin(0.5);
      priceLbl = [priceTxt];
    }
    btnCont.add(priceLbl as Phaser.GameObjects.GameObject[]);

    const hit = this.add.rectangle(0, 0, btnW + 12, btnH + 12, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    btnCont.add(hit);

    hit.on('pointerdown', () => {
      this.tweens.add({ targets: [btnBg, ...priceLbl], scaleX: 0.91, scaleY: 0.91, duration: 60, ease: 'Quad.In' });
    });
    hit.on('pointerout', () => {
      this.tweens.add({ targets: [btnBg, ...priceLbl], scaleX: 1, scaleY: 1, duration: 80 });
    });
    hit.on('pointerup', async () => {
      // Ignore pointer-up that ended a scroll gesture
      if (this.listDragging) {
        this.tweens.add({ targets: [btnBg, ...priceLbl], scaleX: 1, scaleY: 1, duration: 80 });
        return;
      }
      this.tweens.add({ targets: [btnBg, ...priceLbl], scaleX: 1, scaleY: 1, duration: 100, ease: 'Back.Out' });

      if (item.coinCost !== undefined && getCoins() < item.coinCost) {
        this.showToast(t('notEnoughCoins'));
        this.tweens.killTweensOf(btnCont);
        this.tweens.add({ targets: btnCont, x: btnX + 6, duration: 50, ease: 'Linear', yoyo: true, repeat: 3, onComplete: () => { btnCont.x = btnX; } });
        return;
      }

      hit.disableInteractive();
      (priceLbl[0] as Phaser.GameObjects.Text).setText?.('...');

      const ok = await item.buy().catch(() => false);

      if (ok) {
        this.coinBalanceText.setText(String(getCoins()));
        card.clear();
        card.fillStyle(0x1a3a12, 0.92).fillRoundedRect(x, y, cardW, cardH, r);
        card.lineStyle(1.5, 0x44aa33, 1).strokeRoundedRect(x, y, cardW, cardH, r);
        btnCont.destroy();
        const ownedBadge = this.add.text(x + cardW - 12, cy, '✓ OWNED', {
          fontFamily: FF, fontSize: `${Math.round(cardH * 0.20)}px`, fontStyle: 'bold',
          color: '#44cc44', stroke: '#0a2a0a', strokeThickness: 2,
        }).setOrigin(1, 0.5);
        cont.add(ownedBadge);
        lbl.setColor('#88ee88');
      } else {
        hit.setInteractive({ useHandCursor: true });
        const txt = priceLbl[0] as Phaser.GameObjects.Text;
        txt.setText?.(item.price);
      }
    });
  }

  showToast(msg: string): void {
    this.lastToastMsg = msg;
    const H  = this.scale.height;
    const CX = this.scale.width / 2;
    this.toastText.setText(msg).setPosition(CX, H - 20).setAlpha(1);
    this.toastBg.clear();
    const tw = this.toastText.width + 40;
    const th = this.toastText.height + 24;
    this.toastBg.fillStyle(0x000000, 0.78);
    this.toastBg.fillRoundedRect(CX - tw / 2, H - 20 - th, tw, th, 12);
    this.toastBg.setAlpha(1);
    if (this.toastTween) this.toastTween.stop();
    this.toastTween = this.tweens.add({ targets: [this.toastText, this.toastBg], alpha: 0, delay: 2000, duration: 500 });
  }
}

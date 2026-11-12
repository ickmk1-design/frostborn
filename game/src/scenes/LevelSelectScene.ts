import Phaser from 'phaser';
import { isUnlocked, isCompleted, levelNumToKey } from '../progress';
import { getCoins } from '../services/economy';
import { FF, Colors, drawKeyArtBg, makeBackButton, makeScreenTitle, makeWoodButton } from '../ui/theme';
import { t } from '../i18n';

const LEVELS = [
  { num: 1,  name: 'The Frozen Camp',     subtitle: 'Rescue survivors & build camp'          },
  { num: 2,  name: 'The Hunting Ground',  subtitle: 'Hunt wolves for meat'                   },
  { num: 3,  name: 'Frozen Valley',       subtitle: 'More survivors, first wolves appear'    },
  { num: 4,  name: "The Alpha's Den",     subtitle: 'Boss fight — Alpha Wolf'                },
  { num: 5,  name: "The Blizzard's Edge", subtitle: 'Hunt 2 wolves first'                    },
  { num: 6,  name: 'Ice Storm',           subtitle: 'Fire drains faster — act quickly'       },
  { num: 7,  name: 'Dead Pines',          subtitle: 'Few trees, more wolves'                 },
  { num: 8,  name: 'The Pack',            subtitle: 'Hunt 3 wolves before building'          },
  { num: 9,  name: 'The Forsaken Ridge',  subtitle: 'Only 2 trees — manage fuel carefully'   },
  { num: 10, name: 'The Second Alpha',    subtitle: 'Boss fight — faster Alpha Wolf'         },
  { num: 11, name: 'The Last Fire',       subtitle: 'Fire drains at 6.5/sec — no margin'    },
  { num: 12, name: 'Ash and Ice',         subtitle: 'Multi-wave hunt through deep zone'      },
  { num: 13, name: 'The Hunger',          subtitle: 'Resource scarcity, 10 survivors'        },
  { num: 14, name: 'Twilight of Ice',     subtitle: 'Beta Wolf guards the first zone'        },
  { num: 15, name: "Winter's End",        subtitle: 'Final boss — Grand Alpha'               },
];

export default class LevelSelectScene extends Phaser.Scene {
  private dragStartY    = 0;
  private dragStartX    = 0;
  private contStartY    = 0;
  private isDragging    = false;
  private scrollCont!:  Phaser.GameObjects.Container;
  private minScrollY    = 0;
  private topBarH       = 0;
  private scrollVel     = 0;
  private lastDragY     = 0;
  private lastDragTime  = 0;

  constructor() { super({ key: 'LevelSelectScene' }); }

  create(): void {
    const W    = this.scale.width;
    const H    = this.scale.height;
    const CX   = W / 2;
    const safeT = Math.max(Math.round(H * 0.04), 16);
    this.topBarH = safeT + 56;

    drawKeyArtBg(this, W, H);

    // Back button
    makeBackButton(this, safeT + 24, safeT + 24, () => {
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.time.delayedCall(230, () => this.scene.start('MainMenuScene'));
    });

    // Title
    makeScreenTitle(this, CX, safeT + 24, t('selectLevel'));

    // Coin counter top-right
    const coinX = W - safeT - 10;
    if (this.textures.exists('resource_coin_gold_01')) {
      this.add.image(coinX - 46, safeT + 24, 'resource_coin_gold_01')
        .setDisplaySize(24, 24).setDepth(21);
    }
    this.add.text(coinX - 20, safeT + 24, String(getCoins()), {
      fontFamily: FF, fontSize: '18px', fontStyle: 'bold',
      color: Colors.goldText, stroke: '#3a2000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(21);

    // Cards
    const cardW   = W * 0.90;
    const cardH   = Math.round(H * 0.098);
    const gap     = 8;
    const startY  = this.topBarH + 10;

    this.scrollCont = this.add.container(0, startY).setDepth(10);

    let curY = 0;
    for (const lv of LEVELS) {
      this.drawCard(this.scrollCont, CX, curY + cardH / 2, cardW, cardH, lv.num, lv.name, lv.subtitle);
      curY += cardH + gap;
    }

    const totalH    = LEVELS.length * (cardH + gap) - gap;
    const bottomH   = 54;
    this.minScrollY = startY + Math.min(0, H - startY - totalH - bottomH);

    // Top/bottom fade
    const topFade = this.add.graphics().setDepth(18);
    topFade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.65, 0.65, 0, 0);
    topFade.fillRect(0, 0, W, this.topBarH);

    const botFade = this.add.graphics().setDepth(18);
    botFade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.65, 0.65);
    botFade.fillRect(0, H - bottomH - 4, W, bottomH + 4);

    // Shop button
    const { zone: shopZone } = makeWoodButton(this, CX, H - 26, t('shop'), {
      w: Math.min(W * 0.55, 220), h: 42, variant: 'green', depth: 20,
      fontSize: `${Math.round(42 * 0.42)}px`,
    });
    shopZone.on('pointerup', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start('ShopScene', { from: 'LevelSelectScene' }));
    });

    // Drag scroll with momentum
    this.scrollVel = 0;
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.y > this.topBarH) {
        this.isDragging = true;
        this.dragStartY = ptr.y; this.dragStartX = ptr.x;
        this.contStartY = this.scrollCont.y;
        this.scrollVel  = 0; this.lastDragY = ptr.y; this.lastDragTime = this.time.now;
      }
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (this.isDragging && ptr.isDown) {
        this.scrollCont.y = Phaser.Math.Clamp(
          this.contStartY + (ptr.y - this.dragStartY),
          this.minScrollY, startY,
        );
        const now = this.time.now;
        const dt  = now - this.lastDragTime;
        if (dt > 0) this.scrollVel = (ptr.y - this.lastDragY) / dt * 16;
        this.lastDragY = ptr.y; this.lastDragTime = now;
      }
    });
    this.input.on('pointerup', () => { this.isDragging = false; });
  }

  update(_t: number, delta: number): void {
    if (this.isDragging || Math.abs(this.scrollVel) < 0.5) { this.scrollVel = 0; return; }
    const startY = this.topBarH + 10;
    this.scrollCont.y = Phaser.Math.Clamp(
      this.scrollCont.y + this.scrollVel * delta / 16,
      this.minScrollY, startY,
    );
    this.scrollVel *= 0.88; // friction
  }

  private drawCard(
    cont: Phaser.GameObjects.Container,
    cx: number, cy: number, w: number, h: number,
    num: number, name: string, subtitle: string,
  ): void {
    const unlocked  = isUnlocked(num);
    const completed = isCompleted(num);
    const x = cx - w / 2;
    const y = cy - h / 2;
    const r = 10;

    const bgCol  = completed ? 0x1a3a0e : unlocked ? 0x2e1e0a : 0x0e0e18;
    const borCol = completed ? 0x44bb33 : unlocked ? 0x9a6030 : 0x2a2a3a;
    const badgeC = completed ? 0x2a5a18 : unlocked ? 0x5a3818 : 0x18182a;

    const card = this.add.graphics();
    card.fillStyle(bgCol, 0.92);
    card.fillRoundedRect(x, y, w, h, r);
    card.lineStyle(1.5, borCol, 1);
    card.strokeRoundedRect(x, y, w, h, r);
    // Level badge
    const badgeW = Math.round(h * 0.68);
    card.fillStyle(badgeC, 1);
    card.fillRoundedRect(x + 10, cy - badgeW / 2, badgeW, badgeW, 7);
    cont.add(card);

    // Level number
    const numTxt = this.add.text(x + 10 + badgeW / 2, cy - badgeW * 0.1, String(num), {
      fontFamily: FF, fontSize: `${Math.round(badgeW * 0.52)}px`, fontStyle: 'bold',
      color: unlocked ? '#ffffff' : '#3a3a55',
    }).setOrigin(0.5);
    const lvlTxt = this.add.text(x + 10 + badgeW / 2, cy + badgeW * 0.28, 'LVL', {
      fontFamily: FF, fontSize: `${Math.round(badgeW * 0.22)}px`,
      color: unlocked ? '#99bbcc' : '#2a2a44',
    }).setOrigin(0.5);

    const textX   = x + 10 + badgeW + 10;
    const nameCol = completed ? '#88ee77' : unlocked ? '#d8f0ff' : '#3a3a55';
    const subCol  = completed ? '#55aa44' : unlocked ? '#8a9fb0' : '#2a2a44';

    const nameTxt = this.add.text(textX, cy - h * 0.14, name, {
      fontFamily: FF, fontSize: `${Math.round(h * 0.24)}px`, fontStyle: unlocked ? 'bold' : 'normal',
      color: nameCol,
    }).setOrigin(0, 0.5);
    const subTxt = this.add.text(textX, cy + h * 0.18, subtitle, {
      fontFamily: FF, fontSize: `${Math.round(h * 0.17)}px`,
      color: subCol,
    }).setOrigin(0, 0.5);
    cont.add([numTxt, lvlTxt, nameTxt, subTxt]);

    if (completed) {
      const star = this.add.text(x + w - 12, y + 8, '★', {
        fontFamily: FF, fontSize: `${Math.round(h * 0.30)}px`, color: '#ffdd44',
      }).setOrigin(1, 0);
      cont.add(star);
    } else if (!unlocked) {
      const lock = this.add.text(x + w - 12, cy, '🔒', {
        fontSize: `${Math.round(h * 0.28)}px`,
      }).setOrigin(1, 0.5);
      cont.add(lock);
    }

    if (!unlocked) return;

    const hit = this.add.rectangle(cx, cy, w, h, 0xffffff, 0)
      .setInteractive({ useHandCursor: true });
    cont.add(hit);

    hit.on('pointerover', () => {
      card.clear();
      card.fillStyle(completed ? 0x224a1a : 0x3e2a0e, 0.95);
      card.fillRoundedRect(x, y, w, h, r);
      card.lineStyle(1.5, completed ? 0x66ee44 : 0xd48030, 1);
      card.strokeRoundedRect(x, y, w, h, r);
      card.fillStyle(badgeC, 1);
      card.fillRoundedRect(x + 10, cy - badgeW / 2, badgeW, badgeW, 7);
    });
    hit.on('pointerout', () => {
      card.clear();
      card.fillStyle(bgCol, 0.92).fillRoundedRect(x, y, w, h, r);
      card.lineStyle(1.5, borCol, 1).strokeRoundedRect(x, y, w, h, r);
      card.fillStyle(badgeC, 1).fillRoundedRect(x + 10, cy - badgeW / 2, badgeW, badgeW, 7);
    });
    // Only navigate on pointerup if the total drag distance was small (tap, not drag)
    let tapPtrY = 0;
    hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => { tapPtrY = ptr.y; });
    hit.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      const traveled = Math.abs(ptr.y - tapPtrY);
      const listMoved = Math.abs(this.scrollCont.y - this.contStartY);
      if (traveled < 10 && listMoved < 8) {
        this.cameras.main.fadeOut(220, 0, 0, 0);
        this.time.delayedCall(230, () => {
          this.scene.start('GameScene', { levelKey: levelNumToKey(num), levelNum: num });
        });
      }
    });
  }
}

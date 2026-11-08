import Phaser from 'phaser';
import { getProgress, isUnlocked, isCompleted, levelNumToKey } from '../progress';
import { getCoins } from '../services/economy';

const LEVELS = [
  { num: 1,  name: 'The Frozen Camp',    subtitle: 'Rescue survivors & build camp'          },
  { num: 2,  name: 'The Hunting Ground', subtitle: 'Hunt wolves for meat'                   },
  { num: 3,  name: 'Frozen Valley',      subtitle: 'More survivors, first wolves appear'    },
  { num: 4,  name: "The Alpha's Den",    subtitle: 'Boss fight — Alpha Wolf'                },
  { num: 5,  name: "The Blizzard's Edge",subtitle: 'Hunt 2 wolves first'                   },
  { num: 6,  name: 'Ice Storm',          subtitle: 'Fire drains faster — act quickly'       },
  { num: 7,  name: 'Dead Pines',         subtitle: 'Few trees, more wolves'                 },
  { num: 8,  name: 'The Pack',           subtitle: 'Hunt 3 wolves before building'          },
  { num: 9,  name: 'The Forsaken Ridge', subtitle: 'Only 2 trees — manage fuel carefully'   },
  { num: 10, name: 'The Second Alpha',   subtitle: 'Boss fight — faster Alpha Wolf'         },
  { num: 11, name: 'The Last Fire',      subtitle: 'Fire drains at 6.5/sec — no margin'    },
  { num: 12, name: 'Ash and Ice',        subtitle: 'Multi-wave hunt through deep zone'      },
  { num: 13, name: 'The Hunger',         subtitle: 'Resource scarcity, 10 survivors'        },
  { num: 14, name: 'Twilight of Ice',    subtitle: 'Beta Wolf guards the first zone'        },
  { num: 15, name: "Winter's End",       subtitle: 'Final boss — Grand Alpha'               },
];

export default class LevelSelectScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LevelSelectScene' });
  }

  create(): void {
    const W = 390; const H = 844; const CX = W / 2;

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0a1a, 0x0a0a1a, 0x0d1a2e, 0x0d1a2e, 1);
    bg.fillRect(0, 0, W, H);

    // Snowflakes (decorative)
    for (let i = 0; i < 28; i++) {
      const x = Phaser.Math.Between(0, W);
      const y = Phaser.Math.Between(0, H);
      const r = Phaser.Math.FloatBetween(1, 3);
      this.add.circle(x, y, r, 0xaaddff, Phaser.Math.FloatBetween(0.1, 0.4));
    }

    // Title
    this.add.text(CX, 72, 'FROSTBORN', {
      fontSize: '38px', fontStyle: 'bold',
      color: '#e8f4ff', stroke: '#1144aa', strokeThickness: 4,
    }).setOrigin(0.5);
    this.add.text(CX, 112, 'Select Level', {
      fontSize: '16px', color: '#7799bb',
    }).setOrigin(0.5);

    // Level cards
    const cardW = 330; const cardH = 90; const startY = 200;
    const gap = 110;

    for (let i = 0; i < LEVELS.length; i++) {
      const lv = LEVELS[i];
      const cy = startY + i * gap;
      const unlocked = isUnlocked(lv.num);
      const completed = isCompleted(lv.num);
      this.drawLevelCard(CX, cy, cardW, cardH, lv.num, lv.name, lv.subtitle, unlocked, completed);
    }

    // Coin display
    this.add.text(CX, H - 70, `Coins: ${getCoins()}`, {
      fontSize: '15px', color: '#ffd700',
    }).setOrigin(0.5);

    // Shop button
    const shopBtn = this.add.text(CX, H - 42, 'Shop', {
      fontSize: '16px', color: '#ffe566', backgroundColor: '#332200',
      padding: { x: 20, y: 8 },
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    shopBtn.on('pointerdown', () => {
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.time.delayedCall(210, () => this.scene.start('ShopScene', { from: 'LevelSelectScene' }));
    });

    // Version / reset hint
    this.add.text(CX, H - 28, 'tap a level to play', {
      fontSize: '12px', color: '#334455',
    }).setOrigin(0.5);
  }

  private drawLevelCard(
    cx: number, cy: number, w: number, h: number,
    num: number, name: string, subtitle: string,
    unlocked: boolean, completed: boolean,
  ): void {
    const x = cx - w / 2;
    const y = cy - h / 2;

    const borderCol = completed ? 0x44bb44 : unlocked ? 0x3366aa : 0x222233;
    const bgCol     = completed ? 0x0a1f0a : unlocked ? 0x0d1428 : 0x0a0a14;
    const textCol   = unlocked ? '#ddeeff' : '#334455';
    const subCol    = unlocked ? '#7799aa' : '#223344';

    // Card background
    const card = this.add.graphics();
    card.fillStyle(bgCol, 1);
    card.fillRoundedRect(x, y, w, h, 10);
    card.lineStyle(2, borderCol, 1);
    card.strokeRoundedRect(x, y, w, h, 10);

    // Level badge
    const badgeCol = completed ? 0x336633 : unlocked ? 0x1a3a66 : 0x1a1a2a;
    card.fillStyle(badgeCol, 1);
    card.fillRoundedRect(x + 10, y + 15, 56, 60, 8);

    this.add.text(x + 38, y + 28, String(num), {
      fontSize: '28px', fontStyle: 'bold', color: unlocked ? '#ffffff' : '#334455',
    }).setOrigin(0.5);
    this.add.text(x + 38, y + 56, 'LVL', {
      fontSize: '10px', color: unlocked ? '#7799bb' : '#223344',
    }).setOrigin(0.5);

    // Name + subtitle
    this.add.text(x + 80, y + 24, name, {
      fontSize: '17px', fontStyle: 'bold', color: textCol,
    });
    this.add.text(x + 80, y + 48, subtitle, {
      fontSize: '12px', color: subCol,
    });

    // Status badge
    if (completed) {
      this.add.text(cx + w / 2 - 14, y + 14, '★', {
        fontSize: '20px', color: '#ffdd44',
      }).setOrigin(1, 0);
    } else if (!unlocked) {
      this.add.text(cx + w / 2 - 14, cy, '🔒', {
        fontSize: '18px',
      }).setOrigin(1, 0.5);
    }

    // Hit area — only if unlocked
    if (unlocked) {
      const hit = this.add.rectangle(cx, cy, w, h, 0xffffff, 0)
        .setInteractive({ useHandCursor: true });

      hit.on('pointerover', () => {
        card.clear();
        card.fillStyle(completed ? 0x0d2a0d : 0x112040, 1);
        card.fillRoundedRect(x, y, w, h, 10);
        card.lineStyle(2, completed ? 0x66ee66 : 0x4488ee, 1);
        card.strokeRoundedRect(x, y, w, h, 10);
        card.fillStyle(badgeCol, 1);
        card.fillRoundedRect(x + 10, y + 15, 56, 60, 8);
      });

      hit.on('pointerout', () => {
        card.clear();
        card.fillStyle(bgCol, 1);
        card.fillRoundedRect(x, y, w, h, 10);
        card.lineStyle(2, borderCol, 1);
        card.strokeRoundedRect(x, y, w, h, 10);
        card.fillStyle(badgeCol, 1);
        card.fillRoundedRect(x + 10, y + 15, 56, 60, 8);
      });

      hit.on('pointerdown', () => {
        this.cameras.main.fadeOut(220, 0, 0, 0);
        this.time.delayedCall(230, () => {
          this.scene.start('GameScene', { levelKey: levelNumToKey(num), levelNum: num });
        });
      });
    }
  }
}

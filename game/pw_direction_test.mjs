/**
 * Drives the player with keyboard in 8 screen directions, screenshots mid-walk.
 * Also takes 3 idle screenshots 300ms apart.
 * Output: pw_out/dir_<name>.png
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 420, height: 860 });

// Load game
await page.goto('http://localhost:5174/', { timeout: 30000 });
// Wait for Phaser canvas + game to init
await page.waitForSelector('canvas', { timeout: 10000 });
await page.waitForTimeout(3000);   // let game fully boot

// Focus canvas with force to bypass any interceptors
await page.locator('canvas').click({ position: { x: 195, y: 430 }, force: true });
await page.waitForTimeout(300);

// 8 screen directions: name, keys held simultaneously
const DIRS = [
  { name: 'E_right',     keys: ['ArrowRight'] },
  { name: 'SE_rightdown',keys: ['ArrowRight', 'ArrowDown'] },
  { name: 'S_down',      keys: ['ArrowDown'] },
  { name: 'SW_leftdown', keys: ['ArrowLeft',  'ArrowDown'] },
  { name: 'W_left',      keys: ['ArrowLeft'] },
  { name: 'NW_leftup',   keys: ['ArrowLeft',  'ArrowUp'] },
  { name: 'N_up',        keys: ['ArrowUp'] },
  { name: 'NE_rightup',  keys: ['ArrowRight', 'ArrowUp'] },
];

for (const d of DIRS) {
  // Press all keys
  for (const k of d.keys) await page.keyboard.down(k);
  // Walk for 600ms, screenshot at 300ms
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/dir_${d.name}.png` });
  console.log(`dir_${d.name}.png`);
  // Release keys
  for (const k of d.keys) await page.keyboard.up(k);
  await page.waitForTimeout(100);
}

// Idle screenshots: 3 × 300ms apart
await page.waitForTimeout(200);
for (let i = 0; i < 3; i++) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/idle_${i}.png` });
  console.log(`idle_${i}.png`);
}

await browser.close();
console.log('Done.');

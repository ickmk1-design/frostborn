/**
 * Zoomed-out screenshot of a worker chopping at tree 1 (iso [11,4]).
 * Walks to survivor, returns to fire, then follows the worker to tree 1.
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
// Wider viewport, lower zoom to fit more of the scene
await page.setViewportSize({ width: 600, height: 860 });

await page.goto('http://localhost:5174/', { timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 10000 });
await page.waitForTimeout(3000);
await page.locator('canvas').click({ position: { x: 295, y: 430 }, force: true });
await page.waitForTimeout(300);

// Walk to survivor
await page.keyboard.down('ArrowLeft');
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(3500);
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowDown');
await page.waitForTimeout(500);

// Return to fire
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(3000);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(500);

// Wait for thaw, then walk right toward tree 1 at iso [11,4] = screen (475, 452)
await page.waitForTimeout(6000);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(2200);
await page.keyboard.up('ArrowRight');

// Wait for worker to chop
await page.waitForTimeout(7000);

// Take 6 screenshots
for (let i = 0; i < 6; i++) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/chop_ingame_${i}.png` });
  console.log(`chop_ingame_${i}.png`);
}

await browser.close();
console.log('Done.');

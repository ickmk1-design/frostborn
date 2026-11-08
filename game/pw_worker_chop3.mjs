/**
 * Parks player at tree 1 (iso [11,4]), waits for worker to chop, dense burst.
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 420, height: 600 });

await page.goto('http://localhost:5174/', { timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 10000 });
await page.waitForTimeout(3000);
await page.locator('canvas').click({ position: { x: 210, y: 300 }, force: true });
await page.waitForTimeout(300);

// Walk to survivor (down-left)
await page.keyboard.down('ArrowLeft');
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(3500);
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowDown');
await page.waitForTimeout(500);

// Escort back to fire (up-right)
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(3000);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(500);

// Wait for thaw, then walk right to park near tree 1 at iso [11,4]
await page.waitForTimeout(5000);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(3000);
await page.keyboard.up('ArrowRight');

// Stay still — wait for worker to reach tree 1 and start chopping
await page.waitForTimeout(8000);

// Dense burst: 20 screenshots at 200ms to catch mid-swing
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/chop3_${i}.png` });
}

await browser.close();
console.log('Done.');

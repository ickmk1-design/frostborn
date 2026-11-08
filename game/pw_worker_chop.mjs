/**
 * Gets a worker chopping: walks to survivor, escorts to fire, waits for worker to reach tree.
 * Takes 8 screenshots 250ms apart to catch mid-chop frames.
 * Output: pw_out/worker_chop_<N>.png
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 420, height: 860 });

await page.goto('http://localhost:5174/', { timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 10000 });
await page.waitForTimeout(3000);
await page.locator('canvas').click({ position: { x: 195, y: 430 }, force: true });
await page.waitForTimeout(300);

// Walk left+down to reach frozen survivors (~320px left, 160px below = ~2.8s at 130px/s diagonal)
await page.keyboard.down('ArrowLeft');
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(3500);
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowDown');
await page.waitForTimeout(500);

// Walk back right+up toward fire to escort the following survivor
await page.keyboard.down('ArrowRight');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(3000);
await page.keyboard.up('ArrowRight');
await page.keyboard.up('ArrowUp');
await page.waitForTimeout(500);

// Wait for survivor to thaw (~3s) + walk to tree 1 + start chopping
await page.waitForTimeout(8000);

// Walk player right toward tree 1 (iso [11,4], screen x=475) so camera follows
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(2500);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(6000); // let worker reach tree and start chopping

// Take 8 screenshots 250ms apart
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/worker_chop_${i}.png` });
  console.log(`worker_chop_${i}.png`);
}

await browser.close();
console.log('Done.');

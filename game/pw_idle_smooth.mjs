/**
 * Captures 30 idle screenshots at 33ms intervals (~1 second total).
 * Lets the player walk briefly so they have a facing direction, then stops.
 * Output: pw_out/smooth_idle_<N>.png
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

// Brief walk to set a facing direction, then stop
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(400);
await page.keyboard.up('ArrowRight');
// Wait for full stop (hysteresis passes)
await page.waitForTimeout(300);

// Capture 30 frames at 33ms intervals
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(33);
  await page.screenshot({ path: `${OUT}/smooth_idle_${String(i).padStart(2,'0')}.png` });
}

await browser.close();
console.log('Done. 30 idle frames captured.');

import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto('http://localhost:5174/debug.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000); // let canvases render

// Screenshot each character+anim section
const chars = ['hero', 'worker'];
const anims = ['walk', 'idle', 'chop', 'carry_walk', 'cheer'];

for (const ch of chars) {
  for (const anim of anims) {
    // Find the h3 for this anim within its character section
    const h3s = await page.locator('h3').all();
    let found = null;
    for (const h3 of h3s) {
      const txt = await h3.textContent();
      if (txt?.trim() === anim) {
        // Check it's in the right char section by checking preceding h2
        found = h3;
      }
    }
    // Just scroll to the right section and screenshot the next ~8 rows
    // Simpler: screenshot full page in parts
  }
}

// Full page screenshot
await page.screenshot({ path: `${OUT}/debug_full.png`, fullPage: true });
console.log('Full debug page screenshot saved.');

await browser.close();

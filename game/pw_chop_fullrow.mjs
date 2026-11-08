import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1800, height: 1200 });

await page.goto('http://localhost:5174/chop_test.html', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);

const bodyH = await page.evaluate(() => document.body.scrollHeight);
await page.setViewportSize({ width: 1800, height: Math.min(bodyH + 20, 2400) });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/chop_full_alldir.png`, fullPage: true });
console.log('Done');
await browser.close();

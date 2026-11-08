/**
 * Screenshots the chop animation section from debug.html for both characters.
 * Shows all 8 direction rows side-by-side so we can check axe visibility.
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 1200 });

await page.goto('http://localhost:5174/debug.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

// Find and screenshot the chop section for worker
const sections = await page.evaluate(() => {
  const results = [];
  let curChar = '';
  for (const el of document.querySelectorAll('h2, h3')) {
    if (el.tagName === 'H2') curChar = el.textContent.trim();
    if (el.tagName === 'H3' && el.textContent.trim() === 'chop') {
      const rows = [];
      let sib = el.nextElementSibling;
      while (sib && !['H2','H3','HR'].includes(sib.tagName)) {
        const b = sib.getBoundingClientRect();
        rows.push({ top: b.top + window.scrollY, bottom: b.bottom + window.scrollY });
        sib = sib.nextElementSibling;
      }
      if (rows.length === 0) continue;
      const hb = el.getBoundingClientRect();
      results.push({
        char: curChar,
        top: hb.top + window.scrollY,
        bottom: rows[rows.length-1].bottom + window.scrollY,
      });
    }
  }
  return results;
});

for (const sec of sections) {
  await page.evaluate((top) => window.scrollTo(0, top - 10), sec.top);
  await page.waitForTimeout(100);
  const height = Math.min(sec.bottom - sec.top + 20, 1200);
  const fname = `${OUT}/chop_debug_${sec.char.replace(/\s+/g,'_')}.png`;
  await page.screenshot({ path: fname, clip: { x: 0, y: 0, width: 1400, height } });
  console.log(`Saved ${fname}`);
}

await browser.close();

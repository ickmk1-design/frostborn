import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1600, height: 2000 });

await page.goto('http://localhost:5174/debug.html', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// Screenshot each h2+h3 section separately
const sections = await page.evaluate(() => {
  const result = [];
  let curChar = '';
  for (const el of document.querySelectorAll('h2, h3')) {
    if (el.tagName === 'H2') { curChar = el.textContent.trim(); }
    if (el.tagName === 'H3') {
      const anim = el.textContent.trim();
      // Get bounding box of the h3 + all following dir-rows until next h3/h2
      const rows = [];
      let sib = el.nextElementSibling;
      while (sib && !['H2','H3','HR'].includes(sib.tagName)) {
        const box = sib.getBoundingClientRect();
        rows.push({ top: box.top, bottom: box.bottom });
        sib = sib.nextElementSibling;
      }
      if (rows.length === 0) return result;
      const h3box = el.getBoundingClientRect();
      const top = h3box.top + window.scrollY;
      const bottom = rows[rows.length-1].bottom + window.scrollY;
      result.push({ char: curChar, anim, top, bottom, height: bottom - top });
    }
  }
  return result;
});

for (const sec of sections) {
  // Take a clip screenshot of just this section
  await page.evaluate((top) => window.scrollTo(0, top - 10), sec.top);
  await page.waitForTimeout(100);
  const clip = {
    x: 0,
    y: 0,
    width: 1600,
    height: Math.min(sec.height + 20, 2000),
  };
  const fname = `${OUT}/debug_${sec.char}_${sec.anim}.png`;
  await page.screenshot({ path: fname, clip, fullPage: false });
  console.log(`Saved ${fname} (height ${Math.round(sec.height)}px)`);
}

await browser.close();

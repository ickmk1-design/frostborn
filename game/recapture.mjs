import { chromium } from 'playwright';
import sharp from 'sharp';
import path from 'path';

const OUT_DIR = 'C:/Users/ickmk/Frostborn/store_assets';
const BASE = 'https://cytbilisim.com/frostborn/game/';
const PORTRAIT_W = 393, PORTRAIT_H = 852;
const DPR = 3;
const IPAD_W = 2064, IPAD_H = 2752;

async function openGame(browser, level) {
  const ctx = await browser.newContext({
    viewport: { width: PORTRAIT_W, height: PORTRAIT_H },
    deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?level=${level}&noaudio=1`, { waitUntil: 'load' });
  await page.waitForTimeout(8000);
  return { ctx, page };
}

async function resize(src, dstPath, w, h) {
  await sharp(src).resize(w, h, { fit: 'cover', position: 'centre' }).png().toFile(dstPath);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [idx, level, wait] of [[2, 5, 10000], [3, 6, 20000], [4, 8, 25000]]) {
      const { ctx, page } = await openGame(browser, level);
      await page.waitForTimeout(wait);
      const buf = await page.screenshot();
      await resize(buf, path.join(OUT_DIR, `ipad_13/ipad_${idx}.png`), IPAD_W, IPAD_H);
      await ctx.close();
      console.log(`ipad_${idx} done (level ${level})`);
    }
    // iPad 5: menu
    const ctx = await browser.newContext({
      viewport: { width: PORTRAIT_W, height: PORTRAIT_H },
      deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}?noaudio=1`, { waitUntil: 'load' });
    await page.waitForTimeout(8000);
    const buf = await page.screenshot();
    await resize(buf, path.join(OUT_DIR, `ipad_13/ipad_5.png`), IPAD_W, IPAD_H);
    await ctx.close();
    console.log('ipad_5 done');
  } finally { await browser.close(); }
})();

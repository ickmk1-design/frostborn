import { chromium } from 'playwright';

const BASE = 'https://cytbilisim.com/frostborn/game/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') console.log('[cons]', m.type(), m.text().slice(0, 300));
  });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${BASE}?level=7&noaudio=1`, { waitUntil: 'load' });
  console.log('page loaded');
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      const sc = g?.scene?.getScene?.('GameScene');
      const scenes = g?.scene?.scenes?.map(s => `${s.sys?.settings?.key}:${s.sys?.settings?.active?'A':'-'}${s.sys?.settings?.visible?'V':'-'}`) ?? [];
      return {
        scenes,
        stationsCount: sc?.stations?.length ?? -1,
        planksProduced: sc?.planksProduced ?? -1,
        coins: sc?.coins ?? -1,
        canvas: !!document.querySelector('canvas'),
        canvasW: document.querySelector('canvas')?.width,
        canvasH: document.querySelector('canvas')?.height,
        splashGone: !document.getElementById('splash'),
        progress: sc?.load?.progress ?? -1,
        totalComplete: sc?.load?.totalComplete ?? -1,
        totalFailed: sc?.load?.totalFailed ?? -1,
      };
    });
    console.log(`t=${i*5}s`, JSON.stringify(s));
    if (s.stationsCount > 0) break;
    await page.waitForTimeout(5000);
  }
  // Take screenshot now
  await page.screenshot({ path: 'C:/Users/ickmk/Frostborn/store_assets/review/diag_L7.png' });
  console.log('screenshot taken');
  await browser.close();
})();

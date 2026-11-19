import { chromium } from 'playwright';

const BASE = 'https://cytbilisim.com/frostborn/game/';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning') {
      const t = m.text();
      if (!t.includes('GPU stall') && !t.includes('GL Driver')) console.log('[cons]', m.type(), t.slice(0, 200));
    }
  });
  await page.goto(`${BASE}?level=7&noaudio=1`, { waitUntil: 'load' });
  console.log('page loaded');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      const g = window.__game;
      const sc = g?.scene?.getScene?.('GameScene');
      return { progress: sc?.load?.progress ?? -1, totalComplete: sc?.load?.totalComplete ?? -1, stations: sc?.stations?.length ?? -1 };
    });
    console.log(`t=${i*5}s progress=${s.progress.toFixed(3)} done=${s.totalComplete} stations=${s.stations}`);
    if (s.stations > 0) break;
  }
  await browser.close();
})();

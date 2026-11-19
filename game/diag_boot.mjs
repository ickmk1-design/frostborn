import { chromium } from 'playwright';

const BASE = 'https://cytbilisim.com/frostborn/game/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('console', m => console.log('[cons]', m.type(), m.text()));
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`${BASE}?level=7&noaudio=1`, { waitUntil: 'load' });
  console.log('page loaded');
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => {
      const g = window.__game;
      const sc = g?.scene?.getScene?.('GameScene');
      const scenes = g?.scene?.scenes?.map(s => `${s.sys?.settings?.key}:${s.sys?.settings?.active?'A':'-'}${s.sys?.settings?.visible?'V':'-'}`) ?? [];
      return {
        hasGame: !!g,
        hasScene: !!sc,
        scenes,
        cfg: sc?.cfg ? Object.keys(sc.cfg).slice(0, 10) : null,
        stationsCount: sc?.stations?.length ?? -1,
        planksProduced: sc?.planksProduced ?? -1,
        coins: sc?.coins ?? -1,
        canvas: !!document.querySelector('canvas'),
        splashHidden: !!document.getElementById('splash')?.classList?.contains('hidden'),
        splashGone: !document.getElementById('splash'),
      };
    });
    console.log(`t=${i*2}s`, JSON.stringify(s));
    await page.waitForTimeout(2000);
    if (s.stationsCount >= 0 && s.hasScene) break;
  }
  await browser.close();
})();

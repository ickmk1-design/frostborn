import { chromium } from 'playwright';

const BASE = 'https://cytbilisim.com/frostborn/game/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  });
  const page = await ctx.newPage();
  const pending = new Map();
  page.on('request', req => { pending.set(req.url(), Date.now()); });
  page.on('response', resp => { pending.delete(resp.url()); });
  page.on('requestfailed', req => { console.log('FAIL', req.url(), req.failure()?.errorText); pending.delete(req.url()); });
  await page.goto(`${BASE}?level=7&noaudio=1`, { waitUntil: 'load' });
  console.log('page loaded');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      const g = window.__game;
      const sc = g?.scene?.getScene?.('GameScene');
      return { progress: sc?.load?.progress ?? -1, totalComplete: sc?.load?.totalComplete ?? -1 };
    });
    const old = [...pending.entries()].filter(([_, t]) => Date.now() - t > 10000);
    console.log(`t=${i*5}s progress=${s.progress.toFixed(3)} done=${s.totalComplete} inflight=${pending.size} old=${old.length}`);
    if (old.length > 0) {
      for (const [url, t] of old.slice(0, 10)) console.log(`   STALE ${((Date.now() - t)/1000).toFixed(0)}s ago: ${url}`);
    }
    if (s.progress > 0.99) break;
  }
  await browser.close();
})();

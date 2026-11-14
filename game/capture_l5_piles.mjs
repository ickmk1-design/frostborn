// Visual check: do L5 stations grow piles + do workers carry items while hauling?
import { webkit } from 'playwright';
import { setTimeout as sleep } from 'timers/promises';

const browser = await webkit.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();

await page.goto('http://localhost:5177/?noaudio=1', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('canvas', { timeout: 15000 });
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const ok = await page.evaluate(() => !!window.__game);
  if (ok) break;
}
await sleep(2000);

// Launch L5 directly (has ice_hole + cleaning + cook + full chain)
await page.evaluate(() => {
  const g = window.__game;
  ['GameScene','UIScene','MainMenuScene','LevelSelectScene','SettingsScene','WinScene','LoseScene','ShopScene']
    .forEach(k => { try { g.scene.stop(k); } catch (e) {} });
  g.scene.start('GameScene', { levelKey: 'level05', levelNum: 5 });
});
await sleep(2500);

// Drive hero south to thaw survivors (so workers unlock + go to stations)
for (let t = 0; t < 10; t++) {
  await page.mouse.move(196, 700);
  await page.mouse.down();
  await page.mouse.move(196, 755, { steps: 2 });
  await page.waitForTimeout(600);
  await page.mouse.up();
  await page.waitForTimeout(300);
}

// Let workers spin up stations for 25s
for (let t = 0; t < 25; t += 5) {
  await sleep(5000);
  const snap = await page.evaluate(() => {
    const gs = window.__game.scene.getScene('GameScene');
    const pileCounts = gs.stations.map(s => ({
      kind: s.cfg.kind,
      output: s.outputCount,
      input: s.inputCount,
      visibleOut: s.pileSprites.length,
      visibleIn: s.inputPileSprites.length,
    }));
    const carrying = gs.survivors
      .filter(s => s.state === 'worker')
      .map(s => ({
        ws: s.workerState,
        haul: s.workerHaulId,
        carry: !!s.carrySprite,
      }));
    const workers = gs.survivors.filter(s => s.state === 'worker').length;
    return { pileCounts, carrying, workers };
  });
  console.log(`t=${t+5}s workers=${snap.workers} stations=${JSON.stringify(snap.pileCounts)} carry=${JSON.stringify(snap.carrying)}`);
}

// Final screenshot
await page.screenshot({ path: 'screenshot-l5-piles.png', fullPage: false });
console.log('wrote screenshot-l5-piles.png');
await browser.close();

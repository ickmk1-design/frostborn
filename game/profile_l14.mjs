// L14 object-count profile. Logs sprite / tween / emitter counts every 5s
// for 60s. Flags any count that grows monotonically — that's the leak.
import { webkit } from 'playwright';
import { setTimeout as sleep } from 'timers/promises';

const BASE = 'http://localhost:5177';
const W = 393, H = 852;

const browser = await webkit.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 160)); });

await page.goto(`${BASE}/?noaudio=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 15000 });
// Start L14 directly
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const ok = await page.evaluate(() => !!window.__game && window.__game.scene.scenes.some(s => s.sys.isActive()));
  if (ok) break;
}
await page.evaluate(() => {
  const g = window.__game;
  ['BootScene','MainMenuScene','SettingsScene','LevelSelectScene','GameScene','UIScene','WinScene','LoseScene','ShopScene']
    .forEach(k => { try { g.scene.stop(k); } catch(e){} });
  g.scene.start('GameScene', { levelKey: 'level14', levelNum: 14 });
});
await sleep(2000);

console.log('time,fps,gameObjects,tweens,activeAnim,animals,aliveAnimals,sprites,images,particles,texts,workers,fleeingWorkers,playerCarrySpriteExists');
for (let t = 0; t <= 60; t += 5) {
  const s = await page.evaluate(() => {
    const g = window.__game; if (!g) return null;
    const gs = g.scene.getScene('GameScene');
    if (!gs) return null;
    const list = gs.children.list;
    const tweens = gs.tweens.getTweens();
    const emitters = list.filter(o => o.constructor.name.includes('Particle'));
    const sprites = list.filter(o => o.constructor.name === 'Sprite');
    const images = list.filter(o => o.constructor.name === 'Image');
    const texts = list.filter(o => o.constructor.name === 'Text');
    const animals = gs.animals || [];
    const aliveAnimals = animals.filter(a => a.state !== 'dead').length;
    const survivors = gs.survivors || [];
    const workers = survivors.filter(sv => sv.state === 'worker').length;
    const fleeing = survivors.filter(sv => sv.workerState === 'fleeing').length;
    const carrySprites = survivors.filter(sv => !!sv.carrySprite).length;
    return {
      fps: Math.round(g.loop.actualFps),
      total: list.length,
      tweens: tweens.length,
      sprites: sprites.length,
      images: images.length,
      emitters: emitters.length,
      texts: texts.length,
      animals: animals.length,
      aliveAnimals,
      workers,
      fleeing,
      carry: carrySprites,
    };
  });
  if (!s) { console.log(`${t},null`); break; }
  console.log(`${t},${s.fps},${s.total},${s.tweens},—,${s.animals},${s.aliveAnimals},${s.sprites},${s.images},${s.emitters},${s.texts},${s.workers},${s.fleeing},${s.carry}`);
  await sleep(5000);
}
await browser.close();

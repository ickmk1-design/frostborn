// Scene-transition leak probe — load L1..L8 back-to-back via scene.start on
// ONE Phaser game instance (no page reload). After each level, log counts.
// If any count grows monotonically across levels, scene shutdown is leaking.
import { webkit } from 'playwright';
import { setTimeout as sleep } from 'timers/promises';

const BASE = 'http://localhost:5177';
const PLAY_MS = 25000; // 25 s gameplay per level — enough for workers to spawn, wolves to aggro

const browser = await webkit.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('[err]', m.text().slice(0, 160)); });

await page.goto(`${BASE}/?noaudio=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 15000 });
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const ok = await page.evaluate(() => !!window.__game);
  if (ok) break;
}
await sleep(2000);

async function stats(label) {
  return page.evaluate((lbl) => {
    const g = window.__game;
    if (!g) return null;
    const gs = g.scene.getScene('GameScene');
    const listAll = g.scene.scenes.reduce((n, s) => n + s.children.list.length, 0);
    const gsList = gs ? gs.children.list.length : 0;
    const uis = g.scene.getScene('UIScene');
    const uiList = uis ? uis.children.list.length : 0;
    const tweens = g.scene.scenes.reduce((n, s) => n + s.tweens.getTweens().length, 0);
    const timers = g.scene.scenes.reduce((n, s) => {
      const ev = s.time.getAllEvents ? s.time.getAllEvents() : [];
      return n + ev.length;
    }, 0);
    const textures = g.textures.list ? Object.keys(g.textures.list).length : 0;
    const anims = g.anims.anims ? g.anims.anims.size : 0;
    const activeScenes = g.scene.scenes.filter(s => s.sys.isActive()).map(s => s.sys.settings.key).join(',');
    const heap = performance?.memory?.usedJSHeapSize ?? 0;
    const particles = g.scene.scenes.reduce((n, s) => n + s.children.list.filter(o => o.constructor.name.includes('Particle')).length, 0);
    const sprites = g.scene.scenes.reduce((n, s) => n + s.children.list.filter(o => o.constructor.name === 'Sprite').length, 0);
    const images = g.scene.scenes.reduce((n, s) => n + s.children.list.filter(o => o.constructor.name === 'Image').length, 0);
    const texts = g.scene.scenes.reduce((n, s) => n + s.children.list.filter(o => o.constructor.name === 'Text').length, 0);
    return { lbl, gsList, uiList, listAll, tweens, timers, textures, anims, activeScenes, heap, particles, sprites, images, texts };
  }, label);
}

console.log('level,fps,gsObjs,uiObjs,totalObjs,sprites,images,texts,particles,tweens,timers,textures,anims,heapMB,activeScenes');
for (let n = 1; n <= 8; n++) {
  const key = `level${String(n).padStart(2,'0')}`;
  await page.evaluate(({ k, num }) => {
    const g = window.__game;
    // Clean scene transition: stop all gameplay scenes, then start GameScene with level
    ['GameScene','UIScene','WinScene','LoseScene','ShopScene','MainMenuScene','LevelSelectScene','SettingsScene','EndlessScene','ChapterTeaserScene']
      .forEach(x => { try { g.scene.stop(x); } catch(e){} });
    g.scene.start('GameScene', { levelKey: k, levelNum: num });
  }, { k: key, num: n });
  await sleep(1500); // let scene boot
  // Wiggle joystick to simulate player input (triggers wolf aggro, workers)
  const jX = 196, jY = 700, r = 55;
  for (let t = 0; t < PLAY_MS / 500; t++) {
    const ang = (t * 23 + n * 7) % 360 * Math.PI / 180;
    const ex = jX + Math.cos(ang) * r;
    const ey = jY + Math.sin(ang) * r;
    await page.mouse.move(jX, jY);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 2 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
  const s = await stats(key);
  const fps = await page.evaluate(() => Math.round(window.__game.loop.actualFps));
  if (!s) { console.log(`${key},null`); continue; }
  console.log(`${key},${fps},${s.gsList},${s.uiList},${s.listAll},${s.sprites},${s.images},${s.texts},${s.particles},${s.tweens},${s.timers},${s.textures},${s.anims},${(s.heap/1048576).toFixed(1)},${s.activeScenes}`);
}
await browser.close();

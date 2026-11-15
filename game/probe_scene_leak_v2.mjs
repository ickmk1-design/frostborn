// Enhanced scene-transition leak probe — Chromium so performance.memory works.
// Plays L1→L8 back-to-back via scene.start (NO page reload).
// After each level logs: game objects, textures, tweens, timers, listeners, JS heap.
import { chromium } from 'playwright';
import { setTimeout as sleep } from 'timers/promises';

const BASE = 'http://localhost:5177';
const PLAY_MS = 25000;

const browser = await chromium.launch({ headless: true });
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

async function stats() {
  return page.evaluate(() => {
    const g = window.__game;
    const scenes = g.scene.scenes;
    const gsList = scenes.reduce((n, s) => n + s.children.list.length, 0);
    const tweens = scenes.reduce((n, s) => n + s.tweens.getTweens().length, 0);
    const timers = scenes.reduce((n, s) => {
      const t = s.time; let c = 0;
      if (t && t._pendingRemoval) c += t._pendingRemoval.length;
      if (t && t._active) c += t._active.length;
      if (!c && t && Array.isArray(t.getAllEvents ? t.getAllEvents() : null)) c = t.getAllEvents().length;
      return n + c;
    }, 0);
    const textures = g.textures.list ? Object.keys(g.textures.list).length : 0;
    const anims = g.anims.anims ? g.anims.anims.size : 0;
    // Event listener count — walk all GameObjects and sum _eventsCount
    let listeners = 0;
    for (const s of scenes) {
      for (const obj of s.children.list) {
        if (obj._eventsCount) listeners += obj._eventsCount;
      }
      // scene input event emitter + scene events emitter
      if (s.input && s.input._eventsCount) listeners += s.input._eventsCount;
      if (s.events && s.events._eventsCount) listeners += s.events._eventsCount;
    }
    const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
    return { gsList, tweens, timers, textures, anims, listeners, heap };
  });
}

const rows = [];
console.log('level,fps,gameObjects,textures,tweens,timers,listeners,heapMB');
for (let n = 1; n <= 8; n++) {
  const key = `level${String(n).padStart(2,'0')}`;
  await page.evaluate(({ k, num }) => {
    const g = window.__game;
    ['GameScene','UIScene','WinScene','LoseScene','ShopScene','MainMenuScene','LevelSelectScene','SettingsScene','EndlessScene','ChapterTeaserScene']
      .forEach(x => { try { g.scene.stop(x); } catch(e){} });
    g.scene.start('GameScene', { levelKey: k, levelNum: num });
  }, { k: key, num: n });
  await sleep(1500);

  // Drive gameplay: random joystick drags
  const jX = 196, jY = 700, r = 55;
  const until = Date.now() + PLAY_MS;
  while (Date.now() < until) {
    const ang = (Math.random() * 360) * Math.PI / 180;
    const ex = jX + Math.cos(ang) * r;
    const ey = jY + Math.sin(ang) * r;
    await page.mouse.move(jX, jY);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 2 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(80);
  }

  const s = await stats();
  const fps = await page.evaluate(() => Math.round(window.__game.loop.actualFps));
  rows.push({ level: key, fps, ...s });
  console.log(`${key},${fps},${s.gsList},${s.textures},${s.tweens},${s.timers},${s.listeners},${(s.heap/1048576).toFixed(1)}`);
}
console.log('---');
console.log('DELTAS L1→L8:');
const first = rows[0], last = rows[rows.length - 1];
for (const k of ['gsList','textures','tweens','timers','listeners','heap']) {
  const d = last[k] - first[k];
  const unit = k === 'heap' ? ' bytes' : '';
  console.log(` ${k}: ${first[k]} → ${last[k]} (Δ ${d > 0 ? '+' : ''}${d}${unit})`);
}
await browser.close();

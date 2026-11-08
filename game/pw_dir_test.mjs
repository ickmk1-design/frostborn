/**
 * Part 1: 8 direction drag shots for the player (420×860).
 * Part 2: worker walking to tree 1 (E) and back to fire (W).
 *   Player parked at midpoint between fire and tree 1 so worker stays in frame.
 *   48 shots × 280ms ≈ 13.4s covers 1+ full worker cycles (~9.3s each).
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out/dir_test';
await mkdir(OUT, { recursive: true });

async function launch() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 420, height: 860 });
  await page.goto('http://localhost:5174/', { timeout: 30000 });
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.locator('canvas').click({ position: { x: 210, y: 430 }, force: true });
  await page.waitForTimeout(200);
  return { browser, page };
}

async function drag(page, cx, cy, dx, dy, ms) {
  const steps = Math.max(4, Math.ceil(ms / 16));
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + dx, cy + dy, { steps });
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(80);
}

// ── Part 1: 8 direction shots ─────────────────────────────────────────────────
{
  const { browser, page } = await launch();
  const OX = 210; const OY = 620; const R = 80;
  const DIRS = [
    { name: 'E',  dx:  R, dy:  0 },
    { name: 'SE', dx:  R, dy:  R },
    { name: 'S',  dx:  0, dy:  R },
    { name: 'SW', dx: -R, dy:  R },
    { name: 'W',  dx: -R, dy:  0 },
    { name: 'NW', dx: -R, dy: -R },
    { name: 'N',  dx:  0, dy: -R },
    { name: 'NE', dx:  R, dy: -R },
  ];
  for (const { name, dx, dy } of DIRS) {
    await drag(page, OX, OY, dx, dy, 500);
    await page.screenshot({ path: `${OUT}/player_${name}.png` });
    await page.waitForTimeout(150);
  }
  await browser.close();
  console.log('Part 1: 8 direction shots done.');
}

// ── Part 2: worker walk shots ─────────────────────────────────────────────────
// Fire iso [8,7] = screen (235, 452).  Tree 1 iso [11,4] = screen (475, 452).
// Player start iso [8,6] = screen (275, 432).
// Walk E 0.8s → player ≈ screen (379, 432), midpoint. Camera centers there.
// Camera zoom 1.25 → shows ±(390/1.25/2)=±156px → world x [223, 535]. Both in view.
{
  const { browser, page } = await launch();
  const OX = 210; const OY = 620; const R = 80;

  // Escort survivor: walk SW then NE back to fire
  await drag(page, OX, OY, -R,  R, 3500);
  await drag(page, OX, OY,  R, -R, 3200);

  // Wait for thaw (3s) with a tiny margin
  await page.waitForTimeout(4000);

  // Walk E just enough to park between fire and tree 1
  await drag(page, OX, OY, R, 0, 800);

  // Hold still — worker walks E (to tree) then W (to fire) then repeat
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(280);
    await page.screenshot({ path: `${OUT}/worker_walk_${String(i).padStart(2,'0')}.png` });
  }

  await browser.close();
  console.log('Part 2: worker walk shots done.');
}

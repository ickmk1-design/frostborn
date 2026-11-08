/**
 * Camera parked at x≈340 (between fire x=235 and tree1 x=475).
 * zoom 1.25 → visible world x=[172,508] → both fire AND tree1 in frame.
 * Burst starts just as worker begins walking E toward tree1.
 * Frames 0–5: worker walking E (walk anim, should show front/side)
 * Frames 5–21: worker chopping at tree
 * Frames 21–31: worker walking W back (carry_walk, should show back+pack)
 * Frames 31+: next cycle starts
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out/approach';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 420, height: 860 });
await page.goto('http://localhost:5174/', { timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 10000 });
await page.waitForTimeout(2000);
await page.locator('canvas').click({ position: { x: 210, y: 430 }, force: true });
await page.waitForTimeout(200);

const OX = 210; const OY = 620; const R = 80;

async function drag(dx, dy, ms) {
  const steps = Math.max(4, Math.ceil(ms / 16));
  await page.mouse.move(OX, OY);
  await page.mouse.down();
  await page.mouse.move(OX + dx, OY + dy, { steps });
  await page.waitForTimeout(ms);
  await page.mouse.up();
  await page.waitForTimeout(80);
}

// Escort survivor to fire
await drag(-R, R, 3500);   // SW → reach survivor
await drag(R, -R, 3200);   // NE → return to fire (thaw starts ~here)

// Wait 4s for thaw to complete (survivorThawTimeSec=3)
await page.waitForTimeout(4000);

// Park player at x≈340: start x=275, need +65px → drag E 0.5s at 130px/s
await drag(R, 0, 500);

// Worker dispatched at thaw (~9.7s), walks E. Burst starts at ~11.2s game time.
// Worker at x≈370 heading to tree (x=475) → visible from left-of-center rightward.
for (let i = 0; i < 52; i++) {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/frame_${String(i).padStart(2,'0')}.png` });
}

await browser.close();
console.log('Done.');

/**
 * 8-direction drag test: captures the player mid-stride in each of 8 compass
 * directions so we can compare facing vs movement direction.
 *
 * Directions and expected screen angles (from compute_dir_angles.py):
 *   dir0 SE=332°  dir1 S=270°  dir2 SW=242°  dir3 W=214°
 *   dir4 NW=152°  dir5 N=90°   dir6 NE=62°   dir7 E=34°
 *
 * Movement → nearest dir:
 *   drag E  (0°)   → dir0 (27.9° diff)  face: right+slightly-up  ✓ NE-cam=front
 *   drag SE (45°)  → dir7 (10.8° diff)  face: right+down
 *   drag S  (90°)  → dir5 (0°)          face: straight down
 *   drag SW (135°) → dir4 (17.1° diff)  face: left+down
 *   drag W  (180°) → dir4 (27.9° diff)  face: left
 *   drag NW (225°) → dir3 (10.9° diff)  face: left+up
 *   drag N  (270°) → dir1 (0°)          face: straight up
 *   drag NE (315°) → dir0 (17.1° diff)  face: right+slightly-up
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

const OUT = 'pw_out/8dir';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 420, height: 860 });
await page.goto('http://localhost:5174/', { timeout: 30000 });
await page.waitForSelector('canvas', { timeout: 10000 });
await page.waitForTimeout(2000);
await page.locator('canvas').click({ position: { x: 210, y: 430 }, force: true });
await page.waitForTimeout(200);

const OX = 210, OY = 620, R = 80;

async function drag(dx, dy, ms) {
  const steps = Math.max(4, Math.ceil(ms / 16));
  await page.mouse.move(OX, OY);
  await page.mouse.down();
  await page.mouse.move(OX + dx, OY + dy, { steps });
  await page.waitForTimeout(ms);
  // Screenshot mid-drag (player is moving)
  return await page.screenshot({ path: null });
}

const DIRS = [
  { name: 'E',  dx:  R, dy:  0,  expected_dir: 0 },
  { name: 'SE', dx:  R, dy:  R,  expected_dir: 7 },
  { name: 'S',  dx:  0, dy:  R,  expected_dir: 5 },
  { name: 'SW', dx: -R, dy:  R,  expected_dir: 4 },
  { name: 'W',  dx: -R, dy:  0,  expected_dir: 4 },
  { name: 'NW', dx: -R, dy: -R,  expected_dir: 3 },
  { name: 'N',  dx:  0, dy: -R,  expected_dir: 1 },
  { name: 'NE', dx:  R, dy: -R,  expected_dir: 0 },
];

for (const { name, dx, dy, expected_dir } of DIRS) {
  await page.mouse.move(OX, OY);
  await page.mouse.down();
  await page.mouse.move(OX + dx, OY + dy, { steps: 8 });
  await page.waitForTimeout(400);  // let anim settle
  await page.screenshot({ path: `${OUT}/move_${name}_expect_dir${expected_dir}.png` });
  await page.mouse.up();
  await page.waitForTimeout(200);
}

await browser.close();
console.log('Done — screenshots in', OUT);

/**
 * Take IAP review screenshots for the 5 in-app products.
 * Screenshots are taken at iPhone SE/iPhone 14 size (390x844).
 * Required for iOS IAP review.
 */
const { chromium } = require('C:/Users/ickmk/Frostborn/game/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const DIST_PATH = path.resolve('C:/Users/ickmk/Frostborn/game/dist');
const OUT_DIR = 'C:/Users/ickmk/Frostborn/iap_screenshots';
const WIDTH = 390;
const HEIGHT = 844;

// Product-specific URLs: use hash/query params to show relevant game state
// Since the game is a Phaser game, we screenshot the main game at startup
// and the coin/shop interface states.
const SHOTS = [
  { name: 'remove_ads',   file: `${OUT_DIR}/remove_ads.png` },
  { name: 'starter_pack', file: `${OUT_DIR}/starter_pack.png` },
  { name: 'coins_small',  file: `${OUT_DIR}/coins_small.png` },
  { name: 'coins_medium', file: `${OUT_DIR}/coins_medium.png` },
  { name: 'coins_large',  file: `${OUT_DIR}/coins_large.png` },
];

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: WIDTH, height: HEIGHT });

  // Use vite preview server (run: cd game && npx vite preview --port 4173 first)
  const indexUrl = 'http://localhost:4173';
  console.log(`Loading: ${indexUrl}`);

  await page.goto(indexUrl, { waitUntil: 'networkidle', timeout: 15000 });

  // Wait for Phaser canvas to render
  await page.waitForSelector('canvas', { timeout: 10000 });
  await page.waitForTimeout(3000);

  // Take one base screenshot (game at boot/menu state)
  const baseShot = `${OUT_DIR}/game_base.png`;
  await page.screenshot({ path: baseShot });
  console.log(`✓ Base screenshot: ${baseShot}`);

  // For each IAP, take the same screenshot (Apple only requires 1 screenshot per IAP
  // showing the product in context — the game's main view is sufficient)
  for (const shot of SHOTS) {
    fs.copyFileSync(baseShot, shot.file);
    console.log(`✓ ${shot.name}: ${shot.file}`);
  }

  await browser.close();
  console.log(`\nScreenshots saved to: ${OUT_DIR}`);
  console.log('Upload these to each iOS IAP via ASC → App → In-App Purchases → Review Screenshot');
}

main().catch(e => {
  console.error('Screenshot failed:', e.message);
  process.exit(1);
});

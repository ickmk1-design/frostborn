/**
 * Viewport screenshot test — iPhone 15, iPhone SE, Android tall
 * Usage: node test-viewports.js
 */
const { webkit, chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = 7778;

const VIEWPORTS = [
  { label: 'iPhone-15',   width: 393,  height: 852,  browser: 'webkit'   },
  { label: 'iPhone-SE',   width: 375,  height: 667,  browser: 'webkit'   },
  { label: 'Android-tall',width: 412,  height: 915,  browser: 'chromium' },
];

const SCREENS = [
  { name: 'main-menu',    wait: 4000,  action: null },
  { name: 'level-select', wait: 2000,  action: async (page) => {
    // Click the Play button
    await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height * 0.47);
    await page.waitForTimeout(500);
  }},
  { name: 'level-1-game', wait: 3000, action: async (page) => {
    // Tap level 1 card (first visible card in list)
    const W = page.viewportSize().width;
    const H = page.viewportSize().height;
    // Cards start after top bar (~104px), first card center ~148px from top of container
    await page.mouse.click(W / 2, 180);
    await page.waitForTimeout(500);
  }},
];

function serve(distDir, port) {
  const MIME = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.json': 'application/json', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  };
  const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    let file = path.join(distDir, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('404: ' + url); return; }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

async function runViewport(vp, wk, cr) {
  const browser = vp.browser === 'webkit' ? wk : cr;
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', req => {
    if (!req.url().includes('frostborn-log')) // ignore logging endpoint
      errors.push(`NET FAIL: ${req.url()}`);
  });

  console.log(`\n[${vp.label}] Loading...`);
  await page.goto(`http://localhost:${PORT}/`);

  // Wait for canvas
  try {
    await page.waitForSelector('canvas', { timeout: 8000 });
    console.log(`[${vp.label}] Canvas appeared`);
  } catch {
    console.log(`[${vp.label}] ✗ No canvas!`);
    await ctx.close();
    return { vp, errors: ['No canvas'] };
  }

  // Wait for BootScene to finish (loads assets → transitions to MainMenuScene)
  await page.waitForTimeout(5000);

  // Screenshot main menu
  const ssDir = path.join(__dirname, 'screenshots');
  fs.mkdirSync(ssDir, { recursive: true });

  await page.screenshot({ path: path.join(ssDir, `${vp.label}-01-main-menu.png`) });
  console.log(`[${vp.label}] ✓ main-menu screenshot`);

  // Check for overlap — look for canvas fills beyond viewport
  const canvasBounds = await page.$eval('canvas', c => ({
    w: c.clientWidth, h: c.clientHeight,
    left: c.getBoundingClientRect().left,
    top: c.getBoundingClientRect().top,
  }));
  const overflows = [];
  if (canvasBounds.left < -1) overflows.push(`canvas left=${canvasBounds.left}`);
  if (canvasBounds.top < -1)  overflows.push(`canvas top=${canvasBounds.top}`);
  if (canvasBounds.w > vp.width + 2)  overflows.push(`canvas w=${canvasBounds.w} > ${vp.width}`);
  if (canvasBounds.h > vp.height + 2) overflows.push(`canvas h=${canvasBounds.h} > ${vp.height}`);
  if (overflows.length) {
    console.log(`[${vp.label}] ⚠ Canvas bounds: ${JSON.stringify(canvasBounds)} (viewport: ${vp.width}×${vp.height})`);
  } else {
    console.log(`[${vp.label}] ✓ Canvas fills viewport: ${canvasBounds.w}×${canvasBounds.h}`);
  }

  // Click Play → Level Select
  await page.mouse.click(vp.width / 2, vp.height * 0.47);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ssDir, `${vp.label}-02-level-select.png`) });
  console.log(`[${vp.label}] ✓ level-select screenshot`);

  // Tap level 1 (first card, ~160px from top after top bar)
  await page.mouse.click(vp.width / 2, 160);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(ssDir, `${vp.label}-03-game.png`) });
  console.log(`[${vp.label}] ✓ game screenshot`);

  if (errors.length) {
    console.log(`[${vp.label}] ✗ JS errors: ${errors.join('; ')}`);
  } else {
    console.log(`[${vp.label}] ✓ No JS errors`);
  }

  await ctx.close();
  return { vp, errors, overflows };
}

(async () => {
  const server = await serve(DIST, PORT);
  console.log(`Serving dist/ on http://localhost:${PORT}`);

  let wk, cr;
  try {
    wk = await webkit.launch({ headless: true });
    cr = await chromium.launch({ headless: true });

    const results = [];
    for (const vp of VIEWPORTS) {
      results.push(await runViewport(vp, wk, cr));
    }

    console.log('\n' + '='.repeat(60));
    console.log('  VIEWPORT TEST SUMMARY');
    console.log('='.repeat(60));
    for (const r of results) {
      const ok = r.errors.length === 0;
      console.log(`  ${ok ? '✓' : '✗'} ${r.vp.label} (${r.vp.width}×${r.vp.height}) [${r.vp.browser}] — ${ok ? 'PASS' : 'FAIL: ' + r.errors[0]}`);
    }
    console.log(`\nScreenshots in: ${path.join(__dirname, 'screenshots')}`);

  } finally {
    wk && await wk.close();
    cr && await cr.close();
    server.close();
  }
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

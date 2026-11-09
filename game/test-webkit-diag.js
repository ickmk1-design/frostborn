/**
 * Playwright WebKit diagnostic — run against dist/ to find root cause of iOS black screen.
 * Usage: node test-webkit-diag.js
 */
const { webkit, chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const PORT = 7777;
const VIEWPORT = { width: 390, height: 844 };

function serve(distDir, port) {
  const MIME = {
    '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
    '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg',
    '.json':'application/json', '.ogg':'audio/ogg', '.m4a':'audio/mp4',
    '.woff2':'font/woff2', '.woff':'font/woff', '.ttf':'font/ttf',
  };
  const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    let file = path.join(distDir, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(file)) {
      res.writeHead(404); res.end('404: ' + url); return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(r => server.listen(port, () => r(server)));
}

async function test(label, browser, opts = {}) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log('='.repeat(60));

  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    ...opts,
  });
  const page = await ctx.newPage();

  const jsErrors = [];
  const netFails = [];
  const consoleLogs = [];

  page.on('console', msg => {
    const t = msg.type(), text = msg.text();
    consoleLogs.push({ t, text });
    if (t === 'error') console.log(`  [JS ${t.toUpperCase()}] ${text}`);
    else if (t === 'warning' && !text.includes('Phaser') && !text.includes('WebGL')) console.log(`  [warn] ${text}`);
  });
  page.on('pageerror', e => {
    jsErrors.push(e.message + (e.stack ? '\n' + e.stack.split('\n').slice(0,4).join('\n') : ''));
    console.log(`  [PAGE ERROR] ${e.message}`);
  });
  page.on('requestfailed', req => {
    const f = `FAIL ${req.method()} ${req.url()} — ${req.failure()?.errorText}`;
    netFails.push(f);
    console.log(`  [NET FAIL] ${f}`);
  });

  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}/`);

  // Wait for canvas
  let canvasAppeared = false;
  try {
    await page.waitForSelector('canvas', { timeout: 8000 });
    canvasAppeared = true;
    console.log(`  ✓ Canvas appeared at ${Date.now()-t0}ms`);
  } catch {
    console.log(`  ✗ Canvas NOT visible after 8s — BLACK SCREEN`);
  }

  // Wait for BootScene to finish (assets load)
  if (canvasAppeared) {
    try {
      // BootScene transitions when load completes — look for LevelSelectScene text
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas');
        return c && c.width > 0 && c.height > 0;
      }, { timeout: 15000 });
      console.log(`  ✓ Canvas has content at ${Date.now()-t0}ms`);
    } catch {
      console.log(`  ✗ Canvas remained empty`);
    }

    // Wait for load bar to complete
    await page.waitForTimeout(8000);
    console.log(`  Total wait: ${Date.now()-t0}ms`);
  }

  // Screenshot
  const screenshotPath = path.join(__dirname, `screenshot-${label.replace(/\s+/g,'-').toLowerCase()}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`  Screenshot: ${screenshotPath}`);

  // Click center to simulate first tap (sound unlock)
  if (canvasAppeared) {
    await page.mouse.click(195, 422);
    await page.waitForTimeout(1000);
    console.log(`  Tapped center`);
  }

  // Summary
  console.log('\n  --- SUMMARY ---');
  console.log(`  Canvas: ${canvasAppeared ? '✓ appeared' : '✗ BLACK SCREEN'}`);
  if (jsErrors.length) {
    console.log(`  JS errors (${jsErrors.length}):`);
    jsErrors.forEach(e => console.log('    ' + e.split('\n')[0]));
  } else {
    console.log('  ✓ No JS errors');
  }
  if (netFails.length) {
    console.log(`  Network failures (${netFails.length}):`);
    netFails.forEach(f => console.log('    ' + f));
  } else {
    console.log('  ✓ No network failures (all assets served locally)');
  }

  await ctx.close();
  return { canvasAppeared, jsErrors, netFails, consoleLogs };
}

(async () => {
  const server = await serve(DIST, PORT);
  console.log(`Serving dist/ on http://localhost:${PORT}`);

  let wk, cr;
  try {
    wk = await webkit.launch({ headless: true });
    cr = await chromium.launch({ headless: true });

    const wkResult  = await test('WebKit (Safari/iOS)', wk);
    const crResult  = await test('Chromium (Android)', cr);

    console.log('\n' + '='.repeat(60));
    console.log('  FINAL COMPARISON');
    console.log('='.repeat(60));
    console.log(`  WebKit  canvas: ${wkResult.canvasAppeared  ? '✓' : '✗ BLACK'} | errors: ${wkResult.jsErrors.length} | net fails: ${wkResult.netFails.length}`);
    console.log(`  Chromium canvas: ${crResult.canvasAppeared ? '✓' : '✗ BLACK'} | errors: ${crResult.jsErrors.length} | net fails: ${crResult.netFails.length}`);

  } finally {
    wk && await wk.close();
    cr && await cr.close();
    server.close();
  }
})().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

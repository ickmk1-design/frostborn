/**
 * Upload In-App Purchase key + ASC API key to RevenueCat dashboard for Frostborn iOS app.
 * Run: node rc_upload_iap_key.js
 * Chrome must be CLOSED before running.
 */
const { chromium } = require('./game/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const CHROME_PROFILE = 'C:/Users/ickmk/AppData/Local/Google/Chrome/User Data';
const RC_IOS_APP_URL = 'https://app.revenuecat.com/projects/proj9d47e5bc/apps/app333ece3658';

const IAP_KEY_PATH   = 'C:/Users/ickmk/Downloads/SubscriptionKey_Y8CTYB43Y9.p8';
const IAP_KEY_ID     = 'Y8CTYB43Y9';
const ISSUER_ID      = '37ca6f84-e761-49dd-9577-aa0e349a5953';

const ASC_KEY_PATH   = 'C:/Users/ickmk/Downloads/AuthKey_RDZAK5LP3T.p8';
const ASC_KEY_ID     = 'RDZAK5LP3T';

const SCREENSHOT_DIR = 'C:/Users/ickmk/Frostborn/store_assets';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function screenshot(page, name) {
  const p = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: p, fullPage: false });
  console.log('Screenshot:', p);
  return p;
}

(async () => {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('Launching Chrome...');
  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    headless: false,
    channel: 'chrome',
    args: ['--profile-directory=Default'],
    timeout: 30000,
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(15000);

  // Check login
  await page.goto('https://app.revenuecat.com', { waitUntil: 'networkidle' });
  await sleep(2000);
  if (page.url().includes('login') || page.url().includes('sign-in')) {
    console.error('Not logged in to RC. Please log in and retry.');
    await browser.close(); process.exit(1);
  }
  console.log('Logged in. Going to iOS app page...');

  // Navigate to iOS app
  await page.goto(RC_IOS_APP_URL, { waitUntil: 'networkidle' });
  await sleep(2000);
  await screenshot(page, 'rc_ios_app_before.png');

  // ── 1. Find and click In-App Purchase Key section ──────────────────────────
  console.log('\n=== In-App Purchase Key ===');

  // Look for "In-App Purchase" tab or section heading
  const iapTab = page.locator('a:has-text("In-App Purchase"), button:has-text("In-App Purchase"), [role="tab"]:has-text("In-App Purchase")').first();
  if (await iapTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Found IAP tab, clicking...');
    await iapTab.click();
    await sleep(1500);
  }

  // Look for "Add" or "Configure" button near In-App Purchase Key
  const addBtn = page.locator('button:has-text("Add"), button:has-text("Configure"), button:has-text("Set up"), button:has-text("Upload")').first();
  if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Found Add/Configure button, clicking...');
    await addBtn.click();
    await sleep(1500);
  }

  await screenshot(page, 'rc_ios_iap_section.png');

  // Fill Key ID
  const keyIdInputs = [
    'input[placeholder*="Key ID" i]',
    'input[placeholder*="key_id" i]',
    'input[name*="key" i][type="text"]',
    'input[id*="key" i]',
  ];
  for (const sel of keyIdInputs) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.clear();
      await el.fill(IAP_KEY_ID);
      console.log('Filled Key ID:', IAP_KEY_ID);
      break;
    }
  }

  // Fill Issuer ID
  const issuerInputs = [
    'input[placeholder*="Issuer" i]',
    'input[placeholder*="issuer_id" i]',
    'input[name*="issuer" i]',
    'input[id*="issuer" i]',
  ];
  for (const sel of issuerInputs) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.clear();
      await el.fill(ISSUER_ID);
      console.log('Filled Issuer ID:', ISSUER_ID);
      break;
    }
  }

  // Upload .p8 file
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await fileInput.setInputFiles(IAP_KEY_PATH);
    console.log('Uploaded IAP key file:', IAP_KEY_PATH);
  } else {
    // Try textarea for pasting key content
    const p8Content = fs.readFileSync(IAP_KEY_PATH, 'utf8');
    const keyTextarea = page.locator('textarea').first();
    if (await keyTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keyTextarea.fill(p8Content);
      console.log('Pasted IAP key content into textarea');
    }
  }
  await sleep(1000);

  // Save
  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Add"), button:has-text("Done"), button:has-text("Update"), button[type="submit"]').first();
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
    await sleep(3000);
    console.log('Clicked Save for IAP key');
  }

  await screenshot(page, 'rc_ios_after_iap.png');

  // ── 2. App Store Connect API Key ──────────────────────────────────────────
  console.log('\n=== App Store Connect API Key ===');

  // Look for ASC API Key section
  const ascSection = page.locator('text=/app store connect api/i, text=/asc api/i').first();
  if (await ascSection.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Found ASC section');
    await ascSection.click().catch(() => {});
    await sleep(1000);
  }

  const ascAddBtn = page.locator('button:has-text("Add"), button:has-text("Configure"), button:has-text("Set up")').first();
  if (await ascAddBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await ascAddBtn.click();
    await sleep(1500);
  }

  // Fill ASC Key ID
  for (const sel of keyIdInputs) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.clear();
      await el.fill(ASC_KEY_ID);
      console.log('Filled ASC Key ID:', ASC_KEY_ID);
      break;
    }
  }

  // Fill Issuer ID again
  for (const sel of issuerInputs) {
    const el = page.locator(sel).first();
    if (await el.isVisible({ timeout: 3000 }).catch(() => false)) {
      await el.clear();
      await el.fill(ISSUER_ID);
      console.log('Filled Issuer ID for ASC key');
      break;
    }
  }

  // Upload ASC .p8
  const fileInput2 = page.locator('input[type="file"]').first();
  if (await fileInput2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fileInput2.setInputFiles(ASC_KEY_PATH);
    console.log('Uploaded ASC key file');
  }
  await sleep(1000);

  const saveBtn2 = page.locator('button:has-text("Save"), button:has-text("Add"), button:has-text("Done"), button[type="submit"]').first();
  if (await saveBtn2.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn2.click();
    await sleep(3000);
    console.log('Clicked Save for ASC key');
  }

  // ── 3. Reload and screenshot final state ─────────────────────────────────
  console.log('\nReloading page for final screenshot...');
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(3000);
  await screenshot(page, 'rc_ios_credentials_final.png');

  console.log('\nDone! Check store_assets/rc_ios_credentials_final.png');
  await browser.close();
})().catch(async e => {
  console.error('Error:', e.message);
  process.exit(1);
});

/**
 * RC dashboard credential setup via Playwright
 * Uses existing Chrome session — Chrome must be CLOSED before running.
 * Run: node rc_configure_credentials.js
 */
const { chromium } = require('./game/node_modules/playwright');
const path = require('path');
const fs = require('fs');

const CHROME_PROFILE = 'C:/Users/ickmk/AppData/Local/Google/Chrome/User Data';
const IOS_APP_URL   = 'https://app.revenuecat.com/projects/proj9d47e5bc/apps/app1a50dfd888';
const AND_APP_URL   = 'https://app.revenuecat.com/projects/proj9d47e5bc/apps/app25dc4849e3';

const P8_PATH   = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const SA_PATH   = 'C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json';
const KEY_ID    = 'K8CBHMQ2S8';
const ISSUER_ID = '37ca6f84-e761-49dd-9577-aa0e349a5953';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function configureIOS(page) {
  console.log('\n=== iOS ASC Key Setup ===');
  await page.goto(IOS_APP_URL, { waitUntil: 'networkidle' });
  await sleep(2000);
  await page.screenshot({ path: '/tmp/rc_ios_before.png' });

  // Find "App Store Connect API key" section — look for the key upload form
  const p8Content = fs.readFileSync(P8_PATH, 'utf8').trim();

  // Try clicking the "Add" or "Configure" button near ASC API key
  const ascSection = page.locator('text=/app store connect api key/i').first();
  if (await ascSection.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Found ASC section');
    await ascSection.click().catch(() => {});
    await sleep(1000);
  }

  // Look for key ID input
  const keyIdInput = page.locator('input[placeholder*="key id" i], input[name*="key_id" i], input[id*="key_id" i], input[placeholder*="Key ID" i]').first();
  if (await keyIdInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await keyIdInput.fill(KEY_ID);
    console.log('Filled key ID:', KEY_ID);
  }

  // Issuer ID
  const issuerInput = page.locator('input[placeholder*="issuer" i], input[name*="issuer" i], input[id*="issuer" i]').first();
  if (await issuerInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await issuerInput.fill(ISSUER_ID);
    console.log('Filled issuer ID:', ISSUER_ID);
  }

  // .p8 file upload
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await fileInput.setInputFiles(P8_PATH);
    console.log('Set .p8 file');
  } else {
    // Try textarea for pasting key content
    const keyTextarea = page.locator('textarea[placeholder*="private key" i], textarea[name*="private_key" i], textarea[id*="private_key" i]').first();
    if (await keyTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keyTextarea.fill(p8Content);
      console.log('Pasted .p8 key content');
    }
  }

  // Save/Submit
  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Add"), button:has-text("Connect"), button:has-text("Update")').first();
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
    await sleep(2000);
    console.log('Clicked save');
  }

  await page.screenshot({ path: '/tmp/rc_ios_after.png' });
  console.log('iOS screenshots saved to /tmp/rc_ios_before.png and /tmp/rc_ios_after.png');
}

async function configureAndroid(page) {
  console.log('\n=== Android Play SA Setup ===');
  await page.goto(AND_APP_URL, { waitUntil: 'networkidle' });
  await sleep(2000);
  await page.screenshot({ path: '/tmp/rc_android_before.png' });

  // Find Play service account section
  const playSection = page.locator('text=/service account/i, text=/google play/i').first();
  if (await playSection.isVisible({ timeout: 5000 }).catch(() => false)) {
    console.log('Found Play SA section');
    await playSection.click().catch(() => {});
    await sleep(1000);
  }

  // JSON file upload
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.isVisible({ timeout: 8000 }).catch(() => false)) {
    await fileInput.setInputFiles(SA_PATH);
    console.log('Set service account JSON file');
  } else {
    // Try textarea for JSON content
    const jsonTextarea = page.locator('textarea').first();
    if (await jsonTextarea.isVisible({ timeout: 3000 }).catch(() => false)) {
      const saJson = fs.readFileSync(SA_PATH, 'utf8');
      await jsonTextarea.fill(saJson);
      console.log('Pasted service account JSON content');
    }
  }

  // Save/Submit
  const saveBtn = page.locator('button:has-text("Save"), button:has-text("Add"), button:has-text("Connect"), button:has-text("Update")').first();
  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
    await sleep(2000);
    console.log('Clicked save');
  }

  await page.screenshot({ path: '/tmp/rc_android_after.png' });
  console.log('Android screenshots saved to /tmp/rc_android_before.png and /tmp/rc_android_after.png');
}

(async () => {
  console.log('Launching Playwright with Chrome profile...');
  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    headless: false,
    channel: 'chrome',
    args: ['--profile-directory=Default'],
    timeout: 30000,
  });

  const page = await browser.newPage();

  // Check login state
  await page.goto('https://app.revenuecat.com', { waitUntil: 'networkidle' });
  await sleep(2000);
  const url = page.url();
  console.log('Current URL:', url);

  if (url.includes('login') || url.includes('sign-in')) {
    console.error('Not logged into RC dashboard. Please log in first at https://app.revenuecat.com and retry.');
    await browser.close();
    process.exit(1);
  }

  console.log('Logged in. Proceeding...');
  await configureIOS(page);
  await configureAndroid(page);

  // Final verification
  await sleep(1000);
  console.log('\nDone. Check screenshots in /tmp/ to verify.');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

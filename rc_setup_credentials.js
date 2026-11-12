/**
 * RC credential setup: delete + recreate iOS/Android apps WITH credentials,
 * then rebind all products/packages/entitlements.
 *
 * Run: node rc_setup_credentials.js
 */
const https = require('https');
const fs = require('fs');

const SK = 'sk_kKmwLKIikrqXZhoWMBPngqUNVBPan';
const PROJECT = 'proj9d47e5bc';

const P8  = fs.readFileSync('C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8', 'utf8').trim();
const SA  = fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8').trim();

const KEY_ID    = 'K8CBHMQ2S8';
const ISSUER_ID = '37ca6f84-e761-49dd-9577-aa0e349a5953';

// Existing IDs (pre-mapped)
const OLD_IOS_APP = 'app1a50dfd888';
const OLD_AND_APP = 'app25dc4849e3';

// Packages in the default offering
const PACKAGES = {
  remove_ads:   { pkg: 'pkge95468b0460', ios: 'com.cytbilisim.frostborn.remove_ads',   and: 'com.cytbilisim.frostborn.remove_ads'   },
  starter_pack: { pkg: 'pkged812cc6c7c', ios: 'com.cytbilisim.frostborn.starter_pack', and: 'com.cytbilisim.frostborn.starter_pack' },
  coins_small:  { pkg: 'pkge1b4f21379c', ios: 'com.cytbilisim.frostborn.coins_small',  and: 'com.cytbilisim.frostborn.coins_small'  },
  coins_medium: { pkg: 'pkge9cb88a6b71', ios: 'com.cytbilisim.frostborn.coins_medium', and: 'com.cytbilisim.frostborn.coins_medium' },
  coins_large:  { pkg: 'pkgee195c45bda', ios: 'com.cytbilisim.frostborn.coins_large',  and: 'com.cytbilisim.frostborn.coins_large'  },
};

const ENTITLEMENTS = {
  no_ads:       { id: 'entlba050ef9c0', products: ['remove_ads'] },
  starter_pack: { id: 'entl8684ec0c30', products: ['starter_pack'] },
};

function rcReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.revenuecat.com',
      path: `/v2${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${SK}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const j = d ? JSON.parse(d) : {};
        if (res.statusCode >= 400) {
          console.error(`  ERROR ${res.statusCode} ${method} ${path}: ${JSON.stringify(j).substring(0, 200)}`);
          reject(new Error(`${res.statusCode}: ${j.message || 'unknown'}`));
        } else {
          resolve(j);
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  // ── 1. Delete existing apps ──────────────────────────────────────────────
  console.log('Deleting old iOS app...');
  await rcReq('DELETE', `/projects/${PROJECT}/apps/${OLD_IOS_APP}`).catch(e => console.warn('  iOS delete:', e.message));

  console.log('Deleting old Android app...');
  await rcReq('DELETE', `/projects/${PROJECT}/apps/${OLD_AND_APP}`).catch(e => console.warn('  Android delete:', e.message));

  // ── 2. Create iOS app with ASC key ───────────────────────────────────────
  console.log('\nCreating iOS app with ASC key...');
  const ascKey = JSON.stringify({ key_id: KEY_ID, issuer_id: ISSUER_ID, private_key: P8 });
  const iosApp = await rcReq('POST', `/projects/${PROJECT}/apps`, {
    name: 'Frostborn iOS',
    type: 'app_store',
    app_store: {
      bundle_id: 'com.cytbilisim.frostborn',
      app_store_connect_api_key: ascKey,
    },
  });
  const IOS_APP_ID = iosApp.id;
  console.log('  Created iOS app:', IOS_APP_ID, '— ASC configured:', iosApp.app_store?.app_store_connect_api_key_configured);

  // ── 3. Create Android app with Play SA ───────────────────────────────────
  console.log('\nCreating Android app with Play SA...');
  const andApp = await rcReq('POST', `/projects/${PROJECT}/apps`, {
    name: 'Frostborn Android',
    type: 'play_store',
    play_store: {
      package_name: 'com.cytbilisim.frostborn',
      service_credentials_json: SA,
    },
  });
  const AND_APP_ID = andApp.id;
  console.log('  Created Android app:', AND_APP_ID, '— SA configured:', andApp.play_store?.play_service_account_credentials_configured);

  // ── 4. Create products for each app ─────────────────────────────────────
  console.log('\nCreating products...');
  const iosProducts = {};
  const andProducts = {};

  for (const [name, info] of Object.entries(PACKAGES)) {
    // iOS product
    const iosProd = await rcReq('POST', `/projects/${PROJECT}/products`, {
      store_identifier: info.ios,
      type: 'one_time_purchase',
      app_id: IOS_APP_ID,
    });
    iosProducts[name] = iosProd.id;
    console.log(`  iOS ${name}: ${iosProd.id} (${info.ios})`);

    // Android product
    const andProd = await rcReq('POST', `/projects/${PROJECT}/products`, {
      store_identifier: info.and,
      type: 'one_time_purchase',
      app_id: AND_APP_ID,
    });
    andProducts[name] = andProd.id;
    console.log(`  Android ${name}: ${andProd.id} (${info.and})`);
  }

  // ── 5. Attach products to packages ──────────────────────────────────────
  console.log('\nAttaching products to packages...');
  for (const [name, info] of Object.entries(PACKAGES)) {
    await rcReq('POST', `/projects/${PROJECT}/packages/${info.pkg}/products`, {
      product_id: iosProducts[name],
    }).then(() => console.log(`  ${name} → iOS product attached`));

    await rcReq('POST', `/projects/${PROJECT}/packages/${info.pkg}/products`, {
      product_id: andProducts[name],
    }).then(() => console.log(`  ${name} → Android product attached`));
  }

  // ── 6. Attach products to entitlements ───────────────────────────────────
  console.log('\nAttaching products to entitlements...');
  for (const [name, info] of Object.entries(ENTITLEMENTS)) {
    for (const prodName of info.products) {
      if (iosProducts[prodName]) {
        await rcReq('POST', `/projects/${PROJECT}/entitlements/${info.id}/products`, {
          product_id: iosProducts[prodName],
        }).then(() => console.log(`  ${name} → iOS ${prodName} attached`));
      }
      if (andProducts[prodName]) {
        await rcReq('POST', `/projects/${PROJECT}/entitlements/${info.id}/products`, {
          product_id: andProducts[prodName],
        }).then(() => console.log(`  ${name} → Android ${prodName} attached`));
      }
    }
  }

  // ── 7. Verify ────────────────────────────────────────────────────────────
  console.log('\n=== Verification ===');
  const iosVerify = await rcReq('GET', `/projects/${PROJECT}/apps/${IOS_APP_ID}`);
  const andVerify = await rcReq('GET', `/projects/${PROJECT}/apps/${AND_APP_ID}`);
  console.log('iOS ASC key configured:', iosVerify.app_store?.app_store_connect_api_key_configured);
  console.log('Android SA configured:', andVerify.play_store?.play_service_account_credentials_configured);
  console.log('\nDone!');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

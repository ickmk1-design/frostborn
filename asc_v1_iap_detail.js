// IAP deep dive: price points, review screenshot, state.
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID   = 'K8CBHMQ2S8';
const ISSUER   = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const APP_ID   = '6831935786';

function makeJwt() {
  const pk = fs.readFileSync(KEY_FILE, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iss: ISSUER, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url');
  const sign = crypto.createSign('SHA256');
  sign.update(`${h}.${p}`);
  const sig = sign.sign({ key: pk, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${h}.${p}.${sig}`;
}
function api(method, path) {
  return new Promise((resolve, reject) => {
    const jwt = makeJwt();
    const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
    const req = https.request({ hostname: 'api.appstoreconnect.apple.com', path, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }); }
        catch (e) { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const iaps = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=50`);
  for (const i of (iaps.body.data || [])) {
    const a = i.attributes;
    console.log(`\n=== ${a?.productId} | ${a?.inAppPurchaseType} | state=${a?.state} | reviewNote="${a?.reviewNote||''}" ===`);

    // Localizations
    const lRes = await api('GET', `/v2/inAppPurchases/${i.id}/inAppPurchaseLocalizations`);
    console.log(' Localizations:');
    for (const l of (lRes.body.data || [])) {
      console.log(`  ${l.attributes?.locale}: name="${l.attributes?.name}" state=${l.attributes?.state}`);
      console.log(`    desc="${l.attributes?.description}"`);
    }

    // Price schedule with price points
    const ips = await api('GET', `/v2/inAppPurchases/${i.id}/iapPriceSchedule?include=manualPrices,manualPrices.inAppPurchasePricePoint`);
    const prices = (ips.body.included || []).filter(x => x.type === 'inAppPurchasePrices');
    const points = (ips.body.included || []).filter(x => x.type === 'inAppPurchasePricePoints');
    console.log(` Prices: ${prices.length} manual`);
    points.slice(0, 3).forEach(p => console.log(`  pp ${p.id} customer=${p.attributes?.customerPrice} ${p.attributes?.customerCurrency}`));
    const usaPrice = prices.find(p => {
      const ppId = p.relationships?.inAppPurchasePricePoint?.data?.id;
      const pp = points.find(x => x.id === ppId);
      return pp?.relationships?.territory?.data?.id === 'USA';
    });
    if (usaPrice) {
      const ppId = usaPrice.relationships?.inAppPurchasePricePoint?.data?.id;
      const pp = points.find(x => x.id === ppId);
      console.log(`  → USA price tier: ${pp?.attributes?.customerPrice} ${pp?.attributes?.customerCurrency}`);
    }

    // Review screenshot
    const srs = await api('GET', `/v1/inAppPurchases/${i.id}/appStoreReviewScreenshot`);
    if (srs.status === 200) console.log(' review screenshot:', srs.body.data ? `present (${srs.body.data?.attributes?.fileName})` : 'MISSING');
    else console.log(' review screenshot:', srs.status);

    // Required Images via v2
    const srs2 = await api('GET', `/v2/inAppPurchases/${i.id}/appStoreReviewScreenshot`);
    if (srs2.status === 200) console.log(' review screenshot v2:', srs2.body.data ? `present (${srs2.body.data?.attributes?.fileName})` : 'MISSING');
  }
}

main().catch(e => console.error(e));

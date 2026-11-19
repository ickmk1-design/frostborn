// Final verification pass — fetch & print everything we set.
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID   = 'K8CBHMQ2S8';
const ISSUER   = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const APP_ID   = '6831935786';
const APP_INFO_ID = '086db6fd-ac3e-4650-adbc-38d6db4ac2bd';
const VERSION_ID  = 'a1b135b8-08ca-48f3-975e-a1e5aae607d5';

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
function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const jwt = makeJwt();
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request({ hostname: 'api.appstoreconnect.apple.com', path, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} }); }
        catch (e) { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('====== VERIFICATION ======\n');

  // App attrs
  const app = await api('GET', `/v1/apps/${APP_ID}`);
  console.log('App:', app.body.data?.attributes?.name, '| bundleId:', app.body.data?.attributes?.bundleId);
  console.log(' contentRightsDeclaration:', app.body.data?.attributes?.contentRightsDeclaration);
  console.log(' primaryLocale:', app.body.data?.attributes?.primaryLocale);

  // AppInfo + categories
  const aiFull = await api('GET', `/v1/appInfos/${APP_INFO_ID}?include=primaryCategory,primarySubcategoryOne,primarySubcategoryTwo,secondaryCategory`);
  const ai = aiFull.body.data;
  console.log('\nAppInfo:', ai?.attributes);
  const rels = ai?.relationships || {};
  console.log(' primaryCategory:', rels.primaryCategory?.data?.id);
  console.log(' primarySubcategoryOne:', rels.primarySubcategoryOne?.data?.id);
  console.log(' primarySubcategoryTwo:', rels.primarySubcategoryTwo?.data?.id);
  console.log(' secondaryCategory:', rels.secondaryCategory?.data?.id);

  // AppInfo localizations
  console.log('\nAppInfo localizations:');
  const ail = await api('GET', `/v1/appInfos/${APP_INFO_ID}/appInfoLocalizations`);
  for (const l of (ail.body.data || [])) {
    console.log(`  ${l.attributes?.locale}: name="${l.attributes?.name}" subtitle="${l.attributes?.subtitle}" privacy=${l.attributes?.privacyPolicyUrl}`);
  }

  // Version
  console.log('\nAppStoreVersion:');
  const v = await api('GET', `/v1/appStoreVersions/${VERSION_ID}`);
  console.log(' versionString:', v.body.data?.attributes?.versionString);
  console.log(' state:', v.body.data?.attributes?.appStoreState);
  console.log(' copyright:', v.body.data?.attributes?.copyright);
  console.log(' usesNonExemptEncryption:', v.body.data?.attributes?.usesNonExemptEncryption);

  // Version localizations
  console.log('\nVersion localizations:');
  const vl = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations`);
  for (const l of (vl.body.data || [])) {
    const a = l.attributes;
    console.log(`  ${a?.locale}: desc(${a?.description?.length}) kw(${a?.keywords?.length})="${a?.keywords}"`);
    console.log(`    promo(${a?.promotionalText?.length})`);
    console.log(`    whatsNew="${(a?.whatsNew || '').slice(0,80)}" (${(a?.whatsNew||'').length})`);
    console.log(`    support=${a?.supportUrl}`);
    console.log(`    marketing=${a?.marketingUrl}`);
  }

  // Review info
  console.log('\nReview Detail:');
  const r = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
  const ra = r.body.data?.attributes;
  console.log(` ${ra?.contactFirstName} ${ra?.contactLastName} | ${ra?.contactEmail} | ${ra?.contactPhone}`);
  console.log(` notes="${(ra?.notes || '').slice(0,100)}..."`);
  console.log(` demoAccountRequired=${ra?.demoAccountRequired}`);

  // Price schedule
  console.log('\nPrice schedule:');
  const ps = await api('GET', `/v1/apps/${APP_ID}/appPriceSchedule?include=manualPrices,baseTerritory,manualPrices.appPricePoint`);
  const prices = (ps.body.included || []).filter(i => i.type === 'appPricePoints');
  console.log(' schedule status:', ps.status, 'pricePoints:', prices.map(p => `${p.id}=${p.attributes?.customerPrice}`).join(' | '));

  // Availability
  console.log('\nAvailability:');
  const av = await api('GET', `/v2/apps/${APP_ID}/appAvailabilityV2`);
  console.log(' status:', av.status, 'availableInNewTerritories:', av.body.data?.attributes?.availableInNewTerritories);

  // IAPs
  console.log('\nIAPs:');
  const iaps = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=50`);
  for (const i of (iaps.body.data || [])) {
    const a = i.attributes;
    const lRes = await api('GET', `/v2/inAppPurchases/${i.id}/inAppPurchaseLocalizations`);
    const locs = (lRes.body.data || []).map(l => `${l.attributes?.locale}=${l.attributes?.state}/"${l.attributes?.name}"`).join(' | ');
    console.log(`  ${a?.productId} | ${a?.inAppPurchaseType} | state=${a?.state} | ${locs}`);

    // price schedule
    const ips = await api('GET', `/v2/inAppPurchases/${i.id}/iapPriceSchedule?include=manualPrices,automaticPrices`);
    if (ips.status === 200) {
      const manual = (ips.body.included || []).filter(x => x.type === 'inAppPurchasePrices');
      const points = (ips.body.included || []).filter(x => x.type === 'inAppPurchasePricePoints');
      console.log(`      price: manual=${manual.length} points=${points.length} ${points.map(p => `${p.attributes?.customerPrice}`).join(',')}`);
    } else {
      console.log(`      no price schedule (status ${ips.status})`);
    }
  }
}

main().catch(e => console.error(e));

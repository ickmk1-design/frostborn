// Verification: dump final state of ASC IAPs + Play IAPs
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const ASC_KEY_ID = 'K8CBHMQ2S8';
const ASC_ISSUER = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const ASC_P8 = fs.readFileSync('C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8', 'utf8').trim();
const ASC_APP_ID = '6831935786';
const SA = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
function httpReq(method, host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path, method, headers }, x => {
      const chunks = [];
      x.on('data', c => chunks.push(c));
      x.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
        resolve({ s: x.statusCode, b: json, raw: text });
      });
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}
function b64u(buf) { return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
function makePlayJwt() {
  const n = Math.floor(Date.now()/1000);
  const h = b64u(Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const p = b64u(Buffer.from(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', exp: n+3600, iat: n })));
  const s = crypto.createSign('RSA-SHA256'); s.update(h+'.'+p);
  return h+'.'+p+'.'+b64u(s.sign(SA.private_key));
}
let _playTok = null;
async function playTok() {
  if (_playTok) return _playTok;
  const r = await httpReq('POST', 'oauth2.googleapis.com', '/token', {'Content-Type':'application/x-www-form-urlencoded'}, 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+makePlayJwt());
  _playTok = r.b.access_token; return _playTok;
}
async function play(method, path, body) {
  const tok = await playTok();
  const data = body ? JSON.stringify(body) : null;
  return httpReq(method, 'androidpublisher.googleapis.com', path, { 'Authorization': 'Bearer '+tok, 'Content-Type': 'application/json', ...(data ? {'Content-Length': Buffer.byteLength(data)} : {}) }, data);
}
function ascJwt() {
  const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const p = Buffer.from(JSON.stringify({ iss: ASC_ISSUER, iat: now, exp: now+1200, aud: 'appstoreconnect-v1' })).toString('base64url');
  const sign = crypto.createSign('SHA256'); sign.update(h+'.'+p);
  return h+'.'+p+'.'+sign.sign({ key: ASC_P8, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
async function asc(method, path, body) {
  const data = body ? JSON.stringify(body) : null;
  return httpReq(method, 'api.appstoreconnect.apple.com', path, { 'Authorization': 'Bearer '+ascJwt(), 'Content-Type': 'application/json', ...(data ? {'Content-Length': Buffer.byteLength(data)} : {}) }, data);
}

async function main() {
  console.log('=== ASC: verify IAPs ===');
  const iaps = await asc('GET', `/v1/apps/${ASC_APP_ID}/inAppPurchasesV2?limit=50`);
  for (const i of (iaps.b.data || [])) {
    console.log(`\n--- ${i.attributes?.productId} (state=${i.attributes?.state}) ---`);
    const lRes = await asc('GET', `/v2/inAppPurchases/${i.id}/inAppPurchaseLocalizations`);
    for (const l of (lRes.b.data || [])) {
      console.log(`  ${l.attributes?.locale} [${l.attributes?.state}]  name="${l.attributes?.name}"  desc(${(l.attributes?.description||'').length}c)="${l.attributes?.description}"`);
    }
    const ps = await asc('GET', `/v2/inAppPurchases/${i.id}/iapPriceSchedule?include=manualPrices`);
    const inc = (ps.b.included || []);
    for (const p of inc.filter(x => x.type === 'inAppPurchasePrices')) {
      // Parse pricePoint id (base64url → json)
      const pp = p.relationships?.inAppPurchasePricePoint?.data?.id;
      let tier = '';
      try { tier = JSON.parse(Buffer.from(pp, 'base64').toString('utf8')).p; } catch {}
      console.log(`  price → pp tier=${tier} (id prefix ${pp?.slice(0,28)}...)`);
    }
  }

  console.log('\n=== ASC: verify review contact ===');
  const vRes = await asc('GET', `/v1/apps/${ASC_APP_ID}/appStoreVersions?limit=10`);
  const versions = (vRes.b.data || []).sort((a,b) => (b.attributes?.createdDate||'').localeCompare(a.attributes?.createdDate||''));
  const v = versions.find(x => x.attributes?.platform === 'IOS') || versions[0];
  const rd = await asc('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`);
  console.log(`  v${v.attributes?.versionString}: phone=${rd.b.data?.attributes?.contactPhone} email=${rd.b.data?.attributes?.contactEmail} name=${rd.b.data?.attributes?.contactFirstName} ${rd.b.data?.attributes?.contactLastName}`);

  console.log('\n=== Play: verify one-time products ===');
  const g = await play('GET', `/androidpublisher/v3/applications/${PKG}/oneTimeProducts`);
  for (const p of (g.b.oneTimeProducts || [])) {
    console.log(`\n--- ${p.productId} ---`);
    for (const l of (p.listings || [])) {
      console.log(`  ${l.languageCode}: title="${l.title}"  desc="${l.description}"`);
    }
    for (const po of (p.purchaseOptions || [])) {
      const us = (po.regionalPricingAndAvailabilityConfigs || []).find(c => c.regionCode === 'US');
      const usd = us?.price;
      const usdDollar = usd ? ((parseInt(usd.units || '0', 10)) + (usd.nanos || 0)/1e9) : null;
      const nr = po.newRegionsConfig?.usdPrice;
      const nrDollar = nr ? ((parseInt(nr.units || '0', 10)) + (nr.nanos || 0)/1e9) : null;
      const micros = usd ? (parseInt(usd.units || '0', 10) * 1_000_000 + Math.round((usd.nanos || 0) / 1000)) : null;
      console.log(`  [${po.purchaseOptionId}] state=${po.state}  US=$${usdDollar} (${micros} micros)  newRegions USD=$${nrDollar}  regions=${po.regionalPricingAndAvailabilityConfigs?.length}`);
    }
  }
}
main().catch(e => console.error('fatal', e));

const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const ASC_KEY_ID = 'K8CBHMQ2S8';
const ASC_ISSUER = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const ASC_P8 = fs.readFileSync('C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8', 'utf8').trim();
const ASC_APP_ID = '6831935786';

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
function ascJwt() {
  const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const p = Buffer.from(JSON.stringify({ iss: ASC_ISSUER, iat: now, exp: now+1200, aud: 'appstoreconnect-v1' })).toString('base64url');
  const sign = crypto.createSign('SHA256'); sign.update(h+'.'+p);
  return h+'.'+p+'.'+sign.sign({ key: ASC_P8, dsaEncoding: 'ieee-p1363' }).toString('base64url');
}
async function asc(method, path) {
  return httpReq(method, 'api.appstoreconnect.apple.com', path, { 'Authorization': 'Bearer '+ascJwt(), 'Content-Type': 'application/json' });
}

async function main() {
  const iaps = ['6831936237', '6831936238', '6831936270', '6831936296', '6831936149'];
  const names = {'6831936237':'remove_ads','6831936238':'starter_pack','6831936270':'coins_small','6831936296':'coins_medium','6831936149':'coins_large'};
  for (const id of iaps) {
    console.log(`\n=== ${names[id]} (${id}) ===`);
    // state
    const info = await asc('GET', `/v2/inAppPurchases/${id}`);
    console.log(' state:', info.b.data?.attributes?.state, 'reviewNote:', info.b.data?.attributes?.reviewNote);

    // Price schedule with manualPrices expanded including pricePoints
    const ps = await asc('GET', `/v1/inAppPurchasePriceSchedules/${id}/manualPrices?include=inAppPurchasePricePoint&limit=10`);
    console.log(' manualPrices status:', ps.s);
    const prices = ps.b.data || [];
    const points = (ps.b.included || []).filter(x => x.type === 'inAppPurchasePricePoints');
    console.log(' prices:', prices.length, 'pricePoints:', points.length);
    for (const p of prices) {
      const ppRel = p.relationships?.inAppPurchasePricePoint?.data?.id;
      const pp = points.find(x => x.id === ppRel);
      console.log(`   → pricePoint ${ppRel?.slice(0,40)}...  customer=${pp?.attributes?.customerPrice} ${pp?.attributes?.customerCurrency} proceeds=${pp?.attributes?.proceeds}`);
      if (pp?.id) {
        try {
          const decoded = JSON.parse(Buffer.from(pp.id, 'base64').toString('utf8'));
          console.log(`     tier=${decoded.p} territory=${decoded.t}`);
        } catch {}
      }
    }

    // baseTerritory
    const bt = await asc('GET', `/v1/inAppPurchasePriceSchedules/${id}/baseTerritory`);
    console.log(' baseTerritory:', bt.b.data?.id);

    // Look up appStoreReviewScreenshot
    const srs = await asc('GET', `/v1/inAppPurchases/${id}/appStoreReviewScreenshot`);
    console.log(' reviewScreenshot:', srs.s, srs.b.data ? `present (${srs.b.data.attributes?.fileName})` : 'MISSING');
  }
}
main().catch(e => console.error('fatal', e));

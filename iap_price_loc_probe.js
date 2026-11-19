// Probe ASC IAPs: get product IDs, current price schedules, localizations, and discover USD price points.
// Probe Play IAPs: get in-app products, prices, listings.
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
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
function b64u(buf) { return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
function makePlayJwt() {
  const n = Math.floor(Date.now()/1000);
  const h = b64u(Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const p = b64u(Buffer.from(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: n+3600, iat: n
  })));
  const s = crypto.createSign('RSA-SHA256'); s.update(h+'.'+p);
  return h+'.'+p+'.'+b64u(s.sign(SA.private_key));
}
let _playTok = null;
async function playTok() {
  if (_playTok) return _playTok;
  const r = await httpReq('POST', 'oauth2.googleapis.com', '/token',
    {'Content-Type':'application/x-www-form-urlencoded'},
    'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+makePlayJwt());
  _playTok = r.b.access_token;
  return _playTok;
}
async function play(method, path, body) {
  const tok = await playTok();
  const data = body ? JSON.stringify(body) : null;
  return httpReq(method, 'androidpublisher.googleapis.com', path, {
    'Authorization': 'Bearer '+tok,
    'Content-Type': 'application/json',
    ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
  }, data);
}
function ascJwt() {
  const h = Buffer.from(JSON.stringify({alg:'ES256',kid:ASC_KEY_ID,typ:'JWT'})).toString('base64url');
  const now = Math.floor(Date.now()/1000);
  const p = Buffer.from(JSON.stringify({iss:ASC_ISSUER,iat:now,exp:now+1200,aud:'appstoreconnect-v1'})).toString('base64url');
  const sign = crypto.createSign('SHA256'); sign.update(h+'.'+p);
  return h+'.'+p+'.'+sign.sign({key:ASC_P8,dsaEncoding:'ieee-p1363'}).toString('base64url');
}
async function asc(method, path, body) {
  const data = body ? JSON.stringify(body) : null;
  return httpReq(method, 'api.appstoreconnect.apple.com', path, {
    'Authorization': 'Bearer '+ascJwt(),
    'Content-Type': 'application/json',
    ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
  }, data);
}

async function main() {
  console.log('=== ASC: list IAPs ===');
  const iaps = await asc('GET', `/v2/inAppPurchases?filter[app]=${ASC_APP_ID}&limit=50`);
  if (iaps.s !== 200) {
    console.log('  v2 filter[app] failed, trying v1 /apps/{id}/inAppPurchasesV2');
    const alt = await asc('GET', `/v1/apps/${ASC_APP_ID}/inAppPurchasesV2?limit=50`);
    console.log('  v1 status', alt.s);
    iaps.b = alt.b; iaps.s = alt.s;
  }
  const arr = iaps.b.data || [];
  console.log('  count:', arr.length);
  for (const i of arr) {
    console.log(`  - id=${i.id} productId=${i.attributes?.productId} type=${i.attributes?.inAppPurchaseType} state=${i.attributes?.state}`);
  }

  // For each IAP, get price schedule and localizations
  for (const i of arr) {
    console.log(`\n--- IAP ${i.attributes?.productId} (${i.id}) ---`);

    // Localizations
    const lRes = await asc('GET', `/v2/inAppPurchases/${i.id}/inAppPurchaseLocalizations`);
    console.log('  loc status:', lRes.s, 'count:', lRes.b.data?.length);
    for (const l of (lRes.b.data || [])) {
      console.log(`    locId=${l.id} locale=${l.attributes?.locale} name="${l.attributes?.name}" state=${l.attributes?.state}`);
      console.log(`      desc="${(l.attributes?.description||'').slice(0,80)}"`);
    }

    // Price schedule
    const ps = await asc('GET', `/v2/inAppPurchases/${i.id}/iapPriceSchedule?include=manualPrices,manualPrices.inAppPurchasePricePoint`);
    console.log('  priceSchedule status:', ps.s);
    if (ps.s === 200) {
      const prices = (ps.b.included || []).filter(x => x.type === 'inAppPurchasePrices');
      const points = (ps.b.included || []).filter(x => x.type === 'inAppPurchasePricePoints');
      console.log('    manualPrices:', prices.length, 'pricePoints:', points.length);
      for (const p of prices) {
        const ppId = p.relationships?.inAppPurchasePricePoint?.data?.id;
        const pp = points.find(x => x.id === ppId);
        console.log(`    pr ${p.id} → pp ${ppId} customer=${pp?.attributes?.customerPrice} ${pp?.attributes?.customerCurrency}`);
      }
      if (ps.b.data) {
        console.log('    schedule id:', ps.b.data.id, 'attrs:', JSON.stringify(ps.b.data.attributes||{}));
      }
    } else {
      console.log('    body:', JSON.stringify(ps.b).slice(0,300));
    }

    // Price points for USA baseline (each IAP has its own price point catalog)
    const ppList = await asc('GET', `/v2/inAppPurchasePricePoints?filter[inAppPurchaseV2]=${i.id}&filter[territory]=USA&limit=200`);
    console.log('  USA pricePoints:', ppList.s, 'count:', ppList.b.data?.length);
    const pts = (ppList.b.data || []).map(p => ({ id: p.id, price: parseFloat(p.attributes?.customerPrice), cur: p.attributes?.customerCurrency }))
      .sort((a,b) => a.price - b.price);
    // show some pricePoints for 0.99, 1.99, 2.99, 3.99, 6.99
    const targets = [0.99, 1.99, 2.99, 3.99, 6.99];
    for (const t of targets) {
      const match = pts.find(p => Math.abs(p.price - t) < 0.001);
      console.log(`    $${t} → ${match ? match.id : 'NOT FOUND'}`);
    }
  }

  console.log('\n=== ASC: list apps under issuer (for review phone reuse) ===');
  const apps = await asc('GET', `/v1/apps?limit=200&fields[apps]=name,bundleId`);
  console.log('  apps status:', apps.s, 'count:', apps.b.data?.length);
  for (const a of (apps.b.data || [])) {
    console.log(`    - ${a.id} ${a.attributes?.name} (${a.attributes?.bundleId})`);
  }

  console.log('\n=== Play: list in-app products ===');
  const pl = await play('GET', `/androidpublisher/v3/applications/${PKG}/inappproducts?maxResults=50`);
  console.log('  status:', pl.s);
  if (pl.s === 200) {
    const items = pl.b.inappproduct || pl.b.inAppProduct || pl.b.inappProducts || pl.b.items || [];
    console.log('  count:', items.length);
    for (const it of items) {
      console.log(`  - sku=${it.sku} status=${it.status} defaultPrice=${it.defaultPrice?.priceMicros} ${it.defaultPrice?.currency}`);
      const listings = it.listings || {};
      for (const [lang, lo] of Object.entries(listings)) {
        console.log(`      ${lang}: title="${lo.title}" desc="${(lo.description||'').slice(0,60)}"`);
      }
      // count prices (regions)
      const regionCount = Object.keys(it.prices || {}).length;
      console.log(`      regions with price: ${regionCount}`);
    }
  } else {
    console.log('  body:', JSON.stringify(pl.b).slice(0,400));
  }
}

main().catch(e => console.error('fatal', e));

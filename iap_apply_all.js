// Apply IAP prices + localizations to ASC, review phone to ASC, and update Play IAP listings.
// Usage: node iap_apply_all.js
//
// Boundaries: does NOT submit for review, does NOT upload builds, does NOT change Play track.

const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

// ─── Auth ──────────────────────────────────────────────────────────────────
const ASC_KEY_ID = 'K8CBHMQ2S8';
const ASC_ISSUER = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const ASC_P8 = fs.readFileSync('C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8', 'utf8').trim();
const ASC_APP_ID = '6831935786';

const SA = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PKG = 'com.cytbilisim.frostborn';

// ─── IAP specs ─────────────────────────────────────────────────────────────
// ASC caps description at 55 chars; keep Play consistent for parity.
// Price points discovered empirically: tier codes map per IAP, but base64-encoded format is deterministic.
const IAPS = [
  {
    id: 'remove_ads',
    ascId: '6831936237',
    priceUsd: 3.99,
    tier: '10049', // $3.99
    en: { name: 'Remove Ads',       description: 'Permanently remove banner and interstitial ads.' },
    tr: { name: 'Reklamları Kaldır', description: 'Banner ve geçiş reklamlarını kalıcı olarak kaldır.' },
  },
  {
    id: 'starter_pack',
    ascId: '6831936238',
    priceUsd: 1.99,
    tier: '10023', // $1.99
    en: { name: 'Starter Pack',     description: '1000 coins + extra worker + Remove Ads.' },
    tr: { name: 'Başlangıç Paketi', description: '1000 jeton + ekstra işçi + Reklamsız.' },
  },
  {
    id: 'coins_small',
    ascId: '6831936270',
    priceUsd: 0.99,
    tier: '10010', // $0.99
    en: { name: '250 Coins',  description: 'Add 250 coins to your stash.' },
    tr: { name: '250 Jeton',  description: 'Hazine kutuna 250 jeton ekle.' },
  },
  {
    id: 'coins_medium',
    ascId: '6831936296',
    priceUsd: 2.99,
    tier: '10036', // $2.99
    en: { name: '900 Coins',  description: '900 coins — mid-game boost. Great value.' },
    tr: { name: '900 Jeton',  description: '900 jeton — orta oyun atılımı. Harika değer.' },
  },
  {
    id: 'coins_large',
    ascId: '6831936149',
    priceUsd: 6.99,
    tier: '10088', // $6.99
    en: { name: '2500 Coins', description: '2500 coins — our biggest pack. Best value.' },
    tr: { name: '2500 Jeton', description: '2500 jeton — en büyük paket. En iyi değer.' },
  },
];

const REVIEW_CONTACT = {
  firstName: 'Ibrahim',
  lastName:  'Cakmak',
  email:     'ickmk1@gmail.com',
  phone:     '+905322822710',
};

// ─── HTTP helper ───────────────────────────────────────────────────────────
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
    iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', exp: n+3600, iat: n
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
    'Authorization': 'Bearer '+tok, 'Content-Type': 'application/json',
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
    'Authorization': 'Bearer '+ascJwt(), 'Content-Type': 'application/json',
    ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
  }, data);
}

function log(ok, label, extra) {
  console.log(ok ? `  OK  ${label}` : `  ERR ${label}`, extra||'');
}

// ASC pricePoint IDs are base64url-encoded JSON: {"s":<iapId>,"t":"USA","p":"<tier>"}
function pricePointId(iapId, tier) {
  const payload = JSON.stringify({ s: iapId, t: 'USA', p: tier });
  return Buffer.from(payload).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function main() {
  console.log('=== ASC: update IAP localizations + price schedules ===');

  for (const spec of IAPS) {
    console.log(`\n--- ${spec.id} (${spec.ascId}) ---`);
    // 1) Localizations (max description = 55 chars)
    for (const lang of ['en-US', 'tr']) {
      const txt = (lang === 'en-US') ? spec.en : spec.tr;
      if (txt.description.length > 55) {
        console.log(`  WARN ${lang} description is ${txt.description.length} chars (>55) — will fail`);
      }
    }
    const locRes = await asc('GET', `/v2/inAppPurchases/${spec.ascId}/inAppPurchaseLocalizations`);
    const locs = locRes.b.data || [];
    for (const lang of ['en-US', 'tr']) {
      const txt = (lang === 'en-US') ? spec.en : spec.tr;
      const existing = locs.find(l => l.attributes?.locale === lang);
      if (existing) {
        const r = await asc('PATCH', `/v1/inAppPurchaseLocalizations/${existing.id}`, {
          data: { type: 'inAppPurchaseLocalizations', id: existing.id, attributes: { name: txt.name, description: txt.description } }
        });
        log(r.s === 200, `${lang} loc PATCH`, `(name="${txt.name}" desc=${txt.description.length}c, HTTP ${r.s})`);
        if (r.s >= 300) console.log('     err:', JSON.stringify(r.b).slice(0,400));
      } else {
        const r = await asc('POST', `/v1/inAppPurchaseLocalizations`, {
          data: {
            type: 'inAppPurchaseLocalizations',
            attributes: { locale: lang, name: txt.name, description: txt.description },
            relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: spec.ascId } } }
          }
        });
        log(r.s === 201, `${lang} loc POST`, `HTTP ${r.s}`);
        if (r.s >= 300) console.log('     err:', JSON.stringify(r.b).slice(0,400));
      }
    }

    // 2) Price schedule — note the id must be a $-prefixed local id for inline creation
    const ppId = pricePointId(spec.ascId, spec.tier);
    const localId = '${priceTier-' + spec.tier + '}';
    const psBody = {
      data: {
        type: 'inAppPurchasePriceSchedules',
        relationships: {
          inAppPurchase: { data: { type: 'inAppPurchases', id: spec.ascId } },
          baseTerritory: { data: { type: 'territories', id: 'USA' } },
          manualPrices: { data: [{ type: 'inAppPurchasePrices', id: localId }] },
        }
      },
      included: [{
        type: 'inAppPurchasePrices',
        id: localId,
        attributes: { startDate: null },
        relationships: {
          inAppPurchaseV2: { data: { type: 'inAppPurchases', id: spec.ascId } },
          inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: ppId } }
        }
      }]
    };
    const psRes = await asc('POST', `/v1/inAppPurchasePriceSchedules`, psBody);
    log(psRes.s < 300, `priceSchedule POST $${spec.priceUsd} (pp=${ppId.slice(0,40)}...)`, `HTTP ${psRes.s}`);
    if (psRes.s >= 300) {
      console.log('     err:', JSON.stringify(psRes.b).slice(0,700));
    }
  }

  // ─── ASC: Review contact phone ──────────────────────────────────────────
  console.log('\n=== ASC: update App Review contact ===');
  const vRes = await asc('GET', `/v1/apps/${ASC_APP_ID}/appStoreVersions?limit=10`);
  const versions = (vRes.b.data || []).sort((a,b) => (b.attributes?.createdDate||'').localeCompare(a.attributes?.createdDate||''));
  const v = versions.find(v => v.attributes?.platform === 'IOS') || versions[0];
  if (!v) {
    console.log('  no versions found, skipping review detail');
  } else {
    const rd = await asc('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`);
    const reviewAttrs = {
      contactFirstName: REVIEW_CONTACT.firstName,
      contactLastName:  REVIEW_CONTACT.lastName,
      contactEmail:     REVIEW_CONTACT.email,
      contactPhone:     REVIEW_CONTACT.phone,
    };
    if (rd.s === 200 && rd.b.data) {
      const rId = rd.b.data.id;
      const pRes = await asc('PATCH', `/v1/appStoreReviewDetails/${rId}`, {
        data: { type: 'appStoreReviewDetails', id: rId, attributes: reviewAttrs }
      });
      log(pRes.s === 200, `reviewDetail PATCH v${v.attributes?.versionString}`, `phone=${REVIEW_CONTACT.phone} HTTP ${pRes.s}`);
      if (pRes.s >= 300) console.log('     err:', JSON.stringify(pRes.b).slice(0,300));
    } else {
      const pRes = await asc('POST', `/v1/appStoreReviewDetails`, {
        data: {
          type: 'appStoreReviewDetails',
          attributes: reviewAttrs,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } }
        }
      });
      log(pRes.s === 201, `reviewDetail POST v${v.attributes?.versionString}`, `HTTP ${pRes.s}`);
    }
  }

  // ─── Play: update IAP listings ─────────────────────────────────────────
  console.log('\n=== Play: batchUpdate one-time product listings ===');
  // Fetch current regionsVersion from one of the products (identical across the app).
  const sample = await play('GET', `/androidpublisher/v3/applications/${PKG}/oneTimeProducts/${IAPS[0].id}`);
  const regionsVersion = sample.b?.regionsVersion || { version: '2026/01' };
  console.log(' regionsVersion:', JSON.stringify(regionsVersion));

  const requests = IAPS.map(spec => ({
    oneTimeProduct: {
      packageName: PKG,
      productId: spec.id,
      listings: [
        { languageCode: 'en-US', title: spec.en.name, description: spec.en.description },
        { languageCode: 'tr-TR', title: spec.tr.name, description: spec.tr.description },
      ],
    },
    updateMask: 'listings',
    regionsVersion,
    latencyTolerance: 'PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT'
  }));
  const batchRes = await play('POST', `/androidpublisher/v3/applications/${PKG}/oneTimeProducts:batchUpdate`, { requests });
  console.log(' batchUpdate status:', batchRes.s);
  if (batchRes.s === 200) {
    const updated = batchRes.b.oneTimeProducts || [];
    console.log(' updated count:', updated.length);
    for (const p of updated) {
      console.log(`   OK  ${p.productId}  listings=${p.listings?.length}`);
    }
  } else {
    console.log(' err body:', JSON.stringify(batchRes.b).slice(0,1200));
  }

  console.log('\n=== Done ===');
}

main().catch(e => console.error('fatal', e));

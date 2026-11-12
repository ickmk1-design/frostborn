/**
 * Run IAPs + data safety + ASC content rights (no AAB upload).
 */
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const SA  = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PKG = 'com.cytbilisim.frostborn';

const ASC_KEY_ID = 'K8CBHMQ2S8';
const ASC_ISSUER = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const ASC_P8     = fs.readFileSync('C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8', 'utf8').trim();
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
        resolve({ s: x.statusCode, b: json });
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
function asc(method, path, body) {
  const data = body ? JSON.stringify(body) : null;
  return httpReq(method, 'api.appstoreconnect.apple.com', path, {
    'Authorization': 'Bearer '+ascJwt(),
    'Content-Type': 'application/json',
    ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
  }, data);
}

function log(ok, label, extra) {
  console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}`, extra||'');
}

async function main() {

  // ── 1. Play: in-app products (upsert via PATCH allowMissing) ─────────────
  console.log('\n=== Play: in-app products ===');
  const IAPS = [
    { productId: PKG+'.remove_ads',   title: 'Remove Ads',   description: 'Remove all ads permanently.',    priceMicros: '3990000' },
    { productId: PKG+'.starter_pack', title: 'Starter Pack', description: 'Coins and essential resources.', priceMicros: '1990000' },
    { productId: PKG+'.coins_small',  title: '250 Coins',    description: '250 coins for upgrades.',        priceMicros:  '990000' },
    { productId: PKG+'.coins_medium', title: '900 Coins',    description: '900 coins, great value.',        priceMicros: '2990000' },
    { productId: PKG+'.coins_large',  title: '2500 Coins',   description: '2500 coins ultimate bundle.',    priceMicros: '6990000' },
  ];
  for (const iap of IAPS) {
    const sku = iap.productId;
    const body = {
      packageName: PKG,
      sku,
      status: 'active',
      defaultLanguage: 'en-US',
      listings: { 'en-US': { title: iap.title, description: iap.description } },
      defaultPrice: { currency: 'USD', priceMicros: iap.priceMicros },
      prices: { US: { currency: 'USD', priceMicros: iap.priceMicros } },
    };
    const getR = await play('GET', `/androidpublisher/v3/applications/${PKG}/inappproducts/${sku}`);
    let r;
    if (getR.s === 404) {
      r = await play('POST', `/androidpublisher/v3/applications/${PKG}/inappproducts`, body);
    } else {
      r = await play('PATCH', `/androidpublisher/v3/applications/${PKG}/inappproducts/${sku}`, body);
    }
    log(r.s < 300, iap.productId.split('.').pop(), `HTTP ${r.s} (${getR.s === 404 ? 'created' : 'updated'})`);
    if (r.s >= 300) console.error('    ', JSON.stringify(r.b).substring(0,300));
  }

  // ── 2. Play: data safety ─────────────────────────────────────────────────
  console.log('\n=== Play: data safety ===');
  const dsBody = {
    safetyLabels: {
      dataCollectionAndUse: [
        {
          dataType: 'ADVERTISING_ID',
          purposesOfDataUse: ['ADVERTISING'],
          isRequired: false,
          isUserControlled: false,
          isEphemeral: false,
          collectedByFirstParty: true,
          sharedWithThirdParties: [{ reasonForSharing: 'ADVERTISING', obligatory: false }],
        }
      ],
      securityPractices: {
        encryptionInTransit: true,
        providesWayToRequestDeletion: false,
        isAuditedByThirdParty: false,
        hasStandardsBody: false,
      },
    }
  };
  const dsR = await play('POST',
    `/androidpublisher/v3/applications/${PKG}/dataSafety`, dsBody);
  log(dsR.s < 300, 'data safety', `HTTP ${dsR.s}`);
  if (dsR.s >= 300) {
    console.error('  ', JSON.stringify(dsR.b).substring(0,500));
    // Try GET to understand current state / expected schema
    const dsGet = await play('GET', `/androidpublisher/v3/applications/${PKG}/dataSafety`);
    console.log('  GET data safety:', dsGet.s, JSON.stringify(dsGet.b).substring(0,500));
  }

  // ── 3. ASC: content rights ───────────────────────────────────────────────
  console.log('\n=== ASC: content rights ===');
  const ascR = await asc('PATCH', `/v1/apps/${ASC_APP_ID}`, {
    data: {
      type: 'apps',
      id: ASC_APP_ID,
      attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' }
    }
  });
  log(ascR.s < 300, 'content rights declaration', `HTTP ${ascR.s}`);
  if (ascR.s >= 300) {
    console.error('  ', JSON.stringify(ascR.b).substring(0,400));
    const appGet = await asc('GET', `/v1/apps/${ASC_APP_ID}?fields[apps]=name,contentRightsDeclaration`);
    console.log('  App attrs:', JSON.stringify(appGet.b.data?.attributes));
  }

  console.log('\n=== Done ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

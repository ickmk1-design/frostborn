const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID  = 'K8CBHMQ2S8';
const ISSUER  = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const APP_ID  = '6831935786';
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
    const headers = { Authorization: 'Bearer ' + jwt, 'Content-Type': 'application/json' };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request({ hostname: 'api.appstoreconnect.apple.com', path, method, headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            (parsed.errors || []).slice(0,2).forEach(e => console.error('  [' + res.statusCode + '] ' + e.code + ': ' + (e.detail || e.title)));
          }
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) { resolve({ status: res.statusCode, body: {} }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  // Fix categories
  console.log('--- Fix Categories ---');
  const catRes = await api('PATCH', '/v1/appInfos/' + APP_INFO_ID, {
    data: {
      type: 'appInfos',
      id: APP_INFO_ID,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: 'GAMES' } },
        primarySubcategoryOne: { data: { type: 'appCategories', id: 'GAMES_STRATEGY' } },
        primarySubcategoryTwo: { data: { type: 'appCategories', id: 'GAMES_SIMULATION' } }
      }
    }
  });
  console.log('Categories:', catRes.status === 200 ? 'OK' : 'Error ' + catRes.status);

  // Fix Review Info
  console.log('\n--- Fix Review Info ---');
  const ariRes = await api('GET', '/v1/appStoreVersions/' + VERSION_ID + '/appStoreReviewDetail');
  const reviewId = ariRes.body.data && ariRes.body.data.id;
  const reviewAttrs = {
    contactFirstName: 'Mert',
    contactLastName: 'Ozkan',
    contactEmail: 'ickmk1@gmail.com',
    contactPhone: '+905000000000',
    notes: 'Free base-building survival game. IAPs available from main menu shop: Remove Ads ($1.99), Starter Pack ($2.99), 250/900/2500 Coins. AdMob ads shown between rounds. No login required. Settings > Restore Purchases to restore.',
    demoAccountRequired: false
  };

  if (reviewId) {
    const rPatch = await api('PATCH', '/v1/appStoreReviewDetails/' + reviewId, {
      data: { type: 'appStoreReviewDetails', id: reviewId, attributes: reviewAttrs }
    });
    console.log('Review info PATCH:', rPatch.status === 200 ? 'OK' : 'Error ' + rPatch.status);
  }

  // Export compliance
  console.log('\n--- Export Compliance ---');
  const newEncRes = await api('POST', '/v1/appEncryptionDeclarations', {
    data: {
      type: 'appEncryptionDeclarations',
      attributes: {
        usesEncryption: false,
        exempt: true,
        containsProprietaryCryptography: false,
        containsThirdPartyCryptography: false,
        availableOnFrenchStore: true
      },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } }
    }
  });
  console.log('Encryption decl:', newEncRes.status === 201 ? 'OK' : 'Error ' + newEncRes.status);
  if (newEncRes.status === 201 && newEncRes.body.data) {
    const edId = newEncRes.body.data.id;
    const linkRes = await api('PATCH', '/v1/appStoreVersions/' + VERSION_ID + '/relationships/appEncryptionDeclaration', {
      data: { type: 'appEncryptionDeclarations', id: edId }
    });
    console.log('Link encryption to version:', linkRes.status < 300 ? 'OK' : 'Error ' + linkRes.status);
  }

  // Content rights
  console.log('\n--- Content Rights ---');
  const crRes = await api('PATCH', '/v1/appInfos/' + APP_INFO_ID, {
    data: { type: 'appInfos', id: APP_INFO_ID, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } }
  });
  console.log('Content rights:', crRes.status === 200 ? 'OK' : 'Error ' + crRes.status);

  console.log('\n=== FIX COMPLETE ===');
}
main().catch(console.error);

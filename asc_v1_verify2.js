// Quick price + availability verification.
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
  // Various price endpoints
  for (const p of [
    `/v1/apps/${APP_ID}/appPriceSchedule`,
    `/v1/apps/${APP_ID}/appPriceSchedule?include=manualPrices,baseTerritory`,
    `/v1/apps/${APP_ID}/appPriceSchedule?include=manualPrices`,
    `/v3/apps/${APP_ID}/appPriceSchedule`,
  ]) {
    const r = await api('GET', p);
    console.log(p, '→', r.status, r.body.errors?.[0]?.code || '');
    if (r.status === 200) {
      console.log(' data:', JSON.stringify(r.body.data).slice(0, 300));
      if (r.body.included) {
        console.log(' included types:', [...new Set(r.body.included.map(i => i.type))].join(','));
        r.body.included.slice(0,5).forEach(i => console.log('  -', i.type, i.id, JSON.stringify(i.attributes).slice(0,120)));
      }
    }
  }

  // Availability endpoints
  console.log('\n--- availability ---');
  for (const p of [
    `/v2/apps/${APP_ID}/appAvailabilityV2`,
    `/v1/apps/${APP_ID}/appAvailabilityV2`,
    `/v2/apps/${APP_ID}/appAvailability`,
    `/v1/apps/${APP_ID}/appAvailability`,
  ]) {
    const r = await api('GET', p);
    console.log(p, '→', r.status, r.body.errors?.[0]?.code || '');
    if (r.status === 200) {
      console.log(' data:', JSON.stringify(r.body.data).slice(0, 300));
    }
  }
}

main().catch(e => console.error(e));

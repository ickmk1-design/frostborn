// Set App Store Connect Marketing URL for both en-US and tr version localizations.
// Usage: node asc_set_marketing_url.js
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID   = 'K8CBHMQ2S8';
const ISSUER   = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const APP_ID   = '6831935786';
const MARKETING_URL = 'https://cytbilisim.com';

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
    const req = https.request(
      { hostname: 'api.appstoreconnect.apple.com', path, method, headers },
      (res) => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            if (res.statusCode >= 400) {
              console.error(`API ${res.statusCode} ${method} ${path}`);
              console.error(JSON.stringify(parsed, null, 2).slice(0, 800));
            }
            resolve({ status: res.statusCode, body: parsed });
          } catch (e) {
            console.error('Parse error:', data.slice(0, 300));
            resolve({ status: res.statusCode, body: {} });
          }
        });
      },
    );
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

(async () => {
  // Find the editable version (prefer PREPARE_FOR_SUBMISSION / READY_FOR_REVIEW)
  const vRes = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`);
  if (vRes.status !== 200) { console.error('Failed to list versions'); process.exit(1); }
  const versions = vRes.body.data || [];
  console.log('Versions:', versions.map(v => `${v.attributes?.versionString} (${v.attributes?.appStoreState})`).join(', '));

  const editable = versions.find(v => ['PREPARE_FOR_SUBMISSION','WAITING_FOR_REVIEW','READY_FOR_REVIEW','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED'].includes(v.attributes?.appStoreState))
    || versions.find(v => v.attributes?.appStoreState !== 'READY_FOR_SALE')
    || versions[0];
  if (!editable) { console.error('No editable version found'); process.exit(1); }
  console.log(`Using version ${editable.attributes.versionString} (${editable.attributes.appStoreState}) id=${editable.id}`);

  const vlRes = await api('GET', `/v1/appStoreVersions/${editable.id}/appStoreVersionLocalizations`);
  if (vlRes.status !== 200) { console.error('Failed to list version localizations'); process.exit(1); }
  const locs = vlRes.body.data || [];
  console.log('Localizations:', locs.map(l => l.attributes?.locale).join(', '));

  for (const loc of locs) {
    const r = await api('PATCH', `/v1/appStoreVersionLocalizations/${loc.id}`, {
      data: { type: 'appStoreVersionLocalizations', id: loc.id, attributes: { marketingUrl: MARKETING_URL } }
    });
    console.log(`  ${loc.attributes?.locale} marketingUrl -> ${MARKETING_URL}: ${r.status === 200 ? 'OK' : 'ERR '+r.status}`);
  }

  console.log('\nDone.');
})().catch(e => { console.error('Fatal:', e); process.exit(1); });

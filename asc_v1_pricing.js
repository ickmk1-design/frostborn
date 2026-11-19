// Round 3: pricing + territory availability + copyright-alone + marketing URL cleanup.
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID   = 'K8CBHMQ2S8';
const ISSUER   = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const APP_ID   = '6831935786';
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
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            console.error(`    [HTTP ${res.statusCode}] ${method} ${path}`);
            (parsed.errors || []).slice(0,6).forEach(e => console.error(`      - ${e.code}: ${(e.detail || e.title || '').slice(0,300)}`));
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
  // --- 1) Copyright alone (strip usesNonExemptEncryption) ---
  console.log('--- version copyright alone ---');
  const vp = await api('PATCH', `/v1/appStoreVersions/${VERSION_ID}`, {
    data: { type: 'appStoreVersions', id: VERSION_ID, attributes: { copyright: '2026 CYT Bilişim' } }
  });
  console.log(' copyright:', vp.status === 200 ? 'OK 200' : 'Error ' + vp.status);

  // --- 2) Pricing — find free pricePoint and use v3 /appPriceSchedules ---
  console.log('\n--- find free USA pricePoint ---');
  const ppRes = await api('GET', `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=200`);
  if (ppRes.status !== 200) { console.log(' pricePoints err:', ppRes.status); }
  const allPoints = ppRes.body.data || [];
  const freePoint = allPoints.find(p => parseFloat(p.attributes?.customerPrice) === 0);
  console.log(' free pricePoint:', freePoint?.id, 'customerPrice=', freePoint?.attributes?.customerPrice);

  if (freePoint) {
    // Try v1 appPriceSchedules with appPricePoint
    console.log('\n--- POST /v1/appPriceSchedules with appPricePoint ---');
    const schedRes = await api('POST', `/v1/appPriceSchedules`, {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
          baseTerritory: { data: { type: 'territories', id: 'USA' } },
          manualPrices: { data: [{ type: 'appPrices', id: 'new1' }] }
        },
        // included to actually carry the pricePoint details
      },
      included: [{
        type: 'appPrices',
        id: 'new1',
        attributes: { startDate: null },
        relationships: {
          appPricePoint: { data: { type: 'appPricePoints', id: freePoint.id } }
        }
      }]
    });
    console.log(' POST v1 appPriceSchedules:', schedRes.status);
  }

  // --- 3) Check territory availability request types ---
  console.log('\n--- GET existing territoryAvailabilities ---');
  const taRes = await api('GET', `/v2/apps/${APP_ID}/appAvailability`);
  console.log(' v2 appAvailability status:', taRes.status);
  if (taRes.status === 200) {
    console.log(' current:', JSON.stringify(taRes.body.data?.attributes).slice(0, 400));
    const ta = (taRes.body.included || []).filter(i => i.type === 'territoryAvailabilities');
    console.log(' territoryAvailabilities count:', ta.length);
  }

  // Fetch all territories
  console.log('\n--- fetch territories (all) ---');
  const terrRes = await api('GET', `/v1/territories?limit=200`);
  console.log(' territories count:', (terrRes.body.data || []).length);

  // Build a request to make app available in ALL
  if (terrRes.status === 200) {
    const territories = (terrRes.body.data || []).map(t => t.id);
    console.log(' sample territories:', territories.slice(0, 10).join(','));
    // Build availability v2 request  — via appAvailabilityV2 create
    console.log('\n--- POST v2 appAvailabilities with all territoryAvailabilities ---');
    const taReqs = territories.map(id => ({
      type: 'territoryAvailabilities',
      id: `${APP_ID}_${id}`,
      attributes: { available: true, releaseDate: null }
    }));
    const createRes = await api('POST', `/v2/appAvailabilities`, {
      data: {
        type: 'appAvailabilities',
        attributes: { availableInNewTerritories: true },
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
          territoryAvailabilities: { data: taReqs.map(t => ({ type: 'territoryAvailabilities', id: t.id })) }
        }
      },
      included: taReqs
    });
    console.log(' create v2:', createRes.status);
  }

  console.log('\n--- done ---');
}

main().catch(e => { console.error(e); process.exit(1); });

// Round 4: pricing + territories with correct local-id syntax.
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
            (parsed.errors || []).slice(0,8).forEach(e => console.error(`      - ${e.code}: ${(e.detail || e.title || '').slice(0,300)}`));
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
  // --- 1) Pricing ---
  const freePointId = 'eyJzIjoiNjgzMTkzNTc4NiIsInQiOiJVU0EiLCJwIjoiMTAwMDAifQ';
  console.log('--- POST /v1/appPriceSchedules (free, USA base) ---');
  const schedRes = await api('POST', `/v1/appPriceSchedules`, {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'appPrices', id: '${free-price}' }] }
      }
    },
    included: [{
      type: 'appPrices',
      id: '${free-price}',
      attributes: { startDate: null },
      relationships: {
        appPricePoint: { data: { type: 'appPricePoints', id: freePointId } }
      }
    }]
  });
  console.log(' POST pricing:', schedRes.status === 201 ? 'OK 201 (free, USA base)' : 'Error ' + schedRes.status);

  // --- 2) Territories: all available ---
  console.log('\n--- fetch all territories ---');
  const terrRes = await api('GET', `/v1/territories?limit=200`);
  const territories = (terrRes.body.data || []).map(t => t.id);
  console.log(' territories:', territories.length);

  console.log('\n--- POST /v2/appAvailabilities (all territories) ---');
  const taReqs = territories.map(id => ({
    type: 'territoryAvailabilities',
    id: `\${ta-${id}}`,
    attributes: { available: true },
    relationships: {
      territory: { data: { type: 'territories', id } }
    }
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
  console.log(' create v2 appAvailabilities:', createRes.status === 201 ? 'OK 201 (all territories)' : 'Error ' + createRes.status);
}

main().catch(e => { console.error(e); process.exit(1); });

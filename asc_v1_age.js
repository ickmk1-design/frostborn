// Round 5: nail down age rating declaration + try containsAds-equivalent fields.
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID   = 'K8CBHMQ2S8';
const ISSUER   = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
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
            (parsed.errors || []).slice(0,10).forEach(e => console.error(`      - ${e.code}: ${(e.detail || e.title || '').slice(0,300)}`));
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
  // Age rating: try to also set additional attributes one at a time to discover schema
  const candidates = {
    gambling: false,
    gamblingAndContests: false,
    seventeenPlus: false,
    unrestrictedWebAccess: false,
    userGeneratedContent: false,
    loginRequired: false,
    userGeneratedContentOrInteractions: false,
    containsAds: true,
    advertisingSettings: null,
    unrestrictedWebAccess: false
  };

  for (const [k, v] of Object.entries(candidates)) {
    const r = await api('PATCH', `/v1/ageRatingDeclarations/${APP_INFO_ID}`, {
      data: { type: 'ageRatingDeclarations', id: APP_INFO_ID, attributes: { [k]: v } }
    });
    console.log(` ${k}=${v}: ${r.status}`);
  }

  // Also re-apply the main age rating one more time with a comprehensive set
  console.log('\n--- apply final age rating payload ---');
  const final = await api('PATCH', `/v1/ageRatingDeclarations/${APP_INFO_ID}`, {
    data: { type: 'ageRatingDeclarations', id: APP_INFO_ID, attributes: {
      violenceCartoonOrFantasy: 'INFREQUENT_OR_MILD',
      violenceRealistic: 'NONE',
      violenceRealisticProlongedGraphicOrSadistic: 'NONE',
      profanityOrCrudeHumor: 'NONE',
      matureOrSuggestiveThemes: 'NONE',
      sexualContentOrNudity: 'NONE',
      sexualContentGraphicAndNudity: 'NONE',
      horrorOrFearThemes: 'NONE',
      medicalOrTreatmentInformation: 'NONE',
      alcoholTobaccoOrDrugUseOrReferences: 'NONE',
      gambling: false,
      gamblingSimulated: 'NONE',
      contests: 'NONE',
      unrestrictedWebAccess: false,
      userGeneratedContent: false,
      kidsAgeBand: null,
      ageRatingOverride: 'NONE'
    } }
  });
  console.log(' final age rating:', final.status === 200 ? 'OK 200' : 'Error ' + final.status);
}

main().catch(e => console.error(e));

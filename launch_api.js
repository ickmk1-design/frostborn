/**
 * Launch API tasks — no Playwright.
 * 1. Play: upload AAB (versionCode=6) + roll out internal track + upload icon (single edit)
 * 2. Play: create/activate 5 in-app products
 * 3. Play: submit data safety
 * 4. ASC: set contentRightsDeclaration
 */
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const SA  = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
const ICON_PATH = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';
const AAB_PATH  = 'C:/Users/ickmk/Frostborn/game/android/app/build/outputs/bundle/release/app-release.aab';

const ASC_KEY_ID = 'K8CBHMQ2S8';
const ASC_ISSUER = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const ASC_P8     = fs.readFileSync('C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8', 'utf8').trim();
const ASC_APP_ID = '6831935786';

// ── HTTP helper ───────────────────────────────────────────────────────────────
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

// ── Play auth ─────────────────────────────────────────────────────────────────
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
async function playBinary(path, buf, mimeType) {
  const tok = await playTok();
  return httpReq('POST', 'androidpublisher.googleapis.com', path, {
    'Authorization': 'Bearer '+tok,
    'Content-Type': mimeType,
    'Content-Length': buf.length
  }, buf);
}

// ── ASC auth ──────────────────────────────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════════════════
async function main() {

  // ── 1. Play: single edit — AAB upload + track rollout + icon ─────────────
  console.log('\n=== Play: edit (AAB + track + icon) ===');
  const editR = await play('POST', `/androidpublisher/v3/applications/${PKG}/edits`, {});
  log(editR.s < 300, 'create edit', `HTTP ${editR.s}`);
  if (editR.s >= 300) { console.error(JSON.stringify(editR.b)); process.exit(1); }
  const eid = editR.b.id;
  console.log('  Edit ID:', eid);

  // 1a. Upload AAB (versionCode=6, targetSdk=35)
  console.log('  Uploading AAB (~300 MB)…');
  const aabBuf = fs.readFileSync(AAB_PATH);
  const aabR = await playBinary(
    `/upload/androidpublisher/v3/applications/${PKG}/edits/${eid}/bundles?uploadType=media`,
    aabBuf, 'application/octet-stream');
  log(aabR.s < 300, 'upload AAB', `HTTP ${aabR.s}`);
  if (aabR.s >= 300) {
    console.error('  ', JSON.stringify(aabR.b).substring(0,400));
    process.exit(1);
  }
  console.log('  versionCode:', aabR.b.versionCode);

  // 1b. Roll out internal track (status: completed = fully rolled out)
  const trackR = await play('PUT',
    `/androidpublisher/v3/applications/${PKG}/edits/${eid}/tracks/internal`,
    { track: 'internal', releases: [{ versionCodes: ['6'], status: 'completed' }] });
  log(trackR.s < 300, 'track → completed', `HTTP ${trackR.s}`);
  if (trackR.s >= 300) console.error('  ', JSON.stringify(trackR.b).substring(0,300));

  // 1c. Upload 512x512 icon
  const iconBuf = fs.readFileSync(ICON_PATH);
  const iconR = await playBinary(
    `/upload/androidpublisher/v3/applications/${PKG}/edits/${eid}/listings/en-US/icon?uploadType=media`,
    iconBuf, 'image/png');
  log(iconR.s < 300, 'upload icon', `HTTP ${iconR.s}`);
  if (iconR.s >= 300) console.error('  ', JSON.stringify(iconR.b).substring(0,300));
  else console.log('  sha1:', iconR.b.image?.sha1);

  // 1d. Commit
  const commitR = await play('POST',
    `/androidpublisher/v3/applications/${PKG}/edits/${eid}:commit`, {});
  log(commitR.s < 300, 'commit edit', `HTTP ${commitR.s}`);
  if (commitR.s >= 300) console.error('  ', JSON.stringify(commitR.b).substring(0,400));

  // ── 2. Play: in-app products ───────────────────────────────────────────────
  console.log('\n=== Play: in-app products ===');
  const IAPS = [
    { productId: PKG+'.remove_ads',   title: 'Remove Ads',   description: 'Remove all ads permanently.',    priceMicros: '3990000' },
    { productId: PKG+'.starter_pack', title: 'Starter Pack', description: 'Coins and essential resources.', priceMicros: '1990000' },
    { productId: PKG+'.coins_small',  title: '250 Coins',    description: '250 coins for upgrades.',        priceMicros:  '990000' },
    { productId: PKG+'.coins_medium', title: '900 Coins',    description: '900 coins, great value.',        priceMicros: '2990000' },
    { productId: PKG+'.coins_large',  title: '2500 Coins',   description: '2500 coins ultimate bundle.',    priceMicros: '6990000' },
  ];
  for (const iap of IAPS) {
    // PATCH with allowMissing=true acts as upsert (create if not exists, update if exists)
    const body = {
      packageName: PKG,
      productId: iap.productId,
      status: 'ACTIVE',
      listings: { 'en-US': { title: iap.title, description: iap.description } },
      prices: { USD: { priceMicros: iap.priceMicros, currency: 'USD' } },
    };
    const r = await play('PATCH',
      `/androidpublisher/v3/applications/${PKG}/inappproducts/${iap.productId}?allowMissing=true`,
      body);
    log(r.s < 300, iap.productId.split('.').pop(), `HTTP ${r.s}`);
    if (r.s >= 300) console.error('    ', JSON.stringify(r.b).substring(0,200));
  }

  // ── 3. Play: data safety ───────────────────────────────────────────────────
  // Frostborn uses AdMob → advertising ID collected & shared; no other personal data.
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
    console.error('  ', JSON.stringify(dsR.b).substring(0,400));
    const dsGet = await play('GET', `/androidpublisher/v3/applications/${PKG}/dataSafety`);
    console.log('  GET data safety:', dsGet.s, JSON.stringify(dsGet.b).substring(0,500));
  }

  // ── 4. ASC: content rights ────────────────────────────────────────────────
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
    const appGet = await asc('GET', `/v1/apps/${ASC_APP_ID}?fields[apps]=name,contentRightsDeclaration,primaryLocale`);
    console.log('  App attrs:', JSON.stringify(appGet.b.data?.attributes));
  }

  console.log('\n=== All done ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

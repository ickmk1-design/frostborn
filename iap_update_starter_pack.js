// Update ONLY starter_pack IAP descriptions on ASC + Google Play.
// Does NOT change prices or product IDs. Does NOT touch other IAPs.
// Does NOT upload builds or submit for review.

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

// ─── New copy ──────────────────────────────────────────────────────────────
// ASC caps description at 55 chars — use the short form.
const ASC_EN = '1000 coins + Extra Worker + Ads removed';         // 39 chars
const ASC_TR = '1000 jeton + Ekstra İşçi + Reklamsız';            // 36 chars

// Play allows 200 chars — use the long, benefit-forward form.
const PLAY_EN = 'Jump-start your camp: 1000 coins, +1 permanent worker per level, and ads removed forever.';
const PLAY_TR = 'Kampını hızlandır: 1000 jeton, her bölüm için kalıcı +1 işçi ve reklamsız oyun.';

const NAME_EN = 'Starter Pack';
const NAME_TR = 'Başlangıç Paketi';

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

async function main() {
  console.log('=== Lengths ===');
  console.log(' ASC EN =', ASC_EN.length, '/55  ->', JSON.stringify(ASC_EN));
  console.log(' ASC TR =', ASC_TR.length, '/55  ->', JSON.stringify(ASC_TR));
  console.log(' PlayEN =', PLAY_EN.length,'/200 ->', JSON.stringify(PLAY_EN));
  console.log(' PlayTR =', PLAY_TR.length,'/200 ->', JSON.stringify(PLAY_TR));

  // ─── ASC: discover starter_pack ─────────────────────────────────────────
  console.log('\n=== ASC: find starter_pack InAppPurchaseV2 ===');
  // v2 list requires app-scoped URL per docs
  let iapListRes = await asc('GET', `/v2/inAppPurchases?filter[app]=${ASC_APP_ID}&limit=200`);
  console.log(' try1 /v2/inAppPurchases?filter[app]= HTTP', iapListRes.s, ' count=', (iapListRes.b.data||[]).length);
  if (iapListRes.s >= 300) console.log('   err:', JSON.stringify(iapListRes.b).slice(0,400));
  let data = iapListRes.b.data || [];
  if (data.length === 0) {
    iapListRes = await asc('GET', `/v1/apps/${ASC_APP_ID}/inAppPurchasesV2?limit=200`);
    console.log(' try2 /v1/apps/{id}/inAppPurchasesV2 HTTP', iapListRes.s, ' count=', (iapListRes.b.data||[]).length);
    if (iapListRes.s >= 300) console.log('   err:', JSON.stringify(iapListRes.b).slice(0,400));
    data = iapListRes.b.data || [];
  }
  let sp = data.find(x => x.attributes?.productId === 'starter_pack');
  if (!sp) {
    // Fallback: use the known ASC id from iap_apply_all.js
    console.log(' falling back to known ascId 6831936238 ...');
    const direct = await asc('GET', '/v2/inAppPurchases/6831936238');
    console.log('   direct HTTP', direct.s);
    if (direct.s === 200 && direct.b.data) {
      sp = direct.b.data;
    } else {
      console.log('   direct err:', JSON.stringify(direct.b).slice(0,400));
      process.exit(2);
    }
  }
  console.log(' starter_pack ascId =', sp.id, ' name=', sp.attributes?.name, ' productId=', sp.attributes?.productId);

  // ─── ASC: fetch its localizations ───────────────────────────────────────
  const locRes = await asc('GET', `/v2/inAppPurchases/${sp.id}/inAppPurchaseLocalizations`);
  const locs = locRes.b.data || [];
  console.log(' localizations:', locs.map(l => `${l.attributes?.locale}=${l.id}`).join(', '));

  async function patchLoc(locale, name, description) {
    const existing = locs.find(l => l.attributes?.locale === locale);
    if (existing) {
      const r = await asc('PATCH', `/v1/inAppPurchaseLocalizations/${existing.id}`, {
        data: { type: 'inAppPurchaseLocalizations', id: existing.id, attributes: { name, description } }
      });
      console.log(` PATCH ${locale} id=${existing.id} HTTP ${r.s}  desc(${description.length}c)="${description}"`);
      if (r.s >= 300) console.log('   err:', JSON.stringify(r.b).slice(0,800));
      return r.s;
    }
    const r = await asc('POST', `/v1/inAppPurchaseLocalizations`, {
      data: {
        type: 'inAppPurchaseLocalizations',
        attributes: { locale, name, description },
        relationships: { inAppPurchaseV2: { data: { type: 'inAppPurchases', id: sp.id } } }
      }
    });
    console.log(` POST  ${locale} HTTP ${r.s}  desc(${description.length}c)="${description}"`);
    if (r.s >= 300) console.log('   err:', JSON.stringify(r.b).slice(0,800));
    return r.s;
  }

  console.log('\n=== ASC: PATCH starter_pack localizations ===');
  const ascEnStatus = await patchLoc('en-US', NAME_EN, ASC_EN);
  const ascTrStatus = await patchLoc('tr',    NAME_TR, ASC_TR);

  // ─── Play: inspect + batchUpdate ────────────────────────────────────────
  console.log('\n=== Play: GET starter_pack ===');
  const getRes = await play('GET', `/androidpublisher/v3/applications/${PKG}/oneTimeProducts/starter_pack`);
  console.log(' HTTP', getRes.s);
  if (getRes.s >= 300) console.log(' err:', JSON.stringify(getRes.b).slice(0,800));
  const regionsVersion = getRes.b?.regionsVersion || { version: '2022/02' };
  console.log(' regionsVersion =', JSON.stringify(regionsVersion));
  console.log(' current listings:', JSON.stringify(getRes.b?.listings||[]).slice(0,600));

  console.log('\n=== Play: oneTimeProducts:batchUpdate ===');
  // regionsVersion belongs INSIDE each sub-request (per-product), not at top level.
  const batchBody = {
    requests: [{
      oneTimeProduct: {
        packageName: PKG,
        productId: 'starter_pack',
        listings: [
          { languageCode: 'en-US', title: NAME_EN, description: PLAY_EN },
          { languageCode: 'tr-TR', title: NAME_TR, description: PLAY_TR },
        ],
      },
      updateMask: 'listings',
      regionsVersion,
      latencyTolerance: 'PRODUCT_UPDATE_LATENCY_TOLERANCE_LATENCY_TOLERANT'
    }]
  };
  const batchRes = await play('POST', `/androidpublisher/v3/applications/${PKG}/oneTimeProducts:batchUpdate`, batchBody);
  console.log(' HTTP', batchRes.s);
  if (batchRes.s === 200) {
    const updated = batchRes.b.oneTimeProducts || [];
    for (const p of updated) {
      console.log(`  OK  ${p.productId} listings=${p.listings?.length}`);
      for (const l of (p.listings||[])) {
        console.log(`       ${l.languageCode}: "${l.title}" | "${l.description}"`);
      }
    }
  } else {
    console.log(' err body:', JSON.stringify(batchRes.b).slice(0,1600));
  }

  console.log('\n=== Summary ===');
  console.log(' ASC en-US PATCH:', ascEnStatus);
  console.log(' ASC tr    PATCH:', ascTrStatus);
  console.log(' Play batchUpdate:', batchRes.s);
}

main().catch(e => { console.error('fatal', e); process.exit(1); });

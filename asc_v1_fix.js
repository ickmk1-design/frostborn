// Fix round-2: retry fields that errored out in asc_v1_launch.js.
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID   = 'K8CBHMQ2S8';
const ISSUER   = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const APP_ID   = '6831935786';
const APP_INFO_ID = '086db6fd-ac3e-4650-adbc-38d6db4ac2bd';
const VERSION_ID  = 'a1b135b8-08ca-48f3-975e-a1e5aae607d5';
const EN_LOC_ID = '0ef394cc-c397-4982-b02a-f794dbfd37bc';
const TR_LOC_ID = '2330a5eb-e907-4717-9e45-0182a46de0a3';

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

const WHATSNEW_EN = "Welcome to Frostborn: Last Camp — version 1.0! Rescue frozen survivors, raise a camp from the ice, hunt wolves and fish the lake across 15 hand-crafted levels plus Endless Mode. Thanks for playing — we're reading every review.";
const WHATSNEW_TR = "Frostborn: Last Camp 1.0 sürümüne hoş geldin! Donmuş hayatta kalanları kurtar, buzdan bir kamp çıkar, kurt avla ve gölü balıkla — 15 el yapımı bölüm ve Sonsuz Mod seni bekliyor. Oynadığın için teşekkürler, her yorumu okuyoruz.";

async function main() {
  // ---- 1) content rights: try app (not appInfo) ----
  console.log('--- content rights (on apps) ---');
  const cr1 = await api('PATCH', `/v1/apps/${APP_ID}`, {
    data: { type: 'apps', id: APP_ID, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } }
  });
  console.log(' app attr contentRightsDeclaration:', cr1.status === 200 ? 'OK 200' : 'Error ' + cr1.status);

  // Also try appInfos with different attribute
  // schema has "appInfoAttributes" -> contentRightsDeclaration? unclear
  // Try as PATCH to appInfo with no attributes but describe current state
  const aiShow = await api('GET', `/v1/appInfos/${APP_INFO_ID}`);
  console.log(' appInfo current attrs:', JSON.stringify(aiShow.body.data?.attributes).slice(0, 400));

  // ---- 2) version localizations: PATCH without whatsNew (locked in first release? seems we can't edit ----
  console.log('\n--- version loc en-US whatsNew via POST-style, but we might need a different route ---');
  // Try PATCH JUST whatsNew alone to see exact error
  const wnOnly = await api('PATCH', `/v1/appStoreVersionLocalizations/${EN_LOC_ID}`, {
    data: { type: 'appStoreVersionLocalizations', id: EN_LOC_ID, attributes: { whatsNew: WHATSNEW_EN } }
  });
  console.log(' EN whatsNew only:', wnOnly.status === 200 ? 'OK' : 'Error ' + wnOnly.status);

  // ---- 3) Export compliance: create appEncryptionDeclaration + link to version ----
  console.log('\n--- app encryption declaration (export compliance) ---');
  const enc = await api('POST', `/v1/appEncryptionDeclarations`, {
    data: {
      type: 'appEncryptionDeclarations',
      attributes: {
        usesEncryption: false,
        exempt: true,
        containsProprietaryCryptography: false,
        containsThirdPartyCryptography: false,
        availableOnFrenchStore: true,
        platform: 'IOS',
        appEncryptionDeclarationState: 'APPROVED'
      },
      relationships: { app: { data: { type: 'apps', id: APP_ID } } }
    }
  });
  console.log(' create encryption decl:', enc.status === 201 ? 'OK 201' : 'Error ' + enc.status);
  if (enc.status === 201 && enc.body.data) {
    const edId = enc.body.data.id;
    const linkRes = await api('PATCH', `/v1/appStoreVersions/${VERSION_ID}/relationships/appEncryptionDeclaration`, {
      data: { type: 'appEncryptionDeclarations', id: edId }
    });
    console.log(' link encryption to version:', linkRes.status < 300 ? 'OK ' + linkRes.status : 'Error ' + linkRes.status);
  }

  // ---- 4) Age rating declaration: get current to learn schema, then PATCH valid fields ----
  console.log('\n--- age rating declaration (introspect schema) ---');
  const ard = await api('GET', `/v1/ageRatingDeclarations/${APP_INFO_ID}`);
  if (ard.status === 200) {
    console.log(' current ageRating attrs:', Object.keys(ard.body.data?.attributes || {}).join(', '));
  }
  // Try the attributes from the schema we can see work (from past scripts and ASC v1)
  const ageAttrs = {
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
  };
  const r = await api('PATCH', `/v1/ageRatingDeclarations/${APP_INFO_ID}`, {
    data: { type: 'ageRatingDeclarations', id: APP_INFO_ID, attributes: ageAttrs }
  });
  console.log(' age rating PATCH:', r.status === 200 ? 'OK 200' : 'Error ' + r.status);

  // ---- 5) Pricing: free in all territories via v3 ----
  console.log('\n--- pricing (free, all territories) via v3 ---');
  // Try v3/appPriceSchedules (new) — but v1 is still valid. 404 likely means no schedule yet.
  // POST a new schedule
  const freeRes = await api('POST', `/v1/appPriceSchedules`, {
    data: {
      type: 'appPriceSchedules',
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
        baseTerritory: { data: { type: 'territories', id: 'USA' } },
        manualPrices: { data: [{ type: 'appPrices', id: '0' }] } // 0 may be the ID for free tier
      }
    }
  });
  console.log(' POST appPriceSchedule (id=0):', freeRes.status === 201 ? 'OK 201' : 'Error ' + freeRes.status);

  // If that failed, try the two historically-valid shapes
  if (freeRes.status !== 201) {
    // appPricePoints are the modern thing — need a specific pricePoint id for "Free"
    // Fetch pricePoints to find the free one
    const ppRes = await api('GET', `/v1/apps/${APP_ID}/appPricePoints?filter[territory]=USA&limit=10`);
    console.log(' sample pricePoints:', ppRes.status, (ppRes.body.data || []).slice(0,3).map(p => `${p.id}:${p.attributes?.customerPrice}`).join(' | '));
  }

  // ---- 6) Territory availability (all) ----
  console.log('\n--- territory availability (v3) ---');
  // v3 uses appAvailabilityV2 request
  const tReq = await api('POST', `/v2/appAvailabilities`, {
    data: {
      type: 'appAvailabilities',
      attributes: { availableInNewTerritories: true },
      relationships: {
        app: { data: { type: 'apps', id: APP_ID } },
        availableTerritories: { data: [] } // empty = all when availableInNewTerritories=true? Need to pass list
      }
    }
  });
  console.log(' POST appAvailabilities v2:', tReq.status, (tReq.body.errors || []).map(e => e.code).join(','));

  // ---- 7) IAPs (verify, fix include param) ----
  console.log('\n--- IAPs (verify) ---');
  const iapRes = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=50`);
  if (iapRes.status === 200) {
    const iaps = iapRes.body.data || [];
    console.log(' IAPs:', iaps.length);
    for (const iap of iaps) {
      console.log(`\n  == ${iap.attributes?.productId} (${iap.attributes?.inAppPurchaseType}, state=${iap.attributes?.state}) name="${iap.attributes?.name}" id=${iap.id}`);
      const lRes = await api('GET', `/v2/inAppPurchases/${iap.id}/inAppPurchaseLocalizations`);
      for (const l of (lRes.body.data || [])) {
        console.log(`    - ${l.attributes?.locale}: name="${l.attributes?.name}" desc="${(l.attributes?.description||'').slice(0,80)}" state=${l.attributes?.state}`);
      }
      const ppsRes = await api('GET', `/v2/inAppPurchases/${iap.id}/iapPriceSchedule?include=manualPrices,manualPrices.appStoreTerritory`);
      if (ppsRes.status === 200) {
        const prices = ppsRes.body.included?.filter(i => i.type === 'inAppPurchasePrices') || [];
        const pricePoints = ppsRes.body.included?.filter(i => i.type === 'inAppPurchasePricePoints') || [];
        console.log(`    price schedule: ${prices.length} manual price(s); example pricePoint ids:`, prices.slice(0,3).map(p => p.relationships?.inAppPurchasePricePoint?.data?.id).join(','));
      } else {
        console.log(`    price schedule status: ${ppsRes.status}`);
      }
    }
  }

  console.log('\n--- done ---');
}

main().catch(e => { console.error(e); process.exit(1); });

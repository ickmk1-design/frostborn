// Frostborn ASC v1.0 launch metadata — fills everything via API, no browser.
// Reuses the pattern from asc_metadata.js / asc_metadata2.js / asc_fix.js.
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
            (parsed.errors || []).slice(0,4).forEach(e => console.error(`      - ${e.code}: ${(e.detail || e.title || '').slice(0,300)}`));
          }
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          console.error('    Parse error:', data.slice(0,200));
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ------------------------- Content -------------------------

const SUB_EN = 'Survive the Endless Winter'; // 26
const SUB_TR = 'Sonsuz Kışta Hayatta Kal';   // 24

const EN_DESC = `The world froze over. Deep in the wilderness, a handful of survivors huddle around a dying fire. You are their last hope.

FROSTBORN: LAST CAMP is a cozy survival camp-builder where every decision matters. Thaw stranded survivors from the icy wild, assign them real jobs, and grow a thriving camp from a single tent — before the cold takes everyone.

CHOP, BUILD, SURVIVE
Gather wood to feed your fire and raise new buildings. Every log is one step closer to warmth.

KEEP THE FIRE ALIVE
Your campfire is the heart of camp. Let it die and everyone dies. Manage fuel, build furnaces, and upgrade your heating to outlast the longest nights.

HUNT WOLVES, FISH THE ICE
Send survivors to hunt wolf packs and spearfish through frozen lakes. Keep your people fed — or watch morale and health collapse.

BUILD YOUR DREAM CAMP
Unlock barracks, watchtowers, lumber mills, storage crates, research labs and more. Upgrade each one to squeeze every drop of efficiency out of the frost.

RESCUE & ASSIGN SURVIVORS
Find frozen survivors scattered across the map, thaw them at your fire, and assign them as woodcutters, hunters, builders or guards. Every pair of hands counts.

BATTLE THE BLIZZARD
Random blizzards and wolf raids stress-test your defences. Build walls, train troops, and prepare for the worst night of the winter.

15 HAND-CRAFTED LEVELS + ENDLESS MODE
Fifteen tightly-tuned campaign maps teach every mechanic, then Endless Mode lets you push your camp as far as the thaw will carry it.

SIMPLE & SATISFYING
Easy to pick up, hard to put down. No bloated menus — just tap, build, and watch a single tent grow into a fortified village.

Perfect for fans of base-builders, idle survival, post-apocalyptic winter settings, cozy strategy, and wolf-hunting adventures.

Can you build the last camp standing?`;

const TR_DESC = `Dünya dondu. Vahşi kışın ortasında bir avuç hayatta kalan, sönmekte olan bir ateşin etrafında büzülmüş. Son umutları sensin.

FROSTBORN: LAST CAMP, her kararın önem taşıdığı sıcacık bir hayatta kalma kamp inşa oyunu. Buz tutmuş bedenleri ateşte çöz, onlara gerçek işler ver ve tek bir çadırdan gelişen bir kampı sıfırdan büyüt — soğuk herkesi almadan önce.

KES, İNŞA ET, HAYATTA KAL
Ateşini beslemek ve yeni binalar dikmek için odun topla. Her kütük sıcaklığa bir adım daha yakın.

ATEŞİ CANLI TUT
Şenlik ateşi kampın kalbidir. Sönerse herkes ölür. Yakıtı yönet, fırınlar kur ve en uzun geceleri atlatmak için ısıtmanı geliştir.

KURT AVLA, BUZDA BALIK TUT
Hayatta kalanlarını kurt sürülerini avlamaya ve donmuş gölde buz balığı tutmaya yolla. Halkını doyur — yoksa moral ve sağlık çöker.

HAYALİNDEKİ KAMPI KUR
Kışla, gözetleme kulesi, kereste fabrikası, depo sandığı, araştırma laboratuvarı ve daha fazlasını aç. Her birini geliştirip ayazdan son damla verimi sök al.

HAYATTA KALANLARI KURTAR VE GÖREVLENDİR
Haritaya dağılmış donmuş bedenleri bul, ateşinde çöz ve oduncu, avcı, inşaatçı ya da muhafız olarak görevlendir. Her el değerli.

TİPİ İLE SAVAŞ
Rastgele kar fırtınaları ve kurt baskınları savunmanı sınar. Duvar dik, asker yetiştir ve kışın en kötü gecesine hazırlan.

15 EL YAPIMI BÖLÜM + SONSUZ MOD
On beş özenle ayarlanmış kampanya haritası tüm mekanikleri öğretir, sonra Sonsuz Mod kampını buzun elverdiği yere kadar itmene izin verir.

BASİT VE TATMİN EDİCİ
Öğrenmesi kolay, bırakması zor. Şişkin menüler yok — sadece dokun, inşa et ve tek bir çadırın tahkimli bir köye dönüşmesini izle.

Üs kurma, boşta kalma hayatta kalma, kıyamet sonrası kış ortamları, sıcak strateji ve kurt avı maceralarını sevenler için biçilmiş kaftan.

Son ayakta kalan kampı sen kurabilecek misin?`;

const EN_KEYWORDS = 'survival,winter,camp,builder,wolves,fishing,ice,post-apocalyptic,base,build,hunt,craft,idle,cozy'; // 96
const TR_KEYWORDS = 'hayatta kalma,kış,kamp,inşa,kurt,balık,buz,kıyamet,üs,craft,boşta,avcı,sıcak,strateji'; // 85

const PROMO_EN = 'Build your camp, rescue frozen survivors, hunt wolves, fish through the ice. Survive 15 handcrafted levels or test your grit in Endless Mode.';
const PROMO_TR = 'Kampını kur, donmuş hayatta kalanları kurtar, kurt avla, buzun altında balık tut. 15 el yapımı bölüm ve Sonsuz Modda dayan.';

const WHATSNEW_EN = "Welcome to Frostborn: Last Camp — version 1.0! Rescue frozen survivors, raise a camp from the ice, hunt wolves and fish the lake across 15 hand-crafted levels plus Endless Mode. Thanks for playing — we're reading every review.";
const WHATSNEW_TR = "Frostborn: Last Camp 1.0 sürümüne hoş geldin! Donmuş hayatta kalanları kurtar, buzdan bir kamp çıkar, kurt avla ve gölü balıkla — 15 el yapımı bölüm ve Sonsuz Mod seni bekliyor. Oynadığın için teşekkürler, her yorumu okuyoruz.";

const COPYRIGHT = '2026 CYT Bilişim';

const REVIEW_NOTES = 'No login required. IAPs: Remove Ads, Starter Pack, 500/1200/3000 coin packs. Ads served via Google AdMob with UMP consent and iOS 14.5+ ATT prompt. Game runs offline aside from IAP/ad networking.';

// Quick length sanity (fail fast if anything grew past the ASC caps)
function assertCaps() {
  const checks = [
    ['SUB_EN', SUB_EN, 30], ['SUB_TR', SUB_TR, 30],
    ['EN_KEYWORDS', EN_KEYWORDS, 100], ['TR_KEYWORDS', TR_KEYWORDS, 100],
    ['PROMO_EN', PROMO_EN, 170], ['PROMO_TR', PROMO_TR, 170],
    ['EN_DESC', EN_DESC, 4000], ['TR_DESC', TR_DESC, 4000],
    ['WHATSNEW_EN', WHATSNEW_EN, 4000], ['WHATSNEW_TR', WHATSNEW_TR, 4000],
  ];
  for (const [n, v, cap] of checks) {
    if (v.length > cap) throw new Error(`${n} is ${v.length} chars, cap ${cap}`);
    console.log(`  len ${n}: ${v.length}/${cap}`);
  }
}

// ------------------------- Main -------------------------

async function main() {
  console.log('\n=== Length sanity ===');
  assertCaps();

  console.log('\n=== STEP 1: Discover app / appInfo / version IDs ===');
  const appRes = await api('GET', `/v1/apps/${APP_ID}`);
  if (appRes.status !== 200) { console.error('Could not fetch app'); return; }
  console.log('App:', appRes.body.data?.attributes?.name, '| bundle:', appRes.body.data?.attributes?.bundleId, '| sku:', appRes.body.data?.attributes?.sku);

  const aiRes = await api('GET', `/v1/apps/${APP_ID}/appInfos`);
  const appInfos = aiRes.body.data || [];
  console.log('AppInfos:', appInfos.map(a => `${a.id} (${a.attributes?.appStoreState})`).join(' | '));
  // Prefer PREPARE_FOR_SUBMISSION / editable one over READY_FOR_SALE
  const editableAppInfo = appInfos.find(a => a.attributes?.appStoreState !== 'READY_FOR_SALE') || appInfos[0];
  const APP_INFO_ID = editableAppInfo?.id;
  console.log('Using AppInfo:', APP_INFO_ID, editableAppInfo?.attributes?.appStoreState);

  const vRes = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS&limit=20`);
  const versions = vRes.body.data || [];
  console.log('Versions:', versions.map(v => `${v.attributes?.versionString}/${v.attributes?.appStoreState}`).join(' | '));
  const editableVersion = versions.find(v => ['PREPARE_FOR_SUBMISSION','WAITING_FOR_REVIEW','DEVELOPER_REJECTED','REJECTED','METADATA_REJECTED','INVALID_BINARY'].includes(v.attributes?.appStoreState))
    || versions.find(v => v.attributes?.versionString === '1.0')
    || versions[0];
  const VERSION_ID = editableVersion?.id;
  console.log('Using Version:', VERSION_ID, editableVersion?.attributes?.versionString, editableVersion?.attributes?.appStoreState);
  if (!VERSION_ID) { console.error('No version found'); return; }

  // ----- STEP 2: AppInfo attributes (content rights) -----
  console.log('\n=== STEP 2: AppInfo attributes (content rights) ===');
  if (APP_INFO_ID) {
    const crRes = await api('PATCH', `/v1/appInfos/${APP_INFO_ID}`, {
      data: { type: 'appInfos', id: APP_INFO_ID, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } }
    });
    console.log('  contentRightsDeclaration:', crRes.status === 200 ? 'OK 200' : `Error ${crRes.status}`);
  }

  // ----- STEP 3: Categories -----
  console.log('\n=== STEP 3: Categories (Simulation / Strategy) ===');
  if (APP_INFO_ID) {
    const catRes = await api('PATCH', `/v1/appInfos/${APP_INFO_ID}`, {
      data: {
        type: 'appInfos',
        id: APP_INFO_ID,
        relationships: {
          primaryCategory: { data: { type: 'appCategories', id: 'GAMES' } },
          primarySubcategoryOne: { data: { type: 'appCategories', id: 'GAMES_SIMULATION' } },
          primarySubcategoryTwo: { data: { type: 'appCategories', id: 'GAMES_STRATEGY' } }
        }
      }
    });
    console.log('  categories PATCH:', catRes.status === 200 ? 'OK 200' : `Error ${catRes.status}`);
  }

  // ----- STEP 4: AppInfo localizations (name, subtitle, privacyPolicyUrl) -----
  console.log('\n=== STEP 4: AppInfo localizations (name, subtitle, privacyPolicyUrl) ===');
  if (APP_INFO_ID) {
    const aiLocRes = await api('GET', `/v1/appInfos/${APP_INFO_ID}/appInfoLocalizations`);
    const existingLocs = aiLocRes.body.data || [];
    console.log('  existing locales:', existingLocs.map(l => l.attributes?.locale).join(', '));

    const locPayload = {
      'en-US': { name: 'Frostborn', subtitle: SUB_EN, privacyPolicyUrl: 'https://cytbilisim.com/frostborn/privacy/' },
      'tr':    { name: 'Frostborn', subtitle: SUB_TR, privacyPolicyUrl: 'https://cytbilisim.com/frostborn/privacy/' },
    };
    for (const [locale, attrs] of Object.entries(locPayload)) {
      const existing = existingLocs.find(l => l.attributes?.locale === locale);
      if (existing) {
        const r = await api('PATCH', `/v1/appInfoLocalizations/${existing.id}`, {
          data: { type: 'appInfoLocalizations', id: existing.id, attributes: attrs }
        });
        console.log(`  PATCH ${locale} (${existing.id}): ${r.status === 200 ? 'OK 200' : 'Error ' + r.status}`);
      } else {
        const r = await api('POST', `/v1/appInfoLocalizations`, {
          data: { type: 'appInfoLocalizations', attributes: { locale, ...attrs },
            relationships: { appInfo: { data: { type: 'appInfos', id: APP_INFO_ID } } } }
        });
        console.log(`  POST ${locale}: ${r.status === 201 ? 'OK 201' : 'Error ' + r.status}`);
      }
    }
  }

  // ----- STEP 5: Version localizations (description, keywords, promo, release notes, support/marketing URL) -----
  console.log('\n=== STEP 5: Version localizations ===');
  const vlRes = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/appStoreVersionLocalizations`);
  const vlocs = vlRes.body.data || [];
  console.log('  existing version locales:', vlocs.map(l => l.attributes?.locale).join(', '));

  const vLocData = {
    'en-US': {
      description: EN_DESC,
      keywords: EN_KEYWORDS,
      promotionalText: PROMO_EN,
      whatsNew: WHATSNEW_EN,
      supportUrl: 'https://cytbilisim.com/frostborn/support/',
      marketingUrl: 'https://cytbilisim.com/frostborn/'
    },
    'tr': {
      description: TR_DESC,
      keywords: TR_KEYWORDS,
      promotionalText: PROMO_TR,
      whatsNew: WHATSNEW_TR,
      supportUrl: 'https://cytbilisim.com/frostborn/support/',
      marketingUrl: 'https://cytbilisim.com/frostborn/'
    }
  };
  for (const [locale, attrs] of Object.entries(vLocData)) {
    const existing = vlocs.find(l => l.attributes?.locale === locale);
    if (existing) {
      const r = await api('PATCH', `/v1/appStoreVersionLocalizations/${existing.id}`, {
        data: { type: 'appStoreVersionLocalizations', id: existing.id, attributes: attrs }
      });
      console.log(`  PATCH ${locale} (${existing.id}): ${r.status === 200 ? 'OK 200' : 'Error ' + r.status}`);
    } else {
      const r = await api('POST', `/v1/appStoreVersionLocalizations`, {
        data: { type: 'appStoreVersionLocalizations',
          attributes: { locale, ...attrs },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: VERSION_ID } } } }
      });
      console.log(`  POST ${locale}: ${r.status === 201 ? 'OK 201' : 'Error ' + r.status}`);
    }
  }

  // ----- STEP 6: Version attributes (copyright, non-exempt encryption) -----
  console.log('\n=== STEP 6: Version attributes (copyright + export compliance) ===');
  const vPatchRes = await api('PATCH', `/v1/appStoreVersions/${VERSION_ID}`, {
    data: {
      type: 'appStoreVersions',
      id: VERSION_ID,
      attributes: { copyright: COPYRIGHT, usesNonExemptEncryption: false }
    }
  });
  console.log(`  version attributes: ${vPatchRes.status === 200 ? 'OK 200' : 'Error ' + vPatchRes.status}`);

  // ----- STEP 7: App Review Detail -----
  console.log('\n=== STEP 7: App Review Detail ===');
  const ariRes = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
  const reviewAttrs = {
    contactFirstName: 'Ibrahim',
    contactLastName: 'Çakmak',
    contactEmail: 'ibrahim@cytbilisim.com',
    notes: REVIEW_NOTES,
    demoAccountRequired: false
  };
  if (ariRes.status === 200 && ariRes.body.data) {
    const reviewId = ariRes.body.data.id;
    console.log('  existing reviewDetail id:', reviewId, '| current phone:', ariRes.body.data.attributes?.contactPhone);
    const r = await api('PATCH', `/v1/appStoreReviewDetails/${reviewId}`, {
      data: { type: 'appStoreReviewDetails', id: reviewId, attributes: reviewAttrs }
    });
    console.log('  review PATCH:', r.status === 200 ? 'OK 200' : 'Error ' + r.status);
  } else {
    // Need phone to create; use placeholder — user must set in dashboard if we POST new one.
    const r = await api('POST', `/v1/appStoreReviewDetails`, {
      data: { type: 'appStoreReviewDetails',
        attributes: { ...reviewAttrs, contactPhone: '+90 500 000 00 00' },
        relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: VERSION_ID } } } }
    });
    console.log('  review POST:', r.status === 201 ? 'OK 201 (phone placeholder, update manually)' : 'Error ' + r.status);
  }

  // ----- STEP 8: Age rating declaration -----
  console.log('\n=== STEP 8: Age rating declaration ===');
  // Age rating lives on AppInfo (newer apps) or on AppStoreVersion (older ones).
  // Try AppInfo first.
  let ageDeclId = null;
  const ardViaInfo = await api('GET', `/v1/appInfos/${APP_INFO_ID}/ageRatingDeclaration`);
  if (ardViaInfo.status === 200 && ardViaInfo.body.data) ageDeclId = ardViaInfo.body.data.id;
  if (!ageDeclId) {
    const ardViaVersion = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/ageRatingDeclaration`);
    if (ardViaVersion.status === 200 && ardViaVersion.body.data) ageDeclId = ardViaVersion.body.data.id;
  }
  console.log('  ageRatingDeclaration id:', ageDeclId);

  if (ageDeclId) {
    const ageAttrs = {
      violenceCartoonOrFantasy: 'INFREQUENT_OR_MILD',
      violenceRealistic: 'NONE',
      violenceRealisticProlongedGraphicOrSadistic: 'NONE',
      violenceCartoonOrFantasyProlongedGraphicOrSadistic: 'NONE',
      profanityOrCrudeHumor: 'NONE',
      matureOrSuggestiveThemes: 'NONE',
      sexualContentOrNudity: 'NONE',
      sexualContentGraphic: 'NONE',
      horrorOrFearThemes: 'NONE',
      medicalOrTreatmentInformation: 'NONE',
      alcoholTobaccoOrDrugUseOrReferences: 'NONE',
      gambling: false,
      gamblingSimulated: 'NONE',
      contests: 'NONE',
      unrestrictedWebAccess: false,
      userGeneratedContent: false,
      kidsAgeBand: null,
      ageRatingOverride: 'NONE',
      seventeenPlus: false,
      // Interactive advertising / ads
      // Several keys exist across API versions; set the common ones defensively.
      contestsOrSweepstakes: 'NONE'
    };
    // Note: "contains ads" isn't an ageRatingDeclaration attribute on all schema versions;
    // it's set on the app via attribute `contentRightsDeclaration` (unrelated) or via
    // the "App Privacy" / "Advertising Identifier" question. ASC surfaces a separate
    // Age Rating question: it's part of ageRatingDeclaration too in v1.
    const r = await api('PATCH', `/v1/ageRatingDeclarations/${ageDeclId}`, {
      data: { type: 'ageRatingDeclarations', id: ageDeclId, attributes: ageAttrs }
    });
    console.log('  age rating PATCH:', r.status === 200 ? 'OK 200' : 'Error ' + r.status);
  } else {
    console.log('  (no ageRatingDeclaration found — may need to be set in dashboard)');
  }

  // ----- STEP 9: Pricing (free, all territories) -----
  console.log('\n=== STEP 9: Pricing ===');
  const priceRes = await api('GET', `/v1/apps/${APP_ID}/appPriceSchedule?include=manualPrices,baseTerritory`);
  console.log('  priceSchedule status:', priceRes.status);
  if (priceRes.status === 200 && priceRes.body.data) {
    const manualPrices = priceRes.body.included?.filter(i => i.type === 'appPrices') || [];
    const baseTerr = priceRes.body.included?.find(i => i.type === 'territories');
    console.log('  current base territory:', baseTerr?.id, '| price points:', manualPrices.length);
    // If any price is non-free, replace schedule with USD_FREE
    const anyPaid = manualPrices.some(p => !/FREE/i.test(p.id));
    if (anyPaid || manualPrices.length === 0) {
      console.log('  setting schedule to free (USD_FREE)...');
      const setRes = await api('POST', `/v1/appPriceSchedules`, {
        data: { type: 'appPriceSchedules',
          relationships: {
            app: { data: { type: 'apps', id: APP_ID } },
            baseTerritory: { data: { type: 'territories', id: 'USA' } },
            manualPrices: { data: [{ type: 'appPrices', id: 'USD_FREE' }] }
          } }
      });
      console.log('  pricing POST:', setRes.status === 201 ? 'OK 201 (free)' : 'Error ' + setRes.status);
    } else {
      console.log('  already free — no change');
    }
  }

  // Availability (all territories)
  console.log('\n--- availability (all territories) ---');
  const availRes = await api('GET', `/v1/apps/${APP_ID}/appAvailabilityV2`);
  console.log('  appAvailabilityV2 status:', availRes.status);
  if (availRes.status === 200) {
    // v2 schema returns availableInNewTerritories + list of territoryAvailabilities
    console.log('  availableInNewTerritories:', availRes.body.data?.attributes?.availableInNewTerritories);
  }

  // ----- STEP 10: IAPs (verify only) -----
  console.log('\n=== STEP 10: IAPs (verify) ===');
  const iapRes = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=50&include=inAppPurchaseLocalizations,pricePoints`);
  if (iapRes.status === 200) {
    const iaps = iapRes.body.data || [];
    const inc = iapRes.body.included || [];
    console.log('  IAPs found:', iaps.length);
    for (const iap of iaps) {
      const id = iap.id;
      const pid = iap.attributes?.productId;
      const name = iap.attributes?.name;
      const type = iap.attributes?.inAppPurchaseType;
      const state = iap.attributes?.state;
      console.log(`\n  ── ${pid} (${type}, state=${state})`);
      console.log(`     name=${name}  id=${id}`);

      // Fetch localizations
      const lRes = await api('GET', `/v2/inAppPurchases/${id}/inAppPurchaseLocalizations`);
      const locs = lRes.body.data || [];
      console.log(`     localizations: ${locs.map(l => l.attributes?.locale).join(', ') || '(none)'}`);
      for (const l of locs) {
        console.log(`       - ${l.attributes?.locale}: name="${l.attributes?.name}" desc="${(l.attributes?.description||'').slice(0,60)}" state=${l.attributes?.state}`);
      }

      // Check price point
      const ppRes = await api('GET', `/v2/inAppPurchases/${id}/iapPriceSchedule?include=manualPrices`);
      if (ppRes.status === 200) {
        const prices = ppRes.body.included?.filter(i => i.type === 'inAppPurchasePrices') || [];
        console.log(`     price schedule: ${prices.length} manual price(s)`);
      }
    }
  } else {
    console.log('  IAP list error:', iapRes.status);
  }

  console.log('\n=== DONE ===');
}

main().catch(e => { console.error(e); process.exit(1); });

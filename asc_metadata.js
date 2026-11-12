const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID  = 'K8CBHMQ2S8';
const ISSUER  = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
const APP_ID  = '6831935786';

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
    const headers = {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request({
      hostname: 'api.appstoreconnect.apple.com',
      path,
      method,
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            console.error(`API Error ${res.statusCode} for ${method} ${path}:`);
            console.error(JSON.stringify(parsed, null, 2).slice(0, 1000));
          }
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          console.error('Parse error:', data.slice(0, 300));
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('\n=== STEP 1: Get App Info ===');
  const appRes = await api('GET', `/v1/apps/${APP_ID}?include=appInfos,appStoreVersions&fields[appInfos]=appStoreState,primaryCategory,secondaryCategory&fields[appStoreVersions]=versionString,appStoreState,platform`);
  if (appRes.status !== 200) { console.error('Failed to get app'); return; }

  const appData = appRes.body.data;
  console.log('App:', appData.attributes?.name);

  // Get AppInfo
  const appInfos = appRes.body.included?.filter(i => i.type === 'appInfos') || [];
  console.log('AppInfos count:', appInfos.length);
  let appInfoId = appInfos[0]?.id;

  if (!appInfoId) {
    console.log('Getting appInfos separately...');
    const aiRes = await api('GET', `/v1/apps/${APP_ID}/appInfos`);
    if (aiRes.status === 200 && aiRes.body.data?.length) {
      appInfoId = aiRes.body.data[0].id;
      console.log('AppInfo ID:', appInfoId);
    }
  } else {
    console.log('AppInfo ID:', appInfoId);
  }

  // Get AppStoreVersions
  const versions = appRes.body.included?.filter(i => i.type === 'appStoreVersions') || [];
  console.log('Versions:', versions.map(v => `${v.attributes?.versionString} (${v.attributes?.appStoreState})`).join(', '));

  let versionId = versions.find(v => v.attributes?.appStoreState === 'PREPARE_FOR_SUBMISSION' || v.attributes?.appStoreState === 'READY_FOR_REVIEW')?.id
    || versions.find(v => v.attributes?.appStoreState !== 'READY_FOR_SALE')?.id
    || versions[0]?.id;

  if (!versionId) {
    console.log('Getting versions separately...');
    const vRes = await api('GET', `/v1/apps/${APP_ID}/appStoreVersions?filter[platform]=IOS`);
    if (vRes.status === 200 && vRes.body.data?.length) {
      const v = vRes.body.data.find(v => v.attributes?.appStoreState !== 'READY_FOR_SALE') || vRes.body.data[0];
      versionId = v?.id;
      console.log('Version:', v?.attributes?.versionString, v?.attributes?.appStoreState, 'ID:', versionId);
    }
  } else {
    const v = versions.find(v2 => v2.id === versionId);
    console.log('Using version:', v?.attributes?.versionString, v?.attributes?.appStoreState, 'ID:', versionId);
  }

  // === STEP 2: Set App Name ===
  console.log('\n=== STEP 2: App Name Check (already set at App level) ===');
  const appAttrs = appData.attributes;
  console.log('Current app name from API:', appAttrs?.name || '(not in attributes)');

  // === STEP 3: Set AppInfo Localizations ===
  console.log('\n=== STEP 3: AppInfo Localizations ===');
  if (appInfoId) {
    const locRes = await api('GET', `/v1/appInfos/${appInfoId}/appInfoLocalizations`);
    if (locRes.status === 200) {
      const locs = locRes.body.data || [];
      console.log('Existing localizations:', locs.map(l => l.attributes?.locale).join(', '));

      const locData = {
        'en-US': { name: 'Frostborn: Last Camp', subtitle: 'Survival Camp Builder', privacyPolicyUrl: 'https://cytbilisim.com/frostborn/privacy/' },
        'tr': { name: 'Frostborn: Last Camp', subtitle: 'Hayatta Kalma Kampı Kur', privacyPolicyUrl: 'https://cytbilisim.com/frostborn/privacy/' }
      };

      for (const [locale, data] of Object.entries(locData)) {
        const existing = locs.find(l => l.attributes?.locale === locale);
        if (existing) {
          console.log(`PATCH appInfoLocalization for ${locale}...`);
          const pRes = await api('PATCH', `/v1/appInfoLocalizations/${existing.id}`, {
            data: { type: 'appInfoLocalizations', id: existing.id, attributes: data }
          });
          console.log(`  ${locale}: ${pRes.status === 200 ? 'OK' : 'Error ' + pRes.status}`);
        } else {
          console.log(`POST appInfoLocalization for ${locale}...`);
          const pRes = await api('POST', `/v1/appInfoLocalizations`, {
            data: { type: 'appInfoLocalizations', attributes: { locale, ...data },
              relationships: { appInfo: { data: { type: 'appInfos', id: appInfoId } } } }
          });
          console.log(`  ${locale}: ${pRes.status === 201 ? 'OK' : 'Error ' + pRes.status}`);
        }
      }
    }
  }

  // === STEP 4: Set Categories ===
  console.log('\n=== STEP 4: Set Categories ===');
  if (appInfoId) {
    const catRes = await api('PATCH', `/v1/appInfos/${appInfoId}`, {
      data: {
        type: 'appInfos',
        id: appInfoId,
        relationships: {
          primaryCategory: { data: { type: 'appCategories', id: 'GAMES' } },
          primarySubcategoryOne: { data: { type: 'appCategories', id: 'GAMES_STRATEGY' } },
          secondaryCategory: { data: { type: 'appCategories', id: 'GAMES_SIMULATION' } }
        }
      }
    });
    console.log('Categories:', catRes.status === 200 ? 'OK' : `Error ${catRes.status}`);
    if (catRes.status !== 200) {
      console.log(JSON.stringify(catRes.body?.errors?.[0])?.slice(0,200));
    }
  }

  // === STEP 5: Version Localizations ===
  console.log('\n=== STEP 5: Version Localizations ===');

  const EN_DESC = `The world has frozen over. Deep in the wilderness, a handful of survivors cling to life around a dying fire. You are their last hope.

FROSTBORN: LAST CAMP is a cozy survival camp-building game where every decision matters. Rescue stranded survivors from the icy wilderness, put them to work, and build a thriving camp from the ground up — before the cold takes everyone.

🪓 CHOP, BUILD, SURVIVE
Gather wood to fuel your fire and construct new buildings. Every log you chop is one step closer to warmth.

🔥 KEEP THE FIRE ALIVE
Your campfire is the heart of your camp. Let it die and you lose everything. Manage your fuel, build furnaces, and upgrade your heating to survive the longest nights.

🍖 HUNT & FISH FOR FOOD
Send your survivors out to hunt wolves and fish through the ice. Keep your people fed or watch morale — and health — crumble.

🏕️ BUILD YOUR DREAM CAMP
Unlock and place dozens of buildings: barracks, watchtowers, lumber mills, storage crates, research labs and more. Upgrade each one to squeeze out every last bit of efficiency.

👥 RESCUE & ASSIGN SURVIVORS
Find frozen survivors scattered across the map. Assign them as woodcutters, hunters, builders or guards. Each one matters.

❄️ BATTLE THE BLIZZARD
Random blizzards and enemy raids test your defences. Build perimeter walls, train your troops, and prepare for the worst.

✨ SIMPLE & SATISFYING
Easy to pick up, hard to put down. No complex menus — just tap, build, and watch your camp grow from a single tent to a fortified village.

Perfect for fans of base-building, idle games, survival crafting, and cozy strategy games.

Can you build the last camp standing?`;

  const TR_DESC = `Dünya dondu. Issız ormanlarda bir avuç hayatta kalan, sönen bir ateşin etrafında tutunuyor. Onların son umudu sensin.

FROSTBORN: LAST CAMP, her kararın önem taşıdığı, sıcacık bir hayatta kalma kamp yapma oyunudur. Buzlu ormandan hayatta kalanları kurtar, onları işe ver ve sıfırdan gelişen bir kamp inşa et — soğuk herkesi almadan önce.

🪓 KES, İNŞA ET, HAYATTA KAL
Ateşini yakmak ve yeni binalar inşa etmek için odun topla. Kestiğin her kütük sıcaklığa bir adım daha yakın demektir.

🔥 ATEŞİ CANLI TUT
Şenlik ateşi kampının kalbidir. Sönsün ve her şeyi kaybedersin. Yakıtını yönet, fırın inşa et ve en uzun geceleri atlatmak için ısıtma sistemini geliştir.

🍖 AV VE BALIK YAKALAMAK
Hayatta kalanlarını kurt avlamak ve buz üzerinde balık tutmak için gönder. Halkını beslemezsen moral — ve sağlık — çöker.

🏕️ HAYALLERININ KAMPINI KUR
Kışla, gözetleme kulesi, kereste fabrikası, depo sandıkları, araştırma laboratuvarı ve daha fazlasını aç ve yerleştir. Verimliliğin son damlasını çıkarmak için her birini geliştir.

👥 HAYATTA KALANLARI KURTAR VE GÖREVLENDIR
Haritaya dağılmış donmuş hayatta kalanları bul. Onları oduncu, avcı, inşaatçı ya da muhafız olarak görevlendir. Her biri önemlidir.

❄️ TIPI İLE SAVAŞ
Rastgele tipi fırtınaları ve düşman baskınları savunmanı sınar. Çevre duvarları inşa et, askerlerini eğit ve en kötüsüne hazırlan.

✨ BASIT VE TATMIN EDİCİ
Öğrenmesi kolay, bırakması zor. Karmaşık menüler yok — sadece dokun, inşa et ve kampının tek çadırdan tahkimli bir köye dönüşmesini izle.

Üs kurma, boşta kalma oyunları, hayatta kalma crafting ve sıcak strateji oyunlarının hayranları için mükemmel.

Son ayakta kalan kampı kurabilecek misin?`;

  if (versionId) {
    const vlRes = await api('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
    if (vlRes.status === 200) {
      const vlocs = vlRes.body.data || [];
      console.log('Existing version locs:', vlocs.map(l => l.attributes?.locale).join(', '));

      const vLocData = {
        'en-US': {
          description: EN_DESC,
          keywords: 'survival,camp,builder,rescue,winter,idle,craft,wood,fire,cozy,frozen,base,build,chop,fish,hunt',
          promotionalText: 'Build the last camp standing in a frozen world. Rescue survivors, chop wood, hunt for food, and keep your fire burning. How long can your camp hold out?',
          whatsNew: "Welcome to Frostborn: Last Camp! First release — build your camp, rescue survivors, and survive the freeze. We'd love to hear your feedback!",
          supportUrl: 'https://cytbilisim.com/frostborn/support/',
          marketingUrl: 'https://cytbilisim.com/frostborn/'
        },
        'tr': {
          description: TR_DESC,
          keywords: 'survival,camp,builder,rescue,winter,idle,craft,wood,fire,cozy,frozen,base,build,chop,fish,hunt',
          promotionalText: 'Donmuş bir dünyada son kampı inşa et. Hayatta kalanları kurtar, odun kes, yemek avla ve ateşini söndürme. Kampın ne kadar dayanır?',
          whatsNew: "Frostborn: Last Camp'e hoş geldiniz! İlk sürüm — kampını kur, hayatta kalanları kurtar ve dondurucu soğukta hayatta kal. Geri bildirimlerinizi bekliyoruz!",
          supportUrl: 'https://cytbilisim.com/frostborn/support/',
          marketingUrl: 'https://cytbilisim.com/frostborn/'
        }
      };

      for (const [locale, attrs] of Object.entries(vLocData)) {
        const existing = vlocs.find(l => l.attributes?.locale === locale);
        if (existing) {
          console.log(`PATCH versionLocalization ${locale}...`);
          const r = await api('PATCH', `/v1/appStoreVersionLocalizations/${existing.id}`, {
            data: { type: 'appStoreVersionLocalizations', id: existing.id, attributes: attrs }
          });
          console.log(`  ${locale}: ${r.status === 200 ? 'OK' : 'Error ' + r.status}`);
        } else {
          console.log(`POST versionLocalization ${locale}...`);
          const r = await api('POST', `/v1/appStoreVersionLocalizations`, {
            data: {
              type: 'appStoreVersionLocalizations',
              attributes: { locale, ...attrs },
              relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } }
            }
          });
          console.log(`  ${locale}: ${r.status === 201 ? 'OK' : 'Error ' + r.status}`);
        }
      }
    }

    // === STEP 6: Version Attributes (copyright, export compliance) ===
    console.log('\n=== STEP 6: Version Attributes ===');
    const vPatchRes = await api('PATCH', `/v1/appStoreVersions/${versionId}`, {
      data: {
        type: 'appStoreVersions',
        id: versionId,
        attributes: {
          copyright: '2026 CYT Bilisim Hizmetleri',
          usesNonExemptEncryption: false
        }
      }
    });
    console.log('Copyright + encryption:', vPatchRes.status === 200 ? 'OK' : `Error ${vPatchRes.status}`);

    // === STEP 7: Review Submission Info ===
    console.log('\n=== STEP 7: App Review Info ===');
    const ariRes = await api('GET', `/v1/appStoreVersions/${versionId}/appStoreReviewDetail`);
    console.log('Review detail status:', ariRes.status);

    const reviewAttrs = {
      contactFirstName: 'Mert',
      contactLastName: 'Ozkan',
      contactEmail: 'ickmk1@gmail.com',
      contactPhone: '+905000000000',
      notes: 'This is a free base-building survival game. The in-app shop is accessible from the main menu (tap the shop icon). IAPs available: Remove Ads ($1.99), Starter Pack ($2.99), 250/900/2500 Coins. AdMob ads are shown between rounds; during App Review, ads may appear in test mode. No login required. Tap Settings > Restore Purchases to restore.',
      demoAccountRequired: false
    };

    if (ariRes.status === 200 && ariRes.body.data) {
      const reviewId = ariRes.body.data.id;
      const pRes = await api('PATCH', `/v1/appStoreReviewDetails/${reviewId}`, {
        data: { type: 'appStoreReviewDetails', id: reviewId, attributes: reviewAttrs }
      });
      console.log('Review info PATCH:', pRes.status === 200 ? 'OK' : `Error ${pRes.status}`);
    } else {
      const pRes = await api('POST', `/v1/appStoreReviewDetails`, {
        data: {
          type: 'appStoreReviewDetails',
          attributes: reviewAttrs,
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } }
        }
      });
      console.log('Review info POST:', pRes.status === 201 ? 'OK' : `Error ${pRes.status}`);
    }
  }

  // === STEP 8: App-level attributes (privacy URL) ===
  console.log('\n=== STEP 8: App Privacy URL ===');
  const appPatchRes = await api('PATCH', `/v1/apps/${APP_ID}`, {
    data: {
      type: 'apps',
      id: APP_ID,
      attributes: {
        privacyPolicyUrl: 'https://cytbilisim.com/frostborn/privacy/'
      }
    }
  });
  console.log('Privacy URL:', appPatchRes.status === 200 ? 'OK' : `Error ${appPatchRes.status}`);

  // === STEP 9: Check IAPs ===
  console.log('\n=== STEP 9: Check IAPs ===');
  const iapRes = await api('GET', `/v1/apps/${APP_ID}/inAppPurchasesV2?limit=20`);
  if (iapRes.status === 200) {
    const iaps = iapRes.body.data || [];
    console.log('IAPs found:', iaps.length);
    iaps.forEach(i => console.log(' -', i.attributes?.productId, i.attributes?.name, i.attributes?.inAppPurchaseType));
  }

  // === STEP 10: Pricing ===
  console.log('\n=== STEP 10: Pricing ===');
  const priceRes = await api('GET', `/v1/apps/${APP_ID}/appPriceSchedule`);
  console.log('Price schedule status:', priceRes.status);
  if (priceRes.status === 200) {
    console.log('Current price:', JSON.stringify(priceRes.body.data?.attributes).slice(0,200));
  } else if (priceRes.status === 404) {
    // Set free pricing
    const freeRes = await api('POST', `/v1/appPriceSchedules`, {
      data: {
        type: 'appPriceSchedules',
        relationships: {
          app: { data: { type: 'apps', id: APP_ID } },
          manualPrices: {
            data: [{ type: 'appPrices', id: 'USD_FREE' }]
          },
          baseTerritory: { data: { type: 'territories', id: 'USA' } }
        }
      }
    });
    console.log('Set free pricing:', freeRes.status === 201 ? 'OK' : `Error ${freeRes.status}`);
  }

  console.log('\n=== ASC METADATA COMPLETE ===');
}

main().catch(console.error);

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
    const headers = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request({
      hostname: 'api.appstoreconnect.apple.com', path, method, headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            console.error(`  API Error ${res.statusCode} for ${method} ${path}:`);
            (parsed.errors || []).slice(0,3).forEach(e => console.error(`  - ${e.code}: ${e.detail || e.title}`));
          }
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Strip emoji from text for ASC description field
function stripEmoji(str) {
  // Replace emoji with text equivalents
  return str
    .replace(/🪓/g, '[AXE]')
    .replace(/🔥/g, '[FIRE]')
    .replace(/🍖/g, '[FOOD]')
    .replace(/🏕️/g, '[CAMP]')
    .replace(/🏕/g, '[CAMP]')
    .replace(/👥/g, '[PEOPLE]')
    .replace(/❄️/g, '[SNOW]')
    .replace(/❄/g, '[SNOW]')
    .replace(/✨/g, '[STAR]')
    .replace(/[^\x00-\x7F\u00C0-\u024F\u0100-\u024F\u0250-\u02AF\u1E00-\u1EFF\u0400-\u04FF\u00A0-\u00FF]/g, '')
    .trim();
}

const APP_INFO_ID = '086db6fd-ac3e-4650-adbc-38d6db4ac2bd';
const VERSION_ID  = 'a1b135b8-08ca-48f3-975e-a1e5aae607d5';
const EN_LOC_ID   = '0ef394cc-c397-4982-b02a-f794dbfd37bc';
const TR_LOC_ID   = '2330a5eb-e907-4717-9e45-0182a46de0a3';

const EN_DESC = stripEmoji(`The world has frozen over. Deep in the wilderness, a handful of survivors cling to life around a dying fire. You are their last hope.

FROSTBORN: LAST CAMP is a cozy survival camp-building game where every decision matters. Rescue stranded survivors from the icy wilderness, put them to work, and build a thriving camp from the ground up — before the cold takes everyone.

[AXE] CHOP, BUILD, SURVIVE
Gather wood to fuel your fire and construct new buildings. Every log you chop is one step closer to warmth.

[FIRE] KEEP THE FIRE ALIVE
Your campfire is the heart of your camp. Let it die and you lose everything. Manage your fuel, build furnaces, and upgrade your heating to survive the longest nights.

[FOOD] HUNT & FISH FOR FOOD
Send your survivors out to hunt wolves and fish through the ice. Keep your people fed or watch morale — and health — crumble.

[CAMP] BUILD YOUR DREAM CAMP
Unlock and place dozens of buildings: barracks, watchtowers, lumber mills, storage crates, research labs and more. Upgrade each one to squeeze out every last bit of efficiency.

[PEOPLE] RESCUE & ASSIGN SURVIVORS
Find frozen survivors scattered across the map. Assign them as woodcutters, hunters, builders or guards. Each one matters.

[SNOW] BATTLE THE BLIZZARD
Random blizzards and enemy raids test your defences. Build perimeter walls, train your troops, and prepare for the worst.

[STAR] SIMPLE & SATISFYING
Easy to pick up, hard to put down. No complex menus — just tap, build, and watch your camp grow from a single tent to a fortified village.

Perfect for fans of base-building, idle games, survival crafting, and cozy strategy games.

Can you build the last camp standing?`);

const TR_DESC = stripEmoji(`Dunya dondu. Issiz ormanlarda bir avuc hayatta kalan, sonen bir atesin etrafinda tutunuyor. Onlarin son umudu sensin.

FROSTBORN: LAST CAMP, her kararin onem tasidigi, sicacik bir hayatta kalma kamp yapma oyunudur. Buzlu ormandan hayatta kalanlari kurtar, onlari ise ver ve sifirdan gelisen bir kamp insa et - soguk herkesi almadan once.

[AXE] KES, INSA ET, HAYATTA KAL
Atisini yakmak ve yeni binalar insa etmek icin odun topla. Kestigin her kutuk sicakliga bir adim daha yakin demektir.

[FIRE] ATESI CANLI TUT
Senlik atesi kampinin kalbidir. Sonsun ve her seyi kaybedersin. Yakitini yonet, firin insa et ve en uzun geceleri atlatmak icin isitma sistemini gelistir.

[FOOD] AV VE BALIK YAKALAMAK
Hayatta kalanlarini kurt avlamak ve buz uzerinde balik tutmak icin gonder. Halkini beslemezsen moral ve saglik coker.

[CAMP] HAYALLERININ KAMPINI KUR
Kisla, gozetleme kulesi, kereste fabrikasi, depo sandiklari, arastirma laboratuvari ve daha fazlasini ac ve yerles. Verimliligin son damlasini cikarmak icin her birini gelistir.

[PEOPLE] HAYATTA KALANLARI KURTAR VE GOREVLENDIR
Haritaya dagilmis donmus hayatta kalanlari bul. Onlari oduncu, avci, insaatci ya da muhafiz olarak gorevlendir. Her biri onemlidir.

[SNOW] TIPI ILE SAVAS
Rastgele tipi firtinalari ve dusman baskinlari savunmani sinar. Cevre duvarlari insa et, askerlerini egit ve en kotusune hazirlan.

[STAR] BASIT VE TATMIN EDICI
Ogrenmesi kolay, birakimaiz zor. Karmasik menuler yok - sadece dokun, insa et ve kampinin tek cadirdan tahkimli bir koye donusmesini izle.

Us kurma, bosta kalma oyunlari, hayatta kalma crafting ve sicak strateji oyunlarinin hayranlar icin mukemmel.

Son ayakta kalan kampi kurabilecek misin?`);

async function main() {
  console.log('\n=== ASC METADATA PASS 2 ===\n');

  // Fix categories — use only GAMES for primary, ENTERTAINMENT for secondary (different cats)
  console.log('--- Categories ---');
  const catRes = await api('PATCH', `/v1/appInfos/${APP_INFO_ID}`, {
    data: {
      type: 'appInfos',
      id: APP_INFO_ID,
      relationships: {
        primaryCategory: { data: { type: 'appCategories', id: 'GAMES' } },
        primarySubcategoryOne: { data: { type: 'appCategories', id: 'GAMES_STRATEGY' } },
        secondaryCategory: { data: { type: 'appCategories', id: 'ENTERTAINMENT' } }
      }
    }
  });
  console.log('Categories:', catRes.status === 200 ? 'OK' : `Error ${catRes.status}`);

  // Fix EN localization — strip emojis, skip whatsNew (can't edit it in PREPARE state apparently)
  console.log('\n--- EN Version Localization ---');
  const enRes = await api('PATCH', `/v1/appStoreVersionLocalizations/${EN_LOC_ID}`, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: EN_LOC_ID,
      attributes: {
        description: EN_DESC,
        keywords: 'survival,camp,builder,rescue,winter,idle,craft,wood,fire,cozy,frozen,base,build,chop,fish,hunt',
        promotionalText: 'Build the last camp standing in a frozen world. Rescue survivors, chop wood, hunt for food, and keep your fire burning. How long can your camp hold out?'
      }
    }
  });
  console.log('EN loc:', enRes.status === 200 ? 'OK' : `Error ${enRes.status}`);

  // Try whatsNew separately
  const enWnRes = await api('PATCH', `/v1/appStoreVersionLocalizations/${EN_LOC_ID}`, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: EN_LOC_ID,
      attributes: {
        whatsNew: "Welcome to Frostborn: Last Camp! First release - build your camp, rescue survivors, and survive the freeze. We'd love to hear your feedback!"
      }
    }
  });
  console.log('EN whatsNew:', enWnRes.status === 200 ? 'OK' : `Error ${enWnRes.status} (may not be editable)`);

  // Also update support and marketing URLs in EN loc
  const enUrlRes = await api('PATCH', `/v1/appStoreVersionLocalizations/${EN_LOC_ID}`, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: EN_LOC_ID,
      attributes: {
        supportUrl: 'https://cytbilisim.com/frostborn/support/',
        marketingUrl: 'https://cytbilisim.com/frostborn/'
      }
    }
  });
  console.log('EN URLs:', enUrlRes.status === 200 ? 'OK' : `Error ${enUrlRes.status}`);

  console.log('\n--- TR Version Localization ---');
  const trRes = await api('PATCH', `/v1/appStoreVersionLocalizations/${TR_LOC_ID}`, {
    data: {
      type: 'appStoreVersionLocalizations',
      id: TR_LOC_ID,
      attributes: {
        description: TR_DESC,
        promotionalText: 'Donmus bir dunyada son kampi insa et. Hayatta kalanlari kurtar, odun kes, yemek avla ve atisini sondurme. Kampin ne kadar dayanir?',
        supportUrl: 'https://cytbilisim.com/frostborn/support/',
        marketingUrl: 'https://cytbilisim.com/frostborn/'
      }
    }
  });
  console.log('TR loc:', trRes.status === 200 ? 'OK' : `Error ${trRes.status}`);

  // Copyright — separate from usesNonExemptEncryption
  console.log('\n--- Copyright ---');
  const copRes = await api('PATCH', `/v1/appStoreVersions/${VERSION_ID}`, {
    data: {
      type: 'appStoreVersions',
      id: VERSION_ID,
      attributes: { copyright: '2026 CYT Bilisim Hizmetleri' }
    }
  });
  console.log('Copyright:', copRes.status === 200 ? 'OK' : `Error ${copRes.status}`);

  // Export compliance — find the right endpoint
  console.log('\n--- Export Compliance ---');
  // Check ageRatingDeclarations
  const encRes = await api('GET', `/v1/appStoreVersions/${VERSION_ID}?include=ageRatingDeclaration`);
  const ard = encRes.body.included?.find(i => i.type === 'ageRatingDeclarations');
  if (ard) {
    console.log('AgeRatingDecl ID:', ard.id);
    const ardRes = await api('PATCH', `/v1/ageRatingDeclarations/${ard.id}`, {
      data: {
        type: 'ageRatingDeclarations',
        id: ard.id,
        attributes: { usesNonExemptEncryption: false }
      }
    });
    console.log('Export compliance:', ardRes.status === 200 ? 'OK' : `Error ${ardRes.status}`);
  } else {
    // Try direct
    const ardDirectRes = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/ageRatingDeclaration`);
    if (ardDirectRes.status === 200 && ardDirectRes.body.data) {
      const ardId = ardDirectRes.body.data.id;
      const ardPatch = await api('PATCH', `/v1/ageRatingDeclarations/${ardId}`, {
        data: {
          type: 'ageRatingDeclarations',
          id: ardId,
          attributes: { usesNonExemptEncryption: false }
        }
      });
      console.log('Export compliance:', ardPatch.status === 200 ? 'OK' : `Error ${ardPatch.status}`);
    } else {
      console.log('Could not find ageRatingDeclaration');
    }
  }

  // Review info — fix phone
  console.log('\n--- Review Info ---');
  const ariRes = await api('GET', `/v1/appStoreVersions/${VERSION_ID}/appStoreReviewDetail`);
  const reviewId = ariRes.body.data?.id;
  const reviewAttrs = {
    contactFirstName: 'Mert',
    contactLastName: 'Ozkan',
    contactEmail: 'ickmk1@gmail.com',
    contactPhone: '+90 500 000 00 00',
    notes: 'This is a free base-building survival game. The in-app shop is accessible from the main menu (tap the shop icon). IAPs available: Remove Ads ($1.99), Starter Pack ($2.99), 250/900/2500 Coins. AdMob ads are shown between rounds; during App Review, ads may appear in test mode. No login required. Tap Settings > Restore Purchases to restore.',
    demoAccountRequired: false
  };

  if (reviewId) {
    const rPatch = await api('PATCH', `/v1/appStoreReviewDetails/${reviewId}`, {
      data: { type: 'appStoreReviewDetails', id: reviewId, attributes: reviewAttrs }
    });
    console.log('Review info:', rPatch.status === 200 ? 'OK' : `Error ${rPatch.status}`);
  } else {
    const rPost = await api('POST', `/v1/appStoreReviewDetails`, {
      data: {
        type: 'appStoreReviewDetails',
        attributes: reviewAttrs,
        relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: VERSION_ID } } }
      }
    });
    console.log('Review info:', rPost.status === 201 ? 'OK' : `Error ${rPost.status}`);
  }

  // Privacy URL — goes in appInfoLocalizations
  console.log('\n--- Privacy URL (via appInfoLocalization) ---');
  const aiLocRes = await api('GET', `/v1/appInfos/${APP_INFO_ID}/appInfoLocalizations`);
  if (aiLocRes.status === 200) {
    for (const loc of aiLocRes.body.data || []) {
      const pRes = await api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, {
        data: {
          type: 'appInfoLocalizations',
          id: loc.id,
          attributes: { privacyPolicyUrl: 'https://cytbilisim.com/frostborn/privacy/' }
        }
      });
      console.log(`  ${loc.attributes?.locale} privacy URL: ${pRes.status === 200 ? 'OK' : 'Error ' + pRes.status}`);
    }
  }

  // Final price check
  console.log('\n--- Price Check ---');
  const priceRes = await api('GET', `/v1/apps/${APP_ID}/appPriceSchedule`);
  if (priceRes.status === 200) {
    console.log('App pricing exists (free or paid - check ASC dashboard)');
  } else {
    console.log('Price schedule status:', priceRes.status);
  }

  console.log('\n=== ASC PASS 2 COMPLETE ===');
}

main().catch(console.error);

// Round 6: Re-apply version localization fields WITHOUT whatsNew (locked at PREPARE state).
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID   = 'K8CBHMQ2S8';
const ISSUER   = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';
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

const EN_KW = 'survival,winter,camp,builder,wolves,fishing,ice,post-apocalyptic,base,build,hunt,craft,idle,cozy';
const TR_KW = 'hayatta kalma,kış,kamp,inşa,kurt,balık,buz,kıyamet,üs,craft,boşta,avcı,sıcak,strateji';
const PROMO_EN = 'Build your camp, rescue frozen survivors, hunt wolves, fish through the ice. Survive 15 handcrafted levels or test your grit in Endless Mode.';
const PROMO_TR = 'Kampını kur, donmuş hayatta kalanları kurtar, kurt avla, buzun altında balık tut. 15 el yapımı bölüm ve Sonsuz Modda dayan.';

async function main() {
  for (const [name, id, attrs] of [
    ['en-US', EN_LOC_ID, {
      description: EN_DESC,
      keywords: EN_KW,
      promotionalText: PROMO_EN,
      supportUrl: 'https://cytbilisim.com/frostborn/support/',
      marketingUrl: 'https://cytbilisim.com/frostborn/'
    }],
    ['tr', TR_LOC_ID, {
      description: TR_DESC,
      keywords: TR_KW,
      promotionalText: PROMO_TR,
      supportUrl: 'https://cytbilisim.com/frostborn/support/',
      marketingUrl: 'https://cytbilisim.com/frostborn/'
    }],
  ]) {
    const r = await api('PATCH', `/v1/appStoreVersionLocalizations/${id}`, {
      data: { type: 'appStoreVersionLocalizations', id, attributes: attrs }
    });
    console.log(`PATCH ${name}: ${r.status === 200 ? 'OK 200' : 'Error ' + r.status}`);
  }

  // Re-verify
  console.log('\n--- re-verify ---');
  const vl = await api('GET', `/v1/appStoreVersions/a1b135b8-08ca-48f3-975e-a1e5aae607d5/appStoreVersionLocalizations`);
  for (const l of (vl.body.data || [])) {
    console.log(`  ${l.attributes?.locale}: desc(${l.attributes?.description?.length}) kw(${(l.attributes?.keywords||'').length})="${(l.attributes?.keywords||'').slice(0,80)}"`);
    console.log(`    promo(${(l.attributes?.promotionalText||'').length})="${(l.attributes?.promotionalText||'').slice(0,80)}"`);
    console.log(`    support=${l.attributes?.supportUrl} marketing=${l.attributes?.marketingUrl}`);
  }
}

main().catch(e => console.error(e));

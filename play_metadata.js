const fs = require('fs');
const https = require('https');
const path = require('path');

// Load service account
const SA = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PACKAGE = 'com.cytbilisim.frostborn';

// Generate JWT for Google service account
function makeGoogleJwt(scopes) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: SA.client_email,
    scope: scopes,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const sig = sign.sign(SA.private_key).toString('base64url');
  return `${header}.${payload}.${sig}`;
}

function getAccessToken() {
  return new Promise((resolve, reject) => {
    const jwt = makeGoogleJwt('https://www.googleapis.com/auth/androidpublisher');
    const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const r = JSON.parse(d);
        if (r.access_token) resolve(r.access_token);
        else reject(new Error('No access token: ' + JSON.stringify(r).slice(0,300)));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

let TOKEN = '';

function playApi(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers = {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json'
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request({
      hostname: 'androidpublisher.googleapis.com',
      path,
      method,
      headers
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = d ? JSON.parse(d) : {};
          if (res.statusCode >= 400) {
            console.error(`API Error ${res.statusCode} for ${method} ${path}:`);
            console.error(JSON.stringify(parsed).slice(0,600));
          }
          resolve({ status: res.statusCode, body: parsed });
        } catch(e) {
          console.error('Parse error:', d.slice(0,200));
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function uploadImage(editId, imageType, filePath) {
  return new Promise((resolve, reject) => {
    const imgBuf = fs.readFileSync(filePath);
    const uploadPath = `/upload/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}/listings/en-US/images/${imageType}`;
    const req = https.request({
      hostname: 'androidpublisher.googleapis.com',
      path: uploadPath,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'image/png',
        'Content-Length': imgBuf.length
      }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const parsed = d ? JSON.parse(d) : {};
          if (res.statusCode >= 400) {
            console.error(`Upload error ${res.statusCode}:`, JSON.stringify(parsed).slice(0,400));
          }
          resolve({ status: res.statusCode, body: parsed });
        } catch(e) {
          resolve({ status: res.statusCode, body: {} });
        }
      });
    });
    req.on('error', reject);
    req.write(imgBuf);
    req.end();
  });
}

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

async function main() {
  console.log('Getting Google access token...');
  TOKEN = await getAccessToken();
  console.log('Token obtained');

  // Create edit
  console.log('\n=== Creating Play Edit ===');
  const editRes = await playApi('POST', `/androidpublisher/v3/applications/${PACKAGE}/edits`, {});
  if (editRes.status !== 200) { console.error('Failed to create edit'); return; }
  const editId = editRes.body.id;
  console.log('Edit ID:', editId);

  // === STEP 1: EN Listing ===
  console.log('\n=== EN-US Store Listing ===');
  const enRes = await playApi('PUT', `/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}/listings/en-US`, {
    language: 'en-US',
    title: 'Frostborn: Last Camp',
    shortDescription: 'Build a survival camp, rescue survivors, chop wood & keep your fire alive!',
    fullDescription: EN_DESC,
    video: ''
  });
  console.log('EN listing:', enRes.status === 200 ? 'OK' : `Error ${enRes.status}`);

  // === STEP 2: TR Listing ===
  console.log('\n=== TR Store Listing ===');
  const trRes = await playApi('PUT', `/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}/listings/tr-TR`, {
    language: 'tr-TR',
    title: 'Frostborn: Last Camp',
    shortDescription: 'Hayatta kalma kampı kur, hayatta kalanları kurtar ve ateşini söndürme!',
    fullDescription: TR_DESC,
    video: ''
  });
  console.log('TR listing:', trRes.status === 200 ? 'OK' : `Error ${trRes.status}`);

  // === STEP 3: App Details ===
  console.log('\n=== App Details ===');
  const detailRes = await playApi('PUT', `/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}/details`, {
    defaultLanguage: 'en-US',
    contactEmail: 'support@cytbilisim.com',
    contactWebsite: 'https://cytbilisim.com/frostborn/support/'
  });
  console.log('App details:', detailRes.status === 200 ? 'OK' : `Error ${detailRes.status}`);

  // === STEP 4: Upload Feature Graphic ===
  const featureGraphicPath = 'C:/Users/ickmk/Frostborn/store_assets/feature_graphic.png';
  if (fs.existsSync(featureGraphicPath)) {
    console.log('\n=== Uploading Feature Graphic ===');
    // Delete existing feature graphics first
    await playApi('DELETE', `/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}/listings/en-US/images/featureGraphic`);
    const fgRes = await uploadImage(editId, 'featureGraphic', featureGraphicPath);
    console.log('Feature graphic:', fgRes.status === 200 ? 'OK' : `Error ${fgRes.status}`);
  } else {
    console.log('Feature graphic not found, skipping');
  }

  // === STEP 5: Upload Icon ===
  const iconPath = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';
  if (fs.existsSync(iconPath)) {
    console.log('\n=== Uploading Icon ===');
    await playApi('DELETE', `/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}/listings/en-US/images/icon`);
    const iconRes = await uploadImage(editId, 'icon', iconPath);
    console.log('Icon upload:', iconRes.status === 200 ? 'OK' : `Error ${iconRes.status}`);
  }

  // === STEP 6: Commit Edit ===
  console.log('\n=== Committing Edit ===');
  const commitRes = await playApi('POST', `/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}:commit`, {});
  if (commitRes.status === 200) {
    console.log('Edit committed successfully!');
  } else {
    console.error('Commit failed:', commitRes.status);
    console.error(JSON.stringify(commitRes.body).slice(0,500));
    // Try to validate first
    console.log('Validating edit...');
    const valRes = await playApi('POST', `/androidpublisher/v3/applications/${PACKAGE}/edits/${editId}:validate`, {});
    console.log('Validate status:', valRes.status);
    console.log(JSON.stringify(valRes.body).slice(0,600));
  }

  console.log('\n=== PLAY METADATA COMPLETE ===');
}

main().catch(console.error);

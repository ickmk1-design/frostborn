/**
 * Fill Google Play store listing (EN-US + TR) via Play Developer API.
 * Does NOT touch Data Safety, ad ID, or any track.
 */
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const SA_PATH = 'C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json';
const SA = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
const ICON_PATH = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';
const FG_PATH   = 'C:/Users/ickmk/Frostborn/store_assets/feature_graphic.png';

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

let TOKEN = null;
async function getTok() {
  if (TOKEN) return TOKEN;
  const body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + makePlayJwt();
  const r = await httpReq('POST', 'oauth2.googleapis.com', '/token',
    {'Content-Type':'application/x-www-form-urlencoded','Content-Length': Buffer.byteLength(body)}, body);
  if (!r.b.access_token) throw new Error('No access_token: ' + JSON.stringify(r.b));
  TOKEN = r.b.access_token;
  return TOKEN;
}

async function play(method, path, body) {
  const tok = await getTok();
  const data = body ? JSON.stringify(body) : null;
  return httpReq(method, 'androidpublisher.googleapis.com', path, {
    'Authorization': 'Bearer ' + tok,
    'Content-Type': 'application/json',
    ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
  }, data);
}

async function uploadImg(editId, language, imageType, filePath) {
  const tok = await getTok();
  const buf = fs.readFileSync(filePath);
  const path = `/upload/androidpublisher/v3/applications/${PKG}/edits/${editId}/listings/${language}/images/${imageType}?uploadType=media`;
  return httpReq('POST', 'androidpublisher.googleapis.com', path, {
    'Authorization': 'Bearer ' + tok,
    'Content-Type': 'image/png',
    'Content-Length': buf.length
  }, buf);
}

async function deleteAllImages(editId, language, imageType) {
  return play('DELETE', `/androidpublisher/v3/applications/${PKG}/edits/${editId}/listings/${language}/images/${imageType}`);
}

// ─── Copy ─────────────────────────────────────────────────────────────────────
const EN_TITLE = 'Frostborn: Winter Survival';
const EN_SHORT = 'Chop wood, hunt wolves, fish, build cabins & survive the endless winter';
const EN_FULL = `The world froze and never thawed. You are the last hero on a lonely snowfield — axe in hand, sword at the hip, hungry wolves howling in the dark. Build a camp, keep your workers alive, and claw your way through an eternal winter.

FROSTBORN is a cozy top-down survival game that blends base-building, resource management and action combat. Every log, every fish and every cabin matters.

15 CAMPAIGN LEVELS + ENDLESS MODE
Fight through 15 handcrafted winter levels, each with new biomes, enemies and objectives. When the campaign ends, the Endless Winter opens — survive as long as you can and set your personal record.

CHOP, HUNT, FISH, BUILD
• Chop frozen trees for firewood and construction logs
• Hunt wolves with your sword — mind your health, they bite back
• Cut holes in the ice and fish to feed your workers
• Build warm cabins, fire pits, workshops and storage

COMMAND YOUR WORKERS
Rescue frozen survivors and assign them to jobs. Expand your worker slots, upgrade their tools, and watch your little snow village grow from a single tent into a thriving outpost.

REAL-TIME COMBAT
Packs of wolves hunt in the night. Dodge, slash and hold the line to protect your camp. Every level pushes you to balance economy, defence and exploration.

COZY, OFFLINE, NO ADS WHILE YOU PLAY
Playable fully offline. Clean controls, smooth 60 FPS, no interruptions during a run. Progress is saved after every level.

FEATURES
• 15 campaign levels + endless winter mode
• Fishing, hunting, lumber and cooking loops
• Cabins, fire pits, workbenches and storage
• Worker slot system — rescue and assign survivors
• Wolf AI with real-time sword combat
• Hand-painted winter art, day and night cycle
• No forced ads during gameplay
• One-time in-app upgrades (optional)

Can you survive the longest winter the world has ever seen?`;

const TR_TITLE = 'Frostborn: Kış Hayatta Kalma';
const TR_SHORT = 'Odun kes, kurt avla, balık tut, kabin kur ve kışta hayatta kal!';
const TR_FULL = `Dünya dondu ve bir daha çözülmedi. Issız bir kar tarlasında son kahraman sensin — elinde balta, belinde kılıç, karanlıkta uluyan aç kurtlar. Bir kamp kur, işçilerini hayatta tut ve sonsuz bir kıştan sıyrılmaya çalış.

FROSTBORN; üs kurma, kaynak yönetimi ve aksiyon dövüşünü birleştiren sıcacık bir tepeden görünüm hayatta kalma oyunudur. Her kütük, her balık ve her kabin önemlidir.

15 KAMPANYA BÖLÜMÜ + SONSUZ MOD
Her biri yeni biyomlar, düşmanlar ve hedeflerle gelen 15 el yapımı kış bölümünü aşarak ilerle. Kampanya bitince Sonsuz Kış açılır — ne kadar dayanabildiğini gör ve kendi rekorunu kır.

KES, AVLA, BALIK TUT, İNŞA ET
• Donmuş ağaçları yakacak ve kütük için kes
• Kurtları kılıcınla avla — dikkat et, onlar da ısırır
• Buzda delik aç, balık tut ve işçilerini besle
• Sıcak kabinler, ocaklar, atölyeler ve depolar kur

İŞÇİLERİNİ YÖNET
Donmuş hayatta kalanları kurtar ve görevlendir. İşçi slotlarını genişlet, aletlerini geliştir ve küçük kar köyünün tek çadırdan gelişen bir karakola dönüşmesini izle.

GERÇEK ZAMANLI DÖVÜŞ
Kurt sürüleri geceleri avlanır. Kampını korumak için yana çekil, sav ve safları tut. Her bölüm ekonomi, savunma ve keşfi dengelemeni gerektirir.

SICAK, ÇEVRİMDIŞI, OYUN SIRASINDA REKLAMSIZ
Tamamen çevrimdışı oynanır. Temiz kontroller, akıcı 60 FPS, bir bölüm sırasında kesinti yok. İlerlemen her bölüm sonunda kaydedilir.

ÖZELLİKLER
• 15 kampanya bölümü + sonsuz kış modu
• Balıkçılık, avcılık, kereste ve pişirme döngüleri
• Kabinler, ocaklar, tezgahlar ve depolar
• İşçi slot sistemi — hayatta kalanları kurtar ve görevlendir
• Gerçek zamanlı kılıç dövüşü ile kurt yapay zekâsı
• El boyaması kış sanatı, gündüz ve gece döngüsü
• Oyun sırasında zorunlu reklam yok
• Opsiyonel tek seferlik uygulama içi geliştirmeler

Gelmiş geçmiş en uzun kışta hayatta kalabilecek misin?`;

// Sanity checks
console.log('EN title len:', EN_TITLE.length);
console.log('TR title len:', TR_TITLE.length);
console.log('EN short len:', EN_SHORT.length);
console.log('TR short len:', TR_SHORT.length);
console.log('EN full len :', EN_FULL.length);
console.log('TR full len :', TR_FULL.length);
if (EN_TITLE.length > 30) throw new Error('EN title too long');
if (TR_TITLE.length > 30) throw new Error('TR title too long');
if (EN_SHORT.length > 80) throw new Error('EN short too long');
if (TR_SHORT.length > 80) throw new Error('TR short too long');
if (EN_FULL.length > 4000) throw new Error('EN full too long');
if (TR_FULL.length > 4000) throw new Error('TR full too long');

function sha(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

(async () => {
  console.log('\n=== service account ===');
  console.log('path:', SA_PATH);
  console.log('client_email:', SA.client_email);

  console.log('\n=== creating edit ===');
  const edit = await play('POST', `/androidpublisher/v3/applications/${PKG}/edits`, {});
  if (edit.s !== 200) {
    console.error('edit.insert failed:', edit.s, JSON.stringify(edit.b).slice(0,800));
    process.exit(1);
  }
  const editId = edit.b.id;
  console.log('edit id:', editId, 'expiry:', edit.b.expiryTimeSeconds);

  const results = { editId, operations: [] };

  async function op(label, fn) {
    const r = await fn();
    const summary = {
      op: label,
      status: r.s,
      ok: r.s >= 200 && r.s < 300,
      bodySha: r.raw ? sha(Buffer.from(r.raw)) : null,
      body: r.s >= 400 ? r.b : (r.b && r.b.id ? { id: r.b.id } : (r.b && r.b.sha256 ? { sha256: r.b.sha256 } : (r.b && r.b.language ? { language: r.b.language, title: r.b.title ? r.b.title.slice(0,40) : undefined } : {})))
    };
    results.operations.push(summary);
    console.log(`[${r.s}] ${label}`, r.s >= 400 ? JSON.stringify(r.b).slice(0,700) : summary.body);
    return r;
  }

  // ── EN-US listing ─────────────────────────
  await op('listings.update en-US', () => play(
    'PUT',
    `/androidpublisher/v3/applications/${PKG}/edits/${editId}/listings/en-US`,
    { language: 'en-US', title: EN_TITLE, shortDescription: EN_SHORT, fullDescription: EN_FULL, video: '' }
  ));

  // ── TR listing ────────────────────────────
  await op('listings.update tr-TR', () => play(
    'PUT',
    `/androidpublisher/v3/applications/${PKG}/edits/${editId}/listings/tr-TR`,
    { language: 'tr-TR', title: TR_TITLE, shortDescription: TR_SHORT, fullDescription: TR_FULL, video: '' }
  ));

  // ── Images: delete-then-upload per language ──
  for (const lang of ['en-US', 'tr-TR']) {
    await op(`images.deleteall icon ${lang}`, () => deleteAllImages(editId, lang, 'icon'));
    await op(`images.upload icon ${lang}`, () => uploadImg(editId, lang, 'icon', ICON_PATH));

    await op(`images.deleteall featureGraphic ${lang}`, () => deleteAllImages(editId, lang, 'featureGraphic'));
    await op(`images.upload featureGraphic ${lang}`, () => uploadImg(editId, lang, 'featureGraphic', FG_PATH));
  }

  // ── Application details ──────────────────
  // Read current first so we don't wipe contactPhone
  const curDetails = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${editId}/details`);
  console.log('[', curDetails.s, '] current details:', JSON.stringify(curDetails.b));
  const detailsBody = {
    defaultLanguage: 'en-US',
    contactEmail: 'ibrahim@cytbilisim.com',
    contactWebsite: 'https://cytbilisim.com/frostborn/',
  };
  if (curDetails.b && curDetails.b.contactPhone) detailsBody.contactPhone = curDetails.b.contactPhone;
  await op('details.update', () => play(
    'PUT',
    `/androidpublisher/v3/applications/${PKG}/edits/${editId}/details`,
    detailsBody
  ));

  // ── Commit ───────────────────────────────
  console.log('\n=== commit ===');
  const commit = await play('POST', `/androidpublisher/v3/applications/${PKG}/edits/${editId}:commit`, {});
  console.log('commit status:', commit.s);
  console.log('commit body:', JSON.stringify(commit.b).slice(0,800));
  results.commit = { status: commit.s, body: commit.b };

  // ── Verify listings came back correctly ──
  if (commit.s === 200) {
    // Open a fresh edit just to read back
    const re = await play('POST', `/androidpublisher/v3/applications/${PKG}/edits`, {});
    if (re.s === 200) {
      const reId = re.b.id;
      const l1 = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${reId}/listings/en-US`);
      const l2 = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${reId}/listings/tr-TR`);
      const i1 = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${reId}/listings/en-US/images/icon`);
      const i2 = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${reId}/listings/en-US/images/featureGraphic`);
      const i3 = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${reId}/listings/tr-TR/images/icon`);
      const i4 = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${reId}/listings/tr-TR/images/featureGraphic`);
      const dCur = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${reId}/details`);
      console.log('\n=== verify (fresh edit', reId, ') ===');
      console.log('EN listing:', l1.s, 'title=', l1.b.title, 'shortLen=', (l1.b.shortDescription||'').length, 'fullLen=', (l1.b.fullDescription||'').length);
      console.log('TR listing:', l2.s, 'title=', l2.b.title, 'shortLen=', (l2.b.shortDescription||'').length, 'fullLen=', (l2.b.fullDescription||'').length);
      console.log('EN icon images:', i1.s, JSON.stringify(i1.b).slice(0,400));
      console.log('EN featureGraphic images:', i2.s, JSON.stringify(i2.b).slice(0,400));
      console.log('TR icon images:', i3.s, JSON.stringify(i3.b).slice(0,400));
      console.log('TR featureGraphic images:', i4.s, JSON.stringify(i4.b).slice(0,400));
      console.log('details:', dCur.s, JSON.stringify(dCur.b));
      // Discard this read-only edit
      await play('DELETE', `/androidpublisher/v3/applications/${PKG}/edits/${reId}`);
    } else {
      console.log('could not open verify edit:', re.s, JSON.stringify(re.b).slice(0,300));
    }
  }

  fs.writeFileSync('C:/Users/ickmk/Frostborn/play_fill_listing_result.json', JSON.stringify(results, null, 2));
  console.log('\n=== DONE ===');
})().catch(e => {
  console.error('FATAL:', e.stack || e.message);
  process.exit(1);
});

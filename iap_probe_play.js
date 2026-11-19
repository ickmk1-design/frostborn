const fs = require('fs');
const https = require('https');
const crypto = require('crypto');
const SA = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
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
async function main() {
  const r = await play('GET', `/androidpublisher/v3/applications/${PKG}/oneTimeProducts`);
  console.log('status:', r.s);
  fs.writeFileSync('C:/Users/ickmk/Frostborn/play_onetime_dump.json', JSON.stringify(r.b, null, 2));
  console.log('full body written to play_onetime_dump.json');
  const products = r.b.oneTimeProducts || [];
  console.log('count:', products.length);
  for (const p of products) {
    console.log(`\n--- ${p.productId} ---`);
    console.log('  listings:');
    for (const l of (p.listings || [])) {
      console.log(`    ${l.languageCode}: title="${l.title}" desc="${l.description}"`);
    }
    for (const po of (p.purchaseOptions || [])) {
      console.log(`  purchaseOption id=${po.purchaseOptionId} state=${po.state}`);
      const us = (po.regionalPricingAndAvailabilityConfigs || []).find(c => c.regionCode === 'US');
      console.log(`    US price:`, JSON.stringify(us?.price));
      console.log(`    newRegionsConfig USD:`, JSON.stringify(po.newRegionsConfig?.usdPrice));
      console.log(`    regions configured:`, po.regionalPricingAndAvailabilityConfigs?.length || 0);
    }
  }
}
main().catch(e => console.error('fatal', e));

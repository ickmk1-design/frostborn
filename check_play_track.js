const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const SA = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const pkg = 'com.cytbilisim.frostborn';

function base64url(b) { return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
function makeJwt(sa) {
  const n = Math.floor(Date.now()/1000);
  const h = base64url(Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const p = base64url(Buffer.from(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n})));
  const s = crypto.createSign('RSA-SHA256'); s.update(h+'.'+p);
  return h+'.'+p+'.'+base64url(s.sign(sa.private_key));
}
function req(method, host, path, hdrs, body) {
  return new Promise((resolve, reject) => {
    const q = https.request({hostname:host, path, method, headers:hdrs}, x => {
      let d = ''; x.on('data', c => d+=c); x.on('end', () => resolve({s:x.statusCode, b:safeJson(d)}));
    });
    q.on('error', reject);
    if (body) q.write(body);
    q.end();
  });
}
function safeJson(s) { try { return JSON.parse(s); } catch(e) { return {_raw: s}; } }

async function main() {
  const tok = (await req('POST','oauth2.googleapis.com','/token',
    {'Content-Type':'application/x-www-form-urlencoded'},
    'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+makeJwt(SA))).b.access_token;
  const A = {'Authorization':'Bearer '+tok};
  const eid = (await req('POST','androidpublisher.googleapis.com',
    '/androidpublisher/v3/applications/'+pkg+'/edits',
    {...A,'Content-Type':'application/json','Content-Length':'2'},'{}')).b.id;
  console.log('Edit:', eid);

  const track = await req('GET','androidpublisher.googleapis.com',
    '/androidpublisher/v3/applications/'+pkg+'/edits/'+eid+'/tracks/internal', A);
  console.log('Internal track status:', track.s);
  console.log('Track:', JSON.stringify(track.b, null, 2));

  // Also check bundles
  const bundles = await req('GET','androidpublisher.googleapis.com',
    '/androidpublisher/v3/applications/'+pkg+'/edits/'+eid+'/bundles', A);
  console.log('Bundles status:', bundles.s);
  console.log('Bundles:', JSON.stringify(bundles.b));
}
main().catch(e => console.error('Error:', e.message));

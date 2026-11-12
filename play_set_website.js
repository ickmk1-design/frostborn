// Set Google Play store-listing website for en-US (and tr-TR if present).
// Uses the same service-account auth flow as rollout_and_icon.js.
const https = require('https');
const fs    = require('fs');
const crypto = require('crypto');

const SA  = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
const WEBSITE = 'https://cytbilisim.com';

function b64u(b){return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
function jwt(){
  const n=Math.floor(Date.now()/1000);
  const h=b64u(Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const p=b64u(Buffer.from(JSON.stringify({iss:SA.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n})));
  const s=crypto.createSign('RSA-SHA256'); s.update(h+'.'+p);
  return h+'.'+p+'.'+b64u(s.sign(SA.private_key));
}
function getTok(){
  return new Promise((res,rej)=>{
    const body='grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+jwt();
    const r=https.request({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},x=>{
      let d=''; x.on('data',c=>d+=c); x.on('end',()=>res(JSON.parse(d).access_token));
    }); r.on('error',rej); r.write(body); r.end();
  });
}
function play(t,method,path,body){
  const data=body?JSON.stringify(body):null;
  return new Promise((res,rej)=>{
    const r=https.request({hostname:'androidpublisher.googleapis.com',path,method,headers:{Authorization:'Bearer '+t,'Content-Type':'application/json',...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},x=>{
      let d=''; x.on('data',c=>d+=c); x.on('end',()=>{ try{res({s:x.statusCode,b:JSON.parse(d)})}catch(e){res({s:x.statusCode,b:{_raw:d.substring(0,500)}})}});
    }); r.on('error',rej); if(data)r.write(data); r.end();
  });
}

(async()=>{
  const t=await getTok();
  const e=await play(t,'POST','/androidpublisher/v3/applications/'+PKG+'/edits',{});
  if (e.s>=300){ console.error('create edit failed', e.s, e.b); process.exit(1); }
  const eid=e.b.id;
  console.log('Edit ID:', eid);

  // List existing listings
  const list=await play(t,'GET','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+'/listings');
  console.log('Current listings status', list.s);
  const items=list.b.listings||[];
  console.log('Locales:', items.map(l=>l.language).join(', '));

  const locales = items.map(l=>l.language);
  if (locales.length === 0) locales.push('en-US');

  for (const lang of locales) {
    // GET current listing so we preserve title/shortDescription/fullDescription
    const cur = await play(t,'GET','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+'/listings/'+lang);
    if (cur.s>=300){ console.error('  get',lang,'failed',cur.s,cur.b); continue; }
    const body = {
      language: lang,
      title:            cur.b.title,
      shortDescription: cur.b.shortDescription,
      fullDescription:  cur.b.fullDescription,
      video:            cur.b.video,
    };
    // Note: Play API uses `fullDescription`, `shortDescription`, `title`, `video`.
    // The store-listing *website* field is not under `listings`; it's on the per-app
    // `contactWebsite` (set via the edit's `details` endpoint).
    const r = await play(t,'PUT','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+'/listings/'+lang, body);
    console.log('  listing',lang, r.s<300?'OK':'ERR '+r.s);
    if (r.s>=300) console.log('   ', JSON.stringify(r.b).slice(0,300));
  }

  // Set the developer contact website on the edit's /details endpoint — this is the
  // "Website" shown on the Play Store listing.
  const details = await play(t,'GET','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+'/details');
  console.log('Current details:', JSON.stringify(details.b).slice(0,300));
  const put = await play(t,'PUT','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+'/details', {
    contactEmail:   details.b.contactEmail   || 'ickmk1@gmail.com',
    contactPhone:   details.b.contactPhone   || undefined,
    contactWebsite: WEBSITE,
    defaultLanguage: details.b.defaultLanguage || 'en-US',
  });
  console.log('details PUT (contactWebsite='+WEBSITE+'):', put.s<300?'OK':'ERR '+put.s);
  if (put.s>=300) console.log(JSON.stringify(put.b).slice(0,500));

  const commit = await play(t,'POST','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+':commit',{});
  console.log('commit:', commit.s<300?'OK':'ERR '+commit.s);
  if (commit.s>=300) console.log(JSON.stringify(commit.b).slice(0,500));
})().catch(e=>{ console.error('Fatal:', e); process.exit(1); });

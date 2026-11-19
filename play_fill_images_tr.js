/**
 * Upload icon + feature graphic to tr-TR listing.
 * EN-US already has both matching our local files.
 */
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const SA_PATH = 'C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json';
const SA = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
const ICON_PATH = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';
const FG_PATH   = 'C:/Users/ickmk/Frostborn/store_assets/feature_graphic.png';

function b64u(b){return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
function jwt(){
  const n=Math.floor(Date.now()/1000);
  const h=b64u(Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const p=b64u(Buffer.from(JSON.stringify({iss:SA.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n})));
  const s=crypto.createSign('RSA-SHA256'); s.update(h+'.'+p);
  return h+'.'+p+'.'+b64u(s.sign(SA.private_key));
}
function hr(m,ho,p,h,b){
  return new Promise((res,rej)=>{
    const r=https.request({hostname:ho,path:p,method:m,headers:h},x=>{
      const c=[]; x.on('data',d=>c.push(d));
      x.on('end',()=>{
        const t=Buffer.concat(c).toString();
        let j; try{j=t?JSON.parse(t):{};}catch{j={_raw:t.slice(0,500)};}
        res({s:x.statusCode,b:j});
      });
    });
    r.on('error',rej); if(b) r.write(b); r.end();
  });
}
let TOK=null;
async function getTok(){
  if (TOK) return TOK;
  const body='grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+jwt();
  const r=await hr('POST','oauth2.googleapis.com','/token',{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)},body);
  TOK=r.b.access_token; return TOK;
}
async function api(m,p,body){
  const tok=await getTok();
  const data=body?JSON.stringify(body):null;
  return hr(m,'androidpublisher.googleapis.com',p,{
    Authorization:'Bearer '+tok,'Content-Type':'application/json',
    ...(data?{'Content-Length':Buffer.byteLength(data)}:{})
  },data);
}
async function uploadImg(editId, lang, type, filePath){
  const tok=await getTok();
  const buf=fs.readFileSync(filePath);
  // Correct upload URL: /upload/... /listings/{lang}/{imageType}?uploadType=media
  const p=`/upload/androidpublisher/v3/applications/${PKG}/edits/${editId}/listings/${lang}/${type}?uploadType=media`;
  return hr('POST','androidpublisher.googleapis.com',p,{
    Authorization:'Bearer '+tok,'Content-Type':'image/png','Content-Length':buf.length
  },buf);
}

(async()=>{
  console.log('SA:', SA_PATH);
  console.log('client_email:', SA.client_email);
  const e=await api('POST',`/androidpublisher/v3/applications/${PKG}/edits`,{});
  if (e.s !== 200){ console.error('edit fail', e.s, JSON.stringify(e.b)); process.exit(1); }
  const eid=e.b.id;
  console.log('edit:', eid);

  const results=[];
  for (const lang of ['en-US','tr-TR']) {
    for (const [type, file] of [['icon', ICON_PATH], ['featureGraphic', FG_PATH]]) {
      // check current
      const lr=await api('GET',`/androidpublisher/v3/applications/${PKG}/edits/${eid}/listings/${lang}/${type}`);
      const existing=lr.b.images||[];
      const localSha=require('crypto').createHash('sha1').update(fs.readFileSync(file)).digest('hex');
      const alreadyThere = existing.some(i => i.sha1 === localSha);
      console.log(`[${lang} ${type}] existing=${existing.length} alreadyMatch=${alreadyThere}`);
      if (alreadyThere) {
        results.push({ lang, type, status: 'already-up-to-date', images: existing });
        continue;
      }
      // delete all, then upload
      const dr=await api('DELETE',`/androidpublisher/v3/applications/${PKG}/edits/${eid}/listings/${lang}/${type}`);
      console.log(`  deleteall ${lang} ${type} ->`, dr.s, JSON.stringify(dr.b).slice(0,200));
      const ur=await uploadImg(eid, lang, type, file);
      console.log(`  upload ${lang} ${type} ->`, ur.s, JSON.stringify(ur.b).slice(0,300));
      results.push({ lang, type, upload: { s: ur.s, body: ur.b } });
    }
  }

  console.log('\n=== commit ===');
  const c=await api('POST',`/androidpublisher/v3/applications/${PKG}/edits/${eid}:commit`,{});
  console.log('commit:', c.s, JSON.stringify(c.b).slice(0,300));

  // Verify
  const v=await api('POST',`/androidpublisher/v3/applications/${PKG}/edits`,{});
  if (v.s === 200){
    const vid=v.b.id;
    console.log('\n=== verify edit', vid, '===');
    for (const lang of ['en-US','tr-TR']) {
      for (const type of ['icon','featureGraphic']) {
        const r=await api('GET',`/androidpublisher/v3/applications/${PKG}/edits/${vid}/listings/${lang}/${type}`);
        console.log(lang, type, '->', r.s, JSON.stringify(r.b).slice(0,350));
      }
    }
    await api('DELETE',`/androidpublisher/v3/applications/${PKG}/edits/${vid}`);
  }
  fs.writeFileSync('C:/Users/ickmk/Frostborn/play_fill_images_tr_result.json', JSON.stringify(results, null, 2));
})().catch(e => { console.error('FATAL', e.stack||e.message); process.exit(1); });

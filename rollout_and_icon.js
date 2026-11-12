/**
 * Run after completing App Rating + Target Audience in Play Console.
 * Rolls out internal track (vc=10 → completed) and uploads the 512×512 store icon.
 */
const https = require('https');
const fs = require('fs'), crypto = require('crypto');
const SA = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json','utf8'));
const PKG = 'com.cytbilisim.frostborn';
const ICON_PATH = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';
const VERSION_CODE = '7';

function b64u(b){return b.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'')}
function jwt(){const n=Math.floor(Date.now()/1000),h=b64u(Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT'}))),p=b64u(Buffer.from(JSON.stringify({iss:SA.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',exp:n+3600,iat:n})));const s=crypto.createSign('RSA-SHA256');s.update(h+'.'+p);return h+'.'+p+'.'+b64u(s.sign(SA.private_key))}
async function getTok(){return new Promise((res,rej)=>{const body='grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion='+jwt();const r=https.request({hostname:'oauth2.googleapis.com',path:'/token',method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'}},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>res(JSON.parse(d).access_token))});r.on('error',rej);r.write(body);r.end()})}
async function play(t,method,path,body){const data=body?JSON.stringify(body):null;return new Promise((res,rej)=>{const r=https.request({hostname:'androidpublisher.googleapis.com',path,method,headers:{'Authorization':'Bearer '+t,'Content-Type':'application/json',...(data?{'Content-Length':Buffer.byteLength(data)}:{})}},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>{try{res({s:x.statusCode,b:JSON.parse(d)})}catch(e){res({s:x.statusCode,b:{_raw:d.substring(0,500)}})}})});r.on('error',rej);if(data)r.write(data);r.end()})}
async function playBinary(t,path,buf,mime){return new Promise((res,rej)=>{const r=https.request({hostname:'androidpublisher.googleapis.com',path,method:'POST',headers:{'Authorization':'Bearer '+t,'Content-Type':mime,'Content-Length':buf.length}},x=>{let d='';x.on('data',c=>d+=c);x.on('end',()=>{try{res({s:x.statusCode,b:JSON.parse(d)})}catch(e){res({s:x.statusCode,b:{_raw:d.substring(0,200)}})}})});r.on('error',rej);r.write(buf);r.end()})}
function log(ok,label,extra){console.log(ok?'  ✓ '+label:'  ✗ '+label, extra||'')}

(async()=>{
  const t=await getTok();
  const e=await play(t,'POST','/androidpublisher/v3/applications/'+PKG+'/edits',{});
  log(e.s<300,'create edit','HTTP '+e.s); if(e.s>=300){console.error(e.b);process.exit(1)}
  const eid=e.b.id;
  console.log('  Edit ID:', eid);

  // Roll out internal track
  const tr=await play(t,'PUT','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+'/tracks/internal',
    {track:'internal',releases:[{versionCodes:[VERSION_CODE],status:'completed'}]});
  log(tr.s<300,'track → completed (vc='+VERSION_CODE+')','HTTP '+tr.s);
  if(tr.s>=300){console.error(tr.b);process.exit(1)}

  // Upload 512×512 store icon
  const iconBuf=fs.readFileSync(ICON_PATH);
  const icon=await playBinary(t,
    '/upload/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+'/listings/en-US/icon?uploadType=media',
    iconBuf,'image/png');
  log(icon.s<300,'upload icon','HTTP '+icon.s);
  if(icon.s>=300) console.error('  ',icon.b);
  else console.log('  sha1:', icon.b.image?.sha1);

  // Commit
  const c=await play(t,'POST','/androidpublisher/v3/applications/'+PKG+'/edits/'+eid+':commit',{});
  log(c.s<300,'commit edit','HTTP '+c.s);
  if(c.s>=300) console.error('  ',JSON.stringify(c.b));
  else console.log('\n=== Done — vc=10 rolled out to internal testers ===');
})().catch(e=>console.error('Fatal:',e.message));

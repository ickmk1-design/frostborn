const fs = require('fs');
const https = require('https');

const SA = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PACKAGE = 'com.cytbilisim.frostborn';

function makeGoogleJwt() {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now })).toString('base64url');
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(header + '.' + payload);
  const sig = sign.sign(SA.private_key).toString('base64url');
  return header + '.' + payload + '.' + sig;
}

function getToken() {
  return new Promise((resolve, reject) => {
    const jwt = makeGoogleJwt();
    const body = 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt;
    const req = https.request({ hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { const r = JSON.parse(d); r.access_token ? resolve(r.access_token) : reject(new Error(JSON.stringify(r))); });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

function playApi(token, method, path, body) {
  return new Promise((resolve) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = https.request({ hostname: 'androidpublisher.googleapis.com', path, method, headers }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch(e) { resolve({ status: res.statusCode, body: {} }); } });
    });
    req.on('error', e => resolve({ status: 0, body: { error: e.message } }));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function uploadImg(token, editId, language, imageType, filePath) {
  return new Promise((resolve) => {
    const imgBuf = fs.readFileSync(filePath);
    // Correct URL format for Play API image upload
    const path = '/androidpublisher/v3/applications/' + PACKAGE + '/edits/' + editId + '/listings/' + language + '/images/' + imageType;
    const req = https.request({
      hostname: 'androidpublisher.googleapis.com', path, method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'image/png', 'Content-Length': imgBuf.length }
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { 
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d.slice(0,200) }); }
      });
    });
    req.on('error', e => resolve({ status: 0, body: e.message }));
    req.write(imgBuf); req.end();
  });
}

async function main() {
  console.log('Getting token...');
  const token = await getToken();

  // Create new edit
  const editRes = await playApi(token, 'POST', '/androidpublisher/v3/applications/' + PACKAGE + '/edits', {});
  if (editRes.status !== 200) { console.error('Edit create failed:', editRes.status, JSON.stringify(editRes.body).slice(0,300)); return; }
  const editId = editRes.body.id;
  console.log('Edit ID:', editId);

  // Upload feature graphic (1024x500)
  const fgPath = 'C:/Users/ickmk/Frostborn/store_assets/feature_graphic.png';
  if (fs.existsSync(fgPath)) {
    console.log('\nUploading feature graphic...');
    // First list existing to delete
    const listRes = await playApi(token, 'GET', '/androidpublisher/v3/applications/' + PACKAGE + '/edits/' + editId + '/listings/en-US/images/featureGraphic', null);
    console.log('Existing FG:', listRes.status, (listRes.body.images || []).length, 'images');
    for (const img of (listRes.body.images || [])) {
      await playApi(token, 'DELETE', '/androidpublisher/v3/applications/' + PACKAGE + '/edits/' + editId + '/listings/en-US/images/featureGraphic/' + img.id, null);
    }
    const uploadRes = await uploadImg(token, editId, 'en-US', 'featureGraphic', fgPath);
    console.log('Feature graphic upload:', uploadRes.status, typeof uploadRes.body === 'object' ? JSON.stringify(uploadRes.body).slice(0,200) : uploadRes.body);
  }

  // Upload icon 512x512
  const iconPath = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';
  if (fs.existsSync(iconPath)) {
    console.log('\nUploading icon...');
    const listRes = await playApi(token, 'GET', '/androidpublisher/v3/applications/' + PACKAGE + '/edits/' + editId + '/listings/en-US/images/icon', null);
    console.log('Existing icons:', listRes.status, (listRes.body.images || []).length);
    for (const img of (listRes.body.images || [])) {
      await playApi(token, 'DELETE', '/androidpublisher/v3/applications/' + PACKAGE + '/edits/' + editId + '/listings/en-US/images/icon/' + img.id, null);
    }
    const uploadRes = await uploadImg(token, editId, 'en-US', 'icon', iconPath);
    console.log('Icon upload:', uploadRes.status, typeof uploadRes.body === 'object' ? JSON.stringify(uploadRes.body).slice(0,200) : uploadRes.body);
  }

  // Commit
  console.log('\nCommitting edit...');
  const commitRes = await playApi(token, 'POST', '/androidpublisher/v3/applications/' + PACKAGE + '/edits/' + editId + ':commit', {});
  console.log('Commit:', commitRes.status === 200 ? 'OK' : 'Error ' + commitRes.status, JSON.stringify(commitRes.body).slice(0,300));
}
main().catch(console.error);

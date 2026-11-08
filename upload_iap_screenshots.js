/**
 * Uploads review screenshots to each iOS IAP via ASC API.
 */
const fs = require('fs');
const https = require('https');
const crypto = require('crypto');

const KEY_ID  = 'K8CBHMQ2S8';
const ISSUER  = '37ca6f84-e761-49dd-9577-aa0e349a5953';
const KEY_FILE = 'C:/Users/ickmk/Downloads/AuthKey_K8CBHMQ2S8.p8';

const IAPS = [
  { id: '6831936237', name: 'remove_ads',    img: 'C:/Users/ickmk/Frostborn/iap_screenshots/remove_ads.png' },
  { id: '6831936238', name: 'starter_pack',  img: 'C:/Users/ickmk/Frostborn/iap_screenshots/starter_pack.png' },
  { id: '6831936270', name: 'coins_small',   img: 'C:/Users/ickmk/Frostborn/iap_screenshots/coins_small.png' },
  { id: '6831936296', name: 'coins_medium',  img: 'C:/Users/ickmk/Frostborn/iap_screenshots/coins_medium.png' },
  { id: '6831936149', name: 'coins_large',   img: 'C:/Users/ickmk/Frostborn/iap_screenshots/coins_large.png' },
];

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
    const req = https.request({
      hostname: 'api.appstoreconnect.apple.com', path, method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function uploadBinary(url, headers, buf) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqHeaders = {};
    for (const h of headers) reqHeaders[h.name] = h.value;
    reqHeaders['Content-Length'] = buf.length;
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'PUT', headers: reqHeaders }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

async function uploadScreenshot(iap) {
  const buf = fs.readFileSync(iap.img);
  const fileName = `${iap.name}.png`;

  // Check for existing image and delete it
  const existingRes = await api('GET', `/v2/inAppPurchases/${iap.id}/images`);
  for (const img of (existingRes.body?.data || [])) {
    await api('DELETE', `/v1/inAppPurchaseImages/${img.id}`);
  }

  // Reserve upload slot
  const reserveRes = await api('POST', '/v1/inAppPurchaseImages', {
    data: {
      type: 'inAppPurchaseImages',
      attributes: { fileSize: buf.length, fileName },
      relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id: iap.id } } },
    },
  });
  if (reserveRes.status !== 201) {
    console.log(`✗ ${iap.name} reserve [${reserveRes.status}]: ${JSON.stringify(reserveRes.body?.errors?.[0]).substring(0,200)}`);
    return;
  }

  const imgId = reserveRes.body.data.id;
  const ops = reserveRes.body.data.attributes.uploadOperations;
  if (!ops?.length) { console.log(`✗ ${iap.name}: no upload operations`); return; }

  // Upload binary
  await uploadBinary(ops[0].url, ops[0].requestHeaders || [], buf);

  // Commit
  const md5 = crypto.createHash('md5').update(buf).digest('hex');
  const commitRes = await api('PATCH', `/v1/inAppPurchaseImages/${imgId}`, {
    data: { type: 'inAppPurchaseImages', id: imgId, attributes: { uploaded: true, sourceFileChecksum: md5 } },
  });

  const ok = commitRes.status === 200 || commitRes.status === 201;
  console.log(`${ok ? '✓' : '✗'} ${iap.name} [${commitRes.status}]`);
  if (!ok) console.log('  Error:', JSON.stringify(commitRes.body?.errors?.[0]).substring(0, 300));
}

async function main() {
  console.log('Uploading IAP review screenshots...');
  for (const iap of IAPS) {
    await uploadScreenshot(iap);
    await new Promise(r => setTimeout(r, 500));
  }
  console.log('Done.');
}

main().catch(console.error);

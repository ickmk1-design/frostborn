/**
 * Polls the Codemagic build, then:
 *   1. Rolls out the internal track (draft → completed)
 *   2. Uploads the 512×512 store icon
 * in a single committed edit.
 */
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');

const CM_TOKEN = 'f2vk9kK-LaWUCErQwqrnBKkuMN5QcIj7rRnu3mwnINw';
const BUILD_ID = '6af1874e7bd0e45d96f54af7';
const SA  = JSON.parse(fs.readFileSync('C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json', 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
const ICON_PATH = 'C:/Users/ickmk/Frostborn/store_assets/play_icon_512.png';

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpReq(method, host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path, method, headers }, x => {
      const chunks = [];
      x.on('data', c => chunks.push(c));
      x.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = text ? JSON.parse(text) : {}; } catch { json = { _raw: text }; }
        resolve({ s: x.statusCode, b: json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Codemagic ─────────────────────────────────────────────────────────────────
function cmGet(path) {
  return httpReq('GET', 'api.codemagic.io', path, { 'x-auth-token': CM_TOKEN, 'Content-Type': 'application/json' });
}

// ── Play auth ─────────────────────────────────────────────────────────────────
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
    'Authorization': 'Bearer '+tok,
    'Content-Type': 'application/json',
    ...(data ? {'Content-Length': Buffer.byteLength(data)} : {})
  }, data);
}
async function playBinary(path, buf, mimeType) {
  const tok = await playTok();
  return httpReq('POST', 'androidpublisher.googleapis.com', path, {
    'Authorization': 'Bearer '+tok,
    'Content-Type': mimeType,
    'Content-Length': buf.length
  }, buf);
}

function log(ok, label, extra) {
  console.log(ok ? `  ✓ ${label}` : `  ✗ ${label}`, extra||'');
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Poll build ────────────────────────────────────────────────────────────────
async function waitForBuild() {
  console.log(`Polling build ${BUILD_ID}…`);
  for (let attempt = 0; attempt < 60; attempt++) {
    const r = await cmGet(`/builds/${BUILD_ID}`);
    const build = r.b.build || (r.b.builds && r.b.builds[0]);
    const status = build?.status;
    console.log(`  [${new Date().toISOString().slice(11,19)}] status: ${status}`);
    if (status === 'finished') return build;
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Build ${status}: ${JSON.stringify(build).substring(0, 400)}`);
    }
    await sleep(60_000); // poll every minute
  }
  throw new Error('Build timed out after 60 min');
}

// ── Post-build: rollout + icon ────────────────────────────────────────────────
async function rolloutAndIcon(versionCode) {
  console.log(`\n=== Play: edit (rollout vc=${versionCode} + icon) ===`);
  const editR = await play('POST', `/androidpublisher/v3/applications/${PKG}/edits`, {});
  log(editR.s < 300, 'create edit', `HTTP ${editR.s}`);
  if (editR.s >= 300) { console.error(JSON.stringify(editR.b)); throw new Error('edit create failed'); }
  const eid = editR.b.id;
  console.log('  Edit ID:', eid);

  // Roll out internal track (completed = rolled out to all internal testers)
  const trackR = await play('PUT',
    `/androidpublisher/v3/applications/${PKG}/edits/${eid}/tracks/internal`,
    { track: 'internal', releases: [{ versionCodes: [String(versionCode)], status: 'completed' }] });
  log(trackR.s < 300, `track → completed (vc=${versionCode})`, `HTTP ${trackR.s}`);
  if (trackR.s >= 300) console.error('  ', JSON.stringify(trackR.b).substring(0,400));

  // Upload 512x512 store icon
  const iconBuf = fs.readFileSync(ICON_PATH);
  const iconR = await playBinary(
    `/upload/androidpublisher/v3/applications/${PKG}/edits/${eid}/listings/en-US/icon?uploadType=media`,
    iconBuf, 'image/png');
  log(iconR.s < 300, 'upload icon', `HTTP ${iconR.s}`);
  if (iconR.s >= 300) console.error('  ', JSON.stringify(iconR.b).substring(0,300));
  else console.log('  sha1:', iconR.b.image?.sha1);

  // Commit
  const commitR = await play('POST',
    `/androidpublisher/v3/applications/${PKG}/edits/${eid}:commit`, {});
  log(commitR.s < 300, 'commit edit', `HTTP ${commitR.s}`);
  if (commitR.s >= 300) console.error('  ', JSON.stringify(commitR.b).substring(0,400));
}

async function main() {
  const build = await waitForBuild();
  console.log('  Build finished! Extracting versionCode…');

  // Try to get versionCode from build artifacts/logs
  // Fallback: infer from track (what Codemagic just uploaded)
  let versionCode = null;
  try {
    const r = await cmGet(`/builds/${BUILD_ID}`);
    const b = r.b.build || (r.b.builds && r.b.builds[0]);
    // Build number is in b.buildNumber; versionCode = buildNumber + VERSION_CODE_BASE (5)
    if (b?.buildNumber) versionCode = b.buildNumber + 5;
    console.log('  buildNumber:', b?.buildNumber, '→ versionCode:', versionCode);
  } catch {}

  if (!versionCode) {
    // Fallback: check what's currently on the internal track
    const editR = await play('POST', `/androidpublisher/v3/applications/${PKG}/edits`, {});
    if (editR.s < 300) {
      const eid = editR.b.id;
      const trackR = await play('GET', `/androidpublisher/v3/applications/${PKG}/edits/${eid}/tracks/internal`);
      const releases = trackR.b.releases || [];
      const vcs = releases.flatMap(r => r.versionCodes || []).map(Number).sort((a,b)=>b-a);
      versionCode = vcs[0];
      console.log('  versionCode from track:', versionCode);
      // Abort this edit (we don't use it)
      await play('DELETE', `/androidpublisher/v3/applications/${PKG}/edits/${eid}`);
    }
  }

  if (!versionCode) throw new Error('Could not determine versionCode');
  await rolloutAndIcon(versionCode);
  console.log('\n=== Done ===');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

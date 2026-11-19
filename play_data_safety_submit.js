/**
 * Frostborn — Google Play Data Safety submission.
 *
 * Uploads a filled-in Data Safety CSV (string) to the Play Console via:
 *   POST androidpublisher.googleapis.com/androidpublisher/v3/applications/
 *        com.cytbilisim.frostborn/dataSafety
 *   Body: { "safetyLabels": "<CSV>" }
 *
 * Uses the same service-account JSON as the project's other Play API callers
 * (see launch_iaps_ds_asc.js).
 *
 * The CSV template matches Google's current sample (764 rows), with only the
 * response_value column (col 3) modified per the declaration map below.
 *
 * Usage: node play_data_safety_submit.js
 */

const https = require('https');
const fs    = require('fs');
const crypto = require('crypto');
const path  = require('path');

const SA_PATH = 'C:/Users/ickmk/Desktop/projeler-claude/galeripost/google-service-account.json';
const SA  = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
const PKG = 'com.cytbilisim.frostborn';
const DELETION_URL = 'https://cytbilisim.com/frostborn/privacy/#deletion';
const TEMPLATE_PATH = path.resolve(__dirname, 'play_data_safety_template.csv');

// ───────────────────────── HTTP helpers ────────────────────────────────────
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
function b64u(buf) {
  return buf.toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function makePlayJwt() {
  const n = Math.floor(Date.now()/1000);
  const h = b64u(Buffer.from(JSON.stringify({ alg:'RS256', typ:'JWT' })));
  const p = b64u(Buffer.from(JSON.stringify({
    iss: SA.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: n + 3600, iat: n,
  })));
  const s = crypto.createSign('RSA-SHA256'); s.update(h + '.' + p);
  return h + '.' + p + '.' + b64u(s.sign(SA.private_key));
}
let _playTok = null;
async function playTok() {
  if (_playTok) return _playTok;
  const r = await httpReq('POST', 'oauth2.googleapis.com', '/token',
    { 'Content-Type':'application/x-www-form-urlencoded' },
    'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + makePlayJwt());
  if (!r.b.access_token) {
    console.error('Failed to get Play OAuth token:', r.s, r.raw);
    process.exit(1);
  }
  _playTok = r.b.access_token;
  return _playTok;
}
async function play(method, path, body) {
  const tok = await playTok();
  const data = body ? JSON.stringify(body) : null;
  return httpReq(method, 'androidpublisher.googleapis.com', path, {
    'Authorization': 'Bearer ' + tok,
    'Content-Type': 'application/json',
    ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
  }, data);
}

// ─────────────────────── CSV parse / stringify ─────────────────────────────
// Minimal RFC-4180 CSV parser (handles quoted fields with embedded commas /
// escaped double-quotes). We assume no embedded CRLFs in fields.
function parseCsvLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvStringifyRow(cols) { return cols.map(csvEscape).join(','); }

// ─────────────────────── Declaration spec ──────────────────────────────────
// Data types the user wants declared (collection=yes).
// Everything else in the template is left blank (not declared).
//
// Keys are the Response ID (column 2) of PSL_DATA_TYPES_* rows.
// Each value says:
//   collect: 'ONLY_COLLECTED' | 'ONLY_SHARED' | 'BOTH'
//   purposes: list of PSL_* purpose IDs for collection
//   sharingPurposes: list of PSL_* purpose IDs for sharing (empty if not shared)
//   optional: false  -> data collection is required (user can't turn off)
//   ephemeral: false
const DECLARED = {
  // Location
  PSL_APPROX_LOCATION: {
    collect: 'BOTH',
    purposes: ['PSL_ADVERTISING', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
    sharingPurposes: ['PSL_ADVERTISING', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
    optional: false,
    ephemeral: false,
  },
  // App activity — per sample template, "App interactions" == PSL_USER_INTERACTION
  PSL_USER_INTERACTION: {
    collect: 'BOTH',
    purposes: ['PSL_ADVERTISING', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
    sharingPurposes: ['PSL_ADVERTISING', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
    optional: false,
    ephemeral: false,
  },
  // Device or other IDs (subsumes Advertising ID in the current Data Safety form)
  PSL_DEVICE_ID: {
    collect: 'BOTH',
    purposes: ['PSL_ADVERTISING', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
    sharingPurposes: ['PSL_ADVERTISING', 'PSL_ANALYTICS', 'PSL_FRAUD_PREVENTION_SECURITY'],
    optional: false,
    ephemeral: false,
  },
  // Crash logs — collected only, analytics
  PSL_CRASH_LOGS: {
    collect: 'ONLY_COLLECTED',
    purposes: ['PSL_ANALYTICS'],
    sharingPurposes: [],
    optional: false,
    ephemeral: false,
  },
  // Diagnostics
  PSL_PERFORMANCE_DIAGNOSTICS: {
    collect: 'ONLY_COLLECTED',
    purposes: ['PSL_ANALYTICS'],
    sharingPurposes: [],
    optional: false,
    ephemeral: false,
  },
  // Purchase history — collected only, app functionality
  PSL_PURCHASE_HISTORY: {
    collect: 'ONLY_COLLECTED',
    purposes: ['PSL_APP_FUNCTIONALITY'],
    sharingPurposes: [],
    optional: false,
    ephemeral: false,
  },
};

// ─────────────────────── Build filled-in CSV ───────────────────────────────
function buildCsv() {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  // Normalise line endings; keep final-newline behaviour by splitting then joining.
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const header = lines.shift();
  const rows = lines.filter(l => l.length > 0).map(parseCsvLine);

  // Build set of declared data-type response IDs for quick lookup.
  const declaredSet = new Set(Object.keys(DECLARED));

  const outRows = rows.map(cols => {
    // cols = [question_id, response_id, response_value, answer_requirement, label]
    const qid = cols[0], rid = cols[1];
    let val = '';  // default: blank (not declared)

    // 1) Top-level overview flags
    if (qid === 'PSL_DATA_COLLECTION_COLLECTS_PERSONAL_DATA' && rid === '') val = 'TRUE';
    else if (qid === 'PSL_DATA_COLLECTION_ENCRYPTED_IN_TRANSIT' && rid === '') val = 'TRUE';
    else if (qid === 'PSL_DATA_COLLECTION_USER_REQUEST_DELETE' && rid === '') val = 'TRUE';
    // Newer schema: "Supported account creation methods" is REQUIRED.
    // Frostborn has no in-app account creation.
    else if (qid === 'PSL_SUPPORTED_ACCOUNT_CREATION_METHODS') {
      val = (rid === 'PSL_ACM_NONE') ? 'TRUE' : '';
    }
    // Deletion mechanism (newer schema single-choice form).
    else if (qid === 'PSL_SUPPORT_DATA_DELETION_BY_USER') {
      val = (rid === 'DATA_DELETION_YES') ? 'TRUE' : '';
    }
    // Deletion URLs — response value is the URL itself.
    else if (qid === 'PSL_DATA_DELETION_URL' && rid === '') val = DELETION_URL;
    // PSL_ACCOUNT_DELETION_URL stays blank — we do not have accounts.
    // PSL_DATA_COLLECTION_COMPLIES_FAMILY_POLICY, PSL_INDEPENDENTLY_VALIDATED,
    // PSL_UPI_BADGE_OPT_IN, PSL_HAS_OUTSIDE_APP_ACCOUNTS stay blank (optional).

    // 2) Data-type checkboxes (PSL_DATA_TYPES_*)
    else if (qid.startsWith('PSL_DATA_TYPES_')) {
      val = declaredSet.has(rid) ? 'TRUE' : '';
    }

    // 3) Data-usage blocks (PSL_DATA_USAGE_RESPONSES:<TYPE>:...)
    else if (qid.startsWith('PSL_DATA_USAGE_RESPONSES:')) {
      // qid is like PSL_DATA_USAGE_RESPONSES:PSL_APPROX_LOCATION:PSL_DATA_USAGE_COLLECTION_AND_SHARING
      const parts = qid.split(':');
      const typeId = parts[1];
      const subQ   = parts.slice(2).join(':');
      const decl   = DECLARED[typeId];
      if (!decl) {
        val = '';  // data type not declared — leave blank
      } else {
        switch (subQ) {
          case 'PSL_DATA_USAGE_COLLECTION_AND_SHARING':
            // rid is PSL_DATA_USAGE_ONLY_COLLECTED or PSL_DATA_USAGE_ONLY_SHARED.
            // For BOTH collect+share, set both TRUE.
            if (decl.collect === 'BOTH') {
              val = 'TRUE';
            } else if (decl.collect === 'ONLY_COLLECTED') {
              val = (rid === 'PSL_DATA_USAGE_ONLY_COLLECTED') ? 'TRUE' : '';
            } else if (decl.collect === 'ONLY_SHARED') {
              val = (rid === 'PSL_DATA_USAGE_ONLY_SHARED') ? 'TRUE' : '';
            }
            break;

          case 'PSL_DATA_USAGE_EPHEMERAL':
            // rid is '' (yes/no scalar). response_value is TRUE/FALSE.
            val = decl.ephemeral ? 'TRUE' : 'FALSE';
            break;

          case 'DATA_USAGE_USER_CONTROL':
            // rid is PSL_DATA_USAGE_USER_CONTROL_OPTIONAL or _REQUIRED (SINGLE_CHOICE).
            if (decl.optional) {
              val = (rid === 'PSL_DATA_USAGE_USER_CONTROL_OPTIONAL') ? 'TRUE' : '';
            } else {
              val = (rid === 'PSL_DATA_USAGE_USER_CONTROL_REQUIRED') ? 'TRUE' : '';
            }
            break;

          case 'DATA_USAGE_COLLECTION_PURPOSE':
            val = decl.purposes.includes(rid) ? 'TRUE' : '';
            break;

          case 'DATA_USAGE_SHARING_PURPOSE':
            val = decl.sharingPurposes.includes(rid) ? 'TRUE' : '';
            break;

          default:
            val = '';
        }
      }
    }

    return [cols[0], cols[1], val, cols[3], cols[4]];
  });

  const out = [header, ...outRows.map(csvStringifyRow)].join('\n') + '\n';
  return out;
}

// ─────────────────────── Main ──────────────────────────────────────────────
(async () => {
  console.log('Service account:', SA_PATH);
  console.log('Package:', PKG);
  console.log('Deletion URL (set in Play Console UI, not in CSV):', DELETION_URL);

  // 0) Read current state first so we can diff later.
  console.log('\n=== GET current Data Safety ===');
  const beforeGet = await play('GET',
    `/androidpublisher/v3/applications/${PKG}/dataSafety`);
  console.log('HTTP', beforeGet.s);
  const beforeTxt = JSON.stringify(beforeGet.b, null, 2);
  console.log(beforeTxt.slice(0, 3000));

  // 1) Build CSV.
  const csv = buildCsv();
  const csvLines = csv.split('\n').filter(Boolean);
  console.log('\n=== CSV built ===');
  console.log('Lines:', csvLines.length, '(1 header + ', csvLines.length - 1, ' rows)');
  const trueCount = csvLines.filter(l => {
    const cols = parseCsvLine(l);
    return cols[2] === 'TRUE';
  }).length;
  console.log('TRUE responses:', trueCount);
  // Dump TRUE rows for auditability.
  console.log('\n--- TRUE rows ---');
  csvLines.forEach(l => {
    const cols = parseCsvLine(l);
    if (cols[2] === 'TRUE') console.log('  ' + cols[0] + (cols[1] ? ' / ' + cols[1] : ''));
  });

  // Also persist a copy next to the script for inspection.
  const outPath = path.resolve(__dirname, 'play_data_safety_submitted.csv');
  fs.writeFileSync(outPath, csv, 'utf8');
  console.log('\nSaved CSV to:', outPath);

  // 2) POST per spec.
  console.log('\n=== POST dataSafety ===');
  const postResp = await play('POST',
    `/androidpublisher/v3/applications/${PKG}/dataSafety`,
    { safetyLabels: csv });
  console.log('HTTP', postResp.s);
  console.log(JSON.stringify(postResp.b, null, 2).slice(0, 5000));

  // 3) Readback.
  console.log('\n=== GET final Data Safety (readback) ===');
  const after = await play('GET',
    `/androidpublisher/v3/applications/${PKG}/dataSafety`);
  console.log('HTTP', after.s);
  console.log(JSON.stringify(after.b, null, 2).slice(0, 10000));

  // 4) Summary.
  console.log('\n=== Summary ===');
  console.log('POST status:', postResp.s);
  console.log('GET  status:', after.s);
})().catch(e => { console.error('Fatal:', e); process.exit(1); });

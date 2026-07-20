#!/usr/bin/env node
/**
 * Probe: can we authenticate the Voice Live WS with a SHORT-LIVED token instead
 * of the permanent Foundry key? (So the browser never sees the permanent key.)
 *
 * Tries the Cognitive Services STS issueToken endpoint, then connects the WS with
 * the minted token via a few candidate mechanisms. Server-side only.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const WebSocket = require('ws');

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', '.env')), ...process.env };
const endpoint = env.AZURE_VOICE_FOUNDRY_ENDPOINT;
const key = env.AZURE_VOICE_FOUNDRY_KEY;
const region = env.AZURE_VOICE_REGION || 'swedencentral';
const host = new URL(endpoint).host;

function post(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      { method: 'POST', hostname: u.hostname, path: u.pathname + u.search, headers: { ...headers, 'Content-Length': 0 } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); }
    );
    req.on('error', reject);
    req.end();
  });
}

async function mintToken() {
  // Candidate STS endpoints for a Cognitive Services / AIServices resource
  const candidates = [
    `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
    `${endpoint.replace(/\/$/, '')}/sts/v1.0/issueToken`,
  ];
  for (const url of candidates) {
    try {
      const r = await post(url, { 'Ocp-Apim-Subscription-Key': key });
      console.log(`STS ${url} → HTTP ${r.status} (len ${r.body.length})`);
      if (r.status === 200 && r.body) return r.body.trim();
    } catch (e) { console.log(`STS ${url} → ERR ${e.message}`); }
  }
  return null;
}

function tryWs(label, urlNoKey, headers) {
  return new Promise((resolve) => {
    console.log(`\n=== ${label} ===`);
    const ws = headers
      ? new WebSocket(urlNoKey, ['realtime'], { headers })
      : new WebSocket(urlNoKey, ['realtime']);
    const t = setTimeout(() => { console.log('  timeout (no session.created)'); try { ws.close(); } catch (_) {} resolve(); }, 8000);
    ws.on('open', () => console.log('  WS open'));
    ws.on('message', (d) => {
      let ev; try { ev = JSON.parse(d.toString()); } catch { return; }
      console.log('  ←', ev.type, ev.type === 'error' ? JSON.stringify(ev.error) : '');
      if (ev.type === 'session.created' || ev.type === 'error') { clearTimeout(t); try { ws.close(); } catch (_) {} resolve(); }
    });
    ws.on('error', (e) => { console.log('  WS error:', e.message); clearTimeout(t); resolve(); });
    ws.on('unexpected-response', (_q, res) => { console.log('  upgrade HTTP', res.statusCode); clearTimeout(t); resolve(); });
  });
}

(async () => {
  const token = await mintToken();
  if (!token) { console.log('\nNo STS token minted — ephemeral STS path not available on this resource.'); process.exit(3); }
  console.log(`\nMinted token (len ${token.length}) — value not printed`);
  const base = `wss://${host}/voice-live/realtime?api-version=2025-10-01&model=gpt-realtime`;
  await tryWs('A: access_token query', `${base}&access_token=${encodeURIComponent(token)}`, null);
  await tryWs('B: Authorization Bearer header', base, { Authorization: `Bearer ${token}` });
  await tryWs('C: token query', `${base}&token=${encodeURIComponent(token)}`, null);
  process.exit(0);
})();

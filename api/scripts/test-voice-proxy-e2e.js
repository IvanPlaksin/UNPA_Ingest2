#!/usr/bin/env node
/**
 * End-to-end test for the Voice Live server-side WS proxy (Phase 2).
 *
 *   1. POST /flowdesk/voice/token → { useProxy, proxyPath, ticket, sessionConfig }
 *   2. WS connect to the relay path with the ticket (subprotocol 'realtime')
 *   3. expect session.created (relayed from Azure) → send session.update → session.updated
 *
 * Confirms the browser never needs the Foundry key and the relay works end to end.
 */
const http = require('http');
const WebSocket = require('ws');

const API_HOST = 'localhost';
const API_PORT = 3010;
const BASE = '/api/v1/flowdesk';
const SESSION_ID = `proxytest-${Math.floor(Math.random() * 1e6)}`;
const USER_ID = 'test-user-proxy';

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      { host: API_HOST, port: API_PORT, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
                   'X-FlowDesk-User-Id': USER_ID, 'X-FlowDesk-User-Email': 'proxy@test.local' } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  // 1. Token
  const tok = await postJson(`${BASE}/voice/token`, { sessionId: SESSION_ID, userId: USER_ID });
  console.log('token HTTP', tok.status);
  let t;
  try { t = JSON.parse(tok.body); } catch { console.error('bad token body:', tok.body); process.exit(1); }
  // Redact any accidental secrets before printing
  const shown = { ...t };
  if (shown.ticket) shown.ticket = shown.ticket.slice(0, 6) + '…';
  console.log('token payload:', JSON.stringify(shown));

  if (t.wsUrl) { console.error('❌ SECURITY: token returned a direct wsUrl (should be null for proxy):', t.wsUrl); process.exit(1); }
  if (!t.useProxy || !t.proxyPath || !t.ticket) { console.error('❌ expected useProxy+proxyPath+ticket for proxy transport'); process.exit(1); }

  // 2. Connect to the relay
  const wsUrl = `ws://${API_HOST}:${API_PORT}${t.proxyPath}?sessionId=${encodeURIComponent(SESSION_ID)}&ticket=${encodeURIComponent(t.ticket)}`;
  console.log('connecting relay:', wsUrl.replace(/ticket=[^&]+/, 'ticket=***'));
  const ws = new WebSocket(wsUrl, [t.subprotocol || 'realtime']);

  const t0 = Date.now();
  let tCreated = 0;
  const timer = setTimeout(() => { console.error('❌ timeout — no session.updated via proxy'); process.exit(1); }, 20000);

  ws.on('open', () => console.log('relay WS open, waiting for session.created (relayed from Azure)...'));
  ws.on('message', (data) => {
    let ev; try { ev = JSON.parse(data.toString()); } catch { return; }
    console.log('←', ev.type);
    if (ev.type === 'session.created') {
      tCreated = Date.now();
      console.log(`  session.created relayed in ${tCreated - t0} ms (browser→backend→Azure)`);
      ws.send(JSON.stringify({ type: 'session.update', session: t.sessionConfig }));
      console.log('→ session.update (from server-provided sessionConfig)');
    } else if (ev.type === 'session.updated') {
      clearTimeout(timer);
      console.log(`✅ session.updated via PROXY — relay works. update RTT ${Date.now() - tCreated} ms`);
      ws.close();
      process.exit(0);
    } else if (ev.type === 'error') {
      clearTimeout(timer);
      console.error('❌ error via proxy:', JSON.stringify(ev.error || ev));
      ws.close();
      process.exit(1);
    }
  });
  ws.on('unexpected-response', (_q, res) => { console.error('❌ relay upgrade HTTP', res.statusCode); process.exit(1); });
  ws.on('error', (e) => { console.error('❌ relay WS error:', e.message); process.exit(1); });
})();

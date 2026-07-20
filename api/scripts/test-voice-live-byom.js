#!/usr/bin/env node
/**
 * Phase 0 go/no-go probe for Azure Voice Live + Claude Haiku 4.5 BYOM.
 *
 * Opens the Voice Live realtime WebSocket against the Foundry AIServices
 * resource, sends a session.update carrying the BYOM config, and reports
 * whether the service accepts it (session.updated) or rejects it (error).
 * No audio is exchanged — this only validates the BYOM handshake.
 *
 * Reads config from api/.env:
 *   AZURE_VOICE_FOUNDRY_ENDPOINT, AZURE_VOICE_FOUNDRY_KEY, AZURE_VOICE_DEPLOYMENT
 *
 * Usage:  node scripts/test-voice-live-byom.js [--api-version 2025-10-01]
 */
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- minimal .env loader (no dotenv dependency) ---
function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', '.env')), ...process.env };

const endpoint = env.AZURE_VOICE_FOUNDRY_ENDPOINT;
const key = env.AZURE_VOICE_FOUNDRY_KEY;
const deployment = env.AZURE_VOICE_DEPLOYMENT || env.AZURE_VOICE_FOUNDRY_DEPLOYMENT;

if (!endpoint || !key || !deployment) {
  console.error('Missing AZURE_VOICE_FOUNDRY_ENDPOINT / AZURE_VOICE_FOUNDRY_KEY / AZURE_VOICE_DEPLOYMENT in api/.env');
  process.exit(2);
}

const argv = process.argv.slice(2);
const apiVersion = (argv.includes('--api-version') ? argv[argv.indexOf('--api-version') + 1] : null) || '2025-10-01';

const host = new URL(endpoint).host;
const wsPath = argv.includes('--path') ? argv[argv.indexOf('--path') + 1] : '/voice-live/realtime';
const subprotocol = argv.includes('--subprotocol') ? argv[argv.indexOf('--subprotocol') + 1] : null;
// Voice Live WS auth wants the key as an `api-key` query param (the Bearer header
// just triggers a 302 that appends it). Pass it directly and keep it out of logs.
// For BYOM the LLM is set in session.update, NOT the query — pass deployment in the
// query only when --deployment-query is given (native-model mode).
const withDeploymentQuery = argv.includes('--deployment-query');
// --model NAME → pass a Voice Live *native* model in the query as `model=` (service-provided, no deployment)
const nativeModel = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : null;
// --byom MODE → BYOM via query params (model = the Claude deployment + a byom mode marker)
const byomMode = argv.includes('--byom') ? argv[argv.indexOf('--byom') + 1] : null;
const qs = [
  `api-version=${apiVersion}`,
  nativeModel ? `model=${encodeURIComponent(nativeModel)}` : null,
  byomMode ? `model=${encodeURIComponent(deployment)}` : null,
  byomMode ? `byom=${encodeURIComponent(byomMode)}` : null,
  withDeploymentQuery ? `deployment=${encodeURIComponent(deployment)}` : null,
  `api-key=${encodeURIComponent(key)}`,
].filter(Boolean).join('&');
const wsUrl = `wss://${host}${wsPath}?${qs}`;
const redactedUrl = wsUrl.replace(/api-key=[^&]+/, 'api-key=***');

console.log(`[voice-live-byom] host=${host} path=${wsPath} deployment=${deployment} api-version=${apiVersion}${subprotocol ? ' subprotocol=' + subprotocol : ''}`);
console.log(`[voice-live-byom] connecting: ${redactedUrl}`);

const ws = subprotocol ? new WebSocket(wsUrl, [subprotocol]) : new WebSocket(wsUrl);

let sentUpdate = false;
const timer = setTimeout(() => {
  console.error('❌ Timeout — no session.updated within 15s');
  try { ws.close(); } catch (_) {}
  process.exit(1);
}, 15000);

function sendByomUpdate() {
  // Clean session.update — the model is chosen at connect via the query string,
  // NOT here (session.model_provider is rejected as an unexpected field).
  const sessionUpdate = {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      instructions: 'You are a helpful assistant. Respond concisely.',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm16',
      input_audio_transcription: { model: 'azure-speech' },
      turn_detection: { type: 'azure_semantic_vad', threshold: 0.5, silence_duration_ms: 500 },
    },
  };
  console.log('→ session.update (clean session config)');
  ws.send(JSON.stringify(sessionUpdate));
  sentUpdate = true;
}

ws.on('open', () => {
  console.log('WS connected.');
  // Some Voice Live versions do not emit session.created until the client sends
  // the first session.update — send it proactively.
  if (argv.includes('--eager')) sendByomUpdate();
  else console.log('waiting for session.created...');
});

ws.on('message', (data) => {
  let ev;
  try { ev = JSON.parse(data.toString()); } catch { console.log('← (non-JSON frame)'); return; }
  console.log('←', ev.type, JSON.stringify(ev).slice(0, 300));

  if (ev.type === 'session.created' && !sentUpdate) {
    sendByomUpdate();
  } else if (ev.type === 'session.updated') {
    clearTimeout(timer);
    console.log('✅ BYOM session configured successfully — GO');
    try { ws.close(); } catch (_) {}
    process.exit(0);
  } else if (ev.type === 'error') {
    clearTimeout(timer);
    console.error('❌ Voice Live error:', JSON.stringify(ev.error || ev));
    try { ws.close(); } catch (_) {}
    process.exit(1);
  }
});

ws.on('error', (err) => {
  clearTimeout(timer);
  console.error('❌ WS error:', err && err.message ? err.message : String(err));
  process.exit(1);
});

ws.on('unexpected-response', (_req, res) => {
  clearTimeout(timer);
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    console.error(`❌ WS upgrade rejected: HTTP ${res.statusCode} ${res.statusMessage}`);
    console.error('   headers:', JSON.stringify(res.headers));
    if (body) console.error('   body:', body.slice(0, 500));
    process.exit(1);
  });
});

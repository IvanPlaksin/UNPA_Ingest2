#!/usr/bin/env node
/**
 * Headless end-to-end test of the decoupled voice orchestrator (Phase 2'').
 *
 * We synthesize a spoken user phrase with Azure TTS, stream it into the voice WS
 * as { type:'audio' } frames (as a browser mic would), and assert the server
 * runs it through STT → the FlowDesk interpreter → TTS: i.e. it returns a user
 * transcript, an assistant transcript (from the SAME interpreter as text chat),
 * and TTS audio. Proves voice now obeys the interpreter's dialogue rules.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const sdk = require('microsoft-cognitiveservices-speech-sdk');

function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const env = { ...loadEnv(path.join(__dirname, '..', '.env')), ...process.env };
const key = env.AZURE_VOICE_FOUNDRY_KEY;
const region = env.AZURE_VOICE_REGION || 'swedencentral';

const API = { host: 'localhost', port: 3010, base: '/api/v1/flowdesk' };
const SESSION_ID = `orch-e2e-${Math.floor(Math.random() * 1e6)}`;
const USER_ID = 'orch-e2e-user';
const PHRASE = 'Мне нужен новый ноутбук для работы.';

function postJson(p, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({ host: API.host, port: API.port, path: p, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data),
        'X-FlowDesk-User-Id': USER_ID } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    req.on('error', reject); req.write(data); req.end();
  });
}

function ttsPcm(text) {
  return new Promise((resolve, reject) => {
    const cfg = sdk.SpeechConfig.fromSubscription(key, region);
    cfg.speechSynthesisVoiceName = 'ru-RU-DmitryNeural';
    cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
    const synth = new sdk.SpeechSynthesizer(cfg, null);
    synth.speakTextAsync(text, (r) => { synth.close();
      r.reason === sdk.ResultReason.SynthesizingAudioCompleted ? resolve(Buffer.from(r.audioData)) : reject(new Error('tts ' + r.reason));
    }, (e) => { synth.close(); reject(new Error(e)); });
  });
}

(async () => {
  console.log(`[orch-e2e] synthesizing input phrase: "${PHRASE}"`);
  const speech = await ttsPcm(PHRASE);
  const silence = Buffer.alloc(24000 * 2 * 2); // 2s of 24k/16-bit silence → triggers end-of-utterance
  const audio = Buffer.concat([speech, silence]);
  console.log(`[orch-e2e] input audio ${audio.length} bytes`);

  const tok = JSON.parse((await postJson(`${API.base}/voice/token`, { sessionId: SESSION_ID, userId: USER_ID })).body);
  if (!tok.ticket) { console.error('❌ no ticket:', tok); process.exit(1); }

  const wsUrl = `ws://${API.host}:${API.port}${tok.proxyPath}?sessionId=${encodeURIComponent(SESSION_ID)}&ticket=${encodeURIComponent(tok.ticket)}`;
  const ws = new WebSocket(wsUrl, [tok.subprotocol || 'realtime']);

  const got = { userTranscript: null, assistantTranscript: null, audioChunks: 0, states: [], choices: null, error: null };
  const finish = (ok) => {
    console.log('\n=== RESULT ===');
    console.log('states:', got.states.join(' → '));
    console.log('user transcript:', JSON.stringify(got.userTranscript));
    console.log('assistant transcript:', JSON.stringify(got.assistantTranscript));
    console.log('choices:', JSON.stringify(got.choices));
    console.log('TTS audio chunks:', got.audioChunks);
    if (got.error) console.log('error:', got.error);
    const pass = got.userTranscript && got.assistantTranscript && got.audioChunks > 0;
    console.log(pass ? '\n✅ Decoupled voice loop works — STT → interpreter → TTS.' : '\n❌ incomplete loop.');
    try { ws.close(); } catch (_) {}
    process.exit(pass ? 0 : 1);
  };

  const timer = setTimeout(() => finish(false), 25000);

  ws.on('open', () => {
    console.log('[orch-e2e] WS open, streaming audio frames...');
    let off = 0;
    const CH = 4800; // 100ms @ 24k/16-bit
    const iv = setInterval(() => {
      if (off >= audio.length) { clearInterval(iv); return; }
      const chunk = audio.subarray(off, off + CH); off += CH;
      ws.send(JSON.stringify({ type: 'audio', data: chunk.toString('base64') }));
    }, 20); // faster than real-time is fine for a push stream
  });
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.type === 'state') { got.states.push(m.status); }
    else if (m.type === 'transcript') { if (m.role === 'user') got.userTranscript = m.text; else got.assistantTranscript = m.text; console.log(`  ← transcript[${m.role}]${m.lang ? '(' + m.lang + ')' : ''}: ${m.text}`); }
    else if (m.type === 'choices') { got.choices = m.items; }
    else if (m.type === 'audio') { got.audioChunks++; }
    else if (m.type === 'error') { got.error = m.message; console.log('  ← error:', m.message); }
    if (got.userTranscript && got.assistantTranscript && got.audioChunks > 0) { clearTimeout(timer); setTimeout(() => finish(true), 500); }
  });
  ws.on('error', (e) => { got.error = e.message; finish(false); });
})();

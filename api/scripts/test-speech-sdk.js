#!/usr/bin/env node
/**
 * Smoke test: Azure Speech SDK (TTS + STT round-trip) against the AIServices
 * resource. Proves the decoupled voice pipeline is viable — no Voice Live LLM.
 *
 *   1. TTS: synthesize a phrase → PCM16 24k bytes
 *   2. STT: recognize that audio back (with auto language ID over the UN locales)
 */
const fs = require('fs');
const path = require('path');
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

const PHRASE = 'Привет, мне нужен новый ноутбук.';
const UN_LOCALES = ['ar-SA', 'zh-CN', 'en-US', 'fr-FR', 'ru-RU', 'es-ES'];

function ttsToBuffer() {
  return new Promise((resolve, reject) => {
    const cfg = sdk.SpeechConfig.fromSubscription(key, region);
    cfg.speechSynthesisVoiceName = 'ru-RU-SvetlanaNeural';
    cfg.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm;
    const synth = new sdk.SpeechSynthesizer(cfg, null);
    synth.speakTextAsync(
      PHRASE,
      (result) => {
        synth.close();
        if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
          resolve(Buffer.from(result.audioData));
        } else {
          reject(new Error(`TTS failed: ${result.reason} ${result.errorDetails || ''}`));
        }
      },
      (err) => { synth.close(); reject(new Error(`TTS error: ${err}`)); }
    );
  });
}

function sttFromPcm(pcmBuffer) {
  return new Promise((resolve, reject) => {
    const cfg = sdk.SpeechConfig.fromSubscription(key, region);
    const autoDetect = sdk.AutoDetectSourceLanguageConfig.fromLanguages(UN_LOCALES);
    // Push raw PCM (24k, 16-bit, mono) into the recognizer.
    const fmt = sdk.AudioStreamFormat.getWaveFormatPCM(24000, 16, 1);
    const push = sdk.AudioInputStream.createPushStream(fmt);
    push.write(pcmBuffer);
    push.close();
    const audioCfg = sdk.AudioConfig.fromStreamInput(push);
    const rec = sdk.SpeechRecognizer.FromConfig(cfg, autoDetect, audioCfg);
    rec.recognizeOnceAsync(
      (result) => {
        const lid = sdk.AutoDetectSourceLanguageResult.fromResult(result);
        rec.close();
        if (result.reason === sdk.ResultReason.RecognizedSpeech) {
          resolve({ text: result.text, language: lid ? lid.language : '(unknown)' });
        } else {
          reject(new Error(`STT no speech: ${result.reason} ${result.errorDetails || ''}`));
        }
      },
      (err) => { rec.close(); reject(new Error(`STT error: ${err}`)); }
    );
  });
}

(async () => {
  console.log(`[speech-sdk] region=${region} key.len=${(key || '').length}`);
  console.log('=== TTS ===');
  const pcm = await ttsToBuffer();
  console.log(`TTS ok: ${pcm.length} bytes PCM16 24k (~${(pcm.length / 2 / 24000).toFixed(2)}s)`);
  console.log('=== STT (auto language ID over 6 UN locales) ===');
  const r = await sttFromPcm(pcm);
  console.log(`STT ok: language=${r.language}  text="${r.text}"`);
  console.log('\n✅ Decoupled STT+TTS viable on the AIServices resource.');
  process.exit(0);
})().catch((e) => { console.error('❌', e.message); process.exit(1); });

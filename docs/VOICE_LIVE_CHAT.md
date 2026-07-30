# Voice Live Chat — Setup & Architecture

Live voice conversation for the FlowDesk AI chat. **Decoupled pipeline**: Azure
Speech provides only ears (STT) and mouth (TTS); the reasoning "brain" is the
existing **FlowDesk interpreter** — the exact same engine the text chat uses. So
the voice agent obeys the same dialogue rules (router, slot filling, service
catalog, DraftSR) as text, and both share one session state.

> **Why decoupled, not Voice Live's own LLM?** Voice Live runs its own model
> (gpt-realtime / BYOM) as the brain, which does NOT follow the FlowDesk
> interpreter's flow — the voice agent would free-chat instead of running the
> intake. Since the interpreter is an engine (not a prompt), it cannot be faithfully
> reproduced inside Voice Live. Decoupling keeps one brain for both channels. The
> earlier Voice Live relay is superseded (kept in `voice-proxy.js`'s `VoiceProxySession`
> as dead code / reference only).

Status: backend verified end-to-end (STT → interpreter → TTS). Live browser
acceptance (mic → voice → response) is a manual step (needs a microphone).

---

## Architecture (decoupled)

```
Browser (AltioraChat / LiveChatButton)
   │  1. POST /flowdesk/voice/token   → { useProxy, proxyPath, ticket }   (no key)
   │  2. WS  /flowdesk/voice/proxy?sessionId&ticket
   │     ↑ mic PCM16 as { type:'audio' }        ↓ { transcript | audio | choices | state }
   ▼
API backend — voice-orchestrator.js            ← Azure Speech key lives ONLY here
   ┌───────────────────────────────────────────────────────────────┐
   │ Azure STT (continuous, language-ID over 6 UN locales)          │
   │      → FlowDesk interpreter  (chat-v2.processMessage,           │
   │        SAME sessionId → shared DraftSR as the text chat)        │
   │      → Azure TTS (neural voice per detected language, streamed) │
   └───────────────────────────────────────────────────────────────┘
```

- **One brain.** Voice and text both call `chat-v2.processMessage(sessionId, …)`, so
  a conversation can move between modalities and keep its DraftSR.
- **Transport.** `VOICE_TRANSPORT=proxy` (secure default) — the browser reaches the
  backend relay with a single-use ticket; the Azure key stays server-side.
  `direct` (browser↔Azure) is not used by the decoupled path.
- **`VOICE_LLM_MODEL`** is now unused by the voice path (the interpreter is the brain).
  It remains only for the superseded Voice Live relay.

## Key files

Backend (`api/src/instances/flowdesk/voice/`):
- `voice-orchestrator.js` — **the decoupled brain-wiring.** `VoiceOrchestratorSession`:
  Azure `SpeechRecognizer` (continuous, `LanguageIdMode=Continuous` over the 6 UN
  locales) → on `recognized`, `chatV2.processMessage(sessionId, userId, text, …, lang)`
  → `SpeechSynthesizer` (voice per language, streamed to the client). Barge-in stops
  the current TTS when the user speaks over it.
- `voice-proxy.js` — `initVoiceProxy(server, existingWss)`: single `upgrade` router +
  single-use ticket auth; its connection handler spawns a `VoiceOrchestratorSession`.
  (`VoiceProxySession`, the old Voice Live relay, is retained but no longer used.)
- `voice.controller.js` — `POST /voice/token` (mints the ticket), `POST /voice/transcript`,
  `GET /voice/transcript/:sessionId`.
- `voice-config.js` — retained for the superseded Voice Live path (model registry,
  `buildUpstreamUrl`); not on the decoupled path.

Frontend (`@flowdesk/chat-v2` package, `src/voice/`):
- `audio-capture.js`, `audio-playback.js`, `voice-session.js`, `use-voice.js`,
  `VoiceControls.jsx` (LiveChatButton).

## Configuration (`api/.env`)

```
AZURE_VOICE_FOUNDRY_ENDPOINT=https://unpa-voice-foundry.cognitiveservices.azure.com/
AZURE_VOICE_FOUNDRY_KEY=<server-only secret>
AZURE_VOICE_DEPLOYMENT=claude-haiku-4-5
AZURE_VOICE_REGION=swedencentral
VOICE_TRANSPORT=proxy          # proxy (secure default) | direct (needs ephemeral token)
VOICE_LLM_MODEL=gpt-realtime   # gpt-realtime (native) | haiku-byom (Claude BYOM, pending)
```

The frontend needs `apiBaseUrl` (e.g. `http://localhost:3010/api/v1`) passed to
`<AltioraChat apiBaseUrl=… />`; the Live Chat button then works with no extra wiring.

## Azure resource (Dev)

Region **swedencentral** (eastus/westus2 have no realtime models). Resource
`unpa-voice-foundry` (kind=AIServices, S0) in RG `unpa-voice-dev-rg`. Deployments:
`claude-haiku-4-5` (Anthropic; requires `modelProviderData` via `az rest PUT
…?api-version=2026-05-01`), and native `gpt-realtime` is service-provided (no
deployment; deploying it hits quota=0 on a fresh sub — use it via the `model=` query).

## WS protocol (decoupled — current)

Simple JSON over the ticket-authenticated WS (`voice-orchestrator.js`):

- client → `{ type:'audio', data:<base64 pcm16 24k> }` | `{ type:'stop' }`
- server → `{ type:'state', status:'listening|processing|speaking' }`
        | `{ type:'transcript', role:'user'|'assistant', text, lang? }`
        | `{ type:'choices', items:[{value,label}] }`
        | `{ type:'audio', data:<base64 pcm16 24k> }` (TTS chunk)
        | `{ type:'audioDone' }` | `{ type:'error', message }`

Barge-in: client `{type:'audio'}` arriving while `state=speaking` cancels the current
TTS server-side.

### Azure Speech config
- `SpeechConfig.fromSubscription(AZURE_VOICE_FOUNDRY_KEY, AZURE_VOICE_REGION)`.
- STT: `SpeechRecognizer.FromConfig(cfg, AutoDetectSourceLanguageConfig.fromLanguages(6 UN locales), audioCfg)`
  with `SpeechServiceConnection_LanguageIdMode = Continuous`; push stream is 24 kHz/16-bit/mono
  and **requires an ArrayBuffer** (not a Node Buffer).
- TTS: `speechSynthesisVoiceName` per detected language, `Raw24Khz16BitMonoPcm`, streamed via
  `PushAudioOutputStream`.

### Superseded: Voice Live realtime WS (reference)
The earlier integrated approach (kept as dead code): `wss://{resource}.cognitiveservices.azure.com/voice-live/realtime?api-version=2025-10-01&model=gpt-realtime`,
auth via `api-key` query param, `realtime` subprotocol, `session.created`/`session.update`/`session.updated`
handshake, `input_audio_buffer.append` / `response.audio.delta`. Replaced because its LLM
was a different brain than the interpreter.

## Security (why proxy is the default)

The permanent Foundry key must never reach the browser. Voice Live WS auth is the
permanent `api-key` in the query, so a naive `direct` browser connection would leak
it. An ephemeral path was tested — the Cognitive Services STS endpoint
(`{region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`) mints a JWT, but Voice
Live rejects it (401 via access_token / Bearer / token). Until a browser-safe
mechanism exists (docs point to WebRTC signaling for client-side), the **proxy relay**
is the secure path: the key stays on the server, the browser authenticates to the
relay with a single-use, 60-second ticket.

## Local acceptance test (manual, needs a mic)

1. `node --use-system-ca api/index.js` (API on :3010, logs "Voice Live proxy initialized").
2. Run the mcp frontend; open the AltioraChat demo with `apiBaseUrl=http://localhost:3010/api/v1`.
3. Click **Live Chat**, allow the microphone.
4. T1 connect → button "listening". T2 speak Russian → user transcript in history
   (source=voice, language ru-RU). T3 assistant speaks + transcript. T4 speak English
   → en-US. T5 barge-in (talk over the reply) → reply stops, back to listening.
   T6 click again → idle. T7 deny mic → error line + text fallback.

Backend-only smoke tests (no mic): `api/scripts/test-voice-live-byom.js` (native
handshake), `api/scripts/test-voice-proxy-e2e.js` (full relay).

## Open items

- **Claude BYOM over Voice Live** — the `byom-foundry-anthropic-messages` wire syntax
  is unresolved (rejected forms: `session.model_provider`, `?byom=…`, `?model=claude…`).
  Dev runs on native `gpt-realtime`; switching to Claude is a one-line `VOICE_LLM_MODEL`
  change once the syntax is confirmed. The Foundry Messages API for Claude does work
  (`POST {endpoint}/anthropic/v1/messages?api-version=2026-05-01`, `Authorization: Bearer`).
- **Direct (WebRTC) transport** — deferred; needs the browser-safe token mechanism.
- **Per-language HD voices** — one multilingual voice today; a per-language map is a
  follow-up.

## Decision Journal

- **DECISION:** Decoupled pipeline (Azure Speech STT+TTS + FlowDesk interpreter) instead
  of Voice Live's own LLM. **RATIONALE:** the voice agent must obey the same dialogue
  rules as text; Voice Live's LLM (gpt-realtime/BYOM) is a different brain and free-chats
  instead of running the intake. The interpreter is an engine, not a prompt, so it can't be
  reproduced inside Voice Live. Decoupling gives one brain + one DraftSR for both channels.
  Verified e2e: RU utterance → STT → interpreter (out-of-scope router reply) → TTS.
  **ALTERNATIVES:** Voice Live LLM + our prompt/tools (approximation, drifts from text);
  hybrid inject-response (undocumented, fragile).
- **FOLLOW-UP (separate task):** interpreter canned/OUT_OF_SCOPE responses are English-only;
  it should reply in the user's language (`lang` is already threaded through
  `processMessage`). Affects text and voice equally — fix in the interpreter, not the voice layer.
- **DECISION:** Provision in swedencentral, not eastus. **RATIONALE:** eastus/westus2
  have no `gpt-realtime` catalog entries → Voice Live can't init there; swedencentral &
  eastus2 do. Swedencentral chosen (EU latency + full realtime + Claude). **ALTERNATIVES:**
  eastus2 (US, also valid).
- **DECISION:** Deploy Claude via `az rest PUT api-version=2026-05-01` with
  `modelProviderData`. **RATIONALE:** Anthropic deployments require industry/org/country;
  the CLI has no flag and older api-versions silently drop the field. **ALTERNATIVES:**
  CLI deploy (fails InvalidModelProviderData).
- **DECISION:** Proxy relay as the secure default; direct deferred. **RATIONALE:** Voice
  Live WS auth = permanent key in query; browser must not hold it, and STS ephemeral
  tokens are rejected (401). Proxy keeps the key server-side; +87 ms overhead measured.
  **ALTERNATIVES:** direct with ephemeral token (no working mechanism yet); WebRTC (larger effort).
- **DECISION:** Single `upgrade` router in index.js. **RATIONALE:** two `{server,path}`
  WebSocket.Servers abort each other's handshakes; one router dispatching by path lets
  `/ws` and the voice proxy coexist. **ALTERNATIVES:** second `{server,path}` WSS (breaks /ws).
- **DECISION:** Single-use Redis ticket for the proxy WS. **RATIONALE:** a browser WS
  upgrade cannot send custom auth headers; a short-lived ticket from the authenticated
  token endpoint binds the WS to the session/user. **ALTERNATIVES:** cookie auth (fragile
  cross-origin), header auth (impossible in browser WS).

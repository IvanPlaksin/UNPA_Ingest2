# PHASE 0 — AS-IS RECONNAISSANCE REPORT

**Project:** Altiora Assistant (AI navigation/support chat for the Altiora portal)
**Role:** Claude Code (Implementer) — read-only reconnaissance, no code changes
**Date:** 2026-07-21
**Branch:** `feat/gxe-v3-phase1`
**Method:** Every claim below is cited to `file:line` + function/class name, verified against live source (not memory/docs).

---

## 0. Executive Summary (headline findings)

| # | Finding | Impact on the plan |
|---|---------|--------------------|
| **F1** | **The live chat is NOT GXE dialog graphs.** It is a purpose-built **flow-as-data interpreter** (`interpreter-engine.js` → `createEngine().runTurn()`), gated by `FLOWDESK_CHAT_V2=true`. | PO's correction confirmed. All intent/zero-query integration must target the interpreter's ROUTER, not RuntimeEngine. |
| **F2** | Turn = **stateless re-execution**: load `DraftSR` from **Redis** → compile `SchemaSnapshot` from **Memgraph** → LLM **ROUTER** → slot fill/info/act → write back. LLM = **Anthropic API, Claude Haiku 4.5**. | The intent model (CONSULT/EXPLAIN/NAVIGATE/ACT) extends the existing ROUTER schema, which already has 9 routes. |
| **F3** | **Provenance metadata does NOT reach chat answers today.** The KB the chat reads (`altiora_knowledge` Qdrant collection) has no `sourceDocumentSymbol`/Admiralty/`inForceStatus`/dates. The rich provenance the platform computes lives in a *different* collection the chat never queries. | "Show sources" needs a data-layer change first, not just a UI icon. This is the biggest hidden dependency. |
| **F4** | **No floating/overlay chat window exists** — both shells are full-fill panels. A launcher FAB + pop-over is greenfield (but the components are wrappable). | Phase 2 floating window is real net-new UI work. |
| **F5** | **Pulsing-circle voice animation is feasible with small wiring.** TTS plays through Web Audio (`AudioBufferSourceNode`), so an `AnalyserNode` can tap amplitude. None exists today. **Barge-in already works server-side** (energy-gated). | Phase 4 is mostly wiring, not re-architecture. |
| **F6** | Portal is **React Router v7 SPA**. Deep-linking, `useNavigate`, and a **react-joyride highlight engine with ~60 `data-tour` anchors** already exist. NAVIGATE needs only a small `onNavigate` bridge prop on `AltioraChat`. | Phase 3 NAVIGATE is low-effort, pattern-consistent. |
| **F7** | Identity flows correctly proxy→backend→Altiora (acting user's bearer via AsyncLocalStorage). BUT **no RBAC** (`roles: []` hardcoded), **no action-level audit** (only turn telemetry), and real Altiora writes are **flag-gated off** (`FLOWDESK_SUBMIT_TARGET`). | ACT governance needs a new ActionLog/ExecutionRecord + a "require acting user, no service-account fallback" gate. |

**Two chat stacks exist** — do not confuse them:
- **Path A (primary/current): FlowDesk/Altiora chat** — `POST /api/v1/flowdesk/chat`, interpreter engine, `@flowdesk/chat-v2` / `AltioraChat` UI. **This is our target.**
- **Path B (legacy): UN ProjectAdvisor chat** — `POST /api/v1/chat`, `chat.controller.js` + `rag.service.js`. Has a rudimentary `sources[]` array but is a different component. Out of scope except as reference.

---

## TASK-0-01 — Dialog Engine Identification

### Answer to the KEY question: it is NOT GXE

The live chat is driven by the FlowDesk **"universal flow-as-data interpreter"** — `createEngine(...).runTurn()` in
`api/src/instances/flowdesk/interpreter/interpreter-engine.js`. Active because `api/.env:91` sets `FLOWDESK_CHAT_V2=true`, which makes the controller short-circuit into V2 and `return` before ever reaching the GXE fallback.

- `flowdesk.controller.js:389` — `if (FLOWDESK_CHAT_V2 === 'true')` → `chatV2.processMessage(...)` at `:395`, `return` at `:396` (**live branch**).
- `flowdesk.controller.js:404-432` — legacy fallback tries GXE `runtime-chat.js` then `dialog-session.js` (**dead while flag on**).
- `interpreter-engine.js` imports **none** of `RuntimeEngine`/`TopologicalScheduler`/`NodeRunner`/`AOPEGAdapter`; its "nodes" (`router`, `fillLoop`, `advance`) are hand-written imperative JS. The 13-node meta-graph in `interpreter-graph.js` is declared as data but executed imperatively in `_runTurnBody`. `verifyLinear()` (`interpreter-graph.js:63`) is a structural self-check, not an executor.

### Entry endpoints
- **Turn:** `POST /api/v1/flowdesk/chat` → `controller.chat` (`flowdesk.route.js:20`, handler `flowdesk.controller.js:377`). Mounted `api/index.js:227`.
- **Streaming side-channel:** `GET /api/v1/flowdesk/chat/:sessionId/stream` → SSE (`flowdesk.route.js:25`, `flowdesk.controller.js:723`).
- `flowdeskUserMiddleware` on all routes injects `req.flowdeskUser` (`flowdesk.route.js:9`).

### Turn call chain (live V2)
1. `chat-v2.service.js:74` `processMessage()` → `getEngine()` → `engine.runTurn()` wrapped in `withTurnCapture` telemetry.
2. `interpreter-engine.js:849` `runTurn()` → sets `AsyncLocalStorage(auth)` → `_runTurnBody()` (`:876`).
3. `_runTurnBody`: `LOAD_DRAFT` (`:879`) → deterministic shortcuts (disambiguation `:886`, catalog-browse `:900`, parked-resume `:916`, controlAction `:924`, choice `:932`, pending yes/no `:942`, REPAIR_ROUTER `:951`) → **ROUTER** LLM (`:965`→`:217`) classifying into `NEW_INTENT / SLOT_FILL / INFO_QUESTION / OUT_OF_SCOPE / CONFIRM_YES / CONFIRM_EDIT / MY_REQUESTS / CATALOG_BROWSE / FIELD_HELP` (`:31-39`) → route handlers → `fillLoop` (`SLOT_EXTRACT`→`VALIDATE`→`PATCH`→`advance`).

### State
- **`DraftSR` (SessionEnvelope) in Redis**, key `draft:{sessionId}`, 24h TTL (`draft-sr.service.js:20,25-31,66-68`). Reducer semantics in `contracts/draft-sr.reducer.js`.
- **Memgraph only at terminal materialization**: `submit()` writes `(:ServiceRequest)` (`draft-sr.service.js:256-269`).
- **`SchemaSnapshot`** compiled from Memgraph by `schema-graph/schema-compiler.js:50` `compile(serviceId)`. Engine holds **no cross-turn state** (full re-execution per turn).

### Streaming
- **SSE** (`text/event-stream`), not WebSocket/SignalR (`flowdesk.controller.js:727-738`, 15s heartbeat `:748`). Engine emits `turn:start/node:start/node:done/turn:done` via in-process `progress-bus`. Final answer returns on the POST response, not SSE.

### LLM provider
- `getLLMProvider({provider: FLOWDESK_LLM_PROVIDER, model: FLOWDESK_LLM_MODEL})` (`chat-v2.service.js:41`), factory `llm-provider/index.js:36`, 3 backends (`claude-code`/`claude-sdk`/`anthropic-api`).
- **Live: `anthropic-api` + `claude-haiku-4-5-20251001`** (`.env:94-95`). Impl `providers/anthropic-api.provider.js` (`structuredOutput` via tool_use `:59`, `completion` via messages.create `:80`).

---

## TASK-0-02 — Chat UI Inventory

### Two live copies (manually kept in sync)
| Copy | Path | Role |
|------|------|------|
| `FlowDeskChatV2` (source) | `mcp/src/features/flowdesk-chat-v2/` | dev copy, `/flowdesk-v2`, vitest-tested |
| `AltioraChat` = `@flowdesk/chat-v2` (prod) | `d:/UN/Repos/FlowDesk/FlowDesk/Frontend/Components/flowdesk-chat-v2/src/` | npm pkg embedded in portal |
| Vendored build | `mcp/vendor/flowdesk-chat-v2/dist/` | consumed by `/alt-chat-demo` |

Sync contract: `mcp/src/features/flowdesk-chat-v2/SYNC.md` ("change BOTH"). **Any UI change must be applied to both copies + version-bumped + rebuilt.**

### Component tree (source)
```
FlowDeskChatV2 → I18nextProvider → ChatShell (.fdv2-root)
  ├─ header .fdv2-header (LanguageSwitcher, TtsToggle, reset)
  └─ main
     ├─ MessageList → MessageBubble[] → {MarkdownText, ControlRenderer→AutocompleteControl, ChoiceButtons}
     │              → TypingIndicator
     ├─ Composer
     └─ DraftPanel → SlotRow
```
State: single Zustand store `store/chat-store.js:63` (`useChatStore`). Package entry `AltioraChat.jsx:89` has **no header bar** (folds lang/voice into Composer) and takes runtime-config props (`apiBaseUrl, userId, getAuthHeaders, onSubmitted/onError/onSessionStart`).

### controls[] contract
`ControlRenderer.jsx` — wrapper `.fdv2-controls` (`:99`), per-control `.fdv2-control` (`:53`). Types: **confirm** (`.fdv2-choice-confirm`), **choice** (per-option buttons), **autocomplete** (→`AutocompleteControl`, debounced typeahead to `/flowdesk/directory/{directory}`). Attaches to a message when `isLast && role==='assistant' && metadata.controls?.length>0` (`MessageBubble.jsx:29`).

### Floating window — DOES NOT EXIST
Both shells are `position:absolute; inset:0` full-fill panels (`chat-v2.css:20-21`). Portal mounts `AltioraChat` inline in a Home card (`ChatInterface.tsx:82-93`). No launcher FAB / pop-over. **Greenfield**, but wrappable (self-contained `.fdv2-root`, host-config props). Closest precedent: package-only floating "New Chat" pill `.fdv2-newchat` (`position:absolute; bottom; right`, `chat-v2.css:128-139`) — reusable idiom for a bottom-right per-message icon.

### Theming / i18n
- Theming: `--fdv2-*` custom props on `.fdv2-root`; source uses `prefers-color-scheme` + `[data-theme]`; package bridges to host shadcn/Tailwind tokens (`hsl(var(--primary))`), dark via portal `.dark` class.
- i18n: isolated `i18next.createInstance()`, 6 UN langs w/ RTL (`en,fr,es,ar,ru,zh`), lang persisted `localStorage['fdv2-lang']` + sent to backend. **Gap:** source `MessageBubble` has hardcoded Russian time strings; package fixed to `t()`.

### "Show sources" attach point
Target: **`MessageBubble`** footer meta row **`.fdv2-message-meta`** (`:54`, CSS `:146-149`). Existing `.fdv2-exec-log <details>` (`:57-66`) is the precedent for an expandable per-message disclosure. **Caveat: message metadata carries NO `sources` field today** — grep for `sources|citation` = 0 matches; `assistantMeta` (`chat-store.js:39-52`) lacks it. Needs (a) a new `sources` field threaded through the turn contract + `assistantMeta`, (b) icon/panel in `.fdv2-message-meta`.

---

## TASK-0-03 — KB Access Path from Chat

### Answer: provenance does NOT reach the chat answer today — NO
- Chat KB collection `altiora_knowledge` payload (`seed-altiora-knowledge.js:118-133`): `namespace, articleId, title, answerSnippet, summary, tags, serviceId, language, sourceCollection`. **No** `sourceDocumentSymbol`/Admiralty/`inForceStatus`/dates/nodeId.
- ARTICLE adapter maps only `{articleId, title, summary, sourceCollection, answerSnippet, score}` (`article.backend.js:53-63`) — would drop provenance even if present.
- `infoAnswer()` (`interpreter-engine.js:258-275`) flattens hits to `"- title: snippet"` and returns only `{response: <LLM text>}` — no structured source list.

### Access path
Single gated adapter **`AltioraToolsAdapter`** (`altiora-tools.adapter.js`), allowlist (`:27-41`) restricts chat to `kb.search`/`catalog.*`/`sr.*`/`directory.*`; raw graph + MCP admin tools denied. `kb.search` → `article.backend` (Qdrant `altiora_knowledge`, forced `namespace='Altiora'`). No raw Cypher KB query; MCP `search_knowledge`/`query_knowledge_graph` are **not** called by chat.

### Provenance the platform HAS but chat never joins
- `sourceDocumentSymbol` + `graphNodeId` → written to **`documents_entities`** collection (`vector-indexer.js:224,212`) — chat never searches it.
- Admiralty codes → `knowledge/tier1/schemas/admiralty-schema.js` (graph layer only).
- `inForceStatus` + validity dates → `document/validity.service.js:56-70` (on `:Document` nodes, not exposed to chat).

**Implication:** "Show sources" is not a late-drop bug — provenance was never joined into the KB the chat reads. Requires: add provenance to KB payload → preserve through `article.backend` → carry through ARTICLE result type → surface structurally.

### intent→service via ai_description
`flowdesk_services` Qdrant: many utterance points + one `source:'ai_description'` companion per service (Haiku-generated). Aggregation MAX-by-`service_code` lets ai_description win → lifts fuzzy/voice requests onto the right service. Disambiguation control when confidence low (`shouldDisambiguate` `:409-418`).

### Latency
Per INFO turn: 1 router LLM + (SERVICE + ARTICLE each = 1 TEI embed + 1 Qdrant search) + 1 answer LLM ≈ 2 embeds + 2 searches + 2 LLM calls. **No KB result/embedding cache.** Directory + schema caches exist adjacent.

---

## TASK-0-04 — Voice Pipeline AS-IS

### Pipeline
Decoupled orchestrator (NOT Azure Voice Live passthrough): `client mic → backend WS relay → Azure Speech STT → FlowDesk interpreter → Azure Speech TTS → client`.
- Routes: `POST /voice/token`, `/voice/transcript` (`flowdesk.route.js:52-54`). Proxy init `api/index.js:329`.
- WS relay `voice-proxy.js:136-198` (`initVoiceProxy`), path `/api/v1/flowdesk/voice/proxy`, instantiates **`VoiceOrchestratorSession`** (`:145`). Redis one-time ticket `mintTicket` (24-byte hex, 60s TTL, single-use `consumeTicket`).
- STT: `voice-orchestrator.js:_startRecognizer` (PCM 24kHz). TTS: `_speak` (`Raw24Khz16BitMonoPcm`, base64 `{type:'audio'}` frames).
- Credentials: `AZURE_VOICE_FOUNDRY_KEY` + `AZURE_VOICE_REGION` (default swedencentral).
- **Dead code:** `VoiceProxySession` passthrough class + `voice-config.js` Voice Live realtime URLs are defined but **never instantiated**.

### Pulsing-circle animation: FEASIBLE (small wiring)
- TTS plays via **Web Audio API** — `audio-playback.js` `enqueue()` decodes PCM16 → `createBufferSource()` → `src.connect(ctx.destination)` (`:70`). **NOT** an `<audio>` element or opaque MediaStream.
- **No `AnalyserNode` today** (0 occurrences). Insert `src → analyser → destination` at `:70`, read `getByteFrequencyData` per frame, expose levels up through `voice-session.js`/`use-voice.js` to a new visual component. `onStarted/onEnded` callbacks exist (`:74,84-88`) but are unused (not wired in `voice-session.js:170`).
- Capture side also Web Audio (`audio-capture.js`, AudioWorklet 24kHz) — mic amplitude also tappable.
- **No pulsing-circle component today** — `VoiceControls.jsx` (`LiveChatButton`) only swaps glyphs by state.

### Barge-in: SUPPORTED server-side
`voice-orchestrator.js:_onClientMessage` (`:122-147`): while speaking, `_frameHasSpeech` (RMS>800) → `_stopSpeaking`. **Client gap:** `AudioPlayback.clear()` exists but is never called on barge-in, so buffered TTS keeps playing (minor artifact). If animation should react to interruption, wire `clear()` on barge-in.

### Locale
Selected-lang mode (primary): `lang` passed end-to-end (`VoiceControls.jsx:16` → `?lang=` → server forces `speechRecognitionLanguage`). Auto-detect fallback: continuous LID over 6 UN locales.

### Transport
"Dual transport" = `direct` vs `proxy`; **only proxy reachable** (no ephemeral token minted, client throws on `wsUrl` to prevent key leak). .NET relay `UnpaProxyController.ProxyVoiceWebSocketAsync` `[AllowAnonymous][HttpGet("flowdesk/voice/proxy")]`, ticket-auth in query string. Full chain: browser → Vite/portal → .NET → Node relay → Azure Speech.

---

## TASK-0-05 — Frontend Routing & Navigation

### Both frontends accessible
- **PRIMARY: `FlowDeskPortal`** (`d:/UN/Repos/FlowDesk/FlowDesk/Frontend/Clients/FlowDeskPortal/`) — Vite + React 19 + TS SPA, branded "altiora". Pure React SPA (.NET only reverse-proxies).
- **Demo: `mcp/`** — hosts `/alt-chat-demo`, `/flowdesk-v2`. Shares the same `AltioraChat` component.

### Router: React Router v7 `BrowserRouter`
Portal `App.tsx:1,651` (`basename={basePath}`). Route table `App.tsx:226-233`: `/`, `/requests`, `/tasks`, `/approvals`, `/catalog`, `/chat`, `/mail/:folder?`, `*`→`/`. Only path param is `/mail/:folder?`.

### Deep-linking: SUPPORTED via query params
Centralized `shared/features/src/url-deep-link.ts:2-8` — `requestId, openTaskId, teamChat, message, messageId`. Global handlers read param → act → strip param:
- `?serviceId=<GUID>` → opens Create-Request wizard (`CatalogSearch.tsx:191-234`), preserved across MSAL redirect.
- `?requestId=&openTaskId=` → `GlobalTicketOpener.tsx:39-55`.
- `?teamChat=&message=` → `TeamChatDeepLinkHandler.tsx:22-26`.

### Programmatic nav: FEASIBLE via `useNavigate`
Used throughout (`Home.tsx:29` `navigate('/catalog?serviceId=...')`). **But `AltioraChat` has no nav hook** — only `onSubmitted/onError/onSessionStart` (`AltioraChat.jsx:89-107`), does not import react-router. NAVIGATE needs: **add an `onNavigate(target)` host callback prop** (mirrors existing `onSubmitted` plumbing), host wires `onNavigate={(t)=>navigate(t)}`. Cleanest option.

### Highlighting: EXISTS (react-joyride)
`react-joyride ^3.1.0`, wrapper `FlowDeskPortal/src/tour/`. `<Joyride>` does spotlight + scroll-to (`scrollToFirstStep`, `scrollOffset:80`). **~60 `data-tour="..."` anchors** already placed (`portal-catalog-search`, `portal-chat-input`, etc.). `TourContext` exposes `startTour/stopTour`. **Caveat:** section/step-list driven — no "highlight one arbitrary selector" entry point; a thin single-step addition would enable post-navigation highlight.

---

## TASK-0-06 — Identity & Permissions

### Do chat actions run under user identity? PARTIALLY / GATED
- Identity flows correctly: .NET dual-auth (`ApiKeyMiddleware` + `[Authorize]`) → `UnpaProxyController.InjectUserHeaders` sets authoritative `X-FlowDesk-User-*` + `X-FlowDesk-User-Token` (user's own bearer), overwriting client-supplied values → `flowdeskUserMiddleware` → `req.flowdeskUser` → `runWithActingUser` (AsyncLocalStorage). Trust boundary: chat API must only be reachable through the proxy.
- Outbound to Altiora: `altiora-client.js:createActingTokenProvider` = `getActingToken() || serviceTokenProvider()` — **user bearer in-request, service account outside**. Real ticket write `POST /api/tickets` uses the user's bearer.
- **BUT real Altiora write is DORMANT** — fires only if `FLOWDESK_SUBMIT_TARGET==='altiora'` (`draft-sr.service.js:244-246`); comment: "OPT-IN and DORMANT by default... 'too early'". **Default submit** writes local Memgraph `(:ServiceRequest)` with **no identity binding** (`:256-269`).
- Separate REST `POST /flowdesk/tickets` (`flowdesk.controller.js:508`) runs `ManageTicketExecutor` with **no user identity**.

### Audit: PARTIAL — telemetry yes, governance-grade no
- `chat-telemetry.service.js:recordTurn` → Memgraph `(:ChatSession)-[:HAS_TURN]->(:ChatTurn)` + JSONL. Captures `outcome, srNumber, ticketId, escalationId` + light identity (`userId, displayName, orgCode`). **Never stores bearer.**
- **No `ActionLog`/`ExecutionRecord`** for chat ACTs (grep confirmed). BackLog Executor's ActionLog is a separate, uninvoked subsystem.

### Two-level key
Catalog GUID (`ServiceCode`) → ousId (`OrganizationUnitServiceId`) via `POST /api/ServiceDistribution/detect` (`altiora-schema-client.js:144`); ousId stamped `metadata.altioraOusId`. Submit DTO carries **both** levels; auth attached transport-side (API-Key + user bearer), identity is **ambient** not in payload.

### Governance gaps for ACT intent
1. Identity works but **proxy-dependent** — direct access falls back to service account → ACT must hard-require an acting user (reject service-account fallback).
2. **No RBAC** — `roles: []` hardcoded, no capability to check before an ACT.
3. **No action-level audit** — need new ActionLog capturing identity + action + target + authorization basis + result.
4. Real writes flag-gated off today — governance surface small now, grows when flag flips.

---

## Consolidated implications for Phases 1–5 (for architect)

- **Phase 1 (Anchors):** New `UIAnchor` node schema + registry; frontend `data-kb-anchor` convention can reuse the existing `data-tour` anchor idiom (~60 already exist). CI drift-check is net-new.
- **Phase 2 (Explain + Show sources):** Two sub-dependencies surface as **prerequisites**, not UI polish:
  - (a) **Provenance data layer** (F3) — provenance must be added to the chat-readable KB and threaded through `article.backend` → ARTICLE result → `assistantMeta.sources` before any "Show sources" icon is meaningful.
  - (b) **Floating window** (F4) is genuine net-new UI.
  - Zero-query endpoint = new route feeding the interpreter with an anchor id instead of a user message.
- **Phase 3 (Intents):** CONSULT/EXPLAIN/NAVIGATE/ACT extend the **existing ROUTER schema** (already 9 routes). NAVIGATE = small `onNavigate` bridge (F6). ACT = capability manifest + confirm control (exists) + **new audit layer** (F7).
- **Phase 4 (Voice):** Pulsing circle = wire an `AnalyserNode` at `audio-playback.js:70` + new visual component; barge-in exists (F5). Mostly wiring.
- **Phase 5 (Feedback loop):** Gap-node lifecycle + KQS scoring exist as platform primitives; thumbs + anchor-click analytics are net-new signals.

## Open questions for ratification
1. **Show sources scope:** given F3, does "Show sources" ship with real UN provenance (requires KB re-seed/enrichment with `sourceDocumentSymbol`/Admiralty/`inForceStatus`), or start with the lighter fields the KB has today (`title`, `sourceCollection`, `articleId`) and upgrade later?
2. **Anchor registry namespace:** confirm `PROJECT:ALTIORA` (or a dedicated store).
3. **One component or two:** is the explain-chat (anchor pop-over) the same `AltioraChat` with a floating-window wrapper + anchor entry point, or a separate lightweight component?
4. **Sync burden:** every UI change touches both `mcp` source + `@flowdesk/chat-v2` package (version-bump + rebuild). Confirm this is acceptable for the anchor/sources/voice UI work.

---
*Read-only reconnaissance. No files modified. Awaiting architect review → TO-BE spec → PO ratification before Phase 1.*

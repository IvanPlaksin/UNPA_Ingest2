# FlowDesk Chat Admin — Design Plan

**Status:** IMPLEMENTED (P0–P4) · designed 2026-07-16, built + e2e-verified 2026-07-16/17
**All 5 open decisions (§8) ratified by Ivan 2026-07-16:** retention 90d + prompts off · abandonment 2h · HelpdeskViewer grant · env-allowlist authz · intent-clustering deferred.

## Implementation map (what shipped)

| Design section | Shipped as |
|---|---|
| §3 telemetry | `services/chat-telemetry.service.js` (turn capture + LLM wrapper), `chat-session-sweeper.service.js` (abandonment/retention), `admin-telemetry.service.js` (sync events + catalog runs), hooks in `chat-v2.service.js` / engine ticketId / controller stamps |
| §4 API | `routes/flowdesk-admin.route.js` + `controller/flowdesk-admin.controller.js` + `services/chat-admin.service.js` at `/api/v1/flowdesk/admin/*`; authz `middleware/flowdesk-admin.middleware.js` |
| §2/§6 UI | `mcp/src/features/flowdesk-admin/` — route `/flowdesk-admin/*`, Sidebar → Monitoring → Chat Admin; 8 tabs + SessionDrawer (transcript/timeline/draft/llm/triage) + SchemaDrawer (form preview/JSON/source) |
| §5 taxonomy | outcomes completed/escalated/parked/parked_abandoned/abandoned/submit_failed + flags repair_heavy/out_of_scope_loop/error_turns/negative_csat; triage → `POST /quality/:id/backlog` |
| **P5 session-analysis agent** | `services/session-analysis.service.js` (LLM verdict + problem classification + schema-clarity review), `services/prompt-overlay.service.js` (global/service prompt overlays in Memgraph), engine guidance injection (ROUTER / INFO_ANSWER / QUESTION_PLANNER), endpoints `POST /sessions/:id/analyze` + `GET/POST/PATCH /prompt-overlays`, UI `components/AnalysisView.jsx` (SessionDrawer "AI analysis" tab + ✨ row button) |

## P5 — Session-analysis AI agent & prompt overlays

An on-demand agent (✨ button per session on the Sessions tab / "AI analysis" drawer tab) that reviews one session and recommends prompt changes, applied WITHOUT a deploy via **prompt overlays**:

- **Analysis** (`session-analysis.service.js`): feeds the LLM the full transcript, final DraftSR state, and the invoked SchemaSnapshot; returns a strict-schema verdict — `successAssessment` (achieved/partial/not/indeterminate + score + summary), `problems[]` classified as `general_functionality | schema_specific | schema_clarity | llm_behavior | integration_error | user_behavior`, `generalPromptRecommendation`, `schemaPromptRecommendation`, and a per-field `schemaClarityFindings[]` review of the form's own labels/hints/options. Cached on the ChatSession node (`analysisJson`); `force` re-runs. Model: `FLOWDESK_ADMIN_ANALYSIS_MODEL` (default = chat model).
- **Prompt overlays** (`prompt-overlay.service.js`): `(:FlowdeskPromptOverlay)` nodes, scope `global` (appended to ROUTER/INFO_ANSWER/QUESTION_PLANNER for every conversation) or `service` (QUESTION_PLANNER only, when the active serviceId matches). Deliberately separate from the schema-graph so re-materializing an Altiora form never wipes an overlay. Active overlays concatenated (length-capped), read path cached 30s, injected best-effort (failure → no guidance, chat unaffected). Toggle `active` = soft revert.
- **Routing of the fix (as specified):** a general-functionality problem → the admin applies a **global** overlay (system-prompt change); a schema problem → a **service-scoped** overlay (that schema only); the schema's own field clarity is reviewed separately and surfaced as findings + feeds the service recommendation.

**Live e2e (2026-07-17):** analysis of the TKT-2026-000080 session (verdict achieved 0.95) flagged a `schema_specific` problem — the agent jumped to notes without mirroring the subject — and recommended a service overlay; applied as **POV-344a8656**; a fresh session on EO-HR-SA-SS-ISP then produced *"I'll note your request as: '…'. Is that correct?"* — the QUESTION_PLANNER phrasing changed exactly per the overlay, zero `getGuidance` failures. Tests: `session-analysis.test.js` (9); regression 286 green.

**E2E evidence (2026-07-16/17):** positive — chat → real Altiora ticket TKT-2026-000080 → outcome completed, ticketId 80, 3370 tokens, node traces; negative — 2× OUT_OF_SCOPE → `out_of_scope_loop` flag → triage → **BACKLOG-0057** auto-created; sweeper stamped 3 real `abandoned` sessions overnight. Known limitation: anthropic-api provider reports tokens not cost (cost=0), claude-code reports cost not tokens — both stored.

## P6 — System-prompt graph editor (rules graph → chat system prompt)

A graph editor at **/flowdesk-admin → Prompt Editor** where **one rule = one node**; the graph compiles to the chat's system-prompt text and is applied live. Reuses existing subsystems, not reinvented:

| Concern | Reused | New |
|---|---|---|
| Graph model + **versioning** | platform **graph-catalog** (`/api/v1/graph-catalog`: CatalogEntry→GraphVersion, `createVersion`=bump+SUPERSEDES, `promoteVersion`=active/isProduction pointer), namespace `CHAT_PROMPT`, nodes/edges as JSON | — |
| Canvas | ReactFlow (as Structural/AOPEG editors) | `prompt-editor/` (RuleNode, rulesStore, canvas, palette, properties) |
| **Prompt generation** | analogous to `structural-to-jsonschema` compiler | `prompt-graph-compiler.js` (rules → text + per-chat-node scoped map) |
| **Injection into chat** | the P5 `getPromptGuidance` seam pattern | `system-prompt.service.js` (`(:FlowdeskSystemPrompt {active})`, `getSystemPromptGuidance` cached 30s) + engine `getSystemPrompt` dep → leading authoritative block in ROUTER/INFO_ANSWER/QUESTION_PLANNER |
| **Validation** | platform `GraphValidator` (Kahn/DAG) | `prompt-graph-validator.js` (rules checks: non-empty text, unique keys, categories, identity) |
| **Sandbox** | the interpreter test harness `makeEngine` (in-memory store + no-op graphWrite) | `prompt-sandbox.service.js` — drives real chat turns against a candidate prompt, **zero side effects** (no Redis/Memgraph, no real Altiora ticket) |
| **AI assistant** | Claude Code spawn + `--mcp-config` (`claude-code-reanalyze` pattern) + GXE SSE contract | `prompt-editor-assistant.service.js` — streams token/tool_call/mutations; calls the real `flowdesk_admin_*` MCP tools; `--strict-mcp-config` to isolate from the user's global MCP config |

**Endpoints** (`/api/v1/flowdesk/admin/prompt/*`): `default-graph`, `graphs` (list/get/save via catalog), `graphs/:id/versions`, `compile`, `validate`, `sandbox`, `apply` (inline graph or catalog {entryId,version} → promote+materialize active), `active`, `applied`, `clear`, `assistant/chat` (SSE). MCP tools: `flowdesk_admin_prompt_{active,default_graph,list_graphs,compile,validate,sandbox,apply}`.

**Design choices:** the graph generates the GLOBAL system prompt (per-service tuning stays with P5 overlays); the generated prompt **augments** (leading block) rather than replaces the base node prompts, so critical routing taxonomy is preserved; the ADCC dialogue-conduct rules (previously dead code, never reaching the LLM) are seeded as rule nodes in the starter graph so they finally reach the chat.

**E2E verified (2026-07-17):** compiler (14-rule starter → 1775-char prompt, per-node scoping) · validator (clean/dup-key/dangling/empty/no-identity) · sandbox (real LLM, 2 turns, 0 tickets/0 writes) · apply → active → **live chat routing changed** · AI assistant SSE (864-char stream + `mutations` add-op) · graph-catalog save v1→v2 → apply-from-catalog v2 → v2 promoted `isProduction=true`. Unit tests `prompt-graph.test.js` (10); regression 295 green; vite build clean.

---
**Scope:** a new admin section in Project Advisor (frontend `mcp/`, backend `api/`) that surfaces every aspect of FlowDesk Chat V2 operating against the Altiora ITSM (`D:\UN\Repos\FlowDesk\FlowDesk`): chat sessions and logs, service catalog and schema state, sync health, submitted tickets, and — as a first-class feature — **negative-experience sessions** (users who did not get what they needed) as a data source for system improvement.

Namespace rule honored: everything lives under the **flowdesk instance** (`api/src/instances/flowdesk/`, routes `/api/v1/flowdesk/admin/*`, frontend `mcp/src/features/flowdesk-admin/`, route `/flowdesk-admin/*`). No client names in platform core.

---

## 1. Research findings (what exists / what's missing)

### 1.1 What exists today

| Layer | Asset | Where |
|---|---|---|
| Session state | DraftSR in Redis `draft:{sessionId}`, TTL 24h (slots, patches journal, dialogueStack, repair counters, pendingAction, status) | `services/draft-sr.service.js`, `contracts/draft-sr.{schema.json,reducer.js}` |
| Terminal outcomes | Memgraph `:ServiceRequest` (submit) and `:Escalation` (escalate, carries full draftJson) | `draft-sr.service.js:256-289` |
| Parked drafts | Redis `parked:{userId}` index + `draft:{id}::{updatedAt}` archive | `draft-sr.service.js:145-199` |
| Voice transcripts | Redis `voice:transcript:{sessionId}`, TTL 24h — the ONLY raw utterance log | `voice/voice.controller.js:21-44` |
| Per-turn events | progress-bus (in-process EventEmitter): `turn:start/done`, `node:start/done {node,status,duration}` — ephemeral, SSE-only | `interpreter/progress-bus.js`, `interpreter-engine.js:140-154` |
| LLM cost | `total_cost_usd` returned by claude-code provider per call — **discarded** by the engine | `llm-provider/providers/claude-code.provider.js:60-99` |
| Telemetry sink (unwired) | `AIUsageMonitor` — JSONL `logs/ai/ai-interactions-{date}.jsonl`, tokens/cost/RPM, `getUsageStats()`; used only by ainfra/graph-builder | `services/ai/ai-usage-monitor.service.js` |
| Schema cache | Registry in Memgraph keyed by `altioraOusId` (`namespace='Altiora'`), contentHash freshness, `listCached()` | `services/altiora-schema-registry.js` |
| Sync service | Dual-track (SignalR `ServiceFormChanged` + 5-min poll of `/schema/version`); rich `onLog` events — currently `console.log` only | `services/altiora-schema-sync.js` |
| Catalog | Qdrant `flowdesk_services` (79 real Altiora services, `service_guid`, `approval_required`, `hierarchy_path`, `source:'altiora'`) | `services/altiora-catalog-sync.js` |
| Ticket path | `mapDraftToTicketDto` → `POST /api/tickets` (FormDataJson keyed by Altiora field ids), returns `{srNumber, ticketId, status}` | `services/altiora-ticket.service.js` |
| Altiora reporting | `DashboardController` metrics, `OrgUnitProviderReportController`, ticket `Rating`/`RatingComment`, `TicketDetailsDto`, paged ticket search | Altiora `Controllers/*` |
| FE precedents | `DialoguePage` (URL-driven tabs + SessionDetailDrawer), `SourcesDashboard` (KPI + Recharts + polling), `MessageBubble`/`MessageList`/`DraftPanel` (fdv2), `Forms/FormRenderer` | `mcp/src/...` |

### 1.2 Critical gaps (the admin section cannot exist without fixing these)

1. **No persisted transcript for text chat.** User/assistant turns are never stored. `intentTrace[]` in DraftSR is declared but never written.
2. **No session list / cross-session query.** Only per-session `GET /draft/:sessionId`; `GET /chat/:sessionId` reads the *legacy in-memory* manager (404 for all V2 sessions).
3. **No failure taxonomy.** Statuses are `draft|confirmed|submitted|escalated|parked`; TTL-expired drafts vanish silently — abandonment is invisible.
4. **No LLM telemetry for chat.** Cost produced and thrown away; no latency/tokens/prompt capture; AIUsageMonitor not wired.
5. **No sync/catalog history.** `onLog` events and `syncCatalog()` results are ephemeral.
6. **No RBAC.** `flowdesk-user.middleware.js` hardcodes `roles: []`; nothing distinguishes an admin.

---

## 2. Information architecture — sections of the admin UI

Frontend route **`/flowdesk-admin/*`** (Sidebar NavItem under **Monitoring**), modeled on `DialoguePage`: header + KPI chip bar + URL-driven MUI `<Tabs>`, one file per tab, right-anchored detail `<Drawer>`.

### 2.1 `Overview` (dashboard)
KPI cards + trend charts (Recharts, reuse `ThroughputChart` shape):
- Sessions today / 7d, unique users, **completion rate** (submitted / started), escalation rate, abandonment rate, parked count.
- Median turns-to-submit, median duration, repair events per session.
- LLM: turns, cost/day, avg latency per node (ROUTER / SLOT_EXTRACT / QUESTION_PLANNER / INFO_ANSWER).
- Integration health strip: Altiora API reachability, SignalR connected, last poll result, catalog age, schemas cached/stale.
- "Needs attention" feed: recent escalations, new negative sessions, sync errors.

### 2.2 `Sessions` (session browser + replay)
- **List**: server-paged table; filters — outcome, service, user, date range, has-escalation, repair-count ≥ N, channel (text/voice), free-text search over transcripts. Status via `Chip` color map.
- **Detail drawer / permalink `/flowdesk-admin/sessions/:sessionId`** with sub-tabs:
  - **Transcript** — full replay reusing fdv2 `MessageBubble`/`MessageList` (markdown, choice buttons rendered read-only, controls[] once shipped); voice sessions merge `voice:transcript` entries with a channel badge.
  - **Turn timeline** — waterfall of node trace per turn (`node`, `status`, `duration`), route decisions (ROUTER/REPAIR_ROUTER outcome), errors highlighted.
  - **Draft state** — reuse `DraftPanel`: slots with provenance badges, patch journal as a timeline (op/old/new/provenance/rejected), dialogueStack + repair ladder position.
  - **LLM calls** — per-call model/latency/cost/tokens; prompt/response preview (redaction-aware, expandable).
  - **Outcome** — final status, srNumber/ticketId link (jump to Tickets tab), escalation record, quality labels.
- Live mode: active sessions stream via existing SSE `GET /chat/:sessionId/stream`.

### 2.3 `Quality` (negative experience — the improvement flywheel)
- **Detection feed**: sessions auto-flagged by the failure taxonomy (§5) with reason chips (escalated / abandoned / parked-no-submit / repair-heavy / out-of-scope-loop / error-turn / low-intent-confidence / negative CSAT from Altiora ticket Rating).
- **Triage workflow**: reviewer opens session replay → assigns **root-cause label** (catalog recall, schema/form defect, LLM misroute, missing service, dialogue UX, integration error, user abandoned) + free note → status `new → reviewed → actioned/dismissed`.
- **"Create BackLog task" action**: one click converts a triaged finding into a BACKLOG item via the existing backlog service (title, session permalink, transcript excerpt, root-cause) — closes the loop into the project's own improvement pipeline.
- **Analytics**: failure-rate trend, Pareto of root causes, per-service failure heatmap, funnel (intent resolved → form started → form completed → submitted) with drop-off percentages, top unresolved user intents (clustered from OUT_OF_SCOPE / low-confidence turns — later phase, embeddings already available via TEI).

### 2.4 `Catalog` (Altiora service catalog)
- Table of the mirrored catalog (Qdrant `flowdesk_services`): code, name, GUID, domain, hierarchy path, approvalRequired, slaHours, managerOnly, `source`, last-synced.
- Per-service drill-in: providers from live `POST /ServiceDistribution/detect` (ranked, with our `scoreProvider` vs Altiora MatchScore), materialization state (cached / stale / never), usage stats (sessions, submits, failures for this service).
- Actions: **Sync catalog now** (`syncCatalog()`, show `{fetched, upserted, purged}`), purge-stale toggle; sync-run history table.
- Recall diagnostics: test box "type a user phrase → see intent-resolution candidates + scores" (existing semantic-search path) — directly supports the I-2b utterance-quality work.

### 2.5 `Schemas` (request-form schemas)
- **Inventory** from `registry.listCached()`: ousId, serviceId, contentHash, version, fresh/stale/needsRefresh, lastMaterialized, LOV bake status (baked slots / pending / failed).
- **Schema viewer** per snapshot:
  - **Rendered form preview** — reuse `Forms/FormRenderer` (or `DraftPanel` in empty-draft mode) to show the form as the chat asks it: phases, slot order, enum options, conditionality (tref) visualized as "shown when…" annotations.
  - **Raw views**: SchemaSnapshot JSON, original Altiora SchemaJson (fetched live via `getSchema(ousId)`), and a **diff** (fields dropped as layout, type mappings, compiled rules) + materializer `warnings[]`.
  - Version panel: `contentHash`, Altiora `Version`, `updatedAt` (from `/schema/version`).
- Actions: invalidate one / invalidate all Altiora, **re-materialize now** (script logic exposed as endpoint), re-bake LOV.

### 2.6 `Sync & Integration`
- Live status: SignalR connected? poller running? last `pollOnce` `{checked, stale, errors}`; env-flag panel (read-only): `FLOWDESK_SCHEMA_PROVIDER`, `FLOWDESK_SUBMIT_TARGET`, `FLOWDESK_DIRECTORY_PROVIDER`, `FLOWDESK_CHAT_V2`, LLM provider/model.
- **Event history** table (persisted `onLog`): mark_stale (ousId, reason), signalr connected/closed/ignored, poll results, errors — filterable.
- Altiora endpoint health: latency/error-rate per called endpoint (detect, schema, FormLookup, tickets, directory) from the client-side call log (§4.4).
- Manual actions: `pollOnce`, reconnect SignalR, test Altiora auth (login round-trip).

### 2.7 `Tickets`
- Submitted requests joined across systems: local session → `srNumber`/`ticketId` → **live Altiora ticket status** (`GET /api/tickets/{id}` via altiora-client, acting as service account).
- Columns: ticket number, service, requester, created, Altiora status, SLA status, rating (+ comment) — ratings feed the Quality section as CSAT signal.
- Detail: ticket payload sent (FormDataJson mapped back to labels via `fieldIdMapping`), Altiora response, link back to session replay.
- Submission failures: sessions where `POST /tickets` errored (typed AltioraError preserved) — its own filter, feeds Quality.

### 2.8 `LLM Telemetry`
- Cost/latency/tokens per day, per node type, per provider/model (once wired to AIUsageMonitor).
- Slow-turn outliers table → jump to session replay.
- Provider/model change log (config snapshots per day).

---

## 3. Telemetry foundation (Phase 0 — prerequisite for everything)

### 3.1 Turn log — new persistent store

New service `services/chat-telemetry.service.js` subscribed at the two natural emission points: `interpreter-engine.runTurn` (turn-level: userText, reply, route, trace, error) and the LLM provider boundary (call-level: model, latency, cost, tokens).

**Storage: Memgraph (primary) + JSONL (firehose backup)** — consistent with the platform's dual precedent (`:ServiceRequest` nodes; ai-usage-monitor JSONL):

```
(:ChatSession {sessionId, userId, userDisplayName, orgCode, serviceId?, channel: 'text'|'voice',
               startedAt, lastActivityAt, endedAt?, outcome?, outcomeReason?,
               turns, repairSession, errorTurns, outOfScopeTurns, llmCostUsd, llmCalls,
               srNumber?, ticketId?, escalationId?, qualityStatus?: 'new'|'reviewed'|'actioned'|'dismissed',
               rootCause?, reviewNote?, reviewedBy?, backlogId?})
(:ChatTurn {turnId, seq, userText, agentText, route, nodeTraceJson, durationMs,
            llmCostUsd, llmLatencyMs, error?, ts})
(:ChatSession)-[:HAS_TURN]->(:ChatTurn), (:ChatTurn)-[:NEXT]->(:ChatTurn)
(:ChatSession)-[:RESULTED_IN]->(:ServiceRequest|:Escalation)
(:ChatSession)-[:FOR_SERVICE]->(:ServiceDef)
```

JSONL: `logs/chat/chat-turns-{date}.jsonl` (30-day retention, mirrors ai-usage-monitor pattern). Writes are fire-and-forget (never block a turn; failure = console warn).

### 3.2 Session finalizer (outcome assignment)

- On submit/escalate/park → stamp `outcome` immediately.
- **Sweeper job** (interval, e.g. 15 min): sessions with `lastActivityAt` older than the 24h TTL horizon (or a shorter inactivity window, e.g. 2h) and non-terminal status → `outcome:'abandoned'`, snapshot the final DraftSR into the session node before Redis expiry claims it.

### 3.3 LLM wiring

`chat-v2.service`/provider wrapper reports every call to `AIUsageMonitor.logRequest*` (subsystem tag `flowdesk-chat`) AND to the current ChatTurn. Capture: model, latency (wrap the call), `cost` (already returned), tokens (real for anthropic-api provider; 0 for claude-code — display "n/a").

### 3.4 Sync/catalog event persistence

`altiora-schema-sync` `onLog` → append to Memgraph `(:SyncEvent {type, ousId?, reason?, detail, ts})` ring (cap N=5000, prune oldest) + the same JSONL dir. `syncCatalog()` results → `(:CatalogSyncRun {startedAt, fetched, upserted, purged, errors})`. altiora-client gains an optional per-call hook (endpoint, status, latency) feeding `(:AltioraCallStat)` daily aggregates (not per-call rows).

### 3.5 PII & retention

Transcripts contain personal data (names, HR matters — the real catalog is EO-HR). Decisions to ratify:
- Retention: raw turns 90 days (configurable `FLOWDESK_CHAT_LOG_RETENTION_DAYS`), aggregates indefinitely.
- Never log the bearer token (already an invariant); redact `X-FlowDesk-User-Token` everywhere.
- Prompt/response bodies stored only when `FLOWDESK_CHAT_LOG_PROMPTS=true` (off default).
- Admin UI shows requester identity — acceptable for an internal admin tool, but gate behind RBAC (§4.5).

---

## 4. Backend API design

New router `routes/flowdesk-admin.route.js` mounted at `/api/v1/flowdesk/admin` (pattern: `flowdesk-config.route.js`), controller `controller/flowdesk-admin.controller.js`, thin over services.

### 4.1 Sessions & quality
| Endpoint | Purpose |
|---|---|
| `GET /admin/sessions?outcome&serviceId&userId&from&to&repairMin&channel&q&page&pageSize` | paged session list (Memgraph; `q` = transcript full-text) |
| `GET /admin/sessions/:sessionId` | session node + live DraftSR (if still in Redis) |
| `GET /admin/sessions/:sessionId/turns` | ordered turns (transcript + traces + LLM per-turn) |
| `GET /admin/sessions/stats?window` | dashboard aggregates (rates, funnel, trends) |
| `GET /admin/quality/negative?status&rootCause&...` | flagged sessions feed |
| `PATCH /admin/quality/:sessionId` | triage: `{qualityStatus, rootCause, reviewNote}` |
| `POST /admin/quality/:sessionId/backlog` | create BACKLOG item from finding |

### 4.2 Catalog & schemas
| Endpoint | Purpose |
|---|---|
| `GET /admin/catalog` | Qdrant scroll over `flowdesk_services` (+ per-service usage join) |
| `GET /admin/catalog/:code/providers?locationPath` | live `detectProviders` inspection |
| `POST /admin/catalog/sync` | run `syncCatalog()`; `GET /admin/catalog/sync-runs` history |
| `GET /admin/schemas` | `registry.listCached()` enriched (freshness, LOV state) |
| `GET /admin/schemas/:ousId` | stored SchemaSnapshot + live SchemaJson + version probe |
| `POST /admin/schemas/:ousId/rematerialize` \| `/invalidate` \| `/rebake-lov` | ops actions |
| `GET /admin/intent/resolve?q` | intent-resolution diagnostics (candidates + scores) |

### 4.3 Sync & tickets & LLM
| Endpoint | Purpose |
|---|---|
| `GET /admin/sync/status` | `isRunning`, `signalrConnected`, flags snapshot |
| `GET /admin/sync/events?type&from&to` | persisted event history |
| `POST /admin/sync/poll` | manual `pollOnce()` |
| `GET /admin/tickets?status&from&to` | session-joined submissions; per-row live status fetch (cached 60s) |
| `GET /admin/tickets/:ticketId` | live Altiora `TicketDetailsDto` passthrough + our sent payload |
| `GET /admin/llm/stats?window&groupBy=node\|model\|day` | telemetry aggregates |
| `GET /admin/health` | composite: Altiora API, SignalR, Redis, Memgraph, Qdrant, TEI |

### 4.4 Altiora surfaces consumed (service account)
`GET /api/tickets/{id}`, `GET /api/tickets?...` (needs `HelpdeskViewer` role on the service account for cross-unit reads — **ask Altiora owner**), `POST /ServiceDistribution/detect`, `GET /{ousId}/schema[/version]`, optionally `GET /api/Dashboard/metrics` (needs `dashboard:view`) for an "Altiora side" panel.

### 4.5 AuthZ
Minimal viable: `FLOWDESK_ADMIN_USERS` env allowlist checked against `req.flowdeskUser.id`/email by a new `flowdesk-admin.middleware.js`; direct (non-proxy) access in dev via `FLOWDESK_ADMIN_TOKEN` header. Proper RBAC (roles in the middleware) is a platform-level follow-up.

---

## 5. Failure taxonomy (Quality section core)

| Outcome | Detection | Source |
|---|---|---|
| `completed` | status=submitted, ticket created | submit hook |
| `escalated` | status=escalated | escalate hook |
| `parked_abandoned` | parked, never resumed within TTL | sweeper |
| `abandoned` | non-terminal + inactivity window elapsed | sweeper |
| `error_terminated` | last turn ended in ERROR node / internalError | turn log |
| `submit_failed` | AltioraError on POST /tickets | ticket service |

Quality **flags** (orthogonal, any outcome): `repair_heavy` (repair.session ≥ 3), `handoff_offered` (ladder rung 5), `out_of_scope_loop` (≥2 OUT_OF_SCOPE turns), `low_intent_confidence` (deflection turns), `slow_turns` (p95 latency breach), `negative_csat` (Altiora ticket Rating ≤ 2 — polled post-completion). A session is surfaced in the Quality feed when outcome ∈ {escalated, abandoned, parked_abandoned, error_terminated, submit_failed} OR any flag set.

---

## 6. Frontend design

- **Feature folder** `mcp/src/features/flowdesk-admin/` — own service (`flowdeskAdmin.service.js`, axios thin wrappers), own Zustand store (`create(devtools(...))`), tab components.
- **Shell**: `FlowDeskAdminPage.jsx` = header + KPI chips + `<Tabs>` (Overview / Sessions / Quality / Catalog / Schemas / Sync / Tickets / LLM), nested routes for permalinks (`/sessions/:id`, `/schemas/:ousId`). Register in `App.jsx` + Sidebar (Monitoring).
- **Data**: `Promise.all` + `setInterval(load, 5000)` polling for live panels (SourcesDashboard pattern); SSE only for live-session watch.
- **Reuse**: `MessageBubble`/`MessageList` (replay), `DraftPanel` (slot state), `Forms/FormRenderer` (schema preview), Recharts Area/Line (trends), MUI `Table size="small"` + `Chip` status maps, right `Drawer` for detail, `Collapse` for expandable rows.
- **New rich components**: TurnWaterfall (node-trace gantt per turn), RepairLadderBadge, FunnelChart (intent→form→submit), RootCausePareto, SchemaDiffView (side-by-side SchemaJson↔Snapshot with drop/transform annotations), TriagePanel (label + note + backlog button).

---

## 7. Phasing

| Phase | Deliverable | Depends on |
|---|---|---|
| **P0 Telemetry foundation** | turn log (Memgraph+JSONL), session finalizer/sweeper, LLM wiring to AIUsageMonitor, sync-event persistence, admin authz middleware | — |
| **P1 Sessions + Overview** | admin router (§4.1 core), FE shell + Overview + Sessions with replay | P0 |
| **P2 Quality** | taxonomy + flags, triage workflow, backlog integration, funnel/Pareto analytics | P1 |
| **P3 Catalog + Schemas + Sync** | §4.2/§4.3 endpoints, schema viewer + diff, ops actions, event history UI | P0 (independent of P1 data) |
| **P4 Tickets + LLM + polish** | Altiora ticket join + CSAT backflow, LLM dashboards, intent-resolution diagnostics, transcript full-text search | P1–P3 |

P3 can proceed in parallel with P1/P2 (different data sources).

## 8. Open decisions (need ratification)

1. **Transcript retention & prompt logging** defaults (proposal: 90d turns, prompts off).
2. **Abandonment inactivity window** (proposal: 2h, before the 24h TTL).
3. Service-account **role grants on Altiora** (`HelpdeskViewer` for cross-unit ticket reads; `dashboard:view` if the Altiora metrics panel is wanted) — Altiora-owner action.
4. Admin **authz mechanism** (env allowlist now vs platform RBAC).
5. Whether P2 intent-clustering (unresolved-intent mining via TEI embeddings) is in scope for v1 or a follow-up.

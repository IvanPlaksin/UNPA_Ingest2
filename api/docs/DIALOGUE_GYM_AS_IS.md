# Dialogue Gym — AS-IS Reconnaissance Report

> Step 1 of the Dialogue Gym build. Documents the existing FlowDesk Chat V2 infrastructure
> that Dialogue Gym will build ON TOP OF (not duplicate). All paths repo-relative.

## 1. System Prompt Storage — "P6 Prompt Graph"

The system prompt is a **rules graph** (1 rule = 1 node) versioned in the platform graph-catalog
under namespace `CHAT_PROMPT`, compiled to markdown text, materialized as a single ACTIVE
Memgraph node the interpreter reads every turn.

**Backend services (`api/src/instances/flowdesk/services/`):**
- `system-prompt.service.js` — runtime read-path + apply write-path. `applyFromGraph(graph, meta)`,
  `getSystemPromptGuidance()` (per-turn, cached 30s, fail-open), `guidanceForNode(node)`, `PROMPT_NODES`.
- `prompt-editor.service.js` — CRUD/actions. `NAMESPACE='CHAT_PROMPT'`, `listGraphs/getGraph/saveGraph/
  getVersions/promoteVersion`, `compile`, `validate`, `sandbox`, `apply`, `mutateGraph`, `defaultGraph`.
- `prompt-graph-compiler.js` — `compilePromptGraph(graph)` → `{text, byNode, ruleCount, sections}` (Kahn topo-sort).
- `prompt-graph-validator.js` — `validatePromptGraph(graph)` → `{ok, errors, warnings, stats}`.
- `prompt-editor-assistant.service.js` — SSE AI assistant (Claude Code + MCP).
- Persistence delegated to `api/src/services/graphCatalog.service.js` (CatalogEntry → GraphVersion).

**Authoring graph node** (`type:'ruleNode'`), `data`:
`kind` (rule|section), `key`, `title`, `text` (the instruction), `category`
(identity|domain|routing|dialogue|tone|safety|deflection|formatting|custom), `appliesTo` (subset of
`router,info_answer,question_planner,slot_extract,field_help,my_requests`; `[]`/`['all']`=all),
`enabled`, `priority`.

**Compiled ACTIVE node** (Memgraph `:FlowdeskSystemPrompt {active:true}`): `promptId`, `text` (≤16000),
`byNodeJson`, `graphEntryId`, `graphVersion`, `ruleCount`, `label`, `updatedBy`, `appliedAt`.
Apply = last-writer-wins (`SET active=false` all → `CREATE` new).

**Reaches live chat:** `interpreter/chat-v2.service.js:66` → `getSystemPrompt: (node) => system-prompt.service.guidanceForNode(node)`.
`interpreter/interpreter-engine.js` injects it as leading authoritative block at nodes router/info_answer/question_planner.
Composition: **[P6 graph prompt (authoritative)] + base prompt + [P5 overlays (tuning)]**.

**HTTP routes** (`routes/flowdesk-admin.route.js`, mounted `/api/v1/flowdesk/admin`, behind adminMiddleware):
`GET /prompt/{meta,default-graph,graphs,graphs/:id,graphs/:id/versions,active,applied}`,
`POST /prompt/{graphs,graphs/mutate,compile,validate,sandbox,apply,clear,assistant/chat}`.

**Frontend** (`mcp/src/features/flowdesk-admin/prompt-editor/`): `PromptEditorTab.jsx` (ReactFlow canvas),
`RulePropertiesPanel`, `AssistantPanel`, `TestApplyPanel`, `RuleNode`, `rulesStore.js` (Zustand).
API client `mcp/src/features/flowdesk-admin/api/adminClient.js`.

**MCP tools** (`services/sync/src/tools/flowdesk-admin-tools.ts`): `flowdesk_admin_prompt_{active,default_graph,
list_graphs,get_graph,save_graph,mutate_graph,compile,validate,sandbox,apply}`.

## 2. Sandbox — zero-side-effect prompt runner (⭐ ArenaRunner foundation)

Dedicated code path (NOT a dryRun flag): `services/prompt-sandbox.service.js` → `runSandbox(p, deps)`.
Endpoint `POST /api/v1/flowdesk/admin/prompt/sandbox`. MCP `flowdesk_admin_prompt_sandbox`.

**Request:** `{ messages: string[] (required, ≤12), graph?|systemPromptText?, serviceId?, lang='en', userContext? }`.
Optional 2nd arg `deps` injects `{llm, resolveSearch, loadSnapshot, directory}` — used by tests to pass MockLLMProvider.
Default LLM = real provider (claude-code / `claude-sonnet-4-6`).

**Isolation:** in-memory draft store (no Redis), `graphWrite` no-op (no Memgraph writes, counted), ticket
create stubbed (`SR-SANDBOX…`, status SANDBOX, no Altiora POST), no telemetry (calls `createEngine().runTurn`
directly, bypasses `chat-v2.service.processMessage`), overlays excluded (no `getPromptGuidance`).

**Multi-turn:** loops `messages[]` sequentially through one persistent engine + synthetic `sessionId`
(`sandbox-<ts>-<n>`); slots/DraftSR carried across turns. Per-turn errors captured, don't abort.

**Response:** `{ systemPromptText, ruleCount, validation, transcript:[{user,agent,route,askingSlot,srNumber,
isComplete,ms}|{user,error,ms}], sideEffects:{ticketsCreated,memgraphWrites}, sessionId }`.

> **Key insight:** the ArenaRunner needs to inject a *scripted user LLM* on the user side and read the
> transcript. `runSandbox` already drives multi-turn with an injectable candidate prompt + injectable LLM
> deps and full transcript output — but the `messages[]` are fixed up-front. Gym needs a variant that lets
> a **persona-agent generate the next user message from the agent's last reply** (interactive loop), not a
> pre-baked script. This is the main gap to close in Phase 1.

## 3. Telemetry — ChatSession / ChatTurn

**Writer:** `services/chat-telemetry.service.js`; wired in `interpreter/chat-v2.service.js` via
`withTurnCapture` / `wrapLLMProvider` / `captureProgress` / `recordTurn` (fire-and-forget).
Finalizer `chat-session-sweeper.service.js` (abandon 2h/24h, 90d retention). Reader `chat-admin.service.js`.

**Dual storage:** Memgraph `(:ChatSession {sessionId})-[:HAS_TURN]->(:ChatTurn)` + JSONL
`logs/chat/chat-turns-{date}.jsonl` + platform `AIUsageMonitor` (tag `flowdesk-chat`).

**`:ChatSession`** (MERGE per turn): identity (`sessionId,userId,orgCode,serviceId,channel,lang,namespace='FlowDesk'`),
timestamps (`startedAt,lastActivityAt,endedAt`), counters (`turns,errorTurns,outOfScopeTurns,repairSession,
llmCostUsd,llmTokens,llmCalls`), outcome (`outcome,draftStatus,srNumber,ticketId,escalationId,finalDraftJson,
lastError`), triage (`qualityStatus,rootCause,reviewNote,reviewedBy,backlogId,rating`),
P5 cache (`analysisJson,analyzedAt,analysisModel`).

**`:ChatTurn`** (CREATE per turn): `turnId,seq,sessionId,ts,channel,userText,agentText,route,askingSlot,error,
durationMs,llmCostUsd,llmTokens,llmLatencyMs,nodeTraceJson,llmCallsJson`. Text capped 4000; prompt/response
only if `FLOWDESK_CHAT_LOG_PROMPTS=true`.

**Quality signals** (heuristic, computed in `sessionView`): flags `repair_heavy`(≥3), `out_of_scope_loop`(≥2),
`error_turns`(≥1), `negative_csat`(rating≤2); `negative` = bad outcome OR any flag.
`BAD_OUTCOMES=['escalated','abandoned','parked_abandoned','submit_failed']`.
Aggregates: `sessionStats({days})`, `llmStats({days})`.
**No LLM-graded per-turn/session quality score exists** — this is the Judge gap.

## 4. Session-Analysis Agent (P5) — Judge foundation

**Agent:** `services/session-analysis.service.js` — `analyzeSession(sessionId, {force})`, `ANALYSIS_SCHEMA`,
`buildPrompt`. Model `FLOWDESK_ADMIN_ANALYSIS_MODEL`→`FLOWDESK_LLM_MODEL`→`claude-sonnet-4-6` via
`structuredOutput`. Cached on `(:ChatSession).analysisJson`.

**Input:** session metadata + transcript (first 40 turns) + final DraftSR (slots+provenance) + compiled SchemaSnapshot.
**Output (`ANALYSIS_SCHEMA`):** `successAssessment{userGoalAchieved(enum),score:0-1,summary}`,
`problems[]{category,description,evidenceTurns}`, `generalPromptRecommendation{needed,proposedText,rationale}`,
`schemaPromptRecommendation{...}`, `schemaClarityFindings[]{slotId,issue,suggestion}`.

**Feeds prompt-overlays:** `services/prompt-overlay.service.js` — `(:FlowdeskPromptOverlay)` scope global/service,
injected via engine dep `getPromptGuidance`, toggle `active` = soft revert.

**Triage flow** (`chat-admin.service.js`): `listNegativeSessions`, `triageSession({qualityStatus,rootCause,...})`
(`ROOT_CAUSES=[catalog_recall,schema_defect,llm_misroute,missing_service,dialogue_ux,integration_error,
user_abandoned,other]`), `createBacklogFromSession` (→ BACKLOG item, closes loop).
MCP: `flowdesk_admin_{analyze_session,list_negative_sessions,triage_session,...}`.

**As Judge base:** strong — `successAssessment.score` already an LLM verdict, `buildPrompt` assembles context,
strict structured output, independent stronger model. **Gaps:** on-demand not continuous; single-dimension score
(no rubric: helpfulness/correctness/tone/efficiency/hallucination); fix-oriented not eval; no ground-truth/regression.
Judge = wrap same `getSessionData`+`buildPrompt`, swap schema for multi-criteria rubric, run automatically.

## 5. Service Catalog — Qdrant `flowdesk_services`

Collection `flowdesk_services` (env `FLOWDESK_SERVICE_COLLECTION`), 1024-dim Cosine, TEI embeddings.
`QDRANT_URL` default `http://localhost:6333`, `TEI_URL` `http://localhost:8081`. ~79 real EO-HR/EO-FIN services.

**Canonical catalog point** (`altiora-catalog-sync.js` `mapPayload`): `text` (displayName.brief.detailed),
`lang`, `service_code` (agg key, e.g. `EO-FIN-GM-GA-ACA`), `service_name`, `domain_code` (EO-FIN/EO-HR),
`category`, `service_guid` (=Altiora serviceId, = point id, idempotent), `approval_required`, `sla_hours`,
`hierarchy_path`, `manager_only`, `source:'altiora'`. Keyword indexes: service_code, domain_code, lang, category.

**`ai_description` companion point** (`schema-enrichment.service.js`, Haiku P7): one per service,
`source:'ai_description'`, deterministic UUIDv5 id (`sha1(NS+code+'ai_description')`), embeds AI description +
≤12 keyword synonyms. Graph-linked `(:ServiceDescription)-[:DESCRIBES]->(:ServiceDef)`.

**Intent resolution:** `flowdesk_admin_resolve_intent` → `GET /intent/resolve?q=` →
`chat-admin.service.resolveIntent` → `resolve-search.service` → `backends/service.backend.js` →
`semantic-search.classifyUserIntent`: embed query, Qdrant search (limit 10, `score_threshold:0.3`),
`aggregateByService` (MAX score per service_code, incl. ai_description → recall can only rise),
`calculateConfidence` (high≥0.85/gap0.15, medium≥0.70/gap0.10, low≥0.55, else unclassified).
Returns `{top_match, alternatives[0..3], confidence, confidence_score}`.

## 6. Gaps & Observations for Dialogue Gym

1. **ArenaRunner** — `runSandbox` is 80% there but takes a fixed `messages[]`. Need an interactive variant
   where a persona-LLM produces each next user turn from the agent's prior reply. Reuse the isolation +
   candidate-prompt + injectable-LLM + transcript machinery; add the user-simulation loop + turn budget +
   terminal conditions (goal reached / persona gave up / max turns).
2. **PersonaLibrary + ScenarioBank** — nothing exists yet. New CORE-namespace subsystem. Personas need an
   explicit anti-benevolence parameter (withhold info, wrong terms) per the τ-bench benevolence-bias lesson.
   Scenarios can be auto-seeded from the 79 Qdrant services + red-team hand cases.
3. **Judge** — no continuous multi-criteria scorer. P5 `session-analysis` is the scaffold to fork:
   same context builder, new rubric schema (intent-accuracy [deterministic vs scenario ground-truth],
   clarification-efficiency, grounding/hallucination, UN-collegial tone, controls correctness, multilingual).
   Must be calibrated on a hand-labeled golden set BEFORE optimization (Nubank lesson).
4. **Ground-truth** — scenarios must carry a verifiable expected outcome (correct service_code identified)
   so intent-accuracy is scored deterministically, not only by LLM judge.
5. **Reuse, don't duplicate** — versioning (graph-catalog CHAT_PROMPT), apply/governance, telemetry, and the
   sandbox are all production-grade already. Gym is: PersonaLibrary + ScenarioBank + interactive ArenaRunner +
   JudgePanel + GEPA loop wiring, plus a governance gate reusing the existing prompt-apply path.

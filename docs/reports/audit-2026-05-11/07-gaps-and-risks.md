# Gaps and Risks
## Audit Date: 2026-05-11

> Architecture declarations vs. implementation discrepancies. All findings are based on direct code inspection, not assumptions.

---

## Critical Gaps (Production Blockers)

### GAP-001: Global Knowledge Base is Empty
**Severity:** CRITICAL
**Evidence:** Qdrant `embeddings_unified` = 0 points. All platform `embeddings_*` collections = 0 points.
**Impact:** The platform's core capability — semantic search over institutional knowledge — has no data. `GET /api/v1/graph-rag`, `GET /api/v1/knowledge`, and RAG-based AI agent responses will return no knowledge results.
**Why:** Knowledge extraction via WorkSpace pipeline produces DraftEntity nodes. Promotion to GlobalKB requires explicit user action (PromotionSagaService). No automated seeding or batch import of existing knowledge has been done.
**Resolution needed:** Either run extraction + promotion pipelines, or import existing knowledge corpus.

---

### GAP-002: Azure AI Foundry Streaming Not Verified
**Severity:** CRITICAL for production
**Evidence:** `api/src/services/llm/LLMProviderService.js:168` — TODO comment: "TODO: Verify Azure streaming format matches Anthropic SDK stream format."
**Impact:** When `LLM_PROVIDER=azure`, all streaming responses (SSE execution streams, real-time agent output) may fail silently or produce malformed output. Azure AI Foundry uses a different streaming protocol (server-sent delta events) than the Anthropic SDK's stream format.
**Files affected:** LLMProviderService.js, AnthropicAgentService.js streaming path.
**Resolution needed:** Test and fix `AzureAIFoundryProvider.stream()` against actual Azure endpoint.

---

### GAP-003: LLMProviderService is Not Universal
**Severity:** HIGH for Azure deployment
**Evidence:** 18+ files import `require('../llm.service')` or `require('./gemini.service')` directly, bypassing LLMProviderService:
- `api/src/services/extraction/pattern-enhanced-extractor.js:18`
- `api/src/services/preprocessing/coreference-resolver.js:18`
- `api/src/controllers/chat.controller.js:2` (uses gemini directly)
- `api/src/controllers/assistant.controller.js:17`
- `api/src/controllers/mssql-assistant.controller.js:11`
- `api/src/core/aopeg/plugins/common/executors/ai-agent.executor.js:86`
- `api/src/core/aopeg/plugins/common/executors/ai-generate.executor.js:51`
- `api/src/core/aopeg/plugins/dialogue/executors/dialogue.extract_decisions.js:142`
- `api/src/core/aopeg/plugins/rag/index.js:19`
- `api/src/mcp/services/ServiceConnector.js:42`
- And ~8 more

**Impact:** When `LLM_PROVIDER=azure`, these paths still use the old `llm.service.js` which connects to Anthropic directly. Critical extraction, chat, and AOPEG executor paths do NOT switch to Azure.
**Resolution needed:** Refactor all direct `llm.service` imports to use `getLLMProvider()` from LLMProviderService.

---

### GAP-004: ts-node as Transitive Dependency
**Severity:** HIGH for production
**Evidence:** `api/index.js:4` calls `require('ts-node').register(...)`. `api/package.json` does NOT list ts-node in `dependencies` or `devDependencies`.
**Impact:** ts-node is available only as a transitive dependency through another package. Any package update that removes this transitive path will cause immediate startup failure in production.
**Resolution needed:** Add `ts-node` explicitly to `api/package.json` dependencies.

---

## Architectural Violations

### VIOLATION-001: FlowDesk in Platform Core
**Severity:** ARCHITECTURAL (stated CRITICAL in CLAUDE.md)
**Evidence:**
- `api/src/core/aopeg/plugins/flowdesk/` — 17 FlowDesk-specific AOPEG executors
- `api/src/services/flowdesk/` — 20+ FlowDesk service files
- `api/src/routes/flowdesk.route.js` — 21 endpoints mounted at `/api/v1/flowdesk`
- `api/src/routes/flowdesk-config.route.js` — exists (not mounted)
- `api/index.js:196` — `app.use('/api/v1/flowdesk', flowdeskRoutes)`
- `mcp/src/pages/FlowDeskPage.jsx` + `FlowDeskConfigPage.jsx`
- `mcp/src/stores/flowdeskConfigStore.js`
- `mcp/src/components/FlowDesk/`
- Qdrant collection `flowdesk_services` (1,704 points)

**CLAUDE.md states:** "Namespace Separation (CRITICAL): No client names in core code/files/routes."
**Impact:** Platform is coupled to one specific client project. Deploying the platform to a new client requires surgically removing FlowDesk code. The stated architecture principle is violated throughout every layer (plugin, service, route, frontend).

---

### VIOLATION-002: ProvenanceService is In-Memory Only
**Severity:** HIGH
**Evidence:** `api/src/services/provenance.service.js` — all state in `this.rounds = new Map()`. No Memgraph or Redis writes.
**Usage:** `incrementalKG.route.js` calls `getProvenanceService()` for tracking ingestion rounds. `EntityResolver.js` uses provenance lifecycle states.
**Impact:** All provenance tracking is lost on API restart. Knowledge ingestion provenance (which entity came from which source at which time) cannot be replayed or audited after a restart.

---

### VIOLATION-003: RAG Executors Have Stub LLM Calls
**Severity:** MEDIUM
**Evidence:**
- `api/src/core/aopeg/plugins/rag/executors/expand-query.executor.ts:315` — "Expand query using LLM (stub - would use actual LLM)"
- `api/src/core/aopeg/plugins/rag/executors/rerank.executor.ts:268-281` — Both LLM-based and cross-encoder reranking methods are stubs
**Impact:** The RAG pipeline's query expansion and advanced reranking do not function. Retrieval quality is limited to basic vector similarity without LLM-based enhancement.

---

### VIOLATION-004: Hardcoded Developer Machine Path
**Severity:** MEDIUM for production
**Evidence:** `api/src/services/agents/anthropic-agent.service.js:19`:
```
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || 'd:/UN/Repos/MCP_CLAUDE/mcp-server/dist/index.js'
```
**Impact:** Default path only works on the original developer's Windows machine. Docker and production deployments require `MCP_SERVER_PATH` env var to be set, or agent functionality silently fails (StdioClientTransport spawn fails, tools unavailable).

---

### VIOLATION-005: Dual .js/.ts Files in AOPEG Plugins
**Severity:** MEDIUM (maintenance risk)
**Evidence:** Most plugin directories contain both `.js` and `.ts` versions:
- `workflow.plugin.js` AND `workflow.plugin.ts`
- `subgraph.plugin.js` AND `subgraph.plugin.ts`
- `ingestion/index.js` (loaded by require) AND `ingestion/executors/*.ts` (loaded via ts-node)
**Impact:** Unclear which version is authoritative. Divergence between JS and TS implementations is possible and cannot be detected at runtime. Developers may edit the wrong file.

---

### VIOLATION-006: Unmounted Route Files
**Severity:** LOW (dead code risk)
**Evidence:** The following route files exist but are not mounted in `api/index.js`:
- `flowdesk-config.route.js` — 5 endpoints
- `ineed-test.route.js` — 5 endpoints
- `backlog-extended.route.js` — 22 endpoints (SIGNIFICANT — unclear if intentionally unmounted)
- `knowledge.routes.js` (10 endpoints, different from `knowledge.route.js` which IS mounted)
**Impact:** `backlog-extended.route.js` has 22 endpoints that may represent real functionality that is inaccessible. Dead code risk for the others.

---

## Data State Risks

### RISK-001: 90 Orphaned Workspace Qdrant Collections
**Evidence:** 90 `workspace_<uuid>` Qdrant collections exist. Only 4 are non-empty. Workspaces created during development/testing accumulate collections that are never cleaned up.
**Impact:** Storage accumulation. OrphanDetector background job should address this but runs every 6 hours and may not clean Qdrant collections (only Memgraph nodes).

---

### RISK-002: Workspace Client FlowDesk Data in Platform Vector Store
**Evidence:** `flowdesk_services` Qdrant collection has 1,704 points. `workspace_flowdesk` collection exists. These are client-project-specific data stored in the platform's vector infrastructure.
**Impact:** If the platform is redeployed without FlowDesk, this data is orphaned. Client data mixed with platform infrastructure data.

---

### RISK-003: Job Queue In-Memory Fallback
**Evidence:** `job-queue.service.js` uses `InMemoryQueue` fallback when Redis is unavailable. BullMQ requires Redis but falls back silently.
**Impact:** During extraction jobs, if Redis is unavailable, all queued extraction jobs exist only in process memory. API restart = all pending extraction jobs lost.

---

## Technology Stack Risks

### RISK-004: Mixed JavaScript / TypeScript Without Compiler Enforcement
**Evidence:**
- Core runtime is JavaScript (RuntimeEngine.js, NodeRunner.js, TopologicalScheduler.js)
- Repositories are TypeScript (ImmutableGraph, Sigillum)
- AOPEG plugins have both .js and .ts versions
- TypeScript is transpiled at runtime via ts-node (transitive dependency)
- Coverage data shows 0 TypeScript lines hit in coverage reports
**Impact:** No compile-time type safety across the codebase. TypeScript provides no guarantee since it is runtime-transpiled, not build-time compiled. The `npx tsc --noEmit` step is not in the standard build or CI process.

---

### RISK-005: API Security Hardening
**Evidence from code:**
- `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` in `api/index.js:6` — SSL verification disabled globally for on-premise ADO
- This affects ALL outbound HTTPS from the API process, not just ADO connections
- No request body validation beyond size limit (10MB) on most routes
**Impact:** SSL MITM attacks possible against any outbound API call. The global disable should be scoped to ADO-only connections.

---

## Feature Completeness Gaps

### TIER 4 FEATURES: Not Implemented
**Declared in architecture docs but absent from codebase:**
- Polarity system (AFFIRMED/NEGATED knowledge quanta) — not found
- Temporal validity (valid_from/valid_to on KnowledgeQuantum) — not found
- Confidence decay — not found
- Hypothesis node type — not found
- Admiralty Code evidence grading — not found
- Crystallization mechanics — not found
- "Two-worlds" (declarative vs. observed reality) — not found
- Retraction mechanism — not found

**Assessment:** These are design aspirations, not implemented features. No code, tests, or data schemas implement any of these concepts.

---

### METACOGNITION AUTONOMY LEVELS
**Declared:** 5 autonomy levels (OBSERVE_ONLY through FULLY_AUTONOMOUS)
**Implemented:** Background cycle runs every 1 hour via StartupManager. Autonomy level configuration visible in `metacognition.route.js` (7 endpoints). Full implementation status unclear without deeper code inspection.

---

## Summary Risk Matrix

| Risk | Severity | Production Impact | Effort to Fix |
|---|---|---|---|
| GAP-001: Global KB empty | CRITICAL | Platform KR non-functional | HIGH (data work) |
| GAP-002: Azure streaming unverified | CRITICAL | Azure deployment broken | MEDIUM |
| GAP-003: LLMProvider not universal | HIGH | Azure migration incomplete | HIGH (18+ files) |
| GAP-004: ts-node transitive | HIGH | Startup failure risk | LOW |
| VIOLATION-001: FlowDesk in core | ARCHITECTURAL | Deployment coupling | VERY HIGH |
| VIOLATION-002: Provenance in-memory | HIGH | Audit trail lost on restart | MEDIUM |
| VIOLATION-003: RAG stubs | MEDIUM | Degraded retrieval quality | MEDIUM |
| VIOLATION-004: Hardcoded path | MEDIUM | Docker/prod agent fails | LOW |
| RISK-003: Job queue fallback | MEDIUM | Extraction jobs lost | LOW |
| RISK-005: SSL disabled globally | MEDIUM | Security exposure | LOW |
| TIER 4 features missing | INFO | Not a regression — never existed | — |

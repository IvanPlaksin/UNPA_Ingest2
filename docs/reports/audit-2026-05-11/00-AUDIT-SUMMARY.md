# Audit Summary — UN ProjectAdvisor Platform
## Audit Date: 2026-05-11
## Auditor: Claude Code (claude-sonnet-4-6) — automated static + runtime inspection

---

## Platform Identity

**Name:** UN ProjectAdvisor (UNPA_Ingest)
**Core Principle:** "Graph = Program" — every business workflow AND knowledge artifact is represented as an executable DAG in Memgraph.
**Stack:** Node.js + Express (API), React + Vite (frontend), Memgraph (graph DB), Qdrant (vector DB), Redis (cache/queues), BullMQ (job queues), Anthropic SDK / Azure AI Foundry (LLM).
**Scope:** This audit covers `api/` (backend) and `mcp/` (frontend). FlowDesk (`api/src/services/flowdesk/`, `api/src/core/aopeg/plugins/flowdesk/`) is identified as an EXTERNAL client project with deep integration into the platform — its code is audited as present, not as intended architecture.

---

## Top 10 Findings

### Finding 1: Global Knowledge Base Has Zero Vectors (CRITICAL)
The `embeddings_unified` Qdrant collection — the platform's primary general knowledge vector store — has 0 points. ALL `embeddings_*` named collections (docs, workitems, code, ado_knowledge_base, un_inventory, business_process_graphs, ineed_sr_history) are empty. The only populated knowledge collections are `dialogue_embeddings` (2,433 points from Claude Code session ingestion) and `flowdesk_services` (1,704 points, client-project-specific). The platform's core RAG / semantic search over institutional knowledge does not function because there is no embedded data.

### Finding 2: Azure Streaming Path Has Unverified TODO (CRITICAL for Azure)
`LLMProviderService.js:168` has an explicit TODO: "Verify Azure streaming format matches Anthropic SDK stream format." The Azure AI Foundry provider's `stream()` method may produce incorrect output when `LLM_PROVIDER=azure`, breaking all SSE-streamed agent responses and execution streams on Azure deployment.

### Finding 3: 18+ Files Bypass LLMProviderService (HIGH for Azure)
Despite the existence of `LLMProviderService`, 18+ files across services, controllers, AOPEG plugins, and the MCP layer still use `require('../llm.service')` or `require('./gemini.service')` directly. Critical paths including knowledge extraction, pattern extraction, chat, MSSQL assistant, and AOPEG AI executors will continue using the Anthropic hardcoded path even when `LLM_PROVIDER=azure`.

### Finding 4: FlowDesk is Deeply Embedded in Platform Core (ARCHITECTURAL)
CLAUDE.md explicitly states "No client names in core code/files/routes" as a CRITICAL rule. FlowDesk violates this at every layer: 17 AOPEG executors, 20+ service files, 1 mounted route file (21 endpoints at `/api/v1/flowdesk`), 4 frontend page/store components, and 1 populated Qdrant collection. This is not accidental coupling — it is the result of building a client project inside the platform codebase.

### Finding 5: ts-node is a Transitive Dependency (HIGH)
`api/index.js:4` calls `require('ts-node').register(...)` but ts-node is NOT in `package.json` dependencies. It is only available as a transitive dependency. Any package update that removes this transitive path will cause immediate production startup failure.

### Finding 6: ProvenanceService is In-Memory Only (HIGH)
`provenance.service.js` stores all provenance tracking in `this.rounds = new Map()`. No Memgraph or Redis persistence. All knowledge ingestion provenance data (which entity came from which source at which time) is lost on every API restart. Codex governance rules require provenance traceability.

### Finding 7: 3 RAG Executor Methods are Stubs (MEDIUM)
`expand-query.executor.ts` has a stub LLM call for query expansion. `rerank.executor.ts` has two stub methods: LLM-based reranking and cross-encoder reranking. Both are marked "stub - would use actual LLM service." Query enhancement and reranking do not function in the RAG pipeline.

### Finding 8: SSL Certificate Verification Disabled Globally (MEDIUM)
`api/index.js:6` sets `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` globally. Added for on-premise ADO connectivity, this disables certificate validation for ALL outbound HTTPS from the API process — not just ADO connections.

### Finding 9: Unmounted Route Files with Real Endpoints (LOW/MEDIUM)
`backlog-extended.route.js` (22 endpoints) and `knowledge.routes.js` (10 endpoints) exist but are not mounted in `index.js`. The 22 BackLog extended endpoints represent potentially real functionality that is unreachable. This is likely an integration oversight.

### Finding 10: Tier 4 Knowledge Features are Aspirational Only
The following features are documented in architecture notes but have NO implementation in the codebase: polarity (AFFIRMED/NEGATED), temporal validity, confidence decay, hypothesis nodes, Admiralty Code evidence grading, crystallization mechanics, "two-worlds" model, retraction mechanism. These are design aspirations, not shipped features.

---

## Platform Readiness Assessment

### What IS Working (Confirmed by Live Data)

| Capability | Evidence |
|---|---|
| Graph execution engine (GXE) | RuntimeEngine, TopologicalScheduler, NodeRunner confirmed |
| AOPEG plugin system | 12 plugins, 80+ executors, all loading correctly |
| WorkSpace subsystem | 4 active workspaces, extraction pipeline operational |
| BackLog system | 53 real tasks in Memgraph, FSM transitions working |
| Codex governance | 100 rules, hash-chain integrity, API serving rules |
| DevDialogue Collector | 45 sessions / 27,556 messages ingested and embedded |
| Graph Catalog | CatalogRoot → CatalogEntry → GraphVersion schema active |
| SSE streaming | 10+ endpoints, frontend SSE client with reconnection |
| Prometheus metrics | metricsMiddleware active, `/api/v1/metrics` serving |
| Sigillum versioning | API active, 16 endpoints |
| SAGA promotion | PromotionSagaService implemented with full compensation |
| ImmutableGraph | TypeScript repositories active, Codex namespace versioned |
| BullMQ queues | 3 queues defined (extraction, graph-update, batch) |

### What is NOT Working / Incomplete

| Capability | Issue |
|---|---|
| General KB semantic search | `embeddings_unified` = 0 points |
| Azure AI Foundry streaming | Unverified TODO |
| Azure LLM in extraction | 18+ files bypass LLMProviderService |
| RAG query expansion | Stub implementation |
| RAG reranking | Stub implementation |
| Provenance persistence | In-memory only |
| Tier 4 knowledge features | Not implemented |
| Frontend auth | No login/token mechanism |

---

## Quantitative Summary

| Metric | Value |
|---|---|
| Total REST endpoints (all route files) | ~830 |
| SSE streaming endpoints | ~10 |
| Mounted route files | ~60 |
| Unmounted route files with real endpoints | 4 |
| In-process MCP tools | 149 |
| AOPEG plugins | 12 |
| AOPEG executors (approx) | 80+ |
| Frontend pages/routes | 34 |
| Frontend Zustand stores | 8 |
| Frontend test files | 5 |
| API integration test files | 14 |
| API e2e test files | 3 |
| Qdrant total collections | 101 (90 workspace, 11 named) |
| Qdrant populated named collections | 2 of 11 (18%) |
| Memgraph BackLog items | 53 |
| Memgraph Codex rules | 100 |
| Memgraph Dialogue sessions | 45 |
| Memgraph Dialogue messages | 27,556 |
| Dialogue tokens processed | ~5.17M |
| Active workspaces | 4 |

---

## Audit File Index

| File | Contents |
|---|---|
| `01-component-inventory.md` | Complete component table — 40+ components with locations, LOC, deps, status |
| `02-readiness-matrix.md` | Functional / quality / test / docs / integration / tech-debt matrix per component |
| `03-architectural-patterns.md` | 12 patterns, 7 violations, unique project-specific patterns |
| `04-data-state.md` | Live Qdrant collection inventory, Memgraph data volumes, Redis/BullMQ state |
| `05-frontend-inventory.md` | 34 routes, 27 component directories, 8 stores, 17 hooks, 16 services |
| `06-api-surface.md` | ~830 REST endpoints by route file, SSE endpoints, MCP tools, BullMQ queues |
| `07-gaps-and-risks.md` | 10 critical/high gaps + 7 risks with severity ratings and resolution guidance |
| `99-RAW-NOTES.md` | Naming issues, code quality notes, security observations, positive findings |

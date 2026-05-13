# API Surface
## Audit Date: 2026-05-11

> All routes from `api/src/routes/`. Endpoint counts from `grep router.METHOD`. SSE routes from `text/event-stream` header inspection.

---

## 1. REST API Overview

**Base path:** `/api/v1/`
**Auth:** `x-api-key` header (enforced by `security.apiKeyValidator` middleware)
**Request logging:** `createRequestLogger` middleware on all routes
**Rate limiting:** `security.rateLimit` global middleware
**Body size limit:** 10MB JSON

**Total REST endpoints across all route files: ~830** (sum of METHOD counts below)

---

## 2. Route File Inventory (sorted by endpoint count)

| Route File | Mount Path | Endpoint Count | Domain |
|---|---|---|---|
| `workspace.routes.js` | `/api/v1/workspaces` | 67 | WorkSpace subsystem |
| `codex.route.js` | `/api/v1/codex` | 44 | Codex governance |
| `gxe.route.js` | `/api/v1/gxe` | 40 | GXE graph operations |
| `knowledge.route.js` | `/api/v1/knowledge` | 32 | Knowledge CRUD |
| `gxeManager.route.js` | `/api/v1/gxe-manager` | 30 | GXE execution orchestrator |
| `tuning.route.js` | `/api/v1/tuning` | 26 | Pipeline tuning |
| `notifications.route.js` | `/api/v1` (nested) | 25 | Notifications / event stream |
| `graphCatalog.route.js` | `/api/v1/graph-catalog` | 23 | Graph catalog CRUD |
| `aopeg.route.js` | `/api/v1/aopeg` | 23 | AOPEG plugin operations |
| `backlog-extended.route.js` | `/api/v1/backlog` | 22 | BackLog extended ops |
| `immutableGraph.route.js` | `/api/v1/graph` | 21 | ImmutableGraph versioning |
| `incrementalKG.route.js` | `/api/v1/incremental-kg` | 21 | Incremental KG pipeline |
| `flowdesk.route.js` | `/api/v1/flowdesk` | 21 | FlowDesk (client project) |
| `backlog.route.js` | `/api/v1/backlog` | 21 | BackLog core |
| `pattern.routes.js` | `/api/v1/patterns` | 19 | Pattern analysis |
| `mssql.route.js` | `/api/v1/mssql` | 18 | SQL Server connector |
| `graph.routes.js` | `/api/v1/graph-rag` | 17 | Graph RAG |
| `sigillum.route.js` | `/api/v1/sigillum` | 16 | Sigillum versioning |
| `backlog-execution.route.js` | `/api/v1/backlog` | 16 | BackLog execution cycles |
| `ai-agent.route.js` | `/api/v1/ai-agent` | 16 | AI agent sessions |
| `dialogue.route.js` | `/api/v1/dialogue` | 15 | DevDialogue Collector |
| `runtime.route.js` | `/api/v1/runtime` | 14 | GXE RuntimeEngine direct |
| `datasource.route.js` | `/api/v1/datasources` | 14 | DataSource catalog |
| `tensor.route.js` | `/api/v1/tensors` | 13 | Tensor monitoring |
| `query.route.js` | `/api/v1/query` | 13 | Knowledge graph queries |
| `graph-status.route.js` | `/api/v1/graph-status` | 12 | Graph status monitoring |
| `connectors.routes.js` | `/api/v1/connectors` | 12 | Data connectors |
| `health.route.js` | `/api/v1/health` | 11 | Health checks |
| `domain.route.js` | `/api/v1/domains` | 11 | Domain management |
| `ainfra.route.js` | `/api/v1/ainfra` | 11 | AI infrastructure |
| `subgraph.route.js` | `/api/v1/subgraph` | 10 | Subgraph operations |
| `namespace.route.js` | `/api/v1/namespaces` | 10 | Namespace management |
| `knowledge.routes.js` | `/api/v1/knowledge` (alt) | 10 | Knowledge alt routes |
| `graph-types.route.js` | `/api/v1/graph-types` | 10 | Graph type system |
| `form.route.js` | `/api/v1/forms` | 10 | Structural forms |
| `dashboard.routes.js` | `/api/v1/dashboard` | 10 | Dashboard aggregation |
| `jobs.routes.js` | `/api/v1/jobs` | 9 | Job queue management |
| `toolCatalog.route.js` | `/api/v1/tool-catalog` | 8 | MCP tool catalog |
| `report.routes.js` | `/api/v1/reports` | 8 | Report generation |
| `openapi.routes.js` | `/api/v1/docs` | 8 | OpenAPI/Swagger |
| `visualization.routes.js` | `/api/v1/visualization` | 7 | Graph visualization data |
| `structural.route.js` | `/api/v1/structural` | 7 | Structural graph editor |
| `pipelineLab.route.js` | `/api/v1/pipeline-lab` | 7 | Pipeline lab |
| `metacognition.route.js` | `/api/v1/metacognition` | 7 | Metacognition |
| `tfvc.route.js` | `/api/v1/tfvc` | 6 | ADO TFVC browser |
| `system-health.routes.js` | `/api/v1/system` | 6 | System health |
| `rabbithole.route.js` | `/api/v1/rabbithole` | 6 | RabbitHole search |
| `metrics.route.js` | `/api/v1/metrics` | 6 | Prometheus metrics |
| `ingestion.routes.js` | `/api/v1/ingestion` | 6 | Ingestion pipeline |
| `monitor.route.js` | `/api/v1/monitor` | 5 | Monitor dashboard |
| `ineed-test.route.js` | (not mounted in index.js) | 5 | iNeed test routes |
| `flowdesk-config.route.js` | (not mounted in index.js) | 5 | FlowDesk config |
| `assistant.route.js` | `/api/v1/assistant` | 5 | AI assistant |
| `approval.route.js` | `/api/v1/approval` | 5 | Approval workflow |
| `advisor.route.js` | `/api/v1/advisor` | 5 | Advisor recommendations |
| `structural-form.route.js` | `/api/v1/forms` | 4 | Structural form extended |
| `pipelineAnalysis.route.js` | `/api/v1/pipeline-lab/analysis` | 4 | Pipeline analysis |
| `kb-health.route.js` | `/api/v1/health/kb` | 4 | KB health |
| `export.routes.js` | `/api/v1/export` | 4 | Data export |
| `anomaly-tasks.route.js` | `/api/v1/anomaly-tasks` | 3 | Anomaly detection |
| `nexus.route.js` | `/api/v1/nexus` | 2 | Nexus (legacy) |
| `chat.route.js` | `/api/v1/chat` (assumed) | 2 | Legacy chat |

---

## 3. Key Endpoint Groups

### GXE Execution (gxeManager.route.js — primary execution surface)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/gxe-manager/health` | Service health |
| GET | `/api/v1/gxe-manager/executors` | List registered executors |
| POST | `/api/v1/gxe-manager/execute` | Start graph execution |
| GET | `/api/v1/gxe-manager/execute/:id/stream` | **SSE** execution events stream |
| POST | `/api/v1/gxe-manager/execute-stream` | Start + stream execution |
| POST | `/api/v1/gxe-manager/execute/:id/cancel` | Cancel execution |
| POST | `/api/v1/gxe-manager/execute/:id/pause` | Pause execution |
| POST | `/api/v1/gxe-manager/execute/:id/resume` | Resume execution |
| POST | `/api/v1/gxe-manager/execute/:id/resume-input` | Resume from WAIT_FOR_INPUT |
| POST | `/api/v1/gxe-manager/signal/resume` | Signal-based resume |
| GET | `/api/v1/gxe-manager/signal/:id/status` | Signal status |
| GET | `/api/v1/gxe-manager/execute/:id/status` | Execution status |
| GET | `/api/v1/gxe-manager/executions/active` | List active executions |
| POST | `/api/v1/gxe-manager/validation-advice` | Graph validation advice |

### Workspace (workspace.routes.js — largest route file)

Key endpoints (67 total):
- CRUD: `POST /`, `GET /`, `GET /:id`, `PATCH /:id`, `PATCH /:id/status`, `DELETE /:id`, `DELETE /:id/permanent`
- Sources: `POST /:id/sources`, `POST /:id/sources/upload`, `GET /:id/sources`, extraction lifecycle
- Drafts: `POST /:id/drafts`, `GET /:id/drafts`, search, get/update/delete individual drafts
- Extraction: `GET /:id/extract/jobs`, streaming: `GET /:id/extract/:jobId/progress` **(SSE)**
- Promotion: `POST /:id/promotion/diff`, `POST /:id/promotion/execute`
- DataSources: `GET /:id/datasources`, `POST /:id/datasources`
- Structural: `GET /:id/structural-import/preview`, `POST /:id/structural-import`
- Audit: `GET /:id/audit`

### Dialogue (dialogue.route.js)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/dialogue/ingest` | Ingest JSONL session file |
| GET | `/api/v1/dialogue/sessions` | List sessions |
| GET | `/api/v1/dialogue/sessions/:id` | Get session detail |
| GET | `/api/v1/dialogue/stats` | Collection statistics |
| POST | `/api/v1/dialogue/search` | Semantic search |
| GET | `/api/v1/dialogue/decisions` | List decisions |
| GET | `/api/v1/dialogue/decisions/:id` | Get decision detail |
| GET | `/api/v1/dialogue/decisions/provenance` | Decision provenance |
| GET | `/api/v1/dialogue/sessions/:id/context` | Session context |
| GET | `/api/v1/dialogue/sessions/:id/related` | Related sessions |
| GET | `/api/v1/dialogue/analytics` | Analytics |
| GET | `/api/v1/dialogue/metrics` | Metrics |
| GET | `/api/v1/dialogue/related/backlog/:id` | Dialogue ↔ BackLog links |
| GET | `/api/v1/dialogue/provenance/decision/:id` | Decision provenance |
| GET | `/api/v1/dialogue/provenance/session/:id` | Session provenance |

---

## 4. SSE Streaming Endpoints (text/event-stream)

| Endpoint | Route File | Purpose |
|---|---|---|
| `GET /api/v1/gxe-manager/execute/:id/stream` | gxeManager.route.js | Execution event stream |
| `POST /api/v1/gxe-manager/execute-stream` | gxeManager.route.js | Start + stream |
| `GET /api/v1/workspaces/:id/extract/:jobId/progress` | workspace.routes.js | Extraction progress |
| `GET /api/v1/backlog/stream` | backlog.route.js | BackLog event stream |
| `GET /api/v1/graph-catalog/...stream` | graphCatalog.route.js | Catalog event stream |
| `GET /api/v1/incremental-kg/...stream` | incrementalKG.route.js | KG ingestion stream |
| Notifications endpoint | notifications.route.js | Push notifications |
| Various runtime + AOPEG streams | runtime.route.js, aopeg.route.js | Execution streaming |

**Total SSE endpoints: ~10** (16 `text/event-stream` matches including OpenAPI spec duplicates)

---

## 5. WebSocket

**Mount:** `ws://host:3001/ws`
**Service:** `api/src/services/websocket.js` — initialized via `websocketService.initialize(server)`
**Second handler:** `queryStreamHandler.initialize()` — streaming Cypher query results
**Enabled by:** `envConfig.features.enableWebSocket` (defaults to true)

---

## 6. BullMQ / Job Queues

| Queue | Processor | Purpose |
|---|---|---|
| `extraction` | `_extractionProcessor` | Knowledge extraction pipeline |
| `graph-update` | `_graphUpdateProcessor` | Async graph mutation |
| `batch` | `_batchProcessor` | Batch operations |

**BullMQ version:** 5.64.1 (in `package.json`)
**Fallback:** `InMemoryQueue` if Redis unavailable
**Exposed via:** `GET /api/v1/jobs` (9 endpoints in jobs.routes.js)

---

## 7. In-Process MCP Tools (createAllTools())

Total MCP tools: **149** (sum of individual tool files per category, excluding index.js files)

| Category | Tool Count | Examples |
|---|---|---|
| `workspace` | 19 | CreateWorkspaceTool, GetDraftTool, UpdateDraftTool, PromoteTool |
| `primitives` | 18 | CreateNodeTool, UpdateNodeTool, DeleteNodeTool, QueryGraphTool |
| `data` | 18 | DataSourceQueryTool, DataSourceCatalogTool |
| `catalog` | 13 | GetCatalogTool, SearchCatalogTool, CreateGraphTool |
| `graph` | 12 | CreateGraphNodeTool, GetGraphTool, ValidateGraphTool |
| `backlog` | 12 | GetBacklogItemTool, CreateBacklogItemTool, UpdateStatusTool |
| `text` | 9 | ExtractTool, SummarizeTool, ClassifyTool |
| `patterns` | 8 | PatternSearchTool, PatternCreateTool |
| `extraction` | 8 | RunExtractionTool, GetExtractionStatusTool |
| `execution-control` | 8 | ExecuteGraphTool, ResumeInputTool, CancelTool |
| `vector` | 7 | EmbedTool, SearchEmbeddingsTool |
| `meta` | 6 | GetContextTool, SelfDescribeTool |
| `codex` | 6 | SearchRulesTool, GetRuleTool |
| `ai` | 5 | ChatTool, ClassifyTool, CompleteTool, ExtractTool, SummarizeTool |
| `dialogue` | 4 | FindDecisionTool, GetContextTool, SearchDialogueTool, TraceProvenanceTool |
| `document` | 0 | index.js only — empty category |

**Tool name mapping:** Dots → underscores for Claude API (`graph.create_node` → `graph_create_node`)

---

## 8. External MCP Server Connection

**Path:** `d:/UN/Repos/MCP_CLAUDE/mcp-server/dist/index.js` (hardcoded default; overridden by `MCP_SERVER_PATH` env var)
**Transport:** StdioClientTransport (spawns external process)
**Purpose:** agent-to-agent messaging, BackLog/Codex tools available to AI agents
**Used by:** `AnthropicAgentService` only

---

## 9. Health & Diagnostic Endpoints

| Endpoint | Description |
|---|---|
| `GET /health` | Simple OK (before API prefix) |
| `GET /test` | Simple TEST OK |
| `GET /api/v1/health` | Full health with service statuses |
| `GET /api/v1/health/kb` | KB-specific health (Memgraph/Qdrant stats) |
| `GET /api/v1/health-test` | Inline OK test |
| `GET /api/v1/system` | System health aggregation |
| `GET /api/v1/metrics` | Prometheus metrics (metricsMiddleware) |
| `GET /api/v1/docs/swagger` | Swagger UI |

---

## 10. Routes NOT Mounted in index.js

The following route files exist in `api/src/routes/` but are **not mounted** in `api/index.js`:
- `flowdesk-config.route.js` — FlowDesk config (5 endpoints)
- `ineed-test.route.js` — iNeed test routes (5 endpoints)
- `backlog-extended.route.js` — BackLog extended (22 endpoints — **potentially dead code?**)
- `knowledge.routes.js` — alternate knowledge routes (10 endpoints — note `.routes.js` vs `.route.js` naming inconsistency)

**Note on `knowledge.route.js` vs `knowledge.routes.js`**: Both exist. `knowledge.route.js` (32 endpoints) IS mounted. `knowledge.routes.js` (10 endpoints) is NOT mounted in index.js — this appears to be an older/alternate route file that was never removed.

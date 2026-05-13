# Architectural Patterns
## Audit Date: 2026-05-11

---

## Patterns Actually Used

### 1. AOPEG Plugin Architecture
**Where applied:** `api/src/core/aopeg/`
**How:** PluginBase defines abstract executor/condition/transformer base. Each domain plugin extends PluginBase, defines executors with `type`, `parameterSchema` (without `required` field per Codex rule), and an `execute(input, context)` method. PluginLoader initializes plugins and registers executors with PluginRegistry. AOPEGAdapter creates an MCP-compatible registry from the AOPEG plugin executors.
**Consistency:** High — 12 plugins follow this pattern. CommonPlugin/WorkflowPlugin/RAGPlugin/IngestionPlugin/etc. all use same PluginBase.
**Note:** Dual .js/.ts file presence in most plugins (ingestion, rag, workflow, subgraph, notification) indicates a migration from TypeScript that was partially reversed or left incomplete. The .ts files in some plugins are not the runtime version — `require()` calls always use .js. The TS files in `ingestion/` and `rag/` executors ARE loaded via ts-node transpilation.

### 2. Graph = Program (GXE Core Principle)
**Where applied:** Throughout — every business workflow, dialog, extraction pipeline represented as a DAG of executor nodes.
**How:** Graphs stored in Memgraph as `AOPEG_ExecutionGraph`/`AOPEG_GraphNode`/`AOPEG_GraphEdge` nodes. RuntimeEngine executes them by resolving tool IDs from nodes, running them through TopologicalScheduler. The GraphCatalog stores graph definitions. GxeManagerService manages concurrent execution of multiple graphs.
**Consistency:** High — the core principle is deeply embedded. FlowDesk graphs are .json definitions; iNeed graphs are .js definitions; both feed into the same execution path.
**Unique aspect:** GraphClassificationService enforces a 10-type formal type system (EXECUTABLE/TEMPLATE/COMPOSITE/PROCESS/STRUCTURAL/STORABLE/PROJECTION/CONSTRAINT/VALIDATION/EVENT) that gates what can be executed.

### 3. Finite State Machine (FSM) Pattern
**Where applied:** Multiple subsystems
**How:**
- `ExecutionStateMachine` — graph execution states: CREATED→INITIALIZING→READY→RUNNING→PAUSED→COMPLETED/FAILED
- `NodeStateMachine` — node execution states within a graph
- `WorkspaceService.VALID_TRANSITIONS` — workspace lifecycle: CREATED→PROFILING→READY→EXTRACTING→REVIEW→PROMOTED→ARCHIVED
- `BackLogService.VALID_TRANSITIONS` (via backlog-schemas.js) — task lifecycle: PROPOSED→APPROVED→IN_PROGRESS→REVIEW→DONE/CANCELLED
- `ImmutableGraphService.StateMachineService` — node lifecycle: DRAFT→ACTIVE→DEPRECATED
- `BaseFSM` — shared FSM base class for execution FSMs
**Consistency:** High — FSMs are explicit in all long-lived objects.

### 4. SAGA Pattern (Distributed Transactions)
**Where applied:**
- `api/src/services/workspace/promotion/promotion-saga.service.js` — Draft→GlobalKB promotion
- `api/src/gxe-manager/TransactionCoordinator.js` — Multi-graph SAGA transactions
- `api/src/services/polystore-saga.js` — Cross-store atomic operations
**How:** Sequential steps with compensation (LIFO rollback on failure). Each step type (CREATE_KB_NODE, UPDATE_KB_NODE, CREATE_VERSION, CREATE_EDGE, UPDATE_EMBEDDING, UPDATE_DRAFT_STATUS, CREATE_PROMOTION_RECORD) has an execute + compensate action. TransactionCoordinator manages SAGA state in Redis.
**Consistency:** Moderate — SAGA is used for promotion and some multi-store operations but not universally for all write paths.

### 5. MCP (Model Context Protocol) Tool Wrapping
**Where applied:** `api/src/mcp/` — all 150+ tools; `api/src/runtime/integration/AOPEGAdapter.js`
**How:** Every tool extends a base pattern with `getName()`, `getDescription()`, `getInputSchema()`, `execute(input, context)` interface. AnthropicAgentService dynamically loads all tools and presents them to Claude API. The AOPEGAdapter creates an MCP-compatible registry (getTool/listTools interface) from AOPEG executors, enabling RuntimeEngine to use AOPEG executors through the MCP contract.
**Consistency:** High — tool wrapping pattern is uniform across all 150+ tools.
**Key detail:** Tool names sanitized for Claude API (dots → underscores): `graph.create_node` → `graph_create_node` then restored on execution.

### 6. SSE (Server-Sent Events) for Long-Running Operations
**Where applied:**
- `api/src/runtime/observability/RuntimeSSEStreamer.js` — execution event streaming
- `api/src/runtime/integration/GXESSEBridge.js` — bridge between execution and SSE
- `api/src/routes/runtime.route.js:252,272` — `/execute/:id/stream` and `/execute-stream`
- `api/src/routes/gxeManager.route.js:641` — manager stream
- `api/src/routes/workspace.routes.js:53` — extraction progress stream
- `mcp/src/hooks/useSSEStream.js` — frontend SSE hook with ResilientSSEClient
- `mcp/src/utils/sse-client` — SSE client with reconnection
**How:** Express routes write `text/event-stream` headers; events are `data: JSON\n\n` format. Frontend uses EventSource wrapped in ResilientSSEClient with automatic reconnection.
**Consistency:** High for streaming use cases.

### 7. Lazy Dependency Injection / Singleton Pattern
**Where applied:** Throughout all services
**How:** Services use module-level `let _service = null; function getService() { if (!_service) _service = require(...); return _service; }` pattern to avoid circular imports and defer initialization. Many route handlers use `let _manager = null; async function getManager() {...}` pattern for first-request initialization.
**Consistency:** Very high — this pattern is universal in the codebase.
**Risk:** First-request latency for routes like `gxeManager.route` which initializes the entire AOPEG stack on first call.

### 8. Namespace Isolation
**Where applied:** `api/src/models/core-identity.js`, `api/src/services/namespace-router.service.js`, all Memgraph writes
**How:** Every Memgraph node must carry a namespace property. NamespaceRouter directs queries to namespace-specific storage paths. Codex namespace is 'Codex', workspace draft nodes have their workspaceId-based namespace, core platform nodes are 'CORE'. The `getStoragePaths(namespace)` function from namespace.config provides path mappings.
**Consistency:** Moderate — enforced at MemgraphService level but namespace assignment in individual services varies in completeness.

### 9. Event-Driven Architecture (EventEmitter)
**Where applied:**
- `RuntimeEngine extends EventEmitter` — emits execution:stateChange, execution:nodeComplete, execution:failed, etc.
- `GxeManagerService extends EventEmitter` — forwards RuntimeEngine events
- `BackLogService extends EventEmitter` — emits task lifecycle events
- `api/src/services/notifications/backlog-events.js` — BackLog event handler setup
**How:** EventEmitter used for loose coupling between execution engine and monitoring/notification layers. SSE streamer listens to RuntimeEngine events.
**Consistency:** Moderate — used in key places but not a universal pattern.

### 10. Repository Pattern (TypeScript Services)
**Where applied:** `api/src/repositories/` — NodeVersionRepository, EdgeVersionRepository, MergeRecordRepository, GodModeRepository, NamespaceConfigRepository; `api/src/services/sigillum/` repositories
**How:** TypeScript classes with typed CRUD methods against Memgraph. Used exclusively in the ImmutableGraph and Sigillum subsystems.
**Consistency:** Limited to TypeScript portions of codebase. The older JavaScript services use direct MemgraphService calls without a repository layer.

### 11. In-Process MCP Tool Execution
**Where applied:** `api/src/services/agents/anthropic-agent.service.js`
**How:** AnthropicAgentService loads both external MCP tools (via StdioClientTransport to external MCP server) AND in-process GXE tools (via createAllTools()). When Claude API returns a tool_use block, the agent checks if the tool is an MCP tool name (mcpToolNames Set) or a local GXE tool, and routes accordingly. This allows agents to have a unified tool surface spanning both external knowledge (BackLog, Codex) and in-process graph operations.
**Consistency:** Single implementation in AnthropicAgentService.

### 12. Hash Chain Integrity
**Where applied:**
- `api/src/services/codex/codex.service.js` — contentHash + chainHash for Codex nodes
- `api/src/services/immutable-graph/hash.service.ts` — Merkle-like hashing for graph versions
**How:** SHA-256 hashes of canonicalized node properties. Chain hash includes previous hash for tamper detection. Admin-only writes enforce the chain.
**Consistency:** Applied in Codex and ImmutableGraph; not applied to general MemgraphService writes.

---

## Pattern Violations Found

### Violation 1: FlowDesk Plugin in Platform Core
**File:** `api/src/core/aopeg/plugins/flowdesk/`
**Violation:** FlowDesk is documented as an EXTERNAL client project, not part of the platform architecture. However, 17 FlowDesk-specific executors (ask-beneficiary, classify-intent, create-service-request, etc.) are compiled directly into the platform's AOPEG plugin system. The FlowDesk service (`api/src/services/flowdesk/`) is also 20+ files in the platform's service layer.
**Evidence:** CLAUDE.md section "Namespace Separation (CRITICAL)" explicitly states: "No client names in core code/files/routes."
**Route violation:** `api/src/routes/flowdesk.route.js` and `flowdesk-config.route.js` exist in platform routes.
**API violation:** `app.use('/api/v1/flowdesk', flowdeskRoutes)` in `api/index.js:196`.
**Impact:** Coupling between platform and specific client project; violates stated architecture principle.

### Violation 2: Dual .js/.ts Files (Dead Code / Confusion)
**Files:** `api/src/core/aopeg/plugins/*/` — most plugins have both `.js` and `.ts` versions of executors
**Examples:**
- `workflow.plugin.js` AND `workflow.plugin.ts`
- `subgraph.plugin.js` AND `subgraph.plugin.ts`
- `ingestion.plugin.ts` (loaded via ts-node) but `ingestion/index.js` (loaded via require)
**Impact:** Unclear which version is authoritative; confusion about which is runtime; potential divergence between JS and TS implementations.

### Violation 3: LLMProviderService Not Universal
**Files:** Several services import old service patterns (`api/src/services/llm.service.js`, `api/src/services/ai/ai.factory.js`, `api/src/services/gemini.service.js`) directly rather than going through the new LLMProviderService.
**Evidence:** `api/src/services/workspace/extraction/extraction-pipeline.js:28` uses `require('../../llm.service')` (old path); `api/src/services/agents/anthropic-agent.service.js` correctly uses `getLLMProvider()`.
**Impact:** Azure AI Foundry support (needed for production deployment) may not propagate to all extraction paths.

### Violation 4: AOPEG Executor to Runtime Tool ID Map is Incomplete
**File:** `api/src/runtime/integration/AOPEGAdapter.js:20-42`
**Evidence:** `EXECUTOR_TO_TOOL_MAP` maps 11 executor types. `MCP_TOOL_ALIAS_MAP` maps 14 types. But there are 74+ total executors across all plugins. Most executors are used directly by their type string (no mapping needed if executorType matches tool ID exactly), but the AOPEGAdapter does not validate that all registered executors are accessible by the RuntimeEngine.
**Impact:** Graphs that reference executor types not in the alias maps may fail at runtime with "Tool not found" errors.

### Violation 5: ts-node Not in package.json Dependencies
**File:** `api/package.json`
**Evidence:** `api/index.js:4` calls `require('ts-node').register(...)` but ts-node is NOT in `dependencies` or `devDependencies`. It is only present as a transitive dependency. This is fragile — a dependency update could remove it.
**Impact:** Production deployment risk — transitive dependency not locked.

### Violation 6: ProvenanceService is In-Memory Only
**File:** `api/src/services/provenance.service.js`
**Evidence:** All state is stored in `this.rounds = new Map()`. No Memgraph or Redis persistence. Provenance data is lost on server restart.
**Impact:** Claimed provenance tracking does not persist across restarts.

### Violation 7: MCP Server Path is Machine-Specific Hardcoded Value
**File:** `api/src/services/agents/anthropic-agent.service.js:19`
**Evidence:** `const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || 'd:/UN/Repos/MCP_CLAUDE/mcp-server/dist/index.js'`
**Impact:** Default path only works on developer's Windows machine. Production/Docker deployment requires explicit env var.

---

## Unique Project-Specific Patterns

### "Graph = Program" Duality
Every business workflow AND knowledge representation is stored as a graph. The same graph storage (Memgraph) holds: executable workflows (AOPEG_ExecutionGraph), knowledge entities (KnowledgeQuantum), form schemas (STRUCTURAL graphs), rules (CONSTRAINT graphs), and code governance (Codex namespace). This is a deliberately unique design decision.

### Re-execution Per Turn Pattern
Per CLAUDE.md and architecture notes: each agent turn creates a new `RuntimeEngine.execute()` call with accumulated state. There is no persistent execution state across API calls — each HTTP request to `/api/v1/runtime/execute` creates a fresh RuntimeEngine instance. For multi-turn dialog graphs, the GxeManagerService maintains the execution registry (in Redis) and the graph's `WAIT_FOR_INPUT` node pauses execution until `/execute/:id/resume-input` is called.

### Layered Tool Access (In-Process vs External MCP)
The agent has access to two distinct tool layers: (1) external MCP tools via StdioClientTransport to `d:/UN/Repos/MCP_CLAUDE/mcp-server/dist/index.js` for agent-to-agent communication and messaging, and (2) in-process GXE tools (graph ops, workspace, backlog, codex, extraction) executed directly in the API process. This hybrid approach avoids serialization overhead for high-frequency operations while enabling inter-agent communication via the external server.

### Type-Gated Execution
Before any graph executes, `GraphClassificationService.canExecute(graphType)` is called. Only EXECUTABLE, COMPOSITE, VALIDATION, and EVENT graphs can be executed directly. TEMPLATE requires instantiation; PROCESS requires compilation. This is enforced at the RuntimeEngine level before any executor code runs.

### Namespace-Scoped Knowledge Isolation
Workspaces have their own namespace in Memgraph, preventing cross-workspace data leakage. ReadOnlyProxy service allows workspaces to read from Global KB but not write to it directly. Only the PromotionSagaService can write from workspace namespace to Global KB, and only after explicit user confirmation.

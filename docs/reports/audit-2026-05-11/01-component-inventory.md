# Component Inventory
## Audit Date: 2026-05-11
## Methodology: Direct file inspection + directory traversal + line counts

---

## GXE Runtime Core (Tier 1)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| RuntimeEngine | api/src/runtime/RuntimeEngine.js | Class/Service | Runtime | GXECore | Main execution facade; orchestrates all sub-components per-execution | TopologicalScheduler, NodeRunner, DataFlowManager, PortManager, ExecutionStateMachine, AOPEGAdapter, GraphValidator, GraphClassificationService | 826 LOC |
| TopologicalScheduler | api/src/runtime/scheduler/TopologicalScheduler.js | Class | Runtime | GXECore | DAG scheduling with parallel bounded execution, back-edge detection, WAIT_FOR_INPUT support | NodeRunner, DataFlowManager, PortManager | 1184 LOC |
| NodeRunner | api/src/runtime/execution/NodeRunner.js | Class | Runtime | GXECore | Stateless single-node executor; phases: RESOLVE→VALIDATE_INPUT→TEMPLATE_RESOLUTION→EXECUTE→VALIDATE_OUTPUT→PROPAGATE→Store | TemplateResolver, PortManager, DataFlowManager | 423 LOC |
| ExecutionContext | api/src/runtime/execution/ExecutionContext.js | Class | Runtime | GXECore | Cross-node data access store during execution | None | ~50 LOC |
| TemplateResolver | api/src/runtime/execution/TemplateResolver.js | Class | Runtime | GXECore | Resolves {{path}} templates in node inputs | ExecutionContext | ~100 LOC |
| DataFlowManager | api/src/runtime/dataflow/DataFlowManager.js | Class | Runtime | GXECore | Manages data propagation across edges between nodes | PortManager | ~200 LOC |
| PortManager | api/src/runtime/dataflow/PortManager.js | Class | Runtime | GXECore | Per-node port registration and data collection/flattening | None | ~150 LOC |
| ExecutionStateMachine | api/src/runtime/state/ExecutionStateMachine.js | Class | Runtime | GXECore | FSM for graph execution states (CREATED→INITIALIZING→READY→RUNNING→COMPLETED/FAILED) | BaseFSM | ~100 LOC |
| NodeStateMachine | api/src/runtime/state/NodeStateMachine.js | Class | Runtime | GXECore | FSM for individual node states | BaseFSM | ~80 LOC |
| BaseFSM | api/src/runtime/state/BaseFSM.js | Class | Runtime | GXECore | Generic finite state machine base | None | ~100 LOC |
| AOPEGAdapter | api/src/runtime/integration/AOPEGAdapter.js | Class | Runtime | GXECore | Bridges AOPEG plugin executors to RuntimeEngine; creates MCP-compatible registry from AOPEG plugins | AOPEG PluginRegistry | 645 LOC |
| GXESSEBridge | api/src/runtime/integration/GXESSEBridge.js | Class | Runtime | GXECore | SSE streaming bridge for runtime events | Express SSE | ~150 LOC |
| GraphFormatConverter | api/src/runtime/integration/GraphFormatConverter.js | Utility | Runtime | GXECore | Converts between ReactFlow and AOPEG edge formats | None | ~100 LOC |
| RuntimeSSEStreamer | api/src/runtime/observability/RuntimeSSEStreamer.js | Class | Runtime | GXECore | Streams execution events (node start/complete/fail) via SSE | EventEmitter | ~200 LOC |
| ConditionalBranch | api/src/runtime/control/ConditionalBranch.js | Class | Runtime | GXECore | Conditional branching pattern for DAGs | None | ~150 LOC |
| LoopPattern | api/src/runtime/control/LoopPattern.js | Class | Runtime | GXECore | Loop execution pattern | None | ~100 LOC |
| CheckpointManager (resilience) | api/src/runtime/resilience/CheckpointManager.js | Class | Runtime | GXECore | Execution checkpointing for recovery | None | ~150 LOC |
| RetryPolicy | api/src/runtime/resilience/RetryPolicy.js | Class | Runtime | GXECore | Configurable retry strategy for node failures | None | ~100 LOC |
| CheckpointManager (persistence) | api/src/runtime/persistence/CheckpointManager.js | Class | Runtime | GXECore | Persistent checkpoint storage | Storage services | ~150 LOC |
| ExecutionRecorder | api/src/runtime/persistence/ExecutionRecorder.js | Class | Runtime | GXECore | Records execution history | Storage services | ~150 LOC |
| RecoveryManager | api/src/runtime/persistence/RecoveryManager.js | Class | Runtime | GXECore | Recovery from checkpoints | CheckpointManager | ~100 LOC |
| ExpressionSandbox | api/src/runtime/safety/ExpressionSandbox.js | Class | Runtime | GXECore | Safe expression evaluation sandbox | None | ~150 LOC |
| ResourceLimiter | api/src/runtime/safety/ResourceLimiter.js | Class | Runtime | GXECore | Execution resource limits enforcement | None | ~100 LOC |
| AsyncSignalContract | api/src/runtime/signals/async-signal-contract.js | Service | Runtime | GXECore | Async signal protocol for WAIT_FOR_INPUT nodes | Redis | ~200 LOC |
| SignalOrchestrator | api/src/runtime/signals/signal-orchestrator.js | Service | Runtime | GXECore | Orchestrates signal routing between graph executions | Redis | ~150 LOC |
| ContradictionEvaluator | api/src/runtime/signals/contradiction-evaluator.js | Service | Runtime | GXECore | Evaluates signal contradictions | None | ~100 LOC |
| PatternLibrary | api/src/runtime/learning/PatternLibrary.js | Service | Runtime | GXECore | Stores/retrieves execution patterns for learning | Memgraph | ~150 LOC |
| GraphTypeError | api/src/errors/GraphTypeError.js | Class | Runtime | GXECore | Error for invalid graph type execution attempts | None | ~30 LOC |
| GraphClassificationService | api/src/services/graph-classification.service.js | Service | Runtime | GXECore | 10-type formal type system for graphs (EXECUTABLE/TEMPLATE/COMPOSITE/PROCESS/STRUCTURAL/STORABLE/PROJECTION/CONSTRAINT/VALIDATION/EVENT) | None | 324 LOC |

---

## AOPEG Plugin Architecture (Tier 1)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| PluginRegistry | api/src/core/aopeg/registry/plugin-registry.js | Class | Runtime | GXECore | Central registry for executors, conditions, transformers | None | ~100 LOC |
| PluginLoader | api/src/core/aopeg/plugins/plugin-loader.js | Class | Runtime | GXECore | Plugin initialization/registration lifecycle | PluginRegistry | ~120 LOC |
| PluginBase | api/src/core/aopeg/plugins/plugin-base.js | Class | Runtime | GXECore | Abstract base class for all plugins; createSimpleExecutor factory | None | ~150 LOC |
| WorkflowPlugin | api/src/core/aopeg/plugins/workflow/ | Plugin | Runtime | GXECore | 6 executors: workflow.start, workflow.end, workflow.wait_input, workflow.set_variable, workflow.spawn_graph, workflow.validate, workflow.query_profile | MemgraphService | ~300 LOC |
| CommonPlugin | api/src/core/aopeg/plugins/common/ | Plugin | Runtime | GXECore | 17 executors: ai-agent, ai-generate, condition, start/end, entity-CRUD, graph operations, routing, SLA, transform, vector-search | LLMService, MemgraphService, QdrantService | ~600 LOC |
| IngestionPlugin | api/src/core/aopeg/plugins/ingestion/ | Plugin | Runtime | GXECore | 10 executors (TypeScript): parse-document, sanitize, detect-language, chunk-text, extract-entities, extract-relations, classify-content, write-graph, write-vector | LLMService, MemgraphService, QdrantService, TEIService | ~500 LOC |
| RAGPlugin | api/src/core/aopeg/plugins/rag/ | Plugin | Runtime | GXECore | 8 executors (TypeScript): assemble-context, expand-query, generate-response, graph-search, hybrid-search, rerank, vector-search | LLMService, QdrantService, MemgraphService | ~400 LOC |
| SubgraphPlugin | api/src/core/aopeg/plugins/subgraph/ | Plugin | Runtime | GXECore | 3 executors: consolidate-subgraph, extract-subgraph, segment-graph | MemgraphService | ~300 LOC |
| NotificationPlugin | api/src/core/aopeg/plugins/notification/ | Plugin | Runtime | GXECore | 1 executor: send notification | External notification service | ~100 LOC |
| ExtractionPlugin | api/src/core/aopeg/plugins/extraction/ | Plugin | Runtime | GXECore | 1 executor: structured extraction | LLMService | ~200 LOC |
| SQLExtractionPlugin | api/src/core/aopeg/plugins/sql-extraction/ | Plugin | Runtime | GXECore | 9 executors: sql-connect/query/schema-scan/procedure-list/ast-parse/gxe-translate/domain-persist/cross-domain-link | MSSQL connector | ~400 LOC |
| DialoguePlugin | api/src/core/aopeg/plugins/dialogue/ | Plugin | Runtime | DevDialogue | 8 executors: ingest, sanitize, store, segment, summarize, embed, extract_decisions, link | MemgraphService, QdrantService, TEIService | ~500 LOC |
| FlowDeskPlugin | api/src/core/aopeg/plugins/flowdesk/ | Plugin | Runtime | FlowDesk | 17 executors: FlowDesk-specific business logic (ask-beneficiary, classify-intent, create-service-request, etc.) | MemgraphService, FlowDesk data | ~600 LOC |
| ValidationPlugin | api/src/core/aopeg/plugins/validation/ | Plugin | Runtime | GXECore | Validation executors | Schema services | ~100 LOC |
| BuiltinConditions | api/src/core/aopeg/conditions/builtin-conditions.js | Conditions | Runtime | GXECore | Built-in conditional logic for graph branching | None | ~100 LOC |
| BuiltinTransformers | api/src/core/aopeg/transformers/builtin-transformers.js | Transformers | Runtime | GXECore | Built-in data transformation functions | None | ~100 LOC |

---

## GXE Manager (Tier 1)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| GxeManagerService | api/src/gxe-manager/GxeManagerService.js | Class | Runtime | GXECore | Multi-execution orchestrator; sits above RuntimeEngine; manages lifecycle of concurrent executions | RuntimeEngine, ExecutionRegistry, GraphCatalog | 682 LOC |
| ExecutionRegistry | api/src/gxe-manager/ExecutionRegistry.js | Class | Runtime | GXECore | In-memory + Redis execution state store | Redis | 355 LOC |
| TriggerEngine | api/src/gxe-manager/TriggerEngine.js | Class | Runtime | GXECore | Graph execution trigger management (MANUAL/SCHEDULED/SIGNAL triggers) | GxeManagerService | ~200 LOC |
| ConcurrencyGovernor | api/src/gxe-manager/ConcurrencyGovernor.js | Class | Runtime | GXECore | Limits concurrent graph executions per policy | Redis, ExecutionRegistry | ~200 LOC |
| SignalRouter | api/src/gxe-manager/SignalRouter.js | Class | Runtime | GXECore | Routes signals between executing graphs | GxeManagerService | 248 LOC |
| TransactionCoordinator | api/src/gxe-manager/TransactionCoordinator.js | Class | Runtime | GXECore | SAGA transaction coordination for multi-step operations | GxeManagerService, Redis, Memgraph | ~200 LOC |
| AuditLogger | api/src/gxe-manager/AuditLogger.js | Class | Runtime | GXECore | Execution audit trail | Memgraph | ~150 LOC |
| QueueManager | api/src/gxe-manager/QueueManager.js | Class | Runtime | GXECore | BullMQ queue management for async graph execution | BullMQ/Redis | ~150 LOC |

---

## Platform Interface Layer (Tier 1)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| GXE MCP Server | api/src/mcp/server/GXEMcpServer.js | Server | PlatformInterface | GXECore | In-process MCP server exposing all GXE tools | ToolRegistry, all tool sets | 232 LOC |
| ToolRegistry | api/src/mcp/server/ToolRegistry.js | Class | PlatformInterface | GXECore | MCP tool registration and lookup | None | ~100 LOC |
| SafetyGuard | api/src/mcp/server/SafetyGuard.js | Class | PlatformInterface | GXECore | Input sanitization for MCP tool calls | None | ~100 LOC |
| runtime.route | api/src/routes/runtime.route.js | Routes | PlatformInterface | GXECore | 14 REST/SSE endpoints for graph execution via HTTP | RuntimeEngine, AOPEGAdapter, RuntimeSSEStreamer | 859 LOC |
| gxeManager.route | api/src/routes/gxeManager.route.js | Routes | PlatformInterface | GXECore | 30+ REST/SSE endpoints for execution orchestrator management | GxeManagerService, TriggerEngine, etc. | 709 LOC |
| gxe.route | api/src/routes/gxe.route.js | Routes | PlatformInterface | GXECore | Graph editor/catalog REST endpoints | graphCatalogService | 183 LOC |
| MCP Tools - Graph | api/src/mcp/tools/graph/ | Tools | PlatformInterface | GXECore | 13 tools: CreateNode, CreateEdge, Query, Traverse, FindPath, Neighbors, AnalyzeStructure, ConsolidateSubgraph, ExpandSubgraph, DetectCommunities, SubGraphExecutor, RollbackConsolidation | MemgraphService | ~400 LOC |
| MCP Tools - Workspace | api/src/mcp/tools/workspace/ | Tools | PlatformInterface | WorkSpace | 19 tools: workspace CRUD, sources, drafts, KB operations, contradiction detection, graph ops | WorkspaceService, DraftService | ~600 LOC |
| MCP Tools - BackLog | api/src/mcp/tools/backlog/ | Tools | PlatformInterface | BackLog | 13 tools: task CRUD, status transitions, dependencies, stats, hierarchy | BackLogService | ~400 LOC |
| MCP Tools - Codex | api/src/mcp/tools/codex/ | Tools | PlatformInterface | Codex | 7 tools: search, get rule, get principles, check compliance, propose change, get BlackCodex | CodexService | ~200 LOC |
| MCP Tools - Execution Control | api/src/mcp/tools/execution-control/ | Tools | PlatformInterface | BackLog | 8 tools: execution cycles, plans, reviews, memory, phase transitions | ExecutionCycleService, PlanService, ReviewService | ~250 LOC |
| MCP Tools - AI | api/src/mcp/tools/ai/ | Tools | PlatformInterface | AIAgents | 5 tools: Chat, Classify, Complete, Extract, Summarize | LLMProviderService | ~200 LOC |
| MCP Tools - Vector | api/src/mcp/tools/vector/ | Tools | PlatformInterface | GXECore | 7 tools: Embed, BatchEmbed, Store, Search, Similarity, Cluster, Delete | QdrantService, TEIService | ~250 LOC |
| MCP Tools - Extraction | api/src/mcp/tools/extraction/ | Tools | PlatformInterface | GXECore | 8 tools: Entities, Intent, JsonPath, Regex, Relations, Sentiment, Structure, Topics | LLMService | ~300 LOC |
| MCP Tools - Catalogue | api/src/mcp/tools/catalog/ | Tools | PlatformInterface | GXECore | 14 tools: graph catalog ops, tool search, pattern analysis, reuse detection | GraphCatalogService | ~450 LOC |
| MCP Tools - Dialogue | api/src/mcp/tools/dialogue/ | Tools | PlatformInterface | DevDialogue | 4 tools: FindDecision, GetContext, SearchDialogue, TraceProvenance | DialogueSearchService | ~150 LOC |
| MCP Tools - Data | api/src/mcp/tools/data/ | Tools | PlatformInterface | GXECore | 18 MSSQL tools: connect, query, schema inspection, ER extraction, ingest | MSSQL connector | ~600 LOC |
| MCP Tools - Meta | api/src/mcp/tools/meta/ | Tools | PlatformInterface | GXECore | 6 tools: Compose, CreateTool, Introspect, Optimize, Sandbox, ValidateTool | ToolRegistry | ~200 LOC |
| MCP Tools - Primitives | api/src/mcp/tools/primitives/ | Tools | PlatformInterface | GXECore | 19 tools: flow control primitives (Get/SetValue, Filter, Map, Merge, Split, Aggregate, etc.) | None | ~400 LOC |
| MCP Tools - Patterns | api/src/mcp/tools/patterns/ | Tools | PlatformInterface | GXECore | 9 tools: Batch, Cache, Chain, MapReduce, Parallel, Pipeline, RAG, Retry | None | ~300 LOC |
| MCP Tools - Text | api/src/mcp/tools/text/ | Tools | PlatformInterface | GXECore | 9 tools: Chunk, DetectLanguage, ExtractKeywords, Hash, Normalize, Sanitize, Template, Tokenize, Translate | None | ~300 LOC |
| External MCP Server | d:/UN/Repos/MCP_CLAUDE/mcp-server/ | External Server | PlatformInterface | AIAgents | Messaging/agent coordination server; provides project-knowledge tools for agent-to-agent delegation | Claude API, Gemini API, MemgraphService, QdrantService | TypeScript, compiled |

---

## Storage Layer (Tier 1)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| MemgraphService | api/src/services/memgraph.service.js | Service | Storage | GXECore | Primary graph DB driver; label whitelist security, namespace routing, schema validation | neo4j-driver, SchemaRegistry, NamespaceRouter | 1129 LOC |
| QdrantService | api/src/services/qdrant.service.js | Service | Storage | GXECore | Vector DB client; collection management, upsert, search, delete | @qdrant/js-client-rest | 711 LOC |
| RedisService | api/src/services/redis.service.js | Service | Storage | GXECore | Redis client; BullMQ backing, signal keys, session store | ioredis, BullMQ | 278 LOC |
| GraphSchemaManager | api/src/services/graph/GraphSchemaManager.js | Service | Storage | GXECore | Manages graph node/edge schemas and type definitions | MemgraphService | 504 LOC |
| GraphStorageService | api/src/services/graph/GraphStorageService.js | Service | Storage | GXECore | Graph CRUD operations with namespace isolation | MemgraphService | 773 LOC |
| NamespaceRouter | api/src/services/namespace-router.service.js | Service | Storage | GXECore | Routes graph operations to correct namespace | None | ~100 LOC |
| SchemaRegistry | api/src/validation/schema-registry.js | Service | Storage | GXECore | Pre-write validation against registered schemas | None | ~200 LOC |
| CollectionManager | api/src/services/vector/CollectionManager.js | Service | Storage | GXECore | Qdrant collection lifecycle management | QdrantService | ~150 LOC |
| Schema Loader | api/src/services/memgraph/schema-loader.service.js | Service | Storage | GXECore | Loads Cypher schema files on startup | MemgraphService | ~100 LOC |
| Memgraph Schemas | api/src/services/memgraph/schemas/ | Config | Storage | GXECore | 4 Cypher schema files: dialogue, ineed, sigillum, workspace | None | ~200 LOC |
| Job Queue Service | api/src/services/jobs/job-queue.service.js | Service | Infrastructure | GXECore | BullMQ queues (extraction/graph-update/batch/scheduled) with in-memory fallback | BullMQ/Redis | ~300 LOC |

---

## Knowledge Operations (Tier 1)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| ExtractionPipeline (Workspace) | api/src/services/workspace/extraction/extraction-pipeline.js | Service | Knowledge | WorkSpace | Orchestrates full extraction: text→entities→relations→drafts | LLMService, EntityExtractor, DraftService | 318 LOC |
| EntityExtractor (Workspace) | api/src/services/workspace/extraction/entity.extractor.js | Service | Knowledge | WorkSpace | LLM-based entity extraction from text | LLMService | 342 LOC |
| RelationExtractor (Workspace) | api/src/services/workspace/extraction/relation.extractor.js | Service | Knowledge | WorkSpace | LLM-based relation extraction | LLMService | ~200 LOC |
| EmbeddingService | api/src/services/structuring/embeddings/EmbeddingService.js | Service | Knowledge | GXECore | Text embedding via TEI service (multilingual-e5-large, 1024 dims) | TEI HTTP endpoint | ~200 LOC |
| LLMExtractor | api/src/services/structuring/extractors/LLMExtractor.js | Service | Knowledge | GXECore | LLM-powered structured extraction | LLMService | ~200 LOC |
| ASTExtractor | api/src/services/structuring/extractors/ASTExtractor.js | Service | Knowledge | GXECore | AST-based code structure extraction | ts-morph | ~200 LOC |
| HybridResolver | api/src/services/structuring/extractors/HybridResolver.js | Service | Knowledge | GXECore | Combines AST + LLM extraction results | LLMExtractor, ASTExtractor | ~200 LOC |
| InferredRelationEngine | api/src/services/structuring/relationships/InferredRelationEngine.js | Service | Knowledge | GXECore | Infers relationships from extracted data | MemgraphService | ~200 LOC |
| ProvenanceService | api/src/services/provenance.service.js | Service | Knowledge | GXECore | Tracks extraction rounds, source provenance, weight evolution (in-memory, round-based) | None (in-memory) | 489 LOC |
| ExtractionOrchestrator | api/src/services/pipeline/ExtractionOrchestrator.js | Service | Knowledge | GXECore | Higher-level extraction orchestration | ExtractionPipeline, various extractors | ~200 LOC |
| HybridSearch | api/src/services/retrieval/hybrid-search.js | Service | Knowledge | GXECore | Combines vector + graph search results | QdrantService, MemgraphService | ~200 LOC |
| QueryExpansionService | api/src/services/retrieval/query-expansion.service.js | Service | Knowledge | GXECore | Expands queries for better retrieval | LLMService | ~100 LOC |
| RerankerService | api/src/services/retrieval/reranker.service.js | Service | Knowledge | GXECore | Reranks search results | None | ~100 LOC |
| GraphValidator | api/src/services/graph/graph-validator.js | Service | Knowledge | GXECore | Graph DAG validation + auto-fix | None | 495 LOC |
| IngestionPipeline | api/src/services/ingestion/ingestion-pipeline.js | Service | Knowledge | GXECore | Document ingestion pipeline (older implementation) | DocumentParser, DocumentChunker | ~300 LOC |

---

## WorkSpace Subsystem (Tier 2)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| WorkspaceService | api/src/services/workspace/workspace.service.js | Service | Knowledge | WorkSpace | CRUD + FSM lifecycle (CREATED→PROFILING→READY→EXTRACTING→REVIEW→PROMOTED) | MemgraphService, Redis, QdrantService | 724 LOC |
| DraftService | api/src/services/workspace/draft.service.js | Service | Knowledge | WorkSpace | Draft entity/relationship CRUD; sandbox-isolated writes | MemgraphService | 764 LOC |
| SourceService | api/src/services/workspace/source.service.js | Service | Knowledge | WorkSpace | Source file management and profiling | MemgraphService, file extractors | ~200 LOC |
| PromotionSagaService | api/src/services/workspace/promotion/promotion-saga.service.js | Service | Knowledge | WorkSpace | SAGA pattern for Draft→GlobalKB promotion with compensation | MemgraphService, QdrantService, TEIService | 200 LOC |
| ConflictDetectorService | api/src/services/workspace/promotion/conflict-detector.service.js | Service | Knowledge | WorkSpace | Detects conflicts between draft and existing KB entities | MemgraphService | ~150 LOC |
| DiffComputerService | api/src/services/workspace/promotion/diff-computer.service.js | Service | Knowledge | WorkSpace | Computes property diffs for MERGE operations | None | ~100 LOC |
| ContradictionService | api/src/services/workspace/contradiction.service.js | Service | Knowledge | WorkSpace | Detects and manages contradictions between draft claims | LLMService, MemgraphService | ~200 LOC |
| CrossSourceService | api/src/services/workspace/cross-source.service.js | Service | Knowledge | WorkSpace | Cross-source entity analysis | MemgraphService | ~150 LOC |
| WorkspaceAgentService | api/src/services/workspace/workspace-agent.service.js | Service | Knowledge | WorkSpace | AI agent integration for workspace operations | AnthropicAgentService | ~200 LOC |
| GraphVersionService | api/src/services/workspace/graph-version.service.js | Service | Knowledge | WorkSpace | Version management for workspace graphs | MemgraphService | ~200 LOC |
| WorkspaceGraphService | api/src/services/workspace/workspace-graph.service.js | Service | Knowledge | WorkSpace | Graph operations scoped to a workspace | MemgraphService | ~200 LOC |
| LinkPredictorService | api/src/services/workspace/link-predictor.service.js | Service | Knowledge | WorkSpace | Predicts missing links in workspace graphs | MemgraphService, LLMService | ~150 LOC |
| DocxExtractor | api/src/services/workspace/extractors/docx.extractor.js | Utility | Knowledge | WorkSpace | DOCX file text extraction | mammoth | ~100 LOC |
| PdfExtractor | api/src/services/workspace/extractors/pdf.extractor.js | Utility | Knowledge | WorkSpace | PDF text extraction | pdf-parse | ~100 LOC |
| ExcelExtractor | api/src/services/workspace/extractors/excel.extractor.js | Utility | Knowledge | WorkSpace | Excel spreadsheet extraction | xlsx | ~100 LOC |
| ExtractionQueue | api/src/services/workspace/extraction/extraction-queue.js | Service | Knowledge | WorkSpace | Async extraction job queue | BullMQ/Redis | ~150 LOC |
| workspace.routes | api/src/routes/workspace.routes.js | Routes | PlatformInterface | WorkSpace | 40+ endpoints: workspace CRUD, sources, extraction jobs, drafts, contradictions, graph versions | WorkspaceController | 141 LOC |
| workspace.controller | api/src/controllers/workspace.controller.js | Controller | PlatformInterface | WorkSpace | Handler logic for all workspace operations | WorkspaceService, DraftService, etc. | 1205 LOC |

---

## Codex Subsystem (Tier 2)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| CodexService | api/src/services/codex/codex.service.js | Service | Knowledge | Codex | CRUD for Codex namespace with hash-chain integrity, admin-only writes | MemgraphService | 645 LOC |
| CodexLoaderService | api/src/services/codex/codex-loader.service.js | Service | Knowledge | Codex | Loads Codex rules for AI agent consumption | CodexService | ~200 LOC |
| CodexValidatorService | api/src/services/codex/codex-validator.service.js | Service | Knowledge | Codex | Validates code compliance against Codex rules | CodexService | ~200 LOC |
| CodexGovernanceService | api/src/services/codex/codex-governance.service.js | Service | Knowledge | Codex | Governance lifecycle for Codex proposals | CodexService | ~150 LOC |
| BlackCodexService | api/src/services/codex/blackcodex.service.js | Service | Knowledge | Codex | Anti-pattern registry (rejected approaches) | MemgraphService | ~100 LOC |
| CodexTools | api/src/services/codex/codex-tools.js | Service | PlatformInterface | Codex | In-process Codex tool implementations for agent use | CodexService | ~200 LOC |
| CodexValidationEngine | api/src/services/codex/validation/validation-engine.js | Service | Knowledge | Codex | Rule validation execution engine | CodexService | ~150 LOC |
| codex.route | api/src/routes/codex.route.js | Routes | PlatformInterface | Codex | 30+ endpoints: hierarchy, search, rules, validation, proposals, health | CodexService | 503 LOC |

---

## BackLog Subsystem (Tier 2)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| BackLogService | api/src/services/backlog/backlog.service.js | Service | Knowledge | BackLog | Task CRUD + FSM (PROPOSED→APPROVED→IN_PROGRESS→REVIEW→DONE) | MemgraphService | 343 LOC |
| ExecutionCycleService | api/src/services/backlog/execution-cycle.service.js | Service | Knowledge | BackLog | Execution cycle management (planning→execution→review) | MemgraphService | 217 LOC |
| PlanService | api/src/services/backlog/plan.service.js | Service | Knowledge | BackLog | AI-generated plan storage + approval lifecycle | MemgraphService | ~150 LOC |
| ReviewService | api/src/services/backlog/review.service.js | Service | Knowledge | BackLog | Review submission and outcome handling | MemgraphService | ~150 LOC |
| AgentMemoryService | api/src/services/backlog/agent-memory.service.js | Service | Knowledge | BackLog | Per-cycle agent memory/context storage | MemgraphService | ~150 LOC |
| ActionLogService | api/src/services/backlog/action-log.service.js | Service | Knowledge | BackLog | Immutable action log for audit trail | MemgraphService | ~100 LOC |
| RankingService | api/src/services/backlog/ranking.service.js | Service | Knowledge | BackLog | Priority-based task ranking | None | ~100 LOC |
| TaskHierarchyService | api/src/services/backlog/task-hierarchy.service.js | Service | Knowledge | BackLog | Task parent/child relationships | MemgraphService | ~100 LOC |
| TaskExecutorPrompt | api/src/prompts/task-executor.prompt.js | Config | Intelligence | BackLog | System prompt for AI task executor agent | None | 87 LOC |
| backlog.route | api/src/routes/backlog.route.js | Routes | PlatformInterface | BackLog | 20+ endpoints: CRUD, status transitions, ranking, dependencies, namespace grouping | BackLogService | 289 LOC |
| backlog-execution.route | api/src/routes/backlog-execution.route.js | Routes | PlatformInterface | BackLog | 20+ endpoints: cycles, memory, plans, reviews, AI review | ExecutionCycleService, etc. | 260 LOC |

---

## AI Agents Infrastructure (Tier 2)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| AnthropicAgentService | api/src/services/agents/anthropic-agent.service.js | Service | Intelligence | AIAgents | Full Anthropic SDK + MCP client integration; agentic loop with streaming; tool execution | @anthropic-ai/sdk, @modelcontextprotocol/sdk, all MCP tools | 466 LOC |
| LLMProviderService | api/src/services/llm/LLMProviderService.js | Service | Intelligence | AIAgents | Abstraction for Anthropic/Azure AI Foundry providers; unified chat + stream interface | @anthropic-ai/sdk, fetch (Azure) | ~250 LOC |
| SessionContextService | api/src/services/agents/SessionContextService.js | Service | Intelligence | AIAgents | Per-session context management for agent conversations | Redis | ~100 LOC |
| AgentBootstrapService | api/src/services/agents/AgentBootstrapService.js | Service | Intelligence | AIAgents | Initializes agent with appropriate tools and context | AnthropicAgentService | ~100 LOC |
| AgentLearningService | api/src/services/agents/AgentLearningService.js | Service | Intelligence | AIAgents | Records agent execution patterns for learning | PatternLibrary | ~100 LOC |
| GraphBuilderAgent | api/src/services/ai/graph-builder-agent.service.js | Service | Intelligence | AIAgents | Dedicated agent for building GXE graphs | LLMProviderService, GraphCatalog | ~300 LOC |
| ai-agent.route | api/src/routes/ai-agent.route.js | Routes | PlatformInterface | AIAgents | REST endpoints for agentic operations | AnthropicAgentService | ~150 LOC |

---

## Sigillum Versioning (Tier 3)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| SigillumService | api/src/services/sigillum/sigillum.service.js | Service | Knowledge | Sigillum | Git-like versioning: snapshot/branch/seal operations | VersionVectorService, repositories, MemgraphService | ~200 LOC |
| VersionVectorService | api/src/services/sigillum/version-vector.service.js | Service | Knowledge | Sigillum | Computes content-based version vectors | MemgraphService | ~150 LOC |
| SnapshotRepository | api/src/services/sigillum/snapshot.repository.js | Repository | Storage | Sigillum | Snapshot CRUD in Memgraph | MemgraphService | ~100 LOC |
| BranchRepository | api/src/services/sigillum/branch.repository.js | Repository | Storage | Sigillum | Branch CRUD in Memgraph | MemgraphService | ~100 LOC |
| SealRepository | api/src/services/sigillum/seal.repository.js | Repository | Storage | Sigillum | Seal (tag/release) CRUD in Memgraph | MemgraphService | ~100 LOC |
| sigillum.route | api/src/routes/sigillum.route.js | Routes | PlatformInterface | Sigillum | 15+ endpoints: branches, snapshots, seals, diff | SigillumService | 225 LOC |

---

## Immutable Graph (Tier 2/3)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| ImmutableGraphService | api/src/services/immutable-graph/immutable-graph.service.ts | Service | Knowledge | Sigillum | TypeScript service for versioned node/edge operations with hash chain integrity | NodeVersionRepository, EdgeVersionRepository, HashService, StateMachineService | ~400 LOC |
| HashService | api/src/services/immutable-graph/hash.service.ts | Service | Knowledge | Sigillum | Merkle-like hash computation for graph versions | None | ~100 LOC |
| StateMachineService | api/src/services/immutable-graph/state-machine.service.ts | Service | Knowledge | Sigillum | Node lifecycle state machine (DRAFT→ACTIVE→DEPRECATED) | None | ~100 LOC |
| GodModeService | api/src/services/immutable-graph/god-mode.service.ts | Service | Knowledge | Sigillum | Admin operations bypassing immutability constraints | MemgraphService | ~150 LOC |
| NamespaceService | api/src/services/immutable-graph/namespace.service.ts | Service | Knowledge | Sigillum | Namespace isolation for immutable graph | MemgraphService | ~100 LOC |
| NodeVersionRepository | api/src/repositories/node-version.repository.ts | Repository | Storage | Sigillum | TypeScript repository for NodeVersion entities | MemgraphService | ~200 LOC |
| EdgeVersionRepository | api/src/repositories/edge-version.repository.ts | Repository | Storage | Sigillum | TypeScript repository for EdgeVersion entities | MemgraphService | ~150 LOC |

---

## DevDialogue Collector (Tier 3)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| DialogueNormalizer | api/src/core/aopeg/plugins/dialogue/services/dialogue.normalizer.js | Service | Knowledge | DevDialogue | Parses Claude Code JSONL + Claude.ai JSON exports | None | ~300 LOC |
| DialogueSearchService | api/src/core/aopeg/plugins/dialogue/services/dialogue.search.js | Service | Knowledge | DevDialogue | Semantic search over dialogue sessions | QdrantService, MemgraphService, EmbeddingService | ~300 LOC |
| DialogueQdrantService | api/src/core/aopeg/plugins/dialogue/services/dialogue.qdrant.js | Service | Storage | DevDialogue | Dialogue vector storage management | QdrantService | ~150 LOC |
| DialogueWatcher | api/src/core/aopeg/plugins/dialogue/services/dialogue.watcher.js | Service | Knowledge | DevDialogue | File system watcher for new dialogue files | chokidar | ~100 LOC |
| dialogue.route | api/src/routes/dialogue.route.js | Routes | PlatformInterface | DevDialogue | 15 endpoints: ingest, sessions, decisions, search, analytics, provenance, metrics | DialogueSearchService, dialogue executors | 1048 LOC |

---

## Observability (Tier 3)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| MetricsService | api/src/services/observability/metrics.service.js | Service | Observability | Observability | In-memory rolling window metrics (24h); counters, histograms, topK, timeseries | None (in-memory) | ~200 LOC |
| MetricsMiddleware | api/src/middleware/metrics.middleware.js | Middleware | Infrastructure | Observability | HTTP endpoint metrics collection | MetricsService | ~50 LOC |
| KBHealthService | api/src/services/kb-health/kb-health.service.js | Service | Observability | Observability | KB health metrics snapshots | MemgraphService, QdrantService | ~200 LOC |
| MetacognitionService | api/src/services/metacognition/metacognition.service.js | Service | Intelligence | Observability | KB self-improvement: DETECT→EVALUATE→PROPOSE→APPROVE→EXECUTE; 5 autonomy levels | MemgraphService, Redis | 582 LOC |
| metrics.route | api/src/routes/metrics.route.js | Routes | PlatformInterface | Observability | Metrics REST endpoint | MetricsService | ~50 LOC |
| ObservabilityPage | mcp/src/pages/ObservabilityPage.jsx | Frontend | PlatformInterface | Observability | Frontend dashboard for observability metrics | metrics API | ~200 LOC |

---

## Structural Form System (Tier 2)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| StructuralFormService | api/src/structural-form.service.js | Service | Knowledge | GXECore | Manages form schema generation from STRUCTURAL graphs | MemgraphService, FormSchemaBuilder | ~300 LOC |
| ConstraintCompiler | api/src/compilers/constraint-compiler.js | Compiler | Knowledge | GXECore | Compiles CONSTRAINT graphs to validation rules | None | ~200 LOC |
| StructuralToJsonSchema | api/src/compilers/structural-to-jsonschema.js | Compiler | Knowledge | GXECore | Compiles STRUCTURAL graphs to JSON Schema | None | ~100 LOC |
| FormSchemaBuilder | api/src/services/forms/form-schema-builder.js | Service | Knowledge | GXECore | Builds UI form schemas from STRUCTURAL graph definitions | None | ~200 LOC |
| structural-form.route | api/src/routes/structural-form.route.js | Routes | PlatformInterface | GXECore | Form schema REST endpoints | StructuralFormService | ~100 LOC |
| structural.route | api/src/routes/structural.route.js | Routes | PlatformInterface | GXECore | Structural graph operations | StructuralDomainService | ~100 LOC |

---

## DataSource Framework (Tier 2)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| SQLDatasourceExecutor | api/src/datasource/sql-datasource.executor.js | Executor | Knowledge | GXECore | SQL datasource query executor | MSSQL connector | ~200 LOC |
| KBDatasourceExecutor | api/src/datasource/kb-datasource.executor.js | Executor | Knowledge | GXECore | Knowledge base datasource query executor | MemgraphService | ~200 LOC |
| APIDatasourceExecutor | api/src/datasource/api-datasource.executor.js | Executor | Knowledge | GXECore | External API datasource executor | axios | ~200 LOC |
| FileDatasourceExecutor | api/src/datasource/file-datasource.executor.js | Executor | Knowledge | GXECore | File-based datasource executor | fs | ~150 LOC |
| CompositeDatasourceExecutor | api/src/datasource/composite-datasource.executor.js | Executor | Knowledge | GXECore | Composite datasource combining multiple sources | Multiple executors | ~200 LOC |
| DatasourceService | api/src/services/datasources/datasource.service.js | Service | Knowledge | GXECore | Datasource catalog CRUD + execution | MemgraphService, all executors | ~300 LOC |

---

## Graph Neural Network Service (Tier 3)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| GNN Service | gnn-service/ | External Python | Intelligence | GXECore | Graph neural network enrichment service (FastAPI, PyTorch) | Memgraph, Redis, Qdrant | Python |
| gnn.service.js | api/src/services/gnn/ | Service | Intelligence | GXECore | Node.js client for GNN HTTP service | axios | ~100 LOC |

---

## FlowDesk External Project (NOTE: This is a client project, NOT platform)

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| FlowDesk Plugin | api/src/core/aopeg/plugins/flowdesk/ | AOPEG Plugin | Runtime | FlowDesk | 17 FlowDesk-specific executors for dialog/process graphs | MemgraphService, FlowDesk data | ~600 LOC |
| FlowDesk Service | api/src/services/flowdesk/ | Service | Knowledge | FlowDesk | 20+ files: graph loading, runtime chat, routing, templates, MSSQL import | MemgraphService, LLMService | ~2000 LOC |
| FlowDesk Graphs | api/src/services/flowdesk/graphs/ | Data | Knowledge | FlowDesk | 4 production graph definitions: intake-dialog, it-hw-lap, sla-escalation, ticket-lifecycle | None | JSON |
| FlowDesk Proxy | flowdesk-proxy/FlowDeskProxy/ | .NET App | Infrastructure | FlowDesk | ASP.NET Core 8 proxy for FlowDesk integration | .NET 8 | C# |
| flowdesk.route | api/src/routes/flowdesk.route.js | Routes | PlatformInterface | FlowDesk | FlowDesk-specific REST endpoints | FlowDesk service | ~200 LOC |

---

## Infrastructure Components

| Component | Location | Type | Layer | Subsystem | Role | Dependencies | Size |
|-----------|----------|------|-------|-----------|------|--------------|------|
| StartupManager | api/src/services/startup/StartupManager.js | Service | Infrastructure | GXECore | Background job initialization: AGE indexes, workspace/dialogue/sigillum schemas, orphan detector, tombstone expirer, KB health, metacognition cycle | All storage services | 332 LOC |
| MemgraphService (pools) | api/src/services/memgraph.service.js | Service | Infrastructure | GXECore | Connection pool: 30 connections, 30s acquisition timeout, 20s connection timeout, 30min lifetime | neo4j-driver | 1129 LOC |
| SecurityMiddleware | api/src/middleware/security.js | Middleware | Infrastructure | GXECore | Rate limiting, API key validation, CORS, input sanitization, security headers | express-rate-limit | ~100 LOC |
| ErrorHandler | api/src/middleware/error-handler.js | Middleware | Infrastructure | GXECore | Centralized error handling, shutdown handler | None | ~100 LOC |
| WhitelistAudit | api/src/middleware/whitelist-audit.js | Utility | Infrastructure | GXECore | Audits label whitelists at startup | None | ~50 LOC |
| Docker Compose | docker-compose.yml | Config | Infrastructure | GXECore | Services: api, redis, memgraph, qdrant, mssql, gnn (profile), tei (profile), ollama (profile) | Docker | ~250 LOC |
| OrphanDetector | api/src/jobs/orphan-detector.job.js | Job | Infrastructure | GXECore | Every 6h: removes orphaned Qdrant vectors | QdrantService, MemgraphService | ~100 LOC |
| TombstoneExpirer | Embedded in StartupManager | Job | Infrastructure | GXECore | Every 24h: expires non-restorable tombstones | MemgraphService | ~50 LOC |
| KBHealthCollector | api/src/jobs/kb-health-collector.job.js | Job | Infrastructure | Observability | Every 15min: KB health metrics snapshot | KBHealthService | ~50 LOC |
| MetacognitionCycle | api/src/jobs/metacognition-cycle.job.js | Job | Intelligence | Observability | Every 1h: detect→propose→execute KB improvements | MetacognitionService | ~50 LOC |
| StructuringWorker | api/src/workers/structuring/StructuringWorker.js | Worker | Knowledge | GXECore | BullMQ worker for async document structuring jobs | BullMQ, various services | ~200 LOC |

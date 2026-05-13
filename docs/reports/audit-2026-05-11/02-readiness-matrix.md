# Readiness Matrix
## Audit Date: 2026-05-11
## Quality scale: ProductionGrade / Stable / Working / Prototype / Stub
## Tests scale: None / Smoke / Partial / Comprehensive

---

## GXE Runtime Core

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| RuntimeEngine | 95% | Stable | Comprehensive (535 LOC test, covers happy path, failure, parallel DAG, empty input, type gates) | Inline JSDoc | Integrated with AOPEG via AOPEGAdapter, routes via runtime.route | ts-node not in package.json (transitive dep) |
| TopologicalScheduler | 95% | Stable | Comprehensive (dedicated test file, back-edge DFS, parallel bounded) | Inline JSDoc | Used by RuntimeEngine | Dual .js/.ts files in same dirs (dead code) |
| NodeRunner | 95% | Stable | Comprehensive (dedicated test in __tests__/) | Phase documentation in comments | Used by TopologicalScheduler | Port flattening logic is complex but documented |
| ExecutionStateMachine | 90% | Stable | Comprehensive (dedicated test) | Inline | Used by RuntimeEngine | None notable |
| NodeStateMachine | 90% | Stable | Partial | Inline | Used by TopologicalScheduler | None notable |
| DataFlowManager | 90% | Stable | Comprehensive (dedicated test) | Inline | Used by RuntimeEngine | None notable |
| PortManager | 90% | Stable | Partial | Inline | Used by RuntimeEngine | None notable |
| AOPEGAdapter | 85% | Stable | Comprehensive (dedicated test) | Inline | Bridges AOPEG→Runtime; tested with mock registry | MCP_TOOL_ALIAS_MAP hardcoded; may drift from actual executors |
| AsyncSignalContract | 80% | Working | Partial | Inline | Integrated with Redis; signal tests exist | Requires Redis to be running for full test |
| ConditionalBranch | 85% | Working | Comprehensive (dedicated test) | Inline | Used for conditional routing | None notable |
| LoopPattern | 80% | Working | Comprehensive (dedicated test) | Inline | Used for loops | None notable |
| ExpressionSandbox | 85% | Working | Comprehensive | Inline | Used for safe expression eval in graphs | None notable |
| ResourceLimiter | 80% | Working | Comprehensive | Inline | Used by RuntimeEngine config | None notable |
| RetryPolicy | 85% | Working | Comprehensive | Inline | Used by TopologicalScheduler | None notable |
| RuntimeSSEStreamer | 85% | Working | Comprehensive (dedicated test) | Inline | Used in runtime.route | None notable |
| CheckpointManager (resilience) | 70% | Working | Partial | Inline | Optional checkpoint support | Limited real-world testing evidence |
| PatternLibrary | 60% | Prototype | None found in test inventory | Minimal | Used by AgentLearningService | Memgraph persistence may not be tested |
| GXESSEBridge | 80% | Working | Smoke | Inline | Used in runtime.route | None notable |
| GraphFormatConverter | 85% | Working | Smoke | Inline | Used in runtime.route | Edge format differences ReactFlow vs AOPEG documented |
| GraphTypeError | 100% | ProductionGrade | N/A (error class) | Inline | Used in RuntimeEngine | None |
| GraphClassificationService | 95% | Stable | Partial (typeGates test in RuntimeEngine test suite) | Inline | Used by RuntimeEngine gate logic | None notable |

---

## AOPEG Plugin Architecture

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| PluginRegistry | 95% | Stable | Smoke | Inline | Central registry used by all plugins | None notable |
| PluginLoader | 90% | Stable | Smoke | Inline | Used by AOPEG init | None notable |
| WorkflowPlugin (6 executors) | 85% | Working | Smoke | Inline JSDoc | Registered via AOPEG init; workflow.start/end are core; wait_input handles WAIT_FOR_INPUT | No dedicated unit tests per executor |
| CommonPlugin (17 executors) | 75% | Working | Smoke | Inline | Used across all graph types | Large surface area; no comprehensive test per executor |
| IngestionPlugin (10 executors, TS) | 70% | Working | None (TS executors have no JS test files) | Inline TypeScript | Loaded via ts-node transpilation | TS executors loaded at runtime via ts-node; NOT in devDependencies — ts-node is a transitive dep only |
| RAGPlugin (8 executors, TS) | 70% | Working | None (TS executors lack tests) | Inline TypeScript | Loaded via ts-node transpilation | Same ts-node issue as IngestionPlugin |
| SubgraphPlugin (3 executors) | 75% | Working | Smoke | Inline | Used for graph segmentation | Dual .js/.ts files |
| NotificationPlugin (1 executor) | 80% | Working | None | Inline | External notification required | Depends on external notification service |
| ExtractionPlugin (1 executor) | 75% | Working | None | Inline | Used in structured extraction | None notable |
| SQLExtractionPlugin (9 executors) | 80% | Working | Partial (mssql connector tests) | Inline | Requires MSSQL connection | MSSQL service must be running |
| DialoguePlugin (8 executors) | 80% | Working | Partial (phase2-integration, phase3-e2e tests exist) | Inline | Full pipeline: normalize→sanitize→store→segment→summarize→embed→decisions→link | Comment "EXECUTOR STUBS" in index.js is misleading — real implementations are loaded |
| FlowDeskPlugin (17 executors) | 75% | Working | Partial (2 executor tests: check-location, classify-intent) | Inline | External client project; tightly coupled to FlowDesk data | Namespace violation: client-specific executors in platform core |
| ValidationPlugin | 60% | Prototype | None | Minimal | Used optionally | Appears incomplete |
| BuiltinConditions | 80% | Working | None | Inline TypeScript | Used in conditional branching | Dual .js/.ts files |
| BuiltinTransformers | 80% | Working | None | Inline | Used in data transformation | Dual .js/.ts files |

---

## GXE Manager

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| GxeManagerService | 90% | Stable | Comprehensive (dedicated test + e2e lifecycle tests) | JSDoc, README.md present | Full integration with RuntimeEngine, AOPEGAdapter, Redis, Memgraph via lazy-init route | None notable |
| ExecutionRegistry | 90% | Stable | Comprehensive (dedicated test) | Inline | Redis + in-memory dual-store | None notable |
| TriggerEngine | 80% | Working | Comprehensive (dedicated test) | Inline | Supports MANUAL/SCHEDULED/SIGNAL triggers | Scheduled triggers not verified in production |
| ConcurrencyGovernor | 85% | Working | Comprehensive (dedicated test) | Inline | Redis-backed capacity enforcement | None notable |
| SignalRouter | 85% | Working | Comprehensive (dedicated test) | Inline | Routes signals between executions | None notable |
| TransactionCoordinator | 75% | Working | Partial (saga-transactions e2e test) | Inline | SAGA transactions; requires Redis + Memgraph | Limited compensation testing |
| AuditLogger | 80% | Working | Comprehensive (dedicated test) | Inline | Optional Memgraph persistence | None notable |
| QueueManager | 70% | Working | None | Minimal | BullMQ integration; optional in Manager init | Not fully wired in gxeManager route init |

---

## Platform Interface Layer

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| runtime.route | 90% | Stable | None (route-level) | Extensive inline comments | Wires RuntimeEngine + AOPEGAdapter + SSE | 859 LOC single file |
| gxeManager.route | 90% | Stable | None (route-level) | Extensive inline comments | Full GxeManager stack wired | 709 LOC; lazy init on first request |
| GXE MCP Server | 80% | Working | Partial (level2, level3, level4 integration tests) | Inline | All tool sets loaded and registered | createGXEServer used as CLI entry point; not used by API server (uses createAllTools instead) |
| backlog.route | 90% | Stable | None | Inline | Complete REST API | None notable |
| backlog-execution.route | 85% | Working | None | Inline | Cycles, plans, reviews | None notable |
| codex.route | 85% | Working | None | Inline | Full Codex API | None notable |
| workspace.routes | 85% | Stable | Partial (datasource-v2-routes test) | Inline | 40+ endpoints wired | None notable |
| dialogue.route | 80% | Working | None | Inline (extensive endpoint comments) | Full pipeline from ingest to provenance | 1048 LOC single file |
| sigillum.route | 75% | Working | None | Inline | Snapshot/branch/seal operations | Requires Sigillum schemas loaded |
| MCP Tool sets | 70% | Working | Partial (integration tests: level2, level3, level4) | Inline per tool | Loaded by AnthropicAgentService for agent use | No per-tool unit tests |

---

## Storage Layer

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| MemgraphService | 90% | Stable | Smoke (implicit via route tests) | Extensive comments | Used everywhere; connection pool configured | Label whitelist requires manual updates when adding new node types |
| QdrantService | 85% | Stable | Smoke | Inline | Used for all vector operations | None notable |
| RedisService | 85% | Stable | Smoke | Inline | Used for BullMQ, signals, sessions | In-memory fallback in JobQueueService but not in signals/sessions |
| GraphStorageService | 80% | Working | None | Inline | Used by workspace and graph operations | None notable |
| SchemaRegistry | 80% | Working | Comprehensive (dedicated test) | Inline | Pre-write validation integrated into MemgraphService | None notable |
| Job Queue Service | 80% | Working | None | Inline | BullMQ with in-memory fallback | BullMQ requires Redis; fallback loses durability |
| Memgraph Schemas | 85% | Working | None | Schema comments | 4 Cypher schemas loaded on startup | Schema evolution not versioned |

---

## Knowledge Operations

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| ExtractionPipeline (Workspace) | 80% | Working | None | Inline | Calls entity extractor, relation extractor, draft service | No test coverage on extraction logic |
| EntityExtractor (Workspace) | 75% | Working | None | Inline | LLM-dependent; accuracy depends on LLM quality | No fallback if LLM unavailable |
| EmbeddingService | 80% | Working | Comprehensive (dedicated test in structuring/embeddings/__tests__/) | Inline | TEI service HTTP calls | Requires TEI service running; no mock fallback |
| LLMExtractor | 75% | Working | Comprehensive (dedicated test) | Inline | Used in workspace extraction | None notable |
| ASTExtractor | 80% | Working | Comprehensive (dedicated test) | Inline | Used for code graph extraction | None notable |
| HybridResolver | 75% | Working | Comprehensive (dedicated test) | Inline | Combines AST + LLM | None notable |
| InferredRelationEngine | 70% | Working | Comprehensive (dedicated test) | Inline | Graph-based relation inference | None notable |
| ProvenanceService | 70% | Prototype | None | JSDoc | In-memory only; not persisted to Memgraph | State lost on restart; no persistence integration |
| HybridSearch | 75% | Working | None | Inline | Combines QdrantService + MemgraphService | None notable |
| GraphValidator | 90% | Stable | Implicit in RuntimeEngine tests | Inline | Used by RuntimeEngine; auto-fix capability | None notable |
| IngestionPlugin executors | 70% | Working | None (TS) | TypeScript | Used in ingestion graph workflows | ts-node dependency risk |

---

## WorkSpace Subsystem

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| WorkspaceService | 90% | Stable | None (no workspace-specific test files found) | Inline | Full FSM lifecycle; Redis caching; Memgraph + Qdrant | Zero test coverage despite 724 LOC |
| DraftService | 85% | Working | None | Inline | Sandbox-isolated writes | Zero test coverage despite 764 LOC |
| PromotionSagaService | 80% | Working | None | Inline | Multi-step SAGA with full compensation logic | Zero test coverage; SAGA compensation untested |
| ConflictDetectorService | 75% | Working | None | Inline | Uses MemgraphService for similarity | None notable |
| ContradictionService | 70% | Working | None | Inline | LLM-dependent contradiction detection | LLM dependency; no tests |
| WorkspaceAgentService | 70% | Working | None | Inline | Integrates with AnthropicAgentService | None notable |
| ExtractionQueue | 80% | Working | None | Inline | BullMQ async extraction jobs | Requires Redis |
| Workspace extractors (PDF/DOCX/Excel) | 80% | Working | None | Minimal | File processing | None notable |

---

## Codex Subsystem

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| CodexService | 90% | Stable | Partial | Extensive inline | Hash-chain integrity; used by MCP tools | None notable |
| CodexLoaderService | 85% | Working | None | Inline | Used by agents for rule loading | None notable |
| CodexValidatorService | 80% | Working | None | Inline | Compliance checking | None notable |
| CodexGovernanceService | 75% | Working | None | Inline | Proposal lifecycle | None notable |
| BlackCodexService | 80% | Working | None | Inline | Anti-pattern registry | None notable |
| CodexValidationEngine | 75% | Working | None | Inline | Rule validation execution | None notable |

---

## BackLog Subsystem

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| BackLogService | 90% | Stable | None | Inline | FSM transitions enforced; used by MCP tools | None notable |
| ExecutionCycleService | 85% | Working | None | Inline | Cycle lifecycle management | None notable |
| PlanService | 80% | Working | None | Inline | AI plan storage | None notable |
| ReviewService | 80% | Working | None | Inline | Review lifecycle | None notable |
| AgentMemoryService | 75% | Working | None | Inline | Per-cycle memory | None notable |
| TaskExecutorPrompt | 90% | Working | N/A | Inline | Used by agent service | None notable |

---

## AI Agents Infrastructure

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| AnthropicAgentService | 85% | Working | None | Inline JSDoc | Full Anthropic SDK + MCP client; max 10 iterations; 529 backoff | MCP_SERVER_PATH hardcoded to `d:/UN/Repos/MCP_CLAUDE/mcp-server/dist/index.js` — machine-specific |
| LLMProviderService | 85% | Working | None | JSDoc | Supports Anthropic + Azure AI Foundry; TODO comment on Azure streaming format | Azure streaming has TODO: "Verify Azure streaming format matches Anthropic SDK stream format" |
| GraphBuilderAgent | 70% | Working | Partial (level2-graph-ai test) | Inline | Uses LLMProvider + GraphCatalog | None notable |
| SessionContextService | 75% | Working | None | Minimal | Redis-backed | None notable |

---

## Sigillum Versioning

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| SigillumService | 75% | Working | None | Inline JSDoc | Requires Sigillum schemas in Memgraph; idempotent snapshot creation | No test coverage |
| ImmutableGraphService | 75% | Working | Comprehensive (5 test files in __tests__/) | TypeScript interfaces | TypeScript; loaded via ts-node | No route-level integration tests |
| HashService | 85% | Working | Comprehensive | TypeScript | Used by ImmutableGraphService | None notable |
| StateMachineService | 85% | Working | Comprehensive | TypeScript | Used by ImmutableGraphService | None notable |
| NodeVersionRepository | 80% | Working | Comprehensive | TypeScript | TypeScript repository | None notable |
| EdgeVersionRepository | 80% | Working | Comprehensive | TypeScript | TypeScript repository | None notable |

---

## DevDialogue Collector

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| DialogueNormalizer | 85% | Working | Partial (phase2-integration, phase3-e2e) | Inline | Parses JSONL and JSON dialogue formats | None notable |
| DialogueSearchService | 80% | Working | Partial | Inline | Semantic + graph search | Requires Qdrant + Memgraph |
| dialogue.route | 80% | Working | None | Extensive inline endpoint comments | Full ingestion→search→provenance pipeline wired | 1048 LOC single file |
| DialogueWatcher | 60% | Prototype | None | Minimal | File system watching | Not integrated in StartupManager startup |

---

## Observability

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| MetricsService | 75% | Working | None | Inline | In-memory only; no dashboard wiring found | In-memory; lost on restart; no Prometheus export |
| KBHealthService | 75% | Working | None | Inline | Snapshot to Redis | None notable |
| MetacognitionService | 70% | Prototype | None | Inline | Runs every hour via StartupManager | Autonomy levels defined but approval workflow not fully wired to BackLog |
| ObservabilityPage | 60% | Prototype | None | None | Frontend page exists but limited backend data | Limited backend API surface |

---

## Graph Neural Network

| Component | Functional% | Quality | Tests | Docs | Integration | Tech Debt |
|-----------|------------|---------|-------|------|-------------|-----------|
| GNN Service (Python) | 70% | Working | Partial (tests/ dir in gnn-service) | docs/ dir present | Docker profile; optional; Memgraph + Qdrant wired | Separate Python service; startup dependency; gnn profile required |
| gnn.service.js | 75% | Working | None | Minimal | HTTP client | GNN must be running |

---

## Tier 4 (Existence Check)

| Feature | Status | Evidence |
|---------|--------|---------|
| Polarity (AFFIRMED/NEGATED) | NOT FOUND | No code references to polarity, AFFIRMED, NEGATED in src/ |
| Temporal validity (valid_from/valid_to) | NOT FOUND | Only reference is a comment in schema-registry.js: "Bi-temporal model: transaction time + valid time" — no implementation |
| Retraction mechanism | NOT FOUND | No retraction-specific code found |
| Confidence decay | NOT FOUND | No confidence_decay or confidence decay patterns found |
| Hypothesis nodes | NOT FOUND | No hypothesis node type found |
| Background re-evaluation | NOT FOUND | MetacognitionService runs periodically but not specifically for re-evaluation of existing claims |
| Admiralty Code (provenance scoring) | NOT FOUND | ProvenanceService exists (in-memory) but no Admiralty-style scoring |
| Crystallization / projection caching | NOT FOUND | No crystallization or projection caching patterns found |
| Two-worlds parallel ingestion | NOT FOUND | No two-worlds pattern found |

---

## Frontend Components

| Component | Functional% | Quality | Tests | Docs | UX Readiness |
|-----------|------------|---------|-------|------|--------------|
| GXEVisualizerPage | 75% | Working | 6 frontend test files | None | Functional — ReactFlow editor with AOPEG graph building, live execution, GNN overlay |
| GxeManagerPage | 80% | Working | None | None | Functional — execution monitor with control bar, detail panel, execution list |
| BackLogPage | 85% | Working | None | None | Functional — list/graph/monitor views, task detail dialog |
| CodexViewerPage | 80% | Working | None | None | Functional — hierarchy/rules/ADR viewer |
| WorkspacesPage + WorkspaceDetailPage | 80% | Working | None | None | Functional — workspace CRUD, sources, drafts, promotion wizard |
| DialoguePage | 75% | Working | None | None | Functional — sessions, decisions, search, analytics, timeline tabs |
| AOPEGEditorPage | 75% | Working | None | None | Functional — visual graph editor |
| FlowDeskPage | 75% | Working | None | None | Client-specific demo page |
| ObservabilityPage | 50% | Prototype | None | None | Stub — limited backend data |
| AgentPage | 70% | Working | None | None | Functional — agent chat interface |
| DashboardPage | 65% | Working | None | None | Functional but basic |
| KnowledgeGraphPage | 70% | Working | None | None | Force graph visualization |
| StructuralEditorPage | 70% | Working | None | None | Graph schema editor |

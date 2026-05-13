# Changelog — Codex UN ProjectAdvisor

All significant changes to the Codex are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] — 2026-03-12

### Added

#### Part 0: AI Manifesto
- System philosophy and the role of AI agents
- Principles for handling contradictions
- Ethical boundaries of autonomy

#### Part I: CODEX-CRUD
- Standards for creating nodes and edges
- Fingerprint collision handling
- Polystore saga pattern (Memgraph → Qdrant → Redis)

#### Part II: CODEX-META
- Mandatory metadata fields (3 levels)
- Knowledge Quantum schema (8 blocks)
- W3C PROV-O mapping
- Hash chain integrity
- Bi-temporal model (tt/vt)

#### Part III: CODEX-VERSION
- Two models: NodeVersion vs Domain nodes
- Bridge pattern for linking models
- SUPERSEDES chain management
- Merge/Split/Fork operations
- God Mode protocol
- Tombstones and soft delete

#### Part IV: CODEX-NS
- Four namespaces (CORE/PROJECT/META/COMMON)
- Routing rules and auto-detection
- Cross-namespace query patterns
- Isolation guarantees
- ExecutionRecord → META migration

#### Part V: CODEX-VALID
- JSON Schema registry (7 schemas)
- Validation modes (warn/strict/skip)
- Error codes (VAL001-VAL009)

#### Part VI: CODEX-CATALOG
- CatalogEntry/GraphVersion/GraphDefinition schema
- Auto-save policy
- 3-level deduplication (hash → Jaccard → GNN)
- Hybrid search (keyword + structural + GNN)
- Reuse strategies (DIRECT_REUSE, CLONE_MODIFY, ABSTRACT_INHERIT, CREATE_NEW)
- Pattern promotion lifecycle

#### Part VII: CODEX-POLY
- Canonical write order (Memgraph → Qdrant → Redis)
- Compensating transactions (saga)
- Consistency levels
- Checkpoint/Resume for pipelines
- Health checks and auto-repair

#### Part VIII: SELF-EVOLUTION (future)
- Agent cascade architecture (3-tier)
- Consensus voting mechanisms (Majority/Weighted/Unanimous)
- APES (Agent Performance Evolution System)
- Contradiction detection and resolution
- Self-documentation (ADR auto-generation)
- Autonomy levels 0-4

### Infrastructure
- Schema Registry (`api/src/validation/schema-registry.js`) — 7 JSON schemas
- Integration into `memgraph.service.js` (warn mode by default)
- 34/34 unit tests passing
- Error codes: VAL001-VAL009, CRUD001-CRUD009, CATALOG001-CATALOG006

## [0.1.1] — 2026-03-12

### Added

#### Part IX: CODEX-DOMAINS
- 17 Information Types (two-level architecture: System Meta + Target Project)
- Label routing rules (76 labels → 17 types → 4 namespaces)
- Auto-documentation protocol for autonomously created graphs
- Statistics: 4,662 nodes, 18,330 edges

### Fixed

#### FIX-KB-001: ACTIVE_CONFIG anomaly
- Removed 137,160 duplicate ACTIVE_CONFIG edges
- Removed 20 duplicate AIConfigSet and 57 AIProviderConfig
- Fixed `_setActiveConfigSetInternal()` (row-per-match → two-step)
- Fixed `_createConfigSetInternal()` (CREATE → MERGE)
- Fixed `_createProviderConfig()` (CREATE → MERGE)

#### FIX-KB-002: Namespace inconsistency
- Unified CORE/Core/core → CORE (82 nodes)
- Removed default/default2 namespaces (16 nodes → CORE)
- Added namespace normalization in `memgraph.service.js` `mergeNode()`

#### FIX-KB-003: Namespace for all nodes
- 2,896 nodes received a namespace (was 63% without namespace → 0%)
- Mapping by domain: PROJECT(2,188), CORE(443+180), META(47)

#### FIX-KB-004: Namespace mismatches
- SystemComponent: GXE → CORE (20)
- BehavioralNode: CORE → PROJECT (18)
- Notification: CORE → META (15)
- Unified sql-extraction, iNeed, YOUNEED, core.types.* → 4 standard NS

## [0.1.2] — 2026-03-13

### Added

#### CC-029: ExecutionRecord unification
- Created `ExecutionRecorder` (`runtime/persistence/ExecutionRecorder.js`)
- Integration into RuntimeEngine._buildResult() (fire-and-forget)
- Migration AOPEG_Execution → ExecutionRecord (META namespace)
- ExecutionNodeRecordSchema added to Schema Registry (8 schemas)

#### CC-030: E2E test ExecutionRecord
- Test script `scripts/test-execution-record.js` (7/7 checks)
- Fixed bug: 3 calls to _buildResult() did not pass dag

#### CC-031: Production Activation
- StartupManager (`services/startup/StartupManager.js`)
- OrphanDetector cron (every 6 hours)
- TombstoneExpirer cron (every 24 hours)
- Health endpoint `/health/codex`
- Graceful shutdown integration
- Test script `scripts/test-startup-manager.js` (12/12 checks)

#### CC-032: Architecture Decision Records
- 6 ADRs created in `docs/codex/adr/`
- ADR-001: Memgraph as Knowledge Graph Store
- ADR-002: GXE AOPEG Execution Model
- ADR-003: Four-Namespace Architecture
- ADR-004: Bi-temporal Versioning with Hash Chain
- ADR-005: Polystore Architecture
- ADR-006: Information Types Classification
- 6 ADR nodes in Memgraph (META namespace)
- 12 RELATED_TO edges between ADRs

### Infrastructure
- Schema Registry: 8 schemas, 36 tests
- Background jobs: 2 (OrphanDetector 6h, TombstoneExpirer 24h)
- .env.example updated

## [0.1.3] — 2026-03-19

### Added

#### Tool Namespace Architecture (CODEX-DOMAINS §9.7)
- Field `toolNamespace` (CODEX/CORE/PROJECT) in tool-definition.schema.json
- 145 Tool nodes recorded in Memgraph (93 MCP + 52 AOPEG)
- 19 ToolCategory nodes (11 MCP + 8 AOPEG)
- Classification: CODEX=11, CORE=104, PROJECT=30

#### MCP Discovery Endpoints
- `list_tools_by_namespace` — filter tools by namespace with optional category
- `get_tool_stats` — registry statistics (byLevel, byCategory, byNamespace)
- Built-in tools in GXEMcpServer (not via registry)

#### Codex Tools → MCP Integration
- 6 Codex tools migrated to MCP: `api/src/mcp/tools/codex/`
  - codex.search_rules, codex.get_rule, codex.get_principles
  - codex.get_blackcodex, codex.check_compliance, codex.propose_change
- Inherit BaseTool, delegate to executeCodexTool()
- Registered via createCodexTools() in MCP index

#### ToolRegistry extensions
- `listByNamespace(namespace)` — filter by toolNamespace
- `listByNamespaceAndCategory(namespace, category)` — double filter
- `getStats()` returns `byNamespace` breakdown

#### Seed Scripts
- `seed-tool-catalog.js` updated: CATEGORY_NAMESPACE mapping, toolNamespace in Cypher
- `seed-aopeg-executors.js` — new script with auto-discovery of executors from plugins
- Fixed bug: `runCypher` → `runQuery` in seed-tool-catalog.js

### Infrastructure
- Documentation: CODEX-DOMAINS.md §9.7 (9 subsections)
- CODEX_INDEX.md updated with tool statistics
- Tool definition schema extended (optional toolNamespace field)

## [Unreleased]

### Planned
- Appendix A: JSON Schemas (full set)
- Appendix B: Cypher Templates
- Appendix C: Error Codes Registry
- Appendix D: Migration Guide
- Appendix E: Code Review Checklist
- Status upgrade to 🟢 1.0.0 after production validation

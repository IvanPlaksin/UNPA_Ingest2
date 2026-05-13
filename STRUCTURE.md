# UNPA_Ingest — Project Structure Reference

> **Machine-readable format:** This file uses consistent section anchors, path notation, and tag markers for automated tooling.  
> **Version:** 2026-05-13  
> **Scope:** Full monorepo layout for UN ProjectAdvisor (UNPA_Ingest)

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Top-Level Layout](#top-level-layout)
- [api/ — Backend](#api--backend)
- [mcp/ — Frontend](#mcp--frontend)
- [docs/ — Documentation](#docs--documentation)
- [scripts/ — Deployment](#scripts--deployment)
- [flowdesk-proxy/ — .NET Proxy](#flowdesk-proxy--net-proxy)
- [gnn-service/ — Python GNN](#gnn-service--python-gnn)
- [packages/ — Shared Libraries](#packages--shared-libraries)
- [docker/ — Infrastructure](#docker--infrastructure)
- [Port Map](#port-map)
- [Key Concepts](#key-concepts)
- [Namespace Rules](#namespace-rules)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    UN ProjectAdvisor Platform                    │
├──────────────┬──────────────────┬───────────────────────────────┤
│  mcp/        │  api/            │  External Services            │
│  React + Vite│  Node.js/Express │  Memgraph  · Qdrant           │
│  ReactFlow   │  GXE RuntimeEng  │  Redis     · PostgreSQL (AGE) │
│  Zustand     │  AOPEG Plugins   │  Azure AI  · Anthropic API    │
└──────┬───────┴────────┬─────────┴───────────────────────────────┘
       │                │
       │    REST / SSE / WebSocket
       │                │
       └────────────────┘
              ↕ MCP protocol
       ┌──────────────┐
       │ MCP Server   │  (d:/UN/Repos/MCP_CLAUDE/mcp-server/)
       │ project-knowledge tools                              │
       └──────────────┘
```

**Core principle:** `Graph = Program` — business logic lives in executable AOPEG graphs stored in Memgraph, not in application code.

---

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Backend runtime | Node.js 20 + Express | API server |
| Graph database | Memgraph (Bolt protocol, port 7687) | Primary knowledge store |
| Vector database | Qdrant (port 6333) | Semantic search & embeddings |
| Cache / Queue | Redis (port 6379) | Session cache, BullMQ jobs |
| Relational / Graph | PostgreSQL + Apache AGE | Relational + property graph |
| Frontend | React 18 + Vite + ReactFlow | Graph editor UI |
| State management | Zustand | Frontend stores |
| AI / LLM | Anthropic Claude API, Azure OpenAI | Inference |
| Graph ML | Python + PyTorch Geometric | GNN analysis |
| MCP | Model Context Protocol | AI tool integration |
| CI/CD | Azure Pipelines | Build and deploy |
| Container | Docker Compose | Local dev and production |

---

## Top-Level Layout

```
UNPA_Ingest/
├── api/                    # Node.js backend — main application server
├── mcp/                    # React frontend — graph editor UI
├── docs/                   # Project-wide documentation
├── scripts/                # Deployment and infrastructure scripts
├── docker/                 # Supplementary Docker Compose configs
├── flowdesk-proxy/         # .NET SignalR proxy (FlowDesk integration)
├── gnn-service/            # Python GNN (Graph Neural Network) service
├── indexing-pipeline/      # Legacy document indexing pipeline [ARCHIVE]
├── packages/               # Shared npm packages
│   └── unpa-chat/          # Embeddable chat widget
├── .claude/                # Claude Code project settings (not for new repo)
├── .github/                # GitHub Actions / PR templates
├── CLAUDE.md               # Claude Code agent instructions
├── STRUCTURE.md            # ← this file
├── README.md               # Getting started guide
├── Makefile                # Common dev commands
├── UNPA_Ingest.sln         # Visual Studio solution (flowdesk-proxy)
├── azure-pipelines.yml     # CI/CD pipeline definition
├── docker-compose.yml      # Full local stack (gitignored, use .dev or .prod)
├── docker-compose.dev.yml  # Development overrides
├── docker-compose.prod.yml # Production configuration
├── .env.example            # Environment variable template
└── .gitignore              # Repo-wide ignore rules
```

---

## api/ — Backend

**Entry point:** `api/index.js`  
**Runtime:** Node.js 20, Express 4  
**Test runner:** Jest (`api/jest.config.js`)

```
api/
├── src/                    # All application source code
│   ├── config/             # Configuration modules
│   │   ├── ai-models.config.js      # AI model registry (Claude, Azure OpenAI)
│   │   ├── environment.js           # Environment variable loader
│   │   ├── mssql.config.js          # MS SQL Server connection config
│   │   ├── namespace.config.js      # Namespace routing config
│   │   └── enums.js                 # Shared enumerations
│   │
│   ├── controllers/        # HTTP request handlers (thin layer over services)
│   │   # One controller per domain: assistant, chat, flowdesk, gxe,
│   │   # knowledge, mssql-import, workspace, approval, nexus, etc.
│   │
│   ├── core/               # Core AOPEG plugin system
│   │   └── aopeg/
│   │       └── plugins/    # 8 plugin namespaces (see AOPEG Plugins below)
│   │
│   ├── compilers/          # Graph compilers
│   │   ├── constraint-compiler.js       # Constraint graph → validation logic
│   │   └── structural-to-jsonschema.js  # Structural graph → JSON Schema
│   │
│   ├── datasource/         # DataSource executor implementations
│   │   ├── base-datasource.executor.js
│   │   ├── sql-datasource.executor.js   # MS SQL Server
│   │   ├── kb-datasource.executor.js    # Knowledge Base (Qdrant)
│   │   ├── api-datasource.executor.js   # External REST APIs
│   │   ├── file-datasource.executor.js  # File system
│   │   └── composite-datasource.executor.js
│   │
│   ├── db/                 # Database clients and schemas
│   │   ├── memgraph.client.ts           # Neo4j-driver wrapper for Memgraph
│   │   ├── resilient-memgraph.js        # Auto-reconnect Memgraph client
│   │   ├── resilient-qdrant.js          # Auto-reconnect Qdrant client
│   │   ├── resilient-redis.js           # Auto-reconnect Redis client
│   │   ├── cypher/                      # Cypher query templates
│   │   ├── migrations/                  # Schema migrations
│   │   ├── schemas/                     # Memgraph schema definitions
│   │   └── seeds/                       # Initial data seeds
│   │
│   ├── errors/             # Custom error types
│   │   └── GraphTypeError.js
│   │
│   ├── executors/          # [DEPRECATED] Legacy executor wrappers
│   │
│   ├── graphs/             # Static graph definitions (JSON/JS)
│   │
│   ├── gxe-manager/        # GXE execution orchestrator
│   │   # Manages graph execution instances, concurrency, queues
│   │   # See api/src/gxe-manager/README.md
│   │
│   ├── instances/          # Runtime graph instance storage
│   │
│   ├── jobs/               # Background job definitions (BullMQ)
│   │   ├── kb-health-collector.job.js
│   │   ├── metacognition-cycle.job.js
│   │   └── orphan-detector.job.js
│   │
│   ├── mcp/                # MCP server tools (project-knowledge integration)
│   │   ├── server/         # MCP server endpoints
│   │   ├── services/       # ServiceConnector, tool routing
│   │   ├── tools/          # Individual MCP tool implementations
│   │   ├── demos/          # Demo MCP tool scripts
│   │   └── schemas/        # Tool input/output schemas
│   │
│   ├── middleware/         # Express middleware
│   │   ├── error-handler.js
│   │   ├── input-validator.middleware.js
│   │   ├── metrics.middleware.js
│   │   ├── rate-limiter.middleware.js
│   │   ├── request-logger.js
│   │   ├── sanitizer.middleware.js
│   │   └── security.js
│   │
│   ├── models/             # Data models / DTOs
│   │
│   ├── personas/           # AI persona definitions
│   │
│   ├── plugins/            # [DEPRECATED] Old plugin structure
│   │
│   ├── processors/         # [DEPRECATED] Old processor structure
│   │
│   ├── prompts/            # AI agent system prompts
│   │   ├── task-executor.prompt.js      # BackLog task executor
│   │   ├── efficiency-analyst.prompt.js
│   │   ├── ranking-agent.prompt.js
│   │   ├── reviewer-agent.prompt.js
│   │   └── task-creator.prompt.js
│   │
│   ├── repositories/       # Data access layer (TypeScript)
│   │   ├── base.repository.ts
│   │   ├── edge-version.repository.ts
│   │   ├── node-version.repository.ts
│   │   └── merge-record.repository.ts
│   │
│   ├── routes/             # Express route definitions
│   │   # Named <domain>.route.js — wires controllers to HTTP paths
│   │   # Key routes: backlog, dialogue, gxe, workspace, datasource,
│   │   #             knowledge, codex, flowdesk, sigillum, tier0, tier1
│   │
│   ├── runtime/            # GXE RuntimeEngine — core execution engine
│   │   ├── RuntimeEngine.js             # Main engine entry point
│   │   ├── execution/
│   │   │   └── NodeRunner.js            # Node execution + port flattening
│   │   ├── scheduler/
│   │   │   └── TopologicalScheduler.js  # DAG scheduling + back-edge detection
│   │   ├── integration/
│   │   │   └── AOPEGAdapter.js          # AOPEG ↔ MCP bridge
│   │   ├── dataflow/                    # DataFlowManager
│   │   ├── control/                     # Control flow
│   │   ├── state/                       # Execution state
│   │   ├── signals/                     # Async signal routing
│   │   ├── observability/               # Metrics, tracing
│   │   ├── safety/                      # Circuit breakers, guards
│   │   └── resilience/                  # Retry, fallback logic
│   │
│   ├── schemas/            # JSON Schema definitions
│   │   ├── structural-graph.schema.js
│   │   ├── constraint-graph.schema.js
│   │   └── datasource-config.schema.js
│   │
│   ├── services/           # Business logic services (primary domain layer)
│   │   ├── agents/         # AI agent services (Anthropic, Azure, etc.)
│   │   ├── analytics/      # Usage analytics
│   │   ├── backlog/        # BackLog task management system
│   │   ├── catalog/        # Graph catalog service
│   │   ├── chunking/       # Document chunking strategies
│   │   ├── codex/          # Codex rules engine
│   │   ├── connectors/     # External connectors (MS SQL, ADO)
│   │   ├── datasources/    # DataSource management
│   │   ├── domain/         # Domain management
│   │   ├── extraction/     # Entity/relation extraction
│   │   ├── flowdesk/       # FlowDesk client domain services
│   │   ├── forms/          # Form generation
│   │   ├── gnn/            # Graph Neural Network integration
│   │   ├── graph/          # Graph analysis (coherence, planning)
│   │   ├── graph-definitions/ # Static graph definition loader
│   │   ├── gxe/            # GXE execution helpers
│   │   ├── immutable-graph/   # Immutable graph layer
│   │   ├── ingestion/      # Document ingestion pipeline
│   │   ├── jobs/           # Job queue management
│   │   ├── kb-health/      # Knowledge Base health monitoring
│   │   ├── knowledge/      # Knowledge graph operations
│   │   ├── llm/            # LLM abstraction layer
│   │   ├── memgraph/       # Memgraph schema and migrations
│   │   │   └── schemas/    # Cypher schema files (*.cypher)
│   │   ├── metacognition/  # Self-monitoring and tuning
│   │   ├── notifications/  # Event notifications
│   │   ├── observability/  # Logging, metrics
│   │   ├── parsers/        # Document parsers
│   │   ├── patterns/       # Pattern extraction
│   │   ├── pipeline/       # Ingestion pipeline orchestration
│   │   ├── preprocessing/  # Text preprocessing (coref, decomposition)
│   │   ├── qdrant/         # Qdrant vector DB service
│   │   ├── query/          # Query expansion and processing
│   │   ├── retrieval/      # RAG retrieval services
│   │   ├── semantic/       # Semantic processing
│   │   ├── sigillum/       # Sigillum versioning system (branch/seal/snapshot)
│   │   ├── startup/        # Application startup orchestration
│   │   ├── storage/        # Storage port abstractions
│   │   │   ├── GraphDBPort.js           # Graph database port interface
│   │   │   ├── VectorDBPort.js          # Vector database port interface
│   │   │   └── adapters/               # Concrete adapter implementations
│   │   ├── structural/     # Structural graph operations
│   │   ├── sync/           # Cross-service synchronization
│   │   ├── temporal/       # Temporal reasoning
│   │   ├── vector/         # Vector operations
│   │   ├── visualization/  # Graph visualization data
│   │   ├── websocket/      # WebSocket connection management
│   │   └── workspace/      # WorkSpace sandbox system
│   │
│   ├── tools/              # [LEGACY] ADO/git tool wrappers
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   ├── validation/         # Input validation logic
│   └── workers/            # Background worker processes
│
├── scripts/                # Operational scripts (checked into git)
│   ├── seed-*.js           # Database seed scripts (Codex rules, graphs, etc.)
│   ├── migrate-*.js        # Schema and data migration scripts
│   ├── apply-*.js          # Schema application utilities
│   ├── kg-seed-*.cypher    # Cypher knowledge graph seeds
│   ├── docker-entrypoint.sh
│   └── docker-healthcheck.js
│
├── tests/                  # Test suites
│   ├── e2e/                # End-to-end tests
│   ├── integration/        # Integration tests (hit real DBs)
│   ├── tier0/              # Tier 0 epistemic tests
│   ├── tier1/              # Tier 1 hypothesis tests
│   └── *.test.js           # Unit tests
│
├── docs/                   # API-specific documentation
│   ├── GRAPH_TYPE_SYSTEM_REFERENCE.md
│   ├── INEED_GXE_IMPLEMENTATION_REPORT.md
│   ├── SQL_IMPORT_GNN_FEATURE.md
│   └── WORKSPACE_REFERENCE.md
│
├── config/                 # Non-secret configuration files
│
├── Dockerfile              # Production Docker image
├── jest.config.js          # Jest test configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies and scripts
```

### AOPEG Plugin System

Located at `api/src/core/aopeg/plugins/`. Each plugin is a namespace of graph node executors.

| Plugin | Purpose |
|---|---|
| `common/` | Shared executors: AI agent, AI generate, form, HTTP, transform |
| `dialogue/` | Dialogue processing: summarize, extract decisions/entities, search, watcher |
| `ingestion/` | Document ingestion pipeline nodes |
| `rag/` | Retrieval-Augmented Generation: embed, retrieve, rerank |
| `subgraph/` | Subgraph execution: call, map, branch |
| `workflow/` | Workflow control: condition, loop, delay, merge |
| `notification/` | Email, webhook, SSE notification nodes |
| `sql-extraction/` | SQL Server data extraction nodes |

### Runtime Engine Data Flow

```
Node Input Ports  →  NodeRunner.RESOLVE  →  VALIDATE_INPUT
→  TEMPLATE_RESOLUTION  →  EXECUTE  →  VALIDATE_OUTPUT
→  PROPAGATE to downstream nodes  →  Store result
```

Key invariants:
- Port data flattening: `{portId: {data}}` → `{data}` in NodeRunner
- No merge-nodes in DAG (cause skip-cascades)
- Back-edge detection via `_detectBackEdges()` DFS in TopologicalScheduler
- Re-execution pattern: new `RuntimeEngine.execute()` per turn with accumulated state

---

## mcp/ — Frontend

**Entry point:** `mcp/src/main.jsx`  
**Build tool:** Vite  
**Key libraries:** ReactFlow, Zustand, MUI, React Router

```
mcp/
├── src/
│   ├── components/         # Reusable React components
│   │   ├── BackLog/        # BackLog task management UI
│   │   │   └── tabs/       # Tab panels (Dialogues, Tasks, etc.)
│   │   ├── Dialogue/       # Dialogue viewer components
│   │   ├── FlowDesk/       # FlowDesk-specific components
│   │   ├── Graph/          # ReactFlow graph editor components
│   │   └── shared/         # Shared UI primitives
│   │
│   ├── config/             # Frontend configuration
│   │
│   ├── context/            # React context providers
│   │
│   ├── data/               # Static data / fixtures
│   │
│   ├── features/           # Feature modules (self-contained slices)
│   │
│   ├── hooks/              # Custom React hooks
│   │   ├── useDialogue.js
│   │   ├── useWebSocket.js
│   │   └── ...
│   │
│   ├── instances/          # Graph instance management
│   │
│   ├── pages/              # Page-level components (routed views)
│   │   ├── DialoguePage/   # Dialogue viewer (Timeline, Search, Analytics tabs)
│   │   ├── GraphPage/      # Graph editor
│   │   └── ...
│   │
│   ├── services/           # API client services (fetch wrappers)
│   │   └── dialogue.service.js
│   │
│   ├── stores/             # Zustand state stores
│   │
│   ├── test/               # Frontend tests
│   │
│   ├── types/              # TypeScript type definitions
│   │
│   └── utils/              # Utility functions
│
├── public/                 # Static assets
├── Dockerfile              # Frontend Docker image (nginx)
├── nginx.conf.template     # Nginx config template
├── vite.config.js          # Vite build configuration
└── package.json
```

---

## docs/ — Documentation

```
docs/
├── STRUCTURE.md                    # ← this file
├── TUNING_LAB_GUIDE.md             # Tuning Lab user guide
│
├── architecture/                   # Architecture specifications
│   └── NAMESPACE_DISCIPLINE.md     # Namespace isolation rules
│
├── codex/                          # CODEX — project standards and rules
│   ├── CODEX_INDEX.md              # Master index of all Codex documents
│   ├── CHANGELOG.md                # Codex version history
│   ├── CODEX_FORMS.md              # Form definition standards
│   │
│   ├── adr/                        # Architecture Decision Records
│   │   ├── README.md               # ADR index
│   │   ├── ADR-001-memgraph-knowledge-graph.md
│   │   ├── ADR-002-gxe-aopeg-execution.md
│   │   ├── ADR-003-four-namespace-architecture.md
│   │   ├── ADR-004-bitemporal-versioning.md
│   │   ├── ADR-005-polystore-architecture.md
│   │   └── ADR-006-information-types.md
│   │
│   ├── appendices/                 # Reference appendices
│   │   ├── A_JSON_SCHEMAS.md       # JSON schema reference
│   │   ├── B_CYPHER_TEMPLATES.md   # Cypher query templates
│   │   ├── C_ERROR_CODES.md        # Error code registry
│   │   ├── D_MIGRATION_GUIDE.md    # Migration procedures
│   │   ├── E_CODE_REVIEW_CHECKLIST.md
│   │   └── F_PROPOSAL_DATA_STANDARD.md
│   │
│   ├── artifacts/                  # Published Codex versions
│   │   └── CODEX_UN_PROJECTADVISOR_v0.1.3.md
│   │
│   ├── future/                     # Forward-looking design notes
│   │   └── SELF-EVOLUTION.md
│   │
│   ├── manifesto/                  # Foundational principles
│   │   └── AI_MANIFESTO.md
│   │
│   ├── processes/                  # Process definitions
│   │   └── PROCESS-001-assistant-graph-building.md
│   │
│   ├── schemas/                    # Cypher constraint schemas
│   │   └── cypher-constraints.cypher
│   │
│   └── standards/                  # CODEX technical standards
│       ├── CODEX-CATALOG.md        # GXE catalog standard
│       ├── CODEX-CRUD.md           # Graph CRUD operations standard
│       ├── CODEX-DOMAINS.md        # Information type domains
│       ├── CODEX-META.md           # Metadata standard
│       ├── CODEX-NS.md             # Namespace standard
│       ├── CODEX-POLY.md           # Polystore protocol
│       ├── CODEX-VALID.md          # Validation standard
│       └── CODEX-VERSION.md        # Versioning standard
│
└── reports/                        # Audit and analysis reports
    ├── AZURE_ONPREM_SWITCHABILITY_REPORT.md
    ├── DOCKER_MODE_VERIFICATION_REPORT.md
    ├── FLOWDESK_INTEGRATION_REPORT_FOR_TEAM.md
    └── audit-2026-05-11/           # Full codebase audit (May 2026)
        ├── 00-AUDIT-SUMMARY.md
        ├── 01-component-inventory.md
        ├── 02-readiness-matrix.md
        ├── 03-architectural-patterns.md
        ├── 04-data-state.md
        ├── 05-frontend-inventory.md
        ├── 06-api-surface.md
        ├── 07-gaps-and-risks.md
        ├── 08-flowdesk-coupling-inventory.md
        ├── 09-platform-api-draft.md
        ├── 10-critical-fixes-plan.md
        └── 99-RAW-NOTES.md
```

---

## scripts/ — Deployment

Bash scripts for Azure deployment and backup/restore operations. Designed for CI/CD use.

```
scripts/
├── backup-memgraph.sh      # Backup Memgraph data to Azure Blob
├── backup-qdrant.sh        # Backup Qdrant snapshots to Azure Blob
├── build-and-push.sh       # Build Docker images and push to ACR
├── deploy-to-azure.sh      # Full Azure Container Apps deployment
├── provision-azure.sh      # Provision Azure infrastructure (first-time)
├── restore-memgraph.sh     # Restore Memgraph from Azure Blob backup
└── migration-runbook.md    # Step-by-step migration runbook
```

---

## flowdesk-proxy/ — .NET Proxy

An ASP.NET Core 8 SignalR reverse proxy that bridges FlowDesk frontend clients to the GXE runtime API.

```
flowdesk-proxy/
└── FlowDeskProxy/
    ├── Controllers/
    │   └── ChatController.cs       # REST endpoint for chat messages
    ├── Hubs/
    │   └── ChatHub.cs              # SignalR hub for real-time updates
    ├── Middleware/
    │   └── RequestLoggingMiddleware.cs
    ├── Services/
    │   └── GxeApiService.cs        # HTTP client to api/ GXE endpoints
    ├── Program.cs                  # ASP.NET Core startup
    └── FlowDeskProxy.csproj
```

> **Namespace note:** `flowdesk-proxy/` is a FlowDesk client component. Core platform code must not reference FlowDesk internals.

---

## gnn-service/ — Python GNN

A standalone Python microservice providing Graph Neural Network analysis for knowledge graphs.

```
gnn-service/
├── src/
│   ├── api/                # FastAPI REST endpoints (port 5000)
│   ├── training/           # Model training scripts
│   ├── inference/          # Inference pipeline
│   ├── models/             # Model definitions (PyTorch Geometric)
│   └── monitoring/         # Training monitoring utilities
├── config/
│   └── gnn_config.yaml     # Model and training configuration
├── docs/
│   ├── INTEGRATION_GUIDE.md
│   └── nodejs_integration.md
├── Dockerfile
├── Dockerfile.train
└── requirements.txt
```

> **Status:** Experimental. The GNN service is an optional analytical enrichment layer; the core platform operates without it.

---

## packages/ — Shared Libraries

```
packages/
└── unpa-chat/              # @unpa/chat — Embeddable AI chat widget
    ├── src/
    │   ├── components/     # UnpaChat, UnpaChatContext
    │   ├── services/       # Chat API client
    │   ├── styles/         # Component styles
    │   └── utils/          # Utilities
    ├── dist/               # Build output (gitignored)
    └── rollup.config.js    # Rollup bundle configuration
```

---

## docker/ — Infrastructure

```
docker/
└── docker-compose.immutable-graph.yml   # Immutable graph service stack
```

Root-level Docker Compose files:

| File | Purpose |
|---|---|
| `docker-compose.dev.yml` | Local development (hot reload, debug ports) |
| `docker-compose.prod.yml` | Production configuration |
| `docker-compose.yml` | Full stack template (gitignored; use dev or prod) |

---

## Port Map

| Service | Port | Protocol |
|---|---|---|
| api (Express) | 3000 | HTTP / SSE / WebSocket |
| mcp (Vite dev) | 5173 | HTTP |
| mcp (nginx prod) | 80 | HTTP |
| Memgraph Bolt | 7687 | Bolt |
| Memgraph HTTP | 7474 | HTTP |
| Qdrant | 6333 | HTTP + gRPC 6334 |
| Redis | 6379 | TCP |
| PostgreSQL | 5432 | TCP |
| flowdesk-proxy | 5000 | HTTP / WebSocket |
| gnn-service | 5001 | HTTP |
| MCP Server | (stdio/IPC) | MCP protocol |

---

## Key Concepts

### Graph = Program
Business logic is stored as executable AOPEG (Adaptive Object-Property Execution Graph) graphs in Memgraph, not hardcoded in the application. The `RuntimeEngine` retrieves and executes these graphs at runtime.

### AOPEG Node Types
- **Executor nodes:** Invoke registered executors (AI agent, HTTP call, transform, etc.)
- **tref nodes:** Filter/reference nodes — routing only, no computation
- **Condition nodes:** Branching based on port data
- **Subgraph nodes:** Invoke another graph as a subroutine

### Four-Namespace Architecture (ADR-003)
| Namespace | Owner | Purpose |
|---|---|---|
| `ProjectAdvisor` | Platform | Core infrastructure, runtime, APIs |
| `FlowDesk` | Client project | Client-specific graphs and domain logic |
| `WorkSpace` | Platform | Isolated knowledge extraction sandbox |
| `Codex` | Platform | Rules, standards, and governance |

### BackLog System
Task management integrated with the knowledge graph. Tasks (BACKLOG-XXXX) follow a strict lifecycle:
`PENDING → IN_PROGRESS → REVIEW → DONE`  
Agent rules defined in `api/scripts/seed-codex-backlog-agent-rules.js`.

### Sigillum
A versioning system for graph snapshots and branches. Located at `api/src/services/sigillum/`.  
Provides: `seal` (immutable snapshot), `branch` (mutable fork), `version-vector` (conflict detection).

### Polystore
Multi-database architecture: Memgraph (graph), Qdrant (vectors), Redis (cache), PostgreSQL/AGE (relational + property graph). Storage abstraction via `api/src/services/storage/GraphDBPort.js` and `VectorDBPort.js`.

---

## Namespace Rules

> **CRITICAL** — Enforced by Codex and code review

1. `ProjectAdvisor` is the **platform**. Core routes, services, and files must not mention client names.
2. `FlowDesk` is a **client project**. Its code lives under explicitly FlowDesk-labeled paths.
3. Never import FlowDesk modules from core ProjectAdvisor services.
4. Namespace isolation is verified by `api/scripts/seed-codex-ns-discipline-rules.js`.

See `docs/architecture/NAMESPACE_DISCIPLINE.md` for the full specification.

---

## Gitignored Directories (runtime / build)

These directories exist locally but are excluded from version control:

| Path | Content |
|---|---|
| `**/node_modules/` | npm dependencies |
| `**/data/` | Runtime data files |
| `**/raw_data/` | Source documents |
| `**/logs/` | Runtime log files |
| `**/uploads/` | User-uploaded files |
| `**/dist/` | Frontend build output |
| `**/coverage/` | Test coverage reports |
| `**/obj/`, `**/bin/` | .NET build artifacts |
| `.env`, `.env.*` | Secret environment variables |
| `**/service-account-key.json` | Google credentials |

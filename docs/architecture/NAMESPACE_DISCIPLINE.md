# NAMESPACE DISCIPLINE SPECIFICATION
## UN ProjectAdvisor (UNPA) — Architectural Standard

**Version:** 1.0  
**Date:** 2026-05-11  
**Status:** AUTHORITATIVE  
**Owner:** Platform Architecture

---

## Table of Contents

1. [UNPA Architectural Model](#1-unpa-architectural-model)
2. [Namespace Taxonomy](#2-namespace-taxonomy)
3. [Code Organization Rules](#3-code-organization-rules)
4. [Code Classification Criteria](#4-code-classification-criteria)
5. [Knowledge Organization Rules](#5-knowledge-organization-rules)
6. [Platform Contracts](#6-platform-contracts)
7. [Deployment Process](#7-deployment-process)
8. [Cross-Instance Exchange](#8-cross-instance-exchange)
9. [Migration Path](#9-migration-path)
10. [Enforcement Mechanisms](#10-enforcement-mechanisms)

---

## 1. UNPA Architectural Model

### 1.1 UNPA as Self-Evolving Knowledge Factory

UNPA (UN ProjectAdvisor) is not a static application — it is a **self-evolving knowledge factory**. Its defining characteristic is the ability to continuously acquire, structure, reason about, and act upon institutional knowledge in service of a specific operational domain. Each deployment of UNPA learns from its operational context, encodes that learning into graph-executable rules (Codex), and can share that learned structure with other UNPA deployments.

The core principle is **"Graph = Program"**: business logic lives in executable AOPEG graphs stored in Memgraph, not in code files. This means the intelligence of a UNPA instance is distributed between its codebase and its knowledge graph — both must be governed by the same namespace discipline.

### 1.2 Concept of a UNPA Instance

A **UNPA instance** is a complete, self-contained deployment of UNPA that has been enriched for a specific derivative project. An instance consists of:

- The **clean UNPA platform** — universal runtime, graph execution engine, knowledge management, workspace, codex, backlog
- **Instance-specific code** — executors, services, routes, and extractors written specifically for this deployment's domain
- **Knowledge graph enrichment** — AOPEG graphs, Codex rules, entities, and relationships accumulated during operation

The current repository (`UNPA_Ingest`) IS a UNPA instance — the first instance, deployed and enriched for the **FlowDesk** service desk automation project. Universal UNPA code and FlowDesk-specific code are currently mixed together. This specification establishes the discipline to separate them properly.

### 1.3 Multi-Tenancy

UNPA supports two types of multi-tenancy:

**Inside an instance (namespace-based):**
A single running UNPA instance can serve multiple projects simultaneously through namespace separation. Different projects share the same infrastructure (Memgraph, Qdrant, Redis) but their data is partitioned by namespace. Example: a single instance serving both "FlowDesk" and "FieldOps" projects, each with their own namespace, graphs, and knowledge.

**Between instances (physical deployment):**
When a new client or project requires full isolation — separate infrastructure, separate security boundary, separate evolution path — a new physical UNPA instance is deployed by cloning the clean UNPA repository and enriching it for the new context.

| Concern | Inside Instance | Between Instances |
|---|---|---|
| Data isolation | By namespace property | Physical separation |
| Code isolation | By `/instances/{name}/` directory | Separate repository |
| Knowledge exchange | Direct Memgraph queries | Export/import protocol |
| Infrastructure | Shared | Separate |

### 1.4 Instance Lifecycle: Clone → Enrich → Exchange

```
CLEAN UNPA REPOSITORY
        |
        | git clone
        v
NEW INSTANCE REPOSITORY
        |
        | Create /instances/{name}/ directory
        | Initialize namespace in Memgraph
        | Initialize Qdrant collections
        v
ENRICHMENT PHASE (ongoing)
        |
        | BackLog tasks create instance-specific executors
        | AI agents accumulate Codex rules
        | Knowledge graph grows with domain entities
        | AOPEG graphs encode business logic
        v
MATURE INSTANCE
        |
        | Export Codex rules (sanitized)
        | Export graph templates
        | Export extraction patterns
        v
CROSS-INSTANCE EXCHANGE
```

### 1.5 Cross-Instance Knowledge Exchange

Knowledge accumulated in one UNPA instance can be exported and imported into another. This is how UNPA becomes collectively smarter — each deployment contributes to a growing body of reusable Codex rules and graph patterns.

Exchangeable artifacts:
- **Codex rules** — governance and process rules that have proven valuable
- **Graph templates** — AOPEG graph patterns that implement common workflows
- **Executor implementations** — when a plugin solves a universally useful problem
- **Extraction patterns** — named entity and relationship patterns for common domains

Rules for exchange are specified in [Section 8](#8-cross-instance-exchange).

---

## 2. Namespace Taxonomy

### 2.1 Universal Namespaces

These namespaces are present in every clean UNPA deployment. Code and knowledge in these namespaces are part of the UNPA platform itself.

| Namespace | Scope | Primary Location |
|---|---|---|
| `UNPA` | Platform core, fundamental types, entry points | `api/src/core/`, `api/index.js` |
| `CODEX` | Governance rules, principles, blackcodex | `api/src/services/codex/` |
| `GXE` | Graph execution engine (RuntimeEngine, NodeRunner, scheduler) | `api/src/runtime/` |
| `KM` | Knowledge management (extraction, enrichment, promotion) | `api/src/services/extraction/`, `api/src/services/workspace/` |
| `BA` | BackLog and agent workflow | `api/src/services/backlog/` |
| `CORE` | Fundamental platform services (DB adapters, queue, embedding) | `api/src/services/memgraph.service.js`, `api/src/services/qdrant.service.js`, `api/src/services/redis.service.js` |
| `WORKSPACE` | Sandboxed knowledge extraction workspace | `api/src/services/workspace/` |
| `SIGILLUM` | Graph versioning and immutability | `api/src/services/sigillum/`, `api/src/routes/sigillum.route.js` |
| `RAG` | Retrieval-augmented generation pipeline | `api/src/core/aopeg/plugins/rag/` |
| `AOPEG` | AOPEG plugin system, plugin registry, base classes | `api/src/core/aopeg/` |

### 2.2 Instance Namespaces

These namespaces are created at instance deployment time. They do not exist in the clean UNPA repository.

| Namespace Pattern | Description | Example |
|---|---|---|
| `{PROJECT_NAME}` | Root namespace for the project | `FLOWDESK` |
| `{PROJECT_NAME}_CONFIG` | Project configuration entities | `FLOWDESK_CONFIG` |
| `{PROJECT_NAME}_PROCESS` | Business process graphs | `FLOWDESK_PROCESS` |

In the current repository, `FLOWDESK` is the instance namespace.

### 2.3 Cross-Namespace Dependency Rules

| Dependency Direction | Status | Requirement |
|---|---|---|
| Instance → Universal (UNPA, GXE, KM) | ALLOWED | Must use public platform contracts only |
| Instance → Instance (same instance) | ALLOWED with contract | Must use explicit typed cross-namespace edge |
| Universal → Instance | FORBIDDEN | Clean UNPA must have zero references to any project name |
| Instance A → Instance B (different instance) | FORBIDDEN at code level | Exchange only via export/import protocol |

**Transitivity rule:** If namespace A depends on B, and B depends on C, then A implicitly depends on C. This chain must be explicitly documented in the platform contract if it crosses the universal/instance boundary.

---

## 3. Code Organization Rules

### 3.1 Filesystem Structure

```
/api/src/
  /core/                   ← UNPA UNIVERSAL (never contains project names)
    /aopeg/                  ← AOPEG plugin system and registry
      /plugins/
        /common/             ← Universal executors (text processing, control flow)
        /ingestion/          ← Universal ingestion executors
        /rag/                ← Universal RAG executors
        /subgraph/           ← Universal subgraph executors
        /workflow/           ← Universal workflow executors
        /notification/       ← Universal notification executors
        /sql-extraction/     ← Universal SQL extraction executors
        /extraction/         ← Universal knowledge extraction executors
        /dialogue/           ← Universal dialogue management executors
        /validation/         ← Universal validation executors
        # NO instance-specific plugin directories here

  /services/               ← UNPA UNIVERSAL (platform services)
    /codex/                  ← Codex governance service
    /workspace/              ← Workspace service
    /backlog/                ← BackLog service
    /llm/                    ← LLM provider service
    /extraction/             ← Knowledge extraction service
    /graph/                  ← Graph CRUD service
    # etc.
    memgraph.service.js      ← DB adapter (universal)
    qdrant.service.js        ← Vector DB adapter (universal)
    redis.service.js         ← Cache adapter (universal)
    # NO files named after any project

  /platform-api/           ← UNPA UNIVERSAL — public contracts for instances (NEW)
    /graph-execution/        ← Graph Execution API contract
    /graph-catalog/          ← Graph Catalog API contract
    /entity-query/           ← Entity Query API contract
    /template/               ← Template API contract
    /config-store/           ← Config Store API contract
    /plugin-registration/    ← Plugin Registration API contract
    /workspace-extraction/   ← Workspace Extraction API contract
    /tool-set-registration/  ← Tool Set Registration API contract
    /execution-monitoring/   ← Execution Monitoring API contract

  /instances/              ← INSTANCE-SPECIFIC CODE (NEW)
    /{project-name}/         ← one directory per project, name = namespace lowercase
      /executors/            ← project-specific AOPEG executors (moved from plugins/flowdesk/)
      /services/             ← project-specific services (moved from services/flowdesk/)
      /routes/               ← project-specific HTTP endpoints
      /extraction/           ← project-specific knowledge extractors
      /config/               ← project-specific configuration loaders
      /scripts/              ← project-specific seed/utility scripts
      index.js               ← plugin manifest (registers executors, routes, tools)

/api/
  /routes/                 ← UNPA UNIVERSAL routes only (no project-specific routes)
  /scripts/
    seed-codex-*.js          ← universal Codex seed scripts
    # project-specific scripts → /instances/{name}/scripts/

/mcp/src/
  /pages/                  ← UNPA UNIVERSAL UI pages
  /components/             ← UNPA UNIVERSAL components
  /hooks/                  ← UNPA UNIVERSAL hooks
  /services/               ← UNPA UNIVERSAL frontend services
  /instances/              ← INSTANCE-SPECIFIC UI (NEW)
    /{project-name}/
      /pages/                ← project-specific pages (e.g., FlowDeskPage.jsx → here)
      /components/           ← project-specific components
      /hooks/                ← project-specific hooks
```

### 3.2 Naming Rules

1. **Directory name = namespace in lowercase.** The directory `/instances/flowdesk/` corresponds to namespace `FLOWDESK`. No exceptions.

2. **Files in universal directories must not contain project names in their filename.** `flowdesk.route.js` and `flowdesk-config.route.js` belong in `/instances/flowdesk/routes/`, not in `/api/src/routes/`.

3. **Internal imports must respect the boundary.** Files in `/core/` or `/services/` must never `require()` or `import` from `/instances/`.

4. **The instance `index.js` (plugin manifest)** is the single registration point. It exports an object with the plugin's executors, routes, and tools. The platform discovers instances by scanning `/instances/*/index.js` at startup.

### 3.3 Instance Discovery

UNPA discovers instance code at startup via the Plugin Registration mechanism:

```javascript
// api/src/instances/flowdesk/index.js  (example)
module.exports = {
  namespace: 'FLOWDESK',
  executors: require('./executors'),
  routes: require('./routes'),
  tools: require('./tools'),
  onRegister: async (platform) => {
    // Called by platform after instance is registered
    // Use platform contracts here (never direct DB access)
  }
};
```

The platform startup manager scans `api/src/instances/*/index.js` and calls Plugin Registration API for each manifest found. This replaces the current hardcoded plugin loading in `pluginRegistry`.

---

## 4. Code Classification Criteria

### 4.1 UNIVERSAL UNPA Code

Code belongs in `/api/src/core/`, `/api/src/services/`, or `/api/src/platform-api/` if it meets ALL of the following:

- Contains NO references to a specific project name (no "flowdesk", "FlowDesk", "fd_", etc.)
- Functions correctly and makes sense for ANY project deployed on UNPA
- Implements a fundamental platform capability (graph execution, knowledge extraction, versioning, etc.)
- Has no hardcoded business logic from any specific domain
- Its tests do not require project-specific test fixtures

**Current examples of correctly classified universal code:**
- `api/src/runtime/RuntimeEngine.js` — universal graph execution engine
- `api/src/runtime/execution/NodeRunner.js` — universal node runner
- `api/src/runtime/scheduler/TopologicalScheduler.js` — universal DAG scheduler
- `api/src/services/workspace/workspace.service.js` — universal workspace management
- `api/src/services/codex/codex.service.js` — universal governance rules
- `api/src/services/backlog/` — universal BackLog system
- `api/src/core/aopeg/plugins/rag/` — universal RAG pipeline
- `api/src/core/aopeg/plugins/common/` — universal utility executors
- `api/src/core/aopeg/plugins/dialogue/` — universal dialogue management

### 4.2 PROJECT-SPECIFIC Code

Code belongs in `/api/src/instances/{project}/` if ANY of the following is true:

- Implements business logic that is semantically specific to one project's domain
- Contains domain-specific terminology that would be meaningless in another context
- Was created to fulfill a BackLog task scoped to a specific project
- References project-specific configuration, entities, or workflow patterns
- Makes no functional sense outside this project's operational context

**Current examples of misclassified project-specific code (must be migrated):**
- `api/src/core/aopeg/plugins/flowdesk/` — all 16 FlowDesk AOPEG executors belong in `/instances/flowdesk/executors/`
- `api/src/services/flowdesk/` — FlowDesk graph loader, dialog session, workflow runner belong in `/instances/flowdesk/services/`
- `api/src/routes/flowdesk.route.js` — FlowDesk REST endpoints belong in `/instances/flowdesk/routes/`
- `api/src/routes/flowdesk-config.route.js` — FlowDesk configuration endpoint belongs in `/instances/flowdesk/routes/`
- `mcp/src/pages/FlowDeskPage.jsx` — FlowDesk UI page belongs in `/mcp/src/instances/flowdesk/pages/`
- `mcp/src/pages/FlowDeskConfigPage.jsx` — FlowDesk config UI belongs in `/mcp/src/instances/flowdesk/pages/`
- `api/scripts/create-flowdesk-graph-v3.js` — FlowDesk graph creation scripts belong in `/instances/flowdesk/scripts/`

### 4.3 HYBRID Code

Code is hybrid if it contains both universal and project-specific parts mixed together. Hybrid code MUST be refactored — it cannot stay as-is.

**Refactoring rule:** Extract the universal logic into the appropriate `/core/` or `/services/` location, then create a thin project-specific wrapper in `/instances/{project}/` that uses the platform contract to access the universal functionality.

**Current examples of hybrid code requiring refactoring:**
- `api/src/services/startup/StartupManager.js` — universal startup logic mixed with hardcoded FlowDesk plugin loading. Universal part stays, FlowDesk registration moves to plugin manifest.
- `api/index.js` — universal Express setup mixed with FlowDesk-specific route mounting. Universal route mounting stays, FlowDesk routes discovered via instance manifest.
- Several controllers in `api/src/controllers/` that mix platform-level concerns with FlowDesk-specific response handling.

### 4.4 Decision Table

When classifying code, ask these questions in order:

| Question | YES answer | NO answer |
|---|---|---|
| Does the filename contain a project name? | Likely project-specific | Continue to next question |
| Does the file import from `plugins/flowdesk`? | Project-specific | Continue |
| Does the file use FlowDesk domain vocabulary (ticket, SLA, service desk, ITSM)? | Likely project-specific | Continue |
| Would this code make sense in a UNPA deployed for healthcare? | Universal candidate | Project-specific |
| Is there an existing platform service that does the same thing? | Hybrid — needs refactoring | Likely new universal capability |

---

## 5. Knowledge Organization Rules

### 5.1 Memgraph Namespace Rules

**Rule MG-001:** Every node created in Memgraph MUST have a `namespace` property. Nodes without namespace are rejected at the application layer (not at DB level — enforcement is in service layer).

```cypher
-- CORRECT
CREATE (n:KnowledgeQuantum {
  namespace: 'FLOWDESK',
  title: 'SLA escalation policy',
  ...
})

-- VIOLATION — missing namespace
CREATE (n:BusinessRule {
  title: 'approval threshold'
  -- no namespace property
})
```

**Rule MG-002:** Every edge between nodes in different namespaces MUST use a typed cross-namespace edge label and include a `crossNamespace: true` property.

```cypher
-- CORRECT cross-namespace edge
MATCH (a {namespace: 'FLOWDESK'}), (b {namespace: 'UNPA'})
CREATE (a)-[:USES_PLATFORM_CAPABILITY {crossNamespace: true}]->(b)

-- VIOLATION — implicit cross-namespace edge with generic label
MATCH (a {namespace: 'FLOWDESK'}), (b {namespace: 'UNPA'})
CREATE (a)-[:RELATES_TO]->(b)
```

**Rule MG-003:** Queries that intentionally span namespaces MUST include a comment explaining the business reason.

```cypher
-- Intentional cross-namespace: FLOWDESK workflow resolves entities via UNPA KM
MATCH (w:Workflow {namespace: 'FLOWDESK'})-[:QUERIES]->(e:EntityType {namespace: 'UNPA'})
RETURN w, e
```

**Rule MG-004:** Namespace names in Memgraph use UPPERCASE (e.g., `FLOWDESK`, `UNPA`, `GXE`). This is consistent with the Codex rule namespace convention.

### 5.2 Qdrant Collection Naming Rules

**Rule QD-001:** Every Qdrant collection name MUST follow the pattern `{namespace_lowercase}_{purpose}`.

| Collection Name Pattern | Namespace | Purpose |
|---|---|---|
| `unpa_entities` | UNPA | Core platform entity embeddings |
| `unpa_codex` | UNPA | Codex rule embeddings for semantic search |
| `flowdesk_services` | FLOWDESK | FlowDesk service category embeddings |
| `flowdesk_kb` | FLOWDESK | FlowDesk knowledge base articles |
| `workspace_{uuid}` | WORKSPACE | Per-workspace extraction scratch space |
| `gxe_graph_templates` | GXE | Graph template semantic index |

**Rule QD-002:** Only the platform infrastructure layer (in `api/src/services/qdrant.service.js`) may create or delete collections. Instance code accesses collections through the Workspace Extraction API or the Entity Query API.

**Rule QD-003:** The `embeddings_unified` collection serves as the Global Knowledge Base. Only the `PromotionSagaService` writes to it. Instance code reads from it through the KM Query API.

### 5.3 Codex Namespace Rules

**Rule CX-001:** Every Codex rule MUST have a `namespace` property set to the owning namespace (`UNPA`, `GXE`, `FLOWDESK`, etc.).

**Rule CX-002:** Rules in the `UNPA` namespace are universal. They are exported with every clean UNPA clone.

**Rule CX-003:** Rules in an instance namespace (e.g., `FLOWDESK`) are instance-specific. They are NOT included in a clean UNPA export.

**Rule CX-004:** At new instance deployment, only `UNPA` namespace Codex rules are imported. Instance-specific rules are built up through the operation of that instance.

**Rule CX-005:** Codex rules that began as instance-specific but are determined to be universally applicable CAN be promoted to the `UNPA` namespace via the cross-instance exchange process (see Section 8).

---

## 6. Platform Contracts

### 6.1 Principle

Instance code accesses UNPA capabilities exclusively through **public platform contracts** — defined interfaces in `/api/src/platform-api/`. Direct access to internal services, database connections, or runtime internals is forbidden.

This boundary ensures:
- Instance code is portable (can be transplanted to another UNPA instance)
- Platform internals can evolve without breaking instances
- Security boundary is enforced at the contract layer
- Testing is clean — instances can be tested with mock platform contracts

### 6.2 Public Contracts

Instance code MAY use the following platform contracts:

**Contract 1: Graph Execution API**
- Execute a named graph by namespace + name
- Provide input data, receive output + execution ID
- Pause / resume multi-turn conversations
- Subscribe to execution events (SSE)

**Contract 2: Graph Catalog API**
- CRUD for graph definitions scoped to instance namespace
- List graphs by namespace, type, status
- Import/export graph definitions

**Contract 3: Entity Query API**
- Look up standard entities: User, Location, OrgUnit, ServiceCategory
- Search entities by type + query text
- Resolve entity by external ID (ADO, ServiceNow, etc.)

**Contract 4: Template API**
- Fetch notification templates by namespace + key
- Render templates with variable substitution
- CRUD for templates scoped to instance namespace

**Contract 5: Config Store API**
- Read/write configuration values scoped to instance namespace
- Support for typed values (string, number, boolean, JSON)
- Watch for config changes

**Contract 6: Plugin Registration API**
- Register a set of AOPEG executors with the platform
- Executors are discovered and made available in the graph editor

**Contract 7: Workspace Extraction API**
- Submit text or structured data to the workspace extraction pipeline
- Retrieve extracted entities, relationships, and drafts
- Promote approved drafts to the global knowledge base

**Contract 8: Tool Set Registration API**
- Register a set of tools with the AI agent framework
- Tools become available to agents operating in this namespace's context

**Contract 9: Execution Monitoring API**
- Query active executions by namespace
- Pause, resume, or cancel running graph executions
- Read execution logs and node outputs

### 6.3 Forbidden Access Patterns

Instance code MUST NOT:

- Import `memgraph.service.js`, `qdrant.service.js`, or `redis.service.js` directly
- Import `RuntimeEngine.js`, `NodeRunner.js`, or `TopologicalScheduler.js` directly
- Import `api/src/core/aopeg/index` or `pluginRegistry` directly
- Create its own database connection pools or HTTP clients that bypass the platform
- Write to Qdrant collections not owned by its namespace
- Create Memgraph nodes without a namespace property
- Call internal UNPA services not exposed through platform contracts

**If instance code needs a capability not available in the public contracts, the correct response is to create a new contract in `/api/src/platform-api/`, not to add direct access.** This keeps the platform contract surface visible and governable.

---

## 7. Deployment Process

The following is the step-by-step process for deploying a new UNPA instance for a new project (e.g., "FieldOps"):

**Step 1: Clone clean UNPA**
```
git clone https://github.com/un/unpa-clean.git unpa-fieldops
cd unpa-fieldops
```
The clean repository contains zero files in `/api/src/instances/` and zero instance namespaces in the database.

**Step 2: Configure the instance**
```
cp .env.example .env
# Set DB connections, API keys, instance name
```

**Step 3: Bootstrap the platform**
```
npm run bootstrap
# Creates schema in Memgraph
# Creates UNPA-namespaced Qdrant collections
# Imports universal Codex rules (UNPA namespace only)
```

**Step 4: Create project namespace directory**
```
mkdir -p api/src/instances/fieldops/{executors,services,routes,extraction,config,scripts}
touch api/src/instances/fieldops/index.js
```

**Step 5: Initialize project namespace in Memgraph and Qdrant**
```
node api/src/instances/fieldops/scripts/init-namespace.js
# Creates Memgraph namespace root node
# Creates fieldops_* Qdrant collections
```

**Step 6: Optionally import knowledge from other instances**
```
node api/scripts/import-codex-rules.js --from=unpa-flowdesk-export.json --namespace=FIELDOPS
node api/scripts/import-graph-templates.js --from=service-desk-templates.json
```
See Section 8 for import/export rules.

**Step 7: Begin instance enrichment**

From this point forward, BackLog tasks drive the enrichment:
- Agent creates BackLog tasks for instance-specific executors
- Executors are placed in `/api/src/instances/fieldops/executors/`
- Graphs encoding business logic are created via the Graph Catalog API
- Codex rules are accumulated under the `FIELDOPS` namespace

---

## 8. Cross-Instance Exchange

### 8.1 Exportable Artifacts

The following artifacts can be exported from one UNPA instance and imported into another:

| Artifact | Export Mechanism | Notes |
|---|---|---|
| Codex rules | JSON export with namespace mapping | Must be sanitized of instance-specific references |
| Graph templates | Graph definition JSON | Only graphs marked `exportable: true` |
| Executor implementations | Source files | Only if no platform-contract violation |
| Extraction patterns | Pattern definition JSON | Named entity and relationship patterns |
| Best practices documentation | Markdown + structured JSON | Human-readable and machine-parseable |

### 8.2 Export Process

1. **Mark as exportable**: Set `exportable: true` on the artifact in Memgraph or the source file
2. **Sanitize**: Remove or generalize all instance-specific references
   - Replace hardcoded entity IDs with variables
   - Replace instance namespace names with `{TARGET_NAMESPACE}` placeholder
   - Remove environment-specific configuration
3. **Version**: Assign semantic version and document dependencies
4. **Document**: Write summary of what the artifact does and what platform contract version it requires

### 8.3 Import Process

1. **Compatibility check**: Verify that the artifact requires platform contract version compatible with target instance
2. **Conflict resolution**: If an artifact with the same ID already exists, apply merge strategy (OVERRIDE, SKIP, or MERGE)
3. **Namespace mapping**: Map `{TARGET_NAMESPACE}` placeholders to the target instance's namespace
4. **Promote to UNPA namespace (optional)**: If the artifact is determined to be universally applicable, promote it from instance namespace to `UNPA` namespace and include it in clean UNPA exports

### 8.4 Namespace Mapping During Import

When importing Codex rules from another instance:
- Rules originally in `FLOWDESK` namespace are imported into the target instance's namespace (e.g., `FIELDOPS`)
- Rules originally in `UNPA` namespace remain in `UNPA` namespace — they are already universal
- The import system records the provenance: `importedFrom: 'unpa-flowdesk', originalNamespace: 'FLOWDESK', importedAt: '2026-05-11'`

---

## 9. Migration Path

### 9.1 Guiding Principle

**The system must work correctly at every step of the migration.** There is no acceptable "big bang" move where the system is offline or broken for an extended period. Each migration step is a self-contained refactoring that leaves the system in a valid state.

### 9.2 Migration Phases

**Phase 0: Classification (prerequisite)**

Before moving any code, every file in the repository must be classified as UNIVERSAL, PROJECT-SPECIFIC, or HYBRID. This classification is recorded in a migration manifest (`api/audit-2026-05-11/migration-manifest.json`). No code moves during this phase.

**Phase 1: Create Structure (no functional change)**

1. Create `/api/src/instances/flowdesk/` directory tree
2. Create `/mcp/src/instances/flowdesk/` directory tree
3. Create `/api/src/platform-api/` directory tree with stub files
4. Create `api/src/instances/flowdesk/index.js` plugin manifest (initially empty)

No code has moved. System continues to work from its original locations.

**Phase 2: Move FlowDesk AOPEG Executors**

1. Copy (not move) each executor from `api/src/core/aopeg/plugins/flowdesk/executors/` to `api/src/instances/flowdesk/executors/`
2. Update all imports to reference new location
3. Verify tests pass
4. Remove old location

One executor at a time. After each executor, run the test suite.

Target: `api/src/instances/flowdesk/executors/` (18 executors)
Source: `api/src/core/aopeg/plugins/flowdesk/executors/`

**Phase 3: Move FlowDesk Services**

1. Move files from `api/src/services/flowdesk/` to `api/src/instances/flowdesk/services/`
2. Update all imports
3. Verify tests pass

Target files:
- `config-loader.service.js`, `dialog-session.js`, `workflow-runner.js`
- `graph-loader.js`, `runtime-chat.js`, `semantic-search.js`
- `graph-routing.js`, `graph-schema.js`, `gxe-manager-bridge.js`
- `kb-runtime-bridge.js`, `keyword-filter.js`, `qdrant-upload.js`

**Phase 4: Move FlowDesk Routes**

1. Move `api/src/routes/flowdesk.route.js` to `api/src/instances/flowdesk/routes/`
2. Move `api/src/routes/flowdesk-config.route.js` to `api/src/instances/flowdesk/routes/`
3. Update route registration in `api/index.js` to use instance manifest discovery
4. Verify all API endpoints respond correctly

**Phase 5: Move FlowDesk UI**

1. Move `mcp/src/pages/FlowDeskPage.jsx` to `mcp/src/instances/flowdesk/pages/`
2. Move `mcp/src/pages/FlowDeskConfigPage.jsx` to `mcp/src/instances/flowdesk/pages/`
3. Update router in `mcp/src/App.jsx` to use instance UI discovery
4. Verify UI renders correctly

**Phase 6: Refactor Hybrid Files**

1. Refactor `api/src/services/startup/StartupManager.js` — remove hardcoded FlowDesk plugin loading, replace with dynamic instance manifest scanning
2. Refactor `api/index.js` — remove hardcoded FlowDesk route mounting
3. Any remaining files with FlowDesk references in universal locations

**Phase 7: Validate Zero References**

Run automated check: confirm that no file in `/api/src/core/`, `/api/src/services/`, `/api/src/routes/`, or `/mcp/src/` (excluding `/instances/`) contains the string "flowdesk" or "FlowDesk".

### 9.3 Rollback Strategy

Each phase can be rolled back by reverting the relevant commits. Since Phase N does not delete the old location until tests pass, a rollback means reverting the import update and the file deletion — the original file remains available.

---

## 10. Enforcement Mechanisms

### 10.1 Codex NS-Series Rules

Formal governance rules for namespace discipline are seeded via `api/scripts/seed-codex-ns-discipline-rules.js`. These rules are in the `UNPA` namespace and apply to all UNPA instances. Agents executing BackLog tasks are expected to check applicable NS-series rules before making structural changes. See the seed script for the complete rule set (NS-001 through NS-015).

### 10.2 Linting and Static Checks

An ESLint rule or custom script should verify:

1. No file in `/api/src/core/**` imports from `/api/src/instances/**`
2. No file in `/api/src/services/**` imports from `/api/src/instances/**`
3. No file in universal directories contains known project namespace strings
4. Every file in `/api/src/instances/{name}/**` has a corresponding namespace declaration at the top

Implementation: `api/scripts/check-namespace-discipline.js` — runs as `npm run lint:namespaces`.

### 10.3 Code Review Checklist

During every PR review, the reviewer MUST check:

- [ ] New files in the correct directory (universal vs instance)
- [ ] No project name in a universal file path or import
- [ ] No direct DB access from instance code
- [ ] No direct import of internal UNPA services from instance code
- [ ] All new Memgraph nodes include `namespace` property
- [ ] New Qdrant collections follow `{namespace}_{purpose}` naming
- [ ] New Codex rules have the correct `namespace` property

### 10.4 CI Checks

The CI pipeline MUST run `npm run lint:namespaces` and MUST block PRs where:

- Any file in universal directories imports from instance directories
- Any universal file contains project namespace strings
- Any Memgraph creation statement is missing the namespace property

Implementation: add a step to `.github/workflows/ci.yml` (or equivalent).

### 10.5 Documentation and Training

- This document (`NAMESPACE_DISCIPLINE.md`) is the authoritative reference
- New agents working on BackLog tasks MUST be directed to load this document as part of task context
- The Codex NS-series rules encode the most critical constraints in machine-readable form for agent compliance
- Architecture review for new instances must confirm that instance manifest and directory structure are correctly created before enrichment begins

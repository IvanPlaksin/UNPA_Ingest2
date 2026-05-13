# Platform Public API — Draft Specification
**Audit date:** 2026-05-11
**Author:** Claude Code audit pass
**Purpose:** Define the 9 public contracts required to move FlowDesk from
`api/src/services/flowdesk/` and `api/src/core/aopeg/plugins/flowdesk/` to
`/consumers/flowdesk/`, severing all deep imports into platform internals.

---

## Contract 1: Graph Execution API

### Current State

Two separate paths exist today, both bypassing any REST layer.

`api/src/services/flowdesk/kb-runtime-bridge.js` constructs a `RuntimeEngine`
singleton directly:
```js
const { RuntimeEngine } = require('../../runtime/RuntimeEngine');
const { createMcpCompatibleRegistry } = require('../../runtime/integration/AOPEGAdapter');
_runtime = new RuntimeEngine(createMcpCompatibleRegistry());
```
It then calls `runtime.execute(dag, input, config)` directly for every named
graph (`flowdesk.classify.pipeline`, `flowdesk.sla.decision`,
`flowdesk.route.queue`, `flowdesk.sla.escalation`, `flowdesk.intake.enhanced`).

`api/src/services/flowdesk/runtime-chat.js` also bootstraps AOPEG from scratch:
```js
const aopegModule = require('../../core/aopeg/index');
await aopegModule.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
const { AOPEGAdapter } = require('../../runtime/integration');
const adapter = new AOPEGAdapter(aopegModule.pluginRegistry);
_mcpRegistry = adapter.createMcpCompatibleRegistry();
```
This duplicates the same initialization that `gxeManager.route.js` already
performs on first request.

Multi-turn pause/resume state is managed by `runtime-chat.js` using a
module-level `Map` (`sessions`) — fully ephemeral, not visible to
`gxeManager.route.js`.

### Proposed Public Interface

**REST** — reuse the existing `GxeManager` REST surface at
`/api/v1/gxe-manager/executions` with one added convenience endpoint for
synchronous short-lived runs and a session resume endpoint.

The GxeManager route already exposes:
- `POST /executions` — launch with any `graphId`
- `GET  /executions/:id` — status
- `GET  /executions/:id/result` — final output
- `POST /executions/:id/resume` — continue a paused execution
- `POST /executions/:id/cancel`

What is missing for FlowDesk dialog use-cases:
- A synchronous execute-and-wait endpoint (dialog turns must return within the
  HTTP request for session-based UIs).
- A session-scoped resume that merges user input into accumulated state.

### Interface Specification

```
POST /api/v1/gxe-manager/executions/sync
Request body:
{
  "graphName": "flowdesk.intake.enhanced",   // resolved via Graph Catalog by name
  "inputPayload": { "userMessage": "...", "sessionId": "abc123" },
  "timeoutMs": 15000,                         // max wait before returning WAITING status
  "executionId"?: "abc123-T3"                // optional, for turn continuity
}
Response 200:
{
  "executionId": "abc123-T3",
  "status": "COMPLETED" | "WAITING_FOR_INPUT" | "FAILED",
  "result": { ... },                         // present when COMPLETED
  "waitingNode": { "nodeId": "n7", "prompt": "...", "choices": [...] },  // present when WAITING
  "resumeToken": "uuid"                       // present when WAITING
}

POST /api/v1/gxe-manager/executions/:id/resume
Request body:
{
  "payload": { "userInput": "Brindisi" },
  "resumeToken": "uuid"
}
Response 200: same shape as sync response
```

Named-graph resolution (FlowDesk uses names, not catalog IDs) requires the
`/sync` handler to perform a Graph Catalog lookup by name before delegating to
`manager.launch()`. The existing `GET /api/v1/graph-catalog?namespace=FLOWDESK&search=<name>`
already supports this query.

### Internal Dependencies

- `api/src/gxe-manager/GxeManagerService.js` — `launch()`, `resume()`
- `api/src/runtime/RuntimeEngine.js` — execution engine
- `api/src/runtime/integration/AOPEGAdapter.js` — MCP registry bridge
- `api/src/services/graphCatalog.service.js` — name-to-ID resolution
- `api/src/services/redis.service.js` — execution state persistence (via
  `ExecutionRegistry`)

### Implementation Complexity

**Medium.** The `/sync` endpoint is new code but thin: lookup graph name →
call `manager.launch()` → poll or await result with timeout → return. The
larger risk is that `GxeManagerService.launch()` currently schedules
asynchronously; a synchronous wrapper needs careful timeout handling to avoid
holding HTTP connections open for slow graphs.

The session-scoped state accumulation (currently done in `runtime-chat.js`
sessions `Map`) needs to move either into `ExecutionRegistry` (already Redis-
backed) or into the caller (FlowDesk maintains `sessionId → executionId`
mapping on its own side).

### Criticality for FlowDesk

**Must Have.** Every FlowDesk dialog turn, classification, SLA lookup, and
routing decision goes through `executeNamedGraph()`. Without this contract
FlowDesk cannot function at all.

### Migration Path

1. Replace `kb-runtime-bridge.executeNamedGraph()` calls with HTTP calls to
   `POST /api/v1/gxe-manager/executions/sync`.
2. Replace `runtime-chat.js` session loop with HTTP calls that include
   `sessionId` in `inputPayload`; map `sessionId → executionId` locally.
3. Remove `kb-runtime-bridge.js`, `runtime-chat.js`, and `graph-hot-reload.service.js`
   from the FlowDesk source tree.

---

## Contract 2: Graph Catalog API

### Current State

`api/src/services/flowdesk/graph-loader.js` imports `graphCatalogService`
directly and calls `graphCatalogService.listGraphs({ namespace: 'FLOWDESK', search: ... })`
and `graphCatalogService.getGraphById(entryId)`.

`api/src/services/flowdesk/graph-loader-kb.service.js` does the same with a
more complete implementation (cache, DAG conversion, file fallback).

Both loaders also read JSON files from
`api/src/services/flowdesk/graphs/*.graph.json` as a fallback.

### Proposed Public Interface

**REST — existing route is sufficient with two additions.**

The route at `api/src/routes/graphCatalog.route.js` already exposes:
- `GET /api/v1/graph-catalog` — list with `namespace`, `type`, `search`, `tags` filters
- `GET /api/v1/graph-catalog/:entryId` — get full graph by catalog ID
- `POST /api/v1/graph-catalog` — create
- `PUT  /api/v1/graph-catalog/:entryId` — update
- `DELETE /api/v1/graph-catalog/:entryId` — delete

What is missing:
1. `GET /api/v1/graph-catalog/by-name?name=flowdesk.classify.pipeline&namespace=FLOWDESK` — name-based lookup (FlowDesk uses names, not IDs)
2. `GET /api/v1/graph-catalog/:entryId/dag` — return the graph pre-converted to RuntimeEngine DAG format, avoiding duplication of `convertGraphToDag()` logic in every consumer

### Interface Specification

```
GET /api/v1/graph-catalog/by-name
Query params: name (required), namespace (optional, default FLOWDESK)
Response 200:
{
  "success": true,
  "entry": {
    "entryId": "uuid",
    "name": "flowdesk.classify.pipeline",
    "namespace": "FLOWDESK",
    "type": "DIALOG",
    "currentVersion": 3,
    "nodes": [...],
    "edges": [...]
  }
}
Response 404: { "success": false, "error": "Graph not found" }

GET /api/v1/graph-catalog/:entryId/dag
Response 200:
{
  "success": true,
  "dag": {
    "nodes": [{ "id": "...", "tool": "workflow.start", "parameters": {...} }],
    "edges": [{ "sourceNodeId": "...", "targetNodeId": "..." }]
  }
}
```

### Internal Dependencies

- `api/src/services/graphCatalog.service.js` — `listGraphs()`, `getGraphById()`
- DAG conversion logic currently in `graph-loader-kb.service.js:convertGraphToDag()` — move into `graphCatalogService` or a shared utility

### Implementation Complexity

**Low.** The `/by-name` endpoint is a one-liner wrapper around an existing
`listGraphs()` call. The `/dag` endpoint requires extracting `convertGraphToDag()`
from `graph-loader-kb.service.js` (100 lines) into the catalog service.

### Criticality for FlowDesk

**Must Have.** Graph loading is the prerequisite for all execution.

### Migration Path

1. Replace `graphLoader.loadGraph(name)` calls with `GET /api/v1/graph-catalog/by-name?name=<name>&namespace=FLOWDESK`.
2. Replace `graphLoader.resolveSubgraphs()` with `GET /api/v1/graph-catalog/:id/dag`.
3. Replace file-based fallback with a catalog-seeding step that pre-loads all JSON graph files during startup.

---

## Contract 3: Entity Query API

### Current State

`api/src/services/flowdesk/graph-routing.js` creates its own `neo4j-driver`
connection pool:
```js
const neo4j = require('neo4j-driver');
const { MEMGRAPH_CONFIG } = require('./import-config');
driver = neo4j.driver(MEMGRAPH_CONFIG.uri, neo4j.auth.basic(...), { maxConnectionPoolSize: 5 });
```
This is a second independent connection pool, separate from `memgraph.service`.

It runs 5 distinct query patterns:
1. User context lookup — User → OrganizationUnit → Location → Region
2. Service handler resolution — ServiceCatalogItem → HANDLED_BY → OrganizationUnit with scope matching
3. Services by domain — ServiceCatalogItem hierarchy traversal
4. Full-text service search — name/description/code CONTAINS filter
5. Service domain list — L1 ServiceCatalogItem with service counts

`api/src/core/aopeg/plugins/flowdesk/executors/find-user.executor.js` and
`search-location.executor.js` also open their own `neo4j-driver` sessions
directly rather than using `memgraph.service`.

### Proposed Public Interface

**REST** — new resource group under `/api/v1/entities`.

### Interface Specification

```
GET /api/v1/entities/users/:userId/context
Response 200:
{
  "userId": "uuid",
  "email": "...",
  "displayName": "...",
  "isVip": false,
  "orgUnit": { "code": "DPPA/OSS", "name": "...", "level": 3, "hierarchyPath": "/UN/DPPA/OSS" },
  "location": { "dutyStation": "New York", "country": "USA", "region": "Americas" },
  "roles": ["staff", "focal-point"]
}

GET /api/v1/entities/users/search?q=Alice+Smith&limit=10
Response 200:
{
  "users": [{ "id": "uuid", "displayName": "Alice Smith", "email": "...", "orgUnit": "DPPA/OSS" }]
}

GET /api/v1/entities/locations/search?q=Brindisi&limit=10
Response 200:
{
  "locations": [{ "id": "uuid", "name": "Brindisi", "locationType": "DutyStation", "country": "Italy", "region": "Europe" }]
}

GET /api/v1/entities/services?domain=IT&requestable=true
Response 200:
{
  "services": [{ "code": "IT-HW-LAP", "name": "Laptop Request", "slaHours": 48, "approvalRequired": false, "handler": { "code": "IT/ITSM", "name": "ITSM Team" } }]
}

GET /api/v1/entities/services/search?q=laptop&limit=20
Response 200: { "services": [...] }

GET /api/v1/entities/services/resolve
Request body: { "userId": "uuid", "serviceCode": "IT-HW-LAP" }
Response 200:
{
  "service": { "code": "...", "name": "...", "slaHours": 48, "gxeGraphId": "uuid" },
  "handler": { "code": "IT-ITSM-NY", "name": "NY ITSM Team", "scope": "mission" },
  "userContext": { "orgUnit": "DPPA/OSS", "dutyStation": "New York", ... }
}
```

### Internal Dependencies

- `api/src/services/memgraph.service.js` — all queries migrate to use `runQuery()`
- `memgraph.service` already holds the shared connection pool

### Implementation Complexity

**Medium.** The Cypher queries are already written in `graph-routing.js` and the
two executor files — they simply need wiring into route handlers that use
`memgraph.service` instead of a private driver. The scope-priority matching
logic in `resolveServiceHandler()` (~40 lines) is non-trivial but self-contained.

### Criticality for FlowDesk

**Must Have.** User context resolution is the first step in every dialog
(CheckLocation executor), and service routing drives ticket creation.

### Migration Path

1. Delete the `neo4j-driver` instantiation in `graph-routing.js`, `find-user.executor.js`,
   and `search-location.executor.js`.
2. Replace direct `runRead()` calls with HTTP calls to `/api/v1/entities/*`.
3. `graph-routing.js` can be deleted entirely once executors use the REST API.

---

## Contract 4: Template API

### Current State

`api/src/services/flowdesk/template-store.js` imports `memgraph.service`
directly:
```js
_mg = require('../memgraph.service');
const rows = await mg().runQuery(`
  MATCH (t:NotificationTemplate)
  WHERE t.namespace = 'FLOWDESK'
  RETURN t.key AS key, t.body AS body
`);
```
Templates are cached in a module-level `Map`. The `render(key, vars)` function
does `{{varName}}` interpolation. This module is consumed by multiple FlowDesk
executors (`search-location.executor.js`, `find-user.executor.js`, etc.) as a
direct `require('../../../../../services/flowdesk/template-store')`.

### Proposed Public Interface

**REST** — lightweight template resource. Template rendering can stay client-
side (the interpolation logic is trivial) or be done server-side.

### Interface Specification

```
GET /api/v1/templates/:namespace/:key
Path params: namespace (e.g. FLOWDESK), key (e.g. find_user.not_found)
Response 200:
{
  "key": "find_user.not_found",
  "namespace": "FLOWDESK",
  "body": "I could not find a staff member matching '{{searchTerm}}'. Please try a different name."
}
Response 404: { "error": "Template not found" }

GET /api/v1/templates/:namespace
Query params: prefix (optional, filter keys by prefix)
Response 200:
{
  "templates": [{ "key": "...", "body": "..." }]
}

POST /api/v1/templates/:namespace/:key/render
Request body: { "vars": { "searchTerm": "Alice" } }
Response 200:
{
  "rendered": "I could not find a staff member matching 'Alice'. Please try a different name."
}

POST /api/v1/templates/:namespace/:key/invalidate  (admin/internal)
Response 200: { "ok": true }
```

### Internal Dependencies

- `api/src/services/memgraph.service.js` — source of truth for templates
- `api/src/services/redis.service.js` — optional caching layer (same pattern as `config-loader.service.js`)

### Implementation Complexity

**Low.** Template loading is one Cypher query. Interpolation logic is 5 lines
of regex. A REST wrapper is straightforward. The main design decision is whether
to cache at the route level (Redis TTL) or rely on the existing module-level
cache.

### Criticality for FlowDesk

**Should Have.** FlowDesk executors currently fall back to hardcoded strings
when `template-store` fails, so the system degrades gracefully. However, the
direct `memgraph.service` import must be removed for clean separation.

### Migration Path

1. Replace `tpl.render(key, vars)` calls in executors with an HTTP call to
   `POST /api/v1/templates/FLOWDESK/:key/render` or fetch body via `GET` and
   interpolate locally.
2. Remove `template-store.js` from the FlowDesk source tree (it is entirely
   platform infrastructure).

---

## Contract 5: Config Store API

### Current State

`api/src/services/flowdesk/config-loader.service.js` constructs a singleton
that imports both `memgraph.service` and `redis.service` directly:
```js
const memgraphService = require('../memgraph.service');
let redis = null;
try { redis = require('../redis.service'); } catch {}
_instance = new FlowDeskConfigLoader(memgraphService, redis);
```
Config types stored in Memgraph: `SLAConfig`, `QueueMapping`, `KeywordRule`,
`ServiceCategory`, `DomainCode`, `ConfidenceThreshold`, `ScopeRule` — all with
`namespace: 'CORE'`. Redis cache key prefix: `flowdesk:config:`.

The six accessor methods (`getSLAConfig`, `getQueueMapping`,
`getKeywordRules`, `getServiceCategories`, `getDomainCodes`,
`getConfidenceThresholds`) are called directly by FlowDesk executors.

### Proposed Public Interface

**REST** — config resource group. Write operations (invalidation) are admin-only.

### Interface Specification

```
GET /api/v1/config/sla?priority=HIGH
Response 200:
{
  "priority": "HIGH",
  "responseHours": 4,
  "resolutionHours": 24,
  "escalationHours": 8,
  "businessHoursOnly": false
}

GET /api/v1/config/sla        (all priorities)
Response 200: { "sla": { "CRITICAL": {...}, "HIGH": {...}, "MEDIUM": {...}, "LOW": {...} } }

GET /api/v1/config/queues?code=IT-HW
Response 200: { "code": "IT-HW", "teamName": "hardware-support" }

GET /api/v1/config/queues
Response 200: { "queues": { "IT-HW": "hardware-support", ... } }

GET /api/v1/config/keyword-rules?language=en
Response 200: { "rules": [{ "pattern": "...", "category": "IT-HW", "priority": 10 }] }

GET /api/v1/config/service-categories?level=1
Response 200: { "categories": [{ "code": "IT", "name": "...", "level": 1, "slaHours": 48 }] }

GET /api/v1/config/domain-codes
Response 200: { "domains": [{ "code": "IT", "name": "Information Technology", "color": "#0066cc" }] }

GET /api/v1/config/confidence-thresholds?level=L2
Response 200: { "level": "L2", "highThreshold": 0.80, "mediumThreshold": 0.55, "lowThreshold": null }

POST /api/v1/config/invalidate
Request body: { "type": "sla" | "queues" | "all" }
Response 200: { "ok": true, "invalidated": "sla" }
```

### Internal Dependencies

- `api/src/services/flowdesk/config-loader.service.js` — the `FlowDeskConfigLoader` class
  can be promoted to a shared platform service and wrapped with a route handler
- `api/src/services/memgraph.service.js`
- `api/src/services/redis.service.js`

### Implementation Complexity

**Low.** `FlowDeskConfigLoader` already handles caching, fallbacks, and Memgraph
queries. The only work is adding route handlers that call through to the
existing class methods. The class itself does not need to move — the platform
keeps it; FlowDesk calls REST.

### Criticality for FlowDesk

**Must Have.** `ClassifyIntentExecutor` depends on `getKeywordRules()` and
`getConfidenceThresholds()`. `CheckSLAExecutor` depends on `getSLAConfig()`.
`RouteTicketExecutor` depends on `getQueueMapping()`. These are hot-path calls
in every dialog turn.

The REST round-trip overhead for every executor call is a concern — FlowDesk
should cache these configs locally with a short TTL (the existing 5-minute Redis
TTL pattern) rather than hitting REST on every turn. An alternative is to expose
a `GET /api/v1/config/all` bulk endpoint.

### Migration Path

1. Add REST route handlers delegating to `FlowDeskConfigLoader` methods.
2. In FlowDesk consumer code, replace direct `getFlowDeskConfigLoader()` calls
   with an HTTP client wrapper that maintains a local in-process cache.
3. Remove `config-loader.service.js` from the FlowDesk source tree.

---

## Contract 6: Plugin Registration API

### Current State

`api/src/core/aopeg/plugins/plugin-loader.js` hardcodes the FlowDesk plugin
in `loadDomainPlugins()`:
```js
const { flowdeskPlugin } = require('./flowdesk');
// ...
await pluginLoader.loadAll([
  commonPlugin, ingestionPlugin, ragPlugin, subgraphPlugin,
  workflowPlugin, notificationPlugin, sqlExtractionPlugin,
  flowdeskPlugin,   // <-- hardcoded client plugin in platform loader
  validationPlugin, extractionPlugin, dialoguePlugin,
]);
```
`FlowDeskPlugin` extends `PluginBase` from `api/src/core/aopeg/plugins/plugin-base.js`.
The `PluginBase` class has stable `initialize()`, `register()`, `unregister()`,
`cleanup()`, `addExecutor()` methods and registers via `pluginRegistry`.

### Proposed Public Interface

**Injectable service interface** — a `registerConsumerPlugin(plugin)` call during
startup, plus a convention for consumer plugin discovery via a config file or
directory scan.

Two viable approaches:

**Option A — Config manifest** (recommended for simplicity):
A JSON file at `consumers/flowdesk/plugin.manifest.json` declaring the module
path. `StartupManager` reads all manifests in `consumers/*/plugin.manifest.json`
and calls `pluginLoader.load(require(entry))`.

**Option B — Dynamic directory scan** (more automatic):
`loadDomainPlugins()` scans `consumers/*/plugin.js` and loads any valid
`PluginBase` instances found.

### Interface Specification

```
// Option A: consumers/flowdesk/plugin.manifest.json
{
  "name": "flowdesk",
  "version": "1.0.0",
  "entry": "./flowdesk.plugin.js",
  "domain": "flowdesk",
  "loadPriority": 100
}

// api/src/core/aopeg/plugins/plugin-loader.js — new public function
async function loadConsumerPlugins(consumersDir) {
  // Scans consumersDir for plugin.manifest.json
  // Requires the entry module, validates it extends PluginBase, loads it
}

// api/src/services/startup/StartupManager.js — call site
await pluginLoader.loadConsumerPlugins(path.resolve(__dirname, '../../../../consumers'));
```

### Internal Dependencies

- `api/src/core/aopeg/plugins/plugin-loader.js` — `PluginLoader.load()`
- `api/src/core/aopeg/plugins/plugin-base.js` — `PluginBase` base class
  (FlowDesk must import this from its new location; it can stay in-platform as
  a public contract class)
- `api/src/core/aopeg/registry/plugin-registry.js` — runtime executor registry

### Implementation Complexity

**Low.** `PluginLoader.load()` already accepts any `PluginBase` instance. The
only new code is the manifest-scanning loop (15 lines) and removing the
hardcoded `require('./flowdesk')` import from `loadDomainPlugins()`.

The `PluginBase` class and `BaseExecutor` must be exported from a stable public
path (e.g., `api/src/core/aopeg/public.js`) so FlowDesk can extend them without
importing from deep internal paths.

### Criticality for FlowDesk

**Must Have.** Without plugin registration, none of the `flowdesk.*` executors
are available to the RuntimeEngine, and all graph execution fails.

### Migration Path

1. Create `consumers/flowdesk/plugin.manifest.json` pointing to the FlowDesk
   plugin entry.
2. Add `loadConsumerPlugins()` to `plugin-loader.js`.
3. Remove the hardcoded `require('./flowdesk')` line from `loadDomainPlugins()`.
4. FlowDesk imports `PluginBase` and `BaseExecutor` from the new public export path.

---

## Contract 7: Workspace Extraction API

### Current State

The `api/src/services/workspace/extraction/flowdesk/` directory contains 13
files embedded directly in the platform workspace extraction system:

- 5 extractors: `service-catalog.extractor.js`, `sla-rules.extractor.js`,
  `classification-rules.extractor.js`, `routing-rules.extractor.js`,
  `dialog-graph.extractor.js`
- 4 generators: `sla-graph.generator.js`, `classification-graph.generator.js`,
  `routing-graph.generator.js`, `dialog-graph.generator.js`
- 1 orchestrator: `index.js` — `runFlowDeskExtraction(workspaceId, sourceId)`
- 1 builder: `gxe-builder.js`
- 1 catalog integration: `catalog-integration.js`
- 1 generators index: `generators/index.js`

The workspace route already exposes a FlowDesk-specific extraction endpoint:
```
POST /api/v1/workspaces/:id/sources/extract-flowdesk
```
This calls `controller.extractFlowDesk()` which calls `runFlowDeskExtraction()`.

Extractors read FlowDesk JSON data files from
`api/src/services/flowdesk/data/service-catalog.json` (hardcoded path).
Generators use `GxeGraphBuilder` to construct graphs and call
`graphCatalogService.create()` directly.

### Proposed Public Interface

**REST — the existing endpoint is almost right, but the implementation must
move.**

The endpoint `POST /api/v1/workspaces/:id/sources/extract-flowdesk` should
remain in the platform route, but it must accept a generic payload that
describes what to extract rather than hardcoding the FlowDesk pipeline.

A consumer-agnostic extraction endpoint:

```
POST /api/v1/workspaces/:id/extract
Request body:
{
  "pipeline": "flowdesk",        // registered pipeline name
  "sourceId": "uuid",
  "options": {
    "catalogPath": "...",        // optional override for data path
    "phases": ["service_catalog", "sla_rules", "dialog_graphs"]
  }
}
Response 202:
{
  "jobId": "uuid",
  "workspaceId": "...",
  "pipeline": "flowdesk",
  "status": "QUEUED"
}

GET /api/v1/workspaces/:id/extract/:jobId
Response 200:
{
  "jobId": "...",
  "status": "RUNNING" | "COMPLETED" | "FAILED",
  "progress": { "phase": "sla_rules", "message": "Extracting SLA rules..." },
  "stats": { "entities": 45, "rules": 12, "workflows": 3, "total": 60 },
  "log": [...]
}
```

The platform registers a `IExtractionPipeline` interface. FlowDesk registers
its pipeline via the plugin manifest or a separate registration call on startup.

### Internal Dependencies

- `api/src/services/workspace/draft.service.js` — draft creation (called by
  extractors)
- `api/src/services/graphCatalog.service.js` — graph saving (called by
  generators)
- `api/src/services/workspace/` extraction job infrastructure

### Implementation Complexity

**High.** This is the most invasive contract. The 13 FlowDesk files are deeply
embedded in the workspace extraction tree. Moving them requires:
1. Defining an `IExtractionPipeline` interface that extractors implement.
2. Creating a pipeline registry mechanism.
3. Moving FlowDesk data files (`service-catalog.json`, SLA config JSONs) to
   `consumers/flowdesk/data/`.
4. Fixing hardcoded paths.
5. The generators call `graphCatalogService.create()` directly — they need to
   go through Contract 2 instead.

### Criticality for FlowDesk

**Should Have.** The extraction pipeline runs only during initial FlowDesk setup
(seeding knowledge into Memgraph + Graph Catalog). It is not on the
request/response critical path. The system operates normally after extraction;
only re-seeding requires this contract. However, without it the workspace
extraction code remains hardwired to FlowDesk.

### Migration Path

1. Define `IExtractionPipeline` interface (5 methods: `getId()`, `getName()`,
   `getPhases()`, `runPhase()`, `onComplete()`).
2. Move the 13 FlowDesk extraction files to `consumers/flowdesk/extraction/`.
3. Register the FlowDesk pipeline in `consumers/flowdesk/plugin.manifest.json`.
4. Update `controller.extractFlowDesk()` to use the pipeline registry.
5. Update all hardcoded paths to use a `consumers/flowdesk/data/` base.

---

## Contract 8: Tool Set Registration API

### Current State

`api/src/services/graph/gxe-defaults.js` hardcodes `FLOWDESK_TOOLS` — a list
of 12 `flowdesk.*` tool names:
```js
const FLOWDESK_TOOLS = [
  'flowdesk.classify_intent', 'flowdesk.check_location', 'flowdesk.search_location',
  'flowdesk.ask_beneficiary', 'flowdesk.find_user', 'flowdesk.confirm_request',
  'flowdesk.spawn_process', 'flowdesk.create_service_request',
  'flowdesk.request_approval', 'flowdesk.create_work_order',
  'flowdesk.assign_handler', 'flowdesk.send_notification'
];
```
`FLOWDESK_TOOLS` is spread into `STANDARD_TOOL_SET` (line 162), making FlowDesk
tools available in every standard graph generation session across the platform.

`api/src/services/graph/graph-path-generator.js` hardcodes tool name branches
in `_buildTestScenario()`:
```js
if (tool === 'flowdesk.classify_intent' || label.includes('classif')) { ... }
if (tool === 'flowdesk.ask_beneficiary' || label.includes('beneficiary')) { ... }
// etc.
```

### Proposed Public Interface

**Injectable service interface** — a `registerToolSet(consumerName, tools[])` 
call that `GxeDefaults` exposes. Consumers call it during startup (after plugin
loading). `STANDARD_TOOL_SET` becomes dynamically assembled from registered
tool sets.

```js
// api/src/services/graph/gxe-defaults.js — new public API
const _consumerToolSets = new Map();

function registerToolSet(consumerName, toolNames) {
  _consumerToolSets.set(consumerName, toolNames);
}

function getStandardToolSet() {
  return [
    ...CORE_PRIMITIVES,
    ...TEXT_TOOLS,
    ...EXTRACTION_TOOLS,
    ...VECTOR_TOOLS,
    ...GRAPH_TOOLS,
    ...CATALOG_TOOLS,
    ...BACKLOG_TOOLS,
    ...WORKFLOW_TOOLS,
    ...[..._consumerToolSets.values()].flat()   // dynamic consumer tools
  ];
}

module.exports = { registerToolSet, getStandardToolSet, MINIMAL_TOOL_SET, ... };
```

FlowDesk calls this in its plugin `initialize()`:
```js
// consumers/flowdesk/flowdesk.plugin.js
const { registerToolSet } = require('<platform>/services/graph/gxe-defaults');
registerToolSet('flowdesk', [
  'flowdesk.classify_intent', 'flowdesk.check_location', ...
]);
```

For `graph-path-generator.js`, the hardcoded tool-name branches must be replaced
with a plugin-contributed test-data registry:

```js
// api/src/services/graph/tool-test-data-registry.js (new file)
const _testData = new Map();
function registerToolTestData(toolName, testDataFn) { _testData.set(toolName, testDataFn); }
function getTestData(toolName, context) { return _testData.get(toolName)?.(context) ?? null; }
```

### Internal Dependencies

- `api/src/services/graph/gxe-defaults.js` — tool set assembly
- `api/src/services/graph/graph-path-generator.js` — test scenario generation
- `api/src/services/graph/gxe.service.js` — consumes tool sets for graph
  generation prompt construction

### Implementation Complexity

**Low** for tool set registration (one function, callers update). **Medium** for
`graph-path-generator.js` because the hardcoded branches include default test
values (`'myself'`, `'Donika Gjaka'`, `'Brindisi'`) that encode FlowDesk domain
knowledge — extracting all of these cleanly requires careful registry design.

### Criticality for FlowDesk

**Should Have.** If not done, FlowDesk tools still work at runtime (they are
loaded by the plugin system). The only impact is that graph generation (the AI-
assisted graph building in GXE editor) will not include FlowDesk tools unless
the default tool set is manually specified. For production dialog execution this
is irrelevant.

### Migration Path

1. Add `registerToolSet()` to `gxe-defaults.js`; export it.
2. Remove the hardcoded `FLOWDESK_TOOLS` constant and its inclusion in
   `STANDARD_TOOL_SET`.
3. Add a `registerToolTestData()` call in the FlowDesk plugin `initialize()`.
4. Replace the 6 `if (tool === 'flowdesk.X')` branches in `graph-path-generator.js`
   with registry lookups.

---

## Contract 9: Execution Monitoring API

### Current State

`api/src/services/flowdesk/gxe-manager-bridge.js` imports `ExecutionRegistry`
and `redis.service` directly:
```js
const { ExecutionRegistry } = require('../../gxe-manager/ExecutionRegistry');
const redisService = require('../redis.service');
const redisClient = redisService.getClient();
_registry = new ExecutionRegistry(redisClient);
```
It creates a second `ExecutionRegistry` instance alongside the one already
maintained by `gxeManager.route.js`. It then calls `registry.register(record)`
and `registry.updateStatus(executionId, status, details)` to make FlowDesk
dialog turns visible in the GXE Manager UI.

### Proposed Public Interface

**REST** — the GXE Manager route already provides nearly all needed endpoints.
The bridge only needs `register` and `updateStatus`, which map to existing
`POST /executions` (launch) and an internal update that has no current REST
exposure.

Additions needed:
```
POST /api/v1/gxe-manager/executions/:id/status
Request body:
{
  "status": "RUNNING" | "WAITING" | "COMPLETED" | "FAILED",
  "nodeStates": { "nodeId": "COMPLETED" | "FAILED" | "WAITING" | "PENDING" | "SKIPPED" },
  "currentNodeId": "n7",
  "completedAt": 1715432100000,
  "error": null
}
Response 200: { "ok": true }
```
(This is an internal/trusted endpoint — should require an internal API key or
be localhost-only in production.)

Alternatively, the monitoring bridge can be replaced by routing all FlowDesk
executions through `POST /api/v1/gxe-manager/executions` (Contract 1) which
already updates `ExecutionRegistry` as part of `GxeManagerService.launch()`.
This is the preferred path because it eliminates the bridge entirely.

### Interface Specification

The preferred solution makes this contract a subset of Contract 1:

When FlowDesk uses `POST /api/v1/gxe-manager/executions/sync` (Contract 1),
the `GxeManagerService` internally calls `registry.register()` and
`registry.updateStatus()`. FlowDesk gets monitoring for free without any
additional API surface.

If an explicit status-update endpoint is still needed (e.g., for external
processes that run outside the RuntimeEngine):

```
PATCH /api/v1/gxe-manager/executions/:id
Request body:
{
  "status": "COMPLETED",
  "nodeStates": { ... },
  "currentNodeId": null,
  "completedAt": 1715432100000,
  "error": null
}
Response 200: { "ok": true, "executionId": "..." }
```

### Internal Dependencies

- `api/src/gxe-manager/ExecutionRegistry.js` — Redis-backed execution state
- `api/src/gxe-manager/types/execution.types.js` — `createExecutionRecord()`, `ExecutionStatus`
- `api/src/services/redis.service.js`

### Implementation Complexity

**Low** if FlowDesk adopts Contract 1 (all execution goes through GxeManager).
The bridge becomes entirely redundant and can be deleted.

**Low-Medium** if a standalone `PATCH` status endpoint is needed for external
processes — it is a thin wrapper around `registry.updateStatus()`.

### Criticality for FlowDesk

**Nice to Have.** The `gxe-manager-bridge.js` file's `register()` and
`updateStatus()` calls are both wrapped in try/catch with `console.warn` on
failure. Monitoring is purely observational; dialog execution continues
normally if the bridge fails. The monitoring data is only visible in the GXE
Manager UI, not consumed by FlowDesk logic.

### Migration Path

1. Adopt Contract 1 (sync execution via GxeManager REST). Monitoring is
   automatic.
2. Delete `gxe-manager-bridge.js`.
3. If standalone status updates are needed, add the `PATCH /executions/:id`
   endpoint.

---

## Priority Matrix

| Contract | Criticality | Complexity | Priority Score | Recommended Order |
|---|---|---|---|---|
| 1: Graph Execution API | Must Have | Medium | 9 | 1 |
| 6: Plugin Registration API | Must Have | Low | 9 | 2 |
| 3: Entity Query API | Must Have | Medium | 8 | 3 |
| 5: Config Store API | Must Have | Low | 8 | 4 |
| 2: Graph Catalog API | Must Have | Low | 7 | 5 |
| 4: Template API | Should Have | Low | 5 | 6 |
| 8: Tool Set Registration API | Should Have | Low-Medium | 4 | 7 |
| 7: Workspace Extraction API | Should Have | High | 3 | 8 |
| 9: Execution Monitoring API | Nice to Have | Low | 2 | 9 |

**Priority Score** = Criticality weight (Must=3, Should=2, Nice=1) ×
Inverse-Complexity weight (Low=3, Medium=2, High=1). Higher is better.
Ties broken by dependencies (Contract 1 unlocks Contract 9).

---

## Minimum Viable Separation

The smallest set of contracts that allows FlowDesk to be moved to
`/consumers/flowdesk/` and remain functional (without requiring every contract
to be fully implemented):

### Required (system fails without these)

**Contract 6 — Plugin Registration API**
Without this, `loadDomainPlugins()` cannot find the FlowDesk executors and all
`flowdesk.*` tools are missing from the RuntimeEngine. This is a 15-line code
change and must be done first.

**Contract 1 — Graph Execution API**
Without this, `kb-runtime-bridge.js` cannot execute graphs (it imports
`RuntimeEngine` directly). The sync REST endpoint must exist. The existing
`POST /api/v1/gxe-manager/executions` can serve as a temporary async fallback
while the sync endpoint is built.

**Contract 5 — Config Store API**
Without this, `ClassifyIntentExecutor` and `CheckSLAExecutor` cannot load their
configuration. However, a temporary workaround is acceptable: expose the
`FlowDeskConfigLoader` singleton as a platform-owned shared service and let
FlowDesk executors receive it via dependency injection at plugin initialization
time (injected into the plugin instance, not imported directly). This defers
the REST surface to a later sprint.

### Deferrable (system works with workarounds)

**Contract 2 — Graph Catalog API**: The `/by-name` endpoint addition is small
(1 day). Can be deferred by having FlowDesk use the existing catalog list
endpoint with client-side name matching.

**Contract 3 — Entity Query API**: `find-user.executor.js` and
`search-location.executor.js` currently open their own `neo4j-driver` sessions.
These can be temporarily fixed by replacing the private `neo4j-driver` instances
with calls to the shared `memgraph.service` (same outcome, no REST hop). This
is a step toward the full contract but not the full REST API.

**Contract 4 — Template API**: Acceptable workaround is to pre-load templates
into the FlowDesk plugin at startup via `template-store.js` (kept as a shared
platform utility, not in the consumer tree).

**Contract 7 — Workspace Extraction API**: Only needed during initial FlowDesk
setup/re-seeding. Can remain as a platform-internal call with a TODO to
formalize the interface.

**Contracts 8 and 9**: Purely operational improvements; deferrable indefinitely
without functional impact.

### MVS Summary

| Phase | Contracts | Outcome |
|---|---|---|
| Phase 0 (unblock move) | 6 (plugin registration) | FlowDesk plugin loads from `/consumers/flowdesk/` |
| Phase 1 (core runtime) | 1 (sync execution), 5 (config store via DI) | Dialog execution works end-to-end |
| Phase 2 (clean data access) | 2 (by-name lookup), 3 (entity queries via memgraph.service), 4 (templates as shared utility) | No more private DB connections in FlowDesk |
| Phase 3 (full contracts) | 7, 8, 9 | Complete separation, re-seeding via API, monitoring integrated |

Estimated effort for Phase 0 + Phase 1: 3–4 days.
Estimated effort for Phase 2: 3–5 days.
Estimated effort for Phase 3: 5–8 days.
Total to full separation: approximately 2–3 sprints.

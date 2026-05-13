# FlowDesk Coupling Inventory
**Audit date:** 2026-05-11  
**Purpose:** Complete map of FlowDesk (external client project) coupling inside the UN ProjectAdvisor platform, to guide namespace separation.

---

## Section 1: AOPEG Plugin Layer

**Directory:** `api/src/core/aopeg/plugins/flowdesk/`

The plugin is registered by `plugin-loader.js` alongside the other 7 platform plugins (common, ingestion, rag, subgraph, workflow, notification, sql-extraction, flowdesk). The loader directly imports `flowdeskPlugin` at line 165:

```js
const { flowdeskPlugin } = require('./flowdesk');
```

### 1.1 Plugin manifest

| File | Role |
|---|---|
| `index.js` | Re-export barrel |
| `flowdesk.plugin.js` | `FlowDeskPlugin extends PluginBase` — registers 17 executors |

### 1.2 Executors — detailed analysis

| Executor file | Type | Platform services imported | DB operations | Platform API type |
|---|---|---|---|---|
| `classify-intent.executor.js` | Dialog | `flowdesk/template-store` (→ `memgraph.service`), `flowdesk/keyword-filter`, `flowdesk/semantic-search` (Qdrant), `flowdesk/config-loader.service` (→ `memgraph.service`, `redis.service`); `llm` from `executionContext` | Qdrant: search `flowdesk_services`; Memgraph: reads `SLAConfig`, `ConfidenceThreshold`, `ServiceCategory` via config-loader; Redis: reads cached config | **Internal** — deep imports into `services/flowdesk/*` and transitive `memgraph.service` / `redis.service` |
| `clarify-intent.executor.js` | Dialog | `flowdesk/template-store` (→ `memgraph.service`) | Memgraph: reads `NotificationTemplate` | Internal |
| `check-location.executor.js` | Dialog | `flowdesk/graph-routing` (→ own `neo4j-driver` connection) | Memgraph: `MATCH (u:User)-[:BELONGS_TO]->(ou)` … `LOCATED_AT` | Internal |
| `search-location.executor.js` | Dialog | `flowdesk/template-store`, `flowdesk/import-config` (for credentials), `neo4j-driver` (direct) | Memgraph: `MATCH (loc:Location)` — own connection, not via `memgraph.service` | **Internal + bypass** — creates own driver using hardcoded credentials from `import-config.js` |
| `ask-beneficiary.executor.js` | Dialog | `flowdesk/template-store` | Memgraph: reads `NotificationTemplate` | Internal |
| `find-user.executor.js` | Dialog | `flowdesk/template-store`, `flowdesk/import-config`, `neo4j-driver` (direct) | Memgraph: `MATCH (u:User)` — own connection | **Internal + bypass** |
| `confirm-request.executor.js` | Dialog | `flowdesk/template-store` | Memgraph: reads `NotificationTemplate` | Internal |
| `spawn-process.executor.js` | Dialog | `flowdesk/graph-routing`, `flowdesk/template-store` | Memgraph: reads `User`, `ServiceCatalogItem`, `OrganizationUnit` via graph-routing | Internal |
| `create-service-request.executor.js` | Process | `memgraph.service` (lazy, via `context.executionContext.memgraph` or direct require) | Memgraph: `CREATE (sr:ServiceRequest {namespace: "FLOWDESK"})` | **Internal — direct `memgraph.service` import** |
| `create-work-order.executor.js` | Process | `memgraph.service` (lazy) | Memgraph: `CREATE (wo:WorkOrder)-[:FULFILLS]->(sr)` | Internal |
| `request-approval.executor.js` | Process | None | None (auto-approve stub) | N/A — self-contained |
| `assign-handler.executor.js` | Process | `flowdesk/graph-routing` | Memgraph: `ServiceCatalogItem`, `OrganizationUnit`, `HANDLED_BY` | Internal |
| `send-notification.executor.js` | Process | `flowdesk/template-store` | Memgraph: reads `NotificationTemplate` | Internal |
| `manage-ticket.executor.js` | Ticket | `memgraph.service` via `context.executionContext.memgraph` | Memgraph: `CREATE/MATCH (t:FlowDeskTicket)` CRUD; in-memory Map fallback | Internal |
| `route-ticket.executor.js` | Ticket | `flowdesk/config-loader.service` (→ `memgraph.service`, `redis.service`) | Memgraph: `MATCH (t:FlowDeskTicket)` SET queue; Redis: cached `QueueMapping` | Internal |
| `check-sla.executor.js` | Ticket | `flowdesk/config-loader.service`, `manage-ticket.executor.js` static method | Memgraph: `MATCH (t:FlowDeskTicket)` read/write SLA breach | Internal |
| `laptop-assistant.executor.js` | Laptop | None (self-contained catalog) | None | **Self-contained** — could be extracted with zero platform changes |

**Key finding — two executors bypass `memgraph.service` entirely:** `search-location.executor.js` and `find-user.executor.js` import `neo4j-driver` directly and use credentials from `flowdesk/import-config.js`. This creates a second, untracked DB connection pool.

---

## Section 2: Service Layer

**Directory:** `api/src/services/flowdesk/`

### 2.1 File inventory

| File | Role | Imports from platform core |
|---|---|---|
| `import-config.js` | Memgraph and MSSQL connection constants | None (reads env vars) |
| `graph-routing.js` | Resolves service handlers via Memgraph graph traversal | `neo4j-driver` (direct driver), `import-config.js` |
| `semantic-search.js` | L2 intent classification via TEI + Qdrant `flowdesk_services` | None (raw HTTP to TEI + Qdrant) |
| `keyword-filter.js` | L1 deterministic keyword→service_code mapping | `flowdesk/config-loader.service` (lazy, for KB rules) |
| `config-loader.service.js` | Loads business config (SLA, queues, thresholds, etc.) from Memgraph with Redis caching | **`memgraph.service`** (direct require), **`redis.service`** (optional) |
| `template-store.js` | Fetches `NotificationTemplate` nodes from Memgraph | **`memgraph.service`** (direct require) |
| `graph-loader.js` | Loads graphs from `graphCatalog.service` or JSON files | **`graphCatalog.service`** (platform service) |
| `graph-loader-kb.service.js` | Loads GXE graphs from KB catalog with subgraph resolution | **`graphCatalog.service`** |
| `kb-runtime-bridge.js` | High-level execution facade over RuntimeEngine + graphLoader | **`RuntimeEngine`**, **`AOPEGAdapter`**, `graph-loader-kb.service` |
| `gxe-manager-bridge.js` | Registers FlowDesk executions in platform GxeManager | **`ExecutionRegistry`** (gxe-manager), **`redis.service`** |
| `graph-hot-reload.service.js` | Redis PubSub listener for graph cache invalidation | `ioredis` (direct), platform `FLOWDESK` namespace filter |
| `dialog-session.js` | Stateful dialog session manager (legacy path) | `graph-loader.js`, `graph-routing.js` |
| `workflow-runner.js` | Simple GXE executor for MVP process graphs | `executors/index.js`, `graph-loader.js` |
| `runtime-chat.js` | Native RuntimeEngine chat with AOPEG executor registry | **`aopeg/index`** (initializeAOPEG), **`AOPEGAdapter`**, **`graphCatalogService`**, **`codex-loader.service`** |
| `sql-to-graph-import.js` | SQL Server → Memgraph ETL | `mssql`, `neo4j-driver` (direct) |
| `validate-graph-import.js` | Validates imported graph integrity | `neo4j-driver` (direct) |
| `graph-schema.js` | Schema constants for SQL import | None |
| `generate-service-providers.js` | Generates service provider nodes | `neo4j-driver` (direct) |
| `generate-utterances.js` | Generates Qdrant training utterances | None (pure JS) |
| `qdrant-upload.js` | Uploads embeddings to Qdrant `flowdesk_services` | Raw HTTP to TEI + Qdrant |
| `test-semantic-search.js` | Test harness for semantic search | `semantic-search.js` |
| `migrate-graphs.js` | Graph migration utility | `neo4j-driver` (direct) |
| `graph-schema.js` | Schema definitions | None |
| `executors/` (9 files) | Legacy executor implementations (pre-AOPEG) | `neo4j-driver` (direct), `graph-routing.js` |
| `executors/dialog/` (10 files) | Legacy dialog executor implementations | `graph-routing.js`, `flowdesk/semantic-search.js` |
| `graphs/*.graph.json` (4 files) | Static graph definitions (JSON) | N/A |
| `data/service-catalog.json`, `data/utterances.json` | Static data | N/A |

### 2.2 Cross-contamination: imports from platform core

The following `api/src/services/flowdesk/` files import from `api/src/services/` platform core:

| FlowDesk file | Platform import | Import type |
|---|---|---|
| `config-loader.service.js` | `../memgraph.service` | Internal — uses `executeQuery()` |
| `config-loader.service.js` | `../redis.service` | Internal — uses `getClient()`, `.keys()`, `.del()`, `.get()`, `.set()`, `.expire()` |
| `template-store.js` | `../memgraph.service` | Internal — uses `runQuery()` |
| `graph-loader.js` | `../graphCatalog.service` | Internal — uses `listGraphs()`, `getGraphById()` |
| `graph-loader-kb.service.js` | `../graphCatalog.service` | Internal — uses `getGraphByName()`, `getGraphById()` |
| `gxe-manager-bridge.js` | `../redis.service` + `../../gxe-manager/ExecutionRegistry` | Internal |
| `runtime-chat.js` | `../../core/aopeg/index` (`initializeAOPEG`, `pluginRegistry`) | **Critical** — couples to AOPEG internals |
| `runtime-chat.js` | `../../runtime/integration` (`AOPEGAdapter`) | Internal |
| `runtime-chat.js` | `../graphCatalog.service` | Internal |
| `runtime-chat.js` | `../codex/codex-loader.service` | Internal — loads governance rules |
| `kb-runtime-bridge.js` | `../../runtime/RuntimeEngine` | Internal |
| `kb-runtime-bridge.js` | `../../runtime/integration/AOPEGAdapter` | Internal |

---

## Section 3: Routes

### 3.1 Registration in `api/index.js`

```
Line 87:  const flowdeskRoutes = require('./src/routes/flowdesk.route');
Line 196: app.use('/api/v1/flowdesk', flowdeskRoutes);
```

`flowdesk-config.route.js` is **not mounted** in `api/index.js`. The frontend `flowdeskConfigStore.js` calls `/api/v1/flowdesk/config/*`, but that route file is an orphan — not registered. The config CRUD endpoints exist as code but are not reachable in the running server.

### 3.2 `flowdesk.route.js` — all 21 endpoints

| Method | Path | Controller function | Description |
|---|---|---|---|
| GET | `/api/v1/flowdesk/health` | `health` | Health check (Qdrant, Memgraph, TEI) |
| POST | `/api/v1/flowdesk/classify` | `classify` | L1 keyword + L2 semantic classification |
| POST | `/api/v1/flowdesk/route` | `route` | Full classify + handler resolution |
| GET | `/api/v1/flowdesk/user/:userId/context` | `getUserContext` | User org/location context from Memgraph |
| GET | `/api/v1/flowdesk/services` | `getServices` | Service catalog lookup |
| GET | `/api/v1/flowdesk/services/:code` | `getServiceByCode` | Single service by code |
| POST | `/api/v1/flowdesk/request` | `createRequest` | Create service request |
| GET | `/api/v1/flowdesk/request/:id` | `getRequest` | Get service request |
| POST | `/api/v1/flowdesk/chat` | `chat` | Main dialog chat (GXE graph execution) |
| GET | `/api/v1/flowdesk/chat/:sessionId` | `getChatSession` | Get session state |
| GET | `/api/v1/flowdesk/graph-versions` | `getGraphVersions` | List available graph versions |
| POST | `/api/v1/flowdesk/tickets` | `createTicket` | Create ticket (ManageTicketExecutor) |
| GET | `/api/v1/flowdesk/tickets` | `listTickets` | List tickets |
| GET | `/api/v1/flowdesk/tickets/:ticketId` | `getTicket` | Get ticket |
| PATCH | `/api/v1/flowdesk/tickets/:ticketId` | `updateTicket` | Update ticket |
| POST | `/api/v1/flowdesk/tickets/:ticketId/escalate` | `escalateTicket` | Escalate ticket |
| POST | `/api/v1/flowdesk/tickets/:ticketId/close` | `closeTicket` | Close ticket |
| POST | `/api/v1/flowdesk/sla/check` | `checkSLA` | SLA compliance check |
| GET | `/api/v1/flowdesk/sla/breached` | `getBreachedTickets` | Get SLA-breached tickets |
| POST | `/api/v1/flowdesk/laptop/chat` | `laptopChat` | Laptop provisioning assistant chat |
| GET | `/api/v1/flowdesk/laptop/session/:sessionId` | `getLaptopSession` | Get laptop assistant session |

### 3.3 `flowdesk-config.route.js` — 5 endpoints (currently unmounted)

| Method | Path pattern | Description |
|---|---|---|
| GET | `/api/v1/flowdesk/config/:type` | Read config by type (SLA, queues, keywords, etc.) |
| POST | `/api/v1/flowdesk/config/:type` | Create config node in Memgraph |
| PATCH | `/api/v1/flowdesk/config/:type/:id` | Update config node |
| DELETE | `/api/v1/flowdesk/config/:type/:id` | Delete config node |
| POST | `/api/v1/flowdesk/config/invalidate` | Invalidate Redis cache |

The config route imports `memgraph.service` directly (at runtime via `getMemgraph()`) and `flowdesk/config-loader.service`.

---

## Section 4: Frontend

### 4.1 FlowDesk-specific files

| File | Role | API endpoints called |
|---|---|---|
| `mcp/src/pages/FlowDeskPage.jsx` | Page wrapper | None (delegates to demo) |
| `mcp/src/pages/FlowDeskConfigPage.jsx` | Config admin (SLA, queues, keywords, etc.) | `/api/v1/flowdesk/config/*` (via Zustand store) |
| `mcp/src/components/FlowDesk/FlowDeskDemo.jsx` | Main chat + execution log UI (1007 lines) | `/api/v1/flowdesk/chat`, `/api/v1/flowdesk/health`, `/api/v1/flowdesk/user/:id/context`, `/api/v1/flowdesk/graph-versions`, `/api/v1/graph-catalog` (platform route), `/api/v1/graph-catalog/:id` (platform route) |
| `mcp/src/components/FlowDesk/waitingNodeToForm.js` | Converts WAIT_FOR_INPUT graph nodes to FormRenderer definitions | None |
| `mcp/src/components/FlowDesk/flowdesk.css` | Chat UI styles | None |
| `mcp/src/stores/flowdeskConfigStore.js` | Zustand store for config CRUD | `/api/v1/flowdesk/config/*` |

### 4.2 Router registration in `mcp/src/App.jsx`

```jsx
// Line 26-27
import FlowDeskPage from './pages/FlowDeskPage';
import FlowDeskConfigPage from './pages/FlowDeskConfigPage';

// Line 149-154
<Route path="/flowdesk" element={<FlowDeskPage />} />
<Route path="/flowdesk/config" element={<FlowDeskConfigPage />} />
```

### 4.3 Platform API usage from FlowDeskDemo

The demo UI calls two platform-level graph catalog endpoints that are not FlowDesk-specific:

- `GET /api/v1/graph-catalog?limit=100` — lists all graphs for the graph selector
- `GET /api/v1/graph-catalog/:id` — fetches graph metadata

This is a legitimate consumer of a platform contract. The rest of the calls (`/api/v1/flowdesk/*`) are FlowDesk-domain endpoints.

---

## Section 5: Data Layer

### 5.1 Qdrant — `flowdesk_services` collection

**Written by:** `api/src/services/flowdesk/qdrant-upload.js` — standalone script that reads `data/utterances.json`, calls TEI to generate embeddings, creates the collection, and uploads points.

**Read by:** `api/src/services/flowdesk/semantic-search.js` — `classifyUserIntent()` queries via `POST /collections/flowdesk_services/points/search`.

The collection contains utterance vectors with payload fields: `service_code`, `service_name`, `domain_code`, `category`, `text`, `lang`. This is entirely FlowDesk domain data with no platform mixing.

**Isolation assessment:** The `flowdesk_services` Qdrant collection is fully isolated. It can be deleted/renamed without any impact on the platform. No platform code writes to or reads from it.

### 5.2 Memgraph — FlowDesk-specific node labels

The following Memgraph node labels are created/owned exclusively by FlowDesk code:

| Label | Created by | Read by |
|---|---|---|
| `ServiceRequest` | `create-service-request.executor.js` | `flowdesk.controller.js` (`getRequest`) |
| `WorkOrder` | `create-work-order.executor.js` | `flowdesk.controller.js` |
| `FlowDeskTicket` | `manage-ticket.executor.js` | `check-sla.executor.js`, `route-ticket.executor.js`, `flowdesk.controller.js` |
| `NotificationTemplate` | Seeded (namespace `FLOWDESK`) | `template-store.js` |
| `SLAConfig` | `flowdesk-config.route.js`, `seed-flowdesk-config.js` | `config-loader.service.js` |
| `QueueMapping` | `flowdesk-config.route.js` | `config-loader.service.js` |
| `KeywordRule` | `flowdesk-config.route.js` | `config-loader.service.js` |
| `ServiceCategory` | `flowdesk-config.route.js` | `config-loader.service.js` |
| `DomainCode` | `flowdesk-config.route.js` | `config-loader.service.js` |
| `ConfidenceThreshold` | `flowdesk-config.route.js` | `config-loader.service.js` |
| `ScopeRule` | `flowdesk-config.route.js` | `config-loader.service.js` |

The following Memgraph node labels are **shared** — created or seeded by FlowDesk import scripts but also used by platform code:

| Label | Notes |
|---|---|
| `User` | Platform-wide; FlowDesk reads via `MATCH (u:User)` in graph-routing + find-user executor |
| `Location` | Platform-wide; FlowDesk reads via `MATCH (loc:Location)` |
| `OrganizationUnit` | Platform-wide; FlowDesk reads via `BELONGS_TO` / `LOCATED_AT` traversals |
| `ServiceCatalogItem` | Seeded by FlowDesk SQL import; not used by any other platform service |
| `Role`, `Permission` | Platform-wide; FlowDesk reads via `HAS_ROLE` |

All FlowDesk-created nodes carry `namespace: "FLOWDESK"` (ServiceRequest, WorkOrder, FlowDeskTicket) or `namespace: "CORE"` (config nodes). The `memgraph.service.js` label allowlist includes `NotificationTemplate` explicitly (line 58): `'NotificationTemplate'`.

### 5.3 Redis — FlowDesk-specific keys

All FlowDesk Redis keys use the prefix `flowdesk:config:` defined in `config-loader.service.js`:

```
flowdesk:config:sla
flowdesk:config:queues
flowdesk:config:keywords:en
flowdesk:config:categories
flowdesk:config:domains
flowdesk:config:thresholds
flowdesk:config:scopes
```

The `graph-hot-reload.service.js` subscribes to the Redis PubSub channel `graph:updates` and filters by `namespace === 'FLOWDESK'`. This channel is a platform-level channel (not FlowDesk-specific); the filtering logic is inside FlowDesk code.

**Isolation assessment:** The `flowdesk:config:*` key namespace is clean. The PubSub channel is shared but FlowDesk only consumes, does not publish to it.

### 5.4 Seed files in `api/src/db/seeds/`

Three seed files contain FlowDesk graph definitions stored as platform `GraphDefinition` / `GraphVersion` nodes:

- `flowdesk-sr-hardware-request.seed.js`
- `flowdesk-datasources.seed.js`
- `flowdesk-for-whom-determination.seed.js`

These seeds write to the platform GraphCatalog (namespace `FLOWDESK`). The platform does not need these graph definitions to function — they are FlowDesk domain data stored in the platform's graph catalog infrastructure.

---

## Section 6: Core Platform References

### 6.1 References to "flowdesk" OUTSIDE the FlowDesk directories

These are unexpected references in platform core code that represent true coupling violations:

| File | Line(s) | Context | Violation severity |
|---|---|---|---|
| `api/src/services/graph/gxe-defaults.js` | 115–130, 162, 229 | `FLOWDESK_TOOLS` array hard-coded with all 12 `flowdesk.*` executor names; included in `FULL_TOOL_SET` | **HIGH** — platform graph generation defaults embed FlowDesk tool names |
| `api/src/services/graph/graph-path-generator.js` | 222–344 | `_buildPathSuggestions()` has hard-coded `if (tool === 'flowdesk.classify_intent')` branches for 6 FlowDesk tools; also `_getDefaultAutoInput()` returns FlowDesk-specific demo values | **HIGH** — platform AI assistant embeds FlowDesk business logic |
| `api/src/controllers/gxe.controller.js` | 722–725 | Comment block listing FlowDesk tools as examples for graph building | LOW — documentation only |
| `api/src/services/agents/AgentBootstrapService.js` | 260 | `'agent-flowdesk': ['flowdesk', 'approval', 'routing', 'status', 'migration']` tag array in agent preset | **MEDIUM** — named FlowDesk preset in platform agent bootstrap |
| `api/src/services/graph/GraphTypeService.js` | 38, 57–58 | `FLOWDESK: 'flowdesk'` namespace constant; comment "FlowDesk configuration" | MEDIUM — platform type service has FlowDesk namespace constant |
| `api/src/routes/toolCatalog.route.js` | 263–276 | Tool name normalization code contains `flowdesk` prefix string handling | MEDIUM — FlowDesk-specific tool name parsing in platform route |
| `api/src/core/aopeg/plugins/plugin-loader.js` | 165, 180 | `const { flowdeskPlugin } = require('./flowdesk')` — FlowDesk plugin registered alongside platform plugins | **HIGH** — FlowDesk plugin is inside the platform plugin registry |
| `api/src/core/aopeg/plugins/plugin-loader.ts` | (parallel TS version) | Same as above | HIGH |
| `api/src/services/workspace/workspace-datasource.service.js` | 44 | `const GLOBAL_NAMESPACES = ['CORE', 'FLOWDESK', 'COMMON', 'PROJECT']` — FLOWDESK namespace hardcoded as globally visible | MEDIUM — platform workspace service assumes FlowDesk namespace |
| `api/src/services/memgraph.service.js` | 57–58 | `NotificationTemplate` label in the platform allowlist comment | LOW — permissive, but comments FlowDesk intent |
| `api/src/services/camel\camel-chat.service.js` | 6 | Comment: "Wraps the FlowDesk RuntimeEngine chat with CaMeL security pattern" | LOW — documentation only |
| `api/src/services\workspace\extraction\flowdesk\` | (13 files) | WorkSpace extraction pipeline has a dedicated FlowDesk sub-directory inside the platform extraction system | **HIGH** — platform extraction system has client-specific code embedded |

### 6.2 References to "flowdesk" in `api/index.js`

```js
Line 87:  const flowdeskRoutes = require('./src/routes/flowdesk.route');
Line 196: app.use('/api/v1/flowdesk', flowdeskRoutes);
```

Two lines only. The route mounting is a known, expected coupling point. The `flowdesk-config.route.js` is not registered.

---

## Section 7: Separation Analysis

### 7.1 AOPEG Plugin Layer

| Executor | Can extract without platform changes | Platform API used | API type | Effort | Extraction approach |
|---|---|---|---|---|---|
| `classify-intent` | No | `memgraph.service`, `redis.service` (via config-loader) | Internal | High | Define `IConfigLoader` contract; inject via `executionContext` |
| `clarify-intent` | No | `memgraph.service` (via template-store) | Internal | Low | Move template-store to public contract |
| `check-location` | No | `flowdesk/graph-routing` (direct Memgraph) | Internal | Medium | Expose user-context lookup as platform API |
| `search-location` | No | `neo4j-driver` bypass + `import-config.js` | **Bypass** | Medium | Replace bypass driver with platform `memgraph.service` call |
| `ask-beneficiary` | No | `memgraph.service` (via template-store) | Internal | Low | Same as clarify-intent |
| `find-user` | No | `neo4j-driver` bypass + `import-config.js` | **Bypass** | Medium | Replace bypass driver; expose user search as platform API |
| `confirm-request` | No | `memgraph.service` (via template-store) | Internal | Low | Same as clarify-intent |
| `spawn-process` | No | `flowdesk/graph-routing` | Internal | Medium | Expose service-handler resolution as platform API |
| `create-service-request` | No | `memgraph.service` directly | Internal | Low | Pass memgraph as injected context (already done via `executionContext.memgraph`) |
| `create-work-order` | No | `memgraph.service` directly | Internal | Low | Same as above |
| `request-approval` | **Yes** | None | N/A | None | Move to client package as-is |
| `assign-handler` | No | `flowdesk/graph-routing` | Internal | Medium | Expose service-handler resolution |
| `send-notification` | No | `memgraph.service` (via template-store) | Internal | Low | Same as clarify-intent |
| `manage-ticket` | No | `memgraph.service` via context | Internal | Low | Already uses context injection |
| `route-ticket` | No | `memgraph.service`, `redis.service` (via config-loader) | Internal | Medium | Same as classify-intent |
| `check-sla` | No | `memgraph.service` via context | Internal | Low | Already uses context injection |
| `laptop-assistant` | **Yes** | None | N/A | None | Move to client package as-is |

### 7.2 Service Layer

| Service file | Can extract | Platform API used | API type | Effort | Extraction approach |
|---|---|---|---|---|---|
| `import-config.js` | Yes | None | N/A | None | Move with FlowDesk |
| `graph-routing.js` | No | `neo4j-driver` direct (own pool); Memgraph schema: `User`, `OrganizationUnit`, `ServiceCatalogItem`, `Location`, `Role` | Bypass | High | Platform must expose a generic entity-graph-traversal API, or this stays as a data-only service talking to platform DB |
| `semantic-search.js` | **Yes** | None (raw HTTP to TEI + Qdrant) | Contract (env vars only) | None | Move with FlowDesk |
| `keyword-filter.js` | No | `config-loader.service` (lazy) | Internal | Low | Convert to pure function; inject config externally |
| `config-loader.service.js` | No | `memgraph.service`, `redis.service` | Internal | Medium | Platform needs `IConfigStore` contract with Memgraph + Redis implementations |
| `template-store.js` | No | `memgraph.service` | Internal | Low | Platform needs `ITemplateStore` contract |
| `graph-loader.js` | No | `graphCatalogService` | Internal | Low | `graphCatalogService` is a stable-ish API; document it as a contract |
| `graph-loader-kb.service.js` | No | `graphCatalogService` | Internal | Low | Same as graph-loader |
| `kb-runtime-bridge.js` | No | `RuntimeEngine`, `AOPEGAdapter`, `graphCatalogService` | Internal | High | Platform needs public graph execution API (already partially exists) |
| `gxe-manager-bridge.js` | No | `ExecutionRegistry`, `redis.service` | Internal | Medium | Platform needs execution monitoring contract |
| `graph-hot-reload.service.js` | **Yes** | Redis PubSub (env-var URL) | Contract | Low | Move with FlowDesk; PubSub channel name is the only shared point |
| `dialog-session.js` | No | `graph-loader.js`, `graph-routing.js` | Internal | High | Rewrite against public execution APIs |
| `workflow-runner.js` | Partial | `graph-loader.js` | Internal | Medium | Depends on graph-loader contract |
| `runtime-chat.js` | No | `aopeg/index`, `AOPEGAdapter`, `graphCatalogService`, `codex-loader.service` | **Critical internal** | High | Requires platform public execution API + governance contract |
| `qdrant-upload.js` | **Yes** | None | N/A | None | Move with FlowDesk (standalone script) |
| `sql-to-graph-import.js` | **Yes** | `neo4j-driver` (own connection) | Bypass | Low | Move with FlowDesk; uses own DB connection |
| `generate-utterances.js` | **Yes** | None | N/A | None | Move with FlowDesk |
| `data/service-catalog.json` | **Yes** | None | N/A | None | Move with FlowDesk |
| `data/utterances.json` | **Yes** | None | N/A | None | Move with FlowDesk |
| `graphs/*.graph.json` | **Yes** | None | N/A | None | Move with FlowDesk |
| `executors/` (9 files) | No | `graph-routing.js`, `neo4j-driver` | Internal | Medium | Replace with AOPEG executors (duplication already exists) |
| `executors/dialog/` (10 files) | No | `graph-routing.js`, `semantic-search.js` | Internal | Medium | Same as above |

### 7.3 Routes and Controllers

| Coupling point | Can extract | Platform APIs used | Effort | Approach |
|---|---|---|---|---|
| `api/index.js` registration | Trivially | None | None | Remove 2 lines; FlowDesk mounts its own Express sub-app |
| `flowdesk.route.js` | Yes | FlowDesk controller only | Low | Move to FlowDesk package |
| `flowdesk-config.route.js` | Yes | `memgraph.service`, `config-loader.service` | Low | Move to FlowDesk; keep `memgraph.service` as injection |
| `flowdesk.controller.js` | No | `graph-routing.js`, `semantic-search.js`, `keyword-filter.js` | Medium | Move with FlowDesk after platform contracts defined |

### 7.4 Core Platform Violations (highest priority to fix)

| File | Coupling point | Fix |
|---|---|---|
| `api/src/services/graph/gxe-defaults.js` | `FLOWDESK_TOOLS` hard-coded | Remove; introduce plugin registration mechanism for tool sets |
| `api/src/services/graph/graph-path-generator.js` | Hard-coded `flowdesk.classify_intent` / `flowdesk.ask_beneficiary` etc. branches | Remove; replace with generic path hinting via plugin metadata |
| `api/src/core/aopeg/plugins/plugin-loader.js` | `flowdeskPlugin` registered inside platform plugin loader | Extract via dynamic plugin discovery or external registration |
| `api/src/services/workspace/extraction/flowdesk/` | FlowDesk extraction pipeline inside platform workspace | Move to FlowDesk package; expose platform draft API |
| `api/src/services/agents/AgentBootstrapService.js` | `'agent-flowdesk'` preset | Move preset definition to FlowDesk package; platform reads from config |

### 7.5 Frontend

| File | Can extract | Platform APIs used | Effort | Approach |
|---|---|---|---|---|
| `FlowDeskPage.jsx` + `FlowDeskDemo.jsx` | **Yes** | `/api/v1/flowdesk/*`, `/api/v1/graph-catalog` | Low | Move to FlowDesk SPA; graph-catalog calls use stable platform routes |
| `FlowDeskConfigPage.jsx` | **Yes** | `/api/v1/flowdesk/config/*` | Low | Move with FlowDesk |
| `waitingNodeToForm.js` | Partial | Depends on FormRenderer component | Medium | FormRenderer is a platform component; either duplicate or export |
| `flowdesk.css` | **Yes** | None | None | Move with FlowDesk |
| `flowdeskConfigStore.js` | **Yes** | `/api/v1/flowdesk/config/*` | None | Move with FlowDesk |
| `App.jsx` routes | Trivially | None | None | Remove 4 lines from platform router |

---

## Summary

### File counts by layer

| Layer | Total files | Self-contained (extractable as-is) | Require platform contract changes |
|---|---|---|---|
| AOPEG plugin executors | 17 (incl. plugin + index) | 2 (`request-approval`, `laptop-assistant`) | 15 |
| `api/src/services/flowdesk/` | 51 files | ~15 (static data, scripts, standalone services) | ~36 |
| `api/src/services/workspace/extraction/flowdesk/` | 13 files | 0 | 13 |
| `api/src/db/seeds/` | 3 files | 3 (move with data) | 0 |
| Routes + controller | 3 files | 0 (depend on FlowDesk services) | 3 |
| Frontend | 6 files | 5 | 1 (`waitingNodeToForm.js` depends on FormRenderer) |
| **Total FlowDesk files** | **93** | **~25** | **~68** |

### Internal vs contract API usage

| Category | Count |
|---|---|
| Files using internal platform APIs (`memgraph.service`, `redis.service`, `AOPEGAdapter`, `RuntimeEngine`, `graphCatalogService`, `aopeg/index`, `codex-loader.service`, `ExecutionRegistry`) | ~28 files |
| Files using bypass (own `neo4j-driver` connections, using `import-config.js` credentials) | 4 files (`graph-routing.js`, `search-location.executor.js`, `find-user.executor.js`, `sql-to-graph-import.js`) |
| Files that could use public contracts only | ~25 files |
| Files that are fully self-contained today | ~10 files |

### Overall extraction complexity

**High overall complexity.** The FlowDesk layer is not a thin client — it penetrates to the DB layer (own connection pools), the AOPEG runtime internals, the Codex governance service, and the platform graph path generation logic. The deepest couplings are:

1. `runtime-chat.js` — imports `aopeg/index.initializeAOPEG()` and `pluginRegistry` directly; this is the innermost platform state
2. `plugin-loader.js` — FlowDesk plugin registered as a first-class platform plugin
3. `gxe-defaults.js` + `graph-path-generator.js` — FlowDesk tool names baked into platform graph generation AI

### What the platform must expose to support FlowDesk as an external consumer

| Required platform contract | Currently exists? | Notes |
|---|---|---|
| **Graph execution API** — execute a named graph with input, get result; pause/resume for multi-turn | Partial (`RuntimeEngine` is internal) | Must be stabilized as a public REST or library API |
| **Graph catalog API** — CRUD for graphs, list by namespace | Yes (`/api/v1/graph-catalog`) | Already a REST route; needs versioning/stability guarantee |
| **Entity query API** — look up `User`, `Location`, `OrganizationUnit` by id/name | No | Currently done by FlowDesk via direct Memgraph access; platform needs `GET /api/v1/org/users/:id`, etc. |
| **Template API** — fetch/render `NotificationTemplate` by key | No | Currently FlowDesk bypasses through `memgraph.service` |
| **Config store API** — read/write typed business config (SLA, queues, thresholds) | Partial (config-loader is internal) | Needs to be exposed as a public REST or service interface |
| **Plugin registration contract** — register domain executors without modifying `plugin-loader.js` | No | Plugin loader must support dynamic/external plugin packages |
| **Execution monitoring** — register executions with GxeManager | No (gxe-manager-bridge is internal) | Needs a public event contract |
| **WorkSpace extraction contract** — contribute extraction pipelines without embedding in platform code | No | Platform needs a registered extractor interface |
| **Tool set registration** — contribute `FLOWDESK_TOOLS` without modifying `gxe-defaults.js` | No | Platform needs plugin-provided tool sets |

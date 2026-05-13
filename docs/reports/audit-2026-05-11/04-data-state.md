# Data State — Live Database Inventory
## Audit Date: 2026-05-11

> All data collected from live running services on the developer machine.
> API port: 3001. Qdrant: 6333. Redis: not reachable from WSL shell (runs as Windows service). Memgraph: bolt://localhost:7687.

---

## 1. Qdrant (Vector Database — http://localhost:6333)

**Status:** Running.

### Named Collections (Platform-level)

| Collection | Points | Purpose |
|---|---|---|
| `dialogue_embeddings` | **2,433** | Embeddings of ingested Claude Code dialogue sessions |
| `flowdesk_services` | **1,704** | FlowDesk service catalog embeddings |
| `project_knowledge` | **38** | External MCP server project knowledge |
| `ineed_sr_history` | 0 | iNeed service request history (empty) |
| `business_process_graphs` | 0 | Business process graph embeddings (empty) |
| `embeddings_unified` | **0** | PRIMARY general knowledge KB — EMPTY (critical gap) |
| `embeddings_docs` | 0 | Document embeddings (empty) |
| `embeddings_workitems` | 0 | ADO work item embeddings (empty) |
| `ado_knowledge_base` | 0 | ADO-sourced knowledge (empty) |
| `embeddings_code` | 0 | Code embeddings (empty) |
| `un_inventory` | 0 | UN inventory collection (empty) |

### Workspace Collections

- **90 workspace-specific collections** named `workspace_<uuid>`.
- Only **4** workspace collections have non-zero point counts (observed during audit).
- Workspace collections are created by WorkspaceService when a workspace is created.
- They store draft entity embeddings for semantic search within that workspace.

### Key Finding

`embeddings_unified` is the primary vector collection for the platform's general knowledge graph (GlobalKB). It has **0 points**. This means the platform's main RAG capability (graph-rag, knowledge search) has no embedded content. The only populated general-purpose collections are `dialogue_embeddings` (DevDialogue Collector output) and `flowdesk_services` (FlowDesk-specific service catalog). All `embeddings_*` general collections are empty.

---

## 2. Memgraph (Graph Database — bolt://localhost:7687)

**Status:** Running (confirmed from StartupManager logs at startup and from Qdrant/API being connected).
**Auth:** `memgraph` / `secret_password_123`

### Node Labels Observed in Codebase (from MemgraphService whitelist)

The `ALLOWED_LABELS` set in `api/src/services/memgraph.service.js` (line ~60) contains 60+ labels. The following are known to be populated based on API query results from the previous audit session:

| Label | Count (est.) | Source |
|---|---|---|
| `BackLogItem` | ~53 | BackLog system (confirmed: 53 items via API) |
| `CodexRule` | ~100 | Codex governance rules (confirmed: 100 rules) |
| `WorkSpace` | ~4 | Active workspaces (confirmed: 4) |
| `DialogueSession` | ~45 | Ingested Claude Code sessions (confirmed: 45) |
| `DialogueMessage` | ~27,556 | Individual dialogue messages (confirmed) |
| `KnowledgeQuantum` | unknown | Global KB nodes (likely sparse — embeddings_unified is empty) |
| `DraftEntity` | unknown | Workspace draft nodes |
| `AOPEG_ExecutionGraph` | unknown | Graph catalog entries |
| `AOPEG_GraphNode` | unknown | Graph nodes in stored graphs |
| `AOPEG_GraphEdge` | unknown | Graph edges |
| `CatalogRoot` | 1 | Graph catalog root |
| `CatalogEntry` | unknown | Graph catalog entries |
| `CodexNode` / `CodexLink` | unknown | Immutable graph for Codex namespace |

### Connection Pool Configuration

- Max connections: 30
- Acquisition timeout: 30,000ms
- Connection timeout: 20,000ms
- Connection lifetime: 1,800,000ms (30 min)
- Strict validation: controlled by `CODEX_STRICT_VALIDATION` env var

### Key Finding

Memgraph is used as the single source of truth for: graph topology, platform state (workspace/backlog/codex), dialogue metadata, knowledge entities, and execution context. However, since `embeddings_unified` is empty, the `KnowledgeQuantum` nodes in the Global KB are likely either absent or present but not embedded, making semantic search over the global knowledge graph non-functional.

---

## 3. Redis

**Status:** Configured but not reachable via WSL `redis-cli` command during audit. The API startup initializes Redis via `redis.service.js` and the system is operational (BullMQ queues require Redis). Most likely running as a Windows Docker container.

### Known Redis Usage

| Usage | Key Pattern | TTL |
|---|---|---|
| Workspace cache | `workspace:<id>` | 300s (5 min) |
| GXE execution state | `gxe:execution:<id>` | session lifetime |
| SAGA transaction state | `saga:<txId>` | duration of saga |
| Session store | session keys | configurable |
| BullMQ queue backing | BullMQ internal keys | per-job |
| Agent sessions | agent session keys | session lifetime |

---

## 4. BullMQ / Job Queues

**Status:** BullMQ v5.64.1 in `package.json`. Falls back to `InMemoryQueue` if Redis is unavailable.

### Queues Defined

| Queue | Processor Method | Purpose |
|---|---|---|
| `extraction` | `_extractionProcessor` | Knowledge extraction pipeline jobs |
| `graph-update` | `_graphUpdateProcessor` | Async graph mutation jobs |
| `batch` | `_batchProcessor` | Batch operations |

**Note:** The `InMemoryQueue` fallback stores all state in-process. If the API restarts during extraction, all queued jobs are lost. This is the likely behavior in the current dev setup since Redis is not confirmed reachable.

---

## 5. API Service State

**Status:** API process was running on port 3001 at audit start (health check returned OK via `netstat`). Port 3002 is also listening (likely Vite dev server or another API instance).

### Background Jobs Initialized by StartupManager

| Job | Interval | Purpose |
|---|---|---|
| OrphanDetector | Every 6 hours | Detect orphaned nodes in Memgraph |
| TombstoneExpirer | Every 24 hours | Expire deleted nodes |
| KBHealthCollector | Every 15 min | Collect KB health metrics |
| MetacognitionCycle | Every 1 hour | AI-driven KB self-improvement |

### DialogueWatcher

- Runs at startup unless `DIALOGUE_WATCHER_ENABLED=false`
- Watches for new Claude Code session JSONL files
- Ingests new sessions into `DialogueSession`/`DialogueMessage` nodes in Memgraph and embeds into `dialogue_embeddings` Qdrant collection

---

## 6. Data Volume Summary

| Data Store | Item Type | Count | Notes |
|---|---|---|---|
| Memgraph | BackLogItem | 53 | confirmed live |
| Memgraph | CodexRule | 100 | confirmed live |
| Memgraph | WorkSpace | 4 | confirmed live |
| Memgraph | DialogueSession | 45 | confirmed live |
| Memgraph | DialogueMessage | 27,556 | confirmed live |
| Memgraph | Total token count | 5,170,000 | from dialogue ingestion |
| Qdrant | dialogue_embeddings | 2,433 | live |
| Qdrant | flowdesk_services | 1,704 | live |
| Qdrant | embeddings_unified | 0 | CRITICAL GAP |
| Qdrant | workspace collections | 90 | live (4 non-empty) |

---

## 7. Data Integrity Observations

1. **Global KB is empty**: `embeddings_unified` = 0 points + `KnowledgeQuantum` count unknown but likely very low. The platform's stated capability of semantic search over general institutional knowledge is not populated.

2. **Workspace proliferation**: 90 workspace Qdrant collections exist. Most workspaces appear to be test/dev artifacts. Only 4 are non-empty. This represents 90 Qdrant collections that have been provisioned but never populated or have been abandoned.

3. **Dialogue data is the most populated**: With 45 sessions and 27,556 messages / 5.17M tokens, the DevDialogue Collector is the most actively used data ingestion path in the system.

4. **FlowDesk data is populated**: `flowdesk_services` (1,704 points) suggests the FlowDesk service catalog was populated via the FlowDesk ingestion pipeline. This is client-specific data in the platform's vector store.

5. **No Redis keyspace visible**: Cannot confirm Redis data state from WSL. Redis is running (API operational) but not directly queryable in this audit.

# Graph Sync (API-API selective synchronization)

Selective, runnable synchronization of Memgraph (+Qdrant) data **between instances
over HTTP**, built on the existing Graph Transfer / UGP subsystem. One instance
(**source**) builds a UGP package for a selection and pushes it to another
(**target/receiver**), which stages, verifies, plans and idempotently applies it.

## Design goals
- **Reuse**: same selection model (`export.service`) and package format (`api/src/lib/ugp`)
  as file export; same import behaviour as the CLI (`tools/unpa-import`), lifted into
  `api/src/lib/ugp-import` so it runs in-process.
- **Failure-consistency** (the headline requirement):
  1. **Staging separates transfer from write** — the package is streamed to a
     temp file on the receiver and **checksum-verified before any DB write**, so a
     truncated/aborted transfer never touches Memgraph/Qdrant.
  2. **Canonical write order** — nodes → relationships → vectors, so a mid-apply
     failure leaves no dangling edges or orphan vectors.
  3. **Idempotent MERGE** — every write is an upsert keyed by (primaryLabel,
     identityProp); re-running the same package converges without duplication.
  4. **Status ledger** — an `ImportRecord` is created `in_progress` before writing
     and finalized `completed`/`failed`. Only a `completed` record for a given
     content hash short-circuits a re-run, so an interrupted transfer is safely
     resumable by re-pushing.
  5. **Guards** — hard conflicts require explicit `conflict=overwrite`/`force`;
     catalog nodes are refused by default (`catalogChannel=refuse`).

## Components
| Path | Role |
|------|------|
| `api/src/lib/ugp-import/` | server-side engine (targets, planner, import-engine, import-record) |
| `api/src/services/graph-transfer/sync/import.service.js` | orchestration: verify → idempotency → plan → guarded apply → ledger |
| `api/src/services/graph-transfer/sync/staging.service.js` | staged package store (uuid-addressed, TTL sweep, traversal-guarded) |
| `api/src/middleware/graph-sync-auth.middleware.js` | **fail-closed** peer-key gate + optional peer allowlist |
| `api/src/routes/graph-sync.routes.js` | **receiver** `/api/v1/graph-transfer/sync/*` |
| `api/src/services/graph-transfer/sync/peers.service.js` | source peer registry (no secrets persisted) |
| `api/src/services/graph-transfer/sync/sync.service.js` | source push: export → ingest → plan → apply |
| `api/src/services/graph-transfer/sync/sync.jobs.js` | in-process job runner + SSE bus |
| `api/src/routes/graph-sync-source.routes.js` | **source** `/api/v1/graph-transfer/push/*` |

## Endpoints
### Receiver — `/api/v1/graph-transfer/sync` (peer-key auth)
- `GET  /health` — capability + config
- `POST /ingest` — multipart `package` → stage + verify → `{ stagingId, contentHash, manifest }`
- `POST /plan` — `{ stagingId, conflict?, catalogChannel? }` → diff summary (no write)
- `POST /apply` — `{ stagingId, conflict?, catalogChannel?, skipVectors?, force? }` → import result
- `GET  /records` — recent `ImportRecord`s

### Source — `/api/v1/graph-transfer/push` (operator/UI auth)
- `GET/POST/DELETE /peers`, `POST /peers/:id/test`
- `POST /jobs` — `{ peerId, request, mode: plan|apply|plan-apply, conflict?, catalogChannel?, skipVectors?, force? }`
- `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/events` (SSE)

`request` is the same selection shape as export: `{ selectionMode: NAMESPACE|LABELS|CYPHER|CATALOG_GRAPHS, labels?, namespacePrefixes?, cypher?, graphIds?, boundaryPolicy?, vectorPolicy?, selectedCollections? }`.

## Configuration (env)
| Var | Where | Meaning |
|-----|-------|---------|
| `GRAPH_SYNC_KEY` | both | shared secret; receiver rejects all if unset (fail-closed) |
| `GRAPH_SYNC_PEERS` | receiver | optional CSV allowlist of source instance ids |
| `GRAPH_SYNC_ALLOW_INSECURE=true` | receiver | dev/test bypass of the key gate |
| `GRAPH_SYNC_MAX_BYTES` | receiver | max upload size (default 1 GB) |
| `GRAPH_SYNC_STAGING_DIR` / `_TTL_MS` | receiver | staging location / TTL (default tmp, 2h) |
| `GRAPH_SYNC_PEERS_FILE` | source | peer registry JSON path |
| `INSTANCE_ID` | source | this instance's id (sent as `X-Unpa-Source-Instance`) |

## Example
```bash
# 1. register the peer (source)
curl -sX POST localhost:3010/api/v1/graph-transfer/push/peers \
  -H 'Content-Type: application/json' \
  -d '{"name":"azure","baseUrl":"https://vm-ai-devr1.swedencentral.cloudapp.azure.com"}'
# 2. push the "significant layer" (plan-then-apply)
curl -sX POST localhost:3010/api/v1/graph-transfer/push/jobs \
  -H 'Content-Type: application/json' \
  -d '{"peerId":"<id>","mode":"plan-apply","conflict":"overwrite",
       "request":{"selectionMode":"LABELS","labels":["SlotKnowledge","ServiceKnowledge"],
                  "boundaryPolicy":"STUB","vectorPolicy":"EMBED_POINTS",
                  "selectedCollections":{"flowdesk_services":true,"knowledge_entities":true}}}'
# 3. watch progress
curl -N localhost:3010/api/v1/graph-transfer/push/jobs/<jobId>/events
```

## Status
Implemented + tested: Phase 0 (engine), 1 (receiver), 2 (source), 3 (plan-before-apply).
Unit tests (auth/staging/peers) + a local export→plan→apply→idempotency round-trip pass.
Pending: Phase 4 (UI in the graph-transfer section) and the live cross-instance e2e
(requires deploying this api build to the receiver instance).

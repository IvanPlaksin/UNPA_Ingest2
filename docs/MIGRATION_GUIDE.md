# UNPA_Ingest — Database Migration Guide

> **Purpose:** Transfer persistent database state between environments — most commonly from one developer's machine to another (dev → dev onboarding), or from a local machine to staging/production.
>
> **Databases covered:** Memgraph (graph), Qdrant (vectors), Redis (cache + job queue).

---

## Table of Contents

1. [Storage Systems Overview](#1-storage-systems-overview)
2. [What Gets Migrated and Why](#2-what-gets-migrated-and-why)
3. [Tooling Overview](#3-tooling-overview)
4. [Dev → Dev: Onboarding a New Developer](#4-dev--dev-onboarding-a-new-developer)
5. [Full Backup (Scheduled or Ad-hoc)](#5-full-backup-scheduled-or-ad-hoc)
6. [Individual Database Scripts](#6-individual-database-scripts)
7. [Verification After Migration](#7-verification-after-migration)
8. [Common Issues](#8-common-issues)
9. [What NOT to Migrate](#9-what-not-to-migrate)

---

## 1. Storage Systems Overview

| Service | Container | Port | Data Stored | Persistence |
|---------|-----------|------|-------------|-------------|
| **Memgraph** | `projectadvisor-memgraph` | 7687 (Bolt) | AOPEG graphs, Codex rules, BackLog tasks, knowledge nodes | Volume `memgraph-data` |
| **Qdrant** | `projectadvisor-qdrant` | 6333 (HTTP) | Vector embeddings per document chunk | Volume `qdrant-data` |
| **Redis** | `projectadvisor-redis` | 6379 | BullMQ job queue state, session cache | Volume `redis-data` (AOF enabled) |
| **MSSQL** | `projectadvisor-mssql` | 1433 | Read-only source data (SQL Server imports) | Volume `mssql-data` |

**TEI cache** and **Ollama models** are excluded — they are large model weight caches that rebuild automatically on first container start. Never include them in migrations.

---

## 2. What Gets Migrated and Why

### Memgraph — CRITICAL

Memgraph is the central store for all structured knowledge in the system. Losing it means losing:
- All AOPEG workflow graphs (the "programs" in "Graph = Program")
- All Codex rules and governance standards
- All BackLog tasks and their execution history
- All extracted knowledge nodes and their relationships
- All WorkSpace sessions and draft entities

**Namespaces stored in Memgraph:**

| Namespace | Node Labels | Content |
|-----------|-------------|---------|
| `CODEX` | `CodexPrinciple`, `CodexRule`, `CodexSection`, ... | System constitution and rules |
| `BLACK_CODEX` | `BlackCodexEntry` | Anti-patterns |
| `core_` | Service, Pipeline, Component | System internal entities |
| `project_{id}` | File, Class, WorkItem, Document | Per-project extracted knowledge |
| `meta_` | Strategy, DataType, ExtractionCycle | Methodological knowledge |
| `common_` | Term, Concept, Organization | Shared vocabulary |
| `workspace_{id}` | WorkSpace, DraftEntity, DraftRelationship | Isolated extraction sandboxes |

**Backup format:** Cypher `.cypherl` file — plain text, human-readable, replayable on any Memgraph instance.

### Qdrant — CRITICAL

Qdrant stores vector embeddings that power all semantic search. Without it, knowledge graph queries degrade to keyword-only mode and RAG (retrieval-augmented generation) stops working.

**Collections** — naming convention:

| Collection Pattern | Content |
|--------------------|---------|
| `codex_knowledge` | CODEX rule embeddings |
| `core_knowledge` | Core system knowledge |
| `project_{id}` | Per-project document embeddings |
| `workspace_{id}` | Per-workspace extraction embeddings |
| `embeddings_code` | Code entity embeddings |
| `embeddings_docs` | Document embeddings |
| `embeddings_workitems` | ADO work item embeddings |
| `dialogue_embeddings` | Chat session embeddings |
| `business_process_graphs` | iNEED intent matching |
| `un_inventory` | Equipment catalog embeddings |

**Backup format:** Qdrant binary snapshots (`.snapshot`) — one file per collection. Snapshots are created via Qdrant's native Snapshot API and preserve the full collection state including vector indices.

### Redis — HIGH

Redis stores:
- **BullMQ job queues** — background indexing jobs, ETL pipeline state
- **Session cache** — temporary session data with TTL

AOF (Append-Only File) persistence is enabled, so data survives container restarts. During a dev-to-dev migration, losing Redis is recoverable (jobs will be re-queued on next operation) but it is included in the full export for completeness.

**Backup format:** Redis binary dump (`.rdb`) — the native RDB snapshot format.

---

## 3. Tooling Overview

### Primary Tools (Node.js — cross-platform, Windows/Linux/macOS)

These run without any npm install, using only Node.js 20+ built-ins and Docker.

| Script | Purpose |
|--------|---------|
| `scripts/migration/export.js` | Export Memgraph + Qdrant + Redis to a snapshot directory |
| `scripts/migration/import.js` | Restore from a snapshot directory |
| `scripts/migration/verify.js` | Check current database state; compare against a baseline |

### Supplementary Bash Scripts (Linux/macOS/WSL)

| Script | Purpose |
|--------|---------|
| `scripts/backup-memgraph.sh` | Memgraph dump → compressed `.cypherl.gz` |
| `scripts/restore-memgraph.sh` | Replay `.cypherl` or `.cypherl.gz` into Memgraph |
| `scripts/backup-qdrant.sh` | Qdrant snapshots per collection → `.snapshot` files |
| `scripts/restore-qdrant.sh` | Restore collections from `.snapshot` files |
| `scripts/backup-redis.sh` | BGSAVE + docker cp → `.rdb` file |
| `scripts/restore-redis.sh` | Copy `.rdb` into container + restart |

### Which tool to use?

- **Windows developer** → use the Node.js scripts (`export.js`, `import.js`, `verify.js`)
- **Linux/macOS developer or CI pipeline** → either the Node.js scripts or the bash scripts
- **Azure deployment migration** → see `scripts/migration-runbook.md`

---

## 4. Dev → Dev: Onboarding a New Developer

This is the most common migration scenario. Developer A has a populated local environment and wants to give Developer B a working starting point.

### Step 1 — Developer A: Export

Ensure your Docker containers are running:

```powershell
# Windows
docker compose ps
# All three should show: running
```

Run the export:

```powershell
# Windows / PowerShell
node scripts/migration/export.js
```

```bash
# Linux / macOS
node scripts/migration/export.js
```

This creates a snapshot directory named after the current timestamp:

```
backups/
  2026-05-13T10-00-00/
    manifest.json             ← summary with counts
    memgraph/
      memgraph_dump.cypherl   ← Cypher statements
    qdrant/
      codex_knowledge.snapshot
      core_knowledge.snapshot
      embeddings_docs.snapshot
      ...                     ← one file per collection
    redis/
      redis_dump.rdb
```

Check the summary at the end of the export output:

```
══════════════════════════════════════════════════
  Export complete!
  Memgraph : 1847 nodes, 4312 edges
  Qdrant   : 14 collections, 23042 vectors
  Redis    : 31 keys

  Snapshot saved to: D:\UN\Repos\UNPA\UNPA_Ingest\backups\2026-05-13T10-00-00
  Share this directory with the target developer.
══════════════════════════════════════════════════
```

### Step 2 — Transfer the Snapshot

Compress and transfer the snapshot directory to Developer B. Typical size: 100 MB – 2 GB depending on how much data has been ingested.

```powershell
# Windows: zip the directory
Compress-Archive -Path .\backups\2026-05-13T10-00-00 -DestinationPath snapshot.zip

# Then share via Teams, OneDrive, network share, or USB
```

```bash
# Linux / macOS
tar -czf snapshot.tar.gz backups/2026-05-13T10-00-00/
```

### Step 3 — Developer B: Prepare Target Environment

Developer B must have the full development environment set up first. See [DEV_SETUP.md](DEV_SETUP.md) for installation instructions.

Start the infrastructure (databases in Docker):

```powershell
docker compose up -d redis memgraph qdrant
```

Verify all three containers are running:

```powershell
docker compose ps
```

### Step 4 — Developer B: Import

Extract the snapshot if compressed:

```powershell
# Windows
Expand-Archive -Path snapshot.zip -DestinationPath .\backups\
```

Run the import with `--wipe` to start fresh:

```powershell
node scripts/migration/import.js --dir .\backups\2026-05-13T10-00-00 --wipe
```

> **`--wipe` is recommended** for fresh developer onboarding. It deletes all existing Memgraph data before replaying the dump, preventing duplicates. Without it, the dump is applied on top of existing data.

Expected output:

```
══════════════════════════════════════════════════
  UNPA Migration — Import
  Source: D:\...\backups\2026-05-13T10-00-00
  Mode  : WIPE + restore
══════════════════════════════════════════════════

  Snapshot info:
    Created  : 2026-05-13T10:00:00.000Z
    Memgraph : 1847 nodes, 4312 edges
    Qdrant   : 14 collections
    Redis    : 31 keys

[memgraph] Wiping existing data (--wipe flag)...
[memgraph] Replaying Cypher dump...
[memgraph] Restore complete: 1847 nodes, 4312 edges
[qdrant  ] Found 14 snapshot(s) to restore
[qdrant  ]   Restoring 'codex_knowledge'...
            → 'codex_knowledge' restored (602 vectors)
  ...
[redis   ] Stopping Redis container...
[redis   ] Redis is ready: 31 keys loaded.

══════════════════════════════════════════════════
  Import complete!
  Memgraph : 1847 nodes, 4312 edges
  Qdrant   : 14 collections restored
  Redis    : 31 keys
══════════════════════════════════════════════════
```

### Step 5 — Developer B: Verify

```powershell
node scripts/migration/verify.js --baseline .\backups\2026-05-13T10-00-00\manifest.json
```

Expected output:

```
── Memgraph ─────────────────────────────────────
  ✓  container status                running
  ✓  connection                      ok (bolt://localhost:7687)
  ✓  node count                      1847
  ✓  edge count                      4312

── Qdrant ───────────────────────────────────────
  ✓  connection                      ok (http://localhost:6333)
  ✓  collection count                14
  ✓  codex_knowledge                 602 vectors  [green]
  ...

── Redis ────────────────────────────────────────
  ✓  container status                running
  ✓  connection                      ok (PONG)
  ✓  key count                       31

── Baseline Comparison ──────────────────────────
  ✓  Memgraph nodes   1847 / expected 1847   (exact match)
  ✓  Memgraph edges   4312 / expected 4312   (exact match)
  ✓  Qdrant: codex_knowledge  602 / expected 602  (exact match)
  ...
  ✓  Redis keys       31 / expected 31       (exact match)

  ✓  All counts match baseline — migration verified.
```

### Step 6 — Post-Migration Fix (if CodexRule namespace is null)

This is a known issue (BACKLOG-0039). If Codex rules are not showing up via the API, run:

```bash
# Using bash (Linux/macOS/WSL)
echo "MATCH (r:CodexRule) WHERE r.namespace IS NULL SET r.namespace = 'Codex';" | \
  docker exec -i projectadvisor-memgraph mgconsole \
    --host 127.0.0.1 --port 7687 \
    --username memgraph --password secret_password_123 \
    --no-history
```

### Step 7 — Start the API

```powershell
cd api
npm run dev
```

---

## 5. Full Backup (Scheduled or Ad-hoc)

Use this for creating a point-in-time snapshot you can restore to later.

```powershell
# Export to a timestamped directory
node scripts/migration/export.js

# Or specify a custom directory name
node scripts/migration/export.js --dir .\backups\pre-release-v2
```

Backups accumulate in `backups/`. Clean up old ones manually or set up a retention policy.

### Skip individual databases

```powershell
# Skip Redis (often not needed for code-level backups)
node scripts/migration/export.js --skip-redis

# Memgraph only
node scripts/migration/export.js --skip-qdrant --skip-redis

# Qdrant only (fastest — no mgconsole required)
node scripts/migration/export.js --skip-memgraph --skip-redis
```

---

## 6. Individual Database Scripts

### Memgraph

```bash
# Backup (creates compressed .cypherl.gz)
./scripts/backup-memgraph.sh ./backups/memgraph

# Restore (without wiping existing data)
./scripts/restore-memgraph.sh ./backups/memgraph/memgraph_dump_20260513_100000.cypherl.gz

# Restore (wipe first — recommended for fresh import)
./scripts/restore-memgraph.sh ./backups/memgraph/memgraph_dump_20260513_100000.cypherl.gz --wipe
```

**Format:** The `.cypherl` file contains one Cypher statement per line. It is human-readable and can be inspected with any text editor. Example:

```cypher
CREATE (:CodexPrinciple {name: "Graph = Program", namespace: "Codex", ...});
CREATE (:CodexRule {id: "CODEX-RULE-BA-020", title: "...", namespace: "Codex", ...});
MATCH (a), (b) WHERE id(a) = 0 AND id(b) = 1 CREATE (a)-[:GOVERNS]->(b);
```

### Qdrant

```bash
# Backup (creates one .snapshot per collection)
QDRANT_URL=http://localhost:6333 ./scripts/backup-qdrant.sh ./backups/qdrant

# Restore
./scripts/restore-qdrant.sh ./backups/qdrant
```

### Redis

```bash
# Backup
./scripts/backup-redis.sh ./backups/redis

# Restore (stops and restarts container)
./scripts/restore-redis.sh ./backups/redis/redis_dump_20260513_100000.rdb
```

---

## 7. Verification After Migration

Always verify after import. The verify script checks:

- Container running status
- Database reachability
- Node/edge/vector counts
- Comparison against the export baseline

```powershell
# Live status only (no comparison)
node scripts/migration/verify.js

# Compare against export baseline
node scripts/migration/verify.js --baseline .\backups\2026-05-13T10-00-00\manifest.json
```

### Interpreting results

| Symbol | Meaning |
|--------|---------|
| `✓` | Check passed (or count matches baseline exactly) |
| `⚠` | Warning — small deviation (≤5 nodes/vectors) or status not green yet |
| `✗` | Failed — container unreachable, or significant count mismatch |

A `⚠` on vector counts is normal if some embeddings were still being indexed when the export ran. A `✗` on node counts means the Memgraph import likely failed.

**Exit code:** `0` if all checks pass, `1` if any check fails. Suitable for CI/CD pipelines.

---

## 8. Common Issues

### "mgconsole: command not found" inside container

This should not happen with the official Memgraph Docker image. If it does:

```bash
# Verify mgconsole is present
docker exec projectadvisor-memgraph which mgconsole
```

If missing, the container may be using a stripped-down image. Check `docker-compose.yml` for the `image:` value and ensure it is `memgraph/memgraph` (not a custom minimal image).

### Qdrant collection status stuck on "yellow"

After restore, Qdrant may show `yellow` status while it rebuilds its HNSW index. Wait 30–120 seconds and check again:

```powershell
curl http://localhost:6333/collections/codex_knowledge
```

The `status` field will transition `yellow` → `green` when the index is ready.

### Memgraph import takes very long

Large dumps (hundreds of thousands of nodes) can take 10–30 minutes. The `.cypherl` format replays one CREATE per Bolt transaction. This is safe but slow for very large datasets.

To monitor progress:

```bash
# In a separate terminal — count current nodes
echo "MATCH (n) RETURN count(n);" | \
  docker exec -i projectadvisor-memgraph mgconsole \
    --host 127.0.0.1 --port 7687 \
    --username memgraph --password secret_password_123 \
    --output-format csv --no-history
```

### Redis restart fails (port conflict)

If `docker start projectadvisor-redis` fails, another process may be using port 6379. Check:

```powershell
# Windows
netstat -ano | findstr :6379
```

### Qdrant snapshot upload blocked (file too large)

The `restore-qdrant.sh` bash script uses `docker cp` (not HTTP upload) to avoid file size limits. The Node.js `import.js` uses the same approach. If you see errors about snapshot size, ensure the target Qdrant container has enough disk space:

```bash
docker exec projectadvisor-qdrant df -h /qdrant/snapshots
```

### Node count differs by a small amount after import

Small discrepancies (1–5 nodes) can occur if:
- Some constraint violations were silently skipped during replay
- Background jobs created new nodes between export and import

A difference of 0–5 is generally acceptable for dev environments. If the difference is large (>50 nodes), the import likely encountered errors — check the console output for `WARNING` messages.

---

## 9. What NOT to Migrate

| Item | Reason |
|------|--------|
| `tei-cache` Docker volume | HuggingFace model weights — 2–4 GB, auto-downloaded on first container start |
| `ollama-models` Docker volume | LLM model weights — 5–50 GB, auto-pulled with `ollama pull` |
| `gnn-checkpoints` Docker volume | ML model checkpoints — rebuild with `gnn-service` training |
| `mssql-data` Docker volume | Source system data only — the system reads from MSSQL but does not write to it; rebuild from the original source SQL Server |
| `api/.env`, `api/node_modules/` | Project config and dependencies — set up per-developer following DEV_SETUP.md |
| `logs/` directory | Runtime logs — not meaningful across environments |
| `uploads/` directory | Temporary upload staging — files are processed and indexed; not needed post-ingestion |

---

*For Azure / production deployment migration, see [scripts/migration-runbook.md](../scripts/migration-runbook.md).*

# UNPA Azure Migration Runbook

## Overview

This runbook covers migrating UNPA_Ingest from on-premises / local dev to Azure.
Components: Node.js API, React frontend (Vite), Memgraph, Qdrant, Redis.

---

## Pre-Migration Checklist

- [ ] All environment variables documented in `.env.example` are set in Azure Key Vault / App Configuration
- [ ] `LLM_PROVIDER=azure` and `AZURE_AI_ENDPOINT` / `AZURE_AI_KEY` are set
- [ ] Docker images built and pushed to Azure Container Registry (ACR)
- [ ] Azure Container Apps / AKS environment provisioned
- [ ] DNS / SSL configured for API and frontend

---

## Step 1 — Back Up Source Data

Run from the source environment:

```bash
# Memgraph
./scripts/backup-memgraph.sh ./migration-backup/memgraph

# Qdrant
QDRANT_URL=http://localhost:6333 ./scripts/backup-qdrant.sh ./migration-backup/qdrant
```

Verify backup files exist and are non-zero size before proceeding.

---

## Step 2 — Deploy Infrastructure on Azure

### 2a. Memgraph

Deploy Memgraph in Azure Container Apps (or AKS) with:
- Persistent volume for `/var/lib/memgraph`
- Bolt port 7687 exposed internally
- Auth: set `MEMGRAPH_USER` / `MEMGRAPH_PASSWORD` env vars

### 2b. Qdrant

Deploy Qdrant container:
- Persistent volume for `/qdrant/storage`
- REST port 6333 and gRPC port 6334 exposed internally

### 2c. Redis

Use Azure Cache for Redis (recommended) or deploy Redis container.

---

## Step 3 — Restore Data

### 3a. Restore Memgraph

```bash
# From the backup .cypherl.gz file
MEMGRAPH_HOST=<azure-memgraph-host> \
MEMGRAPH_PORT=7687 \
MEMGRAPH_PASSWORD=<password> \
./scripts/restore-memgraph.sh ./migration-backup/memgraph/memgraph_dump_YYYYMMDD_HHMMSS.cypherl.gz --wipe
```

Verify: connect with mgconsole and run `MATCH (n) RETURN count(n);`

### 3b. Restore Qdrant

Qdrant snapshot restore via API:

```bash
# For each collection snapshot:
QDRANT_URL=http://<azure-qdrant-host>:6333

# Upload snapshot
curl -X POST "$QDRANT_URL/collections/<collection-name>/snapshots/upload" \
  -H "Content-Type: multipart/form-data" \
  -F "snapshot=@./migration-backup/qdrant/<collection>_<timestamp>.snapshot"

# Restore from uploaded snapshot
curl -X PUT "$QDRANT_URL/collections/<collection-name>/snapshots/recover" \
  -H "Content-Type: application/json" \
  -d '{"location": "file:///qdrant/snapshots/<collection>/<snapshot-name>"}'
```

Verify: `curl $QDRANT_URL/collections` should list all collections with non-zero vectors_count.

---

## Step 4 — Deploy Application

### 4a. Build and Push Docker Images

```bash
# Login to ACR
az acr login --name <acr-name>

# Build and push API
docker build --platform linux/amd64 -t <acr-name>.azurecr.io/unpa-api:latest ./api
docker push <acr-name>.azurecr.io/unpa-api:latest

# Build and push frontend
docker build --platform linux/amd64 -t <acr-name>.azurecr.io/unpa-mcp:latest ./mcp
docker push <acr-name>.azurecr.io/unpa-mcp:latest
```

### 4b. Deploy to Azure Container Apps

```bash
az containerapp update --name unpa-api \
  --resource-group <rg> \
  --image <acr-name>.azurecr.io/unpa-api:latest \
  --set-env-vars \
    NODE_ENV=production \
    LLM_PROVIDER=azure \
    AZURE_AI_ENDPOINT=secretref:azure-ai-endpoint \
    AZURE_AI_KEY=secretref:azure-ai-key \
    MEMGRAPH_URI=bolt://<memgraph-internal-host>:7687 \
    QDRANT_URL=http://<qdrant-internal-host>:6333 \
    REDIS_HOST=<redis-host>
```

---

## Step 5 — Smoke Tests

```bash
# Health check
curl https://<api-url>/health/live
curl https://<api-url>/health/ready

# Expected: { "status": "alive" } and { "status": "ready", "services": { ... } }
```

Manual checks:
- [ ] Login works
- [ ] Graph generation produces a graph (tests LLM provider)
- [ ] Knowledge search returns results (tests Qdrant)
- [ ] BackLog loads (tests Memgraph)

---

## Rollback Plan

If smoke tests fail:
1. Revert container image: `az containerapp update --image <previous-tag>`
2. Data is untouched (restore is non-destructive unless `--wipe` was used)
3. Switch `LLM_PROVIDER` back to `anthropic` if Azure AI issues

---

## Known Issues

- **BACKLOG-0039**: 602 CodexRules with `namespace=null` — run after restore:
  ```cypher
  MATCH (r:CodexRule) WHERE r.namespace IS NULL SET r.namespace = 'Codex';
  ```
- **Pattern B streaming (W4-04b)**: Azure AI Foundry streaming format not yet validated.
  `executionAssistantChat` and `graphAnalystChat` still use direct Anthropic SSE.
  These endpoints fall back gracefully — if Azure is configured, switch `LLM_PROVIDER=anthropic`
  temporarily until W4-04b is completed.

# UN ProjectAdvisor — Developer Setup Guide

> **Audience:** New developers joining the project who need to run the full system locally in development mode.
> **Mode covered:** Hybrid development — databases in Docker, API and frontend running locally.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [Architecture Overview](#2-architecture-overview)
3. [Prerequisites](#3-prerequisites)
4. [Credentials & API Keys](#4-credentials--api-keys)
5. [Repository Setup](#5-repository-setup)
6. [Environment Configuration](#6-environment-configuration)
7. [Starting the Infrastructure (Docker)](#7-starting-the-infrastructure-docker)
8. [Starting the API](#8-starting-the-api)
9. [Starting the Frontend](#9-starting-the-frontend)
10. [MCP Server Setup](#10-mcp-server-setup)
11. [Verification Checklist](#11-verification-checklist)
12. [Optional Services](#12-optional-services)
13. [Data Seeding](#13-data-seeding)
14. [Common Issues](#14-common-issues)
15. [Port Reference](#15-port-reference)

---

## 1. What Is This Project?

**UN ProjectAdvisor (UNPA_Ingest)** is an AI-powered institutional knowledge management platform. Its core principle is **"Graph = Program"** — business logic is not written as imperative code but encoded as executable directed-acyclic graphs (AOPEG graphs) stored in a graph database and interpreted at runtime.

The system ingests documents, PDFs, emails, SQL data and web content, builds a semantic knowledge graph from them, and exposes an AI assistant interface (Claude-backed) through which users can query, navigate and act on that knowledge.

---

## 2. Architecture Overview

The system is composed of several independently deployable services. Understanding what each one does is essential before you configure it.

### 2.1 Core Services

| Service | Role | Why It Exists |
|---------|------|---------------|
| **API** (`api/`) | Node.js/Express backend | The brain of the system. Hosts the REST API, WebSocket connections, the AOPEG graph runtime engine (GXE), BackLog task system, Codex rules engine, and all integrations |
| **Frontend** (`mcp/`) | React + Vite single-page application | Graph editor UI built on ReactFlow. Lets users visually create, inspect and run AOPEG graphs, manage the knowledge base, and chat with the AI assistant |
| **Memgraph** | Graph database (Neo4j-compatible) | Primary persistence for AOPEG graphs, knowledge nodes, and all structured relational data. Uses Bolt protocol. The "source of truth" for the system |
| **Qdrant** | Vector database | Stores embedding vectors for semantic similarity search. Every document chunk is vectorised and indexed here to support RAG (retrieval-augmented generation) queries |
| **Redis** | Cache + job queue | Two roles: fast in-memory cache for sessions and computed results; job queue broker for BullMQ background workers (document indexing, ETL pipeline) |
| **MCP Server** (`d:/UN/Repos/MCP_CLAUDE/mcp-server/`) | Model Context Protocol server | A separate Node.js process that bridges Claude Code / Claude Desktop to the project's knowledge graph, artifact store and BackLog system. Provides `project-knowledge` tools used directly in Claude conversations |

### 2.2 Optional Services (not required for basic development)

| Service | Role | When You Need It |
|---------|------|-----------------|
| **MSSQL** (SQL Server) | Relational data source | Only when working on the SQL Import feature that ingests data from external SQL Server databases |
| **GNN Service** (`gnn-service/`) | Python FastAPI — Graph Neural Networks | Only when working on graph structure analysis features (node classification, link prediction) |
| **TEI** (HuggingFace Text Embeddings Inference) | Local embedding model server | Alternative to cloud-based embeddings. Use when you need offline vectorisation or want the `intfloat/multilingual-e5-large` model locally |
| **Ollama** | Local LLM inference | Only when you want to run a local LLM (e.g., Llama 3.2) instead of calling Anthropic or Azure APIs |
| **ETL Worker** (`indexing-pipeline/`) | Document indexing pipeline | Only when testing bulk document ingestion workflows |
| **FlowDesk Proxy** (`flowdesk-proxy/`) | .NET SignalR reverse proxy | Only for FlowDesk client-specific features |

### 2.3 Key Architectural Concepts

- **AOPEG Graph / GXE RuntimeEngine** — Business logic lives in graph nodes and edges stored in Memgraph. The `RuntimeEngine` (`api/src/runtime/RuntimeEngine.js`) executes these graphs node by node following topological order.
- **BackLog System** — Task management with state machines, AI agent executors, and review cycles. Accessible via MCP tools in Claude.
- **Codex** — A rule and standard system (like a living style guide) stored in Memgraph and queryable via API.
- **Polystore** — The system supports pluggable backends: Memgraph or PostgreSQL+AGE for graphs; Qdrant or pgvector for vectors.
- **Namespace Separation** — `ProjectAdvisor` is the core platform; `FlowDesk` is a client project. These must never be mixed in code, routes, or file names.

---

## 3. Prerequisites

Install the following tools before proceeding.

### 3.1 Required

| Tool | Version | Download / Install |
|------|---------|--------------------|
| **Node.js** | 20 LTS or newer | https://nodejs.org — use the LTS release |
| **npm** | 9+ (bundled with Node) | Included with Node.js |
| **Docker Desktop** | Latest stable | https://www.docker.com/products/docker-desktop — must be running before starting infrastructure |
| **Git** | Any recent version | https://git-scm.com |

### 3.2 Windows-Specific

On Windows 11 (as used in this project):

- Enable **WSL 2** for Docker Desktop: Settings → General → "Use WSL 2 based engine"
- Allocate at least **8 GB RAM** to Docker: Settings → Resources → Memory
- PowerShell 5.1 is the default shell — all commands below work in PowerShell

### 3.3 Recommended

| Tool | Purpose |
|------|---------|
| **VS Code** with Claude Code extension | Primary IDE used by the team |
| **Python 3.10+** | Only needed if running the GNN service locally |

---

## 4. Credentials & API Keys

This section explains every credential the project uses, what it does, and how to obtain it.

### 4.1 Required for Basic Development

#### Anthropic API Key (`ANTHROPIC_API_KEY`)

**What it is:** Grants access to Claude models (Sonnet, Opus, Haiku) via the Anthropic API. The system uses Claude as the AI backbone for graph execution, BackLog agents, and document analysis.

**Where to get it:**
1. Go to https://console.anthropic.com
2. Sign in with your work account (or request access from the project lead)
3. Navigate to **API Keys** → **Create Key**
4. Copy the key — it starts with `sk-ant-`

**Usage limits (configured in `.env`):**
```
ANTHROPIC_RPM_LIMIT=50          # requests per minute
ANTHROPIC_DAILY_TOKENS=500000   # token budget per day
ANTHROPIC_DAILY_BUDGET=20       # USD cap per day
```

---

#### Encryption Key (`CREDENTIAL_ENCRYPTION_KEY`)

**What it is:** A 64-character hexadecimal string used as an AES-256 key to encrypt credentials stored in the database (e.g., DataSource passwords). This must be stable — if it changes, all encrypted credentials become unreadable.

**How to generate one:**
```powershell
# PowerShell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Minimum 0 -Maximum 256) })
```
```bash
# Or in bash (if available)
openssl rand -hex 32
```

**Development default (already set in `api/.env`):**
```
CREDENTIAL_ENCRYPTION_KEY=b21913bf45d8d5ce845726ada5032bff246de296d0b37c33a19282da48404f7e
```
You can use this value as-is for local development. Never reuse it in production.

---

### 4.2 Required Only for Specific Features

#### HuggingFace Token (`HF_TOKEN`)

**What it is:** API token for HuggingFace Hub. Required only if you run the **TEI (Text Embeddings Inference)** service locally to download the embedding model.

**Where to get it:**
1. Go to https://huggingface.co → Sign in
2. Settings → Access Tokens → New token (read permission is enough)

**When you need it:** Only if `--profile embeddings` is used to start the TEI container, or if running TEI manually.

---

#### Azure DevOps PAT (`ADO_PAT`, `ADO_ORG_URL`)

**What it is:** A Personal Access Token for Azure DevOps. Used by the ETL worker when ingesting content from Azure DevOps repositories (wikis, work items).

**Where to get it:**
1. Go to your Azure DevOps organization (e.g., `https://dev.azure.com/your-org`)
2. User Settings (top-right avatar) → Personal Access Tokens
3. New Token → select **Code (Read)** and **Work Items (Read)** scopes
4. Set expiry to 90 days (or as per team policy)

**When you need it:** Only when working on Azure DevOps ingestion features. Leave blank if not needed.

---

#### Google Gemini API Key (`GEMINI_API_KEY`, `GOOGLE_AI_API_KEY`)

**What it is:** Access to Google Gemini models. Used as an alternative LLM provider in the indexing pipeline and MCP server.

**Where to get it:**
1. Go to https://aistudio.google.com
2. Get API Key → Create API key in a new or existing project

**When you need it:** Only if `LLM_PROVIDER` is set to use Gemini, or for Gemini-backed embedding alternatives.

---

#### Azure AI Foundry (`AZURE_AI_ENDPOINT`, `AZURE_AI_KEY`)

**What it is:** Enterprise Azure deployment of Claude models. Used in production as the primary LLM provider when `LLM_PROVIDER=azure`.

**Where to get it:** Request from the infrastructure team — these are provisioned per deployment in Azure AI Foundry.

**When you need it:** Not required for local development. `LLM_PROVIDER=anthropic` is used locally.

---

### 4.3 MCP Server–Specific Credentials

These are used by the MCP server to integrate with Claude.ai projects (for knowledge sync features).

| Variable | What It Is | How to Get |
|----------|-----------|------------|
| `CLAUDE_SESSION_KEY` | Claude.ai browser session cookie | Extract from browser dev tools after signing into claude.ai — Network tab → any API request → Cookie header → `sessionKey` value |
| `CLAUDE_ORGANIZATION_ID` | UUID of your Claude.ai organization | Found in the URL when browsing your Claude.ai org settings |
| `CLAUDE_PROJECT_ID` | UUID of the target Claude.ai project | Found in the URL when viewing a Claude.ai project |

**When you need these:** Only for the knowledge sync feature that pushes artifacts to Claude.ai projects. The MCP server functions without them (BackLog, knowledge graph tools work without Claude.ai integration).

---

### 4.4 Database Credentials (Fixed for Development)

These are hardcoded for local development and Docker containers. Do not change them unless you have a specific reason.

| Service | Variable | Default Value | Notes |
|---------|----------|---------------|-------|
| Memgraph | `MEMGRAPH_USER` | `memgraph` | Fixed by Memgraph default |
| Memgraph | `MEMGRAPH_PASSWORD` | `secret_password_123` | Set in docker-compose.yml |
| MSSQL | `MSSQL_USER` | `sa` | SQL Server SA account |
| MSSQL | `MSSQL_SA_PASSWORD` | `SqlExpress2022#Dev` | Set in docker-compose.yml |
| Redis | — | No password | Dev mode — no auth |
| Qdrant | — | No password | Dev mode — no auth |

---

## 5. Repository Setup

### 5.1 Clone the Main Repository

```powershell
git clone <repo-url> d:\UN\Repos\UNPA\UNPA_Ingest
cd d:\UN\Repos\UNPA\UNPA_Ingest
```

### 5.2 Clone the MCP Server (separate repository)

The MCP server lives in a separate repository and is expected at a specific path:

```powershell
# Create the parent directory if it does not exist
New-Item -ItemType Directory -Force "d:\UN\Repos\MCP_CLAUDE"

git clone <mcp-server-repo-url> d:\UN\Repos\MCP_CLAUDE\mcp-server
```

> The path `d:/UN/Repos/MCP_CLAUDE/mcp-server` is hardcoded in `.mcp.json` at the project root. If you place it elsewhere, update that file accordingly.

### 5.3 Install Dependencies

```powershell
# API backend
cd d:\UN\Repos\UNPA\UNPA_Ingest\api
npm install

# Frontend
cd d:\UN\Repos\UNPA\UNPA_Ingest\mcp
npm install

# MCP server
cd d:\UN\Repos\MCP_CLAUDE\mcp-server
npm install
```

---

## 6. Environment Configuration

### 6.1 Root `.env` (Docker Compose variables)

This file is read by Docker Compose to configure container environment variables.

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest
Copy-Item .env.example .env
```

Edit `.env` and set the required values:

```dotenv
# Mandatory — LLM access
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE

# Required for credential encryption
CREDENTIAL_ENCRYPTION_KEY=b21913bf45d8d5ce845726ada5032bff246de296d0b37c33a19282da48404f7e

# Leave the rest at their defaults for local development
```

### 6.2 API `.env` (Local API process)

This file is read by the Node.js API when running locally with `npm run dev`.

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\api
```

Check if `api/.env` already exists. If not, create it with the following content:

```dotenv
# ─── Application ───────────────────────────────────────────────
NODE_ENV=development
PORT=3010
HOST=0.0.0.0
LOG_LEVEL=debug
LOG_FORMAT=pretty

# ─── CORS ──────────────────────────────────────────────────────
CORS_ORIGINS=http://localhost:5173,http://localhost:3010

# ─── Security ──────────────────────────────────────────────────
HELMET_ENABLED=true
RATE_LIMIT_ENABLED=false
API_KEY_ENABLED=false
CREDENTIAL_ENCRYPTION_KEY=b21913bf45d8d5ce845726ada5032bff246de296d0b37c33a19282da48404f7e

# ─── Memgraph (graph database) ─────────────────────────────────
# Use 'localhost' — databases run in Docker, API runs locally
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=memgraph
MEMGRAPH_PASSWORD=secret_password_123

# ─── Qdrant (vector database) ──────────────────────────────────
QDRANT_URL=http://localhost:6333

# ─── Redis (cache + job queue) ─────────────────────────────────
REDIS_HOST=localhost
REDIS_PORT=6379

# ─── LLM Provider ──────────────────────────────────────────────
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
ANTHROPIC_RPM_LIMIT=50
ANTHROPIC_DAILY_TOKENS=500000
ANTHROPIC_DAILY_BUDGET=20

# ─── Internal callbacks ────────────────────────────────────────
API_BASE_URL=http://localhost:3010
CODEX_API_URL=http://localhost:3010/api/v1/codex

# ─── Features ──────────────────────────────────────────────────
ENABLE_WEBSOCKET=true
ENABLE_JOB_QUEUE=true
ENABLE_METRICS=true
ENABLE_SWAGGER=true
RECORD_EXECUTION_DETAILS=false
```

> **Key rule:** In hybrid mode (databases in Docker, API local), all database hostnames must be `localhost`, not Docker container names like `memgraph` or `qdrant`.

### 6.3 Frontend `.env`

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\mcp
```

Create `mcp/.env` if it does not exist:

```dotenv
VITE_API_URL=http://localhost:3010/api/v1
VITE_GNN_URL=http://localhost:5001
```

### 6.4 MCP Server `.env`

```powershell
cd d:\UN\Repos\MCP_CLAUDE\mcp-server
Copy-Item .env.example .env
```

Edit `mcp-server/.env`:

```dotenv
NODE_ENV=production
MCP_TRANSPORT=stdio
MCP_SERVER_NAME=project-knowledge
MCP_SERVER_VERSION=1.0.0

# Databases — must match where Docker is running them
QDRANT_URL=http://localhost:6333
MEMGRAPH_URI=bolt://localhost:7687
MEMGRAPH_USER=memgraph
MEMGRAPH_PASSWORD=secret_password_123
TEI_URL=http://localhost:8081

# LLM keys (at least one required)
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE
GOOGLE_AI_API_KEY=               # optional

# Claude.ai integration (optional — only for knowledge sync)
CLAUDE_SESSION_KEY=
CLAUDE_ORGANIZATION_ID=
CLAUDE_PROJECT_ID=
CLAUDE_BASE_URL=https://claude.ai/api

LOG_LEVEL=info
```

---

## 7. Starting the Infrastructure (Docker)

The databases (Memgraph, Qdrant, Redis) always run in Docker. Start them before the API.

### 7.1 Start Core Databases

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest

# Start only the databases (Redis + Memgraph + Qdrant)
docker compose up -d redis memgraph qdrant
```

Or, to start the full development stack (including the containerised API):

```powershell
make dev-bg        # Background mode
# Or
make dev           # Foreground (shows live logs)
```

### 7.2 Verify Containers Are Running

```powershell
docker compose ps
```

Expected output — all three should show `healthy` or `running`:

```
NAME                        STATUS
projectadvisor-memgraph     running (healthy)
projectadvisor-qdrant       running (healthy)
projectadvisor-redis        running (healthy)
```

### 7.3 Verify Each Service Is Reachable

```powershell
# Qdrant
curl http://localhost:6333/healthz
# Expected: "healthz check passed"

# Redis
docker exec projectadvisor-redis redis-cli ping
# Expected: PONG

# Memgraph — test Bolt port is open
Test-NetConnection -ComputerName localhost -Port 7687
# Expected: TcpTestSucceeded : True
```

---

## 8. Starting the API

Open a new terminal (keep the Docker terminal running or run databases in background).

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\api
npm run dev
```

The API starts on **port 3010**. You should see output like:

```
[ProjectAdvisor] Server running on http://localhost:3010
[ProjectAdvisor] WebSocket enabled
[ProjectAdvisor] Job queue enabled
[ProjectAdvisor] Swagger UI: http://localhost:3010/api/v1/docs
```

### 8.1 Verify the API

```powershell
# Health endpoint
curl http://localhost:3010/health

# Swagger UI (open in browser)
# http://localhost:3010/api/v1/docs
```

---

## 9. Starting the Frontend

Open another terminal.

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest\mcp
npm run dev
```

Vite starts on **port 5173**. Open in browser:

```
http://localhost:5173
```

The React application connects to the API at `http://localhost:3010/api/v1`. The graph editor, AI chat, and BackLog UI should all be functional.

---

## 10. MCP Server Setup

The MCP server makes BackLog, Codex, and knowledge graph tools available inside Claude Code and Claude Desktop. It runs as a separate process launched automatically by the Claude client.

### 10.1 Build the MCP Server

The server is written in TypeScript and must be compiled before it can run:

```powershell
cd d:\UN\Repos\MCP_CLAUDE\mcp-server
npm run build
```

This produces compiled JavaScript in `mcp-server/dist/`.

### 10.2 MCP Client Configuration

The `.mcp.json` file at the project root tells Claude Code how to launch the MCP server:

```json
{
  "mcpServers": {
    "project-knowledge": {
      "type": "stdio",
      "command": "node",
      "args": ["d:/UN/Repos/MCP_CLAUDE/mcp-server/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "MCP_TRANSPORT": "stdio",
        "QDRANT_URL": "http://localhost:6333",
        "MEMGRAPH_URI": "bolt://localhost:7687",
        "MEMGRAPH_USER": "memgraph",
        "MEMGRAPH_PASSWORD": "secret_password_123",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

> Claude Code reads `.mcp.json` from the project root automatically when you open the project. No manual startup is needed — the MCP server process is spawned on demand.

### 10.3 Verify MCP Tools Are Available

Open Claude Code in the project directory. In a Claude conversation, type:

```
Use the get_project_context tool to show me the project overview.
```

If the MCP server is working, it will query Memgraph and return context about the project. If it fails, check that:
- `npm run build` was run in `mcp-server/`
- The databases are running (Step 7)
- The path in `.mcp.json` matches your actual directory structure

---

## 11. Verification Checklist

After completing the setup, verify each item:

| Check | Command / URL | Expected Result |
|-------|--------------|-----------------|
| Docker containers running | `docker compose ps` | memgraph, qdrant, redis all up |
| Qdrant health | `curl http://localhost:6333/healthz` | `healthz check passed` |
| Redis ping | `docker exec projectadvisor-redis redis-cli ping` | `PONG` |
| API health | `curl http://localhost:3010/health` | JSON with `status: "ok"` |
| API Swagger | `http://localhost:3010/api/v1/docs` | Swagger UI loads |
| Frontend | `http://localhost:5173` | React app loads |
| MCP tools | In Claude Code — ask for `get_project_context` | Returns project data |

---

## 12. Optional Services

### 12.1 MSSQL (SQL Server)

Required only for the SQL Import feature.

```powershell
docker compose up -d mssql
```

Port: **1433** (Docker) / **1435** (as configured in `.env` to avoid conflicts).
Credentials: `sa` / `SqlExpress2022#Dev`

Add to `api/.env`:
```dotenv
MSSQL_HOST=localhost
MSSQL_PORT=1433
MSSQL_USER=sa
MSSQL_SA_PASSWORD=SqlExpress2022#Dev
MSSQL_TRUST_SERVER_CERTIFICATE=true
MSSQL_ENCRYPT=false
```

### 12.2 GNN Service (Graph Neural Networks)

```powershell
docker compose --profile gnn up -d gnn
```

Port: **5001**. Depends on Memgraph and Redis being running.

### 12.3 Text Embeddings Inference (TEI)

Runs the `intfloat/multilingual-e5-large` model locally for offline vectorisation. Requires a HuggingFace token and ~4 GB RAM allocation for the container.

```powershell
# Set your HF token in .env first:
# HF_TOKEN=hf_YOUR_TOKEN

docker compose --profile embeddings up -d tei
```

Port: **8081**. Update `api/.env`:
```dotenv
TEI_URL=http://localhost:8081
```

### 12.4 Ollama (Local LLM)

```powershell
docker compose --profile llm up -d ollama

# Pull the default model (takes time on first run)
docker exec projectadvisor-ollama ollama pull llama3.2:3b
```

Port: **11434**. Update `api/.env`:
```dotenv
OLLAMA_URL=http://localhost:11434
```

### 12.5 ETL Worker

Processes background document indexing jobs from the BullMQ queue.

```powershell
docker compose --profile etl up -d etl-worker
```

Or run locally:
```powershell
cd indexing-pipeline
npm install
npm run start:worker
```

---

## 13. Data Seeding

The system requires seed data for Codex rules and BackLog agent configuration to work correctly.

```powershell
cd d:\UN\Repos\UNPA\UNPA_Ingest

# Seed Codex BackLog agent rules (required for AI-assisted task execution)
node api/scripts/seed-codex-backlog-agent-rules.js

# Seed approval workflow schema
node api/scripts/seed-approval-schema.js
```

Additional seed scripts available in `api/scripts/`:
- `seed-codex-*.js` — individual Codex rule sets
- `seed-ineed.js` — iNEED knowledge graph nodes
- `seed-priority6..9.js` — priority-level knowledge nodes

---

## 14. Common Issues

### "Connection refused" to Memgraph / Qdrant / Redis

- Verify Docker containers are running: `docker compose ps`
- Check that `api/.env` uses `localhost` (not container names like `memgraph`)
- Check that ports are not blocked by firewall or occupied by another process

### API starts but requests fail with database errors

- Memgraph uses Bolt protocol on port **7687** — ensure nothing else occupies it
- Qdrant REST API is on port **6333** — verify with `curl http://localhost:6333/collections`

### MCP tools not available in Claude Code

1. Run `npm run build` in `mcp-server/` to ensure `dist/index.js` exists
2. Verify `.mcp.json` path matches your actual filesystem layout
3. Restart Claude Code after first build

### "No text provided" error in graph execution

This is a known runtime issue with port data flattening in `NodeRunner`. The fix is already in place — if you see it again, check `api/src/runtime/execution/NodeRunner.js` for the port data flattening logic (`{portId:{data}}` → `{data}`).

### Back-edge detection blocks graph execution

Graph DAGs must have no cycles. If a graph blocks, check `api/src/runtime/scheduler/TopologicalScheduler.js` — `_detectBackEdges()` uses DFS and marks back edges. Remove the offending edge from the graph.

### Memgraph LIMIT/SKIP parameter errors

When passing integer parameters to Memgraph Cypher queries, always wrap them with `neo4j.int()`:
```javascript
session.run('MATCH (n) RETURN n SKIP $skip LIMIT $limit', {
  skip: neo4j.int(offset),
  limit: neo4j.int(pageSize)
});
```

### Port 5000 conflict (GNN service on macOS)

macOS AirPlay Receiver occupies port 5000. The GNN service is configured to use port **5001** by default for this reason. On Windows this is not an issue.

### Codex rules not visible via API

The Codex namespace must be exactly `'Codex'` (capital C) — not `'CODEX'`. If rules return empty results, check the namespace value in the seed scripts.

---

## 15. Port Reference

| Port | Service | Protocol | Notes |
|------|---------|----------|-------|
| **3010** | API (Express) | HTTP / WebSocket | Main API, Swagger at `/api/v1/docs` |
| **5173** | Frontend (Vite) | HTTP | Dev server with Hot Module Replacement |
| **7687** | Memgraph | Bolt | Graph database driver protocol |
| **7444** | Memgraph | HTTP | Admin web interface |
| **6333** | Qdrant | HTTP | Vector DB REST API + health endpoint |
| **6334** | Qdrant | gRPC | Vector DB binary protocol |
| **6379** | Redis | TCP | Cache and BullMQ job queue |
| **1433** | MSSQL | TCP | SQL Server Express (optional) |
| **5001** | GNN Service | HTTP | Graph Neural Network API (optional) |
| **8081** | TEI | HTTP | Text Embeddings Inference (optional) |
| **11434** | Ollama | HTTP | Local LLM inference (optional) |
| **5432** | PostgreSQL | TCP | Optional AGE + pgvector backend |
| **8000** | ChromaDB | HTTP | Optional vector store |
| **80** | Frontend (nginx) | HTTP | Production only |

---

*Document maintained by the UNPA_Ingest development team. Last structural update: 2026-05-13.*

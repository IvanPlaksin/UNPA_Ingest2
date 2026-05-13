# Critical Production Fixes Plan
## Parallel Track: Namespace Reorganization + Production Stabilization

**Date:** 2026-05-11  
**Branch:** AzureV1  
**Author:** Architecture Review  
**Status:** APPROVED FOR EXECUTION

These fixes address critical gaps and violations found during the 2026-05-11 audit. They are intended to be executed **in parallel with** the namespace reorganization — they do not depend on each other or on the reorganization completing first. Each fix is a self-contained unit of work.

---

## Fix 1: GAP-001 — Empty Global Knowledge Base

**Priority:** P0  
**Effort:** Medium (3–5 days for data decision + pipeline execution)  
**Owner:** ESCALATE TO IVAN — requires data source decision

### Problem

The `embeddings_unified` Qdrant collection has 0 points. ALL named `embeddings_*` collections are empty. The platform's core value proposition — semantic search over institutional knowledge — is non-functional because no knowledge has been extracted and promoted to the Global Knowledge Base.

This is not a code bug. The extraction and promotion pipeline (`PromotionSagaService`, WorkSpace extraction) is implemented and functional. The problem is that no data has been run through it.

### Root Cause

The WorkSpace extraction pipeline was built and tested with synthetic data. No production knowledge ingestion run has been completed. The pipeline exists; the trigger (a real corpus + a scheduled extraction run) does not.

### What Exists (Works)

- `api/src/services/workspace/promotion/promotion-saga.service.js` — validated, functional
- `api/src/services/workspace/workspace.service.js` — functional
- WorkSpace extraction pipeline (extraction → drafts → conflict detection → promotion)
- Qdrant infrastructure is running with correct collections created

### What Is Needed

A **decision on the initial data source** and execution of an initial extraction run. Options:

**Option A: Use dialogue session history (recommended for fastest path)**
- 27,556 dialogue messages exist in Memgraph
- Many contain domain knowledge: service categories, approval policies, SLA rules, user roles
- Extraction script: query sessions, run through `unified-extractor.js`, create drafts, human-review a sample, then promote
- Estimated elapsed time: 1 day
- Risk: session messages contain conversational noise; need confidence threshold tuning

**Option B: Import existing documents or SOPs**
- If Ivan has any existing documentation (Word docs, Confluence pages, policy PDFs), load them via ingestion pipeline
- Estimated elapsed time: depends on document availability
- Risk: requires document access

**Option C: Synthetic demonstration corpus**
- Create a representative set of ~50 FlowDesk knowledge items (service categories, SLA policies, common intents)
- Seed directly without extraction
- Estimated elapsed time: 1 day
- Risk: synthetic data may not reflect real operational knowledge

### Dependency

None — this is independent of the namespace reorganization.

### Suggested Sprint

Sprint 1 (immediate): Ivan decides on data source → Claude Code executes extraction run.

---

## Fix 2: VIOLATION-002 — ProvenanceService In-Memory State

**Priority:** P1  
**Effort:** Low-Medium (1–2 days)  
**Owner:** Claude Code executes autonomously

### Problem

`api/src/services/provenance.service.js` stores all provenance rounds in `this.rounds = new Map()`. Every time the API server restarts, all audit trail data is lost. This violates basic governance requirements for UN platform software.

### Root Cause

Persistence was never implemented during initial development. The in-memory implementation was a placeholder that was never replaced.

### Solution

1. Add a `ProvenanceRound` node label to Memgraph schema
2. On write: dual-write — update the in-memory Map AND create/update a `ProvenanceRound` node in Memgraph
3. On startup: load existing `ProvenanceRound` nodes from Memgraph into the in-memory Map (warm start)
4. Schema: `ProvenanceRound` node properties: `id`, `namespace`, `timestamp`, `entityId`, `sourceType`, `confidence`, `round`, `extractorId`

### Files to Change

- `api/src/services/provenance.service.js` — add Memgraph dual-write and startup load
- `api/scripts/age-schema-setup.js` — add `ProvenanceRound` label and index

### Test Coverage Required

- Unit test: write round → restart → read round → verify it survived restart
- Integration test: run extraction cycle → verify provenance rounds in Memgraph

### Dependency

Requires Memgraph to be running (it always is in dev and production). No namespace reorganization dependency.

### Suggested Sprint

Sprint 1 (can start immediately, parallel to Fix 1 data decision).

---

## Fix 3: VIOLATION-003 — RAG Executor Stubs

**Priority:** P1  
**Effort:** Medium (2–3 days)  
**Owner:** Claude Code executes autonomously (blocked on Azure LLM migration for production, but can implement for Gemini/Ollama first)

### Problem

Two RAG pipeline executors are stubs — they do not perform their described function:

1. `api/src/core/aopeg/plugins/rag/executors/expand-query.executor.ts` — line 315: stub returning input query unchanged
2. `api/src/core/aopeg/plugins/rag/executors/rerank.executor.ts` — lines 268-281: stub returning results in original order

### Root Cause

Implementation was deferred. Stubs were written to keep the pipeline structurally valid while awaiting LLM integration.

### Solution: expand-query.executor.ts

Call `LLMProviderService` with a prompt that expands the user's query into 3-5 semantic variants:
```
System: You are a query expansion assistant. Given a user query, generate 3-5 semantically related 
queries that would help retrieve relevant documents through vector search. Return JSON array of strings.

User query: {originalQuery}
```
Output: array of expanded queries. Run vector search on each, merge result sets, deduplicate by chunk ID.

### Solution: rerank.executor.ts

Implement LLM-based reranking using a cross-encoder scoring prompt:
```
System: Rate the relevance of this document chunk to the query on a scale of 0.0-1.0.
Return only a number.

Query: {query}
Document: {chunkText}
```
Run this for each of the top-N retrieved chunks (N ≤ 20 to control cost), sort by score descending, return top-K.

For production efficiency, implement batched scoring (single LLM call with all chunks in context) as an optimization.

### Dependency

- Depends on `LLMProviderService` being available for the currently configured provider
- For Azure deployment: depends on Fix 7 (LLMProviderService migration) being complete for those files
- For local/Gemini: can implement now without Fix 7

### Suggested Sprint

Sprint 2 — implement for Gemini/Ollama now, upgrade for Azure after Fix 7.

---

## Fix 4: GAP-004 — ts-node as Transitive Dependency

**Priority:** P1 (quick win)  
**Effort:** 30 minutes  
**Owner:** Claude Code executes autonomously

### Problem

`api/index.js` line 4 contains:
```javascript
require('ts-node/register');
```

`ts-node` is NOT listed in `api/package.json` dependencies. It is only available because some other package transitively depends on it. After any `npm update` or clean `npm install`, the next server startup will fail with `Cannot find module 'ts-node/register'`.

### Solution

```bash
cd api && npm install ts-node --save
```

Verify that `ts-node` now appears in `api/package.json` under `dependencies`.

### No Code Change Required

The `require('ts-node/register')` call in `api/index.js` is correct — it just needs the package to be explicit.

### Dependency

None. Standalone.

### Suggested Sprint

Sprint 1 (execute immediately, 30 minutes, zero risk).

---

## Fix 5: VIOLATION-004 — Hardcoded Developer Path

**Priority:** P1 (quick win)  
**Effort:** 1 hour  
**Owner:** Claude Code executes autonomously

### Problem

`api/src/services/agents/anthropic-agent.service.js` line 19 hardcodes:
```javascript
const MCP_SERVER_PATH = 'd:/UN/Repos/MCP_CLAUDE/mcp-server/';
```

This is Ivan's local development machine path. In any Docker container, CI environment, or another developer's machine, this path does not exist. The agent service silently fails to find the MCP server, and all AI agent functionality becomes non-functional without any clear error message.

### Solution

1. Change line 19 to read from environment variable:
```javascript
const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || (() => {
  throw new Error('MCP_SERVER_PATH environment variable is required. Set it to the path of the MCP server directory.');
})();
```

2. Add `MCP_SERVER_PATH` to `.env.example` with a comment:
```
# Path to the project-knowledge MCP server directory
# Example (local dev Windows): d:/UN/Repos/MCP_CLAUDE/mcp-server/
# Example (Docker): /app/mcp-server/
MCP_SERVER_PATH=
```

3. Add startup validation in `api/src/services/startup/StartupManager.js`: check that the path exists, log a clear error if not.

### Dependency

None. Standalone.

### Suggested Sprint

Sprint 1 (execute immediately, 1 hour).

---

## Fix 6: RISK-005 — SSL Verification Disabled Globally

**Priority:** P1  
**Effort:** Half day  
**Owner:** Claude Code executes autonomously

### Problem

`api/index.js` line 6:
```javascript
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
```

This single line disables SSL certificate verification for **ALL** outbound HTTPS connections made by the Node.js process — not just ADO (Azure DevOps) connections. This exposes every API call the system makes (to Azure OpenAI, to external services, to Qdrant if HTTPS, etc.) to MITM attacks.

### Root Cause

ADO connections in some environments use self-signed or internal CA certificates that Node.js doesn't trust. Rather than properly configuring the CA or using a custom HTTPS agent scoped to ADO, the global flag was set.

### Solution

1. Remove the global `process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'` from `api/index.js`

2. In the ADO service (`api/src/services/ado.service.js`), scope the SSL bypass to ADO connections only:
```javascript
const https = require('https');
const adoAgent = new https.Agent({ rejectUnauthorized: false });
// Use adoAgent as the httpsAgent for ADO axios calls
```

3. Alternatively, provide the corporate CA certificate via:
```javascript
const caPath = process.env.ADO_CA_CERT_PATH;
if (caPath) {
  const ca = fs.readFileSync(caPath);
  const adoAgent = new https.Agent({ ca });
}
```

### Test

After fix: verify ADO operations still work. Verify that a request to an endpoint with an invalid certificate from non-ADO code now correctly fails with a certificate error.

### Dependency

Requires access to ADO service to test. No namespace reorganization dependency.

### Suggested Sprint

Sprint 1 (high security risk, should be fixed before any public or Docker deployment).

---

## Fix 7: GAP-003 — LLMProviderService Not Universal

**Priority:** P1 (larger effort, needed for Azure deployment)  
**Effort:** Medium (1 full day of mechanical refactoring)  
**Owner:** Claude Code executes autonomously

### Problem

18+ files across the codebase bypass `LLMProviderService` and directly import `llm.service.js` or `gemini.service.js`. This means that when the platform is configured for Azure OpenAI (via `LLMProviderService`), those 18+ code paths continue to call Gemini, silently returning wrong results or failing with authentication errors.

### Full List of Affected Files (from audit)

Backend:
- `api/src/services/extraction/pattern-enhanced-extractor.js`
- `api/src/services/extraction/coreference-resolver.js` (if exists)
- `api/src/controllers/chat.controller.js`
- `api/src/controllers/assistant.controller.js`
- `api/src/controllers/mssql.controller.js`
- `api/src/core/aopeg/plugins/common/executors/ai-agent.executor.js`
- `api/src/core/aopeg/plugins/common/executors/ai-generate.executor.js`
- `api/src/core/aopeg/plugins/dialogue/executors/dialogue.extract_decisions.js` (or similar)
- `api/src/services/rag/index.js` (or rag.service.js)
- `api/src/services/connectors/ServiceConnector.js`
- ~8 additional files to verify via: `grep -r "require.*llm.service\|require.*gemini.service" api/src/`

### Solution

For each file, replace:
```javascript
const llm = require('../services/llm.service');
// or
const gemini = require('../services/gemini.service');
```

With:
```javascript
const { getLLMProvider } = require('../services/llm/LLMProviderService');
const llm = getLLMProvider();
```

Then update any call-site API differences (method names, parameter shapes) to match `LLMProviderService`'s unified interface.

### Verification

After fix: with `LLM_PROVIDER=azure` configured, run a chat request and verify the request goes to Azure OpenAI and NOT to Gemini. Check logs for `[LLMProviderService]` routing entries.

### Dependency

Depends on `LLMProviderService` supporting all the calling patterns used by the affected files. Review `api/src/services/llm/LLMProviderService.js` interface before starting.

### Suggested Sprint

Sprint 2 — this is required for Azure deployment to work correctly end-to-end. Fix 4 (ts-node) and Fix 5 (MCP path) should be done first so the server starts cleanly for testing.

---

## Prioritized Execution Order

| Sprint | Fix | What | Effort | Dependencies | Decision Needed |
|--------|-----|------|--------|--------------|-----------------|
| **Sprint 1** | Fix 4 | ts-node as explicit dependency | 30 min | None | No — Claude executes |
| **Sprint 1** | Fix 5 | Hardcoded MCP server path | 1 hr | None | No — Claude executes |
| **Sprint 1** | Fix 6 | SSL verification scoped to ADO | 4 hrs | None | No — Claude executes |
| **Sprint 1** | Fix 2 | ProvenanceService persistence | 1–2 days | None | No — Claude executes |
| **Sprint 1** | Fix 1 | Global KB data ingestion (setup) | 1 day | **Ivan decision on data source** | YES — Ivan chooses Option A/B/C |
| **Sprint 2** | Fix 7 | LLMProviderService universalization | 1 day | Fix 4 (server starts cleanly) | No — Claude executes |
| **Sprint 2** | Fix 3 | RAG executor stubs | 2–3 days | Fix 7 (LLM routing correct) | No — Claude executes |
| **Sprint 2** | Fix 1 | Global KB data ingestion (execution) | 1–2 days | Ivan decision from Sprint 1 + Fix 7 | No — Claude executes after decision |

### Rationale for Ordering

1. **Fixes 4, 5, 6 first**: These are zero-risk quick wins that stabilize the server and close security/reliability gaps. They should be done before anything else so the testing baseline is clean.

2. **Fix 2 in Sprint 1**: ProvenanceService persistence is low-risk and addresses a governance violation. It does not interfere with other work.

3. **Fix 1 data decision in Sprint 1**: Ivan's decision on the data source can be made in parallel while Claude executes Fixes 2, 4, 5, 6. This way the extraction run can begin immediately in Sprint 2.

4. **Fix 7 before Fix 3**: The RAG executors will use `LLMProviderService` — they should be written against the unified interface after Fix 7 confirms the interface works.

5. **Fix 3 after Fix 7**: Once LLM routing is correct, implementing the RAG stubs is straightforward and their results will be meaningful.

### Parallel Tracks Summary

```
SPRINT 1                          SPRINT 2
────────────────────────────────  ────────────────────────────────
Fix 4: ts-node (30 min)          Fix 7: LLMProviderService (1 day)
Fix 5: MCP path (1 hr)           Fix 3: RAG stubs (2-3 days)
Fix 6: SSL scope (4 hrs)         Fix 1: KB ingestion run (1-2 days)
Fix 2: Provenance persist (2 days)
Fix 1: Ivan data decision ←────── Depends on Ivan's Sprint 1 answer

NAMESPACE REORGANIZATION (parallel, separate track, independent)
─────────────────────────────────────────────────────────────────
Phase 0: Classification manifest
Phase 1: Create directory structure
Phase 2+: Iterative file moves (one at a time)
```

These tracks do not block each other. The namespace reorganization can proceed at whatever pace is appropriate while the critical fixes are resolved.

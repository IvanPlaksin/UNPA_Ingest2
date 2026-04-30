# CLAUDE.md — Claude Code Project Protocol

## Project Overview

UN ProjectAdvisor (UNPA_Ingest) — AI-powered institutional knowledge management platform.
Core principle: **"Graph = Program"** — business logic lives in executable AOPEG graphs.

- **Backend:** `api/` — Node.js, Express, Memgraph, Redis, Qdrant
- **Frontend:** `mcp/` — React + Vite, ReactFlow, Zustand
- **MCP Server:** External at `d:/UN/Repos/MCP_CLAUDE/mcp-server/` — project-knowledge tools

---

## BackLog Task Execution Protocol

**Codex Rules:** CODEX-RULE-BA-020 through BA-064 (load via `codex_search_rules`).

When executing a BackLog task (BACKLOG-XXXX), follow this mandatory sequence:

### Phase 1: Task Acceptance

1. Load task details:
   ```
   backlog_get_item(backlogId)
   ```
2. Load applicable Codex rules:
   ```
   codex_search_rules(query: "BA-0", scope: "backlog")
   ```
3. Transition task to IN_PROGRESS:
   ```
   backlog_update_status(backlogId, action: "start")
   ```

### Phase 2: Execution with Decision Recording

**For EVERY significant decision** during execution, maintain a running decision log.
Significant decisions include:
- Architectural choices (which pattern/approach to use)
- File/module selection (where to put code)
- Algorithm/approach selection
- Trade-off resolutions
- Error handling strategies
- Deviations from the original plan

**Format each decision as:**
```
DECISION: <what was decided>
RATIONALE: <why this option was chosen>
ALTERNATIVES: <what was considered and rejected>
```

Accumulate all decisions throughout execution. They will be submitted in Phase 3.

### Phase 3: Task Completion — Structured Review Submission

Before marking task complete, submit for review with **full documentation**:

```
backlog_update_status(
  backlogId: "BACKLOG-XXXX",
  action: "review",
  implementationNotes: "<structured summary — see template below>",
  implementedFiles: ["path/to/file1.js", "path/to/file2.js"]
)
```

**implementationNotes template:**

```
## Summary
<1-2 sentences: what was accomplished>

## Approach
<How the task was solved, key architectural choices>

## Decisions Made
1. DECISION: <what> | RATIONALE: <why> | ALTERNATIVES: <rejected options>
2. DECISION: <what> | RATIONALE: <why> | ALTERNATIVES: <rejected options>
...

## Test Results
- Tests passed: <N>
- Tests failed: <N>
- Coverage: <if applicable>

## Risks & Follow-up
- <any remaining risks or suggested next tasks>
```

### Phase 4: Handle Review Outcome

- **REVIEW → DONE**: Task approved, no further action
- **REVIEW → IN_PROGRESS**: Address reviewer recommendations in a new iteration
  - Read feedback, create updated plan, re-execute

### Rules Summary (from Codex BA-series)

| Rule | Requirement |
|------|-------------|
| BA-001 | All BackLog content MUST be in English |
| BA-002 | Search existing tasks before creating new ones |
| BA-020 | MUST start execution cycle before working |
| BA-021 | MUST create plan before execution |
| BA-022 | MUST record every significant decision with reasoning |
| BA-023 | MUST submit for review, never mark DONE directly |
| BA-060 | MUST log actions with motivation |
| BA-061 | MUST write structured resolution on completion |
| BA-062 | MUST manage status transitions properly |
| BA-064 | All content MUST be in English |

---

## Graph Construction Rules

Key rules for AOPEG/GXE graphs (from Codex):

- Every graph: `workflow.start` → ... → `workflow.end`
- `tref-*` nodes for filtering only, not routing
- Linear DAG only — no merge-nodes (cause skip-cascades)
- Re-execution pattern per turn (new `RuntimeEngine.execute()` with accumulated state)
- `parameterSchema` without `required` field
- `WAIT_FOR_INPUT` for user interaction nodes
- Edge normalization: ReactFlow `{source, target}` + AOPEG `{sourceNodeId, targetNodeId}`
- Port data flattening: `{portId:{data}}` → `{data}` in NodeRunner
- Back-edge detection: `_detectBackEdges()` DFS in TopologicalScheduler

---

## Namespace Separation (CRITICAL)

- **ProjectAdvisor** = platform (core code, routes, services)
- **FlowDesk** = client project (domain-specific graphs, executors)
- No client names in core code/files/routes

---

## Key File Locations

### Runtime Engine
- `api/src/runtime/RuntimeEngine.js` — main engine
- `api/src/runtime/execution/NodeRunner.js` — node execution + port flattening
- `api/src/runtime/scheduler/TopologicalScheduler.js` — DAG scheduling
- `api/src/runtime/integration/AOPEGAdapter.js` — AOPEG to MCP bridge

### BackLog System
- `api/src/services/backlog/` — all backlog services
- `api/src/routes/backlog.route.js` — main REST API
- `api/src/routes/backlog-execution.route.js` — cycles, memory, plans, reviews
- `api/src/prompts/task-executor.prompt.js` — executor agent prompt
- `api/scripts/seed-codex-backlog-agent-rules.js` — BA rule definitions

### AOPEG Plugins
- `api/src/core/aopeg/plugins/` — 8 plugin directories
- 74 executors total, AOPEGAdapter wraps for MCP

### Codex
- `api/src/services/codex/` — Codex CRUD + loader + validator
- `api/scripts/seed-codex-*.js` — rule seed scripts

---

## MCP Tools Quick Reference

### BackLog (via project-knowledge MCP server)
- `backlog_get_item(backlogId)` — load task details
- `backlog_list_items({status, priority, taskType})` — search tasks
- `backlog_create_item({title, description, taskType, targetType, acceptanceCriteria})` — create task
- `backlog_update_status(backlogId, action, implementationNotes?, implementedFiles?)` — transition status
- `backlog_add_dependency(backlogId, dependsOn)` — add dependency
- `backlog_stats()` — backlog statistics

### Codex (via project-knowledge MCP server)
- `codex_search_rules({query, scope, modality})` — search rules
- `codex_get_rule(rule_id)` — get specific rule with anti-patterns
- `codex_get_principles()` — 7 fundamental principles
- `codex_load_rules({scope, format})` — load rules by scope
- `codex_get_blackcodex()` — anti-patterns and rejected approaches

### Knowledge (via project-knowledge MCP server)
- `search_knowledge(query)` — semantic search
- `query_knowledge_graph(cypher)` — Cypher query on Memgraph
- `get_project_context()` — project overview

---

## Common Issues

- "No text provided" → port data flattening in NodeRunner
- Back-edge blocks → `_detectBackEdges()` DFS
- Object params destroyed → AOPEGAdapter NO spread multi-key
- Memgraph: no MAGE, plain numbers, auth `memgraph`/`secret_password_123`
- Memgraph LIMIT/SKIP → use `neo4j.int()` for integer params
- Codex namespace must be `'Codex'` (not `'CODEX'`) for API visibility

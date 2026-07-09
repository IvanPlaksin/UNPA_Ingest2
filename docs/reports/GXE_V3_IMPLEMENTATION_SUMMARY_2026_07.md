# GXE v3.0 — Implementation Summary

- **Date:** 2026-07-09
- **Branch:** `feat/gxe-v3-phase1`
- **Commits:** 9 (`020ebc3` → `56fdfa5`), on top of `b97c054`
- **Tests:** 47/47 unit green (7 suites) + live checks noted per item
- **Author:** Claude Code (Opus 4.8), driven by the ClaudeChat design session

> Honesty note: statuses below distinguish **implemented + unit-verified**, **live-verified**,
> and **deferred / not-measured**. Nothing is marked done that was not actually exercised.

---

## 1. What was built

Concept **v3.0 "Agent-Centric, Integration-First"**: rather than build new subsystems, wire
together five already-present-but-unconnected mechanisms into one generation-quality path,
and make the agent self-correct against an **external signal** (Huang et al., ICLR 2024 —
LLMs can't self-correct without one).

### Phase 1 — Foundations
- **Constrained decoding wired into SDA.** `StructuredOutputService.generateStructured` alias
  + injected into `task-planner` (S3) and `intent-classifier` (S1). They previously called a
  method the injected `LLMProviderService` didn't have, silently falling back to plain chat.
- **ExecutableGraphVerifier (L1+L2).** Delegates structural checks to `GraphValidator`, reuses
  `pluginRegistry.validateGraphExecutors` for EXECUTOR_EXISTS; L2 branch-discipline + template-refs.
- **Prompt↔Runtime alignment.** Removed hardcoded phantom node categories (gateway / loop /
  control / aggregator) and the fake `integration` domain from the builder system prompt;
  replaced with a registry-driven domain summary + explicit "don't invent executors"; added
  working `codex_search_rules` / `codex_get_blackcodex` tools; RAG best-practice caveat.
- **Claude Code LLM provider.** `claude-code.provider.js` spawns the local Claude Code CLI as an
  LLM (no API key / credit balance) → bypasses the exhausted-Anthropic-credits blocker.

### Phase 2 — Verify → Reflect
- **MockExecutionMode.** `RuntimeEngine.execute(dag, input, { mode:'mock' })` threads a mock flag
  to `NodeRunner`, which skips the real side-effecting `tool.execute()` and synthesizes output
  from the tool's `outputSchema`. RESOLVE / VALIDATE_INPUT / TEMPLATE_RESOLUTION / PROPAGATE stay
  real → the dry-run still catches `UNRESOLVED_TEMPLATE` and skip-cascades. Fully guarded.
- **Verifier L2.5.** Wraps the mock dry-run; classifies `INVALID_TEMPLATE_REF` (hard, upstream
  declares a schema without the field) vs `UNDECLARED_OUTPUT_CONTRACT` (warning, no schema) +
  `SKIP_CASCADE`. Graceful-skips without an MCP registry.
- **Agent reflection loop.** On STOP (no tool calls) the builder verifies the graph; on failure
  it injects a structured reflection prompt and retries, tracks the best attempt by grade, rolls
  back on degradation, returns the best attempt when the budget is spent. Both `_agentLoop` and
  `_agentLoopStream`. Feature-flagged (`reflectionEnabled`, `maxReflections=3`, `targetGrade='B'`).

### Phase 3 — Formal foundations
- **IR-preservation.** `GraphDefinition` gains nullable `processIR` + `irVersion`; the SDA path
  lifts the flat TaskPlan into a **sound-by-construction ProcessRepresentation process tree**
  (reusing `task-planner._buildWithParallelGroups` / `_buildSequenceFromDependencies`) and stores
  that. Round-trips through Memgraph.
- **`/petri/validate-ir` (Python).** Maps the IR to a pm4py `ProcessTree` (SEQUENCE→SEQUENCE,
  CHOICE→XOR, PARALLEL→PARALLEL, LOOP→LOOP(body, silent-tau)) → WF-net → Woflan.
- **Verifier L3.** `PetriClient.validateIR`; L3 dispatches by IR shape — a process tree →
  `/petri/validate-ir` (formal model), otherwise → `/petri/validate` (flat-DAG WF-net). Gated by
  `PETRI_VALIDATION_ENABLED`, graceful-skip.
- **`POST /api/v1/gxe/verify-graph`.** Exposes the full L1–L3 stack over HTTP.

### Phase 4 (partial) — UI
- **Graph Verifier Dashboard** (`/graph-verifier`, sidebar → GXE): pick a catalog graph → verify →
  grade A–F, per-level breakdown, dimension score bars, issue list.
- **LLM Provider Selector** (`/llm-access-control`): switch the SDA structured-output provider
  (default Claude Code) via `GET/PUT /api/v1/settings/llm-provider`.

---

## 2. Baseline (measured) → what changed

Baseline from `GXE_GENERATION_BASELINE_2026_07.md` — static sweep of the 50 catalog graphs:

| Metric | Baseline | Effect of v3.0 |
|---|---|---|
| Fully clean graphs | **54%** (27/50) | — (existing graphs unchanged) |
| True phantom executors | **18%** (9/50) | L1 `EXECUTOR_EXISTS` now **detects** these (live-confirmed via `/verify-graph`) |
| Broken template refs | **12%** (6/50) | L2 static + L2.5 mock dry-run **detect** these |
| Agent happy-path | uncontrolled | reflection loop makes the agent **re-verify + fix** before finishing |

Note: v3.0 **detects/prevents** these defects in verification and new agent generation; it does
not retro-fix the existing catalog. A first-try generation-success delta (DoD #7) is **not yet
measured** — it needs live generation runs.

---

## 3. Definition of Done — honest status

| # | Criterion | Status |
|---|---|---|
| 1 | Agent doesn't finish without L1+L2(+L2.5) validation | ✅ implemented, unit-verified (flag-guarded) |
| 2 | Failed validation → structured feedback + fix attempt + best-attempt rollback | ✅ unit-verified (6/6 reflection tests) |
| 3 | Constrained decoding wired to SDA | ✅ unit + live e2e (schema-valid JSON via Claude Code CLI) |
| 4 | IR preserved; soundness on IR level | ✅ **live-verified end-to-end** — gnn `/petri/validate-ir` + api `/verify-graph` L3 return real Woflan verdicts (see §5) |
| 5 | Reference graph passes MockExecutionMode | ⚠️ mechanism ready + unit-verified; the specific reference graph was **not** run through it live |
| 6 | `find_similar_graphs` few-shot tool for the agent | ⏸️ deferred |
| 7 | Generation first-try success improved ≥20pp vs baseline | 📊 **not measured** (needs live generation runs) |
| 8 | Audit log populated | ⏸️ deferred (untouched this phase) |
| 9 | LLM provider switchable, default Claude Code | ✅ live-verified (GET/PUT round-trip) |
| 10 | COMPLETED executions replayable | ⏸️ deferred |

---

## 4. Changed / new files

**Backend (`api/src/`)**
- NEW `services/ai/providers/claude-code.provider.js`, `services/verification/executable-graph-verifier.service.js`, `services/settings/runtime-settings.js`, `routes/settings.route.js`
- MOD `services/ai/structured-output.js`, `services/graph/task-planner.js`, `services/graph/intent-classifier.js`, `services/ai/prompts/graph-builder-system.prompt.js`, `services/ai/graph-builder-tools.js`, `services/ai/tool-executor.js`, `services/graph-builder-agent.service.js`, `services/graphCatalog.service.js`, `services/petri/petri-client.js`, `runtime/execution/NodeRunner.js`, `runtime/scheduler/TopologicalScheduler.js`, `runtime/RuntimeEngine.js`, `controllers/gxe.controller.js`, `routes/gxe.route.js`, `mcp/tools/catalog/SaveGraphTool.js`, `index.js`

**Python (`gnn-service/`)** — MOD `src/api/petri_routes.py` (+`/petri/validate-ir` + IR→ProcessTree mapper)

**Frontend (`mcp/src/`)** — NEW `pages/GraphVerifierPage.jsx`, `components/GXE/LLMProviderSelector.jsx`; MOD `services/gxe.service.js`, `App.jsx`, `components/Layout/Sidebar.jsx`, `pages/LLMAccessControlPage.jsx`

**Tests (`api/tests/unit/`, 47 total)** — constrained-decoding-wiring (4), executable-graph-verifier (14), prompt-alignment (6), claude-code-provider (9), mock-execution-mode (3), agent-reflection-loop (6), ir-preservation (5)

**Reports (`docs/reports/`)** — `GXE_RECON_AS_IS_2026_07.md`, `GXE_GENERATION_BASELINE_2026_07.md`, this file

---

## 5. Open / blocked items

- **P3-005 live Petri — RESOLVED (2026-07-09, commit `b532f7d`).** Now live end-to-end.
  Two blockers beyond the missing pm4py were fixed:
  - pm4py ≥2.7 `constants.py` calls `psutil.Process(os.getppid()).name()` at import (PowerBI
    detection); inside a container `ppid==0` → `NoSuchProcess`, crashing the first `/petri/*`
    call. Dockerfile now guards it (try/except).
  - `gnn_config.yaml` `service.port` was `5001` but Docker maps host `:5001`→container `:5000`;
    reverted to `5000` (the `5001` value made the rebuilt image unhealthy/unreachable).
  - Operational: the api reaches gnn via `GNN_SERVICE_URL` (set to `http://127.0.0.1:5001` in
    `api/.env`, **not** `localhost` — Docker Desktop/WSL2 shadows `[::1]:5001` so `localhost`
    times out from Node), and `PETRI_VALIDATION_ENABLED=true` activates L3.

  Verified: `/petri/health` → `{"status":"ok","pm4py_version":"2.7.23.1"}`; `/petri/validate-ir`
  → `sound=true` for nested SEQUENCE/PARALLEL/LOOP/CHOICE IR; flat parallel-split-without-join
  → `sound=false` (Woflan discriminates, not a rubber stamp); api `/verify-graph` → L3 live,
  grade A, `soundness=1`, real net metrics.

  Note: the live image was produced as a fast overlay on the existing built image (adds the
  pm4py patch + refreshed source, seconds) to avoid the ~20-min `torch-scatter`/`torch-sparse`
  recompile. A clean `docker compose build gnn` now bakes the same fixes from the Dockerfile.
- **outputSchema for core executors** — most executors declare no `outputSchema`, so L2.5/L3
  field-level checks currently emit `UNDECLARED_OUTPUT_CONTRACT` warnings instead of hard errors.
- **find_similar_graphs** few-shot tool; **MCP-registry** into the agent (enables L2.5 in the
  agent loop); **agent Path B on Claude Code** (needs CLI tool-calling); **execution timeline /
  audit**; **side-effect journaling + deterministic replay**.

---

## 6. How to check it

```bash
# Unit tests
for t in constrained-decoding-wiring executable-graph-verifier prompt-alignment \
         claude-code-provider mock-execution-mode agent-reflection-loop ir-preservation; do
  node api/tests/unit/$t.test.js; done

# Verify a graph over HTTP (flags the phantom executor, grades the valid one)
curl -s -X POST http://localhost:3010/api/v1/gxe/verify-graph -H "Content-Type: application/json" \
  -d '{"nodes":[{"id":"n1","executorType":"workflow.start"},{"id":"n2","executorType":"common.transform"},{"id":"n3","executorType":"workflow.end"}],"edges":[{"id":"e1","source":"n1","target":"n2"},{"id":"e2","source":"n2","target":"n3"}]}'

# Provider setting
curl -s http://localhost:3010/api/v1/settings/llm-provider

# UI
#   http://localhost:5173/graph-verifier
#   http://localhost:5173/llm-access-control
```

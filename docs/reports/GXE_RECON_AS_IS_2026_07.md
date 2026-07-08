# GXE "Graph = Program" — AS-IS Reconnaissance (RECON-01..06)

- **Date:** 2026-07-08
- **Author:** Claude Code (Opus 4.8) — evidence-first, first-source verified (code read, live API :3010, Memgraph Cypher, registries)
- **Purpose:** Verified ground-truth baseline for finalizing the "Graph = Program" (GXE) concept. Companion to the broad platform audit `docs/reports/audit-2026-05-11/` (which is platform-readiness scope; this is GXE execution/graph-subsystem depth).
- **Method:** Only primary sources — file system, running RuntimeEngine/GxeManager on :3010, `aopeg/registry/executors`, `graph-catalog`, `gxe-manager/stats`, Codex nodes in Memgraph. Discrepancies vs docs/KB flagged as DELTA.

---

## 1. Executive AS-IS

The GXE core is **more mature than documented**: conditional branching, merge-node handling, point-resume, back-edge loops, and Petri soundness **all exist and (mostly) work**. The weaknesses are **integration gaps and governance dormancy**, not missing primitives:

- Governance legs (audit, checkpoint, SAGA, timeout-reaper) exist in code but are **not wired into the synchronous execution path**.
- The strongest formal gate (Petri soundness) is **off by default** and bound to **save**, not **execute**.
- The graph compiler emits **phantom executor types** that do not exist → generation↔execution break.
- ~50 of 60 GXE Codex rules are **declarative agent-guidance**, not machine-enforced.

The "Graph = Program" invariant currently rests largely on **trust in a disciplined authoring agent**, not on verification.

---

## 2. Key Numbers (live-verified)

| Metric | Value | Source |
|---|---|---|
| AOPEG executors (registered) | **103** across 15 domains | `GET /aopeg/registry/executors` |
| MCP tools | **152** across 15 categories | file count `mcp/tools/**` |
| AOPEG plugins | 12 domain (+2 default +3 tool +FlowDesk) | plugin-loader.js |
| Codex GXE rules | **GXE-001..060** (all ACTIVE) | Memgraph `:CodexRule` |
| Codex graph-relevant families | GXE 60, BA 26, CGE 4, MTH 3, PROV 5, DLG 6, EC 5, INV 22 | Cypher |
| Executions in registry | **731** (WAITING 609, COMPLETED 59, FAILED 55, RUNNING 8) | `GET /gxe-manager/stats` |
| Investigation primitives | 12 (docstring says 11 — SEARCH added) | primitive-registry |
| Scheduling strategies | **3** (SEQUENTIAL, PARALLEL_BOUNDED, PARALLEL_UNBOUNDED) | TopologicalScheduler |

Executor domains: common 26, dialogue 16, investigation 12, ingestion 11, rag 8, sql-extraction 8, ai 5, workflow 5, filesystem 3, subgraph 3, validation 2, extraction 1, notification 1, script 1, session 1.

---

## 3. Execution Core (RECON-01)

- **RuntimeEngine** (facade): type-gate → validate → init (ports/tools) → input-inject → run → completion. Type-gates via `graphClassificationService` throw `GraphTypeError`.
- **ExecutionStateMachine**: 10 states (CREATED, INITIALIZING, READY, RUNNING, PAUSED, WAITING, COMPLETED, FAILED, CANCELLED, TIMED_OUT), explicit transition table.
- **NodeStateMachine**: 9 states (PENDING/READY/QUEUED/EXECUTING/RETRYING/WAITING_INPUT/SUCCEEDED/FAILED/SKIPPED/CANCELLED).
- **TopologicalScheduler**: Kahn + DFS back-edge detection (loops run). Inline conditional branching (`_extractBranch` on `output.branch`, `_matchBranchLabel` exact + true/false synonyms). Merge nodes handled via `_passiveDecrements`/`_skipUnreachable` (enforces GXE-020/034).
- **Resume/WAIT**: `RunStatus.WAIT_FOR_INPUT` → `_handleWaitForInput` → `RuntimeEngine.resumeExecution` → `scheduler.resumeNode` propagate downstream. Multiple pauses supported. Point-resume works.

**DELTA:**
1. Only 3 scheduling strategies (no ADAPTIVE, contrary to hypothesis of 5).
2. Point-resume works (opposes "resume broken" hypothesis); re-execution pattern is a separate `dialog`-subType mode.
3. Merge nodes supported (opposes "merge forbidden" constraint).
4. **Two `CheckpointManager` classes** (naming collision): `resilience/` (Redis wait-context + voting — used by scheduler) vs `persistence/` (snapshots + versions + RecoveryManager — exported in `runtime/index`, used only by tests).
5. **RuntimeEngine.execute() creates the scheduler WITHOUT checkpointManager** → wait-contexts NOT persisted in the synchronous path.
6. **Dead control-flow API**: `control/ConditionalBranch.js` + `LoopPattern.js` (createIfElse/createSwitch/createForEach/createWhile/...) exist and are tested but **not imported by scheduler, NodeRunner, or AOPEG**. Parallel unused API.
7. `persistence/RecoveryManager` (restore-from-snapshot) implemented but not wired into the main loop.

---

## 4. Generation & Validation (RECON-02)

SDA Pipeline: **IntentClassifier(S1) → ToolResolver(S2) → TaskPlanner(S3) → GraphCompiler(S4) → GraphValidator(S5)**, orchestrated in `gxe.controller.js`. IR layer: `process-representation.js` (POWL-style `PROCESS_TYPES`: SEQUENCE/PARALLEL/CHOICE/LOOP) + `soundness-checker.js`.

- **GraphCompiler**: deterministic (no LLM), 3 modes — `compileFromIR` (main), `compileFromTaskPlan` (legacy), `compileFromRawLLM` (fallback). Inserts type-adapter nodes, START/END anchors, fork/join.
- **GraphValidator**: 9 structural checks (EMPTY_GRAPH, MISSING/DUPLICATE_IDs, INVALID_EDGE_SRC/TGT, GRAPH_HAS_CYCLES, DISCONNECTED, NO_ENTRY/EXIT, NO_INPUT/OUTPUT, UNKNOWN_TOOL_IDS, SELF_LOOPS, DUPLICATE_EDGES) + autoFix + topological layout. Fatal: EMPTY, CYCLES, NO_ENTRY, NO_EXIT.
- **Two soundness layers:** (A) IR `SoundnessChecker` — ProMoAI/POWL heuristics, 8 checks (structure/acyclic/reachability/completeness/type-compat/resource-limits/determinism/branch-isolation), synchronous, in compiler. (B) **Petri Woflan (pm4py)** — formal WF-net soundness in `gnn-service`, via `petri-client.js`, gated `PETRI_VALIDATION_ENABLED` (**default OFF**), non-blocking, `SaveGraphTool` Stage 1b.
- **Memgraph schema:** `(:CatalogRoot)-[:CONTAINS]->(:CatalogEntry)-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(:GraphVersion)`; `SUPERSEDES` version chain; `CHILD_OF`/`DECOMPOSES{nodeId}`; content-hash dedup; `recordReuse` lineage.

**DELTA:**
1. Petri rule = **GXE-060** (not GXE-055; GXE-055 is a different rule — executor-param registration).
2. Petri is OFF by default and validates on **SAVE**, not **EXECUTE** — RuntimeEngine calls only `validator.validate()` (structural), never `validateSoundness()`. A graph can execute bypassing formal WF-net checks entirely.
3. **Semantic downgrade**: rich POWL IR (CHOICE/LOOP/PARALLEL) flattens to flat DAG + control executors + labeled/back edges. Formal process model lost before execution.

---

## 5. Executor Vocabulary (RECON-03)

- Control logic is minimal: single production condition **`workflow.condition`** (`vm.runInNewContext`, outputs `{branch}`) + a lighter base `common.conditional` (via `createSimpleCondition`). **No loop/parallel/fork/join executor** — loops are topological (back-edges) only; parallelism is emergent (scheduler runs READY nodes ≤ maxConcurrency).
- **CGE (Canonical Graph Envelope)** — `constants/canonical-graph.constants.js` (`createEnvelope`/`buildNode`/`buildEdge`/`PROJECTION_KIND`). All 12 investigation primitives return `{ content: envelope, evidencedBy: [nodeIds] }` — a typed graph projection with provenance (`producedBy:'TOOL'`, `toolId`) and evidence. **Living "Graph = Data" contract, but localized to investigation only.**

**DELTA:**
1. **Phantom executors (generation↔execution break):** GraphCompiler maps `CONTROL_FLOW → 'control.condition'` and fork/join → `'control.parallel'`. **These executor types do not exist** (real = `workflow.condition`). Compiler-generated control-flow graphs fail RuntimeEngine tool-validation (`missingTools` → FAILED). GXE-013 rule exists precisely for this but is not compile-time enforced.
2. investigation "11 primitives" (doc) → **12 registered** (SEARCH added).
3. Control-flow semantics smeared across `workflow.condition` + edge labels + back-edge topology; no loop/parallel node encapsulation → opaque to static control-flow analysis.

---

## 6. GxeManager ↔ RuntimeEngine (RECON-04, LIVE on :3010)

- `POST /api/v1/gxe-manager/executions {graphId, inputPayload, triggerType}` → `GxeManagerService.launch()` → full execution record (executionId, status lifecycle, nodeStates, timeoutAt, checkpointRef, transactionId, retryCount).
- Live chain confirmed: **MANUAL Trigger → ExecutionRegistry → RuntimeEngine.execute() → nodeStates → status**. MANUAL is **synchronous** (BullMQ not exercised; SCHEDULED/CRON use BullMQ/setInterval via TriggerEngine).
- FAIL_FAST cascade confirmed live (failed → downstream CANCELLED → unreached SKIPPED). TemplateResolver resolves `{{input.*}}`/`{{<nodeId>.*}}`; missing upstream → `UNRESOLVED_TEMPLATE`.

**DELTA:**
1. **Audit log EMPTY** — `GET /gxe-manager/audit` = `{entries:[], count:0}` despite 731 executions. AuditLogger not capturing lifecycle.
2. **609 WAITING zombies (83%)** — abandoned WAIT_FOR_INPUT, never resumed/timed-out. `timeout` BullMQ queue exists but does not reap waits.
3. **checkpointRef=null, transactionId=null** in every run — confirms §3 DELTA#5 live; SAGA not auto-triggered despite `useSaga:true` for business subtype.
4. **Reference graph "[MTH] Research UN Service" is broken** — N03 `UNRESOLVED_TEMPLATE` (data-flow defect in a catalog graph). No pre-flight template-completeness check.

---

## 7. Codex Governance (RECON-05)

- GXE-001..060 all ACTIVE + BA-070/071/072 + CGE(4)/MTH(3)/PROV(5)/DLG(6)/EC(5). Strong branch-discipline set (GXE-050..054), Petri gate (GXE-060), versioning (GXE-009/010), merge-indegree (GXE-020/034).
- **CodexValidatorService validates the RULE NODES themselves** against an "Information Contract" (doc completeness ≥0.90) — meta-validation of rule quality, **not enforcement of rules on graphs**.

**DELTA:**
1. GXE-055 ≠ Petri (it's "Executor Required Parameters Validated at Registration"); Petri = GXE-060.
2. **No graph GXE-linter.** Enforcement bifurcated: ~10 structural rules hard-coded (GraphValidator/scheduler/RuntimeEngine/SaveGraphTool); ~50 semantic rules are **declarative agent-context only** (`codex_load_rules`), unverified by code.
3. GXE-060 (the one formal gate) is dormant behind an off-by-default flag.

---

## 8. GNN & Sigillum (RECON-06)

- **GNN: zero usage in `runtime/`.** Fully isolated from the execution path. Used in 23 service files for KB enrichment, RAG retrieval, extraction, workspace link-prediction, and **SDA generation-assist** (tool-filter/tool-resolver/intent-classifier/reuse-strategy-resolver/pattern-matcher/community-detector). No runtime graph-quality/path prediction — an open niche.
- **Sigillum: fully implemented** — `/api/v1/sigillum`, 16 endpoints (branches/snapshots/seals/diff/verify) — git-like KG-state versioning with cryptographic seals. **Second, orthogonal versioning system** vs catalog `GraphVersion` (graphs). The two are unrelated.
- **BullMQ**: `QueueManager` with 4 queues (execution, trigger, signal, timeout) — distinct from the KB extraction queues noted in the 2026-05-11 audit. Two BullMQ subsystems.

---

## 9. Consolidated Tech-Debt Map (13)

1. Skip-cascades — mitigated in scheduler (GXE-020/034); formal detection (Petri) dormant.
2. Resume/WAIT — works but debug-log-laden; checkpointManager not wired in sync path; 609 WAITING zombies (no reaper).
3. Ad-hoc barriers — ALL/ANY/MAJORITY live in resilience CheckpointManager voting + Async Signal System, not unified with scheduler.
4. Dead control-flow API (ConditionalBranch/LoopPattern).
5. Two CheckpointManager classes (naming collision).
6. Phantom executors (`control.condition`/`control.parallel`) — generation↔execution break.
7. Audit log dead (0/731).
8. Checkpoint/SAGA not wired in sync path.
9. Reference graph broken (UNRESOLVED_TEMPLATE); no template-completeness pre-flight.
10. Semantic downgrade IR(POWL) → flat DAG.
11. Enforcement gap — ~50 declarative GXE rules; no graph linter.
12. Three compiler modes (duplicated normalization).
13. Two unrelated versioning systems (catalog GraphVersion vs Sigillum).

---

## 10. Relation to Prior Audit (2026-05-11)

Complementary, minimal overlap. The 2026-05-11 audit (Sonnet, `docs/reports/audit-2026-05-11/`, 12 files) is **platform-readiness breadth**: empty KB (GAP-001), Azure streaming (GAP-002), LLMProvider bypass in 18+ files (GAP-003), FlowDesk-in-core (VIOLATION-001), in-memory provenance (VIOLATION-002), RAG stubs (VIOLATION-003), security. Its **Target Architecture Document** and **Post-Audit Development Plan** remain **pending** (structure defined: Architectural Axioms + component boundaries + contracts + reference state). This RECON supplies the GXE-subsystem depth those documents need. Cross-check drift: executors 80+ → **103**; MCP tools 149 → **152**; Codex 100 → GXE alone now 60.

# Petri Net Soundness Validation

## Overview

Petri Net soundness validation is an optional graph quality gate that runs as
**Stage 1b** in `SaveGraphTool` immediately after structural validation.

It converts the ReactFlow DAG into a Workflow-net (WF-net) and runs the Woflan
algorithm (pm4py) to detect:

| Defect | Runtime symptom |
|--------|----------------|
| Dead transition | Branch silently skipped ("skip-cascade") |
| Deadlock | Graph hangs — no token ever reaches `p_end` |
| Improper termination | Multiple tokens reach `p_end` simultaneously |

Enabled via `PETRI_VALIDATION_ENABLED=true`. Disabled → skipped gracefully
(non-blocking).

---

## Architecture

```
SaveGraphTool
  └── validator.validateSoundness(nodes, edges, name)   ← async, optional
        └── PetriClient.validateGraph()                 ← HTTP to gnn-service
              └── gnn-service /petri/validate           ← Python, pm4py
                    └── Woflan (WF-net soundness)
```

### Files

| Layer | File | Purpose |
|-------|------|---------|
| Gate | `api/src/mcp/tools/catalog/SaveGraphTool.js` | Step 1b: calls validateSoundness() |
| Service | `api/src/services/graph/graph-validator.js` | `validateSoundness()`, `formatSoundnessError()` |
| Client | `api/src/services/petri/petri-client.js` | HTTP client for gnn-service |
| Python API | `gnn-service/src/api/petri_routes.py` | FastAPI router `/petri/validate` |
| Config | `api/src/config/environment.js` | `features.petriValidation` flag |

---

## SDA Pipeline Integration (Stage 5: GraphValidator)

The SDA pipeline (Staged DAG Assembly) produces graphs via:

```
IntentClassifier → ToolResolver → TaskPlanner → GraphCompiler → GraphValidator
```

`GraphValidator` (Stage 5) runs two checks:

1. **Structural validation** (synchronous, always on):
   - 9 checks: IDs present, no duplicate IDs, no cycles, entry node exists, etc.
   - `validator.validate({nodes, edges})` → `{valid, errors, warnings, stats}`

2. **Petri Net soundness** (async, feature-flagged):
   - `await validator.validateSoundness(nodes, edges, name)`
   - Returns `{valid, skipped, reason?, issues[], warnings[], metrics?}`
   - If `!valid && !skipped` → `formatSoundnessError()` → `GRAPH_SOUNDNESS_ERROR`

---

## Skip-Cascade Pattern

The most common soundness failure in GXE graphs:

```
workflow.start
    │
    ▼
[condition: check status]
    │              │
   true           false
    │              │
    ▼              ▼
[branch_a]    [branch_b]  ← dead transition: no outgoing edge
    │
    ▼
workflow.end
```

`branch_b` is a **dead transition** — tokens that reach it can never escape.
The GXE runtime silently skips the dead branch, producing incomplete results
with no error.

**Fix:** every branch MUST terminate at `workflow.end` (directly or via
descendant nodes). If a branch is an error handler, it still needs an explicit
path to `workflow.end`.

---

## API Reference

### gnn-service

```
GET  /petri/health
     → { status: "ok", pm4py_version: "2.7.x" }

POST /petri/validate
     Body: { nodes: ReactFlowNode[], edges: ReactFlowEdge[], graph_id?: string }
     → {
         sound: boolean,
         errors: string[],       // Woflan violations
         warnings: string[],     // additional checks
         checks: string[],       // checks performed
         metrics: {
           transitions: number,
           places: number,
           arcs: number
         }
       }
```

### GraphValidator methods

```javascript
// Always synchronous — does not call PetriClient
validator.validate({ nodes, edges })
  → { valid, errors, warnings, stats }

// Async, feature-flagged — call after validate()
await validator.validateSoundness(nodes, edges, graphId?)
  → {
      valid: boolean,
      skipped: boolean,
      reason?: 'PETRI_VALIDATION_DISABLED' | 'PETRI_SERVICE_UNAVAILABLE' | 'PETRI_SERVICE_ERROR',
      issues: string[],
      warnings: string[],
      metrics?: object
    }

// Convert soundness result to structured error (null if valid/skipped)
validator.formatSoundnessError(soundnessResult, nodes?)
  → null | {
      code: 'GRAPH_SOUNDNESS_ERROR',
      message: string,
      issues: [{ type, message, affectedNodes?, suggestion }],
      warnings: string[]
    }
```

---

## Feature Flag

| Variable | Default | Effect |
|----------|---------|--------|
| `PETRI_VALIDATION_ENABLED=true` | off | Enables soundness check in SaveGraphTool |

Set in `.env` or environment. Checked via `process.env.PETRI_VALIDATION_ENABLED === 'true'`.

**Graceful degradation:**
- Flag off → `{ skipped: true, reason: 'PETRI_VALIDATION_DISABLED', valid: true }`
- gnn-service down → `{ skipped: true, reason: 'PETRI_SERVICE_UNAVAILABLE', valid: true }`
- HTTP error → `{ skipped: true, reason: 'PETRI_SERVICE_ERROR', valid: true }`

Save proceeds in all skip cases. Only blocks when `!valid && !skipped`.

---

## WAIT_FOR_INPUT Handling

WAIT_FOR_INPUT nodes (e.g., `workflow.wait_input`, `flowdesk.ask_beneficiary`,
`flowdesk.confirm_request`) are **regular Petri Net transitions** — no special
soundness treatment is applied.

**Open World Assumption:** User input is assumed to be eventually available.
The Woflan algorithm checks structural reachability, not whether humans will
actually respond.

| Scenario | Petri Net result | Correct? |
|----------|-----------------|---------|
| WAIT node in middle of path: `start → wait → end` | Sound ✅ | Yes |
| WAIT node in sound branch: `cond → [wait → end, other → end]` | Sound ✅ | Yes |
| WAIT node with no outgoing edge (dead branch) | Unsound ❌ | Yes — real structural error |

Detection heuristics (`_is_wait_node()` in `petri_routes.py`):
- `data.tool` starts with `workflow.wait_input` or `workflow.waitForInput`
- `node.type` is `wait_input`, `wait`, or `waitForInput`
- `data.waitForInput === true`

Detected WAIT nodes are reported in `warnings[]` and `metrics.wait_nodes` as
**informational only** — they never fail soundness.

```
warnings: ["Graph contains 2 WAIT_FOR_INPUT node(s): [Ask Location, Confirm Request].
            These require user interaction at runtime (open world assumption applied)."]
metrics:  { ..., "wait_nodes": 2 }
```

---

## WF-Net Conversion

ReactFlow nodes and edges are converted to a Petri Net in `petri_routes.py`:

```
Each ReactFlow node   →  Petri transition
Each ReactFlow edge   →  Intermediate place (p_{src}_{tgt})
Entry node (inDegree=0)  →  p_start → transition
Exit node (outDegree=0)  →  transition → p_end
```

Woflan is then applied to the WF-net `(N, p_start, p_end)`.

---

## Tests

| Test file | Type | Coverage |
|-----------|------|---------|
| `api/tests/unit/graph-validator-soundness.test.js` | Unit | Feature flag, degradation, formatSoundnessError, WAIT handling — 13/13 |
| `api/tests/integration/petri-client.test.js` | Integration | Health, sound graph, skip-cascade, empty graph |

Run unit tests (no gnn-service required):
```
node api/tests/unit/graph-validator-soundness.test.js
```

Run integration tests (requires `gnn-service` on port 5001):
```
node api/tests/integration/petri-client.test.js
```

---

## Codex Rules

| Rule | Title |
|------|-------|
| `CODEX-RULE-GXE-060` | Graphs MUST Pass Petri Net Soundness Verification Before Catalog Save |
| `CODEX-RULE-BA-070` | Agent Must Verify Petri Soundness Before Deploying Graphs with Condition Nodes |
| `CODEX-RULE-BA-071` | Soundness Errors Are Not Auto-Fixable — Redesign Required |
| `CODEX-RULE-BA-072` | PETRI_VALIDATION_ENABLED Feature Flag Must Be Documented and Tracked |

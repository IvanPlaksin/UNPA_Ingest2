# GXE Generation Baseline — Phase 1 / TASK-P1-001

- **Date:** 2026-07-08
- **Author:** Claude Code (Opus 4.8)
- **Scope:** Baseline generation/authoring quality of GXE graphs, measured BEFORE any v3.0 changes.
- **Method:** No-LLM static analysis of all catalog graphs (live API :3010). LLM-based live generation baseline was **blocked** (see Blocker below), so a proxy baseline over already-generated catalog graphs is used instead.

---

## Blocker (must be resolved before LLM-dependent work)

**Anthropic API credit balance is exhausted.** Live SDA generation (`POST /api/v1/gxe/generate`, Path A) returns:

> `400 ... "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."`

Impact: no LLM-based graph generation (Path A SDA via Claude, and Path B agent if set to Claude per Р-1 default) can run. This blocks a *live* generation-success baseline and blocks testing of every LLM-dependent Phase-1 change (verifier reflection loop, agent loop, SDA). The agent default is `gemini-2.0-flash`, so a Gemini-keyed path may still work, but the Р-1 decision defaults to the Claude Code instance. **Action needed from Ivan:** restore Anthropic (and/or confirm Gemini) API credits before implementation can be exercised end-to-end.

There was also a secondary functional signal: the SDA path failed at **Tool Resolution** ("No tools resolved for this intent") before reaching the LLM — a separate SDA issue worth noting.

---

## Proxy Baseline — Catalog Graph Health (no LLM)

Static analysis of all **50** catalog graphs (nodes/edges from `/graph-catalog`), each checked against the live executor registry (`/aopeg/registry/executors`, 103 executors, 15 domains) and structural/template rules.

| Metric | Count | % |
|---|---|---|
| Total catalog graphs | 50 | 100% |
| **Fully clean** (all executors resolvable, entry+exit present, template-refs valid) | 27 | **54%** |
| **True phantom executors** (non-FlowDesk unresolved executor types) | 9 | **18%** |
| Unresolved **only** due to FlowDesk plugin not loaded | 13 | 26% |
| **Broken template refs** (`{{nodeId.field}}` → nodeId absent) | 6 | **12%** |
| Missing entry node | 0 | 0% |
| Missing exit node | 0 | 0% |

Notes:
- **Entry/exit discipline is perfect** (0 missing) — GraphValidator's fatal structural checks are effectively upheld across the catalog.
- The **44% "unresolved-executor" gross rate splits** into 18% true phantoms + 26% FlowDesk-only. FlowDesk is a *client* plugin that is conditionally loaded (`loadDomainPlugins` skips it when absent); its executors are real when the plugin is present, so FlowDesk-only graphs are not a generation defect — they are an environment/loading artifact. The **honest phantom rate is 18%**.
- **True phantom executor types** (reference types that do not exist in the AOPEG registry): `runtime.execute_subgraph` (21 node occurrences), `unknown` (9), `pattern.batch`/`pattern_batch` (5), and a family of `primitive.*` / `primitive_*` names (`primitive.set_value`, `primitive.get_value`, `primitive.compare`, `primitive.map`, `primitive.transform`, `primitive.log`, `primitive.wait_signal`, …), plus `ai.complete`, `ai.extract`, `graph.create_edge`, `graph_query`, `extraction.relations`. These are MCP-tool-level or legacy names that were never registered as AOPEG executors — the exact generation↔execution vocabulary drift identified in RECON-03.

---

## Interpretation for v3.0

The proxy baseline validates the v3.0 premise directly:

- **executor_existence** (a Level-1 verifier metric) would flag **18%** of catalog graphs today.
- **template_completeness** (Level-2/2.5) would flag **12%**.
- Combined, **~46% of catalog graphs have at least one resolvability or template defect** (18% phantom + 12% template + FlowDesk-loading ambiguity). Only 54% are unconditionally clean.

These are precisely the failure modes the ExecutableGraphVerifier targets. Post-implementation, the same static sweep is the regression metric: re-run this measurement and expect the phantom + broken-template share to trend toward 0 for newly generated/refined graphs.

### Baseline metric definitions (for post-change comparison)
- `phantom_rate` = graphs with ≥1 non-FlowDesk unresolved executorType / total. **Baseline: 18%.**
- `broken_template_rate` = graphs with ≥1 `{{nodeId.*}}` whose nodeId is absent / total. **Baseline: 12%.**
- `fully_clean_rate` = graphs with none of the above (and entry+exit present). **Baseline: 54%.**
- Live `first_try_validation_pass_rate` (Path A / Path B) — **NOT MEASURED** (blocked on API credits); to be captured once credits restored.

---

## Reproduction

The measurement is a single static sweep against the live API:
1. `GET /api/v1/aopeg/registry/executors` → valid executor type set (103).
2. `GET /api/v1/graph-catalog` → 50 entries (each already carries `nodes`/`edges`).
3. Per graph: flag nodes whose `executorType` (or `data.executorType`/`data.toolId`) is not in the registry (excluding `start/end/input/output` anchors; bucket `flowdesk.*` separately); flag `{{nodeId.*}}` refs whose nodeId is absent; confirm ≥1 entry (no incoming) and ≥1 exit (no outgoing).

No LLM calls; safe to re-run as a regression gate.

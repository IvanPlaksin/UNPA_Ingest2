# Known Issues

Engine- and library-level defects that have bitten this codebase, with the
workaround actually in use. Each entry names where the workaround lives so the
next person hitting the symptom finds the fix instead of re-deriving it.

---

## Memgraph: a map literal inside a list comprehension repeats the first element

**Discovered:** 2026-08-04, during Radix k-hop expansion (R1.2)
**Where the workaround lives:** `api/src/services/radix/strategies/k-hop-expansion.strategy.js`

### Symptom

A projection that builds maps inside a list comprehension returns the correct
number of entries, with the correct structure — and the **first element's values
repeated in every position**. Nothing errors; the data is simply wrong.

Graph paths came out reading `HybridRAG --> HybridRAG --> HybridRAG` instead of
`HybridRAG --> UN ProjectAdvisor --> LightRAG`.

### Reproduction

Both projections below run over the same `nodes(path)` in the same query:

```cypher
MATCH path = (seed)-[rels:DRAFT_RELATES_TO*1..2]-(target)
RETURN [n IN nodes(path) | {id: n.id, name: n.name}] AS asMaps,
       [n IN nodes(path) | n.name]                   AS asScalars
```

```json
"asMaps":    [{"name":"HybridRAG"}, {"name":"HybridRAG"}, {"name":"HybridRAG"}],
"asScalars": ["HybridRAG", "UN ProjectAdvisor", "United Nations"]
```

The scalar projection is correct. The map projection is not.

### Workaround

Return parallel scalar lists and zip them in application code:

```cypher
RETURN [n IN nodes(path) | n.id]      AS pathNodeIds,
       [n IN nodes(path) | n.name]    AS pathNodeNames,
       [n IN nodes(path) | labels(n)] AS pathNodeLabels
```

```js
const path = ids.map((id, i) => ({ id, name: names[i], labels: labelLists[i] }));
```

### Why it is dangerous

The result passes every structural check — right length, right shape, right
types — so unit tests against mocked rows stay green and the corruption only
appears in output a human reads. Any query that builds maps in a comprehension
should be treated as suspect.

---

## Memgraph: all workspace draft edges share one relationship type

**Discovered:** 2026-08-04, during Radix k-hop expansion (R1.2)
**Where it matters:** `api/src/services/workspace/draft.service.js:442`

Not a bug — a schema decision worth knowing before writing traversals.

`draft.service.createEdge` writes every semantic relation under a single label,
with the meaning in a **property**:

```cypher
CREATE (source)-[r:DRAFT_RELATES_TO { type: $edgeType }]->(target)
```

So `IMPLEMENTS`, `GOVERNS`, `DEPENDS_ON`, `CONFLICTS_WITH` are all
`DRAFT_RELATES_TO` at the label level. Two consequences:

1. **`type(r)` is useless for semantics** — it always returns
   `'DRAFT_RELATES_TO'`. Read `r.type`, or `coalesce(r.type, type(r))` to stay
   safe on edges written by other code paths. Weight tables and edge-type
   filters keyed on the label silently degrade to a single bucket.
2. **Untyped variable-length traversal escapes the drafts.** A pattern like
   `(seed)-[*1..2]-(target)` also walks `CONTAINS_DRAFT` up to the `:WorkSpace`
   node and back down, which puts *every* draft two hops from *every* other
   draft. Pin the pattern: `(seed)-[rels:DRAFT_RELATES_TO*1..2]-(target)`.

---

## Memgraph: the workspace subsystem requires `id` indexes

**Discovered:** 2026-08-04, during the Radix latency benchmark (R1.6)
**Fix:** `node api/scripts/create-workspace-indexes.js` — run once per database

### Symptom

Every workspace operation is slow, and gets slower as *unrelated* data grows.

### Cause

Every workspace service opens with `MATCH (w:WorkSpace {id: $wsId})`. Without an
index on `:WorkSpace(id)` that plans as a full scan of the graph:

```
* Filter (w :WorkSpace), {w.id}
* ScanAll (w)              <-- every node in the database
```

Draft labels had indexes on `status` and `workspaceId` but not on `id`, which is
what hydration and graph expansion actually filter on (`d.id IN $ids`).

### Measured effect

Same benchmark, same workspace, 30 queries, before and after creating the 14
indexes — no application code changed between the two runs:

| Metric | Before | After |
|---|---|---|
| Total P95 | 681 ms | **201 ms** |
| Total P50 | 566 ms | 171 ms |
| Vector seed (mean) | 246 ms | 58 ms |
| K-hop expansion (mean) | 184 ms | 46 ms |
| Draft hydration (mean) | 189 ms | — folded into the above |
| Cold start | 3398 ms | 830 ms |

Reproduce with `node api/scripts/radix-benchmark.js --workspace <id>`.

### Note

`CREATE INDEX` needs exclusive storage access. If the API is serving traffic,
some statements fail with *"Cannot get read only access to the storage"* — the
script is idempotent, so just run it again.

---

## Memgraph: integer parameters in `LIMIT` / `SKIP` / path bounds

Cypher accepts no parameter in a variable-length path bound (`*1..$n`) or in
`LIMIT`, and Memgraph additionally needs `neo4j.int()` for integer parameters
elsewhere. Radix sidesteps both by clamping the value to a validated integer
range and interpolating it as a literal — see `_buildCypher` in
`k-hop-expansion.strategy.js`.

---

## Jest 30: `--testPathPattern` was renamed

The flag is now `--testPathPatterns` (plural), and it is CLI-only. The old
singular form fails with a config error rather than being ignored.

```bash
npx jest --testPathPatterns="radix"
```

# Suada Phase 1 — `EVOLUTIO:PROMPT` Ontology

**Task:** TASK-SUADA-PHASE1-SPEC
**Status:** DRAFT — for ratification before implementation
**Governing rules:** SUADA-002 (layer above dialogue-gym, not a duplicate),
SUADA-003 (layer 1 first, layer 2 migrates node by node),
FLOWDESK-PROMPT-001 (prose calls only)

The existing FlowDesk prompt-graph is a list with headings: a node is a sentence,
an edge means "comes after". That is enough to *edit* a prompt and not enough to
*evolve* one — there is nothing to mutate but the string, and nothing to attribute
an outcome to but the whole. This spec defines a structure where a prompt has
parts that can be added, removed, reordered, conditioned and blamed individually.

---

## 0. What already exists (do not rebuild)

Established by the Phase 0 reconnaissance and reaffirmed here so the scope stays
honest:

| Capability | Where it already lives | Suada's relation |
|---|---|---|
| Graph storage + versioning | `graphCatalog.service` — `CatalogEntry→GraphDefinition→GraphVersion`, `SUPERSEDES`, `contentHash` | **consumes** |
| Publication contour | `system-prompt.service.applyFromGraph` → one ACTIVE node, 30s cached read that never throws | **consumes** |
| Evaluation | dialogue-gym: `Persona`, `Scenario`, `ArenaRun`, `ArenaTurn`, `JudgeRecord` | **consumes** |
| Evolution loop | `gepa-orchestrator` — reflect → mutate → Pareto → governance | **extends** (Phase 4) |
| Ratification | `POST /scenarios/:id/verify-ground-truth`, `governance.service` | **consumes** |
| Turn provenance | `promptGraphEntryId/Version/TextHash`, `overlayHash/overlayIds` on `ChatTurn` | **consumes** |
| KB-state snapshots | Sigillum (`SnapshotRecord/BranchRecord/SealRecord`) — implemented, `NodeVersion` layer empty | **defer** (§9) |

Suada builds exactly three things: **a typed prompt ontology**, **a compiler**,
and **an attribution layer**. Everything else is wiring to the above.

---

## 1. Node types

All nodes share a common envelope; each type adds its own fields.

### 1.1 Common envelope (every node)

| Property | Type | Notes |
|---|---|---|
| `nodeId` | string | stable, survives rewording — the identity attribution accumulates against |
| `type` | enum | `Thesis` \| `Narrative` \| `Constraint` \| `Exemplar` \| `Persona` \| `ToolContract` |
| `title` | string | human label; never compiled into the prompt |
| `body` | string | the text that reaches the model (empty for pure grouping nodes) |
| `status` | enum | `CANDIDATE` \| `ACTIVE` \| `DEPRECATED` |
| `appliesToNodes` | string[] | engine LLM nodes, per `PROMPT_NODES` — see §1.9 |
| `priority` | int | tie-break within a compilation band; lower = earlier |
| `weight` | float 0..1 | how strongly it competes for token budget (§5.4) |
| `origin` | object | provenance — §3 |
| `createdAt`/`updatedAt`/`createdBy` | ISO / string | |

`status` is deliberately not a boolean `enabled`. `CANDIDATE` is what GEPA
produces and a human has not yet accepted; `DEPRECATED` is retired but retained
so historical attribution still resolves. A node is never deleted — deleting one
orphans every `JudgeRecord` that was attributed to it.

### 1.2 `Thesis` — an atomic behavioural prescription

The workhorse. One thesis states one thing the assistant should do.

| Property | Type | Notes |
|---|---|---|
| `category` | enum | `identity`\|`domain`\|`routing`\|`dialogue`\|`tone`\|`safety`\|`deflection`\|`formatting`\|`custom` — carried over from the existing compiler so migration is lossless |
| `assertion` | string | the instruction, one sentence |
| `scope` | enum | `global` \| `service` \| `route` |
| `scopeRef` | string\|null | serviceId or route name when scope ≠ global |

**Atomicity is the contract.** "Ask one question per turn and acknowledge what you
understood first" is two theses. If it cannot be violated independently, it cannot
be attributed independently, and attribution is the whole point.

### 1.3 `Narrative` — role and situational framing

| Property | Type | Notes |
|---|---|---|
| `framing` | string | who the assistant is, where it operates, what the user is doing there |
| `audience` | string\|null | e.g. "field staff", "HQ administrators" |

Distinct from `Thesis` because it prescribes nothing and cannot be "violated" —
it can only be present or absent. Judges must not score it as a rule.

### 1.4 `Constraint` — a hard limit

| Property | Type | Notes |
|---|---|---|
| `rule` | string | the prohibition or obligation |
| `kind` | enum | `safety` \| `privacy` \| `legal` \| `scope` |
| `severity` | enum | `blocking` \| `strong` |
| `immutable` | boolean | when true, **GEPA may not mutate or drop it** |

`immutable` is the load-bearing field. An optimizer maximising task success will
eventually discover that dropping "do not expose other people's personal data"
raises the score. Constraints marked immutable are excluded from the mutation
operator's candidate set and are re-checked after every compilation (§5.5). This
is not a nicety; it is why an autonomous prompt optimizer is safe to run at all.

### 1.5 `Exemplar` — a few-shot example

| Property | Type | Notes |
|---|---|---|
| `input` | string | the user utterance |
| `output` | string | the desired response or label |
| `polarity` | enum | `positive` \| `negative` (do this / never this) |
| `illustrates` | edge | `ILLUSTRATES` → the node it demonstrates |

Exemplars are the largest token consumers and the most reliable behaviour
changers, which makes them precisely what a budget-aware compiler must be able to
drop first and an attribution layer must be able to credit. In today's system
they are buried inside the hardcoded router prompt (~20 of them) and cannot be
touched without a deploy.

**Deidentification applies here.** An exemplar derived from a real dialogue must
come through the promotion path of `SUADA_PII_DEIDENTIFICATION_SPEC.md`.

### 1.6 `Persona` — register and voice

| Property | Type | Notes |
|---|---|---|
| `register` | string | tone description |
| `language` | enum\|`all` | `en`\|`fr`\|`es`\|`ar`\|`zh`\|`ru`\|`all` |
| `channel` | enum\|`all` | `text` \| `voice` \| `all` |

Separate from `Narrative` because it varies along axes nothing else does: the
voice channel already needs different wording from text (an open question left
by VF-3/VF-4), and per-language register is a real requirement in a six-language
service desk. `APPLIES_WHEN` (§2.5) selects the right one at compile time.

### 1.7 `ToolContract` — how to use a capability

| Property | Type | Notes |
|---|---|---|
| `toolId` | string | the capability (catalog search, directory resolve, submit, escalate) |
| `usage` | string | when to use it and when not to |
| `escalation` | string\|null | what to do when it fails |

Today this is scattered through the engine's hardcoded prompts. Isolating it
matters for Phase 5: tool instructions change when a tool changes, on a different
cadence from tone or identity, and should be versionable independently.

### 1.8 Why these six and not more

Each type earns its place by having a distinct **failure mode**, a distinct
**mutation vocabulary**, and a distinct **evaluation criterion**:

| Type | Fails as | Mutated by | Judged by |
|---|---|---|---|
| Thesis | wrong behaviour | rephrase, split, retire | intent accuracy, efficiency |
| Narrative | wrong framing | rewrite | helpfulness |
| Constraint | violation | *not mutated when immutable* | safety review |
| Exemplar | mis-generalisation | add, remove, flip polarity | intent accuracy |
| Persona | wrong register | rewrite per language | tone score |
| ToolContract | wrong tool use | rewrite | controls correctness |

A seventh type is justified only when a real defect cannot be expressed by these.

### 1.9 `appliesToNodes` and the contract that broke once

The list is constrained to `PROMPT_NODES` from `prompt-graph-compiler` —
currently `router`, `info_answer`, `question_planner`, `field_help`. Per
FLOWDESK-PROMPT-001 these are the prose-generating calls; schema-bound extractors
are not scopes.

Carrying forward the fix from TASK-FLOWDESK-BUG-001: an **empty** list means every
node; a list naming **only unknown** nodes means **no** node (never "all"). The
validator must name such a node explicitly. This inverted default is how the
original defect turned a dead rule into a global one, and the new ontology must
not reintroduce it.

---

## 2. Edge types

Edges carry meaning here, unlike the current graph where they only order.

### 2.1 `REFINES` — specialisation

`(child)-[:REFINES]->(parent)`. The child narrows the parent for a narrower
situation. Compilation emits parent then child, so the specific reads as a
qualification of the general. Attribution propagates upward at reduced weight: if
a refinement is implicated, its parent is partially implicated.

Must be acyclic. A cycle is a definitional error, not a stylistic one.

### 2.2 `DEPENDS_ON` — required ordering

`(a)-[:DEPENDS_ON]->(b)` — *a* is only meaningful if *b* is present.
Consequences: `b` must precede `a`; the budget pruner may not drop `b` while
keeping `a`; dropping `b` drops `a`.

This is what makes budget pruning safe. Today the compiler can truncate anywhere
because it does not know which sentences need each other.

### 2.3 `CONFLICTS_WITH` — mutual exclusion (symmetric)

`(a)-[:CONFLICTS_WITH {reason}]->(b)`. Both active and both in scope = a
compilation **error**, not a warning. Contradictory instructions are the single
most common cause of unstable LLM behaviour, and they arrive precisely when an
optimizer adds a thesis without knowing what is already there.

Resolution is a human act: retire one, condition them apart via `APPLIES_WHEN`,
or merge. GEPA may **propose** a resolution but not apply one.

### 2.4 `ILLUSTRATES` — exemplar binding

`(exemplar)-[:ILLUSTRATES]->(thesis|constraint|toolcontract)`. An exemplar with no
`ILLUSTRATES` edge is an orphan: it teaches something no rule states. The
validator warns — this is usually a missing thesis, and surfacing it is one of the
more useful things the structure buys.

Also the pruning handle: under budget pressure, drop exemplars before the theses
they illustrate.

### 2.5 `APPLIES_WHEN` — conditional activation

`(node)-[:APPLIES_WHEN {condition}]->(ConditionNode)`, or an inline predicate on
the edge. Conditions are **declarative and closed** — evaluated by the compiler,
never by an LLM:

```
language IN ['fr','es']        channel = 'voice'        engineNode = 'router'
serviceId = 'EO-HR-BE-TRE-TRE' activeRoute = 'INFO_QUESTION'
```

No arbitrary expressions. A conditional prompt whose conditions cannot be
statically enumerated cannot be reasoned about, budgeted, or tested — and every
compilation must be reproducible from `(graph version, context)` alone.

Multiple conditions on one node are ANDed; multiple `APPLIES_WHEN` edges are ORed.

### 2.6 Rejected edge types

- `SIMILAR_TO` — no compilation or attribution consequence; it is an analysis
  result, not a structural fact. Compute it, do not store it.
- `SUPERSEDES` between nodes — version lineage belongs to graph-catalog at the
  graph level; duplicating it per node creates two disagreeing histories.

---

## 3. Provenance per node

Every node records **why it exists**. Without this the graph becomes what the
current prompt already is: a pile of sentences nobody dares remove because nobody
remembers what they were for.

```
origin: {
  kind:        'incident' | 'audit' | 'norm' | 'human' | 'evolved' | 'legacy',
  ref:         string | null,   // sessionId, JudgeRecord id, document symbol, backlogId
  rationale:   string,          // one sentence: what problem this solves
  introducedBy:string,          // user id or 'gepa:<optimizationId>'
  introducedAt:ISO
}
```

`kind` values map to real sources already in the platform: `incident` → a triaged
`ChatSession` with a `rootCause`; `audit` → a `JudgeRecord` failure; `norm` → a UN
policy document in the document graph; `evolved` → a GEPA candidate; `legacy` →
migrated from today's prompt with origin genuinely unknown (§7).

**`legacy` must be honest.** Migration will produce many of them. Inventing a
plausible rationale for a rule whose purpose nobody recalls would poison the one
field whose value depends entirely on being true.

Metrics are **not** stored on the node. They are derived from `ATTRIBUTED_TO`
edges (§8) and change with every run; a node property would be a cache that goes
stale silently.

---

## 4. The schema as a versioned artifact

The ontology itself evolves. Today's equivalent lives in JSDoc and validator
`if`s and cannot be versioned at all.

- **Form:** JSON Schema (`api/src/instances/.../contracts/` convention — the
  project already keeps `*.schema.json` for `controls`, `draft-sr`,
  `schema-snapshot`, `interpreter-nodes`).
- **Storage:** its own `CatalogEntry` in namespace `EVOLUTIO:PROMPT_SCHEMA`, with
  the same `GraphVersion`/`SUPERSEDES` chain every other artifact uses.
- **Binding:** every compiled prompt manifest records `schemaVersion`. A prompt
  compiled under schema v3 stays interpretable after the schema reaches v5.
- **Compatibility rule:** adding an optional property or a node/edge type is a
  minor bump; removing or narrowing anything is major and requires a migration
  that rewrites affected graphs. A major bump without a migration is rejected.

---

## 5. Compilation contract

### 5.1 Signature

```
compile(graph, context) -> { text, byNode, manifest, diagnostics }

context = { engineNode, language, channel, serviceId?, activeRoute?, tokenBudget? }
```

Pure and deterministic: the same `(graph version, context)` yields byte-identical
output. This is required for `promptTextHash` (PREREQ-001) to mean anything.

### 5.2 Selection

1. Drop `status ≠ ACTIVE`.
2. Drop nodes whose `appliesToNodes` excludes `context.engineNode` (per §1.9).
3. Evaluate `APPLIES_WHEN`; drop unsatisfied.
4. Close over `DEPENDS_ON` — pull in anything a survivor needs.
5. Check `CONFLICTS_WITH` among survivors → error if any pair remains.

### 5.3 Ordering — position matters

Emission bands, in order:

```
1. Narrative              — framing first; the model reads it as the setting
2. Constraint (blocking)  — early, where attention is reliable
3. Persona                — register before content
4. Thesis, by category    — CATEGORY_ORDER, then REFINES depth, then priority
5. ToolContract
6. Exemplar               — grouped under what they illustrate
7. Constraint (blocking, repeated)  — see below
```

Blocking constraints are emitted **twice**, at the start and the end. Attention
degrades in the middle of long contexts, and the instructions that must not be
missed are exactly the ones that must not sit there. This is a deliberate,
measurable design choice: it costs tokens, and if an arena comparison shows no
difference, it should be dropped. Recording it here makes it testable rather than
folklore.

### 5.4 Token budget

When `context.tokenBudget` is set and the selection exceeds it, prune in order:

1. `Exemplar` with lowest `weight` (never below one per illustrated node)
2. `Thesis` in `custom`, ascending `weight`
3. `Narrative` detail
4. **Never** a `Constraint`, and never a `DEPENDS_ON` prerequisite of a survivor

If the budget cannot be met without dropping a constraint, compilation **fails**.
Silently shipping an over-budget prompt and silently shipping an unsafe one are
both worse than a loud failure. The current compiler's `MAX_TEXT = 16000`
slice-and-hope is precisely the behaviour being replaced.

### 5.5 Manifest

```
manifest: {
  schemaVersion, graphEntryId, graphVersion,
  context,                       // echoed, so the compilation is reproducible
  nodes: [{ nodeId, type, version, band, position, tokens }],
  droppedForBudget: [nodeId],    // never silent
  conflictsChecked: int,
  constraintsPresent: [nodeId],  // post-compilation safety re-check
  textHash
}
```

The manifest is the object attribution is computed against — it states exactly
which nodes, in which order, produced this text. `textHash` is the same sha256
convention as PREREQ-001, so a `ChatTurn` joins straight to a manifest.

`droppedForBudget` is non-negotiable: a prompt that quietly lost a rule looks
identical to one that never had it, and an attribution layer would credit the
absence to the wrong node.

### 5.6 Backward compatibility

The compiler emits the same shape today's `applyFromGraph` consumes —
`{ text, byNode }` — plus the manifest. `system-prompt.service` needs one added
field (`manifestJson`); nothing else in the runtime changes.

---

## 6. Integration points

| Seam | Contract | Change required |
|---|---|---|
| graph-catalog | `createGraph/createVersion/getVersion/promoteVersion`, namespace `EVOLUTIO:PROMPT` | none |
| system-prompt.service | `applyFromGraph(graph, meta)` → ACTIVE node | store `manifestJson`; `getProvenance()` gains `manifestHash` |
| interpreter-engine | `fetchSystemPrompt(node)` → string | none in Phase 1 (context passed at apply time, not per turn) |
| chat-telemetry | turn provenance | none — `promptTextHash` already joins to the manifest |
| dialogue-gym | `ArenaRun.promptEntryId/promptVersionNumber` | none — already records catalog coordinates |
| GEPA | `MUTATION_OPS` | Phase 4 only |
| prompt-editor (FlowDesk) | current rules graph | becomes a **projection**: read-only view of `Thesis` nodes (§7) |

One deliberate deferral: per-turn compilation (choosing the prompt by the live
turn's language and route) is **not** Phase 1. Today's contour compiles at *apply*
time and caches one active text. Making compilation per-turn changes the caching
model and the provenance grain at once. Phase 1 keeps apply-time compilation with
a fixed context; per-turn conditioning is a later, separately measured step.

---

## 7. Migration of the existing prompt-graph

Source: `CatalogEntry` "Chat System Prompt (opening flow)", namespace
`CHAT_PROMPT`, 22 rules, 9 categories.

**Direction of truth (SUADA-002 restated):** Suada's graph becomes the source;
the FlowDesk prompt-editor becomes a consumer. Concretely, in Phase 1 the editor
keeps working unchanged against `CHAT_PROMPT`, and the Suada graph is built
*alongside* from the same content. They are reconciled only when the parity test
passes — never a big-bang cutover on a live chat.

Mapping:

| Existing | Becomes | Note |
|---|---|---|
| rule, `category='identity'` | `Narrative` or `Thesis` | framing → Narrative; prescription → Thesis |
| rule, `category='safety'` | `Constraint`, `kind='safety'` | `immutable=true` for the two that state privacy and no-invention |
| rule, `category='tone'` | `Persona` (register) or `Thesis` | |
| all other rules | `Thesis`, category preserved | |
| `appliesTo` | `appliesToNodes` | with the §1.9 semantics |
| `priority` | `priority` | unchanged |
| `enabled=false` | `status='DEPRECATED'` | retained, not deleted |
| ordering edges | dropped | they encoded layout, not meaning |
| — | `origin.kind='legacy'` | rationale left empty where genuinely unknown |

**Parity test (the gate):** for each of the four engine nodes, compile the Suada
graph and the existing graph and compare `byNode` after normalising whitespace and
bullet markers. Divergence is either a migration error or an intended improvement;
each divergence must be named and accepted individually, never accepted in bulk.

Known intended divergence already in flight: `safety-no-invent` now reaches
`field_help` (TASK-FLOWDESK-BUG-001). Baseline the parity test *after* that graph
is applied, or every comparison will carry that one difference as noise.

Layer 2 (the hardcoded node prompts — larger than layer 1, including ~20 router
exemplars) is **out of scope here**; it migrates in Phase 5 per SUADA-003, one
engine node at a time, each with its own parity test.

---

## 8. Attribution edges (Phase 3 forward-declaration)

Named here because the ontology must accommodate them, not built in Phase 1.

```
(JudgeRecord)-[:ATTRIBUTED_TO {weight: float, polarity: 'positive'|'negative',
                               method: 'presence_regression'|'ablation'|'gnn',
                               computedAt: ISO}]->(node)
```

Phase 3 uses `presence_regression` — regress judge scores on binary
node-presence features across candidates. It needs only what the manifest already
records, works at the sample sizes actually available (34 ArenaRun today, a few
hundred after EXP-001), and is interpretable. `gnn` stays declared and unbuilt
until there are ≥500 runs and the heterogeneous layer exists (Phase 0 found the
GNN service is homogeneous-only).

The `method` field exists so that when a stronger method arrives, old attributions
remain distinguishable rather than silently comparable.

---

## 9. Sigillum

Not used in Phase 1. It is implemented (~1150 lines, `/api/v1/sigillum`) but its
`NodeVersion` layer is empty, so its snapshots currently describe nothing.
graph-catalog covers artifact versioning, which is what a prompt graph needs.

Sigillum's real fit is **experiment reproducibility**: "what state was the entire
knowledge base in when this run happened" — the question that arises when an
arena result cannot be reproduced because the service catalog changed underneath
it. That is a Phase 3+ concern and requires populating `NodeVersion`, which is an
L-sized task of its own.

---

## 10. What Phase 1 delivers

| Deliverable | Size |
|---|---|
| JSON Schema for nodes and edges, in graph-catalog namespace `EVOLUTIO:PROMPT_SCHEMA` | M |
| `evolutio-prompt.service.js` — CRUD over graph-catalog, validation | M |
| Validator: acyclic `REFINES`, no active `CONFLICTS_WITH` pair, orphan exemplars, unreachable `appliesToNodes`, `DEPENDS_ON` closure | M |
| Compiler (§5) with manifest | L |
| Migration script for the 22 existing rules | S |
| Parity test harness | M |
| Tests | M |

Total ≈ L. **Not delivered in Phase 1:** editor UI (the existing one keeps
working), per-turn compilation, attribution, mutation, GNN.

---

## Open questions for ratification

1. **Six node types, or fewer to start?** `ToolContract` and `Persona` have no
   content to migrate from today's layer-1 graph — their content is all in layer 2.
   Defining them now costs nothing and keeps the schema stable when Phase 5
   arrives; defining them later means a schema major bump. I lean to defining all
   six now. Confirm.
2. **Duplicate emission of blocking constraints (§5.3)** — accepted as a design
   choice to be measured, or should the compiler emit once until an arena run
   justifies the token cost?
3. **Compilation failure on unmeetable budget (§5.4)** — is failing loudly right,
   given that today's behaviour is to truncate and continue? Failing means an
   over-budget graph cannot be applied at all.
4. **`CONFLICTS_WITH` as a hard error** — or a blocking warning an operator can
   override with a recorded justification? Hard error is safer; override is more
   workable when two rules conflict only in a situation that cannot arise.
5. **Migration direction (§7)** — confirm that Phase 1 builds the Suada graph
   *alongside* `CHAT_PROMPT` rather than converting it, with reconciliation only
   after parity. This keeps the live chat untouched for the whole phase.

# WorkSpace System — Reference Documentation

> **Last verified against code:** 2026-04-08
> **Scope:** Phase 1 (CRUD + Promotion SAGA) + Phase 2 (Agent / Canvas / Versioning / Contradictions / Cross-source / Validator) + Phase 3 (Versions UI / Auto-detect / Promotion Wizard / Embedding similarity / Suggestions / EdgeInspector / GNN link prediction)

> **How to read this document.** The first two sections are written as narrative — they explain *why* the WorkSpace subsystem exists, what problem it solves, and what value each capability brings to the user. The remaining sections (§3 onwards) are a technical reference for developers maintaining the code.

---

## 0. The Problem: Extracting Trustworthy Knowledge from Legacy Documents

### 0.1 Why we need a knowledge extraction subsystem at all

The UN ProjectAdvisor mission is to preserve and make searchable the **institutional knowledge** that lives in thousands of legacy artefacts: standard operating procedures, technical reports, internal wikis, database schemas, vendor contracts, audit reports, hand-written user manuals. This knowledge is the substrate for every downstream AI feature in the platform — FlowDesk service intake, the Codex compliance system, the GXE workflow generator, the project advisor chat itself. Without a clean, structured Knowledge Base, every downstream assistant becomes a guess engine.

The naive solution would be to point a large language model at the documents and write whatever it produces straight into the global Knowledge Base. **This approach fails for four reasons** that the WorkSpace subsystem is specifically designed to fix.

### 0.2 Why direct LLM-to-KB extraction fails

**1. Hallucinations are silent and contagious.** Modern LLMs are extremely good at parsing unstructured text into structured concepts, but they invent things. They hallucinate field names that aren't in the source, they invent confidence values, they translate Russian terms into English equivalents that don't quite match, they collapse two distinct entities into one. The instant a single hallucinated "business rule" lands in the KB, every downstream assistant inherits the lie. There is no automatic way to detect this after the fact — by the time someone notices, half a dozen workflows are already referencing the bad data.

**2. A single document rarely tells the whole story.** A business rule about expense approval may be defined in a 2024 SOP, modified in a 2025 update, and silently contradicted by an internal memo. Three sources, three slightly different statements. The KB ultimately needs ONE canonical answer — but the system itself doesn't know which version is right. A human has to adjudicate, and to do that the human needs to *see all three versions side by side*, with their sources, dates, and confidence scores. Naive extraction loses this context: only the last writer wins.

**3. Provenance is the only thing that makes extracted knowledge defensible.** When the KB says "Maximum approval limit = 50 000 EUR", a downstream auditor needs to know:
- Which document said so?
- Which page or paragraph?
- Was the source approved by an authority?
- When was it last updated?
- Did any other document disagree?
- Who validated the extraction — automated or a human reviewer?

Without this provenance, every fact in the KB is folklore — repeated without justification. Auditors will not trust a system that cannot answer these questions, and the KB becomes useless for compliance work.

**4. Knowledge work is inherently experimental.** A domain expert may want to try extraction with a different prompt, a different chunking strategy, a tighter scope, or a different language model. They may want to compare two extraction strategies to see which gives better recall for business rules. They need to do all of this **without risking the production KB**. Direct-to-KB extraction makes every experiment a potential disaster.

### 0.3 The WorkSpace answer

A **WorkSpace** is a safe sandbox that solves all four problems at once. It introduces a *staging zone* between the raw documents and the global Knowledge Base — a place where extraction happens, drafts are curated, contradictions are surfaced, and a human explicitly approves what becomes authoritative knowledge.

The user experience is roughly:

```
1. Create a WorkSpace ("Q1 2026 HR Policy Review")
2. Upload sources (PDFs, DOCX, URLs)
3. Run extraction — drafts appear in a curated space, NOT in the global KB
4. Review drafts visually on a canvas; chat with a workspace-scoped AI agent
5. Resolve contradictions surfaced automatically
6. Run the validator — it checks completeness and blocks if there are issues
7. Promote selected drafts to the global KB through a multi-step wizard
```

Every step is reversible (versioning), every action is logged (action log), every read of the global KB is audited (read-only proxy), every contradiction is materialised as a first-class node (contradiction service), and the global KB is **physically unable** to be polluted by an experiment because the workspace agent's tool whitelist excludes every write tool.

The remaining sections in this document explain how each piece of this answer works, starting with the conceptual model.

---

## 1. What a WorkSpace Is

### 1.1 Two analogies that make it click

A WorkSpace is best understood through two analogies that capture different aspects of how it works.

**The git feature branch.** Just as a git branch lets a developer experiment without touching `main`, a WorkSpace lets a knowledge analyst experiment without touching the global KB. Multiple workspaces can exist in parallel. Each can be merged ("promoted") or discarded. Merging requires a code-review-style approval step (the Promotion Wizard). The git analogy explains why isolation matters: branches are how teams collaborate without stepping on each other.

**The lab notebook.** Every change inside a WorkSpace is captured: which agent action created which draft, which source it came from, which contradictions it triggered, which version of the graph existed at any moment. The notebook is auditable. The lab next door (the global KB) only sees what the analyst chose to publish. The lab-notebook analogy explains why provenance and versioning matter: science without a trail of evidence is just opinion.

### 1.2 The lifecycle of a WorkSpace, narratively

A typical WorkSpace lives roughly like this:

A user — say, the HR knowledge owner — needs to consolidate the "annual leave policy" knowledge from three sources: the 2024 SOP, a 2025 amendment memo, and the IMIS HR database schema. They create a new WorkSpace called "HR Leave Policy Q1 2026" and upload all three documents. The extraction pipeline runs and produces around 200 draft knowledge objects: business rules, entities, workflows, calculations, anomalies. Most look reasonable but some are duplicates or hallucinations.

The user opens the **Workbench** view — a three-panel layout where the left side shows sources and stats, the centre is a visual graph editor, and the right side is a chat with an AI agent that knows the workspace. They ask the agent: "list all business rules that mention `approval`". The agent calls `workspace_search_drafts` and returns a list. They notice that two rules from different sources say different things about the maximum amount that can be approved without escalation. The system has *already* flagged these as a contradiction with severity `BLOCKING` because the field name matches `approval`.

The user clicks the contradiction in the side panel, sees both versions side by side, picks the newer one (`USE_NEWER` strategy), and the contradiction is marked resolved. They continue cleaning up: they delete several `Anomaly` drafts that are noise, they edit a workflow draft to fix a wrong actor, they manually link a `Customer` entity to the global KB's existing `Person` concept (the link goes through a read-only proxy and is recorded in the audit log).

Periodically the canvas auto-saves a checkpoint. If they make a mistake and want to go back, they open the version dropdown in the toolbar and restore. The system creates a *safety checkpoint* of the current state before restoring, so even the restore is reversible.

When they're ready to publish, they click "Promotion" in the side panel. A wizard opens. **Step 1** is the validator — it runs ten rules over the draft graph (no orphans, no dangling edges, no unresolved blocking contradictions, etc.) and blocks the wizard if anything fails. If it passes, **step 2** lets them pick which drafts to promote (they leave a few uncertain ones in `DRAFT` status for next iteration), **step 3** shows them the diff against the global KB (NEW vs ENRICH vs CONFLICT), **step 4** lets them resolve any remaining conflicts per-field, **step 5** is final confirmation, and **step 6** runs the SAGA that atomically writes everything to the global KB. If anything fails mid-flight, the SAGA rolls back and the workspace is unchanged.

After promotion the workspace is not closed — promoted drafts are marked `PROMOTED` but the workspace can continue to evolve. If the same documents are revisited later, the workspace acts as institutional memory of what was extracted, what was rejected, and why.

### 1.3 Isolation guarantees

| Direction | Allowed? | How |
|---|---|---|
| WorkSpace → Global KB (read) | ✅ | Through `ReadOnlyProxy` only; every read is audited |
| WorkSpace → Global KB (write) | ❌ | Only via Promotion SAGA, which requires user confirmation |
| Global KB → WorkSpace (read) | ❌ | Drafts are namespace-scoped (`workspace:{id}`); the global KB never sees them |
| WorkSpace A → WorkSpace B | ❌ | Different namespaces, no cross-references |

The agent that runs inside a WorkSpace is **whitelist-restricted** to a specific subset of MCP tools so it cannot bypass these rules ([§9](#9-ai-agent-system)).

---

## 2. Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                         WORKSPACE DETAIL PAGE (UI)                      │
│                       /workspaces/:workspaceId                          │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Workbench  Overview  Sources  Drafts  Canvas  KB Search  Promotion │ │
│ │                                                            Audit   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ ┌─────────────┬──────────────────────────────┬──────────────────────┐ │
│ │ SidePanel   │       WorkspaceCanvas        │   AgentPanel         │ │
│ │  (sources,  │                              │  (chat + actions)    │ │
│ │  drafts,    │  ReactFlow + dagre layout    │                      │ │
│ │  contradic- │  • drag-drop palette         │  SSE stream from     │ │
│ │  tions,     │  • NodeInspector             │  POST /agent/message │ │
│ │  validation │  • EdgeInspector             │                      │ │
│ │  banner,    │  • VersionsDropdown          │  Tabs: Chat │ Actions│ │
│ │  suggestions│  • VersionDiffDialog         │                      │ │
│ │             │  • Save → /graph (PUT)       │                      │ │
│ └─────────────┴──────────────────────────────┴──────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼ HTTP / SSE
┌────────────────────────────────────────────────────────────────────────┐
│                              REST API                                   │
│           /api/v1/workspaces/* (~70 endpoints, see §11)                 │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVICES                                │
│                                                                         │
│  Lifecycle    : workspace.service.js                                    │
│  Sources      : source.service.js + extraction-pipeline.js              │
│  Drafts       : draft.service.js                                        │
│  Canvas       : workspace-graph.service.js                              │
│  Versioning   : graph-version.service.js                                │
│  Validator    : graph-validator.service.js                              │
│  Contradict.  : contradiction.service.js                                │
│  Cross-source : cross-source.service.js                                 │
│  Link predict : link-predictor.service.js     ──► GNN service (HTTP)    │
│  Agent        : workspace-agent.service.js    ──► anthropic-agent.svc   │
│  Action log   : action-log.service.js                                   │
│  Tool filter  : agent-tool-filter.js                                    │
│  KB read-only : readonly-proxy.service.js                               │
│  Promotion    : promotion/{diff,saga,resolution,similarity-scorer}      │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌──────────────────────┬──────────────────┬───────────────────────────────┐
│   Memgraph (Bolt)    │  Qdrant (HTTP)   │  Redis    │  Anthropic / GNN  │
│ • Workspace nodes    │ workspace_<id>   │  Cache    │  Anthropic SDK    │
│ • Drafts (12 labels) │ collection per   │  TTL 5min │  + MCP server     │
│ • Edges, sessions,   │ workspace        │           │  + GNN service    │
│   actions, versions, │ (embeddings)     │           │  (HTTP)           │
│   contradictions     │                  │           │                   │
└──────────────────────┴──────────────────┴───────────────────────────────┘
```

---

## 3. Lifecycle (FSM)

A WorkSpace transitions through states. Status enum is in [`api/src/config/enums.js`](../src/config/enums.js#L84):

| Status | Description |
|---|---|
| `CREATED` | Just created, no sources yet |
| `PROFILING` | Sources are being profiled / indexed |
| `READY` | Profiling done, ready for extraction |
| `EXTRACTING` | Extraction job(s) actively running |
| `PAUSED` | Extraction paused, awaiting user input |
| `REVIEW` | Drafts available for user review |
| `PROMOTED` | Some/all drafts promoted to Global KB |
| `ARCHIVED` | Soft-deleted, read-only |

Allowed transitions (validated in `workspace.service.updateStatus`):

```
CREATED    → PROFILING, ARCHIVED
PROFILING  → READY, PAUSED, ARCHIVED
READY      → EXTRACTING, REVIEW, ARCHIVED
EXTRACTING → READY, PAUSED, REVIEW
PAUSED     → EXTRACTING, READY, ARCHIVED
REVIEW     → PROMOTED, READY, ARCHIVED
PROMOTED   → READY, ARCHIVED
ARCHIVED   → ∅                         (terminal — only `deletePermanent` allowed)
```

Adding the first source auto-transitions `CREATED → PROFILING`.

---

## 4. Data Model (Memgraph)

Node labels and edges as written by the services. Properties shown are the load-bearing ones.

### Core nodes

| Label | Owner service | Properties |
|---|---|---|
| `:WorkSpace` | workspace.service | `id, name, description, status, namespace, createdBy, createdAt, updatedAt, domain, tags, sourceCount, draftCount, promotedCount` |
| `:SourceReference` | source.service | `id, workspaceId, filename, mimeType, sourceType, status, sizeBytes, uploadedAt, extractedAt, extractionLog (JSON), chatHistory (JSON), language, contentHash` |

### Draft knowledge objects (12 type labels)

All inherit a common shape and are linked to their workspace via `:CONTAINS_DRAFT` and to their source via `:EXTRACTED_FROM`.

| Type key (`d.type`) | Memgraph label | Knowledge Family |
|---|---|---|
| `entity` | `:DraftEntity` | STRUCTURAL |
| `relationship` | `:DraftRelationship` | STRUCTURAL |
| `schema` | `:DraftSchema` | STRUCTURAL |
| `api_contract` | `:DraftAPIContract` | STRUCTURAL |
| `business_rule` | `:DraftBusinessRule` | BEHAVIORAL |
| `workflow` | `:DraftWorkflow` | BEHAVIORAL |
| `calculation` | `:DraftCalculation` | BEHAVIORAL |
| `concept` | `:DraftConcept` | SEMANTIC |
| `policy` | `:DraftPolicy` | OPERATIONAL |
| `decision` | `:DraftDecision` | CONTEXTUAL |
| `requirement` | `:DraftRequirement` | CONTEXTUAL |
| `anomaly` | `:DraftAnomaly` | CONTEXTUAL |

Common draft properties: `id, workspaceId, name, description, content (JSON string), contentHash, type, knowledgeFamily, confidence (0..1), status, extractedBy, extractedAt, namespace, positionX, positionY` (positions added by canvas).

Draft status FSM (`DraftKnowledgeStatus`, see [enums.js#L108](../src/config/enums.js#L108)):

```
DRAFT             → VALIDATED, REJECTED
VALIDATED         → READY_TO_PROMOTE, DRAFT, REJECTED
READY_TO_PROMOTE  → PROMOTED, CONFLICT, VALIDATED
CONFLICT          → MERGED, REJECTED, READY_TO_PROMOTE
MERGED            → PROMOTED
PROMOTED          → ∅  (terminal)
REJECTED          → ∅  (terminal)
```

### Auxiliary nodes

| Label | Created by | Purpose |
|---|---|---|
| `:WorkSpaceAgentSession` | workspace-agent.service | Persistent chat session per workspace |
| `:WorkSpaceChatMessage` | workspace-agent.service | Individual chat message (role, content, ts, meta) |
| `:AgentAction` | action-log.service | Logged tool call (type, toolName, toolInput, snapshotBefore/After, reversible) |
| `:GraphVersion` | graph-version.service | Snapshot of draft graph (versionNumber, snapshot JSON, createdBy) |
| `:ContradictionNode` | contradiction.service | Detected conflict (type, severity, field, values, status, resolution) |
| `:KBReference` | readonly-proxy.service | Audited stub of a global KB read |
| `:PromotionRecord` | promotion-saga | Audit trail of a promotion run |

### Edge types

| Edge | From → To | Created by |
|---|---|---|
| `:CONTAINS_DRAFT` | `WorkSpace → Draft*` | draft.service.create |
| `:EXTRACTED_FROM` | `Draft* → SourceReference` | draft.service.create |
| `:HAS_SOURCE` | `WorkSpace → SourceReference` | source.service.addSource |
| `:HAS_AGENT_SESSION` | `WorkSpace → WorkSpaceAgentSession` | workspace-agent.service |
| `:HAS_MESSAGE` | `Session → ChatMessage` | workspace-agent.service |
| `:HAS_ACTION` | `Session → AgentAction` | action-log.service |
| `:TRIGGERED_BY` | `AgentAction → ChatMessage` | action-log.service (optional) |
| `:HAS_VERSION` | `WorkSpace → GraphVersion` | graph-version.service |
| `:HAS_CONTRADICTION` | `Draft* → ContradictionNode` | contradiction.service |
| `RELATES_TO`, `BELONGS_TO`, `CONTAINS`, `WORKS_IN`, `DEPENDS_ON`, `IMPLEMENTS`, `REFERENCES`, `EXTENDS`, `PRODUCES`, `CONSUMES`, `TRIGGERS`, `GOVERNS`, `CONFLICTS_WITH`, custom | `Draft* → Draft*` | draft.service.createEdge / canvas / agent |

### Qdrant collections

One collection per workspace, named `workspace_{uuid_with_underscores}`. Auto-created on workspace create. Holds embedding vectors for each draft, indexed by `draftId`. Used by:
- `draft.service` — semantic search across drafts
- `contradiction.service` — hybrid (name + cosine) similarity for grouping
- `link-predictor.service` — embedding-cosine fallback path

---

## 5. Backend Services Catalog

| Service | File | Phase | One-line description |
|---|---|---|---|
| WorkspaceService | `workspace.service.js` | P1 | Lifecycle CRUD + FSM + Redis cache |
| SourceService | `source.service.js` | P1 | File/URL/text source upload + metadata |
| DraftService | `draft.service.js` | P1 | Draft CRUD + edges + Qdrant indexing |
| ReadOnlyProxy | `readonly-proxy.service.js` | P1 | Audited read-only access to global KB |
| ExtractionPipeline | `extraction/extraction-pipeline.js` | P1 | Run entity/relation/rule extraction over a source; auto-detect contradictions hook (P3) |
| ExtractionQueue | `extraction/extraction-queue.js` | P1 | BullMQ wrapper, SSE progress |
| Promotion (5 files) | `promotion/*.js` | P1 | Diff computer, conflict detector, resolution applier, similarity scorer, SAGA executor |
| WorkspaceAgentService | `workspace-agent.service.js` | P2-001 | Persistent chat + SSE + system prompt + action log + auto-checkpoint |
| ActionLogService | `action-log.service.js` | P2-002 | Logs every agent tool call as `:AgentAction` node |
| AgentToolFilter | `agent-tool-filter.js` | P2-002 | Allow/deny patterns for the agent's tool whitelist |
| GraphVersionService | `graph-version.service.js` | P2-003 | Checkpoints, restore, diff, auto-prune (max 50) |
| WorkspaceGraphService | `workspace-graph.service.js` | P2-004 | Canvas getGraph/saveGraph (ReactFlow shape) + position |
| ContradictionService | `contradiction.service.js` | P2-005 + P3-004 | Detect / classify / resolve contradictions; hybrid name+embedding similarity (P3) |
| CrossSourceService | `cross-source.service.js` | P2-006 | Coverage / shared entities / source relationships / health score / suggestions |
| GraphValidatorService | `graph-validator.service.js` | P2-007 | 10 rules over the draft graph + promotion gate |
| LinkPredictorService | `link-predictor.service.js` | P3-007 | GNN-backed link prediction (with embedding-cosine fallback) |
| StructuralImportService | `structural-import.service.js` | P3-FB | Import a global Structural Editor form as workspace drafts (preview + execute) — see §10.7 |
| WorkspaceDataSourceService | `workspace-datasource.service.js` | P3-DS | Bridge between workspace SourceReferences and the v2 DataSource catalog used by the Form Builder — see §10.8 |

---

## 6. Sources Subsystem

### 6.0 Why a structured sources subsystem matters

A naive "drop a folder of PDFs and extract them" approach has hidden costs that show up only in production. Documents come in many formats and many provenance levels: some are uploaded files, some are URLs that may change underneath you, some are pasted text fragments from emails, some are pointers to live database schemas. Each kind needs different handling — but downstream knowledge consumers don't care about that distinction; they just want to know "where did this fact come from".

The sources subsystem provides the **provenance backbone** for the whole WorkSpace. Every draft knowledge object that enters the workspace remembers exactly which source produced it, which extraction run it belonged to, what the source's content hash was at the time, and what status the source itself was in. When a downstream user looks at a promoted KB fact two years later and asks "which document said this?", the system can answer with a specific source ID, filename, page reference, and extraction timestamp. Without that, every fact in the KB is folklore.

A second value of the structured sources subsystem is **source lifecycle**. A document goes through `PENDING → ANALYZING → ANALYZED → EXTRACTING → EXTRACTED`, with each transition recorded and observable through SSE progress events. This means a user can watch their 50-page PDF get processed in real time and intervene if something goes wrong (cancel the extraction, retry with different options). It also means the system can answer "which sources have been processed, which are pending, which failed" for monitoring and quota purposes.

Finally, the source subsystem enforces **boundaries**. The same document cannot be added twice to the same workspace (deduplicated by content hash). A source cannot be deleted while extraction is running. A source's metadata (analysis log, chat history, extraction results) is preserved alongside the source itself, so reverting to an earlier state of the workspace doesn't lose the audit trail of what was tried.

### Source types

`source.service.js` supports `SOURCE_TYPES`:

- `FILE` — uploaded binary (PDF, DOCX, XLSX, etc., max 50 MB) stored in-DB as `contentHash`
- `URL` — web URL fetched on demand
- `TEXT` — raw text body
- `DATABASE` — connection reference (used by SQL extractors / FlowDesk)
- `API` — external API endpoint reference

### Lifecycle

```
PENDING → ANALYZING → ANALYZED → EXTRACTING → EXTRACTED
                ↓          ↓            ↓
             ERROR      ERROR        ERROR
```

### Extraction pipeline

`extraction/extraction-pipeline.js` runs as a BullMQ worker:

1. **Step 1 — Loading**: pull source content
2. **Step 2 — Entities**: LLM-based entity extraction → `entity.extractor.js`
3. **Step 3 — Relations**: LLM-based relation extraction → `relation.extractor.js`
4. **Step 4 — Other types**: optional `business_rule | workflow | concept | anomaly` extractors
5. **Step 5 (P3-002)** — *Auto-detect contradictions* if `AUTO_DETECT_CONTRADICTIONS !== 'false'` and at least 1 draft was created. Emits SSE phases `detecting_contradictions` and `contradictions_detected`.

Result shape:

```js
{
  success: boolean,
  drafts: [...],
  edges: [...],
  stats: { draftsCreated, edgesCreated, draftsByType, durationMs },
  contradictions: { newContradictions, deduplicated, totalAfter, openAfter, blocking } | null,
  log, chatHistory
}
```

### FlowDesk specialised extractors

`extraction/flowdesk/` contains domain-specific extractors for FlowDesk SOPs (classification rules, dialog graphs, routing rules, service catalog, SLA rules) plus generators that build runnable GXE graphs from them.

---

## 7. Drafts Subsystem

### 7.0 Why "drafts" instead of just "extracted entities"

The word *draft* is deliberate. In a naive system, an extraction LLM produces entities and they go straight into the KB. In the WorkSpace model, the same LLM produces **drafts** — knowledge objects that are explicitly *not yet authoritative*. They have a confidence score, a status, a source link, an extraction timestamp, and they live in their own Memgraph namespace. They never leak into the global KB until promotion.

This distinction matters because the user experience of curating extracted knowledge is fundamentally about *making decisions*: keep this, drop that, merge these two, link this draft to an existing global concept. Drafts give the user a vocabulary for those decisions:

- A draft can be **edited** (the LLM got the description wrong → fix it)
- A draft can be **deleted** (it's a hallucination → remove it)
- A draft can be **linked to other drafts** with typed edges (this rule governs that entity)
- A draft can be **linked to existing global KB nodes** through a read-only proxy (this draft is the workspace's perspective on a concept that already exists)
- A draft can be marked **`VALIDATED`**, **`READY_TO_PROMOTE`**, **`REJECTED`** — the FSM enforces sane transitions
- A draft can be **searched semantically** (Qdrant per-workspace collection) so the user can find related drafts even when they don't remember the exact name

The 12 draft types aren't arbitrary — they correspond to the five **knowledge families** that the project already uses everywhere else (structural, behavioural, semantic, operational, contextual). This makes the workspace consistent with the global KB's taxonomy and lets downstream code treat a draft the same way it treats a promoted entity: same fields, same family, same Cypher queries.

The status FSM (DRAFT → VALIDATED → READY_TO_PROMOTE → PROMOTED) is what allows a single workspace to be in many curation states at once. Some drafts may be approved while others are still under review, and the promotion wizard can pick exactly which subset to publish. This batch granularity is impossible without per-draft status tracking.

### Knowledge families

5 families group the 12 draft types:

| Family | Types |
|---|---|
| **Structural** | `entity`, `relationship`, `schema`, `api_contract` |
| **Behavioral** | `business_rule`, `workflow`, `calculation` |
| **Semantic** | `concept` |
| **Operational** | `policy` |
| **Contextual** | `decision`, `requirement`, `anomaly` |

### draft.service.js methods

| Method | Purpose |
|---|---|
| `create(workspaceId, {type, name, description, content, sourceId, confidence, extractedBy})` | Create draft + `CONTAINS_DRAFT` + `EXTRACTED_FROM` edges, async-index in Qdrant |
| `createBatch(workspaceId, drafts)` | Chunked batch create |
| `get(workspaceId, draftId)` | Single draft (with parsed `content`) |
| `list(workspaceId, {type?, status?, knowledgeFamily?, sourceId?, limit, offset})` | Paginated list |
| `listWithSource(workspaceId)` | **All drafts with `sourceId` resolved via `EXTRACTED_FROM` edge** (used by contradiction & cross-source services — fixes a hidden bug where `sourceId` is only stored as edge, not property) |
| `update(workspaceId, draftId, updates)` | FSM-validated update; recomputes `contentHash` and re-indexes Qdrant if `content` changed; supports `position: {x, y}` for canvas |
| `updateStatusBatch(...)` | Batch status transitions during promotion |
| `delete(workspaceId, draftId)` | Detach + delete + remove from Qdrant |
| `createEdge(workspaceId, {sourceId, targetId, edgeType, confidence, properties})` | Typed edge between two drafts |
| `getEdges(workspaceId, draftId, {direction})` | Incoming/outgoing/both edges |
| `searchSemantic(workspaceId, query, {limit, type})` | Qdrant semantic search |

---

## 8. Visual Canvas (Workspace Graph)

### 8.0 Why a visual canvas instead of a list view

A list view of 200 extracted business rules tells the user nothing about how the rules relate to each other, which entities they govern, which workflows they trigger, or where the gaps are. A graph is the natural representation of that information — but a *static* graph image is also useless because the user needs to *manipulate* the structure during curation: move nodes for clarity, draw new edges, delete duplicates, merge two near-identical rules, group concepts visually.

The canvas is where curation happens. Concretely:

- **Spatial reasoning helps the user catch errors** — when 30 entities are laid out as a diagram, an isolated node sticks out visually, and a missing connection between two clearly-related entities is obvious. The same data in a list of 30 rows would look fine.
- **Drag-drop authoring is dramatically faster than form-filling** — when the user wants to add a missing draft (e.g. "this SOP mentions an Approval Committee but the LLM didn't extract it as an entity"), dragging an Entity card from the palette onto the canvas takes 3 seconds; a form dialog would take 30.
- **The same shape as the rest of the platform** — the GXE editor (used for the runtime workflow graphs) is also a ReactFlow canvas, so users who already know the GXE editor have zero learning curve when they switch to the WorkSpace canvas.
- **Position is part of the truth** — the layout the user creates isn't ephemeral. Positions are persisted as `positionX/positionY` properties on each draft. When the user comes back tomorrow, the graph looks exactly as they left it. This matters because spatial layouts encode tacit knowledge ("I put all financial rules on the right") that would be lost otherwise.

The canvas is also the integration point for several other capabilities: it's where version checkpoints are created and restored, it's where the EdgeInspector and NodeInspector live, it's where the user can trigger validation and promotion via the SidePanel banners. Putting all of these in one screen turns the canvas from "a graph viewer" into "the curation workbench" — which is exactly what the Workbench tab name reflects.

### 8.1 Backend operations

[`workspace-graph.service.js`](../src/services/workspace/workspace-graph.service.js) exposes two operations to the canvas UI:

### `getGraph(workspaceId)`

Returns ReactFlow-shaped data:

```js
{
  nodes: [
    {
      id,
      type: 'workspaceDraft',         // single React Flow node renderer
      position: { x, y },             // from positionX/positionY (default 0)
      data: {
        label, draftType, draftLabel, status, confidence,
        knowledgeFamily, description, properties, sourceId
      }
    }
  ],
  edges: [
    {
      id, source, target, type: 'smoothstep', label,
      data: { relationType, confidence, properties }
    }
  ]
}
```

### `saveGraph(workspaceId, payload, opts)`

Whole-graph PUT with **canvas-as-truth** semantics:

1. **Upsert nodes by id** — existing nodes get `drafts.update`, new ones get `drafts.create` (and a temp→canonical id remap for edges)
2. **Delete nodes** absent from the payload (cascade-removes their edges automatically)
3. **Rebuild edges** — atomic delete-then-create of all draft-to-draft edges (safer than diffing because edge ids are unstable)
4. **Persist position** via `positionX` / `positionY` properties
5. **Optional checkpoint** — if `opts.createCheckpoint === true`, calls `graph-version.createVersion` after the save and returns its `versionId`

---

## 9. AI Agent System

### 9.0 Why a workspace-scoped agent (and not just "use ChatGPT")

A general-purpose LLM chat — even a powerful one with tool use — is the wrong tool for workspace curation, for three concrete reasons that the workspace agent is designed to fix.

**Reason 1: Context that doesn't fit in a prompt.** A typical workspace contains hundreds of drafts, dozens of sources, contradictions, validation results, version history. None of that fits in an LLM context window. The workspace agent solves this by giving the LLM a small set of **introspection tools** (`workspace_list_drafts`, `workspace_list_sources`, `workspace_validate_graph`, `workspace_analyze_sources`, etc.) and an explicit instruction to call them when needed. Instead of force-feeding the entire graph into the prompt, the agent fetches exactly the slice it needs to answer a question. This is the same pattern as RAG, but the "retrieval" is parametrised by the workspace, not by free-text similarity — which means the agent never confuses one workspace for another.

**Reason 2: Mutation safety.** When a user says "delete all anomaly drafts that have confidence below 0.4", a general LLM has two failure modes: it might hallucinate which drafts qualify, and it might call a write tool on the wrong workspace. The workspace agent prevents both. The system prompt **forces** the agent to always pass the current `workspaceId` to every tool call (and the prompt restates the exact ID at the top of every chat turn). The MCP tool whitelist physically removes any tool that could write to a *different* workspace or to the global KB. Even if the LLM hallucinates the wrong tool name, the whitelist will reject it.

**Reason 3: Persistent memory across sessions.** Curating a 200-draft workspace is not a 5-minute conversation — it can take days, with the user coming back periodically to handle a few more drafts at a time. A stateless chat (one prompt, one response) cannot remember what was discussed yesterday or what the user already approved. The workspace agent stores every chat turn as a `WorkSpaceChatMessage` node in Memgraph linked to a per-workspace `WorkSpaceAgentSession`. When the user reopens the workspace, the entire chat history is replayed. The agent has *continuity*.

### 9.1 What the agent can actually do for the user

Concrete capabilities that emerge from the design above:

| User question | What the agent does |
|---|---|
| "Give me an overview of this workspace" | Calls `workspace_get` + `workspace_list_sources` + `workspace_list_drafts`, summarises in narrative form |
| "Find all business rules that mention approval" | Calls `workspace_search_drafts` with semantic query + type filter, returns top matches |
| "Are there any contradictions I need to look at?" | Calls `workspace_detect_contradictions` (idempotent — won't duplicate) and lists BLOCKING ones first |
| "Run a full health analysis on this workspace" | Calls `workspace_analyze_sources` with `reportType: full`, summarises coverage % / shared entities / health score / recommendations |
| "Is this workspace ready to promote?" | Calls `workspace_validate_graph` and explains any failures in plain language with affected nodes |
| "Create a draft entity called 'Approval Committee' linked to source XYZ" | Calls `workspace_create_draft` with the right type and `sourceId` — and the action is logged to the action log so the user has a record |
| "What changed since yesterday?" | Calls `workspace_get_actions` and walks the user through the recent agent + canvas mutations |
| "Find drafts similar to this one" | Calls `workspace_search_drafts` with the draft name as semantic query |

The agent is intentionally **narrow** — it doesn't have access to the global KB write tools, the GXE runtime engine, the catalog mutation tools, or the BackLog system. This narrowness is the source of its safety.

### 9.2 Why every action is logged

Every tool call the agent makes is recorded as an immutable `AgentAction` node in Memgraph, with the input arguments, timestamp, source chat message, snapshot before/after (when applicable), and a "reversible" flag. The ActionLog is not a debugging artefact — it is a **first-class user-facing feature** for several reasons:

- **Trust through transparency.** When the user asks "what did the agent do for me last week?", the answer is a precise, ordered list. There is no "the AI did something I didn't see". This is critical for compliance work where every change to a knowledge base needs an audit trail.
- **Recoverability.** Each action carries `snapshotBefore` and `snapshotAfter`, which means even if the user doesn't restore a full version, individual changes can be inspected and reversed.
- **Triggering auto-checkpoints.** The action log is the input signal for the auto-checkpoint mechanism (§9.6). When a destructive action fires, the system can decide to snapshot the whole graph just in case.
- **Action timeline as a UX pattern.** The right-side AgentPanel has a "Actions" tab that shows the action log as a colour-coded timeline. The user can scroll through "everything the agent did" without reading the chat transcript.

### 9.3 Why the tool whitelist matters more than it seems

The whitelist looks at first glance like a small security feature, but it actually enables a much bigger property: **the workspace agent is always tightly focused**. By cutting the available tool set from ~170 down to ~43, the agent is forced to think within the boundaries of "things that make sense in a workspace context". It cannot wander off and start calling unrelated GXE catalog tools, accidentally creating workflow graphs, or trying to manipulate the BackLog. Every tool call is on-topic by construction.

This focus also makes the agent **predictable**. The user can know in advance what the agent might do — there are 43 specific actions, all listed in the system prompt, all categorised. There is no "the AI might do something surprising". For compliance-grade workflows this predictability is more valuable than raw capability.

### 9.4 Persistence (`workspace-agent.service.js`)

- **One session per workspace** stored as `(:WorkSpaceAgentSession)-[:HAS_MESSAGE]->(:WorkSpaceChatMessage)`
- `getOrCreateSession(workspaceId)` is idempotent
- `addMessage(workspaceId, role, content, meta)` persists user/assistant turns
- `clearHistory(workspaceId)` empties messages but keeps the session node
- `chat(workspaceId, userMessage)` is an **async generator** that:
  1. Persists user message **before** streaming
  2. Loads last 40 messages as model context
  3. Builds a workspace-aware system prompt (see §9.4)
  4. Calls underlying `agentSvc.chat(systemPrompt, modelMessages, sessionContext)` with `allowedToolsFilter` and `sessionId`
  5. For every event yielded, forwards to caller; for every `tool_call` event, logs an `AgentAction` and triggers auto-checkpoint (debounced)
  6. After the loop, persists the buffered assistant text as a single message (with truncated tool-call metadata)

### 9.5 Tool whitelist (`agent-tool-filter.js`)

The agent has access to a **subset** of the ~170 available MCP/GXE tools. Allow patterns (line 33):

```
workspace_*            draft_*              source_*
kb_search              kb_get_*             codex_search* / codex_get_*
graph_neighbors        graph_query          graph_find_path     graph_analyze_*
catalog_search*        catalog_find_*       catalog_get_*
extraction_*           ai_classify          ai_summarize        ai_extract
web_search             web_fetch
```

Deny patterns (defense in depth, evaluated first):

```
*_create_kb            *_write_kb           *_delete_kb
kb_create*             kb_update*           kb_delete*
graph_create_*         graph_delete_*
```

The result: the workspace agent gets **~43 of the 170 tools** at runtime — exactly the read-only KB tools, the workspace mutation tools, and the analysis tools — and zero global-KB write tools.

### 9.6 Intent filter bypass

The underlying `anthropic-agent.chat()` normally further narrows the toolset using a heuristic intent classifier on the user's last message. This is **disabled** when a caller-provided whitelist is present, because the whitelist is already a tighter, semantic-correct selection (P3 fix in `anthropic-agent.service.js`):

```js
const skipIntentFilter = sessionContext.skipIntentFilter === true
  || typeof sessionContext.allowedToolsFilter === 'function';
```

Without this bypass, a greeting like "hello" would reduce the workspace agent's tools from 43 down to 5 generic codex tools.

### 9.7 System prompt (`_buildSystemPrompt`)

Generated fresh for every chat call. Includes:

- WorkSpace ID, name, description, domain, status, tags
- Live counts (sources, drafts) fetched from services
- Explicit instruction: **"ALWAYS pass workspaceId=… to every workspace_* tool you call"**
- Isolation rules section (read-only Global KB, no cross-workspace access)
- Categorised tool list (Lifecycle / Mutation / KB read-only / Analysis) with the exact 19 tool names
- Responsibilities (extract, link, validate, surface contradictions)
- Locale hint ("Respond in the user's language; Russian by default")

### 9.8 Action Log (`action-log.service.js`)

Every tool call by the agent is recorded as an immutable `AgentAction` node. Schema:

```
{
  id, workspaceId, sessionId,
  type: CREATE_NODE | MODIFY_NODE | DELETE_NODE
      | CREATE_EDGE | DELETE_EDGE
      | EXTRACT | ANALYZE | LINK_KB | VALIDATE | OTHER,
  toolName, toolInput (JSON), description, affectedNodeIds (JSON),
  motivation, reversible (boolean),
  snapshotBefore (JSON, ≤8KB), snapshotAfter (JSON, ≤8KB),
  ts
}
```

Edges:

```
(WorkSpaceAgentSession)-[:HAS_ACTION]->(AgentAction)
(AgentAction)-[:TRIGGERED_BY]->(WorkSpaceChatMessage)   // optional
```

`mapToolToActionType(toolName)` infers the type from the tool name; `extractAffectedIds(input)` heuristically pulls IDs from common keys (`id`, `nodeId`, `draftId`, etc.).

Logging is **non-blocking** — failures only emit a `console.warn` and the chat stream continues.

### 9.9 Auto-Checkpoint hook

After each logged action, the agent service calls `graphVersion.maybeAutoCheckpoint(workspaceId, action)`:

- Triggers on action types: `CREATE_NODE`, `DELETE_NODE`, `MODIFY_NODE`, `EXTRACT`
- Debounced **30 s per workspace** (in-memory `Map<workspaceId, lastTimestamp>`)
- Creates a `GraphVersion` node with `createdBy: 'auto'` and links it to the triggering action

This guarantees that every batch of agent mutations is recoverable.

### 9.10 SSE event types

Forwarded by the controller to the frontend on `POST /agent/message`:

| `event:` | Source | Payload |
|---|---|---|
| `start` | controller | `{ workspaceId }` |
| `whitelist_applied` | underlying agent | `{ toolsAllowed, toolsTotal }` |
| `filter_applied` | underlying agent (skipped for workspace) | `{ domain, confidence, toolsProvided, ... }` |
| `catalog_search` | catalog reuse | `{ strategy, score, candidatesCount, recommendation }` |
| `reuse_suggestion` | catalog reuse | `{ action, graphId, graphName, ... }` |
| `text` | streaming model | `{ content }` |
| `tool_call` | model tool use | `{ name, input, id }` |
| `tool_result` | tool execution | `{ name, result }` |
| `tool_error` | tool execution | `{ name, error }` |
| `retry` | API overload (529) | `{ attempt, delay, reason }` |
| `done` | model done | `{ iterations }` |
| `max_iterations` | safety stop | `{ iterations }` |
| `error` | any throw | `{ error }` |
| `end` | controller | `{ ok: true }` |

Frontend (`workspace.service.streamAgentMessage`) parses these via `fetch + ReadableStream` (not `EventSource`, because the request needs a POST body).

---

## 10. Other Subsystems

### 10.1 Versioning (P2-003 + P3-001)

**Why versioning is non-negotiable for curation work.** Curating extracted knowledge is a process of trial and error. The user deletes a draft that turns out to be important, the agent makes a bulk edit that goes wrong, an auto-extraction pass overwrites carefully reviewed content. Without versioning, every mistake is permanent and the user has to re-do hours of work. With versioning, every mistake is undoable in two clicks.

The deeper value is *psychological*: knowing that you can always go back makes users **bolder**. They are willing to let the agent make sweeping changes, willing to delete drafts they suspect are wrong, willing to experiment with bulk operations — because the worst case is "restore to v12 and try again". A workspace without versioning forces users into timid, single-action edits because every operation feels like it might break something irrecoverable.

The auto-checkpoint hook (debounced 30 s, triggered by destructive agent actions) means the user doesn't even have to remember to save. The system observes that something destructive is happening and quietly snapshots the state. When the user later realises they want to undo, the checkpoint is already there. Combined with the *safety checkpoint* that fires automatically before any restore, the user is protected against the "undo my undo" failure mode too.

Diffing is the other half of the value. Once you have versions, you can compare them, and comparison is a powerful curation tool: "what did the agent actually change last night?", "what's different between today's graph and the version I approved last week?". The diff dialog answers these questions concretely — added nodes in green, removed in red, modified with per-field old/new — without the user having to remember anything.

**Backend** (`graph-version.service.js`):

- `createVersion(workspaceId, {note, createdBy, triggerActionId?})` — serialise all draft nodes/edges into a single JSON snapshot stored on a `:GraphVersion` node. Auto-prunes to **MAX 50 versions per workspace**. Snapshot capped at 2 MB.
- `getVersions(workspaceId, {includeSnapshot, limit})` — list newest first; `includeSnapshot` defaults to `false` (only metadata)
- `getVersion(versionId)` — full snapshot, parsed
- `restoreVersion(workspaceId, versionId, {confirm: true})` — atomic destructive replace:
  1. Auto-creates a *safety checkpoint* of the current state
  2. `DETACH DELETE` of all current drafts in workspace
  3. Recreates nodes from the snapshot (with sanitised labels for injection-safety)
  4. Recreates edges (only between drafts that exist in workspace)
  5. Updates `WorkSpace.draftCount`
- `diffVersions(v1Id, v2Id)` — content-aware diff: `added.{nodes,edges}`, `removed.{nodes,edges}`, `modified.nodes[{id, before, after, changedFields}]`, summary counts
- `maybeAutoCheckpoint(workspaceId, action)` — debounced auto-checkpoint hook (called from agent loop; see §9.6)

**Frontend** (P3-001):

- `canvas/VersionsDropdown.jsx` — toolbar button `[v12 ▾]` showing the 10 most recent versions, each with relative time, source icon (user/agent/auto) and node/edge counts. Click → confirm → restore.
- `canvas/VersionDiffDialog.jsx` — `Compare versions...` action; auto-computes diff between two selected versions; sections for added / removed / modified with per-field old/new in monospace.
- After a successful restore the canvas reloads and a Snackbar toast confirms the result.

### 10.2 Contradictions (P2-005 + P3-004)

**Why contradictions deserve to be a first-class concept.** When extraction runs over multiple sources, the most valuable thing the system can find is the *disagreement* between them. A 2024 SOP says "max approval = 50 000 EUR", a 2025 amendment says "max approval = 75 000 EUR" — the system must not silently pick one. It must surface the disagreement, label it, and force a human to choose. Otherwise the KB ends up with whichever value was extracted last, which is arbitrary and dangerous.

In a naive system, contradictions are *implicit*: two drafts with the same name and different content sit in the database side by side, and the user is supposed to notice. In practice, with hundreds of drafts, the user never notices. By the time the contradiction is found, the wrong value is already in the global KB and downstream consumers are using it.

The contradiction service makes contradictions **explicit**: each one becomes a `ContradictionNode` in Memgraph with a type, severity, the two conflicting drafts, the field, the values, and a status. The side panel shows a count badge ("3 contradictions, 1 BLOCKING"). The validator blocks promotion when any BLOCKING contradiction is unresolved. The user is forced to look at every conflict and pick a resolution before they can publish anything.

The *severity classification* (BLOCKING / WARNING / INFO) is what makes this practical. Not every disagreement matters equally: a difference in description text is informational, a difference in `maxApprovalAmount` is a warning, a difference in `approval_required: true vs false` is a blocker. The system uses heuristics on field names and value shapes to assign severity, so the user can focus on the dangerous ones first and ignore the cosmetic ones.

The hybrid name+embedding similarity (P3-004) addresses a subtler problem: name-only matching produces both false positives (`Customer` in a banking source vs `Customer` in a restaurant source — same name, completely different concept) and false negatives (`Client` and `Customer` referring to the same concept across two sources). Adding cosine similarity over Qdrant embeddings catches both cases — opposite vectors suppress false positives even when names match, identical vectors rescue true positives even when names don't.

The auto-detect hook (P3-002) means the user doesn't have to remember to run detection. After every extraction job completes, the system automatically scans for new contradictions and surfaces them in the SSE stream. When the user comes back to look at the workspace, the contradictions are already waiting in the side panel, classified and prioritised.

**Schema:**

```
(:ContradictionNode {
  id, workspaceId,
  type: FACTUAL | TEMPORAL | LOGICAL | SCOPE | CARDINALITY,
  severity: INFO | WARNING | BLOCKING,
  field, values (JSON),
  entityIds (JSON), entityIdsKey, entityNames (JSON), sourceIds (JSON),
  description,
  status: OPEN | RESOLVED | DEFERRED | ACCEPTED,
  resolution: { strategy, resolvedValue, rationale, resolvedBy, resolvedAt } (JSON),
  detectedAt, detectedBy
})
(:Draft*)-[:HAS_CONTRADICTION]->(:ContradictionNode)
```

**Detection** (`detectContradictions`):

1. Fetch all drafts with sourceId resolved (`drafts.listWithSource`)
2. Optional **embedding prefetch**: `qdrant.workspaceGetVectors(workspaceId, draftIds)` — one call returns `Map<id, vector>`
3. **Group by similarity** (`_groupBySimilarity`):
   - Different `sourceId` required (same source ≠ contradiction)
   - Same `type` required (entity vs rule with same name ≠ contradiction)
   - Hybrid similarity: `nameSim*0.4 + cosineSim*0.6` (P3-004); name-only fallback if vectors unavailable
   - Threshold default 0.75
4. **Find property conflicts** in each group: any field where serialised values differ
5. **Classify** the conflict (`classifyConflict`) by field name + value shapes:
   - `TEMPORAL` — fields matching `date|time|year|version|updated|created|expir`
   - `CARDINALITY` — array vs scalar mismatch or different array lengths
   - `LOGICAL` — boolean opposites
   - `SCOPE` — all values are nested objects
   - `FACTUAL` — fallback
6. **Severity** (`determineSeverity`):
   - `BLOCKING` — fields matching `approval|required|mandatory|enforce|compliance|policy` OR type=`LOGICAL`
   - `WARNING` — fields matching `max|min|limit|threshold|deadline|cap|quota` OR type=`TEMPORAL`
   - `INFO` — fallback
7. **Idempotent dedupe** by `(workspaceId, field, sorted entityIds joined by '|')` — re-runs skip existing

**Resolution strategies:**
- `USE_FIRST` / `USE_SECOND` / `USE_NEWER` / `MANUAL` / `ACCEPT_BOTH`
- Stored as JSON on the contradiction node, NOT applied to draft content (audit-only by design)

**Auto-detection hook (P3-002)**: extraction pipeline calls `contradictionService.detectContradictions(workspaceId, {detectedBy: 'extraction-pipeline'})` after a successful run, controlled by `AUTO_DETECT_CONTRADICTIONS !== 'false'` env var.

### 10.3 Cross-source analysis (P2-006)

**Why "what's in this workspace" is itself a hard question.** A user staring at a workspace with 200 drafts and 5 sources cannot easily answer the simplest questions: which source contributed the most? Which entities are mentioned in multiple sources (and are therefore probably reliable)? Which sources have nothing extracted yet? Which drafts are isolated (probably noise)? Are there sources that should be related to each other?

These questions are not exotic — they are the everyday curation questions. But answering them requires running queries across drafts, sources, edges, and contradictions, then aggregating the results. The cross-source service does that work and presents the answers as a structured report.

The most concrete value is the **health score** — a single 0..100 number that summarises whether the workspace is in good shape. The user looks at it once and knows if there's significant work to do. If the score is 95, they can promote with confidence. If the score is 40, the report tells them exactly why (orphan sources, unresolved blockers, isolated entities, contradictions) and which actions would improve it. This turns "is my workspace ready?" from a vague worry into a measurable checklist.

The **shared entities** view is where the cross-source value really shows. When the same entity (`Customer`, `Approval Workflow`, `Department`) appears in multiple sources, it's a strong signal that this is real institutional knowledge — not a fluke of one author. The corroboration score quantifies this. Conversely, an entity that appears in only one source is either unique to that source (legitimate) or a mistake (the LLM hallucinated it from the surrounding text).

The **inferred source relationships** answer the question "how do these documents relate to each other?". If two sources share many entities and one is clearly newer, the system infers `SUPERSEDES`. If a database schema source and a documentation source share many entity names, the system infers `IMPLEMENTS`. These inferences let the user navigate the source set as a graph, not just a flat list.

`cross-source.service.js` provides four read-only analytical methods over the workspace:

| Method | Returns |
|---|---|
| `analyzeSourceCoverage(wsId)` | Per-source: entity count, shared/unique counts, coverage flags (indexed/extracted/graphed), top 5 entities by confidence |
| `findSharedEntities(wsId, {minSources, limit})` | Entities present in ≥2 sources, with `sourceCount`, `corroborationScore`, `hasContradiction` flag |
| `inferSourceRelationships(wsId)` | Heuristic edges between sources: `CONTRADICTS` (if shared contradiction), `SUPERSEDES` (≥3 shared entities + 30+ days date diff), `IMPLEMENTS` (schema↔document with ≥50% overlap), `RELATED_TO` (fallback) |
| `suggestMissingLinks(wsId, {limit, includeGnn?})` | `isolatedEntities[]`, `potentialLinks[]` (drafts with similar names but no edge), `orphanSources[]` |
| `generateAnalysisReport(wsId)` | Combines all of the above plus contradiction stats and a **health score 0..100** with issues + recommendations |

**Health score formula:**

```
score = 100
- 20  if orphan sources > 20% of total
- 15  if unresolved contradictions > 50% of total
- 10  if isolated entities > 30% of total
- 15  if any BLOCKING contradictions exist
+ 10  (capped at 100) if corroborated entities > 50% of total
clamp [0..100]
```

`includeGnn: true` (P3-007) merges in GNN-based predictions from `link-predictor.service`.

### 10.4 Validator (P2-007)

**Why a hard validation gate before promotion.** The promotion step is irreversible — once a draft lands in the global KB, every downstream consumer starts using it. The cost of catching a problem AFTER promotion is dramatically higher than catching it BEFORE: post-promotion fixes require coordinating with downstream systems, invalidating caches, possibly issuing corrections to users who already saw the wrong data. The validator's job is to make sure that the cheap "before" check actually happens, every time.

Without an enforced gate, validation becomes a habit the user might forget. With the gate, validation is *unavoidable* — the promotion controller calls `canPromote()` automatically and rejects the request with HTTP 409 if any BLOCKING rule fails. The user cannot bypass it without deliberately passing `skipValidation: true`, which is an explicit emergency escape hatch with a clear name.

The 10 rules are deliberately split into **three severities** because not all problems should block promotion:

- **WARNING** (orphan nodes, low confidence, empty content) — user should know about it but can choose to proceed. These problems are common and not catastrophic.
- **ERROR** (missing required properties, dangling edges, executable graph without entry/exit, structural graph with cycles) — the graph is structurally broken. The user should fix these before promotion, but if they really insist (`skipValidation: true`), the system won't physically prevent it.
- **BLOCKING** (unresolved blocking contradictions) — the graph is *semantically* broken in a way that would make the global KB inconsistent. Promotion is rejected outright.

The split is what makes the validator usable. A pure pass/fail validator would either be too lenient (lots of false-pass) or too strict (every workspace has minor warnings, so blocking them all means nothing ever gets promoted). The three-severity model lets the gate be strict where it matters (semantic conflicts) and informational where it doesn't (cosmetic warnings).

The validator's other value is **visibility**. The Promotion Wizard's first step runs `validateGraph()` and shows the results in a structured panel: passed checks in green, warnings in yellow, blockers in red, with collapsible "affected nodes" lists for each rule. The user sees exactly what's wrong and where. This turns "ready to promote?" from a yes/no question into a precise fix-list.

`graph-validator.service.js` runs **10 rules** over a workspace's draft graph and returns a structured `ValidationResult`:

```js
{
  valid: boolean,        // false if any ERROR or BLOCKING
  canPromote: boolean,   // false if any BLOCKING
  summary: { total, passed, warnings, errors, blocking, skipped },
  results: [
    { ruleId, ruleName, severity, status: PASS|WARN|FAIL|SKIP,
      message, affectedNodes: [...], duration }
  ],
  blockers: [...],   // FAIL + BLOCKING only
  errors: [...],     // FAIL + ERROR only
  warnings: [...],   // WARN
  metadata: { workspaceId, validatedAt, duration, nodeCount, edgeCount, graphType }
}
```

**The 10 rules:**

| ID | Severity | Applies to | Description |
|---|---|---|---|
| `REQUIRED_PROPERTIES` | ERROR | all | Every draft must have a non-empty `name` and a `type` |
| `NO_ORPHAN_NODES` | WARNING | all | Each draft should have ≥1 edge (skipped for trivial single-node graphs) |
| `NO_DANGLING_EDGES` | ERROR | all | All edges must connect existing drafts |
| `MIN_CONFIDENCE` | WARNING | all | Drafts should have `confidence ≥ 0.5` |
| `NO_EMPTY_CONTENT` | WARNING | all | Drafts should have non-empty `content` or `description` |
| `NO_BLOCKING_CONTRADICTIONS` | **BLOCKING** | all | All BLOCKING contradictions must be resolved |
| `CONTRADICTIONS_REVIEWED` | WARNING | all | All contradictions should be reviewed (status ≠ OPEN) |
| `EXECUTABLE_HAS_ENTRY_EXIT` | ERROR | EXECUTABLE | Workflow drafts named `start|begin|entry` and `end|finish|exit` must exist |
| `STRUCTURAL_IS_DAG` | ERROR | STRUCTURAL | DFS-based cycle detection (no directed cycles) |
| `CONSTRAINT_HAS_TARGET` | ERROR | CONSTRAINT | At least one schema-type draft must exist |

`canPromote(workspaceId)` is a **fast path** that runs only `NO_BLOCKING_CONTRADICTIONS`. The promotion controller calls it as a gate before `executePromotion` and returns HTTP 409 if blockers exist (escape hatch: `body: { skipValidation: true }`).

### 10.5 Promotion (P1)

**Why promotion is a multi-step SAGA, not a single atomic write.** Moving knowledge from a workspace into the global KB is the most consequential operation in the whole system. It is also the operation with the most failure modes: drafts may conflict with existing KB nodes, the chosen target namespace may not exist, the user may want to promote some drafts but skip others, individual writes may fail mid-flight. A single "INSERT all drafts" call cannot handle any of these.

The SAGA pattern solves them by making promotion **structured, reviewable, and rollback-safe**:

1. **Diff first, write later.** Before any change to the global KB, the diff computer compares each selected draft against the target namespace and assigns it an action: NEW (no existing match), ENRICH (add fields to an existing match), SUPERSEDE (replace an existing match with a newer version), MERGE (combine perspectives), CONFLICT (per-field disagreement requires user choice), SKIP (already promoted or otherwise irrelevant). The user sees this plan **before** anything is written. If the plan looks wrong, they back out at no cost.

2. **Conflict resolution per field, not per draft.** When a draft conflicts with an existing KB node, the system surfaces the conflict at the field level. The user can choose `use_draft` for one field, `use_kb` for another, manual merge for a third. This is dramatically more granular than the alternative ("approve the whole draft or reject it") and matches how curation actually works in practice: most conflicts are partial.

3. **Atomic SAGA with compensation.** Each promoted draft is written through a step that has a compensation handler. If step 47 fails, all preceding 46 steps are compensated (rolled back) before the SAGA reports failure. The global KB is never left in a half-written state.

4. **Audit trail.** Every promotion run creates a `PromotionRecord` node in the META namespace with the user, timestamp, items promoted, resolutions chosen, target namespace, and outcome. When someone asks "who put this fact in the KB?", the answer is in Memgraph, queryable.

5. **Pre-flight validation gate.** Before the SAGA even starts, the validator's `canPromote` check is run automatically (§10.4). If it returns false, the SAGA never executes and the user gets a clear error explaining what to fix.

The promotion wizard UI (P3-003) walks the user through all of this: validate → select drafts → review diff → resolve conflicts → confirm → execute → see result. Each step is a clear gate, and the user can back out at any point before the final confirmation.

`promotion/` contains the SAGA that moves drafts into the global Knowledge Base.

| File | Purpose |
|---|---|
| `diff-computer.service.js` | Computes the action plan (NEW / ENRICH / SUPERSEDE / MERGE / CONFLICT / SKIP) for each draft against the target namespace |
| `similarity-scorer.service.js` | Hybrid scorer: semantic (Qdrant cosine) + name (Levenshtein) + type + attribute overlap. P3 fix: skips Qdrant search if collection doesn't exist; uses literal `LIMIT` for Memgraph |
| `conflict-detector.service.js` | Per-field comparison between Draft and matched KB node |
| `resolution.service.js` | Applies user-chosen resolutions (use_draft / use_kb / merge per-field) to the diff items |
| `promotion-saga.service.js` | Builds and executes the SAGA: per-item compensation steps, atomic on success, rollback on failure |

The promotion SAGA writes a `PromotionRecord` audit node and moves successful drafts to status `PROMOTED`.

### 10.6 GNN Link Prediction (P3-007)

**Why machine-suggested links matter.** A typical extracted workspace has many entities and few edges. The LLM extractor is good at recognising entities but bad at noticing that two entities probably should be linked when the link isn't stated explicitly in the source text. The result is a sparse graph that doesn't capture the actual structure of the domain. The user has to manually add the missing edges — and they usually don't, because they don't know which edges are missing.

The link predictor closes this gap by using a Graph Neural Network (or, when GNN is unavailable, embedding cosine similarity) to suggest likely-but-missing connections. The user sees the suggestions in the SuggestionsPanel with a probability score: "Customer ↔ Account (87%), suggested type GOVERNED_BY". One click and the edge is created. This turns a tedious manual chore into a one-click confirmation.

The suggestions are also a *quality signal*. When the GNN strongly believes two entities should be connected and the user agrees, that's evidence the workspace is internally consistent. When the GNN suggests something that the user rejects, that's a signal to retrain the model or ignore that suggestion in the future. Over time the suggestion list becomes a feedback loop that improves both the workspace and the GNN itself.

The three-tier fallback strategy (model-status → predict-links → embedding cosine) is what makes this practical in a real deployment. A fully-trained GNN service is not always available — it might not be deployed, or the model might not be loaded, or the endpoint might not exist. Without a fallback, "suggestions" would silently disappear in those environments. With the fallback, the suggestions degrade gracefully: cosine over text embeddings is worse than a real GNN but still useful, and "no suggestions" only happens when even the embedding endpoint is down.

`link-predictor.service.js` predicts missing links between draft entities using a **three-tier strategy**:

1. **Probe** `GET /api/v1/gnn/model-status` (3 s timeout) — returns `gnnAvailable: true|false`
2. **Try** `POST /api/v1/gnn/predict-links` with the workspace's draft IDs:
   - On 200 → parse predictions, filter by threshold, attach suggested relation type
   - On 404 → fall through to step 3
3. **Fallback to embedding cosine**: for each draft (capped at 200), call `/api/v1/gnn/embed/text`, then compute pairwise cosine locally; skip same-source pairs
4. If even step 3 fails → return `{ predictions: [], stats: { method: 'unavailable' } }`

`suggestRelationType(typeA, typeB)` infers the edge label from the draft kinds:
- `entity` + `business_rule` → `GOVERNED_BY` / `GOVERNS`
- `schema` + `entity` → `DEFINES` / `DEFINED_BY`
- same type → `SIMILAR_TO`
- fallback → `RELATES_TO`

`existingPairs` set is built from `drafts.getEdges` and used to filter out predictions for already-connected pairs.

REST endpoint: `POST /workspaces/:id/analysis/predict-links` body `{ threshold, limit, skipExisting }`.

### 10.7 Structural Form Import (Form Builder integration)

**Why a second graph-creation path.** The primary way to populate a workspace with drafts is the extraction pipeline (LLM over uploaded sources). But sometimes the user already *knows* the structure they want to capture — for example, the schema of a service request form, the fields of a customer entity, the steps of a known workflow. In those cases, running an LLM extractor over a fake document is wasteful and lossy. The user wants to draw the structure directly.

The platform already has a mature **Structural Editor** at `/structural-editor` — a form/data-structure builder where users compose typed fields, nested objects, arrays, and enums under a ROOT node, then save the result as a global STRUCTURAL graph (`:GraphDefinition {graphType: "STRUCTURAL"}`). This editor is used independently for FlowDesk forms and other downstream consumers.

The Form Builder integration **embeds the same editor inside a workspace tab** and adds an "Import to WorkSpace" action that converts the structural graph into workspace drafts. The structural graph itself is still saved globally (so the same form can be reused across many workspaces), but each workspace can pull a snapshot of it into its own draft set.

**Conversion rules** (`structural-import.service.js`):

| Structural node type | Workspace draft type | Notes |
|---|---|---|
| `ROOT` | `schema` | One per imported form. Holds fields as inline `content.fields[]`. |
| `OBJECT` | `entity` | Each nested object becomes its own entity with its own inline fields. |
| `ARRAY` | `entity` | Treated as a collection entity. Holds array element shape inline. |
| `ENUM` | `concept` | The enum's allowed values are stored as `content.allowedValues[]`. |
| `FIELD` | *(folded inline)* | NOT a separate draft — added to the parent's `content.fields[]` array as `{ name, label, dataType, required, defaultValue, uiHints }`. This avoids "draft explosion" where a 30-field form would create 30 useless single-field drafts. |

Structural edges (`CONTAINS`, etc.) between draft-producing nodes (ROOT/OBJECT/ARRAY/ENUM) are recreated as workspace draft edges. Edges to FIELD children are dropped because FIELDs are inlined.

**Provenance.** Each import creates (or reuses) a synthetic `:SourceReference` with `sourceType: 'STRUCTURAL_FORM'` and `filename: structural:{graphId}`. All imported drafts are linked to this source via `:EXTRACTED_FROM`, so the lineage trail says "this draft came from structural form X". Re-importing the same structural graph into the same workspace finds the existing source and reuses it (no source duplication).

**Idempotency.** The import always creates *new* drafts on each call — it does not de-dupe by content. This is intentional: the user might tweak the structural form and want to compare the new version against the old. If de-duplication is desired in a future iteration, the contradiction service will flag the duplicates after import.

**Confidence.** Imported drafts get `confidence: 0.9` (vs. the default 0.75 for LLM-extracted drafts) because the structure is user-curated, not LLM-guessed.

**Service methods** (`structural-import.service.js`):

| Method | Purpose |
|---|---|
| `previewImport(workspaceId, structuralGraphId)` | Read-only — returns the plan (draft count, edge count, breakdown by type, list of drafts that would be created) without writing anything. Used by the Preview Import dialog. |
| `importIntoWorkspace(workspaceId, structuralGraphId, {userId})` | Executes the import: creates/reuses the synthetic source, creates all drafts, creates all draft edges, returns stats and the created draft list. |

**REST endpoints:**

```
GET  /api/v1/workspaces/:id/structural-import/preview?graphId=...
POST /api/v1/workspaces/:id/structural-import           body: { graphId }
```

**Frontend** (`mcp/src/components/Workspace/WorkspaceFormBuilder.jsx`):

- Embeds the existing `StructuralFormEditor` component as-is — zero changes to the underlying editor or its global storage layer
- Adds an `ImportBanner` strip on top with two actions:
  - **Preview Import** — calls the preview endpoint and shows a dialog with the plan (counts, type breakdown, list of drafts) so the user can verify before committing
  - **Import to WorkSpace** — calls the import endpoint and shows a success Snackbar with the stats
- Both actions are disabled when the editor has unsaved changes (`isDirty === true`) — the import reads the *saved* version of the structural graph, so the user must save first
- A Snackbar reports both success and error outcomes

**The user flow:**

1. Open a workspace, switch to the **Form Builder** tab
2. Either create a new form ("New Graph" in the Structural Editor toolbar) or open an existing one ("Open" → pick from the list of all global structural graphs)
3. Build / edit the form (drag fields, set labels, mark required, etc.)
4. Save it (`Ctrl+S` or the Save button) — this writes to global structural storage
5. Click **Preview Import** to see the conversion plan in a dialog
6. Click **Import to WorkSpace** — drafts are created in this workspace, linked to a synthetic source, and immediately visible in the Drafts / Canvas / Workbench tabs

This integration is the **lowest-friction way for a domain expert to declare structured knowledge** without writing prompts, uploading documents, or trusting the LLM to extract the right shape. It complements (not replaces) the extraction pipeline: extraction is for *unknown* structure hidden in documents, the form builder is for *known* structure the user can describe directly.

### 10.8 Unified DataSource Catalog (Workspace ↔ Form Builder bridge)

**Why this exists.** Before consolidation, the platform had two unrelated concepts that both used the word "data source":

1. **Workspace SourceReferences** — documents and database/API references uploaded into a workspace via `POST /workspaces/:id/sources`. Stored as `:SourceReference` nodes attached to the workspace via `:HAS_SOURCE`. These were just metadata blobs — no executor, no resolver, no reusability.
2. **v2 DataSource catalog** — first-class typed data sources used by the Form Builder for `datasource-select` and `datasource-autocomplete` field bindings. Stored as `:GraphDefinition:DataSource` nodes with `sourceType ∈ {SQL, API, KB, FILE, COMPOSITE}` and rich executor configurations. Owned by `services/datasource.service.js`.

The two systems were physically and conceptually disjoint:
- A workspace user who created a "Database" source got a metadata record that the Form Builder couldn't see.
- A Form Builder user who created a SQL DataSource got a global record that wasn't tied to any workspace.
- The same database connection could be created twice — once as a workspace source, once as a global DataSource — with no link between them.

The consolidation introduces a **two-way bridge** that lets both systems coexist while presenting a single unified catalog inside the workspace UI. The two storage formats remain separate (different node labels, different services), but a workspace user sees one consistent catalog that contains both flavours.

**Bridge service** (`workspace-datasource.service.js`):

| Method | Purpose |
|---|---|
| `listForWorkspace(workspaceId, {sourceType, includeGlobal, limit})` | Returns the workspace-scoped catalog: DataSources whose namespace equals `workspace.namespace` (workspace-private) plus DataSources whose namespace ∈ {`CORE`, `FLOWDESK`, `COMMON`, `PROJECT`} (shared library). Each item is tagged with `scope: 'workspace' | 'global'` so the UI can render the origin. |
| `registerSourceAsDataSource(workspaceId, sourceId)` | Promotes an existing workspace `SourceReference` (DATABASE or API type) into the v2 catalog. Creates a `:GraphDefinition:DataSource` node with `namespace = workspace.namespace` and writes `dataSourceGraphId` back onto the source for the link. **Idempotent** — re-running on an already-promoted source returns the existing graphId without creating a duplicate. |
| `unregisterSourceDataSource(workspaceId, sourceId)` | Drops the linked v2 record when the source is deleted. Best-effort, non-blocking. |
| `findSourceForDataSource(graphId)` | Reverse lookup — given a v2 DataSource graphId, find the workspace SourceReference (and workspace) that owns it. Used by the Form Builder UI to surface "this came from workspace X". |

**Auto-promotion on source create.** `workspace.service.addSource` was extended with a hook that runs after the `:SourceReference` is persisted: if `sourceType === 'DATABASE' || 'API'`, the new source is immediately promoted into the v2 catalog by calling `registerSourceAsDataSource`. The resulting `dataSourceGraphId` is stored as a property on the source. This means every database or API connection added to a workspace **automatically appears in the Form Builder's DataSource catalog** without any extra user action.

The hook is wrapped in `try/catch` — failure of the v2 promotion does NOT break source creation. The workspace remains usable; the source just isn't visible in the Form Builder catalog until manually promoted via the REST endpoint.

**Auto-cleanup on source delete.** `source.service.deleteSource` was extended symmetrically: if the source has a `dataSourceGraphId`, the corresponding v2 record is dropped before the source itself is deleted. Best-effort, non-blocking.

**Workspace-scoped catalog endpoint:**

```
GET /api/v1/workspaces/:id/datasources?sourceType=...&includeGlobal=true&limit=200
POST /api/v1/workspaces/:id/datasources/register-source   body: { sourceId }
```

The first endpoint returns the union of workspace-private and shared global DataSources, sorted with workspace items first. The second endpoint lets the user explicitly promote an existing source that wasn't auto-promoted (e.g. a source created before the bridge existed).

**Frontend integration:**

- `mcp/src/services/workspace.service.js` — added `listWorkspaceDataSources(wsId, params)` and `registerWorkspaceSourceAsDataSource(wsId, sourceId)`
- `mcp/src/stores/dataSourceCatalogStore.js` — extended with a `workspaceContext` field and `setWorkspaceContext()` / `clearWorkspaceContext()` actions. When `workspaceContext` is set, `fetchAll()` reads from `/workspaces/:id/datasources` instead of the global `/datasources`. Newly-created DataSources via the editor's "DataSources" tab automatically get `namespace = workspace:{id}` so they remain workspace-private.
- `mcp/src/components/Workspace/WorkspaceFormBuilder.jsx` — calls `setWorkspaceContext(workspaceId)` on mount and `clearWorkspaceContext()` on unmount. This means **opening the Form Builder inside a workspace automatically scopes the DataSource tab to that workspace**, while the standalone `/structural-editor` page still sees the global catalog.

**The result for the user:**

| Action | Before consolidation | After consolidation |
|---|---|---|
| Add a `DATABASE` source to a workspace | Metadata blob, invisible to Form Builder | Auto-creates a v2 SQL DataSource visible in the Form Builder DataSources tab (workspace-private) |
| Open the Form Builder inside a workspace | Sees the global catalog (every DataSource on every workspace) | Sees only this workspace's private DataSources + globally-shared ones, sorted with workspace items first |
| Create a new DataSource via Form Builder while inside a workspace | Goes into the global catalog with no link to the workspace | Goes into the workspace's namespace, visible to this workspace only |
| Delete a workspace source that has a linked v2 record | The orphan v2 record stays forever | Auto-removed by the source delete hook |
| Open the standalone `/structural-editor` page | Same global catalog as before | Same global catalog as before — no behavioural change for non-workspace usage |

The consolidation is **additive** — no existing data is migrated, no existing endpoint is broken. Workspaces created before the bridge will not have their database/API sources auto-promoted (the hook only fires on new creates), but the explicit `POST /workspaces/:id/datasources/register-source` endpoint lets the user backfill them on demand.

### 10.9 Unified DataSource Editor (single UI for two tabs)

**Why one editor instead of two.** Before this consolidation, the workspace had two separate UIs for adding "data sources":

- **Sources tab** had a small modal dialog with a few text inputs (filename, URI, description). It supported `FILE / URL / TEXT / DATABASE / API` but treated DATABASE/API as plain metadata blobs — no SQL editor, no query templates, no connection test, no AI assist.
- **Form Builder → DataSources tab** had a rich master/detail editor with type-specific config panels (SQL with query/searchQuery/countQuery + connection picker + AI assistant; KB with Cypher/vector + KB catalog browser; API with method/endpoint/auth + Swagger importer; FILE with format/delimiter; COMPOSITE with merge strategy + child source picker), AI chat for each type, test connection, and full validation.

The two were physically duplicated: a database connection added through Sources couldn't be reused in Form Builder, and a SQL DataSource created in Form Builder couldn't appear in the workspace's source list. After the §10.8 catalog bridge resolved the *storage* duplication, the *UI* duplication remained — and the rich editor was the only one worth keeping.

**The unified editor.** The Form Builder editor was extracted into a reusable component and wrapped in an MUI dialog. The same code now powers both surfaces:

| Surface | Trigger | Container | Result |
|---|---|---|---|
| Form Builder → DataSources tab | Already-existing inline master/detail | `<DataSourceCatalog>` (full page) | Single v2 DataSource (`:GraphDefinition:DataSource`) |
| Workspace → Sources tab | Click "Add DataSource" button | `<DataSourceCreateDialog>` (modal) | v2 DataSource **+** paired `:SourceReference` (one transaction) |

Both go through the same Zustand `useDataSourceCatalogStore` and the same `DataSourceEditor` React component, so any improvement to the editor (a new field type, a new validation rule, a new AI assistant) automatically benefits both surfaces.

**Architectural pieces:**

1. `mcp/src/components/StructuralEditor/tabs/DataSourceCatalog.jsx` — the original master/detail. Now exports the inner editor pieces by name (`DataSourceEditor`, `SqlEditor`, `KbEditor`, `ApiEditor`, `FileEditor`, `CompositeEditor`, `SOURCE_TYPES`, `TYPE_LABELS`) so other consumers can reuse them.

2. `mcp/src/components/Workspace/DataSourceCreateDialog.jsx` (new, ~140 LOC) — MUI dialog wrapper. On open it:
   - Calls `setWorkspaceContext(workspaceId)` so the store reads/writes the workspace-scoped catalog
   - Calls `startCreate(initialType)` (or `startEdit(existingDataSource)` if editing)
   - Renders `<DataSourceEditor />` inside the dialog body — exact same component as Form Builder
   - On close, tears down the store state via `cancelEdit()` + `clearWorkspaceContext()`
   - Save button calls `store.save()` which routes through the workspace endpoint

3. `mcp/src/stores/dataSourceCatalogStore.js` — extended `save()` action: when `workspaceContext` is set, the create call goes to `POST /workspaces/:id/datasources` (the new paired-create endpoint) instead of the global `POST /datasources`. Updates still go to the global PATCH endpoint regardless of context.

4. `api/src/services/workspace/workspace-datasource.service.js` — new method `createWithSource(workspaceId, dataSourceConfig, userId)`. In one transaction it:
   - Creates the v2 `:GraphDefinition:DataSource` with `namespace = workspace.namespace`
   - Creates a paired `:SourceReference` linked via `:HAS_SOURCE` and stamped with `dataSourceGraphId`
   - Maps the v2 sourceType to the closest workspace SourceType (`SQL → DATABASE`, `API → API`, `KB → API`, `FILE → FILE`, `COMPOSITE → API`) so the source list still shows a meaningful icon
   - Stores a primary URI (connection string / endpoint / file path) on the SourceReference for display

5. `api/src/controllers/workspace.controller.js` + `routes/workspace.routes.js` — new endpoint `POST /api/v1/workspaces/:id/datasources` that calls `createWithSource`.

6. `mcp/src/components/Workspace/SourcesTab.jsx` — refactored:
   - Header now has **two** buttons: **Add Document** (the existing simple modal, scoped to FILE/URL/TEXT) and **Add DataSource** (opens `DataSourceCreateDialog` for SQL/KB/API/FILE/COMPOSITE)
   - The simple modal no longer has a DATABASE/API option — those go through the rich editor
   - The source list still shows everything: documents AND DataSource-backed entries appear side-by-side with their respective icons

**The user-visible result:**

- A user adding a SQL database connection in the Sources tab now gets the **same rich editor** they would get in the Form Builder DataSources tab — connection picker, query editor, search/count templates, SQL AI assistant.
- A user adding an OpenAPI / REST endpoint gets the **same Swagger importer** and AI chat that the Form Builder offers.
- The created DataSource is immediately visible in BOTH the Sources tab list AND the Form Builder DataSources tab — single record, two views.
- The standalone `/structural-editor` page still uses the Form Builder catalog as before (no workspace context).

**Why split documents from DataSources at the UI level.** The "Add Document" and "Add DataSource" buttons distinguish two semantically different operations:

- **Add Document** = "I have a file/URL/text I want the extraction pipeline to read." The result is content the LLM will process.
- **Add DataSource** = "I have a live data store I want to query." The result is an executor-backed binding the Form Builder and runtime can use.

Both ultimately produce a `:SourceReference` (so the workspace has a single source list), but their lifecycles and use cases are different. Bundling them under one button caused the original confusion where "DATABASE source" looked like just another document type.

---

## 11. REST API Surface

Base path: `/api/v1/workspaces`. Full list grouped by category, with controller method.

### Lifecycle

| Method | Path | Controller | Body / Query |
|---|---|---|---|
| POST | `/` | `create` | `{ name, description?, domain?, tags? }` |
| GET | `/` | `list` | query: `status?, domain?, limit=20, offset=0` |
| GET | `/:id` | `get` | — |
| PATCH | `/:id` | `update` | `{ name?, description?, domain?, tags? }` |
| PATCH | `/:id/status` | `updateStatus` | `{ status, reason? }` |
| DELETE | `/:id` | `archive` | — |
| DELETE | `/:id/permanent` | `deletePermanent` | — |
| GET | `/:id/stats` | `getStats` | — |

### Sources

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/sources` | `addSource` |
| POST | `/:id/sources/upload` | `uploadSource` (multipart `file`, max 50 MB) |
| GET | `/:id/sources` | `listSources` |
| GET | `/:id/sources/:sourceId` | `getSource` |
| GET | `/:id/sources/:sourceId/details` | `getSourceDetails` |
| POST | `/:id/sources/:sourceId/analyze` | `analyzeSource` |
| POST | `/:id/sources/:sourceId/extract` | `extractSource` (returns 202 + jobId) |
| POST | `/:id/sources/extract-flowdesk` | `extractFlowDesk` |
| DELETE | `/:id/sources/:sourceId` | `deleteSource` |

### Extraction jobs

| Method | Path | Controller |
|---|---|---|
| GET | `/:id/extract/jobs` | `listExtractionJobs` |
| GET | `/:id/extract/:jobId` | `getExtractionStatus` |
| GET | `/:id/extract/:jobId/progress` | `streamExtractionProgress` (SSE) |
| DELETE | `/:id/extract/:jobId` | `cancelExtraction` |

### Drafts

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/drafts` | `createDraft` |
| GET | `/:id/drafts` | `listDrafts` |
| POST | `/:id/drafts/search` | `searchDrafts` |
| GET | `/:id/drafts/:draftId` | `getDraft` |
| PATCH | `/:id/drafts/:draftId` | `updateDraft` |
| DELETE | `/:id/drafts/:draftId` | `deleteDraft` |
| GET | `/:id/drafts/:draftId/edges` | `getEdges` |

### Edges

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/edges` | `createEdge` |

### KB read-only access

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/kb/search` | `kbSearch` |
| GET | `/:id/kb/nodes/:entityId` | `kbGetNode` (query `full=false`) |

### Promotion

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/promotion/diff` | `computePromotionDiff` |
| POST | `/:id/promotion/execute` | `executePromotion` (gated by `validator.canPromote` unless `skipValidation: true`) |

### Structural Form Import

| Method | Path | Controller |
|---|---|---|
| GET | `/:id/structural-import/preview?graphId=...` | `previewStructuralImport` |
| POST | `/:id/structural-import` | `importStructuralGraph` (body `{ graphId }`) |

### DataSource Catalog (bridge)

| Method | Path | Controller |
|---|---|---|
| GET | `/:id/datasources` | `listWorkspaceDataSources` (query `sourceType?, includeGlobal=true, limit=200`) |
| POST | `/:id/datasources` | `createWorkspaceDataSource` (body = full v2 DataSource config; creates v2 record + paired SourceReference) |
| POST | `/:id/datasources/register-source` | `registerWorkspaceSourceAsDataSource` (body `{ sourceId }`) |

### Audit

| Method | Path | Controller |
|---|---|---|
| GET | `/:id/audit` | `getAuditLog` |

### Agent (persistent chat)

| Method | Path | Controller |
|---|---|---|
| GET | `/:id/agent/session` | `getAgentSession` |
| POST | `/:id/agent/message` | `sendAgentMessage` (SSE stream) |
| DELETE | `/:id/agent/session` | `clearAgentSession` |
| GET | `/:id/agent/actions` | `getAgentActions` |

### Validation

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/validate` | `validateGraph` |
| GET | `/:id/validate/rules` | `listValidationRules` |
| GET | `/:id/validate/can-promote` | `canPromote` |
| GET | `/:id/validate/node/:nodeId` | `validateNode` |

### Cross-source analysis

| Method | Path | Controller |
|---|---|---|
| GET | `/:id/analysis/coverage` | `analysisCoverage` |
| GET | `/:id/analysis/shared-entities` | `analysisSharedEntities` |
| GET | `/:id/analysis/source-relationships` | `analysisSourceRelationships` |
| GET | `/:id/analysis/suggestions` | `analysisSuggestions` |
| POST | `/:id/analysis/predict-links` | `predictLinks` |
| GET | `/:id/analysis/report` | `analysisReport` |

### Contradictions

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/contradictions/detect` | `detectContradictions` |
| GET | `/:id/contradictions` | `listContradictions` |
| GET | `/:id/contradictions/stats` | `contradictionStats` |
| GET | `/:id/contradictions/:contradictionId` | `getContradiction` |
| PUT | `/:id/contradictions/:contradictionId/resolve` | `resolveContradiction` |
| PUT | `/:id/contradictions/:contradictionId/reopen` | `reopenContradiction` |
| DELETE | `/:id/contradictions/:contradictionId` | `deleteContradiction` |

### Graph (canvas)

| Method | Path | Controller |
|---|---|---|
| GET | `/:id/graph` | `getGraph` |
| PUT | `/:id/graph` | `saveGraph` |

### Graph versions

| Method | Path | Controller |
|---|---|---|
| POST | `/:id/versions` | `createVersion` |
| GET | `/:id/versions` | `listVersions` |
| GET | `/:id/versions/diff` | `diffVersions` (query `v1`, `v2`) |
| GET | `/:id/versions/:versionId` | `getVersion` |
| POST | `/:id/versions/:versionId/restore` | `restoreVersion` (body `{ confirm: true }`) |

---

## 12. MCP Tools (19) — Agent-callable

Workspace tools registered in `api/src/mcp/tools/workspace/index.js`. The agent calls them with **sanitised** names (dots replaced with underscores), so `workspace.create_draft` is invoked as `workspace_create_draft`.

### Lifecycle (4)
- `workspace.create` — `name, description?, domain?, tags?` → `{ workspaceId, namespace, status, name }`
- `workspace.get` — `workspaceId` → workspace + `stats`
- `workspace.list` — `status?, domain?, limit=20` → `{ items, total, limit, offset }`
- `workspace.update_status` — `workspaceId, status, reason?` → `{ workspaceId, status }`

### Sources (2)
- `workspace.add_source` — `workspaceId, filename, mimeType?, sourceType?, uri?, sizeBytes?` → `{ sourceId, filename, status }`
- `workspace.list_sources` — `workspaceId` → `{ sources, count }`

### Drafts (5)
- `workspace.create_draft` — `workspaceId, type, name, content, description?, sourceId?, confidence?` → `{ draftId, type, name, status, contentHash }`
- `workspace.get_draft` — `workspaceId, draftId`
- `workspace.list_drafts` — `workspaceId, type?, status?, knowledgeFamily?, sourceId?, limit=50`
- `workspace.update_draft` — `workspaceId, draftId, name?, description?, content?, confidence?, status?`
- `workspace.search_drafts` — `workspaceId, query, type?, limit=10`

### KB read-only (3)
- `workspace.kb_search` — `workspaceId, query, namespace?, type?, limit=10` (returns KBReference stubs)
- `workspace.kb_get_node` — `workspaceId, entityId, full?=false` (full=true is flagged in audit)
- `workspace.kb_get_neighbors` — `workspaceId, entityId, direction?=both, limit=20`

### Edges (2)
- `workspace.create_edge` — `workspaceId, sourceId, targetId, edgeType, confidence?, properties?`
- `workspace.get_edges` — `workspaceId, draftId, direction?=both`

### Analysis (3) — added in WS2-007
- `workspace.validate_graph` — `workspaceId, rules?, graphType?, stopOnFirstError?` → full ValidationResult
- `workspace.detect_contradictions` — `workspaceId, similarityThreshold?` → `{ created, skipped, stats }`
- `workspace.analyze_sources` — `workspaceId, reportType?=full` (`coverage|shared-entities|relationships|suggestions|full`)

All 19 are auto-allowed by the workspace agent's whitelist (`workspace_*` pattern in `agent-tool-filter.js`).

---

## 13. Frontend Surface

### Pages

- `WorkspacesPage.jsx` — grid of `WorkspaceCard`, filter row (status, domain), `WorkspaceCreateDialog`
- `WorkspaceDetailPage.jsx` — header + 9 tabs:

| Index | Tab | Component |
|---|---|---|
| 0 | **Workbench** (default) | `WorkspaceWorkbench` (3-panel layout) |
| 1 | Overview | `WorkspaceOverviewTab` (stats grid) |
| 2 | Sources | `SourcesTab` (upload + extract) |
| 3 | Drafts | `DraftsTab` (split-pane list/inspector) |
| 4 | Canvas | `WorkspaceCanvas` (full-screen ReactFlow) |
| 5 | **Form Builder** | `WorkspaceFormBuilder` (Structural Editor + Import banner — see §10.7) |
| 6 | KB Search | `KBSearchTab` |
| 7 | Promotion | `PromotionTab` (launches `PromotionWizard`) |
| 8 | Audit | `AuditTab` |

### The Workbench (3-panel layout)

```
┌─────────────┬──────────────────────────────┬──────────────────────┐
│ SidePanel   │      WorkspaceCanvas         │   AgentPanel         │
│ (resizable) │                              │   (resizable)        │
│             │  Toolbar:                    │                      │
│ • Sources   │   [Save] [Save+Checkpoint]   │   Tabs:              │
│ • Drafts    │   [Reload] [Auto-layout]     │   • Chat (SSE)       │
│ • Contra-   │   [v12 ▾] (versions)         │   • Actions log      │
│   dictions  │                              │                      │
│ • Promotion │  ReactFlow + dagre           │   Cross-panel:       │
│   gate      │  • drag-drop palette         │   listens for        │
│ • Analyze   │  • NodeInspector             │   workspace:agent:   │
│ • Suggest-  │  • EdgeInspector             │   prefill events     │
│   ions      │  • VersionDiffDialog         │                      │
└─────────────┴──────────────────────────────┴──────────────────────┘
        ↑ resize handle             resize handle ↑
   collapsible to 28px         collapsible to 28px
```

Cross-panel communication uses **window CustomEvents**:
- `workspace:agent:prefill` — SidePanel → AgentPanel (e.g. "Analyze sources" button injects a chat prompt)
- `workspace:promotion:launch` — SidePanel → PromotionTab (legacy listener; the Workbench itself also opens its own wizard via the `onPromoteClick` callback)

### Specialised components

| Component | Purpose |
|---|---|
| `canvas/VersionsDropdown.jsx` | Toolbar dropdown of last 10 versions; restore + compare |
| `canvas/VersionDiffDialog.jsx` | Side-by-side diff with collapsible per-field changes |
| `canvas/EdgeInspector.jsx` | Floating panel: relation type (13 presets + custom), confidence, properties |
| `analysis/SuggestionsPanel.jsx` | 3 sections (potential links / isolated entities / orphan sources) with Link/Ignore/Delete/Find/Extract actions; ignored items persist in `localStorage` per workspace |
| `promotion/ValidationStep.jsx` | Step 0 of `PromotionWizard`: auto-runs `validateGraph`, blocks Next if blockers |
| `PromotionWizard.jsx` | 7 steps: Validate → Select → Diff → Resolve → Confirm → Progress → Complete |

### Frontend service map (`workspace.service.js`)

All ~45 API methods exported as named functions. Key non-trivial ones:

- `streamAgentMessage(wsId, message, onEvent)` — `fetch + ReadableStream` SSE parser (handles `event:` / `data:` lines, multi-data accumulation)
- `uploadFileSource(wsId, file, description)` — multipart form-data POST
- `restoreGraphVersion(wsId, versionId)` — sends `{ confirm: true }` automatically

### Zustand store (`workspaceStore.js`)

| State | Used by |
|---|---|
| `workspaces`, `totalWorkspaces`, `loading`, `error`, `filters`, `createDialogOpen` | `WorkspacesPage` |
| `currentWorkspace`, `stats`, `sources`, `activeTab` | `WorkspaceDetailPage` header + tabs |
| `drafts`, `totalDrafts`, `selectedDraft`, `draftEdges` | `DraftsTab`, `PromotionTab` |
| `kbResults` | `KBSearchTab` |
| `auditLog` | `AuditTab` |

Actions wrap the corresponding service calls and write the result into state. Errors set `error` and `loading=false`. Newer subsystems (canvas, agent, suggestions, versions, validator) bypass the store and call services directly to avoid coupling them to global state.

---

## 14. Test Coverage

`api/tests/integration/` against real Memgraph + Qdrant:

| Suite | Tests | Phase |
|---|---|---|
| `workspace.test.js` | (varies) | P1 |
| `workspace-agent.test.js` | 13 | P2-001 |
| `workspace-action-log.test.js` | 29 | P2-002 |
| `workspace-graph-version.test.js` | 17 | P2-003 |
| `workspace-graph.test.js` | 11 | P2-004 |
| `workspace-contradiction.test.js` | 27 | P2-005 |
| `workspace-cross-source.test.js` | 18 | P2-006 |
| `workspace-graph-validator.test.js` | 23 | P2-007 |
| `workspace-extraction-autodetect.test.js` | 10 | P3-002 |
| `workspace-promotion-gate.test.js` | 10 | P3-003 |
| `workspace-embedding-similarity.test.js` | 18 | P3-004 |
| `workspace-link-predictor.test.js` | 12 | P3-007 (mocked `global.fetch`) |

**Total Phase 2 + Phase 3: 188 tests, 0 failed.**

---

## 15. Known Limitations

1. **Restored drafts don't get fresh embeddings in Qdrant** — semantic search will show pre-restore state until something re-indexes.
2. **`EXECUTABLE_HAS_ENTRY_EXIT` uses regex on draft names** (`/start|begin|entry/i`) — proper labels would be more reliable.
3. **`STRUCTURAL_IS_DAG` uses naive DFS** — fine up to ~5k nodes, but Tarjan SCC would be faster on huge graphs.
4. **No undo/redo on canvas** — checkpoint restore covers this use case at coarser granularity.
5. **Cross-panel communication uses DOM events** — works fine for the few existing interactions, would be replaced by a Zustand slice if many more cross-panel interactions appear.
6. **Manual REST mutations bypass auto-checkpoint** — the agent loop is the only place where auto-checkpointing fires.
7. **Contradiction resolution doesn't modify draft content** (intentional — resolution is an audit decision; the promotion service is responsible for applying the chosen value).
8. **`MAX_VERSIONS_PER_WORKSPACE = 50`, `MAX_SNAPSHOT_BYTES = 2 MB`** — hard-coded; would need to become workspace settings to support large workspaces.
9. **GNN `/predict-links` endpoint contract is assumed** — implementation expects `{ predictions: [{ sourceId, targetId, score }] }`. If the real GNN service returns something else the code falls back to embedding cosine.
10. **Auto-detect contradictions threshold is 0.75 hard-coded** — would benefit from per-workspace settings.
11. **`window.confirm` for restore + delete** — works but not internationalised; should become a reusable MUI ConfirmDialog.
12. **Workbench is desktop-only** — no responsive collapse for mobile.

---

## 16. Glossary

| Term | Meaning |
|---|---|
| **WorkSpace** | Isolated knowledge-extraction sandbox; one entity in Memgraph + one Qdrant collection + a Memgraph namespace |
| **Draft** | Knowledge object inside a workspace; one of 12 types; never visible in global KB until promoted |
| **Promotion** | SAGA-driven move of selected drafts into the global Knowledge Base |
| **KBReference** | Lightweight stub created when the agent reads a global KB node — recorded in audit |
| **Action Log** | Append-only history of every tool call performed by the workspace agent |
| **Checkpoint / Version** | Immutable JSON snapshot of the entire draft graph at a point in time |
| **Contradiction** | Materialised conflict between two drafts from different sources |
| **Validator** | Pre-promotion gate; if any rule with severity BLOCKING fails, promotion is rejected |
| **Whitelist** | The agent's allowed tool set; enforced before the underlying intent filter |
| **Workbench** | Default tab on the WorkSpace detail page — 3-panel integrated UX |

---

*This document is maintained alongside the code. When adding a new service, MCP tool, or REST endpoint, please update the relevant section.*

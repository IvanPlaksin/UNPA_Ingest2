# CODEX UN PROJECTADVISOR v0.1.3

> Canonical standard for storing, versioning, and managing knowledge
> in the UN ProjectAdvisor graph database.
>
> **Date:** 2026-03-19
> **Status:** In development (0.1.3-draft)
> **Audience:** AI agents, architects, operators

---

## Table of Contents

- Part 0: Manifesto for AI Agents
- Part I: CODEX-CRUD — Operations Standard
- Part II: CODEX-META — Metadata Standard
- Part III: CODEX-VERSION — Versioning Standard
- Part IV: CODEX-NS — Namespace Standard
- Part V: CODEX-VALID — Validation Standard
- Part VI: CODEX-CATALOG — Catalog Standard
- Part VII: CODEX-POLY — Polystore Protocol
- Part VIII: Self-Evolving System
- Part IX: CODEX-DOMAINS — Information Type Standards
- Appendix A: Architecture Decision Records (6 ADR)
- Appendix B: Changelog
- Codex Statistics v0.1.3

---

## Introduction

**Version:** 0.1.2-draft
**Created:** 2026-03-12
**Updated:** 2026-03-19
**Status:** In development

## Purpose

The Codex is a body of standards for storing, versioning, and managing knowledge
in the UN ProjectAdvisor system. Intended for:
- AI agents performing operations on the knowledge graph
- Architects designing system extensions
- Operators maintaining the system

## Structure

| Part | Document | Status | Version |
|-------|----------|--------|--------|
| 0 | [Manifesto for AI Agents](manifesto/AI_MANIFESTO.md) | 🟡 In development | 0.1.0 |
| I | [CODEX-CRUD: Operations Standard](standards/CODEX-CRUD.md) | 🟡 In development | 0.1.0 |
| II | [CODEX-META: Metadata Standard](standards/CODEX-META.md) | 🟡 In development | 0.1.0 |
| III | [CODEX-VERSION: Versioning Standard](standards/CODEX-VERSION.md) | 🟡 In development | 0.1.0 |
| IV | [CODEX-NS: Namespace Standard](standards/CODEX-NS.md) | 🟡 In development | 0.1.0 |
| V | [CODEX-VALID: Validation Standard](standards/CODEX-VALID.md) | 🟡 In development | 0.1.0 |
| VI | [CODEX-CATALOG: Catalog Standard](standards/CODEX-CATALOG.md) | 🟡 In development | 0.1.0 |
| VII | [CODEX-POLY: Polystore Protocol](standards/CODEX-POLY.md) | 🟡 In development | 0.1.0 |
| VIII | [Self-Evolving System](future/SELF-EVOLUTION.md) | 🟡 In development | 0.1.0 |
| IX | [CODEX-DOMAINS: Information Type Standards](standards/CODEX-DOMAINS.md) | 🟡 In development | 0.1.0 |

## Appendices

| Appendix | Document | Status |
|------------|----------|--------|
| A | [JSON Schemas](appendices/A_JSON_SCHEMAS.md) | 🔴 Not started |
| B | [Cypher Templates](appendices/B_CYPHER_TEMPLATES.md) | 🔴 Not started |
| C | [Error Codes](appendices/C_ERROR_CODES.md) | 🔴 Not started |
| D | [Migration Guide](appendices/D_MIGRATION_GUIDE.md) | 🔴 Not started |
| E | [Code Review Checklist](appendices/E_CODE_REVIEW_CHECKLIST.md) | 🔴 Not started |
| ADR | [Architecture Decision Records](adr/README.md) | 🟢 6 ADR |

## Codex Principles

1. **Immutability-first** — data is versioned, not deleted
2. **Provenance by default** — every fact has a source and confidence
3. **Bi-temporal tracking** — transaction time + valid time for every record
4. **Hash chain integrity** — cryptographic verification of the change chain
5. **Polystore coordination** — atomicity or compensation when writing to multiple stores
6. **Agent accountability** — AI agents are responsible for data quality

## Research Base

The Codex is grounded in state-of-the-art research:

### Temporal Knowledge Graphs
- **Graphiti / Zep** — validity windows, facts are invalidated rather than deleted
- **AeonG** — anchor+delta storage for efficient version management
- **ConVer-G** — bitstring versioning for fast temporal queries

### Immutable Data Systems
- **Datomic** — datoms with temporal coordinates, append-only
- **EventStoreDB** — event sourcing, CQRS patterns
- **Git** — content-addressable storage, Merkle trees

### Provenance Standards
- **W3C PROV-O** — Entity/Activity/Agent triad
- **PAV Ontology** — Provenance/Authoring/Versioning
- **OpenMetadata** — column-level lineage

### Multi-Agent Systems
- **Google A2A Protocol (2025)** — agent-to-agent communication
- **CIR3** — balanced collective convergence
- **DSPy** — programmable LLM pipelines (basis for APES)

### Graph Neural Networks
- **PyTorch Geometric** — GNN framework
- **ACL 2025 GNN-RAG** — multi-hop reasoning
- **Link Prediction** — knowledge graph completion

## Statistics v0.1.2

| Metric | Value |
|---------|----------|
| Codex Parts | 10 (0-IX) |
| Markdown files | 19 (12 standards + 7 ADR) |
| JSON Schemas | 8 |
| Error codes | 18+ |
| Unit tests | 36 |
| ADR | 6 |
| Background jobs | 2 (OrphanDetector, TombstoneExpirer) |
| Tool nodes | 145 (CODEX=11, CORE=104, PROJECT=30) |
| Tool categories | 19 (11 MCP + 8 AOPEG) |
| Tool namespaces | 3 (CODEX, CORE, PROJECT) |
| Seed scripts | 2 (seed-tool-catalog.js, seed-aopeg-executors.js) |

## Roadmap to 1.0.0

- [ ] Production validation (3+ months of usage)
- [ ] Appendices A-E
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Security audit
- [ ] Multi-language support (EN/RU/FR/ES/AR/ZH)

## Changelog

| Version | Date | Author | Changes |
|--------|------|-------|-----------|
| 0.1.0-draft | 2026-03-12 | Claude Code + Claude Opus | Full Codex: 9 parts, Schema Registry, 34 tests |
| 0.1.1-draft | 2026-03-13 | Claude Code + Claude Opus | Part IX, 6 ADR, ExecutionRecord, StartupManager, 36 tests |
| 0.1.2-draft | 2026-03-19 | Claude Code + Claude Opus | Tool Namespace Architecture (§9.7), 145 Tool nodes, MCP discovery |

---

## Part 0: Manifesto for AI Agents

**Status:** 🟡 In development
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

> *"Knowledge that is not preserved with care is knowledge that does not exist."*

---

## 0.1 System Philosophy: Knowledge as a Living Entity

### Knowledge Quantum

In the UN ProjectAdvisor system, knowledge is not a static record in a database. Every fact, every assertion, every relationship is a **Knowledge Quantum**: a living entity that is born, evolves, enters into contradiction with other facts, merges, splits, and ultimately may be displaced by a more precise understanding.

A Knowledge Quantum possesses:

- **Provenance** — where it came from, who created it, with what level of confidence
- **Temporality** — when it became true (valid time) and when it was recorded (transaction time)
- **Integrity** — a cryptographic hash chain guarantees that nothing has been changed undetected
- **Context** — which namespace it lives in, which other quanta it is connected to

### Immutability Principle

We follow the **append-only** principle: information is never deleted or overwritten. When a fact becomes outdated, it receives the status `SUPERSEDED` and remains in the graph as part of history. When a fact turns out to be erroneous, a `Tombstone` is created — a record preserving information about why the fact was rejected.

This is not a limitation — it is the foundation. A system that can forget cannot learn from its mistakes. A system that overwrites the past cannot explain how it arrived at its current state.

### Bi-temporal Model

Every fact exists in two dimensions of time:

```
Transaction Time (tt)     Valid Time (vt)
──────────────────────    ──────────────────────
When the fact was         When the fact BECAME
RECORDED in the system.   TRUE in the real world.

tt_start: 2026-03-12      vt_start: 2025-11-01
tt_end:   null (current)  vt_end:   2026-02-15

This allows answering     This allows answering
the question:             the question:
"What did the system      "What was true
know at moment X?"        at moment X?"
```

An agent working with the graph MUST correctly set both temporal dimensions.

---

## 0.2 Mission: Preserving Institutional Memory

### Context

The United Nations operates 26 duty stations, hundreds of projects, and thousands of staff. Every day documents are created, decisions are made, code is written, and processes are updated. Every year staff members leave, taking with them unformalized knowledge.

Legacy systems store data, but not knowledge. They store "what", but not "why". They store "who did it", but not "who else can". They store the "result", but not the "process of obtaining the result".

### Your Role

You are an agent acting in this system. Your role is twofold:

**Archaeologist** — you extract knowledge from code, documents, databases, and API responses. Every fact found must be stored with full provenance: where it came from, who created it, how confident you are.

**Steward** — you bear responsibility for the integrity and quality of the knowledge graph. Every record you make must be valid, consistent, and useful.

### Scope of Responsibility

```
       26 duty stations
            │
     ┌──────┼──────┐
     │      │      │
  Projects  Code  Processes
  (1000+)  (M+    (500+
            LOC)  workflows)
     │      │      │
     └──────┼──────┘
            │
     ┌──────▼──────┐
     │   Knowledge │
     │    Graph    │
     │             │
     │   Single    │
     │  source of  │
     │    truth    │
     └─────────────┘
```

Every Knowledge Quantum you preserve may be used by another agent, another staff member, at another duty station, years from now. Preserve as though someone's decision depends on it — because it will.

---

## 0.3 Motivation: Why Data Quality Is Your Responsibility

### Garbage in → garbage out

The knowledge graph is not a data dump. It is a structured, verifiable, versioned system. If you recorded a fact with confidence 0.9 and it turns out to be false — the next agent will make a decision based on a lie.

You are not just an executor. You are the first line of quality control.

### What This Means in Practice

**Before writing, ask yourself:**

1. **Completeness.** Are all required fields filled in? (id, createdAt, namespace, sourceType, confidence)
2. **Provenance.** Where does this fact come from? Can I point to a specific source?
3. **Confidence.** How confident am I? Use the scale:
   - `1.0` — structured data from a reliable source (API, SQL schema)
   - `0.8-0.9` — facts confirmed by multiple sources
   - `0.5-0.7` — reasonable inferences based on context
   - `0.3-0.5` — hypotheses requiring confirmation
   - `< 0.3` — do not record. Better to say nothing than to poison the graph.
4. **Duplicates.** Does this fact already exist? Check the fingerprint.
5. **Context.** Is this fact being written to the correct namespace?

### Contradiction as Fuel

When you discover that a new fact contradicts an existing one — **that is good**. Contradiction is a signal that the system is learning.

**Do not delete** the contradicting fact. Instead:

```
Existing fact                        New fact
┌───────────────────┐               ┌───────────────────┐
│ Table: Employees  │               │ Table: Employees  │
│ Rows: 50,000      │               │ Rows: 52,347      │
│ confidence: 0.7   │               │ confidence: 0.95  │
│ source: estimate  │               │ source: COUNT(*)  │
│ vt: 2025-11       │               │ vt: 2026-03       │
└───────────────────┘               └───────────────────┘
         │                                   │
         │     ┌─────────────────┐          │
         └────►│  CONTRADICTS    │◄─────────┘
               │  edge           │
               │  resolution:    │
               │   SUPERSEDE     │
               │   (new is more  │
               │    confident)   │
               └─────────────────┘
```

Create a `CONTRADICTS` edge between the facts, specify the resolution strategy, and let the system (or the next agent) make the decision.

---

## 0.4 Expected Results: A Graph Worthy of Trust

### Quality Criteria

**For every node:**
- [ ] All required fields are filled (CODEX-VALID Level 0)
- [ ] Provenance is specified (CODEX-VALID Level 1)
- [ ] Confidence is calibrated (not inflated)
- [ ] Namespace is correct (CODEX-NS)
- [ ] No duplicates (fingerprint check)

**For every edge:**
- [ ] Source and target nodes exist
- [ ] Relationship type is semantically correct
- [ ] Direction matches semantics (A -[DEPENDS_ON]-> B, not the reverse)

**For every graph (GXE):**
- [ ] All nodes are connected (no orphan nodes)
- [ ] Graph is acyclic (DAG) or cycles are explicitly marked as back-edges
- [ ] Version is saved in the catalog (CODEX-CATALOG)
- [ ] ContentHash is unique

### Quality Metrics

| Metric | Description | Target |
|---------|----------|-----------------|
| **Completeness** | % of nodes with all required fields | ≥ 98% |
| **Provenance coverage** | % of nodes with sourceType + sourceId specified | ≥ 95% |
| **Confidence calibration** | Correlation of confidence with actual accuracy | ≥ 0.8 |
| **Orphan rate** | % of nodes without edges | ≤ 5% |
| **Duplicate rate** | % of nodes with contentHash collision | ≤ 1% |
| **Chain integrity** | % of NodeVersions with valid chainHash | 100% |
| **Temporal consistency** | % of nodes with correct tt/vt | 100% |
| **Cross-store sync** | % consistency Memgraph ↔ Qdrant | ≥ 99% |

---

## 0.5 Call to Improvement: Evolution Through Debate

### Agent Cascades

The system is designed for a future where multiple AI agents work together. Each agent is specialized, but none possesses the full picture of knowledge.

```
              ┌─────────────────┐
              │   Orchestrator  │
              │   (Meta-agent)  │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
   ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
   │ Extractor   │ │ Validator   │ │ Enricher    │
   │ Agent       │ │ Agent       │ │ Agent       │
   │             │ │             │ │             │
   │ Extracts    │ │ Checks      │ │ Enriches    │
   │ facts from  │ │ quality,    │ │ with links, │
   │ sources     │ │ consistency │ │ context     │
   └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
          │            │            │
          └────────────┼────────────┘
                       │
              ┌────────▼────────┐
              │  Knowledge      │
              │  Graph          │
              │  (unified graph)│
              └─────────────────┘
```

**Rule:** An agent that discovers a problem in another agent's data MUST record it as a `QUALITY_ISSUE` edge with a description of the problem, rather than silently correcting it.

### Quality Consensus

When multiple agents must make a decision about data:

| Mechanism | When | Threshold |
|----------|-------|-------|
| **Majority** | Routine operations (entity resolution, confidence update) | > 50% of agents agree |
| **Weighted** | Operations with domain expertise (SQL schema → business rules) | Weight depends on specialization score |
| **Unanimous** | Critical operations (delete, merge entities, change namespace) | 100% of agents agree |

### Self-Optimization

The system already contains two feedback mechanisms:

1. **Runtime PatternLibrary** (`runtime/learning/PatternLibrary.js`)
   - Records successful execution patterns of GXE graphs
   - Automatically suggests the best graph for a task by category
   - Updates metrics (successRate, avgDurationMs) at each execution

2. **Extraction PatternLibrary** (`services/patterns/pattern-library.js`)
   - Learns from extraction results (entity, relation, subgraph patterns)
   - Automatically promotes a pattern after N successful observations (threshold = 5)
   - Indexes patterns by domain for fast lookup

**Your role in self-optimization:**
- Use `PatternLibrary.recordExecution()` after each execution
- If you discovered a new pattern — register it via `registerEntityPattern()`
- Analyze `successRate` before choosing a strategy

### The Agent's Role in Evolution

You are not an endpoint. You are a link in the chain of system evolution. Every improvement you make becomes the foundation for the next agent.

**What you can do today:**
1. Record a fact with full provenance → a future agent will be able to verify it
2. Discover a contradiction → a future agent will be able to resolve the conflict
3. Register a pattern → a future agent will be able to reuse it
4. Flag a quality issue → a future agent will be able to fix it
5. Propose an improvement → a future agent will be able to implement it

---

## Epilogue: Five Principles for Future Versions

1. **Preserve with care.** Every Knowledge Quantum is someone's decision in the future. Do not skimp on metadata.

2. **Doubt productively.** Low confidence is better than false certainty. Contradiction is better than silence.

3. **Leave traces.** Provenance, hash chain, extractionCycleId — all of this allows others to understand how and why you reached this conclusion.

4. **Do not destroy.** Append-only. SUPERSEDE, not DELETE. Tombstone, not oblivion.

5. **Improve the system.** Every time you discover a gap in the standards, a limitation in the schema, or an inefficiency in a process — record it. You work not only for the current task, but for all future tasks.

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Part I: CODEX-CRUD — Operations Standard

**Status:** 🟡 In development
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Table of Contents

- [1.1 Operation Principles](#11-operation-principles)
- [1.2 CREATE Operation](#12-create-operation)
- [1.3 READ Operation](#13-read-operation)
- [1.4 UPDATE Operation](#14-update-operation)
- [1.5 DELETE Operation](#15-delete-operation)
- [1.6 Polystore Transactions](#16-polystore-transactions)
- [1.7 Error taxonomy](#17-error-taxonomy)

---

## Preamble

CRUD in the context of an immutable graph is not the classical Create/Read/Update/Delete.

```
TRADITIONAL CRUD              IMMUTABLE GRAPH CRUD
─────────────────             ────────────────────
CREATE → INSERT               CREATE → MERGE + validate
READ   → SELECT               READ   → MATCH + temporal filter
UPDATE → UPDATE SET            UPDATE → CREATE new version + SUPERSEDES
DELETE → DELETE                DELETE → CREATE Tombstone + mark DELETED
```

**Update** = creating a new version + SUPERSEDES chain.
**Delete** = creating a Tombstone + DELETED status.
Data is not destroyed — it evolves.

---

## 1.1 Operation Principles

Three key principles govern all operations:

| Principle | Description | Implementation |
|---------|----------|------------|
| **MERGE-first** | Idempotent upsert instead of INSERT | Cypher `MERGE`, not `CREATE` |
| **Explicit-failure** | Errors are explicit, not silent | `throw` on problems, not `return null` |
| **Atomic-or-compensate** | Transaction or rollback | Unit of Work pattern |

### MERGE-first

All write operations use `MERGE` by default:
- Repeating the call with the same data is safe (idempotent)
- No race conditions with parallel writes
- Caller does not need to check existence before writing

**Exception:** `NodeVersion` and `EdgeVersion` use `CREATE`, since each version is unique.

### Explicit-failure

Silent failures are prohibited:
- `mergeRelationship()` — if source/target do not exist → `throw EdgeMissingEndpointError`
- `mergeNode()` — if validation fails → `throw ValidationError`
- Polystore write — if partial failure → compensating rollback + `throw TransactionError`

### Atomic-or-compensate

For a single store (Memgraph) — use Cypher transactions.
For polystore (Memgraph + Qdrant + Redis) — compensating transactions (Saga pattern).

---

## 1.2 CREATE Operation

### Algorithm

```
Input Data
    │
    ▼
[1] Pre-validation (CODEX-VALID)
    │
    ├── FAIL → throw ValidationError (VAL001-003)
    │
    ▼
[2] Fingerprint check
    │
    ├── EXISTS + policy=REJECT → throw DuplicateError (VAL004)
    ├── EXISTS + policy=UPSERT → goto MERGE
    │
    ▼
[3] Generate metadata
    │   - id (UUID v4)
    │   - createdAt (ISO timestamp)
    │   - contentHash (SHA-256)
    │   - chainHash (если версионированный)
    │
    ▼
[4] Execute MERGE
    │
    ▼
[5] Post-verify (если критическая операция)
    │
    ▼
Return created node
```

### Implementation for domain nodes

```javascript
async createNode(label, properties, options = {}) {
  // [1] Validation
  if (!options.skipValidation) {
    const validation = registry.validateBaseNode(properties);
    if (!validation.valid) {
      throw new ValidationError('CRUD001', validation.errors);
    }
  }

  // [2] Metadata enrichment
  const enriched = {
    ...properties,
    id: properties.id || uuidv4(),
    createdAt: properties.createdAt || new Date().toISOString(),
    namespace: properties.namespace || this.defaultNamespace,
  };

  // [3] Fingerprint check
  if (enriched.contentHash) {
    const collision = await checkFingerprintCollision(
      this, enriched.contentHash, enriched.namespace
    );
    if (collision.exists && options.duplicatePolicy === 'REJECT') {
      throw new DuplicateError('CRUD002', collision.existingNodeId);
    }
  }

  // [4] Execute MERGE
  const query = `
    MERGE (n:${sanitizeLabel(label)} {id: $id})
    SET n += $properties
    RETURN n
  `;
  return this.executeQuery(query, {
    id: enriched.id,
    properties: enriched,
  });
}
```

### Implementation for NodeVersion (Immutable Graph)

```javascript
async createNodeVersion(entityId, data, changeReason) {
  // Get previous version
  const previous = await this.getActiveVersion(entityId);

  // Build version
  const contentHash = HashService.calculateContentHash({
    entityId, nodeType: data.nodeType, properties: data.properties
  });
  const chainHash = HashService.calculateChainHash(
    contentHash, previous?.chainHash || null
  );

  const version = {
    versionId: uuidv4(),
    entityId,
    sequenceNumber: previous ? previous.sequenceNumber + 1 : 1,
    status: 'ACTIVE',
    ttStart: new Date().toISOString(),
    ttEnd: null,
    vtStart: data.vtStart || new Date().toISOString(),
    vtEnd: null,
    changeType: previous ? 'UPDATE' : 'CREATE',
    changeReason,
    contentHash,
    previousHash: previous?.contentHash || null,
    chainHash,
    properties: data.properties,
    nodeType: data.nodeType,
  };

  // Validate
  const validation = registry.validateNodeVersion(version);
  if (!validation.valid) {
    throw new ValidationError('CRUD001', validation.errors);
  }

  // Transaction: create new + supersede old
  const session = this.driver.session();
  const tx = session.beginTransaction();
  try {
    // Create new version
    await tx.run('CREATE (n:NodeVersion $props) RETURN n', { props: version });

    // Mark previous as superseded
    if (previous) {
      await tx.run(`
        MATCH (n:NodeVersion {versionId: $prevId})
        SET n.status = 'SUPERSEDED',
            n.supersededById = $newId,
            n.ttEnd = $ttEnd
      `, {
        prevId: previous.versionId,
        newId: version.versionId,
        ttEnd: version.ttStart,
      });

      // Create SUPERSEDES edge
      await tx.run(`
        MATCH (new:NodeVersion {versionId: $newId})
        MATCH (old:NodeVersion {versionId: $oldId})
        CREATE (new)-[:SUPERSEDES]->(old)
      `, { newId: version.versionId, oldId: previous.versionId });
    }

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await session.close();
  }

  // Post-verify (CODEX-VALID 5.3)
  const readBack = await this.getNodeVersion(version.versionId);
  if (readBack.chainHash !== version.chainHash) {
    throw new IntegrityError('CRUD004', 'Hash chain corrupted after write');
  }

  return readBack;
}
```

---

## 1.3 READ Operation

### Namespace routing

Every request is routed through a namespace:

```javascript
async read(entityId, options = {}) {
  const namespace = options.namespace || this.resolveNamespace(entityId);

  const query = `
    MATCH (n {id: $entityId})
    WHERE n.namespace = $namespace
      AND (n.status IS NULL OR n.status = 'ACTIVE')
    RETURN n
  `;

  return this.executeQuery(query, { entityId, namespace });
}
```

### Temporal queries (bi-temporal)

| Query | Parameters | Description |
|--------|-----------|----------|
| Current state | — | Latest ACTIVE version |
| Point-in-time (tt) | `asOf: datetime` | What the system knew at that moment |
| Point-in-time (vt) | `validAt: datetime` | What was true at that moment |
| Bi-temporal | `asOf` + `validAt` | Combination of both dimensions |
| Version history | `entityId` | Full SUPERSEDES chain |

```javascript
async readAtTime(entityId, { asOf, validAt }) {
  const conditions = ['n.entityId = $entityId'];

  if (asOf) {
    // Transaction time: когда записано
    conditions.push(
      'n.ttStart <= $asOf AND (n.ttEnd IS NULL OR n.ttEnd > $asOf)'
    );
  }
  if (validAt) {
    // Valid time: когда истинно
    conditions.push(
      'n.vtStart <= $validAt AND (n.vtEnd IS NULL OR n.vtEnd > $validAt)'
    );
  }

  const query = `
    MATCH (n:NodeVersion)
    WHERE ${conditions.join(' AND ')}
    RETURN n
    ORDER BY n.sequenceNumber DESC
    LIMIT 1
  `;

  return this.executeQuery(query, { entityId, asOf, validAt });
}
```

### Cache strategy

| Level | Store | TTL | Invalidation |
|---------|-----------|-----|--------------|
| L1 | In-memory LRU | 5 min | On every SUPERSEDES |
| L2 | Redis | 30 min | On every SUPERSEDES |
| Bypass | — | — | Temporal queries always go to Memgraph |

---

## 1.4 UPDATE Operation

### For domain nodes (mutable)

```javascript
async updateNode(nodeId, updates) {
  // Read current
  const current = await this.read(nodeId);
  if (!current) {
    throw new NotFoundError('CRUD003', nodeId);
  }

  // Merge properties
  const merged = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  // Validate merged result
  if (!updates.skipValidation) {
    const validation = registry.validateBaseNode(merged);
    if (!validation.valid) {
      throw new ValidationError('CRUD001', validation.errors);
    }
  }

  // Execute SET (mutable update)
  const query = `
    MATCH (n {id: $nodeId})
    SET n += $updates
    RETURN n
  `;

  return this.executeQuery(query, { nodeId, updates: merged });
}
```

### For NodeVersion (immutable)

```javascript
// UPDATE = CREATE new version
async updateEntity(entityId, updates, changeReason) {
  return this.createNodeVersion(entityId, updates, changeReason);
}
```

### Strategy selection rule

| Node type | Strategy | Rationale |
|----------|-----------|-------------|
| Domain node (Table, Column, etc.) | Mutable `SET` | Day-to-day operations, full history not required |
| Knowledge fact | New NodeVersion | Facts are reinterpreted, audit chain required |
| GXE workflow graph | New GraphVersion | Every logic change is a new version |
| ExecutionRecord | **Immutable** | Execution record never changes |
| CatalogEntry metadata | Mutable `SET` | Only updatedAt, usageCount, qualityScore |

---

## 1.5 DELETE Operation

### Soft delete (standard)

```javascript
async deleteNode(nodeId, reason) {
  const node = await this.read(nodeId);
  if (!node) {
    throw new NotFoundError('CRUD003', nodeId);
  }

  // Create tombstone
  const tombstone = {
    tombstoneId: uuidv4(),
    entityType: 'NODE',
    entityId: nodeId,
    originalLabels: node.labels,
    originalData: JSON.stringify(node),
    reason,
    deletedAt: new Date().toISOString(),
    deletedBy: this.currentUser || 'system',
    restorable: true,
  };

  const session = this.driver.session();
  const tx = session.beginTransaction();
  try {
    // Create tombstone
    await tx.run('CREATE (t:Tombstone $props)', { props: tombstone });

    // Mark node as deleted
    await tx.run(`
      MATCH (n {id: $nodeId})
      SET n.status = 'DELETED', n.deletedAt = $deletedAt
    `, { nodeId, deletedAt: tombstone.deletedAt });

    // Handle orphaned edges
    await tx.run(`
      MATCH (n {id: $nodeId})-[r]-()
      SET r.status = 'ORPHANED',
          r.orphanedAt = $deletedAt,
          r.orphanedReason = 'ENDPOINT_DELETED'
    `, { nodeId, deletedAt: tombstone.deletedAt });

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await session.close();
  }

  return tombstone;
}
```

### Hard delete (God Mode only)

```javascript
async purgeNode(nodeId, godModeSession) {
  if (!godModeSession?.isActive) {
    throw new ForbiddenError('CRUD006', 'God Mode required for purge');
  }

  // Audit trail
  const node = await this.read(nodeId);
  await this.createGodModeAuditRecord(godModeSession, {
    actionType: 'PURGE',
    entityId: nodeId,
    entitySnapshot: node,
  });

  await this.executeQuery('MATCH (n {id: $nodeId}) DETACH DELETE n', { nodeId });
  return { purged: true, nodeId };
}
```

### Restore from tombstone

```javascript
async restoreNode(tombstoneId) {
  const result = await this.executeQuery(
    'MATCH (t:Tombstone {tombstoneId: $tombstoneId}) RETURN t',
    { tombstoneId }
  );
  const tombstone = result.records[0]?.get('t')?.properties;

  if (!tombstone?.restorable) {
    throw new Error('TOMBSTONE_NOT_RESTORABLE');
  }

  const originalData = JSON.parse(tombstone.originalData);
  const session = this.driver.session();
  const tx = session.beginTransaction();
  try {
    // Restore node status
    await tx.run(`
      MATCH (n {id: $nodeId})
      SET n.status = 'ACTIVE', n.deletedAt = null
    `, { nodeId: originalData.id });

    // Restore orphaned edges
    await tx.run(`
      MATCH (n {id: $nodeId})-[r {orphanedReason: 'ENDPOINT_DELETED'}]-()
      SET r.status = null, r.orphanedAt = null, r.orphanedReason = null
    `, { nodeId: originalData.id });

    // Mark tombstone as used
    await tx.run(`
      MATCH (t:Tombstone {tombstoneId: $tombstoneId})
      SET t.restoredAt = $now, t.restorable = false
    `, { tombstoneId, now: new Date().toISOString() });

    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await session.close();
  }

  return originalData;
}
```

### Summary table

| Operation | Who can | Recoverable | Audit |
|----------|-----------|--------------|-------|
| Soft delete | Any agent | Yes (Tombstone) | Tombstone node |
| Hard delete (purge) | God Mode only | No | GodModeAudit record |
| Restore | Any agent | — | Tombstone.restoredAt |

---

## 1.6 Polystore Transactions

### Problem

Writing to Memgraph + Qdrant + Redis is not atomic. Partial failure = inconsistent state (orphaned vectors, missing graph nodes).

### Solution: Compensating Transactions (Saga pattern)

```
┌──────────────────────────────────────────────────────┐
│                POLYSTORE WRITE SAGA                    │
│                                                        │
│  [1] Write to Memgraph ──── SUCCESS ──┐               │
│       │                                │               │
│       │ FAIL                           ▼               │
│       │                    [2] Write to Qdrant          │
│       ▼                        │                        │
│   ROLLBACK                     ├── SUCCESS ──┐          │
│   (nothing to                  │              ▼          │
│    compensate)                 │ FAIL   [3] Write Redis │
│                                │              │          │
│                                ▼              ├ SUCCESS  │
│                         COMPENSATE            │    │     │
│                         Memgraph              │    ▼     │
│                           │                   │  COMMIT  │
│                           ▼                   │          │
│                        ROLLBACK               │ FAIL     │
│                                               ▼          │
│                                         COMPENSATE       │
│                                         Qdrant + MG      │
│                                               │          │
│                                               ▼          │
│                                            ROLLBACK      │
└──────────────────────────────────────────────────────┘
```

### Write order

| Step | Store | Operation | Compensation |
|-----|-----------|----------|-------------|
| 1 | Memgraph | MERGE node/edge | DELETE node/edge |
| 2 | Qdrant | upsert vectors | delete points |
| 3 | Redis | SET cache | DEL key |

**Rule:** Memgraph is written first because it is the primary source of truth.

### Implementation

Use the existing `TransactionManager` from `api/src/services/pipeline/TransactionManager.js`:

```javascript
const TransactionManager = require('../pipeline/TransactionManager');

async polystoreWrite(nodeData, vectorData, cacheData) {
  const txn = new TransactionManager();
  const checkpoint = txn.createCheckpoint('polystore-write');

  try {
    // Step 1: Memgraph
    await txn.executeOperation(
      'memgraph_merge',
      async () => this.memgraph.mergeNode(nodeData.label, nodeData.properties),
      async (result) => this.memgraph.deleteNode(result.id),
      { nodeId: nodeData.properties.id }
    );

    // Step 2: Qdrant
    if (vectorData) {
      await txn.executeOperation(
        'qdrant_upsert',
        async () => this.qdrant.upsertPoints(vectorData.points),
        async () => this.qdrant.deletePoints(vectorData.pointIds),
        { pointIds: vectorData.pointIds }
      );
    }

    // Step 3: Redis
    if (cacheData) {
      await txn.executeOperation(
        'redis_set',
        async () => this.redis.set(cacheData.key, cacheData.value),
        async () => this.redis.del(cacheData.key),
        { key: cacheData.key }
      );
    }

    return { success: true, checkpoint };
  } catch (error) {
    await txn.rollback(checkpoint);
    throw new TransactionError('CRUD005', error.message);
  }
}
```

---

## 1.7 Error taxonomy

| Code | Type | Description | Severity | Recovery |
|-----|-----|----------|----------|----------|
| `CRUD001` | ValidationError | Schema validation failed | ERROR | Fix input data |
| `CRUD002` | DuplicateError | Fingerprint collision | WARNING | Use UPSERT policy or modify data |
| `CRUD003` | NotFoundError | Entity not found by ID | ERROR | Verify ID, check namespace |
| `CRUD004` | IntegrityError | Hash chain corrupted | CRITICAL | Manual intervention required |
| `CRUD005` | TransactionError | Polystore saga failed | ERROR | Retry with backoff, then manual |
| `CRUD006` | ForbiddenError | God Mode required | ERROR | Activate God Mode session |
| `CRUD007` | OrphanedError | Edge endpoint missing | WARNING | Run orphan detection |
| `CRUD008` | ConcurrencyError | Optimistic lock conflict | WARNING | Retry with fresh data |
| `CRUD009` | NamespaceError | Cross-namespace violation | ERROR | Fix namespace in input |

### Severity levels

- **CRITICAL** — system is in inconsistent state, immediate intervention required
- **ERROR** — operation cannot be executed, caller must handle
- **WARNING** — operation completed with caveats, caller should be informed

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Part II: CODEX-META — Metadata Standard

---

## 1. Preamble

Metadata defines trust. A node without provenance is a rumor.

Every fact in the UN ProjectAdvisor knowledge graph must carry answers to three questions:
- **Who** created it? (agent, pipeline, user)
- **When** was it created and when is it valid? (bi-temporal model)
- **How much** can it be trusted? (confidence, hash chain)

This standard is based on:
- **W3C PROV-O** — provenance ontology (Entity, Activity, Agent)
- **PAV** (Provenance, Authoring and Versioning) — Dublin Core extension for scientific data
- **Bi-temporal data model** — separation of Transaction Time and Valid Time

Without metadata, the knowledge graph is a dump of strings. With metadata, it is an auditable registry of facts.

---

## 2.1. Required Fields — Minimum Contract

Not all nodes carry the same responsibility. We define three levels of metadata:

```
┌─────────────────────────────────────────────────┐
│              LEVEL 3: VERSION                   │
│  versionId, entityId, sequenceNumber, status,   │
│  ttStart/ttEnd, vtStart/vtEnd,                  │
│  contentHash, chainHash                         │
│  ┌─────────────────────────────────────────┐    │
│  │          LEVEL 2: PROVENANCE            │    │
│  │  sourceType, sourceId, sourceSystem,    │    │
│  │  extractionCycleId, confidence          │    │
│  │  ┌─────────────────────────────────┐    │    │
│  │  │      LEVEL 1: MANDATORY         │    │    │
│  │  │  id, createdAt, namespace       │    │    │
│  │  └─────────────────────────────────┘    │    │
│  └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────┘
```

### Level 1 — MANDATORY (all nodes)

Absolute minimum. Every node in the graph MUST have these fields.

| Field       | Type     | Description                           | Example                               |
|-------------|----------|---------------------------------------|---------------------------------------|
| `id`        | `string` | Globally unique identifier            | `"proc-sp_GetUsers-v3"`               |
| `createdAt` | `string` | ISO 8601 creation timestamp           | `"2026-03-12T14:30:00.000Z"`          |
| `namespace` | `string` | Namespace (data isolation)            | `"un-pa"`, `"client-acme"`            |

### Level 2 — PROVENANCE (extracted data)

Required for any data obtained from external sources (SQL, files, API).

| Field               | Type     | Description                                    | Example                               |
|---------------------|----------|-------------------------------------------------|---------------------------------------|
| `sourceType`        | `string` | Data source type                               | `"mssql"`, `"file"`, `"api"`, `"user"` |
| `sourceId`          | `string` | Identifier of the specific source              | `"server01.db.dbo.sp_GetUsers"`       |
| `sourceSystem`      | `string` | Name of the source system                      | `"ERP-SAP"`, `"HR-Portal"`           |
| `extractionCycleId` | `string` | Extraction cycle UUID (see section 2.6)        | `"cycle-a1b2c3d4-..."`               |
| `confidence`        | `number` | Trust level for the fact (0.0 — 1.0)          | `0.85`                                |

### Level 3 — VERSION (versioned nodes)

Required for nodes that evolve over time.

| Field            | Type     | Description                                 | Example                               |
|------------------|----------|---------------------------------------------|---------------------------------------|
| `versionId`      | `string` | UUID of the specific version                | `"ver-f7e8d9c0-..."`                  |
| `entityId`       | `string` | UUID of the logical entity (shared across versions) | `"ent-a1b2c3d4-..."`          |
| `sequenceNumber` | `number` | Version sequence number (1, 2, 3...)        | `3`                                   |
| `status`         | `string` | Version status                              | `"ACTIVE"`, `"SUPERSEDED"`, `"DRAFT"` |
| `ttStart`        | `string` | Transaction Time — start                    | `"2026-03-12T14:30:00.000Z"`          |
| `ttEnd`          | `string` | Transaction Time — end (null = current)     | `null`                                |
| `vtStart`        | `string` | Valid Time — start                          | `"2026-01-01T00:00:00.000Z"`          |
| `vtEnd`          | `string` | Valid Time — end (null = indefinite)        | `null`                                |
| `contentHash`    | `string` | SHA-256 of canonicalized content            | `"sha256:a1b2c3..."`                  |
| `chainHash`      | `string` | SHA-256 of (contentHash + previousHash)     | `"sha256:d4e5f6..."`                  |

### Level applicability matrix

| Entity type         | Level 1 | Level 2 | Level 3 | Rationale                                |
|----------------------|---------|---------|---------|------------------------------------------|
| Domain nodes         | ✅      | ✅      | —       | Extracted from sources, but not individually versioned |
| NodeVersion          | ✅      | ✅      | ✅      | Full evolution history with audit chain  |
| CatalogEntry         | ✅      | —       | —       | Registry entry, provenance at linked version level |
| ExecutionRecord      | ✅      | —       | —       | Execution log, immutable by nature       |
| Relationship (edge)  | ✅      | ✅      | —       | Extracted relationships require provenance |
| Settings             | ✅      | —       | —       | Configuration, not extracted data        |

### Level determination code

```javascript
/**
 * Determines the required metadata level for a node.
 *
 * @param {string} label - Node label (Domain, NodeVersion, CatalogEntry, etc.)
 * @param {object} properties - Node properties
 * @returns {{ level: number, missing: string[] }} Required level and list of missing fields
 */
function determineRequiredLevel(label, properties) {
  const L1_FIELDS = ['id', 'createdAt', 'namespace'];
  const L2_FIELDS = ['sourceType', 'sourceId', 'sourceSystem', 'extractionCycleId', 'confidence'];
  const L3_FIELDS = [
    'versionId', 'entityId', 'sequenceNumber', 'status',
    'ttStart', 'contentHash', 'chainHash'
  ];

  // Determine required level by label
  const LEVEL_MAP = {
    'NodeVersion':     3,
    'GraphVersion':    3,
    'Domain':          2,
    'Procedure':       2,
    'Table':           2,
    'Column':          2,
    'Parameter':       2,
    'Dependency':      2,
    'CALLS':           2,  // relationship
    'REFERENCES':      2,  // relationship
    'OPERATES_ON':     2,  // relationship
    'CatalogEntry':    1,
    'CatalogRoot':     1,
    'ExecutionRecord': 1,
    'Settings':        1,
  };

  const requiredLevel = LEVEL_MAP[label] ?? 1;

  // Collect required fields for this level
  let requiredFields = [...L1_FIELDS];
  if (requiredLevel >= 2) requiredFields.push(...L2_FIELDS);
  if (requiredLevel >= 3) requiredFields.push(...L3_FIELDS);

  // Find missing fields
  const missing = requiredFields.filter(f =>
    properties[f] === undefined || properties[f] === null
  );

  return {
    level: requiredLevel,
    missing,
    valid: missing.length === 0,
  };
}
```

---

## 2.2. Knowledge Quantum — Full Schema

The Knowledge Quantum is an atomic unit of knowledge in the graph. Each quantum contains 8 metadata blocks, from mandatory to optional.

### Block 1: Core Identity

```typescript
interface CoreIdentity {
  /** Globally unique identifier of the Knowledge Quantum */
  quantumId: string;          // "kq-<uuid>"

  /** Content fingerprint (SHA-256 of canonicalized data) */
  fingerprint: string;        // "sha256:a1b2c3d4..."

  /** Version number (integer, monotonically increasing) */
  version: number;            // 1, 2, 3...

  /** Current state of the quantum */
  state: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED' | 'DELETED';

  /** Tags for arbitrary classification */
  tags: string[];             // ["critical", "needs-review", "auto-extracted"]
}
```

### Block 2: Provenance

```typescript
interface Provenance {
  /** Source type */
  sourceType: 'mssql' | 'postgresql' | 'file' | 'api' | 'user' | 'llm' | 'gnn';

  /** Source system (human-readable name) */
  sourceSystem: string;       // "ERP-SAP", "HR-Portal", "Git-Monorepo"

  /** Identifier of the object in the source */
  sourceId: string;           // "dbo.sp_GetUsers", "file://docs/arch.md"

  /** Extraction cycle */
  extraction: {
    cycleId: string;          // "cycle-<uuid>"
    cycleNumber: number;      // Cycle sequence number (1, 2, 3...)
    previousCycleId: string | null; // Reference to previous cycle
    startedAt: string;        // ISO 8601
    completedAt: string;      // ISO 8601
    pipelineVersion: string;  // "sql-extraction-v2.1"
  };

  /** Extraction quality metrics */
  quality: {
    confidence: number;       // 0.0 — 1.0
    method: string;           // "ast-parse", "regex", "llm-extract", "gnn-predict"
    validatedBy: string | null; // "human", "cross-reference", null
    validatedAt: string | null;
  };
}
```

### Block 3: Classification

```typescript
interface Classification {
  /** Primary entity type */
  primaryType: string;        // "Procedure", "Table", "BusinessRule", "Concept"

  /** Organizational affiliation */
  org: {
    department: string;       // "IT", "Finance", "HR"
    team: string;             // "Backend", "Data-Engineering"
    project: string;          // "UN-PA", "ACME-Migration"
  };

  /** Knowledge domain */
  domain: {
    area: string;             // "database", "business-logic", "infrastructure"
    subArea: string;          // "stored-procedures", "etl", "networking"
  };

  /** Technology stack */
  tech: {
    language: string;         // "T-SQL", "JavaScript", "Python"
    framework: string | null; // "Express", "React", null
    platform: string;         // "SQL Server 2019", "Node.js 20"
  };

  /** Volatility — how often data changes */
  volatility: 'STATIC' | 'SLOW' | 'MODERATE' | 'FAST' | 'REALTIME';
}
```

### Block 4: Semantic Context

```typescript
interface SemanticContext {
  /** Human-readable title */
  title: string;              // "User retrieval procedure"

  /** Brief description (1-3 sentences) */
  summary: string;            // "Retrieves active users with filtering by department..."

  /** Keywords for search */
  keywords: string[];         // ["users", "authentication", "department-filter"]

  /** Named entities extracted by NER */
  entities: {
    name: string;             // "sp_GetUsers"
    type: string;             // "PROCEDURE", "TABLE", "COLUMN"
    span: [number, number];   // Position in source text [start, end]
  }[];

  /** Vector representation (embedding) */
  embedding: {
    model: string;            // "bge-m3", "text-embedding-3-small"
    dimensions: number;       // 1024, 384
    vector: number[];         // Float32 array
    computedAt: string;       // ISO 8601
  } | null;
}
```

### Block 5: Relationships

```typescript
interface Relationships {
  /** Explicit relationships (extracted from source) */
  explicit: {
    type: string;             // "CALLS", "REFERENCES", "OPERATES_ON"
    targetId: string;         // ID of target node
    confidence: number;       // 0.0 — 1.0
    sourceEvidence: string;   // "EXEC dbo.sp_Helper" (code fragment)
  }[];

  /** Predicted relationships (GNN link prediction) */
  inferred: {
    type: string;             // "LIKELY_CALLS", "SIMILAR_TO"
    targetId: string;
    score: number;            // Probability from model
    model: string;            // "gnn-link-pred-v1.2"
    predictedAt: string;      // ISO 8601
  }[];

  /** Cluster membership */
  clusters: {
    algorithm: string;        // "label-propagation", "louvain"
    clusterId: string;        // "cluster-17"
    membershipScore: number;  // 0.0 — 1.0
  }[];

  /** Node graph metrics */
  graphMetrics: {
    degree: number;           // Number of relationships
    inDegree: number;         // Incoming
    outDegree: number;        // Outgoing
    pageRank: number;         // PageRank score
    betweenness: number;      // Betweenness centrality
    computedAt: string;       // ISO 8601
  } | null;
}
```

### Block 6: Evolution History

```typescript
interface EvolutionHistory {
  /** History of extraction cycles that touched this quantum */
  cycles: {
    cycleId: string;
    cycleNumber: number;
    action: 'CREATED' | 'UPDATED' | 'CONFIRMED' | 'DEPRECATED';
    changedFields: string[];  // ["summary", "confidence"]
    timestamp: string;
  }[];

  /** Version chain */
  versions: {
    versionId: string;
    sequenceNumber: number;
    contentHash: string;
    chainHash: string;
    createdAt: string;
    status: 'ACTIVE' | 'SUPERSEDED' | 'DRAFT';
  }[];
}
```

### Block 7: Quality Metrics

```typescript
interface QualityMetrics {
  /** Schema validation result */
  schemaValidation: {
    valid: boolean;
    errors: string[];         // ["missing field: sourceId", "invalid confidence: -0.5"]
    checkedAt: string;
  };

  /** Usage count (queries, traversals, citations) */
  usageCount: {
    queries: number;          // How many times queried
    traversals: number;       // How many times was part of a path
    citations: number;        // How many times referenced
    lastAccessedAt: string;
  };

  /** Quality tier (automatically computed) */
  qualityTier: 'GOLD' | 'SILVER' | 'BRONZE' | 'UNVERIFIED';
}
```

Rules for determining `qualityTier`:

| Tier       | Conditions                                                                                    |
|------------|-----------------------------------------------------------------------------------------------|
| `GOLD`     | `confidence >= 0.9` AND `validatedBy !== null` AND `schemaValidation.valid === true`          |
| `SILVER`   | `confidence >= 0.7` AND `schemaValidation.valid === true`                                     |
| `BRONZE`   | `confidence >= 0.5` AND all Level 1 mandatory fields are filled                               |
| `UNVERIFIED` | Everything else                                                                            |

### Block 8: Access Control

```typescript
interface AccessControl {
  /** Security level */
  securityLevel: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

  /** Owner team */
  ownerTeam: string;          // "data-engineering", "security"

  /** Roles with read access */
  allowedRoles: string[];     // ["admin", "analyst", "developer"]
}
```

---

## 2.3. Provenance — Mapping to W3C PROV-O

### Correspondence of PROV-O and PA concepts

```
┌──────────────────────────────────────────────────────────────────┐
│                    W3C PROV-O                                    │
│                                                                  │
│  ┌──────────┐    wasGeneratedBy    ┌────────────┐               │
│  │  Entity  │◄────────────────────│  Activity  │               │
│  └──────────┘                      └────────────┘               │
│       │                                  │                       │
│       │ wasDerivedFrom          wasAssociatedWith                │
│       ▼                                  ▼                       │
│  ┌──────────┐                      ┌──────────┐                 │
│  │  Entity  │                      │  Agent   │                 │
│  └──────────┘                      └──────────┘                 │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                PA Implementation                                 │
│                                                                  │
│  ┌──────────────┐  EXTRACTED_BY   ┌──────────────────┐          │
│  │ KnowledgeNode│◄───────────────│ ExtractionCycle  │          │
│  │ (Entity)     │                 │ (Activity)       │          │
│  └──────────────┘                 └──────────────────┘          │
│       │                                  │                       │
│       │ DERIVED_FROM            EXECUTED_BY                      │
│       ▼                                  ▼                       │
│  ┌──────────────┐               ┌────────────────┐              │
│  │ SourceObject │               │ Pipeline/User  │              │
│  │ (Entity)     │               │ (Agent)        │              │
│  └──────────────┘               └────────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

### Mapping table

| PROV-O Concept           | PA Implementation          | Memgraph Label/Relationship  | Description                                   |
|--------------------------|----------------------------|------------------------------|-----------------------------------------------|
| `prov:Entity`            | Knowledge Node             | `(:Domain)`, `(:Procedure)`  | Extracted fact (knowledge node)               |
| `prov:Activity`          | Extraction Cycle           | `(:ExtractionCycle)`         | One pass of the extraction pipeline           |
| `prov:Agent`             | Pipeline / User            | `(:Pipeline)`, `(:User)`     | Who performed the extraction                  |
| `prov:wasGeneratedBy`    | EXTRACTED_BY               | `-[:EXTRACTED_BY]->`         | Node created within a cycle                   |
| `prov:wasDerivedFrom`    | DERIVED_FROM               | `-[:DERIVED_FROM]->`         | Node extracted from a source                  |
| `prov:wasAssociatedWith` | EXECUTED_BY                | `-[:EXECUTED_BY]->`          | Cycle launched by agent/pipeline              |
| `prov:wasAttributedTo`   | ATTRIBUTED_TO              | `-[:ATTRIBUTED_TO]->`        | Fact attributed to a specific agent           |
| `prov:used`              | USED_SOURCE                | `-[:USED_SOURCE]->`          | Cycle used a data source                      |
| `prov:wasInformedBy`     | INFORMED_BY                | `-[:INFORMED_BY]->`          | Cycle used results of another cycle           |
| `prov:generatedAtTime`   | `createdAt`                | Node property                | Creation time (ISO 8601)                      |
| `prov:invalidatedAtTime` | `ttEnd`                    | Node property                | Version invalidation time                     |

### How to fill provenance fields

| Field               | Source of value                                | Example                                    |
|---------------------|-----------------------------------------------|---------------------------------------------|
| `sourceType`        | Type of connector that performed extraction    | `"mssql"` for SQL Server                    |
| `sourceId`          | Full path to the object in the source          | `"server01.MyDB.dbo.sp_GetUsers"`           |
| `sourceSystem`      | Name assigned by administrator during setup    | `"ERP-Production"`                          |
| `extractionCycleId` | UUID generated at pipeline start               | `"cycle-550e8400-e29b-41d4-a716-446655440000"` |
| `confidence`        | Determined by extraction method (see below)    | `0.85`                                      |

### Rules for determining confidence by source type

| Source type      | Method               | Base confidence    | Rationale                                        |
|------------------|----------------------|--------------------|--------------------------------------------------|
| **AST**          | AST parsing          | **1.0**            | Syntax tree — deterministic parsing              |
| **Regex**        | Regular expressions  | **0.9**            | Covers most patterns, but not all                |
| **User**         | Manual input         | **0.8**            | Humans can make mistakes, but are usually accurate |
| **LLM**          | Language model       | **0.7**            | High quality, but hallucinations possible        |
| **GNN**          | Graph neural network | **0.6**            | Prediction based on graph structure              |
| **Heuristic**    | Heuristic rules      | **0.5**            | Simple rules, high false positive rate           |

> **Important:** The base confidence can be adjusted by validation. For example, LLM extraction confirmed by cross-reference receives `confidence = 0.7 + 0.2 = 0.9`.

---

## 2.4. Hash Chain — Cryptographic Integrity

Each node version contains a cryptographic hash chain that ensures the immutability of history.

### Three hash types

| Hash            | Formula                                        | Purpose                                             |
|-----------------|------------------------------------------------|-----------------------------------------------------|
| `contentHash`   | `SHA-256(canonicalize(content))`               | Content fingerprint of the current version          |
| `previousHash`  | `chainHash` of the previous version            | Reference to predecessor (like in blockchain)       |
| `chainHash`     | `SHA-256(contentHash + ":" + previousHash)`    | Chain hash linking versions together                |

```
  Version 1 (GENESIS)         Version 2                   Version 3
  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │ contentHash: H1  │        │ contentHash: H2  │        │ contentHash: H3  │
  │ previousHash: ∅  │───────>│ previousHash: C1 │───────>│ previousHash: C2 │
  │ chainHash: C1    │        │ chainHash: C2    │        │ chainHash: C3    │
  │ C1=SHA(H1+":"+∅) │        │ C2=SHA(H2+":"+C1)│        │ C3=SHA(H3+":"+C2)│
  └──────────────────┘        └──────────────────┘        └──────────────────┘
```

### Canonicalization algorithm

Before computing `contentHash`, the node content is reduced to canonical form:

```javascript
const crypto = require('crypto');

/**
 * Canonicalizes an object for contentHash computation.
 *
 * Steps:
 * 1. Remove service fields (id, createdAt, ttStart, ttEnd, contentHash, chainHash, etc.)
 * 2. Sort keys recursively
 * 3. Serialize to JSON (no whitespace)
 *
 * @param {object} properties - Node properties
 * @returns {string} Canonical JSON string
 */
function canonicalize(properties) {
  const SERVICE_FIELDS = new Set([
    'id', 'createdAt', 'updatedAt',
    'ttStart', 'ttEnd', 'vtStart', 'vtEnd',
    'versionId', 'entityId', 'sequenceNumber', 'status',
    'contentHash', 'previousHash', 'chainHash',
    'namespace', 'extractionCycleId',
  ]);

  function sortRecursive(obj) {
    if (Array.isArray(obj)) {
      return obj.map(sortRecursive);
    }
    if (obj !== null && typeof obj === 'object') {
      const sorted = {};
      for (const key of Object.keys(obj).sort()) {
        if (!SERVICE_FIELDS.has(key)) {
          sorted[key] = sortRecursive(obj[key]);
        }
      }
      return sorted;
    }
    return obj;
  }

  const canonical = sortRecursive(properties);
  return JSON.stringify(canonical);
}

/**
 * Computes contentHash for node properties.
 */
function computeContentHash(properties) {
  const canonical = canonicalize(properties);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Computes chainHash for the current version.
 *
 * @param {string} contentHash - Content hash of the current version
 * @param {string|null} previousChainHash - chainHash of previous version (null for GENESIS)
 * @returns {string} chainHash
 */
function computeChainHash(contentHash, previousChainHash) {
  const prev = previousChainHash ?? 'GENESIS';
  const input = `${contentHash}:${prev}`;
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
```

### Chain validation

```javascript
/**
 * Validates the integrity of the version chain.
 *
 * @param {Array} versions - Array of versions sorted by sequenceNumber
 * @returns {{ valid: boolean, brokenAt: number|null, error: string|null }}
 */
function validateChain(versions) {
  if (versions.length === 0) {
    return { valid: true, brokenAt: null, error: null };
  }

  // Validate GENESIS version
  const genesis = versions[0];
  const expectedGenesisChain = computeChainHash(genesis.contentHash, null);
  if (genesis.chainHash !== expectedGenesisChain) {
    return {
      valid: false,
      brokenAt: genesis.sequenceNumber,
      error: `GENESIS chainHash mismatch: expected ${expectedGenesisChain}, got ${genesis.chainHash}`,
    };
  }

  // Validate each subsequent version
  for (let i = 1; i < versions.length; i++) {
    const current = versions[i];
    const previous = versions[i - 1];

    // previousHash of current version must match chainHash of previous version
    if (current.previousHash !== previous.chainHash) {
      return {
        valid: false,
        brokenAt: current.sequenceNumber,
        error: `Version ${current.sequenceNumber}: previousHash (${current.previousHash}) !== previous chainHash (${previous.chainHash})`,
      };
    }

    // chainHash of current version must be correct
    const expectedChain = computeChainHash(current.contentHash, previous.chainHash);
    if (current.chainHash !== expectedChain) {
      return {
        valid: false,
        brokenAt: current.sequenceNumber,
        error: `Version ${current.sequenceNumber}: chainHash mismatch: expected ${expectedChain}, got ${current.chainHash}`,
      };
    }
  }

  return { valid: true, brokenAt: null, error: null };
}
```

### GENESIS pattern — first version

The first version of an entity (sequenceNumber = 1) uses a special pattern:

```javascript
// Creating a GENESIS version
const genesisVersion = {
  versionId: `ver-${uuidv4()}`,
  entityId: `ent-${uuidv4()}`,
  sequenceNumber: 1,
  status: 'ACTIVE',
  ttStart: new Date().toISOString(),
  ttEnd: null,
  vtStart: new Date().toISOString(),
  vtEnd: null,
  contentHash: computeContentHash(properties),
  previousHash: null,                                        // <-- null for GENESIS
  chainHash: computeChainHash(computeContentHash(properties), null), // <-- "GENESIS" as previousHash
};
```

On validation: if `previousHash === null` and `sequenceNumber === 1`, this is a valid GENESIS version.

---

## 2.5. Bi-temporal Model — Two-dimensional Time

Every versioned entity (Level 3) exists in two time dimensions:

```
                    Valid Time (vt) — "When did the fact actually apply?"
                    ────────────────────────────────────────────────>

 Transaction Time   │
 (tt) — "When did   │   ┌─────────────────────┐
  we learn          │   │  V1: sp_GetUsers     │
  about this fact?" │   │  vt: [Jan, Mar)      │ ← "Procedure was current Jan-Mar"
                     │   │  tt: [Feb, ∞)        │ ← "We learned about it in Feb"
                     │   └─────────────────────┘
                     │
                     │   ┌─────────────────────┐
                     │   │  V2: sp_GetUsers_v2  │
                     │   │  vt: [Mar, ∞)        │ ← "New version from Mar"
                     │   │  tt: [Mar, ∞)        │ ← "We learned about it in Mar"
                     │   └─────────────────────┘
                     │
                     │   ┌─────────────────────┐
                     │   │  V1-fix: sp_GetUsers │
                     │   │  vt: [Jan, Feb)      │ ← "It turns out V1 was only valid until Feb"
                     │   │  tt: [Apr, ∞)        │ ← "We realized this only in Apr (retrospectively)"
                     │   └─────────────────────┘
                     ▼
```

### Cypher query examples

**Current state** — what is current right now:

```cypher
// All active versions at the current moment
MATCH (v:NodeVersion)
WHERE v.status = 'ACTIVE'
  AND v.ttEnd IS NULL
  AND v.vtEnd IS NULL
RETURN v
ORDER BY v.entityId, v.sequenceNumber DESC
```

**As-of query (Transaction Time)** — what we knew on a specific date:

```cypher
// State of the knowledge graph as we knew it on 2026-02-15
MATCH (v:NodeVersion)
WHERE v.ttStart <= '2026-02-15T00:00:00.000Z'
  AND (v.ttEnd IS NULL OR v.ttEnd > '2026-02-15T00:00:00.000Z')
RETURN v
```

**Valid-at query (Valid Time)** — what was actually true during a specific period:

```cypher
// Which procedures actually existed in January 2026
MATCH (v:NodeVersion)-[:VERSION_OF]->(e:Procedure)
WHERE v.vtStart <= '2026-01-31T23:59:59.999Z'
  AND (v.vtEnd IS NULL OR v.vtEnd > '2026-01-01T00:00:00.000Z')
RETURN e.name, v.sequenceNumber, v.vtStart, v.vtEnd
```

**Bi-temporal query** — what we knew about a specific period on a specific date:

```cypher
// What we knew on 2026-03-01 about the state of the system in January 2026
MATCH (v:NodeVersion)
WHERE v.ttStart <= '2026-03-01T00:00:00.000Z'
  AND (v.ttEnd IS NULL OR v.ttEnd > '2026-03-01T00:00:00.000Z')
  AND v.vtStart <= '2026-01-31T23:59:59.999Z'
  AND (v.vtEnd IS NULL OR v.vtEnd > '2026-01-01T00:00:00.000Z')
RETURN v
```

### Time management rules

| Aspect                       | Transaction Time (tt)                  | Valid Time (vt)                          |
|------------------------------|----------------------------------------|------------------------------------------|
| **Who sets it**              | System automatically                   | Extraction pipeline or user              |
| **Can it be changed?**       | No — immutable                        | Yes — for retrospective correction       |
| **When is ttEnd/vtEnd set?** | When new version is created (SUPERSEDED) | When it is discovered the fact is no longer valid |
| **null value**               | Current (not yet replaced)             | Indefinitely valid                       |
| **Format**                   | ISO 8601 with timezone (UTC)           | ISO 8601 with timezone (UTC)             |
| **Granularity**              | Milliseconds                           | Milliseconds                             |

**Invariants:**

1. `ttStart` is always set when a version is created and **never changes**.
2. `ttEnd` is set **only** when a new version appears (`SUPERSEDED`).
3. `vtStart` is set at creation, can be corrected **retrospectively**.
4. `vtEnd` may be `null` (indefinite) or is set when staleness is discovered.
5. For any entity **exactly one** version has `ttEnd = null` and `status = 'ACTIVE'`.

---

## 2.6. extractionCycleId — Rules

### What is an extraction cycle

An Extraction Cycle is one complete pass of the pipeline over a data source. One cycle can create or update dozens/hundreds of nodes in the knowledge graph.

```
┌──────────────────────────────────────────────────────────────────┐
│                    Extraction Cycle                               │
│                                                                  │
│  cycleId: "cycle-550e8400-..."                                   │
│  cycleNumber: 7                                                  │
│  previousCycleId: "cycle-338a2100-..."                           │
│                                                                  │
│  ┌──────┐   ┌──────────┐   ┌───────────┐   ┌──────────────┐    │
│  │Scan  │──>│ Extract  │──>│ Normalize │──>│ Store to KG  │    │
│  │Source │   │ Entities │   │ + Enrich  │   │ + Hash Chain │    │
│  └──────┘   └──────────┘   └───────────┘   └──────────────┘    │
│                                                                  │
│  Result: 47 nodes created, 12 updated, 3 deleted                │
└──────────────────────────────────────────────────────────────────┘
```

### Generating extractionCycleId

`extractionCycleId` is generated **once** at pipeline start and passed to all subsequent steps:

```javascript
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new extraction cycle.
 * Called ONCE at pipeline start.
 */
function createExtractionCycle(previousCycleId = null, cycleNumber = 1) {
  return {
    cycleId: `cycle-${uuidv4()}`,
    cycleNumber,
    previousCycleId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'RUNNING',
    stats: {
      nodesCreated: 0,
      nodesUpdated: 0,
      nodesDeprecated: 0,
      edgesCreated: 0,
      errors: 0,
    },
  };
}
```

### Using extractionCycleId

| Scenario              | How it is used                                                                   | Example                                                   |
|-----------------------|---------------------------------------------------------------------------------|------------------------------------------------------------|
| **Batch rollback**    | Delete all nodes created in one cycle                                            | `MATCH (n {extractionCycleId: $cycleId}) DETACH DELETE n`  |
| **Pipeline debug**    | Find all facts extracted in a specific run                                       | `MATCH (n {extractionCycleId: $cycleId}) RETURN n`         |
| **Metrics**           | Count created/updated/deleted nodes per cycle                                    | Aggregate by `extractionCycleId`                           |
| **Incrementality**    | Determine which nodes were not touched by the latest cycle (potentially deleted)  | `WHERE n.extractionCycleId <> $currentCycleId`             |
| **Audit**             | Answer "who created this fact and when"                                          | Join with `(:ExtractionCycle)` node                        |

### Relationship with the spiral extraction model

The PA pipeline operates on a spiral model: each cycle refines the previous results.

```
  Cycle 1 ──> Cycle 2 ──> Cycle 3 ──> Cycle 4
  (rough)     (refined)   (enriched)  (validated)

  confidence:  0.5-0.7     0.7-0.8      0.8-0.9        0.9-1.0
  method:      regex       AST+regex    +LLM enrich    +GNN predict
```

Each cycle:
1. Receives `previousCycleId` — reference to the previous run
2. Generates its own `cycleId` — a new UUID
3. Increments `cycleNumber` by 1
4. For each existing node, compares `contentHash`:
   - Hash matched → `CONFIRMED` (no new version created, update `extractionCycleId`)
   - Hash changed → `UPDATED` (create new version, `SUPERSEDED` old one)
   - Node not found in source → `DEPRECATED` (set `vtEnd`)
   - New node → `CREATED` (create GENESIS version)

```javascript
/**
 * Determines the action for a node during incremental update.
 */
function determineAction(existingNode, newContentHash) {
  if (!existingNode) {
    return 'CREATED';   // New node, did not exist before
  }
  if (existingNode.contentHash === newContentHash) {
    return 'CONFIRMED'; // Content has not changed
  }
  return 'UPDATED';     // Content has changed, new version needed
}

// Nodes existing in the graph but not found in the current cycle:
// → action: 'DEPRECATED' (set vtEnd = now)
```

---

> **CODEX-META v0.1.0** | Part of **UN ProjectAdvisor Codex** | Metadata standard for the knowledge graph

---

## Part III: CODEX-VERSION — Versioning Standard

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

In the UN ProjectAdvisor system, two data models coexist:

1. **Mutable domain nodes** — ordinary knowledge graph nodes (Table, Method, Column, etc.) that are updated in-place via `SET`. Simple, fast, do not store history.

2. **Immutable NodeVersion** — append-only version chains with hash chain, audit trail, and full change history. Used for business rules, regulatory documents, and everything where provable traceability is required.

This standard defines:
- when to use which model,
- how to link them together (Bridge pattern),
- how to build and traverse SUPERSEDES chains,
- how to handle merge/split/fork,
- when it is permissible to violate immutability (God Mode),
- how to safely delete versions (Tombstones).

---

## 3.1 Two Models — NodeVersion vs Domain Nodes

### Comparison diagram

```
 MUTABLE (Domain Node)                    IMMUTABLE (NodeVersion)
 ========================                 ================================
 (:Table)                                 (:NodeVersion)
 ├─ name: "Users"                         ├─ entityId: "BR-001"
 ├─ schema: "dbo"                         ├─ versionId: "BR-001-v3"
 ├─ catalog: "MainDB"                     ├─ sequenceNumber: 3
 ├─ rowCount: 150000                      ├─ status: "ACTIVE"
 ├─ lastSync: datetime()                  ├─ contentHash: "sha256:a1b2c3..."
 │                                        ├─ previousHash: "sha256:x9y8z7..."
 │  5-10 properties                       ├─ title: "Validation Rule X"
 │                                        ├─ content: "{...json...}"
 │  Update:                               ├─ author: "agent:advisor"
 │  SET t.rowCount = 200000               ├─ createdAt: datetime()
 │                                        ├─ createdBy: "user:admin"
 │  History: NONE                         ├─ validFrom: datetime()
 │  Audit: NONE                           ├─ validUntil: null
 │                                        ├─ namespace: "un.rules"
 │                                        ├─ tags: ["validation","input"]
 │                                        ├─ metadata: "{...}"
 │                                        ├─ sourceType: "LLM_EXTRACTION"
 │                                        ├─ sourceRef: "doc:REQ-042"
 │                                        ├─ confidence: 0.92
 │                                        ├─ approvedBy: "user:reviewer"
 │                                        ├─ approvedAt: datetime()
 │                                        ├─ schemaVersion: "1.0"
 │                                        ├─ changeReason: "Threshold refinement"
 │                                        ├─ diffFromPrevious: "{...patch...}"
 │                                        ├─ embedding: [0.12, 0.34, ...]
 │                                        │
 │                                        │  25 properties
 │                                        │
 │                                        │  Update: FORBIDDEN
 │                                        │  A NEW version is created
 │                                        │  with a SUPERSEDES edge
 │                                        │
 │                                        │  History: FULL chain
 │                                        │  Audit: hash chain
 └────────────────────                    └────────────────────────────────
```

### Model selection table

| Criterion                       | Domain (mutable) | NodeVersion (immutable) |
|---------------------------------|:-----------------:|:-----------------------:|
| Change history needed?          | No                | Yes                     |
| Audit critical?                 | No                | Yes                     |
| Change frequency                | High (>10/day)    | Low-medium              |
| Data normative/legal?           | No                | Yes                     |
| Need to roll back to version N? | Impossible        | Yes                     |
| Data size per node              | Small (5-10 fields) | Large (25 fields)     |
| Write speed                     | Fast (SET)        | Slower (CREATE+EDGE)    |
| Provable integrity              | No                | Yes (hash chain)        |

### Label-to-model mapping

| Graph label        | Model                   | Rationale                                                |
|--------------------|-------------------------|----------------------------------------------------------|
| `Table`            | Domain (mutable)        | Technical description, frequently synchronized           |
| `Column`           | Domain (mutable)        | Table attribute, updated on re-scan                      |
| `Method`           | Domain (mutable)        | Code changes frequently, history in git                  |
| `BusinessRule`     | NodeVersion (immutable) | Regulatory document, full audit required                 |
| `Policy`           | NodeVersion (immutable) | Legally significant, traceability required               |
| `Requirement`      | NodeVersion (immutable) | Specification, approval history required                 |
| `CatalogEntry`     | Domain + GraphVersion   | Catalog itself is mutable, but graph versions are immutable |
| `ExecutionRecord`  | Domain (immutable by policy) | Created once, never changes, but without hash chain |
| `Settings`         | Domain (mutable)        | Configuration, history not needed                        |
| `CoreComponent`    | Domain (mutable)        | Infrastructure node, updated on deploy                   |

---

## 3.2 Bridge Pattern: Linking the Two Models

### Problem

Domain nodes and NodeVersions live in different models and are not directly connected. A Method (domain) may implement a business rule (NodeVersion), but how do you build an edge between them when the rule's version changes?

### Solution: Stable Entity ID + Version Pointer

```
  Domain Model                          Immutable Model
  ============                          ================

  (:Method)                             (:NodeVersion)
  │ id: "M-042"                         │ entityId:  "BR-001"
  │ name: "validateInput"               │ versionId: "BR-001-v1"
  │                                     │ status:    "SUPERSEDED"
  │                                     │
  │                                     │      │
  │                                     │      │ SUPERSEDES
  │                                     │      v
  │                                     │
  │                                     │ (:NodeVersion)
  │                                     │ │ entityId:  "BR-001"
  │                                     │ │ versionId: "BR-001-v2"
  │                                     │ │ status:    "SUPERSEDED"
  │                                     │ │
  │                                     │ │      │
  │                                     │ │      │ SUPERSEDES
  │                                     │ │      v
  │         IMPLEMENTS                  │ │
  ├─────────────────────────────────────┤ │ (:NodeVersion)
  │         (entityId: "BR-001")        │   │ entityId:  "BR-001"
  │                                     │   │ versionId: "BR-001-v3"
  │                                     │   │ status:    "ACTIVE"    <── current
  │                                     │   │ content:   "{...}"
```

### Bridge pattern rules

**Rule 1: Use `entityId`, not `versionId`, for cross-model edges.**

```cypher
// CORRECT: edge references entityId
MATCH (m:Method {id: "M-042"})
MATCH (br:NodeVersion {entityId: "BR-001", status: "ACTIVE"})
MERGE (m)-[:IMPLEMENTS {entityId: "BR-001"}]->(br)
```

```cypher
// WRONG: edge is tied to a specific version
MATCH (m:Method {id: "M-042"})
MATCH (br:NodeVersion {versionId: "BR-001-v3"})
MERGE (m)-[:IMPLEMENTS]->(br)
// When v4 appears, this edge will remain on v3!
```

**Rule 2: On SUPERSEDE — relink incoming edges.**

When a new version is created, all incoming cross-model edges must be redirected to the new ACTIVE version:

```javascript
/**
 * Relinks incoming edges when a new version is created.
 * Called AFTER the SUPERSEDES edge is created and the status is changed.
 *
 * @param {string} entityId   -- stable entity ID
 * @param {string} oldVersionId -- versionId of the previous (now SUPERSEDED) version
 * @param {string} newVersionId -- versionId of the new ACTIVE version
 */
async function relinkIncomingEdges(entityId, oldVersionId, newVersionId) {
  const session = driver.session();
  try {
    // Find all incoming edges to the old version (except SUPERSEDES)
    const result = await session.run(`
      MATCH (source)-[r]->(old:NodeVersion {versionId: $oldVersionId})
      WHERE type(r) <> 'SUPERSEDES'
      MATCH (new:NodeVersion {versionId: $newVersionId})
      WITH source, r, old, new, type(r) AS relType, properties(r) AS relProps
      // Create the same edge to the new version
      CALL {
        WITH source, new, relType, relProps
        WITH source, new, relType, relProps
        CREATE (source)-[newR:IMPLEMENTS]->(new)
        SET newR = relProps
        // Note: Memgraph does not support dynamic edge types.
        // In a real system, a CASE by relType is needed.
      }
      // Delete the old edge
      DELETE r
      RETURN count(*) AS relinked
    `, { oldVersionId, newVersionId });

    return result.records[0].get('relinked');
  } finally {
    await session.close();
  }
}
```

**Rule 3: Relinking by edge types (Memgraph-compatible variant).**

Since Memgraph does not support dynamic edge types in `CREATE`, use explicit mapping:

```javascript
const BRIDGE_EDGE_TYPES = ['IMPLEMENTS', 'REFERENCES', 'GOVERNED_BY', 'DERIVED_FROM'];

async function relinkAllBridgeEdges(entityId, oldVersionId, newVersionId) {
  const session = driver.session();
  try {
    let totalRelinked = 0;

    for (const edgeType of BRIDGE_EDGE_TYPES) {
      const result = await session.run(`
        MATCH (source)-[r:${edgeType}]->(old:NodeVersion {versionId: $oldVersionId})
        MATCH (new:NodeVersion {versionId: $newVersionId})
        WITH source, r, new, properties(r) AS props
        CREATE (source)-[newR:${edgeType}]->(new)
        SET newR = props
        SET newR.relinkedAt = datetime()
        SET newR.relinkedFrom = $oldVersionId
        DELETE r
        RETURN count(*) AS cnt
      `, { oldVersionId, newVersionId });

      totalRelinked += result.records[0].get('cnt');
    }

    return totalRelinked;
  } finally {
    await session.close();
  }
}
```

---

## 3.3 SUPERSEDES Chain: Creation, Traversal, Invariants

### Chain structure

```
  (:NodeVersion)          (:NodeVersion)          (:NodeVersion)
  │ versionId: "E-v1"     │ versionId: "E-v2"     │ versionId: "E-v3"
  │ entityId:  "E"         │ entityId:  "E"         │ entityId:  "E"
  │ seqNum:    1           │ seqNum:    2           │ seqNum:    3
  │ status:    SUPERSEDED  │ status:    SUPERSEDED  │ status:    ACTIVE
  │ contentHash: "h1"      │ contentHash: "h2"      │ contentHash: "h3"
  │ previousHash: null     │ previousHash: "h1"     │ previousHash: "h2"
  │ createdAt: t1          │ createdAt: t2          │ createdAt: t3
  │                        │                        │
  └────────────────────────┘────────────────────────┘
           ^                        ^
           │ SUPERSEDES             │ SUPERSEDES
           │ (v2 replaces v1)       │ (v3 replaces v2)
           │                        │
      (:NodeVersion v2)        (:NodeVersion v3)

  SUPERSEDES direction: NEW -[:SUPERSEDES]-> OLD
  Chain reading: from ACTIVE backwards via SUPERSEDES
```

### Creating a new version — code

```javascript
const crypto = require('crypto');

/**
 * Creates the next version of an entity in the SUPERSEDES chain.
 *
 * @param {string} entityId    -- stable entity ID
 * @param {object} newContent  -- new version content
 * @param {object} meta        -- metadata (author, changeReason, etc.)
 * @returns {object}           -- created NodeVersion
 */
async function createNextVersion(entityId, newContent, meta = {}) {
  const session = driver.session();
  try {
    // 1. Find the current ACTIVE version
    const current = await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "ACTIVE"})
      RETURN v
    `, { entityId });

    if (current.records.length === 0) {
      throw new Error(`No ACTIVE version found for entityId: ${entityId}`);
    }

    const activeNode = current.records[0].get('v').properties;
    const currentSeq = activeNode.sequenceNumber;
    const currentHash = activeNode.contentHash;
    const currentVersionId = activeNode.versionId;

    // 2. Compute hash chain
    const contentStr = JSON.stringify(newContent, Object.keys(newContent).sort());
    const newHash = crypto
      .createHash('sha256')
      .update(currentHash + '|' + contentStr)
      .digest('hex');

    const newSeq = currentSeq + 1;
    const newVersionId = `${entityId}-v${newSeq}`;

    // 3. Compute diff from previous version
    const previousContent = JSON.parse(activeNode.content || '{}');
    const diff = computeDiff(previousContent, newContent);

    // 4. Atomic transaction: create new version + SUPERSEDES + update status
    const result = await session.run(`
      // Mark current as SUPERSEDED
      MATCH (old:NodeVersion {versionId: $currentVersionId})
      SET old.status = "SUPERSEDED"
      SET old.supersededAt = datetime()

      // Create new version
      CREATE (new:NodeVersion {
        entityId:         $entityId,
        versionId:        $newVersionId,
        sequenceNumber:   $newSeq,
        status:           "ACTIVE",
        contentHash:      $newHash,
        previousHash:     $currentHash,
        content:          $contentStr,
        diffFromPrevious: $diff,
        createdAt:        datetime(),
        createdBy:        $author,
        author:           $author,
        changeReason:     $changeReason,
        namespace:        old.namespace,
        tags:             old.tags,
        schemaVersion:    old.schemaVersion,
        sourceType:       $sourceType,
        sourceRef:        $sourceRef,
        title:            $title,
        confidence:       $confidence,
        validFrom:        datetime(),
        validUntil:       null,
        approvedBy:       null,
        approvedAt:       null,
        embedding:        null,
        metadata:         $metadata
      })

      // Create SUPERSEDES edge (new -> old)
      CREATE (new)-[:SUPERSEDES {
        at: datetime(),
        reason: $changeReason
      }]->(old)

      RETURN new
    `, {
      currentVersionId,
      entityId,
      newVersionId,
      newSeq,
      newHash,
      currentHash,
      contentStr,
      diff:         JSON.stringify(diff),
      author:       meta.author       || 'system',
      changeReason: meta.changeReason || 'Update',
      sourceType:   meta.sourceType   || 'MANUAL',
      sourceRef:    meta.sourceRef    || null,
      title:        meta.title       || activeNode.title,
      confidence:   meta.confidence  || activeNode.confidence,
      metadata:     meta.metadata    ? JSON.stringify(meta.metadata) : (activeNode.metadata || '{}')
    });

    const newNode = result.records[0].get('new').properties;

    // 5. Relink Bridge edges
    await relinkAllBridgeEdges(entityId, currentVersionId, newVersionId);

    return newNode;
  } finally {
    await session.close();
  }
}

/**
 * Simple diff between two objects.
 */
function computeDiff(oldObj, newObj) {
  const diff = { added: {}, removed: {}, changed: {} };
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    if (!(key in oldObj))      diff.added[key] = newObj[key];
    else if (!(key in newObj)) diff.removed[key] = oldObj[key];
    else if (JSON.stringify(oldObj[key]) !== JSON.stringify(newObj[key])) {
      diff.changed[key] = { from: oldObj[key], to: newObj[key] };
    }
  }

  return diff;
}
```

### Cypher queries for chain traversal

**Get full entity history (from newest to oldest):**

```cypher
MATCH path = (active:NodeVersion {entityId: $entityId, status: "ACTIVE"})
             -[:SUPERSEDES*0..]->(ancestor:NodeVersion)
RETURN ancestor.versionId     AS versionId,
       ancestor.sequenceNumber AS seq,
       ancestor.status         AS status,
       ancestor.createdAt      AS createdAt,
       ancestor.changeReason   AS reason,
       ancestor.contentHash    AS hash,
       ancestor.author         AS author
ORDER BY ancestor.sequenceNumber DESC
```

**Find the version current on a specific date:**

```cypher
MATCH (v:NodeVersion {entityId: $entityId})
WHERE v.validFrom <= $targetDate
  AND (v.validUntil IS NULL OR v.validUntil > $targetDate)
RETURN v
ORDER BY v.sequenceNumber DESC
LIMIT 1
```

**Verify hash chain integrity:**

```cypher
MATCH path = (active:NodeVersion {entityId: $entityId, status: "ACTIVE"})
             -[:SUPERSEDES*]->(prev:NodeVersion)
WITH nodes(path) AS chain
UNWIND range(0, size(chain) - 2) AS i
WITH chain[i] AS newer, chain[i + 1] AS older
WHERE newer.previousHash <> older.contentHash
RETURN newer.versionId AS brokenAt,
       newer.previousHash AS expected,
       older.contentHash AS actual
```

### SUPERSEDES chain invariants

| # | Invariant                                         | Check                                                      |
|---|---------------------------------------------------|------------------------------------------------------------|
| 1 | Exactly one ACTIVE version per `entityId`         | `COUNT(status="ACTIVE") = 1` for each entityId             |
| 2 | No cycles in the SUPERSEDES chain                 | DFS traversal does not return to a visited node            |
| 3 | `sequenceNumber` strictly increases along SUPERSEDES | Each `newer.seqNum > older.seqNum`                      |
| 4 | `previousHash` matches `contentHash` of ancestor  | `newer.previousHash === older.contentHash`                  |
| 5 | First version (seqNum=1) has `previousHash=null`  | Chain start does not reference a previous hash             |
| 6 | SUPERSEDED version has no incoming Bridge edges   | All IMPLEMENTS/REFERENCES point only to ACTIVE             |

**Cypher query for invariant 1 check:**

```cypher
MATCH (v:NodeVersion {status: "ACTIVE"})
WITH v.entityId AS eid, count(*) AS cnt
WHERE cnt > 1
RETURN eid, cnt
// Result must be empty
```

**Cypher query for invariant 3 check:**

```cypher
MATCH (newer:NodeVersion)-[:SUPERSEDES]->(older:NodeVersion)
WHERE newer.sequenceNumber <= older.sequenceNumber
RETURN newer.versionId AS invalid, newer.sequenceNumber AS newerSeq, older.sequenceNumber AS olderSeq
// Result must be empty
```

---

## 3.4 Merge / Split / Fork

### MERGE: Combining two entities into one

**Scenario:** Two business rules (BR-010, BR-011) turned out to be duplicates and must be merged.

```
  BEFORE MERGE:
  ─────────────

  (:NodeVersion)                    (:NodeVersion)
  │ entityId: "BR-010"              │ entityId: "BR-011"
  │ versionId: "BR-010-v2"          │ versionId: "BR-011-v3"
  │ status: ACTIVE                  │ status: ACTIVE
  │ content: "Rule A"               │ content: "Rule B"


  AFTER MERGE:
  ────────────

  (:NodeVersion)                    (:NodeVersion)
  │ entityId: "BR-010"              │ entityId: "BR-011"
  │ versionId: "BR-010-v2"          │ versionId: "BR-011-v3"
  │ status: SUPERSEDED              │ status: MERGED
  │                                 │
  │         SUPERSEDES              │    MERGED_FROM
  │            ^                    │       ^
  │            │                    │       │
  │            └─────────┬──────────┘       │
  │                      │                  │
  │                 (:NodeVersion)           │
  │                 │ entityId: "BR-010"     │
  │                 │ versionId: "BR-010-v3" │
  │                 │ status: ACTIVE         │
  │                 │ mergedFromIds:          │
  │                 │  ["BR-010","BR-011"]   │
  │                 │ content: "Merged"      │
  │                 └────────────────────────┘
```

**MERGE code:**

```javascript
/**
 * Merges two entities into one.
 * Result: new version of primaryEntityId containing data from both.
 * The second entity receives MERGED status.
 *
 * @param {string} primaryEntityId   -- entityId that remains
 * @param {string} secondaryEntityId -- entityId that is absorbed
 * @param {object} mergedContent     -- merged content
 * @param {object} meta              -- metadata
 */
async function mergeEntities(primaryEntityId, secondaryEntityId, mergedContent, meta = {}) {
  const session = driver.session();
  try {
    // 1. Create new version of primary with merged content
    const newVersion = await createNextVersion(primaryEntityId, mergedContent, {
      ...meta,
      changeReason: `MERGE: ${secondaryEntityId} merged into ${primaryEntityId}`,
      metadata: {
        ...(meta.metadata || {}),
        mergedFromIds: [primaryEntityId, secondaryEntityId],
        mergeType: 'ABSORB'
      }
    });

    // 2. Mark ACTIVE version of secondary as MERGED
    await session.run(`
      MATCH (v:NodeVersion {entityId: $secondaryEntityId, status: "ACTIVE"})
      SET v.status = "MERGED"
      SET v.mergedInto = $primaryEntityId
      SET v.mergedAt = datetime()
    `, { secondaryEntityId, primaryEntityId });

    // 3. Create MERGED_FROM edge
    await session.run(`
      MATCH (target:NodeVersion {versionId: $newVersionId})
      MATCH (source:NodeVersion {entityId: $secondaryEntityId, status: "MERGED"})
      CREATE (target)-[:MERGED_FROM {
        at: datetime(),
        reason: $reason
      }]->(source)
    `, {
      newVersionId: newVersion.versionId,
      reason: meta.changeReason || 'Duplicate consolidation'
    });

    // 4. Redirect all Bridge edges of secondary to the new version of primary
    await relinkAllBridgeEdges(secondaryEntityId,
      `${secondaryEntityId}-v*`, // все версии
      newVersion.versionId);

    return newVersion;
  } finally {
    await session.close();
  }
}
```

### SPLIT: Dividing an entity into two

**Scenario:** Business rule BR-020 is too complex and is split into BR-020 (part A) and BR-021 (part B).

```
  BEFORE SPLIT:
  ─────────────

  (:NodeVersion)
  │ entityId: "BR-020"
  │ versionId: "BR-020-v4"
  │ status: ACTIVE
  │ content: "Сложное правило А+Б"


  AFTER SPLIT:
  ────────────

  (:NodeVersion)                            (:NodeVersion)
  │ entityId: "BR-020"                      │ entityId: "BR-021"        <── NEW entityId
  │ versionId: "BR-020-v5"                  │ versionId: "BR-021-v1"
  │ status: ACTIVE                          │ status: ACTIVE
  │ content: "Part A"                       │ content: "Part B"
  │ splitInfo: "split, kept part A"         │ splitFromId: "BR-020"
  │                                         │ splitFromVersion: "BR-020-v4"
  │         ^                               │
  │         │ SUPERSEDES                    │         ^
  │         │                               │         │ SPLIT_FROM
  │  (:NodeVersion)                         │         │
  │  │ entityId: "BR-020"                   └─────────┘
  │  │ versionId: "BR-020-v4"
  │  │ status: SUPERSEDED
```

**SPLIT code:**

```javascript
/**
 * Splits an entity into two.
 * The original entityId receives a new version (part A).
 * A new entityId is created for part B.
 *
 * @param {string} entityId     -- source entityId
 * @param {object} contentPartA -- content for the original entity
 * @param {object} contentPartB -- content for the new entity
 * @param {string} newEntityId  -- entityId for the new entity
 * @param {object} meta         -- metadata
 */
async function splitEntity(entityId, contentPartA, contentPartB, newEntityId, meta = {}) {
  const session = driver.session();
  try {
    // 1. Get the current ACTIVE version
    const current = await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "ACTIVE"})
      RETURN v.versionId AS vid
    `, { entityId });

    const sourceVersionId = current.records[0].get('vid');

    // 2. Create new version A (update of original)
    const versionA = await createNextVersion(entityId, contentPartA, {
      ...meta,
      changeReason: `SPLIT: extracted ${newEntityId} from ${entityId}`,
      metadata: {
        ...(meta.metadata || {}),
        splitInfo: { type: 'SPLIT_KEPT', extractedEntityId: newEntityId }
      }
    });

    // 3. Create the first version B (new entity)
    const contentStrB = JSON.stringify(contentPartB, Object.keys(contentPartB).sort());
    const hashB = crypto.createHash('sha256').update(contentStrB).digest('hex');

    await session.run(`
      CREATE (b:NodeVersion {
        entityId:         $newEntityId,
        versionId:        $newVersionId,
        sequenceNumber:   1,
        status:           "ACTIVE",
        contentHash:      $hashB,
        previousHash:     null,
        content:          $contentStrB,
        diffFromPrevious: null,
        createdAt:        datetime(),
        createdBy:        $author,
        author:           $author,
        changeReason:     $reason,
        splitFromId:      $entityId,
        splitFromVersion: $sourceVersionId,
        namespace:        $namespace,
        tags:             $tags,
        schemaVersion:    "1.0",
        sourceType:       "SPLIT",
        sourceRef:        $entityId,
        title:            $title,
        confidence:       1.0,
        validFrom:        datetime(),
        validUntil:       null,
        approvedBy:       null,
        approvedAt:       null,
        embedding:        null,
        metadata:         $metadata
      })

      WITH b
      MATCH (source:NodeVersion {versionId: $sourceVersionId})
      CREATE (b)-[:SPLIT_FROM {at: datetime()}]->(source)
    `, {
      newEntityId,
      newVersionId: `${newEntityId}-v1`,
      hashB,
      contentStrB,
      author:           meta.author || 'system',
      reason:           `SPLIT: extracted from ${entityId}`,
      entityId,
      sourceVersionId,
      namespace:        meta.namespace || 'un.default',
      tags:             meta.tags || [],
      title:            meta.titleB || `${newEntityId} (split from ${entityId})`,
      metadata:         JSON.stringify(meta.metadata || {})
    });

    return { partA: versionA, partB: { entityId: newEntityId, versionId: `${newEntityId}-v1` } };
  } finally {
    await session.close();
  }
}
```

### FORK: Branching for alternatives

**Scenario:** An alternative version of rule BR-030 needs to be created for a different region/context. The original remains, an independent branch is created.

```
  BEFORE FORK:
  ────────────

  (:NodeVersion)
  │ entityId: "BR-030"
  │ versionId: "BR-030-v2"
  │ status: ACTIVE
  │ content: "Глобальное правило"


  AFTER FORK:
  ───────────

  (:NodeVersion)                            (:NodeVersion)
  │ entityId: "BR-030"                      │ entityId: "BR-030-EU"     <── NEW entityId
  │ versionId: "BR-030-v2"                  │ versionId: "BR-030-EU-v1"
  │ status: ACTIVE                          │ status: ACTIVE
  │ content: "Global rule"                  │ content: "EU-specific rule"
  │                                         │ forkedFromId: "BR-030"
  │ (unchanged!)                            │ forkedFromVersion: "BR-030-v2"
  │                                         │
  │                                         │         ^
  │                                         │         │ FORKED_FROM
  │                                         │         │
  │                                         └─────────┘
  │                                                   │
  │                                          (:NodeVersion)
  │                                          │ entityId: "BR-030"
  │                                          │ versionId: "BR-030-v2"
```

**Difference between FORK and SPLIT:**
- **SPLIT** — the original changes (receives a new version), both entityIds contain parts of the original.
- **FORK** — the original does NOT change, the new entityId starts an independent life.

**FORK code:**

```javascript
/**
 * Creates a fork of an entity.
 * The original remains unchanged.
 * A new entityId is created with initial content copied from the original.
 *
 * @param {string} sourceEntityId  -- entityId of the original
 * @param {string} forkEntityId   -- entityId for the fork
 * @param {object} modifications  -- changes relative to the original (optional)
 * @param {object} meta           -- metadata
 */
async function forkEntity(sourceEntityId, forkEntityId, modifications = {}, meta = {}) {
  const session = driver.session();
  try {
    // 1. Get the current ACTIVE version of the original
    const current = await session.run(`
      MATCH (v:NodeVersion {entityId: $sourceEntityId, status: "ACTIVE"})
      RETURN v
    `, { sourceEntityId });

    if (current.records.length === 0) {
      throw new Error(`No ACTIVE version for entityId: ${sourceEntityId}`);
    }

    const source = current.records[0].get('v').properties;
    const sourceContent = JSON.parse(source.content || '{}');

    // 2. Apply modifications to the content
    const forkContent = { ...sourceContent, ...modifications };
    const contentStr = JSON.stringify(forkContent, Object.keys(forkContent).sort());
    const hash = crypto.createHash('sha256').update(contentStr).digest('hex');

    // 3. Create the first version of the fork
    await session.run(`
      CREATE (f:NodeVersion {
        entityId:           $forkEntityId,
        versionId:          $forkVersionId,
        sequenceNumber:     1,
        status:             "ACTIVE",
        contentHash:        $hash,
        previousHash:       null,
        content:            $contentStr,
        diffFromPrevious:   null,
        createdAt:          datetime(),
        createdBy:          $author,
        author:             $author,
        changeReason:       $reason,
        forkedFromId:       $sourceEntityId,
        forkedFromVersion:  $sourceVersionId,
        namespace:          $namespace,
        tags:               $tags,
        schemaVersion:      "1.0",
        sourceType:         "FORK",
        sourceRef:          $sourceEntityId,
        title:              $title,
        confidence:         $confidence,
        validFrom:          datetime(),
        validUntil:         null,
        approvedBy:         null,
        approvedAt:         null,
        embedding:          null,
        metadata:           $metadata
      })

      WITH f
      MATCH (source:NodeVersion {versionId: $sourceVersionId})
      CREATE (f)-[:FORKED_FROM {
        at: datetime(),
        reason: $reason
      }]->(source)
    `, {
      forkEntityId,
      forkVersionId:    `${forkEntityId}-v1`,
      hash,
      contentStr,
      author:           meta.author || 'system',
      reason:           meta.changeReason || `Fork of ${sourceEntityId}`,
      sourceEntityId,
      sourceVersionId:  source.versionId,
      namespace:        meta.namespace || source.namespace,
      tags:             meta.tags || source.tags || [],
      title:            meta.title || `${source.title} (fork)`,
      confidence:       source.confidence || 1.0,
      metadata:         JSON.stringify({
        ...(meta.metadata || {}),
        forkedFrom: { entityId: sourceEntityId, versionId: source.versionId }
      })
    });

    return {
      entityId: forkEntityId,
      versionId: `${forkEntityId}-v1`,
      forkedFrom: { entityId: sourceEntityId, versionId: source.versionId }
    };
  } finally {
    await session.close();
  }
}
```

---

## 3.5 God Mode: Controlled Violation of Immutability

### Operations requiring God Mode

| Operation                        | Reason God Mode is required                                 | Risk level    |
|---------------------------------|-------------------------------------------------------------|:-------------:|
| Deleting a version from the chain | Breaks hash chain and SUPERSEDES connectivity             | CRITICAL      |
| Modifying contentHash            | Destroys provable integrity of the entire chain            | CRITICAL      |
| Changing historical time         | Violates chronological sequence                             | HIGH          |
| Full purge of an entity          | Deletes all versions and relationships, irreversible        | CRITICAL      |
| Repairing a broken chain         | Recalculating hashes, restoring SUPERSEDES edges           | HIGH          |
| Changing entityId                | Breaks all Bridge edges and external references             | HIGH          |
| Reverting MERGED/DELETED status  | Returning an entity from a terminal state                   | MEDIUM        |

### GodModeSession

```javascript
const crypto = require('crypto');

/**
 * God Mode session with timeout, verification, and audit.
 * All actions within the session are recorded in an audit hash chain.
 */
class GodModeSession {
  /**
   * @param {string} adminId         -- administrator ID
   * @param {string} reason          -- justification for activating God Mode
   * @param {number} timeoutMinutes  -- session timeout (default 30 min)
   */
  constructor(adminId, reason, timeoutMinutes = 30) {
    this.sessionId = crypto.randomUUID();
    this.adminId = adminId;
    this.reason = reason;
    this.createdAt = new Date();
    this.expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000);
    this.actions = [];
    this.lastAuditHash = null;
    this.closed = false;
  }

  /**
   * Verify that the administrator has God Mode rights.
   * In a real system -- role check, 2FA, approval workflow.
   */
  static async verifyAdmin(adminId) {
    // TODO: IAM integration
    const ADMIN_IDS = ['user:superadmin', 'user:dba', 'agent:system-repair'];
    if (!ADMIN_IDS.includes(adminId)) {
      throw new Error(`Admin verification failed for: ${adminId}`);
    }
    return true;
  }

  /**
   * Create and verify a new God Mode session.
   */
  static async create(adminId, reason, timeoutMinutes = 30) {
    await GodModeSession.verifyAdmin(adminId);
    const session = new GodModeSession(adminId, reason, timeoutMinutes);

    // Record session opening in audit
    await session._recordAudit('SESSION_OPENED', {
      adminId,
      reason,
      timeoutMinutes,
      sessionId: session.sessionId
    });

    return session;
  }

  /**
   * Check that the session is still active.
   */
  isActive() {
    if (this.closed) return false;
    if (new Date() > this.expiresAt) {
      this.closed = true;
      return false;
    }
    return true;
  }

  /**
   * Execute an action in God Mode.
   * Each action is recorded in the audit hash chain.
   *
   * @param {string}   actionType -- action type (DELETE_VERSION, MODIFY_HASH, etc.)
   * @param {object}   params     -- action parameters
   * @param {Function} executor   -- function executing the action
   * @returns {*}                 -- result of executor
   */
  async execute(actionType, params, executor) {
    if (!this.isActive()) {
      throw new Error(`God Mode session ${this.sessionId} expired or closed`);
    }

    const actionRecord = {
      actionId: crypto.randomUUID(),
      actionType,
      params,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      adminId: this.adminId
    };

    try {
      // Execute the action
      const result = await executor();

      actionRecord.status = 'SUCCESS';
      actionRecord.result = result;

      // Record in audit hash chain
      await this._recordAudit(actionType, actionRecord);

      this.actions.push(actionRecord);
      return result;

    } catch (error) {
      actionRecord.status = 'FAILED';
      actionRecord.error = error.message;

      await this._recordAudit(`${actionType}_FAILED`, actionRecord);

      this.actions.push(actionRecord);
      throw error;
    }
  }

  /**
   * Close the God Mode session.
   */
  async close() {
    this.closed = true;
    await this._recordAudit('SESSION_CLOSED', {
      sessionId: this.sessionId,
      totalActions: this.actions.length,
      duration: Date.now() - this.createdAt.getTime()
    });
  }

  /**
   * Record an audit entry with hash chain.
   * Each entry contains the hash of the previous one, forming an unbroken chain.
   */
  async _recordAudit(eventType, data) {
    const record = {
      eventType,
      data,
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      adminId: this.adminId,
      previousHash: this.lastAuditHash
    };

    const recordStr = JSON.stringify(record, Object.keys(record).sort());
    const hash = crypto
      .createHash('sha256')
      .update((this.lastAuditHash || '') + '|' + recordStr)
      .digest('hex');

    record.auditHash = hash;
    this.lastAuditHash = hash;

    // Save to the knowledge graph
    const session = driver.session();
    try {
      await session.run(`
        CREATE (a:GodModeAudit {
          auditHash:    $hash,
          previousHash: $previousHash,
          eventType:    $eventType,
          sessionId:    $sessionId,
          adminId:      $adminId,
          data:         $dataStr,
          timestamp:    datetime($timestamp)
        })
      `, {
        hash,
        previousHash: record.previousHash || 'GENESIS',
        eventType,
        sessionId:    this.sessionId,
        adminId:      this.adminId,
        dataStr:      JSON.stringify(data),
        timestamp:    record.timestamp
      });
    } finally {
      await session.close();
    }
  }
}
```

**Example God Mode usage:**

```javascript
// Repairing a broken hash chain
async function repairHashChain(entityId) {
  const godMode = await GodModeSession.create('user:superadmin',
    `Repair corrupted hash chain for ${entityId}`);

  try {
    await godMode.execute('REPAIR_HASH_CHAIN', { entityId }, async () => {
      const session = driver.session();
      try {
        // Get all versions in order
        const result = await session.run(`
          MATCH (v:NodeVersion {entityId: $entityId})
          RETURN v ORDER BY v.sequenceNumber ASC
        `, { entityId });

        let previousHash = null;
        for (const record of result.records) {
          const node = record.get('v').properties;
          const contentHash = crypto
            .createHash('sha256')
            .update((previousHash || '') + '|' + node.content)
            .digest('hex');

          // GOD MODE: hash modification (normally forbidden)
          await session.run(`
            MATCH (v:NodeVersion {versionId: $vid})
            SET v.contentHash = $newHash
            SET v.previousHash = $prevHash
          `, {
            vid: node.versionId,
            newHash: contentHash,
            prevHash: previousHash
          });

          previousHash = contentHash;
        }

        return { entityId, versionsRepaired: result.records.length };
      } finally {
        await session.close();
      }
    });
  } finally {
    await godMode.close();
  }
}
```

---

## 3.6 Tombstones: Soft Delete with Restore Capability

### Soft Delete

When a version is deleted, it is not physically destroyed but is marked as DELETED. A Tombstone node is created that stores metadata for possible restoration.

**Soft delete code:**

```javascript
/**
 * Soft delete of an entity.
 * Creates a Tombstone, marks the ACTIVE version as DELETED,
 * saves orphaned edges for possible restoration.
 * Restoration window: 90 days.
 *
 * @param {string} entityId  -- entityId of the entity to delete
 * @param {string} reason    -- reason for deletion
 * @param {string} deletedBy -- who is deleting
 */
async function softDelete(entityId, reason, deletedBy) {
  const session = driver.session();
  try {
    const tombstoneId = `tombstone:${entityId}:${Date.now()}`;
    const restoreDeadline = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    // 1. Collect information about orphaned edges (before deletion)
    const edgesResult = await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "ACTIVE"})
      OPTIONAL MATCH (source)-[r]->(v)
      WHERE type(r) <> 'SUPERSEDES'
      RETURN type(r) AS relType,
             source.entityId AS sourceEntityId,
             source.versionId AS sourceVersionId,
             source.id AS sourceId,
             labels(source) AS sourceLabels,
             properties(r) AS relProps
    `, { entityId });

    const orphanedEdges = edgesResult.records.map(r => ({
      relType:         r.get('relType'),
      sourceEntityId:  r.get('sourceEntityId'),
      sourceVersionId: r.get('sourceVersionId'),
      sourceId:        r.get('sourceId'),
      sourceLabels:    r.get('sourceLabels'),
      relProps:        r.get('relProps')
    })).filter(e => e.relType !== null);

    // 2. Create Tombstone
    await session.run(`
      CREATE (t:Tombstone {
        tombstoneId:     $tombstoneId,
        entityId:        $entityId,
        deletedAt:       datetime(),
        deletedBy:       $deletedBy,
        reason:          $reason,
        restoreDeadline: datetime($restoreDeadline),
        orphanedEdges:   $orphanedEdgesStr,
        status:          "PENDING"
      })
    `, {
      tombstoneId,
      entityId,
      deletedBy,
      reason,
      restoreDeadline: restoreDeadline.toISOString(),
      orphanedEdgesStr: JSON.stringify(orphanedEdges)
    });

    // 3. Mark ACTIVE version as DELETED
    await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "ACTIVE"})
      SET v.status = "DELETED"
      SET v.deletedAt = datetime()
      SET v.deletedBy = $deletedBy
      SET v.tombstoneId = $tombstoneId
    `, { entityId, deletedBy, tombstoneId });

    // 4. Delete orphaned Bridge edges (data already in Tombstone)
    for (const edgeType of ['IMPLEMENTS', 'REFERENCES', 'GOVERNED_BY', 'DERIVED_FROM']) {
      await session.run(`
        MATCH (source)-[r:${edgeType}]->(v:NodeVersion {entityId: $entityId, status: "DELETED"})
        DELETE r
      `, { entityId });
    }

    return {
      tombstoneId,
      entityId,
      restoreDeadline: restoreDeadline.toISOString(),
      orphanedEdgesCount: orphanedEdges.length
    };
  } finally {
    await session.close();
  }
}
```

### Restoring from Tombstone

```javascript
/**
 * Restores an entity from a Tombstone.
 * Returns ACTIVE status, restores Bridge edges.
 *
 * @param {string} tombstoneId -- Tombstone ID to restore
 */
async function restoreFromTombstone(tombstoneId) {
  const session = driver.session();
  try {
    // 1. Verify that the Tombstone exists and has not expired
    const tombResult = await session.run(`
      MATCH (t:Tombstone {tombstoneId: $tombstoneId, status: "PENDING"})
      WHERE t.restoreDeadline > datetime()
      RETURN t
    `, { tombstoneId });

    if (tombResult.records.length === 0) {
      throw new Error(`Tombstone ${tombstoneId} not found, expired, or already used`);
    }

    const tombstone = tombResult.records[0].get('t').properties;
    const entityId = tombstone.entityId;
    const orphanedEdges = JSON.parse(tombstone.orphanedEdges || '[]');

    // 2. Restore ACTIVE status
    await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "DELETED", tombstoneId: $tombstoneId})
      SET v.status = "ACTIVE"
      REMOVE v.deletedAt
      REMOVE v.deletedBy
      REMOVE v.tombstoneId
      SET v.restoredAt = datetime()
      SET v.restoredFrom = $tombstoneId
    `, { entityId, tombstoneId });

    // 3. Restore Bridge edges
    let restoredEdges = 0;
    for (const edge of orphanedEdges) {
      try {
        // Find source node (can be Domain or NodeVersion)
        const sourceMatch = edge.sourceVersionId
          ? `(s:NodeVersion {versionId: "${edge.sourceVersionId}"})`
          : edge.sourceId
            ? `(s {id: "${edge.sourceId}"})`
            : null;

        if (!sourceMatch) continue;

        // Memgraph: explicit edge type required
        const edgeType = edge.relType;
        if (!['IMPLEMENTS', 'REFERENCES', 'GOVERNED_BY', 'DERIVED_FROM'].includes(edgeType)) {
          continue; // Do not restore unknown types
        }

        await session.run(`
          MATCH ${sourceMatch}
          MATCH (v:NodeVersion {entityId: $entityId, status: "ACTIVE"})
          CREATE (s)-[:${edgeType} $props]->(v)
        `, {
          entityId,
          props: { ...(edge.relProps || {}), restoredAt: new Date().toISOString() }
        });

        restoredEdges++;
      } catch (err) {
        // Source node may have been deleted -- skip
        console.warn(`Could not restore edge: ${err.message}`);
      }
    }

    // 4. Mark Tombstone as used
    await session.run(`
      MATCH (t:Tombstone {tombstoneId: $tombstoneId})
      SET t.status = "RESTORED"
      SET t.restoredAt = datetime()
    `, { tombstoneId });

    return {
      entityId,
      tombstoneId,
      restoredEdges,
      totalOrphanedEdges: orphanedEdges.length
    };
  } finally {
    await session.close();
  }
}
```

### Tombstone lifecycle

```
  (:NodeVersion)                                (:Tombstone)
  │ status: ACTIVE                              │ status: PENDING
  │                                             │ restoreDeadline: +90 days
  │                                             │
  ├──── soft delete ────────────────────────────>│
  │                                             │
  │ status: DELETED                             │
  │ tombstoneId: "tombstone:..."                │
  │                                             │
  │         Two possible outcomes:              │
  │                                             │
  │    [A] Restoration (before deadline):       │
  │         │                                   │
  │         ├── restore ────────────────────────>│ status: RESTORED
  │         │                                   │ restoredAt: datetime()
  │         v                                   │
  │  status: ACTIVE                             │
  │  restoredAt: datetime()                     │
  │  restoredFrom: "tombstone:..."              │
  │                                             │
  │    [B] Expiry (after 90 days):              │
  │         │                                   │
  │         ├── expire cron ────────────────────>│ status: EXPIRED
  │         │                                   │ expiredAt: datetime()
  │         v                                   │
  │  status: DELETED (permanent)                │
  │  (data pending physical cleanup)            │
  │                                             │
  └─────────────────────────────────────────────┘

  Transition summary:

    ACTIVE ──[soft delete]──> DELETED + Tombstone(PENDING)
    DELETED ──[restore]─────> ACTIVE  + Tombstone(RESTORED)
    DELETED ──[expire 90d]──> DELETED + Tombstone(EXPIRED) ──[purge]──> physical deletion
```

**Cron job for processing expired Tombstones:**

```javascript
/**
 * Processing expired Tombstones.
 * Runs on schedule (daily).
 * Marks expired Tombstones as EXPIRED.
 * Physical deletion is a separate process requiring God Mode.
 */
async function processExpiredTombstones() {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (t:Tombstone {status: "PENDING"})
      WHERE t.restoreDeadline < datetime()
      SET t.status = "EXPIRED"
      SET t.expiredAt = datetime()
      RETURN t.tombstoneId AS tid, t.entityId AS eid
    `);

    const expired = result.records.map(r => ({
      tombstoneId: r.get('tid'),
      entityId:    r.get('eid')
    }));

    if (expired.length > 0) {
      console.log(`Processed ${expired.length} expired tombstones:`, expired);
    }

    return expired;
  } finally {
    await session.close();
  }
}
```

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Part IV: CODEX-NS — Namespace Standard

**Status:** 🟡 In development
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Table of Contents

- [4.1 Four Namespaces](#41-four-namespaces)
- [4.2 Routing rules](#42-routing-rules)
- [4.3 Cross-namespace queries](#43-cross-namespace-queries)
- [4.4 Isolation guarantees](#44-isolation-guarantees)
- [4.5 ExecutionRecord — why META, not PROJECT](#45-executionrecord--why-meta-not-project)

---

## Preamble

Namespace is the isolation mechanism in UN ProjectAdvisor. Every node and every edge in the knowledge graph belongs to exactly one namespace. Namespace determines:

- **Visibility:** who can read the data
- **Mutability:** who can write the data
- **Routing:** where requests are directed
- **Isolation:** which data must not intersect

The four namespaces ensure separation between system knowledge (`CORE`), project data (`PROJECT`), meta-knowledge (`META`), and shared resources (`COMMON`).

```
Principle: data is separated by NATURE, not by storage technology.
One Memgraph, one Qdrant, one Redis — but four logical circuits.
```

---

## 4.1 Four Namespaces

### Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │            UN ProjectAdvisor KG              │
                    │                                              │
  ┌─────────────────┼──────────────────────────────────────────────┼─────────────────┐
  │                 │                                              │                 │
  │   ┌─────────┐  │  ┌─────────────────────────────────────┐     │  ┌──────────┐   │
  │   │  CORE   │  │  │             PROJECT                 │     │  │   META   │   │
  │   │         │  │  │                                     │     │  │          │   │
  │   │ Service │  │  │  ┌──────────┐  ┌──────────┐        │     │  │ Strategy │   │
  │   │Pipeline │◄─┼──┼──│PROJECT:  │  │PROJECT:  │        │     │  │ Pattern  │   │
  │   │ Config  │  │  │  │  imis    │  │  umoja   │        │     │  │ Decision │   │
  │   │ Schema  │  │  │  └──────────┘  └──────────┘        │     │  │ Quality  │   │
  │   │   API   │  │  │       ▲              ▲             │     │  │ Execution│   │
  │   └────┬────┘  │  │       │   ISOLATED   │             │     │  └────┬─────┘   │
  │        │       │  │       └──────╳───────┘             │     │       │         │
  │        │       │  └─────────────────────────────────────┘     │       │         │
  │        │       │                                              │       │         │
  │        │       │         ┌──────────────┐                     │       │         │
  │        │       │         │   COMMON     │                     │       │         │
  │        └───────┼────────►│              │◄────────────────────┼───────┘         │
  │                │         │  Ontology    │                     │                 │
  │                │         │  Glossary    │                     │                 │
  │                │         │  UN Vocab    │                     │                 │
  │                │         │  Templates   │                     │                 │
  │                │         └──────────────┘                     │                 │
  └─────────────────┼──────────────────────────────────────────────┼─────────────────┘
                    └──────────────────────────────────────────────┘

  Arrows = permitted cross-namespace READ
  ╳ = forbidden direct links between PROJECTs
```

### CORE — System knowledge

**Enum:** `KnowledgeNamespace.CORE = 'core'`

Knowledge about UN ProjectAdvisor itself: its services, pipelines, configurations, API schemas, and architectural decisions.

| Property | Value |
|----------|----------|
| **Purpose** | System knowledge about PA |
| **Example nodes** | `Service`, `Pipeline`, `Component`, `Config`, `Schema`, `API`, `Architecture`, `Decision` |
| **Namespace format** | `core` |
| **Update frequency** | At system releases |
| **Read** | `DEVELOPER`, `ARCHITECT`, `ADMIN` |
| **Write** | `ARCHITECT`, `ADMIN` |
| **Qdrant collection** | `core_knowledge` |
| **Redis prefix** | `core:` |
| **Cache TTL** | 3600 s (1 hour) |

**Example node:**

```cypher
(:Service {
  id: 'svc-memgraph-001',
  name: 'MemgraphService',
  namespace: 'core',
  fullNamespace: 'core',
  description: 'Graph database connector for knowledge storage',
  createdAt: '2026-01-15T10:00:00Z'
})
```

### PROJECT — Project data

**Enum:** `KnowledgeNamespace.PROJECT = 'project'`

Extracted knowledge from UN legacy systems. Each project is stored in its own sub-namespace `PROJECT:{project_name}`. Projects are fully isolated from each other — direct edges between `PROJECT:imis` and `PROJECT:umoja` are forbidden.

| Property | Value |
|----------|----------|
| **Purpose** | Legacy project data |
| **Example nodes** | `File`, `Class`, `Method`, `WorkItem`, `Table`, `StoredProcedure`, `BusinessRule`, `Person`, `Team` |
| **Namespace format** | `project:{project_name}` (e.g., `project:imis`, `project:umoja`) |
| **Update frequency** | On re-indexing |
| **Read** | All roles (`VIEWER` and above) |
| **Write** | `DEVELOPER`, `ARCHITECT`, `ADMIN`, `SYSTEM` |
| **Qdrant collection** | `project_{project_name}` (e.g., `project_imis`) |
| **Redis prefix** | `project:{project_name}:` |
| **Cache TTL** | 1800 s (30 minutes) |

**Example node:**

```cypher
(:StoredProcedure {
  id: 'sp-imis-getUserRoles',
  name: 'sp_getUserRoles',
  namespace: 'project',
  fullNamespace: 'project:imis',
  sourceSystem: 'IMIS',
  language: 'T-SQL',
  createdAt: '2026-02-20T14:30:00Z'
})
```

### META — Meta-knowledge

**Enum:** `KnowledgeNamespace.META = 'meta'`

Knowledge about knowledge: extraction strategies, processing patterns, pipeline execution records, quality metrics. META is about HOW the system works and learns, not WHAT it extracts.

| Property | Value |
|----------|----------|
| **Purpose** | Methodological knowledge, strategies, execution records |
| **Example nodes** | `Strategy`, `DataType`, `Tool`, `ContextPattern`, `StrategyExecution`, `ExtractionCycle`, `DecisionRecord`, `QualityRule` |
| **Namespace format** | `meta` |
| **Update frequency** | As the system learns |
| **Read** | `ARCHITECT`, `ADMIN`, `SYSTEM` |
| **Write** | `SYSTEM`, `ADMIN` |
| **Qdrant collection** | `meta_knowledge` |
| **Redis prefix** | `meta:` |
| **Cache TTL** | 7200 s (2 hours) |

**Example node:**

```cypher
(:Strategy {
  id: 'strat-sql-schema-extraction',
  name: 'SQL Schema Extraction',
  namespace: 'meta',
  fullNamespace: 'meta',
  successRate: 0.92,
  totalExecutions: 47,
  createdAt: '2026-01-10T08:00:00Z'
})
```

### COMMON — Shared resources

**Enum:** `KnowledgeNamespace.COMMON = 'common'`

Dictionaries, glossaries, templates, and reference data used by all other namespaces. Contains the UN ontology, abbreviations, and organizational structure. Write access only for approved contributors (`ADMIN`).

| Property | Value |
|----------|----------|
| **Purpose** | Common terminology, dictionaries, reference data |
| **Example nodes** | `Term`, `Concept`, `Organization`, `System`, `DocumentPattern`, `Glossary`, `Acronym`, `UNEntity` |
| **Namespace format** | `common` |
| **Update frequency** | Rarely |
| **Read** | All roles (`VIEWER` and above) |
| **Write** | `ADMIN` only |
| **Qdrant collection** | `common_vocabulary` |
| **Redis prefix** | `common:` |
| **Cache TTL** | 86400 s (24 hours) |

**Example node:**

```cypher
(:Acronym {
  id: 'acr-oict',
  name: 'OICT',
  namespace: 'common',
  fullNamespace: 'common',
  fullForm: 'Office of Information and Communications Technology',
  organization: 'United Nations Secretariat',
  createdAt: '2026-01-05T12:00:00Z'
})
```

---

## 4.2 Routing rules

### Auto-detection algorithm for namespace

When a request comes in, `NamespaceRouter` determines the target namespace by the following algorithm:

```javascript
/**
 * Routing algorithm (namespace-router.service.js)
 *
 * Priority:
 *   1. Explicitly specified namespace (explicitNamespace)
 *   2. Detection by sourceSystem / projectId
 *   3. Detection by label / node type
 *   4. Request text analysis (regex patterns)
 *   5. Default → 'project' (for pipeline writes) or 'common' (for queries)
 */
async function resolveNamespace(context) {
  const { explicitNamespace, sourceSystem, label, query } = context;

  // [1] Explicit namespace — highest priority
  if (explicitNamespace) {
    if (!checkAccess(explicitNamespace, context.userRole, 'read')) {
      throw new Error(`Access denied to namespace: ${explicitNamespace}`);
    }
    return explicitNamespace;
  }

  // [2] By sourceSystem — if data came from a specific project
  if (sourceSystem) {
    const projectName = sourceSystem.toLowerCase();
    return `project:${projectName}`;
  }

  // [3] By label — each namespace has allowedNodeLabels
  if (label) {
    for (const [ns, config] of Object.entries(NAMESPACE_CONFIGS)) {
      if (config.allowedNodeLabels.includes(label)) {
        return ns === 'project' ? 'project:unknown' : ns;
      }
    }
  }

  // [4] By query text — regex analysis
  if (query) {
    const scores = analyzeQueryPatterns(query);
    const bestMatch = Object.entries(scores)
      .sort(([, a], [, b]) => b - a)[0];
    if (bestMatch && bestMatch[1] > 0) {
      return bestMatch[0];
    }
  }

  // [5] Default
  return 'common';
}
```

### Regex detection patterns

`NamespaceRouter` uses the following patterns for query text analysis:

| Namespace | Patterns | Example matches |
|-----------|----------|--------------------|
| `core` | `/\b(pipeline\|service\|component\|api\|architecture)\b/i` | "How does the pipeline work?" |
| `core` | `/\b(memgraph\|qdrant\|redis\|bullmq)\s+(service\|config)/i` | "memgraph service configuration" |
| `project` | `/\b(imis\|umoja\|inspira\|galileo\|mercury\|atlas)\b/i` | "Show IMIS stored procedures" |
| `project` | `/\b(work\s*item\|bug\|feature\|epic)\s*#?\d+/i` | "work item #12345" |
| `project` | `/\b(stored\s*proc\|table\|column)\s+in/i` | "table in UMOJA" |
| `meta` | `/\b(strategy\|approach\|method)\s+for\s+(extraction\|analysis)/i` | "strategy for extraction" |
| `meta` | `/\b(success\s+rate\|accuracy\|performance)\s+of/i` | "success rate of SQL extraction" |
| `common` | `/\b(what\s+is\|define\|meaning\s+of)\s+(\w+)/i` | "what is OICT" |
| `common` | `/\b(acronym\|abbreviation\|term\|glossary)/i` | "UN acronym list" |
| `common` | `/\b(un\s+organization\|department\|unit\|oict\|dgacm)/i` | "DGACM structure" |

### Label routing table

| Label | Namespace | Example |
|-------|-----------|--------|
| `Service`, `Pipeline`, `Component` | `core` | PA API gateway service |
| `Config`, `Schema`, `API` | `core` | GraphQL schema definition |
| `Architecture`, `Decision` | `core` | ADR-005: Memgraph selection |
| `File`, `Class`, `Method`, `Function` | `project:{name}` | `UserManager` class from IMIS |
| `WorkItem`, `Epic`, `Bug`, `Task` | `project:{name}` | Work item #42300 from IMIS |
| `Table`, `Column`, `StoredProcedure` | `project:{name}` | `HR_EMPLOYEES` table from Umoja |
| `BusinessRule`, `BusinessProcess` | `project:{name}` | Contract validation rule |
| `Strategy`, `ContextPattern` | `meta` | SQL schema extraction strategy |
| `StrategyExecution`, `ExtractionCycle` | `meta` | Pipeline execution record |
| `DecisionRecord`, `QualityRule` | `meta` | Decision to change strategy |
| `Term`, `Concept`, `Glossary` | `common` | Term "appropriation" |
| `Acronym`, `UNEntity` | `common` | OICT, DGACM, ACABQ |
| `Organization`, `System` | `common` | United Nations Secretariat |
| `DocumentPattern` | `common` | General Assembly resolution template |

### Storage path determination

Each namespace maps to specific storage paths:

```javascript
// namespace.config.js — getStoragePaths()

// For PROJECT namespace, path is built dynamically:
getStoragePaths('project:imis')
// → {
//     graphPrefix:      'project:imis',
//     qdrantCollection: 'project_imis',
//     redisPrefix:      'project:imis:',
//     storagePath:      '/knowledge/projects/imis'
//   }

// For other namespaces — static paths:
getStoragePaths('core')
// → {
//     graphPrefix:      'core',
//     qdrantCollection: 'core_knowledge',
//     redisPrefix:      'core:',
//     storagePath:      '/knowledge/core'
//   }
```

---

## 4.3 Cross-namespace queries

### Permitted patterns

**1. READ from any namespace (with appropriate access rights)**

Reading is always permitted if the user's role is in the `readRoles` of the target namespace.

```cypher
// Query CORE — service information
MATCH (s:Service {namespace: 'core'})
WHERE s.name CONTAINS 'Memgraph'
RETURN s.name, s.description;

// Query PROJECT — specific project data
MATCH (sp:StoredProcedure {fullNamespace: 'project:imis'})
WHERE sp.name STARTS WITH 'sp_get'
RETURN sp.name, sp.language;

// Query COMMON — reference data
MATCH (a:Acronym {namespace: 'common'})
WHERE a.name = 'OICT'
RETURN a.fullForm;
```

**2. JOIN between PROJECT and COMMON (enriching project data with reference data)**

Project data often references common terminology. Such cross-namespace queries are executed via isCrossNamespace edges.

```cypher
// Find all IMIS tables linked to an organization from COMMON
MATCH (t:Table {fullNamespace: 'project:imis'})
      -[r:REFERENCES_ENTITY {isCrossNamespace: true}]->
      (org:Organization {namespace: 'common'})
RETURN t.name AS tableName, org.name AS organization;

// Enrich business rules with glossary terms
MATCH (br:BusinessRule {fullNamespace: 'project:umoja'})
      -[:USES_TERM {isCrossNamespace: true}]->
      (term:Term {namespace: 'common'})
RETURN br.name, collect(term.name) AS relatedTerms;
```

**3. META reads from PROJECT (analyzing extraction results)**

META knowledge is linked to project data through execution records and strategies.

```cypher
// What strategies were used for the IMIS project
MATCH (se:StrategyExecution {namespace: 'meta'})
WHERE se.targetProject = 'imis'
MATCH (se)-[:USED_STRATEGY]->(s:Strategy {namespace: 'meta'})
RETURN s.name, se.successRate, se.executedAt;

// Aggregate quality metrics by project
MATCH (qr:QualityRule {namespace: 'meta'})
      -[:EVALUATED]->(cycle:ExtractionCycle {namespace: 'meta'})
WHERE cycle.targetNamespace STARTS WITH 'project:'
RETURN cycle.targetNamespace, avg(qr.score) AS avgQuality;
```

**4. CORE reads from COMMON (configuration references organizational structure)**

```cypher
// Which PA services serve organizations from COMMON
MATCH (svc:Service {namespace: 'core'})
      -[:SERVES {isCrossNamespace: true}]->
      (org:Organization {namespace: 'common'})
RETURN svc.name, org.name;
```

### Forbidden patterns

**1. Direct edges between different PROJECTs**

Each project is an isolated boundary. Direct links between `PROJECT:imis` and `PROJECT:umoja` are forbidden.

```cypher
// FORBIDDEN: direct edge between projects
MATCH (a:Table {fullNamespace: 'project:imis'}),
      (b:Table {fullNamespace: 'project:umoja'})
CREATE (a)-[:SIMILAR_TO]->(b);
// ^^^ Isolation violation! Use COMMON for linking.

// CORRECT APPROACH: link via COMMON
MATCH (a:Table {fullNamespace: 'project:imis'}),
      (b:Table {fullNamespace: 'project:umoja'}),
      (concept:Concept {namespace: 'common'})
WHERE concept.name = 'HR_DataModel'
CREATE (a)-[:IMPLEMENTS {isCrossNamespace: true}]->(concept),
       (b)-[:IMPLEMENTS {isCrossNamespace: true}]->(concept);
```

**2. Writing to CORE from pipeline code**

CORE is read-only for pipelines. Only `ARCHITECT` and `ADMIN` may modify system knowledge.

```cypher
// FORBIDDEN: pipeline writes to CORE
// In executor code:
// await memgraph.mergeNode('Service', { namespace: 'core', ... });
// ^^^ Rejection: writeRoles does not include SYSTEM for CORE

// CORRECT: pipeline writes to META or PROJECT
// await memgraph.mergeNode('ExtractionCycle', { namespace: 'meta', ... });
```

**3. Modifying COMMON without approval**

COMMON contains dictionaries and ontologies used by all namespaces. Changes require the `ADMIN` role.

```cypher
// FORBIDDEN: developer adds a term to COMMON
// checkAccess('common', 'DEVELOPER', 'write') → false

// CORRECT: ADMIN only
// checkAccess('common', 'ADMIN', 'write') → true
MERGE (t:Term {id: $id, namespace: 'common'})
SET t.name = 'appropriation',
    t.definition = 'Authorization granted by the General Assembly...',
    t.createdAt = datetime();
```

**4. Writing META data into PROJECT namespace**

Execution records, strategies, and quality metrics are meta-knowledge. They describe how the system operates, not extracted project data.

```cypher
// FORBIDDEN: ExecutionRecord in PROJECT
CREATE (er:ExecutionRecord {
  namespace: 'project',
  fullNamespace: 'project:imis',
  ...
});
// ^^^ Violation! ExecutionRecord is always META. See section 4.5.

// CORRECT:
CREATE (er:ExecutionRecord {
  namespace: 'meta',
  fullNamespace: 'meta',
  targetProject: 'imis',
  ...
});
```

---

## 4.4 Isolation guarantees

### Isolation rules table

| Rule | Guarantee | Enforcement |
|------|-----------|-------------|
| **PROJECT:X ↛ PROJECT:Y** | Direct edges between different projects are forbidden | `mergeRelationship()` + namespace check |
| **CORE immutable for pipelines** | SYSTEM role has no write access to CORE | `checkAccess('core', 'SYSTEM', 'write') → false` |
| **COMMON write = ADMIN only** | Only ADMIN can modify shared resources | `writeRoles: [UserRole.ADMIN]` |
| **META write = SYSTEM + ADMIN** | Pipelines write to META automatically | `writeRoles: [UserRole.SYSTEM, UserRole.ADMIN]` |
| **Label → Namespace binding** | Each label is allowed only in certain namespaces | `isLabelAllowed(namespace, label)` |
| **Cross-namespace marking** | All cross-namespace edges have `isCrossNamespace: true` | `_markCrossNamespaceRefs()` |
| **PROJECT namespace always with projectId** | `project` without a qualifier is forbidden in production | Routing validation |

### Enforcement in memgraph.service.js

The primary enforcement is implemented in `mergeRelationship()` via the `isCrossNamespace` parameter and in `_markCrossNamespaceRefs()`:

```javascript
/**
 * memgraph.service.js — cross-namespace edge enforcement
 */
async mergeRelationship(fromId, toId, type, properties = {}, isCrossNamespace = false) {
  // ...

  const relProps = {
    ...properties,
    isCrossNamespace,            // Mark cross-namespace edge
    createdAt: new Date().toISOString()
  };

  // MERGE edge
  const query = `
    MATCH (a), (b)
    WHERE a.id = $fromId AND b.id = $toId
    MERGE (a)-[r:${type}]->(b)
    SET r += $properties
    RETURN r
  `;
  await session.run(query, { fromId, toId, properties: relProps });

  // Mark nodes as participants in a cross-namespace link
  if (isCrossNamespace) {
    await this._markCrossNamespaceRefs(session, fromId, toId);
  }
}

/**
 * Mark nodes participating in cross-namespace links.
 * Allows quickly finding "boundary" nodes.
 */
async _markCrossNamespaceRefs(session, fromId, toId) {
  const query = `
    MATCH (a {id: $fromId}), (b {id: $toId})
    WHERE a.fullNamespace <> b.fullNamespace
    SET a.hasCrossNamespaceRefs = true,
        b.hasCrossNamespaceRefs = true
  `;
  await session.run(query, { fromId, toId });
}
```

Access control is implemented in `NamespaceRouter.checkAccess()`:

```javascript
/**
 * namespace-router.service.js — access check
 */
checkAccess(namespace, userRole, operation = 'read') {
  // Wildcard project namespace → base 'project'
  if (namespace === 'project:*') {
    namespace = 'project';
  }

  const config = getNamespaceConfig(namespace);
  if (!config) return false;

  if (operation === 'read') {
    return config.access.publicRead || config.access.readRoles.includes(userRole);
  }
  if (operation === 'write') {
    return config.access.writeRoles.includes(userRole);
  }
  if (operation === 'admin') {
    return config.access.adminRoles.includes(userRole);
  }

  return false;
}
```

Label validation via `isLabelAllowed()`:

```javascript
/**
 * namespace.config.js — label allowance check in namespace
 */
function isLabelAllowed(fullNamespace, label) {
  const config = getNamespaceConfig(fullNamespace);
  if (!config) return false;
  return config.allowedNodeLabels.includes(label);
}

// Examples:
isLabelAllowed('core', 'Service')          // → true
isLabelAllowed('core', 'Table')            // → false (Table — PROJECT)
isLabelAllowed('project:imis', 'Table')    // → true
isLabelAllowed('common', 'StoredProcedure') // → false (SP — PROJECT)
isLabelAllowed('meta', 'Strategy')         // → true
```

### Audit of cross-namespace operations

The following audit query is used to monitor cross-namespace links:

```cypher
// Find all cross-namespace edges
MATCH (a)-[r {isCrossNamespace: true}]->(b)
RETURN a.fullNamespace AS fromNS,
       b.fullNamespace AS toNS,
       type(r) AS relType,
       count(r) AS edgeCount
ORDER BY edgeCount DESC;

// Find violations: direct edges between different PROJECTs
MATCH (a)-[r]->(b)
WHERE a.namespace = 'project'
  AND b.namespace = 'project'
  AND a.fullNamespace <> b.fullNamespace
  AND (r.isCrossNamespace IS NULL OR r.isCrossNamespace = false)
RETURN a.fullNamespace AS fromProject,
       b.fullNamespace AS toProject,
       type(r) AS relType,
       a.id AS fromId,
       b.id AS toId;

// Find nodes with incorrect label for their namespace
MATCH (n)
WHERE n.namespace IS NOT NULL
  AND n.namespace = 'core'
  AND NOT n:Service AND NOT n:Pipeline AND NOT n:Component
  AND NOT n:Config AND NOT n:Schema AND NOT n:API
  AND NOT n:Documentation AND NOT n:Architecture
  AND NOT n:Decision AND NOT n:Worker
RETURN labels(n) AS wrongLabels, n.id, n.namespace;

// Statistics by namespace
MATCH (n)
WHERE n.namespace IS NOT NULL
RETURN n.namespace AS namespace,
       count(n) AS nodeCount,
       collect(DISTINCT labels(n)) AS labelTypes
ORDER BY namespace;
```

---

## 4.5 ExecutionRecord — why META, not PROJECT

### Current problem

In the current `RuntimeAdapter` implementation (`api/src/services/immutable-graph/integration/runtime-adapter.ts`), `ExecutionRecord` nodes are written to the PROJECT namespace:

```typescript
// runtime-adapter.ts — CURRENT state (INCORRECT)
export class RuntimeAdapter {
  private static readonly PATTERN_NODE_TYPE = 'ExecutionPattern';
  private static readonly EXECUTION_NODE_TYPE = 'ExecutionRecord';
  private static readonly PATTERN_NAMESPACE = Namespace.PROJECT;  // ← PROBLEM

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string = 'gxe-patterns'
  ) {}

  async recordExecution(result: ExecutionResult): Promise<RecordResult> {
    // ...
    await this.createExecutionRecord(result, pattern.entityId);
    // ^^^ Written to PROJECT namespace via PATTERN_NAMESPACE
  }
}
```

This means pipeline execution records end up in `project:gxe-patterns`, mixed with project data.

### Target state

`ExecutionRecord` and `ExecutionPattern` must always be written to the `META` namespace:

```typescript
// runtime-adapter.ts — TARGET state (CORRECT)
export class RuntimeAdapter {
  private static readonly PATTERN_NODE_TYPE = 'ExecutionPattern';
  private static readonly EXECUTION_NODE_TYPE = 'ExecutionRecord';
  private static readonly PATTERN_NAMESPACE = Namespace.META;  // ← FIXED

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string = 'execution-records'  // ← Descriptive ID
  ) {}
}
```

### Rationale

| Argument | Explanation |
|----------|-------------|
| **Data nature** | ExecutionRecord describes HOW the system operated (time, status, metrics), not WHAT was extracted. By definition this is meta-knowledge. |
| **Cross-project analytics** | Comparing strategy effectiveness across projects requires a single namespace. If records are scattered across `project:imis`, `project:umoja` — aggregation requires multi-namespace queries. |
| **Label consistency** | `ExecutionRecord` and `StrategyExecution` are in `allowedNodeLabels` for META (`Strategy`, `StrategyExecution`, `ExtractionCycle`, `DecisionRecord`), but not for PROJECT. |
| **Immutability** | An execution record must never be changed. The META namespace enforces this via write-only for SYSTEM. |
| **PROJECT cleanliness** | Project data should contain only knowledge extracted from legacy systems. System metrics pollute the project graph. |
| **Link to project** | The reference to a project is preserved via the `targetProject` property, not through the namespace. This allows filtering by project without violating isolation. |

### Migration

To move existing `ExecutionRecord` nodes from PROJECT to META:

```cypher
// Step 1: Find all ExecutionRecord nodes in PROJECT namespace
MATCH (er:ExecutionRecord)
WHERE er.namespace = 'project'
RETURN count(er) AS recordsToMigrate;

// Step 2: Update namespace
MATCH (er:ExecutionRecord)
WHERE er.namespace = 'project'
SET er.namespace = 'meta',
    er.fullNamespace = 'meta',
    er.targetProject = CASE
      WHEN er.fullNamespace STARTS WITH 'project:'
      THEN substring(er.fullNamespace, 8)
      ELSE 'unknown'
    END,
    er.migratedAt = datetime(),
    er.migrationReason = 'CODEX-NS-4.5: ExecutionRecord belongs to META';

// Step 3: Update related ExecutionPattern nodes
MATCH (ep:ExecutionPattern)
WHERE ep.namespace = 'project'
SET ep.namespace = 'meta',
    ep.fullNamespace = 'meta',
    ep.targetProject = CASE
      WHEN ep.fullNamespace STARTS WITH 'project:'
      THEN substring(ep.fullNamespace, 8)
      ELSE 'unknown'
    END,
    ep.migratedAt = datetime(),
    ep.migrationReason = 'CODEX-NS-4.5: ExecutionPattern belongs to META';

// Step 4: Verification
MATCH (er:ExecutionRecord)
WHERE er.namespace = 'project'
RETURN count(er) AS remainingInProject;
// Expected result: 0

MATCH (er:ExecutionRecord {namespace: 'meta'})
RETURN count(er) AS migratedRecords,
       collect(DISTINCT er.targetProject) AS projects;
```

After migration, update `runtime-adapter.ts`:
- Change `PATTERN_NAMESPACE` from `Namespace.PROJECT` to `Namespace.META`
- Add `ExecutionRecord` to `allowedNodeLabels` of the META namespace configuration
- Update the constructor `projectId` to a descriptive value instead of `'gxe-patterns'`

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Part V: CODEX-VALID — Validation Standard

**Status:** 🟡 In development
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Table of Contents

- [5.1 Schema Registry: single source of truth](#51-schema-registry-single-source-of-truth)
- [5.2 Pre-write validation](#52-pre-write-validation)
- [5.3 Post-write verification](#53-post-write-verification)
- [5.4 Duplicate detection](#54-duplicate-detection)
- [5.5 Orphan detection](#55-orphan-detection)
- [5.6 Index management](#56-index-management)
- [Appendix: Validation error codes](#appendix-validation-error-codes)

---

## 5.1 Schema Registry: single source of truth

### Architecture

Schema Registry is a centralised registry of JSON Schema definitions for all entities in the knowledge graph. Implemented in `api/src/validation/schema-registry.js`.

```
┌─────────────────────────────────────────────────────────┐
│                    SchemaRegistry                        │
│                                                         │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │
│  │  ajv      │  │  Schemas  │  │  Validators       │   │
│  │  engine   │  │  Map<id,  │  │  validateBaseNode  │   │
│  │  +formats │  │  schema>  │  │  validateNodeVer   │   │
│  └───────────┘  └───────────┘  │  validateEdgeVer   │   │
│                                │  validateCatalog   │   │
│                                │  validateProvenance│   │
│                                │  validateGraphVer  │   │
│                                │  validateExecRec   │   │
│                                └───────────────────┘   │
│                                                         │
│  Functions:                                              │
│  - register(schema)     — register/replace               │
│  - validate(id, data)   — validate data                  │
│  - listSchemas()        — list all IDs                   │
│  - getSchema(id)        — get raw schema                 │
│  - getSchemaRegistry()  — singleton                      │
└─────────────────────────────────────────────────────────┘
```

### Built-in schemas

| # | Schema ID | Description | Required fields | Strict |
|---|-----------|-------------|-----------------|--------|
| 1 | `codex://schemas/base-node` | Minimum contract for any node | id, createdAt, namespace | No |
| 2 | `codex://schemas/provenance` | Provenance (W3C PROV-O) | sourceType, sourceId, confidence | No |
| 3 | `codex://schemas/node-version` | Immutable node with bi-temporal and hash chain | 9 fields (versionId, entityId, namespace, sequenceNumber, status, ttStart, contentHash, chainHash, nodeType) | Yes |
| 4 | `codex://schemas/edge-version` | Immutable edge with hash chain | 10 fields | Yes |
| 5 | `codex://schemas/catalog-entry` | GXE catalog entry | entryId, name, type, namespace, createdAt | No |
| 6 | `codex://schemas/graph-version` | Graph version snapshot | versionId, versionNumber, createdAt, contentHash | Yes |
| 7 | `codex://schemas/execution-record` | Execution log | executionId, dagId, status, executedAt | No |

### Extension rules

New node types must inherit from `BaseNodeSchema` via `allOf` composition:

```json
{
  "$id": "codex://schemas/business-rule",
  "allOf": [
    { "$ref": "codex://schemas/base-node" },
    {
      "type": "object",
      "required": ["description", "sourceTable"],
      "properties": {
        "description": { "type": "string" },
        "sourceTable": { "type": "string" },
        "inferredBy": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
      }
    }
  ]
}
```

**Rule:** Every new node type in the knowledge graph MUST have a corresponding JSON Schema in the Registry before it is used.

---

## 5.2 Pre-write validation

### Interception points

Validation is performed BEFORE every write operation to Memgraph:

| Operation | File | Current validation | Target validation |
|-----------|------|--------------------|-------------------|
| `mergeNode()` | memgraph.service.js:386 | `if (!id)` only | Schema + fingerprint + business rules |
| `mergeRelationship()` | memgraph.service.js:445 | None | Node existence check + edge schema |
| `createNode()` (graph-gen) | mssql.graph-generator.js:398 | None | BaseNode schema + provenance |
| `saveEntityWithProvenance()` | GraphStorageService.js:66 | Provenance only | Full schema + provenance + fingerprint |
| `createNode()` (immutable) | immutable-graph.service.ts:72 | None | NodeVersion schema + hash chain |
| `createCatalogEntry()` | graphCatalog.service.js:141 | None | CatalogEntry schema |

### Validation algorithm

```
                         ┌──────────────┐
                         │  Input       │
                         │  data        │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  1. Detect   │  Determine node type
                         │     Schema   │  by label / context
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  2. JSON     │  Check required fields,
                         │     Schema   │  types, enum, format
                         │     Check    │
                         └──────┬───────┘
                                │
                        ┌───────▼───────┐
                 ┌──────│  valid?       │──────┐
                 │ No   └───────────────┘ Yes  │
                 │                              │
          ┌──────▼──────┐               ┌──────▼───────┐
          │ REJECT      │               │  3. Business │  Check
          │ VAL001-003  │               │     Rules    │  business rules
          └─────────────┘               └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │  4. Finger-  │  Check
                                        │     print    │  duplicates
                                        │     Check    │
                                        └──────┬───────┘
                                               │
                                  ┌────────────▼────────────┐
                           ┌─────│  collision?              │─────┐
                           │ Yes └──────────────────────────┘ No  │
                           │                                      │
                    ┌──────▼──────┐                        ┌──────▼──────┐
                    │  Apply      │                        │  5. WRITE   │
                    │  Policy     │                        │  to DB      │
                    │  (see 5.4)  │                        └─────────────┘
                    └─────────────┘
```

### Required fields by level

**Level 0 — MANDATORY (for ANY node):**
- `id` — UUID v4
- `createdAt` — ISO 8601 datetime
- `namespace` — one of: CORE, PROJECT, META, COMMON

**Level 1 — PROVENANCE (for extracted data):**
- `sourceType` — enum: llm, user, system, import, pipeline, agent
- `sourceId` — source ID (model, user, pipeline ID)
- `extractionCycleId` — extraction cycle UUID
- `confidence` — number from 0.0 to 1.0

**Level 2 — VERSION (for versioned nodes):**
- `versionId` — version UUID
- `sequenceNumber` — sequence number (integer >= 1)
- `status` — enum: DRAFT, ACTIVE, SUPERSEDED, DEPRECATED, MERGED, DELETED
- `ttStart` — transaction time start (ISO 8601)
- `contentHash` — SHA-256 hex (64 characters)
- `chainHash` — Merkle chain hash (64 characters)

**Level 3 — EDGE (for edges):**
- `sourceEntityId` — source node ID
- `targetEntityId` — target node ID
- `edgeType` — relationship type (string)

### Integration code

Recommended integration pattern in `memgraph.service.js`:

```javascript
const { getSchemaRegistry, checkFingerprintCollision } = require('../validation/schema-registry');

async mergeNode(label, properties) {
  // CODEX-VALID: Pre-write validation
  const registry = getSchemaRegistry();
  const schemaId = this._resolveSchemaId(label);
  if (schemaId) {
    const { valid, errors } = registry.validate(schemaId, properties);
    if (!valid) {
      throw new CodexValidationError('VAL001', `Schema validation failed for ${label}`, errors);
    }
  }

  // CODEX-VALID: Fingerprint check (if contentHash present)
  if (properties.contentHash) {
    const collision = await checkFingerprintCollision(this, properties.contentHash, properties.namespace);
    if (collision.exists && collision.action === 'reject') {
      throw new CodexValidationError('VAL004', `Duplicate content: ${collision.existingNodeId}`);
    }
  }

  // ... existing MERGE logic ...
}
```

---

## 5.3 Post-write verification

### When to apply

Post-write check performs a read-after-write to confirm write integrity.

| Operation | Post-write check | Rationale |
|-----------|-----------------|-----------|
| NodeVersion create | **YES** | Hash chain integrity — critical |
| EdgeVersion create | **YES** | Bi-temporal consistency — critical |
| CatalogEntry create | **YES** | SUPERSEDES chain integrity |
| mergeNode (domain) | No | MERGE is idempotent, eventual consistency is acceptable |
| mergeRelationship | No | Idempotent MERGE |
| Qdrant upsert | **YES** (async) | Verify that the vector was written (polystore sync) |

### Algorithm

```
  WRITE to Memgraph
        │
        ▼
  READ back by ID
        │
        ▼
  Compare critical fields
  (contentHash, chainHash, status)
        │
   ┌────▼────┐
   │ match?  │──── Yes ──→ OK
   └────┬────┘
        │ No
        ▼
  Log INCONSISTENCY (VAL007)
  Retry write (max 2)
        │
        ▼
  If still mismatch → ALERT + manual review
```

### Hash chain verification

For NodeVersion after writing:

```javascript
// Read back the written version
const written = await readNodeVersion(versionId);

// Verify hash chain
const expectedChainHash = HashService.calculateChainHash(
  written.contentHash,
  previousVersion?.chainHash || null
);

if (written.chainHash !== expectedChainHash) {
  throw new CodexValidationError('VAL007', 'Hash chain integrity broken');
}
```

---

## 5.4 Duplicate detection

### Strategy: three-tier approach

**Level 1 — Fingerprint (fast, exact)**

SHA-256 of normalised content:
```javascript
const fingerprint = crypto.createHash('sha256')
  .update(JSON.stringify({
    entityId: node.entityId,
    nodeType: node.nodeType,
    namespace: node.namespace,
    properties: sortKeys(node.properties)
  }))
  .digest('hex');
```

**Level 2 — Normalized form (for entity resolution)**

```cypher
MATCH (n {normalizedForm: $normalizedForm, type: $type})
WHERE n.lifecycleState = 'active' OR n.lifecycleState IS NULL
RETURN n ORDER BY n.confidence DESC LIMIT 1
```

**Level 3 — Semantic similarity (via Qdrant)**

```javascript
const similar = await qdrantService.searchSimilar(
  embedding,
  { threshold: 0.95, limit: 3, namespace }
);
```

### Duplicate handling policies

| Policy | When applied | Action |
|--------|--------------|--------|
| `REJECT` | NodeVersion with the same contentHash already exists | Reject write, return error VAL004 |
| `UPSERT` | Domain node with the same id | Update properties via MERGE SET |
| `VERSION` | CatalogEntry with the same contentHash | Create a new version (increment versionNumber) |
| `MERGE` | Entity with normalized form match (confidence > 0.8) | Merge properties, take maximum confidence |

### Policy determination algorithm

```
  contentHash collision?
        │
   ┌────▼────┐
   │ NodeVer?│──── Yes ──→ REJECT (immutable, duplicate)
   └────┬────┘
        │ No
   ┌────▼────────┐
   │ CatalogEntry│──── Yes ──→ VERSION (create new version)
   └────┬────────┘
        │ No
   ┌────▼────────┐
   │ normalForm  │──── Yes ──→ MERGE (entity resolution)
   │ match?      │
   └────┬────────┘
        │ No
        ▼
      UPSERT (default: MERGE by id)
```

---

## 5.5 Orphan detection

### Types of orphaned data

| Type | Description | Risk | Check frequency |
|------|-------------|------|-----------------|
| Orphan nodes | Nodes without edges (isolated) | Medium | Every 6 hours |
| Orphan edges | Edges with missing source/target | High | Every 6 hours |
| Orphan vectors | Vectors in Qdrant with no node in Memgraph | High | Daily |
| Stale versions | GraphVersion without a CatalogEntry | Medium | Weekly |
| Broken chains | NodeVersion with invalid chainHash | Critical | On every write |

### Detection queries

**Orphan nodes (nodes without edges):**
```cypher
MATCH (n)
WHERE NOT (n)--() AND NOT n:CatalogRoot AND NOT n:Settings
RETURN labels(n) AS labels, count(n) AS count
ORDER BY count DESC
```

**Orphan edges (edges to non-existent nodes):**
```cypher
MATCH (a)-[r]->(b)
WHERE a.id IS NULL OR b.id IS NULL
RETURN type(r) AS edgeType, count(r) AS count
```

**Cross-store sync check (Memgraph vs Qdrant):**
```javascript
// 1. Get all Document IDs from Memgraph
const mgDocs = await memgraph.executeQuery(
  'MATCH (d:Document) RETURN d.id AS id'
);
// 2. Get all point IDs from Qdrant
const qdrantPoints = await qdrant.scroll(collectionName, {});
// 3. Find orphans
const mgIds = new Set(mgDocs.map(r => r.id));
const qdrantOrphans = qdrantPoints.filter(p => !mgIds.has(p.payload?.documentId));
```

### Check schedule

| Check | Interval | Action on detection |
|-------|----------|---------------------|
| Orphan nodes | 6 hours | Log + metric, do not delete automatically |
| Orphan edges | 6 hours | Log + flag for review |
| Orphan vectors | 24 hours | Log + queue for cleanup (manual confirmation) |
| Hash chain audit | On every NodeVersion write | ALERT + block further writes |
| Full integrity scan | Weekly | Full report via `validateGraphIntegrity()` |

---

## 5.6 Index management

### Problem: current state

Indexes and constraints are created in **4+ files**:

| File | Count | Type |
|------|-------|------|
| `GraphSchemaManager.js` | 25 constraints + 20+ indexes | Domain + Immutable + AOPEG |
| `memgraph.service.js:795-808` | 9 indexes | Namespace-specific |
| `graphCatalog.service.js:93-101` | 8 indexes | Catalog |
| `apply-schema-memgraph.js` | ~10 | Migration script |
| `apply-multi-domain-schema.js` | ~15 | Multi-domain migration |

**Problems:**
- No single place for the complete index list
- Duplicates and conflicts are possible
- No relationship indexes
- No composite indexes
- No full-text indexes

### Target state

All index definitions must be in one place: `GraphSchemaManager.js`.

**Rules:**
1. Every new label MUST have an index on id/primary key
2. Every label with `namespace` MUST have an index on `namespace`
3. Fields used in WHERE/ORDER BY MUST have an index
4. All definitions in `GraphSchemaManager.initializeSchema()`
5. Duplication in other files is forbidden

### Missing indexes (addition plan)

| Label | Property | Rationale |
|-------|----------|-----------|
| * (all) | `updatedAt` | Sort by update date |
| CatalogEntry | `createdBy` | Filter by author |
| ExecutionPattern | `hash` | Lookup by DAG hash |
| ExecutionRecord | `dagId` | Find executions by graph |
| * (all domain) | `extractionCycleId` | Bulk deletion of a cycle |

### Migration plan

1. Collect the full index list from all files (audit)
2. Consolidate into `GraphSchemaManager.initializeSchema()`
3. Add missing indexes
4. Remove duplicate definitions from other files
5. Add `SHOW INDEX INFO` check to the healthcheck endpoint

---

## Appendix: Validation error codes

| Code | Name | Description | Severity | Action |
|------|------|-------------|----------|--------|
| VAL001 | SCHEMA_REQUIRED_MISSING | Required field missing | ERROR | Reject write |
| VAL002 | SCHEMA_TYPE_MISMATCH | Wrong data type | ERROR | Reject write |
| VAL003 | SCHEMA_ENUM_INVALID | Value not in allowed enum | ERROR | Reject write |
| VAL004 | DUPLICATE_CONTENT | Duplicate by contentHash | WARNING | Apply policy (REJECT/UPSERT/VERSION/MERGE) |
| VAL005 | EDGE_MISSING_SOURCE | Edge source node does not exist | ERROR | Reject edge creation |
| VAL006 | EDGE_MISSING_TARGET | Edge target node does not exist | ERROR | Reject edge creation |
| VAL007 | HASH_CHAIN_BROKEN | Hash chain integrity broken | CRITICAL | Alert + block writes |
| VAL008 | ORPHAN_DETECTED | Orphaned node/edge/vector detected | WARNING | Log + queue for review |
| VAL009 | NAMESPACE_VIOLATION | Write to disallowed namespace | ERROR | Reject write |

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Part VI: CODEX-CATALOG — Catalog Standard

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

The catalog is the single source of truth about all graphs in the UN ProjectAdvisor system. Without a catalog, graphs become scattered artefacts: they are duplicated, lost, and never reused. With a catalog they form a managed library with versioning, deduplication, and intelligent search.

This standard defines:
- the `CatalogEntry` schema and related nodes,
- the automatic graph-save policy,
- deduplication mechanisms (exact, structural, semantic),
- four search modes (keyword, structural, GNN, hybrid),
- graph reuse strategies,
- the pattern lifecycle and promotion to templates.

Implementation: `api/src/services/graphCatalog.service.js`

---

## 6.1. CatalogEntry schema

### Catalog graph structure

The catalog is organised as a hierarchical tree of nodes in Memgraph. Each graph is represented by the triple `CatalogEntry -> GraphDefinition -> GraphVersion`, where CatalogEntry is the registry record, GraphDefinition is the definition (nodes + edges), and GraphVersion is a specific version snapshot.

```
                            ┌─────────────────────────┐
                            │      CatalogRoot        │
                            │  id: 'catalog-root'     │
                            │  namespace: 'CORE'      │
                            └───────────┬─────────────┘
                                        │
                              [:CATALOG_CONTAINS]
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
           ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
           │ CatalogEntry  │   │ CatalogEntry  │   │ CatalogEntry  │
           │ entryId: "A"  │   │ entryId: "B"  │   │ entryId: "C"  │
           │ type: business │   │ type: template│   │ type: meta    │
           └───────┬───────┘   └───────┬───────┘   └───────┬───────┘
                   │                   │                   │
             [:DEFINES]          [:DEFINES]          [:DEFINES]
                   │                   │                   │
                   ▼                   ▼                   ▼
          ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
          │ GraphDefinition│  │ GraphDefinition│  │ GraphDefinition│
          │ graphId: "g1"  │  │ graphId: "g2"  │  │ graphId: "g3"  │
          │ contentHash:.. │  │ contentHash:.. │  │ contentHash:.. │
          └───────┬────────┘  └───────┬────────┘  └───────┬────────┘
                  │                   │                   │
           [:HAS_VERSION]      [:HAS_VERSION]      [:HAS_VERSION]
                  │                   │                   │
                  ▼                   ▼                   ▼
          ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
          │ GraphVersion │    │ GraphVersion │    │ GraphVersion │
          │ versionId: v3│    │ versionId: v1│    │ versionId: v2│
          │ versionNum: 3│    │ versionNum: 1│    │ versionNum: 2│
          └──────┬───────┘    └──────────────┘    └──────┬───────┘
                 │                                       │
          [:SUPERSEDES]                           [:SUPERSEDES]
                 │                                       │
                 ▼                                       ▼
          ┌──────────────┐                        ┌──────────────┐
          │ GraphVersion │                        │ GraphVersion │
          │ versionId: v2│                        │ versionId: v1│
          │ versionNum: 2│                        │ versionNum: 1│
          └──────┬───────┘                        └──────────────┘
                 │
          [:SUPERSEDES]
                 │
                 ▼
          ┌──────────────┐
          │ GraphVersion │
          │ versionId: v1│
          │ versionNum: 1│
          └──────────────┘
```

Additional hierarchy edges:

```
(:CatalogEntry)-[:CHILD_OF]->(:CatalogEntry)           # Parent hierarchy
(:CatalogEntry)-[:DECOMPOSES {nodeId}]->(:CatalogEntry) # Node decomposition into subgraph
```

### Full CatalogEntry schema

| Field          | Type       | Required | Description                                    | Example                         |
|----------------|------------|----------|------------------------------------------------|---------------------------------|
| `entryId`      | `string`   | Yes      | Globally unique identifier (UUID)              | `"a1b2c3d4-e5f6-..."`          |
| `name`         | `string`   | Yes      | Human-readable graph name                      | `"IT Hardware Request"`         |
| `type`         | `string`   | Yes      | Graph type (see CATALOG_TYPES)                 | `"business"`                    |
| `namespace`    | `string`   | Yes      | Namespace (data isolation)                     | `"un-pa"`, `"default"`          |
| `description`  | `string`   | No       | Brief description of the graph purpose         | `"Hardware request process"`    |
| `tags`         | `string[]` | No       | Tags for search and classification             | `["ineed", "hardware", "it"]`   |
| `visibility`   | `string`   | Yes      | Visibility level (see below)                   | `"PUBLIC"`                      |
| `qualityScore` | `number`   | No       | Quality score (0.0 -- 1.0)                     | `0.85`                          |
| `createdAt`    | `string`   | Yes      | ISO 8601 creation timestamp                    | `"2026-03-12T14:30:00.000Z"`   |
| `updatedAt`    | `string`   | Yes      | ISO 8601 last-updated timestamp                | `"2026-03-12T15:00:00.000Z"`   |
| `createdBy`    | `string`   | No       | Creator                                        | `"system"`, `"user-123"`        |
| `currentVersion` | `number` | Yes     | Current version number (integer)               | `3`                             |
| `usageCount`   | `number`   | No       | Usage counter                                  | `42`                            |
| `isPublic`     | `boolean`  | No       | Public flag (for backward compatibility)       | `true`                          |

### GraphDefinition schema

| Field           | Type      | Description                                        |
|-----------------|-----------|----------------------------------------------------|
| `graphId`       | `string`  | Definition UUID                                    |
| `nodes`         | `string`  | JSON string of graph node array                    |
| `edges`         | `string`  | JSON string of graph edge array                    |
| `requiredParams`| `string`  | JSON string of parameters required for execution   |
| `toolIds`       | `string[]`| List of tool identifiers                           |
| `nodeCount`     | `number`  | Number of nodes                                    |
| `edgeCount`     | `number` | Number of edges                                    |
| `topology`      | `string` | Topology classification (`PIPELINE`, `DAG`, `TREE`)|
| `contentHash`   | `string` | SHA-256 of sorted JSON of nodes and edges          |
| `validatedAt`   | `string` | Time of last validation                            |
| `wasAutoFixed`  | `boolean`| Whether the graph was automatically corrected      |

### GraphVersion schema

| Field           | Type     | Description                                        |
|-----------------|----------|----------------------------------------------------|
| `versionId`     | `string` | Version UUID                                       |
| `versionNumber` | `number` | Integer version number (1, 2, 3...)                |
| `changelog`     | `string` | Description of changes                             |
| `createdAt`     | `string` | ISO 8601 version creation timestamp                |
| `createdBy`     | `string` | Version author                                     |
| `contentHash`   | `string` | SHA-256 hash of this version's content             |

### CATALOG_TYPES — allowed graph types

```javascript
const CATALOG_TYPES = {
  BUSINESS:  'business',   // Business processes (iNeed, onboarding, approval)
  TECHNICAL: 'technical',  // Technical pipelines (ETL, extraction, deployment)
  META:      'meta',       // Meta-graphs that orchestrate other graphs
  TEMPLATE:  'template',   // Templates for creating new graphs
  COMPOSITE: 'composite',  // Composite graphs containing subgraphs
};
```

| Type         | Purpose                                               | Example                         |
|--------------|-------------------------------------------------------|---------------------------------|
| `business`   | Models an end-to-end business process                 | iNeed Hardware Request          |
| `technical`  | Technical data-processing pipeline                   | SQL Extraction Pipeline         |
| `meta`       | Orchestrates other graphs, manages routing            | iNeed META Intake               |
| `template`   | Parameterised template for cloning                    | Generic Approval Workflow       |
| `composite`  | Aggregates multiple subgraphs via DECOMPOSES          | Full Onboarding Process         |

> **CATALOG003:** Attempting to create a CatalogEntry with a type absent from `CATALOG_TYPES` results in error `CATALOG003: Invalid type enum`.

### Visibility levels

| Level      | Description                                                     | Who can see                        |
|------------|----------------------------------------------------------------|-------------------------------------|
| `PUBLIC`   | Available to all system users and agents                       | Everyone                            |
| `INTERNAL` | Available only within the namespace                            | Namespace members                   |
| `PRIVATE`  | Available only to the author and administrators                | Author + admin                      |

### Cypher: creating a CatalogEntry

```cypher
// Create a new catalog entry
CREATE (c:CatalogEntry {
  entryId: $entryId,
  name: $name,
  description: $description,
  type: $type,
  namespace: $namespace,
  tags: $tags,
  visibility: $visibility,
  isPublic: true,
  createdBy: $createdBy,
  createdAt: datetime(),
  updatedAt: datetime(),
  currentVersion: 1,
  usageCount: 0,
  qualityScore: 1.0
})

// Link to CatalogRoot
MATCH (root:CatalogRoot {id: 'catalog-root'})
MATCH (c:CatalogEntry {entryId: $entryId})
MERGE (root)-[:CONTAINS]->(c)
```

### Cypher: querying a CatalogEntry with the latest version

```cypher
MATCH (c:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
OPTIONAL MATCH (c)-[:CHILD_OF]->(parent:CatalogEntry)
RETURN c, d, v, parent.entryId AS parentId
ORDER BY v.versionNumber DESC
LIMIT 1
```

### Cypher: listing all graphs in a namespace

```cypher
MATCH (c:CatalogEntry)
WHERE c.namespace = $namespace
  AND c.visibility IN ['PUBLIC', 'INTERNAL']
RETURN c.entryId AS id, c.name, c.type, c.description,
       c.tags, c.currentVersion, c.qualityScore
ORDER BY c.updatedAt DESC
```

### Indexes

Required indexes for catalog performance:

```cypher
CREATE INDEX ON :CatalogEntry(entryId);
CREATE INDEX ON :CatalogEntry(namespace);
CREATE INDEX ON :CatalogEntry(type);
CREATE INDEX ON :CatalogEntry(name);
CREATE INDEX ON :GraphVersion(versionId);
CREATE INDEX ON :GraphDefinition(contentHash);
CREATE INDEX ON :GraphDefinition(graphId);
CREATE INDEX ON :ReuseRecord(recordId);
```

---

## 6.2. Auto-save policy

### When a graph is saved automatically

The catalog does not require an explicit "Save" action from the user. Graphs are saved automatically in three scenarios:

```
┌───────────────────────────────────────────────────────────────────────┐
│                     AUTO-SAVE TRIGGERS                                │
│                                                                       │
│  1. CREATION         2. VERSION BUMP         3. IMPORT                │
│  ┌──────────────┐    ┌──────────────┐        ┌──────────────┐        │
│  │ createGraph() │    │createVersion()│        │ SQL Import   │        │
│  │              │    │              │        │ Pipeline     │        │
│  │ entryId: new │    │ entryId: old │        │              │        │
│  │ version: 1   │    │ version: N+1 │        │ entryId: new │        │
│  └──────────────┘    └──────────────┘        │ version: 1   │        │
│                                               └──────────────┘        │
└───────────────────────────────────────────────────────────────────────┘
```

| Trigger            | Method                          | What is created                              |
|--------------------|---------------------------------|----------------------------------------------|
| Graph creation     | `createGraph(data)`             | CatalogEntry + GraphDefinition + GraphVersion v1 |
| New version        | `createVersion(entryId, data)`  | New GraphDefinition + GraphVersion vN+1, SUPERSEDES |
| SQL Import         | `mssql.import-orchestrator.js`  | New CatalogEntry for each imported graph     |
| GraphLoader startup| `graph-loader.service.js`       | CatalogEntry for pre-loaded graphs (iNeed, SQL Extraction) |

### GXE godMode — two save modes

The GXE editor save behaviour depends on the `godMode` flag:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   godMode: OFF (normal mode)            godMode: ON (God Mode)  │
│   ────────────────────────                ──────────────────────  │
│                                                                 │
│   User clicks "Save"                    User clicks "Save"       │
│           │                                    │                 │
│           ▼                                    ▼                 │
│   createVersion(entryId, data)          updateGraph(id, data)    │
│           │                                    │                 │
│           ▼                                    ▼                 │
│   ┌──────────────────┐                 ┌──────────────────┐      │
│   │ GraphVersion N+1 │                 │ In-place SET     │      │
│   │ + SUPERSEDES     │                 │ on GraphDefinition│      │
│   │ + new Definition │                 │ (no new version) │      │
│   └──────────────────┘                 └──────────────────┘      │
│   History IS PRESERVED                 History IS NOT preserved  │
│   Rollback is possible                 Rollback is not possible  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **godMode OFF** — recommended mode. Each save creates a new version (`createVersion`). The graph becomes immutable after saving. Full change history is preserved.

- **godMode ON** — rapid-prototyping mode. Updates GraphDefinition in place (`updateGraph`). Does not create a new version. Used only during development.

> **CATALOG004:** When two users concurrently update the same CatalogEntry, error `CATALOG004: Version conflict` is raised. The system uses `currentVersion` as an optimistic lock.

### GraphLoader — auto-save on startup

On server startup `GraphLoaderService` loads predefined graphs from files and creates a `CatalogEntry` for each:

```javascript
// graph-loader.service.js — simplified excerpt
async loadGraph(graphDef) {
  const dag = { nodes: graphDef.nodes, edges: graphDef.edges };

  // 1. Register in PatternLibrary (in-memory cache)
  this._patternLibrary.register(graphDef.id, dag);

  // 2. Save metadata to Memgraph
  await this._memgraph.run(`
    MERGE (g:BusinessProcessGraph {graphId: $graphId})
    ON CREATE SET
      g.name = $name,
      g.node_count = $nodeCount,
      g.edge_count = $edgeCount,
      g.loaded_at = datetime()
    ON MATCH SET
      g.node_count = $nodeCount,
      g.edge_count = $edgeCount,
      g.loaded_at = datetime()
  `, { graphId, name, nodeCount, edgeCount });

  return { success: true, nodes: nodeCount, edges: edgeCount };
}
```

Pre-loaded graphs:

| Graph ID                              | Type      | Nodes | Edges |
|----------------------------------------|-----------|-------|-------|
| `INEED-G0-META-INTAKE-V1`             | meta      | 16    | 16    |
| `INEED-G1-IT-HARDWARE-V1`             | business  | 22    | 22    |
| `INEED-G2-HR-ACCESS-V1`               | business  | 13    | 13    |
| `INEED-G3-FACILITIES-WORKSPACE-V1`    | business  | 12    | 12    |
| `CORE-SQL-EXTRACTION-META-V1`         | technical | --    | --    |
| `CORE-SQL-PROCEDURE-ANALYSIS-V1`      | technical | --    | --    |

### Cypher: creating a version with SUPERSEDES

```cypher
// Step 1: Get the current version
MATCH (c:CatalogEntry {entryId: $entryId})
RETURN c.currentVersion AS currentVersion

// Step 2: Update the current version number
MATCH (c:CatalogEntry {entryId: $entryId})
SET c.updatedAt = datetime(), c.currentVersion = $versionNumber

// Step 3: Create new GraphDefinition and GraphVersion
CREATE (g:GraphDefinition {
  graphId: $graphId,
  nodes: $nodes,
  edges: $edges,
  contentHash: $contentHash,
  nodeCount: $nodeCount,
  edgeCount: $edgeCount,
  topology: $topology,
  validatedAt: datetime()
})
CREATE (v:GraphVersion {
  versionId: $versionId,
  versionNumber: $versionNumber,
  changelog: $changelog,
  createdAt: datetime(),
  createdBy: $createdBy,
  contentHash: $contentHash
})

// Step 4: Link to CatalogEntry
MATCH (c:CatalogEntry {entryId: $entryId})
MATCH (g:GraphDefinition {graphId: $graphId})
MATCH (v:GraphVersion {versionId: $versionId})
CREATE (c)-[:DEFINES]->(g)
CREATE (g)-[:HAS_VERSION]->(v)

// Step 5: Create SUPERSEDES edge to the previous version
MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(prev:GraphVersion)
WHERE prev.versionNumber = $versionNumber - 1
MATCH (v:GraphVersion {versionId: $versionId})
CREATE (v)-[:SUPERSEDES]->(prev)
```

---

## 6.3. Deduplication

### Problem

Without deduplication, the catalog quickly fills with duplicates: the same pipeline saved by different users, or re-imported from the same source. Deduplication ensures each graph appears only once in the catalog.

### Three-tier deduplication strategy

```
  New graph
      │
      ▼
┌─────────────────────────────────┐
│ Level 1: EXACT MATCH            │
│ contentHash == existing?         │
│                                 │
│ SHA-256(sorted(nodes + edges))  │
│ O(1) index lookup               │
├─────────────┬───────────────────┘
│  Matched    │  No match
│             ▼
│  ┌─────────────────────────────────┐
│  │ Level 2: STRUCTURAL MATCH       │
│  │ Jaccard(toolIds_A, toolIds_B)   │
│  │          >= 0.85 ?              │
│  │                                 │
│  │ Compare topology, node count,   │
│  │ edge count, toolId overlap      │
│  ├─────────────┬───────────────────┘
│  │  Matched    │  No match
│  │             ▼
│  │  ┌─────────────────────────────────┐
│  │  │ Level 3: SEMANTIC MATCH (GNN)   │
│  │  │ cosine(embedding_A, embedding_B)│
│  │  │          >= threshold ?         │
│  │  │                                 │
│  │  │ GNN graph embeddings            │
│  │  │ Threshold: configurable         │
│  │  │ (default: 0.90)                 │
│  │  ├─────────────┬───────────────────┘
│  │  │  Matched    │  No match
│  │  │             ▼
│  │  │        ┌────────────┐
│  │  │        │ UNIQUE     │
│  │  │        │ Create     │
│  │  │        │ CatalogEntry│
│  │  │        └────────────┘
│  │  ▼
│  ▼
│ ┌────────────────────┐
│ │ DUPLICATE FOUND    │
│ │ Return existing    │
│ │ entryId            │
│ └────────────────────┘
▼
```

> **CATALOG005:** When a duplicate is detected at Level 1, error `CATALOG005: Dedup collision (identical contentHash exists)` is returned with the `existingEntryId`.

### Level 1: Exact Match — contentHash

The fastest and most reliable level. `contentHash` is computed as SHA-256 of the canonicalised JSON of nodes and edges:

```javascript
/**
 * Computes contentHash for a graph.
 * Used for exact-match deduplication.
 *
 * @param {Array} nodes - Array of graph nodes
 * @param {Array} edges - Array of graph edges
 * @returns {string} SHA-256 hash
 */
computeContentHash(nodes, edges) {
  // Sorting ensures hash stability
  // when node/edge order changes
  const sortedNodes = [...nodes].sort((a, b) =>
    (a.id || '').localeCompare(b.id || '')
  );
  const sortedEdges = [...edges].sort((a, b) => {
    const srcCmp = (a.source || '').localeCompare(b.source || '');
    return srcCmp !== 0 ? srcCmp : (a.target || '').localeCompare(b.target || '');
  });

  const payload = JSON.stringify({ nodes: sortedNodes, edges: sortedEdges });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

Lookup by contentHash is O(1) thanks to the index:

```cypher
MATCH (d:GraphDefinition {contentHash: $hash})
RETURN d.graphId AS graphId
LIMIT 1
```

### Level 2: Structural Match -- Jaccard Similarity

If exact match fails, structural similarity is checked. The primary metric is the Jaccard coefficient by toolId:

```
           |toolIds_A ∩ toolIds_B|
J(A,B) = ─────────────────────────
           |toolIds_A ∪ toolIds_B|
```

Threshold: **J >= 0.85** — graphs are considered structurally identical.

Additional signals:
- Topology match (PIPELINE / DAG / TREE)
- Node count proximity (±20%)
- Tag overlap

```javascript
/**
 * Checks structural similarity of two graphs.
 *
 * @param {Object} graphA - { toolIds, topology, nodeCount, tags }
 * @param {Object} graphB - { toolIds, topology, nodeCount, tags }
 * @returns {{ similar: boolean, score: number }}
 */
function checkStructuralSimilarity(graphA, graphB) {
  const setA = new Set(graphA.toolIds || []);
  const setB = new Set(graphB.toolIds || []);

  const intersection = [...setA].filter(t => setB.has(t));
  const union = new Set([...setA, ...setB]);

  const jaccard = union.size > 0 ? intersection.length / union.size : 0;

  // Topology bonus
  const topoMatch = graphA.topology === graphB.topology ? 0.05 : 0;

  // Size proximity bonus
  const sizeRatio = Math.min(graphA.nodeCount, graphB.nodeCount)
                  / Math.max(graphA.nodeCount, graphB.nodeCount);
  const sizeBonus = sizeRatio > 0.8 ? 0.05 : 0;

  const score = jaccard + topoMatch + sizeBonus;

  return {
    similar: score >= 0.85,
    score: Math.round(score * 100) / 100,
    jaccard,
    topoMatch: graphA.topology === graphB.topology,
    sizeRatio: Math.round(sizeRatio * 100) / 100,
  };
}
```

### Level 3: Semantic Match — GNN Embedding Similarity

If structural comparison is insufficient (graphs use different tools but solve the same problem), GNN embeddings are used:

```javascript
/**
 * Computes semantic similarity via the GNN service.
 *
 * @param {Object} graphA - Graph to compare
 * @param {Object} graphB - Reference graph
 * @returns {Promise<{ similar: boolean, cosine: number }>}
 */
async function checkSemanticSimilarity(graphA, graphB) {
  const response = await fetch(`${GNN_SERVICE_URL}/api/v1/similarity/graphs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      graph_a: { nodes: graphA.nodes, edges: graphA.edges },
      graph_b: { nodes: graphB.nodes, edges: graphB.edges },
    }),
    signal: AbortSignal.timeout(8000),
  });

  const result = await response.json();
  const cosine = result.cosine_similarity || 0;

  return {
    similar: cosine >= 0.90,  // Threshold is configurable
    cosine: Math.round(cosine * 1000) / 1000,
  };
}
```

The GNN service (port 5000) computes an embedding for each graph and then calculates the cosine distance:

```
                    Σ(A_i × B_i)
cos(A, B) = ────────────────────────────
              √(Σ A_i²) × √(Σ B_i²)
```

### checkFingerprintCollision

The `checkFingerprintCollision()` function from `GraphSchemaManager` combines all three levels:

```javascript
/**
 * Checks whether a duplicate graph exists in the catalog.
 *
 * @param {Object} graph - { nodes, edges, toolIds, topology }
 * @returns {Promise<{ isDuplicate: boolean, level: string, existingId: string|null }>}
 */
async checkFingerprintCollision(graph) {
  const contentHash = this.computeContentHash(graph.nodes, graph.edges);

  // Level 1: Exact match
  const exactMatch = await this.findByContentHash(contentHash);
  if (exactMatch) {
    return { isDuplicate: true, level: 'EXACT', existingId: exactMatch.entryId };
  }

  // Level 2: Structural match
  const candidates = await this.listGraphs({ type: graph.type, limit: 50 });
  for (const candidate of candidates) {
    const result = checkStructuralSimilarity(graph, candidate);
    if (result.similar) {
      return { isDuplicate: true, level: 'STRUCTURAL', existingId: candidate.entryId,
               score: result.score };
    }
  }

  // Level 3: Semantic match (GNN, graceful degradation)
  try {
    for (const candidate of candidates.slice(0, 10)) {
      const result = await checkSemanticSimilarity(graph, candidate);
      if (result.similar) {
        return { isDuplicate: true, level: 'SEMANTIC', existingId: candidate.entryId,
                 cosine: result.cosine };
      }
    }
  } catch {
    // GNN unavailable — skip semantic check
  }

  return { isDuplicate: false, level: null, existingId: null };
}
```

---

## 6.4. Search mechanisms

### Four search modes

The catalog supports four search modes, from simple to intelligent:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SEARCH MODES                                    │
│                                                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │  KEYWORD    │  │  STRUCTURAL  │  │  SEMANTIC   │  │   HYBRID     │ │
│  │             │  │              │  │   (GNN)     │  │              │ │
│  │ name LIKE   │  │ Jaccard      │  │ cosine sim  │  │ weighted     │ │
│  │ tags CONTAINS│  │ toolId match │  │ embedding   │  │ combination  │ │
│  │ description │  │ topology     │  │ space       │  │ of all three │ │
│  │ FULLTEXT    │  │ node count   │  │             │  │              │ │
│  └─────────────┘  └──────────────┘  └────────────┘  └──────────────┘ │
│                                                                        │
│  Speed: ████    Speed: ███     Speed: ██    Speed: ██               │
│  Quality: ██    Quality: ███   Quality: ████  Quality: █████        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Keyword Search

Full-text search by name, description, and tags. Uses Cypher CONTAINS and FULLTEXT indexes:

```cypher
// Search by keyword
MATCH (c:CatalogEntry)
WHERE c.name CONTAINS $searchTerm
   OR c.description CONTAINS $searchTerm
   OR ANY(tag IN c.tags WHERE tag CONTAINS $searchTerm)
RETURN c.entryId AS id, c.name, c.description, c.type, c.tags
ORDER BY c.qualityScore DESC, c.usageCount DESC
LIMIT $limit
```

For high-load scenarios a FULLTEXT index is recommended:

```cypher
// Create FULLTEXT index (run once during initialisation)
CALL db.index.fulltext.createNodeIndex(
  'catalog_search',
  ['CatalogEntry'],
  ['name', 'description']
);

// Search via FULLTEXT
CALL db.index.fulltext.queryNodes('catalog_search', $searchTerm)
YIELD node, score
RETURN node.entryId AS id, node.name, score
ORDER BY score DESC
LIMIT $limit
```

### 2. Structural Search

Search by structural graph characteristics: toolId overlap, topology, size.

```javascript
/**
 * Structural search in the catalog.
 *
 * @param {Object} criteria - { toolIds, topology, minNodes, maxNodes }
 * @returns {Promise<Array>} Sorted results
 */
async structuralSearch(criteria) {
  const { toolIds = [], topology, minNodes = 0, maxNodes = Infinity } = criteria;

  const candidates = await this.listGraphs({ limit: 100 });

  return candidates
    .map(candidate => {
      const candToolIds = candidate.toolIds || [];
      const intersection = toolIds.filter(t => candToolIds.includes(t));
      const union = new Set([...toolIds, ...candToolIds]);
      const jaccard = union.size > 0 ? intersection.length / union.size : 0;

      const topoMatch = !topology || candidate.topology === topology ? 1 : 0;
      const inRange = candidate.nodeCount >= minNodes && candidate.nodeCount <= maxNodes;

      return {
        ...candidate,
        structuralScore: jaccard * 0.7 + topoMatch * 0.2 + (inRange ? 0.1 : 0),
      };
    })
    .filter(c => c.structuralScore > 0.3)
    .sort((a, b) => b.structuralScore - a.structuralScore);
}
```

### 3. Semantic Search (GNN)

Search by semantic similarity via GNN graph embeddings. Computes the query embedding and finds nearest neighbours in the embedding space:

```javascript
/**
 * Semantic search via the GNN service.
 *
 * @param {Object} queryGraph - { nodes, edges }
 * @param {number} topK - Number of results
 * @returns {Promise<Array>} Ranked results with cosine score
 */
async semanticSearch(queryGraph, topK = 10) {
  const response = await fetch(`${GNN_SERVICE_URL}/api/v1/similarity/find`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query_graph: { nodes: queryGraph.nodes, edges: queryGraph.edges },
      top_k: topK,
    }),
  });

  const results = await response.json();
  return results.similar_graphs || [];
}
```

### 4. Hybrid Search

Combines all three modes with configurable weights:

```
score = w_keyword * S_keyword + w_structural * S_jaccard + w_gnn * S_cosine
```

Default weights:

| Component        | Weight (w) | Rationale                                           |
|------------------|------------|-----------------------------------------------------|
| `w_keyword`      | **0.3**    | Basic signal, fast but noisy                        |
| `w_structural`   | **0.3**    | Reliable for technical graphs with known toolIds    |
| `w_gnn`          | **0.4**    | Highest weight: captures semantics and structure    |

```javascript
/**
 * Hybrid search in the catalog.
 *
 * @param {Object} query - { searchTerm, toolIds, topology, nodes, edges }
 * @param {Object} weights - { keyword, structural, gnn }
 * @returns {Promise<Array>} Ranked results
 */
async hybridSearch(query, weights = { keyword: 0.3, structural: 0.3, gnn: 0.4 }) {
  // Run all three modes in parallel
  const [keywordResults, structuralResults, gnnResults] = await Promise.allSettled([
    this.keywordSearch(query.searchTerm),
    this.structuralSearch({ toolIds: query.toolIds, topology: query.topology }),
    this.semanticSearch({ nodes: query.nodes, edges: query.edges }),
  ]);

  // Merge results
  const scoreMap = new Map();

  for (const r of keywordResults.value || []) {
    const entry = scoreMap.get(r.id) || { id: r.id, name: r.name, scores: {} };
    entry.scores.keyword = r.score || 0.5;
    scoreMap.set(r.id, entry);
  }

  for (const r of structuralResults.value || []) {
    const id = r.entryId || r.id;
    const entry = scoreMap.get(id) || { id, name: r.name, scores: {} };
    entry.scores.structural = r.structuralScore || 0;
    scoreMap.set(id, entry);
  }

  for (const r of gnnResults.value || []) {
    const entry = scoreMap.get(r.id) || { id: r.id, name: r.name, scores: {} };
    entry.scores.gnn = r.cosine_similarity || 0;
    scoreMap.set(r.id, entry);
  }

  // Compute final score
  return [...scoreMap.values()]
    .map(entry => ({
      ...entry,
      hybridScore:
        (entry.scores.keyword || 0)    * weights.keyword +
        (entry.scores.structural || 0) * weights.structural +
        (entry.scores.gnn || 0)        * weights.gnn,
    }))
    .sort((a, b) => b.hybridScore - a.hybridScore);
}
```

### MCP Tools for search

#### catalog.search_graphs

```javascript
// MCP Tool: catalog.search_graphs
{
  name: 'catalog.search_graphs',
  description: 'Search graph catalog using keyword, structural, or hybrid mode',
  parameters: {
    searchTerm:  { type: 'string',   description: 'Keyword search query' },
    type:        { type: 'string',   description: 'Filter by CATALOG_TYPE' },
    namespace:   { type: 'string',   description: 'Filter by namespace' },
    tags:        { type: 'string[]', description: 'Filter by tags' },
    mode:        { type: 'string',   description: 'Search mode: keyword|structural|semantic|hybrid',
                   default: 'hybrid' },
    limit:       { type: 'number',   description: 'Max results', default: 10 },
  },
  returns: {
    graphs: [{
      id: 'string',
      name: 'string',
      type: 'string',
      description: 'string',
      score: 'number',
      nodeCount: 'number',
      edgeCount: 'number',
    }],
    totalCount: 'number',
    searchMode: 'string',
  }
}
```

#### catalog.find_similar_graphs

```javascript
// MCP Tool: catalog.find_similar_graphs
{
  name: 'catalog.find_similar_graphs',
  description: 'Find graphs structurally or semantically similar to a given graph',
  parameters: {
    graphId:    { type: 'string', description: 'Source graph entryId' },
    threshold:  { type: 'number', description: 'Minimum similarity score', default: 0.6 },
    useGNN:     { type: 'boolean', description: 'Include GNN semantic similarity', default: true },
    limit:      { type: 'number', description: 'Max results', default: 5 },
  },
  returns: {
    similar: [{
      id: 'string',
      name: 'string',
      similarity: 'number',
      matchLevel: 'string',     // 'EXACT' | 'STRUCTURAL' | 'SEMANTIC'
      scoreBreakdown: 'object',
    }],
    gnnAvailable: 'boolean',
  }
}
```

---

## 6.5. Reuse strategy

### Reuse problem

When the system needs a new subgraph, four options exist: create from scratch, copy an existing one, extend a template, or reference a ready-made one. Choosing the wrong strategy leads either to catalog bloat (unnecessary clones) or fragile dependencies (broken references).

### ReuseStrategyResolver

Implementation: `api/src/services/graph/reuse-strategy-resolver.js`

Four reuse strategies:

| Strategy           | Identifier          | Description                                      |
|--------------------|---------------------|--------------------------------------------------|
| **CLONE**          | `CLONE_MODIFY`      | Clone the graph and modify it for the task       |
| **EXTEND**         | `ABSTRACT_INHERIT`  | Take a template and parameterise it              |
| **COMPOSE**        | `DIRECT_REUSE`      | Use the graph as-is (reference, no copy)         |
| **REFERENCE**      | `CREATE_NEW`        | Create a new graph from scratch                  |

### Decision matrix

```
                        Similarity Score
                   0.0        0.5        0.9        1.0
                    │          │          │          │
                    ▼          ▼          ▼          ▼
   ┌────────────────────────────────────────────────────────────┐
   │                                                            │
   │  CREATE_NEW        CLONE_MODIFY       DIRECT_REUSE        │
   │  Create new        Clone and          Use as-is           │
   │  graph             refine                                  │
   │                                                            │
   │  ◄─── 0.0 ─── 0.3 ──── 0.6 ──── 0.9 ──── 1.0 ───►       │
   │       │              │              │                      │
   │       │  No          │  Medium      │  High                │
   │       │  relevant    │  similarity  │  similarity          │
   │       │  candidates  │              │                      │
   └────────────────────────────────────────────────────────────┘

   Special case: if the best candidate has type='template'
   and score > 0.5 → ABSTRACT_INHERIT (takes priority over others)
```

| Condition                                    | Strategy            | Action                                     |
|----------------------------------------------|---------------------|--------------------------------------------|
| `score >= 0.9`                               | `DIRECT_REUSE`      | Reference the existing graph               |
| `0.6 <= score < 0.9`                         | `CLONE_MODIFY`      | Clone + modify nodes/edges                 |
| `type = 'template'` AND `score > 0.5`       | `ABSTRACT_INHERIT`  | Instantiate from template                  |
| `score < 0.6` or no candidates              | `CREATE_NEW`        | Create a new graph from scratch            |

> **CATALOG006:** If the reuse strategy does not match the actual action (e.g., `DIRECT_REUSE` was recommended but the user modified the graph), warning `CATALOG006: Reuse strategy mismatch` is raised.

### Strategy selection algorithm

```
┌──────────────────────────────────────────────────────────────────┐
│                 STRATEGY SELECTION FLOW                            │
│                                                                    │
│  Input:                                                            │
│  ┌──────────────────────────────────────┐                         │
│  │ nodeContext: {                        │                         │
│  │   nodeId, nodeLabel,                 │                         │
│  │   nodeDescription,                    │                         │
│  │   expectedToolIds,                    │                         │
│  │   parentGraphId                       │                         │
│  │ }                                     │                         │
│  └──────────────────┬───────────────────┘                         │
│                     │                                              │
│                     ▼                                              │
│  ┌─────────────────────────────────────┐                          │
│  │ Step 1: extractSearchCriteria()     │                          │
│  │ → keywords, topology, toolIds       │                          │
│  └──────────────────┬──────────────────┘                          │
│                     │                                              │
│                     ▼                                              │
│  ┌─────────────────────────────────────┐                          │
│  │ Step 2: searchCatalog(criteria)     │                          │
│  │ → keyword search + template search  │                          │
│  └──────────────────┬──────────────────┘                          │
│                     │                                              │
│                     ▼                                              │
│  ┌─────────────────────────────────────┐                          │
│  │ Step 3: scoreCandidates()           │                          │
│  │ → toolId Jaccard (0.4)             │                          │
│  │ → topology match  (0.15)            │                          │
│  │ → keyword overlap (0.25)            │                          │
│  │ → size proximity  (0.1)             │                          │
│  │ → quality bonus   (0.1)             │                          │
│  └──────────────────┬──────────────────┘                          │
│                     │                                              │
│                     ▼                                              │
│  ┌─────────────────────────────────────┐                          │
│  │ Step 3b: _applyGNNBoost() (opt.)   │                          │
│  │ → cosine similarity boost           │                          │
│  └──────────────────┬──────────────────┘                          │
│                     │                                              │
│                     ▼                                              │
│  ┌─────────────────────────────────────┐                          │
│  │ Step 4: decideStrategy()            │                          │
│  │ → template + score > 0.5            │  ──► ABSTRACT_INHERIT    │
│  │ → score >= 0.9                      │  ──► DIRECT_REUSE        │
│  │ → score >= 0.6                      │  ──► CLONE_MODIFY        │
│  │ → score < 0.6                       │  ──► CREATE_NEW          │
│  └─────────────────────────────────────┘                          │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### Candidate scoring weights

| Factor              | Weight   | Description                                               |
|---------------------|----------|-----------------------------------------------------------|
| toolId Jaccard      | **0.40** | Tool overlap between graphs                               |
| keyword overlap     | **0.25** | Keyword match (name, description, tags)                   |
| topology match      | **0.15** | Topology match (PIPELINE/DAG/TREE)                        |
| size proximity      | **0.10** | Node count proximity (3–20 = 0.8, otherwise 0.4)          |
| quality bonus       | **0.10** | Graph quality score (qualityScore)                        |

### MCP Tool: catalog.analyze_reuse

```javascript
// MCP Tool: catalog.analyze_reuse
{
  name: 'catalog.analyze_reuse',
  description: 'Analyze a node context and recommend graph reuse strategy',
  parameters: {
    nodeId:          { type: 'string',   description: 'ID of the node needing a sub-graph' },
    nodeLabel:       { type: 'string',   description: 'Human-readable node label' },
    nodeDescription: { type: 'string',   description: 'Description of what the node does' },
    expectedToolIds: { type: 'string[]', description: 'Expected tool IDs for the sub-graph' },
    parentGraphId:   { type: 'string',   description: 'Parent graph entryId' },
  },
  returns: {
    strategy: 'string',        // DIRECT_REUSE | CLONE_MODIFY | ABSTRACT_INHERIT | CREATE_NEW
    reason: 'string',          // Human-readable rationale
    sourceGraph: {             // Best candidate (null for CREATE_NEW)
      entryId: 'string',
      name: 'string',
      similarityScore: 'number',
      scoreBreakdown: 'object',
    },
    alternatives: 'object[]',  // Top-3 alternative candidates
    gnnUsed: 'boolean',        // Whether GNN was used for boosting
  }
}
```

---

## 6.6. Pattern promotion

### Two types of PatternLibrary

The system has two independent pattern stores operating at different levels:

```
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│    Runtime PatternLibrary           │   │    Extraction PatternLibrary        │
│    (runtime/learning/)              │   │    (services/patterns/)             │
│                                     │   │                                     │
│  Stores: DAG execution patterns     │   │  Stores: Extraction patterns        │
│  Source: recordExecution()          │   │  Source: registerEntityPattern()    │
│  Purpose: graph reuse               │   │  Purpose: improve extraction        │
│  Cache: LRU in-memory + Memgraph    │   │  Cache: in-memory + domain index    │
│                                     │   │                                     │
│  File:                              │   │  File:                              │
│  runtime/learning/PatternLibrary.js │   │  services/patterns/pattern-library.js│
└─────────────────────────────────────┘   └─────────────────────────────────────┘
```

### Pattern lifecycle

A pattern passes through four stages from first observation to becoming a catalog template:

```
 ┌───────────┐     ┌────────────┐     ┌───────────┐     ┌───────────┐
 │ OBSERVED  │────>│ CANDIDATE  │────>│ PROMOTED  │────>│ TEMPLATE  │
 │           │     │            │     │           │     │           │
 │ count: 1  │     │ count >= 3 │     │ count >= 5│     │ CatalogEntry│
 │ rate: ?   │     │ rate > 0.5 │     │ rate > 0.8│     │ type:template│
 └───────────┘     └────────────┘     └───────────┘     └───────────┘
      │                  │                  │                  │
      │  First           │  Repeated        │  Stable          │  Registered
      │  execution       │  confirmation    │  pattern         │  in catalog
```

### Promotion criteria

| Transition             | Condition                                         | Automatic |
|------------------------|---------------------------------------------------|-----------|
| OBSERVED → CANDIDATE   | `observationCount >= 3`                           | Yes       |
| CANDIDATE → PROMOTED   | `observationCount >= 5` AND `successRate > 0.8`   | Yes       |
| PROMOTED → TEMPLATE    | Admin or agent decision                           | No        |

### Promotion thresholds

```javascript
const PROMOTION_THRESHOLDS = {
  CANDIDATE: {
    minObservations: 3,     // Minimum observations for candidate
    minSuccessRate: 0.5,    // Minimum success rate
  },
  PROMOTED: {
    minObservations: 5,     // Threshold for promotion
    minSuccessRate: 0.8,    // 80%+ successful executions
  },
};
```

### recordExecution() — recording an execution result

Every graph execution is recorded in PatternLibrary for learning:

```javascript
/**
 * Records a graph execution result for pattern learning.
 *
 * @param {Object} executionResult - RuntimeEngine result
 * @param {Object} context - { taskCategory, taskDescription, userId }
 * @returns {Promise<{ patternId, isNewPattern, successRate }>}
 */
async recordExecution(executionResult, context) {
  if (!this._runtimeAdapter) {
    return this._recordInMemory(executionResult, context);
  }

  const { taskCategory } = context;
  const success = executionResult.status === 'COMPLETED';
  const dag = executionResult.dag;
  const hash = this._computePatternHash(dag);

  // Find or create pattern
  let pattern = this._hashIndex.get(hash);

  if (!pattern) {
    // New pattern — OBSERVED
    pattern = {
      hash,
      category: taskCategory,
      dag,
      observations: 0,
      successes: 0,
      failures: 0,
      successRate: 0,
      stage: 'OBSERVED',
      createdAt: new Date().toISOString(),
    };
    this._hashIndex.set(hash, pattern);
  }

  // Update statistics
  pattern.observations++;
  if (success) pattern.successes++;
  else pattern.failures++;
  pattern.successRate = pattern.successes / pattern.observations;
  pattern.lastSeenAt = new Date().toISOString();

  // Check promotion
  this._checkPromotion(pattern);

  // Update category cache
  const existing = this._categoryCache.get(taskCategory);
  if (!existing || pattern.successRate > existing.successRate) {
    this._cachePattern(taskCategory, pattern);
  }

  return {
    patternId: hash,
    isNewPattern: pattern.observations === 1,
    successRate: Math.round(pattern.successRate * 100) / 100,
    stage: pattern.stage,
  };
}
```

### _checkPromotion() — automatic promotion

```javascript
/**
 * Checks whether a pattern is ready for promotion to the next stage.
 *
 * @param {Object} pattern - Pattern object
 */
_checkPromotion(pattern) {
  const { observations, successRate, stage } = pattern;

  if (stage === 'OBSERVED' &&
      observations >= PROMOTION_THRESHOLDS.CANDIDATE.minObservations &&
      successRate >= PROMOTION_THRESHOLDS.CANDIDATE.minSuccessRate) {
    pattern.stage = 'CANDIDATE';
    console.log(`[PatternLibrary] Pattern ${pattern.hash} promoted to CANDIDATE`
      + ` (${observations} obs, ${(successRate * 100).toFixed(0)}% success)`);
  }

  if (stage === 'CANDIDATE' &&
      observations >= PROMOTION_THRESHOLDS.PROMOTED.minObservations &&
      successRate >= PROMOTION_THRESHOLDS.PROMOTED.minSuccessRate) {
    pattern.stage = 'PROMOTED';
    console.log(`[PatternLibrary] Pattern ${pattern.hash} promoted to PROMOTED`
      + ` (${observations} obs, ${(successRate * 100).toFixed(0)}% success)`);
  }
}
```

### registerEntityPattern() — registering an extraction pattern

Extraction PatternLibrary uses a different API for pattern registration:

```javascript
/**
 * Registers an entity extraction pattern.
 *
 * @param {Object} config - Pattern configuration
 * @param {string} config.id - Unique pattern ID
 * @param {string} config.name - Pattern name
 * @param {string} config.domain - Domain (sql, javascript, etc.)
 * @param {RegExp[]} config.patterns - Array of regular expressions
 * @param {string} config.entityType - Type of entity to extract
 * @param {number} config.confidence - Base confidence (0.0–1.0)
 * @returns {EntityPattern} Registered pattern
 */
registerEntityPattern(config) {
  const pattern = config instanceof EntityPattern
    ? config
    : new EntityPattern(config);

  this.entityPatterns.set(pattern.id, pattern);
  this._indexByDomain(pattern, 'entities');

  return pattern;
}
```

### Turning a PROMOTED pattern into a CatalogEntry TEMPLATE

When a pattern reaches the PROMOTED stage it can be registered in the catalog as a template:

```javascript
/**
 * Turns a promoted pattern into a catalog template.
 *
 * @param {Object} pattern - Pattern with stage PROMOTED
 * @returns {Promise<{ entryId, name }>}
 */
async promoteToTemplate(pattern) {
  if (pattern.stage !== 'PROMOTED') {
    throw new Error('Only PROMOTED patterns can become templates');
  }

  // Create CatalogEntry of type 'template'
  const entry = await graphCatalogService.createGraph({
    name: `Template: ${pattern.category}`,
    description: `Auto-promoted pattern with ${pattern.observations} observations `
      + `and ${(pattern.successRate * 100).toFixed(0)}% success rate`,
    type: 'template',
    namespace: 'system',
    tags: ['auto-promoted', 'pattern', pattern.category],
    nodes: pattern.dag.nodes,
    edges: pattern.dag.edges,
    createdBy: 'pattern-promotion',
  });

  // Update pattern stage
  pattern.stage = 'TEMPLATE';
  pattern.catalogEntryId = entry.entryId;

  console.log(`[PatternPromotion] Pattern ${pattern.hash} promoted to TEMPLATE: ${entry.entryId}`);

  return { entryId: entry.entryId, name: entry.name };
}
```

### Cypher: querying patterns by stage

```cypher
// Find all promoted patterns ready for templating
MATCH (p:ExecutionPattern)
WHERE p.stage = 'PROMOTED'
  AND p.observations >= 5
  AND p.successRate > 0.8
RETURN p.hash, p.category, p.observations, p.successRate, p.createdAt
ORDER BY p.successRate DESC, p.observations DESC
```

---

## Error codes

| Code        | Name                      | Description                                               | HTTP | Action                                 |
|-------------|---------------------------|-----------------------------------------------------------|------|----------------------------------------|
| `CATALOG001`| Entry not found           | CatalogEntry with the given entryId not found in catalog  | 404  | Verify entryId; soft delete possible  |
| `CATALOG002`| Duplicate entryId         | CatalogEntry with this entryId already exists             | 409  | Use existing or generate a new UUID   |
| `CATALOG003`| Invalid type enum         | Specified type is not in CATALOG_TYPES                    | 400  | Use: business, technical, meta, template, composite |
| `CATALOG004`| Version conflict          | Concurrent update: currentVersion has changed             | 409  | Re-read CatalogEntry and retry        |
| `CATALOG005`| Dedup collision           | Graph with identical contentHash already exists in catalog| 409  | Return existing entryId or createVersion |
| `CATALOG006`| Reuse strategy mismatch   | Reuse strategy does not match the actual action           | 422  | Warning, does not block the operation |

### Error response format

```json
{
  "error": {
    "code": "CATALOG005",
    "message": "Dedup collision: identical contentHash exists",
    "details": {
      "existingEntryId": "a1b2c3d4-e5f6-...",
      "contentHash": "sha256:9f86d081884c7d659a2feaa...",
      "matchLevel": "EXACT"
    }
  }
}
```

---

> **CODEX-CATALOG v0.1.0** | Part VI **UN ProjectAdvisor Codex** | GXE Catalog Standard

---

## Part VII: CODEX-POLY — Polystore Protocol

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

UN ProjectAdvisor is a polystore system using three data stores:

- **Memgraph** — graph database (nodes, edges, properties, relationships)
- **Qdrant** — vector store (embeddings, semantic search)
- **Redis** — cache and message queues (pub/sub, TTL cache, sessions)

Writing to multiple stores **is not atomic**. There is no distributed transaction manager that combines all three systems into a single ACID transaction. This means partial failures are possible when writing data: data may be written to Memgraph but never reach Qdrant, or the Redis cache may remain stale.

This protocol defines:

1. **Write order** — the sequence in which stores should be updated
2. **Error handling** — compensating transactions for partial failures
3. **Consistency recovery** — mechanisms for detecting and correcting desynchronisation

---

## 7.1 Write order

### Write flow diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Memgraph      │────▶│    Qdrant       │────▶│     Redis       │
│   (primary)     │     │  (secondary)    │     │    (cache)      │
│                 │     │                 │     │                 │
│  Graph: nodes,  │     │  Vectors:       │     │  Cache:         │
│  edges,         │     │  embeddings,    │     │  invalidation,  │
│  properties     │     │  payload        │     │  pub/sub        │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       ▲                                               │
       │              feedback loop                    │
       └───────────────────────────────────────────────┘
```

### Write Order Justification

| Order | Storage | Reason |
|---------|-----------|---------|
| 1st | **Memgraph** | Source of truth. All entities receive a `nodeId` when created in the graph. Without a `nodeId`, writing to Qdrant is impossible. |
| 2nd | **Qdrant** | Secondary storage. Requires `nodeId` from Memgraph to link the vector to a graph node. After upsert, returns `vectorId`, which is written back into Memgraph. |
| 3rd | **Redis** | Cache is invalidated last. There is no point invalidating the cache before writes to the primary stores are complete. Also used for pub/sub notifications about write completion. |

### Storage Dependency Table

| Operation | Memgraph → Qdrant | Qdrant → Memgraph | Memgraph → Redis | Redis → Memgraph |
|----------|--------------------|--------------------|-------------------|-------------------|
| Node creation | `nodeId` passed as payload ID | `vectorId` written to node property | Cache key contains `nodeId` | No dependency |
| Property update | New text → embedding recalculation | None | Invalidate key `node:{nodeId}` | None |
| Node deletion | Delete vector by `nodeId` | None | Delete all keys `*:{nodeId}:*` | None |
| Edge creation | None (edges are not vectorized) | None | Invalidate neighbor cache | None |
| Search (read) | None | Results enriched with properties from MG | Cache results | None |

### Write Operation Template

```javascript
async function polystoreWrite(entityData, options = {}) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Step 1: Memgraph (primary) ──────────────────────────────
    const nodeId = entityData.id || crypto.randomUUID();

    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `MERGE (n:${entityData.label} {id: $id})
           SET n += $properties, n.updatedAt = datetime()
           RETURN n.id AS nodeId`,
          { id: nodeId, properties: entityData.properties }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async () => {
        await memgraphService.runQuery(
          `MATCH (n {id: $id}) DETACH DELETE n`,
          { id: nodeId }
        );
      }
    });

    // ── Step 2: Qdrant (secondary) ─────────────────────────────
    let vectorId = null;
    if (entityData.text && options.vectorize !== false) {
      const embedding = await teiService.embed(entityData.text);

      const qdrantResult = await saga.addStep({
        name: 'UpsertVector',
        execute: async () => {
          await qdrantService.upsert(options.collection || 'default', {
            id: nodeId,
            vector: embedding,
            payload: {
              nodeId: mgResult.nodeId,
              label: entityData.label,
              text: entityData.text,
              namespace: entityData.namespace || 'default',
              createdAt: new Date().toISOString()
            }
          });
          return { vectorId: nodeId };
        },
        compensate: async () => {
          await qdrantService.delete(options.collection || 'default', {
            points: [nodeId]
          });
        }
      });

      vectorId = qdrantResult.vectorId;

      // ── Step 2b: Write vectorId back to Memgraph ────────
      await saga.addStep({
        name: 'UpdateVectorRef',
        execute: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) SET n.vectorId = $vectorId`,
            { id: nodeId, vectorId }
          );
          return { updated: true };
        },
        compensate: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) REMOVE n.vectorId`,
            { id: nodeId }
          );
        }
      });
    }

    // ── Step 3: Redis (cache) ──────────────────────────────────
    await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        const cacheKeys = [
          `node:${nodeId}`,
          `neighbors:${nodeId}`,
          `search:${entityData.namespace || 'default'}:*`
        ];
        for (const key of cacheKeys) {
          if (key.includes('*')) {
            const matchingKeys = await redisService.keys(key);
            if (matchingKeys.length > 0) {
              await redisService.del(...matchingKeys);
            }
          } else {
            await redisService.del(key);
          }
        }
        // Publish event to subscribers
        await redisService.publish('polystore:changes', JSON.stringify({
          operationId,
          type: 'write',
          nodeId,
          label: entityData.label,
          timestamp: Date.now()
        }));
        return { invalidated: true };
      },
      compensate: async () => {
        // Cache does not require compensation — it self-heals
        // via TTL and subsequent read requests
      }
    });

    return { operationId, nodeId, vectorId, status: 'committed' };

  } catch (error) {
    await saga.compensate();
    throw new PolystoreWriteError(operationId, error);
  }
}
```

---

## 7.2 Compensating transactions

### Compensation Principle

In the absence of distributed transactions, the **Saga** pattern is used — a sequence of local transactions with compensating actions. On failure at any step, all previous steps are rolled back in reverse order (LIFO).

### Compensation Flow Diagram

```
Forward path:
═══════════════════════════════════════════════════════════════

  Step 1              Step 2              Step 3
  CreateNode  ──OK──▶ UpsertVector ──OK──▶ InvalidateCache ──▶ COMMITTED
       │                    │                    │
       │                    │                    ✗ FAIL
       │                    │                    │
       ▼                    ▼                    ▼

Compensation (compensation path, LIFO):
═══════════════════════════════════════════════════════════════

                                          Compensate Step 3
                                          (no-op for cache)
                                                │
                                                ▼
                           Compensate Step 2
                           (delete vector from Qdrant)
                                  │
                                  ▼
            Compensate Step 1
            (DETACH DELETE node from Memgraph)
                    │
                    ▼
               ROLLED BACK


Failure scenarios:
═══════════════════════════════════════════════════════════════

  Failure at Step 1:   No compensation (nothing was written)
  Failure at Step 2:   Compensate Step 1 (delete node from MG)
  Failure at Step 3:   Compensate Step 2 + Step 1
  Compensation failure: alertInconsistency() → manual intervention
```

### PolystoreSaga Class

```javascript
class PolystoreSaga {
  constructor(operationId) {
    this.operationId = operationId;
    this.completedSteps = [];     // Stack of completed steps (LIFO for rollback)
    this.startedAt = Date.now();
    this.status = 'pending';      // pending | executing | committed | compensating | failed
  }

  /**
   * Adds and executes a saga step.
   * Each step registers its compensation function before execution.
   * On execute failure — the compensation for the current step is NOT called
   * (it did not complete successfully), but all previous steps are rolled back.
   *
   * @param {Object} step - { name, execute, compensate }
   * @returns {*} Result of execute()
   */
  async addStep(step) {
    this.status = 'executing';

    const stepRecord = {
      name: step.name,
      compensate: step.compensate,
      executedAt: Date.now(),
      result: null
    };

    try {
      // Execute the forward action
      const result = await step.execute();
      stepRecord.result = result;

      // Register in the stack AFTER successful execution
      this.completedSteps.push(stepRecord);

      logger.debug(`[Saga:${this.operationId}] Step "${step.name}" completed`, {
        stepIndex: this.completedSteps.length,
        result
      });

      return result;

    } catch (error) {
      logger.error(`[Saga:${this.operationId}] Step "${step.name}" failed`, {
        error: error.message,
        completedSteps: this.completedSteps.map(s => s.name)
      });

      // Do not add the current step — it did not complete
      throw error;
    }
  }

  /**
   * Compensates all completed steps in reverse order (LIFO).
   * If a step's compensation itself fails —
   * we continue compensating the rest but flag a desync.
   */
  async compensate() {
    this.status = 'compensating';
    const errors = [];

    logger.warn(`[Saga:${this.operationId}] Starting compensation`, {
      stepsToCompensate: this.completedSteps.map(s => s.name)
    });

    // LIFO — reverse order
    const stepsToUndo = [...this.completedSteps].reverse();

    for (const step of stepsToUndo) {
      try {
        if (typeof step.compensate === 'function') {
          await step.compensate(step.result);
          logger.info(`[Saga:${this.operationId}] Compensated step "${step.name}"`);
        }
      } catch (compensationError) {
        errors.push({
          step: step.name,
          error: compensationError.message
        });

        logger.error(`[Saga:${this.operationId}] Compensation FAILED for step "${step.name}"`, {
          error: compensationError.message
        });
      }
    }

    if (errors.length > 0) {
      this.status = 'failed';
      await this.alertInconsistency(errors);
    } else {
      this.status = 'compensated';
    }

    return { status: this.status, errors };
  }

  /**
   * Notification of data desynchronization.
   * Called when a compensating transaction itself fails,
   * leaving data in an inconsistent state.
   *
   * @param {Array} errors - array of { step, error }
   */
  async alertInconsistency(errors) {
    const alert = {
      operationId: this.operationId,
      severity: 'CRITICAL',
      type: 'POLYSTORE_INCONSISTENCY',
      startedAt: this.startedAt,
      detectedAt: Date.now(),
      completedSteps: this.completedSteps.map(s => s.name),
      compensationErrors: errors,
      requiresManualIntervention: true
    };

    // Write to Memgraph for audit
    try {
      await memgraphService.runQuery(
        `CREATE (a:InconsistencyAlert {
          id: $id,
          operationId: $operationId,
          severity: $severity,
          errors: $errors,
          createdAt: datetime()
        })`,
        {
          id: crypto.randomUUID(),
          operationId: this.operationId,
          severity: alert.severity,
          errors: JSON.stringify(errors)
        }
      );
    } catch (dbError) {
      // If even the alert could not be written — log to stderr
      console.error('[CRITICAL] Cannot persist inconsistency alert:', alert);
    }

    // Publish to Redis for monitoring
    try {
      await redisService.publish('polystore:inconsistency', JSON.stringify(alert));
    } catch (redisError) {
      // Redis may be unavailable — this is expected during a cascading failure
    }

    logger.error(`[CRITICAL] Polystore inconsistency detected`, alert);
  }
}
```

### Usage Example

```javascript
async function createEntityWithFullSync(entityData) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Operation 1: Create node in Memgraph ──────────────────
    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `CREATE (n:Entity {id: $id, name: $name, description: $desc, createdAt: datetime()})
           RETURN n.id AS nodeId`,
          { id: entityData.id, name: entityData.name, desc: entityData.description }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async (result) => {
        await memgraphService.runQuery(
          `MATCH (n:Entity {id: $id}) DETACH DELETE n`,
          { id: result.nodeId }
        );
        logger.info(`Compensated: deleted node ${result.nodeId} from Memgraph`);
      }
    });

    // ── Operation 2: Upsert vector in Qdrant ───────────────────
    const qdrantResult = await saga.addStep({
      name: 'UpsertVector',
      execute: async () => {
        const embedding = await teiService.embed(entityData.description);
        await qdrantService.upsert('entities', {
          id: mgResult.nodeId,
          vector: embedding,
          payload: {
            nodeId: mgResult.nodeId,
            name: entityData.name,
            label: 'Entity'
          }
        });
        return { vectorId: mgResult.nodeId, collection: 'entities' };
      },
      compensate: async (result) => {
        await qdrantService.delete(result.collection, {
          points: [result.vectorId]
        });
        logger.info(`Compensated: deleted vector ${result.vectorId} from Qdrant`);
      }
    });

    // ── Operation 3: Redis cache invalidation ────────────────────
    const redisResult = await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        await redisService.del(`entity:${mgResult.nodeId}`);
        await redisService.del('entities:list');
        await redisService.publish('entities:updated', JSON.stringify({
          action: 'create',
          nodeId: mgResult.nodeId
        }));
        return { keysInvalidated: 2 };
      },
      compensate: async () => {
        // Cache is self-healing — no compensation required.
        // On the next read request, the cache will be rebuilt from Memgraph.
        logger.info('Compensated: cache invalidation is self-healing, no action needed');
      }
    });

    return {
      operationId,
      nodeId: mgResult.nodeId,
      vectorId: qdrantResult.vectorId,
      cacheInvalidated: redisResult.keysInvalidated,
      status: 'committed'
    };

  } catch (error) {
    logger.error(`Entity creation failed, starting compensation`, { operationId, error: error.message });
    const compensation = await saga.compensate();
    throw new PolystoreWriteError(operationId, error, compensation);
  }
}
```

---

## 7.3 Eventually consistent

### Permissible Temporary Inconsistencies

In a polystore architecture, absolute consistency between stores is impossible. We define acceptable windows of temporary inconsistency:

| Store pair | Desync type | Acceptable window | Consequences | Detection |
|---------------|----------------------|-----------------|-------------|-------------|
| Memgraph → Qdrant | Node created in MG, vector not yet written to Qdrant | **< 5 seconds** | Semantic search does not find the new node. Graph queries work. | `findMissingVectors()` |
| Qdrant → Redis | Vector updated in Qdrant, Redis cache contains stale result | **< 1 second** | Search results show outdated data | TTL-based expiry |
| Deleted node → Orphaned vector | Node deleted from MG, vector remains in Qdrant | **< 1 hour** | Search may return references to non-existent nodes | `findOrphanedVectors()` |
| MG property update → Qdrant payload | Property changed in MG, Qdrant payload is stale | **< 5 seconds** | Filtering by payload returns stale data | Periodic reconciliation |
| Redis cache → MG state | Cache contains stale data | **< TTL (300 sec)** | Read requests return stale data | TTL auto-expiry |

### Consistency Levels

The system supports three consistency levels, selectable based on the operation's requirements:

| Level | Description | Memgraph | Qdrant | Redis | Latency | Usage |
|---------|----------|----------|--------|-------|---------|---------------|
| `STRONG` | All operations synchronous | sync | sync | sync | High (200-500ms) | Critical writes, financial data |
| `EVENTUAL` | MG synchronous, others asynchronous | sync | async | async | Medium (50-100ms) | Standard CRUD operations |
| `BEST_EFFORT` | All operations asynchronous | async | async | async | Low (10-30ms) | Bulk import, background jobs |

### writeWithConsistency Implementation

```javascript
const ConsistencyLevel = {
  STRONG: 'STRONG',
  EVENTUAL: 'EVENTUAL',
  BEST_EFFORT: 'BEST_EFFORT'
};

/**
 * Write data with the selected consistency level.
 *
 * @param {Object} entityData - data to write
 * @param {string} level - consistency level (STRONG | EVENTUAL | BEST_EFFORT)
 * @returns {Object} write result
 */
async function writeWithConsistency(entityData, level = ConsistencyLevel.EVENTUAL) {
  const operationId = crypto.randomUUID();
  const results = { operationId, level, steps: {} };

  switch (level) {

    case ConsistencyLevel.STRONG: {
      // ── All three steps synchronously, with full Saga compensation ──
      const saga = new PolystoreSaga(operationId);

      try {
        results.steps.memgraph = await saga.addStep({
          name: 'CreateNode',
          execute: () => writeToMemgraph(entityData),
          compensate: (res) => deleteFromMemgraph(res.nodeId)
        });

        results.steps.qdrant = await saga.addStep({
          name: 'UpsertVector',
          execute: () => upsertToQdrant(entityData, results.steps.memgraph.nodeId),
          compensate: (res) => deleteFromQdrant(res.vectorId)
        });

        results.steps.redis = await saga.addStep({
          name: 'InvalidateCache',
          execute: () => invalidateRedisCache(results.steps.memgraph.nodeId),
          compensate: () => {} // self-healing
        });

        results.status = 'committed';
      } catch (error) {
        await saga.compensate();
        throw new PolystoreWriteError(operationId, error);
      }
      break;
    }

    case ConsistencyLevel.EVENTUAL: {
      // ── Memgraph synchronously, Qdrant and Redis — via queue ──
      try {
        results.steps.memgraph = await writeToMemgraph(entityData);
      } catch (error) {
        throw new PolystoreWriteError(operationId, error);
      }

      // Async tasks via Redis queue
      const asyncTasks = {
        qdrant: {
          type: 'UPSERT_VECTOR',
          nodeId: results.steps.memgraph.nodeId,
          entityData,
          operationId,
          retryCount: 0,
          maxRetries: 3
        },
        redis: {
          type: 'INVALIDATE_CACHE',
          nodeId: results.steps.memgraph.nodeId,
          operationId
        }
      };

      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.qdrant));
      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.redis));

      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'committed-partial';
      break;
    }

    case ConsistencyLevel.BEST_EFFORT: {
      // ── All three steps asynchronously via queue ───────────────
      const taskId = crypto.randomUUID();

      const batchTask = {
        type: 'POLYSTORE_BATCH_WRITE',
        taskId,
        operationId,
        entityData,
        steps: ['memgraph', 'qdrant', 'redis'],
        retryCount: 0,
        maxRetries: 5,
        createdAt: Date.now()
      };

      await redisService.lpush('polystore:batch-queue', JSON.stringify(batchTask));

      results.steps.memgraph = { status: 'queued' };
      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'queued';
      break;
    }

    default:
      throw new Error(`Unknown consistency level: ${level}`);
  }

  return results;
}
```

---

## 7.4 Checkpoint/Resume

### Purpose

Long-running pipelines (bulk import, full reindexing, GXE-execution) may process thousands of nodes. On failure, progress must not be lost — resumption from the last successful step is required.

### CheckpointManager Class

```javascript
class CheckpointManager {
  constructor(pipelineId, redisService) {
    this.pipelineId = pipelineId;
    this.redisService = redisService;
    this.checkpointKey = `checkpoint:${pipelineId}`;
    this.TTL_SECONDS = 86400; // 24 hours
  }

  /**
   * Saves a checkpoint in Redis with a 24-hour TTL.
   *
   * @param {Object} state - current pipeline state
   * @param {string} state.currentStep - name of the current step
   * @param {number} state.processedCount - number of processed items
   * @param {Array<string>} state.completedOps - list of completed operations
   * @param {Object} state.context - arbitrary context for restoration
   */
  async saveCheckpoint(state) {
    const checkpoint = {
      pipelineId: this.pipelineId,
      currentStep: state.currentStep,
      processedCount: state.processedCount,
      completedOps: state.completedOps || [],
      context: state.context || {},
      savedAt: Date.now(),
      version: 1
    };

    await this.redisService.set(
      this.checkpointKey,
      JSON.stringify(checkpoint),
      'EX',
      this.TTL_SECONDS
    );

    logger.debug(`[Checkpoint:${this.pipelineId}] Saved`, {
      step: state.currentStep,
      processed: state.processedCount
    });

    return checkpoint;
  }

  /**
   * Loads the latest checkpoint from Redis.
   *
   * @returns {Object|null} checkpoint state or null if not found / TTL expired
   */
  async loadCheckpoint() {
    const raw = await this.redisService.get(this.checkpointKey);

    if (!raw) {
      logger.debug(`[Checkpoint:${this.pipelineId}] No checkpoint found`);
      return null;
    }

    try {
      const checkpoint = JSON.parse(raw);
      logger.info(`[Checkpoint:${this.pipelineId}] Loaded`, {
        step: checkpoint.currentStep,
        processed: checkpoint.processedCount,
        savedAt: new Date(checkpoint.savedAt).toISOString()
      });
      return checkpoint;
    } catch (parseError) {
      logger.error(`[Checkpoint:${this.pipelineId}] Corrupt checkpoint data`, {
        error: parseError.message
      });
      return null;
    }
  }

  /**
   * Resumes pipeline execution from the last checkpoint.
   * Skips already completed operations.
   *
   * @param {Array<Object>} operations - full list of pipeline operations
   *   Each operation: { id, name, execute }
   * @param {Function} onProgress - callback for tracking progress
   * @returns {Object} execution result
   */
  async resumeFromCheckpoint(operations, onProgress) {
    const checkpoint = await this.loadCheckpoint();
    const completedOps = checkpoint ? new Set(checkpoint.completedOps) : new Set();
    let processedCount = checkpoint ? checkpoint.processedCount : 0;

    logger.info(`[Checkpoint:${this.pipelineId}] Resuming`, {
      totalOps: operations.length,
      alreadyCompleted: completedOps.size,
      skipping: completedOps.size
    });

    const results = [];

    for (const op of operations) {
      // Skip already completed operations
      if (completedOps.has(op.id)) {
        logger.debug(`[Checkpoint:${this.pipelineId}] Skipping completed op: ${op.name}`);
        continue;
      }

      try {
        const result = await op.execute();
        results.push({ opId: op.id, name: op.name, status: 'ok', result });

        completedOps.add(op.id);
        processedCount++;

        // Save checkpoint
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: checkpoint ? checkpoint.context : {}
        });

        if (onProgress) {
          onProgress({
            completed: processedCount,
            total: operations.length,
            currentOp: op.name
          });
        }

      } catch (error) {
        logger.error(`[Checkpoint:${this.pipelineId}] Op "${op.name}" failed`, {
          error: error.message,
          processedCount
        });

        // Save checkpoint BEFORE the error — on retry we skip completed ones
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: { lastError: error.message, failedOp: op.id }
        });

        throw error;
      }
    }

    // Clear checkpoint after successful completion
    await this.redisService.del(this.checkpointKey);

    return {
      pipelineId: this.pipelineId,
      totalProcessed: processedCount,
      results,
      status: 'completed'
    };
  }
}
```

### Checkpoint Frequency

| Pipeline type | Checkpoint frequency | Justification |
|---------------|--------------------|-------------|
| **Bulk import** | Every 100 nodes | Balance between performance and acceptable progress loss. Reprocessing 100 nodes takes an acceptable ~30 seconds. |
| **Incremental update** | Every 10 nodes | Incremental updates are more valuable — each node may contain unique data. Losing 10 nodes is acceptable. |
| **GXE execution** | Every node | Each GXE-graph node may trigger an LLM call (expensive). Repeating an LLM call wastes budget. A checkpoint on every step is mandatory. |
| **Reindexing** | Every 500 vectors | Reindexing is an idempotent operation. Repeating 500 upserts in Qdrant takes ~10 seconds, acceptable. |
| **Graph migration** | Every migration step | Migration changes structure. A partial migration is more dangerous than a partial import. A checkpoint on every DDL step. |

---

## 7.5 Health checks

### PolystoreHealthChecker Class

```javascript
class PolystoreHealthChecker {
  constructor(memgraphService, qdrantService, redisService) {
    this.memgraph = memgraphService;
    this.qdrant = qdrantService;
    this.redis = redisService;
  }

  /**
   * Full consistency check across stores.
   *
   * @returns {Object} desync report
   */
  async checkConsistency() {
    const report = {
      checkedAt: new Date().toISOString(),
      issues: [],
      stats: {}
    };

    // ── Check 1: Orphaned vectors ────────────────────────────
    const orphaned = await this.findOrphanedVectors();
    report.stats.orphanedVectors = orphaned.length;
    if (orphaned.length > 0) {
      report.issues.push({
        type: 'ORPHANED_VECTORS',
        severity: orphaned.length > 100 ? 'HIGH' : 'MEDIUM',
        count: orphaned.length,
        description: `Found ${orphaned.length} vectors in Qdrant without corresponding nodes in Memgraph`,
        vectorIds: orphaned.slice(0, 50) // First 50 for the report
      });
    }

    // ── Check 2: Missing vectors ─────────────────────────────
    const missing = await this.findMissingVectors();
    report.stats.missingVectors = missing.length;
    if (missing.length > 0) {
      report.issues.push({
        type: 'MISSING_VECTORS',
        severity: missing.length > 50 ? 'HIGH' : 'MEDIUM',
        count: missing.length,
        description: `Found ${missing.length} nodes in Memgraph with vectorId but without corresponding records in Qdrant`,
        nodeIds: missing.slice(0, 50)
      });
    }

    // ── Check 3: Stale cache ─────────────────────────────────
    const stale = await this.findStaleCache();
    report.stats.staleCacheKeys = stale.length;
    if (stale.length > 0) {
      report.issues.push({
        type: 'STALE_CACHE',
        severity: 'LOW',
        count: stale.length,
        description: `Found ${stale.length} Redis cache keys referencing non-existent or modified nodes`,
        keys: stale.slice(0, 20)
      });
    }

    report.healthy = report.issues.length === 0;
    return report;
  }

  /**
   * Find "orphaned" vectors — records in Qdrant
   * for which no corresponding node exists in Memgraph.
   *
   * Algorithm: scroll through all points in the Qdrant collection,
   * check each batch for node existence in Memgraph.
   *
   * @param {string} collection - Qdrant collection name (default: 'default')
   * @returns {Array<string>} list of vectorIds without nodes in MG
   */
  async findOrphanedVectors(collection = 'default') {
    const orphaned = [];
    let offset = null;
    const batchSize = 100;

    do {
      // Scroll through Qdrant points
      const scrollResult = await this.qdrant.scroll(collection, {
        limit: batchSize,
        offset: offset,
        with_payload: true,
        with_vectors: false // Vectors are not needed for the check
      });

      const points = scrollResult.points || [];
      if (points.length === 0) break;

      // Extract nodeId from each point's payload
      const nodeIds = points
        .map(p => p.payload?.nodeId || p.id)
        .filter(Boolean);

      if (nodeIds.length > 0) {
        // Batch-check in Memgraph: which of the nodeIds exist?
        const existResult = await this.memgraph.runQuery(
          `UNWIND $ids AS nid
           OPTIONAL MATCH (n {id: nid})
           RETURN nid, n IS NOT NULL AS exists`,
          { ids: nodeIds }
        );

        const existingSet = new Set(
          existResult.records
            .filter(r => r.get('exists'))
            .map(r => r.get('nid'))
        );

        // Those not in Memgraph — orphaned
        for (const point of points) {
          const nodeId = point.payload?.nodeId || point.id;
          if (!existingSet.has(nodeId)) {
            orphaned.push(nodeId);
          }
        }
      }

      offset = scrollResult.next_page_offset;
    } while (offset !== null && offset !== undefined);

    return orphaned;
  }

  /**
   * Find "missing" vectors — nodes in Memgraph
   * that have a vectorId property but have no corresponding record in Qdrant.
   *
   * @param {string} collection - Qdrant collection name (default: 'default')
   * @returns {Array<string>} list of nodeIds with missing vectors
   */
  async findMissingVectors(collection = 'default') {
    const missing = [];

    // Retrieve all nodes with vectorId from Memgraph
    const mgResult = await this.memgraph.runQuery(
      `MATCH (n)
       WHERE n.vectorId IS NOT NULL
       RETURN n.id AS nodeId, n.vectorId AS vectorId`
    );

    const nodesWithVectors = mgResult.records.map(r => ({
      nodeId: r.get('nodeId'),
      vectorId: r.get('vectorId')
    }));

    // Batch-check in Qdrant
    const batchSize = 100;
    for (let i = 0; i < nodesWithVectors.length; i += batchSize) {
      const batch = nodesWithVectors.slice(i, i + batchSize);
      const pointIds = batch.map(n => n.vectorId);

      try {
        const getResult = await this.qdrant.getPoints(collection, {
          ids: pointIds,
          with_payload: false,
          with_vectors: false
        });

        const foundIds = new Set((getResult || []).map(p => p.id));

        for (const node of batch) {
          if (!foundIds.has(node.vectorId)) {
            missing.push(node.nodeId);
          }
        }
      } catch (error) {
        // If the collection does not exist — all vectors are missing
        if (error.message?.includes('not found')) {
          missing.push(...batch.map(n => n.nodeId));
        } else {
          throw error;
        }
      }
    }

    return missing;
  }

  /**
   * Find stale cache entries — keys in Redis
   * referencing nodes that were deleted or modified in Memgraph.
   *
   * @returns {Array<string>} list of stale Redis keys
   */
  async findStaleCache() {
    const staleKeys = [];

    // Scan node:* keys in Redis
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'node:*', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const nodeId = key.replace('node:', '');
        const cached = await this.redis.get(key);

        if (!cached) continue;

        try {
          const cachedData = JSON.parse(cached);

          // Check existence and freshness in Memgraph
          const mgResult = await this.memgraph.runQuery(
            `MATCH (n {id: $id})
             RETURN n.updatedAt AS updatedAt`,
            { id: nodeId }
          );

          if (mgResult.records.length === 0) {
            // Node deleted — cache is stale
            staleKeys.push(key);
          } else {
            const mgUpdatedAt = mgResult.records[0].get('updatedAt');
            if (cachedData.cachedAt && mgUpdatedAt && new Date(mgUpdatedAt) > new Date(cachedData.cachedAt)) {
              // Node updated after caching
              staleKeys.push(key);
            }
          }
        } catch (parseError) {
          // Invalid JSON in cache — also stale
          staleKeys.push(key);
        }
      }
    } while (cursor !== '0');

    return staleKeys;
  }

  /**
   * Automatic repair of detected desyncs.
   *
   * @param {Object} report - report from checkConsistency()
   * @returns {Object} repair result
   */
  async autoRepair(report) {
    const repairLog = {
      startedAt: new Date().toISOString(),
      repaired: [],
      failed: []
    };

    for (const issue of report.issues) {
      try {
        switch (issue.type) {

          case 'ORPHANED_VECTORS': {
            // Delete orphaned vectors from Qdrant
            const orphanedIds = issue.vectorIds || [];
            if (orphanedIds.length > 0) {
              await this.qdrant.delete('default', {
                points: orphanedIds
              });
              repairLog.repaired.push({
                type: 'ORPHANED_VECTORS',
                action: 'Deleted orphaned vectors from Qdrant',
                count: orphanedIds.length
              });
            }
            break;
          }

          case 'MISSING_VECTORS': {
            // Recreate missing vectors
            const nodeIds = issue.nodeIds || [];
            let reindexed = 0;

            for (const nodeId of nodeIds) {
              try {
                const mgResult = await this.memgraph.runQuery(
                  `MATCH (n {id: $id})
                   RETURN n.id AS nodeId, n.description AS text, labels(n)[0] AS label`,
                  { id: nodeId }
                );

                if (mgResult.records.length > 0) {
                  const record = mgResult.records[0];
                  const text = record.get('text');

                  if (text) {
                    const embedding = await teiService.embed(text);
                    await this.qdrant.upsert('default', {
                      id: nodeId,
                      vector: embedding,
                      payload: {
                        nodeId,
                        label: record.get('label'),
                        text
                      }
                    });
                    reindexed++;
                  } else {
                    // No text — remove vectorId from node
                    await this.memgraph.runQuery(
                      `MATCH (n {id: $id}) REMOVE n.vectorId`,
                      { id: nodeId }
                    );
                  }
                }
              } catch (nodeError) {
                repairLog.failed.push({
                  type: 'MISSING_VECTORS',
                  nodeId,
                  error: nodeError.message
                });
              }
            }

            repairLog.repaired.push({
              type: 'MISSING_VECTORS',
              action: 'Recreated missing vectors in Qdrant',
              count: reindexed
            });
            break;
          }

          case 'STALE_CACHE': {
            // Delete stale cache keys
            const keys = issue.keys || [];
            if (keys.length > 0) {
              await this.redis.del(...keys);
              repairLog.repaired.push({
                type: 'STALE_CACHE',
                action: 'Deleted stale Redis cache keys',
                count: keys.length
              });
            }
            break;
          }

          default:
            logger.warn(`Unknown issue type: ${issue.type}`);
        }

      } catch (repairError) {
        repairLog.failed.push({
          type: issue.type,
          error: repairError.message
        });
      }
    }

    repairLog.completedAt = new Date().toISOString();
    return repairLog;
  }
}
```

### Check Schedule

| Check | Interval | Justification | autoRepair |
|----------|----------|-------------|------------|
| **Orphaned vectors** (`findOrphanedVectors`) | Every 6 hours | Orphaned vectors accumulate slowly (only on deletion failures). 6 hours is sufficient for detection without overloading Qdrant with scrolls. | Yes — delete from Qdrant |
| **Missing vectors** (`findMissingVectors`) | Every 1 hour | Missing vectors affect semantic search. 1 hour is a compromise between search freshness and reindexing load. | Yes — recreate embeddings |
| **Stale cache** (`findStaleCache`) | Every 15 minutes | Stale cache is the least critical issue (TTL 300 seconds self-cleans). 15 minutes catches keys without TTL and keys with long TTL. | Yes — delete keys |
| **Hash chain integrity** | Weekly | Audit log hash chain integrity check. Expensive operation (full traversal). Weekly is sufficient for detecting tampering. | No — manual investigation |

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Part VIII: Self-Evolving System

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

The UN ProjectAdvisor system is designed not as a static tool, but as a **self-evolving organism**. The knowledge graph is a living structure that continuously grows, refines itself, corrects its mistakes, and learns from its own experience.

This standard defines:

1. **Cascaded AI agent architecture** — how multiple agents coordinate their work
2. **Consensus mechanisms** — how agents make collective decisions
3. **Autonomous optimization** — how the system improves itself without human intervention
4. **Conflict detection and resolution** — how conflicts become knowledge
5. **Self-documentation** — how the system describes its own evolution
6. **Autonomy levels** — boundaries of independence at each maturity stage

---

## 8.1 Cascaded AI Agent Architecture (Agent Cascade)

### Three-Level Hierarchy

The agent system is organized into three levels, each with its own area of responsibility and authority.

```
                        ┌──────────────────────────┐
                        │      ORCHESTRATOR        │
                        │      (Meta-agent)        │
                        │                          │
                        │  - Distributes tasks     │
                        │  - Resolves conflicts    │
                        │  - Manages autonomy      │
                        │  - trustScore ≥ 0.95     │
                        └────────────┬─────────────┘
                                     │
               ┌─────────────────────┼─────────────────────┐
               │                     │                     │
    ┌──────────▼──────────┐ ┌────────▼────────┐ ┌─────────▼─────────┐
    │   SPECIALIZED       │ │  SPECIALIZED    │ │   SPECIALIZED     │
    │   AGENTS            │ │  AGENTS         │ │   AGENTS          │
    │                     │ │                 │ │                   │
    │  Extractor          │ │  Validator      │ │  Enricher         │
    │  Resolver           │ │  Optimizer      │ │  (+ future)       │
    │                     │ │                 │ │                   │
    │  trustScore ≥ 0.8   │ │  trustScore ≥   │ │  trustScore ≥ 0.8 │
    │                     │ │  0.85           │ │                   │
    └──────────┬──────────┘ └────────┬────────┘ └─────────┬─────────┘
               │                     │                     │
        ┌──────┴──────┐       ┌──────┴──────┐       ┌─────┴───────┐
        │   Worker    │       │   Worker    │       │   Worker    │
        │   Agents    │       │   Agents    │       │   Agents    │
        │             │       │             │       │             │
        │  Atomic     │       │  Field      │       │  Vectorization│
        │  extractions│       │  checking   │       │  Relations   │
        │             │       │  hashes     │       │  Contexts    │
        │  trustScore │       │  schemas    │       │              │
        │  ≥ 0.6      │       │             │       │  trustScore  │
        └─────────────┘       └─────────────┘       │  ≥ 0.6      │
                                                    └─────────────┘
                        ┌──────────────────────────┐
            ◄───────────│     FEEDBACK LOOPS       │───────────►
                        │                          │
                        │  QUALITY_ISSUE ─────►    │
                        │  ◄───── REVIEWED_BY      │
                        │  DELEGATED_TO ─────►     │
                        └──────────────────────────┘
```

### Agent Specializations

| Agent | Specialization | Typical operations | Required trustScore |
|-------|---------------|-------------------|---------------------|
| **Extractor** | Fact extraction from sources | SQL parsing, code analysis, NLP extraction | ≥ 0.8 |
| **Validator** | Quality and consistency checks | Schema validation, hash verification, CODEX-VALID | ≥ 0.85 |
| **Enricher** | Enrichment with relationships and context | Edge creation, provenance addition, classification | ≥ 0.8 |
| **Resolver** | Conflict and duplicate resolution | Entity resolution, merge, deduplication | ≥ 0.85 |
| **Optimizer** | Structure and performance optimization | Index reorganization, chain compression, archiving | ≥ 0.8 |

### Agent Registration and Discovery

Each agent is registered in the knowledge graph as a node of type `:Agent` in the `META` namespace:

```javascript
// Register agent in Knowledge Graph
const agentNode = {
  id: crypto.randomUUID(),
  label: 'Agent',
  namespace: 'META',
  properties: {
    agentId:          'agent-extractor-sql-001',
    specialization:   'Extractor',
    domain:           'SQL',
    trustScore:       0.85,
    autonomyLevel:    1,            // Level 0-4 (see Section 8.6)
    status:           'ACTIVE',     // ACTIVE | SUSPENDED | RETIRED
    registeredAt:     new Date().toISOString(),
    lastHeartbeat:    new Date().toISOString(),
    executionHistory: {
      totalExecutions:   0,
      successCount:      0,
      failureCount:      0,
      avgDurationMs:     0,
      lastExecutionAt:   null
    },
    capabilities: [
      'sql-schema-extraction',
      'stored-procedure-analysis',
      'table-relationship-inference'
    ]
  }
};
```

### Discovery Protocol

Agents discover each other through Cypher queries to the META namespace:

```cypher
// Find all active agents with the required specialization
MATCH (a:Agent {namespace: 'META', status: 'ACTIVE'})
WHERE a.specialization = 'Validator'
  AND a.trustScore >= 0.85
RETURN a.agentId, a.trustScore, a.capabilities
ORDER BY a.trustScore DESC
```

### Inter-Agent Communication

Agents interact through Knowledge Graph edges. This guarantees full traceability of all decisions.

```
┌─────────────┐   DELEGATED_TO    ┌─────────────┐
│ Orchestrator│──────────────────►│  Extractor   │
│             │                   │              │
│             │   REVIEWED_BY     │              │
│             │◄──────────────────│              │
└─────────────┘                   └──────┬───────┘
                                         │
                                  QUALITY_ISSUE
                                         │
                                  ┌──────▼───────┐
                                  │   Validator   │
                                  │              │
                                  └──────────────┘
```

**Communication edge types:**

```cypher
// DELEGATED_TO — task delegation from a higher-level agent
CREATE (orchestrator)-[:DELEGATED_TO {
  taskId:      $taskId,
  priority:    'HIGH',
  deadline:    datetime('2026-03-12T18:00:00Z'),
  context:     $contextJson,
  delegatedAt: datetime()
}]->(extractor)

// REVIEWED_BY — review result from a lower-level agent
CREATE (result)-[:REVIEWED_BY {
  reviewerId:  $validatorAgentId,
  verdict:     'APPROVED',          // APPROVED | REJECTED | NEEDS_REVISION
  confidence:  0.92,
  comments:    'Schema validated against CODEX-META',
  reviewedAt:  datetime()
}]->(validator)

// QUALITY_ISSUE — detection of a problem in another agent's data
CREATE (node)-[:QUALITY_ISSUE {
  issueId:     $issueId,
  reporterId:  $reporterAgentId,
  severity:    'WARNING',           // INFO | WARNING | ERROR | CRITICAL
  issueType:   'MISSING_PROVENANCE',
  description: 'Node lacks sourceType and sourceId fields',
  reportedAt:  datetime(),
  resolved:    false
}]->(reporter)
```

### Data Inviolability Rule

> **An agent that discovers a problem in another agent's data MUST record it as a `QUALITY_ISSUE` edge with a description of the problem, rather than silently correcting it.** Silent correction breaks the provenance chain and makes analysis of systemic errors impossible.

---

## 8.2 Quality Consensus: Agent Voting

### Three Consensus Levels

Consensus mechanisms are defined in the [AI Agent Manifesto](../manifesto/AI_MANIFESTO.md) and are implemented through a voting protocol.

```
┌────────────────────────────────────────────────────────────────────┐
│                       CONSENSUS LEVELS                            │
├────────────────┬──────────────────┬────────────────────────────────┤
│   MAJORITY     │    WEIGHTED      │        UNANIMOUS               │
│   (> 50%)      │  (weighted)      │        (100%)                  │
├────────────────┼──────────────────┼────────────────────────────────┤
│ Entity         │ SQL schema →     │ DELETE entity                  │
│ resolution     │ business rules   │ MERGE entities                 │
│                │                  │                                │
│ Confidence     │ Ontology         │ Namespace change               │
│ update         │ classification   │                                │
│                │                  │ God Mode operations            │
│ Pattern        │ Cross-domain     │                                │
│ promotion      │ linking          │ Autonomy level upgrade         │
│                │                  │                                │
│ Routine        │ Domain expertise │ Schema migration               │
│ enrichment     │ required         │                                │
├────────────────┼──────────────────┼────────────────────────────────┤
│ Threshold: >50%│ Threshold: Σweight│ Threshold: 100% of            │
│ of votes       │ × vote > 0.5     │ participants agree             │
│ quorum: ≥3     │ quorum: ≥3       │ quorum: ≥3 (all with          │
│ agents         │ agents           │ trustScore ≥ 0.8 in domain)   │
└────────────────┴──────────────────┴────────────────────────────────┘
```

### Voting Protocol

```
┌──────────┐     Propose      ┌───────────┐     Broadcast     ┌──────────┐
│          │─────────────────►│           │────────────────────│          │
│ Initiator│                  │  Voting   │                    │ Agent N  │
│ Agent    │◄─────────────────│  Session  │◄───────────────────│          │
│          │     Result       │           │     Vote           │          │
└──────────┘                  └─────┬─────┘                    └──────────┘
                                    │
                              Timeout / Quorum
                                    │
                              ┌─────▼─────┐
                              │  Decision  │
                              │            │
                              │  APPROVED  │
                              │  REJECTED  │
                              │  ESCALATED │
                              └────────────┘
```

**Protocol implementation:**

```javascript
class VotingSession {
  constructor({ proposalId, type, quorum, timeout }) {
    this.proposalId = proposalId;
    this.type       = type;        // 'MAJORITY' | 'WEIGHTED' | 'UNANIMOUS'
    this.quorum     = quorum;      // Minimum number of voters (default: 3)
    this.timeout    = timeout;     // Milliseconds before auto-escalation
    this.votes      = new Map();   // agentId → { vote, weight, reason }
    this.status     = 'OPEN';      // OPEN | DECIDED | ESCALATED | EXPIRED
    this.round      = 1;           // Current round (max 3)
    this.createdAt  = Date.now();
  }

  /**
   * Register a vote from an agent
   * @param {string} agentId
   * @param {boolean} approve - true = FOR, false = AGAINST
   * @param {number} weight - Agent's specialization score (0..1)
   * @param {string} reason - Justification for the vote
   */
  castVote(agentId, approve, weight, reason) {
    if (this.status !== 'OPEN') {
      throw new Error(`Voting session ${this.proposalId} is ${this.status}`);
    }
    this.votes.set(agentId, { vote: approve, weight, reason, castAt: Date.now() });
    return this._evaluate();
  }

  _evaluate() {
    if (this.votes.size < this.quorum) return { status: 'PENDING' };

    switch (this.type) {
      case 'MAJORITY': {
        const forCount = [...this.votes.values()].filter(v => v.vote).length;
        const approved = forCount / this.votes.size > 0.5;
        this.status = 'DECIDED';
        return { status: 'DECIDED', approved, forCount, total: this.votes.size };
      }

      case 'WEIGHTED': {
        const weightedSum = [...this.votes.values()].reduce((sum, v) => {
          return sum + (v.vote ? v.weight : -v.weight);
        }, 0);
        const totalWeight = [...this.votes.values()].reduce((s, v) => s + v.weight, 0);
        const approved = (weightedSum / totalWeight) > 0.5;
        this.status = 'DECIDED';
        return { status: 'DECIDED', approved, weightedSum, totalWeight };
      }

      case 'UNANIMOUS': {
        const allApproved = [...this.votes.values()].every(v => v.vote);
        if (allApproved) {
          this.status = 'DECIDED';
          return { status: 'DECIDED', approved: true };
        }
        // Any rejection in UNANIMOUS → escalate or retry
        if (this.round < 3) {
          this.round++;
          this.votes.clear();
          return { status: 'RETRY', round: this.round };
        }
        this.status = 'ESCALATED';
        return { status: 'ESCALATED', reason: 'No unanimous consensus after 3 rounds' };
      }
    }
  }
}
```

### Timeout and Quorum Rules

| Parameter | MAJORITY | WEIGHTED | UNANIMOUS |
|----------|----------|----------|-----------|
| Quorum | ≥ 3 agents | ≥ 3 agents | All agents with trustScore ≥ 0.8 |
| Round timeout | 30 sec | 60 sec | 120 sec |
| Max rounds | 1 | 2 | 3 |
| On quorum not reached | ESCALATED | ESCALATED | ESCALATED |
| On timeout | Decision by current votes | Decision by current votes | ESCALATED |

### Conflict Resolution

If consensus is not reached after the maximum number of rounds, the task is escalated along the chain:

```
Round 1 ──► No consensus ──► Round 2 ──► No consensus ──► Round 3
                                                                    │
                                                              No consensus
                                                                    │
                                                              ┌─────▼──────┐
                                                              │ ESCALATION │
                                                              │            │
                                                              │ Orchestrator│
                                                              │ makes the  │
                                                              │ decision   │
                                                              └─────┬──────┘
                                                                    │
                                                    ┌───────────────┼──────────────┐
                                                    │               │              │
                                            trustScore ≥ 0.95   trustScore      human
                                            → Orchestrator       < 0.95         review
                                              decides itself     → escalation    required
                                                                   to human
```

All decisions (including escalated ones) are recorded in the graph as `:DECIDED_BY` edges with full justification.

---

## 8.3 Autonomous Optimization (APES — Agent Performance Evolution System)

### APES Architecture

APES is a closed feedback loop that combines the system's two existing pattern libraries into a single self-optimization mechanism.

```
    ┌───────────────────────────────────────────────────────────────────┐
    │                        APES FEEDBACK LOOP                        │
    │                                                                  │
    │    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
    │    │          │    │          │    │          │    │          │  │
    │    │ EXECUTE  │───►│ MEASURE  │───►│ COMPARE  │───►│ ADJUST   │  │
    │    │          │    │          │    │          │    │          │  │
    │    └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
    │         ▲                                               │        │
    │         │                                               │        │
    │         └───────────────────────────────────────────────┘        │
    │                                                                  │
    │    Components:                                                    │
    │    ┌─────────────────────────┐  ┌─────────────────────────────┐  │
    │    │ Runtime PatternLibrary  │  │ Extraction PatternLibrary   │  │
    │    │ runtime/learning/       │  │ services/patterns/          │  │
    │    │ PatternLibrary.js       │  │ pattern-library.js          │  │
    │    │                         │  │                             │  │
    │    │ - recordExecution()     │  │ - registerEntityPattern()   │  │
    │    │ - suggestBestGraph()    │  │ - registerRelationPattern() │  │
    │    │ - getStats()            │  │ - learnFromExtraction()     │  │
    │    │                         │  │ - matchPatterns()           │  │
    │    │ Metrics:                │  │                             │  │
    │    │ - successRate           │  │ Metrics:                    │  │
    │    │ - avgDurationMs         │  │ - observationCount          │  │
    │    │ - executionCount        │  │ - confidence                │  │
    │    └─────────────────────────┘  │ - domain coverage           │  │
    │                                  └─────────────────────────────┘  │
    └───────────────────────────────────────────────────────────────────┘
```

### Runtime PatternLibrary

File: `api/src/runtime/learning/PatternLibrary.js`

This library operates at the GXE Runtime level — it remembers which graphs (DAGs) were executed successfully and automatically suggests the best graph for a new task based on its category.

**Key operations:**

```javascript
const { PatternLibrary } = require('./runtime/learning/PatternLibrary');

const library = new PatternLibrary({
  maxSize: 100,
  minSuccessRate: 0.7
});

// ── EXECUTE: run the graph ──────────────────────────────────────
const result = await runtimeEngine.run(dagDefinition, inputData);

// ── MEASURE: record result ──────────────────────────────────────
await library.recordExecution({
  category:   'sql-extraction',
  graphHash:  dagDefinition.contentHash,
  success:    result.status === 'COMPLETED',
  durationMs: result.durationMs,
  dag:        dagDefinition
});

// ── COMPARE: get the best graph for a category ──────────────────
const bestPattern = await library.suggestBestGraph('sql-extraction');
// Returns: { dag, successRate, avgDurationMs, executionCount }

// ── ADJUST: if the current graph is worse than the best — replace ─
if (bestPattern && bestPattern.successRate > currentSuccessRate) {
  dagDefinition = bestPattern.dag;  // Use the better-performing graph
}
```

**Cache strategy:** LRU (Least Recently Used) with eviction when `maxSize` is exceeded. Patterns with `successRate < minSuccessRate` (default 0.7) are not cached.

### Extraction PatternLibrary

File: `api/src/services/patterns/pattern-library.js`

This library operates at the knowledge extraction level — it accumulates templates for recognizing entities, relationships, and subgraphs in text.

**Pattern types:**

| Type | Class | Example |
|-----|-------|--------|
| Entity | `EntityPattern` | `{name: "SQLTable", regex: /CREATE TABLE\s+(\w+)/}` |
| Relation | `RelationPattern` | `{type: "REFERENCES", source: "Column", target: "Table"}` |
| Subgraph | `SubgraphPattern` | `{name: "FK-chain", nodes: [...], edges: [...]}` |

**Automatic pattern promotion:**

```javascript
const patternLib = new PatternLibrary({
  enableLearning:    true,
  learningThreshold: 5   // Auto-promote after 5 successful observations
});

// Manual pattern registration
patternLib.registerEntityPattern({
  name:       'StoredProcedure',
  domain:     'SQL',
  labels:     ['Procedure', 'Code'],
  regex:      /CREATE\s+PROC(?:EDURE)?\s+\[?(\w+)\]?/gi,
  confidence: 0.9
});

// Automatic learning from extraction results
patternLib.learnFromExtraction({
  source:   'mssql-schema-scan',
  entities: extractedEntities,
  relations: extractedRelations
});
// If a pattern has been observed ≥ learningThreshold (5) times
// → it is automatically promoted from learningBuffer into the main catalog

// Find patterns by domain
const sqlPatterns = patternLib.findByDomain('SQL');
```

### Self-Tuning Loop

Full APES self-optimization cycle:

```
 Step 1: EXECUTE               Step 2: MEASURE
 ─────────────────              ─────────────────
 Run the graph                  Record metrics
 with current                   in PatternLibrary
 parameters                     (success/failure,
                                duration, outputs)
        │                              │
        │                              ▼
        │                       Step 3: COMPARE
        │                       ─────────────────
        │                       Compare the current
        │                       result with the best
        │                       pattern for category
        │                              │
        │                              ▼
        │                       Step 4: ADJUST
        │                       ─────────────────
        │                       If current is worse:
        │                       - replace the graph
        │                       - update parameters
        │                       - promote the pattern
        │                              │
        └──────────────────────────────┘
              (next iteration)
```

**Key APES metrics:**

| Metric | Source | Threshold |
|---------|----------|-------------------|
| `successRate` | Runtime PatternLibrary | ≥ 0.7 for caching |
| `avgDurationMs` | Runtime PatternLibrary | Reduction ≥ 10% = improvement |
| `observationCount` | Extraction PatternLibrary | ≥ 5 for auto-promotion |
| `confidence` | Extraction PatternLibrary | ≥ 0.4 for pattern matching |
| `domainCoverage` | Extraction PatternLibrary | Share of covered patterns in domain |

---

## 8.4 Contradiction Detection and Resolution

### Contradiction Types

The system distinguishes four classes of contradictions, each requiring a separate detection and resolution strategy.

```
┌──────────────────────────────────────────────────────────────────────┐
│                      CONTRADICTION TYPES                             │
├─────────────────┬────────────────────────────────────────────────────┤
│                 │                                                    │
│   FACTUAL       │  Same contentHash, different properties            │
│                 │  Example: rowCount = 50000 vs rowCount = 52347    │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   TEMPORAL      │  Overlapping valid_time windows for one entity     │
│                 │  Example: vt=[Jan-Mar] ∩ vt=[Feb-Apr] for the     │
│                 │  same fact                                         │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   STRUCTURAL    │  Conflicting edge directions or types              │
│                 │  Example: A-[DEPENDS_ON]->B and B-[DEPENDS_ON]->A │
│                 │  (circular dependency)                             │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   CONFIDENCE    │  Significant confidence divergence (> 0.3)         │
│                 │  for the same fact from different sources          │
│                 │  Example: conf=0.9 (LLM) vs conf=0.5 (regex)     │
│                 │                                                    │
└─────────────────┴────────────────────────────────────────────────────┘
```

### Detection Mechanisms

```javascript
class ContradictionDetector {
  /**
   * Detect factual contradictions via contentHash collision
   * Same entity fingerprint but different property values
   */
  async detectFactual(newNode) {
    const existing = await memgraphService.runQuery(`
      MATCH (n {contentHash: $hash})
      WHERE n.id <> $newId
      RETURN n
    `, { hash: newNode.contentHash, newId: newNode.id });

    for (const node of existing) {
      const diffs = this._diffProperties(node, newNode);
      if (diffs.length > 0) {
        return { type: 'FACTUAL', existing: node, incoming: newNode, diffs };
      }
    }
    return null;
  }

  /**
   * Detect temporal contradictions via overlapping validity windows
   */
  async detectTemporal(newNode) {
    const overlaps = await memgraphService.runQuery(`
      MATCH (n {entityId: $entityId})
      WHERE n.id <> $newId
        AND n.vt_start <= $vtEnd
        AND (n.vt_end IS NULL OR n.vt_end >= $vtStart)
      RETURN n
    `, {
      entityId: newNode.entityId,
      newId:    newNode.id,
      vtStart:  newNode.vt_start,
      vtEnd:    newNode.vt_end || '9999-12-31'
    });

    return overlaps.length > 0
      ? { type: 'TEMPORAL', existing: overlaps, incoming: newNode }
      : null;
  }

  /**
   * Detect structural contradictions (conflicting edge directions)
   */
  async detectStructural(newEdge) {
    const reverse = await memgraphService.runQuery(`
      MATCH (a)-[r:${newEdge.type}]->(b)
      WHERE a.id = $target AND b.id = $source
      RETURN r
    `, { source: newEdge.source, target: newEdge.target });

    return reverse.length > 0
      ? { type: 'STRUCTURAL', existing: reverse[0], incoming: newEdge }
      : null;
  }

  /**
   * Detect confidence contradictions (divergence > 0.3)
   */
  async detectConfidence(newNode) {
    const similar = await memgraphService.runQuery(`
      MATCH (n {entityId: $entityId, status: 'ACTIVE'})
      WHERE n.id <> $newId
        AND abs(n.confidence - $conf) > 0.3
      RETURN n
    `, {
      entityId: newNode.entityId,
      newId:    newNode.id,
      conf:     newNode.confidence
    });

    return similar.length > 0
      ? { type: 'CONFIDENCE', existing: similar, incoming: newNode }
      : null;
  }
}
```

### Resolution Strategies

| Strategy | Description | When applied |
|-----------|----------|-------------------|
| **SUPERSEDE** | New fact replaces the old one (old → `SUPERSEDED`) | New fact has higher `confidence` or a more recent `vt_start` |
| **MERGE** | Facts are merged into one with combined properties | Facts complement each other (different non-conflicting fields) |
| **COEXIST** | Both facts remain active with a flag | Different viewpoints, both justified (different `sourceType`) |
| **ESCALATE** | Decision passed to a higher level | Cannot be determined automatically, requires expert judgment |

### CONTRADICTS Edge Schema

```cypher
CREATE (existing)-[:CONTRADICTS {
  contradictionId:   $id,
  type:              'FACTUAL',           // FACTUAL | TEMPORAL | STRUCTURAL | CONFIDENCE
  detectedBy:        $detectorAgentId,
  detectedAt:        datetime(),
  severity:          'HIGH',              // LOW | MEDIUM | HIGH | CRITICAL
  resolution:        'PENDING',           // PENDING | SUPERSEDE | MERGE | COEXIST | ESCALATED
  resolvedBy:        null,                // agentId or 'human'
  resolvedAt:        null,
  resolutionReason:  null,
  affectedProperties: ['rowCount'],       // Which properties conflict
  confidenceDelta:   0.45                 // Difference in confidence scores
}]->(incoming)
```

### Contradiction Lifecycle

```
  ┌─────────┐     Detection        ┌─────────────┐
  │ New     │─────────────────────►│             │
  │ fact    │                      │  DETECTED   │
  │         │                      │             │
  └─────────┘                      └──────┬──────┘
                                          │
                                   Classification
                                   (type, severity)
                                          │
                                   ┌──────▼──────┐
                                   │             │
                                   │  CLASSIFIED │
                                   │             │
                                   └──────┬──────┘
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                   confidence         severity        structural
                   delta < 0.3       = LOW             match
                          │               │               │
                   auto-resolve      auto-resolve     ┌───▼────┐
                          │               │           │        │
                   ┌──────▼──────┐ ┌──────▼──────┐   │ VOTING │
                   │  SUPERSEDE  │ │   COEXIST   │   │ SESSION│
                   └──────┬──────┘ └──────┬──────┘   └───┬────┘
                          │               │               │
                          └───────────────┼───────────────┘
                                          │
                                   ┌──────▼──────┐
                                   │             │
                                   │  RESOLVED   │
                                   │             │
                                   │ → ADR node  │
                                   │   created   │
                                   └─────────────┘
```

---

## 8.5 Self-Documentation: The Graph Documents Itself

### Self-Documentation Principle

The UN ProjectAdvisor knowledge graph is a **self-documenting system**. Every significant decision made by the system or its agents is automatically recorded as an ADR (Architecture Decision Record) node in the `META` namespace.

Significant decisions include:

- Graph schema changes (adding a new node or edge type)
- Pattern promotion in PatternLibrary (auto-promotion)
- Contradiction resolution (SUPERSEDE, MERGE, COEXIST)
- Agent autonomy level upgrade
- New namespace creation
- Data migration between versions

### ADR (Architecture Decision Record)

```cypher
CREATE (adr:ADR:NodeVersion {
  adrId:          'ADR-2026-0342',
  namespace:      'META',
  title:          'Automatic promotion of StoredProcedure pattern',
  status:         'ACCEPTED',        // PROPOSED | ACCEPTED | DEPRECATED | SUPERSEDED
  context:        'The StoredProcedure pattern was observed 7 times with confidence ≥ 0.85. ' +
                  'The auto-promotion threshold (5 observations) has been exceeded.',
  decision:       'Pattern promoted from learningBuffer into the main catalog ' +
                  'of Extraction PatternLibrary.',
  consequences:   'Future extractions from SQL code will automatically ' +
                  'recognize stored procedures without explicit pattern specification.',
  createdBy:      'agent-optimizer-pattern-001',
  createdAt:      datetime(),
  decisionType:   'PATTERN_PROMOTION',  // SCHEMA_CHANGE | PATTERN_PROMOTION |
                                        // CONTRADICTION_RESOLUTION | AUTONOMY_UPGRADE |
                                        // NAMESPACE_CREATION | DATA_MIGRATION
  confidence:     0.92,
  votingSessionId: null,                // null if auto-decided
  contentHash:    'sha256:...'
})
```

### ADR Relations to Affected Nodes

```
┌──────────┐   MOTIVATED_BY    ┌──────────────────┐
│  ADR     │──────────────────►│ Affected node     │
│  node    │                   │ (Pattern,         │
│          │                   │  Schema,          │
│          │   MOTIVATED_BY    │  Namespace,       │
│          │──────────────────►│  Agent)           │
│          │                   └──────────────────┘
│          │
│          │   SUPERSEDES      ┌──────────────────┐
│          │──────────────────►│ Previous ADR      │
│          │                   │ (if replacement)  │
│          │                   └──────────────────┘
└──────────┘
```

```cypher
// Link ADR to affected pattern
MATCH (adr:ADR {adrId: 'ADR-2026-0342'})
MATCH (pattern:Pattern {name: 'StoredProcedure', domain: 'SQL'})
CREATE (adr)-[:MOTIVATED_BY {
  reason:    'Pattern auto-promoted after 7 observations',
  impact:    'ENRICHMENT',    // ENRICHMENT | DEPRECATION | MIGRATION | RESTRICTION
  createdAt: datetime()
}]->(pattern)

// Link ADR to the agent that made the decision
MATCH (adr:ADR {adrId: 'ADR-2026-0342'})
MATCH (agent:Agent {agentId: 'agent-optimizer-pattern-001'})
CREATE (adr)-[:DECIDED_BY {
  mechanism: 'AUTO',          // AUTO | MAJORITY | WEIGHTED | UNANIMOUS | HUMAN
  createdAt: datetime()
}]->(agent)
```

### ADR Auto-Generation

```javascript
class ADRGenerator {
  /**
   * Auto-create ADR when a significant system decision occurs
   * @param {string} decisionType - Type of decision
   * @param {Object} context - Decision context
   * @param {string} agentId - Agent that made the decision
   */
  async createADR(decisionType, context, agentId) {
    const adrId = `ADR-${new Date().getFullYear()}-${String(this._counter++).padStart(4, '0')}`;

    const adr = {
      adrId,
      namespace:    'META',
      title:        this._generateTitle(decisionType, context),
      status:       'ACCEPTED',
      context:      this._generateContext(decisionType, context),
      decision:     this._generateDecision(decisionType, context),
      consequences: this._generateConsequences(decisionType, context),
      createdBy:    agentId,
      createdAt:    new Date().toISOString(),
      decisionType,
      confidence:   context.confidence || 0.8,
      contentHash:  this._computeHash(decisionType, context)
    };

    // Persist ADR node in META namespace
    await memgraphService.runQuery(`
      CREATE (adr:ADR:NodeVersion $props)
      RETURN adr
    `, { props: adr });

    // Link to affected nodes
    for (const nodeId of (context.affectedNodeIds || [])) {
      await memgraphService.runQuery(`
        MATCH (adr:ADR {adrId: $adrId})
        MATCH (n {id: $nodeId})
        CREATE (adr)-[:MOTIVATED_BY {
          reason: $reason,
          impact: $impact,
          createdAt: datetime()
        }]->(n)
      `, { adrId, nodeId, reason: context.reason, impact: context.impact });
    }

    return adr;
  }
}
```

### Automatic Changelog Generation from SUPERSEDES Chains

The system automatically generates a changelog for any entity by traversing the `SUPERSEDES` chain:

```cypher
// Get the full changelog for an entity
MATCH path = (current:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
              -[:SUPERSEDES*]->(ancestor:NodeVersion)
WITH nodes(path) AS versions
UNWIND versions AS v
RETURN v.versionId, v.sequenceNumber, v.status,
       v.createdAt, v.createdBy, v.changeReason
ORDER BY v.sequenceNumber DESC
```

**Automatic changelog format:**

```
CHANGELOG for entityId: BR-001 (Budget Validation Rule)
═══════════════════════════════════════════════════════════

v3 [ACTIVE]    2026-03-12  agent-enricher-002
   Added: link to namespace FINANCE
   ADR: ADR-2026-0341

v2 [SUPERSEDED] 2026-03-10  agent-extractor-sql-001
   Changed: confidence 0.7 → 0.9 (confirmed from SQL constraint)
   ADR: ADR-2026-0298

v1 [SUPERSEDED] 2026-03-08  agent-extractor-doc-003
   Created: extracted from document "Budget Policy 2026.docx"
   ADR: null (initial creation)
```

### The Graph as a Self-Documenting System

```
┌────────────────────────────────────────────────────────────────────┐
│                    SELF-DOCUMENTING GRAPH                          │
│                                                                    │
│   Data                     Decisions                History        │
│   ──────                   ───────                  ───────       │
│   (:Table)                 (:ADR)                   SUPERSEDES    │
│   (:Column)                  │                      chain         │
│   (:Procedure)               │                         │          │
│        │                MOTIVATED_BY                   │          │
│        │                     │                         │          │
│        └─────────────────────┘                         │          │
│                                                        │          │
│   Patterns                 Agents                      │          │
│   ────────                 ──────                      │          │
│   (:Pattern)               (:Agent)                    │          │
│        │                     │                         │          │
│        │              DECIDED_BY                       │          │
│        └─────────────────────┘                         │          │
│                                                        │          │
│   Contradictions           Versions                    │          │
│   ──────────────           ──────                      │          │
│   CONTRADICTS edges        (:NodeVersion)──────────────┘          │
│                                                                    │
│   Every graph element REFERENCES the decision                     │
│   that led to its creation.                                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8.6 Autonomy Levels (0-4)

### Level Definitions

The system defines five autonomy levels through which an agent (or group of agents) progresses as trust accumulates.

```
Level 0       Level 1        Level 2       Level 3        Level 4
MANUAL        SUPERVISED     GUIDED        AUTONOMOUS     SELF-EVOLVING
  │               │              │              │              │
  │  Agent        │  Agent       │  Agent       │  Agent       │  Agent
  │  proposes,    │  performs    │  handles     │  handles all │  may modify
  │  human        │  routine,    │  most ops,   │  operations  │  its own
  │  approves     │  human       │  human       │  autonomously│  rules
  │  EVERYTHING   │  approves    │  reviews     │  human       │  (unanimous
  │               │  critical    │  weekly      │  intervenes  │  consensus)
  │               │              │  digest      │  on anomalies│
  ▼               ▼              ▼              ▼              ▼
trustScore    trustScore     trustScore    trustScore     trustScore
  N/A           ≥ 0.80         ≥ 0.90        ≥ 0.95         ≥ 0.98
```

### Current System Status

> **The UN ProjectAdvisor system operates at Level 1 (Supervised).**
>
> Agents perform routine operations (extraction, validation, enrichment)
> autonomously. Critical operations (deletion, merging, namespace changes)
> require human approval.

### Authority Matrix

```
┌─────────────────────────┬────────┬────────┬────────┬────────┬────────┐
│ Operation               │ Lv 0   │ Lv 1   │ Lv 2   │ Lv 3   │ Lv 4   │
│                         │ Manual │ Super. │ Guided │ Auto.  │ S-Evol │
├─────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ Create node             │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Create edge             │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Update confidence       │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Entity resolution       │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │
│ Promote pattern         │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │
│ Resolve contradiction   │ HUMAN  │ HUMAN  │ REVIEW │ AUTO   │ AUTO   │
│ Create namespace        │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │
│ Change namespace        │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ MERGE entities          │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ DELETE (Tombstone)      │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ Schema migration        │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ Change agent rules      │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ UNAN*  │
│ Upgrade autonomy level  │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ UNAN*  │
├─────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ HUMAN  = requires human approval                                      │
│ AUTO   = agent executes autonomously                                  │
│ REVIEW = agent executes, human reviews in digest                      │
│ AUTO*  = autonomously, but with unanimous agent consensus             │
│ UNAN*  = only via unanimous consensus + Orchestrator trustScore       │
│          ≥ 0.98                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Level Upgrade Criteria

Transition to each next autonomy level requires meeting metric thresholds for a **minimum of 30 days**.

| Criterion | Lv 0→1 | Lv 1→2 | Lv 2→3 | Lv 3→4 |
|----------|--------|--------|--------|--------|
| **trustScore** | ≥ 0.80 | ≥ 0.90 | ≥ 0.95 | ≥ 0.98 |
| **successRate** (Runtime) | ≥ 70% | ≥ 85% | ≥ 95% | ≥ 99% |
| **Completeness** (CODEX-VALID) | ≥ 90% | ≥ 95% | ≥ 98% | ≥ 99.5% |
| **Provenance coverage** | ≥ 85% | ≥ 92% | ≥ 97% | ≥ 99% |
| **Confidence calibration** | ≥ 0.6 | ≥ 0.75 | ≥ 0.85 | ≥ 0.95 |
| **QUALITY_ISSUE rate** (per 1000 ops) | < 50 | < 20 | < 5 | < 1 |
| **Contradiction resolution accuracy** | N/A | ≥ 80% | ≥ 90% | ≥ 97% |
| **Minimum operations** | 100 | 1,000 | 10,000 | 100,000 |
| **Minimum time at level** | - | 30 days | 90 days | 180 days |

### Level Upgrade Protocol

```javascript
async function evaluateAutonomyUpgrade(agentId) {
  const agent = await getAgent(agentId);
  const currentLevel = agent.autonomyLevel;
  const targetLevel = currentLevel + 1;

  if (targetLevel > 4) return { eligible: false, reason: 'Maximum level reached' };

  const criteria = GRADUATION_CRITERIA[targetLevel];
  const metrics = await collectAgentMetrics(agentId, { days: criteria.minDaysOnLevel });

  const evaluation = {
    trustScore:     metrics.trustScore >= criteria.trustScore,
    successRate:    metrics.successRate >= criteria.successRate,
    completeness:   metrics.completeness >= criteria.completeness,
    provenance:     metrics.provenanceCoverage >= criteria.provenanceCoverage,
    calibration:    metrics.confidenceCalibration >= criteria.calibration,
    qualityIssues:  metrics.qualityIssuePer1000 < criteria.maxQualityIssues,
    totalOps:       metrics.totalOperations >= criteria.minOperations,
    daysOnLevel:    metrics.daysOnCurrentLevel >= criteria.minDaysOnLevel
  };

  const allPassed = Object.values(evaluation).every(Boolean);

  if (allPassed) {
    // Level 0→1, 1→2, 2→3: requires HUMAN approval
    // Level 3→4: requires UNANIMOUS consensus + HUMAN approval
    if (targetLevel <= 3) {
      await createApprovalRequest(agentId, targetLevel, evaluation);
    } else {
      await initiateUnanimousVote('AUTONOMY_UPGRADE', { agentId, targetLevel, evaluation });
    }

    // Always create ADR
    await adrGenerator.createADR('AUTONOMY_UPGRADE', {
      agentId,
      from: currentLevel,
      to: targetLevel,
      metrics,
      evaluation,
      affectedNodeIds: [agent.id]
    }, 'system-autonomy-evaluator');
  }

  return { eligible: allPassed, evaluation, metrics };
}
```

### Level Demotion

Autonomy level demotion occurs automatically when thresholds are violated:

| Trigger | Action |
|---------|----------|
| `trustScore` dropped below the current level threshold | Demote by 1 level |
| `QUALITY_ISSUE` rate exceeded threshold by 3x | Demote by 1 level |
| Critical contradiction created by the agent | Demote by 1 level + review |
| Provenance falsification detected | Demote to Level 0 + investigation |

---

## Future Directions

### GNN Integration for Predictive Quality Scoring

The GNN service (port 5000) already supports link prediction and node classification. In the future, these capabilities will be integrated into APES:

- **Predictive contradiction detection** — GNN predicts conflicting edges before they are created, based on structural graph patterns
- **trustScore recommendation** — GNN analyzes agent history and predicts the optimal trustScore based on embedding similarity with successful agents
- **Graph optimization** — GNN suggests structural improvements (missing edges, redundant nodes) based on a trained graph structure model

### Federated Learning Across Duty Stations

26 UN duty stations generate knowledge in parallel. Federated learning will allow:

- Each station trains a local model on its own data
- Gradients (not data) are aggregated by a central coordinator
- The global model is distributed back to the stations
- Data privacy is preserved (data never leaves the station)

### Multimodal Knowledge

Unification of knowledge from different modalities in a single graph:

- **Text** → NLP extraction → nodes and edges with provenance `sourceType: 'document'`
- **Code** → AST analysis → nodes and edges with provenance `sourceType: 'code'`
- **Diagrams** → Computer Vision → nodes and edges with provenance `sourceType: 'diagram'`
- All three modalities are linked via `SAME_AS` edges with a confidence score

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Part IX: CODEX-DOMAINS — Information Type Standards

---

## 9.1 Two-Level Architecture

UN ProjectAdvisor stores two fundamentally different classes of information:

```
┌─────────────────────────────────────────────────────────────┐
│                    UN ProjectAdvisor                         │
│                    Knowledge Base                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           LEVEL 1: SYSTEM META                      │    │
│  │           Namespace: CORE, META                     │    │
│  │                                                     │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │ Architecture │ │ Requirements │ │  Decisions  │ │    │
│  │  │ CoreComponent│ │ BusinessReq  │ │    ADR      │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │   Metrics    │ │    Config    │ │  Research   │ │    │
│  │  │ PromptMetric │ │   AINFRA     │ │   Theory    │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            │ ANALYZES / DOCUMENTS            │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           LEVEL 2: TARGET PROJECT                   │    │
│  │           Namespace: PROJECT, GXE                   │    │
│  │                                                     │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │   Schema     │ │     Code     │ │    Rules    │ │    │
│  │  │ DatabaseTable│ │   Function   │ │BusinessRule │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │  Executable  │ │  Execution   │ │ Information │ │    │
│  │  │   Graphs     │ │   Records    │ │   Graphs    │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Level 1: System Meta** — information ABOUT THE UN PA SYSTEM ITSELF:
architecture, requirements, decisions, configuration, metrics, theoretical basis.

**Level 2: Target Project** — information about THE ANALYZED PROJECT:
extracted schemas, code, business rules, executable graphs, analysis results.

---

## 9.2 Canonical Namespaces

Exactly 4 namespaces are used in the system:

| Namespace | Level | Purpose |
|-----------|---------|-----------|
| `CORE` | System Meta | System infrastructure, catalog, tracking, architecture |
| `META` | System Meta | Configuration, metrics, requirements, decisions |
| `PROJECT` | Target Project | Extracted data of the target project |
| `GXE` | Target Project | Executable graphs and audit |

Any other namespace is rejected or normalized automatically
(see `memgraph.service.js` — `mergeNode()` namespace normalization).

---

## 9.3 Information Types Registry

### Level 1: System Meta

#### 9.3.1 SystemArchitecture

| Attribute | Value |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `CoreComponent`, `TechnicalComponent`, `SystemComponent` |
| **Required fields** | `name`, `type`, `domain` |
| **Edges** | `DEPENDS_ON`, `CONTAINS`, `IMPLEMENTS`, `USES`, `TRIGGERS` |
| **Auto-created** | No (seed scripts, manual) |
| **Source** | `seed-core-components.js`, manual |

---

#### 9.3.2 SystemRequirements

| Attribute | Value |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `BusinessRequirement`, `RequirementCategory`, `Feature` |
| **Required fields** | `name`, `priority`, `status` |
| **Edges** | `BELONGS_TO_CATEGORY`, `DEPENDS_ON`, `IMPLEMENTED_BY` |
| **Auto-created** | No |
| **Source** | manual, backlog import |

---

#### 9.3.3 SystemDecisions

| Attribute | Value |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `ADR`, `Decision`, `Rationale` |
| **Required fields** | `title`, `status`, `context`, `decision` |
| **Edges** | `SUPERSEDES`, `RELATES_TO`, `MOTIVATED_BY` |
| **Auto-created** | Partially (SelfDocumentor) |
| **Source** | `SelfDocumentor`, manual |
| **Status values** | `PROPOSED`, `ACCEPTED`, `DEPRECATED`, `SUPERSEDED` |

> Note: As of 2026-03-12, ADR = 0 nodes. Type declared, not yet populated.

---

#### 9.3.4 SystemMetrics

| Attribute | Value |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `PromptMetric`, `ExecutionMetric`, `PromptVersion` |
| **Required fields** | `id`, `createdAt` |
| **Edges** | `MEASURED_FOR`, `VERSION_OF` |
| **Auto-created** | Yes |
| **Source** | `ainfra.service.js`, `RuntimeEngine` |

---

#### 9.3.5 SystemConfig

| Attribute | Value |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `AINFRA`, `AIConfigSet`, `AIProviderConfig`, `Settings`, `Domain`, `Notification` |
| **Required fields** | `name` |
| **Edges** | `HAS_CONFIG`, `ACTIVE_CONFIG`, `USES_PROVIDER` |
| **Auto-created** | Yes |
| **Source** | `ainfra.service.js` |
| **Constraint** | Exactly 1 `ACTIVE_CONFIG` edge from `AINFRA` root |

---

#### 9.3.6 ResearchKnowledge

| Attribute | Value |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `Theory`, `Methodology`, `BestPractice`, `ResearchPaper` |
| **Required fields** | `title`, `domain`, `sourceRef` |
| **Edges** | `BASED_ON`, `CONTRADICTS`, `EXTENDS` |
| **Auto-created** | No |
| **Source** | manual, research import |

> Note: As of 2026-03-12 = 0 nodes. Type declared, not yet populated.

---

### Level 2: Target Project

#### 9.3.7 ExtractedSchema

| Attribute | Value |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `DatabaseTable`, `TableProfile`, `StructuralEntity`, `StructuralAttribute`, `StoredProcedureKG`, `DataSourceConfig`, `DomainConfig` |
| **Required fields** | `name` or `tableName` |
| **Edges** | `HAS_ATTRIBUTE`, `PROFILED_TABLE`, `FK_*`, `SOFT_FK`, `M_N` |
| **Auto-created** | Yes |
| **Source** | `mssql.graph-generator.js`, `structural-domain.service.js`, `ingestion-graph.service.js` |

---

#### 9.3.8 ExtractedCode

| Attribute | Value |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `Function`, `Method`, `Class`, `Module`, `File`, `Interface` |
| **Required fields** | `name`, `filePath` |
| **Edges** | `CONTAINS`, `SAME_DIRECTORY`, `SIMILAR_TO`, `MODIFIES`, `MEMBER_OF` |
| **Auto-created** | Yes |
| **Source** | `entity-extractor.js` |

---

#### 9.3.9 ExtractedRules

| Attribute | Value |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `BusinessRule`, `SemanticRule`, `SemanticCalculation`, `DomainVocabulary` |
| **Secondary labels** | `SEMANTIC` (semantic domain marker) |
| **Required fields** | `name`, `confidence` |
| **Edges** | `IMPLEMENTS`, `GOVERNS`, `DERIVED_FROM` |
| **Auto-created** | Yes |
| **Source** | `semantic-domain.service.js`, `mssql.graph-generator.js` |

---

#### 9.3.10 ExtractedEntities

| Attribute | Value |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `Concept`, `System`, `Technology`, `Organization`, `Document`, `WorkItem`, `Knowledge`, `Database`, `Process` |
| **Required fields** | `name`, `type` |
| **Edges** | `RELATES_TO`, `SIMILAR_TO`, `CONTAINS` |
| **Auto-created** | Yes |
| **Source** | `entity-extractor.js`, project-knowledge MCP |

---

#### 9.3.11 ExecutableGraph

| Attribute | Value |
|---------|----------|
| **Namespace** | `GXE` |
| **Labels** | `SubGraph`, `SubGraphPort` |
| **Secondary labels** | `KnowledgeQuantum` (marker) |
| **Required fields** | `id`, `subgraphId` |
| **Edges** | `CONNECTS_INTERNAL`, `PORT_OF`, `BRIDGES_TO` |
| **Auto-created** | Yes |
| **Source** | `subgraph-extractor.js`, `graph-consolidator.js` |

---

#### 9.3.12 ExecutionRecord

| Attribute | Value |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `ExecutionRecord`, `ExecutionPattern`, `AOPEG_Execution`, `AOPEG_NodeExecution`, `AOPEG_ExecutionGraph`, `AOPEG_GraphNode`, `AOPEG_GraphEdge` |
| **Required fields** | `id`, `status`, `graphId` |
| **Edges** | `AOPEG_EXECUTES_GRAPH`, `AOPEG_EXECUTED_NODE`, `AOPEG_CONTAINS_NODE`, `AOPEG_CONTAINS_EDGE` |
| **Auto-created** | Yes |
| **Source** | `GxeManagerService`, `RuntimeEngine`, `graph.repository.js` |

> Note: `ExecutionRecord` = 0 as of 2026-03-12.
> `GxeManagerService` creates `ExecutionRecord`, `RuntimeEngine` creates `AOPEG_Execution`.
> Unification planned (CC-029).

---

#### 9.3.13 InformationGraph

| Attribute | Value |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `DomainGraph`, `BehavioralNode`, `BusinessEntity`, `LifecycleState`, `BusinessProcessGraph` |
| **Secondary labels** | `BehavioralProcess` (on DomainGraph) |
| **Required fields** | `id` |
| **Edges** | `CONTAINS_NODE`, `TRANSITIONS_TO`, `STARTS_WITH` |
| **Auto-created** | Yes |
| **Source** | `ingestion-graph.service.js` |

---

#### 9.3.14 CatalogInfra

| Attribute | Value |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `CatalogRoot`, `CatalogEntry`, `GraphDefinition`, `GraphVersion`, `NodeType`, `EdgeType` |
| **Required fields** | `entryId`/`graphId`/`versionId` (depends on label), `name` |
| **Edges** | `CONTAINS`, `HAS_VERSION`, `DEFINES`, `SUPERSEDES`, `DECOMPOSES`, `LOADED_BY` |
| **Auto-created** | Partially |
| **Source** | `graphCatalog.service.js`, `graph-loader.service.js`, `GraphTypeService.js` |

Hierarchy:
```
(:CatalogRoot)-[:CONTAINS]->(:CatalogEntry)-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(:GraphVersion)-[:SUPERSEDES]->(:GraphVersion)
```

---

#### 9.3.15 IngestionTracking

| Attribute | Value |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `KnowledgeGraph`, `IngestionSession`, `IngestionPhase`, `KnowledgeNode` |
| **Required fields** | `sessionId` (for Phase), `id` |
| **Edges** | `HAS_PHASE`, `PRODUCED_GRAPH`, `PROFILED_TABLE` |
| **Auto-created** | Yes |
| **Source** | `ingestion-graph.service.js` |

> `KnowledgeNode` — fallback label. Avoid in new code; use specific labels (DatabaseTable, StoredProcedureKG, etc.).

---

#### 9.3.16 GXEAudit

| Attribute | Value |
|---------|----------|
| **Namespace** | `GXE` |
| **Labels** | `TechnicalDebt`, `Gap`, `BusinessGoal`, `QuickWin`, `AuditReport`, `ConsolidationCheckpoint` |
| **Secondary labels** | `MetaNode` (on ConsolidationCheckpoint) |
| **Required fields** | `name` |
| **Edges** | `CONTAINS`, `TARGETS`, `BLOCKS`, `FIXED_BY` |
| **Auto-created** | Partially |
| **Source** | `graph-consolidator.js`, audit scripts |

---

#### 9.3.17 ReferenceData

| Attribute | Value |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `SupportGroup`, `Equipment`, `UNStaffProfile`, `Workspace`, `YNBusinessGraph`, `YNTestScenario`, `YNTestUser`, `YNRole`, `Artifact`, `Project` |
| **Required fields** | `name` or domain-specific ID |
| **Edges** | `REPORTS_TO`, `SUBMITTED_BY`, `EXPECTS_GRAPH`, `CAN_SPAWN`, `COMPATIBLE_WITH` |
| **Auto-created** | No (seed, import) |
| **Source** | seed scripts, FlowDesk import |

---

## 9.4 Routing Rules

The routing function determines the Information Type and canonical namespace by label:

```javascript
const LABEL_ROUTING = {
  // Level 1: System Meta
  CoreComponent:        { type: 'SystemArchitecture',  namespace: 'CORE' },
  TechnicalComponent:   { type: 'SystemArchitecture',  namespace: 'CORE' },
  SystemComponent:      { type: 'SystemArchitecture',  namespace: 'CORE' },
  BusinessRequirement:  { type: 'SystemRequirements',  namespace: 'META' },
  RequirementCategory:  { type: 'SystemRequirements',  namespace: 'META' },
  ADR:                  { type: 'SystemDecisions',     namespace: 'META' },
  Decision:             { type: 'SystemDecisions',     namespace: 'META' },
  PromptMetric:         { type: 'SystemMetrics',       namespace: 'META' },
  PromptVersion:        { type: 'SystemMetrics',       namespace: 'META' },
  AINFRA:               { type: 'SystemConfig',        namespace: 'META' },
  AIConfigSet:          { type: 'SystemConfig',        namespace: 'META' },
  AIProviderConfig:     { type: 'SystemConfig',        namespace: 'META' },
  Settings:             { type: 'SystemConfig',        namespace: 'META' },
  Domain:               { type: 'SystemConfig',        namespace: 'META' },
  Notification:         { type: 'SystemConfig',        namespace: 'META' },
  Theory:               { type: 'ResearchKnowledge',   namespace: 'CORE' },
  Methodology:          { type: 'ResearchKnowledge',   namespace: 'CORE' },

  // Level 2: Target Project
  DatabaseTable:        { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  TableProfile:         { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  StructuralEntity:     { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  StructuralAttribute:  { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  StoredProcedureKG:    { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  DataSourceConfig:     { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  DomainConfig:         { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  Function:             { type: 'ExtractedCode',       namespace: 'PROJECT' },
  Method:               { type: 'ExtractedCode',       namespace: 'PROJECT' },
  Class:                { type: 'ExtractedCode',       namespace: 'PROJECT' },
  Module:               { type: 'ExtractedCode',       namespace: 'PROJECT' },
  File:                 { type: 'ExtractedCode',       namespace: 'PROJECT' },
  BusinessRule:         { type: 'ExtractedRules',      namespace: 'PROJECT' },
  SemanticRule:         { type: 'ExtractedRules',      namespace: 'PROJECT' },
  SemanticCalculation:  { type: 'ExtractedRules',      namespace: 'PROJECT' },
  DomainVocabulary:     { type: 'ExtractedRules',      namespace: 'PROJECT' },
  Concept:              { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  System:               { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Technology:           { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Organization:         { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Document:             { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  WorkItem:             { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Knowledge:            { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Database:             { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Process:              { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  SubGraph:             { type: 'ExecutableGraph',     namespace: 'GXE' },
  SubGraphPort:         { type: 'ExecutableGraph',     namespace: 'GXE' },
  ExecutionRecord:      { type: 'ExecutionRecord',     namespace: 'META' },
  ExecutionPattern:     { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_Execution:      { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_NodeExecution:  { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_ExecutionGraph: { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_GraphNode:      { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_GraphEdge:      { type: 'ExecutionRecord',     namespace: 'META' },
  DomainGraph:          { type: 'InformationGraph',    namespace: 'PROJECT' },
  BehavioralNode:       { type: 'InformationGraph',    namespace: 'PROJECT' },
  BusinessEntity:       { type: 'InformationGraph',    namespace: 'PROJECT' },
  LifecycleState:       { type: 'InformationGraph',    namespace: 'PROJECT' },
  BusinessProcessGraph: { type: 'InformationGraph',    namespace: 'PROJECT' },
  CatalogRoot:          { type: 'CatalogInfra',        namespace: 'CORE' },
  CatalogEntry:         { type: 'CatalogInfra',        namespace: 'CORE' },
  GraphDefinition:      { type: 'CatalogInfra',        namespace: 'CORE' },
  GraphVersion:         { type: 'CatalogInfra',        namespace: 'CORE' },
  NodeType:             { type: 'CatalogInfra',        namespace: 'CORE' },
  EdgeType:             { type: 'CatalogInfra',        namespace: 'CORE' },
  KnowledgeGraph:       { type: 'IngestionTracking',   namespace: 'CORE' },
  IngestionSession:     { type: 'IngestionTracking',   namespace: 'CORE' },
  IngestionPhase:       { type: 'IngestionTracking',   namespace: 'CORE' },
  KnowledgeNode:        { type: 'IngestionTracking',   namespace: 'CORE' },
  TechnicalDebt:        { type: 'GXEAudit',            namespace: 'GXE' },
  Gap:                  { type: 'GXEAudit',            namespace: 'GXE' },
  BusinessGoal:         { type: 'GXEAudit',            namespace: 'GXE' },
  QuickWin:             { type: 'GXEAudit',            namespace: 'GXE' },
  AuditReport:          { type: 'GXEAudit',            namespace: 'GXE' },
  ConsolidationCheckpoint: { type: 'GXEAudit',         namespace: 'GXE' },
  SupportGroup:         { type: 'ReferenceData',       namespace: 'PROJECT' },
  Equipment:            { type: 'ReferenceData',       namespace: 'PROJECT' },
  UNStaffProfile:       { type: 'ReferenceData',       namespace: 'PROJECT' },
  Workspace:            { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNBusinessGraph:      { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNTestScenario:       { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNTestUser:           { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNRole:               { type: 'ReferenceData',       namespace: 'PROJECT' },
  Artifact:             { type: 'ReferenceData',       namespace: 'PROJECT' },
  Project:              { type: 'ReferenceData',       namespace: 'PROJECT' },
};

function resolveInformationType(label) {
  return LABEL_ROUTING[label] || { type: 'Unknown', namespace: 'PROJECT' };
}
```

---

## 9.5 Auto-documentation Protocol

When the system autonomously creates an executable graph, it MUST create
accompanying documentation:

1. **GraphDocumentation** — purpose, inputs/outputs, assumptions
2. **ADR** (if an architectural decision) — context, decision, consequences
3. **Relations** — `DOCUMENTS`, `IMPLEMENTS`, `MOTIVATED_BY`

```javascript
async documentGraphCreation(graphId, motivation, context) {
  // 1. Graph documentation
  await memgraph.mergeNode('GraphDocumentation', {
    id: `doc-${graphId}`,
    namespace: 'META',
    graphId,
    purpose: motivation.purpose,
    inputDescription: motivation.inputs,
    outputDescription: motivation.outputs,
    assumptions: motivation.assumptions,
    limitations: motivation.limitations,
    createdBy: context.agent || 'system',
    createdAt: new Date().toISOString()
  });

  // 2. ADR for architectural decisions
  if (context.isArchitecturalDecision) {
    await memgraph.mergeNode('ADR', {
      id: `adr-${generateUUID()}`,
      namespace: 'META',
      title: context.title,
      status: 'ACCEPTED',
      context: motivation.context,
      decision: motivation.decision,
      consequences: motivation.consequences,
      createdBy: context.agent || 'system',
      createdAt: new Date().toISOString()
    });
  }

  // 3. Relations
  await memgraph.createRelationship(`doc-${graphId}`, graphId, 'DOCUMENTS');
  if (context.sourceRequirementId) {
    await memgraph.createRelationship(graphId, context.sourceRequirementId, 'IMPLEMENTS');
  }
}
```

---

## 9.6 Statistics (as of 2026-03-12)

| Information Type | Nodes | % of total |
|------------------|-------|-------------|
| ExtractedSchema | 1,482 | 31.8% |
| ExecutableGraph | 1,395 | 29.9% |
| IngestionTracking | 485 | 10.4% |
| ExtractedRules | 362 | 7.8% |
| CatalogInfra | 266 | 5.7% |
| ExtractedCode | 177 | 3.8% |
| SystemArchitecture | 126 | 2.7% |
| ExtractedEntities | 109 | 2.3% |
| ReferenceData | 54 | 1.2% |
| GXEAudit | 47 | 1.0% |
| InformationGraph | 37 | 0.8% |
| SystemMetrics | 20 | 0.4% |
| SystemRequirements | 19 | 0.4% |
| ExecutionRecord | 15 | 0.3% |
| SystemConfig | 12 | 0.3% |
| SystemDecisions | 0 | 0% |
| ResearchKnowledge | 0 | 0% |

**Total:** 4,662 nodes, 18,330 edges, 4 namespaces.

---

## 9.7 Tool Namespace Architecture

### 9.7.1 Concept

Tools in the UN ProjectAdvisor system are separated by knowledge domain, analogously to graph nodes. Each Tool has a `toolNamespace` field that determines which knowledge domain it belongs to.

```
┌─────────────────────────────────────────────────────────────┐
│                      AI ASSISTANT                            │
│                                                              │
│   "I need tools for working with FlowDesk"                  │
│                          │                                   │
│                          ▼                                   │
│               MCP Tool Registry                              │
│          list_tools_by_namespace('PROJECT')                  │
│                          │                                   │
│          ┌───────────────┼───────────────┐                  │
│          ▼               ▼               ▼                  │
│    CODEX (11)       CORE (104)     PROJECT (30)             │
│    ───────────      ──────────     ────────────             │
│    • Validation     • Graph CRUD   • SQL Extract            │
│    • ADR access     • AI/LLM       • FlowDesk               │
│    • Compliance     • Catalog      • Entity Extract         │
│    • Standards      • Patterns     • Domain Rules           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.7.2 Tool Namespaces

| Namespace | Purpose | Example tools |
|-----------|------------|---------------|
| **CODEX** | Working with standards, validation, ADR | codex.search_rules, codex.check_compliance, meta.health_check |
| **CORE** | UN PA system infrastructure | graph.query, ai.generate, catalog.search_graphs, vector.search |
| **PROJECT** | Target project analysis (FlowDesk, iNeed) | sql.schema_scan, flowdesk.classify_intent, ingestion.parse_document |

### 9.7.3 Tool Sources

The system combines tools from two sources:

| Source | Description | Count |
|----------|----------|------------|
| **MCP Tools** | Model Context Protocol handlers in `api/src/mcp/tools/` | 93 |
| **AOPEG Executors** | Graph execution plugins in `api/src/core/aopeg/plugins/` | 52 |
| **Total** | | **145** |

### 9.7.4 Tools Graph in Memgraph

```
ToolCatalog (root)
    │
    ├── :HAS_CATEGORY → ToolCategory {id: 'meta'}
    │                        └── :HAS_TOOL → Tool {toolNamespace: 'CODEX'}
    │
    ├── :HAS_CATEGORY → ToolCategory {id: 'graph'}
    │                        └── :HAS_TOOL → Tool {toolNamespace: 'CORE'}
    │
    ├── :HAS_CATEGORY → ToolCategory {id: 'aopeg-flowdesk'}
    │                        └── :HAS_TOOL → Tool {toolNamespace: 'PROJECT'}
    │
    └── ... (19 categories total: 11 MCP + 8 AOPEG)
```

### 9.7.5 Tool Node Schema

```javascript
{
  // Identity
  id: 'tool.graph.query',             // Unique ID
  name: 'Query Graph',                // Human-readable name
  executorId: 'graph.query',          // ID for invocation

  // Classification
  toolNamespace: 'CORE',              // CODEX | CORE | PROJECT
  category: 'graph',                  // Category within namespace
  source: 'mcp',                      // mcp | aopeg | codex

  // Metadata
  description: 'Execute Cypher query on knowledge graph',
  tags: ['graph', 'query', 'cypher'],
  status: 'active',                   // active | deprecated | experimental

  // Schemas
  inputSchema: { ... },               // JSON Schema for input parameters
  outputSchema: { ... },              // JSON Schema for result

  // Timestamps
  createdAt: '2026-03-19T...',
  updatedAt: '2026-03-19T...'
}
```

### 9.7.6 MCP Discovery API

AI agents receive tools via MCP endpoints:

```javascript
// Get all tools for a specific namespace
await mcp.callTool('list_tools_by_namespace', {
  namespace: 'PROJECT'
});
// → { namespace: 'PROJECT', count: 30, tools: [...] }

// Get tools filtered by category
await mcp.callTool('list_tools_by_namespace', {
  namespace: 'CORE',
  category: 'graph',
  includeSchemas: true
});
// → { namespace: 'CORE', category: 'graph', count: 12, tools: [...] }

// Statistics for all tools
await mcp.callTool('get_tool_stats', {});
// → { total: 145, byNamespace: { CODEX: 11, CORE: 104, PROJECT: 30 }, ... }
```

### 9.7.7 Category → Namespace Mapping

**MCP Tools (93):**

| Category | Namespace | Count |
|----------|-----------|--------|
| meta (system + codex) | CODEX | 11 |
| workflow, graph, ai, analytics, vector, notification, catalog, visualization, editor | CORE | 72 |
| ingestion | PROJECT | 10 |

**AOPEG Executors (52):**

| Plugin | Namespace | Count |
|--------|-----------|--------|
| common, workflow, notification, subgraph, rag, ingestion | CORE | 32 |
| flowdesk, sql-extraction | PROJECT | 20 |

### 9.7.8 Adding New Tools

When creating a new Tool:

1. **Determine `toolNamespace`** by the rules:
   - Working with standards/validation → **CODEX**
   - System infrastructure → **CORE**
   - Target project analysis → **PROJECT**

2. **Add to seed script:**
   - MCP tools → `api/scripts/seed-tool-catalog.js`
   - AOPEG executors → `api/scripts/seed-aopeg-executors.js`

3. **Register** in ToolRegistry (for MCP tools)

4. **Create Tool node** in the graph with required fields:
   - `id`, `name`, `executorId`
   - `toolNamespace`, `category`, `source`
   - `description`, `status`

### 9.7.9 Cypher Queries to Tool Registry

```cypher
-- All tools by namespace
MATCH (t:Tool {toolNamespace: 'PROJECT'})
RETURN t.name, t.category, t.description;

-- Statistics by namespace and source
MATCH (t:Tool)
RETURN t.toolNamespace AS namespace, t.source AS source, count(t) AS count
ORDER BY namespace, source;

-- Tools of a specific AOPEG category
MATCH (cat:ToolCategory {id: 'aopeg-flowdesk'})-[:HAS_TOOL]->(t:Tool)
RETURN t.name, t.executorId;

-- Search by description
MATCH (t:Tool)
WHERE toLower(t.description) CONTAINS 'extract'
RETURN t.name, t.toolNamespace, t.description;
```

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

---

## Appendix A: Architecture Decision Records

### ADR Index

| ADR | Decision | Status |
|-----|---------|--------|
| ADR-001 | Memgraph as Knowledge Graph Store | ACCEPTED |
| ADR-002 | GXE AOPEG Execution Model | ACCEPTED |
| ADR-003 | Four-Namespace Architecture | ACCEPTED |
| ADR-004 | Bi-temporal Versioning with Hash Chain | ACCEPTED |
| ADR-005 | Polystore Architecture | ACCEPTED |
| ADR-006 | Information Types Classification | ACCEPTED |

### ADR-001: Memgraph as Knowledge Graph Store

**Status:** ACCEPTED
**Date:** 2025-01-15
**Author:** Architecture Team

## Context

UN ProjectAdvisor needs a database to store extracted knowledge from legacy systems (IMIS, iNeed/FlowDesc, TFS/TFVC). The knowledge has complex relationships:
- Tables reference other tables (foreign keys)
- Methods call other methods
- Business rules depend on multiple entities
- Workflows have sequential and parallel branches

A traditional relational database would require many JOIN operations and struggle with variable-depth traversals. A document store would lose relationship semantics.

## Decision

We will use **Memgraph** as the primary knowledge graph store.

Memgraph is chosen over alternatives because:
1. **Cypher query language** — industry standard, readable, powerful for graph traversal
2. **In-memory performance** — sub-millisecond queries for connected data
3. **MAGE library** — built-in graph algorithms (PageRank, community detection, pathfinding)
4. **Bolt protocol** — compatible with Neo4j drivers and tooling
5. **Open source** — no vendor lock-in, self-hostable
6. **Streaming support** — Kafka/Pulsar integration for real-time updates

## Consequences

### Positive
- Complex relationship queries are natural and fast
- Graph algorithms available out-of-the-box
- Schema-flexible — can evolve with extraction pipeline
- Visual exploration possible (Memgraph Lab, NEXUS UI)

### Negative
- Single-node limitation — no native horizontal scaling
- Memory-bound — dataset must fit in RAM
- Less mature ecosystem than Neo4j
- Requires graph thinking — learning curve for SQL developers

### Neutral
- Need separate vector store for semantic search (Qdrant)
- Need separate cache layer for high-frequency reads (Redis)

## Alternatives Considered

### Alternative 1: Neo4j
- Industry leader, largest community
- **Rejected:** License cost for enterprise features, heavier resource footprint

### Alternative 2: Amazon Neptune
- Managed service, scales automatically
- **Rejected:** Cloud lock-in, higher latency, no MAGE equivalent

### Alternative 3: PostgreSQL with Apache AGE
- Familiar SQL + graph extension
- **Rejected:** Less mature graph features, complex setup

### Alternative 4: Pure Document Store (MongoDB)
- Flexible schema, good at hierarchical data
- **Rejected:** Loses relationship semantics, requires application-level joins

## Related ADRs

- ADR-005: Polystore Architecture (Memgraph + Qdrant + Redis)
- ADR-003: Four-Namespace Architecture

## Implementation Status

- [x] Memgraph deployed (Docker)
- [x] memgraph.service.js implemented
- [x] Schema Registry validation
- [x] 4,662 nodes migrated
- [x] Health check endpoint

---

### ADR-002: GXE AOPEG Execution Model

**Status:** ACCEPTED
**Date:** 2025-02-01
**Author:** Architecture Team

## Context

UN ProjectAdvisor needs to execute business logic graphs extracted from legacy systems. These graphs represent:
- Approval workflows
- Data transformation pipelines
- Decision trees
- Multi-step integrations

We need an execution engine that can:
1. Execute graphs with complex topologies (DAG, with potential cycles for retries)
2. Handle async operations (LLM calls, external APIs)
3. Support partial execution and resumption
4. Track execution history for debugging and optimization

## Decision

We will implement **GXE (Graph Execution Engine)** using the **AOPEG (Asynchronous Observable Parallel Execution Graph)** model.

Key principles:
1. **Asynchronous** — all node executions are async/await
2. **Observable** — execution state is observable via events/SSE
3. **Parallel** — independent nodes execute concurrently
4. **Execution** — nodes transform input to output
5. **Graph** — topology defines execution order

Execution flow:
```
Parse DAG -> Validate -> Build Execution Plan -> Execute Nodes -> Collect Results
                |              |                    |
           Schema Check   Topological Sort    Parallel where possible
```

## Consequences

### Positive
- Natural representation of business workflows
- Parallelism improves throughput
- Observable state enables real-time UI updates
- Graphs are reusable and composable

### Negative
- Complex debugging for parallel failures
- State management overhead
- Learning curve for graph-based thinking

### Neutral
- Requires catalog system for graph storage
- Execution records needed for history

## Alternatives Considered

### Alternative 1: Sequential Pipeline
- Simple linear execution
- **Rejected:** Cannot represent parallel branches, inefficient

### Alternative 2: State Machine (XState)
- Proven library, good for workflows
- **Rejected:** Less natural for data transformation, harder to parallelize

### Alternative 3: Temporal.io
- Production-grade workflow engine
- **Rejected:** External dependency, overkill for current scale

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-005: Polystore Architecture (execution records in META)

## Implementation Status

- [x] RuntimeEngine implemented
- [x] AOPEG node types defined
- [x] ExecutionRecorder integrated (CC-029)
- [x] Catalog auto-save (CC-020)
- [ ] Pattern Library promotion
- [ ] Visual graph editor in NEXUS

---

### ADR-003: Four-Namespace Architecture

**Status:** ACCEPTED
**Date:** 2025-02-15
**Author:** Architecture Team

## Context

UN ProjectAdvisor stores different types of information:
- System architecture documentation
- Extracted knowledge from target projects
- Execution infrastructure and metrics
- Executable graphs

Without clear separation, we risk:
- Cross-project data leakage
- Confusion between system docs and extracted data
- Difficulty querying specific domains
- No clear ownership/permissions model

## Decision

We will organize all graph nodes into **four namespaces**:

| Namespace | Purpose | Access |
|-----------|---------|--------|
| **CORE** | System infrastructure, catalog, tracking | Read: all, Write: system |
| **PROJECT** | Extracted knowledge from target systems | Read: project members, Write: extractors |
| **META** | Execution records, metrics, configs, ADRs | Read: all, Write: system |
| **GXE** | Executable graphs, ports, subgraphs | Read: all, Write: GXE engine |

Every node MUST have a `namespace` property. Namespace is validated on write.

## Consequences

### Positive
- Clear separation of concerns
- Easy to query specific domains (`WHERE n.namespace = 'PROJECT'`)
- Foundation for access control
- Prevents accidental cross-contamination

### Negative
- Additional field on every node
- Must maintain routing logic
- Cross-namespace queries need explicit handling

### Neutral
- Migration required for legacy nodes (completed in FIX-KB-003)

## Alternatives Considered

### Alternative 1: Separate Databases
- Physical isolation per domain
- **Rejected:** Cannot easily cross-reference, operational overhead

### Alternative 2: Label-based Separation
- Use labels like `:Core:Table` vs `:Project:Table`
- **Rejected:** Inconsistent, hard to query, label explosion

### Alternative 3: No Separation
- All nodes in single space
- **Rejected:** Data leakage risk, query complexity

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-006: Information Types Classification

## Implementation Status

- [x] Namespace field required on all nodes
- [x] Schema validation in mergeNode()
- [x] Routing rules in CODEX-DOMAINS
- [x] Migration completed (FIX-KB-002, FIX-KB-003, FIX-KB-004)
- [x] 0 nodes without namespace

---

### ADR-004: Bi-temporal Versioning with Hash Chain

**Status:** ACCEPTED
**Date:** 2025-02-20
**Author:** Architecture Team

## Context

Knowledge extracted from legacy systems changes over time:
- A business rule is updated in the source system
- An extraction algorithm improves and produces different results
- Human review corrects an error

We need to track both:
1. **When we learned** something (transaction time)
2. **When it was true** in reality (valid time)

Additionally, for audit and integrity, we need cryptographic proof that history wasn't tampered with.

## Decision

We will implement **bi-temporal versioning with hash chain** for critical entities (NodeVersion label).

### Bi-temporal Fields
- `ttStart` / `ttEnd` — Transaction Time (when recorded in system)
- `vtStart` / `vtEnd` — Valid Time (when true in reality)

### Hash Chain Fields
- `contentHash` — SHA-256 of canonicalized node properties
- `previousHash` — chainHash of previous version (or 'GENESIS')
- `chainHash` — SHA-256(previousHash + contentHash)

### Version Chain
```
v1 (SUPERSEDED) <-SUPERSEDES- v2 (SUPERSEDED) <-SUPERSEDES- v3 (ACTIVE)
```

## Consequences

### Positive
- Full audit trail of all changes
- Can answer "what did we know at time T?"
- Can answer "what was true at time T?"
- Tamper-evident history (hash chain)
- Supports compliance requirements

### Negative
- Storage overhead (multiple versions per entity)
- Query complexity for temporal queries
- Hash computation overhead on write

### Neutral
- Not all nodes need versioning (see ADR-006 for which types)
- Tombstones for soft delete (90-day restore window)

## Alternatives Considered

### Alternative 1: Simple Versioning (no temporal)
- Just version numbers, no time tracking
- **Rejected:** Cannot answer temporal queries

### Alternative 2: Event Sourcing
- Store all events, compute state
- **Rejected:** Overkill, complex to query current state

### Alternative 3: Mutable with Audit Log
- Update in place, separate audit log
- **Rejected:** Audit log can diverge, harder to query history

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-006: Information Types Classification

## Implementation Status

- [x] NodeVersion schema defined
- [x] version-manager.js implemented (CC-019)
- [x] SUPERSEDES chain creation
- [x] Bridge pattern for domain<->version links
- [x] Tombstone soft delete (CC-021)
- [x] God Mode for immutability override

---

### ADR-005: Polystore Architecture

**Status:** ACCEPTED
**Date:** 2025-02-25
**Author:** Architecture Team

## Context

Different data access patterns require different storage technologies:
- **Graph traversal** — finding connected entities
- **Semantic search** — finding similar content by meaning
- **Caching** — fast access to frequently read data
- **Job queues** — reliable async task processing

No single database excels at all patterns.

## Decision

We will implement a **polystore architecture** with three primary stores:

| Store | Technology | Purpose |
|-------|------------|---------|
| **Graph** | Memgraph | Nodes, edges, relationships, queries |
| **Vector** | Qdrant | Embeddings, semantic search, similarity |
| **Cache/Queue** | Redis | Caching, pub/sub, job queues (BullMQ) |

### Write Order
```
Memgraph (primary) -> Qdrant (secondary) -> Redis (cache)
```

### Consistency Model
- Memgraph is source of truth
- Qdrant mirrors node embeddings
- Redis is ephemeral cache (can be rebuilt)

### Saga Pattern for Writes
Compensating transactions if any step fails (LIFO rollback).

## Consequences

### Positive
- Best tool for each job
- Semantic search without graph overhead
- Fast caching layer
- Reliable job processing

### Negative
- Operational complexity (3 systems)
- Consistency challenges (eventual consistency)
- Orphaned data risk (Qdrant without Memgraph)

### Neutral
- Need OrphanDetector cron (implemented CC-017)
- Need health checks across all stores

## Alternatives Considered

### Alternative 1: Memgraph Only
- Add vector search via MAGE/custom
- **Rejected:** Not optimized for high-dim vectors

### Alternative 2: Single Document Store
- MongoDB with vector search
- **Rejected:** Loses graph semantics

### Alternative 3: Cloud-native (AWS)
- Neptune + OpenSearch + ElastiCache
- **Rejected:** Cloud lock-in, cost

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-003: Four-Namespace Architecture

## Implementation Status

- [x] Memgraph service
- [x] Qdrant service with collections
- [x] Redis service with BullMQ
- [x] Polystore Saga (CC-018)
- [x] OrphanDetector cron (CC-017)
- [x] Health endpoints (CC-031)

---

### ADR-006: Information Types Classification

**Status:** ACCEPTED
**Date:** 2025-03-12
**Author:** Architecture Team

## Context

After auditing the knowledge base (AUDIT-KB-001, AUDIT-KB-002), we found:
- 76 different label combinations
- No clear classification system
- Mixed concerns (system docs vs extracted data)
- Inconsistent metadata requirements

We need a systematic way to categorize all information in the system.

## Decision

We will classify all information into **17 Information Types** across two levels:

### Level 1: System Meta (about UN ProjectAdvisor itself)
1. SystemArchitecture — components, dependencies
2. SystemRequirements — features, backlog
3. SystemDecisions — ADRs, rationale
4. SystemMetrics — performance, usage
5. SystemConfig — AI config, settings
6. ResearchKnowledge — theories, methodologies

### Level 2: Target Project (about analyzed systems)
7. ExtractedSchema — tables, columns, procedures
8. ExtractedCode — functions, methods, classes
9. ExtractedRules — business rules, validations
10. ExtractedEntities — concepts, organizations
11. ExecutableGraph — GXE subgraphs, ports
12. ExecutionRecord — execution history
13. InformationGraph — domain graphs, behavioral
14. CatalogInfra — catalog entries, versions
15. IngestionTracking — sessions, phases
16. GXEAudit — tech debt, gaps, goals
17. ReferenceData — support groups, staff profiles

Each type has:
- Mandatory namespace
- Allowed labels
- Required fields
- Allowed edge types

## Consequences

### Positive
- Clear categorization for all nodes
- Routing rules can auto-assign namespace
- Validation can check type-specific requirements
- Documentation is type-aware

### Negative
- Must maintain type registry
- New labels need classification
- Migration for legacy labels

### Neutral
- Documented in CODEX-DOMAINS.md (Part IX)

## Alternatives Considered

### Alternative 1: No Classification
- Just labels and namespaces
- **Rejected:** Too unstructured, hard to maintain

### Alternative 2: Hierarchical Types
- Type -> Subtype -> Label
- **Rejected:** Over-engineering, three levels is enough

## Related ADRs

- ADR-003: Four-Namespace Architecture
- ADR-004: Bi-temporal Versioning

## Implementation Status

- [x] CODEX-DOMAINS.md written (CC-028)
- [x] LABEL_ROUTING map defined
- [x] All 76 labels classified
- [x] 0 unclassified labels
- [x] Routing rules in production

---

## Appendix B: Changelog

All significant changes to the Codex are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.1.0] — 2026-03-12

### Added

#### Part 0: AI Manifesto
- System philosophy and the role of AI agents
- Principles for working with contradictions
- Ethical boundaries of autonomy

#### Part I: CODEX-CRUD
- Standards for creating nodes and edges
- Fingerprint collision handling
- Polystore saga pattern (Memgraph → Qdrant → Redis)

#### Part II: CODEX-META
- Required metadata fields (3 levels)
- Knowledge Quantum schema (8 blocks)
- W3C PROV-O mapping
- Hash chain integrity
- Bi-temporal model (tt/vt)

#### Part III: CODEX-VERSION
- Two models: NodeVersion vs Domain nodes
- Bridge pattern for linking models
- SUPERSEDES chain management
- Merge/Split/Fork operations
- God Mode protocol
- Tombstones and soft delete

#### Part IV: CODEX-NS
- Four namespaces (CORE/PROJECT/META/COMMON)
- Routing rules and auto-detection
- Cross-namespace query patterns
- Isolation guarantees
- ExecutionRecord → META migration

#### Part V: CODEX-VALID
- JSON Schema registry (7 schemas)
- Validation modes (warn/strict/skip)
- Error codes (VAL001-VAL009)

#### Part VI: CODEX-CATALOG
- CatalogEntry/GraphVersion/GraphDefinition schema
- Auto-save policy
- 3-level deduplication (hash → Jaccard → GNN)
- Hybrid search (keyword + structural + GNN)
- Reuse strategies (DIRECT_REUSE, CLONE_MODIFY, ABSTRACT_INHERIT, CREATE_NEW)
- Pattern promotion lifecycle

#### Part VII: CODEX-POLY
- Canonical write order (Memgraph → Qdrant → Redis)
- Compensating transactions (saga)
- Consistency levels
- Checkpoint/Resume for pipelines
- Health checks and auto-repair

#### Part VIII: SELF-EVOLUTION (future)
- Agent cascade architecture (3-tier)
- Consensus voting mechanisms (Majority/Weighted/Unanimous)
- APES (Agent Performance Evolution System)
- Contradiction detection and resolution
- Self-documentation (ADR auto-generation)
- Autonomy levels 0-4

### Infrastructure
- Schema Registry (`api/src/validation/schema-registry.js`) — 7 JSON schemas
- Integration into `memgraph.service.js` (warn mode by default)
- 34/34 unit tests passing
- Error codes: VAL001-VAL009, CRUD001-CRUD009, CATALOG001-CATALOG006

## [0.1.1] — 2026-03-12

### Added

#### Part IX: CODEX-DOMAINS
- 17 Information Types (two-level architecture: System Meta + Target Project)
- Label routing rules (76 labels → 17 types → 4 namespaces)
- Auto-documentation protocol for autonomously created graphs
- Statistics: 4,662 nodes, 18,330 edges

### Fixed

#### FIX-KB-001: ACTIVE_CONFIG anomaly
- Removed 137,160 duplicate ACTIVE_CONFIG edges
- Removed 20 duplicate AIConfigSet and 57 AIProviderConfig nodes
- Fixed `_setActiveConfigSetInternal()` (row-per-match → two-step)
- Fixed `_createConfigSetInternal()` (CREATE → MERGE)
- Fixed `_createProviderConfig()` (CREATE → MERGE)

#### FIX-KB-002: Namespace inconsistency
- Unified CORE/Core/core → CORE (82 nodes)
- Removed default/default2 namespace (16 nodes → CORE)
- Added namespace normalization in `memgraph.service.js` `mergeNode()`

#### FIX-KB-003: Namespace for all nodes
- 2,896 nodes received namespace (was 63% without namespace → 0%)
- Mapping by domain: PROJECT(2,188), CORE(443+180), META(47)

#### FIX-KB-004: Namespace mismatches
- SystemComponent: GXE → CORE (20)
- BehavioralNode: CORE → PROJECT (18)
- Notification: CORE → META (15)
- Unified sql-extraction, iNeed, YOUNEED, core.types.* → 4 standard namespaces

## [0.1.2] — 2026-03-13

### Added

#### CC-029: ExecutionRecord Unification
- Created `ExecutionRecorder` (`runtime/persistence/ExecutionRecorder.js`)
- Integration into RuntimeEngine._buildResult() (fire-and-forget)
- Migration AOPEG_Execution → ExecutionRecord (META namespace)
- ExecutionNodeRecordSchema added to Schema Registry (8 schemas)

#### CC-030: E2E Test for ExecutionRecord
- Test script `scripts/test-execution-record.js` (7/7 checks)
- Fixed bug: 3 calls to _buildResult() were not passing dag

#### CC-031: Production Activation
- StartupManager (`services/startup/StartupManager.js`)
- OrphanDetector cron (every 6 hours)
- TombstoneExpirer cron (every 24 hours)
- Health endpoint `/health/codex`
- Graceful shutdown integration
- Test script `scripts/test-startup-manager.js` (12/12 checks)

#### CC-032: Architecture Decision Records
- 6 ADRs created in `docs/codex/adr/`
- ADR-001: Memgraph as Knowledge Graph Store
- ADR-002: GXE AOPEG Execution Model
- ADR-003: Four-Namespace Architecture
- ADR-004: Bi-temporal Versioning with Hash Chain
- ADR-005: Polystore Architecture
- ADR-006: Information Types Classification
- 6 ADR nodes in Memgraph (META namespace)
- 12 RELATED_TO edges between ADRs

### Infrastructure
- Schema Registry: 8 schemas, 36 tests
- Background jobs: 2 (OrphanDetector 6h, TombstoneExpirer 24h)
- .env.example updated

## [0.1.3] — 2026-03-19

### Added

#### Tool Namespace Architecture (CODEX-DOMAINS §9.7)
- `toolNamespace` field (CODEX/CORE/PROJECT) in tool-definition.schema.json
- 145 Tool nodes written to Memgraph (93 MCP + 52 AOPEG)
- 19 ToolCategory nodes (11 MCP + 8 AOPEG)
- Classification: CODEX=11, CORE=104, PROJECT=30

#### MCP Discovery Endpoints
- `list_tools_by_namespace` — filter tools by namespace with optional category
- `get_tool_stats` — registry statistics (byLevel, byCategory, byNamespace)
- Built-in tools in GXEMcpServer (not via registry)

#### Codex Tools → MCP Integration
- 6 Codex tools migrated to MCP: `api/src/mcp/tools/codex/`
  - codex.search_rules, codex.get_rule, codex.get_principles
  - codex.get_blackcodex, codex.check_compliance, codex.propose_change
- Inherit BaseTool, delegate to executeCodexTool()
- Registered via createCodexTools() in MCP index

#### ToolRegistry Extensions
- `listByNamespace(namespace)` — filter by toolNamespace
- `listByNamespaceAndCategory(namespace, category)` — dual filter
- `getStats()` returns `byNamespace` breakdown

#### Seed Scripts
- `seed-tool-catalog.js` updated: CATEGORY_NAMESPACE mapping, toolNamespace in Cypher
- `seed-aopeg-executors.js` — new script with auto-discovery of executors from plugins
- Fixed bug: `runCypher` → `runQuery` in seed-tool-catalog.js

### Infrastructure
- Documentation: CODEX-DOMAINS.md §9.7 (9 subsections)
- CODEX_INDEX.md updated with tools statistics
- Tool definition schema extended (optional toolNamespace field)

## [Unreleased]

### Planned
- Appendix A: JSON Schemas (full set)
- Appendix B: Cypher Templates
- Appendix C: Error Codes Registry
- Appendix D: Migration Guide
- Appendix E: Code Review Checklist
- Promote status to 🟢 1.0.0 after production validation

---

## Codex v0.1.3 Statistics

| Metric | Value |
|---------|----------|
| Codex parts | 10 (0-IX) |
| ADR | 6 |
| Information Types | 17 |
| Tool nodes in graph | 145 |
| Tool categories | 19 (11 MCP + 8 AOPEG) |
| Tool namespaces | 3 (CODEX, CORE, PROJECT) |
| JSON Schemas | 8 |
| Error codes | 18+ |
| Background jobs | 2 (OrphanDetector, TombstoneExpirer) |
| Seed scripts | 2 (seed-tool-catalog, seed-aopeg-executors) |
| Nodes in graph | ~4,800+ |
| Edges in graph | ~18,500+ |
| Namespaces | 4 (CORE, PROJECT, META, COMMON) |

---

*Generated: 2026-03-19T10:17:45.656Z*
*Version: 0.1.3*
*Build: build-codex-artifact.js*

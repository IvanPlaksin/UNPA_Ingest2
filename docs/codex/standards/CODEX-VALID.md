# CODEX-VALID: Validation Standard

**Status:** 🟡 In development
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Table of Contents

- [5.1 Schema Registry: single source of truth](#51-schema-registry-single-source-of-truth)
- [5.2 Pre-write validation](#52-pre-write-validation)
- [5.3 Post-write verification](#53-post-write-verification)
- [5.4 Duplicate detection](#54-duplicate-detection)
- [5.5 Orphaned data detection](#55-orphaned-data-detection)
- [5.6 Index management](#56-index-management)
- [Appendix: Validation error codes](#appendix-validation-error-codes)

---

## 5.1 Schema Registry: single source of truth

### Architecture

Schema Registry is a centralized registry of JSON Schema definitions for all knowledge graph entities. Implemented in `api/src/validation/schema-registry.js`.

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
│  Functions:                                             │
│  - register(schema)     — register/replace              │
│  - validate(id, data)   — validate data                 │
│  - listSchemas()        — list all IDs                  │
│  - getSchema(id)        — get raw schema                │
│  - getSchemaRegistry()  — singleton                     │
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

New node types must inherit from `BaseNodeSchema` through `allOf` composition:

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

**Rule:** Every new node type in the knowledge graph MUST have a corresponding JSON Schema in the Registry before use.

---

## 5.2 Pre-write validation

### Intercept points

Validation is performed BEFORE each write operation to Memgraph:

| Operation | File | Current validation | Target validation |
|-----------|------|--------------------|-------------------|
| `mergeNode()` | memgraph.service.js:386 | Only `if (!id)` | Schema + fingerprint + business rules |
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
                         │  1. Detect   │  Detect node type
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

### Hash chain check

For NodeVersion after write:

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

### Strategy: three-level approach

**Level 1 — Fingerprint (fast, exact)**

SHA-256 of normalized content:
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
| `VERSION` | CatalogEntry with the same contentHash | Create new version (increment versionNumber) |
| `MERGE` | Entity with normalized form match (confidence > 0.8) | Merge properties, take maximum confidence |

### Policy selection algorithm

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

## 5.5 Orphaned data detection

### Types of orphaned data

| Type | Description | Risk | Check |
|------|-------------|------|-------|
| Orphan nodes | Nodes without edges (isolated) | Medium | Every 6 hours |
| Orphan edges | Edges with missing source/target | High | Every 6 hours |
| Orphan vectors | Vectors in Qdrant without a node in Memgraph | High | Daily |
| Stale versions | GraphVersion without a CatalogEntry | Medium | Weekly |
| Broken chains | NodeVersion with invalid chainHash | Critical | On every NodeVersion write |

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
| Orphan nodes | 6 hours | Log + metric, do not auto-delete |
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
- No single place for the complete list of indexes
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
4. All definitions — in `GraphSchemaManager.initializeSchema()`
5. Duplication in other files is forbidden

### Missing indexes (plan to add)

| Label | Property | Rationale |
|-------|----------|-----------|
| * (all) | `updatedAt` | Sorting by update date |
| CatalogEntry | `createdBy` | Filter by author |
| ExecutionPattern | `hash` | Lookup by DAG hash |
| ExecutionRecord | `dagId` | Search executions by graph |
| * (all domain) | `extractionCycleId` | Bulk delete by cycle |

### Migration plan

1. Collect the complete list of indexes from all files (audit)
2. Consolidate in `GraphSchemaManager.initializeSchema()`
3. Add missing indexes
4. Remove duplicate definitions from other files
5. Add `SHOW INDEX INFO` check to the healthcheck endpoint

---

## Appendix: Validation error codes

| Code | Name | Description | Severity | Action |
|------|------|-------------|----------|--------|
| VAL001 | SCHEMA_REQUIRED_MISSING | Required field missing | ERROR | Reject write |
| VAL002 | SCHEMA_TYPE_MISMATCH | Wrong data type | ERROR | Reject write |
| VAL003 | SCHEMA_ENUM_INVALID | Value not from allowed enum | ERROR | Reject write |
| VAL004 | DUPLICATE_CONTENT | Duplicate by contentHash | WARNING | Apply policy (REJECT/UPSERT/VERSION/MERGE) |
| VAL005 | EDGE_MISSING_SOURCE | Edge source node does not exist | ERROR | Reject edge creation |
| VAL006 | EDGE_MISSING_TARGET | Edge target node does not exist | ERROR | Reject edge creation |
| VAL007 | HASH_CHAIN_BROKEN | Hash chain integrity broken | CRITICAL | Alert + block writes |
| VAL008 | ORPHAN_DETECTED | Orphaned node/edge/vector detected | WARNING | Log + queue for review |
| VAL009 | NAMESPACE_VIOLATION | Write to forbidden namespace | ERROR | Reject write |

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

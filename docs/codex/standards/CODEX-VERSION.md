# CODEX-VERSION: Versioning Standard

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

In the UN ProjectAdvisor system two data models coexist:

1. **Mutable domain nodes** — ordinary knowledge graph nodes (Table, Method, Column, etc.) that are updated in-place via `SET`. Simple, fast, no history stored.

2. **Immutable NodeVersion** — append-only version chains with hash chain, audit, and full change history. Used for business rules, regulatory documents, and anything requiring provable traceability.

This standard defines:
- when to use which model,
- how to link them to each other (Bridge pattern),
- how to build and traverse SUPERSEDES chains,
- how to handle merge/split/fork,
- when it is permissible to violate immutability (God Mode),
- how to safely delete versions (Tombstones).

---

## 3.1 Two models — NodeVersion vs Domain nodes

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
|---------------------------------|:----------------:|:-----------------------:|
| Change history needed?          | No               | Yes                     |
| Audit critical?                 | No               | Yes                     |
| Change frequency                | High (>10/day)   | Low-medium              |
| Normative/legal data?           | No               | Yes                     |
| Need to roll back to version N? | Impossible       | Yes                     |
| Data volume per node            | Small (5-10 fields) | Large (25 fields)    |
| Write speed                     | Fast (SET)       | Slower (CREATE+EDGE)    |
| Provable integrity              | No               | Yes (hash chain)        |

### Label to model mapping

| Graph label        | Model                        | Rationale                                                |
|--------------------|------------------------------|----------------------------------------------------------|
| `Table`            | Domain (mutable)             | Technical description, frequently synchronized            |
| `Column`           | Domain (mutable)             | Table attribute, updated on re-scan                       |
| `Method`           | Domain (mutable)             | Code changes often, history in git                       |
| `BusinessRule`     | NodeVersion (immutable)      | Regulatory document, full audit required                  |
| `Policy`           | NodeVersion (immutable)      | Legally significant, requires traceability                |
| `Requirement`      | NodeVersion (immutable)      | Specification, approval history needed                    |
| `CatalogEntry`     | Domain + GraphVersion        | Catalog itself is mutable, but graph versions are immutable |
| `ExecutionRecord`  | Domain (immutable by policy) | Created once, never changed, but without hash chain       |
| `Settings`         | Domain (mutable)             | Configuration, no history needed                         |
| `CoreComponent`    | Domain (mutable)             | Infrastructure node, updated on deploy                   |

---

## 3.2 Bridge pattern: linking the two models

### Problem

Domain nodes and NodeVersion live in different models and are not linked directly. A method (domain) may implement a business rule (NodeVersion), but how do you build an edge between them when the rule version changes?

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
// INCORRECT: edge tied to a specific version
MATCH (m:Method {id: "M-042"})
MATCH (br:NodeVersion {versionId: "BR-001-v3"})
MERGE (m)-[:IMPLEMENTS]->(br)
// When v4 appears this edge will remain on v3!
```

**Rule 2: On SUPERSEDE — relink incoming edges.**

When a new version is created, all incoming cross-model edges must be redirected to the new ACTIVE version:

```javascript
/**
 * Relink incoming edges on new version creation.
 * Called AFTER creating the SUPERSEDES edge and changing status.
 *
 * @param {string} entityId     — stable entity ID
 * @param {string} oldVersionId — versionId of the previous (now SUPERSEDED) version
 * @param {string} newVersionId — versionId of the new ACTIVE version
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
        // In a real system a CASE by relType is needed.
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

Since Memgraph does not support dynamic edge types in `CREATE`, we use an explicit mapping:

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

## 3.3 SUPERSEDES chain: creation, traversal, invariants

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
  Reading the chain: from ACTIVE backwards via SUPERSEDES
```

### New version creation code

```javascript
const crypto = require('crypto');

/**
 * Creates the next version of an entity in the SUPERSEDES chain.
 *
 * @param {string} entityId    — stable entity ID
 * @param {object} newContent  — new version content
 * @param {object} meta        — metadata (author, changeReason, etc.)
 * @returns {object}           — created NodeVersion
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

    // 2. Calculate hash chain
    const contentStr = JSON.stringify(newContent, Object.keys(newContent).sort());
    const newHash = crypto
      .createHash('sha256')
      .update(currentHash + '|' + contentStr)
      .digest('hex');

    const newSeq = currentSeq + 1;
    const newVersionId = `${entityId}-v${newSeq}`;

    // 3. Calculate diff from previous version
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

**Get full entity history (newest to oldest):**

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

**Find the version current at a specific date:**

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

| # | Invariant                                         | Check                                                   |
|---|---------------------------------------------------|---------------------------------------------------------|
| 1 | Exactly one ACTIVE version per `entityId`          | `COUNT(status="ACTIVE") = 1` for each entityId          |
| 2 | No cycles in the SUPERSEDES chain                  | DFS traversal does not return to a visited node         |
| 3 | `sequenceNumber` strictly increases along SUPERSEDES | Each `newer.seqNum > older.seqNum`                    |
| 4 | `previousHash` matches `contentHash` of ancestor   | `newer.previousHash === older.contentHash`              |
| 5 | First version (seqNum=1) has `previousHash=null`   | Chain start does not reference a previous hash          |
| 6 | SUPERSEDED version has no incoming Bridge edges    | All IMPLEMENTS/REFERENCES point only to ACTIVE          |

**Cypher query to verify invariant 1:**

```cypher
MATCH (v:NodeVersion {status: "ACTIVE"})
WITH v.entityId AS eid, count(*) AS cnt
WHERE cnt > 1
RETURN eid, cnt
// Result must be empty
```

**Cypher query to verify invariant 3:**

```cypher
MATCH (newer:NodeVersion)-[:SUPERSEDES]->(older:NodeVersion)
WHERE newer.sequenceNumber <= older.sequenceNumber
RETURN newer.versionId AS invalid, newer.sequenceNumber AS newerSeq, older.sequenceNumber AS olderSeq
// Result must be empty
```

---

## 3.4 Merge / Split / Fork

### MERGE: combining two entities into one

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
  │                 │ content: "Combined"    │
  │                 └────────────────────────┘
```

**MERGE code:**

```javascript
/**
 * Merge two entities into one.
 * Result: a new version of primaryEntityId containing data from both.
 * The second entity receives MERGED status.
 *
 * @param {string} primaryEntityId   — entityId that remains
 * @param {string} secondaryEntityId — entityId that is absorbed
 * @param {object} mergedContent     — combined content
 * @param {object} meta              — metadata
 */
async function mergeEntities(primaryEntityId, secondaryEntityId, mergedContent, meta = {}) {
  const session = driver.session();
  try {
    // 1. Create new version of primary with combined content
    const newVersion = await createNextVersion(primaryEntityId, mergedContent, {
      ...meta,
      changeReason: `MERGE: ${secondaryEntityId} merged into ${primaryEntityId}`,
      metadata: {
        ...(meta.metadata || {}),
        mergedFromIds: [primaryEntityId, secondaryEntityId],
        mergeType: 'ABSORB'
      }
    });

    // 2. Mark the ACTIVE version of secondary as MERGED
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

    // 4. Redirect all Bridge edges of secondary to the new primary version
    await relinkAllBridgeEdges(secondaryEntityId,
      `${secondaryEntityId}-v*`, // all versions
      newVersion.versionId);

    return newVersion;
  } finally {
    await session.close();
  }
}
```

### SPLIT: splitting one entity into two

**Scenario:** Business rule BR-020 is too complex and is split into BR-020 (part A) and BR-021 (part B).

```
  BEFORE SPLIT:
  ─────────────

  (:NodeVersion)
  │ entityId: "BR-020"
  │ versionId: "BR-020-v4"
  │ status: ACTIVE
  │ content: "Complex rule A+B"


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
 * Split an entity into two.
 * The original entityId receives a new version (part A).
 * A new entityId is created for part B.
 *
 * @param {string} entityId     — source entityId
 * @param {object} contentPartA — content for the original entity
 * @param {object} contentPartB — content for the new entity
 * @param {string} newEntityId  — entityId for the new entity
 * @param {object} meta         — metadata
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

    // 3. Create first version B (new entity)
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

### FORK: branching for alternatives

**Scenario:** An alternative version of rule BR-030 needs to be created for a different region/context. The original remains; an independent branch is created.

```
  BEFORE FORK:
  ────────────

  (:NodeVersion)
  │ entityId: "BR-030"
  │ versionId: "BR-030-v2"
  │ status: ACTIVE
  │ content: "Global rule"


  AFTER FORK:
  ───────────

  (:NodeVersion)                            (:NodeVersion)
  │ entityId: "BR-030"                      │ entityId: "BR-030-EU"     <── NEW entityId
  │ versionId: "BR-030-v2"                  │ versionId: "BR-030-EU-v1"
  │ status: ACTIVE                          │ status: ACTIVE
  │ content: "Global rule"                  │ content: "EU rule"
  │                                         │ forkedFromId: "BR-030"
  │ (no changes!)                           │ forkedFromVersion: "BR-030-v2"
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
- **FORK** — the original does NOT change; the new entityId begins an independent life.

**FORK code:**

```javascript
/**
 * Create a fork of an entity.
 * The original remains unchanged.
 * A new entityId is created with initial content copied from the original.
 *
 * @param {string} sourceEntityId  — entityId of the original
 * @param {string} forkEntityId   — entityId for the fork
 * @param {object} modifications  — changes relative to the original (optional)
 * @param {object} meta           — metadata
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

## 3.5 God Mode: controlled violation of immutability

### Operations requiring God Mode

| Operation                         | Reason God Mode is required                                 | Risk level    |
|-----------------------------------|-------------------------------------------------------------|:-------------:|
| Deleting a version from the chain | Breaks hash chain and SUPERSEDES connectivity               | CRITICAL      |
| Modifying contentHash             | Destroys the provable integrity of the entire chain         | CRITICAL      |
| Changing historical time          | Violates chronological order                                | HIGH          |
| Full entity purge                 | Deletes all versions and relationships, irreversible        | CRITICAL      |
| Repairing a broken chain          | Recalculating hashes, restoring SUPERSEDES edges            | HIGH          |
| Changing entityId                 | Breaks all Bridge edges and external references             | HIGH          |
| Reverting MERGED/DELETED status   | Restoring entity from terminal state                        | MEDIUM        |

### GodModeSession

```javascript
const crypto = require('crypto');

/**
 * God Mode session with timeout, verification, and audit.
 * All actions within the session are recorded in an audit hash chain.
 */
class GodModeSession {
  /**
   * @param {string} adminId         — administrator ID
   * @param {string} reason          — justification for activating God Mode
   * @param {number} timeoutMinutes  — session timeout (default 30 min)
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
   * In a real system — role check, 2FA, approval workflow.
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
   * @param {string}   actionType — action type (DELETE_VERSION, MODIFY_HASH, etc.)
   * @param {object}   params     — action parameters
   * @param {Function} executor   — function that performs the action
   * @returns {*}                 — executor result
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
   * Each entry contains the hash of the previous one, forming an unbreakable chain.
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

    // Save to knowledge graph
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

**God Mode usage example:**

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

## 3.6 Tombstones: soft delete with restore capability

### Soft Delete

When deleting a version it is not physically destroyed, but marked as DELETED. A Tombstone node is created, which stores metadata for possible restoration.

**Soft delete code:**

```javascript
/**
 * Soft deletion of an entity.
 * Creates a Tombstone, marks the ACTIVE version as DELETED,
 * saves orphaned edges for possible restoration.
 * Restore window: 90 days.
 *
 * @param {string} entityId  — entityId of the entity being deleted
 * @param {string} reason    — reason for deletion
 * @param {string} deletedBy — who is deleting
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

### Restore from Tombstone

```javascript
/**
 * Restore an entity from Tombstone.
 * Returns status to ACTIVE, restores Bridge edges.
 *
 * @param {string} tombstoneId — ID of the tombstone to restore from
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
        // Find source node (may be Domain or NodeVersion)
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
        // Source node may have been deleted — skip
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
  │    [A] Restore (before deadline):           │
  │         │                                   │
  │         ├── restore ────────────────────────>│ status: RESTORED
  │         │                                   │ restoredAt: datetime()
  │         v                                   │
  │  status: ACTIVE                             │
  │  restoredAt: datetime()                     │
  │  restoredFrom: "tombstone:..."              │
  │                                             │
  │    [B] Deadline expiry (after 90 days):     │
  │         │                                   │
  │         ├── expire cron ────────────────────>│ status: EXPIRED
  │         │                                   │ expiredAt: datetime()
  │         v                                   │
  │  status: DELETED (permanent)                │
  │  (data ready for physical cleanup)          │
  │                                             │
  └─────────────────────────────────────────────┘

  Transition summary:

    ACTIVE ──[soft delete]──> DELETED + Tombstone(PENDING)
    DELETED ──[restore]─────> ACTIVE  + Tombstone(RESTORED)
    DELETED ──[expire 90d]──> DELETED + Tombstone(EXPIRED) ──[purge]──> physical deletion
```

**Cron task for processing expired Tombstones:**

```javascript
/**
 * Process expired Tombstones.
 * Runs on schedule (daily).
 * Marks expired Tombstones as EXPIRED.
 * Physical deletion — a separate process requiring God Mode.
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

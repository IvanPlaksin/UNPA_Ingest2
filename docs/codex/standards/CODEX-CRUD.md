# CODEX-CRUD: Knowledge Graph Operations Standard

**Status:** 🟡 In Development
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Table of Contents

- [1.1 Operation Principles](#11-operation-principles)
- [1.2 CREATE Operation](#12-create-operation)
- [1.3 READ Operation](#13-read-operation)
- [1.4 UPDATE Operation](#14-update-operation)
- [1.5 DELETE Operation](#15-delete-operation)
- [1.6 Polystore Transactionality](#16-polystore-transactionality)
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
Data is not destroyed -- it evolves.

---

## 1.1 Operation Principles

Three key principles govern all operations:

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **MERGE-first** | Idempotent upsert instead of INSERT | Cypher `MERGE`, not `CREATE` |
| **Explicit-failure** | Errors are explicit, not silent | `throw` on problems, not `return null` |
| **Atomic-or-compensate** | Transaction or rollback | Unit of Work pattern |

### MERGE-first

All write operations use `MERGE` by default:
- Repeated call with the same data is safe (idempotent)
- No race condition on concurrent writes
- Caller does not need to check existence before writing

**Exception:** `NodeVersion` and `EdgeVersion` use `CREATE`, since each version is unique.

### Explicit-failure

Silent failures are forbidden:
- `mergeRelationship()` -- if source/target don't exist → `throw EdgeMissingEndpointError`
- `mergeNode()` -- if validation fails → `throw ValidationError`
- Polystore write -- if partial failure → compensating rollback + `throw TransactionError`

### Atomic-or-compensate

For a single store (Memgraph) -- use Cypher transactions.
For polystore (Memgraph + Qdrant + Redis) -- compensating transactions (Saga pattern).

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
    │   - chainHash (if versioned)
    │
    ▼
[4] Execute MERGE
    │
    ▼
[5] Post-verify (for critical operations)
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

Every query is routed through a namespace:

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
|-------|------------|-------------|
| Current state | -- | Latest ACTIVE version |
| Point-in-time (tt) | `asOf: datetime` | What the system knew at the time |
| Point-in-time (vt) | `validAt: datetime` | What was true at the time |
| Bi-temporal | `asOf` + `validAt` | Combination of both dimensions |
| Version history | `entityId` | Full SUPERSEDES chain |

```javascript
async readAtTime(entityId, { asOf, validAt }) {
  const conditions = ['n.entityId = $entityId'];

  if (asOf) {
    // Transaction time: when it was recorded
    conditions.push(
      'n.ttStart <= $asOf AND (n.ttEnd IS NULL OR n.ttEnd > $asOf)'
    );
  }
  if (validAt) {
    // Valid time: when it was true
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
|-------|-------|-----|--------------|
| L1 | In-memory LRU | 5 min | On every SUPERSEDES |
| L2 | Redis | 30 min | On every SUPERSEDES |
| Bypass | -- | -- | Temporal queries always hit Memgraph |

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
|-----------|----------|-----------|
| Domain node (Table, Column, etc.) | Mutable `SET` | Day-to-day operations, full history not needed |
| Knowledge fact | New NodeVersion | Facts are reinterpreted, audit chain required |
| GXE workflow graph | New GraphVersion | Every logic change is a new version |
| ExecutionRecord | **Immutable** | Execution record is never changed |
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

| Operation | Who can | Restorable | Audit |
|-----------|---------|------------|-------|
| Soft delete | Any agent | Yes (Tombstone) | Tombstone node |
| Hard delete (purge) | God Mode only | No | GodModeAudit record |
| Restore | Any agent | -- | Tombstone.restoredAt |

---

## 1.6 Polystore Transactionality

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
|------|-------|-----------|--------------|
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
|------|------|-------------|----------|----------|
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

- **CRITICAL** -- system is in an inconsistent state, immediate intervention required
- **ERROR** -- operation cannot be completed, caller must handle
- **WARNING** -- operation completed with caveats, caller should be aware

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

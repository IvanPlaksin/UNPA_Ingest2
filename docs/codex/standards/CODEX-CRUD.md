# CODEX-CRUD: Стандарт операций с графом знаний

**Статус:** 🟡 В разработке
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Оглавление

- [1.1 Принципы операций](#11-принципы-операций)
- [1.2 Операция CREATE](#12-операция-create)
- [1.3 Операция READ](#13-операция-read)
- [1.4 Операция UPDATE](#14-операция-update)
- [1.5 Операция DELETE](#15-операция-delete)
- [1.6 Транзакционность polystore](#16-транзакционность-polystore)
- [1.7 Error taxonomy](#17-error-taxonomy)

---

## Преамбула

CRUD в контексте immutable graph — не классический Create/Read/Update/Delete.

```
TRADITIONAL CRUD              IMMUTABLE GRAPH CRUD
─────────────────             ────────────────────
CREATE → INSERT               CREATE → MERGE + validate
READ   → SELECT               READ   → MATCH + temporal filter
UPDATE → UPDATE SET            UPDATE → CREATE new version + SUPERSEDES
DELETE → DELETE                DELETE → CREATE Tombstone + mark DELETED
```

**Update** = создание новой версии + цепочка SUPERSEDES.
**Delete** = создание Tombstone + статус DELETED.
Данные не уничтожаются — они эволюционируют.

---

## 1.1 Принципы операций

Три ключевых принципа определяют все операции:

| Принцип | Описание | Реализация |
|---------|----------|------------|
| **MERGE-first** | Идемпотентный upsert вместо INSERT | Cypher `MERGE`, не `CREATE` |
| **Explicit-failure** | Ошибки явные, не silent | `throw` при проблемах, не `return null` |
| **Atomic-or-compensate** | Транзакция или откат | Unit of Work pattern |

### MERGE-first

Все операции записи используют `MERGE` по умолчанию:
- Повторный вызов с теми же данными безопасен (idempotent)
- Нет race condition при параллельных записях
- Caller не обязан проверять существование перед записью

**Исключение:** `NodeVersion` и `EdgeVersion` используют `CREATE`, поскольку каждая версия уникальна.

### Explicit-failure

Запрещены silent failures:
- `mergeRelationship()` — если source/target не существуют → `throw EdgeMissingEndpointError`
- `mergeNode()` — если validation fails → `throw ValidationError`
- Polystore write — если partial failure → compensating rollback + `throw TransactionError`

### Atomic-or-compensate

Для одиночного хранилища (Memgraph) — используем транзакции Cypher.
Для polystore (Memgraph + Qdrant + Redis) — компенсирующие транзакции (Saga pattern).

---

## 1.2 Операция CREATE

### Алгоритм

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

### Реализация для domain nodes

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

### Реализация для NodeVersion (Immutable Graph)

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

## 1.3 Операция READ

### Namespace routing

Каждый запрос маршрутизируется через namespace:

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

| Запрос | Параметры | Описание |
|--------|-----------|----------|
| Current state | — | Последняя ACTIVE версия |
| Point-in-time (tt) | `asOf: datetime` | Что система знала на момент |
| Point-in-time (vt) | `validAt: datetime` | Что было истинным на момент |
| Bi-temporal | `asOf` + `validAt` | Комбинация двух измерений |
| Version history | `entityId` | Вся SUPERSEDES chain |

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

| Уровень | Хранилище | TTL | Invalidation |
|---------|-----------|-----|--------------|
| L1 | In-memory LRU | 5 min | На каждый SUPERSEDES |
| L2 | Redis | 30 min | На каждый SUPERSEDES |
| Bypass | — | — | Temporal queries всегда в Memgraph |

---

## 1.4 Операция UPDATE

### Для domain nodes (mutable)

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

### Для NodeVersion (immutable)

```javascript
// UPDATE = CREATE new version
async updateEntity(entityId, updates, changeReason) {
  return this.createNodeVersion(entityId, updates, changeReason);
}
```

### Правило выбора стратегии

| Тип узла | Стратегия | Обоснование |
|----------|-----------|-------------|
| Domain node (Table, Column, etc.) | Mutable `SET` | Day-to-day operations, не нужна полная история |
| Knowledge fact | New NodeVersion | Факты переосмысливаются, нужна аудит-цепочка |
| GXE workflow graph | New GraphVersion | Каждое изменение логики — новая версия |
| ExecutionRecord | **Immutable** | Запись выполнения никогда не меняется |
| CatalogEntry metadata | Mutable `SET` | Только updatedAt, usageCount, qualityScore |

---

## 1.5 Операция DELETE

### Soft delete (стандарт)

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

### Hard delete (только God Mode)

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

### Сводная таблица

| Операция | Кто может | Восстановимо | Аудит |
|----------|-----------|--------------|-------|
| Soft delete | Любой агент | Да (Tombstone) | Tombstone node |
| Hard delete (purge) | Только God Mode | Нет | GodModeAudit record |
| Restore | Любой агент | — | Tombstone.restoredAt |

---

## 1.6 Транзакционность polystore

### Проблема

Запись в Memgraph + Qdrant + Redis не атомарна. Partial failure = inconsistent state (orphaned vectors, missing graph nodes).

### Решение: Compensating Transactions (Saga pattern)

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

### Порядок записи

| Шаг | Хранилище | Операция | Компенсация |
|-----|-----------|----------|-------------|
| 1 | Memgraph | MERGE node/edge | DELETE node/edge |
| 2 | Qdrant | upsert vectors | delete points |
| 3 | Redis | SET cache | DEL key |

**Правило:** Memgraph записывается первым, потому что это primary source of truth.

### Реализация

Использовать существующий `TransactionManager` из `api/src/services/pipeline/TransactionManager.js`:

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

| Код | Тип | Описание | Severity | Recovery |
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

- **CRITICAL** — система в inconsistent state, требуется немедленное вмешательство
- **ERROR** — операция не может быть выполнена, caller должен обработать
- **WARNING** — операция выполнена с оговорками, caller должен быть осведомлён

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*

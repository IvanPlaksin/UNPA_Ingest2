# CODEX-VALID: Стандарт валидации

**Статус:** 🟡 В разработке
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Оглавление

- [5.1 Schema Registry: единый источник правды](#51-schema-registry-единый-источник-правды)
- [5.2 Pre-write валидация](#52-pre-write-валидация)
- [5.3 Post-write верификация](#53-post-write-верификация)
- [5.4 Обнаружение дубликатов](#54-обнаружение-дубликатов)
- [5.5 Обнаружение осиротевших данных](#55-обнаружение-осиротевших-данных)
- [5.6 Управление индексами](#56-управление-индексами)
- [Приложение: Коды ошибок валидации](#приложение-коды-ошибок-валидации)

---

## 5.1 Schema Registry: единый источник правды

### Архитектура

Schema Registry — централизованный реестр JSON Schema определений для всех сущностей графа знаний. Реализован в `api/src/validation/schema-registry.js`.

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
│  Функции:                                               │
│  - register(schema)     — зарегистрировать/заменить     │
│  - validate(id, data)   — валидировать данные            │
│  - listSchemas()        — список всех ID                 │
│  - getSchema(id)        — получить raw schema            │
│  - getSchemaRegistry()  — singleton                      │
└─────────────────────────────────────────────────────────┘
```

### Встроенные схемы

| # | Schema ID | Описание | Required fields | Strict |
|---|-----------|----------|-----------------|--------|
| 1 | `codex://schemas/base-node` | Минимальный контракт для любого узла | id, createdAt, namespace | Нет |
| 2 | `codex://schemas/provenance` | Провенанс (W3C PROV-O) | sourceType, sourceId, confidence | Нет |
| 3 | `codex://schemas/node-version` | Immutable узел с bi-temporal и hash chain | 9 полей (versionId, entityId, namespace, sequenceNumber, status, ttStart, contentHash, chainHash, nodeType) | Да |
| 4 | `codex://schemas/edge-version` | Immutable ребро с hash chain | 10 полей | Да |
| 5 | `codex://schemas/catalog-entry` | Запись каталога GXE | entryId, name, type, namespace, createdAt | Нет |
| 6 | `codex://schemas/graph-version` | Snapshot версии графа | versionId, versionNumber, createdAt, contentHash | Да |
| 7 | `codex://schemas/execution-record` | Лог выполнения | executionId, dagId, status, executedAt | Нет |

### Правила расширения

Новые типы узлов должны наследовать от `BaseNodeSchema` через композицию `allOf`:

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

**Правило:** Каждый новый тип узла в графе знаний ОБЯЗАН иметь соответствующую JSON Schema в Registry до начала использования.

---

## 5.2 Pre-write валидация

### Точки перехвата

Валидация выполняется ПЕРЕД каждой операцией записи в Memgraph:

| Операция | Файл | Текущая валидация | Целевая валидация |
|----------|------|-------------------|-------------------|
| `mergeNode()` | memgraph.service.js:386 | Только `if (!id)` | Schema + fingerprint + business rules |
| `mergeRelationship()` | memgraph.service.js:445 | Нет | Node existence check + edge schema |
| `createNode()` (graph-gen) | mssql.graph-generator.js:398 | Нет | BaseNode schema + provenance |
| `saveEntityWithProvenance()` | GraphStorageService.js:66 | Только provenance | Full schema + provenance + fingerprint |
| `createNode()` (immutable) | immutable-graph.service.ts:72 | Нет | NodeVersion schema + hash chain |
| `createCatalogEntry()` | graphCatalog.service.js:141 | Нет | CatalogEntry schema |

### Алгоритм валидации

```
                         ┌──────────────┐
                         │  Входные     │
                         │  данные      │
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  1. Detect   │  Определить тип узла
                         │     Schema   │  по label / context
                         └──────┬───────┘
                                │
                         ┌──────▼───────┐
                         │  2. JSON     │  Проверить required fields,
                         │     Schema   │  типы, enum, format
                         │     Check    │
                         └──────┬───────┘
                                │
                        ┌───────▼───────┐
                 ┌──────│  valid?       │──────┐
                 │ Нет  └───────────────┘ Да   │
                 │                              │
          ┌──────▼──────┐               ┌──────▼───────┐
          │ REJECT      │               │  3. Business │  Проверить
          │ VAL001-003  │               │     Rules    │  бизнес-правила
          └─────────────┘               └──────┬───────┘
                                               │
                                        ┌──────▼───────┐
                                        │  4. Finger-  │  Проверить
                                        │     print    │  дубликаты
                                        │     Check    │
                                        └──────┬───────┘
                                               │
                                  ┌────────────▼────────────┐
                           ┌─────│  collision?              │─────┐
                           │ Да  └──────────────────────────┘ Нет │
                           │                                      │
                    ┌──────▼──────┐                        ┌──────▼──────┐
                    │  Apply      │                        │  5. WRITE   │
                    │  Policy     │                        │  to DB      │
                    │  (see 5.4)  │                        └─────────────┘
                    └─────────────┘
```

### Обязательные поля по уровням

**Уровень 0 — MANDATORY (для ЛЮБОГО узла):**
- `id` — UUID v4
- `createdAt` — ISO 8601 datetime
- `namespace` — одно из: CORE, PROJECT, META, COMMON

**Уровень 1 — PROVENANCE (для извлечённых данных):**
- `sourceType` — enum: llm, user, system, import, pipeline, agent
- `sourceId` — ID источника (модель, пользователь, pipeline ID)
- `extractionCycleId` — UUID цикла извлечения
- `confidence` — число от 0.0 до 1.0

**Уровень 2 — VERSION (для версионируемых узлов):**
- `versionId` — UUID версии
- `sequenceNumber` — порядковый номер (integer >= 1)
- `status` — enum: DRAFT, ACTIVE, SUPERSEDED, DEPRECATED, MERGED, DELETED
- `ttStart` — transaction time start (ISO 8601)
- `contentHash` — SHA-256 hex (64 символа)
- `chainHash` — Merkle chain hash (64 символа)

**Уровень 3 — EDGE (для рёбер):**
- `sourceEntityId` — ID исходного узла
- `targetEntityId` — ID целевого узла
- `edgeType` — тип связи (строка)

### Код интеграции

Рекомендуемый паттерн интеграции в `memgraph.service.js`:

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

## 5.3 Post-write верификация

### Когда применять

Post-write check выполняет read-after-write для подтверждения целостности записи.

| Операция | Post-write check | Обоснование |
|----------|-----------------|-------------|
| NodeVersion create | **ДА** | Hash chain integrity — критично |
| EdgeVersion create | **ДА** | Bi-temporal consistency — критично |
| CatalogEntry create | **ДА** | SUPERSEDES chain integrity |
| mergeNode (domain) | Нет | MERGE идемпотентен, допустима eventual consistency |
| mergeRelationship | Нет | Идемпотентный MERGE |
| Qdrant upsert | **ДА** (async) | Проверить, что вектор записан (polystore sync) |

### Алгоритм

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
   │ match?  │──── Да ──→ OK
   └────┬────┘
        │ Нет
        ▼
  Log INCONSISTENCY (VAL007)
  Retry write (max 2)
        │
        ▼
  If still mismatch → ALERT + manual review
```

### Проверка hash chain

Для NodeVersion после записи:

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

## 5.4 Обнаружение дубликатов

### Стратегия: трёхуровневый подход

**Уровень 1 — Fingerprint (быстрый, точный)**

SHA-256 от нормализованного содержимого:
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

**Уровень 2 — Normalized form (для entity resolution)**

```cypher
MATCH (n {normalizedForm: $normalizedForm, type: $type})
WHERE n.lifecycleState = 'active' OR n.lifecycleState IS NULL
RETURN n ORDER BY n.confidence DESC LIMIT 1
```

**Уровень 3 — Semantic similarity (через Qdrant)**

```javascript
const similar = await qdrantService.searchSimilar(
  embedding,
  { threshold: 0.95, limit: 3, namespace }
);
```

### Политики обработки дубликатов

| Политика | Когда применяется | Действие |
|----------|-------------------|----------|
| `REJECT` | NodeVersion с таким же contentHash уже существует | Отклонить запись, вернуть ошибку VAL004 |
| `UPSERT` | Domain-узел с таким же id | Обновить свойства через MERGE SET |
| `VERSION` | CatalogEntry с таким же contentHash | Создать новую версию (increment versionNumber) |
| `MERGE` | Entity с normalized form match (confidence > 0.8) | Объединить свойства, взять максимальный confidence |

### Алгоритм определения политики

```
  contentHash collision?
        │
   ┌────▼────┐
   │ NodeVer?│──── Да ──→ REJECT (immutable, дубликат)
   └────┬────┘
        │ Нет
   ┌────▼────────┐
   │ CatalogEntry│──── Да ──→ VERSION (создать новую версию)
   └────┬────────┘
        │ Нет
   ┌────▼────────┐
   │ normalForm  │──── Да ──→ MERGE (entity resolution)
   │ match?      │
   └────┬────────┘
        │ Нет
        ▼
      UPSERT (default: MERGE по id)
```

---

## 5.5 Обнаружение осиротевших данных

### Типы orphaned данных

| Тип | Описание | Риск | Проверка |
|-----|----------|------|----------|
| Orphan nodes | Узлы без рёбер (изолированные) | Средний | Каждые 6 часов |
| Orphan edges | Рёбра с отсутствующим source/target | Высокий | Каждые 6 часов |
| Orphan vectors | Векторы в Qdrant без узла в Memgraph | Высокий | Ежедневно |
| Stale versions | GraphVersion без CatalogEntry | Средний | Еженедельно |
| Broken chains | NodeVersion с невалидным chainHash | Критический | При каждой записи |

### Запросы для обнаружения

**Orphan nodes (узлы без связей):**
```cypher
MATCH (n)
WHERE NOT (n)--() AND NOT n:CatalogRoot AND NOT n:Settings
RETURN labels(n) AS labels, count(n) AS count
ORDER BY count DESC
```

**Orphan edges (рёбра к несуществующим узлам):**
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

### Расписание проверок

| Проверка | Интервал | Действие при обнаружении |
|----------|----------|-------------------------|
| Orphan nodes | 6 часов | Лог + метрика, не удалять автоматически |
| Orphan edges | 6 часов | Лог + пометить для review |
| Orphan vectors | 24 часа | Лог + queue для cleanup (ручное подтверждение) |
| Hash chain audit | При каждой записи NodeVersion | ALERT + block further writes |
| Full integrity scan | Еженедельно | Полный отчёт через `validateGraphIntegrity()` |

---

## 5.6 Управление индексами

### Проблема: текущее состояние

Индексы и constraints создаются в **4+ файлах**:

| Файл | Кол-во | Тип |
|------|--------|-----|
| `GraphSchemaManager.js` | 25 constraints + 20+ indexes | Domain + Immutable + AOPEG |
| `memgraph.service.js:795-808` | 9 indexes | Namespace-specific |
| `graphCatalog.service.js:93-101` | 8 indexes | Catalog |
| `apply-schema-memgraph.js` | ~10 | Migration script |
| `apply-multi-domain-schema.js` | ~15 | Multi-domain migration |

**Проблемы:**
- Нет единого места для полного списка индексов
- Возможны дубликаты и конфликты
- Нет relationship indexes
- Нет composite indexes
- Нет full-text indexes

### Целевое состояние

Все определения индексов должны быть в одном месте: `GraphSchemaManager.js`.

**Правила:**
1. Каждый новый label ОБЯЗАН иметь index на id/primary key
2. Каждый label с `namespace` ОБЯЗАН иметь index на `namespace`
3. Поля, используемые в WHERE/ORDER BY, ОБЯЗАНЫ иметь index
4. Все определения — в `GraphSchemaManager.initializeSchema()`
5. Дублирование в других файлах запрещено

### Недостающие индексы (план добавления)

| Label | Property | Обоснование |
|-------|----------|-------------|
| * (все) | `updatedAt` | Сортировка по дате обновления |
| CatalogEntry | `createdBy` | Фильтр по автору |
| ExecutionPattern | `hash` | Lookup по DAG hash |
| ExecutionRecord | `dagId` | Поиск executions по графу |
| * (все domain) | `extractionCycleId` | Групповое удаление цикла |

### План миграции

1. Собрать полный перечень индексов из всех файлов (audit)
2. Объединить в `GraphSchemaManager.initializeSchema()`
3. Добавить недостающие индексы
4. Удалить дублирующие определения из других файлов
5. Добавить `SHOW INDEX INFO` проверку в healthcheck endpoint

---

## Приложение: Коды ошибок валидации

| Код | Имя | Описание | Severity | Действие |
|-----|-----|----------|----------|----------|
| VAL001 | SCHEMA_REQUIRED_MISSING | Отсутствует обязательное поле | ERROR | Reject write |
| VAL002 | SCHEMA_TYPE_MISMATCH | Неверный тип данных | ERROR | Reject write |
| VAL003 | SCHEMA_ENUM_INVALID | Значение не из допустимого enum | ERROR | Reject write |
| VAL004 | DUPLICATE_CONTENT | Дубликат по contentHash | WARNING | Apply policy (REJECT/UPSERT/VERSION/MERGE) |
| VAL005 | EDGE_MISSING_SOURCE | Исходный узел ребра не существует | ERROR | Reject edge creation |
| VAL006 | EDGE_MISSING_TARGET | Целевой узел ребра не существует | ERROR | Reject edge creation |
| VAL007 | HASH_CHAIN_BROKEN | Нарушена целостность hash chain | CRITICAL | Alert + block writes |
| VAL008 | ORPHAN_DETECTED | Обнаружен orphaned node/edge/vector | WARNING | Log + queue for review |
| VAL009 | NAMESPACE_VIOLATION | Запись в неразрешённый namespace | ERROR | Reject write |

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*

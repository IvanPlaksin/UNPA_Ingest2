# CODEX-VERSION: Стандарт версионности

**Статус:** 🟡 Черновик
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Преамбула

В системе UN ProjectAdvisor сосуществуют две модели данных:

1. **Mutable domain nodes** -- обычные узлы графа знаний (Table, Method, Column и др.), которые обновляются на месте через `SET`. Просты, быстры, не хранят историю.

2. **Immutable NodeVersion** -- append-only цепочки версий с hash chain, аудитом и полной историей изменений. Используются для бизнес-правил, нормативных документов и всего, где требуется доказуемая трассируемость.

Данный стандарт определяет:
- когда использовать какую модель,
- как связывать их между собой (Bridge pattern),
- как строить и обходить SUPERSEDES-цепочки,
- как обрабатывать merge/split/fork,
- когда допустимо нарушать immutability (God Mode),
- как безопасно удалять версии (Tombstones).

---

## 3.1 Две модели -- NodeVersion vs Domain nodes

### Сравнительная диаграмма

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
 │  5-10 свойств                          ├─ title: "Правило валидации X"
 │                                        ├─ content: "{...json...}"
 │  Обновление:                           ├─ author: "agent:advisor"
 │  SET t.rowCount = 200000               ├─ createdAt: datetime()
 │                                        ├─ createdBy: "user:admin"
 │  История: НЕТ                          ├─ validFrom: datetime()
 │  Аудит: НЕТ                            ├─ validUntil: null
 │                                        ├─ namespace: "un.rules"
 │                                        ├─ tags: ["validation","input"]
 │                                        ├─ metadata: "{...}"
 │                                        ├─ sourceType: "LLM_EXTRACTION"
 │                                        ├─ sourceRef: "doc:REQ-042"
 │                                        ├─ confidence: 0.92
 │                                        ├─ approvedBy: "user:reviewer"
 │                                        ├─ approvedAt: datetime()
 │                                        ├─ schemaVersion: "1.0"
 │                                        ├─ changeReason: "Уточнение порога"
 │                                        ├─ diffFromPrevious: "{...patch...}"
 │                                        ├─ embedding: [0.12, 0.34, ...]
 │                                        │
 │                                        │  25 свойств
 │                                        │
 │                                        │  Обновление: ЗАПРЕЩЕНО
 │                                        │  Создается НОВАЯ версия
 │                                        │  с ребром SUPERSEDES
 │                                        │
 │                                        │  История: ПОЛНАЯ цепочка
 │                                        │  Аудит: hash chain
 └────────────────────                    └────────────────────────────────
```

### Таблица выбора модели

| Критерий                        | Domain (mutable) | NodeVersion (immutable) |
|---------------------------------|:-----------------:|:-----------------------:|
| Нужна история изменений?        | Нет               | Да                      |
| Аудит критичен?                 | Нет               | Да                      |
| Частота изменений               | Высокая (>10/день)| Низкая-средняя          |
| Данные нормативные/юридические? | Нет               | Да                      |
| Нужно откатить к версии N?      | Невозможно        | Да                      |
| Объём данных на узел            | Малый (5-10 полей)| Большой (25 полей)      |
| Скорость записи                 | Быстрая (SET)     | Медленнее (CREATE+EDGE) |
| Доказуемая целостность          | Нет               | Да (hash chain)         |

### Маппинг меток к моделям

| Label графа       | Модель                  | Обоснование                                              |
|--------------------|-------------------------|----------------------------------------------------------|
| `Table`            | Domain (mutable)        | Техническое описание, часто синхронизируется              |
| `Column`           | Domain (mutable)        | Атрибут Table, обновляется при re-scan                    |
| `Method`           | Domain (mutable)        | Код меняется часто, история в git                        |
| `BusinessRule`     | NodeVersion (immutable) | Нормативный документ, нужен полный аудит                 |
| `Policy`           | NodeVersion (immutable) | Юридически значимый, требует трассируемости              |
| `Requirement`      | NodeVersion (immutable) | Спецификация, нужна история согласований                 |
| `CatalogEntry`     | Domain + GraphVersion   | Сам каталог mutable, но версии графов immutable          |
| `ExecutionRecord`  | Domain (immutable by policy) | Создаётся один раз, не меняется, но без hash chain  |
| `Settings`         | Domain (mutable)        | Конфигурация, история не нужна                           |
| `CoreComponent`    | Domain (mutable)        | Инфраструктурный узел, обновляется при deploy            |

---

## 3.2 Bridge pattern: связь между моделями

### Проблема

Domain-узлы и NodeVersion живут в разных моделях и не связаны напрямую. Метод (domain) может реализовывать бизнес-правило (NodeVersion), но как построить ребро между ними, если версия правила меняется?

### Решение: Stable Entity ID + Version Pointer

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
  │                                     │   │ status:    "ACTIVE"    <── текущая
  │                                     │   │ content:   "{...}"
```

### Правила Bridge pattern

**Правило 1: Используй `entityId`, а не `versionId` для кросс-модельных рёбер.**

```cypher
// ПРАВИЛЬНО: ребро ссылается на entityId
MATCH (m:Method {id: "M-042"})
MATCH (br:NodeVersion {entityId: "BR-001", status: "ACTIVE"})
MERGE (m)-[:IMPLEMENTS {entityId: "BR-001"}]->(br)
```

```cypher
// НЕПРАВИЛЬНО: ребро привязано к конкретной версии
MATCH (m:Method {id: "M-042"})
MATCH (br:NodeVersion {versionId: "BR-001-v3"})
MERGE (m)-[:IMPLEMENTS]->(br)
// При появлении v4 это ребро останется на v3!
```

**Правило 2: При SUPERSEDE -- перелинковка входящих рёбер.**

Когда создаётся новая версия, все входящие кросс-модельные рёбра должны быть перенаправлены на новую ACTIVE-версию:

```javascript
/**
 * Перелинковка входящих рёбер при создании новой версии.
 * Вызывается ПОСЛЕ создания SUPERSEDES-ребра и смены статуса.
 *
 * @param {string} entityId   -- стабильный ID сущности
 * @param {string} oldVersionId -- versionId предыдущей (теперь SUPERSEDED) версии
 * @param {string} newVersionId -- versionId новой ACTIVE-версии
 */
async function relinkIncomingEdges(entityId, oldVersionId, newVersionId) {
  const session = driver.session();
  try {
    // Найти все входящие рёбра к старой версии (кроме SUPERSEDES)
    const result = await session.run(`
      MATCH (source)-[r]->(old:NodeVersion {versionId: $oldVersionId})
      WHERE type(r) <> 'SUPERSEDES'
      MATCH (new:NodeVersion {versionId: $newVersionId})
      WITH source, r, old, new, type(r) AS relType, properties(r) AS relProps
      // Создать такое же ребро к новой версии
      CALL {
        WITH source, new, relType, relProps
        WITH source, new, relType, relProps
        CREATE (source)-[newR:IMPLEMENTS]->(new)
        SET newR = relProps
        // Примечание: Memgraph не поддерживает динамические типы рёбер.
        // В реальной системе нужен CASE по relType.
      }
      // Удалить старое ребро
      DELETE r
      RETURN count(*) AS relinked
    `, { oldVersionId, newVersionId });

    return result.records[0].get('relinked');
  } finally {
    await session.close();
  }
}
```

**Правило 3: Перелинковка по типам рёбер (Memgraph-совместимый вариант).**

Поскольку Memgraph не поддерживает динамические типы рёбер в `CREATE`, используем явный маппинг:

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

## 3.3 SUPERSEDES chain: создание, траверс, инварианты

### Структура цепочки

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
           │ (v2 заменяет v1)       │ (v3 заменяет v2)
           │                        │
      (:NodeVersion v2)        (:NodeVersion v3)

  Направление SUPERSEDES: НОВАЯ -[:SUPERSEDES]-> СТАРАЯ
  Чтение цепочки: от ACTIVE назад по SUPERSEDES
```

### Код создания новой версии

```javascript
const crypto = require('crypto');

/**
 * Создаёт следующую версию сущности в SUPERSEDES-цепочке.
 *
 * @param {string} entityId    -- стабильный ID сущности
 * @param {object} newContent  -- новое содержимое версии
 * @param {object} meta        -- метаданные (author, changeReason, и т.д.)
 * @returns {object}           -- созданная NodeVersion
 */
async function createNextVersion(entityId, newContent, meta = {}) {
  const session = driver.session();
  try {
    // 1. Найти текущую ACTIVE-версию
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

    // 2. Вычислить hash chain
    const contentStr = JSON.stringify(newContent, Object.keys(newContent).sort());
    const newHash = crypto
      .createHash('sha256')
      .update(currentHash + '|' + contentStr)
      .digest('hex');

    const newSeq = currentSeq + 1;
    const newVersionId = `${entityId}-v${newSeq}`;

    // 3. Вычислить diff от предыдущей версии
    const previousContent = JSON.parse(activeNode.content || '{}');
    const diff = computeDiff(previousContent, newContent);

    // 4. Атомарная транзакция: создать новую версию + SUPERSEDES + обновить статус
    const result = await session.run(`
      // Пометить текущую как SUPERSEDED
      MATCH (old:NodeVersion {versionId: $currentVersionId})
      SET old.status = "SUPERSEDED"
      SET old.supersededAt = datetime()

      // Создать новую версию
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

      // Создать SUPERSEDES-ребро (новая -> старая)
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

    // 5. Перелинковать Bridge-рёбра
    await relinkAllBridgeEdges(entityId, currentVersionId, newVersionId);

    return newNode;
  } finally {
    await session.close();
  }
}

/**
 * Простой diff между двумя объектами.
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

### Cypher-запросы для обхода цепочки

**Получить полную историю сущности (от новейшей к старейшей):**

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

**Найти версию, актуальную на определённую дату:**

```cypher
MATCH (v:NodeVersion {entityId: $entityId})
WHERE v.validFrom <= $targetDate
  AND (v.validUntil IS NULL OR v.validUntil > $targetDate)
RETURN v
ORDER BY v.sequenceNumber DESC
LIMIT 1
```

**Проверить целостность hash chain:**

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

### Инварианты SUPERSEDES-цепочки

| # | Инвариант                                         | Проверка                                                   |
|---|---------------------------------------------------|------------------------------------------------------------|
| 1 | Ровно одна ACTIVE-версия на `entityId`            | `COUNT(status="ACTIVE") = 1` для каждого entityId          |
| 2 | Нет циклов в цепочке SUPERSEDES                   | DFS-обход не возвращается к посещённому узлу                |
| 3 | `sequenceNumber` строго возрастает по SUPERSEDES   | Каждая `newer.seqNum > older.seqNum`                       |
| 4 | `previousHash` совпадает с `contentHash` предка    | `newer.previousHash === older.contentHash`                  |
| 5 | Первая версия (seqNum=1) имеет `previousHash=null`| Начало цепочки не ссылается на предыдущий hash             |
| 6 | SUPERSEDED-версия не имеет входящих Bridge-рёбер  | Все IMPLEMENTS/REFERENCES указывают только на ACTIVE        |

**Cypher-запрос для проверки инварианта 1:**

```cypher
MATCH (v:NodeVersion {status: "ACTIVE"})
WITH v.entityId AS eid, count(*) AS cnt
WHERE cnt > 1
RETURN eid, cnt
// Результат должен быть пустым
```

**Cypher-запрос для проверки инварианта 3:**

```cypher
MATCH (newer:NodeVersion)-[:SUPERSEDES]->(older:NodeVersion)
WHERE newer.sequenceNumber <= older.sequenceNumber
RETURN newer.versionId AS invalid, newer.sequenceNumber AS newerSeq, older.sequenceNumber AS olderSeq
// Результат должен быть пустым
```

---

## 3.4 Merge / Split / Fork

### MERGE: объединение двух сущностей в одну

**Сценарий:** Две бизнес-правила (BR-010, BR-011) оказались дублями и должны быть объединены.

```
  BEFORE MERGE:
  ─────────────

  (:NodeVersion)                    (:NodeVersion)
  │ entityId: "BR-010"              │ entityId: "BR-011"
  │ versionId: "BR-010-v2"          │ versionId: "BR-011-v3"
  │ status: ACTIVE                  │ status: ACTIVE
  │ content: "Правило А"            │ content: "Правило Б"


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
  │                 │ content: "Объединённое"│
  │                 └────────────────────────┘
```

**Код MERGE:**

```javascript
/**
 * Объединение двух сущностей в одну.
 * Результат: новая версия primaryEntityId, содержащая данные обеих.
 * Вторая сущность получает статус MERGED.
 *
 * @param {string} primaryEntityId   -- entityId, который остаётся
 * @param {string} secondaryEntityId -- entityId, который вливается
 * @param {object} mergedContent     -- объединённое содержимое
 * @param {object} meta              -- метаданные
 */
async function mergeEntities(primaryEntityId, secondaryEntityId, mergedContent, meta = {}) {
  const session = driver.session();
  try {
    // 1. Создать новую версию primary с объединённым содержимым
    const newVersion = await createNextVersion(primaryEntityId, mergedContent, {
      ...meta,
      changeReason: `MERGE: ${secondaryEntityId} merged into ${primaryEntityId}`,
      metadata: {
        ...(meta.metadata || {}),
        mergedFromIds: [primaryEntityId, secondaryEntityId],
        mergeType: 'ABSORB'
      }
    });

    // 2. Пометить ACTIVE-версию secondary как MERGED
    await session.run(`
      MATCH (v:NodeVersion {entityId: $secondaryEntityId, status: "ACTIVE"})
      SET v.status = "MERGED"
      SET v.mergedInto = $primaryEntityId
      SET v.mergedAt = datetime()
    `, { secondaryEntityId, primaryEntityId });

    // 3. Создать MERGED_FROM-ребро
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

    // 4. Перенаправить все Bridge-рёбра secondary на новую версию primary
    await relinkAllBridgeEdges(secondaryEntityId,
      `${secondaryEntityId}-v*`, // все версии
      newVersion.versionId);

    return newVersion;
  } finally {
    await session.close();
  }
}
```

### SPLIT: разделение сущности на две

**Сценарий:** Бизнес-правило BR-020 слишком сложное и разделяется на BR-020 (часть А) и BR-021 (часть Б).

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
  │ entityId: "BR-020"                      │ entityId: "BR-021"        <── НОВЫЙ entityId
  │ versionId: "BR-020-v5"                  │ versionId: "BR-021-v1"
  │ status: ACTIVE                          │ status: ACTIVE
  │ content: "Часть А"                      │ content: "Часть Б"
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

**Код SPLIT:**

```javascript
/**
 * Разделение сущности на две.
 * Оригинальный entityId получает новую версию (часть A).
 * Создаётся новый entityId для части B.
 *
 * @param {string} entityId     -- исходный entityId
 * @param {object} contentPartA -- содержимое для оригинальной сущности
 * @param {object} contentPartB -- содержимое для новой сущности
 * @param {string} newEntityId  -- entityId для новой сущности
 * @param {object} meta         -- метаданные
 */
async function splitEntity(entityId, contentPartA, contentPartB, newEntityId, meta = {}) {
  const session = driver.session();
  try {
    // 1. Получить текущую ACTIVE-версию
    const current = await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "ACTIVE"})
      RETURN v.versionId AS vid
    `, { entityId });

    const sourceVersionId = current.records[0].get('vid');

    // 2. Создать новую версию A (обновление оригинала)
    const versionA = await createNextVersion(entityId, contentPartA, {
      ...meta,
      changeReason: `SPLIT: extracted ${newEntityId} from ${entityId}`,
      metadata: {
        ...(meta.metadata || {}),
        splitInfo: { type: 'SPLIT_KEPT', extractedEntityId: newEntityId }
      }
    });

    // 3. Создать первую версию B (новая сущность)
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

### FORK: ветвление для альтернатив

**Сценарий:** Нужно создать альтернативную версию правила BR-030 для другого региона/контекста. Оригинал остаётся, создаётся независимая ветка.

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
  │ entityId: "BR-030"                      │ entityId: "BR-030-EU"     <── НОВЫЙ entityId
  │ versionId: "BR-030-v2"                  │ versionId: "BR-030-EU-v1"
  │ status: ACTIVE                          │ status: ACTIVE
  │ content: "Глобальное правило"            │ content: "Правило для EU"
  │                                         │ forkedFromId: "BR-030"
  │ (без изменений!)                        │ forkedFromVersion: "BR-030-v2"
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

**Отличие FORK от SPLIT:**
- **SPLIT** -- оригинал меняется (получает новую версию), оба entityId содержат части исходного.
- **FORK** -- оригинал НЕ меняется, новый entityId начинает независимую жизнь.

**Код FORK:**

```javascript
/**
 * Создание форка сущности.
 * Оригинал остаётся без изменений.
 * Создаётся новый entityId с начальным содержимым, скопированным из оригинала.
 *
 * @param {string} sourceEntityId  -- entityId оригинала
 * @param {string} forkEntityId   -- entityId для форка
 * @param {object} modifications  -- изменения относительно оригинала (опционально)
 * @param {object} meta           -- метаданные
 */
async function forkEntity(sourceEntityId, forkEntityId, modifications = {}, meta = {}) {
  const session = driver.session();
  try {
    // 1. Получить текущую ACTIVE-версию оригинала
    const current = await session.run(`
      MATCH (v:NodeVersion {entityId: $sourceEntityId, status: "ACTIVE"})
      RETURN v
    `, { sourceEntityId });

    if (current.records.length === 0) {
      throw new Error(`No ACTIVE version for entityId: ${sourceEntityId}`);
    }

    const source = current.records[0].get('v').properties;
    const sourceContent = JSON.parse(source.content || '{}');

    // 2. Применить модификации к содержимому
    const forkContent = { ...sourceContent, ...modifications };
    const contentStr = JSON.stringify(forkContent, Object.keys(forkContent).sort());
    const hash = crypto.createHash('sha256').update(contentStr).digest('hex');

    // 3. Создать первую версию форка
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

## 3.5 God Mode: контролируемое нарушение immutability

### Операции, требующие God Mode

| Операция                        | Причина необходимости God Mode                              | Уровень риска |
|---------------------------------|-------------------------------------------------------------|:-------------:|
| Удаление версии из цепочки      | Нарушает hash chain и SUPERSEDES-связность                  | CRITICAL      |
| Модификация contentHash         | Разрушает доказуемую целостность всей цепочки               | CRITICAL      |
| Изменение исторического времени | Нарушает хронологическую последовательность                  | HIGH          |
| Полная очистка (purge) сущности | Удаляет все версии и связи, необратимо                      | CRITICAL      |
| Исправление повреждённой цепочки| Пересчёт хешей, восстановление SUPERSEDES-рёбер             | HIGH          |
| Смена entityId                  | Ломает все Bridge-рёбра и внешние ссылки                    | HIGH          |
| Откат статуса MERGED/DELETED    | Возврат сущности из терминального состояния                  | MEDIUM        |

### GodModeSession

```javascript
const crypto = require('crypto');

/**
 * Сессия God Mode с таймаутом, верификацией и аудитом.
 * Все действия внутри сессии записываются в hash chain аудита.
 */
class GodModeSession {
  /**
   * @param {string} adminId         -- ID администратора
   * @param {string} reason          -- обоснование активации God Mode
   * @param {number} timeoutMinutes  -- таймаут сессии (по умолчанию 30 мин)
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
   * Проверить, что администратор имеет право на God Mode.
   * В реальной системе -- проверка роли, 2FA, approval workflow.
   */
  static async verifyAdmin(adminId) {
    // TODO: интеграция с IAM
    const ADMIN_IDS = ['user:superadmin', 'user:dba', 'agent:system-repair'];
    if (!ADMIN_IDS.includes(adminId)) {
      throw new Error(`Admin verification failed for: ${adminId}`);
    }
    return true;
  }

  /**
   * Создать и верифицировать новую God Mode сессию.
   */
  static async create(adminId, reason, timeoutMinutes = 30) {
    await GodModeSession.verifyAdmin(adminId);
    const session = new GodModeSession(adminId, reason, timeoutMinutes);

    // Записать открытие сессии в аудит
    await session._recordAudit('SESSION_OPENED', {
      adminId,
      reason,
      timeoutMinutes,
      sessionId: session.sessionId
    });

    return session;
  }

  /**
   * Проверить, что сессия всё ещё активна.
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
   * Выполнить действие в God Mode.
   * Каждое действие записывается в hash chain аудита.
   *
   * @param {string}   actionType -- тип действия (DELETE_VERSION, MODIFY_HASH, и т.д.)
   * @param {object}   params     -- параметры действия
   * @param {Function} executor   -- функция, выполняющая действие
   * @returns {*}                 -- результат executor
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
      // Выполнить действие
      const result = await executor();

      actionRecord.status = 'SUCCESS';
      actionRecord.result = result;

      // Записать в hash chain аудита
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
   * Закрыть сессию God Mode.
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
   * Записать запись аудита с hash chain.
   * Каждая запись содержит hash предыдущей, образуя неразрывную цепочку.
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

    // Сохранить в граф знаний
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

**Пример использования God Mode:**

```javascript
// Исправление повреждённой hash chain
async function repairHashChain(entityId) {
  const godMode = await GodModeSession.create('user:superadmin',
    `Repair corrupted hash chain for ${entityId}`);

  try {
    await godMode.execute('REPAIR_HASH_CHAIN', { entityId }, async () => {
      const session = driver.session();
      try {
        // Получить все версии по порядку
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

          // GOD MODE: модификация hash (обычно запрещено)
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

## 3.6 Tombstones: soft delete с возможностью восстановления

### Soft Delete

При удалении версии она не уничтожается физически, а помечается как DELETED. Создаётся узел Tombstone, который хранит метаданные для возможного восстановления.

**Код soft delete:**

```javascript
/**
 * Мягкое удаление сущности.
 * Создаёт Tombstone, помечает ACTIVE-версию как DELETED,
 * сохраняет осиротевшие рёбра для возможного восстановления.
 * Окно восстановления: 90 дней.
 *
 * @param {string} entityId -- entityId удаляемой сущности
 * @param {string} reason   -- причина удаления
 * @param {string} deletedBy -- кто удаляет
 */
async function softDelete(entityId, reason, deletedBy) {
  const session = driver.session();
  try {
    const tombstoneId = `tombstone:${entityId}:${Date.now()}`;
    const restoreDeadline = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 дней

    // 1. Собрать информацию об осиротевших рёбрах (до удаления)
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

    // 2. Создать Tombstone
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

    // 3. Пометить ACTIVE-версию как DELETED
    await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "ACTIVE"})
      SET v.status = "DELETED"
      SET v.deletedAt = datetime()
      SET v.deletedBy = $deletedBy
      SET v.tombstoneId = $tombstoneId
    `, { entityId, deletedBy, tombstoneId });

    // 4. Удалить осиротевшие Bridge-рёбра (данные уже в Tombstone)
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

### Восстановление из Tombstone

```javascript
/**
 * Восстановление сущности из Tombstone.
 * Возвращает статус ACTIVE, восстанавливает Bridge-рёбра.
 *
 * @param {string} tombstoneId -- ID tombstone для восстановления
 */
async function restoreFromTombstone(tombstoneId) {
  const session = driver.session();
  try {
    // 1. Проверить, что Tombstone существует и не истёк
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

    // 2. Восстановить статус ACTIVE
    await session.run(`
      MATCH (v:NodeVersion {entityId: $entityId, status: "DELETED", tombstoneId: $tombstoneId})
      SET v.status = "ACTIVE"
      REMOVE v.deletedAt
      REMOVE v.deletedBy
      REMOVE v.tombstoneId
      SET v.restoredAt = datetime()
      SET v.restoredFrom = $tombstoneId
    `, { entityId, tombstoneId });

    // 3. Восстановить Bridge-рёбра
    let restoredEdges = 0;
    for (const edge of orphanedEdges) {
      try {
        // Найти source-узел (может быть Domain или NodeVersion)
        const sourceMatch = edge.sourceVersionId
          ? `(s:NodeVersion {versionId: "${edge.sourceVersionId}"})`
          : edge.sourceId
            ? `(s {id: "${edge.sourceId}"})`
            : null;

        if (!sourceMatch) continue;

        // Memgraph: нужен явный тип ребра
        const edgeType = edge.relType;
        if (!['IMPLEMENTS', 'REFERENCES', 'GOVERNED_BY', 'DERIVED_FROM'].includes(edgeType)) {
          continue; // Не восстанавливаем неизвестные типы
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
        // Source-узел мог быть удалён -- пропускаем
        console.warn(`Could not restore edge: ${err.message}`);
      }
    }

    // 4. Пометить Tombstone как использованный
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

### Жизненный цикл Tombstone

```
  (:NodeVersion)                                (:Tombstone)
  │ status: ACTIVE                              │ status: PENDING
  │                                             │ restoreDeadline: +90 дней
  │                                             │
  ├──── soft delete ────────────────────────────>│
  │                                             │
  │ status: DELETED                             │
  │ tombstoneId: "tombstone:..."                │
  │                                             │
  │         Два возможных исхода:               │
  │                                             │
  │    [A] Восстановление (до дедлайна):        │
  │         │                                   │
  │         ├── restore ────────────────────────>│ status: RESTORED
  │         │                                   │ restoredAt: datetime()
  │         v                                   │
  │  status: ACTIVE                             │
  │  restoredAt: datetime()                     │
  │  restoredFrom: "tombstone:..."              │
  │                                             │
  │    [B] Истечение срока (после 90 дней):      │
  │         │                                   │
  │         ├── expire cron ────────────────────>│ status: EXPIRED
  │         │                                   │ expiredAt: datetime()
  │         v                                   │
  │  status: DELETED (permanent)                │
  │  (данные для физической очистки)             │
  │                                             │
  └─────────────────────────────────────────────┘

  Сводка переходов:

    ACTIVE ──[soft delete]──> DELETED + Tombstone(PENDING)
    DELETED ──[restore]─────> ACTIVE  + Tombstone(RESTORED)
    DELETED ──[expire 90d]──> DELETED + Tombstone(EXPIRED) ──[purge]──> физическое удаление
```

**Cron-задача для обработки истёкших Tombstone:**

```javascript
/**
 * Обработка истёкших Tombstone.
 * Запускается по расписанию (ежедневно).
 * Помечает истёкшие Tombstone как EXPIRED.
 * Физическое удаление -- отдельный процесс, требующий God Mode.
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

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*

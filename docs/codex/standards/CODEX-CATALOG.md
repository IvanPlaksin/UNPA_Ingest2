# CODEX-CATALOG: Стандарт каталога GXE

**Статус:** 🟡 Черновик
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Преамбула

Каталог -- единая точка истины о всех графах в системе UN ProjectAdvisor. Без каталога графы становятся разрозненными артефактами: дублируются, теряются, не переиспользуются. С каталогом -- это управляемая библиотека с версионностью, дедупликацией и интеллектуальным поиском.

Настоящий стандарт определяет:
- схему `CatalogEntry` и связанных узлов,
- политику автоматического сохранения графов,
- механизмы дедупликации (exact, structural, semantic),
- четыре режима поиска (keyword, structural, GNN, hybrid),
- стратегии переиспользования графов,
- жизненный цикл паттернов и их продвижение в шаблоны.

Реализация: `api/src/services/graphCatalog.service.js`

---

## 6.1. CatalogEntry schema

### Структура графа каталога

Каталог организован как иерархическое дерево узлов в Memgraph. Каждый граф представлен тройкой `CatalogEntry -> GraphDefinition -> GraphVersion`, где CatalogEntry -- реестровая запись, GraphDefinition -- определение (узлы + рёбра), а GraphVersion -- конкретная версия снимка.

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

Дополнительные связи иерархии:

```
(:CatalogEntry)-[:CHILD_OF]->(:CatalogEntry)           # Родительская иерархия
(:CatalogEntry)-[:DECOMPOSES {nodeId}]->(:CatalogEntry) # Декомпозиция узла в подграф
```

### Полная схема CatalogEntry

| Поле           | Тип        | Обязательно | Описание                                  | Пример                          |
|----------------|------------|-------------|-------------------------------------------|---------------------------------|
| `entryId`      | `string`   | Да          | Глобально уникальный идентификатор (UUID) | `"a1b2c3d4-e5f6-..."`          |
| `name`         | `string`   | Да          | Человекочитаемое имя графа                | `"IT Hardware Request"`         |
| `type`         | `string`   | Да          | Тип графа (см. CATALOG_TYPES)             | `"business"`                    |
| `namespace`    | `string`   | Да          | Пространство имён (изоляция данных)       | `"un-pa"`, `"default"`          |
| `description`  | `string`   | Нет         | Краткое описание назначения графа          | `"Процесс запроса оборудования"`|
| `tags`         | `string[]` | Нет         | Теги для поиска и классификации            | `["ineed", "hardware", "it"]`   |
| `visibility`   | `string`   | Да          | Уровень видимости (см. ниже)              | `"PUBLIC"`                      |
| `qualityScore` | `number`   | Нет         | Оценка качества (0.0 -- 1.0)              | `0.85`                          |
| `createdAt`    | `string`   | Да          | ISO 8601 timestamp создания               | `"2026-03-12T14:30:00.000Z"`   |
| `updatedAt`    | `string`   | Да          | ISO 8601 timestamp последнего обновления  | `"2026-03-12T15:00:00.000Z"`   |
| `createdBy`    | `string`   | Нет         | Автор создания                            | `"system"`, `"user-123"`        |
| `currentVersion` | `number` | Да         | Номер текущей версии (целое число)        | `3`                             |
| `usageCount`   | `number`   | Нет         | Счётчик использований                     | `42`                            |
| `isPublic`     | `boolean`  | Нет         | Флаг публичности (для обратной совместимости) | `true`                      |

### Схема GraphDefinition

| Поле            | Тип      | Описание                                          |
|-----------------|----------|---------------------------------------------------|
| `graphId`       | `string` | UUID определения                                  |
| `nodes`         | `string` | JSON-строка массива узлов графа                   |
| `edges`         | `string` | JSON-строка массива рёбер графа                   |
| `requiredParams`| `string` | JSON-строка параметров, необходимых для запуска    |
| `toolIds`       | `string[]`| Список идентификаторов инструментов               |
| `nodeCount`     | `number` | Количество узлов                                  |
| `edgeCount`     | `number` | Количество рёбер                                  |
| `topology`      | `string` | Классификация топологии (`PIPELINE`, `DAG`, `TREE`)|
| `contentHash`   | `string` | SHA-256 от отсортированного JSON узлов и рёбер    |
| `validatedAt`   | `string` | Время последней валидации                         |
| `wasAutoFixed`  | `boolean`| Был ли граф автоматически исправлен               |

### Схема GraphVersion

| Поле            | Тип      | Описание                                         |
|-----------------|----------|--------------------------------------------------|
| `versionId`     | `string` | UUID версии                                      |
| `versionNumber` | `number` | Целочисленный номер версии (1, 2, 3...)          |
| `changelog`     | `string` | Описание изменений                               |
| `createdAt`     | `string` | ISO 8601 timestamp создания версии               |
| `createdBy`     | `string` | Автор версии                                     |
| `contentHash`   | `string` | SHA-256 хеш содержимого этой версии              |

### CATALOG_TYPES -- допустимые типы графов

```javascript
const CATALOG_TYPES = {
  BUSINESS:  'business',   // Бизнес-процессы (iNeed, onboarding, approval)
  TECHNICAL: 'technical',  // Технические пайплайны (ETL, extraction, deployment)
  META:      'meta',       // Мета-графы, управляющие другими графами
  TEMPLATE:  'template',   // Шаблоны для создания новых графов
  COMPOSITE: 'composite',  // Составные графы, содержащие подграфы
};
```

| Тип          | Назначение                                            | Пример                          |
|--------------|-------------------------------------------------------|---------------------------------|
| `business`   | Моделирует бизнес-процесс от начала до конца          | iNeed Hardware Request          |
| `technical`  | Технический пайплайн обработки данных                 | SQL Extraction Pipeline         |
| `meta`       | Оркестрирует другие графы, управляет маршрутизацией    | iNeed META Intake               |
| `template`   | Параметризованный шаблон для клонирования              | Generic Approval Workflow       |
| `composite`  | Агрегирует несколько подграфов через DECOMPOSES         | Full Onboarding Process         |

> **CATALOG003:** Попытка создать CatalogEntry с типом, отсутствующим в `CATALOG_TYPES`, приводит к ошибке `CATALOG003: Invalid type enum`.

### Уровни видимости (Visibility)

| Уровень    | Описание                                                        | Кто видит                          |
|------------|----------------------------------------------------------------|-------------------------------------|
| `PUBLIC`   | Доступен всем пользователям и агентам системы                  | Все                                 |
| `INTERNAL` | Доступен только внутри namespace                                | Участники namespace                 |
| `PRIVATE`  | Доступен только автору и администраторам                        | Автор + admin                       |

### Cypher: создание CatalogEntry

```cypher
// Создание новой записи каталога
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

// Связь с CatalogRoot
MATCH (root:CatalogRoot {id: 'catalog-root'})
MATCH (c:CatalogEntry {entryId: $entryId})
MERGE (root)-[:CONTAINS]->(c)
```

### Cypher: запрос CatalogEntry с последней версией

```cypher
MATCH (c:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
OPTIONAL MATCH (c)-[:CHILD_OF]->(parent:CatalogEntry)
RETURN c, d, v, parent.entryId AS parentId
ORDER BY v.versionNumber DESC
LIMIT 1
```

### Cypher: список всех графов в namespace

```cypher
MATCH (c:CatalogEntry)
WHERE c.namespace = $namespace
  AND c.visibility IN ['PUBLIC', 'INTERNAL']
RETURN c.entryId AS id, c.name, c.type, c.description,
       c.tags, c.currentVersion, c.qualityScore
ORDER BY c.updatedAt DESC
```

### Индексы

Обязательные индексы для производительности каталога:

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

### Когда граф сохраняется автоматически

Каталог не требует явного действия «Сохранить» от пользователя. Графы сохраняются автоматически в трёх сценариях:

```
┌───────────────────────────────────────────────────────────────────────┐
│                     ТРИГГЕРЫ AUTO-SAVE                                │
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

| Триггер           | Метод                           | Что создаётся                               |
|--------------------|---------------------------------|----------------------------------------------|
| Создание графа     | `createGraph(data)`             | CatalogEntry + GraphDefinition + GraphVersion v1 |
| Новая версия       | `createVersion(entryId, data)`  | Новые GraphDefinition + GraphVersion vN+1, SUPERSEDES |
| SQL Import         | `mssql.import-orchestrator.js`  | Новый CatalogEntry для каждого импортированного графа |
| GraphLoader startup| `graph-loader.service.js`       | CatalogEntry для предзагруженных графов (iNeed, SQL Extraction) |

### GXE godMode -- два режима сохранения

Поведение GXE-редактора при сохранении зависит от режима `godMode`:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   godMode: OFF (обычный режим)          godMode: ON (God Mode)  │
│   ────────────────────────                ──────────────────────  │
│                                                                 │
│   Пользователь нажимает "Save"          Пользователь нажимает   │
│           │                             "Save"                   │
│           ▼                                    │                 │
│   createVersion(entryId, data)                 ▼                 │
│           │                             updateGraph(id, data)    │
│           ▼                                    │                 │
│   ┌──────────────────┐                         ▼                 │
│   │ GraphVersion N+1 │                 ┌──────────────────┐      │
│   │ + SUPERSEDES     │                 │ In-place SET     │      │
│   │ + новый Definition│                │ на GraphDefinition│      │
│   └──────────────────┘                 │ (без новой версии)│     │
│                                        └──────────────────┘      │
│   История СОХРАНЯЕТСЯ                  История НЕ сохраняется    │
│   Откат возможен                       Откат невозможен          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **godMode OFF** -- рекомендуемый режим. Каждое сохранение создаёт новую версию (`createVersion`). Граф становится иммутабельным после сохранения. История изменений полностью сохраняется.

- **godMode ON** -- режим для быстрого прототипирования. Обновляет GraphDefinition на месте (`updateGraph`). Не создаёт новую версию. Используется только в процессе разработки.

> **CATALOG004:** При конкурентном обновлении одной и той же CatalogEntry двумя пользователями одновременно возникает ошибка `CATALOG004: Version conflict`. Система использует `currentVersion` как optimistic lock.

### GraphLoader -- автосохранение при старте

При запуске сервера `GraphLoaderService` загружает предопределённые графы из файлов и создаёт для каждого `CatalogEntry`:

```javascript
// graph-loader.service.js -- упрощённый фрагмент
async loadGraph(graphDef) {
  const dag = { nodes: graphDef.nodes, edges: graphDef.edges };

  // 1. Сохранить в PatternLibrary (in-memory кеш)
  this._patternLibrary.register(graphDef.id, dag);

  // 2. Сохранить метаданные в Memgraph
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

Предзагружаемые графы:

| ID графа                              | Тип       | Узлов | Рёбер |
|----------------------------------------|-----------|-------|-------|
| `INEED-G0-META-INTAKE-V1`             | meta      | 16    | 16    |
| `INEED-G1-IT-HARDWARE-V1`             | business  | 22    | 22    |
| `INEED-G2-HR-ACCESS-V1`               | business  | 13    | 13    |
| `INEED-G3-FACILITIES-WORKSPACE-V1`    | business  | 12    | 12    |
| `CORE-SQL-EXTRACTION-META-V1`         | technical | --    | --    |
| `CORE-SQL-PROCEDURE-ANALYSIS-V1`      | technical | --    | --    |

### Cypher: создание версии с SUPERSEDES

```cypher
// Шаг 1: Получить текущую версию
MATCH (c:CatalogEntry {entryId: $entryId})
RETURN c.currentVersion AS currentVersion

// Шаг 2: Обновить номер текущей версии
MATCH (c:CatalogEntry {entryId: $entryId})
SET c.updatedAt = datetime(), c.currentVersion = $versionNumber

// Шаг 3: Создать новые GraphDefinition и GraphVersion
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

// Шаг 4: Связать с CatalogEntry
MATCH (c:CatalogEntry {entryId: $entryId})
MATCH (g:GraphDefinition {graphId: $graphId})
MATCH (v:GraphVersion {versionId: $versionId})
CREATE (c)-[:DEFINES]->(g)
CREATE (g)-[:HAS_VERSION]->(v)

// Шаг 5: Создать SUPERSEDES ребро к предыдущей версии
MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(prev:GraphVersion)
WHERE prev.versionNumber = $versionNumber - 1
MATCH (v:GraphVersion {versionId: $versionId})
CREATE (v)-[:SUPERSEDES]->(prev)
```

---

## 6.3. Deduplication

### Проблема

Без дедупликации каталог быстро заполняется дубликатами: один и тот же пайплайн, сохранённый разными пользователями, или импортированный повторно из того же источника. Дедупликация обеспечивает единственность каждого графа в каталоге.

### Трёхуровневая стратегия дедупликации

```
  Новый граф
      │
      ▼
┌─────────────────────────────────┐
│ Level 1: EXACT MATCH            │
│ contentHash == существующий?     │
│                                 │
│ SHA-256(sorted(nodes + edges))  │
│ O(1) поиск по индексу           │
├─────────────┬───────────────────┘
│  Совпал     │  Не совпал
│             ▼
│  ┌─────────────────────────────────┐
│  │ Level 2: STRUCTURAL MATCH       │
│  │ Jaccard(toolIds_A, toolIds_B)   │
│  │          >= 0.85 ?              │
│  │                                 │
│  │ Сравнение топологии, node count,│
│  │ edge count, toolId overlap      │
│  ├─────────────┬───────────────────┘
│  │  Совпал     │  Не совпал
│  │             ▼
│  │  ┌─────────────────────────────────┐
│  │  │ Level 3: SEMANTIC MATCH (GNN)   │
│  │  │ cosine(embedding_A, embedding_B)│
│  │  │          >= threshold ?         │
│  │  │                                 │
│  │  │ GNN graph embeddings            │
│  │  │ Threshold: настраиваемый        │
│  │  │ (default: 0.90)                 │
│  │  ├─────────────┬───────────────────┘
│  │  │  Совпал     │  Не совпал
│  │  │             ▼
│  │  │        ┌────────────┐
│  │  │        │ УНИКАЛЕН   │
│  │  │        │ Создать    │
│  │  │        │ CatalogEntry│
│  │  │        └────────────┘
│  │  ▼
│  ▼
│ ┌────────────────────┐
│ │ ДУБЛИКАТ ОБНАРУЖЕН │
│ │ Вернуть существующий│
│ │ entryId             │
│ └────────────────────┘
▼
```

> **CATALOG005:** При обнаружении дубликата на Level 1 возвращается ошибка `CATALOG005: Dedup collision (identical contentHash exists)` с указанием `existingEntryId`.

### Level 1: Exact Match -- contentHash

Самый быстрый и надёжный уровень. `contentHash` вычисляется как SHA-256 от канонизированного JSON узлов и рёбер:

```javascript
/**
 * Вычисляет contentHash для графа.
 * Используется для exact-match дедупликации.
 *
 * @param {Array} nodes - Массив узлов графа
 * @param {Array} edges - Массив рёбер графа
 * @returns {string} SHA-256 хеш
 */
computeContentHash(nodes, edges) {
  // Сортировка обеспечивает стабильность хеша
  // при изменении порядка узлов/рёбер
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

Поиск по contentHash -- O(1) благодаря индексу:

```cypher
MATCH (d:GraphDefinition {contentHash: $hash})
RETURN d.graphId AS graphId
LIMIT 1
```

### Level 2: Structural Match -- Jaccard Similarity

Если exact match не сработал, проверяется структурное сходство. Основная метрика -- Jaccard coefficient по toolId:

```
           |toolIds_A ∩ toolIds_B|
J(A,B) = ─────────────────────────
           |toolIds_A ∪ toolIds_B|
```

Порог: **J >= 0.85** -- графы считаются структурно идентичными.

Дополнительные сигналы:
- Совпадение топологии (PIPELINE / DAG / TREE)
- Близость по количеству узлов (±20%)
- Совпадение тегов

```javascript
/**
 * Проверяет структурное сходство двух графов.
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

### Level 3: Semantic Match -- GNN Embedding Similarity

Если структурное сравнение недостаточно (графы используют разные инструменты, но решают одну задачу), используются GNN-эмбеддинги:

```javascript
/**
 * Вычисляет семантическое сходство через GNN-сервис.
 *
 * @param {Object} graphA - Граф для сравнения
 * @param {Object} graphB - Эталонный граф
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
    similar: cosine >= 0.90,  // Порог настраивается
    cosine: Math.round(cosine * 1000) / 1000,
  };
}
```

GNN-сервис (порт 5000) вычисляет эмбеддинг каждого графа, затем считает косинусное расстояние:

```
                    Σ(A_i × B_i)
cos(A, B) = ────────────────────────────
              √(Σ A_i²) × √(Σ B_i²)
```

### checkFingerprintCollision

Функция `checkFingerprintCollision()` из `GraphSchemaManager` объединяет все три уровня:

```javascript
/**
 * Проверяет, существует ли дубликат графа в каталоге.
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

### Четыре режима поиска

Каталог поддерживает четыре режима поиска, от простого до интеллектуального:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SEARCH MODES                                    │
│                                                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │  KEYWORD    │  │  STRUCTURAL  │  │  SEMANTIC   │  │   HYBRID     │ │
│  │             │  │              │  │   (GNN)     │  │              │ │
│  │ name LIKE   │  │ Jaccard      │  │ cosine sim  │  │ взвешенная   │ │
│  │ tags CONTAINS│  │ toolId match │  │ embedding   │  │ комбинация   │ │
│  │ description │  │ topology     │  │ space       │  │ всех трёх    │ │
│  │ FULLTEXT    │  │ node count   │  │             │  │              │ │
│  └─────────────┘  └──────────────┘  └────────────┘  └──────────────┘ │
│                                                                        │
│  Скорость: ████    Скорость: ███     Скорость: ██    Скорость: ██    │
│  Качество: ██      Качество: ███     Качество: ████  Качество: █████ │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Keyword Search

Полнотекстовый поиск по имени, описанию и тегам. Использует Cypher CONTAINS и FULLTEXT индексы:

```cypher
// Поиск по ключевым словам
MATCH (c:CatalogEntry)
WHERE c.name CONTAINS $searchTerm
   OR c.description CONTAINS $searchTerm
   OR ANY(tag IN c.tags WHERE tag CONTAINS $searchTerm)
RETURN c.entryId AS id, c.name, c.description, c.type, c.tags
ORDER BY c.qualityScore DESC, c.usageCount DESC
LIMIT $limit
```

Для высоконагруженных сценариев рекомендуется FULLTEXT индекс:

```cypher
// Создание FULLTEXT индекса (выполняется один раз при инициализации)
CALL db.index.fulltext.createNodeIndex(
  'catalog_search',
  ['CatalogEntry'],
  ['name', 'description']
);

// Поиск через FULLTEXT
CALL db.index.fulltext.queryNodes('catalog_search', $searchTerm)
YIELD node, score
RETURN node.entryId AS id, node.name, score
ORDER BY score DESC
LIMIT $limit
```

### 2. Structural Search

Поиск по структурным характеристикам графа: toolId overlap, топология, размер.

```javascript
/**
 * Структурный поиск в каталоге.
 *
 * @param {Object} criteria - { toolIds, topology, minNodes, maxNodes }
 * @returns {Promise<Array>} Отсортированные результаты
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

Поиск по семантическому сходству через GNN graph embeddings. Вычисляет эмбеддинг запроса и находит ближайших соседей в пространстве эмбеддингов:

```javascript
/**
 * Семантический поиск через GNN-сервис.
 *
 * @param {Object} queryGraph - { nodes, edges }
 * @param {number} topK - Количество результатов
 * @returns {Promise<Array>} Ранжированные результаты с cosine score
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

Комбинирует все три режима с настраиваемыми весами:

```
score = w_keyword * S_keyword + w_structural * S_jaccard + w_gnn * S_cosine
```

Веса по умолчанию:

| Компонент        | Вес (w)  | Обоснование                                           |
|------------------|----------|--------------------------------------------------------|
| `w_keyword`      | **0.3**  | Базовый сигнал, быстрый, но шумный                    |
| `w_structural`   | **0.3**  | Надёжный для технических графов с известными toolId    |
| `w_gnn`          | **0.4**  | Наивысший вес: учитывает семантику и структуру         |

```javascript
/**
 * Гибридный поиск в каталоге.
 *
 * @param {Object} query - { searchTerm, toolIds, topology, nodes, edges }
 * @param {Object} weights - { keyword, structural, gnn }
 * @returns {Promise<Array>} Ранжированные результаты
 */
async hybridSearch(query, weights = { keyword: 0.3, structural: 0.3, gnn: 0.4 }) {
  // Параллельный запуск всех трёх режимов
  const [keywordResults, structuralResults, gnnResults] = await Promise.allSettled([
    this.keywordSearch(query.searchTerm),
    this.structuralSearch({ toolIds: query.toolIds, topology: query.topology }),
    this.semanticSearch({ nodes: query.nodes, edges: query.edges }),
  ]);

  // Объединение результатов
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

  // Вычисление финального score
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

### MCP Tools для поиска

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

### Проблема переиспользования

Когда системе нужен новый подграф, существует четыре варианта: создать с нуля, скопировать существующий, расширить шаблон или сослаться на готовый. Неправильный выбор стратегии ведёт к раздуванию каталога (лишние клоны) или хрупким зависимостям (битые ссылки).

### ReuseStrategyResolver

Реализация: `api/src/services/graph/reuse-strategy-resolver.js`

Четыре стратегии переиспользования:

| Стратегия          | Идентификатор       | Описание                                         |
|--------------------|---------------------|--------------------------------------------------|
| **CLONE**          | `CLONE_MODIFY`      | Клонировать граф и модифицировать под задачу      |
| **EXTEND**         | `ABSTRACT_INHERIT`  | Взять шаблон и параметризовать                   |
| **COMPOSE**        | `DIRECT_REUSE`      | Использовать граф как есть (ссылка, без копии)    |
| **REFERENCE**      | `CREATE_NEW`        | Создать новый граф с нуля                        |

### Матрица принятия решений

```
                        Similarity Score
                   0.0        0.5        0.9        1.0
                    │          │          │          │
                    ▼          ▼          ▼          ▼
   ┌────────────────────────────────────────────────────────────┐
   │                                                            │
   │  CREATE_NEW        CLONE_MODIFY       DIRECT_REUSE        │
   │  Создать            Клонировать       Использовать         │
   │  новый граф         и доработать      как есть             │
   │                                                            │
   │  ◄─── 0.0 ─── 0.3 ──── 0.6 ──── 0.9 ──── 1.0 ───►       │
   │       │              │              │                      │
   │       │  Нет         │  Средняя     │  Высокая             │
   │       │  релевантных │  похожесть   │  похожесть           │
   │       │  кандидатов  │              │                      │
   └────────────────────────────────────────────────────────────┘

   Особый случай: если лучший кандидат имеет type='template'
   и score > 0.5 → ABSTRACT_INHERIT (приоритет над остальными)
```

| Условие                                      | Стратегия           | Действие                                  |
|-----------------------------------------------|---------------------|-------------------------------------------|
| `score >= 0.9`                                | `DIRECT_REUSE`      | Ссылка на существующий граф               |
| `0.6 <= score < 0.9`                          | `CLONE_MODIFY`      | Клон + модификация узлов/рёбер            |
| `type = 'template'` И `score > 0.5`          | `ABSTRACT_INHERIT`  | Создание экземпляра из шаблона            |
| `score < 0.6` или нет кандидатов              | `CREATE_NEW`        | Создание нового графа с нуля              |

> **CATALOG006:** Если стратегия переиспользования не соответствует фактическому действию (например, `DIRECT_REUSE` рекомендован, но пользователь модифицировал граф), возникает предупреждение `CATALOG006: Reuse strategy mismatch`.

### Алгоритм выбора стратегии

```
┌──────────────────────────────────────────────────────────────────┐
│                 STRATEGY SELECTION FLOW                            │
│                                                                    │
│  Входные данные:                                                   │
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
│  │ Step 3b: _applyGNNBoost() (опц.)   │                          │
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

### Веса скоринга кандидатов

| Фактор             | Вес    | Описание                                                  |
|---------------------|--------|-----------------------------------------------------------|
| toolId Jaccard      | **0.40** | Пересечение инструментов между графами                  |
| keyword overlap     | **0.25** | Совпадение ключевых слов (name, description, tags)      |
| topology match      | **0.15** | Совпадение топологии (PIPELINE/DAG/TREE)                |
| size proximity      | **0.10** | Близость по количеству узлов (3--20 = 0.8, иначе 0.4)  |
| quality bonus       | **0.10** | Оценка качества графа (qualityScore)                    |

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
    reason: 'string',          // Человекочитаемое обоснование
    sourceGraph: {             // Лучший кандидат (null для CREATE_NEW)
      entryId: 'string',
      name: 'string',
      similarityScore: 'number',
      scoreBreakdown: 'object',
    },
    alternatives: 'object[]',  // Топ-3 альтернативных кандидата
    gnnUsed: 'boolean',        // Был ли использован GNN для бустинга
  }
}
```

---

## 6.6. Pattern promotion

### Два типа PatternLibrary

В системе существуют два независимых хранилища паттернов, работающих на разных уровнях:

```
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│    Runtime PatternLibrary           │   │    Extraction PatternLibrary        │
│    (runtime/learning/)              │   │    (services/patterns/)             │
│                                     │   │                                     │
│  Хранит: DAG-паттерны выполнения    │   │  Хранит: Паттерны извлечения        │
│  Источник: recordExecution()        │   │  Источник: registerEntityPattern()  │
│  Цель: переиспользование графов     │   │  Цель: улучшение извлечения         │
│  Кеш: LRU in-memory + Memgraph     │   │  Кеш: in-memory + domain index      │
│                                     │   │                                     │
│  Файл:                              │   │  Файл:                              │
│  runtime/learning/PatternLibrary.js │   │  services/patterns/pattern-library.js│
└─────────────────────────────────────┘   └─────────────────────────────────────┘
```

### Жизненный цикл паттерна

Паттерн проходит четыре стадии от первого наблюдения до превращения в шаблон каталога:

```
 ┌───────────┐     ┌────────────┐     ┌───────────┐     ┌───────────┐
 │ OBSERVED  │────>│ CANDIDATE  │────>│ PROMOTED  │────>│ TEMPLATE  │
 │           │     │            │     │           │     │           │
 │ count: 1  │     │ count >= 3 │     │ count >= 5│     │ CatalogEntry│
 │ rate: ?   │     │ rate > 0.5 │     │ rate > 0.8│     │ type:template│
 └───────────┘     └────────────┘     └───────────┘     └───────────┘
      │                  │                  │                  │
      │  Первое          │  Повторное       │  Стабильный      │  Зарегистрирован
      │  выполнение      │  подтверждение   │  паттерн         │  в каталоге
```

### Критерии продвижения

| Переход                | Условие                                           | Автоматически |
|------------------------|----------------------------------------------------|---------------|
| OBSERVED → CANDIDATE   | `observationCount >= 3`                            | Да            |
| CANDIDATE → PROMOTED   | `observationCount >= 5` И `successRate > 0.8`      | Да            |
| PROMOTED → TEMPLATE    | Решение администратора или агента                  | Нет           |

### Пороги продвижения

```javascript
const PROMOTION_THRESHOLDS = {
  CANDIDATE: {
    minObservations: 3,     // Минимум наблюдений для кандидата
    minSuccessRate: 0.5,    // Минимальный success rate
  },
  PROMOTED: {
    minObservations: 5,     // Порог для продвижения
    minSuccessRate: 0.8,    // 80%+ успешных выполнений
  },
};
```

### recordExecution() -- запись результата выполнения

Каждое выполнение графа записывается в PatternLibrary для обучения:

```javascript
/**
 * Записывает результат выполнения графа для обучения паттернов.
 *
 * @param {Object} executionResult - Результат RuntimeEngine
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

  // Найти или создать паттерн
  let pattern = this._hashIndex.get(hash);

  if (!pattern) {
    // Новый паттерн — OBSERVED
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

  // Обновить статистику
  pattern.observations++;
  if (success) pattern.successes++;
  else pattern.failures++;
  pattern.successRate = pattern.successes / pattern.observations;
  pattern.lastSeenAt = new Date().toISOString();

  // Проверить продвижение
  this._checkPromotion(pattern);

  // Обновить category cache
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

### _checkPromotion() -- автоматическое продвижение

```javascript
/**
 * Проверяет, готов ли паттерн к продвижению на следующую стадию.
 *
 * @param {Object} pattern - Объект паттерна
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

### registerEntityPattern() -- регистрация паттерна извлечения

Extraction PatternLibrary использует другой API для регистрации паттернов:

```javascript
/**
 * Регистрирует паттерн извлечения сущности.
 *
 * @param {Object} config - Конфигурация паттерна
 * @param {string} config.id - Уникальный ID паттерна
 * @param {string} config.name - Имя паттерна
 * @param {string} config.domain - Домен (sql, javascript, etc.)
 * @param {RegExp[]} config.patterns - Массив регулярных выражений
 * @param {string} config.entityType - Тип извлекаемой сущности
 * @param {number} config.confidence - Базовый confidence (0.0-1.0)
 * @returns {EntityPattern} Зарегистрированный паттерн
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

### Превращение PROMOTED паттерна в CatalogEntry TEMPLATE

Когда паттерн достигает стадии PROMOTED, он может быть зарегистрирован в каталоге как шаблон:

```javascript
/**
 * Превращает продвинутый паттерн в шаблон каталога.
 *
 * @param {Object} pattern - Паттерн со стадией PROMOTED
 * @returns {Promise<{ entryId, name }>}
 */
async promoteToTemplate(pattern) {
  if (pattern.stage !== 'PROMOTED') {
    throw new Error('Only PROMOTED patterns can become templates');
  }

  // Создать CatalogEntry типа 'template'
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

  // Обновить стадию паттерна
  pattern.stage = 'TEMPLATE';
  pattern.catalogEntryId = entry.entryId;

  console.log(`[PatternPromotion] Pattern ${pattern.hash} promoted to TEMPLATE: ${entry.entryId}`);

  return { entryId: entry.entryId, name: entry.name };
}
```

### Cypher: запрос паттернов по стадии

```cypher
// Найти все продвинутые паттерны, готовые к шаблонизации
MATCH (p:ExecutionPattern)
WHERE p.stage = 'PROMOTED'
  AND p.observations >= 5
  AND p.successRate > 0.8
RETURN p.hash, p.category, p.observations, p.successRate, p.createdAt
ORDER BY p.successRate DESC, p.observations DESC
```

---

## Коды ошибок

| Код         | Имя                       | Описание                                                  | HTTP | Действие                              |
|-------------|---------------------------|-----------------------------------------------------------|------|----------------------------------------|
| `CATALOG001`| Entry not found           | CatalogEntry с указанным entryId не найден в каталоге     | 404  | Проверить entryId, возможен soft delete |
| `CATALOG002`| Duplicate entryId         | CatalogEntry с таким entryId уже существует               | 409  | Использовать существующий или сгенерировать новый UUID |
| `CATALOG003`| Invalid type enum         | Указанный тип не входит в CATALOG_TYPES                   | 400  | Использовать: business, technical, meta, template, composite |
| `CATALOG004`| Version conflict          | Конкурентное обновление: currentVersion изменился          | 409  | Перечитать CatalogEntry и повторить операцию |
| `CATALOG005`| Dedup collision           | Граф с идентичным contentHash уже существует в каталоге    | 409  | Вернуть существующий entryId или createVersion |
| `CATALOG006`| Reuse strategy mismatch   | Стратегия переиспользования не соответствует фактическому действию | 422  | Предупреждение, не блокирует операцию |

### Формат ответа ошибки

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

> **CODEX-CATALOG v0.1.0** | Часть VI **Кодекс UN ProjectAdvisor** | Стандарт каталога GXE

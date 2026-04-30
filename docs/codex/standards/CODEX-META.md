# CODEX-META: Стандарт метаданных

> **Status:** 🟡 В разработке | **Version:** 0.1.0 | **Date:** 2026-03-12

---

## 1. Преамбула

Метаданные определяют доверие. Узел без провенанса — это слух.

Каждый факт в графе знаний UN ProjectAdvisor должен нести ответ на три вопроса:
- **Кто** его создал? (агент, пайплайн, пользователь)
- **Когда** он был создан и когда он валиден? (bi-temporal model)
- **Насколько** ему можно доверять? (confidence, hash chain)

Настоящий стандарт основан на:
- **W3C PROV-O** — онтология провенанса (Entity, Activity, Agent)
- **PAV** (Provenance, Authoring and Versioning) — расширение Dublin Core для научных данных
- **Bi-temporal data model** — разделение Transaction Time и Valid Time

Без метаданных граф знаний — это свалка строк. С метаданными — это аудируемый реестр фактов.

---

## 2.1. Обязательные поля — минимальный контракт

Не все узлы несут одинаковую ответственность. Мы вводим три уровня метаданных:

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

### Level 1 — MANDATORY (все узлы)

Абсолютный минимум. Каждый узел в графе обязан иметь эти поля.

| Поле        | Тип      | Описание                              | Пример                                |
|-------------|----------|---------------------------------------|---------------------------------------|
| `id`        | `string` | Глобально уникальный идентификатор    | `"proc-sp_GetUsers-v3"`               |
| `createdAt` | `string` | ISO 8601 timestamp создания           | `"2026-03-12T14:30:00.000Z"`          |
| `namespace` | `string` | Пространство имён (изоляция данных)   | `"un-pa"`, `"client-acme"`            |

### Level 2 — PROVENANCE (извлечённые данные)

Обязателен для любых данных, полученных из внешних источников (SQL, файлы, API).

| Поле                | Тип      | Описание                                       | Пример                                |
|---------------------|----------|-------------------------------------------------|---------------------------------------|
| `sourceType`        | `string` | Тип источника данных                            | `"mssql"`, `"file"`, `"api"`, `"user"` |
| `sourceId`          | `string` | Идентификатор конкретного источника              | `"server01.db.dbo.sp_GetUsers"`       |
| `sourceSystem`      | `string` | Имя системы-источника                           | `"ERP-SAP"`, `"HR-Portal"`           |
| `extractionCycleId` | `string` | UUID цикла извлечения (см. раздел 2.6)          | `"cycle-a1b2c3d4-..."`               |
| `confidence`        | `number` | Уровень доверия к факту (0.0 — 1.0)            | `0.85`                                |

### Level 3 — VERSION (версионируемые узлы)

Обязателен для узлов, которые эволюционируют во времени.

| Поле             | Тип      | Описание                                    | Пример                                |
|------------------|----------|---------------------------------------------|---------------------------------------|
| `versionId`      | `string` | UUID конкретной версии                      | `"ver-f7e8d9c0-..."`                  |
| `entityId`       | `string` | UUID логической сущности (общий для версий) | `"ent-a1b2c3d4-..."`                  |
| `sequenceNumber` | `number` | Порядковый номер версии (1, 2, 3...)        | `3`                                   |
| `status`         | `string` | Статус версии                               | `"ACTIVE"`, `"SUPERSEDED"`, `"DRAFT"` |
| `ttStart`        | `string` | Transaction Time — начало                   | `"2026-03-12T14:30:00.000Z"`          |
| `ttEnd`          | `string` | Transaction Time — конец (null = текущая)   | `null`                                |
| `vtStart`        | `string` | Valid Time — начало                         | `"2026-01-01T00:00:00.000Z"`          |
| `vtEnd`          | `string` | Valid Time — конец (null = бессрочно)        | `null`                                |
| `contentHash`    | `string` | SHA-256 от канонизированного содержимого     | `"sha256:a1b2c3..."`                  |
| `chainHash`      | `string` | SHA-256 от (contentHash + previousHash)     | `"sha256:d4e5f6..."`                  |

### Матрица применения уровней

| Тип сущности        | Level 1 | Level 2 | Level 3 | Обоснование                              |
|----------------------|---------|---------|---------|------------------------------------------|
| Domain nodes         | ✅      | ✅      | —       | Извлечены из источников, но не версионируются индивидуально |
| NodeVersion          | ✅      | ✅      | ✅      | Полная история эволюции с аудитом        |
| CatalogEntry         | ✅      | —       | —       | Реестровая запись, провенанс на уровне связанных версий     |
| ExecutionRecord      | ✅      | —       | —       | Лог выполнения, иммутабельный по природе |
| Relationship (edge)  | ✅      | ✅      | —       | Извлечённые связи требуют провенанса     |
| Settings             | ✅      | —       | —       | Конфигурация, не извлечённые данные      |

### Код определения уровня

```javascript
/**
 * Определяет требуемый уровень метаданных для узла.
 *
 * @param {string} label - Метка узла (Domain, NodeVersion, CatalogEntry и т.д.)
 * @param {object} properties - Свойства узла
 * @returns {{ level: number, missing: string[] }} Требуемый уровень и список недостающих полей
 */
function determineRequiredLevel(label, properties) {
  const L1_FIELDS = ['id', 'createdAt', 'namespace'];
  const L2_FIELDS = ['sourceType', 'sourceId', 'sourceSystem', 'extractionCycleId', 'confidence'];
  const L3_FIELDS = [
    'versionId', 'entityId', 'sequenceNumber', 'status',
    'ttStart', 'contentHash', 'chainHash'
  ];

  // Определяем требуемый уровень по метке
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

  // Собираем обязательные поля для данного уровня
  let requiredFields = [...L1_FIELDS];
  if (requiredLevel >= 2) requiredFields.push(...L2_FIELDS);
  if (requiredLevel >= 3) requiredFields.push(...L3_FIELDS);

  // Находим отсутствующие поля
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

## 2.2. Knowledge Quantum — полная схема

Knowledge Quantum — это атомарная единица знания в графе. Каждый квант содержит 8 блоков метаданных, от обязательных до опциональных.

### Блок 1: Core Identity — Ядро идентификации

```typescript
interface CoreIdentity {
  /** Глобально уникальный идентификатор кванта знания */
  quantumId: string;          // "kq-<uuid>"

  /** Отпечаток содержимого (SHA-256 от канонизированных данных) */
  fingerprint: string;        // "sha256:a1b2c3d4..."

  /** Номер версии (целое число, монотонно возрастающее) */
  version: number;            // 1, 2, 3...

  /** Текущее состояние кванта */
  state: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED' | 'DELETED';

  /** Теги для произвольной классификации */
  tags: string[];             // ["critical", "needs-review", "auto-extracted"]
}
```

### Блок 2: Provenance — Происхождение

```typescript
interface Provenance {
  /** Тип источника */
  sourceType: 'mssql' | 'postgresql' | 'file' | 'api' | 'user' | 'llm' | 'gnn';

  /** Система-источник (имя для человека) */
  sourceSystem: string;       // "ERP-SAP", "HR-Portal", "Git-Monorepo"

  /** Идентификатор объекта в источнике */
  sourceId: string;           // "dbo.sp_GetUsers", "file://docs/arch.md"

  /** Цикл извлечения */
  extraction: {
    cycleId: string;          // "cycle-<uuid>"
    cycleNumber: number;      // Порядковый номер цикла (1, 2, 3...)
    previousCycleId: string | null; // Ссылка на предыдущий цикл
    startedAt: string;        // ISO 8601
    completedAt: string;      // ISO 8601
    pipelineVersion: string;  // "sql-extraction-v2.1"
  };

  /** Метрики качества извлечения */
  quality: {
    confidence: number;       // 0.0 — 1.0
    method: string;           // "ast-parse", "regex", "llm-extract", "gnn-predict"
    validatedBy: string | null; // "human", "cross-reference", null
    validatedAt: string | null;
  };
}
```

### Блок 3: Classification — Классификация

```typescript
interface Classification {
  /** Основной тип сущности */
  primaryType: string;        // "Procedure", "Table", "BusinessRule", "Concept"

  /** Организационная принадлежность */
  org: {
    department: string;       // "IT", "Finance", "HR"
    team: string;             // "Backend", "Data-Engineering"
    project: string;          // "UN-PA", "ACME-Migration"
  };

  /** Домен знаний */
  domain: {
    area: string;             // "database", "business-logic", "infrastructure"
    subArea: string;          // "stored-procedures", "etl", "networking"
  };

  /** Технологический стек */
  tech: {
    language: string;         // "T-SQL", "JavaScript", "Python"
    framework: string | null; // "Express", "React", null
    platform: string;         // "SQL Server 2019", "Node.js 20"
  };

  /** Волатильность — как часто данные меняются */
  volatility: 'STATIC' | 'SLOW' | 'MODERATE' | 'FAST' | 'REALTIME';
}
```

### Блок 4: Semantic Context — Семантический контекст

```typescript
interface SemanticContext {
  /** Человекочитаемый заголовок */
  title: string;              // "Процедура получения пользователей"

  /** Краткое описание (1-3 предложения) */
  summary: string;            // "Извлекает активных пользователей с фильтрацией по отделу..."

  /** Ключевые слова для поиска */
  keywords: string[];         // ["users", "authentication", "department-filter"]

  /** Именованные сущности, извлечённые NER */
  entities: {
    name: string;             // "sp_GetUsers"
    type: string;             // "PROCEDURE", "TABLE", "COLUMN"
    span: [number, number];   // Позиция в исходном тексте [start, end]
  }[];

  /** Векторное представление (embedding) */
  embedding: {
    model: string;            // "bge-m3", "text-embedding-3-small"
    dimensions: number;       // 1024, 384
    vector: number[];         // Float32 array
    computedAt: string;       // ISO 8601
  } | null;
}
```

### Блок 5: Relationships — Связи

```typescript
interface Relationships {
  /** Явные связи (извлечённые из источника) */
  explicit: {
    type: string;             // "CALLS", "REFERENCES", "OPERATES_ON"
    targetId: string;         // ID целевого узла
    confidence: number;       // 0.0 — 1.0
    sourceEvidence: string;   // "EXEC dbo.sp_Helper" (фрагмент кода)
  }[];

  /** Предсказанные связи (GNN link prediction) */
  inferred: {
    type: string;             // "LIKELY_CALLS", "SIMILAR_TO"
    targetId: string;
    score: number;            // Вероятность из модели
    model: string;            // "gnn-link-pred-v1.2"
    predictedAt: string;      // ISO 8601
  }[];

  /** Кластерная принадлежность */
  clusters: {
    algorithm: string;        // "label-propagation", "louvain"
    clusterId: string;        // "cluster-17"
    membershipScore: number;  // 0.0 — 1.0
  }[];

  /** Графовые метрики узла */
  graphMetrics: {
    degree: number;           // Количество связей
    inDegree: number;         // Входящие
    outDegree: number;        // Исходящие
    pageRank: number;         // PageRank score
    betweenness: number;      // Betweenness centrality
    computedAt: string;       // ISO 8601
  } | null;
}
```

### Блок 6: Evolution History — История эволюции

```typescript
interface EvolutionHistory {
  /** История циклов извлечения, затронувших этот квант */
  cycles: {
    cycleId: string;
    cycleNumber: number;
    action: 'CREATED' | 'UPDATED' | 'CONFIRMED' | 'DEPRECATED';
    changedFields: string[];  // ["summary", "confidence"]
    timestamp: string;
  }[];

  /** Цепочка версий */
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

### Блок 7: Quality Metrics — Метрики качества

```typescript
interface QualityMetrics {
  /** Результат валидации схемы */
  schemaValidation: {
    valid: boolean;
    errors: string[];         // ["missing field: sourceId", "invalid confidence: -0.5"]
    checkedAt: string;
  };

  /** Количество использований (запросы, переходы, цитирования) */
  usageCount: {
    queries: number;          // Сколько раз запрашивался
    traversals: number;       // Сколько раз был частью пути
    citations: number;        // Сколько раз на него ссылались
    lastAccessedAt: string;
  };

  /** Уровень качества (автоматически вычисляется) */
  qualityTier: 'GOLD' | 'SILVER' | 'BRONZE' | 'UNVERIFIED';
}
```

Правила определения `qualityTier`:

| Tier       | Условия                                                                                       |
|------------|-----------------------------------------------------------------------------------------------|
| `GOLD`     | `confidence >= 0.9` И `validatedBy !== null` И `schemaValidation.valid === true`              |
| `SILVER`   | `confidence >= 0.7` И `schemaValidation.valid === true`                                       |
| `BRONZE`   | `confidence >= 0.5` И все обязательные поля Level 1 заполнены                                 |
| `UNVERIFIED` | Всё остальное                                                                              |

### Блок 8: Access Control — Контроль доступа

```typescript
interface AccessControl {
  /** Уровень секретности */
  securityLevel: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

  /** Команда-владелец */
  ownerTeam: string;          // "data-engineering", "security"

  /** Роли с доступом на чтение */
  allowedRoles: string[];     // ["admin", "analyst", "developer"]
}
```

---

## 2.3. Provenance — Маппинг на W3C PROV-O

### Соответствие концепций PROV-O и PA

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

### Таблица маппинга

| PROV-O Концепция         | PA Реализация              | Memgraph Метка/Связь         | Описание                                      |
|--------------------------|----------------------------|------------------------------|-----------------------------------------------|
| `prov:Entity`            | Knowledge Node             | `(:Domain)`, `(:Procedure)`  | Извлечённый факт (узел знаний)                |
| `prov:Activity`          | Extraction Cycle           | `(:ExtractionCycle)`         | Один проход пайплайна извлечения              |
| `prov:Agent`             | Pipeline / User            | `(:Pipeline)`, `(:User)`     | Кто выполнил извлечение                       |
| `prov:wasGeneratedBy`    | EXTRACTED_BY               | `-[:EXTRACTED_BY]->`         | Узел создан в рамках цикла                    |
| `prov:wasDerivedFrom`    | DERIVED_FROM               | `-[:DERIVED_FROM]->`         | Узел извлечён из источника                    |
| `prov:wasAssociatedWith` | EXECUTED_BY                | `-[:EXECUTED_BY]->`          | Цикл запущен агентом/пайплайном               |
| `prov:wasAttributedTo`   | ATTRIBUTED_TO              | `-[:ATTRIBUTED_TO]->`        | Факт приписан конкретному агенту              |
| `prov:used`              | USED_SOURCE                | `-[:USED_SOURCE]->`          | Цикл использовал источник данных              |
| `prov:wasInformedBy`     | INFORMED_BY                | `-[:INFORMED_BY]->`          | Цикл использовал результаты другого цикла     |
| `prov:generatedAtTime`   | `createdAt`                | Свойство узла                | Время создания (ISO 8601)                     |
| `prov:invalidatedAtTime` | `ttEnd`                    | Свойство узла                | Время инвалидации версии                      |

### Как заполнять поля провенанса

| Поле                | Источник значения                             | Пример                                     |
|---------------------|-----------------------------------------------|---------------------------------------------|
| `sourceType`        | Тип коннектора, выполнившего извлечение        | `"mssql"` для SQL Server                    |
| `sourceId`          | Полный путь к объекту в источнике              | `"server01.MyDB.dbo.sp_GetUsers"`           |
| `sourceSystem`      | Имя, присвоенное администратором при настройке | `"ERP-Production"`                          |
| `extractionCycleId` | UUID, сгенерированный при старте пайплайна     | `"cycle-550e8400-e29b-41d4-a716-446655440000"` |
| `confidence`        | Определяется методом извлечения (см. ниже)     | `0.85`                                      |

### Правила определения confidence по типу источника

| Тип источника    | Метод                | Базовый confidence | Обоснование                                      |
|------------------|----------------------|--------------------|--------------------------------------------------|
| **AST**          | Парсинг AST          | **1.0**            | Синтаксическое дерево — детерминистичный разбор  |
| **Regex**        | Регулярные выражения | **0.9**            | Покрывает большинство паттернов, но не все        |
| **User**         | Ручной ввод          | **0.8**            | Человек может ошибиться, но обычно точен          |
| **LLM**          | Языковая модель      | **0.7**            | Высокое качество, но возможны галлюцинации        |
| **GNN**          | Графовая нейросеть   | **0.6**            | Предсказание на основе структуры графа            |
| **Heuristic**    | Эвристические правила| **0.5**            | Простые правила, высокий false positive rate       |

> **Важно:** Базовый confidence может быть скорректирован валидацией. Например, LLM-извлечение, подтверждённое кросс-ссылкой, получает `confidence = 0.7 + 0.2 = 0.9`.

---

## 2.4. Hash chain — криптографическая целостность

Каждая версия узла содержит криптографическую цепочку хешей, обеспечивающую неизменяемость истории.

### Три типа хешей

| Хеш            | Формула                                        | Назначение                                          |
|-----------------|------------------------------------------------|-----------------------------------------------------|
| `contentHash`   | `SHA-256(canonicalize(content))`               | Отпечаток содержимого текущей версии                |
| `previousHash`  | `chainHash` предыдущей версии                  | Ссылка на предшественника (как в блокчейне)         |
| `chainHash`     | `SHA-256(contentHash + ":" + previousHash)`    | Цепочечный хеш, связывающий версии                  |

```
  Version 1 (GENESIS)         Version 2                   Version 3
  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │ contentHash: H1  │        │ contentHash: H2  │        │ contentHash: H3  │
  │ previousHash: ∅  │───────>│ previousHash: C1 │───────>│ previousHash: C2 │
  │ chainHash: C1    │        │ chainHash: C2    │        │ chainHash: C3    │
  │ C1=SHA(H1+":"+∅) │        │ C2=SHA(H2+":"+C1)│        │ C3=SHA(H3+":"+C2)│
  └──────────────────┘        └──────────────────┘        └──────────────────┘
```

### Алгоритм канонизации (canonicalization)

Перед вычислением `contentHash` содержимое узла приводится к каноническому виду:

```javascript
const crypto = require('crypto');

/**
 * Канонизирует объект для вычисления contentHash.
 *
 * Шаги:
 * 1. Удалить служебные поля (id, createdAt, ttStart, ttEnd, contentHash, chainHash и т.д.)
 * 2. Отсортировать ключи рекурсивно
 * 3. Сериализовать в JSON (без пробелов)
 *
 * @param {object} properties - Свойства узла
 * @returns {string} Каноническая JSON-строка
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
 * Вычисляет contentHash для свойств узла.
 */
function computeContentHash(properties) {
  const canonical = canonicalize(properties);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Вычисляет chainHash для текущей версии.
 *
 * @param {string} contentHash - Хеш содержимого текущей версии
 * @param {string|null} previousChainHash - chainHash предыдущей версии (null для GENESIS)
 * @returns {string} chainHash
 */
function computeChainHash(contentHash, previousChainHash) {
  const prev = previousChainHash ?? 'GENESIS';
  const input = `${contentHash}:${prev}`;
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
```

### Валидация цепочки

```javascript
/**
 * Валидирует целостность цепочки версий.
 *
 * @param {Array} versions - Массив версий, отсортированных по sequenceNumber
 * @returns {{ valid: boolean, brokenAt: number|null, error: string|null }}
 */
function validateChain(versions) {
  if (versions.length === 0) {
    return { valid: true, brokenAt: null, error: null };
  }

  // Проверяем GENESIS версию
  const genesis = versions[0];
  const expectedGenesisChain = computeChainHash(genesis.contentHash, null);
  if (genesis.chainHash !== expectedGenesisChain) {
    return {
      valid: false,
      brokenAt: genesis.sequenceNumber,
      error: `GENESIS chainHash mismatch: expected ${expectedGenesisChain}, got ${genesis.chainHash}`,
    };
  }

  // Проверяем каждую последующую версию
  for (let i = 1; i < versions.length; i++) {
    const current = versions[i];
    const previous = versions[i - 1];

    // previousHash текущей версии должен совпадать с chainHash предыдущей
    if (current.previousHash !== previous.chainHash) {
      return {
        valid: false,
        brokenAt: current.sequenceNumber,
        error: `Version ${current.sequenceNumber}: previousHash (${current.previousHash}) !== previous chainHash (${previous.chainHash})`,
      };
    }

    // chainHash текущей версии должен быть корректным
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

### Паттерн GENESIS — первая версия

Первая версия сущности (sequenceNumber = 1) использует специальный паттерн:

```javascript
// Создание GENESIS версии
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
  previousHash: null,                                        // <-- null для GENESIS
  chainHash: computeChainHash(computeContentHash(properties), null), // <-- "GENESIS" как previousHash
};
```

При валидации: если `previousHash === null` и `sequenceNumber === 1`, это корректная GENESIS версия.

---

## 2.5. Bi-temporal model — двумерное время

Каждая версионируемая сущность (Level 3) существует в двух временных измерениях:

```
                    Valid Time (vt) — «Когда факт реально действовал?»
                    ────────────────────────────────────────────────>

 Transaction Time   │
 (tt) — «Когда      │   ┌─────────────────────┐
  мы узнали          │   │  V1: sp_GetUsers     │
  об этом факте?»    │   │  vt: [Jan, Mar)      │ ← «Процедура была актуальна Jan-Mar»
                     │   │  tt: [Feb, ∞)        │ ← «Мы узнали об этом в Feb»
                     │   └─────────────────────┘
                     │
                     │   ┌─────────────────────┐
                     │   │  V2: sp_GetUsers_v2  │
                     │   │  vt: [Mar, ∞)        │ ← «Новая версия с Mar»
                     │   │  tt: [Mar, ∞)        │ ← «Мы узнали об этом в Mar»
                     │   └─────────────────────┘
                     │
                     │   ┌─────────────────────┐
                     │   │  V1-fix: sp_GetUsers │
                     │   │  vt: [Jan, Feb)      │ ← «Оказывается, V1 работала только до Feb»
                     │   │  tt: [Apr, ∞)        │ ← «Мы это осознали только в Apr (ретроспективно)»
                     │   └─────────────────────┘
                     ▼
```

### Примеры Cypher-запросов

**Текущее состояние** — что актуально прямо сейчас:

```cypher
// Все активные версии на текущий момент
MATCH (v:NodeVersion)
WHERE v.status = 'ACTIVE'
  AND v.ttEnd IS NULL
  AND v.vtEnd IS NULL
RETURN v
ORDER BY v.entityId, v.sequenceNumber DESC
```

**As-of запрос (Transaction Time)** — что мы знали на определённую дату:

```cypher
// Состояние графа знаний, каким мы его знали на 2026-02-15
MATCH (v:NodeVersion)
WHERE v.ttStart <= '2026-02-15T00:00:00.000Z'
  AND (v.ttEnd IS NULL OR v.ttEnd > '2026-02-15T00:00:00.000Z')
RETURN v
```

**Valid-at запрос (Valid Time)** — что было реально в определённый период:

```cypher
// Какие процедуры реально существовали в январе 2026
MATCH (v:NodeVersion)-[:VERSION_OF]->(e:Procedure)
WHERE v.vtStart <= '2026-01-31T23:59:59.999Z'
  AND (v.vtEnd IS NULL OR v.vtEnd > '2026-01-01T00:00:00.000Z')
RETURN e.name, v.sequenceNumber, v.vtStart, v.vtEnd
```

**Bi-temporal запрос** — что мы знали о конкретном периоде на конкретную дату:

```cypher
// Что мы знали на 2026-03-01 о состоянии системы в январе 2026
MATCH (v:NodeVersion)
WHERE v.ttStart <= '2026-03-01T00:00:00.000Z'
  AND (v.ttEnd IS NULL OR v.ttEnd > '2026-03-01T00:00:00.000Z')
  AND v.vtStart <= '2026-01-31T23:59:59.999Z'
  AND (v.vtEnd IS NULL OR v.vtEnd > '2026-01-01T00:00:00.000Z')
RETURN v
```

### Правила управления временем

| Аспект                       | Transaction Time (tt)                  | Valid Time (vt)                          |
|------------------------------|----------------------------------------|------------------------------------------|
| **Кто устанавливает**        | Система автоматически                  | Пайплайн извлечения или пользователь     |
| **Можно ли изменить?**       | Нет — иммутабельно                    | Да — при ретроспективной коррекции       |
| **Когда ttEnd/vtEnd задаётся?** | При создании новой версии (SUPERSEDED) | При обнаружении, что факт больше не валиден |
| **Значение null**            | Текущая (ещё не заменена)              | Бессрочно валиден                        |
| **Формат**                   | ISO 8601 с timezone (UTC)              | ISO 8601 с timezone (UTC)                |
| **Гранулярность**            | Миллисекунды                           | Миллисекунды                             |

**Инварианты:**

1. `ttStart` всегда задаётся при создании версии и **никогда не меняется**.
2. `ttEnd` задаётся **только** когда появляется новая версия (`SUPERSEDED`).
3. `vtStart` задаётся при создании, может быть скорректирована **ретроспективно**.
4. `vtEnd` может быть `null` (бессрочно) или задаётся при обнаружении устаревания.
5. Для любой сущности **ровно одна** версия имеет `ttEnd = null` и `status = 'ACTIVE'`.

---

## 2.6. extractionCycleId — правила

### Что такое цикл извлечения

Цикл извлечения (Extraction Cycle) — это один полный проход пайплайна по источнику данных. Один цикл может создать или обновить десятки/сотни узлов в графе знаний.

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
│  Результат: 47 узлов создано, 12 обновлено, 3 удалено           │
└──────────────────────────────────────────────────────────────────┘
```

### Генерация extractionCycleId

`extractionCycleId` генерируется **один раз** при старте пайплайна и передаётся во все последующие шаги:

```javascript
const { v4: uuidv4 } = require('uuid');

/**
 * Создаёт новый цикл извлечения.
 * Вызывается ОДИН РАЗ при старте пайплайна.
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

### Использование extractionCycleId

| Сценарий              | Как используется                                                                 | Пример                                                    |
|-----------------------|---------------------------------------------------------------------------------|------------------------------------------------------------|
| **Групповой откат**   | Удалить все узлы, созданные в одном цикле                                       | `MATCH (n {extractionCycleId: $cycleId}) DETACH DELETE n`  |
| **Дебаг пайплайна**   | Найти все факты, извлечённые в конкретном прогоне                                | `MATCH (n {extractionCycleId: $cycleId}) RETURN n`         |
| **Метрики**           | Подсчитать количество созданных/обновлённых/удалённых узлов за цикл              | Агрегация по `extractionCycleId`                           |
| **Инкрементальность** | Определить, какие узлы не были затронуты последним циклом (потенциально удалены)  | `WHERE n.extractionCycleId <> $currentCycleId`             |
| **Аудит**             | Ответить «кто и когда создал этот факт»                                          | Join с `(:ExtractionCycle)` узлом                          |

### Связь со спиральной моделью извлечения

Пайплайн PA работает по спиральной модели: каждый цикл уточняет предыдущие результаты.

```
  Cycle 1 ──> Cycle 2 ──> Cycle 3 ──> Cycle 4
  (грубый)    (уточнённый) (обогащённый) (валидированный)

  confidence:  0.5-0.7     0.7-0.8      0.8-0.9        0.9-1.0
  метод:       regex       AST+regex    +LLM enrich    +GNN predict
```

Каждый цикл:
1. Получает `previousCycleId` — ссылку на предыдущий прогон
2. Генерирует свой `cycleId` — новый UUID
3. Увеличивает `cycleNumber` на 1
4. Для каждого существующего узла сравнивает `contentHash`:
   - Хеш совпал → `CONFIRMED` (не создаём новую версию, обновляем `extractionCycleId`)
   - Хеш изменился → `UPDATED` (создаём новую версию, `SUPERSEDED` старую)
   - Узел не найден в источнике → `DEPRECATED` (устанавливаем `vtEnd`)
   - Новый узел → `CREATED` (создаём GENESIS версию)

```javascript
/**
 * Определяет действие для узла при инкрементальном обновлении.
 */
function determineAction(existingNode, newContentHash) {
  if (!existingNode) {
    return 'CREATED';   // Новый узел, ранее не существовал
  }
  if (existingNode.contentHash === newContentHash) {
    return 'CONFIRMED'; // Содержимое не изменилось
  }
  return 'UPDATED';     // Содержимое изменилось, нужна новая версия
}

// Узлы, существующие в графе, но не найденные в текущем цикле:
// → action: 'DEPRECATED' (устанавливаем vtEnd = now)
```

---

> **CODEX-META v0.1.0** | Часть **Кодекс UN ProjectAdvisor** | Стандарт метаданных для графа знаний

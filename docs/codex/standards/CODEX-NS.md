# CODEX-NS: Стандарт namespace

**Статус:** 🟡 В разработке
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Оглавление

- [4.1 Четыре пространства имён](#41-четыре-пространства-имён)
- [4.2 Routing rules](#42-routing-rules)
- [4.3 Cross-namespace queries](#43-cross-namespace-queries)
- [4.4 Isolation guarantees](#44-isolation-guarantees)
- [4.5 ExecutionRecord — почему META, не PROJECT](#45-executionrecord--почему-meta-не-project)

---

## Преамбула

Namespace -- механизм изоляции в UN ProjectAdvisor. Каждый узел и каждое ребро в графе знаний принадлежат ровно одному namespace. Namespace определяет:

- **Видимость:** кто может читать данные
- **Мутабельность:** кто может записывать данные
- **Маршрутизацию:** куда направляются запросы
- **Изоляцию:** какие данные не должны пересекаться

Четыре пространства обеспечивают разделение между системными знаниями (`CORE`), проектными данными (`PROJECT`), мета-знаниями (`META`) и общими ресурсами (`COMMON`).

```
Принцип: данные разделены по ПРИРОДЕ, а не по технологии хранения.
Один Memgraph, один Qdrant, один Redis -- но четыре логических контура.
```

---

## 4.1 Четыре пространства имён

### Архитектура

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

  Стрелки = разрешённые cross-namespace READ
  ╳ = запрещённые прямые связи между PROJECT-ами
```

### CORE -- системные знания

**Enum:** `KnowledgeNamespace.CORE = 'core'`

Знания о самом UN ProjectAdvisor: его сервисах, пайплайнах, конфигурациях, API-схемах и архитектурных решениях.

| Свойство | Значение |
|----------|----------|
| **Назначение** | Системные знания о PA |
| **Примеры узлов** | `Service`, `Pipeline`, `Component`, `Config`, `Schema`, `API`, `Architecture`, `Decision` |
| **Формат namespace** | `core` |
| **Частота обновлений** | При релизах системы |
| **Чтение** | `DEVELOPER`, `ARCHITECT`, `ADMIN` |
| **Запись** | `ARCHITECT`, `ADMIN` |
| **Qdrant collection** | `core_knowledge` |
| **Redis prefix** | `core:` |
| **Cache TTL** | 3600 с (1 час) |

**Пример узла:**

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

### PROJECT -- проектные данные

**Enum:** `KnowledgeNamespace.PROJECT = 'project'`

Извлечённые знания из legacy-систем ООН. Каждый проект хранится в собственном подпространстве `PROJECT:{project_name}`. Проекты полностью изолированы друг от друга -- прямые рёбра между `PROJECT:imis` и `PROJECT:umoja` запрещены.

| Свойство | Значение |
|----------|----------|
| **Назначение** | Данные legacy-проектов |
| **Примеры узлов** | `File`, `Class`, `Method`, `WorkItem`, `Table`, `StoredProcedure`, `BusinessRule`, `Person`, `Team` |
| **Формат namespace** | `project:{project_name}` (например, `project:imis`, `project:umoja`) |
| **Частота обновлений** | При переиндексации |
| **Чтение** | Все роли (`VIEWER` и выше) |
| **Запись** | `DEVELOPER`, `ARCHITECT`, `ADMIN`, `SYSTEM` |
| **Qdrant collection** | `project_{project_name}` (например, `project_imis`) |
| **Redis prefix** | `project:{project_name}:` |
| **Cache TTL** | 1800 с (30 минут) |

**Пример узла:**

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

### META -- мета-знания

**Enum:** `KnowledgeNamespace.META = 'meta'`

Знания о знаниях: стратегии извлечения, паттерны обработки, записи о выполнении пайплайнов, метрики качества. META -- это то, КАК система работает и учится, а не ЧТО она извлекает.

| Свойство | Значение |
|----------|----------|
| **Назначение** | Методологические знания, стратегии, записи выполнения |
| **Примеры узлов** | `Strategy`, `DataType`, `Tool`, `ContextPattern`, `StrategyExecution`, `ExtractionCycle`, `DecisionRecord`, `QualityRule` |
| **Формат namespace** | `meta` |
| **Частота обновлений** | По мере обучения системы |
| **Чтение** | `ARCHITECT`, `ADMIN`, `SYSTEM` |
| **Запись** | `SYSTEM`, `ADMIN` |
| **Qdrant collection** | `meta_knowledge` |
| **Redis prefix** | `meta:` |
| **Cache TTL** | 7200 с (2 часа) |

**Пример узла:**

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

### COMMON -- общие ресурсы

**Enum:** `KnowledgeNamespace.COMMON = 'common'`

Словари, глоссарии, шаблоны и справочные данные, используемые всеми остальными namespace. Содержит онтологию ООН, аббревиатуры, организационную структуру. Запись только для утверждённых контрибьюторов (`ADMIN`).

| Свойство | Значение |
|----------|----------|
| **Назначение** | Общая терминология, словари, справочные данные |
| **Примеры узлов** | `Term`, `Concept`, `Organization`, `System`, `DocumentPattern`, `Glossary`, `Acronym`, `UNEntity` |
| **Формат namespace** | `common` |
| **Частота обновлений** | Редко |
| **Чтение** | Все роли (`VIEWER` и выше) |
| **Запись** | Только `ADMIN` |
| **Qdrant collection** | `common_vocabulary` |
| **Redis prefix** | `common:` |
| **Cache TTL** | 86400 с (24 часа) |

**Пример узла:**

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

### Алгоритм автоопределения namespace

При поступлении запроса `NamespaceRouter` определяет целевой namespace по следующему алгоритму:

```javascript
/**
 * Алгоритм маршрутизации (namespace-router.service.js)
 *
 * Приоритет:
 *   1. Явно указанный namespace (explicitNamespace)
 *   2. Определение по sourceSystem / projectId
 *   3. Определение по label / типу узла
 *   4. Анализ текста запроса (regex-паттерны)
 *   5. Default → 'project' (для pipeline-записей) или 'common' (для запросов)
 */
async function resolveNamespace(context) {
  const { explicitNamespace, sourceSystem, label, query } = context;

  // [1] Явный namespace — высший приоритет
  if (explicitNamespace) {
    if (!checkAccess(explicitNamespace, context.userRole, 'read')) {
      throw new Error(`Access denied to namespace: ${explicitNamespace}`);
    }
    return explicitNamespace;
  }

  // [2] По sourceSystem — если данные пришли из конкретного проекта
  if (sourceSystem) {
    const projectName = sourceSystem.toLowerCase();
    return `project:${projectName}`;
  }

  // [3] По label — каждый namespace имеет allowedNodeLabels
  if (label) {
    for (const [ns, config] of Object.entries(NAMESPACE_CONFIGS)) {
      if (config.allowedNodeLabels.includes(label)) {
        return ns === 'project' ? 'project:unknown' : ns;
      }
    }
  }

  // [4] По тексту запроса — regex-анализ
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

### Regex-паттерны определения

`NamespaceRouter` использует следующие паттерны для анализа текста запроса:

| Namespace | Паттерны | Примеры совпадений |
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

### Таблица маршрутизации по label

| Label | Namespace | Пример |
|-------|-----------|--------|
| `Service`, `Pipeline`, `Component` | `core` | PA API gateway service |
| `Config`, `Schema`, `API` | `core` | GraphQL schema definition |
| `Architecture`, `Decision` | `core` | ADR-005: выбор Memgraph |
| `File`, `Class`, `Method`, `Function` | `project:{name}` | Класс `UserManager` из IMIS |
| `WorkItem`, `Epic`, `Bug`, `Task` | `project:{name}` | Work item #42300 из IMIS |
| `Table`, `Column`, `StoredProcedure` | `project:{name}` | Таблица `HR_EMPLOYEES` из Umoja |
| `BusinessRule`, `BusinessProcess` | `project:{name}` | Правило валидации контракта |
| `Strategy`, `ContextPattern` | `meta` | Стратегия извлечения SQL-схем |
| `StrategyExecution`, `ExtractionCycle` | `meta` | Запись о выполнении пайплайна |
| `DecisionRecord`, `QualityRule` | `meta` | Решение об изменении стратегии |
| `Term`, `Concept`, `Glossary` | `common` | Термин "appropriation" |
| `Acronym`, `UNEntity` | `common` | OICT, DGACM, ACABQ |
| `Organization`, `System` | `common` | United Nations Secretariat |
| `DocumentPattern` | `common` | Шаблон General Assembly resolution |

### Определение storage paths

Каждый namespace маппится на конкретные storage-пути:

```javascript
// namespace.config.js — getStoragePaths()

// Для PROJECT namespace path строится динамически:
getStoragePaths('project:imis')
// → {
//     graphPrefix:      'project:imis',
//     qdrantCollection: 'project_imis',
//     redisPrefix:      'project:imis:',
//     storagePath:      '/knowledge/projects/imis'
//   }

// Для остальных namespace — статические пути:
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

### Разрешённые паттерны

**1. READ из любого namespace (при наличии прав доступа)**

Чтение всегда разрешено, если роль пользователя входит в `readRoles` целевого namespace.

```cypher
// Запрос к CORE — информация о сервисах
MATCH (s:Service {namespace: 'core'})
WHERE s.name CONTAINS 'Memgraph'
RETURN s.name, s.description;

// Запрос к PROJECT — данные конкретного проекта
MATCH (sp:StoredProcedure {fullNamespace: 'project:imis'})
WHERE sp.name STARTS WITH 'sp_get'
RETURN sp.name, sp.language;

// Запрос к COMMON — справочные данные
MATCH (a:Acronym {namespace: 'common'})
WHERE a.name = 'OICT'
RETURN a.fullForm;
```

**2. JOIN между PROJECT и COMMON (обогащение проектных данных справочниками)**

Проектные данные часто ссылаются на общую терминологию. Такие cross-namespace запросы выполняются через isCrossNamespace-рёбра.

```cypher
// Найти все таблицы IMIS, связанные с организацией из COMMON
MATCH (t:Table {fullNamespace: 'project:imis'})
      -[r:REFERENCES_ENTITY {isCrossNamespace: true}]->
      (org:Organization {namespace: 'common'})
RETURN t.name AS tableName, org.name AS organization;

// Обогатить бизнес-правила терминами из глоссария
MATCH (br:BusinessRule {fullNamespace: 'project:umoja'})
      -[:USES_TERM {isCrossNamespace: true}]->
      (term:Term {namespace: 'common'})
RETURN br.name, collect(term.name) AS relatedTerms;
```

**3. META читает из PROJECT (анализ результатов извлечения)**

META-знания связаны с проектными данными через записи о выполнении и стратегии.

```cypher
// Какие стратегии использовались для проекта IMIS
MATCH (se:StrategyExecution {namespace: 'meta'})
WHERE se.targetProject = 'imis'
MATCH (se)-[:USED_STRATEGY]->(s:Strategy {namespace: 'meta'})
RETURN s.name, se.successRate, se.executedAt;

// Агрегация метрик качества по проектам
MATCH (qr:QualityRule {namespace: 'meta'})
      -[:EVALUATED]->(cycle:ExtractionCycle {namespace: 'meta'})
WHERE cycle.targetNamespace STARTS WITH 'project:'
RETURN cycle.targetNamespace, avg(qr.score) AS avgQuality;
```

**4. CORE читает из COMMON (конфигурация ссылается на организационную структуру)**

```cypher
// Какие сервисы PA обслуживают организации из COMMON
MATCH (svc:Service {namespace: 'core'})
      -[:SERVES {isCrossNamespace: true}]->
      (org:Organization {namespace: 'common'})
RETURN svc.name, org.name;
```

### Запрещённые паттерны

**1. Прямые рёбра между разными PROJECT-ами**

Каждый проект -- изолированный контур. Нельзя создавать прямые связи между `PROJECT:imis` и `PROJECT:umoja`.

```cypher
// ЗАПРЕЩЕНО: прямое ребро между проектами
MATCH (a:Table {fullNamespace: 'project:imis'}),
      (b:Table {fullNamespace: 'project:umoja'})
CREATE (a)-[:SIMILAR_TO]->(b);
// ^^^ Нарушение изоляции! Используйте COMMON для связывания.

// ПРАВИЛЬНЫЙ ПОДХОД: связывание через COMMON
MATCH (a:Table {fullNamespace: 'project:imis'}),
      (b:Table {fullNamespace: 'project:umoja'}),
      (concept:Concept {namespace: 'common'})
WHERE concept.name = 'HR_DataModel'
CREATE (a)-[:IMPLEMENTS {isCrossNamespace: true}]->(concept),
       (b)-[:IMPLEMENTS {isCrossNamespace: true}]->(concept);
```

**2. Запись в CORE из pipeline-кода**

CORE -- readonly для пайплайнов. Только `ARCHITECT` и `ADMIN` могут модифицировать системные знания.

```cypher
// ЗАПРЕЩЕНО: pipeline пишет в CORE
// В коде executor-а:
// await memgraph.mergeNode('Service', { namespace: 'core', ... });
// ^^^ Rejection: writeRoles не включает SYSTEM для CORE

// ПРАВИЛЬНО: pipeline пишет в META или PROJECT
// await memgraph.mergeNode('ExtractionCycle', { namespace: 'meta', ... });
```

**3. Модификация COMMON без утверждения**

COMMON содержит словари и онтологии, которые используют все namespace. Изменения требуют роли `ADMIN`.

```cypher
// ЗАПРЕЩЕНО: developer добавляет термин в COMMON
// checkAccess('common', 'DEVELOPER', 'write') → false

// ПРАВИЛЬНО: только ADMIN
// checkAccess('common', 'ADMIN', 'write') → true
MERGE (t:Term {id: $id, namespace: 'common'})
SET t.name = 'appropriation',
    t.definition = 'Authorization granted by the General Assembly...',
    t.createdAt = datetime();
```

**4. Запись META-данных в PROJECT namespace**

Записи о выполнении, стратегии и метрики качества -- это мета-знания. Они описывают работу системы, а не извлечённые данные проекта.

```cypher
// ЗАПРЕЩЕНО: ExecutionRecord в PROJECT
CREATE (er:ExecutionRecord {
  namespace: 'project',
  fullNamespace: 'project:imis',
  ...
});
// ^^^ Нарушение! ExecutionRecord — всегда META. См. раздел 4.5.

// ПРАВИЛЬНО:
CREATE (er:ExecutionRecord {
  namespace: 'meta',
  fullNamespace: 'meta',
  targetProject: 'imis',
  ...
});
```

---

## 4.4 Isolation guarantees

### Таблица правил изоляции

| Правило | Гарантия | Enforcement |
|---------|----------|-------------|
| **PROJECT:X ↛ PROJECT:Y** | Прямые рёбра между разными проектами запрещены | `mergeRelationship()` + namespace check |
| **CORE immutable для pipelines** | SYSTEM роль не имеет write-доступа к CORE | `checkAccess('core', 'SYSTEM', 'write') → false` |
| **COMMON write = ADMIN only** | Только ADMIN может модифицировать общие ресурсы | `writeRoles: [UserRole.ADMIN]` |
| **META write = SYSTEM + ADMIN** | Пайплайны пишут в META автоматически | `writeRoles: [UserRole.SYSTEM, UserRole.ADMIN]` |
| **Label → Namespace binding** | Каждый label разрешён только в определённых namespace | `isLabelAllowed(namespace, label)` |
| **Cross-namespace маркировка** | Все cross-namespace рёбра имеют `isCrossNamespace: true` | `_markCrossNamespaceRefs()` |
| **PROJECT namespace всегда с projectId** | `project` без квалификатора запрещён в production | Routing validation |

### Enforcement в memgraph.service.js

Основной enforcement реализован в `mergeRelationship()` через параметр `isCrossNamespace` и в `_markCrossNamespaceRefs()`:

```javascript
/**
 * memgraph.service.js — enforcement cross-namespace рёбер
 */
async mergeRelationship(fromId, toId, type, properties = {}, isCrossNamespace = false) {
  // ...

  const relProps = {
    ...properties,
    isCrossNamespace,            // Маркировка cross-namespace ребра
    createdAt: new Date().toISOString()
  };

  // MERGE ребро
  const query = `
    MATCH (a), (b)
    WHERE a.id = $fromId AND b.id = $toId
    MERGE (a)-[r:${type}]->(b)
    SET r += $properties
    RETURN r
  `;
  await session.run(query, { fromId, toId, properties: relProps });

  // Пометить узлы как участники cross-namespace связи
  if (isCrossNamespace) {
    await this._markCrossNamespaceRefs(session, fromId, toId);
  }
}

/**
 * Маркировка узлов, участвующих в cross-namespace связях.
 * Позволяет быстро находить "пограничные" узлы.
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

Контроль доступа реализован в `NamespaceRouter.checkAccess()`:

```javascript
/**
 * namespace-router.service.js — проверка доступа
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

Label-валидация через `isLabelAllowed()`:

```javascript
/**
 * namespace.config.js — проверка допустимости label в namespace
 */
function isLabelAllowed(fullNamespace, label) {
  const config = getNamespaceConfig(fullNamespace);
  if (!config) return false;
  return config.allowedNodeLabels.includes(label);
}

// Примеры:
isLabelAllowed('core', 'Service')          // → true
isLabelAllowed('core', 'Table')            // → false (Table — PROJECT)
isLabelAllowed('project:imis', 'Table')    // → true
isLabelAllowed('common', 'StoredProcedure') // → false (SP — PROJECT)
isLabelAllowed('meta', 'Strategy')         // → true
```

### Аудит cross-namespace операций

Для мониторинга cross-namespace связей используется аудиторный запрос:

```cypher
// Найти все cross-namespace рёбра
MATCH (a)-[r {isCrossNamespace: true}]->(b)
RETURN a.fullNamespace AS fromNS,
       b.fullNamespace AS toNS,
       type(r) AS relType,
       count(r) AS edgeCount
ORDER BY edgeCount DESC;

// Найти нарушения: прямые рёбра между разными PROJECT-ами
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

// Найти узлы с неправильным label для их namespace
MATCH (n)
WHERE n.namespace IS NOT NULL
  AND n.namespace = 'core'
  AND NOT n:Service AND NOT n:Pipeline AND NOT n:Component
  AND NOT n:Config AND NOT n:Schema AND NOT n:API
  AND NOT n:Documentation AND NOT n:Architecture
  AND NOT n:Decision AND NOT n:Worker
RETURN labels(n) AS wrongLabels, n.id, n.namespace;

// Статистика по namespace
MATCH (n)
WHERE n.namespace IS NOT NULL
RETURN n.namespace AS namespace,
       count(n) AS nodeCount,
       collect(DISTINCT labels(n)) AS labelTypes
ORDER BY namespace;
```

---

## 4.5 ExecutionRecord -- почему META, не PROJECT

### Текущая проблема

В текущей реализации `RuntimeAdapter` (`api/src/services/immutable-graph/integration/runtime-adapter.ts`) узлы `ExecutionRecord` записываются в PROJECT namespace:

```typescript
// runtime-adapter.ts — ТЕКУЩЕЕ состояние (НЕПРАВИЛЬНО)
export class RuntimeAdapter {
  private static readonly PATTERN_NODE_TYPE = 'ExecutionPattern';
  private static readonly EXECUTION_NODE_TYPE = 'ExecutionRecord';
  private static readonly PATTERN_NAMESPACE = Namespace.PROJECT;  // ← ПРОБЛЕМА

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string = 'gxe-patterns'
  ) {}

  async recordExecution(result: ExecutionResult): Promise<RecordResult> {
    // ...
    await this.createExecutionRecord(result, pattern.entityId);
    // ^^^ Записывается в PROJECT namespace через PATTERN_NAMESPACE
  }
}
```

Это означает, что записи о выполнении пайплайна попадают в `project:gxe-patterns`, смешиваясь с проектными данными.

### Целевое состояние

`ExecutionRecord` и `ExecutionPattern` всегда должны записываться в `META` namespace:

```typescript
// runtime-adapter.ts — ЦЕЛЕВОЕ состояние (ПРАВИЛЬНО)
export class RuntimeAdapter {
  private static readonly PATTERN_NODE_TYPE = 'ExecutionPattern';
  private static readonly EXECUTION_NODE_TYPE = 'ExecutionRecord';
  private static readonly PATTERN_NAMESPACE = Namespace.META;  // ← ИСПРАВЛЕНО

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string = 'execution-records'  // ← Описательный ID
  ) {}
}
```

### Обоснование

| Аргумент | Объяснение |
|----------|------------|
| **Природа данных** | ExecutionRecord описывает КАК система работала (время, статус, метрики), а не ЧТО было извлечено. Это мета-знания по определению. |
| **Cross-project аналитика** | Для сравнения эффективности стратегий между проектами нужен единый namespace. Если записи разбросаны по `project:imis`, `project:umoja` -- агрегация требует multi-namespace запросов. |
| **Label consistency** | `ExecutionRecord` и `StrategyExecution` входят в `allowedNodeLabels` для META (`Strategy`, `StrategyExecution`, `ExtractionCycle`, `DecisionRecord`), но не для PROJECT. |
| **Иммутабельность** | Запись о выполнении никогда не должна изменяться. META namespace обеспечивает это через write-only для SYSTEM. |
| **Чистота PROJECT** | Проектные данные должны содержать только знания, извлечённые из legacy-систем. Системные метрики загрязняют проектный граф. |
| **Связь с проектом** | Ссылка на проект сохраняется через свойство `targetProject`, а не через namespace. Это позволяет фильтровать по проекту без нарушения изоляции. |

### Миграция

Для переноса существующих `ExecutionRecord` из PROJECT в META:

```cypher
// Шаг 1: Найти все ExecutionRecord в PROJECT namespace
MATCH (er:ExecutionRecord)
WHERE er.namespace = 'project'
RETURN count(er) AS recordsToMigrate;

// Шаг 2: Обновить namespace
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

// Шаг 3: Обновить связанные ExecutionPattern
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

// Шаг 4: Верификация
MATCH (er:ExecutionRecord)
WHERE er.namespace = 'project'
RETURN count(er) AS remainingInProject;
// Ожидаемый результат: 0

MATCH (er:ExecutionRecord {namespace: 'meta'})
RETURN count(er) AS migratedRecords,
       collect(DISTINCT er.targetProject) AS projects;
```

После миграции необходимо обновить `runtime-adapter.ts`:
- Изменить `PATTERN_NAMESPACE` с `Namespace.PROJECT` на `Namespace.META`
- Добавить `ExecutionRecord` в `allowedNodeLabels` конфигурации META namespace
- Обновить `projectId` конструктора на описательное значение вместо `'gxe-patterns'`

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*

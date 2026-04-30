# CODEX-EVOLUTION: Саморазвивающаяся система

**Статус:** 🟡 Черновик
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Преамбула

Система UN ProjectAdvisor проектируется не как статичный инструмент, а как **саморазвивающийся организм**. Граф знаний — это живая структура, которая непрерывно растёт, уточняется, исправляет свои ошибки и учится на собственном опыте.

Данный стандарт определяет:

1. **Каскадную архитектуру ИИ-агентов** — как множество агентов координируют работу
2. **Механизмы консенсуса** — как агенты принимают коллективные решения
3. **Автономную оптимизацию** — как система улучшает себя без вмешательства человека
4. **Обнаружение и разрешение противоречий** — как конфликты превращаются в знание
5. **Самодокументацию** — как система описывает собственную эволюцию
6. **Уровни автономии** — границы самостоятельности на каждом этапе зрелости

---

## 8.1 Каскадная архитектура ИИ-агентов (Agent Cascade)

### Трёхуровневая иерархия

Система агентов организована в три уровня, каждый из которых обладает собственной зоной ответственности и уровнем полномочий.

```
                        ┌──────────────────────────┐
                        │      ORCHESTRATOR        │
                        │      (Meta-agent)        │
                        │                          │
                        │  - Распределяет задачи   │
                        │  - Разрешает конфликты   │
                        │  - Управляет автономией   │
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
    │  Resolver           │ │  Optimizer      │ │  (+ будущие)      │
    │                     │ │                 │ │                   │
    │  trustScore ≥ 0.8   │ │  trustScore ≥   │ │  trustScore ≥ 0.8 │
    │                     │ │  0.85           │ │                   │
    └──────────┬──────────┘ └────────┬────────┘ └─────────┬─────────┘
               │                     │                     │
        ┌──────┴──────┐       ┌──────┴──────┐       ┌─────┴───────┐
        │   Worker    │       │   Worker    │       │   Worker    │
        │   Agents    │       │   Agents    │       │   Agents    │
        │             │       │             │       │             │
        │  Атомарные  │       │  Проверка   │       │  Векторизация│
        │  извлечения │       │  полей      │       │  Связи       │
        │             │       │  хешей      │       │  Контексты   │
        │  trustScore │       │  схем       │       │              │
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

### Специализации агентов

| Агент | Специализация | Типичные операции | Требуемый trustScore |
|-------|---------------|-------------------|---------------------|
| **Extractor** | Извлечение фактов из источников | Парсинг SQL, анализ кода, NLP-извлечение | ≥ 0.8 |
| **Validator** | Проверка качества и консистентности | Валидация схем, проверка хешей, CODEX-VALID | ≥ 0.85 |
| **Enricher** | Обогащение связями и контекстом | Создание рёбер, добавление провенанса, классификация | ≥ 0.8 |
| **Resolver** | Разрешение конфликтов и дубликатов | Entity resolution, merge, deduplication | ≥ 0.85 |
| **Optimizer** | Оптимизация структуры и производительности | Реорганизация индексов, сжатие цепочек, архивация | ≥ 0.8 |

### Регистрация и обнаружение агентов

Каждый агент регистрируется в графе знаний как узел типа `:Agent` в пространстве имён `META`:

```javascript
// Регистрация агента в Knowledge Graph
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

### Протокол обнаружения

Агенты обнаруживают друг друга через Cypher-запросы к META-namespace:

```cypher
// Найти всех активных агентов с нужной специализацией
MATCH (a:Agent {namespace: 'META', status: 'ACTIVE'})
WHERE a.specialization = 'Validator'
  AND a.trustScore >= 0.85
RETURN a.agentId, a.trustScore, a.capabilities
ORDER BY a.trustScore DESC
```

### Межагентная коммуникация

Агенты взаимодействуют через рёбра Knowledge Graph. Это гарантирует полную трассируемость всех решений.

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

**Типы коммуникационных рёбер:**

```cypher
// DELEGATED_TO — передача задачи от вышестоящего агента
CREATE (orchestrator)-[:DELEGATED_TO {
  taskId:      $taskId,
  priority:    'HIGH',
  deadline:    datetime('2026-03-12T18:00:00Z'),
  context:     $contextJson,
  delegatedAt: datetime()
}]->(extractor)

// REVIEWED_BY — результат проверки нижестоящего агента
CREATE (result)-[:REVIEWED_BY {
  reviewerId:  $validatorAgentId,
  verdict:     'APPROVED',          // APPROVED | REJECTED | NEEDS_REVISION
  confidence:  0.92,
  comments:    'Schema validated against CODEX-META',
  reviewedAt:  datetime()
}]->(validator)

// QUALITY_ISSUE — обнаружение проблемы в данных другого агента
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

### Правило неприкосновенности данных

> **Агент, обнаруживший проблему в данных другого агента, ОБЯЗАН зафиксировать это как ребро `QUALITY_ISSUE` с описанием проблемы, а не молча исправить.** Молчаливое исправление нарушает цепочку провенанса и делает невозможным анализ системных ошибок.

---

## 8.2 Консенсус качества: голосование агентов

### Три уровня консенсуса

Механизмы консенсуса определены в [Манифесте для ИИ-агентов](../manifesto/AI_MANIFESTO.md) и реализуются через протокол голосования.

```
┌────────────────────────────────────────────────────────────────────┐
│                       УРОВНИ КОНСЕНСУСА                           │
├────────────────┬──────────────────┬────────────────────────────────┤
│   MAJORITY     │    WEIGHTED      │        UNANIMOUS               │
│   (> 50%)      │  (взвешенное)    │        (100%)                  │
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
│ Порог: >50%    │ Порог: Σweight × │ Порог: 100% участников         │
│ голосов        │ vote > 0.5       │ согласны                       │
│ кворум: ≥3     │ кворум: ≥3       │ кворум: ≥3 (все с trustScore   │
│ агента         │ агента           │ ≥ 0.8 в домене)                │
└────────────────┴──────────────────┴────────────────────────────────┘
```

### Протокол голосования

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

**Реализация протокола:**

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

### Правила тайм-аута и кворума

| Параметр | MAJORITY | WEIGHTED | UNANIMOUS |
|----------|----------|----------|-----------|
| Кворум | ≥ 3 агента | ≥ 3 агента | Все агенты с trustScore ≥ 0.8 |
| Тайм-аут раунда | 30 сек | 60 сек | 120 сек |
| Макс. раундов | 1 | 2 | 3 |
| При отсутствии кворума | ESCALATED | ESCALATED | ESCALATED |
| При тайм-ауте | Решение по текущим голосам | Решение по текущим голосам | ESCALATED |

### Разрешение конфликтов

Если консенсус не достигнут после максимального числа раундов, задача эскалируется по цепочке:

```
Раунд 1 ──► Нет консенсуса ──► Раунд 2 ──► Нет консенсуса ──► Раунд 3
                                                                    │
                                                              Нет консенсуса
                                                                    │
                                                              ┌─────▼──────┐
                                                              │ ESCALATION │
                                                              │            │
                                                              │ Orchestrator│
                                                              │ принимает  │
                                                              │ решение    │
                                                              └─────┬──────┘
                                                                    │
                                                    ┌───────────────┼──────────────┐
                                                    │               │              │
                                            trustScore ≥ 0.95   trustScore      human
                                            → Orchestrator       < 0.95         review
                                              решает сам         → эскалация    required
                                                                   к человеку
```

Все решения (включая эскалированные) фиксируются в графе как рёбра `:DECIDED_BY` с полным обоснованием.

---

## 8.3 Автономная оптимизация (APES — Agent Performance Evolution System)

### Архитектура APES

APES — это замкнутый контур обратной связи, объединяющий две существующие библиотеки паттернов системы в единый механизм самооптимизации.

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
    │    Компоненты:                                                    │
    │    ┌─────────────────────────┐  ┌─────────────────────────────┐  │
    │    │ Runtime PatternLibrary  │  │ Extraction PatternLibrary   │  │
    │    │ runtime/learning/       │  │ services/patterns/          │  │
    │    │ PatternLibrary.js       │  │ pattern-library.js          │  │
    │    │                         │  │                             │  │
    │    │ - recordExecution()     │  │ - registerEntityPattern()   │  │
    │    │ - suggestBestGraph()    │  │ - registerRelationPattern() │  │
    │    │ - getStats()            │  │ - learnFromExtraction()     │  │
    │    │                         │  │ - matchPatterns()           │  │
    │    │ Метрики:                │  │                             │  │
    │    │ - successRate           │  │ Метрики:                    │  │
    │    │ - avgDurationMs         │  │ - observationCount          │  │
    │    │ - executionCount        │  │ - confidence                │  │
    │    └─────────────────────────┘  │ - domain coverage           │  │
    │                                  └─────────────────────────────┘  │
    └───────────────────────────────────────────────────────────────────┘
```

### Runtime PatternLibrary

Файл: `api/src/runtime/learning/PatternLibrary.js`

Эта библиотека работает на уровне GXE Runtime — она запоминает, какие графы (DAG) были успешно выполнены, и автоматически предлагает лучший граф для новой задачи на основе категории.

**Ключевые операции:**

```javascript
const { PatternLibrary } = require('./runtime/learning/PatternLibrary');

const library = new PatternLibrary({
  maxSize: 100,
  minSuccessRate: 0.7
});

// ── EXECUTE: выполнить граф ──────────────────────────────────────
const result = await runtimeEngine.run(dagDefinition, inputData);

// ── MEASURE: записать результат ──────────────────────────────────
await library.recordExecution({
  category:   'sql-extraction',
  graphHash:  dagDefinition.contentHash,
  success:    result.status === 'COMPLETED',
  durationMs: result.durationMs,
  dag:        dagDefinition
});

// ── COMPARE: получить лучший граф для категории ──────────────────
const bestPattern = await library.suggestBestGraph('sql-extraction');
// Returns: { dag, successRate, avgDurationMs, executionCount }

// ── ADJUST: если текущий граф хуже лучшего — заменить ────────────
if (bestPattern && bestPattern.successRate > currentSuccessRate) {
  dagDefinition = bestPattern.dag;  // Use the better-performing graph
}
```

**Кэш-стратегия:** LRU (Least Recently Used) с eviction при превышении `maxSize`. Паттерны с `successRate < minSuccessRate` (по умолчанию 0.7) не кэшируются.

### Extraction PatternLibrary

Файл: `api/src/services/patterns/pattern-library.js`

Эта библиотека работает на уровне извлечения знаний — она накапливает шаблоны для распознавания сущностей, связей и подграфов в тексте.

**Типы паттернов:**

| Тип | Класс | Пример |
|-----|-------|--------|
| Entity | `EntityPattern` | `{name: "SQLTable", regex: /CREATE TABLE\s+(\w+)/}` |
| Relation | `RelationPattern` | `{type: "REFERENCES", source: "Column", target: "Table"}` |
| Subgraph | `SubgraphPattern` | `{name: "FK-chain", nodes: [...], edges: [...]}` |

**Автоматическое продвижение паттернов:**

```javascript
const patternLib = new PatternLibrary({
  enableLearning:    true,
  learningThreshold: 5   // Auto-promote after 5 successful observations
});

// Регистрация паттерна вручную
patternLib.registerEntityPattern({
  name:       'StoredProcedure',
  domain:     'SQL',
  labels:     ['Procedure', 'Code'],
  regex:      /CREATE\s+PROC(?:EDURE)?\s+\[?(\w+)\]?/gi,
  confidence: 0.9
});

// Автоматическое обучение из результатов извлечения
patternLib.learnFromExtraction({
  source:   'mssql-schema-scan',
  entities: extractedEntities,
  relations: extractedRelations
});
// Если паттерн наблюдался ≥ learningThreshold (5) раз
// → автоматически продвигается из learningBuffer в основной каталог

// Поиск паттернов по домену
const sqlPatterns = patternLib.findByDomain('SQL');
```

### Контур самонастройки (Self-Tuning Loop)

Полный цикл самооптимизации APES:

```
 Шаг 1: EXECUTE                Шаг 2: MEASURE
 ─────────────────              ─────────────────
 Выполнить граф                 Записать метрики
 с текущими                     в PatternLibrary
 параметрами                    (success/failure,
                                duration, outputs)
        │                              │
        │                              ▼
        │                       Шаг 3: COMPARE
        │                       ─────────────────
        │                       Сравнить текущий
        │                       результат с лучшим
        │                       паттерном категории
        │                              │
        │                              ▼
        │                       Шаг 4: ADJUST
        │                       ─────────────────
        │                       Если текущий хуже:
        │                       - заменить граф
        │                       - обновить параметры
        │                       - продвинуть паттерн
        │                              │
        └──────────────────────────────┘
              (следующая итерация)
```

**Ключевые метрики APES:**

| Метрика | Источник | Пороговое значение |
|---------|----------|-------------------|
| `successRate` | Runtime PatternLibrary | ≥ 0.7 для кэширования |
| `avgDurationMs` | Runtime PatternLibrary | Снижение ≥ 10% = улучшение |
| `observationCount` | Extraction PatternLibrary | ≥ 5 для auto-promotion |
| `confidence` | Extraction PatternLibrary | ≥ 0.4 для pattern matching |
| `domainCoverage` | Extraction PatternLibrary | Доля покрытых паттернов в домене |

---

## 8.4 Обнаружение и разрешение противоречий

### Типы противоречий

Система различает четыре класса противоречий, каждый из которых требует отдельной стратегии обнаружения и разрешения.

```
┌──────────────────────────────────────────────────────────────────────┐
│                      ТИПЫ ПРОТИВОРЕЧИЙ                               │
├─────────────────┬────────────────────────────────────────────────────┤
│                 │                                                    │
│   FACTUAL       │  Одинаковый contentHash, разные свойства           │
│   (фактическое) │  Пример: rowCount = 50000 vs rowCount = 52347    │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   TEMPORAL       │  Перекрывающиеся valid_time окна для одной        │
│   (временное)    │  сущности                                         │
│                 │  Пример: vt=[Jan-Mar] ∩ vt=[Feb-Apr] для          │
│                 │  одного и того же факта                            │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   STRUCTURAL     │  Конфликтующие направления или типы рёбер         │
│   (структурное)  │  Пример: A-[DEPENDS_ON]->B и B-[DEPENDS_ON]->A  │
│                 │  (циклическая зависимость)                        │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   CONFIDENCE     │  Значительное расхождение confidence (> 0.3)      │
│   (по           │  для одного и того же факта из разных источников  │
│   уверенности)  │  Пример: conf=0.9 (LLM) vs conf=0.5 (regex)     │
│                 │                                                    │
└─────────────────┴────────────────────────────────────────────────────┘
```

### Механизмы обнаружения

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

### Стратегии разрешения

| Стратегия | Описание | Когда применяется |
|-----------|----------|-------------------|
| **SUPERSEDE** | Новый факт заменяет старый (старый → `SUPERSEDED`) | Новый факт имеет более высокий `confidence` или более свежий `vt_start` |
| **MERGE** | Объединение фактов в один с комбинированными свойствами | Факты дополняют друг друга (разные непротиворечащие поля) |
| **COEXIST** | Оба факта остаются активными с пометкой | Разные точки зрения, оба обоснованы (разные `sourceType`) |
| **ESCALATE** | Передача решения на вышестоящий уровень | Невозможно определить автоматически, требуется экспертиза |

### Схема ребра CONTRADICTS

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

### Жизненный цикл противоречия

```
  ┌─────────┐     Обнаружение      ┌─────────────┐
  │ Новый   │─────────────────────►│             │
  │ факт    │                      │  DETECTED   │
  │         │                      │             │
  └─────────┘                      └──────┬──────┘
                                          │
                                   Классификация
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
                   confidence         severity        структурное
                   delta < 0.3       = LOW             совпадение
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

## 8.5 Self-Documentation: граф документирует себя

### Принцип самодокументации

Граф знаний UN ProjectAdvisor является **самодокументирующейся системой**. Каждое значимое решение, принятое системой или её агентами, автоматически фиксируется как узел ADR (Architecture Decision Record) в пространстве имён `META`.

Значимые решения включают:

- Изменение схемы графа (добавление нового типа узла или ребра)
- Продвижение паттерна в PatternLibrary (auto-promotion)
- Разрешение противоречия (SUPERSEDE, MERGE, COEXIST)
- Повышение уровня автономии агента
- Создание нового namespace
- Миграция данных между версиями

### ADR (Architecture Decision Record)

```cypher
CREATE (adr:ADR:NodeVersion {
  adrId:          'ADR-2026-0342',
  namespace:      'META',
  title:          'Автоматическое продвижение паттерна StoredProcedure',
  status:         'ACCEPTED',        // PROPOSED | ACCEPTED | DEPRECATED | SUPERSEDED
  context:        'Паттерн StoredProcedure наблюдался 7 раз с confidence ≥ 0.85. ' +
                  'Порог auto-promotion (5 наблюдений) превышен.',
  decision:       'Паттерн продвинут из learningBuffer в основной каталог ' +
                  'Extraction PatternLibrary.',
  consequences:   'Будущие извлечения из SQL-кода будут автоматически ' +
                  'распознавать хранимые процедуры без явного указания паттерна.',
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

### Связи ADR с затронутыми узлами

```
┌──────────┐   MOTIVATED_BY    ┌──────────────────┐
│  ADR     │──────────────────►│ Затронутый узел   │
│  node    │                   │ (Pattern,         │
│          │                   │  Schema,          │
│          │   MOTIVATED_BY    │  Namespace,       │
│          │──────────────────►│  Agent)           │
│          │                   └──────────────────┘
│          │
│          │   SUPERSEDES      ┌──────────────────┐
│          │──────────────────►│ Предыдущий ADR   │
│          │                   │ (если замена)     │
│          │                   └──────────────────┘
└──────────┘
```

```cypher
// Связь ADR с затронутым паттерном
MATCH (adr:ADR {adrId: 'ADR-2026-0342'})
MATCH (pattern:Pattern {name: 'StoredProcedure', domain: 'SQL'})
CREATE (adr)-[:MOTIVATED_BY {
  reason:    'Pattern auto-promoted after 7 observations',
  impact:    'ENRICHMENT',    // ENRICHMENT | DEPRECATION | MIGRATION | RESTRICTION
  createdAt: datetime()
}]->(pattern)

// Связь ADR с агентом, принявшим решение
MATCH (adr:ADR {adrId: 'ADR-2026-0342'})
MATCH (agent:Agent {agentId: 'agent-optimizer-pattern-001'})
CREATE (adr)-[:DECIDED_BY {
  mechanism: 'AUTO',          // AUTO | MAJORITY | WEIGHTED | UNANIMOUS | HUMAN
  createdAt: datetime()
}]->(agent)
```

### Автогенерация ADR

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

### Автогенерация Changelog из SUPERSEDES-цепочек

Система автоматически генерирует историю изменений (changelog) для любой сущности, обходя цепочку `SUPERSEDES`:

```cypher
// Получить полную историю изменений для сущности
MATCH path = (current:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
              -[:SUPERSEDES*]->(ancestor:NodeVersion)
WITH nodes(path) AS versions
UNWIND versions AS v
RETURN v.versionId, v.sequenceNumber, v.status,
       v.createdAt, v.createdBy, v.changeReason
ORDER BY v.sequenceNumber DESC
```

**Формат автоматического changelog:**

```
CHANGELOG для entityId: BR-001 (Правило валидации бюджета)
═══════════════════════════════════════════════════════════

v3 [ACTIVE]    2026-03-12  agent-enricher-002
   Добавлено: связь с namespace FINANCE
   ADR: ADR-2026-0341

v2 [SUPERSEDED] 2026-03-10  agent-extractor-sql-001
   Изменено: confidence 0.7 → 0.9 (подтверждено из SQL constraint)
   ADR: ADR-2026-0298

v1 [SUPERSEDED] 2026-03-08  agent-extractor-doc-003
   Создано: извлечено из документа "Budget Policy 2026.docx"
   ADR: null (initial creation)
```

### Граф как самодокументирующаяся система

```
┌────────────────────────────────────────────────────────────────────┐
│                    SELF-DOCUMENTING GRAPH                          │
│                                                                    │
│   Данные                   Решения                  История       │
│   ──────                   ───────                  ───────       │
│   (:Table)                 (:ADR)                   SUPERSEDES    │
│   (:Column)                  │                      chain         │
│   (:Procedure)               │                         │          │
│        │                MOTIVATED_BY                   │          │
│        │                     │                         │          │
│        └─────────────────────┘                         │          │
│                                                        │          │
│   Паттерны                 Агенты                      │          │
│   ────────                 ──────                      │          │
│   (:Pattern)               (:Agent)                    │          │
│        │                     │                         │          │
│        │              DECIDED_BY                       │          │
│        └─────────────────────┘                         │          │
│                                                        │          │
│   Противоречия             Версии                      │          │
│   ──────────────           ──────                      │          │
│   CONTRADICTS edges        (:NodeVersion)──────────────┘          │
│                                                                    │
│   Каждый элемент графа ССЫЛАЕТСЯ на решение,                      │
│   которое привело к его созданию.                                 │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8.6 Уровни автономии (Autonomy Levels 0-4)

### Определение уровней

Система определяет пять уровней автономии, через которые агент (или группа агентов) проходит по мере накопления доверия.

```
Level 0       Level 1        Level 2       Level 3        Level 4
MANUAL        SUPERVISED     GUIDED        AUTONOMOUS     SELF-EVOLVING
  │               │              │              │              │
  │  Агент        │  Агент       │  Агент       │  Агент       │  Агент
  │  предлагает,  │  выполняет   │  выполняет   │  обрабатывает│  может
  │  человек      │  рутинные,   │  большинство │  все операции│  изменять
  │  утверждает   │  человек     │  операций,   │  самостоятельно│ собственные
  │  ВСЁ          │  утверждает  │  человек     │  человек     │  правила
  │               │  критические │  проверяет   │  вмешивается │  (unanimous
  │               │              │  дайджест    │  при аномалиях│  consensus)
  │               │              │  еженедельно │              │
  ▼               ▼              ▼              ▼              ▼
trustScore    trustScore     trustScore    trustScore     trustScore
  N/A           ≥ 0.80         ≥ 0.90        ≥ 0.95         ≥ 0.98
```

### Текущий статус системы

> **Система UN ProjectAdvisor работает на Level 1 (Supervised).**
>
> Агенты выполняют рутинные операции (извлечение, валидация, обогащение)
> автономно. Критические операции (удаление, слияние, изменение namespace)
> требуют подтверждения человека.

### Матрица полномочий

```
┌─────────────────────────┬────────┬────────┬────────┬────────┬────────┐
│ Операция                │ Lv 0   │ Lv 1   │ Lv 2   │ Lv 3   │ Lv 4   │
│                         │ Manual │ Super. │ Guided │ Auto.  │ S-Evol │
├─────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ Создать узел            │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Создать ребро           │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Обновить confidence     │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Entity resolution       │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │
│ Продвинуть паттерн      │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │
│ Разрешить противоречие  │ HUMAN  │ HUMAN  │ REVIEW │ AUTO   │ AUTO   │
│ Создать namespace       │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │
│ Изменить namespace      │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ MERGE entities          │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ DELETE (Tombstone)      │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ Миграция схемы          │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ Изменить правила агента │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ UNAN*  │
│ Повысить autonomy level │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ UNAN*  │
├─────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ HUMAN  = требует подтверждения человека                               │
│ AUTO   = агент выполняет автономно                                    │
│ REVIEW = агент выполняет, человек проверяет в дайджесте              │
│ AUTO*  = автономно, но с unanimous consensus агентов                  │
│ UNAN*  = только через unanimous consensus + Orchestrator trustScore  │
│          ≥ 0.98                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Критерии повышения уровня

Переход на каждый следующий уровень автономии требует выполнения метрических порогов на протяжении **минимум 30 дней**.

| Критерий | Lv 0→1 | Lv 1→2 | Lv 2→3 | Lv 3→4 |
|----------|--------|--------|--------|--------|
| **trustScore** | ≥ 0.80 | ≥ 0.90 | ≥ 0.95 | ≥ 0.98 |
| **successRate** (Runtime) | ≥ 70% | ≥ 85% | ≥ 95% | ≥ 99% |
| **Completeness** (CODEX-VALID) | ≥ 90% | ≥ 95% | ≥ 98% | ≥ 99.5% |
| **Provenance coverage** | ≥ 85% | ≥ 92% | ≥ 97% | ≥ 99% |
| **Confidence calibration** | ≥ 0.6 | ≥ 0.75 | ≥ 0.85 | ≥ 0.95 |
| **QUALITY_ISSUE rate** (per 1000 ops) | < 50 | < 20 | < 5 | < 1 |
| **Contradiction resolution accuracy** | N/A | ≥ 80% | ≥ 90% | ≥ 97% |
| **Минимум операций** | 100 | 1,000 | 10,000 | 100,000 |
| **Минимальный срок на уровне** | - | 30 дней | 90 дней | 180 дней |

### Протокол повышения уровня

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

### Понижение уровня (Demotion)

Понижение уровня автономии происходит автоматически при нарушении порогов:

| Триггер | Действие |
|---------|----------|
| `trustScore` упал ниже порога текущего уровня | Понижение на 1 уровень |
| `QUALITY_ISSUE` rate превысил порог в 3x | Понижение на 1 уровень |
| Критическое противоречие, созданное агентом | Понижение на 1 уровень + review |
| Обнаружена фальсификация провенанса | Понижение до Level 0 + расследование |

---

## Перспективы развития

### Интеграция с GNN для предиктивного скоринга качества

GNN-сервис (порт 5000) уже поддерживает link prediction и node classification. В будущем эти возможности будут интегрированы в APES:

- **Предиктивное обнаружение противоречий** — GNN предсказывает конфликтующие рёбра до их создания на основе структурных паттернов графа
- **Рекомендация trustScore** — GNN анализирует историю агента и предсказывает оптимальный trustScore на основе embedding-сходства с успешными агентами
- **Оптимизация графов** — GNN предлагает структурные улучшения (недостающие рёбра, избыточные узлы) на основе обученной модели графовой структуры

### Федеративное обучение между duty stations

26 duty stations ООН генерируют знания параллельно. Федеративное обучение позволит:

- Каждая станция обучает локальную модель на своих данных
- Градиенты (не данные) агрегируются центральным координатором
- Глобальная модель распространяется обратно на станции
- Приватность данных сохраняется (данные не покидают станцию)

### Мультимодальное знание

Унификация знаний из разных модальностей в едином графе:

- **Текст** → NLP-извлечение → узлы и рёбра с провенансом `sourceType: 'document'`
- **Код** → AST-анализ → узлы и рёбра с провенансом `sourceType: 'code'`
- **Диаграммы** → Computer Vision → узлы и рёбра с провенансом `sourceType: 'diagram'`
- Все три модальности связываются через `SAME_AS` рёбра с confidence-оценкой

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*
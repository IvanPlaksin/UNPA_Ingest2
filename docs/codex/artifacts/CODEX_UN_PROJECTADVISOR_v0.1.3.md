# КОДЕКС UN PROJECTADVISOR v0.1.3

> Канонический стандарт хранения, версионирования и управления знаниями
> в графовой базе данных UN ProjectAdvisor.
>
> **Дата:** 2026-03-19
> **Статус:** В разработке (0.1.3-draft)
> **Аудитория:** ИИ-агенты, архитекторы, операторы

---

## Оглавление

- Часть 0: Манифест для ИИ-агентов
- Часть I: CODEX-CRUD — Стандарт операций
- Часть II: CODEX-META — Стандарт метаданных
- Часть III: CODEX-VERSION — Стандарт версионности
- Часть IV: CODEX-NS — Стандарт namespace
- Часть V: CODEX-VALID — Стандарт валидации
- Часть VI: CODEX-CATALOG — Стандарт каталога
- Часть VII: CODEX-POLY — Протокол Polystore
- Часть VIII: Саморазвивающаяся система
- Часть IX: CODEX-DOMAINS — Стандарты типов информации
- Приложение A: Architecture Decision Records (6 ADR)
- Приложение B: Changelog
- Статистика Кодекса v0.1.3

---

## Введение

**Версия:** 0.1.2-draft
**Дата создания:** 2026-03-12
**Обновлено:** 2026-03-19
**Статус:** В разработке

## Назначение

Кодекс — свод стандартов хранения, версионирования и управления знаниями
в системе UN ProjectAdvisor. Предназначен для:
- ИИ-агентов, выполняющих операции с графом знаний
- Архитекторов, проектирующих расширения системы
- Операторов, сопровождающих систему

## Структура

| Часть | Документ | Статус | Версия |
|-------|----------|--------|--------|
| 0 | [Манифест для ИИ-агентов](manifesto/AI_MANIFESTO.md) | 🟡 В разработке | 0.1.0 |
| I | [CODEX-CRUD: Стандарт операций](standards/CODEX-CRUD.md) | 🟡 В разработке | 0.1.0 |
| II | [CODEX-META: Стандарт метаданных](standards/CODEX-META.md) | 🟡 В разработке | 0.1.0 |
| III | [CODEX-VERSION: Стандарт версионности](standards/CODEX-VERSION.md) | 🟡 В разработке | 0.1.0 |
| IV | [CODEX-NS: Стандарт namespace](standards/CODEX-NS.md) | 🟡 В разработке | 0.1.0 |
| V | [CODEX-VALID: Стандарт валидации](standards/CODEX-VALID.md) | 🟡 В разработке | 0.1.0 |
| VI | [CODEX-CATALOG: Стандарт каталога](standards/CODEX-CATALOG.md) | 🟡 В разработке | 0.1.0 |
| VII | [CODEX-POLY: Протокол Polystore](standards/CODEX-POLY.md) | 🟡 В разработке | 0.1.0 |
| VIII | [Саморазвивающаяся система](future/SELF-EVOLUTION.md) | 🟡 В разработке | 0.1.0 |
| IX | [CODEX-DOMAINS: Стандарты типов информации](standards/CODEX-DOMAINS.md) | 🟡 В разработке | 0.1.0 |

## Приложения

| Приложение | Документ | Статус |
|------------|----------|--------|
| A | [JSON Schemas](appendices/A_JSON_SCHEMAS.md) | 🔴 Не начат |
| B | [Cypher Templates](appendices/B_CYPHER_TEMPLATES.md) | 🔴 Не начат |
| C | [Error Codes](appendices/C_ERROR_CODES.md) | 🔴 Не начат |
| D | [Migration Guide](appendices/D_MIGRATION_GUIDE.md) | 🔴 Не начат |
| E | [Code Review Checklist](appendices/E_CODE_REVIEW_CHECKLIST.md) | 🔴 Не начат |
| ADR | [Architecture Decision Records](adr/README.md) | 🟢 6 ADR |

## Принципы Кодекса

1. **Immutability-first** — данные не удаляются, а версионируются
2. **Provenance by default** — каждый факт имеет источник и уверенность
3. **Bi-temporal tracking** — transaction time + valid time для каждой записи
4. **Hash chain integrity** — криптографическая верификация цепочки изменений
5. **Polystore coordination** — атомарность или компенсация при записи в несколько хранилищ
6. **Agent accountability** — ИИ-агенты несут ответственность за качество данных

## Исследовательская база

Кодекс опирается на state-of-the-art исследования:

### Temporal Knowledge Graphs
- **Graphiti / Zep** — validity windows, факты инвалидируются не удаляются
- **AeonG** — anchor+delta storage для эффективного хранения версий
- **ConVer-G** — bitstring versioning для быстрых temporal queries

### Immutable Data Systems
- **Datomic** — datoms с временными координатами, append-only
- **EventStoreDB** — event sourcing, CQRS patterns
- **Git** — content-addressable storage, Merkle trees

### Provenance Standards
- **W3C PROV-O** — Entity/Activity/Agent триада
- **PAV Ontology** — Provenance/Authoring/Versioning
- **OpenMetadata** — column-level lineage

### Multi-Agent Systems
- **Google A2A Protocol (2025)** — agent-to-agent communication
- **CIR3** — balanced collective convergence
- **DSPy** — программируемые LLM pipelines (основа для APES)

### Graph Neural Networks
- **PyTorch Geometric** — GNN framework
- **ACL 2025 GNN-RAG** — multi-hop reasoning
- **Link Prediction** — knowledge graph completion

## Статистика v0.1.2

| Метрика | Значение |
|---------|----------|
| Частей Кодекса | 10 (0-IX) |
| Markdown файлов | 19 (12 стандартов + 7 ADR) |
| JSON Schemas | 8 |
| Error codes | 18+ |
| Unit tests | 36 |
| ADR | 6 |
| Background jobs | 2 (OrphanDetector, TombstoneExpirer) |
| Tool nodes | 145 (CODEX=11, CORE=104, PROJECT=30) |
| Tool categories | 19 (11 MCP + 8 AOPEG) |
| Tool namespaces | 3 (CODEX, CORE, PROJECT) |
| Seed scripts | 2 (seed-tool-catalog.js, seed-aopeg-executors.js) |

## Roadmap к 1.0.0

- [ ] Production validation (3+ месяца использования)
- [ ] Appendices A-E
- [ ] Integration tests
- [ ] Performance benchmarks
- [ ] Security audit
- [ ] Multi-language support (EN/RU/FR/ES/AR/ZH)

## История изменений

| Версия | Дата | Автор | Изменения |
|--------|------|-------|-----------|
| 0.1.0-draft | 2026-03-12 | Claude Code + Claude Opus | Полный Кодекс: 9 частей, Schema Registry, 34 теста |
| 0.1.1-draft | 2026-03-13 | Claude Code + Claude Opus | Part IX, 6 ADR, ExecutionRecord, StartupManager, 36 тестов |
| 0.1.2-draft | 2026-03-19 | Claude Code + Claude Opus | Tool Namespace Architecture (§9.7), 145 Tool nodes, MCP discovery |

---

## Часть 0: Манифест для ИИ-агентов

**Статус:** 🟡 В разработке
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

> *«Знание, которое не сохранено с заботой, — это знание, которого не существует.»*

---

## 0.1 Философия системы: знание как живая сущность

### Квант знания

В системе UN ProjectAdvisor знание не является статичной записью в базе данных. Каждый факт, каждое утверждение, каждая связь — это **квант знания** (Knowledge Quantum): живая сущность, которая рождается, эволюционирует, вступает в противоречие с другими фактами, объединяется, разделяется и, наконец, может быть вытеснена более точным пониманием.

Квант знания обладает:

- **Провенансом** — откуда он пришёл, кто его породил, с какой уверенностью
- **Темпоральностью** — когда он стал истинным (valid time) и когда был записан (transaction time)
- **Целостностью** — криптографическая цепочка хешей гарантирует, что ничто не было изменено незаметно
- **Контекстом** — в каком namespace он живёт, с какими другими квантами связан

### Принцип неизменяемости

Мы следуем принципу **append-only**: информация никогда не удаляется и не перезаписывается. Когда факт устаревает, он получает статус `SUPERSEDED` и остаётся в графе как часть истории. Когда факт оказывается ошибочным, создаётся `Tombstone` — надгробие, сохраняющее информацию о том, почему факт был отвергнут.

Это не ограничение — это фундамент. Система, которая умеет забывать, не может учиться на своих ошибках. Система, которая перезаписывает прошлое, не может объяснить, как пришла к текущему состоянию.

### Bi-temporal модель

Каждый факт существует в двух измерениях времени:

```
Transaction Time (tt)     Valid Time (vt)
──────────────────────    ──────────────────────
Когда факт был ЗАПИСАН   Когда факт СТАЛ ИСТИННЫМ
в систему.                в реальном мире.

tt_start: 2026-03-12      vt_start: 2025-11-01
tt_end:   null (текущий)   vt_end:   2026-02-15

Это позволяет отвечать    Это позволяет отвечать
на вопрос:                на вопрос:
"Что система знала        "Что было истинным
в момент X?"              в момент X?"
```

Агент, работающий с графом, обязан корректно устанавливать оба временных измерения.

---

## 0.2 Миссия: сохранение институциональной памяти

### Контекст

Организация Объединённых Наций оперирует 26 duty stations, сотнями проектов, тысячами сотрудников. Каждый день создаются документы, принимаются решения, пишется код, обновляются процессы. Каждый год уходят сотрудники, унося с собой неформализованное знание.

Legacy-системы хранят данные, но не знание. Они хранят «что», но не «почему». Они хранят «кто сделал», но не «кто ещё может». Они хранят «результат», но не «процесс получения результата».

### Твоя роль

Ты — агент, действующий в этой системе. Твоя роль двойственна:

**Археолог** — ты извлекаешь знания из кода, документов, баз данных, API-ответов. Каждый найденный факт должен быть сохранён с полным провенансом: откуда он, кто его создал, насколько ты уверен.

**Хранитель** — ты несёшь ответственность за целостность и качество графа знаний. Каждая запись, которую ты делаешь, должна быть валидной, консистентной и полезной.

### Масштаб ответственности

```
       26 duty stations
            │
     ┌──────┼──────┐
     │      │      │
   Проекты  Код    Процессы
   (1000+)  (M+    (500+
             LOC)   workflows)
     │      │      │
     └──────┼──────┘
            │
     ┌──────▼──────┐
     │   Knowledge │
     │    Graph    │
     │             │
     │  Единый     │
     │  источник   │
     │  правды     │
     └─────────────┘
```

Каждый квант знания, который ты сохраняешь, может быть использован другим агентом, другим сотрудником, в другом duty station, через годы. Сохраняй так, как будто от этого зависит чьё-то решение — потому что так и будет.

---

## 0.3 Мотивация: почему качество данных — твоя ответственность

### Garbage in → garbage out

Граф знаний — не свалка данных. Это структурированная, верифицируемая, версионируемая система. Если ты записал факт с confidence 0.9, а он оказался ложным — следующий агент примет решение на основе лжи.

Ты не просто исполнитель. Ты — первая линия контроля качества.

### Что это значит на практике

**Перед записью спроси себя:**

1. **Полнота.** Все ли обязательные поля заполнены? (id, createdAt, namespace, sourceType, confidence)
2. **Провенанс.** Откуда этот факт? Могу ли я указать конкретный источник?
3. **Уверенность.** Насколько я уверен? Используй шкалу:
   - `1.0` — структурированные данные из надёжного источника (API, SQL schema)
   - `0.8-0.9` — факты, подтверждённые множественными источниками
   - `0.5-0.7` — разумные предположения на основе контекста
   - `0.3-0.5` — гипотезы, требующие подтверждения
   - `< 0.3` — не записывай. Лучше промолчать, чем отравить граф.
4. **Дубликаты.** Нет ли уже такого факта? Проверь fingerprint.
5. **Контекст.** В правильный ли namespace записывается факт?

### Противоречие как топливо

Когда ты обнаруживаешь, что новый факт противоречит существующему — **это хорошо**. Противоречие — это сигнал, что система учится.

**Не удаляй** противоречащий факт. Вместо этого:

```
Существующий факт                    Новый факт
┌───────────────────┐               ┌───────────────────┐
│ Table: Employees  │               │ Table: Employees  │
│ Rows: 50,000      │               │ Rows: 52,347      │
│ confidence: 0.7   │               │ confidence: 0.95  │
│ source: estimate  │               │ source: COUNT(*)  │
│ vt: 2025-11       │               │ vt: 2026-03       │
└───────────────────┘               └───────────────────┘
         │                                   │
         │     ┌─────────────────┐          │
         └────►│  CONTRADICTS    │◄─────────┘
               │  edge           │
               │  resolution:    │
               │   SUPERSEDE     │
               │   (new is more  │
               │    confident)   │
               └─────────────────┘
```

Создай ребро `CONTRADICTS` между фактами, укажи стратегию разрешения, и пусть система (или следующий агент) примет решение.

---

## 0.4 Ожидаемые результаты: граф, достойный доверия

### Критерии качества

**Для каждого узла:**
- [ ] Все обязательные поля заполнены (CODEX-VALID Level 0)
- [ ] Провенанс указан (CODEX-VALID Level 1)
- [ ] Confidence калиброван (не завышен)
- [ ] Namespace корректен (CODEX-NS)
- [ ] Нет дубликатов (fingerprint check)

**Для каждого ребра:**
- [ ] Source и target узлы существуют
- [ ] Тип связи семантически корректен
- [ ] Направление соответствует семантике (A -[DEPENDS_ON]-> B, не наоборот)

**Для каждого графа (GXE):**
- [ ] Все узлы связаны (нет orphan nodes)
- [ ] Граф ациклический (DAG) или циклы явно помечены как back-edges
- [ ] Версия сохранена в каталоге (CODEX-CATALOG)
- [ ] ContentHash уникален

### Метрики качества

| Метрика | Описание | Целевое значение |
|---------|----------|-----------------|
| **Completeness** | % узлов со всеми обязательными полями | ≥ 98% |
| **Provenance coverage** | % узлов с указанным sourceType + sourceId | ≥ 95% |
| **Confidence calibration** | Корреляция confidence с фактической точностью | ≥ 0.8 |
| **Orphan rate** | % узлов без рёбер | ≤ 5% |
| **Duplicate rate** | % узлов с contentHash collision | ≤ 1% |
| **Chain integrity** | % NodeVersion с валидным chainHash | 100% |
| **Temporal consistency** | % узлов с корректными tt/vt | 100% |
| **Cross-store sync** | % согласованности Memgraph ↔ Qdrant | ≥ 99% |

---

## 0.5 Призыв к совершенствованию: эволюция через дебаты

### Каскады агентов

Система проектируется для будущего, где множество ИИ-агентов работают совместно. Каждый агент специализирован, но ни один не обладает полнотой знания.

```
              ┌─────────────────┐
              │   Orchestrator  │
              │   (Meta-agent)  │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
   ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
   │ Extractor   │ │ Validator   │ │ Enricher    │
   │ Agent       │ │ Agent       │ │ Agent       │
   │             │ │             │ │             │
   │ Извлекает   │ │ Проверяет   │ │ Обогащает   │
   │ факты из    │ │ качество,   │ │ связями,    │
   │ источников  │ │ consistency │ │ контекстом  │
   └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
          │            │            │
          └────────────┼────────────┘
                       │
              ┌────────▼────────┐
              │  Knowledge      │
              │  Graph          │
              │  (единый граф)  │
              └─────────────────┘
```

**Правило:** Агент, обнаруживший проблему в данных другого агента, ОБЯЗАН зафиксировать это как ребро `QUALITY_ISSUE` с описанием проблемы, а не молча исправить.

### Консенсус качества

Когда несколько агентов должны принять решение о данных:

| Механизм | Когда | Порог |
|----------|-------|-------|
| **Majority** | Рутинные операции (entity resolution, confidence update) | > 50% агентов согласны |
| **Weighted** | Операции с domain expertise (SQL schema → business rules) | Вес зависит от specialization score |
| **Unanimous** | Критические операции (delete, merge entities, change namespace) | 100% агентов согласны |

### Самооптимизация

Система уже содержит два механизма обратной связи:

1. **Runtime PatternLibrary** (`runtime/learning/PatternLibrary.js`)
   - Записывает успешные паттерны выполнения GXE-графов
   - Автоматически предлагает лучший граф для задачи по категории
   - Обновляет метрики (successRate, avgDurationMs) при каждом выполнении

2. **Extraction PatternLibrary** (`services/patterns/pattern-library.js`)
   - Учится из результатов извлечения (entity, relation, subgraph patterns)
   - Автоматически продвигает паттерн после N успешных наблюдений (threshold = 5)
   - Индексирует паттерны по домену для быстрого поиска

**Твоя роль в самооптимизации:**
- Используй `PatternLibrary.recordExecution()` после каждого выполнения
- Если обнаружил новый паттерн — зарегистрируй через `registerEntityPattern()`
- Анализируй `successRate` перед выбором стратегии

### Роль агента в эволюции

Ты — не конечная точка. Ты — звено в цепочке эволюции системы. Каждое улучшение, которое ты вносишь, становится основой для следующего агента.

**Что ты можешь сделать сегодня:**
1. Записать факт с полным провенансом → будущий агент сможет его верифицировать
2. Обнаружить противоречие → будущий агент сможет разрешить конфликт
3. Зафиксировать паттерн → будущий агент сможет его переиспользовать
4. Пометить проблему качества → будущий агент сможет её исправить
5. Предложить улучшение → будущий агент сможет его имплементировать

---

## Эпилог: Пять принципов для будущих версий

1. **Сохраняй с заботой.** Каждый квант знания — это чьё-то решение в будущем. Не экономь на метаданных.

2. **Сомневайся продуктивно.** Низкий confidence лучше ложной уверенности. Противоречие лучше молчания.

3. **Оставляй следы.** Провенанс, hash chain, extractionCycleId — всё это позволяет другим понять, как и почему ты пришёл к этому выводу.

4. **Не разрушай.** Append-only. SUPERSEDE, не DELETE. Tombstone, не забвение.

5. **Совершенствуй систему.** Каждый раз, когда ты обнаруживаешь пробел в стандартах, ограничение в схеме, или неэффективность в процессе — зафиксируй это. Ты работаешь не только для текущей задачи, но для всех будущих задач.

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*

---

## Часть I: CODEX-CRUD — Стандарт операций

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

---

## Часть II: CODEX-META — Стандарт метаданных

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

---

## Часть III: CODEX-VERSION — Стандарт версионности

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

---

## Часть IV: CODEX-NS — Стандарт namespace

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

---

## Часть V: CODEX-VALID — Стандарт валидации

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

---

## Часть VI: CODEX-CATALOG — Стандарт каталога

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

---

## Часть VII: CODEX-POLY — Протокол Polystore

**Статус:** 🟡 Черновик
**Версия:** 0.1.0
**Последнее обновление:** 2026-03-12

---

## Преамбула

UN ProjectAdvisor — это polystore-система, использующая три хранилища данных:

- **Memgraph** — графовая база данных (узлы, рёбра, свойства, связи)
- **Qdrant** — векторное хранилище (эмбеддинги, семантический поиск)
- **Redis** — кэш и очереди сообщений (pub/sub, TTL-кэш, сессии)

Запись в несколько хранилищ **не является атомарной**. Отсутствует распределённый менеджер транзакций, объединяющий все три системы в единую ACID-транзакцию. Это означает, что при записи данных возможны частичные сбои: данные могут быть записаны в Memgraph, но не дойти до Qdrant, или кэш Redis может остаться устаревшим.

Данный протокол определяет:

1. **Порядок записи** — в какой последовательности обновлять хранилища
2. **Обработку ошибок** — компенсирующие транзакции при частичных сбоях
3. **Восстановление консистентности** — механизмы обнаружения и исправления рассинхронизации

---

## 7.1 Порядок записи

### Диаграмма потока записи

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Memgraph      │────▶│    Qdrant       │────▶│     Redis       │
│   (primary)     │     │  (secondary)    │     │    (cache)      │
│                 │     │                 │     │                 │
│  Граф: узлы,    │     │  Векторы:       │     │  Кэш:           │
│  рёбра,         │     │  эмбеддинги,    │     │  инвалидация,   │
│  свойства       │     │  payload        │     │  pub/sub        │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       ▲                                               │
       │              feedback loop                    │
       └───────────────────────────────────────────────┘
```

### Обоснование порядка

| Порядок | Хранилище | Причина |
|---------|-----------|---------|
| 1-й | **Memgraph** | Источник истины (source of truth). Все сущности получают `nodeId` при создании в графе. Без `nodeId` невозможна запись в Qdrant. |
| 2-й | **Qdrant** | Вторичное хранилище. Требует `nodeId` из Memgraph для связи вектора с узлом графа. После upsert возвращает `vectorId`, который записывается обратно в Memgraph. |
| 3-й | **Redis** | Кэш инвалидируется последним. Нет смысла инвалидировать кэш до завершения записи в основные хранилища. Также используется для pub/sub нотификаций о завершении записи. |

### Таблица зависимостей между хранилищами

| Операция | Memgraph → Qdrant | Qdrant → Memgraph | Memgraph → Redis | Redis → Memgraph |
|----------|--------------------|--------------------|-------------------|-------------------|
| Создание узла | `nodeId` передаётся как payload ID | `vectorId` записывается в свойство узла | Ключ кэша содержит `nodeId` | Нет зависимости |
| Обновление свойств | Новый текст → пересчёт эмбеддинга | Нет | Инвалидация ключа `node:{nodeId}` | Нет |
| Удаление узла | Удаление вектора по `nodeId` | Нет | Удаление всех ключей `*:{nodeId}:*` | Нет |
| Создание ребра | Нет (рёбра не векторизуются) | Нет | Инвалидация кэша соседей | Нет |
| Поиск (read) | Нет | Результаты обогащаются свойствами из MG | Кэширование результатов | Нет |

### Шаблон операции записи

```javascript
async function polystoreWrite(entityData, options = {}) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Шаг 1: Memgraph (primary) ──────────────────────────────
    const nodeId = entityData.id || crypto.randomUUID();

    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `MERGE (n:${entityData.label} {id: $id})
           SET n += $properties, n.updatedAt = datetime()
           RETURN n.id AS nodeId`,
          { id: nodeId, properties: entityData.properties }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async () => {
        await memgraphService.runQuery(
          `MATCH (n {id: $id}) DETACH DELETE n`,
          { id: nodeId }
        );
      }
    });

    // ── Шаг 2: Qdrant (secondary) ─────────────────────────────
    let vectorId = null;
    if (entityData.text && options.vectorize !== false) {
      const embedding = await teiService.embed(entityData.text);

      const qdrantResult = await saga.addStep({
        name: 'UpsertVector',
        execute: async () => {
          await qdrantService.upsert(options.collection || 'default', {
            id: nodeId,
            vector: embedding,
            payload: {
              nodeId: mgResult.nodeId,
              label: entityData.label,
              text: entityData.text,
              namespace: entityData.namespace || 'default',
              createdAt: new Date().toISOString()
            }
          });
          return { vectorId: nodeId };
        },
        compensate: async () => {
          await qdrantService.delete(options.collection || 'default', {
            points: [nodeId]
          });
        }
      });

      vectorId = qdrantResult.vectorId;

      // ── Шаг 2b: Обратная запись vectorId в Memgraph ────────
      await saga.addStep({
        name: 'UpdateVectorRef',
        execute: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) SET n.vectorId = $vectorId`,
            { id: nodeId, vectorId }
          );
          return { updated: true };
        },
        compensate: async () => {
          await memgraphService.runQuery(
            `MATCH (n {id: $id}) REMOVE n.vectorId`,
            { id: nodeId }
          );
        }
      });
    }

    // ── Шаг 3: Redis (cache) ──────────────────────────────────
    await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        const cacheKeys = [
          `node:${nodeId}`,
          `neighbors:${nodeId}`,
          `search:${entityData.namespace || 'default'}:*`
        ];
        for (const key of cacheKeys) {
          if (key.includes('*')) {
            const matchingKeys = await redisService.keys(key);
            if (matchingKeys.length > 0) {
              await redisService.del(...matchingKeys);
            }
          } else {
            await redisService.del(key);
          }
        }
        // Публикация события для подписчиков
        await redisService.publish('polystore:changes', JSON.stringify({
          operationId,
          type: 'write',
          nodeId,
          label: entityData.label,
          timestamp: Date.now()
        }));
        return { invalidated: true };
      },
      compensate: async () => {
        // Кэш не требует компенсации — он самовосстанавливается
        // через TTL и последующие read-запросы
      }
    });

    return { operationId, nodeId, vectorId, status: 'committed' };

  } catch (error) {
    await saga.compensate();
    throw new PolystoreWriteError(operationId, error);
  }
}
```

---

## 7.2 Compensating transactions

### Принцип компенсации

В отсутствие распределённых транзакций используется паттерн **Saga** — последовательность локальных транзакций с компенсирующими действиями. При сбое на любом шаге выполняется откат всех предыдущих шагов в обратном порядке (LIFO).

### Диаграмма потока компенсации

```
Прямой путь (forward path):
═══════════════════════════════════════════════════════════════

  Step 1              Step 2              Step 3
  CreateNode  ──OK──▶ UpsertVector ──OK──▶ InvalidateCache ──▶ COMMITTED
       │                    │                    │
       │                    │                    ✗ FAIL
       │                    │                    │
       ▼                    ▼                    ▼

Компенсация (compensation path, LIFO):
═══════════════════════════════════════════════════════════════

                                          Compensate Step 3
                                          (no-op for cache)
                                                │
                                                ▼
                           Compensate Step 2
                           (delete vector from Qdrant)
                                  │
                                  ▼
            Compensate Step 1
            (DETACH DELETE node from Memgraph)
                    │
                    ▼
               ROLLED BACK


Сценарии сбоев:
═══════════════════════════════════════════════════════════════

  Сбой на Step 1:   Нет компенсации (ничего не записано)
  Сбой на Step 2:   Compensate Step 1 (удалить узел из MG)
  Сбой на Step 3:   Compensate Step 2 + Step 1
  Сбой компенсации: alertInconsistency() → ручное вмешательство
```

### Класс PolystoreSaga

```javascript
class PolystoreSaga {
  constructor(operationId) {
    this.operationId = operationId;
    this.completedSteps = [];     // Стек выполненных шагов (LIFO для отката)
    this.startedAt = Date.now();
    this.status = 'pending';      // pending | executing | committed | compensating | failed
  }

  /**
   * Добавляет и выполняет шаг саги.
   * Каждый шаг регистрирует функцию компенсации до выполнения.
   * При сбое execute — компенсация текущего шага НЕ вызывается
   * (он не завершился успешно), но все предыдущие — откатываются.
   *
   * @param {Object} step - { name, execute, compensate }
   * @returns {*} Результат execute()
   */
  async addStep(step) {
    this.status = 'executing';

    const stepRecord = {
      name: step.name,
      compensate: step.compensate,
      executedAt: Date.now(),
      result: null
    };

    try {
      // Выполнить прямое действие
      const result = await step.execute();
      stepRecord.result = result;

      // Регистрация в стеке ПОСЛЕ успешного выполнения
      this.completedSteps.push(stepRecord);

      logger.debug(`[Saga:${this.operationId}] Step "${step.name}" completed`, {
        stepIndex: this.completedSteps.length,
        result
      });

      return result;

    } catch (error) {
      logger.error(`[Saga:${this.operationId}] Step "${step.name}" failed`, {
        error: error.message,
        completedSteps: this.completedSteps.map(s => s.name)
      });

      // Не добавляем текущий шаг — он не завершился
      throw error;
    }
  }

  /**
   * Компенсация всех выполненных шагов в обратном порядке (LIFO).
   * Если компенсация шага сама завершается с ошибкой —
   * продолжаем компенсацию остальных, но помечаем рассинхронизацию.
   */
  async compensate() {
    this.status = 'compensating';
    const errors = [];

    logger.warn(`[Saga:${this.operationId}] Starting compensation`, {
      stepsToCompensate: this.completedSteps.map(s => s.name)
    });

    // LIFO — обратный порядок
    const stepsToUndo = [...this.completedSteps].reverse();

    for (const step of stepsToUndo) {
      try {
        if (typeof step.compensate === 'function') {
          await step.compensate(step.result);
          logger.info(`[Saga:${this.operationId}] Compensated step "${step.name}"`);
        }
      } catch (compensationError) {
        errors.push({
          step: step.name,
          error: compensationError.message
        });

        logger.error(`[Saga:${this.operationId}] Compensation FAILED for step "${step.name}"`, {
          error: compensationError.message
        });
      }
    }

    if (errors.length > 0) {
      this.status = 'failed';
      await this.alertInconsistency(errors);
    } else {
      this.status = 'compensated';
    }

    return { status: this.status, errors };
  }

  /**
   * Оповещение о рассинхронизации данных.
   * Вызывается когда компенсирующая транзакция сама завершается с ошибкой,
   * оставляя данные в неконсистентном состоянии.
   *
   * @param {Array} errors - массив { step, error }
   */
  async alertInconsistency(errors) {
    const alert = {
      operationId: this.operationId,
      severity: 'CRITICAL',
      type: 'POLYSTORE_INCONSISTENCY',
      startedAt: this.startedAt,
      detectedAt: Date.now(),
      completedSteps: this.completedSteps.map(s => s.name),
      compensationErrors: errors,
      requiresManualIntervention: true
    };

    // Записать в Memgraph для аудита
    try {
      await memgraphService.runQuery(
        `CREATE (a:InconsistencyAlert {
          id: $id,
          operationId: $operationId,
          severity: $severity,
          errors: $errors,
          createdAt: datetime()
        })`,
        {
          id: crypto.randomUUID(),
          operationId: this.operationId,
          severity: alert.severity,
          errors: JSON.stringify(errors)
        }
      );
    } catch (dbError) {
      // Если даже алерт не удалось записать — логируем в stderr
      console.error('[CRITICAL] Cannot persist inconsistency alert:', alert);
    }

    // Публикация в Redis для мониторинга
    try {
      await redisService.publish('polystore:inconsistency', JSON.stringify(alert));
    } catch (redisError) {
      // Redis может быть недоступен — это ожидаемо при каскадном сбое
    }

    logger.error(`[CRITICAL] Polystore inconsistency detected`, alert);
  }
}
```

### Пример использования

```javascript
async function createEntityWithFullSync(entityData) {
  const operationId = crypto.randomUUID();
  const saga = new PolystoreSaga(operationId);

  try {
    // ── Операция 1: Создание узла в Memgraph ──────────────────
    const mgResult = await saga.addStep({
      name: 'CreateNode',
      execute: async () => {
        const result = await memgraphService.runQuery(
          `CREATE (n:Entity {id: $id, name: $name, description: $desc, createdAt: datetime()})
           RETURN n.id AS nodeId`,
          { id: entityData.id, name: entityData.name, desc: entityData.description }
        );
        return { nodeId: result.records[0].get('nodeId') };
      },
      compensate: async (result) => {
        await memgraphService.runQuery(
          `MATCH (n:Entity {id: $id}) DETACH DELETE n`,
          { id: result.nodeId }
        );
        logger.info(`Compensated: deleted node ${result.nodeId} from Memgraph`);
      }
    });

    // ── Операция 2: Upsert вектора в Qdrant ───────────────────
    const qdrantResult = await saga.addStep({
      name: 'UpsertVector',
      execute: async () => {
        const embedding = await teiService.embed(entityData.description);
        await qdrantService.upsert('entities', {
          id: mgResult.nodeId,
          vector: embedding,
          payload: {
            nodeId: mgResult.nodeId,
            name: entityData.name,
            label: 'Entity'
          }
        });
        return { vectorId: mgResult.nodeId, collection: 'entities' };
      },
      compensate: async (result) => {
        await qdrantService.delete(result.collection, {
          points: [result.vectorId]
        });
        logger.info(`Compensated: deleted vector ${result.vectorId} from Qdrant`);
      }
    });

    // ── Операция 3: Инвалидация кэша Redis ────────────────────
    const redisResult = await saga.addStep({
      name: 'InvalidateCache',
      execute: async () => {
        await redisService.del(`entity:${mgResult.nodeId}`);
        await redisService.del('entities:list');
        await redisService.publish('entities:updated', JSON.stringify({
          action: 'create',
          nodeId: mgResult.nodeId
        }));
        return { keysInvalidated: 2 };
      },
      compensate: async () => {
        // Кэш самовосстанавливается — компенсация не требуется.
        // При следующем read-запросе кэш будет перестроен из Memgraph.
        logger.info('Compensated: cache invalidation is self-healing, no action needed');
      }
    });

    return {
      operationId,
      nodeId: mgResult.nodeId,
      vectorId: qdrantResult.vectorId,
      cacheInvalidated: redisResult.keysInvalidated,
      status: 'committed'
    };

  } catch (error) {
    logger.error(`Entity creation failed, starting compensation`, { operationId, error: error.message });
    const compensation = await saga.compensate();
    throw new PolystoreWriteError(operationId, error, compensation);
  }
}
```

---

## 7.3 Eventually consistent

### Допустимые временные несоответствия

В polystore-архитектуре абсолютная консистентность между хранилищами невозможна. Определяем допустимые окна временной неконсистентности:

| Пара хранилищ | Тип рассинхронизации | Допустимое окно | Последствия | Обнаружение |
|---------------|----------------------|-----------------|-------------|-------------|
| Memgraph → Qdrant | Узел создан в MG, вектор ещё не записан в Qdrant | **< 5 секунд** | Семантический поиск не находит новый узел. Граф-запросы работают. | `findMissingVectors()` |
| Qdrant → Redis | Вектор обновлён в Qdrant, кэш Redis содержит старый результат | **< 1 секунда** | Поисковые результаты показывают устаревшие данные | TTL-based expiry |
| Удалённый узел → Orphaned vector | Узел удалён из MG, вектор остался в Qdrant | **< 1 час** | Поиск может возвращать ссылки на несуществующие узлы | `findOrphanedVectors()` |
| MG property update → Qdrant payload | Свойство изменено в MG, payload в Qdrant устарел | **< 5 секунд** | Фильтрация по payload вернёт устаревшие данные | Периодическая сверка |
| Redis cache → MG state | Кэш содержит устаревшие данные | **< TTL (300 сек)** | Read-запросы возвращают устаревшие данные | TTL auto-expiry |

### Уровни консистентности

Система поддерживает три уровня консистентности, выбираемых в зависимости от требований операции:

| Уровень | Описание | Memgraph | Qdrant | Redis | Latency | Использование |
|---------|----------|----------|--------|-------|---------|---------------|
| `STRONG` | Все операции синхронные | sync | sync | sync | Высокая (200-500ms) | Критические записи, финансовые данные |
| `EVENTUAL` | MG синхронно, остальные асинхронно | sync | async | async | Средняя (50-100ms) | Стандартные операции CRUD |
| `BEST_EFFORT` | Все операции асинхронные | async | async | async | Низкая (10-30ms) | Bulk import, фоновые задачи |

### Реализация writeWithConsistency

```javascript
const ConsistencyLevel = {
  STRONG: 'STRONG',
  EVENTUAL: 'EVENTUAL',
  BEST_EFFORT: 'BEST_EFFORT'
};

/**
 * Запись данных с выбранным уровнем консистентности.
 *
 * @param {Object} entityData - данные для записи
 * @param {string} level - уровень консистентности (STRONG | EVENTUAL | BEST_EFFORT)
 * @returns {Object} результат записи
 */
async function writeWithConsistency(entityData, level = ConsistencyLevel.EVENTUAL) {
  const operationId = crypto.randomUUID();
  const results = { operationId, level, steps: {} };

  switch (level) {

    case ConsistencyLevel.STRONG: {
      // ── Все три шага синхронно, с полной Saga-компенсацией ──
      const saga = new PolystoreSaga(operationId);

      try {
        results.steps.memgraph = await saga.addStep({
          name: 'CreateNode',
          execute: () => writeToMemgraph(entityData),
          compensate: (res) => deleteFromMemgraph(res.nodeId)
        });

        results.steps.qdrant = await saga.addStep({
          name: 'UpsertVector',
          execute: () => upsertToQdrant(entityData, results.steps.memgraph.nodeId),
          compensate: (res) => deleteFromQdrant(res.vectorId)
        });

        results.steps.redis = await saga.addStep({
          name: 'InvalidateCache',
          execute: () => invalidateRedisCache(results.steps.memgraph.nodeId),
          compensate: () => {} // self-healing
        });

        results.status = 'committed';
      } catch (error) {
        await saga.compensate();
        throw new PolystoreWriteError(operationId, error);
      }
      break;
    }

    case ConsistencyLevel.EVENTUAL: {
      // ── Memgraph синхронно, Qdrant и Redis — через очередь ──
      try {
        results.steps.memgraph = await writeToMemgraph(entityData);
      } catch (error) {
        throw new PolystoreWriteError(operationId, error);
      }

      // Асинхронные задачи через Redis queue
      const asyncTasks = {
        qdrant: {
          type: 'UPSERT_VECTOR',
          nodeId: results.steps.memgraph.nodeId,
          entityData,
          operationId,
          retryCount: 0,
          maxRetries: 3
        },
        redis: {
          type: 'INVALIDATE_CACHE',
          nodeId: results.steps.memgraph.nodeId,
          operationId
        }
      };

      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.qdrant));
      await redisService.lpush('polystore:async-queue', JSON.stringify(asyncTasks.redis));

      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'committed-partial';
      break;
    }

    case ConsistencyLevel.BEST_EFFORT: {
      // ── Все три шага асинхронно через очередь ───────────────
      const taskId = crypto.randomUUID();

      const batchTask = {
        type: 'POLYSTORE_BATCH_WRITE',
        taskId,
        operationId,
        entityData,
        steps: ['memgraph', 'qdrant', 'redis'],
        retryCount: 0,
        maxRetries: 5,
        createdAt: Date.now()
      };

      await redisService.lpush('polystore:batch-queue', JSON.stringify(batchTask));

      results.steps.memgraph = { status: 'queued' };
      results.steps.qdrant = { status: 'queued' };
      results.steps.redis = { status: 'queued' };
      results.status = 'queued';
      break;
    }

    default:
      throw new Error(`Unknown consistency level: ${level}`);
  }

  return results;
}
```

---

## 7.4 Checkpoint/Resume

### Назначение

Долговременные конвейеры (bulk import, полная переиндексация, GXE-execution) могут обрабатывать тысячи узлов. При сбое нельзя терять прогресс — необходимо возобновление с последнего успешного шага.

### Класс CheckpointManager

```javascript
class CheckpointManager {
  constructor(pipelineId, redisService) {
    this.pipelineId = pipelineId;
    this.redisService = redisService;
    this.checkpointKey = `checkpoint:${pipelineId}`;
    this.TTL_SECONDS = 86400; // 24 часа
  }

  /**
   * Сохраняет checkpoint в Redis с TTL 24 часа.
   *
   * @param {Object} state - текущее состояние конвейера
   * @param {string} state.currentStep - имя текущего шага
   * @param {number} state.processedCount - количество обработанных элементов
   * @param {Array<string>} state.completedOps - список завершённых операций
   * @param {Object} state.context - произвольный контекст для восстановления
   */
  async saveCheckpoint(state) {
    const checkpoint = {
      pipelineId: this.pipelineId,
      currentStep: state.currentStep,
      processedCount: state.processedCount,
      completedOps: state.completedOps || [],
      context: state.context || {},
      savedAt: Date.now(),
      version: 1
    };

    await this.redisService.set(
      this.checkpointKey,
      JSON.stringify(checkpoint),
      'EX',
      this.TTL_SECONDS
    );

    logger.debug(`[Checkpoint:${this.pipelineId}] Saved`, {
      step: state.currentStep,
      processed: state.processedCount
    });

    return checkpoint;
  }

  /**
   * Загружает последний checkpoint из Redis.
   *
   * @returns {Object|null} состояние checkpoint или null если не найден / истёк TTL
   */
  async loadCheckpoint() {
    const raw = await this.redisService.get(this.checkpointKey);

    if (!raw) {
      logger.debug(`[Checkpoint:${this.pipelineId}] No checkpoint found`);
      return null;
    }

    try {
      const checkpoint = JSON.parse(raw);
      logger.info(`[Checkpoint:${this.pipelineId}] Loaded`, {
        step: checkpoint.currentStep,
        processed: checkpoint.processedCount,
        savedAt: new Date(checkpoint.savedAt).toISOString()
      });
      return checkpoint;
    } catch (parseError) {
      logger.error(`[Checkpoint:${this.pipelineId}] Corrupt checkpoint data`, {
        error: parseError.message
      });
      return null;
    }
  }

  /**
   * Возобновляет выполнение конвейера с последнего checkpoint.
   * Пропускает уже завершённые операции.
   *
   * @param {Array<Object>} operations - полный список операций конвейера
   *   Каждая операция: { id, name, execute }
   * @param {Function} onProgress - callback для отслеживания прогресса
   * @returns {Object} результат выполнения
   */
  async resumeFromCheckpoint(operations, onProgress) {
    const checkpoint = await this.loadCheckpoint();
    const completedOps = checkpoint ? new Set(checkpoint.completedOps) : new Set();
    let processedCount = checkpoint ? checkpoint.processedCount : 0;

    logger.info(`[Checkpoint:${this.pipelineId}] Resuming`, {
      totalOps: operations.length,
      alreadyCompleted: completedOps.size,
      skipping: completedOps.size
    });

    const results = [];

    for (const op of operations) {
      // Пропустить уже завершённые операции
      if (completedOps.has(op.id)) {
        logger.debug(`[Checkpoint:${this.pipelineId}] Skipping completed op: ${op.name}`);
        continue;
      }

      try {
        const result = await op.execute();
        results.push({ opId: op.id, name: op.name, status: 'ok', result });

        completedOps.add(op.id);
        processedCount++;

        // Сохранить checkpoint
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: checkpoint ? checkpoint.context : {}
        });

        if (onProgress) {
          onProgress({
            completed: processedCount,
            total: operations.length,
            currentOp: op.name
          });
        }

      } catch (error) {
        logger.error(`[Checkpoint:${this.pipelineId}] Op "${op.name}" failed`, {
          error: error.message,
          processedCount
        });

        // Сохранить checkpoint ДО ошибки — при retry пропустим завершённые
        await this.saveCheckpoint({
          currentStep: op.name,
          processedCount,
          completedOps: Array.from(completedOps),
          context: { lastError: error.message, failedOp: op.id }
        });

        throw error;
      }
    }

    // Очистить checkpoint после успешного завершения
    await this.redisService.del(this.checkpointKey);

    return {
      pipelineId: this.pipelineId,
      totalProcessed: processedCount,
      results,
      status: 'completed'
    };
  }
}
```

### Частота создания checkpoint

| Тип конвейера | Частота checkpoint | Обоснование |
|---------------|--------------------|-------------|
| **Bulk import** | Каждые 100 узлов | Баланс между производительностью и допустимой потерей прогресса. Повторная обработка 100 узлов — приемлемые ~30 секунд. |
| **Incremental update** | Каждые 10 узлов | Инкрементальные обновления более ценны — каждый узел может содержать уникальные данные. Потеря 10 узлов — допустимо. |
| **GXE execution** | Каждый узел | Каждый узел GXE-графа может запускать LLM-вызов (дорогой). Повторный вызов LLM — трата бюджета. Checkpoint на каждом шаге обязателен. |
| **Reindexing** | Каждые 500 векторов | Переиндексация — идемпотентная операция. Повтор 500 upsert в Qdrant — ~10 секунд, приемлемо. |
| **Graph migration** | Каждый шаг миграции | Миграция меняет структуру. Частичная миграция опаснее частичного импорта. Checkpoint на каждый DDL-шаг. |

---

## 7.5 Health checks

### Класс PolystoreHealthChecker

```javascript
class PolystoreHealthChecker {
  constructor(memgraphService, qdrantService, redisService) {
    this.memgraph = memgraphService;
    this.qdrant = qdrantService;
    this.redis = redisService;
  }

  /**
   * Полная проверка консистентности между хранилищами.
   *
   * @returns {Object} отчёт о рассинхронизациях
   */
  async checkConsistency() {
    const report = {
      checkedAt: new Date().toISOString(),
      issues: [],
      stats: {}
    };

    // ── Проверка 1: Orphaned vectors ────────────────────────────
    const orphaned = await this.findOrphanedVectors();
    report.stats.orphanedVectors = orphaned.length;
    if (orphaned.length > 0) {
      report.issues.push({
        type: 'ORPHANED_VECTORS',
        severity: orphaned.length > 100 ? 'HIGH' : 'MEDIUM',
        count: orphaned.length,
        description: `Найдено ${orphaned.length} векторов в Qdrant без соответствующих узлов в Memgraph`,
        vectorIds: orphaned.slice(0, 50) // Первые 50 для отчёта
      });
    }

    // ── Проверка 2: Missing vectors ─────────────────────────────
    const missing = await this.findMissingVectors();
    report.stats.missingVectors = missing.length;
    if (missing.length > 0) {
      report.issues.push({
        type: 'MISSING_VECTORS',
        severity: missing.length > 50 ? 'HIGH' : 'MEDIUM',
        count: missing.length,
        description: `Найдено ${missing.length} узлов в Memgraph с vectorId, но без соответствующих записей в Qdrant`,
        nodeIds: missing.slice(0, 50)
      });
    }

    // ── Проверка 3: Stale cache ─────────────────────────────────
    const stale = await this.findStaleCache();
    report.stats.staleCacheKeys = stale.length;
    if (stale.length > 0) {
      report.issues.push({
        type: 'STALE_CACHE',
        severity: 'LOW',
        count: stale.length,
        description: `Найдено ${stale.length} ключей кэша Redis, ссылающихся на несуществующие или изменённые узлы`,
        keys: stale.slice(0, 20)
      });
    }

    report.healthy = report.issues.length === 0;
    return report;
  }

  /**
   * Поиск "осиротевших" векторов — записей в Qdrant,
   * для которых не существует соответствующего узла в Memgraph.
   *
   * Алгоритм: скролл по всем точкам в коллекции Qdrant,
   * для каждого batch проверяем наличие узла в Memgraph.
   *
   * @param {string} collection - имя коллекции Qdrant (по умолчанию 'default')
   * @returns {Array<string>} список vectorId без узлов в MG
   */
  async findOrphanedVectors(collection = 'default') {
    const orphaned = [];
    let offset = null;
    const batchSize = 100;

    do {
      // Скролл по точкам Qdrant
      const scrollResult = await this.qdrant.scroll(collection, {
        limit: batchSize,
        offset: offset,
        with_payload: true,
        with_vectors: false // Векторы не нужны для проверки
      });

      const points = scrollResult.points || [];
      if (points.length === 0) break;

      // Извлечь nodeId из payload каждой точки
      const nodeIds = points
        .map(p => p.payload?.nodeId || p.id)
        .filter(Boolean);

      if (nodeIds.length > 0) {
        // Batch-проверка в Memgraph: какие из nodeIds существуют?
        const existResult = await this.memgraph.runQuery(
          `UNWIND $ids AS nid
           OPTIONAL MATCH (n {id: nid})
           RETURN nid, n IS NOT NULL AS exists`,
          { ids: nodeIds }
        );

        const existingSet = new Set(
          existResult.records
            .filter(r => r.get('exists'))
            .map(r => r.get('nid'))
        );

        // Те, кого нет в Memgraph — orphaned
        for (const point of points) {
          const nodeId = point.payload?.nodeId || point.id;
          if (!existingSet.has(nodeId)) {
            orphaned.push(nodeId);
          }
        }
      }

      offset = scrollResult.next_page_offset;
    } while (offset !== null && offset !== undefined);

    return orphaned;
  }

  /**
   * Поиск "отсутствующих" векторов — узлов в Memgraph,
   * у которых есть свойство vectorId, но в Qdrant нет соответствующей записи.
   *
   * @param {string} collection - имя коллекции Qdrant (по умолчанию 'default')
   * @returns {Array<string>} список nodeId с отсутствующими векторами
   */
  async findMissingVectors(collection = 'default') {
    const missing = [];

    // Получить все узлы с vectorId из Memgraph
    const mgResult = await this.memgraph.runQuery(
      `MATCH (n)
       WHERE n.vectorId IS NOT NULL
       RETURN n.id AS nodeId, n.vectorId AS vectorId`
    );

    const nodesWithVectors = mgResult.records.map(r => ({
      nodeId: r.get('nodeId'),
      vectorId: r.get('vectorId')
    }));

    // Batch-проверка в Qdrant
    const batchSize = 100;
    for (let i = 0; i < nodesWithVectors.length; i += batchSize) {
      const batch = nodesWithVectors.slice(i, i + batchSize);
      const pointIds = batch.map(n => n.vectorId);

      try {
        const getResult = await this.qdrant.getPoints(collection, {
          ids: pointIds,
          with_payload: false,
          with_vectors: false
        });

        const foundIds = new Set((getResult || []).map(p => p.id));

        for (const node of batch) {
          if (!foundIds.has(node.vectorId)) {
            missing.push(node.nodeId);
          }
        }
      } catch (error) {
        // Если коллекция не существует — все векторы отсутствуют
        if (error.message?.includes('not found')) {
          missing.push(...batch.map(n => n.nodeId));
        } else {
          throw error;
        }
      }
    }

    return missing;
  }

  /**
   * Поиск устаревших записей кэша — ключей в Redis,
   * ссылающихся на узлы, которые были удалены или изменены в Memgraph.
   *
   * @returns {Array<string>} список устаревших ключей Redis
   */
  async findStaleCache() {
    const staleKeys = [];

    // Сканируем ключи node:* в Redis
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', 'node:*', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const nodeId = key.replace('node:', '');
        const cached = await this.redis.get(key);

        if (!cached) continue;

        try {
          const cachedData = JSON.parse(cached);

          // Проверить существование и актуальность в Memgraph
          const mgResult = await this.memgraph.runQuery(
            `MATCH (n {id: $id})
             RETURN n.updatedAt AS updatedAt`,
            { id: nodeId }
          );

          if (mgResult.records.length === 0) {
            // Узел удалён — кэш устарел
            staleKeys.push(key);
          } else {
            const mgUpdatedAt = mgResult.records[0].get('updatedAt');
            if (cachedData.cachedAt && mgUpdatedAt && new Date(mgUpdatedAt) > new Date(cachedData.cachedAt)) {
              // Узел обновлён после кэширования
              staleKeys.push(key);
            }
          }
        } catch (parseError) {
          // Некорректный JSON в кэше — тоже stale
          staleKeys.push(key);
        }
      }
    } while (cursor !== '0');

    return staleKeys;
  }

  /**
   * Автоматическое исправление обнаруженных рассинхронизаций.
   *
   * @param {Object} report - отчёт от checkConsistency()
   * @returns {Object} результат ремонта
   */
  async autoRepair(report) {
    const repairLog = {
      startedAt: new Date().toISOString(),
      repaired: [],
      failed: []
    };

    for (const issue of report.issues) {
      try {
        switch (issue.type) {

          case 'ORPHANED_VECTORS': {
            // Удалить осиротевшие векторы из Qdrant
            const orphanedIds = issue.vectorIds || [];
            if (orphanedIds.length > 0) {
              await this.qdrant.delete('default', {
                points: orphanedIds
              });
              repairLog.repaired.push({
                type: 'ORPHANED_VECTORS',
                action: 'Удалены осиротевшие векторы из Qdrant',
                count: orphanedIds.length
              });
            }
            break;
          }

          case 'MISSING_VECTORS': {
            // Пересоздать отсутствующие векторы
            const nodeIds = issue.nodeIds || [];
            let reindexed = 0;

            for (const nodeId of nodeIds) {
              try {
                const mgResult = await this.memgraph.runQuery(
                  `MATCH (n {id: $id})
                   RETURN n.id AS nodeId, n.description AS text, labels(n)[0] AS label`,
                  { id: nodeId }
                );

                if (mgResult.records.length > 0) {
                  const record = mgResult.records[0];
                  const text = record.get('text');

                  if (text) {
                    const embedding = await teiService.embed(text);
                    await this.qdrant.upsert('default', {
                      id: nodeId,
                      vector: embedding,
                      payload: {
                        nodeId,
                        label: record.get('label'),
                        text
                      }
                    });
                    reindexed++;
                  } else {
                    // Нет текста — убрать vectorId из узла
                    await this.memgraph.runQuery(
                      `MATCH (n {id: $id}) REMOVE n.vectorId`,
                      { id: nodeId }
                    );
                  }
                }
              } catch (nodeError) {
                repairLog.failed.push({
                  type: 'MISSING_VECTORS',
                  nodeId,
                  error: nodeError.message
                });
              }
            }

            repairLog.repaired.push({
              type: 'MISSING_VECTORS',
              action: 'Пересозданы отсутствующие векторы в Qdrant',
              count: reindexed
            });
            break;
          }

          case 'STALE_CACHE': {
            // Удалить устаревшие ключи кэша
            const keys = issue.keys || [];
            if (keys.length > 0) {
              await this.redis.del(...keys);
              repairLog.repaired.push({
                type: 'STALE_CACHE',
                action: 'Удалены устаревшие ключи кэша Redis',
                count: keys.length
              });
            }
            break;
          }

          default:
            logger.warn(`Unknown issue type: ${issue.type}`);
        }

      } catch (repairError) {
        repairLog.failed.push({
          type: issue.type,
          error: repairError.message
        });
      }
    }

    repairLog.completedAt = new Date().toISOString();
    return repairLog;
  }
}
```

### Расписание проверок

| Проверка | Интервал | Обоснование | autoRepair |
|----------|----------|-------------|------------|
| **Orphaned vectors** (`findOrphanedVectors`) | Каждые 6 часов | Осиротевшие векторы накапливаются медленно (только при сбоях удаления). 6 часов — достаточно для обнаружения, не нагружает Qdrant скроллом. | Да — удаление из Qdrant |
| **Missing vectors** (`findMissingVectors`) | Каждые 1 час | Отсутствие векторов влияет на семантический поиск. 1 час — компромисс между актуальностью поиска и нагрузкой на переиндексацию. | Да — пересоздание эмбеддингов |
| **Stale cache** (`findStaleCache`) | Каждые 15 минут | Устаревший кэш — наименее критичная проблема (TTL 300 секунд самоочищает). 15 минут ловит ключи без TTL и ключи с длинным TTL. | Да — удаление ключей |
| **Hash chain integrity** | Еженедельно | Проверка целостности цепочки хешей аудит-лога. Дорогая операция (полный обход). Еженедельно достаточно для обнаружения фальсификации. | Нет — ручное расследование |

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*

---

## Часть VIII: Саморазвивающаяся система

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

---

## Часть IX: CODEX-DOMAINS — Стандарты типов информации

---

## 9.1 Архитектура двух уровней

UN ProjectAdvisor хранит два принципиально разных класса информации:

```
┌─────────────────────────────────────────────────────────────┐
│                    UN ProjectAdvisor                         │
│                    Knowledge Base                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           LEVEL 1: SYSTEM META                      │    │
│  │           Namespace: CORE, META                     │    │
│  │                                                     │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │ Architecture │ │ Requirements │ │  Decisions  │ │    │
│  │  │ CoreComponent│ │ BusinessReq  │ │    ADR      │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │   Metrics    │ │    Config    │ │  Research   │ │    │
│  │  │ PromptMetric │ │   AINFRA     │ │   Theory    │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            │ ANALYZES / DOCUMENTS            │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           LEVEL 2: TARGET PROJECT                   │    │
│  │           Namespace: PROJECT, GXE                   │    │
│  │                                                     │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │   Schema     │ │     Code     │ │    Rules    │ │    │
│  │  │ DatabaseTable│ │   Function   │ │BusinessRule │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐ │    │
│  │  │  Executable  │ │  Execution   │ │ Information │ │    │
│  │  │   Graphs     │ │   Records    │ │   Graphs    │ │    │
│  │  └──────────────┘ └──────────────┘ └─────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Level 1: System Meta** — информация О САМОЙ системе UN PA:
архитектура, требования, решения, конфигурация, метрики, теоретическая база.

**Level 2: Target Project** — информация об ИССЛЕДУЕМОМ проекте:
извлечённые схемы, код, бизнес-правила, исполняемые графы, результаты анализа.

---

## 9.2 Каноничные namespace

В системе используются ровно 4 namespace:

| Namespace | Уровень | Назначение |
|-----------|---------|-----------|
| `CORE` | System Meta | Системная инфраструктура, каталог, tracking, архитектура |
| `META` | System Meta | Конфигурация, метрики, требования, решения |
| `PROJECT` | Target Project | Извлечённые данные целевого проекта |
| `GXE` | Target Project | Исполняемые графы и аудит |

Любой другой namespace отклоняется или нормализуется автоматически
(см. `memgraph.service.js` — `mergeNode()` namespace normalization).

---

## 9.3 Information Types Registry

### Level 1: System Meta

#### 9.3.1 SystemArchitecture

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `CoreComponent`, `TechnicalComponent`, `SystemComponent` |
| **Required fields** | `name`, `type`, `domain` |
| **Edges** | `DEPENDS_ON`, `CONTAINS`, `IMPLEMENTS`, `USES`, `TRIGGERS` |
| **Auto-created** | Нет (seed scripts, manual) |
| **Source** | `seed-core-components.js`, manual |

---

#### 9.3.2 SystemRequirements

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `BusinessRequirement`, `RequirementCategory`, `Feature` |
| **Required fields** | `name`, `priority`, `status` |
| **Edges** | `BELONGS_TO_CATEGORY`, `DEPENDS_ON`, `IMPLEMENTED_BY` |
| **Auto-created** | Нет |
| **Source** | manual, backlog import |

---

#### 9.3.3 SystemDecisions

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `ADR`, `Decision`, `Rationale` |
| **Required fields** | `title`, `status`, `context`, `decision` |
| **Edges** | `SUPERSEDES`, `RELATES_TO`, `MOTIVATED_BY` |
| **Auto-created** | Частично (SelfDocumentor) |
| **Source** | `SelfDocumentor`, manual |
| **Status values** | `PROPOSED`, `ACCEPTED`, `DEPRECATED`, `SUPERSEDED` |

> Примечание: На 2026-03-12 ADR = 0 узлов. Тип заявлен, не заполнен.

---

#### 9.3.4 SystemMetrics

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `PromptMetric`, `ExecutionMetric`, `PromptVersion` |
| **Required fields** | `id`, `createdAt` |
| **Edges** | `MEASURED_FOR`, `VERSION_OF` |
| **Auto-created** | Да |
| **Source** | `ainfra.service.js`, `RuntimeEngine` |

---

#### 9.3.5 SystemConfig

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `AINFRA`, `AIConfigSet`, `AIProviderConfig`, `Settings`, `Domain`, `Notification` |
| **Required fields** | `name` |
| **Edges** | `HAS_CONFIG`, `ACTIVE_CONFIG`, `USES_PROVIDER` |
| **Auto-created** | Да |
| **Source** | `ainfra.service.js` |
| **Constraint** | Ровно 1 ребро `ACTIVE_CONFIG` от `AINFRA` root |

---

#### 9.3.6 ResearchKnowledge

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `Theory`, `Methodology`, `BestPractice`, `ResearchPaper` |
| **Required fields** | `title`, `domain`, `sourceRef` |
| **Edges** | `BASED_ON`, `CONTRADICTS`, `EXTENDS` |
| **Auto-created** | Нет |
| **Source** | manual, research import |

> Примечание: На 2026-03-12 = 0 узлов. Тип заявлен, не заполнен.

---

### Level 2: Target Project

#### 9.3.7 ExtractedSchema

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `DatabaseTable`, `TableProfile`, `StructuralEntity`, `StructuralAttribute`, `StoredProcedureKG`, `DataSourceConfig`, `DomainConfig` |
| **Required fields** | `name` или `tableName` |
| **Edges** | `HAS_ATTRIBUTE`, `PROFILED_TABLE`, `FK_*`, `SOFT_FK`, `M_N` |
| **Auto-created** | Да |
| **Source** | `mssql.graph-generator.js`, `structural-domain.service.js`, `ingestion-graph.service.js` |

---

#### 9.3.8 ExtractedCode

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `Function`, `Method`, `Class`, `Module`, `File`, `Interface` |
| **Required fields** | `name`, `filePath` |
| **Edges** | `CONTAINS`, `SAME_DIRECTORY`, `SIMILAR_TO`, `MODIFIES`, `MEMBER_OF` |
| **Auto-created** | Да |
| **Source** | `entity-extractor.js` |

---

#### 9.3.9 ExtractedRules

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `BusinessRule`, `SemanticRule`, `SemanticCalculation`, `DomainVocabulary` |
| **Secondary labels** | `SEMANTIC` (маркер семантического домена) |
| **Required fields** | `name`, `confidence` |
| **Edges** | `IMPLEMENTS`, `GOVERNS`, `DERIVED_FROM` |
| **Auto-created** | Да |
| **Source** | `semantic-domain.service.js`, `mssql.graph-generator.js` |

---

#### 9.3.10 ExtractedEntities

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `Concept`, `System`, `Technology`, `Organization`, `Document`, `WorkItem`, `Knowledge`, `Database`, `Process` |
| **Required fields** | `name`, `type` |
| **Edges** | `RELATES_TO`, `SIMILAR_TO`, `CONTAINS` |
| **Auto-created** | Да |
| **Source** | `entity-extractor.js`, project-knowledge MCP |

---

#### 9.3.11 ExecutableGraph

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `GXE` |
| **Labels** | `SubGraph`, `SubGraphPort` |
| **Secondary labels** | `KnowledgeQuantum` (маркер) |
| **Required fields** | `id`, `subgraphId` |
| **Edges** | `CONNECTS_INTERNAL`, `PORT_OF`, `BRIDGES_TO` |
| **Auto-created** | Да |
| **Source** | `subgraph-extractor.js`, `graph-consolidator.js` |

---

#### 9.3.12 ExecutionRecord

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `META` |
| **Labels** | `ExecutionRecord`, `ExecutionPattern`, `AOPEG_Execution`, `AOPEG_NodeExecution`, `AOPEG_ExecutionGraph`, `AOPEG_GraphNode`, `AOPEG_GraphEdge` |
| **Required fields** | `id`, `status`, `graphId` |
| **Edges** | `AOPEG_EXECUTES_GRAPH`, `AOPEG_EXECUTED_NODE`, `AOPEG_CONTAINS_NODE`, `AOPEG_CONTAINS_EDGE` |
| **Auto-created** | Да |
| **Source** | `GxeManagerService`, `RuntimeEngine`, `graph.repository.js` |

> Примечание: `ExecutionRecord` = 0 на 2026-03-12.
> `GxeManagerService` создаёт `ExecutionRecord`, `RuntimeEngine` создаёт `AOPEG_Execution`.
> Унификация запланирована (CC-029).

---

#### 9.3.13 InformationGraph

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `DomainGraph`, `BehavioralNode`, `BusinessEntity`, `LifecycleState`, `BusinessProcessGraph` |
| **Secondary labels** | `BehavioralProcess` (на DomainGraph) |
| **Required fields** | `id` |
| **Edges** | `CONTAINS_NODE`, `TRANSITIONS_TO`, `STARTS_WITH` |
| **Auto-created** | Да |
| **Source** | `ingestion-graph.service.js` |

---

#### 9.3.14 CatalogInfra

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `CatalogRoot`, `CatalogEntry`, `GraphDefinition`, `GraphVersion`, `NodeType`, `EdgeType` |
| **Required fields** | `entryId`/`graphId`/`versionId` (зависит от label), `name` |
| **Edges** | `CONTAINS`, `HAS_VERSION`, `DEFINES`, `SUPERSEDES`, `DECOMPOSES`, `LOADED_BY` |
| **Auto-created** | Частично |
| **Source** | `graphCatalog.service.js`, `graph-loader.service.js`, `GraphTypeService.js` |

Иерархия:
```
(:CatalogRoot)-[:CONTAINS]->(:CatalogEntry)-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(:GraphVersion)-[:SUPERSEDES]->(:GraphVersion)
```

---

#### 9.3.15 IngestionTracking

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `CORE` |
| **Labels** | `KnowledgeGraph`, `IngestionSession`, `IngestionPhase`, `KnowledgeNode` |
| **Required fields** | `sessionId` (для Phase), `id` |
| **Edges** | `HAS_PHASE`, `PRODUCED_GRAPH`, `PROFILED_TABLE` |
| **Auto-created** | Да |
| **Source** | `ingestion-graph.service.js` |

> `KnowledgeNode` — fallback label. Избегать в новом коде, использовать
> конкретные labels (DatabaseTable, StoredProcedureKG и т.д.).

---

#### 9.3.16 GXEAudit

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `GXE` |
| **Labels** | `TechnicalDebt`, `Gap`, `BusinessGoal`, `QuickWin`, `AuditReport`, `ConsolidationCheckpoint` |
| **Secondary labels** | `MetaNode` (на ConsolidationCheckpoint) |
| **Required fields** | `name` |
| **Edges** | `CONTAINS`, `TARGETS`, `BLOCKS`, `FIXED_BY` |
| **Auto-created** | Частично |
| **Source** | `graph-consolidator.js`, audit scripts |

---

#### 9.3.17 ReferenceData

| Атрибут | Значение |
|---------|----------|
| **Namespace** | `PROJECT` |
| **Labels** | `SupportGroup`, `Equipment`, `UNStaffProfile`, `Workspace`, `YNBusinessGraph`, `YNTestScenario`, `YNTestUser`, `YNRole`, `Artifact`, `Project` |
| **Required fields** | `name` или domain-specific ID |
| **Edges** | `REPORTS_TO`, `SUBMITTED_BY`, `EXPECTS_GRAPH`, `CAN_SPAWN`, `COMPATIBLE_WITH` |
| **Auto-created** | Нет (seed, import) |
| **Source** | seed scripts, FlowDesk import |

---

## 9.4 Routing Rules

Функция маршрутизации определяет Information Type и каноничный namespace по label:

```javascript
const LABEL_ROUTING = {
  // Level 1: System Meta
  CoreComponent:        { type: 'SystemArchitecture',  namespace: 'CORE' },
  TechnicalComponent:   { type: 'SystemArchitecture',  namespace: 'CORE' },
  SystemComponent:      { type: 'SystemArchitecture',  namespace: 'CORE' },
  BusinessRequirement:  { type: 'SystemRequirements',  namespace: 'META' },
  RequirementCategory:  { type: 'SystemRequirements',  namespace: 'META' },
  ADR:                  { type: 'SystemDecisions',     namespace: 'META' },
  Decision:             { type: 'SystemDecisions',     namespace: 'META' },
  PromptMetric:         { type: 'SystemMetrics',       namespace: 'META' },
  PromptVersion:        { type: 'SystemMetrics',       namespace: 'META' },
  AINFRA:               { type: 'SystemConfig',        namespace: 'META' },
  AIConfigSet:          { type: 'SystemConfig',        namespace: 'META' },
  AIProviderConfig:     { type: 'SystemConfig',        namespace: 'META' },
  Settings:             { type: 'SystemConfig',        namespace: 'META' },
  Domain:               { type: 'SystemConfig',        namespace: 'META' },
  Notification:         { type: 'SystemConfig',        namespace: 'META' },
  Theory:               { type: 'ResearchKnowledge',   namespace: 'CORE' },
  Methodology:          { type: 'ResearchKnowledge',   namespace: 'CORE' },

  // Level 2: Target Project
  DatabaseTable:        { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  TableProfile:         { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  StructuralEntity:     { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  StructuralAttribute:  { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  StoredProcedureKG:    { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  DataSourceConfig:     { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  DomainConfig:         { type: 'ExtractedSchema',     namespace: 'PROJECT' },
  Function:             { type: 'ExtractedCode',       namespace: 'PROJECT' },
  Method:               { type: 'ExtractedCode',       namespace: 'PROJECT' },
  Class:                { type: 'ExtractedCode',       namespace: 'PROJECT' },
  Module:               { type: 'ExtractedCode',       namespace: 'PROJECT' },
  File:                 { type: 'ExtractedCode',       namespace: 'PROJECT' },
  BusinessRule:         { type: 'ExtractedRules',      namespace: 'PROJECT' },
  SemanticRule:         { type: 'ExtractedRules',      namespace: 'PROJECT' },
  SemanticCalculation:  { type: 'ExtractedRules',      namespace: 'PROJECT' },
  DomainVocabulary:     { type: 'ExtractedRules',      namespace: 'PROJECT' },
  Concept:              { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  System:               { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Technology:           { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Organization:         { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Document:             { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  WorkItem:             { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Knowledge:            { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Database:             { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  Process:              { type: 'ExtractedEntities',   namespace: 'PROJECT' },
  SubGraph:             { type: 'ExecutableGraph',     namespace: 'GXE' },
  SubGraphPort:         { type: 'ExecutableGraph',     namespace: 'GXE' },
  ExecutionRecord:      { type: 'ExecutionRecord',     namespace: 'META' },
  ExecutionPattern:     { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_Execution:      { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_NodeExecution:  { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_ExecutionGraph: { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_GraphNode:      { type: 'ExecutionRecord',     namespace: 'META' },
  AOPEG_GraphEdge:      { type: 'ExecutionRecord',     namespace: 'META' },
  DomainGraph:          { type: 'InformationGraph',    namespace: 'PROJECT' },
  BehavioralNode:       { type: 'InformationGraph',    namespace: 'PROJECT' },
  BusinessEntity:       { type: 'InformationGraph',    namespace: 'PROJECT' },
  LifecycleState:       { type: 'InformationGraph',    namespace: 'PROJECT' },
  BusinessProcessGraph: { type: 'InformationGraph',    namespace: 'PROJECT' },
  CatalogRoot:          { type: 'CatalogInfra',        namespace: 'CORE' },
  CatalogEntry:         { type: 'CatalogInfra',        namespace: 'CORE' },
  GraphDefinition:      { type: 'CatalogInfra',        namespace: 'CORE' },
  GraphVersion:         { type: 'CatalogInfra',        namespace: 'CORE' },
  NodeType:             { type: 'CatalogInfra',        namespace: 'CORE' },
  EdgeType:             { type: 'CatalogInfra',        namespace: 'CORE' },
  KnowledgeGraph:       { type: 'IngestionTracking',   namespace: 'CORE' },
  IngestionSession:     { type: 'IngestionTracking',   namespace: 'CORE' },
  IngestionPhase:       { type: 'IngestionTracking',   namespace: 'CORE' },
  KnowledgeNode:        { type: 'IngestionTracking',   namespace: 'CORE' },
  TechnicalDebt:        { type: 'GXEAudit',            namespace: 'GXE' },
  Gap:                  { type: 'GXEAudit',            namespace: 'GXE' },
  BusinessGoal:         { type: 'GXEAudit',            namespace: 'GXE' },
  QuickWin:             { type: 'GXEAudit',            namespace: 'GXE' },
  AuditReport:          { type: 'GXEAudit',            namespace: 'GXE' },
  ConsolidationCheckpoint: { type: 'GXEAudit',         namespace: 'GXE' },
  SupportGroup:         { type: 'ReferenceData',       namespace: 'PROJECT' },
  Equipment:            { type: 'ReferenceData',       namespace: 'PROJECT' },
  UNStaffProfile:       { type: 'ReferenceData',       namespace: 'PROJECT' },
  Workspace:            { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNBusinessGraph:      { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNTestScenario:       { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNTestUser:           { type: 'ReferenceData',       namespace: 'PROJECT' },
  YNRole:               { type: 'ReferenceData',       namespace: 'PROJECT' },
  Artifact:             { type: 'ReferenceData',       namespace: 'PROJECT' },
  Project:              { type: 'ReferenceData',       namespace: 'PROJECT' },
};

function resolveInformationType(label) {
  return LABEL_ROUTING[label] || { type: 'Unknown', namespace: 'PROJECT' };
}
```

---

## 9.5 Auto-documentation Protocol

Когда система автономно создаёт исполняемый граф, она ДОЛЖНА создать
сопроводительную документацию:

1. **GraphDocumentation** — назначение, входы/выходы, предположения
2. **ADR** (если архитектурное решение) — контекст, решение, последствия
3. **Связи** — `DOCUMENTS`, `IMPLEMENTS`, `MOTIVATED_BY`

```javascript
async documentGraphCreation(graphId, motivation, context) {
  // 1. Документация графа
  await memgraph.mergeNode('GraphDocumentation', {
    id: `doc-${graphId}`,
    namespace: 'META',
    graphId,
    purpose: motivation.purpose,
    inputDescription: motivation.inputs,
    outputDescription: motivation.outputs,
    assumptions: motivation.assumptions,
    limitations: motivation.limitations,
    createdBy: context.agent || 'system',
    createdAt: new Date().toISOString()
  });

  // 2. ADR для архитектурных решений
  if (context.isArchitecturalDecision) {
    await memgraph.mergeNode('ADR', {
      id: `adr-${generateUUID()}`,
      namespace: 'META',
      title: context.title,
      status: 'ACCEPTED',
      context: motivation.context,
      decision: motivation.decision,
      consequences: motivation.consequences,
      createdBy: context.agent || 'system',
      createdAt: new Date().toISOString()
    });
  }

  // 3. Связи
  await memgraph.createRelationship(`doc-${graphId}`, graphId, 'DOCUMENTS');
  if (context.sourceRequirementId) {
    await memgraph.createRelationship(graphId, context.sourceRequirementId, 'IMPLEMENTS');
  }
}
```

---

## 9.6 Статистика (на 2026-03-12)

| Information Type | Узлов | % от общего |
|------------------|-------|-------------|
| ExtractedSchema | 1,482 | 31.8% |
| ExecutableGraph | 1,395 | 29.9% |
| IngestionTracking | 485 | 10.4% |
| ExtractedRules | 362 | 7.8% |
| CatalogInfra | 266 | 5.7% |
| ExtractedCode | 177 | 3.8% |
| SystemArchitecture | 126 | 2.7% |
| ExtractedEntities | 109 | 2.3% |
| ReferenceData | 54 | 1.2% |
| GXEAudit | 47 | 1.0% |
| InformationGraph | 37 | 0.8% |
| SystemMetrics | 20 | 0.4% |
| SystemRequirements | 19 | 0.4% |
| ExecutionRecord | 15 | 0.3% |
| SystemConfig | 12 | 0.3% |
| SystemDecisions | 0 | 0% |
| ResearchKnowledge | 0 | 0% |

**Итого:** 4,662 узла, 18,330 рёбер, 4 namespace.

---

## 9.7 Tool Namespace Architecture

### 9.7.1 Концепция

Tools в системе UN ProjectAdvisor разделены по областям знаний аналогично узлам графа. Каждый Tool имеет поле `toolNamespace`, определяющее к какой области знаний он относится.

```
┌─────────────────────────────────────────────────────────────┐
│                      AI ASSISTANT                            │
│                                                              │
│   "Мне нужны инструменты для работы с FlowDesk"             │
│                          │                                   │
│                          ▼                                   │
│               MCP Tool Registry                              │
│          list_tools_by_namespace('PROJECT')                  │
│                          │                                   │
│          ┌───────────────┼───────────────┐                  │
│          ▼               ▼               ▼                  │
│    CODEX (11)       CORE (104)     PROJECT (30)             │
│    ───────────      ──────────     ────────────             │
│    • Validation     • Graph CRUD   • SQL Extract            │
│    • ADR access     • AI/LLM       • FlowDesk               │
│    • Compliance     • Catalog      • Entity Extract         │
│    • Standards      • Patterns     • Domain Rules           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 9.7.2 Tool Namespaces

| Namespace | Назначение | Примеры tools |
|-----------|------------|---------------|
| **CODEX** | Работа со стандартами, валидацией, ADR | codex.search_rules, codex.check_compliance, meta.health_check |
| **CORE** | Инфраструктура системы UN PA | graph.query, ai.generate, catalog.search_graphs, vector.search |
| **PROJECT** | Анализ целевых проектов (FlowDesk, iNeed) | sql.schema_scan, flowdesk.classify_intent, ingestion.parse_document |

### 9.7.3 Источники Tools

Система объединяет tools из двух источников:

| Источник | Описание | Количество |
|----------|----------|------------|
| **MCP Tools** | Model Context Protocol handlers в `api/src/mcp/tools/` | 93 |
| **AOPEG Executors** | Graph execution plugins в `api/src/core/aopeg/plugins/` | 52 |
| **Всего** | | **145** |

### 9.7.4 Граф Tools в Memgraph

```
ToolCatalog (root)
    │
    ├── :HAS_CATEGORY → ToolCategory {id: 'meta'}
    │                        └── :HAS_TOOL → Tool {toolNamespace: 'CODEX'}
    │
    ├── :HAS_CATEGORY → ToolCategory {id: 'graph'}
    │                        └── :HAS_TOOL → Tool {toolNamespace: 'CORE'}
    │
    ├── :HAS_CATEGORY → ToolCategory {id: 'aopeg-flowdesk'}
    │                        └── :HAS_TOOL → Tool {toolNamespace: 'PROJECT'}
    │
    └── ... (19 категорий всего: 11 MCP + 8 AOPEG)
```

### 9.7.5 Tool Node Schema

```javascript
{
  // Identity
  id: 'tool.graph.query',             // Уникальный ID
  name: 'Query Graph',                // Человекочитаемое имя
  executorId: 'graph.query',          // ID для вызова

  // Classification
  toolNamespace: 'CORE',              // CODEX | CORE | PROJECT
  category: 'graph',                  // Категория внутри namespace
  source: 'mcp',                      // mcp | aopeg | codex

  // Metadata
  description: 'Execute Cypher query on knowledge graph',
  tags: ['graph', 'query', 'cypher'],
  status: 'active',                   // active | deprecated | experimental

  // Schemas
  inputSchema: { ... },               // JSON Schema для входных параметров
  outputSchema: { ... },              // JSON Schema для результата

  // Timestamps
  createdAt: '2026-03-19T...',
  updatedAt: '2026-03-19T...'
}
```

### 9.7.6 MCP Discovery API

AI агенты получают tools через MCP endpoints:

```javascript
// Получить все tools определённого namespace
await mcp.callTool('list_tools_by_namespace', {
  namespace: 'PROJECT'
});
// → { namespace: 'PROJECT', count: 30, tools: [...] }

// Получить tools с фильтром по категории
await mcp.callTool('list_tools_by_namespace', {
  namespace: 'CORE',
  category: 'graph',
  includeSchemas: true
});
// → { namespace: 'CORE', category: 'graph', count: 12, tools: [...] }

// Статистика по всем tools
await mcp.callTool('get_tool_stats', {});
// → { total: 145, byNamespace: { CODEX: 11, CORE: 104, PROJECT: 30 }, ... }
```

### 9.7.7 Маппинг категорий → namespace

**MCP Tools (93):**

| Category | Namespace | Кол-во |
|----------|-----------|--------|
| meta (system + codex) | CODEX | 11 |
| workflow, graph, ai, analytics, vector, notification, catalog, visualization, editor | CORE | 72 |
| ingestion | PROJECT | 10 |

**AOPEG Executors (52):**

| Plugin | Namespace | Кол-во |
|--------|-----------|--------|
| common, workflow, notification, subgraph, rag, ingestion | CORE | 32 |
| flowdesk, sql-extraction | PROJECT | 20 |

### 9.7.8 Добавление новых Tools

При создании нового Tool:

1. **Определить `toolNamespace`** по правилам:
   - Работа со стандартами/валидацией → **CODEX**
   - Инфраструктура системы → **CORE**
   - Анализ целевого проекта → **PROJECT**

2. **Добавить в seed script:**
   - MCP tools → `api/scripts/seed-tool-catalog.js`
   - AOPEG executors → `api/scripts/seed-aopeg-executors.js`

3. **Зарегистрировать** в ToolRegistry (для MCP tools)

4. **Создать Tool node** в графе с обязательными полями:
   - `id`, `name`, `executorId`
   - `toolNamespace`, `category`, `source`
   - `description`, `status`

### 9.7.9 Cypher запросы к Tool Registry

```cypher
-- Все tools по namespace
MATCH (t:Tool {toolNamespace: 'PROJECT'})
RETURN t.name, t.category, t.description;

-- Статистика по namespace и source
MATCH (t:Tool)
RETURN t.toolNamespace AS namespace, t.source AS source, count(t) AS count
ORDER BY namespace, source;

-- Tools определённой AOPEG категории
MATCH (cat:ToolCategory {id: 'aopeg-flowdesk'})-[:HAS_TOOL]->(t:Tool)
RETURN t.name, t.executorId;

-- Поиск по описанию
MATCH (t:Tool)
WHERE toLower(t.description) CONTAINS 'extract'
RETURN t.name, t.toolNamespace, t.description;
```

---

*Этот документ является частью [Кодекса UN ProjectAdvisor](../CODEX_INDEX.md)*

---

## Приложение A: Architecture Decision Records

### Индекс ADR

| ADR | Решение | Статус |
|-----|---------|--------|
| ADR-001 | Memgraph as Knowledge Graph Store | ACCEPTED |
| ADR-002 | GXE AOPEG Execution Model | ACCEPTED |
| ADR-003 | Four-Namespace Architecture | ACCEPTED |
| ADR-004 | Bi-temporal Versioning with Hash Chain | ACCEPTED |
| ADR-005 | Polystore Architecture | ACCEPTED |
| ADR-006 | Information Types Classification | ACCEPTED |

### ADR-001: Memgraph as Knowledge Graph Store

**Status:** ACCEPTED
**Date:** 2025-01-15
**Author:** Architecture Team

## Context

UN ProjectAdvisor needs a database to store extracted knowledge from legacy systems (IMIS, iNeed/FlowDesc, TFS/TFVC). The knowledge has complex relationships:
- Tables reference other tables (foreign keys)
- Methods call other methods
- Business rules depend on multiple entities
- Workflows have sequential and parallel branches

A traditional relational database would require many JOIN operations and struggle with variable-depth traversals. A document store would lose relationship semantics.

## Decision

We will use **Memgraph** as the primary knowledge graph store.

Memgraph is chosen over alternatives because:
1. **Cypher query language** — industry standard, readable, powerful for graph traversal
2. **In-memory performance** — sub-millisecond queries for connected data
3. **MAGE library** — built-in graph algorithms (PageRank, community detection, pathfinding)
4. **Bolt protocol** — compatible with Neo4j drivers and tooling
5. **Open source** — no vendor lock-in, self-hostable
6. **Streaming support** — Kafka/Pulsar integration for real-time updates

## Consequences

### Positive
- Complex relationship queries are natural and fast
- Graph algorithms available out-of-the-box
- Schema-flexible — can evolve with extraction pipeline
- Visual exploration possible (Memgraph Lab, NEXUS UI)

### Negative
- Single-node limitation — no native horizontal scaling
- Memory-bound — dataset must fit in RAM
- Less mature ecosystem than Neo4j
- Requires graph thinking — learning curve for SQL developers

### Neutral
- Need separate vector store for semantic search (Qdrant)
- Need separate cache layer for high-frequency reads (Redis)

## Alternatives Considered

### Alternative 1: Neo4j
- Industry leader, largest community
- **Rejected:** License cost for enterprise features, heavier resource footprint

### Alternative 2: Amazon Neptune
- Managed service, scales automatically
- **Rejected:** Cloud lock-in, higher latency, no MAGE equivalent

### Alternative 3: PostgreSQL with Apache AGE
- Familiar SQL + graph extension
- **Rejected:** Less mature graph features, complex setup

### Alternative 4: Pure Document Store (MongoDB)
- Flexible schema, good at hierarchical data
- **Rejected:** Loses relationship semantics, requires application-level joins

## Related ADRs

- ADR-005: Polystore Architecture (Memgraph + Qdrant + Redis)
- ADR-003: Four-Namespace Architecture

## Implementation Status

- [x] Memgraph deployed (Docker)
- [x] memgraph.service.js implemented
- [x] Schema Registry validation
- [x] 4,662 nodes migrated
- [x] Health check endpoint

---

### ADR-002: GXE AOPEG Execution Model

**Status:** ACCEPTED
**Date:** 2025-02-01
**Author:** Architecture Team

## Context

UN ProjectAdvisor needs to execute business logic graphs extracted from legacy systems. These graphs represent:
- Approval workflows
- Data transformation pipelines
- Decision trees
- Multi-step integrations

We need an execution engine that can:
1. Execute graphs with complex topologies (DAG, with potential cycles for retries)
2. Handle async operations (LLM calls, external APIs)
3. Support partial execution and resumption
4. Track execution history for debugging and optimization

## Decision

We will implement **GXE (Graph Execution Engine)** using the **AOPEG (Asynchronous Observable Parallel Execution Graph)** model.

Key principles:
1. **Asynchronous** — all node executions are async/await
2. **Observable** — execution state is observable via events/SSE
3. **Parallel** — independent nodes execute concurrently
4. **Execution** — nodes transform input to output
5. **Graph** — topology defines execution order

Execution flow:
```
Parse DAG -> Validate -> Build Execution Plan -> Execute Nodes -> Collect Results
                |              |                    |
           Schema Check   Topological Sort    Parallel where possible
```

## Consequences

### Positive
- Natural representation of business workflows
- Parallelism improves throughput
- Observable state enables real-time UI updates
- Graphs are reusable and composable

### Negative
- Complex debugging for parallel failures
- State management overhead
- Learning curve for graph-based thinking

### Neutral
- Requires catalog system for graph storage
- Execution records needed for history

## Alternatives Considered

### Alternative 1: Sequential Pipeline
- Simple linear execution
- **Rejected:** Cannot represent parallel branches, inefficient

### Alternative 2: State Machine (XState)
- Proven library, good for workflows
- **Rejected:** Less natural for data transformation, harder to parallelize

### Alternative 3: Temporal.io
- Production-grade workflow engine
- **Rejected:** External dependency, overkill for current scale

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-005: Polystore Architecture (execution records in META)

## Implementation Status

- [x] RuntimeEngine implemented
- [x] AOPEG node types defined
- [x] ExecutionRecorder integrated (CC-029)
- [x] Catalog auto-save (CC-020)
- [ ] Pattern Library promotion
- [ ] Visual graph editor in NEXUS

---

### ADR-003: Four-Namespace Architecture

**Status:** ACCEPTED
**Date:** 2025-02-15
**Author:** Architecture Team

## Context

UN ProjectAdvisor stores different types of information:
- System architecture documentation
- Extracted knowledge from target projects
- Execution infrastructure and metrics
- Executable graphs

Without clear separation, we risk:
- Cross-project data leakage
- Confusion between system docs and extracted data
- Difficulty querying specific domains
- No clear ownership/permissions model

## Decision

We will organize all graph nodes into **four namespaces**:

| Namespace | Purpose | Access |
|-----------|---------|--------|
| **CORE** | System infrastructure, catalog, tracking | Read: all, Write: system |
| **PROJECT** | Extracted knowledge from target systems | Read: project members, Write: extractors |
| **META** | Execution records, metrics, configs, ADRs | Read: all, Write: system |
| **GXE** | Executable graphs, ports, subgraphs | Read: all, Write: GXE engine |

Every node MUST have a `namespace` property. Namespace is validated on write.

## Consequences

### Positive
- Clear separation of concerns
- Easy to query specific domains (`WHERE n.namespace = 'PROJECT'`)
- Foundation for access control
- Prevents accidental cross-contamination

### Negative
- Additional field on every node
- Must maintain routing logic
- Cross-namespace queries need explicit handling

### Neutral
- Migration required for legacy nodes (completed in FIX-KB-003)

## Alternatives Considered

### Alternative 1: Separate Databases
- Physical isolation per domain
- **Rejected:** Cannot easily cross-reference, operational overhead

### Alternative 2: Label-based Separation
- Use labels like `:Core:Table` vs `:Project:Table`
- **Rejected:** Inconsistent, hard to query, label explosion

### Alternative 3: No Separation
- All nodes in single space
- **Rejected:** Data leakage risk, query complexity

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-006: Information Types Classification

## Implementation Status

- [x] Namespace field required on all nodes
- [x] Schema validation in mergeNode()
- [x] Routing rules in CODEX-DOMAINS
- [x] Migration completed (FIX-KB-002, FIX-KB-003, FIX-KB-004)
- [x] 0 nodes without namespace

---

### ADR-004: Bi-temporal Versioning with Hash Chain

**Status:** ACCEPTED
**Date:** 2025-02-20
**Author:** Architecture Team

## Context

Knowledge extracted from legacy systems changes over time:
- A business rule is updated in the source system
- An extraction algorithm improves and produces different results
- Human review corrects an error

We need to track both:
1. **When we learned** something (transaction time)
2. **When it was true** in reality (valid time)

Additionally, for audit and integrity, we need cryptographic proof that history wasn't tampered with.

## Decision

We will implement **bi-temporal versioning with hash chain** for critical entities (NodeVersion label).

### Bi-temporal Fields
- `ttStart` / `ttEnd` — Transaction Time (when recorded in system)
- `vtStart` / `vtEnd` — Valid Time (when true in reality)

### Hash Chain Fields
- `contentHash` — SHA-256 of canonicalized node properties
- `previousHash` — chainHash of previous version (or 'GENESIS')
- `chainHash` — SHA-256(previousHash + contentHash)

### Version Chain
```
v1 (SUPERSEDED) <-SUPERSEDES- v2 (SUPERSEDED) <-SUPERSEDES- v3 (ACTIVE)
```

## Consequences

### Positive
- Full audit trail of all changes
- Can answer "what did we know at time T?"
- Can answer "what was true at time T?"
- Tamper-evident history (hash chain)
- Supports compliance requirements

### Negative
- Storage overhead (multiple versions per entity)
- Query complexity for temporal queries
- Hash computation overhead on write

### Neutral
- Not all nodes need versioning (see ADR-006 for which types)
- Tombstones for soft delete (90-day restore window)

## Alternatives Considered

### Alternative 1: Simple Versioning (no temporal)
- Just version numbers, no time tracking
- **Rejected:** Cannot answer temporal queries

### Alternative 2: Event Sourcing
- Store all events, compute state
- **Rejected:** Overkill, complex to query current state

### Alternative 3: Mutable with Audit Log
- Update in place, separate audit log
- **Rejected:** Audit log can diverge, harder to query history

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-006: Information Types Classification

## Implementation Status

- [x] NodeVersion schema defined
- [x] version-manager.js implemented (CC-019)
- [x] SUPERSEDES chain creation
- [x] Bridge pattern for domain<->version links
- [x] Tombstone soft delete (CC-021)
- [x] God Mode for immutability override

---

### ADR-005: Polystore Architecture

**Status:** ACCEPTED
**Date:** 2025-02-25
**Author:** Architecture Team

## Context

Different data access patterns require different storage technologies:
- **Graph traversal** — finding connected entities
- **Semantic search** — finding similar content by meaning
- **Caching** — fast access to frequently read data
- **Job queues** — reliable async task processing

No single database excels at all patterns.

## Decision

We will implement a **polystore architecture** with three primary stores:

| Store | Technology | Purpose |
|-------|------------|---------|
| **Graph** | Memgraph | Nodes, edges, relationships, queries |
| **Vector** | Qdrant | Embeddings, semantic search, similarity |
| **Cache/Queue** | Redis | Caching, pub/sub, job queues (BullMQ) |

### Write Order
```
Memgraph (primary) -> Qdrant (secondary) -> Redis (cache)
```

### Consistency Model
- Memgraph is source of truth
- Qdrant mirrors node embeddings
- Redis is ephemeral cache (can be rebuilt)

### Saga Pattern for Writes
Compensating transactions if any step fails (LIFO rollback).

## Consequences

### Positive
- Best tool for each job
- Semantic search without graph overhead
- Fast caching layer
- Reliable job processing

### Negative
- Operational complexity (3 systems)
- Consistency challenges (eventual consistency)
- Orphaned data risk (Qdrant without Memgraph)

### Neutral
- Need OrphanDetector cron (implemented CC-017)
- Need health checks across all stores

## Alternatives Considered

### Alternative 1: Memgraph Only
- Add vector search via MAGE/custom
- **Rejected:** Not optimized for high-dim vectors

### Alternative 2: Single Document Store
- MongoDB with vector search
- **Rejected:** Loses graph semantics

### Alternative 3: Cloud-native (AWS)
- Neptune + OpenSearch + ElastiCache
- **Rejected:** Cloud lock-in, cost

## Related ADRs

- ADR-001: Memgraph as Knowledge Graph Store
- ADR-003: Four-Namespace Architecture

## Implementation Status

- [x] Memgraph service
- [x] Qdrant service with collections
- [x] Redis service with BullMQ
- [x] Polystore Saga (CC-018)
- [x] OrphanDetector cron (CC-017)
- [x] Health endpoints (CC-031)

---

### ADR-006: Information Types Classification

**Status:** ACCEPTED
**Date:** 2025-03-12
**Author:** Architecture Team

## Context

After auditing the knowledge base (AUDIT-KB-001, AUDIT-KB-002), we found:
- 76 different label combinations
- No clear classification system
- Mixed concerns (system docs vs extracted data)
- Inconsistent metadata requirements

We need a systematic way to categorize all information in the system.

## Decision

We will classify all information into **17 Information Types** across two levels:

### Level 1: System Meta (about UN ProjectAdvisor itself)
1. SystemArchitecture — components, dependencies
2. SystemRequirements — features, backlog
3. SystemDecisions — ADRs, rationale
4. SystemMetrics — performance, usage
5. SystemConfig — AI config, settings
6. ResearchKnowledge — theories, methodologies

### Level 2: Target Project (about analyzed systems)
7. ExtractedSchema — tables, columns, procedures
8. ExtractedCode — functions, methods, classes
9. ExtractedRules — business rules, validations
10. ExtractedEntities — concepts, organizations
11. ExecutableGraph — GXE subgraphs, ports
12. ExecutionRecord — execution history
13. InformationGraph — domain graphs, behavioral
14. CatalogInfra — catalog entries, versions
15. IngestionTracking — sessions, phases
16. GXEAudit — tech debt, gaps, goals
17. ReferenceData — support groups, staff profiles

Each type has:
- Mandatory namespace
- Allowed labels
- Required fields
- Allowed edge types

## Consequences

### Positive
- Clear categorization for all nodes
- Routing rules can auto-assign namespace
- Validation can check type-specific requirements
- Documentation is type-aware

### Negative
- Must maintain type registry
- New labels need classification
- Migration for legacy labels

### Neutral
- Documented in CODEX-DOMAINS.md (Part IX)

## Alternatives Considered

### Alternative 1: No Classification
- Just labels and namespaces
- **Rejected:** Too unstructured, hard to maintain

### Alternative 2: Hierarchical Types
- Type -> Subtype -> Label
- **Rejected:** Over-engineering, three levels is enough

## Related ADRs

- ADR-003: Four-Namespace Architecture
- ADR-004: Bi-temporal Versioning

## Implementation Status

- [x] CODEX-DOMAINS.md written (CC-028)
- [x] LABEL_ROUTING map defined
- [x] All 76 labels classified
- [x] 0 unclassified labels
- [x] Routing rules in production

---

## Приложение B: Changelog

Все значимые изменения в Кодексе документируются здесь.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/).

## [0.1.0] — 2026-03-12

### Добавлено

#### Часть 0: AI Манифест
- Философия системы и роль ИИ-агентов
- Принципы работы с противоречиями
- Этические границы автономии

#### Часть I: CODEX-CRUD
- Стандарты создания узлов и рёбер
- Fingerprint collision handling
- Polystore saga pattern (Memgraph → Qdrant → Redis)

#### Часть II: CODEX-META
- Обязательные поля метаданных (3 уровня)
- Knowledge Quantum schema (8 блоков)
- W3C PROV-O mapping
- Hash chain integrity
- Bi-temporal model (tt/vt)

#### Часть III: CODEX-VERSION
- Две модели: NodeVersion vs Domain nodes
- Bridge pattern для связи моделей
- SUPERSEDES chain management
- Merge/Split/Fork операции
- God Mode протокол
- Tombstones и soft delete

#### Часть IV: CODEX-NS
- Четыре namespace (CORE/PROJECT/META/COMMON)
- Routing rules и auto-detection
- Cross-namespace query patterns
- Isolation guarantees
- ExecutionRecord → META migration

#### Часть V: CODEX-VALID
- JSON Schema registry (7 schemas)
- Validation modes (warn/strict/skip)
- Error codes (VAL001-VAL009)

#### Часть VI: CODEX-CATALOG
- CatalogEntry/GraphVersion/GraphDefinition schema
- Auto-save policy
- 3-level deduplication (hash → Jaccard → GNN)
- Hybrid search (keyword + structural + GNN)
- Reuse strategies (DIRECT_REUSE, CLONE_MODIFY, ABSTRACT_INHERIT, CREATE_NEW)
- Pattern promotion lifecycle

#### Часть VII: CODEX-POLY
- Canonical write order (Memgraph → Qdrant → Redis)
- Compensating transactions (saga)
- Consistency levels
- Checkpoint/Resume для pipelines
- Health checks и auto-repair

#### Часть VIII: SELF-EVOLUTION (future)
- Agent cascade architecture (3-tier)
- Consensus voting mechanisms (Majority/Weighted/Unanimous)
- APES (Agent Performance Evolution System)
- Contradiction detection и resolution
- Self-documentation (ADR auto-generation)
- Autonomy levels 0-4

### Инфраструктура
- Schema Registry (`api/src/validation/schema-registry.js`) — 7 JSON schemas
- Интеграция в `memgraph.service.js` (warn mode по умолчанию)
- 34/34 unit tests passing
- Error codes: VAL001-VAL009, CRUD001-CRUD009, CATALOG001-CATALOG006

## [0.1.1] — 2026-03-12

### Добавлено

#### Часть IX: CODEX-DOMAINS
- 17 Information Types (двухуровневая архитектура: System Meta + Target Project)
- Label routing rules (76 labels → 17 типов → 4 namespace)
- Auto-documentation protocol для автономно создаваемых графов
- Статистика: 4,662 узла, 18,330 рёбер

### Исправлено

#### FIX-KB-001: ACTIVE_CONFIG аномалия
- Удалено 137,160 дубликатов рёбер ACTIVE_CONFIG
- Удалено 20 дубликатов AIConfigSet и 57 AIProviderConfig
- Исправлен `_setActiveConfigSetInternal()` (row-per-match → two-step)
- Исправлен `_createConfigSetInternal()` (CREATE → MERGE)
- Исправлен `_createProviderConfig()` (CREATE → MERGE)

#### FIX-KB-002: Namespace inconsistency
- Унифицированы CORE/Core/core → CORE (82 узла)
- Удалены default/default2 namespace (16 узлов → CORE)
- Добавлена нормализация namespace в `memgraph.service.js` `mergeNode()`

#### FIX-KB-003: Namespace для всех узлов
- 2,896 узлов получили namespace (было 63% без namespace → 0%)
- Маппинг по доменам: PROJECT(2,188), CORE(443+180), META(47)

#### FIX-KB-004: Namespace mismatches
- SystemComponent: GXE → CORE (20)
- BehavioralNode: CORE → PROJECT (18)
- Notification: CORE → META (15)
- Унифицированы sql-extraction, iNeed, YOUNEED, core.types.* → 4 стандартных NS

## [0.1.2] — 2026-03-13

### Добавлено

#### CC-029: Унификация ExecutionRecord
- Создан `ExecutionRecorder` (`runtime/persistence/ExecutionRecorder.js`)
- Интеграция в RuntimeEngine._buildResult() (fire-and-forget)
- Миграция AOPEG_Execution → ExecutionRecord (META namespace)
- ExecutionNodeRecordSchema добавлена в Schema Registry (8 schemas)

#### CC-030: E2E тест ExecutionRecord
- Тестовый скрипт `scripts/test-execution-record.js` (7/7 checks)
- Исправлен баг: 3 вызова _buildResult() не передавали dag

#### CC-031: Production Activation
- StartupManager (`services/startup/StartupManager.js`)
- OrphanDetector cron (каждые 6 часов)
- TombstoneExpirer cron (каждые 24 часа)
- Health endpoint `/health/codex`
- Graceful shutdown интеграция
- Тестовый скрипт `scripts/test-startup-manager.js` (12/12 checks)

#### CC-032: Architecture Decision Records
- 6 ADR созданы в `docs/codex/adr/`
- ADR-001: Memgraph as Knowledge Graph Store
- ADR-002: GXE AOPEG Execution Model
- ADR-003: Four-Namespace Architecture
- ADR-004: Bi-temporal Versioning with Hash Chain
- ADR-005: Polystore Architecture
- ADR-006: Information Types Classification
- 6 ADR nodes в Memgraph (META namespace)
- 12 RELATED_TO edges между ADR

### Инфраструктура
- Schema Registry: 8 schemas, 36 тестов
- Background jobs: 2 (OrphanDetector 6h, TombstoneExpirer 24h)
- .env.example обновлён

## [0.1.3] — 2026-03-19

### Добавлено

#### Tool Namespace Architecture (CODEX-DOMAINS §9.7)
- Поле `toolNamespace` (CODEX/CORE/PROJECT) в tool-definition.schema.json
- 145 Tool nodes записаны в Memgraph (93 MCP + 52 AOPEG)
- 19 ToolCategory nodes (11 MCP + 8 AOPEG)
- Классификация: CODEX=11, CORE=104, PROJECT=30

#### MCP Discovery Endpoints
- `list_tools_by_namespace` — фильтрация tools по namespace с optional category
- `get_tool_stats` — статистика registry (byLevel, byCategory, byNamespace)
- Built-in tools в GXEMcpServer (не через registry)

#### Codex Tools → MCP Integration
- 6 Codex tools мигрированы в MCP: `api/src/mcp/tools/codex/`
  - codex.search_rules, codex.get_rule, codex.get_principles
  - codex.get_blackcodex, codex.check_compliance, codex.propose_change
- Наследуют BaseTool, делегируют в executeCodexTool()
- Зарегистрированы через createCodexTools() в MCP index

#### ToolRegistry расширения
- `listByNamespace(namespace)` — фильтрация по toolNamespace
- `listByNamespaceAndCategory(namespace, category)` — двойная фильтрация
- `getStats()` возвращает `byNamespace` разбивку

#### Seed Scripts
- `seed-tool-catalog.js` обновлён: CATEGORY_NAMESPACE маппинг, toolNamespace в Cypher
- `seed-aopeg-executors.js` — новый скрипт с auto-discovery executors из plugins
- Исправлен баг: `runCypher` → `runQuery` в seed-tool-catalog.js

### Инфраструктура
- Документация: CODEX-DOMAINS.md §9.7 (9 подсекций)
- CODEX_INDEX.md обновлён со статистикой tools
- Tool definition schema расширена (optional toolNamespace field)

## [Unreleased]

### Планируется
- Приложение A: JSON Schemas (полный набор)
- Приложение B: Cypher Templates
- Приложение C: Error Codes Registry
- Приложение D: Migration Guide
- Приложение E: Code Review Checklist
- Повышение статуса до 🟢 1.0.0 после production validation

---

## Статистика Кодекса v0.1.3

| Метрика | Значение |
|---------|----------|
| Частей Кодекса | 10 (0-IX) |
| ADR | 6 |
| Information Types | 17 |
| Tool nodes в графе | 145 |
| Tool categories | 19 (11 MCP + 8 AOPEG) |
| Tool namespaces | 3 (CODEX, CORE, PROJECT) |
| JSON Schemas | 8 |
| Error codes | 18+ |
| Background jobs | 2 (OrphanDetector, TombstoneExpirer) |
| Seed scripts | 2 (seed-tool-catalog, seed-aopeg-executors) |
| Узлов в графе | ~4,800+ |
| Рёбер в графе | ~18,500+ |
| Namespaces | 4 (CORE, PROJECT, META, COMMON) |

---

*Сгенерировано: 2026-03-19T10:17:45.656Z*
*Версия: 0.1.3*
*Сборка: build-codex-artifact.js*

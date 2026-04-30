# КОДЕКС UN PROJECTADVISOR

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

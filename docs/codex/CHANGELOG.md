# Changelog — Кодекс UN ProjectAdvisor

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

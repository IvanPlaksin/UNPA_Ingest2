# CODEX-DOMAINS: Стандарты типов информации

> Часть IX Кодекса UN ProjectAdvisor v0.1.0
>
> **Статус:** 🟡 В разработке
> **Версия:** 0.1.0-draft
> **Последнее обновление:** 2026-03-12

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

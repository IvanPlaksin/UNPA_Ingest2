# CODEX-NS: Namespace Standard

**Status:** 🟡 In development
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Table of Contents

- [4.1 Four namespaces](#41-four-namespaces)
- [4.2 Routing rules](#42-routing-rules)
- [4.3 Cross-namespace queries](#43-cross-namespace-queries)
- [4.4 Isolation guarantees](#44-isolation-guarantees)
- [4.5 ExecutionRecord — why META, not PROJECT](#45-executionrecord--why-meta-not-project)

---

## Preamble

Namespace is the isolation mechanism in UN ProjectAdvisor. Every node and every edge in the knowledge graph belongs to exactly one namespace. A namespace defines:

- **Visibility:** who can read the data
- **Mutability:** who can write the data
- **Routing:** where requests are directed
- **Isolation:** which data must not overlap

The four namespaces provide separation between system knowledge (`CORE`), project data (`PROJECT`), meta-knowledge (`META`), and shared resources (`COMMON`).

```
Principle: data is separated by NATURE, not by storage technology.
One Memgraph, one Qdrant, one Redis — but four logical circuits.
```

---

## 4.1 Four namespaces

### Architecture

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

  Arrows = allowed cross-namespace READs
  ╳ = forbidden direct links between PROJECTs
```

### CORE — system knowledge

**Enum:** `KnowledgeNamespace.CORE = 'core'`

Knowledge about UN ProjectAdvisor itself: its services, pipelines, configurations, API schemas, and architectural decisions.

| Property | Value |
|----------|-------|
| **Purpose** | System knowledge about PA |
| **Example nodes** | `Service`, `Pipeline`, `Component`, `Config`, `Schema`, `API`, `Architecture`, `Decision` |
| **Namespace format** | `core` |
| **Update frequency** | On system releases |
| **Read** | `DEVELOPER`, `ARCHITECT`, `ADMIN` |
| **Write** | `ARCHITECT`, `ADMIN` |
| **Qdrant collection** | `core_knowledge` |
| **Redis prefix** | `core:` |
| **Cache TTL** | 3600 s (1 hour) |

**Example node:**

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

### PROJECT — project data

**Enum:** `KnowledgeNamespace.PROJECT = 'project'`

Knowledge extracted from UN legacy systems. Each project is stored in its own sub-namespace `PROJECT:{project_name}`. Projects are fully isolated from each other — direct edges between `PROJECT:imis` and `PROJECT:umoja` are forbidden.

| Property | Value |
|----------|-------|
| **Purpose** | Data from legacy projects |
| **Example nodes** | `File`, `Class`, `Method`, `WorkItem`, `Table`, `StoredProcedure`, `BusinessRule`, `Person`, `Team` |
| **Namespace format** | `project:{project_name}` (e.g., `project:imis`, `project:umoja`) |
| **Update frequency** | On re-indexing |
| **Read** | All roles (`VIEWER` and above) |
| **Write** | `DEVELOPER`, `ARCHITECT`, `ADMIN`, `SYSTEM` |
| **Qdrant collection** | `project_{project_name}` (e.g., `project_imis`) |
| **Redis prefix** | `project:{project_name}:` |
| **Cache TTL** | 1800 s (30 minutes) |

**Example node:**

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

### META — meta-knowledge

**Enum:** `KnowledgeNamespace.META = 'meta'`

Knowledge about knowledge: extraction strategies, processing patterns, pipeline execution records, quality metrics. META is about HOW the system works and learns, not WHAT it extracts.

| Property | Value |
|----------|-------|
| **Purpose** | Methodological knowledge, strategies, execution records |
| **Example nodes** | `Strategy`, `DataType`, `Tool`, `ContextPattern`, `StrategyExecution`, `ExtractionCycle`, `DecisionRecord`, `QualityRule` |
| **Namespace format** | `meta` |
| **Update frequency** | As the system learns |
| **Read** | `ARCHITECT`, `ADMIN`, `SYSTEM` |
| **Write** | `SYSTEM`, `ADMIN` |
| **Qdrant collection** | `meta_knowledge` |
| **Redis prefix** | `meta:` |
| **Cache TTL** | 7200 s (2 hours) |

**Example node:**

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

### COMMON — shared resources

**Enum:** `KnowledgeNamespace.COMMON = 'common'`

Dictionaries, glossaries, templates, and reference data used by all other namespaces. Contains the UN ontology, abbreviations, organizational structure. Write access only for approved contributors (`ADMIN`).

| Property | Value |
|----------|-------|
| **Purpose** | Common terminology, dictionaries, reference data |
| **Example nodes** | `Term`, `Concept`, `Organization`, `System`, `DocumentPattern`, `Glossary`, `Acronym`, `UNEntity` |
| **Namespace format** | `common` |
| **Update frequency** | Rarely |
| **Read** | All roles (`VIEWER` and above) |
| **Write** | `ADMIN` only |
| **Qdrant collection** | `common_vocabulary` |
| **Redis prefix** | `common:` |
| **Cache TTL** | 86400 s (24 hours) |

**Example node:**

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

### Namespace auto-detection algorithm

When a request arrives, `NamespaceRouter` determines the target namespace using the following algorithm:

```javascript
/**
 * Routing algorithm (namespace-router.service.js)
 *
 * Priority:
 *   1. Explicitly specified namespace (explicitNamespace)
 *   2. Determination by sourceSystem / projectId
 *   3. Determination by label / node type
 *   4. Query text analysis (regex patterns)
 *   5. Default → 'project' (for pipeline writes) or 'common' (for queries)
 */
async function resolveNamespace(context) {
  const { explicitNamespace, sourceSystem, label, query } = context;

  // [1] Explicit namespace — highest priority
  if (explicitNamespace) {
    if (!checkAccess(explicitNamespace, context.userRole, 'read')) {
      throw new Error(`Access denied to namespace: ${explicitNamespace}`);
    }
    return explicitNamespace;
  }

  // [2] By sourceSystem — if data came from a specific project
  if (sourceSystem) {
    const projectName = sourceSystem.toLowerCase();
    return `project:${projectName}`;
  }

  // [3] By label — each namespace has allowedNodeLabels
  if (label) {
    for (const [ns, config] of Object.entries(NAMESPACE_CONFIGS)) {
      if (config.allowedNodeLabels.includes(label)) {
        return ns === 'project' ? 'project:unknown' : ns;
      }
    }
  }

  // [4] By query text — regex analysis
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

### Regex detection patterns

`NamespaceRouter` uses the following patterns to analyze query text:

| Namespace | Patterns | Example matches |
|-----------|----------|-----------------|
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

### Routing table by label

| Label | Namespace | Example |
|-------|-----------|---------|
| `Service`, `Pipeline`, `Component` | `core` | PA API gateway service |
| `Config`, `Schema`, `API` | `core` | GraphQL schema definition |
| `Architecture`, `Decision` | `core` | ADR-005: choosing Memgraph |
| `File`, `Class`, `Method`, `Function` | `project:{name}` | Class `UserManager` from IMIS |
| `WorkItem`, `Epic`, `Bug`, `Task` | `project:{name}` | Work item #42300 from IMIS |
| `Table`, `Column`, `StoredProcedure` | `project:{name}` | Table `HR_EMPLOYEES` from Umoja |
| `BusinessRule`, `BusinessProcess` | `project:{name}` | Contract validation rule |
| `Strategy`, `ContextPattern` | `meta` | SQL schema extraction strategy |
| `StrategyExecution`, `ExtractionCycle` | `meta` | Pipeline execution record |
| `DecisionRecord`, `QualityRule` | `meta` | Strategy change decision |
| `Term`, `Concept`, `Glossary` | `common` | Term "appropriation" |
| `Acronym`, `UNEntity` | `common` | OICT, DGACM, ACABQ |
| `Organization`, `System` | `common` | United Nations Secretariat |
| `DocumentPattern` | `common` | General Assembly resolution template |

### Determining storage paths

Each namespace maps to specific storage paths:

```javascript
// namespace.config.js — getStoragePaths()

// For PROJECT namespace the path is built dynamically:
getStoragePaths('project:imis')
// → {
//     graphPrefix:      'project:imis',
//     qdrantCollection: 'project_imis',
//     redisPrefix:      'project:imis:',
//     storagePath:      '/knowledge/projects/imis'
//   }

// For other namespaces — static paths:
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

### Allowed patterns

**1. READ from any namespace (with the required access rights)**

Reading is always allowed if the user's role is in `readRoles` of the target namespace.

```cypher
// Query to CORE — information about services
MATCH (s:Service {namespace: 'core'})
WHERE s.name CONTAINS 'Memgraph'
RETURN s.name, s.description;

// Query to PROJECT — data of a specific project
MATCH (sp:StoredProcedure {fullNamespace: 'project:imis'})
WHERE sp.name STARTS WITH 'sp_get'
RETURN sp.name, sp.language;

// Query to COMMON — reference data
MATCH (a:Acronym {namespace: 'common'})
WHERE a.name = 'OICT'
RETURN a.fullForm;
```

**2. JOIN between PROJECT and COMMON (enriching project data with reference data)**

Project data often references common terminology. Such cross-namespace queries are executed through isCrossNamespace edges.

```cypher
// Find all IMIS tables linked to an organization from COMMON
MATCH (t:Table {fullNamespace: 'project:imis'})
      -[r:REFERENCES_ENTITY {isCrossNamespace: true}]->
      (org:Organization {namespace: 'common'})
RETURN t.name AS tableName, org.name AS organization;

// Enrich business rules with glossary terms
MATCH (br:BusinessRule {fullNamespace: 'project:umoja'})
      -[:USES_TERM {isCrossNamespace: true}]->
      (term:Term {namespace: 'common'})
RETURN br.name, collect(term.name) AS relatedTerms;
```

**3. META reads from PROJECT (analyzing extraction results)**

META knowledge is linked to project data through execution records and strategies.

```cypher
// Which strategies were used for the IMIS project
MATCH (se:StrategyExecution {namespace: 'meta'})
WHERE se.targetProject = 'imis'
MATCH (se)-[:USED_STRATEGY]->(s:Strategy {namespace: 'meta'})
RETURN s.name, se.successRate, se.executedAt;

// Aggregate quality metrics by project
MATCH (qr:QualityRule {namespace: 'meta'})
      -[:EVALUATED]->(cycle:ExtractionCycle {namespace: 'meta'})
WHERE cycle.targetNamespace STARTS WITH 'project:'
RETURN cycle.targetNamespace, avg(qr.score) AS avgQuality;
```

**4. CORE reads from COMMON (configuration references organizational structure)**

```cypher
// Which PA services serve organizations from COMMON
MATCH (svc:Service {namespace: 'core'})
      -[:SERVES {isCrossNamespace: true}]->
      (org:Organization {namespace: 'common'})
RETURN svc.name, org.name;
```

### Forbidden patterns

**1. Direct edges between different PROJECTs**

Each project is an isolated circuit. Direct links between `PROJECT:imis` and `PROJECT:umoja` are forbidden.

```cypher
// FORBIDDEN: direct edge between projects
MATCH (a:Table {fullNamespace: 'project:imis'}),
      (b:Table {fullNamespace: 'project:umoja'})
CREATE (a)-[:SIMILAR_TO]->(b);
// ^^^ Isolation violation! Use COMMON for linking.

// CORRECT APPROACH: linking through COMMON
MATCH (a:Table {fullNamespace: 'project:imis'}),
      (b:Table {fullNamespace: 'project:umoja'}),
      (concept:Concept {namespace: 'common'})
WHERE concept.name = 'HR_DataModel'
CREATE (a)-[:IMPLEMENTS {isCrossNamespace: true}]->(concept),
       (b)-[:IMPLEMENTS {isCrossNamespace: true}]->(concept);
```

**2. Writing to CORE from pipeline code**

CORE is read-only for pipelines. Only `ARCHITECT` and `ADMIN` can modify system knowledge.

```cypher
// FORBIDDEN: pipeline writes to CORE
// In executor code:
// await memgraph.mergeNode('Service', { namespace: 'core', ... });
// ^^^ Rejection: writeRoles does not include SYSTEM for CORE

// CORRECT: pipeline writes to META or PROJECT
// await memgraph.mergeNode('ExtractionCycle', { namespace: 'meta', ... });
```

**3. Modifying COMMON without approval**

COMMON contains dictionaries and ontologies used by all namespaces. Changes require the `ADMIN` role.

```cypher
// FORBIDDEN: developer adds a term to COMMON
// checkAccess('common', 'DEVELOPER', 'write') → false

// CORRECT: ADMIN only
// checkAccess('common', 'ADMIN', 'write') → true
MERGE (t:Term {id: $id, namespace: 'common'})
SET t.name = 'appropriation',
    t.definition = 'Authorization granted by the General Assembly...',
    t.createdAt = datetime();
```

**4. Writing META data to PROJECT namespace**

Execution records, strategies, and quality metrics are meta-knowledge. They describe how the system works, not extracted project data.

```cypher
// FORBIDDEN: ExecutionRecord in PROJECT
CREATE (er:ExecutionRecord {
  namespace: 'project',
  fullNamespace: 'project:imis',
  ...
});
// ^^^ Violation! ExecutionRecord is always META. See section 4.5.

// CORRECT:
CREATE (er:ExecutionRecord {
  namespace: 'meta',
  fullNamespace: 'meta',
  targetProject: 'imis',
  ...
});
```

---

## 4.4 Isolation guarantees

### Isolation rules table

| Rule | Guarantee | Enforcement |
|------|-----------|-------------|
| **PROJECT:X ↛ PROJECT:Y** | Direct edges between different projects are forbidden | `mergeRelationship()` + namespace check |
| **CORE immutable for pipelines** | SYSTEM role has no write access to CORE | `checkAccess('core', 'SYSTEM', 'write') → false` |
| **COMMON write = ADMIN only** | Only ADMIN can modify shared resources | `writeRoles: [UserRole.ADMIN]` |
| **META write = SYSTEM + ADMIN** | Pipelines write to META automatically | `writeRoles: [UserRole.SYSTEM, UserRole.ADMIN]` |
| **Label → Namespace binding** | Each label is allowed only in specific namespaces | `isLabelAllowed(namespace, label)` |
| **Cross-namespace marking** | All cross-namespace edges have `isCrossNamespace: true` | `_markCrossNamespaceRefs()` |
| **PROJECT namespace always with projectId** | `project` without qualifier is forbidden in production | Routing validation |

### Enforcement in memgraph.service.js

The main enforcement is implemented in `mergeRelationship()` through the `isCrossNamespace` parameter and in `_markCrossNamespaceRefs()`:

```javascript
/**
 * memgraph.service.js — enforcement of cross-namespace edges
 */
async mergeRelationship(fromId, toId, type, properties = {}, isCrossNamespace = false) {
  // ...

  const relProps = {
    ...properties,
    isCrossNamespace,            // Marking cross-namespace edge
    createdAt: new Date().toISOString()
  };

  // MERGE edge
  const query = `
    MATCH (a), (b)
    WHERE a.id = $fromId AND b.id = $toId
    MERGE (a)-[r:${type}]->(b)
    SET r += $properties
    RETURN r
  `;
  await session.run(query, { fromId, toId, properties: relProps });

  // Mark nodes as participants in cross-namespace relationship
  if (isCrossNamespace) {
    await this._markCrossNamespaceRefs(session, fromId, toId);
  }
}

/**
 * Marking nodes that participate in cross-namespace relationships.
 * Allows quickly finding "boundary" nodes.
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

Access control is implemented in `NamespaceRouter.checkAccess()`:

```javascript
/**
 * namespace-router.service.js — access check
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

Label validation through `isLabelAllowed()`:

```javascript
/**
 * namespace.config.js — checking label validity in a namespace
 */
function isLabelAllowed(fullNamespace, label) {
  const config = getNamespaceConfig(fullNamespace);
  if (!config) return false;
  return config.allowedNodeLabels.includes(label);
}

// Examples:
isLabelAllowed('core', 'Service')          // → true
isLabelAllowed('core', 'Table')            // → false (Table — PROJECT)
isLabelAllowed('project:imis', 'Table')    // → true
isLabelAllowed('common', 'StoredProcedure') // → false (SP — PROJECT)
isLabelAllowed('meta', 'Strategy')         // → true
```

### Auditing cross-namespace operations

To monitor cross-namespace relationships, the following audit query is used:

```cypher
// Find all cross-namespace edges
MATCH (a)-[r {isCrossNamespace: true}]->(b)
RETURN a.fullNamespace AS fromNS,
       b.fullNamespace AS toNS,
       type(r) AS relType,
       count(r) AS edgeCount
ORDER BY edgeCount DESC;

// Find violations: direct edges between different PROJECTs
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

// Find nodes with a wrong label for their namespace
MATCH (n)
WHERE n.namespace IS NOT NULL
  AND n.namespace = 'core'
  AND NOT n:Service AND NOT n:Pipeline AND NOT n:Component
  AND NOT n:Config AND NOT n:Schema AND NOT n:API
  AND NOT n:Documentation AND NOT n:Architecture
  AND NOT n:Decision AND NOT n:Worker
RETURN labels(n) AS wrongLabels, n.id, n.namespace;

// Statistics by namespace
MATCH (n)
WHERE n.namespace IS NOT NULL
RETURN n.namespace AS namespace,
       count(n) AS nodeCount,
       collect(DISTINCT labels(n)) AS labelTypes
ORDER BY namespace;
```

---

## 4.5 ExecutionRecord — why META, not PROJECT

### Current problem

In the current implementation of `RuntimeAdapter` (`api/src/services/immutable-graph/integration/runtime-adapter.ts`), `ExecutionRecord` nodes are written to the PROJECT namespace:

```typescript
// runtime-adapter.ts — CURRENT state (INCORRECT)
export class RuntimeAdapter {
  private static readonly PATTERN_NODE_TYPE = 'ExecutionPattern';
  private static readonly EXECUTION_NODE_TYPE = 'ExecutionRecord';
  private static readonly PATTERN_NAMESPACE = Namespace.PROJECT;  // ← PROBLEM

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string = 'gxe-patterns'
  ) {}

  async recordExecution(result: ExecutionResult): Promise<RecordResult> {
    // ...
    await this.createExecutionRecord(result, pattern.entityId);
    // ^^^ Written to PROJECT namespace via PATTERN_NAMESPACE
  }
}
```

This means pipeline execution records end up in `project:gxe-patterns`, mixed with project data.

### Target state

`ExecutionRecord` and `ExecutionPattern` must always be written to the `META` namespace:

```typescript
// runtime-adapter.ts — TARGET state (CORRECT)
export class RuntimeAdapter {
  private static readonly PATTERN_NODE_TYPE = 'ExecutionPattern';
  private static readonly EXECUTION_NODE_TYPE = 'ExecutionRecord';
  private static readonly PATTERN_NAMESPACE = Namespace.META;  // ← FIXED

  constructor(
    private graphService: ImmutableGraphService,
    private projectId: string = 'execution-records'  // ← Descriptive ID
  ) {}
}
```

### Rationale

| Argument | Explanation |
|----------|-------------|
| **Nature of data** | ExecutionRecord describes HOW the system worked (time, status, metrics), not WHAT was extracted. This is meta-knowledge by definition. |
| **Cross-project analytics** | To compare strategy effectiveness between projects, a single namespace is needed. If records are scattered across `project:imis`, `project:umoja` — aggregation requires multi-namespace queries. |
| **Label consistency** | `ExecutionRecord` and `StrategyExecution` are in `allowedNodeLabels` for META (`Strategy`, `StrategyExecution`, `ExtractionCycle`, `DecisionRecord`), but not for PROJECT. |
| **Immutability** | An execution record must never be changed. The META namespace ensures this through write-only access for SYSTEM. |
| **PROJECT cleanliness** | Project data should contain only knowledge extracted from legacy systems. System metrics pollute the project graph. |
| **Link to project** | The reference to the project is preserved through the `targetProject` property, not through the namespace. This allows filtering by project without violating isolation. |

### Migration

To move existing `ExecutionRecord` nodes from PROJECT to META:

```cypher
// Step 1: Find all ExecutionRecord nodes in PROJECT namespace
MATCH (er:ExecutionRecord)
WHERE er.namespace = 'project'
RETURN count(er) AS recordsToMigrate;

// Step 2: Update namespace
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

// Step 3: Update related ExecutionPattern nodes
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

// Step 4: Verification
MATCH (er:ExecutionRecord)
WHERE er.namespace = 'project'
RETURN count(er) AS remainingInProject;
// Expected result: 0

MATCH (er:ExecutionRecord {namespace: 'meta'})
RETURN count(er) AS migratedRecords,
       collect(DISTINCT er.targetProject) AS projects;
```

After migration, `runtime-adapter.ts` must be updated:
- Change `PATTERN_NAMESPACE` from `Namespace.PROJECT` to `Namespace.META`
- Add `ExecutionRecord` to `allowedNodeLabels` in the META namespace configuration
- Update the constructor's `projectId` to a descriptive value instead of `'gxe-patterns'`

---

*This document is part of the [UN ProjectAdvisor Codex](../CODEX_INDEX.md)*

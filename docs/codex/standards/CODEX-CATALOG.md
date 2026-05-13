# CODEX-CATALOG: GXE Catalog Standard

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

The catalog is the single source of truth about all graphs in the UN ProjectAdvisor system. Without a catalog, graphs become scattered artifacts: duplicated, lost, and never reused. With a catalog, they form a managed library with versioning, deduplication, and intelligent search.

This standard defines:
- the `CatalogEntry` schema and related nodes,
- the automatic graph save policy,
- deduplication mechanisms (exact, structural, semantic),
- four search modes (keyword, structural, GNN, hybrid),
- graph reuse strategies,
- the pattern lifecycle and promotion to templates.

Implementation: `api/src/services/graphCatalog.service.js`

---

## 6.1. CatalogEntry schema

### Catalog graph structure

The catalog is organized as a hierarchical tree of nodes in Memgraph. Each graph is represented by a triple `CatalogEntry -> GraphDefinition -> GraphVersion`, where CatalogEntry is the registry record, GraphDefinition is the definition (nodes + edges), and GraphVersion is a specific version snapshot.

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

Additional hierarchy relationships:

```
(:CatalogEntry)-[:CHILD_OF]->(:CatalogEntry)           # Parent hierarchy
(:CatalogEntry)-[:DECOMPOSES {nodeId}]->(:CatalogEntry) # Node decomposition into subgraph
```

### Full CatalogEntry schema

| Field          | Type       | Required | Description                                    | Example                         |
|----------------|------------|----------|------------------------------------------------|---------------------------------|
| `entryId`      | `string`   | Yes      | Globally unique identifier (UUID)              | `"a1b2c3d4-e5f6-..."`          |
| `name`         | `string`   | Yes      | Human-readable graph name                      | `"IT Hardware Request"`         |
| `type`         | `string`   | Yes      | Graph type (see CATALOG_TYPES)                 | `"business"`                    |
| `namespace`    | `string`   | Yes      | Namespace (data isolation)                     | `"un-pa"`, `"default"`          |
| `description`  | `string`   | No       | Brief description of the graph's purpose       | `"Equipment request process"`   |
| `tags`         | `string[]` | No       | Tags for search and classification             | `["ineed", "hardware", "it"]`   |
| `visibility`   | `string`   | Yes      | Visibility level (see below)                   | `"PUBLIC"`                      |
| `qualityScore` | `number`   | No       | Quality score (0.0 -- 1.0)                     | `0.85`                          |
| `createdAt`    | `string`   | Yes      | ISO 8601 creation timestamp                    | `"2026-03-12T14:30:00.000Z"`   |
| `updatedAt`    | `string`   | Yes      | ISO 8601 last update timestamp                 | `"2026-03-12T15:00:00.000Z"`   |
| `createdBy`    | `string`   | No       | Author                                         | `"system"`, `"user-123"`        |
| `currentVersion` | `number` | Yes     | Current version number (integer)               | `3`                             |
| `usageCount`   | `number`   | No       | Usage counter                                  | `42`                            |
| `isPublic`     | `boolean`  | No       | Public flag (for backward compatibility)       | `true`                          |

### GraphDefinition schema

| Field           | Type      | Description                                           |
|-----------------|-----------|-------------------------------------------------------|
| `graphId`       | `string`  | Definition UUID                                       |
| `nodes`         | `string`  | JSON string of the graph nodes array                  |
| `edges`         | `string`  | JSON string of the graph edges array                  |
| `requiredParams`| `string`  | JSON string of parameters required to run             |
| `toolIds`       | `string[]`| List of tool identifiers                              |
| `nodeCount`     | `number`  | Number of nodes                                       |
| `edgeCount`     | `number`  | Number of edges                                       |
| `topology`      | `string`  | Topology classification (`PIPELINE`, `DAG`, `TREE`)   |
| `contentHash`   | `string`  | SHA-256 of sorted JSON nodes and edges                |
| `validatedAt`   | `string`  | Time of last validation                               |
| `wasAutoFixed`  | `boolean` | Whether the graph was automatically fixed             |

### GraphVersion schema

| Field           | Type     | Description                                      |
|-----------------|----------|--------------------------------------------------|
| `versionId`     | `string` | Version UUID                                     |
| `versionNumber` | `number` | Integer version number (1, 2, 3...)              |
| `changelog`     | `string` | Description of changes                           |
| `createdAt`     | `string` | ISO 8601 version creation timestamp              |
| `createdBy`     | `string` | Version author                                   |
| `contentHash`   | `string` | SHA-256 hash of this version's content           |

### CATALOG_TYPES -- allowed graph types

```javascript
const CATALOG_TYPES = {
  BUSINESS:  'business',   // Business processes (iNeed, onboarding, approval)
  TECHNICAL: 'technical',  // Technical pipelines (ETL, extraction, deployment)
  META:      'meta',       // Meta-graphs that manage other graphs
  TEMPLATE:  'template',   // Templates for creating new graphs
  COMPOSITE: 'composite',  // Composite graphs containing subgraphs
};
```

| Type         | Purpose                                                  | Example                         |
|--------------|----------------------------------------------------------|---------------------------------|
| `business`   | Models a business process end-to-end                     | iNeed Hardware Request          |
| `technical`  | Technical data processing pipeline                       | SQL Extraction Pipeline         |
| `meta`       | Orchestrates other graphs, manages routing               | iNeed META Intake               |
| `template`   | Parameterized template for cloning                       | Generic Approval Workflow       |
| `composite`  | Aggregates multiple subgraphs via DECOMPOSES             | Full Onboarding Process         |

> **CATALOG003:** Attempting to create a CatalogEntry with a type not present in `CATALOG_TYPES` results in error `CATALOG003: Invalid type enum`.

### Visibility levels

| Level      | Description                                                     | Who can see                     |
|------------|-----------------------------------------------------------------|---------------------------------|
| `PUBLIC`   | Accessible to all users and system agents                       | Everyone                        |
| `INTERNAL` | Accessible only within the namespace                            | Namespace members               |
| `PRIVATE`  | Accessible only to the author and administrators                | Author + admin                  |

### Cypher: creating a CatalogEntry

```cypher
// Create a new catalog entry
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

// Link to CatalogRoot
MATCH (root:CatalogRoot {id: 'catalog-root'})
MATCH (c:CatalogEntry {entryId: $entryId})
MERGE (root)-[:CONTAINS]->(c)
```

### Cypher: query CatalogEntry with latest version

```cypher
MATCH (c:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
OPTIONAL MATCH (c)-[:CHILD_OF]->(parent:CatalogEntry)
RETURN c, d, v, parent.entryId AS parentId
ORDER BY v.versionNumber DESC
LIMIT 1
```

### Cypher: list all graphs in a namespace

```cypher
MATCH (c:CatalogEntry)
WHERE c.namespace = $namespace
  AND c.visibility IN ['PUBLIC', 'INTERNAL']
RETURN c.entryId AS id, c.name, c.type, c.description,
       c.tags, c.currentVersion, c.qualityScore
ORDER BY c.updatedAt DESC
```

### Indexes

Required indexes for catalog performance:

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

### When a graph is saved automatically

The catalog does not require an explicit "Save" action from the user. Graphs are saved automatically in three scenarios:

```
┌───────────────────────────────────────────────────────────────────────┐
│                     AUTO-SAVE TRIGGERS                                 │
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

| Trigger           | Method                          | What is created                                      |
|--------------------|---------------------------------|------------------------------------------------------|
| Graph creation     | `createGraph(data)`             | CatalogEntry + GraphDefinition + GraphVersion v1     |
| New version        | `createVersion(entryId, data)`  | New GraphDefinition + GraphVersion vN+1, SUPERSEDES  |
| SQL Import         | `mssql.import-orchestrator.js`  | New CatalogEntry for each imported graph             |
| GraphLoader startup| `graph-loader.service.js`       | CatalogEntry for pre-loaded graphs (iNeed, SQL Extraction) |

### GXE godMode -- two save modes

GXE editor save behavior depends on the `godMode` setting:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   godMode: OFF (normal mode)            godMode: ON (God Mode)  │
│   ────────────────────────                ──────────────────────  │
│                                                                 │
│   User clicks "Save"                    User clicks "Save"      │
│           │                                    │                 │
│           ▼                                    ▼                 │
│   createVersion(entryId, data)          updateGraph(id, data)    │
│           │                                    │                 │
│           ▼                                    ▼                 │
│   ┌──────────────────┐                 ┌──────────────────┐      │
│   │ GraphVersion N+1 │                 │ In-place SET     │      │
│   │ + SUPERSEDES     │                 │ on GraphDefinition│      │
│   │ + new Definition │                 │ (no new version) │      │
│   └──────────────────┘                 └──────────────────┘      │
│                                                                 │
│   History PRESERVED                    History NOT preserved    │
│   Rollback possible                    Rollback impossible      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

- **godMode OFF** -- recommended mode. Each save creates a new version (`createVersion`). The graph becomes immutable after saving. Full change history is preserved.

- **godMode ON** -- mode for rapid prototyping. Updates the GraphDefinition in place (`updateGraph`). Does not create a new version. Used only during development.

> **CATALOG004:** If two users update the same CatalogEntry concurrently, error `CATALOG004: Version conflict` is raised. The system uses `currentVersion` as an optimistic lock.

### GraphLoader -- auto-save on startup

On server startup, `GraphLoaderService` loads predefined graphs from files and creates a `CatalogEntry` for each:

```javascript
// graph-loader.service.js -- simplified excerpt
async loadGraph(graphDef) {
  const dag = { nodes: graphDef.nodes, edges: graphDef.edges };

  // 1. Save to PatternLibrary (in-memory cache)
  this._patternLibrary.register(graphDef.id, dag);

  // 2. Save metadata to Memgraph
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

Pre-loaded graphs:

| Graph ID                              | Type      | Nodes | Edges |
|----------------------------------------|-----------|-------|-------|
| `INEED-G0-META-INTAKE-V1`             | meta      | 16    | 16    |
| `INEED-G1-IT-HARDWARE-V1`             | business  | 22    | 22    |
| `INEED-G2-HR-ACCESS-V1`               | business  | 13    | 13    |
| `INEED-G3-FACILITIES-WORKSPACE-V1`    | business  | 12    | 12    |
| `CORE-SQL-EXTRACTION-META-V1`         | technical | --    | --    |
| `CORE-SQL-PROCEDURE-ANALYSIS-V1`      | technical | --    | --    |

### Cypher: creating a version with SUPERSEDES

```cypher
// Step 1: Get current version
MATCH (c:CatalogEntry {entryId: $entryId})
RETURN c.currentVersion AS currentVersion

// Step 2: Update current version number
MATCH (c:CatalogEntry {entryId: $entryId})
SET c.updatedAt = datetime(), c.currentVersion = $versionNumber

// Step 3: Create new GraphDefinition and GraphVersion
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

// Step 4: Link to CatalogEntry
MATCH (c:CatalogEntry {entryId: $entryId})
MATCH (g:GraphDefinition {graphId: $graphId})
MATCH (v:GraphVersion {versionId: $versionId})
CREATE (c)-[:DEFINES]->(g)
CREATE (g)-[:HAS_VERSION]->(v)

// Step 5: Create SUPERSEDES edge to previous version
MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(prev:GraphVersion)
WHERE prev.versionNumber = $versionNumber - 1
MATCH (v:GraphVersion {versionId: $versionId})
CREATE (v)-[:SUPERSEDES]->(prev)
```

---

## 6.3. Deduplication

### Problem

Without deduplication, the catalog quickly fills with duplicates: the same pipeline saved by different users, or repeatedly imported from the same source. Deduplication ensures uniqueness of each graph in the catalog.

### Three-level deduplication strategy

```
  New graph
      │
      ▼
┌─────────────────────────────────┐
│ Level 1: EXACT MATCH            │
│ contentHash == existing?        │
│                                 │
│ SHA-256(sorted(nodes + edges))  │
│ O(1) lookup by index            │
├─────────────┬───────────────────┘
│  Match      │  No match
│             ▼
│  ┌─────────────────────────────────┐
│  │ Level 2: STRUCTURAL MATCH       │
│  │ Jaccard(toolIds_A, toolIds_B)   │
│  │          >= 0.85 ?              │
│  │                                 │
│  │ Compare topology, node count,   │
│  │ edge count, toolId overlap      │
│  ├─────────────┬───────────────────┘
│  │  Match      │  No match
│  │             ▼
│  │  ┌─────────────────────────────────┐
│  │  │ Level 3: SEMANTIC MATCH (GNN)   │
│  │  │ cosine(embedding_A, embedding_B)│
│  │  │          >= threshold ?         │
│  │  │                                 │
│  │  │ GNN graph embeddings            │
│  │  │ Threshold: configurable         │
│  │  │ (default: 0.90)                 │
│  │  ├─────────────┬───────────────────┘
│  │  │  Match      │  No match
│  │  │             ▼
│  │  │        ┌────────────┐
│  │  │        │  UNIQUE    │
│  │  │        │  Create    │
│  │  │        │ CatalogEntry│
│  │  │        └────────────┘
│  │  ▼
│  ▼
│ ┌────────────────────┐
│ │ DUPLICATE FOUND    │
│ │ Return existing    │
│ │ entryId            │
│ └────────────────────┘
▼
```

> **CATALOG005:** When a Level 1 duplicate is detected, error `CATALOG005: Dedup collision (identical contentHash exists)` is returned with the `existingEntryId`.

### Level 1: Exact Match -- contentHash

The fastest and most reliable level. `contentHash` is computed as SHA-256 of canonicalized JSON of nodes and edges:

```javascript
/**
 * Computes contentHash for a graph.
 * Used for exact-match deduplication.
 *
 * @param {Array} nodes - Array of graph nodes
 * @param {Array} edges - Array of graph edges
 * @returns {string} SHA-256 hash
 */
computeContentHash(nodes, edges) {
  // Sorting ensures hash stability
  // when the order of nodes/edges changes
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

ContentHash lookup is O(1) thanks to an index:

```cypher
MATCH (d:GraphDefinition {contentHash: $hash})
RETURN d.graphId AS graphId
LIMIT 1
```

### Level 2: Structural Match -- Jaccard Similarity

If exact match fails, structural similarity is checked. The primary metric is the Jaccard coefficient over toolId:

```
           |toolIds_A ∩ toolIds_B|
J(A,B) = ─────────────────────────
           |toolIds_A ∪ toolIds_B|
```

Threshold: **J >= 0.85** -- graphs are considered structurally identical.

Additional signals:
- Topology match (PIPELINE / DAG / TREE)
- Node count proximity (±20%)
- Tag overlap

```javascript
/**
 * Checks structural similarity between two graphs.
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

When structural comparison is insufficient (graphs use different tools but solve the same problem), GNN embeddings are used:

```javascript
/**
 * Computes semantic similarity via the GNN service.
 *
 * @param {Object} graphA - Graph to compare
 * @param {Object} graphB - Reference graph
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
    similar: cosine >= 0.90,  // Threshold is configurable
    cosine: Math.round(cosine * 1000) / 1000,
  };
}
```

The GNN service (port 5000) computes an embedding for each graph and then calculates the cosine distance:

```
                    Σ(A_i × B_i)
cos(A, B) = ────────────────────────
              √(Σ A_i²) × √(Σ B_i²)
```

### checkFingerprintCollision

The `checkFingerprintCollision()` function from `GraphSchemaManager` combines all three levels:

```javascript
/**
 * Checks whether a duplicate of a graph exists in the catalog.
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

### Four search modes

The catalog supports four search modes, from simple to intelligent:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SEARCH MODES                                    │
│                                                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐ │
│  │  KEYWORD    │  │  STRUCTURAL  │  │  SEMANTIC   │  │   HYBRID     │ │
│  │             │  │              │  │   (GNN)     │  │              │ │
│  │ name LIKE   │  │ Jaccard      │  │ cosine sim  │  │ weighted     │ │
│  │ tags CONTAINS│  │ toolId match │  │ embedding   │  │ combination  │ │
│  │ description │  │ topology     │  │ space       │  │ of all three │ │
│  │ FULLTEXT    │  │ node count   │  │             │  │              │ │
│  └─────────────┘  └──────────────┘  └────────────┘  └──────────────┘ │
│                                                                        │
│  Speed: ████    Speed: ███     Speed: ██    Speed: ██              │
│  Quality: ██    Quality: ███   Quality: ████  Quality: █████        │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Keyword Search

Full-text search by name, description, and tags. Uses Cypher CONTAINS and FULLTEXT indexes:

```cypher
// Keyword search
MATCH (c:CatalogEntry)
WHERE c.name CONTAINS $searchTerm
   OR c.description CONTAINS $searchTerm
   OR ANY(tag IN c.tags WHERE tag CONTAINS $searchTerm)
RETURN c.entryId AS id, c.name, c.description, c.type, c.tags
ORDER BY c.qualityScore DESC, c.usageCount DESC
LIMIT $limit
```

For high-load scenarios, a FULLTEXT index is recommended:

```cypher
// Create FULLTEXT index (executed once during initialization)
CALL db.index.fulltext.createNodeIndex(
  'catalog_search',
  ['CatalogEntry'],
  ['name', 'description']
);

// Search via FULLTEXT
CALL db.index.fulltext.queryNodes('catalog_search', $searchTerm)
YIELD node, score
RETURN node.entryId AS id, node.name, score
ORDER BY score DESC
LIMIT $limit
```

### 2. Structural Search

Search by graph structural characteristics: toolId overlap, topology, size.

```javascript
/**
 * Structural search in the catalog.
 *
 * @param {Object} criteria - { toolIds, topology, minNodes, maxNodes }
 * @returns {Promise<Array>} Sorted results
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

Search by semantic similarity via GNN graph embeddings. Computes an embedding for the query and finds nearest neighbors in the embedding space:

```javascript
/**
 * Semantic search via the GNN service.
 *
 * @param {Object} queryGraph - { nodes, edges }
 * @param {number} topK - Number of results
 * @returns {Promise<Array>} Ranked results with cosine score
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

Combines all three modes with configurable weights:

```
score = w_keyword * S_keyword + w_structural * S_jaccard + w_gnn * S_cosine
```

Default weights:

| Component        | Weight (w) | Rationale                                              |
|------------------|------------|--------------------------------------------------------|
| `w_keyword`      | **0.3**    | Base signal, fast but noisy                            |
| `w_structural`   | **0.3**    | Reliable for technical graphs with known toolIds       |
| `w_gnn`          | **0.4**    | Highest weight: accounts for semantics and structure   |

```javascript
/**
 * Hybrid search in the catalog.
 *
 * @param {Object} query - { searchTerm, toolIds, topology, nodes, edges }
 * @param {Object} weights - { keyword, structural, gnn }
 * @returns {Promise<Array>} Ranked results
 */
async hybridSearch(query, weights = { keyword: 0.3, structural: 0.3, gnn: 0.4 }) {
  // Run all three modes in parallel
  const [keywordResults, structuralResults, gnnResults] = await Promise.allSettled([
    this.keywordSearch(query.searchTerm),
    this.structuralSearch({ toolIds: query.toolIds, topology: query.topology }),
    this.semanticSearch({ nodes: query.nodes, edges: query.edges }),
  ]);

  // Merge results
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

  // Compute final score
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

### MCP Tools for search

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

### The reuse problem

When the system needs a new subgraph, there are four options: create from scratch, copy an existing one, extend a template, or reference a ready-made one. Choosing the wrong strategy leads to catalog bloat (unnecessary clones) or fragile dependencies (broken references).

### ReuseStrategyResolver

Implementation: `api/src/services/graph/reuse-strategy-resolver.js`

Four reuse strategies:

| Strategy           | Identifier          | Description                                           |
|--------------------|---------------------|-------------------------------------------------------|
| **CLONE**          | `CLONE_MODIFY`      | Clone the graph and modify it for the task            |
| **EXTEND**         | `ABSTRACT_INHERIT`  | Take a template and parameterize it                   |
| **COMPOSE**        | `DIRECT_REUSE`      | Use the graph as-is (reference, no copy)              |
| **REFERENCE**      | `CREATE_NEW`        | Create a new graph from scratch                       |

### Decision matrix

```
                        Similarity Score
                   0.0        0.5        0.9        1.0
                    │          │          │          │
                    ▼          ▼          ▼          ▼
   ┌────────────────────────────────────────────────────────────┐
   │                                                            │
   │  CREATE_NEW        CLONE_MODIFY       DIRECT_REUSE        │
   │  Create            Clone and          Use as-is           │
   │  new graph         adapt                                   │
   │                                                            │
   │  ◄─── 0.0 ─── 0.3 ──── 0.6 ──── 0.9 ──── 1.0 ───►       │
   │       │              │              │                      │
   │       │  No          │  Medium      │  High                │
   │       │  relevant    │  similarity  │  similarity          │
   │       │  candidates  │              │                      │
   └────────────────────────────────────────────────────────────┘

   Special case: if the best candidate has type='template'
   and score > 0.5 → ABSTRACT_INHERIT (takes priority over others)
```

| Condition                                    | Strategy            | Action                                    |
|-----------------------------------------------|---------------------|-------------------------------------------|
| `score >= 0.9`                                | `DIRECT_REUSE`      | Reference the existing graph              |
| `0.6 <= score < 0.9`                          | `CLONE_MODIFY`      | Clone + modify nodes/edges                |
| `type = 'template'` AND `score > 0.5`        | `ABSTRACT_INHERIT`  | Instantiate from template                 |
| `score < 0.6` or no candidates              | `CREATE_NEW`        | Create a new graph from scratch           |

> **CATALOG006:** If the reuse strategy does not match the actual action (e.g., `DIRECT_REUSE` was recommended but the user modified the graph), warning `CATALOG006: Reuse strategy mismatch` is raised.

### Strategy selection algorithm

```
┌──────────────────────────────────────────────────────────────────┐
│                 STRATEGY SELECTION FLOW                            │
│                                                                    │
│  Input:                                                            │
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
│  │ Step 3b: _applyGNNBoost() (opt.)   │                          │
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

### Candidate scoring weights

| Factor              | Weight   | Description                                                  |
|---------------------|----------|--------------------------------------------------------------|
| toolId Jaccard      | **0.40** | Tool overlap between graphs                                  |
| keyword overlap     | **0.25** | Keyword match (name, description, tags)                      |
| topology match      | **0.15** | Topology match (PIPELINE/DAG/TREE)                           |
| size proximity      | **0.10** | Node count proximity (3--20 = 0.8, otherwise 0.4)           |
| quality bonus       | **0.10** | Graph quality score (qualityScore)                           |

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
    reason: 'string',          // Human-readable rationale
    sourceGraph: {             // Best candidate (null for CREATE_NEW)
      entryId: 'string',
      name: 'string',
      similarityScore: 'number',
      scoreBreakdown: 'object',
    },
    alternatives: 'object[]',  // Top-3 alternative candidates
    gnnUsed: 'boolean',        // Whether GNN was used for boosting
  }
}
```

---

## 6.6. Pattern promotion

### Two types of PatternLibrary

The system has two independent pattern stores operating at different levels:

```
┌─────────────────────────────────────┐   ┌─────────────────────────────────────┐
│    Runtime PatternLibrary           │   │    Extraction PatternLibrary        │
│    (runtime/learning/)              │   │    (services/patterns/)             │
│                                     │   │                                     │
│  Stores: DAG execution patterns     │   │  Stores: Extraction patterns        │
│  Source: recordExecution()          │   │  Source: registerEntityPattern()    │
│  Purpose: graph reuse               │   │  Purpose: extraction improvement    │
│  Cache: LRU in-memory + Memgraph   │   │  Cache: in-memory + domain index    │
│                                     │   │                                     │
│  File:                              │   │  File:                              │
│  runtime/learning/PatternLibrary.js │   │  services/patterns/pattern-library.js│
└─────────────────────────────────────┘   └─────────────────────────────────────┘
```

### Pattern lifecycle

A pattern passes through four stages from first observation to becoming a catalog template:

```
 ┌───────────┐     ┌────────────┐     ┌───────────┐     ┌───────────┐
 │ OBSERVED  │────>│ CANDIDATE  │────>│ PROMOTED  │────>│ TEMPLATE  │
 │           │     │            │     │           │     │           │
 │ count: 1  │     │ count >= 3 │     │ count >= 5│     │ CatalogEntry│
 │ rate: ?   │     │ rate > 0.5 │     │ rate > 0.8│     │ type:template│
 └───────────┘     └────────────┘     └───────────┘     └───────────┘
      │                  │                  │                  │
      │  First           │  Repeated        │  Stable          │  Registered
      │  execution       │  confirmation    │  pattern         │  in catalog
```

### Promotion criteria

| Transition             | Condition                                          | Automatic |
|------------------------|----------------------------------------------------|-----------|
| OBSERVED → CANDIDATE   | `observationCount >= 3`                            | Yes       |
| CANDIDATE → PROMOTED   | `observationCount >= 5` AND `successRate > 0.8`    | Yes       |
| PROMOTED → TEMPLATE    | Administrator or agent decision                    | No        |

### Promotion thresholds

```javascript
const PROMOTION_THRESHOLDS = {
  CANDIDATE: {
    minObservations: 3,     // Minimum observations for candidate
    minSuccessRate: 0.5,    // Minimum success rate
  },
  PROMOTED: {
    minObservations: 5,     // Threshold for promotion
    minSuccessRate: 0.8,    // 80%+ successful executions
  },
};
```

### recordExecution() -- recording execution results

Every graph execution is recorded in PatternLibrary for learning:

```javascript
/**
 * Records a graph execution result for pattern learning.
 *
 * @param {Object} executionResult - RuntimeEngine result
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

  // Find or create pattern
  let pattern = this._hashIndex.get(hash);

  if (!pattern) {
    // New pattern -- OBSERVED
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

  // Update statistics
  pattern.observations++;
  if (success) pattern.successes++;
  else pattern.failures++;
  pattern.successRate = pattern.successes / pattern.observations;
  pattern.lastSeenAt = new Date().toISOString();

  // Check promotion
  this._checkPromotion(pattern);

  // Update category cache
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

### _checkPromotion() -- automatic promotion

```javascript
/**
 * Checks whether a pattern is ready for promotion to the next stage.
 *
 * @param {Object} pattern - Pattern object
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

### registerEntityPattern() -- registering an extraction pattern

The Extraction PatternLibrary uses a different API for registering patterns:

```javascript
/**
 * Registers an entity extraction pattern.
 *
 * @param {Object} config - Pattern configuration
 * @param {string} config.id - Unique pattern ID
 * @param {string} config.name - Pattern name
 * @param {string} config.domain - Domain (sql, javascript, etc.)
 * @param {RegExp[]} config.patterns - Array of regular expressions
 * @param {string} config.entityType - Type of entity to extract
 * @param {number} config.confidence - Base confidence (0.0-1.0)
 * @returns {EntityPattern} Registered pattern
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

### Promoting a PROMOTED pattern to a CatalogEntry TEMPLATE

When a pattern reaches the PROMOTED stage, it can be registered in the catalog as a template:

```javascript
/**
 * Converts a promoted pattern into a catalog template.
 *
 * @param {Object} pattern - Pattern with stage PROMOTED
 * @returns {Promise<{ entryId, name }>}
 */
async promoteToTemplate(pattern) {
  if (pattern.stage !== 'PROMOTED') {
    throw new Error('Only PROMOTED patterns can become templates');
  }

  // Create CatalogEntry of type 'template'
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

  // Update pattern stage
  pattern.stage = 'TEMPLATE';
  pattern.catalogEntryId = entry.entryId;

  console.log(`[PatternPromotion] Pattern ${pattern.hash} promoted to TEMPLATE: ${entry.entryId}`);

  return { entryId: entry.entryId, name: entry.name };
}
```

### Cypher: query patterns by stage

```cypher
// Find all promoted patterns ready for templating
MATCH (p:ExecutionPattern)
WHERE p.stage = 'PROMOTED'
  AND p.observations >= 5
  AND p.successRate > 0.8
RETURN p.hash, p.category, p.observations, p.successRate, p.createdAt
ORDER BY p.successRate DESC, p.observations DESC
```

---

## Error codes

| Code        | Name                      | Description                                                  | HTTP | Action                                |
|-------------|---------------------------|--------------------------------------------------------------|------|----------------------------------------|
| `CATALOG001`| Entry not found           | CatalogEntry with the given entryId not found in the catalog | 404  | Check entryId, soft delete possible   |
| `CATALOG002`| Duplicate entryId         | CatalogEntry with this entryId already exists                | 409  | Use existing or generate new UUID      |
| `CATALOG003`| Invalid type enum         | Specified type is not in CATALOG_TYPES                       | 400  | Use: business, technical, meta, template, composite |
| `CATALOG004`| Version conflict          | Concurrent update: currentVersion has changed                | 409  | Re-read CatalogEntry and retry operation |
| `CATALOG005`| Dedup collision           | Graph with identical contentHash already exists in catalog   | 409  | Return existing entryId or createVersion |
| `CATALOG006`| Reuse strategy mismatch   | Reuse strategy does not match the actual action              | 422  | Warning, does not block the operation  |

### Error response format

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

> **CODEX-CATALOG v0.1.0** | Part VI **UN ProjectAdvisor Codex** | GXE Catalog Standard

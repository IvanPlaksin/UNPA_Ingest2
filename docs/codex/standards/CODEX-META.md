# CODEX-META: Metadata Standard

> **Status:** 🟡 In Development | **Version:** 0.1.0 | **Date:** 2026-03-12

---

## 1. Preamble

Metadata defines trust. A node without provenance is a rumor.

Every fact in the UN ProjectAdvisor knowledge graph must carry answers to three questions:
- **Who** created it? (agent, pipeline, user)
- **When** was it created and when is it valid? (bi-temporal model)
- **How much** can it be trusted? (confidence, hash chain)

This standard is based on:
- **W3C PROV-O** -- provenance ontology (Entity, Activity, Agent)
- **PAV** (Provenance, Authoring and Versioning) -- Dublin Core extension for scientific data
- **Bi-temporal data model** -- separation of Transaction Time and Valid Time

Without metadata, the knowledge graph is a dump of strings. With metadata, it is an auditable registry of facts.

---

## 2.1. Required fields -- minimum contract

Not all nodes carry the same responsibility. We define three levels of metadata:

```
┌─────────────────────────────────────────┐
│              LEVEL 3: VERSION           │
│  versionId, entityId, sequenceNumber,   │
│  status, ttStart/ttEnd, vtStart/vtEnd,  │
│  contentHash, chainHash                 │
│  ┌─────────────────────────────────┐    │
│  │          LEVEL 2: PROVENANCE    │    │
│  │  sourceType, sourceId,          │    │
│  │  sourceSystem,                  │    │
│  │  extractionCycleId, confidence  │    │
│  │  ┌─────────────────────────┐    │    │
│  │  │   LEVEL 1: MANDATORY    │    │    │
│  │  │  id, createdAt,         │    │    │
│  │  │  namespace              │    │    │
│  │  └─────────────────────────┘    │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

### Level 1 -- MANDATORY (all nodes)

Absolute minimum. Every node in the graph must have these fields.

| Field       | Type     | Description                            | Example                               |
|-------------|----------|----------------------------------------|---------------------------------------|
| `id`        | `string` | Globally unique identifier             | `"proc-sp_GetUsers-v3"`               |
| `createdAt` | `string` | ISO 8601 creation timestamp            | `"2026-03-12T14:30:00.000Z"`          |
| `namespace` | `string` | Namespace (data isolation)             | `"un-pa"`, `"client-acme"`            |

### Level 2 -- PROVENANCE (extracted data)

Required for any data obtained from external sources (SQL, files, APIs).

| Field               | Type     | Description                                     | Example                               |
|---------------------|----------|-------------------------------------------------|---------------------------------------|
| `sourceType`        | `string` | Data source type                                | `"mssql"`, `"file"`, `"api"`, `"user"` |
| `sourceId`          | `string` | Identifier of the specific source               | `"server01.db.dbo.sp_GetUsers"`       |
| `sourceSystem`      | `string` | Source system name                              | `"ERP-SAP"`, `"HR-Portal"`           |
| `extractionCycleId` | `string` | UUID of the extraction cycle (see section 2.6)  | `"cycle-a1b2c3d4-..."`               |
| `confidence`        | `number` | Confidence level for the fact (0.0 -- 1.0)      | `0.85`                                |

### Level 3 -- VERSION (versioned nodes)

Required for nodes that evolve over time.

| Field            | Type     | Description                                  | Example                               |
|------------------|----------|----------------------------------------------|---------------------------------------|
| `versionId`      | `string` | UUID of the specific version                 | `"ver-f7e8d9c0-..."`                  |
| `entityId`       | `string` | UUID of the logical entity (shared across versions) | `"ent-a1b2c3d4-..."`           |
| `sequenceNumber` | `number` | Sequential version number (1, 2, 3...)       | `3`                                   |
| `status`         | `string` | Version status                               | `"ACTIVE"`, `"SUPERSEDED"`, `"DRAFT"` |
| `ttStart`        | `string` | Transaction Time -- start                    | `"2026-03-12T14:30:00.000Z"`          |
| `ttEnd`          | `string` | Transaction Time -- end (null = current)     | `null`                                |
| `vtStart`        | `string` | Valid Time -- start                          | `"2026-01-01T00:00:00.000Z"`          |
| `vtEnd`          | `string` | Valid Time -- end (null = indefinite)        | `null`                                |
| `contentHash`    | `string` | SHA-256 of canonicalized content             | `"sha256:a1b2c3..."`                  |
| `chainHash`      | `string` | SHA-256 of (contentHash + previousHash)      | `"sha256:d4e5f6..."`                  |

### Level applicability matrix

| Entity type         | Level 1 | Level 2 | Level 3 | Rationale                                |
|----------------------|---------|---------|---------|------------------------------------------|
| Domain nodes         | Yes     | Yes     | --      | Extracted from sources but not individually versioned |
| NodeVersion          | Yes     | Yes     | Yes     | Full evolution history with audit        |
| CatalogEntry         | Yes     | --      | --      | Registry record, provenance at linked versions level |
| ExecutionRecord      | Yes     | --      | --      | Execution log, immutable by nature       |
| Relationship (edge)  | Yes     | Yes     | --      | Extracted relationships require provenance |
| Settings             | Yes     | --      | --      | Configuration, not extracted data        |

### Level determination code

```javascript
/**
 * Determines the required metadata level for a node.
 *
 * @param {string} label - Node label (Domain, NodeVersion, CatalogEntry, etc.)
 * @param {object} properties - Node properties
 * @returns {{ level: number, missing: string[] }} Required level and list of missing fields
 */
function determineRequiredLevel(label, properties) {
  const L1_FIELDS = ['id', 'createdAt', 'namespace'];
  const L2_FIELDS = ['sourceType', 'sourceId', 'sourceSystem', 'extractionCycleId', 'confidence'];
  const L3_FIELDS = [
    'versionId', 'entityId', 'sequenceNumber', 'status',
    'ttStart', 'contentHash', 'chainHash'
  ];

  // Determine required level by label
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

  // Collect required fields for the given level
  let requiredFields = [...L1_FIELDS];
  if (requiredLevel >= 2) requiredFields.push(...L2_FIELDS);
  if (requiredLevel >= 3) requiredFields.push(...L3_FIELDS);

  // Find missing fields
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

## 2.2. Knowledge Quantum -- full schema

A Knowledge Quantum is the atomic unit of knowledge in the graph. Each quantum contains 8 metadata blocks, from mandatory to optional.

### Block 1: Core Identity

```typescript
interface CoreIdentity {
  /** Globally unique identifier of the knowledge quantum */
  quantumId: string;          // "kq-<uuid>"

  /** Content fingerprint (SHA-256 of canonicalized data) */
  fingerprint: string;        // "sha256:a1b2c3d4..."

  /** Version number (integer, monotonically increasing) */
  version: number;            // 1, 2, 3...

  /** Current state of the quantum */
  state: 'DRAFT' | 'ACTIVE' | 'SUPERSEDED' | 'ARCHIVED' | 'DELETED';

  /** Tags for arbitrary classification */
  tags: string[];             // ["critical", "needs-review", "auto-extracted"]
}
```

### Block 2: Provenance

```typescript
interface Provenance {
  /** Source type */
  sourceType: 'mssql' | 'postgresql' | 'file' | 'api' | 'user' | 'llm' | 'gnn';

  /** Source system (human-readable name) */
  sourceSystem: string;       // "ERP-SAP", "HR-Portal", "Git-Monorepo"

  /** Object identifier in the source */
  sourceId: string;           // "dbo.sp_GetUsers", "file://docs/arch.md"

  /** Extraction cycle */
  extraction: {
    cycleId: string;          // "cycle-<uuid>"
    cycleNumber: number;      // Sequential cycle number (1, 2, 3...)
    previousCycleId: string | null; // Reference to previous cycle
    startedAt: string;        // ISO 8601
    completedAt: string;      // ISO 8601
    pipelineVersion: string;  // "sql-extraction-v2.1"
  };

  /** Extraction quality metrics */
  quality: {
    confidence: number;       // 0.0 -- 1.0
    method: string;           // "ast-parse", "regex", "llm-extract", "gnn-predict"
    validatedBy: string | null; // "human", "cross-reference", null
    validatedAt: string | null;
  };
}
```

### Block 3: Classification

```typescript
interface Classification {
  /** Primary entity type */
  primaryType: string;        // "Procedure", "Table", "BusinessRule", "Concept"

  /** Organizational affiliation */
  org: {
    department: string;       // "IT", "Finance", "HR"
    team: string;             // "Backend", "Data-Engineering"
    project: string;          // "UN-PA", "ACME-Migration"
  };

  /** Knowledge domain */
  domain: {
    area: string;             // "database", "business-logic", "infrastructure"
    subArea: string;          // "stored-procedures", "etl", "networking"
  };

  /** Technology stack */
  tech: {
    language: string;         // "T-SQL", "JavaScript", "Python"
    framework: string | null; // "Express", "React", null
    platform: string;         // "SQL Server 2019", "Node.js 20"
  };

  /** Volatility -- how often data changes */
  volatility: 'STATIC' | 'SLOW' | 'MODERATE' | 'FAST' | 'REALTIME';
}
```

### Block 4: Semantic Context

```typescript
interface SemanticContext {
  /** Human-readable title */
  title: string;              // "User retrieval procedure"

  /** Brief description (1-3 sentences) */
  summary: string;            // "Retrieves active users filtered by department..."

  /** Keywords for search */
  keywords: string[];         // ["users", "authentication", "department-filter"]

  /** Named entities extracted by NER */
  entities: {
    name: string;             // "sp_GetUsers"
    type: string;             // "PROCEDURE", "TABLE", "COLUMN"
    span: [number, number];   // Position in the source text [start, end]
  }[];

  /** Vector representation (embedding) */
  embedding: {
    model: string;            // "bge-m3", "text-embedding-3-small"
    dimensions: number;       // 1024, 384
    vector: number[];         // Float32 array
    computedAt: string;       // ISO 8601
  } | null;
}
```

### Block 5: Relationships

```typescript
interface Relationships {
  /** Explicit relationships (extracted from source) */
  explicit: {
    type: string;             // "CALLS", "REFERENCES", "OPERATES_ON"
    targetId: string;         // Target node ID
    confidence: number;       // 0.0 -- 1.0
    sourceEvidence: string;   // "EXEC dbo.sp_Helper" (code fragment)
  }[];

  /** Predicted relationships (GNN link prediction) */
  inferred: {
    type: string;             // "LIKELY_CALLS", "SIMILAR_TO"
    targetId: string;
    score: number;            // Model probability
    model: string;            // "gnn-link-pred-v1.2"
    predictedAt: string;      // ISO 8601
  }[];

  /** Cluster membership */
  clusters: {
    algorithm: string;        // "label-propagation", "louvain"
    clusterId: string;        // "cluster-17"
    membershipScore: number;  // 0.0 -- 1.0
  }[];

  /** Node graph metrics */
  graphMetrics: {
    degree: number;           // Number of relationships
    inDegree: number;         // Incoming
    outDegree: number;        // Outgoing
    pageRank: number;         // PageRank score
    betweenness: number;      // Betweenness centrality
    computedAt: string;       // ISO 8601
  } | null;
}
```

### Block 6: Evolution History

```typescript
interface EvolutionHistory {
  /** History of extraction cycles that touched this quantum */
  cycles: {
    cycleId: string;
    cycleNumber: number;
    action: 'CREATED' | 'UPDATED' | 'CONFIRMED' | 'DEPRECATED';
    changedFields: string[];  // ["summary", "confidence"]
    timestamp: string;
  }[];

  /** Version chain */
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

### Block 7: Quality Metrics

```typescript
interface QualityMetrics {
  /** Schema validation result */
  schemaValidation: {
    valid: boolean;
    errors: string[];         // ["missing field: sourceId", "invalid confidence: -0.5"]
    checkedAt: string;
  };

  /** Usage count (queries, traversals, citations) */
  usageCount: {
    queries: number;          // How many times queried
    traversals: number;       // How many times part of a path
    citations: number;        // How many times referenced
    lastAccessedAt: string;
  };

  /** Quality tier (automatically computed) */
  qualityTier: 'GOLD' | 'SILVER' | 'BRONZE' | 'UNVERIFIED';
}
```

`qualityTier` determination rules:

| Tier       | Conditions                                                                                    |
|------------|-----------------------------------------------------------------------------------------------|
| `GOLD`     | `confidence >= 0.9` AND `validatedBy !== null` AND `schemaValidation.valid === true`          |
| `SILVER`   | `confidence >= 0.7` AND `schemaValidation.valid === true`                                     |
| `BRONZE`   | `confidence >= 0.5` AND all required Level 1 fields are populated                             |
| `UNVERIFIED` | Everything else                                                                             |

### Block 8: Access Control

```typescript
interface AccessControl {
  /** Security classification level */
  securityLevel: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';

  /** Owner team */
  ownerTeam: string;          // "data-engineering", "security"

  /** Roles with read access */
  allowedRoles: string[];     // ["admin", "analyst", "developer"]
}
```

---

## 2.3. Provenance -- W3C PROV-O Mapping

### PROV-O concepts vs PA concepts

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

### Mapping table

| PROV-O Concept           | PA Implementation          | Memgraph Label/Relationship  | Description                                   |
|--------------------------|----------------------------|------------------------------|-----------------------------------------------|
| `prov:Entity`            | Knowledge Node             | `(:Domain)`, `(:Procedure)`  | Extracted fact (knowledge node)               |
| `prov:Activity`          | Extraction Cycle           | `(:ExtractionCycle)`         | One extraction pipeline pass                  |
| `prov:Agent`             | Pipeline / User            | `(:Pipeline)`, `(:User)`     | Who performed the extraction                  |
| `prov:wasGeneratedBy`    | EXTRACTED_BY               | `-[:EXTRACTED_BY]->`         | Node created within a cycle                   |
| `prov:wasDerivedFrom`    | DERIVED_FROM               | `-[:DERIVED_FROM]->`         | Node extracted from a source                  |
| `prov:wasAssociatedWith` | EXECUTED_BY                | `-[:EXECUTED_BY]->`          | Cycle executed by an agent/pipeline           |
| `prov:wasAttributedTo`   | ATTRIBUTED_TO              | `-[:ATTRIBUTED_TO]->`        | Fact attributed to a specific agent           |
| `prov:used`              | USED_SOURCE                | `-[:USED_SOURCE]->`          | Cycle used a data source                      |
| `prov:wasInformedBy`     | INFORMED_BY                | `-[:INFORMED_BY]->`          | Cycle used results of another cycle           |
| `prov:generatedAtTime`   | `createdAt`                | Node property                | Creation time (ISO 8601)                      |
| `prov:invalidatedAtTime` | `ttEnd`                    | Node property                | Version invalidation time                     |

### How to populate provenance fields

| Field               | Source of value                                  | Example                                      |
|---------------------|--------------------------------------------------|----------------------------------------------|
| `sourceType`        | Type of connector that performed the extraction  | `"mssql"` for SQL Server                     |
| `sourceId`          | Full path to the object in the source            | `"server01.MyDB.dbo.sp_GetUsers"`            |
| `sourceSystem`      | Name assigned by the administrator during setup  | `"ERP-Production"`                           |
| `extractionCycleId` | UUID generated at pipeline start                 | `"cycle-550e8400-e29b-41d4-a716-446655440000"` |
| `confidence`        | Determined by extraction method (see below)      | `0.85`                                       |

### Confidence determination rules by source type

| Source type      | Method               | Base confidence | Rationale                                        |
|------------------|----------------------|-----------------|--------------------------------------------------|
| **AST**          | AST parsing          | **1.0**         | Syntax tree -- deterministic parsing             |
| **Regex**        | Regular expressions  | **0.9**         | Covers most patterns but not all                 |
| **User**         | Manual input         | **0.8**         | Human may err but is generally accurate          |
| **LLM**          | Language model       | **0.7**         | High quality but hallucinations possible         |
| **GNN**          | Graph neural network | **0.6**         | Prediction based on graph structure              |
| **Heuristic**    | Heuristic rules      | **0.5**         | Simple rules, high false positive rate           |

> **Important:** Base confidence can be adjusted by validation. For example, LLM extraction confirmed by cross-reference receives `confidence = 0.7 + 0.2 = 0.9`.

---

## 2.4. Hash chain -- cryptographic integrity

Each node version contains a cryptographic hash chain ensuring the immutability of history.

### Three hash types

| Hash           | Formula                                        | Purpose                                             |
|----------------|------------------------------------------------|-----------------------------------------------------|
| `contentHash`  | `SHA-256(canonicalize(content))`               | Content fingerprint of the current version          |
| `previousHash` | `chainHash` of the previous version            | Reference to the predecessor (like in blockchain)   |
| `chainHash`    | `SHA-256(contentHash + ":" + previousHash)`    | Chain hash linking versions together                |

```
  Version 1 (GENESIS)         Version 2                   Version 3
  ┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
  │ contentHash: H1  │        │ contentHash: H2  │        │ contentHash: H3  │
  │ previousHash: ∅  │───────>│ previousHash: C1 │───────>│ previousHash: C2 │
  │ chainHash: C1    │        │ chainHash: C2    │        │ chainHash: C3    │
  │ C1=SHA(H1+":"+∅) │        │ C2=SHA(H2+":"+C1)│        │ C3=SHA(H3+":"+C2)│
  └──────────────────┘        └──────────────────┘        └──────────────────┘
```

### Canonicalization algorithm

Before computing `contentHash`, the node content is brought to canonical form:

```javascript
const crypto = require('crypto');

/**
 * Canonicalizes an object for contentHash computation.
 *
 * Steps:
 * 1. Remove service fields (id, createdAt, ttStart, ttEnd, contentHash, chainHash, etc.)
 * 2. Sort keys recursively
 * 3. Serialize to JSON (no spaces)
 *
 * @param {object} properties - Node properties
 * @returns {string} Canonical JSON string
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
 * Computes contentHash for node properties.
 */
function computeContentHash(properties) {
  const canonical = canonicalize(properties);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hash}`;
}

/**
 * Computes chainHash for the current version.
 *
 * @param {string} contentHash - Content hash of the current version
 * @param {string|null} previousChainHash - chainHash of the previous version (null for GENESIS)
 * @returns {string} chainHash
 */
function computeChainHash(contentHash, previousChainHash) {
  const prev = previousChainHash ?? 'GENESIS';
  const input = `${contentHash}:${prev}`;
  const hash = crypto.createHash('sha256').update(input, 'utf8').digest('hex');
  return `sha256:${hash}`;
}
```

### Chain validation

```javascript
/**
 * Validates the integrity of a version chain.
 *
 * @param {Array} versions - Array of versions sorted by sequenceNumber
 * @returns {{ valid: boolean, brokenAt: number|null, error: string|null }}
 */
function validateChain(versions) {
  if (versions.length === 0) {
    return { valid: true, brokenAt: null, error: null };
  }

  // Check GENESIS version
  const genesis = versions[0];
  const expectedGenesisChain = computeChainHash(genesis.contentHash, null);
  if (genesis.chainHash !== expectedGenesisChain) {
    return {
      valid: false,
      brokenAt: genesis.sequenceNumber,
      error: `GENESIS chainHash mismatch: expected ${expectedGenesisChain}, got ${genesis.chainHash}`,
    };
  }

  // Check each subsequent version
  for (let i = 1; i < versions.length; i++) {
    const current = versions[i];
    const previous = versions[i - 1];

    // previousHash of current version must match chainHash of previous version
    if (current.previousHash !== previous.chainHash) {
      return {
        valid: false,
        brokenAt: current.sequenceNumber,
        error: `Version ${current.sequenceNumber}: previousHash (${current.previousHash}) !== previous chainHash (${previous.chainHash})`,
      };
    }

    // chainHash of current version must be correct
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

### GENESIS pattern -- first version

The first version of an entity (sequenceNumber = 1) uses a special pattern:

```javascript
// Creating a GENESIS version
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
  previousHash: null,                                        // <-- null for GENESIS
  chainHash: computeChainHash(computeContentHash(properties), null), // <-- "GENESIS" as previousHash
};
```

During validation: if `previousHash === null` and `sequenceNumber === 1`, this is a valid GENESIS version.

---

## 2.5. Bi-temporal model -- two-dimensional time

Every versioned entity (Level 3) exists in two temporal dimensions:

```
                    Valid Time (vt) -- "When was the fact actually valid?"
                    ────────────────────────────────────────────────>

 Transaction Time   │
 (tt) -- "When      │   ┌─────────────────────┐
  did we learn       │   │  V1: sp_GetUsers     │
  about this fact?"  │   │  vt: [Jan, Mar)      │ ← "Procedure was current Jan-Mar"
                     │   │  tt: [Feb, ∞)        │ ← "We learned about this in Feb"
                     │   └─────────────────────┘
                     │
                     │   ┌─────────────────────┐
                     │   │  V2: sp_GetUsers_v2  │
                     │   │  vt: [Mar, ∞)        │ ← "New version from Mar"
                     │   │  tt: [Mar, ∞)        │ ← "We learned about this in Mar"
                     │   └─────────────────────┘
                     │
                     │   ┌─────────────────────┐
                     │   │  V1-fix: sp_GetUsers │
                     │   │  vt: [Jan, Feb)      │ ← "Turns out V1 was only valid until Feb"
                     │   │  tt: [Apr, ∞)        │ ← "We realized this only in Apr (retrospective)"
                     │   └─────────────────────┘
                     ▼
```

### Cypher query examples

**Current state** -- what is current right now:

```cypher
// All active versions at the current moment
MATCH (v:NodeVersion)
WHERE v.status = 'ACTIVE'
  AND v.ttEnd IS NULL
  AND v.vtEnd IS NULL
RETURN v
ORDER BY v.entityId, v.sequenceNumber DESC
```

**As-of query (Transaction Time)** -- what we knew on a specific date:

```cypher
// State of the knowledge graph as we knew it on 2026-02-15
MATCH (v:NodeVersion)
WHERE v.ttStart <= '2026-02-15T00:00:00.000Z'
  AND (v.ttEnd IS NULL OR v.ttEnd > '2026-02-15T00:00:00.000Z')
RETURN v
```

**Valid-at query (Valid Time)** -- what was actually true in a specific period:

```cypher
// Which procedures actually existed in January 2026
MATCH (v:NodeVersion)-[:VERSION_OF]->(e:Procedure)
WHERE v.vtStart <= '2026-01-31T23:59:59.999Z'
  AND (v.vtEnd IS NULL OR v.vtEnd > '2026-01-01T00:00:00.000Z')
RETURN e.name, v.sequenceNumber, v.vtStart, v.vtEnd
```

**Bi-temporal query** -- what we knew about a specific period on a specific date:

```cypher
// What we knew on 2026-03-01 about the system state in January 2026
MATCH (v:NodeVersion)
WHERE v.ttStart <= '2026-03-01T00:00:00.000Z'
  AND (v.ttEnd IS NULL OR v.ttEnd > '2026-03-01T00:00:00.000Z')
  AND v.vtStart <= '2026-01-31T23:59:59.999Z'
  AND (v.vtEnd IS NULL OR v.vtEnd > '2026-01-01T00:00:00.000Z')
RETURN v
```

### Time management rules

| Aspect                       | Transaction Time (tt)                   | Valid Time (vt)                          |
|------------------------------|-----------------------------------------|------------------------------------------|
| **Who sets it**              | System automatically                    | Extraction pipeline or user              |
| **Can it be changed?**       | No -- immutable                         | Yes -- for retrospective corrections     |
| **When is ttEnd/vtEnd set?** | When a new version is created (SUPERSEDED) | When the fact is found to be no longer valid |
| **Null value**               | Current (not yet replaced)              | Indefinitely valid                       |
| **Format**                   | ISO 8601 with timezone (UTC)            | ISO 8601 with timezone (UTC)             |
| **Granularity**              | Milliseconds                            | Milliseconds                             |

**Invariants:**

1. `ttStart` is always set when the version is created and **never changes**.
2. `ttEnd` is set **only** when a new version appears (`SUPERSEDED`).
3. `vtStart` is set on creation, can be corrected **retrospectively**.
4. `vtEnd` can be `null` (indefinite) or set when obsolescence is detected.
5. For any entity, **exactly one** version has `ttEnd = null` and `status = 'ACTIVE'`.

---

## 2.6. extractionCycleId -- rules

### What is an extraction cycle

An Extraction Cycle is one complete pass of the pipeline over a data source. One cycle can create or update dozens/hundreds of nodes in the knowledge graph.

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
│  Result: 47 nodes created, 12 updated, 3 deleted                │
└──────────────────────────────────────────────────────────────────┘
```

### Generating extractionCycleId

`extractionCycleId` is generated **once** at pipeline start and passed to all subsequent steps:

```javascript
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a new extraction cycle.
 * Called ONCE at pipeline start.
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

### Using extractionCycleId

| Scenario               | How it is used                                                                  | Example                                                   |
|------------------------|---------------------------------------------------------------------------------|------------------------------------------------------------|
| **Bulk rollback**      | Delete all nodes created in one cycle                                           | `MATCH (n {extractionCycleId: $cycleId}) DETACH DELETE n`  |
| **Pipeline debugging** | Find all facts extracted in a specific run                                      | `MATCH (n {extractionCycleId: $cycleId}) RETURN n`         |
| **Metrics**            | Count nodes created/updated/deleted per cycle                                   | Aggregate by `extractionCycleId`                           |
| **Incrementality**     | Determine which nodes were not touched by the last cycle (potentially deleted)  | `WHERE n.extractionCycleId <> $currentCycleId`             |
| **Audit**              | Answer "who and when created this fact"                                         | Join with `(:ExtractionCycle)` node                        |

### Relationship with the spiral extraction model

The PA pipeline operates on a spiral model: each cycle refines previous results.

```
  Cycle 1 ──> Cycle 2 ──> Cycle 3 ──> Cycle 4
  (rough)     (refined)   (enriched)  (validated)

  confidence:  0.5-0.7     0.7-0.8      0.8-0.9        0.9-1.0
  method:      regex       AST+regex    +LLM enrich    +GNN predict
```

Each cycle:
1. Receives `previousCycleId` -- reference to the previous run
2. Generates its own `cycleId` -- a new UUID
3. Increments `cycleNumber` by 1
4. For each existing node compares `contentHash`:
   - Hash matches → `CONFIRMED` (don't create new version, update `extractionCycleId`)
   - Hash changed → `UPDATED` (create new version, mark old as `SUPERSEDED`)
   - Node not found in source → `DEPRECATED` (set `vtEnd`)
   - New node → `CREATED` (create GENESIS version)

```javascript
/**
 * Determines the action for a node during incremental update.
 */
function determineAction(existingNode, newContentHash) {
  if (!existingNode) {
    return 'CREATED';   // New node, did not exist before
  }
  if (existingNode.contentHash === newContentHash) {
    return 'CONFIRMED'; // Content unchanged
  }
  return 'UPDATED';     // Content changed, new version needed
}

// Nodes existing in the graph but not found in the current cycle:
// → action: 'DEPRECATED' (set vtEnd = now)
```

---

> **CODEX-META v0.1.0** | Part **UN ProjectAdvisor Codex** | Metadata Standard for the Knowledge Graph

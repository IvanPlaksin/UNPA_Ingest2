# Knowledge Triangle

## Concept

The Knowledge Triangle is the core epistemic structure of UN ProjectAdvisor. It connects
three types of knowledge about any UN process or activity:

```
┌─────────────────────────────────┐
│   L0-L2  Normative Document     │  (UN Charter, ST/SGB, ST/AI)
│   "What the rules say"          │
└──────────────┬──────────────────┘
               │  GOVERNS
               ▼
┌─────────────────────────────────┐        ┌──────────────────────┐
│          Process /              │◄───────│  L3  Operational     │
│          KnowledgeNode          │  OPER- │  Document (SOP)      │
│          "The activity"         │  ATION-│  "How it's done"     │
└──────────────┬──────────────────┘  ALIZ. └──────────────────────┘
               │
               │  REVEALS_GAP_IN
               ▼
┌─────────────────────────────────┐        ┌──────────────────────┐
│          Gap Node               │◄───────│  L4  Empirical       │
│          "The compliance gap"   │        │  Report (OIOS, JIU)  │
└─────────────────────────────────┘        │  "What's happening"  │
                                           └──────────────────────┘
```

A **complete** triangle has all three vertices present for a given process.
An **incomplete** triangle signals a policy, implementation, or audit gap.

---

## Three Edge Types

### GOVERNS

| Property | Value |
|----------|-------|
| Source constraint | L0, L1, or L2 (normative) |
| Target | KnowledgeNode, Process, Entity, Activity |
| Role | `NORMATIVE_LINK` |
| Inverse | `GOVERNED_BY` |
| Creates Gap node | No |

**Semantics:** A normative document establishes binding rules for a process or entity.
The GOVERNS edge is the foundation of the triangle — without it, the process has no
formal policy basis.

**Properties on edge:**
- `effectiveFrom` — date the policy took effect
- `effectiveTo` — null if still in force
- `mandatoryLevel` — `MUST | SHOULD | MAY`

**Example:**
```cypher
(sgb:KnowledgeNode {documentType: 'ST_SGB', epistemicLayer: 'L1'})
  -[:GOVERNS {mandatoryLevel: 'MUST'}]->
(proc:KnowledgeNode {content: 'vendor justification required'})
```

---

### OPERATIONALIZES

| Property | Value |
|----------|-------|
| Source constraint | L3 only (operational) |
| Target | KnowledgeNode, Process, Entity, Activity |
| Role | `IMPLEMENTATION_LINK` |
| Inverse | `OPERATIONALIZED_BY` |
| Creates Gap node | No |

**Semantics:** An operational document describes how a normative requirement is
actually carried out. The presence of this edge shows that policy has been translated
into practice. Its absence signals an **implementation gap**.

**Properties on edge:**
- `implementationStatus` — `FULL | PARTIAL | PLANNED`
- `deviations` — null if no deviations, or description

**Example:**
```cypher
(sop:KnowledgeNode {documentType: 'SOP', epistemicLayer: 'L3'})
  -[:OPERATIONALIZES {implementationStatus: 'FULL'}]->
(proc:KnowledgeNode)
```

---

### REVEALS_GAP_IN

| Property | Value |
|----------|-------|
| Source constraint | L4 only (empirical) |
| Target | Gap node (auto-created) |
| Role | `GAP_LINK` |
| Inverse | `HAS_GAP_REVEALED_BY` |
| Creates Gap node | **Yes** (automatically) |

**Semantics:** An empirical finding (audit report) identifies a compliance or
implementation gap. The edge always creates a **Gap node** — it never modifies
normative content (see KM-015).

**Properties on edge:**
- `gapType` — `COMPLIANCE | IMPLEMENTATION | DOCUMENTATION | RESOURCE`
- `severity` — `HIGH | MEDIUM | LOW`
- `auditReference` — reference to the audit finding

**Example:**
```cypher
(oios:KnowledgeNode {documentType: 'OIOS_REP', epistemicLayer: 'L4'})
  -[:REVEALS_GAP_IN {gapType: 'COMPLIANCE', severity: 'HIGH'}]->
(gap:Gap {status: 'OPEN', title: 'Vendor justification missing in 30% of contracts'})
  -[:AFFECTS]->
(proc:KnowledgeNode)
```

---

## Gap Node Model

Gap nodes are **permanent audit trail records** (see KM-014 — never delete, only close).

### Properties

| Property | Type | Values |
|----------|------|--------|
| `id` | UUID | auto-generated |
| `gapType` | enum | `COMPLIANCE \| IMPLEMENTATION \| DOCUMENTATION \| RESOURCE` |
| `severity` | enum | `HIGH \| MEDIUM \| LOW` |
| `status` | enum | `OPEN \| ACKNOWLEDGED \| ADDRESSED \| CLOSED` |
| `title` | string | short description |
| `description` | string | full narrative |
| `identifiedBy` | id | L4 KnowledgeNode id |
| `identifiedAt` | ISO date | when the finding was recorded |
| `affectedProcess` | id | target process KnowledgeNode id |
| `recommendation` | string | corrective action recommended |
| `resolution` | string\|null | null until CLOSED |
| `resolvedAt` | ISO date\|null | null until CLOSED |

### Lifecycle

```
OPEN → ACKNOWLEDGED → ADDRESSED → CLOSED
```

- **OPEN**: Gap created from audit finding, no management response yet
- **ACKNOWLEDGED**: Management has formally recognized the finding
- **ADDRESSED**: Corrective action taken, pending verification
- **CLOSED**: Verified resolved; `resolution` text recorded

### Relationships

```cypher
(L4:KnowledgeNode)-[:REVEALS_GAP_IN]->(gap:Gap)
(gap:Gap)-[:AFFECTS]->(process:KnowledgeNode)
(gap:Gap)-[:CONCERNS_COMPLIANCE_WITH]->(normative:KnowledgeNode)   // optional
(gap:Gap)-[:RESOLVED_BY]->(action:KnowledgeNode)                   // optional
```

---

## Triangle Completeness Score

```
score = (vertices present) / 3
```

| Score | Meaning |
|-------|---------|
| 1.0 | Complete triangle: normative + operational + empirical all present |
| 0.67 | Two of three vertices — one gap dimension unobserved |
| 0.33 | Only one vertex — process is either undocumented or unaudited |
| 0.0 | No triangle at all |

Critical processes MUST have score = 1.0 (see KM-013).

---

## Layer Constraint Rules

| Edge | Source MUST be | Source CANNOT be | Reason |
|------|---------------|-----------------|--------|
| GOVERNS | L0, L1, L2 | L4 | Empirical evidence reveals gaps, does not govern |
| OPERATIONALIZES | L3 | L0, L1, L2 | Normative docs govern, not operationalize |
| REVEALS_GAP_IN | L4 | any other | Only empirical findings create gaps |

Violations throw a descriptive `Layer constraint violation` error.

---

## Service API

```javascript
const { knowledgeTriangleService } = require('./knowledge/knowledge-triangle.service');

// Validation (synchronous)
svc.validateEdgeLayerConstraint('GOVERNS', 'L1')           // true
svc.validateEdgeLayerConstraint('GOVERNS', 'L4')           // throws!

// Edge creation
await svc.createGovernsEdge(normativeNodeId, processId, { mandatoryLevel: 'MUST' })
await svc.createOperationalizesEdge(opNodeId, processId,  { implementationStatus: 'PARTIAL' })
await svc.createRevealsGapEdge(empiricalNodeId, processId, {
  gapType: 'COMPLIANCE', severity: 'HIGH',
  title: 'Vendor justification missing',
  recommendation: 'Add vendor justification form to SOP'
})
// → { edgeType: 'REVEALS_GAP_IN', gapId: 'uuid', sourceId, targetId }

// Gap management
await svc.getGap(gapId)
await svc.getOpenGaps(processId?)                                    // optional filter
await svc.updateGapStatus(gapId, 'ACKNOWLEDGED')
await svc.updateGapStatus(gapId, 'CLOSED', 'Resolution description')

// Triangle queries
await svc.getTriangleForProcess(processId)
// → { processId, normative: [...], operational: [...], empirical: [...], gaps: [...] }

await svc.getTriangleCompleteness(processId)
// → { processId, hasNormative, hasOperational, hasEmpirical, score: 0-1, openGaps: N }

await svc.findIncompleteTriangles()
// → [{ id, content, layer, hasNormative, hasOperational }, ...]

// Metadata
await svc.getEdgeTypeMetadata()               // all 3 edge type config nodes
await svc.getEdgeTypeMetadata('GOVERNS')      // one edge type
```

---

## Codex Rules

| Rule | Title |
|------|-------|
| `CODEX-RULE-KM-013` | Knowledge Triangle Completeness Required for Critical Processes |
| `CODEX-RULE-KM-014` | Gap Nodes Cannot Be Deleted, Only Closed |
| `CODEX-RULE-KM-015` | REVEALS_GAP_IN Does Not Overwrite Normative Content |

(See also: KM-010, KM-011, KM-012 in `UN_DOCUMENT_CLASSIFICATION.md`)

---

## Cypher Query Examples

```cypher
-- All processes missing normative coverage
MATCH (proc:KnowledgeNode)
WHERE NOT (proc)<-[:GOVERNS]-(:KnowledgeNode)
RETURN proc.id, proc.content, proc.epistemicLayer

-- Full triangle for a process
MATCH (proc:KnowledgeNode {id: 'some-id'})
OPTIONAL MATCH (norm:KnowledgeNode)-[:GOVERNS]->(proc)
OPTIONAL MATCH (op:KnowledgeNode)-[:OPERATIONALIZES]->(proc)
OPTIONAL MATCH (emp:KnowledgeNode)-[:REVEALS_GAP_IN]->(gap:Gap)-[:AFFECTS]->(proc)
RETURN proc, norm, op, emp, gap

-- Open gaps by severity
MATCH (gap:Gap {status: 'OPEN'})
RETURN gap.gapType, gap.severity, gap.title
ORDER BY gap.severity

-- Gap lifecycle history: all CLOSED gaps with resolution
MATCH (emp:KnowledgeNode)-[:REVEALS_GAP_IN]->(gap:Gap {status: 'CLOSED'})
RETURN gap.title, gap.resolution, gap.resolvedAt, emp.documentType

-- Unimplemented policies: L1/L2 with no L3 OPERATIONALIZES
MATCH (policy:KnowledgeNode)
WHERE policy.epistemicLayer IN ['L1', 'L2']
AND NOT (policy)<-[:OPERATIONALIZES]-(:KnowledgeNode {epistemicLayer: 'L3'})
RETURN policy.id, policy.content, policy.documentType
```

---

## Seeding

```bash
# 1. Seed document types (DocumentType nodes + ClassifierRule nodes)
node api/scripts/seed-un-document-types.js

# 2. Seed epistemic layers (EpistemicLayer nodes + BELONGS_TO_LAYER links)
node api/scripts/seed-epistemic-layers.js

# 3. Seed Knowledge Triangle edge type metadata
node api/scripts/seed-knowledge-triangle-edges.js

# 4. Seed Codex rules
node api/scripts/seed-codex-un-extraction-rules.js
```

---

## Tests

```bash
node api/tests/unit/knowledge-triangle.test.js
```

29 tests across 6 suites:
1. Constants and edge type metadata (4 tests)
2. Layer constraint validation (7 tests)
3. Edge creation (6 tests)
4. Gap lifecycle (6 tests)
5. Triangle queries (3 tests)
6. Edge type metadata queries (3 tests)

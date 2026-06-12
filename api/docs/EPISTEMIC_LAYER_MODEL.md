# Epistemic Layer Model (L0–L5)

## Overview

The UN Knowledge Triangle is structured around six epistemic layers that define
the **normative authority** of every knowledge claim extracted from UN documents.

```
L0 Constitutional ─────┐
L1 Regulatory    ─────┼──► NORMATIVE_SOURCE  → GOVERNS edges
L2 Administrative ─────┘
                               ▼ (policy governs process)
L3 Operational ────────────► OPERATIONAL_BRIDGE → OPERATIONALIZES edges
                               ▼ (process generates evidence)
L4 Empirical   ────────────► EMPIRICAL_EVIDENCE → REVEALS_GAP_IN edges

L5 Strategic   ────────────► STRATEGIC_GUIDANCE → INFORMS edges
```

L4 (empirical) **never overrides** normative claims. When an audit finding
contradicts a policy requirement, the result is a `REVEALS_GAP_IN` edge — not
a rewrite of the policy.

---

## Layer Definitions

| Layer | Name | Role | normativeWeight | Edge Produced |
|-------|------|------|----------------|--------------|
| L0 | Constitutional | NORMATIVE_SOURCE | 0.95–1.0 | GOVERNS |
| L1 | Regulatory | NORMATIVE_SOURCE | 0.80–0.90 | GOVERNS |
| L2 | Administrative | NORMATIVE_SOURCE | 0.50–0.75 | GOVERNS |
| L3 | Operational | OPERATIONAL_BRIDGE | 0.35–0.45 | OPERATIONALIZES |
| L4 | Empirical | EMPIRICAL_EVIDENCE | 0.00 | REVEALS_GAP_IN |
| L5 | Strategic | STRATEGIC_GUIDANCE | 0.20–0.30 | INFORMS |

---

## Knowledge Triangle Semantics

### NORMATIVE_SOURCE (L0–L2)
- Produce `GOVERNS` edges to operational processes and knowledge nodes
- Higher layer always takes precedence: L0 > L1 > L2
- Example: `ST/SGB [L1] -[:GOVERNS]-> (procurement process) [L3]`

### OPERATIONAL_BRIDGE (L3)
- Documents describe how policy is actually carried out
- Produce `OPERATIONALIZES` edges pointing back to governing policy
- Gap = policy exists but no `OPERATIONALIZES` edge found
- Example: `(SOP) [L3] -[:OPERATIONALIZES]-> (ST/AI clause) [L2]`

### EMPIRICAL_EVIDENCE (L4)
- Audit findings record observable reality (what IS happening)
- Zero normative weight — they cannot mandate anything
- Produce `REVEALS_GAP_IN` edges to the L1/L2 requirement being violated
- Example: `(OIOS finding) [L4] -[:REVEALS_GAP_IN]-> (ST/SGB policy) [L1]`

### STRATEGIC_GUIDANCE (L5)
- Secretary-General reports and ICT strategies propose future direction
- Lower authority than L1/L2 current policy
- Produce `INFORMS` edges to affected policy nodes
- Example: `(ICT Strategy) [L5] -[:INFORMS]-> (existing IT policy) [L2]`

---

## Precedence Rules

When two claims conflict, the higher-authority layer wins:

```
L0 > L1 > L2 > L3 > L5
L4 never wins — creates gap edge instead
```

**Conflict resolution matrix:**

| Source | Target | Resolution |
|--------|--------|-----------|
| L0 vs L1 | L0 wins | L0 is constitutional |
| L1 vs L2 | L1 wins | L2 implements L1 |
| L4 vs L1 | L1 wins | L4 creates REVEALS_GAP_IN |
| L5 vs L2 | L2 wins | L5 proposes, L2 mandates |

---

## Memgraph Schema

```
(EpistemicLayer)
  id: 'L0'|'L1'|'L2'|'L3'|'L4'|'L5'
  name: string
  description: string
  knowledgeTriangleRole: 'NORMATIVE_SOURCE'|'OPERATIONAL_BRIDGE'|'EMPIRICAL_EVIDENCE'|'STRATEGIC_GUIDANCE'
  precedenceOrder: 0-5
  normativeWeightMin: float
  normativeWeightMax: float
  edgeTypesProduced: JSON string array

(DocumentType)-[:BELONGS_TO_LAYER]->(EpistemicLayer)
```

---

## Service API

```javascript
const { epistemicLayerService } = require('./knowledge/epistemic-layer.service');

// Precedence
svc.getLayerPrecedence('L0', 'L1')  // -1 (L0 wins)
svc.resolveConflict('L4', 'L1')     // 'L1'
svc.isNormative('L2')               // true
svc.getEdgeTypeForLayer('L4')       // 'REVEALS_GAP_IN'

// Memgraph queries
await svc.getLayers()                       // all 6, ordered by precedence
await svc.getDocumentTypesByLayer('L4')     // OIOS_REP, JIU_REP, BOA_REP
await svc.getNormativeSources()             // all L0-L2 document types
await svc.getLayerSummary()                 // layer + docTypeCount per layer
await svc.findUnimplementedPolicies()       // L1/L2 nodes with no OPERATIONALIZES in
await svc.findUnlinkedFindings()            // L4 nodes with no REVEALS_GAP_IN out
```

---

## Cypher Query Examples

```cypher
-- All normative document types
MATCH (dt:DocumentType)-[:BELONGS_TO_LAYER]->(l:EpistemicLayer)
WHERE l.knowledgeTriangleRole = 'NORMATIVE_SOURCE'
RETURN dt.id, dt.name, dt.normativeWeight ORDER BY dt.normativeWeight DESC

-- Knowledge Triangle gap: L1/L2 policy with no L3 operationalization
MATCH (policy:KnowledgeNode)
WHERE policy.epistemicLayer IN ['L1', 'L2']
AND NOT (policy)<-[:OPERATIONALIZES]-(:KnowledgeNode {epistemicLayer: 'L3'})
RETURN policy.id, policy.content

-- All REVEALS_GAP_IN findings
MATCH (finding:KnowledgeNode)-[r:REVEALS_GAP_IN]->(policy:KnowledgeNode)
RETURN finding.content, policy.content, policy.epistemicLayer

-- Layer distribution
MATCH (l:EpistemicLayer)
OPTIONAL MATCH (dt:DocumentType)-[:BELONGS_TO_LAYER]->(l)
RETURN l.id, l.name, count(dt) as types ORDER BY l.precedenceOrder
```

---

## Seeding

```bash
# 1. Seed document types first (creates DocumentType nodes with epistemicLayer property)
node api/scripts/seed-un-document-types.js

# 2. Seed epistemic layer model (creates EpistemicLayer nodes + BELONGS_TO_LAYER links)
node api/scripts/seed-epistemic-layers.js
```

---

## Tests

```bash
node api/tests/unit/epistemic-layer.test.js
```

18 tests across 4 suites:
1. EpistemicLayer nodes (5 tests) — existence, ordering, roles, edge types
2. DocumentType → Layer relationships (4 tests) — layer queries, normative sources, summary
3. Precedence logic (6 tests) — getLayerPrecedence, resolveConflict, isNormative
4. Edge type mapping (3 tests) — getEdgeTypeForLayer, LAYER_ORDER, LAYER_ROLES

---

## Codex Rules

| Rule | Title |
|------|-------|
| `CODEX-RULE-KM-010` | Document Classification Required Before Knowledge Extraction |
| `CODEX-RULE-KM-011` | Epistemic Layer Determines Normative Weight in Knowledge Triangle |
| `CODEX-RULE-KM-012` | Layer Precedence Governs Conflict Resolution in Knowledge Triangle |

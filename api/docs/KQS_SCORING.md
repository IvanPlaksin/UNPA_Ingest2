# Knowledge Quality Score (KQS)

## Formula

```
KQS = 0.35 × NormativeWeight
    + 0.30 × EmpiricalCertainty
    + 0.20 × TemporalCurrency
    + 0.15 × SourceAuthority
```

KQS ∈ [0.0, 1.0]. Higher score = higher quality, authority, and recency.

---

## Component Definitions

### NormativeWeight (35%)

Measures the epistemic authority of the source layer.

| Layer | Document Type | Weight |
|-------|--------------|--------|
| L0 | UN Charter, GA Resolution | 1.00 |
| L1 | ST/SGB (Secretary-General's Bulletin) | 0.85 |
| L2 | ST/AI (Administrative Instruction), ST/IC | 0.63 |
| L3 | SOP, Manual | 0.40 |
| L4 | OIOS/JIU/BOA report (empirical) | 0.00 |
| L5 | SG Report, ICT Strategy | 0.25 |

**Source:** `KnowledgeNode.normativeWeight` property (set from `DocumentType.normativeWeight` at extraction).
If property not set, falls back to layer default.

**Impact:** L4 nodes always contribute 0 to this component. L0 nodes contribute 0.35 (full weight).

---

### EmpiricalCertainty (30%)

Measures how well the knowledge is supported by empirical evidence in the Knowledge Triangle.

**Algorithm:**
1. Check if process node has any L4 `REVEALS_GAP_IN` edges → empirical vertex present
2. If no L4 evidence: `EmpiricalCertainty = 0.0`
3. If L4 evidence exists: start at 1.0, subtract gap severity penalties:
   - HIGH gap open: -0.30
   - MEDIUM gap open: -0.15
   - LOW gap open: -0.05
4. `EmpiricalCertainty = max(0, 1.0 - totalPenalty)`

**Examples:**
- Process with L4 validation, no open gaps → 1.0
- Process with L4 validation, one HIGH gap → 0.70
- Process with no L4 validation → 0.0

**Source:** `KnowledgeTriangleService.getTriangleForProcess()` + `getOpenGaps()`

---

### TemporalCurrency (20%)

Measures how recent the knowledge is relative to the document type's expected volatility.

**Algorithm:** Exponential decay applied to each layer's characteristic rate:

```
TemporalCurrency = exp(-λ × days_since_update)
```

| Layer | Decay Rate | λ | Half-life |
|-------|-----------|---|-----------|
| L0 | STABLE | 0 | Never |
| L1 | SLOW | 0.000274 | ~2,530 days (7 years) |
| L2 | MEDIUM | 0.000952 | ~728 days (2 years) |
| L3 | MEDIUM | 0.000952 | ~728 days (2 years) |
| L4 | FAST | 0.008447 | ~82 days (3 months) |
| L5 | SLOW | 0.000274 | ~2,530 days (7 years) |

**Rationale:**
- Constitutional documents (L0) don't decay — the UN Charter is valid indefinitely
- Audit findings (L4) decay fast — OIOS findings from 2018 may describe a resolved situation
- SOPs (L3) decay at medium rate — procedures are updated every 1-2 years

**Source:** `KnowledgeNode.updatedAt` or `createdAt`, reuses `computeEffectiveWeight()` from
`confidence-decay.service.js`.

---

### SourceAuthority (15%)

Measures the reliability of the information source using Admiralty Code conventions.

**Source:** `KnowledgeNode.admiralty_weight` property if set (populated by `admiralty.service.js`).
If not set, falls back to layer-based default:

| Layer | Default Admiralty equivalent | Value |
|-------|------------------------------|-------|
| L0 | A1 (Completely reliable, Confirmed) | 1.000 |
| L1 | A2 (Completely reliable, Probably true) | 0.894 |
| L2 | B2 (Usually reliable, Probably true) | 0.800 |
| L3 | B3 (Usually reliable, Possibly true) | 0.693 |
| L4 | A2 (audited reports = reliable source) | 0.894 |
| L5 | B3 (Usually reliable, Possibly true) | 0.693 |

**Note:** L4 has high SourceAuthority because OIOS/JIU/BOA are independent audit bodies
(reliable sources), but zero NormativeWeight because empirical findings are not prescriptive.

---

## Example KQS Calculations

### L1 Policy Node (ST/SGB, fresh, complete triangle)
```
NormativeWeight    = 0.35 × 0.85 = 0.298
EmpiricalCertainty = 0.30 × 0.80 = 0.240  (one MEDIUM gap)
TemporalCurrency   = 0.20 × 0.97 = 0.194  (recently updated)
SourceAuthority    = 0.15 × 0.89 = 0.134
─────────────────────────────────────────
KQS = 0.866
```

### L4 Audit Finding (OIOS, 180 days old)
```
NormativeWeight    = 0.35 × 0.00 = 0.000  (empirical, no normative weight)
EmpiricalCertainty = 0.30 × 0.00 = 0.000  (no L4 validation of itself)
TemporalCurrency   = 0.20 × 0.22 = 0.044  (FAST decay, 180 days → e^(-1.52))
SourceAuthority    = 0.15 × 0.89 = 0.134  (audited = reliable)
─────────────────────────────────────────
KQS = 0.178  → below threshold → review queue
```

### L3 SOP (2 years old, no empirical validation)
```
NormativeWeight    = 0.35 × 0.40 = 0.140
EmpiricalCertainty = 0.30 × 0.00 = 0.000  (no L4 assessment)
TemporalCurrency   = 0.20 × 0.40 = 0.080  (MEDIUM decay, 730 days → e^(-0.69))
SourceAuthority    = 0.15 × 0.69 = 0.104
─────────────────────────────────────────
KQS = 0.324  → above threshold but low
```

---

## Quality Gate Threshold

| KQS | Interpretation | Action |
|-----|---------------|--------|
| ≥ 0.70 | High quality | Use directly in RAG |
| 0.50–0.69 | Moderate quality | Use with confidence annotation |
| 0.30–0.49 | Low quality | Use with explicit caveats |
| < 0.30 | Very low | **Human review required** (KM-017) |

---

## Service API

```javascript
const { kqsService, KQS_WEIGHTS } = require('./knowledge/kqs.service');

// Component calculators (synchronous)
svc.calculateNormativeWeight(entity)            // entity: { epistemicLayer, normativeWeight? }
svc.calculateTemporalCurrency(entity, layer)    // entity: { updatedAt? }
svc.calculateSourceAuthority(entity, layer)     // entity: { admiralty_weight? }

// EmpiricalCertainty (async, queries triangle)
await svc.calculateEmpiricalCertainty(processId)

// Main KQS (async)
await svc.calculateKQS(entity, { processId })
// Returns: { entityId, kqs, components, weights, layer, calculatedAt }

// By Memgraph ID (also persists kqs_score on node)
await svc.calculateKQSById(nodeId, { persist: true })

// Batch (parallel, handles failures gracefully)
await svc.calculateKQSBatch([...nodeIds], { persist: true })

// Rankings and quality gate
await svc.getRankedNodes({ layer, namespace, minKQS, limit })
await svc.findLowKQSNodes({ layer, namespace, threshold: 0.30, limit })
```

---

## REST API

```
GET  /api/v1/kqs/node/:nodeId              — KQS for single node
GET  /api/v1/kqs/process/:processId        — KQS with triangle context
POST /api/v1/kqs/batch                     — body: { nodeIds: [...] }
GET  /api/v1/kqs/rankings?layer=L1&minKQS=0.5
GET  /api/v1/kqs/low?threshold=0.3
GET  /api/v1/kqs/weights                   — formula weights (info)
```

**Response format:**
```json
{
  "success": true,
  "data": {
    "entityId": "...",
    "kqs": 0.742,
    "components": {
      "normativeWeight":    { "value": 0.85, "weighted": 0.298 },
      "empiricalCertainty": { "value": 0.80, "weighted": 0.240 },
      "temporalCurrency":   { "value": 0.97, "weighted": 0.194 },
      "sourceAuthority":    { "value": 0.89, "weighted": 0.134 }
    },
    "layer": "L1",
    "calculatedAt": "2026-05-18T..."
  }
}
```

---

## Codex Rules

| Rule | Title |
|------|-------|
| `CODEX-RULE-KM-016` | KQS Must Be Calculated for All Extracted Knowledge |
| `CODEX-RULE-KM-017` | KQS Below Threshold Requires Human Review |

---

## Integration Notes

### At Extraction Time
After creating a `KnowledgeNode`, immediately call:
```javascript
await kqsService.calculateKQSById(nodeId);
// → sets node.kqs_score + node.kqs_calculated_at
```

### In RAG Retrieval
Weight search results by KQS:
```cypher
MATCH (n:KnowledgeNode)
WHERE n.kqs_score >= 0.30                -- quality gate
ORDER BY n.kqs_score DESC LIMIT 20       -- quality-ranked
```

### Reuse with Existing Services
- **TemporalCurrency** reuses `computeEffectiveWeight()` from `tier1/confidence-decay.service.js`
- **SourceAuthority** reads `admiralty_weight` set by `tier1/admiralty.service.js`
- **EmpiricalCertainty** queries via `knowledge-triangle.service.js`

---

## Tests

```bash
node api/tests/unit/kqs.test.js
```

28 tests across 7 suites:
1. KQS constants (4 tests)
2. NormativeWeight component (4 tests)
3. TemporalCurrency component (5 tests)
4. SourceAuthority component (3 tests)
5. EmpiricalCertainty component (2 tests)
6. KQS formula (5 tests)
7. Integration tests — Memgraph (5 tests)

---

## Seeding

```bash
# Seed Codex rules KM-016 and KM-017
node api/scripts/seed-codex-un-extraction-rules.js
```

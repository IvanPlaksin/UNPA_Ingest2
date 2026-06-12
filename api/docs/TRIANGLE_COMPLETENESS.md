# Triangle Completeness & Gap Detection

## Overview

Triangle Completeness measures how completely a Process node is covered by the Knowledge Triangle's three vertices. It combines structural coverage (which vertices are present) with quality adjustment (gap severity penalties) to produce a single `completeness` score between 0 and 1.

---

## Completeness Formula

```
score       = (hasNormative + hasOperational + hasEmpirical) / 3
gapPenalty  = 0.15 × openHigh + 0.10 × openMedium + 0.05 × openLow
completeness = max(0, score - gapPenalty)
```

| Score | Meaning |
|-------|---------|
| 1.0   | All three vertices present |
| 0.667 | Two vertices present |
| 0.333 | One vertex present |
| 0.0   | No vertices |

Gap penalties reduce completeness below the raw score. A fully-covered process with two open HIGH gaps has completeness `1.0 - 0.30 = 0.70`.

---

## Completeness Object

`getTriangleCompleteness(processId)` returns:

```js
{
  processId:    'proc-001',
  completeness: 0.95,          // score minus gap penalty
  score:        1.0,           // raw structural score
  vertices: {
    normative:   { present: true,  count: 2 },
    operational: { present: true,  count: 1 },
    empirical:   { present: true,  count: 1 }
  },
  gaps: {
    count:   1,
    openHigh: 0, openMedium: 0, openLow: 1,
    penalty: 0.05
  },
  missingVertices: [],         // ['NORMATIVE','OPERATIONAL','EMPIRICAL'] subset
  // backward-compat
  hasNormative:   true,
  hasOperational: true,
  hasEmpirical:   true,
  openGaps:       1,
  calculatedAt:   '2026-05-18T...'
}
```

---

## Gap Detection

`GapDetectionService` performs automated detection across all processes in Memgraph.

### Detection Methods

| Method | What it finds |
|--------|---------------|
| `findProcessesWithoutNormative({namespace, limit})` | Processes with no incoming GOVERNS edge |
| `findProcessesWithoutOperational({namespace, limit})` | Processes with no incoming OPERATIONALIZES edge |
| `findProcessesWithoutEmpirical({namespace, layer, limit})` | Processes with no incoming AFFECTS from a Gap node |
| `findStaleGaps({daysOld, severity, limit})` | OPEN/ACKNOWLEDGED gaps older than N days |
| `findGapsRequiringReview({daysOld, limit})` | Gaps beyond management review threshold (default 180 days) |

### Thresholds

```js
STALE_GAP_DAYS_DEFAULT  = 90   // escalation threshold
REVIEW_GAP_DAYS_DEFAULT = 180  // management review threshold
```

### Full Detection Report

```js
const report = await gapDetectionService.runGapDetection({
  namespace:          'PROCUREMENT',
  staleThresholdDays: 90,
  persist:            true   // saves GapDetectionReport node to Memgraph
});
// report.processesWithoutNormative.count
// report.processesWithoutOperational.count
// report.processesWithoutEmpirical.count
// report.staleGaps.count
// report.statistics.openSummary.{total, high, medium, low}
```

---

## Namespace Completeness

```js
const result = await gapDetectionService.getNamespaceCompleteness({
  namespace:   'FINANCE',
  sampleLimit: 100
});
// result.processCount
// result.avgCompleteness    (0–1)
// result.distribution.{ full, partial, minimal, none }
```

Distribution buckets:

| Bucket | Completeness range |
|--------|--------------------|
| full   | >= 0.9 |
| partial | >= 0.5 |
| minimal | > 0.0 |
| none   | = 0.0 |

---

## Codex Rules

| Rule | Requirement |
|------|-------------|
| KM-013 | Triangle completeness required for critical processes |
| KM-014 | Gap nodes cannot be deleted, only closed |
| KM-018 | Critical processes: completeness >= 0.8 |
| KM-019 | Stale gaps: 90 days → escalate, 180 days → management review |
| KM-020 | Namespace avg completeness must be >= 0.7 |

---

## REST API

### Triangle Completeness

```
GET  /api/v1/triangle/process/:processId/completeness
GET  /api/v1/triangle/incomplete
```

### Gap Queries

```
GET  /api/v1/triangle/gaps?status=OPEN&severity=HIGH&processId=...
GET  /api/v1/triangle/gaps/statistics
GET  /api/v1/triangle/gaps/stale?days=90&severity=HIGH&limit=50
GET  /api/v1/triangle/gaps/review?days=180&limit=50
POST /api/v1/triangle/gaps/detect
     body: { namespace, staleThresholdDays, reviewThresholdDays, persist }
PATCH /api/v1/triangle/gaps/:gapId/status
     body: { status, resolution }
```

### Namespace

```
GET  /api/v1/triangle/namespace/completeness?namespace=KM&sampleLimit=100
```

---

## AOPEG Integration

Add `knowledge.triangle_enrich` executor after any extraction step that creates a KnowledgeNode:

```json
{
  "id": "enrich-triangle",
  "type": "knowledge.triangle_enrich",
  "parameters": {
    "nodeId":     "{{extractedNodeId}}",
    "processId":  "{{processId}}",
    "detectGaps": true
  }
}
```

The executor:
1. Calculates KQS score (`kqsService.calculateKQSById`)
2. Gets triangle completeness and stores `triangle_completeness` on the process node
3. Runs stale gap check and returns count

---

## Memgraph Patterns

### Query completeness for a process
```cypher
MATCH (norm:KnowledgeNode)-[:GOVERNS]->(proc:KnowledgeNode {id: $id})
RETURN count(norm) as normativeCount
```

### Find processes missing operational coverage
```cypher
MATCH (proc:KnowledgeNode)
OPTIONAL MATCH (op:KnowledgeNode)-[:OPERATIONALIZES]->(proc)
WITH proc, collect(op) AS ops
WHERE size(ops) = 0 AND proc.namespace = $ns
RETURN proc.id as id, proc.epistemicLayer as epistemicLayer
LIMIT 100
```

### Open gaps for a process
```cypher
MATCH (gap:Gap)-[:AFFECTS]->(proc:KnowledgeNode {id: $id})
WHERE gap.status IN ['OPEN', 'ACKNOWLEDGED']
RETURN gap.id as id, gap.severity as severity, gap.gapType as gapType
```

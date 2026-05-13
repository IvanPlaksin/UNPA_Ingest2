# CODEX-EVOLUTION: Self-Evolving System

**Status:** 🟡 Draft
**Version:** 0.1.0
**Last updated:** 2026-03-12

---

## Preamble

The UN ProjectAdvisor system is designed not as a static tool, but as a **self-evolving organism**. The knowledge graph is a living structure that continuously grows, refines itself, corrects its mistakes, and learns from its own experience.

This standard defines:

1. **Cascading AI agent architecture** — how multiple agents coordinate their work
2. **Consensus mechanisms** — how agents make collective decisions
3. **Autonomous optimization** — how the system improves itself without human intervention
4. **Contradiction detection and resolution** — how conflicts are turned into knowledge
5. **Self-documentation** — how the system describes its own evolution
6. **Autonomy levels** — the boundaries of independence at each maturity stage

---

## 8.1 Cascading AI Agent Architecture (Agent Cascade)

### Three-tier hierarchy

The agent system is organized into three levels, each with its own zone of responsibility and level of authority.

```
                        ┌──────────────────────────┐
                        │      ORCHESTRATOR        │
                        │      (Meta-agent)        │
                        │                          │
                        │  - Distributes tasks     │
                        │  - Resolves conflicts    │
                        │  - Manages autonomy      │
                        │  - trustScore ≥ 0.95     │
                        └────────────┬─────────────┘
                                     │
               ┌─────────────────────┼─────────────────────┐
               │                     │                     │
    ┌──────────▼──────────┐ ┌────────▼────────┐ ┌─────────▼─────────┐
    │   SPECIALIZED       │ │  SPECIALIZED    │ │   SPECIALIZED     │
    │   AGENTS            │ │  AGENTS         │ │   AGENTS          │
    │                     │ │                 │ │                   │
    │  Extractor          │ │  Validator      │ │  Enricher         │
    │  Resolver           │ │  Optimizer      │ │  (+ future)       │
    │                     │ │                 │ │                   │
    │  trustScore ≥ 0.8   │ │  trustScore ≥   │ │  trustScore ≥ 0.8 │
    │                     │ │  0.85           │ │                   │
    └──────────┬──────────┘ └────────┬────────┘ └─────────┬─────────┘
               │                     │                     │
        ┌──────┴──────┐       ┌──────┴──────┐       ┌─────┴───────┐
        │   Worker    │       │   Worker    │       │   Worker    │
        │   Agents    │       │   Agents    │       │   Agents    │
        │             │       │             │       │             │
        │  Atomic     │       │  Field      │       │  Vectorization│
        │  extractions│       │  checking   │       │  Links       │
        │             │       │  hashes     │       │  Contexts    │
        │  trustScore │       │  schemas    │       │              │
        │  ≥ 0.6      │       │             │       │  trustScore  │
        └─────────────┘       └─────────────┘       │  ≥ 0.6      │
                                                    └─────────────┘
                        ┌──────────────────────────┐
            ◄───────────│     FEEDBACK LOOPS       │───────────►
                        │                          │
                        │  QUALITY_ISSUE ─────►    │
                        │  ◄───── REVIEWED_BY      │
                        │  DELEGATED_TO ─────►     │
                        └──────────────────────────┘
```

### Agent specializations

| Agent | Specialization | Typical operations | Required trustScore |
|-------|---------------|-------------------|---------------------|
| **Extractor** | Extracting facts from sources | SQL parsing, code analysis, NLP extraction | ≥ 0.8 |
| **Validator** | Quality and consistency verification | Schema validation, hash checking, CODEX-VALID | ≥ 0.85 |
| **Enricher** | Enrichment with links and context | Creating edges, adding provenance, classification | ≥ 0.8 |
| **Resolver** | Conflict and duplicate resolution | Entity resolution, merge, deduplication | ≥ 0.85 |
| **Optimizer** | Structure and performance optimization | Index reorganization, chain compression, archiving | ≥ 0.8 |

### Agent registration and discovery

Each agent is registered in the knowledge graph as a node of type `:Agent` in the `META` namespace:

```javascript
// Register an agent in the Knowledge Graph
const agentNode = {
  id: crypto.randomUUID(),
  label: 'Agent',
  namespace: 'META',
  properties: {
    agentId:          'agent-extractor-sql-001',
    specialization:   'Extractor',
    domain:           'SQL',
    trustScore:       0.85,
    autonomyLevel:    1,            // Level 0-4 (see Section 8.6)
    status:           'ACTIVE',     // ACTIVE | SUSPENDED | RETIRED
    registeredAt:     new Date().toISOString(),
    lastHeartbeat:    new Date().toISOString(),
    executionHistory: {
      totalExecutions:   0,
      successCount:      0,
      failureCount:      0,
      avgDurationMs:     0,
      lastExecutionAt:   null
    },
    capabilities: [
      'sql-schema-extraction',
      'stored-procedure-analysis',
      'table-relationship-inference'
    ]
  }
};
```

### Discovery protocol

Agents discover each other through Cypher queries to the META namespace:

```cypher
// Find all active agents with the required specialization
MATCH (a:Agent {namespace: 'META', status: 'ACTIVE'})
WHERE a.specialization = 'Validator'
  AND a.trustScore >= 0.85
RETURN a.agentId, a.trustScore, a.capabilities
ORDER BY a.trustScore DESC
```

### Inter-agent communication

Agents interact through Knowledge Graph edges. This guarantees complete traceability of all decisions.

```
┌─────────────┐   DELEGATED_TO    ┌─────────────┐
│ Orchestrator│──────────────────►│  Extractor   │
│             │                   │              │
│             │   REVIEWED_BY     │              │
│             │◄──────────────────│              │
└─────────────┘                   └──────┬───────┘
                                         │
                                  QUALITY_ISSUE
                                         │
                                  ┌──────▼───────┐
                                  │   Validator   │
                                  │              │
                                  └──────────────┘
```

**Communication edge types:**

```cypher
// DELEGATED_TO — task delegation from a higher-level agent
CREATE (orchestrator)-[:DELEGATED_TO {
  taskId:      $taskId,
  priority:    'HIGH',
  deadline:    datetime('2026-03-12T18:00:00Z'),
  context:     $contextJson,
  delegatedAt: datetime()
}]->(extractor)

// REVIEWED_BY — result of a lower-level agent's review
CREATE (result)-[:REVIEWED_BY {
  reviewerId:  $validatorAgentId,
  verdict:     'APPROVED',          // APPROVED | REJECTED | NEEDS_REVISION
  confidence:  0.92,
  comments:    'Schema validated against CODEX-META',
  reviewedAt:  datetime()
}]->(validator)

// QUALITY_ISSUE — discovery of a problem in another agent's data
CREATE (node)-[:QUALITY_ISSUE {
  issueId:     $issueId,
  reporterId:  $reporterAgentId,
  severity:    'WARNING',           // INFO | WARNING | ERROR | CRITICAL
  issueType:   'MISSING_PROVENANCE',
  description: 'Node lacks sourceType and sourceId fields',
  reportedAt:  datetime(),
  resolved:    false
}]->(reporter)
```

### Data inviolability rule

> **An agent that discovers a problem in another agent's data MUST record this as a `QUALITY_ISSUE` edge with a description of the problem, not silently fix it.** Silent correction breaks the provenance chain and makes analysis of systemic errors impossible.

---

## 8.2 Quality consensus: agent voting

### Three levels of consensus

Consensus mechanisms are defined in the [Manifesto for AI Agents](../manifesto/AI_MANIFESTO.md) and are implemented through a voting protocol.

```
┌────────────────────────────────────────────────────────────────────┐
│                       CONSENSUS LEVELS                             │
├────────────────┬──────────────────┬────────────────────────────────┤
│   MAJORITY     │    WEIGHTED      │        UNANIMOUS               │
│   (> 50%)      │  (weighted)      │        (100%)                  │
├────────────────┼──────────────────┼────────────────────────────────┤
│ Entity         │ SQL schema →     │ DELETE entity                  │
│ resolution     │ business rules   │ MERGE entities                 │
│                │                  │                                │
│ Confidence     │ Ontology         │ Namespace change               │
│ update         │ classification   │                                │
│                │                  │ God Mode operations            │
│ Pattern        │ Cross-domain     │                                │
│ promotion      │ linking          │ Autonomy level upgrade         │
│                │                  │                                │
│ Routine        │ Domain expertise │ Schema migration               │
│ enrichment     │ required         │                                │
├────────────────┼──────────────────┼────────────────────────────────┤
│ Threshold: >50%│ Threshold: Σweight│ Threshold: 100% of participants│
│ of votes       │ × vote > 0.5     │ agree                          │
│ quorum: ≥3     │ quorum: ≥3       │ quorum: ≥3 (all with trustScore│
│ agents         │ agents           │ ≥ 0.8 in domain)               │
└────────────────┴──────────────────┴────────────────────────────────┘
```

### Voting protocol

```
┌──────────┐     Propose      ┌───────────┐     Broadcast     ┌──────────┐
│          │─────────────────►│           │────────────────────│          │
│ Initiator│                  │  Voting   │                    │ Agent N  │
│ Agent    │◄─────────────────│  Session  │◄───────────────────│          │
│          │     Result       │           │     Vote           │          │
└──────────┘                  └─────┬─────┘                    └──────────┘
                                    │
                              Timeout / Quorum
                                    │
                              ┌─────▼─────┐
                              │  Decision  │
                              │            │
                              │  APPROVED  │
                              │  REJECTED  │
                              │  ESCALATED │
                              └────────────┘
```

**Protocol implementation:**

```javascript
class VotingSession {
  constructor({ proposalId, type, quorum, timeout }) {
    this.proposalId = proposalId;
    this.type       = type;        // 'MAJORITY' | 'WEIGHTED' | 'UNANIMOUS'
    this.quorum     = quorum;      // Minimum number of voters (default: 3)
    this.timeout    = timeout;     // Milliseconds before auto-escalation
    this.votes      = new Map();   // agentId → { vote, weight, reason }
    this.status     = 'OPEN';      // OPEN | DECIDED | ESCALATED | EXPIRED
    this.round      = 1;           // Current round (max 3)
    this.createdAt  = Date.now();
  }

  /**
   * Register a vote from an agent
   * @param {string} agentId
   * @param {boolean} approve - true = FOR, false = AGAINST
   * @param {number} weight - Agent's specialization score (0..1)
   * @param {string} reason - Justification for the vote
   */
  castVote(agentId, approve, weight, reason) {
    if (this.status !== 'OPEN') {
      throw new Error(`Voting session ${this.proposalId} is ${this.status}`);
    }
    this.votes.set(agentId, { vote: approve, weight, reason, castAt: Date.now() });
    return this._evaluate();
  }

  _evaluate() {
    if (this.votes.size < this.quorum) return { status: 'PENDING' };

    switch (this.type) {
      case 'MAJORITY': {
        const forCount = [...this.votes.values()].filter(v => v.vote).length;
        const approved = forCount / this.votes.size > 0.5;
        this.status = 'DECIDED';
        return { status: 'DECIDED', approved, forCount, total: this.votes.size };
      }

      case 'WEIGHTED': {
        const weightedSum = [...this.votes.values()].reduce((sum, v) => {
          return sum + (v.vote ? v.weight : -v.weight);
        }, 0);
        const totalWeight = [...this.votes.values()].reduce((s, v) => s + v.weight, 0);
        const approved = (weightedSum / totalWeight) > 0.5;
        this.status = 'DECIDED';
        return { status: 'DECIDED', approved, weightedSum, totalWeight };
      }

      case 'UNANIMOUS': {
        const allApproved = [...this.votes.values()].every(v => v.vote);
        if (allApproved) {
          this.status = 'DECIDED';
          return { status: 'DECIDED', approved: true };
        }
        // Any rejection in UNANIMOUS → escalate or retry
        if (this.round < 3) {
          this.round++;
          this.votes.clear();
          return { status: 'RETRY', round: this.round };
        }
        this.status = 'ESCALATED';
        return { status: 'ESCALATED', reason: 'No unanimous consensus after 3 rounds' };
      }
    }
  }
}
```

### Timeout and quorum rules

| Parameter | MAJORITY | WEIGHTED | UNANIMOUS |
|-----------|----------|----------|-----------|
| Quorum | ≥ 3 agents | ≥ 3 agents | All agents with trustScore ≥ 0.8 |
| Round timeout | 30 sec | 60 sec | 120 sec |
| Max rounds | 1 | 2 | 3 |
| When quorum absent | ESCALATED | ESCALATED | ESCALATED |
| On timeout | Decision by current votes | Decision by current votes | ESCALATED |

### Conflict resolution

If consensus is not reached after the maximum number of rounds, the task is escalated up the chain:

```
Round 1 ──► No consensus ──► Round 2 ──► No consensus ──► Round 3
                                                               │
                                                         No consensus
                                                               │
                                                         ┌─────▼──────┐
                                                         │ ESCALATION │
                                                         │            │
                                                         │ Orchestrator│
                                                         │ makes      │
                                                         │ decision   │
                                                         └─────┬──────┘
                                                               │
                                               ┌───────────────┼──────────────┐
                                               │               │              │
                                       trustScore ≥ 0.95   trustScore      human
                                       → Orchestrator       < 0.95         review
                                         decides itself     → escalate      required
                                                             to human
```

All decisions (including escalated ones) are recorded in the graph as `:DECIDED_BY` edges with full justification.

---

## 8.3 Autonomous optimization (APES — Agent Performance Evolution System)

### APES architecture

APES is a closed feedback loop that combines two existing pattern libraries of the system into a single self-optimization mechanism.

```
    ┌───────────────────────────────────────────────────────────────────┐
    │                        APES FEEDBACK LOOP                        │
    │                                                                  │
    │    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
    │    │          │    │          │    │          │    │          │  │
    │    │ EXECUTE  │───►│ MEASURE  │───►│ COMPARE  │───►│ ADJUST   │  │
    │    │          │    │          │    │          │    │          │  │
    │    └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
    │         ▲                                               │        │
    │         │                                               │        │
    │         └───────────────────────────────────────────────┘        │
    │                                                                  │
    │    Components:                                                   │
    │    ┌─────────────────────────┐  ┌─────────────────────────────┐  │
    │    │ Runtime PatternLibrary  │  │ Extraction PatternLibrary   │  │
    │    │ runtime/learning/       │  │ services/patterns/          │  │
    │    │ PatternLibrary.js       │  │ pattern-library.js          │  │
    │    │                         │  │                             │  │
    │    │ - recordExecution()     │  │ - registerEntityPattern()   │  │
    │    │ - suggestBestGraph()    │  │ - registerRelationPattern() │  │
    │    │ - getStats()            │  │ - learnFromExtraction()     │  │
    │    │                         │  │ - matchPatterns()           │  │
    │    │ Metrics:                │  │                             │  │
    │    │ - successRate           │  │ Metrics:                    │  │
    │    │ - avgDurationMs         │  │ - observationCount          │  │
    │    │ - executionCount        │  │ - confidence                │  │
    │    └─────────────────────────┘  │ - domain coverage           │  │
    │                                  └─────────────────────────────┘  │
    └───────────────────────────────────────────────────────────────────┘
```

### Runtime PatternLibrary

File: `api/src/runtime/learning/PatternLibrary.js`

This library operates at the GXE Runtime level — it remembers which graphs (DAGs) were successfully executed, and automatically suggests the best graph for a new task based on category.

**Key operations:**

```javascript
const { PatternLibrary } = require('./runtime/learning/PatternLibrary');

const library = new PatternLibrary({
  maxSize: 100,
  minSuccessRate: 0.7
});

// ── EXECUTE: run the graph ───────────────────────────────────────
const result = await runtimeEngine.run(dagDefinition, inputData);

// ── MEASURE: record the result ───────────────────────────────────
await library.recordExecution({
  category:   'sql-extraction',
  graphHash:  dagDefinition.contentHash,
  success:    result.status === 'COMPLETED',
  durationMs: result.durationMs,
  dag:        dagDefinition
});

// ── COMPARE: get the best graph for the category ─────────────────
const bestPattern = await library.suggestBestGraph('sql-extraction');
// Returns: { dag, successRate, avgDurationMs, executionCount }

// ── ADJUST: if the current graph is worse than the best — replace ─
if (bestPattern && bestPattern.successRate > currentSuccessRate) {
  dagDefinition = bestPattern.dag;  // Use the better-performing graph
}
```

**Caching strategy:** LRU (Least Recently Used) with eviction when `maxSize` is exceeded. Patterns with `successRate < minSuccessRate` (default 0.7) are not cached.

### Extraction PatternLibrary

File: `api/src/services/patterns/pattern-library.js`

This library operates at the knowledge extraction level — it accumulates patterns for recognizing entities, relationships, and subgraphs in text.

**Pattern types:**

| Type | Class | Example |
|------|-------|---------|
| Entity | `EntityPattern` | `{name: "SQLTable", regex: /CREATE TABLE\s+(\w+)/}` |
| Relation | `RelationPattern` | `{type: "REFERENCES", source: "Column", target: "Table"}` |
| Subgraph | `SubgraphPattern` | `{name: "FK-chain", nodes: [...], edges: [...]}` |

**Automatic pattern promotion:**

```javascript
const patternLib = new PatternLibrary({
  enableLearning:    true,
  learningThreshold: 5   // Auto-promote after 5 successful observations
});

// Manual pattern registration
patternLib.registerEntityPattern({
  name:       'StoredProcedure',
  domain:     'SQL',
  labels:     ['Procedure', 'Code'],
  regex:      /CREATE\s+PROC(?:EDURE)?\s+\[?(\w+)\]?/gi,
  confidence: 0.9
});

// Automatic learning from extraction results
patternLib.learnFromExtraction({
  source:   'mssql-schema-scan',
  entities: extractedEntities,
  relations: extractedRelations
});
// If a pattern was observed ≥ learningThreshold (5) times
// → automatically promoted from learningBuffer to the main catalog

// Search patterns by domain
const sqlPatterns = patternLib.findByDomain('SQL');
```

### Self-tuning loop

The complete APES self-optimization cycle:

```
 Step 1: EXECUTE               Step 2: MEASURE
 ─────────────────              ─────────────────
 Execute the graph              Record metrics
 with current                   in PatternLibrary
 parameters                     (success/failure,
                                duration, outputs)
        │                              │
        │                              ▼
        │                       Step 3: COMPARE
        │                       ─────────────────
        │                       Compare current
        │                       result with the best
        │                       pattern for the category
        │                              │
        │                              ▼
        │                       Step 4: ADJUST
        │                       ─────────────────
        │                       If current is worse:
        │                       - replace graph
        │                       - update parameters
        │                       - promote pattern
        │                              │
        └──────────────────────────────┘
              (next iteration)
```

**Key APES metrics:**

| Metric | Source | Threshold |
|--------|--------|-----------|
| `successRate` | Runtime PatternLibrary | ≥ 0.7 for caching |
| `avgDurationMs` | Runtime PatternLibrary | ≥ 10% reduction = improvement |
| `observationCount` | Extraction PatternLibrary | ≥ 5 for auto-promotion |
| `confidence` | Extraction PatternLibrary | ≥ 0.4 for pattern matching |
| `domainCoverage` | Extraction PatternLibrary | Share of covered patterns in domain |

---

## 8.4 Contradiction detection and resolution

### Types of contradictions

The system distinguishes four classes of contradictions, each of which requires a separate detection and resolution strategy.

```
┌──────────────────────────────────────────────────────────────────────┐
│                      CONTRADICTION TYPES                              │
├─────────────────┬────────────────────────────────────────────────────┤
│                 │                                                    │
│   FACTUAL       │  Same contentHash, different property values       │
│                 │  Example: rowCount = 50000 vs rowCount = 52347    │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   TEMPORAL      │  Overlapping valid_time windows for the same       │
│                 │  entity                                            │
│                 │  Example: vt=[Jan-Mar] ∩ vt=[Feb-Apr] for         │
│                 │  the same fact                                     │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   STRUCTURAL    │  Conflicting directions or types of edges          │
│                 │  Example: A-[DEPENDS_ON]->B and B-[DEPENDS_ON]->A │
│                 │  (circular dependency)                             │
│                 │                                                    │
├─────────────────┼────────────────────────────────────────────────────┤
│                 │                                                    │
│   CONFIDENCE    │  Significant confidence divergence (> 0.3)         │
│                 │  for the same fact from different sources          │
│                 │  Example: conf=0.9 (LLM) vs conf=0.5 (regex)     │
│                 │                                                    │
└─────────────────┴────────────────────────────────────────────────────┘
```

### Detection mechanisms

```javascript
class ContradictionDetector {
  /**
   * Detect factual contradictions via contentHash collision
   * Same entity fingerprint but different property values
   */
  async detectFactual(newNode) {
    const existing = await memgraphService.runQuery(`
      MATCH (n {contentHash: $hash})
      WHERE n.id <> $newId
      RETURN n
    `, { hash: newNode.contentHash, newId: newNode.id });

    for (const node of existing) {
      const diffs = this._diffProperties(node, newNode);
      if (diffs.length > 0) {
        return { type: 'FACTUAL', existing: node, incoming: newNode, diffs };
      }
    }
    return null;
  }

  /**
   * Detect temporal contradictions via overlapping validity windows
   */
  async detectTemporal(newNode) {
    const overlaps = await memgraphService.runQuery(`
      MATCH (n {entityId: $entityId})
      WHERE n.id <> $newId
        AND n.vt_start <= $vtEnd
        AND (n.vt_end IS NULL OR n.vt_end >= $vtStart)
      RETURN n
    `, {
      entityId: newNode.entityId,
      newId:    newNode.id,
      vtStart:  newNode.vt_start,
      vtEnd:    newNode.vt_end || '9999-12-31'
    });

    return overlaps.length > 0
      ? { type: 'TEMPORAL', existing: overlaps, incoming: newNode }
      : null;
  }

  /**
   * Detect structural contradictions (conflicting edge directions)
   */
  async detectStructural(newEdge) {
    const reverse = await memgraphService.runQuery(`
      MATCH (a)-[r:${newEdge.type}]->(b)
      WHERE a.id = $target AND b.id = $source
      RETURN r
    `, { source: newEdge.source, target: newEdge.target });

    return reverse.length > 0
      ? { type: 'STRUCTURAL', existing: reverse[0], incoming: newEdge }
      : null;
  }

  /**
   * Detect confidence contradictions (divergence > 0.3)
   */
  async detectConfidence(newNode) {
    const similar = await memgraphService.runQuery(`
      MATCH (n {entityId: $entityId, status: 'ACTIVE'})
      WHERE n.id <> $newId
        AND abs(n.confidence - $conf) > 0.3
      RETURN n
    `, {
      entityId: newNode.entityId,
      newId:    newNode.id,
      conf:     newNode.confidence
    });

    return similar.length > 0
      ? { type: 'CONFIDENCE', existing: similar, incoming: newNode }
      : null;
  }
}
```

### Resolution strategies

| Strategy | Description | When applied |
|----------|-------------|--------------|
| **SUPERSEDE** | New fact replaces the old one (old → `SUPERSEDED`) | New fact has higher `confidence` or a more recent `vt_start` |
| **MERGE** | Facts are merged into one with combined properties | Facts complement each other (different non-conflicting fields) |
| **COEXIST** | Both facts remain active with a note | Different perspectives, both justified (different `sourceType`) |
| **ESCALATE** | Decision is passed to a higher level | Cannot be determined automatically, requires expertise |

### CONTRADICTS edge schema

```cypher
CREATE (existing)-[:CONTRADICTS {
  contradictionId:   $id,
  type:              'FACTUAL',           // FACTUAL | TEMPORAL | STRUCTURAL | CONFIDENCE
  detectedBy:        $detectorAgentId,
  detectedAt:        datetime(),
  severity:          'HIGH',              // LOW | MEDIUM | HIGH | CRITICAL
  resolution:        'PENDING',           // PENDING | SUPERSEDE | MERGE | COEXIST | ESCALATED
  resolvedBy:        null,                // agentId or 'human'
  resolvedAt:        null,
  resolutionReason:  null,
  affectedProperties: ['rowCount'],       // Which properties conflict
  confidenceDelta:   0.45                 // Difference in confidence scores
}]->(incoming)
```

### Contradiction lifecycle

```
  ┌─────────┐     Detection        ┌─────────────┐
  │ New     │─────────────────────►│             │
  │ fact    │                      │  DETECTED   │
  │         │                      │             │
  └─────────┘                      └──────┬──────┘
                                          │
                                   Classification
                                   (type, severity)
                                          │
                                   ┌──────▼──────┐
                                   │             │
                                   │  CLASSIFIED │
                                   │             │
                                   └──────┬──────┘
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                   confidence         severity        structural
                   delta < 0.3       = LOW             match
                          │               │               │
                   auto-resolve      auto-resolve     ┌───▼────┐
                          │               │           │        │
                   ┌──────▼──────┐ ┌──────▼──────┐   │ VOTING │
                   │  SUPERSEDE  │ │   COEXIST   │   │ SESSION│
                   └──────┬──────┘ └──────┬──────┘   └───┬────┘
                          │               │               │
                          └───────────────┼───────────────┘
                                          │
                                   ┌──────▼──────┐
                                   │             │
                                   │  RESOLVED   │
                                   │             │
                                   │ → ADR node  │
                                   │   created   │
                                   └─────────────┘
```

---

## 8.5 Self-Documentation: the graph documents itself

### Self-documentation principle

The UN ProjectAdvisor knowledge graph is a **self-documenting system**. Every significant decision made by the system or its agents is automatically recorded as an ADR (Architecture Decision Record) node in the `META` namespace.

Significant decisions include:

- Changing the graph schema (adding a new node or edge type)
- Promoting a pattern in PatternLibrary (auto-promotion)
- Resolving a contradiction (SUPERSEDE, MERGE, COEXIST)
- Upgrading an agent's autonomy level
- Creating a new namespace
- Migrating data between versions

### ADR (Architecture Decision Record)

```cypher
CREATE (adr:ADR:NodeVersion {
  adrId:          'ADR-2026-0342',
  namespace:      'META',
  title:          'Automatic promotion of StoredProcedure pattern',
  status:         'ACCEPTED',        // PROPOSED | ACCEPTED | DEPRECATED | SUPERSEDED
  context:        'The StoredProcedure pattern was observed 7 times with confidence ≥ 0.85. ' +
                  'The auto-promotion threshold (5 observations) has been exceeded.',
  decision:       'Pattern promoted from learningBuffer to the main catalog ' +
                  'of Extraction PatternLibrary.',
  consequences:   'Future extractions from SQL code will automatically ' +
                  'recognize stored procedures without explicitly specifying the pattern.',
  createdBy:      'agent-optimizer-pattern-001',
  createdAt:      datetime(),
  decisionType:   'PATTERN_PROMOTION',  // SCHEMA_CHANGE | PATTERN_PROMOTION |
                                        // CONTRADICTION_RESOLUTION | AUTONOMY_UPGRADE |
                                        // NAMESPACE_CREATION | DATA_MIGRATION
  confidence:     0.92,
  votingSessionId: null,                // null if auto-decided
  contentHash:    'sha256:...'
})
```

### ADR relationships with affected nodes

```
┌──────────┐   MOTIVATED_BY    ┌──────────────────┐
│  ADR     │──────────────────►│ Affected node     │
│  node    │                   │ (Pattern,         │
│          │                   │  Schema,          │
│          │   MOTIVATED_BY    │  Namespace,       │
│          │──────────────────►│  Agent)           │
│          │                   └──────────────────┘
│          │
│          │   SUPERSEDES      ┌──────────────────┐
│          │──────────────────►│ Previous ADR     │
│          │                   │ (if replacement)  │
│          │                   └──────────────────┘
└──────────┘
```

```cypher
// Link ADR with the affected pattern
MATCH (adr:ADR {adrId: 'ADR-2026-0342'})
MATCH (pattern:Pattern {name: 'StoredProcedure', domain: 'SQL'})
CREATE (adr)-[:MOTIVATED_BY {
  reason:    'Pattern auto-promoted after 7 observations',
  impact:    'ENRICHMENT',    // ENRICHMENT | DEPRECATION | MIGRATION | RESTRICTION
  createdAt: datetime()
}]->(pattern)

// Link ADR with the agent that made the decision
MATCH (adr:ADR {adrId: 'ADR-2026-0342'})
MATCH (agent:Agent {agentId: 'agent-optimizer-pattern-001'})
CREATE (adr)-[:DECIDED_BY {
  mechanism: 'AUTO',          // AUTO | MAJORITY | WEIGHTED | UNANIMOUS | HUMAN
  createdAt: datetime()
}]->(agent)
```

### ADR auto-generation

```javascript
class ADRGenerator {
  /**
   * Auto-create ADR when a significant system decision occurs
   * @param {string} decisionType - Type of decision
   * @param {Object} context - Decision context
   * @param {string} agentId - Agent that made the decision
   */
  async createADR(decisionType, context, agentId) {
    const adrId = `ADR-${new Date().getFullYear()}-${String(this._counter++).padStart(4, '0')}`;

    const adr = {
      adrId,
      namespace:    'META',
      title:        this._generateTitle(decisionType, context),
      status:       'ACCEPTED',
      context:      this._generateContext(decisionType, context),
      decision:     this._generateDecision(decisionType, context),
      consequences: this._generateConsequences(decisionType, context),
      createdBy:    agentId,
      createdAt:    new Date().toISOString(),
      decisionType,
      confidence:   context.confidence || 0.8,
      contentHash:  this._computeHash(decisionType, context)
    };

    // Persist ADR node in META namespace
    await memgraphService.runQuery(`
      CREATE (adr:ADR:NodeVersion $props)
      RETURN adr
    `, { props: adr });

    // Link to affected nodes
    for (const nodeId of (context.affectedNodeIds || [])) {
      await memgraphService.runQuery(`
        MATCH (adr:ADR {adrId: $adrId})
        MATCH (n {id: $nodeId})
        CREATE (adr)-[:MOTIVATED_BY {
          reason: $reason,
          impact: $impact,
          createdAt: datetime()
        }]->(n)
      `, { adrId, nodeId, reason: context.reason, impact: context.impact });
    }

    return adr;
  }
}
```

### Auto-generation of Changelog from SUPERSEDES chains

The system automatically generates a changelog for any entity by traversing the `SUPERSEDES` chain:

```cypher
// Get the full change history for an entity
MATCH path = (current:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
              -[:SUPERSEDES*]->(ancestor:NodeVersion)
WITH nodes(path) AS versions
UNWIND versions AS v
RETURN v.versionId, v.sequenceNumber, v.status,
       v.createdAt, v.createdBy, v.changeReason
ORDER BY v.sequenceNumber DESC
```

**Automatic changelog format:**

```
CHANGELOG for entityId: BR-001 (Budget validation rule)
═══════════════════════════════════════════════════════════

v3 [ACTIVE]    2026-03-12  agent-enricher-002
   Added: link to FINANCE namespace
   ADR: ADR-2026-0341

v2 [SUPERSEDED] 2026-03-10  agent-extractor-sql-001
   Changed: confidence 0.7 → 0.9 (confirmed from SQL constraint)
   ADR: ADR-2026-0298

v1 [SUPERSEDED] 2026-03-08  agent-extractor-doc-003
   Created: extracted from document "Budget Policy 2026.docx"
   ADR: null (initial creation)
```

### Graph as a self-documenting system

```
┌────────────────────────────────────────────────────────────────────┐
│                    SELF-DOCUMENTING GRAPH                          │
│                                                                    │
│   Data                     Decisions                History        │
│   ────                     ─────────                ───────       │
│   (:Table)                 (:ADR)                   SUPERSEDES    │
│   (:Column)                  │                      chain         │
│   (:Procedure)               │                         │          │
│        │                MOTIVATED_BY                   │          │
│        │                     │                         │          │
│        └─────────────────────┘                         │          │
│                                                        │          │
│   Patterns                 Agents                      │          │
│   ────────                 ──────                      │          │
│   (:Pattern)               (:Agent)                    │          │
│        │                     │                         │          │
│        │              DECIDED_BY                       │          │
│        └─────────────────────┘                         │          │
│                                                        │          │
│   Contradictions           Versions                    │          │
│   ──────────────           ──────                      │          │
│   CONTRADICTS edges        (:NodeVersion)──────────────┘          │
│                                                                    │
│   Every element of the graph REFERENCES the decision              │
│   that led to its creation.                                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## 8.6 Autonomy levels (Autonomy Levels 0-4)

### Level definitions

The system defines five autonomy levels through which an agent (or group of agents) progresses as trust accumulates.

```
Level 0       Level 1        Level 2       Level 3        Level 4
MANUAL        SUPERVISED     GUIDED        AUTONOMOUS     SELF-EVOLVING
  │               │              │              │              │
  │  Agent        │  Agent       │  Agent       │  Agent       │  Agent
  │  proposes,    │  performs    │  performs    │  handles all │  can
  │  human        │  routine,    │  most        │  operations  │  modify
  │  approves     │  human       │  operations, │  independently│ its own
  │  EVERYTHING   │  approves    │  human       │  human       │  rules
  │               │  critical    │  reviews     │  intervenes  │  (unanimous
  │               │              │  digest      │  on anomalies│  consensus)
  │               │              │  weekly      │              │
  ▼               ▼              ▼              ▼              ▼
trustScore    trustScore     trustScore    trustScore     trustScore
  N/A           ≥ 0.80         ≥ 0.90        ≥ 0.95         ≥ 0.98
```

### Current system status

> **The UN ProjectAdvisor system operates at Level 1 (Supervised).**
>
> Agents perform routine operations (extraction, validation, enrichment)
> autonomously. Critical operations (deletion, merging, namespace changes)
> require human confirmation.

### Authority matrix

```
┌─────────────────────────┬────────┬────────┬────────┬────────┬────────┐
│ Operation               │ Lv 0   │ Lv 1   │ Lv 2   │ Lv 3   │ Lv 4   │
│                         │ Manual │ Super. │ Guided │ Auto.  │ S-Evol │
├─────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ Create node             │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Create edge             │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Update confidence       │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │ AUTO   │
│ Entity resolution       │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │
│ Promote pattern         │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │ AUTO   │
│ Resolve contradiction   │ HUMAN  │ HUMAN  │ REVIEW │ AUTO   │ AUTO   │
│ Create namespace        │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO   │ AUTO   │
│ Change namespace        │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ MERGE entities          │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ DELETE (Tombstone)      │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ Schema migration        │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ AUTO*  │
│ Change agent rules      │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ UNAN*  │
│ Upgrade autonomy level  │ HUMAN  │ HUMAN  │ HUMAN  │ HUMAN  │ UNAN*  │
├─────────────────────────┼────────┼────────┼────────┼────────┼────────┤
│ HUMAN  = requires human confirmation                                  │
│ AUTO   = agent executes autonomously                                  │
│ REVIEW = agent executes, human reviews in digest                     │
│ AUTO*  = autonomous, but with unanimous agent consensus               │
│ UNAN*  = only through unanimous consensus + Orchestrator trustScore  │
│          ≥ 0.98                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### Level upgrade criteria

Transitioning to each next autonomy level requires meeting metric thresholds for a **minimum of 30 days**.

| Criterion | Lv 0→1 | Lv 1→2 | Lv 2→3 | Lv 3→4 |
|-----------|--------|--------|--------|--------|
| **trustScore** | ≥ 0.80 | ≥ 0.90 | ≥ 0.95 | ≥ 0.98 |
| **successRate** (Runtime) | ≥ 70% | ≥ 85% | ≥ 95% | ≥ 99% |
| **Completeness** (CODEX-VALID) | ≥ 90% | ≥ 95% | ≥ 98% | ≥ 99.5% |
| **Provenance coverage** | ≥ 85% | ≥ 92% | ≥ 97% | ≥ 99% |
| **Confidence calibration** | ≥ 0.6 | ≥ 0.75 | ≥ 0.85 | ≥ 0.95 |
| **QUALITY_ISSUE rate** (per 1000 ops) | < 50 | < 20 | < 5 | < 1 |
| **Contradiction resolution accuracy** | N/A | ≥ 80% | ≥ 90% | ≥ 97% |
| **Minimum operations** | 100 | 1,000 | 10,000 | 100,000 |
| **Minimum time at level** | - | 30 days | 90 days | 180 days |

### Level upgrade protocol

```javascript
async function evaluateAutonomyUpgrade(agentId) {
  const agent = await getAgent(agentId);
  const currentLevel = agent.autonomyLevel;
  const targetLevel = currentLevel + 1;

  if (targetLevel > 4) return { eligible: false, reason: 'Maximum level reached' };

  const criteria = GRADUATION_CRITERIA[targetLevel];
  const metrics = await collectAgentMetrics(agentId, { days: criteria.minDaysOnLevel });

  const evaluation = {
    trustScore:     metrics.trustScore >= criteria.trustScore,
    successRate:    metrics.successRate >= criteria.successRate,
    completeness:   metrics.completeness >= criteria.completeness,
    provenance:     metrics.provenanceCoverage >= criteria.provenanceCoverage,
    calibration:    metrics.confidenceCalibration >= criteria.calibration,
    qualityIssues:  metrics.qualityIssuePer1000 < criteria.maxQualityIssues,
    totalOps:       metrics.totalOperations >= criteria.minOperations,
    daysOnLevel:    metrics.daysOnCurrentLevel >= criteria.minDaysOnLevel
  };

  const allPassed = Object.values(evaluation).every(Boolean);

  if (allPassed) {
    // Level 0→1, 1→2, 2→3: requires HUMAN approval
    // Level 3→4: requires UNANIMOUS consensus + HUMAN approval
    if (targetLevel <= 3) {
      await createApprovalRequest(agentId, targetLevel, evaluation);
    } else {
      await initiateUnanimousVote('AUTONOMY_UPGRADE', { agentId, targetLevel, evaluation });
    }

    // Always create ADR
    await adrGenerator.createADR('AUTONOMY_UPGRADE', {
      agentId,
      from: currentLevel,
      to: targetLevel,
      metrics,
      evaluation,
      affectedNodeIds: [agent.id]
    }, 'system-autonomy-evaluator');
  }

  return { eligible: allPassed, evaluation, metrics };
}
```

### Level demotion

Level demotion occurs automatically when thresholds are violated:

| Trigger | Action |
|---------|--------|
| `trustScore` fell below the current level's threshold | Demotion by 1 level |
| `QUALITY_ISSUE` rate exceeded threshold by 3x | Demotion by 1 level |
| Critical contradiction created by the agent | Demotion by 1 level + review |
| Provenance falsification detected | Demotion to Level 0 + investigation |

---

## Future development prospects

### GNN integration for predictive quality scoring

The GNN service (port 5000) already supports link prediction and node classification. In the future, these capabilities will be integrated into APES:

- **Predictive contradiction detection** — GNN predicts conflicting edges before they are created, based on structural graph patterns
- **trustScore recommendation** — GNN analyzes the agent's history and predicts the optimal trustScore based on embedding similarity with successful agents
- **Graph optimization** — GNN suggests structural improvements (missing edges, redundant nodes) based on a trained graph structure model

### Federated learning across duty stations

26 UN duty stations generate knowledge in parallel. Federated learning will allow:

- Each station trains a local model on its own data
- Gradients (not data) are aggregated by a central coordinator
- The global model is distributed back to the stations
- Data privacy is preserved (data does not leave the station)

### Multimodal knowledge

Unification of knowledge from different modalities in a single graph:

- **Text** → NLP extraction → nodes and edges with provenance `sourceType: 'document'`
- **Code** → AST analysis → nodes and edges with provenance `sourceType: 'code'`
- **Diagrams** → Computer Vision → nodes and edges with provenance `sourceType: 'diagram'`
- All three modalities are linked through `SAME_AS` edges with a confidence score

---

*This document is part of the [Codex UN ProjectAdvisor](../CODEX_INDEX.md)*

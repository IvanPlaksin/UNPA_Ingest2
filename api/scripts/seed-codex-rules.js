/**
 * Seed Codex Rules (M2 level)
 * Derived from docs/codex/standards/*
 *
 * Run: node api/scripts/seed-codex-rules.js
 */

const codexService = require('../src/services/codex/codex.service');

// ============================================================
// M2 RULES - Derived from M3 Principles
// ============================================================

const RULES = [
  // ─────────────────────────────────────────────────────────
  // DERIVED FROM: Context Over Data (CODEX-PRINCIPLE-001)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Mandatory Provenance Fields',
    summary: 'Every KnowledgeQuantum must have confidence, inferredBy, and extractionCycleId fields populated.',
    rationale: 'Without provenance, knowledge cannot be traced to its source or evaluated for reliability.',
    whyItExists: 'Early extraction produced orphan facts with no way to assess their trustworthiness.',
    examples: [
      'confidence: 0.85, inferredBy: "sql-parser-v2", extractionCycleId: "cycle-2024-03-15"',
      'Validation rejects nodes missing any provenance field'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['KnowledgeQuantum', 'BusinessRule', 'Pattern'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['provenance', 'validation', 'codex-meta']
  },
  {
    title: 'Source Reference Required for External Knowledge',
    summary: 'Any knowledge extracted from external sources must include sourceRef URI.',
    rationale: 'Enables verification and audit trail back to original document or system.',
    whyItExists: 'Compliance requirements mandate traceability to source documents.',
    examples: [
      'sourceRef: "imis://stored-procedures/SP_CALC_LEAVE"',
      'sourceRef: "tfs://workitem/12345"'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['KnowledgeQuantum'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['provenance', 'audit', 'codex-meta']
  },

  // ─────────────────────────────────────────────────────────
  // DERIVED FROM: Uncertainty Over False Confidence (CODEX-PRINCIPLE-002)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Quality Tier Assignment by Confidence',
    summary: 'Nodes must be assigned qualityTier based on confidence: A(>=0.9), B(>=0.7), C(>=0.5), D(<0.5).',
    rationale: 'Enables consumers to filter knowledge by reliability level.',
    whyItExists: 'Users needed a simple way to distinguish high-confidence facts from uncertain inferences.',
    examples: [
      'confidence: 0.95 -> qualityTier: "A"',
      'confidence: 0.45 -> qualityTier: "D" (requires human verification)'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['KnowledgeQuantum', 'BusinessRule'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-002',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['confidence', 'quality', 'codex-meta']
  },
  {
    title: 'Low Confidence Disclosure',
    summary: 'When presenting knowledge with confidence < 0.7, agents must explicitly disclose uncertainty.',
    rationale: 'Users must not be misled by uncertain information presented as fact.',
    whyItExists: 'User trust was damaged when uncertain extractions were presented confidently.',
    examples: [
      'Response: "This appears to be a leave calculation rule (confidence: 0.6), but requires verification."',
      'UI shows yellow warning badge for qualityTier C/D'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['AgentResponse', 'UIPresentation'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-002',
    changeabilityTier: 'REVIEWED',
    tags: ['confidence', 'ux', 'agent-behavior']
  },

  // ─────────────────────────────────────────────────────────
  // DERIVED FROM: Contradiction as Signal (CODEX-PRINCIPLE-003)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Explicit Contradiction Modeling',
    summary: 'When two facts contradict, create CONTRADICTS edge with type classification instead of discarding either.',
    rationale: 'Contradictions often encode real business complexity that would be lost if resolved prematurely.',
    whyItExists: 'Initial "clean data" approach lost critical edge cases encoded in contradictions.',
    examples: [
      '(ruleA)-[:CONTRADICTS {type: "TEMPORAL", note: "ruleA valid pre-2015, ruleB post-2015"}]->(ruleB)',
      '(ruleA)-[:CONTRADICTS {type: "CONTEXTUAL", note: "ruleA for managers, ruleB for staff"}]->(ruleB)'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['BusinessRule', 'Pattern', 'KnowledgeQuantum'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-003',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['contradiction', 'edges', 'codex-crud']
  },
  {
    title: 'Contradiction Type Classification',
    summary: 'CONTRADICTS edges must specify type: TEMPORAL, CONTEXTUAL, SOURCE_CONFLICT, or DIRECT.',
    rationale: 'Different contradiction types require different resolution strategies.',
    whyItExists: 'Research identified four distinct patterns of contradiction in legacy systems.',
    examples: [
      'TEMPORAL: fact was true at different times',
      'CONTEXTUAL: fact is true in different contexts',
      'SOURCE_CONFLICT: sources disagree',
      'DIRECT: mutually exclusive claims'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['CONTRADICTS'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-003',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['contradiction', 'classification', 'codex-crud']
  },

  // ─────────────────────────────────────────────────────────
  // DERIVED FROM: Versioning as Respect for History (CODEX-PRINCIPLE-004)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Immutable Node Updates via SUPERSEDES',
    summary: 'Nodes are never modified in place. Updates create new version with SUPERSEDES edge to previous.',
    rationale: 'Preserves complete history and enables rollback.',
    whyItExists: 'Bi-temporal model requirement from CODEX-VERSION standard.',
    examples: [
      '(nodeV2)-[:SUPERSEDES {reason: "policy update", since: "2024-03-01"}]->(nodeV1)',
      'nodeV1.status changes to SUPERSEDED'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['KnowledgeQuantum', 'BusinessRule', 'NodeVersion'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-004',
    changeabilityTier: 'FROZEN',
    tags: ['versioning', 'immutability', 'codex-version']
  },
  {
    title: 'Hash Chain Integrity',
    summary: 'Every versioned node must maintain contentHash, previousHash, and chainHash for tamper detection.',
    rationale: 'Cryptographic integrity ensures audit trail cannot be falsified.',
    whyItExists: 'UN compliance requires tamper-evident records.',
    examples: [
      'contentHash = SHA256(canonicalize(properties))',
      'chainHash = SHA256(previousHash + contentHash)'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['NodeVersion', 'CodexRule', 'CodexPrinciple'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-004',
    changeabilityTier: 'FROZEN',
    tags: ['versioning', 'integrity', 'codex-version']
  },
  {
    title: 'Soft Delete via Tombstone',
    summary: 'Deletion creates Tombstone node with 90-day restoration window. Physical delete requires admin.',
    rationale: 'Prevents accidental data loss while allowing recovery.',
    whyItExists: 'Users accidentally deleted critical knowledge; restore capability was required.',
    examples: [
      'softDelete() -> node.status = DELETED + Tombstone created',
      'Tombstone.restorable = true for 90 days'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['delete operations'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-004',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['deletion', 'tombstone', 'codex-crud']
  },

  // ─────────────────────────────────────────────────────────
  // DERIVED FROM: Spiral Growth Model (CODEX-PRINCIPLE-005)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Extraction Cycle Linking',
    summary: 'Every extracted node must link to its ExtractionCycle via extractionCycleId.',
    rationale: 'Enables tracking which extraction pass produced each fact and measuring improvement.',
    whyItExists: 'Spiral model requires tracing knowledge back to specific extraction iterations.',
    examples: [
      'extractionCycleId: "cycle-2024-03-15-imis-sp"',
      'ExtractionCycle tracks: source, method, coverage, confidence delta'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['KnowledgeQuantum', 'BusinessRule'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-005',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['extraction', 'cycle', 'codex-meta']
  },
  {
    title: 'Coverage Metrics per Cycle',
    summary: 'Each ExtractionCycle must record coverage percentage and confidence improvement over previous cycle.',
    rationale: 'Enables measurement of spiral progress and identification of diminishing returns.',
    whyItExists: 'Needed to demonstrate value of iterative extraction vs one-shot approach.',
    examples: [
      'cycle3.coverage = 0.78, cycle3.confidenceDelta = +0.12 vs cycle2',
      'Dashboard shows spiral progress visualization'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'SHOULD',
    scope: ['ExtractionCycle'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-005',
    changeabilityTier: 'REVIEWED',
    tags: ['extraction', 'metrics', 'codex-meta']
  },

  // ─────────────────────────────────────────────────────────
  // DERIVED FROM: Graph as Program (CODEX-PRINCIPLE-006)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Executable Graph Structure (AOPEG)',
    summary: 'GXE graphs must follow AOPEG model: nodes are executors with parameterSchema, edges define control flow.',
    rationale: 'Standardized structure enables universal execution engine.',
    whyItExists: 'GXE required consistent executable format for all workflow graphs.',
    examples: [
      'node.type = "graphNode", node.executorId = "sql-executor"',
      'edge.condition = "{{result.success}} === true"'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['Graph', 'Executor', 'CatalogEntry'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-006',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['gxe', 'aopeg', 'execution']
  },
  {
    title: 'Graph Catalog Deduplication',
    summary: 'Before storing new graph, check SHA-256 hash against catalog. Identical graphs reuse existing entry.',
    rationale: 'Prevents duplicate storage and enables reuse tracking.',
    whyItExists: 'GNN training requires clean, deduplicated graph corpus.',
    examples: [
      'newGraph.contentHash matches existing -> return existing CatalogEntry',
      'ReuseRecord created for tracking'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['CatalogEntry', 'GraphVersion'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-006',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['gxe', 'catalog', 'deduplication']
  },
  {
    title: 'Reuse Strategy Resolution',
    summary: 'Graph similarity determines reuse: >=0.9 DIRECT_REUSE, 0.6-0.9 CLONE_MODIFY, <0.6 CREATE_NEW.',
    rationale: 'Maximizes graph reuse while avoiding inappropriate matches.',
    whyItExists: 'GNN similarity scoring needed actionable thresholds.',
    examples: [
      'similarity: 0.92 -> DIRECT_REUSE existing graph',
      'similarity: 0.75 -> CLONE_MODIFY with adaptations'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'SHOULD',
    scope: ['CatalogEntry', 'ReuseRecord'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-006',
    changeabilityTier: 'REVIEWED',
    tags: ['gxe', 'reuse', 'gnn']
  },

  // ─────────────────────────────────────────────────────────
  // DERIVED FROM: Machine-Readable Human-Documentable (CODEX-PRINCIPLE-007)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Information Contract Required Fields',
    summary: 'All Codex nodes must have: title, summary, rationale, whyItExists, examples (>=1).',
    rationale: 'These five fields enable automatic documentation generation.',
    whyItExists: 'Research requirement: agent reading graph must generate complete docs without loss.',
    examples: [
      'title: short name for headers',
      'rationale: why this exists',
      'examples: at least one concrete usage'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['CodexPrinciple', 'CodexRule', 'CodexPattern', 'CodexDefinition'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'FROZEN',
    tags: ['documentation', 'information-contract', 'codex-valid']
  },
  {
    title: 'Documentation Generation Test',
    summary: 'Codex must pass automated test: generateDocumentation() produces complete, readable output.',
    rationale: 'Proves the Information Contract is being honored.',
    whyItExists: 'Validation criterion from research: Completeness Score >= 0.90.',
    examples: [
      'codexService.generateDocumentation() returns valid markdown',
      'All principles have all 5 narrative fields populated'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['Codex namespace'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['documentation', 'testing', 'codex-valid']
  },

  // ─────────────────────────────────────────────────────────
  // NAMESPACE RULES (from CODEX-NS)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Four Namespace Architecture',
    summary: 'Knowledge is partitioned into CORE, PROJECT, META, COMMON namespaces with defined access patterns.',
    rationale: 'Isolation prevents data pollution and enables namespace-specific caching/access control.',
    whyItExists: 'ADR-003 established four-namespace model based on access patterns.',
    examples: [
      'CORE: system knowledge, READ-ONLY',
      'PROJECT: extracted knowledge, READ/WRITE',
      'META: infrastructure, APPEND-ONLY',
      'COMMON: shared ontology'
    ],
    ruleKind: 'CONSTITUTIVE',
    modality: 'MUST',
    scope: ['all namespaces'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'FROZEN',
    tags: ['namespace', 'architecture', 'codex-ns']
  },
  {
    title: 'Namespace Field Required',
    summary: 'Every node must have namespace field set to valid namespace value.',
    rationale: 'Enables routing, caching, and access control.',
    whyItExists: 'NamespaceRouter requires explicit namespace for query routing.',
    examples: [
      'namespace: "PROJECT" for extracted knowledge',
      'namespace: "Codex" for governance rules'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['all nodes'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'FROZEN',
    tags: ['namespace', 'validation', 'codex-ns']
  },
  {
    title: 'Cross-Namespace Query Restrictions',
    summary: 'PROJECT nodes cannot directly edge to other PROJECT namespace projects. Use COMMON for shared entities.',
    rationale: 'Project isolation prevents data leakage between extraction projects.',
    whyItExists: 'Security requirement for multi-tenant extraction.',
    examples: [
      'ALLOWED: (PROJECT:imis)-[:USES]->(COMMON:Currency)',
      'FORBIDDEN: (PROJECT:imis)-[:RELATED]->(PROJECT:umoja)'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST_NOT',
    scope: ['PROJECT namespace'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-001',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['namespace', 'security', 'codex-ns']
  },

  // ─────────────────────────────────────────────────────────
  // CRUD RULES (from CODEX-CRUD)
  // ─────────────────────────────────────────────────────────
  {
    title: 'Idempotent Create via MERGE',
    summary: 'Node creation uses MERGE pattern to ensure idempotency. Same input produces same result.',
    rationale: 'Prevents duplicates from retry logic or parallel execution.',
    whyItExists: 'Distributed extraction pipelines require idempotent writes.',
    examples: [
      'MERGE (n:BusinessRule {id: $id}) ON CREATE SET n = $props ON MATCH SET n += $updates',
      'Retrying failed write does not create duplicate'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['create operations'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-004',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['crud', 'idempotency', 'codex-crud']
  },
  {
    title: 'Parameterized Queries Only',
    summary: 'All Cypher queries must use parameters. Direct string interpolation is forbidden.',
    rationale: 'Prevents Cypher injection attacks.',
    whyItExists: 'Security audit identified injection risk in early implementation.',
    examples: [
      'FORBIDDEN: `MATCH (n {name: "${userInput}"})`',
      'REQUIRED: query("MATCH (n {name: $name})", {name: userInput})'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['all Cypher queries'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'FROZEN',
    tags: ['security', 'cypher', 'codex-crud']
  }
];

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function seedCodexRules() {
  console.log('Starting Codex rules (M2) seed...\n');

  const context = { isAdmin: true, createdBy: 'seed-script' };
  const created = { rules: [], relationships: [] };

  try {
    for (const ruleData of RULES) {
      const { derivesFromPrinciple, ...nodeData } = ruleData;

      // Create rule
      const rule = await codexService.createNode('CodexRule', {
        ...nodeData,
        deonticState: 'ACTIVE'
      }, context);

      const ruleCodexId = rule.codexId || rule.properties?.codexId;
      created.rules.push(rule);
      console.log(`+ ${ruleCodexId}: ${nodeData.title}`);

      // Link to principle
      if (derivesFromPrinciple && ruleCodexId) {
        try {
          const rel = await codexService.linkRuleToPrinciple(ruleCodexId, derivesFromPrinciple, 1.0);
          created.relationships.push(rel);
          console.log(`  -> DERIVES_FROM ${derivesFromPrinciple}`);
        } catch (err) {
          console.warn(`  Warning: Could not link to ${derivesFromPrinciple}: ${err.message}`);
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Codex rules seed complete!');
    console.log('='.repeat(50));
    console.log(`   Rules created: ${created.rules.length}`);
    console.log(`   DERIVES_FROM relationships: ${created.relationships.length}`);

    // Stats by principle
    console.log('\nRules per principle:');
    const byPrinciple = {};
    RULES.forEach(r => {
      const p = r.derivesFromPrinciple || 'unlinked';
      byPrinciple[p] = (byPrinciple[p] || 0) + 1;
    });
    Object.entries(byPrinciple).forEach(([p, count]) => {
      console.log(`   ${p}: ${count} rules`);
    });

    return created;

  } catch (error) {
    console.error('Seed failed:', error.message);
    throw error;
  }
}

// ============================================================
// RUN
// ============================================================

if (require.main === module) {
  seedCodexRules()
    .then(() => {
      console.log('\nDone. Exiting...');
      process.exit(0);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedCodexRules, RULES };

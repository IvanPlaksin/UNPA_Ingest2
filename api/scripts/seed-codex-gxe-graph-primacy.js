'use strict';
/**
 * Seed Codex Rules — GXE Graph Primacy & Merge Node rules
 *
 * Resolves the conflict between:
 *   - Old Rule: "Linear DAG for dialog — no merge-nodes" (OUTDATED workaround)
 *   - Principle: "Graph = Program" (business logic MUST be in graph structure)
 *
 * Root cause: TopologicalScheduler had a skip-cascade bug for merge nodes.
 * The bug is now fixed. These rules establish the correct post-fix behavior.
 */

const { v4: uuidv4 } = require('uuid');
let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const RULES = [
  {
    codexId: 'CODEX-RULE-GXE-009',
    title: 'Graph = Program Primacy: Business Routing MUST Be Visible in Graph Structure',
    summary: 'All business routing logic MUST be expressed as condition nodes and labeled edges in the graph. Executor pass-through is permitted ONLY for idempotency guards (e.g., "already completed this turn"). Using pass-through to hide routing decisions (e.g., "self vs other beneficiary", "high vs low confidence") is PROHIBITED. If routing cannot be expressed in graph due to scheduler limitations, the scheduler must be fixed — the constraint is a bug, not a design rule.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap', 'flowdesk'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'SR-DIALOG-GRAPH-001 was built as a linear chain with all 5 business routing decisions hidden in executor pass-through code (self/other beneficiary, high/low confidence, location present/absent, find_user result, confirm outcome). This made the graph visually misleading — it appeared to have 1 branch when the business process has 5. The root cause was GXE Rule #3 ("Linear DAG for dialog") being formulated as a permanent constraint when it was actually a temporary workaround for the TopologicalScheduler merge-node bug.',
    examples: [
      'CORRECT: SR-C-CONFIDENCE [condition: SR_CLASSIFY_INTENT.branch] → ["low_confidence"→CLARIFY, "high_confidence"→ASK-BENEFICIARY]',
      'CORRECT: SR-C-BENEFICIARY [condition: SR_ASK_BENEFICIARY.branch] → ["self"→CHECK-LOCATION, "other"→FIND-USER→CHECK-LOCATION(merge)]',
      'WRONG: classify_intent followed by clarify_intent in linear chain, with clarify_intent pass-through hiding the confidence routing'
    ],
    antiPatterns: [
      'Linear DAG for dialog with all routing logic in executor pass-through code',
      'Condition that only applies when WAIT_FOR_INPUT is not already set (hidden routing)',
      'Pass-through checking "if service_code already set" to simulate a branch that should be a condition node'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-011',
    title: 'Forward-Branch Merge Nodes Are PERMITTED and REQUIRED for Convergent Business Flows',
    summary: 'A merge node (inDegree > 1, multiple incoming paths from separate branches) is PERMITTED in forward-branching DAGs. TopologicalScheduler correctly handles merge nodes: it decrements inDegree for each skipped/completed predecessor and marks the merge node READY only when all predecessors have been resolved (some succeeding, some skipped). The old rule "Linear DAG only — no merge-nodes" referred to back-edges (cycles) only and is SUPERSEDED by this rule for forward merges.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'TopologicalScheduler._skipUnreachable() was assumed to have a skip-cascade bug for merge nodes. Analysis showed it already had merge-node detection (incomingCount > 1 check). A remaining edge case (merge node with ALL predecessors skipped was marked READY instead of SKIPPED) was fixed. The "no merge-nodes" rule was a workaround for a bug that is now fixed.',
    examples: [
      'SR-ASK-BENEFICIARY as merge node: inDegree=3 (high_confidence, medium_confidence edges from C-CONFIDENCE + edge from CLARIFY-INTENT)',
      'SR-CHECK-LOCATION as merge node: inDegree=5 (self, different from C-BENEFICIARY + found, multiple, self_skip from C-FIND-USER)',
      'SR-CONFIRM-REQUEST as merge node: inDegree=2 (true from C-LOCATION + edge from SEARCH-LOCATION)',
      'SR-WF-END as merge node: inDegree=4 (from NOTIFY, SET-CANCELLED, SET-EDIT, CANCEL-NOT-FOUND)'
    ],
    antiPatterns: [
      'Avoid merge nodes by duplicating all downstream logic per branch (combinatorial explosion)',
      'Hiding convergence in executor pass-through instead of using merge node',
      'Using back-edges (cycles) to simulate loop-back — these ARE still prohibited (use re-execution pattern instead)'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-012',
    title: 'Graph Creation MUST Use graphCatalogService.createGraph() — Direct Cypher Prohibited',
    summary: 'ALL graph creation MUST use graphCatalogService.createGraph() as the sole entry point. Direct Cypher CREATE statements for CatalogEntry, GraphDefinition, or graph nodes/edges are PROHIBITED in seed scripts and runtime code.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'seed-sr-dialog-graph.js originally used 4 raw mg.runQuery() calls instead of graphCatalogService.createGraph(). Consequences: (1) GTS-001 graphType validation was bypassed, (2) GraphClassificationService was not called so topology field was not computed, (3) CatalogEntry.type was set to "EXECUTABLE" (invalid value — not in GRAPH_TYPES enum), (4) No relationship management (DEFINES, HAS_VERSION) was applied correctly.',
    examples: [
      'CORRECT: graphCatalogService.createGraph({ name, type: "composite", graphType: "EXECUTABLE", graphSubType: "dialog", namespace, graphKey, nodes, edges })',
      'WRONG: mg.runQuery("CREATE (c:CatalogEntry {...})")',
      'WRONG: mg.runQuery("CREATE (g:GraphDefinition {...})")'
    ],
    antiPatterns: [
      'Raw Cypher CREATE for any graph-catalog artifact',
      'Calling mg.runQuery() directly to create CatalogEntry or GraphDefinition',
      'Setting CatalogEntry.type to a graphType value (e.g., "EXECUTABLE") — these are different taxonomies'
    ]
  }
];

async function seed() {
  console.log('Seeding GXE Graph Primacy Codex rules...\n');
  let created = 0;
  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const ex = await mg().runQuery('MATCH (r:CodexRule {codexId: $c}) RETURN r', { c: rule.codexId });
      if (ex.length > 0) {
        console.log('  SKIP (already exists):', rule.codexId);
        continue;
      }
      await mg().runQuery(
        `CREATE (r:CodexRule {
          id: $id, codexId: $codexId, namespace: 'CODEX', nodeType: 'CodexRule',
          title: $title, summary: $summary, modality: $modality,
          scope: $scope, tier: 'M2', status: 'ACTIVE',
          rationale: $rationale, examples: $examples, antiPatterns: $antiPatterns,
          createdAt: $now, updatedAt: $now
        }) RETURN r.codexId AS cid`,
        {
          id, codexId: rule.codexId, title: rule.title, summary: rule.summary,
          modality: rule.modality, scope: JSON.stringify(rule.scope),
          rationale: rule.rationale, examples: JSON.stringify(rule.examples),
          antiPatterns: JSON.stringify(rule.antiPatterns), now
        }
      );
      console.log('  OK:', rule.codexId, '—', rule.title);
      created++;
    } catch (e) {
      console.error('  ERR', rule.codexId, ':', e.message);
    }
  }
  console.log(`\nDone. Created: ${created} / ${RULES.length}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

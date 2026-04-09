/**
 * Seed Codex Rules — GXE Error Prevention (from graph 96092967 analysis)
 *
 * Covers architectural and process gaps discovered during debugging.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const RULES = [
  {
    codexId: 'CODEX-RULE-GXE-010',
    title: 'Graph Must Be Saved in Executable Format',
    summary: 'Graphs saved to catalog for runtime execution MUST use AOPEG DAG format with tool/executorId bindings on every node, not GXE visual format (kind-only). Visual graphs (kind: input/executor/condition/output without tool binding) are for display only and MUST NOT be passed to RuntimeEngine without conversion.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Graph 96092967 v2 was saved as visual-only format. RuntimeEngine could not execute it because nodes had kind but no tool/executorId. The runtime converter (convertGxeToAopegDag) was needed as an emergency patch. Graphs should be saved in executable format from the start.',
    examples: [
      'CORRECT: {kind: "executor", tool: "flowdesk.classify_intent", executorId: "flowdesk.classify_intent"}',
      'WRONG: {kind: "executor"} — no tool binding, requires runtime conversion',
      'Before saving: verify every executor node has tool property'
    ],
    antiPatterns: [
      'Saving graph with kind-only nodes (no tool/executorId)',
      'Relying on runtime converter to fix missing bindings',
      'Generating visual graph and assuming it is executable'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-011',
    title: 'Condition Expression Must Use Consistent Variable Format',
    summary: 'All condition expressions MUST use the format input.fieldName to reference node input data. The prefix "input." is mandatory — bare field names without prefix are invalid. Expressions MUST be testable JavaScript boolean expressions.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Inconsistent variable naming in condition expressions causes evaluation failures. RuntimeEngine evaluates expressions against the input object, so all references must use input.X format.',
    examples: [
      'CORRECT: "input.confidence_level === \'HIGH\'"',
      'CORRECT: "input.has_location === true"',
      'CORRECT: "input.action === \'confirm\' || input.action === \'yes\'"',
      'WRONG: "confidence_level === \'HIGH\'" — missing input. prefix',
      'WRONG: "data.confidence_level" — wrong prefix, use input.'
    ],
    antiPatterns: [
      'Bare variable names without input. prefix',
      'Using state. or data. or context. prefix instead of input.',
      'Non-boolean expressions (e.g., arithmetic)'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-012',
    title: 'Condition Edge True Branch Must Be Listed First',
    summary: 'When creating edges from a condition node, the TRUE branch edge SHOULD be created first (lower array index), followed by the FALSE branch. Both MUST have explicit label: "true" or label: "false". This convention enables deterministic rendering and debugging.',
    modality: 'SHOULD',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Graph 96092967 had condition edges in arbitrary order with no labels. Without consistent ordering and explicit labels, branch mapping is ambiguous and error-prone.',
    examples: [
      'edges: [{source:"N05", target:"N07", label:"true"}, {source:"N05", target:"N06", label:"false"}]',
      'TRUE first, then FALSE — reading order matches happy path'
    ],
    antiPatterns: [
      'Edges without labels relying on position/order',
      'Inconsistent ordering (sometimes true first, sometimes false)'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-013',
    title: 'AI Agent Must Verify Tool Existence Before Graph Generation',
    summary: 'When generating a graph, AI agent MUST call catalog.search_tools or catalog.list_tools to verify that each tool/executorId exists in the AOPEG registry BEFORE assigning it to a node. If tool does not exist, agent MUST either use an alternative or create a BackLog task per CODEX-RULE-042.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Graph 96092967 was generated with 13 executor nodes referencing tools that the AI assumed existed but never verified. All 13 had no tool binding because the AI did not check the catalog.',
    examples: [
      'Before: catalog.search_tools({query: "classify intent"}) → found flowdesk.classify_intent → assign',
      'Not found: catalog.search_tools({query: "escalate sla"}) → empty → create backlog task',
      'NEVER assume a tool exists — always verify through catalog MCP tools'
    ],
    antiPatterns: [
      'Generating graph with assumed tool IDs without verification',
      'Using tool IDs from training data that may not be registered',
      'Skipping catalog check for "common" tools like workflow.start'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-014',
    title: 'Graph Must Pass Compliance Check Before Deployment',
    summary: 'Before a graph is used in production (FlowDesk chat, runtime execution, or any live system), it MUST pass compliance diagnosis against all GXE rules (GXE-001 through GXE-013). Graphs with CRITICAL violations MUST NOT be deployed. The diagnose-graph.js script or equivalent API endpoint SHOULD be run automatically on save.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Graph 96092967 v2 was deployed to FlowDesk with 43% compliance (24 violations, 10 CRITICAL). It could not execute properly because basic structural requirements were not met. Automated compliance check would have caught all issues before deployment.',
    examples: [
      'On save: run diagnose-graph.js → compliance 100% → allow deployment',
      'On save: compliance 43% → block deployment, show violations list',
      'Agent generates graph → auto-diagnose → fix violations → re-diagnose → deploy'
    ],
    antiPatterns: [
      'Deploying graph without compliance check',
      'Ignoring CRITICAL violations and hoping runtime will handle them',
      'Manual-only compliance review (must be automated)'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-015',
    title: 'Runtime Functions Must Receive Required Context as Parameters',
    summary: 'When code is split into separate functions (e.g., buildResponse extracted from processMessage), all required context (dag, session, nodes) MUST be passed as explicit parameters. Functions MUST NOT reference variables from parent scope that are not in their parameter list.',
    modality: 'MUST',
    scope: ['gxe', 'code-quality', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'buildResponse() function referenced dag variable from processMessage() scope but was a separate function, causing "dag is not defined" runtime error. This blocked FlowDesk chat entirely until fixed.',
    examples: [
      'CORRECT: function buildResponse(session, result, dag) { ... dag.nodes.find() ... }',
      'WRONG: function buildResponse(session, result) { ... dag.nodes.find() ... } // dag not in params'
    ],
    antiPatterns: [
      'Referencing closure variables in extracted functions',
      'Assuming variables from call site are in scope',
      'Not testing extracted functions in isolation'
    ]
  }
];

async function seed() {
  console.log('Seeding GXE Error Prevention Codex Rules...\n');
  let created = 0, skipped = 0;

  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const existing = await mg().runQuery('MATCH (r:CodexRule {codexId: $cid}) RETURN r', { cid: rule.codexId });
      if (existing.length > 0) { console.log('  SKIP', rule.codexId); skipped++; continue; }

      await mg().runQuery(
        `CREATE (r:CodexRule {
          id: $id, codexId: $cid, namespace: 'CODEX', nodeType: 'CodexRule',
          title: $title, summary: $summary, modality: $mod, scope: $scope,
          tier: 'M2', status: 'ACTIVE', rationale: $rat,
          examples: $ex, antiPatterns: $anti,
          createdAt: $now, updatedAt: $now
        })
        WITH r
        MATCH (p:CodexPrinciple {codexId: $deriv})
        CREATE (r)-[:DERIVES_FROM]->(p)
        RETURN r.codexId`,
        {
          id, cid: rule.codexId, title: rule.title, summary: rule.summary,
          mod: rule.modality, scope: JSON.stringify(rule.scope),
          rat: rule.rationale, ex: JSON.stringify(rule.examples),
          anti: JSON.stringify(rule.antiPatterns), deriv: rule.derivesFrom, now
        }
      );
      console.log('  OK', rule.codexId, ':', rule.title);
      created++;
    } catch (e) { console.error('  ERR', rule.codexId, e.message); }
  }

  console.log(`\nResults: ${created} created, ${skipped} skipped`);
  console.log('Total GXE rules now: 15 (GXE-001..GXE-015)');
}

async function main() { await seed(); process.exit(0); }
main().catch(e => { console.error(e); process.exit(1); });

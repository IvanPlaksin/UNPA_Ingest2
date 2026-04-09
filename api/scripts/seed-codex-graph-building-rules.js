/**
 * Seed Codex Rules — GXE Graph Building (additional rules from graph analysis)
 *
 * Addresses gaps found in graph 96092967-0088-477d-9fcb-f7d6965b8863:
 * - Missing WAIT_FOR_INPUT on dialog nodes
 * - Condition edges without true/false labels
 * - Executor nodes without tool/executorId binding
 * - Missing tref nodes for visualization
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const GRAPH_BUILDING_RULES = [
  {
    codexId: 'CODEX-RULE-GXE-001',
    title: 'Dialog Nodes Must Have WAIT_FOR_INPUT',
    summary: 'Any graph node that requires user input (text entry, selection, confirmation) MUST have waitForInput: true in its config. Without this flag, RuntimeEngine skips the node without pausing for user interaction, resulting in empty data downstream.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Graph 96092967 had 5 dialog nodes without waitForInput — the entire dialog completed instantly with no user interaction. This is the most common graph generation error.',
    examples: [
      'Node "Ask Location": config: { waitForInput: true, prompt: "Please enter your location" }',
      'Node "Confirm Request": config: { waitForInput: true, show_summary: true, options: ["confirm","cancel"] }',
      'Node "Start Session": This is the FIRST node after workflow.start — it MUST wait for initial user input'
    ],
    antiPatterns: [
      'Executor node with label containing "ask"/"confirm"/"search"/"input" but NO waitForInput flag',
      'Dialog graph that completes without any pause for user interaction',
      'Assuming RuntimeEngine will auto-detect dialog nodes — it does NOT'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-002',
    title: 'Condition Edges Must Have true/false Labels',
    summary: 'Every edge from a condition node MUST have a label value of exactly "true" or "false". The first edge (typically the happy path) gets label "true", the alternative gets "false". RuntimeEngine uses these labels to choose the execution branch.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Graph 96092967 had 5 condition nodes with 10 edges all labeled NONE. RuntimeEngine could not determine which branch to follow, causing execution failures.',
    examples: [
      'Condition "Location Found?" → edge to N07 label: "true", edge to N06 label: "false"',
      'Condition "Approval Required?" → edge to "Request Approval" label: "true", edge to "Create Work Order" label: "false"',
      'Edge format: { source: "N03", target: "N04", label: "true" }'
    ],
    antiPatterns: [
      'Condition node with edges that have no labels',
      'Condition node with edges labeled "yes"/"no" instead of "true"/"false"',
      'Condition node with only one outgoing edge (must have exactly 2)'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-003',
    title: 'Executor Nodes Must Have Tool Binding',
    summary: 'Every executor node MUST have a tool or executorId property in node.data referencing a registered AOPEG executor (e.g., "flowdesk.classify_intent", "workflow.condition"). Use catalog.search_tools or catalog.list_tools to verify executor exists before assigning.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Graph 96092967 had 14 executor nodes with no tool binding. RuntimeEngine cannot execute a node without knowing which executor to invoke.',
    examples: [
      'data: { kind: "executor", tool: "flowdesk.classify_intent", executorId: "flowdesk.classify_intent" }',
      'Before assigning: call catalog.search_tools({query: "classify intent"}) to verify it exists',
      'If executor not found: create backlog task per CODEX-RULE-042'
    ],
    antiPatterns: [
      'Executor node with kind: "executor" but no tool/executorId property',
      'Assigning tool ID without verifying it exists in AOPEG registry',
      'Using generic tool names like "classifier" instead of full ID like "flowdesk.classify_intent"'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-004',
    title: 'Condition Nodes Must Have Expression',
    summary: 'Every condition node MUST have a config.expression property containing a JavaScript boolean expression. The expression evaluates against the node input data. Variable references use the format: input.field_name.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Condition nodes without expressions always evaluate to false or throw errors, breaking graph flow control.',
    examples: [
      'config: { expression: "input.confidence_level === \'HIGH\'" }',
      'config: { expression: "input.has_location === true" }',
      'config: { expression: "input.action === \'confirm\'" }'
    ],
    antiPatterns: [
      'Condition node with empty or missing expression',
      'Expression using undefined variables',
      'Complex nested expressions without parentheses'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-005',
    title: 'Graph Must Have Exactly One Start and At Least One End',
    summary: 'Every executable graph MUST have exactly one node with kind: "input" or tool: "workflow.start" as entry point, and at least one node with kind: "output" or tool: "workflow.end" as terminal. Multiple outputs are allowed for different exit paths (success, cancel, escalation).',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'RuntimeEngine requires a single entry point for topological scheduling. Missing end nodes cause execution to hang.',
    examples: [
      'Graph with 3 outputs: "Request Submitted" (success), "Request Cancelled" (user cancel), "Escalated to Human" (error path)',
      'Start node must be the only node with no incoming edges'
    ],
    antiPatterns: [
      'Graph with no start node',
      'Graph with multiple start nodes',
      'Graph with no output/end nodes (execution never terminates)'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-006',
    title: 'Dialog Graphs Must Follow Turn-Based Execution Pattern',
    summary: 'Dialog graphs (type: "dialog" or graphs used in chat context) MUST be designed for re-execution per user turn. Each turn: all nodes execute from start, nodes with data pass through, node needing input returns WAIT_FOR_INPUT. State accumulates across turns via session.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'flowdesk', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'FlowDesk runtime-chat.js re-executes the entire graph on each user message. Nodes that already have data from previous turns must pass through without re-prompting. Only the NEXT node needing data should pause.',
    examples: [
      'Turn 1: user says "I need a laptop" → N01 passes through, N02 classifies, N06 needs location → WAIT_FOR_INPUT',
      'Turn 2: user says "Brindisi" → N01-N05 pass through (data exists), N06 processes location, N07 asks beneficiary → WAIT_FOR_INPUT',
      'Each executor checks: have data in session state? → pass through. Need data? → WAIT_FOR_INPUT'
    ],
    antiPatterns: [
      'Nodes that re-prompt for data already provided in previous turns',
      'Graph that cannot be re-executed from start (has side effects on pass-through)',
      'Nodes that block without checking existing state first'
    ]
  }
];

async function seed() {
  console.log('Seeding GXE Graph Building Codex Rules...\n');
  let created = 0, skipped = 0;

  for (const rule of GRAPH_BUILDING_RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r', { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id, codexId: $codexId, namespace: 'CODEX', nodeType: 'CodexRule',
          title: $title, summary: $summary, modality: $modality, scope: $scope,
          tier: 'M2', status: 'ACTIVE', rationale: $rationale,
          examples: $examples, antiPatterns: $antiPatterns,
          createdAt: $now, updatedAt: $now
        })
        WITH r
        MATCH (p:CodexPrinciple {codexId: $derivesFrom})
        CREATE (r)-[:DERIVES_FROM]->(p)
        RETURN r.codexId
      `, {
        id, now,
        codexId: rule.codexId, title: rule.title, summary: rule.summary,
        modality: rule.modality, scope: JSON.stringify(rule.scope),
        rationale: rule.rationale,
        examples: JSON.stringify(rule.examples), antiPatterns: JSON.stringify(rule.antiPatterns),
        derivesFrom: rule.derivesFrom
      });

      console.log(`  OK ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`  ERR ${rule.codexId}: ${err.message}`);
    }
  }

  console.log(`\nResults: ${created} created, ${skipped} skipped`);
}

async function main() {
  await seed();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

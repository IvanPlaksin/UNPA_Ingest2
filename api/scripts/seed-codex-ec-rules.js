/**
 * Seed Execution Cycle Codex Rules
 *
 * Rules governing how agents use execution cycles, memory, plans, and reviews.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const EC_RULES = [
  {
    codexId: 'CODEX-RULE-EC-001',
    title: 'Execution Cycles Must Have Plan',
    summary: 'Every execution cycle MUST include a plan before execution begins. Plans are mandatory in both AUTONOMOUS and PLANNING modes. Plans must list concrete steps with ordering.',
    modality: 'MUST',
    scope: ['execution-control', 'backlog', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Plans ensure transparency and reviewability of agent actions. Without a plan, decisions cannot be audited and quality cannot be assessed.',
    examples: [
      'cycle.start() → cycle.submit_plan([{order:1, description:"Analyze existing code"}, ...]) → execute',
      'AUTONOMOUS mode: plan auto-approved instantly. PLANNING mode: plan awaits user approval.'
    ],
    antiPatterns: [
      'Skipping plan and going directly to execution',
      'Submitting a plan with only one vague step like "implement feature"'
    ]
  },
  {
    codexId: 'CODEX-RULE-EC-002',
    title: 'Agent Memory Entries Must Have Reasoning',
    summary: 'Every DECISION type memory entry MUST include a reasoning field explaining why the decision was made. STEP and FINDING entries SHOULD include reasoning when non-obvious.',
    modality: 'MUST',
    scope: ['execution-control', 'backlog', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Reasoning enables cross-review quality assessment and knowledge transfer. Without reasoning, reviewer cannot evaluate decision quality.',
    examples: [
      'cycle.add_memory({entryType:"DECISION", content:"Using EventEmitter pattern", reasoning:"Need pub/sub for SSE real-time updates, lighter than WebSocket for this use case"})',
      'cycle.add_memory({entryType:"FINDING", content:"Existing service already handles 80% of requirements", reasoning:"Reuse over rewrite per CODEX-PRINCIPLE-005"})'
    ],
    antiPatterns: [
      'Memory entries with empty reasoning for DECISION type',
      'Vague reasoning like "seemed best" without concrete justification'
    ]
  },
  {
    codexId: 'CODEX-RULE-EC-003',
    title: 'Cross-Review Must Follow Analysis Checklist',
    summary: 'Reviewer agent MUST evaluate all 6 checklist items: Plan Completeness, Decision Quality, Codex Compliance, Risk Assessment, Implementation Quality, Test Coverage. Verdict must include strengths, weaknesses, and actionable recommendations.',
    modality: 'MUST',
    scope: ['execution-control', 'review', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Structured review ensures consistent quality assessment. Without checklist, reviews may miss critical aspects.',
    examples: [
      'APPROVED: all 6 items pass, strengths and weaknesses documented',
      'REJECTED: clear explanation of which checklist items failed, specific recommendations for fixing'
    ],
    antiPatterns: [
      'Review with just verdict and no analysis',
      'REJECTED without actionable recommendations',
      'APPROVED without checking Codex compliance'
    ]
  },
  {
    codexId: 'CODEX-RULE-EC-004',
    title: 'Rejected Cycles Must Carry Forward Recommendations',
    summary: 'When a cycle is REJECTED, the new iteration MUST carry forward reviewer recommendations as the first memory entry. The executing agent MUST address each recommendation in the new plan.',
    modality: 'MUST',
    scope: ['execution-control', 'backlog', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-005',
    rationale: 'Ensures iterative improvement. Without carrying forward recommendations, agents may repeat the same mistakes in subsequent iterations.',
    examples: [
      'Iteration 1 REJECTED with recommendation "Add unit tests" → Iteration 2 plan includes "Step 3: Write unit tests for..."',
      'First memory entry of new cycle: "Reviewer recommendations from iteration 1: Add unit tests; Fix error handling"'
    ],
    antiPatterns: [
      'Ignoring reviewer recommendations in subsequent iterations',
      'Submitting identical plan after rejection'
    ]
  },
  {
    codexId: 'CODEX-RULE-EC-005',
    title: 'Execution Mode Selection Criteria',
    summary: 'AUTONOMOUS mode SHOULD be used for routine tasks (P2/P3, effort XS/S, well-understood domain). PLANNING mode SHOULD be used for critical tasks (P0/P1), large effort (L/XL), or novel domains. When in doubt, use PLANNING mode.',
    modality: 'SHOULD',
    scope: ['execution-control', 'backlog', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'AUTONOMOUS mode is faster but has less human oversight. PLANNING mode provides approval gates. Matching mode to risk level ensures appropriate governance.',
    examples: [
      'P3_LOW + effort S + "Add comment to function" → AUTONOMOUS',
      'P1_HIGH + effort L + "Redesign approval workflow" → PLANNING',
      'Novel domain not covered by existing Codex rules → PLANNING'
    ],
    antiPatterns: [
      'Using AUTONOMOUS for P0_CRITICAL tasks',
      'Using PLANNING for trivial documentation fixes'
    ]
  }
];

async function seedECRules() {
  console.log('Seeding Execution Cycle Codex Rules...\n');

  let created = 0, skipped = 0;

  for (const rule of EC_RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r',
        { codexId: rule.codexId }
      );

      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id,
          codexId: $codexId,
          namespace: 'CODEX',
          nodeType: 'CodexRule',
          title: $title,
          summary: $summary,
          modality: $modality,
          scope: $scope,
          tier: 'M2',
          status: 'ACTIVE',
          rationale: $rationale,
          examples: $examples,
          antiPatterns: $antiPatterns,
          createdAt: $now,
          updatedAt: $now
        })
        WITH r
        MATCH (p:CodexPrinciple {codexId: $derivesFrom})
        CREATE (r)-[:DERIVES_FROM]->(p)
        RETURN r.codexId
      `, {
        id, now,
        codexId: rule.codexId,
        title: rule.title,
        summary: rule.summary,
        modality: rule.modality,
        scope: rule.scope,
        rationale: rule.rationale,
        examples: JSON.stringify(rule.examples),
        antiPatterns: JSON.stringify(rule.antiPatterns),
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
  await seedECRules();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

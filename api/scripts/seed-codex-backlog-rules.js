/**
 * Seed BackLog Codex Rules
 * Run: node api/scripts/seed-codex-backlog-rules.js
 */

const codexService = require('../src/services/codex/codex.service');

const BACKLOG_RULES = [
  {
    title: 'BackLog Task Must Have Acceptance Criteria',
    summary: 'Every BackLogItem MUST include at least one acceptance criterion that is verifiable and specific.',
    rationale: 'Without clear acceptance criteria, tasks cannot be verified as complete.',
    whyItExists: 'Agents creating vague tasks caused confusion about what "done" means.',
    examples: [
      'Good: "Executor emits AuditRecord with previousAssignee, newAssignee, reason, actorId, timestamp"',
      'Bad: "Make it work correctly"'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['backlog', 'task-management'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['backlog', 'quality', 'acceptance']
  },
  {
    title: 'Agent-Created Tasks Require Human Approval',
    summary: 'BackLogItems created by AI agents MUST start in PROPOSED status and require human approval before work begins.',
    rationale: 'Graduated autonomy model requires human oversight for agent-initiated code modifications.',
    whyItExists: 'Prevents agents from creating and executing unbounded modification tasks.',
    examples: [
      'Agent creates task -> status=PROPOSED -> human reviews -> APPROVED -> work begins',
      'Human creates task -> status=APPROVED -> work begins immediately'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['backlog', 'governance', 'agent'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-002',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['backlog', 'governance', 'autonomy']
  },
  {
    title: 'Task Dependencies Must Be Acyclic',
    summary: 'DEPENDS_ON relationships between BackLogItems MUST NOT form cycles.',
    rationale: 'Circular dependencies create deadlocks and prevent task execution ordering.',
    whyItExists: 'Graph-based task management requires DAG structure for topological ordering.',
    examples: [
      'A depends on B, B depends on C — valid DAG',
      'A depends on B, B depends on A — INVALID cycle'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'MUST',
    scope: ['backlog', 'dependencies'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-006',
    changeabilityTier: 'ADMIN_ONLY',
    tags: ['backlog', 'dependencies', 'dag']
  },
  {
    title: 'Completed Tasks Should Reference Implementation',
    summary: 'BackLogItems in DONE status SHOULD include implementedFiles and implementationNotes for traceability.',
    rationale: 'Linking tasks to actual code changes enables audit trail and knowledge preservation.',
    whyItExists: 'Without implementation references, completed tasks become opaque history.',
    examples: [
      'implementedFiles: ["api/src/executors/flowdesk/AuditExecutor.js"]',
      'implementationNotes: "Added audit logging middleware in pre-execute hook"'
    ],
    ruleKind: 'PRESCRIPTIVE',
    modality: 'SHOULD',
    scope: ['backlog', 'traceability'],
    derivesFromPrinciple: 'CODEX-PRINCIPLE-004',
    changeabilityTier: 'REVIEWED',
    tags: ['backlog', 'traceability', 'implementation']
  }
];

async function seedBacklogRules() {
  console.log('Seeding BackLog Codex Rules...\n');
  const context = { isAdmin: true, createdBy: 'seed-script' };
  let created = 0;

  for (const ruleData of BACKLOG_RULES) {
    const { derivesFromPrinciple, ...nodeData } = ruleData;
    const rule = await codexService.createNode('CodexRule', { ...nodeData, deonticState: 'ACTIVE' }, context);
    const ruleCodexId = rule.codexId || rule.properties?.codexId;
    console.log(`+ ${ruleCodexId}: ${nodeData.title}`);

    if (derivesFromPrinciple && ruleCodexId) {
      try {
        await codexService.linkRuleToPrinciple(ruleCodexId, derivesFromPrinciple, 1.0);
        console.log(`  -> DERIVES_FROM ${derivesFromPrinciple}`);
      } catch (err) {
        console.warn(`  Warning: ${err.message}`);
      }
    }
    created++;
  }

  console.log(`\nBackLog rules seeded: ${created}`);
}

if (require.main === module) {
  seedBacklogRules()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seedBacklogRules, BACKLOG_RULES };

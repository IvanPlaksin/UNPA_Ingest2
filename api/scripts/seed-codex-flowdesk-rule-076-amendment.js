/**
 * Seed the ratified RULE-076 amendment (XOR-join clarification, C4 finding).
 * Run: node api/scripts/seed-codex-flowdesk-rule-076-amendment.js
 */

const codexService = require('../src/services/codex/codex.service');

const RULE = {
  title: 'RULE-076 Amendment — XOR-join Allowed, AND-merge Forbidden',
  summary: 'Clarifies RULE-076: forbidden is the AND-merge — a node with ≥2 incoming edges where at least one is unguarded (uncontrolled convergence → skip-cascade / dead transitions). A controlled XOR-join, where every incoming edge is guarded by mutually-exclusive conditions (exactly one path active per execution), is sound in the WF-net and IS allowed.',
  rationale: 'C4 finding: a flow-as-data interpreter with branching (ROUTER/RESOLVE → SLOT_EXTRACT) is impossible without convergent alternative paths. Blanket in-degree ≤ 1 is too strict; WF-net soundness requires absence of uncontrolled convergence, not absence of all joins.',
  whyItExists: 'Lets the universal interpreter branch (intent routing, re-entry) while preserving the soundness RULE-076 protects. verifyLinter/verifyLinear encode exactly this: flag ≥2 incoming with any unguarded edge; permit all-guarded XOR-joins.',
  examples: [
    'ALLOWED: ROUTER-[route==SLOT_FILL]->SLOT_EXTRACT and RESOLVE-[service resolved]->SLOT_EXTRACT (XOR-join)',
    'FORBIDDEN: two unguarded edges converging on one node (AND-merge)'
  ],
  ruleKind: 'PRESCRIPTIVE',
  modality: 'MUST',
  scope: ['flowdesk', 'gxe', 'dialog', 'topology'],
  derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
  changeabilityTier: 'ADMIN_ONLY',
  tags: ['flowdesk', 'chat-v2', 'rule-076-amendment', 'xor-join', 'wf-net']
};

async function seed() {
  const context = { isAdmin: true, createdBy: 'seed-flowdesk-chat-v2' };
  const { derivesFromPrinciple, ...nodeData } = RULE;
  const rule = await codexService.createNode('CodexRule', { ...nodeData, deonticState: 'ACTIVE' }, context);
  const id = rule.codexId || rule.properties?.codexId;
  console.log(`+ ${id}: ${nodeData.title}`);
  if (derivesFromPrinciple && id) {
    try { await codexService.linkRuleToPrinciple(id, derivesFromPrinciple, 1.0); console.log(`  -> DERIVES_FROM ${derivesFromPrinciple}`); }
    catch (err) { console.warn(`  Warning: ${err.message}`); }
  }
  return id;
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { seed, RULE };

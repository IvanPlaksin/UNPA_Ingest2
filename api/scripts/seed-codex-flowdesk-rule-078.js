/**
 * Seed CODEX-RULE-078 — transitive stale cascade (from Contract 2 finding).
 * Run: node api/scripts/seed-codex-flowdesk-rule-078.js
 */

const codexService = require('../src/services/codex/codex.service');

const RULE = {
  title: 'Stale Cascade Is Transitive Along dependsOn',
  summary: 'When a DraftSR slot changes, staleness MUST cascade transitively along dependsOn across successive patches. The UI MUST highlight the entire dependent chain as "needs re-confirmation", and submit MUST reject with INCOMPLETE.stale until the whole chain is cleared.',
  rationale: 'Contract 2 finding: assetType→justification→approverComment. Re-editing justification re-stales approverComment. Without transitive cascade + UI highlighting, submit loops on INCOMPLETE.stale and the user cannot tell which fields to fix.',
  whyItExists: 'DraftSR is the sole session-state carrier (RULE-075); its staleness semantics must be complete or the confirm/submit loop never converges.',
  examples: [
    'edit assetType → justification stale; edit justification → approverComment stale',
    'UI shows all downstream dependents as amber "re-confirm"; submit blocked until none stale'
  ],
  ruleKind: 'PRESCRIPTIVE',
  modality: 'MUST',
  scope: ['flowdesk', 'session', 'draft-sr'],
  derivesFromPrinciple: 'CODEX-PRINCIPLE-007',
  changeabilityTier: 'ADMIN_ONLY',
  tags: ['flowdesk', 'chat-v2', 'draft-sr', 'stale-cascade']
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

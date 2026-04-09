/**
 * Seed final Codex GXE rules from session analysis.
 *
 * Covers gaps discovered during graph debugging that aren't in GXE-001..034.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const RULES = [
  // ═══ Turn-based re-execution issues ═══
  {
    codexId: 'CODEX-RULE-GXE-035',
    title: 'Executor Pass-Through Must Preserve All Output Fields',
    summary: 'When an executor detects that data from a previous turn already exists (e.g., beneficiary_type in session), it MUST pass through ALL fields from the previous output, including branch, flags (different_location), and metadata. Dropping fields during pass-through causes downstream condition expressions to evaluate incorrectly.',
    modality: 'MUST',
    scope: ['gxe', 'flowdesk', 'runtime'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'ask_beneficiary pass-through returned {beneficiary_type: "self"} but dropped {different_location: true, branch: "different"}. Downstream N14 condition could not detect "different" path, routing to self_current instead of self_different.',
    examples: ['Pass-through: return {beneficiary_type, beneficiary, different_location, branch} — ALL fields', 'NEVER return only partial data from pass-through'],
    antiPatterns: ['Returning only beneficiary_type without branch/flags during pass-through', 'Assuming downstream only uses one field from the output']
  },

  // ═══ Session state persistence ═══
  {
    codexId: 'CODEX-RULE-GXE-036',
    title: 'Custom Confirm Actions Must Persist in Session State',
    summary: 'When flowdesk.confirm_request returns a custom action (not standard confirm/edit/cancel), the runtime MUST persist it in session state with a node-specific key (_action_NodeID). This enables pass-through on re-execution turns, preventing the node from re-prompting for already-answered choices.',
    modality: 'MUST',
    scope: ['gxe', 'flowdesk', 'runtime'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'N38 (Confirm Beneficiary Location) returned action "select different location" on T4, but on T5 re-execution N38 did not pass through — it prompted again because the action was not in session state.',
    examples: ['session.state._action_N38 = "select different location" → on next turn N38 pass-through with cached action'],
    antiPatterns: ['Only persisting standard confirmed/requestConfirmed flags', 'Losing custom choice actions between turns']
  },

  // ═══ Graph structure patterns ═══
  {
    codexId: 'CODEX-RULE-GXE-037',
    title: 'Other-Person Path Must Include Location Verification',
    summary: 'When a graph supports "request for another person" (beneficiary_type=other), the path MUST include: (1) find beneficiary, (2) check beneficiary location, (3) condition: has location? → confirm/change or select location. This ensures the service request has a valid delivery location for the other person.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'flowdesk'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Graph e28e578a initially went from find_user directly to service configuration, skipping location verification for the beneficiary. The service request had no delivery location for the other person.',
    examples: ['other path: N16(find user) → N18(found?) → N35(check loc) → N37(has loc?) → N38(confirm)/N39(select) → N23(config)'],
    antiPatterns: ['Skipping location check for other-person requests', 'Assuming beneficiary location is same as requester location']
  },

  {
    codexId: 'CODEX-RULE-GXE-038',
    title: 'Service Specification Node Must Precede Final Confirmation',
    summary: 'Executable service request graphs SHOULD include a specification/details node between service configuration and final confirmation. This allows users to provide additional details (model preferences, urgency, justification) relevant to the classified service type before the request is created.',
    modality: 'SHOULD',
    scope: ['gxe', 'graph-building', 'flowdesk'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Graph e28e578a went directly from classification to confirmation without asking for specifications. For IT-HW-LAP (laptop), users may need to specify preferred model, RAM, disk requirements.',
    examples: ['Flow: classify → config → N36(specification: Standard/Custom/Skip) → N24(final confirm)'],
    antiPatterns: ['Going from classification directly to "Create Request" without specification step']
  },

  // ═══ ai.generate context issues ═══
  {
    codexId: 'CODEX-RULE-GXE-039',
    title: 'AI Generate Nodes Must Include Session Context in Prompts',
    summary: 'When ai.generate is used in a dialog graph, the system_prompt and user_prompt MUST reference session state data using {{input.fieldName}} template format. Generic prompts like "configure service" without context produce irrelevant LLM responses that ask for information already collected.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Graph 4760a53b N19 (Service Configuration) had generic prompt without service_code/location. LLM asked "What service type?" even though IT-HW-LAP was already classified. Fix: user_prompt includes {{input.service_code}}, {{input.dutyStation}}.',
    examples: ['user_prompt: "Service: {{input.service_code}}, Location: {{input.dutyStation}}" — resolved by TemplateResolver'],
    antiPatterns: ['Generic ai.generate prompts in dialog graphs', 'Prompts that ask for data already in session state']
  },

  // ═══ Condition after choice nodes ═══
  {
    codexId: 'CODEX-RULE-GXE-040',
    title: 'Choice Nodes With Multiple Outcomes Must Be Followed By Condition',
    summary: 'When a confirm_request or similar executor offers choices that lead to different paths (e.g., "Use registered location" vs "Select different"), the node MUST be followed by a workflow.condition that routes based on the action/branch output. Without the condition, all choices lead to the same sequential path.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Graph e28e578a N38 (Confirm Beneficiary Location) offered "Use registered"/"Select different" but was directly connected to N23 without condition. Both choices went to same path. Fix: N40 condition after N38 routes to N23(confirmed) or N39(different).',
    examples: ['N38(choices) → N40(condition: N38.action) → confirmed→N23, different→N39'],
    antiPatterns: ['Choice node with sequential edge ignoring which choice was made', 'Multiple-choice node without downstream condition routing']
  },

  // ═══ Template resolution ═══
  {
    codexId: 'CODEX-RULE-GXE-041',
    title: 'Template References Must Use input.X Format for Session State',
    summary: 'Template references in node config (prompts, field mappings) that need session state data MUST use {{input.fieldName}} format. The TemplateResolver resolves input.X from ExecutionContext.initialInput (= session state). Bare {{fieldName}} resolves from variables only. NodeID.field resolves from node outputs.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Graph 4760a53b N19 user_prompt used {{service_code}} which did not resolve (not in variables). Changed to {{input.service_code}} which resolves from session state via ExecutionContext.initialInput.',
    examples: ['Session state: {{input.service_code}}, {{input.dutyStation}}', 'Node output: {{N06.confidence}}', 'Variables: {{myVariable}}'],
    antiPatterns: ['Using {{service_code}} when data is in session state (should be {{input.service_code}})', 'Confusing input.X (session) with NodeID.X (node output)']
  },
];

async function seed() {
  console.log('Seeding final session GXE rules...\n');
  let created = 0, skipped = 0;

  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const ex = await mg().runQuery('MATCH (r:CodexRule {codexId: $c}) RETURN r', { c: rule.codexId });
      if (ex.length > 0) { console.log('  SKIP', rule.codexId); skipped++; continue; }
      await mg().runQuery(
        'CREATE (r:CodexRule $props) WITH r MATCH (p:CodexPrinciple {codexId: $d}) CREATE (r)-[:DERIVES_FROM]->(p) RETURN r.codexId',
        { props: { id, codexId: rule.codexId, namespace: 'CODEX', nodeType: 'CodexRule', title: rule.title, summary: rule.summary, modality: rule.modality, scope: JSON.stringify(rule.scope), tier: 'M2', status: 'ACTIVE', rationale: rule.rationale, examples: JSON.stringify(rule.examples), antiPatterns: JSON.stringify(rule.antiPatterns), createdAt: now, updatedAt: now }, d: rule.derivesFrom }
      );
      console.log('  OK', rule.codexId, ':', rule.title);
      created++;
    } catch (e) { console.error('  ERR', rule.codexId, ':', e.message); }
  }
  console.log('\nResults:', created, 'created,', skipped, 'skipped');
  console.log('Total GXE rules:', 34 + created);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

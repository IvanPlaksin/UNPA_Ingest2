/**
 * Seed Codex Rules — FD-PORTAL-001 Post-Mortem (GXE-055..059)
 *
 * 5 rules derived from bugs found during FlowDesk Portal CaMeL integration
 * E2E testing (FD-PORTAL-001). Each rule captures a concrete failure mode
 * and its fix.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const RULES = [
  {
    codexId: 'CODEX-RULE-GXE-055',
    title: 'Executor Required Parameters Must Be Documented and Validated at Registration',
    summary: 'Every executor MUST declare all required parameters in its parameterSchema with correct types. Parameters that are REQUIRED (non-nullable, must be present) MUST be listed in the `required` array. Executors with undocumented required parameters will fail with cryptic EXECUTION_ERROR at runtime instead of a clear VALIDATE_INPUT failure.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'executors', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'FD-PORTAL-001 Issue 1: workflow.wait_input executor required a `recipients` array parameter but it was not in parameterSchema.required. When a graph node omitted it, the executor threw "Missing required parameter: recipients" inside the execute phase — appearing as EXECUTION_ERROR instead of VALIDATE_INPUT failure, making diagnosis difficult.',
    examples: [
      'CORRECT: parameterSchema = { type: "object", required: ["prompt", "recipients"], properties: { prompt: {type:"string"}, recipients: {type:"array"} } }',
      'WRONG: parameterSchema = { type: "object", properties: { prompt: {type:"string"}, recipients: {type:"array"} } } — no required array, NodeRunner cannot pre-validate',
      'Before registering executor: enumerate ALL parameters that cause throws if missing and add them to required[]'
    ],
    antiPatterns: [
      'Executor throws error for missing parameter inside execute() instead of declaring it in required[]',
      'parameterSchema with properties but no required array when some params are mandatory',
      'Validating required params inside executor logic instead of relying on NodeRunner pre-validation'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-056',
    title: 'WAIT_FOR_INPUT Response Must Preserve Accumulated State',
    summary: 'When NodeRunner wraps a legacy WAIT_FOR_INPUT executor result into legacyWaitContext, ALL fields from the executor result MUST be copied, including accumulated_state, choices, recommendation, and any domain-specific fields. Omitting fields silently drops multi-turn dialog state.',
    modality: 'MUST',
    scope: ['gxe', 'runtime', 'executors', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'FD-PORTAL-001 Issue 2: NodeRunner constructed legacyWaitContext from executor WAIT_FOR_INPUT result but omitted accumulated_state. On every subsequent turn, the dialog assistant received no prior state, restarting the Q&A from the beginning. Fix: legacyWaitContext must copy accumulated_state, choices, recommendation, and all domain fields from the executor result.',
    examples: [
      'CORRECT: legacyWaitContext = { resume_token, expected_inputs, recipients, prompt, choices: result.choices || null, accumulated_state: result.accumulated_state || null, response: result.response || result.prompt }',
      'WRONG: legacyWaitContext = { resume_token, expected_inputs, recipients, prompt } — drops choices and accumulated_state',
      'When adding new WAIT_FOR_INPUT fields to an executor: verify NodeRunner legacyWaitContext copies them'
    ],
    antiPatterns: [
      'legacyWaitContext constructed with hardcoded field list instead of spreading all executor result fields',
      'Assuming executor WAIT_FOR_INPUT result fields are passed through automatically without explicit copy'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-057',
    title: 'State Accumulation After Graph Execution Must Include Waiting Nodes',
    summary: 'After each graph execution turn, the caller MUST accumulate state from BOTH succeeded nodes (nodeResults) AND waiting nodes (waitingNodes). Waiting nodes are the primary carriers of dialog progress (accumulated_state, choices, prompt). Ignoring waitingNodes causes session state to reset on each turn.',
    modality: 'MUST',
    scope: ['gxe', 'runtime', 'camel', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'FD-PORTAL-001 Issue 3: camel-chat.service.js merged state only from result.nodeResults (SUCCEEDED). When L2-ASSISTANT paused via WAIT_FOR_INPUT, its accumulated_state was in result.waitingNodes — never merged. Dialog state reset every turn. Fix: add a second loop over result.waitingNodes to merge accumulated_state.',
    examples: [
      'CORRECT: for (const [,nr] of Object.entries(result.nodeResults||{})) { if (nr.status==="SUCCEEDED") merge(nr.output); } for (const [,wctx] of Object.entries(result.waitingNodes||{})) { if (wctx?.accumulated_state) merge(wctx.accumulated_state); }',
      'WRONG: only looping over nodeResults — misses all state from paused executors',
      'Pattern applies to any service that re-executes a graph per turn (CaMeL, chat gateways, webhooks)'
    ],
    antiPatterns: [
      'Accumulating session state only from SUCCEEDED nodes after a multi-turn graph execution',
      'Assuming waitingNodes carry no application state worth preserving'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-058',
    title: 'NLU Extracted Entities Must Not Auto-Populate Executor Dialog State',
    summary: 'In a CaMeL-protected pipeline, NLU-extracted entities from the initial user message MUST NOT be pre-populated into executor-controlled dialog state fields on first turn. Executors that own a multi-step dialog (e.g., a Q&A assistant) MUST start with a clean state and ask each question themselves, regardless of NLU pre-extraction.',
    modality: 'MUST',
    scope: ['camel', 'gxe', 'security', 'executors', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'FD-PORTAL-001 Issue 4: NLU extracted use_case="development" from the initial intent message. This was stored in session.state and injected into L2-ASSISTANT parameters. The executor saw use_case truthy and skipped the use_case Q&A step. Fix: on first turn (no prior stage), executor ignores all pre-populated dialog fields and starts from an empty state. Prevents NLU bias from corrupting structured dialog.',
    examples: [
      'CORRECT: const isFirstTurn = !parameters.stage; const state = { use_case: isFirstTurn ? null : parameters.use_case || null, ... };',
      'WRONG: const state = { use_case: parameters.use_case || null } — NLU value bypasses the dialog question',
      'CAMEL rule: CaMeL CONTROL layer may set routing/intent parameters, but executor-owned dialog state must be gated by first-turn check'
    ],
    antiPatterns: [
      'Injecting NLU entities directly into executor dialog state fields on first turn',
      'Dialog executor skipping questions because session.state was pre-populated by NLU',
      'No isFirstTurn guard in multi-step dialog executors that receive session state from caller'
    ]
  },
  {
    codexId: 'CODEX-RULE-GXE-059',
    title: 'Null Values Are Absent — Not a Type Mismatch',
    summary: 'In NodeRunner input validation, a field whose value is null MUST be treated as absent (not provided). Type checking MUST be skipped for null values. Only undefined AND null should be treated as "field not present". A null value for a string field must NOT produce a "expected string, got object" type error.',
    modality: 'MUST',
    scope: ['gxe', 'runtime', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'FD-PORTAL-001 Issue 5: NodeRunner._validateInput checked `input[field] !== undefined` before type checking, but did not exclude null. `typeof null === "object"`, causing `budget: null` to fail as "expected string, got object". This blocked L2-ASSISTANT from executing — the graph appeared to complete after WF-START with no error message. Fix: skip type check when value is null: `if (input[field] !== undefined && input[field] !== null && propSchema.type)`.',
    examples: [
      'CORRECT: if (input[field] !== undefined && input[field] !== null && propSchema.type) { /* type check */ }',
      'WRONG: if (input[field] !== undefined && propSchema.type) { /* type check */ } — typeof null === "object" triggers false type error',
      'Pattern: null means "not yet provided" in multi-turn dialog state; treat it as absent in validation'
    ],
    antiPatterns: [
      'Type-checking null values — typeof null === "object" is a JS quirk, not a type error',
      'Rejecting null for a string field with "expected string, got object"',
      'Treating null differently from undefined in "is field present" checks'
    ]
  }
];

async function seed() {
  console.log('Seeding FD-PORTAL-001 post-mortem Codex rules (GXE-055..059)...\n');
  let created = 0;
  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const ex = await mg().runQuery('MATCH (r:CodexRule {codexId: $c}) RETURN r', { c: rule.codexId });
      if (ex.length > 0) { console.log('  SKIP', rule.codexId); continue; }
      await mg().runQuery(
        `CREATE (r:CodexRule $props) WITH r MATCH (p:CodexPrinciple {codexId: $d}) CREATE (r)-[:DERIVES_FROM]->(p) RETURN r.codexId`,
        {
          props: {
            id,
            codexId: rule.codexId,
            namespace: 'Codex',
            nodeType: 'CodexRule',
            title: rule.title,
            summary: rule.summary,
            modality: rule.modality,
            scope: JSON.stringify(rule.scope),
            tier: 'M2',
            status: 'ACTIVE',
            rationale: rule.rationale,
            examples: JSON.stringify(rule.examples),
            antiPatterns: JSON.stringify(rule.antiPatterns),
            createdAt: now,
            updatedAt: now
          },
          d: rule.derivesFrom
        }
      );
      console.log('  OK', rule.codexId, ':', rule.title);
      created++;
    } catch (e) { console.error('  ERR', rule.codexId, ':', e.message); }
  }
  console.log(`\nDone. Created: ${created} / ${RULES.length}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

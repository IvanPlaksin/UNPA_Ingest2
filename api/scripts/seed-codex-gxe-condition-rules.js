/**
 * Seed Codex Rules — Condition Expression Correctness
 */
'use strict';

const { v4: uuidv4 } = require('uuid');
let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const RULES = [
  {
    codexId: 'CODEX-RULE-GXE-016',
    title: 'Condition Expressions Must Match Actual Executor Output Schema',
    summary: 'Condition node expressions MUST reference field names and values that exactly match the output schema of upstream executor nodes. Before writing an expression, the agent MUST inspect the actual output of the preceding executor to verify field names, value types, and casing.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Graph 96092967 condition N03 checked input.confidence_level (uppercase HIGH) but executor flowdesk.classify_intent returns confidence (lowercase high). This caused 95% confidence classification to be treated as failure.',
    examples: ['Executor returns {confidence: "high"} then expression: input.confidence === "high"', 'ALWAYS test: run executor then inspect output then write matching expression'],
    antiPatterns: ['Guessing field names without checking executor output', 'Assuming uppercase when executor returns lowercase']
  },
  {
    codexId: 'CODEX-RULE-GXE-017',
    title: 'Condition Expressions Should Be Defensively Written',
    summary: 'Condition expressions SHOULD include fallback checks for common variations: case differences, alternative field names, and type coercion. Use OR operator to handle multiple valid representations.',
    modality: 'SHOULD',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Different executors and user inputs may produce semantically identical but syntactically different values.',
    examples: ['input.confidence === "high" || input.score >= 0.6', 'input.action === "confirm" || input.confirmed === true'],
    antiPatterns: ['Single exact-match without fallbacks', 'Case-sensitive checks on user values']
  },
  {
    codexId: 'CODEX-RULE-GXE-018',
    title: 'Response Builder Must Deduplicate Output Text',
    summary: 'When building chat response from multiple executor outputs, the response builder MUST deduplicate text to prevent repeated messages. Each unique response text should appear only once.',
    modality: 'MUST',
    scope: ['gxe', 'flowdesk', 'code-quality'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'FlowDesk chat contained the same message 4 times due to response concatenation without deduplication.',
    examples: ['Use Set to deduplicate allResponses before joining', 'Check if response already in array before prepending'],
    antiPatterns: ['Concatenating without duplicate check', 'Joining response plus allResponses when response came from allResponses']
  }
];

async function seed() {
  console.log('Seeding GXE Condition Expression Rules...\n');
  let created = 0, skipped = 0;

  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const existing = await mg().runQuery('MATCH (r:CodexRule {codexId: $cid}) RETURN r', { cid: rule.codexId });
      if (existing.length > 0) { console.log('  SKIP', rule.codexId); skipped++; continue; }

      await mg().runQuery(`
        CREATE (r:CodexRule $props)
        WITH r
        MATCH (p:CodexPrinciple {codexId: $deriv})
        CREATE (r)-[:DERIVES_FROM]->(p)
        RETURN r.codexId
      `, {
        props: {
          id, codexId: rule.codexId, namespace: 'CODEX', nodeType: 'CodexRule',
          title: rule.title, summary: rule.summary, modality: rule.modality,
          scope: JSON.stringify(rule.scope), tier: 'M2', status: 'ACTIVE',
          rationale: rule.rationale,
          examples: JSON.stringify(rule.examples),
          antiPatterns: JSON.stringify(rule.antiPatterns),
          createdAt: now, updatedAt: now
        },
        deriv: rule.derivesFrom
      });
      console.log('  OK', rule.codexId, ':', rule.title);
      created++;
    } catch (e) { console.error('  ERR', rule.codexId, ':', e.message); }
  }
  console.log(`\nResults: ${created} created, ${skipped} skipped`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

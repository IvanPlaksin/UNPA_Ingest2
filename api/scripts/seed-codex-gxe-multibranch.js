/**
 * Seed Codex Rules — Multi-branch conditions and input node patterns
 */
'use strict';

const { v4: uuidv4 } = require('uuid');
let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const RULES = [
  {
    codexId: 'CODEX-RULE-GXE-022',
    title: 'Multi-Branch Conditions Must Use Named Labels',
    summary: 'Condition nodes with more than 2 outgoing edges MUST use named branch labels (e.g., "high", "medium", "low", "default") instead of just "true"/"false". The expression MUST return a string matching one of the edge labels. One edge SHOULD have label "default" as fallback.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Graph 4760a53b had N04 (Classification Confidence) with 4 outgoing edges but no labels. TopologicalScheduler could not route because true/false pattern does not cover multi-way branching.',
    examples: ['N04 expression returns "high"|"medium"|"low"|"default". Edges: N04->N09 label:"high", N04->N05 label:"medium", N04->N06 label:"low", N04->N07 label:"default"'],
    antiPatterns: ['Multi-branch condition with only true/false labels', 'Multi-branch without default fallback edge', '3+ edges with no labels at all']
  },
  {
    codexId: 'CODEX-RULE-GXE-023',
    title: 'User Input Nodes Must Use workflow.wait_input Not ai.generate',
    summary: 'Nodes whose purpose is to collect user text input (prompt + wait) MUST use workflow.wait_input executor, NOT ai.generate. ai.generate is for LLM processing. workflow.wait_input pauses execution and returns WAIT_FOR_INPUT status with prompt and choices.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Graph 4760a53b N02 (User Service Request) had config {prompt, inputType, timeoutMs} but was bound to ai.generate which requires {system_prompt, user_prompt}. This caused INVALID_INPUT error on first execution.',
    examples: ['User input node: tool=workflow.wait_input, config={prompt:"Describe your request", waitForInput:true}', 'LLM processing node: tool=ai.generate, config={system_prompt:"...", user_prompt:"..."}'],
    antiPatterns: ['Binding ai.generate to a node that just collects user input', 'Binding workflow.wait_input to a node that does LLM processing']
  },
  {
    codexId: 'CODEX-RULE-GXE-024',
    title: 'Multi-Branch Expression Must Return String Matching Edge Label',
    summary: 'When a condition has 3+ outgoing edges with named labels, the expression MUST return a string value that exactly matches one of the edge labels. Use ternary chains: expr ? "label1" : expr2 ? "label2" : "default". The returned string is matched case-insensitively against edge labels.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'TopologicalScheduler._matchBranchLabel() matches expression result string against edge label string. If expression returns boolean but edges have named labels, no match occurs and all branches are skipped.',
    examples: ['4-way: N03.score >= 0.85 ? "high" : N03.score >= 0.70 ? "medium" : N03.score >= 0.40 ? "low" : "default"', '3-way: N20.action === "confirm" ? "true" : N20.action === "edit" ? "edit" : "false"'],
    antiPatterns: ['Expression returning boolean for multi-branch condition', 'Expression returning value not matching any edge label']
  }
];

async function seed() {
  console.log('Seeding multi-branch Codex rules...\n');
  let created = 0;
  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const ex = await mg().runQuery('MATCH (r:CodexRule {codexId: $c}) RETURN r', { c: rule.codexId });
      if (ex.length > 0) { console.log('  SKIP', rule.codexId); continue; }
      await mg().runQuery(
        `CREATE (r:CodexRule $props) WITH r MATCH (p:CodexPrinciple {codexId: $d}) CREATE (r)-[:DERIVES_FROM]->(p) RETURN r.codexId`,
        { props: { id, codexId: rule.codexId, namespace: 'CODEX', nodeType: 'CodexRule', title: rule.title, summary: rule.summary, modality: rule.modality, scope: JSON.stringify(rule.scope), tier: 'M2', status: 'ACTIVE', rationale: rule.rationale, examples: JSON.stringify(rule.examples), antiPatterns: JSON.stringify(rule.antiPatterns), createdAt: now, updatedAt: now }, d: rule.derivesFrom }
      );
      console.log('  OK', rule.codexId, ':', rule.title);
      created++;
    } catch (e) { console.error('  ERR', rule.codexId, ':', e.message); }
  }
  console.log(`\nCreated: ${created}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

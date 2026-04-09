/**
 * Seed Knowledge Management Codex Rules
 * - KM-001: Internal Knowledge Priority
 * - KM-002: Search Before Action
 * - KM-003: Cite Knowledge Sources
 * - KM-004: English-Only Output
 * Also adds 'bootstrap' scope to core rules.
 */

const memgraph = require('../src/services/memgraph.service');

const KM_RULES = [
  {
    codexId: 'CODEX-RULE-KM-001',
    title: 'Internal Knowledge Priority',
    summary: 'Agents MUST query internal knowledge sources (Codex, Knowledge Base, BackLog) BEFORE using external sources. External sources are used only when internal sources are insufficient.',
    rationale: 'Internal KB contains validated, organization-specific knowledge more reliable than generic external sources.',
    modality: 'MUST',
    ruleKind: 'PRESCRIPTIVE',
    scope: '["agents","knowledge-management","bootstrap"]',
    derivesFrom: 'CODEX-PRINCIPLE-001'
  },
  {
    codexId: 'CODEX-RULE-KM-002',
    title: 'Search Before Action',
    summary: 'Before any significant action (creating, modifying, deciding), agents SHOULD search relevant knowledge sources to inform their approach.',
    rationale: 'Searching first prevents reinventing the wheel, ensures compliance with existing rules, and leverages organizational learning.',
    modality: 'SHOULD',
    ruleKind: 'PRESCRIPTIVE',
    scope: '["agents","knowledge-management","bootstrap"]',
    derivesFrom: 'CODEX-PRINCIPLE-002'
  },
  {
    codexId: 'CODEX-RULE-KM-003',
    title: 'Cite Knowledge Sources',
    summary: 'When using information from Codex or KB to inform a response or action, agents SHOULD cite the source (codexId, nodeId, or reference).',
    rationale: 'Citations enable traceability, allow humans to verify agent reasoning, and build institutional trust.',
    modality: 'SHOULD',
    ruleKind: 'PRESCRIPTIVE',
    scope: '["agents","knowledge-management"]',
    derivesFrom: 'CODEX-PRINCIPLE-004'
  },
  {
    codexId: 'CODEX-RULE-KM-004',
    title: 'English-Only Output',
    summary: 'All AI agent responses, knowledge base entries, task descriptions, backlog items, and any data written to the knowledge graph MUST be in English, regardless of the input language.',
    rationale: 'English as the canonical language ensures consistency across all agents, enables cross-agent collaboration, and maintains a single searchable knowledge base.',
    modality: 'MUST',
    ruleKind: 'PRESCRIPTIVE',
    scope: '["agents","knowledge-management","bootstrap"]',
    derivesFrom: 'CODEX-PRINCIPLE-007'
  }
];

async function seedKMRules() {
  console.log('Seeding Knowledge Management Codex rules...\n');

  let created = 0, skipped = 0;

  for (const rule of KM_RULES) {
    try {
      const existing = await memgraph.runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r', { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`   skip ${rule.codexId} (exists)`);
        skipped++;
        continue;
      }

      await memgraph.runQuery(`
        CREATE (r:CodexRule {
          codexId: $codexId, title: $title, summary: $summary, rationale: $rationale,
          modality: $modality, ruleKind: $ruleKind, scope: $scope,
          status: 'ACTIVE', changeabilityTier: 'STABLE', version: '1.0.0',
          namespace: 'Codex', nodeType: 'CodexRule',
          createdAt: $now, updatedAt: $now
        })
        RETURN r
      `, { ...rule, now: new Date().toISOString() });

      // Try linking to principle
      try {
        await memgraph.runQuery(`
          MATCH (r:CodexRule {codexId: $codexId})
          MATCH (p:CodexPrinciple {codexId: $derivesFrom})
          CREATE (r)-[:DERIVES_FROM]->(p)
        `, { codexId: rule.codexId, derivesFrom: rule.derivesFrom });
      } catch {}

      console.log(`   OK ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`   ERR ${rule.codexId}: ${err.message}`);
    }
  }

  console.log(`\nRules: ${created} created, ${skipped} skipped`);
}

async function addBootstrapScope() {
  console.log('\nAdding bootstrap scope to core rules...\n');

  const bootstrapIds = [
    'CODEX-RULE-TM-001',
    'CODEX-RULE-BL-002'
  ];

  for (const codexId of bootstrapIds) {
    try {
      const result = await memgraph.runQuery(
        'MATCH (n {codexId: $codexId}) WHERE n:CodexRule RETURN n.scope as scope', { codexId }
      );
      if (!result.length) {
        console.log(`   skip ${codexId} (not found)`);
        continue;
      }

      let scope = result[0].scope;
      if (typeof scope === 'string') {
        try { scope = JSON.parse(scope); } catch { scope = [scope]; }
      }
      if (!Array.isArray(scope)) scope = [];

      if (!scope.includes('bootstrap')) {
        scope.push('bootstrap');
        await memgraph.runQuery(
          'MATCH (n {codexId: $codexId}) SET n.scope = $scope',
          { codexId, scope: JSON.stringify(scope) }
        );
        console.log(`   OK ${codexId}: added bootstrap scope`);
      } else {
        console.log(`   skip ${codexId}: already has bootstrap`);
      }
    } catch (err) {
      console.error(`   ERR ${codexId}: ${err.message}`);
    }
  }
}

async function main() {
  await seedKMRules();
  await addBootstrapScope();
  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

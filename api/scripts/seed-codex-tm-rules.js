/**
 * Seed Task Management Codex Rules (TM1)
 * Rules governing BackLog provenance, execution records, and hierarchy.
 */

const memgraph = require('../src/services/memgraph.service');
// Memgraph uses runQuery, not query
const mgQuery = (cypher, params) => memgraph.runQuery(cypher, params);

const TM_RULES = [
  {
    codexId: 'CODEX-RULE-TM-001',
    title: 'Task Creation Must Include Source Attribution',
    summary: 'Every BackLogItem MUST include at least one SourceReference documenting where the knowledge for this task came from.',
    rationale: 'Provenance enables audit trail and knowledge lineage tracking. Without attribution, tasks become disconnected from the reasoning that created them.',
    modality: 'MUST',
    ruleKind: 'PRESCRIPTIVE',
    scope: ['backlog', 'provenance'],
    status: 'ACTIVE',
    changeabilityTier: 'STABLE',
    version: '1.0.0',
    derivesFrom: 'CODEX-PRINCIPLE-001'
  },
  {
    codexId: 'CODEX-RULE-TM-002',
    title: 'Execution Must Document Decisions',
    summary: 'Task execution MUST include at least one DecisionLog with rationale for significant implementation choices.',
    rationale: 'Decisions without rationale cannot be evaluated or improved. DecisionLog enables learning from past choices.',
    modality: 'MUST',
    ruleKind: 'PRESCRIPTIVE',
    scope: ['backlog', 'execution'],
    status: 'ACTIVE',
    changeabilityTier: 'STABLE',
    version: '1.0.0',
    derivesFrom: 'CODEX-PRINCIPLE-002'
  },
  {
    codexId: 'CODEX-RULE-TM-003',
    title: 'Task Split Requires Rationale',
    summary: 'Splitting a task into subtasks MUST include rationale of at least 20 characters explaining decomposition strategy.',
    rationale: 'Arbitrary decomposition leads to incoherent subtasks. Rationale ensures split is intentional and traceable.',
    modality: 'MUST',
    ruleKind: 'PRESCRIPTIVE',
    scope: ['backlog', 'hierarchy'],
    status: 'ACTIVE',
    changeabilityTier: 'STABLE',
    version: '1.0.0',
    derivesFrom: 'CODEX-PRINCIPLE-007'
  },
  {
    codexId: 'CODEX-RULE-TM-004',
    title: 'Impact Assessment for High-Priority Tasks',
    summary: 'P0_CRITICAL and P1_HIGH priority tasks SHOULD include ImpactAssessment with at least direct impacts documented.',
    rationale: 'High-priority changes carry higher risk. Impact assessment surfaces affected components before work begins.',
    modality: 'SHOULD',
    ruleKind: 'PRESCRIPTIVE',
    scope: ['backlog', 'impact'],
    status: 'ACTIVE',
    changeabilityTier: 'STABLE',
    version: '1.0.0',
    derivesFrom: 'CODEX-PRINCIPLE-003'
  },
  {
    codexId: 'CODEX-RULE-TM-005',
    title: 'Completed Tasks Must Have Structured Results',
    summary: 'Tasks in DONE status MUST have ExecutionRecord with filesCreated/filesModified and acceptance criteria verification.',
    rationale: 'Structured results enable automated verification, metrics collection, and knowledge transfer.',
    modality: 'MUST',
    ruleKind: 'PRESCRIPTIVE',
    scope: ['backlog', 'execution'],
    status: 'ACTIVE',
    changeabilityTier: 'STABLE',
    version: '1.0.0',
    derivesFrom: 'CODEX-PRINCIPLE-004'
  }
];

async function seedTMRules() {
  console.log('📋 Seeding Task Management Codex Rules...\n');

  let created = 0, skipped = 0;

  for (const rule of TM_RULES) {
    try {
      const existing = await mgQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r',
        { codexId: rule.codexId }
      );

      if (existing.records.length > 0) {
        console.log(`   ⏭️  ${rule.codexId} already exists`);
        skipped++;
        continue;
      }

      const scopeStr = JSON.stringify(rule.scope);
      await mgQuery(`
        CREATE (r:CodexRule {
          codexId: $codexId, title: $title, summary: $summary, rationale: $rationale,
          modality: $modality, ruleKind: $ruleKind, scope: $scope,
          status: $status, changeabilityTier: $changeabilityTier, version: $version,
          namespace: 'Codex', nodeType: 'CodexRule',
          createdAt: $now, updatedAt: $now
        })
        WITH r
        MATCH (p:CodexPrinciple {codexId: $derivesFrom})
        CREATE (r)-[:DERIVES_FROM]->(p)
        RETURN r
      `, {
        ...rule, scope: scopeStr, now: new Date().toISOString()
      });

      console.log(`   ✅ ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      // Try without DERIVES_FROM if principle doesn't exist
      try {
        const scopeStr = JSON.stringify(rule.scope);
        await mgQuery(`
          CREATE (r:CodexRule {
            codexId: $codexId, title: $title, summary: $summary, rationale: $rationale,
            modality: $modality, ruleKind: $ruleKind, scope: $scope,
            status: $status, changeabilityTier: $changeabilityTier, version: $version,
            namespace: 'Codex', nodeType: 'CodexRule',
            createdAt: $now, updatedAt: $now
          })
          RETURN r
        `, { ...rule, scope: scopeStr, now: new Date().toISOString() });

        console.log(`   ✅ ${rule.codexId}: ${rule.title} (no principle link)`);
        created++;
      } catch (err2) {
        console.error(`   ❌ ${rule.codexId}: ${err2.message}`);
      }
    }
  }

  console.log(`\n📊 Results: ${created} created, ${skipped} skipped`);
  console.log('✅ Task Management Codex Rules seeded!\n');
}

if (require.main === module) {
  seedTMRules()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seedTMRules, TM_RULES };

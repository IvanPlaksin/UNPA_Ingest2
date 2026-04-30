'use strict';
const { v4: uuidv4 } = require('uuid');

async function main() {
  const mg = require('./src/services/memgraph.service');
  const now = new Date().toISOString();
  const id = uuidv4();

  const rule = {
    id,
    codexId: 'CODEX-RULE-GXE-049',
    namespace: 'Codex',
    nodeType: 'CodexRule',
    title: 'Test Config Must Reference Validated DB Entities',
    summary: 'Graph node config values that reference database entities (userId, staffId, locationId) MUST reference entities that actually exist in the target database before execution. Test setups MUST seed required entities or use known-good IDs.',
    modality: 'MUST',
    scope: JSON.stringify(['gxe', 'testing', 'graph-construction']),
    rationale: 'Graph execution fails at runtime when config references non-existent DB entities. The error surfaces as EXECUTION_ERROR in AOPEGAdapter, masking the real root cause (missing test data). Developers waste time diagnosing executor failures instead of identifying test data gaps.',
    whyItExists: 'WS-TEST-002 (BACKLOG-0051): D1-PROFILE failed with EXECUTION_ERROR because config.user_id referenced a fictional test user ID that did not exist in Memgraph. Only maria.chen existed. Fix was to use a real ID — but the issue should be caught at graph creation, not at runtime.',
    examples: JSON.stringify([
      'VIOLATION: config: { user_id: "usr-test-002" } when DB only has Staff node "maria.chen" → EXECUTION_ERROR at runtime',
      'CORRECT: Run MATCH (u:Staff) RETURN u.id LIMIT 5 before building test graph, use returned ID',
      'CORRECT: Test setup script seeds "usr-test-002" as Staff node before test execution',
      'CORRECT: Use const realUserId = await getFirstStaffId(); in test config builder'
    ]),
    antiPatterns: JSON.stringify([
      'Copying user IDs directly from scenario specifications without DB verification',
      'Assuming test IDs like usr-test-001, test-user, user123 exist in DB',
      'Running graph tests against an empty or partially-seeded database'
    ]),
    derivesFrom: 'CODEX-PRINCIPLE-005',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    derivedFrom: 'DR-011, DR-012 from BACKLOG-0051 (WS-TEST-002 validation cycle)'
  };

  const scopeArr = JSON.parse(rule.scope);
  const examplesArr = JSON.parse(rule.examples);
  const antiPatternsArr = JSON.parse(rule.antiPatterns);

  const query = `
    CREATE (r:CodexRule {
      id: $id,
      codexId: $codexId,
      namespace: $namespace,
      nodeType: $nodeType,
      title: $title,
      summary: $summary,
      modality: $modality,
      scope: $scope,
      rationale: $rationale,
      whyItExists: $whyItExists,
      examples: $examples,
      antiPatterns: $antiPatterns,
      derivesFrom: $derivesFrom,
      status: $status,
      createdAt: $createdAt,
      updatedAt: $updatedAt,
      derivedFrom: $derivedFrom
    })
    RETURN r.codexId AS codexId, r.title AS title
  `;

  const result = await mg.executeQuery(query, {
    id: rule.id,
    codexId: rule.codexId,
    namespace: rule.namespace,
    nodeType: rule.nodeType,
    title: rule.title,
    summary: rule.summary,
    modality: rule.modality,
    scope: scopeArr,
    rationale: rule.rationale,
    whyItExists: rule.whyItExists,
    examples: examplesArr,
    antiPatterns: antiPatternsArr,
    derivesFrom: rule.derivesFrom,
    status: rule.status,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    derivedFrom: rule.derivedFrom
  });

  console.log('Created:', result.records[0]?.get('codexId'), '—', result.records[0]?.get('title'));
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });

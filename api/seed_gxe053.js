'use strict';
const { v4: uuidv4 } = require('uuid');

async function main() {
  const mg = require('./src/services/memgraph.service');
  const now = new Date().toISOString();

  const query = `
    CREATE (r:CodexRule {
      id: $id, codexId: $codexId, namespace: $namespace, nodeType: $nodeType,
      title: $title, summary: $summary, modality: $modality, scope: $scope,
      rationale: $rationale, whyItExists: $whyItExists, examples: $examples,
      antiPatterns: $antiPatterns, derivesFrom: $derivesFrom, status: $status,
      createdAt: $createdAt, updatedAt: $updatedAt, derivedFrom: $derivedFrom
    })
    RETURN r.codexId AS codexId, r.title AS title
  `;

  const result = await mg.executeQuery(query, {
    id: uuidv4(),
    codexId: 'CODEX-RULE-GXE-053',
    namespace: 'Codex',
    nodeType: 'CodexRule',
    title: 'Branch Label Matching MUST Use Exact Match, Not Substring',
    summary: 'TopologicalScheduler branch label matching MUST use exact string equality and boolean synonym lookup — never substring/includes matching. Substring matching causes silent false-positive branch activation when one label contains another as a substring.',
    modality: 'MUST',
    scope: ['gxe', 'runtime', 'conditional-branching'],
    rationale: 'Substring match "not_found".includes("found") === true causes edge label "not_found" to incorrectly activate when the executor returns branch="found". This is a silent logic error: the wrong branch path executes, corrupting execution flow with no error thrown. No legitimate use case requires substring matching that exact match + boolean synonym lookup does not already cover.',
    whyItExists: 'WS-TEST-002-FIX (DR-018/DR-019): D6-SEARCHLOC returned branch="found" (Geneva), but D6a-ASKLOC (connected via edge label "not_found") was also activated because _matchBranchLabel used `label.includes(result)` which evaluated "not_found".includes("found") as true. Fix: removed substring match from TopologicalScheduler._matchBranchLabel.',
    examples: [
      'VIOLATION: "not_found".includes("found") === true → D6a-ASKLOC activates when branch="found" (wrong!)',
      'VIOLATION: "EXECUTION_ERROR".includes("error") === true → error handler activates on success branch',
      'CORRECT: Exact match "found" === "found" → true; "not_found" === "found" → false',
      'CORRECT: Boolean synonym "found" ∈ TRUE_LABELS → matches result="true"; does NOT match result="not_found"'
    ],
    antiPatterns: [
      'Using label.includes(result) or result.includes(label) for branch routing',
      'Trusting partial string overlap to detect semantic equivalence in branch labels',
      'Adding edge labels that are substrings of other labels in the same graph (e.g., "found" and "not_found" without this bug fixed)'
    ],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    derivedFrom: 'DR-019 (runtime bug fix) from WS-TEST-002-FIX, confirmed via Scenario B test',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  });

  console.log('Created:', result.records[0]?.get('codexId'), '—', result.records[0]?.get('title'));
  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });

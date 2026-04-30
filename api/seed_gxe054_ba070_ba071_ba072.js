'use strict';
const { v4: uuidv4 } = require('uuid');

async function main() {
  const mg = require('./src/services/memgraph.service');
  const now = new Date().toISOString();

  const rules = [
    {
      id: uuidv4(),
      codexId: 'CODEX-RULE-GXE-054',
      namespace: 'Codex',
      nodeType: 'CodexRule',
      title: 'Dead Branch Values Are Requirement Gaps',
      summary: 'If an executor CAN return a branch value, the graph MUST route on it with a labeled edge OR explicitly document discard with rationale. Unrouted branch values are blocking implementation gaps, not design choices.',
      modality: 'MUST',
      scope: JSON.stringify(['gxe', 'graph-construction', 'conditional-branching']),
      rationale: 'Branch values represent business logic decisions. Computing them without routing means the decision is made but ignored — this is silent requirement reduction. Pattern observed in WS-TEST-002 where D3-BENEFICIARY returned branch="other" and D6-SEARCHLOC returned branch="not_found" but neither had downstream routing edges.',
      whyItExists: 'Root cause from WS-TEST-002 DR-008 error analysis: "compute without route" antipattern where executor outputs were silently dropped because no labeled edges existed to handle them.',
      examples: JSON.stringify([
        'VIOLATION: D6-SEARCHLOC returns branch="not_found" → no edge handles it → graph continues with invalid state → SR created with null location',
        'CORRECT: D6-SEARCHLOC branch="not_found" → labeled edge "not_found" → D6a-ASK_LOCATION node (retry with user input)',
        'CORRECT (discard): node returns branch="skip" → documented in config: discardBranches=["skip"], rationale="skip branch only occurs in test mode"',
      ]),
      antiPatterns: JSON.stringify([
        'Executor returns branch value but graph has no labeled outgoing edge for that value',
        'branch="error" silently dropped → execution continues as if no error occurred',
        'branch="not_found" unhandled → downstream nodes receive null/undefined data',
        'Hardcoding values (e.g., approvalRequired=true) instead of routing on dynamic branch output',
      ]),
      derivesFrom: 'CODEX-PRINCIPLE-001',
      derivedFrom: 'WS-TEST-002 Problems B, C; DR-008 error analysis; "compute without route" antipattern',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      codexId: 'CODEX-RULE-BA-070',
      namespace: 'Codex',
      nodeType: 'CodexRule',
      title: 'Graph Must Implement Full Scenario Requirements',
      summary: 'When scenario specification contains conditional logic (if/then/else, when/unless, based on), the graph MUST implement ALL branches as executable paths. Linear DAG is acceptable ONLY when scenario has no conditional requirements.',
      modality: 'MUST',
      scope: JSON.stringify(['backlog', 'graph-construction', 'execution']),
      rationale: 'First-pass graph implementations tend toward happy-path. Conditional requirements in scenarios map directly to workflow.condition nodes and labeled edges. Simplifying to linear DAG silently drops business logic that is required for correctness.',
      whyItExists: 'WS-TEST-002 DR-008: scenario required "if contractor → require sponsor" and "if not_found → ask location", but graph v1/v2 was linear, ignoring both conditions. Only corrected in FIX cycle after explicit review.',
      examples: JSON.stringify([
        'VIOLATION: Scenario "If contractor → require sponsor". Graph: linear DAG, no sponsor collection, approvalRequired hardcoded=true',
        'CORRECT: Scenario "If contractor → require sponsor". Graph: workflow.condition on beneficiary_type, [other]→D3a-SPONSOR, [self]→skip',
        'ACCEPTABLE linear: Scenario with no if/when/unless/based-on → linear DAG is valid',
      ]),
      antiPatterns: JSON.stringify([
        'Conditional scenario requirement → linear DAG "for simplicity"',
        'Using hardcoded values instead of computing from executor output',
        'Marking task DONE when only happy-path is implemented',
        'Interpreting "no merge-nodes" (CODEX-RULE-037) as "no conditional branching" (they are different constructs)',
      ]),
      derivesFrom: 'CODEX-PRINCIPLE-001',
      derivedFrom: 'WS-TEST-002 DR-008 pattern analysis; first-pass happy-path tendency',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      codexId: 'CODEX-RULE-BA-071',
      namespace: 'Codex',
      nodeType: 'CodexRule',
      title: 'No Silent Requirement Reduction',
      summary: 'Agent MUST NOT simplify, defer, or omit scenario requirements without explicit documentation. If requirement cannot be implemented: (a) record Decision Journal entry with category=REQUIREMENT_GAP, (b) propose alternative, (c) await approval.',
      modality: 'MUST',
      scope: JSON.stringify(['backlog', 'execution', 'decision-journal']),
      rationale: 'Silent requirement reduction creates false completion — task appears done but requirements not met. This is harder to detect than an outright failure because the system runs without errors while implementing incorrect behavior.',
      whyItExists: 'WS-TEST-002 critical review pattern: conditional requirements were silently dropped in favor of linear flow. No DR entry documented the omission. Task appeared complete based on test passing (test data matched happy path), but business logic was absent.',
      examples: JSON.stringify([
        'VIOLATION: Requirement "handle not_found with location retry". Implementation: not_found computed, no routing, no documentation of omission. Test passes because test data always returns "found".',
        'CORRECT: If cannot implement retry loop → DR entry: {category: "REQUIREMENT_GAP", decision: "deferring not_found retry to phase 2", rationale: "...", linkedDecision: "DR-XXX"}. Then propose alternative and await approval.',
        'CORRECT: Requirement reduced in scope → BackLog card updated with note, acceptance criteria revised, stakeholder notified.',
      ]),
      antiPatterns: JSON.stringify([
        'Implementing subset of requirements without noting what was omitted',
        'Writing tests that only cover happy path when requirements specify error/edge cases',
        'Marking task IN_REVIEW when known gaps exist without documenting them',
        'Rationalizing omission as "out of scope" without evidence from requirements',
      ]),
      derivesFrom: 'CODEX-PRINCIPLE-001',
      derivedFrom: 'WS-TEST-002 critical review; silent requirement reduction pattern',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      codexId: 'CODEX-RULE-BA-072',
      namespace: 'Codex',
      nodeType: 'CodexRule',
      title: 'Pre-Execution Branch Routing Checklist',
      summary: 'Before submitting graph for execution test, agent MUST complete branch routing checklist: for each node that CAN return branch value, document possible branches, routing targets, and unexpected-branch handler.',
      modality: 'MUST',
      scope: JSON.stringify(['backlog', 'graph-construction', 'execution']),
      rationale: 'Forces explicit verification that branch logic is complete before testing, catching "compute without route" errors at design time rather than after test failure. Checklist takes <5 minutes and prevents costly fix cycles.',
      whyItExists: 'WS-TEST-002 required a full FIX cycle (graph v3, new executors, runtime bug fix) that could have been avoided if a pre-execution routing checklist had been performed on v1.',
      examples: JSON.stringify([
        'Checklist entry: {nodeId: "D6-SEARCHLOC", possibleBranches: ["found","not_found","multiple"], routing: {"found":"C-APPROVAL","not_found":"D6a-ASKLOC","multiple":"C-APPROVAL"}, unexpected: "EXECUTION_ERROR→WF-END"}',
        'VIOLATION: Submitting graph without checklist → D6 not_found has no routing → found in test → entire FIX cycle required',
        'CHECKLIST TEMPLATE: node:{id} | branches:[{values}] | each routes to:{target} | if unexpected:{fallback}',
      ]),
      antiPatterns: JSON.stringify([
        'Submitting graph for test without verifying all branch values have downstream routes',
        'Only checking "happy path" branches (e.g., found, confirmed, approved) and ignoring error/not_found/cancelled',
        'Assuming test will catch missing routing (tests only catch what they test)',
      ]),
      derivesFrom: 'CODEX-PRINCIPLE-002',
      derivedFrom: 'WS-TEST-002-FIX prevention protocol; post-mortem from DR-008 error analysis',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  for (const rule of rules) {
    const query = `
      CREATE (r:CodexRule {
        id: $id, codexId: $codexId, namespace: $namespace, nodeType: $nodeType,
        title: $title, summary: $summary, modality: $modality, scope: $scope,
        rationale: $rationale, whyItExists: $whyItExists, examples: $examples,
        antiPatterns: $antiPatterns, derivesFrom: $derivesFrom, derivedFrom: $derivedFrom,
        status: $status, createdAt: $createdAt, updatedAt: $updatedAt
      })
      RETURN r.codexId AS codexId, r.title AS title
    `;
    const result = await mg.executeQuery(query, rule);
    console.log('Created:', result.records[0]?.get('codexId'), '—', result.records[0]?.get('title'));
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });

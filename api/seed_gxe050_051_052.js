'use strict';
const { v4: uuidv4 } = require('uuid');

async function main() {
  const mg = require('./src/services/memgraph.service');
  const now = new Date().toISOString();

  const rules = [
    {
      id: uuidv4(),
      codexId: 'CODEX-RULE-GXE-050',
      namespace: 'Codex',
      nodeType: 'CodexRule',
      title: 'workflow.condition Is Not a Merge-Node',
      summary: 'CODEX-RULE-037 (no merge-nodes) does NOT prohibit workflow.condition for conditional branching. Diverge-converge patterns using workflow.condition are legal and required for conditional business logic. Only mid-graph convergence of independently-started paths causes skip-cascades.',
      modality: 'MUST',
      scope: ['gxe', 'graph-construction', 'conditional-branching'],
      rationale: 'CODEX-RULE-037 prohibits merge-nodes because converging paths cause TopologicalScheduler skip-cascades. workflow.condition creates divergent paths (one condition node → multiple branches) which is architecturally distinct from a merge (multiple paths → one node). Conflating the two leads to graphs that compute branch values but cannot route on them.',
      whyItExists: 'WS-TEST-002 (BACKLOG-0051) DR-008: Claude Code interpreted CODEX-RULE-037 as prohibiting all conditional structures including workflow.condition. This caused the security badge graph to be built as a linear DAG where branch values (other, not_found, approved) are computed by executors but never used for routing. The misinterpretation is a systemic risk for all future graph builds.',
      examples: [
        'VIOLATION: Building linear DAG when scenario spec says "if contractor → require sponsor" — all branch values computed but ignored',
        'VIOLATION: Removing workflow.condition nodes because CODEX-RULE-037 says "no merge-nodes"',
        'CORRECT: workflow.condition node with two outgoing edges (contractor_path, staff_path) — diverging, not merging',
        'CORRECT: Both conditional paths converge to a shared confirm node ONLY IF they do not share intermediate nodes'
      ],
      antiPatterns: [
        'Linear DAG that hardcodes values which should be computed from conditional branching',
        'Citing CODEX-RULE-037 as justification for removing workflow.condition',
        'Graph where executor returns branch value but no downstream node consumes it'
      ],
      derivesFrom: 'CODEX-PRINCIPLE-004',
      derivedFrom: 'DR-008 misinterpretation in BACKLOG-0051 (WS-TEST-002)',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuidv4(),
      codexId: 'CODEX-RULE-GXE-051',
      namespace: 'Codex',
      nodeType: 'CodexRule',
      title: 'Branch Values MUST Route or Be Removed',
      summary: 'If an executor returns a branch value (e.g. branch: "contractor", branch: "not_found"), a downstream workflow.condition node MUST consume that branch value for routing. Dead branch values — computed but not routed — indicate missing conditional logic and MUST be treated as a graph construction error.',
      modality: 'MUST',
      scope: ['gxe', 'graph-construction', 'conditional-branching'],
      rationale: 'Branch values are signals from executors expressing the outcome of a decision (user type, lookup result, approval decision). If no routing occurs on these signals, the graph ignores real world state and continues on a fixed path regardless of inputs. This produces incorrect results silently — SR/WO are created with wrong data, approvals are bypassed, error states are ignored.',
      whyItExists: 'WS-TEST-002: D3-BENEFICIARY returned branch="other", D6-SEARCHLOC returned branch="not_found", D7-APPROVAL returned branch="approved" — none of these caused routing. The linear DAG continued regardless of these signals. D9-SR was created with hardcoded approvalRequired=true and no location, producing a corrupt SR.',
      examples: [
        'VIOLATION: flowdesk.ask_beneficiary returns branch="other" but no workflow.condition follows — beneficiary type ignored',
        'VIOLATION: flowdesk.search_location returns branch="not_found" — execution continues, SR created without valid location',
        'CORRECT: After flowdesk.classify_intent → workflow.condition with edges labeled "high_confidence", "low_confidence", "unrecognized"',
        'CORRECT: After flowdesk.search_location → workflow.condition: found→proceed, not_found→WAIT_FOR_INPUT for location clarification'
      ],
      antiPatterns: [
        'Graph where all executors return branch values but no workflow.condition node exists',
        'Treating branch values as informational metadata rather than routing signals',
        'Hardcoding downstream values instead of routing on executor-computed branch'
      ],
      derivesFrom: 'CODEX-PRINCIPLE-004',
      derivedFrom: 'WS-TEST-002 problems B and C (BACKLOG-0051)',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    },
    {
      id: uuidv4(),
      codexId: 'CODEX-RULE-GXE-052',
      namespace: 'Codex',
      nodeType: 'CodexRule',
      title: 'Error and Not-Found Branches MUST NOT Be Silently Ignored',
      summary: 'When an executor returns an error branch (not_found, error, failed, unresolved), the graph MUST route to an explicit error-handling path: either WAIT_FOR_INPUT for user correction, or a graceful failure node. Continuing execution on a not_found/error branch as if it were a success branch is prohibited.',
      modality: 'MUST',
      scope: ['gxe', 'graph-construction', 'error-handling'],
      rationale: 'Silent continuation after an error branch produces corrupt downstream state: SR/WO created without required fields, notifications sent with wrong data, approvals processed for non-existent resources. These are hard to detect because the graph status is COMPLETED — no exception is thrown, all nodes execute, but the data is wrong.',
      whyItExists: 'WS-TEST-002: D6-SEARCHLOC returned branch="not_found" (UNON building not in DB). The linear DAG continued to D7-APPROVAL and D9-SR. SR-8EB5BD41 was created with no valid location. This is a silent data corruption — the graph reported COMPLETED with SR created, but the SR is invalid.',
      examples: [
        'VIOLATION: flowdesk.find_user returns branch="not_found" → graph continues to create_service_request with undefined beneficiary',
        'VIOLATION: flowdesk.search_location returns branch="not_found" → graph continues, SR created without location',
        'CORRECT: flowdesk.search_location not_found → workflow.condition → WAIT_FOR_INPUT node: "I could not find that building. Please specify another location."',
        'CORRECT: flowdesk.find_user not_found → workflow.condition → error node with message: "User not found. Request cannot proceed."'
      ],
      antiPatterns: [
        'Linear DAG that continues past not_found/error executor results',
        'Hardcoding fallback values (e.g., location=null, approvalRequired=true) to allow continuation after not_found',
        'Treating all executor outputs as success regardless of branch value'
      ],
      derivesFrom: 'CODEX-PRINCIPLE-004',
      derivedFrom: 'WS-TEST-002 problem C — D6-SEARCHLOC not_found ignored (BACKLOG-0051)',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now
    }
  ];

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

  for (const rule of rules) {
    const result = await mg.executeQuery(query, {
      id: rule.id,
      codexId: rule.codexId,
      namespace: rule.namespace,
      nodeType: rule.nodeType,
      title: rule.title,
      summary: rule.summary,
      modality: rule.modality,
      scope: rule.scope,
      rationale: rule.rationale,
      whyItExists: rule.whyItExists,
      examples: rule.examples,
      antiPatterns: rule.antiPatterns,
      derivesFrom: rule.derivesFrom,
      status: rule.status,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
      derivedFrom: rule.derivedFrom
    });
    console.log('Created:', result.records[0]?.get('codexId'), '—', result.records[0]?.get('title'));
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });

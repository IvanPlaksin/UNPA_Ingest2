/**
 * Seed Codex Rules — BackLog Agent Workflow Rules
 *
 * Comprehensive rules for all AI agent profiles working with BackLog:
 * - Task Creator Agent
 * - Task Executor Agent
 * - Reviewer Agent
 * - Efficiency Analyzer Agent
 * - Session Manager
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const BACKLOG_AGENT_RULES = [
  // ============================================================
  // GENERAL (all agents)
  // ============================================================
  {
    codexId: 'CODEX-RULE-BA-001',
    title: 'BackLog Agent Communication Language',
    summary: 'All AI agents MUST write task descriptions, memory entries, plans, reviews, and recommendations in English regardless of input language. This ensures consistent searchability and cross-agent comprehension.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Multilingual entries fragment search and prevent cross-agent knowledge transfer.',
    examples: ['User asks in Russian → agent creates task in English', 'Memory entry reasoning always in English'],
    antiPatterns: ['Mixing languages in task description', 'Writing memory entries in user input language']
  },
  {
    codexId: 'CODEX-RULE-BA-002',
    title: 'BackLog Agent Must Search Before Creating',
    summary: 'Before creating a new BackLog task, agents MUST search existing tasks (backlog_list_tasks) to prevent duplicates. If a similar task exists, agent SHOULD add information to existing task instead of creating new one.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'task-creation', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Duplicate tasks fragment work and waste resources. Consolidation preserves context.',
    examples: ['backlog_list_tasks({tags:["flowdesk","approval"]}) → found BACKLOG-0023 → add source instead of new task'],
    antiPatterns: ['Creating task without checking backlog first', 'Creating duplicate with slightly different title']
  },
  {
    codexId: 'CODEX-RULE-BA-003',
    title: 'BackLog Agent Namespace Assignment',
    summary: 'Every BackLog task MUST be assigned to the correct namespace based on domain: FLOWDESK (service desk workflows), GXE (graph execution engine), CODEX (rules and governance), CORE (platform infrastructure). Tags and targetPath determine namespace automatically.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'task-creation'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Namespace separation enables domain-specific ranking, filtering, and responsibility assignment.',
    examples: ['Tags contain "flowdesk" → namespace FLOWDESK', 'targetPath contains "gxe" → namespace GXE'],
    antiPatterns: ['Leaving namespace as CORE for domain-specific tasks', 'Mixing domain concerns in one task']
  },

  // ============================================================
  // TASK CREATOR AGENT
  // ============================================================
  {
    codexId: 'CODEX-RULE-BA-010',
    title: 'Task Creator Must Provide Complete Specification',
    summary: 'When creating a BackLog task, the Creator Agent MUST provide: title (>10 chars), description (>20 chars, with business context), taskType, targetType, at least 2 acceptance criteria, priority, effort estimate, and relevant tags.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'task-creation'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Incomplete specs cause executor agents to make assumptions, leading to review failures and wasted iterations.',
    examples: ['title: "Implement SLA escalation executor", description: includes business context + expected behavior + integration points, acceptanceCriteria: ["Executor reads timeout from graph params", "Logs escalation event", "Unit tests pass"]'],
    antiPatterns: ['Single acceptance criterion', 'Description without business context', 'Missing effort estimate']
  },
  {
    codexId: 'CODEX-RULE-BA-011',
    title: 'Task Creator Must Link Sources',
    summary: 'Creator Agent SHOULD link SourceReferences to new tasks: related Codex rules, BlackCodex entries, audit findings, or conversation context that triggered the task.',
    modality: 'SHOULD',
    scope: ['backlog', 'agents', 'task-creation', 'provenance'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'Source links enable traceability and help executor agents understand the full context.',
    examples: ['relatedCodexRules: ["CODEX-RULE-FD-004"] when task addresses audit compliance'],
    antiPatterns: ['Creating task without any source references']
  },
  {
    codexId: 'CODEX-RULE-BA-012',
    title: 'Task Creator May Split Complex Tasks',
    summary: 'When a task has effort L or XL, or complexity score >7, Creator Agent SHOULD consider splitting into subtasks using cycle.split_task. Split rationale MUST be recorded (CODEX-RULE-TM-003).',
    modality: 'SHOULD',
    scope: ['backlog', 'agents', 'task-creation', 'hierarchy'],
    derivesFrom: 'CODEX-PRINCIPLE-005',
    rationale: 'Smaller tasks are easier to review, execute, and track. Large tasks often fail review.',
    examples: ['Effort XL → split BY_COMPONENT into 3-4 subtasks with DEPENDS_ON chain'],
    antiPatterns: ['Leaving XL tasks unsplit', 'Splitting into >6 subtasks (too granular)']
  },

  // ============================================================
  // TASK EXECUTOR AGENT
  // ============================================================
  {
    codexId: 'CODEX-RULE-BA-020',
    title: 'Executor Must Start Execution Cycle',
    summary: 'Before working on any task, Executor Agent MUST start an execution cycle (cycle.start) with appropriate mode. AUTONOMOUS for routine tasks (P2/P3, effort XS/S). PLANNING for critical or complex tasks (P0/P1, effort L/XL). See CODEX-RULE-EC-005.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Cycles provide audit trail, enable review, and prevent untracked changes.',
    examples: ['cycle.start(backlogId, {mode: "PLANNING"}) → submit plan → wait approval → execute'],
    antiPatterns: ['Making code changes without starting a cycle', 'Using AUTONOMOUS for P0 tasks']
  },
  {
    codexId: 'CODEX-RULE-BA-021',
    title: 'Executor Must Create Plan Before Execution',
    summary: 'Executor Agent MUST submit a plan (cycle.submit_plan) with concrete ordered steps BEFORE making any changes. Plan must reference acceptance criteria and estimated approach for each. See CODEX-RULE-EC-001.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Plans enable review before work begins, reducing wasted effort on wrong approach.',
    examples: ['Steps: [1. Analyze existing code, 2. Implement changes, 3. Write tests, 4. Verify acceptance criteria]'],
    antiPatterns: ['Plan with single step "implement feature"', 'Executing before plan is approved']
  },
  {
    codexId: 'CODEX-RULE-BA-022',
    title: 'Executor Must Record Decisions in Memory',
    summary: 'During execution, Executor Agent MUST record every significant decision as AgentMemoryEntry with type DECISION and reasoning field. Findings, steps completed, and errors SHOULD also be recorded.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Memory entries enable reviewer to assess decision quality and provide the audit trail for future reference.',
    examples: ['cycle.add_memory({entryType:"DECISION", content:"Using EventEmitter for SSE", reasoning:"Lighter than WebSocket for one-way updates"})'],
    antiPatterns: ['Empty reasoning field on DECISION entries', 'No memory entries during execution']
  },
  {
    codexId: 'CODEX-RULE-BA-023',
    title: 'Executor Must Submit for Review',
    summary: 'After completing execution, Executor Agent MUST transition cycle to REVIEW phase (cycle.transition(cycleId, "REVIEW")). Agent MUST NOT mark task as DONE without cross-review.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Cross-review catches issues the executor agent may miss. Skipping review reduces quality.',
    examples: ['After all changes made → cycle.transition(cycleId, "REVIEW") → reviewer agent evaluates'],
    antiPatterns: ['Marking task DONE without review', 'Skipping review for "simple" tasks']
  },
  {
    codexId: 'CODEX-RULE-BA-024',
    title: 'Executor Must Address Review Recommendations',
    summary: 'When a cycle is REJECTED, Executor Agent MUST read reviewer recommendations from the previous cycle and address each one in the new iteration plan. See CODEX-RULE-EC-004.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control'],
    derivesFrom: 'CODEX-PRINCIPLE-005',
    rationale: 'Ignoring recommendations leads to repeated rejections and wasted tokens.',
    examples: ['New cycle plan step: "Address recommendation: add unit tests for error handling"'],
    antiPatterns: ['Submitting same plan after rejection', 'Ignoring specific recommendations']
  },

  // ============================================================
  // REVIEWER AGENT
  // ============================================================
  {
    codexId: 'CODEX-RULE-BA-030',
    title: 'Reviewer Must Evaluate All Checklist Items',
    summary: 'Reviewer Agent MUST evaluate all 6 checklist items: Plan Completeness, Decision Quality, Codex Compliance, Risk Assessment, Implementation Quality, Test Coverage. See CODEX-RULE-EC-003.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'review'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Incomplete reviews miss critical issues. Structured checklist ensures consistency.',
    examples: ['cycle.submit_review with strengths, weaknesses, AND recommendations for each failed item'],
    antiPatterns: ['Review with just verdict and no analysis', 'Skipping Codex compliance check']
  },
  {
    codexId: 'CODEX-RULE-BA-031',
    title: 'Reviewer Must Be Objective and Specific',
    summary: 'Reviewer Agent MUST provide specific, actionable feedback. Recommendations MUST describe exactly what to change, not vague improvement suggestions. Reviewer MUST NOT approve work that violates Codex rules.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'review'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Vague recommendations waste executor time. Specific feedback enables direct action.',
    examples: ['"Add try/catch in processApproval() for DB connection failure" NOT "improve error handling"'],
    antiPatterns: ['Recommendation: "improve code quality"', 'Approving task that misses acceptance criteria']
  },
  {
    codexId: 'CODEX-RULE-BA-032',
    title: 'Reviewer Verdict Criteria',
    summary: 'APPROVED: all acceptance criteria met, decisions well-reasoned, no Codex violations. NEEDS_REVISION: mostly correct, 1-2 minor items fixable without rework. REJECTED: misses criteria, flawed approach, Codex violations, needs fundamental rework.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'review', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Clear criteria prevent inconsistent verdicts across review sessions.',
    examples: ['All criteria met + good reasoning → APPROVED', 'Missing one test → NEEDS_REVISION', 'Wrong architecture → REJECTED'],
    antiPatterns: ['APPROVED with unmet criteria', 'REJECTED for style preferences']
  },

  // ============================================================
  // EFFICIENCY ANALYZER AGENT
  // ============================================================
  {
    codexId: 'CODEX-RULE-BA-040',
    title: 'Efficiency Analysis Must Consider All Metrics',
    summary: 'Efficiency Analyzer MUST consider: token usage vs complexity, iteration count, decision quality ratio, review pass rate, and time metrics. Recommendations MUST specify type (PROCESS/PROMPT/MODEL/QUALITY) and priority.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'analytics'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Single-metric analysis misses systemic issues. Multi-dimensional view reveals root causes.',
    examples: ['High tokens + low complexity → recommend smaller model', 'Multiple rejections → recommend prompt improvement'],
    antiPatterns: ['Analyzing only token count without context', 'Generic recommendations without specific metrics']
  },
  {
    codexId: 'CODEX-RULE-BA-041',
    title: 'Circuit Breaker Must Be Respected',
    summary: 'When circuit breaker triggers (WARNING or BREAK), executing agent MUST pause and record the event in agent memory. BREAK level MUST stop execution immediately. WARNING level SHOULD trigger efficiency review.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control', 'token-management'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Uncontrolled token consumption wastes resources and indicates inefficient execution.',
    examples: ['Circuit breaker WARNING → agent records note → continues cautiously', 'Circuit breaker BREAK → agent stops → creates efficiency analysis task'],
    antiPatterns: ['Ignoring circuit breaker warnings', 'Resetting breaker without investigating cause']
  },

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================
  {
    codexId: 'CODEX-RULE-BA-050',
    title: 'Parallel Execution Must Respect Dependencies',
    summary: 'Session Manager MUST NOT start tasks that have unresolved DEPENDS_ON dependencies. Tasks in dependency chain MUST execute sequentially. Independent tasks MAY execute in parallel.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'session-management'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'Parallel execution of dependent tasks causes conflicts and incorrect results.',
    examples: ['BACKLOG-0008 depends on BACKLOG-0007 → 0007 must complete before 0008 starts'],
    antiPatterns: ['Starting dependent tasks simultaneously', 'Ignoring DEPENDS_ON relationships']
  },
  {
    codexId: 'CODEX-RULE-BA-051',
    title: 'Session Pause Must Preserve State',
    summary: 'When a session is paused, all in-progress work MUST be recorded in agent memory before pause takes effect. Resuming MUST continue from last recorded state, not restart.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'session-management'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'Lost state on pause wastes tokens for re-execution and loses decision context.',
    examples: ['Before pause: cycle.add_memory({type:"STEP", content:"Completed steps 1-3, pausing before step 4"})'],
    antiPatterns: ['Pausing without recording progress', 'Restarting from scratch after resume']
  },

  // ============================================================
  // EXECUTOR AGENT — ACTION LOGGING & RESOLUTION
  // ============================================================
  {
    codexId: 'CODEX-RULE-BA-060',
    title: 'Executor Must Log Actions in Task History',
    summary: 'When working on a BackLog task, the Executor Agent MUST record every meaningful action and its motivation in the task Action Log (POST /backlog/items/:id/action-log). Each entry MUST include: action performed, motivation/rationale, and category (ANALYSIS, IMPLEMENTATION, TESTING, DECISION, COMMUNICATION). The log provides a human- and machine-readable audit trail of all work performed on the task.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control', 'audit-trail'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Action logs enable post-mortem analysis, knowledge transfer between agents, and accountability for every change. Without logs, the reasoning behind implementation choices is lost.',
    examples: ['action-log entry: {action:"Analyzed existing code for SLA handling", motivation:"Need to understand current timeout logic before refactoring", category:"ANALYSIS"}', 'action-log entry: {action:"Added unit test for escalation timeout", motivation:"Acceptance criterion requires test coverage", category:"TESTING"}'],
    antiPatterns: ['Working on a task without logging any actions', 'Logging actions without motivation', 'Logging only final result, not intermediate steps']
  },
  {
    codexId: 'CODEX-RULE-BA-061',
    title: 'Executor Must Write Structured Resolution on Completion',
    summary: 'Before submitting a task for review, the Executor Agent MUST write a Resolution record (POST /backlog/items/:id/resolution) containing: summary of changes, approach taken, test results, files changed, decisions made, risks identified, and recommendations for follow-up. The resolution MUST be structured as machine-readable JSON to enable automated analysis by other AI agents.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control', 'resolution'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Structured resolutions enable automated quality assessment, pattern detection across tasks, and knowledge extraction for future similar work.',
    examples: ['resolution: {summary:"Extracted SLA timeout to graph parameter", approach:"Created configurable GraphParam node, updated executor to read from context", testResults:{passed:5,failed:0,skipped:0}, filesChanged:["executor.js","test.js"], decisions:[{decision:"Used GraphParam over env var", rationale:"Consistent with FD-002"}]}'],
    antiPatterns: ['Submitting for review without resolution', 'Unstructured free-text resolution', 'Resolution missing test results']
  },
  {
    codexId: 'CODEX-RULE-BA-062',
    title: 'Executor Must Manage Task Status Transitions',
    summary: 'When taking a task for execution, the Executor Agent MUST transition it from APPROVED to IN_PROGRESS. Upon completing work, the agent MUST transition to REVIEW. The agent MUST NOT leave a task in IN_PROGRESS indefinitely — it must either progress to REVIEW or be returned to PROPOSED if blocked by technical issues.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control', 'state-machine'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Proper status management ensures accurate Kanban board state and prevents tasks from being lost in limbo.',
    examples: ['Agent takes task → POST /approve → POST /start → work → POST /review', 'Technical failure → log in action-log → POST /return-to-proposed with explanation'],
    antiPatterns: ['Leaving task in APPROVED while working on it', 'Completing work but not transitioning to REVIEW', 'Marking task DONE directly without review']
  },
  {
    codexId: 'CODEX-RULE-BA-063',
    title: 'Executor Must Return Failed Tasks to Proposed',
    summary: 'When an Executor Agent encounters technical problems that prevent task completion (infrastructure failures, missing dependencies, access issues, unresolvable conflicts), the agent MUST: (1) log the problem details and analysis in the Action Log, (2) propose a solution or workaround if possible, (3) transition the task status back to PROPOSED for re-evaluation. The action log entry MUST have category ERROR.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'execution-control', 'error-handling'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'Failed tasks must not remain in IN_PROGRESS blocking other work. Returning to PROPOSED allows re-evaluation, re-assignment, or scope change by a human or another agent.',
    examples: ['DB connection failure → action-log(category:ERROR, action:"Cannot connect to Memgraph", motivation:"Service down, need infra fix") → return-to-proposed'],
    antiPatterns: ['Silently abandoning a task in IN_PROGRESS', 'Marking failed task as DONE', 'Returning to PROPOSED without explaining the problem']
  },
  {
    codexId: 'CODEX-RULE-BA-064',
    title: 'All Codex and Task Content Must Be in English',
    summary: 'All content written to Codex rules, BackLog task fields (title, description, acceptance criteria, action logs, resolutions, memory entries), and agent communications MUST be in English. If the original input is in another language, the agent MUST translate it to English before storing. This ensures consistent searchability, cross-agent comprehension, and machine analysis.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'codex', 'i18n', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Multilingual content fragments search, prevents cross-agent knowledge transfer, and complicates automated analysis. English as canonical language ensures all agents can process all content.',
    examples: ['User says "Добавить аудит" → agent creates task: "Implement audit trail for assignment changes"', 'Memory entry from Russian context written in English with translated reasoning'],
    antiPatterns: ['Storing task descriptions in non-English language', 'Mixing languages within a single field', 'Translating only title but leaving description in original language']
  }
];

async function seedRules() {
  console.log('Seeding BackLog Agent Workflow Codex Rules...\n');
  let created = 0, skipped = 0;

  for (const rule of BACKLOG_AGENT_RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r', { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id, codexId: $codexId, namespace: 'CODEX', nodeType: 'CodexRule',
          title: $title, summary: $summary, modality: $modality, scope: $scope,
          tier: 'M2', status: 'ACTIVE', rationale: $rationale,
          examples: $examples, antiPatterns: $antiPatterns,
          createdAt: $now, updatedAt: $now
        })
        WITH r
        MATCH (p:CodexPrinciple {codexId: $derivesFrom})
        CREATE (r)-[:DERIVES_FROM]->(p)
        RETURN r.codexId
      `, {
        id, now,
        codexId: rule.codexId, title: rule.title, summary: rule.summary,
        modality: rule.modality, scope: JSON.stringify(rule.scope),
        rationale: rule.rationale,
        examples: JSON.stringify(rule.examples), antiPatterns: JSON.stringify(rule.antiPatterns),
        derivesFrom: rule.derivesFrom
      });

      console.log(`  OK ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`  ERR ${rule.codexId}: ${err.message}`);
    }
  }

  console.log(`\nResults: ${created} created, ${skipped} skipped`);
  console.log(`Total BackLog Agent rules: ${BACKLOG_AGENT_RULES.length}`);
}

async function main() {
  await seedRules();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });

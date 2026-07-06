'use strict';

/**
 * Restores the DevCollector open-tasks report from raw session goal data.
 * Run when the saved report was overwritten by a failed LLM analysis.
 * Usage: node api/scripts/restore-devcollector-report.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { saveReport } = require('../src/core/aopeg/plugins/dialogue/services/dialogue.open-tasks-report');

const restoredTasks = [
  {
    rank: 1,
    title: 'Create Formal Target Architecture Document',
    description: 'Produce the full Target Architecture document covering architectural axioms, component roles, contracts, and reference state for the GXE platform.',
    importance: 'Without a formal architecture reference, all downstream development, auditing, and planning decisions lack a stable foundation.',
    order_rationale: 'Highest-priority foundational artifact — the Post-Audit Development Plan and many feature decisions are blocked until the architecture is formally defined. The audit that was needed to ground this document is now complete.',
    dependencies: [],
    sessionId: '46e26e7e-87fb-4374-b6fa-23c0dd58a11f',
    sessionTitle: 'Functional Audit & Architecture — ProjectAdvisor / GXE platform',
    category: 'feature',
    status: 'pending',
  },
  {
    rank: 2,
    title: 'Develop Post-Audit Development Plan',
    description: 'Create a prioritized step-by-step development plan for the platform based on audit findings, targeting readiness for the first external consumer.',
    importance: 'The audit identified critical gaps (empty Qdrant collections, unverified Azure streaming, FlowDesk boundary violations). A sequenced plan is required to close them systematically.',
    order_rationale: 'Directly follows the Target Architecture document; both are outputs of the completed audit. All feature development should wait for this plan.',
    dependencies: ['Create Formal Target Architecture Document'],
    sessionId: '46e26e7e-87fb-4374-b6fa-23c0dd58a11f',
    sessionTitle: 'Functional Audit & Architecture — ProjectAdvisor / GXE platform',
    category: 'task',
    status: 'pending',
  },
  {
    rank: 3,
    title: 'Establish Iterative Reporting Loop Between Agents',
    description: 'Set up a communication protocol where Claude Code reports after each audit step and receives new instructions from ClaudeChat via MCP server.',
    importance: 'Enables asynchronous multi-agent collaboration, allowing longer tasks to be split across Claude Code and Claude.ai sessions with structured handoffs.',
    order_rationale: 'In progress — one cycle was completed. Establishing the full loop will improve velocity on the architecture and development planning tasks above.',
    dependencies: [],
    sessionId: '46e26e7e-87fb-4374-b6fa-23c0dd58a11f',
    sessionTitle: 'Functional Audit & Architecture — ProjectAdvisor / GXE platform',
    category: 'task',
    status: 'in_progress',
  },
  {
    rank: 4,
    title: 'Create Codex Rule SOP-001 Seed Script',
    description: 'Execute the already-written seed script `api/scripts/seed-codex-sop-rules.js` to add CODEX-RULE-SOP-001 into Memgraph, enabling UN SOP document extraction governance.',
    importance: 'The script is complete but was never run — one command away from activating UN regulatory document extraction governance in the Codex.',
    order_rationale: 'Low effort (single script execution), high leverage — unlocks the UN SOP extraction pipeline that was built in this session. Does not depend on architecture work.',
    dependencies: [],
    sessionId: '23e28ead-7101-4ae3-a662-0d0a0076c47e',
    sessionTitle: 'UN SOP Research & Extraction Executor',
    category: 'task',
    status: 'pending',
  },
  {
    rank: 5,
    title: 'Determine Next Development Priority (UN SOP direction)',
    description: 'Decide among batch validation, GXE workflow graph creation, MCP tool exposure, or switching to another UN domain as the next step after the UN SOP research session.',
    importance: 'The SOP extraction executor is built and tested; without a direction decision, this investment produces no downstream value.',
    order_rationale: 'Depends on the Post-Audit Development Plan — that plan should subsume and answer this decision. Schedule after rank 2.',
    dependencies: ['Develop Post-Audit Development Plan'],
    sessionId: '23e28ead-7101-4ae3-a662-0d0a0076c47e',
    sessionTitle: 'UN SOP Research & Extraction Executor',
    category: 'decision',
    status: 'pending',
  },
  {
    rank: 6,
    title: 'Assemble Full Documentation Package for FlowDesk Chat',
    description: 'Complete the documentation package co-located with the @unpa/chat package folder — rewritten README and multiple specialized doc files. Execution was cut off mid-run.',
    importance: 'Needed for consumers of the @unpa/chat component. The build & integration guide is already available; this fills the remaining package-level docs.',
    order_rationale: 'Self-contained documentation task, does not block platform development. Deprioritized below architectural and governance work.',
    dependencies: [],
    sessionId: 'fbc68ea4-e55e-46a8-9ab0-5f84938786ba',
    sessionTitle: 'FlowDesk Chat Documentation & Migration',
    category: 'task',
    status: 'in_progress',
  },
  {
    rank: 7,
    title: 'Launch FlowDesk Proxy Frontend on Port 5173',
    description: 'Start the Vite-based FlowDesk Proxy frontend so the UI is accessible at http://localhost:5173, completing the local dev environment setup.',
    importance: 'Operational convenience task — needed to test the FlowDesk Proxy stack locally.',
    order_rationale: 'Lowest priority — this is a local dev environment task, easily re-run, and does not affect any platform functionality.',
    dependencies: [],
    sessionId: '09045cdf-cc22-488e-9f59-1eabfbc92056',
    sessionTitle: 'FlowDesk Proxy — frontend launch',
    category: 'task',
    status: 'in_progress',
  },
];

const report = {
  summary: 'Seven open tasks span two critical architectural deliverables (Target Architecture document and Post-Audit Development Plan — both blocked only by effort), one in-progress agent communication loop, one pending Codex seed script (trivial to execute), one strategic direction decision, and two residual documentation/operational tasks. The highest-leverage action is producing the Target Architecture document, which unblocks both the development plan and the strategic direction decision. The Codex SOP-001 seed script is a quick win requiring a single command.',
  tasks: restoredTasks,
  sessionCount: 4,
  openTaskCount: 7,
};

async function main() {
  console.log('[restore] Saving restored DevCollector report…');
  await saveReport(report, 'restored-manually', new Date().toISOString());
  console.log('[restore] Done — 7 tasks saved.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

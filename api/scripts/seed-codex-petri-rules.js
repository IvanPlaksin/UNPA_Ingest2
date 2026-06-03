'use strict';
/**
 * Seed Codex Rules — Petri Net Soundness Validation
 *
 * GXE-060: PETRI_SOUNDNESS_REQUIRED — graphs must pass WF-net soundness before catalog save
 * BA-070:  Petri check required before condition-node graph deployment
 * BA-071:  Soundness errors are not auto-fixable — redesign required
 * BA-072:  PETRI_VALIDATION_ENABLED feature flag must not be silently disabled
 *
 * Run: node api/scripts/seed-codex-petri-rules.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() { if (!_mg) _mg = require('../src/services/memgraph.service'); return _mg; }

const RULES = [
  // ─── GXE series ────────────────────────────────────────────────────────────
  {
    codexId: 'CODEX-RULE-GXE-060',
    title: 'Graphs MUST Pass Petri Net Soundness Verification Before Catalog Save',
    summary: 'When PETRI_VALIDATION_ENABLED=true, every graph submitted to SaveGraphTool MUST pass WF-net soundness verification via the gnn-service /petri/validate endpoint (Woflan algorithm). A graph with dead transitions, deadlocks, or paths that never reach workflow.end MUST be rejected with GRAPH_SOUNDNESS_ERROR. If gnn-service is unavailable or the feature flag is off, validation is skipped gracefully — this is a non-blocking guard, not a hard dependency.',
    modality: 'MUST',
    scope: ['gxe', 'graph-building', 'agents', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'The skip-cascade pattern — a condition node whose branch has no outgoing path to workflow.end — causes the GXE runtime to silently skip that branch. The graph appears to execute but business-critical steps are never reached. Woflan (pm4py) detects dead transitions before they reach production. Without Petri soundness checking, skip-cascade bugs can persist undetected for months.',
    examples: [
      'CORRECT: n_start → n_condition → [true→n_branch_a→n_end, false→n_branch_b→n_end] — all paths reach end, sound=true',
      'WRONG:   n_start → n_condition → [true→n_branch_a→n_end, false→n_branch_b (no outgoing edge)] — n_branch_b is dead transition, sound=false, GRAPH_SOUNDNESS_ERROR',
      'DEGRADATION: gnn-service unavailable → skipped=true, valid=true — save proceeds; feature flag off → same behaviour',
      'API: POST gnn-service/petri/validate {nodes, edges, graph_id} → {sound, errors, warnings, metrics}',
      'Code: SaveGraphTool step 1b calls validator.validateSoundness(nodes, edges, name) then formatSoundnessError()'
    ],
    antiPatterns: [
      'Condition node with a branch that has no path to workflow.end (dead transition / skip-cascade)',
      'Using silent skip to implement optional steps — use conditional edges with explicit pass-through executor instead',
      'Disabling PETRI_VALIDATION_ENABLED in production to bypass soundness check without creating a BackLog task',
      'Treating GRAPH_SOUNDNESS_ERROR as a warning — it MUST block save'
    ]
  },

  // ─── BA series ─────────────────────────────────────────────────────────────
  {
    codexId: 'CODEX-RULE-BA-070',
    title: 'Agent Must Verify Petri Soundness Before Deploying Graphs with Condition Nodes',
    summary: 'Before deploying or scheduling any graph that contains condition (branching) nodes, the executor agent MUST confirm that each branch has a valid path to workflow.end. When PETRI_VALIDATION_ENABLED=true, soundness is enforced automatically by SaveGraphTool. When the flag is off, the agent MUST perform a manual structural check: for every condition node, verify that all outgoing edges reach an end node (directly or via descendants).',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'graph-building', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Skip-cascade failures are silent. A graph that fails soundness will execute without errors but skip entire business branches. Agent-level pre-deployment check provides a safety net when the automated Petri check is disabled for gradual rollout.',
    examples: [
      'Before deploy: count outgoing edges per condition node → each edge target must have a descendant path to workflow.end',
      'Tool: catalog.save_graph with PETRI_VALIDATION_ENABLED=true automatically rejects unsound graphs',
      'Manual check script: node api/scripts/check-graph-soundness.js <graphId>'
    ],
    antiPatterns: [
      'Deploying a condition-node graph without verifying all branches terminate',
      'Assuming the runtime will handle dead branches gracefully — it will silently skip them',
      'Skipping soundness check because graph is "simple" or "linear"'
    ]
  },
  {
    codexId: 'CODEX-RULE-BA-071',
    title: 'Soundness Errors (GRAPH_SOUNDNESS_ERROR) Are Not Auto-Fixable — Redesign Required',
    summary: 'When catalog.save_graph returns GRAPH_SOUNDNESS_ERROR, the agent MUST NOT attempt structural auto-fix (adding edges, removing nodes). Instead, the agent MUST redesign the affected branches so that every path from the condition node reaches workflow.end. If the dead branch represents intentionally terminal behaviour (e.g., an error handling path that logs and exits), it MUST be connected to workflow.end via an explicit terminal node.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'gxe', 'graph-building'],
    derivesFrom: 'CODEX-PRINCIPLE-007',
    rationale: 'Auto-fixing a dead branch by adding an arbitrary edge to workflow.end can mask a deeper design flaw — the missing step may be a critical business requirement. Redesign forces explicit intent: the agent must decide what the dead branch should do, not just patch the topology.',
    examples: [
      'GRAPH_SOUNDNESS_ERROR: "dead transitions: [Handle failure]" → redesign: n_handle_failure → n_log_error → workflow.end',
      'NOT acceptable: add edge n_handle_failure → workflow.end without reviewing what Handle failure should do',
      'If the branch is error handling: create explicit executor node (log_error, notify_admin) then connect to workflow.end'
    ],
    antiPatterns: [
      'Adding edge from dead node directly to workflow.end without reviewing business intent',
      'Treating GRAPH_SOUNDNESS_ERROR as auto-fixable like structural validation errors (missing IDs, duplicate edges)',
      'Removing the dead branch entirely without creating a BackLog task for the missing business logic'
    ]
  },
  {
    codexId: 'CODEX-RULE-BA-072',
    title: 'PETRI_VALIDATION_ENABLED Feature Flag Must Be Documented and Tracked',
    summary: 'The PETRI_VALIDATION_ENABLED=true environment variable activates Petri Net soundness verification in SaveGraphTool. This flag MUST be set to true in all production environments. If it must be disabled (e.g., gnn-service deployment in progress), a BackLog task MUST be created with the target re-enable date and assigned owner. Permanent disabling is PROHIBITED without architectural review.',
    modality: 'MUST',
    scope: ['backlog', 'agents', 'infrastructure', 'bootstrap'],
    derivesFrom: 'CODEX-PRINCIPLE-004',
    rationale: 'Feature flags for safety checks accumulate technical debt when forgotten. PETRI_VALIDATION_ENABLED=false in production means graphs with skip-cascade bugs can be saved without detection. Tracking the disabled state via BackLog ensures the flag is re-enabled after the blocking condition resolves.',
    examples: [
      'CORRECT: PETRI_VALIDATION_ENABLED=true in production .env; BackLog task if temporarily disabled',
      'CORRECT: BackLog task: "Re-enable PETRI_VALIDATION_ENABLED after gnn-service v2 deployment (target: 2026-06-01)"',
      'WRONG: PETRI_VALIDATION_ENABLED=false with no tracking task, no owner, no target date'
    ],
    antiPatterns: [
      'Setting PETRI_VALIDATION_ENABLED=false in production without a BackLog task',
      'Using the flag as a permanent escape hatch for graphs that fail soundness check',
      'Not documenting the flag in environment configuration guides'
    ]
  }
];

async function seed() {
  console.log('Seeding Petri Net Soundness Codex rules...\n');
  let created = 0;

  for (const rule of RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      const existing = await mg().runQuery('MATCH (r:CodexRule {codexId: $c}) RETURN r', { c: rule.codexId });
      if (existing.length > 0) {
        console.log('  SKIP (already exists):', rule.codexId);
        continue;
      }

      await mg().runQuery(
        `CREATE (r:CodexRule $props)
         WITH r
         MATCH (p:CodexPrinciple {codexId: $d})
         CREATE (r)-[:DERIVES_FROM]->(p)
         RETURN r.codexId`,
        {
          props: {
            id,
            codexId: rule.codexId,
            namespace: 'Codex',
            nodeType: 'CodexRule',
            title: rule.title,
            summary: rule.summary,
            modality: rule.modality,
            scope: JSON.stringify(rule.scope),
            tier: 'M2',
            status: 'ACTIVE',
            rationale: rule.rationale,
            examples: JSON.stringify(rule.examples),
            antiPatterns: JSON.stringify(rule.antiPatterns),
            createdAt: now,
            updatedAt: now
          },
          d: rule.derivesFrom
        }
      );
      console.log('  OK:', rule.codexId, '—', rule.title.slice(0, 60));
      created++;
    } catch (e) {
      console.error('  ERR', rule.codexId, ':', e.message);
    }
  }

  console.log(`\nDone. Created: ${created} / ${RULES.length}`);
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });

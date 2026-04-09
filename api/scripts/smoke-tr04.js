#!/usr/bin/env node
/**
 * TR-04 Smoke Test — Urgent Monitor Replacement (Fastest Path)
 *
 * Simulates Ravi Chakraborty (TS-004, NY, OLA) needing an urgent monitor
 * replacement before a Security Council meeting. Tests the fastest path:
 *   1. Set request variables (user, equipment, urgency)
 *   2. Query user profile from Memgraph
 *   3. Validate permissions
 *   4. Set SLA (P1 critical = 4h)
 *   5. Notify user (SR created)
 *   6. Wait for delivery confirmation (WAIT_FOR_INPUT)
 *   7. Resume with delivery confirmation
 *   8. Final status update
 *
 * This test exercises: set_variable, query_profile, validate, notification.send,
 * workflow.wait_input, and the WAIT_FOR_INPUT/resume cycle.
 *
 * Usage:
 *   node api/scripts/smoke-tr04.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.chdir(path.join(__dirname, '..'));

// ====================================================================
// HELPERS
// ====================================================================

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  \u2705 ${name}${detail ? ' \u2014 ' + detail : ''}`);
    passed++;
  } else {
    console.log(`  \u274c ${name}${detail ? ' \u2014 ' + detail : ''}`);
    failed++;
  }
  return condition;
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'='.repeat(60)}`);
}

// ====================================================================
// TR-04 FASTEST-PATH DAG
// ====================================================================

const TR04_DAG = {
  id: 'TR-04-SMOKE',
  nodes: [
    // 1. Set request variables
    {
      id: 'SET_REQ',
      executorType: 'workflow.set_variable',
      parameters: {
        name: 'request_id',
        value: 'SR-TR04-SMOKE-001',
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 2. Set user & equipment info
    {
      id: 'SET_USER',
      executorType: 'workflow.set_variable',
      parameters: {
        name: 'user_id',
        value: 'TS-004',
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 3. Set urgency = critical
    {
      id: 'SET_URGENCY',
      executorType: 'workflow.set_variable',
      parameters: {
        name: 'urgency',
        value: 'critical',
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 4. Set SLA (P1 = 4 hours)
    {
      id: 'SET_SLA',
      executorType: 'workflow.set_variable',
      parameters: {
        name: 'sla_hours',
        value: '4',
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 5. Query user profile from Memgraph
    {
      id: 'QUERY_PROFILE',
      executorType: 'graph.query_profile',
      parameters: {
        user_id: 'TS-004',
        include_manager: true,
        include_history: false,
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 6. Validate permissions (submit_sr, under $5K = no approval)
    {
      id: 'VALIDATE',
      executorType: 'workflow.validate',
      parameters: {
        user_id: 'TS-004',
        action: 'submit_sr',
        resource: { category: 'monitor', cost: 800, duty_station: 'New York' },
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 7. Notify user that SR is being processed
    {
      id: 'NOTIFY_USER',
      executorType: 'notification.send',
      parameters: {
        recipients: ['TS-004'],
        body: 'Your service request {{request_id}} for {{equipment}} has been created. Expected SLA: {{sla}}.',
        subject: 'Service Request Created',
        channel: 'ineed_activity',
        priority: 'high',
        context: {
          request_id: 'SR-TR04-SMOKE-001',
          equipment: 'Monitor',
          sla: '4 hours',
        },
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 8. Wait for delivery confirmation
    {
      id: 'WAIT_DELIVERY',
      executorType: 'workflow.wait_input',
      parameters: {
        expected_inputs: ['received', 'delivery_date', 'condition'],
        recipients: ['TS-004'],
        timeout_hours: 168,  // 7 days
        timeout_action: 'auto_approve',
        prompt: 'Please confirm monitor delivery. Is the equipment received and in good condition?',
      },
      ports: { input: ['default'], output: ['default'] },
    },
    // 9. Set final status
    {
      id: 'SET_FINAL',
      executorType: 'workflow.set_variable',
      parameters: {
        name: 'final_status',
        value: 'delivered_and_confirmed',
      },
      ports: { input: ['default'], output: ['default'] },
    },
  ],
  edges: [
    { id: 'E1', sourceNodeId: 'SET_REQ', targetNodeId: 'SET_USER' },
    { id: 'E2', sourceNodeId: 'SET_USER', targetNodeId: 'SET_URGENCY' },
    { id: 'E3', sourceNodeId: 'SET_URGENCY', targetNodeId: 'SET_SLA' },
    { id: 'E4', sourceNodeId: 'SET_SLA', targetNodeId: 'QUERY_PROFILE' },
    { id: 'E5', sourceNodeId: 'QUERY_PROFILE', targetNodeId: 'VALIDATE' },
    { id: 'E6', sourceNodeId: 'VALIDATE', targetNodeId: 'NOTIFY_USER' },
    { id: 'E7', sourceNodeId: 'NOTIFY_USER', targetNodeId: 'WAIT_DELIVERY' },
    { id: 'E8', sourceNodeId: 'WAIT_DELIVERY', targetNodeId: 'SET_FINAL' },
  ],
  entryNodeId: 'SET_REQ',
  exitNodeIds: ['SET_FINAL'],
};

// ====================================================================
// MAIN
// ====================================================================

async function main() {
  console.log('\u2554' + '\u2550'.repeat(58) + '\u2557');
  console.log('\u2551  TR-04 Smoke Test: Urgent Monitor Replacement             \u2551');
  console.log('\u2551  Ravi Chakraborty (TS-004) \u2014 NY, OLA                      \u2551');
  console.log('\u2551  Security Council meeting at 3pm                          \u2551');
  console.log('\u255a' + '\u2550'.repeat(58) + '\u255d');

  // ──────────────────────────────────────────────────────────
  // Setup
  // ──────────────────────────────────────────────────────────
  section('1. Initialize AOPEG Runtime');

  const { initializeAOPEG, pluginRegistry } = require('../src/core/aopeg/index');
  const { AOPEGAdapter } = require('../src/runtime/integration');
  const { RuntimeEngine } = require('../src/runtime/RuntimeEngine');

  await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
  const adapter = new AOPEGAdapter(pluginRegistry);
  const mcpRegistry = adapter.createMcpCompatibleRegistry();

  const stats = pluginRegistry.getStats();
  const executorCount = stats.executorCount || stats.executors || 0;
  check('AOPEG initialized', executorCount >= 27, `${executorCount} executors`);

  // Verify critical tools exist
  const criticalTools = [
    'workflow.set_variable', 'workflow.wait_input', 'workflow.validate',
    'graph.query_profile', 'notification.send',
  ];
  for (const tool of criticalTools) {
    const t = mcpRegistry.getTool(tool);
    check(`Tool: ${tool}`, !!t);
  }

  // ──────────────────────────────────────────────────────────
  // Execute
  // ──────────────────────────────────────────────────────────
  section('2. Execute TR-04 Fastest Path');

  const engine = new RuntimeEngine(mcpRegistry, {
    enableValidation: false,
    nodeTimeoutMs: 15000,
    graphTimeoutMs: 60000,
  });

  // Event tracking
  const events = { completed: [], failed: [], waiting: null };
  engine.on('node:completed', (ev) => {
    events.completed.push(ev.nodeId);
    console.log(`    [completed] ${ev.nodeId}`);
  });
  engine.on('node:failed', (ev) => {
    events.failed.push({ nodeId: ev.nodeId, error: ev.error });
    console.log(`    [failed] ${ev.nodeId}: ${JSON.stringify(ev.error).substring(0, 120)}`);
  });
  engine.on('execution:waiting', (ev) => {
    events.waiting = ev;
    console.log(`    [WAITING] at ${ev.nodeId} \u2014 prompt: ${ev.waitContext?.prompt?.substring(0, 60) || 'n/a'}`);
  });
  engine.on('execution:stateChange', (ev) => {
    console.log(`    [state] ${ev.from} -> ${ev.to}`);
  });

  console.log('  Executing DAG (9 nodes, 8 edges)...\n');
  const result = await engine.execute(TR04_DAG, {}, {});

  // ──────────────────────────────────────────────────────────
  // Phase 1 checks: Should pause at WAIT_DELIVERY
  // ──────────────────────────────────────────────────────────
  section('3. Phase 1 Checks (pre-delivery)');

  const paused = result.status === 'WAITING_FOR_INPUT' || result.status === 'WAITING';
  check('Execution paused at WAIT_DELIVERY', paused, `status: ${result.status}`);

  // Nodes before wait should succeed
  const preWaitNodes = ['SET_REQ', 'SET_USER', 'SET_URGENCY', 'SET_SLA', 'QUERY_PROFILE', 'VALIDATE', 'NOTIFY_USER'];
  const completedBeforeWait = preWaitNodes.filter(n => events.completed.includes(n));
  check(`Pre-wait nodes completed (${completedBeforeWait.length}/${preWaitNodes.length})`,
    completedBeforeWait.length === preWaitNodes.length,
    completedBeforeWait.join(', '));

  // Verify no failures before wait
  const preWaitFails = events.failed.filter(f => preWaitNodes.includes(f.nodeId));
  check('No failures before WAIT_DELIVERY',
    preWaitFails.length === 0,
    preWaitFails.length > 0 ? preWaitFails.map(f => `${f.nodeId}: ${JSON.stringify(f.error).substring(0, 80)}`).join('; ') : 'clean');

  // Check wait context
  if (result.waitContext) {
    check('Wait context has resume_token', !!result.waitContext.resume_token);
    check('Wait context has expected_inputs', Array.isArray(result.waitContext.expected_inputs));
    check('Wait timeout_action is auto_approve', result.waitContext.timeout_action === 'auto_approve');
  }

  if (!paused) {
    console.log('\n  Cannot proceed to Phase 2 — execution did not pause.');
    console.log(`  Result: ${JSON.stringify(result, null, 2).substring(0, 500)}`);
    printSummary();
    process.exit(failed > 0 ? 1 : 0);
    return;
  }

  // ──────────────────────────────────────────────────────────
  // Phase 2: Resume with delivery confirmation
  // ──────────────────────────────────────────────────────────
  section('4. Resume with Delivery Confirmation');

  console.log('  Simulating: monitor delivered to Ravi, good condition\n');

  let resumeResult;
  try {
    resumeResult = await engine.resumeExecution(result.executionId, {
      nodeId: 'WAIT_DELIVERY',
      output: {
        received: true,
        delivery_date: new Date().toISOString(),
        condition: 'good',
        delivered_by: 'ICTS Field Support',
        asset_tag: 'UN-MON-2026-0042',
      },
    });

    // Give remaining nodes time to complete
    if (resumeResult.status === 'RUNNING') {
      await new Promise(r => setTimeout(r, 2000));
    }

    const resumed = ['COMPLETED', 'SUCCESS', 'RUNNING'].includes(resumeResult.status);
    check('Resume succeeded', resumed, `status: ${resumeResult.status}`);
  } catch (err) {
    check('Resume succeeded', false, err.message);
    resumeResult = { status: 'ERROR' };
  }

  // ──────────────────────────────────────────────────────────
  // Phase 3: Final checks
  // ──────────────────────────────────────────────────────────
  section('5. Final Checks');

  // All nodes should have completed
  const allNodes = TR04_DAG.nodes.map(n => n.id);
  const allCompleted = allNodes.filter(n => events.completed.includes(n));
  check(`All 9 nodes completed (${allCompleted.length}/9)`,
    allCompleted.length === allNodes.length,
    allCompleted.join(', '));

  // No failures at end
  check('No failures in entire pipeline',
    events.failed.length === 0,
    events.failed.length > 0 ? events.failed.map(f => f.nodeId).join(', ') : 'clean run');

  // Verify critical path timing
  if (result.metrics) {
    const ms = result.metrics.totalDurationMs || 0;
    check('Execution completed within timeout', ms < 60000, `${ms}ms`);
  }

  printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TR-04 RESULTS: \u2705 ${passed} passed  \u274c ${failed} failed`);
  if (failed === 0) {
    console.log('  Fastest path verified: urgent monitor replacement works!');
  }
  console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  console.error(err.stack);
  process.exit(2);
});

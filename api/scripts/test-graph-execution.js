/**
 * Graph Execution Test Runner
 *
 * Defines expected execution paths for given inputs and verifies actual execution.
 * Reports deviations with root cause analysis.
 *
 * Usage: node test-graph-execution.js [graphId]
 */

'use strict';

const GRAPH_ID = process.argv[2] || '4760a53b-d01a-4ce0-b1c1-626953c26d67';
const API_BASE = 'http://localhost:3010/api/v1/flowdesk';

// ============================================================
// TEST SCENARIOS — expected paths for specific inputs
// ============================================================

const TEST_SCENARIOS = {
  '4760a53b-d01a-4ce0-b1c1-626953c26d67': [
    {
      name: 'Happy path: laptop request, confirm location, self beneficiary, confirm request',
      userId: 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF',
      turns: [
        {
          message: 'I need a new laptop',
          expectedPath: ['N01', 'N02', 'N03', 'N04', 'N09', 'N10', 'N11'],
          expectedWait: 'N11',
          expectedConditions: { N04: 'high', N10: 'true' },
          expectedComplete: false
        },
        {
          message: 'confirm',
          expectedPath: ['N01', 'N02', 'N03', 'N04', 'N09', 'N10', 'N11', 'N15'],
          expectedWait: 'N15',
          expectedConditions: {},
          expectedComplete: false
        },
        {
          message: 'myself',
          // N15→N19(AI config)→N20(Request Confirmation) should WAIT
          // N08 is "Escalate to Human" not a condition — no condition between N15 and N19
          expectedPathContains: ['N15', 'N19', 'N20'],
          expectedWait: 'N20',
          expectedComplete: false
        },
        {
          message: 'yes',
          // N20 confirm → N21(condition:true) → N22(Create SR) → N23(condition) → N26(WO) → N27(Assign) → N28(Send) → N30(end)
          expectedPathContains: ['N21', 'N22', 'N23', 'N26'],
          expectedConditions: { N21: 'true' },
          expectedComplete: true
        }
      ]
    },
    {
      name: 'Other staff path: laptop, confirm location, other_staff',
      userId: 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF',
      turns: [
        {
          message: 'I need a new laptop',
          expectedWait: 'N11',
          expectedConditions: { N04: 'high' },
          expectedComplete: false
        },
        {
          message: 'other_staff',
          expectedPathContains: ['N11', 'N15'],
          expectedConditions: {},
          expectedComplete: false
        }
      ]
    }
  ],
  '96092967-0088-477d-9fcb-f7d6965b8863': [
    {
      name: 'Happy path: laptop request with location found',
      userId: 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF',
      turns: [
        {
          message: 'I need a new laptop',
          expectedPathContains: ['N01', 'N02', 'N03', 'N04', 'N05'],
          expectedConditions: { N03: 'true', N05: 'true' },
          expectedComplete: false
        }
      ]
    }
  ]
};

// ============================================================
// TEST RUNNER
// ============================================================

async function runTests() {
  const scenarios = TEST_SCENARIOS[GRAPH_ID];
  if (!scenarios) {
    console.log('No test scenarios defined for graph:', GRAPH_ID);
    process.exit(1);
  }

  console.log(`\n=== Graph Execution Tests: ${GRAPH_ID} ===\n`);
  console.log(`Scenarios: ${scenarios.length}\n`);

  let totalPassed = 0;
  let totalFailed = 0;
  const failures = [];

  for (const scenario of scenarios) {
    console.log(`--- ${scenario.name} ---`);
    const sessionId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let scenarioPassed = true;

    for (let t = 0; t < scenario.turns.length; t++) {
      const turn = scenario.turns[t];
      const turnNum = t + 1;

      try {
        const res = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            userId: scenario.userId,
            message: turn.message,
            graphId: GRAPH_ID
          })
        });
        const data = await res.json();

        if (data.error) {
          console.log(`  T${turnNum} ERROR: ${data.detail || data.error}`);
          failures.push({ scenario: scenario.name, turn: turnNum, type: 'API_ERROR', detail: data.detail });
          scenarioPassed = false;
          break;
        }

        const log = data.executionLog || [];
        const actualPath = log.map(e => e.node);
        const actualConditions = {};
        log.filter(e => e.kind === 'condition' && e.output?.branch).forEach(e => {
          actualConditions[e.node] = e.output.branch;
        });
        const actualWait = data.currentNode;
        const actualComplete = data.isComplete;

        let turnPassed = true;
        const turnFailures = [];

        // Check expected path (exact)
        if (turn.expectedPath) {
          const pathMatch = JSON.stringify(actualPath) === JSON.stringify(turn.expectedPath);
          if (!pathMatch) {
            turnPassed = false;
            turnFailures.push({
              check: 'expectedPath',
              expected: turn.expectedPath.join('->'),
              actual: actualPath.join('->'),
              diff: findPathDivergence(turn.expectedPath, actualPath, log)
            });
          }
        }

        // Check expected path contains (subset)
        if (turn.expectedPathContains) {
          const missing = turn.expectedPathContains.filter(n => !actualPath.includes(n));
          if (missing.length > 0) {
            turnPassed = false;
            turnFailures.push({
              check: 'expectedPathContains',
              missing,
              actualPath: actualPath.join('->')
            });
          }
        }

        // Check expected wait node
        if (turn.expectedWait !== undefined) {
          if (actualWait !== turn.expectedWait) {
            turnPassed = false;
            turnFailures.push({
              check: 'expectedWait',
              expected: turn.expectedWait,
              actual: actualWait
            });
          }
        }

        // Check expected conditions
        if (turn.expectedConditions) {
          for (const [nodeId, expectedBranch] of Object.entries(turn.expectedConditions)) {
            const actualBranch = actualConditions[nodeId];
            if (actualBranch !== expectedBranch) {
              turnPassed = false;
              const condNode = log.find(e => e.node === nodeId);
              turnFailures.push({
                check: 'expectedCondition',
                node: nodeId,
                label: condNode?.label,
                expected: expectedBranch,
                actual: actualBranch || 'NOT_EXECUTED',
                expression: condNode?.inputState?.expression?.substring(0, 80),
                nodeOutput: condNode?.output
              });
            }
          }
        }

        // Check completion
        if (turn.expectedComplete !== undefined && actualComplete !== turn.expectedComplete) {
          turnPassed = false;
          turnFailures.push({
            check: 'expectedComplete',
            expected: turn.expectedComplete,
            actual: actualComplete
          });
        }

        // Check for errors in execution
        const errorNodes = log.filter(e => e.status === 'error');
        if (errorNodes.length > 0) {
          turnPassed = false;
          errorNodes.forEach(e => {
            turnFailures.push({
              check: 'nodeError',
              node: e.node,
              label: e.label,
              error: e.error,
              details: e.errorDetails
            });
          });
        }

        if (turnPassed) {
          console.log(`  T${turnNum} PASS  msg:"${turn.message}" -> ${actualPath.length} nodes, wait:${actualWait}`);
        } else {
          console.log(`  T${turnNum} FAIL  msg:"${turn.message}"`);
          turnFailures.forEach(f => {
            console.log(`    ${f.check}: expected=${JSON.stringify(f.expected||f.missing)} actual=${JSON.stringify(f.actual||f.actualPath)}`);
            if (f.diff) console.log(`    divergence: ${f.diff}`);
            if (f.expression) console.log(`    expression: ${f.expression}`);
            if (f.error) console.log(`    error: ${f.error} ${JSON.stringify(f.details)?.substring(0, 100)}`);
          });
          scenarioPassed = false;
          failures.push({ scenario: scenario.name, turn: turnNum, failures: turnFailures });
        }

      } catch (err) {
        console.log(`  T${turnNum} ERROR: ${err.message}`);
        scenarioPassed = false;
        failures.push({ scenario: scenario.name, turn: turnNum, type: 'FETCH_ERROR', detail: err.message });
        break;
      }
    }

    if (scenarioPassed) {
      console.log(`  SCENARIO PASSED\n`);
      totalPassed++;
    } else {
      console.log(`  SCENARIO FAILED\n`);
      totalFailed++;
    }
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Passed: ${totalPassed}/${scenarios.length}`);
  console.log(`Failed: ${totalFailed}/${scenarios.length}`);

  if (failures.length > 0) {
    console.log('\n=== FAILURE DETAILS ===');
    failures.forEach(f => {
      console.log(`\n${f.scenario} (Turn ${f.turn}):`);
      if (f.type) console.log(`  ${f.type}: ${f.detail}`);
      if (f.failures) f.failures.forEach(ff => console.log(`  ${ff.check}: ${JSON.stringify(ff)}`));
    });
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

function findPathDivergence(expected, actual, log) {
  for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
    if (expected[i] !== actual[i]) {
      const prevNode = actual[i - 1];
      const prevEntry = log.find(e => e.node === prevNode);
      return `at position ${i}: expected ${expected[i]||'END'} but got ${actual[i]||'END'} (after ${prevNode}, branch: ${prevEntry?.output?.branch || 'none'})`;
    }
  }
  return 'paths identical';
}

runTests().catch(e => { console.error(e.message); process.exit(1); });

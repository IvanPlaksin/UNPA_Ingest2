/**
 * Test All Graph Paths — generates all possible execution paths and tests each.
 *
 * Usage: node test-graph-all-paths.js <graphId> [--dry-run] [--verbose]
 */

'use strict';

const graphId = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

if (!graphId) {
  console.log('Usage: node test-graph-all-paths.js <graphId> [--dry-run] [--verbose]');
  process.exit(1);
}

const API_BASE = 'http://localhost:3010/api/v1/flowdesk';

async function main() {
  const { generatePathsForGraph } = require('../src/services/graph/graph-path-generator');

  console.log(`\n=== Generating paths for ${graphId} ===\n`);
  const result = await generatePathsForGraph(graphId);

  console.log(`Graph: ${result.graphName} (v${result.version})`);
  console.log(`Nodes: ${result.totalNodes} | Edges: ${result.totalEdges}`);
  console.log(`Paths found: ${result.totalPaths}\n`);

  // Show path summary
  for (const path of result.paths) {
    console.log(`  ${path.name}`);
    console.log(`    Nodes: ${path.totalNodes} | Turns: ${path.turns.length} | End: ${path.endLabel}`);
    if (verbose) {
      path.turns.forEach((t, i) => console.log(`    T${i + 1}: "${t.message}" → wait:${t.expectedWait || 'none'} | ${t.description}`));
    }
  }

  if (dryRun) {
    console.log('\n=== DRY RUN — no execution ===');
    // Output as JSON for test-graph-execution.js format
    const scenarios = result.paths.map(p => ({
      name: p.name,
      userId: 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF',
      turns: p.turns.map(t => ({
        message: t.message,
        expectedPathContains: t.expectedPathContains,
        expectedWait: t.expectedWait,
        expectedComplete: t.expectedComplete,
      })),
    }));
    console.log('\nTest scenarios JSON:');
    console.log(JSON.stringify(scenarios, null, 2));
    process.exit(0);
  }

  // Execute each path
  console.log('\n=== Executing paths ===\n');
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const path of result.paths) {
    console.log(`--- ${path.name} ---`);
    // Skip untestable paths
    const untestableNotes = path.inputMap?.notes?.filter(n => n.startsWith('CANNOT TEST')) || [];
    if (untestableNotes.length > 0) {
      console.log(`  SKIPPED (untestable: ${untestableNotes[0]})\n`);
      continue;
    }

    const sessionId = `test-path-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let pathPassed = true;

    for (let t = 0; t < path.turns.length; t++) {
      const turn = path.turns[t];
      const turnNum = t + 1;

      try {
        const res = await fetch(`${API_BASE}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            userId: 'AC8152B9-DDC7-4C8E-AD8C-15A60B1611AF',
            message: turn.message,
            graphId,
          }),
        });
        const data = await res.json();

        if (data.error) {
          console.log(`  T${turnNum} ERROR: ${data.detail || data.error}`);
          pathPassed = false;
          failures.push({ path: path.name, turn: turnNum, error: data.detail });
          break;
        }

        const log = data.executionLog || [];
        const actualPath = log.map(e => e.node);
        const actualWait = data.currentNode;
        const actualComplete = data.isComplete;

        // Check for errors in execution
        const errorNodes = log.filter(e => e.status === 'error');
        if (errorNodes.length > 0) {
          const err = errorNodes[0];
          console.log(`  T${turnNum} NODE_ERROR: ${err.node} ${err.label} — ${err.error}: ${JSON.stringify(err.errorDetails)?.substring(0, 80)}`);
          pathPassed = false;
          failures.push({ path: path.name, turn: turnNum, node: err.node, error: err.error, details: err.errorDetails });
          break;
        }

        // Check expected path contains
        if (turn.expectedPathContains) {
          const missing = turn.expectedPathContains.filter(n => !actualPath.includes(n));
          if (missing.length > 0) {
            console.log(`  T${turnNum} FAIL: missing nodes ${missing.join(',')} in path ${actualPath.join('->')}`);
            pathPassed = false;
            failures.push({ path: path.name, turn: turnNum, missing, actualPath });
            break;
          }
        }

        // Check expected wait
        if (turn.expectedWait && actualWait !== turn.expectedWait && !actualComplete) {
          console.log(`  T${turnNum} FAIL: expected wait ${turn.expectedWait}, got ${actualWait}`);
          pathPassed = false;
          failures.push({ path: path.name, turn: turnNum, expectedWait: turn.expectedWait, actualWait });
          break;
        }

        // Check completion
        if (turn.expectedComplete !== undefined && actualComplete !== turn.expectedComplete) {
          if (turn.expectedComplete && !actualComplete) {
            console.log(`  T${turnNum} FAIL: expected complete, got incomplete`);
            pathPassed = false;
            failures.push({ path: path.name, turn: turnNum, expectedComplete: true, actualComplete: false });
            break;
          }
        }

        const status = actualComplete ? 'COMPLETED' : `wait:${actualWait}`;
        console.log(`  T${turnNum} PASS  msg:"${turn.message}" → ${actualPath.length} nodes, ${status}`);

      } catch (err) {
        console.log(`  T${turnNum} FETCH_ERROR: ${err.message}`);
        pathPassed = false;
        failures.push({ path: path.name, turn: turnNum, fetchError: err.message });
        break;
      }
    }

    if (pathPassed) { console.log(`  SCENARIO PASSED\n`); passed++; }
    else { console.log(`  SCENARIO FAILED\n`); failed++; }
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`Total paths: ${result.totalPaths}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failures.length > 0) {
    console.log('\n=== FAILURES ===');
    failures.forEach(f => console.log(`  ${f.path} T${f.turn}: ${JSON.stringify(f).substring(0, 150)}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e.message); process.exit(1); });

/**
 * CheckpointManager Tests
 *
 * Tests for execution checkpoint management.
 *
 * @module runtime/persistence/__tests__/CheckpointManager.test
 */

const { CheckpointManager, MemoryStorage, DEFAULT_CONFIG } = require('../CheckpointManager');
const { RecoveryManager, RecoveryStrategy, NodeRecoveryStatus } = require('../RecoveryManager');

// ═══════════════════════════════════════════════════════════════════════════
// MANUAL TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.log(`✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const eq = JSON.stringify(actual) === JSON.stringify(expected);
  if (eq) {
    passed++;
    console.log(`✓ ${message}`);
  } else {
    failed++;
    console.log(`✗ ${message}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
  }
}

async function runTests() {
  // ═══════════════════════════════════════════════════════════════════════════
  // CHECKPOINT MANAGER TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('=== CheckpointManager Construction ===\n');

  const cm = new CheckpointManager();
  assertEqual(cm.config.maxCheckpointsPerExecution, 100, 'Constructor: default maxCheckpoints');
  assertEqual(cm.config.compressData, false, 'Constructor: default compressData');

  console.log('\n=== Create Checkpoint ===\n');

  const checkpoint1 = await cm.createCheckpoint({
    executionId: 'exec-1',
    state: 'RUNNING',
    nodeStates: { 'node-1': 'COMPLETED', 'node-2': 'RUNNING' },
    portData: { 'node-1:output': { value: 42 } },
    variables: { counter: 5 },
    metadata: { user: 'test' },
    tags: ['important']
  });

  assert(checkpoint1.id.startsWith('cp_'), 'createCheckpoint: generates ID with prefix');
  assertEqual(checkpoint1.executionId, 'exec-1', 'createCheckpoint: sets executionId');
  assertEqual(checkpoint1.version, 1, 'createCheckpoint: first version is 1');
  assertEqual(checkpoint1.state.current, 'RUNNING', 'createCheckpoint: serializes state');
  assertEqual(checkpoint1.nodeStates['node-1'], 'COMPLETED', 'createCheckpoint: stores nodeStates');
  assertEqual(checkpoint1.variables.counter, 5, 'createCheckpoint: stores variables');
  assertEqual(checkpoint1.tags, ['important'], 'createCheckpoint: stores tags');

  // Create second checkpoint
  const checkpoint2 = await cm.createCheckpoint({
    executionId: 'exec-1',
    state: 'PAUSED',
    nodeStates: { 'node-1': 'COMPLETED', 'node-2': 'COMPLETED' },
    portData: { 'node-1:output': { value: 42 }, 'node-2:output': { result: 'done' } },
    variables: { counter: 10 }
  });

  assertEqual(checkpoint2.version, 2, 'createCheckpoint: increments version');

  console.log('\n=== Load Checkpoint ===\n');

  const loaded = await cm.loadCheckpoint(checkpoint1.id);
  assertEqual(loaded.id, checkpoint1.id, 'loadCheckpoint: loads by ID');
  assertEqual(loaded.version, 1, 'loadCheckpoint: preserves version');

  const notFound = await cm.loadCheckpoint('nonexistent');
  assertEqual(notFound, null, 'loadCheckpoint: returns null for missing');

  console.log('\n=== Load Latest ===\n');

  const latest = await cm.loadLatest('exec-1');
  assertEqual(latest.version, 2, 'loadLatest: returns highest version');
  assertEqual(latest.state.current, 'PAUSED', 'loadLatest: correct state');

  const noLatest = await cm.loadLatest('nonexistent');
  assertEqual(noLatest, null, 'loadLatest: returns null for missing execution');

  console.log('\n=== Load By Tag ===\n');

  const tagged = await cm.loadByTag('exec-1', 'important');
  assertEqual(tagged.id, checkpoint1.id, 'loadByTag: finds checkpoint with tag');

  const noTag = await cm.loadByTag('exec-1', 'nonexistent');
  assertEqual(noTag, null, 'loadByTag: returns null for missing tag');

  console.log('\n=== List Checkpoints ===\n');

  const list = await cm.listCheckpoints('exec-1');
  assertEqual(list.length, 2, 'listCheckpoints: returns all checkpoints');
  assert(list.some(cp => cp.version === 1), 'listCheckpoints: includes version 1');
  assert(list.some(cp => cp.version === 2), 'listCheckpoints: includes version 2');

  console.log('\n=== Tagging ===\n');

  await cm.addTag(checkpoint2.id, 'release-1');
  const withTag = await cm.loadCheckpoint(checkpoint2.id);
  assert(withTag.tags.includes('release-1'), 'addTag: adds tag');

  await cm.removeTag(checkpoint2.id, 'release-1');
  const withoutTag = await cm.loadCheckpoint(checkpoint2.id);
  assert(!withoutTag.tags.includes('release-1'), 'removeTag: removes tag');

  console.log('\n=== Delete Checkpoint ===\n');

  // Create a test checkpoint to delete
  const toDelete = await cm.createCheckpoint({
    executionId: 'exec-delete',
    state: 'COMPLETED',
    nodeStates: {},
    portData: {}
  });

  const deleted = await cm.deleteCheckpoint(toDelete.id);
  assert(deleted, 'deleteCheckpoint: returns true');

  const afterDelete = await cm.loadCheckpoint(toDelete.id);
  assertEqual(afterDelete, null, 'deleteCheckpoint: checkpoint no longer exists');

  const notDeleted = await cm.deleteCheckpoint('nonexistent');
  assert(!notDeleted, 'deleteCheckpoint: returns false for nonexistent');

  console.log('\n=== Delete All For Execution ===\n');

  // Create multiple checkpoints for delete test
  await cm.createCheckpoint({ executionId: 'exec-cleanup', state: 'A', nodeStates: {}, portData: {} });
  await cm.createCheckpoint({ executionId: 'exec-cleanup', state: 'B', nodeStates: {}, portData: {} });

  const deletedCount = await cm.deleteAllForExecution('exec-cleanup');
  assertEqual(deletedCount, 2, 'deleteAllForExecution: deletes all');

  const afterCleanup = await cm.listCheckpoints('exec-cleanup');
  assertEqual(afterCleanup.length, 0, 'deleteAllForExecution: no checkpoints remain');

  console.log('\n=== Compare Checkpoints ===\n');

  const diff = await cm.compareCheckpoints(checkpoint1.id, checkpoint2.id);
  assertEqual(diff.versionDelta, 1, 'compareCheckpoints: version delta');
  assert(diff.timeDelta >= 0, 'compareCheckpoints: time delta');
  assert(diff.stateChanged, 'compareCheckpoints: detects state change');
  assert(diff.nodeStateChanges.modified.includes('node-2'), 'compareCheckpoints: detects node changes');

  console.log('\n=== Max Checkpoints Limit ===\n');

  const limitedCm = new CheckpointManager({ maxCheckpointsPerExecution: 3 });
  for (let i = 0; i < 5; i++) {
    await limitedCm.createCheckpoint({
      executionId: 'exec-limited',
      state: `state-${i}`,
      nodeStates: {},
      portData: {}
    });
  }

  const limitedList = await limitedCm.listCheckpoints('exec-limited');
  assertEqual(limitedList.length, 3, 'maxCheckpoints: enforces limit');

  console.log('\n=== Stats ===\n');

  const stats = await cm.getStats();
  assert(stats.totalCheckpoints >= 0, 'getStats: returns totalCheckpoints');

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOVERY MANAGER TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('\n=== RecoveryManager Construction ===\n');

  const rm = new RecoveryManager({ checkpointManager: cm });
  assertEqual(rm.config.defaultStrategy, RecoveryStrategy.FULL, 'Constructor: default strategy');

  console.log('\n=== Full Recovery ===\n');

  // Create checkpoint for recovery
  const recoveryExec = await cm.createCheckpoint({
    executionId: 'exec-recover',
    state: 'RUNNING',
    nodeStates: { 'a': 'COMPLETED', 'b': 'RUNNING', 'c': 'IDLE' },
    portData: { 'a:out': { data: 1 } },
    variables: { x: 100 }
  });

  const fullResult = await rm.recover({ checkpointId: recoveryExec.id });
  assert(fullResult.success, 'Full recovery: succeeds');
  assertEqual(fullResult.executionId, 'exec-recover', 'Full recovery: correct executionId');
  assertEqual(fullResult.restoredState.executionState, 'RUNNING', 'Full recovery: restores state');
  assertEqual(fullResult.restoredNodes.length, 3, 'Full recovery: restores all nodes');
  assertEqual(fullResult.restoredState.variables.x, 100, 'Full recovery: restores variables');
  assert(fullResult.durationMs >= 0, 'Full recovery: tracks duration');

  console.log('\n=== Partial Recovery ===\n');

  const partialResult = await rm.recover({
    checkpointId: recoveryExec.id,
    strategy: RecoveryStrategy.PARTIAL
  });

  assert(partialResult.success, 'Partial recovery: succeeds');
  assertEqual(partialResult.nodeStatuses['a'], NodeRecoveryStatus.RESTORED, 'Partial: completed node restored');
  assertEqual(partialResult.nodeStatuses['b'], NodeRecoveryStatus.RESET, 'Partial: running node reset');
  assertEqual(partialResult.nodeStatuses['c'], NodeRecoveryStatus.RESET, 'Partial: idle node reset');
  assertEqual(partialResult.restoredState.nodeStates['b'], 'IDLE', 'Partial: reset to IDLE');

  console.log('\n=== Selective Recovery ===\n');

  const selectiveResult = await rm.recover({
    checkpointId: recoveryExec.id,
    strategy: RecoveryStrategy.SELECTIVE,
    nodeIds: ['a', 'c']
  });

  assert(selectiveResult.success, 'Selective recovery: succeeds');
  assertEqual(selectiveResult.nodeStatuses['a'], NodeRecoveryStatus.RESTORED, 'Selective: selected node restored');
  assertEqual(selectiveResult.nodeStatuses['b'], NodeRecoveryStatus.SKIPPED, 'Selective: unselected node skipped');
  assertEqual(selectiveResult.restoredNodes.length, 2, 'Selective: only selected nodes in list');

  console.log('\n=== Recover Latest ===\n');

  await cm.createCheckpoint({
    executionId: 'exec-recover',
    state: 'PAUSED',
    nodeStates: { 'a': 'COMPLETED', 'b': 'COMPLETED', 'c': 'IDLE' },
    portData: {},
    variables: { x: 200 }
  });

  const latestResult = await rm.recoverLatest('exec-recover');
  assert(latestResult.success, 'Recover latest: succeeds');
  assertEqual(latestResult.restoredState.variables.x, 200, 'Recover latest: uses latest checkpoint');

  console.log('\n=== Recover By Tag ===\n');

  await cm.addTag(recoveryExec.id, 'stable');
  const tagResult = await rm.recoverByTag('exec-recover', 'stable');
  assert(tagResult.success, 'Recover by tag: succeeds');
  assertEqual(tagResult.restoredState.variables.x, 100, 'Recover by tag: uses tagged checkpoint');

  console.log('\n=== Rollback ===\n');

  const rollbackResult = await rm.rollbackToVersion('exec-recover', 1);
  assert(rollbackResult.success, 'Rollback to version: succeeds');

  const stepsResult = await rm.rollbackSteps('exec-recover', 1);
  assert(stepsResult.success, 'Rollback steps: succeeds');

  console.log('\n=== Recovery Errors ===\n');

  const missingResult = await rm.recover({ checkpointId: 'nonexistent' });
  assert(!missingResult.success, 'Missing checkpoint: fails');
  assert(missingResult.errors.length > 0, 'Missing checkpoint: has errors');

  const noExecResult = await rm.recoverLatest('nonexistent-exec');
  assert(!noExecResult.success, 'No execution: fails');

  console.log('\n=== Validate Checkpoint ===\n');

  const validCheck = await rm.validateCheckpoint(recoveryExec.id);
  assert(validCheck.valid, 'validateCheckpoint: valid checkpoint passes');

  const invalidCheck = await rm.validateCheckpoint('nonexistent');
  assert(!invalidCheck.valid, 'validateCheckpoint: missing fails');

  console.log('\n=== Build Runtime State ===\n');

  const runtimeState = rm.buildRuntimeState(fullResult);
  assert(runtimeState !== null, 'buildRuntimeState: returns state');
  assert(runtimeState.nodeStates instanceof Map, 'buildRuntimeState: nodeStates is Map');
  assert(runtimeState.portData instanceof Map, 'buildRuntimeState: portData is Map');
  assertEqual(runtimeState.metadata.recoveredFrom, recoveryExec.id, 'buildRuntimeState: has recovery metadata');

  const nullState = rm.buildRuntimeState({ success: false });
  assertEqual(nullState, null, 'buildRuntimeState: returns null for failed recovery');

  console.log('\n=== Constants ===\n');

  assertEqual(RecoveryStrategy.FULL, 'full', 'RecoveryStrategy.FULL');
  assertEqual(RecoveryStrategy.PARTIAL, 'partial', 'RecoveryStrategy.PARTIAL');
  assertEqual(RecoveryStrategy.SELECTIVE, 'selective', 'RecoveryStrategy.SELECTIVE');

  assertEqual(NodeRecoveryStatus.RESTORED, 'restored', 'NodeRecoveryStatus.RESTORED');
  assertEqual(NodeRecoveryStatus.SKIPPED, 'skipped', 'NodeRecoveryStatus.SKIPPED');
  assertEqual(NodeRecoveryStatus.RESET, 'reset', 'NodeRecoveryStatus.RESET');

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
}

test('CheckpointManager: all scenarios pass', async () => {
  await runTests();
  expect(failed).toBe(0);
}, 10000);

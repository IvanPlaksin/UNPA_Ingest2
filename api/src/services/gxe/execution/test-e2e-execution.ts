/**
 * GXE Execution Engine - E2E Test
 *
 * Phase 0: Foundation (Day 8)
 *
 * Run with: npx ts-node src/services/gxe/execution/test-e2e-execution.ts
 */

import { validateGraph } from '../compiler/dag-validator';
import { RawGraphNode, RawGraphEdge } from '../compiler/type-check-bridge';
import { executeGraph, ValidatedGraph } from './topological-walker';
import { createMockServiceContainer, ServiceContainer } from './service-container';
import { BufferedSSEEmitter } from './sse-emitter';

// ═══════════════════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function log(msg: string): void {
  console.log(`[TEST] ${msg}`);
}

function success(msg: string): void {
  console.log(`✅ ${msg}`);
}

function fail(msg: string): void {
  console.log(`❌ ${msg}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 1: Simple Pipeline (sanitize → chunk)
// ═══════════════════════════════════════════════════════════════════════════

async function testSimplePipeline(): Promise<boolean> {
  log('=== Test 1: Simple Pipeline (sanitize → chunk) ===\n');

  // Define graph
  const nodes: RawGraphNode[] = [
    { id: 'n1', toolId: 'text.sanitize', label: 'Sanitize' },
    { id: 'n2', toolId: 'text.chunk', label: 'Chunk' },
  ];

  const edges: RawGraphEdge[] = [
    {
      source: { nodeId: '__params', port: 'raw_text' },
      target: { nodeId: 'n1', port: 'raw_text' },
    },
    {
      source: { nodeId: 'n1', port: 'clean_text' },
      target: { nodeId: 'n2', port: 'text' },
    },
  ];

  const params = {
    raw_text: '<b>United Nations</b> iNeed system provides   procurement services.',
  };

  // Validate
  const validation = validateGraph(nodes, edges);
  log(`Validation: ${validation.passed ? 'PASSED' : 'FAILED'}`);
  log(`  Completed level: ${validation.completedLevel}`);
  log(`  Topological order: ${validation.dag?.topologicalOrder?.join(' → ')}`);
  log(`  Errors: ${validation.errors.length}`);

  if (!validation.passed && validation.completedLevel < 1) {
    fail('Validation failed at structural level');
    return false;
  }

  // Execute
  const emitter = new BufferedSSEEmitter();
  const container = createMockServiceContainer();

  const graph: ValidatedGraph = {
    id: 'test-simple-pipeline',
    nodes: nodes.map(n => ({
      id: n.id,
      toolId: n.toolId,
      toolLevel: 1,
      inputPorts: [],
      outputPorts: [],
      config: {},
      timeout: 30000,
      retryPolicy: { maxRetries: 2, backoff: 'exponential' as const },
    })),
    edges: edges.filter(e => e.source.nodeId !== '__params').map(e => ({
      source: e.source,
      target: e.target,
      typeCompatible: true,
    })),
    topologicalOrder: validation.dag?.topologicalOrder || ['n1', 'n2'],
    params,
  };

  const result = await executeGraph(graph, emitter, container);

  log('\nExecution Results:');
  log(`  Success: ${result.success}`);
  log(`  Duration: ${result.durationMs}ms`);
  log(`  Nodes: ${result.nodeStats.completed}/${result.nodeStats.total} completed`);

  // Check events
  const events = emitter.getEvents();
  log(`\nSSE Events (${events.length}):`);
  for (const event of events) {
    if (event.type === 'node_status') {
      log(`  ${event.nodeId}: ${event.status}${event.outputPreview ? ` — ${event.outputPreview}` : ''}`);
    } else if (event.type === 'execution_start') {
      log(`  START: ${event.nodeCount} nodes`);
    } else if (event.type === 'execution_complete') {
      log(`  COMPLETE: ${event.successCount} success, ${event.failedCount} failed`);
    }
  }

  // Verify
  const completedNodes = events.filter(
    e => e.type === 'node_status' && e.status === 'completed'
  ).length;

  if (completedNodes === 2 && result.success) {
    success('Test 1 PASSED: Simple pipeline executed successfully\n');
    return true;
  } else {
    fail('Test 1 FAILED: Expected 2 completed nodes\n');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 2: Error Propagation
// ═══════════════════════════════════════════════════════════════════════════

async function testErrorPropagation(): Promise<boolean> {
  log('=== Test 2: Error Propagation ===\n');

  // Define graph with unknown tool in the middle
  const nodes: RawGraphNode[] = [
    { id: 'n1', toolId: 'text.sanitize', label: 'Sanitize' },
    { id: 'n2', toolId: 'unknown.tool', label: 'Unknown' }, // Will fail
    { id: 'n3', toolId: 'text.chunk', label: 'Chunk' },
  ];

  const edges: RawGraphEdge[] = [
    {
      source: { nodeId: '__params', port: 'raw_text' },
      target: { nodeId: 'n1', port: 'raw_text' },
    },
    {
      source: { nodeId: 'n1', port: 'clean_text' },
      target: { nodeId: 'n2', port: 'input' },
    },
    {
      source: { nodeId: 'n2', port: 'output' },
      target: { nodeId: 'n3', port: 'text' },
    },
  ];

  const params = { raw_text: 'Test input' };

  // Validate (will pass structural but fail tool validity)
  const validation = validateGraph(nodes, edges);
  log(`Validation passed: ${validation.passed}`);
  log(`  Completed level: ${validation.completedLevel}`);

  // Execute anyway to test error handling
  const emitter = new BufferedSSEEmitter();
  const container = createMockServiceContainer();

  const graph: ValidatedGraph = {
    id: 'test-error-propagation',
    nodes: nodes.map(n => ({
      id: n.id,
      toolId: n.toolId,
      toolLevel: 1,
      inputPorts: [],
      outputPorts: [],
      config: {},
      timeout: 30000,
      retryPolicy: { maxRetries: 0, backoff: 'linear' as const },
    })),
    edges: edges.filter(e => e.source.nodeId !== '__params').map(e => ({
      source: e.source,
      target: e.target,
      typeCompatible: true,
    })),
    topologicalOrder: ['n1', 'n2', 'n3'],
    params,
  };

  const result = await executeGraph(graph, emitter, container);

  log('\nExecution Results:');
  log(`  Success: ${result.success}`);
  log(`  Failed node: ${result.failedNodeId}`);
  log(`  Error: ${result.error}`);
  log(`  Stats: ${result.nodeStats.completed} completed, ${result.nodeStats.failed} failed, ${result.nodeStats.skipped} skipped`);

  // Verify error propagation
  // n1 should complete, n2 should fail, n3 should be skipped
  const expectedComplete = result.nodeStats.completed === 1;
  const expectedFail = result.nodeStats.failed === 1;
  const expectedSkip = result.nodeStats.skipped === 1;

  if (expectedComplete && expectedFail && expectedSkip && !result.success) {
    success('Test 2 PASSED: Error propagation works correctly\n');
    return true;
  } else {
    fail('Test 2 FAILED: Unexpected node states\n');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST 3: Parallel Execution (if control.parallel is available)
// ═══════════════════════════════════════════════════════════════════════════

async function testServiceContainer(): Promise<boolean> {
  log('=== Test 3: Service Container ===\n');

  const container = createMockServiceContainer();

  // Check registered services
  const services = container.getRegisteredServices();
  log(`Registered services: ${services.length}`);
  for (const service of services) {
    log(`  - ${service}`);
  }

  // Test service call
  const result = await container.callService(
    'TextSanitizer',
    'sanitize',
    { raw_text: '<b>Test</b> text', options: {} },
    ['raw_text', 'options']
  );

  log(`\nService call result:`);
  log(`  Success: ${result.success}`);
  log(`  Duration: ${result.durationMs}ms`);
  log(`  Data: ${JSON.stringify(result.data)?.substring(0, 100)}...`);

  if (result.success && result.data?.clean_text) {
    success('Test 3 PASSED: Service container works correctly\n');
    return true;
  } else {
    fail('Test 3 FAILED: Service call failed\n');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║       GXE Execution Engine - E2E Tests (Phase 0 Day 8)       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const results: boolean[] = [];

  try {
    results.push(await testSimplePipeline());
    results.push(await testErrorPropagation());
    results.push(await testServiceContainer());
  } catch (error) {
    console.error('Test suite error:', error);
    process.exit(1);
  }

  // Summary
  console.log('╔══════════════════════════════════════════════════════════════╗');
  const passed = results.filter(r => r).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log(`║  ${allPassed ? '✅' : '❌'} Results: ${passed}/${total} tests passed`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  process.exit(allPassed ? 0 : 1);
}

main();

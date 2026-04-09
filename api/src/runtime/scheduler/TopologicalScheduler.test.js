/**
 * TopologicalScheduler Tests
 *
 * Test cases from GXE Runtime P0:
 * 1. Diamond DAG: A → B → D, A → C → D (parallel B and C)
 * 2. Retry: A → B(fails twice, succeeds third) → C (attempt=3, C gets result)
 * 3. Cascade cancel: A → B(fails) → C → D, A → E (C,D cancelled, E succeeds)
 */

const { TopologicalScheduler, SchedulerStrategy, FailureStrategy, Deferred } = require('./TopologicalScheduler');
const { RunStatus } = require('../execution/NodeRunner');
const { NodeState } = require('../state/NodeStateMachine');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK FACTORIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create mock NodeRunner
 */
function createMockNodeRunner(executeFn) {
  return {
    run: executeFn || jest.fn().mockResolvedValue({
      status: RunStatus.SUCCEEDED,
      output: { result: 'success' },
      metrics: { wallTimeMs: 10 }
    })
  };
}

/**
 * Create mock PortManager
 */
function createMockPortManager() {
  return {
    collectInput: jest.fn().mockReturnValue({}),
    setPortData: jest.fn(),
    distributeOutput: jest.fn(),
    isNodeInputReady: jest.fn().mockReturnValue(true)
  };
}

/**
 * Create mock DataFlowManager
 */
function createMockDataFlowManager(edges = []) {
  const edgeMap = new Map();
  for (const edge of edges) {
    if (!edgeMap.has(edge.source)) {
      edgeMap.set(edge.source, []);
    }
    edgeMap.get(edge.source).push(edge.target);
  }

  // Build transitive downstream
  function getAllDownstream(nodeId, visited = new Set()) {
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const direct = edgeMap.get(nodeId) || [];
    const result = [...direct];

    for (const child of direct) {
      result.push(...getAllDownstream(child, visited));
    }

    return [...new Set(result)];
  }

  return {
    propagateOutput: jest.fn().mockReturnValue([{ success: true }]),
    getReadyDownstreamNodes: jest.fn().mockImplementation(nodeId => edgeMap.get(nodeId) || []),
    getAllDownstreamNodes: jest.fn().mockImplementation(nodeId => getAllDownstream(nodeId)),
    validateEdgeCompatibility: jest.fn().mockReturnValue({ valid: true })
  };
}

/**
 * Create mock MCP Registry
 */
function createMockRegistry() {
  return {
    getTool: jest.fn().mockReturnValue({
      getDefinition: () => ({ inputSchema: {}, outputSchema: {} }),
      execute: jest.fn().mockResolvedValue({ data: { result: 'ok' } })
    })
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST: DEFERRED PROMISE
// ═══════════════════════════════════════════════════════════════════════════

describe('Deferred', () => {
  test('resolves once', async () => {
    const d = new Deferred();
    d.resolveOnce('first');
    d.resolveOnce('second'); // Should be ignored

    const result = await d.promise;
    expect(result).toBe('first');
    expect(d.isSettled).toBe(true);
  });

  test('rejects once', async () => {
    const d = new Deferred();
    d.rejectOnce(new Error('first'));
    d.rejectOnce(new Error('second')); // Should be ignored

    await expect(d.promise).rejects.toThrow('first');
    expect(d.isSettled).toBe(true);
  });

  test('resolve after reject is ignored', async () => {
    const d = new Deferred();
    d.rejectOnce(new Error('error'));
    d.resolveOnce('success'); // Should be ignored

    await expect(d.promise).rejects.toThrow('error');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Initialization', () => {
  test('identifies entry nodes (inDegree = 0)', () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'C', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry()
    );

    scheduler.initialize();

    expect(scheduler._entryNodes).toEqual(['A']);
    expect(scheduler._exitNodes).toEqual(['C']);
  });

  test('entry nodes transition to READY', () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' }
      ]
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry()
    );

    scheduler.initialize();

    const states = scheduler.getNodeStates();
    expect(states['A'].state).toBe(NodeState.READY);
    expect(states['B'].state).toBe(NodeState.PENDING);
  });

  test('emits scheduler:initialized event', () => {
    const dag = {
      nodes: [{ id: 'A', data: { toolId: 'test' } }],
      edges: []
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry()
    );

    const handler = jest.fn();
    scheduler.on('scheduler:initialized', handler);

    scheduler.initialize();

    expect(handler).toHaveBeenCalledWith({
      entryNodes: ['A'],
      exitNodes: ['A'],
      totalNodes: 1
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: DIAMOND DAG (A → B → D, A → C → D)
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Diamond DAG', () => {
  test('executes B and C in parallel after A completes', async () => {
    // DAG: A → B → D, A → C → D
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'tool_a' } },
        { id: 'B', data: { toolId: 'tool_b' } },
        { id: 'C', data: { toolId: 'tool_c' } },
        { id: 'D', data: { toolId: 'tool_d' } }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
        { source: 'B', target: 'D' },
        { source: 'C', target: 'D' }
      ]
    };

    const executionOrder = [];
    const inParallel = { B: false, C: false };
    let bExecuting = false;
    let cExecuting = false;

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      executionOrder.push({ nodeId, event: 'start' });

      if (nodeId === 'B') {
        bExecuting = true;
        // Small delay to allow C to start
        await new Promise(r => setTimeout(r, 20));
        if (cExecuting) inParallel.B = true;
        bExecuting = false;
      } else if (nodeId === 'C') {
        cExecuting = true;
        // Small delay to allow B to start
        await new Promise(r => setTimeout(r, 20));
        if (bExecuting) inParallel.C = true;
        cExecuting = false;
      } else {
        await new Promise(r => setTimeout(r, 10));
      }

      executionOrder.push({ nodeId, event: 'end' });

      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId, result: `result_${nodeId}` },
        metrics: { wallTimeMs: 10 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry(),
      { strategy: SchedulerStrategy.PARALLEL_BOUNDED, maxConcurrency: 10 }
    );

    const result = await scheduler.start();

    // Verify A executed first
    expect(executionOrder[0]).toEqual({ nodeId: 'A', event: 'start' });

    // Verify B and C executed in parallel (one should have observed the other executing)
    expect(inParallel.B || inParallel.C).toBe(true);

    // Verify D executed last
    expect(executionOrder[executionOrder.length - 1]).toEqual({ nodeId: 'D', event: 'end' });

    // Verify all succeeded
    expect(result.status).toBe('COMPLETED');
    expect(result.metrics.nodesSucceeded).toBe(4);
  });

  test('D waits for both B and C to complete', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'C', data: { toolId: 'test' } },
        { id: 'D', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'C' },
        { source: 'B', target: 'D' },
        { source: 'C', target: 'D' }
      ]
    };

    const completionOrder = [];

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      // Make C take longer
      const delay = nodeId === 'C' ? 50 : 10;
      await new Promise(r => setTimeout(r, delay));

      completionOrder.push(nodeId);

      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: delay }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry()
    );

    await scheduler.start();

    // A must be first
    expect(completionOrder[0]).toBe('A');
    // D must be last (after both B and C)
    expect(completionOrder[completionOrder.length - 1]).toBe('D');
    // B and C must complete before D
    expect(completionOrder.indexOf('B')).toBeLessThan(completionOrder.indexOf('D'));
    expect(completionOrder.indexOf('C')).toBeLessThan(completionOrder.indexOf('D'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: RETRY (A → B(fails twice, succeeds third) → C)
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Retry', () => {
  test('B fails twice, succeeds on third attempt, C gets result', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'C', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };

    let bAttemptCount = 0;
    const events = [];

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      if (nodeId === 'B') {
        bAttemptCount++;
        events.push({ nodeId: 'B', attempt: bAttemptCount });

        if (bAttemptCount < 3) {
          // Fail on first two attempts with retryable error
          return {
            status: RunStatus.FAILED,
            error: 'EXECUTION_ERROR', // This is retryable by default
            details: { attempt: bAttemptCount }
          };
        }

        // Succeed on third attempt
        return {
          status: RunStatus.SUCCEEDED,
          output: { fromB: 'success_on_third' },
          metrics: { wallTimeMs: 10 }
        };
      }

      events.push({ nodeId, attempt: 1 });
      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: 10 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry(),
      {
        maxNodeRetries: 3,
        retryBackoffBase: 10, // Small backoff for faster tests
        retryBackoffMax: 50
      }
    );

    // Track state changes
    const stateChanges = [];
    scheduler.on('node:stateChange', (ev) => stateChanges.push(ev));

    const result = await scheduler.start();

    // Verify B was called 3 times
    expect(bAttemptCount).toBe(3);

    // Verify C executed after B succeeded
    expect(events.some(e => e.nodeId === 'C')).toBe(true);

    // Verify final result
    expect(result.status).toBe('COMPLETED');
    expect(result.metrics.nodesSucceeded).toBe(3);
    expect(result.metrics.totalRetries).toBe(2); // B failed twice

    // Verify B final state shows attempt 3
    const bResult = result.nodeResults['B'];
    expect(bResult.status).toBe('SUCCEEDED');
    expect(bResult.attempt).toBe(3);

    // Verify RETRYING state transitions occurred
    const retryingTransitions = stateChanges.filter(
      e => e.nodeId === 'B' && e.to === 'RETRYING'
    );
    expect(retryingTransitions.length).toBe(2);
  });

  test('exhaust retries and fail permanently', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' }
      ]
    };

    let bAttemptCount = 0;

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      if (nodeId === 'B') {
        bAttemptCount++;
        return {
          status: RunStatus.FAILED,
          error: 'EXECUTION_ERROR', // Retryable error that keeps failing
          details: { attempt: bAttemptCount }
        };
      }

      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: 10 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry(),
      {
        maxNodeRetries: 3,
        retryBackoffBase: 5
      }
    );

    const result = await scheduler.start();

    // B should have been attempted 3 times
    expect(bAttemptCount).toBe(3);

    // Execution should complete with partial failure
    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.metrics.nodesFailed).toBe(1);
    expect(result.nodeResults['B'].status).toBe('FAILED');
    expect(result.nodeResults['B'].attempt).toBe(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CASCADE CANCEL (A → B(fails) → C → D, A → E)
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Cascade Cancel', () => {
  test('B fails, C and D are cancelled, E succeeds', async () => {
    // DAG: A → B → C → D, A → E
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'C', data: { toolId: 'test' } },
        { id: 'D', data: { toolId: 'test' } },
        { id: 'E', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'D' },
        { source: 'A', target: 'E' }
      ]
    };

    const executedNodes = [];

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      executedNodes.push(nodeId);

      if (nodeId === 'B') {
        // B always fails
        return {
          status: RunStatus.FAILED,
          error: 'B_ALWAYS_FAILS',
          details: {}
        };
      }

      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: 10 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry(),
      {
        maxNodeRetries: 1, // No retries - fail fast
        failureStrategy: FailureStrategy.FAIL_FAST
      }
    );

    const cancelEvents = [];
    scheduler.on('scheduler:decision', (ev) => {
      if (ev.action === 'CANCEL') {
        cancelEvents.push(ev);
      }
    });

    const result = await scheduler.start();

    // A and B and E should have executed
    expect(executedNodes).toContain('A');
    expect(executedNodes).toContain('B');
    expect(executedNodes).toContain('E');

    // C and D should NOT have executed (cancelled)
    expect(executedNodes).not.toContain('C');
    expect(executedNodes).not.toContain('D');

    // Verify cancel events
    const cancelledNodes = cancelEvents.map(e => e.nodeId);
    expect(cancelledNodes).toContain('C');
    expect(cancelledNodes).toContain('D');

    // Verify final state
    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.metrics.nodesFailed).toBe(1); // B
    expect(result.metrics.nodesCancelled).toBe(2); // C, D
    expect(result.metrics.nodesSucceeded).toBe(2); // A, E

    // Verify node results
    expect(result.nodeResults['A'].status).toBe('SUCCEEDED');
    expect(result.nodeResults['B'].status).toBe('FAILED');
    expect(result.nodeResults['C'].status).toBe('CANCELLED');
    expect(result.nodeResults['D'].status).toBe('CANCELLED');
    expect(result.nodeResults['E'].status).toBe('SUCCEEDED');
  });

  test('CONTINUE_ON_ERROR allows parallel branch to complete without blocking', async () => {
    // Simpler DAG: A (entry), B and E are parallel branches from A
    // No C that depends on B - testing that E can complete when B fails
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'E', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'A', target: 'E' }
      ]
    };

    const executedNodes = [];

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      executedNodes.push(nodeId);

      if (nodeId === 'B') {
        return {
          status: RunStatus.FAILED,
          error: 'B_FAILS'
        };
      }

      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: 10 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry(),
      {
        maxNodeRetries: 1,
        failureStrategy: FailureStrategy.CONTINUE_ON_ERROR
      }
    );

    const result = await scheduler.start();

    // All nodes should execute
    expect(executedNodes).toContain('A');
    expect(executedNodes).toContain('B');
    expect(executedNodes).toContain('E');

    // Verify results
    expect(result.nodeResults['A'].status).toBe('SUCCEEDED');
    expect(result.nodeResults['B'].status).toBe('FAILED');
    expect(result.nodeResults['E'].status).toBe('SUCCEEDED');

    // With CONTINUE_ON_ERROR, E should still succeed even though B failed
    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.metrics.nodesSucceeded).toBe(2); // A, E
    expect(result.metrics.nodesFailed).toBe(1); // B
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: LINEAR CHAIN
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Linear Chain', () => {
  test('executes A → B → C in order', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'C', data: { toolId: 'test' } }
      ],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };

    const executionOrder = [];

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      executionOrder.push(nodeId);
      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: 10 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry()
    );

    const result = await scheduler.start();

    expect(executionOrder).toEqual(['A', 'B', 'C']);
    expect(result.status).toBe('COMPLETED');
    expect(result.outputs['C']).toEqual({ nodeId: 'C' });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: PROGRESS TRACKING
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Progress', () => {
  test('emits progress events', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } }
      ],
      edges: [{ source: 'A', target: 'B' }]
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry()
    );

    const progressEvents = [];
    scheduler.on('execution:progress', (ev) => progressEvents.push(ev));

    await scheduler.start();

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents[progressEvents.length - 1].percentage).toBeGreaterThanOrEqual(50);
  });

  test('getProgress returns correct values', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } }
      ],
      edges: [{ source: 'A', target: 'B' }]
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(dag.edges),
      createMockPortManager(),
      createMockRegistry()
    );

    await scheduler.start();

    const progress = scheduler.getProgress();
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(2);
    expect(progress.percentage).toBe(100);
    expect(progress.active).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CONCURRENCY CONTROL
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Concurrency', () => {
  test('SEQUENTIAL strategy executes one at a time', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'C', data: { toolId: 'test' } }
      ],
      edges: [] // All are entry nodes
    };

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

      await new Promise(r => setTimeout(r, 20));

      currentConcurrent--;

      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: 20 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry(),
      { strategy: SchedulerStrategy.SEQUENTIAL }
    );

    await scheduler.start();

    expect(maxConcurrent).toBe(1);
  });

  test('PARALLEL_BOUNDED respects maxConcurrency', async () => {
    const dag = {
      nodes: [
        { id: 'A', data: { toolId: 'test' } },
        { id: 'B', data: { toolId: 'test' } },
        { id: 'C', data: { toolId: 'test' } },
        { id: 'D', data: { toolId: 'test' } },
        { id: 'E', data: { toolId: 'test' } }
      ],
      edges: [] // All are entry nodes
    };

    let maxConcurrent = 0;
    let currentConcurrent = 0;

    const mockRunner = createMockNodeRunner(async (nodeId) => {
      currentConcurrent++;
      maxConcurrent = Math.max(maxConcurrent, currentConcurrent);

      await new Promise(r => setTimeout(r, 30));

      currentConcurrent--;

      return {
        status: RunStatus.SUCCEEDED,
        output: { nodeId },
        metrics: { wallTimeMs: 30 }
      };
    });

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry(),
      {
        strategy: SchedulerStrategy.PARALLEL_BOUNDED,
        maxConcurrency: 2
      }
    );

    await scheduler.start();

    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: EVENTS
// ═══════════════════════════════════════════════════════════════════════════

describe('TopologicalScheduler - Events', () => {
  test('emits node:stateChange events', async () => {
    const dag = {
      nodes: [{ id: 'A', data: { toolId: 'test' } }],
      edges: []
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry()
    );

    const stateChanges = [];
    scheduler.on('node:stateChange', (ev) => stateChanges.push(ev));

    await scheduler.start();

    // Should have: READY → QUEUED (via scheduled), then internal transitions
    const aChanges = stateChanges.filter(e => e.nodeId === 'A');
    expect(aChanges.length).toBeGreaterThan(0);

    // Final state should be SUCCEEDED
    const lastChange = aChanges[aChanges.length - 1];
    expect(lastChange.to).toBe('SUCCEEDED');
  });

  test('emits node:completed on success', async () => {
    const dag = {
      nodes: [{ id: 'A', data: { toolId: 'test' } }],
      edges: []
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry()
    );

    const completed = [];
    scheduler.on('node:completed', (ev) => completed.push(ev));

    await scheduler.start();

    expect(completed).toHaveLength(1);
    expect(completed[0].nodeId).toBe('A');
  });

  test('emits node:failed on failure', async () => {
    const dag = {
      nodes: [{ id: 'A', data: { toolId: 'test' } }],
      edges: []
    };

    const mockRunner = createMockNodeRunner(async () => ({
      status: RunStatus.FAILED,
      error: 'TEST_FAILURE'
    }));

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry(),
      { maxNodeRetries: 1 }
    );

    const failed = [];
    scheduler.on('node:failed', (ev) => failed.push(ev));

    await scheduler.start();

    expect(failed).toHaveLength(1);
    expect(failed[0].nodeId).toBe('A');
    expect(failed[0].error).toBe('TEST_FAILURE');
  });

  test('emits execution:completed on success', async () => {
    const dag = {
      nodes: [{ id: 'A', data: { toolId: 'test' } }],
      edges: []
    };

    const scheduler = new TopologicalScheduler(
      dag,
      createMockNodeRunner(),
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry()
    );

    const completedEvents = [];
    scheduler.on('execution:completed', (ev) => completedEvents.push(ev));

    await scheduler.start();

    expect(completedEvents).toHaveLength(1);
    expect(completedEvents[0].status).toBe('COMPLETED');
  });

  test('emits execution:failed on failure', async () => {
    const dag = {
      nodes: [{ id: 'A', data: { toolId: 'test' } }],
      edges: []
    };

    const mockRunner = createMockNodeRunner(async () => ({
      status: RunStatus.FAILED,
      error: 'FAIL'
    }));

    const scheduler = new TopologicalScheduler(
      dag,
      mockRunner,
      createMockDataFlowManager(),
      createMockPortManager(),
      createMockRegistry(),
      { maxNodeRetries: 1 }
    );

    const failedEvents = [];
    scheduler.on('execution:failed', (ev) => failedEvents.push(ev));

    await scheduler.start();

    expect(failedEvents).toHaveLength(1);
    expect(failedEvents[0].status).toBe('PARTIAL_FAILURE');
    expect(failedEvents[0].failedNodes).toContain('A');
  });
});

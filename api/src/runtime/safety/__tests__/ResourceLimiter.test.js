/**
 * ResourceLimiter Tests
 */

const {
  ResourceLimiter,
  DEFAULT_LIMITS,
  computeDAGDepth
} = require('../ResourceLimiter');

// ═══════════════════════════════════════════════════════════════════════════
// TEST: computeDAGDepth
// ═══════════════════════════════════════════════════════════════════════════

describe('computeDAGDepth', () => {
  test('returns 0 for empty graph', () => {
    expect(computeDAGDepth([], [])).toBe(0);
  });

  test('returns 0 for single node', () => {
    const nodes = [{ id: 'A' }];
    expect(computeDAGDepth(nodes, [])).toBe(0);
  });

  test('calculates depth for linear chain', () => {
    // A → B → C = depth 2
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' }
    ];
    expect(computeDAGDepth(nodes, edges)).toBe(2);
  });

  test('calculates depth for diamond DAG', () => {
    // A → B → D, A → C → D = depth 2 (longest path is 2)
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'B', target: 'D' },
      { source: 'C', target: 'D' }
    ];
    expect(computeDAGDepth(nodes, edges)).toBe(2);
  });

  test('calculates depth for wide graph', () => {
    // A → B, A → C, A → D = depth 1
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'A', target: 'C' },
      { source: 'A', target: 'D' }
    ];
    expect(computeDAGDepth(nodes, edges)).toBe(1);
  });

  test('calculates depth for complex DAG', () => {
    // A → B → C → D → E = depth 4
    const nodes = [
      { id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }
    ];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'D' },
      { source: 'D', target: 'E' }
    ];
    expect(computeDAGDepth(nodes, edges)).toBe(4);
  });

  test('returns -1 for cyclic graph', () => {
    // A → B → C → A (cycle)
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [
      { source: 'A', target: 'B' },
      { source: 'B', target: 'C' },
      { source: 'C', target: 'A' }
    ];
    expect(computeDAGDepth(nodes, edges)).toBe(-1);
  });

  test('handles disconnected nodes', () => {
    // A → B, C (disconnected)
    const nodes = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
    const edges = [{ source: 'A', target: 'B' }];
    // Depth is 1 (A → B), C is at depth 0
    expect(computeDAGDepth(nodes, edges)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - Construction', () => {
  test('uses default limits', () => {
    const limiter = new ResourceLimiter();
    const limits = limiter.getLimits();

    expect(limits.maxNodes).toBe(DEFAULT_LIMITS.maxNodes);
    expect(limits.maxEdges).toBe(DEFAULT_LIMITS.maxEdges);
    expect(limits.maxDepth).toBe(DEFAULT_LIMITS.maxDepth);
    expect(limits.maxConcurrency).toBe(DEFAULT_LIMITS.maxConcurrency);
    expect(limits.maxTotalRetries).toBe(DEFAULT_LIMITS.maxTotalRetries);
    expect(limits.maxLLMTokensPerGraph).toBe(DEFAULT_LIMITS.maxLLMTokensPerGraph);
  });

  test('accepts custom limits', () => {
    const limiter = new ResourceLimiter({
      maxNodes: 50,
      maxEdges: 200,
      maxDepth: 20
    });

    expect(limiter.getLimit('maxNodes')).toBe(50);
    expect(limiter.getLimit('maxEdges')).toBe(200);
    expect(limiter.getLimit('maxDepth')).toBe(20);
    // Defaults preserved
    expect(limiter.getLimit('maxConcurrency')).toBe(DEFAULT_LIMITS.maxConcurrency);
  });

  test('initializes tracking to zero', () => {
    const limiter = new ResourceLimiter();

    expect(limiter.getTokenUsage()).toBe(0);
    expect(limiter.getTotalRetries()).toBe(0);
    expect(limiter.getActiveCount()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: DAG VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - validateDAG', () => {
  test('valid DAG passes validation', () => {
    const limiter = new ResourceLimiter({
      maxNodes: 10,
      maxEdges: 20,
      maxDepth: 5
    });

    const dag = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };

    const result = limiter.validateDAG(dag);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.stats.nodeCount).toBe(3);
    expect(result.stats.edgeCount).toBe(2);
    expect(result.stats.depth).toBe(2);
  });

  test('fails when node count exceeds limit', () => {
    const limiter = new ResourceLimiter({ maxNodes: 2 });

    const dag = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: []
    };

    const result = limiter.validateDAG(dag);

    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Node count 3 exceeds limit 2')
    );
  });

  test('fails when edge count exceeds limit', () => {
    const limiter = new ResourceLimiter({ maxEdges: 1 });

    const dag = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };

    const result = limiter.validateDAG(dag);

    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Edge count 2 exceeds limit 1')
    );
  });

  test('fails when depth exceeds limit', () => {
    const limiter = new ResourceLimiter({ maxDepth: 1 });

    const dag = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };

    const result = limiter.validateDAG(dag);

    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('Graph depth 2 exceeds limit 1')
    );
  });

  test('fails for cyclic graph', () => {
    const limiter = new ResourceLimiter();

    const dag = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'A' }
      ]
    };

    const result = limiter.validateDAG(dag);

    expect(result.valid).toBe(false);
    expect(result.violations).toContainEqual(
      expect.stringContaining('cycles')
    );
    expect(result.stats.depth).toBeNull();
  });

  test('reports multiple violations', () => {
    const limiter = new ResourceLimiter({
      maxNodes: 2,
      maxEdges: 1,
      maxDepth: 0
    });

    const dag = {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'C' }
      ]
    };

    const result = limiter.validateDAG(dag);

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: EXECUTION CHECKS
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - checkNodeExecution', () => {
  test('allows execution when under limits', () => {
    const limiter = new ResourceLimiter({ maxConcurrency: 10 });

    const result = limiter.checkNodeExecution('node-1', { activeConcurrency: 5 });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('blocks when concurrency limit reached', () => {
    const limiter = new ResourceLimiter({ maxConcurrency: 5 });

    const result = limiter.checkNodeExecution('node-1', { activeConcurrency: 5 });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Concurrency limit');
  });

  test('blocks when retry budget exhausted', () => {
    const limiter = new ResourceLimiter({ maxTotalRetries: 3 });

    limiter.trackRetry('node-1');
    limiter.trackRetry('node-1');
    limiter.trackRetry('node-2');

    const result = limiter.checkNodeExecution('node-3');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Retry budget');
  });

  test('uses internal active count when not provided', () => {
    const limiter = new ResourceLimiter({ maxConcurrency: 2 });

    limiter.markNodeActive('node-1');
    limiter.markNodeActive('node-2');

    const result = limiter.checkNodeExecution('node-3');

    expect(result.allowed).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: ACTIVE NODE TRACKING
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - Active Node Tracking', () => {
  test('tracks active nodes', () => {
    const limiter = new ResourceLimiter();

    limiter.markNodeActive('A');
    limiter.markNodeActive('B');

    expect(limiter.getActiveCount()).toBe(2);
  });

  test('removes inactive nodes', () => {
    const limiter = new ResourceLimiter();

    limiter.markNodeActive('A');
    limiter.markNodeActive('B');
    limiter.markNodeInactive('A');

    expect(limiter.getActiveCount()).toBe(1);
  });

  test('handles duplicate active marks', () => {
    const limiter = new ResourceLimiter();

    limiter.markNodeActive('A');
    limiter.markNodeActive('A');

    expect(limiter.getActiveCount()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: TOKEN TRACKING
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - Token Tracking', () => {
  test('tracks token usage', () => {
    const limiter = new ResourceLimiter();

    limiter.trackTokenUsage(1000);
    limiter.trackTokenUsage(500);

    expect(limiter.getTokenUsage()).toBe(1500);
  });

  test('detects exceeded token budget', () => {
    const limiter = new ResourceLimiter({ maxLLMTokensPerGraph: 1000 });

    limiter.trackTokenUsage(500);
    expect(limiter.isTokenBudgetExceeded()).toBe(false);

    limiter.trackTokenUsage(600);
    expect(limiter.isTokenBudgetExceeded()).toBe(true);
  });

  test('calculates remaining token budget', () => {
    const limiter = new ResourceLimiter({ maxLLMTokensPerGraph: 1000 });

    limiter.trackTokenUsage(300);
    expect(limiter.getRemainingTokenBudget()).toBe(700);

    limiter.trackTokenUsage(800);
    expect(limiter.getRemainingTokenBudget()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: RETRY TRACKING
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - Retry Tracking', () => {
  test('tracks total retries', () => {
    const limiter = new ResourceLimiter();

    limiter.trackRetry('node-1');
    limiter.trackRetry('node-1');
    limiter.trackRetry('node-2');

    expect(limiter.getTotalRetries()).toBe(3);
  });

  test('tracks retries per node', () => {
    const limiter = new ResourceLimiter();

    limiter.trackRetry('node-1');
    limiter.trackRetry('node-1');
    limiter.trackRetry('node-2');

    expect(limiter.getNodeRetries('node-1')).toBe(2);
    expect(limiter.getNodeRetries('node-2')).toBe(1);
    expect(limiter.getNodeRetries('node-3')).toBe(0);
  });

  test('detects exceeded retry budget', () => {
    const limiter = new ResourceLimiter({ maxTotalRetries: 3 });

    limiter.trackRetry('node-1');
    limiter.trackRetry('node-1');
    expect(limiter.isRetryBudgetExceeded()).toBe(false);

    limiter.trackRetry('node-1');
    expect(limiter.isRetryBudgetExceeded()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: UTILIZATION REPORT
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - Utilization Report', () => {
  test('calculates utilization percentages', () => {
    const limiter = new ResourceLimiter({
      maxConcurrency: 10,
      maxTotalRetries: 50,
      maxLLMTokensPerGraph: 100000
    });

    limiter.markNodeActive('A');
    limiter.markNodeActive('B');
    limiter.trackRetry('A');
    limiter.trackRetry('A');
    limiter.trackRetry('A');
    limiter.trackRetry('A');
    limiter.trackRetry('A');
    limiter.trackTokenUsage(25000);

    const report = limiter.getUtilizationReport();

    expect(report.concurrency.current).toBe(2);
    expect(report.concurrency.limit).toBe(10);
    expect(report.concurrency.percentage).toBe(20);

    expect(report.retries.current).toBe(5);
    expect(report.retries.limit).toBe(50);
    expect(report.retries.percentage).toBe(10);

    expect(report.tokens.current).toBe(25000);
    expect(report.tokens.limit).toBe(100000);
    expect(report.tokens.percentage).toBe(25);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: RESET
// ═══════════════════════════════════════════════════════════════════════════

describe('ResourceLimiter - Reset', () => {
  test('resets all tracking', () => {
    const limiter = new ResourceLimiter();

    limiter.markNodeActive('A');
    limiter.trackRetry('A');
    limiter.trackTokenUsage(1000);

    limiter.reset();

    expect(limiter.getActiveCount()).toBe(0);
    expect(limiter.getTotalRetries()).toBe(0);
    expect(limiter.getTokenUsage()).toBe(0);
  });
});

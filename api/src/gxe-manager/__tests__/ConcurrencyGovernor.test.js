/**
 * Unit tests for ConcurrencyGovernor
 */

const { ConcurrencyGovernor } = require('../ConcurrencyGovernor');

// ═══════════════════════════════════════════════════════════════════════════
// MOCKS
// ═══════════════════════════════════════════════════════════════════════════

function createMockRedis() {
  const sortedSets = {};

  return {
    async zcard(key) {
      return sortedSets[key] ? sortedSets[key].size : 0;
    },
    async zadd(key, score, member) {
      if (!sortedSets[key]) sortedSets[key] = new Map();
      sortedSets[key].set(member, score);
    },
    async zremrangebyscore(key, min, max) {
      if (!sortedSets[key]) return;
      for (const [member, score] of sortedSets[key]) {
        if (score >= min && score <= max) {
          sortedSets[key].delete(member);
        }
      }
    },
    async expire() {}
  };
}

function createMockRegistry(runningCount = 0, activeByGraphCount = 0) {
  return {
    countByStatus: jest.fn(async () => ({
      QUEUED: 0,
      INITIALIZING: 0,
      RUNNING: runningCount,
      PAUSED: 0,
      WAITING: 0,
      COMPLETING: 0,
      COMPLETED: 10,
      FAILED: 1,
      CANCELLED: 0,
      TIMED_OUT: 0,
      COMPENSATING: 0
    })),
    getActiveByGraph: jest.fn(async () => {
      return Array.from({ length: activeByGraphCount }, (_, i) => ({
        executionId: `exec-${i}`,
        status: 'RUNNING'
      }));
    })
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('ConcurrencyGovernor', () => {
  describe('canStart()', () => {
    it('should allow when under all limits', async () => {
      const registry = createMockRegistry(5, 2);
      const governor = new ConcurrencyGovernor(registry, createMockRedis());

      const result = await governor.canStart('g1', 'NORMAL');
      expect(result.allowed).toBe(true);
    });

    it('should deny when global limit reached', async () => {
      const registry = createMockRegistry(50, 0);
      const governor = new ConcurrencyGovernor(registry, createMockRedis(), {
        globalMaxConcurrent: 50
      });

      const result = await governor.canStart('g1', 'NORMAL');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Global limit');
    });

    it('should deny when per-graph limit reached', async () => {
      const registry = createMockRegistry(5, 10);
      const governor = new ConcurrencyGovernor(registry, createMockRedis(), {
        perGraphMaxConcurrent: 10
      });

      const result = await governor.canStart('g1', 'NORMAL');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Per-graph limit');
    });
  });

  describe('checkResourceQuota()', () => {
    it('should allow when under rate limit', async () => {
      const governor = new ConcurrencyGovernor(
        createMockRegistry(),
        createMockRedis(),
        { resourceQuotas: { llm: 100 } }
      );

      const allowed = await governor.checkResourceQuota('llm');
      expect(allowed).toBe(true);
    });

    it('should deny when rate limit exceeded', async () => {
      const redis = createMockRedis();
      const governor = new ConcurrencyGovernor(
        createMockRegistry(),
        redis,
        { resourceQuotas: { llm: 2 } }
      );

      // Record 2 usages
      await governor.recordResourceUsage('llm');
      await governor.recordResourceUsage('llm');

      const allowed = await governor.checkResourceQuota('llm');
      expect(allowed).toBe(false);
    });
  });

  describe('getCapacityReport()', () => {
    it('should return structured report', async () => {
      const governor = new ConcurrencyGovernor(
        createMockRegistry(10, 0),
        createMockRedis()
      );

      const report = await governor.getCapacityReport();
      expect(report.global.running).toBe(10);
      expect(report.global.limit).toBe(50);
      expect(report.global.available).toBe(40);
      expect(report.executionCounts).toBeDefined();
      expect(report.resourceUsage).toBeDefined();
      expect(report.timestamp).toBeDefined();
    });
  });
});

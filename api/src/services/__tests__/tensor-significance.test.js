/**
 * Tests for TensorService.evaluateSignificance()
 * Validates signal event significance filtering for META persistence.
 */

// Mock uuid (ESM-only package) before importing tensor.service
let mockUuidCounter = 0;
jest.mock('uuid', () => ({
  v4: () => `test-uuid-${++mockUuidCounter}`
}));

const { TensorService } = require('../tensor.service');

describe('TensorService.evaluateSignificance', () => {
  let service;

  beforeEach(() => {
    service = new TensorService();
    // Stop cleanup interval to avoid leaking timers
    service.storage.stopCleanup();
  });

  // ── Always-significant events ──────────────────────────────────────────

  test('contradiction is always significant', () => {
    const result = service.evaluateSignificance('signal.contradiction', {});
    expect(result.significant).toBe(true);
    expect(result.reason).toBe('ALWAYS_SIGNIFICANT');
  });

  test('timeout is always significant', () => {
    const result = service.evaluateSignificance('signal.timeout', {});
    expect(result.significant).toBe(true);
    expect(result.reason).toBe('ALWAYS_SIGNIFICANT');
  });

  test('escalated is always significant', () => {
    const result = service.evaluateSignificance('signal.escalated', {});
    expect(result.significant).toBe(true);
    expect(result.reason).toBe('ALWAYS_SIGNIFICANT');
  });

  test('force_resolved is always significant', () => {
    const result = service.evaluateSignificance('signal.force_resolved', {});
    expect(result.significant).toBe(true);
    expect(result.reason).toBe('ALWAYS_SIGNIFICANT');
  });

  // ── Cold start ─────────────────────────────────────────────────────────

  test('cold start (no metrics) returns significant', () => {
    const result = service.evaluateSignificance('signal.initiated', {});
    expect(result.significant).toBe(true);
    expect(result.reason).toBe('COLD_START');
    expect(result.count).toBe(0);
  });

  test('cold start (few metrics) returns significant', () => {
    // Add 5 tensors — still under threshold of 10
    for (let i = 0; i < 5; i++) {
      const t = service.start('signal.initiated', {});
      service.complete(t.id, {});
    }
    const result = service.evaluateSignificance('signal.initiated', {});
    expect(result.significant).toBe(true);
    expect(result.reason).toBe('COLD_START');
    expect(result.count).toBe(5);
  });

  // ── Vote significance ──────────────────────────────────────────────────

  describe('vote significance', () => {
    beforeEach(() => {
      // Populate enough metrics to exit cold start
      for (let i = 0; i < 12; i++) {
        const t = service.start('signal.vote_received', {});
        service.complete(t.id, {});
      }
    });

    test('vote with extreme high confidence is significant', () => {
      const result = service.evaluateSignificance('signal.vote_received', {
        vote: { confidence: 0.98, vote: 'APPROVE' },
        state: { votes: [] }
      });
      expect(result.significant).toBe(true);
      expect(result.reason).toBe('EXTREME_CONFIDENCE');
      expect(result.confidence).toBe(0.98);
    });

    test('vote with extreme low confidence is significant', () => {
      const result = service.evaluateSignificance('signal.vote_received', {
        vote: { confidence: 0.05, vote: 'APPROVE' },
        state: { votes: [] }
      });
      expect(result.significant).toBe(true);
      expect(result.reason).toBe('EXTREME_CONFIDENCE');
      expect(result.confidence).toBe(0.05);
    });

    test('vote contradicting majority is significant', () => {
      const result = service.evaluateSignificance('signal.vote_received', {
        vote: { confidence: 0.7, vote: 'REJECT' },
        state: {
          votes: [
            { vote: 'APPROVE' },
            { vote: 'APPROVE' },
            { vote: 'APPROVE' }
          ]
        }
      });
      expect(result.significant).toBe(true);
      expect(result.reason).toBe('CONTRADICTS_MAJORITY');
    });

    test('routine vote matching majority is not significant', () => {
      const result = service.evaluateSignificance('signal.vote_received', {
        vote: { confidence: 0.7, vote: 'APPROVE' },
        state: {
          votes: [{ vote: 'APPROVE' }]
        }
      });
      expect(result.significant).toBe(false);
      expect(result.reason).toBe('ROUTINE_VOTE');
    });

    test('vote with normal confidence and no existing votes is not significant', () => {
      const result = service.evaluateSignificance('signal.vote_received', {
        vote: { confidence: 0.6, vote: 'APPROVE' },
        state: { votes: [] }
      });
      expect(result.significant).toBe(false);
      expect(result.reason).toBe('ROUTINE_VOTE');
    });

    test('vote contradicting single vote (not majority) is not significant', () => {
      // Only 1 prior vote — not a majority (threshold is > 1)
      const result = service.evaluateSignificance('signal.vote_received', {
        vote: { confidence: 0.6, vote: 'REJECT' },
        state: {
          votes: [{ vote: 'APPROVE' }]
        }
      });
      expect(result.significant).toBe(false);
      expect(result.reason).toBe('ROUTINE_VOTE');
    });
  });

  // ── Resolved significance ──────────────────────────────────────────────

  describe('resolved significance', () => {
    beforeEach(() => {
      // Populate enough metrics and create known p95
      for (let i = 0; i < 20; i++) {
        const t = service.start('signal.resolved', {});
        // Simulate completion with known duration
        t.complete({});
        t.duration = 50; // 50ms each
        service.storage.activeTensors.delete(t.id);
      }
    });

    test('resolved with escalation is significant', () => {
      const result = service.evaluateSignificance('signal.resolved', {
        wasEscalated: true,
        durationMs: 50
      });
      expect(result.significant).toBe(true);
      expect(result.reason).toBe('WAS_ESCALATED');
    });

    test('resolved with unusual duration is significant', () => {
      const result = service.evaluateSignificance('signal.resolved', {
        wasEscalated: false,
        durationMs: 500 // much higher than p95 of ~50
      });
      expect(result.significant).toBe(true);
      expect(result.reason).toBe('UNUSUAL_DURATION');
      expect(result.durationMs).toBe(500);
    });

    test('resolved within normal range is not significant', () => {
      const result = service.evaluateSignificance('signal.resolved', {
        wasEscalated: false,
        durationMs: 30 // well within normal
      });
      expect(result.significant).toBe(false);
      expect(result.reason).toBe('WITHIN_NORMAL_RANGE');
    });

    test('resolved with zero duration is not significant', () => {
      const result = service.evaluateSignificance('signal.resolved', {
        wasEscalated: false,
        durationMs: 0
      });
      expect(result.significant).toBe(false);
      expect(result.reason).toBe('WITHIN_NORMAL_RANGE');
    });
  });

  // ── Duration significance (default handler) ───────────────────────────

  describe('duration significance (default events)', () => {
    beforeEach(() => {
      for (let i = 0; i < 15; i++) {
        const t = service.start('signal.initiated', {});
        t.complete({});
        t.duration = 100;
        service.storage.activeTensors.delete(t.id);
      }
    });

    test('signal.initiated with unusual duration is significant', () => {
      const result = service.evaluateSignificance('signal.initiated', {
        durationMs: 1000 // >> p95 of ~100
      });
      expect(result.significant).toBe(true);
      expect(result.reason).toBe('UNUSUAL_DURATION');
    });

    test('signal.initiated within normal range is not significant', () => {
      const result = service.evaluateSignificance('signal.initiated', {
        durationMs: 50
      });
      expect(result.significant).toBe(false);
      expect(result.reason).toBe('WITHIN_NORMAL_RANGE');
    });
  });

  // ── Sensitivity multiplier ─────────────────────────────────────────────

  test('custom sensitivity multiplier affects threshold', () => {
    // Populate metrics
    for (let i = 0; i < 15; i++) {
      const t = service.start('signal.initiated', {});
      t.complete({});
      t.duration = 100;
      service.storage.activeTensors.delete(t.id);
    }

    // With default sensitivity (1.5), threshold = 100 * 1.5 = 150
    const r1 = service.evaluateSignificance('signal.initiated', { durationMs: 160 });
    expect(r1.significant).toBe(true);

    // With high sensitivity (3.0), threshold = 100 * 3.0 = 300
    const r2 = service.evaluateSignificance('signal.initiated', { durationMs: 160 }, { sensitivityMultiplier: 3.0 });
    expect(r2.significant).toBe(false);
  });
});

/**
 * RetryPolicy Tests
 */

const {
  RetryPolicy,
  BackoffType,
  DEFAULT_RETRYABLE_ERRORS,
  NON_RETRYABLE_ERRORS,
  exponentialBackoff,
  linearBackoff,
  fixedDelay,
  noRetry
} = require('../RetryPolicy');

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - Construction', () => {
  test('uses default config', () => {
    const policy = new RetryPolicy();

    expect(policy.maxAttempts).toBe(3);
    expect(policy.backoffType).toBe(BackoffType.EXPONENTIAL);
    expect(policy.baseDelayMs).toBe(1000);
    expect(policy.maxDelayMs).toBe(15000);
    expect(policy.jitterEnabled).toBe(true);
  });

  test('accepts custom config', () => {
    const policy = new RetryPolicy({
      maxAttempts: 5,
      backoffType: BackoffType.LINEAR,
      baseDelayMs: 500,
      maxDelayMs: 10000,
      jitter: false
    });

    expect(policy.maxAttempts).toBe(5);
    expect(policy.backoffType).toBe(BackoffType.LINEAR);
    expect(policy.baseDelayMs).toBe(500);
    expect(policy.maxDelayMs).toBe(10000);
    expect(policy.jitterEnabled).toBe(false);
  });

  test('converts retryableErrors array to Set', () => {
    const policy = new RetryPolicy({
      retryableErrors: ['CUSTOM_ERROR', 'ANOTHER_ERROR']
    });

    expect(policy.isErrorRetryable('CUSTOM_ERROR')).toBe(true);
    expect(policy.isErrorRetryable('ANOTHER_ERROR')).toBe(true);
    expect(policy.isErrorRetryable('UNKNOWN_ERROR')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: shouldRetry
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - shouldRetry', () => {
  test('returns false when attempt >= maxAttempts', () => {
    const policy = new RetryPolicy({ maxAttempts: 3, jitter: false });

    expect(policy.shouldRetry(3, { code: 'NODE_TIMEOUT' })).toBe(false);
    expect(policy.shouldRetry(4, { code: 'NODE_TIMEOUT' })).toBe(false);
    expect(policy.shouldRetry(100, { code: 'NODE_TIMEOUT' })).toBe(false);
  });

  test('returns true for default retryable errors', () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });

    // Default retryable errors
    expect(policy.shouldRetry(1, { code: 'NODE_TIMEOUT' })).toBe(true);
    expect(policy.shouldRetry(1, { code: 'EXECUTION_ERROR' })).toBe(true);
    expect(policy.shouldRetry(1, { code: 'PROPAGATION_ERROR' })).toBe(true);
  });

  test('returns false for non-retryable errors', () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });

    expect(policy.shouldRetry(1, { code: 'TOOL_NOT_FOUND' })).toBe(false);
    expect(policy.shouldRetry(1, { code: 'INVALID_INPUT' })).toBe(false);
    expect(policy.shouldRetry(1, { code: 'INVALID_OUTPUT' })).toBe(false);
  });

  test('uses custom retryableErrors when specified', () => {
    const policy = new RetryPolicy({
      maxAttempts: 3,
      retryableErrors: ['CUSTOM_ERROR']
    });

    expect(policy.shouldRetry(1, { code: 'CUSTOM_ERROR' })).toBe(true);
    expect(policy.shouldRetry(1, { code: 'NODE_TIMEOUT' })).toBe(false);
    expect(policy.shouldRetry(1, { code: 'EXECUTION_ERROR' })).toBe(false);
  });

  test('handles error as string', () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });

    expect(policy.shouldRetry(1, 'NODE_TIMEOUT')).toBe(true);
    expect(policy.shouldRetry(1, 'TOOL_NOT_FOUND')).toBe(false);
  });

  test('handles error with .error property', () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });

    expect(policy.shouldRetry(1, { error: 'NODE_TIMEOUT' })).toBe(true);
    expect(policy.shouldRetry(1, { error: 'TOOL_NOT_FOUND' })).toBe(false);
  });

  test('returns false for null/undefined error', () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });

    expect(policy.shouldRetry(1, null)).toBe(false);
    expect(policy.shouldRetry(1, undefined)).toBe(false);
    expect(policy.shouldRetry(1, {})).toBe(false);
  });

  test('handles attempt = 0 edge case', () => {
    const policy = new RetryPolicy({ maxAttempts: 3 });

    // Attempt 0 is before first attempt, should allow retry
    expect(policy.shouldRetry(0, { code: 'NODE_TIMEOUT' })).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: getDelay - EXPONENTIAL
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - getDelay (EXPONENTIAL)', () => {
  test('calculates exponential backoff without jitter', () => {
    const policy = new RetryPolicy({
      backoffType: BackoffType.EXPONENTIAL,
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      jitter: false
    });

    expect(policy.getDelay(1)).toBe(1000);  // 1000 * 2^0
    expect(policy.getDelay(2)).toBe(2000);  // 1000 * 2^1
    expect(policy.getDelay(3)).toBe(4000);  // 1000 * 2^2
    expect(policy.getDelay(4)).toBe(8000);  // 1000 * 2^3
    expect(policy.getDelay(5)).toBe(15000); // 1000 * 2^4 = 16000, capped at 15000
  });

  test('respects maxDelayMs cap', () => {
    const policy = new RetryPolicy({
      backoffType: BackoffType.EXPONENTIAL,
      baseDelayMs: 1000,
      maxDelayMs: 5000,
      jitter: false
    });

    expect(policy.getDelay(4)).toBe(5000); // Would be 8000, capped at 5000
    expect(policy.getDelay(10)).toBe(5000); // Would be much higher, capped
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: getDelay - LINEAR
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - getDelay (LINEAR)', () => {
  test('calculates linear backoff without jitter', () => {
    const policy = new RetryPolicy({
      backoffType: BackoffType.LINEAR,
      baseDelayMs: 1000,
      maxDelayMs: 15000,
      jitter: false
    });

    expect(policy.getDelay(1)).toBe(1000);  // 1000 * 1
    expect(policy.getDelay(2)).toBe(2000);  // 1000 * 2
    expect(policy.getDelay(3)).toBe(3000);  // 1000 * 3
    expect(policy.getDelay(4)).toBe(4000);  // 1000 * 4
    expect(policy.getDelay(5)).toBe(5000);  // 1000 * 5
  });

  test('respects maxDelayMs cap', () => {
    const policy = new RetryPolicy({
      backoffType: BackoffType.LINEAR,
      baseDelayMs: 1000,
      maxDelayMs: 3500,
      jitter: false
    });

    expect(policy.getDelay(4)).toBe(3500); // Would be 4000, capped
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: getDelay - FIXED
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - getDelay (FIXED)', () => {
  test('returns fixed delay without jitter', () => {
    const policy = new RetryPolicy({
      backoffType: BackoffType.FIXED,
      baseDelayMs: 2000,
      jitter: false
    });

    expect(policy.getDelay(1)).toBe(2000);
    expect(policy.getDelay(2)).toBe(2000);
    expect(policy.getDelay(3)).toBe(2000);
    expect(policy.getDelay(10)).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: JITTER
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - Jitter', () => {
  test('adds jitter when enabled', () => {
    const policy = new RetryPolicy({
      backoffType: BackoffType.FIXED,
      baseDelayMs: 1000,
      jitter: true
    });

    // Run multiple times and check that delays vary
    const delays = new Set();
    for (let i = 0; i < 10; i++) {
      delays.add(policy.getDelay(1));
    }

    // With jitter, we should get different values
    // (statistically very unlikely to get same value 10 times)
    expect(delays.size).toBeGreaterThan(1);

    // All delays should be in valid range: [baseDelay, baseDelay + baseDelay*0.5]
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(1500);
    }
  });

  test('jitter range is 0-50% of baseDelay', () => {
    const policy = new RetryPolicy({
      backoffType: BackoffType.FIXED,
      baseDelayMs: 2000,
      jitter: true
    });

    // Run many times to get distribution
    for (let i = 0; i < 100; i++) {
      const delay = policy.getDelay(1);
      // Should be between 2000 and 3000 (2000 + 0.5*2000)
      expect(delay).toBeGreaterThanOrEqual(2000);
      expect(delay).toBeLessThanOrEqual(3000);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: UTILITY METHODS
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - Utility Methods', () => {
  test('reset clears internal state', () => {
    const policy = new RetryPolicy();
    policy._currentAttempt = 5;

    policy.reset();

    expect(policy._currentAttempt).toBe(0);
  });

  test('getConfig returns copy of config', () => {
    const policy = new RetryPolicy({ maxAttempts: 5 });
    const config = policy.getConfig();

    config.maxAttempts = 10;

    expect(policy.maxAttempts).toBe(5); // Original unchanged
  });

  test('isErrorRetryable checks error code', () => {
    const policy = new RetryPolicy();

    expect(policy.isErrorRetryable('NODE_TIMEOUT')).toBe(true);
    expect(policy.isErrorRetryable('TOOL_NOT_FOUND')).toBe(false);
    expect(policy.isErrorRetryable('UNKNOWN')).toBe(false);
  });

  test('getAllDelays returns array of delays', () => {
    const policy = new RetryPolicy({
      maxAttempts: 4,
      backoffType: BackoffType.EXPONENTIAL,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      jitter: false
    });

    const delays = policy.getAllDelays();

    expect(delays).toEqual([100, 200, 400]); // 3 delays for maxAttempts=4
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - Factory Functions', () => {
  test('exponentialBackoff creates policy with exponential backoff', () => {
    const policy = exponentialBackoff(5, 500);

    expect(policy.maxAttempts).toBe(5);
    expect(policy.backoffType).toBe(BackoffType.EXPONENTIAL);
    expect(policy.baseDelayMs).toBe(500);
  });

  test('linearBackoff creates policy with linear backoff', () => {
    const policy = linearBackoff(4, 1000);

    expect(policy.maxAttempts).toBe(4);
    expect(policy.backoffType).toBe(BackoffType.LINEAR);
    expect(policy.baseDelayMs).toBe(1000);
  });

  test('fixedDelay creates policy with fixed delay', () => {
    const policy = fixedDelay(3, 2000);

    expect(policy.maxAttempts).toBe(3);
    expect(policy.backoffType).toBe(BackoffType.FIXED);
    expect(policy.baseDelayMs).toBe(2000);
  });

  test('noRetry creates policy with maxAttempts=1', () => {
    const policy = noRetry();

    expect(policy.maxAttempts).toBe(1);
    expect(policy.shouldRetry(1, { code: 'NODE_TIMEOUT' })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - Edge Cases', () => {
  test('handles maxAttempts = 0', () => {
    const policy = new RetryPolicy({ maxAttempts: 0 });

    expect(policy.shouldRetry(0, { code: 'NODE_TIMEOUT' })).toBe(false);
    expect(policy.shouldRetry(1, { code: 'NODE_TIMEOUT' })).toBe(false);
  });

  test('handles maxAttempts = 1 (no retries)', () => {
    const policy = new RetryPolicy({ maxAttempts: 1 });

    expect(policy.shouldRetry(1, { code: 'NODE_TIMEOUT' })).toBe(false);
  });

  test('handles very large attempt numbers', () => {
    const policy = new RetryPolicy({
      maxAttempts: 100,
      backoffType: BackoffType.EXPONENTIAL,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      jitter: false
    });

    // Should be capped at maxDelay
    expect(policy.getDelay(50)).toBe(60000);
    expect(policy.getDelay(100)).toBe(60000);
  });

  test('handles empty retryableErrors set', () => {
    const policy = new RetryPolicy({
      retryableErrors: new Set()
    });

    // No errors are retryable
    expect(policy.shouldRetry(1, { code: 'NODE_TIMEOUT' })).toBe(false);
    expect(policy.shouldRetry(1, { code: 'EXECUTION_ERROR' })).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TEST: CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

describe('RetryPolicy - Constants', () => {
  test('DEFAULT_RETRYABLE_ERRORS contains expected errors', () => {
    expect(DEFAULT_RETRYABLE_ERRORS.has('NODE_TIMEOUT')).toBe(true);
    expect(DEFAULT_RETRYABLE_ERRORS.has('EXECUTION_ERROR')).toBe(true);
    expect(DEFAULT_RETRYABLE_ERRORS.has('PROPAGATION_ERROR')).toBe(true);
  });

  test('NON_RETRYABLE_ERRORS contains expected errors', () => {
    expect(NON_RETRYABLE_ERRORS.has('TOOL_NOT_FOUND')).toBe(true);
    expect(NON_RETRYABLE_ERRORS.has('INVALID_INPUT')).toBe(true);
    expect(NON_RETRYABLE_ERRORS.has('INVALID_OUTPUT')).toBe(true);
  });

  test('BackoffType enum has expected values', () => {
    expect(BackoffType.EXPONENTIAL).toBe('EXPONENTIAL');
    expect(BackoffType.LINEAR).toBe('LINEAR');
    expect(BackoffType.FIXED).toBe('FIXED');
  });
});

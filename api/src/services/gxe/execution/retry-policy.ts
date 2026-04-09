/**
 * GXE Execution Engine - Retry Policy
 *
 * Phase 0: Foundation (Day 6)
 *
 * Provides retry functionality with exponential backoff
 * for transient failures during graph execution.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retry policy configuration.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts (0 = no retries) */
  maxRetries: number;
  /** Initial delay before first retry (ms) */
  baseDelayMs: number;
  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
  /** Backoff multiplier (2 = double delay each retry) */
  backoffMultiplier: number;
  /** Whether to add jitter to delay (prevents thundering herd) */
  jitter: boolean;
}

/**
 * Retry attempt information.
 */
export interface RetryAttempt {
  attempt: number;
  totalAttempts: number;
  error: Error;
  delayMs: number;
  willRetry: boolean;
}

/**
 * Retry callback for logging/monitoring.
 */
export type OnRetryCallback = (attempt: RetryAttempt) => void;

/**
 * Error classifier to determine if error is retryable.
 */
export type ErrorClassifier = (error: Error) => boolean;

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT POLICIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default retry policy for retryable operations.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * Aggressive retry policy for critical operations.
 */
export const AGGRESSIVE_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  baseDelayMs: 200,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitter: true,
};

/**
 * No retry policy.
 */
export const NO_RETRY_POLICY: RetryPolicy = {
  maxRetries: 0,
  baseDelayMs: 0,
  maxDelayMs: 0,
  backoffMultiplier: 1,
  jitter: false,
};

// ═══════════════════════════════════════════════════════════════════════════
// RETRY LOGIC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for a retry attempt.
 */
function calculateDelay(policy: RetryPolicy, attempt: number): number {
  // Exponential backoff
  let delay = policy.baseDelayMs * Math.pow(policy.backoffMultiplier, attempt);

  // Cap at max delay
  delay = Math.min(delay, policy.maxDelayMs);

  // Add jitter (±25%)
  if (policy.jitter) {
    const jitterRange = delay * 0.25;
    delay = delay - jitterRange + Math.random() * jitterRange * 2;
  }

  return Math.floor(delay);
}

/**
 * Default error classifier - retry on network/timeout errors.
 */
export const defaultErrorClassifier: ErrorClassifier = (error: Error): boolean => {
  const message = error.message.toLowerCase();

  // Network errors
  if (message.includes('network') || message.includes('connection')) return true;
  if (message.includes('econnrefused') || message.includes('econnreset')) return true;
  if (message.includes('etimedout') || message.includes('timeout')) return true;

  // Service unavailable
  if (message.includes('503') || message.includes('service unavailable')) return true;
  if (message.includes('502') || message.includes('bad gateway')) return true;
  if (message.includes('429') || message.includes('too many requests')) return true;

  // Transient errors
  if (message.includes('temporarily') || message.includes('try again')) return true;

  return false;
};

/**
 * Execute a function with retry logic.
 *
 * @param fn - Async function to execute
 * @param policy - Retry policy to use
 * @param isRetryable - Whether the operation should be retried on failure
 * @param onRetry - Optional callback for retry notifications
 * @param errorClassifier - Optional custom error classifier
 * @returns Promise with function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy,
  isRetryable: boolean = true,
  onRetry?: OnRetryCallback,
  errorClassifier: ErrorClassifier = defaultErrorClassifier
): Promise<T> {
  // No retries for non-retryable operations
  if (!isRetryable || policy.maxRetries === 0) {
    return fn();
  }

  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isLastAttempt = attempt >= policy.maxRetries;
      const shouldRetry = !isLastAttempt && errorClassifier(lastError);

      if (shouldRetry) {
        const delayMs = calculateDelay(policy, attempt);

        if (onRetry) {
          onRetry({
            attempt: attempt + 1,
            totalAttempts: policy.maxRetries + 1,
            error: lastError,
            delayMs,
            willRetry: true,
          });
        }

        await sleep(delayMs);
      } else if (!isLastAttempt && onRetry) {
        // Non-retryable error
        onRetry({
          attempt: attempt + 1,
          totalAttempts: policy.maxRetries + 1,
          error: lastError,
          delayMs: 0,
          willRetry: false,
        });
        break;
      }
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper for a function.
 *
 * @param policy - Retry policy to use
 * @param isRetryable - Whether the operation should be retried
 * @returns Wrapper function
 */
export function createRetryWrapper(
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  isRetryable: boolean = true
): <T>(fn: () => Promise<T>, onRetry?: OnRetryCallback) => Promise<T> {
  return <T>(fn: () => Promise<T>, onRetry?: OnRetryCallback): Promise<T> => {
    return withRetry(fn, policy, isRetryable, onRetry);
  };
}

/**
 * Wrap an async function with retry logic.
 *
 * @param fn - Function to wrap
 * @param policy - Retry policy
 * @param isRetryable - Whether retries are enabled
 * @returns Wrapped function
 */
export function withRetryWrapped<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  isRetryable: boolean = true,
  onRetry?: OnRetryCallback
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    return withRetry(() => fn(...args), policy, isRetryable, onRetry);
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a retry policy from tool specification.
 */
export function createPolicyFromToolSpec(
  retryable: boolean,
  estimatedDurationMs: number
): RetryPolicy {
  if (!retryable) {
    return NO_RETRY_POLICY;
  }

  // Adjust delays based on estimated duration
  // Longer operations get longer retry delays
  const baseDelay = Math.max(500, Math.min(estimatedDurationMs * 0.5, 2000));

  return {
    maxRetries: 2,
    baseDelayMs: baseDelay,
    maxDelayMs: Math.max(baseDelay * 4, 5000),
    backoffMultiplier: 2,
    jitter: true,
  };
}

/**
 * Log retry attempt to console.
 */
export function logRetryAttempt(context: string): OnRetryCallback {
  return (attempt: RetryAttempt) => {
    if (attempt.willRetry) {
      console.warn(
        `[GXE Retry] ${context}: Attempt ${attempt.attempt}/${attempt.totalAttempts} failed. ` +
        `Retrying in ${attempt.delayMs}ms. Error: ${attempt.error.message}`
      );
    } else {
      console.error(
        `[GXE Retry] ${context}: Attempt ${attempt.attempt}/${attempt.totalAttempts} failed. ` +
        `Not retrying (non-retryable error). Error: ${attempt.error.message}`
      );
    }
  };
}

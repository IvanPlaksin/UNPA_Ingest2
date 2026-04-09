/**
 * CheckpointManager
 *
 * Manages execution checkpoints for pausable graph execution.
 * Stores wait-for-input contexts in Redis with TTL for automatic cleanup.
 * Part of GXE Runtime Environment - Async Execution support.
 *
 * @module runtime/resilience/CheckpointManager
 */

// ═══════════════════════════════════════════════════════════════════════════
// KEY PREFIXES
// ═══════════════════════════════════════════════════════════════════════════

const KEY_PREFIX = {
  WAIT_CONTEXT: 'gxe:wait:',
  EXECUTION_STATE: 'gxe:exec:',
};

// ═══════════════════════════════════════════════════════════════════════════
// CHECKPOINT MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class CheckpointManager {
  /**
   * @param {Object} redis - Redis service (api/src/services/redis.service.js)
   */
  constructor(redis) {
    this._redis = redis;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WAIT CONTEXT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save wait-for-input context when execution is paused
   *
   * @param {string} executionId - Execution ID
   * @param {string} nodeId - Node that requested input
   * @param {Object} waitContext - Wait context from executor
   * @param {string} waitContext.resume_token - UUID token for resumption
   * @param {Array} waitContext.expected_inputs - Expected input fields
   * @param {string[]} waitContext.recipients - User IDs who can provide input
   * @param {string} waitContext.timeout_at - ISO timestamp for timeout
   * @param {string} waitContext.timeout_action - Action on timeout
   * @param {string} [waitContext.prompt] - Message for recipients
   * @returns {Promise<{key: string, ttlSeconds: number}>}
   */
  async saveWaitContext(executionId, nodeId, waitContext) {
    const key = `${KEY_PREFIX.WAIT_CONTEXT}${executionId}`;
    const data = {
      executionId,
      nodeId,
      ...waitContext,
      savedAt: new Date().toISOString(),
    };

    // TTL = time until timeout + 24h buffer for cleanup
    const timeoutMs = new Date(waitContext.timeout_at).getTime() - Date.now();
    const ttlSeconds = Math.max(
      Math.ceil(timeoutMs / 1000) + 86400,
      3600 // Minimum 1 hour TTL
    );

    await this._redis.set(key, JSON.stringify(data));
    await this._redis.expire(key, ttlSeconds);

    return { key, ttlSeconds };
  }

  /**
   * Get wait context for an execution
   *
   * @param {string} executionId
   * @returns {Promise<Object|null>}
   */
  async getWaitContext(executionId) {
    const key = `${KEY_PREFIX.WAIT_CONTEXT}${executionId}`;
    const data = await this._redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Clear wait context after resume or timeout
   *
   * @param {string} executionId
   * @returns {Promise<boolean>}
   */
  async clearWaitContext(executionId) {
    const key = `${KEY_PREFIX.WAIT_CONTEXT}${executionId}`;
    const result = await this._redis.del(key);
    return result > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION STATE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Save full execution state for recovery
   *
   * @param {string} executionId
   * @param {Object} state - Serialized execution state
   * @param {number} [ttlSeconds=86400] - TTL (default 24h)
   * @returns {Promise<void>}
   */
  async saveExecutionState(executionId, state, ttlSeconds = 86400) {
    const key = `${KEY_PREFIX.EXECUTION_STATE}${executionId}`;
    await this._redis.set(key, JSON.stringify(state));
    await this._redis.expire(key, ttlSeconds);
  }

  /**
   * Get execution state
   *
   * @param {string} executionId
   * @returns {Promise<Object|null>}
   */
  async getExecutionState(executionId) {
    const key = `${KEY_PREFIX.EXECUTION_STATE}${executionId}`;
    const data = await this._redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * List all waiting executions
   *
   * @returns {Promise<string[]>} - Execution IDs
   */
  async listWaitingExecutions() {
    const keys = await this._redis.keys(`${KEY_PREFIX.WAIT_CONTEXT}*`);
    return keys.map(k => k.replace(KEY_PREFIX.WAIT_CONTEXT, ''));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VOTE TRACKING (Async Signal System — QUORUM/VOTE modes)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Record a vote for a waiting execution (QUORUM/VOTE resolution modes).
   * Appends vote to the wait context votes array in Redis.
   *
   * @param {string} executionId - Execution ID
   * @param {Object} vote - Vote data
   * @param {string} vote.actorId - Who voted
   * @param {string} vote.actorType - HUMAN_USER | AI_AGENT | etc.
   * @param {*} vote.vote - Vote value (e.g., 'APPROVE', 'REJECT')
   * @param {number} [vote.confidence] - AI confidence 0.0-1.0
   * @param {string} [vote.reasoning] - Vote reasoning
   * @returns {Promise<Object>} Updated wait context with new vote
   * @throws {Error} If no wait context exists for execution
   */
  async recordVote(executionId, vote) {
    const data = await this.getWaitContext(executionId);
    if (!data) {
      throw new Error(`No wait context for execution ${executionId}`);
    }

    // Initialize votes array if not present (backward compat)
    if (!data.votes) data.votes = [];

    data.votes.push({
      ...vote,
      timestamp: new Date().toISOString(),
    });
    data.updatedAt = new Date().toISOString();

    const key = `${KEY_PREFIX.WAIT_CONTEXT}${executionId}`;
    // Preserve existing TTL
    const ttl = await this._redis.ttl(key);
    await this._redis.set(key, JSON.stringify(data));
    if (ttl > 0) await this._redis.expire(key, ttl);

    return data;
  }

  /**
   * Get current vote tally for a waiting execution.
   *
   * @param {string} executionId
   * @returns {Promise<Object|null>} Vote tally or null if no wait context
   */
  async getVoteTally(executionId) {
    const data = await this.getWaitContext(executionId);
    if (!data) return null;

    const votes = data.votes || [];
    const contract = data._contract;

    // If contract is available, use it for required/expected counts
    let required = 1;
    let expected = 1;
    if (contract?.resolutionPolicy) {
      const { mode, quorumRequired, participants } = contract.resolutionPolicy;
      expected = (mode === 'SINGLE' || mode === 'FORCE') ? 1 : (participants?.length || 0);
      if (mode === 'QUORUM') required = quorumRequired || Math.ceil(expected / 2);
      else if (mode === 'VOTE') required = expected;
      else required = 1;
    }

    return {
      total: votes.length,
      required,
      expected,
      votes,
      isComplete: votes.length >= required,
    };
  }

  /**
   * Set contradiction threshold for a waiting execution.
   *
   * @param {string} executionId
   * @param {number} threshold - Dynamic threshold (0.0-1.0)
   * @param {Object} [evaluation] - Threshold evaluation details
   * @returns {Promise<void>}
   */
  async setContradictionThreshold(executionId, threshold, evaluation = null) {
    const data = await this.getWaitContext(executionId);
    if (!data) return;

    data.contradictionThreshold = threshold;
    data.contradictionEvaluation = evaluation;
    data.updatedAt = new Date().toISOString();

    const key = `${KEY_PREFIX.WAIT_CONTEXT}${executionId}`;
    const ttl = await this._redis.ttl(key);
    await this._redis.set(key, JSON.stringify(data));
    if (ttl > 0) await this._redis.expire(key, ttl);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  CheckpointManager,
  KEY_PREFIX
};

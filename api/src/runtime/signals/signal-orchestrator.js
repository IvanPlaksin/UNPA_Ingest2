/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNAL ORCHESTRATOR
 * Central coordinator for async signal lifecycle:
 *   1. Initiate wait (generate token, persist, schedule timeout)
 *   2. Resume (validate token, collect votes, resolve, continue graph)
 *   3. Handle timeout (execute timeout action)
 *
 * Integrates with: CheckpointManager, TokenGenerator, VoteCollector,
 * ContradictionEvaluator, TensorService (for significance filtering).
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { AsyncSignalContract } = require('./async-signal-contract');
const { TokenGenerator } = require('./token-generator');
const { VoteCollector } = require('./vote-collector');
const { ContradictionEvaluator } = require('./contradiction-evaluator');
const { ResolutionMode, TimeoutAction, SignalType } = require('./signal-constants');

// ────────────────────────────────────────────────────────────────────────────
// SIGNAL ORCHESTRATOR
// ────────────────────────────────────────────────────────────────────────────

class SignalOrchestrator {
  /**
   * @param {object} deps - Dependencies
   * @param {object} deps.checkpointManager - CheckpointManager instance
   * @param {object} [deps.tensorService] - TensorService for significance filtering
   * @param {object} [deps.memgraphService] - For persisting SignalRecords to META
   * @param {string} [deps.tokenSecret] - HMAC secret for token generation
   * @param {Function} [deps.llmEvaluator] - LLM-based contradiction evaluator
   */
  constructor(deps = {}) {
    this._checkpoint = deps.checkpointManager;
    this._tensors = deps.tensorService || null;
    this._memgraph = deps.memgraphService || null;
    this._tokenGenerator = new TokenGenerator(deps.tokenSecret);
    this._voteCollector = new VoteCollector();
    this._contradictionEvaluator = new ContradictionEvaluator({
      llmEvaluator: deps.llmEvaluator || null,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIATE WAIT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Initiate an async signal wait.
   * Called when NodeRunner returns WAIT_FOR_INPUT with a contract.
   *
   * @param {string} executionId - Graph execution ID
   * @param {string} nodeId - Node that is waiting
   * @param {AsyncSignalContract|object} contractData - Signal contract
   * @returns {Promise<{ resumeToken: string, contract: AsyncSignalContract }>}
   */
  async initiateWait(executionId, nodeId, contractData) {
    const contract = contractData instanceof AsyncSignalContract
      ? contractData
      : new AsyncSignalContract(contractData);

    // Generate signed resume token if not already set
    if (!contract.resumeToken) {
      contract.resumeToken = this._tokenGenerator.generate(
        executionId, nodeId, contract.timeoutAt
      );
    }

    // Validate contract
    const validation = contract.validate();
    if (!validation.valid) {
      throw new Error(`Invalid signal contract: ${validation.errors.join(', ')}`);
    }

    // Save to CheckpointManager (Redis)
    await this._checkpoint.saveWaitContext(executionId, nodeId, {
      ...contract.toLegacyWaitContext(),
      _contract: contract.toJSON(),
      votes: [],
      status: 'WAITING',
    });

    // Compute contradiction threshold for VOTE modes
    if (contract.resolutionPolicy.mode === ResolutionMode.VOTE) {
      const evaluation = await this._contradictionEvaluator.evaluate(contract, {
        domain: contract.metadata?.domain,
        domainTags: contract.metadata?.domainTags,
        reversible: contract.metadata?.reversible,
        affectedStakeholders: contract.metadata?.affectedStakeholders,
      });
      await this._checkpoint.setContradictionThreshold(
        executionId, evaluation.threshold, evaluation
      );
    }

    // Track with Tensors
    this._trackTensor('signal.initiated', {
      executionId, nodeId,
      mode: contract.resolutionPolicy.mode,
      signalType: contract.signalType,
      hasAI: contract.hasAIParticipants(),
    });

    return { resumeToken: contract.resumeToken, contract };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESUME (receive signal)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Resume execution with signal payload.
   *
   * @param {string} resumeToken - Resume token
   * @param {object} payload - Signal payload (form data, vote, etc.)
   * @param {string} actorId - Who sent the signal
   * @param {string} [actorType] - Actor type (HUMAN_USER, AI_AGENT, etc.)
   * @returns {Promise<{ status: string, payload?: object, error?: string }>}
   */
  async resume(resumeToken, payload, actorId, actorType = 'HUMAN_USER') {
    // Validate token
    const tokenResult = this._tokenGenerator.validate(resumeToken);
    if (!tokenResult.valid) {
      return { status: 'INVALID_TOKEN', error: tokenResult.error };
    }

    const { executionId, nodeId } = tokenResult.payload;

    // Get wait context
    const waitCtx = await this._checkpoint.getWaitContext(executionId);
    if (!waitCtx) {
      return { status: 'NOT_FOUND', error: 'No waiting signal for this execution' };
    }

    if (waitCtx.status !== 'WAITING') {
      return { status: 'ALREADY_RESOLVED', error: `Signal already ${waitCtx.status}` };
    }

    // Reconstruct contract
    const contract = waitCtx._contract
      ? new AsyncSignalContract(waitCtx._contract)
      : AsyncSignalContract.fromLegacyWaitContext(waitCtx, executionId, nodeId);

    const mode = contract.resolutionPolicy.mode;

    // Handle based on resolution mode
    switch (mode) {
      case ResolutionMode.SINGLE:
        return this._resolveSingle(executionId, nodeId, contract, payload, actorId);

      case ResolutionMode.QUORUM:
      case ResolutionMode.VOTE:
        return this._handleVote(executionId, nodeId, contract, payload, actorId, actorType);

      case ResolutionMode.FORCE:
        return this._resolveForce(executionId, nodeId, contract, payload, actorId);

      default:
        return this._resolveSingle(executionId, nodeId, contract, payload, actorId);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TIMEOUT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Handle signal timeout.
   *
   * @param {string} executionId - Execution ID
   * @returns {Promise<{ action: string, payload?: object }>}
   */
  async handleTimeout(executionId) {
    const waitCtx = await this._checkpoint.getWaitContext(executionId);
    if (!waitCtx || waitCtx.status !== 'WAITING') {
      return { action: 'NOOP', reason: 'Already resolved or missing' };
    }

    const contract = waitCtx._contract
      ? new AsyncSignalContract(waitCtx._contract)
      : null;
    const timeoutAction = contract?.timeoutAction || waitCtx.timeout_action || 'FAIL';

    this._trackTensor('signal.timeout', { executionId, action: timeoutAction });

    // Update status
    waitCtx.status = 'EXPIRED';
    await this._checkpoint.saveWaitContext(executionId, waitCtx.nodeId, waitCtx);

    // Persist SignalRecord to META
    await this._persistSignalRecord(executionId, {
      resolutionType: 'TIMEOUT',
      resolvedAt: new Date().toISOString(),
      payloadSnapshot: null,
      voteTally: waitCtx.votes || [],
    });

    switch (timeoutAction) {
      case TimeoutAction.CONTINUE_DEFAULT: {
        const defaultPayload = contract?.resolutionPolicy?.defaultPayload || {};
        return { action: 'CONTINUE', payload: defaultPayload };
      }
      case TimeoutAction.FAIL:
        return { action: 'FAIL' };
      case TimeoutAction.ESCALATE:
        return { action: 'ESCALATE', escalateTo: contract?.metadata?.escalateTo };
      case TimeoutAction.SKIP:
        return { action: 'SKIP' };
      default:
        return { action: 'FAIL' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get signal status for an execution.
   */
  async getStatus(executionId) {
    const waitCtx = await this._checkpoint.getWaitContext(executionId);
    if (!waitCtx) return null;

    const contract = waitCtx._contract
      ? new AsyncSignalContract(waitCtx._contract)
      : null;

    return {
      executionId,
      nodeId: waitCtx.nodeId,
      status: waitCtx.status,
      mode: contract?.resolutionPolicy?.mode || 'SINGLE',
      votes: (waitCtx.votes || []).length,
      expectedVotes: contract?.getExpectedVotes() || 1,
      requiredVotes: contract?.getRequiredVotes() || 1,
      timeoutAt: waitCtx.timeout_at,
      isExpired: contract?.isExpired() || false,
      contradictionThreshold: waitCtx.contradictionThreshold,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Resolution handlers
  // ══════════════════════════════════════════════════════════════════════════

  async _resolveSingle(executionId, nodeId, contract, payload, actorId) {
    this._trackTensor('signal.resolved', {
      executionId, nodeId, mode: 'SINGLE',
    });

    await this._finalizeSignal(executionId, {
      status: 'RESOLVED',
      resolutionType: 'SINGLE',
      resolvedPayload: payload,
      resolvedBy: actorId,
    });

    return { status: 'RESOLVED', payload, executionId, nodeId };
  }

  async _handleVote(executionId, nodeId, contract, payload, actorId, actorType) {
    const waitCtx = await this._checkpoint.getWaitContext(executionId);
    const existingVotes = waitCtx.votes || [];

    // Record vote
    const vote = {
      actorId,
      actorType,
      vote: payload.vote || payload,
      confidence: payload.confidence,
      reasoning: payload.reasoning,
    };

    const result = this._voteCollector.recordVote(contract, existingVotes, vote);

    if (!result.recorded) {
      return { status: 'VOTE_REJECTED', error: result.error };
    }

    // Persist vote
    await this._checkpoint.recordVote(executionId, vote);

    this._trackTensor('signal.vote_received', {
      executionId, actorId, actorType,
      votesTotal: result.votes.length,
    });

    // Check for contradictions (VOTE mode only)
    if (contract.resolutionPolicy.mode === ResolutionMode.VOTE && result.votes.length >= 2) {
      const threshold = waitCtx.contradictionThreshold || 0.5;
      const contradiction = this._contradictionEvaluator.detectContradiction(
        result.votes, threshold
      );

      if (contradiction.detected) {
        this._trackTensor('signal.contradiction', {
          executionId, score: contradiction.score, threshold,
        });

        // Persist ContradictionRecord
        await this._persistContradictionRecord(executionId, {
          thresholdUsed: threshold,
          contradictionScore: contradiction.score,
          reason: contradiction.reason,
          votes: result.votes,
        });

        // If tieBreak is ESCALATE, return escalation
        if (contract.resolutionPolicy.tieBreak === 'ESCALATE') {
          return {
            status: 'ESCALATED',
            reason: contradiction.reason,
            executionId,
            nodeId,
          };
        }
      }
    }

    // Check if vote is complete
    if (result.resolved) {
      this._trackTensor('signal.resolved', {
        executionId, nodeId, mode: contract.resolutionPolicy.mode,
      });

      await this._finalizeSignal(executionId, {
        status: 'RESOLVED',
        resolutionType: contract.resolutionPolicy.mode,
        resolvedPayload: result.result,
        voteTally: result.result.tally,
        resolvedBy: actorId,
      });

      return {
        status: 'RESOLVED',
        payload: result.result,
        executionId,
        nodeId,
      };
    }

    return {
      status: 'VOTE_RECORDED',
      votesReceived: result.votes.length,
      votesRequired: contract.getRequiredVotes(),
      executionId,
    };
  }

  async _resolveForce(executionId, nodeId, contract, payload, actorId) {
    // Check if actor is authorized for FORCE
    const authorized = contract.resolutionPolicy.forceAuthorizedActors || [];
    if (authorized.length > 0 && !authorized.includes(actorId)) {
      return { status: 'FORCE_DENIED', error: 'Actor not authorized for FORCE resolution' };
    }

    this._trackTensor('signal.force_resolved', { executionId, nodeId, actorId });

    await this._finalizeSignal(executionId, {
      status: 'RESOLVED',
      resolutionType: 'FORCE',
      resolvedPayload: payload,
      resolvedBy: actorId,
      forced: true,
    });

    return { status: 'RESOLVED', payload, executionId, nodeId, forced: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Finalization & persistence
  // ══════════════════════════════════════════════════════════════════════════

  async _finalizeSignal(executionId, resolution) {
    // Update wait context status
    const waitCtx = await this._checkpoint.getWaitContext(executionId);
    if (waitCtx) {
      waitCtx.status = 'RESOLVED';
      waitCtx.resolvedAt = new Date().toISOString();
      waitCtx.resolution = resolution;
      const key = `gxe:wait:${executionId}`;
      if (this._checkpoint._redis) {
        await this._checkpoint._redis.set(key, JSON.stringify(waitCtx));
      }
    }

    // Persist SignalRecord to Memgraph META
    await this._persistSignalRecord(executionId, {
      resolutionType: resolution.resolutionType,
      resolvedAt: new Date().toISOString(),
      payloadSnapshot: resolution.resolvedPayload,
      voteTally: resolution.voteTally,
      resolvedBy: resolution.resolvedBy,
    });
  }

  async _persistSignalRecord(executionId, record) {
    if (!this._memgraph) return;

    try {
      await this._memgraph.executeQuery(`
        CREATE (sr:SignalRecord {
          executionId: $executionId,
          resolutionType: $resolutionType,
          resolvedAt: $resolvedAt,
          payloadSnapshot: $payloadSnapshot,
          voteTally: $voteTally,
          namespace: 'META',
          createdAt: datetime()
        })
      `, {
        executionId,
        resolutionType: record.resolutionType,
        resolvedAt: record.resolvedAt,
        payloadSnapshot: JSON.stringify(record.payloadSnapshot),
        voteTally: JSON.stringify(record.voteTally),
      });
    } catch (e) {
      // Non-critical — log but don't fail
      console.error('[SignalOrchestrator] Failed to persist SignalRecord:', e.message);
    }
  }

  async _persistContradictionRecord(executionId, record) {
    if (!this._memgraph) return;

    try {
      await this._memgraph.executeQuery(`
        CREATE (cr:ContradictionRecord {
          executionId: $executionId,
          thresholdUsed: $threshold,
          contradictionScore: $score,
          reasoning: $reason,
          namespace: 'META',
          createdAt: datetime()
        })
      `, {
        executionId,
        threshold: record.thresholdUsed,
        score: record.contradictionScore,
        reason: record.reason,
      });
    } catch (e) {
      console.error('[SignalOrchestrator] Failed to persist ContradictionRecord:', e.message);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Tensor tracking
  // ══════════════════════════════════════════════════════════════════════════

  _trackTensor(name, context) {
    if (!this._tensors) return;
    try {
      const tensor = this._tensors.start(name, context);
      if (tensor) this._tensors.complete(tensor.id, context);
    } catch {
      // Non-critical
    }
  }
}

module.exports = { SignalOrchestrator };

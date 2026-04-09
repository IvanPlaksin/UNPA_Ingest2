/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASYNC SIGNAL CONTRACT
 * Universal contract for async signal waiting in GXE graph execution.
 *
 * Extends the legacy waitContext with support for:
 *   - Multiple resolution modes (SINGLE/QUORUM/VOTE/FORCE)
 *   - AI Society voting (AI agents as participants)
 *   - FormBuilder integration (payloadSchema from FormDefinition)
 *   - Dynamic contradiction threshold
 *   - Backward compatibility with existing WAIT_FOR_INPUT
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  SignalType,
  ResolutionMode,
  TimeoutAction,
  ParticipantType,
} = require('./signal-constants');

// ────────────────────────────────────────────────────────────────────────────
// ASYNC SIGNAL CONTRACT
// ────────────────────────────────────────────────────────────────────────────

class AsyncSignalContract {
  /**
   * @param {object} data - Contract configuration
   * @param {string} data.signalType - Type of signal (USER_INPUT, APPROVAL, VOTE, etc.)
   * @param {string} data.resumeToken - Unique resume token (UUID + HMAC)
   * @param {object} data.payloadSchema - JSON Schema for expected input
   * @param {string} data.timeoutAt - ISO datetime expiration
   * @param {string} data.timeoutAction - Action on timeout
   * @param {object} data.contextRef - { execution_id, node_id, checkpoint_id }
   * @param {object} [data.resolutionPolicy] - Resolution policy
   * @param {string} [data.formId] - FormDefinition ID in KB
   * @param {string} [data.contextMessage] - Human-readable context
   * @param {object} [data.metadata] - Arbitrary metadata
   */
  constructor(data = {}) {
    this.signalType = data.signalType || SignalType.USER_INPUT;
    this.resumeToken = data.resumeToken || null;
    this.payloadSchema = data.payloadSchema || { type: 'object' };
    this.timeoutAt = data.timeoutAt || null;
    this.timeoutAction = data.timeoutAction || TimeoutAction.FAIL;
    this.contextRef = data.contextRef || {};
    this.resolutionPolicy = this._normalizePolicy(data.resolutionPolicy);
    this.formId = data.formId || null;
    this.contextMessage = data.contextMessage || null;
    this.metadata = data.metadata || {};
    this.createdAt = data.createdAt || new Date().toISOString();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check if this is a simple single-participant wait (legacy compatible).
   */
  isSimpleWait() {
    return this.resolutionPolicy.mode === ResolutionMode.SINGLE &&
           this.resolutionPolicy.participants.length <= 1;
  }

  /**
   * Check if AI agents are involved in resolution.
   */
  hasAIParticipants() {
    return this.resolutionPolicy.participants.some(p =>
      p.type === ParticipantType.AI_AGENT ||
      p.type === ParticipantType.AI_AGENT_POOL
    );
  }

  /**
   * Get total expected votes.
   */
  getExpectedVotes() {
    const { mode, participants } = this.resolutionPolicy;
    if (mode === ResolutionMode.SINGLE || mode === ResolutionMode.FORCE) return 1;
    return participants.length;
  }

  /**
   * Get number of votes required for resolution.
   */
  getRequiredVotes() {
    const { mode, quorumRequired, participants } = this.resolutionPolicy;
    if (mode === ResolutionMode.SINGLE || mode === ResolutionMode.FORCE) return 1;
    if (mode === ResolutionMode.QUORUM) return quorumRequired || Math.ceil(participants.length / 2);
    if (mode === ResolutionMode.VOTE) return participants.length;
    return 1;
  }

  /**
   * Check if a timeout has been reached.
   */
  isExpired() {
    if (!this.timeoutAt) return false;
    return new Date() >= new Date(this.timeoutAt);
  }

  /**
   * Get milliseconds until timeout.
   */
  getTimeoutMs() {
    if (!this.timeoutAt) return Infinity;
    return Math.max(0, new Date(this.timeoutAt).getTime() - Date.now());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BACKWARD COMPATIBILITY
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Convert to legacy waitContext format (for existing NodeRunner/CheckpointManager).
   */
  toLegacyWaitContext() {
    return {
      resume_token: this.resumeToken,
      expected_inputs: this.payloadSchema,
      recipients: this.resolutionPolicy.participants.map(p => p.refId),
      timeout_at: this.timeoutAt,
      timeout_action: this.timeoutAction,
      prompt: this.contextMessage,
      choices: null,
      response: this.contextMessage,
      // Extended: full contract available for SignalOrchestrator
      _contract: this,
    };
  }

  /**
   * Create from legacy waitContext (migration path).
   * @param {object} waitContext - Legacy WAIT_FOR_INPUT context
   * @param {string} executionId
   * @param {string} nodeId
   * @returns {AsyncSignalContract}
   */
  static fromLegacyWaitContext(waitContext, executionId, nodeId) {
    return new AsyncSignalContract({
      signalType: SignalType.USER_INPUT,
      resumeToken: waitContext.resume_token,
      payloadSchema: waitContext.expected_inputs || { type: 'object' },
      timeoutAt: waitContext.timeout_at,
      timeoutAction: waitContext.timeout_action || TimeoutAction.FAIL,
      contextRef: {
        execution_id: executionId,
        node_id: nodeId,
      },
      resolutionPolicy: {
        mode: ResolutionMode.SINGLE,
        participants: (waitContext.recipients || []).map(r => ({
          type: ParticipantType.HUMAN_USER,
          refId: r,
          weight: 1.0,
        })),
      },
      contextMessage: waitContext.prompt,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Validate contract structure.
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validate() {
    const errors = [];

    if (!this.resumeToken) errors.push('resumeToken is required');
    if (!this.timeoutAt) errors.push('timeoutAt is required');
    if (!this.contextRef?.execution_id) errors.push('contextRef.execution_id is required');
    if (!this.contextRef?.node_id) errors.push('contextRef.node_id is required');

    // Validate signalType
    if (!Object.values(SignalType).includes(this.signalType)) {
      errors.push(`Invalid signalType: ${this.signalType}`);
    }

    // Validate timeoutAction
    if (!Object.values(TimeoutAction).includes(this.timeoutAction)) {
      errors.push(`Invalid timeoutAction: ${this.timeoutAction}`);
    }

    // Mode-specific validation
    const { mode, quorumRequired, voteOptions, participants, forceAuthorizedActors } = this.resolutionPolicy;

    if (!Object.values(ResolutionMode).includes(mode)) {
      errors.push(`Invalid resolution mode: ${mode}`);
    }

    if (mode === ResolutionMode.QUORUM) {
      if (!quorumRequired || quorumRequired < 1) {
        errors.push('quorumRequired must be >= 1 for QUORUM mode');
      }
      if (quorumRequired > participants.length) {
        errors.push('quorumRequired cannot exceed number of participants');
      }
    }

    if (mode === ResolutionMode.VOTE) {
      if (!voteOptions || voteOptions.length === 0) {
        errors.push('voteOptions are required for VOTE mode');
      }
      if (participants.length < 2) {
        errors.push('VOTE mode requires at least 2 participants');
      }
    }

    if (mode === ResolutionMode.FORCE) {
      if (!forceAuthorizedActors || forceAuthorizedActors.length === 0) {
        errors.push('forceAuthorizedActors are required for FORCE mode');
      }
    }

    // Validate participants
    for (let i = 0; i < participants.length; i++) {
      const p = participants[i];
      if (!p.refId) errors.push(`Participant[${i}].refId is required`);
      if (!Object.values(ParticipantType).includes(p.type)) {
        errors.push(`Participant[${i}].type is invalid: ${p.type}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  toJSON() {
    return {
      signalType: this.signalType,
      resumeToken: this.resumeToken,
      payloadSchema: this.payloadSchema,
      timeoutAt: this.timeoutAt,
      timeoutAction: this.timeoutAction,
      contextRef: this.contextRef,
      resolutionPolicy: this.resolutionPolicy,
      formId: this.formId,
      contextMessage: this.contextMessage,
      metadata: this.metadata,
      createdAt: this.createdAt,
    };
  }

  static fromJSON(json) {
    return new AsyncSignalContract(json);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL
  // ══════════════════════════════════════════════════════════════════════════

  _normalizePolicy(policy) {
    if (!policy) {
      return {
        mode: ResolutionMode.SINGLE,
        participants: [],
      };
    }
    return {
      mode: policy.mode || ResolutionMode.SINGLE,
      participants: (policy.participants || []).map(p => ({
        type: p.type || ParticipantType.HUMAN_USER,
        refId: p.refId,
        weight: p.weight ?? 1.0,
        deadlineOverride: p.deadlineOverride || null,
      })),
      quorumRequired: policy.quorumRequired || null,
      quorumStrategy: policy.quorumStrategy || null,
      voteOptions: policy.voteOptions || null,
      resolutionStrategy: policy.resolutionStrategy || null,
      tieBreak: policy.tieBreak || null,
      forceAuthorizedActors: policy.forceAuthorizedActors || null,
    };
  }
}

module.exports = { AsyncSignalContract };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASYNC SIGNAL CONTRACT TESTS
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { AsyncSignalContract } = require('../async-signal-contract');
const {
  SignalType,
  ResolutionMode,
  TimeoutAction,
  ParticipantType,
} = require('../signal-constants');

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

function makeValidContract(overrides = {}) {
  return new AsyncSignalContract({
    signalType: SignalType.USER_INPUT,
    resumeToken: 'tok-123-abc',
    payloadSchema: { type: 'object', properties: { name: { type: 'string' } } },
    timeoutAt: new Date(Date.now() + 3600000).toISOString(),
    timeoutAction: TimeoutAction.FAIL,
    contextRef: { execution_id: 'exec-1', node_id: 'G0-N05' },
    resolutionPolicy: {
      mode: ResolutionMode.SINGLE,
      participants: [{ type: ParticipantType.HUMAN_USER, refId: 'user-1', weight: 1.0 }],
    },
    contextMessage: 'Please fill out the equipment request form',
    ...overrides,
  });
}

function makeQuorumContract(quorumRequired = 2) {
  return makeValidContract({
    resolutionPolicy: {
      mode: ResolutionMode.QUORUM,
      quorumRequired,
      quorumStrategy: 'ANY_PAYLOAD',
      participants: [
        { type: ParticipantType.HUMAN_USER, refId: 'user-1', weight: 1.0 },
        { type: ParticipantType.HUMAN_USER, refId: 'user-2', weight: 1.0 },
        { type: ParticipantType.HUMAN_USER, refId: 'user-3', weight: 1.0 },
      ],
    },
  });
}

function makeVoteContract() {
  return makeValidContract({
    signalType: SignalType.VOTE,
    resolutionPolicy: {
      mode: ResolutionMode.VOTE,
      voteOptions: [{ value: 'APPROVE', label: 'Approve' }, { value: 'REJECT', label: 'Reject' }],
      resolutionStrategy: 'WEIGHTED',
      tieBreak: 'ESCALATE',
      participants: [
        { type: ParticipantType.AI_AGENT, refId: 'risk-analyst', weight: 0.4 },
        { type: ParticipantType.AI_AGENT, refId: 'compliance-officer', weight: 0.3 },
        { type: ParticipantType.HUMAN_USER, refId: 'manager-1', weight: 0.3 },
      ],
    },
  });
}

function makeForceContract() {
  return makeValidContract({
    resolutionPolicy: {
      mode: ResolutionMode.FORCE,
      forceAuthorizedActors: ['admin-1', 'director-1'],
      participants: [{ type: ParticipantType.HUMAN_USER, refId: 'admin-1', weight: 1.0 }],
    },
  });
}

// ────────────────────────────────────────────────────────────────────────────
// TESTS
// ────────────────────────────────────────────────────────────────────────────

describe('AsyncSignalContract', () => {

  describe('constructor', () => {
    test('creates SINGLE mode by default', () => {
      const c = new AsyncSignalContract({});
      expect(c.signalType).toBe(SignalType.USER_INPUT);
      expect(c.resolutionPolicy.mode).toBe(ResolutionMode.SINGLE);
      expect(c.resolutionPolicy.participants).toEqual([]);
      expect(c.timeoutAction).toBe(TimeoutAction.FAIL);
    });

    test('accepts full configuration', () => {
      const c = makeVoteContract();
      expect(c.signalType).toBe(SignalType.VOTE);
      expect(c.resolutionPolicy.mode).toBe(ResolutionMode.VOTE);
      expect(c.resolutionPolicy.participants).toHaveLength(3);
      expect(c.resolutionPolicy.voteOptions).toHaveLength(2);
      expect(c.resolutionPolicy.resolutionStrategy).toBe('WEIGHTED');
    });

    test('normalizes participant weights', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.SINGLE,
          participants: [{ type: ParticipantType.HUMAN_USER, refId: 'u1' }],
        },
      });
      expect(c.resolutionPolicy.participants[0].weight).toBe(1.0);
    });

    test('sets createdAt automatically', () => {
      const c = new AsyncSignalContract({});
      expect(c.createdAt).toBeDefined();
      expect(new Date(c.createdAt).getTime()).toBeGreaterThan(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('isSimpleWait()', () => {
    test('returns true for SINGLE with 0 participants', () => {
      const c = new AsyncSignalContract({});
      expect(c.isSimpleWait()).toBe(true);
    });

    test('returns true for SINGLE with 1 participant', () => {
      const c = makeValidContract();
      expect(c.isSimpleWait()).toBe(true);
    });

    test('returns false for QUORUM', () => {
      const c = makeQuorumContract();
      expect(c.isSimpleWait()).toBe(false);
    });

    test('returns false for VOTE', () => {
      const c = makeVoteContract();
      expect(c.isSimpleWait()).toBe(false);
    });

    test('returns false for FORCE', () => {
      const c = makeForceContract();
      expect(c.isSimpleWait()).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('hasAIParticipants()', () => {
    test('returns false for human-only', () => {
      const c = makeValidContract();
      expect(c.hasAIParticipants()).toBe(false);
    });

    test('returns true when AI_AGENT present', () => {
      const c = makeVoteContract();
      expect(c.hasAIParticipants()).toBe(true);
    });

    test('returns true when AI_AGENT_POOL present', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.SINGLE,
          participants: [{ type: ParticipantType.AI_AGENT_POOL, refId: 'pool-1' }],
        },
      });
      expect(c.hasAIParticipants()).toBe(true);
    });

    test('returns false for empty participants', () => {
      const c = new AsyncSignalContract({});
      expect(c.hasAIParticipants()).toBe(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('getExpectedVotes() / getRequiredVotes()', () => {
    test('SINGLE returns 1/1', () => {
      const c = makeValidContract();
      expect(c.getExpectedVotes()).toBe(1);
      expect(c.getRequiredVotes()).toBe(1);
    });

    test('FORCE returns 1/1', () => {
      const c = makeForceContract();
      expect(c.getExpectedVotes()).toBe(1);
      expect(c.getRequiredVotes()).toBe(1);
    });

    test('QUORUM returns participants.length / quorumRequired', () => {
      const c = makeQuorumContract(2);
      expect(c.getExpectedVotes()).toBe(3);
      expect(c.getRequiredVotes()).toBe(2);
    });

    test('QUORUM defaults to ceil(n/2) when quorumRequired not set', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.QUORUM,
          participants: [
            { type: ParticipantType.HUMAN_USER, refId: 'u1' },
            { type: ParticipantType.HUMAN_USER, refId: 'u2' },
            { type: ParticipantType.HUMAN_USER, refId: 'u3' },
          ],
        },
      });
      expect(c.getRequiredVotes()).toBe(2); // ceil(3/2)
    });

    test('VOTE returns participants.length / participants.length', () => {
      const c = makeVoteContract();
      expect(c.getExpectedVotes()).toBe(3);
      expect(c.getRequiredVotes()).toBe(3); // all must vote
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('isExpired() / getTimeoutMs()', () => {
    test('not expired when timeout is in future', () => {
      const c = makeValidContract();
      expect(c.isExpired()).toBe(false);
      expect(c.getTimeoutMs()).toBeGreaterThan(0);
    });

    test('expired when timeout is in past', () => {
      const c = makeValidContract({
        timeoutAt: new Date(Date.now() - 1000).toISOString(),
      });
      expect(c.isExpired()).toBe(true);
      expect(c.getTimeoutMs()).toBe(0);
    });

    test('not expired when no timeoutAt', () => {
      const c = new AsyncSignalContract({});
      expect(c.isExpired()).toBe(false);
      expect(c.getTimeoutMs()).toBe(Infinity);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('toLegacyWaitContext()', () => {
    test('maps fields correctly', () => {
      const c = makeValidContract();
      const legacy = c.toLegacyWaitContext();

      expect(legacy.resume_token).toBe('tok-123-abc');
      expect(legacy.expected_inputs).toEqual(c.payloadSchema);
      expect(legacy.recipients).toEqual(['user-1']);
      expect(legacy.timeout_at).toBe(c.timeoutAt);
      expect(legacy.timeout_action).toBe('FAIL');
      expect(legacy.prompt).toBe('Please fill out the equipment request form');
    });

    test('includes _contract reference', () => {
      const c = makeValidContract();
      const legacy = c.toLegacyWaitContext();
      expect(legacy._contract).toBe(c);
    });

    test('maps multiple participants to recipients', () => {
      const c = makeQuorumContract();
      const legacy = c.toLegacyWaitContext();
      expect(legacy.recipients).toEqual(['user-1', 'user-2', 'user-3']);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('fromLegacyWaitContext()', () => {
    test('creates SINGLE mode contract', () => {
      const legacy = {
        resume_token: 'tok-old-123',
        expected_inputs: { type: 'object' },
        recipients: ['user-A'],
        timeout_at: '2026-04-01T00:00:00Z',
        timeout_action: 'ESCALATE',
        prompt: 'Enter data',
      };

      const c = AsyncSignalContract.fromLegacyWaitContext(legacy, 'exec-1', 'G0-N03');

      expect(c.signalType).toBe(SignalType.USER_INPUT);
      expect(c.resumeToken).toBe('tok-old-123');
      expect(c.resolutionPolicy.mode).toBe(ResolutionMode.SINGLE);
      expect(c.timeoutAction).toBe(TimeoutAction.ESCALATE);
      expect(c.contextRef.execution_id).toBe('exec-1');
      expect(c.contextRef.node_id).toBe('G0-N03');
    });

    test('maps recipients to HUMAN_USER participants', () => {
      const legacy = {
        resume_token: 'tok-1',
        recipients: ['user-A', 'user-B'],
        timeout_at: '2026-04-01T00:00:00Z',
      };

      const c = AsyncSignalContract.fromLegacyWaitContext(legacy, 'exec-1', 'N1');
      expect(c.resolutionPolicy.participants).toHaveLength(2);
      expect(c.resolutionPolicy.participants[0].type).toBe(ParticipantType.HUMAN_USER);
      expect(c.resolutionPolicy.participants[0].refId).toBe('user-A');
      expect(c.resolutionPolicy.participants[1].refId).toBe('user-B');
    });

    test('handles missing optional fields', () => {
      const legacy = { resume_token: 'tok-1', timeout_at: '2026-04-01T00:00:00Z' };
      const c = AsyncSignalContract.fromLegacyWaitContext(legacy, 'e1', 'n1');
      expect(c.timeoutAction).toBe(TimeoutAction.FAIL);
      expect(c.resolutionPolicy.participants).toEqual([]);
      expect(c.contextMessage).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('validate()', () => {
    test('valid contract passes', () => {
      const c = makeValidContract();
      const result = c.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('requires resumeToken', () => {
      const c = makeValidContract({ resumeToken: null });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('resumeToken is required');
    });

    test('requires timeoutAt', () => {
      const c = makeValidContract({ timeoutAt: null });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('timeoutAt is required');
    });

    test('requires contextRef.execution_id', () => {
      const c = makeValidContract({ contextRef: { node_id: 'N1' } });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('contextRef.execution_id is required');
    });

    test('requires contextRef.node_id', () => {
      const c = makeValidContract({ contextRef: { execution_id: 'e1' } });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('contextRef.node_id is required');
    });

    test('QUORUM requires quorumRequired >= 1', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.QUORUM,
          participants: [
            { type: ParticipantType.HUMAN_USER, refId: 'u1' },
            { type: ParticipantType.HUMAN_USER, refId: 'u2' },
          ],
        },
      });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('quorumRequired'))).toBe(true);
    });

    test('QUORUM rejects quorumRequired > participants', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.QUORUM,
          quorumRequired: 5,
          participants: [
            { type: ParticipantType.HUMAN_USER, refId: 'u1' },
            { type: ParticipantType.HUMAN_USER, refId: 'u2' },
          ],
        },
      });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot exceed'))).toBe(true);
    });

    test('VOTE requires voteOptions', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.VOTE,
          participants: [
            { type: ParticipantType.HUMAN_USER, refId: 'u1' },
            { type: ParticipantType.HUMAN_USER, refId: 'u2' },
          ],
        },
      });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('voteOptions'))).toBe(true);
    });

    test('VOTE requires at least 2 participants', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.VOTE,
          voteOptions: [{ value: 'YES' }, { value: 'NO' }],
          participants: [{ type: ParticipantType.HUMAN_USER, refId: 'u1' }],
        },
      });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('at least 2'))).toBe(true);
    });

    test('FORCE requires forceAuthorizedActors', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.FORCE,
          participants: [{ type: ParticipantType.HUMAN_USER, refId: 'admin' }],
        },
      });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('forceAuthorizedActors'))).toBe(true);
    });

    test('validates participant refId', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.SINGLE,
          participants: [{ type: ParticipantType.HUMAN_USER }], // missing refId
        },
      });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('refId'))).toBe(true);
    });

    test('validates participant type', () => {
      const c = makeValidContract({
        resolutionPolicy: {
          mode: ResolutionMode.SINGLE,
          participants: [{ type: 'INVALID_TYPE', refId: 'u1' }],
        },
      });
      const result = c.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('type is invalid'))).toBe(true);
    });

    test('valid QUORUM passes', () => {
      const c = makeQuorumContract(2);
      expect(c.validate().valid).toBe(true);
    });

    test('valid VOTE passes', () => {
      const c = makeVoteContract();
      expect(c.validate().valid).toBe(true);
    });

    test('valid FORCE passes', () => {
      const c = makeForceContract();
      expect(c.validate().valid).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('serialization', () => {
    test('toJSON() returns plain object', () => {
      const c = makeValidContract();
      const json = c.toJSON();
      expect(json.signalType).toBe(SignalType.USER_INPUT);
      expect(json.resumeToken).toBe('tok-123-abc');
      expect(json.resolutionPolicy.mode).toBe(ResolutionMode.SINGLE);
      expect(typeof json).toBe('object');
      // Should not have class methods
      expect(json.isSimpleWait).toBeUndefined();
    });

    test('fromJSON() reconstructs contract', () => {
      const original = makeVoteContract();
      const json = original.toJSON();
      const restored = AsyncSignalContract.fromJSON(json);

      expect(restored.signalType).toBe(original.signalType);
      expect(restored.resumeToken).toBe(original.resumeToken);
      expect(restored.resolutionPolicy.mode).toBe(original.resolutionPolicy.mode);
      expect(restored.resolutionPolicy.participants).toHaveLength(3);
      expect(restored.validate().valid).toBe(true);
    });

    test('JSON.stringify roundtrip', () => {
      const original = makeQuorumContract();
      const str = JSON.stringify(original);
      const restored = AsyncSignalContract.fromJSON(JSON.parse(str));
      expect(restored.resolutionPolicy.quorumRequired).toBe(2);
      expect(restored.getRequiredVotes()).toBe(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────

  describe('AI Society scenarios', () => {
    test('mixed human + AI vote', () => {
      const c = makeVoteContract();
      expect(c.hasAIParticipants()).toBe(true);
      expect(c.resolutionPolicy.participants.filter(p =>
        p.type === ParticipantType.AI_AGENT
      )).toHaveLength(2);
      expect(c.resolutionPolicy.participants.filter(p =>
        p.type === ParticipantType.HUMAN_USER
      )).toHaveLength(1);
    });

    test('weighted vote totals', () => {
      const c = makeVoteContract();
      const totalWeight = c.resolutionPolicy.participants.reduce((s, p) => s + p.weight, 0);
      expect(totalWeight).toBeCloseTo(1.0, 5);
    });
  });
});

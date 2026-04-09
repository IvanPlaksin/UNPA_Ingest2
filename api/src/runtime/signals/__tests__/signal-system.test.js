/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNAL SYSTEM TESTS
 * Tests for TokenGenerator, VoteCollector, ContradictionEvaluator,
 * and SignalOrchestrator.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { TokenGenerator } = require('../token-generator');
const { VoteCollector } = require('../vote-collector');
const { ContradictionEvaluator } = require('../contradiction-evaluator');
const { SignalOrchestrator } = require('../signal-orchestrator');
const { AsyncSignalContract } = require('../async-signal-contract');
const { ResolutionMode, ParticipantType, SignalType, TimeoutAction } = require('../signal-constants');

// ────────────────────────────────────────────────────────────────────────────
// TOKEN GENERATOR
// ────────────────────────────────────────────────────────────────────────────

describe('TokenGenerator', () => {
  const gen = new TokenGenerator('test-secret-key');

  test('generates a token with correct format', () => {
    const token = gen.generate('exec-1', 'G0-N05', '2026-12-31T00:00:00Z');
    expect(token).toBeDefined();
    expect(token.split('.')).toHaveLength(2);
  });

  test('validates a valid token', () => {
    const token = gen.generate('exec-1', 'G0-N05', '2026-12-31T00:00:00Z');
    const result = gen.validate(token);
    expect(result.valid).toBe(true);
    expect(result.payload.executionId).toBe('exec-1');
    expect(result.payload.nodeId).toBe('G0-N05');
    expect(result.payload.tokenId).toBeDefined();
  });

  test('rejects tampered token', () => {
    const token = gen.generate('exec-1', 'G0-N05', '2026-12-31T00:00:00Z');
    const tampered = 'tampered' + token.slice(8);
    const result = gen.validate(tampered);
    expect(result.valid).toBe(false);
  });

  test('rejects expired token', () => {
    const token = gen.generate('exec-1', 'G0-N05', '2020-01-01T00:00:00Z');
    const result = gen.validate(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token expired');
  });

  test('rejects wrong secret', () => {
    const gen2 = new TokenGenerator('different-secret');
    const token = gen.generate('exec-1', 'G0-N05', '2026-12-31T00:00:00Z');
    const result = gen2.validate(token);
    expect(result.valid).toBe(false);
  });

  test('rejects null/empty token', () => {
    expect(gen.validate(null).valid).toBe(false);
    expect(gen.validate('').valid).toBe(false);
  });

  test('decode returns payload without validation', () => {
    const token = gen.generate('exec-1', 'N1', '2026-12-31T00:00:00Z');
    const decoded = gen.decode(token);
    expect(decoded.eid).toBe('exec-1');
    expect(decoded.nid).toBe('N1');
  });

  test('each token has unique jti', () => {
    const t1 = gen.generate('e1', 'n1', '2026-12-31T00:00:00Z');
    const t2 = gen.generate('e1', 'n1', '2026-12-31T00:00:00Z');
    const d1 = gen.decode(t1);
    const d2 = gen.decode(t2);
    expect(d1.jti).not.toBe(d2.jti);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// VOTE COLLECTOR
// ────────────────────────────────────────────────────────────────────────────

describe('VoteCollector', () => {
  const vc = new VoteCollector();

  function makeContract(mode, opts = {}) {
    return new AsyncSignalContract({
      resumeToken: 'tok-1',
      timeoutAt: '2026-12-31T00:00:00Z',
      contextRef: { execution_id: 'e1', node_id: 'n1' },
      resolutionPolicy: {
        mode,
        participants: opts.participants || [
          { type: ParticipantType.HUMAN_USER, refId: 'u1', weight: 0.5 },
          { type: ParticipantType.HUMAN_USER, refId: 'u2', weight: 0.3 },
          { type: ParticipantType.AI_AGENT, refId: 'a1', weight: 0.2 },
        ],
        quorumRequired: opts.quorumRequired,
        voteOptions: opts.voteOptions || [{ value: 'APPROVE' }, { value: 'REJECT' }],
        resolutionStrategy: opts.resolutionStrategy || 'MAJORITY',
        tieBreak: opts.tieBreak || 'ESCALATE',
        forceAuthorizedActors: opts.forceAuthorizedActors,
      },
    });
  }

  describe('SINGLE mode', () => {
    test('resolves on first vote', () => {
      const c = makeContract(ResolutionMode.SINGLE);
      const result = vc.recordVote(c, [], { actorId: 'u1', vote: 'APPROVE' });
      expect(result.recorded).toBe(true);
      expect(result.resolved).toBe(true);
    });
  });

  describe('QUORUM mode', () => {
    test('resolves when quorum reached', () => {
      const c = makeContract(ResolutionMode.QUORUM, { quorumRequired: 2 });
      let result = vc.recordVote(c, [], { actorId: 'u1', vote: 'APPROVE' });
      expect(result.resolved).toBe(false);

      result = vc.recordVote(c, result.votes, { actorId: 'u2', vote: 'APPROVE' });
      expect(result.resolved).toBe(true);
    });

    test('rejects duplicate votes', () => {
      const c = makeContract(ResolutionMode.QUORUM, { quorumRequired: 2 });
      const v1 = vc.recordVote(c, [], { actorId: 'u1', vote: 'APPROVE' });
      const v2 = vc.recordVote(c, v1.votes, { actorId: 'u1', vote: 'REJECT' });
      expect(v2.recorded).toBe(false);
      expect(v2.error).toContain('Duplicate');
    });
  });

  describe('VOTE mode', () => {
    test('requires all participants to vote', () => {
      const c = makeContract(ResolutionMode.VOTE);
      let votes = [];
      let result = vc.recordVote(c, votes, { actorId: 'u1', vote: 'APPROVE' });
      votes = result.votes;
      expect(result.resolved).toBe(false);

      result = vc.recordVote(c, votes, { actorId: 'u2', vote: 'APPROVE' });
      votes = result.votes;
      expect(result.resolved).toBe(false);

      result = vc.recordVote(c, votes, { actorId: 'a1', vote: 'REJECT' });
      expect(result.resolved).toBe(true);
    });

    test('rejects unauthorized voter', () => {
      const c = makeContract(ResolutionMode.VOTE);
      const result = vc.recordVote(c, [], { actorId: 'unknown', vote: 'APPROVE' });
      expect(result.recorded).toBe(false);
      expect(result.error).toContain('not authorized');
    });
  });

  describe('resolution strategies', () => {
    test('MAJORITY: most votes wins', () => {
      const c = makeContract(ResolutionMode.VOTE, { resolutionStrategy: 'MAJORITY' });
      const votes = [
        { actorId: 'u1', vote: 'APPROVE' },
        { actorId: 'u2', vote: 'APPROVE' },
        { actorId: 'a1', vote: 'REJECT' },
      ];
      const result = vc.resolve(c, votes);
      expect(result.winner).toBe('APPROVE');
      expect(result.method).toBe('MAJORITY');
    });

    test('WEIGHTED: weights determine winner', () => {
      const c = makeContract(ResolutionMode.VOTE, { resolutionStrategy: 'WEIGHTED' });
      // u1 (0.5) + a1 (0.2) APPROVE = 0.7 vs u2 (0.3) REJECT = 0.3
      const votes = [
        { actorId: 'u1', vote: 'APPROVE' },
        { actorId: 'u2', vote: 'REJECT' },
        { actorId: 'a1', vote: 'APPROVE' },
      ];
      const result = vc.resolve(c, votes);
      expect(result.winner).toBe('APPROVE');
      expect(result.method).toBe('WEIGHTED');
    });

    test('UNANIMOUS: all must agree', () => {
      const c = makeContract(ResolutionMode.VOTE, { resolutionStrategy: 'UNANIMOUS' });
      const votes = [
        { actorId: 'u1', vote: 'APPROVE' },
        { actorId: 'u2', vote: 'APPROVE' },
        { actorId: 'a1', vote: 'REJECT' },
      ];
      const result = vc.resolve(c, votes);
      expect(result.winner).toBeNull();
      expect(result.unanimous).toBe(false);
    });

    test('UNANIMOUS: succeeds when all agree', () => {
      const c = makeContract(ResolutionMode.VOTE, { resolutionStrategy: 'UNANIMOUS' });
      const votes = [
        { actorId: 'u1', vote: 'APPROVE' },
        { actorId: 'u2', vote: 'APPROVE' },
        { actorId: 'a1', vote: 'APPROVE' },
      ];
      const result = vc.resolve(c, votes);
      expect(result.winner).toBe('APPROVE');
      expect(result.unanimous).toBe(true);
    });
  });

  describe('tie handling', () => {
    test('ESCALATE: returns null winner on tie', () => {
      const c = makeContract(ResolutionMode.VOTE, {
        resolutionStrategy: 'MAJORITY',
        tieBreak: 'ESCALATE',
        participants: [
          { type: ParticipantType.HUMAN_USER, refId: 'u1' },
          { type: ParticipantType.HUMAN_USER, refId: 'u2' },
        ],
      });
      const votes = [
        { actorId: 'u1', vote: 'APPROVE' },
        { actorId: 'u2', vote: 'REJECT' },
      ];
      const result = vc.resolve(c, votes);
      expect(result.winner).toBeNull();
      expect(result.tie).toBe(true);
    });

    test('RANDOM: picks one option on tie', () => {
      const c = makeContract(ResolutionMode.VOTE, {
        resolutionStrategy: 'MAJORITY',
        tieBreak: 'RANDOM',
        participants: [
          { type: ParticipantType.HUMAN_USER, refId: 'u1' },
          { type: ParticipantType.HUMAN_USER, refId: 'u2' },
        ],
      });
      const votes = [
        { actorId: 'u1', vote: 'APPROVE' },
        { actorId: 'u2', vote: 'REJECT' },
      ];
      const result = vc.resolve(c, votes);
      expect(['APPROVE', 'REJECT']).toContain(result.winner);
      expect(result.tie).toBe(true);
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// CONTRADICTION EVALUATOR
// ────────────────────────────────────────────────────────────────────────────

describe('ContradictionEvaluator', () => {
  const ce = new ContradictionEvaluator();

  describe('evaluateHeuristic', () => {
    test('returns threshold for security domain', () => {
      const contract = new AsyncSignalContract({
        resumeToken: 'tok', timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'e1', node_id: 'n1' },
      });
      const result = ce.evaluateHeuristic(contract, { domain: 'security' });
      expect(result.threshold).toBeGreaterThan(0.5);
      expect(result.method).toBe('HEURISTIC');
    });

    test('lower threshold for general domain', () => {
      const contract = new AsyncSignalContract({
        resumeToken: 'tok', timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'e1', node_id: 'n1' },
      });
      const result = ce.evaluateHeuristic(contract, { domain: 'general' });
      expect(result.threshold).toBeLessThan(0.6);
    });

    test('irreversible decisions increase threshold', () => {
      const contract = new AsyncSignalContract({
        resumeToken: 'tok', timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'e1', node_id: 'n1' },
      });
      const reversible = ce.evaluateHeuristic(contract, { domain: 'it', reversible: true });
      const irreversible = ce.evaluateHeuristic(contract, { domain: 'it', reversible: false });
      expect(irreversible.threshold).toBeGreaterThan(reversible.threshold);
    });
  });

  describe('detectContradiction', () => {
    test('no contradiction when votes are unanimous', () => {
      const votes = [
        { actorId: 'a1', vote: 'APPROVE', confidence: 0.9 },
        { actorId: 'a2', vote: 'APPROVE', confidence: 0.8 },
      ];
      const result = ce.detectContradiction(votes, 0.3);
      expect(result.detected).toBe(false);
      expect(result.reason).toBe('UNANIMOUS');
    });

    test('detects contradiction with high confidence split', () => {
      const votes = [
        { actorId: 'a1', vote: 'APPROVE', confidence: 0.95 },
        { actorId: 'a2', vote: 'REJECT', confidence: 0.9 },
      ];
      const result = ce.detectContradiction(votes, 0.3);
      expect(result.detected).toBe(true);
      expect(result.score).toBeGreaterThan(0.3);
    });

    test('no contradiction with low threshold split', () => {
      const votes = [
        { actorId: 'a1', vote: 'APPROVE', confidence: 0.6 },
        { actorId: 'a2', vote: 'APPROVE', confidence: 0.5 },
        { actorId: 'a3', vote: 'REJECT', confidence: 0.3 },
      ];
      const result = ce.detectContradiction(votes, 0.5);
      expect(result.detected).toBe(false);
    });

    test('insufficient votes returns false', () => {
      const result = ce.detectContradiction([{ actorId: 'a1', vote: 'APPROVE' }], 0.3);
      expect(result.detected).toBe(false);
      expect(result.reason).toBe('INSUFFICIENT_VOTES');
    });
  });

  describe('evaluate with LLM', () => {
    test('uses LLM evaluator when available', async () => {
      const llmEval = new ContradictionEvaluator({
        llmEvaluator: async () => ({
          criticality: 0.8,
          risk: 0.7,
          reasoning: 'High criticality task',
        }),
      });
      const contract = new AsyncSignalContract({
        resumeToken: 'tok', timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'e1', node_id: 'n1' },
      });
      const result = await llmEval.evaluate(contract, {});
      expect(result.method).toBe('LLM');
      expect(result.criticality).toBe(0.8);
    });

    test('falls back to heuristic on LLM failure', async () => {
      const llmEval = new ContradictionEvaluator({
        llmEvaluator: async () => { throw new Error('LLM unavailable'); },
      });
      const contract = new AsyncSignalContract({
        resumeToken: 'tok', timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'e1', node_id: 'n1' },
      });
      const result = await llmEval.evaluate(contract, { domain: 'finance' });
      expect(result.method).toBe('HEURISTIC');
    });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SIGNAL ORCHESTRATOR (with mock dependencies)
// ────────────────────────────────────────────────────────────────────────────

describe('SignalOrchestrator', () => {
  let orchestrator;
  let mockRedis;
  let mockCheckpoint;

  beforeEach(() => {
    // Mock Redis store
    mockRedis = {};
    const mockRedisClient = {
      get: jest.fn(async (key) => mockRedis[key] || null),
      set: jest.fn(async (key, value) => { mockRedis[key] = value; }),
      del: jest.fn(async (key) => { delete mockRedis[key]; return 1; }),
      expire: jest.fn(async () => {}),
      ttl: jest.fn(async () => 3600),
      keys: jest.fn(async (pattern) => Object.keys(mockRedis).filter(k => k.startsWith(pattern.replace('*', '')))),
    };

    const { CheckpointManager } = require('../../resilience/CheckpointManager');
    mockCheckpoint = new CheckpointManager(mockRedisClient);

    orchestrator = new SignalOrchestrator({
      checkpointManager: mockCheckpoint,
      tokenSecret: 'test-orchestrator-secret',
    });
  });

  describe('initiateWait', () => {
    test('generates token and saves wait context', async () => {
      const result = await orchestrator.initiateWait('exec-1', 'G0-N05', {
        signalType: SignalType.USER_INPUT,
        timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'exec-1', node_id: 'G0-N05' },
      });

      expect(result.resumeToken).toBeDefined();
      expect(result.contract).toBeInstanceOf(AsyncSignalContract);

      // Verify saved in Redis
      const saved = await mockCheckpoint.getWaitContext('exec-1');
      expect(saved).not.toBeNull();
      expect(saved.status).toBe('WAITING');
    });

    test('rejects invalid contract', async () => {
      await expect(
        orchestrator.initiateWait('exec-1', 'N1', {
          // Missing timeoutAt
          contextRef: { execution_id: 'exec-1', node_id: 'N1' },
        })
      ).rejects.toThrow('Invalid signal contract');
    });
  });

  describe('resume (SINGLE mode)', () => {
    test('resolves on first signal', async () => {
      const { resumeToken } = await orchestrator.initiateWait('exec-1', 'N1', {
        signalType: SignalType.USER_INPUT,
        timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'exec-1', node_id: 'N1' },
        resolutionPolicy: { mode: ResolutionMode.SINGLE, participants: [] },
      });

      const result = await orchestrator.resume(resumeToken, { name: 'John' }, 'user-1');
      expect(result.status).toBe('RESOLVED');
      expect(result.payload).toEqual({ name: 'John' });
    });

    test('rejects invalid token', async () => {
      const result = await orchestrator.resume('invalid-token', {}, 'user-1');
      expect(result.status).toBe('INVALID_TOKEN');
    });
  });

  describe('resume (QUORUM mode)', () => {
    test('collects votes until quorum', async () => {
      const { resumeToken } = await orchestrator.initiateWait('exec-q', 'N1', {
        signalType: SignalType.APPROVAL,
        timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'exec-q', node_id: 'N1' },
        resolutionPolicy: {
          mode: ResolutionMode.QUORUM,
          quorumRequired: 2,
          participants: [
            { type: ParticipantType.HUMAN_USER, refId: 'u1' },
            { type: ParticipantType.HUMAN_USER, refId: 'u2' },
            { type: ParticipantType.HUMAN_USER, refId: 'u3' },
          ],
        },
      });

      // First vote
      let result = await orchestrator.resume(resumeToken, { vote: 'APPROVE' }, 'u1');
      expect(result.status).toBe('VOTE_RECORDED');
      expect(result.votesReceived).toBe(1);

      // Second vote → quorum reached
      result = await orchestrator.resume(resumeToken, { vote: 'APPROVE' }, 'u2');
      expect(result.status).toBe('RESOLVED');
    });
  });

  describe('resume (FORCE mode)', () => {
    test('authorized actor can force resolve', async () => {
      const { resumeToken } = await orchestrator.initiateWait('exec-f', 'N1', {
        signalType: SignalType.APPROVAL,
        timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'exec-f', node_id: 'N1' },
        resolutionPolicy: {
          mode: ResolutionMode.FORCE,
          forceAuthorizedActors: ['admin-1'],
          participants: [{ type: ParticipantType.HUMAN_USER, refId: 'admin-1' }],
        },
      });

      const result = await orchestrator.resume(resumeToken, { override: true }, 'admin-1');
      expect(result.status).toBe('RESOLVED');
      expect(result.forced).toBe(true);
    });

    test('unauthorized actor is denied', async () => {
      const { resumeToken } = await orchestrator.initiateWait('exec-f2', 'N1', {
        signalType: SignalType.APPROVAL,
        timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'exec-f2', node_id: 'N1' },
        resolutionPolicy: {
          mode: ResolutionMode.FORCE,
          forceAuthorizedActors: ['admin-1'],
          participants: [{ type: ParticipantType.HUMAN_USER, refId: 'admin-1' }],
        },
      });

      const result = await orchestrator.resume(resumeToken, {}, 'regular-user');
      expect(result.status).toBe('FORCE_DENIED');
    });
  });

  describe('handleTimeout', () => {
    test('returns FAIL action by default', async () => {
      await orchestrator.initiateWait('exec-t', 'N1', {
        signalType: SignalType.USER_INPUT,
        timeoutAt: '2026-12-31T00:00:00Z',
        timeoutAction: TimeoutAction.FAIL,
        contextRef: { execution_id: 'exec-t', node_id: 'N1' },
      });

      const result = await orchestrator.handleTimeout('exec-t');
      expect(result.action).toBe('FAIL');
    });

    test('returns SKIP for SKIP timeout action', async () => {
      await orchestrator.initiateWait('exec-s', 'N1', {
        signalType: SignalType.USER_INPUT,
        timeoutAt: '2026-12-31T00:00:00Z',
        timeoutAction: TimeoutAction.SKIP,
        contextRef: { execution_id: 'exec-s', node_id: 'N1' },
      });

      const result = await orchestrator.handleTimeout('exec-s');
      expect(result.action).toBe('SKIP');
    });

    test('returns NOOP for already resolved', async () => {
      const result = await orchestrator.handleTimeout('nonexistent');
      expect(result.action).toBe('NOOP');
    });
  });

  describe('getStatus', () => {
    test('returns current signal status', async () => {
      await orchestrator.initiateWait('exec-status', 'N1', {
        signalType: SignalType.VOTE,
        timeoutAt: '2026-12-31T00:00:00Z',
        contextRef: { execution_id: 'exec-status', node_id: 'N1' },
        resolutionPolicy: {
          mode: ResolutionMode.VOTE,
          voteOptions: [{ value: 'YES' }, { value: 'NO' }],
          participants: [
            { type: ParticipantType.HUMAN_USER, refId: 'u1' },
            { type: ParticipantType.HUMAN_USER, refId: 'u2' },
          ],
        },
      });

      const status = await orchestrator.getStatus('exec-status');
      expect(status.status).toBe('WAITING');
      expect(status.mode).toBe('VOTE');
      expect(status.votes).toBe(0);
    });

    test('returns null for unknown execution', async () => {
      const status = await orchestrator.getStatus('nonexistent');
      expect(status).toBeNull();
    });
  });
});

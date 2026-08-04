'use strict';

const { BaseStrategy, MockStrategy } = require('../base-strategy');
const { STRATEGY_TYPES, STRATEGY_PHASES } = require('../../contracts/strategy.interface');

// Silence the project logger for the whole suite.
const silentLogger = { debug: jest.fn(), error: jest.fn(), warn: jest.fn(), info: jest.fn() };

describe('Radix Strategies: BaseStrategy', () => {
  describe('construction', () => {
    it('throws if metadata not implemented', () => {
      expect(() => new BaseStrategy()).toThrow('must implement metadata');
    });

    it('throws if metadata missing name', () => {
      class BadStrategy extends BaseStrategy {
        get metadata() { return { type: 'seed' }; }
      }
      expect(() => new BadStrategy()).toThrow('metadata with name and type');
    });

    it('throws if metadata missing type', () => {
      class BadStrategy extends BaseStrategy {
        get metadata() { return { name: 'bad' }; }
      }
      expect(() => new BadStrategy()).toThrow('metadata with name and type');
    });

    it('throws if invalid strategy type', () => {
      class BadStrategy extends BaseStrategy {
        get metadata() { return { name: 'bad', type: 'invalid' }; }
      }
      expect(() => new BadStrategy()).toThrow('Invalid strategy type');
    });

    it('throws if _execute not implemented', async () => {
      class NoExec extends BaseStrategy {
        get metadata() {
          return { name: 'no-exec', type: 'seed', description: 'x', version: '1.0.0' };
        }
      }
      const strategy = new NoExec({ logger: silentLogger });
      const result = await strategy.execute({
        workspaceId: 'ws_1',
        query: 'q',
        queryEmbedding: [0.1],
        config: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toMatch('must implement _execute');
    });
  });

  describe('MockStrategy', () => {
    const validContext = {
      workspaceId: 'ws_123',
      query: 'find authentication logic',
      queryEmbedding: new Array(1024).fill(0.1),
      config: { vectorTopK: 10 }
    };

    it('returns configured candidates', async () => {
      const candidates = [
        {
          id: 'draft_1',
          type: 'entity',
          content: 'User authentication module',
          score: 0.9,
          provenance: { sourceId: 'src_1', sourceType: 'SOURCE_REFERENCE' },
          metadata: {}
        }
      ];

      const strategy = new MockStrategy({ logger: silentLogger }, {
        candidates,
        metadata: { name: 'test-seed', type: 'seed', description: 'Test', version: '1.0.0' }
      });

      const result = await strategy.execute(validContext);

      expect(result.success).toBe(true);
      expect(result.strategyName).toBe('test-seed');
      expect(result.strategyType).toBe('seed');
      expect(result.candidates).toEqual(candidates);
      expect(result.error).toBeNull();
      expect(result.executionMs).toBeGreaterThanOrEqual(0);
    });

    it('uses default metadata when none supplied', () => {
      const strategy = new MockStrategy({ logger: silentLogger });
      expect(strategy.name).toBe('mock-strategy');
      expect(strategy.type).toBe('seed');
    });

    it('measures execution time', async () => {
      const strategy = new MockStrategy({ logger: silentLogger }, {
        delayMs: 50,
        metadata: { name: 'slow', type: 'seed', description: 'Slow', version: '1.0.0' }
      });

      const result = await strategy.execute(validContext);

      expect(result.executionMs).toBeGreaterThanOrEqual(45);
      expect(result.executionMs).toBeLessThan(500);
    });

    it('handles errors gracefully', async () => {
      const strategy = new MockStrategy({ logger: silentLogger }, {
        throwError: new Error('Database connection failed'),
        metadata: { name: 'failing', type: 'seed', description: 'Fails', version: '1.0.0' }
      });

      const result = await strategy.execute(validContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(result.candidates).toEqual([]);
      expect(result.executionMs).toBeGreaterThanOrEqual(0);
    });

    it('never rejects — failure is returned, not thrown', async () => {
      const strategy = new MockStrategy({ logger: silentLogger }, {
        throwError: new Error('boom')
      });
      await expect(strategy.execute(validContext)).resolves.toMatchObject({ success: false });
    });

    it('surfaces debug payload when _execute returns {candidates, debug}', async () => {
      const strategy = new MockStrategy({ logger: silentLogger }, {
        candidates: [],
        debug: { hops: 2, nodesVisited: 41 }
      });

      const result = await strategy.execute(validContext);

      expect(result.success).toBe(true);
      expect(result.debug).toEqual({ hops: 2, nodesVisited: 41 });
    });

    it('reports debug as null for a bare-array return', async () => {
      const strategy = new MockStrategy({ logger: silentLogger }, { candidates: [] });
      const result = await strategy.execute(validContext);
      expect(result.debug).toBeNull();
    });
  });

  describe('context validation', () => {
    const createStrategy = (type) => new MockStrategy({ logger: silentLogger }, {
      metadata: { name: `test-${type}`, type, description: 'Test', version: '1.0.0' }
    });

    it('rejects missing context', async () => {
      const result = await createStrategy('seed').execute(null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Context is required');
    });

    it('rejects missing workspaceId', async () => {
      const result = await createStrategy('seed').execute({ query: 'test', config: {} });

      expect(result.success).toBe(false);
      expect(result.error).toBe('workspaceId is required');
    });

    it('rejects empty query', async () => {
      const result = await createStrategy('seed').execute({
        workspaceId: 'ws_1',
        query: '   ',
        config: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('query must be non-empty string');
    });

    it('rejects missing config', async () => {
      const result = await createStrategy('seed').execute({
        workspaceId: 'ws_1',
        query: 'test',
        queryEmbedding: [0.1]
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('config is required');
    });

    it('seed strategy requires queryEmbedding', async () => {
      const result = await createStrategy('seed').execute({
        workspaceId: 'ws_1',
        query: 'test',
        config: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('queryEmbedding is required for seed strategies');
    });

    it('seed strategy rejects an empty queryEmbedding', async () => {
      const result = await createStrategy('seed').execute({
        workspaceId: 'ws_1',
        query: 'test',
        queryEmbedding: [],
        config: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('queryEmbedding is required for seed strategies');
    });

    it('expansion strategy requires seeds array', async () => {
      const result = await createStrategy('expansion').execute({
        workspaceId: 'ws_1',
        query: 'test',
        queryEmbedding: [0.1],
        config: {}
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('seeds array is required for expansion strategies');
    });

    it('expansion strategy accepts empty seeds', async () => {
      const result = await createStrategy('expansion').execute({
        workspaceId: 'ws_1',
        query: 'test',
        queryEmbedding: [0.1],
        config: {},
        seeds: []
      });

      expect(result.success).toBe(true);
      expect(result.candidates).toEqual([]);
    });

    it('expansion strategy does not require queryEmbedding', async () => {
      const result = await createStrategy('expansion').execute({
        workspaceId: 'ws_1',
        query: 'test',
        config: {},
        seeds: []
      });

      expect(result.success).toBe(true);
    });

    it('a validation failure still reports the strategy identity', async () => {
      const result = await createStrategy('seed').execute(null);

      expect(result.strategyName).toBe('test-seed');
      expect(result.strategyType).toBe('seed');
      expect(result.candidates).toEqual([]);
    });
  });

  describe('_createCandidate helper', () => {
    const strategy = new MockStrategy({ logger: silentLogger }, {
      metadata: { name: 'test', type: 'seed', description: 'Test', version: '1.0.0' }
    });

    it('creates valid candidate', () => {
      const candidate = strategy._createCandidate({
        id: 'draft_1',
        type: 'entity',
        content: 'Test content',
        score: 0.85,
        provenance: { sourceId: 'src_1', sourceType: 'DRAFT' }
      });

      expect(candidate.id).toBe('draft_1');
      expect(candidate.type).toBe('entity');
      expect(candidate.content).toBe('Test content');
      expect(candidate.score).toBe(0.85);
      expect(candidate.contentRaw).toBeNull();
      expect(candidate.metadata).toEqual({});
    });

    it('allows an out-of-[0,1] raw score (normalization happens in fusion)', () => {
      const candidate = strategy._createCandidate({
        id: 'x',
        type: 'entity',
        content: 'test',
        score: 42,
        provenance: { sourceId: 's', sourceType: 'D' }
      });
      expect(candidate.score).toBe(42);
    });

    it('rejects NaN score', () => {
      expect(() => strategy._createCandidate({
        id: 'x',
        type: 'entity',
        content: 'test',
        score: NaN,
        provenance: { sourceId: 's', sourceType: 'D' }
      })).toThrow('finite numeric score');
    });

    it('rejects Infinity score', () => {
      expect(() => strategy._createCandidate({
        id: 'x',
        type: 'entity',
        content: 'test',
        score: Infinity,
        provenance: { sourceId: 's', sourceType: 'D' }
      })).toThrow('finite numeric score');
    });

    it('rejects missing id / type / content', () => {
      const base = {
        id: 'x',
        type: 'entity',
        content: 'test',
        score: 0.5,
        provenance: { sourceId: 's', sourceType: 'D' }
      };
      expect(() => strategy._createCandidate({ ...base, id: null })).toThrow('requires id');
      expect(() => strategy._createCandidate({ ...base, type: null })).toThrow('requires type');
      expect(() => strategy._createCandidate({ ...base, content: 5 })).toThrow('content string');
    });

    it('rejects missing provenance', () => {
      expect(() => strategy._createCandidate({
        id: 'x',
        type: 'entity',
        content: 'test',
        score: 0.5,
        provenance: {}
      })).toThrow('provenance with sourceId');
    });
  });

  describe('convenience getters', () => {
    it('exposes name and type from metadata', () => {
      const strategy = new MockStrategy({ logger: silentLogger }, {
        metadata: { name: 'my-strategy', type: 'expansion', description: 'Desc', version: '2.0.0' }
      });

      expect(strategy.name).toBe('my-strategy');
      expect(strategy.type).toBe('expansion');
    });
  });

  describe('strategy.interface constants', () => {
    it('declares exactly the two scheduled types', () => {
      expect(STRATEGY_TYPES).toEqual(['seed', 'expansion']);
    });

    it('phases are ordered seed-then-expansion', () => {
      expect(STRATEGY_PHASES).toEqual(['seed', 'expansion']);
    });

    it('constants are frozen', () => {
      expect(Object.isFrozen(STRATEGY_TYPES)).toBe(true);
      expect(Object.isFrozen(STRATEGY_PHASES)).toBe(true);
    });
  });
});

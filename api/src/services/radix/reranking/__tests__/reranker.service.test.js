'use strict';

const { RerankerService } = require('../reranker.service');
const {
  buildRerankPrompt,
  truncateForRerank,
  RERANK_SCHEMA,
  CONTENT_LIMIT
} = require('../rerank-prompt');
const { mergeConfig, DEFAULT_CONFIG } = require('../../contracts/context-bundle');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

/** A fused candidate. `strategies.length > 1` marks it corroborated. */
const cand = (id, strategyCount = 1, overrides = {}) => ({
  id,
  type: 'entity',
  content: `Content of ${id}`,
  score: 0.5,
  strategies: Array.from({ length: strategyCount }, (_, i) => ({ strategyName: `s${i}` })),
  provenance: { sourceId: id, sourceType: 'DRAFT' },
  metadata: { name: id },
  ...overrides
});

/** anthropic-api wraps the tool input in `{data, raw, ...}`. */
const providerReturning = (ranking) => ({
  structuredOutput: jest.fn().mockResolvedValue({ data: { ranking }, raw: '', provider: 'test' })
});

/** A provider that returns the object directly, without the envelope. */
const providerReturningBare = (ranking) => ({
  structuredOutput: jest.fn().mockResolvedValue({ ranking })
});

const build = (provider) => new RerankerService({ llmProvider: provider, logger: silentLogger });

/** Reranking is off by default, so these tests opt in explicitly. */
const config = (over = {}) => mergeConfig({ rerankEnabled: true, ...over });

describe('Radix Reranking: prompt', () => {
  it('caps each candidate to the same length', () => {
    const long = cand('long', 1, { content: 'x'.repeat(5000) });
    expect(truncateForRerank(long).length).toBe(CONTENT_LIMIT + 1); // + ellipsis
  });

  it('leaves short content untouched', () => {
    expect(truncateForRerank(cand('a'))).toBe('Content of a');
  });

  it('tells the model not to reward length', () => {
    // Otherwise a long source chunk outranks a short draft on surface area,
    // undoing the separate draft/chunk quotas.
    const prompt = buildRerankPrompt('q', [cand('a'), cand('b')]);
    expect(prompt).toMatch(/ignore how long a candidate is/i);
  });

  it('numbers candidates from zero and states the expected count', () => {
    const prompt = buildRerankPrompt('find rules', [cand('a'), cand('b'), cand('c')]);
    expect(prompt).toContain('[0]');
    expect(prompt).toContain('[2]');
    expect(prompt).toContain('Rank ALL 3 candidates');
    expect(prompt).toContain('find rules');
  });

  it('schema demands an integer array', () => {
    expect(RERANK_SCHEMA.required).toEqual(['ranking']);
    expect(RERANK_SCHEMA.properties.ranking.items.type).toBe('integer');
  });
});

describe('Radix Reranking: RerankerService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('what gets reranked', () => {
    it('reorders single-strategy candidates only', async () => {
      const pool = [
        cand('corr1', 2), cand('corr2', 2),
        cand('a', 1), cand('b', 1), cand('c', 1)
      ];
      const provider = providerReturning([2, 0, 1]); // c, a, b

      const result = await build(provider).rerank('q', pool, config());

      expect(result.reranked).toBe(true);
      // Corroborated keep their RRF order and stay on top.
      expect(result.candidates.map((c) => c.id)).toEqual(['corr1', 'corr2', 'c', 'a', 'b']);
    });

    it('never reorders corroborated candidates', async () => {
      const pool = [cand('corr1', 2), cand('corr2', 2), cand('a', 1), cand('b', 1)];
      const provider = providerReturning([1, 0]);

      const result = await build(provider).rerank('q', pool, config());

      // Two independent signals already agreed; one model opinion must not
      // override that.
      const sent = provider.structuredOutput.mock.calls[0][0];
      expect(sent).not.toContain('corr1');
      expect(result.candidates.slice(0, 2).map((c) => c.id)).toEqual(['corr1', 'corr2']);
    });

    it('skips the LLM entirely when corroborated already fill the answer', async () => {
      const pool = Array.from({ length: 16 }, (_, i) => cand(`c${i}`, 2));
      const provider = providerReturning([0, 1]);

      const result = await build(provider).rerank('q', pool, config({ maxElements: 15 }));

      expect(provider.structuredOutput).not.toHaveBeenCalled();
      expect(result.reranked).toBe(false);
      expect(result.reason).toMatch('corroborated fill the result');
    });

    it('skips when there is nothing to reorder', async () => {
      const provider = providerReturning([0]);
      const result = await build(provider).rerank('q', [cand('a', 1)], config());

      expect(provider.structuredOutput).not.toHaveBeenCalled();
      expect(result.reranked).toBe(false);
    });

    it('caps how many candidates reach the LLM, keeping the rest in place', async () => {
      const pool = Array.from({ length: 40 }, (_, i) => cand(`n${i}`, 1));
      const provider = providerReturning([1, 0]);

      const result = await build(provider).rerank('q', pool, config({ rerankMaxCandidates: 5 }));

      const prompt = provider.structuredOutput.mock.calls[0][0];
      expect(prompt).toContain('Rank ALL 5 candidates');
      expect(result.candidates).toHaveLength(40);
    });

    it('honours rerankEnabled: false', async () => {
      const provider = providerReturning([1, 0]);
      const pool = [cand('a', 1), cand('b', 1)];

      const result = await build(provider).rerank('q', pool, config({ rerankEnabled: false }));

      expect(provider.structuredOutput).not.toHaveBeenCalled();
      expect(result.reason).toBe('disabled');
      expect(result.candidates).toBe(pool);
    });
  });

  describe('malformed model output', () => {
    const pool = () => [cand('a', 1), cand('b', 1), cand('c', 1)];

    it('appends indices the model forgot instead of dropping candidates', async () => {
      const result = await build(providerReturning([2])).rerank('q', pool(), config());

      expect(result.candidates.map((c) => c.id)).toEqual(['c', 'a', 'b']);
      expect(result.candidates).toHaveLength(3);
    });

    it('ignores repeated indices', async () => {
      const result = await build(providerReturning([1, 1, 0])).rerank('q', pool(), config());
      expect(result.candidates.map((c) => c.id)).toEqual(['b', 'a', 'c']);
    });

    it('ignores out-of-range and non-integer indices', async () => {
      const result = await build(providerReturning([99, -1, 'x', 1.5, 2]))
        .rerank('q', pool(), config());

      expect(result.candidates.map((c) => c.id)).toEqual(['c', 'a', 'b']);
    });

    it('accepts both the wrapped and the bare provider response shape', async () => {
      // anthropic-api returns {data:{ranking}}; reading `result.ranking` on that
      // yields undefined and silently degrades every rerank to a no-op.
      const wrapped = await build(providerReturning([2, 0, 1])).rerank('q', pool(), config());
      const bare = await build(providerReturningBare([2, 0, 1])).rerank('q', pool(), config());

      expect(wrapped.reranked).toBe(true);
      expect(bare.reranked).toBe(true);
      expect(wrapped.candidates.map((c) => c.id)).toEqual(bare.candidates.map((c) => c.id));
    });

    it('keeps RRF order when the ranking is empty or absent', async () => {
      const original = pool();
      const empty = await build(providerReturning([])).rerank('q', original, config());
      expect(empty.reranked).toBe(false);
      expect(empty.candidates).toBe(original);

      const missing = await build({ structuredOutput: jest.fn().mockResolvedValue({}) })
        .rerank('q', original, config());
      expect(missing.reranked).toBe(false);
    });

    it('never loses or duplicates a candidate', async () => {
      const original = pool();
      const result = await build(providerReturning([2, 0])).rerank('q', original, config());

      expect(result.candidates).toHaveLength(original.length);
      expect(new Set(result.candidates.map((c) => c.id)).size).toBe(original.length);
    });
  });

  describe('graceful degradation', () => {
    it('keeps RRF order when the LLM throws', async () => {
      const provider = { structuredOutput: jest.fn().mockRejectedValue(new Error('429 overloaded')) };
      const pool = [cand('a', 1), cand('b', 1)];

      const result = await build(provider).rerank('q', pool, config());

      expect(result.reranked).toBe(false);
      expect(result.reason).toBe('429 overloaded');
      expect(result.candidates).toBe(pool);
    });

    it('keeps RRF order when no provider can be built', async () => {
      const service = new RerankerService({ logger: silentLogger });
      service._provider = () => null;
      const pool = [cand('a', 1), cand('b', 1)];

      const result = await service.rerank('q', pool, config());

      expect(result.reranked).toBe(false);
      expect(result.reason).toBe('no llm provider');
    });

    it('tolerates a non-array pool', async () => {
      const result = await build(providerReturning([0])).rerank('q', null, config());
      expect(result.candidates).toEqual([]);
    });

    it('reports its own duration', async () => {
      const result = await build(providerReturning([1, 0]))
        .rerank('q', [cand('a', 1), cand('b', 1)], config());
      expect(result.ms).toBeGreaterThanOrEqual(0);
    });
  });

  describe('config contract', () => {
    it('is OFF by default — an API round trip is 7x the whole retrieval budget', () => {
      // Measured: 1392ms mean / 2886ms P95 against a 500ms budget.
      expect(DEFAULT_CONFIG.rerankEnabled).toBe(false);
      expect(DEFAULT_CONFIG.rerankMaxCandidates).toBe(30);
      expect(DEFAULT_CONFIG.rerankContentLimit).toBe(800);
    });

    it('can be switched on per request', () => {
      expect(mergeConfig({ rerankEnabled: true }).rerankEnabled).toBe(true);
    });

    it('clamps the caps', () => {
      expect(mergeConfig({ rerankMaxCandidates: 999 }).rerankMaxCandidates).toBe(100);
      expect(mergeConfig({ rerankContentLimit: 10 }).rerankContentLimit).toBe(100);
    });
  });
});

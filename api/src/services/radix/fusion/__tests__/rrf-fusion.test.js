'use strict';

const { RRFFusionPolicy, createFusionPolicy, FUSION_METHODS, FusionPolicy } = require('../index');
const { minMaxNormalize, normalizePerStrategy } = require('../score-normalizer');
const { mergeConfig, DEFAULT_CONFIG } = require('../../contracts/context-bundle');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

/** Builds a StrategyCandidate with sane defaults. */
const cand = (id, score = 0.5, extra = {}) => ({
  id,
  type: 'entity',
  content: `content of ${id}`,
  contentRaw: null,
  score,
  provenance: { sourceId: `src_${id}`, sourceType: 'DRAFT_ENTITY' },
  metadata: {},
  ...extra
});

/** Builds a successful StrategyResult. */
const result = (strategyName, strategyType, candidates, overrides = {}) => ({
  strategyName,
  strategyType,
  candidates,
  executionMs: 10,
  success: true,
  error: null,
  debug: null,
  ...overrides
});

const K = DEFAULT_CONFIG.rrfK; // 60

describe('Radix Fusion: RRFFusionPolicy', () => {
  let policy;

  beforeEach(() => {
    policy = new RRFFusionPolicy({ logger: silentLogger });
    jest.clearAllMocks();
  });

  describe('contract', () => {
    it('exposes the policy name', () => {
      expect(policy.name).toBe('rrf');
    });

    it('base FusionPolicy refuses to be used directly', () => {
      const base = new FusionPolicy();
      expect(() => base.name).toThrow('must implement name');
      expect(() => base.fuse([], {})).toThrow('must implement fuse');
    });
  });

  describe('single strategy', () => {
    it('assigns 1/(k+rank) per position', () => {
      const fused = policy.fuse(
        [result('vector-seed', 'seed', [cand('a'), cand('b'), cand('c')])],
        mergeConfig({})
      );

      expect(fused).toHaveLength(3);
      expect(fused[0].id).toBe('a');
      expect(fused[0].score).toBeCloseTo(1 / (K + 1), 10);
      expect(fused[1].score).toBeCloseTo(1 / (K + 2), 10);
      expect(fused[2].score).toBeCloseTo(1 / (K + 3), 10);
    });

    it('preserves the strategy ordering', () => {
      const fused = policy.fuse(
        [result('vector-seed', 'seed', [cand('a'), cand('b'), cand('c')])],
        mergeConfig({})
      );
      expect(fused.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    });

    it('records one attribution with the raw score and 1-based rank', () => {
      const fused = policy.fuse(
        [result('vector-seed', 'seed', [cand('a', 0.93)])],
        mergeConfig({})
      );

      expect(fused[0].strategies).toEqual([{
        strategyName: 'vector-seed',
        strategyType: 'seed',
        rawScore: 0.93,
        normalizedScore: 1, // sole hit for this strategy → no spread to rank against
        rank: 1
      }]);
    });

    it('normalizes rawScore within each strategy independently', () => {
      const fused = policy.fuse(
        [
          // cosine scale
          result('vector-seed', 'seed', [cand('a', 0.9), cand('b', 0.7), cand('c', 0.5)]),
          // edge-weight-product scale — deliberately a different range
          result('k-hop-expansion', 'expansion', [cand('d', 12), cand('e', 2)])
        ],
        mergeConfig({})
      );

      const byId = Object.fromEntries(fused.map((f) => [f.id, f.strategies[0]]));

      expect(byId.a.normalizedScore).toBe(1);
      expect(byId.b.normalizedScore).toBeCloseTo(0.5, 10);
      expect(byId.c.normalizedScore).toBe(0);

      // 12 is the top of its OWN strategy, not measured against the cosines.
      expect(byId.d.normalizedScore).toBe(1);
      expect(byId.e.normalizedScore).toBe(0);
    });

    it('normalizes each attribution of a multi-strategy candidate separately', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('hi', 0.9), cand('shared', 0.5)]),
          result('k-hop-expansion', 'expansion', [cand('shared', 8), cand('lo', 2)])
        ],
        mergeConfig({})
      );

      const shared = fused.find((f) => f.id === 'shared');
      expect(shared.strategies).toHaveLength(2);
      expect(shared.strategies[0].normalizedScore).toBe(0); // weakest vector hit
      expect(shared.strategies[1].normalizedScore).toBe(1); // strongest graph hit
    });

    it('leaves normalizedScore null when the strategy reported no raw score', () => {
      const fused = policy.fuse(
        [result('vector-seed', 'seed', [{ ...cand('a'), score: undefined }])],
        mergeConfig({})
      );

      expect(fused[0].strategies[0].rawScore).toBeNull();
      expect(fused[0].strategies[0].normalizedScore).toBeNull();
    });

    it('carries content, provenance and metadata through unchanged', () => {
      const c = cand('a', 0.9, { metadata: { entityType: 'User' }, contentRaw: { x: 1 } });
      const fused = policy.fuse([result('vector-seed', 'seed', [c])], mergeConfig({}));

      expect(fused[0].content).toBe('content of a');
      expect(fused[0].contentRaw).toEqual({ x: 1 });
      expect(fused[0].provenance).toEqual({ sourceId: 'src_a', sourceType: 'DRAFT_ENTITY' });
      expect(fused[0].metadata).toEqual({ entityType: 'User' });
    });

    it('does not leak the strategy-local score into the fused score', () => {
      const fused = policy.fuse(
        [result('vector-seed', 'seed', [cand('a', 0.99)])],
        mergeConfig({})
      );
      expect(fused[0].score).not.toBe(0.99);
      expect(fused[0].score).toBeCloseTo(1 / (K + 1), 10);
      expect(fused[0].strategies[0].rawScore).toBe(0.99);
    });
  });

  describe('two strategies, no overlap', () => {
    it('produces the union with independent scores', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('a'), cand('b')]),
          result('k-hop-expansion', 'expansion', [cand('c'), cand('d')])
        ],
        mergeConfig({})
      );

      expect(fused).toHaveLength(4);
      expect(fused.map((f) => f.id).sort()).toEqual(['a', 'b', 'c', 'd']);
      for (const f of fused) {
        expect(f.strategies).toHaveLength(1);
      }
      // a and c are both rank 1 in their own list → equal score
      const byId = Object.fromEntries(fused.map((f) => [f.id, f]));
      expect(byId.a.score).toBeCloseTo(byId.c.score, 10);
    });
  });

  describe('two strategies, full overlap', () => {
    it('sums contributions into one entry', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('a')]),
          result('k-hop-expansion', 'expansion', [cand('a')])
        ],
        mergeConfig({})
      );

      expect(fused).toHaveLength(1);
      expect(fused[0].score).toBeCloseTo(2 / (K + 1), 10);
    });

    it('unions metadata across strategies instead of keeping only the first', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('a', 0.9, { metadata: { name: 'RuleB', draftType: 'business_rule' } })]),
          result('k-hop-expansion', 'expansion', [cand('a', 0.85, {
            metadata: {
              name: 'RuleB',
              terminalEdgeType: 'CONFLICTS_WITH',
              hops: 1,
              conflict: { withNodeId: 'x', withNodeName: 'RuleA', conflictType: 'semantic' }
            }
          })])
        ],
        mergeConfig({})
      );

      const meta = fused[0].metadata;
      // Only the graph walk knows about the contradiction; dropping it because
      // the vector hit arrived first would hide the conflict from the model.
      expect(meta.terminalEdgeType).toBe('CONFLICTS_WITH');
      expect(meta.conflict.withNodeName).toBe('RuleA');
      expect(meta.hops).toBe(1);
      // First-seen still wins for keys both strategies supply.
      expect(meta.draftType).toBe('business_rule');
      expect(meta.name).toBe('RuleB');
    });

    it('keeps the first strategy value when both supply the same key', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('a', 0.9, { metadata: { name: 'FromSeed' } })]),
          result('k-hop-expansion', 'expansion', [cand('a', 0.8, { metadata: { name: 'FromGraph' } })])
        ],
        mergeConfig({})
      );

      expect(fused[0].metadata.name).toBe('FromSeed');
    });

    it('merges attributions from every contributing strategy', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('x'), cand('a', 0.7)]),
          result('k-hop-expansion', 'expansion', [cand('a', 12.5)])
        ],
        mergeConfig({})
      );

      const a = fused.find((f) => f.id === 'a');
      expect(a.strategies).toHaveLength(2);
      expect(a.strategies.map((s) => s.strategyName)).toEqual(['vector-seed', 'k-hop-expansion']);
      expect(a.strategies.map((s) => s.rank)).toEqual([2, 1]);
      // Raw scores stay on their own scales — no normalization happens in fusion.
      expect(a.strategies.map((s) => s.rawScore)).toEqual([0.7, 12.5]);
    });
  });

  describe('corroboration boost (the point of RRF)', () => {
    it('ranks a twice-found element above a once-found top hit', () => {
      // X: rank 3 in vector, rank 7 in graph. Y: rank 1 in vector only.
      const vector = [cand('p'), cand('q'), cand('X'), cand('r'), cand('s'), cand('t'), cand('u')];
      vector[0] = cand('Y'); // Y is rank 1

      const graph = [
        cand('g1'), cand('g2'), cand('g3'), cand('g4'), cand('g5'), cand('g6'), cand('X')
      ];

      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', vector),
          result('k-hop-expansion', 'expansion', graph)
        ],
        mergeConfig({ maxElements: 50 })
      );

      const X = fused.find((f) => f.id === 'X');
      const Y = fused.find((f) => f.id === 'Y');

      expect(X.score).toBeCloseTo(1 / (K + 3) + 1 / (K + 7), 10);
      expect(Y.score).toBeCloseTo(1 / (K + 1), 10);
      expect(X.score).toBeGreaterThan(Y.score);
      expect(fused[0].id).toBe('X');
    });
  });

  describe('failed and degenerate inputs', () => {
    it('ignores failed strategies', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('a')]),
          result('k-hop-expansion', 'expansion', [cand('b')], {
            success: false,
            error: 'Memgraph unavailable'
          })
        ],
        mergeConfig({})
      );

      expect(fused).toHaveLength(1);
      expect(fused[0].id).toBe('a');
    });

    it('ignores a timed-out strategy', () => {
      const fused = policy.fuse(
        [
          result('vector-seed', 'seed', [cand('a')]),
          result('slow', 'expansion', [], { success: false, error: 'timeout' })
        ],
        mergeConfig({})
      );
      expect(fused.map((f) => f.id)).toEqual(['a']);
    });

    it('returns empty for empty input', () => {
      expect(policy.fuse([], mergeConfig({}))).toEqual([]);
    });

    it('returns empty when every strategy failed', () => {
      const fused = policy.fuse(
        [result('a', 'seed', [cand('x')], { success: false, error: 'boom' })],
        mergeConfig({})
      );
      expect(fused).toEqual([]);
    });

    it('tolerates a non-array input without throwing', () => {
      expect(policy.fuse(null, mergeConfig({}))).toEqual([]);
      expect(policy.fuse(undefined, mergeConfig({}))).toEqual([]);
    });

    it('tolerates strategies that returned no candidates', () => {
      const fused = policy.fuse(
        [
          result('empty', 'seed', []),
          result('vector-seed', 'seed', [cand('a')])
        ],
        mergeConfig({})
      );
      expect(fused.map((f) => f.id)).toEqual(['a']);
    });

    it('drops candidates without an id and warns', () => {
      const fused = policy.fuse(
        [result('vector-seed', 'seed', [cand('a'), { ...cand('b'), id: undefined }])],
        mergeConfig({})
      );

      expect(fused.map((f) => f.id)).toEqual(['a']);
      expect(silentLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('without id'),
        { skipped: 1 }
      );
    });

    it('falls back to defaults when config is omitted', () => {
      const fused = policy.fuse([result('vector-seed', 'seed', [cand('a')])]);
      expect(fused[0].score).toBeCloseTo(1 / (K + 1), 10);
    });
  });

  describe('config handling', () => {
    it('truncates to fusionPoolSize', () => {
      const many = Array.from({ length: 40 }, (_, i) => cand(`n${i}`));
      const fused = policy.fuse(
        [result('vector-seed', 'seed', many)],
        mergeConfig({ fusionPoolSize: 5, maxElements: 5 })
      );

      expect(fused).toHaveLength(5);
      expect(fused.map((f) => f.id)).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
    });

    it('a pool smaller than maxElements is raised to it by mergeConfig', () => {
      const many = Array.from({ length: 40 }, (_, i) => cand(`n${i}`));
      const fused = policy.fuse(
        [result('vector-seed', 'seed', many)],
        mergeConfig({ fusionPoolSize: 5 }) // maxElements stays at 15
      );
      expect(fused).toHaveLength(15);
    });

    it('does NOT truncate to maxElements — the pool is the assembler\'s to trim', () => {
      const many = Array.from({ length: 40 }, (_, i) => cand(`n${i}`));
      const fused = policy.fuse(
        [result('vector-seed', 'seed', many)],
        mergeConfig({ maxElements: 5 })
      );

      // Reranking and token-budget backfill both need a pool wider than the
      // final answer; cutting to 5 here would make them impossible.
      expect(fused).toHaveLength(40);
    });

    it('defaults the pool to 50', () => {
      const many = Array.from({ length: 80 }, (_, i) => cand(`n${i}`));
      const fused = policy.fuse([result('vector-seed', 'seed', many)], mergeConfig({}));
      expect(fused).toHaveLength(50);
    });

    it('honours a custom rrfK', () => {
      const fused = policy.fuse(
        [result('vector-seed', 'seed', [cand('a')])],
        mergeConfig({ rrfK: 1 })
      );
      expect(fused[0].score).toBeCloseTo(1 / 2, 10);
    });

    it('a smaller k widens the gap between adjacent ranks', () => {
      const two = [result('vector-seed', 'seed', [cand('a'), cand('b')])];
      const wide = policy.fuse(two, mergeConfig({ rrfK: 1 }));
      const narrow = policy.fuse(two, mergeConfig({ rrfK: 1000 }));

      expect(wide[0].score - wide[1].score).toBeGreaterThan(narrow[0].score - narrow[1].score);
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const input = [
        result('vector-seed', 'seed', [cand('a'), cand('b'), cand('c')]),
        result('k-hop-expansion', 'expansion', [cand('c'), cand('d')])
      ];
      const config = mergeConfig({});

      expect(policy.fuse(input, config)).toEqual(policy.fuse(input, config));
    });

    it('keeps first-seen order for tied scores (stable sort)', () => {
      const fused = policy.fuse(
        [
          result('s1', 'seed', [cand('first')]),
          result('s2', 'seed', [cand('second')])
        ],
        mergeConfig({})
      );

      expect(fused[0].score).toBeCloseTo(fused[1].score, 10);
      expect(fused.map((f) => f.id)).toEqual(['first', 'second']);
    });
  });
});

describe('Radix Fusion: createFusionPolicy', () => {
  it('returns the RRF policy for "rrf"', () => {
    expect(createFusionPolicy('rrf', { logger: silentLogger })).toBeInstanceOf(RRFFusionPolicy);
  });

  it('defaults to rrf', () => {
    expect(createFusionPolicy(undefined, { logger: silentLogger }).name).toBe('rrf');
  });

  it('rejects linear and max as not implemented for heterogeneous strategies', () => {
    expect(() => createFusionPolicy('linear')).toThrow('not implemented for heterogeneous');
    expect(() => createFusionPolicy('max')).toThrow('not implemented for heterogeneous');
  });

  it('rejects an unknown method', () => {
    expect(() => createFusionPolicy('bogus')).toThrow('Unknown fusion method');
  });

  it('FUSION_METHODS matches the config enum and is frozen', () => {
    expect(FUSION_METHODS).toEqual(['rrf', 'linear', 'max']);
    expect(Object.isFrozen(FUSION_METHODS)).toBe(true);
  });
});

describe('Radix Fusion: scoreNormalizer', () => {
  it('maps a spread of scores onto [0..1]', () => {
    expect(minMaxNormalize([1, 2, 3])).toEqual([0, 0.5, 1]);
  });

  it('maps all-equal scores to 1 rather than zeroing a valid result set', () => {
    expect(minMaxNormalize([0.4, 0.4, 0.4])).toEqual([1, 1, 1]);
  });

  it('handles empty and non-array input', () => {
    expect(minMaxNormalize([])).toEqual([]);
    expect(minMaxNormalize(null)).toEqual([]);
  });

  it('treats non-finite scores as 0', () => {
    expect(minMaxNormalize([0, NaN, 10])).toEqual([0, 0, 1]);
  });

  it('normalizePerStrategy is still a stub', () => {
    expect(() => normalizePerStrategy()).toThrow('not implemented');
  });
});

describe('Radix Config: strategyTimeoutMs', () => {
  it('defaults to 800ms — enough for a two-call strategy on a cold process', () => {
    expect(DEFAULT_CONFIG.strategyTimeoutMs).toBe(800);
  });

  it('is clamped to a sane range', () => {
    expect(mergeConfig({ strategyTimeoutMs: 1 }).strategyTimeoutMs).toBe(10);
    expect(mergeConfig({ strategyTimeoutMs: 999999 }).strategyTimeoutMs).toBe(60000);
    expect(mergeConfig({ strategyTimeoutMs: 500 }).strategyTimeoutMs).toBe(500);
  });
});

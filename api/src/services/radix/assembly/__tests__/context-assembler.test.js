'use strict';

const { ContextAssembler } = require('../context-assembler');
const { createSerializer, ASSEMBLY_FORMATS, natural } = require('../serializers');
const { estimateTokens } = require('../token-counter');
const {
  createContextBundle,
  mergeConfig,
  DEFAULT_CONFIG,
  validateContextBundle
} = require('../../contracts/context-bundle');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

/** Builds a FusedCandidate. */
const fused = (id, score, overrides = {}) => ({
  id,
  type: 'entity',
  content: `Description of ${id}`,
  contentRaw: null,
  score,
  strategies: [{
    strategyName: 'vector-seed',
    strategyType: 'seed',
    rawScore: 0.9,
    normalizedScore: null,
    rank: 1
  }],
  provenance: { sourceId: `src_${id}`, sourceType: 'DRAFT_ENTITY' },
  metadata: { name: id },
  ...overrides
});

/** Builds a FusedCandidate reached over a CONFLICTS_WITH edge. */
const conflictCand = (id, score, withName = 'AlternativeRule') => fused(id, score, {
  metadata: {
    name: id,
    terminalEdgeType: 'CONFLICTS_WITH',
    seedId: 'seed_1',
    hops: 1,
    conflict: { withNodeId: 'draft_42', withNodeName: withName, conflictType: 'value' },
    expansionPath: [
      { nodeId: 'seed_1', nodeType: 'DraftEntity', nodeName: 'Seed', edgeType: null, edgeDirection: null },
      { nodeId: id, nodeType: 'DraftBusinessRule', nodeName: id, edgeType: 'CONFLICTS_WITH', edgeDirection: 'outgoing' }
    ]
  }
});

const bundleFor = (config = {}) => createContextBundle('ws_1', 'test query', config);

describe('Radix Assembly: ContextAssembler', () => {
  let assembler;

  beforeEach(() => {
    assembler = new ContextAssembler({ logger: silentLogger });
    jest.clearAllMocks();
  });

  describe('score normalization', () => {
    it('maps raw RRF sums onto [0..1]', () => {
      const bundle = assembler.assemble(bundleFor(), [
        fused('a', 0.031),
        fused('b', 0.020),
        fused('c', 0.016)
      ]);

      expect(bundle.elements.map((e) => e.score)).toEqual([1, expect.any(Number), 0]);
      for (const el of bundle.elements) {
        expect(el.score).toBeGreaterThanOrEqual(0);
        expect(el.score).toBeLessThanOrEqual(1);
      }
    });

    it('normalizes over the whole pool, not the kept slice', () => {
      const pool = [fused('a', 1.0), fused('b', 0.5), fused('c', 0.0)];
      const kept = assembler.assemble(bundleFor({ maxElements: 2 }), pool);

      // b is the midpoint of the FULL pool → 0.5, not 0 (which is what it would
      // be if only the kept two were normalized).
      expect(kept.elements[1].score).toBeCloseTo(0.5, 10);
    });

    it('gives a single candidate a score of 1, not 0', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('solo', 0.016)]);
      expect(bundle.elements[0].score).toBe(1);
    });

    it('produces elements that pass the bundle contract', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.03), fused('b', 0.01)]);
      expect(validateContextBundle(bundle)).toEqual({ valid: true, errors: [] });
    });

    it('carries strategy attributions through untouched', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.03)]);
      expect(bundle.elements[0].strategies).toHaveLength(1);
      expect(bundle.elements[0].strategies[0].strategyName).toBe('vector-seed');
    });
  });

  describe('maxElements limit', () => {
    it('keeps at most maxElements', () => {
      const pool = Array.from({ length: 30 }, (_, i) => fused(`n${i}`, 1 - i / 30));
      const bundle = assembler.assemble(bundleFor({ maxElements: 5 }), pool);

      expect(bundle.elements).toHaveLength(5);
      expect(bundle.stats.afterTruncation).toBe(5);
      expect(bundle.truncated).toBe(true);
    });

    it('keeps the highest-scoring candidates', () => {
      const pool = [fused('best', 1.0), fused('mid', 0.5), fused('worst', 0.1)];
      const bundle = assembler.assemble(bundleFor({ maxElements: 2 }), pool);

      expect(bundle.elements.map((e) => e.id)).toEqual(['best', 'mid']);
    });

    it('does not flag truncation when everything fits', () => {
      const bundle = assembler.assemble(bundleFor({ maxElements: 10 }), [
        fused('a', 0.9),
        fused('b', 0.5)
      ]);

      expect(bundle.truncated).toBe(false);
      expect(bundle.elements).toHaveLength(2);
    });
  });

  describe('token budget', () => {
    it('skips an element that does not fit', () => {
      const huge = fused('huge', 1.0, { content: 'x'.repeat(8000) });
      const small = fused('small', 0.5);

      const bundle = assembler.assemble(bundleFor({ tokenBudget: 200 }), [huge, small]);

      expect(bundle.elements.map((e) => e.id)).toEqual(['small']);
      expect(bundle.truncated).toBe(true);
    });

    it('never cuts an element in half', () => {
      const huge = fused('huge', 1.0, { content: 'СТОП'.repeat(2000) });
      const bundle = assembler.assemble(bundleFor({ tokenBudget: 150 }), [huge]);

      expect(bundle.elements).toHaveLength(0);
      expect(bundle.assembledContext).not.toContain('СТОП');
    });

    it('keeps filling after a skip instead of giving up', () => {
      const pool = [
        fused('huge', 1.0, { content: 'x'.repeat(8000) }),
        fused('a', 0.8),
        fused('b', 0.6)
      ];
      const bundle = assembler.assemble(bundleFor({ tokenBudget: 300 }), pool);

      expect(bundle.elements.map((e) => e.id)).toEqual(['a', 'b']);
    });

    it('stays within the configured budget', () => {
      const pool = Array.from({ length: 40 }, (_, i) =>
        fused(`n${i}`, 1 - i / 40, { content: 'word '.repeat(60) })
      );
      const bundle = assembler.assemble(
        bundleFor({ tokenBudget: 500, maxElements: 100 }),
        pool
      );

      expect(bundle.stats.totalTokens).toBeLessThanOrEqual(500);
      expect(bundle.truncated).toBe(true);
    });

    it('reports totalTokens consistent with the assembled text', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.9), fused('b', 0.5)]);
      expect(bundle.stats.totalTokens).toBe(estimateTokens(bundle.assembledContext));
    });
  });

  describe('contradictions', () => {
    it('places conflicts after the main context', () => {
      const bundle = assembler.assemble(bundleFor(), [
        conflictCand('ConflictRule', 1.0), // highest score, still goes last
        fused('PlainFact', 0.5)
      ]);

      const ctx = bundle.assembledContext;
      expect(ctx.indexOf('PlainFact')).toBeLessThan(ctx.indexOf('ConflictRule'));
      expect(ctx.indexOf('Relevant context')).toBeLessThan(ctx.indexOf('Contradictions'));
    });

    it('renders a conflict with the counterpart named', () => {
      const bundle = assembler.assemble(bundleFor(), [conflictCand('RuleA', 0.9, 'RuleB')]);

      expect(bundle.assembledContext).toContain('RuleA');
      expect(bundle.assembledContext).toContain('RuleB');
      expect(bundle.assembledContext).toContain('conflicts with');
      expect(bundle.assembledContext).toContain('value');
    });

    it('emits no conflict section when there are none', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.9)]);
      expect(bundle.assembledContext).not.toContain('Contradictions');
    });

    it('emits no main section when everything is a conflict', () => {
      const bundle = assembler.assemble(bundleFor(), [conflictCand('OnlyConflict', 0.9)]);

      expect(bundle.assembledContext).toContain('Contradictions');
      expect(bundle.assembledContext).not.toContain('Relevant context');
      expect(bundle.elements).toHaveLength(1);
    });

    it('counts conflicts against maxElements too', () => {
      const bundle = assembler.assemble(bundleFor({ maxElements: 2 }), [
        fused('a', 1.0),
        fused('b', 0.9),
        conflictCand('c', 0.8)
      ]);

      expect(bundle.elements).toHaveLength(2);
      expect(bundle.truncated).toBe(true);
    });

    it('reserves budget so a conflict is not squeezed out by main content', () => {
      const pool = [
        fused('a', 1.0, { content: 'word '.repeat(80) }),
        fused('b', 0.9, { content: 'word '.repeat(80) }),
        conflictCand('danger', 0.1)
      ];
      const bundle = assembler.assemble(
        bundleFor({ tokenBudget: 260, maxElements: 100 }),
        pool
      );

      expect(bundle.assembledContext).toContain('danger');
      expect(bundle.stats.totalTokens).toBeLessThanOrEqual(260);
    });
  });

  describe('paths', () => {
    it('renders a multi-hop path as one chained statement', () => {
      const candidate = fused('SessionTimeout', 0.9, {
        metadata: {
          name: 'SessionTimeout',
          hops: 2,
          seedId: 'draft_1',
          terminalEdgeType: 'GOVERNS',
          expansionPath: [
            { nodeId: 'draft_1', nodeType: 'DraftEntity', nodeName: 'User', edgeType: null, edgeDirection: null },
            { nodeId: 'draft_7', nodeType: 'DraftEntity', nodeName: 'Session', edgeType: 'DEPENDS_ON', edgeDirection: 'outgoing' },
            { nodeId: 'draft_12', nodeType: 'DraftBusinessRule', nodeName: 'SessionTimeout', edgeType: 'GOVERNS', edgeDirection: 'outgoing' }
          ]
        }
      });

      const bundle = assembler.assemble(bundleFor(), [candidate]);

      expect(bundle.assembledContext)
        .toContain('User depends on Session, which governs SessionTimeout');
    });

    it('renders an incoming hop with the inverted verb, not a reversed arrow', () => {
      expect(natural.serializePath([
        { nodeId: '1', nodeName: 'A', edgeType: null, edgeDirection: null },
        { nodeId: '2', nodeName: 'B', edgeType: 'GOVERNS', edgeDirection: 'incoming' }
      ])).toBe('A is governed by B (connection: strong)');
    });

    it('emits nothing for a seed-only or missing path', () => {
      expect(natural.serializePath(undefined)).toBe('');
      expect(natural.serializePath([{ nodeId: '1', nodeName: 'A', edgeType: null }])).toBe('');
    });

    it('omits the Related line for seed candidates', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.9)]);
      expect(bundle.assembledContext).not.toContain('Related:');
    });
  });

  describe('provenance', () => {
    it('names the source for every element', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.9)]);
      expect(bundle.assembledContext).toContain('Source: DRAFT_ENTITY src_a');
    });

    it('includes the chunk index when present', () => {
      const c = fused('a', 0.9, {
        provenance: { sourceId: 'src_1', sourceType: 'SOURCE_REFERENCE', chunkIndex: 3 }
      });
      const bundle = assembler.assemble(bundleFor(), [c]);
      expect(bundle.assembledContext).toContain('chunk 3');
    });
  });

  describe('degenerate input', () => {
    it('handles an empty pool', () => {
      const bundle = assembler.assemble(bundleFor(), []);

      expect(bundle.elements).toEqual([]);
      expect(bundle.assembledContext).toBe('');
      expect(bundle.truncated).toBe(false);
      expect(bundle.stats.afterFusion).toBe(0);
      expect(bundle.stats.totalTokens).toBe(0);
    });

    it('handles a null pool', () => {
      const bundle = assembler.assemble(bundleFor(), null);
      expect(bundle.elements).toEqual([]);
    });

    it('drops null entries in the pool', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.9), null]);
      expect(bundle.elements).toHaveLength(1);
      expect(bundle.stats.afterFusion).toBe(1);
    });

    it('records assembly timing', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.9)]);
      expect(bundle.timing.assemblyMs).toBeGreaterThanOrEqual(0);
    });

    it('falls back to the id when no name is available', () => {
      const bundle = assembler.assemble(bundleFor(), [fused('a', 0.9, { metadata: {} })]);
      expect(bundle.assembledContext).toContain('**a**');
    });
  });
});

describe('Radix Assembly: serializers', () => {
  it('returns the natural serializer by default', () => {
    expect(createSerializer().format).toBe('natural');
    expect(createSerializer('natural').format).toBe('natural');
  });

  it('rejects formats that are declared but not implemented', () => {
    expect(() => createSerializer('structured')).toThrow('not implemented yet');
    expect(() => createSerializer('compact')).toThrow('not implemented yet');
  });

  it('rejects an unknown format', () => {
    expect(() => createSerializer('yaml')).toThrow('Unknown assembly format');
  });

  it('ASSEMBLY_FORMATS matches the config enum', () => {
    expect(ASSEMBLY_FORMATS).toEqual(['natural', 'structured', 'compact']);
  });

  it('an unimplemented format fails the whole assemble call, loudly', () => {
    const assembler = new ContextAssembler({ logger: silentLogger });
    const bundle = createContextBundle('ws_1', 'q', { assemblyFormat: 'compact' });
    expect(() => assembler.assemble(bundle, [fused('a', 0.9)])).toThrow('not implemented yet');
  });
});

describe('Radix Assembly: token counter', () => {
  it('returns 0 for empty or non-string input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(42)).toBe(0);
  });

  it('charges ASCII at ~4 chars per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('charges non-ASCII at ~2 chars per token', () => {
    expect(estimateTokens('я'.repeat(400))).toBe(200);
  });

  it('costs Cyrillic more than Latin of the same length', () => {
    const latin = estimateTokens('a'.repeat(200));
    const cyrillic = estimateTokens('я'.repeat(200));
    expect(cyrillic).toBeGreaterThan(latin);
  });

  it('handles mixed scripts additively', () => {
    expect(estimateTokens('a'.repeat(400) + 'я'.repeat(400))).toBe(300);
  });
});

describe('Radix Config: fusionPoolSize and assemblyFormat', () => {
  it('defaults to a pool of 50 and 15 final elements', () => {
    expect(DEFAULT_CONFIG.fusionPoolSize).toBe(50);
    expect(DEFAULT_CONFIG.maxElements).toBe(15);
    expect(DEFAULT_CONFIG.assemblyFormat).toBe('natural');
  });

  it('never lets the pool fall below the final element count', () => {
    expect(mergeConfig({ fusionPoolSize: 3, maxElements: 20 }).fusionPoolSize).toBe(20);
    expect(mergeConfig({ maxElements: 80 }).fusionPoolSize).toBe(80);
  });

  it('caps the pool at 200', () => {
    expect(mergeConfig({ fusionPoolSize: 5000 }).fusionPoolSize).toBe(200);
  });

  it('accepts a valid assemblyFormat and ignores an invalid one', () => {
    expect(mergeConfig({ assemblyFormat: 'compact' }).assemblyFormat).toBe('compact');
    expect(mergeConfig({ assemblyFormat: 'yaml' }).assemblyFormat).toBe('natural');
  });
});

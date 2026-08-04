'use strict';

const {
  createContextElement,
  createContextBundle,
  validateContextBundle,
  mergeConfig,
  edgeWeight,
  DEFAULT_CONFIG,
  DEFAULT_EDGE_WEIGHTS,
  DEFAULT_EDGE_WEIGHT,
  ELEMENT_TYPES
} = require('../context-bundle');

describe('Radix Contracts: ContextBundle', () => {
  describe('createContextElement', () => {
    const validParams = {
      id: 'draft_123',
      type: 'entity',
      content: 'User entity representing system users',
      score: 0.85,
      provenance: {
        sourceId: 'src_456',
        sourceType: 'SOURCE_REFERENCE'
      }
    };

    it('creates valid element with all required fields', () => {
      const element = createContextElement(validParams);

      expect(element.id).toBe('draft_123');
      expect(element.type).toBe('entity');
      expect(element.content).toBe('User entity representing system users');
      expect(element.score).toBe(0.85);
      expect(element.provenance.sourceId).toBe('src_456');
      expect(element.strategies).toEqual([]);
      expect(element.metadata).toEqual({});
    });

    it('throws if id missing', () => {
      expect(() => createContextElement({ ...validParams, id: null }))
        .toThrow('requires id');
    });

    it('throws if type missing', () => {
      expect(() => createContextElement({ ...validParams, type: null }))
        .toThrow('requires type');
    });

    it('throws if content not string', () => {
      expect(() => createContextElement({ ...validParams, content: 123 }))
        .toThrow('requires content string');
    });

    it('throws if score out of range', () => {
      expect(() => createContextElement({ ...validParams, score: 1.5 }))
        .toThrow('score in [0, 1]');
      expect(() => createContextElement({ ...validParams, score: -0.1 }))
        .toThrow('score in [0, 1]');
    });

    it('throws if score is NaN', () => {
      expect(() => createContextElement({ ...validParams, score: NaN }))
        .toThrow('score in [0, 1]');
    });

    it('throws if provenance incomplete', () => {
      expect(() => createContextElement({ ...validParams, provenance: {} }))
        .toThrow('provenance with sourceId');
      expect(() => createContextElement({
        ...validParams,
        provenance: { sourceId: 'x' }
      })).toThrow('provenance with sourceId and sourceType');
    });

    it('preserves optional fields', () => {
      const element = createContextElement({
        ...validParams,
        contentRaw: { structured: 'data' },
        strategies: [{ strategyName: 'vector', rawScore: 0.9, normalizedScore: 0.85, rank: 1 }],
        metadata: { entityType: 'User', properties: { active: true } }
      });

      expect(element.contentRaw).toEqual({ structured: 'data' });
      expect(element.strategies).toHaveLength(1);
      expect(element.metadata.entityType).toBe('User');
    });
  });

  describe('createContextBundle', () => {
    it('creates bundle with defaults', () => {
      const bundle = createContextBundle('ws_abc', 'find user authentication');

      expect(bundle.bundleId).toMatch(/^rb_\d+_[a-z0-9]+$/);
      expect(bundle.workspaceId).toBe('ws_abc');
      expect(bundle.query).toBe('find user authentication');
      expect(bundle.elements).toEqual([]);
      expect(bundle.strategiesUsed).toEqual([]);
      expect(bundle.truncated).toBe(false);
      expect(bundle.config.vectorThreshold).toBe(0.82);
      expect(bundle.config.fusionMethod).toBe('rrf');
    });

    it('merges custom config', () => {
      const bundle = createContextBundle('ws_abc', 'query', {
        vectorTopK: 50,
        tokenBudget: 8000
      });

      expect(bundle.config.vectorTopK).toBe(50);
      expect(bundle.config.tokenBudget).toBe(8000);
      expect(bundle.config.vectorThreshold).toBe(0.82); // default preserved
    });

    it('clamps invalid config through the same validation as mergeConfig', () => {
      const bundle = createContextBundle('ws_abc', 'query', { graphMaxDepth: 99 });
      expect(bundle.config.graphMaxDepth).toBe(5);
    });

    it('initialises timing and stats counters at zero', () => {
      const bundle = createContextBundle('ws_abc', 'query');

      expect(bundle.timing).toEqual({
        totalMs: 0,
        byStrategy: {},
        embeddingMs: 0,
        fusionMs: 0,
        rerankMs: 0,
        assemblyMs: 0
      });
      expect(bundle.stats).toEqual({
        candidatesFromSeed: 0,
        candidatesFromExpansion: 0,
        afterFusion: 0,
        afterTruncation: 0,
        totalTokens: 0,
        failedStrategies: []
      });
      expect(bundle.assembledContext).toBe('');
    });

    it('produces a distinct bundleId per call', () => {
      const a = createContextBundle('ws', 'q');
      const b = createContextBundle('ws', 'q');
      expect(a.bundleId).not.toBe(b.bundleId);
    });
  });

  describe('validateContextBundle', () => {
    it('passes valid bundle', () => {
      const bundle = createContextBundle('ws_1', 'query');
      bundle.elements.push(createContextElement({
        id: 'e1',
        type: 'entity',
        content: 'test',
        score: 0.5,
        provenance: { sourceId: 's1', sourceType: 'DRAFT' }
      }));

      const result = validateContextBundle(bundle);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('reports missing bundleId', () => {
      const bundle = createContextBundle('ws_1', 'query');
      bundle.bundleId = null;

      const result = validateContextBundle(bundle);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing bundleId');
    });

    it('reports invalid elements', () => {
      const bundle = createContextBundle('ws_1', 'query');
      bundle.elements.push({ score: 0.5 }); // missing id, type, provenance

      const result = validateContextBundle(bundle);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Element 0: missing id');
      expect(result.errors).toContain('Element 0: missing type');
      expect(result.errors).toContain('Element 0: missing provenance');
    });

    it('reports elements not being an array', () => {
      const bundle = createContextBundle('ws_1', 'query');
      bundle.elements = 'nope';

      const result = validateContextBundle(bundle);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('elements must be array');
    });

    it('rejects a non-object bundle without throwing', () => {
      expect(validateContextBundle(null)).toEqual({
        valid: false,
        errors: ['Bundle must be an object']
      });
    });
  });

  describe('mergeConfig', () => {
    it('returns defaults for empty input', () => {
      const config = mergeConfig({});
      expect(config).toEqual(DEFAULT_CONFIG);
    });

    it('clamps out-of-range values', () => {
      const config = mergeConfig({
        vectorTopK: 500,      // max 100
        vectorThreshold: 2.0, // max 1
        graphMaxDepth: 10,    // max 5
        maxElements: 0        // min 1
      });

      expect(config.vectorTopK).toBe(100);
      expect(config.vectorThreshold).toBe(1);
      expect(config.graphMaxDepth).toBe(5);
      expect(config.maxElements).toBe(1);
    });

    it('merges edge weights additively', () => {
      const config = mergeConfig({
        edgeWeights: { CUSTOM_EDGE: 0.95 }
      });

      expect(config.edgeWeights.CUSTOM_EDGE).toBe(0.95);
      expect(config.edgeWeights.IMPLEMENTS).toBe(1.0); // default preserved
    });

    it('validates fusionMethod enum', () => {
      expect(mergeConfig({ fusionMethod: 'rrf' }).fusionMethod).toBe('rrf');
      expect(mergeConfig({ fusionMethod: 'linear' }).fusionMethod).toBe('linear');
      expect(mergeConfig({ fusionMethod: 'invalid' }).fusionMethod).toBe('rrf'); // default
    });

    it('drops unknown keys', () => {
      const config = mergeConfig({ nonsense: true });
      expect(config.nonsense).toBeUndefined();
    });

    it('does not mutate DEFAULT_CONFIG', () => {
      mergeConfig({ vectorTopK: 7, edgeWeights: { IMPLEMENTS: 0.1 } });
      expect(DEFAULT_CONFIG.vectorTopK).toBe(20);
      expect(DEFAULT_EDGE_WEIGHTS.IMPLEMENTS).toBe(1.0);
    });
  });

  describe('edgeWeight', () => {
    it('returns the configured weight for a known edge type', () => {
      expect(edgeWeight('IMPLEMENTS')).toBe(1.0);
      expect(edgeWeight('BELONGS_TO')).toBe(0.4);
    });

    it('falls back for unknown/custom edge types', () => {
      expect(edgeWeight('MY_CUSTOM_EDGE')).toBe(DEFAULT_EDGE_WEIGHT);
    });

    it('strips the DRAFT_ prefix workspace edges carry', () => {
      // draft.service stores every relation under one DRAFT_RELATES_TO label,
      // so a type can reach us prefixed; charging the unknown-edge fallback for
      // a relation we do have a weight for would flatten the whole table.
      expect(edgeWeight('DRAFT_IMPLEMENTS')).toBe(1.0);
      expect(edgeWeight('DRAFT_CONFLICTS_WITH')).toBe(0.85);
    });

    it('still falls back for a prefixed type we do not know', () => {
      expect(edgeWeight('DRAFT_SOMETHING_ELSE')).toBe(DEFAULT_EDGE_WEIGHT);
    });

    it('returns the fallback for a missing edge type', () => {
      expect(edgeWeight(null)).toBe(DEFAULT_EDGE_WEIGHT);
      expect(edgeWeight(undefined)).toBe(DEFAULT_EDGE_WEIGHT);
    });

    it('honours a caller-supplied weight table', () => {
      const weights = mergeConfig({ edgeWeights: { MY_CUSTOM_EDGE: 0.77 } }).edgeWeights;
      expect(edgeWeight('MY_CUSTOM_EDGE', weights)).toBe(0.77);
    });

    it('covers every workspace edge type from WORKSPACE_REFERENCE §4', () => {
      const workspaceEdges = [
        'RELATES_TO', 'BELONGS_TO', 'CONTAINS', 'WORKS_IN', 'DEPENDS_ON',
        'IMPLEMENTS', 'REFERENCES', 'EXTENDS', 'PRODUCES', 'CONSUMES',
        'TRIGGERS', 'GOVERNS', 'CONFLICTS_WITH'
      ];
      for (const type of workspaceEdges) {
        expect(DEFAULT_EDGE_WEIGHTS[type]).toBeGreaterThan(0);
      }
    });
  });

  describe('ELEMENT_TYPES constant', () => {
    it('contains all expected types', () => {
      expect(ELEMENT_TYPES).toContain('graph_path');
      expect(ELEMENT_TYPES).toContain('text_chunk');
      expect(ELEMENT_TYPES).toContain('entity');
      expect(ELEMENT_TYPES).toContain('relation');
      expect(ELEMENT_TYPES).toContain('rule');
      expect(ELEMENT_TYPES).toContain('concept');
    });
  });
});

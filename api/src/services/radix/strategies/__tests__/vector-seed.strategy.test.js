'use strict';

const {
  VectorSeedStrategy,
  DRAFT_TYPE_TO_ELEMENT,
  DEFAULT_EXCLUDED_STATUSES
} = require('../vector-seed.strategy');
const { createDefaultStrategies } = require('../index');
const { mergeConfig, DEFAULT_CONFIG } = require('../../contracts/context-bundle');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

/** A Qdrant hit shaped exactly as draft.service indexes it. */
const hit = (id, score, payload = {}) => ({
  id,
  score,
  payload: {
    draftNodeId: id,
    type: 'entity',
    knowledgeFamily: 'STRUCTURAL',
    name: `Name of ${id}`,
    status: 'VALIDATED',
    sourceId: '', // draft.service writes an empty string here today
    workspaceId: 'ws_1',
    indexedAt: '2026-08-04T00:00:00.000Z',
    ...payload
  }
});

const qdrantMock = (hits = []) => ({
  workspaceSearch: jest.fn().mockResolvedValue(hits)
});

const contextFor = (config = {}) => ({
  workspaceId: 'ws_1',
  query: 'find approval rules',
  queryEmbedding: new Array(1024).fill(0.1),
  config: mergeConfig(config)
});

/** A Memgraph row shaped as the hydration query returns it. */
const graphRow = (id, overrides = {}) => ({
  id,
  labels: ['DraftEntity'],
  props: {
    id,
    name: `Name of ${id}`,
    description: `Description of ${id}`,
    type: 'entity',
    status: 'VALIDATED',
    knowledgeFamily: 'STRUCTURAL',
    content: '{}'
  },
  sourceRefId: null,
  sourceRefType: null,
  sourceRefName: null,
  ...overrides
});

const memgraphMock = (rows = []) => ({
  runQuery: jest.fn().mockResolvedValue(rows)
});

const build = (qdrant, memgraph) => new VectorSeedStrategy(
  { qdrantService: qdrant, memgraphService: memgraph, logger: silentLogger }
);

describe('Radix Strategies: VectorSeedStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('metadata', () => {
    it('is a seed strategy named vector-seed', () => {
      const s = build(qdrantMock());
      expect(s.name).toBe('vector-seed');
      expect(s.type).toBe('seed');
      expect(s.metadata.requiredServices).toContain('qdrantService');
    });
  });

  describe('Qdrant integration', () => {
    it('searches the workspace collection with the query embedding', async () => {
      const qdrant = qdrantMock([hit('d1', 0.9)]);
      const context = contextFor();

      await build(qdrant).execute(context);

      expect(qdrant.workspaceSearch).toHaveBeenCalledTimes(1);
      const [wsId, vector, options] = qdrant.workspaceSearch.mock.calls[0];
      expect(wsId).toBe('ws_1');
      expect(vector).toBe(context.queryEmbedding);
      expect(options.limit).toBe(DEFAULT_CONFIG.vectorTopK);
      expect(options.scoreThreshold).toBe(0.82);
    });

    it('passes the 0.82 threshold through by default', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor());
      expect(qdrant.workspaceSearch.mock.calls[0][2].scoreThreshold).toBe(0.82);
    });

    it('honours an overridden threshold and topK', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor({ vectorThreshold: 0.6, vectorTopK: 42 }));

      const options = qdrant.workspaceSearch.mock.calls[0][2];
      expect(options.scoreThreshold).toBe(0.6);
      expect(options.limit).toBe(42);
    });
  });

  describe('status exclusion', () => {
    it('excludes REJECTED and PROMOTED by default', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor());

      expect(qdrant.workspaceSearch.mock.calls[0][2].excludeStatus)
        .toEqual(['REJECTED', 'PROMOTED']);
    });

    it('honours a caller-supplied exclusion list', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor({ excludeDraftStatuses: ['REJECTED'] }));

      expect(qdrant.workspaceSearch.mock.calls[0][2].excludeStatus).toEqual(['REJECTED']);
    });

    it('an empty list disables exclusion', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor({ excludeDraftStatuses: [] }));

      expect(qdrant.workspaceSearch.mock.calls[0][2].excludeStatus).toEqual([]);
    });

    it('exposes the exclusion in debug output', async () => {
      const result = await build(qdrantMock([])).execute(contextFor());
      expect(result.debug.excludeStatus).toEqual(['REJECTED', 'PROMOTED']);
      expect(result.debug.threshold).toBe(0.82);
    });
  });

  describe('payload mapping', () => {
    it('maps a hit onto a well-formed candidate', async () => {
      const result = await build(qdrantMock([hit('d1', 0.91)])).execute(contextFor());

      expect(result.success).toBe(true);
      expect(result.candidates).toHaveLength(1);

      const c = result.candidates[0];
      expect(c.id).toBe('d1');
      expect(c.type).toBe('entity');
      expect(c.content).toBe('Name of d1');
      expect(c.score).toBe(0.91);
      expect(c.provenance).toEqual({ sourceId: 'd1', sourceType: 'DRAFT_ENTITY' });
      expect(c.metadata.name).toBe('Name of d1');
      expect(c.metadata.draftType).toBe('entity');
      expect(c.metadata.draftStatus).toBe('VALIDATED');
      expect(c.metadata.knowledgeFamily).toBe('STRUCTURAL');
    });

    it('keeps the raw payload for downstream use', async () => {
      const result = await build(qdrantMock([hit('d1', 0.9)])).execute(contextFor());
      expect(result.candidates[0].contentRaw.indexedAt).toBe('2026-08-04T00:00:00.000Z');
    });

    it('prefers draftNodeId over the point id', async () => {
      const h = hit('point-id', 0.9, { draftNodeId: 'real-draft-id' });
      const result = await build(qdrantMock([h])).execute(contextFor());
      expect(result.candidates[0].id).toBe('real-draft-id');
    });

    it('falls back to the point id when draftNodeId is missing', async () => {
      const h = hit('point-id', 0.9, { draftNodeId: undefined });
      const result = await build(qdrantMock([h])).execute(contextFor());
      expect(result.candidates[0].id).toBe('point-id');
    });

    it('appends a description when the un-hydrated payload has one', async () => {
      const h = hit('d1', 0.9, { description: 'Represents a system user' });
      const result = await build(qdrantMock([h])).execute(contextFor());
      expect(result.candidates[0].content).toBe('Name of d1. Represents a system user');
    });

    it('reports the empty indexed sourceId as null, not an empty string', async () => {
      const result = await build(qdrantMock([hit('d1', 0.9)])).execute(contextFor());
      expect(result.candidates[0].metadata.documentSourceId).toBeNull();
    });

    it('preserves a real documentSourceId once the indexer writes one', async () => {
      const h = hit('d1', 0.9, { sourceId: 'src_42' });
      const result = await build(qdrantMock([h])).execute(contextFor());
      expect(result.candidates[0].metadata.documentSourceId).toBe('src_42');
    });
  });

  describe('draft type mapping', () => {
    it.each([
      ['entity', 'entity'],
      ['schema', 'entity'],
      ['api_contract', 'entity'],
      ['anomaly', 'entity'],
      ['relationship', 'relation'],
      ['business_rule', 'rule'],
      ['policy', 'rule'],
      ['calculation', 'rule'],
      ['workflow', 'rule'],
      ['requirement', 'rule'],
      ['decision', 'concept'],
      ['concept', 'concept']
    ])('maps draft type %s onto element type %s', async (draftType, elementType) => {
      const result = await build(qdrantMock([hit('d1', 0.9, { type: draftType })]))
        .execute(contextFor());

      expect(result.candidates[0].type).toBe(elementType);
      // The precise domain type survives for the serializer.
      expect(result.candidates[0].metadata.draftType).toBe(draftType);
    });

    it('covers every draft type the workspace can produce', () => {
      const workspaceDraftTypes = [
        'entity', 'relationship', 'business_rule', 'schema', 'workflow', 'calculation',
        'concept', 'policy', 'decision', 'requirement', 'anomaly', 'api_contract'
      ];
      for (const type of workspaceDraftTypes) {
        expect(DRAFT_TYPE_TO_ELEMENT[type]).toBeDefined();
      }
    });

    it('falls back to entity for an unknown draft type', async () => {
      const result = await build(qdrantMock([hit('d1', 0.9, { type: 'brand_new_type' })]))
        .execute(contextFor());

      expect(result.candidates[0].type).toBe('entity');
      expect(result.candidates[0].provenance.sourceType).toBe('DRAFT_BRAND_NEW_TYPE');
    });
  });

  describe('degenerate and failing input', () => {
    it('returns an empty candidate list when nothing matched', async () => {
      const result = await build(qdrantMock([])).execute(contextFor());

      expect(result.success).toBe(true);
      expect(result.candidates).toEqual([]);
    });

    it('tolerates Qdrant returning null', async () => {
      const qdrant = { workspaceSearch: jest.fn().mockResolvedValue(null) };
      const result = await build(qdrant).execute(contextFor());

      expect(result.success).toBe(true);
      expect(result.candidates).toEqual([]);
    });

    it('contains a Qdrant failure instead of aborting retrieval', async () => {
      const qdrant = { workspaceSearch: jest.fn().mockRejectedValue(new Error('Qdrant down')) };
      const result = await build(qdrant).execute(contextFor());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Qdrant down');
      expect(result.candidates).toEqual([]);
    });

    it('fails cleanly when no qdrantService was injected', async () => {
      const result = await new VectorSeedStrategy({ logger: silentLogger })
        .execute(contextFor());

      expect(result.success).toBe(false);
      expect(result.error).toMatch('requires a qdrantService');
    });

    it('drops a malformed hit without losing the good ones', async () => {
      const qdrant = qdrantMock([
        hit('good', 0.9),
        { id: null, score: 0.8, payload: null },
        hit('alsogood', 0.7)
      ]);
      const result = await build(qdrant).execute(contextFor());

      expect(result.candidates.map((c) => c.id)).toEqual(['good', 'alsogood']);
      expect(result.debug.skipped).toBe(1);
      expect(result.debug.hitsReturned).toBe(3);
    });

    it('drops a hit whose score is not a finite number', async () => {
      const qdrant = qdrantMock([hit('bad', NaN), hit('good', 0.9)]);
      const result = await build(qdrant).execute(contextFor());

      expect(result.candidates.map((c) => c.id)).toEqual(['good']);
      expect(result.debug.skipped).toBe(1);
    });

    it('rejects a context with no queryEmbedding before calling Qdrant', async () => {
      const qdrant = qdrantMock([]);
      const result = await build(qdrant).execute({
        workspaceId: 'ws_1',
        query: 'q',
        config: mergeConfig({})
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('queryEmbedding is required for seed strategies');
      expect(qdrant.workspaceSearch).not.toHaveBeenCalled();
    });
  });

  describe('hydration from Memgraph', () => {
    it('issues exactly ONE batch query for all hits', async () => {
      const qdrant = qdrantMock([hit('d1', 0.9), hit('d2', 0.88), hit('d3', 0.85)]);
      const memgraph = memgraphMock([graphRow('d1'), graphRow('d2'), graphRow('d3')]);

      await build(qdrant, memgraph).execute(contextFor());

      expect(memgraph.runQuery).toHaveBeenCalledTimes(1);
      const [, params] = memgraph.runQuery.mock.calls[0];
      expect(params.draftIds).toEqual(['d1', 'd2', 'd3']);
      expect(params.wsId).toBe('ws_1');
    });

    it('scopes hydration through the workspace, not by id alone', async () => {
      const memgraph = memgraphMock([graphRow('d1')]);
      await build(qdrantMock([hit('d1', 0.9)]), memgraph).execute(contextFor());

      const [cypher] = memgraph.runQuery.mock.calls[0];
      expect(cypher).toContain('WorkSpace {id: $wsId}');
      expect(cypher).toContain('CONTAINS_DRAFT');
    });

    it('puts the description into content — the whole point of hydrating', async () => {
      const result = await build(
        qdrantMock([hit('d1', 0.9)]),
        memgraphMock([graphRow('d1')])
      ).execute(contextFor());

      expect(result.candidates[0].content).toBe('Name of d1. Description of d1');
      expect(result.candidates[0].metadata.hydrated).toBe(true);
    });

    it('lifts the content fields the embedding was built from', async () => {
      const row = graphRow('d1', {
        props: {
          id: 'd1',
          name: 'Approval limit',
          description: 'Caps unattended approvals',
          type: 'business_rule',
          status: 'VALIDATED',
          content: JSON.stringify({
            condition: 'amount > 50000',
            action: 'escalate to committee',
            ignored: 'not in the field list'
          })
        }
      });

      const result = await build(
        qdrantMock([hit('d1', 0.9, { type: 'business_rule' })]),
        memgraphMock([row])
      ).execute(contextFor());

      const content = result.candidates[0].content;
      expect(content).toContain('Approval limit');
      expect(content).toContain('Caps unattended approvals');
      expect(content).toContain('condition: amount > 50000');
      expect(content).toContain('action: escalate to committee');
      expect(content).not.toContain('not in the field list');
    });

    it('tolerates unparseable content JSON', async () => {
      const row = graphRow('d1', {
        props: { id: 'd1', name: 'X', description: 'Y', type: 'entity', content: '{broken' }
      });

      const result = await build(qdrantMock([hit('d1', 0.9)]), memgraphMock([row]))
        .execute(contextFor());

      expect(result.success).toBe(true);
      expect(result.candidates[0].content).toBe('X. Y');
    });

    it('resolves provenance to the SourceReference when the graph has one', async () => {
      const row = graphRow('d1', {
        sourceRefId: 'src_42',
        sourceRefType: 'FILE',
        sourceRefName: 'HR_policy_2025.pdf'
      });

      const result = await build(qdrantMock([hit('d1', 0.9)]), memgraphMock([row]))
        .execute(contextFor());

      expect(result.candidates[0].provenance).toEqual({
        sourceId: 'src_42',
        sourceType: 'FILE',
        draftId: 'd1'
      });
      expect(result.candidates[0].metadata.sourceRefName).toBe('HR_policy_2025.pdf');
    });

    it('falls back to draft provenance when no SourceReference is linked', async () => {
      const result = await build(qdrantMock([hit('d1', 0.9)]), memgraphMock([graphRow('d1')]))
        .execute(contextFor());

      expect(result.candidates[0].provenance).toEqual({
        sourceId: 'd1',
        sourceType: 'DRAFT_ENTITY'
      });
    });

    it('degrades to the Qdrant payload when Memgraph fails', async () => {
      const memgraph = { runQuery: jest.fn().mockRejectedValue(new Error('Memgraph down')) };
      const result = await build(qdrantMock([hit('d1', 0.9)]), memgraph).execute(contextFor());

      expect(result.success).toBe(true); // hydration failure is not retrieval failure
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].content).toBe('Name of d1');
      expect(result.candidates[0].metadata.hydrated).toBe(false);
    });

    it('degrades when no memgraphService was injected at all', async () => {
      const result = await new VectorSeedStrategy({
        qdrantService: qdrantMock([hit('d1', 0.9)]),
        logger: silentLogger
      }).execute(contextFor());

      expect(result.success).toBe(true);
      expect(result.candidates[0].metadata.hydrated).toBe(false);
    });

    it('keeps a hit whose draft is missing from the graph', async () => {
      // Point lingers in Qdrant after the draft was deleted from Memgraph.
      const result = await build(
        qdrantMock([hit('d1', 0.9), hit('ghost', 0.85)]),
        memgraphMock([graphRow('d1')])
      ).execute(contextFor());

      expect(result.candidates.map((c) => c.id)).toEqual(['d1', 'ghost']);
      expect(result.candidates[1].metadata.hydrated).toBe(false);
      expect(result.debug.hydrated).toBe(1);
    });

    it('skips Memgraph entirely when Qdrant returned nothing', async () => {
      const memgraph = memgraphMock([]);
      const result = await build(qdrantMock([]), memgraph).execute(contextFor());

      expect(memgraph.runQuery).not.toHaveBeenCalled();
      expect(result.candidates).toEqual([]);
      expect(result.debug.hydrationMs).toBe(0);
    });

    it('reports hydration timing and coverage in debug', async () => {
      const result = await build(
        qdrantMock([hit('d1', 0.9)]),
        memgraphMock([graphRow('d1')])
      ).execute(contextFor());

      expect(result.debug.hydrated).toBe(1);
      expect(result.debug.hydrationMs).toBeGreaterThanOrEqual(0);
    });

    it('prefers graph properties over the stale indexed payload', async () => {
      // The draft was renamed and re-validated after it was last indexed.
      const row = graphRow('d1', {
        props: {
          id: 'd1',
          name: 'Renamed in graph',
          description: 'Fresh',
          type: 'concept',
          status: 'READY_TO_PROMOTE',
          knowledgeFamily: 'SEMANTIC'
        }
      });

      const result = await build(
        qdrantMock([hit('d1', 0.9, { name: 'Stale name', status: 'DRAFT' })]),
        memgraphMock([row])
      ).execute(contextFor());

      const c = result.candidates[0];
      expect(c.metadata.name).toBe('Renamed in graph');
      expect(c.metadata.draftStatus).toBe('READY_TO_PROMOTE');
      expect(c.metadata.draftType).toBe('concept');
      expect(c.type).toBe('concept');
    });
  });

  describe('registration', () => {
    it('is in the default strategy registry', () => {
      const registry = createDefaultStrategies({ qdrantService: qdrantMock(), logger: silentLogger });

      expect(registry.has('vector-seed')).toBe(true);
      expect(registry.get('vector-seed')).toBeInstanceOf(VectorSeedStrategy);
    });

    it('exports the default exclusion list', () => {
      expect(DEFAULT_EXCLUDED_STATUSES).toEqual(['REJECTED', 'PROMOTED']);
    });
  });
});

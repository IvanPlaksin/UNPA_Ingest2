'use strict';

const { SourceChunkSeedStrategy } = require('../source-chunk-seed.strategy');
const { VectorSeedStrategy } = require('../vector-seed.strategy');
const { createDefaultStrategies } = require('../index');
const { CHUNK_KIND } = require('../../indexing/source-chunk-indexer');
const { mergeConfig, DEFAULT_CONFIG } = require('../../contracts/context-bundle');

const silentLogger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() };

/** A Qdrant hit shaped as the chunk indexer writes it. */
const hit = (id, score, payload = {}) => ({
  id,
  score,
  payload: {
    kind: CHUNK_KIND,
    sourceRefId: 'src_1',
    sourceRefName: 'UN_Policy_2024.pdf',
    sourceRefType: 'FILE',
    chunkIndex: 3,
    charOffset: 4521,
    charEnd: 6100,
    sectionTitle: '4.2 Approval Process',
    content: 'Purchases above 50000 EUR require committee approval.',
    workspaceId: 'ws_1',
    ...payload
  }
});

const qdrantMock = (hits = []) => ({ workspaceSearch: jest.fn().mockResolvedValue(hits) });

const contextFor = (config = {}) => ({
  workspaceId: 'ws_1',
  query: 'approval threshold',
  queryEmbedding: new Array(8).fill(0.1),
  config: mergeConfig(config)
});

const build = (qdrant) => new SourceChunkSeedStrategy({
  qdrantService: qdrant,
  logger: silentLogger
});

describe('Radix Strategies: SourceChunkSeedStrategy', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('metadata', () => {
    it('is a seed strategy named source-chunk-seed', () => {
      const s = build(qdrantMock());
      expect(s.name).toBe('source-chunk-seed');
      expect(s.type).toBe('seed');
    });

    it('is registered in the default registry', () => {
      const registry = createDefaultStrategies({ logger: silentLogger });
      expect(registry.has('source-chunk-seed')).toBe(true);
    });
  });

  describe('quota separation from drafts', () => {
    it('searches only chunks', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor());

      expect(qdrant.workspaceSearch.mock.calls[0][2].kind).toBe(CHUNK_KIND);
    });

    it('uses chunkTopK, not vectorTopK', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor({ vectorTopK: 40, chunkTopK: 7 }));

      expect(qdrant.workspaceSearch.mock.calls[0][2].limit).toBe(7);
    });

    it('uses the lower chunk threshold, not the draft threshold', async () => {
      const qdrant = qdrantMock([]);
      await build(qdrant).execute(contextFor());

      const options = qdrant.workspaceSearch.mock.calls[0][2];
      expect(options.scoreThreshold).toBe(0.78);
      expect(options.scoreThreshold).toBeLessThan(DEFAULT_CONFIG.vectorThreshold);
    });

    it('skips the round trip entirely when the quota is zero', async () => {
      const qdrant = qdrantMock([]);
      const result = await build(qdrant).execute(contextFor({ chunkTopK: 0 }));

      expect(qdrant.workspaceSearch).not.toHaveBeenCalled();
      expect(result.candidates).toEqual([]);
      expect(result.debug.disabled).toBe(true);
    });

    it('the draft strategy excludes chunks by kind, keeping pre-kind drafts', async () => {
      const qdrant = qdrantMock([]);
      const memgraph = { runQuery: jest.fn().mockResolvedValue([]) };
      await new VectorSeedStrategy({
        qdrantService: qdrant,
        memgraphService: memgraph,
        logger: silentLogger
      }).execute(contextFor());

      const options = qdrant.workspaceSearch.mock.calls[0][2];
      // must_not on kind — drafts indexed before the field existed have no
      // `kind` at all and therefore still match.
      expect(options.excludeKind).toBe(CHUNK_KIND);
      expect(options.kind).toBeUndefined();
    });
  });

  describe('candidate mapping', () => {
    it('maps a chunk hit onto a text_chunk candidate', async () => {
      const result = await build(qdrantMock([hit('pt_1', 0.81)])).execute(contextFor());

      expect(result.success).toBe(true);
      const c = result.candidates[0];

      expect(c.id).toBe('pt_1');
      expect(c.type).toBe('text_chunk');
      expect(c.content).toBe('Purchases above 50000 EUR require committee approval.');
      expect(c.score).toBe(0.81);
    });

    it('carries chunk position in provenance', async () => {
      const result = await build(qdrantMock([hit('pt_1', 0.81)])).execute(contextFor());

      expect(result.candidates[0].provenance).toEqual({
        sourceId: 'src_1',
        sourceType: 'FILE',
        chunkIndex: 3,
        charOffset: 4521
      });
    });

    it('names the element by its section heading', async () => {
      const meta = (await build(qdrantMock([hit('pt_1', 0.81)])).execute(contextFor()))
        .candidates[0].metadata;

      expect(meta.name).toBe('4.2 Approval Process');
      expect(meta.sectionTitle).toBe('4.2 Approval Process');
      expect(meta.sourceRefName).toBe('UN_Policy_2024.pdf');
      expect(meta.isSourceChunk).toBe(true);
    });

    it('falls back to the document name when there is no section heading', async () => {
      const result = await build(qdrantMock([hit('pt_1', 0.81, { sectionTitle: null })]))
        .execute(contextFor());

      expect(result.candidates[0].metadata.name).toBe('UN_Policy_2024.pdf');
    });

    it('drops a chunk with no text — there is nothing to hydrate it from', async () => {
      const result = await build(qdrantMock([
        hit('good', 0.81),
        hit('empty', 0.80, { content: null })
      ])).execute(contextFor());

      expect(result.candidates.map((c) => c.id)).toEqual(['good']);
      expect(result.debug.skipped).toBe(1);
    });

    it('drops a chunk with no sourceRefId — provenance would be unverifiable', async () => {
      const result = await build(qdrantMock([hit('orphan', 0.81, { sourceRefId: null })]))
        .execute(contextFor());

      expect(result.candidates).toEqual([]);
      expect(result.debug.skipped).toBe(1);
    });
  });

  describe('degenerate and failing input', () => {
    it('returns empty when nothing matched', async () => {
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

    it('contains a Qdrant failure', async () => {
      const qdrant = { workspaceSearch: jest.fn().mockRejectedValue(new Error('Qdrant down')) };
      const result = await build(qdrant).execute(contextFor());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Qdrant down');
    });

    it('fails cleanly with no qdrantService', async () => {
      const result = await new SourceChunkSeedStrategy({ logger: silentLogger })
        .execute(contextFor());

      expect(result.success).toBe(false);
      expect(result.error).toMatch('requires a qdrantService');
    });
  });

  describe('config contract', () => {
    it('defaults to 5 chunks at threshold 0.78', () => {
      expect(DEFAULT_CONFIG.chunkTopK).toBe(5);
      expect(DEFAULT_CONFIG.chunkScoreThreshold).toBe(0.78);
    });

    it('clamps the quota and threshold', () => {
      expect(mergeConfig({ chunkTopK: 999 }).chunkTopK).toBe(50);
      expect(mergeConfig({ chunkTopK: -1 }).chunkTopK).toBe(0);
      expect(mergeConfig({ chunkScoreThreshold: 5 }).chunkScoreThreshold).toBe(1);
    });
  });
});

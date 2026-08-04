'use strict';

const {
  indexSourceChunks,
  deleteSourceChunks,
  chunkPointId,
  CHUNK_KIND
} = require('../source-chunk-indexer');

const qdrantMock = () => ({
  workspaceUpsert: jest.fn().mockResolvedValue(undefined),
  workspaceDeleteByFilter: jest.fn().mockResolvedValue(undefined)
});

const teiMock = (dim = 8) => ({
  getEmbeddings: jest.fn().mockImplementation(
    async (texts) => texts.map(() => new Array(dim).fill(0.1))
  )
});

const source = (overrides = {}) => ({
  id: 'src_1',
  filename: 'UN_Policy_2024.pdf',
  sourceType: 'FILE',
  ...overrides
});

/** Long enough and structured enough that the chunker produces several chunks. */
const longText = () => [
  '1. Introduction',
  'This regulation governs the approval of procurement requests across all field offices. '.repeat(6),
  '2. Approval Thresholds',
  'Purchases above 50000 EUR require committee approval before any commitment is made. '.repeat(6),
  '3. Exceptions',
  'Emergency procurement may bypass the committee where a documented risk to life exists. '.repeat(6)
].join('\n\n');

const run = (over = {}) => indexSourceChunks({
  workspaceId: 'ws_1',
  source: source(),
  text: longText(),
  qdrantService: qdrantMock(),
  teiService: teiMock(),
  ...over
});

describe('Radix Indexing: source-chunk-indexer', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('chunkPointId', () => {
    it('is deterministic for the same source and index', () => {
      expect(chunkPointId('src_1', 3)).toBe(chunkPointId('src_1', 3));
    });

    it('differs per chunk and per source', () => {
      expect(chunkPointId('src_1', 3)).not.toBe(chunkPointId('src_1', 4));
      expect(chunkPointId('src_1', 3)).not.toBe(chunkPointId('src_2', 3));
    });

    it('is a UUID — Qdrant accepts no other string id', () => {
      expect(chunkPointId('src_1', 0))
        .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('indexing', () => {
    it('chunks the text and upserts points', async () => {
      const qdrant = qdrantMock();
      const result = await run({ qdrantService: qdrant });

      expect(result.skipped).toBe(false);
      expect(result.indexed).toBeGreaterThan(1);
      expect(qdrant.workspaceUpsert).toHaveBeenCalled();

      const [wsId, points] = qdrant.workspaceUpsert.mock.calls[0];
      expect(wsId).toBe('ws_1');
      expect(points.length).toBe(result.indexed);
    });

    it('writes the payload contract', async () => {
      const qdrant = qdrantMock();
      await run({ qdrantService: qdrant });

      const point = qdrant.workspaceUpsert.mock.calls[0][1][0];

      expect(point.payload.kind).toBe(CHUNK_KIND);
      expect(point.payload.sourceRefId).toBe('src_1');
      expect(point.payload.sourceRefName).toBe('UN_Policy_2024.pdf');
      expect(point.payload.sourceRefType).toBe('FILE');
      expect(typeof point.payload.chunkIndex).toBe('number');
      expect(typeof point.payload.charOffset).toBe('number');
      expect(typeof point.payload.content).toBe('string');
      expect(point.payload).toHaveProperty('sectionTitle');
    });

    it('stores the chunk text — there is no graph node to hydrate it from', async () => {
      const qdrant = qdrantMock();
      await run({ qdrantService: qdrant });

      const points = qdrant.workspaceUpsert.mock.calls.flatMap((c) => c[1]);
      for (const p of points) {
        expect(p.payload.content.length).toBeGreaterThan(0);
      }
    });

    it('embeds in batches rather than one call per chunk', async () => {
      const tei = teiMock();
      await run({ teiService: tei });

      // One call per batch, each carrying an array of texts.
      expect(tei.getEmbeddings).toHaveBeenCalled();
      expect(Array.isArray(tei.getEmbeddings.mock.calls[0][0])).toBe(true);
      expect(tei.getEmbeddings.mock.calls[0][0].length).toBeGreaterThan(1);
    });

    it('clears previous chunks before writing — re-indexing must not accumulate', async () => {
      const qdrant = qdrantMock();
      await run({ qdrantService: qdrant });

      expect(qdrant.workspaceDeleteByFilter).toHaveBeenCalledWith('ws_1', {
        must: [
          { key: 'kind', match: { value: CHUNK_KIND } },
          { key: 'sourceRefId', match: { value: 'src_1' } }
        ]
      });

      const deleteOrder = qdrant.workspaceDeleteByFilter.mock.invocationCallOrder[0];
      const upsertOrder = qdrant.workspaceUpsert.mock.invocationCallOrder[0];
      expect(deleteOrder).toBeLessThan(upsertOrder);
    });

    it('is idempotent — the same run produces the same point ids', async () => {
      const first = qdrantMock();
      const second = qdrantMock();
      await run({ qdrantService: first });
      await run({ qdrantService: second });

      const ids = (m) => m.workspaceUpsert.mock.calls.flatMap((c) => c[1]).map((p) => p.id);
      expect(ids(first)).toEqual(ids(second));
    });

    it('caps the number of chunks and reports the truncation', async () => {
      const qdrant = qdrantMock();
      const result = await run({ qdrantService: qdrant, maxChunks: 2 });

      expect(result.truncated).toBe(true);
      expect(result.indexed).toBe(2);
    });

    it('does not flag truncation below the cap', async () => {
      const result = await run({ maxChunks: 1000 });
      expect(result.truncated).toBe(false);
    });

    it('drops a chunk whose embedding came back empty', async () => {
      const tei = {
        getEmbeddings: jest.fn().mockImplementation(
          async (texts) => texts.map((_, i) => (i === 0 ? [] : new Array(8).fill(0.1)))
        )
      };
      const qdrant = qdrantMock();
      const result = await run({ teiService: tei, qdrantService: qdrant });

      const points = qdrant.workspaceUpsert.mock.calls.flatMap((c) => c[1]);
      expect(points.length).toBe(result.indexed);
      expect(points.every((p) => p.vector.length === 8)).toBe(true);
    });
  });

  describe('skips and failures', () => {
    it('skips text below the useful threshold', async () => {
      const qdrant = qdrantMock();
      const result = await indexSourceChunks({
        workspaceId: 'ws_1',
        source: source(),
        text: 'too short',
        qdrantService: qdrant,
        teiService: teiMock()
      });

      expect(result).toMatchObject({ indexed: 0, skipped: true, reason: 'text too short' });
      expect(qdrant.workspaceUpsert).not.toHaveBeenCalled();
    });

    it('skips a missing source or workspace', async () => {
      const r1 = await indexSourceChunks({ workspaceId: null, source: source(), text: longText() });
      const r2 = await indexSourceChunks({ workspaceId: 'ws_1', source: null, text: longText() });

      expect(r1.skipped).toBe(true);
      expect(r2.skipped).toBe(true);
    });

    it('skips when services are missing', async () => {
      const result = await indexSourceChunks({
        workspaceId: 'ws_1',
        source: source(),
        text: longText()
      });
      expect(result).toMatchObject({ skipped: true, reason: 'missing services' });
    });

    it('never throws — a failed index must not fail the upload that triggered it', async () => {
      const tei = { getEmbeddings: jest.fn().mockRejectedValue(new Error('TEI down')) };
      const result = await run({ teiService: tei });

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('TEI down');
      expect(result.indexed).toBe(0);
    });

    it('survives a Qdrant failure the same way', async () => {
      const qdrant = qdrantMock();
      qdrant.workspaceUpsert.mockRejectedValue(new Error('Qdrant down'));

      const result = await run({ qdrantService: qdrant });
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('Qdrant down');
    });
  });

  describe('deleteSourceChunks', () => {
    it('deletes only this source\'s chunks', async () => {
      const qdrant = qdrantMock();
      await deleteSourceChunks(qdrant, 'ws_1', 'src_9');

      expect(qdrant.workspaceDeleteByFilter).toHaveBeenCalledWith('ws_1', {
        must: [
          { key: 'kind', match: { value: CHUNK_KIND } },
          { key: 'sourceRefId', match: { value: 'src_9' } }
        ]
      });
    });
  });
});

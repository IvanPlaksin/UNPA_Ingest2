'use strict';

jest.mock('../../services/radix', () => ({ createRadixRetriever: jest.fn() }));
jest.mock('../../services/workspace/workspace.service', () => ({ get: jest.fn() }));
jest.mock('../../services/qdrant.service', () => ({}));
jest.mock('../../services/memgraph.service', () => ({}));

const { createRadixRetriever } = require('../../services/radix');
const workspaceService = require('../../services/workspace/workspace.service');

const controller = require('../radix.controller');
const { toElementDTO, formatPath } = require('../radix.controller');

const mockRetrieve = jest.fn();
createRadixRetriever.mockReturnValue({ retrieve: mockRetrieve });

const element = (overrides = {}) => ({
  id: 'd1',
  type: 'entity',
  content: 'Qdrant. Vector database',
  contentRaw: {},
  score: 0.9,
  strategies: [
    { strategyName: 'vector-seed', strategyType: 'seed', rawScore: 0.86, normalizedScore: 1, rank: 1 }
  ],
  provenance: { sourceId: 'src_1', sourceType: 'FILE', draftId: 'd1' },
  metadata: { name: 'Qdrant', draftType: 'entity', draftStatus: 'DRAFT', sourceRefName: 'notes.pdf' },
  ...overrides
});

const bundle = (overrides = {}) => ({
  bundleId: 'rb_1_abc',
  workspaceId: 'ws_1',
  query: 'test',
  elements: [element()],
  assembledContext: '## Relevant context from this workspace\n\n**Qdrant** (entity)',
  strategiesUsed: ['vector-seed'],
  truncated: false,
  timing: { totalMs: 300, byStrategy: {}, embeddingMs: 60, fusionMs: 0, assemblyMs: 1 },
  stats: {
    candidatesFromSeed: 1,
    candidatesFromExpansion: 0,
    afterFusion: 1,
    afterTruncation: 1,
    totalTokens: 20,
    failedStrategies: []
  },
  ...overrides
});

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Radix Controller: POST /workspaces/:id/retrieve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspaceService.get.mockResolvedValue({ id: 'ws_1', name: 'WS' });
    mockRetrieve.mockResolvedValue(bundle());
  });

  describe('validation', () => {
    it('400s on a missing query', async () => {
      const res = mockRes();
      await controller.retrieve({ params: { id: 'ws_1' }, body: {} }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'query is required and must be a non-empty string'
      });
      expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('400s on a whitespace-only query', async () => {
      const res = mockRes();
      await controller.retrieve({ params: { id: 'ws_1' }, body: { query: '   ' } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400s on a non-string query', async () => {
      const res = mockRes();
      await controller.retrieve({ params: { id: 'ws_1' }, body: { query: 42 } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('400s when config is not an object', async () => {
      const res = mockRes();
      await controller.retrieve(
        { params: { id: 'ws_1' }, body: { query: 'q', config: [1, 2] } },
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, error: 'config must be an object' });
    });

    it('tolerates a missing body', async () => {
      const res = mockRes();
      await controller.retrieve({ params: { id: 'ws_1' } }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('workspace existence', () => {
    it('404s on an unknown workspace before retrieving', async () => {
      workspaceService.get.mockResolvedValue(null);
      const res = mockRes();

      await controller.retrieve({ params: { id: 'nope' }, body: { query: 'q' } }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Workspace not found: nope'
      });
      // "Not found" and "found nothing" must not look the same to a caller.
      expect(mockRetrieve).not.toHaveBeenCalled();
    });
  });

  describe('success', () => {
    it('returns the bundle in the project envelope', async () => {
      const res = mockRes();
      await controller.retrieve({ params: { id: 'ws_1' }, body: { query: 'test' } }, res, jest.fn());

      expect(res.status).not.toHaveBeenCalled(); // implicit 200
      const payload = res.json.mock.calls[0][0];

      expect(payload.success).toBe(true);
      expect(payload.data.bundleId).toBe('rb_1_abc');
      expect(payload.data.workspaceId).toBe('ws_1');
      expect(payload.data.elements).toHaveLength(1);
      expect(payload.data.assembledContext).toContain('Relevant context');
      expect(payload.data.strategiesUsed).toEqual(['vector-seed']);
      expect(payload.data.truncated).toBe(false);
      expect(payload.data.timing.totalMs).toBe(300);
      expect(payload.data.stats.failedStrategies).toEqual([]);
    });

    it('passes the query and config overrides through', async () => {
      const res = mockRes();
      await controller.retrieve(
        { params: { id: 'ws_1' }, body: { query: 'find rules', config: { maxElements: 5 } } },
        res,
        jest.fn()
      );

      expect(mockRetrieve).toHaveBeenCalledWith('ws_1', 'find rules', { maxElements: 5 });
    });

    it('defaults config to an empty object', async () => {
      const res = mockRes();
      await controller.retrieve({ params: { id: 'ws_1' }, body: { query: 'q' } }, res, jest.fn());
      expect(mockRetrieve).toHaveBeenCalledWith('ws_1', 'q', {});
    });

    it('surfaces failed strategies so a client can tell broken from empty', async () => {
      mockRetrieve.mockResolvedValue(bundle({
        elements: [],
        strategiesUsed: [],
        stats: { ...bundle().stats, failedStrategies: ['vector-seed'] }
      }));

      const res = mockRes();
      await controller.retrieve({ params: { id: 'ws_1' }, body: { query: 'q' } }, res, jest.fn());

      const payload = res.json.mock.calls[0][0];
      expect(payload.success).toBe(true);
      expect(payload.data.elements).toEqual([]);
      expect(payload.data.stats.failedStrategies).toEqual(['vector-seed']);
    });
  });

  describe('errors', () => {
    it('400s on a caller mistake the retriever rejects', async () => {
      mockRetrieve.mockRejectedValue(new Error('Unknown strategy: nope'));
      const next = jest.fn();
      const res = mockRes();

      await controller.retrieve(
        { params: { id: 'ws_1' }, body: { query: 'q', config: { strategies: ['nope'] } } },
        res,
        next
      );

      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('400s on an unimplemented assembly format', async () => {
      mockRetrieve.mockRejectedValue(new Error("Assembly format 'compact' is not implemented yet"));
      const res = mockRes();

      await controller.retrieve(
        { params: { id: 'ws_1' }, body: { query: 'q', config: { assemblyFormat: 'compact' } } },
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('delegates a genuine failure to the error middleware', async () => {
      const boom = new Error('Memgraph connection refused');
      mockRetrieve.mockRejectedValue(boom);
      const next = jest.fn();
      const res = mockRes();

      await controller.retrieve({ params: { id: 'ws_1' }, body: { query: 'q' } }, res, next);

      expect(next).toHaveBeenCalledWith(boom);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('delegates a workspace lookup failure', async () => {
      const boom = new Error('graph unavailable');
      workspaceService.get.mockRejectedValue(boom);
      const next = jest.fn();

      await controller.retrieve({ params: { id: 'ws_1' }, body: { query: 'q' } }, mockRes(), next);

      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});

describe('Radix Controller: DTO projection', () => {
  it('collapses strategy attributions to names', () => {
    const dto = toElementDTO(element({
      strategies: [
        { strategyName: 'vector-seed', rawScore: 0.9, normalizedScore: 1, rank: 1 },
        { strategyName: 'k-hop-expansion', rawScore: 0.72, normalizedScore: 0.5, rank: 4 }
      ]
    }));

    expect(dto.strategies).toEqual(['vector-seed', 'k-hop-expansion']);
    // Internal ranking mechanics stay internal.
    expect(JSON.stringify(dto)).not.toContain('rawScore');
  });

  it('exposes provenance including the document name', () => {
    const dto = toElementDTO(element());
    expect(dto.provenance).toEqual({
      sourceId: 'src_1',
      sourceType: 'FILE',
      draftId: 'd1',
      documentName: 'notes.pdf'
    });
  });

  it('omits absent optional fields rather than emitting nulls', () => {
    const dto = toElementDTO(element({
      provenance: { sourceId: 'd1', sourceType: 'DRAFT_ENTITY' },
      metadata: {}
    }));

    expect(dto.provenance).toEqual({ sourceId: 'd1', sourceType: 'DRAFT_ENTITY' });
    expect(dto.metadata).toEqual({});
  });

  it('renders an expansion path as one readable line', () => {
    const dto = toElementDTO(element({
      metadata: {
        name: 'LightRAG',
        hops: 2,
        expansionPath: [
          { nodeId: 'a', nodeName: 'HybridRAG', edgeType: null, edgeDirection: null },
          { nodeId: 'b', nodeName: 'UN ProjectAdvisor', edgeType: 'IMPLEMENTS', edgeDirection: 'outgoing' },
          { nodeId: 'c', nodeName: 'LightRAG', edgeType: 'IMPLEMENTS', edgeDirection: 'incoming' }
        ]
      }
    }));

    expect(dto.metadata.path)
      .toBe('HybridRAG --[IMPLEMENTS]--> UN ProjectAdvisor <--[IMPLEMENTS]-- LightRAG');
    expect(dto.metadata.hops).toBe(2);
  });

  it('emits no path for a seed-only element', () => {
    expect(formatPath(undefined)).toBeUndefined();
    expect(formatPath([{ nodeId: 'a', nodeName: 'A' }])).toBeUndefined();
    expect(toElementDTO(element()).metadata.path).toBeUndefined();
  });

  it('carries a conflict block through', () => {
    const dto = toElementDTO(element({
      metadata: { conflict: { withNodeId: 'x', withNodeName: 'RuleA', conflictType: 'semantic' } }
    }));

    expect(dto.metadata.conflict.withNodeName).toBe('RuleA');
  });
});

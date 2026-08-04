'use strict';

const { KnowledgeBindingService } = require('../knowledge-binding.service');

const graphReturning = (rows = []) => ({ runQuery: jest.fn().mockResolvedValue(rows) });
const svc = (graph) => new KnowledgeBindingService({ memgraphService: graph });

const bindingRow = (over = {}) => ({
  props: {
    id: 'b1',
    workspaceId: 'ws_bound',
    workspaceName: 'FlowDesk SOP',
    enabled: true,
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    updatedBy: 'admin',
    ...over
  }
});

describe('FlowDesk knowledge binding', () => {
  const ORIGINAL_ENV = process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID;
  });

  afterAll(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID;
    else process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = ORIGINAL_ENV;
  });

  describe('resolution order', () => {
    it('no binding and no env → nothing', async () => {
      expect(await svc(graphReturning([])).getActiveWorkspaceId()).toBeNull();
    });

    it('no binding, env set → env', async () => {
      process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = 'ws_env';
      expect(await svc(graphReturning([])).getActiveWorkspaceId()).toBe('ws_env');
    });

    it('binding enabled → the bound workspace', async () => {
      expect(await svc(graphReturning([bindingRow()])).getActiveWorkspaceId()).toBe('ws_bound');
    });

    it('the binding wins over env', async () => {
      process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = 'ws_env';
      expect(await svc(graphReturning([bindingRow()])).getActiveWorkspaceId()).toBe('ws_bound');
    });

    it('a DISABLED binding means off — it does NOT fall back to env', async () => {
      // An operator switching knowledge off must not be overridden by a stale
      // env var they may not even know is set.
      process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = 'ws_env';
      const result = await svc(graphReturning([bindingRow({ enabled: false })]))
        .getActiveWorkspaceId();

      expect(result).toBeNull();
    });

    it('fails closed on a read error rather than using env', async () => {
      process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = 'ws_env';
      const graph = { runQuery: jest.fn().mockRejectedValue(new Error('Memgraph down')) };

      expect(await svc(graph).getActiveWorkspaceId()).toBeNull();
    });
  });

  describe('cache', () => {
    it('reads the graph once within the TTL', async () => {
      const graph = graphReturning([bindingRow()]);
      const s = svc(graph);

      await s.getActiveWorkspaceId();
      await s.getActiveWorkspaceId();
      await s.getActiveWorkspaceId();

      // Consulted on every chat turn — a graph read per turn would be waste.
      expect(graph.runQuery).toHaveBeenCalledTimes(1);
    });

    it('caches the ABSENCE of a binding too', async () => {
      const graph = graphReturning([]);
      const s = svc(graph);

      await s.getActiveWorkspaceId();
      await s.getActiveWorkspaceId();

      expect(graph.runQuery).toHaveBeenCalledTimes(1);
    });

    it('re-reads after invalidation', async () => {
      const graph = graphReturning([bindingRow()]);
      const s = svc(graph);

      await s.getActiveWorkspaceId();
      s.invalidateCache();
      await s.getActiveWorkspaceId();

      expect(graph.runQuery).toHaveBeenCalledTimes(2);
    });

    it('does not cache a failed read', async () => {
      const graph = { runQuery: jest.fn().mockRejectedValue(new Error('down')) };
      const s = svc(graph);

      await s.getActiveWorkspaceId();
      await s.getActiveWorkspaceId();

      // Caching a failure would extend an outage by five minutes.
      expect(graph.runQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe('mutations', () => {
    it('upserts a single binding node', async () => {
      const graph = graphReturning([bindingRow()]);
      await svc(graph).setBinding('ws_new', { workspaceName: 'EX Intend', updatedBy: 'ivan' });

      const [cypher, params] = graph.runQuery.mock.calls[0];
      expect(cypher).toContain('MERGE (b:FlowDeskKnowledgeBinding)');
      expect(cypher).toContain('ON CREATE SET');
      expect(params.workspaceId).toBe('ws_new');
      expect(params.updatedBy).toBe('ivan');
    });

    it('never writes a null property — Memgraph rejects it', async () => {
      const graph = graphReturning([bindingRow()]);
      await svc(graph).setBinding('ws_new');

      const params = graph.runQuery.mock.calls[0][1];
      expect(Object.values(params).every((v) => v !== null && v !== undefined)).toBe(true);
    });

    it('requires a workspaceId', async () => {
      await expect(svc(graphReturning()).setBinding('')).rejects.toThrow('workspaceId is required');
    });

    it('invalidates the cache after a change', async () => {
      const graph = graphReturning([bindingRow()]);
      const s = svc(graph);

      await s.getActiveWorkspaceId();
      await s.setBinding('ws_other');
      await s.getActiveWorkspaceId();

      // read, setBinding, read again — a stale cache would serve the old
      // workspace for five minutes after an admin switched it.
      expect(graph.runQuery).toHaveBeenCalledTimes(3);
    });

    it('disable keeps the node and records who did it', async () => {
      const graph = graphReturning([bindingRow({ enabled: false })]);
      const result = await svc(graph).disableBinding({ updatedBy: 'ivan' });

      expect(graph.runQuery.mock.calls[0][0]).toContain('SET b.enabled = false');
      expect(result.enabled).toBe(false);
      expect(graph.runQuery.mock.calls[0][1].updatedBy).toBe('ivan');
    });

    it('enable restores it', async () => {
      const graph = graphReturning([bindingRow()]);
      const result = await svc(graph).enableBinding({ updatedBy: 'ivan' });

      expect(graph.runQuery.mock.calls[0][0]).toContain('SET b.enabled = true');
      expect(result.enabled).toBe(true);
    });

    it('delete removes the node and restores the env fallback', async () => {
      process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = 'ws_env';
      const graph = { runQuery: jest.fn() };
      graph.runQuery.mockResolvedValueOnce([{ deletedId: 'b1' }]);
      graph.runQuery.mockResolvedValueOnce([]);

      const s = svc(graph);
      expect(await s.deleteBinding()).toBe(true);
      expect(await s.getActiveWorkspaceId()).toBe('ws_env');
    });

    it('delete reports false when there was nothing to delete', async () => {
      expect(await svc(graphReturning([])).deleteBinding()).toBe(false);
    });
  });

  describe('getStatus for the admin UI', () => {
    it('reports a graph binding as such', async () => {
      const status = await svc(graphReturning([bindingRow()])).getStatus();

      expect(status.source).toBe('graph');
      expect(status.workspaceId).toBe('ws_bound');
      expect(status.workspaceName).toBe('FlowDesk SOP');
      expect(status.active).toBe('ws_bound');
      expect(status.updatedBy).toBe('admin');
    });

    it('reports a disabled binding with no active workspace', async () => {
      const status = await svc(graphReturning([bindingRow({ enabled: false })])).getStatus();

      expect(status.source).toBe('graph');
      expect(status.enabled).toBe(false);
      expect(status.active).toBeNull();
    });

    it('says when the value comes from env, so the UI can explain why editing does nothing', async () => {
      process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = 'ws_env';
      const status = await svc(graphReturning([])).getStatus();

      expect(status.source).toBe('env');
      expect(status.workspaceId).toBe('ws_env');
    });

    it('reports nothing configured', async () => {
      const status = await svc(graphReturning([])).getStatus();

      expect(status.source).toBe('none');
      expect(status.active).toBeNull();
    });

    it('does not present env as configured when the graph read failed', async () => {
      process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID = 'ws_env';
      const graph = { runQuery: jest.fn().mockRejectedValue(new Error('down')) };
      const status = await svc(graph).getStatus();

      // Consistent with fail-closed: retrieval will return nothing, so the UI
      // must not claim a workspace is active.
      expect(status.source).toBe('none');
      expect(status.active).toBeNull();
    });
  });
});

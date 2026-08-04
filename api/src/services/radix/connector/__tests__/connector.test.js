'use strict';

const {
  validateConnector,
  withDefaults,
  buildPreamble,
  CATEGORY_GUARDS,
  DEFAULTS
} = require('../connector.schema');
const { ConnectorService, toConnector } = require('../connector.service');

const graphReturning = (rows = []) => ({ runQuery: jest.fn().mockResolvedValue(rows) });

const svc = (graph) => new ConnectorService({ memgraphService: graph });

const propsRow = (over = {}) => ({
  props: {
    id: 'c1',
    workspaceId: 'ws_1',
    name: 'Service Catalog',
    category: 'serviceCatalog',
    enabled: true,
    priority: 0,
    vectorThreshold: 0.78,
    maxElements: 10,
    tokenBudget: 1500,
    draftTypes: [],
    knowledgeFamilies: [],
    excludeStatuses: ['REJECTED', 'PROMOTED'],
    preamble: '',
    createdAt: '2026-08-04T00:00:00.000Z',
    updatedAt: '2026-08-04T00:00:00.000Z',
    ...over
  }
});

const valid = { name: 'Service Catalog', category: 'serviceCatalog' };

describe('RadixConnector: schema', () => {
  describe('validation', () => {
    it('accepts a minimal connector', () => {
      const r = validateConnector(valid);
      expect(r.valid).toBe(true);
      expect(r.value).toEqual({ name: 'Service Catalog', category: 'serviceCatalog' });
    });

    it('requires name and category', () => {
      const r = validateConnector({});
      expect(r.valid).toBe(false);
      expect(r.errors).toEqual(
        expect.arrayContaining(['name is required', 'category is required'])
      );
    });

    it('rejects a category that would not survive a prompt header', () => {
      for (const bad of ['9lives', 'has space', 'has-dash', 'a', 'x'.repeat(41)]) {
        expect(validateConnector({ ...valid, category: bad }).valid).toBe(false);
      }
      for (const good of ['serviceCatalog', 'policies', 'a_b9']) {
        expect(validateConnector({ ...valid, category: good }).valid).toBe(true);
      }
    });

    it('clamps numeric settings instead of rejecting them', () => {
      const r = validateConnector({
        ...valid,
        vectorThreshold: 5,
        maxElements: 999,
        tokenBudget: 1,
        priority: 9999
      });

      expect(r.valid).toBe(true);
      expect(r.value.vectorThreshold).toBe(1);
      expect(r.value.maxElements).toBe(50);
      expect(r.value.tokenBudget).toBe(100);
      expect(r.value.priority).toBe(100);
    });

    it('rejects unknown draft types and families by name', () => {
      const types = validateConnector({ ...valid, draftTypes: ['entity', 'nonsense'] });
      expect(types.valid).toBe(false);
      expect(types.errors[0]).toMatch('nonsense');

      const fams = validateConnector({ ...valid, knowledgeFamilies: ['SEMANTIC', 'MADE_UP'] });
      expect(fams.valid).toBe(false);
      expect(fams.errors[0]).toMatch('MADE_UP');
    });

    it('accepts valid filters', () => {
      const r = validateConnector({
        ...valid,
        draftTypes: ['entity', 'business_rule'],
        knowledgeFamilies: ['SEMANTIC', 'OPERATIONAL']
      });
      expect(r.valid).toBe(true);
    });

    it('partial mode validates only what was supplied', () => {
      const r = validateConnector({ maxElements: 5 }, true);
      expect(r.valid).toBe(true);
      expect(r.value).toEqual({ maxElements: 5 });
    });

    it('never yields null for a list — Memgraph rejects null in a property map', () => {
      const withAll = withDefaults(validateConnector(valid).value);
      expect(withAll.draftTypes).toEqual([]);
      expect(withAll.knowledgeFamilies).toEqual([]);
      expect(Object.values(withAll).every((v) => v !== null)).toBe(true);
    });
  });

  describe('category guard', () => {
    it('serviceCatalog states that it is not a source of service codes', () => {
      // draft_create only accepts codes catalog_search returned this session;
      // without this sentence the model walks into a rejection.
      const text = buildPreamble({ category: 'serviceCatalog' });
      expect(text).toMatch(/NOT a source of service codes/i);
      expect(text).toMatch(/catalog_search/);
    });

    it('a custom preamble is APPENDED, never replaces the guard', () => {
      const text = buildPreamble({
        category: 'serviceCatalog',
        preamble: 'Prefer services owned by the requester duty station.'
      });

      expect(text).toMatch(/NOT a source of service codes/i);
      expect(text).toMatch(/duty station/);
      expect(text.indexOf('NOT a source')).toBeLessThan(text.indexOf('duty station'));
    });

    it('an admin cannot edit the guard away', () => {
      // The whole point: wording is configurable, the guardrail is not.
      const text = buildPreamble({ category: 'serviceCatalog', preamble: '' });
      expect(text).toBe(CATEGORY_GUARDS.serviceCatalog);
    });

    it('a category with no guard uses only the custom preamble', () => {
      expect(buildPreamble({ category: 'policies', preamble: 'Leave rules.' }))
        .toBe('Leave rules.');
      expect(buildPreamble({ category: 'policies' })).toBe('');
    });
  });
});

describe('RadixConnector: service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('attaches the connector to its workspace', async () => {
      const graph = graphReturning([propsRow()]);
      const result = await svc(graph).create('ws_1', valid);

      const [cypher, params] = graph.runQuery.mock.calls[0];
      expect(cypher).toContain('MATCH (w:WorkSpace {id: $wsId})');
      expect(cypher).toContain('CREATE (w)-[:HAS_CONNECTOR]->(c:RadixConnector)');
      expect(params.wsId).toBe('ws_1');
      expect(params.props.category).toBe('serviceCatalog');
      expect(result.id).toBe('c1');
    });

    it('stamps an id and timestamps', async () => {
      const graph = graphReturning([propsRow()]);
      await svc(graph).create('ws_1', valid);

      const { props } = graph.runQuery.mock.calls[0][1];
      expect(props.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(props.createdAt).toBeTruthy();
      expect(props.updatedAt).toBeTruthy();
    });

    it('applies defaults', async () => {
      const graph = graphReturning([propsRow()]);
      await svc(graph).create('ws_1', valid);

      const { props } = graph.runQuery.mock.calls[0][1];
      expect(props.vectorThreshold).toBe(DEFAULTS.vectorThreshold);
      expect(props.maxElements).toBe(DEFAULTS.maxElements);
      expect(props.enabled).toBe(true);
    });

    it('rejects invalid input before touching the graph', async () => {
      const graph = graphReturning([]);
      await expect(svc(graph).create('ws_1', { name: 'x' }))
        .rejects.toThrow('Invalid connector');
      expect(graph.runQuery).not.toHaveBeenCalled();
    });

    it('reports an unknown workspace', async () => {
      const graph = graphReturning([]);
      await expect(svc(graph).create('nope', valid)).rejects.toThrow('Workspace not found');
    });

    it('requires a workspaceId', async () => {
      await expect(svc(graphReturning()).create('', valid)).rejects.toThrow('workspaceId');
    });
  });

  describe('list', () => {
    it('scopes to the workspace edge', async () => {
      const graph = graphReturning([propsRow()]);
      await svc(graph).list('ws_1');

      expect(graph.runQuery.mock.calls[0][0])
        .toContain('(w:WorkSpace {id: $wsId})-[:HAS_CONNECTOR]->(c:RadixConnector)');
    });

    it('filters to enabled when asked', async () => {
      const graph = graphReturning([]);
      await svc(graph).list('ws_1', { enabledOnly: true });
      expect(graph.runQuery.mock.calls[0][0]).toContain('WHERE c.enabled = true');
    });

    it('orders by priority desc, then name', async () => {
      const graph = graphReturning([
        propsRow({ id: 'b', name: 'Beta', priority: 0 }),
        propsRow({ id: 'a', name: 'Alpha', priority: 0 }),
        propsRow({ id: 'top', name: 'Zulu', priority: 10 })
      ]);

      const result = await svc(graph).list('ws_1');
      expect(result.map((c) => c.id)).toEqual(['top', 'a', 'b']);
    });

    it('treats a connector written before priority existed as 0', async () => {
      // Sorting in Cypher would put a missing property somewhere unpredictable.
      const graph = graphReturning([propsRow({ id: 'old', priority: undefined })]);
      const result = await svc(graph).list('ws_1');
      expect(result[0].priority).toBe(0);
    });

    it('returns empty for no workspace', async () => {
      const graph = graphReturning([]);
      expect(await svc(graph).list('')).toEqual([]);
      expect(graph.runQuery).not.toHaveBeenCalled();
    });
  });

  describe('update and delete', () => {
    it('updates only the supplied fields', async () => {
      const graph = graphReturning([propsRow({ maxElements: 5 })]);
      await svc(graph).update('ws_1', 'c1', { maxElements: 5 });

      const [cypher, params] = graph.runQuery.mock.calls[0];
      expect(cypher).toContain('SET c += $updates');
      expect(params.updates).toEqual({ maxElements: 5 });
      expect(params.now).toBeTruthy();
    });

    it('refuses an update with nothing valid in it', async () => {
      const graph = graphReturning([]);
      await expect(svc(graph).update('ws_1', 'c1', {})).rejects.toThrow('No valid fields');
      expect(graph.runQuery).not.toHaveBeenCalled();
    });

    it('reports a connector that is not on this workspace', async () => {
      const graph = graphReturning([]);
      await expect(svc(graph).update('ws_1', 'other', { maxElements: 5 }))
        .rejects.toThrow('Connector not found');
    });

    it('deletes through the workspace edge', async () => {
      const graph = graphReturning([{ deletedId: 'c1' }]);
      const ok = await svc(graph).delete('ws_1', 'c1');

      expect(ok).toBe(true);
      const [cypher] = graph.runQuery.mock.calls[0];
      expect(cypher).toContain('-[:HAS_CONNECTOR]->');
      expect(cypher).toContain('DETACH DELETE c');
    });

    it('reports false when nothing was deleted', async () => {
      expect(await svc(graphReturning([])).delete('ws_1', 'gone')).toBe(false);
    });
  });

  describe('resolveForRetrieval', () => {
    it('returns enabled connectors with their preamble resolved', async () => {
      const graph = graphReturning([propsRow()]);
      const result = await svc(graph).resolveForRetrieval('ws_1');

      expect(result).toHaveLength(1);
      expect(result[0].resolvedPreamble).toMatch(/NOT a source of service codes/i);
      expect(graph.runQuery.mock.calls[0][0]).toContain('WHERE c.enabled = true');
    });

    it('degrades to no connectors rather than failing the turn', async () => {
      const graph = { runQuery: jest.fn().mockRejectedValue(new Error('Memgraph down')) };
      // A broken connector definition must not stop the chat answering.
      expect(await svc(graph).resolveForRetrieval('ws_1')).toEqual([]);
    });
  });

  describe('toConnector', () => {
    it('fills absent fields with defaults', () => {
      const c = toConnector({ id: 'c1', name: 'X', category: 'policies' });

      expect(c.enabled).toBe(true);
      expect(c.excludeStatuses).toEqual(['REJECTED', 'PROMOTED']);
      expect(c.draftTypes).toEqual([]);
      expect(c.preamble).toBe('');
    });

    it('returns null for nothing', () => {
      expect(toConnector(null)).toBeNull();
    });
  });
});

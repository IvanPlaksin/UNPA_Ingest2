'use strict';

jest.mock('../../../../services/radix', () => ({ createRadixRetriever: jest.fn() }));
jest.mock('../../../../services/qdrant.service', () => ({}));
jest.mock('../../../../services/memgraph.service', () => ({}));

const { createRadixRetriever } = require('../../../../services/radix');
const { RetrieveContextTool } = require('../RetrieveContextTool');
const { createWorkspaceTools } = require('../index');

const mockRetrieve = jest.fn();
createRadixRetriever.mockReturnValue({ retrieve: mockRetrieve });

const element = (overrides = {}) => ({
  id: 'd1',
  type: 'entity',
  content: 'Qdrant. Vector database for embeddings',
  score: 0.9,
  strategies: [{ strategyName: 'vector-seed' }, { strategyName: 'k-hop-expansion' }],
  provenance: { sourceId: 'src_1', sourceType: 'FILE' },
  metadata: { name: 'Qdrant', draftType: 'entity', sourceRefName: 'report.pdf', hops: 1 },
  ...overrides
});

const bundle = (overrides = {}) => ({
  bundleId: 'rb_1',
  workspaceId: 'ws_1',
  query: 'q',
  elements: [element()],
  assembledContext: '## Relevant context from this workspace\n\n**Qdrant** (entity)',
  strategiesUsed: ['vector-seed', 'k-hop-expansion'],
  truncated: false,
  stats: { failedStrategies: [] },
  ...overrides
});

describe('MCP tool: workspace.retrieve', () => {
  let tool;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRetrieve.mockResolvedValue(bundle());
    tool = new RetrieveContextTool();
  });

  describe('definition', () => {
    it('is registered under the workspace namespace with the expected id', () => {
      const def = tool.getDefinition();

      expect(def.id).toBe('workspace.retrieve');
      expect(def.namespace).toBe('WORKSPACE');
      expect(def.inputSchema.required).toEqual(['workspaceId', 'query']);
    });

    it('maps to an agent name the workspace whitelist admits', () => {
      const agentName = tool.getDefinition().id.replace(/\./g, '_');
      expect(agentName).toBe('workspace_retrieve');
      expect(/^workspace_/.test(agentName)).toBe(true);
    });

    it('declares itself side-effect free', () => {
      const def = tool.getDefinition();
      expect(def.sideEffects).toEqual([]);
      expect(def.safetyLevel).toBe('AUTO');
    });

    it('tells the agent when to prefer it over search_drafts', () => {
      // The two tools overlap; without this the agent picks by name alone.
      expect(tool.getDefinition().description).toMatch(/workspace\.search_drafts/);
    });

    it('is included in the workspace tool registry', () => {
      const ids = createWorkspaceTools().map((t) => t.getDefinition().id);
      expect(ids).toContain('workspace.retrieve');
    });
  });

  describe('execution', () => {
    it('passes workspaceId and query through', async () => {
      await tool.execute({ workspaceId: 'ws_1', query: 'find rules' }, {});
      expect(mockRetrieve).toHaveBeenCalledWith('ws_1', 'find rules', {});
    });

    it('forwards only the config knobs that were supplied', async () => {
      await tool.execute({
        workspaceId: 'ws_1',
        query: 'q',
        maxElements: 5,
        graphMaxDepth: 3
      }, {});

      expect(mockRetrieve).toHaveBeenCalledWith('ws_1', 'q', {
        maxElements: 5,
        graphMaxDepth: 3
      });
    });

    it('forwards threshold and token budget', async () => {
      await tool.execute({
        workspaceId: 'ws_1',
        query: 'q',
        vectorThreshold: 0.7,
        tokenBudget: 8000
      }, {});

      expect(mockRetrieve).toHaveBeenCalledWith('ws_1', 'q', {
        vectorThreshold: 0.7,
        tokenBudget: 8000
      });
    });

    it('ignores non-numeric config values rather than passing them on', async () => {
      await tool.execute({ workspaceId: 'ws_1', query: 'q', maxElements: 'lots' }, {});
      expect(mockRetrieve).toHaveBeenCalledWith('ws_1', 'q', {});
    });

    it('returns the prompt-ready context', async () => {
      const result = await tool.execute({ workspaceId: 'ws_1', query: 'q' }, {});
      const data = result.data || result;

      expect(data.assembledContext).toContain('Relevant context');
      expect(data.count).toBe(1);
      expect(data.strategiesUsed).toEqual(['vector-seed', 'k-hop-expansion']);
    });

    it('flattens each element for the agent', async () => {
      const result = await tool.execute({ workspaceId: 'ws_1', query: 'q' }, {});
      const el = (result.data || result).elements[0];

      expect(el).toEqual({
        id: 'd1',
        type: 'entity',
        name: 'Qdrant',
        content: 'Qdrant. Vector database for embeddings',
        foundBy: ['vector-seed', 'k-hop-expansion'],
        source: { sourceId: 'src_1', sourceType: 'FILE', documentName: 'report.pdf' },
        hops: 1,
        conflictsWith: undefined
      });
    });

    it('names the contradicted draft when there is a conflict', async () => {
      mockRetrieve.mockResolvedValue(bundle({
        elements: [element({
          metadata: {
            name: 'RuleB',
            draftType: 'business_rule',
            conflict: { withNodeId: 'x', withNodeName: 'RuleA', conflictType: 'semantic' }
          }
        })]
      }));

      const result = await tool.execute({ workspaceId: 'ws_1', query: 'q' }, {});
      expect((result.data || result).elements[0].conflictsWith).toBe('RuleA');
    });

    it('surfaces failed strategies so the agent does not report broken as empty', async () => {
      mockRetrieve.mockResolvedValue(bundle({
        elements: [],
        strategiesUsed: [],
        stats: { failedStrategies: ['vector-seed'] }
      }));

      const result = await tool.execute({ workspaceId: 'ws_1', query: 'q' }, {});
      const data = result.data || result;

      expect(data.count).toBe(0);
      expect(data.failedStrategies).toEqual(['vector-seed']);
    });

    it('rejects a call with no workspaceId', async () => {
      await expect(tool.execute({ query: 'q' }, {})).rejects.toThrow();
    });

    it('rejects a call with no query', async () => {
      await expect(tool.execute({ workspaceId: 'ws_1' }, {})).rejects.toThrow();
    });
  });
});

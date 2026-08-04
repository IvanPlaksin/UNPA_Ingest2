const { BaseTool } = require('../primitives/BaseTool');

/**
 * Workspace-scoped hybrid retrieval (Radix).
 *
 * Distinct from `workspace.search_drafts`, and the difference matters when the
 * agent picks between them:
 *
 * - `search_drafts` is pure vector similarity — "which drafts read like this?"
 * - `retrieve` seeds from vector search and then walks the graph outward, so it
 *   also returns the rule that governs a matched entity, the workflow it
 *   triggers, and any draft that contradicts it — none of which share vocabulary
 *   with the query and none of which vector search can reach.
 *
 * It also returns `assembledContext`: the whole result already serialized for
 * prompt injection, with contradictions in their own trailing block. An agent
 * that just wants context to reason over should use that string rather than
 * re-formatting `elements` itself.
 */
class RetrieveContextTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.retrieve',
      name: 'Retrieve WorkSpace Context (Hybrid)',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description:
        'Hybrid retrieval over a workspace: semantic vector search seeds a graph '
        + 'expansion, results are fused by reciprocal rank, and returned both as '
        + 'structured elements and as prompt-ready text. Finds related knowledge '
        + 'that shares no wording with the query — governing rules, dependencies, '
        + 'and contradicting drafts. Prefer this over workspace.search_drafts when '
        + 'you need CONTEXT to reason with rather than a list of matching drafts.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'query'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace to search within' },
          query: { type: 'string', description: 'Natural language text to find context for' },
          maxElements: {
            type: 'number',
            default: 15,
            description: 'Max elements in the result (1-50)'
          },
          graphMaxDepth: {
            type: 'number',
            default: 2,
            description: 'Graph expansion depth in hops (1-5)'
          },
          vectorThreshold: {
            type: 'number',
            default: 0.82,
            description: 'Minimum cosine similarity for vector seeds (0-1)'
          },
          tokenBudget: {
            type: 'number',
            default: 4000,
            description: 'Max tokens for the assembled context'
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) { // eslint-disable-line no-unused-vars
    this.validateArgs(args, ['workspaceId', 'query']);

    const { createRadixRetriever } = require('../../../services/radix');
    const retriever = createRadixRetriever({
      qdrantService: require('../../../services/qdrant.service'),
      memgraphService: require('../../../services/memgraph.service')
    });

    const config = {};
    if (typeof args.maxElements === 'number') config.maxElements = args.maxElements;
    if (typeof args.graphMaxDepth === 'number') config.graphMaxDepth = args.graphMaxDepth;
    if (typeof args.vectorThreshold === 'number') config.vectorThreshold = args.vectorThreshold;
    if (typeof args.tokenBudget === 'number') config.tokenBudget = args.tokenBudget;

    const bundle = await retriever.retrieve(args.workspaceId, args.query, config);

    return this.success({
      // The whole point of the tool: text the agent can reason over directly.
      assembledContext: bundle.assembledContext,
      elements: bundle.elements.map((el) => ({
        id: el.id,
        type: el.metadata.draftType || el.type,
        name: el.metadata.name || el.id,
        content: el.content,
        foundBy: (el.strategies || []).map((s) => s.strategyName),
        source: {
          sourceId: el.provenance.sourceId,
          sourceType: el.provenance.sourceType,
          documentName: el.metadata.sourceRefName || undefined
        },
        hops: el.metadata.hops,
        conflictsWith: el.metadata.conflict ? el.metadata.conflict.withNodeName : undefined
      })),
      count: bundle.elements.length,
      truncated: bundle.truncated,
      // Surfaced so the agent can distinguish "the workspace holds nothing on
      // this" from "retrieval was degraded" — it must not report the second as
      // though it were the first.
      failedStrategies: bundle.stats.failedStrategies,
      strategiesUsed: bundle.strategiesUsed
    });
  }
}

module.exports = { RetrieveContextTool };

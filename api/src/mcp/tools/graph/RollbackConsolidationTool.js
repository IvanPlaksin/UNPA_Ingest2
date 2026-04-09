const { BaseTool } = require('../primitives/BaseTool.js');
const { SubgraphAdapter } = require('../../../services/immutable-graph/integration/subgraph-adapter');

class RollbackConsolidationTool extends BaseTool {
  getDefinition() {
    return {
      id: 'graph.rollback_consolidation',
      name: 'Rollback Consolidation',
      version: '1.0.0',
      level: 3,
      category: 'graph',
      description: 'Rollback a subgraph consolidation using its checkpoint. Restores internal edges and unarchives nodes.',
      inputSchema: {
        type: 'object',
        required: ['checkpointId'],
        properties: {
          checkpointId: { type: 'string', description: 'Checkpoint ID from consolidation' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          restoredEdges: { type: 'number' },
          restoredNodes: { type: 'number' },
          subgraphId: { type: 'string' },
        },
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE', 'DELETE'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 100 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['checkpointId']);
    const adapter = new SubgraphAdapter();
    const result = await adapter.rollbackFromCheckpoint(args.checkpointId);
    return this.success(result);
  }
}

module.exports = { RollbackConsolidationTool };

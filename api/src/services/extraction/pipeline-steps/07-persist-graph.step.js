'use strict';

const { addLog, startStep, completeStep, failStep } = require('../pipeline-context');

module.exports = async function persistGraphStep(ctx) {
  startStep(ctx, 'persist-graph');
  try {
    addLog(ctx, 'persist-graph', `Persisting ${ctx.entities.length} entities, ${ctx.relations.length} relations via ${ctx.adapter.name} adapter`);

    // Delegate to adapter's persistFn — must populate ctx.persistedIds
    await ctx.adapter.persistGraph(ctx);

    const nodeCount = ctx.persistedIds.size;
    addLog(ctx, 'persist-graph', `Persisted ${nodeCount} nodes to Memgraph`);
    completeStep(ctx, 'persist-graph', { nodesCreated: nodeCount });
  } catch (err) {
    failStep(ctx, 'persist-graph', err);
    throw err;
  }
};

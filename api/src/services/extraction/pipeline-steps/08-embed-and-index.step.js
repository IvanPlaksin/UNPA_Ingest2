'use strict';

const { addLog, startStep, completeStep, skipStep } = require('../pipeline-context');
const { embedAndIndex } = require('../vector-indexer');

module.exports = async function embedAndIndexStep(ctx) {
  if (ctx.persistedIds.size === 0) {
    skipStep(ctx, 'embed-and-index', 'Nothing persisted');
    return;
  }

  startStep(ctx, 'embed-and-index');
  try {
    const count = await embedAndIndex(ctx);
    ctx.stats.vectorsIndexed = count;
    addLog(ctx, 'embed-and-index', `Indexed ${count} vectors`);
    completeStep(ctx, 'embed-and-index', { vectorsIndexed: count });
  } catch (err) {
    // Vector indexing is non-fatal
    addLog(ctx, 'embed-and-index', `Failed (non-fatal): ${err.message}`, 'warn');
    skipStep(ctx, 'embed-and-index', err.message);
    ctx.stats.vectorsIndexed = 0;
  }
};

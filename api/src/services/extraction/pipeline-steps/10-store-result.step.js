'use strict';

const { addLog, startStep, completeStep, failStep } = require('../pipeline-context');

module.exports = async function storeResultStep(ctx) {
  startStep(ctx, 'store-result');
  try {
    ctx.stats.durationMs = Date.now() - new Date(ctx.startedAt).getTime();

    await ctx.adapter.storeResult(ctx);

    addLog(ctx, 'store-result', `Result stored, resultId=${ctx.resultId}`);
    completeStep(ctx, 'store-result', { resultId: ctx.resultId, durationMs: ctx.stats.durationMs });
  } catch (err) {
    failStep(ctx, 'store-result', err);
    throw err;
  }
};

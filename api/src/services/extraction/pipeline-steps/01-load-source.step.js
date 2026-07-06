'use strict';

const { addLog, startStep, completeStep, failStep } = require('../pipeline-context');

module.exports = async function loadSourceStep(ctx) {
  startStep(ctx, 'load-source');
  try {
    addLog(ctx, 'load-source', `Loading source ${ctx.sourceId} (mode=${ctx.mode})`);

    const result = await ctx.adapter.loadSource(ctx);
    // adapter must set: ctx.sourceRef, ctx.text, and optionally ctx.documentType, ctx.domain, ctx.epistemicLayer

    ctx.stats.textChars = (ctx.text || '').length;
    addLog(ctx, 'load-source', `Loaded ${ctx.stats.textChars} chars, type=${ctx.documentType || 'UNKNOWN'}`);
    completeStep(ctx, 'load-source', { chars: ctx.stats.textChars, documentType: ctx.documentType });
  } catch (err) {
    failStep(ctx, 'load-source', err);
    throw err;
  }
};

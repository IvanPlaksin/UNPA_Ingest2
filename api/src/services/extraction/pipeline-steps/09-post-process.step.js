'use strict';

const { addLog, startStep, completeStep, skipStep } = require('../pipeline-context');

module.exports = async function postProcessStep(ctx) {
  const hooks = ctx.adapter.postProcessHooks;
  if (!hooks || hooks.length === 0) {
    skipStep(ctx, 'post-process', 'No hooks registered');
    return;
  }

  startStep(ctx, 'post-process');
  const results = {};

  for (const hook of hooks) {
    const name = hook.name || 'hook';
    try {
      addLog(ctx, 'post-process', `Running hook: ${name}`);
      const result = await hook(ctx);
      results[name] = result || {};
      addLog(ctx, 'post-process', `Hook ${name} done`);
    } catch (err) {
      addLog(ctx, 'post-process', `Hook ${name} failed (non-fatal): ${err.message}`, 'warn');
      results[name] = { error: err.message };
    }
  }

  ctx.postProcessResults = results;
  completeStep(ctx, 'post-process', results);
};

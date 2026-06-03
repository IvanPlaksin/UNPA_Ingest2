'use strict';

/**
 * Unified Extraction Pipeline
 *
 * Orchestrates all 10 steps. Both Documents and Workspaces use this
 * single entry point; adapter hooks carry all mode-specific logic.
 *
 * Usage:
 *   const { runPipeline } = require('./unified-pipeline');
 *   const result = await runPipeline('DOCUMENT', documentId, documentAdapter, options);
 */

const { createContext, addLog, overallProgress } = require('./pipeline-context');
const { updateProgress, completeProgress, failProgress } = require('./progress-bridge');

const STEPS = [
  require('./pipeline-steps/01-load-source.step'),
  require('./pipeline-steps/02-chunk-text.step'),
  require('./pipeline-steps/03-extract-entities.step'),
  require('./pipeline-steps/04-extract-relations.step'),
  require('./pipeline-steps/05-extract-specialized.step'),
  require('./pipeline-steps/06-deduplicate.step'),
  require('./pipeline-steps/07-persist-graph.step'),
  require('./pipeline-steps/08-embed-and-index.step'),
  require('./pipeline-steps/09-post-process.step'),
  require('./pipeline-steps/10-store-result.step'),
];

/**
 * Run the unified extraction pipeline.
 *
 * @param {string} mode        - 'DOCUMENT' | 'WORKSPACE'
 * @param {string} sourceId    - Document.id or SourceReference.id
 * @param {Object} adapter     - Adapter object (document.adapter or workspace.adapter)
 * @param {Object} [options]   - { workspaceId, extractTypes, model, jobId, bullJob, ... }
 * @returns {Promise<PipelineResult>}
 */
async function runPipeline(mode, sourceId, adapter, options = {}) {
  const ctx = createContext(mode, sourceId, adapter, options);
  const startMs = Date.now();

  addLog(ctx, 'pipeline', `Starting pipeline mode=${mode} source=${sourceId}`);
  await updateProgress(ctx, { step: 'load-source', status: 'running' });

  try {
    for (const step of STEPS) {
      const stepName = step.name || 'unknown';
      addLog(ctx, 'pipeline', `→ ${stepName}`);

      await updateProgress(ctx, { step: stepName });

      await step(ctx);

      // After each step, update progress
      await updateProgress(ctx, {
        step: stepName,
        progressPct: overallProgress(ctx),
      });
    }

    ctx.stats.durationMs = Date.now() - startMs;
    addLog(ctx, 'pipeline', `Pipeline completed in ${ctx.stats.durationMs}ms`);
    await completeProgress(ctx, buildResult(ctx, true));
    return buildResult(ctx, true);

  } catch (err) {
    ctx.stats.durationMs = Date.now() - startMs;
    addLog(ctx, 'pipeline', `Pipeline FAILED: ${err.message}`, 'error');
    await failProgress(ctx, err);

    // Best-effort status update via adapter
    try {
      if (typeof adapter.markFailed === 'function') {
        await adapter.markFailed(ctx, err);
      }
    } catch { /* ignore */ }

    return buildResult(ctx, false, err);
  }
}

function buildResult(ctx, success, error = null) {
  return {
    success,
    error: error ? error.message : null,
    mode: ctx.mode,
    sourceId: ctx.sourceId,
    resultId: ctx.resultId,
    stats: { ...ctx.stats },
    steps: ctx.steps.map(s => ({
      name: s.name, status: s.status, duration: s.duration, error: s.error,
    })),
    postProcessResults: ctx.postProcessResults,
    log: ctx.log,
  };
}

module.exports = { runPipeline };

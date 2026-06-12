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
const { metricsCollectorService } = require('./metrics-collector.service');

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
  const collector = metricsCollectorService.start(ctx);

  addLog(ctx, 'pipeline', `Starting pipeline mode=${mode} source=${sourceId} job=${ctx.extractionJobId}`);
  await updateProgress(ctx, { step: 'load-source', status: 'running' });

  try {
    for (const step of STEPS) {
      const stepName = step.name || 'unknown';
      addLog(ctx, 'pipeline', `→ ${stepName}`);

      collector.recordPhaseStart(stepName);
      await updateProgress(ctx, { step: stepName });

      await step(ctx);

      collector.recordPhaseEnd(stepName);

      // Record entity confidence after extraction step
      if (stepName === 'extract-entities' && ctx.entities) {
        ctx.entities.forEach(e => collector.recordEntity(e));
      }

      // After each step, update progress
      await updateProgress(ctx, {
        step: stepName,
        progressPct: overallProgress(ctx),
      });
    }

    ctx.stats.durationMs = Date.now() - startMs;
    addLog(ctx, 'pipeline', `Pipeline completed in ${ctx.stats.durationMs}ms`);

    // Persist metrics (non-fatal)
    await collector.finalize(ctx).catch(e => addLog(ctx, 'pipeline', `Metrics persist failed: ${e.message}`, 'warn'));

    await completeProgress(ctx, buildResult(ctx, true));
    return buildResult(ctx, true);

  } catch (err) {
    ctx.stats.durationMs = Date.now() - startMs;
    addLog(ctx, 'pipeline', `Pipeline FAILED: ${err.message}`, 'error');
    collector.recordError(err.message);

    // Persist metrics even on failure (non-fatal)
    await collector.finalize(ctx).catch(() => {});
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
    extractionJobId: ctx.extractionJobId,
    methodologyId: ctx.methodologyId || null,
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

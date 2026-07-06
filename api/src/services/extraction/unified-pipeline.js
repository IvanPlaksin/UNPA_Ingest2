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
  require('./pipeline-steps/01b-ocr-scan.step'),
  require('./pipeline-steps/02-chunk-text.step'),
  require('./pipeline-steps/03-extract-entities.step'),
  require('./pipeline-steps/04-extract-relations.step'),
  require('./pipeline-steps/05-extract-specialized.step'),
  require('./pipeline-steps/05b-extract-temporal.step'),
  require('./pipeline-steps/06-deduplicate.step'),
  require('./pipeline-steps/07-persist-graph.step'),
  require('./pipeline-steps/08-embed-and-index.step'),
  require('./pipeline-steps/09-post-process.step'),
  require('./pipeline-steps/10-store-result.step'),
  require('./pipeline-steps/11-queue-refs.step'),
  require('./pipeline-steps/12-link-symbol-relations.step'),
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
    const _checkpointed = new Set();

    for (const step of STEPS) {
      const stepName = step.name || 'unknown';
      addLog(ctx, 'pipeline', `→ ${stepName}`);

      collector.recordPhaseStart(stepName);
      await updateProgress(ctx, { step: stepName });

      // Guard: before store-result, verify all required preceding steps completed and checkpointed
      if (stepName === 'storeResultStep') {
        await verifyRequiredStepsCompleted(ctx);
      }

      await step(ctx);

      collector.recordPhaseEnd(stepName);

      // Persist checkpoint for every newly-completed/failed/skipped step
      for (const s of ctx.steps) {
        if (!_checkpointed.has(s.name) && s.status !== 'pending' && s.status !== 'running') {
          _checkpointed.add(s.name);
          await saveStepCheckpoint(ctx, s).catch(e =>
            addLog(ctx, 'pipeline', `Step checkpoint [${s.name}]: ${e.message}`, 'warn')
          );
        }
      }

      // Record entity confidence after extraction step
      if (stepName === 'extractEntitiesStep' && ctx.entities) {
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

    // Save extraction record to Memgraph for history (non-fatal, DOCUMENT mode only)
    if (ctx.mode === 'DOCUMENT') {
      await saveExtractionRecord(ctx, true).catch(e => addLog(ctx, 'pipeline', `ExtractionRecord: ${e.message}`, 'warn'));
    }

    await completeProgress(ctx, buildResult(ctx, true));
    return buildResult(ctx, true);

  } catch (err) {
    ctx.stats.durationMs = Date.now() - startMs;
    addLog(ctx, 'pipeline', `Pipeline FAILED: ${err.message}`, 'error');
    collector.recordError(err.message);

    // Persist metrics even on failure (non-fatal)
    await collector.finalize(ctx).catch(() => {});

    // Save failed extraction record (non-fatal, DOCUMENT mode only)
    if (ctx.mode === 'DOCUMENT') {
      await saveExtractionRecord(ctx, false).catch(() => {});
    }

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

/**
 * Save per-step checkpoint to Redis immediately after step completion.
 * Key: extraction:step:{extractionJobId}:{stepName}
 */
async function saveStepCheckpoint(ctx, stepObj) {
  const redis = require('../redis.service');
  const key = `extraction:step:${ctx.extractionJobId}:${stepObj.name}`;
  await redis.set(key, {
    extractionJobId: ctx.extractionJobId,
    documentId: ctx.sourceId,
    stepName: stepObj.name,
    stepLabel: stepObj.label,
    status: stepObj.status,
    startedAt: stepObj.startedAt,
    completedAt: stepObj.completedAt,
    duration: stepObj.duration,
    result: stepObj.result,
    error: stepObj.error || null,
    savedAt: new Date().toISOString(),
  }, 86400);
}

/**
 * Hard gate before store-result: all required steps (except store-result itself) must be completed.
 * Throws if any required step is not in 'completed' status.
 */
async function verifyRequiredStepsCompleted(ctx) {
  const notCompleted = ctx.steps.filter(s => s.required && s.name !== 'store-result' && s.status !== 'completed');
  if (notCompleted.length > 0) {
    const details = notCompleted.map(s => `${s.name}(${s.status})`).join(', ');
    throw new Error(`Cannot complete extraction: required steps not completed: ${details}`);
  }
}

async function saveExtractionRecord(ctx, success) {
  const memgraph = require('../memgraph.service');
  const now = new Date().toISOString();
  const stepsJson = JSON.stringify(ctx.steps.map(s => ({
    name: s.name, label: s.label, status: s.status,
    startedAt: s.startedAt, completedAt: s.completedAt,
    duration: s.duration, error: s.error || null,
  })));
  await memgraph.runQuery(
    `MERGE (er:ExtractionRecord {id: $id})
     SET er.documentId = $docId,
         er.jobId = $jobId,
         er.methodology = $methodology,
         er.success = $success,
         er.extractedAt = $now,
         er.entitiesExtracted = $entities,
         er.relationsFound = $relations,
         er.vectorsIndexed = $vectors,
         er.durationMs = $durationMs,
         er.textChars = $textChars,
         er.steps = $steps
     WITH er
     MATCH (d:Document {id: $docId})
     MERGE (d)-[:HAS_EXTRACTION_RECORD]->(er)`,
    {
      id: ctx.extractionJobId,
      docId: ctx.sourceId,
      jobId: ctx.jobId || '',
      methodology: ctx.methodologyId || 'standard',
      success,
      now,
      entities: ctx.stats.entitiesExtracted || 0,
      relations: ctx.stats.relationsFound || 0,
      vectors: ctx.stats.vectorsIndexed || 0,
      durationMs: ctx.stats.durationMs || 0,
      textChars: ctx.stats.textChars || 0,
      steps: stepsJson,
    }
  );
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
      name: s.name, label: s.label || null, status: s.status,
      duration: s.duration, error: s.error, result: s.result || null,
    })),
    postProcessResults: ctx.postProcessResults,
    log: ctx.log,
    claudeOutput: ctx._claudeOutput || null,
  };
}

module.exports = { runPipeline };

'use strict';

/**
 * Progress Bridge
 *
 * Writes extraction progress to two transports simultaneously:
 *  1. Redis key  `extraction:progress:{sourceId}`  (for HTTP polling consumers)
 *  2. BullMQ job.updateProgress()                  (for SSE consumers)
 *
 * Both Documents and Workspaces use the same Redis key format.
 */

const PROGRESS_TTL = 7200; // 2 hours

let _redis = null;
function redis() {
  if (!_redis) {
    const IORedis = require('ioredis');
    _redis = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true,
    });
  }
  return _redis;
}

function redisKey(sourceId) {
  return `extraction:progress:${sourceId}`;
}

/**
 * Persist the full context snapshot to Redis and notify BullMQ job.
 */
async function updateProgress(ctx, progressPayload = {}) {
  const { addLog, overallProgress } = require('./pipeline-context');

  const payload = {
    jobId: ctx.jobId,
    mode: ctx.mode,
    sourceId: ctx.sourceId,
    workspaceId: ctx.workspaceId || null,
    status: progressPayload.status || 'running',
    startedAt: ctx.startedAt,
    overallProgress: overallProgress(ctx),
    currentStep: progressPayload.step || null,
    steps: ctx.steps,
    summary: {
      entitiesExtracted:  ctx.stats.entitiesExtracted,
      relationsFound:     ctx.stats.relationsFound,
      vectorsIndexed:     ctx.stats.vectorsIndexed,
      specializedByType:  ctx.stats.specializedByType,
      errors:             ctx.stats.errors,
      ...progressPayload.summary,
    },
    adapterMeta: progressPayload.adapterMeta || {},
    ...progressPayload,
  };

  // 1. Redis (fire-and-forget)
  try {
    await redis().set(redisKey(ctx.sourceId), JSON.stringify(payload), 'EX', PROGRESS_TTL);
  } catch (err) {
    addLog(ctx, 'progress-bridge', `Redis write failed: ${err.message}`, 'warn');
  }

  // 2. BullMQ job (fire-and-forget)
  if (ctx.bullJob) {
    try {
      await ctx.bullJob.updateProgress(payload);
    } catch {
      // BullMQ may not be attached in document mode — ignore
    }
  }
}

/**
 * Mark progress as completed.
 */
async function completeProgress(ctx, result = {}) {
  await updateProgress(ctx, { status: 'completed', result });
}

/**
 * Mark progress as failed.
 */
async function failProgress(ctx, error) {
  const msg = error instanceof Error ? error.message : String(error);
  await updateProgress(ctx, { status: 'failed', error: msg });
}

/**
 * Read progress for a sourceId (used by polling endpoints).
 */
async function getProgress(sourceId) {
  try {
    const raw = await redis().get(redisKey(sourceId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

module.exports = { updateProgress, completeProgress, failProgress, getProgress };

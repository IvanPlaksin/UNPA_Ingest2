/**
 * dialogue.ingest executor
 * Entry point for the dialogue aggregation pipeline.
 * Parses Claude Code JSONL and Claude.ai JSON exports into NormalizedDialogue format.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');
const { dialogueNormalizer } = require('../services/dialogue.normalizer');

const REDIS_PREFIX = 'dialogue:processed:';
// No TTL — processed files stay tracked until explicitly cleared

function getFileHash(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return crypto
      .createHash('sha256')
      .update(`${filePath}:${stat.size}:${stat.mtimeMs}`)
      .digest('hex')
      .slice(0, 16);
  } catch {
    return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  }
}

async function isProcessed(redisService, filePath) {
  if (!redisService) return false;
  const key = `${REDIS_PREFIX}${getFileHash(filePath)}`;
  try {
    const val = await redisService.get(key);
    return val !== null;
  } catch {
    return false;
  }
}

async function markProcessed(redisService, filePath) {
  if (!redisService) return;
  const key = `${REDIS_PREFIX}${getFileHash(filePath)}`;
  try {
    // TTL = 0 means no expiry — use set without TTL
    const client = redisService.getClient ? redisService.getClient() : null;
    if (client) {
      await client.set(key, JSON.stringify({ processedAt: new Date().toISOString(), path: filePath }));
    } else {
      await redisService.set(key, { processedAt: new Date().toISOString(), path: filePath }, 0);
    }
  } catch (err) {
    // Non-fatal — continue without tracking
    console.warn(`[dialogue.ingest] Redis mark failed: ${err.message}`);
  }
}

const dialogueIngestExecutor = createSimpleExecutor({
  type: 'dialogue.ingest',
  displayName: 'Dialogue Ingestion',
  description: 'Parse Claude Code JSONL and Claude.ai JSON exports into normalized NormalizedDialogue format',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        enum: ['claude_code', 'claude_ai', 'directory', 'auto'],
        default: 'auto',
        description: 'Source type — auto detects from path',
      },
      path: {
        type: 'string',
        description: 'Absolute path to JSONL file, directory, or Claude.ai export JSON',
      },
      incremental: {
        type: 'boolean',
        default: true,
        description: 'Skip already-processed files (tracks via Redis)',
      },
      projectFilter: {
        type: 'string',
        description: 'Optional: only process paths containing this substring',
      },
    },
  },

  async execute(params, context) {
    const sourcePath = params.path || context.input?.path;
    if (!sourcePath) {
      return createErrorResult('INGEST_ERROR', 'Parameter "path" is required', false);
    }

    if (!fs.existsSync(sourcePath)) {
      return createErrorResult('INGEST_ERROR', `Path does not exist: ${sourcePath}`, false);
    }

    const incremental = params.incremental !== false;
    const projectFilter = params.projectFilter || null;

    // Lazy-load redis — non-fatal if unavailable
    let redisService = null;
    try {
      redisService = require('../../../../../services/redis.service');
    } catch {
      // Redis unavailable — incremental mode disabled
    }

    const stat = fs.statSync(sourcePath);
    const isDir = stat.isDirectory();
    const isJsonl = !isDir && sourcePath.endsWith('.jsonl');
    const isJson = !isDir && (sourcePath.endsWith('.json') || sourcePath.endsWith('.jsonl') === false);

    // Auto-detect source type
    let sourceType = params.source || 'auto';
    if (sourceType === 'auto') {
      if (isDir) sourceType = 'directory';
      else if (isJsonl) sourceType = 'claude_code';
      else sourceType = 'claude_ai';
    }

    const dialogues = [];
    const skipped = [];
    let filesScanned = 0;

    try {
      if (sourceType === 'directory') {
        // Scan top-level JSONL files (main sessions only)
        const entries = fs.readdirSync(sourcePath).filter(e => e.endsWith('.jsonl'));
        filesScanned = entries.length;

        for (const entry of entries) {
          const fullPath = path.join(sourcePath, entry);
          if (projectFilter && !fullPath.includes(projectFilter)) continue;

          if (incremental && await isProcessed(redisService, fullPath)) {
            skipped.push(entry);
            continue;
          }

          const dialogue = dialogueNormalizer.parseClaudeCodeSession(fullPath);
          if (dialogue) {
            dialogues.push(dialogue);
            await markProcessed(redisService, fullPath);
          }
        }

      } else if (sourceType === 'claude_code') {
        filesScanned = 1;
        if (!incremental || !(await isProcessed(redisService, sourcePath))) {
          const dialogue = dialogueNormalizer.parseClaudeCodeSession(sourcePath);
          if (dialogue) {
            dialogues.push(dialogue);
            await markProcessed(redisService, sourcePath);
          }
        } else {
          skipped.push(sourcePath);
        }

      } else if (sourceType === 'claude_ai') {
        filesScanned = 1;
        if (!incremental || !(await isProcessed(redisService, sourcePath))) {
          const parsed = dialogueNormalizer.parseClaudeAIExport(sourcePath);
          dialogues.push(...parsed);
          await markProcessed(redisService, sourcePath);
        } else {
          skipped.push(sourcePath);
        }
      }

    } catch (err) {
      return createErrorResult('INGEST_ERROR', `Ingestion failed: ${err.message}`, true);
    }

    const totalMessages = dialogues.reduce((s, d) => s + d.messages.length, 0);
    const totalTokens = dialogues.reduce(
      (s, d) => s + d.metadata.totalInputTokens + d.metadata.totalOutputTokens, 0
    );

    const stats = {
      filesScanned,
      sessionsIngested: dialogues.length,
      sessionsSkipped: skipped.length,
      totalMessages,
      totalTokens,
    };

    console.log(`[dialogue.ingest] ${stats.sessionsIngested} sessions, ${stats.totalMessages} messages, ${stats.sessionsSkipped} skipped`);

    return createSuccessResult(
      { dialogues, stats },
      stats,
      stats.sessionsIngested > 0 ? 1.0 : 0.5
    );
  },
});

module.exports = { dialogueIngestExecutor };

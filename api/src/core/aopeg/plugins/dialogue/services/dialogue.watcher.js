/**
 * DialogueWatcher — Chokidar-based file watcher for incremental dialogue processing.
 * Watches ~/.claude/projects/**\/*.jsonl for new/changed Claude Code sessions.
 * Runs full Phase 2 pipeline on each new/changed file.
 */

const chokidar = require('chokidar');
const path = require('path');
const os = require('os');

class DialogueWatcher {
  constructor(options = {}) {
    this.watchPaths = options.watchPaths || [
      path.join(os.homedir(), '.claude', 'projects'),
    ];
    this.debounceMs = options.debounceMs || 5000;

    this.watcher = null;
    this.processing = new Set();
    this.debounceTimers = new Map();
    this._stats = { processed: 0, failed: 0, skipped: 0 };
  }

  start() {
    if (this.watcher) return;

    console.log('[DialogueWatcher] Starting — watching:', this.watchPaths.join(', '));

    // Build a function-based ignore that avoids rejecting the watch root paths themselves
    // (which contain '.claude' — a dotfile directory that the naive regex would block).
    const watchRoots = this.watchPaths.map(p => path.normalize(p));
    const ignored = (fp) => {
      const norm = path.normalize(fp);
      const inWatchTree = watchRoots.some(r => norm === r || norm.startsWith(r + path.sep));
      if (inWatchTree) {
        return /[/\\]node_modules([/\\]|$)/.test(fp) || /[/\\]\.git([/\\]|$)/.test(fp);
      }
      return /(^|[/\\])\../.test(fp) || /node_modules/.test(fp) || /\.git/.test(fp);
    };

    this.watcher = chokidar.watch(this.watchPaths, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 500 },
      depth: 10,
      usePolling: true,
      interval: 500,
    });

    this.watcher
      .on('add', fp => this._onFileEvent(fp, 'add'))
      .on('change', fp => this._onFileEvent(fp, 'change'))
      .on('error', err => console.error('[DialogueWatcher] Watcher error:', err.message));

    return this;
  }

  stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      for (const t of this.debounceTimers.values()) clearTimeout(t);
      this.debounceTimers.clear();
      console.log('[DialogueWatcher] Stopped');
    }
  }

  getStats() {
    return { ...this._stats };
  }

  _onFileEvent(filePath, event) {
    if (!filePath.endsWith('.jsonl')) return;
    if (this.processing.has(filePath)) return;

    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this._processFile(filePath, event);
    }, this.debounceMs));
  }

  async _processFile(filePath, event) {
    if (this.processing.has(filePath)) return;
    this.processing.add(filePath);

    const pipelineStart = Date.now();
    const shortPath = filePath.split(/[\\/]/).slice(-2).join('/');
    console.log(`[DialogueWatcher] ${event}: ${shortPath}`);

    try {
      // Lazy-load executors to avoid circular imports at startup
      const { dialogueNormalizer } = require('../services/dialogue.normalizer');
      const { dialogueSanitizeExecutor } = require('../executors/dialogue.sanitize');
      const { dialogueStoreExecutor } = require('../executors/dialogue.store');
      const { dialogueSegmentExecutor } = require('../executors/dialogue.segment');
      const { dialogueSummarizeExecutor } = require('../executors/dialogue.summarize');
      const { dialogueEmbedExecutor } = require('../executors/dialogue.embed');
      const { dialogueExtractDecisionsExecutor } = require('../executors/dialogue.extract_decisions');
      const { dialogueLinkExecutor } = require('../executors/dialogue.link');

      // Parse the file
      const dialogue = dialogueNormalizer.parseClaudeCodeSession(filePath);
      if (!dialogue || !dialogue.messages.length) {
        console.log(`[DialogueWatcher] Skip — empty or unreadable: ${shortPath}`);
        this._stats.skipped++;
        return;
      }

      // Check if already processed and unchanged via Redis
      let alreadyProcessed = false;
      try {
        const redisService = require('../../../../../services/redis.service');
        const crypto = require('crypto');
        const fs = require('fs');
        const stat = fs.statSync(filePath);
        const hashInput = filePath + ':' + stat.size + ':' + stat.mtime.getTime();
        const key = 'dialogue:processed:' + crypto.createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
        const existing = await redisService.get(key);
        if (existing) {
          console.log(`[DialogueWatcher] Skip — already processed: ${shortPath}`);
          this._stats.skipped++;
          alreadyProcessed = true;
        }
      } catch { /* non-fatal — continue processing */ }

      if (alreadyProcessed) return;

      // Step 1: Sanitize + Store
      const san = await dialogueSanitizeExecutor.execute({ dialogues: [dialogue], logRedactions: false }, {});
      const stored = await dialogueStoreExecutor.execute(
        { dialogues: san.output.dialogues, generateEmbeddings: false }, {}
      );

      if (!stored.success) {
        throw new Error('Store failed: ' + JSON.stringify(stored.errors));
      }

      const sessionId = dialogue.sourceId;
      const wasNew = stored.output.stored?.memgraph?.created > 0;
      const wasUpdated = stored.output.stored?.memgraph?.updated > 0;

      if (!wasNew && !wasUpdated) {
        console.log(`[DialogueWatcher] Skip — no changes: ${shortPath}`);
        this._stats.skipped++;
        return;
      }

      // Step 2: Full Phase 2 pipeline
      await dialogueSegmentExecutor.execute({ sessionId, storeSegments: true }, {});
      await dialogueSummarizeExecutor.execute({ sessionId, level: 'both', useLLM: true, batchSize: 3 }, {});
      await dialogueEmbedExecutor.execute({ sessionId, targets: ['session_summary', 'segment_summaries'] }, {});
      await dialogueExtractDecisionsExecutor.execute({ sessionId, useLLM: true, minConfidence: 0.45 }, {});
      await dialogueLinkExecutor.execute({ sessionId, linkTypes: ['backlog', 'codex', 'catalog', 'chains'] }, {});

      console.log(`[DialogueWatcher] Completed: ${shortPath} (session ${sessionId.slice(0, 8)})`);
      this._stats.processed++;
      try {
        const { getDialogueMetrics } = require('./dialogue.metrics');
        getDialogueMetrics().recordPipelineRun(Date.now() - pipelineStart, sessionId);
      } catch { /* non-fatal */ }
    } catch (err) {
      console.error(`[DialogueWatcher] Error processing ${shortPath}: ${err.message}`);
      this._stats.failed++;
      try {
        const { getDialogueMetrics } = require('./dialogue.metrics');
        getDialogueMetrics().recordPipelineError(shortPath);
      } catch { /* non-fatal */ }
    } finally {
      this.processing.delete(filePath);
    }
  }
}

// Singleton instance
let _instance = null;

function getWatcher(options) {
  if (!_instance) {
    _instance = new DialogueWatcher(options);
  }
  return _instance;
}

module.exports = { DialogueWatcher, getWatcher };

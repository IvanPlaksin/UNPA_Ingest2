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

    // Night-hours schedule: the chokidar watcher only runs during the
    // configured nightly window. Outside it, the watcher stays stopped so no
    // dialogue processing happens during working hours.
    // Window wraps midnight when nightStartHour > nightEndHour (e.g. 22 → 6).
    this.nightOnly = options.nightOnly !== undefined
      ? options.nightOnly
      : process.env.DIALOGUE_WATCHER_NIGHT_ONLY !== 'false';
    this.nightStartHour = options.nightStartHour !== undefined
      ? options.nightStartHour
      : parseInt(process.env.DIALOGUE_WATCHER_NIGHT_START || '22', 10);
    this.nightEndHour = options.nightEndHour !== undefined
      ? options.nightEndHour
      : parseInt(process.env.DIALOGUE_WATCHER_NIGHT_END || '6', 10);
    this.scheduleCheckMs = options.scheduleCheckMs || 60 * 1000;

    this.watcher = null;
    this.scheduleTimer = null;
    this.processing = new Set();
    this.debounceTimers = new Map();
    this._stats = { processed: 0, failed: 0, skipped: 0 };
  }

  /**
   * Returns true when the current local hour falls inside the nightly window.
   * Handles windows that wrap past midnight (start > end).
   */
  _isNightNow(now = new Date()) {
    if (!this.nightOnly) return true;
    const h = now.getHours();
    const start = this.nightStartHour;
    const end = this.nightEndHour;
    if (start === end) return true; // full-day window
    return start < end
      ? (h >= start && h < end)         // same-day window, e.g. 1 → 5
      : (h >= start || h < end);        // wraps midnight, e.g. 22 → 6
  }

  /**
   * Public entry point. When nightOnly is enabled, installs a periodic
   * scheduler that starts/stops the underlying watcher on the night boundary.
   * Otherwise starts the watcher immediately (legacy 24/7 behaviour).
   */
  start() {
    if (!this.nightOnly) {
      return this._startWatcher();
    }

    if (this.scheduleTimer) return this;

    const window = `${String(this.nightStartHour).padStart(2, '0')}:00–${String(this.nightEndHour).padStart(2, '0')}:00`;
    console.log(`[DialogueWatcher] Night-only mode — active window ${window} (local time)`);

    this._applySchedule();
    this.scheduleTimer = setInterval(() => this._applySchedule(), this.scheduleCheckMs);
    // Don't keep the event loop alive solely for the scheduler tick.
    this.scheduleTimer.unref?.();

    return this;
  }

  /** Start or stop the underlying watcher to match the current night window. */
  _applySchedule() {
    if (this._isNightNow()) {
      if (!this.watcher) {
        console.log('[DialogueWatcher] Entering night window — starting watcher');
        this._startWatcher();
      }
    } else if (this.watcher) {
      console.log('[DialogueWatcher] Leaving night window — stopping watcher');
      this._stopWatcher();
    }
  }

  _startWatcher() {
    if (this.watcher) return this;

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

  /** Public stop — tears down the scheduler and the underlying watcher. */
  stop() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    this._stopWatcher();
  }

  _stopWatcher() {
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

      // Auto-continuation: on new session, check for related past sessions
      if (wasNew) {
        this._checkContinuation(sessionId, dialogue).catch(() => {});
      }

      // Step 2: Full Phase 2 pipeline
      await dialogueSegmentExecutor.execute({ sessionId, storeSegments: true }, {});
      await dialogueSummarizeExecutor.execute({ sessionId, level: 'both', useLLM: true, batchSize: 3 }, {});
      const { dialogueExtractEntitiesExecutor } = require('../executors/dialogue.extract_entities');
      await dialogueExtractEntitiesExecutor.execute({ sessionId }, {});
      await dialogueEmbedExecutor.execute({ sessionId, targets: ['session_summary', 'segment_summaries'] }, {});
      await dialogueExtractDecisionsExecutor.execute({ sessionId, useLLM: true, minConfidence: 0.45 }, {});
      await dialogueLinkExecutor.execute({ sessionId, linkTypes: ['backlog', 'codex', 'catalog', 'chains'] }, {});

      console.log(`[DialogueWatcher] Completed: ${shortPath} (session ${sessionId.slice(0, 8)})`);
      this._stats.processed++;
      try {
        const { getDialogueMetrics } = require('./dialogue.metrics');
        getDialogueMetrics().recordPipelineRun(Date.now() - pipelineStart, sessionId);
      } catch { /* non-fatal */ }

      // Trigger UMAP layout refresh every 5 processed sessions (non-blocking)
      this._knowledgeLayoutCounter = (this._knowledgeLayoutCounter || 0) + 1;
      if (this._knowledgeLayoutCounter % 5 === 0) {
        this._triggerKnowledgeLayout().catch(() => {});
      }
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

  async _triggerKnowledgeLayout() {
    try {
      const { dialogueKnowledgeLayoutExecutor } = require('../executors/dialogue.knowledge-layout');
      const result = await dialogueKnowledgeLayoutExecutor.execute({}, {});
      if (result.success) {
        console.log(`[DialogueWatcher] Knowledge layout refreshed: ${result.output?.count} entities`);
      }
    } catch (err) {
      console.warn('[DialogueWatcher] Knowledge layout refresh failed:', err.message);
    }
  }

  async _checkContinuation(newSessionId, dialogue) {
    try {
      // Build a query from the first user message of the new session
      const firstMsg = dialogue.messages?.find(m => m.role === 'user')?.content || '';
      const query = typeof firstMsg === 'string'
        ? firstMsg.slice(0, 200)
        : (firstMsg[0]?.text || '').slice(0, 200);

      if (!query.trim()) return;

      const { DialogueSearchService } = require('./dialogue.search');
      const { DialogueQdrantService } = require('./dialogue.qdrant');
      const { EmbeddingService } = require('../../../../../services/structuring/embeddings/EmbeddingService');
      const mg = require('../../../../../services/memgraph.service');

      const searchSvc = new DialogueSearchService(
        new DialogueQdrantService(),
        mg,
        new EmbeddingService()
      );

      const results = await searchSvc.search({ query, topK: 3, source: 'all' });
      const candidates = (results.results || []).filter(r =>
        r.sessionId !== newSessionId && r.score > 0.72
      );

      if (candidates.length === 0) return;

      const top = candidates[0];
      const hint = {
        newSessionId,
        relatedSessionId: top.sessionId,
        relatedTitle: top.title || top.aiTitle || top.sessionId,
        score: top.score,
        detectedAt: new Date().toISOString(),
      };

      // Store in Redis with 5-minute TTL
      try {
        const redis = require('../../../../../services/redis.service');
        await redis.set('dialogue:continuation:hint', JSON.stringify(hint), 300);
      } catch { /* Redis not available */ }

      // Broadcast via WebSocket if available
      try {
        const ws = require('../../../../../services/websocket').websocketService;
        ws?.broadcastAll({ type: 'dialogue:continuation', ...hint });
      } catch { /* non-fatal */ }

      console.log(`[DialogueWatcher] Continuation hint: "${top.title}" (score ${top.score.toFixed(2)})`);
    } catch (err) {
      console.warn('[DialogueWatcher] Continuation check failed:', err.message);
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

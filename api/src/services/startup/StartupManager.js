/**
 * StartupManager — Centralized background job initialization
 *
 * CC-031: Production Activation
 *
 * Registers and manages background jobs:
 * - OrphanDetector (every 6 hours) — removes orphaned Qdrant vectors
 * - TombstoneExpirer (every 24 hours) — expires non-restorable tombstones
 * - KBHealthCollector (every 15 min) — KB health metrics snapshot
 * - MetacognitionCycle (every 1 hour) — detect → propose → execute
 *
 * Also checks CODEX_STRICT_VALIDATION and provides health status.
 */

'use strict';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const SIX_HOURS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

class StartupManager {
  constructor(logger) {
    this.log = logger || console;
    this.timers = [];
    this.strictValidation = false;
    this._initialized = false;
  }

  /**
   * Initialize all background services.
   * Call after all core services (memgraph, qdrant, redis) are ready.
   */
  async initialize() {
    if (this._initialized) return this;

    this._log('info', 'Initializing background services...');

    await this._initWorkspaceSchema();
    await this._initExtractionQueue();
    this._initOrphanDetector();
    this._initTombstoneExpirer();
    this._initKBHealthCollector();
    this._initMetacognitionCycle();
    this._checkStrictValidation();
    this._logSummary();

    this._initialized = true;
    return this;
  }

  // ─── WorkSpace Schema ─────────────────────────────────────────────

  async _initWorkspaceSchema() {
    try {
      const { SchemaLoaderService } = require('../memgraph/schema-loader.service');
      const memgraphService = require('../memgraph.service');
      const loader = new SchemaLoaderService(memgraphService);
      const result = await loader.loadSchema('workspace-schema');
      if (result.success) {
        this._log('info', `WorkSpace schema loaded (${result.statements} statements)`);
      } else {
        this._log('warn', `WorkSpace schema loaded with ${result.errors.length} errors`);
      }
    } catch (err) {
      this._log('warn', `WorkSpace schema init skipped: ${err.message}`);
    }
  }

  // ─── Extraction Queue ─────────────────────────────────────────────

  async _initExtractionQueue() {
    try {
      const { initExtractionQueue } = require('../workspace/extraction/extraction-queue');
      await initExtractionQueue();
      this._log('info', 'Extraction queue initialized');
    } catch (err) {
      this._log('warn', `Extraction queue init skipped: ${err.message}`);
    }
  }

  // ─── OrphanDetector ────────────────────────────────────────────────

  _initOrphanDetector() {
    try {
      const { createOrphanDetector } = require('../../jobs/orphan-detector.job');
      const detector = createOrphanDetector(this.log);

      const intervalMs = parseInt(process.env.ORPHAN_DETECTOR_INTERVAL_MS, 10) || SIX_HOURS;
      const handle = detector.schedule(intervalMs);

      this.timers.push({ name: 'OrphanDetector', interval: intervalMs, handle });
      this._log('info', `OrphanDetector scheduled (every ${intervalMs / 3600000}h)`);
    } catch (err) {
      this._log('warn', `OrphanDetector init skipped: ${err.message}`);
    }
  }

  // ─── TombstoneExpirer ──────────────────────────────────────────────

  _initTombstoneExpirer() {
    try {
      const { getVersionManager } = require('../version-manager');
      const vm = getVersionManager();

      const intervalMs = parseInt(process.env.TOMBSTONE_EXPIRER_INTERVAL_MS, 10) || TWENTY_FOUR_HOURS;

      const job = async () => {
        try {
          const count = await vm.expireTombstones();
          if (count > 0) {
            this._log('info', `TombstoneExpirer: expired ${count} tombstones`);
          }
        } catch (err) {
          this._log('error', `TombstoneExpirer failed: ${err.message}`);
        }
      };

      const handle = setInterval(job, intervalMs);
      this.timers.push({ name: 'TombstoneExpirer', interval: intervalMs, handle });
      this._log('info', `TombstoneExpirer scheduled (every ${intervalMs / 3600000}h)`);
    } catch (err) {
      this._log('warn', `TombstoneExpirer init skipped: ${err.message}`);
    }
  }

  // ─── KBHealthCollector ───────────────────────────────────────────────

  _initKBHealthCollector() {
    try {
      const { createKBHealthCollector } = require('../../jobs/kb-health-collector.job');
      const collector = createKBHealthCollector(this.log);

      const intervalMs = parseInt(process.env.KB_HEALTH_INTERVAL_MS, 10) || FIFTEEN_MINUTES;
      const handle = collector.schedule(intervalMs);

      this.timers.push({ name: 'KBHealthCollector', interval: intervalMs, handle });
      this._log('info', `KBHealthCollector scheduled (every ${intervalMs / 60000}min)`);
    } catch (err) {
      this._log('warn', `KBHealthCollector init skipped: ${err.message}`);
    }
  }

  // ─── MetacognitionCycle ──────────────────────────────────────────────

  _initMetacognitionCycle() {
    try {
      const { createMetacognitionCycleJob } = require('../../jobs/metacognition-cycle.job');
      const cycle = createMetacognitionCycleJob(this.log);

      const intervalMs = parseInt(process.env.METACOGNITION_INTERVAL_MS, 10) || ONE_HOUR;
      const handle = cycle.schedule(intervalMs);

      this.timers.push({ name: 'MetacognitionCycle', interval: intervalMs, handle });
      this._log('info', `MetacognitionCycle scheduled (every ${intervalMs / 60000}min)`);
    } catch (err) {
      this._log('warn', `MetacognitionCycle init skipped: ${err.message}`);
    }
  }

  // ─── Strict Validation ─────────────────────────────────────────────

  _checkStrictValidation() {
    this.strictValidation = process.env.CODEX_STRICT_VALIDATION === 'true';

    if (this.strictValidation) {
      this._log('info', 'CODEX_STRICT_VALIDATION = ENABLED');
    } else {
      this._log('info', 'CODEX_STRICT_VALIDATION = disabled (warn mode)');
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────

  _logSummary() {
    this._log('info', '═══════════════════════════════════════════════════');
    this._log('info', `Background services: ${this.timers.length} jobs scheduled`);
    for (const t of this.timers) {
      this._log('info', `  • ${t.name}: every ${t.interval / 3600000}h`);
    }
    this._log('info', `Strict validation: ${this.strictValidation ? 'ON' : 'OFF'}`);
    this._log('info', '═══════════════════════════════════════════════════');
  }

  // ─── Health ────────────────────────────────────────────────────────

  getHealthStatus() {
    return {
      initialized: this._initialized,
      strictValidation: this.strictValidation,
      jobs: this.timers.map(t => ({ name: t.name, intervalHours: t.interval / 3600000 }))
    };
  }

  // ─── Shutdown ──────────────────────────────────────────────────────

  async shutdown() {
    this._log('info', 'Shutting down background services...');
    for (const t of this.timers) {
      clearInterval(t.handle);
      this._log('info', `  Stopped: ${t.name}`);
    }
    this.timers = [];
    this._initialized = false;
  }

  // ─── Logger helper ─────────────────────────────────────────────────

  _log(level, msg) {
    const prefix = '[StartupManager]';
    if (this.log[level]) {
      this.log[level](`${prefix} ${msg}`);
    } else if (this.log.log) {
      this.log.log(`${prefix} ${msg}`);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }
}

// Singleton
let _instance = null;

function getStartupManager(logger) {
  if (!_instance) {
    _instance = new StartupManager(logger);
  }
  return _instance;
}

module.exports = { StartupManager, getStartupManager };

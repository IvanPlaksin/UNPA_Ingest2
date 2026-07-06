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
   * Validate required environment variables before startup.
   * Exits with code 1 if any critical variable is missing.
   */
  validateRequiredEnvVars() {
    const missing = [];

    // Always required
    const always = ['MEMGRAPH_URI', 'QDRANT_URL', 'REDIS_HOST'];
    for (const v of always) {
      if (!process.env[v]) missing.push(v);
    }

    // LLM provider-specific
    const provider = process.env.LLM_PROVIDER || 'anthropic';
    if (provider === 'azure') {
      for (const v of ['AZURE_AI_ENDPOINT', 'AZURE_AI_KEY']) {
        if (!process.env[v]) missing.push(v);
      }
    } else {
      if (!process.env.ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
    }

    if (missing.length > 0) {
      this._log('error', `Missing required environment variables: ${missing.join(', ')}. Set them in .env or container environment.`);
      process.exit(1);
    }
  }

  /**
   * Initialize all background services.
   * Call after all core services (memgraph, qdrant, redis) are ready.
   */
  async initialize() {
    if (this._initialized) return this;

    this.validateRequiredEnvVars();
    this._log('info', 'Initializing background services...');

    await this._initAGENamespaceIndexes();
    await this._initWorkspaceSchema();
    await this._initDialogueSchema();
    await this._initSigillumSchema();
    await this._initDialogueCollection();
    await this._initExtractionQueue();
    await this._initDateTypeRegistry();
    this._initOrphanDetector();
    this._initTombstoneExpirer();
    this._initKBHealthCollector();
    this._initMetacognitionCycle();
    this._initDocumentIndexer();
    this._initValidityRefresh();
    this._checkStrictValidation();
    this._logSummary();

    this._initialized = true;
    return this;
  }

  // ─── AGE Namespace Indexes ────────────────────────────────────────

  async _initAGENamespaceIndexes() {
    if (process.env.GRAPH_DB_BACKEND !== 'postgres-age') return;
    try {
      const memgraphService = require('../memgraph.service');
      await memgraphService.ensureNamespaceIndexes();
      this._log('info', 'AGE namespace property indexes ensured');
    } catch (err) {
      this._log('warn', `AGE namespace index migration skipped: ${err.message}`);
    }
  }

  // ─── WorkSpace Schema ─────────────────────────────────────────────

  async _initWorkspaceSchema() {
    // CREATE INDEX ON :Label(prop) is Memgraph-specific syntax — always fails on AGE
    // with "syntax error at or near ON", taking ~100ms per statement. Skip entirely on AGE.
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') return;
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

  // ─── Dialogue Schema ──────────────────────────────────────────────

  async _initDialogueSchema() {
    // CREATE INDEX ON :Label(prop) is Memgraph-specific syntax — always fails on AGE. Skip.
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') return;
    try {
      const { SchemaLoaderService } = require('../memgraph/schema-loader.service');
      const memgraphService = require('../memgraph.service');
      const loader = new SchemaLoaderService(memgraphService);
      const result = await loader.loadSchema('dialogue-schema');
      if (result.success) {
        this._log('info', `Dialogue schema loaded (${result.statements} statements)`);
      } else {
        this._log('warn', `Dialogue schema loaded with ${result.errors.length} errors`);
      }
    } catch (err) {
      this._log('warn', `Dialogue schema init skipped: ${err.message}`);
    }
  }

  // ─── Sigillum Schema ──────────────────────────────────────────────

  async _initSigillumSchema() {
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') return;
    try {
      const { SchemaLoaderService } = require('../memgraph/schema-loader.service');
      const memgraphService = require('../memgraph.service');
      const loader = new SchemaLoaderService(memgraphService);
      const result = await loader.loadSchema('sigillum-schema');
      if (result.success) {
        this._log('info', `Sigillum schema loaded (${result.statements} statements)`);
      } else {
        this._log('warn', `Sigillum schema loaded with ${result.errors.length} errors`);
      }
    } catch (err) {
      this._log('warn', `Sigillum schema init skipped: ${err.message}`);
    }
  }

  // ─── Dialogue Qdrant Collection ───────────────────────────────────

  async _initDialogueCollection() {
    try {
      const { dialogueQdrantService } = require('../../core/aopeg/plugins/dialogue/services/dialogue.qdrant');
      await dialogueQdrantService.initCollection();
      this._log('info', 'Dialogue Qdrant collection initialized');
    } catch (err) {
      this._log('warn', `Dialogue collection init skipped: ${err.message}`);
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

  // ─── DateTypeRegistry ──────────────────────────────────────────────

  async _initDateTypeRegistry() {
    try {
      const { dateTypeRegistryService } = require('../knowledge/date-type-registry.service');
      await dateTypeRegistryService.seedBuiltIns();
      this._log('info', 'DateTypeRegistry: built-in date types seeded');
    } catch (err) {
      this._log('warn', `DateTypeRegistry init skipped: ${err.message}`);
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

  // ─── ValidityRefresh ───────────────────────────────────────────────
  // Recomputes Document.inForceStatus for documents with temporal/supersession
  // signals — statuses drift as expiry/mandate dates pass. Not run on startup.

  _initValidityRefresh() {
    if (process.env.VALIDITY_REFRESH_ENABLED === 'false') {
      this._log('info', 'ValidityRefresh disabled (VALIDITY_REFRESH_ENABLED=false)');
      return;
    }
    try {
      const intervalMs = parseInt(process.env.VALIDITY_REFRESH_INTERVAL_MS, 10) || TWENTY_FOUR_HOURS;

      const job = async () => {
        try {
          const { validityService } = require('../document/validity.service');
          const { processed, counts } = await validityService.refreshAll({ limit: 5000 });
          if (processed > 0) {
            this._log('info', `ValidityRefresh: ${processed} documents → ${JSON.stringify(counts)}`);
          }
        } catch (err) {
          this._log('error', `ValidityRefresh failed: ${err.message}`);
        }
      };

      const handle = setInterval(job, intervalMs);
      this.timers.push({ name: 'ValidityRefresh', interval: intervalMs, handle });
      this._log('info', `ValidityRefresh scheduled (every ${intervalMs / 3600000}h)`);
    } catch (err) {
      this._log('warn', `ValidityRefresh init skipped: ${err.message}`);
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

  // ─── Document Indexer (always-on source-document harvester) ─────────

  _initDocumentIndexer() {
    if (process.env.DOCUMENT_INDEXER_ENABLED === 'false') {
      this._log('info', 'Document Indexer disabled (DOCUMENT_INDEXER_ENABLED=false)');
      return;
    }
    try {
      const { getDocumentIndexService } = require('../indexing/document-index.service');
      const indexer = getDocumentIndexService(this.log);

      // Autostart harvesting on boot unless explicitly disabled; otherwise the
      // worker is created and can be started later via POST /document-index/control.
      if (process.env.DOCUMENT_INDEXER_AUTOSTART !== 'false') {
        const handle = indexer.schedule();
        this.timers.push({ name: 'DocumentIndexer', interval: 0, handle });
        this._log('info', 'Document Indexer started (harvesting source metadata)');
      } else {
        this._log('info', 'Document Indexer ready (autostart off — start via API)');
      }
    } catch (err) {
      this._log('warn', `Document Indexer init skipped: ${err.message}`);
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

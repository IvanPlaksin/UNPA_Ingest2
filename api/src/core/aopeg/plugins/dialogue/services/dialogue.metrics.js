/**
 * DialogueMetricsCollector — observability for the DevDialogue Collector subsystem.
 * Reads live stats from Memgraph + Qdrant and integrates with the platform metrics service.
 */

class DialogueMetricsCollector {
  constructor(memgraphService, qdrantService) {
    this.memgraph = memgraphService;
    this.qdrant = qdrantService;
  }

  // ── Snapshot (live DB state) ───────────────────────────────────────────────

  async collectSnapshot() {
    const stats = await this.getDialogueStats();
    const m = _getMetrics();
    if (m) {
      m.increment('dialogue.snapshot.count');
    }
    return stats;
  }

  async getDialogueStats() {
    const [sessionRows, chainRows] = await Promise.all([
      this.memgraph.runQuery(`
        MATCH (s:DialogueSession)
        OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
        OPTIONAL MATCH (seg)<-[:DECIDED_IN]-(d:ArchDecision)
        RETURN count(DISTINCT s) AS sessions,
               count(DISTINCT seg) AS segments,
               count(DISTINCT d) AS decisions
      `, {}).catch(() => [{}]),
      this.memgraph.runQuery(
        'MATCH ()-[r:CONTINUES_FROM]->() RETURN count(r) AS chains', {}
      ).catch(() => [{ chains: 0 }]),
    ]);

    let qdrantPoints = null;
    try {
      const info = await this.qdrant.getCollectionInfo('dialogue_embeddings');
      qdrantPoints = info?.points_count ?? null;
    } catch { /* non-fatal */ }

    const r = sessionRows[0] || {};
    return {
      sessions: Number(r.sessions) || 0,
      segments: Number(r.segments) || 0,
      decisions: Number(r.decisions) || 0,
      chains: Number(chainRows[0]?.chains) || 0,
      qdrantPoints,
    };
  }

  // ── Event recording (called by search/watcher) ─────────────────────────────

  recordSearchLatency(durationMs) {
    const m = _getMetrics();
    if (!m) return;
    m.increment('dialogue.search.queries');
    m.recordValue('dialogue.search.latency_ms', durationMs);
  }

  recordPipelineRun(durationMs, sessionId) {
    const m = _getMetrics();
    if (!m) return;
    m.increment('dialogue.pipeline.processed');
    m.recordValue('dialogue.pipeline.duration_ms', durationMs);
    if (sessionId) m.recordRanked('dialogue.pipeline.sessions', sessionId.slice(0, 8));
  }

  recordPipelineError(sessionId) {
    const m = _getMetrics();
    if (!m) return;
    m.increment('dialogue.pipeline.errors');
  }

  recordPipelineSkip() {
    const m = _getMetrics();
    if (!m) return;
    m.increment('dialogue.pipeline.skipped');
  }

  // ── Aggregated metrics view ────────────────────────────────────────────────

  getInMemoryMetrics() {
    const m = _getMetrics();
    if (!m) return null;
    return {
      search: {
        queries: m.getCounter('dialogue.search.queries'),
        latency: m.getHistogramStats('dialogue.search.latency_ms'),
      },
      pipeline: {
        processed: m.getCounter('dialogue.pipeline.processed'),
        errors: m.getCounter('dialogue.pipeline.errors'),
        skipped: m.getCounter('dialogue.pipeline.skipped'),
        duration: m.getHistogramStats('dialogue.pipeline.duration_ms'),
      },
      searchTimeseries: m.getTimeseries('dialogue.search.queries'),
    };
  }
}

// Lazy-load metrics service to avoid circular deps at startup
let _metricsCache = null;
function _getMetrics() {
  if (_metricsCache) return _metricsCache;
  try {
    _metricsCache = require('../../../../../services/observability/metrics.service');
    return _metricsCache;
  } catch { return null; }
}

// Singleton
let _instance = null;
function getDialogueMetrics() {
  if (!_instance) {
    const memgraph = require('../../../../../services/memgraph.service');
    const { DialogueQdrantService } = require('./dialogue.qdrant');
    _instance = new DialogueMetricsCollector(memgraph, new DialogueQdrantService());
  }
  return _instance;
}

module.exports = { DialogueMetricsCollector, getDialogueMetrics };

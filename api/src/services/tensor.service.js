/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENSOR MONITORING SERVICE
 *
 * Real-time performance monitoring system using "tensor" measurement points.
 * Each tensor captures timing, context, and causal relationships.
 *
 * Features:
 * - Rolling 5-minute window storage
 * - Causal chain tracking (parent-child relationships)
 * - Real-time metrics aggregation
 * - Memory-efficient circular buffer
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const ROLLING_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const CLEANUP_INTERVAL_MS = 30 * 1000;   // Cleanup every 30 seconds
const MAX_TENSORS_IN_MEMORY = 10000;     // Hard limit to prevent memory issues

// Tensor states
const TENSOR_STATE = {
  STARTED: 'started',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Connection states for detailed tracking
const CONNECTION_STATE = {
  ACQUIRING: 'acquiring',
  ACTIVE: 'active',
  EXECUTING: 'executing',
  CLOSING: 'closing',
  CLOSED: 'closed'
};

// ────────────────────────────────────────────────────────────────────────────
// TENSOR CLASS
// ────────────────────────────────────────────────────────────────────────────

class Tensor {
  constructor(id, name, context = {}, parentId = null) {
    this.id = id;
    this.name = name;
    this.context = context;
    this.parentId = parentId;
    this.startTime = Date.now();
    this.endTime = null;
    this.duration = null;
    this.state = TENSOR_STATE.STARTED;
    this.error = null;
    this.metadata = {};
    this.children = [];
  }

  complete(metadata = {}) {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.state = TENSOR_STATE.COMPLETED;
    this.metadata = { ...this.metadata, ...metadata };
    return this;
  }

  fail(error) {
    this.endTime = Date.now();
    this.duration = this.endTime - this.startTime;
    this.state = TENSOR_STATE.FAILED;
    this.error = error instanceof Error ? error.message : String(error);
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      context: this.context,
      parentId: this.parentId,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      state: this.state,
      error: this.error,
      metadata: this.metadata,
      childCount: this.children.length
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// TENSOR STORAGE (Rolling Window)
// ────────────────────────────────────────────────────────────────────────────

class TensorStorage {
  constructor() {
    this.tensors = new Map();        // id -> Tensor
    this.byName = new Map();         // name -> Set<id>
    this.activeTensors = new Map();  // id -> Tensor (only active/started)
    this.cleanupInterval = null;
  }

  add(tensor) {
    // Enforce memory limit
    if (this.tensors.size >= MAX_TENSORS_IN_MEMORY) {
      this._evictOldest();
    }

    this.tensors.set(tensor.id, tensor);

    if (!this.byName.has(tensor.name)) {
      this.byName.set(tensor.name, new Set());
    }
    this.byName.get(tensor.name).add(tensor.id);

    if (tensor.state === TENSOR_STATE.STARTED) {
      this.activeTensors.set(tensor.id, tensor);
    }

    // Link to parent
    if (tensor.parentId && this.tensors.has(tensor.parentId)) {
      this.tensors.get(tensor.parentId).children.push(tensor.id);
    }
  }

  complete(id, metadata = {}) {
    const tensor = this.tensors.get(id);
    if (tensor) {
      tensor.complete(metadata);
      this.activeTensors.delete(id);
    }
    return tensor;
  }

  fail(id, error) {
    const tensor = this.tensors.get(id);
    if (tensor) {
      tensor.fail(error);
      this.activeTensors.delete(id);
    }
    return tensor;
  }

  get(id) {
    return this.tensors.get(id);
  }

  getByName(name) {
    const ids = this.byName.get(name);
    if (!ids) return [];
    return Array.from(ids)
      .map(id => this.tensors.get(id))
      .filter(t => t && (Date.now() - t.startTime) < ROLLING_WINDOW_MS);
  }

  getActive() {
    return Array.from(this.activeTensors.values());
  }

  getRecent(limit = 100) {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    return Array.from(this.tensors.values())
      .filter(t => t.startTime >= cutoff)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  cleanup() {
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    const toRemove = [];

    for (const [id, tensor] of this.tensors) {
      if (tensor.startTime < cutoff && tensor.state !== TENSOR_STATE.STARTED) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      const tensor = this.tensors.get(id);
      if (tensor) {
        const nameSet = this.byName.get(tensor.name);
        if (nameSet) {
          nameSet.delete(id);
          if (nameSet.size === 0) {
            this.byName.delete(tensor.name);
          }
        }
      }
      this.tensors.delete(id);
      this.activeTensors.delete(id);
    }

    return toRemove.length;
  }

  _evictOldest() {
    // Evict 10% of oldest tensors
    const sorted = Array.from(this.tensors.values())
      .filter(t => t.state !== TENSOR_STATE.STARTED)
      .sort((a, b) => a.startTime - b.startTime);

    const toEvict = Math.floor(sorted.length * 0.1) || 1;
    for (let i = 0; i < toEvict && i < sorted.length; i++) {
      const tensor = sorted[i];
      this.tensors.delete(tensor.id);
      const nameSet = this.byName.get(tensor.name);
      if (nameSet) nameSet.delete(tensor.id);
    }
  }

  startCleanup() {
    if (!this.cleanupInterval) {
      this.cleanupInterval = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    }
  }

  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// CONNECTION TRACKER
// Detailed tracking of database connections and their queries
// ────────────────────────────────────────────────────────────────────────────

class ConnectionTracker {
  constructor() {
    this.connections = new Map(); // connectionId -> ConnectionInfo
  }

  /**
   * Track a new connection/session
   * @param {string} connectionId - Unique connection identifier
   * @param {string} service - Service name (memgraph, redis, qdrant)
   * @param {Object} metadata - Additional metadata
   * @returns {ConnectionInfo}
   */
  trackConnection(connectionId, service, metadata = {}) {
    const conn = {
      id: connectionId,
      service,
      state: CONNECTION_STATE.ACQUIRING,
      openedAt: Date.now(),
      queries: [],
      activeQuery: null,
      metadata,
      lastActivity: Date.now()
    };
    this.connections.set(connectionId, conn);
    return conn;
  }

  /**
   * Mark connection as acquired/active
   */
  connectionAcquired(connectionId) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.state = CONNECTION_STATE.ACTIVE;
      conn.acquiredAt = Date.now();
      conn.lastActivity = Date.now();
    }
  }

  /**
   * Start tracking a query on a connection
   */
  startQuery(connectionId, query, params = {}) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      const queryInfo = {
        id: uuidv4(),
        query: query?.substring(0, 500), // Truncate for memory
        params: this._sanitizeParams(params),
        startedAt: Date.now(),
        state: 'executing'
      };
      conn.queries.push(queryInfo);
      conn.activeQuery = queryInfo;
      conn.state = CONNECTION_STATE.EXECUTING;
      conn.lastActivity = Date.now();
      return queryInfo.id;
    }
    return null;
  }

  /**
   * Complete a query
   */
  completeQuery(connectionId, queryId, result = {}) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      const query = conn.queries.find(q => q.id === queryId);
      if (query) {
        query.completedAt = Date.now();
        query.duration = query.completedAt - query.startedAt;
        query.state = 'completed';
        query.rowCount = result.rowCount;
      }
      conn.activeQuery = null;
      conn.state = CONNECTION_STATE.ACTIVE;
      conn.lastActivity = Date.now();
    }
  }

  /**
   * Fail a query
   */
  failQuery(connectionId, queryId, error) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      const query = conn.queries.find(q => q.id === queryId);
      if (query) {
        query.completedAt = Date.now();
        query.duration = query.completedAt - query.startedAt;
        query.state = 'failed';
        query.error = error?.message || String(error);
      }
      conn.activeQuery = null;
      conn.state = CONNECTION_STATE.ACTIVE;
      conn.lastActivity = Date.now();
    }
  }

  /**
   * Close a connection
   */
  closeConnection(connectionId) {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.state = CONNECTION_STATE.CLOSED;
      conn.closedAt = Date.now();
      conn.duration = conn.closedAt - conn.openedAt;
      // Keep closed connections for 30 seconds for visibility
      setTimeout(() => {
        this.connections.delete(connectionId);
      }, 30000);
    }
  }

  /**
   * Get all active connections with details
   */
  getActiveConnections() {
    const active = [];
    for (const [id, conn] of this.connections) {
      if (conn.state !== CONNECTION_STATE.CLOSED) {
        active.push({
          ...conn,
          openDuration: Date.now() - conn.openedAt,
          queryCount: conn.queries.length,
          activeQuery: conn.activeQuery ? {
            query: conn.activeQuery.query,
            duration: Date.now() - conn.activeQuery.startedAt
          } : null
        });
      }
    }
    return active;
  }

  /**
   * Get connection statistics by service
   */
  getStats() {
    const stats = {
      total: 0,
      byService: {},
      byState: {},
      queries: { total: 0, active: 0, completed: 0, failed: 0 }
    };

    for (const [_, conn] of this.connections) {
      stats.total++;
      stats.byService[conn.service] = (stats.byService[conn.service] || 0) + 1;
      stats.byState[conn.state] = (stats.byState[conn.state] || 0) + 1;

      for (const q of conn.queries) {
        stats.queries.total++;
        if (q.state === 'executing') stats.queries.active++;
        else if (q.state === 'completed') stats.queries.completed++;
        else if (q.state === 'failed') stats.queries.failed++;
      }
    }

    return stats;
  }

  /**
   * Sanitize query params for safe storage (remove sensitive data)
   */
  _sanitizeParams(params) {
    if (!params || typeof params !== 'object') return {};
    const sanitized = {};
    for (const [key, value] of Object.entries(params)) {
      // Skip potentially sensitive keys
      if (key.toLowerCase().includes('password') ||
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('token')) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 100) {
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// TENSOR SERVICE
// ────────────────────────────────────────────────────────────────────────────

class TensorService extends EventEmitter {
  constructor() {
    super();
    this.storage = new TensorStorage();
    this.storage.startCleanup();
    this._thresholds = new Map(); // name -> threshold_ms
    this._alerts = [];
    this._enabled = true; // Tensors enabled by default
    this.connectionTracker = new ConnectionTracker();
  }

  /**
   * Enable tensor monitoring
   */
  enable() {
    this._enabled = true;
    this.emit('stateChange', { enabled: true });
    console.log('[TensorService] Monitoring ENABLED');
  }

  /**
   * Disable tensor monitoring (no-op for all tensor operations)
   */
  disable() {
    this._enabled = false;
    this.emit('stateChange', { enabled: false });
    console.log('[TensorService] Monitoring DISABLED');
  }

  /**
   * Check if monitoring is enabled
   */
  isEnabled() {
    return this._enabled;
  }

  /**
   * Toggle monitoring state
   * @returns {boolean} New state
   */
  toggle() {
    if (this._enabled) {
      this.disable();
    } else {
      this.enable();
    }
    return this._enabled;
  }

  /**
   * Start a new tensor measurement
   * @param {string} name - Tensor identifier (e.g., 'db.query.structure')
   * @param {Object} context - Contextual information
   * @param {string} parentId - Parent tensor ID for causal chain
   * @returns {Tensor|null} Tensor object or null if disabled
   */
  start(name, context = {}, parentId = null) {
    if (!this._enabled) return null;

    const id = uuidv4();
    const tensor = new Tensor(id, name, context, parentId);
    this.storage.add(tensor);
    return tensor;
  }

  /**
   * Complete a tensor measurement
   * @param {string} id - Tensor ID (can be null if disabled)
   * @param {Object} metadata - Additional metadata
   * @returns {Tensor|null}
   */
  complete(id, metadata = {}) {
    if (!this._enabled || !id) return null;

    const tensor = this.storage.complete(id, metadata);
    if (tensor) {
      this._checkThreshold(tensor);
    }
    return tensor;
  }

  /**
   * Mark tensor as failed
   * @param {string} id - Tensor ID (can be null if disabled)
   * @param {Error|string} error - Error information
   * @returns {Tensor|null}
   */
  fail(id, error) {
    if (!this._enabled || !id) return null;

    const tensor = this.storage.fail(id, error);
    if (tensor) {
      this._alerts.push({
        tensorId: id,
        name: tensor.name,
        error: tensor.error,
        timestamp: Date.now()
      });
    }
    return tensor;
  }

  /**
   * Set performance threshold for a tensor type
   * @param {string} name - Tensor name
   * @param {number} thresholdMs - Threshold in milliseconds
   */
  setThreshold(name, thresholdMs) {
    this._thresholds.set(name, thresholdMs);
  }

  _checkThreshold(tensor) {
    const threshold = this._thresholds.get(tensor.name);
    if (threshold && tensor.duration > threshold) {
      this._alerts.push({
        tensorId: tensor.id,
        name: tensor.name,
        duration: tensor.duration,
        threshold,
        context: tensor.context,
        timestamp: Date.now(),
        type: 'slow'
      });
    }
  }

  /**
   * Convenience method for wrapping async operations
   * @param {string} name - Tensor name
   * @param {Object} context - Context
   * @param {Function} fn - Async function to execute (receives tensorId)
   * @param {string} parentId - Parent tensor ID
   * @returns {Promise<any>}
   */
  async measure(name, context, fn, parentId = null) {
    const tensor = this.start(name, context, parentId);
    const tensorId = tensor?.id || null;
    try {
      const result = await fn(tensorId);
      this.complete(tensorId, { success: true });
      return result;
    } catch (error) {
      this.fail(tensorId, error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONNECTION TRACKING SHORTCUTS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Track a database connection
   */
  trackConnection(connectionId, service, metadata = {}) {
    if (!this._enabled) return null;
    return this.connectionTracker.trackConnection(connectionId, service, metadata);
  }

  connectionAcquired(connectionId) {
    if (!this._enabled) return;
    this.connectionTracker.connectionAcquired(connectionId);
  }

  startQuery(connectionId, query, params) {
    if (!this._enabled) return null;
    return this.connectionTracker.startQuery(connectionId, query, params);
  }

  completeQuery(connectionId, queryId, result) {
    if (!this._enabled) return;
    this.connectionTracker.completeQuery(connectionId, queryId, result);
  }

  failQuery(connectionId, queryId, error) {
    if (!this._enabled) return;
    this.connectionTracker.failQuery(connectionId, queryId, error);
  }

  closeConnection(connectionId) {
    if (!this._enabled) return;
    this.connectionTracker.closeConnection(connectionId);
  }

  getActiveConnections() {
    return this.connectionTracker.getActiveConnections();
  }

  getConnectionStats() {
    return this.connectionTracker.getStats();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // METRICS & REPORTING
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get aggregated metrics for a tensor type
   * @param {string} name - Tensor name
   * @returns {Object}
   */
  getMetrics(name) {
    const tensors = this.storage.getByName(name);
    if (tensors.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p95: 0, errors: 0 };
    }

    const completed = tensors.filter(t => t.state === TENSOR_STATE.COMPLETED);
    const failed = tensors.filter(t => t.state === TENSOR_STATE.FAILED);
    const durations = completed.map(t => t.duration).sort((a, b) => a - b);

    return {
      count: tensors.length,
      completed: completed.length,
      errors: failed.length,
      active: tensors.filter(t => t.state === TENSOR_STATE.STARTED).length,
      avg: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      min: durations.length ? durations[0] : 0,
      max: durations.length ? durations[durations.length - 1] : 0,
      p95: durations.length ? durations[Math.floor(durations.length * 0.95)] : 0
    };
  }

  /**
   * Get all metrics grouped by tensor name
   * @returns {Object}
   */
  getAllMetrics() {
    const metrics = {};
    for (const name of this.storage.byName.keys()) {
      metrics[name] = this.getMetrics(name);
    }
    return metrics;
  }

  /**
   * Get recent alerts
   * @param {number} limit
   * @returns {Array}
   */
  getAlerts(limit = 50) {
    // Keep only last 5 minutes of alerts
    const cutoff = Date.now() - ROLLING_WINDOW_MS;
    this._alerts = this._alerts.filter(a => a.timestamp >= cutoff);
    return this._alerts.slice(-limit);
  }

  /**
   * Get active tensors
   * @returns {Array}
   */
  getActive() {
    return this.storage.getActive().map(t => t.toJSON());
  }

  /**
   * Get recent tensors
   * @param {number} limit
   * @returns {Array}
   */
  getRecent(limit = 100) {
    return this.storage.getRecent(limit).map(t => t.toJSON());
  }

  /**
   * Build causal graph of tensors for visualization
   * @returns {Object} { nodes, edges }
   */
  getCausalGraph() {
    const recent = this.storage.getRecent(500);
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    // Group by name for aggregation
    const byName = new Map();
    for (const tensor of recent) {
      if (!byName.has(tensor.name)) {
        byName.set(tensor.name, []);
      }
      byName.get(tensor.name).push(tensor);
    }

    // Create aggregated nodes
    for (const [name, tensors] of byName) {
      const metrics = this.getMetrics(name);
      nodes.push({
        id: name,
        name: name,
        type: 'tensor',
        metrics,
        // Status based on errors and slowness
        status: metrics.errors > 0 ? 'error' :
                (metrics.p95 > (this._thresholds.get(name) || 1000)) ? 'slow' : 'ok'
      });
      nodeIds.add(name);
    }

    // Create edges based on parent-child relationships
    const edgeSet = new Set();
    for (const tensor of recent) {
      if (tensor.parentId) {
        const parent = this.storage.get(tensor.parentId);
        if (parent && nodeIds.has(parent.name) && nodeIds.has(tensor.name)) {
          const edgeId = `${parent.name}->${tensor.name}`;
          if (!edgeSet.has(edgeId)) {
            edgeSet.add(edgeId);
            edges.push({
              id: edgeId,
              source: parent.name,
              target: tensor.name,
              type: 'causes'
            });
          }
        }
      }
    }

    return { nodes, edges };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SIGNIFICANCE EVALUATION (Async Signal System integration)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate if an event is significant enough to persist to META namespace.
   * Used by SignalOrchestrator to filter noise before writing to Memgraph.
   *
   * @param {string} eventType - e.g. signal.initiated, signal.vote_received
   * @param {object} eventData - Event-specific data
   * @param {object} [options] - { sensitivityMultiplier: 1.5 }
   * @returns {{ significant: boolean, reason: string, score?: number }}
   */
  evaluateSignificance(eventType, eventData = {}, options = {}) {
    const sensitivity = options.sensitivityMultiplier || 1.5;

    // Always significant events
    const alwaysSignificant = [
      'signal.contradiction', 'signal.timeout',
      'signal.escalated', 'signal.force_resolved',
    ];
    if (alwaysSignificant.includes(eventType)) {
      return { significant: true, reason: 'ALWAYS_SIGNIFICANT' };
    }

    // Get baseline metrics
    const metrics = this.getMetrics(eventType);

    // Cold start: not enough data → be conservative, persist
    if (!metrics || metrics.count < 10) {
      return { significant: true, reason: 'COLD_START', count: metrics?.count || 0 };
    }

    // Event-specific evaluation
    switch (eventType) {
      case 'signal.vote_received':
        return this._evaluateVoteSignificance(eventData, metrics, sensitivity);
      case 'signal.resolved':
        return this._evaluateResolvedSignificance(eventData, metrics, sensitivity);
      default:
        return this._evaluateDurationSignificance(eventData, metrics, sensitivity);
    }
  }

  /** Vote significant if extreme confidence or contradicts majority. */
  _evaluateVoteSignificance(eventData, metrics, sensitivity) {
    const vote = eventData.vote || eventData;
    if (vote?.confidence > 0.95 || vote?.confidence < 0.1) {
      return { significant: true, reason: 'EXTREME_CONFIDENCE', confidence: vote.confidence };
    }
    const votes = eventData.state?.votes || eventData.existingVotes || [];
    if (votes.length > 0) {
      const tally = {};
      for (const v of votes) { tally[v.vote] = (tally[v.vote] || 0) + 1; }
      const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
      if (sorted.length > 0 && vote?.vote !== sorted[0][0] && sorted[0][1] > 1) {
        return { significant: true, reason: 'CONTRADICTS_MAJORITY' };
      }
    }
    return { significant: false, reason: 'ROUTINE_VOTE' };
  }

  /** Resolution significant if escalated or unusual duration. */
  _evaluateResolvedSignificance(eventData, metrics, sensitivity) {
    if (eventData.wasEscalated) {
      return { significant: true, reason: 'WAS_ESCALATED' };
    }
    return this._evaluateDurationSignificance(eventData, metrics, sensitivity);
  }

  /** Duration significant if exceeds p95 × sensitivity. */
  _evaluateDurationSignificance(eventData, metrics, sensitivity) {
    const duration = eventData.durationMs || 0;
    const threshold = (metrics.p95 || metrics.avg * 2) * sensitivity;
    if (duration > 0 && duration > threshold) {
      return { significant: true, reason: 'UNUSUAL_DURATION', durationMs: duration, threshold };
    }
    return { significant: false, reason: 'WITHIN_NORMAL_RANGE' };
  }

  /**
   * Get full status report
   * @returns {Object}
   */
  getStatus() {
    const active = this.storage.getActive();
    const recent = this.storage.getRecent(100);

    return {
      timestamp: Date.now(),
      enabled: this._enabled,
      summary: {
        totalTensors: this.storage.tensors.size,
        activeTensors: active.length,
        uniqueTypes: this.storage.byName.size,
        alertCount: this._alerts.length
      },
      active: active.map(t => t.toJSON()),
      metrics: this.getAllMetrics(),
      alerts: this.getAlerts(20),
      causalGraph: this.getCausalGraph(),
      connections: {
        active: this.getActiveConnections(),
        stats: this.getConnectionStats()
      }
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON & EXPORTS
// ────────────────────────────────────────────────────────────────────────────

let instance = null;

function getTensorService() {
  if (!instance) {
    instance = new TensorService();

    // Set default thresholds
    instance.setThreshold('db.query', 1000);
    instance.setThreshold('db.query.structure', 500);
    instance.setThreshold('api.request', 2000);
    instance.setThreshold('api.response', 100);

    // Signal system thresholds
    instance.setThreshold('signal.initiated', 500);
    instance.setThreshold('signal.vote_received', 100);
    instance.setThreshold('signal.resolved', 1000);

    console.log('[TensorService] Initialized with 5-minute rolling window');
  }
  return instance;
}

module.exports = {
  TensorService,
  Tensor,
  ConnectionTracker,
  getTensorService,
  TENSOR_STATE,
  CONNECTION_STATE
};

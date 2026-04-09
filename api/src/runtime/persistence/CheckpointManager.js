/**
 * CheckpointManager
 *
 * Manages execution state checkpoints for pause/resume and recovery.
 * Provides persistence layer for workflow execution state.
 *
 * Features:
 * - Create checkpoints at any point during execution
 * - Restore execution from checkpoints
 * - Automatic checkpoint versioning
 * - Configurable storage backends
 * - Checkpoint metadata and tagging
 *
 * Part of GXE Runtime Environment P2.
 *
 * @module runtime/persistence/CheckpointManager
 */

const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Checkpoint data structure
 * @typedef {Object} Checkpoint
 * @property {string} id - Unique checkpoint ID
 * @property {string} executionId - Parent execution ID
 * @property {number} version - Checkpoint version number
 * @property {number} createdAt - Timestamp
 * @property {Object} state - Execution state snapshot
 * @property {Object} nodeStates - Map of node ID to node state
 * @property {Object} portData - Map of port data
 * @property {Object} variables - Execution variables
 * @property {Object} metadata - User-defined metadata
 * @property {string[]} tags - Checkpoint tags
 */

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  maxCheckpointsPerExecution: 100,
  autoCheckpointInterval: 0,  // 0 = disabled
  compressData: false,
  storage: 'memory'  // 'memory' | 'redis' | 'custom'
};

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE BACKENDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * In-memory storage backend
 */
class MemoryStorage {
  constructor() {
    this._checkpoints = new Map();
    this._executionIndex = new Map();
  }

  async save(checkpoint) {
    this._checkpoints.set(checkpoint.id, checkpoint);

    // Index by execution
    if (!this._executionIndex.has(checkpoint.executionId)) {
      this._executionIndex.set(checkpoint.executionId, []);
    }
    this._executionIndex.get(checkpoint.executionId).push(checkpoint.id);

    return checkpoint.id;
  }

  async load(checkpointId) {
    return this._checkpoints.get(checkpointId) || null;
  }

  async delete(checkpointId) {
    const checkpoint = this._checkpoints.get(checkpointId);
    if (checkpoint) {
      this._checkpoints.delete(checkpointId);
      const index = this._executionIndex.get(checkpoint.executionId);
      if (index) {
        const i = index.indexOf(checkpointId);
        if (i >= 0) index.splice(i, 1);
      }
      return true;
    }
    return false;
  }

  async listByExecution(executionId) {
    const ids = this._executionIndex.get(executionId) || [];
    return ids.map(id => this._checkpoints.get(id)).filter(Boolean);
  }

  async clear() {
    this._checkpoints.clear();
    this._executionIndex.clear();
  }

  async getStats() {
    return {
      totalCheckpoints: this._checkpoints.size,
      executionCount: this._executionIndex.size
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECKPOINT MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manages execution checkpoints
 */
class CheckpointManager {
  /**
   * @param {Object} config
   * @param {number} [config.maxCheckpointsPerExecution=100]
   * @param {number} [config.autoCheckpointInterval=0]
   * @param {boolean} [config.compressData=false]
   * @param {Object} [config.storage] - Custom storage backend
   */
  constructor(config = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._storage = config.storage instanceof Object && config.storage.save
      ? config.storage
      : new MemoryStorage();
    this._versionCounters = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new checkpoint
   * @param {Object} params
   * @param {string} params.executionId - Execution ID
   * @param {Object} params.state - Execution state (FSM state)
   * @param {Map|Object} params.nodeStates - Node states map
   * @param {Map|Object} params.portData - Port data map
   * @param {Object} [params.variables] - Execution variables
   * @param {Object} [params.metadata] - User metadata
   * @param {string[]} [params.tags] - Tags
   * @returns {Promise<Checkpoint>}
   */
  async createCheckpoint(params) {
    const {
      executionId,
      state,
      nodeStates,
      portData,
      variables = {},
      metadata = {},
      tags = []
    } = params;

    // Get next version
    const version = this._getNextVersion(executionId);

    // Generate checkpoint ID
    const checkpointId = this._generateId(executionId, version);

    // Convert Maps to plain objects
    const nodeStatesObj = nodeStates instanceof Map
      ? Object.fromEntries(nodeStates)
      : { ...nodeStates };

    const portDataObj = portData instanceof Map
      ? Object.fromEntries(portData)
      : { ...portData };

    const checkpoint = {
      id: checkpointId,
      executionId,
      version,
      createdAt: Date.now(),
      state: this._serializeState(state),
      nodeStates: nodeStatesObj,
      portData: portDataObj,
      variables: { ...variables },
      metadata: { ...metadata },
      tags: [...tags]
    };

    // Apply compression if enabled
    if (this._config.compressData) {
      checkpoint.compressed = true;
      checkpoint.portData = this._compress(checkpoint.portData);
    }

    // Enforce max checkpoints limit
    await this._enforceLimit(executionId);

    // Save to storage
    await this._storage.save(checkpoint);

    return checkpoint;
  }

  /**
   * Load a checkpoint by ID
   * @param {string} checkpointId
   * @returns {Promise<Checkpoint|null>}
   */
  async loadCheckpoint(checkpointId) {
    const checkpoint = await this._storage.load(checkpointId);
    if (!checkpoint) return null;

    // Decompress if needed
    if (checkpoint.compressed) {
      checkpoint.portData = this._decompress(checkpoint.portData);
    }

    return checkpoint;
  }

  /**
   * Load the latest checkpoint for an execution
   * @param {string} executionId
   * @returns {Promise<Checkpoint|null>}
   */
  async loadLatest(executionId) {
    const checkpoints = await this._storage.listByExecution(executionId);
    if (checkpoints.length === 0) return null;

    // Sort by version descending
    checkpoints.sort((a, b) => b.version - a.version);

    const latest = checkpoints[0];

    // Decompress if needed
    if (latest.compressed) {
      latest.portData = this._decompress(latest.portData);
    }

    return latest;
  }

  /**
   * Load checkpoint by tag
   * @param {string} executionId
   * @param {string} tag
   * @returns {Promise<Checkpoint|null>}
   */
  async loadByTag(executionId, tag) {
    const checkpoints = await this._storage.listByExecution(executionId);
    const checkpoint = checkpoints.find(cp => cp.tags.includes(tag));

    if (!checkpoint) return null;

    if (checkpoint.compressed) {
      checkpoint.portData = this._decompress(checkpoint.portData);
    }

    return checkpoint;
  }

  /**
   * Delete a checkpoint
   * @param {string} checkpointId
   * @returns {Promise<boolean>}
   */
  async deleteCheckpoint(checkpointId) {
    return await this._storage.delete(checkpointId);
  }

  /**
   * Delete all checkpoints for an execution
   * @param {string} executionId
   * @returns {Promise<number>} Number of deleted checkpoints
   */
  async deleteAllForExecution(executionId) {
    const checkpoints = await this._storage.listByExecution(executionId);
    let deleted = 0;

    for (const cp of checkpoints) {
      if (await this._storage.delete(cp.id)) {
        deleted++;
      }
    }

    this._versionCounters.delete(executionId);
    return deleted;
  }

  /**
   * List all checkpoints for an execution
   * @param {string} executionId
   * @returns {Promise<Array<{id: string, version: number, createdAt: number, tags: string[]}>>}
   */
  async listCheckpoints(executionId) {
    const checkpoints = await this._storage.listByExecution(executionId);

    return checkpoints.map(cp => ({
      id: cp.id,
      version: cp.version,
      createdAt: cp.createdAt,
      tags: cp.tags,
      metadata: cp.metadata
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAGGING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add tag to checkpoint
   * @param {string} checkpointId
   * @param {string} tag
   * @returns {Promise<boolean>}
   */
  async addTag(checkpointId, tag) {
    const checkpoint = await this._storage.load(checkpointId);
    if (!checkpoint) return false;

    if (!checkpoint.tags.includes(tag)) {
      checkpoint.tags.push(tag);
      await this._storage.save(checkpoint);
    }
    return true;
  }

  /**
   * Remove tag from checkpoint
   * @param {string} checkpointId
   * @param {string} tag
   * @returns {Promise<boolean>}
   */
  async removeTag(checkpointId, tag) {
    const checkpoint = await this._storage.load(checkpointId);
    if (!checkpoint) return false;

    const index = checkpoint.tags.indexOf(tag);
    if (index >= 0) {
      checkpoint.tags.splice(index, 1);
      await this._storage.save(checkpoint);
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DIFF AND COMPARISON
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compare two checkpoints and return differences
   * @param {string} checkpointId1
   * @param {string} checkpointId2
   * @returns {Promise<Object>}
   */
  async compareCheckpoints(checkpointId1, checkpointId2) {
    const cp1 = await this.loadCheckpoint(checkpointId1);
    const cp2 = await this.loadCheckpoint(checkpointId2);

    if (!cp1 || !cp2) {
      return { error: 'One or both checkpoints not found' };
    }

    const diff = {
      versionDelta: cp2.version - cp1.version,
      timeDelta: cp2.createdAt - cp1.createdAt,
      stateChanged: JSON.stringify(cp1.state) !== JSON.stringify(cp2.state),
      nodeStateChanges: this._diffObjects(cp1.nodeStates, cp2.nodeStates),
      variableChanges: this._diffObjects(cp1.variables, cp2.variables)
    };

    return diff;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get storage statistics
   * @returns {Promise<Object>}
   */
  async getStats() {
    return await this._storage.getStats();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _generateId(executionId, version) {
    const hash = crypto.createHash('sha256')
      .update(`${executionId}:${version}:${Date.now()}`)
      .digest('hex')
      .substring(0, 16);
    return `cp_${hash}`;
  }

  _getNextVersion(executionId) {
    const current = this._versionCounters.get(executionId) || 0;
    const next = current + 1;
    this._versionCounters.set(executionId, next);
    return next;
  }

  _serializeState(state) {
    // If state is a string (enum), return as-is
    if (typeof state === 'string') {
      return { current: state };
    }
    // If state has a current property, use it
    if (state && state.current) {
      return { current: state.current, data: state.data || {} };
    }
    // Otherwise, try to serialize the whole thing
    return { current: String(state), raw: state };
  }

  async _enforceLimit(executionId) {
    const checkpoints = await this._storage.listByExecution(executionId);

    if (checkpoints.length >= this._config.maxCheckpointsPerExecution) {
      // Sort by version ascending (oldest first)
      checkpoints.sort((a, b) => a.version - b.version);

      // Delete oldest
      const toDelete = checkpoints.slice(0, checkpoints.length - this._config.maxCheckpointsPerExecution + 1);
      for (const cp of toDelete) {
        await this._storage.delete(cp.id);
      }
    }
  }

  _compress(data) {
    // Simple JSON compression - in production, use zlib or similar
    return JSON.stringify(data);
  }

  _decompress(data) {
    // Simple JSON decompression
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    return data;
  }

  _diffObjects(obj1, obj2) {
    const changes = {
      added: [],
      removed: [],
      modified: []
    };

    const keys1 = new Set(Object.keys(obj1 || {}));
    const keys2 = new Set(Object.keys(obj2 || {}));

    for (const key of keys2) {
      if (!keys1.has(key)) {
        changes.added.push(key);
      } else if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
        changes.modified.push(key);
      }
    }

    for (const key of keys1) {
      if (!keys2.has(key)) {
        changes.removed.push(key);
      }
    }

    return changes;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  get config() {
    return { ...this._config };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  CheckpointManager,
  MemoryStorage,
  DEFAULT_CONFIG
};

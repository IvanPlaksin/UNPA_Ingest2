'use strict';

/**
 * PetriClient — HTTP client for the Petri Net soundness validation service.
 *
 * Communicates with gnn-service /petri/* endpoints to validate GXE graphs
 * for WF-net soundness (deadlock detection, dead transitions, proper termination).
 *
 * Usage:
 *   const { PetriClient } = require('./petri-client');
 *   const client = new PetriClient();
 *   const result = await client.validateGraph(nodes, edges, graphId);
 */

const logger = {
  debug: (...args) => console.debug('[PetriClient]', ...args),
  info:  (...args) => console.log('[PetriClient]', ...args),
  warn:  (...args) => console.warn('[PetriClient]', ...args),
  error: (...args) => console.error('[PetriClient]', ...args)
};

class PetriClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl] - gnn-service base URL (default: GNN_SERVICE_URL or localhost:5001)
   * @param {number} [options.timeoutMs] - Request timeout in ms (default: 10000)
   */
  constructor(options = {}) {
    this.baseUrl = options.baseUrl
      || process.env.GNN_SERVICE_URL
      || 'http://localhost:5001';
    this.timeoutMs = options.timeoutMs || 10000;
  }

  /**
   * Check that the Petri service is available and pm4py is installed.
   * @returns {Promise<{status: string, pm4py_version: string}>}
   */
  async health() {
    const url = `${this.baseUrl}/petri/health`;
    const res = await this._fetch(url, { method: 'GET' });
    return res;
  }

  /**
   * Validate a ReactFlow graph for WF-net soundness.
   *
   * @param {Array} nodes - ReactFlow nodes [{id, type, data}]
   * @param {Array} edges - ReactFlow edges [{id, source, target, label}]
   * @param {string} [graphId] - Optional identifier for logging
   * @returns {Promise<SoundnessResult>}
   *
   * SoundnessResult = {
   *   sound: boolean,
   *   checks: [{name, passed, ...}],
   *   errors: string[],
   *   warnings: string[],
   *   metrics: {places, transitions, arcs}
   * }
   */
  async validateGraph(nodes, edges, graphId = null) {
    const url = `${this.baseUrl}/petri/validate`;
    const body = { nodes, edges };
    if (graphId) body.graph_id = graphId;

    logger.debug(`Validating graph${graphId ? ` [${graphId}]` : ''}: ${nodes.length} nodes, ${edges.length} edges`);

    const result = await this._fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!result.sound) {
      logger.warn(`Graph${graphId ? ` [${graphId}]` : ''} soundness FAILED:`, result.errors);
    } else {
      logger.debug(`Graph${graphId ? ` [${graphId}]` : ''} soundness OK`);
    }

    return result;
  }

  /**
   * Validate a ProcessRepresentation IR (process tree) for soundness via pm4py
   * ProcessTree conversion. Preferred over validateGraph when a sound-by-construction
   * process tree is available (it validates the formal model, not a reconstructed DAG).
   *
   * @param {Object} ir - Serialized ProcessRepresentation process tree
   * @param {string} [graphId]
   * @returns {Promise<SoundnessResult>}
   */
  async validateIR(ir, graphId = null) {
    const url = `${this.baseUrl}/petri/validate-ir`;
    const body = { ir };
    if (graphId) body.graph_id = graphId;

    logger.debug(`Validating IR${graphId ? ` [${graphId}]` : ''} (process tree, type=${ir?.type || '?'})`);

    const result = await this._fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!result.sound) {
      logger.warn(`IR${graphId ? ` [${graphId}]` : ''} soundness FAILED:`, result.errors);
    }
    return result;
  }

  /**
   * Check if gnn-service is reachable (non-throwing).
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    try {
      await this.health();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Internal HTTP fetch with timeout.
   * @private
   */
  async _fetch(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return res.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`PetriClient timeout after ${this.timeoutMs}ms: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { PetriClient };

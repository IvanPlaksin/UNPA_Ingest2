/**
 * DataFlowManager
 *
 * Manages data propagation between nodes via edges.
 * Handles edge resolution, data transformation, and downstream triggering.
 * Part of GXE Runtime Environment P0.
 *
 * @module runtime/dataflow/DataFlowManager
 */

const { PortState } = require('./PortManager');

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFORM TYPES
// ═══════════════════════════════════════════════════════════════════════════

const TransformType = {
  IDENTITY: 'IDENTITY',  // Pass through unchanged
  PICK: 'PICK',          // Select specific fields
  MAP: 'MAP',            // Apply mapping function
  ADAPT: 'ADAPT'         // Type adaptation (future)
};

// ═══════════════════════════════════════════════════════════════════════════
// DATA FLOW MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manages data flow between nodes through edges
 */
class DataFlowManager {
  /**
   * @param {import('./PortManager').PortManager} portManager
   * @param {Array<{id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string, data?: Object}>} edges
   */
  constructor(portManager, edges) {
    /** @type {import('./PortManager').PortManager} */
    this._portManager = portManager;

    /** @type {Map<string, Edge>} */
    this._edges = new Map();

    /** @type {Map<string, string[]>} */
    this._outgoingEdges = new Map(); // nodeId → [edgeId]

    /** @type {Map<string, string[]>} */
    this._incomingEdges = new Map(); // nodeId → [edgeId]

    this._initializeEdges(edges);
  }

  /**
   * Initialize edges from ReactFlow or AOPEG format
   * @private
   */
  _initializeEdges(edges) {
    for (const edge of edges) {
      // Normalize edge format (support both ReactFlow and AOPEG formats)
      const normalizedEdge = this._normalizeEdge(edge);
      const resolved = this._resolveEdge(normalizedEdge);
      this._edges.set(normalizedEdge.id, resolved);

      // Track outgoing edges
      if (!this._outgoingEdges.has(normalizedEdge.source)) {
        this._outgoingEdges.set(normalizedEdge.source, []);
      }
      this._outgoingEdges.get(normalizedEdge.source).push(normalizedEdge.id);

      // Track incoming edges
      if (!this._incomingEdges.has(normalizedEdge.target)) {
        this._incomingEdges.set(normalizedEdge.target, []);
      }
      this._incomingEdges.get(normalizedEdge.target).push(normalizedEdge.id);
    }
  }

  /**
   * Normalize edge to ReactFlow format
   * Supports: ReactFlow (source/target), AOPEG (sourceNodeId/targetNodeId)
   * @private
   */
  _normalizeEdge(edge) {
    return {
      id: edge.id,
      source: edge.source || edge.sourceNodeId,
      target: edge.target || edge.targetNodeId,
      sourceHandle: edge.sourceHandle || edge.sourcePort,
      targetHandle: edge.targetHandle || edge.targetPort,
      data: edge.data || {}
    };
  }

  /**
   * Resolve edge handles to port IDs
   * @private
   */
  _resolveEdge(edge) {
    // Get source port (output)
    let sourcePortId = edge.sourceHandle;
    if (!sourcePortId) {
      const defaultPort = this._portManager.getDefaultOutputPort(edge.source);
      sourcePortId = defaultPort?.id || '_result';
    }

    // Get target port (input)
    // Use explicit targetHandle if set; otherwise use `_from_{source}` so that
    // multiple incoming edges create separate ports (multi-input fan-in support).
    // PortManager.setPortData auto-creates the dynamic port if it doesn't exist.
    let targetPortId = edge.targetHandle;
    if (!targetPortId) {
      targetPortId = `_from_${edge.source}`;
    }

    // Extract transform from edge data if present
    const transform = edge.data?.transform || { type: TransformType.IDENTITY };

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourcePortId,
      targetPortId,
      transform
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA PROPAGATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Propagate output data from a node to all downstream nodes
   * @param {string} nodeId - Source node ID
   * @param {Record<string, any>} output - Output data (keyed by port ID)
   * @returns {Array<{edgeId: string, fromPort: string, toPort: string, success: boolean, error?: string}>}
   */
  propagateOutput(nodeId, output) {
    const results = [];
    const outgoingEdgeIds = this._outgoingEdges.get(nodeId) || [];

    // First, distribute output to source node's output ports
    this._portManager.distributeOutput(nodeId, output);

    // Then propagate through edges
    for (const edgeId of outgoingEdgeIds) {
      const edge = this._edges.get(edgeId);
      if (!edge) continue;

      try {
        // Get data from source port
        let data = this._portManager.getPortData(nodeId, edge.sourcePortId);

        // If port data is null but we have raw output, try to get from output directly
        if (data === null || data === undefined) {
          data = output?.[edge.sourcePortId] ?? output;
        }

        // Apply transform
        const transformedData = this._applyTransform(edge.transform, data);

        // Write to target port
        const success = this._portManager.setPortData(
          edge.target,
          edge.targetPortId,
          transformedData
        );

        results.push({
          edgeId: edge.id,
          fromPort: `${edge.source}.${edge.sourcePortId}`,
          toPort: `${edge.target}.${edge.targetPortId}`,
          success
        });
      } catch (error) {
        results.push({
          edgeId: edge.id,
          fromPort: `${edge.source}.${edge.sourcePortId}`,
          toPort: `${edge.target}.${edge.targetPortId}`,
          success: false,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Apply transformation to data
   * @param {Object} transform
   * @param {any} data
   * @returns {any}
   */
  _applyTransform(transform, data) {
    switch (transform.type) {
      case TransformType.IDENTITY:
        return data;

      case TransformType.PICK:
        if (!data || typeof data !== 'object') {
          return data;
        }
        const picked = {};
        for (const field of transform.fields || []) {
          if (field in data) {
            picked[field] = data[field];
          }
        }
        return picked;

      case TransformType.MAP:
        // MAP transform requires a function - for safety, only allow predefined mappings
        if (transform.mapping && typeof transform.mapping === 'function') {
          return transform.mapping(data);
        }
        return data;

      default:
        throw new Error(`Unsupported transform type: ${transform.type}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNSTREAM TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get nodes that are now ready to execute after propagation
   * @param {string} nodeId - Node that just completed
   * @returns {string[]} - Node IDs that now have all inputs ready
   */
  getReadyDownstreamNodes(nodeId) {
    const readyNodes = [];
    const outgoingEdgeIds = this._outgoingEdges.get(nodeId) || [];

    // Get unique target nodes
    const targetNodes = new Set();
    for (const edgeId of outgoingEdgeIds) {
      const edge = this._edges.get(edgeId);
      if (edge) {
        targetNodes.add(edge.target);
      }
    }

    // Check which targets now have all inputs ready
    for (const targetId of targetNodes) {
      if (this._portManager.isNodeInputReady(targetId)) {
        readyNodes.push(targetId);
      }
    }

    return readyNodes;
  }

  /**
   * Get all downstream node IDs (direct and transitive)
   * @param {string} nodeId
   * @returns {string[]}
   */
  getAllDownstreamNodes(nodeId) {
    const downstream = new Set();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift();
      const outgoing = this._outgoingEdges.get(current) || [];

      for (const edgeId of outgoing) {
        const edge = this._edges.get(edgeId);
        if (edge && !downstream.has(edge.target)) {
          downstream.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    return Array.from(downstream);
  }

  /**
   * Get all upstream node IDs
   * @param {string} nodeId
   * @returns {string[]}
   */
  getUpstreamNodes(nodeId) {
    const upstream = [];
    const incoming = this._incomingEdges.get(nodeId) || [];

    for (const edgeId of incoming) {
      const edge = this._edges.get(edgeId);
      if (edge) {
        upstream.push(edge.source);
      }
    }

    return upstream;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate edge compatibility
   * @returns {{valid: boolean, warnings: string[]}}
   */
  validateEdgeCompatibility() {
    const warnings = [];

    for (const [edgeId, edge] of this._edges) {
      // Check source port exists
      const sourcePort = this._portManager.getPort(edge.source, edge.sourcePortId);
      if (!sourcePort) {
        warnings.push(`Edge ${edgeId}: Source port ${edge.source}.${edge.sourcePortId} does not exist`);
        continue;
      }

      // Check target port exists
      const targetPort = this._portManager.getPort(edge.target, edge.targetPortId);
      if (!targetPort) {
        warnings.push(`Edge ${edgeId}: Target port ${edge.target}.${edge.targetPortId} does not exist`);
        continue;
      }

      // Check port directions
      if (sourcePort.direction !== 'output') {
        warnings.push(`Edge ${edgeId}: Source port ${edge.source}.${edge.sourcePortId} is not an output port`);
      }
      if (targetPort.direction !== 'input') {
        warnings.push(`Edge ${edgeId}: Target port ${edge.target}.${edge.targetPortId} is not an input port`);
      }

      // Type compatibility check (basic - just check if types are defined)
      // Future: Add JSON Schema compatibility check
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get edge by ID
   * @param {string} edgeId
   * @returns {Object|undefined}
   */
  getEdge(edgeId) {
    return this._edges.get(edgeId);
  }

  /**
   * Get all edges
   * @returns {Object[]}
   */
  getAllEdges() {
    return Array.from(this._edges.values());
  }

  /**
   * Get entry nodes (no incoming edges)
   * @returns {string[]}
   */
  getEntryNodes() {
    const allNodes = this._portManager.getNodeIds();
    return allNodes.filter(nodeId => {
      const incoming = this._incomingEdges.get(nodeId) || [];
      return incoming.length === 0;
    });
  }

  /**
   * Get exit nodes (no outgoing edges)
   * @returns {string[]}
   */
  getExitNodes() {
    const allNodes = this._portManager.getNodeIds();
    return allNodes.filter(nodeId => {
      const outgoing = this._outgoingEdges.get(nodeId) || [];
      return outgoing.length === 0;
    });
  }

  /**
   * Reset data flow state
   */
  reset() {
    this._portManager.reset();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  DataFlowManager,
  TransformType
};

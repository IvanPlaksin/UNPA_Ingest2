/**
 * PortManager
 *
 * Manages input/output ports for nodes in the execution graph.
 * Ports are derived from tool JSON Schemas.
 * Part of GXE Runtime Environment P0.
 *
 * @module runtime/dataflow/PortManager
 */

// ═══════════════════════════════════════════════════════════════════════════
// PORT STATES
// ═══════════════════════════════════════════════════════════════════════════

const PortState = {
  EMPTY: 'EMPTY',      // No data yet
  PENDING: 'PENDING',  // Waiting for upstream
  READY: 'READY',      // Data available
  CONSUMED: 'CONSUMED', // Data has been read
  ERROR: 'ERROR'       // Error state
};

// ═══════════════════════════════════════════════════════════════════════════
// PORT MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manages ports for all nodes in the graph
 */
class PortManager {
  constructor() {
    /**
     * Map of portKey → Port
     * portKey = `${nodeId}.${portId}`
     * @type {Map<string, Port>}
     */
    this._ports = new Map();

    /**
     * Map of nodeId → { inputs: Port[], outputs: Port[] }
     * @type {Map<string, {inputs: Port[], outputs: Port[]}>}
     */
    this._nodePorts = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PORT REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Register ports for a node based on tool definition
   * @param {string} nodeId - Node ID
   * @param {Object} toolDefinition - Tool definition with inputSchema/outputSchema
   */
  registerPorts(nodeId, toolDefinition) {
    const inputs = [];
    const outputs = [];

    // Extract input ports from inputSchema.properties
    if (toolDefinition.inputSchema?.properties && Object.keys(toolDefinition.inputSchema.properties).length > 0) {
      const requiredInputs = new Set(toolDefinition.inputSchema.required || []);

      for (const [portId, schema] of Object.entries(toolDefinition.inputSchema.properties)) {
        const port = this._createPort(nodeId, portId, 'input', schema, requiredInputs.has(portId));
        inputs.push(port);
        this._ports.set(this._portKey(nodeId, portId), port);
      }
    } else {
      // No inputSchema properties - create default _input port
      const defaultPort = this._createPort(nodeId, '_input', 'input', { type: 'any' }, false);
      inputs.push(defaultPort);
      this._ports.set(this._portKey(nodeId, '_input'), defaultPort);
    }

    // Extract output ports from outputSchema.properties
    if (toolDefinition.outputSchema?.properties) {
      for (const [portId, schema] of Object.entries(toolDefinition.outputSchema.properties)) {
        const port = this._createPort(nodeId, portId, 'output', schema, false);
        outputs.push(port);
        this._ports.set(this._portKey(nodeId, portId), port);
      }
    } else {
      // No outputSchema - create default _result port
      const defaultPort = this._createPort(nodeId, '_result', 'output', { type: 'any' }, false);
      outputs.push(defaultPort);
      this._ports.set(this._portKey(nodeId, '_result'), defaultPort);
    }

    this._nodePorts.set(nodeId, { inputs, outputs });

    return { inputs, outputs };
  }

  /**
   * Create a port object
   * @private
   */
  _createPort(nodeId, portId, direction, schema, required) {
    return {
      id: portId,
      nodeId,
      direction,
      schema,
      required,
      state: PortState.EMPTY,
      data: null,
      timestamp: null
    };
  }

  /**
   * Generate port key
   * @private
   */
  _portKey(nodeId, portId) {
    return `${nodeId}.${portId}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PORT ACCESS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all input ports for a node
   * @param {string} nodeId
   * @returns {Port[]}
   */
  getInputPorts(nodeId) {
    return this._nodePorts.get(nodeId)?.inputs || [];
  }

  /**
   * Get all output ports for a node
   * @param {string} nodeId
   * @returns {Port[]}
   */
  getOutputPorts(nodeId) {
    return this._nodePorts.get(nodeId)?.outputs || [];
  }

  /**
   * Get specific port
   * @param {string} nodeId
   * @param {string} portId
   * @returns {Port|undefined}
   */
  getPort(nodeId, portId) {
    return this._ports.get(this._portKey(nodeId, portId));
  }

  /**
   * Get first input port for a node (default port)
   * @param {string} nodeId
   * @returns {Port|undefined}
   */
  getDefaultInputPort(nodeId) {
    const inputs = this.getInputPorts(nodeId);
    return inputs[0];
  }

  /**
   * Get first output port for a node (default port)
   * @param {string} nodeId
   * @returns {Port|undefined}
   */
  getDefaultOutputPort(nodeId) {
    const outputs = this.getOutputPorts(nodeId);
    return outputs[0];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set data on a port
   * @param {string} nodeId
   * @param {string} portId
   * @param {any} data
   * @returns {boolean} - Success
   */
  setPortData(nodeId, portId, data) {
    let port = this.getPort(nodeId, portId);

    if (!port) {
      // Auto-create dynamic input port (supports multi-input fan-in from edges)
      const nodePorts = this._nodePorts.get(nodeId);
      if (!nodePorts) return false;

      port = this._createPort(nodeId, portId, 'input', { type: 'any' }, false);
      nodePorts.inputs.push(port);
      this._ports.set(this._portKey(nodeId, portId), port);
    }

    port.data = data;
    port.state = PortState.READY;
    port.timestamp = Date.now();
    return true;
  }

  /**
   * Get data from a port
   * @param {string} nodeId
   * @param {string} portId
   * @returns {any}
   */
  getPortData(nodeId, portId) {
    const port = this.getPort(nodeId, portId);
    return port?.data;
  }

  /**
   * Mark port data as consumed
   * @param {string} nodeId
   * @param {string} portId
   */
  consumePort(nodeId, portId) {
    const port = this.getPort(nodeId, portId);
    if (port && port.state === PortState.READY) {
      port.state = PortState.CONSUMED;
    }
  }

  /**
   * Check if all required input ports have data
   * @param {string} nodeId
   * @returns {boolean}
   */
  isNodeInputReady(nodeId) {
    const inputs = this.getInputPorts(nodeId);
    for (const port of inputs) {
      if (port.required && port.state !== PortState.READY) {
        return false;
      }
    }
    return true;
  }

  /**
   * Collect all input data for a node
   * @param {string} nodeId
   * @returns {Record<string, any>}
   */
  collectInput(nodeId) {
    const inputs = this.getInputPorts(nodeId);
    const result = {};

    for (const port of inputs) {
      if (port.state === PortState.READY) {
        result[port.id] = port.data;
      }
    }

    return result;
  }

  /**
   * Distribute output data to ports
   * @param {string} nodeId
   * @param {Record<string, any>} output
   */
  distributeOutput(nodeId, output) {
    if (!output || typeof output !== 'object') {
      // If output is not an object, put it in _result
      this.setPortData(nodeId, '_result', output);
      return;
    }

    const outputs = this.getOutputPorts(nodeId);
    for (const port of outputs) {
      if (port.id in output) {
        this.setPortData(nodeId, port.id, output[port.id]);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Reset all ports to EMPTY state
   */
  reset() {
    for (const port of this._ports.values()) {
      port.state = PortState.EMPTY;
      port.data = null;
      port.timestamp = null;
    }
  }

  /**
   * Get all registered node IDs
   * @returns {string[]}
   */
  getNodeIds() {
    return Array.from(this._nodePorts.keys());
  }

  /**
   * Check if node has ports registered
   * @param {string} nodeId
   * @returns {boolean}
   */
  hasNode(nodeId) {
    return this._nodePorts.has(nodeId);
  }

  /**
   * Get port status summary for a node
   * @param {string} nodeId
   * @returns {Object}
   */
  getNodePortStatus(nodeId) {
    const inputs = this.getInputPorts(nodeId);
    const outputs = this.getOutputPorts(nodeId);

    return {
      nodeId,
      inputs: inputs.map(p => ({ id: p.id, state: p.state, required: p.required })),
      outputs: outputs.map(p => ({ id: p.id, state: p.state })),
      inputReady: this.isNodeInputReady(nodeId)
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  PortManager,
  PortState
};

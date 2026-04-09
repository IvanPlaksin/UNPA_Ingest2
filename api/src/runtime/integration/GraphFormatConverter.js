/**
 * GraphFormatConverter
 *
 * Converts between AOPEG graph format and ReactFlow DAG format.
 * Enables RuntimeEngine to execute AOPEG graphs and vice versa.
 *
 * Part of GXE Runtime Environment P1.
 *
 * @module runtime/integration/GraphFormatConverter
 */

const { EXECUTOR_TO_TOOL_MAP, TOOL_TO_EXECUTOR_MAP } = require('./AOPEGAdapter');

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH FORMAT CONVERTER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Converts between AOPEG and ReactFlow graph formats
 */
class GraphFormatConverter {
  /**
   * @param {Object} [adapter] - Optional AOPEGAdapter for toolId mapping
   */
  constructor(adapter = null) {
    this._adapter = adapter;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AOPEG → REACTFLOW
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert AOPEG graph to ReactFlow DAG format for RuntimeEngine
   *
   * @param {Object} aopegGraph - AOPEG graph
   * @param {string} aopegGraph.id - Graph ID
   * @param {Array} aopegGraph.nodes - AOPEG nodes
   * @param {Array} aopegGraph.edges - AOPEG edges
   * @param {string} aopegGraph.entryNodeId - Entry node ID
   * @param {string[]} aopegGraph.exitNodeIds - Exit node IDs
   * @param {Object} [aopegGraph.defaultParameters] - Default parameters
   * @returns {Object} ReactFlow DAG { nodes, edges }
   */
  aopegToReactFlow(aopegGraph) {
    if (!aopegGraph || !aopegGraph.nodes) {
      throw new Error('Invalid AOPEG graph: missing nodes');
    }

    const nodes = aopegGraph.nodes.map((node, index) => this._convertAOPEGNode(node, index));
    const edges = (aopegGraph.edges || []).map((edge, index) => this._convertAOPEGEdge(edge, index));

    return {
      nodes,
      edges,
      // Preserve AOPEG metadata for reference
      _aopeg: {
        graphId: aopegGraph.id,
        entryNodeId: aopegGraph.entryNodeId,
        exitNodeIds: aopegGraph.exitNodeIds,
        defaultParameters: aopegGraph.defaultParameters,
        version: aopegGraph.version
      }
    };
  }

  /**
   * Convert single AOPEG node to ReactFlow node
   * @private
   */
  _convertAOPEGNode(aopegNode, index) {
    const toolId = this._mapExecutorToTool(aopegNode.executorType);

    return {
      id: aopegNode.id,
      type: 'custom',
      position: aopegNode.position || { x: index * 200, y: Math.floor(index / 3) * 150 },
      data: {
        // Core identification
        toolId,
        kind: toolId,  // RuntimeEngine uses 'kind' in some places
        executorType: aopegNode.executorType,  // Preserve original
        label: aopegNode.label || aopegNode.executorType,

        // Parameters
        parameters: aopegNode.parameters || {},

        // AOPEG-specific settings (passed to NodeRunner)
        retryPolicy: aopegNode.retryPolicy,
        timeout: aopegNode.timeout,
        fallbackNodeId: aopegNode.fallbackNodeId,
        qualityThreshold: aopegNode.qualityThreshold,

        // Metadata
        description: aopegNode.description,
        isEntry: aopegNode.isEntry,
        isExit: aopegNode.isExit
      }
    };
  }

  /**
   * Convert single AOPEG edge to ReactFlow edge
   * @private
   */
  _convertAOPEGEdge(aopegEdge, index) {
    // Extract source/target handles from dataMapping
    let sourceHandle = null;
    let targetHandle = null;

    if (aopegEdge.dataMapping && aopegEdge.dataMapping.length > 0) {
      const firstMapping = aopegEdge.dataMapping[0];
      sourceHandle = firstMapping.sourceField || null;
      targetHandle = firstMapping.targetField || null;
    }

    return {
      id: aopegEdge.id || `e-${index}`,
      source: aopegEdge.sourceNodeId,
      target: aopegEdge.targetNodeId,
      sourceHandle,
      targetHandle,
      type: aopegEdge.condition ? 'conditional' : 'default',
      data: {
        // Preserve AOPEG-specific data
        condition: aopegEdge.condition,
        priority: aopegEdge.priority,
        dataMapping: aopegEdge.dataMapping,
        transform: aopegEdge.transform
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REACTFLOW → AOPEG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Convert ReactFlow DAG to AOPEG graph format
   *
   * @param {Object} rfDag - ReactFlow DAG { nodes, edges }
   * @param {string} [entryNodeId] - Entry node ID (auto-detected if not provided)
   * @param {string[]} [exitNodeIds] - Exit node IDs (auto-detected if not provided)
   * @param {Object} [options] - Conversion options
   * @returns {Object} AOPEG graph
   */
  reactFlowToAopeg(rfDag, entryNodeId = null, exitNodeIds = null, options = {}) {
    if (!rfDag || !rfDag.nodes) {
      throw new Error('Invalid ReactFlow DAG: missing nodes');
    }

    // Auto-detect entry/exit nodes if not specified
    const { entry, exits } = this._detectEntryExitNodes(rfDag, entryNodeId, exitNodeIds);

    const nodes = rfDag.nodes.map(node => this._convertReactFlowNode(node, entry, exits));
    const edges = (rfDag.edges || []).map(edge => this._convertReactFlowEdge(edge));

    // Use preserved AOPEG metadata if available
    const aopegMeta = rfDag._aopeg || {};

    return {
      id: aopegMeta.graphId || options.graphId || `graph-${Date.now()}`,
      version: aopegMeta.version || options.version || 1,
      name: options.name || 'Converted Graph',
      description: options.description || '',
      domain: options.domain || this._detectDomain(nodes),
      status: options.status || 'draft',

      nodes,
      edges,

      entryNodeId: entry,
      exitNodeIds: exits,
      defaultParameters: aopegMeta.defaultParameters || options.defaultParameters || {},

      createdAt: options.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  /**
   * Convert single ReactFlow node to AOPEG node
   * @private
   */
  _convertReactFlowNode(rfNode, entryNodeId, exitNodeIds) {
    const data = rfNode.data || {};
    const executorType = data.executorType || this._mapToolToExecutor(data.toolId || data.kind);

    return {
      id: rfNode.id,
      executorType,
      label: data.label || executorType,
      description: data.description,
      parameters: data.parameters || {},
      position: rfNode.position,

      // AOPEG-specific settings
      retryPolicy: data.retryPolicy || {
        maxRetries: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: []
      },
      timeout: data.timeout || 30000,
      fallbackNodeId: data.fallbackNodeId,
      qualityThreshold: data.qualityThreshold,

      // Entry/exit markers
      isEntry: rfNode.id === entryNodeId,
      isExit: exitNodeIds.includes(rfNode.id)
    };
  }

  /**
   * Convert single ReactFlow edge to AOPEG edge
   * @private
   */
  _convertReactFlowEdge(rfEdge) {
    const data = rfEdge.data || {};

    // Build dataMapping from handles or preserved data
    let dataMapping = data.dataMapping;
    if (!dataMapping && (rfEdge.sourceHandle || rfEdge.targetHandle)) {
      dataMapping = [{
        sourceField: rfEdge.sourceHandle || '$',
        targetField: rfEdge.targetHandle || 'input'
      }];
    }

    return {
      id: rfEdge.id,
      sourceNodeId: rfEdge.source,
      targetNodeId: rfEdge.target,
      condition: data.condition || null,
      priority: data.priority ?? 0,
      dataMapping: dataMapping || [],
      transform: data.transform
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Detect entry and exit nodes from graph structure
   * @private
   */
  _detectEntryExitNodes(rfDag, providedEntry, providedExits) {
    const nodes = rfDag.nodes || [];
    const edges = rfDag.edges || [];

    // Build incoming/outgoing edge counts
    const incoming = new Map();
    const outgoing = new Map();

    for (const node of nodes) {
      incoming.set(node.id, 0);
      outgoing.set(node.id, 0);
    }

    for (const edge of edges) {
      incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
      outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1);
    }

    // Entry: node with no incoming edges
    let entry = providedEntry;
    if (!entry) {
      for (const [nodeId, count] of incoming) {
        if (count === 0) {
          entry = nodeId;
          break;
        }
      }
      // Fallback to first node
      if (!entry && nodes.length > 0) {
        entry = nodes[0].id;
      }
    }

    // Exits: nodes with no outgoing edges
    let exits = providedExits;
    if (!exits || exits.length === 0) {
      exits = [];
      for (const [nodeId, count] of outgoing) {
        if (count === 0) {
          exits.push(nodeId);
        }
      }
      // Fallback to last node
      if (exits.length === 0 && nodes.length > 0) {
        exits = [nodes[nodes.length - 1].id];
      }
    }

    return { entry, exits };
  }

  /**
   * Detect domain from nodes
   * @private
   */
  _detectDomain(aopegNodes) {
    const domains = new Map();

    for (const node of aopegNodes) {
      const domain = node.executorType?.split('.')[0] || 'unknown';
      domains.set(domain, (domains.get(domain) || 0) + 1);
    }

    // Return most common domain
    let maxDomain = 'general';
    let maxCount = 0;

    for (const [domain, count] of domains) {
      if (count > maxCount) {
        maxCount = count;
        maxDomain = domain;
      }
    }

    return maxDomain;
  }

  /**
   * Map executor type to tool ID
   * @private
   */
  _mapExecutorToTool(executorType) {
    if (this._adapter) {
      return this._adapter.mapExecutorTypeToToolId(executorType);
    }
    return EXECUTOR_TO_TOOL_MAP[executorType] || executorType;
  }

  /**
   * Map tool ID to executor type
   * @private
   */
  _mapToolToExecutor(toolId) {
    if (this._adapter) {
      return this._adapter.mapToolIdToExecutorType(toolId);
    }
    return TOOL_TO_EXECUTOR_MAP[toolId] || toolId;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate AOPEG graph structure
   * @param {Object} aopegGraph
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateAOPEGGraph(aopegGraph) {
    const errors = [];

    if (!aopegGraph) {
      errors.push('Graph is null or undefined');
      return { valid: false, errors };
    }

    if (!aopegGraph.nodes || !Array.isArray(aopegGraph.nodes)) {
      errors.push('Graph must have nodes array');
    }

    if (!aopegGraph.entryNodeId) {
      errors.push('Graph must have entryNodeId');
    }

    if (!aopegGraph.exitNodeIds || !Array.isArray(aopegGraph.exitNodeIds)) {
      errors.push('Graph must have exitNodeIds array');
    }

    // Validate nodes
    const nodeIds = new Set();
    for (const node of aopegGraph.nodes || []) {
      if (!node.id) {
        errors.push('Node missing id');
      } else {
        if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node id: ${node.id}`);
        }
        nodeIds.add(node.id);
      }

      if (!node.executorType) {
        errors.push(`Node ${node.id} missing executorType`);
      }
    }

    // Validate entry/exit nodes exist
    if (aopegGraph.entryNodeId && !nodeIds.has(aopegGraph.entryNodeId)) {
      errors.push(`Entry node not found: ${aopegGraph.entryNodeId}`);
    }

    for (const exitId of aopegGraph.exitNodeIds || []) {
      if (!nodeIds.has(exitId)) {
        errors.push(`Exit node not found: ${exitId}`);
      }
    }

    // Validate edges
    for (const edge of aopegGraph.edges || []) {
      if (!edge.sourceNodeId) {
        errors.push('Edge missing sourceNodeId');
      } else if (!nodeIds.has(edge.sourceNodeId)) {
        errors.push(`Edge source not found: ${edge.sourceNodeId}`);
      }

      if (!edge.targetNodeId) {
        errors.push('Edge missing targetNodeId');
      } else if (!nodeIds.has(edge.targetNodeId)) {
        errors.push(`Edge target not found: ${edge.targetNodeId}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate ReactFlow DAG structure
   * @param {Object} rfDag
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateReactFlowDAG(rfDag) {
    const errors = [];

    if (!rfDag) {
      errors.push('DAG is null or undefined');
      return { valid: false, errors };
    }

    if (!rfDag.nodes || !Array.isArray(rfDag.nodes)) {
      errors.push('DAG must have nodes array');
    }

    // Validate nodes
    const nodeIds = new Set();
    for (const node of rfDag.nodes || []) {
      if (!node.id) {
        errors.push('Node missing id');
      } else {
        if (nodeIds.has(node.id)) {
          errors.push(`Duplicate node id: ${node.id}`);
        }
        nodeIds.add(node.id);
      }

      if (!node.data?.toolId && !node.data?.kind && !node.data?.executorType) {
        errors.push(`Node ${node.id} missing toolId/kind/executorType`);
      }
    }

    // Validate edges
    for (const edge of rfDag.edges || []) {
      if (!edge.source) {
        errors.push('Edge missing source');
      } else if (!nodeIds.has(edge.source)) {
        errors.push(`Edge source not found: ${edge.source}`);
      }

      if (!edge.target) {
        errors.push('Edge missing target');
      } else if (!nodeIds.has(edge.target)) {
        errors.push(`Edge target not found: ${edge.target}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  GraphFormatConverter
};

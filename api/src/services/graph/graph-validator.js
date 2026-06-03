/**
 * Graph Validator Service
 * Validates generated execution graphs for DAG correctness, connectivity, and tool compatibility
 *
 * Part of the Graph Generation Enhancement pipeline:
 * [Task] → [Tool Filter] → [LLM Generation] → [Graph Validator] → [Output]
 *
 * Petri Net soundness check (async, optional):
 * Calls gnn-service /petri/validate when PETRI_VALIDATION_ENABLED=true.
 * Graceful degradation: unavailable service → skipped (non-blocking).
 */

const { PetriClient } = require('../petri/petri-client');

function _isPetriEnabled() {
  return process.env.PETRI_VALIDATION_ENABLED === 'true';
}

class GraphValidator {
  /**
   * @param {Object} mcpRegistry - MCP tool registry for tool ID validation
   */
  constructor(mcpRegistry = null) {
    this.registry = mcpRegistry;
  }

  /**
   * Normalize edge to use source/target format
   * Supports both ReactFlow (source/target) and AOPEG (sourceNodeId/targetNodeId) formats
   * @private
   */
  _normalizeEdge(edge) {
    return {
      ...edge,
      source: edge.source || edge.sourceNodeId,
      target: edge.target || edge.targetNodeId
    };
  }

  /**
   * Normalize edges array
   * @private
   */
  _normalizeEdges(edges) {
    return (edges || []).map(e => this._normalizeEdge(e));
  }

  /**
   * Validate graph structure and return validation result
   * @param {Object} graphData - { nodes: [], edges: [] }
   * @returns {Object} - { valid: boolean, errors: [], warnings: [], stats: {} }
   */
  validate(graphData) {
    const errors = [];
    const warnings = [];
    const { nodes = [] } = graphData || {};
    // Normalize edges to support both ReactFlow and AOPEG formats
    const edges = this._normalizeEdges(graphData?.edges);

    // Early exit for empty graph
    if (!nodes || nodes.length === 0) {
      errors.push({ code: 'EMPTY_GRAPH', message: 'Graph has no nodes' });
      return { valid: false, errors, warnings, stats: { nodeCount: 0, edgeCount: 0 } };
    }

    // Build node ID set
    const nodeIds = new Set();
    const duplicateIds = [];

    // 1. Node ID uniqueness
    for (const node of nodes) {
      if (!node.id) {
        errors.push({ code: 'MISSING_NODE_ID', message: `Node without ID found`, node: JSON.stringify(node).slice(0, 100) });
        continue;
      }
      if (nodeIds.has(node.id)) {
        duplicateIds.push(node.id);
      }
      nodeIds.add(node.id);
    }
    if (duplicateIds.length > 0) {
      errors.push({ code: 'DUPLICATE_NODE_IDS', message: `Duplicate node IDs: ${duplicateIds.join(', ')}` });
    }

    // 2. Edge integrity - all sources/targets must exist
    const invalidEdgeSources = [];
    const invalidEdgeTargets = [];
    for (const edge of edges) {
      if (!nodeIds.has(edge.source)) {
        invalidEdgeSources.push({ edge: edge.id || `${edge.source}→${edge.target}`, source: edge.source });
      }
      if (!nodeIds.has(edge.target)) {
        invalidEdgeTargets.push({ edge: edge.id || `${edge.source}→${edge.target}`, target: edge.target });
      }
    }
    if (invalidEdgeSources.length > 0) {
      errors.push({
        code: 'INVALID_EDGE_SOURCES',
        message: `Edges reference missing source nodes: ${invalidEdgeSources.map(e => e.source).join(', ')}`,
        edges: invalidEdgeSources
      });
    }
    if (invalidEdgeTargets.length > 0) {
      errors.push({
        code: 'INVALID_EDGE_TARGETS',
        message: `Edges reference missing target nodes: ${invalidEdgeTargets.map(e => e.target).join(', ')}`,
        edges: invalidEdgeTargets
      });
    }

    // 3. DAG check - no cycles (Kahn's algorithm)
    const { isDAG, visitedCount, cycleNodes } = this._checkDAG(nodeIds, edges);
    if (!isDAG) {
      errors.push({
        code: 'GRAPH_HAS_CYCLES',
        message: `Graph contains cycles (${nodeIds.size - visitedCount} nodes in cycle)`,
        cycleNodes
      });
    }

    // 4. Connectivity - single weakly connected component
    const { connectedCount, orphans } = this._checkConnectivity(nodeIds, edges);
    if (orphans.length > 0) {
      warnings.push({
        code: 'DISCONNECTED_NODES',
        message: `${orphans.length} nodes are disconnected: ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? '...' : ''}`,
        nodes: orphans
      });
    }

    // 5. Entry/Exit node validation
    const { entryNodes, exitNodes } = this._findEntryExitNodes(nodeIds, edges);
    if (entryNodes.length === 0) {
      errors.push({ code: 'NO_ENTRY_NODE', message: 'No entry node (all nodes have incoming edges)' });
    }
    if (exitNodes.length === 0) {
      errors.push({ code: 'NO_EXIT_NODE', message: 'No exit node (all nodes have outgoing edges)' });
    }

    // 6. Check for required input/output nodes (GXE convention)
    const hasInputNode = nodes.some(n => n.id === 'input' || n.data?.kind === 'input');
    const hasOutputNode = nodes.some(n => n.id === 'output' || n.data?.kind === 'output');
    if (!hasInputNode) {
      warnings.push({ code: 'NO_INPUT_NODE', message: 'Graph missing standard "input" node (GXE convention)' });
    }
    if (!hasOutputNode) {
      warnings.push({ code: 'NO_OUTPUT_NODE', message: 'Graph missing standard "output" node (GXE convention)' });
    }

    // 7. Tool ID validation (if registry available)
    if (this.registry) {
      const unknownTools = this._validateToolIds(nodes);
      if (unknownTools.length > 0) {
        warnings.push({
          code: 'UNKNOWN_TOOL_IDS',
          message: `${unknownTools.length} nodes reference unknown tool IDs: ${unknownTools.slice(0, 5).join(', ')}`,
          tools: unknownTools
        });
      }
    }

    // 8. Check for self-loops
    const selfLoops = edges.filter(e => e.source === e.target);
    if (selfLoops.length > 0) {
      errors.push({
        code: 'SELF_LOOPS',
        message: `${selfLoops.length} self-loop edges found`,
        edges: selfLoops.map(e => e.source)
      });
    }

    // 9. Check for duplicate edges
    const edgeKeys = new Set();
    const duplicateEdges = [];
    for (const edge of edges) {
      const key = `${edge.source}→${edge.target}`;
      if (edgeKeys.has(key)) {
        duplicateEdges.push(key);
      }
      edgeKeys.add(key);
    }
    if (duplicateEdges.length > 0) {
      warnings.push({
        code: 'DUPLICATE_EDGES',
        message: `${duplicateEdges.length} duplicate edges found`,
        edges: duplicateEdges
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        nodeCount: nodeIds.size,
        edgeCount: edges.length,
        entryNodes,
        exitNodes,
        isDAG,
        isConnected: orphans.length === 0,
        hasStandardIO: hasInputNode && hasOutputNode
      }
    };
  }

  /**
   * Check if graph is a DAG using Kahn's algorithm
   * @private
   */
  _checkDAG(nodeIds, edges) {
    const inDegree = new Map();
    const adjacency = new Map();

    // Initialize
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    // Build adjacency and in-degree
    for (const edge of edges) {
      if (adjacency.has(edge.source)) {
        adjacency.get(edge.source).push(edge.target);
      }
      if (inDegree.has(edge.target)) {
        inDegree.set(edge.target, inDegree.get(edge.target) + 1);
      }
    }

    // Kahn's algorithm
    const queue = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) queue.push(id);
    }

    let visitedCount = 0;
    while (queue.length > 0) {
      const node = queue.shift();
      visitedCount++;

      for (const neighbor of adjacency.get(node) || []) {
        const newDegree = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    // Find cycle nodes (those with remaining in-degree)
    const cycleNodes = [];
    if (visitedCount !== nodeIds.size) {
      for (const [id, degree] of inDegree) {
        if (degree > 0) cycleNodes.push(id);
      }
    }

    return {
      isDAG: visitedCount === nodeIds.size,
      visitedCount,
      cycleNodes
    };
  }

  /**
   * Check graph connectivity (weakly connected)
   * @private
   */
  _checkConnectivity(nodeIds, edges) {
    if (nodeIds.size === 0) return { connectedCount: 0, orphans: [] };
    if (nodeIds.size === 1) return { connectedCount: 1, orphans: [] };

    // Build undirected adjacency
    const undirected = new Map();
    for (const id of nodeIds) {
      undirected.set(id, new Set());
    }
    for (const edge of edges) {
      if (undirected.has(edge.source) && undirected.has(edge.target)) {
        undirected.get(edge.source).add(edge.target);
        undirected.get(edge.target).add(edge.source);
      }
    }

    // BFS from first node
    const reachable = new Set();
    const firstNode = nodeIds.values().next().value;
    const queue = [firstNode];

    while (queue.length > 0) {
      const node = queue.shift();
      if (reachable.has(node)) continue;
      reachable.add(node);

      for (const neighbor of undirected.get(node) || []) {
        if (!reachable.has(neighbor)) queue.push(neighbor);
      }
    }

    const orphans = [...nodeIds].filter(id => !reachable.has(id));
    return { connectedCount: reachable.size, orphans };
  }

  /**
   * Find entry and exit nodes
   * @private
   */
  _findEntryExitNodes(nodeIds, edges) {
    const inDegree = new Map();
    const outDegree = new Map();

    for (const id of nodeIds) {
      inDegree.set(id, 0);
      outDegree.set(id, 0);
    }

    for (const edge of edges) {
      if (inDegree.has(edge.target)) {
        inDegree.set(edge.target, inDegree.get(edge.target) + 1);
      }
      if (outDegree.has(edge.source)) {
        outDegree.set(edge.source, outDegree.get(edge.source) + 1);
      }
    }

    const entryNodes = [...nodeIds].filter(id => inDegree.get(id) === 0);
    const exitNodes = [...nodeIds].filter(id => outDegree.get(id) === 0);

    return { entryNodes, exitNodes };
  }

  /**
   * Validate tool IDs against MCP registry
   * @private
   */
  _validateToolIds(nodes) {
    if (!this.registry) return [];

    const knownTools = new Set();
    try {
      const tools = this.registry.listTools ? this.registry.listTools() : [];
      tools.forEach(t => knownTools.add(t.id));
    } catch (e) {
      console.warn('[GraphValidator] Failed to list tools from registry:', e.message);
      return [];
    }

    const unknownTools = [];
    for (const node of nodes) {
      const toolId = node.data?.toolId || node.data?.executorId;
      if (toolId && !knownTools.has(toolId) && node.data?.kind === 'executor') {
        unknownTools.push(toolId);
      }
    }

    return unknownTools;
  }

  /**
   * Validate graph WF-net soundness via Petri Net formalism (async).
   *
   * Requires PETRI_VALIDATION_ENABLED=true and gnn-service running.
   * Graceful degradation: returns skipped=true if disabled or service unavailable.
   *
   * @param {Array} nodes - ReactFlow nodes
   * @param {Array} edges - ReactFlow edges
   * @param {string} [graphId] - Optional identifier for logging
   * @returns {Promise<{valid, skipped, reason?, issues, warnings, metrics}>}
   */
  async validateSoundness(nodes, edges, graphId = null) {
    if (!_isPetriEnabled()) {
      return { valid: true, skipped: true, reason: 'PETRI_VALIDATION_DISABLED', issues: [], warnings: [] };
    }

    const client = new PetriClient();

    if (!await client.isAvailable()) {
      console.warn('[GraphValidator] Petri service unavailable — soundness check skipped');
      return { valid: true, skipped: true, reason: 'PETRI_SERVICE_UNAVAILABLE', issues: [], warnings: [] };
    }

    try {
      const result = await client.validateGraph(nodes, edges, graphId);
      return {
        valid: result.sound,
        skipped: false,
        issues: result.errors || [],
        warnings: result.warnings || [],
        metrics: result.metrics || {}
      };
    } catch (err) {
      console.warn('[GraphValidator] Petri validation error (skipping):', err.message);
      return { valid: true, skipped: true, reason: 'PETRI_SERVICE_ERROR', issues: [], warnings: [] };
    }
  }

  /**
   * Format a soundness validation failure into an actionable error object.
   *
   * @param {Object} soundnessResult - Result from validateSoundness()
   * @param {Array} nodes - Graph nodes (for label lookup)
   * @returns {Object|null} - null if sound, error object if not
   */
  formatSoundnessError(soundnessResult, nodes = []) {
    if (soundnessResult.valid || soundnessResult.skipped) return null;

    const nodeLabels = Object.fromEntries(
      (nodes || []).map(n => [n.id, n.data?.label || n.id])
    );

    const suggestions = {
      dead_transition: 'Connect this node to the rest of the graph or remove it (skip-cascade risk)',
      no_entry: 'Ensure the graph has a single entry node with no incoming edges',
      no_exit: 'Ensure the graph has a single exit node with no outgoing edges',
      woflan: 'Check for unreachable nodes or branches that never reach the terminal node'
    };

    const issues = (soundnessResult.issues || []).map(msg => {
      const type = msg.includes('dead') ? 'dead_transition'
        : msg.includes('entry') ? 'no_entry'
        : msg.includes('exit') ? 'no_exit'
        : 'woflan';
      return {
        type,
        message: msg,
        suggestion: suggestions[type] || 'Review graph structure'
      };
    });

    return {
      code: 'GRAPH_SOUNDNESS_ERROR',
      message: 'Graph failed Petri Net soundness check — potential deadlock or unreachable nodes',
      issues,
      warnings: soundnessResult.warnings || []
    };
  }

  /**
   * Auto-fix common graph issues
   * @param {Object} graphData - { nodes: [], edges: [] }
   * @returns {Object} - Fixed graph data
   */
  autoFix(graphData) {
    const fixed = JSON.parse(JSON.stringify(graphData || { nodes: [], edges: [] }));

    // 1. Normalize edges to support both ReactFlow and AOPEG formats
    fixed.edges = this._normalizeEdges(fixed.edges);

    // 2. Filter out nodes without IDs
    fixed.nodes = fixed.nodes.filter(n => n.id);

    // 3. Deduplicate node IDs (keep first occurrence)
    const seenNodes = new Set();
    fixed.nodes = fixed.nodes.filter(n => {
      if (seenNodes.has(n.id)) return false;
      seenNodes.add(n.id);
      return true;
    });

    const nodeIds = new Set(fixed.nodes.map(n => n.id));

    // 4. Remove edges with missing source/target
    fixed.edges = fixed.edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    // 4. Remove self-loops
    fixed.edges = fixed.edges.filter(e => e.source !== e.target);

    // 5. Remove duplicate edges (keep first)
    const seenEdges = new Set();
    fixed.edges = fixed.edges.filter(e => {
      const key = `${e.source}→${e.target}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

    // 6. Ensure edge IDs
    fixed.edges = fixed.edges.map((e, i) => ({
      ...e,
      id: e.id || `e-${e.source}-${e.target}`
    }));

    // 7. Ensure all nodes have position (default layout)
    let nextY = 0;
    fixed.nodes = fixed.nodes.map((n, i) => {
      if (!n.position) {
        n.position = { x: 400, y: nextY };
        nextY += 130;
      }
      return n;
    });

    return fixed;
  }

  /**
   * Apply topological layout to graph nodes
   * @param {Object} graphData - { nodes: [], edges: [] }
   * @returns {Object} - Graph with updated node positions
   */
  applyTopologicalLayout(graphData) {
    const { nodes, edges } = graphData;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const nodeIds = new Set(nodes.map(n => n.id));

    // Compute levels using BFS from entry nodes
    const inDegree = new Map();
    const adjacency = new Map();

    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    for (const edge of edges) {
      if (adjacency.has(edge.source)) {
        adjacency.get(edge.source).push(edge.target);
      }
      if (inDegree.has(edge.target)) {
        inDegree.set(edge.target, inDegree.get(edge.target) + 1);
      }
    }

    // Find entry nodes (in-degree 0)
    const entryNodes = [...nodeIds].filter(id => inDegree.get(id) === 0);

    // BFS to assign levels
    const levels = new Map();
    const queue = entryNodes.map(id => ({ id, level: 0 }));

    while (queue.length > 0) {
      const { id, level } = queue.shift();

      // Keep maximum level for each node
      if (!levels.has(id) || levels.get(id) < level) {
        levels.set(id, level);
      }

      for (const neighbor of adjacency.get(id) || []) {
        queue.push({ id: neighbor, level: level + 1 });
      }
    }

    // Group nodes by level
    const levelGroups = new Map();
    for (const [id, level] of levels) {
      if (!levelGroups.has(level)) levelGroups.set(level, []);
      levelGroups.get(level).push(id);
    }

    // Assign positions
    const Y_SPACING = 130;
    const X_POSITIONS = [180, 400, 620]; // Left, Center, Right

    for (const [level, nodeIdsInLevel] of levelGroups) {
      const y = level * Y_SPACING;

      nodeIdsInLevel.forEach((nodeId, i) => {
        const node = nodeMap.get(nodeId);
        if (node) {
          // Distribute nodes horizontally
          const xIndex = nodeIdsInLevel.length === 1 ? 1 : // Center if single
                         i < X_POSITIONS.length ? i : i % X_POSITIONS.length;
          node.position = { x: X_POSITIONS[xIndex], y };
        }
      });
    }

    return { nodes, edges };
  }
}

/**
 * Create validator instance with optional MCP registry
 * @param {Object} mcpServer - MCP server instance (optional)
 * @returns {GraphValidator}
 */
function createGraphValidator(mcpServer = null) {
  const registry = mcpServer?.registry || null;
  return new GraphValidator(registry);
}

module.exports = {
  GraphValidator,
  createGraphValidator
};

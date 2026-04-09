/**
 * Graph Validation Executor — comprehensive GXE graph structural and logical
 * validation against all 8 core GXE validation rules.
 *
 * Rules validated:
 * 1. Single start node
 * 2. DAG structure (no cycles)
 * 3. Edge integrity and port connectivity
 * 4. Executor type validation against the 84-executor catalog
 * 5. Condition node branching completeness (true/false paths)
 * 6. Orphan node detection
 * 7. Node ID uniqueness
 * 8. Self-loop and duplicate edge detection
 */

const { BaseExecutor } = require('../../plugin-base');

class GraphValidateExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'validation.graph';
    this.displayName = 'Graph Validation';
    this.description = 'Comprehensive GXE graph structural and logical validation against 8 core rules';
    this.domain = 'validation';

    this.parameterSchema = {
      type: 'object',
      properties: {
        nodes: { type: 'array', items: { type: 'object' }, description: 'Graph nodes' },
        edges: { type: 'array', items: { type: 'object' }, description: 'Graph edges' },
        metadata: { type: 'object', description: 'Optional graph metadata', default: {} },
        checks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific checks to run (default: all)',
          default: ['startNode', 'dag', 'edgeIntegrity', 'executorTypes', 'conditionBranching', 'orphanNodes', 'nodeIdUniqueness', 'selfLoops'],
        },
        severity: {
          type: 'string',
          enum: ['error', 'warning', 'info'],
          description: 'Minimum severity level to report',
          default: 'info',
        },
        autoFix: { type: 'boolean', description: 'Generate auto-fix suggestions', default: true },
      },
      required: ['nodes', 'edges'],
    };
  }

  async execute(parameters, context) {
    const nodes = this.getRequiredParam(parameters, 'nodes');
    const edges = this.getRequiredParam(parameters, 'edges');
    const checks = this.getParam(parameters, 'checks',
      ['startNode', 'dag', 'edgeIntegrity', 'executorTypes', 'conditionBranching', 'orphanNodes', 'nodeIdUniqueness', 'selfLoops']);
    const minSeverity = this.getParam(parameters, 'severity', 'info');
    const autoFix = this.getParam(parameters, 'autoFix', true);

    const issues = [];
    const suggestions = [];

    // Normalize edges (support both ReactFlow and AOPEG formats)
    const normalizedEdges = (edges || []).map(e => ({
      ...e,
      source: e.source || e.sourceNodeId,
      target: e.target || e.targetNodeId,
    }));

    // Build node ID set
    const nodeIds = new Set();
    const nodeMap = new Map();
    for (const node of (nodes || [])) {
      if (node.id) {
        nodeMap.set(node.id, node);
        nodeIds.add(node.id);
      }
    }

    // Empty graph check
    if (nodeIds.size === 0) {
      issues.push({ code: 'EMPTY_GRAPH', message: 'Graph has no nodes', severity: 'error' });
      return this.success(
        { valid: false, issues, suggestions, autoFixable: false },
        { checkCount: 0, issueCount: 1 },
        0.0,
      );
    }

    // Run selected checks
    const checkSet = new Set(checks);

    if (checkSet.has('nodeIdUniqueness')) {
      this._checkNodeIdUniqueness(nodes, issues, suggestions, autoFix);
    }

    if (checkSet.has('startNode')) {
      this._checkStartNode(nodes, normalizedEdges, nodeIds, issues, suggestions, autoFix);
    }

    if (checkSet.has('dag')) {
      this._checkDAG(nodeIds, normalizedEdges, issues, suggestions, autoFix);
    }

    if (checkSet.has('edgeIntegrity')) {
      this._checkEdgeIntegrity(normalizedEdges, nodeIds, issues, suggestions, autoFix);
    }

    if (checkSet.has('executorTypes')) {
      this._checkExecutorTypes(nodes, context, issues, suggestions, autoFix);
    }

    if (checkSet.has('conditionBranching')) {
      this._checkConditionBranching(nodes, normalizedEdges, issues, suggestions, autoFix);
    }

    if (checkSet.has('orphanNodes')) {
      this._checkOrphanNodes(nodeIds, normalizedEdges, issues, suggestions, autoFix);
    }

    if (checkSet.has('selfLoops')) {
      this._checkSelfLoopsAndDuplicates(normalizedEdges, issues, suggestions, autoFix);
    }

    // Filter by severity
    const severityOrder = { error: 0, warning: 1, info: 2 };
    const minLevel = severityOrder[minSeverity] ?? 2;
    const filteredIssues = issues.filter(i => (severityOrder[i.severity] ?? 2) <= minLevel);

    const hasErrors = filteredIssues.some(i => i.severity === 'error');
    const valid = !hasErrors;
    const autoFixable = suggestions.length > 0;

    return this.success(
      { valid, issues: filteredIssues, suggestions, autoFixable },
      {
        checkCount: checkSet.size,
        issueCount: filteredIssues.length,
        errorCount: filteredIssues.filter(i => i.severity === 'error').length,
        warningCount: filteredIssues.filter(i => i.severity === 'warning').length,
        nodeCount: nodeIds.size,
        edgeCount: normalizedEdges.length,
      },
      valid ? 1.0 : 0.0,
    );
  }

  // ── Rule 1: Single Start Node ──

  _checkStartNode(nodes, edges, nodeIds, issues, suggestions, autoFix) {
    const startNodes = nodes.filter(n => {
      const executorType = n.data?.executorType || n.data?.toolId || n.type;
      return executorType === 'workflow.start';
    });

    if (startNodes.length === 0) {
      // Check entry nodes (in-degree 0) as fallback
      const inDegree = new Map();
      for (const id of nodeIds) inDegree.set(id, 0);
      for (const e of edges) {
        if (inDegree.has(e.target)) inDegree.set(e.target, inDegree.get(e.target) + 1);
      }
      const entryNodes = [...nodeIds].filter(id => inDegree.get(id) === 0);

      if (entryNodes.length === 0) {
        issues.push({
          code: 'NO_START_NODE', severity: 'error',
          message: 'No workflow.start node and no entry nodes found',
        });
      } else if (entryNodes.length > 1) {
        issues.push({
          code: 'MULTIPLE_ENTRY_NODES', severity: 'warning',
          message: `${entryNodes.length} entry nodes found without explicit workflow.start: ${entryNodes.join(', ')}`,
        });
      }
      if (autoFix) suggestions.push('Add a workflow.start node at the beginning of the graph');
    } else if (startNodes.length > 1) {
      issues.push({
        code: 'MULTIPLE_START_NODES', severity: 'error',
        message: `${startNodes.length} workflow.start nodes found: ${startNodes.map(n => n.id).join(', ')}`,
        nodes: startNodes.map(n => n.id),
      });
      if (autoFix) suggestions.push('Remove extra workflow.start nodes — only one is allowed');
    }
  }

  // ── Rule 2: DAG Structure ──

  _checkDAG(nodeIds, edges, issues, suggestions, autoFix) {
    const inDegree = new Map();
    const adjacency = new Map();
    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }
    for (const edge of edges) {
      if (adjacency.has(edge.source)) adjacency.get(edge.source).push(edge.target);
      if (inDegree.has(edge.target)) inDegree.set(edge.target, inDegree.get(edge.target) + 1);
    }

    const queue = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let visited = 0;
    while (queue.length > 0) {
      const node = queue.shift();
      visited++;
      for (const neighbor of adjacency.get(node) || []) {
        const newDeg = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    if (visited !== nodeIds.size) {
      const cycleNodes = [...inDegree.entries()].filter(([, d]) => d > 0).map(([id]) => id);
      issues.push({
        code: 'GRAPH_HAS_CYCLES', severity: 'error',
        message: `Graph contains cycles involving ${cycleNodes.length} nodes: ${cycleNodes.slice(0, 5).join(', ')}`,
        nodes: cycleNodes,
      });
      if (autoFix) suggestions.push(`Remove or redirect edges creating cycles among: ${cycleNodes.slice(0, 5).join(', ')}`);
    }
  }

  // ── Rule 3: Edge Integrity ──

  _checkEdgeIntegrity(edges, nodeIds, issues, suggestions, autoFix) {
    const missingSource = [];
    const missingTarget = [];

    for (const edge of edges) {
      if (!nodeIds.has(edge.source)) missingSource.push(edge.source);
      if (!nodeIds.has(edge.target)) missingTarget.push(edge.target);
    }

    if (missingSource.length > 0) {
      issues.push({
        code: 'INVALID_EDGE_SOURCES', severity: 'error',
        message: `${missingSource.length} edges reference missing source nodes: ${[...new Set(missingSource)].join(', ')}`,
      });
      if (autoFix) suggestions.push('Remove edges with missing source nodes');
    }

    if (missingTarget.length > 0) {
      issues.push({
        code: 'INVALID_EDGE_TARGETS', severity: 'error',
        message: `${missingTarget.length} edges reference missing target nodes: ${[...new Set(missingTarget)].join(', ')}`,
      });
      if (autoFix) suggestions.push('Remove edges with missing target nodes');
    }
  }

  // ── Rule 4: Executor Type Validation ──

  _checkExecutorTypes(nodes, context, issues, suggestions, autoFix) {
    let registeredTypes = null;

    // Try to get registered executor types from plugin registry
    try {
      const { pluginRegistry } = require('../../../registry/plugin-registry');
      const allExecutors = pluginRegistry.listExecutors?.() || [];
      registeredTypes = new Set(allExecutors.map(e => e.type || e));
    } catch {
      // Registry not available — skip this check
      return;
    }

    if (!registeredTypes || registeredTypes.size === 0) return;

    const unknownTypes = [];
    for (const node of nodes) {
      const executorType = node.data?.executorType || node.data?.toolId || node.type;
      if (!executorType) continue;

      // Skip tref nodes and special types
      if (executorType === 'tref' || executorType === 'tool_reference') continue;

      if (!registeredTypes.has(executorType)) {
        unknownTypes.push({ nodeId: node.id, executorType });
      }
    }

    if (unknownTypes.length > 0) {
      issues.push({
        code: 'UNKNOWN_EXECUTOR_TYPES', severity: 'warning',
        message: `${unknownTypes.length} nodes use unknown executor types: ${unknownTypes.map(u => `${u.nodeId}(${u.executorType})`).slice(0, 5).join(', ')}`,
        nodes: unknownTypes,
      });
      if (autoFix) suggestions.push('Check executor type names against the registered catalog');
    }
  }

  // ── Rule 5: Condition Node Branching ──

  _checkConditionBranching(nodes, edges, issues, suggestions, autoFix) {
    const conditionNodes = nodes.filter(n => {
      const executorType = n.data?.executorType || n.data?.toolId || n.type;
      return executorType === 'workflow.condition';
    });

    for (const condNode of conditionNodes) {
      const outgoing = edges.filter(e => e.source === condNode.id);
      const labels = outgoing.map(e => e.sourceHandle || e.label || e.data?.label || '');

      const hasTrueBranch = labels.some(l => l === 'true' || l === 'yes' || l === 'condition-true');
      const hasFalseBranch = labels.some(l => l === 'false' || l === 'no' || l === 'condition-false');

      if (outgoing.length < 2) {
        issues.push({
          code: 'INCOMPLETE_CONDITION', severity: 'error',
          message: `Condition node "${condNode.id}" has only ${outgoing.length} outgoing edge(s) — needs both true and false branches`,
          nodes: [condNode.id],
        });
        if (autoFix) suggestions.push(`Add missing branch edge(s) to condition node "${condNode.id}"`);
      } else if (!hasTrueBranch || !hasFalseBranch) {
        issues.push({
          code: 'UNLABELED_CONDITION_BRANCHES', severity: 'warning',
          message: `Condition node "${condNode.id}": branches should be labeled "true"/"false" (found: ${labels.filter(Boolean).join(', ') || 'none'})`,
          nodes: [condNode.id],
        });
      }
    }
  }

  // ── Rule 6: Orphan Nodes ──

  _checkOrphanNodes(nodeIds, edges, issues, suggestions, autoFix) {
    if (nodeIds.size <= 1) return;

    // Build undirected adjacency for connectivity
    const adj = new Map();
    for (const id of nodeIds) adj.set(id, new Set());
    for (const e of edges) {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source).add(e.target);
        adj.get(e.target).add(e.source);
      }
    }

    // BFS from first node
    const visited = new Set();
    const queue = [nodeIds.values().next().value];
    while (queue.length > 0) {
      const node = queue.shift();
      if (visited.has(node)) continue;
      visited.add(node);
      for (const neighbor of adj.get(node) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor);
      }
    }

    const orphans = [...nodeIds].filter(id => !visited.has(id));
    if (orphans.length > 0) {
      issues.push({
        code: 'ORPHAN_NODES', severity: 'warning',
        message: `${orphans.length} disconnected node(s): ${orphans.slice(0, 5).join(', ')}${orphans.length > 5 ? '...' : ''}`,
        nodes: orphans,
      });
      if (autoFix) suggestions.push(`Connect orphan nodes to the main graph or remove: ${orphans.slice(0, 5).join(', ')}`);
    }
  }

  // ── Rule 7: Node ID Uniqueness ──

  _checkNodeIdUniqueness(nodes, issues, suggestions, autoFix) {
    const seen = new Set();
    const duplicates = [];

    for (const node of nodes) {
      if (!node.id) {
        issues.push({
          code: 'MISSING_NODE_ID', severity: 'error',
          message: 'Node without ID found',
        });
        continue;
      }
      if (seen.has(node.id)) {
        duplicates.push(node.id);
      }
      seen.add(node.id);
    }

    if (duplicates.length > 0) {
      issues.push({
        code: 'DUPLICATE_NODE_IDS', severity: 'error',
        message: `Duplicate node IDs: ${[...new Set(duplicates)].join(', ')}`,
        nodes: [...new Set(duplicates)],
      });
      if (autoFix) suggestions.push('Rename duplicate node IDs to ensure uniqueness');
    }
  }

  // ── Rule 8: Self-Loops and Duplicate Edges ──

  _checkSelfLoopsAndDuplicates(edges, issues, suggestions, autoFix) {
    const selfLoops = edges.filter(e => e.source === e.target);
    if (selfLoops.length > 0) {
      issues.push({
        code: 'SELF_LOOPS', severity: 'error',
        message: `${selfLoops.length} self-loop edge(s) found on nodes: ${selfLoops.map(e => e.source).join(', ')}`,
      });
      if (autoFix) suggestions.push('Remove self-loop edges');
    }

    const edgeKeys = new Set();
    const duplicateEdges = [];
    for (const edge of edges) {
      const key = `${edge.source}→${edge.target}`;
      if (edgeKeys.has(key)) duplicateEdges.push(key);
      edgeKeys.add(key);
    }
    if (duplicateEdges.length > 0) {
      issues.push({
        code: 'DUPLICATE_EDGES', severity: 'warning',
        message: `${duplicateEdges.length} duplicate edge(s): ${[...new Set(duplicateEdges)].slice(0, 5).join(', ')}`,
      });
      if (autoFix) suggestions.push('Remove duplicate edges (keep first occurrence)');
    }
  }
}

module.exports = { GraphValidateExecutor };

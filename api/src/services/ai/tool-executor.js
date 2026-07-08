/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TOOL EXECUTOR
 * Executes AI agent tools against the graph state
 *
 * Phase 8 - AI Graph Builder Agent
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const { validateToolArgs } = require('./graph-builder-tools');
const { getGraphTypeService } = require('../graph/GraphTypeService');

// ────────────────────────────────────────────────────────────────────────────
// GRAPH STATE MANAGER
// ────────────────────────────────────────────────────────────────────────────

/**
 * In-memory graph state for a session
 * In production, this would be backed by a database
 */
class GraphState {
  constructor(initialState = null) {
    this.graph = initialState || {
      id: uuidv4(),
      name: 'Untitled Graph',
      description: '',
      domain: 'general',
      nodes: [],
      edges: [],
      entryNodeId: null,
      exitNodeIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  getGraph() {
    return { ...this.graph };
  }

  /**
   * Replace the full graph state (deep clone). Used for best-attempt rollback
   * in the agent reflection loop.
   */
  setGraph(graph) {
    this.graph = JSON.parse(JSON.stringify(graph || this.graph));
    this.graph.updatedAt = new Date().toISOString();
  }

  addNode(node) {
    this.graph.nodes.push(node);
    this.graph.updatedAt = new Date().toISOString();
  }

  getNode(nodeId) {
    return this.graph.nodes.find(n => n.id === nodeId);
  }

  updateNode(nodeId, updates) {
    const node = this.getNode(nodeId);
    if (node) {
      Object.assign(node.data, updates);
      this.graph.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  removeNode(nodeId) {
    const index = this.graph.nodes.findIndex(n => n.id === nodeId);
    if (index !== -1) {
      this.graph.nodes.splice(index, 1);
      // Also remove connected edges
      this.graph.edges = this.graph.edges.filter(
        e => e.source !== nodeId && e.target !== nodeId
      );
      this.graph.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  addEdge(edge) {
    this.graph.edges.push(edge);
    this.graph.updatedAt = new Date().toISOString();
  }

  getEdge(edgeId) {
    return this.graph.edges.find(e => e.id === edgeId);
  }

  updateEdge(edgeId, updates) {
    const edge = this.getEdge(edgeId);
    if (edge) {
      Object.assign(edge.data || {}, updates);
      this.graph.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  removeEdge(edgeId) {
    const index = this.graph.edges.findIndex(e => e.id === edgeId);
    if (index !== -1) {
      this.graph.edges.splice(index, 1);
      this.graph.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  clear() {
    this.graph.nodes = [];
    this.graph.edges = [];
    this.graph.entryNodeId = null;
    this.graph.exitNodeIds = [];
    this.graph.updatedAt = new Date().toISOString();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// TOOL EXECUTOR CLASS
// ────────────────────────────────────────────────────────────────────────────

class ToolExecutor {
  constructor(graphState, executorRegistry = null) {
    this.graphState = graphState;
    this.executorRegistry = executorRegistry;
    this.nodeCounter = 0;
  }

  /**
   * Execute a tool call
   * @param {string} toolName - Name of the tool
   * @param {Object} args - Tool arguments
   * @returns {Object} Result of tool execution
   */
  async execute(toolName, args = {}) {
    // Validate arguments
    const validation = validateToolArgs(toolName, args);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Route to appropriate handler
    const handler = this.getHandler(toolName);
    if (!handler) {
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
    }

    const startMs = Date.now();
    try {
      const result = await handler.call(this, args);
      // Record metrics
      try {
        const metrics = require('../observability/metrics.service');
        metrics.recordToolCall(toolName, Date.now() - startMs);
      } catch {}
      return result;
    } catch (error) {
      try {
        const metrics = require('../observability/metrics.service');
        metrics.recordToolCall(toolName, Date.now() - startMs);
      } catch {}
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getHandler(toolName) {
    const handlers = {
      // Read tools
      get_graph_state: this.handleGetGraphState,
      get_available_executors: this.handleGetAvailableExecutors,
      get_node: this.handleGetNode,
      get_edge: this.handleGetEdge,
      get_executor_info: this.handleGetExecutorInfo,

      // Create tools
      add_node: this.handleAddNode,
      add_edge: this.handleAddEdge,

      // Update tools
      update_node: this.handleUpdateNode,
      update_edge: this.handleUpdateEdge,
      update_graph_metadata: this.handleUpdateGraphMetadata,
      move_node: this.handleMoveNode,

      // Delete tools
      remove_node: this.handleRemoveNode,
      remove_edge: this.handleRemoveEdge,
      clear_graph: this.handleClearGraph,

      // Validation tools
      validate_graph: this.handleValidateGraph,
      test_with_mock: this.handleTestWithMock,
      explain_flow: this.handleExplainFlow,

      // Layout tools
      auto_layout: this.handleAutoLayout,
      set_entry_exit: this.handleSetEntryExit,

      // Template tools
      apply_template: this.handleApplyTemplate,
      suggest_next_node: this.handleSuggestNextNode,

      // Type catalog tools (Phase 9)
      list_node_types: this.handleListNodeTypes,
      get_node_type_schema: this.handleGetNodeTypeSchema,
      create_node_type: this.handleCreateNodeType,
      list_edge_types: this.handleListEdgeTypes,
      list_domains: this.handleListDomains,
      validate_node_against_type: this.handleValidateNodeAgainstType,
      find_compatible_nodes: this.handleFindCompatibleNodes,

      // Backlog tools
      backlog_create_task: this.handleBacklogCreateTask,
      backlog_list_tasks: this.handleBacklogListTasks,
      backlog_get_stats: this.handleBacklogGetStats,

      // Execution tracking tools
      backlog_start_execution: this.handleBacklogStartExecution,
      backlog_add_decision: this.handleBacklogAddDecision,
      backlog_record_file_change: this.handleBacklogRecordFileChange,
      backlog_record_graph_change: this.handleBacklogRecordGraphChange,
      backlog_complete_execution: this.handleBacklogCompleteExecution,

      // Codex governance tools (P1-004) — align toolset with the system prompt's
      // MANDATORY Knowledge Access Protocol (previously referenced but non-existent).
      codex_search_rules: this.handleCodexSearchRules,
      codex_get_blackcodex: this.handleCodexGetBlackcodex,
    };

    return handlers[toolName];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  handleGetGraphState(args) {
    const graph = this.graphState.getGraph();
    return {
      success: true,
      data: {
        id: graph.id,
        name: graph.name,
        description: graph.description,
        domain: graph.domain,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        entryNodeId: graph.entryNodeId,
        exitNodeIds: graph.exitNodeIds,
        nodes: args.includePositions
          ? graph.nodes
          : graph.nodes.map(n => ({
              id: n.id,
              executorType: n.data?.executorType,
              displayName: n.data?.displayName,
            })),
        edges: graph.edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          condition: e.data?.condition?.type || 'always',
        })),
      },
    };
  }

  handleGetAvailableExecutors(args) {
    if (!this.executorRegistry) {
      return {
        success: false,
        error: 'Executor registry not available',
      };
    }

    let executors = this.executorRegistry.getAllExecutors();

    // Filter by domain
    if (args.domain) {
      executors = executors.filter(e => e.domain === args.domain);
    }

    // Filter by search term
    if (args.search) {
      const term = args.search.toLowerCase();
      executors = executors.filter(e =>
        e.type.toLowerCase().includes(term) ||
        (e.description || '').toLowerCase().includes(term)
      );
    }

    return {
      success: true,
      data: executors.map(e => ({
        type: e.type,
        displayName: e.displayName,
        description: e.description,
        domain: e.domain,
      })),
    };
  }

  handleGetNode(args) {
    const node = this.graphState.getNode(args.nodeId);
    if (!node) {
      return {
        success: false,
        error: `Node not found: ${args.nodeId}`,
      };
    }

    // Get connected edges
    const graph = this.graphState.getGraph();
    const incomingEdges = graph.edges.filter(e => e.target === args.nodeId);
    const outgoingEdges = graph.edges.filter(e => e.source === args.nodeId);

    return {
      success: true,
      data: {
        ...node,
        incomingEdges: incomingEdges.map(e => e.id),
        outgoingEdges: outgoingEdges.map(e => e.id),
      },
    };
  }

  handleGetEdge(args) {
    const edge = this.graphState.getEdge(args.edgeId);
    if (!edge) {
      return {
        success: false,
        error: `Edge not found: ${args.edgeId}`,
      };
    }

    return {
      success: true,
      data: edge,
    };
  }

  handleGetExecutorInfo(args) {
    if (!this.executorRegistry) {
      return {
        success: false,
        error: 'Executor registry not available',
      };
    }

    const executor = this.executorRegistry.getExecutor(args.executorType);
    if (!executor) {
      return {
        success: false,
        error: `Executor not found: ${args.executorType}`,
      };
    }

    return {
      success: true,
      data: {
        type: executor.type,
        displayName: executor.displayName,
        description: executor.description,
        domain: executor.domain,
        parameterSchema: executor.parameterSchema,
        inputSchema: executor.inputSchema,
        outputSchema: executor.outputSchema,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  handleAddNode(args) {
    this.nodeCounter++;
    const nodeId = `node_${this.nodeCounter}_${Date.now().toString(36)}`;

    // Calculate position if not provided
    const position = args.position || this.calculateNextPosition();

    const node = {
      id: nodeId,
      type: 'aopegNode',
      position,
      data: {
        executorType: args.executorType,
        displayName: args.displayName,
        description: args.description || '',
        parameters: args.parameters || {},
        timeout: args.timeout || 30000,
        retryPolicy: args.retryPolicy || {
          maxAttempts: 3,
          delayMs: 1000,
          backoffMultiplier: 2,
        },
        enabled: true,
      },
    };

    this.graphState.addNode(node);

    // If this is the first node, make it the entry
    const graph = this.graphState.getGraph();
    if (graph.nodes.length === 1) {
      graph.entryNodeId = nodeId;
    }

    return {
      success: true,
      data: {
        nodeId,
        message: `Added node "${args.displayName}" (${args.executorType})`,
      },
    };
  }

  handleAddEdge(args) {
    // Verify nodes exist
    const sourceNode = this.graphState.getNode(args.sourceNodeId);
    const targetNode = this.graphState.getNode(args.targetNodeId);

    if (!sourceNode) {
      return {
        success: false,
        error: `Source node not found: ${args.sourceNodeId}`,
      };
    }

    if (!targetNode) {
      return {
        success: false,
        error: `Target node not found: ${args.targetNodeId}`,
      };
    }

    // Check for duplicate edge
    const graph = this.graphState.getGraph();
    const existingEdge = graph.edges.find(
      e => e.source === args.sourceNodeId && e.target === args.targetNodeId
    );

    if (existingEdge) {
      return {
        success: false,
        error: `Edge already exists between ${args.sourceNodeId} and ${args.targetNodeId}`,
      };
    }

    const edgeId = `edge_${Date.now().toString(36)}`;

    const edge = {
      id: edgeId,
      source: args.sourceNodeId,
      target: args.targetNodeId,
      type: 'aopegEdge',
      data: {
        label: args.label || '',
        condition: args.condition || { type: 'always', config: {} },
        dataMapping: args.dataMapping || {},
        priority: args.priority || 0,
      },
    };

    this.graphState.addEdge(edge);

    return {
      success: true,
      data: {
        edgeId,
        message: `Connected ${args.sourceNodeId} → ${args.targetNodeId}`,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  handleUpdateNode(args) {
    const updated = this.graphState.updateNode(args.nodeId, args.updates);

    if (!updated) {
      return {
        success: false,
        error: `Node not found: ${args.nodeId}`,
      };
    }

    return {
      success: true,
      data: {
        nodeId: args.nodeId,
        message: `Updated node ${args.nodeId}`,
        updatedFields: Object.keys(args.updates),
      },
    };
  }

  handleUpdateEdge(args) {
    const edge = this.graphState.getEdge(args.edgeId);
    if (!edge) {
      return {
        success: false,
        error: `Edge not found: ${args.edgeId}`,
      };
    }

    edge.data = { ...edge.data, ...args.updates };

    return {
      success: true,
      data: {
        edgeId: args.edgeId,
        message: `Updated edge ${args.edgeId}`,
        updatedFields: Object.keys(args.updates),
      },
    };
  }

  handleUpdateGraphMetadata(args) {
    const graph = this.graphState.graph;

    if (args.name !== undefined) graph.name = args.name;
    if (args.description !== undefined) graph.description = args.description;
    if (args.domain !== undefined) graph.domain = args.domain;
    graph.updatedAt = new Date().toISOString();

    return {
      success: true,
      data: {
        message: 'Updated graph metadata',
        name: graph.name,
        description: graph.description,
        domain: graph.domain,
      },
    };
  }

  handleMoveNode(args) {
    const node = this.graphState.getNode(args.nodeId);
    if (!node) {
      return {
        success: false,
        error: `Node not found: ${args.nodeId}`,
      };
    }

    node.position = args.position;

    return {
      success: true,
      data: {
        nodeId: args.nodeId,
        position: args.position,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DELETE HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  handleRemoveNode(args) {
    if (args.confirm === false) {
      return {
        success: false,
        error: 'Removal not confirmed. Set confirm=true to proceed.',
      };
    }

    const removed = this.graphState.removeNode(args.nodeId);

    if (!removed) {
      return {
        success: false,
        error: `Node not found: ${args.nodeId}`,
      };
    }

    return {
      success: true,
      data: {
        nodeId: args.nodeId,
        message: `Removed node ${args.nodeId} and connected edges`,
      },
    };
  }

  handleRemoveEdge(args) {
    const removed = this.graphState.removeEdge(args.edgeId);

    if (!removed) {
      return {
        success: false,
        error: `Edge not found: ${args.edgeId}`,
      };
    }

    return {
      success: true,
      data: {
        edgeId: args.edgeId,
        message: `Removed edge ${args.edgeId}`,
      },
    };
  }

  handleClearGraph(args) {
    if (!args.confirm) {
      return {
        success: false,
        error: 'Clear not confirmed. Set confirm=true to proceed.',
      };
    }

    this.graphState.clear();

    return {
      success: true,
      data: {
        message: 'Cleared all nodes and edges from graph',
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATION HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  handleValidateGraph(args) {
    const graph = this.graphState.getGraph();
    const errors = [];
    const warnings = [];

    // Check for empty graph
    if (graph.nodes.length === 0) {
      warnings.push({ type: 'empty', message: 'Graph has no nodes' });
    }

    // Check for entry node
    if (graph.nodes.length > 0 && !graph.entryNodeId) {
      errors.push({ type: 'no_entry', message: 'No entry node defined' });
    }

    // Check if entry node exists
    if (graph.entryNodeId && !graph.nodes.find(n => n.id === graph.entryNodeId)) {
      errors.push({ type: 'invalid_entry', message: 'Entry node does not exist' });
    }

    // Check for disconnected nodes
    const connectedNodes = new Set();
    for (const edge of graph.edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    for (const node of graph.nodes) {
      if (graph.nodes.length > 1 && !connectedNodes.has(node.id)) {
        warnings.push({
          type: 'disconnected',
          message: `Node "${node.data?.displayName || node.id}" is not connected`,
          nodeId: node.id,
        });
      }
    }

    // Check for cycles (simple detection)
    const hasCycle = this.detectCycle(graph);
    if (hasCycle) {
      warnings.push({ type: 'cycle', message: 'Graph contains a cycle' });
    }

    // Check for invalid executor types
    if (this.executorRegistry) {
      for (const node of graph.nodes) {
        const executor = this.executorRegistry.getExecutor(node.data?.executorType);
        if (!executor) {
          errors.push({
            type: 'invalid_executor',
            message: `Unknown executor type: ${node.data?.executorType}`,
            nodeId: node.id,
          });
        }
      }
    }

    const isValid = errors.length === 0;

    return {
      success: true,
      data: {
        valid: isValid,
        errors,
        warnings,
        summary: isValid
          ? 'Graph is valid'
          : `${errors.length} error(s), ${warnings.length} warning(s)`,
      },
    };
  }

  handleTestWithMock(args) {
    // Simplified mock test - in production, this would run actual execution
    const graph = this.graphState.getGraph();

    if (graph.nodes.length === 0) {
      return {
        success: false,
        error: 'Cannot test empty graph',
      };
    }

    const mockResults = {
      input: args.mockInput,
      executionPath: graph.nodes.map(n => n.id),
      dryRun: args.dryRun !== false,
      message: 'Mock test completed (dry run)',
    };

    return {
      success: true,
      data: mockResults,
    };
  }

  handleExplainFlow(args) {
    const graph = this.graphState.getGraph();

    if (graph.nodes.length === 0) {
      return {
        success: true,
        data: { explanation: 'Empty graph - no flow to explain.' },
      };
    }

    let explanation = `# ${graph.name}\n\n`;
    explanation += `${graph.description || 'No description.'}\n\n`;
    explanation += `## Flow:\n\n`;

    // Start from entry node
    const visited = new Set();
    const queue = [graph.entryNodeId || graph.nodes[0].id];
    let step = 1;

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) continue;

      explanation += `${step}. **${node.data?.displayName || nodeId}** (${node.data?.executorType})\n`;

      if (args.detailed && node.data?.description) {
        explanation += `   ${node.data.description}\n`;
      }

      // Find outgoing edges
      const outgoing = graph.edges.filter(e => e.source === nodeId);
      for (const edge of outgoing) {
        const condition = edge.data?.condition?.type || 'always';
        explanation += `   → ${condition} → next\n`;
        queue.push(edge.target);
      }

      explanation += '\n';
      step++;
    }

    return {
      success: true,
      data: { explanation },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CODEX GOVERNANCE HANDLERS (P1-004)
  // ══════════════════════════════════════════════════════════════════════════

  async handleCodexSearchRules(args) {
    try {
      const { codexService } = require('../codex');
      const results = await codexService.searchCodexDocuments(args.query);
      return { success: true, data: { query: args.query, results } };
    } catch (error) {
      return { success: false, error: `Codex search failed: ${error.message}` };
    }
  }

  async handleCodexGetBlackcodex(args) {
    try {
      const { blackCodexService } = require('../codex');
      const antiPatterns = await blackCodexService.getAll();
      return { success: true, data: { antiPatterns } };
    } catch (error) {
      return { success: false, error: `BlackCodex fetch failed: ${error.message}` };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LAYOUT HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  handleAutoLayout(args) {
    const graph = this.graphState.getGraph();
    const direction = args.direction || 'TB';
    const spacing = args.spacing || { horizontal: 200, vertical: 100 };

    // Simple layered layout algorithm
    const layers = this.computeLayers(graph);

    for (const [layerIndex, layerNodes] of layers.entries()) {
      for (const [nodeIndex, nodeId] of layerNodes.entries()) {
        const node = graph.nodes.find(n => n.id === nodeId);
        if (!node) continue;

        if (direction === 'TB' || direction === 'BT') {
          node.position = {
            x: nodeIndex * spacing.horizontal,
            y: layerIndex * spacing.vertical,
          };
        } else {
          node.position = {
            x: layerIndex * spacing.horizontal,
            y: nodeIndex * spacing.vertical,
          };
        }
      }
    }

    return {
      success: true,
      data: {
        message: `Applied ${direction} layout to ${graph.nodes.length} nodes`,
        layers: layers.length,
      },
    };
  }

  handleSetEntryExit(args) {
    const graph = this.graphState.graph;

    // Validate entry node exists
    if (args.entryNodeId && !graph.nodes.find(n => n.id === args.entryNodeId)) {
      return {
        success: false,
        error: `Entry node not found: ${args.entryNodeId}`,
      };
    }

    // Validate exit nodes exist
    if (args.exitNodeIds) {
      for (const exitId of args.exitNodeIds) {
        if (!graph.nodes.find(n => n.id === exitId)) {
          return {
            success: false,
            error: `Exit node not found: ${exitId}`,
          };
        }
      }
    }

    graph.entryNodeId = args.entryNodeId;
    if (args.exitNodeIds) {
      graph.exitNodeIds = args.exitNodeIds;
    }

    return {
      success: true,
      data: {
        entryNodeId: graph.entryNodeId,
        exitNodeIds: graph.exitNodeIds,
        message: 'Updated entry and exit nodes',
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEMPLATE HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  handleApplyTemplate(args) {
    if (args.clearExisting) {
      this.graphState.clear();
      this.nodeCounter = 0;
    }

    const templates = {
      basic_ingestion: this.getBasicIngestionTemplate,
      rag_pipeline: this.getRAGPipelineTemplate,
      text_analysis: this.getTextAnalysisTemplate,
      document_processing: this.getDocumentProcessingTemplate,
    };

    const templateFn = templates[args.templateId];
    if (!templateFn) {
      return {
        success: false,
        error: `Unknown template: ${args.templateId}`,
      };
    }

    const template = templateFn.call(this);
    const nodeIdMap = {};

    // Add nodes
    for (const nodeDef of template.nodes) {
      const result = this.handleAddNode(nodeDef);
      if (result.success) {
        nodeIdMap[nodeDef.tempId] = result.data.nodeId;
      }
    }

    // Add edges
    for (const edgeDef of template.edges) {
      this.handleAddEdge({
        sourceNodeId: nodeIdMap[edgeDef.source],
        targetNodeId: nodeIdMap[edgeDef.target],
        condition: edgeDef.condition,
      });
    }

    // Set entry/exit
    if (template.entryNode) {
      this.graphState.graph.entryNodeId = nodeIdMap[template.entryNode];
    }

    return {
      success: true,
      data: {
        message: `Applied template: ${args.templateId}`,
        nodesCreated: template.nodes.length,
        edgesCreated: template.edges.length,
      },
    };
  }

  handleSuggestNextNode(args) {
    const suggestions = [];

    if (args.fromNodeId) {
      const node = this.graphState.getNode(args.fromNodeId);
      if (node) {
        const executorType = node.data?.executorType || '';

        // Suggest based on executor type
        if (executorType.includes('sanitize')) {
          suggestions.push({
            executorType: 'ingestion.chunk_text',
            reason: 'Chunk sanitized text for processing',
          });
        } else if (executorType.includes('chunk')) {
          suggestions.push({
            executorType: 'ingestion.extract_entities',
            reason: 'Extract entities from chunks',
          });
          suggestions.push({
            executorType: 'ingestion.write_vector',
            reason: 'Store chunks as vectors',
          });
        } else if (executorType.includes('extract_entities')) {
          suggestions.push({
            executorType: 'ingestion.write_graph',
            reason: 'Store entities in knowledge graph',
          });
        } else if (executorType.includes('vector_search')) {
          suggestions.push({
            executorType: 'rag.assemble_context',
            reason: 'Assemble search results into context',
          });
        } else if (executorType.includes('assemble_context')) {
          suggestions.push({
            executorType: 'rag.generate_response',
            reason: 'Generate response using context',
          });
        }
      }
    }

    // Intent-based suggestions
    if (args.intent) {
      const intent = args.intent.toLowerCase();

      if (intent.includes('search') || intent.includes('find')) {
        suggestions.push({
          executorType: 'rag.vector_search',
          reason: 'Semantic vector search',
        });
        suggestions.push({
          executorType: 'rag.hybrid_search',
          reason: 'Combined vector and graph search',
        });
      } else if (intent.includes('extract') || intent.includes('entity')) {
        suggestions.push({
          executorType: 'ingestion.extract_entities',
          reason: 'Extract named entities',
        });
      } else if (intent.includes('generate') || intent.includes('answer')) {
        suggestions.push({
          executorType: 'rag.generate_response',
          reason: 'Generate LLM response',
        });
      }
    }

    return {
      success: true,
      data: { suggestions },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TYPE CATALOG HANDLERS (Phase 9)
  // ══════════════════════════════════════════════════════════════════════════

  async handleListNodeTypes(args) {
    try {
      const typeService = getGraphTypeService();
      const types = await typeService.listNodeTypes({
        domain: args.domain,
        category: args.category,
      });

      return {
        success: true,
        data: {
          types: types.map(t => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            category: t.category,
            domain: t.domain,
            description: t.description,
          })),
          total: types.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list node types: ${error.message}`,
      };
    }
  }

  async handleGetNodeTypeSchema(args) {
    try {
      const typeService = getGraphTypeService();
      const nodeType = await typeService.getNodeType(args.fullName);

      if (!nodeType) {
        return {
          success: false,
          error: `Node type not found: ${args.fullName}`,
        };
      }

      return {
        success: true,
        data: {
          id: nodeType.id,
          name: nodeType.name,
          displayName: nodeType.displayName,
          description: nodeType.description,
          category: nodeType.category,
          domain: nodeType.domain,
          icon: nodeType.icon,
          color: nodeType.color,
          parameters: nodeType.parameters,
          inputSchema: nodeType.inputSchema,
          outputSchema: nodeType.outputSchema,
          defaultConfig: nodeType.defaultConfig,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get node type schema: ${error.message}`,
      };
    }
  }

  async handleCreateNodeType(args) {
    try {
      const typeService = getGraphTypeService();

      const newType = await typeService.createNodeType({
        name: args.name,
        displayName: args.displayName,
        description: args.description,
        category: args.category,
        domain: args.domain,
        icon: args.icon,
        color: args.color,
        parameters: args.parameters || [],
        inputSchema: args.inputSchema || {},
        outputSchema: args.outputSchema || {},
        defaultConfig: args.defaultConfig || {},
      });

      return {
        success: true,
        data: {
          typeId: newType.id,
          message: `Created node type: ${args.displayName}`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create node type: ${error.message}`,
      };
    }
  }

  async handleListEdgeTypes(args) {
    try {
      const typeService = getGraphTypeService();
      const types = await typeService.listEdgeTypes({
        category: args.category,
      });

      return {
        success: true,
        data: {
          types: types.map(t => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            category: t.category,
            semantics: t.semantics,
            allowedSourceCategories: t.allowedSourceCategories,
            allowedTargetCategories: t.allowedTargetCategories,
          })),
          total: types.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list edge types: ${error.message}`,
      };
    }
  }

  async handleListDomains(args) {
    try {
      const typeService = getGraphTypeService();
      const domains = await typeService.listDomains();

      return {
        success: true,
        data: {
          domains: domains.map(d => ({
            id: d.id,
            name: d.name,
            displayName: d.displayName,
            description: d.description,
            icon: d.icon,
            color: d.color,
          })),
          total: domains.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list domains: ${error.message}`,
      };
    }
  }

  async handleValidateNodeAgainstType(args) {
    try {
      const typeService = getGraphTypeService();

      // Get node from graph state
      const node = this.graphState.getNode(args.nodeId);
      if (!node) {
        return {
          success: false,
          error: `Node not found: ${args.nodeId}`,
        };
      }

      // Use provided nodeType or get from node's executorType
      const typeId = args.nodeType || node.data?.executorType;
      if (!typeId) {
        return {
          success: false,
          error: 'No node type specified and node has no executorType',
        };
      }

      const validation = await typeService.validateNode(node.data, typeId);

      return {
        success: true,
        data: {
          valid: validation.valid,
          errors: validation.errors || [],
          warnings: validation.warnings || [],
          missingRequired: validation.missingRequired || [],
          extraFields: validation.extraFields || [],
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to validate node: ${error.message}`,
      };
    }
  }

  async handleFindCompatibleNodes(args) {
    try {
      const typeService = getGraphTypeService();

      // Get compatible types based on output schema matching
      const compatibleTypes = await typeService.findCompatibleNodeTypes({
        sourceType: args.sourceType,
        edgeType: args.edgeType || 'data_flow',
      });

      return {
        success: true,
        data: {
          compatible: compatibleTypes.map(t => ({
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            category: t.category,
            domain: t.domain,
            compatibilityScore: t.compatibilityScore,
            reason: t.reason,
          })),
          total: compatibleTypes.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to find compatible nodes: ${error.message}`,
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ══════════════════════════════════════════════════════════════════════════

  calculateNextPosition() {
    const graph = this.graphState.getGraph();
    const nodeCount = graph.nodes.length;

    // Grid layout
    const cols = 3;
    const spacing = { x: 250, y: 120 };

    return {
      x: (nodeCount % cols) * spacing.x + 50,
      y: Math.floor(nodeCount / cols) * spacing.y + 50,
    };
  }

  detectCycle(graph) {
    const visited = new Set();
    const recStack = new Set();

    const dfs = (nodeId) => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const outgoing = graph.edges.filter(e => e.source === nodeId);
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) return true;
        } else if (recStack.has(edge.target)) {
          return true;
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }

    return false;
  }

  computeLayers(graph) {
    const layers = [];
    const assigned = new Set();

    // Find root nodes (no incoming edges)
    let currentLayer = graph.nodes
      .filter(n => !graph.edges.some(e => e.target === n.id))
      .map(n => n.id);

    if (currentLayer.length === 0 && graph.nodes.length > 0) {
      currentLayer = [graph.entryNodeId || graph.nodes[0].id];
    }

    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      currentLayer.forEach(id => assigned.add(id));

      // Find next layer
      const nextLayer = [];
      for (const nodeId of currentLayer) {
        const outgoing = graph.edges.filter(e => e.source === nodeId);
        for (const edge of outgoing) {
          if (!assigned.has(edge.target) && !nextLayer.includes(edge.target)) {
            nextLayer.push(edge.target);
          }
        }
      }

      currentLayer = nextLayer;
    }

    return layers;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEMPLATES
  // ══════════════════════════════════════════════════════════════════════════

  getBasicIngestionTemplate() {
    return {
      nodes: [
        { tempId: 'n1', executorType: 'ingestion.sanitize', displayName: 'Sanitize Text' },
        { tempId: 'n2', executorType: 'ingestion.chunk_text', displayName: 'Chunk Text' },
        { tempId: 'n3', executorType: 'ingestion.extract_entities', displayName: 'Extract Entities' },
        { tempId: 'n4', executorType: 'ingestion.write_vector', displayName: 'Store Vectors' },
      ],
      edges: [
        { source: 'n1', target: 'n2' },
        { source: 'n2', target: 'n3' },
        { source: 'n3', target: 'n4' },
      ],
      entryNode: 'n1',
    };
  }

  getRAGPipelineTemplate() {
    return {
      nodes: [
        { tempId: 'n1', executorType: 'rag.expand_query', displayName: 'Expand Query' },
        { tempId: 'n2', executorType: 'rag.hybrid_search', displayName: 'Hybrid Search' },
        { tempId: 'n3', executorType: 'rag.rerank', displayName: 'Rerank Results' },
        { tempId: 'n4', executorType: 'rag.assemble_context', displayName: 'Assemble Context' },
        { tempId: 'n5', executorType: 'rag.generate_response', displayName: 'Generate Response' },
      ],
      edges: [
        { source: 'n1', target: 'n2' },
        { source: 'n2', target: 'n3' },
        { source: 'n3', target: 'n4' },
        { source: 'n4', target: 'n5' },
      ],
      entryNode: 'n1',
    };
  }

  getTextAnalysisTemplate() {
    return {
      nodes: [
        { tempId: 'n1', executorType: 'ingestion.sanitize', displayName: 'Clean Text' },
        { tempId: 'n2', executorType: 'ingestion.detect_language', displayName: 'Detect Language' },
        { tempId: 'n3', executorType: 'ingestion.extract_entities', displayName: 'Extract Entities' },
        { tempId: 'n4', executorType: 'ingestion.classify_content', displayName: 'Classify Content' },
      ],
      edges: [
        { source: 'n1', target: 'n2' },
        { source: 'n2', target: 'n3' },
        { source: 'n3', target: 'n4' },
      ],
      entryNode: 'n1',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BACKLOG TOOLS
  // ══════════════════════════════════════════════════════════════════════════

  async handleBacklogCreateTask(args) {
    try {
      const backlogService = require('../backlog/backlog.service');
      const item = await backlogService.create(args, { createdBy: 'agent:gxe-assistant' });
      return {
        success: true,
        message: `Task ${item.backlogId} created with status ${item.status}`,
        data: {
          backlogId: item.backlogId,
          title: item.title,
          status: item.status,
          priority: item.priority,
        },
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleBacklogListTasks(args) {
    try {
      const backlogService = require('../backlog/backlog.service');
      const items = await backlogService.list({ ...args, limit: args.limit || 20 });
      return {
        success: true,
        count: items.length,
        data: items.map(i => ({
          backlogId: i.backlogId,
          title: i.title,
          status: i.status,
          priority: i.priority,
          taskType: i.taskType,
          targetPath: i.targetPath,
          createdBy: i.createdBy,
        })),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleBacklogGetStats() {
    try {
      const backlogService = require('../backlog/backlog.service');
      const stats = await backlogService.getStats();
      return { success: true, data: stats };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTION TRACKING TOOLS
  // ══════════════════════════════════════════════════════════════════════════

  async handleBacklogStartExecution(args) {
    try {
      const execService = require('../backlog/execution-record.service');
      const record = await execService.startExecution(args.backlogId, 'agent:gxe-assistant');
      return { success: true, message: `Execution started for ${args.backlogId}`, data: { id: record.id, status: 'IN_PROGRESS' } };
    } catch (error) { return { success: false, error: error.message }; }
  }

  async handleBacklogAddDecision(args) {
    try {
      const execService = require('../backlog/execution-record.service');
      const decision = await execService.addDecision(args.backlogId, {
        decision: args.decision, rationale: args.rationale,
        confidenceLevel: args.confidenceLevel || 'MEDIUM',
        alternativesConsidered: args.alternativesConsidered || [],
        decidedBy: 'agent:gxe-assistant'
      });
      return { success: true, message: 'Decision recorded', data: { id: decision.id, decision: args.decision } };
    } catch (error) { return { success: false, error: error.message }; }
  }

  async handleBacklogRecordFileChange(args) {
    try {
      const execService = require('../backlog/execution-record.service');
      const result = await execService.recordFileChange(args.backlogId, args.changeType, args.filePath);
      return { success: true, message: `File ${args.changeType}: ${args.filePath}`, data: result };
    } catch (error) { return { success: false, error: error.message }; }
  }

  async handleBacklogRecordGraphChange(args) {
    try {
      const execService = require('../backlog/execution-record.service');
      const result = await execService.recordGraphChange(args.backlogId, {
        changeType: args.changeType, description: args.description,
        targetLabel: args.targetLabel || '', targetId: args.targetId || '',
        relationship: args.relationship || ''
      });
      return { success: true, message: 'Graph change recorded', data: result };
    } catch (error) { return { success: false, error: error.message }; }
  }

  async handleBacklogCompleteExecution(args) {
    try {
      const execService = require('../backlog/execution-record.service');
      const result = await execService.completeExecution(args.backlogId, args.summary, args.status || 'COMPLETED');
      return { success: true, message: `Execution ${args.status || 'COMPLETED'} for ${args.backlogId}`, data: result };
    } catch (error) { return { success: false, error: error.message }; }
  }

  getDocumentProcessingTemplate() {
    return {
      nodes: [
        { tempId: 'n1', executorType: 'ingestion.parse_document', displayName: 'Parse Document' },
        { tempId: 'n2', executorType: 'ingestion.sanitize', displayName: 'Sanitize' },
        { tempId: 'n3', executorType: 'ingestion.chunk_text', displayName: 'Chunk' },
        { tempId: 'n4', executorType: 'ingestion.extract_entities', displayName: 'Extract Entities' },
        { tempId: 'n5', executorType: 'ingestion.write_vector', displayName: 'Store Vectors' },
        { tempId: 'n6', executorType: 'ingestion.write_graph', displayName: 'Store in Graph' },
      ],
      edges: [
        { source: 'n1', target: 'n2' },
        { source: 'n2', target: 'n3' },
        { source: 'n3', target: 'n4' },
        { source: 'n4', target: 'n5' },
        { source: 'n4', target: 'n6' },
      ],
      entryNode: 'n1',
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  ToolExecutor,
  GraphState,
};

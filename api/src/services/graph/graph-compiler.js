/**
 * Graph Compiler Service
 *
 * SDA Stage 4: Deterministic compilation of ProcessRepresentation (IR) into AOPEG/ReactFlow DAG.
 * NO LLM CALLS - pure deterministic transformation.
 *
 * Three modes:
 * 1. SDA Mode (IR): ProcessRepresentation → AOPEG DAG (main mode)
 * 2. SDA Mode (TaskPlan): TaskPlan → ReactFlow DAG (legacy SDA)
 * 3. Legacy Mode: Raw LLM output → Normalized DAG (fallback)
 *
 * Pipeline integration:
 * [prompt] → [IntentClassifier(S1)] → [ToolResolver(S2)] → [TaskPlanner(S3)] → [GraphCompiler(S4)] → [Validator(S5)]
 *
 * AOPEG format:
 * - nodes: id, executorType, parameters, displayName, description, position, retryPolicy
 * - edges: id, sourceNodeId, targetNodeId, condition, priority, dataMapping
 *
 * @module services/graph/graph-compiler
 */

const { extractAllSteps, buildDependencyGraph, getExecutionLevels, CAPABILITY_CATEGORIES } = require('./process-representation');
const { SoundnessChecker } = require('./soundness-checker');

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (JSDoc)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TaskStep
 * @property {string} id - Step identifier
 * @property {string} description - Human-readable description
 * @property {string} suggestedTool - Tool ID to use
 * @property {Object} inputMapping - Input port mappings
 * @property {string[]} outputKeys - Expected output keys
 * @property {boolean} [isConditional] - Whether this is a conditional step
 */

/**
 * @typedef {Object} TaskDependency
 * @property {string} from - Source step ID
 * @property {string} to - Target step ID
 * @property {string} [label] - Edge label (for conditional branches)
 * @property {boolean} [conditional] - Whether this is a conditional edge
 */

/**
 * @typedef {Object} TaskPlan
 * @property {TaskStep[]} steps - Ordered list of steps
 * @property {TaskDependency[]} dependencies - Dependencies between steps
 * @property {string[][]} [parallelGroups] - Groups of steps to run in parallel
 */

/**
 * @typedef {Object} CompiledGraph
 * @property {Array} nodes - ReactFlow nodes
 * @property {Array} edges - ReactFlow edges
 * @property {boolean} compiled - Whether compilation succeeded
 * @property {'sda'|'legacy'} mode - Compilation mode used
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const NODE_TYPES = {
  INPUT: 'input',
  EXECUTOR: 'executor',
  AI: 'ai',
  CONDITION: 'condition',
  OUTPUT: 'output',
  ACTOR: 'actor'
};

/**
 * Mapping: Capability → AOPEG executorType
 */
const CAPABILITY_TO_EXECUTOR = {
  [CAPABILITY_CATEGORIES.DATA_FETCH]: 'common.fetch',
  [CAPABILITY_CATEGORIES.DATA_TRANSFORM]: 'common.transform',
  [CAPABILITY_CATEGORIES.DATA_STORE]: 'common.store',
  [CAPABILITY_CATEGORIES.ANALYSIS]: 'ai.analyze',
  [CAPABILITY_CATEGORIES.GENERATION]: 'ai.generate',
  [CAPABILITY_CATEGORIES.VALIDATION]: 'common.validate',
  [CAPABILITY_CATEGORIES.NOTIFICATION]: 'common.notify',
  [CAPABILITY_CATEGORIES.INTEGRATION]: 'common.integrate',
  [CAPABILITY_CATEGORIES.CONTROL_FLOW]: 'control.condition',
  [CAPABILITY_CATEGORIES.EMBEDDING]: 'vector.embed',
  [CAPABILITY_CATEGORIES.EXTRACTION]: 'extraction.entities',
  [CAPABILITY_CATEGORIES.RESOLUTION]: 'graph.resolve'
};

const X_SPACING = 280;
const Y_SPACING = 150;
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRY_POLICY = { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 };

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH COMPILER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class GraphCompiler {
  /**
   * @param {Object} [toolResolver=null] - Optional tool resolver for tool lookup
   */
  constructor(toolResolver = null) {
    this.toolResolver = toolResolver;
    this.soundnessChecker = new SoundnessChecker();

    // Tool registry for port definitions and executor mapping
    this.toolRegistry = new Map();

    // Compilation statistics
    this.stats = {
      totalCompilations: 0,
      successfulCompilations: 0,
      failedCompilations: 0,
      irCompilations: 0,
      taskPlanCompilations: 0,
      legacyCompilations: 0,
      portMismatches: 0,
      adaptersInserted: 0
    };
  }

  /**
   * Initialize tool registry with available tools
   * @param {Array} tools - Tools from tool resolver or MCP registry
   */
  initializeToolRegistry(tools) {
    for (const tool of (tools || [])) {
      const toolId = tool.id || tool.name;
      this.toolRegistry.set(toolId, {
        id: toolId,
        name: tool.name,
        executorType: tool.executorType || this._inferExecutorType(toolId),
        inputs: tool.inputs || [],
        outputs: tool.outputs || [],
        category: tool.category
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SDA MODE (IR): ProcessRepresentation → AOPEG DAG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * SDA Mode: Compile ProcessRepresentation (IR) into AOPEG DAG
   * This is the main compilation method for Stage 4.
   * FULLY DETERMINISTIC - no LLM calls.
   *
   * @param {ProcessRepresentation} ir - IR from Stage 3 (Task Planner)
   * @param {Object} [metadata={}] - Additional metadata
   * @returns {Object} AOPEG-compatible graph
   */
  compileFromIR(ir, metadata = {}) {
    this.stats.totalCompilations++;
    this.stats.irCompilations++;

    try {
      // 1. Validate IR soundness
      const validation = this.soundnessChecker.quickCheck(ir);
      if (!validation.sound) {
        this.stats.failedCompilations++;
        return {
          nodes: [],
          edges: [],
          compiled: false,
          mode: 'ir',
          error: `Cannot compile unsound IR: ${validation.reason}`
        };
      }

      // 2. Extract all TaskSteps from IR
      const steps = extractAllSteps(ir);
      if (steps.length === 0) {
        this.stats.failedCompilations++;
        return {
          nodes: [],
          edges: [],
          compiled: false,
          mode: 'ir',
          error: 'IR contains no executable steps'
        };
      }

      // 3. Build dependency graph
      const depGraph = buildDependencyGraph(ir);

      // 4. Get execution levels for layout
      const levels = getExecutionLevels(ir);

      // 5. Create AOPEG nodes from TaskSteps
      const nodes = this._createAOPEGNodes(steps, levels, metadata);

      // 6. Create AOPEG edges from dependencies
      const { edges, adapters } = this._createAOPEGEdges(steps, depGraph);

      // 7. Insert adapter nodes if port type mismatches exist
      if (adapters.length > 0) {
        this._insertAdapterNodes(nodes, edges, adapters);
      }

      // 8. Add START/END anchor nodes
      this._insertAnchorNodes(nodes, edges, depGraph);

      // 9. Build final AOPEG graph
      const graph = {
        id: metadata.graphId || this._generateId('graph'),
        version: 1,
        name: metadata.name || `Generated Graph - ${metadata.domain || 'unknown'}/${metadata.intent || 'unknown'}`,
        description: metadata.description || `Auto-generated from ${metadata.source || 'SDA Pipeline'}`,
        domain: metadata.domain || 'auto',
        tags: ['auto-generated', 'sda-pipeline', ...(metadata.tags || [])],
        generatedBy: 'SDA_PIPELINE_S4',

        nodes,
        edges,

        entryNodeId: 'START',
        exitNodeIds: ['END'],
        defaultParameters: metadata.defaultParameters || {},
        variables: metadata.variables || [],
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),

        metadata: {
          generator: 'SDA Pipeline v2.0 - Stage 4',
          stage: 'compiled',
          source: metadata.source || 'task-planner',
          domain: metadata.domain,
          intent: metadata.intent,
          complexity: metadata.complexity,
          irStepCount: steps.length,
          compiledNodeCount: nodes.length,
          compiledEdgeCount: edges.length
        }
      };

      this.stats.successfulCompilations++;
      return {
        ...graph,
        compiled: true,
        mode: 'ir'
      };

    } catch (error) {
      this.stats.failedCompilations++;
      return {
        nodes: [],
        edges: [],
        compiled: false,
        mode: 'ir',
        error: error.message
      };
    }
  }

  /**
   * Create AOPEG nodes from TaskSteps
   * @private
   */
  _createAOPEGNodes(steps, levels, metadata) {
    const nodes = [];
    const stepPositions = this._computePositions(levels);

    for (const step of steps) {
      // Resolve tool from registry
      const tool = this.toolRegistry.get(step.metadata?.toolId);
      const executorType = tool?.executorType ||
                          step.metadata?.toolId ||
                          CAPABILITY_TO_EXECUTOR[step.capability] ||
                          'common.passthrough';

      const node = {
        id: step.id,
        executorType,
        parameters: {
          ...(step.metadata?.config || {}),
          capability: step.capability,
          intent: step.intent
        },
        displayName: step.intent || step.id,
        description: step.metadata?.description || `Execute ${step.capability}`,
        timeout: step.metadata?.timeout || DEFAULT_TIMEOUT,
        retryPolicy: step.metadata?.retryPolicy || DEFAULT_RETRY_POLICY,
        position: stepPositions.get(step.id) || { x: 0, y: 0 },
        dataMapping: this._createDataMapping(step),
        metadata: {
          capability: step.capability,
          inputs: step.inputs,
          outputs: step.outputs,
          conditions: step.conditions,
          ...step.metadata
        }
      };

      nodes.push(node);
    }

    return nodes;
  }

  /**
   * Create AOPEG edges from dependency graph
   * @private
   */
  _createAOPEGEdges(steps, depGraph) {
    const edges = [];
    const adapters = [];
    let edgeIndex = 0;

    for (const step of steps) {
      const node = depGraph.get(step.id);
      if (!node) continue;

      // Create edges for each input dependency
      for (const input of (step.inputs || [])) {
        if (input === 'START') continue; // START handled separately

        // Find source step that produces this output
        for (const depId of node.dependencies) {
          const sourceStep = depGraph.get(depId)?.step;
          if (sourceStep && sourceStep.outputs?.includes(input)) {
            // Check port compatibility
            const compatibility = this._checkPortCompatibility(sourceStep, step, input);

            if (!compatibility.compatible) {
              this.stats.portMismatches++;
              adapters.push({
                sourceStepId: sourceStep.id,
                targetStepId: step.id,
                portName: input,
                sourceType: compatibility.sourceType,
                targetType: compatibility.targetType
              });
            }

            edges.push({
              id: `e${edgeIndex++}`,
              sourceNodeId: sourceStep.id,
              targetNodeId: step.id,
              condition: step.conditions || null,
              priority: 1,
              dataMapping: [{
                source: input,
                target: input
              }],
              label: ''
            });
          }
        }
      }
    }

    return { edges, adapters };
  }

  /**
   * Check port type compatibility
   * @private
   */
  _checkPortCompatibility(sourceStep, targetStep, portName) {
    // Get source output type
    const sourceType = sourceStep.metadata?.outputTypes?.[portName] || 'any';
    // Get target input type
    const targetType = targetStep.metadata?.inputTypes?.[portName] || 'any';

    if (sourceType === 'any' || targetType === 'any' || sourceType === targetType) {
      return { compatible: true, dataType: sourceType };
    }

    return {
      compatible: false,
      sourceType,
      targetType,
      reason: `Type mismatch: ${sourceType} → ${targetType}`
    };
  }

  /**
   * Insert adapter nodes for type conversion
   * @private
   */
  _insertAdapterNodes(nodes, edges, adapters) {
    for (const adapter of adapters) {
      this.stats.adaptersInserted++;

      const adapterId = `adapter_${adapter.sourceStepId}_${adapter.targetStepId}`;

      // Create adapter node
      nodes.push({
        id: adapterId,
        executorType: 'common.transform',
        parameters: {
          fromType: adapter.sourceType,
          toType: adapter.targetType,
          operation: 'type_cast'
        },
        displayName: `Convert ${adapter.sourceType} → ${adapter.targetType}`,
        description: `Auto-inserted adapter for port compatibility`,
        timeout: DEFAULT_TIMEOUT,
        retryPolicy: DEFAULT_RETRY_POLICY,
        position: { x: 0, y: 0 },
        dataMapping: [],
        metadata: { isAdapter: true }
      });

      // Update edges: rewire through adapter
      const originalEdge = edges.find(e =>
        e.sourceNodeId === adapter.sourceStepId &&
        e.targetNodeId === adapter.targetStepId
      );

      if (originalEdge) {
        // Change target of original edge to adapter
        originalEdge.targetNodeId = adapterId;

        // Add new edge from adapter to original target
        edges.push({
          id: `e_adapter_${adapter.targetStepId}`,
          sourceNodeId: adapterId,
          targetNodeId: adapter.targetStepId,
          condition: null,
          priority: 1,
          dataMapping: [{ source: 'output', target: adapter.portName }],
          label: ''
        });
      }
    }
  }

  /**
   * Insert START and END anchor nodes
   * @private
   */
  _insertAnchorNodes(nodes, edges, depGraph) {
    // Find entry nodes (no dependencies)
    const entryNodes = [];
    const exitNodes = [];

    for (const [stepId, node] of depGraph) {
      if (node.dependencies.length === 0) {
        entryNodes.push(stepId);
      }
      if (node.dependents.length === 0) {
        exitNodes.push(stepId);
      }
    }

    // Create START node
    nodes.unshift({
      id: 'START',
      executorType: 'common.passthrough',
      parameters: {},
      displayName: 'Start',
      description: 'Pipeline entry point',
      timeout: 5000,
      retryPolicy: { maxRetries: 0, backoffMs: 0, backoffMultiplier: 1 },
      position: { x: 0, y: 200 },
      dataMapping: [],
      metadata: { isAnchor: true, anchorType: 'start' }
    });

    // Connect START to entry nodes
    for (const entryId of entryNodes) {
      edges.unshift({
        id: `e_start_${entryId}`,
        sourceNodeId: 'START',
        targetNodeId: entryId,
        condition: null,
        priority: 1,
        dataMapping: [],
        label: ''
      });
    }

    // Create END node
    nodes.push({
      id: 'END',
      executorType: 'common.passthrough',
      parameters: {},
      displayName: 'End',
      description: 'Pipeline exit point',
      timeout: 5000,
      retryPolicy: { maxRetries: 0, backoffMs: 0, backoffMultiplier: 1 },
      position: { x: 800, y: 200 },
      dataMapping: [],
      metadata: { isAnchor: true, anchorType: 'end' }
    });

    // Connect exit nodes to END
    for (const exitId of exitNodes) {
      edges.push({
        id: `e_${exitId}_end`,
        sourceNodeId: exitId,
        targetNodeId: 'END',
        condition: null,
        priority: 1,
        dataMapping: [],
        label: ''
      });
    }
  }

  /**
   * Compute node positions based on execution levels
   * @private
   */
  _computePositions(levels) {
    const positions = new Map();

    for (let levelIndex = 0; levelIndex < levels.length; levelIndex++) {
      const level = levels[levelIndex];
      const levelX = 100 + (levelIndex + 1) * X_SPACING; // +1 to leave room for START

      // Center nodes vertically in level
      const totalHeight = (level.length - 1) * Y_SPACING;
      const startY = 200 - totalHeight / 2;

      for (let nodeIndex = 0; nodeIndex < level.length; nodeIndex++) {
        const step = level[nodeIndex];
        positions.set(step.id, {
          x: levelX,
          y: startY + nodeIndex * Y_SPACING
        });
      }
    }

    return positions;
  }

  /**
   * Create data mapping for a step
   * @private
   */
  _createDataMapping(step) {
    const mapping = [];

    for (const input of (step.inputs || [])) {
      if (input !== 'START') {
        mapping.push({ source: input, target: input });
      }
    }

    return mapping;
  }

  /**
   * Infer executor type from tool ID
   * @private
   */
  _inferExecutorType(toolId) {
    if (!toolId) return 'common.passthrough';

    const toolIdLower = toolId.toLowerCase();

    if (toolIdLower.includes('fetch') || toolIdLower.includes('get')) {
      return 'common.fetch';
    }
    if (toolIdLower.includes('store') || toolIdLower.includes('write') || toolIdLower.includes('save')) {
      return 'common.store';
    }
    if (toolIdLower.includes('transform') || toolIdLower.includes('process')) {
      return 'common.transform';
    }
    if (toolIdLower.includes('extract')) {
      return 'extraction.entities';
    }
    if (toolIdLower.includes('embed')) {
      return 'vector.embed';
    }
    if (toolIdLower.includes('search')) {
      return 'vector.search';
    }
    if (toolIdLower.includes('generate') || toolIdLower.includes('ai.')) {
      return 'ai.generate';
    }
    if (toolIdLower.includes('control') || toolIdLower.includes('condition')) {
      return 'control.condition';
    }

    return 'common.passthrough';
  }

  /**
   * Generate unique ID
   * @private
   */
  _generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SDA MODE (TaskPlan): TaskPlan → ReactFlow DAG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * SDA Mode: Compile TaskPlan into ReactFlow DAG
   * Legacy SDA mode - use compileFromIR for new code
   * @param {TaskPlan} taskPlan - Plan from Stage 3
   * @param {Object} [resolvedToolSet] - Tools from Stage 2
   * @returns {CompiledGraph}
   */
  compileFromTaskPlan(taskPlan, resolvedToolSet = null) {
    this.stats.totalCompilations++;
    this.stats.taskPlanCompilations++;

    if (!taskPlan || !taskPlan.steps || taskPlan.steps.length === 0) {
      this.stats.failedCompilations++;
      return { nodes: [], edges: [], compiled: false, mode: 'sda', error: 'Empty task plan' };
    }

    const nodes = [];
    const edges = [];
    const nodeIdMap = new Map(); // stepId → reactflow nodeId

    // 1. Create nodes from steps
    for (const step of taskPlan.steps) {
      const nodeId = `node_${step.id}`;
      nodeIdMap.set(step.id, nodeId);

      // Resolve tool — verify it exists
      const tool = this._findTool(step.suggestedTool, resolvedToolSet);

      nodes.push({
        id: nodeId,
        type: 'graphNode',
        data: {
          label: step.description || step.suggestedTool,
          toolId: tool ? this._getToolId(tool) : step.suggestedTool,
          nodeType: this._inferNodeType(step, tool),
          config: step.inputMapping || {},
          outputKeys: step.outputKeys || []
        },
        position: { x: 0, y: 0 } // will be set by layout
      });
    }

    // 2. Create edges from dependencies
    for (const dep of (taskPlan.dependencies || [])) {
      const sourceId = nodeIdMap.get(dep.from);
      const targetId = nodeIdMap.get(dep.to);

      if (sourceId && targetId) {
        edges.push({
          id: `edge_${dep.from}_${dep.to}`,
          source: sourceId,
          target: targetId,
          label: dep.label || undefined,
          type: dep.conditional ? 'conditional' : 'default'
        });
      }
    }

    // 3. Handle parallel groups — insert fork/join nodes
    if (taskPlan.parallelGroups && taskPlan.parallelGroups.length > 0) {
      this._insertParallelStructure(nodes, edges, taskPlan.parallelGroups, nodeIdMap);
    }

    // 4. Ensure entry/exit nodes
    this._ensureEntryExit(nodes, edges);

    // 5. Apply topological layout
    this._applyLayout(nodes, edges);

    this.stats.successfulCompilations++;
    return { nodes, edges, compiled: true, mode: 'sda' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGACY MODE: Raw LLM output → Normalized DAG
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Legacy Mode: Normalize raw LLM output
   * Works with current callClaudeForGraph output
   * @param {Array} rawNodes - Raw nodes from LLM
   * @param {Array} rawEdges - Raw edges from LLM
   * @returns {CompiledGraph}
   */
  compileFromRawLLM(rawNodes, rawEdges) {
    this.stats.totalCompilations++;
    this.stats.legacyCompilations++;

    if (!rawNodes || rawNodes.length === 0) {
      this.stats.failedCompilations++;
      return { nodes: [], edges: [], compiled: false, mode: 'legacy', error: 'No nodes provided' };
    }

    // Normalize nodes
    const nodes = rawNodes.map((n, i) => ({
      id: n.id || `node_${i}`,
      type: n.type || 'graphNode',
      data: {
        label: n.data?.label || n.label || `Node ${i}`,
        toolId: n.data?.toolId || n.toolId || 'unknown',
        nodeType: n.data?.nodeType || this._inferNodeTypeFromToolId(n.data?.toolId || n.toolId),
        config: n.data?.config || {},
        ...this._extractDataFields(n.data)
      },
      position: n.position || { x: 0, y: 0 }
    }));

    // Normalize edges
    const edges = (rawEdges || []).map((e, i) => ({
      id: e.id || `edge_${i}`,
      source: e.source,
      target: e.target,
      label: e.label || undefined,
      type: e.type || 'default',
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle
    }));

    // Normalize: ensure unique IDs, valid references, layout
    this._deduplicateIds(nodes, edges);
    this._removeInvalidEdges(nodes, edges);
    this._ensureEntryExit(nodes, edges);

    if (this._needsRelayout(nodes)) {
      this._applyLayout(nodes, edges);
    }

    this.stats.successfulCompilations++;
    return { nodes, edges, compiled: true, mode: 'legacy' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NODE TYPE INFERENCE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Infer node type from step and tool
   * @private
   */
  _inferNodeType(step, tool) {
    if (step.isConditional) return NODE_TYPES.CONDITION;
    if (!tool) return NODE_TYPES.EXECUTOR;

    const toolId = this._getToolId(tool);
    return this._inferNodeTypeFromToolId(toolId);
  }

  /**
   * Infer node type from tool ID
   * @private
   */
  _inferNodeTypeFromToolId(toolId) {
    if (!toolId) return NODE_TYPES.EXECUTOR;

    const toolIdLower = toolId.toLowerCase();

    // Control flow → condition
    if (toolIdLower.startsWith('control.') ||
        toolIdLower.includes('condition') ||
        toolIdLower.includes('switch') ||
        toolIdLower.includes('loop') ||
        toolIdLower.includes('parallel')) {
      return NODE_TYPES.CONDITION;
    }

    // AI tools → ai
    if (toolIdLower.startsWith('ai.') ||
        toolIdLower.includes('generate') ||
        toolIdLower.includes('classify') ||
        toolIdLower.includes('llm') ||
        toolIdLower.includes('gnn')) {
      return NODE_TYPES.AI;
    }

    // Input tools → input
    if (toolIdLower.startsWith('primitive.get') ||
        toolIdLower.includes('input') ||
        toolIdLower.includes('read') ||
        toolIdLower.includes('load') ||
        toolIdLower === 'start') {
      return NODE_TYPES.INPUT;
    }

    // Output/storage tools → output
    if (toolIdLower.startsWith('vector.write') ||
        toolIdLower.startsWith('graph.create') ||
        toolIdLower.startsWith('graph.update') ||
        toolIdLower.startsWith('primitive.set') ||
        toolIdLower.includes('save') ||
        toolIdLower.includes('store') ||
        toolIdLower === 'end') {
      return NODE_TYPES.OUTPUT;
    }

    // Default to executor
    return NODE_TYPES.EXECUTOR;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PARALLEL STRUCTURE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Insert fork/join nodes for parallel groups
   * @private
   */
  _insertParallelStructure(nodes, edges, parallelGroups, nodeIdMap) {
    for (let gi = 0; gi < parallelGroups.length; gi++) {
      const group = parallelGroups[gi];
      if (group.length < 2) continue;

      const forkId = `fork_${gi}`;
      const joinId = `join_${gi}`;

      // Add fork node
      nodes.push({
        id: forkId,
        type: 'graphNode',
        data: {
          label: 'Fork',
          toolId: 'control.parallel',
          nodeType: NODE_TYPES.CONDITION,
          config: { type: 'fork' }
        },
        position: { x: 0, y: 0 }
      });

      // Add join node
      nodes.push({
        id: joinId,
        type: 'graphNode',
        data: {
          label: 'Join',
          toolId: 'control.parallel',
          nodeType: NODE_TYPES.CONDITION,
          config: { type: 'join' }
        },
        position: { x: 0, y: 0 }
      });

      // Re-wire: fork → each parallel node → join
      for (const stepId of group) {
        const nodeId = nodeIdMap.get(stepId);
        if (!nodeId) continue;

        // Fork → parallel node
        edges.push({
          id: `edge_fork_${gi}_${stepId}`,
          source: forkId,
          target: nodeId,
          type: 'default'
        });

        // Parallel node → join
        edges.push({
          id: `edge_${stepId}_join_${gi}`,
          source: nodeId,
          target: joinId,
          type: 'default'
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTRY/EXIT NORMALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ensure single entry and exit points
   * @private
   */
  _ensureEntryExit(nodes, edges) {
    if (nodes.length === 0) return;

    const targets = new Set(edges.map(e => e.target));
    const sources = new Set(edges.map(e => e.source));

    // Nodes with no incoming edges = entry candidates
    const entryNodes = nodes.filter(n => !targets.has(n.id));
    // Nodes with no outgoing edges = exit candidates
    const exitNodes = nodes.filter(n => !sources.has(n.id));

    // If multiple entries — add START node
    if (entryNodes.length > 1) {
      const startId = 'node_START';
      const existingStart = nodes.find(n => n.id === startId);

      if (!existingStart) {
        nodes.unshift({
          id: startId,
          type: 'graphNode',
          data: {
            label: 'START',
            toolId: 'start',
            nodeType: NODE_TYPES.INPUT
          },
          position: { x: 0, y: 0 }
        });

        for (const entry of entryNodes) {
          edges.push({
            id: `edge_start_${entry.id}`,
            source: startId,
            target: entry.id,
            type: 'default'
          });
        }
      }
    }

    // If multiple exits — add END node
    if (exitNodes.length > 1) {
      const endId = 'node_END';
      const existingEnd = nodes.find(n => n.id === endId);

      if (!existingEnd) {
        nodes.push({
          id: endId,
          type: 'graphNode',
          data: {
            label: 'END',
            toolId: 'end',
            nodeType: NODE_TYPES.OUTPUT
          },
          position: { x: 0, y: 0 }
        });

        for (const exit of exitNodes) {
          edges.push({
            id: `edge_${exit.id}_end`,
            source: exit.id,
            target: endId,
            type: 'default'
          });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYOUT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Apply topological layout using Kahn's algorithm
   * @private
   */
  _applyLayout(nodes, edges) {
    if (nodes.length === 0) return;

    // Build adjacency and in-degree maps
    const adj = new Map();
    const inDegree = new Map();

    for (const n of nodes) {
      adj.set(n.id, []);
      inDegree.set(n.id, 0);
    }

    for (const e of edges) {
      if (adj.has(e.source) && inDegree.has(e.target)) {
        adj.get(e.source).push(e.target);
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      }
    }

    // Kahn's algorithm for layer assignment
    const queue = [];
    const layer = new Map();

    for (const [id, deg] of inDegree) {
      if (deg === 0) {
        queue.push(id);
        layer.set(id, 0);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift();
      const currentLayer = layer.get(current);

      for (const next of (adj.get(current) || [])) {
        const newLayer = currentLayer + 1;
        layer.set(next, Math.max(layer.get(next) || 0, newLayer));

        inDegree.set(next, inDegree.get(next) - 1);
        if (inDegree.get(next) === 0) {
          queue.push(next);
        }
      }
    }

    // Handle nodes not in any layer (disconnected or in cycles)
    let maxLayer = 0;
    for (const [, l] of layer) {
      maxLayer = Math.max(maxLayer, l);
    }
    for (const n of nodes) {
      if (!layer.has(n.id)) {
        maxLayer++;
        layer.set(n.id, maxLayer);
      }
    }

    // Position: layers on Y axis, spread on X within layer
    const layerNodes = new Map(); // layer → nodeIds[]
    for (const [id, l] of layer) {
      if (!layerNodes.has(l)) layerNodes.set(l, []);
      layerNodes.get(l).push(id);
    }

    for (const [l, nodeIds] of layerNodes) {
      const totalWidth = (nodeIds.length - 1) * X_SPACING;
      const startX = -totalWidth / 2;

      for (let i = 0; i < nodeIds.length; i++) {
        const node = nodes.find(n => n.id === nodeIds[i]);
        if (node) {
          node.position = {
            x: startX + i * X_SPACING,
            y: l * Y_SPACING
          };
        }
      }
    }
  }

  /**
   * Check if relayout is needed
   * @private
   */
  _needsRelayout(nodes) {
    if (nodes.length === 0) return false;

    // If all positions are {0,0} or too close together — relayout
    const positions = nodes.map(n => n.position);
    if (positions.every(p => p.x === 0 && p.y === 0)) return true;

    const uniquePositions = new Set(positions.map(p => `${p.x},${p.y}`));
    return uniquePositions.size < nodes.length * 0.5; // >50% overlap
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMALIZATION HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Deduplicate node and edge IDs
   * @private
   */
  _deduplicateIds(nodes, edges) {
    const seenNodeIds = new Set();
    for (const node of nodes) {
      if (seenNodeIds.has(node.id)) {
        node.id = `${node.id}_dup_${Math.random().toString(36).slice(2, 6)}`;
      }
      seenNodeIds.add(node.id);
    }

    const seenEdgeIds = new Set();
    for (const edge of edges) {
      if (seenEdgeIds.has(edge.id)) {
        edge.id = `${edge.id}_dup_${Math.random().toString(36).slice(2, 6)}`;
      }
      seenEdgeIds.add(edge.id);
    }
  }

  /**
   * Remove edges with invalid source/target references
   * @private
   */
  _removeInvalidEdges(nodes, edges) {
    const nodeIds = new Set(nodes.map(n => n.id));

    // Remove in-place
    for (let i = edges.length - 1; i >= 0; i--) {
      if (!nodeIds.has(edges[i].source) || !nodeIds.has(edges[i].target)) {
        edges.splice(i, 1);
      }
    }
  }

  /**
   * Extract additional data fields (preserve unknown fields)
   * @private
   */
  _extractDataFields(data) {
    if (!data) return {};

    const reserved = ['label', 'toolId', 'nodeType', 'config'];
    const result = {};

    for (const [key, value] of Object.entries(data)) {
      if (!reserved.includes(key)) {
        result[key] = value;
      }
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Find tool in resolved tool set
   * @private
   */
  _findTool(suggestedToolId, resolvedToolSet) {
    if (!resolvedToolSet?.tools) return null;
    return resolvedToolSet.tools.find(t => this._getToolId(t) === suggestedToolId);
  }

  /**
   * Get tool ID from tool object
   * @private
   */
  _getToolId(tool) {
    if (!tool) return '';
    return tool.name || tool.id || tool.toolId || '';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATISTICS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get compilation statistics for a graph
   * @param {CompiledGraph} compiled - Compiled graph
   * @returns {Object} Statistics
   */
  getStats(compiled) {
    if (!compiled || !compiled.nodes) {
      return { nodeCount: 0, edgeCount: 0, nodeTypes: {}, avgDegree: 0 };
    }

    const nodeTypes = {};
    for (const node of compiled.nodes) {
      const type = node.data?.nodeType || node.executorType || 'unknown';
      nodeTypes[type] = (nodeTypes[type] || 0) + 1;
    }

    const avgDegree = compiled.edges.length > 0
      ? (compiled.edges.length * 2) / compiled.nodes.length
      : 0;

    return {
      nodeCount: compiled.nodes.length,
      edgeCount: compiled.edges.length,
      nodeTypes,
      avgDegree: Math.round(avgDegree * 100) / 100,
      mode: compiled.mode,
      compiled: compiled.compiled
    };
  }

  /**
   * Get compiler-level statistics
   * @returns {Object} Compiler statistics
   */
  getCompilerStats() {
    return {
      ...this.stats,
      successRate: this.stats.totalCompilations > 0
        ? ((this.stats.successfulCompilations / this.stats.totalCompilations) * 100).toFixed(1) + '%'
        : '0%',
      toolsRegistered: this.toolRegistry.size
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXPORT METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export AOPEG graph to ReactFlow format
   * @param {Object} aopegGraph - AOPEG graph from compileFromIR
   * @returns {Object} ReactFlow-compatible graph
   */
  exportToReactFlow(aopegGraph) {
    if (!aopegGraph || !aopegGraph.nodes) {
      return { nodes: [], edges: [] };
    }

    const nodes = aopegGraph.nodes.map(n => ({
      id: n.id,
      type: this._getReactFlowNodeType(n),
      data: {
        label: n.displayName || n.id,
        toolId: n.executorType,
        nodeType: this._inferNodeTypeFromToolId(n.executorType),
        config: n.parameters || {},
        ...n.metadata
      },
      position: n.position || { x: 0, y: 0 }
    }));

    const edges = aopegGraph.edges.map(e => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      sourceHandle: e.dataMapping?.[0]?.source,
      targetHandle: e.dataMapping?.[0]?.target,
      type: e.condition ? 'conditional' : 'smoothstep',
      animated: e.sourceNodeId === 'START' || e.targetNodeId === 'END',
      label: e.label || undefined,
      data: {
        condition: e.condition,
        priority: e.priority
      }
    }));

    return { nodes, edges };
  }

  /**
   * Get ReactFlow node type from AOPEG node
   * @private
   */
  _getReactFlowNodeType(aopegNode) {
    if (aopegNode.metadata?.isAnchor) {
      return 'anchorNode';
    }
    if (aopegNode.metadata?.isAdapter) {
      return 'adapterNode';
    }
    return 'graphNode';
  }

  /**
   * Export AOPEG graph to Mermaid diagram format
   * @param {Object} aopegGraph - AOPEG graph
   * @returns {string} Mermaid diagram code
   */
  exportToMermaid(aopegGraph) {
    if (!aopegGraph || !aopegGraph.nodes) {
      return 'graph LR\n  A[Empty Graph]';
    }

    let mermaid = 'graph LR\n';

    // Add nodes with styling
    for (const node of aopegGraph.nodes) {
      const label = node.displayName || node.id;
      const safeLabel = label.replace(/"/g, "'");

      if (node.metadata?.isAnchor) {
        mermaid += `  ${node.id}(("${safeLabel}"))\n`;
      } else if (node.metadata?.isAdapter) {
        mermaid += `  ${node.id}[/"${safeLabel}"/]\n`;
      } else if (node.executorType?.startsWith('ai.')) {
        mermaid += `  ${node.id}[["${safeLabel}"]]\n`;
      } else if (node.executorType?.startsWith('control.')) {
        mermaid += `  ${node.id}{"${safeLabel}"}\n`;
      } else {
        mermaid += `  ${node.id}["${safeLabel}"]\n`;
      }
    }

    mermaid += '\n';

    // Add edges
    for (const edge of aopegGraph.edges) {
      if (edge.condition) {
        mermaid += `  ${edge.sourceNodeId} -->|"${edge.label || 'condition'}"|${edge.targetNodeId}\n`;
      } else {
        mermaid += `  ${edge.sourceNodeId} --> ${edge.targetNodeId}\n`;
      }
    }

    // Add styling
    mermaid += '\n';
    mermaid += '  style START fill:#90EE90\n';
    mermaid += '  style END fill:#FFB6C1\n';

    return mermaid;
  }

  /**
   * Export AOPEG graph to DOT format (Graphviz)
   * @param {Object} aopegGraph - AOPEG graph
   * @returns {string} DOT diagram code
   */
  exportToDOT(aopegGraph) {
    if (!aopegGraph || !aopegGraph.nodes) {
      return 'digraph G {\n  empty [label="Empty Graph"]\n}';
    }

    let dot = 'digraph G {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n\n';

    // Add nodes
    for (const node of aopegGraph.nodes) {
      const label = (node.displayName || node.id).replace(/"/g, '\\"');
      let shape = 'box';
      let style = '';

      if (node.metadata?.isAnchor) {
        shape = 'ellipse';
        style = 'style=filled, fillcolor=lightgreen';
      } else if (node.metadata?.isAdapter) {
        shape = 'parallelogram';
        style = 'style=filled, fillcolor=lightyellow';
      } else if (node.executorType?.startsWith('ai.')) {
        shape = 'box';
        style = 'style=filled, fillcolor=lightblue';
      } else if (node.executorType?.startsWith('control.')) {
        shape = 'diamond';
      }

      dot += `  ${node.id} [label="${label}", shape=${shape}${style ? ', ' + style : ''}];\n`;
    }

    dot += '\n';

    // Add edges
    for (const edge of aopegGraph.edges) {
      const label = edge.label ? ` [label="${edge.label}"]` : '';
      dot += `  ${edge.sourceNodeId} -> ${edge.targetNodeId}${label};\n`;
    }

    dot += '}\n';
    return dot;
  }

  /**
   * Export to JSON (for persistence)
   * @param {Object} aopegGraph - AOPEG graph
   * @param {boolean} [pretty=true] - Pretty print JSON
   * @returns {string} JSON string
   */
  exportToJSON(aopegGraph, pretty = true) {
    return JSON.stringify(aopegGraph, null, pretty ? 2 : 0);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create GraphCompiler instance
 * @param {Object} [toolResolver=null] - Optional tool resolver
 * @returns {GraphCompiler}
 */
function createGraphCompiler(toolResolver = null) {
  return new GraphCompiler(toolResolver);
}

// Singleton instance
const graphCompiler = new GraphCompiler();

module.exports = {
  GraphCompiler,
  createGraphCompiler,
  graphCompiler,
  NODE_TYPES,
  CAPABILITY_TO_EXECUTOR
};

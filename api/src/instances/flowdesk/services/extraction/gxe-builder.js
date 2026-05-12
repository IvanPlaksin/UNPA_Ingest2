/**
 * GXE Graph Builder
 *
 * Utilities for programmatic construction of GXE-compatible graphs.
 * Creates ReactFlow-compatible nodes and edges with proper tool bindings.
 *
 * @module services/workspace/extraction/flowdesk/gxe-builder
 */

'use strict';

const NODE_TYPES = {
  START: 'start', END: 'end', ACTION: 'action',
  CONDITION: 'condition', SWITCH: 'switch',
  PARALLEL: 'parallel', MERGE: 'merge', SUBGRAPH: 'subgraph'
};

const EDGE_TYPES = {
  DEFAULT: 'default', CONDITIONAL: 'conditional',
  TRUE: 'true', FALSE: 'false'
};

const GRID_X = 250;
const GRID_Y = 150;
const START_X = 100;
const START_Y = 100;

class GxeGraphBuilder {
  constructor(options = {}) {
    this.nodes = [];
    this.edges = [];
    this.nodeIndex = 0;
    this.currentY = START_Y;
    this.namespace = options.namespace || 'FLOWDESK';
    this.metadata = { createdAt: new Date().toISOString(), generator: 'flowdesk-extractor', ...options.metadata };
  }

  addStartNode(label = 'Start', config = {}) {
    const node = this._createNode({ type: NODE_TYPES.START, label, tool: 'workflow.start', config: { inputs: config.inputs || [], ...config } });
    this.currentY += GRID_Y;
    return node;
  }

  addEndNode(label = 'End', config = {}) {
    return this._createNode({ type: NODE_TYPES.END, label, tool: 'workflow.end', config: { outputs: config.outputs || [], ...config } });
  }

  addActionNode(label, tool, config = {}) {
    const node = this._createNode({ type: NODE_TYPES.ACTION, label, tool, config });
    this.currentY += GRID_Y;
    return node;
  }

  addConditionNode(label, expression, config = {}) {
    const node = this._createNode({ type: NODE_TYPES.CONDITION, label, tool: 'workflow.condition', config: { expression, evaluator: 'javascript', ...config } });
    this.currentY += GRID_Y;
    return node;
  }

  addSwitchNode(label, switchOn, cases = [], config = {}) {
    const node = this._createNode({
      type: NODE_TYPES.SWITCH, label, tool: 'workflow.switch',
      config: { switchOn, cases: cases.map(c => ({ value: c.value, label: c.label || c.value })), defaultCase: config.defaultCase || 'default', ...config }
    });
    this.currentY += GRID_Y;
    return node;
  }

  addSetValueNode(label, assignments = []) {
    const node = this._createNode({
      type: NODE_TYPES.ACTION, label, tool: 'workflow.setValue',
      config: { assignments: assignments.map(a => ({ target: a.target, value: a.value, expression: a.expression })) }
    });
    this.currentY += GRID_Y;
    return node;
  }

  addSubgraphNode(label, graphId, inputMapping = {}, outputMapping = {}) {
    const node = this._createNode({ type: NODE_TYPES.SUBGRAPH, label, tool: 'workflow.subgraph', config: { graphId, inputMapping, outputMapping } });
    this.currentY += GRID_Y;
    return node;
  }

  // ── EDGES ─────────────────────────────────────────────

  connect(sourceId, targetId, label = '', type = EDGE_TYPES.DEFAULT) {
    const edge = { id: `edge-${sourceId}-${targetId}-${this.edges.length}`, source: sourceId, target: targetId, label, type, data: { label, edgeType: type } };
    this.edges.push(edge);
    return edge;
  }

  connectCondition(condNodeId, trueId, falseId) {
    this.connect(condNodeId, trueId, 'true', EDGE_TYPES.TRUE);
    this.connect(condNodeId, falseId, 'false', EDGE_TYPES.FALSE);
  }

  connectSwitch(switchNodeId, caseTargets, defaultTargetId = null) {
    for (const [val, targetId] of Object.entries(caseTargets)) {
      this.connect(switchNodeId, targetId, val, EDGE_TYPES.CONDITIONAL);
    }
    if (defaultTargetId) this.connect(switchNodeId, defaultTargetId, 'default', EDGE_TYPES.DEFAULT);
  }

  connectSequence(nodeIds) {
    for (let i = 0; i < nodeIds.length - 1; i++) this.connect(nodeIds[i], nodeIds[i + 1]);
  }

  // ── LAYOUT ────────────────────────────────────────────

  autoLayout() {
    const levels = {};
    const visited = new Set();
    const startNodes = this.nodes.filter(n => n.type === NODE_TYPES.START || !this.edges.some(e => e.target === n.id));

    const assign = (nodeId, level) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      if (!levels[level]) levels[level] = [];
      levels[level].push(nodeId);
      this.edges.filter(e => e.source === nodeId).forEach(e => assign(e.target, level + 1));
    };
    startNodes.forEach(n => assign(n.id, 0));

    for (const [level, nodeIds] of Object.entries(levels)) {
      const y = START_Y + parseInt(level) * GRID_Y;
      nodeIds.forEach((id, idx) => {
        const node = this.nodes.find(n => n.id === id);
        if (node) node.position = { x: START_X + (idx - (nodeIds.length - 1) / 2) * GRID_X, y };
      });
    }
    return this;
  }

  // ── BUILD ─────────────────────────────────────────────

  build(name, description = '') {
    const startNode = this.nodes.find(n => n.type === NODE_TYPES.START);
    const requiredParams = startNode?.data?.config?.inputs?.map(i => ({
      name: i.name || i, type: i.type || 'string', required: i.required !== false
    })) || [];

    return {
      name, description, namespace: this.namespace, type: 'executable',
      nodes: this.nodes, edges: this.edges,
      metadata: this.metadata, requiredParams, version: '1.0.0'
    };
  }

  // ── PRIVATE ───────────────────────────────────────────

  _createNode({ type, label, tool, config }) {
    const id = `node-${type}-${this.nodeIndex++}`;
    const node = { id, type, position: { x: START_X, y: this.currentY }, data: { label, tool, config: config || {} } };
    this.nodes.push(node);
    return node;
  }

  // ── STATIC HELPERS ────────────────────────────────────

  static createLinearGraph(name, steps, options = {}) {
    const b = new GxeGraphBuilder(options);
    const start = b.addStartNode('Start', { inputs: options.inputs || [] });
    let prev = start;
    for (const step of steps) {
      const n = b.addActionNode(step.label, step.tool, step.config);
      b.connect(prev.id, n.id);
      prev = n;
    }
    const end = b.addEndNode('End', { outputs: options.outputs || [] });
    b.connect(prev.id, end.id);
    return b.build(name, options.description);
  }

  static createDecisionTableGraph(name, { switchOn, cases, actions }, options = {}) {
    const b = new GxeGraphBuilder(options);
    const start = b.addStartNode('Start', { inputs: [{ name: switchOn, type: 'string', required: true }] });
    const sw = b.addSwitchNode(`Switch on ${switchOn}`, switchOn, cases.map(c => ({ value: c.value, label: c.label })));
    b.connect(start.id, sw.id);
    const end = b.addEndNode('End');
    const caseTargets = {};

    for (const c of cases) {
      const n = b.addSetValueNode(`Set ${c.label}`, c.assignments || actions?.[c.value] || []);
      caseTargets[c.value] = n.id;
      b.connect(n.id, end.id);
    }

    if (options.defaultAssignments) {
      const def = b.addSetValueNode('Default', options.defaultAssignments);
      b.connectSwitch(sw.id, caseTargets, def.id);
      b.connect(def.id, end.id);
    } else {
      b.connectSwitch(sw.id, caseTargets);
    }

    b.autoLayout();
    return b.build(name, options.description);
  }

  static createPipelineGraph(name, stages, options = {}) {
    const b = new GxeGraphBuilder(options);
    const start = b.addStartNode('Start', { inputs: options.inputs || [] });
    let prev = start;

    for (const stage of stages) {
      if (stage.condition) {
        const cond = b.addConditionNode(stage.conditionLabel || `Check ${stage.name}`, stage.condition);
        b.connect(prev.id, cond.id);
        const action = b.addActionNode(stage.name, stage.tool, stage.config);
        b.connect(cond.id, action.id, 'true', EDGE_TYPES.TRUE);
        prev = action;
      } else {
        const action = b.addActionNode(stage.name, stage.tool, stage.config);
        b.connect(prev.id, action.id);
        prev = action;
      }
    }

    const end = b.addEndNode('End', { outputs: options.outputs || [] });
    b.connect(prev.id, end.id);
    b.autoLayout();
    return b.build(name, options.description);
  }
}

module.exports = { GxeGraphBuilder, NODE_TYPES, EDGE_TYPES };

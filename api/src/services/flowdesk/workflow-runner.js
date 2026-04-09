'use strict';

/**
 * FlowDesk Workflow Runner — simplified GXE executor for MVP.
 * Executes graph definitions synchronously with conditional routing.
 */

const crypto = require('crypto');
const { executors } = require('./executors');
const { loadGraph: loadGraphFromStore } = require('./graph-loader');

class FlowDeskWorkflowRunner {
  constructor() {
    this.executorMap = new Map();
    this.activeWorkflows = new Map();
    this.graphCache = new Map();
  }

  init() {
    for (const exec of executors) {
      this.executorMap.set(exec.id, exec);
    }
    console.log(`[FlowDesk] WorkflowRunner initialized: ${this.executorMap.size} executors`);
  }

  async loadGraph(graphId) {
    if (this.graphCache.has(graphId)) return this.graphCache.get(graphId);
    const graph = await loadGraphFromStore(graphId);
    this.graphCache.set(graphId, graph);
    return graph;
  }

  getWorkflow(workflowId) {
    return this.activeWorkflows.get(workflowId) || null;
  }

  getAllWorkflows() {
    return [...this.activeWorkflows.values()].sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  async spawn(graphId, initialInput) {
    const graph = await this.loadGraph(graphId);
    if (!graph) throw new Error(`Graph not found: ${graphId}`);

    const workflowId = 'WF-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const workflow = {
      id: workflowId,
      graphId,
      graphName: graph.name,
      status: 'RUNNING',
      state: {},
      input: initialInput,
      history: [],
      createdAt: new Date().toISOString(),
      completedAt: null,
      error: null,
    };

    this.activeWorkflows.set(workflowId, workflow);
    console.log(`[FlowDesk] Workflow ${workflowId} spawned for graph: ${graph.name}`);

    try {
      await this.executeWorkflow(workflow, graph);
      workflow.status = 'COMPLETED';
      workflow.completedAt = new Date().toISOString();
    } catch (err) {
      workflow.status = 'FAILED';
      workflow.error = err.message;
      workflow.completedAt = new Date().toISOString();
      console.error(`[FlowDesk] Workflow ${workflowId} FAILED: ${err.message}`);
    }

    return {
      workflowId,
      status: workflow.status,
      result: workflow.state,
      history: workflow.history,
      error: workflow.error,
    };
  }

  async executeWorkflow(workflow, graph) {
    // Find start node: type='start' or executor='workflow.start', or fallback to START edge
    const startNode = graph.nodes.find(n => n.type === 'start' || n.executor === 'workflow.start');
    let currentNodeId;
    if (startNode) {
      currentNodeId = startNode.id;
    } else {
      const startEdge = graph.edges.find(e => e.from === 'START');
      if (!startEdge) throw new Error('No start node or START edge in graph');
      currentNodeId = startEdge.to;
    }

    // Find end node ID for termination check
    const endNode = graph.nodes.find(n => n.type === 'end' || n.executor === 'workflow.end');
    const endNodeId = endNode?.id || 'END';

    while (currentNodeId && currentNodeId !== 'END' && currentNodeId !== endNodeId) {
      const nodeDef = graph.nodes.find(n => n.id === currentNodeId);
      if (!nodeDef) {
        console.log(`[FlowDesk] Node ${currentNodeId} not found, ending`);
        break;
      }

      // Handle workflow.start — passthrough input params
      if (nodeDef.executor === 'workflow.start') {
        workflow.history.push({
          node: currentNodeId, executor: 'workflow.start', success: true,
          condition: null, elapsed_ms: 0, timestamp: new Date().toISOString(),
        });
        const outEdges = graph.edges.filter(e => e.from === currentNodeId);
        currentNodeId = outEdges[0]?.to;
        continue;
      }

      // Handle workflow.end — finalize
      if (nodeDef.executor === 'workflow.end') {
        workflow.history.push({
          node: currentNodeId, executor: 'workflow.end', success: true,
          condition: null, elapsed_ms: 0, timestamp: new Date().toISOString(),
        });
        break;
      }

      const executor = this.executorMap.get(nodeDef.executor);
      if (!executor) throw new Error(`Executor not found: ${nodeDef.executor}`);

      const startTime = Date.now();
      console.log(`[FlowDesk]   → ${currentNodeId} (${executor.name})`);

      const result = await executor.execute(
        { input: workflow.input, state: workflow.state },
        nodeDef.config || {}
      );

      workflow.state[currentNodeId] = result.output;
      workflow.history.push({
        node: currentNodeId,
        executor: nodeDef.executor,
        success: result.success,
        condition: result.condition || null,
        elapsed_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });

      // Determine next node
      const outEdges = graph.edges.filter(e => e.from === currentNodeId);
      if (outEdges.length === 0) break;

      // If executor returned a condition, follow matching conditional edge
      if (result.condition) {
        const condEdge = outEdges.find(e => e.condition === result.condition);
        if (condEdge) {
          currentNodeId = condEdge.to;
          continue;
        }
      }

      // Otherwise follow default (no-condition) edge
      const defaultEdge = outEdges.find(e => !e.condition);
      currentNodeId = defaultEdge ? defaultEdge.to : outEdges[0].to;
    }
  }
}

// Singleton
const runner = new FlowDeskWorkflowRunner();

module.exports = runner;

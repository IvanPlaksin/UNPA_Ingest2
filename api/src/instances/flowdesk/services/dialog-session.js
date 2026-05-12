'use strict';

/**
 * Dialog Session Manager — manages stateful conversation sessions.
 *
 * Each session tracks: current graph, current node, dialog state, history.
 * Processes user messages through dialog graph executors.
 */

const routing = require('./graph-routing.js');
const { loadGraph: loadGraphFromStore } = require('./graph-loader.js');

// Dialog executor registry
const DIALOG_EXECUTORS = new Map();
const executorFiles = [
  './executors/dialog/classify-intent',
  './executors/dialog/clarify-intent',
  './executors/dialog/open-query',
  './executors/dialog/check-location',
  './executors/dialog/ask-location',
  './executors/dialog/select-location',
  './executors/dialog/ask-beneficiary',
  './executors/dialog/find-user',
  './executors/dialog/confirm-request',
  './executors/dialog/spawn-process',
];

for (const file of executorFiles) {
  const exec = require(file);
  DIALOG_EXECUTORS.set(exec.id, exec);
}

class DialogSessionManager {
  constructor() {
    this.sessions = new Map();
  }

  async loadGraph(graphId) {
    return await loadGraphFromStore(graphId);
  }

  async getOrCreateSession(sessionId, userId) {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId);
    }

    // Load user context
    await routing.init();
    let userContext = null;
    try {
      userContext = await routing.getUserContext(userId);
    } catch (err) {
      console.error('[DialogSession] getUserContext error:', err.message);
    }

    const session = {
      id: sessionId,
      userId,
      userContext,
      currentGraph: null,
      currentNode: null,
      state: {
        intent: null,
        service_code: null,
        service_name: null,
        location: null,
        location_candidates: null,
        beneficiary: null,
        beneficiary_type: null,
        justification: null,
        confirmed: false,
      },
      history: [],
      executionLog: [],
      createdAt: new Date().toISOString(),
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  endSession(sessionId) {
    this.sessions.delete(sessionId);
  }

  async processMessage(sessionId, userMessage) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // Record user message
    session.history.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });

    // If no graph active, start intake dialog
    if (!session.currentGraph) {
      session.currentGraph = 'flowdesk.dialog.intake';
      const graph = await this.loadGraph(session.currentGraph);
      if (!graph) throw new Error(`Dialog graph not found: ${session.currentGraph}`);
      // Find start node: WF-START or first node after workflow.start
      const startNode = graph.nodes.find(n => n.type === 'start' || n.executor === 'workflow.start');
      if (startNode) {
        const startEdge = graph.edges.find(e => e.from === startNode.id);
        session.currentNode = startEdge?.to || graph.nodes.find(n => n.id !== startNode.id)?.id;
      } else {
        session.currentNode = graph.nodes[0]?.id || 'D1-CLASSIFY';
      }
    }

    const graph = await this.loadGraph(session.currentGraph);
    if (!graph) throw new Error(`Dialog graph not found: ${session.currentGraph}`);

    // Execute nodes, chaining through silent auto-advance nodes.
    // Collects ALL responses into an array. Stops only on _wait or END.
    const responses = [];
    let choices = null; // last choices from a _wait node
    let spawnResult = null;
    const MAX_STEPS = 10;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (!session.currentNode || session.currentNode === 'END' || session.currentNode === 'WF-END') break;

      const nodeDef = graph.nodes.find(n => n.id === session.currentNode);
      if (!nodeDef) {
        console.error(`[DialogSession] Node ${session.currentNode} not found`);
        break;
      }

      // Skip workflow.start / workflow.end nodes — auto-advance
      if (nodeDef.executor === 'workflow.start' || nodeDef.executor === 'workflow.end') {
        if (nodeDef.executor === 'workflow.end') break;
        const outEdges = graph.edges.filter(e => e.from === session.currentNode);
        session.currentNode = outEdges[0]?.to;
        userMessage = null;
        continue;
      }

      const executor = DIALOG_EXECUTORS.get(nodeDef.executor);
      if (!executor) {
        console.error(`[DialogSession] Executor ${nodeDef.executor} not found`);
        break;
      }

      const startTime = Date.now();
      const result = await executor.execute({
        userInput: userMessage,
        state: session.state,
        userContext: session.userContext,
        userId: session.userId,
        history: session.history,
      });
      const elapsed = Date.now() - startTime;

      session.executionLog.push({
        node: session.currentNode,
        executor: nodeDef.executor,
        condition: result.condition,
        elapsed_ms: elapsed,
        timestamp: new Date().toISOString(),
      });

      if (result.state_updates) {
        Object.assign(session.state, result.state_updates);
      }

      if (result.response) {
        responses.push(result.response);
      }

      if (result.choices) {
        choices = result.choices;
      }

      if (result.spawn_result) {
        spawnResult = result.spawn_result;
      }

      // _wait: stay on this node, stop and send accumulated responses to user
      if (result.condition === '_wait') {
        break;
      }

      // Find transition
      const transition = nodeDef.transitions?.find(t => t.condition === result.condition)
        || nodeDef.transitions?.find(t => t.condition === 'default');

      if (transition) {
        session.currentNode = transition.to;
        // Clear userInput for auto-advancing nodes (they shouldn't see the original message)
        userMessage = null;
        continue; // keep going — chain through silent nodes until one produces _wait
      }

      // No matching transition — stop
      break;
    }

    const response = responses.join('\n\n') || null;

    // Record bot response
    if (response) {
      session.history.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() });
    }

    return {
      response: response || 'Processing...',
      choices: choices || null,
      state: { ...session.state },
      currentNode: session.currentNode,
      currentGraph: session.currentGraph,
      executionLog: session.executionLog,
      spawnResult,
      isComplete: session.currentNode === 'END' || session.currentNode === 'WF-END',
    };
  }
}

// Singleton
const manager = new DialogSessionManager();

module.exports = manager;

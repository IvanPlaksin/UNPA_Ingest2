/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SessionContextService
 *
 * Manages AI assistant session state in Redis for persistence between
 * requests. Stores message history, graph snapshots, undo stack, and
 * canvas selection context.
 *
 * Redis key: gxe:assistant:session:{sessionId}
 * TTL: 7200 seconds (2 hours)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const redis = require('../redis.service');
const { agentBootstrapService } = require('./AgentBootstrapService');

const SESSION_KEY_PREFIX = 'gxe:assistant:session:';
const GRAPH_SESSION_PREFIX = 'gxe:assistant:graph:';
const SESSION_TTL = 7200; // 2 hours
const MAX_MESSAGES = 100; // prevent unbounded growth
const MAX_UNDO_STACK = 50;
const MAX_GRAPH_SNAPSHOTS = 10;

class SessionContextService {
  /**
   * Get existing session or create a new one.
   * @param {string} sessionId
   * @param {string} agentId
   * @param {string} [graphId] - Catalog graph ID to bind session to
   * @returns {Promise<Object>} session data
   */
  async getOrCreate(sessionId, agentId = 'agent-gxe-assistant-v1', graphId = null) {
    const key = SESSION_KEY_PREFIX + sessionId;
    const existing = await redis.get(key);

    if (existing) {
      return existing;
    }

    // Bootstrap from KG
    const bootstrap = await agentBootstrapService.bootstrap(agentId);

    const session = {
      sessionId,
      agentId,
      graphId: graphId || null,
      systemContext: bootstrap.systemContext,
      messages: [],
      graphSnapshots: [],
      undoStack: [],
      selectionContext: {
        nodes: [],
        edges: [],
        topologicalRole: null,
      },
      iterationCount: 0,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    };

    await this.save(sessionId, session);

    // Store reverse mapping: graphId → sessionId
    if (graphId) {
      await redis.set(GRAPH_SESSION_PREFIX + graphId, sessionId, SESSION_TTL);
    }

    return session;
  }

  /**
   * Find session by catalog graph ID.
   * @param {string} graphId - Catalog graph ID
   * @returns {Promise<Object|null>} session data or null
   */
  async getByGraphId(graphId) {
    if (!graphId) return null;
    const sessionId = await redis.get(GRAPH_SESSION_PREFIX + graphId);
    if (!sessionId) return null;
    return this._load(sessionId);
  }

  /**
   * Save session to Redis with TTL.
   * @param {string} sessionId
   * @param {Object} sessionData
   * @returns {Promise<boolean>}
   */
  async save(sessionId, sessionData) {
    const key = SESSION_KEY_PREFIX + sessionId;
    sessionData.lastActivityAt = new Date().toISOString();
    await redis.set(key, sessionData, SESSION_TTL);
    // Refresh graph reverse mapping TTL
    if (sessionData.graphId) {
      await redis.set(GRAPH_SESSION_PREFIX + sessionData.graphId, sessionId, SESSION_TTL);
    }
    return true;
  }

  /**
   * Append a message to session history.
   * @param {string} sessionId
   * @param {string} role - 'user' | 'assistant'
   * @param {string} content
   * @returns {Promise<Object>} updated session
   */
  async appendMessage(sessionId, role, content) {
    const session = await this._load(sessionId);
    if (!session) return null;

    session.messages.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // Trim oldest messages if exceeding limit
    if (session.messages.length > MAX_MESSAGES) {
      session.messages = session.messages.slice(-MAX_MESSAGES);
    }

    session.iterationCount++;
    await this.save(sessionId, session);
    return session;
  }

  /**
   * Get message history formatted for Claude API.
   * @param {string} sessionId
   * @returns {Promise<Array<{role: string, content: string}>>}
   */
  async getMessages(sessionId) {
    const session = await this._load(sessionId);
    if (!session) return [];

    return session.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  /**
   * Push an action onto the undo stack.
   * @param {string} sessionId
   * @param {Object} action - { actionType, diff }
   * @returns {Promise<boolean>}
   */
  async pushUndo(sessionId, action) {
    const session = await this._load(sessionId);
    if (!session) return false;

    session.undoStack.push({
      actionType: action.actionType,
      diff: action.diff,
      timestamp: new Date().toISOString(),
    });

    // Trim oldest if exceeding limit
    if (session.undoStack.length > MAX_UNDO_STACK) {
      session.undoStack = session.undoStack.slice(-MAX_UNDO_STACK);
    }

    await this.save(sessionId, session);
    return true;
  }

  /**
   * Pop the last action from the undo stack.
   * @param {string} sessionId
   * @returns {Promise<Object|null>} the popped action or null
   */
  async popUndo(sessionId) {
    const session = await this._load(sessionId);
    if (!session || session.undoStack.length === 0) return null;

    const action = session.undoStack.pop();
    await this.save(sessionId, session);
    return action;
  }

  /**
   * Save a graph snapshot for undo/history.
   * @param {string} sessionId
   * @param {Object} snapshot - { nodes, edges }
   * @returns {Promise<boolean>}
   */
  async pushGraphSnapshot(sessionId, snapshot) {
    const session = await this._load(sessionId);
    if (!session) return false;

    session.graphSnapshots.push({
      timestamp: new Date().toISOString(),
      nodes: snapshot.nodes || [],
      edges: snapshot.edges || [],
    });

    // Keep only the last N snapshots
    if (session.graphSnapshots.length > MAX_GRAPH_SNAPSHOTS) {
      session.graphSnapshots = session.graphSnapshots.slice(-MAX_GRAPH_SNAPSHOTS);
    }

    await this.save(sessionId, session);
    return true;
  }

  /**
   * Update canvas selection context.
   * @param {string} sessionId
   * @param {Object} selection - { nodes, edges, topologicalRole }
   * @returns {Promise<boolean>}
   */
  async updateSelectionContext(sessionId, selection) {
    const session = await this._load(sessionId);
    if (!session) return false;

    session.selectionContext = {
      nodes: selection.nodes || [],
      edges: selection.edges || [],
      topologicalRole: selection.topologicalRole || null,
    };

    await this.save(sessionId, session);
    return true;
  }

  /**
   * Get full session data.
   * @param {string} sessionId
   * @returns {Promise<Object|null>}
   */
  async get(sessionId) {
    return this._load(sessionId);
  }

  /**
   * Destroy a session.
   * @param {string} sessionId
   * @returns {Promise<boolean>}
   */
  async destroy(sessionId) {
    const key = SESSION_KEY_PREFIX + sessionId;
    agentBootstrapService.invalidateSession(sessionId);
    return redis.del(key);
  }

  // ── Private ──────────────────────────────────────────────────────────

  async _load(sessionId) {
    const key = SESSION_KEY_PREFIX + sessionId;
    return redis.get(key);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON + EXPORTS
// ────────────────────────────────────────────────────────────────────────────

const sessionContextService = new SessionContextService();

module.exports = {
  SessionContextService,
  sessionContextService,
};

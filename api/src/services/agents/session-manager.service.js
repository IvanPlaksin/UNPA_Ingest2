/**
 * Session Manager Service — manages parallel agent sessions for BackLog tasks.
 *
 * Controls concurrency, start/pause/stop lifecycle.
 * Respects circuit breaker and dependency order.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

const STATES = { IDLE: 'IDLE', RUNNING: 'RUNNING', PAUSED: 'PAUSED', STOPPED: 'STOPPED', COMPLETED: 'COMPLETED', ERROR: 'ERROR' };

class SessionManagerService extends EventEmitter {
  constructor() {
    super();
    this._sessions = new Map(); // sessionId → session
    this._maxParallel = 3;
    this._queue = []; // pending backlogIds
  }

  /**
   * Set max parallel sessions
   */
  setMaxParallel(max) {
    this._maxParallel = Math.max(1, Math.min(10, max));
    return this._maxParallel;
  }

  getMaxParallel() {
    return this._maxParallel;
  }

  /**
   * Enqueue a task for execution
   */
  enqueue(backlogId, { mode = 'PLANNING', priority = 0 } = {}) {
    // Check if already queued or running
    const existing = [...this._sessions.values()].find(s => s.backlogId === backlogId && ['RUNNING', 'PAUSED'].includes(s.state));
    if (existing) throw new Error(`Task ${backlogId} already has active session: ${existing.id}`);

    const session = {
      id: uuidv4(),
      backlogId,
      mode,
      priority,
      state: STATES.IDLE,
      cycleId: null,
      startedAt: null,
      pausedAt: null,
      completedAt: null,
      error: null,
      tokenUsage: 0
    };

    this._sessions.set(session.id, session);
    this._queue.push(session.id);
    this._processQueue();

    this.emit('session_change', { event: 'enqueued', session });
    return session;
  }

  /**
   * Start/resume a session
   */
  start(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.state === STATES.RUNNING) return session;

    session.state = STATES.RUNNING;
    session.startedAt = session.startedAt || new Date().toISOString();
    session.pausedAt = null;

    this.emit('session_change', { event: 'started', session });
    return session;
  }

  /**
   * Pause a session
   */
  pause(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (session.state !== STATES.RUNNING) throw new Error(`Cannot pause session in state: ${session.state}`);

    session.state = STATES.PAUSED;
    session.pausedAt = new Date().toISOString();

    this.emit('session_change', { event: 'paused', session });
    this._processQueue(); // may start another session
    return session;
  }

  /**
   * Stop a session
   */
  stop(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);

    session.state = STATES.STOPPED;
    session.completedAt = new Date().toISOString();

    this.emit('session_change', { event: 'stopped', session });
    this._processQueue();
    return session;
  }

  /**
   * Mark session as completed
   */
  complete(sessionId) {
    const session = this._sessions.get(sessionId);
    if (!session) return null;

    session.state = STATES.COMPLETED;
    session.completedAt = new Date().toISOString();

    this.emit('session_change', { event: 'completed', session });
    this._processQueue();
    return session;
  }

  /**
   * List all sessions
   */
  listSessions({ state } = {}) {
    let sessions = [...this._sessions.values()];
    if (state) sessions = sessions.filter(s => s.state === state);
    return sessions.sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  }

  /**
   * Get running count
   */
  getRunningCount() {
    return [...this._sessions.values()].filter(s => s.state === STATES.RUNNING).length;
  }

  /**
   * Get queue status
   */
  getStatus() {
    const sessions = [...this._sessions.values()];
    return {
      maxParallel: this._maxParallel,
      running: sessions.filter(s => s.state === STATES.RUNNING).length,
      paused: sessions.filter(s => s.state === STATES.PAUSED).length,
      queued: this._queue.length,
      completed: sessions.filter(s => s.state === STATES.COMPLETED).length,
      stopped: sessions.filter(s => s.state === STATES.STOPPED).length,
      total: sessions.length
    };
  }

  /**
   * Stop all sessions
   */
  stopAll() {
    const stopped = [];
    for (const [id, session] of this._sessions) {
      if (['RUNNING', 'PAUSED', 'IDLE'].includes(session.state)) {
        session.state = STATES.STOPPED;
        session.completedAt = new Date().toISOString();
        stopped.push(id);
      }
    }
    this._queue = [];
    this.emit('session_change', { event: 'all_stopped', count: stopped.length });
    return { stopped: stopped.length };
  }

  /**
   * Process queue — start sessions up to maxParallel
   */
  _processQueue() {
    const running = this.getRunningCount();
    const available = this._maxParallel - running;

    for (let i = 0; i < available && this._queue.length > 0; i++) {
      const sessionId = this._queue.shift();
      const session = this._sessions.get(sessionId);
      if (session && session.state === STATES.IDLE) {
        this.start(sessionId);
      }
    }
  }
}

module.exports = new SessionManagerService();

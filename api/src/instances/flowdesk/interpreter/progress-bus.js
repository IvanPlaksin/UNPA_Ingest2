'use strict';

/**
 * Interpreter progress bus (F3) — in-process pub/sub for per-session node
 * progress events. The interpreter engine publishes turn/node events keyed by
 * sessionId; the SSE controller subscribes and pipes them to the browser.
 *
 * In-process EventEmitter is sufficient for the single API process. If the API
 * is ever scaled horizontally, swap the emit/subscribe internals for Redis
 * pub/sub without touching callers.
 *
 * @module instances/flowdesk/interpreter/progress-bus
 */

const { EventEmitter } = require('events');

const _bus = new EventEmitter();
_bus.setMaxListeners(0); // many concurrent SSE subscribers

const channel = (sessionId) => `progress:${sessionId}`;

/** Publish a progress event for a session. */
function emit(sessionId, event) {
  if (!sessionId) return;
  _bus.emit(channel(sessionId), event);
}

/**
 * Subscribe to a session's progress events.
 * @returns {Function} unsubscribe
 */
function subscribe(sessionId, handler) {
  const ch = channel(sessionId);
  _bus.on(ch, handler);
  return () => _bus.off(ch, handler);
}

module.exports = { emit, subscribe, _bus };

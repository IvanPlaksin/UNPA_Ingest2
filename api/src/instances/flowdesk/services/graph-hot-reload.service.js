/**
 * Graph Hot-Reload Service
 *
 * Listens for graph updates via Redis PubSub and invalidates caches.
 * Provides hooks for Graph Catalog to auto-notify on changes.
 *
 * @module services/flowdesk/graph-hot-reload
 */

'use strict';

const { EventEmitter } = require('events');

const LOG_PREFIX = '[GraphHotReload]';
const CHANNEL = 'graph:updates';
const NAMESPACE = 'FLOWDESK';

let _subscriber = null;
let _publisher = null;
let _initialized = false;

const localEmitter = new EventEmitter();
localEmitter.setMaxListeners(50);

// ═══════════════════════════════════════════════════════════════
// INIT / SHUTDOWN
// ═══════════════════════════════════════════════════════════════

async function init() {
  if (_initialized) return;

  try {
    const IORedis = require('ioredis');
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6379', 10);

    _subscriber = new IORedis({ host, port, maxRetriesPerRequest: null });
    _publisher = new IORedis({ host, port, maxRetriesPerRequest: null });

    _subscriber.subscribe(CHANNEL, (err) => {
      if (err) console.error(`${LOG_PREFIX} Subscribe error: ${err.message}`);
      else console.log(`${LOG_PREFIX} Subscribed to ${CHANNEL}`);
    });

    _subscriber.on('message', (channel, message) => {
      if (channel === CHANNEL) handleMessage(message);
    });

    _initialized = true;
    console.log(`${LOG_PREFIX} Initialized`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} Init failed (non-critical): ${err.message}`);
  }
}

async function shutdown() {
  if (_subscriber) { try { await _subscriber.unsubscribe(CHANNEL); await _subscriber.quit(); } catch {} _subscriber = null; }
  if (_publisher) { try { await _publisher.quit(); } catch {} _publisher = null; }
  _initialized = false;
  console.log(`${LOG_PREFIX} Shutdown`);
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════════

function handleMessage(raw) {
  try {
    const data = JSON.parse(raw);
    console.log(`${LOG_PREFIX} Update: ${data.action} ${data.graphName}`);

    // Invalidate cache
    const graphLoaderKB = require('./graph-loader-kb.service.js');
    if (data.action === 'namespace_cleared') {
      graphLoaderKB.invalidateCache(); // clear all
    } else {
      graphLoaderKB.invalidateCache(data.graphName);
    }

    // Emit local event
    localEmitter.emit('graph:update', data);
    localEmitter.emit(`graph:update:${data.graphName}`, data);
  } catch (err) {
    console.error(`${LOG_PREFIX} Handle error: ${err.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PUBLISHING
// ═══════════════════════════════════════════════════════════════

async function publish(graphName, action, meta = {}) {
  if (!_publisher) await init();
  if (!_publisher) return; // init failed

  const msg = JSON.stringify({
    action, graphName, namespace: NAMESPACE,
    timestamp: new Date().toISOString(), ...meta
  });

  try {
    await _publisher.publish(CHANNEL, msg);
  } catch (err) {
    console.warn(`${LOG_PREFIX} Publish failed: ${err.message}`);
  }
}

async function notifyCreated(graphName, version) { await publish(graphName, 'created', { version }); }
async function notifyVersioned(graphName, version) { await publish(graphName, 'versioned', { version }); }
async function notifyDeleted(graphName) { await publish(graphName, 'deleted'); }

// ═══════════════════════════════════════════════════════════════
// LOCAL EVENT SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════

function onUpdate(cb) {
  localEmitter.on('graph:update', cb);
  return () => localEmitter.off('graph:update', cb);
}

function onGraphUpdate(graphName, cb) {
  const event = `graph:update:${graphName}`;
  localEmitter.on(event, cb);
  return () => localEmitter.off(event, cb);
}

module.exports = {
  init, shutdown,
  publish, notifyCreated, notifyVersioned, notifyDeleted,
  onUpdate, onGraphUpdate,
  CHANNEL, NAMESPACE
};

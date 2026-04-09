/**
 * WebSocket Service
 * Real-time communication for streaming responses and progress updates
 *
 * Features:
 *   - Client connection management
 *   - Channel-based pub/sub subscriptions
 *   - Heartbeat / keep-alive
 *   - Stream helpers for queries and batch operations
 *
 * @module services/websocket/websocket.service
 */

const WebSocket = require('ws');
const { EventEmitter } = require('events');

class WebSocketService extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      path: options.path || '/ws',
      heartbeatInterval: options.heartbeatInterval || 30000,
      ...options
    };

    this.wss = null;
    this.clients = new Map();   // clientId -> { ws, subscriptions, lastActivity }
    this.channels = new Map();  // channelName -> Set<clientId>
    this.heartbeatTimer = null;

    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      messagesSent: 0,
      messagesReceived: 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Initialize WebSocket server on an existing HTTP server
   */
  initialize(server) {
    this.wss = new WebSocket.Server({
      server,
      path: this.options.path
    });

    this.wss.on('connection', (ws, req) => this._handleConnection(ws, req));
    this.wss.on('error', (error) => console.error('[WebSocket] Server error:', error));

    this._startHeartbeat();

    console.log(`[WebSocket] Server initialized on path: ${this.options.path}`);
    return this;
  }

  /**
   * Shutdown the WebSocket server gracefully
   */
  shutdown() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [, client] of this.clients) {
      this._send(client.ws, { type: 'shutdown', message: 'Server shutting down' });
      client.ws.close();
    }

    if (this.wss) {
      this.wss.close();
    }

    console.log('[WebSocket] Server shut down');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  _handleConnection(ws, req) {
    const clientId = this._generateClientId();

    this.clients.set(clientId, {
      ws,
      subscriptions: new Set(),
      lastActivity: Date.now(),
      ip: req.socket.remoteAddress
    });

    this.stats.totalConnections++;
    this.stats.activeConnections = this.clients.size;

    // Welcome
    this._send(ws, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });

    ws.on('message', (data) => this._handleMessage(clientId, data));
    ws.on('close', () => this._handleClose(clientId));
    ws.on('error', (error) => {
      console.warn(`[WebSocket] Client error (${clientId}):`, error.message);
    });

    this.emit('connection', { clientId });
  }

  _handleMessage(clientId, data) {
    this.stats.messagesReceived++;

    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = Date.now();

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this._handleSubscribe(clientId, message.channel);
          break;

        case 'unsubscribe':
          this._handleUnsubscribe(clientId, message.channel);
          break;

        case 'ping':
          this._send(client.ws, { type: 'pong', timestamp: Date.now() });
          break;

        case 'query':
          this.emit('query', { clientId, ...message });
          break;

        default:
          this.emit('message', { clientId, message });
      }
    } catch (error) {
      console.warn(`[WebSocket] Invalid message from ${clientId}:`, error.message);
      this._send(client.ws, { type: 'error', error: 'Invalid message format' });
    }
  }

  _handleClose(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all channels
    for (const channel of client.subscriptions) {
      const channelClients = this.channels.get(channel);
      if (channelClients) {
        channelClients.delete(clientId);
        if (channelClients.size === 0) {
          this.channels.delete(channel);
        }
      }
    }

    this.clients.delete(clientId);
    this.stats.activeConnections = this.clients.size;

    this.emit('disconnection', { clientId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHANNEL SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  _handleSubscribe(clientId, channel) {
    if (!channel) return;

    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.add(channel);

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(clientId);

    this._send(client.ws, {
      type: 'subscribed',
      channel,
      timestamp: Date.now()
    });
  }

  _handleUnsubscribe(clientId, channel) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(channel);

    const channelClients = this.channels.get(channel);
    if (channelClients) {
      channelClients.delete(clientId);
      if (channelClients.size === 0) {
        this.channels.delete(channel);
      }
    }

    this._send(client.ws, { type: 'unsubscribed', channel });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API — Send & Broadcast
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Send message to a specific client
   * @returns {boolean} true if sent
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    this._send(client.ws, message);
    return true;
  }

  /**
   * Broadcast to all subscribers of a channel
   * @returns {number} count of clients reached
   */
  broadcast(channel, message) {
    const channelClients = this.channels.get(channel);
    if (!channelClients) return 0;

    let sent = 0;
    for (const clientId of channelClients) {
      if (this.sendToClient(clientId, { ...message, channel })) {
        sent++;
      }
    }
    return sent;
  }

  /**
   * Broadcast to every connected client
   * @returns {number} count of clients reached
   */
  broadcastAll(message) {
    let sent = 0;
    for (const [clientId] of this.clients) {
      if (this.sendToClient(clientId, message)) {
        sent++;
      }
    }
    return sent;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC API — Stream Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a stream helper for query responses
   * Returns { sendChunk, sendProgress, sendComplete, sendError }
   */
  streamQueryResponse(clientId, queryId) {
    const client = this.clients.get(clientId);
    if (!client) return null;

    return {
      sendChunk: (chunk) => {
        this.sendToClient(clientId, {
          type: 'query_chunk',
          queryId,
          chunk,
          timestamp: Date.now()
        });
      },

      sendProgress: (progress, total, message) => {
        this.sendToClient(clientId, {
          type: 'query_progress',
          queryId,
          progress,
          total,
          percentage: total > 0 ? Math.round((progress / total) * 100) : 0,
          message,
          timestamp: Date.now()
        });
      },

      sendComplete: (result) => {
        this.sendToClient(clientId, {
          type: 'query_complete',
          queryId,
          result,
          timestamp: Date.now()
        });
      },

      sendError: (error) => {
        this.sendToClient(clientId, {
          type: 'query_error',
          queryId,
          error: error.message || error,
          timestamp: Date.now()
        });
      }
    };
  }

  /**
   * Create a progress reporter for batch / multi-step operations
   * Returns { start, step, complete, error }
   */
  createProgressReporter(clientId, operationId, totalSteps) {
    let currentStep = 0;

    return {
      start: (message) => {
        this.sendToClient(clientId, {
          type: 'operation_start',
          operationId,
          totalSteps,
          message,
          timestamp: Date.now()
        });
      },

      step: (message) => {
        currentStep++;
        this.sendToClient(clientId, {
          type: 'operation_progress',
          operationId,
          step: currentStep,
          totalSteps,
          percentage: Math.round((currentStep / totalSteps) * 100),
          message,
          timestamp: Date.now()
        });
      },

      complete: (result) => {
        this.sendToClient(clientId, {
          type: 'operation_complete',
          operationId,
          result,
          timestamp: Date.now()
        });
      },

      error: (error) => {
        this.sendToClient(clientId, {
          type: 'operation_error',
          operationId,
          error: error.message || error,
          timestamp: Date.now()
        });
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════════════════════════════════════

  getStats() {
    return {
      ...this.stats,
      channels: this.channels.size,
      clientsByChannel: Object.fromEntries(
        [...this.channels.entries()].map(([ch, clients]) => [ch, clients.size])
      )
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  _send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      this.stats.messagesSent++;
    }
  }

  _generateClientId() {
    return `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.options.heartbeatInterval * 2;

      for (const [clientId, client] of this.clients) {
        if (now - client.lastActivity > timeout) {
          client.ws.terminate();
          this._handleClose(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          this._send(client.ws, { type: 'heartbeat', timestamp: now });
        }
      }
    }, this.options.heartbeatInterval);
  }
}

// Singleton
const websocketService = new WebSocketService();

function createWebSocketService(options) {
  return new WebSocketService(options);
}

module.exports = {
  WebSocketService,
  createWebSocketService,
  websocketService
};

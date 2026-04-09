/**
 * WebSocket Module
 */

const { WebSocketService, createWebSocketService, websocketService } = require('./websocket.service');
const { QueryStreamHandler, queryStreamHandler } = require('./query-stream.handler');

module.exports = {
  WebSocketService,
  createWebSocketService,
  websocketService,

  QueryStreamHandler,
  queryStreamHandler
};

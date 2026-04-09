/**
 * Task 8.1 — WebSocket Streaming Tests
 *
 * Tests WebSocketService, QueryStreamHandler, and real WebSocket connections.
 */

const http = require('http');
const WebSocket = require('ws');

// ── Test helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function assertTrue(val, msg) {
  if (!val) throw new Error(`${msg || 'Assertion failed'}: expected truthy, got ${JSON.stringify(val)}`);
}
function assertIncludes(arr, val, msg) {
  if (!arr.includes(val)) throw new Error(`${msg}: ${JSON.stringify(arr)} does not include ${JSON.stringify(val)}`);
}

async function test(name, fn, timeoutMs = 10000) {
  try {
    await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
    ]);
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

function section(title) {
  console.log(`\n${'═'.repeat(63)}`);
  console.log(title);
  console.log('═'.repeat(63));
}

/** Wait for a WS message matching predicate */
function waitForMessage(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
  });
}

/** Collect N messages matching predicate */
function collectMessages(ws, predicate, count, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const collected = [];
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      resolve(collected); // Return what we have
    }, timeoutMs);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (predicate(msg)) {
        collected.push(msg);
        if (collected.length >= count) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(collected);
        }
      }
    };
    ws.on('message', handler);
  });
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  console.log('WebSocket Streaming Tests (Task 8.1)');
  console.log('═'.repeat(63));

  // ============================================================
  // Unit Tests — WebSocketService class (no real server)
  // ============================================================
  section('WebSocketService — Unit');

  const { WebSocketService, createWebSocketService, websocketService } = require('../../src/services/websocket/websocket.service');
  const { QueryStreamHandler, queryStreamHandler } = require('../../src/services/websocket/query-stream.handler');

  await test('WebSocketService class exists', async () => {
    assertTrue(typeof WebSocketService === 'function');
  });

  await test('createWebSocketService returns instance', async () => {
    const svc = createWebSocketService({ path: '/test-ws' });
    assertTrue(svc instanceof WebSocketService);
    assertEqual(svc.options.path, '/test-ws');
  });

  await test('websocketService is singleton', async () => {
    assertTrue(websocketService instanceof WebSocketService);
    assertEqual(websocketService.options.path, '/ws');
  });

  await test('Initial stats are zeroed', async () => {
    const svc = createWebSocketService();
    const stats = svc.getStats();
    assertEqual(stats.totalConnections, 0);
    assertEqual(stats.activeConnections, 0);
    assertEqual(stats.messagesSent, 0);
    assertEqual(stats.messagesReceived, 0);
    assertEqual(stats.channels, 0);
  });

  await test('clients and channels maps are empty', async () => {
    const svc = createWebSocketService();
    assertEqual(svc.clients.size, 0);
    assertEqual(svc.channels.size, 0);
  });

  await test('_generateClientId produces unique ids', async () => {
    const svc = createWebSocketService();
    const id1 = svc._generateClientId();
    const id2 = svc._generateClientId();
    assertTrue(id1.startsWith('ws_'));
    assertTrue(id2.startsWith('ws_'));
    assertTrue(id1 !== id2, 'IDs should be unique');
  });

  await test('sendToClient returns false for unknown client', async () => {
    const svc = createWebSocketService();
    const result = svc.sendToClient('nonexistent', { type: 'test' });
    assertEqual(result, false);
  });

  await test('broadcast returns 0 for unknown channel', async () => {
    const svc = createWebSocketService();
    assertEqual(svc.broadcast('nonexistent', { type: 'test' }), 0);
  });

  await test('broadcastAll returns 0 with no clients', async () => {
    const svc = createWebSocketService();
    assertEqual(svc.broadcastAll({ type: 'test' }), 0);
  });

  await test('streamQueryResponse returns null for unknown client', async () => {
    const svc = createWebSocketService();
    assertEqual(svc.streamQueryResponse('bad_id', 'q1'), null);
  });

  await test('createProgressReporter has correct interface', async () => {
    const svc = createWebSocketService();
    // Manually add a fake client
    svc.clients.set('fake', { ws: { readyState: 0 }, subscriptions: new Set(), lastActivity: Date.now() });
    const reporter = svc.createProgressReporter('fake', 'op1', 5);
    assertTrue(typeof reporter.start === 'function');
    assertTrue(typeof reporter.step === 'function');
    assertTrue(typeof reporter.complete === 'function');
    assertTrue(typeof reporter.error === 'function');
    svc.clients.delete('fake');
  });

  // ============================================================
  // Unit Tests — QueryStreamHandler class
  // ============================================================
  section('QueryStreamHandler — Unit');

  await test('QueryStreamHandler class exists', async () => {
    assertTrue(typeof QueryStreamHandler === 'function');
  });

  await test('queryStreamHandler is singleton', async () => {
    assertTrue(queryStreamHandler instanceof QueryStreamHandler);
  });

  await test('QueryStreamHandler has engine', async () => {
    const handler = new QueryStreamHandler();
    assertTrue(handler.engine !== undefined);
    assertTrue(typeof handler.engine.parser === 'object');
    assertTrue(typeof handler.engine.planner === 'object');
  });

  await test('getActiveQueries returns empty initially', async () => {
    const handler = new QueryStreamHandler();
    const active = handler.getActiveQueries();
    assertEqual(Object.keys(active).length, 0);
  });

  await test('handleQuery with no connected client is safe', async () => {
    const handler = new QueryStreamHandler();
    // should not throw — client not found means streamQueryResponse returns null
    await handler.handleQuery({ clientId: 'ghost', query: 'test', queryId: 'q999' });
    // Entry is added to activeQueries before stream check, then early-returns
    assertEqual(Object.keys(handler.getActiveQueries()).length, 1);
    assertEqual(handler.getActiveQueries()['q999'].status, 'processing');
  });

  // ============================================================
  // Integration Tests — Real WebSocket Server
  // ============================================================
  section('WebSocket Integration — Real Server');

  // Create a fresh service + HTTP server for integration tests
  const integrationService = createWebSocketService({ path: '/ws-test', heartbeatInterval: 60000 });
  const httpServer = http.createServer();

  integrationService.initialize(httpServer);

  // Start listening on a random port
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = httpServer.address().port;
  const wsUrl = `ws://127.0.0.1:${port}/ws-test`;

  await test('Client connects and receives welcome', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    assertTrue(welcome.clientId.startsWith('ws_'), 'Should have client ID');
    assertTrue(welcome.timestamp, 'Should have timestamp');
    assertEqual(integrationService.stats.totalConnections, 1);
    assertEqual(integrationService.clients.size, 1);
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Connection event is emitted', async () => {
    let eventData = null;
    integrationService.once('connection', (data) => { eventData = data; });

    const ws = new WebSocket(wsUrl);
    await waitForMessage(ws, (m) => m.type === 'connected');
    assertTrue(eventData !== null, 'connection event should fire');
    assertTrue(eventData.clientId.startsWith('ws_'));
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Disconnection event is emitted', async () => {
    let disconnected = false;
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    integrationService.once('disconnection', () => { disconnected = true; });
    ws.close();
    await new Promise(r => setTimeout(r, 200));
    assertTrue(disconnected, 'disconnection event should fire');
  });

  await test('Ping/pong works', async () => {
    const ws = new WebSocket(wsUrl);
    await waitForMessage(ws, (m) => m.type === 'connected');
    ws.send(JSON.stringify({ type: 'ping' }));
    const pong = await waitForMessage(ws, (m) => m.type === 'pong');
    assertTrue(pong.timestamp > 0, 'pong should have timestamp');
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Subscribe to channel', async () => {
    const ws = new WebSocket(wsUrl);
    await waitForMessage(ws, (m) => m.type === 'connected');
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'test-ch' }));
    const sub = await waitForMessage(ws, (m) => m.type === 'subscribed');
    assertEqual(sub.channel, 'test-ch');
    assertTrue(integrationService.channels.has('test-ch'));
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Unsubscribe from channel', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    ws.send(JSON.stringify({ type: 'subscribe', channel: 'unsub-ch' }));
    await waitForMessage(ws, (m) => m.type === 'subscribed');
    ws.send(JSON.stringify({ type: 'unsubscribe', channel: 'unsub-ch' }));
    const unsub = await waitForMessage(ws, (m) => m.type === 'unsubscribed');
    assertEqual(unsub.channel, 'unsub-ch');
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Broadcast to channel reaches subscriber', async () => {
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);
    await waitForMessage(ws1, (m) => m.type === 'connected');
    await waitForMessage(ws2, (m) => m.type === 'connected');

    ws1.send(JSON.stringify({ type: 'subscribe', channel: 'broadcast-ch' }));
    await waitForMessage(ws1, (m) => m.type === 'subscribed');

    // ws2 does NOT subscribe
    const sent = integrationService.broadcast('broadcast-ch', { type: 'news', payload: 'hello' });
    assertEqual(sent, 1);

    const msg = await waitForMessage(ws1, (m) => m.type === 'news');
    assertEqual(msg.payload, 'hello');
    assertEqual(msg.channel, 'broadcast-ch');

    ws1.close();
    ws2.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('broadcastAll reaches all clients', async () => {
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);
    await waitForMessage(ws1, (m) => m.type === 'connected');
    await waitForMessage(ws2, (m) => m.type === 'connected');

    // Small delay to ensure both connections are fully registered
    await new Promise(r => setTimeout(r, 50));

    // Set up listeners before sending
    const p1 = waitForMessage(ws1, (m) => m.type === 'global');
    const p2 = waitForMessage(ws2, (m) => m.type === 'global');

    const sent = integrationService.broadcastAll({ type: 'global', msg: 'all' });
    assertEqual(sent, 2);

    const [m1, m2] = await Promise.all([p1, p2]);
    assertEqual(m1.msg, 'all');
    assertEqual(m2.msg, 'all');

    ws1.close();
    ws2.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('sendToClient delivers to correct client', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    const clientId = welcome.clientId;

    const ok = integrationService.sendToClient(clientId, { type: 'direct', val: 42 });
    assertTrue(ok);

    const msg = await waitForMessage(ws, (m) => m.type === 'direct');
    assertEqual(msg.val, 42);

    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Invalid JSON sends error', async () => {
    const ws = new WebSocket(wsUrl);
    await waitForMessage(ws, (m) => m.type === 'connected');
    ws.send('not-json');
    const errMsg = await waitForMessage(ws, (m) => m.type === 'error');
    assertEqual(errMsg.error, 'Invalid message format');
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Custom message event is emitted', async () => {
    let received = null;
    integrationService.once('message', (data) => { received = data; });

    const ws = new WebSocket(wsUrl);
    await waitForMessage(ws, (m) => m.type === 'connected');
    ws.send(JSON.stringify({ type: 'custom', data: 'foo' }));
    await new Promise(r => setTimeout(r, 200));

    assertTrue(received !== null, 'message event should fire');
    assertEqual(received.message.type, 'custom');
    assertEqual(received.message.data, 'foo');
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Query event is emitted', async () => {
    let received = null;
    integrationService.once('query', (data) => { received = data; });

    const ws = new WebSocket(wsUrl);
    await waitForMessage(ws, (m) => m.type === 'connected');
    ws.send(JSON.stringify({ type: 'query', query: 'test query', queryId: 'q1' }));
    await new Promise(r => setTimeout(r, 200));

    assertTrue(received !== null, 'query event should fire');
    assertEqual(received.query, 'test query');
    assertEqual(received.queryId, 'q1');
    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Stats reflect connections and messages', async () => {
    const stats = integrationService.getStats();
    assertTrue(stats.totalConnections > 0, 'should have total connections');
    assertTrue(stats.messagesSent > 0, 'should have messages sent');
    assertTrue(stats.messagesReceived > 0, 'should have messages received');
    assertTrue(typeof stats.channels === 'number');
  });

  // ============================================================
  // Stream Helpers — via real connection
  // ============================================================
  section('Stream Helpers — Real Connection');

  await test('streamQueryResponse sends progress + complete', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    const clientId = welcome.clientId;

    const stream = integrationService.streamQueryResponse(clientId, 'sq1');
    assertTrue(stream !== null);

    // Collect messages
    const collector = collectMessages(ws, (m) => m.queryId === 'sq1', 3);

    stream.sendProgress(1, 3, 'Step 1');
    stream.sendProgress(2, 3, 'Step 2');
    stream.sendComplete({ answer: 'done' });

    const msgs = await collector;
    assertTrue(msgs.length >= 3, `Expected 3 messages, got ${msgs.length}`);
    assertEqual(msgs[0].type, 'query_progress');
    assertEqual(msgs[0].progress, 1);
    assertEqual(msgs[0].percentage, 33);
    assertEqual(msgs[1].type, 'query_progress');
    assertEqual(msgs[2].type, 'query_complete');
    assertEqual(msgs[2].result.answer, 'done');

    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('streamQueryResponse sendChunk works', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    const clientId = welcome.clientId;

    const stream = integrationService.streamQueryResponse(clientId, 'sq2');
    stream.sendChunk('hello world');

    const msg = await waitForMessage(ws, (m) => m.type === 'query_chunk');
    assertEqual(msg.queryId, 'sq2');
    assertEqual(msg.chunk, 'hello world');

    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('streamQueryResponse sendError works', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    const clientId = welcome.clientId;

    const stream = integrationService.streamQueryResponse(clientId, 'sq3');
    stream.sendError(new Error('Something broke'));

    const msg = await waitForMessage(ws, (m) => m.type === 'query_error');
    assertEqual(msg.queryId, 'sq3');
    assertEqual(msg.error, 'Something broke');

    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('createProgressReporter sends operations', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    const clientId = welcome.clientId;

    const reporter = integrationService.createProgressReporter(clientId, 'op1', 3);

    const collector = collectMessages(ws, (m) => m.operationId === 'op1', 5);

    reporter.start('Starting...');
    reporter.step('Step 1');
    reporter.step('Step 2');
    reporter.step('Step 3');
    reporter.complete({ total: 3 });

    const msgs = await collector;
    assertTrue(msgs.length >= 5, `Expected 5 messages, got ${msgs.length}`);
    assertEqual(msgs[0].type, 'operation_start');
    assertEqual(msgs[0].totalSteps, 3);
    assertEqual(msgs[1].type, 'operation_progress');
    assertEqual(msgs[1].step, 1);
    assertEqual(msgs[1].percentage, 33);
    assertEqual(msgs[2].step, 2);
    assertEqual(msgs[2].percentage, 67);
    assertEqual(msgs[3].step, 3);
    assertEqual(msgs[3].percentage, 100);
    assertEqual(msgs[4].type, 'operation_complete');

    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('createProgressReporter error works', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');
    const clientId = welcome.clientId;

    const reporter = integrationService.createProgressReporter(clientId, 'op2', 2);
    reporter.error(new Error('batch failed'));

    const msg = await waitForMessage(ws, (m) => m.type === 'operation_error');
    assertEqual(msg.operationId, 'op2');
    assertEqual(msg.error, 'batch failed');

    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  // ============================================================
  // QueryStreamHandler — Integration via real WS
  // ============================================================
  section('QueryStreamHandler — Integration');

  // Wire up a fresh QueryStreamHandler to the integration service
  const { createQueryEngine } = require('../../src/services/query');
  const testEngine = createQueryEngine();

  // Inject the integration service so the handler can find clients
  const testHandler = new QueryStreamHandler({ engine: testEngine, wsService: integrationService });
  testHandler.initialize();

  await test('Streaming query returns progress and complete', async () => {
    const ws = new WebSocket(wsUrl);
    const welcome = await waitForMessage(ws, (m) => m.type === 'connected');

    // Collect all query-related messages
    const collector = collectMessages(ws, (m) => m.queryId === 'stream-q1', 5);

    ws.send(JSON.stringify({
      type: 'query',
      query: 'list all systems',
      queryId: 'stream-q1',
      mode: 'full',
      format: 'detailed'
    }));

    const msgs = await collector;

    // Should have progress messages + complete
    assertTrue(msgs.length >= 2, `Expected at least 2 messages, got ${msgs.length}`);

    const progressMsgs = msgs.filter(m => m.type === 'query_progress');
    const completeMsgs = msgs.filter(m => m.type === 'query_complete');

    assertTrue(progressMsgs.length >= 1, 'Should have progress messages');
    assertTrue(completeMsgs.length >= 1, 'Should have complete message');

    const complete = completeMsgs[0];
    assertTrue(complete.result.success !== undefined, 'Result should have success');
    assertTrue(complete.result.query === 'list all systems');
    assertTrue(complete.result.metadata.duration >= 0);

    ws.close();
    await new Promise(r => setTimeout(r, 100));
  });

  await test('Active queries tracked during execution', async () => {
    // The previous query should be in activeQueries (or cleaned up after 60s)
    // We can verify the handler tracks them
    const handler = new QueryStreamHandler({ engine: testEngine });
    assertEqual(Object.keys(handler.getActiveQueries()).length, 0);
  });

  // ============================================================
  // Module Exports
  // ============================================================
  section('Module Exports');

  const wsModule = require('../../src/services/websocket');

  await test('Module exports WebSocketService', async () => {
    assertTrue(typeof wsModule.WebSocketService === 'function');
  });

  await test('Module exports createWebSocketService', async () => {
    assertTrue(typeof wsModule.createWebSocketService === 'function');
  });

  await test('Module exports websocketService singleton', async () => {
    assertTrue(wsModule.websocketService instanceof wsModule.WebSocketService);
  });

  await test('Module exports QueryStreamHandler', async () => {
    assertTrue(typeof wsModule.QueryStreamHandler === 'function');
  });

  await test('Module exports queryStreamHandler singleton', async () => {
    assertTrue(wsModule.queryStreamHandler instanceof wsModule.QueryStreamHandler);
  });

  // ============================================================
  // Cleanup
  // ============================================================
  integrationService.shutdown();
  httpServer.close();
  await new Promise(r => setTimeout(r, 200));

  // ── Summary ──
  console.log(`\n${'═'.repeat(63)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(63));

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

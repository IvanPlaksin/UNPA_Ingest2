/**
 * Query Stream Handler
 * Handles streaming query execution via WebSocket
 *
 * Listens for 'query' events from WebSocketService and streams
 * step-by-step progress back to the client.
 *
 * @module services/websocket/query-stream.handler
 */

const { createQueryEngine } = require('../query');
const { websocketService } = require('./websocket.service');

class QueryStreamHandler {
  constructor(options = {}) {
    this.options = {
      chunkSize: options.chunkSize || 100,
      ...options
    };

    this.engine = options.engine || createQueryEngine(options.engineOptions);
    this.wsService = options.wsService || websocketService;
    this.activeQueries = new Map(); // queryId -> { clientId, startTime, status }
  }

  /**
   * Attach to the websocket service events
   */
  initialize() {
    this.wsService.on('query', (data) => this.handleQuery(data));
    console.log('[QueryStreamHandler] Initialized');
  }

  /**
   * Handle a streaming query request
   */
  async handleQuery({ clientId, query, queryId, mode = 'full', format = 'detailed' }) {
    const id = queryId || `q_${Date.now()}`;

    this.activeQueries.set(id, {
      clientId,
      startTime: Date.now(),
      status: 'processing'
    });

    const stream = this.wsService.streamQueryResponse(clientId, id);

    if (!stream) {
      console.warn(`[QueryStreamHandler] Cannot stream to client ${clientId} — not connected`);
      return;
    }

    try {
      // Step 1: Parse
      stream.sendProgress(1, 4, 'Parsing query...');
      const parsed = this.engine.parser.parse(query);

      // Step 2: Plan
      stream.sendProgress(2, 4, 'Creating execution plan...');
      const plan = this.engine.planner.plan(parsed);

      // Step 3: Execute
      stream.sendProgress(3, 4, 'Executing query...');
      const result = await this.engine.executor.execute(plan);

      // Step 4: Generate answer
      stream.sendProgress(4, 4, 'Generating answer...');
      const answer = this.engine.answerGen.generate(result, parsed, { format });

      // Complete
      stream.sendComplete({
        success: result.success,
        query,
        intent: parsed.intent,
        answer: answer.answer,
        data: result.data,
        paths: result.paths,
        citations: answer.citations,
        confidence: answer.confidence,
        metadata: {
          mode,
          format,
          duration: Date.now() - this.activeQueries.get(id).startTime
        }
      });

      this.activeQueries.get(id).status = 'completed';
    } catch (error) {
      console.error(`[QueryStreamHandler] Stream query error (${id}):`, error.message);
      stream.sendError(error);
      if (this.activeQueries.has(id)) {
        this.activeQueries.get(id).status = 'failed';
      }
    } finally {
      // Cleanup after 60 seconds
      setTimeout(() => this.activeQueries.delete(id), 60000);
    }
  }

  /**
   * Handle streaming batch extraction with progress
   */
  async handleBatchExtraction({ clientId, texts, operationId, domain }) {
    const id = operationId || `batch_${Date.now()}`;
    const reporter = this.wsService.createProgressReporter(clientId, id, texts.length);

    reporter.start(`Processing ${texts.length} texts...`);

    const results = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const result = await this.engine.query(texts[i], { mode: 'quick' });
        results.push({ index: i, success: true, result });
        reporter.step(`Processed ${i + 1}/${texts.length}`);
      } catch (error) {
        results.push({ index: i, success: false, error: error.message });
        reporter.step(`Failed ${i + 1}/${texts.length}: ${error.message}`);
      }
    }

    reporter.complete({
      total: texts.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    });
  }

  /**
   * Get active queries
   */
  getActiveQueries() {
    return Object.fromEntries(this.activeQueries);
  }
}

const queryStreamHandler = new QueryStreamHandler();

module.exports = {
  QueryStreamHandler,
  queryStreamHandler
};

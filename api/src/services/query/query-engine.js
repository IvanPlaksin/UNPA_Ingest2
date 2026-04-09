/**
 * Unified Query Engine
 * Single entry point for all query operations
 *
 * Pipeline: Parse → Plan → Execute → Generate Answer
 */

const { QueryParser, createQueryParser } = require('./query-parser');
const { QueryPlanner, createQueryPlanner } = require('./query-planner');
const { QueryExecutor, createQueryExecutor } = require('./query-executor');
const { AnswerGenerator, createAnswerGenerator } = require('./answer-generator');

class QueryEngine {
  constructor(options = {}) {
    this.options = {
      defaultMode: options.defaultMode || 'full',
      defaultFormat: options.defaultFormat || 'detailed',
      enableCache: options.enableCache !== false,
      cacheTTL: options.cacheTTL || 300000, // 5 minutes
      maxCacheSize: options.maxCacheSize || 100,
      timeout: options.timeout || 30000,
      ...options
    };

    // Components (can be injected or defaults)
    this.parser = options.parser || createQueryParser();
    this.planner = options.planner || createQueryPlanner();
    this.executor = options.executor || createQueryExecutor({ graphService: options.graphService });
    this.answerGen = options.answerGenerator || createAnswerGenerator();
    this.graphService = options.graphService || null;

    // Query cache
    this.cache = new Map();

    this.stats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgQueryTime: 0,
      totalQueryTime: 0,
      byIntent: {},
      byMode: {}
    };
  }

  /**
   * Main query method — full pipeline
   */
  async query(queryText, options = {}) {
    this.stats.totalQueries++;
    const mode = options.mode || this.options.defaultMode;
    const format = options.format || this.options.defaultFormat;
    const startTime = Date.now();

    this.stats.byMode[mode] = (this.stats.byMode[mode] || 0) + 1;

    try {
      // Check cache
      if (this.options.enableCache && !options.noCache) {
        const cached = this._checkCache(queryText, mode, format);
        if (cached) {
          this.stats.cacheHits++;
          return { ...cached, fromCache: true };
        }
        this.stats.cacheMisses++;
      }

      let result;
      switch (mode) {
        case 'quick':
          result = await this._quickQuery(queryText, format);
          break;
        case 'explain':
          result = await this._explainQuery(queryText, format);
          break;
        case 'full':
        default:
          result = await this._fullQuery(queryText, format);
      }

      const queryTime = Date.now() - startTime;
      this.stats.totalQueryTime += queryTime;
      this.stats.avgQueryTime = this.stats.totalQueryTime / this.stats.totalQueries;
      this.stats.successfulQueries++;
      this.stats.byIntent[result.intent] = (this.stats.byIntent[result.intent] || 0) + 1;

      result.metadata = {
        ...result.metadata,
        queryTime,
        mode,
        format,
        timestamp: new Date().toISOString()
      };

      if (this.options.enableCache && result.success) {
        this._cacheResult(queryText, mode, format, result);
      }

      return result;

    } catch (error) {
      this.stats.failedQueries++;
      console.error('[QueryEngine] Query failed:', error.message);

      return {
        success: false,
        query: queryText,
        answer: "I encountered an error processing your query.",
        error: error.message,
        metadata: {
          queryTime: Date.now() - startTime,
          mode
        }
      };
    }
  }

  async _quickQuery(queryText, format) {
    const parsed = this.parser.parse(queryText);
    const data = [];

    for (const entity of parsed.entities) {
      const found = this._quickFindEntity(entity.name);
      if (found) data.push(found);
    }

    const mockResult = {
      success: data.length > 0,
      data,
      paths: [],
      aggregations: {}
    };

    const answer = this.answerGen.generate(mockResult, parsed, { format: 'brief' });

    return {
      success: data.length > 0,
      query: queryText,
      intent: parsed.intent,
      answer: answer.answer,
      data,
      citations: answer.citations,
      confidence: answer.confidence
    };
  }

  async _fullQuery(queryText, format) {
    const parsed = this.parser.parse(queryText);
    const plan = this.planner.plan(parsed);
    const result = await this.executor.execute(plan);
    const answer = this.answerGen.generate(result, parsed, { format });

    return {
      success: result.success,
      query: queryText,
      intent: parsed.intent,
      answer: answer.answer,
      data: result.data,
      paths: result.paths,
      aggregations: result.aggregations,
      citations: answer.citations,
      confidence: answer.confidence,
      metadata: {
        stepsExecuted: result.metadata?.stepsExecuted,
        dataPoints: result.data?.length || 0
      }
    };
  }

  async _explainQuery(queryText, format) {
    const explanation = { query: queryText, steps: [] };

    // Step 1: Parse
    const parseStart = Date.now();
    const parsed = this.parser.parse(queryText);
    explanation.steps.push({
      step: 1,
      name: 'Parse',
      duration: Date.now() - parseStart,
      result: {
        intent: parsed.intent,
        confidence: parsed.confidence,
        entities: parsed.entities,
        relations: parsed.relations,
        constraints: parsed.constraints,
        temporal: parsed.temporal
      }
    });

    // Step 2: Plan
    const planStart = Date.now();
    const plan = this.planner.plan(parsed);
    explanation.steps.push({
      step: 2,
      name: 'Plan',
      duration: Date.now() - planStart,
      result: {
        planId: plan.id,
        stepsCount: plan.steps.length,
        estimatedCost: plan.estimatedCost,
        operations: plan.steps.map(s => ({
          operation: s.operation,
          outputKey: s.outputKey,
          dependsOn: s.dependsOn
        }))
      }
    });

    // Step 3: Execute
    const execStart = Date.now();
    const result = await this.executor.execute(plan);
    explanation.steps.push({
      step: 3,
      name: 'Execute',
      duration: Date.now() - execStart,
      result: {
        success: result.success,
        dataCount: result.data?.length || 0,
        pathsCount: result.paths?.length || 0,
        hasAggregations: Object.keys(result.aggregations || {}).length > 0
      }
    });

    // Step 4: Generate Answer
    const genStart = Date.now();
    const answer = this.answerGen.generate(result, parsed, { format });
    explanation.steps.push({
      step: 4,
      name: 'Generate Answer',
      duration: Date.now() - genStart,
      result: {
        answerLength: typeof answer.answer === 'string' ? answer.answer.length : 0,
        citationsCount: answer.citations?.length || 0,
        confidence: answer.confidence
      }
    });

    return {
      success: result.success,
      query: queryText,
      intent: parsed.intent,
      answer: answer.answer,
      data: result.data,
      paths: result.paths,
      citations: answer.citations,
      confidence: answer.confidence,
      explanation
    };
  }

  _quickFindEntity(name) {
    if (!this.graphService?.graphCache) return null;
    const nameLower = name.toLowerCase();

    for (const [nodeId, node] of this.graphService.graphCache.nodes) {
      const nodeName = (node.name || node.label || nodeId).toLowerCase();
      if (nodeName === nameLower || nodeName.includes(nameLower)) {
        return { id: nodeId, ...node, found: true };
      }
    }
    return null;
  }

  // ==================== Convenience Methods ====================

  async ask(question, options = {}) {
    return this.query(question, { ...options, mode: 'full' });
  }

  async lookup(entityName) {
    return this.query(`What is ${entityName}?`, { mode: 'quick' });
  }

  async findPath(from, to) {
    return this.query(`Find path from ${from} to ${to}`, { mode: 'full' });
  }

  async count(type) {
    return this.query(`How many ${type}s are there?`, { mode: 'full' });
  }

  async list(type) {
    return this.query(`List all ${type}s`, { mode: 'full' });
  }

  async getRelations(entityName) {
    return this.query(`Show all relationships of ${entityName}`, { mode: 'full' });
  }

  async compare(entity1, entity2) {
    return this.query(`Compare ${entity1} and ${entity2}`, { mode: 'full' });
  }

  // ==================== Graph Management ====================

  setGraphService(graphService) {
    this.graphService = graphService;
    this.executor.setGraphService(graphService);
    this.clearCache();
  }

  updateGraph(graphData) {
    if (this.graphService?.updateGraph) {
      this.graphService.updateGraph(graphData);
    }
    this.clearCache();
  }

  addNodes(nodes) {
    if (this.graphService?.graphCache?.nodes) {
      for (const node of nodes) {
        this.graphService.graphCache.nodes.set(node.id, node);
      }
    }
    this.clearCache();
  }

  addEdges(edges) {
    if (this.graphService?.graphCache?.edges) {
      for (const edge of edges) {
        const key = `${edge.source}-${edge.target}`;
        this.graphService.graphCache.edges.set(key, edge);
        // Update adjacency
        if (this.graphService.graphCache.adjacency) {
          if (!this.graphService.graphCache.adjacency.has(edge.source)) {
            this.graphService.graphCache.adjacency.set(edge.source, new Set());
          }
          if (!this.graphService.graphCache.adjacency.has(edge.target)) {
            this.graphService.graphCache.adjacency.set(edge.target, new Set());
          }
          this.graphService.graphCache.adjacency.get(edge.source).add(edge.target);
          this.graphService.graphCache.adjacency.get(edge.target).add(edge.source);
        }
      }
    }
    this.clearCache();
  }

  getGraphStats() {
    if (!this.graphService?.graphCache) {
      return { nodes: 0, edges: 0 };
    }
    return {
      nodes: this.graphService.graphCache.nodes.size,
      edges: this.graphService.graphCache.edges.size
    };
  }

  // ==================== Cache Management ====================

  _checkCache(queryText, mode, format) {
    const hash = this._hashQuery(queryText, mode, format);
    const cached = this.cache.get(hash);

    if (cached && Date.now() - cached.timestamp < this.options.cacheTTL) {
      return cached.result;
    }

    if (cached) this.cache.delete(hash);
    return null;
  }

  _cacheResult(queryText, mode, format, result) {
    const hash = this._hashQuery(queryText, mode, format);

    if (this.cache.size >= this.options.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(hash, { result, timestamp: Date.now() });
  }

  _hashQuery(queryText, mode, format = 'detailed') {
    const str = `${mode}:${format}:${queryText.toLowerCase().trim()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.options.maxCacheSize,
      hitRate: this.stats.totalQueries > 0
        ? ((this.stats.cacheHits / this.stats.totalQueries) * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }

  // ==================== Statistics ====================

  getStats() {
    return {
      ...this.stats,
      cache: this.getCacheStats(),
      graph: this.getGraphStats(),
      components: {
        parser: this.parser.getStats(),
        planner: this.planner.getStats(),
        executor: this.executor.getStats(),
        answerGenerator: this.answerGen.getStats()
      }
    };
  }

  resetStats() {
    this.stats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      avgQueryTime: 0,
      totalQueryTime: 0,
      byIntent: {},
      byMode: {}
    };
  }
}

function createQueryEngine(options) {
  return new QueryEngine(options);
}

const queryEngine = new QueryEngine();

module.exports = {
  QueryEngine,
  createQueryEngine,
  queryEngine
};

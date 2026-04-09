/**
 * Query Types and Structures
 * Core data types for the Query & Reasoning Engine
 */

const QueryIntent = {
  FACTUAL: 'factual',           // "What is UMOJA?"
  RELATIONAL: 'relational',     // "Who created Bug #123?"
  PATH: 'path',                 // "How is John connected to UMOJA?"
  AGGREGATION: 'aggregation',   // "How many bugs are assigned to John?"
  COMPARISON: 'comparison',     // "Compare System A and System B"
  TEMPORAL: 'temporal',         // "What changed last week?"
  COMPLEX: 'complex'            // Multi-part queries
};

const QueryOperation = {
  // Node operations
  FIND_NODE: 'find_node',
  FIND_NODES: 'find_nodes',
  GET_NODE_ATTRIBUTES: 'get_node_attributes',

  // Edge operations
  FIND_RELATIONS: 'find_relations',
  GET_NEIGHBORS: 'get_neighbors',

  // Path operations
  FIND_PATH: 'find_path',
  FIND_ALL_PATHS: 'find_all_paths',

  // Aggregation operations
  COUNT: 'count',
  LIST: 'list',
  GROUP_BY: 'group_by',

  // Traversal operations
  TRAVERSE: 'traverse',
  SUBGRAPH: 'subgraph'
};

class ParsedQuery {
  constructor(config = {}) {
    this.id = config.id || `q_${Date.now()}`;
    this.originalText = config.originalText || '';
    this.intent = config.intent || QueryIntent.FACTUAL;
    this.confidence = config.confidence || 0;

    // Extracted components
    this.entities = config.entities || [];
    this.relations = config.relations || [];
    this.attributes = config.attributes || [];
    this.constraints = config.constraints || [];

    // Query parameters
    this.limit = config.limit || 10;
    this.offset = config.offset || 0;
    this.orderBy = config.orderBy || null;

    // Temporal constraints
    this.temporal = config.temporal || null;

    this.parsedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      originalText: this.originalText,
      intent: this.intent,
      confidence: this.confidence,
      entities: this.entities,
      relations: this.relations,
      attributes: this.attributes,
      constraints: this.constraints,
      limit: this.limit,
      temporal: this.temporal
    };
  }
}

class ExecutionPlan {
  constructor(config = {}) {
    this.id = config.id || `plan_${Date.now()}`;
    this.queryId = config.queryId;
    this.steps = config.steps || [];
    this.estimatedCost = config.estimatedCost || 0;
    this.createdAt = new Date().toISOString();
  }

  addStep(step) {
    this.steps.push({
      order: this.steps.length,
      operation: step.operation,
      params: step.params || {},
      dependsOn: step.dependsOn || [],
      outputKey: step.outputKey || `step_${this.steps.length}`
    });
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      queryId: this.queryId,
      steps: this.steps,
      estimatedCost: this.estimatedCost
    };
  }
}

class QueryResult {
  constructor(config = {}) {
    this.queryId = config.queryId;
    this.success = config.success !== false;
    this.data = config.data || [];
    this.paths = config.paths || [];
    this.aggregations = config.aggregations || {};
    this.answer = config.answer || null;
    this.citations = config.citations || [];
    this.metadata = {
      totalResults: config.data?.length || 0,
      executionTime: config.executionTime || 0,
      stepsExecuted: config.stepsExecuted || 0,
      ...config.metadata
    };
  }

  toJSON() {
    return {
      queryId: this.queryId,
      success: this.success,
      data: this.data,
      paths: this.paths,
      aggregations: this.aggregations,
      answer: this.answer,
      citations: this.citations,
      metadata: this.metadata
    };
  }
}

module.exports = {
  QueryIntent,
  QueryOperation,
  ParsedQuery,
  ExecutionPlan,
  QueryResult
};

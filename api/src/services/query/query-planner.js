/**
 * Query Planner
 * Generates execution plans from parsed queries
 */

const { QueryIntent, QueryOperation, ExecutionPlan } = require('./query-types');

class QueryPlanner {
  constructor(options = {}) {
    this.options = {
      maxPathLength: options.maxPathLength || 5,
      maxResults: options.maxResults || 100,
      ...options
    };

    this.stats = {
      totalPlans: 0,
      byIntent: {}
    };
  }

  /**
   * Create execution plan from parsed query
   */
  plan(parsedQuery) {
    this.stats.totalPlans++;
    this.stats.byIntent[parsedQuery.intent] = (this.stats.byIntent[parsedQuery.intent] || 0) + 1;

    const plan = new ExecutionPlan({
      queryId: parsedQuery.id
    });

    switch (parsedQuery.intent) {
      case QueryIntent.FACTUAL:
        this._planFactualQuery(plan, parsedQuery);
        break;
      case QueryIntent.RELATIONAL:
        this._planRelationalQuery(plan, parsedQuery);
        break;
      case QueryIntent.PATH:
        this._planPathQuery(plan, parsedQuery);
        break;
      case QueryIntent.AGGREGATION:
        this._planAggregationQuery(plan, parsedQuery);
        break;
      case QueryIntent.COMPARISON:
        this._planComparisonQuery(plan, parsedQuery);
        break;
      case QueryIntent.TEMPORAL:
        this._planTemporalQuery(plan, parsedQuery);
        break;
      default:
        this._planComplexQuery(plan, parsedQuery);
    }

    plan.estimatedCost = this._estimateCost(plan);

    console.log(`[QueryPlanner] Plan: ${plan.steps.length} steps, cost=${plan.estimatedCost}`);

    return plan;
  }

  // ==================== Planning Methods ====================

  _planFactualQuery(plan, query) {
    if (query.entities.length === 0) return;

    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: {
        name: query.entities[0].name,
        type: query.entities[0].type
      },
      outputKey: 'entity'
    });

    plan.addStep({
      operation: QueryOperation.GET_NODE_ATTRIBUTES,
      params: { nodeRef: 'entity' },
      dependsOn: ['entity'],
      outputKey: 'attributes'
    });

    plan.addStep({
      operation: QueryOperation.GET_NEIGHBORS,
      params: {
        nodeRef: 'entity',
        maxDepth: 1,
        limit: 5
      },
      dependsOn: ['entity'],
      outputKey: 'neighbors'
    });
  }

  _planRelationalQuery(plan, query) {
    if (query.entities.length === 0) return;

    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: {
        name: query.entities[0].name,
        type: query.entities[0].type
      },
      outputKey: 'primary'
    });

    const relationType = query.relations.length > 0 ? query.relations[0].type : null;
    const direction = query.relations.length > 0 ? query.relations[0].direction : 'any';

    plan.addStep({
      operation: QueryOperation.FIND_RELATIONS,
      params: {
        nodeRef: 'primary',
        relationType,
        direction,
        limit: query.limit
      },
      dependsOn: ['primary'],
      outputKey: 'relations'
    });

    if (query.entities.length > 1) {
      plan.addStep({
        operation: QueryOperation.FIND_NODE,
        params: {
          name: query.entities[1].name,
          type: query.entities[1].type
        },
        outputKey: 'secondary'
      });
    }
  }

  _planPathQuery(plan, query) {
    if (query.entities.length < 2) {
      this._planFactualQuery(plan, query);
      return;
    }

    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: {
        name: query.entities[0].name,
        type: query.entities[0].type
      },
      outputKey: 'source'
    });

    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: {
        name: query.entities[1].name,
        type: query.entities[1].type
      },
      outputKey: 'target'
    });

    plan.addStep({
      operation: QueryOperation.FIND_PATH,
      params: {
        sourceRef: 'source',
        targetRef: 'target',
        maxLength: this.options.maxPathLength
      },
      dependsOn: ['source', 'target'],
      outputKey: 'path'
    });

    plan.addStep({
      operation: QueryOperation.FIND_ALL_PATHS,
      params: {
        sourceRef: 'source',
        targetRef: 'target',
        maxLength: this.options.maxPathLength,
        maxPaths: 3
      },
      dependsOn: ['source', 'target'],
      outputKey: 'allPaths'
    });
  }

  _planAggregationQuery(plan, query) {
    const targetType = this._inferTargetType(query);

    plan.addStep({
      operation: QueryOperation.FIND_NODES,
      params: {
        type: targetType,
        constraints: query.constraints,
        limit: this.options.maxResults
      },
      outputKey: 'nodes'
    });

    if (query.relations.length > 0 && query.entities.length > 0) {
      plan.addStep({
        operation: QueryOperation.FIND_NODE,
        params: {
          name: query.entities[0].name
        },
        outputKey: 'filterEntity'
      });

      plan.addStep({
        operation: QueryOperation.FIND_RELATIONS,
        params: {
          nodeRef: 'filterEntity',
          relationType: query.relations[0].type,
          direction: query.relations[0].direction
        },
        dependsOn: ['filterEntity'],
        outputKey: 'filteredNodes'
      });
    }

    const nodesRef = (query.relations.length > 0 && query.entities.length > 0) ? 'filteredNodes' : 'nodes';
    const deps = nodesRef === 'filteredNodes' ? ['filteredNodes'] : ['nodes'];

    plan.addStep({
      operation: QueryOperation.COUNT,
      params: { nodesRef },
      dependsOn: deps,
      outputKey: 'count'
    });

    plan.addStep({
      operation: QueryOperation.LIST,
      params: {
        nodesRef,
        limit: query.limit
      },
      dependsOn: deps,
      outputKey: 'list'
    });
  }

  _planComparisonQuery(plan, query) {
    if (query.entities.length < 2) {
      this._planFactualQuery(plan, query);
      return;
    }

    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: { name: query.entities[0].name },
      outputKey: 'entity1'
    });

    plan.addStep({
      operation: QueryOperation.GET_NODE_ATTRIBUTES,
      params: { nodeRef: 'entity1' },
      dependsOn: ['entity1'],
      outputKey: 'attrs1'
    });

    plan.addStep({
      operation: QueryOperation.GET_NEIGHBORS,
      params: { nodeRef: 'entity1', maxDepth: 1 },
      dependsOn: ['entity1'],
      outputKey: 'neighbors1'
    });

    plan.addStep({
      operation: QueryOperation.FIND_NODE,
      params: { name: query.entities[1].name },
      outputKey: 'entity2'
    });

    plan.addStep({
      operation: QueryOperation.GET_NODE_ATTRIBUTES,
      params: { nodeRef: 'entity2' },
      dependsOn: ['entity2'],
      outputKey: 'attrs2'
    });

    plan.addStep({
      operation: QueryOperation.GET_NEIGHBORS,
      params: { nodeRef: 'entity2', maxDepth: 1 },
      dependsOn: ['entity2'],
      outputKey: 'neighbors2'
    });
  }

  _planTemporalQuery(plan, query) {
    plan.addStep({
      operation: QueryOperation.FIND_NODES,
      params: {
        temporal: query.temporal,
        constraints: query.constraints,
        orderBy: { field: 'createdAt', direction: 'desc' },
        limit: query.limit
      },
      outputKey: 'temporalNodes'
    });

    if (query.entities.length > 0) {
      plan.addStep({
        operation: QueryOperation.FIND_NODE,
        params: { name: query.entities[0].name },
        outputKey: 'entity'
      });

      plan.addStep({
        operation: QueryOperation.FIND_RELATIONS,
        params: {
          nodeRef: 'entity',
          temporal: query.temporal
        },
        dependsOn: ['entity'],
        outputKey: 'temporalRelations'
      });
    }
  }

  _planComplexQuery(plan, query) {
    for (let i = 0; i < query.entities.length; i++) {
      plan.addStep({
        operation: QueryOperation.FIND_NODE,
        params: {
          name: query.entities[i].name,
          type: query.entities[i].type
        },
        outputKey: `entity_${i}`
      });
    }

    if (query.entities.length > 0) {
      plan.addStep({
        operation: QueryOperation.GET_NEIGHBORS,
        params: {
          nodeRef: 'entity_0',
          maxDepth: 2,
          limit: 20
        },
        dependsOn: ['entity_0'],
        outputKey: 'subgraph'
      });
    }

    plan.addStep({
      operation: QueryOperation.SUBGRAPH,
      params: {
        entitiesRef: query.entities.map((_, i) => `entity_${i}`),
        maxDepth: 2
      },
      dependsOn: query.entities.map((_, i) => `entity_${i}`),
      outputKey: 'contextSubgraph'
    });
  }

  // ==================== Helper Methods ====================

  _inferTargetType(query) {
    const text = query.originalText.toLowerCase();

    if (/bugs?/i.test(text)) return 'WorkItem';
    if (/tasks?/i.test(text)) return 'WorkItem';
    if (/people|persons?|users?|members?/i.test(text)) return 'Person';
    if (/systems?|applications?/i.test(text)) return 'System';
    if (/documents?|files?/i.test(text)) return 'Document';
    if (/teams?|groups?/i.test(text)) return 'Team';

    return null;
  }

  _estimateCost(plan) {
    let cost = 0;

    for (const step of plan.steps) {
      switch (step.operation) {
        case QueryOperation.FIND_NODE:
          cost += 1;
          break;
        case QueryOperation.FIND_NODES:
          cost += 5;
          break;
        case QueryOperation.FIND_RELATIONS:
          cost += 3;
          break;
        case QueryOperation.GET_NEIGHBORS:
          cost += 2 * (step.params.maxDepth || 1);
          break;
        case QueryOperation.FIND_PATH:
          cost += 10;
          break;
        case QueryOperation.FIND_ALL_PATHS:
          cost += 20;
          break;
        case QueryOperation.SUBGRAPH:
          cost += 15;
          break;
        case QueryOperation.GET_NODE_ATTRIBUTES:
          cost += 1;
          break;
        case QueryOperation.COUNT:
        case QueryOperation.LIST:
          cost += 1;
          break;
        default:
          cost += 1;
      }
    }

    return cost;
  }

  getStats() {
    return { ...this.stats };
  }
}

function createQueryPlanner(options) {
  return new QueryPlanner(options);
}

const queryPlanner = new QueryPlanner();

module.exports = {
  QueryPlanner,
  createQueryPlanner,
  queryPlanner
};

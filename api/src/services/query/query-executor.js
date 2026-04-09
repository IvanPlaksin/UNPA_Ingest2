/**
 * Query Executor
 * Executes query plans against the graph
 */

const { QueryOperation, QueryResult } = require('./query-types');

class QueryExecutor {
  constructor(options = {}) {
    this.options = {
      maxPathLength: options.maxPathLength || 5,
      maxResults: options.maxResults || 100,
      timeout: options.timeout || 30000,
      ...options
    };

    // Graph service can be injected or set later
    this.graphService = options.graphService || null;

    // Operation handlers
    this.operationHandlers = {
      [QueryOperation.FIND_NODE]: this._findNode.bind(this),
      [QueryOperation.FIND_NODES]: this._findNodes.bind(this),
      [QueryOperation.GET_NODE_ATTRIBUTES]: this._getNodeAttributes.bind(this),
      [QueryOperation.FIND_RELATIONS]: this._findRelations.bind(this),
      [QueryOperation.GET_NEIGHBORS]: this._getNeighbors.bind(this),
      [QueryOperation.FIND_PATH]: this._findPath.bind(this),
      [QueryOperation.FIND_ALL_PATHS]: this._findAllPaths.bind(this),
      [QueryOperation.COUNT]: this._count.bind(this),
      [QueryOperation.LIST]: this._list.bind(this),
      [QueryOperation.GROUP_BY]: this._groupBy.bind(this),
      [QueryOperation.TRAVERSE]: this._traverse.bind(this),
      [QueryOperation.SUBGRAPH]: this._subgraph.bind(this)
    };

    this.stats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      totalStepsExecuted: 0,
      avgExecutionTime: 0,
      totalExecutionTime: 0
    };
  }

  /**
   * Set graph service (for lazy initialization)
   */
  setGraphService(graphService) {
    this.graphService = graphService;
  }

  /**
   * Get graph cache (with fallback for missing service)
   */
  _getGraphCache() {
    if (this.graphService?.graphCache) {
      return this.graphService.graphCache;
    }
    return { nodes: new Map(), edges: new Map(), adjacency: new Map() };
  }

  /**
   * Execute an execution plan
   */
  async execute(plan, context = {}) {
    this.stats.totalExecutions++;
    const startTime = Date.now();

    const execContext = {
      results: {},
      errors: [],
      stepsExecuted: 0
    };

    try {
      const orderedSteps = this._orderSteps(plan.steps);

      for (const step of orderedSteps) {
        if (!this._dependenciesSatisfied(step, execContext)) {
          execContext.errors.push({
            step: step.order,
            error: 'Dependencies not satisfied'
          });
          continue;
        }

        try {
          const result = await this._executeStep(step, execContext);
          execContext.results[step.outputKey] = result;
          execContext.stepsExecuted++;
          this.stats.totalStepsExecuted++;
        } catch (error) {
          console.warn(`[QueryExecutor] Step ${step.order} failed: ${error.message}`);
          execContext.errors.push({
            step: step.order,
            operation: step.operation,
            error: error.message
          });
        }
      }

      const executionTime = Date.now() - startTime;
      this.stats.totalExecutionTime += executionTime;
      this.stats.avgExecutionTime = this.stats.totalExecutionTime / this.stats.totalExecutions;
      this.stats.successfulExecutions++;

      return this._buildResult(plan, execContext, executionTime);

    } catch (error) {
      this.stats.failedExecutions++;
      console.error('[QueryExecutor] Execution failed:', error.message);

      return new QueryResult({
        queryId: plan.queryId,
        success: false,
        metadata: {
          error: error.message,
          executionTime: Date.now() - startTime
        }
      });
    }
  }

  async _executeStep(step, execContext) {
    const handler = this.operationHandlers[step.operation];

    if (!handler) {
      throw new Error(`Unknown operation: ${step.operation}`);
    }

    const resolvedParams = this._resolveParams(step.params, execContext);
    return await handler(resolvedParams, execContext);
  }

  // ==================== Operation Handlers ====================

  async _findNode(params) {
    const { name, type } = params;
    const cache = this._getGraphCache();

    for (const [nodeId, node] of cache.nodes) {
      const nodeName = (node.name || node.label || nodeId).toLowerCase();
      const searchName = name.toLowerCase();

      if (nodeName === searchName || nodeName.includes(searchName) || searchName.includes(nodeName)) {
        if (!type || type === 'Entity' || node.type === type) {
          return { id: nodeId, ...node, found: true };
        }
      }
    }

    return { found: false, searchedFor: name };
  }

  async _findNodes(params) {
    const { type, constraints, temporal, limit, orderBy } = params;
    const cache = this._getGraphCache();
    const results = [];

    for (const [nodeId, node] of cache.nodes) {
      if (type && node.type !== type) continue;
      if (constraints && !this._matchesConstraints(node, constraints)) continue;
      if (temporal && !this._matchesTemporal(node, temporal)) continue;
      results.push({ id: nodeId, ...node });
    }

    if (orderBy) {
      results.sort((a, b) => {
        const aVal = a[orderBy.field] || '';
        const bVal = b[orderBy.field] || '';
        return orderBy.direction === 'desc'
          ? String(bVal).localeCompare(String(aVal))
          : String(aVal).localeCompare(String(bVal));
      });
    }

    return results.slice(0, limit || this.options.maxResults);
  }

  async _getNodeAttributes(params) {
    const node = params.nodeRef;

    if (!node || !node.found) {
      return { attributes: {}, found: false };
    }

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      attributes: node.attributes || {},
      found: true
    };
  }

  async _findRelations(params) {
    const { nodeRef, relationType, direction, limit } = params;
    const cache = this._getGraphCache();

    if (!nodeRef || !nodeRef.found) return [];

    const nodeId = nodeRef.id.toLowerCase();
    const nodeName = (nodeRef.name || '').toLowerCase();
    const relations = [];

    for (const [, edge] of cache.edges) {
      const source = (edge.source || edge.from || '').toString().toLowerCase();
      const target = (edge.target || edge.to || '').toString().toLowerCase();
      const edgeType = edge.type || edge.relation;

      let matches = false;
      let role = null;

      if (direction !== 'incoming') {
        if (source === nodeId || source === nodeName) {
          matches = true;
          role = 'source';
        }
      }

      if (direction !== 'outgoing' && !matches) {
        if (target === nodeId || target === nodeName) {
          matches = true;
          role = 'target';
        }
      }

      if (!matches) continue;
      if (relationType && edgeType !== relationType) continue;

      const connectedId = role === 'source' ? target : source;
      const connectedNode = this._findNodeById(connectedId);

      relations.push({
        type: edgeType,
        role,
        connectedNode: connectedNode || { id: connectedId },
        edge
      });
    }

    return relations.slice(0, limit || this.options.maxResults);
  }

  async _getNeighbors(params) {
    const { nodeRef, maxDepth, limit } = params;
    const cache = this._getGraphCache();

    if (!nodeRef || !nodeRef.found) return [];

    const nodeId = nodeRef.id;
    const visited = new Set([nodeId.toLowerCase()]);
    const neighbors = [];
    let currentLevel = [nodeId];

    for (let depth = 1; depth <= (maxDepth || 1); depth++) {
      const nextLevel = [];

      for (const currentId of currentLevel) {
        const adjacent = cache.adjacency.get(currentId) ||
          cache.adjacency.get(currentId.toLowerCase()) ||
          new Set();

        for (const neighborId of adjacent) {
          const normalizedId = neighborId.toLowerCase();

          if (!visited.has(normalizedId)) {
            visited.add(normalizedId);
            nextLevel.push(neighborId);

            const node = this._findNodeById(neighborId);
            if (node) {
              neighbors.push({ ...node, depth });
            }
          }
        }
      }

      currentLevel = nextLevel;
      if (currentLevel.length === 0) break;
    }

    return neighbors.slice(0, limit || this.options.maxResults);
  }

  async _findPath(params) {
    const { sourceRef, targetRef, maxLength } = params;

    if (!sourceRef?.found || !targetRef?.found) {
      return { found: false, path: [] };
    }

    const sourceId = sourceRef.id.toLowerCase();
    const targetId = targetRef.id.toLowerCase();
    const maxLen = maxLength || this.options.maxPathLength;
    const cache = this._getGraphCache();

    // BFS for shortest path
    const queue = [[sourceId]];
    const visited = new Set([sourceId]);

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === targetId) {
        return {
          found: true,
          path: path.map(id => this._findNodeById(id) || { id }),
          length: path.length - 1
        };
      }

      if (path.length >= maxLen + 1) continue;

      const neighbors = cache.adjacency.get(current) || new Set();

      for (const neighbor of neighbors) {
        const normalizedNeighbor = neighbor.toLowerCase();
        if (!visited.has(normalizedNeighbor)) {
          visited.add(normalizedNeighbor);
          queue.push([...path, normalizedNeighbor]);
        }
      }
    }

    return { found: false, path: [] };
  }

  async _findAllPaths(params) {
    const { sourceRef, targetRef, maxLength, maxPaths } = params;

    if (!sourceRef?.found || !targetRef?.found) return [];

    const sourceId = sourceRef.id.toLowerCase();
    const targetId = targetRef.id.toLowerCase();
    const maxLen = maxLength || this.options.maxPathLength;
    const cache = this._getGraphCache();
    const paths = [];

    const dfs = (current, path, visited) => {
      if (paths.length >= (maxPaths || 5)) return;

      if (current === targetId) {
        paths.push(path.map(id => this._findNodeById(id) || { id }));
        return;
      }

      if (path.length >= maxLen + 1) return;

      const neighbors = cache.adjacency.get(current) || new Set();

      for (const neighbor of neighbors) {
        const normalizedNeighbor = neighbor.toLowerCase();
        if (!visited.has(normalizedNeighbor)) {
          visited.add(normalizedNeighbor);
          dfs(normalizedNeighbor, [...path, normalizedNeighbor], visited);
          visited.delete(normalizedNeighbor);
        }
      }
    };

    dfs(sourceId, [sourceId], new Set([sourceId]));
    return paths;
  }

  async _count(params) {
    const items = params.nodesRef || [];
    return { count: Array.isArray(items) ? items.length : 0 };
  }

  async _list(params) {
    const items = params.nodesRef || [];
    const limit = params.limit || this.options.maxResults;

    return {
      items: Array.isArray(items) ? items.slice(0, limit) : [],
      total: Array.isArray(items) ? items.length : 0,
      limited: Array.isArray(items) && items.length > limit
    };
  }

  async _groupBy(params) {
    const items = params.nodesRef || [];
    const field = params.field || 'type';
    const groups = {};

    for (const item of (Array.isArray(items) ? items : [])) {
      const key = item[field] || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    return {
      groups,
      counts: Object.fromEntries(
        Object.entries(groups).map(([k, v]) => [k, v.length])
      )
    };
  }

  async _traverse(params) {
    const { startRef, maxDepth } = params;
    const cache = this._getGraphCache();

    if (!startRef?.found) return [];

    const results = [];
    const visited = new Set();
    const queue = [{ node: startRef, depth: 0 }];

    while (queue.length > 0) {
      const { node, depth } = queue.shift();

      if (depth > (maxDepth || 3)) continue;

      const nodeId = node.id.toLowerCase();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      if (depth > 0) {
        results.push({ ...node, depth });
      }

      const neighbors = cache.adjacency.get(nodeId) || new Set();

      for (const neighborId of neighbors) {
        const neighborNode = this._findNodeById(neighborId);
        if (neighborNode) {
          queue.push({ node: neighborNode, depth: depth + 1 });
        }
      }
    }

    return results;
  }

  async _subgraph(params, ctx) {
    const { entitiesRef, maxDepth } = params;
    const cache = this._getGraphCache();
    const nodes = new Map();
    const edges = [];

    const seedNodes = [];
    for (const ref of (entitiesRef || [])) {
      const resolved = typeof ref === 'string' ? ctx.results[ref] : ref;
      if (resolved?.found) {
        seedNodes.push(resolved);
        nodes.set(resolved.id, resolved);
      }
    }

    const visited = new Set(seedNodes.map(n => n.id.toLowerCase()));
    let currentLevel = seedNodes;

    for (let depth = 0; depth < (maxDepth || 2); depth++) {
      const nextLevel = [];

      for (const node of currentLevel) {
        const nodeId = node.id.toLowerCase();
        const neighbors = cache.adjacency.get(nodeId) || new Set();

        for (const neighborId of neighbors) {
          const normalizedId = neighborId.toLowerCase();

          if (!visited.has(normalizedId)) {
            visited.add(normalizedId);
            const neighborNode = this._findNodeById(neighborId);

            if (neighborNode) {
              nodes.set(neighborNode.id, neighborNode);
              nextLevel.push(neighborNode);
            }
          }

          edges.push({
            source: nodeId,
            target: normalizedId,
            type: this._findEdgeType(nodeId, normalizedId)
          });
        }
      }

      currentLevel = nextLevel;
    }

    return {
      nodes: [...nodes.values()],
      edges: this._deduplicateEdges(edges)
    };
  }

  // ==================== Helper Methods ====================

  _orderSteps(steps) {
    const ordered = [];
    const completed = new Set();
    const pending = [...steps];

    let maxIterations = pending.length * 2;
    while (pending.length > 0 && maxIterations-- > 0) {
      const readyIndex = pending.findIndex(step =>
        step.dependsOn.every(dep => completed.has(dep))
      );

      if (readyIndex === -1) {
        ordered.push(...pending);
        break;
      }

      const step = pending.splice(readyIndex, 1)[0];
      ordered.push(step);
      completed.add(step.outputKey);
    }

    return ordered;
  }

  _dependenciesSatisfied(step, ctx) {
    return step.dependsOn.every(dep => dep in ctx.results);
  }

  _resolveParams(params, ctx) {
    const resolved = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value in ctx.results) {
        resolved[key] = ctx.results[value];
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(v =>
          typeof v === 'string' && v in ctx.results ? ctx.results[v] : v
        );
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  _findNodeById(id) {
    const cache = this._getGraphCache();
    const normalizedId = id.toLowerCase();

    for (const [nodeId, node] of cache.nodes) {
      if (nodeId.toLowerCase() === normalizedId) {
        return { id: nodeId, ...node, found: true };
      }
      const nodeName = (node.name || node.label || '').toLowerCase();
      if (nodeName === normalizedId) {
        return { id: nodeId, ...node, found: true };
      }
    }

    return null;
  }

  _findEdgeType(source, target) {
    const cache = this._getGraphCache();
    for (const [, edge] of cache.edges) {
      const edgeSource = (edge.source || edge.from || '').toLowerCase();
      const edgeTarget = (edge.target || edge.to || '').toLowerCase();

      if ((edgeSource === source && edgeTarget === target) ||
        (edgeSource === target && edgeTarget === source)) {
        return edge.type || edge.relation || 'RELATED_TO';
      }
    }
    return 'RELATED_TO';
  }

  _matchesConstraints(node, constraints) {
    for (const constraint of constraints) {
      const value = node[constraint.field] || node.attributes?.[constraint.field];

      switch (constraint.op) {
        case 'eq':
          if (value?.toString().toLowerCase() !== constraint.value?.toString().toLowerCase()) return false;
          break;
        case 'neq':
          if (value?.toString().toLowerCase() === constraint.value?.toString().toLowerCase()) return false;
          break;
        case 'contains':
          if (!value?.toString().toLowerCase().includes(constraint.value?.toString().toLowerCase())) return false;
          break;
      }
    }
    return true;
  }

  _matchesTemporal(item, temporal) {
    if (!temporal?.range) return true;

    const itemDate = item.createdAt || item.updatedAt || item.timestamp;
    if (!itemDate) return true;

    const date = new Date(itemDate);
    const start = temporal.range.start ? new Date(temporal.range.start) : null;
    const end = temporal.range.end ? new Date(temporal.range.end) : null;

    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }

  _deduplicateEdges(edges) {
    const seen = new Set();
    return edges.filter(edge => {
      const key = `${edge.source}-${edge.target}-${edge.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  _buildResult(plan, execContext, executionTime) {
    const result = new QueryResult({
      queryId: plan.queryId,
      success: execContext.errors.length === 0,
      executionTime,
      stepsExecuted: execContext.stepsExecuted
    });

    const data = [];
    const paths = [];
    const aggregations = {};

    for (const [, value] of Object.entries(execContext.results)) {
      if (!value) continue;

      if (value.found && value.id) {
        data.push(value);
      } else if (Array.isArray(value)) {
        data.push(...value.filter(v => v && typeof v === 'object'));
      } else if (value.items) {
        data.push(...value.items);
      } else if (value.nodes) {
        data.push(...value.nodes);
      }

      if (value.path && value.found) {
        paths.push(value);
      } else if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
        paths.push(...value.map((p, i) => ({ path: p, index: i })));
      }

      if (value.count !== undefined) {
        aggregations.count = value.count;
      }
      if (value.groups) {
        aggregations.groups = value.groups;
        aggregations.counts = value.counts;
      }
    }

    result.data = this._deduplicateNodes(data);
    result.paths = paths;
    result.aggregations = aggregations;
    result.citations = this._buildCitations(data);
    result.metadata.totalResults = result.data.length;

    if (execContext.errors.length > 0) {
      result.metadata.errors = execContext.errors;
    }

    return result;
  }

  _deduplicateNodes(nodes) {
    const seen = new Map();
    for (const node of nodes) {
      if (!node || !node.id) continue;
      const key = node.id.toLowerCase();
      if (!seen.has(key)) {
        seen.set(key, node);
      }
    }
    return [...seen.values()];
  }

  _buildCitations(data) {
    return data
      .filter(d => d && d.id)
      .slice(0, 10)
      .map(d => ({
        nodeId: d.id,
        name: d.name || d.id,
        type: d.type
      }));
  }

  getStats() {
    const cache = this._getGraphCache();
    return {
      ...this.stats,
      graphSize: {
        nodes: cache.nodes.size,
        edges: cache.edges.size
      }
    };
  }
}

function createQueryExecutor(options) {
  return new QueryExecutor(options);
}

const queryExecutor = new QueryExecutor();

module.exports = {
  QueryExecutor,
  createQueryExecutor,
  queryExecutor
};

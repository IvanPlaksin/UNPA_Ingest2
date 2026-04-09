/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG GRAPH REPOSITORY
 * Memgraph-based persistence for ExecutionGraph entities
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');
const { AOPEG_QUERIES } = require('./aopeg.schema');
const {
  serializeJson,
  parseJson,
  withSession,
  paginationParams
} = require('../utils/cypher.utils');
const { createNamespacedCache, TTL } = require('../utils/query-cache');

function nodeToGraphNode(record) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    executorType: record.executorType,
    parameters: parseJson(record.parameters) || {},
    dataMapping: parseJson(record.dataMapping),
    retryPolicy: parseJson(record.retryPolicy),
    fallbackNodeId: record.fallbackNodeId,
    timeout: record.timeout,
    position: parseJson(record.position),
    metadata: parseJson(record.metadata),
  };
}

function nodeToGraphEdge(record) {
  return {
    id: record.id,
    sourceNodeId: record.sourceNodeId,
    targetNodeId: record.targetNodeId,
    condition: parseJson(record.condition),
    priority: record.priority,
    dataTransform: parseJson(record.dataTransform),
    metadata: parseJson(record.metadata),
  };
}

function recordToGraph(graphRecord, nodes, edges) {
  return {
    id: graphRecord.id,
    name: graphRecord.name,
    description: graphRecord.description,
    domain: graphRecord.domain,
    version: graphRecord.version,
    status: graphRecord.status,
    nodes,
    edges,
    entryNodeId: graphRecord.entryNodeId,
    exitNodeId: graphRecord.exitNodeId,
    defaultParameters: parseJson(graphRecord.defaultParameters),
    metadata: parseJson(graphRecord.metadata),
    executionStats: parseJson(graphRecord.executionStats),
    createdAt: graphRecord.createdAt ? new Date(graphRecord.createdAt) : undefined,
    updatedAt: graphRecord.updatedAt ? new Date(graphRecord.updatedAt) : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH REPOSITORY
// ────────────────────────────────────────────────────────────────────────────

class GraphRepository {
  constructor(memgraphService) {
    this.memgraphService = memgraphService;
    this.cache = createNamespacedCache('aopeg:graph', {
      defaultTtl: TTL.MEDIUM,
      maxEntries: 200
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GRAPH CRUD
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Save a new graph or update existing
   */
  async save(graph) {
    const session = this.memgraphService.driver.session();

    try {
      // Check if graph exists
      const existing = await this.get(graph.id);

      if (existing) {
        // Update existing graph
        await this.update(graph);
      } else {
        // Create new graph
        await session.run(AOPEG_QUERIES.CREATE_GRAPH, {
          id: graph.id,
          name: graph.name,
          description: graph.description || null,
          domain: graph.domain,
          version: graph.version,
          status: graph.status,
          entryNodeId: graph.entryNodeId,
          exitNodeId: graph.exitNodeId || null,
          defaultParameters: serializeJson(graph.defaultParameters),
          metadata: serializeJson(graph.metadata),
          executionStats: serializeJson(graph.executionStats),
        });

        // Create nodes
        for (const node of graph.nodes) {
          await this.createNode(graph.id, node);
        }

        // Create edges
        for (const edge of graph.edges) {
          await this.createEdge(graph.id, edge);
        }
      }

      // Invalidate cache after save
      this.invalidateListCache();
    } finally {
      await session.close();
    }
  }

  /**
   * Get graph by ID with all nodes and edges
   */
  async get(graphId) {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_GRAPH_BY_ID,
      { graphId }
    );

    if (result.records.length === 0) {
      return null;
    }

    const record = result.records[0];
    const graphData = record.get('g')?.properties;

    if (!graphData) {
      return null;
    }

    const nodesData = record.get('nodes') || [];
    const edgesData = record.get('edges') || [];

    const nodes = nodesData.map(n => nodeToGraphNode(n.properties));
    const edges = edgesData.map(e => nodeToGraphEdge(e.properties));

    return recordToGraph(graphData, nodes, edges);
  }

  /**
   * Update an existing graph
   */
  async update(graph) {
    const session = this.memgraphService.driver.session();

    try {
      // Update graph properties
      await session.run(AOPEG_QUERIES.UPDATE_GRAPH, {
        id: graph.id,
        name: graph.name,
        description: graph.description || null,
        domain: graph.domain,
        version: graph.version,
        status: graph.status,
        entryNodeId: graph.entryNodeId,
        exitNodeId: graph.exitNodeId || null,
        defaultParameters: serializeJson(graph.defaultParameters),
        metadata: serializeJson(graph.metadata),
        executionStats: serializeJson(graph.executionStats),
      });

      // Get existing nodes and edges
      const existingNodes = await this.getNodes(graph.id);
      const existingEdges = await this.getEdges(graph.id);

      const existingNodeIds = new Set(existingNodes.map(n => n.id));
      const existingEdgeIds = new Set(existingEdges.map(e => e.id));

      const newNodeIds = new Set(graph.nodes.map(n => n.id));
      const newEdgeIds = new Set(graph.edges.map(e => e.id));

      // Delete removed nodes
      for (const nodeId of existingNodeIds) {
        if (!newNodeIds.has(nodeId)) {
          await this.deleteNode(nodeId);
        }
      }

      // Delete removed edges
      for (const edgeId of existingEdgeIds) {
        if (!newEdgeIds.has(edgeId)) {
          await this.deleteEdge(edgeId);
        }
      }

      // Upsert nodes
      for (const node of graph.nodes) {
        if (existingNodeIds.has(node.id)) {
          await this.updateNode(node);
        } else {
          await this.createNode(graph.id, node);
        }
      }

      // Upsert edges
      for (const edge of graph.edges) {
        if (existingEdgeIds.has(edge.id)) {
          await this.updateEdge(edge);
        } else {
          await this.createEdge(graph.id, edge);
        }
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Delete a graph and all its nodes/edges
   */
  async delete(graphId) {
    await this.memgraphService.executeQuery(
      AOPEG_QUERIES.DELETE_GRAPH,
      { graphId }
    );
    // Invalidate cache after delete
    this.invalidateListCache();
    return true;
  }

  /**
   * List graphs with optional filtering
   * Uses optimized single query to fetch graphs with nodes and edges (fixes N+1)
   * Results are cached for improved performance
   */
  async list(domain, status, limit = 100, offset = 0) {
    const params = {
      domain: domain || null,
      status: status || null,
      ...paginationParams(limit, offset),
    };

    // Use cache for list queries
    return this.cache.getOrSet(
      AOPEG_QUERIES.LIST_GRAPHS_FULL,
      params,
      async () => {
        const result = await this.memgraphService.executeQuery(
          AOPEG_QUERIES.LIST_GRAPHS_FULL,
          params
        );

        return result.records.map(record => {
          const graphData = record.get('g')?.properties;
          if (!graphData) return null;

          const nodesData = record.get('nodes') || [];
          const edgesData = record.get('edges') || [];

          const nodes = nodesData.map(n => nodeToGraphNode(n.properties));
          const edges = edgesData.map(e => nodeToGraphEdge(e.properties));

          return recordToGraph(graphData, nodes, edges);
        }).filter(Boolean);
      },
      TTL.SHORT // 30 second cache for list operations
    );
  }

  /**
   * Invalidate list cache (call after save/update/delete operations)
   */
  invalidateListCache() {
    this.cache.invalidate(/^aopeg:graph:/);
  }

  /**
   * Update graph execution stats
   */
  async updateStats(graphId, execution) {
    const graph = await this.get(graphId);
    if (!graph) return;

    const stats = graph.executionStats || {
      totalExecutions: 0,
      avgDuration: 0,
      avgQualityScore: 0,
      successRate: 0,
    };

    const n = stats.totalExecutions;
    stats.totalExecutions = n + 1;

    if (execution.totalDuration) {
      stats.avgDuration = (stats.avgDuration * n + execution.totalDuration) / (n + 1);
    }

    if (execution.finalQualityScore !== undefined) {
      stats.avgQualityScore = (stats.avgQualityScore * n + execution.finalQualityScore) / (n + 1);
    }

    const successCount = stats.successRate * n + (execution.status === 'COMPLETED' ? 1 : 0);
    stats.successRate = successCount / (n + 1);

    await this.memgraphService.executeQuery(
      AOPEG_QUERIES.UPDATE_GRAPH_STATS,
      {
        graphId,
        executionStats: serializeJson(stats),
      }
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // NODE OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create a node in a graph
   */
  async createNode(graphId, node) {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.CREATE_NODE, {
        graphId,
        id: node.id || uuidv4(),
        name: node.name || node.displayName || 'Unnamed Node',
        description: node.description || null,
        executorType: node.executorType,
        parameters: serializeJson(node.parameters),
        dataMapping: serializeJson(node.dataMapping),
        retryPolicy: serializeJson(node.retryPolicy),
        fallbackNodeId: node.fallbackNodeId || null,
        timeout: node.timeout || null,
        position: serializeJson(node.position),
        metadata: serializeJson(node.metadata),
      });

      return node;
    } finally {
      await session.close();
    }
  }

  /**
   * Update a node
   */
  async updateNode(node) {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.UPDATE_NODE, {
        id: node.id,
        name: node.name || node.displayName || 'Unnamed Node',
        description: node.description || null,
        executorType: node.executorType,
        parameters: serializeJson(node.parameters),
        dataMapping: serializeJson(node.dataMapping),
        retryPolicy: serializeJson(node.retryPolicy),
        fallbackNodeId: node.fallbackNodeId || null,
        timeout: node.timeout || null,
        position: serializeJson(node.position),
        metadata: serializeJson(node.metadata),
      });

      return node;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete a node
   */
  async deleteNode(nodeId) {
    await this.memgraphService.executeQuery(
      AOPEG_QUERIES.DELETE_NODE,
      { nodeId }
    );
    return true;
  }

  /**
   * Get all nodes for a graph
   */
  async getNodes(graphId) {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_GRAPH_NODES,
      { graphId }
    );

    return result.records.map(record => {
      const nodeData = record.get('n')?.properties;
      return nodeToGraphNode(nodeData);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EDGE OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create an edge in a graph
   */
  async createEdge(graphId, edge) {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.CREATE_EDGE, {
        graphId,
        id: edge.id || uuidv4(),
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        condition: serializeJson(edge.condition),
        priority: edge.priority || 0,
        dataTransform: serializeJson(edge.dataTransform),
        metadata: serializeJson(edge.metadata),
      });

      return edge;
    } finally {
      await session.close();
    }
  }

  /**
   * Update an edge
   */
  async updateEdge(edge) {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.UPDATE_EDGE, {
        id: edge.id,
        condition: serializeJson(edge.condition),
        priority: edge.priority || 0,
        dataTransform: serializeJson(edge.dataTransform),
        metadata: serializeJson(edge.metadata),
      });

      return edge;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete an edge
   */
  async deleteEdge(edgeId) {
    await this.memgraphService.executeQuery(
      AOPEG_QUERIES.DELETE_EDGE,
      { edgeId }
    );
    return true;
  }

  /**
   * Get all edges for a graph
   */
  async getEdges(graphId) {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_GRAPH_EDGES,
      { graphId }
    );

    return result.records.map(record => {
      const edgeData = record.get('e')?.properties;
      return nodeToGraphEdge(edgeData);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get overall AOPEG statistics
   */
  async getStats() {
    const result = await this.memgraphService.executeQuery(AOPEG_QUERIES.GET_STATS);

    if (result.records.length === 0) {
      return { graphCount: 0, nodeCount: 0, edgeCount: 0, executionCount: 0 };
    }

    const record = result.records[0].toObject();
    return {
      graphCount: Number(record.graphCount) || 0,
      nodeCount: Number(record.nodeCount) || 0,
      edgeCount: Number(record.edgeCount) || 0,
      executionCount: Number(record.executionCount) || 0,
    };
  }

  /**
   * Get domain statistics
   */
  async getDomainStats() {
    const result = await this.memgraphService.executeQuery(AOPEG_QUERIES.GET_DOMAIN_STATS);

    return result.records.map(record => {
      const obj = record.toObject();
      return {
        domain: obj.domain,
        graphCount: Number(obj.graphCount) || 0,
      };
    });
  }

  /**
   * Get executor usage statistics
   */
  async getExecutorUsage(limit = 20) {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_EXECUTOR_USAGE,
      { limit: neo4j.int(limit) }
    );

    return result.records.map(record => {
      const obj = record.toObject();
      return {
        executorType: obj.executorType,
        usageCount: Number(obj.usageCount) || 0,
      };
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ────────────────────────────────────────────────────────────────────────────

let graphRepositoryInstance = null;

/**
 * Get or create the graph repository instance
 */
function getGraphRepository(memgraphService) {
  if (!graphRepositoryInstance) {
    graphRepositoryInstance = new GraphRepository(memgraphService);
  }
  return graphRepositoryInstance;
}

/**
 * Create a new graph repository with specific service
 */
function createGraphRepository(memgraphService) {
  return new GraphRepository(memgraphService);
}

module.exports = {
  GraphRepository,
  getGraphRepository,
  createGraphRepository,
};

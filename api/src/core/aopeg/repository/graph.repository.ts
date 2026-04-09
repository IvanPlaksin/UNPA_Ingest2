/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG GRAPH REPOSITORY
 * Memgraph-based persistence for ExecutionGraph entities
 * Implements IGraphStore interface from execution-orchestrator
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ExecutionGraph,
  GraphNode,
  GraphEdge,
  Execution,
} from '../types/core.types';
import { IGraphStore } from '../engine/execution-orchestrator';
import { AOPEG_LABELS, AOPEG_QUERIES } from './aopeg.schema';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface MemgraphSession {
  run(cypher: string, params?: Record<string, unknown>): Promise<{
    records: Array<{
      get(key: string): { properties: Record<string, unknown> };
      toObject(): Record<string, unknown>;
    }>;
  }>;
  close(): Promise<void>;
}

interface MemgraphDriver {
  session(): MemgraphSession;
}

interface MemgraphServiceInterface {
  driver: MemgraphDriver;
  executeQuery(cypher: string, params?: Record<string, unknown>): Promise<{
    records: Array<{
      get(key: string): { properties: Record<string, unknown> };
      toObject(): Record<string, unknown>;
    }>;
  }>;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

function serializeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function nodeToGraphNode(record: Record<string, unknown>): GraphNode {
  return {
    id: record.id as string,
    name: record.name as string,
    description: record.description as string | undefined,
    executorType: record.executorType as string,
    parameters: parseJson(record.parameters as string) || {},
    dataMapping: parseJson(record.dataMapping as string),
    retryPolicy: parseJson(record.retryPolicy as string),
    fallbackNodeId: record.fallbackNodeId as string | undefined,
    timeout: record.timeout as number | undefined,
    position: parseJson(record.position as string),
    metadata: parseJson(record.metadata as string),
  };
}

function nodeToGraphEdge(record: Record<string, unknown>): GraphEdge {
  return {
    id: record.id as string,
    sourceNodeId: record.sourceNodeId as string,
    targetNodeId: record.targetNodeId as string,
    condition: parseJson(record.condition as string),
    priority: record.priority as number | undefined,
    dataTransform: parseJson(record.dataTransform as string),
    metadata: parseJson(record.metadata as string),
  };
}

function recordToGraph(
  graphRecord: Record<string, unknown>,
  nodes: GraphNode[],
  edges: GraphEdge[]
): ExecutionGraph {
  return {
    id: graphRecord.id as string,
    name: graphRecord.name as string,
    description: graphRecord.description as string | undefined,
    domain: graphRecord.domain as string,
    version: graphRecord.version as string,
    status: graphRecord.status as 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
    nodes,
    edges,
    entryNodeId: graphRecord.entryNodeId as string,
    exitNodeId: graphRecord.exitNodeId as string | undefined,
    defaultParameters: parseJson(graphRecord.defaultParameters as string),
    metadata: parseJson(graphRecord.metadata as string),
    executionStats: parseJson(graphRecord.executionStats as string),
    createdAt: graphRecord.createdAt ? new Date(graphRecord.createdAt as string) : undefined,
    updatedAt: graphRecord.updatedAt ? new Date(graphRecord.updatedAt as string) : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH REPOSITORY
// ────────────────────────────────────────────────────────────────────────────

export class GraphRepository implements IGraphStore {
  private memgraphService: MemgraphServiceInterface;

  constructor(memgraphService: MemgraphServiceInterface) {
    this.memgraphService = memgraphService;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GRAPH CRUD
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Save a new graph or update existing
   */
  async save(graph: ExecutionGraph): Promise<void> {
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
    } finally {
      await session.close();
    }
  }

  /**
   * Get graph by ID with all nodes and edges
   */
  async get(graphId: string): Promise<ExecutionGraph | null> {
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

    const nodesData = record.get('nodes') as Array<{ properties: Record<string, unknown> }> || [];
    const edgesData = record.get('edges') as Array<{ properties: Record<string, unknown> }> || [];

    const nodes = nodesData.map(n => nodeToGraphNode(n.properties));
    const edges = edgesData.map(e => nodeToGraphEdge(e.properties));

    return recordToGraph(graphData, nodes, edges);
  }

  /**
   * Update an existing graph
   */
  async update(graph: ExecutionGraph): Promise<void> {
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
  async delete(graphId: string): Promise<boolean> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.DELETE_GRAPH,
      { graphId }
    );
    return true;
  }

  /**
   * List graphs with optional filtering
   */
  async list(
    domain?: string,
    status?: string,
    limit = 100,
    offset = 0
  ): Promise<ExecutionGraph[]> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.LIST_GRAPHS,
      {
        domain: domain || null,
        status: status || null,
        limit,
        offset,
      }
    );

    const graphs: ExecutionGraph[] = [];

    for (const record of result.records) {
      const graphData = record.get('g')?.properties;
      if (graphData) {
        // Fetch full graph with nodes and edges
        const fullGraph = await this.get(graphData.id as string);
        if (fullGraph) {
          graphs.push(fullGraph);
        }
      }
    }

    return graphs;
  }

  /**
   * Update graph execution stats
   */
  async updateStats(graphId: string, execution: Execution): Promise<void> {
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
  async createNode(graphId: string, node: GraphNode): Promise<GraphNode> {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.CREATE_NODE, {
        graphId,
        id: node.id || uuidv4(),
        name: node.name,
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
  async updateNode(node: GraphNode): Promise<GraphNode> {
    const session = this.memgraphService.driver.session();

    try {
      await session.run(AOPEG_QUERIES.UPDATE_NODE, {
        id: node.id,
        name: node.name,
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
  async deleteNode(nodeId: string): Promise<boolean> {
    await this.memgraphService.executeQuery(
      AOPEG_QUERIES.DELETE_NODE,
      { nodeId }
    );
    return true;
  }

  /**
   * Get all nodes for a graph
   */
  async getNodes(graphId: string): Promise<GraphNode[]> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_GRAPH_NODES,
      { graphId }
    );

    return result.records.map(record => {
      const nodeData = record.get('n')?.properties;
      return nodeToGraphNode(nodeData as Record<string, unknown>);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EDGE OPERATIONS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Create an edge in a graph
   */
  async createEdge(graphId: string, edge: GraphEdge): Promise<GraphEdge> {
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
  async updateEdge(edge: GraphEdge): Promise<GraphEdge> {
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
  async deleteEdge(edgeId: string): Promise<boolean> {
    await this.memgraphService.executeQuery(
      AOPEG_QUERIES.DELETE_EDGE,
      { edgeId }
    );
    return true;
  }

  /**
   * Get all edges for a graph
   */
  async getEdges(graphId: string): Promise<GraphEdge[]> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_GRAPH_EDGES,
      { graphId }
    );

    return result.records.map(record => {
      const edgeData = record.get('e')?.properties;
      return nodeToGraphEdge(edgeData as Record<string, unknown>);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Get overall AOPEG statistics
   */
  async getStats(): Promise<{
    graphCount: number;
    nodeCount: number;
    edgeCount: number;
    executionCount: number;
  }> {
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
  async getDomainStats(): Promise<Array<{ domain: string; graphCount: number }>> {
    const result = await this.memgraphService.executeQuery(AOPEG_QUERIES.GET_DOMAIN_STATS);

    return result.records.map(record => {
      const obj = record.toObject();
      return {
        domain: obj.domain as string,
        graphCount: Number(obj.graphCount) || 0,
      };
    });
  }

  /**
   * Get executor usage statistics
   */
  async getExecutorUsage(limit = 20): Promise<Array<{ executorType: string; usageCount: number }>> {
    const result = await this.memgraphService.executeQuery(
      AOPEG_QUERIES.GET_EXECUTOR_USAGE,
      { limit }
    );

    return result.records.map(record => {
      const obj = record.toObject();
      return {
        executorType: obj.executorType as string,
        usageCount: Number(obj.usageCount) || 0,
      };
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ────────────────────────────────────────────────────────────────────────────

let graphRepositoryInstance: GraphRepository | null = null;

/**
 * Get or create the graph repository instance
 */
export function getGraphRepository(memgraphService: MemgraphServiceInterface): GraphRepository {
  if (!graphRepositoryInstance) {
    graphRepositoryInstance = new GraphRepository(memgraphService);
  }
  return graphRepositoryInstance;
}

/**
 * Create a new graph repository with specific service
 */
export function createGraphRepository(memgraphService: MemgraphServiceInterface): GraphRepository {
  return new GraphRepository(memgraphService);
}

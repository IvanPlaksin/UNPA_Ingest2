/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG MEMGRAPH SCHEMA
 * Schema definitions for AOPEG storage in Memgraph (Core namespace)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// NODE LABELS
// ────────────────────────────────────────────────────────────────────────────

export const AOPEG_LABELS = {
  // Graph definition nodes
  EXECUTION_GRAPH: 'AOPEG_ExecutionGraph',
  GRAPH_NODE: 'AOPEG_GraphNode',
  GRAPH_EDGE: 'AOPEG_GraphEdge',

  // Execution tracking nodes
  EXECUTION: 'AOPEG_Execution',
  NODE_EXECUTION: 'AOPEG_NodeExecution',

  // Template/catalog nodes
  NODE_TEMPLATE: 'AOPEG_NodeTemplate',
  GRAPH_TEMPLATE: 'AOPEG_GraphTemplate',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// RELATIONSHIP TYPES
// ────────────────────────────────────────────────────────────────────────────

export const AOPEG_RELATIONSHIPS = {
  // Graph structure
  CONTAINS_NODE: 'AOPEG_CONTAINS_NODE',
  CONTAINS_EDGE: 'AOPEG_CONTAINS_EDGE',
  CONNECTS_FROM: 'AOPEG_CONNECTS_FROM',
  CONNECTS_TO: 'AOPEG_CONNECTS_TO',

  // Execution tracking
  EXECUTES_GRAPH: 'AOPEG_EXECUTES_GRAPH',
  EXECUTED_NODE: 'AOPEG_EXECUTED_NODE',
  EXECUTION_OF: 'AOPEG_EXECUTION_OF',

  // Templates
  BASED_ON_TEMPLATE: 'AOPEG_BASED_ON_TEMPLATE',
  VERSION_OF: 'AOPEG_VERSION_OF',
} as const;

// ────────────────────────────────────────────────────────────────────────────
// INDEX DEFINITIONS
// ────────────────────────────────────────────────────────────────────────────

export const AOPEG_INDEXES = [
  // ExecutionGraph indexes
  { label: AOPEG_LABELS.EXECUTION_GRAPH, property: 'id', unique: true },
  { label: AOPEG_LABELS.EXECUTION_GRAPH, property: 'name' },
  { label: AOPEG_LABELS.EXECUTION_GRAPH, property: 'domain' },
  { label: AOPEG_LABELS.EXECUTION_GRAPH, property: 'status' },
  { label: AOPEG_LABELS.EXECUTION_GRAPH, property: 'createdAt' },

  // GraphNode indexes
  { label: AOPEG_LABELS.GRAPH_NODE, property: 'id', unique: true },
  { label: AOPEG_LABELS.GRAPH_NODE, property: 'graphId' },
  { label: AOPEG_LABELS.GRAPH_NODE, property: 'executorType' },

  // GraphEdge indexes
  { label: AOPEG_LABELS.GRAPH_EDGE, property: 'id', unique: true },
  { label: AOPEG_LABELS.GRAPH_EDGE, property: 'graphId' },

  // Execution indexes
  { label: AOPEG_LABELS.EXECUTION, property: 'id', unique: true },
  { label: AOPEG_LABELS.EXECUTION, property: 'graphId' },
  { label: AOPEG_LABELS.EXECUTION, property: 'status' },
  { label: AOPEG_LABELS.EXECUTION, property: 'startTime' },

  // NodeExecution indexes
  { label: AOPEG_LABELS.NODE_EXECUTION, property: 'id', unique: true },
  { label: AOPEG_LABELS.NODE_EXECUTION, property: 'executionId' },
  { label: AOPEG_LABELS.NODE_EXECUTION, property: 'nodeId' },
];

// ────────────────────────────────────────────────────────────────────────────
// CYPHER TEMPLATES
// ────────────────────────────────────────────────────────────────────────────

export const AOPEG_QUERIES = {
  // ──────────────────────────────────────────────────────────────────────────
  // GRAPH CRUD
  // ──────────────────────────────────────────────────────────────────────────

  CREATE_GRAPH: `
    CREATE (g:${AOPEG_LABELS.EXECUTION_GRAPH} {
      id: $id,
      name: $name,
      description: $description,
      domain: $domain,
      version: $version,
      status: $status,
      entryNodeId: $entryNodeId,
      exitNodeId: $exitNodeId,
      defaultParameters: $defaultParameters,
      metadata: $metadata,
      executionStats: $executionStats,
      createdAt: datetime(),
      updatedAt: datetime(),
      fullNamespace: 'core'
    })
    RETURN g
  `,

  GET_GRAPH_BY_ID: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})
    OPTIONAL MATCH (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_NODE}]->(n:${AOPEG_LABELS.GRAPH_NODE})
    OPTIONAL MATCH (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_EDGE}]->(e:${AOPEG_LABELS.GRAPH_EDGE})
    RETURN g, collect(DISTINCT n) as nodes, collect(DISTINCT e) as edges
  `,

  UPDATE_GRAPH: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $id})
    SET g.name = $name,
        g.description = $description,
        g.domain = $domain,
        g.version = $version,
        g.status = $status,
        g.entryNodeId = $entryNodeId,
        g.exitNodeId = $exitNodeId,
        g.defaultParameters = $defaultParameters,
        g.metadata = $metadata,
        g.executionStats = $executionStats,
        g.updatedAt = datetime()
    RETURN g
  `,

  DELETE_GRAPH: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})
    OPTIONAL MATCH (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_NODE}]->(n:${AOPEG_LABELS.GRAPH_NODE})
    OPTIONAL MATCH (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_EDGE}]->(e:${AOPEG_LABELS.GRAPH_EDGE})
    DETACH DELETE g, n, e
  `,

  LIST_GRAPHS: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH})
    WHERE ($domain IS NULL OR g.domain = $domain)
      AND ($status IS NULL OR g.status = $status)
    RETURN g
    ORDER BY g.createdAt DESC
    SKIP $offset
    LIMIT $limit
  `,

  // ──────────────────────────────────────────────────────────────────────────
  // NODE CRUD
  // ──────────────────────────────────────────────────────────────────────────

  CREATE_NODE: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})
    CREATE (n:${AOPEG_LABELS.GRAPH_NODE} {
      id: $id,
      graphId: $graphId,
      name: $name,
      description: $description,
      executorType: $executorType,
      parameters: $parameters,
      dataMapping: $dataMapping,
      retryPolicy: $retryPolicy,
      fallbackNodeId: $fallbackNodeId,
      timeout: $timeout,
      position: $position,
      metadata: $metadata
    })
    CREATE (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_NODE}]->(n)
    RETURN n
  `,

  UPDATE_NODE: `
    MATCH (n:${AOPEG_LABELS.GRAPH_NODE} {id: $id})
    SET n.name = $name,
        n.description = $description,
        n.executorType = $executorType,
        n.parameters = $parameters,
        n.dataMapping = $dataMapping,
        n.retryPolicy = $retryPolicy,
        n.fallbackNodeId = $fallbackNodeId,
        n.timeout = $timeout,
        n.position = $position,
        n.metadata = $metadata
    RETURN n
  `,

  DELETE_NODE: `
    MATCH (n:${AOPEG_LABELS.GRAPH_NODE} {id: $nodeId})
    DETACH DELETE n
  `,

  GET_GRAPH_NODES: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})-[:${AOPEG_RELATIONSHIPS.CONTAINS_NODE}]->(n:${AOPEG_LABELS.GRAPH_NODE})
    RETURN n
    ORDER BY n.name
  `,

  // ──────────────────────────────────────────────────────────────────────────
  // EDGE CRUD
  // ──────────────────────────────────────────────────────────────────────────

  CREATE_EDGE: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})
    MATCH (from:${AOPEG_LABELS.GRAPH_NODE} {id: $sourceNodeId})
    MATCH (to:${AOPEG_LABELS.GRAPH_NODE} {id: $targetNodeId})
    CREATE (e:${AOPEG_LABELS.GRAPH_EDGE} {
      id: $id,
      graphId: $graphId,
      sourceNodeId: $sourceNodeId,
      targetNodeId: $targetNodeId,
      condition: $condition,
      priority: $priority,
      dataTransform: $dataTransform,
      metadata: $metadata
    })
    CREATE (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_EDGE}]->(e)
    CREATE (e)-[:${AOPEG_RELATIONSHIPS.CONNECTS_FROM}]->(from)
    CREATE (e)-[:${AOPEG_RELATIONSHIPS.CONNECTS_TO}]->(to)
    RETURN e
  `,

  UPDATE_EDGE: `
    MATCH (e:${AOPEG_LABELS.GRAPH_EDGE} {id: $id})
    SET e.condition = $condition,
        e.priority = $priority,
        e.dataTransform = $dataTransform,
        e.metadata = $metadata
    RETURN e
  `,

  DELETE_EDGE: `
    MATCH (e:${AOPEG_LABELS.GRAPH_EDGE} {id: $edgeId})
    DETACH DELETE e
  `,

  GET_GRAPH_EDGES: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})-[:${AOPEG_RELATIONSHIPS.CONTAINS_EDGE}]->(e:${AOPEG_LABELS.GRAPH_EDGE})
    RETURN e
    ORDER BY e.priority DESC
  `,

  // ──────────────────────────────────────────────────────────────────────────
  // EXECUTION TRACKING
  // ──────────────────────────────────────────────────────────────────────────

  CREATE_EXECUTION: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})
    CREATE (e:${AOPEG_LABELS.EXECUTION} {
      id: $id,
      graphId: $graphId,
      graphVersion: $graphVersion,
      status: $status,
      input: $input,
      output: $output,
      variables: $variables,
      pathTaken: $pathTaken,
      error: $error,
      startTime: datetime($startTime),
      endTime: $endTime,
      totalDuration: $totalDuration,
      finalQualityScore: $finalQualityScore
    })
    CREATE (e)-[:${AOPEG_RELATIONSHIPS.EXECUTES_GRAPH}]->(g)
    RETURN e
  `,

  UPDATE_EXECUTION: `
    MATCH (e:${AOPEG_LABELS.EXECUTION} {id: $id})
    SET e.status = $status,
        e.output = $output,
        e.pathTaken = $pathTaken,
        e.error = $error,
        e.endTime = CASE WHEN $endTime IS NOT NULL THEN datetime($endTime) ELSE e.endTime END,
        e.totalDuration = $totalDuration,
        e.finalQualityScore = $finalQualityScore
    RETURN e
  `,

  GET_EXECUTION_BY_ID: `
    MATCH (e:${AOPEG_LABELS.EXECUTION} {id: $executionId})
    OPTIONAL MATCH (e)-[:${AOPEG_RELATIONSHIPS.EXECUTED_NODE}]->(ne:${AOPEG_LABELS.NODE_EXECUTION})
    RETURN e, collect(ne) as nodeExecutions
  `,

  LIST_EXECUTIONS: `
    MATCH (e:${AOPEG_LABELS.EXECUTION})
    WHERE ($graphId IS NULL OR e.graphId = $graphId)
      AND ($status IS NULL OR e.status = $status)
    RETURN e
    ORDER BY e.startTime DESC
    SKIP $offset
    LIMIT $limit
  `,

  CREATE_NODE_EXECUTION: `
    MATCH (e:${AOPEG_LABELS.EXECUTION} {id: $executionId})
    CREATE (ne:${AOPEG_LABELS.NODE_EXECUTION} {
      id: $id,
      executionId: $executionId,
      nodeId: $nodeId,
      executorType: $executorType,
      startTime: datetime($startTime),
      endTime: datetime($endTime),
      duration: $duration,
      success: $success,
      qualityScore: $qualityScore,
      error: $error,
      metrics: $metrics,
      retryCount: $retryCount
    })
    CREATE (e)-[:${AOPEG_RELATIONSHIPS.EXECUTED_NODE}]->(ne)
    RETURN ne
  `,

  // ──────────────────────────────────────────────────────────────────────────
  // STATISTICS
  // ──────────────────────────────────────────────────────────────────────────

  UPDATE_GRAPH_STATS: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH} {id: $graphId})
    SET g.executionStats = $executionStats,
        g.updatedAt = datetime()
    RETURN g
  `,

  GET_STATS: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH})
    OPTIONAL MATCH (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_NODE}]->(n:${AOPEG_LABELS.GRAPH_NODE})
    OPTIONAL MATCH (g)-[:${AOPEG_RELATIONSHIPS.CONTAINS_EDGE}]->(e:${AOPEG_LABELS.GRAPH_EDGE})
    OPTIONAL MATCH (ex:${AOPEG_LABELS.EXECUTION})-[:${AOPEG_RELATIONSHIPS.EXECUTES_GRAPH}]->(g)
    RETURN
      count(DISTINCT g) as graphCount,
      count(DISTINCT n) as nodeCount,
      count(DISTINCT e) as edgeCount,
      count(DISTINCT ex) as executionCount
  `,

  GET_DOMAIN_STATS: `
    MATCH (g:${AOPEG_LABELS.EXECUTION_GRAPH})
    RETURN g.domain as domain, count(g) as graphCount
    ORDER BY graphCount DESC
  `,

  GET_EXECUTOR_USAGE: `
    MATCH (n:${AOPEG_LABELS.GRAPH_NODE})
    RETURN n.executorType as executorType, count(n) as usageCount
    ORDER BY usageCount DESC
    LIMIT $limit
  `,
};

// ────────────────────────────────────────────────────────────────────────────
// SCHEMA INITIALIZATION
// ────────────────────────────────────────────────────────────────────────────

export const CREATE_INDEXES_QUERY = AOPEG_INDEXES.map(idx =>
  idx.unique
    ? `CREATE CONSTRAINT ON (n:${idx.label}) ASSERT n.${idx.property} IS UNIQUE`
    : `CREATE INDEX ON :${idx.label}(${idx.property})`
).join(';\n');

/**
 * Get Cypher for creating all AOPEG indexes
 */
export function getCreateIndexesCypher(): string[] {
  return AOPEG_INDEXES.map(idx =>
    idx.unique
      ? `CREATE CONSTRAINT ON (n:${idx.label}) ASSERT n.${idx.property} IS UNIQUE`
      : `CREATE INDEX ON :${idx.label}(${idx.property})`
  );
}

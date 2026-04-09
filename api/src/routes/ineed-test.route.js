/**
 * iNeed Test Routes
 *
 * REST endpoints for manual testing of iNeed business process graphs.
 *
 * Routes:
 *   POST /api/v1/ineed/submit          - Submit request to META-GRAPH
 *   GET  /api/v1/ineed/graphs          - List loaded graphs
 *   GET  /api/v1/ineed/graphs/:id      - Get graph definition
 *   GET  /api/v1/ineed/test-users      - List test users
 *   POST /api/v1/ineed/load-graphs     - Load/reload graph definitions
 */

const express = require('express');
const router = express.Router();
const { GraphLoaderService } = require('../services/graph-definitions/graph-loader.service');

// ====================================================================
// Lazy-initialized services
// ====================================================================

let graphLoader = null;

function getGraphLoader() {
  if (!graphLoader) {
    graphLoader = new GraphLoaderService(null, null);
  }
  return graphLoader;
}

// ====================================================================
// ROUTES
// ====================================================================

/**
 * POST /api/v1/ineed/submit
 *
 * Submit a service request to the META-GRAPH.
 * Requires RuntimeEngine to be available via req.app.
 */
router.post('/submit', async (req, res) => {
  const { user_id, raw_text, channel = 'api' } = req.body;

  if (!user_id || !raw_text) {
    return res.status(400).json({ error: 'user_id and raw_text are required' });
  }

  try {
    const loader = getGraphLoader();
    const metaGraph = loader.getGraph('INEED-G0-META-INTAKE-V1');
    if (!metaGraph) {
      return res.status(500).json({ error: 'META-GRAPH not loaded' });
    }

    // Convert to AOPEG DAG format
    const dag = toAOPEGDag(metaGraph);

    // Get or create RuntimeEngine (depends on app setup)
    const engine = req.app.get('runtimeEngine');
    if (!engine) {
      return res.status(503).json({
        error: 'RuntimeEngine not available',
        hint: 'Graph definitions loaded but engine not initialized',
        dag_summary: {
          graph_id: metaGraph.graph_id,
          nodes: metaGraph.nodes.length,
          edges: metaGraph.edges.length,
        },
      });
    }

    const execution = await engine.execute(dag, { user_id, raw_text, channel });

    res.json({
      success: true,
      execution_id: execution.executionId,
      status: execution.status,
      waiting_nodes: execution.waitingNodes || [],
      metrics: execution.metrics,
      outputs: execution.output,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/ineed/graphs
 *
 * List all loaded graph definitions with summary.
 */
router.get('/graphs', (req, res) => {
  const loader = getGraphLoader();
  const graphs = loader.listGraphs();

  res.json({
    count: graphs.length,
    graphs: graphs.map(g => {
      const def = loader.getGraph(g.graphId);
      const waitNodes = def.nodes.filter(n => n.type === 'wait_input').length;
      const conditions = def.nodes.filter(n => n.type === 'condition').length;
      const llmNodes = def.nodes.filter(n => n.type === 'ai_node').length;

      return {
        ...g,
        wait_input_count: waitNodes,
        condition_count: conditions,
        llm_node_count: llmNodes,
      };
    }),
  });
});

/**
 * GET /api/v1/ineed/graphs/:id
 *
 * Get full graph definition by ID.
 */
router.get('/graphs/:id', (req, res) => {
  const loader = getGraphLoader();
  const graph = loader.getGraph(req.params.id);

  if (!graph) {
    return res.status(404).json({ error: `Graph ${req.params.id} not found` });
  }

  res.json({
    graph,
    aopeg_dag: toAOPEGDag(graph),
  });
});

/**
 * GET /api/v1/ineed/test-users
 *
 * List test user profiles. Requires Memgraph connection.
 */
router.get('/test-users', async (req, res) => {
  try {
    const memgraph = require('../services/memgraph.service');

    const result = await memgraph.queryWithNamespace(`
      MATCH (u:UNStaffProfile)
      OPTIONAL MATCH (u)-[:REPORTS_TO]->(m:UNStaffProfile)
      RETURN u.user_id AS id, u.full_name AS name,
             u.duty_station AS duty_station, u.dept AS dept,
             u.role AS role, u.clearance_level AS clearance,
             m.full_name AS manager_name
      ORDER BY u.user_id
    `);

    res.json({ users: result });
  } catch (error) {
    res.status(500).json({ error: error.message, hint: 'Memgraph may not be running' });
  }
});

/**
 * POST /api/v1/ineed/load-graphs
 *
 * Load or reload all graph definitions into PatternLibrary and Memgraph.
 */
router.post('/load-graphs', async (req, res) => {
  try {
    let memgraph = null;
    try {
      memgraph = require('../services/memgraph.service');
    } catch (_) { /* Memgraph not available */ }

    const patternLibrary = req.app.get('patternLibrary') || null;

    graphLoader = new GraphLoaderService(patternLibrary, memgraph);
    const results = await graphLoader.loadAll();

    res.json({
      success: true,
      loaded: results.length,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ====================================================================
// HELPERS
// ====================================================================

/**
 * Convert ReactFlow-style graph to AOPEG DAG format
 */
function toAOPEGDag(graphDef) {
  const startNode = graphDef.nodes.find(n => n.type === 'start');
  const endNodes = graphDef.nodes.filter(n => n.type === 'end');

  return {
    id: graphDef.graph_id,
    nodes: graphDef.nodes.map(n => ({
      id: n.id,
      executorType: n.data.tool,
      parameters: n.data.config || {},
      metadata: {
        label: n.data.label,
        type: n.type,
        position: n.position,
      },
    })),
    edges: graphDef.edges.map(e => ({
      id: e.id,
      sourceNodeId: e.source,
      targetNodeId: e.target,
      label: e.label || undefined,
    })),
    entryNodeId: startNode?.id,
    exitNodeIds: endNodes.map(n => n.id),
  };
}

module.exports = router;

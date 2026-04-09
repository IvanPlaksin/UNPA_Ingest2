/**
 * CRUD API for STRUCTURAL and CONSTRAINT graph editing.
 *
 * GET    /api/v1/structural                        — List all STRUCTURAL graphs
 * GET    /api/v1/structural/:graphId               — Get one with nodes/edges
 * POST   /api/v1/structural                        — Create new
 * PUT    /api/v1/structural/:graphId               — Update nodes/edges
 * DELETE /api/v1/structural/:graphId               — Delete
 * GET    /api/v1/structural/:graphId/constraints   — Get linked CONSTRAINTs
 * PUT    /api/v1/structural/:graphId/constraints   — Save CONSTRAINT
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

let memgraph;
let formService;

function initStructuralRoutes(memgraphService, structuralFormService) {
  memgraph = memgraphService;
  formService = structuralFormService || null;
  return router;
}

// ── LIST ──────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const rows = await memgraph.runQuery(
      'MATCH (s:GraphDefinition {graphType: "STRUCTURAL"}) ' +
      'OPTIONAL MATCH (c:GraphDefinition {graphType: "CONSTRAINT"})-[:CONSTRAINS]->(s) ' +
      'RETURN s.graphId AS graphId, s.name AS name, s.namespace AS namespace, ' +
      's.nodeCount AS nodeCount, s.edgeCount AS edgeCount, ' +
      'c.graphId AS constraintGraphId, c.nodeCount AS constraintRuleCount ' +
      'ORDER BY s.namespace, s.name'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET ONE ───────────────────────────────────────────────────────────────

router.get('/:graphId', async (req, res) => {
  try {
    const rows = await memgraph.runQuery(
      'MATCH (g:GraphDefinition {graphId: $gid, graphType: "STRUCTURAL"}) ' +
      'RETURN g.graphId AS graphId, g.name AS name, g.namespace AS namespace, ' +
      'g.nodes AS nodes, g.edges AS edges, g.nodeCount AS nodeCount, g.edgeCount AS edgeCount',
      { gid: req.params.graphId }
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Not found' });

    const r = rows[0];
    res.json({
      success: true,
      data: {
        graphId: r.graphId,
        name: r.name,
        namespace: r.namespace,
        nodes: typeof r.nodes === 'string' ? JSON.parse(r.nodes) : r.nodes,
        edges: typeof r.edges === 'string' ? JSON.parse(r.edges) : r.edges,
        nodeCount: r.nodeCount,
        edgeCount: r.edgeCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── CREATE ────────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name, namespace = 'FLOWDESK', nodes = [], edges = [] } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const graphId = `structural_${name.replace(/\s+/g, '_')}_${uuidv4().slice(0, 8)}`;

    await memgraph.runQuery(
      'CREATE (g:GraphDefinition {graphId: $graphId, name: $name, namespace: $namespace, ' +
      'graphType: "STRUCTURAL", graphDimension: "DATA", ' +
      'nodes: $nodes, edges: $edges, nodeCount: $nodeCount, edgeCount: $edgeCount, ' +
      'createdAt: datetime(), updatedAt: datetime()}) RETURN g.graphId',
      {
        graphId, name, namespace,
        nodes: JSON.stringify(nodes), edges: JSON.stringify(edges),
        nodeCount: nodes.length, edgeCount: edges.length,
      }
    );

    res.json({ success: true, data: { graphId, name, namespace } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── UPDATE ────────────────────────────────────────────────────────────────

router.put('/:graphId', async (req, res) => {
  try {
    const { name, namespace, nodes, edges } = req.body;
    const gid = req.params.graphId;

    const sets = ['g.updatedAt = datetime()'];
    const params = { gid };

    if (name !== undefined) { sets.push('g.name = $name'); params.name = name; }
    if (namespace !== undefined) { sets.push('g.namespace = $namespace'); params.namespace = namespace; }
    if (nodes !== undefined) {
      sets.push('g.nodes = $nodes, g.nodeCount = $nodeCount');
      params.nodes = JSON.stringify(nodes);
      params.nodeCount = nodes.length;
    }
    if (edges !== undefined) {
      sets.push('g.edges = $edges, g.edgeCount = $edgeCount');
      params.edges = JSON.stringify(edges);
      params.edgeCount = edges.length;
    }

    const result = await memgraph.runQuery(
      `MATCH (g:GraphDefinition {graphId: $gid, graphType: "STRUCTURAL"}) SET ${sets.join(', ')} RETURN g.graphId AS graphId`,
      params
    );

    if (!result.length) return res.status(404).json({ success: false, error: 'Not found' });
    if (formService) formService.clearCache(gid);
    res.json({ success: true, data: { graphId: gid } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── DELETE ─────────────────────────────────────────────────────────────────

router.delete('/:graphId', async (req, res) => {
  try {
    await memgraph.runQuery(
      'MATCH (g:GraphDefinition {graphId: $gid, graphType: "STRUCTURAL"}) DETACH DELETE g',
      { gid: req.params.graphId }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── CONSTRAINTS ───────────────────────────────────────────────────────────

router.get('/:graphId/constraints', async (req, res) => {
  try {
    const rows = await memgraph.runQuery(
      'MATCH (c:GraphDefinition {graphType: "CONSTRAINT"})-[:CONSTRAINS]->(s:GraphDefinition {graphId: $gid}) ' +
      'RETURN c.graphId AS graphId, c.name AS name, c.nodes AS nodes, c.edges AS edges',
      { gid: req.params.graphId }
    );
    if (!rows.length) return res.json({ success: true, data: null });

    const r = rows[0];
    res.json({
      success: true,
      data: {
        graphId: r.graphId,
        name: r.name,
        nodes: typeof r.nodes === 'string' ? JSON.parse(r.nodes) : r.nodes,
        edges: typeof r.edges === 'string' ? JSON.parse(r.edges) : r.edges,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:graphId/constraints', async (req, res) => {
  try {
    const structuralId = req.params.graphId;
    const { nodes = [], edges = [] } = req.body;
    let { graphId: constraintId, name } = req.body;

    if (!constraintId) {
      constraintId = `constraint_${structuralId}_${uuidv4().slice(0, 8)}`;
    }
    if (!name) name = `Constraints for ${structuralId}`;

    await memgraph.runQuery(
      'MERGE (c:GraphDefinition {graphId: $cid}) ' +
      'SET c.name = $name, c.graphType = "CONSTRAINT", c.graphDimension = "GOVERNANCE", ' +
      'c.structuralGraphId = $sid, c.namespace = "FLOWDESK", ' +
      'c.nodes = $nodes, c.edges = $edges, c.nodeCount = $nodeCount, c.edgeCount = $edgeCount, ' +
      'c.updatedAt = datetime() ' +
      'WITH c ' +
      'MATCH (s:GraphDefinition {graphId: $sid}) ' +
      'MERGE (c)-[:CONSTRAINS]->(s) ' +
      'RETURN c.graphId',
      {
        cid: constraintId, sid: structuralId, name,
        nodes: JSON.stringify(nodes), edges: JSON.stringify(edges),
        nodeCount: nodes.length, edgeCount: edges.length,
      }
    );

    if (formService) formService.clearCache(structuralId);
    res.json({ success: true, data: { graphId: constraintId } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = { router, initStructuralRoutes };

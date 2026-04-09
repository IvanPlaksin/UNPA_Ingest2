/**
 * SubGraph Controller — REST API for subgraph consolidation operations.
 *
 * Endpoints:
 *   POST /analyze    — structural analysis
 *   POST /segment    — find cluster candidates
 *   POST /extract    — create SubGraph from cluster
 *   POST /consolidate — consolidate with checkpoint
 *   POST /rollback   — rollback from checkpoint
 *   GET  /list       — list subgraphs
 *   GET  /checkpoints — list checkpoints
 *   GET  /:id        — get subgraph details
 *   GET  /:id/expand — get internal nodes/edges
 */

const { GraphAnalyzer } = require('../services/graph/graph-analyzer');
const { SubgraphSegmentationService } = require('../services/graph/subgraph-segmentation.service');
const { SubGraphExtractor } = require('../services/graph/subgraph-extractor');
const { BoundaryResolver } = require('../services/graph/boundary-resolver');
const { SubgraphAdapter } = require('../services/immutable-graph/integration/subgraph-adapter');
const memgraphService = require('../services/memgraph.service');

const { SubgraphValidator } = require('../services/graph/subgraph-validator');

const analyzer = new GraphAnalyzer();
const segmentation = new SubgraphSegmentationService();
const extractor = new SubGraphExtractor();
const boundaryResolver = new BoundaryResolver();
const adapter = new SubgraphAdapter();
const validator = new SubgraphValidator();

// ── Helpers ────────────────────────────────────────────

function _num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toNumber === 'function') return v.toNumber();
  return Number(v) || 0;
}

async function getSubgraphMembers(sgId, ns) {
  const session = memgraphService.driver.session();
  try {
    const res = await session.run(`
      MATCH (sg:SubGraph {id: $sgId})-[:CONTAINS_MEMBER]->(m)
      WHERE m.namespace = $ns
      RETURN m.id AS id
    `, { sgId, ns });
    return res.records.map(r => r.get('id'));
  } finally {
    await session.close();
  }
}

// ── Controller ─────────────────────────────────────────

exports.analyze = async (req, res, next) => {
  try {
    const { namespace } = req.body;
    if (!namespace) return res.status(400).json({ error: 'namespace required' });

    const result = await analyzer.analyze(namespace);
    res.json(result);
  } catch (err) { next(err); }
};

exports.segment = async (req, res, next) => {
  try {
    const { namespace, strategies, useLlm, minCoherence } = req.body;
    if (!namespace) return res.status(400).json({ error: 'namespace required' });

    const result = await segmentation.analyze(namespace, {
      strategies: strategies || ['community', 'ontology'],
      useLlm: useLlm !== false,
      minCoherence: minCoherence || 0.3,
    });

    res.json({
      candidates: result.candidates.map(c => ({
        strategy: c.strategy,
        name: c.suggestedName,
        nodeIds: c.nodes,
        nodeCount: c.nodeCount,
        coherenceScore: c.coherenceScore,
      })),
      bestCandidate: result.bestCandidate ? {
        name: result.bestCandidate.suggestedName,
        nodeIds: result.bestCandidate.nodes,
        nodeCount: result.bestCandidate.nodeCount,
        coherenceScore: result.bestCandidate.coherenceScore,
        strategy: result.bestCandidate.strategy,
      } : null,
    });
  } catch (err) { next(err); }
};

exports.extract = async (req, res, next) => {
  try {
    const { namespace, nodeIds, name, metadata } = req.body;
    if (!namespace || !nodeIds?.length) {
      return res.status(400).json({ error: 'namespace and nodeIds[] required' });
    }

    // 1. Extract
    const extraction = await extractor.extract({
      namespace,
      clusterNodeIds: nodeIds,
      name: name || 'Unnamed SubGraph',
      metadata,
    });

    // 2. Boundary resolution
    const boundary = await boundaryResolver.resolve({
      subgraphId: extraction.subgraph.id,
      namespace,
      clusterNodeIds: nodeIds,
    });

    res.json({
      subgraphId: extraction.subgraph.id,
      name: extraction.subgraph.name,
      namespace,
      subNamespace: extraction.subgraph.subNamespace,
      nodeCount: extraction.subgraph.nodeCount,
      internalEdgeCount: extraction.subgraph.internalEdgeCount,
      boundaryInterface: {
        ports: boundary.ports,
        totalBoundaryEdges: boundary.boundaryEdgeCount,
      },
      status: 'extracted',
    });
  } catch (err) { next(err); }
};

exports.consolidate = async (req, res, next) => {
  try {
    const { subgraphId, namespace } = req.body;
    if (!subgraphId || !namespace) {
      return res.status(400).json({ error: 'subgraphId and namespace required' });
    }

    const members = await getSubgraphMembers(subgraphId, namespace);
    if (members.length === 0) {
      return res.status(404).json({ error: `SubGraph ${subgraphId} has no members in namespace "${namespace}"` });
    }

    const tx = await adapter.beginConsolidation(subgraphId, namespace, members);
    const result = await adapter.commitConsolidation(tx);

    res.json({
      subgraphId,
      checkpointId: tx.checkpointId,
      transactionId: tx.transactionId,
      status: 'consolidated',
      statistics: {
        nodesArchived: result.archivedNodes,
        internalEdgesRemoved: result.removedEdges,
        boundaryEdgesRewired: result.rewiredEdges,
      },
      rollbackAvailable: true,
    });
  } catch (err) { next(err); }
};

exports.validate = async (req, res, next) => {
  try {
    const { subgraphId, namespace } = req.body;
    if (!subgraphId || !namespace) {
      return res.status(400).json({ error: 'subgraphId and namespace required' });
    }

    const validation = await validator.validateSubgraph(subgraphId, namespace);
    res.json({ subgraphId, namespace, validation });
  } catch (err) { next(err); }
};

exports.rollback = async (req, res, next) => {
  try {
    const { checkpointId } = req.body;
    if (!checkpointId) {
      return res.status(400).json({ error: 'checkpointId required' });
    }

    const result = await adapter.rollbackFromCheckpoint(checkpointId);

    res.json({
      checkpointId,
      subgraphId: result.subgraphId,
      status: 'rolled_back',
      statistics: {
        edgesRestored: result.restoredEdges,
        nodesUnarchived: result.restoredNodes,
      },
    });
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    const namespace = req.query.namespace;
    const session = memgraphService.driver.session();
    try {
      const query = namespace
        ? 'MATCH (sg:SubGraph {namespace: $ns}) RETURN sg ORDER BY sg.createdAt DESC'
        : 'MATCH (sg:SubGraph) RETURN sg ORDER BY sg.createdAt DESC';

      const result = await session.run(query, namespace ? { ns: namespace } : {});
      const subgraphs = result.records.map(r => {
        const sg = r.get('sg').properties;
        return {
          id: sg.id,
          name: sg.name,
          namespace: sg.namespace,
          status: sg.status,
          nodeCount: _num(sg.nodeCount),
          internalEdgeCount: _num(sg.internalEdgeCount),
          checkpointId: sg.checkpointId || null,
        };
      });
      res.json(subgraphs);
    } finally {
      await session.close();
    }
  } catch (err) { next(err); }
};

exports.listCheckpoints = async (req, res, next) => {
  try {
    const namespace = req.query.namespace;
    if (!namespace) return res.status(400).json({ error: 'namespace query param required' });

    const checkpoints = await adapter.listCheckpoints(namespace);
    res.json(checkpoints);
  } catch (err) { next(err); }
};

exports.getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = memgraphService.driver.session();
    try {
      const sgRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})
        RETURN sg
      `, { id });

      if (sgRes.records.length === 0) {
        return res.status(404).json({ error: `SubGraph ${id} not found` });
      }

      const sg = sgRes.records[0].get('sg').properties;

      // Get ports
      const portRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:PORT_OF]->(p:SubGraphPort)
        RETURN p
      `, { id });
      const ports = portRes.records.map(r => r.get('p').properties);

      // Get member count
      const memberRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:CONTAINS_MEMBER]->(m)
        RETURN count(m) AS cnt
      `, { id });

      res.json({
        ...sg,
        nodeCount: _num(sg.nodeCount),
        ports,
        memberCount: _num(memberRes.records[0]?.get('cnt')),
      });
    } finally {
      await session.close();
    }
  } catch (err) { next(err); }
};

exports.expand = async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = memgraphService.driver.session();
    try {
      // Get members
      const nodesRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:CONTAINS_MEMBER]->(m)
        RETURN m
      `, { id });

      if (nodesRes.records.length === 0) {
        return res.status(404).json({ error: `SubGraph ${id} not found or has no members` });
      }

      const nodes = nodesRes.records.map(r => {
        const props = r.get('m').properties;
        return { id: props.id, name: props.name, type: props.type || r.get('m').labels?.[0], properties: props };
      });

      const nodeIds = nodes.map(n => n.id);
      const ns = nodes[0]?.properties?.namespace;

      // Get internal edges
      const edgesRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND b.id IN $ids
          AND a.namespace = $ns AND b.namespace = $ns
          AND NOT type(r) IN ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK']
        RETURN a.id AS source, b.id AS target, type(r) AS type
      `, { ids: nodeIds, ns: ns || '' });

      const edges = edgesRes.records.map(r => ({
        source: r.get('source'),
        target: r.get('target'),
        type: r.get('type'),
      }));

      // Get ports
      const portRes = await session.run(`
        MATCH (sg:SubGraph {id: $id})-[:PORT_OF]->(p:SubGraphPort)
        RETURN p
      `, { id });
      const ports = portRes.records.map(r => r.get('p').properties);

      res.json({
        subgraphId: id,
        nodes,
        edges,
        ports,
      });
    } finally {
      await session.close();
    }
  } catch (err) { next(err); }
};

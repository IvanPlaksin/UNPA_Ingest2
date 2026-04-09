/**
 * BoundaryResolver — finds boundary edges crossing a subgraph boundary
 * and creates SubGraphPort nodes to represent typed entry/exit points.
 *
 * Port model:
 *   (:SubGraph)-[:PORT_OF]->(:SubGraphPort)-[:BRIDGES_TO]->(externalNode)
 *
 * Each port captures:
 *   - direction: IN | OUT | BIDI
 *   - the internal node it connects to
 *   - the external node it bridges to
 *   - the original relationship type
 */

const { v4: uuidv4 } = require('uuid');
const memgraphService = require('../memgraph.service');

class BoundaryResolver {
  constructor() {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Resolve boundary for an extracted subgraph.
   *
   * @param {{
   *   subgraphId: string,
   *   namespace: string,
   *   clusterNodeIds: string[]
   * }} params
   * @returns {Promise<BoundaryResult>}
   */
  async resolve(params) {
    const { subgraphId, namespace, clusterNodeIds } = params;
    const session = this._session();
    const memberSet = new Set(clusterNodeIds);

    try {
      // ── 1. Find all boundary edges ─────────────────────────
      // Infrastructure edge types to ignore (created by extraction itself)
      const INFRA_TYPES = ['CONTAINS_MEMBER', 'PORT_OF', 'BRIDGES_TO', 'CONNECTS_INTERNAL', 'SUBGRAPH_LINK'];

      // Outgoing: internal → external
      const outRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.id IN $ids AND a.namespace = $ns
          AND NOT b.id IN $ids
          AND b.namespace = $ns
          AND NOT type(r) IN $infraTypes
        RETURN a.id AS internalId, b.id AS externalId,
               type(r) AS relType, 'OUT' AS direction
      `, { ids: clusterNodeIds, ns: namespace, infraTypes: INFRA_TYPES });

      // Incoming: external → internal
      const inRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE b.id IN $ids AND b.namespace = $ns
          AND NOT a.id IN $ids
          AND a.namespace = $ns
          AND NOT type(r) IN $infraTypes
        RETURN b.id AS internalId, a.id AS externalId,
               type(r) AS relType, 'IN' AS direction
      `, { ids: clusterNodeIds, ns: namespace, infraTypes: INFRA_TYPES });

      // ── 2. Merge into boundary edge list ───────────────────
      const boundaryEdges = [];
      for (const rec of outRes.records) {
        boundaryEdges.push({
          internalId: rec.get('internalId'),
          externalId: rec.get('externalId'),
          relType: rec.get('relType'),
          direction: rec.get('direction'),
        });
      }
      for (const rec of inRes.records) {
        boundaryEdges.push({
          internalId: rec.get('internalId'),
          externalId: rec.get('externalId'),
          relType: rec.get('relType'),
          direction: rec.get('direction'),
        });
      }

      if (boundaryEdges.length === 0) {
        console.log(`[BoundaryResolver] No boundary edges for subgraph ${subgraphId}`);
        return { subgraphId, ports: [], boundaryEdgeCount: 0 };
      }

      // ── 3. Detect BIDI (same pair has both IN and OUT) ─────
      const pairMap = new Map(); // key: "internalId|externalId" → directions[]
      for (const edge of boundaryEdges) {
        const key = `${edge.internalId}|${edge.externalId}`;
        if (!pairMap.has(key)) {
          pairMap.set(key, { ...edge, directions: new Set([edge.direction]) });
        } else {
          pairMap.get(key).directions.add(edge.direction);
        }
      }

      // ── 4. Create SubGraphPort nodes ───────────────────────
      const ports = [];
      let seq = 0;

      for (const [key, info] of pairMap) {
        seq++;
        const portId = `port-${subgraphId}-${seq}`;
        const direction = info.directions.has('IN') && info.directions.has('OUT')
          ? 'BIDI'
          : info.directions.has('IN') ? 'IN' : 'OUT';

        const port = {
          id: portId,
          direction,
          externalNodeId: info.externalId,
          externalEdgeType: info.relType,
          internalNodeId: info.internalId,
          label: `${direction}:${info.relType}`,
          subgraphId,
          namespace,
        };
        ports.push(port);

        // Create port node in Memgraph
        await session.run(`
          CREATE (p:SubGraphPort:KnowledgeQuantum {
            id: $portId,
            direction: $direction,
            externalNodeId: $externalNodeId,
            externalEdgeType: $externalEdgeType,
            internalNodeId: $internalNodeId,
            label: $label,
            subgraphId: $subgraphId,
            namespace: $ns,
            createdAt: datetime()
          })
        `, {
          portId: port.id,
          direction: port.direction,
          externalNodeId: port.externalNodeId,
          externalEdgeType: port.externalEdgeType,
          internalNodeId: port.internalNodeId,
          label: port.label,
          subgraphId,
          ns: namespace,
        });

        // Link SubGraph → Port via PORT_OF
        await session.run(`
          MATCH (sg:SubGraph {id: $sgId})
          MATCH (p:SubGraphPort {id: $portId})
          CREATE (sg)-[:PORT_OF]->(p)
        `, { sgId: subgraphId, portId: port.id });

        // Link Port → external node via BRIDGES_TO
        await session.run(`
          MATCH (p:SubGraphPort {id: $portId})
          MATCH (ext) WHERE ext.id = $extId AND ext.namespace = $ns
          CREATE (p)-[:BRIDGES_TO]->(ext)
        `, { portId: port.id, extId: port.externalNodeId, ns: namespace });

        // Link Port → internal node via CONNECTS_INTERNAL
        await session.run(`
          MATCH (p:SubGraphPort {id: $portId})
          MATCH (int) WHERE int.id = $intId AND int.namespace = $ns
          CREATE (p)-[:CONNECTS_INTERNAL]->(int)
        `, { portId: port.id, intId: port.internalNodeId, ns: namespace });
      }

      console.log(`[BoundaryResolver] Created ${ports.length} ports for subgraph ${subgraphId} (${boundaryEdges.length} boundary edges)`);

      return {
        subgraphId,
        ports,
        boundaryEdgeCount: boundaryEdges.length,
      };
    } finally {
      await session.close();
    }
  }
}

module.exports = { BoundaryResolver };

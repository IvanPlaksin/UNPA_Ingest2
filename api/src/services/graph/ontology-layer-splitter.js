/**
 * OntologyLayerSplitter — splits namespace nodes into 3-layer ontology groups.
 *
 * Uses the existing ontology.schema.js for standard types and extends with
 * custom label mappings for audit/meta nodes.
 */

const { getLayerForNodeType } = require('./ontology.schema');
const memgraphService = require('../memgraph.service');

// Extended layer mapping for non-standard labels (e.g. audit namespace)
const EXTENDED_LAYER_MAP = {
  Strategic: ['AuditReport', 'BusinessGoal', 'Strategy', 'Goal', 'KPI'],
  Business: ['Gap', 'TechnicalDebt', 'QuickWin', 'Process', 'Risk', 'Decision'],
  Code: ['SystemComponent', 'Service', 'Module', 'Library'],
};

// Pre-build reverse lookup
const _labelToLayer = new Map();
for (const [layer, labels] of Object.entries(EXTENDED_LAYER_MAP)) {
  for (const lbl of labels) _labelToLayer.set(lbl, layer);
}

class OntologyLayerSplitter {
  constructor() {
    this.driver = memgraphService.driver;
  }

  _session() {
    if (!this.driver) throw new Error('Memgraph driver not initialised');
    return this.driver.session();
  }

  /**
   * Resolve the ontology layer for a given graph label.
   * Priority: ontology.schema → extended map → fallback to Business.
   */
  resolveLayer(label) {
    // 1. Check standard ontology schema
    const standard = getLayerForNodeType(label);
    if (standard) return standard;

    // 2. Check extended map
    if (_labelToLayer.has(label)) return _labelToLayer.get(label);

    // 3. Default
    return 'Business';
  }

  /**
   * Split all nodes in a namespace into ontology layers.
   * @param {string} namespace
   * @returns {Promise<OntologyLayerResult>}
   */
  async split(namespace) {
    const session = this._session();
    try {
      const res = await session.run(`
        MATCH (n) WHERE n.namespace = $ns
          AND NOT labels(n)[0] IN ['SubGraph', 'SubGraphPort', 'CatalogEntry', 'ConsolidationCheckpoint']
        RETURN n.id AS id, n.name AS name, labels(n)[0] AS label,
               n.category AS category, n.description AS description
      `, { ns: namespace });

      const layers = { Strategic: [], Business: [], Code: [] };
      const crossLayerEdges = [];

      for (const rec of res.records) {
        const id = rec.get('id');
        const name = rec.get('name');
        const label = rec.get('label');
        const layer = this.resolveLayer(label);
        layers[layer].push({ id, name, label, layer });
      }

      // Find cross-layer edges
      const edgeRes = await session.run(`
        MATCH (a)-[r]->(b)
        WHERE a.namespace = $ns AND b.namespace = $ns
        RETURN a.id AS src, b.id AS tgt, type(r) AS relType,
               labels(a)[0] AS srcLabel, labels(b)[0] AS tgtLabel
      `, { ns: namespace });

      for (const rec of edgeRes.records) {
        const srcLayer = this.resolveLayer(rec.get('srcLabel'));
        const tgtLayer = this.resolveLayer(rec.get('tgtLabel'));
        if (srcLayer !== tgtLayer) {
          crossLayerEdges.push({
            source: rec.get('src'),
            target: rec.get('tgt'),
            type: rec.get('relType'),
            sourceLayer: srcLayer,
            targetLayer: tgtLayer,
          });
        }
      }

      return {
        clusters: Object.entries(layers).map(([layer, nodes]) => ({
          strategy: 'ontology',
          layer,
          nodes: nodes.map(n => n.id),
          nodeDetails: nodes,
          nodeCount: nodes.length,
        })),
        crossLayerEdges,
        summary: {
          Strategic: layers.Strategic.length,
          Business: layers.Business.length,
          Code: layers.Code.length,
          crossEdges: crossLayerEdges.length,
        },
      };
    } finally {
      await session.close();
    }
  }
}

module.exports = { OntologyLayerSplitter, EXTENDED_LAYER_MAP };

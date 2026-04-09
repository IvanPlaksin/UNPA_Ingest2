/**
 * Graph Export Service
 * Exports knowledge graph to various formats:
 *   - Cypher (Neo4j CREATE statements)
 *   - GraphML (XML with attributes)
 *   - JSON-LD (Linked Data with @context/@graph)
 *   - GEXF (Gephi format)
 *   - CSV (nodes.csv + edges.csv)
 *   - JSON (plain)
 *
 * All data sources are injectable for testability.
 *
 * @module services/visualization/export.service
 */

class GraphExportService {
  constructor(options = {}) {
    this._explicit = new Set(Object.keys(options));
    this._graphCache = options.graphCache || null;

    this.stats = {
      totalExports: 0,
      byFormat: {}
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GRAPH CACHE GETTER (lazy-load from GraphVizService)
  // ═══════════════════════════════════════════════════════════════════════

  get graphCache() {
    if (!this._graphCache && !this._explicit.has('graphCache')) {
      try {
        const { graphVizService } = require('./graph-viz.service');
        this._graphCache = graphVizService.graphCache;
      } catch { this._graphCache = { nodes: new Map(), edges: new Map(), adjacency: new Map() }; }
    }
    return this._graphCache || { nodes: new Map(), edges: new Map(), adjacency: new Map() };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Export to specified format
   */
  export(format, options = {}) {
    this.stats.totalExports++;
    const key = format.toLowerCase();
    this.stats.byFormat[key] = (this.stats.byFormat[key] || 0) + 1;

    switch (key) {
      case 'cypher': return this.toCypher(options);
      case 'graphml': return this.toGraphML(options);
      case 'jsonld':
      case 'json-ld': return this.toJSONLD(options);
      case 'gexf': return this.toGEXF(options);
      case 'csv': return this.toCSV(options);
      case 'json': return this.toJSON(options);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CYPHER (Neo4j)
  // ═══════════════════════════════════════════════════════════════════════

  toCypher(options = {}) {
    const nodes = this._getNodes(options);
    const edges = this._getEdges(options, nodes);
    const statements = [];

    for (const [id, node] of nodes) {
      const label = this._sanitizeLabel(node.type || 'Entity');
      const props = this._formatCypherProps({
        id,
        name: node.name || id,
        ...this._filterAttributes(node.attributes)
      });
      statements.push(`CREATE (n:${label} ${props});`);
    }

    for (const edge of edges) {
      const source = edge.source || edge.from;
      const target = edge.target || edge.to;
      const type = this._sanitizeLabel(edge.type || edge.relation || 'RELATED_TO');
      const props = edge.attributes ? ' ' + this._formatCypherProps(edge.attributes) : '';
      statements.push(
        `MATCH (a {id: '${this._escapeCypher(source)}'}), (b {id: '${this._escapeCypher(target)}'}) ` +
        `CREATE (a)-[:${type}${props}]->(b);`
      );
    }

    return {
      format: 'cypher',
      content: statements.join('\n'),
      contentType: 'application/x-cypher-query',
      statements: statements.length,
      nodes: nodes.length,
      edges: edges.length,
      metadata: { generatedAt: new Date().toISOString(), version: '1.0' }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GRAPHML (XML)
  // ═══════════════════════════════════════════════════════════════════════

  toGraphML(options = {}) {
    const nodes = this._getNodes(options);
    const edges = this._getEdges(options, nodes);

    const nodeAttrKeys = new Set(['name', 'type']);
    for (const [, node] of nodes) {
      if (node.attributes) Object.keys(node.attributes).forEach(k => nodeAttrKeys.add(k));
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns"\n';
    xml += '         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n';
    xml += '         xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns\n';
    xml += '         http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">\n';

    for (const key of nodeAttrKeys) {
      xml += `  <key id="${key}" for="node" attr.name="${key}" attr.type="string"/>\n`;
    }
    xml += '  <key id="edge_type" for="edge" attr.name="type" attr.type="string"/>\n';
    xml += '  <graph id="G" edgedefault="directed">\n';

    for (const [id, node] of nodes) {
      xml += `    <node id="${this._escapeXml(id)}">\n`;
      xml += `      <data key="name">${this._escapeXml(node.name || id)}</data>\n`;
      xml += `      <data key="type">${this._escapeXml(node.type || 'Entity')}</data>\n`;
      if (node.attributes) {
        for (const [k, v] of Object.entries(node.attributes)) {
          if (v != null) xml += `      <data key="${this._escapeXml(k)}">${this._escapeXml(String(v))}</data>\n`;
        }
      }
      xml += '    </node>\n';
    }

    let edgeIdx = 0;
    for (const edge of edges) {
      const src = edge.source || edge.from;
      const tgt = edge.target || edge.to;
      const type = edge.type || edge.relation || 'RELATED_TO';
      xml += `    <edge id="e${edgeIdx++}" source="${this._escapeXml(src)}" target="${this._escapeXml(tgt)}">\n`;
      xml += `      <data key="edge_type">${this._escapeXml(type)}</data>\n`;
      xml += '    </edge>\n';
    }

    xml += '  </graph>\n</graphml>';

    return {
      format: 'graphml',
      content: xml,
      contentType: 'application/xml',
      nodes: nodes.length,
      edges: edges.length,
      metadata: { generatedAt: new Date().toISOString(), version: '1.0' }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // JSON-LD (Linked Data)
  // ═══════════════════════════════════════════════════════════════════════

  toJSONLD(options = {}) {
    const nodes = this._getNodes(options);
    const edges = this._getEdges(options, nodes);
    const baseUri = options.baseUri || 'http://example.org/kg/';

    const context = {
      '@vocab': baseUri,
      'kg': baseUri,
      'name': 'kg:name',
      'type': '@type',
      'id': '@id'
    };

    const relsBySource = new Map();
    for (const edge of edges) {
      const src = edge.source || edge.from;
      if (!relsBySource.has(src)) relsBySource.set(src, []);
      relsBySource.get(src).push(edge);
    }

    const graph = [];
    for (const [id, node] of nodes) {
      const entity = {
        '@id': `${baseUri}entity/${encodeURIComponent(id)}`,
        '@type': node.type || 'Entity',
        'name': node.name || id
      };

      if (node.attributes) {
        for (const [k, v] of Object.entries(node.attributes)) {
          if (v != null) entity[k] = v;
        }
      }

      const rels = relsBySource.get(id) || [];
      for (const rel of rels) {
        const propName = this._camelCase(rel.type || rel.relation || 'relatedTo');
        const target = rel.target || rel.to;
        if (!entity[propName]) entity[propName] = [];
        entity[propName].push({ '@id': `${baseUri}entity/${encodeURIComponent(target)}` });
      }

      graph.push(entity);
    }

    const jsonld = { '@context': context, '@graph': graph };

    return {
      format: 'json-ld',
      content: JSON.stringify(jsonld, null, 2),
      contentType: 'application/ld+json',
      nodes: nodes.length,
      edges: edges.length,
      metadata: { generatedAt: new Date().toISOString(), baseUri, version: '1.0' }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GEXF (Gephi)
  // ═══════════════════════════════════════════════════════════════════════

  toGEXF(options = {}) {
    const nodes = this._getNodes(options);
    const edges = this._getEdges(options, nodes);
    const dateStr = new Date().toISOString().split('T')[0];

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">\n';
    xml += `  <meta lastmodifieddate="${dateStr}">\n`;
    xml += '    <creator>ProjectAdvisor</creator>\n';
    xml += '    <description>Knowledge Graph Export</description>\n';
    xml += '  </meta>\n';
    xml += '  <graph mode="static" defaultedgetype="directed">\n';
    xml += '    <attributes class="node">\n';
    xml += '      <attribute id="0" title="type" type="string"/>\n';
    xml += '    </attributes>\n';

    xml += '    <nodes>\n';
    for (const [id, node] of nodes) {
      xml += `      <node id="${this._escapeXml(id)}" label="${this._escapeXml(node.name || id)}">\n`;
      xml += '        <attvalues>\n';
      xml += `          <attvalue for="0" value="${this._escapeXml(node.type || 'Entity')}"/>\n`;
      xml += '        </attvalues>\n';
      xml += '      </node>\n';
    }
    xml += '    </nodes>\n';

    xml += '    <edges>\n';
    let edgeIdx = 0;
    for (const edge of edges) {
      const src = edge.source || edge.from;
      const tgt = edge.target || edge.to;
      const label = edge.type || edge.relation || 'RELATED_TO';
      xml += `      <edge id="${edgeIdx++}" source="${this._escapeXml(src)}" target="${this._escapeXml(tgt)}" label="${this._escapeXml(label)}"/>\n`;
    }
    xml += '    </edges>\n';

    xml += '  </graph>\n</gexf>';

    return {
      format: 'gexf',
      content: xml,
      contentType: 'application/xml',
      nodes: nodes.length,
      edges: edges.length,
      metadata: { generatedAt: new Date().toISOString(), version: '1.2' }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSV (nodes.csv + edges.csv)
  // ═══════════════════════════════════════════════════════════════════════

  toCSV(options = {}) {
    const nodes = this._getNodes(options);
    const edges = this._getEdges(options, nodes);

    const attrKeys = new Set();
    for (const [, node] of nodes) {
      if (node.attributes) Object.keys(node.attributes).forEach(k => attrKeys.add(k));
    }
    const attrList = [...attrKeys];

    const nodeHeaders = ['id', 'name', 'type', ...attrList];
    const nodeRows = [nodeHeaders.join(',')];
    for (const [id, node] of nodes) {
      const row = [
        this._escapeCSV(id),
        this._escapeCSV(node.name || id),
        this._escapeCSV(node.type || 'Entity'),
        ...attrList.map(k => this._escapeCSV(node.attributes?.[k] ?? ''))
      ];
      nodeRows.push(row.join(','));
    }

    const edgeHeaders = ['source', 'target', 'type'];
    const edgeRows = [edgeHeaders.join(',')];
    for (const edge of edges) {
      edgeRows.push([
        this._escapeCSV(edge.source || edge.from),
        this._escapeCSV(edge.target || edge.to),
        this._escapeCSV(edge.type || edge.relation || 'RELATED_TO')
      ].join(','));
    }

    return {
      format: 'csv',
      files: {
        nodes: { filename: 'nodes.csv', content: nodeRows.join('\n'), contentType: 'text/csv' },
        edges: { filename: 'edges.csv', content: edgeRows.join('\n'), contentType: 'text/csv' }
      },
      contentType: 'text/csv',
      nodes: nodes.length,
      edges: edges.length,
      metadata: { generatedAt: new Date().toISOString(), version: '1.0' }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // JSON (plain)
  // ═══════════════════════════════════════════════════════════════════════

  toJSON(options = {}) {
    const nodes = this._getNodes(options);
    const edges = this._getEdges(options, nodes);

    const data = {
      nodes: nodes.map(([id, node]) => ({
        id,
        name: node.name || id,
        type: node.type || 'Entity',
        attributes: node.attributes || {}
      })),
      edges: edges.map(edge => ({
        source: edge.source || edge.from,
        target: edge.target || edge.to,
        type: edge.type || edge.relation || 'RELATED_TO',
        attributes: edge.attributes || {}
      }))
    };

    return {
      format: 'json',
      content: JSON.stringify(data, null, 2),
      contentType: 'application/json',
      nodes: nodes.length,
      edges: edges.length,
      metadata: { generatedAt: new Date().toISOString(), version: '1.0' }
    };
  }

  /**
   * Get available formats
   */
  getAvailableFormats() {
    return [
      { name: 'cypher', description: 'Neo4j Cypher queries', extension: '.cypher' },
      { name: 'graphml', description: 'GraphML XML format', extension: '.graphml' },
      { name: 'json-ld', description: 'JSON-LD Linked Data', extension: '.jsonld' },
      { name: 'gexf', description: 'GEXF for Gephi', extension: '.gexf' },
      { name: 'csv', description: 'CSV (nodes + edges files)', extension: '.csv' },
      { name: 'json', description: 'Plain JSON', extension: '.json' }
    ];
  }

  getStats() {
    return { ...this.stats };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _getNodes(options) {
    let nodes = [...this.graphCache.nodes.entries()];

    if (options.nodeTypes && options.nodeTypes.length > 0) {
      const types = new Set(options.nodeTypes.map(t => t.toLowerCase()));
      nodes = nodes.filter(([, n]) => types.has((n.type || '').toLowerCase()));
    }

    if (options.limit && options.limit < nodes.length) {
      nodes = nodes.slice(0, options.limit);
    }

    return nodes;
  }

  _getEdges(options, filteredNodes) {
    let edges = [...this.graphCache.edges.values()];

    if (filteredNodes) {
      const nodeIds = new Set(filteredNodes.map(([id]) => id.toLowerCase()));
      edges = edges.filter(e => {
        const src = (e.source || e.from || '').toLowerCase();
        const tgt = (e.target || e.to || '').toLowerCase();
        return nodeIds.has(src) && nodeIds.has(tgt);
      });
    }

    if (options.edgeTypes && options.edgeTypes.length > 0) {
      const types = new Set(options.edgeTypes.map(t => t.toLowerCase()));
      edges = edges.filter(e => types.has((e.type || e.relation || '').toLowerCase()));
    }

    return edges;
  }

  _sanitizeLabel(label) {
    return label.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  }

  _formatCypherProps(obj) {
    const parts = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v != null) {
        const key = k.replace(/[^a-zA-Z0-9_]/g, '_');
        const value = typeof v === 'string' ? `'${this._escapeCypher(v)}'` : v;
        parts.push(`${key}: ${value}`);
      }
    }
    return `{${parts.join(', ')}}`;
  }

  _filterAttributes(attrs) {
    if (!attrs) return {};
    const out = {};
    for (const [k, v] of Object.entries(attrs)) {
      if (v != null && k !== 'id') out[k] = v;
    }
    return out;
  }

  _escapeCypher(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  _escapeXml(str) {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  _escapeCSV(value) {
    if (value == null) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  _camelCase(str) {
    return str.toLowerCase().replace(/[_-](.)/g, (_, c) => c.toUpperCase());
  }
}

const graphExportService = new GraphExportService();

module.exports = {
  GraphExportService,
  graphExportService
};

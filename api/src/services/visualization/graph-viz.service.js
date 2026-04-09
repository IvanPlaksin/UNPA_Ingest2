/**
 * Graph Visualization Service
 * Prepares graph data for frontend visualization (D3, Three.js, Cytoscape, vis.js)
 *
 * Features:
 *   - Multiple output formats (d3, cytoscape, vis, threejs)
 *   - Layout algorithms (force, hierarchical, circular, grid, random)
 *   - Subgraph extraction (BFS from seed nodes)
 *   - Filtering by node/edge types and search
 *   - Clustering (by type, connected components, community detection)
 *   - Node/Edge type summaries
 *
 * @module services/visualization/graph-viz.service
 */

class GraphVizService {
  constructor(options = {}) {
    this.options = {
      defaultLayout: options.defaultLayout || 'force',
      maxNodes: options.maxNodes || 500,
      maxEdges: options.maxEdges || 1000,
      ...options
    };

    // Injectable graph data source (default: in-memory cache)
    this.graphCache = options.graphCache || {
      nodes: new Map(),
      edges: new Map(),
      adjacency: new Map()
    };

    this.stats = {
      totalExports: 0,
      byLayout: {},
      byFormat: {}
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get full graph for visualization
   */
  getGraph(options = {}) {
    const format = options.format || 'd3';
    const layout = options.layout || this.options.defaultLayout;
    const limit = options.limit || this.options.maxNodes;

    this._trackExport(format, layout);

    let nodes = [...this.graphCache.nodes.entries()]
      .slice(0, limit)
      .map(([id, node]) => this._formatNode(id, node, format));

    let edges = [...this.graphCache.edges.values()]
      .slice(0, this.options.maxEdges)
      .map(edge => this._formatEdge(edge, format));

    // Filter edges to only include those with valid nodes
    const nodeIds = new Set(nodes.map(n => this._getNodeId(n, format)));
    edges = edges.filter(e => {
      const { sourceId, targetId } = this._getEdgeEndpoints(e, format);
      return nodeIds.has(sourceId) && nodeIds.has(targetId);
    });

    if (options.computeLayout !== false) {
      nodes = this._applyLayout(nodes, edges, layout, format);
    }

    return {
      nodes,
      edges,
      metadata: {
        totalNodes: this.graphCache.nodes.size,
        totalEdges: this.graphCache.edges.size,
        returnedNodes: nodes.length,
        returnedEdges: edges.length,
        layout,
        format
      }
    };
  }

  /**
   * Get subgraph around specific nodes (BFS)
   */
  getSubgraph(seedNodeIds, options = {}) {
    const depth = options.depth != null ? options.depth : 1;
    const format = options.format || 'd3';
    const layout = options.layout || 'force';

    const visited = new Set();
    const nodes = [];
    const edgeSet = new Set();

    let currentLevel = seedNodeIds.map(id => id.toLowerCase());

    for (let d = 0; d <= depth; d++) {
      const nextLevel = [];

      for (const nodeId of currentLevel) {
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = this._findNode(nodeId);
        if (node) {
          nodes.push(this._formatNode(nodeId, node, format));
        }

        if (d < depth) {
          const neighbors = this.graphCache.adjacency.get(nodeId) || new Set();
          for (const neighbor of neighbors) {
            const nLower = neighbor.toLowerCase();
            if (!visited.has(nLower)) {
              nextLevel.push(nLower);
            }
            edgeSet.add(`${nodeId}|${nLower}`);
          }
        }
      }

      currentLevel = nextLevel;
    }

    const edges = [];
    for (const edgeKey of edgeSet) {
      const [source, target] = edgeKey.split('|');
      const edge = this._findEdge(source, target);
      if (edge) {
        edges.push(this._formatEdge(edge, format));
      }
    }

    const layoutNodes = this._applyLayout(nodes, edges, layout, format);

    return {
      nodes: layoutNodes,
      edges,
      seedNodes: seedNodeIds,
      depth,
      metadata: {
        returnedNodes: layoutNodes.length,
        returnedEdges: edges.length,
        layout,
        format
      }
    };
  }

  /**
   * Get graph filtered by type / search
   */
  getFilteredGraph(filters = {}, options = {}) {
    const format = options.format || 'd3';
    const layout = options.layout || 'force';

    let entries = [...this.graphCache.nodes.entries()];

    if (filters.nodeTypes && filters.nodeTypes.length > 0) {
      entries = entries.filter(([, node]) =>
        filters.nodeTypes.includes(node.type)
      );
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      entries = entries.filter(([id, node]) => {
        const name = (node.name || node.label || id).toLowerCase();
        return name.includes(searchLower);
      });
    }

    entries = entries.slice(0, options.limit || this.options.maxNodes);
    const formattedNodes = entries.map(([id, node]) => this._formatNode(id, node, format));

    const nodeIds = new Set(entries.map(([id]) => id.toLowerCase()));
    let edges = [...this.graphCache.edges.values()]
      .filter(edge => {
        const source = (edge.source || edge.from || '').toLowerCase();
        const target = (edge.target || edge.to || '').toLowerCase();

        if (filters.edgeTypes && filters.edgeTypes.length > 0) {
          if (!filters.edgeTypes.includes(edge.type)) return false;
        }

        return nodeIds.has(source) && nodeIds.has(target);
      })
      .map(edge => this._formatEdge(edge, format));

    const layoutNodes = this._applyLayout(formattedNodes, edges, layout, format);

    return {
      nodes: layoutNodes,
      edges,
      filters,
      metadata: {
        returnedNodes: layoutNodes.length,
        returnedEdges: edges.length,
        layout,
        format
      }
    };
  }

  /**
   * Get clusters
   */
  getClusters(options = {}) {
    const method = options.method || 'type';
    const format = options.format || 'd3';

    let clusters;
    switch (method) {
      case 'type':
        clusters = this._clusterByType();
        break;
      case 'connected':
        clusters = this._findConnectedComponents();
        break;
      case 'community':
        clusters = this._detectCommunities();
        break;
      default:
        clusters = this._clusterByType();
    }

    const formattedClusters = clusters.map((cluster, idx) => ({
      id: `cluster_${idx}`,
      name: cluster.name || `Cluster ${idx + 1}`,
      nodes: cluster.nodes.map(nodeId => {
        const node = this._findNode(nodeId);
        return this._formatNode(nodeId, node || {}, format);
      }),
      size: cluster.nodes.length,
      color: this._getClusterColor(idx)
    }));

    return {
      clusters: formattedClusters,
      method,
      totalClusters: formattedClusters.length
    };
  }

  /**
   * Node types summary
   */
  getNodeTypes() {
    const types = {};

    for (const [id, node] of this.graphCache.nodes) {
      const type = node.type || 'Unknown';
      if (!types[type]) {
        types[type] = { count: 0, nodes: [] };
      }
      types[type].count++;
      if (types[type].nodes.length < 5) {
        types[type].nodes.push({ id, name: node.name || id });
      }
    }

    return {
      types: Object.entries(types).map(([name, data]) => ({
        name,
        count: data.count,
        examples: data.nodes,
        color: this._getTypeColor(name)
      })),
      totalTypes: Object.keys(types).length
    };
  }

  /**
   * Edge types summary
   */
  getEdgeTypes() {
    const types = {};

    for (const edge of this.graphCache.edges.values()) {
      const type = edge.type || edge.relation || 'RELATED_TO';
      if (!types[type]) {
        types[type] = { count: 0 };
      }
      types[type].count++;
    }

    return {
      types: Object.entries(types).map(([name, data]) => ({
        name,
        count: data.count,
        color: this._getEdgeColor(name)
      })),
      totalTypes: Object.keys(types).length
    };
  }

  getStats() {
    return this.stats;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LAYOUT ALGORITHMS
  // ═══════════════════════════════════════════════════════════════════════

  _applyLayout(nodes, edges, layout, format) {
    switch (layout) {
      case 'force':       return this._forceLayout(nodes, edges, format);
      case 'hierarchical':return this._hierarchicalLayout(nodes, edges, format);
      case 'circular':    return this._circularLayout(nodes);
      case 'grid':        return this._gridLayout(nodes);
      case 'random':      return this._randomLayout(nodes);
      default:            return this._forceLayout(nodes, edges, format);
    }
  }

  _forceLayout(nodes, edges, format) {
    const positions = new Map();
    const w = 1000, h = 1000;

    for (const node of nodes) {
      const nid = this._getNodeId(node, format);
      positions.set(nid, { x: Math.random() * w - w / 2, y: Math.random() * h - h / 2 });
    }

    const iterations = 10, repulsion = 100, attraction = 0.1;

    for (let i = 0; i < iterations; i++) {
      for (const n1 of nodes) {
        const id1 = this._getNodeId(n1, format);
        const pos1 = positions.get(id1);
        let fx = 0, fy = 0;

        for (const n2 of nodes) {
          const id2 = this._getNodeId(n2, format);
          if (id1 === id2) continue;
          const pos2 = positions.get(id2);
          const dx = pos1.x - pos2.x;
          const dy = pos1.y - pos2.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          fx += (dx / dist) * repulsion / dist;
          fy += (dy / dist) * repulsion / dist;
        }
        pos1.x += fx;
        pos1.y += fy;
      }

      for (const edge of edges) {
        const { sourceId, targetId } = this._getEdgeEndpoints(edge, format);
        const pos1 = positions.get(sourceId);
        const pos2 = positions.get(targetId);
        if (!pos1 || !pos2) continue;
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        pos1.x += dx * attraction;
        pos1.y += dy * attraction;
        pos2.x -= dx * attraction;
        pos2.y -= dy * attraction;
      }
    }

    return nodes.map(node => {
      const nid = this._getNodeId(node, format);
      const pos = positions.get(nid) || { x: 0, y: 0 };
      return this._setNodePosition(node, pos.x, pos.y, format);
    });
  }

  _hierarchicalLayout(nodes, edges, format) {
    const hasIncoming = new Set();
    for (const edge of edges) {
      const { targetId } = this._getEdgeEndpoints(edge, format);
      hasIncoming.add(targetId);
    }

    const roots = nodes.filter(n => !hasIncoming.has(this._getNodeId(n, format)));
    const levels = new Map();
    const visited = new Set();

    let currentLevel = roots.map(n => this._getNodeId(n, format));
    let level = 0;

    while (currentLevel.length > 0) {
      const nextLevel = [];
      for (const nodeId of currentLevel) {
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);
        levels.set(nodeId, level);

        for (const edge of edges) {
          const { sourceId, targetId } = this._getEdgeEndpoints(edge, format);
          if (sourceId === nodeId && !visited.has(targetId)) {
            nextLevel.push(targetId);
          }
        }
      }
      currentLevel = nextLevel;
      level++;
    }

    const levelCounts = {};
    return nodes.map(node => {
      const nid = this._getNodeId(node, format);
      const nodeLevel = levels.get(nid) || 0;
      levelCounts[nodeLevel] = (levelCounts[nodeLevel] || 0) + 1;
      return this._setNodePosition(node, (levelCounts[nodeLevel] - 1) * 150, nodeLevel * 100, format);
    });
  }

  _circularLayout(nodes) {
    const radius = Math.max(100, nodes.length * 10);
    const step = (2 * Math.PI) / (nodes.length || 1);
    return nodes.map((node, i) => ({
      ...node,
      x: radius * Math.cos(i * step),
      y: radius * Math.sin(i * step)
    }));
  }

  _gridLayout(nodes) {
    const cols = Math.ceil(Math.sqrt(nodes.length || 1));
    const spacing = 100;
    return nodes.map((node, i) => ({
      ...node,
      x: (i % cols) * spacing,
      y: Math.floor(i / cols) * spacing
    }));
  }

  _randomLayout(nodes) {
    return nodes.map(node => ({
      ...node,
      x: Math.random() * 1000 - 500,
      y: Math.random() * 1000 - 500
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CLUSTERING
  // ═══════════════════════════════════════════════════════════════════════

  _clusterByType() {
    const typeMap = new Map();
    for (const [id, node] of this.graphCache.nodes) {
      const type = node.type || 'Unknown';
      if (!typeMap.has(type)) typeMap.set(type, []);
      typeMap.get(type).push(id);
    }
    return [...typeMap.entries()].map(([type, ids]) => ({ name: type, nodes: ids }));
  }

  _findConnectedComponents() {
    const visited = new Set();
    const components = [];

    for (const [nodeId] of this.graphCache.nodes) {
      if (visited.has(nodeId)) continue;

      const component = [];
      const queue = [nodeId];

      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        component.push(current);

        const neighbors = this.graphCache.adjacency.get(current) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
      components.push({ name: `Component ${components.length + 1}`, nodes: component });
    }
    return components;
  }

  _detectCommunities() {
    const labels = new Map();
    let counter = 0;
    for (const [nodeId] of this.graphCache.nodes) {
      labels.set(nodeId, counter++);
    }

    for (let i = 0; i < 5; i++) {
      for (const [nodeId] of this.graphCache.nodes) {
        const neighbors = this.graphCache.adjacency.get(nodeId) || new Set();
        if (neighbors.size === 0) continue;

        const labelCounts = new Map();
        for (const neighbor of neighbors) {
          const label = labels.get(neighbor);
          if (label !== undefined) labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        }

        let maxCount = 0, maxLabel = labels.get(nodeId);
        for (const [label, count] of labelCounts) {
          if (count > maxCount) { maxCount = count; maxLabel = label; }
        }
        labels.set(nodeId, maxLabel);
      }
    }

    const communities = new Map();
    for (const [nodeId, label] of labels) {
      if (!communities.has(label)) communities.set(label, []);
      communities.get(label).push(nodeId);
    }

    return [...communities.entries()].map(([, ids], idx) => ({
      name: `Community ${idx + 1}`,
      nodes: ids
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // NODE/EDGE FORMATTING
  // ═══════════════════════════════════════════════════════════════════════

  _formatNode(id, node, format) {
    const base = {
      id,
      name: node.name || node.label || id,
      type: node.type || 'Entity',
      attributes: node.attributes || {}
    };

    switch (format) {
      case 'd3':
        return { ...base, group: base.type, val: 1 };
      case 'cytoscape':
        return { data: { id, label: base.name, type: base.type, ...base.attributes } };
      case 'vis':
        return { id, label: base.name, group: base.type, title: `${base.name} (${base.type})` };
      case 'threejs':
        return { ...base, color: this._getTypeColor(base.type), size: 5 };
      default:
        return base;
    }
  }

  _formatEdge(edge, format) {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;
    const type = edge.type || edge.relation || 'RELATED_TO';

    switch (format) {
      case 'd3':
        return { source, target, type, value: 1 };
      case 'cytoscape':
        return { data: { id: `${source}-${target}`, source, target, label: type } };
      case 'vis':
        return { from: source, to: target, label: type, arrows: 'to' };
      case 'threejs':
        return { source, target, type, color: this._getEdgeColor(type) };
      default:
        return { source, target, type };
    }
  }

  _getNodeId(node, format) {
    if (format === 'cytoscape') return node.data?.id;
    return node.id;
  }

  _getEdgeEndpoints(edge, format) {
    if (format === 'cytoscape') {
      return { sourceId: edge.data?.source, targetId: edge.data?.target };
    }
    if (format === 'vis') {
      return { sourceId: edge.from, targetId: edge.to };
    }
    return {
      sourceId: typeof edge.source === 'object' ? edge.source.id : edge.source,
      targetId: typeof edge.target === 'object' ? edge.target.id : edge.target
    };
  }

  _setNodePosition(node, x, y, format) {
    if (format === 'cytoscape') {
      return { ...node, position: { x, y } };
    }
    return { ...node, x, y };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LOOKUP
  // ═══════════════════════════════════════════════════════════════════════

  _findNode(nodeId) {
    const normalized = nodeId.toLowerCase();
    for (const [id, node] of this.graphCache.nodes) {
      if (id.toLowerCase() === normalized) return node;
    }
    return null;
  }

  _findEdge(source, target) {
    for (const edge of this.graphCache.edges.values()) {
      const eSrc = (edge.source || edge.from || '').toLowerCase();
      const eTgt = (edge.target || edge.to || '').toLowerCase();
      if ((eSrc === source && eTgt === target) || (eSrc === target && eTgt === source)) {
        return edge;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // COLORS
  // ═══════════════════════════════════════════════════════════════════════

  _getTypeColor(type) {
    const colors = {
      Person: '#4CAF50', System: '#2196F3', WorkItem: '#FF9800',
      Document: '#9C27B0', Organization: '#00BCD4', Module: '#E91E63',
      API: '#FFEB3B', Database: '#795548', Entity: '#607D8B'
    };
    return colors[type] || '#9E9E9E';
  }

  _getEdgeColor(type) {
    const colors = {
      USES: '#4CAF50', DEPENDS_ON: '#F44336', CONTAINS: '#2196F3',
      AUTHORED_BY: '#9C27B0', ASSIGNED_TO: '#FF9800', RELATED_TO: '#607D8B'
    };
    return colors[type] || '#BDBDBD';
  }

  _getClusterColor(index) {
    const palette = [
      '#F44336', '#E91E63', '#9C27B0', '#673AB7', '#3F51B5',
      '#2196F3', '#03A9F4', '#00BCD4', '#009688', '#4CAF50',
      '#8BC34A', '#CDDC39', '#FFEB3B', '#FFC107', '#FF9800'
    ];
    return palette[index % palette.length];
  }

  _trackExport(format, layout) {
    this.stats.totalExports++;
    this.stats.byFormat[format] = (this.stats.byFormat[format] || 0) + 1;
    this.stats.byLayout[layout] = (this.stats.byLayout[layout] || 0) + 1;
  }
}

const graphVizService = new GraphVizService();

module.exports = {
  GraphVizService,
  graphVizService
};

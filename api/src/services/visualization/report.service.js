/**
 * Report Generation Service
 * Generates structured reports about the knowledge graph
 *
 * Report types:
 *   - Summary: overall graph statistics and health
 *   - Entity: detailed report for a specific entity
 *   - Type: all entities of a given type
 *   - Relationship: edge distribution and patterns
 *   - Comparison: common/unique connections between entities
 *   - Timeline: temporal activity report
 *
 * Output formats: JSON, Markdown, HTML
 *
 * @module services/visualization/report.service
 */

class ReportService {
  constructor(options = {}) {
    this._explicit = new Set(Object.keys(options));
    this._graphCache = options.graphCache || null;
    this._dashboardService = options.dashboardService || null;

    this.stats = {
      totalReports: 0,
      byType: {}
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LAZY GETTERS
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

  get dashboardService() {
    if (!this._dashboardService && !this._explicit.has('dashboardService')) {
      try {
        const { dashboardService } = require('./dashboard.service');
        this._dashboardService = dashboardService;
      } catch { this._dashboardService = null; }
    }
    return this._dashboardService;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REPORT GENERATORS
  // ═══════════════════════════════════════════════════════════════════════

  generateSummaryReport(options = {}) {
    this._trackReport('summary');
    const nodes = [...this.graphCache.nodes.entries()];
    const edges = [...this.graphCache.edges.values()];

    const nodeTypeCounts = {};
    for (const [, node] of nodes) {
      const t = node.type || 'Unknown';
      nodeTypeCounts[t] = (nodeTypeCounts[t] || 0) + 1;
    }

    const edgeTypeCounts = {};
    for (const edge of edges) {
      const t = edge.type || edge.relation || 'RELATED_TO';
      edgeTypeCounts[t] = (edgeTypeCounts[t] || 0) + 1;
    }

    const degrees = this._computeDegrees(nodes, edges);
    const degreeValues = [...degrees.values()];
    const avgDegree = degreeValues.length > 0
      ? degreeValues.reduce((a, b) => a + b, 0) / degreeValues.length : 0;

    const topEntities = [...degrees.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, options.topN || 10)
      .map(([id, degree]) => {
        const n = this.graphCache.nodes.get(id);
        return { id, name: n?.name || id, type: n?.type || 'Unknown', degree };
      });

    const report = {
      type: 'summary',
      title: 'Knowledge Graph Summary Report',
      generatedAt: new Date().toISOString(),
      graph: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        nodeTypes: Object.keys(nodeTypeCounts).length,
        edgeTypes: Object.keys(edgeTypeCounts).length,
        avgDegree: Math.round(avgDegree * 100) / 100,
        maxDegree: degreeValues.length > 0 ? Math.max(...degreeValues) : 0,
        density: this._calcDensity(nodes.length, edges.length)
      },
      nodeTypeDistribution: this._sortedEntries(nodeTypeCounts),
      edgeTypeDistribution: this._sortedEntries(edgeTypeCounts),
      topEntities,
      health: this._assessHealth(nodes.length, edges.length)
    };

    return this._formatReport(report, options.format);
  }

  generateEntityReport(entityId, options = {}) {
    this._trackReport('entity');
    const node = this.graphCache.nodes.get(entityId);
    if (!node) {
      return this._formatReport({
        type: 'entity',
        title: `Entity Report: ${entityId}`,
        generatedAt: new Date().toISOString(),
        error: `Entity "${entityId}" not found`,
        found: false
      }, options.format);
    }

    const edges = [...this.graphCache.edges.values()];
    const outgoing = [];
    const incoming = [];

    for (const edge of edges) {
      const src = edge.source || edge.from;
      const tgt = edge.target || edge.to;
      if (src === entityId) {
        const targetNode = this.graphCache.nodes.get(tgt);
        outgoing.push({
          type: edge.type || edge.relation || 'RELATED_TO',
          targetId: tgt,
          targetName: targetNode?.name || tgt,
          targetType: targetNode?.type || 'Unknown'
        });
      }
      if (tgt === entityId) {
        const sourceNode = this.graphCache.nodes.get(src);
        incoming.push({
          type: edge.type || edge.relation || 'RELATED_TO',
          sourceId: src,
          sourceName: sourceNode?.name || src,
          sourceType: sourceNode?.type || 'Unknown'
        });
      }
    }

    const neighbourIds = new Set([
      ...outgoing.map(r => r.targetId),
      ...incoming.map(r => r.sourceId)
    ]);

    const report = {
      type: 'entity',
      title: `Entity Report: ${node.name || entityId}`,
      generatedAt: new Date().toISOString(),
      found: true,
      entity: {
        id: entityId,
        name: node.name || entityId,
        type: node.type || 'Unknown',
        attributes: node.attributes || {},
        attributeCount: Object.keys(node.attributes || {}).length
      },
      connections: {
        total: outgoing.length + incoming.length,
        outgoing: outgoing.length,
        incoming: incoming.length
      },
      outgoingRelations: outgoing,
      incomingRelations: incoming,
      neighbours: neighbourIds.size,
      neighbourTypes: this._countTypes([...neighbourIds].map(id => this.graphCache.nodes.get(id)))
    };

    return this._formatReport(report, options.format);
  }

  generateTypeReport(type, options = {}) {
    this._trackReport('type');
    const nodes = [...this.graphCache.nodes.entries()]
      .filter(([, n]) => (n.type || 'Unknown').toLowerCase() === type.toLowerCase());

    const edges = [...this.graphCache.edges.values()];
    const nodeIds = new Set(nodes.map(([id]) => id));

    const internalEdges = [];
    const externalEdges = [];
    for (const edge of edges) {
      const src = edge.source || edge.from;
      const tgt = edge.target || edge.to;
      const srcIn = nodeIds.has(src);
      const tgtIn = nodeIds.has(tgt);
      if (srcIn && tgtIn) internalEdges.push(edge);
      else if (srcIn || tgtIn) externalEdges.push(edge);
    }

    const degrees = this._computeDegrees(nodes, edges);

    const entities = nodes.map(([id, node]) => ({
      id,
      name: node.name || id,
      attributes: Object.keys(node.attributes || {}).length,
      connections: degrees.get(id) || 0
    })).sort((a, b) => b.connections - a.connections);

    const report = {
      type: 'type',
      title: `Type Report: ${type}`,
      generatedAt: new Date().toISOString(),
      typeName: type,
      count: nodes.length,
      entities,
      internalEdges: internalEdges.length,
      externalEdges: externalEdges.length,
      internalEdgeTypes: this._countEdgeTypes(internalEdges),
      externalEdgeTypes: this._countEdgeTypes(externalEdges),
      avgConnections: nodes.length > 0
        ? Math.round(entities.reduce((s, e) => s + e.connections, 0) / nodes.length * 100) / 100
        : 0
    };

    return this._formatReport(report, options.format);
  }

  generateRelationshipReport(options = {}) {
    this._trackReport('relationship');
    const edges = [...this.graphCache.edges.values()];

    const typeCounts = {};
    const sourceTypePairs = {};

    for (const edge of edges) {
      const edgeType = edge.type || edge.relation || 'RELATED_TO';
      typeCounts[edgeType] = (typeCounts[edgeType] || 0) + 1;

      const srcNode = this.graphCache.nodes.get(edge.source || edge.from);
      const tgtNode = this.graphCache.nodes.get(edge.target || edge.to);
      const pairKey = `${srcNode?.type || 'Unknown'} -> ${tgtNode?.type || 'Unknown'}`;
      if (!sourceTypePairs[pairKey]) sourceTypePairs[pairKey] = { count: 0, edgeTypes: new Set() };
      sourceTypePairs[pairKey].count++;
      sourceTypePairs[pairKey].edgeTypes.add(edgeType);
    }

    const patterns = Object.entries(sourceTypePairs)
      .map(([pair, data]) => ({
        pattern: pair,
        count: data.count,
        edgeTypes: [...data.edgeTypes]
      }))
      .sort((a, b) => b.count - a.count);

    const strongestConnections = this._findStrongestPairs(edges, 10);

    const report = {
      type: 'relationship',
      title: 'Relationship Analysis Report',
      generatedAt: new Date().toISOString(),
      totalEdges: edges.length,
      uniqueTypes: Object.keys(typeCounts).length,
      typeDistribution: this._sortedEntries(typeCounts),
      patterns,
      strongestConnections
    };

    return this._formatReport(report, options.format);
  }

  generateComparisonReport(entityIds, options = {}) {
    this._trackReport('comparison');
    if (!Array.isArray(entityIds) || entityIds.length < 2) {
      return this._formatReport({
        type: 'comparison',
        title: 'Entity Comparison Report',
        generatedAt: new Date().toISOString(),
        error: 'At least 2 entity IDs required',
        valid: false
      }, options.format);
    }

    const edges = [...this.graphCache.edges.values()];
    const entityNeighbours = {};

    for (const id of entityIds) {
      const node = this.graphCache.nodes.get(id);
      const neighbours = new Set();
      const relations = [];

      for (const edge of edges) {
        const src = edge.source || edge.from;
        const tgt = edge.target || edge.to;
        if (src === id) {
          neighbours.add(tgt);
          relations.push({ direction: 'outgoing', type: edge.type || edge.relation || 'RELATED_TO', target: tgt });
        }
        if (tgt === id) {
          neighbours.add(src);
          relations.push({ direction: 'incoming', type: edge.type || edge.relation || 'RELATED_TO', source: src });
        }
      }

      entityNeighbours[id] = {
        name: node?.name || id,
        type: node?.type || 'Unknown',
        neighbours,
        relations,
        connectionCount: neighbours.size
      };
    }

    // Find common and unique neighbours
    const allNeighbourSets = entityIds.map(id => entityNeighbours[id].neighbours);
    const commonNeighbours = [...allNeighbourSets[0]].filter(n =>
      allNeighbourSets.every(set => set.has(n)) && !entityIds.includes(n)
    );

    const uniqueNeighbours = {};
    for (const id of entityIds) {
      const others = entityIds.filter(x => x !== id);
      const otherNeighbours = new Set();
      for (const otherId of others) {
        for (const n of entityNeighbours[otherId].neighbours) otherNeighbours.add(n);
      }
      uniqueNeighbours[id] = [...entityNeighbours[id].neighbours]
        .filter(n => !otherNeighbours.has(n) && !entityIds.includes(n));
    }

    // Direct connections between compared entities
    const directConnections = [];
    for (const edge of edges) {
      const src = edge.source || edge.from;
      const tgt = edge.target || edge.to;
      if (entityIds.includes(src) && entityIds.includes(tgt)) {
        directConnections.push({
          source: src,
          target: tgt,
          type: edge.type || edge.relation || 'RELATED_TO'
        });
      }
    }

    const report = {
      type: 'comparison',
      title: 'Entity Comparison Report',
      generatedAt: new Date().toISOString(),
      valid: true,
      entities: entityIds.map(id => ({
        id,
        name: entityNeighbours[id].name,
        type: entityNeighbours[id].type,
        connectionCount: entityNeighbours[id].connectionCount
      })),
      commonNeighbours: commonNeighbours.map(id => {
        const n = this.graphCache.nodes.get(id);
        return { id, name: n?.name || id, type: n?.type || 'Unknown' };
      }),
      uniqueNeighbours: Object.fromEntries(
        entityIds.map(id => [id, uniqueNeighbours[id].map(nId => {
          const n = this.graphCache.nodes.get(nId);
          return { id: nId, name: n?.name || nId, type: n?.type || 'Unknown' };
        })])
      ),
      directConnections,
      similarity: commonNeighbours.length > 0
        ? Math.round((commonNeighbours.length /
            new Set([...allNeighbourSets.flatMap(s => [...s])].filter(n => !entityIds.includes(n))).size
          ) * 100)
        : 0
    };

    return this._formatReport(report, options.format);
  }

  generateTimelineReport(options = {}) {
    this._trackReport('timeline');
    const ds = this.dashboardService;
    const activities = ds ? ds.activityLog || [] : [];
    const limit = options.limit || 100;

    const byType = {};
    for (const act of activities) {
      byType[act.type] = (byType[act.type] || 0) + 1;
    }

    const report = {
      type: 'timeline',
      title: 'Activity Timeline Report',
      generatedAt: new Date().toISOString(),
      totalActivities: activities.length,
      activityTypes: this._sortedEntries(byType),
      recentActivities: activities.slice(0, limit).map(a => ({
        id: a.id,
        type: a.type,
        timestamp: a.timestamp,
        summary: this._summarizeActivity(a)
      })),
      graphSnapshot: {
        nodes: this.graphCache.nodes.size,
        edges: this.graphCache.edges.size
      }
    };

    return this._formatReport(report, options.format);
  }

  getAvailableFormats() {
    return [
      { name: 'json', description: 'Structured JSON', contentType: 'application/json' },
      { name: 'markdown', description: 'Markdown document', contentType: 'text/markdown' },
      { name: 'html', description: 'HTML document', contentType: 'text/html' }
    ];
  }

  getAvailableReportTypes() {
    return [
      { name: 'summary', description: 'Overall graph statistics and health' },
      { name: 'entity', description: 'Detailed report for a specific entity' },
      { name: 'type', description: 'All entities of a given type' },
      { name: 'relationship', description: 'Edge distribution and patterns' },
      { name: 'comparison', description: 'Compare multiple entities' },
      { name: 'timeline', description: 'Activity timeline' }
    ];
  }

  getStats() {
    return { ...this.stats };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FORMAT CONVERTERS
  // ═══════════════════════════════════════════════════════════════════════

  formatAsMarkdown(report) {
    const lines = [];
    lines.push(`# ${report.title}`);
    lines.push(`*Generated: ${report.generatedAt}*\n`);

    if (report.error) {
      lines.push(`> **Error:** ${report.error}\n`);
      return lines.join('\n');
    }

    switch (report.type) {
      case 'summary': return this._summaryToMd(report, lines);
      case 'entity': return this._entityToMd(report, lines);
      case 'type': return this._typeToMd(report, lines);
      case 'relationship': return this._relationshipToMd(report, lines);
      case 'comparison': return this._comparisonToMd(report, lines);
      case 'timeline': return this._timelineToMd(report, lines);
      default: return lines.join('\n') + '\n```json\n' + JSON.stringify(report, null, 2) + '\n```';
    }
  }

  formatAsHTML(report) {
    const md = this.formatAsMarkdown(report);
    return this._mdToHtml(md, report.title);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MARKDOWN FORMATTERS
  // ═══════════════════════════════════════════════════════════════════════

  _summaryToMd(report, lines) {
    const g = report.graph;
    lines.push('## Graph Overview\n');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Nodes | ${g.totalNodes} |`);
    lines.push(`| Edges | ${g.totalEdges} |`);
    lines.push(`| Node Types | ${g.nodeTypes} |`);
    lines.push(`| Edge Types | ${g.edgeTypes} |`);
    lines.push(`| Avg Degree | ${g.avgDegree} |`);
    lines.push(`| Density | ${g.density} |`);
    lines.push(`| Health | ${report.health} |`);

    if (report.nodeTypeDistribution.length > 0) {
      lines.push('\n## Node Type Distribution\n');
      lines.push('| Type | Count |');
      lines.push('|------|-------|');
      for (const { name, count } of report.nodeTypeDistribution) {
        lines.push(`| ${name} | ${count} |`);
      }
    }

    if (report.topEntities.length > 0) {
      lines.push('\n## Top Entities\n');
      lines.push('| Name | Type | Degree |');
      lines.push('|------|------|--------|');
      for (const e of report.topEntities) {
        lines.push(`| ${e.name} | ${e.type} | ${e.degree} |`);
      }
    }

    return lines.join('\n');
  }

  _entityToMd(report, lines) {
    if (!report.found) return lines.join('\n');
    const e = report.entity;
    lines.push(`## ${e.name} (${e.type})\n`);
    lines.push(`- **ID:** ${e.id}`);
    lines.push(`- **Attributes:** ${e.attributeCount}`);
    lines.push(`- **Total Connections:** ${report.connections.total}`);
    lines.push(`- **Outgoing:** ${report.connections.outgoing}`);
    lines.push(`- **Incoming:** ${report.connections.incoming}`);
    lines.push(`- **Unique Neighbours:** ${report.neighbours}`);

    if (report.outgoingRelations.length > 0) {
      lines.push('\n### Outgoing Relations\n');
      lines.push('| Type | Target | Target Type |');
      lines.push('|------|--------|-------------|');
      for (const r of report.outgoingRelations) {
        lines.push(`| ${r.type} | ${r.targetName} | ${r.targetType} |`);
      }
    }

    if (report.incomingRelations.length > 0) {
      lines.push('\n### Incoming Relations\n');
      lines.push('| Type | Source | Source Type |');
      lines.push('|------|--------|-------------|');
      for (const r of report.incomingRelations) {
        lines.push(`| ${r.type} | ${r.sourceName} | ${r.sourceType} |`);
      }
    }

    return lines.join('\n');
  }

  _typeToMd(report, lines) {
    lines.push(`## Type: ${report.typeName}\n`);
    lines.push(`- **Count:** ${report.count}`);
    lines.push(`- **Internal Edges:** ${report.internalEdges}`);
    lines.push(`- **External Edges:** ${report.externalEdges}`);
    lines.push(`- **Avg Connections:** ${report.avgConnections}`);

    if (report.entities.length > 0) {
      lines.push('\n### Entities\n');
      lines.push('| Name | Attributes | Connections |');
      lines.push('|------|-----------|-------------|');
      for (const e of report.entities) {
        lines.push(`| ${e.name} | ${e.attributes} | ${e.connections} |`);
      }
    }

    return lines.join('\n');
  }

  _relationshipToMd(report, lines) {
    lines.push(`- **Total Edges:** ${report.totalEdges}`);
    lines.push(`- **Unique Types:** ${report.uniqueTypes}\n`);

    if (report.typeDistribution.length > 0) {
      lines.push('## Type Distribution\n');
      lines.push('| Type | Count |');
      lines.push('|------|-------|');
      for (const { name, count } of report.typeDistribution) {
        lines.push(`| ${name} | ${count} |`);
      }
    }

    if (report.patterns.length > 0) {
      lines.push('\n## Patterns\n');
      lines.push('| Pattern | Count | Edge Types |');
      lines.push('|---------|-------|-----------|');
      for (const p of report.patterns) {
        lines.push(`| ${p.pattern} | ${p.count} | ${p.edgeTypes.join(', ')} |`);
      }
    }

    return lines.join('\n');
  }

  _comparisonToMd(report, lines) {
    if (!report.valid) return lines.join('\n');
    lines.push('## Compared Entities\n');
    lines.push('| Entity | Type | Connections |');
    lines.push('|--------|------|-------------|');
    for (const e of report.entities) {
      lines.push(`| ${e.name} | ${e.type} | ${e.connectionCount} |`);
    }

    lines.push(`\n**Similarity:** ${report.similarity}%`);

    if (report.commonNeighbours.length > 0) {
      lines.push('\n### Common Neighbours\n');
      for (const n of report.commonNeighbours) {
        lines.push(`- ${n.name} (${n.type})`);
      }
    }

    if (report.directConnections.length > 0) {
      lines.push('\n### Direct Connections\n');
      for (const c of report.directConnections) {
        lines.push(`- ${c.source} --[${c.type}]--> ${c.target}`);
      }
    }

    return lines.join('\n');
  }

  _timelineToMd(report, lines) {
    lines.push(`- **Total Activities:** ${report.totalActivities}`);
    lines.push(`- **Graph Nodes:** ${report.graphSnapshot.nodes}`);
    lines.push(`- **Graph Edges:** ${report.graphSnapshot.edges}\n`);

    if (report.activityTypes.length > 0) {
      lines.push('## Activity Types\n');
      lines.push('| Type | Count |');
      lines.push('|------|-------|');
      for (const { name, count } of report.activityTypes) {
        lines.push(`| ${name} | ${count} |`);
      }
    }

    if (report.recentActivities.length > 0) {
      lines.push('\n## Recent Activities\n');
      for (const a of report.recentActivities) {
        lines.push(`- **${a.timestamp}** [${a.type}] ${a.summary}`);
      }
    }

    return lines.join('\n');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HTML CONVERTER
  // ═══════════════════════════════════════════════════════════════════════

  _mdToHtml(md, title) {
    let html = md
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

    // Convert markdown tables to HTML tables
    const tableRegex = /(\|.+\|\n\|[-| ]+\|\n(?:\|.+\|\n?)+)/g;
    html = html.replace(tableRegex, (table) => {
      const rows = table.trim().split('\n');
      const headers = rows[0].split('|').filter(c => c.trim()).map(c => c.trim());
      const dataRows = rows.slice(2);

      let tableHtml = '<table><thead><tr>';
      for (const h of headers) tableHtml += `<th>${h}</th>`;
      tableHtml += '</tr></thead><tbody>';

      for (const row of dataRows) {
        const cells = row.split('|').filter(c => c.trim()).map(c => c.trim());
        tableHtml += '<tr>';
        for (const cell of cells) tableHtml += `<td>${cell}</td>`;
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';
      return tableHtml;
    });

    // Wrap <li> in <ul>
    html = html.replace(/(<li>.+<\/li>\n?)+/g, '<ul>$&</ul>');

    // Wrap paragraphs
    html = html.split('\n').map(line => {
      if (!line.trim() || line.startsWith('<')) return line;
      return `<p>${line}</p>`;
    }).join('\n');

    return `<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>${this._escapeHtml(title || 'Report')}</title>` +
      `<style>body{font-family:sans-serif;max-width:900px;margin:0 auto;padding:20px}` +
      `table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px;text-align:left}` +
      `th{background:#f4f4f4}blockquote{border-left:4px solid #e74c3c;padding:10px;background:#fef5f5}</style>` +
      `</head><body>${html}</body></html>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _formatReport(report, format) {
    if (!format || format === 'json') {
      return { ...report, format: 'json' };
    }
    if (format === 'markdown' || format === 'md') {
      return {
        ...report,
        format: 'markdown',
        formatted: this.formatAsMarkdown(report),
        contentType: 'text/markdown'
      };
    }
    if (format === 'html') {
      return {
        ...report,
        format: 'html',
        formatted: this.formatAsHTML(report),
        contentType: 'text/html'
      };
    }
    return { ...report, format: 'json' };
  }

  _trackReport(type) {
    this.stats.totalReports++;
    this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
  }

  _computeDegrees(nodes, edges) {
    const degrees = new Map();
    for (const [id] of nodes) degrees.set(id, 0);
    for (const edge of edges) {
      const src = edge.source || edge.from;
      const tgt = edge.target || edge.to;
      degrees.set(src, (degrees.get(src) || 0) + 1);
      degrees.set(tgt, (degrees.get(tgt) || 0) + 1);
    }
    return degrees;
  }

  _calcDensity(nodeCount, edgeCount) {
    if (nodeCount < 2) return 0;
    return Math.round((edgeCount / ((nodeCount * (nodeCount - 1)) / 2)) * 10000) / 10000;
  }

  _sortedEntries(obj) {
    return Object.entries(obj)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }

  _countTypes(nodes) {
    const types = {};
    for (const n of nodes) {
      if (n) {
        const t = n.type || 'Unknown';
        types[t] = (types[t] || 0) + 1;
      }
    }
    return types;
  }

  _countEdgeTypes(edges) {
    const types = {};
    for (const e of edges) {
      const t = e.type || e.relation || 'RELATED_TO';
      types[t] = (types[t] || 0) + 1;
    }
    return this._sortedEntries(types);
  }

  _findStrongestPairs(edges, limit) {
    const pairCounts = {};
    for (const edge of edges) {
      const src = edge.source || edge.from;
      const tgt = edge.target || edge.to;
      const key = `${src}|${tgt}`;
      if (!pairCounts[key]) pairCounts[key] = { source: src, target: tgt, count: 0, types: new Set() };
      pairCounts[key].count++;
      pairCounts[key].types.add(edge.type || edge.relation || 'RELATED_TO');
    }
    return Object.values(pairCounts)
      .map(p => ({ ...p, types: [...p.types] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  _assessHealth(nodeCount, edgeCount) {
    if (nodeCount === 0) return 'empty';
    if (edgeCount === 0) return 'disconnected';
    if (edgeCount / nodeCount < 0.5) return 'sparse';
    return 'healthy';
  }

  _summarizeActivity(activity) {
    if (!activity.data) return activity.type;
    const keys = Object.keys(activity.data);
    if (keys.length === 0) return activity.type;
    const preview = keys.slice(0, 2).map(k => `${k}=${activity.data[k]}`).join(', ');
    return `${activity.type}: ${preview}`;
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

const reportService = new ReportService();

module.exports = {
  ReportService,
  reportService
};

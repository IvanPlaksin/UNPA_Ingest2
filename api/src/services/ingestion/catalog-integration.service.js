/**
 * CatalogIntegrationService
 *
 * Saves extracted SQL knowledge graphs to the Graph Catalog.
 * Called after GRAPH_SYNTHESIS phase in MssqlAgent.
 */

const GRAPH_TYPE_LABELS = {
  structure:     'Database Structure',
  entities:      'Business Entities',
  relationships: 'Entity Relationships',
  businessLogic: 'Business Logic',
  lifecycle:     'Entity Lifecycles',
  anomalies:     'Data Anomalies',
};

const GRAPH_TYPE_DESCRIPTIONS = {
  structure:     (db, s) => `ER diagram extracted from ${db}. Contains ${s?.tablesProcessed || 0} tables.`,
  entities:      (db, s) => `Business entities discovered in ${db}. Found ${s?.entitiesDiscovered || 0} entities.`,
  relationships: (db) => `Entity relationships from ${db}. Includes explicit FK and inferred semantic links.`,
  businessLogic: (db, s) => `Business rules from ${db} stored procedures. Extracted ${s?.rulesExtracted || 0} rules.`,
  lifecycle:     (db) => `Entity state machines detected in ${db} transaction patterns.`,
  anomalies:     (db) => `Data anomalies and integrity issues found in ${db}.`,
};

class CatalogIntegrationService {

  /**
   * Save all extracted graphs to the catalog.
   *
   * @param {Object} params
   * @param {string} params.sessionId
   * @param {string} params.sourceDatabase
   * @param {string} params.sourceServer
   * @param {Array}  params.graphs        - [{ type, title, nodes, edges }]
   * @param {Object} params.summary       - { tablesProcessed, entitiesDiscovered, rulesExtracted, qualityScore }
   * @returns {{ savedEntries, skippedDuplicates, errors }}
   */
  async saveExtractedGraphs({ sessionId, sourceDatabase, sourceServer, graphs, summary }) {
    // Lazy-load to avoid circular deps at startup
    const catalogService = this._getCatalogService();

    const results = { savedEntries: [], skippedDuplicates: [], errors: [] };

    for (const graph of graphs) {
      try {
        const catalogData = this._prepareCatalogData(graph, sessionId, sourceDatabase, sourceServer, summary);

        // Deduplication check
        const contentHash = catalogService.computeContentHash(graph.nodes, graph.edges);
        const existing = await catalogService.findByContentHash(contentHash);

        if (existing) {
          results.skippedDuplicates.push({
            graphType: graph.type,
            existingEntryId: existing.entryId,
          });
          continue;
        }

        const entry = await catalogService.createGraph(catalogData);

        results.savedEntries.push({
          graphType: graph.type,
          entryId: entry.entryId || entry.id,
          versionId: entry.versionId,
        });
      } catch (error) {
        results.errors.push({ graphType: graph.type, error: error.message });
      }
    }

    return results;
  }

  // ---------------------------------------------------------------

  _prepareCatalogData(graph, sessionId, sourceDatabase, sourceServer, summary) {
    const descFn = GRAPH_TYPE_DESCRIPTIONS[graph.type];

    return {
      name: `${sourceDatabase} — ${GRAPH_TYPE_LABELS[graph.type] || graph.type}`,
      description: descFn ? descFn(sourceDatabase, summary) : `Extracted ${graph.type} graph from ${sourceDatabase}`,
      type: 'business',
      namespace: 'sql-extraction',
      tags: [
        'auto-extracted',
        `source:${sourceDatabase}`,
        `type:${graph.type}`,
        `server:${sourceServer}`,
      ],
      nodes: graph.nodes,
      edges: graph.edges,
      createdBy: `agent:${sessionId}`,
    };
  }

  _getCatalogService() {
    if (!this._catalog) {
      this._catalog = require('../graphCatalog.service');
      // Handle both class instance and plain object exports
      if (this._catalog.graphCatalogService) {
        this._catalog = this._catalog.graphCatalogService;
      }
    }
    return this._catalog;
  }
}

module.exports = {
  CatalogIntegrationService,
  catalogIntegrationService: new CatalogIntegrationService(),
};

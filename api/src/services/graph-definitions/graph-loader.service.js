/**
 * GraphLoaderService
 *
 * Loads iNeed business process graph definitions into:
 *   1. PatternLibrary (in-memory cache for fast runtime lookup)
 *   2. Memgraph (BusinessProcessGraph metadata, node_count, loaded_at)
 *
 * Usage:
 *   const loader = new GraphLoaderService(patternLibrary, memgraphService);
 *   const results = await loader.loadAll();
 *   // or load a single graph by ID:
 *   const graph = loader.getGraph('INEED-G1-IT-HARDWARE-V1');
 */

const { GRAPH_0_META } = require('./ineed-graphs');
const { GRAPH_1_IT_HARDWARE } = require('./ineed-graph-1-hardware');
const { GRAPH_2_HR_ACCESS } = require('./ineed-graph-2-access');
const { GRAPH_3_FACILITIES_WORKSPACE } = require('./ineed-graph-3-workspace');
const { SQL_EXTRACTION_META, SQL_PROCEDURE_ANALYSIS } = require('./sql-extraction-pipeline');
const { G0_APPROVAL_ORCHESTRATOR } = require('./approval-graphs');
const { G1_EXPENSE_APPROVAL } = require('./approval-graph-1-expense');
const { G2_LEAVE_APPROVAL } = require('./approval-graph-2-leave');
const { G3_PURCHASE_APPROVAL } = require('./approval-graph-3-purchase');

// ====================================================================
// GRAPH REGISTRY
// ====================================================================

const ALL_GRAPHS = {
  'INEED-G0-META-INTAKE-V1': GRAPH_0_META,
  'INEED-G1-IT-HARDWARE-V1': GRAPH_1_IT_HARDWARE,
  'INEED-G2-HR-ACCESS-V1': GRAPH_2_HR_ACCESS,
  'INEED-G3-FACILITIES-WORKSPACE-V1': GRAPH_3_FACILITIES_WORKSPACE,
  'CORE-SQL-EXTRACTION-META-V1': SQL_EXTRACTION_META,
  'CORE-SQL-PROCEDURE-ANALYSIS-V1': SQL_PROCEDURE_ANALYSIS,
  // Approval Workflow PoC
  'APPROVAL-G0-ORCHESTRATOR-V1': G0_APPROVAL_ORCHESTRATOR,
  'APPROVAL-G1-EXPENSE-V1': G1_EXPENSE_APPROVAL,
  'APPROVAL-G2-LEAVE-V1': G2_LEAVE_APPROVAL,
  'APPROVAL-G3-PURCHASE-V1': G3_PURCHASE_APPROVAL,
};

// ====================================================================
// GRAPH LOADER SERVICE
// ====================================================================

class GraphLoaderService {
  /**
   * @param {Object} patternLibrary - PatternLibrary instance (runtime/learning/PatternLibrary.js)
   * @param {Object} memgraphService - MemgraphService instance (services/memgraph.service.js)
   */
  constructor(patternLibrary, memgraphService) {
    this._patternLibrary = patternLibrary;
    this._memgraph = memgraphService;
    this._graphs = { ...ALL_GRAPHS };
  }

  /**
   * Load all registered graphs into PatternLibrary and update Memgraph metadata
   * @returns {Promise<Array<{graphId: string, success: boolean, nodes: number, edges: number}>>}
   */
  async loadAll() {
    const results = [];

    for (const [graphId, graphDef] of Object.entries(this._graphs)) {
      try {
        const result = await this.loadGraph(graphDef);
        results.push({ graphId, ...result });
        console.log(`[GraphLoader] Loaded ${graphId}: ${result.nodes} nodes, ${result.edges} edges`);
      } catch (err) {
        results.push({ graphId, success: false, error: err.message });
        console.error(`[GraphLoader] Failed to load ${graphId}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Load a single graph definition
   * @param {Object} graphDef - Graph definition object
   * @returns {Promise<{success: boolean, nodes: number, edges: number}>}
   */
  async loadGraph(graphDef) {
    const dag = {
      nodes: graphDef.nodes,
      edges: graphDef.edges,
    };

    // 1. Store in PatternLibrary (in-memory cache)
    if (this._patternLibrary) {
      // Use the category as the key for pattern lookup
      const category = graphDef.category === 'META'
        ? 'META:intake'
        : `${graphDef.category}:${graphDef.subcategory || 'general'}`;

      // Cache directly using internal method or persist
      const pattern = {
        dag,
        hash: graphDef.graph_id,
        successCount: 1,
        failureCount: 0,
        avgDurationMs: 0,
        lastUsedAt: new Date(),
      };

      // Use persistToMemgraph if available, otherwise just cache
      if (typeof this._patternLibrary.persistToMemgraph === 'function') {
        await this._patternLibrary.persistToMemgraph(pattern, category);
      }

      // Also cache in-memory for immediate access
      if (typeof this._patternLibrary._cachePattern === 'function') {
        this._patternLibrary._cachePattern(category, pattern);
      }
    }

    // 2. Update BusinessProcessGraph metadata in Memgraph
    if (this._memgraph) {
      const now = new Date().toISOString();
      try {
        await this._memgraph.queryWithNamespace(
          `MERGE (g:BusinessProcessGraph {graph_id: $graph_id})
           SET g.name = $name,
               g.category = $category,
               g.subcategory = $subcategory,
               g.version = $version,
               g.node_count = $node_count,
               g.edge_count = $edge_count,
               g.dag = $dag,
               g.loaded_at = $loaded_at`,
          {
            graph_id: graphDef.graph_id,
            name: graphDef.name,
            category: graphDef.category,
            subcategory: graphDef.subcategory || '',
            version: graphDef.version,
            node_count: graphDef.nodes.length,
            edge_count: graphDef.edges.length,
            dag: JSON.stringify(dag),
            loaded_at: now,
          }
        );
      } catch (err) {
        console.warn(`[GraphLoader] Memgraph update failed for ${graphDef.graph_id}: ${err.message}`);
      }

      // 3. Create CatalogEntry + GraphDefinition + GraphVersion for GraphCatalog visibility
      try {
        const crypto = require('crypto');
        const { v4: uuidv4 } = require('uuid');

        const entryId = graphDef.graph_id; // Use graph_id as stable entryId
        const graphDefId = uuidv4();
        const versionId = uuidv4();
        const nodesJson = JSON.stringify(graphDef.nodes);
        const edgesJson = JSON.stringify(graphDef.edges);
        const reqParamsJson = JSON.stringify(
          graphDef.nodes.find(n => n.type === 'start')?.data?.config?.inputs || []
        );
        const contentHash = crypto.createHash('sha256').update(
          JSON.stringify({ nodes: graphDef.nodes.map(n => ({ id: n.id, type: n.type })).sort((a, b) => a.id.localeCompare(b.id)), edges: graphDef.edges.map(e => ({ source: e.source || e.sourceNodeId, target: e.target || e.targetNodeId })).sort((a, b) => `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`)) })
        ).digest('hex');

        // MERGE CatalogEntry (idempotent)
        await this._memgraph.executeQuery(
          `MERGE (c:CatalogEntry {entryId: $entryId})
           SET c.name = $name,
               c.namespace = $namespace,
               c.type = $type,
               c.description = $description,
               c.createdAt = $createdAt,
               c.updatedAt = $updatedAt,
               c.createdBy = $createdBy,
               c.tags = $tags,
               c.isPublic = true,
               c.visibility = 'PUBLIC',
               c.currentVersion = 1,
               c.usageCount = 0,
               c.qualityScore = 1.0`,
          {
            entryId,
            name: graphDef.name,
            namespace: graphDef.namespace || 'iNeed',
            type: graphDef.category === 'META' ? 'composite' : 'business',
            description: graphDef.description || '',
            createdAt: now,
            updatedAt: now,
            createdBy: 'GraphLoaderService',
            tags: [graphDef.category, graphDef.subcategory || ''].filter(Boolean),
          }
        );

        // Check if this entry already has a GraphDefinition (avoid duplicating on reload)
        const existing = await this._memgraph.executeQuery(
          `MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(d:GraphDefinition)
           RETURN d.graphId as gid LIMIT 1`,
          { entryId }
        );

        if (existing.records && existing.records.length > 0) {
          // Update existing definition in-place
          await this._memgraph.executeQuery(
            `MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(d:GraphDefinition)
             SET d.nodes = $nodes, d.edges = $edges, d.requiredParams = $requiredParams,
                 d.nodeCount = $nodeCount, d.edgeCount = $edgeCount, d.contentHash = $contentHash`,
            { entryId, nodes: nodesJson, edges: edgesJson, requiredParams: reqParamsJson, nodeCount: graphDef.nodes.length, edgeCount: graphDef.edges.length, contentHash }
          );
        } else {
          // Create fresh GraphDefinition + GraphVersion + relationships
          await this._memgraph.executeQuery(
            `CREATE (d:GraphDefinition {graphId: $graphDefId, nodes: $nodes, edges: $edges, requiredParams: $requiredParams, nodeCount: $nodeCount, edgeCount: $edgeCount, contentHash: $contentHash, validatedAt: $now, wasAutoFixed: false})`,
            { graphDefId, nodes: nodesJson, edges: edgesJson, requiredParams: reqParamsJson, nodeCount: graphDef.nodes.length, edgeCount: graphDef.edges.length, contentHash, now }
          );
          await this._memgraph.executeQuery(
            `CREATE (v:GraphVersion {versionId: $versionId, versionNumber: 1, changelog: 'Loaded by GraphLoaderService', createdAt: $now, createdBy: 'GraphLoaderService', contentHash: $contentHash})`,
            { versionId, now, contentHash }
          );
          await this._memgraph.executeQuery(
            `MATCH (c:CatalogEntry {entryId: $entryId})
             MATCH (d:GraphDefinition {graphId: $graphDefId})
             MATCH (v:GraphVersion {versionId: $versionId})
             CREATE (c)-[:DEFINES]->(d)
             CREATE (d)-[:HAS_VERSION]->(v)`,
            { entryId, graphDefId, versionId }
          );
          // Link to CatalogRoot
          await this._memgraph.executeQuery(
            `MATCH (root:CatalogRoot {id: 'catalog-root'})
             MATCH (c:CatalogEntry {entryId: $entryId})
             MERGE (root)-[:CONTAINS]->(c)`,
            { entryId }
          );
        }
      } catch (err) {
        console.warn(`[GraphLoader] GraphCatalog sync failed for ${graphDef.graph_id}: ${err.message}`);
      }
    }

    return {
      success: true,
      nodes: graphDef.nodes.length,
      edges: graphDef.edges.length,
    };
  }

  /**
   * Get a graph definition by ID
   * @param {string} graphId
   * @returns {Object|null}
   */
  getGraph(graphId) {
    return this._graphs[graphId] || null;
  }

  /**
   * Get a graph's DAG (nodes + edges) by ID
   * @param {string} graphId
   * @returns {{nodes: Array, edges: Array}|null}
   */
  getDAG(graphId) {
    const graph = this._graphs[graphId];
    if (!graph) return null;
    return {
      nodes: graph.nodes,
      edges: graph.edges,
    };
  }

  /**
   * List all registered graph IDs with summary
   * @returns {Array<{graphId: string, name: string, category: string, nodes: number, edges: number}>}
   */
  listGraphs() {
    return Object.entries(this._graphs).map(([graphId, def]) => ({
      graphId,
      name: def.name,
      category: def.category,
      subcategory: def.subcategory || '',
      version: def.version,
      nodes: def.nodes.length,
      edges: def.edges.length,
    }));
  }

  /**
   * Find graphs by category
   * @param {string} category
   * @returns {Object[]}
   */
  findByCategory(category) {
    return Object.values(this._graphs).filter(
      g => g.category.toLowerCase() === category.toLowerCase()
    );
  }

  /**
   * Register an additional graph definition at runtime
   * @param {Object} graphDef
   */
  registerGraph(graphDef) {
    if (!graphDef.graph_id) {
      throw new Error('Graph definition must have a graph_id');
    }
    this._graphs[graphDef.graph_id] = graphDef;
  }
}

module.exports = { GraphLoaderService, ALL_GRAPHS };

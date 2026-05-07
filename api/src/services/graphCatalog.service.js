/**
 * Graph Catalog Service — Unified CatalogEntry Model
 *
 * ALL graph storage uses CatalogEntry + GraphVersion:
 *   (:CatalogRoot)-[:CONTAINS]->(:CatalogEntry)-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(:GraphVersion)
 *   (:GraphVersion)-[:SUPERSEDES]->(:GraphVersion)
 *
 * Hierarchy relationships:
 *   (:CatalogEntry)-[:CHILD_OF]->(:CatalogEntry)
 *   (:CatalogEntry)-[:DECOMPOSES {nodeId}]->(:CatalogEntry)
 *
 * IMPORTANT: Uses shared memgraph.service driver to avoid connection pool exhaustion.
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const memgraphService = require('./memgraph.service');
const { graphClassificationService } = require('./graph-classification.service');

function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
}

const GRAPH_TYPES = {
  ATOMIC: 'atomic',
  TOOL: 'tool',
  BUSINESS: 'business',
  COMPOSITE: 'composite',
  TEMPLATE: 'template'
};

class GraphCatalogService {
  constructor() {
    this.driver = memgraphService.driver;
    this.connected = false;
    this.connectionError = null;

    if (!this.driver) {
      this.connectionError = 'Memgraph service not initialized';
      console.error('[GraphCatalog] Memgraph driver not available from shared service');
    } else {
      console.log('[GraphCatalog] Using shared Memgraph driver');
    }
  }

  async verifyConnection() {
    if (!this.driver) {
      return { connected: false, error: this.connectionError || 'Memgraph driver not initialized' };
    }
    try {
      const session = this.driver.session();
      await session.run('RETURN 1');
      await session.close();
      this.connected = true;
      this.connectionError = null;
      return { connected: true };
    } catch (error) {
      this.connected = false;
      this.connectionError = error.message;
      console.error('[GraphCatalog] Memgraph connection failed:', error.message);
      return { connected: false, error: error.message };
    }
  }

  getSession() {
    if (!this.driver) {
      throw new Error('Memgraph not connected: ' + (this.connectionError || 'driver not initialized'));
    }
    return this.driver.session();
  }

  async close() {
    console.log('[GraphCatalog] close() called - driver is shared, not closing');
  }

  /**
   * Initialize schema indexes
   */
  async initializeSchema() {
    // CREATE INDEX ON :Label(prop) is Memgraph-specific syntax — always fails on AGE.
    if (process.env.GRAPH_DB_BACKEND === 'postgres-age') return;
    const status = await this.verifyConnection();
    if (!status.connected) {
      console.warn('[GraphCatalog] Skipping schema init - not connected:', status.error);
      return;
    }

    const session = this.getSession();
    const results = { created: 0, skipped: 0 };

    try {
      const indexes = [
        'CREATE INDEX ON :CatalogEntry(entryId)',
        'CREATE INDEX ON :CatalogEntry(namespace)',
        'CREATE INDEX ON :CatalogEntry(type)',
        'CREATE INDEX ON :CatalogEntry(name)',
        'CREATE INDEX ON :GraphVersion(versionId)',
        'CREATE INDEX ON :GraphDefinition(contentHash)',
        'CREATE INDEX ON :GraphDefinition(graphId)',
        'CREATE INDEX ON :ReuseRecord(recordId)'
      ];

      for (const indexQuery of indexes) {
        try {
          await session.run(indexQuery);
          results.created++;
        } catch (e) {
          if (e.message.includes('already exists') || e.message.includes('equivalent index')) {
            results.skipped++;
          } else {
            console.warn('[GraphCatalog] Index creation warning:', e.message);
          }
        }
      }

      // Ensure CatalogRoot node exists
      try {
        await session.run(`
          MERGE (root:CatalogRoot {id: 'catalog-root'})
          ON CREATE SET root.namespace = 'CORE', root.createdAt = datetime()
        `);
        results.created++;
      } catch (e) {
        console.warn('[GraphCatalog] CatalogRoot creation warning:', e.message);
      }

      console.log(`[GraphCatalog] Schema initialized: ${results.created} created, ${results.skipped} skipped`);
    } finally {
      await session.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CRUD OPERATIONS (unified CatalogEntry model)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create a new graph (creates CatalogEntry + GraphDefinition + GraphVersion v1)
   */
  async createGraph(data) {
    const session = this.getSession();
    const entryId = uuidv4();
    const graphId = uuidv4();
    const versionId = uuidv4();
    const now = new Date().toISOString();
    const nodes = data.nodes || [];
    const edges = data.edges || [];

    const contentHash = this.computeContentHash(nodes, edges);
    const toolIds = this.extractToolIds(nodes);
    const topology = this.classifyTopology(nodes, edges);

    // ── Resolve graph classification ─────────────────────────────────────
    let graphType = data.graphType || null;
    let graphSubType = data.graphSubType || null;
    let graphDimension = null;

    if (graphType) {
      graphClassificationService.validateGraphType(graphType);
      if (graphSubType) graphClassificationService.validateSubType(graphType, graphSubType);
      graphDimension = graphClassificationService.getDimension(graphType);
    } else {
      // Derive from legacy CatalogEntry.type
      const legacy = graphClassificationService.mapLegacyType(data.type || 'atomic');
      graphType = legacy.graphType;
      graphSubType = legacy.subType;
      graphDimension = graphClassificationService.getDimension(graphType);
    }
    // ─────────────────────────────────────────────────────────────────────

    try {
      // Create CatalogEntry
      await session.run(`
        CREATE (c:CatalogEntry {
          entryId: $entryId,
          name: $name,
          description: $description,
          type: $type,
          namespace: $namespace,
          graphKey: $graphKey,
          tags: $tags,
          visibility: $visibility,
          isPublic: $isPublic,
          createdBy: $createdBy,
          createdAt: $now,
          updatedAt: $now,
          currentVersion: 1,
          usageCount: 0,
          qualityScore: 1.0
        })
      `, {
        entryId,
        name: data.name,
        description: data.description || '',
        type: data.type || GRAPH_TYPES.ATOMIC,
        namespace: data.namespace || 'default',
        graphKey: data.graphKey || null,
        tags: data.tags || [],
        visibility: data.visibility || 'PUBLIC',
        isPublic: data.isPublic !== false,
        createdBy: data.createdBy || 'system',
        now,
      });

      // Create GraphDefinition (with graph classification)
      await session.run(`
        CREATE (g:GraphDefinition {
          graphId: $graphId,
          nodes: $nodes,
          edges: $edges,
          requiredParams: $requiredParams,
          toolIds: $toolIds,
          nodeCount: $nodeCount,
          edgeCount: $edgeCount,
          topology: $topology,
          contentHash: $contentHash,
          validatedAt: $now,
          wasAutoFixed: false,
          graphType: $graphType,
          graphSubType: $graphSubType,
          graphDimension: $graphDimension
        })
      `, {
        graphId,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        requiredParams: JSON.stringify(data.requiredParams || {}),
        toolIds,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        topology, contentHash, now,
        graphType, graphSubType, graphDimension
      });

      // Create GraphVersion
      await session.run(`
        CREATE (v:GraphVersion {
          versionId: $versionId,
          versionNumber: 1,
          changelog: 'Initial version',
          createdAt: $now,
          createdBy: $createdBy,
          contentHash: $contentHash
        })
      `, {
        versionId, now,
        createdBy: data.createdBy || 'system',
        contentHash
      });

      // Create relationships
      await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})
        MATCH (g:GraphDefinition {graphId: $graphId})
        MATCH (v:GraphVersion {versionId: $versionId})
        CREATE (c)-[:DEFINES]->(g)
        CREATE (g)-[:HAS_VERSION]->(v)
      `, { entryId, graphId, versionId });

      // Link to CatalogRoot
      await session.run(`
        MATCH (root:CatalogRoot {id: 'catalog-root'})
        MATCH (c:CatalogEntry {entryId: $entryId})
        MERGE (root)-[:CONTAINS]->(c)
      `, { entryId });

      // CHILD_OF relationship for hierarchy
      if (data.parentId) {
        await session.run(`
          MATCH (child:CatalogEntry {entryId: $childId})
          MATCH (parent:CatalogEntry {entryId: $parentId})
          CREATE (child)-[:CHILD_OF]->(parent)
        `, { childId: entryId, parentId: data.parentId });
      }

      // DECOMPOSES relationship for sub-graphs
      if (data.parentGraphId && data.parentNodeId) {
        await session.run(`
          MATCH (child:CatalogEntry {entryId: $childId})
          MATCH (parent:CatalogEntry {entryId: $parentGraphId})
          CREATE (child)-[:DECOMPOSES {nodeId: $parentNodeId, createdAt: datetime($now)}]->(parent)
        `, { childId: entryId, parentGraphId: data.parentGraphId, parentNodeId: data.parentNodeId, now });
      }

      console.log(`[GraphCatalog] Created: ${data.name} (${entryId})`);

      const formatted = this._formatCatalogEntry(
        { entryId, name: data.name, description: data.description || '', type: data.type || GRAPH_TYPES.ATOMIC, namespace: data.namespace || 'default', tags: data.tags || [], visibility: data.visibility || 'PUBLIC', isPublic: data.isPublic !== false, createdBy: data.createdBy || 'system', createdAt: now, updatedAt: now, currentVersion: 1, usageCount: 0, qualityScore: 1.0 },
        { nodes: JSON.stringify(nodes), edges: JSON.stringify(edges), requiredParams: JSON.stringify(data.requiredParams || {}) },
        null
      );

      formatted.parentGraphId = data.parentGraphId || null;
      formatted.parentNodeId = data.parentNodeId || null;
      formatted.entryId = entryId;
      formatted.graphId = graphId;
      formatted.versionId = versionId;
      formatted.contentHash = contentHash;
      formatted.topology = topology;
      formatted.graphType = graphType;
      formatted.graphSubType = graphSubType;
      formatted.graphDimension = graphDimension;

      return formatted;
    } finally {
      await session.close();
    }
  }

  /**
   * Get graph by ID (entryId)
   * Loads the latest version's GraphDefinition
   */
  async getGraphById(id, includeSubGraphs = true) {
    const session = this.getSession();
    try {
      // Get CatalogEntry with its latest GraphDefinition (by highest versionNumber)
      const result = await session.run(`
        MATCH (c:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
        OPTIONAL MATCH (c)-[:CHILD_OF]->(parent:CatalogEntry)
        RETURN c, d, v, parent.entryId as parentId
        ORDER BY v.versionNumber DESC
        LIMIT 1
      `, { id });

      if (result.records.length === 0) return null;

      const entry = result.records[0].get('c').properties;
      const definition = result.records[0].get('d').properties;
      const version = result.records[0].get('v').properties;
      const parentId = result.records[0].get('parentId');

      const formatted = this._formatCatalogEntry(entry, definition, parentId);
      formatted.versionNumber = toNumber(version.versionNumber);
      formatted.versionId = version.versionId;

      // Get sub-graphs
      if (includeSubGraphs) {
        const subResult = await session.run(`
          MATCH (sub:CatalogEntry)-[r:DECOMPOSES]->(c:CatalogEntry {entryId: $id})
          MATCH (sub)-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
          WITH sub, d, v, r.nodeId as nodeId
          ORDER BY v.versionNumber DESC
          WITH sub, COLLECT(d)[0] as d, COLLECT(v)[0] as v, nodeId
          RETURN sub, d, nodeId
          ORDER BY sub.name
        `, { id });

        const subGraphs = {};
        for (const record of subResult.records) {
          const subEntry = record.get('sub').properties;
          const subDef = record.get('d').properties;
          const nodeId = record.get('nodeId');
          subGraphs[nodeId] = this._formatCatalogEntry(subEntry, subDef);
        }
        formatted.subGraphs = subGraphs;
      }

      return formatted;
    } finally {
      await session.close();
    }
  }

  /**
   * Get all sub-graphs for a graph
   */
  async getSubGraphs(graphId) {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (sub:CatalogEntry)-[r:DECOMPOSES]->(c:CatalogEntry {entryId: $graphId})
        MATCH (sub)-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
        WITH sub, d, v, r.nodeId as nodeId
        ORDER BY v.versionNumber DESC
        WITH sub, COLLECT(d)[0] as d, nodeId
        RETURN sub, d, nodeId
        ORDER BY sub.name
      `, { graphId });

      const subGraphs = {};
      for (const record of result.records) {
        const subEntry = record.get('sub').properties;
        const subDef = record.get('d').properties;
        const nodeId = record.get('nodeId');
        subGraphs[nodeId] = this._formatCatalogEntry(subEntry, subDef);
      }

      return subGraphs;
    } finally {
      await session.close();
    }
  }

  /**
   * Update graph (updates CatalogEntry props and optionally the GraphDefinition of latest version)
   */
  async updateGraph(id, updates) {
    const session = this.getSession();
    const now = new Date().toISOString();

    try {
      // Build dynamic SET clause for CatalogEntry
      const entryUpdates = [];
      const params = { id, updatedAt: now };

      const allowedFields = ['name', 'namespace', 'type', 'description', 'tags', 'isPublic', 'visibility', 'graphKey'];
      for (const field of allowedFields) {
        if (updates[field] !== undefined) {
          entryUpdates.push(`c.${field} = $${field}`);
          params[field] = updates[field];
        }
      }
      entryUpdates.push('c.updatedAt = $updatedAt');

      // Update GraphDefinition if provided
      const defUpdates = [];
      if (updates.nodes !== undefined) {
        defUpdates.push('d.nodes = $nodes');
        defUpdates.push('d.nodeCount = $nodeCount');
        params.nodes = JSON.stringify(updates.nodes);
        params.nodeCount = updates.nodes.length;
      }
      if (updates.edges !== undefined) {
        defUpdates.push('d.edges = $edges');
        defUpdates.push('d.edgeCount = $edgeCount');
        params.edges = JSON.stringify(updates.edges);
        params.edgeCount = updates.edges.length;
      }
      if (updates.requiredParams !== undefined) {
        defUpdates.push('d.requiredParams = $requiredParams');
        params.requiredParams = JSON.stringify(updates.requiredParams);
      }

      // Update content hash if nodes or edges changed
      if (updates.nodes !== undefined || updates.edges !== undefined) {
        const newNodes = updates.nodes;
        const newEdges = updates.edges;
        if (newNodes && newEdges) {
          const contentHash = this.computeContentHash(newNodes, newEdges);
          defUpdates.push('d.contentHash = $contentHash');
          params.contentHash = contentHash;
        }
      }

      // Query: match CatalogEntry with its latest-version GraphDefinition
      const query = `
        MATCH (c:CatalogEntry {entryId: $id})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
        WITH c, d, v
        ORDER BY v.versionNumber DESC
        LIMIT 1
        SET ${entryUpdates.join(', ')}
        ${defUpdates.length > 0 ? ', ' + defUpdates.join(', ') : ''}
        RETURN c, d
      `;

      const result = await session.run(query, params);

      if (result.records.length === 0) return null;

      const entry = result.records[0].get('c').properties;
      const definition = result.records[0].get('d').properties;

      return this._formatCatalogEntry(entry, definition);
    } finally {
      await session.close();
    }
  }

  /**
   * Delete graph (CatalogEntry + all linked GraphDefinitions + GraphVersions)
   */
  async deleteGraph(id) {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (c:CatalogEntry {entryId: $id})
        OPTIONAL MATCH (c)-[:DEFINES]->(d:GraphDefinition)
        OPTIONAL MATCH (d)-[:HAS_VERSION]->(v:GraphVersion)
        DETACH DELETE c, d, v
        RETURN count(c) as deleted
      `, { id });

      return toNumber(result.records[0].get('deleted')) > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * List graphs with filtering and search
   */
  async listGraphs(options = {}) {
    const session = this.getSession();
    const {
      namespace, type, search, tags, parentId,
      rootOnly = false, page = 1, limit = 50
    } = options;

    const pageInt = Math.max(1, Math.floor(Number(page)) || 1);
    const limitInt = Math.max(1, Math.min(1000, Math.floor(Number(limit)) || 50));

    try {
      const conditions = [];
      const skipValue = Math.floor((pageInt - 1) * limitInt);
      const params = {};

      if (namespace) { conditions.push('c.namespace = $namespace'); params.namespace = namespace; }
      if (type) { conditions.push('c.type = $type'); params.type = type; }
      if (search) { conditions.push('(c.name CONTAINS $search OR c.description CONTAINS $search)'); params.search = search; }
      if (tags && tags.length > 0) { conditions.push('ANY(tag IN $tags WHERE tag IN c.tags)'); params.tags = tags; }
      if (parentId) { conditions.push('parent.entryId = $parentId'); params.parentId = parentId; }
      if (rootOnly) { conditions.push('NOT (c)-[:CHILD_OF]->()'); }

      const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

      // Total count
      const countResult = await session.run(`
        MATCH (c:CatalogEntry)
        ${parentId ? 'MATCH (c)-[:CHILD_OF]->(parent:CatalogEntry)' : ''}
        ${whereClause}
        RETURN count(c) as total
      `, params);
      const total = toNumber(countResult.records[0].get('total'));

      // Paginated results — get latest GraphDefinition per entry
      const result = await session.run(`
        MATCH (c:CatalogEntry)
        ${parentId ? 'MATCH (c)-[:CHILD_OF]->(parent:CatalogEntry {entryId: $parentId})' : ''}
        ${whereClause}
        WITH c
        ORDER BY c.updatedAt DESC
        SKIP ${skipValue} LIMIT ${limitInt}
        OPTIONAL MATCH (c)-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
        WITH c, d, v
        ORDER BY v.versionNumber DESC
        WITH c, COLLECT(d)[0] as d
        OPTIONAL MATCH (c)-[:CHILD_OF]->(parentNode:CatalogEntry)
        RETURN c, d, parentNode.entryId as parentId
      `, params);

      const graphs = result.records.map(record => {
        const entry = record.get('c').properties;
        const definition = record.get('d')?.properties;
        const parentId = record.get('parentId');
        return this._formatCatalogEntry(entry, definition, parentId);
      });

      return {
        data: graphs,
        pagination: { page: pageInt, limit: limitInt, total, totalPages: Math.ceil(total / limitInt) }
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get graph tree structure (grouped by type)
   */
  async getGraphTree(options = {}) {
    const session = this.getSession();
    try {
      const opts = typeof options === 'string' ? { namespace: options } : (options || {});
      const { namespace, search, type } = opts;

      const params = {};
      const whereClauses = [];

      if (namespace) { whereClauses.push('c.namespace = $namespace'); params.namespace = namespace; }
      if (type) { whereClauses.push('c.type = $type'); params.type = type; }
      if (search) { whereClauses.push('(toLower(c.name) CONTAINS toLower($search) OR toLower(c.description) CONTAINS toLower($search))'); params.search = search; }

      const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

      const result = await session.run(`
        MATCH (c:CatalogEntry)
        ${whereClause}
        OPTIONAL MATCH (c)-[:CHILD_OF]->(parent:CatalogEntry)
        CALL {
          WITH c
          OPTIONAL MATCH (c)<-[:CHILD_OF]-(child:CatalogEntry)
          RETURN count(child) AS childCount
        }
        RETURN c.entryId as id, c.name as name, c.type as type, c.namespace as namespace,
               c.description as description, parent.entryId as parentId, childCount,
               c.currentVersion as currentVersion
        ORDER BY c.type, c.name
      `, params);

      const tree = { atomic: [], tool: [], business: [], composite: [], template: [] };
      const graphMap = new Map();

      for (const record of result.records) {
        const node = {
          id: record.get('id'),
          name: record.get('name'),
          type: record.get('type'),
          namespace: record.get('namespace'),
          description: record.get('description'),
          parentId: record.get('parentId'),
          childCount: toNumber(record.get('childCount')),
          currentVersion: toNumber(record.get('currentVersion')),
          children: []
        };
        graphMap.set(node.id, node);
      }

      for (const [id, node] of graphMap) {
        if (node.parentId && graphMap.has(node.parentId)) {
          graphMap.get(node.parentId).children.push(node);
        } else {
          const typeGroup = tree[node.type] || tree.atomic;
          typeGroup.push(node);
        }
      }

      return tree;
    } finally {
      await session.close();
    }
  }

  /**
   * Get all namespaces with graph counts
   */
  async getNamespaces() {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (c:CatalogEntry)
        WITH c.namespace AS ns, c
        RETURN ns, count(c) AS cnt
        ORDER BY ns
      `);
      return result.records.map(record => ({
        namespace: record.get('ns'),
        count: toNumber(record.get('cnt'))
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all graph types with counts
   */
  async getTypes() {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (c:CatalogEntry)
        WITH c.type AS gtype, c
        RETURN gtype, count(c) AS cnt
        ORDER BY gtype
      `);
      return result.records.map(record => ({
        type: record.get('gtype'),
        count: toNumber(record.get('cnt'))
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all unique labels (tags) with counts
   */
  async getLabels() {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (c:CatalogEntry)
        WHERE c.tags IS NOT NULL AND size(c.tags) > 0
        UNWIND c.tags AS tag
        WITH tag, count(*) AS tagCount
        RETURN tag AS lbl, tagCount AS cnt
        ORDER BY tagCount DESC, tag
      `);
      return result.records.map(record => ({
        label: record.get('lbl'),
        count: toNumber(record.get('cnt'))
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Clone a graph (creates a new CatalogEntry with the same content)
   */
  async cloneGraph(id, overrides = {}) {
    const original = await this.getGraphById(id);
    if (!original) throw new Error('Graph not found');

    return this.createGraph({
      ...original,
      ...overrides,
      name: overrides.name || `${original.name} (Copy)`,
      id: undefined,
      entryId: undefined,
      createdAt: undefined,
      updatedAt: undefined
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VERSION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Get all versions of a catalog entry
   */
  async getVersions(entryId) {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
        RETURN v.versionId as versionId, v.versionNumber as versionNumber,
               v.changelog as changelog, v.createdAt as createdAt,
               v.createdBy as createdBy, v.contentHash as contentHash,
               d.nodeCount as nodeCount, d.edgeCount as edgeCount, d.topology as topology,
               v.isProduction as isProduction
        ORDER BY v.versionNumber DESC
      `, { entryId });

      return result.records.map(r => ({
        versionId: r.get('versionId'),
        versionNumber: toNumber(r.get('versionNumber')),
        changelog: r.get('changelog'),
        createdAt: r.get('createdAt'),
        createdBy: r.get('createdBy'),
        contentHash: r.get('contentHash'),
        nodeCount: toNumber(r.get('nodeCount')),
        edgeCount: toNumber(r.get('edgeCount')),
        topology: r.get('topology'),
        isProduction: r.get('isProduction') || false,
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get a specific version's GraphDefinition
   */
  async getVersion(entryId, versionNumber) {
    const session = this.getSession();
    try {
      const result = await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(d:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion {versionNumber: $versionNumber})
        RETURN c, d, v
      `, { entryId, versionNumber: Number(versionNumber) });

      if (result.records.length === 0) return null;

      const entry = result.records[0].get('c').properties;
      const definition = result.records[0].get('d').properties;
      const version = result.records[0].get('v').properties;

      const formatted = this._formatCatalogEntry(entry, definition);
      formatted.versionNumber = toNumber(version.versionNumber);
      formatted.versionId = version.versionId;
      formatted.changelog = version.changelog;

      return formatted;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a new version of an existing catalog entry
   */
  async createVersion(entryId, data, changelog = 'Updated', context = {}) {
    const session = this.getSession();
    const graphId = uuidv4();
    const versionId = uuidv4();
    const now = new Date().toISOString();
    const nodes = data.nodes || [];
    const edges = data.edges || [];

    const contentHash = this.computeContentHash(nodes, edges);
    const toolIds = this.extractToolIds(nodes);
    const topology = this.classifyTopology(nodes, edges);

    try {
      // Get current version number and graphType
      const vResult = await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(prev:GraphDefinition)
        RETURN c.currentVersion AS currentVersion,
               prev.graphType AS graphType,
               prev.graphSubType AS graphSubType,
               prev.graphDimension AS graphDimension
        ORDER BY c.currentVersion DESC
        LIMIT 1
      `, { entryId });

      if (vResult.records.length === 0) {
        throw new Error(`CatalogEntry not found: ${entryId}`);
      }

      const currentVersion = toNumber(vResult.records[0].get('currentVersion'));
      const versionNumber = currentVersion + 1;

      // Inherit graphType from previous version (or from data override)
      const graphType = data.graphType || vResult.records[0].get('graphType') || 'EXECUTABLE';
      const graphSubType = data.graphSubType || vResult.records[0].get('graphSubType') || null;
      const graphDimension = data.graphDimension || vResult.records[0].get('graphDimension') || 'EXECUTION';

      // Update CatalogEntry
      await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})
        SET c.updatedAt = $now, c.currentVersion = $versionNumber
      `, { entryId, now, versionNumber });

      // Create new GraphDefinition (with inherited graph classification)
      await session.run(`
        CREATE (g:GraphDefinition {
          graphId: $graphId,
          nodes: $nodes,
          edges: $edges,
          requiredParams: $requiredParams,
          toolIds: $toolIds,
          nodeCount: $nodeCount,
          edgeCount: $edgeCount,
          topology: $topology,
          contentHash: $contentHash,
          validatedAt: $now,
          wasAutoFixed: false,
          graphType: $graphType,
          graphSubType: $graphSubType,
          graphDimension: $graphDimension
        })
      `, {
        graphId,
        nodes: JSON.stringify(nodes),
        edges: JSON.stringify(edges),
        requiredParams: JSON.stringify(data.requiredParams || {}),
        toolIds,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        topology, contentHash, now,
        graphType, graphSubType, graphDimension
      });

      // Create new GraphVersion
      await session.run(`
        CREATE (v:GraphVersion {
          versionId: $versionId,
          versionNumber: $versionNumber,
          changelog: $changelog,
          createdAt: $now,
          createdBy: $createdBy,
          contentHash: $contentHash
        })
      `, {
        versionId, versionNumber, changelog,
        now, createdBy: context.userId || 'system',
        contentHash
      });

      // Create relationships
      await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})
        MATCH (g:GraphDefinition {graphId: $graphId})
        MATCH (v:GraphVersion {versionId: $versionId})
        CREATE (c)-[:DEFINES]->(g)
        CREATE (g)-[:HAS_VERSION]->(v)
      `, { entryId, graphId, versionId });

      // SUPERSEDES link to previous version
      await session.run(`
        MATCH (v:GraphVersion {versionId: $versionId})
        MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(prev:GraphVersion)
        WHERE prev.versionNumber = $prevVersionNumber
        CREATE (v)-[:SUPERSEDES]->(prev)
      `, { versionId, entryId, prevVersionNumber: versionNumber - 1 });

      console.log(`[GraphCatalog] Version ${versionNumber} created for ${entryId}`);

      return { entryId, graphId, versionId, versionNumber, contentHash };
    } finally {
      await session.close();
    }
  }

  /**
   * Create new version via REST API convenience alias
   */
  async createNewVersion(entryId, data) {
    return this.createVersion(
      entryId,
      { nodes: data.nodes, edges: data.edges, requiredParams: data.requiredParams },
      data.changelog || 'Updated',
      { userId: data.createdBy || 'system' }
    );
  }

  /**
   * Promote a specific version to Production.
   * Clears isProduction from all other versions of the same entry.
   */
  async promoteVersion(entryId, versionNumber) {
    const session = this.getSession();
    try {
      // Clear production flag on all versions of this entry
      await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
        SET v.isProduction = false
      `, { entryId });

      // Set production flag on the target version
      const result = await session.run(`
        MATCH (c:CatalogEntry {entryId: $entryId})-[:DEFINES]->(:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion {versionNumber: $versionNumber})
        SET v.isProduction = true
        RETURN v.versionId as versionId, v.versionNumber as versionNumber
      `, { entryId, versionNumber: Number(versionNumber) });

      if (result.records.length === 0) {
        throw new Error(`Version ${versionNumber} not found for entry ${entryId}`);
      }

      console.log(`[GraphCatalog] Version ${versionNumber} promoted to Production for ${entryId}`);
      return {
        entryId,
        versionNumber: toNumber(result.records[0].get('versionNumber')),
        versionId: result.records[0].get('versionId'),
      };
    } finally {
      await session.close();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CATALOG METHODS (Phase A — kept for MCP tool compatibility)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create catalog entry (alias for createGraph, used by MCP SaveGraphTool)
   */
  async createCatalogEntry(data, validation = {}, context = {}) {
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    const contentHash = this.computeContentHash(nodes, edges);
    const topology = this.classifyTopology(nodes, edges);
    const qualityScore = this.computeQualityScore(validation);

    // Delegate to createGraph which now creates CatalogEntry natively
    const result = await this.createGraph({
      name: data.name,
      description: data.description,
      type: data.type,
      namespace: data.namespace,
      tags: data.tags,
      visibility: data.visibility,
      nodes,
      edges,
      requiredParams: data.requiredParams,
      createdBy: context.userId || 'system',
    });

    return {
      entryId: result.entryId || result.id,
      graphId: result.graphId,
      versionId: result.versionId,
      versionNumber: 1,
      contentHash,
      topology,
      qualityScore,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════

  computeContentHash(nodes, edges) {
    const canonical = {
      nodes: (nodes || [])
        .map(n => ({ id: n.id, type: n.type, data: n.data }))
        .sort((a, b) => (a.id || '').localeCompare(b.id || '')),
      edges: (edges || [])
        .map(e => ({ source: e.source || e.sourceNodeId, target: e.target || e.targetNodeId }))
        .sort((a, b) => `${a.source}-${a.target}`.localeCompare(`${b.source}-${b.target}`))
    };
    return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  classifyTopology(nodes, edges) {
    if (!nodes || nodes.length === 0) return 'PIPELINE';
    const inDeg = new Map();
    const outDeg = new Map();
    for (const n of nodes) { inDeg.set(n.id, 0); outDeg.set(n.id, 0); }
    for (const e of (edges || [])) {
      const src = e.source || e.sourceNodeId;
      const tgt = e.target || e.targetNodeId;
      inDeg.set(tgt, (inDeg.get(tgt) || 0) + 1);
      outDeg.set(src, (outDeg.get(src) || 0) + 1);
    }
    const maxIn = Math.max(0, ...inDeg.values());
    const maxOut = Math.max(0, ...outDeg.values());
    if (maxIn <= 1 && maxOut <= 1) return 'PIPELINE';
    if (maxIn <= 1) return 'TREE';
    return 'DAG';
  }

  extractToolIds(nodes) {
    return [...new Set(
      (nodes || []).filter(n => n.data?.toolId).map(n => n.data.toolId)
    )].sort();
  }

  computeQualityScore(validationResult) {
    if (!validationResult) return 1.0;
    const { errors = [], warnings = [] } = validationResult;
    let score = 1.0;
    score -= errors.length * 0.2;
    score -= warnings.length * 0.05;
    return Math.max(0, Math.round(score * 100) / 100);
  }

  /**
   * Find existing graph by content hash (deduplication)
   */
  async findByContentHash(contentHash) {
    const session = this.getSession();
    try {
      const result = await session.run(`
        OPTIONAL MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition {contentHash: $contentHash})
        WITH c
        WHERE c IS NOT NULL
        RETURN c.entryId AS entryId, c.name AS name
        LIMIT 1
      `, { contentHash });

      if (result.records.length > 0 && result.records[0].get('entryId')) {
        return {
          entryId: result.records[0].get('entryId'),
          name: result.records[0].get('name')
        };
      }
      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Record reuse lineage between graphs
   */
  async recordReuse(sourceEntryId, targetEntryId, strategy, context = {}) {
    const session = this.getSession();
    const recordId = uuidv4();
    try {
      await session.run(`
        CREATE (r:ReuseRecord {
          recordId: $recordId,
          sourceEntryId: $sourceEntryId,
          targetEntryId: $targetEntryId,
          strategy: $strategy,
          accepted: true,
          createdAt: datetime(),
          createdBy: $createdBy
        })
        WITH r
        MATCH (source:CatalogEntry {entryId: $sourceEntryId})
        MATCH (target:CatalogEntry {entryId: $targetEntryId})
        CREATE (target)-[:DERIVED_FROM]->(source)
      `, {
        recordId, sourceEntryId, targetEntryId, strategy,
        createdBy: context.userId || 'system'
      });
      console.log(`[GraphCatalog] Reuse recorded: ${targetEntryId} ←[${strategy}]← ${sourceEntryId}`);
      return { recordId };
    } finally {
      await session.close();
    }
  }

  /**
   * Format CatalogEntry for API response
   * Returns the same shape as the old _formatGraphContainer for backward compatibility
   */
  _formatCatalogEntry(entry, definition, parentId = null) {
    const formatDate = (dt) => {
      if (!dt) return null;
      if (typeof dt === 'string') return dt;
      if (dt.toStandardDate) return dt.toStandardDate().toISOString();
      return dt.toString();
    };

    return {
      id: entry.entryId,
      name: entry.name,
      namespace: entry.namespace,
      type: entry.type,
      description: entry.description,
      version: toNumber(entry.currentVersion),
      currentVersion: toNumber(entry.currentVersion),
      createdAt: formatDate(entry.createdAt),
      updatedAt: formatDate(entry.updatedAt),
      createdBy: entry.createdBy,
      tags: entry.tags || [],
      isPublic: entry.isPublic !== false,
      parentId,
      // Graph classification
      graphType: definition?.graphType || null,
      graphSubType: definition?.graphSubType || null,
      graphDimension: definition?.graphDimension || null,
      // Graph definition
      nodeCount: toNumber(definition?.nodeCount) || 0,
      edgeCount: toNumber(definition?.edgeCount) || 0,
      nodes: definition ? JSON.parse(definition.nodes || '[]') : [],
      edges: definition ? JSON.parse(definition.edges || '[]') : [],
      requiredParams: definition ? JSON.parse(definition.requiredParams || '{}') : {}
    };
  }
}

// Singleton
const graphCatalogService = new GraphCatalogService();
graphCatalogService.initializeSchema().catch(console.error);

module.exports = {
  graphCatalogService,
  GRAPH_TYPES
};

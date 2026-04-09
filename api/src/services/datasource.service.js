/**
 * =============================================================================
 * DATASOURCE SERVICE
 *
 * CRUD operations for DataSource configurations in Memgraph.
 * DataSource is stored as GraphDefinition with graphSubType: 'datasource'
 * and an additional :DataSource label for quick lookup.
 * =============================================================================
 */

const { DataSourceType } = require('../schemas/datasource-config.schema');
const neo4j = require('neo4j-driver');

class DataSourceService {
  constructor(memgraphService) {
    this.memgraph = memgraphService;
  }

  /**
   * Create a new DataSource
   * @param {object} dataSourceConfig - Output of any DataSourceBuilder.build()
   * @returns {string} graphId
   */
  async create(dataSourceConfig) {
    const {
      graphId, name, namespace, sourceType, config,
      sqlConfig, apiConfig, kbConfig, fileConfig, compositeConfig,
    } = dataSourceConfig;

    if (!Object.values(DataSourceType).includes(sourceType)) {
      throw new Error(`Invalid sourceType: ${sourceType}`);
    }

    const result = await this.memgraph.runQuery(`
      CREATE (ds:GraphDefinition:DataSource {
        graphId: $graphId,
        name: $name,
        namespace: $namespace,
        graphType: 'STRUCTURAL',
        graphSubType: 'datasource',
        graphDimension: 'DATA',
        sourceType: $sourceType,
        config: $config,
        sqlConfig: $sqlConfig,
        apiConfig: $apiConfig,
        kbConfig: $kbConfig,
        fileConfig: $fileConfig,
        compositeConfig: $compositeConfig,
        createdAt: datetime(),
        updatedAt: datetime()
      })
      RETURN ds.graphId as graphId
    `, {
      graphId,
      name,
      namespace,
      sourceType,
      config: JSON.stringify(config),
      sqlConfig: sqlConfig ? JSON.stringify(sqlConfig) : null,
      apiConfig: apiConfig ? JSON.stringify(apiConfig) : null,
      kbConfig: kbConfig ? JSON.stringify(kbConfig) : null,
      fileConfig: fileConfig ? JSON.stringify(fileConfig) : null,
      compositeConfig: compositeConfig ? JSON.stringify(compositeConfig) : null,
    });

    return result[0]?.graphId || graphId;
  }

  /**
   * Get DataSource by graphId
   * @returns {object|null}
   */
  async get(graphId) {
    const result = await this.memgraph.runQuery(`
      MATCH (ds:DataSource {graphId: $graphId})
      RETURN ds
    `, { graphId });

    if (result.length === 0) return null;
    return this._parseDataSource(result[0].ds);
  }

  /**
   * Update DataSource fields
   * @returns {object} updated DataSource
   */
  async update(graphId, updates) {
    const setClauses = [];
    const params = { graphId };

    const jsonFields = ['config', 'sqlConfig', 'apiConfig', 'kbConfig', 'fileConfig', 'compositeConfig'];
    const stringFields = ['name', 'namespace', 'sourceType'];

    for (const field of stringFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`ds.${field} = $${field}`);
        params[field] = updates[field];
      }
    }
    for (const field of jsonFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`ds.${field} = $${field}`);
        params[field] = JSON.stringify(updates[field]);
      }
    }

    if (setClauses.length === 0) return this.get(graphId);

    setClauses.push('ds.updatedAt = datetime()');

    await this.memgraph.runQuery(`
      MATCH (ds:DataSource {graphId: $graphId})
      SET ${setClauses.join(', ')}
      RETURN ds.graphId
    `, params);

    return this.get(graphId);
  }

  /**
   * Delete DataSource by graphId
   * @returns {boolean}
   */
  async delete(graphId) {
    const result = await this.memgraph.runQuery(`
      MATCH (ds:DataSource {graphId: $graphId})
      DELETE ds
      RETURN count(*) as deleted
    `, { graphId });

    return result[0]?.deleted > 0;
  }

  /**
   * List DataSources with optional filters
   */
  async list(namespace = null, options = {}) {
    const { limit = 100, offset = 0, sourceType = null } = options;
    const conditions = [];
    const params = { limit: neo4j.int(limit), offset: neo4j.int(offset) };

    if (namespace) {
      conditions.push('ds.namespace = $namespace');
      params.namespace = namespace;
    }
    if (sourceType) {
      conditions.push('ds.sourceType = $sourceType');
      params.sourceType = sourceType;
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const result = await this.memgraph.runQuery(`
      MATCH (ds:DataSource)
      ${whereClause}
      RETURN ds
      ORDER BY ds.name
      SKIP $offset
      LIMIT $limit
    `, params);

    return result.map(r => this._parseDataSource(r.ds));
  }

  /**
   * Search DataSources by name (case-insensitive regex)
   */
  async search(query, namespace = null) {
    const params = { query: `(?i).*${query}.*` };
    const conditions = ['ds.name =~ $query'];

    if (namespace) {
      conditions.push('ds.namespace = $namespace');
      params.namespace = namespace;
    }

    const result = await this.memgraph.runQuery(`
      MATCH (ds:DataSource)
      WHERE ${conditions.join(' AND ')}
      RETURN ds
      ORDER BY ds.name
      LIMIT 20
    `, params);

    return result.map(r => this._parseDataSource(r.ds));
  }

  /**
   * Check if DataSource exists
   */
  async exists(graphId) {
    const result = await this.memgraph.runQuery(`
      MATCH (ds:DataSource {graphId: $graphId})
      RETURN count(ds) as count
    `, { graphId });

    return result[0]?.count > 0;
  }

  /**
   * Get DataSources referenced by a STRUCTURAL graph's field nodes.
   * Scans nodes JSON for dataSource.dataSourceId references.
   */
  async getForStructural(structuralGraphId) {
    // First get the structural graph's nodes
    const graphResult = await this.memgraph.runQuery(`
      MATCH (g:GraphDefinition {graphId: $structuralGraphId})
      WHERE g.graphType = 'STRUCTURAL'
      RETURN g.nodes as nodesJson
    `, { structuralGraphId });

    if (graphResult.length === 0) return [];

    // Parse nodes and extract dataSourceId references
    let nodes;
    try {
      nodes = JSON.parse(graphResult[0].nodesJson || '[]');
    } catch {
      return [];
    }

    const dsIds = new Set();
    for (const node of nodes) {
      if (node.dataSource?.dataSourceId) {
        dsIds.add(node.dataSource.dataSourceId);
      }
    }

    if (dsIds.size === 0) return [];

    // Fetch referenced DataSources
    const idArray = Array.from(dsIds);
    const result = await this.memgraph.runQuery(`
      MATCH (ds:DataSource)
      WHERE ds.graphId IN $ids
      RETURN ds
    `, { ids: idArray });

    return result.map(r => this._parseDataSource(r.ds));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _parseDataSource(node) {
    const props = node.properties || node;
    return {
      graphId: props.graphId,
      name: props.name,
      namespace: props.namespace,
      sourceType: props.sourceType,
      graphType: props.graphType,
      graphSubType: props.graphSubType,
      config: this._safeJsonParse(props.config, {}),
      sqlConfig: this._safeJsonParse(props.sqlConfig, null),
      apiConfig: this._safeJsonParse(props.apiConfig, null),
      kbConfig: this._safeJsonParse(props.kbConfig, null),
      fileConfig: this._safeJsonParse(props.fileConfig, null),
      compositeConfig: this._safeJsonParse(props.compositeConfig, null),
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }

  _safeJsonParse(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value; // already parsed
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

module.exports = { DataSourceService };

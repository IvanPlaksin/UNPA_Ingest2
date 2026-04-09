/**
 * Domain Context Manager
 * Manages project domains (contexts) with namespace switching,
 * data source registration, and credential management.
 *
 * Domains are stored as DomainConfig nodes in the CORE namespace of the graph.
 * Credentials are stored exclusively in Redis via CredentialStore.
 *
 * @module services/domain/domain-service
 */

const { v4: uuidv4 } = require('uuid');

/**
 * @typedef {Object} DomainConfig
 * @property {string} domainId - Unique ID (e.g., "imis-legacy")
 * @property {string} displayName - Human-readable name
 * @property {string} graphNamespace - Graph namespace (e.g., "PROJECT:imis-legacy")
 * @property {string} graphContainerLabel - Label for graph containers (e.g., "Domain_Imis_Legacy")
 * @property {string} vectorCollection - Qdrant collection name
 * @property {string} description
 * @property {boolean} isActive
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} createdBy
 * @property {DataSourceConfig[]} [dataSources]
 */

/**
 * @typedef {Object} DataSourceConfig
 * @property {string} connectionName
 * @property {'MSSQL'|'ADO'|'TFS'|'SHAREPOINT'} sourceType
 * @property {string} connectionParams - JSON string of params (no credentials!)
 * @property {string|null} lastSyncAt
 * @property {'SUCCESS'|'FAILED'|'IN_PROGRESS'|'NEVER'} lastSyncStatus
 */

class DomainService {
  /**
   * @param {Object} memgraphService - Graph database service
   * @param {Object} qdrantService - Vector database service
   * @param {import('./credential.store').CredentialStore} credentialStore
   */
  constructor(memgraphService, qdrantService, credentialStore) {
    this.memgraph = memgraphService;
    this.qdrant = qdrantService;
    this.credentialStore = credentialStore;

    /** @type {DomainConfig|null} */
    this.currentDomain = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute Cypher query and convert neo4j Result records to plain objects.
   * executeQuery() returns a neo4j Result with .records (Record[]),
   * where each Record uses .get(key). This helper converts to [{key: value}...].
   * @private
   */
  async _query(cypher, params = {}) {
    const result = await this.memgraph.executeQuery(cypher, params);
    if (!result || !result.records) return [];
    return result.records.map(rec => {
      const obj = {};
      for (const key of rec.keys) {
        obj[key] = rec.get(key);
      }
      return obj;
    });
  }

  /**
   * Generate domainId from displayName
   * @private
   */
  _generateDomainId(displayName) {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Generate graphContainerLabel from domainId
   * "imis-legacy" → "Domain_Imis_Legacy"
   * @private
   */
  _generateContainerLabel(domainId) {
    return 'Domain_' + domainId
      .split('-')
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join('_');
  }

  /**
   * Ensure Qdrant collection exists
   * @private
   */
  async _ensureVectorCollection(collectionName) {
    try {
      const exists = await this.qdrant.collectionExists(collectionName);
      if (!exists) {
        await this.qdrant.createCollection(collectionName, {
          vectors: {
            size: 1024, // TEI multilingual-e5-large dimension
            distance: 'Cosine',
          }
        });
        console.log(`[DomainService] Created Qdrant collection: ${collectionName}`);
      }
    } catch (err) {
      console.warn(`[DomainService] Could not verify Qdrant collection: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DOMAIN OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Switch active domain context
   * @param {string} domainId
   * @returns {Promise<DomainConfig>}
   */
  async switchDomain(domainId) {
    // 1. Load domain from graph (CORE namespace)
    const result = await this._query(`
      MATCH (d:DomainConfig {domainId: $domainId, isActive: true})
      RETURN d
    `, { domainId });

    if (!result || result.length === 0) {
      throw new Error(`Domain not found or inactive: ${domainId}`);
    }

    const domain = result[0].d.properties || result[0].d;

    // 2. Load data sources for this domain
    const sourcesResult = await this._query(`
      MATCH (d:DomainConfig {domainId: $domainId})-[:HAS_DATA_SOURCE]->(ds:DataSourceConfig)
      RETURN ds
    `, { domainId });

    domain.dataSources = (sourcesResult || []).map(r => {
      const props = r.ds.properties || r.ds;
      return {
        ...props,
        connectionParams: typeof props.connectionParams === 'string'
          ? JSON.parse(props.connectionParams)
          : props.connectionParams,
      };
    });

    // 3. Ensure Qdrant collection exists
    await this._ensureVectorCollection(domain.vectorCollection);

    // 4. Set as current
    this.currentDomain = domain;

    console.log(`[DomainService] Switched to domain: ${domainId} (namespace: ${domain.graphNamespace})`);
    return domain;
  }

  /**
   * Get current graph namespace
   * @returns {string} e.g. "PROJECT:imis-legacy"
   * @throws {Error} if no domain is active
   */
  getCurrentNamespace() {
    if (!this.currentDomain) {
      throw new Error('No active domain. Call switchDomain() first.');
    }
    return this.currentDomain.graphNamespace;
  }

  /**
   * Get current domain config
   * @returns {DomainConfig|null}
   */
  getCurrentDomain() {
    return this.currentDomain;
  }

  /**
   * List all registered domains
   * @returns {Promise<DomainConfig[]>}
   */
  async listDomains() {
    const result = await this._query(`
      MATCH (d:DomainConfig)
      OPTIONAL MATCH (d)-[:HAS_DATA_SOURCE]->(ds:DataSourceConfig)
      RETURN d, collect(ds) as dataSources
      ORDER BY d.displayName
    `);

    const domains = [];
    for (const r of (result || [])) {
      const domain = r.d.properties || r.d;
      const dataSources = [];
      for (const ds of (r.dataSources || []).filter(d => d)) {
        const props = ds.properties || ds;
        let hasCredentials = false;
        try {
          hasCredentials = await this.credentialStore.exists(domain.domainId, props.connectionName);
        } catch (_) {}
        dataSources.push({
          ...props,
          connectionParams: typeof props.connectionParams === 'string'
            ? JSON.parse(props.connectionParams)
            : props.connectionParams,
          hasCredentials,
        });
      }
      domains.push({ ...domain, dataSources });
    }
    return domains;
  }

  /**
   * Create a new domain
   * @param {Object} input
   * @param {string} input.displayName - Human-readable name
   * @param {string} input.description - Domain description
   * @param {string} [input.createdBy='system']
   * @returns {Promise<DomainConfig>}
   */
  async createDomain({ displayName, description, createdBy = 'system' }) {
    const domainId = this._generateDomainId(displayName);

    // Check uniqueness
    const existing = await this._query(`
      MATCH (d:DomainConfig {domainId: $domainId})
      RETURN d LIMIT 1
    `, { domainId });

    if (existing && existing.length > 0) {
      throw new Error(`Domain already exists: ${domainId}`);
    }

    const now = new Date().toISOString();
    const domain = {
      domainId,
      displayName,
      description,
      graphNamespace: `PROJECT:${domainId}`,
      graphContainerLabel: this._generateContainerLabel(domainId),
      vectorCollection: `project_${domainId.replace(/-/g, '_')}`,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    // Create in graph (CORE namespace — system-level config)
    await this._query(`
      CREATE (d:DomainConfig:CoreKnowledge $props)
      RETURN d
    `, { props: domain });

    // Create Qdrant collection
    await this._ensureVectorCollection(domain.vectorCollection);

    console.log(`[DomainService] Created domain: ${domainId}`);
    return domain;
  }

  /**
   * Update domain properties
   * @param {string} domainId
   * @param {Object} updates - Fields to update (displayName, description, isActive)
   * @returns {Promise<DomainConfig>}
   */
  async updateDomain(domainId, updates) {
    const allowedFields = ['displayName', 'description', 'isActive'];
    const setClause = Object.keys(updates)
      .filter(k => allowedFields.includes(k))
      .map(k => `d.${k} = $${k}`)
      .join(', ');

    if (!setClause) {
      throw new Error('No valid fields to update');
    }

    const params = { domainId, ...updates, updatedAt: new Date().toISOString() };

    const result = await this._query(`
      MATCH (d:DomainConfig {domainId: $domainId})
      SET ${setClause}, d.updatedAt = $updatedAt
      RETURN d
    `, params);

    if (!result || result.length === 0) {
      throw new Error(`Domain not found: ${domainId}`);
    }

    return result[0].d.properties || result[0].d;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATA SOURCE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Add data source to a domain
   * @param {string} domainId
   * @param {Object} dataSource
   * @param {string} dataSource.connectionName - Unique name within domain
   * @param {'MSSQL'|'ADO'|'TFS'|'SHAREPOINT'} dataSource.sourceType
   * @param {Object} dataSource.connectionParams - Connection params WITHOUT credentials
   * @param {Object} [credentials] - Credentials to store in Redis (optional)
   */
  async addDataSource(domainId, dataSource, credentials = null) {
    const now = new Date().toISOString();
    const connParamsJson = JSON.stringify(dataSource.connectionParams);

    // Upsert: update if exists, create if not
    const existing = await this._query(`
      MATCH (d:DomainConfig {domainId: $domainId})-[:HAS_DATA_SOURCE]->(ds:DataSourceConfig {connectionName: $connectionName})
      RETURN ds
    `, { domainId, connectionName: dataSource.connectionName });

    if (existing && existing.length > 0) {
      // UPDATE existing data source
      await this._query(`
        MATCH (d:DomainConfig {domainId: $domainId})-[:HAS_DATA_SOURCE]->(ds:DataSourceConfig {connectionName: $connectionName})
        SET ds.connectionParams = $connectionParams,
            ds.sourceType = $sourceType,
            ds.updatedAt = $now
        RETURN ds
      `, {
        domainId,
        connectionName: dataSource.connectionName,
        connectionParams: connParamsJson,
        sourceType: dataSource.sourceType,
        now,
      });
      console.log(`[DomainService] Updated data source '${dataSource.connectionName}' in domain '${domainId}'`);
    } else {
      // CREATE new data source
      const dsConfig = {
        connectionName: dataSource.connectionName,
        sourceType: dataSource.sourceType,
        connectionParams: connParamsJson,
        lastSyncAt: null,
        lastSyncStatus: 'NEVER',
        createdAt: now,
      };

      await this._query(`
        MATCH (d:DomainConfig {domainId: $domainId})
        CREATE (ds:DataSourceConfig:CoreKnowledge $props)
        CREATE (d)-[:HAS_DATA_SOURCE]->(ds)
        RETURN ds
      `, { domainId, props: dsConfig });
      console.log(`[DomainService] Added data source '${dataSource.connectionName}' to domain '${domainId}'`);
    }

    // Store/update credentials in Redis (NEVER in graph!)
    if (credentials) {
      await this.credentialStore.store(domainId, dataSource.connectionName, credentials);
    }
  }

  /**
   * Remove data source from a domain
   * @param {string} domainId
   * @param {string} connectionName
   */
  async removeDataSource(domainId, connectionName) {
    await this._query(`
      MATCH (d:DomainConfig {domainId: $domainId})-[:HAS_DATA_SOURCE]->(ds:DataSourceConfig {connectionName: $connectionName})
      DETACH DELETE ds
    `, { domainId, connectionName });

    // Remove credentials from Redis
    await this.credentialStore.delete(domainId, connectionName);

    console.log(`[DomainService] Removed data source '${connectionName}' from domain '${domainId}'`);
  }

  /**
   * Update data source sync status
   * @param {string} domainId
   * @param {string} connectionName
   * @param {'SUCCESS'|'FAILED'|'IN_PROGRESS'} status
   */
  async updateSyncStatus(domainId, connectionName, status) {
    const now = new Date().toISOString();

    await this._query(`
      MATCH (d:DomainConfig {domainId: $domainId})-[:HAS_DATA_SOURCE]->(ds:DataSourceConfig {connectionName: $connectionName})
      SET ds.lastSyncStatus = $status,
          ds.lastSyncAt = $now
    `, { domainId, connectionName, status, now });
  }

  /**
   * Get a specific data source config WITH decrypted credentials
   * Used when establishing a connection
   * @param {string} connectionName
   * @returns {Promise<{ config: DataSourceConfig, credentials: Object|null }>}
   */
  async getDataSourceWithCredentials(connectionName) {
    if (!this.currentDomain) {
      throw new Error('No active domain');
    }

    const ds = (this.currentDomain.dataSources || []).find(
      s => s.connectionName === connectionName
    );

    if (!ds) {
      throw new Error(`Data source not found: ${connectionName}`);
    }

    const credentials = await this.credentialStore.get(
      this.currentDomain.domainId,
      connectionName
    );

    return {
      config: {
        ...ds,
        connectionParams: typeof ds.connectionParams === 'string'
          ? JSON.parse(ds.connectionParams)
          : ds.connectionParams,
      },
      credentials,
    };
  }
}

module.exports = { DomainService };

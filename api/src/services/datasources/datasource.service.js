/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA SOURCE SERVICE
 * CRUD + runtime resolve for DataSourceDefinitions in KB.
 * Namespace-aware with Redis caching.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { randomUUID } = require('node:crypto');
const { StaticListResolver } = require('./resolvers/static-list.resolver');
const { MemgraphQueryResolver } = require('./resolvers/memgraph-query.resolver');
const { RestApiResolver } = require('./resolvers/rest-api.resolver');
const { SqlQueryResolver } = require('./resolvers/sql-query.resolver');
const { ComputedResolver } = require('./resolvers/computed.resolver');

class DataSourceService {
  constructor(services = {}) {
    this.memgraph = services.memgraphService;
    this.redis = services.redisClient || null;
    this.namespace = services.namespace || 'CORE';

    this.resolvers = {
      STATIC_LIST: new StaticListResolver(services),
      MEMGRAPH_QUERY: new MemgraphQueryResolver(services),
      REST_API: new RestApiResolver(services),
      SQL_QUERY: new SqlQueryResolver(services),
      COMPUTED: new ComputedResolver(services),
    };
  }

  // ── CREATE ──
  async create(data) {
    const resolver = this.resolvers[data.type];
    if (!resolver) throw new Error(`Unknown data source type: ${data.type}`);

    const validation = resolver.validate(data.config || {});
    if (!validation.valid) throw new Error(`Invalid config: ${validation.errors.join(', ')}`);

    const id = data.id || randomUUID();
    await this.memgraph.executeQuery(`
      CREATE (ds:DataSourceDefinition {
        id: $id, name: $name, type: $type,
        config: $config, cacheTTL: $cacheTTL,
        allowedNamespaces: $allowedNamespaces,
        namespace: $namespace, status: 'ACTIVE',
        createdAt: datetime(), updatedAt: datetime()
      })
    `, {
      id,
      name: data.name,
      type: data.type,
      config: JSON.stringify(data.config || {}),
      cacheTTL: data.cacheTTL ?? 300,
      allowedNamespaces: JSON.stringify(data.allowedNamespaces || [this.namespace]),
      namespace: data.namespace || this.namespace,
    });

    return this.getById(id);
  }

  // ── READ ──
  async getById(id) {
    const result = await this.memgraph.executeQuery(`
      MATCH (ds:DataSourceDefinition {id: $id})
      WHERE ds.status <> 'DELETED'
      RETURN ds
    `, { id });
    if (!result.records || result.records.length === 0) return null;
    return this._transform(result.records[0].get('ds'));
  }

  async list(options = {}) {
    const neo4j = require('neo4j-driver');
    const { type, namespace, status = 'ACTIVE', limit = 50, offset = 0 } = options;
    let cypher = `MATCH (ds:DataSourceDefinition) WHERE ds.status = $status`;
    const params = { status, limit: neo4j.int(limit), offset: neo4j.int(offset) };

    if (type) { cypher += ` AND ds.type = $type`; params.type = type; }
    if (namespace) { cypher += ` AND ds.allowedNamespaces CONTAINS $namespace`; params.namespace = namespace; }

    cypher += ` RETURN ds ORDER BY ds.name SKIP $offset LIMIT $limit`;
    const result = await this.memgraph.executeQuery(cypher, params);
    return (result.records || []).map(r => this._transform(r.get('ds')));
  }

  // ── UPDATE ──
  async update(id, updates) {
    const allowed = ['name', 'config', 'cacheTTL', 'allowedNamespaces', 'status'];
    const sets = [];
    const params = { id };

    for (const key of Object.keys(updates).filter(k => allowed.includes(k))) {
      const val = ['config', 'allowedNamespaces'].includes(key) ? JSON.stringify(updates[key]) : updates[key];
      sets.push(`ds.${key} = $${key}`);
      params[key] = val;
    }

    if (sets.length === 0) return this.getById(id);

    await this.memgraph.executeQuery(`
      MATCH (ds:DataSourceDefinition {id: $id})
      SET ${sets.join(', ')}, ds.updatedAt = datetime()
    `, params);

    return this.getById(id);
  }

  // ── DELETE ──
  async delete(id) {
    await this.memgraph.executeQuery(`
      MATCH (ds:DataSourceDefinition {id: $id})
      SET ds.status = 'DELETED', ds.deletedAt = datetime()
    `, { id });
    return { deleted: true, id };
  }

  // ── RESOLVE (runtime) ──
  async resolve(id, context = {}) {
    const ds = await this.getById(id);
    if (!ds) throw new Error(`DataSource not found: ${id}`);

    if (context.namespace && !ds.allowedNamespaces.includes(context.namespace)) {
      throw new Error(`DataSource ${id} not accessible from namespace ${context.namespace}`);
    }

    const resolver = this.resolvers[ds.type];
    if (!resolver) throw new Error(`No resolver for type: ${ds.type}`);

    // Cache check
    const cacheKey = resolver.getCacheKey(ds.config, context);
    if (cacheKey && this.redis && ds.cacheTTL > 0) {
      try {
        const cached = await this.redis.get(`ds:${cacheKey}`);
        if (cached) return { ...JSON.parse(cached), cached: true };
      } catch { /* cache miss */ }
    }

    const result = await resolver.resolve(ds.config, context);

    // Cache store
    if (cacheKey && this.redis && ds.cacheTTL > 0) {
      try {
        await this.redis.set(`ds:${cacheKey}`, JSON.stringify(result));
        await this.redis.expire(`ds:${cacheKey}`, ds.cacheTTL);
      } catch { /* non-critical */ }
    }

    return { ...result, dataSourceId: id, dataSourceType: ds.type };
  }

  // ── VALIDATE ──
  validateConfig(type, config) {
    const resolver = this.resolvers[type];
    if (!resolver) return { valid: false, errors: [`Unknown type: ${type}`] };
    return resolver.validate(config);
  }

  // ── INTERNAL ──
  _transform(node) {
    if (!node) return null;
    const p = node.properties;
    return {
      id: p.id, name: p.name, type: p.type,
      config: this._parseJSON(p.config, {}),
      cacheTTL: typeof p.cacheTTL === 'number' ? p.cacheTTL : (p.cacheTTL?.toNumber?.() ?? 300),
      allowedNamespaces: this._parseJSON(p.allowedNamespaces, []),
      namespace: p.namespace, status: p.status,
    };
  }

  _parseJSON(str, fallback) {
    if (!str) return fallback;
    if (typeof str !== 'string') return str;
    try { return JSON.parse(str); } catch { return fallback; }
  }
}

module.exports = { DataSourceService };

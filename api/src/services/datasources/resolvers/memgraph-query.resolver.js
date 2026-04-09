/**
 * Resolves data via Cypher query to Memgraph.
 */
const { BaseResolver } = require('./base.resolver');

class MemgraphQueryResolver extends BaseResolver {
  async resolve(config, context) {
    const memgraph = this.services.memgraphService;
    if (!memgraph) throw new Error('MemgraphService not available');

    const params = { ...config.parameters };
    if (config.dynamicParams) {
      for (const [key, path] of Object.entries(config.dynamicParams)) {
        params[key] = this._resolvePath(context, path);
      }
    }

    const result = await memgraph.executeQuery(config.cypher, params);
    const vf = config.valueField || 'value';
    const lf = config.labelField || 'label';

    const items = (result.records || []).map(r => {
      const row = {};
      r.keys.forEach(k => { row[k] = r.get(k); });
      return {
        value: row[vf] ?? row.value ?? row.id,
        label: row[lf] ?? row.label ?? row.name ?? String(row[vf]),
        ...row,
      };
    });

    return { items };
  }

  validate(config) {
    const errors = [];
    if (!config.cypher) errors.push('cypher query is required');
    return { valid: errors.length === 0, errors };
  }

  getCacheKey(config, context) {
    const params = { ...config.parameters };
    if (config.dynamicParams) {
      for (const [key, path] of Object.entries(config.dynamicParams)) {
        params[key] = this._resolvePath(context, path);
      }
    }
    return `memgraph:${config.cypher}:${JSON.stringify(params)}`;
  }
}

module.exports = { MemgraphQueryResolver };

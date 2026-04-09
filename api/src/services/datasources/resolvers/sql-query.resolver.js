/**
 * Resolves data via SQL query.
 */
const { BaseResolver } = require('./base.resolver');

class SqlQueryResolver extends BaseResolver {
  async resolve(config, context) {
    const sqlService = this.services.sqlService;
    if (!sqlService) throw new Error('SqlService not available');

    const params = { ...config.parameters };
    if (config.dynamicParams) {
      for (const [key, path] of Object.entries(config.dynamicParams)) {
        params[key] = this._resolvePath(context, path);
      }
    }

    const results = await sqlService.query(config.query, params, config.connection || 'default');
    const vf = config.valueField || 'value';
    const lf = config.labelField || 'label';

    return {
      items: results.map(row => ({
        value: row[vf] ?? row.value ?? row.id,
        label: row[lf] ?? row.label ?? row.name ?? String(row[vf]),
        ...row,
      })),
    };
  }

  validate(config) {
    const errors = [];
    if (!config.query) errors.push('SQL query is required');
    if (config.query && /;\s*(DROP|DELETE|UPDATE|INSERT|ALTER|CREATE)/i.test(config.query)) {
      errors.push('Query contains potentially dangerous statements');
    }
    return { valid: errors.length === 0, errors };
  }

  getCacheKey(config, context) {
    const params = { ...config.parameters };
    if (config.dynamicParams) {
      for (const [key, path] of Object.entries(config.dynamicParams)) {
        params[key] = this._resolvePath(context, path);
      }
    }
    return `sql:${config.connection || 'default'}:${config.query}:${JSON.stringify(params)}`;
  }
}

module.exports = { SqlQueryResolver };

/**
 * Abstract base for data source resolvers.
 */
class BaseResolver {
  constructor(services = {}) {
    this.services = services;
  }

  async resolve(config, context) {
    throw new Error('resolve() must be implemented');
  }

  validate(config) {
    return { valid: true, errors: [] };
  }

  getCacheKey(config, context) {
    return null;
  }

  _resolvePath(obj, path) {
    if (!path) return undefined;
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }
    return value;
  }
}

module.exports = { BaseResolver };

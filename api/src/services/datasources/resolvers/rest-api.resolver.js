/**
 * Resolves data via external REST API.
 */
const { BaseResolver } = require('./base.resolver');

class RestApiResolver extends BaseResolver {
  async resolve(config, context) {
    const { url, method = 'GET', headers = {}, queryParams = {}, responsePath, timeout = 5000 } = config;

    const urlObj = new URL(this._interpolate(url, context));
    for (const [key, value] of Object.entries(queryParams)) {
      urlObj.searchParams.set(key, this._interpolate(String(value), context));
    }

    const resolvedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      resolvedHeaders[key] = this._interpolate(String(value), context);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(urlObj.toString(), {
        method: method.toUpperCase(),
        headers: resolvedHeaders,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const data = await response.json();
      let items = responsePath ? this._resolvePath(data, responsePath) : data;
      if (!Array.isArray(items)) items = [items];

      const vf = config.valueField || 'value';
      const lf = config.labelField || 'label';

      return {
        items: items.map(item => ({
          value: item[vf] ?? item.value ?? item.id,
          label: item[lf] ?? item.label ?? item.name ?? String(item[vf]),
          ...item,
        })),
      };
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') throw new Error(`REST API timeout after ${timeout}ms`);
      throw error;
    }
  }

  _interpolate(template, context) {
    return template.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const value = this._resolvePath(context, path);
      return value !== undefined ? String(value) : match;
    });
  }

  validate(config) {
    const errors = [];
    if (!config.url) errors.push('url is required');
    return { valid: errors.length === 0, errors };
  }

  getCacheKey(config, context) {
    return `rest:${config.method || 'GET'}:${this._interpolate(config.url, context)}`;
  }
}

module.exports = { RestApiResolver };

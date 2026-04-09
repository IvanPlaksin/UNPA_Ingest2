/**
 * =============================================================================
 * API DATASOURCE EXECUTOR
 *
 * Executor for loading data from external REST APIs.
 * Supports: GET/POST, auth (bearer/apiKey/basic), response path extraction.
 * =============================================================================
 */

const { BaseDataSourceExecutor } = require('./base-datasource.executor');

class APIDataSourceExecutor extends BaseDataSourceExecutor {
  constructor(options = {}) {
    super(options);
    this.httpClient = options.httpClient || null; // fetch-like function
    this.authService = options.authService || null;
  }

  setHttpClient(client) { this.httpClient = client; return this; }
  setAuthService(authService) { this.authService = authService; return this; }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  async loadAll(config, params = {}) {
    this.validateConfig(config);

    return this.withCache(config, 'loadAll', params, async () => {
      const { limit, offset } = this.applyLimits(params, config);
      const apiConfig = config.apiConfig || {};

      const url = this._buildUrl(apiConfig, {
        ...params.filters,
        limit, offset,
      });

      const response = await this._fetch(url, apiConfig);
      const data = await this._parseResponse(response);

      const items = this.transformOutput(
        this._extractItems(data, apiConfig),
        config,
      );
      const total = this._extractTotal(data, apiConfig) || items.length;

      return { items, total };
    });
  }

  async search(config, params = {}) {
    this.validateConfig(config);

    const { query: searchText, limit = 10 } = params;
    if (!searchText || searchText.length < 1) return { items: [], total: 0 };

    const apiConfig = config.apiConfig || {};
    const searchParam = apiConfig.searchParam || 'q';

    const url = this._buildUrl(apiConfig, {
      ...params.filters,
      [searchParam]: searchText,
      limit: Math.min(limit, config.config?.maxLimit || 100),
    });

    const response = await this._fetch(url, apiConfig);
    const data = await this._parseResponse(response);

    const items = this.transformOutput(
      this._extractItems(data, apiConfig),
      config,
    );

    return { items, total: items.length };
  }

  async getById(config, params = {}) {
    this.validateConfig(config);

    const { id } = params;
    if (!id) throw new Error('id is required for getById');

    const apiConfig = config.apiConfig || {};
    let endpoint = apiConfig.endpoint;
    if (!endpoint.endsWith('/')) endpoint += '/';
    endpoint += encodeURIComponent(id);

    const url = this._buildUrl({ ...apiConfig, endpoint }, {});

    try {
      const response = await this._fetch(url, apiConfig);
      if (response.status === 404) return null;

      const data = await this._parseResponse(response);
      const items = this.transformOutput([data], config);
      return items[0];
    } catch (err) {
      if (err.status === 404 || err.message?.includes('404')) return null;
      throw err;
    }
  }

  async count(config, params = {}) {
    this.validateConfig(config);
    // Do a loadAll with limit=1 and extract total
    const result = await this.loadAll(config, { ...params, limit: 1 });
    return result.total;
  }

  async validate(config, params = {}) {
    this.validateConfig(config);
    if (params.value === undefined) throw new Error('value is required for validate');

    const result = await this.getById(config, { id: params.value });
    return result !== null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  async _fetch(url, apiConfig) {
    const fetchFn = this.httpClient || (typeof fetch !== 'undefined' ? fetch : null);
    if (!fetchFn) throw new Error('HTTP client not configured');

    const headers = { ...apiConfig.headers };

    // Apply authentication
    if (apiConfig.authType && apiConfig.authType !== 'none') {
      const authHeader = await this._getAuthHeader(apiConfig);
      if (authHeader) Object.assign(headers, authHeader);
    }

    const options = {
      method: apiConfig.method || 'GET',
      headers,
    };

    if (apiConfig.bodyTemplate && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
      options.body = JSON.stringify(apiConfig.bodyTemplate);
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetchFn(url, options);

    if (!response.ok && response.status !== 404) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async _getAuthHeader(apiConfig) {
    const { authType, authConfigId } = apiConfig;

    if (authType === 'bearer' && this.authService && authConfigId) {
      const token = await this.authService.getToken(authConfigId);
      return { Authorization: `Bearer ${token}` };
    }

    if (authType === 'apiKey' && this.authService && authConfigId) {
      const { headerName, apiKey } = await this.authService.getApiKey(authConfigId);
      return { [headerName]: apiKey };
    }

    if (authType === 'basic' && this.authService && authConfigId) {
      const { username, password } = await this.authService.getBasicAuth(authConfigId);
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }

    return null;
  }

  _buildUrl(apiConfig, queryParams) {
    let url = apiConfig.endpoint;
    if (!url) throw new Error('API endpoint is required');

    const allParams = { ...apiConfig.queryParams, ...queryParams };

    const queryEntries = Object.entries(allParams)
      .filter(([, v]) => v !== undefined && v !== null);

    if (queryEntries.length > 0) {
      const queryString = queryEntries
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      url += (url.includes('?') ? '&' : '?') + queryString;
    }

    return url;
  }

  async _parseResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { data: text };
    }
  }

  _extractItems(data, apiConfig) {
    const path = apiConfig.responsePath || 'data';
    return this._getNestedValue(data, path) || [];
  }

  _extractTotal(data, apiConfig) {
    const path = apiConfig.totalPath || 'total';
    return this._getNestedValue(data, path);
  }
}

module.exports = { APIDataSourceExecutor };

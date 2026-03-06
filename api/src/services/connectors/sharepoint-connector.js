/**
 * SharePoint Connector
 * Connector for SharePoint Online/On-premises
 *
 * Features:
 *   - OAuth2 client_credentials auth
 *   - Document library listing
 *   - File fetch
 *   - Search
 *   - Mock mode when credentials not configured
 *
 * @module services/connectors/sharepoint-connector
 */

const { BaseConnector } = require('./base-connector');

class SharePointConnector extends BaseConnector {
  constructor(options = {}) {
    super('sharepoint', { type: 'sharepoint', ...options });

    this.siteUrl = options.siteUrl || process.env.SHAREPOINT_SITE_URL;
    this.clientId = options.clientId || process.env.SHAREPOINT_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.SHAREPOINT_CLIENT_SECRET;
    this.tenantId = options.tenantId || process.env.SHAREPOINT_TENANT_ID;

    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  async connect() {
    this._updateStats('connect');

    if (!this.siteUrl) {
      throw new Error('SharePoint site URL is required');
    }

    try {
      await this._authenticate();
      this.connected = true;
      this._updateStats('connect_success');
      this.emit('connected');

      return { success: true, siteUrl: this.siteUrl };
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  async disconnect() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.connected = false;
    this.emit('disconnected');
  }

  async _authenticate() {
    if (!this.clientId || !this.clientSecret || !this.tenantId) {
      console.warn('[SharePointConnector] Credentials not configured, running in mock mode');
      this.accessToken = 'mock-token';
      return;
    }

    const tokenUrl = `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        scope: `${this.siteUrl}/.default`
      })
    });

    if (!response.ok) {
      throw new Error('SharePoint authentication failed');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000);
  }

  async _ensureToken() {
    if (!this.accessToken || (this.tokenExpiry && Date.now() >= this.tokenExpiry - 60000)) {
      await this._authenticate();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATA ACCESS
  // ═══════════════════════════════════════════════════════════════════════

  async listLibraries() {
    const response = await this._apiRequest('/_api/web/lists?$filter=BaseTemplate eq 101');

    return {
      libraries: response.d?.results?.map(lib => ({
        id: lib.Id,
        title: lib.Title,
        description: lib.Description,
        itemCount: lib.ItemCount,
        created: lib.Created,
        url: lib.RootFolder?.ServerRelativeUrl
      })) || []
    };
  }

  async list(libraryTitle, options = {}) {
    const folderPath = options.folderPath || '';
    const endpoint = folderPath
      ? `/_api/web/GetFolderByServerRelativeUrl('${encodeURIComponent(folderPath)}')/Files`
      : `/_api/web/lists/getbytitle('${encodeURIComponent(libraryTitle)}')/items`;

    const response = await this._apiRequest(endpoint);

    const items = response.d?.results?.map(item => ({
      id: item.Id || item.UniqueId,
      name: item.Name || item.FileLeafRef,
      type: item.FileSystemObjectType === 0 ? 'file' : 'folder',
      path: item.ServerRelativeUrl || item.FileRef,
      size: item.Length,
      modified: item.TimeLastModified || item.Modified,
      author: item.Author?.Title
    })) || [];

    return {
      library: libraryTitle,
      folderPath,
      items,
      count: items.length
    };
  }

  async fetch(filePath, options = {}) {
    this._updateStats('fetch');

    const metaResponse = await this._apiRequest(
      `/_api/web/GetFileByServerRelativeUrl('${encodeURIComponent(filePath)}')`
    );

    const contentResponse = await this._apiRequest(
      `/_api/web/GetFileByServerRelativeUrl('${encodeURIComponent(filePath)}')/$value`,
      { rawResponse: true }
    );

    return {
      path: filePath,
      name: metaResponse.d?.Name,
      size: metaResponse.d?.Length,
      modified: metaResponse.d?.TimeLastModified,
      content: contentResponse
    };
  }

  async search(query, options = {}) {
    const response = await this._apiRequest(
      `/_api/search/query?querytext='${encodeURIComponent(query)}'&rowlimit=${options.limit || 50}`
    );

    const rows = response.d?.query?.PrimaryQueryResult?.RelevantResults?.Table?.Rows?.results || [];

    return {
      query,
      results: rows.map(row => {
        const cells = row.Cells?.results || [];
        const getValue = (key) => cells.find(c => c.Key === key)?.Value;

        return {
          title: getValue('Title'),
          path: getValue('Path'),
          author: getValue('Author'),
          lastModified: getValue('LastModifiedTime'),
          size: getValue('Size'),
          fileType: getValue('FileType')
        };
      }),
      count: rows.length
    };
  }

  async listSites() {
    const response = await this._apiRequest('/_api/web/webs');

    return {
      sites: response.d?.results?.map(site => ({
        id: site.Id,
        title: site.Title,
        url: site.Url,
        description: site.Description,
        created: site.Created
      })) || []
    };
  }

  async listItems(listTitle, options = {}) {
    let endpoint = `/_api/web/lists/getbytitle('${encodeURIComponent(listTitle)}')/items`;

    const params = [];
    if (options.select) params.push(`$select=${options.select}`);
    if (options.filter) params.push(`$filter=${encodeURIComponent(options.filter)}`);
    if (options.top) params.push(`$top=${options.top}`);
    if (options.orderby) params.push(`$orderby=${options.orderby}`);

    if (params.length > 0) {
      endpoint += '?' + params.join('&');
    }

    const response = await this._apiRequest(endpoint);

    return {
      list: listTitle,
      items: response.d?.results || [],
      count: response.d?.results?.length || 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HTTP
  // ═══════════════════════════════════════════════════════════════════════

  async _apiRequest(endpoint, options = {}) {
    await this._ensureToken();

    const url = `${this.siteUrl}${endpoint}`;

    const headers = {
      'Accept': 'application/json;odata=verbose',
      'Content-Type': 'application/json;odata=verbose'
    };

    if (this.accessToken && this.accessToken !== 'mock-token') {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      this._updateStats('error');
      throw new Error(`SharePoint API error: ${response.status} ${response.statusText}`);
    }

    if (options.rawResponse) {
      return await response.text();
    }

    return await response.json();
  }
}

const sharePointConnector = new SharePointConnector();

module.exports = {
  SharePointConnector,
  sharePointConnector
};

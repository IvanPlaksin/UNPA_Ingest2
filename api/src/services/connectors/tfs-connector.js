/**
 * TFS/Azure DevOps Connector
 * Connector for Team Foundation Server and Azure DevOps
 *
 * Features:
 *   - Repository listing and file access
 *   - Work item queries (WIQL)
 *   - Changeset listing (TFVC)
 *   - Code search
 *   - PAT authentication
 *
 * @module services/connectors/tfs-connector
 */

const { BaseConnector } = require('./base-connector');

class TFSConnector extends BaseConnector {
  constructor(options = {}) {
    super('tfs', { type: 'tfs', ...options });

    this.serverUrl = options.serverUrl || process.env.TFS_SERVER_URL;
    this.collection = options.collection || process.env.TFS_COLLECTION || 'DefaultCollection';
    this.project = options.project || process.env.TFS_PROJECT;
    this.pat = options.pat || process.env.TFS_PAT;
    this.apiVersion = options.apiVersion || '6.0';

    this.baseUrl = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  async connect() {
    this._updateStats('connect');

    if (!this.serverUrl) {
      throw new Error('TFS server URL is required');
    }

    this.baseUrl = `${this.serverUrl}/${this.collection}`;
    if (this.project) {
      this.baseUrl += `/${this.project}`;
    }

    try {
      await this._apiRequest('/_apis/projects', { method: 'GET' });
      this.connected = true;
      this._updateStats('connect_success');
      this.emit('connected');

      return { success: true, serverUrl: this.serverUrl, project: this.project };
    } catch (error) {
      this.lastError = error;
      throw error;
    }
  }

  async disconnect() {
    this.connected = false;
    this.emit('disconnected');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // REPOSITORIES
  // ═══════════════════════════════════════════════════════════════════════

  async listRepositories() {
    const response = await this._apiRequest('/_apis/git/repositories');

    return {
      repositories: response.value?.map(repo => ({
        id: repo.id,
        name: repo.name,
        url: repo.webUrl,
        defaultBranch: repo.defaultBranch,
        project: repo.project?.name
      })) || []
    };
  }

  async list(repoId, options = {}) {
    const repoPath = options.path || '/';
    const branch = options.branch || 'main';

    const response = await this._apiRequest(
      `/_apis/git/repositories/${repoId}/items`,
      {
        params: {
          scopePath: repoPath,
          recursionLevel: options.recursive ? 'Full' : 'OneLevel',
          'versionDescriptor.version': branch,
          'versionDescriptor.versionType': 'branch'
        }
      }
    );

    return {
      repoId,
      path: repoPath,
      items: response.value?.map(item => ({
        path: item.path,
        type: item.isFolder ? 'folder' : 'file',
        url: item.url,
        commitId: item.commitId
      })) || []
    };
  }

  async fetch(repoId, filePath, options = {}) {
    const branch = options.branch || 'main';

    this._updateStats('fetch');

    const response = await this._apiRequest(
      `/_apis/git/repositories/${repoId}/items`,
      {
        params: {
          path: filePath,
          'versionDescriptor.version': branch,
          'versionDescriptor.versionType': 'branch',
          includeContent: true
        },
        rawResponse: true
      }
    );

    return {
      repoId,
      path: filePath,
      branch,
      content: response
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // WORK ITEMS
  // ═══════════════════════════════════════════════════════════════════════

  async listWorkItems(options = {}) {
    const wiql = options.query || `SELECT [System.Id], [System.Title], [System.State]
                                   FROM WorkItems
                                   WHERE [System.TeamProject] = @project
                                   ORDER BY [System.ChangedDate] DESC`;

    const response = await this._apiRequest(
      '/_apis/wit/wiql',
      { method: 'POST', body: { query: wiql } }
    );

    if (response.workItems?.length > 0) {
      const ids = response.workItems.slice(0, options.limit || 100).map(wi => wi.id);
      const details = await this._apiRequest(
        '/_apis/wit/workitems',
        { params: { ids: ids.join(','), '$expand': 'relations' } }
      );

      return {
        workItems: details.value?.map(wi => ({
          id: wi.id,
          type: wi.fields['System.WorkItemType'],
          title: wi.fields['System.Title'],
          state: wi.fields['System.State'],
          assignedTo: wi.fields['System.AssignedTo']?.displayName,
          createdDate: wi.fields['System.CreatedDate'],
          changedDate: wi.fields['System.ChangedDate'],
          description: wi.fields['System.Description']
        })) || []
      };
    }

    return { workItems: [] };
  }

  async fetchWorkItem(id) {
    this._updateStats('fetch');

    const response = await this._apiRequest(
      `/_apis/wit/workitems/${id}`,
      { params: { '$expand': 'all' } }
    );

    return {
      id: response.id,
      rev: response.rev,
      type: response.fields['System.WorkItemType'],
      title: response.fields['System.Title'],
      state: response.fields['System.State'],
      reason: response.fields['System.Reason'],
      assignedTo: response.fields['System.AssignedTo']?.displayName,
      createdBy: response.fields['System.CreatedBy']?.displayName,
      createdDate: response.fields['System.CreatedDate'],
      changedDate: response.fields['System.ChangedDate'],
      description: response.fields['System.Description'],
      reproSteps: response.fields['Microsoft.VSTS.TCM.ReproSteps'],
      acceptanceCriteria: response.fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
      relations: response.relations?.map(r => ({
        type: r.rel,
        url: r.url,
        attributes: r.attributes
      }))
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TFVC CHANGESETS
  // ═══════════════════════════════════════════════════════════════════════

  async listChangesets(options = {}) {
    const params = { '$top': options.limit || 100 };
    if (options.path) {
      params['searchCriteria.itemPath'] = options.path;
    }

    const response = await this._apiRequest('/_apis/tfvc/changesets', { params });

    return {
      changesets: response.value?.map(cs => ({
        id: cs.changesetId,
        author: cs.author?.displayName,
        createdDate: cs.createdDate,
        comment: cs.comment
      })) || []
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SEARCH
  // ═══════════════════════════════════════════════════════════════════════

  async search(query, options = {}) {
    const response = await this._apiRequest(
      '/_apis/search/codesearchresults',
      {
        method: 'POST',
        body: {
          searchText: query,
          '$top': options.limit || 50,
          filters: {
            Project: this.project ? [this.project] : undefined
          }
        }
      }
    );

    return {
      query,
      results: response.results?.map(r => ({
        path: r.path,
        filename: r.fileName,
        repository: r.repository?.name,
        matches: r.matches
      })) || [],
      count: response.count || 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HTTP
  // ═══════════════════════════════════════════════════════════════════════

  async _apiRequest(endpoint, options = {}) {
    const url = new URL(endpoint, this.baseUrl);

    url.searchParams.set('api-version', this.apiVersion);

    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, typeof value === 'object' ? JSON.stringify(value) : value);
        }
      }
    }

    const headers = { 'Content-Type': 'application/json' };

    if (this.pat) {
      headers['Authorization'] = `Basic ${Buffer.from(':' + this.pat).toString('base64')}`;
    }

    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    if (!response.ok) {
      this._updateStats('error');
      throw new Error(`TFS API error: ${response.status} ${response.statusText}`);
    }

    if (options.rawResponse) {
      return await response.text();
    }

    return await response.json();
  }
}

const tfsConnector = new TFSConnector();

module.exports = {
  TFSConnector,
  tfsConnector
};

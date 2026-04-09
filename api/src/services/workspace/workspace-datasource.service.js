/**
 * WorkSpace ↔ DataSource Catalog Bridge
 *
 * Consolidates two previously disjoint systems:
 *
 *   1. **Workspace SourceReferences** — documents and database/API references
 *      uploaded into a workspace via `POST /workspaces/:id/sources`. Stored as
 *      `:SourceReference` nodes attached to the workspace.
 *
 *   2. **v2 DataSource catalog** — first-class typed data sources used by the
 *      Form Builder (Structural Editor). Stored as `:GraphDefinition:DataSource`
 *      nodes with `sourceType ∈ {SQL, API, KB, FILE, COMPOSITE}` and rich
 *      executor configs. Owned by `services/datasource.service.js`.
 *
 * Before this bridge, a workspace's DATABASE/API source was just a metadata
 * blob and could not be reused by the Form Builder. The Form Builder, in
 * turn, could only see the global catalog and had no way to filter by
 * workspace ownership.
 *
 * This service exposes:
 *   - `listForWorkspace(wsId, opts)` — workspace-scoped catalog view (the
 *     workspace's own datasources + globally-shared ones)
 *   - `registerSourceAsDataSource(wsId, sourceId)` — promote a workspace
 *     SourceReference into a v2 DataSource and link them with a stable
 *     `dataSourceGraphId` property on the source
 *   - `unregisterSourceDataSource(wsId, sourceId)` — drop the v2 record
 *     when its source is deleted
 *
 * The two systems remain physically separate (different node labels, different
 * services) but become conceptually unified: a workspace user sees one catalog
 * that contains both flavours.
 *
 * @module services/workspace/workspace-datasource.service
 */

'use strict';

const LOG_PREFIX = '[WorkspaceDataSource]';

// Source types that should be auto-promoted into the v2 catalog
const PROMOTABLE_SOURCE_TYPES = new Set(['DATABASE', 'API']);

// Globally-shared namespaces always visible to every workspace's catalog view
const GLOBAL_NAMESPACES = ['CORE', 'FLOWDESK', 'COMMON', 'PROJECT'];

/**
 * Map a v2 DataSource sourceType (SQL/API/KB/FILE/COMPOSITE) to the closest
 * workspace SourceReference sourceType. Used when creating a paired source.
 */
function mapV2TypeToWorkspaceSourceType(v2Type) {
  switch ((v2Type || '').toUpperCase()) {
    case 'SQL':       return 'DATABASE';
    case 'API':       return 'API';
    case 'KB':        return 'API';        // KB queries are HTTP-shaped
    case 'FILE':      return 'FILE';
    case 'COMPOSITE': return 'API';
    default:          return 'API';
  }
}

/**
 * Extract a primary URI/connection string from a v2 DataSource config so it
 * can be stored on the SourceReference for display purposes.
 */
function extractPrimaryUri(config) {
  const t = (config.sourceType || '').toUpperCase();
  if (t === 'SQL')       return config.sqlConfig?.connectionString || config.sqlConfig?.connectionId || '';
  if (t === 'API')       return config.apiConfig?.endpoint || config.apiConfig?.baseUrl || '';
  if (t === 'KB')        return config.kbConfig?.namespace || config.kbConfig?.collection || '';
  if (t === 'FILE')      return config.fileConfig?.filePath || '';
  if (t === 'COMPOSITE') return `composite:${(config.compositeConfig?.sources || []).length}`;
  return '';
}

let _memgraph = null;
let _wsService = null;
let _v2DataSourceServiceCtor = null;
let _v2DataSourceServiceInstance = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}
function ws() {
  if (!_wsService) _wsService = require('./workspace.service');
  return _wsService;
}
function v2() {
  if (!_v2DataSourceServiceInstance) {
    if (!_v2DataSourceServiceCtor) {
      const { DataSourceService } = require('../datasource.service');
      _v2DataSourceServiceCtor = DataSourceService;
    }
    _v2DataSourceServiceInstance = new _v2DataSourceServiceCtor(mg());
  }
  return _v2DataSourceServiceInstance;
}

class WorkspaceDataSourceService {

  /**
   * List datasources visible to a workspace.
   * Includes:
   *   - DataSources whose namespace == workspace.namespace (workspace-private)
   *   - DataSources whose namespace ∈ GLOBAL_NAMESPACES (shared library)
   *
   * @param {string} workspaceId
   * @param {Object} [options]
   * @param {string} [options.sourceType]   Filter by SQL|API|KB|FILE|COMPOSITE
   * @param {boolean} [options.includeGlobal=true]
   * @param {number} [options.limit=200]
   * @returns {Promise<Array>}
   */
  async listForWorkspace(workspaceId, options = {}) {
    const { sourceType = null, includeGlobal = true, limit = 200 } = options;

    const workspace = await ws().get(workspaceId);
    if (!workspace) throw new Error(`WorkSpace not found: ${workspaceId}`);

    const wsNamespace = workspace.namespace;
    const namespaces = [wsNamespace];
    if (includeGlobal) {
      for (const ns of GLOBAL_NAMESPACES) {
        if (!namespaces.includes(ns)) namespaces.push(ns);
      }
    }

    // Fetch all visible namespaces in parallel via the v2 service. Each list()
    // call hits Memgraph but the query is cheap and the result set is small.
    const all = [];
    for (const ns of namespaces) {
      try {
        const items = await v2().list(ns, { sourceType, limit });
        for (const item of (items || [])) {
          // Tag with origin so the UI can render scope clearly
          all.push({
            ...item,
            scope: ns === wsNamespace ? 'workspace' : 'global',
            workspaceId: ns === wsNamespace ? workspaceId : null
          });
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} list(${ns}) failed: ${err.message}`);
      }
    }

    // De-dupe by graphId in case the same datasource appears in multiple
    // queries (shouldn't happen but defensive).
    const seen = new Set();
    const deduped = [];
    for (const item of all) {
      if (item.graphId && seen.has(item.graphId)) continue;
      if (item.graphId) seen.add(item.graphId);
      deduped.push(item);
    }

    deduped.sort((a, b) => {
      // Workspace-owned items first, then by name
      if (a.scope !== b.scope) return a.scope === 'workspace' ? -1 : 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return deduped;
  }

  /**
   * Promote a workspace SourceReference into the v2 DataSource catalog.
   * Idempotent — if the source already has a `dataSourceGraphId` property,
   * the existing v2 record is returned unchanged.
   *
   * Only DATABASE and API source types are promotable.
   *
   * @param {string} workspaceId
   * @param {string} sourceId
   * @returns {Promise<{dataSourceGraphId, alreadyRegistered}>}
   */
  async registerSourceAsDataSource(workspaceId, sourceId) {
    const workspace = await ws().get(workspaceId);
    if (!workspace) throw new Error(`WorkSpace not found: ${workspaceId}`);

    // Read the source
    const rows = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s:SourceReference {id: $sourceId})
       RETURN s`,
      { wsId: workspaceId, sourceId }
    );
    if (rows.length === 0) throw new Error(`Source not found: ${sourceId}`);

    const sourceProps = rows[0].s?.properties || rows[0].s || {};
    const sourceType = sourceProps.sourceType;
    if (!PROMOTABLE_SOURCE_TYPES.has(sourceType)) {
      throw new Error(`Source type ${sourceType} is not promotable to DataSource catalog (only DATABASE, API)`);
    }

    // Already registered?
    if (sourceProps.dataSourceGraphId) {
      return { dataSourceGraphId: sourceProps.dataSourceGraphId, alreadyRegistered: true };
    }

    // Build a v2 DataSource config from the source metadata
    const dsType = sourceType === 'DATABASE' ? 'SQL' : 'API';
    const graphId = `ds_${sourceType.toLowerCase()}_${sourceId.slice(0, 8)}_${Date.now().toString(36)}`;

    const dataSourceConfig = {
      graphId,
      name: sourceProps.filename || sourceProps.name || sourceId,
      namespace: workspace.namespace,    // workspace-private
      sourceType: dsType,
      config: {
        // Store the original source metadata so the v2 record knows its origin
        originSourceId: sourceId,
        originWorkspaceId: workspaceId,
        originUri: sourceProps.uri || ''
      },
      ...(dsType === 'SQL'
        ? { sqlConfig: { connectionString: sourceProps.uri || '', query: '' } }
        : { apiConfig: { baseUrl: sourceProps.uri || '', headers: {} } })
    };

    // Create in the v2 catalog
    const createdGraphId = await v2().create(dataSourceConfig);

    // Link the source to the v2 record
    await mg().runQuery(
      `MATCH (s:SourceReference {id: $sourceId})
       SET s.dataSourceGraphId = $graphId, s.updatedAt = $now`,
      { sourceId, graphId: createdGraphId, now: new Date().toISOString() }
    );

    console.log(`${LOG_PREFIX} promoted workspace source ${sourceId} → DataSource ${createdGraphId}`);
    return { dataSourceGraphId: createdGraphId, alreadyRegistered: false };
  }

  /**
   * Create a v2 DataSource AND a workspace SourceReference in one go.
   *
   * Used by the unified DataSourceCreateDialog when launched from the
   * workspace SourcesTab. The two records are linked by `dataSourceGraphId`
   * on the source so the SourcesTab list and the Form Builder catalog see
   * the same record.
   *
   * The v2 DataSource is created with `namespace = workspace.namespace` so
   * it remains workspace-private. The SourceReference is given a synthetic
   * filename derived from the DataSource name and a `sourceType` of either
   * `DATABASE` or `API` (mapped from the v2 sourceType).
   *
   * @param {string} workspaceId
   * @param {Object} dataSourceConfig  Same shape as v2 DataSourceService.create() expects
   * @param {string} [userId]
   * @returns {Promise<{dataSourceGraphId, sourceId, source, dataSource}>}
   */
  async createWithSource(workspaceId, dataSourceConfig, userId = 'workspace-user') {
    const workspace = await ws().get(workspaceId);
    if (!workspace) throw new Error(`WorkSpace not found: ${workspaceId}`);

    if (!dataSourceConfig.sourceType) {
      throw new Error('dataSourceConfig.sourceType is required');
    }

    // Force workspace namespace so the DS is workspace-private
    const config = {
      ...dataSourceConfig,
      namespace: workspace.namespace,
      graphId: dataSourceConfig.graphId || `ds_${dataSourceConfig.sourceType.toLowerCase()}_${workspaceId.slice(0, 8)}_${Date.now().toString(36)}`
    };

    // 1. Create the v2 DataSource
    const graphId = await v2().create(config);
    const created = await v2().get(graphId);

    // 2. Create a paired SourceReference so the source appears in the
    //    workspace SourcesTab list. We pick the closest matching workspace
    //    sourceType for the v2 sourceType.
    const wsSourceType = mapV2TypeToWorkspaceSourceType(config.sourceType);

    // Skip auto-promote inside addSource — we already have the v2 record
    // and writing it back would create a second one. Instead create the
    // SourceReference directly via Memgraph and link it.
    const { v4: uuidv4 } = require('uuid');
    const sourceId = uuidv4();
    const now = new Date().toISOString();

    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})
       CREATE (s:SourceReference {
         id: $id,
         workspaceId: $wsId,
         filename: $filename,
         mimeType: $mimeType,
         sizeBytes: $sizeBytes,
         sourceType: $sourceType,
         uri: $uri,
         dataSourceGraphId: $dataSourceGraphId,
         status: $status,
         uploadedAt: $now
       })
       CREATE (w)-[:HAS_SOURCE]->(s)
       SET w.sourceCount = w.sourceCount + 1, w.updatedAt = $now`,
      {
        wsId: workspaceId,
        id: sourceId,
        filename: config.name,
        mimeType: 'application/x-datasource',
        sizeBytes: 0,
        sourceType: wsSourceType,
        uri: extractPrimaryUri(config),
        dataSourceGraphId: graphId,
        status: 'INDEXED',
        now
      }
    );

    console.log(`${LOG_PREFIX} created paired SourceReference ${sourceId} ↔ DataSource ${graphId} in workspace ${workspaceId}`);

    return {
      dataSourceGraphId: graphId,
      sourceId,
      source: {
        id: sourceId,
        filename: config.name,
        sourceType: wsSourceType,
        dataSourceGraphId: graphId,
        status: 'INDEXED',
        uploadedAt: now
      },
      dataSource: created
    };
  }

  /**
   * Best-effort cleanup when a workspace source is deleted.
   * Drops the linked v2 DataSource if one exists.
   */
  async unregisterSourceDataSource(workspaceId, sourceId) {
    const rows = await mg().runQuery(
      `MATCH (s:SourceReference {id: $sourceId})
       RETURN s.dataSourceGraphId as graphId`,
      { sourceId }
    );
    const graphId = rows[0]?.graphId;
    if (!graphId) return { deleted: false };

    try {
      await v2().delete(graphId);
      console.log(`${LOG_PREFIX} unlinked DataSource ${graphId} for source ${sourceId}`);
      return { deleted: true, dataSourceGraphId: graphId };
    } catch (err) {
      console.warn(`${LOG_PREFIX} unregister failed for ${graphId}: ${err.message}`);
      return { deleted: false, error: err.message };
    }
  }

  /**
   * Find the workspace SourceReference linked to a given v2 DataSource graphId,
   * if any. Used by the Form Builder UI to surface "this came from workspace X".
   */
  async findSourceForDataSource(dataSourceGraphId) {
    const rows = await mg().runQuery(
      `MATCH (s:SourceReference {dataSourceGraphId: $gid})
       OPTIONAL MATCH (w:WorkSpace)-[:HAS_SOURCE]->(s)
       RETURN s, w.id as workspaceId, w.name as workspaceName LIMIT 1`,
      { gid: dataSourceGraphId }
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const sourceProps = row.s?.properties || row.s || {};
    return {
      sourceId: sourceProps.id,
      workspaceId: row.workspaceId,
      workspaceName: row.workspaceName,
      filename: sourceProps.filename
    };
  }
}

const instance = new WorkspaceDataSourceService();
module.exports = instance;
module.exports.WorkspaceDataSourceService = WorkspaceDataSourceService;
module.exports.PROMOTABLE_SOURCE_TYPES = PROMOTABLE_SOURCE_TYPES;
module.exports.GLOBAL_NAMESPACES = GLOBAL_NAMESPACES;

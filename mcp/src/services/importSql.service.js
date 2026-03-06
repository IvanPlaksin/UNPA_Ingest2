import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// ═══════════════════════════════════════════════════════════════════════
// Domain / Data Source management
// ═══════════════════════════════════════════════════════════════════════

/**
 * List all domains and extract MSSQL data sources
 */
export const getDataSources = async () => {
  const { data } = await api.get('/domains');
  if (!data.success) throw new Error(data.error || 'Failed to load domains');

  // Flatten: each domain's MSSQL data sources with domainId attached
  const sources = [];
  for (const domain of data.domains || []) {
    for (const ds of domain.dataSources || []) {
      if (ds.sourceType === 'MSSQL') {
        // connectionParams may be stored as JSON string — parse if needed
        const cp = typeof ds.connectionParams === 'string'
          ? JSON.parse(ds.connectionParams)
          : ds.connectionParams;
        sources.push({
          ...ds,
          connectionParams: cp,
          domainId: domain.domainId,
          domainName: domain.displayName,
        });
      }
    }
  }
  return sources;
};

/**
 * Ensure a domain exists, create 'default' if none
 * @returns {string} domainId
 */
export const ensureDefaultDomain = async () => {
  const { data } = await api.get('/domains');
  if (data.domains?.length > 0) return data.domains[0].domainId;

  const { data: created } = await api.post('/domains', {
    displayName: 'Default',
    description: 'Auto-created default domain',
  });
  if (!created.success) throw new Error(created.error || 'Failed to create default domain');
  return created.domain.domainId;
};

/**
 * Save a new MSSQL data source to a domain
 */
export const saveDataSource = async (domainId, connectionName, connectionParams, credentials) => {
  // Auto-create domain if 'default' doesn't exist yet
  const resolvedDomainId = domainId || await ensureDefaultDomain();
  const { data } = await api.post(`/domains/${resolvedDomainId}/datasources`, {
    connectionName,
    sourceType: 'MSSQL',
    connectionParams,
    credentials,
  });
  if (!data.success) throw new Error(data.error || 'Failed to save data source');
  return data;
};

/**
 * Delete a data source from a domain
 */
export const deleteDataSource = async (domainId, connectionName) => {
  const { data } = await api.delete(`/domains/${domainId}/datasources/${connectionName}`);
  if (!data.success) throw new Error(data.error || 'Failed to delete data source');
  return data;
};

/**
 * Test connection with given params
 */
export const testConnection = async (connectionParams) => {
  const { data } = await api.post('/mssql/connect', connectionParams);
  // Disconnect immediately after test
  try { await api.post('/mssql/disconnect'); } catch (_) { /* ignore */ }
  return data;
};

// ═══════════════════════════════════════════════════════════════════════
// Import & Analyze (SSE stream)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Start import-analyze SSE stream.
 * Returns an EventSource that emits progress events.
 *
 * @param {string} domainId - domain owning the data source
 * @param {string} connectionName - data source connection name
 * @param {object} options - { includeStructure, includeEntities, includeBusinessLogic, sampleRows, credentials? }
 * @param {object} callbacks - { onEvent, onComplete, onError }
 * @returns {{ eventSource: EventSource, abort: Function }}
 */
export const startImportAnalysis = (domainId, connectionName, options = {}, callbacks = {}) => {
  const params = new URLSearchParams({
    domainId: domainId || '',
    connectionName: connectionName || '',
    includeStructure: options.includeStructure ?? true,
    includeEntities: options.includeEntities ?? true,
    includeBusinessLogic: options.includeBusinessLogic ?? true,
    sampleRows: options.sampleRows ?? 5,
  });

  // Direct connection params (bypass CredentialStore)
  if (options.credentials) {
    const c = options.credentials;
    if (c.server) params.set('server', c.server);
    if (c.port) params.set('port', c.port);
    if (c.database) params.set('database', c.database);
    if (c.user) params.set('user', c.user);
    if (c.password) params.set('password', c.password);
    if (c.encrypt !== undefined) params.set('encrypt', c.encrypt);
    if (c.trustServerCertificate !== undefined) params.set('trustServerCertificate', c.trustServerCertificate);
  }

  const url = `${API_BASE_URL}/mssql/import-analyze?${params.toString()}`;
  const eventSource = new EventSource(url);

  // Named event listeners
  const events = [
    'connected', 'schemas_found', 'tables_found',
    'analyzing_table', 'table_analyzed',
    'procedures_found', 'analyzing_procedure', 'procedure_analyzed',
    'generating_graphs', 'graph_ready',
    'progress', 'log',
  ];

  events.forEach(eventType => {
    eventSource.addEventListener(eventType, (e) => {
      try {
        const payload = JSON.parse(e.data);
        callbacks.onEvent?.(eventType, payload);
      } catch (err) {
        callbacks.onEvent?.(eventType, { raw: e.data });
      }
    });
  });

  eventSource.addEventListener('complete', (e) => {
    try {
      const payload = JSON.parse(e.data);
      callbacks.onComplete?.(payload);
    } catch (err) {
      callbacks.onComplete?.({ raw: e.data });
    }
    eventSource.close();
  });

  eventSource.addEventListener('error_event', (e) => {
    try {
      const payload = JSON.parse(e.data);
      callbacks.onError?.(payload);
    } catch (err) {
      callbacks.onError?.({ message: e.data || 'Unknown error' });
    }
    eventSource.close();
  });

  eventSource.onerror = (err) => {
    if (eventSource.readyState === EventSource.CLOSED) return;
    callbacks.onError?.({ message: 'SSE connection lost', details: err });
    eventSource.close();
  };

  const abort = () => {
    eventSource.close();
  };

  return { eventSource, abort };
};

// ═══════════════════════════════════════════════════════════════════════
// Agent Import (9-phase spiral extraction, SSE stream)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Start agentic import SSE stream.
 *
 * @param {object} options - { credentials?, schemas?, enableMetaLearning? }
 * @param {object} callbacks - { onEvent, onComplete, onError }
 * @returns {{ eventSource: EventSource, abort: Function }}
 */
export const startAgentImport = (domainId, connectionName, options = {}, callbacks = {}) => {
  const params = new URLSearchParams({
    domainId: domainId || '',
    connectionName: connectionName || '',
    enableMetaLearning: options.enableMetaLearning ?? true,
    includeBusinessLogic: options.includeBusinessLogic ?? true,
  });

  if (options.schemas) params.set('schemas', options.schemas);

  // Direct connection params
  if (options.credentials) {
    const c = options.credentials;
    if (c.server) params.set('server', c.server);
    if (c.port) params.set('port', c.port);
    if (c.database) params.set('database', c.database);
    if (c.user) params.set('user', c.user);
    if (c.password) params.set('password', c.password);
    if (c.encrypt !== undefined) params.set('encrypt', c.encrypt);
    if (c.trustServerCertificate !== undefined) params.set('trustServerCertificate', c.trustServerCertificate);
  }

  const url = `${API_BASE_URL}/mssql/agent-import?${params.toString()}`;
  const eventSource = new EventSource(url);

  // All agent events
  const agentEvents = [
    'agent_start', 'phase_start', 'phase_progress', 'phase_complete', 'phase_error', 'phase_skipped',
    'schemas_discovered', 'tables_discovered', 'tables_classified',
    'extracting_table', 'table_extracted', 'vocabulary_built',
    'analyzing_entity', 'entity_discovered', 'entities_summary',
    'relationships_inferred', 'analyzing_transactions', 'lifecycle_detected',
    'analyzing_procedure', 'procedure_analyzed', 'business_logic_summary',
    'validation_started', 'anomaly_found', 'validation_complete',
    'generating_graph', 'graph_ready', 'graphs_complete',
    'persisting_knowledge', 'knowledge_persisted',
    'consulting_history', 'similar_sessions_found', 'strategy_adapted',
    'llm_call_start', 'llm_call_complete', 'llm_call_error',
    'decision_made', 'log',
    'persisting_to_catalog', 'catalog_save_complete', 'catalog_save_error',
  ];

  agentEvents.forEach(eventType => {
    eventSource.addEventListener(eventType, (e) => {
      try {
        const payload = JSON.parse(e.data);
        callbacks.onEvent?.(eventType, payload);
      } catch (err) {
        callbacks.onEvent?.(eventType, { raw: e.data });
      }
    });
  });

  eventSource.addEventListener('agent_complete', (e) => {
    try {
      const payload = JSON.parse(e.data);
      callbacks.onComplete?.(payload);
    } catch (err) {
      callbacks.onComplete?.({ raw: e.data });
    }
    eventSource.close();
  });

  eventSource.addEventListener('agent_error', (e) => {
    try {
      const payload = JSON.parse(e.data);
      callbacks.onError?.(payload);
    } catch (err) {
      callbacks.onError?.({ message: e.data || 'Unknown agent error' });
    }
    eventSource.close();
  });

  eventSource.onerror = (err) => {
    if (eventSource.readyState === EventSource.CLOSED) return;
    callbacks.onError?.({ message: 'SSE connection lost', details: err });
    eventSource.close();
  };

  return { eventSource, abort: () => eventSource.close() };
};

// ═══════════════════════════════════════════════════════════════════════
// MSSQL direct operations (for connection testing / quick queries)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get quick overview of connected database
 */
export const getDatabaseOverview = async () => {
  const { data } = await api.get('/mssql/overview');
  return data;
};

/**
 * Get database schemas
 */
export const getSchemas = async () => {
  const { data } = await api.get('/mssql/schemas');
  return data;
};

/**
 * Get connection status
 */
export const getConnectionStatus = async () => {
  const { data } = await api.get('/mssql/status');
  return data;
};

import React, { useEffect, useCallback, useRef, useState } from 'react';
import {
  Database, Plus, Pencil, Trash2, PlugZap, Loader2,
  ChevronDown, ChevronUp, Play, X, CheckCircle, AlertCircle, Container,
  Sparkles, BarChart3,
} from 'lucide-react';
import FloatingWindow from './FloatingWindow';
import ImportSqlLog from './ImportSqlLog';
import ImportSqlResults from './ImportSqlResults';
import PhaseRestartDialog from './PhaseRestartDialog';
import useImportSqlStore from '../../stores/importSqlStore';
import {
  getDataSources,
  testConnection,
  saveDataSource,
  deleteDataSource,
  startImportAnalysis,
  startAgentImport,
} from '../../services/importSql.service';

// ═══════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════

const inputStyle = {
  background: '#0d1117',
  border: '1px solid #30363d',
  borderRadius: 6,
  color: '#e6edf3',
  padding: '6px 10px',
  fontSize: 13,
  width: '100%',
  outline: 'none',
};

const btnStyle = (color = '#30363d', textColor = '#e6edf3') => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 12px',
  borderRadius: 6,
  border: `1px solid ${color}`,
  background: 'transparent',
  color: textColor,
  fontSize: 12,
  cursor: 'pointer',
  transition: 'all 0.15s',
});

const btnPrimary = (color = '#58a6ff') => ({
  ...btnStyle(color, color),
  background: `${color}18`,
});

const labelStyle = {
  color: '#8b949e',
  fontSize: 11,
  fontWeight: 500,
  marginBottom: 4,
  display: 'block',
};

// ═══════════════════════════════════════════════════════════════════════
// Presets
// ═══════════════════════════════════════════════════════════════════════

const DOCKER_EXPRESS_PRESET = {
  connectionName: 'docker-sqlexpress',
  server: 'localhost',
  port: 1433,
  database: 'master',
  user: 'sa',
  password: 'SqlExpress2022#Dev',
  encryption: true,
  trustServerCertificate: true,
  protocol: 'tcp',
  instanceName: '',
};

// ═══════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════

export default function ImportSqlSelector() {
  const store = useImportSqlStore();
  const abortRef = useRef(null);
  const [useAgentMode, setUseAgentMode] = useState(true); // Default to agent mode
  const [activeView, setActiveView] = useState('connection'); // 'connection' | 'results'
  const [restartPhase, setRestartPhase] = useState(null);

  // Sync view with agent status
  useEffect(() => {
    if (store.agentStatus === 'complete' && store.showAgentResults) {
      setActiveView('results');
    }
  }, [store.agentStatus, store.showAgentResults]);

  // Load data sources on open + restore last used
  useEffect(() => {
    if (!store.isOpen) return;
    loadSources().then(() => {
      const lastId = localStorage.getItem('importSql.lastSourceId');
      const state = useImportSqlStore.getState();
      if (lastId && state.dataSources.find(s => s.connectionName === lastId)) {
        state.selectSource(lastId);
      }
    });
  }, [store.isOpen]);

  const loadSources = useCallback(async () => {
    store.setDataSourcesLoading(true);
    try {
      const sources = await getDataSources();
      store.setDataSources(sources);
    } catch (err) {
      console.error('[ImportSql] Failed to load sources:', err);
      store.addLog('error', `Failed to load data sources: ${err.message}`);
    } finally {
      store.setDataSourcesLoading(false);
    }
  }, []);

  // ── Test Connection ──
  const handleTestConnection = useCallback(async () => {
    const { connectionForm: f } = useImportSqlStore.getState();
    store.setTestConnectionStatus('testing');
    try {
      await testConnection({
        server: f.server,
        port: parseInt(f.port) || 1433,
        database: f.database,
        user: f.user,
        password: f.password,
        protocol: f.protocol || 'tcp',
        instanceName: f.instanceName || undefined,
        options: {
          encrypt: f.encryption,
          trustServerCertificate: f.trustServerCertificate,
        },
      });
      store.setTestConnectionStatus('success');
    } catch (err) {
      store.setTestConnectionStatus('error', err.message);
    }
  }, []);

  // ── Save Connection ──
  const handleSaveConnection = useCallback(async () => {
    const { connectionForm: f, dataSources, isEditingConnection, selectedSourceId } = useImportSqlStore.getState();

    const connName = (f.connectionName || `mssql-${f.server}-${f.database}`).replace(/[^a-zA-Z0-9_-]/g, '_');

    if (!connName) {
      store.addLog('error', 'Connection name is required');
      return;
    }

    const isDuplicate = dataSources.some(s =>
      s.connectionName === connName && !(isEditingConnection && selectedSourceId === connName)
    );
    if (isDuplicate) {
      store.updateConnectionForm('_nameConflict', true);
      store.addLog('error', `Connection "${connName}" already exists. Choose a different name.`);
      return;
    }
    store.updateConnectionForm('_nameConflict', false);

    const domainId = dataSources[0]?.domainId || null;
    // Only send credentials if user filled them in (don't overwrite with empty when editing)
    const credentials = (f.user && f.password) ? { username: f.user, password: f.password } : null;
    try {
      await saveDataSource(domainId, connName, {
        server: f.server,
        port: parseInt(f.port) || 1433,
        database: f.database,
        encryption: f.encryption,
        trustServerCertificate: f.trustServerCertificate,
        protocol: f.protocol || 'tcp',
        instanceName: f.instanceName || undefined,
      }, credentials);
      store.addLog('success', `Connection "${connName}" saved`);
      store.resetConnectionForm();
      await loadSources();
    } catch (err) {
      store.addLog('error', `Failed to save: ${err.message}`);
    }
  }, [loadSources]);

  // ── Delete Connection ──
  const handleDeleteConnection = useCallback(async () => {
    const { selectedSourceId, dataSources } = useImportSqlStore.getState();
    if (!selectedSourceId) return;
    const source = dataSources.find(s => s.connectionName === selectedSourceId);
    if (!source || !confirm(`Delete connection "${selectedSourceId}"?`)) return;
    try {
      await deleteDataSource(source.domainId, selectedSourceId);
      store.addLog('success', `Connection "${selectedSourceId}" deleted`);
      store.selectSource(null);
      await loadSources();
    } catch (err) {
      store.addLog('error', `Failed to delete: ${err.message}`);
    }
  }, [loadSources]);

  // ── Build credentials helper ──
  const buildCredentials = useCallback(() => {
    const state = useImportSqlStore.getState();
    const form = state.connectionForm;
    const hasFormCredentials = form.server && form.user;
    if (!hasFormCredentials) return undefined;
    return {
      server: form.server,
      port: form.port,
      database: form.database,
      user: form.user,
      password: form.password,
      encrypt: form.encryption,
      trustServerCertificate: form.trustServerCertificate,
    };
  }, []);

  // ── Start Legacy Import ──
  const handleStartImport = useCallback(() => {
    const state = useImportSqlStore.getState();
    const source = state.dataSources.find(s => s.connectionName === state.selectedSourceId);
    const form = state.connectionForm;
    const hasFormCredentials = form.server && form.user;
    if (!source && !hasFormCredentials) return;

    store.startImport();
    const serverLabel = source?.connectionParams?.server || form.server;
    const dbLabel = source?.connectionParams?.database || form.database;
    if (source) localStorage.setItem('importSql.lastSourceId', source.connectionName);
    store.addLog('info', `Starting import from ${serverLabel}/${dbLabel}...`);

    const credentials = buildCredentials();

    const { abort } = startImportAnalysis(
      source?.domainId || 'default',
      source?.connectionName || '',
      { credentials },
      {
        onEvent: (type, payload) => {
          const s = useImportSqlStore.getState();
          switch (type) {
            case 'connected':
              s.setImportStatus('analyzing');
              s.addLog('success', 'Connected to SQL Server');
              break;
            case 'schemas_found':
              s.addLog('info', `Found ${payload.count} schemas: ${payload.names?.join(', ')}`);
              break;
            case 'tables_found':
              s.setProgress(0, payload.total || payload.count || 0, 'Preparing table analysis...');
              s.addLog('info', `Found ${payload.total || payload.count || 0} tables/views`);
              break;
            case 'analyzing_table':
              s.setProgress(payload.index || payload.current || 0, payload.total || 0, `Analyzing ${payload.schema}.${payload.table}`);
              s.addLog('progress', `Analyzing table ${payload.index || payload.current}/${payload.total}: ${payload.schema}.${payload.table}`);
              break;
            case 'table_analyzed':
              s.addLog('success', `Analyzed: ${payload.schema}.${payload.table} (${payload.entities?.length || 0} entities)`);
              break;
            case 'procedures_found':
              s.addLog('info', `Found ${payload.count} procedures`);
              break;
            case 'analyzing_procedure':
              s.addLog('progress', `Analyzing procedure ${payload.index}/${payload.total}: ${payload.name}`);
              break;
            case 'procedure_analyzed':
              s.addLog('success', `Analyzed procedure: ${payload.name}`);
              break;
            case 'generating_graphs':
              s.setImportStatus('generating');
              s.addLog('info', `Generating ${payload.type} graph...`);
              break;
            case 'graph_ready':
              s.addLog('success', `Graph "${payload.type}" ready: ${payload.nodes?.length || 0} nodes, ${payload.edges?.length || 0} edges`);
              break;
            case 'progress':
              s.setProgress(payload.current, payload.total, payload.label || '');
              break;
            case 'log':
              s.addLog(payload.level || 'info', payload.message);
              break;
            default:
              s.addLog('info', `[${type}] ${JSON.stringify(payload).slice(0, 200)}`);
          }
        },
        onComplete: (payload) => {
          const s = useImportSqlStore.getState();
          s.setImportComplete(payload.graphs || [], payload.summary || {});
          s.addLog('success', `Import complete! ${payload.summary?.totalNodes || 0} nodes, ${payload.summary?.totalEdges || 0} edges`);
        },
        onError: (payload) => {
          const s = useImportSqlStore.getState();
          s.setImportError(payload.message || 'Import failed');
          s.addLog('error', `Import failed: ${payload.message}`);
        },
      }
    );
    abortRef.current = abort;
  }, [buildCredentials]);

  // ── Start Agent Import ──
  const handleStartAgentImport = useCallback(() => {
    const state = useImportSqlStore.getState();
    const source = state.dataSources.find(s => s.connectionName === state.selectedSourceId);
    const form = state.connectionForm;
    const hasFormCredentials = form.server && form.user;
    if (!source && !hasFormCredentials) return;

    store.startAgentImport();
    const serverLabel = source?.connectionParams?.server || form.server;
    const dbLabel = source?.connectionParams?.database || form.database;
    if (source) localStorage.setItem('importSql.lastSourceId', source.connectionName);
    const portLabel = source?.connectionParams?.port || form.port || 1433;
    store.addLog('info', `Starting agentic extraction from ${serverLabel}:${portLabel}/${dbLabel}...`);

    const credentials = buildCredentials();

    const { abort } = startAgentImport(
      source?.domainId || 'default',
      source?.connectionName || '',
      { credentials },
      {
        onEvent: (type, payload) => {
          const s = useImportSqlStore.getState();
          s.addAgentEvent(type, payload);

          switch (type) {
            case 'agent_start':
              s.setAgentSessionId(payload.sessionId);
              s.addLog('success', `Agent started (session: ${payload.sessionId?.slice(0, 8)})`);
              break;
            case 'phase_start':
              s.agentPhaseStart(payload);
              s.addLog('info', `Phase ${payload.phaseNumber}: ${payload.description || payload.phase}`);
              break;
            case 'phase_progress':
              s.agentPhaseProgress(payload);
              break;
            case 'phase_complete':
              s.agentPhaseComplete(payload);
              s.addLog('success', `Phase ${payload.phase} complete (${payload.duration}ms)`);
              break;
            case 'phase_error':
              s.agentPhaseError(payload);
              s.addLog('error', `Phase ${payload.phase} FAILED: ${payload.error}`);
              if (payload.stack) s.addLog('error', `Stack trace:\n${payload.stack}`);
              break;
            case 'schemas_discovered':
              s.addLog('info', `Found ${payload.count} schema(s): ${(payload.schemas || []).join(', ')}`);
              break;
            case 'tables_discovered':
              s.addLog('info', `Discovered ${payload.count} table(s)/view(s)`);
              break;
            case 'tables_classified':
              s.addLog('info', `Tables: ${payload.master || 0} master, ${payload.reference || 0} ref, ${payload.transaction || 0} txn, ${payload.junction || 0} jct`);
              break;
            case 'entity_discovered':
              s.addLog('info', `Entity: ${payload.entityName} (${payload.entityType}, confidence: ${payload.confidence})`);
              break;
            case 'procedure_analyzed':
              s.addLog('info', `Procedure: ${payload.name} (${payload.rulesFound} rules, AST: ${payload.astParsed ? 'yes' : 'no'})`);
              break;
            case 'graph_ready':
              s.addLog('success', `Graph ${payload.type}: ${payload.nodes} nodes, ${payload.edges} edges`);
              break;
            case 'catalog_save_complete':
              s.setCatalogResult(payload.entries, []);
              s.addLog('success', `Saved ${payload.saved} graph(s) to Catalog${payload.duplicates ? ` (${payload.duplicates} duplicates skipped)` : ''}`);
              break;
            case 'catalog_save_error':
              s.addLog('warning', `Catalog save failed: ${payload.error}`);
              break;
            case 'anomaly_found':
              s.addLog('warning', `Anomaly: [${payload.severity}] ${payload.type} — ${payload.description}`);
              break;
            case 'validation_complete':
              s.addLog('info', `Validation: coverage ${payload.coverage}%, ${payload.anomalyCount} anomalies, quality ${Math.round((payload.qualityScore || 0) * 100)}%`);
              break;
            case 'log':
              s.addLog(payload.level || 'info', payload.message);
              break;
            default:
              // Other events go to agent event log only
              break;
          }
        },
        onComplete: (payload) => {
          const s = useImportSqlStore.getState();
          s.setAgentComplete(payload);
          if (payload.graphs) s.setAgentGraphs(payload.graphs);
          if (payload.summary?.anomalies) s.setAgentAnomalies(payload.summary.anomalies);
          s.addLog('success', `Agent extraction complete! Quality: ${Math.round((payload.qualityScore || 0) * 100)}%`);
        },
        onError: (payload) => {
          const s = useImportSqlStore.getState();
          s.setAgentError(payload);
          const phase = payload.phaseName ? ` in phase "${payload.phaseName}"` : '';
          s.addLog('error', `Agent FAILED${phase}: ${payload.message || 'Unknown error'}`);
          if (payload.stack) {
            s.addLog('error', `Stack: ${payload.stack}`);
          }
        },
      }
    );
    abortRef.current = abort;
  }, [buildCredentials]);

  // ── Cancel Import ──
  const handleCancel = useCallback(() => {
    abortRef.current?.();
    store.setImportStatus('idle');
    store.addLog('warning', 'Import cancelled by user');
  }, []);

  // ── Handle Open Graphs in GXE ──
  const handleOpenGraphsInGXE = useCallback((graphs) => {
    if (!graphs) return;

    // Convert object format { type: {nodes,edges} } to array [{ type, nodes, edges }]
    // GXE consumer expects pendingGraphs.graphs to be an array
    let graphsArray;
    if (Array.isArray(graphs)) {
      graphsArray = graphs;
    } else {
      graphsArray = Object.entries(graphs).map(([type, data]) => ({
        type,
        title: data.title || type.replace(/([A-Z])/g, ' $1').trim(),
        nodes: data.nodes || [],
        edges: data.edges || [],
      }));
    }

    store.setImportComplete(graphsArray, store.agentSummary || {});
    store.closeDialog();
  }, []);

  // ── Handle Phase Restart ──
  const handleRestartPhases = useCallback(async (phases) => {
    console.log('[ImportSql] Restart phases requested:', phases);
    // TODO: call restart-phases endpoint when available
    store.addLog('info', `Phase restart requested: ${phases.join(', ')}`);
  }, []);

  if (!store.isOpen) return null;

  const isImporting = ['connecting', 'analyzing', 'generating'].includes(store.importStatus);
  const showForm = store.isNewConnection || store.isEditingConnection;
  const canStartImport = store.selectedSourceId || (store.connectionForm.server && store.connectionForm.user);
  const hasResults = store.agentStatus === 'complete';

  return (
    <FloatingWindow
      storageKey="gxe-import-sql-panel"
      title="Import from SQL Server"
      icon={<Database size={14} />}
      defaultPosition={{ x: 80, y: 60 }}
      defaultSize={{ width: 520, height: 650 }}
      minSize={{ width: 400, height: 300 }}
      zIndex={55}
      onClose={() => {
        if (isImporting) {
          if (!confirm('Import in progress. Cancel?')) return;
          abortRef.current?.();
        }
        store.closeDialog();
      }}
    >
      {/* ── View Tabs (show when results available) ── */}
      {hasResults && (
        <div style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid #30363d',
          marginBottom: 8,
        }}>
          <button
            onClick={() => setActiveView('connection')}
            style={{
              ...btnStyle(),
              border: 'none',
              borderBottom: activeView === 'connection' ? '2px solid #58a6ff' : '2px solid transparent',
              borderRadius: 0,
              color: activeView === 'connection' ? '#58a6ff' : '#8b949e',
              padding: '8px 16px',
            }}
          >
            <Database size={13} /> Connection
          </button>
          <button
            onClick={() => setActiveView('results')}
            style={{
              ...btnStyle(),
              border: 'none',
              borderBottom: activeView === 'results' ? '2px solid #58a6ff' : '2px solid transparent',
              borderRadius: 0,
              color: activeView === 'results' ? '#58a6ff' : '#8b949e',
              padding: '8px 16px',
            }}
          >
            <BarChart3 size={13} /> Results
          </button>
        </div>
      )}

      {/* ── Results View ── */}
      {activeView === 'results' && hasResults ? (
        <div style={{ height: 'calc(100% - 48px)' }}>
          <ImportSqlResults
            onClose={() => {
              store.toggleAgentResults(false);
              setActiveView('connection');
            }}
            onOpenInGXE={handleOpenGraphsInGXE}
            onRestartPhase={(phase) => setRestartPhase(phase)}
          />
        </div>
      ) : (
        /* ── Connection View ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>

          {/* ── Data Source Selector ── */}
          <div>
            <label style={labelStyle}>Data Source</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={store.selectedSourceId || ''}
                onChange={(e) => store.selectSource(e.target.value || null)}
                disabled={isImporting}
                style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}
              >
                <option value="">-- Select saved connection --</option>
                {store.dataSources
                  .filter((s, i, arr) => arr.findIndex(x => x.connectionName === s.connectionName) === i)
                  .map(s => (
                  <option key={s.connectionName} value={s.connectionName}>
                    {s.connectionName} ({s.connectionParams?.server}/{s.connectionParams?.database})
                  </option>
                ))}
              </select>
              <button
                onClick={() => store.startNewConnection()}
                disabled={isImporting}
                style={btnStyle('#3fb950', '#3fb950')}
                title="New connection"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => store.startEditConnection()}
                disabled={isImporting || !store.selectedSourceId}
                style={btnStyle('#58a6ff', '#58a6ff')}
                title="Edit connection"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={handleDeleteConnection}
                disabled={isImporting || !store.selectedSourceId}
                style={btnStyle('#f85149', '#f85149')}
                title="Delete connection"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* ── Connection Form (collapsible) ── */}
          {showForm && (
            <div style={{
              background: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              padding: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#e6edf3', fontSize: 13, fontWeight: 600 }}>
                    {store.isNewConnection ? 'New Connection' : 'Edit Connection'}
                  </span>
                  {store.isNewConnection && (
                    <button
                      onClick={() => store.applyPreset(DOCKER_EXPRESS_PRESET)}
                      style={{ ...btnStyle('#8957e5', '#8957e5'), padding: '2px 8px', fontSize: 11 }}
                      title="Fill with Docker SQL Express defaults (localhost:1433, sa)"
                    >
                      <Container size={12} /> Docker Express
                    </button>
                  )}
                </div>
                <button onClick={() => store.resetConnectionForm()} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Connection Name */}
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Connection Name</label>
                <input
                  value={store.connectionForm.connectionName}
                  onChange={(e) => store.updateConnectionForm('connectionName', e.target.value)}
                  placeholder="my-sql-connection"
                  style={{
                    ...inputStyle,
                    ...(store.connectionForm._nameConflict ? { borderColor: '#f85149' } : {}),
                  }}
                />
                {store.connectionForm._nameConflict && (
                  <span style={{ color: '#f85149', fontSize: 11, marginTop: 2, display: 'block' }}>
                    A connection with this name already exists
                  </span>
                )}
              </div>

              {/* Protocol selector */}
              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Protocol</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#e6edf3', fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="protocol"
                      value="tcp"
                      checked={store.connectionForm.protocol !== 'named-pipes'}
                      onChange={() => store.updateConnectionForm('protocol', 'tcp')}
                    />
                    TCP/IP
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#e6edf3', fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="protocol"
                      value="named-pipes"
                      checked={store.connectionForm.protocol === 'named-pipes'}
                      onChange={() => store.updateConnectionForm('protocol', 'named-pipes')}
                    />
                    Named Pipes
                  </label>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: store.connectionForm.protocol === 'named-pipes' ? '1fr 1fr' : '1fr 100px', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={labelStyle}>Server</label>
                  <input
                    value={store.connectionForm.server}
                    onChange={(e) => store.updateConnectionForm('server', e.target.value)}
                    placeholder={store.connectionForm.protocol === 'named-pipes' ? 'hostname or .\\\\' : 'sql-server.example.com'}
                    style={inputStyle}
                  />
                </div>
                {store.connectionForm.protocol === 'named-pipes' ? (
                  <div>
                    <label style={labelStyle}>Instance Name</label>
                    <input
                      value={store.connectionForm.instanceName}
                      onChange={(e) => store.updateConnectionForm('instanceName', e.target.value)}
                      placeholder="SQLEXPRESS (optional)"
                      style={inputStyle}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={labelStyle}>Port</label>
                    <input
                      value={store.connectionForm.port}
                      onChange={(e) => store.updateConnectionForm('port', e.target.value)}
                      type="number"
                      style={inputStyle}
                    />
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 8 }}>
                <label style={labelStyle}>Database</label>
                <input
                  value={store.connectionForm.database}
                  onChange={(e) => store.updateConnectionForm('database', e.target.value)}
                  placeholder="MyDatabase"
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={labelStyle}>User</label>
                  <input
                    value={store.connectionForm.user}
                    onChange={(e) => store.updateConnectionForm('user', e.target.value)}
                    placeholder="sa"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Password</label>
                  <input
                    value={store.connectionForm.password}
                    onChange={(e) => store.updateConnectionForm('password', e.target.value)}
                    type="password"
                    placeholder={store.connectionForm._hasCredentials ? '(saved)' : ''}
                    style={inputStyle}
                  />
                </div>
              </div>
              {store.connectionForm._hasCredentials && !store.connectionForm.user && !store.connectionForm.password && (
                <div style={{ color: '#238636', fontSize: 11, marginBottom: 8 }}>
                  ✓ Credentials saved. Leave blank to keep existing, or enter new values to update.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={store.connectionForm.encryption}
                    onChange={(e) => store.updateConnectionForm('encryption', e.target.checked)}
                  />
                  Encrypt
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8b949e', fontSize: 12, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={store.connectionForm.trustServerCertificate}
                    onChange={(e) => store.updateConnectionForm('trustServerCertificate', e.target.checked)}
                  />
                  Trust Server Certificate
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={handleTestConnection} disabled={store.testConnectionStatus === 'testing'} style={btnPrimary('#58a6ff')}>
                  {store.testConnectionStatus === 'testing' ? <Loader2 size={13} className="animate-spin" /> : <PlugZap size={13} />}
                  Test
                </button>
                <button onClick={handleSaveConnection} style={btnPrimary('#3fb950')}>
                  Save
                </button>

                {store.testConnectionStatus === 'success' && (
                  <span style={{ color: '#3fb950', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CheckCircle size={13} /> Connected
                  </span>
                )}
                {store.testConnectionStatus === 'error' && (
                  <span style={{ color: '#f85149', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertCircle size={13} /> {store.testConnectionError || 'Failed'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Agent Mode Toggle ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            background: useAgentMode ? '#8957e510' : 'transparent',
            border: `1px solid ${useAgentMode ? '#8957e5' : '#30363d'}`,
            borderRadius: 6,
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e6edf3', fontSize: 12, cursor: 'pointer', flex: 1 }}>
              <input
                type="checkbox"
                checked={useAgentMode}
                onChange={(e) => setUseAgentMode(e.target.checked)}
                disabled={isImporting}
              />
              <Sparkles size={14} color={useAgentMode ? '#8957e5' : '#8b949e'} />
              Agent Mode (9-phase spiral extraction)
            </label>
            {store.agentCurrentPhase && isImporting && (
              <span style={{ color: '#8957e5', fontSize: 11 }}>
                {store.agentCurrentPhase}
              </span>
            )}
          </div>

          {/* ── Progress Bar ── */}
          {isImporting && store.progress.total > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#8b949e', fontSize: 11 }}>{store.progress.label}</span>
                <span style={{ color: '#58a6ff', fontSize: 11 }}>
                  {store.progress.current}/{store.progress.total}
                </span>
              </div>
              <div style={{ background: '#21262d', borderRadius: 4, height: 4, overflow: 'hidden' }}>
                <div style={{
                  background: useAgentMode ? '#8957e5' : '#58a6ff',
                  height: '100%',
                  width: `${Math.min(100, (store.progress.current / store.progress.total) * 100)}%`,
                  transition: 'width 0.3s ease',
                  borderRadius: 4,
                }} />
              </div>
            </div>
          )}

          {/* ── Log Console ── */}
          <ImportSqlLog logs={store.logs} maxHeight={250} />

          {/* ── Footer Actions ── */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            {isImporting ? (
              <button onClick={handleCancel} style={btnStyle('#f85149', '#f85149')}>
                <X size={13} /> Cancel
              </button>
            ) : (
              <>
                <button onClick={() => store.closeDialog()} style={btnStyle()}>
                  Close
                </button>
                <button
                  onClick={useAgentMode ? handleStartAgentImport : handleStartImport}
                  disabled={!canStartImport || store.importStatus === 'complete'}
                  style={{
                    ...btnPrimary(useAgentMode ? '#8957e5' : '#3fb950'),
                    opacity: canStartImport ? 1 : 0.5,
                    cursor: canStartImport ? 'pointer' : 'not-allowed',
                  }}
                >
                  {useAgentMode ? <Sparkles size={13} /> : <Play size={13} />}
                  {useAgentMode ? 'Agent Extract' : 'Import & Analyze'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Phase Restart Dialog ── */}
      <PhaseRestartDialog
        open={!!restartPhase}
        onClose={() => setRestartPhase(null)}
        phaseName={restartPhase}
        completedPhases={store.agentPhases?.filter(p => p.status === 'complete').map(p => p.phaseName)}
        onConfirm={handleRestartPhases}
      />
    </FloatingWindow>
  );
}

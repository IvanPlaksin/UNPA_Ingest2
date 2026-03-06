import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * ImportSQL Store - state management for SQL Server import workflow
 *
 * Sections:
 * - dialog: open/close state
 * - dataSources: saved MSSQL connections from domain service
 * - connectionForm: new/edit connection form fields
 * - import: import process status, logs, results
 * - graphResult: pending graph data to open in GXE tabs
 */

const initialState = {
  // === DIALOG ===
  isOpen: false,

  // === DATA SOURCES ===
  dataSources: [],
  dataSourcesLoading: false,
  selectedSourceId: null,

  // === CONNECTION FORM ===
  connectionForm: {
    connectionName: '',    // unique display name for this connection
    server: '',
    port: 1433,
    database: '',
    user: '',
    password: '',
    encryption: true,
    trustServerCertificate: true,
    protocol: 'tcp',       // 'tcp' | 'named-pipes'
    instanceName: '',      // SQL instance name for Named Pipes (e.g. "SQLEXPRESS")
  },
  isNewConnection: false,
  isEditingConnection: false,
  testConnectionStatus: null, // null | 'testing' | 'success' | 'error'
  testConnectionError: null,

  // === IMPORT PROCESS ===
  importStatus: 'idle', // 'idle' | 'connecting' | 'analyzing' | 'generating' | 'complete' | 'error'
  logs: [],
  progress: { current: 0, total: 0, label: '' },
  importError: null,

  // === RESULT GRAPHS (pending open in GXE tab) ===
  pendingGraphs: null, // { graphs: [...], summary: {...} } | null

  // === AGENT MODE (9-phase spiral extraction) ===
  agentStatus: 'idle', // 'idle' | 'running' | 'complete' | 'partial' | 'failed'
  agentSessionId: null,
  agentSummary: null,    // { tablesProcessed, entitiesDiscovered, relationshipsFound, ... }
  agentGraphs: null,     // { Structure: {nodes,edges}, Entity: {nodes,edges}, ... }
  agentPhases: [],       // [{ id, phaseName, status, durationMs, itemsProcessed, steps, metrics, errorMessage }]
  agentQualityScore: null,
  agentCurrentPhase: null,
  agentEvents: [],       // Recent SSE events for live log
  showAgentResults: false,

  // === CATALOG INTEGRATION ===
  agentCatalogEntries: [],     // [{ graphType, entryId, versionId }]
  agentCatalogDuplicates: [],  // [{ graphType, existingEntryId }]

  // === ANOMALIES (iNeed task generation) ===
  agentAnomalies: [],          // [{ id, type, severity, description, table, affectedTables, count, hasTask }]

  // === GNN ANALYSIS ===
  lastImportedGraphData: null, // { nodes: [...], edges: [...] } — snapshot for GNN analysis
  showGnnPrompt: false,
  gnnOptions: { linkPrediction: true, nodeClassification: true, communityDetection: true },
  gnnStatus: 'idle', // 'idle' | 'running' | 'complete' | 'error'
  gnnResults: null, // { predictions: [], classifications: {}, communities: [] }
  gnnProgress: { current: 0, total: 0, phase: '' },
  gnnError: null,
};

const useImportSqlStore = create(
  devtools(
    (set, get) => ({
      ...initialState,

      // === DIALOG ACTIONS ===
      openDialog: () => set({ isOpen: true }, false, 'openDialog'),
      closeDialog: () => set({
        isOpen: false,
        isNewConnection: false,
        isEditingConnection: false,
        testConnectionStatus: null,
        testConnectionError: null,
      }, false, 'closeDialog'),

      // === DATA SOURCES ACTIONS ===
      setDataSources: (dataSources) => set({ dataSources }, false, 'setDataSources'),
      setDataSourcesLoading: (loading) => set({ dataSourcesLoading: loading }, false, 'setDataSourcesLoading'),

      selectSource: (sourceId) => {
        const source = get().dataSources.find(s => s.connectionName === sourceId);
        set({
          selectedSourceId: sourceId,
          isNewConnection: false,
          isEditingConnection: false,
          testConnectionStatus: null,
          connectionForm: source ? {
            connectionName: source.connectionName || '',
            server: source.connectionParams?.server || '',
            port: source.connectionParams?.port || 1433,
            database: source.connectionParams?.database || '',
            user: '',
            password: '',
            encryption: source.connectionParams?.encryption ?? true,
            trustServerCertificate: source.connectionParams?.trustServerCertificate ?? true,
            protocol: source.connectionParams?.protocol || 'tcp',
            instanceName: source.connectionParams?.instanceName || '',
          } : initialState.connectionForm,
        }, false, 'selectSource');
      },

      // === CONNECTION FORM ACTIONS ===
      startNewConnection: () => set({
        isNewConnection: true,
        isEditingConnection: false,
        selectedSourceId: null,
        connectionForm: { ...initialState.connectionForm },
        testConnectionStatus: null,
        testConnectionError: null,
      }, false, 'startNewConnection'),

      startEditConnection: () => {
        if (!get().selectedSourceId) return;
        set({
          isEditingConnection: true,
          isNewConnection: false,
          testConnectionStatus: null,
          testConnectionError: null,
        }, false, 'startEditConnection');
      },

      applyPreset: (preset) => set({
        connectionForm: { ...initialState.connectionForm, ...preset },
        testConnectionStatus: null,
        testConnectionError: null,
      }, false, 'applyPreset'),

      updateConnectionForm: (field, value) => set(state => ({
        connectionForm: { ...state.connectionForm, [field]: value },
      }), false, 'updateConnectionForm'),

      resetConnectionForm: () => set({
        connectionForm: { ...initialState.connectionForm },
        isNewConnection: false,
        isEditingConnection: false,
        testConnectionStatus: null,
        testConnectionError: null,
      }, false, 'resetConnectionForm'),

      setTestConnectionStatus: (status, error = null) => set({
        testConnectionStatus: status,
        testConnectionError: error,
      }, false, 'setTestConnectionStatus'),

      // === IMPORT PROCESS ACTIONS ===
      startImport: () => set({
        importStatus: 'connecting',
        logs: [],
        progress: { current: 0, total: 0, label: 'Connecting...' },
        importError: null,
        pendingGraphs: null,
      }, false, 'startImport'),

      setImportStatus: (status) => set({ importStatus: status }, false, 'setImportStatus'),

      addLog: (level, message) => set(state => ({
        logs: [...state.logs, {
          timestamp: new Date().toISOString(),
          level,
          message,
        }],
      }), false, 'addLog'),

      setProgress: (current, total, label) => set({
        progress: { current, total, label },
      }, false, 'setProgress'),

      setImportError: (error) => set({
        importStatus: 'error',
        importError: error,
      }, false, 'setImportError'),

      setImportComplete: (graphs, summary) => set({
        importStatus: 'complete',
        pendingGraphs: { graphs, summary },
        progress: { current: 1, total: 1, label: 'Complete' },
      }, false, 'setImportComplete'),

      // === GRAPH RESULT ACTIONS ===
      consumePendingGraphs: () => {
        const pending = get().pendingGraphs;
        set({ pendingGraphs: null }, false, 'consumePendingGraphs');
        return pending;
      },

      clearLogs: () => set({ logs: [] }, false, 'clearLogs'),

      // === AGENT MODE ACTIONS ===
      startAgentImport: () => set({
        agentStatus: 'running',
        agentSessionId: null,
        agentSummary: null,
        agentGraphs: null,
        agentPhases: [],
        agentQualityScore: null,
        agentCurrentPhase: null,
        agentEvents: [],
        agentAnomalies: [],
        showAgentResults: false,
        importStatus: 'analyzing',
        logs: [],
        importError: null,
      }, false, 'startAgentImport'),

      setAgentSessionId: (sessionId) => set({ agentSessionId: sessionId }, false, 'setAgentSessionId'),

      agentPhaseStart: (phase) => set(state => {
        const existing = state.agentPhases.find(p => p.phaseName === phase.phase);
        if (existing) {
          return {
            agentCurrentPhase: phase.phase,
            agentPhases: state.agentPhases.map(p =>
              p.phaseName === phase.phase ? { ...p, status: 'running' } : p
            ),
          };
        }
        return {
          agentCurrentPhase: phase.phase,
          agentPhases: [...state.agentPhases, {
            id: phase.phase,
            phaseName: phase.phase,
            phaseNumber: phase.phaseNumber,
            description: phase.description,
            status: 'running',
            durationMs: 0,
            itemsProcessed: 0,
            tokensUsed: 0,
            steps: [],
            metrics: {},
            errorMessage: null,
          }],
        };
      }, false, 'agentPhaseStart'),

      agentPhaseComplete: (phase) => set(state => ({
        agentPhases: state.agentPhases.map(p =>
          p.phaseName === phase.phase
            ? { ...p, status: 'complete', durationMs: phase.duration, metrics: phase.metrics || {} }
            : p
        ),
      }), false, 'agentPhaseComplete'),

      agentPhaseError: (phase) => set(state => ({
        agentPhases: state.agentPhases.map(p =>
          p.phaseName === phase.phase
            ? { ...p, status: 'failed', errorMessage: phase.error }
            : p
        ),
      }), false, 'agentPhaseError'),

      agentPhaseProgress: (data) => set(state => ({
        progress: { current: data.current, total: data.total, label: data.item || data.phase },
      }), false, 'agentPhaseProgress'),

      addAgentEvent: (event, data) => set(state => ({
        agentEvents: [...state.agentEvents.slice(-99), {
          event,
          data,
          timestamp: new Date().toISOString(),
        }],
      }), false, 'addAgentEvent'),

      setAgentComplete: (result) => set({
        agentStatus: 'complete',
        agentSessionId: result.sessionId,
        agentSummary: result.summary,
        agentQualityScore: result.qualityScore,
        importStatus: 'complete',
        showAgentResults: true,
        progress: { current: 1, total: 1, label: 'Complete' },
      }, false, 'setAgentComplete'),

      setAgentGraphs: (graphs) => set({ agentGraphs: graphs }, false, 'setAgentGraphs'),

      setAgentError: (error) => set({
        agentStatus: 'failed',
        importStatus: 'error',
        importError: error.message || error,
      }, false, 'setAgentError'),

      toggleAgentResults: (show) => set(state => ({
        showAgentResults: show !== undefined ? show : !state.showAgentResults,
      }), false, 'toggleAgentResults'),

      // === CATALOG INTEGRATION ACTIONS ===
      setCatalogResult: (entries, duplicates) => set({
        agentCatalogEntries: entries || [],
        agentCatalogDuplicates: duplicates || [],
      }, false, 'setCatalogResult'),

      // === ANOMALY ACTIONS ===
      setAgentAnomalies: (anomalies) => set({ agentAnomalies: anomalies || [] }, false, 'setAgentAnomalies'),
      markAnomalyTaskCreated: (anomalyId) => set(state => ({
        agentAnomalies: state.agentAnomalies.map(a =>
          a.id === anomalyId ? { ...a, hasTask: true } : a
        ),
      }), false, 'markAnomalyTaskCreated'),

      // === GNN ANALYSIS ACTIONS ===
      showGnnAnalysisPrompt: (graphData) => set({
        showGnnPrompt: true,
        ...(graphData ? { lastImportedGraphData: graphData } : {}),
      }, false, 'showGnnAnalysisPrompt'),
      hideGnnPrompt: () => set({ showGnnPrompt: false }, false, 'hideGnnPrompt'),

      setGnnOptions: (options) => set(state => ({
        gnnOptions: { ...state.gnnOptions, ...options },
      }), false, 'setGnnOptions'),

      startGnnAnalysis: () => set({
        gnnStatus: 'running',
        gnnResults: null,
        gnnError: null,
        gnnProgress: { current: 0, total: 0, phase: 'Initializing...' },
        showGnnPrompt: false,
      }, false, 'startGnnAnalysis'),

      setGnnProgress: (current, total, phase) => set({
        gnnProgress: { current, total, phase },
      }, false, 'setGnnProgress'),

      setGnnResults: (results) => set({
        gnnStatus: 'complete',
        gnnResults: results,
        gnnProgress: { current: 1, total: 1, phase: 'Complete' },
      }, false, 'setGnnResults'),

      setGnnError: (error) => set({
        gnnStatus: 'error',
        gnnError: error,
      }, false, 'setGnnError'),

      clearGnnResults: () => set({
        gnnStatus: 'idle',
        gnnResults: null,
        gnnError: null,
        gnnProgress: { current: 0, total: 0, phase: '' },
      }, false, 'clearGnnResults'),

      // === RESET ===
      reset: () => set({ ...initialState }, false, 'reset'),
    }),
    { name: 'ImportSqlStore' }
  )
);

export default useImportSqlStore;

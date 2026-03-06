import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * NEXUS Store - central state management for Graph Intelligence Hub
 *
 * Sections:
 * - mode: current operating mode (guided/explore/tasks/quick)
 * - selection: synced with ReactFlow selection
 * - visual: canvas visual effects (highlights, clusters, predictions)
 * - insights: proactive insights from Insights Engine
 * - guided: Guided Mode pipeline state
 * - gnn: GNN model status
 * - ui: UI element state (panels, modals, context menu)
 */

const initialState = {
  // === MODE ===
  mode: 'explore', // 'guided' | 'explore' | 'tasks' | 'quick'

  // === NAMESPACE ===
  namespace: 'GXE',

  // === SELECTION (synced with ReactFlow) ===
  selectedNodeIds: [],
  selectedEdgeIds: [],

  // === VISUAL STATE (affects canvas rendering) ===
  highlightedNodeIds: [],
  highlightStyle: 'glow', // 'pulse' | 'glow' | 'outline'
  highlightColor: '#6366f1',

  visualClusters: [],   // [{ id, nodeIds, color, label, opacity }]
  predictedEdges: [],   // [{ id, source, target, confidence, edgeType }]
  annotations: [],      // [{ id, nodeId, type, message }]

  // === INSIGHTS ===
  insights: [],
  insightsLoading: false,
  insightsError: null,
  insightsLastUpdated: null,

  // === GUIDED MODE ===
  guidedPhase: 'understand', // 'understand' | 'discover' | 'evaluate' | 'act'
  guidedData: {
    structuralAnalysis: null,
    candidates: [],
    selectedCandidate: null,
    evaluationResult: null,
  },

  // === GNN STATUS ===
  gnnStatus: {
    available: false,
    modelLoaded: false,
    modelQuality: null,
    lastChecked: null,
  },

  // === UI STATE ===
  resultsPanel: {
    isOpen: false,
    content: null, // 'analysis' | 'clusters' | 'predictions' | 'anomalies'
    data: null,
  },

  contextMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    context: null, // { type: 'node'|'nodes'|'edge'|'canvas', ids: [] }
  },

  aiAssistant: {
    isOpen: false,
    messages: [],
    isLoading: false,
  },

  // === SESSION ===
  currentSession: null,
  sessionSteps: [],

  // === ANALYSIS EVENTS (BottomPanel Analysis tab) ===
  analysisEvents: [],
  isAnalyzing: false,

  // === CONSOLIDATION QUEUE (bridge GuidedMode → GXE canvas) ===
  consolidationQueue: [],  // [{ nodeIds: string[], extractionResult: object }]

  // === REACTFLOW INTEGRATION ===
  fitViewToSelection: null,
};

export const useNexusStore = create(
  devtools(
    (set, get) => ({
      ...initialState,

      // === MODE ACTIONS ===
      setMode: (mode) => set({ mode }, false, 'setMode'),

      setNamespace: (namespace) => set({ namespace }, false, 'setNamespace'),

      // === SELECTION ACTIONS ===
      setSelection: (nodeIds, edgeIds = []) => set({
        selectedNodeIds: nodeIds,
        selectedEdgeIds: edgeIds,
      }, false, 'setSelection'),

      selectNodes: (nodeIds, addToSelection = false) => set((state) => ({
        selectedNodeIds: addToSelection
          ? [...new Set([...state.selectedNodeIds, ...nodeIds])]
          : nodeIds,
        selectedEdgeIds: addToSelection ? state.selectedEdgeIds : [],
      }), false, 'selectNodes'),

      clearSelection: () => set({
        selectedNodeIds: [],
        selectedEdgeIds: [],
      }, false, 'clearSelection'),

      selectAndFocus: (nodeIds) => {
        const { fitViewToSelection } = get();
        set({
          selectedNodeIds: nodeIds,
          selectedEdgeIds: []
        }, false, 'selectAndFocus');
        if (fitViewToSelection) {
          fitViewToSelection(nodeIds);
        }
      },

      // === VISUAL STATE ACTIONS ===
      setHighlight: (nodeIds, style = 'glow', color = '#6366f1') => set({
        highlightedNodeIds: nodeIds,
        highlightStyle: style,
        highlightColor: color,
      }, false, 'setHighlight'),

      clearHighlight: () => set({
        highlightedNodeIds: [],
      }, false, 'clearHighlight'),

      addVisualCluster: (cluster) => set((state) => ({
        visualClusters: [...state.visualClusters, {
          id: cluster.id || `cluster-${Date.now()}`,
          nodeIds: cluster.nodeIds,
          color: cluster.color || '#6366f1',
          label: cluster.label || '',
          opacity: cluster.opacity || 0.15,
        }],
      }), false, 'addVisualCluster'),

      removeVisualCluster: (clusterId) => set((state) => ({
        visualClusters: state.visualClusters.filter(c => c.id !== clusterId),
      }), false, 'removeVisualCluster'),

      clearVisualClusters: () => set({
        visualClusters: [],
      }, false, 'clearVisualClusters'),

      setPredictedEdges: (edges) => set({
        predictedEdges: edges.map(e => ({
          id: e.id || `pred-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          confidence: e.confidence,
          edgeType: e.edgeType || 'RELATED_TO',
        })),
      }, false, 'setPredictedEdges'),

      clearPredictedEdges: () => set({
        predictedEdges: [],
      }, false, 'clearPredictedEdges'),

      addAnnotation: (annotation) => set((state) => ({
        annotations: [...state.annotations, {
          id: annotation.id || `ann-${Date.now()}`,
          nodeId: annotation.nodeId,
          type: annotation.type,
          message: annotation.message,
        }],
      }), false, 'addAnnotation'),

      clearAnnotations: () => set({
        annotations: [],
      }, false, 'clearAnnotations'),

      // === INSIGHTS ACTIONS ===
      setInsights: (insights) => set({
        insights,
        insightsLastUpdated: new Date().toISOString(),
        insightsLoading: false,
        insightsError: null,
      }, false, 'setInsights'),

      setInsightsLoading: (loading) => set({
        insightsLoading: loading,
      }, false, 'setInsightsLoading'),

      setInsightsError: (error) => set({
        insightsError: error,
        insightsLoading: false,
      }, false, 'setInsightsError'),

      // === GUIDED MODE ACTIONS ===
      setGuidedPhase: (phase) => set({
        guidedPhase: phase,
      }, false, 'setGuidedPhase'),

      setGuidedData: (data) => set((state) => ({
        guidedData: { ...state.guidedData, ...data },
      }), false, 'setGuidedData'),

      resetGuidedMode: () => set({
        guidedPhase: 'understand',
        guidedData: {
          structuralAnalysis: null,
          candidates: [],
          selectedCandidate: null,
          evaluationResult: null,
        },
        analysisEvents: [],
        isAnalyzing: false,
        consolidationQueue: [],
      }, false, 'resetGuidedMode'),

      // === GNN STATUS ACTIONS ===
      setGnnStatus: (status) => set((state) => ({
        gnnStatus: {
          ...state.gnnStatus,
          ...status,
          lastChecked: new Date().toISOString(),
        },
      }), false, 'setGnnStatus'),

      // === UI STATE ACTIONS ===
      openResultsPanel: (content, data) => set({
        resultsPanel: { isOpen: true, content, data },
      }, false, 'openResultsPanel'),

      closeResultsPanel: () => set({
        resultsPanel: { isOpen: false, content: null, data: null },
      }, false, 'closeResultsPanel'),

      openContextMenu: (position, context) => set({
        contextMenu: { isOpen: true, position, context },
      }, false, 'openContextMenu'),

      closeContextMenu: () => set({
        contextMenu: { isOpen: false, position: { x: 0, y: 0 }, context: null },
      }, false, 'closeContextMenu'),

      toggleAIAssistant: () => set((state) => ({
        aiAssistant: { ...state.aiAssistant, isOpen: !state.aiAssistant.isOpen },
      }), false, 'toggleAIAssistant'),

      // === SESSION ACTIONS ===
      setCurrentSession: (session) => set({ currentSession: session }, false, 'setCurrentSession'),

      addSessionStep: (step) => set((state) => ({
        sessionSteps: [...state.sessionSteps, {
          ...step,
          id: `step-${state.sessionSteps.length + 1}`,
          timestamp: new Date().toISOString(),
        }],
      }), false, 'addSessionStep'),

      clearSession: () => set({
        currentSession: null,
        sessionSteps: [],
      }, false, 'clearSession'),

      // === ANALYSIS EVENT ACTIONS ===
      addAnalysisEvent: (event) => {
        const id = `aevt-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        set((state) => ({
          analysisEvents: [...state.analysisEvents, {
            id,
            timestamp: new Date().toISOString(),
            ...event,
          }],
        }), false, 'addAnalysisEvent');
        return id;
      },

      updateAnalysisEvent: (eventId, updates) => set((state) => ({
        analysisEvents: state.analysisEvents.map(e =>
          e.id === eventId ? { ...e, ...updates } : e
        ),
      }), false, 'updateAnalysisEvent'),

      setIsAnalyzing: (val) => set({ isAnalyzing: val }, false, 'setIsAnalyzing'),

      clearAnalysisEvents: () => set({
        analysisEvents: [],
        isAnalyzing: false,
      }, false, 'clearAnalysisEvents'),

      // === CONSOLIDATION QUEUE ACTIONS ===
      queueCollapse: (nodeIds, extractionResult) => set((state) => ({
        consolidationQueue: [...state.consolidationQueue, { nodeIds, extractionResult }],
      }), false, 'queueCollapse'),

      clearConsolidationQueue: () => set({
        consolidationQueue: [],
      }, false, 'clearConsolidationQueue'),

      // === REACTFLOW INTEGRATION ===
      setFitViewToSelection: (fn) => set({
        fitViewToSelection: fn,
      }, false, 'setFitViewToSelection'),

      // === UTILITY SELECTORS ===
      getSelectionType: () => {
        const { selectedNodeIds, selectedEdgeIds } = get();
        if (selectedEdgeIds.length > 0 && selectedNodeIds.length === 0) {
          return selectedEdgeIds.length === 1 ? 'edge' : 'edges';
        }
        if (selectedNodeIds.length === 0) return 'none';
        if (selectedNodeIds.length === 1) return 'node';
        return 'nodes';
      },

      getInsightsSummary: () => {
        const { insights } = get();
        return {
          total: insights.length,
          high: insights.filter(i => i.severity === 'high').length,
          medium: insights.filter(i => i.severity === 'medium').length,
          low: insights.filter(i => i.severity === 'low').length,
        };
      },

      isGnnReady: () => {
        const { gnnStatus } = get();
        return gnnStatus.available && gnnStatus.modelLoaded;
      },
    }),
    { name: 'NexusStore' }
  )
);

// Convenience selectors
export const selectMode = (state) => state.mode;
export const selectNamespace = (state) => state.namespace;
export const selectSelectedNodeIds = (state) => state.selectedNodeIds;
export const selectHighlightedNodeIds = (state) => state.highlightedNodeIds;
export const selectVisualClusters = (state) => state.visualClusters;
export const selectPredictedEdges = (state) => state.predictedEdges;
export const selectInsights = (state) => state.insights;
export const selectGnnStatus = (state) => state.gnnStatus;
export const selectResultsPanel = (state) => state.resultsPanel;
export const selectContextMenu = (state) => state.contextMenu;
export const selectAnalysisEvents = (state) => state.analysisEvents;
export const selectIsAnalyzing = (state) => state.isAnalyzing;

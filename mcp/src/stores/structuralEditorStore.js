import { create } from 'zustand';
import api from '../services/api';

const FIELD_TYPES = [
  { type: 'FIELD', dataType: 'string', label: 'Text', icon: 'Aa', color: '#3b82f6' },
  { type: 'FIELD', dataType: 'email', label: 'Email', icon: '@', color: '#06b6d4' },
  { type: 'FIELD', dataType: 'number', label: 'Number', icon: '#', color: '#f59e0b' },
  { type: 'FIELD', dataType: 'integer', label: 'Integer', icon: '1', color: '#f59e0b' },
  { type: 'FIELD', dataType: 'boolean', label: 'Boolean', icon: '?', color: '#10b981' },
  { type: 'FIELD', dataType: 'date', label: 'Date', icon: 'D', color: '#8b5cf6' },
  { type: 'FIELD', dataType: 'datetime', label: 'DateTime', icon: 'T', color: '#8b5cf6' },
  { type: 'FIELD', dataType: 'text', label: 'Textarea', icon: 'P', color: '#3b82f6' },
  { type: 'FIELD', dataType: 'url', label: 'URL', icon: 'U', color: '#06b6d4' },
  { type: 'FIELD', dataType: 'file', label: 'File', icon: 'F', color: '#ec4899' },
  { type: 'ENUM', dataType: null, label: 'Select/Enum', icon: 'L', color: '#10b981' },
  { type: 'OBJECT', dataType: null, label: 'Object', icon: '{}', color: '#6366f1' },
  { type: 'ARRAY', dataType: null, label: 'Array', icon: '[]', color: '#a855f7' },
  // DataSource-backed fields
  { type: 'FIELD', dataType: 'datasource-select', label: 'DS Select', icon: 'DS', color: '#8b5cf6',
    defaultData: { uiHints: { widget: 'select' }, dataSource: { dataSourceId: null, operation: 'loadAll' } } },
  { type: 'FIELD', dataType: 'datasource-autocomplete', label: 'DS Autocomplete', icon: 'DA', color: '#6366f1',
    defaultData: { uiHints: { widget: 'autocomplete' }, dataSource: { dataSourceId: null, operation: 'search', minSearchLength: 2, debounceMs: 300 } } },
];

let nodeCounter = 100;

const useStructuralEditorStore = create((set, get) => ({
  // ── Graph state ────────────────────────────────────────────────────────
  graphId: null,
  graphName: '',
  namespace: 'FLOWDESK',
  nodes: [],
  edges: [],

  // ── Constraint state ──────────────────────────────────────────────────
  constraintGraphId: null,
  constraintRules: [],

  // ── UI state ──────────────────────────────────────────────────────────
  selectedNodeId: null,
  isDirty: false,
  isSaving: false,
  isLoading: false,
  error: null,

  // ── History ────────────────────────────────────────────────────────────
  history: [],
  historyIndex: -1,

  // ── Constants ──────────────────────────────────────────────────────────
  FIELD_TYPES,

  // ── Selection ─────────────────────────────────────────────────────────
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  getSelectedNode: () => {
    const { nodes, selectedNodeId } = get();
    return nodes.find(n => n.id === selectedNodeId) || null;
  },

  // ── Node CRUD ──────────────────────────────────────────────────────────
  addNode: (fieldType, position) => {
    const id = `node_${++nodeCounter}`;
    const { nodes, edges } = get();

    // Merge defaultData from field type (for DataSource types)
    const defaults = fieldType.defaultData || {};
    const isDS = fieldType.dataType?.startsWith('datasource-');

    const newNode = {
      id,
      type: 'structuralField',
      position: position || { x: 250, y: (nodes.length) * 80 + 60 },
      data: {
        nodeType: fieldType.type,
        dataType: isDS ? 'string' : fieldType.dataType,
        name: `field_${nodeCounter}`,
        label: { en: fieldType.label + ' Field' },
        description: {},
        required: false,
        defaultValue: undefined,
        enumValues: fieldType.type === 'ENUM' ? ['option1', 'option2'] : undefined,
        enumLabels: {},
        uiHints: { widget: null, width: 'full', ...defaults.uiHints },
        order: nodes.length,
        ...(defaults.dataSource ? { dataSource: { ...defaults.dataSource } } : {}),
      },
    };

    // Find ROOT node for edge
    const rootNode = nodes.find(n => n.data?.nodeType === 'ROOT');
    const newEdge = rootNode ? {
      id: `edge_${rootNode.id}_${id}`,
      source: rootNode.id,
      target: id,
      type: 'smoothstep',
      animated: true,
      style: { stroke: fieldType.color || '#64748b', strokeWidth: 2 },
      data: { edgeType: 'CONTAINS' },
    } : null;

    get().pushHistory();
    set({
      nodes: [...nodes, newNode],
      edges: newEdge ? [...edges, newEdge] : edges,
      selectedNodeId: id,
      isDirty: true,
    });
  },

  updateNode: (nodeId, updates) => {
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
      ),
      isDirty: true,
    }));
  },

  removeNode: (nodeId) => {
    const { nodes, edges, selectedNodeId } = get();
    const node = nodes.find(n => n.id === nodeId);
    if (!node || node.data?.nodeType === 'ROOT') return;

    get().pushHistory();
    set({
      nodes: nodes.filter(n => n.id !== nodeId),
      edges: edges.filter(e => e.source !== nodeId && e.target !== nodeId),
      selectedNodeId: selectedNodeId === nodeId ? null : selectedNodeId,
      isDirty: true,
    });
  },

  moveNode: (nodeId, position) => {
    set(state => ({
      nodes: state.nodes.map(n => n.id === nodeId ? { ...n, position } : n),
    }));
  },

  // ── DataSource Binding ──────────────────────────────────────────────────
  updateNodeDataSource: (nodeId, dataSourceConfig) => {
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, dataSource: dataSourceConfig } } : n
      ),
      isDirty: true,
    }));
  },

  clearNodeDataSource: (nodeId) => {
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n => {
        if (n.id !== nodeId) return n;
        const { dataSource, ...restData } = n.data;
        return { ...n, data: restData };
      }),
      isDirty: true,
    }));
  },

  setNodeCascadingDependency: (nodeId, dependsOn) => {
    get().pushHistory();
    set(state => ({
      nodes: state.nodes.map(n => {
        if (n.id !== nodeId || !n.data.dataSource) return n;
        return { ...n, data: { ...n.data, dataSource: { ...n.data.dataSource, dependsOn } } };
      }),
      isDirty: true,
    }));
  },

  reorderFields: (fromIndex, toIndex) => {
    get().pushHistory();
    set(state => {
      const fieldNodes = state.nodes.filter(n => n.data?.nodeType !== 'ROOT');
      const rootNodes = state.nodes.filter(n => n.data?.nodeType === 'ROOT');
      const moved = fieldNodes.splice(fromIndex, 1)[0];
      fieldNodes.splice(toIndex, 0, moved);
      const reordered = fieldNodes.map((n, i) => ({ ...n, data: { ...n.data, order: i } }));
      return { nodes: [...rootNodes, ...reordered], isDirty: true };
    });
  },

  // ── Constraint CRUD ───────────────────────────────────────────────────
  addConstraintRule: (rule) => {
    set(state => ({
      constraintRules: [...state.constraintRules, { ...rule, nodeId: `rule_${++nodeCounter}` }],
      isDirty: true,
    }));
  },

  updateConstraintRule: (nodeId, updates) => {
    set(state => ({
      constraintRules: state.constraintRules.map(r => r.nodeId === nodeId ? { ...r, ...updates } : r),
      isDirty: true,
    }));
  },

  removeConstraintRule: (nodeId) => {
    set(state => ({
      constraintRules: state.constraintRules.filter(r => r.nodeId !== nodeId),
      isDirty: true,
    }));
  },

  // ── History ────────────────────────────────────────────────────────────
  pushHistory: () => {
    const { nodes, edges, constraintRules, history, historyIndex } = get();
    const snapshot = JSON.stringify({ nodes, edges, constraintRules });
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(snapshot);
    if (newHistory.length > 50) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;
    const prev = JSON.parse(history[historyIndex - 1]);
    set({ ...prev, historyIndex: historyIndex - 1, isDirty: true });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    const next = JSON.parse(history[historyIndex + 1]);
    set({ ...next, historyIndex: historyIndex + 1, isDirty: true });
  },

  // ── Persistence ────────────────────────────────────────────────────────
  loadGraph: async (graphId) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get(`/structural/${graphId}`);
      const graph = data.data;

      // Convert structural nodes → ReactFlow nodes
      const rfNodes = [];
      const rfEdges = [];

      for (const node of (graph.nodes || [])) {
        rfNodes.push({
          id: node.nodeId,
          type: node.nodeType === 'ROOT' ? 'structuralRoot' : 'structuralField',
          position: node.position || { x: 250, y: rfNodes.length * 80 },
          data: { ...node },
        });
      }

      for (const edge of (graph.edges || [])) {
        rfEdges.push({
          id: edge.edgeId || `${edge.source}_${edge.target}`,
          source: edge.source,
          target: edge.target,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#64748b', strokeWidth: 2 },
          data: { edgeType: edge.edgeType },
        });
      }

      // Load constraints
      let constraintRules = [];
      let constraintGraphId = null;
      try {
        const cRes = await api.get(`/structural/${graphId}/constraints`);
        if (cRes.data.data) {
          constraintGraphId = cRes.data.data.graphId;
          constraintRules = cRes.data.data.nodes || [];
        }
      } catch { /* no constraints */ }

      set({
        graphId, graphName: graph.name, namespace: graph.namespace,
        nodes: rfNodes, edges: rfEdges,
        constraintGraphId, constraintRules,
        isDirty: false, isLoading: false, selectedNodeId: null,
        history: [], historyIndex: -1,
      });
    } catch (error) {
      set({ error: error.message, isLoading: false });
    }
  },

  saveGraph: async () => {
    const { graphId, graphName, namespace, nodes, edges, constraintRules, constraintGraphId } = get();
    set({ isSaving: true, error: null });

    try {
      // Convert ReactFlow nodes → structural nodes
      const structuralNodes = nodes.map(n => ({
        ...n.data,
        nodeId: n.id,
        position: n.position,
      }));
      const structuralEdges = edges.map(e => ({
        edgeId: e.id,
        source: e.source,
        target: e.target,
        edgeType: e.data?.edgeType || 'CONTAINS',
      }));

      if (graphId) {
        await api.put(`/structural/${graphId}`, {
          name: graphName, namespace, nodes: structuralNodes, edges: structuralEdges,
        });
      } else {
        const res = await api.post('/structural', {
          name: graphName, namespace, nodes: structuralNodes, edges: structuralEdges,
        });
        set({ graphId: res.data.data.graphId });
      }

      // Save constraints
      if (constraintRules.length > 0) {
        const cRes = await api.put(`/structural/${graphId || get().graphId}/constraints`, {
          graphId: constraintGraphId,
          nodes: constraintRules,
          edges: [],
        });
        set({ constraintGraphId: cRes.data.data.graphId });
      }

      set({ isDirty: false, isSaving: false });
    } catch (error) {
      set({ error: error.message, isSaving: false });
    }
  },

  newGraph: (name = 'New Form', namespace = 'FLOWDESK') => {
    const rootId = 'root_1';
    set({
      graphId: null,
      graphName: name,
      namespace,
      nodes: [{
        id: rootId,
        type: 'structuralRoot',
        position: { x: 250, y: 20 },
        data: { nodeType: 'ROOT', name, label: { en: name } },
      }],
      edges: [],
      constraintGraphId: null,
      constraintRules: [],
      selectedNodeId: null,
      isDirty: false,
      error: null,
      history: [],
      historyIndex: -1,
    });
  },

  // ── Export ──────────────────────────────────────────────────────────────
  toJSON: () => {
    const { graphId, graphName, namespace, nodes, edges, constraintRules } = get();
    return {
      graphId, name: graphName, namespace, graphType: 'STRUCTURAL',
      nodes: nodes.map(n => ({ ...n.data, nodeId: n.id })),
      edges: edges.map(e => ({ edgeId: e.id, source: e.source, target: e.target, edgeType: e.data?.edgeType })),
      constraints: constraintRules,
    };
  },
}));

export default useStructuralEditorStore;

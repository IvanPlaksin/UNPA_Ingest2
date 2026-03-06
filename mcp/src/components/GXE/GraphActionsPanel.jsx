/**
 * GraphActionsPanel — Floating toolbar for graph-level operations.
 *
 * Dual-mode: collapsed icon column (~56px) or expanded with params/results (~340px).
 * Uses FloatingWindow as the shell.
 *
 * Categories:
 *   - Search & Discovery   (blue)
 *   - Subgraph Operations  (green)
 *   - Analysis             (purple)
 *   - Checkpoints          (amber)
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Search, Radar, FolderSearch,
  Scissors, Grid3X3, Copy,
  ScanLine, Network,
  PackageCheck, History, Undo2,
  Loader2, X, ChevronRight, ChevronLeft, Zap,
  Sparkles, GitBranch, Tags, Users,
} from 'lucide-react';
import FloatingWindow from './FloatingWindow';
import {
  analyzeStructure,
  segmentGraph,
  extractSubgraph,
  consolidateSubgraph,
  rollbackSubgraph,
  listCheckpoints,
  hybridSearch,
} from '../../services/subgraph.service';
import { listGraphs, cloneGraph } from '../../services/graphCatalog.service';
import gnnService from '../../services/gnn.service';
import useImportSqlStore from '../../stores/importSqlStore';

// ── Action Definitions ─────────────────────────────────────────

const ACTION_CATEGORIES = [
  {
    id: 'search',
    label: 'Search',
    color: '#58a6ff',
    actions: [
      { id: 'searchCatalog', icon: FolderSearch, label: 'Search Catalog', needsSelection: false, needsParams: true },
      { id: 'hybridSearch', icon: Radar, label: 'Hybrid RAG Search', needsSelection: false, needsParams: true },
      { id: 'findSimilar', icon: Search, label: 'Find Similar Graphs', needsSelection: false, needsParams: true },
    ],
  },
  {
    id: 'subgraph',
    label: 'Subgraph',
    color: '#3fb950',
    actions: [
      { id: 'extract', icon: Scissors, label: 'Extract Subgraph', needsSelection: true, needsParams: true },
      { id: 'segment', icon: Grid3X3, label: 'Auto-Segment', needsSelection: false, needsParams: false },
      { id: 'clone', icon: Copy, label: 'Clone Current Graph', needsSelection: false, needsParams: false },
    ],
  },
  {
    id: 'analysis',
    label: 'Analysis',
    color: '#bc8cff',
    actions: [
      { id: 'analyze', icon: ScanLine, label: 'Structural Analysis', needsSelection: false, needsParams: false },
      { id: 'communities', icon: Network, label: 'Detect Communities', needsSelection: false, needsParams: false },
    ],
  },
  {
    id: 'checkpoints',
    label: 'Checkpoints',
    color: '#d29922',
    actions: [
      { id: 'consolidate', icon: PackageCheck, label: 'Consolidate', needsSelection: false, needsParams: false },
      { id: 'listCheckpoints', icon: History, label: 'Checkpoints', needsSelection: false, needsParams: false },
      { id: 'rollback', icon: Undo2, label: 'Rollback', needsSelection: false, needsParams: true },
    ],
  },
  {
    id: 'gnn',
    label: 'GNN',
    color: '#a855f7',
    actions: [
      { id: 'gnn_predict_links', icon: GitBranch, label: 'Predict Links', needsSelection: false, needsParams: false },
      { id: 'gnn_classify_nodes', icon: Tags, label: 'Classify Nodes', needsSelection: false, needsParams: false },
      { id: 'gnn_detect_communities', icon: Users, label: 'Detect Communities', needsSelection: false, needsParams: false },
      { id: 'gnn_full_analysis', icon: Sparkles, label: 'Full GNN Analysis', needsSelection: false, needsParams: false },
    ],
  },
];

// ── Tooltip ────────────────────────────────────────────────────

const Tooltip = ({ text, disabled, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 whitespace-nowrap
                        bg-[#0d1117] border border-[#30363d] text-[#e6edf3] text-[11px] px-2 py-1 rounded shadow-lg z-[60]">
          {text}{disabled && <span className="text-gray-500 ml-1">(select nodes)</span>}
        </div>
      )}
    </div>
  );
};

// ── Parameter Forms ────────────────────────────────────────────

const SearchForm = ({ params, onChange, label }) => (
  <div className="space-y-2">
    <label className="text-[11px] text-gray-400 block">{label || 'Query'}</label>
    <input
      type="text"
      value={params.query || ''}
      onChange={e => onChange({ ...params, query: e.target.value })}
      placeholder="Search text..."
      className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] focus:border-[#58a6ff] outline-none"
      autoFocus
    />
  </div>
);

const ExtractForm = ({ params, onChange, selectedCount }) => (
  <div className="space-y-2">
    <div className="text-[11px] text-gray-400">
      <span className="text-[#3fb950] font-medium">{selectedCount}</span> nodes selected
    </div>
    <label className="text-[11px] text-gray-400 block">Subgraph name</label>
    <input
      type="text"
      value={params.name || ''}
      onChange={e => onChange({ ...params, name: e.target.value })}
      placeholder="My Subgraph"
      className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e6edf3] focus:border-[#3fb950] outline-none"
      autoFocus
    />
  </div>
);

const RollbackForm = ({ checkpoints, onSelect }) => (
  <div className="space-y-1">
    <label className="text-[11px] text-gray-400 block">Select checkpoint</label>
    {(!checkpoints || checkpoints.length === 0) ? (
      <p className="text-[11px] text-gray-500 italic">No checkpoints found</p>
    ) : (
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {checkpoints.map((cp, i) => (
          <button
            key={cp.id || i}
            onClick={() => onSelect(cp.id)}
            className="w-full text-left px-2 py-1.5 rounded text-[11px] bg-[#0d1117] border border-[#30363d] hover:border-[#d29922] text-[#e6edf3] truncate"
          >
            {cp.id} <span className="text-gray-500">{cp.status}</span>
          </button>
        ))}
      </div>
    )}
  </div>
);

// ── Result Renderers ───────────────────────────────────────────

const ResultDisplay = ({ result }) => {
  if (!result) return null;

  if (!result.success) {
    return (
      <div className="mt-2 p-2 rounded bg-red-900/20 border border-red-900/40 text-[11px] text-red-300">
        {result.error || 'Unknown error'}
      </div>
    );
  }

  const data = result.data;

  // Analysis result
  if (result.actionId === 'analyze' && data) {
    return (
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="text-gray-400">Structural Analysis</div>
        {data.density != null && <div>Density: <span className="text-[#58a6ff]">{(data.density * 100).toFixed(1)}%</span></div>}
        {data.nodeCount != null && <div>Nodes: <span className="text-[#e6edf3]">{data.nodeCount}</span></div>}
        {data.edgeCount != null && <div>Edges: <span className="text-[#e6edf3]">{data.edgeCount}</span></div>}
        {data.avgDegree != null && <div>Avg degree: <span className="text-[#e6edf3]">{data.avgDegree?.toFixed(2)}</span></div>}
        {data.components != null && <div>Components: <span className="text-[#e6edf3]">{data.components}</span></div>}
        {data.anomalies?.length > 0 && (
          <div className="mt-1">
            <span className="text-[#d29922]">{data.anomalies.length} anomalies</span>
          </div>
        )}
      </div>
    );
  }

  // Segment / Communities result
  if ((result.actionId === 'segment' || result.actionId === 'communities') && data) {
    const candidates = data.candidates || data.clusters || [];
    return (
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="text-gray-400">
          {candidates.length} clusters found
          {data.method && <span className="text-gray-500 ml-1">({data.method})</span>}
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {candidates.slice(0, 10).map((c, i) => (
            <div key={i} className="px-2 py-1 bg-[#0d1117] rounded border border-[#30363d] text-[#e6edf3]">
              <span className="text-[#3fb950]">{c.nodeCount || c.nodes?.length || 0}</span> nodes
              {c.name && <span className="text-gray-400 ml-2">{c.name}</span>}
              {c.coherence != null && <span className="text-gray-500 ml-1">({(c.coherence * 100).toFixed(0)}%)</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Search results
  if ((result.actionId === 'searchCatalog' || result.actionId === 'findSimilar') && data) {
    const items = data.data || data.graphs || data || [];
    const list = Array.isArray(items) ? items : [];
    return (
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="text-gray-400">{list.length} results</div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {list.slice(0, 10).map((g, i) => (
            <div key={i} className="px-2 py-1 bg-[#0d1117] rounded border border-[#30363d] text-[#e6edf3] truncate">
              {g.name || g.id || 'Untitled'}
              <span className="text-gray-500 ml-1 text-[10px]">{g.type || ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Hybrid search results
  if (result.actionId === 'hybridSearch' && data) {
    const results = data.results || [];
    return (
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="text-gray-400">{results.length} matches</div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {results.slice(0, 10).map((r, i) => (
            <div key={i} className="px-2 py-1 bg-[#0d1117] rounded border border-[#30363d] text-[#e6edf3] truncate">
              {r.nodeId || r.id || r.title || 'Node'}
              {r.score != null && <span className="text-[#58a6ff] ml-1">{(r.score * 100).toFixed(0)}%</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Checkpoints
  if (result.actionId === 'listCheckpoints' && data) {
    const cps = Array.isArray(data) ? data : data.checkpoints || [];
    return (
      <div className="mt-2 space-y-1 text-[11px]">
        <div className="text-gray-400">{cps.length} checkpoints</div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {cps.map((cp, i) => (
            <div key={i} className="px-2 py-1 bg-[#0d1117] rounded border border-[#30363d] text-[#e6edf3] truncate">
              {cp.id} <span className="text-gray-500">{cp.status} {cp.createdAt}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Generic success
  return (
    <div className="mt-2 p-2 rounded bg-green-900/20 border border-green-900/40 text-[11px] text-green-300">
      Done {data?.status && `— ${data.status}`}
      {data?.subgraphId && <div className="text-gray-400 mt-1">SubGraph: {data.subgraphId}</div>}
      {data?.checkpointId && <div className="text-gray-400 mt-1">Checkpoint: {data.checkpointId}</div>}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────

const GraphActionsPanel = ({
  namespace = 'default',
  catalogGraphId,
  selectedNodes = [],
  nodes = [],
  edges = [],
  onGraphRefresh,
}) => {
  const [activeAction, setActiveAction] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [params, setParams] = useState({});
  const [checkpointList, setCheckpointList] = useState([]);

  // ── Action Handlers ──────────────────────────────────────────

  const executeAction = useCallback(async (actionId, actionParams = {}) => {
    setLoading(true);
    setActionResult(null);
    try {
      let result;
      switch (actionId) {
        case 'searchCatalog':
          result = await listGraphs({ search: actionParams.query, namespace });
          break;
        case 'hybridSearch':
          result = await hybridSearch(actionParams.query || '', actionParams.topK || 10);
          break;
        case 'findSimilar':
          result = await listGraphs({ search: actionParams.query, namespace });
          break;
        case 'extract':
          result = await extractSubgraph(namespace, selectedNodes, actionParams.name || 'SubGraph');
          onGraphRefresh?.();
          break;
        case 'segment':
          result = await segmentGraph(namespace);
          break;
        case 'clone':
          if (catalogGraphId) {
            result = await cloneGraph(catalogGraphId, {});
            onGraphRefresh?.();
          } else {
            throw new Error('Save graph to catalog first');
          }
          break;
        case 'analyze':
          result = await analyzeStructure(namespace);
          break;
        case 'communities':
          result = await segmentGraph(namespace, { strategies: ['community'] });
          break;
        case 'consolidate':
          // Uses namespace — requires a subgraph to be selected in context
          result = await consolidateSubgraph(null, namespace);
          onGraphRefresh?.();
          break;
        case 'listCheckpoints':
          result = await listCheckpoints(namespace);
          setCheckpointList(Array.isArray(result) ? result : result?.checkpoints || []);
          break;
        case 'rollback':
          if (actionParams.checkpointId) {
            result = await rollbackSubgraph(actionParams.checkpointId);
            onGraphRefresh?.();
          } else {
            // Load checkpoints first
            const cps = await listCheckpoints(namespace);
            setCheckpointList(Array.isArray(cps) ? cps : cps?.checkpoints || []);
            setLoading(false);
            return; // wait for user to select checkpoint
          }
          break;
        // GNN actions
        case 'gnn_predict_links': {
          const store = useImportSqlStore.getState();
          store.startGnnAnalysis();
          result = await gnnService.analyzeImportedGraph(
            { nodes, edges },
            { linkPrediction: true, nodeClassification: false, communityDetection: false },
            (c, t, p) => store.setGnnProgress(c, t, p),
          );
          store.setGnnResults(result);
          break;
        }
        case 'gnn_classify_nodes': {
          const store = useImportSqlStore.getState();
          store.startGnnAnalysis();
          result = await gnnService.analyzeImportedGraph(
            { nodes, edges },
            { linkPrediction: false, nodeClassification: true, communityDetection: false },
            (c, t, p) => store.setGnnProgress(c, t, p),
          );
          store.setGnnResults(result);
          break;
        }
        case 'gnn_detect_communities': {
          const store = useImportSqlStore.getState();
          store.startGnnAnalysis();
          result = await gnnService.analyzeImportedGraph(
            { nodes, edges },
            { linkPrediction: false, nodeClassification: false, communityDetection: true },
            (c, t, p) => store.setGnnProgress(c, t, p),
          );
          store.setGnnResults(result);
          break;
        }
        case 'gnn_full_analysis': {
          const store = useImportSqlStore.getState();
          store.startGnnAnalysis();
          result = await gnnService.analyzeImportedGraph(
            { nodes, edges },
            { linkPrediction: true, nodeClassification: true, communityDetection: true },
            (c, t, p) => store.setGnnProgress(c, t, p),
          );
          store.setGnnResults(result);
          break;
        }
        default:
          throw new Error(`Unknown action: ${actionId}`);
      }
      setActionResult({ actionId, data: result, success: true });
    } catch (err) {
      setActionResult({ actionId, error: err.response?.data?.error || err.message, success: false });
    } finally {
      setLoading(false);
    }
  }, [namespace, catalogGraphId, selectedNodes, nodes, edges, onGraphRefresh]);

  const handleActionClick = useCallback((action) => {
    if (action.needsSelection && selectedNodes.length === 0) return;

    if (activeAction?.id === action.id) {
      // Toggle off
      setActiveAction(null);
      setExpanded(false);
      setActionResult(null);
      setParams({});
      return;
    }

    setActiveAction(action);
    setActionResult(null);
    setParams({});

    if (action.needsParams) {
      setExpanded(true);
      // For rollback, preload checkpoints
      if (action.id === 'rollback') {
        listCheckpoints(namespace).then(cps => {
          setCheckpointList(Array.isArray(cps) ? cps : cps?.checkpoints || []);
        }).catch(() => setCheckpointList([]));
      }
    } else {
      setExpanded(true);
      executeAction(action.id);
    }
  }, [activeAction, selectedNodes, executeAction, namespace]);

  const handleSubmit = useCallback(() => {
    if (activeAction) executeAction(activeAction.id, params);
  }, [activeAction, params, executeAction]);

  // ── Render ───────────────────────────────────────────────────

  return (
    <FloatingWindow
      storageKey="gxe-graph-actions"
      title="Actions"
      icon={<Zap className="w-3.5 h-3.5" />}
      defaultPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 380 : 600, y: 280 }}
      defaultSize={{ width: 340, height: 520 }}
      minSize={{ width: 200, height: 200 }}
      zIndex={45}
      headerExtra={
        expanded ? (
          <button
            onClick={() => { setExpanded(false); setActiveAction(null); setActionResult(null); }}
            className="p-1 hover:bg-[#30363d] rounded text-gray-400"
            title="Close action panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : null
      }
    >
      <div className="flex h-full">
        {/* Icon Column */}
        <div className="flex flex-col py-1 w-[54px] flex-shrink-0">
          {ACTION_CATEGORIES.map((cat, ci) => (
            <React.Fragment key={cat.id}>
              {ci > 0 && <div className="border-t border-[#30363d] my-1 mx-2" />}
              {cat.actions.map(action => {
                const Icon = action.icon;
                const isActive = activeAction?.id === action.id;
                const isDisabled = action.needsSelection && selectedNodes.length === 0;
                const isLoading = loading && isActive;

                return (
                  <Tooltip key={action.id} text={action.label} disabled={isDisabled}>
                    <button
                      onClick={() => handleActionClick(action)}
                      disabled={isDisabled}
                      className={`
                        w-10 h-10 mx-auto my-0.5 flex items-center justify-center rounded-lg transition-colors
                        ${isActive
                          ? 'bg-[#30363d]'
                          : 'hover:bg-[#21262d]'}
                        ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                      `}
                      style={isActive ? { boxShadow: `inset 0 0 0 1px ${cat.color}40` } : {}}
                    >
                      {isLoading
                        ? <Loader2 className="w-5 h-5 animate-spin" style={{ color: cat.color }} />
                        : <Icon className="w-5 h-5" style={{ color: isActive ? cat.color : '#8b949e' }} />
                      }
                    </button>
                  </Tooltip>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Right Panel */}
        {!expanded && (
          <div className="flex-1 border-l border-[#30363d] flex items-center justify-center p-3">
            <p className="text-[11px] text-gray-600 text-center leading-relaxed">
              Select an action<br />from the toolbar
            </p>
          </div>
        )}
        {expanded && (
          <div className="flex-1 border-l border-[#30363d] p-3 overflow-y-auto min-w-0">
            {activeAction && (
              <>
                <div className="flex items-center gap-2 mb-3">
                  {React.createElement(activeAction.icon, { className: 'w-4 h-4 text-gray-400' })}
                  <span className="text-xs font-medium text-[#e6edf3]">{activeAction.label}</span>
                </div>

                {/* Parameter Forms */}
                {activeAction.id === 'searchCatalog' && (
                  <SearchForm params={params} onChange={setParams} label="Search graphs" />
                )}
                {activeAction.id === 'hybridSearch' && (
                  <SearchForm params={params} onChange={setParams} label="Semantic query" />
                )}
                {activeAction.id === 'findSimilar' && (
                  <SearchForm params={params} onChange={setParams} label="Pattern query" />
                )}
                {activeAction.id === 'extract' && (
                  <ExtractForm params={params} onChange={setParams} selectedCount={selectedNodes.length} />
                )}
                {activeAction.id === 'rollback' && (
                  <RollbackForm
                    checkpoints={checkpointList}
                    onSelect={(cpId) => {
                      setParams({ checkpointId: cpId });
                      executeAction('rollback', { checkpointId: cpId });
                    }}
                  />
                )}

                {/* Execute button (for param-based actions) */}
                {activeAction.needsParams && activeAction.id !== 'rollback' && (
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="mt-3 w-full py-1.5 rounded text-xs font-medium bg-[#21262d] border border-[#30363d]
                               hover:bg-[#30363d] text-[#e6edf3] disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Execute
                  </button>
                )}

                {/* Results */}
                <ResultDisplay result={actionResult} />
              </>
            )}
          </div>
        )}
      </div>
    </FloatingWindow>
  );
};

export default GraphActionsPanel;

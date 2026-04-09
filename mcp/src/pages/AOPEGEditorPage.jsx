/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG Editor Page
 * Page component for the AOPEG graph editor
 * With Immutable Graph integration for bi-temporal versioned graphs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  FolderOpen,
  Trash2,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Settings,
  BarChart3,
  Database,
  GitBranch,
  Shield
} from 'lucide-react';
import { useGraphCatalog, useGodMode } from '../hooks/useImmutableGraph';

// Import GraphEditor component
// Note: You may need to adjust this import based on your build configuration
const GraphEditor = React.lazy(() => import('../components/AOPEG/GraphEditor'));

// ────────────────────────────────────────────────────────────────────────────
// GRAPH LIST VIEW
// ────────────────────────────────────────────────────────────────────────────

const GraphListView = ({ onSelectGraph, onCreateNew }) => {
  const [graphs, setGraphs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ domain: '', status: '' });
  const [activeTab, setActiveTab] = useState('aopeg'); // 'aopeg' | 'immutable'

  // Immutable Graph hooks
  const { graphs: immutableGraphs, loading: immutableLoading, error: immutableError, refetch: refetchImmutable } = useGraphCatalog({
    namespace: 'PROJECT',
    nodeType: 'ExecutionGraph'
  });
  const { isActive: godModeActive } = useGodMode();

  useEffect(() => {
    if (activeTab === 'aopeg') {
      fetchGraphs();
    }
  }, [filter, activeTab]);

  const fetchGraphs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.domain) params.set('domain', filter.domain);
      if (filter.status) params.set('status', filter.status);

      const response = await fetch(`/api/v1/aopeg/graphs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setGraphs(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch graphs:', error);
    } finally {
      setLoading(false);
    }
  };

  const currentGraphs = activeTab === 'aopeg' ? graphs : immutableGraphs;
  const isLoading = activeTab === 'aopeg' ? loading : immutableLoading;

  const handleDelete = async (graphId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this graph?')) return;

    try {
      const response = await fetch(`/api/v1/aopeg/graphs/${graphId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchGraphs();
      }
    } catch (error) {
      console.error('Failed to delete graph:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-400 bg-green-500/20 border border-green-500/30';
      case 'DRAFT': return 'text-amber-400 bg-amber-500/20 border border-amber-500/30';
      case 'ARCHIVED': return 'text-[#6e7681] bg-[#21262d] border border-[#30363d]';
      default: return 'text-[#6e7681] bg-[#21262d] border border-[#30363d]';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Header */}
      <div className="p-6 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#f0f6fc]">AOPEG Graphs</h1>
            <p className="text-sm text-[#8b949e] mt-1">
              AI-Orchestrated Pipeline Execution Graphs
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* God Mode Indicator */}
            {godModeActive && (
              <span className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 bg-red-500/20 border border-red-500/30 rounded animate-pulse">
                <Shield className="w-3 h-3" />
                GOD MODE
              </span>
            )}
            <button
              onClick={onCreateNew}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Graph
            </button>
          </div>
        </div>

        {/* Source Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('aopeg')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === 'aopeg'
                ? 'bg-[#388bfd] text-white'
                : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#30363d]'}`}
          >
            <Database className="w-4 h-4" />
            AOPEG Graphs
          </button>
          <button
            onClick={() => setActiveTab('immutable')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === 'immutable'
                ? 'bg-[#388bfd] text-white'
                : 'bg-[#21262d] text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#30363d]'}`}
          >
            <GitBranch className="w-4 h-4" />
            Versioned Graphs
            <span className="px-1.5 py-0.5 text-xs bg-purple-500/30 text-purple-300 rounded">
              Immutable
            </span>
          </button>
        </div>

        {/* Filters (only for AOPEG tab) */}
        {activeTab === 'aopeg' && (
          <div className="flex gap-4">
            <select
              value={filter.domain}
              onChange={(e) => setFilter({ ...filter, domain: e.target.value })}
              className="px-3 py-2 bg-[#21262d] border border-[#30363d] rounded-md text-sm text-[#f0f6fc]
                         focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent"
            >
              <option value="">All Domains</option>
              <option value="common">Common</option>
              <option value="ai">AI</option>
              <option value="ingestion">Ingestion</option>
              <option value="rag">RAG</option>
              <option value="validation">Validation</option>
            </select>

            <select
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
              className="px-3 py-2 bg-[#21262d] border border-[#30363d] rounded-md text-sm text-[#f0f6fc]
                         focus:outline-none focus:ring-2 focus:ring-[#388bfd] focus:border-transparent"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>
        )}

        {/* Immutable Graph info */}
        {activeTab === 'immutable' && (
          <div className="flex items-center gap-4 text-sm text-[#8b949e]">
            <span>Bi-temporal versioned graphs with full audit trail</span>
            {immutableError && (
              <span className="text-red-400">Error: {immutableError}</span>
            )}
            <button
              onClick={refetchImmutable}
              className="px-2 py-1 text-xs bg-[#21262d] border border-[#30363d] rounded hover:bg-[#30363d] transition-colors"
            >
              Refresh
            </button>
          </div>
        )}
      </div>

      {/* Graph List */}
      <div className="flex-1 overflow-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-[#30363d] border-t-blue-500 rounded-full" />
          </div>
        ) : currentGraphs.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-16 h-16 mx-auto text-[#30363d] mb-4" />
            <h3 className="text-lg font-medium text-[#f0f6fc]">No graphs found</h3>
            <p className="text-sm text-[#8b949e] mt-1">
              {activeTab === 'aopeg'
                ? 'Create your first graph to get started'
                : 'No versioned graphs in the immutable graph store'}
            </p>
            <button
              onClick={onCreateNew}
              className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Create Graph
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentGraphs.map((graph) => (
              <div
                key={graph.id || graph.entityId}
                onClick={() => onSelectGraph(graph.id || graph.entityId)}
                className="relative p-4 bg-[#21262d] border border-[#30363d] rounded-lg
                           hover:border-[#388bfd] hover:shadow-lg hover:shadow-black/30
                           cursor-pointer transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-medium text-[#f0f6fc] truncate flex-1">
                    {graph.name}
                  </h3>
                  <div className="flex items-center gap-1">
                    {activeTab === 'immutable' && (
                      <span className="px-1.5 py-0.5 text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded">
                        v{graph.version || graph.sequenceNumber || 1}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded ${getStatusColor(graph.status)}`}>
                      {graph.status}
                    </span>
                  </div>
                </div>

                {graph.description && (
                  <p className="text-sm text-[#8b949e] mb-3 line-clamp-2">
                    {graph.description}
                  </p>
                )}

                <div className="flex items-center gap-4 text-xs text-[#6e7681]">
                  <span className="flex items-center gap-1">
                    <Settings className="w-3 h-3" />
                    {graph.nodes?.length || graph.nodeCount || 0} nodes
                  </span>
                  <span>{graph.domain || graph.namespace}</span>
                  {graph.executionStats && (
                    <span className="flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" />
                      {graph.executionStats.totalExecutions} runs
                    </span>
                  )}
                  {activeTab === 'immutable' && graph.createdAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(graph.createdAt).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Delete button (hidden until hover) - only for AOPEG or when God Mode active */}
                {(activeTab === 'aopeg' || godModeActive) && (
                  <button
                    onClick={(e) => handleDelete(graph.id || graph.entityId, e)}
                    className="absolute top-2 right-2 p-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded
                               opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/30"
                    title={activeTab === 'immutable' ? 'Requires God Mode' : 'Delete graph'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ────────────────────────────────────────────────────────────────────────────

const AOPEGEditorPage = () => {
  const { graphId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [view, setView] = useState(graphId ? 'editor' : 'list');

  useEffect(() => {
    if (graphId) {
      setView('editor');
    } else {
      setView('list');
    }
  }, [graphId]);

  const handleSelectGraph = (id) => {
    navigate(`/aopeg/${id}`);
  };

  const handleCreateNew = () => {
    navigate('/aopeg/new');
  };

  const handleBack = () => {
    navigate('/aopeg');
  };

  const handleGraphSaved = (graph) => {
    if (!graphId || graphId === 'new') {
      navigate(`/aopeg/${graph.id}`, { replace: true });
    }
  };

  return (
    <div className="flex flex-col bg-[#0d1117]" style={{ height: '100%', width: '100%' }}>
      {view === 'editor' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-[#8b949e] hover:text-[#f0f6fc] hover:bg-[#21262d] rounded transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to List
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {view === 'list' ? (
          <GraphListView
            onSelectGraph={handleSelectGraph}
            onCreateNew={handleCreateNew}
          />
        ) : (
          <React.Suspense
            fallback={
              <div className="flex items-center justify-center h-full bg-[#0d1117]">
                <div className="animate-spin w-8 h-8 border-2 border-[#30363d] border-t-blue-500 rounded-full" />
              </div>
            }
          >
            <GraphEditor
              graphId={graphId === 'new' ? undefined : graphId}
              onGraphSaved={handleGraphSaved}
            />
          </React.Suspense>
        )}
      </div>
    </div>
  );
};

export default AOPEGEditorPage;

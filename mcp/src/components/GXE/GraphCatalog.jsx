/**
 * GraphCatalog Component
 * Tree view of ALL graphs in the knowledge DB, grouped by namespace.
 * Versioned graphs show a collapsible tree: top-level = Production (or latest),
 * children = previous versions sorted descending.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, Search, Trash2, Copy,
  Folder, FolderOpen, X, RefreshCw, AlertTriangle,
  Atom, Wrench, Briefcase, Layers, FileCode, Save,
  PanelLeftClose, PanelLeftOpen, Database, Check, ChevronsUpDown,
  GitBranch, Shield
} from 'lucide-react';
import {
  listGraphs,
  getGraphById,
  deleteGraph,
  cloneGraph,
  getNamespaces
} from '../../services/graphCatalog.service';
import SaveGraphDialog from './SaveGraphDialog';

// Icon mapping for graph types
const TYPE_ICONS = {
  atomic: Atom,
  tool: Wrench,
  business: Briefcase,
  composite: Layers,
  template: FileCode
};

// Color mapping for graph types
const TYPE_COLORS = {
  atomic: 'text-cyan-400',
  tool: 'text-green-400',
  business: 'text-blue-400',
  composite: 'text-purple-400',
  template: 'text-orange-400'
};

// Badge bg for graph types
const TYPE_BG = {
  atomic: 'bg-cyan-500/15 text-cyan-400',
  tool: 'bg-green-500/15 text-green-400',
  business: 'bg-blue-500/15 text-blue-400',
  composite: 'bg-purple-500/15 text-purple-400',
  template: 'bg-orange-500/15 text-orange-400'
};

/**
 * Namespace Multiselect Dropdown
 */
const NamespaceFilter = ({
  namespaces,
  selectedNamespaces,
  onToggleNamespace,
  onSelectAll,
  onClearAll
}) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const total = namespaces.length;
  const selected = selectedNamespaces.size;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 bg-[#161b22] border rounded-lg text-sm transition-colors ${
          open ? 'border-blue-500 text-white' : 'border-[#30363d] text-gray-300 hover:border-[#484f58]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Folder className="w-4 h-4 text-gray-500 shrink-0" />
          <span className="truncate">Namespaces</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs px-1.5 py-0.5 bg-[#21262d] rounded text-gray-400">
            {selected}/{total}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-gray-500" />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[#30363d]">
            <button onClick={onSelectAll} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
              Select All
            </button>
            <button onClick={onClearAll} className="text-xs text-gray-500 hover:text-gray-400 transition-colors">
              Clear All
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {namespaces.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-500">No namespaces found</div>
            ) : (
              namespaces.map(ns => {
                const isSelected = selectedNamespaces.has(ns.namespace);
                return (
                  <button
                    key={ns.namespace}
                    onClick={() => onToggleNamespace(ns.namespace)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-sm transition-colors ${
                      isSelected ? 'bg-blue-500/10 text-white' : 'text-gray-400 hover:bg-[#21262d] hover:text-gray-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      isSelected ? 'bg-blue-500 border-blue-500' : 'border-[#484f58]'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="flex-1 text-left truncate">{ns.namespace}</span>
                    <span className="text-xs text-gray-600 shrink-0">{ns.count}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Version family child item — a sibling CatalogEntry shown indented under the head entry.
 */
const VersionFamilyItem = ({ entry, isSelected, onSelect, onDoubleClick }) => {
  const nodeCount = Array.isArray(entry.nodes) ? entry.nodes.length : (entry.nodeCount || 0);
  const edgeCount = Array.isArray(entry.edges) ? entry.edges.length : (entry.edgeCount || 0);
  const dateStr = (entry.createdAt || '').substring(0, 10);

  return (
    <div
      className={`flex items-center gap-1.5 py-1 cursor-pointer group transition-colors ${
        isSelected
          ? 'bg-blue-500/15 border-l-2 border-blue-500'
          : 'hover:bg-[#21262d] border-l-2 border-transparent'
      }`}
      style={{ paddingLeft: 52 }}
      onClick={() => onSelect(entry)}
      onDoubleClick={() => onDoubleClick(entry)}
    >
      <GitBranch className="w-3 h-3 text-gray-600 shrink-0" />
      <span className="text-xs text-gray-400 truncate">
        v{entry.currentVersion || 1}
      </span>
      <span className="text-[10px] text-gray-600 shrink-0">
        {nodeCount}N/{edgeCount}E
      </span>
      {dateStr && (
        <span className="text-[10px] text-gray-600 shrink-0">
          {dateStr}
        </span>
      )}
    </div>
  );
};

/**
 * Single graph item in the tree — version-family-aware.
 * If graph._versionFamily has entries, shows a collapsible chevron with sibling versions.
 */
const GraphItem = ({
  graph, isSelected, onSelect, onDoubleClick, onClone, onDelete,
  isVersionExpanded, onToggleVersions,
  selectedGraphId, onSelectFamilyChild, onDoubleClickFamilyChild
}) => {
  const Icon = TYPE_ICONS[graph.type] || FileCode;
  const color = TYPE_COLORS[graph.type] || 'text-gray-400';
  const badgeCls = TYPE_BG[graph.type] || 'bg-gray-500/15 text-gray-400';
  const family = graph._versionFamily || [];
  const hasVersions = family.length > 0;
  const totalVersions = hasVersions ? family.length + 1 : 1;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer group transition-colors ${
          isSelected
            ? 'bg-blue-500/15 border-l-2 border-blue-500'
            : 'hover:bg-[#21262d] border-l-2 border-transparent'
        }`}
        style={{ paddingLeft: hasVersions ? 20 : 28 }}
        onClick={() => onSelect(graph)}
        onDoubleClick={() => onDoubleClick(graph)}
      >
        {/* Version expand chevron */}
        {hasVersions && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleVersions(graph._familyKey); }}
            className="p-0.5 shrink-0"
          >
            {isVersionExpanded ? (
              <ChevronDown className="w-3 h-3 text-gray-500" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-500" />
            )}
          </button>
        )}

        <Icon className={`w-4 h-4 ${color} shrink-0`} />
        <span className="flex-1 text-sm text-gray-200 truncate" title={graph.name}>
          {graph.name}
        </span>

        {/* Version count badge */}
        {hasVersions && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-gray-500/15 text-gray-400 shrink-0" title={`${totalVersions} versions`}>
            {totalVersions}v
          </span>
        )}

        {/* Latest badge on head entry */}
        {hasVersions && (
          <Shield className="w-3 h-3 text-green-400 shrink-0" title="Latest version" />
        )}

        {/* Type badge */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeCls} shrink-0`}>
          {graph.type}
        </span>

        {/* Hover actions */}
        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onClone(graph); }}
            className="p-1 hover:bg-[#30363d] rounded" title="Clone"
          >
            <Copy className="w-3 h-3 text-gray-500" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(graph); }}
            className="p-1 hover:bg-red-500/20 rounded" title="Delete"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>
        </div>
      </div>

      {/* Expanded version family list */}
      {hasVersions && isVersionExpanded && (
        <div>
          {family.map(entry => (
            <VersionFamilyItem
              key={entry.id}
              entry={entry}
              isSelected={selectedGraphId === entry.id}
              onSelect={onSelectFamilyChild}
              onDoubleClick={onDoubleClickFamilyChild}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Namespace group in the tree (collapsible header + graph list)
 */
const NamespaceGroup = ({
  namespace, graphs, isExpanded, onToggle,
  selectedGraphId, onSelectGraph, onDoubleClickGraph, onCloneGraph, onDeleteGraph,
  expandedVersionGraphs, onToggleVersions,
  onSelectFamilyChild, onDoubleClickFamilyChild
}) => {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-2 hover:bg-[#21262d] transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        )}
        {isExpanded ? (
          <FolderOpen className="w-4 h-4 text-yellow-500 shrink-0" />
        ) : (
          <Folder className="w-4 h-4 text-yellow-500 shrink-0" />
        )}
        <span className="flex-1 text-sm font-medium text-gray-200 text-left truncate">
          {namespace}
        </span>
        <span className="text-xs text-gray-500 px-1.5 py-0.5 bg-[#21262d] rounded shrink-0">
          {graphs.length}
        </span>
      </button>

      {isExpanded && (
        <div>
          {graphs.map(graph => (
            <GraphItem
              key={graph.id}
              graph={graph}
              isSelected={selectedGraphId === graph.id}
              onSelect={onSelectGraph}
              onDoubleClick={onDoubleClickGraph}
              onClone={onCloneGraph}
              onDelete={onDeleteGraph}
              isVersionExpanded={expandedVersionGraphs.has(graph._familyKey)}
              onToggleVersions={onToggleVersions}
              selectedGraphId={selectedGraphId}
              onSelectFamilyChild={onSelectFamilyChild}
              onDoubleClickFamilyChild={onDoubleClickFamilyChild}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Main GraphCatalog Component
 */
const GraphCatalog = ({
  isCollapsed,
  onToggleCollapse,
  width,
  onWidthChange,
  onSelectGraph,
  onSaveCurrentGraph,
  currentGraphData
}) => {
  const [graphs, setGraphs] = useState([]);
  const [namespaces, setNamespaces] = useState([]);
  const [selectedNamespaces, setSelectedNamespaces] = useState(new Set());
  const [expandedNamespaces, setExpandedNamespaces] = useState(new Set());
  const [selectedGraphId, setSelectedGraphId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionWarning, setConnectionWarning] = useState(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);

  // Version family tree state (keyed by familyKey = normalized name+namespace+type)
  const [expandedVersionGraphs, setExpandedVersionGraphs] = useState(new Set());

  const isResizing = useRef(false);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setConnectionWarning(null);
    try {
      const [nsResult, graphResult] = await Promise.all([
        getNamespaces(),
        listGraphs({ limit: 500 })
      ]);

      setNamespaces(nsResult || []);
      setGraphs(graphResult.data || []);

      if (graphResult.warning) {
        setConnectionWarning(graphResult.warning);
      }

      setSelectedNamespaces(prev => {
        if (prev.size === 0 && nsResult?.length > 0) {
          return new Set(nsResult.map(n => n.namespace));
        }
        return prev;
      });
      setExpandedNamespaces(prev => {
        if (prev.size === 0 && nsResult?.length > 0) {
          return new Set(nsResult.map(n => n.namespace));
        }
        return prev;
      });
    } catch (error) {
      console.error('Failed to load catalog data:', error);
      setConnectionWarning(error.message);
      setGraphs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter & group graphs with version family detection.
  // Separate CatalogEntry nodes with the same normalized name + namespace + type
  // are treated as different versions of the same graph.
  const groupedGraphs = useMemo(() => {
    let filtered = graphs.filter(g => g.namespace && selectedNamespaces.has(g.namespace));
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(g =>
        g.name?.toLowerCase().includes(searchLower) ||
        g.description?.toLowerCase().includes(searchLower)
      );
    }

    // 1. Build version families by normalized name + namespace + type
    const familyMap = {}; // familyKey -> [entry, entry, ...]
    for (const graph of filtered) {
      const baseName = (graph.name || '')
        .replace(/\s*\(Copy\)\s*/g, '')
        .replace(/\s+v\d+$/i, '')
        .trim();
      const familyKey = `${baseName}||${graph.namespace || ''}||${graph.type || ''}`;
      if (!familyMap[familyKey]) familyMap[familyKey] = [];
      familyMap[familyKey].push(graph);
    }

    // 2. For each family, pick the head (newest by createdAt) and assign children
    const headEntries = [];
    for (const [familyKey, members] of Object.entries(familyMap)) {
      // Sort by createdAt descending — newest first
      members.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      const head = members[0];
      const children = members.slice(1);

      // Attach family metadata to head entry
      head._familyKey = familyKey;
      head._versionFamily = children;

      headEntries.push(head);
    }

    // 3. Group head entries by namespace
    const groups = {};
    for (const graph of headEntries) {
      const ns = graph.namespace || 'default';
      if (!groups[ns]) groups[ns] = [];
      groups[ns].push(graph);
    }

    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ns, gList]) => ({
        namespace: ns,
        graphs: gList.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      }));
  }, [graphs, selectedNamespaces, search]);

  const visibleCount = useMemo(
    () => groupedGraphs.reduce((sum, g) => sum + g.graphs.length, 0),
    [groupedGraphs]
  );

  // Namespace filter handlers
  const handleToggleNamespace = useCallback((ns) => {
    setSelectedNamespaces(prev => {
      const next = new Set(prev);
      next.has(ns) ? next.delete(ns) : next.add(ns);
      return next;
    });
  }, []);

  const handleSelectAllNamespaces = useCallback(() => {
    setSelectedNamespaces(new Set(namespaces.map(n => n.namespace)));
  }, [namespaces]);

  const handleClearAllNamespaces = useCallback(() => {
    setSelectedNamespaces(new Set());
  }, []);

  const handleToggleNamespaceExpand = useCallback((ns) => {
    setExpandedNamespaces(prev => {
      const next = new Set(prev);
      next.has(ns) ? next.delete(ns) : next.add(ns);
      return next;
    });
  }, []);

  // Graph selection
  const handleSelectGraph = useCallback((graph) => {
    setSelectedGraphId(graph.id);
  }, []);

  const handleDoubleClickGraph = useCallback(async (graph) => {
    try {
      const fullGraph = await getGraphById(graph.id);
      onSelectGraph?.({
        nodes: fullGraph.nodes || [],
        edges: fullGraph.edges || [],
        sourceGraph: fullGraph,
      });
    } catch (error) {
      console.error('Failed to load graph:', error);
    }
  }, [onSelectGraph]);

  // Version family tree: toggle expand (keyed by familyKey)
  const handleToggleVersions = useCallback((familyKey) => {
    setExpandedVersionGraphs(prev => {
      const next = new Set(prev);
      next.has(familyKey) ? next.delete(familyKey) : next.add(familyKey);
      return next;
    });
  }, []);

  // Select a family child entry
  const handleSelectFamilyChild = useCallback((entry) => {
    setSelectedGraphId(entry.id);
  }, []);

  // Double-click a family child → load that CatalogEntry into the editor
  const handleDoubleClickFamilyChild = useCallback(async (entry) => {
    try {
      const fullGraph = await getGraphById(entry.id);
      onSelectGraph?.({
        nodes: fullGraph.nodes || [],
        edges: fullGraph.edges || [],
        sourceGraph: fullGraph,
      });
    } catch (error) {
      console.error('Failed to load version entry:', error);
    }
  }, [onSelectGraph]);

  // Clone & Delete
  const handleCloneGraph = useCallback(async (graph) => {
    try {
      await cloneGraph(graph.id);
      loadData();
    } catch (error) {
      alert('Failed to clone graph: ' + error.message);
    }
  }, [loadData]);

  const handleDeleteGraph = useCallback(async (graph) => {
    if (!confirm(`Delete "${graph.name}"? This cannot be undone.`)) return;
    try {
      await deleteGraph(graph.id);
      if (selectedGraphId === graph.id) setSelectedGraphId(null);
      loadData();
    } catch (error) {
      alert('Failed to delete graph: ' + error.message);
    }
  }, [selectedGraphId, loadData]);

  // Save
  const handleSave = useCallback(() => {
    if (!currentGraphData?.nodes?.length) {
      alert('No graph to save');
      return;
    }
    setSaveDialogOpen(true);
  }, [currentGraphData]);

  const handleSaveComplete = useCallback(() => {
    loadData();
  }, [loadData]);

  // Resize
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const handleMouseMove = (e) => {
      if (!isResizing.current) return;
      onWidthChange?.(Math.max(200, Math.min(500, e.clientX)));
    };
    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onWidthChange]);

  // Collapsed view
  if (isCollapsed) {
    return (
      <div className="h-full flex flex-col bg-[#0d1117] border-r-2 border-[#30363d] relative" style={{ width: 48 }}>
        <button
          onClick={onToggleCollapse}
          className="p-3 hover:bg-[#21262d] transition-colors border-b border-[#30363d]"
          title="Expand catalog"
        >
          <PanelLeftOpen className="w-5 h-5 text-gray-400" />
        </button>
        <div className="flex-1 flex items-center justify-center">
          <span
            className="text-xs text-gray-500 font-medium tracking-wider"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}
          >
            CATALOG
          </span>
        </div>
        <div
          onClick={onToggleCollapse}
          className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-12 bg-[#30363d] hover:bg-blue-500 rounded-r cursor-pointer transition-colors flex items-center justify-center"
          title="Expand"
        >
          <ChevronRight className="w-3 h-3 text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col bg-[#0d1117] relative"
      style={{ width, minWidth: width }}
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-[#30363d] bg-[#161b22] flex items-center gap-2" style={{ width: '100%' }}>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 hover:bg-[#30363d] rounded border border-transparent hover:border-[#30363d] transition-colors"
          title="Collapse catalog"
        >
          <PanelLeftClose className="w-4 h-4 text-gray-400" />
        </button>
        <span className="flex-1 text-sm font-medium text-gray-200">Graph Catalog</span>
        <button
          onClick={loadData}
          className="p-1 hover:bg-[#21262d] rounded"
          title="Refresh"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={handleSave}
          className="p-1 hover:bg-[#21262d] rounded"
          title="Save current graph"
        >
          <Save className="w-4 h-4 text-green-400" />
        </button>
      </div>

      {/* Namespace Filter + Search */}
      <div className="px-3 py-2 border-b border-[#30363d] space-y-2" style={{ width: '100%' }}>
        <NamespaceFilter
          namespaces={namespaces}
          selectedNamespaces={selectedNamespaces}
          onToggleNamespace={handleToggleNamespace}
          onSelectAll={handleSelectAllNamespaces}
          onClearAll={handleClearAllNamespaces}
        />
        <div className="flex items-center gap-2 px-2 py-1.5 bg-[#161b22] border border-[#30363d] rounded-lg" style={{ width: '100%' }}>
          <Search className="w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search graphs..."
            className="flex-1 bg-transparent text-sm text-white placeholder:text-gray-600 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')} className="p-0.5 hover:bg-[#21262d] rounded">
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {visibleCount} graph{visibleCount !== 1 ? 's' : ''} in {groupedGraphs.length} namespace{groupedGraphs.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Connection Warning */}
      {connectionWarning && (
        <div className="mx-2 my-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2" style={{ width: 'calc(100% - 16px)' }}>
          <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-yellow-400">
            <span className="font-medium">Memgraph not connected</span>
            <p className="text-yellow-500/80 mt-0.5">Catalog data unavailable</p>
          </div>
        </div>
      )}

      {/* Tree View */}
      <div className="flex-1 overflow-auto" style={{ width: '100%' }}>
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : connectionWarning ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
            <Database className="w-8 h-8 mb-2 opacity-50" />
            <span>Connect Memgraph to use catalog</span>
          </div>
        ) : groupedGraphs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
            <Folder className="w-8 h-8 mb-2 opacity-50" />
            <span>{search ? 'No matching graphs' : selectedNamespaces.size === 0 ? 'Select a namespace' : 'No graphs found'}</span>
          </div>
        ) : (
          <div className="py-1">
            {groupedGraphs.map(group => (
              <NamespaceGroup
                key={group.namespace}
                namespace={group.namespace}
                graphs={group.graphs}
                isExpanded={expandedNamespaces.has(group.namespace)}
                onToggle={() => handleToggleNamespaceExpand(group.namespace)}
                selectedGraphId={selectedGraphId}
                onSelectGraph={handleSelectGraph}
                onDoubleClickGraph={handleDoubleClickGraph}
                onCloneGraph={handleCloneGraph}
                onDeleteGraph={handleDeleteGraph}
                expandedVersionGraphs={expandedVersionGraphs}
                onToggleVersions={handleToggleVersions}
                onSelectFamilyChild={handleSelectFamilyChild}
                onDoubleClickFamilyChild={handleDoubleClickFamilyChild}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right border with resize handle */}
      <div className="absolute right-0 top-0 bottom-0 w-[3px] bg-[#30363d] group/resize">
        <div onMouseDown={handleMouseDown} className="absolute -left-2 top-0 bottom-0 w-6 cursor-col-resize z-10" />
        <div className="absolute inset-0 bg-blue-500 opacity-0 group-hover/resize:opacity-100 transition-opacity" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover/resize:opacity-100 transition-opacity">
          <div className="w-1 h-1 rounded-full bg-blue-400" />
          <div className="w-1 h-1 rounded-full bg-blue-400" />
          <div className="w-1 h-1 rounded-full bg-blue-400" />
        </div>
        <button
          onClick={onToggleCollapse}
          className="absolute -right-3 top-4 w-6 h-6 bg-[#21262d] border border-[#30363d] rounded-full flex items-center justify-center hover:bg-[#30363d] hover:border-blue-500 transition-colors z-20"
          title="Collapse"
        >
          <ChevronRight className="w-3 h-3 text-gray-400 rotate-180" />
        </button>
      </div>

      {/* Save Graph Dialog */}
      <SaveGraphDialog
        open={saveDialogOpen}
        onClose={() => setSaveDialogOpen(false)}
        onSaved={handleSaveComplete}
        graphData={currentGraphData}
        parentContext={currentGraphData?.parentContext}
      />
    </div>
  );
};

export default GraphCatalog;

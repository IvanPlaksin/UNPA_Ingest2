/**
 * FloatingGraphCatalog - Draggable/resizable floating panel for Graph Catalog
 *
 * Used in KnowledgePlanes to select and load graphs from the catalog.
 * Double-click on a graph loads it into the visualization.
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
    ChevronRight, ChevronDown, Search, RefreshCw,
    Folder, X, AlertTriangle, GripVertical,
    Maximize2, Minimize2, Move, Database,
    Atom, Wrench, Briefcase, Layers, FileCode,
    PanelLeftClose, Archive,
} from 'lucide-react';
import { listGraphs, getGraphById } from '../../services/graphCatalog.service';
import { getEntityGraph, listNamespaces } from '../../services/entityStore.service';

// ── Entity Store → Singularity format conversion ─────────────────────────────

const ES_COLORS = {
    ACTOR: '#3b82f6', ORGANIZATION: '#3b82f6', CONCEPT: '#06b6d4',
    DOCUMENT: '#8b5cf6', DOCUMENTREF: '#8b5cf6', EVENT: '#eab308',
    PROCESS: '#eab308', PERSON: '#22c55e', TECHNOLOGY: '#a855f7',
    POLICY: '#ef4444', SYSTEM: '#0891b2', WORK_ITEM: '#6b7280',
};

function convertEntityStoreToSingularity(graphData, namespace) {
    const nodes = (graphData.entities || []).map(e => ({
        id: e.id,
        name: e.name,
        type: (e.type || 'concept').toLowerCase(),
        val: (e.mentionCount > 0 ? 10 : 6),
        color: ES_COLORS[(e.type || '').toUpperCase()] || '#6b7280',
        level: 0,
        loaded: true,
        hasSubGraph: false,
        data: e,
    }));
    const links = (graphData.relationships || [])
        .filter(r => r.sourceId && r.targetId)
        .map(r => ({ source: r.sourceId, target: r.targetId, type: r.relType || 'RELATED_TO' }));
    return {
        __alreadyConverted: true,
        __sourceName: `Entity Store${namespace ? ` · ${namespace}` : ' · All'}`,
        __sourceType: 'Entity Store',
        nodes,
        links,
    };
}

// Storage key for localStorage
const STORAGE_KEY = 'knowledge-planes-catalog-panel-state';

// Graph type icons and colors
const TYPE_ICONS = {
    atomic: Atom,
    tool: Wrench,
    business: Briefcase,
    composite: Layers,
    template: FileCode
};

const TYPE_COLORS = {
    atomic: 'text-cyan-400',
    tool: 'text-green-400',
    business: 'text-blue-400',
    composite: 'text-purple-400',
    template: 'text-orange-400'
};

// Load saved state from localStorage
const loadSavedState = () => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Failed to load panel state:', e);
    }
    return null;
};

// Save state to localStorage
const saveState = (state) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save panel state:', e);
    }
};

/**
 * Graph List Item
 */
const GraphListItem = ({ graph, isSelected, onSelect, onDoubleClick }) => {
    const Icon = TYPE_ICONS[graph.type] || Folder;
    const colorClass = TYPE_COLORS[graph.type] || 'text-gray-400';

    return (
        <div
            className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors
                ${isSelected ? 'bg-blue-500/20 border-l-2 border-blue-500' : 'hover:bg-[#21262d]'}`}
            onClick={() => onSelect(graph)}
            onDoubleClick={() => onDoubleClick(graph)}
        >
            <Icon className={`w-4 h-4 ${colorClass}`} />
            <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-200 truncate">{graph.name}</div>
                {graph.description && (
                    <div className="text-xs text-gray-500 truncate">{graph.description}</div>
                )}
            </div>
            <span className="text-xs text-gray-600 bg-[#21262d] px-1.5 py-0.5 rounded">
                {graph.type}
            </span>
        </div>
    );
};

/**
 * Main FloatingGraphCatalog Component
 */
const FloatingGraphCatalog = ({
    onSelectGraph,  // Called with graph data when double-clicked
    isVisible = true,
    onClose
}) => {
    // Load initial state from localStorage or use defaults
    const savedState = loadSavedState();

    const [position, setPosition] = useState(savedState?.position || { x: 20, y: 100 });
    const [size, setSize] = useState(savedState?.size || { width: 320, height: 450 });
    const [isMinimized, setIsMinimized] = useState(savedState?.isMinimized || false);
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);

    // Source tab: 'catalog' | 'entity-store'
    const [source, setSource] = useState('catalog');

    // Graph Catalog state
    const [graphs, setGraphs] = useState([]);
    const [selectedGraphId, setSelectedGraphId] = useState(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingGraph, setLoadingGraph] = useState(false);
    const [connectionWarning, setConnectionWarning] = useState(null);

    // Entity Store state
    const [namespaces, setNamespaces] = useState([]);
    const [selectedNamespace, setSelectedNamespace] = useState('');
    const [loadingES, setLoadingES] = useState(false);
    const [esError, setEsError] = useState(null);

    const panelRef = useRef(null);
    const dragStart = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ width: 0, height: 0, x: 0, y: 0 });

    // Save state to localStorage when it changes
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            saveState({ position, size, isMinimized });
        }, 100);
        return () => clearTimeout(timeoutId);
    }, [position, size, isMinimized]);

    // Load graphs list
    const loadGraphsList = useCallback(async () => {
        setLoading(true);
        setConnectionWarning(null);
        try {
            const result = await listGraphs({ search: search || undefined });
            setGraphs(result.data || []);
            if (result.warning) {
                setConnectionWarning(result.warning);
            }
        } catch (error) {
            console.error('Failed to load graphs:', error);
            setConnectionWarning(error.message);
            setGraphs([]);
        } finally {
            setLoading(false);
        }
    }, [search]);

    useEffect(() => {
        if (isVisible) {
            loadGraphsList();
        }
    }, [isVisible, loadGraphsList]);

    // Filter graphs by search (client-side)
    const filteredGraphs = useMemo(() => {
        if (!search) return graphs;
        const searchLower = search.toLowerCase();
        return graphs.filter(g =>
            g.name?.toLowerCase().includes(searchLower) ||
            g.description?.toLowerCase().includes(searchLower) ||
            g.type?.toLowerCase().includes(searchLower)
        );
    }, [graphs, search]);

    // Handle graph selection
    const handleGraphSelect = useCallback((graph) => {
        setSelectedGraphId(graph.id);
    }, []);

    // ── Entity Store handlers ─────────────────────────────────────────────────

    const loadNamespacesList = useCallback(async () => {
        try {
            const result = await listNamespaces();
            setNamespaces((result || []).map(n => n.namespace || n).filter(Boolean));
        } catch (err) {
            console.error('Failed to load namespaces:', err);
        }
    }, []);

    const handleLoadEntityStore = useCallback(async () => {
        setLoadingES(true);
        setEsError(null);
        try {
            const graphData = await getEntityGraph(selectedNamespace || null);
            const converted = convertEntityStoreToSingularity(graphData, selectedNamespace || null);
            if (!converted.nodes.length) {
                setEsError('No entities found for this namespace.');
                return;
            }
            onSelectGraph?.(converted);
        } catch (err) {
            setEsError(err.message || 'Failed to load entity graph.');
        } finally {
            setLoadingES(false);
        }
    }, [selectedNamespace, onSelectGraph]);

    // ── Graph Catalog: double-click handler ───────────────────────────────────

    // Handle double-click - load full graph and pass to parent
    const handleGraphDoubleClick = useCallback(async (graph) => {
        setLoadingGraph(true);
        try {
            const fullGraph = await getGraphById(graph.id);

            // Debug: log subgraph data
            console.log('[FloatingGraphCatalog] Loaded graph:', {
                id: fullGraph.id,
                name: fullGraph.name,
                nodesCount: fullGraph.nodes?.length,
                edgesCount: fullGraph.edges?.length,
                hasSubGraphs: !!fullGraph.subGraphs,
                subGraphNodes: fullGraph.subGraphs ? Object.keys(fullGraph.subGraphs) : []
            });

            onSelectGraph?.({
                ...fullGraph,
                sourceGraph: graph
            });
        } catch (error) {
            console.error('Failed to load graph:', error);
            alert('Failed to load graph: ' + error.message);
        } finally {
            setLoadingGraph(false);
        }
    }, [onSelectGraph]);

    // Drag handlers
    const handleDragStart = useCallback((e) => {
        e.preventDefault();
        setIsDragging(true);
        dragStart.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    }, [position]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e) => {
            setPosition({
                x: Math.max(0, e.clientX - dragStart.current.x),
                y: Math.max(0, e.clientY - dragStart.current.y)
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    // Resize handlers
    const handleResizeStart = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStart.current = {
            width: size.width,
            height: size.height,
            x: e.clientX,
            y: e.clientY
        };
    }, [size]);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e) => {
            const deltaX = e.clientX - resizeStart.current.x;
            const deltaY = e.clientY - resizeStart.current.y;
            setSize({
                width: Math.max(280, resizeStart.current.width + deltaX),
                height: Math.max(300, resizeStart.current.height + deltaY)
            });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    if (!isVisible) return null;

    return (
        <div
            ref={panelRef}
            className="fixed z-50 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl flex flex-col overflow-hidden"
            style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: isMinimized ? 44 : size.height,
                transition: isDragging || isResizing ? 'none' : 'height 0.2s ease'
            }}
        >
            {/* Header with drag handle */}
            <div
                className="flex items-center gap-2 px-3 py-2 bg-[#0d1117] border-b border-[#30363d] cursor-move select-none"
                onMouseDown={handleDragStart}
            >
                <Move className="w-4 h-4 text-gray-500" />
                <Database className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-gray-300 flex-1">Graph Catalog</span>

                {loading && (
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                )}

                <button
                    onClick={() => setIsMinimized(!isMinimized)}
                    className="p-1 hover:bg-[#30363d] rounded text-gray-400"
                >
                    {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>

                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-[#30363d] rounded text-gray-400"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {!isMinimized && (
                <>
                    {/* Source tabs */}
                    <div className="flex border-b border-[#30363d] text-xs">
                        <button
                            className={`flex-1 py-2 font-medium transition-colors ${
                                source === 'catalog'
                                    ? 'text-cyan-400 border-b-2 border-cyan-400 -mb-px bg-[#0d1117]/40'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                            onClick={() => setSource('catalog')}
                        >
                            Graph Catalog
                        </button>
                        <button
                            className={`flex-1 py-2 font-medium transition-colors ${
                                source === 'entity-store'
                                    ? 'text-purple-400 border-b-2 border-purple-400 -mb-px bg-[#0d1117]/40'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                            onClick={() => {
                                setSource('entity-store');
                                loadNamespacesList();
                            }}
                        >
                            Entity Store
                        </button>
                    </div>

                    {/* ── Entity Store panel ── */}
                    {source === 'entity-store' && (
                        <div className="flex flex-col gap-3 p-3 flex-1 overflow-auto">
                            <p className="text-xs text-gray-500">
                                Load entity relationships from the Entity Store into 3D visualization.
                            </p>

                            <div>
                                <label className="text-xs text-gray-400 block mb-1">Namespace</label>
                                <select
                                    value={selectedNamespace}
                                    onChange={e => setSelectedNamespace(e.target.value)}
                                    className="w-full bg-[#0d1117] border border-[#30363d] text-sm text-gray-200 rounded px-2 py-1.5 focus:outline-none focus:border-purple-500/50"
                                >
                                    <option value="">All namespaces</option>
                                    {namespaces.map(ns => (
                                        <option key={ns} value={ns}>{ns}</option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={handleLoadEntityStore}
                                disabled={loadingES}
                                className="flex items-center justify-center gap-2 py-2 bg-purple-600/20 border border-purple-500/40 hover:bg-purple-600/30 hover:border-purple-400/60 text-purple-300 rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loadingES
                                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                                    : <Archive className="w-4 h-4" />
                                }
                                {loadingES ? 'Loading…' : 'Load Entity Graph'}
                            </button>

                            {esError && (
                                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
                                    {esError}
                                </p>
                            )}

                            <p className="text-xs text-gray-600 italic mt-auto">
                                Loads entity nodes and their relationships into the Singularity 3D view.
                            </p>
                        </div>
                    )}

                    {/* ── Graph Catalog panel ── */}
                    {source === 'catalog' && <>

                    {/* Search bar */}
                    <div className="px-3 py-2 border-b border-[#30363d]">
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-[#0d1117] border border-[#30363d] rounded-lg">
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
                        <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-gray-500">
                                {filteredGraphs.length} graph{filteredGraphs.length !== 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={loadGraphsList}
                                disabled={loading}
                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors"
                            >
                                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* Connection Warning */}
                    {connectionWarning && (
                        <div className="mx-3 my-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                            <div className="flex-1 text-xs text-yellow-400">
                                <span className="font-medium">Connection issue</span>
                                <p className="text-yellow-500/80 mt-0.5">{connectionWarning}</p>
                            </div>
                        </div>
                    )}

                    {/* Instructions */}
                    <div className="px-3 py-1.5 bg-[#0d1117]/50 border-b border-[#30363d]">
                        <p className="text-xs text-gray-500 italic">
                            Double-click a graph to load it into visualization
                        </p>
                    </div>

                    {/* Graph List */}
                    <div className="flex-1 overflow-auto p-2">
                        {loading ? (
                            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                                Loading...
                            </div>
                        ) : loadingGraph ? (
                            <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                                <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                                Loading graph data...
                            </div>
                        ) : filteredGraphs.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-32 text-gray-500 text-sm">
                                <Folder className="w-8 h-8 mb-2 opacity-50" />
                                <span>{search ? 'No matching graphs' : 'No graphs in catalog'}</span>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {filteredGraphs.map(graph => (
                                    <GraphListItem
                                        key={graph.id}
                                        graph={graph}
                                        isSelected={selectedGraphId === graph.id}
                                        onSelect={handleGraphSelect}
                                        onDoubleClick={handleGraphDoubleClick}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    </>} {/* end source === 'catalog' */}

                    {/* Resize handle */}
                    <div
                        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                        onMouseDown={handleResizeStart}
                    >
                        <GripVertical className="w-4 h-4 text-gray-600 rotate-[-45deg] translate-x-1 translate-y-1" />
                    </div>
                </>
            )}
        </div>
    );
};

export default FloatingGraphCatalog;

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    Box,
    Paper,
    Typography,
    Tabs,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TablePagination,
    TableSortLabel,
    IconButton,
    Button,
    TextField,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Chip,
    Stack,
    Alert,
    Snackbar,
    Tooltip,
    CircularProgress,
    InputAdornment,
    Divider,
    Popper,
    Fade,
    Autocomplete
} from '@mui/material';
import {
    Plus,
    Pencil,
    Trash2,
    Search,
    RefreshCw,
    Link2,
    Unlink,
    Eye,
    Database,
    Network,
    ZoomIn,
    Maximize2,
    Minimize2,
    Tag,
    Filter,
    ArrowUpDown,
    Atom,
    Wrench,
    Briefcase,
    Layers,
    FileCode,
    FolderOpen
} from 'lucide-react';
import { getLabels, listGraphs, getGraphById, GRAPH_TYPES, GRAPH_TYPE_INFO } from '../services/graphCatalog.service';
import ReactFlow, {
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    Handle,
    Position,
    MarkerType
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

const API_BASE = '/api/v1/knowledge/crud';

// Palette matching GXE Visualizer style
const palette = {
    Entity:    { bg: '#1e293b', border: '#8b5cf6', text: '#c4b5fd', glow: 'rgba(139,92,246,.5)' },
    Document:  { bg: '#1e293b', border: '#3b82f6', text: '#93c5fd', glow: 'rgba(59,130,246,.5)' },
    WorkItem:  { bg: '#2e2a1a', border: '#f59e0b', text: '#fcd34d', glow: 'rgba(245,158,11,.5)' },
    Task:      { bg: '#1a2e1a', border: '#10b981', text: '#86efac', glow: 'rgba(16,185,129,.5)' },
    Bug:       { bg: '#2e1a1a', border: '#ef4444', text: '#fca5a5', glow: 'rgba(239,68,68,.5)' },
    Feature:   { bg: '#1a2e2e', border: '#06b6d4', text: '#67e8f9', glow: 'rgba(6,182,212,.5)' },
    Epic:      { bg: '#2e1a2e', border: '#ec4899', text: '#f9a8d4', glow: 'rgba(236,72,153,.5)' },
    Person:    { bg: '#1a2e1a', border: '#84cc16', text: '#bef264', glow: 'rgba(132,204,22,.5)' },
    Project:   { bg: '#1e1e2e', border: '#6366f1', text: '#a5b4fc', glow: 'rgba(99,102,241,.5)' },
    File:      { bg: '#1a2e2e', border: '#14b8a6', text: '#5eead4', glow: 'rgba(20,184,166,.5)' },
    Knowledge: { bg: '#2e1a2e', border: '#a855f7', text: '#d8b4fe', glow: 'rgba(168,85,247,.5)' },
    default:   { bg: '#1e293b', border: '#64748b', text: '#94a3b8', glow: 'rgba(100,116,139,.5)' }
};

const getPalette = (labels) => {
    if (!labels || labels.length === 0) return palette.default;
    const primaryLabel = labels[0];
    return palette[primaryLabel] || palette.default;
};

const getNodeColor = (labels) => {
    return getPalette(labels).border;
};

// Custom Node Component with hover tooltip
const GraphCRUDNode = ({ data, selected }) => {
    const [anchorEl, setAnchorEl] = useState(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const nodeRef = useRef(null);

    const c = getPalette(data.labels);

    const handleMouseEnter = (e) => {
        setAnchorEl(e.currentTarget);
        setShowTooltip(true);
    };

    const handleMouseLeave = () => {
        setShowTooltip(false);
    };

    const formatValue = (value) => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') {
            if (value.year && value.month && value.day) {
                return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
            }
            return JSON.stringify(value);
        }
        if (typeof value === 'string' && value.length > 40) return value.substring(0, 40) + '...';
        return String(value);
    };

    return (
        <>
            <Handle type="target" position={Position.Top} style={{ background: c.border, width: 8, height: 8 }} />

            <div
                ref={nodeRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{
                    backgroundColor: c.bg,
                    border: `2px solid ${c.border}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    minWidth: 160,
                    maxWidth: 240,
                    boxShadow: selected ? `0 0 20px ${c.glow}` : 'none',
                    transition: 'all 0.2s ease'
                }}
            >
                {/* Labels */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                    {(data.labels || []).slice(0, 2).map(label => (
                        <span
                            key={label}
                            style={{
                                fontSize: 13,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                padding: '2px 6px',
                                borderRadius: 4,
                                backgroundColor: `${c.border}25`,
                                color: c.text
                            }}
                        >
                            {label}
                        </span>
                    ))}
                </div>

                {/* Node name */}
                <div style={{
                    fontWeight: 500,
                    color: '#fff',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}>
                    {data.name || data.title || data.id || 'Unknown'}
                </div>

                {/* Center indicator */}
                {data.isCenter && (
                    <div style={{
                        marginTop: 6,
                        fontSize: 13,
                        color: c.text,
                        opacity: 0.8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                    }}>
                        <span style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            backgroundColor: c.border,
                            animation: 'pulse 2s infinite'
                        }} />
                        CENTER
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Bottom} style={{ background: c.border, width: 8, height: 8 }} />

            {/* Hover Tooltip */}
            <Popper
                open={showTooltip}
                anchorEl={anchorEl}
                placement="right-start"
                transition
                style={{ zIndex: 9999 }}
                modifiers={[{ name: 'offset', options: { offset: [0, 10] } }]}
            >
                {({ TransitionProps }) => (
                    <Fade {...TransitionProps} timeout={200}>
                        <Paper
                            elevation={8}
                            sx={{
                                p: 1.5,
                                bgcolor: '#161b22',
                                border: `1px solid ${c.border}`,
                                maxWidth: 320,
                                maxHeight: 400,
                                overflow: 'auto'
                            }}
                        >
                            <Typography variant="caption" sx={{ color: c.text, fontWeight: 'bold', display: 'block', mb: 1 }}>
                                Properties
                            </Typography>
                            {data.properties && Object.entries(data.properties).length > 0 ? (
                                <Stack spacing={0.5}>
                                    {Object.entries(data.properties).map(([key, value]) => (
                                        <Box key={key} sx={{ display: 'flex', gap: 1 }}>
                                            <Typography variant="caption" sx={{ color: '#888', minWidth: 70, fontWeight: 500 }}>
                                                {key}:
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: '#fff', wordBreak: 'break-word' }}>
                                                {formatValue(value)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            ) : (
                                <Typography variant="caption" sx={{ color: '#666' }}>No properties</Typography>
                            )}
                        </Paper>
                    </Fade>
                )}
            </Popper>
        </>
    );
};

const nodeTypes = { graphCRUDNode: GraphCRUDNode };

// Dagre layout helper
const getLayoutedElements = (nodes, edges, direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: direction, ranksep: 80, nodesep: 50 });

    nodes.forEach(node => {
        dagreGraph.setNode(node.id, { width: 180, height: 70 });
    });

    edges.forEach(edge => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map(node => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - 90,
                y: nodeWithPosition.y - 35
            }
        };
    });

    return { nodes: layoutedNodes, edges };
};

const GraphCRUDPage = () => {
    const [tabValue, setTabValue] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Node state
    const [nodes, setNodes] = useState([]);
    const [nodePage, setNodePage] = useState(0);
    const [nodeRowsPerPage, setNodeRowsPerPage] = useState(25);
    const [nodeTotal, setNodeTotal] = useState(0);
    const [nodeSearch, setNodeSearch] = useState('');
    const [selectedLabel, setSelectedLabel] = useState('');

    // Relationship state
    const [relationships, setRelationships] = useState([]);
    const [relPage, setRelPage] = useState(0);
    const [relRowsPerPage, setRelRowsPerPage] = useState(25);
    const [selectedRelType, setSelectedRelType] = useState('');

    // Schema state
    const [nodeLabels, setNodeLabels] = useState([]);
    const [relationshipTypes, setRelationshipTypes] = useState([]);

    // Graph Catalog filter state (labels from CatalogEntry tags)
    const [catalogLabels, setCatalogLabels] = useState([]);
    const [selectedCatalogLabels, setSelectedCatalogLabels] = useState([]);
    const [selectedGraphType, setSelectedGraphType] = useState('');
    const [labelsLoading, setLabelsLoading] = useState(false);

    // Sorting state
    const [orderBy, setOrderBy] = useState('updatedAt');
    const [order, setOrder] = useState('desc');

    // Dialog state
    const [nodeDialogOpen, setNodeDialogOpen] = useState(false);
    const [relDialogOpen, setRelDialogOpen] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [viewDialogOpen, setViewDialogOpen] = useState(false);

    const [editingNode, setEditingNode] = useState(null);
    const [deletingItem, setDeletingItem] = useState(null);
    const [viewingNode, setViewingNode] = useState(null);

    // Form state
    const [nodeForm, setNodeForm] = useState({ label: '', properties: {} });
    const [relForm, setRelForm] = useState({ sourceId: '', targetId: '', type: '', properties: {} });
    const [propertyInput, setPropertyInput] = useState({ key: '', value: '' });

    // Graph visualization state (ReactFlow)
    const [selectedNodeForGraph, setSelectedNodeForGraph] = useState(null);
    const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([]);
    const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([]);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphExpanded, setGraphExpanded] = useState(false);

    // Graph Catalog Selection state
    const [catalogGraphs, setCatalogGraphs] = useState([]);
    const [catalogGraphsLoading, setCatalogGraphsLoading] = useState(false);
    const [selectedCatalogGraph, setSelectedCatalogGraph] = useState(null);
    const [catalogGraphId, setCatalogGraphId] = useState(null);
    const [isCatalogMode, setIsCatalogMode] = useState(false);

    // Fetch schema, catalog labels, and catalog graphs on mount
    useEffect(() => {
        fetchSchema();
        fetchCatalogLabels();
        fetchCatalogGraphs();
    }, []);

    // Fetch data when tab, pagination, or filters change (skip in catalog mode)
    useEffect(() => {
        if (isCatalogMode) return;
        if (tabValue === 0) {
            fetchNodes();
        } else {
            fetchRelationships();
        }
    }, [tabValue, nodePage, nodeRowsPerPage, relPage, relRowsPerPage, selectedLabel, selectedRelType, selectedCatalogLabels, selectedGraphType, orderBy, order, isCatalogMode]);

    const fetchSchema = async () => {
        try {
            const res = await fetch(`${API_BASE}/labels`);
            const data = await res.json();
            setNodeLabels(data.nodeLabels || []);
            setRelationshipTypes(data.relationshipTypes || []);
        } catch (err) {
            setError('Failed to fetch schema: ' + err.message);
        }
    };

    // Fetch graph catalog labels (tags from CatalogEntry) with Redis caching
    const fetchCatalogLabels = async () => {
        setLabelsLoading(true);
        try {
            const labels = await getLabels();
            setCatalogLabels(labels.map(l => l.label));
        } catch (err) {
            console.error('Failed to fetch catalog labels:', err);
        } finally {
            setLabelsLoading(false);
        }
    };

    // Fetch catalog graphs list for the selector dropdown
    const fetchCatalogGraphs = useCallback(async () => {
        setCatalogGraphsLoading(true);
        try {
            const result = await listGraphs({});
            setCatalogGraphs(result.data || []);
        } catch (err) {
            console.error('Failed to fetch catalog graphs:', err);
            setCatalogGraphs([]);
        } finally {
            setCatalogGraphsLoading(false);
        }
    }, []);

    // Load a specific graph from catalog and display it
    const loadCatalogGraph = useCallback(async (graphId) => {
        if (!graphId) return;

        setCatalogGraphsLoading(true);
        setGraphLoading(true);
        try {
            const graph = await getGraphById(graphId);
            if (!graph) {
                setError('Graph not found in catalog');
                return;
            }

            setSelectedCatalogGraph(graph);
            setCatalogGraphId(graphId);
            setIsCatalogMode(true);

            // Map catalog nodes to table format
            const tableNodes = (graph.nodes || []).map(n => ({
                internalId: n.id,
                id: n.id,
                labels: [n.data?.kind || n.type || 'Node'].filter(Boolean),
                properties: {
                    name: n.data?.label || n.data?.name || n.id,
                    title: n.data?.label || n.data?.name || '',
                    description: n.data?.description || '',
                    kind: n.data?.kind || '',
                    ...(n.data || {})
                }
            }));

            setNodes(tableNodes);
            setNodeTotal(tableNodes.length);
            setNodePage(0);

            // Map catalog nodes/edges to ReactFlow format
            const rfNodes = (graph.nodes || []).map(n => ({
                id: String(n.id),
                type: 'graphCRUDNode',
                position: n.position || { x: 0, y: 0 },
                data: {
                    id: n.id,
                    name: n.data?.label || n.data?.name || n.id,
                    title: n.data?.label || '',
                    labels: [n.data?.kind || n.type || 'Node'].filter(Boolean),
                    properties: n.data || {},
                    isCenter: false
                }
            }));

            const rfEdges = (graph.edges || []).map((e, idx) => ({
                id: e.id || `catalog-edge-${idx}`,
                source: String(e.source),
                target: String(e.target),
                type: 'smoothstep',
                animated: false,
                label: e.label || e.data?.label || '',
                labelStyle: { fontSize: 13, fill: '#6b7280' },
                style: { stroke: '#8b5cf6', strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#8b5cf6' }
            }));

            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(rfNodes, rfEdges);
            setFlowNodes(layoutedNodes);
            setFlowEdges(layoutedEdges);
            setSelectedNodeForGraph(null);
        } catch (err) {
            setError('Failed to load catalog graph: ' + err.message);
        } finally {
            setCatalogGraphsLoading(false);
            setGraphLoading(false);
        }
    }, []);

    const fetchNodes = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                limit: nodeRowsPerPage,
                offset: nodePage * nodeRowsPerPage
            });
            if (selectedLabel) params.append('label', selectedLabel);
            if (nodeSearch) params.append('search', nodeSearch);
            // Add sorting params
            if (orderBy) params.append('orderBy', orderBy);
            if (order) params.append('order', order);
            // Add catalog labels filter (multiple tags)
            if (selectedCatalogLabels.length > 0) {
                params.append('tags', selectedCatalogLabels.join(','));
            }
            // Add graph type filter
            if (selectedGraphType) {
                params.append('graphType', selectedGraphType);
            }

            const res = await fetch(`${API_BASE}/nodes?${params}`);
            const data = await res.json();

            // Client-side sorting if API doesn't support it
            let sortedNodes = data.nodes || [];
            if (orderBy && sortedNodes.length > 0) {
                sortedNodes = [...sortedNodes].sort((a, b) => {
                    let aVal = a.properties?.[orderBy] || a[orderBy] || '';
                    let bVal = b.properties?.[orderBy] || b[orderBy] || '';

                    // Handle date objects
                    if (typeof aVal === 'object' && aVal?.year) {
                        aVal = new Date(aVal.year, aVal.month - 1, aVal.day).getTime();
                    }
                    if (typeof bVal === 'object' && bVal?.year) {
                        bVal = new Date(bVal.year, bVal.month - 1, bVal.day).getTime();
                    }

                    // String comparison
                    if (typeof aVal === 'string' && typeof bVal === 'string') {
                        return order === 'asc'
                            ? aVal.localeCompare(bVal)
                            : bVal.localeCompare(aVal);
                    }

                    // Numeric comparison
                    return order === 'asc' ? aVal - bVal : bVal - aVal;
                });
            }

            setNodes(sortedNodes);
            setNodeTotal(data.pagination?.total || 0);
        } catch (err) {
            setError('Failed to fetch nodes: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [nodePage, nodeRowsPerPage, selectedLabel, nodeSearch, orderBy, order, selectedCatalogLabels, selectedGraphType]);

    // Clear catalog graph selection, return to normal CRUD mode
    const clearCatalogSelection = useCallback(() => {
        setSelectedCatalogGraph(null);
        setCatalogGraphId(null);
        setIsCatalogMode(false);
        setFlowNodes([]);
        setFlowEdges([]);
        setSelectedNodeForGraph(null);
        fetchNodes();
    }, [fetchNodes]);

    // Handle sort request
    const handleRequestSort = (property) => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    };

    const fetchRelationships = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                limit: relRowsPerPage,
                offset: relPage * relRowsPerPage
            });
            if (selectedRelType) params.append('type', selectedRelType);

            const res = await fetch(`${API_BASE}/relationships?${params}`);
            const data = await res.json();
            setRelationships(data.relationships || []);
        } catch (err) {
            setError('Failed to fetch relationships: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, [relPage, relRowsPerPage, selectedRelType]);

    // Load graph structure for selected node (with proper edge directions)
    const loadGraphForNode = useCallback(async (node) => {
        setGraphLoading(true);
        setSelectedNodeForGraph(node);
        try {
            // Use /structure endpoint for directed graph (not /neighbors for horizontal)
            const res = await fetch(`${API_BASE}/node/${node.internalId}/structure?depth=2`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            // Build ReactFlow nodes from structure response
            const flowNodes = (data.nodes || []).map((n, idx) => ({
                id: String(n.id),
                type: 'graphCRUDNode',
                position: { x: 0, y: 0 },
                data: {
                    id: n.id,
                    name: n.properties?.name || n.properties?.title || n.externalId || n.id,
                    title: n.properties?.title,
                    labels: n.labels || [],
                    properties: n.properties || {},
                    isCenter: n.isCenter || false
                }
            }));

            // Create edges with proper direction from API response
            const flowEdges = (data.edges || []).map(e => ({
                id: e.id,
                source: String(e.source),
                target: String(e.target),
                type: 'smoothstep',
                animated: false,
                label: e.type, // Show relationship type
                labelStyle: { fontSize: 13, fill: '#6b7280' },
                labelBgStyle: { fill: '#fff', fillOpacity: 0.8 },
                style: {
                    stroke: e.direction === 'incoming' ? '#3b82f6' : '#10b981',
                    strokeWidth: 2
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: e.direction === 'incoming' ? '#3b82f6' : '#10b981'
                }
            }));

            // Apply dagre layout
            const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);

            setFlowNodes(layoutedNodes);
            setFlowEdges(layoutedEdges);
        } catch (err) {
            setError('Failed to load graph: ' + err.message);
            setFlowNodes([]);
            setFlowEdges([]);
        } finally {
            setGraphLoading(false);
        }
    }, []);

    const handleSearch = () => {
        setNodePage(0);
        fetchNodes();
    };

    // Node CRUD operations
    const handleCreateNode = async () => {
        try {
            const res = await fetch(`${API_BASE}/node`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(nodeForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess('Node created successfully');
            setNodeDialogOpen(false);
            setNodeForm({ label: '', properties: {} });
            fetchNodes();
        } catch (err) {
            setError('Failed to create node: ' + err.message);
        }
    };

    const handleUpdateNode = async () => {
        try {
            const res = await fetch(`${API_BASE}/node/${editingNode.internalId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ properties: nodeForm.properties })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess('Node updated successfully');
            setNodeDialogOpen(false);
            setEditingNode(null);
            setNodeForm({ label: '', properties: {} });
            fetchNodes();
        } catch (err) {
            setError('Failed to update node: ' + err.message);
        }
    };

    const handleDeleteNode = async () => {
        try {
            const res = await fetch(`${API_BASE}/node/${deletingItem.internalId}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess(`Node deleted successfully (${data.deletedRelationships} relationships removed)`);
            setDeleteDialogOpen(false);
            setDeletingItem(null);
            fetchNodes();
            if (selectedNodeForGraph?.internalId === deletingItem.internalId) {
                setSelectedNodeForGraph(null);
                setFlowNodes([]);
                setFlowEdges([]);
            }
        } catch (err) {
            setError('Failed to delete node: ' + err.message);
        }
    };

    // Relationship CRUD operations
    const handleCreateRelationship = async () => {
        try {
            const res = await fetch(`${API_BASE}/relationship`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(relForm)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess('Relationship created successfully');
            setRelDialogOpen(false);
            setRelForm({ sourceId: '', targetId: '', type: '', properties: {} });
            fetchRelationships();
        } catch (err) {
            setError('Failed to create relationship: ' + err.message);
        }
    };

    const handleDeleteRelationship = async () => {
        try {
            const res = await fetch(`${API_BASE}/relationship/${deletingItem.id}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSuccess('Relationship deleted successfully');
            setDeleteDialogOpen(false);
            setDeletingItem(null);
            fetchRelationships();
        } catch (err) {
            setError('Failed to delete relationship: ' + err.message);
        }
    };

    const handleViewNodeNeighbors = async (node) => {
        try {
            const res = await fetch(`${API_BASE}/node/${node.internalId}/neighbors?depth=1`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setViewingNode({ ...node, neighbors: data.neighbors });
            setViewDialogOpen(true);
        } catch (err) {
            setError('Failed to fetch neighbors: ' + err.message);
        }
    };

    const openEditNodeDialog = (node) => {
        setEditingNode(node);
        setNodeForm({
            label: node.labels[0] || '',
            properties: { ...node.properties }
        });
        setNodeDialogOpen(true);
    };

    const openNewNodeDialog = () => {
        setEditingNode(null);
        setNodeForm({ label: '', properties: {} });
        setNodeDialogOpen(true);
    };

    const openNewRelDialog = () => {
        setRelForm({ sourceId: '', targetId: '', type: '', properties: {} });
        setRelDialogOpen(true);
    };

    const addProperty = () => {
        if (propertyInput.key && propertyInput.value) {
            if (tabValue === 0) {
                setNodeForm(prev => ({
                    ...prev,
                    properties: { ...prev.properties, [propertyInput.key]: propertyInput.value }
                }));
            } else {
                setRelForm(prev => ({
                    ...prev,
                    properties: { ...prev.properties, [propertyInput.key]: propertyInput.value }
                }));
            }
            setPropertyInput({ key: '', value: '' });
        }
    };

    const removeProperty = (key) => {
        if (tabValue === 0) {
            setNodeForm(prev => {
                const { [key]: _, ...rest } = prev.properties;
                return { ...prev, properties: rest };
            });
        } else {
            setRelForm(prev => {
                const { [key]: _, ...rest } = prev.properties;
                return { ...prev, properties: rest };
            });
        }
    };

    const formatPropertyValue = (value) => {
        if (value === null || value === undefined) return '-';
        if (typeof value === 'object') {
            if (value.year && value.month && value.day) {
                return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
            }
            return JSON.stringify(value);
        }
        if (typeof value === 'string' && value.length > 50) return value.substring(0, 50) + '...';
        return String(value);
    };

    const formatDate = (value) => {
        if (!value) return '-';
        if (typeof value === 'object' && value.year) {
            return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`;
        }
        if (typeof value === 'string') {
            try {
                return new Date(value).toLocaleDateString();
            } catch {
                return value;
            }
        }
        return '-';
    };

    // Client-side pagination for catalog mode (all nodes already loaded)
    const displayedNodes = useMemo(() => {
        if (!isCatalogMode) return nodes;
        const start = nodePage * nodeRowsPerPage;
        const end = start + nodeRowsPerPage;
        return nodes.slice(start, end);
    }, [nodes, nodePage, nodeRowsPerPage, isCatalogMode]);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" spacing={2}>
                    <Database size={24} />
                    <Typography variant="h6" fontWeight="bold">
                        Graph Database Manager
                    </Typography>
                </Stack>
            </Box>

            {/* Graph Catalog Selector Bar */}
            <Box sx={{
                px: 2,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                bgcolor: isCatalogMode ? 'rgba(139, 92, 246, 0.05)' : 'transparent'
            }}>
                <Stack direction="row" spacing={2} alignItems="center">
                    <FolderOpen size={18} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                    <Autocomplete
                        size="small"
                        options={catalogGraphs}
                        value={catalogGraphs.find(g => g.id === catalogGraphId) || null}
                        loading={catalogGraphsLoading}
                        getOptionLabel={(option) => `[${option.type || 'graph'}] ${option.name || option.id}`}
                        isOptionEqualToValue={(option, value) => option.id === value?.id}
                        onChange={(_, newValue) => {
                            if (newValue) {
                                loadCatalogGraph(newValue.id);
                            } else {
                                clearCatalogSelection();
                            }
                        }}
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Select Graph from Catalog"
                                placeholder="Browse catalog graphs..."
                                InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                        <>
                                            {catalogGraphsLoading ? <CircularProgress size={16} /> : null}
                                            {params.InputProps.endAdornment}
                                        </>
                                    )
                                }}
                            />
                        )}
                        renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: '100%' }}>
                                    {option.type === 'atomic' && <Atom size={14} />}
                                    {option.type === 'tool' && <Wrench size={14} />}
                                    {option.type === 'business' && <Briefcase size={14} />}
                                    {option.type === 'composite' && <Layers size={14} />}
                                    {option.type === 'template' && <FileCode size={14} />}
                                    {!['atomic','tool','business','composite','template'].includes(option.type) && <Database size={14} />}
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" noWrap>{option.name || option.id}</Typography>
                                        {option.description && (
                                            <Typography variant="caption" color="text.secondary" noWrap>
                                                {option.description}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Chip
                                        label={option.type || 'graph'}
                                        size="small"
                                        sx={{ height: 18, fontSize: '0.65rem' }}
                                    />
                                </Stack>
                            </li>
                        )}
                        sx={{ minWidth: 300, maxWidth: 500 }}
                    />

                    {/* Catalog Mode Indicator */}
                    {isCatalogMode && selectedCatalogGraph && (
                        <>
                            <Divider orientation="vertical" flexItem />
                            <Chip
                                icon={<Eye size={14} />}
                                label={`Viewing: ${selectedCatalogGraph.name}`}
                                color="secondary"
                                variant="outlined"
                                size="small"
                                onDelete={clearCatalogSelection}
                                sx={{ maxWidth: 250 }}
                            />
                            <Typography variant="caption" color="text.secondary">
                                {selectedCatalogGraph.nodes?.length || 0} nodes, {selectedCatalogGraph.edges?.length || 0} edges
                            </Typography>
                        </>
                    )}

                    {/* Refresh catalog list */}
                    <IconButton size="small" onClick={fetchCatalogGraphs} title="Refresh catalog">
                        <RefreshCw size={14} />
                    </IconButton>
                </Stack>
            </Box>

            {/* Main Content - Split View */}
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                {/* Left Panel - Table */}
                <Box sx={{
                    width: graphExpanded ? '40%' : '60%',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRight: 1,
                    borderColor: 'divider',
                    transition: 'width 0.3s'
                }}>
                    {/* Tabs */}
                    <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}>
                        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="standard">
                            <Tab icon={<Database size={16} />} iconPosition="start" label="Nodes" sx={{ minHeight: 48 }} />
                            <Tab icon={<Network size={16} />} iconPosition="start" label="Relationships" sx={{ minHeight: 48 }} />
                        </Tabs>
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                        {tabValue === 0 ? (
                            // Nodes Tab
                            <>
                                {/* Toolbar */}
                                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                    <Stack spacing={1}>
                                        {/* First Row: Search and Node Label */}
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                            <TextField
                                                size="small"
                                                placeholder="Search..."
                                                value={nodeSearch}
                                                onChange={(e) => setNodeSearch(e.target.value)}
                                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                                InputProps={{
                                                    startAdornment: (
                                                        <InputAdornment position="start">
                                                            <Search size={16} />
                                                        </InputAdornment>
                                                    )
                                                }}
                                                sx={{ width: 180 }}
                                            />
                                            <FormControl size="small" sx={{ minWidth: 120 }}>
                                                <InputLabel>Node Label</InputLabel>
                                                <Select
                                                    value={selectedLabel}
                                                    label="Node Label"
                                                    onChange={(e) => { setSelectedLabel(e.target.value); setNodePage(0); }}
                                                >
                                                    <MenuItem value="">All</MenuItem>
                                                    {nodeLabels.map(label => (
                                                        <MenuItem key={label} value={label}>{label}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                            <IconButton size="small" onClick={() => { fetchNodes(); fetchCatalogLabels(); }} title="Refresh">
                                                <RefreshCw size={16} />
                                            </IconButton>
                                            <Box sx={{ flex: 1 }} />
                                            {!isCatalogMode && (
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    startIcon={<Plus size={14} />}
                                                    onClick={openNewNodeDialog}
                                                >
                                                    Create
                                                </Button>
                                            )}
                                        </Stack>

                                        {/* Second Row: Tags Filter and Graph Type Filter */}
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                            <Autocomplete
                                                multiple
                                                size="small"
                                                options={catalogLabels}
                                                value={selectedCatalogLabels}
                                                loading={labelsLoading}
                                                onChange={(_, newValues) => {
                                                    setSelectedCatalogLabels(newValues);
                                                    setNodePage(0);
                                                }}
                                                renderInput={(params) => (
                                                    <TextField
                                                        {...params}
                                                        label="Filter by Tags"
                                                        placeholder={selectedCatalogLabels.length === 0 ? "Select tags..." : ""}
                                                        InputProps={{
                                                            ...params.InputProps,
                                                            startAdornment: (
                                                                <>
                                                                    <Tag size={14} style={{ marginLeft: 4, marginRight: 4, color: '#888' }} />
                                                                    {params.InputProps.startAdornment}
                                                                </>
                                                            )
                                                        }}
                                                    />
                                                )}
                                                renderTags={(value, getTagProps) =>
                                                    value.map((option, index) => (
                                                        <Chip
                                                            {...getTagProps({ index })}
                                                            key={option}
                                                            label={option}
                                                            size="small"
                                                            sx={{ height: 20, fontSize: '0.7rem', bgcolor: '#238636', color: '#fff' }}
                                                        />
                                                    ))
                                                }
                                                renderOption={(props, option) => (
                                                    <li {...props}>
                                                        <Chip
                                                            label={option}
                                                            size="small"
                                                            sx={{ bgcolor: '#30363d', color: '#e6edf3' }}
                                                        />
                                                    </li>
                                                )}
                                                sx={{ minWidth: 220, maxWidth: 350 }}
                                            />

                                            <FormControl size="small" sx={{ minWidth: 140 }}>
                                                <InputLabel>Graph Type</InputLabel>
                                                <Select
                                                    value={selectedGraphType}
                                                    label="Graph Type"
                                                    onChange={(e) => { setSelectedGraphType(e.target.value); setNodePage(0); }}
                                                >
                                                    <MenuItem value="">All Types</MenuItem>
                                                    {Object.entries(GRAPH_TYPE_INFO).map(([key, info]) => (
                                                        <MenuItem key={key} value={key}>
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                {key === 'atomic' && <Atom size={14} />}
                                                                {key === 'tool' && <Wrench size={14} />}
                                                                {key === 'business' && <Briefcase size={14} />}
                                                                {key === 'composite' && <Layers size={14} />}
                                                                {key === 'template' && <FileCode size={14} />}
                                                                <span>{info.label}</span>
                                                            </Stack>
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>

                                            {/* Clear Filters Button */}
                                            {(selectedCatalogLabels.length > 0 || selectedGraphType || selectedLabel) && (
                                                <Button
                                                    size="small"
                                                    variant="text"
                                                    onClick={() => {
                                                        setSelectedCatalogLabels([]);
                                                        setSelectedGraphType('');
                                                        setSelectedLabel('');
                                                        setNodePage(0);
                                                    }}
                                                    sx={{ color: '#888', textTransform: 'none' }}
                                                >
                                                    Clear filters
                                                </Button>
                                            )}
                                        </Stack>
                                    </Stack>
                                </Box>

                                {/* Table */}
                                <TableContainer sx={{ flex: 1 }}>
                                    <Table stickyHeader size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell padding="checkbox" />
                                                <TableCell>
                                                    <TableSortLabel
                                                        active={orderBy === 'name'}
                                                        direction={orderBy === 'name' ? order : 'asc'}
                                                        onClick={() => handleRequestSort('name')}
                                                    >
                                                        Name
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell>Labels</TableCell>
                                                <TableCell>
                                                    <TableSortLabel
                                                        active={orderBy === 'updatedAt'}
                                                        direction={orderBy === 'updatedAt' ? order : 'asc'}
                                                        onClick={() => handleRequestSort('updatedAt')}
                                                    >
                                                        Updated
                                                    </TableSortLabel>
                                                </TableCell>
                                                <TableCell align="right">Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {loading ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                                        <CircularProgress size={20} />
                                                    </TableCell>
                                                </TableRow>
                                            ) : nodes.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                        No nodes found
                                                    </TableCell>
                                                </TableRow>
                                            ) : displayedNodes.map((node) => (
                                                <TableRow
                                                    key={node.internalId}
                                                    hover
                                                    selected={selectedNodeForGraph?.internalId === node.internalId}
                                                    sx={{ cursor: 'pointer' }}
                                                    onClick={() => {
                                                        if (isCatalogMode) {
                                                            // Highlight node in ReactFlow
                                                            const nodeId = String(node.internalId);
                                                            setFlowNodes(prev => prev.map(fn => ({
                                                                ...fn,
                                                                selected: fn.id === nodeId
                                                            })));
                                                        } else {
                                                            loadGraphForNode(node);
                                                        }
                                                    }}
                                                >
                                                    <TableCell padding="checkbox">
                                                        <Box
                                                            sx={{
                                                                width: 8,
                                                                height: 8,
                                                                borderRadius: '50%',
                                                                bgcolor: getNodeColor(node.labels),
                                                                ml: 1
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                                            {node.properties.name || node.properties.title || node.id}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Stack direction="row" spacing={0.5}>
                                                            {node.labels.slice(0, 2).map(label => (
                                                                <Chip key={label} label={label} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                                                            ))}
                                                        </Stack>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {formatDate(node.properties.updatedAt || node.properties.createdAt)}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        {!isCatalogMode && (
                                                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleViewNodeNeighbors(node); }}>
                                                                <Eye size={14} />
                                                            </IconButton>
                                                        )}
                                                        {!isCatalogMode && (
                                                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEditNodeDialog(node); }}>
                                                                <Pencil size={14} />
                                                            </IconButton>
                                                        )}
                                                        {!isCatalogMode && (
                                                            <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDeletingItem({ ...node, type: 'node' }); setDeleteDialogOpen(true); }}>
                                                                <Trash2 size={14} />
                                                            </IconButton>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                {/* Pagination */}
                                <TablePagination
                                    component="div"
                                    count={nodeTotal}
                                    page={nodePage}
                                    onPageChange={(_, p) => setNodePage(p)}
                                    rowsPerPage={nodeRowsPerPage}
                                    onRowsPerPageChange={(e) => { setNodeRowsPerPage(parseInt(e.target.value)); setNodePage(0); }}
                                    rowsPerPageOptions={[10, 25, 50]}
                                    sx={{ borderTop: 1, borderColor: 'divider' }}
                                />
                            </>
                        ) : (
                            // Relationships Tab
                            <>
                                <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <FormControl size="small" sx={{ minWidth: 150 }}>
                                            <InputLabel>Type</InputLabel>
                                            <Select
                                                value={selectedRelType}
                                                label="Type"
                                                onChange={(e) => { setSelectedRelType(e.target.value); setRelPage(0); }}
                                            >
                                                <MenuItem value="">All</MenuItem>
                                                {relationshipTypes.map(type => (
                                                    <MenuItem key={type} value={type}>{type}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                        <IconButton size="small" onClick={fetchRelationships}>
                                            <RefreshCw size={16} />
                                        </IconButton>
                                        <Box sx={{ flex: 1 }} />
                                        <Button size="small" variant="contained" startIcon={<Link2 size={14} />} onClick={openNewRelDialog}>
                                            Create
                                        </Button>
                                    </Stack>
                                </Box>

                                <TableContainer sx={{ flex: 1 }}>
                                    <Table stickyHeader size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Source</TableCell>
                                                <TableCell align="center">Type</TableCell>
                                                <TableCell>Target</TableCell>
                                                <TableCell align="right">Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {loading ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                                        <CircularProgress size={20} />
                                                    </TableCell>
                                                </TableRow>
                                            ) : relationships.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                        No relationships found
                                                    </TableCell>
                                                </TableRow>
                                            ) : relationships.map((rel) => (
                                                <TableRow key={rel.id} hover>
                                                    <TableCell>
                                                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                                            {rel.source.name || rel.source.id}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Chip label={rel.type} size="small" color="secondary" sx={{ height: 20, fontSize: '0.65rem' }} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                                                            {rel.target.name || rel.target.id}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <IconButton size="small" color="error" onClick={() => { setDeletingItem({ ...rel, type: 'relationship' }); setDeleteDialogOpen(true); }}>
                                                            <Unlink size={14} />
                                                        </IconButton>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                <TablePagination
                                    component="div"
                                    count={-1}
                                    page={relPage}
                                    onPageChange={(_, p) => setRelPage(p)}
                                    rowsPerPage={relRowsPerPage}
                                    onRowsPerPageChange={(e) => { setRelRowsPerPage(parseInt(e.target.value)); setRelPage(0); }}
                                    rowsPerPageOptions={[10, 25, 50]}
                                    sx={{ borderTop: 1, borderColor: 'divider' }}
                                />
                            </>
                        )}
                    </Box>
                </Box>

                {/* Right Panel - Graph Visualization */}
                <Box sx={{
                    width: graphExpanded ? '60%' : '40%',
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: '#0a0e1a',
                    transition: 'width 0.3s'
                }}>
                    {/* Graph Meta Info Header */}
                    <Box sx={{
                        p: 1.5,
                        borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <Typography variant="subtitle2" sx={{ color: isCatalogMode ? '#8b5cf6' : '#3b82f6', fontFamily: 'monospace', letterSpacing: 1 }}>
                                {isCatalogMode ? 'CATALOG VIEW' : 'GRAPH VIEW'}
                            </Typography>
                            {isCatalogMode && selectedCatalogGraph && (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
                                    <Typography variant="caption" sx={{ color: '#d8b4fe' }}>
                                        {selectedCatalogGraph.name}
                                    </Typography>
                                    <Chip label={selectedCatalogGraph.type} size="small" sx={{ height: 16, fontSize: '0.6rem', bgcolor: 'rgba(139,92,246,0.15)', color: '#d8b4fe' }} />
                                </Stack>
                            )}
                            {!isCatalogMode && selectedNodeForGraph && (
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Divider orientation="vertical" flexItem sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getNodeColor(selectedNodeForGraph.labels) }} />
                                    <Typography variant="caption" sx={{ color: '#fff' }}>
                                        {selectedNodeForGraph.properties?.name || selectedNodeForGraph.properties?.title || selectedNodeForGraph.id}
                                    </Typography>
                                </Stack>
                            )}
                        </Stack>
                        <Stack direction="row" spacing={1}>
                            {flowNodes.length > 0 && (
                                <Stack direction="row" spacing={2} sx={{ mr: 2 }}>
                                    <Typography variant="caption" sx={{ color: '#888' }}>
                                        Nodes: <span style={{ color: '#3b82f6' }}>{flowNodes.length}</span>
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: '#888' }}>
                                        Edges: <span style={{ color: '#3b82f6' }}>{flowEdges.length}</span>
                                    </Typography>
                                </Stack>
                            )}
                            <Tooltip title={graphExpanded ? 'Collapse' : 'Expand'}>
                                <IconButton size="small" onClick={() => setGraphExpanded(!graphExpanded)} sx={{ color: '#3b82f6' }}>
                                    {graphExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    </Box>

                    {/* Graph Container */}
                    <Box sx={{ flex: 1, position: 'relative' }}>
                        {graphLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                                <CircularProgress size={32} sx={{ color: '#3b82f6' }} />
                            </Box>
                        ) : flowNodes.length === 0 ? (
                            <Box sx={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                height: '100%',
                                flexDirection: 'column',
                                color: '#64748b'
                            }}>
                                <Network size={48} strokeWidth={1} />
                                <Typography variant="body2" sx={{ mt: 2 }}>
                                    {isCatalogMode ? 'Selected catalog graph has no nodes' : 'Select a node or choose a graph from the catalog'}
                                </Typography>
                            </Box>
                        ) : (
                            <ReactFlow
                                nodes={flowNodes}
                                edges={flowEdges}
                                onNodesChange={onNodesChange}
                                onEdgesChange={onEdgesChange}
                                nodeTypes={nodeTypes}
                                fitView
                                fitViewOptions={{ padding: 0.3 }}
                                style={{ background: '#0d1117' }}
                                proOptions={{ hideAttribution: true }}
                            >
                                <Controls
                                    style={{
                                        backgroundColor: '#21262d',
                                        border: '1px solid #30363d',
                                        borderRadius: 8
                                    }}
                                />
                                <Background color="#30363d" gap={20} />
                            </ReactFlow>
                        )}

                        {/* Catalog Graph Legend */}
                        {isCatalogMode && selectedCatalogGraph && flowNodes.length > 0 && (
                            <Box sx={{
                                position: 'absolute',
                                bottom: 16,
                                left: 16,
                                bgcolor: 'rgba(10, 14, 26, 0.95)',
                                border: '1px solid rgba(139, 92, 246, 0.5)',
                                borderRadius: 1,
                                p: 1.5,
                                maxWidth: 280,
                                zIndex: 10
                            }}>
                                <Typography variant="caption" sx={{ color: '#8b5cf6', fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                    CATALOG GRAPH
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#fff', mb: 0.5 }}>
                                    {selectedCatalogGraph.name}
                                </Typography>
                                {selectedCatalogGraph.description && (
                                    <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 0.5 }}>
                                        {selectedCatalogGraph.description}
                                    </Typography>
                                )}
                                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                    {selectedCatalogGraph.tags?.map(tag => (
                                        <Chip key={tag} label={tag} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#238636', color: '#fff' }} />
                                    ))}
                                </Stack>
                            </Box>
                        )}

                        {/* Selected Node Legend */}
                        {!isCatalogMode && selectedNodeForGraph && flowNodes.length > 0 && (
                            <Box sx={{
                                position: 'absolute',
                                bottom: 16,
                                left: 16,
                                bgcolor: 'rgba(10, 14, 26, 0.95)',
                                border: '1px solid rgba(59, 130, 246, 0.5)',
                                borderRadius: 1,
                                p: 1.5,
                                maxWidth: 250,
                                zIndex: 10
                            }}>
                                <Typography variant="caption" sx={{ color: '#3b82f6', fontWeight: 'bold', display: 'block', mb: 0.5 }}>
                                    CENTER NODE
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#fff', mb: 0.5 }}>
                                    {selectedNodeForGraph.properties?.name || selectedNodeForGraph.properties?.title || selectedNodeForGraph.id}
                                </Typography>
                                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                    {selectedNodeForGraph.labels?.map(label => (
                                        <Chip
                                            key={label}
                                            label={label}
                                            size="small"
                                            sx={{
                                                height: 18,
                                                fontSize: '0.65rem',
                                                bgcolor: getNodeColor([label]),
                                                color: '#fff'
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>

            {/* Node Dialog */}
            <Dialog open={nodeDialogOpen} onClose={() => setNodeDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editingNode ? 'Edit Node' : 'Create New Node'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <FormControl fullWidth disabled={!!editingNode} size="small">
                            <InputLabel>Label</InputLabel>
                            <Select
                                value={nodeForm.label}
                                label="Label"
                                onChange={(e) => setNodeForm(prev => ({ ...prev, label: e.target.value }))}
                            >
                                {nodeLabels.map(label => (
                                    <MenuItem key={label} value={label}>{label}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Divider>Properties</Divider>

                        {Object.entries(nodeForm.properties).filter(([k]) => !['createdAt', 'updatedAt'].includes(k)).map(([key, value]) => (
                            <Stack key={key} direction="row" spacing={1} alignItems="center">
                                <TextField size="small" label="Key" value={key} disabled sx={{ flex: 1 }} />
                                <TextField
                                    size="small"
                                    label="Value"
                                    value={formatPropertyValue(value)}
                                    onChange={(e) => setNodeForm(prev => ({
                                        ...prev,
                                        properties: { ...prev.properties, [key]: e.target.value }
                                    }))}
                                    sx={{ flex: 2 }}
                                />
                                <IconButton size="small" color="error" onClick={() => removeProperty(key)}>
                                    <Trash2 size={14} />
                                </IconButton>
                            </Stack>
                        ))}

                        <Stack direction="row" spacing={1}>
                            <TextField
                                size="small"
                                label="New Key"
                                value={propertyInput.key}
                                onChange={(e) => setPropertyInput(prev => ({ ...prev, key: e.target.value }))}
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                size="small"
                                label="Value"
                                value={propertyInput.value}
                                onChange={(e) => setPropertyInput(prev => ({ ...prev, value: e.target.value }))}
                                sx={{ flex: 2 }}
                            />
                            <Button variant="outlined" size="small" onClick={addProperty}>Add</Button>
                        </Stack>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNodeDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={editingNode ? handleUpdateNode : handleCreateNode}
                        disabled={!editingNode && !nodeForm.label}
                    >
                        {editingNode ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Relationship Dialog */}
            <Dialog open={relDialogOpen} onClose={() => setRelDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New Relationship</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Source Node ID"
                            value={relForm.sourceId}
                            onChange={(e) => setRelForm(prev => ({ ...prev, sourceId: e.target.value }))}
                            helperText="Internal ID or custom ID"
                        />
                        <FormControl fullWidth size="small">
                            <InputLabel>Relationship Type</InputLabel>
                            <Select
                                value={relForm.type}
                                label="Relationship Type"
                                onChange={(e) => setRelForm(prev => ({ ...prev, type: e.target.value }))}
                            >
                                {relationshipTypes.map(type => (
                                    <MenuItem key={type} value={type}>{type}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            size="small"
                            label="Target Node ID"
                            value={relForm.targetId}
                            onChange={(e) => setRelForm(prev => ({ ...prev, targetId: e.target.value }))}
                            helperText="Internal ID or custom ID"
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRelDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={handleCreateRelationship}
                        disabled={!relForm.sourceId || !relForm.targetId || !relForm.type}
                    >
                        Create
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>Confirm Deletion</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete this {deletingItem?.type}?
                        {deletingItem?.type === 'node' && ' All connected relationships will also be deleted.'}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={deletingItem?.type === 'node' ? handleDeleteNode : handleDeleteRelationship}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>

            {/* View Node Dialog */}
            <Dialog open={viewDialogOpen} onClose={() => setViewDialogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>
                    Node: {viewingNode?.properties?.name || viewingNode?.properties?.title || viewingNode?.id}
                </DialogTitle>
                <DialogContent dividers>
                    {viewingNode && (
                        <Stack spacing={2}>
                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">Labels</Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                                    {viewingNode.labels?.map(label => (
                                        <Chip key={label} label={label} size="small" sx={{ bgcolor: getNodeColor([label]), color: '#fff' }} />
                                    ))}
                                </Stack>
                            </Box>

                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">Properties</Typography>
                                <Paper variant="outlined" sx={{ mt: 1, p: 1.5 }}>
                                    <Stack spacing={0.5}>
                                        {Object.entries(viewingNode.properties || {}).map(([key, value]) => (
                                            <Stack key={key} direction="row" spacing={1}>
                                                <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 100 }}>
                                                    {key}:
                                                </Typography>
                                                <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                                    {formatPropertyValue(value)}
                                                </Typography>
                                            </Stack>
                                        ))}
                                    </Stack>
                                </Paper>
                            </Box>

                            <Box>
                                <Typography variant="subtitle2" color="text.secondary">
                                    Neighbors ({viewingNode.neighbors?.length || 0})
                                </Typography>
                                {viewingNode.neighbors?.length > 0 ? (
                                    <Stack spacing={0.5} sx={{ mt: 1, maxHeight: 200, overflow: 'auto' }}>
                                        {viewingNode.neighbors.map((neighbor, idx) => (
                                            <Paper key={idx} variant="outlined" sx={{ p: 1 }}>
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: getNodeColor(neighbor.labels) }} />
                                                    <Typography variant="body2">
                                                        {neighbor.name || neighbor.title || neighbor.id}
                                                    </Typography>
                                                    {neighbor.labels?.slice(0, 1).map(l => (
                                                        <Chip key={l} label={l} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                                                    ))}
                                                </Stack>
                                            </Paper>
                                        ))}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                        No neighbors found
                                    </Typography>
                                )}
                            </Box>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setViewDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Snackbars */}
            <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
                <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
            </Snackbar>
            <Snackbar open={!!success} autoHideDuration={4000} onClose={() => setSuccess(null)}>
                <Alert severity="success" onClose={() => setSuccess(null)}>{success}</Alert>
            </Snackbar>
        </Box>
    );
};

export default GraphCRUDPage;

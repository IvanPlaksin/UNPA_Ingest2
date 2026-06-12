/**
 * DocumentGraphTab
 * Two-mode knowledge graph visualization for a document's extracted entities:
 *   2D — ReactFlow with dagre layout (GXEVisualizerPage visual language)
 *   3D — SingularityGraph with externalData (Singularity visual language)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactFlow, {
    MiniMap, Controls, Background,
    useNodesState, useEdgesState,
    MarkerType, Handle, Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import {
    Box, Typography, CircularProgress, Alert,
    Stack, Chip, IconButton, Tooltip,
} from '@mui/material';
import { Network, Box as Box3D } from 'lucide-react';
import SingularityGraph from '../Singularity/SingularityGraph';
import { getDocumentGraph } from '../../services/documentProcessing.service';

/* ── palette (matches GXEVisualizerPage dark visual language) ─────────────── */

const ENTITY_PALETTE = {
    ACTOR:        { bg: '#1e293b', border: '#3b82f6', text: '#93c5fd' },
    ORGANIZATION: { bg: '#1e293b', border: '#3b82f6', text: '#93c5fd' },
    CONCEPT:      { bg: '#1a2e2e', border: '#06b6d4', text: '#67e8f9' },
    DOCUMENT:     { bg: '#1a1a2e', border: '#8b5cf6', text: '#c4b5fd' },
    EVENT:        { bg: '#2e2a1a', border: '#eab308', text: '#fde047' },
    PROCESS:      { bg: '#2e2a1a', border: '#eab308', text: '#fde047' },
    PERSON:       { bg: '#1a2e1a', border: '#22c55e', text: '#86efac' },
    TECHNOLOGY:   { bg: '#2e1a2e', border: '#a855f7', text: '#d8b4fe' },
    POLICY:       { bg: '#2e1a1a', border: '#ef4444', text: '#fca5a5' },
    SYSTEM:       { bg: '#1a2e2e', border: '#0891b2', text: '#67e8f9' },
    WORK_ITEM:    { bg: '#1e1e2e', border: '#6b7280', text: '#9ca3af' },
    document_root:{ bg: '#0f172a', border: '#2563eb', text: '#93c5fd' },
    default:      { bg: '#1e1e2e', border: '#6b7280', text: '#9ca3af' },
};

const SINGULARITY_COLORS = {
    ACTOR:        '#3b82f6',
    ORGANIZATION: '#3b82f6',
    CONCEPT:      '#06b6d4',
    DOCUMENT:     '#8b5cf6',
    EVENT:        '#eab308',
    PROCESS:      '#eab308',
    PERSON:       '#22c55e',
    TECHNOLOGY:   '#a855f7',
    POLICY:       '#ef4444',
    SYSTEM:       '#0891b2',
    WORK_ITEM:    '#6b7280',
    document_root:'#2563eb',
    default:      '#6b7280',
};

/* ── custom ReactFlow nodes ───────────────────────────────────────────────── */

function EntityNode({ data, selected }) {
    const c = ENTITY_PALETTE[data.entityType?.toUpperCase()] || ENTITY_PALETTE.default;
    return (
        <div style={{
            position: 'relative',
            padding: '8px 12px',
            borderRadius: 8,
            border: `2px solid ${c.border}`,
            backgroundColor: c.bg,
            boxShadow: selected ? `0 0 0 2px #fff, 0 0 16px ${c.border}` : `0 0 8px ${c.border}40`,
            minWidth: 140,
            maxWidth: 200,
        }}>
            <Handle type="target" position={Position.Top}
                style={{ width: 8, height: 8, background: c.border, border: 'none' }} />
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography sx={{
                    fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.07em', color: c.text,
                    bgcolor: `${c.border}20`, px: 0.75, py: 0.25, borderRadius: 0.5,
                }}>
                    {data.entityType}
                </Typography>
                {data.isExisting && (
                    <Typography sx={{
                        fontSize: '0.55rem', color: '#86efac',
                        bgcolor: '#14532d40', border: '1px solid #166534',
                        px: 0.5, py: 0.1, borderRadius: 0.5,
                    }}>
                        known
                    </Typography>
                )}
            </Stack>
            <Typography sx={{
                fontSize: '0.78rem', fontWeight: 600, color: '#f8fafc',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {data.label}
            </Typography>
            {data.description && (
                <Typography sx={{
                    fontSize: '0.62rem', color: c.text, opacity: 0.65, mt: 0.25,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {data.description}
                </Typography>
            )}
            <Handle type="source" position={Position.Bottom}
                style={{ width: 8, height: 8, background: c.border, border: 'none' }} />
        </div>
    );
}

function DocumentRootNode({ data, selected }) {
    return (
        <div style={{
            position: 'relative',
            padding: '10px 16px',
            borderRadius: 10,
            border: '2px solid #2563eb',
            backgroundColor: '#0f172a',
            boxShadow: selected
                ? '0 0 0 2px #fff, 0 0 24px rgba(37,99,235,0.7)'
                : '0 0 20px rgba(37,99,235,0.5)',
            minWidth: 180,
            maxWidth: 280,
        }}>
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
                <Typography sx={{
                    fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
                    color: '#93c5fd', bgcolor: '#2563eb20', px: 0.75, py: 0.25, borderRadius: 0.5,
                }}>
                    {data.docType || 'document'}
                </Typography>
                {data.docLayer && (
                    <Typography sx={{
                        fontSize: '0.55rem', color: '#c4b5fd', bgcolor: '#7c3aed20',
                        px: 0.5, py: 0.1, borderRadius: 0.5,
                    }}>
                        {data.docLayer}
                    </Typography>
                )}
            </Stack>
            <Typography sx={{
                fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
                {data.label}
            </Typography>
            <Handle type="source" position={Position.Bottom}
                style={{ width: 8, height: 8, background: '#2563eb', border: 'none' }} />
        </div>
    );
}

const NODE_TYPES = { entity: EntityNode, document_root: DocumentRootNode };

/* ── dagre layout ─────────────────────────────────────────────────────────── */

function applyDagreLayout(nodes, edges) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 70, nodesep: 45, align: 'UL' });
    nodes.forEach(n => g.setNode(n.id, { width: 190, height: 80 }));
    edges.forEach(e => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (g.hasNode(src) && g.hasNode(tgt)) g.setEdge(src, tgt);
    });
    dagre.layout(g);
    return nodes.map(n => {
        const pos = g.node(n.id);
        return { ...n, position: { x: pos.x - 95, y: pos.y - 40 } };
    });
}

/* ── data converters ──────────────────────────────────────────────────────── */

function toReactFlowFormat(graphData, doc) {
    const rootLabel = doc?.documentTitle || doc?.originalname || 'Document';
    const rfNodes = [
        {
            id:   'doc-root',
            type: 'document_root',
            data: {
                label:    rootLabel.length > 40 ? rootLabel.slice(0, 37) + '…' : rootLabel,
                docType:  doc?.documentType  || null,
                docLayer: doc?.epistemicLayer || null,
            },
            position: { x: 0, y: 0 },
        },
        ...graphData.entities.map(e => ({
            id:   e.id,
            type: 'entity',
            data: {
                label:       e.name,
                entityType:  (e.type || 'default').toUpperCase(),
                description: e.description || e.match || null,
                isExisting:  e.isExisting || false,
                relevance:   e.relevance,
            },
            position: { x: 0, y: 0 },
        })),
    ];

    const docEdges = graphData.entities.map(e => ({
        id:        `doc-${e.id}`,
        source:    'doc-root',
        target:    e.id,
        type:      'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#374151', width: 12, height: 12 },
        style:     { stroke: '#374151', strokeWidth: 1.2 },
        label:     'mentions',
        labelStyle:    { fill: '#6b7280', fontSize: 8 },
        labelBgStyle:  { fill: '#0d1117', fillOpacity: 0.85 },
        labelBgPadding: [2, 3],
    }));

    const relEdges = graphData.relationships
        .filter(r => r.sourceId && r.targetId)
        .map((r, i) => ({
            id:        `rel-${i}-${r.sourceId}-${r.targetId}`,
            source:    r.sourceId,
            target:    r.targetId,
            type:      'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 12, height: 12 },
            style:     { stroke: '#7c3aed', strokeWidth: 1.5, strokeDasharray: '5 3' },
            label:     r.relType?.replace(/_/g, ' ').toLowerCase() || 'related',
            labelStyle:    { fill: '#a78bfa', fontSize: 8 },
            labelBgStyle:  { fill: '#0d1117', fillOpacity: 0.85 },
            labelBgPadding: [2, 3],
        }));

    return {
        nodes: applyDagreLayout(rfNodes, [...docEdges, ...relEdges]),
        edges: [...docEdges, ...relEdges],
    };
}

function toSingularityFormat(graphData, doc) {
    const docNode = {
        id:         'doc-root',
        name:       doc?.documentTitle || doc?.originalname || 'Document',
        type:       'document',
        val:        22,
        color:      '#2563eb',
        level:      0,
        loaded:     true,
        hasSubGraph: false,
        data:       doc,
    };
    const entityNodes = graphData.entities.map(e => ({
        id:         e.id,
        name:       e.name,
        type:       (e.type || 'workItem').toLowerCase(),
        val:        e.relevance === 'HIGH' ? 12 : e.isExisting ? 10 : 6,
        color:      SINGULARITY_COLORS[(e.type || '').toUpperCase()] || '#6b7280',
        level:      1,
        loaded:     true,
        hasSubGraph: false,
        data:       e,
    }));
    const docLinks = graphData.entities.map(e => ({
        source: 'doc-root',
        target: e.id,
        type:   'MENTIONS',
    }));
    const relLinks = graphData.relationships
        .filter(r => r.sourceId && r.targetId)
        .map(r => ({
            source: r.sourceId,
            target: r.targetId,
            type:   r.relType || 'RELATED_TO',
        }));
    return {
        nodes: [docNode, ...entityNodes],
        links: [...docLinks, ...relLinks],
    };
}

/* ── main component ───────────────────────────────────────────────────────── */

export default function DocumentGraphTab({ doc }) {
    const [viewMode,   setViewMode]   = useState('reactflow');
    const [graphData,  setGraphData]  = useState(null);
    const [loading,    setLoading]    = useState(false);
    const [error,      setError]      = useState(null);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    useEffect(() => {
        if (!doc?.id) return;
        setLoading(true);
        setError(null);
        setGraphData(null);
        getDocumentGraph(doc.id)
            .then(data => setGraphData(data))
            .catch(e => setError(e.response?.data?.error || e.message))
            .finally(() => setLoading(false));
    }, [doc?.id]);

    useEffect(() => {
        if (!graphData || viewMode !== 'reactflow') return;
        const { nodes: rfNodes, edges: rfEdges } = toReactFlowFormat(graphData, doc);
        setNodes(rfNodes);
        setEdges(rfEdges);
    }, [graphData, doc, viewMode]);

    const singularityData = useMemo(
        () => graphData ? toSingularityFormat(graphData, doc) : null,
        [graphData, doc]
    );

    /* ── loading / error / empty states ─────────────────────────────────── */

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
                <Stack alignItems="center" spacing={1.5}>
                    <CircularProgress size={28} />
                    <Typography variant="caption" color="text.secondary">
                        Loading knowledge graph…
                    </Typography>
                </Stack>
            </Box>
        );
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>
        );
    }

    if (!graphData) return null;

    const entityCount = graphData.entities.length;
    const relCount    = graphData.relationships.length;

    if (entityCount === 0) {
        return (
            <Box sx={{ py: 6, textAlign: 'center' }}>
                <Network size={32} style={{ opacity: 0.25, marginBottom: 12 }} />
                <Typography variant="body2" color="text.secondary">
                    No entities extracted yet.
                </Typography>
                <Typography variant="caption" color="text.disabled">
                    Run extraction to build the knowledge graph for this document.
                </Typography>
            </Box>
        );
    }

    /* ── render ──────────────────────────────────────────────────────────── */

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 480 }}>

            {/* toolbar */}
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.25, flexShrink: 0 }}>
                <Stack direction="row" spacing={0.5}>
                    <Chip size="small" label={`${entityCount} entities`}
                        sx={{ fontSize: '0.65rem', height: 20 }} />
                    {relCount > 0 && (
                        <Chip size="small" label={`${relCount} links`}
                            variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
                    )}
                </Stack>
                <Box flex={1} />
                <Tooltip title="2D flow graph — GXE style">
                    <IconButton size="small" onClick={() => setViewMode('reactflow')}
                        sx={{
                            border: '1px solid',
                            borderColor: viewMode === 'reactflow' ? 'primary.main' : 'divider',
                            bgcolor: viewMode === 'reactflow' ? 'primary.dark' : 'transparent',
                            '&:hover': { bgcolor: viewMode === 'reactflow' ? 'primary.dark' : 'action.hover' },
                        }}>
                        <Network size={15} />
                    </IconButton>
                </Tooltip>
                <Tooltip title="3D force graph — Singularity style">
                    <IconButton size="small" onClick={() => setViewMode('singularity')}
                        sx={{
                            border: '1px solid',
                            borderColor: viewMode === 'singularity' ? 'primary.main' : 'divider',
                            bgcolor: viewMode === 'singularity' ? 'primary.dark' : 'transparent',
                            '&:hover': { bgcolor: viewMode === 'singularity' ? 'primary.dark' : 'action.hover' },
                        }}>
                        <Box3D size={15} />
                    </IconButton>
                </Tooltip>
            </Stack>

            {/* 2D ReactFlow view */}
            {viewMode === 'reactflow' && (
                <Box sx={{
                    flex: 1,
                    borderRadius: 1,
                    overflow: 'hidden',
                    bgcolor: '#0d1117',
                    border: '1px solid #21262d',
                }}>
                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        nodeTypes={NODE_TYPES}
                        fitView
                        fitViewOptions={{ padding: 0.25, maxZoom: 1.2 }}
                        minZoom={0.2}
                        maxZoom={2.5}
                        attributionPosition="bottom-left"
                        proOptions={{ hideAttribution: true }}
                    >
                        <Background color="#21262d" gap={20} size={1} />
                        <Controls
                            style={{ background: '#161b22', border: '1px solid #21262d' }}
                        />
                        <MiniMap
                            nodeColor={n => {
                                const type = n.data?.entityType?.toUpperCase();
                                return ENTITY_PALETTE[type]?.border
                                    || (n.type === 'document_root' ? '#2563eb' : '#6b7280');
                            }}
                            style={{ background: '#0d1117', border: '1px solid #21262d' }}
                            maskColor="rgba(0,0,0,0.6)"
                        />
                    </ReactFlow>
                </Box>
            )}

            {/* 3D Singularity view */}
            {viewMode === 'singularity' && singularityData && (
                <Box sx={{ flex: 1, borderRadius: 1, overflow: 'hidden' }}>
                    <SingularityGraph externalData={singularityData} />
                </Box>
            )}
        </Box>
    );
}

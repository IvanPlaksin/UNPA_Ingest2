import React, { useEffect, useCallback, useRef, useState } from 'react';
import ReactFlow, {
    MiniMap, Controls, Background,
    useNodesState, useEdgesState, useReactFlow, useViewport, useStore,
    MarkerType, Handle, Position,
    getBezierPath, BaseEdge, EdgeLabelRenderer,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Typography, Tooltip, CircularProgress, Chip } from '@mui/material';
import { useEntityStore } from '../../stores/entityStore.store';
import { computeLayout } from '../../services/layoutEngine.service';
import HullOverlay from './HullOverlay';
import ClusterNode from './ClusterNode';
import { computeLodLevel, getInitialLodLevel, setMaxPyramidLevel, LEVEL_NAMES } from './LodController';
import { debounce } from '../../utils/debounce';

/* ── Colour palette ──────────────────────────────────────────────────────── */

export const PALETTE = {
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
    default:      { bg: '#1e1e2e', border: '#6b7280', text: '#9ca3af' },
};

/* ── Custom node ─────────────────────────────────────────────────────────── */

function ESNode({ data, selected }) {
    const c = PALETTE[(data.type || '').toUpperCase()] || PALETTE.default;
    return (
        <div style={{
            padding: '8px 12px', borderRadius: 8,
            border: `2px solid ${c.border}`, backgroundColor: c.bg,
            boxShadow: selected ? `0 0 0 2px #fff, 0 0 16px ${c.border}` : `0 0 8px ${c.border}40`,
            minWidth: 130, maxWidth: 200, cursor: 'pointer',
        }}>
            <Handle type="target" position={Position.Top}
                style={{ width: 7, height: 7, background: c.border, border: 'none' }} />
            <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
                color: c.text, bgcolor: `${c.border}20`, px: 0.75, py: 0.2, borderRadius: 0.5,
                display: 'inline-block', mb: 0.4, letterSpacing: '0.07em' }}>
                {data.type}
            </Typography>
            {data.namespace && (
                <Typography sx={{ fontSize: '0.55rem', color: '#94a3b8', ml: 0.5,
                    bgcolor: '#ffffff10', px: 0.5, py: 0.1, borderRadius: 0.5, display: 'inline-block' }}>
                    {data.namespace}
                </Typography>
            )}
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data.label}
            </Typography>
            {data.mentionCount > 0 && (
                <Typography sx={{ fontSize: '0.6rem', color: '#64748b', mt: 0.25 }}>
                    {data.mentionCount} mention{data.mentionCount !== 1 ? 's' : ''}
                </Typography>
            )}
            <Handle type="source" position={Position.Bottom}
                style={{ width: 7, height: 7, background: c.border, border: 'none' }} />
        </div>
    );
}

/* ── Custom edge ─────────────────────────────────────────────────────────── */

function RelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, label, markerEnd, style }) {
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    });
    return (
        <>
            <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
            {label && (
                <EdgeLabelRenderer>
                    <Tooltip
                        title={data?.context
                            ? <span style={{ fontStyle: 'italic', fontSize: '0.72rem' }}>"{data.context}"</span>
                            : ''}
                        placement="top" arrow
                        componentsProps={{ tooltip: { sx: { maxWidth: 340, lineHeight: 1.5 } } }}>
                        <div style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                        }}>
                            <Typography component="span" sx={{
                                fontSize: '0.5rem', color: '#a78bfa',
                                background: '#0d1117cc',
                                px: '3px', py: '1px', borderRadius: 0.5,
                                cursor: data?.context ? 'help' : 'default',
                                border: data?.context ? '1px solid #7c3aed40' : 'none',
                                textTransform: 'lowercase', letterSpacing: '0.02em',
                            }}>
                                {String(label).replace(/_/g, ' ')}
                            </Typography>
                        </div>
                    </Tooltip>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

const NODE_TYPES = { es: ESNode, cluster: ClusterNode };
const EDGE_TYPES = { rel: RelEdge };

/* ── Auto-fit after layout (must be inside ReactFlow's provider tree) ──────── */
function AutoFitView({ trigger }) {
    const { fitView } = useReactFlow();
    useEffect(() => {
        if (trigger <= 0) return;
        const t = setTimeout(() => fitView({ padding: 0.15, maxZoom: 1.2 }), 80);
        return () => clearTimeout(t);
    }, [trigger, fitView]);
    return null;
}

/* ── Helper: API graphData → ReactFlow format ────────────────────────────── */

function buildRfData(graphData) {
    const rfNodes = (graphData?.entities || []).map(e => ({
        id:       e.id,
        type:     'es',
        position: { x: 0, y: 0 },
        data: {
            label:        e.name,
            type:         (e.type || 'default').toUpperCase(),
            namespace:    e.namespace,
            mentionCount: e.mentionCount,
        },
        // Explicit dimensions so layout engines know node size
        width:  200,
        height: 70,
    }));

    const rfEdges = (graphData?.relationships || [])
        .filter(r => r.sourceId && r.targetId)
        .map((r, i) => ({
            id:        `e-${(r.sourceId || '').slice(0, 8)}-${(r.targetId || '').slice(0, 8)}-${r.relType || i}`,
            source:    r.sourceId,
            target:    r.targetId,
            type:      'rel',
            markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 10, height: 10 },
            style:     { stroke: '#7c3aed', strokeWidth: 1.0, opacity: 0.6 },
            label:     r.relType || 'RELATED_TO',
            data:      { context: r.context || null, confidence: r.confidence ?? null },
        }));

    return { rfNodes, rfEdges };
}

/* ── Viewport data → ReactFlow format ───────────────────────────────────── */

function buildRfDataFromViewport(vpNodes, vpEdges) {
    const rfNodes = vpNodes.map(n => {
        if (n.type === 'cluster') {
            return {
                id:       n.id,
                type:     'cluster',
                position: { x: n.x ?? 0, y: n.y ?? 0 },
                data: {
                    id:          n.id,
                    label:       n.label,
                    level:       n.level,
                    memberCount: n.memberCount,
                    dominantType: n.dominantType,
                    expandable:  n.expandable !== false,
                },
                width:  220,
                height: 80,
            };
        }
        return {
            id:       n.id,
            type:     'es',
            position: { x: n.x ?? 0, y: n.y ?? 0 },
            data: {
                label:        n.label,
                type:         (n.entityType || n.type || 'CONCEPT').toUpperCase(),
                namespace:    n.namespace,
                mentionCount: n.mentionCount,
            },
            width:  200,
            height: 70,
        };
    });

    const rfEdges = vpEdges.map((e, i) => ({
        id:        e.id || `ve-${i}`,
        source:    e.source,
        target:    e.target,
        type:      'rel',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 10, height: 10 },
        style:     { stroke: '#7c3aed', strokeWidth: 1.0, opacity: 0.4 },
        label:     e.label || e.relType || '',
        data:      {},
    }));

    return { rfNodes, rfEdges };
}

/* ── LOD indicator overlay ───────────────────────────────────────────────── */

function LodIndicator({ level, isLoading, meta }) {
    const name = LEVEL_NAMES[level] ?? `L${level}`;
    const colors = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b'];
    const color  = colors[level] || '#6b7280';
    return (
        <div style={{
            position: 'absolute', top: 10, left: 10, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(13,17,23,0.88)', padding: '4px 10px', borderRadius: 6,
            fontSize: 11, backdropFilter: 'blur(4px)',
            border: `1px solid ${color}40`,
        }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ color }}>{name}</span>
            {meta?.returnedCount != null && (
                <span style={{ color: '#475569' }}>{meta.returnedCount} nodes</span>
            )}
            {isLoading && <CircularProgress size={10} thickness={5} style={{ color }} />}
            {meta?.budgetExceeded && (
                <span style={{ color: '#f59e0b', fontSize: 10 }}>▲ escalated</span>
            )}
        </div>
    );
}

/* ── Viewport sync — must render INSIDE <ReactFlow> provider ────────────── */

/**
 * Subscribes to ReactFlow viewport changes via useViewport() (reactive hook)
 * and dispatches LOD-aware viewport fetches to the entity store.
 * Rendered as a child of <ReactFlow> so useReactFlow() / useViewport() work.
 */
function ViewportSyncAdapter({ namespace, enabled }) {
    const reactFlow     = useReactFlow();
    const { x, y, zoom } = useViewport();                 // re-renders on pan/zoom
    // ReactFlow v11: container dimensions from internal store (getViewportElement() not available)
    const rfWidth  = useStore(s => s.width)  || window.innerWidth;
    const rfHeight = useStore(s => s.height) || window.innerHeight;

    const fetchViewport  = useEntityStore(s => s.fetchViewport);
    const setLodLevel    = useEntityStore(s => s.setLodLevel);
    const pyramidStatus  = useEntityStore(s => s.pyramidStatus);

    const lodLevelRef  = useRef(0);
    const lastFetchRef = useRef({ bbox: null, level: -1 });

    // Keep max level in sync with built pyramid
    useEffect(() => {
        if (pyramidStatus?.levels?.length) {
            const max = pyramidStatus.levels[pyramidStatus.levels.length - 1]?.level ?? 1;
            setMaxPyramidLevel(max);
        }
    }, [pyramidStatus]);

    const getWorldBbox = useCallback(() => {
        const vp   = reactFlow.getViewport();
        const w    = rfWidth;
        const h    = rfHeight;
        const padX = (w / vp.zoom) * 0.2;
        const padY = (h / vp.zoom) * 0.2;
        return {
            minX: (0 - vp.x) / vp.zoom - padX,
            minY: (0 - vp.y) / vp.zoom - padY,
            maxX: (w - vp.x) / vp.zoom + padX,
            maxY: (h - vp.y) / vp.zoom + padY,
        };
    }, [reactFlow, rfWidth, rfHeight]);

    const doFetch = useCallback(async () => {
        if (!enabled || !namespace) return;
        if (useEntityStore.getState().isLoadingViewport) return;

        const vp       = reactFlow.getViewport();
        const newLevel = computeLodLevel(vp.zoom, lodLevelRef.current);
        const bbox     = getWorldBbox();

        const last = lastFetchRef.current;
        const w = last.bbox ? last.bbox.maxX - last.bbox.minX : 0;
        const h = last.bbox ? last.bbox.maxY - last.bbox.minY : 0;
        const needsRefetch = last.level !== newLevel || !last.bbox ||
            Math.abs(bbox.minX - last.bbox.minX) > w * 0.3 ||
            Math.abs(bbox.minY - last.bbox.minY) > h * 0.3;

        if (!needsRefetch) return;
        lastFetchRef.current = { bbox, level: newLevel };

        if (newLevel !== lodLevelRef.current) {
            lodLevelRef.current = newLevel;
            setLodLevel(newLevel);
        }
        await fetchViewport(namespace, bbox, newLevel, 400);
    }, [enabled, namespace, reactFlow, getWorldBbox, setLodLevel, fetchViewport]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedFetch = useCallback(debounce(doFetch, 150), [doFetch]);

    // Reactive: trigger on every viewport change (x, y, zoom from useViewport)
    useEffect(() => {
        if (!enabled || !namespace) return;
        debouncedFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [x, y, zoom]);

    // Initial fetch on mount / namespace change
    useEffect(() => {
        if (!enabled || !namespace) return;
        const vp    = reactFlow.getViewport();
        const level = getInitialLodLevel(vp.zoom);
        lodLevelRef.current = level;
        setLodLevel(level);
        const t = setTimeout(() => doFetch(), 150);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, namespace]);

    return null;
}

/* ── EntityGraph2D ───────────────────────────────────────────────────────── */

/**
 * Props:
 *   graphData        — { entities, relationships } from API (non-LOD mode)
 *   selectedId       — entity id to highlight (synced with list)
 *   onNodeSelect     — (nodeId) => void
 *   onLayoutComplete — () => void
 *   lodMode          — boolean; if true uses viewport API + LOD controller
 *   namespace        — required when lodMode=true
 */
export default function EntityGraph2D({ graphData, selectedId, onNodeSelect, onLayoutComplete, lodMode = false, namespace }) {
    const {
        layoutConfig,
        frozenPositions,
        isLayoutFrozen,
        isLayouting,
        setIsLayouting,
        setNodes: storeSetNodes,
        setEdges: storeSetEdges,
        saveFrozenPositions,
    } = useEntityStore();

    const showHulls         = useEntityStore(s => s.layoutConfig.groupByType);
    const viewportNodes     = useEntityStore(s => s.viewportNodes);
    const viewportEdges     = useEntityStore(s => s.viewportEdges);
    const viewportMeta      = useEntityStore(s => s.viewportMeta);
    const lodLevel          = useEntityStore(s => s.lodLevel);
    const isLoadingViewport = useEntityStore(s => s.isLoadingViewport);

    const [nodes, setNodes, onNodesChangeBase] = useNodesState([]);
    const [edges, setEdges, onEdgesChange]     = useEdgesState([]);
    const [fitTrigger, setFitTrigger]          = useState(0);

    const prevLayoutConfigRef = useRef(null);
    const graphDataRef        = useRef(graphData);

    /* ── Apply layout via layoutEngine ── */
    const applyLayout = useCallback(async (gd) => {
        if (!gd?.entities?.length) return;

        const { layoutConfig: cfg, frozenPositions: fp } = useEntityStore.getState();

        setIsLayouting(true);
        try {
            const { rfNodes, rfEdges } = buildRfData(gd);
            const result = await computeLayout(rfNodes, rfEdges, cfg, fp);

            setNodes(result.nodes);
            setEdges(result.edges);
            storeSetNodes(result.nodes);
            storeSetEdges(result.edges);
            setFitTrigger(t => t + 1);   // trigger AutoFitView
            onLayoutComplete?.();
        } catch (err) {
            console.error('[EntityGraph2D] applyLayout error:', err);
        } finally {
            setIsLayouting(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onLayoutComplete]);

    /* ── LOD mode: apply viewport data directly (positions pre-computed server-side) ── */
    useEffect(() => {
        if (!lodMode) return;
        const { rfNodes, rfEdges } = buildRfDataFromViewport(viewportNodes, viewportEdges);
        setNodes(rfNodes);
        setEdges(rfEdges);
        storeSetNodes(rfNodes);
        storeSetEdges(rfEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lodMode, viewportNodes, viewportEdges]);

    /* ── Rebuild on new graphData (non-LOD mode) ── */
    useEffect(() => {
        if (lodMode) return;
        graphDataRef.current = graphData;
        applyLayout(graphData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graphData]);

    /* ── Re-layout when algorithm / parameters change (non-LOD only) ── */
    useEffect(() => {
        if (lodMode) return;
        if (prevLayoutConfigRef.current === null) {
            prevLayoutConfigRef.current = layoutConfig;
            return;
        }
        if (prevLayoutConfigRef.current === layoutConfig) return;
        prevLayoutConfigRef.current = layoutConfig;

        if (graphDataRef.current?.entities?.length) {
            applyLayout(graphDataRef.current);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layoutConfig]);

    /* ── Sync selectedId highlight without full re-layout ── */
    useEffect(() => {
        setNodes(prev => prev.map(n => ({ ...n, selected: n.id === selectedId })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    /* ── Save positions after manual drag (only when frozen) ── */
    const onNodesChange = useCallback((changes) => {
        onNodesChangeBase(changes);
        if (!isLayoutFrozen) return;
        if (changes.some(c => c.type === 'position' && c.dragging === false)) {
            saveFrozenPositions();
        }
    }, [onNodesChangeBase, isLayoutFrozen, saveFrozenPositions]);

    const handleNodeClick = useCallback((_, node) => {
        onNodeSelect?.(node.id);
    }, [onNodeSelect]);

    return (
        /*
         * ReactFlow requires a parent with an explicit size.
         * We use position:absolute + inset:0 so it fills whatever
         * container the parent provides, regardless of flex/grid context.
         */
        <div style={{ position: 'absolute', inset: 0 }}>
            {/* LOD level indicator — reads from store directly */}
            {lodMode && (
                <LodIndicator
                    level={lodLevel}
                    isLoading={isLoadingViewport}
                    meta={viewportMeta}
                />
            )}

            {/* Layout progress indicator (non-LOD) */}
            {!lodMode && isLayouting && (
                <div style={{
                    position: 'absolute', top: 10, right: 10, zIndex: 10,
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(15,20,30,0.85)', color: '#94a3b8',
                    padding: '4px 10px', borderRadius: 6, fontSize: 11,
                    backdropFilter: 'blur(4px)',
                }}>
                    <CircularProgress size={12} thickness={5} />
                    Computing layout…
                </div>
            )}

            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={NODE_TYPES}
                edgeTypes={EDGE_TYPES}
                onNodeClick={handleNodeClick}
                fitView={!lodMode}
                fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
                minZoom={0.03}
                maxZoom={4}
                proOptions={{ hideAttribution: true }}
            >
                {/* ViewportSyncAdapter must be inside ReactFlow to use useReactFlow()/useViewport() */}
                {lodMode && <ViewportSyncAdapter namespace={namespace} enabled={lodMode} />}
                <AutoFitView trigger={fitTrigger} />
                {showHulls && !lodMode && <HullOverlay />}
                <Background color="#21262d" gap={20} size={1} />
                <Controls style={{ background: '#161b22', border: '1px solid #21262d' }} />
                <MiniMap
                    nodeColor={n => {
                        if (n.type === 'cluster') return '#6366f1';
                        return PALETTE[(n.data?.type || '').toUpperCase()]?.border || '#6b7280';
                    }}
                    style={{ background: '#0d1117', border: '1px solid #21262d' }}
                    maskColor="rgba(0,0,0,0.6)"
                />
            </ReactFlow>
        </div>
    );
}

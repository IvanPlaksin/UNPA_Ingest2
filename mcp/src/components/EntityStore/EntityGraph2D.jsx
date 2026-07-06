/**
 * EntityGraph2D — high-performance ReactFlow graph for the Entity Store.
 *
 * Performance optimisations applied:
 *  1. ESNode / RelEdge wrapped in React.memo — skip re-renders for unchanged nodes.
 *  2. Glow state (neighbor distance, time-range, search match) baked into node.data
 *     rather than read from a React context, so only affected nodes re-render.
 *  3. Neighbor-glow BFS is debounced (100 ms) via useEffect + state, keeping it
 *     off the synchronous render path.
 *  4. Glow effect patches only nodes whose glow state actually changed (returns
 *     the same node reference for unchanged nodes → React.memo skips them).
 *  5. selectedId highlight updates only the two affected nodes (prev + next).
 *  6. A single minimal GraphCallbackContext carries stable callbacks; it changes
 *     only when the parent recreates `onCenterOnNode`, which is rare.
 *  7. HullOverlay / ClusterNode are wrapped in React.memo in their own files.
 */

import React, {
    useEffect, useCallback, useRef, useState, useContext,
    createContext, useMemo, memo,
} from 'react';
import ReactFlow, {
    MiniMap, Controls, Background,
    useNodesState, useEdgesState, useReactFlow, useViewport, useStore,
    MarkerType, Handle, Position,
    getBezierPath, BaseEdge, EdgeLabelRenderer,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Typography, Tooltip, CircularProgress } from '@mui/material';
import { Download, Activity, Crosshair } from 'lucide-react';
import { useEntityStore } from '../../stores/entityStore.store';
import { computeLayout } from '../../services/layoutEngine.service';
import HullOverlay from './HullOverlay';
import ClusterNode from './ClusterNode';
import { computeLodLevel, getInitialLodLevel, setMaxPyramidLevel, LEVEL_NAMES } from './LodController';
import { debounce } from '../../utils/debounce';

/* ── Minimal stable context — carries only callbacks that rarely change ────── */
const GraphCallbackContext = createContext(null);
// Shape: { onCenterOnNode: (entityId, label) => void }

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
    DOCUMENTREF:  { bg: '#1a1a2e', border: '#8b5cf6', text: '#c4b5fd' },
    default:      { bg: '#1e1e2e', border: '#6b7280', text: '#9ca3af' },
};

/* ── Keyframes (injected once) ───────────────────────────────────────────── */

if (typeof document !== 'undefined' && !document.getElementById('es-glow-style')) {
    const s = document.createElement('style');
    s.id = 'es-glow-style';
    s.textContent = `
        @keyframes esPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50%       { opacity: 0.5; transform: scale(1.5); }
        }
        @keyframes esGlowFlash {
            0%, 100% {
                box-shadow: 0 0 0 2px #86efac, 0 0 12px #4ade80, 0 0 28px #22c55e88, 0 0 48px #16a34a44;
                border-color: #4ade80;
            }
            50% {
                box-shadow: 0 0 0 4px #4ade80, 0 0 32px #22c55e, 0 0 64px #16a34acc, 0 0 96px #15803d66;
                border-color: #86efac;
            }
        }
        @keyframes esGoldPulse {
            0%, 100% {
                box-shadow: 0 0 0 3px #fbbf24, 0 0 16px #f59e0b, 0 0 32px #d97706aa;
                border-color: #fbbf24;
            }
            50% {
                box-shadow: 0 0 0 5px #fbbf24, 0 0 28px #f59e0b, 0 0 56px #d97706cc;
                border-color: #fde68a;
            }
        }
    `;
    document.head.appendChild(s);
}

/* ── ESNode ─────────────────────────────────────────────────────────────────
 * Glow values come from data.* (not context) so React.memo works correctly:
 * only nodes whose glow data actually changed will re-render.
 */

const ESNode = memo(function ESNode({ data, selected }) {
    const c = PALETTE[(data.type || '').toUpperCase()] || PALETTE.default;
    const isDocRef  = data.type === 'DOCUMENTREF';
    const activeJob = data.activeJob;
    const { onCenterOnNode } = useContext(GraphCallbackContext) || {};

    // Glow values baked into data by the parent component
    const isTimeGlowing   = !!data._isTimeGlowing;
    const isFlashing      = isTimeGlowing && data._glowAppliedAt && (Date.now() - data._glowAppliedAt < 3500);
    const neighborDist    = data._neighborDist;           // number | undefined
    const hasNeighborGlow = neighborDist !== undefined;
    const isSelectedNode  = neighborDist === 0;
    const maxDepth        = data._neighborMaxDepth ?? 2;
    const glowIntensity   = hasNeighborGlow ? 1.0 - (neighborDist / Math.max(maxDepth, 1)) * 0.75 : 0;
    const isSearchMatch   = !!data._searchMatch;
    const isPathNode      = !!data._isPathNode;

    const handleExtract     = useCallback((e) => { e.stopPropagation(); data.onExtractRef?.(data.entityId, data.label); }, [data]);
    const handleViewProgress = useCallback((e) => { e.stopPropagation(); data.onViewProgress?.(); }, [data]);
    const handleCenterOn    = useCallback((e) => { e.stopPropagation(); onCenterOnNode?.(data.entityId, data.label); }, [data, onCenterOnNode]);

    let borderColor = c.border;
    let bgColor     = c.bg;
    let boxShadow   = `0 0 8px ${c.border}40`;
    let animation   = undefined;

    if (isTimeGlowing) {
        borderColor = '#4ade80'; bgColor = '#0f2918';
        boxShadow = `0 0 0 2px #86efac, 0 0 12px #4ade80, 0 0 28px #22c55e88, 0 0 48px #16a34a44`;
        if (isFlashing) animation = 'esGlowFlash 0.5s ease-in-out 6';
    } else if (isSelectedNode) {
        borderColor = '#fbbf24'; bgColor = '#2d2010';
        boxShadow = `0 0 0 3px #fbbf24, 0 0 20px #f59e0b, 0 0 40px #d97706aa`;
        animation = 'esGoldPulse 1.2s ease-in-out infinite';
    } else if (isPathNode) {
        borderColor = '#F59E0B'; bgColor = '#251B00';
        boxShadow = `0 0 0 2px #FBBF24, 0 0 14px #F59E0B88, 0 0 28px #D9770644`;
    } else if (hasNeighborGlow) {
        const a16 = Math.round(glowIntensity * 220).toString(16).padStart(2, '0');
        const a8  = Math.round(glowIntensity * 120).toString(16).padStart(2, '0');
        borderColor = `#fbbf24`;
        boxShadow = `0 0 0 1px #fbbf24${a16}, 0 0 ${Math.round(glowIntensity * 18)}px #f59e0b${a8}`;
    } else if (selected) {
        boxShadow = `0 0 0 2px #fff, 0 0 16px ${c.border}`;
    }

    if (isSearchMatch) {
        borderColor = '#a78bfa';
        boxShadow   = `0 0 0 2px #a78bfa, 0 0 14px #7c3aed`;
        animation   = undefined;
    }

    return (
        <div style={{
            padding: '8px 12px', borderRadius: 8,
            border: `2px solid ${borderColor}`,
            backgroundColor: bgColor,
            boxShadow,
            minWidth: 130, maxWidth: 200, cursor: 'pointer',
            position: 'relative',
            transition: (animation || isFlashing) ? undefined : 'box-shadow 0.3s ease, border-color 0.3s ease, background-color 0.3s ease',
            animation,
        }}>
            <Handle type="target" position={Position.Top}
                style={{ width: 7, height: 7, background: isTimeGlowing ? '#4ade80' : borderColor, border: 'none' }} />

            {isTimeGlowing && (
                <div style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#4ade80',
                    boxShadow: '0 0 4px #4ade80, 0 0 8px #22c55e',
                    animation: 'esPulse 1.4s ease-in-out infinite',
                }} />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase',
                    color: c.text, bgcolor: `${c.border}20`, px: 0.75, py: 0.2, borderRadius: 0.5,
                    display: 'inline-block', letterSpacing: '0.07em', flex: 1 }}>
                    {data.type}
                </Typography>
                {data.namespace && (
                    <Typography sx={{ fontSize: '0.55rem', color: '#94a3b8',
                        bgcolor: '#ffffff10', px: 0.5, py: 0.1, borderRadius: 0.5, display: 'inline-block', flexShrink: 0 }}>
                        {data.namespace}
                    </Typography>
                )}
                {onCenterOnNode && (
                    <Tooltip title="Open node-centered graph in new tab" placement="top">
                        <button onClick={handleCenterOn} style={{
                            background: '#1a2040', border: '1px solid #6366f155',
                            borderRadius: 4, padding: '2px 4px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', flexShrink: 0,
                        }}>
                            <Crosshair size={9} style={{ color: '#818cf8' }} />
                        </button>
                    </Tooltip>
                )}
                {isDocRef && (
                    activeJob ? (
                        <Tooltip title={`Extracting… ${activeJob.progress ?? 0}%`} placement="top">
                            <button onClick={handleViewProgress} style={{
                                background: '#1e3a5f', border: '1px solid #3b82f6',
                                borderRadius: 4, padding: '2px 4px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
                            }}>
                                <CircularProgress size={9} thickness={5} style={{ color: '#60a5fa' }} />
                                <Activity size={9} style={{ color: '#60a5fa' }} />
                            </button>
                        </Tooltip>
                    ) : (
                        <Tooltip title="Extract this document via Pipeline" placement="top">
                            <button onClick={handleExtract} style={{
                                background: '#1a2e1a', border: '1px solid #22c55e',
                                borderRadius: 4, padding: '2px 4px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', flexShrink: 0,
                            }}>
                                <Download size={10} style={{ color: '#86efac' }} />
                            </button>
                        </Tooltip>
                    )
                )}
            </div>

            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#f8fafc',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {data.label}
            </Typography>
            {data.mentionCount > 0 && (
                <Typography sx={{ fontSize: '0.6rem', color: '#64748b', mt: 0.25 }}>
                    {data.mentionCount} mention{data.mentionCount !== 1 ? 's' : ''}
                </Typography>
            )}
            {activeJob && (
                <div style={{ marginTop: 4, height: 2, background: '#0f172a', borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', width: `${activeJob.progress ?? 0}%`,
                        background: '#3b82f6', transition: 'width 0.4s ease', borderRadius: 1,
                    }} />
                </div>
            )}

            <Handle type="source" position={Position.Bottom}
                style={{ width: 7, height: 7, background: isTimeGlowing ? '#4ade80' : borderColor, border: 'none' }} />
        </div>
    );
});

/* ── RelEdge ─────────────────────────────────────────────────────────────── */

const RelEdge = memo(function RelEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, label, markerEnd, style, selected }) {
    const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

    // Selected edge: brighter purple; path edge: golden; default: base style
    const isPathEdge = !!data?._isPathEdge;
    const resolvedStyle = selected
        ? { ...style, stroke: '#c4b5fd', strokeWidth: 2.5, opacity: 1 }
        : isPathEdge
            ? { ...style, stroke: '#FBBF24', strokeWidth: 2.0, opacity: 0.9 }
            : style;
    const resolvedMarker = selected
        ? { ...markerEnd, color: '#c4b5fd' }
        : isPathEdge
            ? { ...markerEnd, color: '#FBBF24' }
            : markerEnd;

    return (
        <>
            <BaseEdge id={id} path={edgePath} markerEnd={resolvedMarker} style={resolvedStyle} />
            {label && (
                <EdgeLabelRenderer>
                    <Tooltip
                        title={data?.context ? <span style={{ fontStyle: 'italic', fontSize: '0.72rem' }}>"{data.context}"</span> : ''}
                        placement="top" arrow
                        componentsProps={{ tooltip: { sx: { maxWidth: 340, lineHeight: 1.5 } } }}>
                        <div style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'all',
                        }}>
                            <Typography component="span" sx={{
                                fontSize: '0.5rem',
                                color: selected ? '#c4b5fd' : isPathEdge ? '#FBBF24' : '#a78bfa',
                                background: selected ? '#1e1040cc' : isPathEdge ? '#1A1200cc' : '#0d1117cc',
                                px: '3px', py: '1px', borderRadius: 0.5,
                                cursor: data?.context ? 'help' : 'default',
                                border: selected ? '1px solid #7c3aed90' : isPathEdge ? '1px solid #FBBF2460' : data?.context ? '1px solid #7c3aed40' : 'none',
                                textTransform: 'lowercase', letterSpacing: '0.02em',
                                fontWeight: selected || isPathEdge ? 700 : 400,
                            }}>
                                {String(label).replace(/_/g, ' ')}
                            </Typography>
                        </div>
                    </Tooltip>
                </EdgeLabelRenderer>
            )}
        </>
    );
});

const NODE_TYPES = { es: ESNode, cluster: ClusterNode };
const EDGE_TYPES = { rel: RelEdge };

/* ── Auto-fit after layout ───────────────────────────────────────────────── */
function AutoFitView({ trigger }) {
    const { fitView } = useReactFlow();
    useEffect(() => {
        if (trigger <= 0) return;
        const t = setTimeout(() => fitView({ padding: 0.15, maxZoom: 1.2 }), 80);
        return () => clearTimeout(t);
    }, [trigger, fitView]);
    return null;
}

/* ── Focus controller ───────────────────────────────────────────────────── */
function FocusController({ focusNodeId, focusKey = 0 }) {
    const { setCenter, getNode } = useReactFlow();
    useEffect(() => {
        if (!focusNodeId) return;
        const t = setTimeout(() => {
            const node = getNode(focusNodeId);
            if (!node) return;
            const cx = node.position.x + (node.width  || 200) / 2;
            const cy = node.position.y + (node.height || 70)  / 2;
            setCenter(cx, cy, { zoom: 1.8, duration: 700 });
        }, 130);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusNodeId, focusKey]);
    return null;
}

/* ── Viewport restorer ───────────────────────────────────────────────────── */
function ViewportRestorer({ restoreViewport, onDone }) {
    const { setViewport } = useReactFlow();
    useEffect(() => {
        if (!restoreViewport) return;
        const t = setTimeout(() => {
            setViewport(restoreViewport, { duration: 0 });
            onDone?.();
        }, 100);
        return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [restoreViewport]);
    return null;
}

/* ── API graphData → ReactFlow format ──────────────────────────────────── */

function buildRfData(graphData, onExtractRef, activeJobs) {
    const rfNodes = (graphData?.entities || []).map(e => {
        const eType  = (e.type || 'default').toUpperCase();
        const isDocRef = eType === 'DOCUMENTREF';
        const job    = activeJobs?.get(e.id) || null;
        return {
            id:       e.id,
            type:     'es',
            position: { x: 0, y: 0 },
            data: {
                label:          e.name,
                type:           eType,
                namespace:      e.namespace,
                mentionCount:   e.mentionCount,
                entityId:       e.id,
                onExtractRef:   isDocRef ? onExtractRef : undefined,
                activeJob:      job,
                onViewProgress: job ? job.onViewProgress : undefined,
                // Glow fields — set by _applyGlowToNodes() later
                _isTimeGlowing:   false,
                _glowAppliedAt:   null,
                _neighborDist:    undefined,
                _neighborMaxDepth: 2,
                _searchMatch:     false,
            },
            width:  200,
            height: eType === 'DOCUMENTREF' ? 85 : 70,
        };
    });

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
            data: {
                context:    r.context    || null,
                confidence: r.confidence ?? null,
                sourceId:   r.sourceId,
                targetId:   r.targetId,
                relType:    r.relType    || 'RELATED_TO',
                provenance: r.provenance || null,
            },
        }));

    return { rfNodes, rfEdges };
}

/* ── Apply glow state to nodes (only patches changed nodes) ─────────────── */

function _applyGlowToNodes(nodes, { neighborDist, maxDepth, glowSet, glowAppliedAt, searchQuery, pathNodeIds }) {
    const sq = searchQuery ? searchQuery.toLowerCase() : '';
    let changed = false;
    const next = nodes.map(n => {
        const id   = n.id;
        const dist = neighborDist?.get(id);

        const newIsTimeGlowing = glowSet ? glowSet.has(id) : false;
        const newSearchMatch   = sq ? (n.data.label || '').toLowerCase().includes(sq) : false;
        const newIsPathNode    = pathNodeIds ? pathNodeIds.has(id) : false;

        // Compare with current data — return same ref if nothing changed
        if (
            n.data._neighborDist       === dist              &&
            n.data._neighborMaxDepth   === maxDepth          &&
            n.data._isTimeGlowing      === newIsTimeGlowing  &&
            n.data._glowAppliedAt      === glowAppliedAt     &&
            n.data._searchMatch        === newSearchMatch     &&
            (n.data._isPathNode ?? false) === newIsPathNode
        ) return n;

        changed = true;
        return {
            ...n,
            data: {
                ...n.data,
                _neighborDist:    dist,
                _neighborMaxDepth: maxDepth,
                _isTimeGlowing:   newIsTimeGlowing,
                _glowAppliedAt:   glowAppliedAt,
                _searchMatch:     newSearchMatch,
                _isPathNode:      newIsPathNode,
            },
        };
    });
    return changed ? next : nodes;
}

function _applyGlowToEdges(edges, pathEdgePairs) {
    let changed = false;
    const next = edges.map(e => {
        const sid = e.data?.sourceId;
        const tid = e.data?.targetId;
        const newIsPathEdge = pathEdgePairs
            ? (pathEdgePairs.has(`${sid}|${tid}`) || pathEdgePairs.has(`${tid}|${sid}`))
            : false;
        if ((e.data?._isPathEdge ?? false) === newIsPathEdge) return e;
        changed = true;
        return { ...e, data: { ...e.data, _isPathEdge: newIsPathEdge } };
    });
    return changed ? next : edges;
}

/* ── Viewport nodes (LOD) → ReactFlow format ─────────────────────────────── */

function buildRfDataFromViewport(vpNodes, vpEdges) {
    const rfNodes = vpNodes.map(n => {
        if (n.type === 'cluster') {
            return { id: n.id, type: 'cluster', position: { x: n.x ?? 0, y: n.y ?? 0 },
                data: { id: n.id, label: n.label, level: n.level, memberCount: n.memberCount,
                    dominantType: n.dominantType, expandable: n.expandable !== false },
                width: 220, height: 80 };
        }
        return { id: n.id, type: 'es', position: { x: n.x ?? 0, y: n.y ?? 0 },
            data: { label: n.label, type: (n.entityType || n.type || 'CONCEPT').toUpperCase(),
                namespace: n.namespace, mentionCount: n.mentionCount,
                _isTimeGlowing: false, _glowAppliedAt: null,
                _neighborDist: undefined, _neighborMaxDepth: 2, _searchMatch: false },
            width: 200, height: 70 };
    });
    const rfEdges = vpEdges.map((e, i) => ({
        id: e.id || `ve-${i}`, source: e.source, target: e.target, type: 'rel',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#7c3aed', width: 10, height: 10 },
        style: { stroke: '#7c3aed', strokeWidth: 1.0, opacity: 0.4 },
        label: e.label || e.relType || '', data: {},
    }));
    return { rfNodes, rfEdges };
}

/* ── LOD indicator ───────────────────────────────────────────────────────── */

const LodIndicator = memo(function LodIndicator({ level, isLoading, meta }) {
    const name = LEVEL_NAMES[level] ?? `L${level}`;
    const colors = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b'];
    const color  = colors[level] || '#6b7280';
    return (
        <div style={{
            position: 'absolute', top: 10, left: 10, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(13,17,23,0.88)', padding: '4px 10px', borderRadius: 6,
            fontSize: 13, backdropFilter: 'blur(4px)', border: `1px solid ${color}40`,
        }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ color }}>{name}</span>
            {meta?.returnedCount != null && <span style={{ color: '#94a3b8' }}>{meta.returnedCount} nodes</span>}
            {isLoading && <CircularProgress size={10} thickness={5} style={{ color }} />}
            {meta?.budgetExceeded && <span style={{ color: '#f59e0b', fontSize: 12 }}>▲ escalated</span>}
        </div>
    );
});

/* ── ViewportSyncAdapter (LOD) ───────────────────────────────────────────── */

function ViewportSyncAdapter({ namespace, enabled }) {
    const reactFlow = useReactFlow();
    const { x, y, zoom } = useViewport();
    const rfWidth  = useStore(s => s.width)  || window.innerWidth;
    const rfHeight = useStore(s => s.height) || window.innerHeight;

    const fetchViewport = useEntityStore(s => s.fetchViewport);
    const setLodLevel   = useEntityStore(s => s.setLodLevel);
    const pyramidStatus = useEntityStore(s => s.pyramidStatus);

    const lodLevelRef  = useRef(0);
    const lastFetchRef = useRef({ bbox: null, level: -1 });

    useEffect(() => {
        if (pyramidStatus?.levels?.length) {
            const max = pyramidStatus.levels[pyramidStatus.levels.length - 1]?.level ?? 1;
            setMaxPyramidLevel(max);
        }
    }, [pyramidStatus]);

    const getWorldBbox = useCallback(() => {
        const vp = reactFlow.getViewport();
        const padX = (rfWidth / vp.zoom) * 0.2;
        const padY = (rfHeight / vp.zoom) * 0.2;
        return {
            minX: (0 - vp.x) / vp.zoom - padX,
            minY: (0 - vp.y) / vp.zoom - padY,
            maxX: (rfWidth  - vp.x) / vp.zoom + padX,
            maxY: (rfHeight - vp.y) / vp.zoom + padY,
        };
    }, [reactFlow, rfWidth, rfHeight]);

    const doFetch = useCallback(async () => {
        if (!enabled || !namespace) return;
        if (useEntityStore.getState().isLoadingViewport) return;
        const vp = reactFlow.getViewport();
        const newLevel = computeLodLevel(vp.zoom, lodLevelRef.current);
        const bbox = getWorldBbox();
        const last = lastFetchRef.current;
        const w = last.bbox ? last.bbox.maxX - last.bbox.minX : 0;
        const h = last.bbox ? last.bbox.maxY - last.bbox.minY : 0;
        const needsRefetch = last.level !== newLevel || !last.bbox ||
            Math.abs(bbox.minX - last.bbox.minX) > w * 0.3 ||
            Math.abs(bbox.minY - last.bbox.minY) > h * 0.3;
        if (!needsRefetch) return;
        lastFetchRef.current = { bbox, level: newLevel };
        if (newLevel !== lodLevelRef.current) { lodLevelRef.current = newLevel; setLodLevel(newLevel); }
        await fetchViewport(namespace, bbox, newLevel, 400);
    }, [enabled, namespace, reactFlow, getWorldBbox, setLodLevel, fetchViewport]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const debouncedFetch = useCallback(debounce(doFetch, 150), [doFetch]);

    useEffect(() => { if (!enabled || !namespace) return; debouncedFetch(); }, [x, y, zoom, debouncedFetch, enabled, namespace]);

    useEffect(() => {
        if (!enabled || !namespace) return;
        const vp = reactFlow.getViewport();
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

export default function EntityGraph2D({
    graphData, selectedId, onNodeSelect, onEdgeSelect, onLayoutComplete, onExtractRef,
    activeJobs, glowSet, glowAppliedAt,
    lodMode = false, namespace,
    focusNodeId = null,
    focusKey = 0,
    onCenterOnNode,
    searchQuery = '',
    glowDepth = 2,
    onViewportChange,
    restoreViewport = null,
    onRestoreViewportDone,
    pathNodeIds = null,
    pathEdgePairs = null,
}) {
    const {
        layoutConfig, frozenPositions, isLayoutFrozen, isLayouting,
        setIsLayouting, setNodes: storeSetNodes, setEdges: storeSetEdges, saveFrozenPositions,
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

    // Debounced BFS result — computed off the render path
    const [neighborDist, setNeighborDist] = useState(null);

    const prevLayoutConfigRef = useRef(null);
    const graphDataRef        = useRef(graphData);
    const onExtractRefRef     = useRef(onExtractRef);
    const activeJobsRef       = useRef(activeJobs);
    const prevSelectedRef     = useRef(null);
    const bfsTimerRef         = useRef(null);

    useEffect(() => { onExtractRefRef.current = onExtractRef; }, [onExtractRef]);
    useEffect(() => { activeJobsRef.current = activeJobs; }, [activeJobs]);

    /* ── Stable context value — only changes when onCenterOnNode changes ── */
    const cbCtxValue = useMemo(() => ({ onCenterOnNode: onCenterOnNode || null }), [onCenterOnNode]);

    /* ── Debounced BFS for neighbor glow (100 ms delay) ── */
    useEffect(() => {
        if (bfsTimerRef.current) clearTimeout(bfsTimerRef.current);
        if (!selectedId || !graphData?.relationships?.length) {
            setNeighborDist(null);
            return;
        }
        bfsTimerRef.current = setTimeout(() => {
            const adj = new Map();
            for (const r of graphData.relationships) {
                if (!adj.has(r.sourceId)) adj.set(r.sourceId, []);
                if (!adj.has(r.targetId)) adj.set(r.targetId, []);
                adj.get(r.sourceId).push(r.targetId);
                adj.get(r.targetId).push(r.sourceId);
            }
            const dist = new Map([[selectedId, 0]]);
            let frontier = [selectedId];
            for (let d = 1; d <= glowDepth; d++) {
                const next = [];
                for (const id of frontier) {
                    for (const nb of (adj.get(id) || [])) {
                        if (!dist.has(nb)) { dist.set(nb, d); next.push(nb); }
                    }
                }
                frontier = next;
                if (!frontier.length) break;
            }
            setNeighborDist(dist);
        }, 100);
        return () => clearTimeout(bfsTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId, graphData, glowDepth]);

    /* ── Apply glow data to nodes — only patches changed nodes ── */
    useEffect(() => {
        if (lodMode) return;
        setNodes(prev => _applyGlowToNodes(prev, {
            neighborDist, maxDepth: glowDepth, glowSet: glowSet || null,
            glowAppliedAt: glowAppliedAt ?? null, searchQuery,
            pathNodeIds: pathNodeIds || null,
        }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [neighborDist, glowSet, glowAppliedAt, searchQuery, glowDepth, pathNodeIds]);

    /* ── Apply path glow to edges ── */
    useEffect(() => {
        if (lodMode) return;
        setEdges(prev => _applyGlowToEdges(prev, pathEdgePairs || null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathEdgePairs, lodMode]);

    /* ── Layout ── */
    const applyLayout = useCallback(async (gd) => {
        if (!gd?.entities?.length) return;
        const { layoutConfig: cfg, frozenPositions: fp } = useEntityStore.getState();
        setIsLayouting(true);
        try {
            const { rfNodes, rfEdges } = buildRfData(gd, onExtractRefRef.current, activeJobsRef.current);
            const result = await computeLayout(rfNodes, rfEdges, cfg, fp);
            // Single batched state update — React 18 batches these automatically
            setNodes(result.nodes);
            setEdges(result.edges);
            storeSetNodes(result.nodes);
            storeSetEdges(result.edges);
            setFitTrigger(t => t + 1);
            onLayoutComplete?.();
        } catch (err) {
            console.error('[EntityGraph2D] applyLayout error:', err);
        } finally {
            setIsLayouting(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onLayoutComplete]);

    /* ── LOD viewport data ── */
    useEffect(() => {
        if (!lodMode) return;
        const { rfNodes, rfEdges } = buildRfDataFromViewport(viewportNodes, viewportEdges);
        setNodes(rfNodes); setEdges(rfEdges);
        storeSetNodes(rfNodes); storeSetEdges(rfEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lodMode, viewportNodes, viewportEdges]);

    /* ── Rebuild on new graphData ── */
    useEffect(() => {
        if (lodMode) return;
        graphDataRef.current = graphData;
        applyLayout(graphData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [graphData]);

    /* ── Re-layout when algorithm changes ── */
    useEffect(() => {
        if (lodMode) return;
        if (prevLayoutConfigRef.current === null) { prevLayoutConfigRef.current = layoutConfig; return; }
        if (prevLayoutConfigRef.current === layoutConfig) return;
        prevLayoutConfigRef.current = layoutConfig;
        if (graphDataRef.current?.entities?.length) applyLayout(graphDataRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layoutConfig]);

    /* ── selectedId highlight — patches ONLY 2 nodes (prev + new) ── */
    useEffect(() => {
        const prev = prevSelectedRef.current;
        prevSelectedRef.current = selectedId;
        if (prev === selectedId) return;
        setNodes(ns => {
            let changed = false;
            const next = ns.map(n => {
                const shouldBe = n.id === selectedId;
                if (n.selected === shouldBe) return n; // same ref — React.memo skips
                changed = true;
                return { ...n, selected: shouldBe };
            });
            return changed ? next : ns;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    /* ── Sync activeJobs — only updates DOCUMENTREF nodes that actually changed ── */
    useEffect(() => {
        if (lodMode) return;
        setNodes(prev => {
            let changed = false;
            const next = prev.map(n => {
                if (n.data?.type !== 'DOCUMENTREF') return n;
                const job = activeJobs?.get(n.id) || null;
                if (job === n.data.activeJob) return n;
                changed = true;
                return { ...n, data: { ...n.data, activeJob: job, onViewProgress: job?.onViewProgress } };
            });
            return changed ? next : prev;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeJobs]);

    /* ── Save positions after drag ── */
    const onNodesChange = useCallback((changes) => {
        onNodesChangeBase(changes);
        if (!isLayoutFrozen) return;
        if (changes.some(c => c.type === 'position' && c.dragging === false)) saveFrozenPositions();
    }, [onNodesChangeBase, isLayoutFrozen, saveFrozenPositions]);

    const handleNodeClick = useCallback((_, node) => {
        onNodeSelect?.(node.id);
        onEdgeSelect?.(null); // deselect edge when node clicked
    }, [onNodeSelect, onEdgeSelect]);

    const handleEdgeClick = useCallback((_, edge) => {
        onEdgeSelect?.(edge.data);
        onNodeSelect?.(null); // deselect node when edge clicked
    }, [onEdgeSelect, onNodeSelect]);

    const handlePaneClick = useCallback(() => {
        onNodeSelect?.(null);
        onEdgeSelect?.(null);
    }, [onNodeSelect, onEdgeSelect]);

    const handleMoveEnd = useCallback((_, viewport) => { onViewportChange?.(viewport); }, [onViewportChange]);

    return (
        <GraphCallbackContext.Provider value={cbCtxValue}>
        <div style={{ position: 'absolute', inset: 0 }}>
            {lodMode && <LodIndicator level={lodLevel} isLoading={isLoadingViewport} meta={viewportMeta} />}
            {!lodMode && isLayouting && (
                <div style={{
                    position: 'absolute', top: 10, right: 10, zIndex: 10,
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(15,20,30,0.85)', color: '#94a3b8',
                    padding: '4px 10px', borderRadius: 6, fontSize: 13, backdropFilter: 'blur(4px)',
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
                onEdgeClick={handleEdgeClick}
                onPaneClick={handlePaneClick}
                onMoveEnd={handleMoveEnd}
                fitView={!lodMode}
                fitViewOptions={{ padding: 0.15, maxZoom: 1.2 }}
                minZoom={0.03}
                maxZoom={4}
                proOptions={{ hideAttribution: true }}
            >
                {lodMode && <ViewportSyncAdapter namespace={namespace} enabled={lodMode} />}
                <AutoFitView trigger={fitTrigger} />
                {focusNodeId && <FocusController focusNodeId={focusNodeId} focusKey={focusKey} />}
                {restoreViewport && <ViewportRestorer restoreViewport={restoreViewport} onDone={onRestoreViewportDone} />}
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
        </GraphCallbackContext.Provider>
    );
}

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stats } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useEntityStoreGraph } from './data/useEntityStoreGraph';
import { useForceSimulation } from './physics/useForceSimulation';
import { useVisualSettings } from './hooks/useVisualSettings';
import { useNodeFilter } from './hooks/useNodeFilter';
import { InstancedNodes } from './scene/InstancedNodes';
import { BatchedEdges } from './scene/BatchedEdges';
import { WeightedBatchedEdges } from './scene/WeightedBatchedEdges';
import { VisualSettingsPanel } from './ui/VisualSettingsPanel';
import { NodeFilterPanel } from './ui/NodeFilterPanel';
import { DetailPanel } from './ui/DetailPanel';
import { collapseParallelEdges } from './data/collapseEdges';
import { SCENE_CONFIG } from './constants/visualConfig';

// ── Raycaster setup (inside Canvas) ──────────────────────────────────────────

function RaycasterSetup() {
    const { raycaster } = useThree();
    useEffect(() => {
        raycaster.params.Line = raycaster.params.Line || {};
        raycaster.params.Line.threshold = 10;
        // Slightly enlarge InstancedMesh tolerance for small / far-away nodes
        raycaster.params.Mesh = raycaster.params.Mesh || {};
        raycaster.params.Mesh.threshold = 0.5;
    }, [raycaster]);
    return null;
}

// ── HoverScanner — useFrame raycasting for reliable hover detection ───────────
// Handles both normal LineSegments and weighted LineSegments2 objects.
// LineSegments2.hit.index = segment index directly (not vertex index).

function HoverScanner({ onNodeHover, onEdgeHover }) {
    const { raycaster, camera, pointer, scene } = useThree();
    const lastKey = useRef(null);

    useFrame(() => {
        raycaster.setFromCamera(pointer, camera);

        const nodeMeshes = [];
        const edgeMeshes = [];

        scene.traverse(obj => {
            if (obj.isInstancedMesh && obj.userData.nodeGroup) nodeMeshes.push(obj);
            // Normal batched edges
            if (obj.isLineSegments && obj.userData.edgeLinks) edgeMeshes.push(obj);
            // Weighted thick edges (LineSegments2 extends Mesh, type='LineSegments2')
            if (obj.type === 'LineSegments2' && obj.userData.edgeLinks) edgeMeshes.push(obj);
        });

        // Nodes take priority
        if (nodeMeshes.length > 0) {
            const hits = raycaster.intersectObjects(nodeMeshes, false);
            const hit = hits[0];
            if (hit && hit.instanceId != null) {
                const key = `n:${hit.object.uuid}:${hit.instanceId}`;
                if (key !== lastKey.current) {
                    lastKey.current = key;
                    onNodeHover(hit.object.userData.nodeGroup[hit.instanceId] ?? null);
                    onEdgeHover(null);
                }
                return;
            }
        }

        // Edges
        if (edgeMeshes.length > 0) {
            const hits = raycaster.intersectObjects(edgeMeshes, false);
            const hit = hits[0];
            if (hit && hit.index != null) {
                // LineSegments2 raycast returns segment index directly;
                // regular LineSegments returns vertex index → divide by 2.
                const linkIdx = hit.object.userData.isLineSegments2
                    ? hit.index
                    : Math.floor(hit.index / 2);

                const key = `e:${hit.object.uuid}:${linkIdx}`;
                if (key !== lastKey.current) {
                    lastKey.current = key;
                    const { edgeLinks, edgeNodeMap } = hit.object.userData;
                    const link = edgeLinks?.[linkIdx];
                    if (link && edgeNodeMap) {
                        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
                        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
                        onNodeHover(null);
                        onEdgeHover({
                            ...link,
                            sourceNode: edgeNodeMap.get(srcId),
                            targetNode: edgeNodeMap.get(tgtId),
                        });
                    }
                }
                return;
            }
        }

        // Nothing hit
        if (lastKey.current !== null) {
            lastKey.current = null;
            onNodeHover(null);
            onEdgeHover(null);
        }
    });

    return null;
}

// ── Hover tooltip (portal → document.body, always-on position tracking) ──────

function HoverTooltip({ node, edge }) {
    const [mousePos, setMousePos] = useState(null);
    const active = node || edge;

    useEffect(() => {
        const h = (e) => setMousePos({ x: e.clientX, y: e.clientY });
        window.addEventListener('pointermove', h, { passive: true });
        return () => window.removeEventListener('pointermove', h);
    }, []);

    if (!active || !mousePos) return null;

    return ReactDOM.createPortal(
        <div style={{
            position: 'fixed',
            left: mousePos.x + 16,
            top: mousePos.y + 16,
            zIndex: 9999,
            pointerEvents: 'none',
            background: 'rgba(5,10,25,0.97)',
            borderRadius: 8,
            padding: '10px 14px',
            maxWidth: 300,
            fontFamily: 'monospace',
            boxShadow: '0 4px 24px rgba(0,0,0,0.8)',
            border: node
                ? '1px solid rgba(5,217,232,0.4)'
                : '1px solid rgba(245,158,11,0.4)',
        }}>
            {node ? <NodeTip node={node} /> : <EdgeTip edge={edge} />}
        </div>,
        document.body
    );
}

function NodeTip({ node }) {
    const d = node.data || {};
    return (
        <>
            <div style={{ color: '#05d9e8', fontWeight: 'bold', fontSize: 13, marginBottom: 3 }}>
                {node.name}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 11 }}>
                {node.canonicalType || node.type}
                {d.category ? <span style={{ color: '#4b5563' }}> · {d.category}</span> : null}
            </div>
            {node.mentionCount > 0 && (
                <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>
                    {node.mentionCount} mention{node.mentionCount !== 1 ? 's' : ''}
                </div>
            )}
            {d.description && (
                <div style={{
                    color: '#cbd5e1', fontSize: 11, marginTop: 8, lineHeight: 1.55,
                    borderTop: '1px solid rgba(5,217,232,0.1)', paddingTop: 8,
                }}>
                    {d.description.length > 220 ? d.description.slice(0, 220) + '…' : d.description}
                </div>
            )}
            <div style={{ color: '#374151', fontSize: 10, marginTop: 6 }}>Click to select</div>
        </>
    );
}

function EdgeTip({ edge }) {
    const srcName = edge.sourceNode?.name
        || (typeof edge.source === 'object' ? edge.source?.id : edge.source) || '?';
    const tgtName = edge.targetNode?.name
        || (typeof edge.target === 'object' ? edge.target?.id : edge.target) || '?';

    const isMerged = edge.isMerged && edge.mergedEdges?.length > 1;

    return (
        <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: 11, letterSpacing: 1 }}>
                    {edge.type || 'RELATED_TO'}
                </span>
                {isMerged && (
                    <span style={{
                        background: 'rgba(255,215,0,0.15)',
                        border: '1px solid rgba(255,215,0,0.4)',
                        borderRadius: 4, color: '#FFD700', fontSize: 9, padding: '1px 5px',
                    }}>
                        ×{edge.mergedEdges.length} · w{edge.weight}
                    </span>
                )}
            </div>
            <div style={{ fontSize: 11 }}>
                <span style={{ color: '#05d9e8' }}>{srcName}</span>
                <span style={{ color: '#4b5563', margin: '0 5px' }}>→</span>
                <span style={{ color: '#05d9e8' }}>{tgtName}</span>
            </div>
            {isMerged && (
                <div style={{ marginTop: 5 }}>
                    <div style={{
                        height: 3, borderRadius: 2, width: '100%',
                        background: 'linear-gradient(to right, #3d3d3d, #FFD700)',
                        opacity: 0.7,
                    }} />
                </div>
            )}
            {!isMerged && edge.context && (
                <div style={{
                    color: '#cbd5e1', fontSize: 11, marginTop: 7, lineHeight: 1.55,
                    borderTop: '1px solid rgba(245,158,11,0.1)', paddingTop: 7,
                }}>
                    {edge.context.length > 200 ? edge.context.slice(0, 200) + '…' : edge.context}
                </div>
            )}
            {edge.confidence != null && !isMerged && (
                <div style={{ color: '#6b7280', fontSize: 10, marginTop: 5 }}>
                    confidence: {Math.round(edge.confidence * 100)}%
                </div>
            )}
            <div style={{ color: '#374151', fontSize: 10, marginTop: 5 }}>Click to select</div>
        </>
    );
}

// ── Top control bar ───────────────────────────────────────────────────────────

function ControlBar({ namespace, namespaces, onNamespace, stratified, onStratified,
    nodeCount, visibleCount, linkCount, loading, onRefresh, weightSum }) {
    return (
        <div style={{
            position: 'absolute', top: 12, left: 12, right: 12, zIndex: 10,
            display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto',
        }}>
            <span style={{
                color: '#05d9e8', fontFamily: 'monospace', fontSize: 14,
                fontWeight: 'bold', letterSpacing: 2, textTransform: 'uppercase',
                textShadow: '0 0 10px rgba(5,217,232,0.5)', flexShrink: 0,
            }}>
                Entity Singularity
            </span>

            <select
                value={namespace || ''}
                onChange={e => onNamespace(e.target.value || null)}
                style={S.select}
            >
                <option value="">All namespaces</option>
                {namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
            </select>

            <button
                onClick={onStratified}
                style={{ ...S.btn, background: stratified ? 'rgba(5,217,232,0.25)' : 'rgba(0,0,0,0.5)' }}
            >
                {stratified ? 'STRATIFIED' : 'FORCE CLUSTER'}
            </button>

            <button onClick={onRefresh} style={S.btn} disabled={loading}>
                {loading ? '…' : '↺'}
            </button>

            {weightSum && (
                <span style={{
                    background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
                    borderRadius: 5, color: '#f59e0b', fontFamily: 'monospace', fontSize: 10,
                    padding: '3px 8px', letterSpacing: 0.8,
                }}>
                    WEIGHT SUM
                </span>
            )}

            <span style={{ marginLeft: 'auto', color: '#6b7280', fontFamily: 'monospace', fontSize: 12 }}>
                {visibleCount < nodeCount
                    ? <><span style={{ color: '#05d9e8' }}>{visibleCount}</span>/{nodeCount}</>
                    : nodeCount.toLocaleString()
                } nodes · {linkCount.toLocaleString()} edges
            </span>
        </div>
    );
}

// ── Scene (inside R3F Canvas) ─────────────────────────────────────────────────

function GraphScene({
    nodes, links, stratified, highlightIds, visualSettings, weightSum,
    onNodeHover, onNodeClick, onEdgeHover, onEdgeClick,
}) {
    const { positionsRef, tick } = useForceSimulation(nodes, links, { stratified });
    const bloom = visualSettings.bloom;
    const fogEnabled = visualSettings.fog.enabled;

    // Degree map — counts total connections per node (used for hub sizing)
    const degreeMap = useMemo(() => {
        const m = new Map();
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            m.set(s, (m.get(s) || 0) + 1);
            m.set(t, (m.get(t) || 0) + 1);
        });
        return m;
    }, [links]);

    const maxDegree = useMemo(() => {
        let mx = 1;
        for (const v of degreeMap.values()) if (v > mx) mx = v;
        return mx;
    }, [degreeMap]);

    return (
        <>
            <RaycasterSetup />
            <HoverScanner onNodeHover={onNodeHover} onEdgeHover={onEdgeHover} />

            <color attach="background" args={[SCENE_CONFIG.background]} />
            {fogEnabled && (
                <fog attach="fog" args={[SCENE_CONFIG.fog.color, SCENE_CONFIG.fog.near, SCENE_CONFIG.fog.far]} />
            )}

            <ambientLight intensity={SCENE_CONFIG.ambientLight.intensity} />
            <pointLight position={SCENE_CONFIG.pointLight.position} intensity={SCENE_CONFIG.pointLight.intensity} />

            <InstancedNodes
                nodes={nodes}
                positionsRef={positionsRef}
                tick={tick}
                highlightIds={highlightIds}
                visualSettings={visualSettings}
                degreeMap={degreeMap}
                maxDegree={maxDegree}
                onClick={onNodeClick}
            />

            {weightSum ? (
                <WeightedBatchedEdges
                    links={links}
                    nodes={nodes}
                    positionsRef={positionsRef}
                    tick={tick}
                    edgeOpacity={visualSettings.edges.opacity}
                    weightFade={visualSettings.edges.weightFade}
                    onClick={onEdgeClick}
                />
            ) : (
                <BatchedEdges
                    links={links}
                    nodes={nodes}
                    positionsRef={positionsRef}
                    tick={tick}
                    edgeOpacity={visualSettings.edges.opacity}
                    onClick={onEdgeClick}
                />
            )}

            <OrbitControls enableDamping dampingFactor={0.1} minDistance={30} maxDistance={6000} makeDefault />

            <EffectComposer>
                <Bloom
                    intensity={bloom.intensity}
                    luminanceThreshold={bloom.threshold}
                    luminanceSmoothing={bloom.smoothing}
                />
            </EffectComposer>

            <Stats />
        </>
    );
}

// ── Root component ────────────────────────────────────────────────────────────

export default function EntitySingularityGraph({ namespace: propNamespace = null }) {
    const {
        graphData, namespaces, namespace, setNamespace,
        loading, error, refresh, expandNode,
    } = useEntityStoreGraph(propNamespace);

    const { settings: visualSettings, update: updateVisual, reset: resetVisual } = useVisualSettings();
    const {
        filter, update: updateFilter, resetFilter,
        filteredNodes, filteredLinks, availableTypes, stats,
    } = useNodeFilter(graphData.nodes, graphData.links);

    const [stratified, setStratified] = useState(false);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [hoveredEdge, setHoveredEdge] = useState(null);
    const [highlightIds, setHighlightIds] = useState(new Set());
    const [selectedItem, setSelectedItem] = useState(null);

    // Apply edge collapse when Weight Sum mode is active
    const displayLinks = useMemo(() => {
        if (!filter.weightSum) return filteredLinks;
        return collapseParallelEdges(filteredLinks);
    }, [filteredLinks, filter.weightSum]);

    // ── Hover handlers (from HoverScanner) ───────────────────────────────────
    const handleNodeHover = useCallback((node) => {
        setHoveredNode(node);
        if (!node) { setHighlightIds(new Set()); return; }
        setHoveredEdge(null);
        const ids = new Set([node.id]);
        displayLinks.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (s === node.id || t === node.id) { ids.add(s); ids.add(t); }
        });
        setHighlightIds(ids);
    }, [displayLinks]);

    const handleEdgeHover = useCallback((edge) => {
        setHoveredEdge(edge);
        if (!edge) return;
        setHoveredNode(null);
        setHighlightIds(new Set());
    }, []);

    // ── Click handlers ────────────────────────────────────────────────────────
    const handleNodeClick = useCallback((node) => {
        if (!node) return;
        setSelectedItem({ itemType: 'node', ...node });
        expandNode(node.id, 2);
    }, [expandNode]);

    const handleEdgeClick = useCallback((edge) => {
        if (!edge) return;
        setSelectedItem({ itemType: 'edge', ...edge });
    }, []);

    const handleMissed = useCallback(() => {
        setSelectedItem(null);
    }, []);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', background: '#050510' }}>
            <ControlBar
                namespace={namespace}
                namespaces={namespaces}
                onNamespace={setNamespace}
                stratified={stratified}
                onStratified={() => setStratified(s => !s)}
                nodeCount={graphData.nodes.length}
                visibleCount={filteredNodes.length}
                linkCount={displayLinks.length}
                loading={loading}
                onRefresh={refresh}
                weightSum={filter.weightSum}
            />

            <Canvas
                camera={{ position: [300, 300, 300], fov: 60, near: 1, far: 10000 }}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                style={{ width: '100%', height: '100%' }}
                onPointerMissed={handleMissed}
            >
                {filteredNodes.length > 0 && (
                    <GraphScene
                        nodes={filteredNodes}
                        links={displayLinks}
                        stratified={stratified}
                        highlightIds={highlightIds}
                        visualSettings={visualSettings}
                        weightSum={filter.weightSum}
                        onNodeHover={handleNodeHover}
                        onNodeClick={handleNodeClick}
                        onEdgeHover={handleEdgeHover}
                        onEdgeClick={handleEdgeClick}
                    />
                )}
            </Canvas>

            <VisualSettingsPanel settings={visualSettings} onUpdate={updateVisual} onReset={resetVisual} weightSumActive={filter.weightSum} />
            <NodeFilterPanel filter={filter} onUpdate={updateFilter} onReset={resetFilter}
                availableTypes={availableTypes} stats={stats} />

            {loading && (
                <div style={S.overlay}>
                    <div style={S.spinner} />
                    <span style={{ color: '#05d9e8', marginTop: 14, fontFamily: 'monospace' }}>
                        Loading Entity Graph…
                    </span>
                </div>
            )}
            {error && !loading && (
                <div style={S.error}>
                    ⚠ {error}
                    <button onClick={refresh} style={{ ...S.btn, marginLeft: 12 }}>Retry</button>
                </div>
            )}

            <HoverTooltip node={hoveredNode} edge={!hoveredNode ? hoveredEdge : null} />
            <DetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} />

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const S = {
    select: {
        background: 'rgba(0,10,20,0.85)', border: '1px solid rgba(5,217,232,0.35)',
        borderRadius: 6, color: '#05d9e8', fontFamily: 'monospace', fontSize: 12,
        padding: '4px 8px', cursor: 'pointer', outline: 'none',
    },
    btn: {
        background: 'rgba(0,10,20,0.85)', border: '1px solid rgba(5,217,232,0.35)',
        borderRadius: 6, color: '#05d9e8', fontFamily: 'monospace', fontSize: 12,
        padding: '4px 12px', cursor: 'pointer',
    },
    overlay: {
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: 'rgba(5,5,16,0.75)', zIndex: 20,
    },
    spinner: {
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid rgba(5,217,232,0.2)',
        borderTop: '3px solid #05d9e8',
        animation: 'spin 0.8s linear infinite',
    },
    error: {
        position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
        borderRadius: 8, color: '#ef4444', fontFamily: 'monospace', fontSize: 12,
        padding: '8px 16px', display: 'flex', alignItems: 'center', zIndex: 10,
    },
};

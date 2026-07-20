import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { NODE_VISUAL_CONFIG } from '../constants/visualConfig';

// Gold highlight colour shared by selected nodes + edges.
const GOLD = 0xffd700;

// Unit-radius sphere reused for every node halo (scaled per-instance).
const HALO_GEO = new THREE.SphereGeometry(1, 16, 12);
// Halo factor — how much larger than the underlying node the gold shell is.
const HALO_FACTOR = 1.35;

/**
 * SelectionOverlay — draws the gold, glowing highlight for a clicked node's
 * N-hop neighbourhood on TOP of the base graph. Two layers:
 *   • Node halos  — an InstancedMesh of gold spheres over each selected node.
 *   • Edge lines  — a gold LineSegments over each highlighted edge.
 *
 * Both are unlit gold (MeshBasicMaterial / LineBasicMaterial) so the scene's
 * Bloom pass turns them into a glow regardless of lighting. Positions are read
 * from the same physics buffer every tick, so no re-simulation is triggered.
 *
 * Props:
 *   nodes          — same node array passed to InstancedNodes (index === buffer index)
 *   links          — display links (endpoints resolved against `nodes`)
 *   positionsRef   — Float32Array ref [x0,y0,z0, ...] shared with the sim
 *   tick           — physics tick counter
 *   selectedNodeIds — Set<string> of highlighted node ids (incl. the clicked node)
 *   selectedEdgeKeys — Set<string> of highlighted edge keys ("src__tgt")
 *   nodeSettings   — { sizeMultiplier, degreeScale }
 *   degreeMap, maxDegree — for matching the base node's degree-based scale
 */
export function SelectionOverlay({
    nodes, links, positionsRef, tick,
    selectedNodeIds, selectedEdgeKeys,
    nodeSettings, degreeMap, maxDegree,
}) {
    const meshRef = useRef();
    const lineRef = useRef();
    const lineGeoRef = useRef();

    // id → global buffer index (identical ordering to InstancedNodes)
    const indexById = useMemo(() => {
        const m = new Map();
        nodes.forEach((n, i) => m.set(n.id, i));
        return m;
    }, [nodes]);

    // Selected nodes with their buffer index + base render size.
    const haloNodes = useMemo(() => {
        if (!selectedNodeIds || selectedNodeIds.size === 0) return [];
        const out = [];
        nodes.forEach((n, i) => {
            if (!selectedNodeIds.has(n.id)) return;
            const cfg = NODE_VISUAL_CONFIG[(n.canonicalType || 'default').toUpperCase()]
                || NODE_VISUAL_CONFIG.default;
            out.push({ id: n.id, index: i, size: cfg.size });
        });
        return out;
    }, [nodes, selectedNodeIds]);

    // Highlighted edges resolved to endpoint buffer indices.
    const haloEdges = useMemo(() => {
        if (!selectedEdgeKeys || selectedEdgeKeys.size === 0) return [];
        const out = [];
        links.forEach(l => {
            const s = typeof l.source === 'object' ? l.source.id : l.source;
            const t = typeof l.target === 'object' ? l.target.id : l.target;
            if (!selectedEdgeKeys.has(`${s}__${t}`)) return;
            const si = indexById.get(s);
            const ti = indexById.get(t);
            if (si === undefined || ti === undefined) return;
            out.push([si, ti]);
        });
        return out;
    }, [links, selectedEdgeKeys, indexById]);

    const haloMaterial = useMemo(() => new THREE.MeshBasicMaterial({
        color: GOLD, transparent: true, opacity: 0.92, depthWrite: false,
    }), []);
    const edgeMaterial = useMemo(() => new THREE.LineBasicMaterial({
        color: GOLD, transparent: true, opacity: 0.9, depthWrite: false,
    }), []);

    useEffect(() => () => { haloMaterial.dispose(); edgeMaterial.dispose(); }, [haloMaterial, edgeMaterial]);

    // Pre-allocated edge position buffer (2 verts × xyz per edge).
    const edgeBuffer = useMemo(
        () => new Float32Array(haloEdges.length * 6),
        [haloEdges.length]
    );

    // Update node-halo instance matrices every tick.
    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const buf = positionsRef.current;
        if (!buf.length) return;

        const sm = nodeSettings?.sizeMultiplier ?? 1;
        const ds = nodeSettings?.degreeScale ?? 0;
        const mx = maxDegree > 1 ? maxDegree : 1;
        const mat = new THREE.Matrix4();

        haloNodes.forEach((hn, localIdx) => {
            const x = buf[hn.index * 3];
            const y = buf[hn.index * 3 + 1];
            const z = buf[hn.index * 3 + 2];
            if (isNaN(x)) { mat.makeScale(0, 0, 0); mesh.setMatrixAt(localIdx, mat); return; }

            const degree = degreeMap ? (degreeMap.get(hn.id) || 0) : 0;
            const t = degree / mx;
            const scale = hn.size * sm * (1 + t * ds) * HALO_FACTOR;

            mat.makeScale(scale, scale, scale).setPosition(x, y, z);
            mesh.setMatrixAt(localIdx, mat);
        });

        mesh.count = haloNodes.length;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.boundingSphere = null; // overlay is non-interactive but keep it consistent
    }, [tick, haloNodes, positionsRef, nodeSettings?.sizeMultiplier, nodeSettings?.degreeScale, degreeMap, maxDegree]);

    // Update highlighted-edge endpoints every tick.
    useEffect(() => {
        const geo = lineGeoRef.current;
        if (!geo) return;
        const buf = positionsRef.current;
        if (!buf.length) return;

        haloEdges.forEach(([si, ti], i) => {
            const off = i * 6;
            edgeBuffer[off]     = buf[si * 3];
            edgeBuffer[off + 1] = buf[si * 3 + 1];
            edgeBuffer[off + 2] = buf[si * 3 + 2];
            edgeBuffer[off + 3] = buf[ti * 3];
            edgeBuffer[off + 4] = buf[ti * 3 + 1];
            edgeBuffer[off + 5] = buf[ti * 3 + 2];
        });

        const attr = geo.getAttribute('position');
        if (!attr || attr.array !== edgeBuffer) {
            geo.setAttribute('position', new THREE.BufferAttribute(edgeBuffer, 3));
        } else {
            attr.needsUpdate = true;
        }
        geo.setDrawRange(0, haloEdges.length * 2);
    }, [tick, haloEdges, positionsRef, edgeBuffer]);

    return (
        <group name="selection-overlay" raycast={() => null}>
            {haloNodes.length > 0 && (
                <instancedMesh
                    ref={meshRef}
                    args={[HALO_GEO, haloMaterial, haloNodes.length]}
                    frustumCulled={false}
                    raycast={() => null}
                />
            )}
            {haloEdges.length > 0 && (
                <lineSegments ref={lineRef} frustumCulled={false} raycast={() => null}>
                    <bufferGeometry ref={lineGeoRef} />
                    <primitive object={edgeMaterial} attach="material" />
                </lineSegments>
            )}
        </group>
    );
}

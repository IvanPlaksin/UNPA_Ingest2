import React, { useMemo, useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { WEIGHT_TIERS, getTierIndex, weightToColor } from '../data/collapseEdges';

/**
 * WeightedBatchedEdges — renders collapsed/weighted edges using LineSegments2.
 *
 * Visual encoding:
 *   LINE THICKNESS — determined by weight tier (5 discrete levels, 1–5.5 px)
 *   LINE COLOR     — continuous gray→gold gradient driven by weight / maxWeight
 *
 * One LineSegments2 per weight tier → at most 5 draw calls.
 * Colors are set via vertexColors so each edge in the same tier can still
 * have its own colour within the gradient.
 */
export function WeightedBatchedEdges({ links, nodes, positionsRef, tick, edgeOpacity = 1, weightFade = 0, onClick }) {
    const { size } = useThree();

    const nodeIndexMap = useMemo(() => {
        const m = new Map();
        nodes.forEach((n, i) => m.set(n.id, i));
        return m;
    }, [nodes]);

    const nodeMap = useMemo(() => {
        const m = new Map();
        nodes.forEach(n => m.set(n.id, n));
        return m;
    }, [nodes]);

    const resolution = useMemo(
        () => new THREE.Vector2(size.width, size.height),
        [size.width, size.height]
    );

    // Global max weight — needed so all tiers share the same colour scale
    const maxWeight = useMemo(
        () => links.reduce((mx, l) => Math.max(mx, l.weight || 1), 1),
        [links]
    );

    // Partition links into thickness tiers
    const tiers = useMemo(() => {
        const groups = WEIGHT_TIERS.map(() => []);
        links.forEach(link => groups[getTierIndex(link.weight || 1)].push(link));
        return groups;
    }, [links]);

    return (
        <>
            {tiers.map((tierLinks, i) =>
                tierLinks.length > 0 && (
                    <EdgeTier
                        key={i}
                        tierLinks={tierLinks}
                        nodeIndexMap={nodeIndexMap}
                        nodeMap={nodeMap}
                        positionsRef={positionsRef}
                        tick={tick}
                        resolution={resolution}
                        tier={WEIGHT_TIERS[i]}
                        maxWeight={maxWeight}
                        edgeOpacity={edgeOpacity}
                        weightFade={weightFade}
                        onClick={onClick}
                    />
                )
            )}
        </>
    );
}

// ── Single-tier renderer ──────────────────────────────────────────────────────

function EdgeTier({ tierLinks, nodeIndexMap, nodeMap, positionsRef, tick,
    resolution, tier, maxWeight, edgeOpacity, weightFade, onClick }) {

    const objRef = useRef(null);

    // Create geometry, material and mesh once per tier mount.
    // vertexColors: true — colour comes from geo.setColors(), not mat.color.
    const { geo, mat, mesh } = useMemo(() => {
        const geo = new LineSegmentsGeometry();

        const mat = new LineMaterial({
            color: 0xffffff,          // white multiplier when vertexColors=true
            vertexColors: true,
            linewidth: tier.linewidth,
            transparent: true,
            opacity: tier.opacity,
            depthWrite: false,
            threshold: 3,             // extra 3px screen-space hit tolerance for raycasting
            resolution: new THREE.Vector2(resolution.x, resolution.y),
        });

        const mesh = new LineSegments2(geo, mat);
        mesh.frustumCulled = false;
        return { geo, mat, mesh };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally created once

    // Keep resolution in sync with canvas resize
    useEffect(() => {
        mat.resolution.set(resolution.x, resolution.y);
        mat.needsUpdate = true;
    }, [mat, resolution.x, resolution.y]);

    // Global opacity slider × tier weight factor — applied reactively
    useEffect(() => {
        mat.opacity = edgeOpacity * tier.opacity;
        mat.needsUpdate = true;
    }, [mat, edgeOpacity, tier.opacity]);

    // userData for HoverScanner — set as soon as links are available, not tied to physics tick
    useEffect(() => {
        if (objRef.current) {
            objRef.current.userData.edgeLinks       = tierLinks;
            objRef.current.userData.edgeNodeMap     = nodeMap;
            objRef.current.userData.isLineSegments2 = true;
        }
    }, [tierLinks, nodeMap]);

    // Rebuild positions AND colours every physics tick
    useEffect(() => {
        const buf = positionsRef.current;
        if (!buf.length || !tierLinks.length) return;

        const n = tierLinks.length;
        const positions = new Float32Array(n * 6);
        const colors    = new Float32Array(n * 6); // 2 vertices × rgb per segment

        tierLinks.forEach((link, i) => {
            const srcId = typeof link.source === 'object' ? link.source.id : link.source;
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
            const si = nodeIndexMap.get(srcId);
            const ti = nodeIndexMap.get(tgtId);

            if (si !== undefined && ti !== undefined) {
                positions[i * 6]     = buf[si * 3];
                positions[i * 6 + 1] = buf[si * 3 + 1];
                positions[i * 6 + 2] = buf[si * 3 + 2];
                positions[i * 6 + 3] = buf[ti * 3];
                positions[i * 6 + 4] = buf[ti * 3 + 1];
                positions[i * 6 + 5] = buf[ti * 3 + 2];
            }

            // Same colour for both endpoints of this segment (weightFade dims low-weight edges)
            const [r, g, b] = weightToColor(link.weight || 1, maxWeight, weightFade);
            colors[i * 6]     = r;  colors[i * 6 + 1] = g;  colors[i * 6 + 2] = b;
            colors[i * 6 + 3] = r;  colors[i * 6 + 4] = g;  colors[i * 6 + 5] = b;
        });

        geo.setPositions(positions);
        geo.setColors(colors);
    }, [tick, tierLinks, nodeIndexMap, positionsRef, geo, maxWeight, weightFade]);

    // Cleanup on unmount
    useEffect(() => () => {
        geo.dispose();
        mat.dispose();
    }, [geo, mat]);

    const handleClick = (e) => {
        if (!onClick || e.index == null) return;
        e.stopPropagation();
        const link = tierLinks[e.index]; // LineSegments2: e.index = segment index
        if (!link) return;
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
        onClick({
            ...link,
            sourceNode: nodeMap.get(srcId),
            targetNode: nodeMap.get(tgtId),
        });
    };

    return <primitive ref={objRef} object={mesh} onClick={handleClick} />;
}

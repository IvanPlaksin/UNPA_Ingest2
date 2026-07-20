import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';

/**
 * BatchedEdges — renders ALL graph edges as a single THREE.LineSegments draw call.
 * Updates vertex positions each physics tick via BufferAttribute mutation (no GC).
 *
 * Props:
 *   links          — link array { source: id|node, target: id|node, type, context, confidence }
 *   nodes          — node array (for building id→index map)
 *   positionsRef   — Float32Array ref [x0,y0,z0, x1,y1,z1, ...]
 *   tick           — physics tick counter
 *   edgeOpacity    — 0..1, default 0.15
 *   onHover(link|null, clientX, clientY) — called on edge hover
 */
export function BatchedEdges({ links, nodes, positionsRef, tick, edgeOpacity = 0.15, onClick }) {
    const geoRef = useRef();
    const matRef = useRef();
    const lineRef = useRef();

    // Build node id → buffer index map and id → node object map
    const { nodeIndexMap, nodeMap } = useMemo(() => {
        const nodeIndexMap = new Map();
        const nodeMap = new Map();
        nodes.forEach((n, i) => {
            nodeIndexMap.set(n.id, i);
            nodeMap.set(n.id, n);
        });
        return { nodeIndexMap, nodeMap };
    }, [nodes]);

    // Pre-allocate position buffer; reallocate only when link count changes
    const posBuffer = useMemo(
        () => new Float32Array(links.length * 6),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [links.length]
    );

    // Update line endpoints every physics tick
    useEffect(() => {
        const geo = geoRef.current;
        if (!geo || !positionsRef.current.length) return;

        const nodeBuf = positionsRef.current;

        links.forEach((link, i) => {
            const srcId = typeof link.source === 'object' ? link.source.id : link.source;
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
            const si = nodeIndexMap.get(srcId);
            const ti = nodeIndexMap.get(tgtId);
            const off = i * 6;

            if (si !== undefined && ti !== undefined) {
                posBuffer[off]     = nodeBuf[si * 3];
                posBuffer[off + 1] = nodeBuf[si * 3 + 1];
                posBuffer[off + 2] = nodeBuf[si * 3 + 2];
                posBuffer[off + 3] = nodeBuf[ti * 3];
                posBuffer[off + 4] = nodeBuf[ti * 3 + 1];
                posBuffer[off + 5] = nodeBuf[ti * 3 + 2];
            }
        });

        if (!geo.getAttribute('position')) {
            geo.setAttribute('position', new THREE.BufferAttribute(posBuffer, 3));
        } else {
            geo.attributes.position.needsUpdate = true;
        }

        // Invalidate the cached bounding sphere so edge-hover raycasting stays accurate
        // as endpoints move outward each tick. Line.raycast caches boundingSphere on first
        // use and never recomputes it, so a stale sphere would make edges un-hoverable once
        // the graph spreads beyond its initial (clustered) extent.
        geo.boundingSphere = null;
    }, [tick, links, nodeIndexMap, positionsRef, posBuffer]);

    // Update edge opacity without rebuilding anything
    useEffect(() => {
        if (matRef.current) {
            matRef.current.opacity = edgeOpacity;
        }
    }, [edgeOpacity]);

    // Store links + nodeMap in userData so HoverScanner can resolve edges
    useEffect(() => {
        if (lineRef.current) {
            lineRef.current.userData.edgeLinks = links;
            lineRef.current.userData.edgeNodeMap = nodeMap;
        }
    }, [links, nodeMap]);

    const handleClick = (e) => {
        if (!onClick || e.index == null) return;
        e.stopPropagation();
        const linkIdx = Math.floor(e.index / 2);
        const link = links[linkIdx];
        if (!link) return;
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
        onClick({ ...link, sourceNode: nodeMap.get(srcId), targetNode: nodeMap.get(tgtId) });
    };

    return (
        <lineSegments
            ref={lineRef}
            frustumCulled={false}
            onClick={handleClick}
        >
            <bufferGeometry ref={geoRef} />
            <lineBasicMaterial
                ref={matRef}
                color="#ffffff"
                opacity={edgeOpacity}
                transparent
                depthWrite={false}
            />
        </lineSegments>
    );
}

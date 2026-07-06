import { useRef, useEffect, useState, useCallback } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceZ } from 'd3-force-3d';
import { LAYER_Z } from '../constants/visualConfig';

/**
 * d3-force-3d physics simulation hook.
 * Stores positions in a Float32Array ref (not React state) for zero-copy GPU updates.
 * Re-renders driven by a tick counter so the canvas re-reads positionsRef each frame.
 */
export function useForceSimulation(nodes, links, options = {}) {
    const {
        chargeStrength = -120,
        linkDistance = 60,
        stratified = false,
        alphaDecay = 0.02,
    } = options;

    const simulationRef = useRef(null);
    const positionsRef = useRef(new Float32Array(0));
    const [tick, setTick] = useState(0);
    const [isStabilized, setIsStabilized] = useState(false);

    useEffect(() => {
        if (nodes.length === 0) return;

        // Always reallocate buffer when node set changes (new filter = new indices)
        positionsRef.current = new Float32Array(nodes.length * 3);
        setIsStabilized(false);

        const simNodes = nodes.map((n, i) => ({
            ...n,
            index: i,
            x: (Math.random() - 0.5) * 300,
            y: (Math.random() - 0.5) * 300,
            z: stratified ? (LAYER_Z[n.canonicalType] ?? 0) : (Math.random() - 0.5) * 300,
        }));

        const idToIndex = new Map(simNodes.map((n, i) => [n.id, i]));

        const simLinks = links
            .map(l => ({
                source: typeof l.source === 'object' ? l.source.id : l.source,
                target: typeof l.target === 'object' ? l.target.id : l.target,
            }))
            .filter(l => idToIndex.has(l.source) && idToIndex.has(l.target));

        const simulation = forceSimulation(simNodes, 3)
            .force('charge', forceManyBody().strength(chargeStrength))
            .force('link', forceLink(simLinks).id(d => d.id).distance(linkDistance).iterations(1))
            .force('center', forceCenter(0, 0, 0))
            .alphaDecay(alphaDecay)
            .on('tick', () => {
                const buf = positionsRef.current;
                simNodes.forEach((node, i) => {
                    buf[i * 3]     = node.x;
                    buf[i * 3 + 1] = node.y;
                    buf[i * 3 + 2] = stratified ? (LAYER_Z[node.canonicalType] ?? node.z) : node.z;
                });
                setTick(t => t + 1);
            })
            .on('end', () => setIsStabilized(true));

        if (stratified) {
            simulation.force('z', forceZ(d => LAYER_Z[d.canonicalType] ?? 0).strength(0.4));
        }

        simulationRef.current = simulation;

        return () => simulation.stop();
        // Depend on the array REFERENCE: filteredNodes/filteredLinks produce a new ref
        // on every filter change (useMemo), so this correctly restarts when filters change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodes, links, stratified, chargeStrength, linkDistance]);

    const reheat = useCallback(() => {
        setIsStabilized(false);
        simulationRef.current?.alpha(0.5).restart();
    }, []);

    // Expose raw simNodes reference so InstancedNodes can read ids in order
    const getSimNodes = useCallback(() => simulationRef.current?.nodes() ?? [], []);

    return { positionsRef, tick, isStabilized, reheat, getSimNodes };
}

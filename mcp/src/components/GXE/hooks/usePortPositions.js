/**
 * usePortPositions — hook that runs portAssigner on nodes/edges
 * and returns enriched arrays with dynamic handle placements.
 *
 * CONS-12: Multi-Handle Ports for GXE.
 *
 * Usage:
 *   const { nodesWithPorts, edgesWithPorts } = usePortPositions(nodes, edges, enabled);
 *
 * When enabled=false (default), returns original nodes/edges unchanged.
 * When enabled=true, enriches nodes with portConfigs and edges with sourceHandle/targetHandle.
 */

import { useMemo, useRef } from 'react';
import { assignPorts } from '../utils/portAssigner';

/**
 * Stable hash for port assignment memoization.
 * Only recalculate when node positions or edge topology changes.
 */
function topologyKey(nodes, edges) {
  // Use node count + positions + edge count + connections as key
  const nk = nodes.map(n => `${n.id}:${Math.round(n.position?.x || 0)},${Math.round(n.position?.y || 0)}`).join('|');
  const ek = edges.map(e => `${e.source}->${e.target}`).join('|');
  return `${nk}#${ek}`;
}

export function usePortPositions(nodes, edges, enabled = false) {
  const lastKeyRef = useRef('');
  const cachedRef = useRef({ nodesWithPorts: nodes, edgesWithPorts: edges });

  return useMemo(() => {
    if (!enabled || nodes.length === 0) {
      return { nodesWithPorts: nodes, edgesWithPorts: edges };
    }

    const key = topologyKey(nodes, edges);
    if (key === lastKeyRef.current) {
      return cachedRef.current;
    }

    const { enrichedNodes, enrichedEdges } = assignPorts(nodes, edges);
    lastKeyRef.current = key;
    cachedRef.current = { nodesWithPorts: enrichedNodes, edgesWithPorts: enrichedEdges };
    return cachedRef.current;
  }, [nodes, edges, enabled]);
}

export default usePortPositions;

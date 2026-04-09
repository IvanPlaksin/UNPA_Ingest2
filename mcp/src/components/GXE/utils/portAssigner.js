/**
 * PortAssigner — analyzes graph edges and assigns unique handle IDs
 * to each edge, plus generates portConfigs for each node.
 *
 * Migrated from AOPEG/utils/portAssigner.ts (CONS-12).
 *
 * Port positions are determined by the direction of connections:
 * ports are placed on the side closest to the peer node.
 * Ports on horizontal sides are sorted by peer Y; vertical sides by peer X.
 */

// ── Constants ──
const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 100;

/**
 * Compute position along edge for the i-th port out of `total` ports.
 * Evenly distributes: for 3 ports → 0.25, 0.50, 0.75
 * For 1 port → 0.50 (centered)
 */
function computeOffset(index, total) {
  if (total <= 1) return 0.5;
  return (index + 1) / (total + 1);
}

/**
 * Determine which side of a node a peer node is closest to.
 * Uses aspect-ratio-adjusted comparison of center-to-center vector.
 */
function determineSide(nodePos, nodeSize, peerPos, peerSize) {
  const nodeCx = nodePos.x + nodeSize.w / 2;
  const nodeCy = nodePos.y + nodeSize.h / 2;
  const peerCx = peerPos.x + peerSize.w / 2;
  const peerCy = peerPos.y + peerSize.h / 2;

  const dx = peerCx - nodeCx;
  const dy = peerCy - nodeCy;

  const absX = Math.abs(dx) / nodeSize.w;
  const absY = Math.abs(dy) / nodeSize.h;

  if (absX >= absY) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'bottom' : 'top';
}

/**
 * Sort key for ports on a given side.
 * Horizontal sides (left/right): sort by peer Y (top to bottom).
 * Vertical sides (top/bottom): sort by peer X (left to right).
 */
function sortKeyForSide(side, peerPos) {
  if (side === 'left' || side === 'right') return peerPos.y;
  return peerPos.x;
}

/**
 * Get node size from DOM measurement or defaults.
 */
function getNodeSize(node) {
  if (typeof document !== 'undefined') {
    const el = document.querySelector(`[data-id="${node.id}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) };
    }
  }
  const isSmall = node.data?.kind?.startsWith('tool.') || node.data?.kind === 'tool-ref';
  return {
    w: isSmall ? 190 : DEFAULT_WIDTH,
    h: isSmall ? 70 : DEFAULT_HEIGHT,
  };
}

/**
 * Analyze graph topology and assign unique port IDs to every edge connection.
 *
 * Returns { enrichedNodes, enrichedEdges } where:
 * - enrichedNodes have `data.portConfigs` array
 * - enrichedEdges have `sourceHandle` / `targetHandle` set
 *
 * @param {Array} nodes - ReactFlow nodes
 * @param {Array} edges - ReactFlow edges
 * @returns {{ enrichedNodes: Array, enrichedEdges: Array }}
 */
export function assignPorts(nodes, edges) {
  if (nodes.length === 0) return { enrichedNodes: [], enrichedEdges: [] };

  // Build position and size lookup
  const posMap = new Map();
  const sizeMap = new Map();
  for (const n of nodes) {
    posMap.set(n.id, n.position || { x: 0, y: 0 });
    sizeMap.set(n.id, getNodeSize(n));
  }

  // Group edges by node
  const incomingByNode = new Map();
  const outgoingByNode = new Map();

  for (const n of nodes) {
    incomingByNode.set(n.id, []);
    outgoingByNode.set(n.id, []);
  }

  for (const e of edges) {
    const src = typeof e.source === 'string' ? e.source : e.source?.id;
    const tgt = typeof e.target === 'string' ? e.target : e.target?.id;
    if (outgoingByNode.has(src)) outgoingByNode.get(src).push(e);
    if (incomingByNode.has(tgt)) incomingByNode.get(tgt).push(e);
  }

  // Port configs per node
  const nodePortConfigs = new Map();
  // Handle assignments: edgeId → { sourceHandle, targetHandle }
  const edgeHandles = new Map();

  for (const node of nodes) {
    const ports = [];
    const nodeId = node.id;
    const nodePos = posMap.get(nodeId) || { x: 0, y: 0 };
    const nodeSize = sizeMap.get(nodeId) || { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };

    // --- Incoming edges (target handles) ---
    const incoming = incomingByNode.get(nodeId) || [];
    const incomingBySide = new Map();

    for (const e of incoming) {
      const peerPos = posMap.get(e.source) || { x: 0, y: 0 };
      const peerSize = sizeMap.get(e.source) || { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
      const side = determineSide(nodePos, nodeSize, peerPos, peerSize);
      if (!incomingBySide.has(side)) incomingBySide.set(side, []);
      incomingBySide.get(side).push({ edge: e, sortKey: sortKeyForSide(side, peerPos) });
    }

    let inIdx = 0;
    for (const [side, entries] of incomingBySide) {
      entries.sort((a, b) => a.sortKey - b.sortKey);
      const total = entries.length;
      for (let i = 0; i < total; i++) {
        const { edge } = entries[i];
        const handleId = `${nodeId}-in-${inIdx}`;
        const offsetPercent = computeOffset(i, total);

        ports.push({
          id: handleId,
          type: 'target',
          position: side,
          offsetPercent,
          edgeId: edge.id,
        });

        const existing = edgeHandles.get(edge.id) || { sourceHandle: '', targetHandle: '' };
        existing.targetHandle = handleId;
        edgeHandles.set(edge.id, existing);
        inIdx++;
      }
    }

    // --- Outgoing edges (source handles) ---
    const outgoing = outgoingByNode.get(nodeId) || [];
    const outgoingBySide = new Map();

    for (const e of outgoing) {
      const peerPos = posMap.get(e.target) || { x: 0, y: 0 };
      const peerSize = sizeMap.get(e.target) || { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
      const side = determineSide(nodePos, nodeSize, peerPos, peerSize);
      if (!outgoingBySide.has(side)) outgoingBySide.set(side, []);
      outgoingBySide.get(side).push({ edge: e, sortKey: sortKeyForSide(side, peerPos) });
    }

    let outIdx = 0;
    for (const [side, entries] of outgoingBySide) {
      entries.sort((a, b) => a.sortKey - b.sortKey);
      const total = entries.length;
      for (let i = 0; i < total; i++) {
        const { edge } = entries[i];
        const handleId = `${nodeId}-out-${outIdx}`;
        const offsetPercent = computeOffset(i, total);

        ports.push({
          id: handleId,
          type: 'source',
          position: side,
          offsetPercent,
          edgeId: edge.id,
        });

        const existing = edgeHandles.get(edge.id) || { sourceHandle: '', targetHandle: '' };
        existing.sourceHandle = handleId;
        edgeHandles.set(edge.id, existing);
        outIdx++;
      }
    }

    nodePortConfigs.set(nodeId, ports);
  }

  // Enrich nodes with portConfigs
  const enrichedNodes = nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      portConfigs: nodePortConfigs.get(n.id) || [],
    },
  }));

  // Enrich edges with sourceHandle / targetHandle
  const enrichedEdges = edges.map((e) => {
    const handles = edgeHandles.get(e.id);
    if (!handles) return e;
    return {
      ...e,
      sourceHandle: handles.sourceHandle || undefined,
      targetHandle: handles.targetHandle || undefined,
    };
  });

  return { enrichedNodes, enrichedEdges };
}

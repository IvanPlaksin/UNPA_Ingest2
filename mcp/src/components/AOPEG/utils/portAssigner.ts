/**
 * PortAssigner — analyzes graph edges and assigns unique handle IDs
 * to each edge, plus generates portConfigs for each node.
 *
 * Port positions are determined by the horizontal direction of connections:
 * ports are sorted by X-position of the connected peer node, so that
 * a connection from the rightmost node gets the rightmost port position.
 *
 * Supports all 4 sides: ports are placed on the side closest to the peer node.
 */

import { Node, Edge } from 'reactflow';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

export type PortSide = 'left' | 'right' | 'top' | 'bottom';

export interface PortConfig {
  /** Unique handle id, e.g. "node-1-out-0" */
  id: string;
  /** Handle type */
  type: 'source' | 'target';
  /** Side of the node where the port is placed */
  position: PortSide;
  /** Position along the edge as fraction 0..1 */
  offsetPercent: number;
  /** The edge connected to this port */
  edgeId: string;
}

export interface PortAssignmentResult {
  enrichedNodes: Node[];
  enrichedEdges: Edge[];
}

// Default node dimensions for center calculation
const DEFAULT_WIDTH = 220;
const DEFAULT_HEIGHT = 100;

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute position along edge for the i-th port out of `total` ports.
 * Evenly distributes: for 3 ports → 0.25, 0.50, 0.75
 * For 1 port → 0.50 (centered)
 */
function computeOffset(index: number, total: number): number {
  if (total <= 1) return 0.5;
  return (index + 1) / (total + 1);
}

/**
 * Determine which side of a node a peer node is closest to.
 * Uses the angle from node center to peer center.
 */
function determineSide(
  nodePos: { x: number; y: number },
  nodeSize: { w: number; h: number },
  peerPos: { x: number; y: number },
  peerSize: { w: number; h: number }
): PortSide {
  const nodeCx = nodePos.x + nodeSize.w / 2;
  const nodeCy = nodePos.y + nodeSize.h / 2;
  const peerCx = peerPos.x + peerSize.w / 2;
  const peerCy = peerPos.y + peerSize.h / 2;

  const dx = peerCx - nodeCx;
  const dy = peerCy - nodeCy;

  // Use aspect-ratio-adjusted comparison to decide horizontal vs vertical
  const absX = Math.abs(dx) / nodeSize.w;
  const absY = Math.abs(dy) / nodeSize.h;

  if (absX >= absY) {
    return dx >= 0 ? 'right' : 'left';
  } else {
    return dy >= 0 ? 'bottom' : 'top';
  }
}

/**
 * Sort key for ports on a given side — determines the visual ordering.
 * For horizontal sides (left/right): sort by peer Y-position (top to bottom)
 * For vertical sides (top/bottom): sort by peer X-position (left to right)
 */
function sortKeyForSide(side: PortSide, peerPos: { x: number; y: number }): number {
  if (side === 'left' || side === 'right') return peerPos.y;
  return peerPos.x;
}

/**
 * Get the node size from DOM measurement or defaults.
 */
function getNodeSize(node: Node): { w: number; h: number } {
  const el = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement | null;
  if (el) {
    const rect = el.getBoundingClientRect();
    return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) };
  }
  const isSmall = (node.data as any)?.kind?.startsWith('tool.') || (node.data as any)?.kind === 'tool-ref';
  return {
    w: isSmall ? 190 : DEFAULT_WIDTH,
    h: isSmall ? 70 : DEFAULT_HEIGHT,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CORE FUNCTION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Analyze graph topology and assign unique port IDs to every edge connection.
 *
 * For each node:
 *  - Determines which side each connection should use (based on peer position)
 *  - Groups connections by side
 *  - Sorts ports on horizontal sides by peer Y, on vertical sides by peer X
 *  - Assigns evenly spaced offsetPercent values
 *
 * Returns enriched nodes (with portConfigs in data) and enriched edges
 * (with sourceHandle / targetHandle set).
 */
export function assignPorts(nodes: Node[], edges: Edge[]): PortAssignmentResult {
  if (nodes.length === 0) return { enrichedNodes: [], enrichedEdges: [] };

  // Build position and size lookup
  const posMap = new Map<string, { x: number; y: number }>();
  const sizeMap = new Map<string, { w: number; h: number }>();
  for (const n of nodes) {
    posMap.set(n.id, n.position || { x: 0, y: 0 });
    sizeMap.set(n.id, getNodeSize(n));
  }

  // Group edges by node
  const incomingByNode = new Map<string, Edge[]>();
  const outgoingByNode = new Map<string, Edge[]>();

  for (const n of nodes) {
    incomingByNode.set(n.id, []);
    outgoingByNode.set(n.id, []);
  }

  for (const e of edges) {
    const src = typeof e.source === 'string' ? e.source : (e.source as any)?.id;
    const tgt = typeof e.target === 'string' ? e.target : (e.target as any)?.id;
    if (outgoingByNode.has(src)) outgoingByNode.get(src)!.push(e);
    if (incomingByNode.has(tgt)) incomingByNode.get(tgt)!.push(e);
  }

  // Port configs per node
  const nodePortConfigs = new Map<string, PortConfig[]>();

  // Handle assignments for edges: edgeId → { sourceHandle, targetHandle }
  const edgeHandles = new Map<string, { sourceHandle: string; targetHandle: string }>();

  for (const node of nodes) {
    const ports: PortConfig[] = [];
    const nodeId = node.id;
    const nodePos = posMap.get(nodeId) || { x: 0, y: 0 };
    const nodeSize = sizeMap.get(nodeId) || { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };

    // --- Incoming edges (target handles) ---
    const incoming = incomingByNode.get(nodeId) || [];

    // Group incoming by side
    const incomingBySide = new Map<PortSide, Array<{ edge: Edge; sortKey: number }>>();
    for (const e of incoming) {
      const peerPos = posMap.get(e.source) || { x: 0, y: 0 };
      const peerSize = sizeMap.get(e.source) || { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
      const side = determineSide(nodePos, nodeSize, peerPos, peerSize);
      if (!incomingBySide.has(side)) incomingBySide.set(side, []);
      incomingBySide.get(side)!.push({ edge: e, sortKey: sortKeyForSide(side, peerPos) });
    }

    // Create ports for each side
    let inIdx = 0;
    for (const [side, entries] of incomingBySide) {
      // Sort by position along the side axis
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

    // Group outgoing by side
    const outgoingBySide = new Map<PortSide, Array<{ edge: Edge; sortKey: number }>>();
    for (const e of outgoing) {
      const peerPos = posMap.get(e.target) || { x: 0, y: 0 };
      const peerSize = sizeMap.get(e.target) || { w: DEFAULT_WIDTH, h: DEFAULT_HEIGHT };
      const side = determineSide(nodePos, nodeSize, peerPos, peerSize);
      if (!outgoingBySide.has(side)) outgoingBySide.set(side, []);
      outgoingBySide.get(side)!.push({ edge: e, sortKey: sortKeyForSide(side, peerPos) });
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

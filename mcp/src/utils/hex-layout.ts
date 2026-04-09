/**
 * hex-layout.ts — Hex Layout Algorithm (Step 2.1)
 *
 * Places graph nodes on a hex grid using hierarchical layers,
 * barycenter sorting for crossing minimization, and gap enforcement.
 */

import type { Node, Edge } from 'reactflow';
import { HexCoord, HexGridConfig, hex, hexToPixel } from './hex-coords';
import { HexGrid } from './hex-grid';

// ── Types ────────────────────────────────────────────────────────────────

export interface HexLayoutOptions {
  config: HexGridConfig;
  minNodeGap: number;       // min hex cells between nodes (default: 1)
  channelCapacity: number;  // routing tracks per cell (default: 3)
  direction: 'LR' | 'TB';  // flow direction
  layerSpacing: number;     // hex cells between hierarchy layers (default: 3)
  nodeSpacing: number;      // hex cells between nodes in same layer (default: 2)
}

export interface HexLayoutResult {
  grid: HexGrid;
  nodeHexPositions: Map<string, HexCoord>;
  nodePixelPositions: Map<string, { x: number; y: number }>;
  layers: Map<number, string[]>;
  clusters: Map<string, string[]>;
}

export const DEFAULT_HEX_LAYOUT_OPTIONS: Partial<HexLayoutOptions> = {
  minNodeGap: 1,
  channelCapacity: 3,
  direction: 'LR',
  layerSpacing: 3,
  nodeSpacing: 2,
};

// ── Helper: Create HexGridConfig ─────────────────────────────────────────

export function createHexGridConfig(
  hexSize: number,
  canvasWidth: number,
  canvasHeight: number,
): HexGridConfig {
  return {
    hexSize,
    originX: canvasWidth / 2,
    originY: canvasHeight / 2,
  };
}

// ── Main Layout Function ─────────────────────────────────────────────────

export function computeHexLayout(
  nodes: Node[],
  edges: Edge[],
  options: HexLayoutOptions,
): HexLayoutResult {
  // ── Etap A: Build adjacency & assign layers via longest-path BFS ───

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  const nodeIds = new Set(nodes.map(n => n.id));

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;

    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge.target);

    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    incoming.get(edge.target)!.push(edge.source);
  }

  // Entry nodes: no incoming edges
  const entryNodes = nodes.filter(
    n => !incoming.has(n.id) || incoming.get(n.id)!.length === 0,
  );

  // BFS for longest-path layering (cycle-safe)
  // Uses update-count limit per node to prevent infinite loops on back-edges
  const nodeLayer = new Map<string, number>();
  const updateCount = new Map<string, number>(); // how many times a node was updated
  const MAX_UPDATES_PER_NODE = 3; // prevent infinite re-layering on cycles
  const MAX_BFS_ITERATIONS = nodes.length * 10; // absolute safety limit

  const queue: Array<{ id: string; layer: number }> = entryNodes.map(n => ({
    id: n.id,
    layer: 0,
  }));

  // If no entry nodes (fully cyclic graph), start from first node
  if (queue.length === 0 && nodes.length > 0) {
    queue.push({ id: nodes[0].id, layer: 0 });
  }

  let bfsIter = 0;
  while (queue.length > 0 && bfsIter < MAX_BFS_ITERATIONS) {
    bfsIter++;
    const { id, layer } = queue.shift()!;

    const existing = nodeLayer.get(id);
    if (existing !== undefined && existing >= layer) {
      continue; // already at same or deeper layer
    }

    // Limit how many times a node can be re-layered (handles cycles)
    const count = (updateCount.get(id) || 0) + 1;
    if (count > MAX_UPDATES_PER_NODE) continue;
    updateCount.set(id, count);

    nodeLayer.set(id, layer);

    for (const targetId of outgoing.get(id) || []) {
      queue.push({ id: targetId, layer: layer + 1 });
    }
  }

  // Place any unvisited nodes (isolated) at layer 0
  for (const node of nodes) {
    if (!nodeLayer.has(node.id)) {
      nodeLayer.set(node.id, 0);
    }
  }

  // Group by layers
  const layers = new Map<number, string[]>();
  for (const [nodeId, layer] of nodeLayer) {
    if (!layers.has(layer)) layers.set(layer, []);
    layers.get(layer)!.push(nodeId);
  }

  // ── Etap B: Barycenter sorting per layer ───────────────────────────

  const nodeHexPositions = new Map<string, HexCoord>();
  const grid = new HexGrid({
    config: options.config,
    defaultCapacity: options.channelCapacity,
  });

  const sortedLayerIndices = Array.from(layers.keys()).sort((a, b) => a - b);

  for (const layerIndex of sortedLayerIndices) {
    const layerNodes = layers.get(layerIndex)!;

    // Sort by barycenter of already-placed predecessors
    const sorted = sortByBarycenter(
      layerNodes,
      nodeHexPositions,
      edges,
      options.direction,
    );

    // ── Etap C: Assign hex coordinates ─────────────────────────────
    const halfLen = Math.floor(sorted.length / 2);

    for (let i = 0; i < sorted.length; i++) {
      const nodeId = sorted[i];
      const offset = i - halfLen;

      let coord: HexCoord;
      if (options.direction === 'LR') {
        coord = hex(
          layerIndex * options.layerSpacing,
          offset * options.nodeSpacing,
        );
      } else {
        coord = hex(
          offset * options.nodeSpacing,
          layerIndex * options.layerSpacing,
        );
      }

      // Adjust if occupied or too close
      if (!grid.canPlaceNode(coord, options.minNodeGap)) {
        const free = grid.findNearestFreeCell(coord, options.minNodeGap, 15);
        if (free) coord = free;
      }

      grid.placeNode(coord, nodeId);
      nodeHexPositions.set(nodeId, coord);
    }
  }

  // ── Etap E: Convert to pixel coordinates ───────────────────────────

  const nodePixelPositions = new Map<string, { x: number; y: number }>();
  for (const [nodeId, hexCoord] of nodeHexPositions) {
    const pixel = hexToPixel(hexCoord, options.config);
    nodePixelPositions.set(nodeId, { x: pixel.x, y: pixel.y });
  }

  return {
    grid,
    nodeHexPositions,
    nodePixelPositions,
    layers,
    clusters: new Map(), // TODO: add clustering in future phase
  };
}

// ── Barycenter Sorting ───────────────────────────────────────────────────

function sortByBarycenter(
  layerNodes: string[],
  previousPositions: Map<string, HexCoord>,
  edges: Edge[],
  direction: 'LR' | 'TB',
): string[] {
  const barycenters = new Map<string, number>();

  for (const nodeId of layerNodes) {
    const neighborCoords: number[] = [];

    for (const edge of edges) {
      if (edge.target === nodeId && previousPositions.has(edge.source)) {
        const sourceHex = previousPositions.get(edge.source)!;
        // Perpendicular axis to flow direction
        neighborCoords.push(direction === 'LR' ? sourceHex.r : sourceHex.q);
      }
    }

    if (neighborCoords.length > 0) {
      const sum = neighborCoords.reduce((a, b) => a + b, 0);
      barycenters.set(nodeId, sum / neighborCoords.length);
    } else {
      barycenters.set(nodeId, 0);
    }
  }

  return [...layerNodes].sort(
    (a, b) => (barycenters.get(a) ?? 0) - (barycenters.get(b) ?? 0),
  );
}

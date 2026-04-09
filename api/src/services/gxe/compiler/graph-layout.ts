/**
 * GXE Graph Compiler - Graph Layout
 *
 * Phase 0: Foundation (Day 5)
 *
 * Provides automatic layout algorithms for DAG visualization.
 * Uses Dagre for hierarchical layout suited for execution graphs.
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Layout direction.
 */
export type LayoutDirection = 'TB' | 'BT' | 'LR' | 'RL';

/**
 * Layout options.
 */
export interface LayoutOptions {
  /** Direction: TB (top-bottom), BT, LR, RL */
  direction?: LayoutDirection;
  /** Horizontal spacing between nodes */
  nodeSpacingX?: number;
  /** Vertical spacing between nodes */
  nodeSpacingY?: number;
  /** Node width */
  nodeWidth?: number;
  /** Node height */
  nodeHeight?: number;
  /** Margin around the graph */
  margin?: number;
}

/**
 * Node position.
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Node with position.
 */
export interface PositionedNode<T = unknown> {
  id: string;
  position: NodePosition;
  data?: T;
}

/**
 * Layout result.
 */
export interface LayoutResult<T = unknown> {
  nodes: PositionedNode<T>[];
  width: number;
  height: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// LAYOUT ALGORITHM (Dagre-compatible)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply automatic layout to graph nodes.
 *
 * This implements a simplified layered layout algorithm similar to Dagre.
 * For production use, consider using the actual Dagre library.
 *
 * @param nodes - Nodes with id (and optional existing position/data)
 * @param edges - Edges with source.nodeId and target.nodeId
 * @param options - Layout options
 * @returns Nodes with updated positions
 */
export function applyLayout<T = unknown>(
  nodes: Array<{ id: string; position?: NodePosition; data?: T }>,
  edges: Array<{ source: { nodeId: string }; target: { nodeId: string } }>,
  options: LayoutOptions = {}
): LayoutResult<T> {
  const {
    direction = 'TB',
    nodeSpacingX = 60,
    nodeSpacingY = 80,
    nodeWidth = 220,
    nodeHeight = 80,
    margin = 50,
  } = options;

  // Build adjacency and in-degree
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const edge of edges) {
    const src = edge.source.nodeId;
    const tgt = edge.target.nodeId;

    if (src === '__params') continue;

    if (adjacency.has(src) && inDegree.has(tgt)) {
      adjacency.get(src)!.push(tgt);
      inDegree.set(tgt, inDegree.get(tgt)! + 1);
    }
  }

  // Compute layers using topological sort (Kahn's algorithm)
  const layers: string[][] = [];
  const nodeLayer = new Map<string, number>();
  const queue: string[] = [];
  const processed = new Set<string>();

  // Initialize with nodes having no incoming edges
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) {
      queue.push(nodeId);
    }
  });

  // Assign layers
  while (queue.length > 0) {
    const batch = [...queue];
    queue.length = 0;

    const layer: string[] = [];
    for (const nodeId of batch) {
      if (processed.has(nodeId)) continue;
      processed.add(nodeId);
      layer.push(nodeId);
      nodeLayer.set(nodeId, layers.length);

      const neighbors = adjacency.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const newDegree = inDegree.get(neighbor)! - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0 && !processed.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    if (layer.length > 0) {
      layers.push(layer);
    }
  }

  // Handle remaining nodes (in cycles - place at end)
  const unprocessed = nodes.filter(n => !processed.has(n.id));
  if (unprocessed.length > 0) {
    layers.push(unprocessed.map(n => n.id));
    for (const n of unprocessed) {
      nodeLayer.set(n.id, layers.length - 1);
    }
  }

  // Compute positions
  const isHorizontal = direction === 'LR' || direction === 'RL';
  const isReversed = direction === 'BT' || direction === 'RL';

  const positionedNodes: PositionedNode<T>[] = [];
  let maxWidth = 0;
  let maxHeight = 0;

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const actualLayerIdx = isReversed ? layers.length - 1 - layerIdx : layerIdx;

    for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
      const nodeId = layer[nodeIdx];
      const originalNode = nodes.find(n => n.id === nodeId);

      let x: number, y: number;

      if (isHorizontal) {
        x = margin + actualLayerIdx * (nodeWidth + nodeSpacingX);
        y = margin + nodeIdx * (nodeHeight + nodeSpacingY);
      } else {
        x = margin + nodeIdx * (nodeWidth + nodeSpacingX);
        y = margin + actualLayerIdx * (nodeHeight + nodeSpacingY);
      }

      positionedNodes.push({
        id: nodeId,
        position: { x, y },
        data: originalNode?.data,
      });

      maxWidth = Math.max(maxWidth, x + nodeWidth);
      maxHeight = Math.max(maxHeight, y + nodeHeight);
    }
  }

  return {
    nodes: positionedNodes,
    width: maxWidth + margin,
    height: maxHeight + margin,
  };
}

/**
 * Apply Dagre layout to ReactFlow nodes.
 *
 * This is a convenience wrapper that updates ReactFlow node positions.
 *
 * @param nodes - ReactFlow nodes
 * @param edges - ReactFlow edges
 * @param options - Layout options
 * @returns Updated ReactFlow nodes with new positions
 */
export function applyDagreLayout<T extends { id: string; position: NodePosition; data?: unknown }>(
  nodes: T[],
  edges: Array<{ source: string; target: string }>,
  options: LayoutOptions = {}
): T[] {
  // Convert edges to internal format
  const internalEdges = edges.map(e => ({
    source: { nodeId: e.source },
    target: { nodeId: e.target },
  }));

  // Apply layout
  const result = applyLayout(nodes, internalEdges, options);

  // Map positions back to original nodes
  const positionMap = new Map(result.nodes.map(n => [n.id, n.position]));

  return nodes.map(node => ({
    ...node,
    position: positionMap.get(node.id) || node.position,
  }));
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Center nodes around origin (0, 0).
 */
export function centerNodes<T extends { position: NodePosition }>(
  nodes: T[],
  viewportWidth?: number,
  viewportHeight?: number
): T[] {
  if (nodes.length === 0) return nodes;

  // Find bounding box
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x);
    maxY = Math.max(maxY, node.position.y);
  }

  const graphWidth = maxX - minX;
  const graphHeight = maxY - minY;

  // Calculate offset to center
  let offsetX = -minX - graphWidth / 2;
  let offsetY = -minY - graphHeight / 2;

  // If viewport provided, center in viewport
  if (viewportWidth !== undefined && viewportHeight !== undefined) {
    offsetX = (viewportWidth - graphWidth) / 2 - minX;
    offsetY = (viewportHeight - graphHeight) / 2 - minY;
  }

  return nodes.map(node => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
}

/**
 * Get graph bounding box.
 */
export function getBoundingBox(
  nodes: Array<{ position: NodePosition }>,
  nodeWidth = 220,
  nodeHeight = 80
): { x: number; y: number; width: number; height: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + nodeWidth);
    maxY = Math.max(maxY, node.position.y + nodeHeight);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Fit nodes to viewport.
 */
export function fitToViewport<T extends { position: NodePosition }>(
  nodes: T[],
  viewportWidth: number,
  viewportHeight: number,
  padding = 50
): { nodes: T[]; zoom: number } {
  if (nodes.length === 0) {
    return { nodes, zoom: 1 };
  }

  const bbox = getBoundingBox(nodes);
  const availableWidth = viewportWidth - padding * 2;
  const availableHeight = viewportHeight - padding * 2;

  const scaleX = availableWidth / bbox.width;
  const scaleY = availableHeight / bbox.height;
  const zoom = Math.min(scaleX, scaleY, 1); // Don't zoom in past 100%

  // Scale and center
  const scaledNodes = nodes.map(node => ({
    ...node,
    position: {
      x: (node.position.x - bbox.x) * zoom + padding,
      y: (node.position.y - bbox.y) * zoom + padding,
    },
  }));

  return { nodes: scaledNodes, zoom };
}

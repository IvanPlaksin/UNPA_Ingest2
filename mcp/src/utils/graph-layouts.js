/**
 * Graph Layout Algorithms
 *
 * Pure functions for graph node positioning.
 * Works in both browser (React) and Node.js (MCP server).
 * Each function takes (nodes, edges, options) and returns positioned nodes array.
 *
 * Includes ELK.js (Eclipse Layout Kernel) for professional-grade layouts
 * used in BPMN, engineering diagrams, and business process modeling.
 */

import ELK from 'elkjs/lib/elk.bundled.js';
import { stratify, tree as d3tree } from 'd3-hierarchy';
import { detectClusters } from './graph-clustering';

// Singleton ELK instance (thread-safe, reusable)
const elk = new ELK();

// ═══════════════════════════════════════════════════════════════════════════
// ALGORITHM REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

export const LAYOUT_ALGORITHMS = {
  'elk-layered':  { label: 'Layered (ELK)',      hasDirection: true,  async: true  },
  'elk-stress':   { label: 'Stress (ELK)',        hasDirection: false, async: true  },
  'elk-force':    { label: 'Force (ELK)',         hasDirection: false, async: true  },
  'elk-mrtree':   { label: 'MrTree (ELK)',        hasDirection: true,  async: true  },
  'elk-radial':   { label: 'Radial (ELK)',        hasDirection: false, async: true  },
  dagre:          { label: 'Hierarchical (Dagre)', hasDirection: true,  async: false },
  force:          { label: 'Force-Directed',       hasDirection: false, async: false },
  circular:       { label: 'Circular',             hasDirection: false, async: false },
  radial:         { label: 'Radial Tree',          hasDirection: false, async: false },
  grid:           { label: 'Grid',                 hasDirection: false, async: false },
  tree:           { label: 'Compact Tree',         hasDirection: true,  async: false },
};

// Edge routing types for ReactFlow
export const EDGE_TYPES = {
  default:    { label: 'Bezier',     description: 'Smooth curves' },
  smoothstep: { label: 'SmoothStep', description: 'Rounded orthogonal' },
  step:       { label: 'Orthogonal', description: 'Right-angle paths' },
  straight:   { label: 'Straight',   description: 'Direct lines' },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function buildGraphMaps(nodes, edges) {
  const adj = new Map();
  const inDeg = new Map();
  const nodeMap = new Map();

  for (const n of nodes) {
    adj.set(n.id, []);
    inDeg.set(n.id, 0);
    nodeMap.set(n.id, n);
  }

  for (const e of edges) {
    const src = e.source?.id || e.source;
    const tgt = e.target?.id || e.target;
    if (adj.has(src) && inDeg.has(tgt)) {
      adj.get(src).push(tgt);
      inDeg.set(tgt, (inDeg.get(tgt) || 0) + 1);
    }
  }

  return { adj, inDeg, nodeMap };
}

function topologicalSort(nodes, edges) {
  const { adj, inDeg } = buildGraphMaps(nodes, edges);
  const result = [];
  const queue = [];

  inDeg.forEach((deg, id) => { if (deg === 0) queue.push(id); });

  while (queue.length > 0) {
    const id = queue.shift();
    result.push(id);
    for (const neighbor of (adj.get(id) || [])) {
      const newDeg = inDeg.get(neighbor) - 1;
      inDeg.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  for (const n of nodes) {
    if (!result.includes(n.id)) result.push(n.id);
  }

  return result;
}

function bfsLayers(nodes, edges) {
  const { adj, inDeg } = buildGraphMaps(nodes, edges);
  const layers = [];
  const visited = new Set();

  let current = [];
  inDeg.forEach((deg, id) => { if (deg === 0) current.push(id); });
  if (current.length === 0 && nodes.length > 0) current = [nodes[0].id];

  while (current.length > 0) {
    layers.push(current);
    current.forEach(id => visited.add(id));
    const next = [];
    for (const id of current) {
      for (const neighbor of (adj.get(id) || [])) {
        if (!visited.has(neighbor) && !next.includes(neighbor)) {
          next.push(neighbor);
        }
      }
    }
    current = next;
  }

  const remaining = nodes.filter(n => !visited.has(n.id)).map(n => n.id);
  if (remaining.length > 0) layers.push(remaining);

  return layers;
}

function posNode(node, x, y) {
  return { ...node, position: { x, y } };
}

// ═══════════════════════════════════════════════════════════════════════════
// ELK LAYOUT ENGINE (Professional-grade: Sugiyama, Stress, Force, MrTree)
// ═══════════════════════════════════════════════════════════════════════════

// Direction mapping: our direction codes → ELK direction values
const ELK_DIRECTIONS = { TB: 'DOWN', BT: 'UP', LR: 'RIGHT', RL: 'LEFT' };

/**
 * ELK Layered (Sugiyama) — PCB-style routing.
 *
 * Design principles (from PCB trace routing):
 *  - Edges NEVER cross through nodes (edgeNode spacing enforced)
 *  - Parallel edges maintain consistent spacing (edgeEdge spacing)
 *  - Orthogonal routing with rounded bends
 *  - Generous layer spacing for readable edge channels
 *  - Network-simplex node placement for minimal edge length
 */
export async function applyElkLayeredLayout(nodes, edges, options = {}) {
  const {
    direction = 'TB',
    nodesep = 120,
    ranksep = 200,
    nodeWidth = 260,
    nodeHeight = 130
  } = options;

  return _runElkLayout(nodes, edges, {
    'elk.algorithm': 'layered',
    'elk.direction': ELK_DIRECTIONS[direction] || 'DOWN',
    // Node-to-node spacing within and between layers
    'elk.spacing.nodeNode': String(nodesep),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(ranksep),
    // Node placement strategy
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
    // PCB-style edge routing: orthogonal, edges NEVER cross nodes
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.spacing.edgeEdge': '40',           // parallel trace spacing
    'elk.spacing.edgeNode': '40',           // clearance: edge-to-node
    'elk.layered.spacing.edgeEdgeBetweenLayers': '35',
    'elk.layered.spacing.edgeNodeBetweenLayers': '40',
    // Edge ordering: keep edges in consistent order (like PCB bus traces)
    'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
  }, nodeWidth, nodeHeight);
}

/**
 * ELK Stress — stress majorization with edge-node clearance.
 */
export async function applyElkStressLayout(nodes, edges, options = {}) {
  const { nodeWidth = 260, nodeHeight = 130, nodesep = 120 } = options;

  return _runElkLayout(nodes, edges, {
    'elk.algorithm': 'stress',
    'elk.stress.desiredEdgeLength': '450',
    'elk.spacing.nodeNode': String(nodesep),
    'elk.spacing.edgeNode': '40',
    'elk.spacing.edgeEdge': '30',
  }, nodeWidth, nodeHeight);
}

/**
 * ELK Force — force-directed with node clearance.
 */
export async function applyElkForceLayout(nodes, edges, options = {}) {
  const { nodeWidth = 260, nodeHeight = 130, nodesep = 120 } = options;

  return _runElkLayout(nodes, edges, {
    'elk.algorithm': 'force',
    'elk.force.temperature': '0.001',
    'elk.force.iterations': '300',
    'elk.spacing.nodeNode': String(nodesep),
    'elk.spacing.edgeNode': '40',
    'elk.spacing.edgeEdge': '30',
  }, nodeWidth, nodeHeight);
}

/**
 * ELK MrTree — hierarchical tree with generous spacing.
 */
export async function applyElkMrTreeLayout(nodes, edges, options = {}) {
  const {
    direction = 'TB',
    nodesep = 120,
    ranksep = 200,
    nodeWidth = 260,
    nodeHeight = 130
  } = options;

  return _runElkLayout(nodes, edges, {
    'elk.algorithm': 'mrtree',
    'elk.direction': ELK_DIRECTIONS[direction] || 'DOWN',
    'elk.mrtree.weighting': 'CONSTRAINT',
    'elk.spacing.nodeNode': String(nodesep),
    'elk.mrtree.spacing.nodeNodeBetweenLayers': String(ranksep),
    'elk.spacing.edgeNode': '40',
    'elk.spacing.edgeEdge': '30',
  }, nodeWidth, nodeHeight);
}

/**
 * ELK Radial — concentric circles with edge clearance.
 */
export async function applyElkRadialLayout(nodes, edges, options = {}) {
  const { nodeWidth = 260, nodeHeight = 130, nodesep = 120 } = options;

  return _runElkLayout(nodes, edges, {
    'elk.algorithm': 'radial',
    'elk.spacing.nodeNode': String(nodesep),
    'elk.radial.compactor': 'WEDGE_COMPACTION',
    'elk.spacing.edgeNode': '40',
    'elk.spacing.edgeEdge': '30',
  }, nodeWidth, nodeHeight);
}

/**
 * Internal: run any ELK algorithm with cluster-aware grouping.
 * Returns { nodes: [...], edgeRoutes: Map<edgeId, [{x,y}]> }
 * edgeRoutes contains ELK-computed bend points for orthogonal/spline routing.
 *
 * When the graph has multiple clusters, nodes are grouped into ELK compound
 * nodes so that related nodes stay together in the layout.
 */
async function _runElkLayout(nodes, edges, layoutOptions, nodeWidth, nodeHeight) {
  if (nodes.length === 0) return { nodes: [], edgeRoutes: new Map() };

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const nodeIds = new Set(nodes.map(n => n.id));

  // Detect clusters for grouping
  const { clusters, clusterSizes, clusterOrder } = detectClusters(nodes, edges, { minClusterSize: 2 });
  const useGrouping = clusterOrder.length > 1;

  // Ensure minimum edge spacing (PCB-style: edges never cross nodes)
  const enhancedOptions = {
    ...layoutOptions,
    'elk.spacing.edgeEdge': layoutOptions['elk.spacing.edgeEdge'] || '40',
    'elk.spacing.edgeNode': layoutOptions['elk.spacing.edgeNode'] || '40',
    'elk.layered.spacing.edgeEdgeBetweenLayers': layoutOptions['elk.layered.spacing.edgeEdgeBetweenLayers'] || '35',
    'elk.layered.spacing.edgeNodeBetweenLayers': layoutOptions['elk.layered.spacing.edgeNodeBetweenLayers'] || '40',
  };

  // Build ELK node descriptor
  const makeElkNode = (n) => {
    const isSmall = n.data?.kind?.startsWith('tool.') || n.data?.kind === 'tool-ref';
    return {
      id: n.id,
      width: isSmall ? 190 : nodeWidth,
      height: isSmall ? 70 : nodeHeight,
    };
  };

  // Build edge list
  const elkEdges = edges
    .map((e, i) => {
      const src = e.source?.id || e.source;
      const tgt = e.target?.id || e.target;
      return { id: e.id || `e${i}`, sources: [src], targets: [tgt] };
    })
    .filter(e => nodeIds.has(e.sources[0]) && nodeIds.has(e.targets[0]));

  let elkGraph;

  if (useGrouping) {
    // Group nodes into compound nodes (one per cluster)
    const clusterChildren = new Map();
    for (const cId of clusterOrder) {
      clusterChildren.set(cId, []);
    }
    for (const n of nodes) {
      const cId = clusters.get(n.id);
      if (cId && clusterChildren.has(cId)) {
        clusterChildren.get(cId).push(makeElkNode(n));
      }
    }

    // Separate edges into intra-cluster and inter-cluster
    const intraEdges = new Map(); // clusterId → edges within that cluster
    const interEdges = []; // edges between clusters

    for (const cId of clusterOrder) {
      intraEdges.set(cId, []);
    }

    for (const e of elkEdges) {
      const srcCluster = clusters.get(e.sources[0]);
      const tgtCluster = clusters.get(e.targets[0]);
      if (srcCluster === tgtCluster && srcCluster) {
        intraEdges.get(srcCluster)?.push(e);
      } else {
        interEdges.push(e);
      }
    }

    // Build compound graph with cluster groups
    const groupNodes = clusterOrder.map(cId => ({
      id: cId,
      layoutOptions: {
        ...enhancedOptions,
        'elk.padding': '[top=40,left=40,bottom=40,right=40]',
      },
      children: clusterChildren.get(cId) || [],
      edges: intraEdges.get(cId) || [],
    })).filter(g => g.children.length > 0);

    elkGraph = {
      id: 'root',
      layoutOptions: {
        ...enhancedOptions,
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      },
      children: groupNodes,
      edges: interEdges,
    };
  } else {
    // No grouping — flat graph
    elkGraph = {
      id: 'root',
      layoutOptions: enhancedOptions,
      children: nodes.map(makeElkNode),
      edges: elkEdges,
    };
  }

  try {
    const result = await elk.layout(elkGraph);

    // Extract positioned nodes — handle both flat and hierarchical results
    const positionedNodes = nodes.map(n => {
      if (useGrouping) {
        // Look inside cluster groups
        for (const group of (result.children || [])) {
          const elkNode = (group.children || []).find(c => c.id === n.id);
          if (elkNode) {
            // Position is relative to group + group position
            const gx = group.x || 0;
            const gy = group.y || 0;
            return posNode(n, Math.round(gx + elkNode.x), Math.round(gy + elkNode.y));
          }
        }
        return posNode(n, 0, 0);
      } else {
        const elkNode = (result.children || []).find(c => c.id === n.id);
        if (elkNode) {
          return posNode(n, Math.round(elkNode.x), Math.round(elkNode.y));
        }
        return posNode(n, 0, 0);
      }
    });

    // Extract ELK-computed edge routes (bend points) — from all levels
    const edgeRoutes = new Map();
    const extractRoutes = (elkObj) => {
      for (const elkEdge of (elkObj.edges || [])) {
        const points = [];
        for (const section of (elkEdge.sections || [])) {
          if (section.startPoint) points.push(section.startPoint);
          if (section.bendPoints) points.push(...section.bendPoints);
          if (section.endPoint) points.push(section.endPoint);
        }
        if (points.length >= 2) {
          // For grouped graphs, offset edge points by group position
          if (useGrouping && elkObj.x != null) {
            const offsetPoints = points.map(p => ({
              x: p.x + (elkObj.x || 0),
              y: p.y + (elkObj.y || 0),
            }));
            edgeRoutes.set(elkEdge.id, offsetPoints);
          } else {
            edgeRoutes.set(elkEdge.id, points);
          }
        }
      }
      // Recurse into children (cluster groups)
      for (const child of (elkObj.children || [])) {
        extractRoutes(child);
      }
    };
    extractRoutes(result);

    return { nodes: positionedNodes, edgeRoutes };
  } catch (err) {
    console.warn('ELK layout failed, falling back to grid:', err.message);
    return { nodes: applyGridLayout(nodes, edges), edgeRoutes: new Map() };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FORCE-DIRECTED LAYOUT (built-in, no external dependency)
// ═══════════════════════════════════════════════════════════════════════════

export function applyForceLayout(nodes, edges, options = {}) {
  const {
    iterations = 80,
    repulsion = 400,
    attraction = 0.03,
    damping = 0.90,
    centerGravity = 0.008,
    nodeWidth = 260,
    nodeHeight = 130
  } = options;

  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [posNode(nodes[0], 0, 0)];

  const pos = new Map();
  const vel = new Map();
  const spread = Math.sqrt(nodes.length) * 150;

  nodes.forEach((n, i) => {
    const existing = n.position;
    pos.set(n.id, {
      x: existing?.x ?? (Math.cos(i * 2.399) * spread * 0.5 + Math.random() * 50),
      y: existing?.y ?? (Math.sin(i * 2.399) * spread * 0.5 + Math.random() * 50)
    });
    vel.set(n.id, { x: 0, y: 0 });
  });

  const edgePairs = edges.map(e => ({
    src: e.source?.id || e.source,
    tgt: e.target?.id || e.target
  })).filter(e => pos.has(e.src) && pos.has(e.tgt));

  for (let iter = 0; iter < iterations; iter++) {
    const t = 1 - iter / iterations;

    for (let i = 0; i < nodes.length; i++) {
      const id1 = nodes[i].id;
      const p1 = pos.get(id1);
      const v1 = vel.get(id1);

      for (let j = i + 1; j < nodes.length; j++) {
        const id2 = nodes[j].id;
        const p2 = pos.get(id2);
        const v2 = vel.get(id2);

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = Math.max(nodeWidth, nodeHeight) * 0.8;
        const effectiveDist = Math.max(dist, minDist * 0.5);

        const force = repulsion * t / (effectiveDist * effectiveDist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        v1.x += fx;  v1.y += fy;
        v2.x -= fx;  v2.y -= fy;
      }

      v1.x -= p1.x * centerGravity;
      v1.y -= p1.y * centerGravity;
    }

    for (const { src, tgt } of edgePairs) {
      const p1 = pos.get(src);
      const p2 = pos.get(tgt);
      const v1 = vel.get(src);
      const v2 = vel.get(tgt);

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const idealDist = 300;
      const force = (dist - idealDist) * attraction * t;

      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      v1.x += fx;  v1.y += fy;
      v2.x -= fx;  v2.y -= fy;
    }

    for (const n of nodes) {
      const p = pos.get(n.id);
      const v = vel.get(n.id);
      v.x *= damping;
      v.y *= damping;
      p.x += v.x;
      p.y += v.y;
    }
  }

  return nodes.map(n => {
    const p = pos.get(n.id);
    return posNode(n, Math.round(p.x), Math.round(p.y));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CIRCULAR LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

export function applyCircularLayout(nodes, edges, options = {}) {
  const { sortByTopology = true } = options;

  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [posNode(nodes[0], 0, 0)];

  let ordered = nodes;
  if (sortByTopology) {
    const sortedIds = topologicalSort(nodes, edges);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    ordered = sortedIds.map(id => nodeMap.get(id)).filter(Boolean);
  }

  const radius = Math.max(300, ordered.length * 55);
  const step = (2 * Math.PI) / ordered.length;

  return ordered.map((node, i) => {
    const angle = i * step - Math.PI / 2;
    return posNode(node,
      Math.round(radius * Math.cos(angle)),
      Math.round(radius * Math.sin(angle))
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RADIAL TREE LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

export function applyRadialLayout(nodes, edges, options = {}) {
  const { ringSpacing = 250 } = options;

  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [posNode(nodes[0], 0, 0)];

  const layers = bfsLayers(nodes, edges);
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const result = [];

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx];
    const radius = layerIdx * ringSpacing;

    if (radius === 0) {
      if (layer.length === 1) {
        const n = nodeMap.get(layer[0]);
        if (n) result.push(posNode(n, 0, 0));
      } else {
        const smallR = Math.min(60, layer.length * 20);
        const step = (2 * Math.PI) / layer.length;
        layer.forEach((id, i) => {
          const n = nodeMap.get(id);
          if (n) result.push(posNode(n,
            Math.round(smallR * Math.cos(i * step)),
            Math.round(smallR * Math.sin(i * step))
          ));
        });
      }
    } else {
      const step = (2 * Math.PI) / layer.length;
      layer.forEach((id, i) => {
        const n = nodeMap.get(id);
        if (n) result.push(posNode(n,
          Math.round(radius * Math.cos(i * step - Math.PI / 2)),
          Math.round(radius * Math.sin(i * step - Math.PI / 2))
        ));
      });
    }
  }

  for (const n of nodes) {
    if (!result.find(r => r.id === n.id)) {
      result.push(posNode(n, 0, 0));
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRID LAYOUT
// ═══════════════════════════════════════════════════════════════════════════

export function applyGridLayout(nodes, edges, options = {}) {
  const {
    columns = 0,
    cellWidth = 320,
    cellHeight = 180,
    sortByTopology = true
  } = options;

  if (nodes.length === 0) return [];

  let ordered = nodes;
  if (sortByTopology && edges.length > 0) {
    const sortedIds = topologicalSort(nodes, edges);
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    ordered = sortedIds.map(id => nodeMap.get(id)).filter(Boolean);
  }

  const cols = columns > 0 ? columns : Math.ceil(Math.sqrt(ordered.length));

  return ordered.map((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return posNode(node, col * cellWidth, row * cellHeight);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPACT TREE LAYOUT (Reingold-Tilford via d3-hierarchy)
// ═══════════════════════════════════════════════════════════════════════════

export function applyTreeLayout(nodes, edges, options = {}) {
  const {
    direction = 'TB',
    nodeWidth = 260,
    nodeHeight = 130,
    siblingGap = 60
  } = options;

  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [posNode(nodes[0], 0, 0)];

  const { adj, inDeg } = buildGraphMaps(nodes, edges);

  const roots = [];
  inDeg.forEach((deg, id) => { if (deg === 0) roots.push(id); });
  if (roots.length === 0) roots.push(nodes[0].id);

  const flatData = [];
  const visited = new Set();

  if (roots.length > 1) {
    flatData.push({ id: '__virtual_root__', parentId: null });
    for (const rootId of roots) {
      flatData.push({ id: rootId, parentId: '__virtual_root__' });
    }
  } else {
    flatData.push({ id: roots[0], parentId: null });
  }

  const queue = [...roots];
  roots.forEach(r => visited.add(r));

  while (queue.length > 0) {
    const id = queue.shift();
    for (const child of (adj.get(id) || [])) {
      if (!visited.has(child)) {
        visited.add(child);
        flatData.push({ id: child, parentId: id });
        queue.push(child);
      }
    }
  }

  for (const n of nodes) {
    if (!visited.has(n.id)) {
      const parentId = roots.length > 1 ? '__virtual_root__' : roots[0];
      flatData.push({ id: n.id, parentId });
    }
  }

  try {
    const root = stratify()
      .id(d => d.id)
      .parentId(d => d.parentId)(flatData);

    const isHorizontal = direction === 'LR' || direction === 'RL';
    const nodeW = isHorizontal ? nodeHeight + siblingGap : nodeWidth + siblingGap;
    const nodeH = isHorizontal ? nodeWidth + siblingGap : nodeHeight + siblingGap;

    const treeLayout = d3tree().nodeSize([nodeW, nodeH]);
    treeLayout(root);

    const positions = new Map();
    root.each(d => {
      if (d.data.id === '__virtual_root__') return;
      let x = d.x;
      let y = d.y;

      if (isHorizontal) [x, y] = [y, x];
      if (direction === 'BT') y = -y;
      if (direction === 'RL') x = -x;

      positions.set(d.data.id, { x: Math.round(x), y: Math.round(y) });
    });

    return nodes.map(n => {
      const p = positions.get(n.id);
      return p ? posNode(n, p.x, p.y) : posNode(n, 0, 0);
    });
  } catch (err) {
    console.warn('Tree layout failed, falling back to grid:', err.message);
    return applyGridLayout(nodes, edges, { cellWidth: nodeWidth + siblingGap, cellHeight: nodeHeight + siblingGap });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ELK EDGE ROUTE INJECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Inject ELK-computed edge routes into ReactFlow edges.
 * Sets `data.elkRoute` on edges that have matching routes from ELK layout.
 * @param {Array} edges - ReactFlow edges
 * @param {Map} edgeRoutes - Map<edgeId, [{x,y}]> from _runElkLayout
 * @returns {Array} edges with elkRoute data injected
 */
export function applyElkRoutes(edges, edgeRoutes) {
  if (!edgeRoutes || edgeRoutes.size === 0) return edges;
  return edges.map(e => {
    const route = edgeRoutes.get(e.id);
    return route
      ? { ...e, data: { ...e.data, elkRoute: route } }
      : e;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PARALLEL EDGE OFFSET COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute perpendicular offsets for parallel edges (same source-target pair).
 * Prevents edge overlap by spreading parallel edges apart.
 *
 * @param {Array} edges - ReactFlow edges
 * @param {number} spacing - Perpendicular spacing between parallel edges (default: 18)
 * @returns {Array} edges with `data.parallelOffset` set
 */
export function computeParallelOffsets(edges, spacing = 18) {
  // Group edges by normalized source-target pair
  const groups = new Map();
  for (const e of edges) {
    const src = e.source?.id || e.source;
    const tgt = e.target?.id || e.target;
    const key = [src, tgt].sort().join('||');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  return edges.map(e => {
    const src = e.source?.id || e.source;
    const tgt = e.target?.id || e.target;
    const key = [src, tgt].sort().join('||');
    const group = groups.get(key);
    if (!group || group.length <= 1) return e;

    const idx = group.indexOf(e);
    const total = group.length;
    const offset = (idx - (total - 1) / 2) * spacing;

    return {
      ...e,
      data: {
        ...e.data,
        parallelOffset: offset,
      },
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PCB-STYLE OBSTACLE-AWARE EDGE ROUTING (A* orthogonal pathfinder)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute obstacle-avoiding orthogonal routes for edges whose default path
 * would cross an unrelated node. Uses grid-based A* for proper PCB-style routing.
 *
 * @param {Array} nodes - ReactFlow nodes with .position
 * @param {Array} edges - ReactFlow edges
 * @param {object} options - { padding: 25, parallelSpacing: 20 }
 * @returns {Array} edges with `data.obstacleRoute` where needed
 */
export function computeObstacleRoutes(nodes, edges, options = {}) {
  const pad = options.padding ?? 25;
  const parallelSpacing = options.parallelSpacing ?? 20;

  if (nodes.length === 0 || edges.length === 0) return edges;

  // Build padded rectangles for all nodes
  const nodeRects = new Map();
  for (const n of nodes) {
    const w = n.measured?.width || n.width || (n.data?.nodeWidth) || 260;
    const h = n.measured?.height || n.height || (n.data?.nodeHeight) || 130;
    nodeRects.set(n.id, {
      id: n.id,
      x: (n.position?.x ?? 0),
      y: (n.position?.y ?? 0),
      w,
      h,
    });
  }

  // Collect routing grid coordinates from node boundaries (with clearance)
  const xCoords = new Set();
  const yCoords = new Set();
  for (const [, r] of nodeRects) {
    xCoords.add(r.x - pad);
    xCoords.add(r.x + r.w + pad);
    xCoords.add(r.x + r.w / 2); // center
    yCoords.add(r.y - pad);
    yCoords.add(r.y + r.h + pad);
    yCoords.add(r.y + r.h / 2); // center
  }

  // Track how many edges share the same corridor segment for parallel spacing
  const corridorUsage = new Map(); // "x1,y1→x2,y2" → count

  return edges.map(e => {
    const srcId = typeof e.source === 'object' ? e.source.id : e.source;
    const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
    const src = nodeRects.get(srcId);
    const tgt = nodeRects.get(tgtId);
    if (!src || !tgt) return e;

    // Skip USES_TOOL edges (side handles)
    if (e.label === 'USES_TOOL' || e.sourceHandle === 'tool-bind' || e.targetHandle === 'tool-bind') {
      return e;
    }

    // Source bottom-center, target top-center (TB direction)
    const sx = src.x + src.w / 2;
    const sy = src.y + src.h;
    const tx = tgt.x + tgt.w / 2;
    const ty = tgt.y;

    // Check if the default smoothstep path crosses any obstacle
    const midY = (sy + ty) / 2;
    const blocking = _findBlockingNodes(sx, sy, tx, ty, midY, srcId, tgtId, nodeRects, pad);

    if (blocking.length === 0) {
      // No obstacles — clear any old obstacleRoute
      if (e.data?.obstacleRoute) {
        const { obstacleRoute, ...cleanData } = e.data;
        return { ...e, data: cleanData };
      }
      return e;
    }

    // A* orthogonal pathfinding around obstacles
    const route = _astarOrthogonalRoute(sx, sy, tx, ty, srcId, tgtId, nodeRects, pad, xCoords, yCoords);

    if (!route) {
      // Fallback: simple detour
      const fallback = _simpleDetour(sx, sy, tx, ty, blocking, nodeRects, pad);
      return { ...e, data: { ...e.data, obstacleRoute: fallback } };
    }

    // Apply parallel offset if multiple edges share a corridor
    const offsetRoute = _applyCorridorOffset(route, corridorUsage, parallelSpacing);

    return { ...e, data: { ...e.data, obstacleRoute: offsetRoute } };
  });
}

/**
 * Find nodes that block the smoothstep Z-path between source and target.
 */
function _findBlockingNodes(sx, sy, tx, ty, midY, srcId, tgtId, nodeRects, pad) {
  const blocking = [];
  for (const [id, r] of nodeRects) {
    if (id === srcId || id === tgtId) continue;
    const pr = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
    if (_segHitsRect(sx, sy, sx, midY, pr) ||
        _segHitsRect(sx, midY, tx, midY, pr) ||
        _segHitsRect(tx, midY, tx, ty, pr)) {
      blocking.push(r);
    }
  }
  return blocking;
}

/**
 * Check if an axis-aligned or arbitrary line segment intersects a rectangle.
 */
function _segHitsRect(x1, y1, x2, y2, r) {
  const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  // AABB rejection
  if (maxX < r.x || minX > r.x + r.w || maxY < r.y || minY > r.y + r.h) return false;

  // Vertical segment
  if (Math.abs(x1 - x2) < 1) {
    return x1 >= r.x && x1 <= r.x + r.w && minY <= r.y + r.h && maxY >= r.y;
  }
  // Horizontal segment
  if (Math.abs(y1 - y2) < 1) {
    return y1 >= r.y && y1 <= r.y + r.h && minX <= r.x + r.w && maxX >= r.x;
  }

  // General: Liang-Barsky
  const dx = x2 - x1, dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  let tMin = 0, tMax = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-10) { if (q[i] < 0) return false; }
    else {
      const t = q[i] / p[i];
      if (p[i] < 0) tMin = Math.max(tMin, t);
      else tMax = Math.min(tMax, t);
      if (tMin > tMax) return false;
    }
  }
  return true;
}

/**
 * A* orthogonal pathfinder on a grid of waypoints derived from node boundaries.
 * Returns array of {x,y} waypoints or null if no path found.
 */
function _astarOrthogonalRoute(sx, sy, tx, ty, srcId, tgtId, nodeRects, pad, xCoords, yCoords) {
  // Build waypoint grid: all intersections of grid X and Y lines
  // Plus source/target endpoints and their vertical extensions
  const xs = [...xCoords, sx, tx].sort((a, b) => a - b);
  const ys = [...yCoords, sy, ty].sort((a, b) => a - b);

  // Remove duplicates (within 3px)
  const uniqueX = _dedup(xs, 3);
  const uniqueY = _dedup(ys, 3);

  // Build obstacle test: is point (x,y) inside any node rect (padded)?
  const isBlocked = (x, y) => {
    for (const [id, r] of nodeRects) {
      if (id === srcId || id === tgtId) continue;
      if (x >= r.x - pad && x <= r.x + r.w + pad &&
          y >= r.y - pad && y <= r.y + r.h + pad) {
        return true;
      }
    }
    return false;
  };

  // Is the entire horizontal/vertical segment from (x1,y1) to (x2,y2) clear?
  const isSegmentClear = (x1, y1, x2, y2) => {
    for (const [id, r] of nodeRects) {
      if (id === srcId || id === tgtId) continue;
      const pr = { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
      if (_segHitsRect(x1, y1, x2, y2, pr)) return false;
    }
    return true;
  };

  // Build graph of valid waypoints
  const key = (x, y) => `${Math.round(x)},${Math.round(y)}`;
  const startKey = key(sx, sy);
  const endKey = key(tx, ty);

  // Generate adjacency: for each waypoint, connect to nearest waypoints on same row/column
  // that have a clear path (no obstacles between them)
  const waypoints = [];
  for (const x of uniqueX) {
    for (const y of uniqueY) {
      if (!isBlocked(x, y)) {
        waypoints.push({ x, y, key: key(x, y) });
      }
    }
  }

  // Ensure start/end are in waypoints
  if (!waypoints.find(w => w.key === startKey)) {
    waypoints.push({ x: sx, y: sy, key: startKey });
  }
  if (!waypoints.find(w => w.key === endKey)) {
    waypoints.push({ x: tx, y: ty, key: endKey });
  }

  // Safety: too many waypoints → skip A* to avoid perf issues
  if (waypoints.length > 2000) return null;

  // Group by X and Y for efficient neighbor lookup
  const byX = new Map(); // x → sorted array of waypoints
  const byY = new Map(); // y → sorted array of waypoints
  for (const wp of waypoints) {
    const rx = Math.round(wp.x);
    const ry = Math.round(wp.y);
    if (!byX.has(rx)) byX.set(rx, []);
    byX.get(rx).push(wp);
    if (!byY.has(ry)) byY.set(ry, []);
    byY.get(ry).push(wp);
  }
  // Sort columns by Y, rows by X
  for (const [, col] of byX) col.sort((a, b) => a.y - b.y);
  for (const [, row] of byY) row.sort((a, b) => a.x - b.x);

  // Build adjacency: connect to immediate neighbors on same grid line if segment is clear
  const neighbors = new Map();
  for (const wp of waypoints) neighbors.set(wp.key, []);

  const connectNeighbors = (sorted, isVertical) => {
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      if (isSegmentClear(a.x, a.y, b.x, b.y)) {
        const dist = Math.abs(isVertical ? b.y - a.y : b.x - a.x);
        neighbors.get(a.key).push({ key: b.key, x: b.x, y: b.y, dist });
        neighbors.get(b.key).push({ key: a.key, x: a.x, y: a.y, dist });
      }
    }
  };

  for (const [, col] of byX) connectNeighbors(col, true);
  for (const [, row] of byY) connectNeighbors(row, false);

  // A* search
  const gScore = new Map();
  const fScore = new Map();
  const cameFrom = new Map();
  const heuristic = (wp) => Math.abs(wp.x - tx) + Math.abs(wp.y - ty);
  const TURN_PENALTY = 30; // penalize bends to prefer straight PCB traces

  gScore.set(startKey, 0);
  fScore.set(endKey, Infinity);
  fScore.set(startKey, heuristic({ x: sx, y: sy }));

  // Simple priority queue (array-based, fine for <2000 nodes)
  const openSet = [{ key: startKey, x: sx, y: sy }];
  const closed = new Set();

  while (openSet.length > 0) {
    // Find lowest fScore
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      if ((fScore.get(openSet[i].key) ?? Infinity) < (fScore.get(openSet[bestIdx].key) ?? Infinity)) {
        bestIdx = i;
      }
    }
    const current = openSet[bestIdx];
    openSet.splice(bestIdx, 1);

    if (current.key === endKey) {
      // Reconstruct path
      const path = [];
      let cur = endKey;
      while (cur) {
        const parts = cur.split(',');
        path.unshift({ x: parseInt(parts[0]), y: parseInt(parts[1]) });
        cur = cameFrom.get(cur);
      }
      return _simplifyOrthogonalPath(path);
    }

    if (closed.has(current.key)) continue;
    closed.add(current.key);

    const currentG = gScore.get(current.key) ?? Infinity;
    const prevKey = cameFrom.get(current.key);

    for (const nb of (neighbors.get(current.key) || [])) {
      if (closed.has(nb.key)) continue;

      // Calculate turn penalty
      let turnCost = 0;
      if (prevKey) {
        const prevParts = prevKey.split(',');
        const prevX = parseInt(prevParts[0]), prevY = parseInt(prevParts[1]);
        const inDx = current.x - prevX, inDy = current.y - prevY;
        const outDx = nb.x - current.x, outDy = nb.y - current.y;
        // Direction changed = turn
        if ((Math.abs(inDx) > 1 && Math.abs(outDy) > 1) || (Math.abs(inDy) > 1 && Math.abs(outDx) > 1)) {
          turnCost = TURN_PENALTY;
        }
      }

      const tentativeG = currentG + nb.dist + turnCost;
      if (tentativeG < (gScore.get(nb.key) ?? Infinity)) {
        cameFrom.set(nb.key, current.key);
        gScore.set(nb.key, tentativeG);
        fScore.set(nb.key, tentativeG + heuristic(nb));
        openSet.push(nb);
      }
    }
  }

  return null; // No path found
}

/** Remove near-duplicate values from sorted array */
function _dedup(sorted, tolerance) {
  if (sorted.length === 0) return [];
  const result = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - result[result.length - 1] > tolerance) {
      result.push(sorted[i]);
    }
  }
  return result;
}

/** Simplify orthogonal path by removing collinear intermediate points */
function _simplifyOrthogonalPath(path) {
  if (path.length <= 2) return path;
  const result = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const prev = result[result.length - 1];
    const next = path[i + 1];
    const cur = path[i];
    // Keep if direction changes (not collinear)
    const sameX = Math.abs(prev.x - cur.x) < 2 && Math.abs(cur.x - next.x) < 2;
    const sameY = Math.abs(prev.y - cur.y) < 2 && Math.abs(cur.y - next.y) < 2;
    if (!sameX && !sameY) {
      result.push(cur); // bend point
    } else if (!sameX || !sameY) {
      result.push(cur); // direction change
    }
    // else collinear — skip
  }
  result.push(path[path.length - 1]);
  return result;
}

/**
 * Apply parallel offset to routes sharing the same corridor.
 * Tracks corridor segments and offsets routes that overlap.
 */
function _applyCorridorOffset(route, corridorUsage, spacing) {
  if (route.length < 2) return route;

  return route.map((pt, i) => {
    if (i === 0 || i === route.length - 1) return pt; // don't offset endpoints

    const prev = route[i - 1];
    const isVertical = Math.abs(pt.x - prev.x) < 2;

    if (isVertical) {
      // Vertical segment — check corridor usage at this X
      const corridorKey = `V:${Math.round(pt.x)}`;
      const usage = corridorUsage.get(corridorKey) || 0;
      corridorUsage.set(corridorKey, usage + 1);
      if (usage > 0) {
        const offset = usage * spacing;
        return { x: pt.x + offset, y: pt.y };
      }
    } else {
      // Horizontal segment — check corridor usage at this Y
      const corridorKey = `H:${Math.round(pt.y)}`;
      const usage = corridorUsage.get(corridorKey) || 0;
      corridorUsage.set(corridorKey, usage + 1);
      if (usage > 0) {
        const offset = usage * spacing;
        return { x: pt.x, y: pt.y + offset };
      }
    }
    return pt;
  });
}

/**
 * Simple detour fallback when A* fails. Goes left or right of obstacles.
 */
function _simpleDetour(sx, sy, tx, ty, blocking, allRects, pad) {
  let obsLeft = Infinity, obsRight = -Infinity;
  for (const b of blocking) {
    obsLeft = Math.min(obsLeft, b.x - pad);
    obsRight = Math.max(obsRight, b.x + b.w + pad);
  }

  const routeLeftX = obsLeft - 15;
  const routeRightX = obsRight + 15;
  const midX = (sx + tx) / 2;

  // Check both sides for secondary obstacles
  const leftClear = !_corridorBlocked(routeLeftX, sy, ty, allRects, blocking, pad);
  const rightClear = !_corridorBlocked(routeRightX, sy, ty, allRects, blocking, pad);

  let finalX;
  if (leftClear && rightClear) {
    finalX = Math.abs(routeLeftX - midX) < Math.abs(routeRightX - midX) ? routeLeftX : routeRightX;
  } else if (leftClear) {
    finalX = routeLeftX;
  } else if (rightClear) {
    finalX = routeRightX;
  } else {
    // Expand outward
    for (let offset = 50; offset < 500; offset += 50) {
      if (!_corridorBlocked(routeLeftX - offset, sy, ty, allRects, blocking, pad)) {
        finalX = routeLeftX - offset; break;
      }
      if (!_corridorBlocked(routeRightX + offset, sy, ty, allRects, blocking, pad)) {
        finalX = routeRightX + offset; break;
      }
    }
    if (finalX === undefined) finalX = routeLeftX - 200;
  }

  const exitY = Math.round(sy + pad + 5);
  const entryY = Math.round(ty - pad - 5);

  return [
    { x: Math.round(sx), y: Math.round(sy) },
    { x: Math.round(sx), y: exitY },
    { x: Math.round(finalX), y: exitY },
    { x: Math.round(finalX), y: entryY },
    { x: Math.round(tx), y: entryY },
    { x: Math.round(tx), y: Math.round(ty) },
  ];
}

/** Check if a vertical corridor at X between y1 and y2 hits any node */
function _corridorBlocked(x, y1, y2, allRects, excludeRects, pad) {
  const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
  for (const [, r] of allRects) {
    if (excludeRects.some(b => b.id === r.id)) continue;
    if (x >= r.x - pad && x <= r.x + r.w + pad && r.y + r.h > minY && r.y < maxY) {
      return true;
    }
  }
  return false;
}

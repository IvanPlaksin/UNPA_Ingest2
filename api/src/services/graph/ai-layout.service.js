/**
 * AI Layout Service — LLM-powered graph node positioning.
 *
 * Uses Claude API to compute ONLY node positions (x, y).
 * Edge routing is handled separately by ELK or ReactFlow's
 * built-in smoothstep algorithm — NOT by the LLM.
 *
 * Key design decisions:
 *   1. AI computes node positions — it understands semantics, clustering, flow
 *   2. Edge routing is algorithmic — LLM can't reliably compute 71+ polyline routes
 *   3. Post-fix overlap resolution as safety net
 *   4. Adaptive strategy: hub-centric for ER/star graphs, layered for DAGs
 *
 * Settings persisted in Memgraph as :Settings {type: 'ai-layout-config'}
 */

const { getInstance: getLLMProvider } = require('../llm/LLMProviderService');

const AVAILABLE_MODELS = {
  'claude-sonnet': 'claude-sonnet-4-20250514',
  'claude-haiku': 'claude-haiku-4-5-20251001',
  'claude-opus-4.6': 'claude-opus-4-6',
};

// ─── Default system prompt ───────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are an expert graph layout engine. Given nodes (with sizes, degrees, and neighbor lists) and edges, compute (x, y) positions for every node.

You compute ONLY node positions. Edge routing is done algorithmically afterward.

## COORDINATE SYSTEM
- (0, 0) = top-left corner. x → right, y → down.
- (x, y) = TOP-LEFT corner of the node's bounding box.
- Node occupies rectangle (x, y) to (x + width, y + height).

## CRITICAL RULES (violations = layout failure)

1. NO OVERLAP: Node bounding boxes must NEVER overlap. Minimum gap = 2x node-width horizontal (520 px), 3x node-height vertical (390 px).
2. ADJACENCY PROXIMITY: Connected nodes MUST be placed near each other. A node's direct neighbors should be the closest nodes to it spatially. This is the MOST IMPORTANT aesthetic rule.
3. EDGE CLEARANCE (PCB ROUTING CORRIDORS): Edges route through the gaps between nodes as orthogonal traces. The minimum gap in rules 5-8 exists specifically for these routing corridors. NO node bounding box may lie on or near the path between two connected nodes. Ensure at least 520 px wide clear corridors between node columns and 390 px between node rows.
4. POSITIVE COORDINATES: All x, y >= 60.

## SPACING RULES (PCB-style clearance)

5. MINIMUM GAP between any two node bounding-box edges:
   - X-axis: at least TWO FULL NODE WIDTHS (520 px for standard 260px nodes).
   - Y-axis: at least THREE FULL NODE HEIGHTS (390 px for standard 130px nodes).
   This means: if node A occupies x=[100..360], the next node horizontally MUST start at x >= 880 (360 + 520).
   Similarly vertically: if node A occupies y=[100..230], next node MUST start at y >= 620 (230 + 390).
6. CONNECTED NODES: Place 2 node-widths apart horizontally, 3 node-heights apart vertically. The gap between them is used exclusively for edge routing corridors (PCB traces).
7. UNCONNECTED NODES in the same connected component: 2.5x node-width gap minimum.
8. DISCONNECTED SUBGRAPHS (components not connected to the main/largest graph): Place at 3x node-width (780 px) distance from the nearest node of the main graph. Group each disconnected subgraph compactly but keep the 3x gap from the main cluster.
9. USE A GRID MENTALITY: imagine the canvas divided into cells of ~780x520 px. Place at most ONE node per cell. Edge routing corridors flow through the empty space between cells.

## FLOW DIRECTION (CRITICAL)

10. Edges are DIRECTED: source → target. The "Direction" field in the request specifies flow:
   - TB (top-to-bottom): source nodes MUST have SMALLER y than their targets. A source is ABOVE its target.
   - LR (left-to-right): source nodes MUST have SMALLER x than their targets.
   This applies to ALL edges, not just DAG pipelines. Even in hub-spoke graphs, the source node of each edge should be placed higher (for TB) than the target node.

## TOPOLOGY-AWARE PLACEMENT

11. Each node description includes "neighbors: [list]". Use this to place connected nodes together.
12. HUB NODES (marked [HUB]): Place at the center of their neighborhood. Arrange their neighbors around them in a fan/radial pattern, not in a line.
13. MULTI-HUB: When multiple hubs exist, give each hub its own region of the canvas. Place shared neighbors between their hubs.
14. CLUSTERING: Nodes in the same cluster → same spatial region. Clusters should be visually separated by 200+ px gaps.
15. For DAG/PIPELINE graphs: use layered placement following flow direction.

## AESTHETIC RULES

16. MINIMIZE TOTAL EDGE LENGTH. Short edges = good layout.
17. MINIMIZE EDGE CROSSINGS. If node A→B and C→D, do not place them so the edges cross.
18. USE 2D SPACE: Spread nodes across both X and Y. Do NOT place all nodes in one row or column.
19. USE THE FULL CANVAS: Distribute nodes to fill the available space evenly.

## OUTPUT FORMAT
Return ONLY valid JSON (no markdown, no commentary):
{
  "nodePositions": {
    "<nodeId>": { "x": <number>, "y": <number> }
  }
}
Every node MUST appear. No extra keys.`;

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  selectedModel: 'claude-sonnet',
  temperature: 0.15,
  maxTokens: 16384,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

// ─── Settings CRUD (Memgraph) ────────────────────────────────────────────────

async function loadConfig() {
  try {
    const memgraphService = require('../memgraph.service');
    const { withSession } = require('../../core/aopeg/utils/cypher.utils');

    return await withSession(memgraphService.driver, async (session) => {
      const result = await session.run(
        `MATCH (s:Settings {id: 'ai-layout-config'}) WHERE s.type = 'ai-layout-config' RETURN s`
      );
      if (result.records.length === 0) return { ...DEFAULT_CONFIG, isDefault: true };
      const p = result.records[0].get('s').properties;
      return {
        selectedModel: p.selectedModel || DEFAULT_CONFIG.selectedModel,
        temperature: parseFloat(p.temperature) || DEFAULT_CONFIG.temperature,
        maxTokens: parseInt(p.maxTokens) || DEFAULT_CONFIG.maxTokens,
        systemPrompt: p.systemPrompt || DEFAULT_CONFIG.systemPrompt,
        updatedAt: p.updatedAt,
      };
    });
  } catch (err) {
    console.warn('[AILayout] Could not load config from Memgraph, using defaults:', err.message);
    return { ...DEFAULT_CONFIG, isDefault: true };
  }
}

async function saveConfig(config) {
  const memgraphService = require('../memgraph.service');
  const { withWriteTransaction } = require('../../core/aopeg/utils/cypher.utils');

  await withWriteTransaction(memgraphService.driver, async (tx) => {
    await tx.run(
      `MERGE (s:Settings {id: 'ai-layout-config'})
       SET s.type = 'ai-layout-config',
           s.selectedModel = $selectedModel,
           s.temperature = $temperature,
           s.maxTokens = $maxTokens,
           s.systemPrompt = $systemPrompt,
           s.updatedAt = $updatedAt
       RETURN s`,
      {
        selectedModel: config.selectedModel || DEFAULT_CONFIG.selectedModel,
        temperature: String(config.temperature ?? DEFAULT_CONFIG.temperature),
        maxTokens: String(config.maxTokens ?? DEFAULT_CONFIG.maxTokens),
        systemPrompt: config.systemPrompt || DEFAULT_CONFIG.systemPrompt,
        updatedAt: new Date().toISOString(),
      }
    );
  });
}

// ─── Compute degree for each node ────────────────────────────────────────────

function computeDegrees(nodes, edges) {
  const degree = new Map();
  for (const n of nodes) degree.set(n.id, 0);
  for (const e of edges) {
    if (degree.has(e.source)) degree.set(e.source, degree.get(e.source) + 1);
    if (degree.has(e.target)) degree.set(e.target, degree.get(e.target) + 1);
  }
  return degree;
}

// ─── Build user prompt ───────────────────────────────────────────────────────

function buildUserPrompt(request) {
  const { canvas, nodes, edges, hints } = request;
  const degrees = computeDegrees(nodes, edges);
  const avgDegree = nodes.length > 0
    ? [...degrees.values()].reduce((a, b) => a + b, 0) / nodes.length
    : 0;

  // Build directed adjacency: outgoing (targets) and incoming (sources)
  const outNeighbors = new Map(); // nodeId → Set of target nodeIds
  const inNeighbors = new Map();  // nodeId → Set of source nodeIds
  for (const n of nodes) { outNeighbors.set(n.id, new Set()); inNeighbors.set(n.id, new Set()); }
  for (const e of edges) {
    if (outNeighbors.has(e.source)) outNeighbors.get(e.source).add(e.target);
    if (inNeighbors.has(e.target)) inNeighbors.get(e.target).add(e.source);
  }
  // Undirected neighbors (union) for proximity
  const neighbors = new Map();
  for (const n of nodes) {
    neighbors.set(n.id, new Set([...(outNeighbors.get(n.id) || []), ...(inNeighbors.get(n.id) || [])]));
  }

  // Detect graph topology
  const hasIncoming = new Set(edges.map(e => e.target));
  const hasOutgoing = new Set(edges.map(e => e.source));
  const entryCount = nodes.filter(n => !hasIncoming.has(n.id)).length;
  const exitCount = nodes.filter(n => !hasOutgoing.has(n.id)).length;
  const hubCount = [...degrees.values()].filter(d => d >= avgDegree * 2).length;

  const isDAG = entryCount > 0 && exitCount > 0 && entryCount < nodes.length * 0.4;
  const isStarLike = hubCount >= 1 && hubCount <= nodes.length * 0.3;

  const lines = [
    `Place ${nodes.length} nodes on a ${canvas.width}x${canvas.height} canvas (padding: 60).`,
    `Direction: ${hints?.preferredDirection || 'TB'}`,
    `Avg degree: ${avgDegree.toFixed(1)}, Hubs: ${hubCount}`,
    `Topology: ${isDAG ? 'DAG/pipeline' : isStarLike ? 'multi-hub/ER-diagram' : 'general graph'}`,
    ``,
    `IMPORTANT: Each node lists →[targets] (edges going OUT) and ←[sources] (edges coming IN). For TB direction: source nodes go ABOVE targets (smaller y). Place each node NEAR its neighbors.`,
    ``,
    `Nodes (sorted by connectivity):`,
  ];

  // Sort by degree descending — hubs first
  const sortedNodes = [...nodes].sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));

  // Use short labels for neighbor lists to save tokens
  const shortId = (id) => {
    // "dbo.SomeTable" → "SomeTable"
    const parts = id.split('.');
    return parts[parts.length - 1];
  };

  for (const n of sortedNodes) {
    const deg = degrees.get(n.id) || 0;
    const isHub = deg >= avgDegree * 2;
    const outs = [...(outNeighbors.get(n.id) || [])].map(shortId);
    const ins = [...(inNeighbors.get(n.id) || [])].map(shortId);

    let desc = `- ${n.id} [${n.width}x${n.height}] deg:${deg}`;
    if (isHub) desc += ` [HUB]`;
    if (n.cluster) desc += ` cluster:${n.cluster}`;
    // Show directed relationships so LLM knows flow direction
    if (outs.length > 0) desc += ` →[${outs.join(', ')}]`;
    if (ins.length > 0) desc += ` ←[${ins.join(', ')}]`;
    lines.push(desc);
  }

  if (hints?.entryNodes?.length) {
    lines.push('', `Entry nodes: ${hints.entryNodes.join(', ')}`);
  }
  if (hints?.exitNodes?.length) {
    lines.push(`Exit nodes: ${hints.exitNodes.join(', ')}`);
  }

  return lines.join('\n');
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateResponse(result, request) {
  const errors = [];

  // Check all nodes present
  const nodeIds = new Set(request.nodes.map(n => n.id));
  for (const nid of nodeIds) {
    if (!result.nodePositions?.[nid]) {
      errors.push(`Missing position for node "${nid}"`);
    }
  }

  // Check positions are valid numbers
  for (const [nid, pos] of Object.entries(result.nodePositions || {})) {
    if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || isNaN(pos.x) || isNaN(pos.y)) {
      errors.push(`Invalid position for node "${nid}": (${pos.x}, ${pos.y})`);
    }
  }

  // Check overlap
  const sizeMap = new Map(request.nodes.map(n => [n.id, { w: n.width, h: n.height }]));
  const rects = [];
  for (const [nid, pos] of Object.entries(result.nodePositions || {})) {
    const sz = sizeMap.get(nid);
    if (sz && typeof pos.x === 'number' && typeof pos.y === 'number') {
      rects.push({ id: nid, x: pos.x, y: pos.y, w: sz.w, h: sz.h });
    }
  }
  const gap = 10;
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const overlapX = !(a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x);
      const overlapY = !(a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y);
      if (overlapX && overlapY) {
        errors.push(`Overlap: "${a.id}" and "${b.id}"`);
      }
    }
  }

  return errors;
}

// ─── Post-fix: push overlapping nodes apart ──────────────────────────────────

function postFixOverlaps(result, request, displayRules = {}) {
  const sizeMap = new Map(request.nodes.map(n => [n.id, { w: n.width, h: n.height }]));
  const positions = {};
  for (const [k, v] of Object.entries(result.nodePositions)) {
    positions[k] = { x: v.x, y: v.y };
  }
  const gapXMult = displayRules.minGapXMultiplier || 2;
  const gapYMult = displayRules.minGapYMultiplier || 3;
  const maxIter = 200;

  for (let iter = 0; iter < maxIter; iter++) {
    let maxOverlap = 0;
    const ids = Object.keys(positions);

    const dx = {}, dy = {};
    for (const id of ids) { dx[id] = 0; dy[id] = 0; }

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const aId = ids[i], bId = ids[j];
        const a = positions[aId], b = positions[bId];
        const sa = sizeMap.get(aId) || { w: 260, h: 130 };
        const sb = sizeMap.get(bId) || { w: 260, h: 130 };

        // Gap from display rules: N * nodeWidth (X), M * nodeHeight (Y)
        const gapX = Math.max(sa.w, sb.w) * gapXMult;
        const gapY = Math.max(sa.h, sb.h) * gapYMult;

        const aCx = a.x + sa.w / 2, aCy = a.y + sa.h / 2;
        const bCx = b.x + sb.w / 2, bCy = b.y + sb.h / 2;

        const overlapX = (sa.w / 2 + sb.w / 2 + gapX) - Math.abs(aCx - bCx);
        const overlapY = (sa.h / 2 + sb.h / 2 + gapY) - Math.abs(aCy - bCy);

        if (overlapX > 0 && overlapY > 0) {
          maxOverlap = Math.max(maxOverlap, Math.min(overlapX, overlapY));
          if (overlapX < overlapY) {
            const sign = aCx <= bCx ? 1 : -1;
            const push = Math.ceil(overlapX / 2) + 1;
            dx[aId] -= sign * push;
            dx[bId] += sign * push;
          } else {
            const sign = aCy <= bCy ? 1 : -1;
            const push = Math.ceil(overlapY / 2) + 1;
            dy[aId] -= sign * push;
            dy[bId] += sign * push;
          }
        }
      }
    }

    if (maxOverlap <= 0) break;

    for (const id of ids) {
      positions[id] = {
        x: Math.max(60, Math.round(positions[id].x + dx[id])),
        y: Math.max(60, Math.round(positions[id].y + dy[id])),
      };
    }
  }

  return { ...result, nodePositions: positions };
}

// ─── Post-fix: enforce flow direction (source above target for TB) ───────────

function postFixFlowDirection(result, request) {
  const direction = request.hints?.preferredDirection || 'TB';
  const edges = request.edges || [];
  const sizeMap = new Map(request.nodes.map(n => [n.id, { w: n.width, h: n.height }]));
  const positions = {};
  for (const [k, v] of Object.entries(result.nodePositions)) {
    positions[k] = { x: v.x, y: v.y };
  }

  const minGap = 100; // minimum distance between source center and target center along flow axis
  let fixCount = 0;

  // Multiple passes — fixing one edge can create new violations
  for (let pass = 0; pass < 10; pass++) {
    let fixed = 0;
    for (const e of edges) {
      const sp = positions[e.source];
      const tp = positions[e.target];
      if (!sp || !tp) continue;

      const sSize = sizeMap.get(e.source) || { w: 260, h: 130 };
      const tSize = sizeMap.get(e.target) || { w: 260, h: 130 };

      if (direction === 'TB' || direction === 'BT') {
        // TB: source center Y must be < target center Y
        const sCy = sp.y + sSize.h / 2;
        const tCy = tp.y + tSize.h / 2;
        const shouldSourceBeAbove = direction === 'TB';
        const violation = shouldSourceBeAbove ? (sCy >= tCy - minGap) : (tCy >= sCy - minGap);

        if (violation) {
          // Swap Y positions if source is below target (or adjust)
          if (shouldSourceBeAbove && sCy > tCy) {
            // Source is actually below — swap Y values
            const tmpY = sp.y;
            positions[e.source] = { x: sp.x, y: tp.y };
            positions[e.target] = { x: tp.x, y: tmpY };
            fixed++;
          } else if (shouldSourceBeAbove && sCy >= tCy - minGap) {
            // Too close — push target down
            positions[e.target] = { x: tp.x, y: Math.round(sp.y + sSize.h + minGap) };
            fixed++;
          }
        }
      } else if (direction === 'LR' || direction === 'RL') {
        const sCx = sp.x + sSize.w / 2;
        const tCx = tp.x + tSize.w / 2;
        const shouldSourceBeLeft = direction === 'LR';
        const violation = shouldSourceBeLeft ? (sCx >= tCx - minGap) : (tCx >= sCx - minGap);

        if (violation) {
          if (shouldSourceBeLeft && sCx > tCx) {
            const tmpX = sp.x;
            positions[e.source] = { x: tp.x, y: sp.y };
            positions[e.target] = { x: tmpX, y: tp.y };
            fixed++;
          } else if (shouldSourceBeLeft && sCx >= tCx - minGap) {
            positions[e.target] = { x: Math.round(sp.x + sSize.w + minGap), y: tp.y };
            fixed++;
          }
        }
      }
    }

    fixCount += fixed;
    if (fixed === 0) break;
  }

  if (fixCount > 0) {
    console.log(`[AILayout] Flow direction: fixed ${fixCount} edge violations (${direction})`);
  }

  return { ...result, nodePositions: positions };
}

// ─── Post-fix: separate disconnected subgraphs ────────────────────────────

function postFixDisconnectedSubgraphs(result, request, displayRules = {}) {
  const positions = {};
  for (const [k, v] of Object.entries(result.nodePositions)) {
    positions[k] = { x: v.x, y: v.y };
  }
  const sizeMap = new Map(request.nodes.map(n => [n.id, { w: n.width, h: n.height }]));
  const edges = request.edges || [];

  // Build adjacency for connected-component detection
  const adj = new Map();
  for (const n of request.nodes) adj.set(n.id, new Set());
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source).add(e.target);
      adj.get(e.target).add(e.source);
    }
  }

  // BFS to find connected components
  const visited = new Set();
  const components = [];
  for (const n of request.nodes) {
    if (visited.has(n.id)) continue;
    const comp = [];
    const queue = [n.id];
    visited.add(n.id);
    while (queue.length > 0) {
      const cur = queue.shift();
      comp.push(cur);
      for (const nb of (adj.get(cur) || [])) {
        if (!visited.has(nb)) { visited.add(nb); queue.push(nb); }
      }
    }
    components.push(comp);
  }

  if (components.length <= 1) return { ...result, nodePositions: positions };

  // Find the largest component (main graph)
  components.sort((a, b) => b.length - a.length);
  const mainComp = new Set(components[0]);

  // Compute bounding box of main graph
  let mainRight = -Infinity, mainBottom = -Infinity;
  for (const id of mainComp) {
    const p = positions[id];
    const s = sizeMap.get(id) || { w: 260, h: 130 };
    if (p) {
      mainRight = Math.max(mainRight, p.x + s.w);
      mainBottom = Math.max(mainBottom, p.y + s.h);
    }
  }

  // Place each disconnected subgraph Nx node-width to the right of main graph
  const disconnectMult = displayRules.disconnectedGapMultiplier || 3;
  const gapX = (displayRules.defaultNodeWidth || 260) * disconnectMult;
  let cursorX = mainRight + gapX;

  for (let c = 1; c < components.length; c++) {
    const comp = components[c];
    // Find current bounding box of this component
    let minX = Infinity, minY = Infinity;
    for (const id of comp) {
      const p = positions[id];
      if (p) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); }
    }

    // Shift component so its left edge starts at cursorX, top at 60
    const shiftX = cursorX - minX;
    const shiftY = 60 - minY;
    let compRight = 0;
    for (const id of comp) {
      if (positions[id]) {
        positions[id] = {
          x: Math.round(positions[id].x + shiftX),
          y: Math.round(positions[id].y + shiftY),
        };
        const s = sizeMap.get(id) || { w: 260, h: 130 };
        compRight = Math.max(compRight, positions[id].x + s.w);
      }
    }

    cursorX = compRight + gapX;
  }

  console.log(`[AILayout] Separated ${components.length - 1} disconnected subgraph(s) from main graph`);
  return { ...result, nodePositions: positions };
}

// ─── Display Rules KB (Memgraph) ────────────────────────────────────────────

const DEFAULT_DISPLAY_RULES = {
  // Spacing between nearest node boundaries
  minGapXMultiplier: 2,    // 2 * nodeWidth
  minGapYMultiplier: 3,    // 3 * nodeHeight
  // Disconnected subgraph gap from main graph
  disconnectedGapMultiplier: 3, // 3 * nodeWidth from main graph
  // Connected nodes gap (used for edge routing corridors)
  connectedGapXMultiplier: 2, // 2 * nodeWidth
  connectedGapYMultiplier: 3, // 3 * nodeHeight
  // Unconnected nodes in same component
  unconnectedGapMultiplier: 2.5, // 2.5 * nodeWidth
  // PCB routing
  edgeCorridorMinWidth: 260,
  edgeCorridorMinHeight: 130,
  parallelEdgeSpacing: 20,
  // Grid cell size (for LLM guidance)
  gridCellWidthMultiplier: 3,  // 3 * nodeWidth
  gridCellHeightMultiplier: 4, // 4 * nodeHeight
  // Default node dimensions
  defaultNodeWidth: 260,
  defaultNodeHeight: 130,
  // Hex grid settings
  hexEnabled: false,
  hexSize: 100,
  hexMinNodeGap: 1,
  hexChannelCapacity: 3,
  hexAllow45Degree: true,
  hexTrackSpacing: 12,
  hexLayerSpacing: 3,
  hexNodeSpacing: 2,
  hexGridStyle: 'minimal',
  // Applies to graph types (empty = all)
  applicableGraphTypes: [],
};

/**
 * Load display rules from Memgraph KB.
 * Falls back to DEFAULT_DISPLAY_RULES if not found.
 * @param {string} graphType - optional graph type for type-specific rules
 */
async function loadDisplayRules(graphType) {
  try {
    const memgraphService = require('../memgraph.service');
    const { withSession } = require('../../core/aopeg/utils/cypher.utils');

    return await withSession(memgraphService.driver, async (session) => {
      // Try type-specific rules first
      if (graphType) {
        const specific = await session.run(
          `MATCH (s:Settings {type: 'gxe-display-rules'})
           WHERE s.graphType = $graphType
           RETURN s ORDER BY s.updatedAt DESC LIMIT 1`,
          { graphType }
        );
        if (specific.records.length > 0) {
          return _parseDisplayRules(specific.records[0].get('s').properties);
        }
      }

      // Fall back to global rules
      const global = await session.run(
        `MATCH (s:Settings {type: 'gxe-display-rules'})
         WHERE s.graphType IS NULL OR s.graphType = 'global'
         RETURN s ORDER BY s.updatedAt DESC LIMIT 1`
      );
      if (global.records.length > 0) {
        return _parseDisplayRules(global.records[0].get('s').properties);
      }

      return { ...DEFAULT_DISPLAY_RULES, isDefault: true };
    });
  } catch (err) {
    console.warn('[AILayout] Could not load display rules from KB:', err.message);
    return { ...DEFAULT_DISPLAY_RULES, isDefault: true };
  }
}

function _parseDisplayRules(props) {
  return {
    minGapXMultiplier: parseFloat(props.minGapXMultiplier) || DEFAULT_DISPLAY_RULES.minGapXMultiplier,
    minGapYMultiplier: parseFloat(props.minGapYMultiplier) || DEFAULT_DISPLAY_RULES.minGapYMultiplier,
    disconnectedGapMultiplier: parseFloat(props.disconnectedGapMultiplier) || DEFAULT_DISPLAY_RULES.disconnectedGapMultiplier,
    connectedGapXMultiplier: parseFloat(props.connectedGapXMultiplier) || DEFAULT_DISPLAY_RULES.connectedGapXMultiplier,
    connectedGapYMultiplier: parseFloat(props.connectedGapYMultiplier) || DEFAULT_DISPLAY_RULES.connectedGapYMultiplier,
    unconnectedGapMultiplier: parseFloat(props.unconnectedGapMultiplier) || DEFAULT_DISPLAY_RULES.unconnectedGapMultiplier,
    edgeCorridorMinWidth: parseInt(props.edgeCorridorMinWidth) || DEFAULT_DISPLAY_RULES.edgeCorridorMinWidth,
    edgeCorridorMinHeight: parseInt(props.edgeCorridorMinHeight) || DEFAULT_DISPLAY_RULES.edgeCorridorMinHeight,
    parallelEdgeSpacing: parseInt(props.parallelEdgeSpacing) || DEFAULT_DISPLAY_RULES.parallelEdgeSpacing,
    gridCellWidthMultiplier: parseFloat(props.gridCellWidthMultiplier) || DEFAULT_DISPLAY_RULES.gridCellWidthMultiplier,
    gridCellHeightMultiplier: parseFloat(props.gridCellHeightMultiplier) || DEFAULT_DISPLAY_RULES.gridCellHeightMultiplier,
    defaultNodeWidth: parseInt(props.defaultNodeWidth) || DEFAULT_DISPLAY_RULES.defaultNodeWidth,
    defaultNodeHeight: parseInt(props.defaultNodeHeight) || DEFAULT_DISPLAY_RULES.defaultNodeHeight,
    // Hex grid settings
    hexEnabled: props.hexEnabled === 'true' || props.hexEnabled === true,
    hexSize: parseInt(props.hexSize) || DEFAULT_DISPLAY_RULES.hexSize,
    hexMinNodeGap: parseInt(props.hexMinNodeGap) || DEFAULT_DISPLAY_RULES.hexMinNodeGap,
    hexChannelCapacity: parseInt(props.hexChannelCapacity) || DEFAULT_DISPLAY_RULES.hexChannelCapacity,
    hexAllow45Degree: props.hexAllow45Degree !== 'false' && props.hexAllow45Degree !== false,
    hexTrackSpacing: parseInt(props.hexTrackSpacing) || DEFAULT_DISPLAY_RULES.hexTrackSpacing,
    hexLayerSpacing: parseInt(props.hexLayerSpacing) || DEFAULT_DISPLAY_RULES.hexLayerSpacing,
    hexNodeSpacing: parseInt(props.hexNodeSpacing) || DEFAULT_DISPLAY_RULES.hexNodeSpacing,
    hexGridStyle: props.hexGridStyle || DEFAULT_DISPLAY_RULES.hexGridStyle,
    applicableGraphTypes: props.applicableGraphTypes ? JSON.parse(props.applicableGraphTypes) : [],
    graphType: props.graphType || 'global',
    updatedAt: props.updatedAt,
  };
}

/**
 * Save display rules to Memgraph KB.
 * @param {object} rules - display rules object
 * @param {string} graphType - 'global' or specific type like 'business', 'atomic'
 */
async function saveDisplayRules(rules, graphType = 'global') {
  const memgraphService = require('../memgraph.service');
  const { withWriteTransaction } = require('../../core/aopeg/utils/cypher.utils');

  const ruleId = `gxe-display-rules-${graphType}`;

  await withWriteTransaction(memgraphService.driver, async (tx) => {
    await tx.run(
      `MERGE (s:Settings {id: $ruleId})
       SET s.type = 'gxe-display-rules',
           s.graphType = $graphType,
           s.minGapXMultiplier = $minGapXMultiplier,
           s.minGapYMultiplier = $minGapYMultiplier,
           s.disconnectedGapMultiplier = $disconnectedGapMultiplier,
           s.connectedGapXMultiplier = $connectedGapXMultiplier,
           s.connectedGapYMultiplier = $connectedGapYMultiplier,
           s.unconnectedGapMultiplier = $unconnectedGapMultiplier,
           s.edgeCorridorMinWidth = $edgeCorridorMinWidth,
           s.edgeCorridorMinHeight = $edgeCorridorMinHeight,
           s.parallelEdgeSpacing = $parallelEdgeSpacing,
           s.gridCellWidthMultiplier = $gridCellWidthMultiplier,
           s.gridCellHeightMultiplier = $gridCellHeightMultiplier,
           s.defaultNodeWidth = $defaultNodeWidth,
           s.defaultNodeHeight = $defaultNodeHeight,
           s.hexEnabled = $hexEnabled,
           s.hexSize = $hexSize,
           s.hexMinNodeGap = $hexMinNodeGap,
           s.hexChannelCapacity = $hexChannelCapacity,
           s.hexAllow45Degree = $hexAllow45Degree,
           s.hexTrackSpacing = $hexTrackSpacing,
           s.hexLayerSpacing = $hexLayerSpacing,
           s.hexNodeSpacing = $hexNodeSpacing,
           s.hexGridStyle = $hexGridStyle,
           s.applicableGraphTypes = $applicableGraphTypes,
           s.updatedAt = $updatedAt
       RETURN s`,
      {
        ruleId,
        graphType,
        minGapXMultiplier: String(rules.minGapXMultiplier ?? DEFAULT_DISPLAY_RULES.minGapXMultiplier),
        minGapYMultiplier: String(rules.minGapYMultiplier ?? DEFAULT_DISPLAY_RULES.minGapYMultiplier),
        disconnectedGapMultiplier: String(rules.disconnectedGapMultiplier ?? DEFAULT_DISPLAY_RULES.disconnectedGapMultiplier),
        connectedGapXMultiplier: String(rules.connectedGapXMultiplier ?? DEFAULT_DISPLAY_RULES.connectedGapXMultiplier),
        connectedGapYMultiplier: String(rules.connectedGapYMultiplier ?? DEFAULT_DISPLAY_RULES.connectedGapYMultiplier),
        unconnectedGapMultiplier: String(rules.unconnectedGapMultiplier ?? DEFAULT_DISPLAY_RULES.unconnectedGapMultiplier),
        edgeCorridorMinWidth: String(rules.edgeCorridorMinWidth ?? DEFAULT_DISPLAY_RULES.edgeCorridorMinWidth),
        edgeCorridorMinHeight: String(rules.edgeCorridorMinHeight ?? DEFAULT_DISPLAY_RULES.edgeCorridorMinHeight),
        parallelEdgeSpacing: String(rules.parallelEdgeSpacing ?? DEFAULT_DISPLAY_RULES.parallelEdgeSpacing),
        gridCellWidthMultiplier: String(rules.gridCellWidthMultiplier ?? DEFAULT_DISPLAY_RULES.gridCellWidthMultiplier),
        gridCellHeightMultiplier: String(rules.gridCellHeightMultiplier ?? DEFAULT_DISPLAY_RULES.gridCellHeightMultiplier),
        defaultNodeWidth: String(rules.defaultNodeWidth ?? DEFAULT_DISPLAY_RULES.defaultNodeWidth),
        defaultNodeHeight: String(rules.defaultNodeHeight ?? DEFAULT_DISPLAY_RULES.defaultNodeHeight),
        hexEnabled: String(rules.hexEnabled ?? DEFAULT_DISPLAY_RULES.hexEnabled),
        hexSize: String(rules.hexSize ?? DEFAULT_DISPLAY_RULES.hexSize),
        hexMinNodeGap: String(rules.hexMinNodeGap ?? DEFAULT_DISPLAY_RULES.hexMinNodeGap),
        hexChannelCapacity: String(rules.hexChannelCapacity ?? DEFAULT_DISPLAY_RULES.hexChannelCapacity),
        hexAllow45Degree: String(rules.hexAllow45Degree ?? DEFAULT_DISPLAY_RULES.hexAllow45Degree),
        hexTrackSpacing: String(rules.hexTrackSpacing ?? DEFAULT_DISPLAY_RULES.hexTrackSpacing),
        hexLayerSpacing: String(rules.hexLayerSpacing ?? DEFAULT_DISPLAY_RULES.hexLayerSpacing),
        hexNodeSpacing: String(rules.hexNodeSpacing ?? DEFAULT_DISPLAY_RULES.hexNodeSpacing),
        hexGridStyle: String(rules.hexGridStyle ?? DEFAULT_DISPLAY_RULES.hexGridStyle),
        applicableGraphTypes: JSON.stringify(rules.applicableGraphTypes || []),
        updatedAt: new Date().toISOString(),
      }
    );
  });

  console.log(`[AILayout] Saved display rules for graphType="${graphType}"`);
}

// ─── Main: compute layout via LLM ───────────────────────────────────────────

async function computeLayout(request, configOverrides = {}) {
  const config = { ...(await loadConfig()), ...configOverrides };
  // Load display rules from KB (type-specific if provided)
  const graphType = request.hints?.graphType || null;
  const displayRules = await loadDisplayRules(graphType);
  console.log(`[AILayout] Display rules: gapX=${displayRules.minGapXMultiplier}w, gapY=${displayRules.minGapYMultiplier}h, graphType=${displayRules.graphType || 'global'}`);
  const modelId = AVAILABLE_MODELS[config.selectedModel] || AVAILABLE_MODELS['claude-sonnet'];

  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const userPrompt = buildUserPrompt(request);

  console.log(`[AILayout] Computing layout for ${request.nodes.length} nodes, ${request.edges.length} edges via ${config.selectedModel}`);
  const startTime = Date.now();

  const llmResp = await getLLMProvider().chat(
    [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: '{"nodePositions":{' },
    ],
    {
      model: modelId,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      system: config.systemPrompt,
    }
  );

  // Prepend the assistant prefill that the API strips from the response
  const rawContent = '{"nodePositions":{' + (llmResp.content?.[0]?.text || '');
  const layoutTime = Date.now() - startTime;

  console.log(`[AILayout] Response received in ${layoutTime}ms, ${data.usage?.output_tokens || '?'} output tokens`);

  // Parse JSON from response — robust extraction handles commentary/markdown
  let parsed;
  try {
    // Strategy 1: try direct parse (ideal case — pure JSON)
    const stripped = rawContent.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    parsed = JSON.parse(stripped);
  } catch {
    // Strategy 2: extract the first { ... } block that looks like JSON
    try {
      const braceStart = rawContent.indexOf('{');
      if (braceStart === -1) throw new Error('No JSON object found in response');
      // Find the matching closing brace by counting depth
      let depth = 0;
      let braceEnd = -1;
      for (let i = braceStart; i < rawContent.length; i++) {
        if (rawContent[i] === '{') depth++;
        else if (rawContent[i] === '}') { depth--; if (depth === 0) { braceEnd = i; break; } }
      }
      if (braceEnd === -1) throw new Error('Unmatched braces in response');
      const jsonStr = rawContent.substring(braceStart, braceEnd + 1);
      parsed = JSON.parse(jsonStr);
      console.log(`[AILayout] Extracted JSON from commentary (offset ${braceStart}–${braceEnd})`);
    } catch (extractErr) {
      console.error('[AILayout] JSON extraction failed:', extractErr.message);
      console.error('[AILayout] Raw response (first 1000 chars):', rawContent.substring(0, 1000));
      throw new Error(`AI Layout returned invalid JSON: ${extractErr.message}`);
    }
  }

  // Normalize: handle both { nodePositions: ... } and direct { "nodeId": {x,y} }
  if (!parsed.nodePositions && typeof parsed === 'object') {
    const firstVal = Object.values(parsed)[0];
    if (firstVal && typeof firstVal === 'object' && 'x' in firstVal && 'y' in firstVal) {
      parsed = { nodePositions: parsed };
    }
  }

  // Validate
  const validationErrors = validateResponse(parsed, request);
  const hasOverlaps = validationErrors.some(e => e.startsWith('Overlap:'));
  const hasMissing = validationErrors.some(e => e.startsWith('Missing'));

  if (hasMissing) {
    console.warn(`[AILayout] Missing nodes in response:`, validationErrors.filter(e => e.startsWith('Missing')));
  }

  // Post-fix 1: resolve overlaps
  let finalResult = parsed;
  if (hasOverlaps) {
    const overlapCount = validationErrors.filter(e => e.startsWith('Overlap:')).length;
    console.warn(`[AILayout] ${overlapCount} overlaps detected, applying post-fix`);
    finalResult = postFixOverlaps(parsed, request, displayRules);
  }

  // Post-fix 2: enforce flow direction (source above target for TB)
  finalResult = postFixFlowDirection(finalResult, request);

  // Post-fix 3: re-check overlaps after direction fix (swaps can create new overlaps)
  finalResult = postFixOverlaps(finalResult, request, displayRules);

  // Post-fix 4: separate disconnected subgraphs (3x node-width gap)
  finalResult = postFixDisconnectedSubgraphs(finalResult, request, displayRules);

  return {
    success: true,
    nodePositions: finalResult.nodePositions || {},
    metadata: {
      model: config.selectedModel,
      modelId,
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      layoutTime,
      validationErrors: validationErrors.filter(e => !e.startsWith('Overlap:')),
      overlapsFixed: hasOverlaps,
    },
  };
}

// ─── Hex Layout Support ──────────────────────────────────────────────────────

const HEX_SYSTEM_PROMPT_TEMPLATE = (minNodeGap) => `You are an expert graph layout engine for HEXAGONAL GRID visualization.

## COORDINATE SYSTEM
You work with AXIAL HEX COORDINATES (q, r), NOT pixel coordinates.
- q: column axis (increases to the right)
- r: row axis (increases downward-right)
- The third coordinate s = -q - r (implicit)

## DISTANCE FORMULA
hex_distance(a, b) = max(|a.q - b.q|, |a.r - b.r|, |a.s - b.s|)

## PLACEMENT RULES
1. MINIMUM GAP: hex_distance between any two nodes must be >= ${minNodeGap + 1}
   This ensures at least ${minNodeGap} empty hex cell(s) between nodes for routing.

2. HIERARCHY: Respect the DAG structure. Entry nodes (no incoming edges) should have lower q values.
   Each hierarchy level should increment q by ${minNodeGap + 2} to leave routing channels.

3. CLUSTERING: Nodes with many connections between them should be placed closer (but still respecting min gap).

4. COMPACTNESS: Minimize the total area while respecting constraints.

5. BARYCENTER: Within the same hierarchy level, order nodes to minimize edge crossings.

## OUTPUT FORMAT
Return ONLY valid JSON:
{
  "nodePositions": {
    "<nodeId>": { "q": <integer>, "r": <integer> },
    ...
  }
}

CRITICAL:
- Return INTEGER coordinates only (q and r must be whole numbers)
- Do NOT return pixel coordinates
- Do NOT return edge routes (routing is computed algorithmically)
- Do NOT include any text outside the JSON`;

function buildHexUserPrompt(request) {
  const { nodes, edges, hints } = request;
  const direction = hints?.direction || 'LR';
  const degrees = computeDegrees(nodes, edges);

  const targetIds = new Set(edges.map(e => e.target));
  const entryNodes = nodes.filter(n => !targetIds.has(n.id)).map(n => n.id);

  const nodeList = nodes.map(n => {
    const d = degrees.get(n.id) || 0;
    return `- ${n.id}: "${n.data?.label || n.id}" (degree=${d})`;
  }).join('\n');

  const edgeList = edges.map(e => `- ${e.source} → ${e.target}`).join('\n');

  return `Calculate HEX GRID layout for this graph.

Direction: ${direction} (${direction === 'LR' ? 'left-to-right: entry nodes on low q' : 'top-to-bottom: entry nodes on low r'})

Nodes (${nodes.length}):
${nodeList}

Edges (${edges.length}):
${edgeList}

Entry nodes (place at start): ${entryNodes.join(', ') || 'none detected'}

Return hex coordinates (q, r) for each node.`;
}

function validateHexLayout(nodePositions, minNodeGap = 1) {
  const entries = Object.entries(nodePositions);
  const errors = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [id1, pos1] = entries[i];
      const [id2, pos2] = entries[j];

      const dq = Math.abs(pos1.q - pos2.q);
      const dr = Math.abs(pos1.r - pos2.r);
      const ds = Math.abs((-pos1.q - pos1.r) - (-pos2.q - pos2.r));
      const distance = Math.max(dq, dr, ds);

      if (distance <= minNodeGap) {
        errors.push(`HexOverlap: ${id1} and ${id2} too close (dist=${distance}, min=${minNodeGap + 1})`);
      }
    }
  }

  return errors;
}

async function computeHexLayout(request, configOverrides = {}) {
  const config = { ...(await loadConfig()), ...configOverrides };
  const hexOptions = request.hints?.hexOptions || {};
  const minNodeGap = hexOptions.minNodeGap || 1;
  const modelId = AVAILABLE_MODELS[config.selectedModel] || AVAILABLE_MODELS['claude-sonnet'];

  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const systemPrompt = HEX_SYSTEM_PROMPT_TEMPLATE(minNodeGap);
  const userPrompt = buildHexUserPrompt(request);

  console.log(`[AILayout-Hex] Computing hex layout for ${request.nodes.length} nodes via ${config.selectedModel}`);
  const startTime = Date.now();

  const llmResp = await getLLMProvider().chat(
    [
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: '{"nodePositions":{' },
    ],
    {
      model: modelId,
      maxTokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
    }
  );

  const rawContent = '{"nodePositions":{' + (llmResp.content?.[0]?.text || '');
  const layoutTime = Date.now() - startTime;

  console.log(`[AILayout-Hex] Response in ${layoutTime}ms, ${data.usage?.output_tokens || '?'} tokens`);

  // Parse JSON
  let parsed;
  try {
    const stripped = rawContent.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    parsed = JSON.parse(stripped);
  } catch {
    try {
      const braceStart = rawContent.indexOf('{');
      if (braceStart === -1) throw new Error('No JSON found');
      let depth = 0, braceEnd = -1;
      for (let i = braceStart; i < rawContent.length; i++) {
        if (rawContent[i] === '{') depth++;
        else if (rawContent[i] === '}') { depth--; if (depth === 0) { braceEnd = i; break; } }
      }
      if (braceEnd === -1) throw new Error('Unmatched braces');
      parsed = JSON.parse(rawContent.substring(braceStart, braceEnd + 1));
    } catch (e2) {
      throw new Error(`AI Hex Layout returned invalid JSON: ${e2.message}`);
    }
  }

  // Normalize
  if (!parsed.nodePositions && typeof parsed === 'object') {
    const firstVal = Object.values(parsed)[0];
    if (firstVal && typeof firstVal === 'object' && 'q' in firstVal) {
      parsed = { nodePositions: parsed };
    }
  }

  // Round and validate hex coordinates
  for (const [, pos] of Object.entries(parsed.nodePositions || {})) {
    if (typeof pos.q === 'number') pos.q = Math.round(pos.q);
    if (typeof pos.r === 'number') pos.r = Math.round(pos.r);
  }

  const validationErrors = validateHexLayout(parsed.nodePositions || {}, minNodeGap);
  if (validationErrors.length > 0) {
    console.warn(`[AILayout-Hex] ${validationErrors.length} hex overlaps detected`);
  }

  return {
    success: true,
    nodePositions: parsed.nodePositions || {},
    isHex: true,
    metadata: {
      model: config.selectedModel,
      modelId,
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
      layoutTime,
      validationErrors,
    },
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  computeLayout,
  computeHexLayout,
  loadConfig,
  saveConfig,
  loadDisplayRules,
  saveDisplayRules,
  DEFAULT_CONFIG,
  DEFAULT_DISPLAY_RULES,
  DEFAULT_SYSTEM_PROMPT,
  buildUserPrompt,
  buildHexUserPrompt,
  validateResponse,
  validateHexLayout,
};

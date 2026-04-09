/**
 * hex-road-map.ts — Precomputed Road Map Graph for hex PCB-style routing
 *
 * Creates a graph of all valid routing paths through hex cells:
 * - 4 concentric guide rail hexagons per cell (rail corners + face segments)
 * - 10 face ports per cell face (perpendicular stubs connecting to rail 0)
 * - Inter-cell connections through shared face ports
 *
 * Routes are found via A* on this precomputed graph.
 *
 * Vertex budget per cell:
 *   24 rail corners (4 rails × 6) + 60 face ports + 60 rail-0 landing pts = 144
 * Edge budget per cell:
 *   18 rail faces (rails 1-3) + 18 radial + 66 rail-0 chains + 60 stubs = 162
 */

import {
  HexCoord,
  PixelCoord,
  HexGridConfig,
  hexToPixel,
  hexKey,
  hex,
  guideRailCornerPixel,
  hexCornerPixel,
  FACE_CORNER_MAP,
} from './hex-coords';

// Re-export RouteSegment type for convenience
export type { PixelCoord };

// ── Configuration ─────────────────────────────────────────────────────

export interface RoadMapConfig {
  railCount: number;       // concentric guide rails (default 4, radii 80/60/40/20)
  railStep: number;        // px between rails (default 20)
  portsPerFace: number;    // ports on each cell face (default 10)
}

export const DEFAULT_ROAD_MAP_CONFIG: RoadMapConfig = {
  railCount: 4,
  railStep: 20,
  portsPerFace: 10,
};

// ── Graph Types ───────────────────────────────────────────────────────

export interface RoadMapGraph {
  vertices: Map<string, PixelCoord>;
  adj: Map<string, Map<string, number>>;  // vertexId → Map<neighborId, weight>
}

// ── Constants ─────────────────────────────────────────────────────────

/** Opposite face: face f ↔ face (f+3)%6 */
const OPPOSITE_FACE = [3, 4, 5, 0, 1, 2];

/** Hex neighbor direction offsets (matches HEX_DIRECTIONS order) */
const HEX_DIR_OFFSETS = [
  { dq: 1, dr: 0 },   // face 0: right
  { dq: 1, dr: -1 },  // face 1: top-right
  { dq: 0, dr: -1 },  // face 2: top-left
  { dq: -1, dr: 0 },  // face 3: left
  { dq: -1, dr: 1 },  // face 4: bottom-left
  { dq: 0, dr: 1 },   // face 5: bottom-right
];

// ── Vertex ID Constructors ────────────────────────────────────────────

/** Rail corner vertex: cell ck, rail r, corner c */
function rcId(ck: string, r: number, c: number): string {
  return `${ck}:r${r}c${c}`;
}

/** Face port on boundary: cell ck, face f, port p */
function fpId(ck: string, f: number, p: number): string {
  return `${ck}:f${f}p${p}`;
}

/** Rail-0 landing point: cell ck, face f, port p */
function lpId(ck: string, f: number, p: number): string {
  return `${ck}:L${f}p${p}`;
}

// ── Geometry Helpers ──────────────────────────────────────────────────

function dist(a: PixelCoord, b: PixelCoord): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/** Position of a corner on a concentric hex at given radius */
function cornerAtRadius(
  cell: HexCoord, corner: number, config: HexGridConfig, radius: number,
): PixelCoord {
  const center = hexToPixel(cell, config);
  const angleRad = (Math.PI / 180) * 60 * corner;
  return {
    x: center.x + radius * Math.cos(angleRad),
    y: center.y + radius * Math.sin(angleRad),
  };
}

/**
 * Position of port `p` out of `N` along face `f` at given radius.
 * Ports are evenly spaced with margin = spacing.
 * t = (p+1) / (N+1), interpolated between the face's two corners.
 */
function facePortAtRadius(
  cell: HexCoord, face: number, port: number,
  config: HexGridConfig, portsPerFace: number, radius: number,
): PixelCoord {
  const [ci0, ci1] = FACE_CORNER_MAP[face];
  const c0 = cornerAtRadius(cell, ci0, config, radius);
  const c1 = cornerAtRadius(cell, ci1, config, radius);
  const t = (port + 1) / (portsPerFace + 1);
  return {
    x: c0.x + (c1.x - c0.x) * t,
    y: c0.y + (c1.y - c0.y) * t,
  };
}

// ── Graph Operations ──────────────────────────────────────────────────

function addVertex(g: RoadMapGraph, id: string, pos: PixelCoord): void {
  g.vertices.set(id, pos);
  if (!g.adj.has(id)) g.adj.set(id, new Map());
}

function addEdgeBi(g: RoadMapGraph, a: string, b: string, w?: number): void {
  const va = g.vertices.get(a);
  const vb = g.vertices.get(b);
  if (!va || !vb) return;
  const weight = w ?? dist(va, vb);
  g.adj.get(a)!.set(b, weight);
  g.adj.get(b)!.set(a, weight);
}

// ── Build One Cell ────────────────────────────────────────────────────

function buildCell(
  g: RoadMapGraph,
  cell: HexCoord,
  config: HexGridConfig,
  rm: RoadMapConfig,
): void {
  const ck = hexKey(cell);
  const { railCount, railStep, portsPerFace } = rm;

  // ── 1. Rail corner vertices (4 rails × 6 corners = 24) ──
  for (let r = 0; r < railCount; r++) {
    const radius = config.hexSize - (r + 1) * railStep;
    for (let c = 0; c < 6; c++) {
      addVertex(g, rcId(ck, r, c), cornerAtRadius(cell, c, config, radius));
    }
  }

  // ── 2. Rail face edges for rails 1..3 (direct corner-to-corner) ──
  //    Rail 0 faces go through landing points (step 5), so skip rail 0 here.
  for (let r = 1; r < railCount; r++) {
    for (let c = 0; c < 6; c++) {
      addEdgeBi(g, rcId(ck, r, c), rcId(ck, r, (c + 1) % 6));
    }
  }

  // ── 3. Radial inter-rail edges (same corner, adjacent rails) ──
  for (let r = 0; r < railCount - 1; r++) {
    for (let c = 0; c < 6; c++) {
      addEdgeBi(g, rcId(ck, r, c), rcId(ck, r + 1, c));
    }
  }

  // ── 4. Face ports on boundary + landing points on rail 0 ──
  const boundaryRadius = config.hexSize;
  const rail0Radius = config.hexSize - railStep;

  for (let f = 0; f < 6; f++) {
    const [ci0, ci1] = FACE_CORNER_MAP[f];

    for (let p = 0; p < portsPerFace; p++) {
      // Boundary face port
      const fid = fpId(ck, f, p);
      addVertex(g, fid, facePortAtRadius(cell, f, p, config, portsPerFace, boundaryRadius));

      // Rail-0 landing point
      const lid = lpId(ck, f, p);
      addVertex(g, lid, facePortAtRadius(cell, f, p, config, portsPerFace, rail0Radius));

      // Port stub: face port ↔ landing point (perpendicular to face)
      addEdgeBi(g, fid, lid);
    }

    // ── 5. Rail-0 face chain: r0_ci0 ↔ lp0 ↔ lp1 ↔ ... ↔ lp9 ↔ r0_ci1 ──
    //    This replaces direct corner-to-corner on rail 0 for this face.
    addEdgeBi(g, rcId(ck, 0, ci0), lpId(ck, f, 0));
    for (let p = 0; p < portsPerFace - 1; p++) {
      addEdgeBi(g, lpId(ck, f, p), lpId(ck, f, p + 1));
    }
    addEdgeBi(g, lpId(ck, f, portsPerFace - 1), rcId(ck, 0, ci1));
  }
}

/** R1: Add vertical rail-switching edges at each rail corner.
 *  At every corner, all rails are connected radially so routes can
 *  switch from outer to inner rails (or vice versa) at any corner.
 *  (The radial inter-rail edges in step 3 already do this for corners.)
 *
 *  This function adds ADDITIONAL mid-face rail switching by connecting
 *  landing points at the same parametric position across all rails.
 *  We use synthetic mid-face vertices on rails 1+ for this.
 */
function buildMidFaceRailSwitches(
  g: RoadMapGraph,
  cell: HexCoord,
  config: HexGridConfig,
  rm: RoadMapConfig,
): void {
  const ck = hexKey(cell);
  const { railCount, railStep, portsPerFace } = rm;
  const RAIL_SWITCH_COST = 5; // slight penalty for switching rails mid-face

  // For each face, for each port position, connect landing points across all rails
  for (let f = 0; f < 6; f++) {
    for (let p = 0; p < portsPerFace; p++) {
      // Rail 0 landing point already exists as lpId(ck, f, p)
      // For rails 1+, create synthetic mid-face points and connect them vertically
      const rail1PlusIds: string[] = [lpId(ck, f, p)]; // start with rail 0 lp

      for (let r = 1; r < railCount; r++) {
        const radius = config.hexSize - (r + 1) * railStep;
        const id = `${ck}:mr${r}f${f}p${p}`;
        if (!g.vertices.has(id)) {
          addVertex(g, id, facePortAtRadius(cell, f, p, config, portsPerFace, radius));
        }
        rail1PlusIds.push(id);
      }

      // Connect vertically: lp(r0) ↔ midFace(r1) ↔ midFace(r2) ↔ midFace(r3)
      for (let i = 0; i < rail1PlusIds.length - 1; i++) {
        addEdgeBi(g, rail1PlusIds[i], rail1PlusIds[i + 1], RAIL_SWITCH_COST);
      }

      // Connect each mid-face point to the two bracketing corners on its rail
      for (let r = 1; r < railCount; r++) {
        const [ci0, ci1] = FACE_CORNER_MAP[f];
        const midId = `${ck}:mr${r}f${f}p${p}`;
        addEdgeBi(g, midId, rcId(ck, r, ci0));
        addEdgeBi(g, midId, rcId(ck, r, ci1));
      }
    }
  }
}

// ── Inner Core Mesh (innermost rail = free-routing zone) ──────────────
//
// The innermost guide rail hexagon is a fully connected mesh:
// every point on every face connects DIRECTLY to every point on
// every other face — no center vertex, no fixed waypoints.
//
// Rule: within the innermost hex, a route may travel from any point on
// any face to any point on any face in a straight line through the interior.
//
// Implementation: complete graph on all innermost-rail vertices
// (6 corners + 10 mid-face points × 6 faces = 66 vertices per cell,
//  66×65/2 = 2145 direct edges — all weighted by Euclidean distance).

function buildInnerCoreMesh(
  g: RoadMapGraph,
  cell: HexCoord,
  rm: RoadMapConfig,
): void {
  const ck = hexKey(cell);
  const { railCount, portsPerFace } = rm;
  const innerRail = railCount - 1;

  // Collect all vertices on the innermost rail perimeter
  const inner: string[] = [];

  // 6 corners of the innermost rail
  for (let c = 0; c < 6; c++) {
    inner.push(rcId(ck, innerRail, c));
  }

  // Mid-face points on the innermost rail (created by buildMidFaceRailSwitches)
  for (let f = 0; f < 6; f++) {
    for (let p = 0; p < portsPerFace; p++) {
      const id = `${ck}:mr${innerRail}f${f}p${p}`;
      if (g.vertices.has(id)) inner.push(id);
    }
  }

  // Complete graph: direct edge between every pair (route through the interior)
  for (let i = 0; i < inner.length; i++) {
    for (let j = i + 1; j < inner.length; j++) {
      addEdgeBi(g, inner[i], inner[j]);
    }
  }
}

// ── Build Inter-Cell Connections ──────────────────────────────────────

function buildInterCell(
  g: RoadMapGraph,
  cellA: HexCoord,
  cellB: HexCoord,
  faceA: number,
  rm: RoadMapConfig,
): void {
  const ckA = hexKey(cellA);
  const ckB = hexKey(cellB);
  const faceB = OPPOSITE_FACE[faceA];
  const N = rm.portsPerFace;

  // Connect matching face ports (mirrored numbering: port i ↔ port N-1-i)
  for (let p = 0; p < N; p++) {
    addEdgeBi(g, fpId(ckA, faceA, p), fpId(ckB, faceB, N - 1 - p), 0.1);
  }
}

// ── Also connect face ports to adjacent OCCUPIED cells (node cells) ──
//    Node cells don't have internal road map, but their face ports are
//    needed as route start/end points for PortHub connections.

function buildNodeFacePorts(
  g: RoadMapGraph,
  nodeCell: HexCoord,
  config: HexGridConfig,
  rm: RoadMapConfig,
): void {
  const ck = hexKey(nodeCell);
  const { portsPerFace } = rm;
  const boundaryRadius = config.hexSize;

  // Only add boundary face port vertices (no internal rails for node cells)
  for (let f = 0; f < 6; f++) {
    for (let p = 0; p < portsPerFace; p++) {
      const fid = fpId(ck, f, p);
      if (!g.vertices.has(fid)) {
        addVertex(g, fid, facePortAtRadius(nodeCell, f, p, config, portsPerFace, boundaryRadius));
      }
    }
  }
}

// ── Full Road Map Builder ─────────────────────────────────────────────

/**
 * Build the complete road map graph for all routing cells.
 * Also adds face ports for node cells (occupied) that border routing cells,
 * so PortHub connections can terminate at road map vertices.
 */
export function buildRoadMap(
  routingCells: HexCoord[],
  occupiedCellKeys: Set<string>,
  config: HexGridConfig,
  rm: RoadMapConfig = DEFAULT_ROAD_MAP_CONFIG,
): RoadMapGraph {
  const g: RoadMapGraph = { vertices: new Map(), adj: new Map() };
  const routingSet = new Set(routingCells.map(hexKey));

  // 1. Build internal road map for each routing cell
  for (const cell of routingCells) {
    buildCell(g, cell, config, rm);
    buildMidFaceRailSwitches(g, cell, config, rm);
    buildInnerCoreMesh(g, cell, rm);  // innermost rail = free-routing complete mesh
  }

  // 2. Inter-cell connections between adjacent routing cells
  for (const cell of routingCells) {
    const ck = hexKey(cell);
    for (let f = 0; f < 6; f++) {
      const d = HEX_DIR_OFFSETS[f];
      const neighbor = hex(cell.q + d.dq, cell.r + d.dr);
      const nk = hexKey(neighbor);
      // Only process each pair once (lexicographic ordering)
      if (routingSet.has(nk) && ck < nk) {
        buildInterCell(g, cell, neighbor, f, rm);
      }
    }
  }

  // 3. Add node cell face ports and connect to adjacent routing cells
  for (const cell of routingCells) {
    for (let f = 0; f < 6; f++) {
      const d = HEX_DIR_OFFSETS[f];
      const neighbor = hex(cell.q + d.dq, cell.r + d.dr);
      const nk = hexKey(neighbor);
      if (occupiedCellKeys.has(nk)) {
        // Add face ports for the occupied cell
        buildNodeFacePorts(g, neighbor, config, rm);
        // Connect occupied cell's face ports to this routing cell's face ports
        const faceFromOccupied = OPPOSITE_FACE[f]; // face of occupied cell toward routing cell
        const ckOcc = nk;
        const ckRoute = hexKey(cell);
        const N = rm.portsPerFace;
        for (let p = 0; p < N; p++) {
          const occPortId = fpId(ckOcc, faceFromOccupied, p);
          const routePortId = fpId(ckRoute, f, N - 1 - p);
          if (g.vertices.has(occPortId) && g.vertices.has(routePortId)) {
            addEdgeBi(g, occPortId, routePortId, 0.1);
          }
        }
      }
    }
  }

  return g;
}

// ── A* Router on Road Map ─────────────────────────────────────────────

/**
 * A* pathfinding on the road map graph.
 * Returns ordered list of vertex IDs, or null if no path found.
 *
 * `penalizedEdges` contains edge keys ("a→b") that are already used by
 * previous routes. These get extra weight to spread parallel routes.
 */
export function roadMapAStar(
  graph: RoadMapGraph,
  startId: string,
  goalId: string,
  penalizedEdges?: Set<string>,
  penalty: number = 50,
): string[] | null {
  if (!graph.vertices.has(startId) || !graph.vertices.has(goalId)) {
    console.warn('[ROAD-MAP-A*] missing vertex', { startId, goalId,
      hasStart: graph.vertices.has(startId), hasGoal: graph.vertices.has(goalId) });
    return null;
  }

  const goal = graph.vertices.get(goalId)!;
  const heuristic = (id: string): number => {
    const v = graph.vertices.get(id)!;
    return Math.sqrt((v.x - goal.x) ** 2 + (v.y - goal.y) ** 2);
  };

  const gScore = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const openSet = new Set<string>();
  const closedSet = new Set<string>();

  gScore.set(startId, 0);
  parent.set(startId, null);
  openSet.add(startId);

  let iterations = 0;
  const MAX_ITER = 20000;

  while (openSet.size > 0 && iterations++ < MAX_ITER) {
    // Find vertex with lowest f = g + h
    let current = '';
    let bestF = Infinity;
    for (const id of openSet) {
      const f = (gScore.get(id) ?? Infinity) + heuristic(id);
      if (f < bestF) { bestF = f; current = id; }
    }

    if (current === goalId) {
      // Reconstruct path
      const path: string[] = [];
      let c: string | null = current;
      while (c !== null) {
        path.unshift(c);
        c = parent.get(c) ?? null;
      }
      return path;
    }

    openSet.delete(current);
    closedSet.add(current);

    const neighbors = graph.adj.get(current);
    if (!neighbors) continue;

    for (const [neighborId, weight] of neighbors) {
      if (closedSet.has(neighborId)) continue;

      let edgeWeight = weight;
      if (penalizedEdges) {
        if (penalizedEdges.has(`${current}→${neighborId}`)) edgeWeight += penalty;
      }

      const tentativeG = (gScore.get(current) ?? Infinity) + edgeWeight;
      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        gScore.set(neighborId, tentativeG);
        parent.set(neighborId, current);
        openSet.add(neighborId);
      }
    }
  }

  if (iterations >= MAX_ITER) {
    console.warn('[ROAD-MAP-A*] max iterations reached', { startId, goalId });
  }
  return null;
}

// ── Mark used edges ───────────────────────────────────────────────────

export function markPathEdges(path: string[], usedEdges: Set<string>): void {
  for (let i = 0; i < path.length - 1; i++) {
    usedEdges.add(`${path[i]}→${path[i + 1]}`);
    usedEdges.add(`${path[i + 1]}→${path[i]}`);
  }
}

// ── Convert vertex path to pixel segments ─────────────────────────────

export type RouteAngle = 0 | 60 | 120 | 180 | 240 | 300;

export interface RoadMapSegment {
  from: PixelCoord;
  to: PixelCoord;
  angle: RouteAngle;
}

function snapAngle(from: PixelCoord, to: PixelCoord): RouteAngle {
  const deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 360) % 360;
  return (Math.round(deg / 60) * 60 % 360) as RouteAngle;
}

/**
 * Convert a road map vertex path to renderable pixel segments.
 * Skips zero-length segments (inter-cell port connections).
 */
export function pathToSegments(
  graph: RoadMapGraph,
  path: string[],
): RoadMapSegment[] {
  const segments: RoadMapSegment[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const from = graph.vertices.get(path[i])!;
    const to = graph.vertices.get(path[i + 1])!;
    // Skip near-zero segments (shared face ports between cells)
    if (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5) continue;
    segments.push({ from, to, angle: snapAngle(from, to) });
  }
  return segments;
}

// ── Face Port Assignment ──────────────────────────────────────────────

/**
 * Get the face index from cell toward neighbor.
 */
function getNeighborFace(cell: HexCoord, neighbor: HexCoord): number {
  const dq = neighbor.q - cell.q;
  const dr = neighbor.r - cell.r;
  for (let i = 0; i < HEX_DIR_OFFSETS.length; i++) {
    if (HEX_DIR_OFFSETS[i].dq === dq && HEX_DIR_OFFSETS[i].dr === dr) return i;
  }
  return 0;
}

export interface EdgeRouteRequest {
  edgeId: string;
  sourceHex: HexCoord;
  targetHex: HexCoord;
  hexPath: HexCoord[];   // routing cells between source and target
}

export interface EdgeRouteResult {
  edgeId: string;
  segments: RoadMapSegment[];
  startVertexId: string;
  endVertexId: string;
  vertexPath: string[];
  isValid: boolean;
}

/**
 * Route all edges on the road map.
 *
 * 1. Assigns face ports at each cell boundary (spreading parallel edges)
 * 2. Runs A* on the road map for each edge
 * 3. Penalizes used edges so parallel routes take different paths
 */
export function routeAllEdgesOnRoadMap(
  graph: RoadMapGraph,
  edges: EdgeRouteRequest[],
  rm: RoadMapConfig = DEFAULT_ROAD_MAP_CONFIG,
): Map<string, EdgeRouteResult> {
  const results = new Map<string, EdgeRouteResult>();
  const usedEdges = new Set<string>();
  const N = rm.portsPerFace;

  // Collect all boundary crossings to assign ports
  // boundaryKey → edgeIds crossing that boundary
  const boundaryCrossings = new Map<string, string[]>();

  for (const edge of edges) {
    const { hexPath, sourceHex, targetHex } = edge;
    if (hexPath.length === 0) continue;

    // Source → first cell boundary
    const firstCell = hexPath[0];
    const entryFace = getNeighborFace(firstCell, sourceHex);
    const bk0 = `${hexKey(sourceHex)}|${hexKey(firstCell)}|${entryFace}`;
    if (!boundaryCrossings.has(bk0)) boundaryCrossings.set(bk0, []);
    boundaryCrossings.get(bk0)!.push(edge.edgeId);

    // Inter-cell boundaries
    for (let i = 0; i < hexPath.length - 1; i++) {
      const exitFace = getNeighborFace(hexPath[i], hexPath[i + 1]);
      const bk = `${hexKey(hexPath[i])}|${hexKey(hexPath[i + 1])}|${exitFace}`;
      if (!boundaryCrossings.has(bk)) boundaryCrossings.set(bk, []);
      boundaryCrossings.get(bk)!.push(edge.edgeId);
    }

    // Last cell → target boundary
    const lastCell = hexPath[hexPath.length - 1];
    const exitFace = getNeighborFace(lastCell, targetHex);
    const bkN = `${hexKey(lastCell)}|${hexKey(targetHex)}|${exitFace}`;
    if (!boundaryCrossings.has(bkN)) boundaryCrossings.set(bkN, []);
    boundaryCrossings.get(bkN)!.push(edge.edgeId);
  }

  // Assign port indices per boundary: spread from center outward
  // edgeId → boundaryKey → portIndex
  const portAssignments = new Map<string, Map<string, number>>();

  for (const [bk, edgeIds] of boundaryCrossings) {
    const center = Math.floor(N / 2);
    for (let i = 0; i < edgeIds.length; i++) {
      // Spread: center, center-1, center+1, center-2, center+2, ...
      const offset = Math.floor((i + 1) / 2) * (i % 2 === 0 ? -1 : 1);
      const port = Math.max(0, Math.min(N - 1, center + offset));

      const eid = edgeIds[i];
      if (!portAssignments.has(eid)) portAssignments.set(eid, new Map());
      portAssignments.get(eid)!.set(bk, port);
    }
  }

  // Route each edge on the road map
  for (const edge of edges) {
    const { edgeId, hexPath, sourceHex, targetHex } = edge;
    if (hexPath.length === 0) {
      results.set(edgeId, {
        edgeId, segments: [], startVertexId: '', endVertexId: '',
        vertexPath: [], isValid: false,
      });
      continue;
    }

    const assignments = portAssignments.get(edgeId) || new Map();

    // Determine start vertex (face port on source node's face toward first routing cell)
    const firstCell = hexPath[0];
    const entryFace = getNeighborFace(firstCell, sourceHex);
    const sourceFaceFromNode = OPPOSITE_FACE[entryFace];
    const bk0 = `${hexKey(sourceHex)}|${hexKey(firstCell)}|${entryFace}`;
    const startPort = assignments.get(bk0) ?? Math.floor(N / 2);
    const startVertexId = fpId(hexKey(sourceHex), sourceFaceFromNode, startPort);

    // Determine end vertex (face port on target node's face toward last routing cell)
    const lastCell = hexPath[hexPath.length - 1];
    const exitFace = getNeighborFace(lastCell, targetHex);
    const targetFaceFromNode = OPPOSITE_FACE[exitFace];
    const bkN = `${hexKey(lastCell)}|${hexKey(targetHex)}|${exitFace}`;
    const endPort = assignments.get(bkN) ?? Math.floor(N / 2);
    const endVertexId = fpId(hexKey(targetHex), targetFaceFromNode, N - 1 - endPort);

    // Run A* on road map
    const vertexPath = roadMapAStar(graph, startVertexId, endVertexId, usedEdges);

    if (vertexPath) {
      markPathEdges(vertexPath, usedEdges);
      const segments = pathToSegments(graph, vertexPath);
      results.set(edgeId, {
        edgeId, segments, startVertexId, endVertexId, vertexPath, isValid: true,
      });
    } else {
      console.warn('[ROAD-MAP] no path found for edge', edgeId, { startVertexId, endVertexId });
      results.set(edgeId, {
        edgeId, segments: [], startVertexId, endVertexId,
        vertexPath: [], isValid: false,
      });
    }
  }

  return results;
}

// ── Diagnostic: road map stats ────────────────────────────────────────

export function roadMapStats(graph: RoadMapGraph): {
  vertices: number;
  edges: number;
  avgDegree: number;
} {
  let totalEdges = 0;
  for (const [, neighbors] of graph.adj) {
    totalEdges += neighbors.size;
  }
  const vertices = graph.vertices.size;
  return {
    vertices,
    edges: totalEdges / 2, // bidirectional
    avgDegree: vertices > 0 ? totalEdges / vertices : 0,
  };
}

// ── Debug Visualization Data ──────────────────────────────────────────

export type DebugVertexType = 'rail-corner' | 'landing-pt' | 'face-port' | 'mid-face' | 'inner-mesh' | 'other';

export interface DebugRoadMapVertex {
  x: number;
  y: number;
  type: DebugVertexType;
}

export interface DebugRoadMap {
  vertices: DebugRoadMapVertex[];
  edges: Array<{ from: PixelCoord; to: PixelCoord }>;
}

/**
 * Extract debug visualization data from a road map graph.
 * Used by HexGridBackground to render the road map overlay.
 */
export function extractDebugRoadMap(graph: RoadMapGraph): DebugRoadMap {
  const vertices: DebugRoadMapVertex[] = [];
  const edgesSet = new Set<string>();
  const edges: Array<{ from: PixelCoord; to: PixelCoord }> = [];

  for (const [id, pos] of graph.vertices) {
    let type: DebugVertexType = 'other';
    if (id.includes(':r') && id.includes('c') && !id.includes(':L') && !id.includes(':mr')) {
      type = 'rail-corner';
    } else if (id.includes(':L')) {
      type = 'landing-pt';
    } else if (id.includes(':f') && id.includes('p')) {
      type = 'face-port';
    } else if (id.includes(':mr')) {
      // Distinguish innermost-rail mid-face (part of complete mesh) from outer ones
      type = 'mid-face';
    }
    vertices.push({ x: pos.x, y: pos.y, type });
  }

  for (const [fromId, neighbors] of graph.adj) {
    const from = graph.vertices.get(fromId);
    if (!from) continue;
    for (const [toId] of neighbors) {
      // Deduplicate edges
      const key = fromId < toId ? `${fromId}|${toId}` : `${toId}|${fromId}`;
      if (edgesSet.has(key)) continue;
      edgesSet.add(key);
      const to = graph.vertices.get(toId);
      if (!to) continue;
      // Skip near-zero length edges (inter-cell port connections)
      if (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5) continue;
      edges.push({ from, to });
    }
  }

  return { vertices, edges };
}

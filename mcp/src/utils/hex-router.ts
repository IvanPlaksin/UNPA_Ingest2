/**
 * hex-router.ts — PCB-style A* routing on hex grid (Step 4.1 v2)
 *
 * Finds obstacle-free paths through hex cells using only the 6 cardinal
 * hex directions (no 45° diagonals). Routes "hug" node contours by
 * preferring cells adjacent to occupied nodes when the path runs
 * parallel to the node's face.
 */

import {
  HexCoord,
  HexGridConfig,
  hex,
  hexToPixel,
  hexDistance,
  hexKey,
  hexNeighbors,
  hexInsetCornerPixel,
  guideRailCornerPixel,
  guideRailCount,
  facePortPixel,
} from './hex-coords';
import { HexGrid } from './hex-grid';
import {
  buildRoadMap,
  routeAllEdgesOnRoadMap,
  roadMapStats,
} from './hex-road-map';
import type {
  EdgeRouteRequest,
  RoadMapGraph,
} from './hex-road-map';

export type { RoadMapGraph };

// ── Types ────────────────────────────────────────────────────────────────

export type RouteAngle = 0 | 60 | 120 | 180 | 240 | 300;

export type HexFace =
  | 'right' | 'top-right' | 'top-left'
  | 'left' | 'bottom-left' | 'bottom-right';

export interface RouteSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
  angle: RouteAngle;
}

export interface HexRoute {
  edgeId: string;
  segments: RouteSegment[];
  hexPath: HexCoord[];
  totalLength: number;
  turnCount: number;
  isValid: boolean;
}

export interface HexRouterOptions {
  grid: HexGrid;
  config: HexGridConfig;
  turnPenalty: number;
  occupancyPenalty: number;
  contourBonus: number;      // negative cost for hugging node contour
  maxIterations: number;
  trackInset: number;        // px inset from hex border toward center (default 20)
  railStep: number;          // px between concentric guide rails (default 20)
}

export const DEFAULT_ROUTER_OPTIONS: Partial<HexRouterOptions> = {
  turnPenalty: 30,
  occupancyPenalty: 50,
  contourBonus: 8,
  maxIterations: 1000,
  trackInset: 20,
  railStep: 20,
};

// ── Internal A* node ─────────────────────────────────────────────────────

interface AStarNode {
  hex: HexCoord;
  g: number;
  h: number;
  f: number;
  parent: AStarNode | null;
  direction: RouteAngle;
}

// ── 6 Cardinal hex directions (no diagonals) ─────────────────────────────

const HEX_DIRS: Array<{ dq: number; dr: number; angle: RouteAngle }> = [
  { dq:  1, dr:  0, angle: 0   },  // right
  { dq:  1, dr: -1, angle: 300 },  // top-right
  { dq:  0, dr: -1, angle: 240 },  // top-left
  { dq: -1, dr:  0, angle: 180 },  // left
  { dq: -1, dr:  1, angle: 120 },  // bottom-left
  { dq:  0, dr:  1, angle: 60  },  // bottom-right
];

// ── Face utilities ───────────────────────────────────────────────────────

const FACE_OFFSETS: Record<HexFace, { dq: number; dr: number }> = {
  'right':        { dq:  1, dr:  0 },
  'top-right':    { dq:  1, dr: -1 },
  'top-left':     { dq:  0, dr: -1 },
  'left':         { dq: -1, dr:  0 },
  'bottom-left':  { dq: -1, dr:  1 },
  'bottom-right': { dq:  0, dr:  1 },
};

const FACE_DIRECTIONS: Record<HexFace, RouteAngle> = {
  'right': 0, 'top-right': 300, 'top-left': 240,
  'left': 180, 'bottom-left': 120, 'bottom-right': 60,
};

const OPPOSITE_FACE: Record<HexFace, HexFace> = {
  'right': 'left', 'top-right': 'bottom-left', 'top-left': 'bottom-right',
  'left': 'right', 'bottom-left': 'top-right', 'bottom-right': 'top-left',
};

function getAdjacentHex(from: HexCoord, face: HexFace): HexCoord {
  const o = FACE_OFFSETS[face];
  return hex(from.q + o.dq, from.r + o.dr);
}

const SQRT3 = Math.sqrt(3);

function getFacePixel(h: HexCoord, face: HexFace, config: HexGridConfig): { x: number; y: number } {
  const c = hexToPixel(h, config);
  const s = config.hexSize;
  const offsets: Record<HexFace, { x: number; y: number }> = {
    'right':        { x:  s * 0.75,  y: 0 },
    'top-right':    { x:  s * 0.375, y: -s * SQRT3 / 4 },
    'top-left':     { x: -s * 0.375, y: -s * SQRT3 / 4 },
    'left':         { x: -s * 0.75,  y: 0 },
    'bottom-left':  { x: -s * 0.375, y:  s * SQRT3 / 4 },
    'bottom-right': { x:  s * 0.375, y:  s * SQRT3 / 4 },
  };
  const o = offsets[face];
  return { x: c.x + o.x, y: c.y + o.y };
}

function snapAngle(from: { x: number; y: number }, to: { x: number; y: number }): RouteAngle {
  const deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 360) % 360;
  return (Math.round(deg / 60) * 60 % 360) as RouteAngle;
}

// ── Contour detection: is a cell adjacent to an occupied node? ──────────

function isAdjacentToOccupied(coord: HexCoord, grid: HexGrid): boolean {
  for (const nb of hexNeighbors(coord)) {
    const cell = grid.getCell(nb);
    if (cell.state === 'occupied') return true;
  }
  return false;
}

/**
 * Check if moving in `direction` at `coord` is parallel to an adjacent node's face.
 * Returns true if the path runs alongside a node (contour-hugging).
 */
function isContourParallel(coord: HexCoord, direction: RouteAngle, grid: HexGrid): boolean {
  // For each neighbor that's occupied, check if our direction is parallel to the face we share
  for (let i = 0; i < HEX_DIRS.length; i++) {
    const d = HEX_DIRS[i];
    const nb = hex(coord.q + d.dq, coord.r + d.dr);
    const cell = grid.getCell(nb);
    if (cell.state !== 'occupied') continue;

    // The face connecting us to this occupied cell has angle d.angle
    // Parallel directions are ±60° from the face normal
    // i.e. the two faces adjacent to the connecting face
    const faceAngle = d.angle;
    const diff = Math.abs(((direction - faceAngle) + 360) % 360);
    // Parallel means 60° or 300° difference (adjacent faces)
    if (diff === 60 || diff === 300) return true;
  }
  return false;
}

// ── A* Pathfinding ───────────────────────────────────────────────────────

export function computeHexRoute(
  sourceHex: HexCoord,
  targetHex: HexCoord,
  sourceFace: HexFace,
  targetFace: HexFace,
  edgeId: string,
  options: HexRouterOptions,
): HexRoute | null {
  const { grid, config, turnPenalty, occupancyPenalty, contourBonus, maxIterations, trackInset = 20, railStep = 20 } = options;

  const startHex = getAdjacentHex(sourceHex, sourceFace);
  // Goal cell = the cell just OUTSIDE the target's entry face
  const goalHex = getAdjacentHex(targetHex, targetFace);
  const goalKey = hexKey(goalHex);

  // If start or goal is not routable, try direct fallback
  if (!grid.isRoutable(startHex) || !grid.isRoutable(goalHex)) {
    return null;
  }

  const initialDir = FACE_DIRECTIONS[sourceFace];

  const openMap = new Map<string, AStarNode>();
  const closedSet = new Set<string>();

  const h0 = hexDistance(startHex, goalHex) * 10;
  const startNode: AStarNode = {
    hex: startHex, g: 0, h: h0, f: h0,
    parent: null, direction: initialDir,
  };
  openMap.set(hexKey(startHex), startNode);

  let iterations = 0;
  let goalNode: AStarNode | null = null;

  while (openMap.size > 0 && iterations < maxIterations) {
    iterations++;

    // Find lowest f in open set
    let best: AStarNode | null = null;
    let bestKey = '';
    for (const [k, n] of openMap) {
      if (!best || n.f < best.f || (n.f === best.f && n.h < best.h)) {
        best = n;
        bestKey = k;
      }
    }
    if (!best) break;

    if (bestKey === goalKey) {
      goalNode = best;
      break;
    }

    openMap.delete(bestKey);
    closedSet.add(bestKey);

    // Expand 6 cardinal neighbors (no diagonals)
    for (const nd of HEX_DIRS) {
      const nb = hex(best.hex.q + nd.dq, best.hex.r + nd.dr);
      const nbKey = hexKey(nb);
      if (closedSet.has(nbKey)) continue;
      if (!grid.isRoutable(nb) && nbKey !== goalKey) continue;

      const isTurn = nd.angle !== best.direction;
      const occ = grid.getOccupancy(nb);

      let cost = 10;
      if (isTurn) cost += turnPenalty;
      cost += occ * occupancyPenalty;

      // Contour bonus: reduce cost when path hugs a node's perimeter
      if (isContourParallel(nb, nd.angle, grid)) {
        cost -= contourBonus;
      }

      const g = best.g + cost;
      const h = hexDistance(nb, goalHex) * 10;
      const f = g + h;

      const existing = openMap.get(nbKey);
      if (existing && existing.g <= g) continue;

      openMap.set(nbKey, {
        hex: nb, g, h, f,
        parent: best, direction: nd.angle,
      });
    }
  }

  if (!goalNode) return null;

  // Reconstruct hex path
  const hexPath: HexCoord[] = [];
  let cur: AStarNode | null = goalNode;
  while (cur) {
    hexPath.unshift(cur.hex);
    cur = cur.parent;
  }

  // Convert to pixel segments via guide rail routing
  const segments = buildGuideRailSegments(sourceHex, targetHex, hexPath, sourceFace, targetFace, config, railStep);

  // Diagnostic: verify channel routing
  console.log('[HEX-ROUTE]', {
    edgeId,
    hexPathLen: hexPath.length,
    segmentCount: segments.length,
    segmentAngles: segments.map(s => s.angle),
    firstSeg: segments[0] ? { from: segments[0].from, to: segments[0].to } : null,
    lastSeg: segments.length > 0 ? { from: segments[segments.length - 1].from, to: segments[segments.length - 1].to } : null,
  });

  const totalLength = segments.reduce((sum, seg) => {
    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);

  const turnCount = segments.filter(
    (seg, i) => i > 0 && seg.angle !== segments[i - 1].angle,
  ).length;

  return { edgeId, segments, hexPath, totalLength, turnCount, isValid: true };
}

// ── Batch routing (short edges first) ────────────────────────────────────

export function computeAllRoutes(
  edges: Array<{
    id: string;
    sourceHex: HexCoord;
    targetHex: HexCoord;
    sourceFace: HexFace;
    targetFace: HexFace;
  }>,
  options: HexRouterOptions,
): Map<string, HexRoute> {
  const routes = new Map<string, HexRoute>();

  const sorted = [...edges].sort(
    (a, b) => hexDistance(a.sourceHex, a.targetHex) - hexDistance(b.sourceHex, b.targetHex),
  );

  for (const edge of sorted) {
    const route = computeHexRoute(
      edge.sourceHex, edge.targetHex,
      edge.sourceFace, edge.targetFace,
      edge.id, options,
    );

    if (route) {
      routes.set(edge.id, route);
      // Register in grid for capacity tracking
      for (const hc of route.hexPath) {
        options.grid.addRoute(hc, edge.id);
      }
    } else {
      routes.set(edge.id, createFallback(edge, options.config));
    }
  }

  return routes;
}

// ── Perimeter Routing: corner-based waypoints along hex faces ─────────
//
// Instead of routing through cell centers or face midpoints, we walk
// along the PERIMETER of each routing cell (corner-to-corner). Every
// segment is parallel to a hex face — true PCB-style routing.
//
// Flat-top hex corners (clockwise from right):
//   corner 0: 0°, corner 1: 60°, corner 2: 120°,
//   corner 3: 180°, corner 4: 240°, corner 5: 300°
//
// Face index (matching HEX_DIRS order) → pair of corners:
//   face 0 toward (1,0):  corners [0, 1]
//   face 1 toward (1,-1): corners [5, 0]
//   face 2 toward (0,-1): corners [4, 5]
//   face 3 toward (-1,0): corners [3, 4]
//   face 4 toward (-1,1): corners [2, 3]
//   face 5 toward (0,1):  corners [1, 2]

/** Pixel position of a specific corner of a hex cell */
function hexCornerPixel(
  h: HexCoord,
  cornerIndex: number,
  config: HexGridConfig,
): { x: number; y: number } {
  const center = hexToPixel(h, config);
  const angleDeg = 60 * cornerIndex;
  const angleRad = angleDeg * Math.PI / 180;
  return {
    x: center.x + config.hexSize * Math.cos(angleRad),
    y: center.y + config.hexSize * Math.sin(angleRad),
  };
}

/** Which two corners form the face toward a given neighbor direction */
const FACE_CORNERS: [number, number][] = [
  [0, 1],  // face 0: toward (1, 0)
  [5, 0],  // face 1: toward (1,-1)
  [4, 5],  // face 2: toward (0,-1)
  [3, 4],  // face 3: toward (-1, 0)
  [2, 3],  // face 4: toward (-1, 1)
  [1, 2],  // face 5: toward (0, 1)
];

/** Get the face index (0-5) from cell toward neighbor */
function getNeighborFaceIndex(cell: HexCoord, neighbor: HexCoord): number {
  const dq = neighbor.q - cell.q;
  const dr = neighbor.r - cell.r;
  for (let i = 0; i < HEX_DIRS.length; i++) {
    if (HEX_DIRS[i].dq === dq && HEX_DIRS[i].dr === dr) return i;
  }
  return 0;
}

/**
 * Find the shortest arc of corners along the perimeter from entry face
 * to exit face. Returns corner indices to traverse.
 */
function perimeterWaypoints(entryFaceIdx: number, exitFaceIdx: number): number[] {
  if (entryFaceIdx === exitFaceIdx) return [];

  const [ea, eb] = FACE_CORNERS[entryFaceIdx];
  const [xa, xb] = FACE_CORNERS[exitFaceIdx];

  // Try all 4 start-end combinations, pick shortest arc
  let bestArc: number[] | null = null;

  for (const start of [ea, eb]) {
    for (const end of [xa, xb]) {
      // Clockwise arc
      const cw: number[] = [];
      for (let c = start; ; c = (c + 1) % 6) {
        cw.push(c);
        if (c === end) break;
        if (cw.length > 6) break;
      }
      if (cw[cw.length - 1] === end && (!bestArc || cw.length < bestArc.length)) {
        bestArc = cw;
      }

      // Counterclockwise arc
      const ccw: number[] = [];
      for (let c = start; ; c = (c + 5) % 6) {
        ccw.push(c);
        if (c === end) break;
        if (ccw.length > 6) break;
      }
      if (ccw[ccw.length - 1] === end && (!bestArc || ccw.length < bestArc.length)) {
        bestArc = ccw;
      }
    }
  }

  return bestArc || [];
}

// ── Guide Rail Routing Engine ──────────────────────────────────────────
//
// Concentric inner hexagons serve as guide rails for routing.
// Each cell has N rails (rail 0 = outermost, at hexSize - railStep).
// Lines enter/exit cells orthogonally through face ports, then travel
// along guide rail arcs (corner-to-corner on inner hex perimeter).
//
// Structure per cell: entry stub → guide rail arc → exit stub

/** Per-cell routing info for a single edge passing through */
interface CellRouteInfo {
  edgeId: string;
  entryFace: number;
  exitFace: number;
  assignedRail: number;
}

/**
 * Assign guide rails to edges passing through a single cell.
 * Minimizes crossings by preserving entry-order on exit.
 */
function assignCellGuideRails(
  cellRoutes: Array<{ edgeId: string; entryFace: number; exitFace: number }>,
  maxRails: number,
): CellRouteInfo[] {
  if (cellRoutes.length === 0) return [];
  if (cellRoutes.length === 1) {
    return [{ ...cellRoutes[0], assignedRail: 0 }];
  }

  // Group by (entryFace, exitFace) combination
  const groups = new Map<string, typeof cellRoutes>();
  for (const r of cellRoutes) {
    const key = `${r.entryFace}→${r.exitFace}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const result: CellRouteInfo[] = [];
  let nextRail = 0;

  for (const [, group] of groups) {
    // Sort by entryFace index to maintain geometric order
    const sorted = [...group].sort((a, b) => a.entryFace - b.entryFace);

    for (const route of sorted) {
      const rail = Math.min(nextRail, maxRails - 1);
      result.push({ ...route, assignedRail: rail });
      nextRail++;
    }
  }

  return result;
}

/**
 * Build guide rail arc segments within a single cell.
 * Routes from entryFace port (midpoint) through guide rail corners to exitFace port.
 *
 * All waypoints sit on the guide rail (inset hexagon at railIndex).
 * Entry/exit use face port midpoints → inter-cell connectors cross faces
 * orthogonally (perpendicular to the face edge).
 */
function buildGuideRailArc(
  cell: HexCoord,
  entryFace: number,
  exitFace: number,
  railIndex: number,
  config: HexGridConfig,
  railStep: number,
): RouteSegment[] {
  if (entryFace === exitFace) return [];

  // Face port midpoints on the guide rail — entry and exit
  const entryPort = facePortPixel(cell, entryFace, railIndex, config, railStep);
  const exitPort = facePortPixel(cell, exitFace, railIndex, config, railStep);

  const arc = perimeterWaypoints(entryFace, exitFace);
  if (arc.length === 0) {
    // Direct (shouldn't happen for different faces, but safe fallback)
    return [{ from: entryPort, to: exitPort, angle: snapAngle(entryPort, exitPort) }];
  }

  const segments: RouteSegment[] = [];

  // Entry face port → first arc corner (on guide rail)
  const firstCorner = guideRailCornerPixel(cell, arc[0], config, railIndex, railStep);
  segments.push({ from: entryPort, to: firstCorner, angle: snapAngle(entryPort, firstCorner) });

  // Corner-to-corner along guide rail
  for (let i = 0; i < arc.length - 1; i++) {
    const from = guideRailCornerPixel(cell, arc[i], config, railIndex, railStep);
    const to = guideRailCornerPixel(cell, arc[i + 1], config, railIndex, railStep);
    segments.push({ from, to, angle: snapAngle(from, to) });
  }

  // Last arc corner → exit face port (on guide rail)
  const lastCorner = guideRailCornerPixel(cell, arc[arc.length - 1], config, railIndex, railStep);
  segments.push({ from: lastCorner, to: exitPort, angle: snapAngle(lastCorner, exitPort) });

  return segments;
}

/**
 * Route a single edge through one cell using guide rail corners.
 *
 * Pure corner-to-corner routing on inner hex at the assigned rail level.
 * No face midpoints — all waypoints are hex corners, so every segment
 * is parallel to a hex face (true PCB-style).
 *
 * Inter-cell connectors are handled by the caller (buildGuideRailSegments
 * or computeAllRoutesWithTracks Phase 3).
 */
function routeThroughCell(
  cell: HexCoord,
  entryFace: number,
  exitFace: number,
  railIndex: number,
  config: HexGridConfig,
  railStep: number,
): RouteSegment[] {
  // Delegate to guide rail arc — corner-to-corner on inner hex
  return buildGuideRailArc(cell, entryFace, exitFace, railIndex, config, railStep);
}

/**
 * New guide-rail based segment builder.
 * For each cell in hexPath, routes through it using concentric guide rails.
 * Replaces the old buildSegments() function.
 */
function buildGuideRailSegments(
  sourceHex: HexCoord,
  targetHex: HexCoord,
  hexPath: HexCoord[],
  _sourceFace: HexFace,
  _targetFace: HexFace,
  config: HexGridConfig,
  railStep: number = 20,
): RouteSegment[] {
  if (hexPath.length === 0) return [];

  const maxRails = guideRailCount(config.hexSize, railStep);
  const allSegments: RouteSegment[] = [];

  for (let i = 0; i < hexPath.length; i++) {
    const cell = hexPath[i];
    const prev = i === 0 ? sourceHex : hexPath[i - 1];
    const next = i === hexPath.length - 1 ? targetHex : hexPath[i + 1];

    const entryFace = getNeighborFaceIndex(cell, prev);
    const exitFace = getNeighborFaceIndex(cell, next);

    // For single-route-per-cell, assign rail 0 (outermost).
    // Multi-route assignment happens in computeAllRoutesGuideRail (future).
    const railIndex = 0;

    const cellSegments = routeThroughCell(cell, entryFace, exitFace, railIndex, config, railStep);

    // Connect to previous cell's exit point
    if (allSegments.length > 0 && cellSegments.length > 0) {
      const prevEnd = allSegments[allSegments.length - 1].to;
      const nextStart = cellSegments[0].from;
      if (Math.abs(prevEnd.x - nextStart.x) > 0.5 || Math.abs(prevEnd.y - nextStart.y) > 0.5) {
        allSegments.push({
          from: prevEnd,
          to: nextStart,
          angle: snapAngle(prevEnd, nextStart),
        });
      }
    }

    allSegments.push(...cellSegments);
  }

  return allSegments;
}

function createFallback(
  edge: { id: string; sourceHex: HexCoord; targetHex: HexCoord; sourceFace: HexFace; targetFace: HexFace },
  config: HexGridConfig,
): HexRoute {
  const from = getFacePixel(edge.sourceHex, edge.sourceFace, config);
  const to = getFacePixel(edge.targetHex, edge.targetFace, config);
  return {
    edgeId: edge.id,
    segments: [{ from, to, angle: snapAngle(from, to) }],
    hexPath: [],
    totalLength: Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2),
    turnCount: 0,
    isValid: false,
  };
}

// ── Parallel Track Assignment ────────────────────────────────────────────

export interface TrackAssignment {
  edgeId: string;
  trackIndex: number;
  trackTotal: number;
}

/**
 * Assign parallel track indices to edges sharing the same channel.
 * A channel = the shared face between two adjacent hex cells.
 * Channel key is normalized (alphabetically ordered) so A→B and B→A
 * share the same channel.
 */
export function assignParallelTracks(
  routes: Map<string, HexRoute>,
): Map<string, TrackAssignment> {
  // channelKey → Set<edgeId>
  const channelGroups = new Map<string, Set<string>>();

  for (const [edgeId, route] of routes) {
    if (!route.isValid || route.hexPath.length < 2) continue;

    for (let i = 0; i < route.hexPath.length - 1; i++) {
      const kA = hexKey(route.hexPath[i]);
      const kB = hexKey(route.hexPath[i + 1]);
      // Normalize: smaller key first so A→B and B→A map to same channel
      const channelKey = kA < kB ? `${kA}|${kB}` : `${kB}|${kA}`;

      if (!channelGroups.has(channelKey)) channelGroups.set(channelKey, new Set());
      channelGroups.get(channelKey)!.add(edgeId);
    }
  }

  // Find max parallel count per edge across all channels
  const edgeMax = new Map<string, { trackIndex: number; trackTotal: number }>();

  for (const [, edgeIds] of channelGroups) {
    if (edgeIds.size <= 1) continue;

    const arr = Array.from(edgeIds);
    arr.forEach((edgeId, index) => {
      const existing = edgeMax.get(edgeId);
      if (!existing || arr.length > existing.trackTotal) {
        edgeMax.set(edgeId, { trackIndex: index, trackTotal: arr.length });
      }
    });
  }

  // Build final assignments for all routes
  const assignments = new Map<string, TrackAssignment>();
  for (const [edgeId] of routes) {
    const parallel = edgeMax.get(edgeId);
    assignments.set(edgeId, {
      edgeId,
      trackIndex: parallel?.trackIndex ?? 0,
      trackTotal: parallel?.trackTotal ?? 1,
    });
  }

  return assignments;
}

/**
 * Full pipeline: compute routes using the Road Map graph.
 *
 * Phase 1: A* computes hex paths for all edges (cell-level routing).
 * Phase 2: Build Road Map graph for all routing cells.
 * Phase 3: Route each edge on the Road Map (A* with edge penalization).
 */
export function computeAllRoutesWithTracks(
  edges: Array<{
    id: string;
    sourceHex: HexCoord;
    targetHex: HexCoord;
    sourceFace: HexFace;
    targetFace: HexFace;
  }>,
  options: HexRouterOptions,
): {
  routes: Map<string, HexRoute>;
  tracks: Map<string, TrackAssignment>;
  roadMap: RoadMapGraph | null;
} {
  const { config, railStep = 20 } = options;

  // Phase 1: A* global routing (hexPath per edge)
  const routes = computeAllRoutes(edges, options);

  // Phase 2: Build Road Map graph
  // Collect all routing cells and occupied (node) cells
  const routingCellSet = new Set<string>();
  const occupiedCellKeys = new Set<string>();
  const routingCellMap = new Map<string, HexCoord>();

  for (const edge of edges) {
    occupiedCellKeys.add(hexKey(edge.sourceHex));
    occupiedCellKeys.add(hexKey(edge.targetHex));
  }

  for (const [, route] of routes) {
    if (!route.isValid) continue;
    for (const cell of route.hexPath) {
      const ck = hexKey(cell);
      if (!routingCellSet.has(ck)) {
        routingCellSet.add(ck);
        routingCellMap.set(ck, cell);
      }
    }
  }

  const routingCells = Array.from(routingCellMap.values());

  const roadMap = buildRoadMap(routingCells, occupiedCellKeys, config, {
    railCount: Math.max(1, Math.floor(config.hexSize / railStep) - 1),
    railStep,
    portsPerFace: 10,
  });

  console.log('[ROAD-MAP] built', roadMapStats(roadMap), {
    routingCells: routingCells.length,
    occupiedCells: occupiedCellKeys.size,
  });

  // Phase 3: Route each edge on the Road Map
  const edgeRequests: EdgeRouteRequest[] = [];

  for (const [edgeId, route] of routes) {
    if (!route.isValid || route.hexPath.length === 0) continue;
    const sourceEdge = edges.find(e => e.id === edgeId);
    if (!sourceEdge) continue;

    edgeRequests.push({
      edgeId,
      sourceHex: sourceEdge.sourceHex,
      targetHex: sourceEdge.targetHex,
      hexPath: route.hexPath,
    });
  }

  const rmResults = routeAllEdgesOnRoadMap(roadMap, edgeRequests, {
    railCount: Math.max(1, Math.floor(config.hexSize / railStep) - 1),
    railStep,
    portsPerFace: 10,
  });

  // Update route segments from road map results
  for (const [edgeId, rmResult] of rmResults) {
    const route = routes.get(edgeId);
    if (!route) continue;

    if (rmResult.isValid && rmResult.segments.length > 0) {
      route.segments = rmResult.segments.map(seg => ({
        from: seg.from,
        to: seg.to,
        angle: seg.angle as RouteAngle,
      }));
      route.totalLength = route.segments.reduce((sum, seg) => {
        const dx = seg.to.x - seg.from.x;
        const dy = seg.to.y - seg.from.y;
        return sum + Math.sqrt(dx * dx + dy * dy);
      }, 0);
      route.turnCount = route.segments.filter(
        (seg, idx) => idx > 0 && seg.angle !== route.segments[idx - 1].angle,
      ).length;
    }
  }

  // Build track assignments (for HexEdge trackIndex/trackTotal rendering)
  const tracks = assignParallelTracks(routes);

  return { routes, tracks, roadMap };
}

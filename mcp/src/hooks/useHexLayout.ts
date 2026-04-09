/**
 * useHexLayout.ts — Orchestrating hook for hex grid layout
 *
 * Combines hex-layout, hex-router, and track assignment into a single
 * React hook that transforms ReactFlow nodes/edges into hex mode.
 *
 * Handle system: PortHub strips on top (incoming) and bottom (outgoing)
 * flat edges of each hexagon. Handle IDs: hex-in-{i}, hex-out-{i}.
 *
 * Node positioning: node.position is offset so the hex visual center
 * aligns exactly with the background grid cell center.
 */

import { useCallback, useState, useMemo, useRef } from 'react';
import type { Node, Edge, ReactFlowInstance } from 'reactflow';
import { HexGridConfig, hexKey, hex, hexToPixel, pixelToHex, hexRound } from '../utils/hex-coords';
import type { HexCoord } from '../utils/hex-coords';
import { HexGrid } from '../utils/hex-grid';
import {
  computeHexLayout,
  createHexGridConfig,
} from '../utils/hex-layout';
import type { HexLayoutOptions } from '../utils/hex-layout';
import {
  computeAllRoutesWithTracks,
  DEFAULT_ROUTER_OPTIONS,
} from '../utils/hex-router';
import type {
  HexRoute,
  TrackAssignment,
  HexFace,
  HexRouterOptions,
  RoadMapGraph,
} from '../utils/hex-router';
import { extractDebugRoadMap } from '../utils/hex-road-map';
import type { DebugRoadMap } from '../utils/hex-road-map';
import { hexInHandleId, hexOutHandleId, hexPortPixel } from '../components/GXE/HexNode';
import { computeAIHexLayout } from '../services/gxe.service';

// ── Constants ────────────────────────────────────────────────────────────

const SQRT3 = Math.sqrt(3);

// ── Types ────────────────────────────────────────────────────────────────

export interface UseHexLayoutOptions {
  hexSize: number;
  minNodeGap: number;
  channelCapacity: number;
  direction: 'LR' | 'TB';
  layerSpacing: number;
  nodeSpacing: number;
  trackSpacing: number;
  /** Edge routing mode: 'default'|'smoothstep'|'step'|'straight' = standard ReactFlow types; 'hex-roadmap' = PCB road-map A* routing */
  hexEdgeRouting?: string;
}

export interface AIHexLayoutMetadata {
  model: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  layoutTime: number;
  validationErrors: string[];
}

export interface UseHexLayoutReturn {
  applyHexLayout: () => void;
  applyAIHexLayout: () => Promise<void>;
  clearHexLayout: () => void;
  /** Call from onNodeDragStop in hex mode to snap dragged node to nearest hex cell */
  snapNodeToHexGrid: (node: Node) => void;
  isLayouting: boolean;
  isAIHexLayouting: boolean;
  aiHexLayoutError: string | null;
  aiHexLayoutMetadata: AIHexLayoutMetadata | null;
  hexGrid: HexGrid | null;
  hexConfig: HexGridConfig;
  routes: Map<string, HexRoute>;
  trackAssignments: Map<string, TrackAssignment>;
  occupiedCells: Set<string>;
  routingHeatmap: Map<string, number>;
  roadMap: RoadMapGraph | null;
  debugRoadMap: DebugRoadMap | null;
}

export const DEFAULT_HEX_LAYOUT_HOOK_OPTIONS: UseHexLayoutOptions = {
  hexSize: 100,
  minNodeGap: 1,
  channelCapacity: 3,
  direction: 'TB',   // hex mode: source above target
  layerSpacing: 3,
  nodeSpacing: 2,
  trackSpacing: 12,
  hexEdgeRouting: 'default',
};

/** Length of orthogonal stub from port before routing starts (px) */
const STUB_LENGTH = 20;

// ── Helper: determine bottom/top faces for PortHub routing ──────────────

/**
 * All edges exit from the source's bottom PortHub and enter the target's
 * top PortHub. Pick bottom-left vs bottom-right (and top-left vs
 * top-right) based on relative position for natural routing angles.
 */
function determinePortFaces(
  sourceHex: HexCoord,
  targetHex: HexCoord,
): { sourceFace: HexFace; targetFace: HexFace } {
  const dq = targetHex.q - sourceHex.q;
  // Source exits from bottom side closer to target
  const sourceFace: HexFace = dq >= 0 ? 'bottom-right' : 'bottom-left';
  // Target enters from top side closer to source
  const targetFace: HexFace = dq >= 0 ? 'top-left' : 'top-right';
  return { sourceFace, targetFace };
}

// ── Helper: edge routing info ───────────────────────────────────────────

interface EdgeRoutingInfo {
  id: string;
  sourceHex: HexCoord;
  targetHex: HexCoord;
  sourceFace: HexFace;
  targetFace: HexFace;
  sourcePortIndex: number;
  sourcePortCount: number;
  targetPortIndex: number;
  targetPortCount: number;
}

// ── Shared: apply hex placement + routing to nodes/edges ────────────────

function applyHexResult(
  nodeHexPositions: Map<string, HexCoord>,
  nodePixelPositions: Map<string, { x: number; y: number }>,
  currentEdges: Edge[],
  grid: HexGrid,
  hexConfig: HexGridConfig,
  options: UseHexLayoutOptions,
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void,
  reactFlowInstance: ReactFlowInstance | null,
): {
  grid: HexGrid;
  routes: Map<string, HexRoute>;
  tracks: Map<string, TrackAssignment>;
  roadMap: RoadMapGraph | null;
} {
  const hexSize = hexConfig.hexSize;
  const hexH = hexSize * SQRT3;

  // 1. Build per-node sorted edge lists for port index assignment
  const nodeOutgoing = new Map<string, string[]>(); // nodeId → sorted edge IDs
  const nodeIncoming = new Map<string, string[]>();
  const edgeMap = new Map(currentEdges.map(e => [e.id, e]));

  for (const edge of currentEdges) {
    if (!nodeHexPositions.has(edge.source) || !nodeHexPositions.has(edge.target)) continue;
    if (!nodeOutgoing.has(edge.source)) nodeOutgoing.set(edge.source, []);
    nodeOutgoing.get(edge.source)!.push(edge.id);
    if (!nodeIncoming.has(edge.target)) nodeIncoming.set(edge.target, []);
    nodeIncoming.get(edge.target)!.push(edge.id);
  }

  // Sort outgoing edges by target q-coordinate (left-to-right port order)
  for (const [, edgeIds] of nodeOutgoing) {
    edgeIds.sort((a, b) => {
      const tA = nodeHexPositions.get(edgeMap.get(a)!.target);
      const tB = nodeHexPositions.get(edgeMap.get(b)!.target);
      if (!tA || !tB) return 0;
      return tA.q - tB.q || tA.r - tB.r;
    });
  }
  // Sort incoming edges by source q-coordinate
  for (const [, edgeIds] of nodeIncoming) {
    edgeIds.sort((a, b) => {
      const sA = nodeHexPositions.get(edgeMap.get(a)!.source);
      const sB = nodeHexPositions.get(edgeMap.get(b)!.source);
      if (!sA || !sB) return 0;
      return sA.q - sB.q || sA.r - sB.r;
    });
  }

  // 2. Build edge routing info with port assignments
  const edgeRoutingInfos: EdgeRoutingInfo[] = [];

  for (const edge of currentEdges) {
    const sHex = nodeHexPositions.get(edge.source);
    const tHex = nodeHexPositions.get(edge.target);
    if (!sHex || !tHex) continue;

    const outEdges = nodeOutgoing.get(edge.source) || [];
    const inEdges = nodeIncoming.get(edge.target) || [];
    const srcPortIdx = Math.max(0, outEdges.indexOf(edge.id));
    const tgtPortIdx = Math.max(0, inEdges.indexOf(edge.id));

    const { sourceFace, targetFace } = determinePortFaces(sHex, tHex);

    edgeRoutingInfos.push({
      id: edge.id,
      sourceHex: sHex,
      targetHex: tHex,
      sourceFace,
      targetFace,
      sourcePortIndex: srcPortIdx,
      sourcePortCount: outEdges.length,
      targetPortIndex: tgtPortIdx,
      targetPortCount: inEdges.length,
    });
  }

  // 3. Compute routes + track assignments (only in road-map mode)
  const useRoadMap = options.hexEdgeRouting === 'hex-roadmap';
  let computedRoutes = new Map<string, HexRoute>();
  let tracks = new Map<string, TrackAssignment>();
  let roadMap: RoadMapGraph | null = null;

  if (useRoadMap) {
    const routerOpts: HexRouterOptions = {
      grid,
      config: hexConfig,
      turnPenalty: (DEFAULT_ROUTER_OPTIONS.turnPenalty as number) ?? 30,
      occupancyPenalty: (DEFAULT_ROUTER_OPTIONS.occupancyPenalty as number) ?? 50,
      contourBonus: (DEFAULT_ROUTER_OPTIONS.contourBonus as number) ?? 8,
      maxIterations: (DEFAULT_ROUTER_OPTIONS.maxIterations as number) ?? 1000,
      trackInset: (DEFAULT_ROUTER_OPTIONS.trackInset as number) ?? 20,
      railStep: (DEFAULT_ROUTER_OPTIONS.railStep as number) ?? 20,
    };

    const routerEdges = edgeRoutingInfos.map(info => ({
      id: info.id,
      sourceHex: info.sourceHex,
      targetHex: info.targetHex,
      sourceFace: info.sourceFace,
      targetFace: info.targetFace,
    }));

    const result = computeAllRoutesWithTracks(routerEdges, routerOpts);
    computedRoutes = result.routes;
    tracks = result.tracks;
    roadMap = result.roadMap ?? null;
  }

  // 4. Post-process route segments (road-map mode only):
  //    - Replace first/last points with port pixel positions
  //    - Insert orthogonal stubs (vertical from PortHub) connected via
  //      L-shaped paths to the guide rail face ports (no diagonals)
  for (const info of useRoadMap ? edgeRoutingInfos : []) {
    const route = computedRoutes.get(info.id);
    if (!route || route.segments.length === 0) continue;

    const srcCenter = nodePixelPositions.get(edgeMap.get(info.id)!.source);
    const tgtCenter = nodePixelPositions.get(edgeMap.get(info.id)!.target);
    if (!srcCenter || !tgtCenter) continue;

    // Source port pixel (bottom PortHub)
    const srcPort = hexPortPixel(srcCenter, hexSize, 'source', info.sourcePortIndex, info.sourcePortCount);
    // Target port pixel (top PortHub)
    const tgtPort = hexPortPixel(tgtCenter, hexSize, 'target', info.targetPortIndex, info.targetPortCount);

    // Snap angle helper (nearest hex angle)
    const snap = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI + 360) % 360;
      return (Math.round(deg / 60) * 60 % 360) as 0 | 60 | 120 | 180 | 240 | 300;
    };

    // First/last route points are face port midpoints on guide rails.
    // Connect PortHub ports to them via L-shaped orthogonal paths:
    //   Port → vertical stub → horizontal to face port X → vertical to face port Y
    const firstFacePort = route.segments[0].from;
    const lastFacePort = route.segments[route.segments.length - 1].to;

    const newSegments: typeof route.segments = [];

    // ── Source: PortHub → L-shape → first face port ──
    // 1. Vertical stub down from source port
    const srcStubEnd = { x: srcPort.x, y: srcPort.y + STUB_LENGTH };
    newSegments.push({ from: srcPort, to: srcStubEnd, angle: snap(srcPort, srcStubEnd) });

    // 2. L-shaped connector: horizontal then vertical (or single segment if aligned)
    const srcDx = Math.abs(srcStubEnd.x - firstFacePort.x);
    const srcDy = Math.abs(srcStubEnd.y - firstFacePort.y);
    if (srcDx > 1 && srcDy > 1) {
      // L-shape: horizontal to align X, then vertical to face port
      const srcElbow = { x: firstFacePort.x, y: srcStubEnd.y };
      newSegments.push({ from: srcStubEnd, to: srcElbow, angle: snap(srcStubEnd, srcElbow) });
      newSegments.push({ from: srcElbow, to: firstFacePort, angle: snap(srcElbow, firstFacePort) });
    } else {
      // Nearly aligned — single segment
      newSegments.push({ from: srcStubEnd, to: firstFacePort, angle: snap(srcStubEnd, firstFacePort) });
    }

    // 3. All guide rail segments (face port → corners → face port per cell)
    for (const seg of route.segments) {
      newSegments.push(seg);
    }

    // ── Target: last face port → L-shape → PortHub ──
    // 4. L-shaped connector: vertical then horizontal (or single segment if aligned)
    const tgtStubStart = { x: tgtPort.x, y: tgtPort.y - STUB_LENGTH };
    const tgtDx = Math.abs(lastFacePort.x - tgtStubStart.x);
    const tgtDy = Math.abs(lastFacePort.y - tgtStubStart.y);
    if (tgtDx > 1 && tgtDy > 1) {
      // L-shape: vertical to align Y, then horizontal to stub start
      const tgtElbow = { x: lastFacePort.x, y: tgtStubStart.y };
      newSegments.push({ from: lastFacePort, to: tgtElbow, angle: snap(lastFacePort, tgtElbow) });
      newSegments.push({ from: tgtElbow, to: tgtStubStart, angle: snap(tgtElbow, tgtStubStart) });
    } else {
      // Nearly aligned — single segment
      newSegments.push({ from: lastFacePort, to: tgtStubStart, angle: snap(lastFacePort, tgtStubStart) });
    }

    // 5. Vertical stub up into target port
    newSegments.push({ from: tgtStubStart, to: tgtPort, angle: snap(tgtStubStart, tgtPort) });

    route.segments = newSegments;
  }

  // 5. Build edge info lookup
  const edgeInfoMap = new Map<string, EdgeRoutingInfo>();
  for (const info of edgeRoutingInfos) edgeInfoMap.set(info.id, info);

  // 6. Update nodes — hexNode type with ALIGNED positions
  //    ReactFlow positions by top-left corner; offset so hex visual center
  //    aligns with hexToPixel center (matching background grid).
  setNodes(prev => prev.map(node => {
    const hc = nodeHexPositions.get(node.id);
    const center = nodePixelPositions.get(node.id);
    if (!hc || !center) return node;

    return {
      ...node,
      position: {
        x: center.x - hexSize,    // offset to top-left (hexW/2 = hexSize)
        y: center.y - hexH / 2,   // offset to top-left (hexH/2)
      },
      type: 'hexNode',
      data: { ...node.data, hexCoord: hc, hexConfig },
    };
  }));

  // 7. Update edges — PortHub-based handle IDs (hex-out-{i} / hex-in-{i})
  // Diagnostic: log edge data before applying
  console.log('[HEX-EDGE-DATA]', Array.from(computedRoutes.entries()).map(([id, r]) => ({
    id,
    hasRoute: !!r,
    segmentCount: r?.segments?.length,
    isValid: r?.isValid,
    hexPathLen: r?.hexPath?.length,
  })));

  setEdges(prev => prev.map(edge => {
    const info = edgeInfoMap.get(edge.id);
    const route = computedRoutes.get(edge.id);
    const track = tracks.get(edge.id);

    const srcHandle = info ? hexOutHandleId(info.sourcePortIndex) : hexOutHandleId(0);
    const tgtHandle = info ? hexInHandleId(info.targetPortIndex) : hexInHandleId(0);

    return {
      ...edge,
      type: useRoadMap ? 'hexEdge' : (options.hexEdgeRouting || 'default'),
      sourceHandle: srcHandle,
      targetHandle: tgtHandle,
      data: {
        ...edge.data,
        route: useRoadMap ? route : undefined,
        trackIndex: useRoadMap ? (track?.trackIndex ?? 0) : undefined,
        trackTotal: useRoadMap ? (track?.trackTotal ?? 1) : undefined,
        // Save original handles for restoration on clear
        _origSourceHandle: edge.data?._origSourceHandle ?? edge.sourceHandle,
        _origTargetHandle: edge.data?._origTargetHandle ?? edge.targetHandle,
      },
    };
  }));

  // 8. Fit view
  if (reactFlowInstance) {
    setTimeout(() => reactFlowInstance.fitView({ padding: 0.1 }), 50);
  }

  return { grid, routes: computedRoutes, tracks, roadMap: roadMap ?? null };
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useHexLayout(
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: (nodes: Node[]) => Node[]) => void,
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void,
  reactFlowInstance: ReactFlowInstance | null,
  options: UseHexLayoutOptions = DEFAULT_HEX_LAYOUT_HOOK_OPTIONS,
): UseHexLayoutReturn {
  const [isLayouting, setIsLayouting] = useState(false);
  const [isAIHexLayouting, setIsAIHexLayouting] = useState(false);
  const [aiHexLayoutError, setAIHexLayoutError] = useState<string | null>(null);
  const [aiHexLayoutMetadata, setAIHexLayoutMetadata] = useState<AIHexLayoutMetadata | null>(null);
  const [hexGrid, setHexGrid] = useState<HexGrid | null>(null);
  const [routes, setRoutes] = useState<Map<string, HexRoute>>(new Map());
  const [trackAssignments, setTrackAssignments] = useState<Map<string, TrackAssignment>>(new Map());
  const [roadMap, setRoadMap] = useState<RoadMapGraph | null>(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  const hexConfig = useMemo<HexGridConfig>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const h = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return createHexGridConfig(options.hexSize, w, h);
  }, [options.hexSize]);

  // ── Apply local hex layout ────────────────────────────────────────────

  const applyHexLayout = useCallback(() => {
    if (isLayouting) return;
    setIsLayouting(true);

    try {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      if (currentNodes.length === 0) { setIsLayouting(false); return; }

      const layoutOpts: HexLayoutOptions = {
        config: hexConfig,
        minNodeGap: options.minNodeGap,
        channelCapacity: options.channelCapacity,
        direction: options.direction,
        layerSpacing: options.layerSpacing,
        nodeSpacing: options.nodeSpacing,
      };
      const layoutResult = computeHexLayout(currentNodes, currentEdges, layoutOpts);

      const result = applyHexResult(
        layoutResult.nodeHexPositions,
        layoutResult.nodePixelPositions,
        currentEdges,
        layoutResult.grid,
        hexConfig,
        options,
        setNodes,
        setEdges,
        reactFlowInstance,
      );

      setHexGrid(result.grid);
      setRoutes(result.routes);
      setTrackAssignments(result.tracks);
      setRoadMap(result.roadMap);
    } catch (err) {
      console.error('[useHexLayout] layout error:', err);
    } finally {
      setIsLayouting(false);
    }
  }, [hexConfig, options, setNodes, setEdges, reactFlowInstance, isLayouting]);

  // ── Apply AI-powered hex layout (LLM computes q,r → we route) ────────

  const applyAIHexLayout = useCallback(async () => {
    if (isAIHexLayouting) return;
    setIsAIHexLayouting(true);
    setAIHexLayoutError(null);

    try {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      if (currentNodes.length === 0) { setIsAIHexLayouting(false); return; }

      const request = {
        nodes: currentNodes.map(n => ({
          id: n.id,
          label: (n.data as any)?.label || (n.data as any)?.name || n.id,
          type: n.type || (n.data as any)?.kind || undefined,
        })),
        edges: currentEdges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          label: (e.data as any)?.label || undefined,
        })),
        hints: {
          preferredDirection: options.direction || 'LR',
          hexOptions: {
            minNodeGap: options.minNodeGap,
            channelCapacity: options.channelCapacity,
          },
        },
      };

      const result = await computeAIHexLayout(request);

      if (!result.success) {
        throw new Error(result.error || 'AI Hex Layout failed');
      }

      setAIHexLayoutMetadata(result.metadata || null);

      const grid = new HexGrid({
        config: hexConfig,
        defaultCapacity: options.channelCapacity,
      });

      const nodeHexPositions = new Map<string, HexCoord>();
      const nodePixelPositions = new Map<string, { x: number; y: number }>();

      for (const [nodeId, pos] of Object.entries(result.nodePositions || {})) {
        const hc = hex((pos as any).q, (pos as any).r);
        grid.placeNode(hc, nodeId);
        nodeHexPositions.set(nodeId, hc);
        nodePixelPositions.set(nodeId, hexToPixel(hc, hexConfig));
      }

      const applied = applyHexResult(
        nodeHexPositions,
        nodePixelPositions,
        currentEdges,
        grid,
        hexConfig,
        options,
        setNodes,
        setEdges,
        reactFlowInstance,
      );

      setHexGrid(applied.grid);
      setRoutes(applied.routes);
      setTrackAssignments(applied.tracks);
      setRoadMap(applied.roadMap);

      console.log(
        `[useHexLayout] AI hex layout applied: ${currentNodes.length} nodes, ` +
        `${result.metadata?.layoutTime}ms, ${result.metadata?.tokensUsed} tokens`
      );
    } catch (err: any) {
      console.error('[useHexLayout] AI hex layout error:', err);
      setAIHexLayoutError(err.message || 'AI Hex Layout failed');
    } finally {
      setIsAIHexLayouting(false);
    }
  }, [hexConfig, options, setNodes, setEdges, reactFlowInstance, isAIHexLayouting]);

  // ── Snap dragged node to nearest hex cell ─────────────────────────────

  const snapNodeToHexGrid = useCallback((node: Node) => {
    const hexH = hexConfig.hexSize * SQRT3;
    // Node position is top-left corner; compute visual center
    const centerX = node.position.x + hexConfig.hexSize;
    const centerY = node.position.y + hexH / 2;
    // Find the nearest hex cell and convert back to pixel
    const snappedHex = hexRound(pixelToHex({ x: centerX, y: centerY }, hexConfig));
    const snappedCenter = hexToPixel(snappedHex, hexConfig);
    const snappedPos = {
      x: snappedCenter.x - hexConfig.hexSize,
      y: snappedCenter.y - hexH / 2,
    };
    setNodes(prev => prev.map(n => {
      if (n.id !== node.id) return n;
      return {
        ...n,
        position: snappedPos,
        data: { ...n.data, hexCoord: snappedHex },
      };
    }));
  }, [hexConfig, setNodes]);

  // ── Clear hex layout (revert to default types) ───────────────────────

  const clearHexLayout = useCallback(() => {
    setNodes(prev => prev.map(node => ({
      ...node,
      type: 'graphNode',
      data: { ...node.data, hexCoord: undefined, hexConfig: undefined },
    })));
    setEdges(prev => prev.map(edge => ({
      ...edge,
      type: 'parallel',
      sourceHandle: edge.data?._origSourceHandle ?? edge.sourceHandle,
      targetHandle: edge.data?._origTargetHandle ?? edge.targetHandle,
      data: {
        ...edge.data,
        route: undefined, trackIndex: undefined, trackTotal: undefined,
        _origSourceHandle: undefined, _origTargetHandle: undefined,
      },
    })));
    setHexGrid(null);
    setRoutes(new Map());
    setTrackAssignments(new Map());
    setRoadMap(null);
  }, [setNodes, setEdges]);

  // ── Derived data for HexGridBackground ───────────────────────────────

  const occupiedCells = useMemo(() => {
    if (!hexGrid) return new Set<string>();
    return new Set(hexGrid.getOccupiedCells().map(c => hexKey(c.coord)));
  }, [hexGrid]);

  const routingHeatmap = useMemo(() => {
    if (!hexGrid) return new Map<string, number>();
    const hm = new Map<string, number>();
    for (const cell of hexGrid.getRoutingCells()) {
      hm.set(hexKey(cell.coord), cell.routingTracks.length / cell.capacity);
    }
    return hm;
  }, [hexGrid]);

  const debugRoadMap = useMemo<DebugRoadMap | null>(() => {
    if (!roadMap) return null;
    return extractDebugRoadMap(roadMap);
  }, [roadMap]);

  return {
    applyHexLayout,
    applyAIHexLayout,
    clearHexLayout,
    snapNodeToHexGrid,
    isLayouting,
    isAIHexLayouting,
    aiHexLayoutError,
    aiHexLayoutMetadata,
    hexGrid,
    hexConfig,
    routes,
    trackAssignments,
    occupiedCells,
    routingHeatmap,
    roadMap,
    debugRoadMap,
  };
}

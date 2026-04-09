/**
 * useGXELayout — Universal layout hook for GXE Visualizer.
 *
 * Supports all 11 layout algorithms from graph-layouts.js,
 * measures real DOM node sizes, applies post-layout collision
 * resolution, injects ELK edge routes, and computes parallel
 * edge offsets to prevent edge overlap.
 */

import { useState, useCallback, useRef } from 'react';
import { Node, Edge, ReactFlowInstance } from 'reactflow';
import {
  applyElkLayeredLayout,
  applyElkStressLayout,
  applyElkForceLayout,
  applyElkMrTreeLayout,
  applyElkRadialLayout,
  applyElkRoutes,
  applyForceLayout,
  applyCircularLayout,
  applyRadialLayout,
  applyGridLayout,
  applyTreeLayout,
  computeParallelOffsets,
} from '../utils/graph-layouts';
import { resolveCollisions } from '../components/GXE/utils/collisionResolver';
import dagre from 'dagre';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

type Direction = 'TB' | 'BT' | 'LR' | 'RL';

export interface GXELayoutOptions {
  algorithm: string;
  direction: Direction;
  nodeSpacing: number;
  rankSpacing: number;
}

export interface UseGXELayoutReturn {
  applyLayout: (overrides?: Partial<GXELayoutOptions>) => Promise<void>;
  isLayouting: boolean;
}

// Default node dimensions
const DEFAULT_WIDTH = 260;
const DEFAULT_HEIGHT = 130;
const SMALL_WIDTH = 190;
const SMALL_HEIGHT = 70;

// ────────────────────────────────────────────────────────────────────────────
// DOM MEASUREMENT
// ────────────────────────────────────────────────────────────────────────────

function measureNodeSizes(nodes: Node[]): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    const el = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      sizes.set(node.id, { width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
    } else {
      const isSmall = (node.data as any)?.kind?.startsWith('tool.') || (node.data as any)?.kind === 'tool-ref';
      sizes.set(node.id, {
        width: isSmall ? SMALL_WIDTH : DEFAULT_WIDTH,
        height: isSmall ? SMALL_HEIGHT : DEFAULT_HEIGHT,
      });
    }
  }
  return sizes;
}

// ────────────────────────────────────────────────────────────────────────────
// DAGRE LAYOUT (kept separate because it uses its own library)
// ────────────────────────────────────────────────────────────────────────────

function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: Direction,
  nodesep: number,
  ranksep: number,
  sizes: Map<string, { width: number; height: number }>
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, ranksep, nodesep, align: 'UL' });

  nodes.forEach((node) => {
    const s = sizes.get(node.id);
    g.setNode(node.id, { width: s?.width || DEFAULT_WIDTH, height: s?.height || DEFAULT_HEIGHT });
  });

  edges.forEach((edge) => {
    const src = typeof edge.source === 'string' ? edge.source : (edge.source as any)?.id;
    const tgt = typeof edge.target === 'string' ? edge.target : (edge.target as any)?.id;
    if (g.hasNode(src) && g.hasNode(tgt)) g.setEdge(src, tgt);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const s = sizes.get(node.id);
    const w = s?.width || DEFAULT_WIDTH;
    const h = s?.height || DEFAULT_HEIGHT;
    return {
      ...node,
      position: { x: pos.x - w / 2, y: pos.y - h / 2 },
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN HOOK
// ────────────────────────────────────────────────────────────────────────────

export function useGXELayout(
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: Node[] | ((nodes: Node[]) => Node[])) => void,
  setEdges: (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void,
  reactFlowInstance: ReactFlowInstance | null,
  defaultOptions: GXELayoutOptions
): UseGXELayoutReturn {
  const [isLayouting, setIsLayouting] = useState(false);
  const layoutInProgress = useRef(false);

  const applyLayout = useCallback(
    async (overrides?: Partial<GXELayoutOptions>) => {
      if (layoutInProgress.current || nodes.length === 0) return;

      layoutInProgress.current = true;
      setIsLayouting(true);

      const opts = { ...defaultOptions, ...overrides };
      const { algorithm, direction, nodeSpacing, rankSpacing } = opts;

      try {
        // 1. Measure real DOM sizes
        const sizes = measureNodeSizes(nodes);
        // Extra padding around each node for ELK — ensures edges have
        // clearance channels between nodes (PCB-style routing)
        const nodePadding = 48;

        // Find max dimensions for ELK default
        let maxW = DEFAULT_WIDTH;
        let maxH = DEFAULT_HEIGHT;
        for (const s of sizes.values()) {
          if (s.width > maxW) maxW = s.width;
          if (s.height > maxH) maxH = s.height;
        }

        const elkOpts = {
          direction,
          nodesep: nodeSpacing,
          ranksep: rankSpacing,
          nodeWidth: maxW + nodePadding,
          nodeHeight: maxH + nodePadding / 2,
        };

        // 2. Run layout algorithm
        let layoutedNodes: Node[];
        let edgeRoutes: Map<string, Array<{ x: number; y: number }>> | null = null;
        const isElk = algorithm.startsWith('elk-');

        switch (algorithm) {
          case 'elk-layered': {
            const r = await applyElkLayeredLayout(nodes, edges, elkOpts);
            layoutedNodes = r.nodes;
            edgeRoutes = r.edgeRoutes;
            break;
          }
          case 'elk-stress': {
            const r = await applyElkStressLayout(nodes, edges, elkOpts);
            layoutedNodes = r.nodes;
            edgeRoutes = r.edgeRoutes;
            break;
          }
          case 'elk-force': {
            const r = await applyElkForceLayout(nodes, edges, elkOpts);
            layoutedNodes = r.nodes;
            edgeRoutes = r.edgeRoutes;
            break;
          }
          case 'elk-mrtree': {
            const r = await applyElkMrTreeLayout(nodes, edges, elkOpts);
            layoutedNodes = r.nodes;
            edgeRoutes = r.edgeRoutes;
            break;
          }
          case 'elk-radial': {
            const r = await applyElkRadialLayout(nodes, edges, elkOpts);
            layoutedNodes = r.nodes;
            edgeRoutes = r.edgeRoutes;
            break;
          }
          case 'force':
            layoutedNodes = applyForceLayout(nodes, edges, {
              iterations: 80,
              repulsion: rankSpacing * 4,
              attraction: 0.03,
            });
            break;
          case 'circular':
            layoutedNodes = applyCircularLayout(nodes, edges, { sortByTopology: true });
            break;
          case 'radial':
            layoutedNodes = applyRadialLayout(nodes, edges, { ringSpacing: rankSpacing * 2.5 });
            break;
          case 'grid':
            layoutedNodes = applyGridLayout(nodes, edges, {
              cellWidth: nodeSpacing * 4 + 80,
              cellHeight: rankSpacing + 60,
              sortByTopology: true,
            });
            break;
          case 'tree':
            layoutedNodes = applyTreeLayout(nodes, edges, {
              direction,
              nodeWidth: DEFAULT_WIDTH,
              nodeHeight: DEFAULT_HEIGHT,
              siblingGap: nodeSpacing,
            });
            break;
          case 'dagre':
          default:
            layoutedNodes = applyDagreLayout(nodes, edges, direction, nodeSpacing, rankSpacing, sizes);
            break;
        }

        // 3. Post-process: collision resolution with measured sizes
        // Padding of 40px guarantees visual gap + edge routing channels
        const resolved = resolveCollisions(layoutedNodes, { padding: 40, sizes });
        const hasCollisionFixes = resolved.some(
          (node, i) =>
            node.position.x !== layoutedNodes[i].position.x ||
            node.position.y !== layoutedNodes[i].position.y
        );
        const finalNodes = hasCollisionFixes ? resolved : layoutedNodes;

        // 4. Apply nodes
        setNodes(finalNodes);

        // 5. Handle edge routes + parallel offset computation
        if (isElk && edgeRoutes && edgeRoutes.size > 0) {
          // ELK handles edge routing — inject routes and compute parallel offsets
          setEdges((es: Edge[]) => {
            const withRoutes = applyElkRoutes(es, edgeRoutes!);
            return computeParallelOffsets(withRoutes, 18) as Edge[];
          });
        } else {
          // Non-ELK: clear ELK routes and compute parallel offsets
          setEdges((es: Edge[]) => {
            const cleaned = es.map((e) => {
              if ((e.data as any)?.elkRoute) {
                const { elkRoute, ...rest } = e.data as any;
                return { ...e, data: rest };
              }
              return e;
            });
            return computeParallelOffsets(cleaned, 18) as Edge[];
          });
        }

        // 6. Fit view
        setTimeout(() => {
          reactFlowInstance?.fitView({ padding: 0.15, duration: 300 });
        }, 50);
      } catch (err) {
        console.error('[useGXELayout] Layout failed:', err);
      } finally {
        layoutInProgress.current = false;
        setIsLayouting(false);
      }
    },
    [nodes, edges, setNodes, setEdges, reactFlowInstance, defaultOptions]
  );

  return { applyLayout, isLayouting };
}

export default useGXELayout;

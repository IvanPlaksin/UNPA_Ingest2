/**
 * useAOPEGLayout — ELK-based auto-layout for AOPEG Graph Editor.
 *
 * Wraps applyElkLayeredLayout from graph-layouts.js and adapts it
 * for the AOPEG editor: measures real DOM node sizes, applies ELK
 * Sugiyama layout, and injects edge routes.
 */

import { useState, useCallback, useRef } from 'react';
import { Node, Edge, ReactFlowInstance } from 'reactflow';
import {
  applyElkLayeredLayout,
  applyElkRoutes,
} from '../../../utils/graph-layouts';
import { resolveCollisions } from '../../GXE/utils/collisionResolver';

type Direction = 'LR' | 'TB' | 'BT' | 'RL';

interface UseAOPEGLayoutOptions {
  defaultDirection?: Direction;
  nodePadding?: number;
  layerSpacing?: number;
  nodeSpacing?: number;
}

interface UseAOPEGLayoutReturn {
  applyLayout: (direction?: Direction) => Promise<void>;
  isLayouting: boolean;
}

// Default node dimensions (fallback when DOM measurement unavailable)
const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 100;

/**
 * Measure actual rendered node sizes from the DOM.
 * Falls back to defaults if DOM elements are not found.
 */
function measureNodeSizes(nodes: Node[]): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();

  for (const node of nodes) {
    const el = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      sizes.set(node.id, {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      });
    } else {
      sizes.set(node.id, {
        width: DEFAULT_NODE_WIDTH,
        height: DEFAULT_NODE_HEIGHT,
      });
    }
  }

  return sizes;
}

/**
 * Check if all nodes are at position (0,0) — i.e., no layout has been applied.
 */
export function hasZeroPositions(nodes: Node[]): boolean {
  if (nodes.length === 0) return false;
  return nodes.every(
    (n) => (!n.position?.x || n.position.x === 0) && (!n.position?.y || n.position.y === 0)
  );
}

export function useAOPEGLayout(
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: Node[] | ((nodes: Node[]) => Node[])) => void,
  setEdges: (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void,
  reactFlowInstance: ReactFlowInstance | null,
  options: UseAOPEGLayoutOptions = {}
): UseAOPEGLayoutReturn {
  const {
    defaultDirection = 'LR',
    nodePadding = 48,
    layerSpacing = 200,
    nodeSpacing = 120,
  } = options;

  const [isLayouting, setIsLayouting] = useState(false);
  const layoutInProgress = useRef(false);

  const applyLayout = useCallback(
    async (direction?: Direction) => {
      if (layoutInProgress.current || nodes.length === 0) return;

      layoutInProgress.current = true;
      setIsLayouting(true);

      try {
        const dir = direction || defaultDirection;

        // Measure real DOM node sizes (with padding)
        const sizes = measureNodeSizes(nodes);

        // Find the max dimensions to pass as defaults to ELK
        let maxW = DEFAULT_NODE_WIDTH;
        let maxH = DEFAULT_NODE_HEIGHT;
        for (const s of sizes.values()) {
          if (s.width > maxW) maxW = s.width;
          if (s.height > maxH) maxH = s.height;
        }

        // Prepare nodes with individual size overrides for ELK
        const nodesWithSizes = nodes.map((n) => {
          const s = sizes.get(n.id);
          return {
            ...n,
            // Embed measured dimensions in data for ELK to pick up
            width: (s?.width || DEFAULT_NODE_WIDTH) + nodePadding,
            height: (s?.height || DEFAULT_NODE_HEIGHT) + (nodePadding / 2),
          };
        });

        const result = await applyElkLayeredLayout(nodesWithSizes, edges, {
          direction: dir,
          nodesep: nodeSpacing,
          ranksep: layerSpacing,
          nodeWidth: maxW + nodePadding,
          nodeHeight: maxH + (nodePadding / 2),
        });

        // Post-process: resolve any remaining collisions after ELK layout
        // Pass measured sizes so collision detection uses real node dimensions
        const resolved = resolveCollisions(result.nodes, { padding: 24, sizes });
        const hasCollisionFixes = resolved.some((node, i) =>
          node.position.x !== result.nodes[i].position.x ||
          node.position.y !== result.nodes[i].position.y
        );

        // Apply positioned nodes (with collision fixes if needed)
        setNodes(hasCollisionFixes ? resolved : result.nodes);

        // Inject ELK edge routes for orthogonal routing
        if (result.edgeRoutes && result.edgeRoutes.size > 0) {
          setEdges((currentEdges: Edge[]) => applyElkRoutes(currentEdges, result.edgeRoutes));
        }

        // Fit view after layout with slight delay for DOM update
        requestAnimationFrame(() => {
          reactFlowInstance?.fitView({ padding: 0.15 });
        });
      } catch (err) {
        console.error('[useAOPEGLayout] Layout failed:', err);
      } finally {
        layoutInProgress.current = false;
        setIsLayouting(false);
      }
    },
    [nodes, edges, setNodes, setEdges, reactFlowInstance, defaultDirection, nodePadding, layerSpacing, nodeSpacing]
  );

  return { applyLayout, isLayouting };
}

export default useAOPEGLayout;

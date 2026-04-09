/**
 * useAILayout — LLM-powered graph layout hook for GXE Visualizer.
 *
 * Sends the current graph (nodes + edges + measured DOM sizes + degree info)
 * to the backend AI Layout endpoint (Claude), receives calculated
 * node positions, and applies them to the ReactFlow canvas.
 *
 * IMPORTANT: The AI computes ONLY node positions.
 * Edge routing is handled by ReactFlow's built-in smoothstep algorithm.
 * This avoids the problem of LLM producing invalid polyline coordinates.
 *
 * Settings (model, temperature, system prompt) are loaded from
 * and saved to the Core namespace knowledge base.
 */

import { useState, useCallback, useRef } from 'react';
import { Node, Edge, ReactFlowInstance } from 'reactflow';
import { computeAILayout, loadAILayoutConfig, saveAILayoutConfig } from '../services/gxe.service';
import { detectClusters } from '../utils/graph-clustering';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AILayoutConfig {
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

export interface AILayoutMetadata {
  model: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  layoutTime: number;
  validationErrors: string[];
  overlapsFixed: boolean;
}

export interface UseAILayoutReturn {
  applyAILayout: (direction?: string) => Promise<void>;
  isAILayouting: boolean;
  aiLayoutError: string | null;
  lastMetadata: AILayoutMetadata | null;
  config: AILayoutConfig | null;
  loadConfig: () => Promise<AILayoutConfig | null>;
  saveConfig: (config: AILayoutConfig) => Promise<void>;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_NODE_WIDTH = 260;
const DEFAULT_NODE_HEIGHT = 130;

// ─── DOM measurement ─────────────────────────────────────────────────────────

function measureNodeSizes(nodes: Node[]): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of nodes) {
    const el = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      sizes.set(node.id, {
        width: Math.ceil(rect.width) || DEFAULT_NODE_WIDTH,
        height: Math.ceil(rect.height) || DEFAULT_NODE_HEIGHT,
      });
    } else {
      sizes.set(node.id, { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT });
    }
  }
  return sizes;
}

// ─── Compute canvas size based on graph complexity ───────────────────────────

function computeCanvasSize(nodeCount: number, edgeCount: number): { width: number; height: number } {
  // For N nodes, allocate roughly sqrt(N) * spacing per dimension
  // Each node needs ~300x200 cell with spacing
  const cellW = 350;
  const cellH = 250;
  const cols = Math.max(3, Math.ceil(Math.sqrt(nodeCount * 1.5)));
  const rows = Math.max(3, Math.ceil(nodeCount / cols));

  return {
    width: Math.max(1600, cols * cellW + 200),
    height: Math.max(1200, rows * cellH + 200),
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAILayout(
  nodes: Node[],
  edges: Edge[],
  setNodes: (updater: Node[] | ((nodes: Node[]) => Node[])) => void,
  setEdges: (updater: Edge[] | ((edges: Edge[]) => Edge[])) => void,
  reactFlowInstance: ReactFlowInstance | null,
  graphType?: string
): UseAILayoutReturn {
  const [isAILayouting, setIsAILayouting] = useState(false);
  const [aiLayoutError, setAILayoutError] = useState<string | null>(null);
  const [lastMetadata, setLastMetadata] = useState<AILayoutMetadata | null>(null);
  const [config, setConfig] = useState<AILayoutConfig | null>(null);
  const inProgress = useRef(false);

  // ── Load config from Core KB ──
  const loadConfig = useCallback(async (): Promise<AILayoutConfig | null> => {
    try {
      const cfg = await loadAILayoutConfig();
      if (cfg) setConfig(cfg as AILayoutConfig);
      return cfg as AILayoutConfig | null;
    } catch (err) {
      console.error('[useAILayout] Failed to load config:', err);
      return null;
    }
  }, []);

  // ── Save config to Core KB ──
  const saveConfigFn = useCallback(async (newConfig: AILayoutConfig): Promise<void> => {
    try {
      await saveAILayoutConfig(newConfig);
      setConfig(newConfig);
    } catch (err) {
      console.error('[useAILayout] Failed to save config:', err);
      throw err;
    }
  }, []);

  // ── Apply AI Layout ──
  const applyAILayout = useCallback(
    async (direction?: string) => {
      if (inProgress.current || nodes.length === 0) return;

      inProgress.current = true;
      setIsAILayouting(true);
      setAILayoutError(null);

      try {
        // 1. Measure DOM sizes
        const sizes = measureNodeSizes(nodes);

        // 2. Detect clusters for semantic grouping
        const { clusters } = detectClusters(nodes, edges, { minClusterSize: 2 });

        // 3. Compute canvas size based on graph complexity (NOT viewport!)
        const canvasSize = computeCanvasSize(nodes.length, edges.length);

        // 4. Detect entry/exit nodes (no incoming / no outgoing edges)
        const hasIncoming = new Set(edges.map(e => e.target));
        const hasOutgoing = new Set(edges.map(e => e.source));
        const entryNodes = nodes.filter(n => !hasIncoming.has(n.id)).map(n => n.id);
        const exitNodes = nodes.filter(n => !hasOutgoing.has(n.id)).map(n => n.id);

        // 5. Build request — AI computes ONLY node positions
        const request = {
          canvas: {
            width: canvasSize.width,
            height: canvasSize.height,
            padding: 50,
          },
          nodes: nodes.map(n => {
            const s = sizes.get(n.id) || { width: DEFAULT_NODE_WIDTH, height: DEFAULT_NODE_HEIGHT };
            return {
              id: n.id,
              label: (n.data as any)?.label || (n.data as any)?.name || n.id,
              width: s.width,
              height: s.height,
              cluster: clusters.get(n.id) || undefined,
              type: n.type || (n.data as any)?.kind || undefined,
            };
          }),
          edges: edges.map(e => ({
            id: e.id,
            source: e.source,
            target: e.target,
            label: (e.data as any)?.label || (e as any).label || undefined,
          })),
          hints: {
            preferredDirection: direction || 'TB',
            entryNodes: entryNodes.length > 0 ? entryNodes : undefined,
            exitNodes: exitNodes.length > 0 ? exitNodes : undefined,
            graphType: graphType || undefined,
          },
        };

        // 6. Call backend
        const result = await computeAILayout(request);

        if (!result.success) {
          throw new Error(result.error || 'AI Layout computation failed');
        }

        // 7. Apply node positions
        const positionMap = result.nodePositions || {};
        setNodes((currentNodes: Node[]) =>
          currentNodes.map(n => {
            const pos = positionMap[n.id];
            if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') return n;
            return {
              ...n,
              position: { x: Math.round(pos.x), y: Math.round(pos.y) },
            };
          })
        );

        // 8. Clear any stale elkRoute/aiRoute data from edges so ReactFlow
        //    uses its built-in routing from the new node positions
        setEdges((currentEdges: Edge[]) =>
          currentEdges.map(e => {
            if (!(e.data as any)?.elkRoute && !(e.data as any)?.aiRoute) return e;
            const { elkRoute, aiRoute, ...cleanData } = (e.data || {}) as any;
            return {
              ...e,
              data: cleanData,
            };
          })
        );

        // 9. Fit view after layout with slight delay for DOM update
        setTimeout(() => {
          reactFlowInstance?.fitView({ padding: 0.1, duration: 400 });
        }, 100);

        // 10. Store metadata
        setLastMetadata(result.metadata || null);

        console.log(
          `[useAILayout] Layout applied: ${nodes.length} nodes, ${edges.length} edges, ` +
          `${result.metadata?.layoutTime}ms, ${result.metadata?.tokensUsed} tokens`
        );
      } catch (err: any) {
        console.error('[useAILayout] Layout failed:', err);
        setAILayoutError(err.message || 'AI Layout failed');
      } finally {
        inProgress.current = false;
        setIsAILayouting(false);
      }
    },
    [nodes, edges, setNodes, setEdges, reactFlowInstance, graphType]
  );

  return {
    applyAILayout,
    isAILayouting,
    aiLayoutError,
    lastMetadata,
    config,
    loadConfig,
    saveConfig: saveConfigFn,
  };
}

export default useAILayout;

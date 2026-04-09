/**
 * GXE Execution Controller
 *
 * Phase 0: Foundation (Day 8)
 *
 * REST endpoints for graph validation and execution.
 * - POST /validate - Synchronous validation
 * - POST /execute - SSE streaming execution
 */

import { Router, Request, Response } from 'express';

import { validateGraph, ValidationResult } from '../compiler/dag-validator';
import { RawGraphNode, RawGraphEdge } from '../compiler/type-check-bridge';
import { getToolSpec } from '../compiler/tool-port-registry';

import { executeGraph, ValidatedGraph, WalkerResult } from './topological-walker';
import { HttpSSEEmitter } from './sse-emitter';
import { ServiceContainer, createMockServiceContainer } from './service-container';

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CONTAINER INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

// Use mock container for Phase 0 testing
// Replace with real services in production
let serviceContainer: ServiceContainer = createMockServiceContainer();

/**
 * Initialize with real services.
 */
export function initializeServiceContainer(container: ServiceContainer): void {
  serviceContainer = container;
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════════════════

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /validate - Synchronous graph validation
// ─────────────────────────────────────────────────────────────────────────────

router.post('/validate', (req: Request, res: Response) => {
  try {
    const { nodes, edges, params } = req.body;

    // Normalize from ReactFlow format
    const rawNodes = normalizeNodes(nodes || []);
    const rawEdges = normalizeEdges(edges || [], rawNodes);

    // Validate graph
    const result = validateGraph(rawNodes, rawEdges);

    // canExecute: Level 4 (type check) passed means we can execute
    const canExecute = result.passed || result.completedLevel >= 4;

    res.json({
      valid: result.passed,
      canExecute,
      completedLevel: result.completedLevel,
      errorCount: result.errors.length,
      warningCount: result.warnings.length,
      structural: result.structural,
      dag: result.dag,
      flow: result.flow,
      toolValidity: result.toolValidity,
      typeCheck: result.typeCheck,
      executionReadiness: result.executionReadiness,
      topologicalOrder: result.dag?.topologicalOrder || [],
      errors: result.errors,
      warnings: result.warnings,
      inferredToolIds: rawNodes.map(n => ({ id: n.id, toolId: n.toolId })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /execute - SSE streaming execution
// ─────────────────────────────────────────────────────────────────────────────

router.post('/execute', async (req: Request, res: Response) => {
  const { nodes, edges, params } = req.body;

  // 1. Normalize
  const rawNodes = normalizeNodes(nodes || []);
  const rawEdges = normalizeEdges(edges || [], rawNodes);

  // 2. Validate
  const validation = validateGraph(rawNodes, rawEdges);
  const canExecute = validation.passed || validation.completedLevel >= 4;

  if (!canExecute) {
    return res.status(400).json({
      error: 'Graph validation failed',
      validation: {
        valid: validation.passed,
        completedLevel: validation.completedLevel,
        errorCount: validation.errors.length,
        errors: validation.errors,
      },
    });
  }

  // 3. SSE setup
  const emitter = new HttpSSEEmitter(res);

  // 4. Handle client disconnect
  let aborted = false;
  req.on('close', () => {
    aborted = true;
    emitter.close();
  });

  // 5. Build validated graph for execution
  const validatedGraph: ValidatedGraph = {
    id: `exec-${Date.now()}`,
    nodes: rawNodes.map(n => ({
      id: n.id,
      toolId: n.toolId,
      toolLevel: 1,
      inputPorts: [],
      outputPorts: [],
      config: n.config || {},
      timeout: 30000,
      retryPolicy: { maxRetries: 2, backoff: 'exponential' as const },
    })),
    edges: rawEdges.map(e => ({
      source: e.source,
      target: e.target,
      typeCompatible: true,
    })),
    topologicalOrder: validation.dag?.topologicalOrder || rawNodes.map(n => n.id),
    params: params || {},
  };

  // 6. Execute
  try {
    if (aborted) {
      return;
    }

    await executeGraph(validatedGraph, emitter, serviceContainer);
  } catch (error) {
    if (!aborted) {
      const message = error instanceof Error ? error.message : String(error);
      emitter.emit({
        type: 'execution_failed',
        error: message,
      });
    }
  } finally {
    if (!aborted) {
      emitter.close();
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /status - Check service container health
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const health = await serviceContainer.healthCheck();
    const services: Record<string, { healthy: boolean; latencyMs?: number; error?: string }> = {};

    health.forEach((status, serviceId) => {
      services[serviceId] = {
        healthy: status.healthy,
        latencyMs: status.latencyMs,
        error: status.error,
      };
    });

    const allHealthy = Array.from(health.values()).every(h => h.healthy);

    res.json({
      status: allHealthy ? 'healthy' : 'degraded',
      services,
      registeredServices: serviceContainer.getRegisteredServices(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: message });
  }
});

export default router;

// ═══════════════════════════════════════════════════════════════════════════
// DATA NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize ReactFlow nodes to RawGraphNode format.
 */
function normalizeNodes(rfNodes: any[]): RawGraphNode[] {
  return rfNodes.map(n => ({
    id: n.id,
    toolId: n.data?.toolId || n.toolId || inferToolId(n.data || n),
    label: n.data?.label || n.label,
    config: n.data?.params || n.data?.config || n.config || {},
  }));
}

/**
 * Normalize ReactFlow edges to RawGraphEdge format.
 */
function normalizeEdges(rfEdges: any[], nodes: RawGraphNode[]): RawGraphEdge[] {
  return rfEdges.map(e => ({
    source: {
      nodeId: e.source,
      port: e.sourceHandle || inferOutputPort(nodes.find(n => n.id === e.source)),
    },
    target: {
      nodeId: e.target,
      port: e.targetHandle || inferInputPort(nodes.find(n => n.id === e.target)),
    },
  }));
}

/**
 * Infer toolId from node data (fallback for legacy graphs).
 */
function inferToolId(data: any): string {
  // First check if toolId is directly available
  if (data.toolId) return data.toolId;

  const label = (data.label || '').toLowerCase();
  const kind = (data.kind || '').toLowerCase();

  // Text processing
  if (label.includes('sanitiz') || label.includes('clean')) return 'text.sanitize';
  if (label.includes('chunk') || label.includes('split')) return 'text.chunk';
  if (label.includes('language') || label.includes('detect lang')) return 'text.detect_language';
  if (label.includes('normaliz')) return 'text.normalize';

  // Extraction
  if (label.includes('entit') || label.includes('extract entit')) return 'extraction.entities';
  if (label.includes('relat') || label.includes('extract relat')) return 'extraction.relations';

  // Vector operations
  if (label.includes('embed')) return 'vector.embed';
  if (label.includes('search') || label.includes('query vector')) return 'vector.search';
  if (label.includes('write') || label.includes('store') || label.includes('upsert')) return 'vector.write';

  // Graph operations
  if (label.includes('query') && (label.includes('graph') || label.includes('cypher'))) return 'graph.query';
  if (label.includes('create node') || label.includes('add node')) return 'graph.create_node';
  if (label.includes('create edge') || label.includes('add edge') || label.includes('create rel')) return 'graph.create_edge';

  // AI operations
  if (label.includes('classif')) return 'ai.classify';
  if (label.includes('generat') || label.includes('llm') || label.includes('ai ')) return 'ai.generate';

  // Control flow
  if (label.includes('condition') || label.includes('if ') || label.includes('branch')) return 'control.condition';
  if (label.includes('parallel') || label.includes('fork')) return 'control.parallel';
  if (label.includes('switch')) return 'control.switch';
  if (label.includes('loop') || label.includes('repeat')) return 'control.loop';

  // Kind-based fallback
  if (kind === 'ai') return 'ai.generate';
  if (kind === 'input') return 'text.sanitize';
  if (kind === 'output') return 'ai.generate';
  if (kind === 'condition') return 'control.condition';

  return 'unknown';
}

/**
 * Infer output port name for a node.
 */
function inferOutputPort(node: RawGraphNode | undefined): string {
  if (!node) return 'output';

  const spec = getToolSpec(node.toolId);
  if (spec && spec.outputPorts.length > 0) {
    return spec.outputPorts[0].name;
  }

  // Fallback based on toolId
  switch (node.toolId) {
    case 'text.sanitize': return 'clean_text';
    case 'text.chunk': return 'chunks';
    case 'text.detect_language': return 'language';
    case 'text.normalize': return 'normalized_text';
    case 'extraction.entities': return 'entities';
    case 'extraction.relations': return 'relations';
    case 'vector.embed': return 'embedding';
    case 'vector.search': return 'results';
    case 'vector.write': return 'point_id';
    case 'graph.query': return 'records';
    case 'graph.create_node': return 'node';
    case 'graph.create_edge': return 'edge';
    case 'ai.generate': return 'text';
    case 'ai.classify': return 'category';
    case 'control.condition': return 'result';
    case 'control.parallel': return 'branch_count';
    default: return 'output';
  }
}

/**
 * Infer input port name for a node.
 */
function inferInputPort(node: RawGraphNode | undefined): string {
  if (!node) return 'input';

  const spec = getToolSpec(node.toolId);
  if (spec && spec.inputPorts.length > 0) {
    // Find first required port without default
    const primary = spec.inputPorts.find(p => p.required && p.default === undefined);
    return primary?.name || spec.inputPorts[0].name;
  }

  // Fallback based on toolId
  switch (node.toolId) {
    case 'text.sanitize': return 'raw_text';
    case 'text.chunk': return 'text';
    case 'text.detect_language': return 'text';
    case 'text.normalize': return 'text';
    case 'extraction.entities': return 'text';
    case 'extraction.relations': return 'text';
    case 'vector.embed': return 'text';
    case 'vector.search': return 'query_embedding';
    case 'vector.write': return 'embedding';
    case 'graph.query': return 'cypher';
    case 'graph.create_node': return 'label';
    case 'graph.create_edge': return 'source_id';
    case 'ai.generate': return 'prompt';
    case 'ai.classify': return 'text';
    case 'control.condition': return 'value';
    case 'control.parallel': return 'input';
    default: return 'input';
  }
}

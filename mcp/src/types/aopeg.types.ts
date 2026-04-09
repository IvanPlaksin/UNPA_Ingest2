/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG UI TYPES
 * Types for React Flow graph editor
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { Node, Edge } from 'reactflow';

// ────────────────────────────────────────────────────────────────────────────
// NODE DATA (extends React Flow Node)
// ────────────────────────────────────────────────────────────────────────────

export interface AOPEGNodeData {
  /** Executor type (e.g., "ai.llm_generate", "common.http_request") */
  executorType: string;

  /** Display name */
  displayName: string;

  /** Description */
  description: string;

  /** Domain (for coloring) */
  domain: string;

  /** Parameters passed to executor */
  parameters: Record<string, unknown>;

  /** Timeout in ms */
  timeout: number;

  /** Quality threshold (optional) */
  qualityThreshold?: number;

  /** Retry policy */
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
  };

  /** Fallback node ID */
  fallbackNodeId?: string;

  // ──────────────────────────────────────────────────────────────────────────
  // Immutable Graph (optional - for bi-temporal versioning)
  // ──────────────────────────────────────────────────────────────────────────

  /** Entity ID in the immutable graph (different from React Flow node id) */
  entityId?: string;

  /** Current version ID */
  versionId?: string;

  /** Version sequence number */
  sequenceNumber?: number;

  // ──────────────────────────────────────────────────────────────────────────
  // UI State (runtime)
  // ──────────────────────────────────────────────────────────────────────────

  /** Is this node currently executing? */
  isRunning?: boolean;

  /** Has this node completed? */
  isCompleted?: boolean;

  /** Has this node failed? */
  isFailed?: boolean;

  /** Is this node being retried? */
  isRetrying?: boolean;

  /** Execution metrics (after completion) */
  metrics?: {
    duration: number;
    qualityScore?: number;
    itemsProcessed?: number;
    retryCount?: number;
  };

  /** Error message if failed */
  errorMessage?: string;
}

export type AOPEGNode = Node<AOPEGNodeData>;

// ────────────────────────────────────────────────────────────────────────────
// EDGE DATA (extends React Flow Edge)
// ────────────────────────────────────────────────────────────────────────────

export interface AOPEGEdgeData {
  /** Condition for this edge */
  condition?: {
    type: string;
    config: Record<string, unknown>;
  } | null;

  /** Priority (lower = higher priority) */
  priority?: number;

  /** Data mapping configuration */
  dataMapping?: Array<{
    sourceField: string;
    targetField: string;
    transformer?: {
      type: string;
      config: Record<string, unknown>;
    };
  }>;

  /** Edge label */
  label?: string;

  // ──────────────────────────────────────────────────────────────────────────
  // Immutable Graph (optional - for bi-temporal versioning)
  // ──────────────────────────────────────────────────────────────────────────

  /** Edge ID in the immutable graph */
  edgeId?: string;

  /** Current version ID */
  versionId?: string;

  // ──────────────────────────────────────────────────────────────────────────
  // UI State (runtime)
  // ──────────────────────────────────────────────────────────────────────────

  /** Was this edge taken during execution? */
  wasTaken?: boolean;

  /** Is this edge currently being evaluated? */
  isEvaluating?: boolean;

  /** ELK-computed bend points for orthogonal routing */
  elkRoute?: Array<{ x: number; y: number }>;
}

export type AOPEGEdge = Edge<AOPEGEdgeData>;

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR CATALOG (from registry)
// ────────────────────────────────────────────────────────────────────────────

export interface ExecutorInfo {
  type: string;
  displayName: string;
  description: string;
  domain: string;
  parameterSchema: Record<string, unknown>;
  defaultParameters: Record<string, unknown>;
}

export interface ExecutorCatalog {
  executors: ExecutorInfo[];
  byDomain: Record<string, ExecutorInfo[]>;
  domains: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH EDITOR STATE
// ────────────────────────────────────────────────────────────────────────────

export interface GraphEditorState {
  /** Graph ID (null for new graph) */
  graphId: string | null;

  /** Graph metadata */
  name: string;
  description: string;
  domain: string;
  tags: string[];

  /** React Flow state */
  nodes: AOPEGNode[];
  edges: AOPEGEdge[];

  /** Selection state */
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  /** Edit state */
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: Date | null;

  /** Execution state */
  isExecuting: boolean;
  executionId: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION EVENTS (from SSE)
// ────────────────────────────────────────────────────────────────────────────

export type ExecutionEventType =
  | 'node:started'
  | 'node:completed'
  | 'node:failed'
  | 'node:retry'
  | 'execution:completed'
  | 'execution:failed'
  | 'execution:cancelled';

export interface ExecutionEvent {
  type: ExecutionEventType;
  executionId: string;
  nodeId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

// ────────────────────────────────────────────────────────────────────────────
// API RESPONSE TYPES
// ────────────────────────────────────────────────────────────────────────────

export interface GraphResponse {
  id: string;
  name: string;
  description?: string;
  domain: string;
  version: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  nodes: Array<{
    id: string;
    name: string;
    description?: string;
    executorType: string;
    parameters: Record<string, unknown>;
    dataMapping?: unknown;
    retryPolicy?: {
      maxRetries: number;
      backoffMs: number;
      backoffMultiplier: number;
    };
    fallbackNodeId?: string;
    timeout?: number;
    position?: { x: number; y: number };
    metadata?: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    condition?: { type: string; config: Record<string, unknown> };
    priority?: number;
    dataTransform?: unknown;
    metadata?: Record<string, unknown>;
  }>;
  entryNodeId: string;
  exitNodeId?: string;
  defaultParameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  executionStats?: {
    totalExecutions: number;
    avgDuration: number;
    avgQualityScore: number;
    successRate: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecutionResponse {
  id: string;
  graphId: string;
  graphVersion: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  input: unknown;
  output: unknown;
  variables: Record<string, unknown>;
  pathTaken: string[];
  nodeExecutions: Array<{
    nodeId: string;
    executorType: string;
    startTime: string;
    endTime: string;
    duration: number;
    success: boolean;
    qualityScore?: number;
    error?: string;
    metrics?: Record<string, unknown>;
    retryCount?: number;
  }>;
  error?: string;
  startTime: string;
  endTime?: string;
  totalDuration?: number;
  finalQualityScore?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN COLORS (Dark Theme - GitHub Style)
// ────────────────────────────────────────────────────────────────────────────

export const DOMAIN_COLORS: Record<string, {
  bg: string;
  border: string;
  text: string;
  accent: string;
  iconBg: string;
  glow: string;
}> = {
  common: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-slate-500',
    text: 'text-slate-400',
    accent: '#6b7280',
    iconBg: 'bg-gradient-to-br from-slate-500 to-slate-600',
    glow: 'shadow-slate-500/20'
  },
  ai: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-purple-500',
    text: 'text-purple-400',
    accent: '#a855f7',
    iconBg: 'bg-gradient-to-br from-purple-500 to-purple-600',
    glow: 'shadow-purple-500/20'
  },
  ingestion: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-blue-500',
    text: 'text-blue-400',
    accent: '#3b82f6',
    iconBg: 'bg-gradient-to-br from-blue-500 to-blue-600',
    glow: 'shadow-blue-500/20'
  },
  rag: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-green-500',
    text: 'text-green-400',
    accent: '#22c55e',
    iconBg: 'bg-gradient-to-br from-green-500 to-green-600',
    glow: 'shadow-green-500/20'
  },
  validation: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-amber-500',
    text: 'text-amber-400',
    accent: '#f59e0b',
    iconBg: 'bg-gradient-to-br from-amber-500 to-amber-600',
    glow: 'shadow-amber-500/20'
  },
  storage: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-orange-500',
    text: 'text-orange-400',
    accent: '#f97316',
    iconBg: 'bg-gradient-to-br from-orange-500 to-orange-600',
    glow: 'shadow-orange-500/20'
  },
  search: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-cyan-500',
    text: 'text-cyan-400',
    accent: '#06b6d4',
    iconBg: 'bg-gradient-to-br from-cyan-500 to-cyan-600',
    glow: 'shadow-cyan-500/20'
  },
  cosmos: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-pink-500',
    text: 'text-pink-400',
    accent: '#ec4899',
    iconBg: 'bg-gradient-to-br from-pink-500 to-pink-600',
    glow: 'shadow-pink-500/20'
  },
  red: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-red-500',
    text: 'text-red-400',
    accent: '#ef4444',
    iconBg: 'bg-gradient-to-br from-red-500 to-red-600',
    glow: 'shadow-red-500/20'
  },
  workflow: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-violet-500',
    text: 'text-violet-400',
    accent: '#8b5cf6',
    iconBg: 'bg-gradient-to-br from-violet-500 to-violet-600',
    glow: 'shadow-violet-500/20'
  },
  integration: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-teal-500',
    text: 'text-teal-400',
    accent: '#14b8a6',
    iconBg: 'bg-gradient-to-br from-teal-500 to-teal-600',
    glow: 'shadow-teal-500/20'
  },
  default: {
    bg: 'bg-[#21262d]',
    border: 'border-l-4 border-l-gray-500',
    text: 'text-gray-400',
    accent: '#6b7280',
    iconBg: 'bg-gradient-to-br from-gray-500 to-gray-600',
    glow: 'shadow-gray-500/20'
  },
};

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN ICONS
// ────────────────────────────────────────────────────────────────────────────

export const DOMAIN_ICONS: Record<string, string> = {
  common: 'Wrench',
  ai: 'Brain',
  ingestion: 'Download',
  rag: 'Search',
  validation: 'CheckCircle',
  storage: 'Database',
  workflow: 'GitBranch',
  integration: 'Plug',
  default: 'Box',
};

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert API graph response to React Flow nodes/edges
 */
export function graphResponseToReactFlow(graph: GraphResponse): {
  nodes: AOPEGNode[];
  edges: AOPEGEdge[];
} {
  const nodes: AOPEGNode[] = graph.nodes.map((node, index) => ({
    id: node.id,
    type: 'aopegNode',
    position: node.position || { x: 100 + (index % 3) * 300, y: 100 + Math.floor(index / 3) * 200 },
    data: {
      executorType: node.executorType,
      displayName: node.name,
      description: node.description || '',
      domain: node.executorType.split('.')[0] || 'common',
      parameters: node.parameters || {},
      timeout: node.timeout || 30000,
      qualityThreshold: undefined,
      retryPolicy: node.retryPolicy || {
        maxRetries: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
      },
      fallbackNodeId: node.fallbackNodeId,
    },
  }));

  const edges: AOPEGEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: 'aopegEdge',
    data: {
      condition: edge.condition || null,
      priority: edge.priority || 1,
      dataMapping: [],
      label: edge.condition?.type !== 'always' ? edge.condition?.type || '' : '',
    },
  }));

  return { nodes, edges };
}

/**
 * Convert React Flow nodes/edges back to API format
 */
export function reactFlowToGraphRequest(
  nodes: AOPEGNode[],
  edges: AOPEGEdge[],
  metadata: {
    id?: string;
    name: string;
    description?: string;
    domain: string;
  }
): Partial<GraphResponse> {
  return {
    id: metadata.id,
    name: metadata.name,
    description: metadata.description,
    domain: metadata.domain,
    nodes: nodes.map((node) => ({
      id: node.id,
      name: node.data.displayName,
      description: node.data.description,
      executorType: node.data.executorType,
      parameters: node.data.parameters,
      retryPolicy: node.data.retryPolicy,
      fallbackNodeId: node.data.fallbackNodeId,
      timeout: node.data.timeout,
      position: node.position,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      condition: edge.data?.condition || undefined,
      priority: edge.data?.priority,
    })),
    entryNodeId: nodes[0]?.id || '',
  };
}

/**
 * Create default node data for a new executor
 */
export function createDefaultNodeData(executor: ExecutorInfo): AOPEGNodeData {
  return {
    executorType: executor.type,
    displayName: executor.displayName,
    description: executor.description,
    domain: executor.domain,
    parameters: executor.defaultParameters || {},
    timeout: 30000,
    retryPolicy: {
      maxRetries: 3,
      backoffMs: 1000,
      backoffMultiplier: 2,
    },
  };
}

/**
 * Create default edge data
 */
export function createDefaultEdgeData(): AOPEGEdgeData {
  return {
    condition: null,
    priority: 1,
    dataMapping: [],
    label: '',
  };
}

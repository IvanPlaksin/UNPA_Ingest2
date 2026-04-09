/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG UNIVERSAL CORE TYPES
 * Domain-agnostic execution graph engine
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION CONTEXT - Passed through entire execution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Universal execution context - carries state through graph execution
 * Domain plugins can extend this with their own data
 */
export interface ExecutionContext {
  /** Unique execution ID */
  executionId: string;

  /** Graph being executed */
  graphId: string;

  /** Current input for this node */
  input: unknown;

  /** Outputs from all previously executed nodes */
  nodeOutputs: Map<string, unknown>;

  /** Shared state accessible by all nodes */
  sharedState: Map<string, unknown>;

  /** Execution-level metadata */
  metadata: Record<string, unknown>;

  /** Timestamp when execution started */
  startedAt: Date;

  /** Optional parent context (for sub-graph execution) */
  parentContext?: ExecutionContext;

  /** Variables resolved from graph parameters */
  variables: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// NODE EXECUTOR INTERFACE - Implemented by plugins
// ────────────────────────────────────────────────────────────────────────────

/**
 * Result returned by any node executor
 */
export interface NodeExecutionResult {
  /** Whether execution succeeded */
  success: boolean;

  /** Output data (passed to next nodes) */
  output: unknown;

  /** Execution metadata (for metrics/debugging) */
  metadata: Record<string, unknown>;

  /** Quality score 0-1 (optional, for quality gates) */
  qualityScore?: number;

  /** Errors if any */
  errors: Array<{
    code: string;
    message: string;
    recoverable: boolean;
  }>;

  /** Metrics for this execution */
  metrics?: {
    itemsProcessed?: number;
    itemsSucceeded?: number;
    itemsFailed?: number;
    customMetrics?: Record<string, number>;
  };
}

/**
 * Universal node executor interface
 * ALL executors (from any domain) must implement this
 */
export interface INodeExecutor {
  /**
   * Unique type identifier for this executor
   * Used to match graph node types to executors
   * Convention: "domain.action" e.g., "ingestion.sanitize", "rag.retrieve"
   */
  readonly type: string;

  /**
   * Human-readable name
   */
  readonly displayName: string;

  /**
   * Description of what this executor does
   */
  readonly description: string;

  /**
   * Domain/category this executor belongs to
   */
  readonly domain: string;

  /**
   * JSON Schema for parameters this executor accepts
   */
  readonly parameterSchema: Record<string, unknown>;

  /**
   * Execute the node
   */
  execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult>;

  /**
   * Validate parameters before execution
   */
  validateParameters(parameters: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  };

  /**
   * Get default parameters
   */
  getDefaultParameters(): Record<string, unknown>;

  /**
   * Optional: cleanup after execution
   */
  cleanup?(context: ExecutionContext): Promise<void>;
}

// ────────────────────────────────────────────────────────────────────────────
// CONDITION EVALUATOR - For edge conditions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Edge condition definition
 */
export interface EdgeCondition {
  /** Condition type (matched to IConditionEvaluator) */
  type: string;

  /** Condition-specific configuration */
  config: Record<string, unknown>;
}

/**
 * Condition evaluator interface
 * Plugins can register custom condition types
 */
export interface IConditionEvaluator {
  /**
   * Condition type identifier
   */
  readonly type: string;

  /**
   * Evaluate condition
   */
  evaluate(
    condition: EdgeCondition,
    nodeResult: NodeExecutionResult,
    context: ExecutionContext
  ): Promise<boolean>;
}

// ────────────────────────────────────────────────────────────────────────────
// DATA TRANSFORMER - For data mapping between nodes
// ────────────────────────────────────────────────────────────────────────────

/**
 * Data mapping definition (on edges)
 */
export interface DataMapping {
  /** Source field path (JSONPath-like) */
  sourceField: string;

  /** Target field path */
  targetField: string;

  /** Optional transformer */
  transformer?: {
    type: string;
    config: Record<string, unknown>;
  };
}

/**
 * Data transformer interface
 * Plugins can register custom transformers
 */
export interface IDataTransformer {
  /**
   * Transformer type identifier
   */
  readonly type: string;

  /**
   * Transform data
   */
  transform(
    input: unknown,
    config: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<unknown>;
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH DEFINITION - Domain-agnostic structure
// ────────────────────────────────────────────────────────────────────────────

/**
 * Graph node definition
 * Note: executorType is just a string - core doesn't interpret it
 */
export interface GraphNode {
  /** Unique node ID within graph */
  id: string;

  /**
   * Executor type to use (matched via registry)
   * Examples: "ingestion.sanitize", "rag.retrieve", "agent.plan"
   */
  executorType: string;

  /** Parameters passed to executor */
  parameters: Record<string, unknown>;

  /** Display name for UI */
  displayName: string;

  /** Description */
  description: string;

  /** Timeout in ms */
  timeout: number;

  /** Retry policy */
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
    backoffMultiplier: number;
    retryableErrors?: string[];
  };

  /** Quality threshold (0-1, optional) */
  qualityThreshold?: number;

  /** Fallback node ID if this fails */
  fallbackNodeId?: string;

  /** UI position */
  position: { x: number; y: number };

  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Graph edge definition
 */
export interface GraphEdge {
  /** Unique edge ID */
  id: string;

  /** Source node ID */
  sourceNodeId: string;

  /** Target node ID */
  targetNodeId: string;

  /** Condition for this edge (null = always) */
  condition: EdgeCondition | null;

  /** Priority (for multiple outgoing edges) */
  priority: number;

  /** Data mapping configuration */
  dataMapping: DataMapping[];

  /** Edge label for UI */
  label: string;
}

/**
 * Graph variable definition
 */
export interface GraphVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  defaultValue?: unknown;
  required: boolean;
  description?: string;
}

/**
 * Graph status enum
 */
export type GraphStatus = 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'ARCHIVED';

/**
 * Complete graph definition
 */
export interface ExecutionGraph {
  /** Unique graph ID */
  id: string;

  /** Version number */
  version: number;

  /** Graph name */
  name: string;

  /** Description */
  description: string;

  /**
   * Domain hint (for UI categorization, not used by core)
   * Examples: "ingestion", "rag", "agent", "validation"
   */
  domain: string;

  /** Tags for categorization */
  tags: string[];

  /** All nodes */
  nodes: GraphNode[];

  /** All edges */
  edges: GraphEdge[];

  /** Entry node ID */
  entryNodeId: string;

  /** Exit node IDs */
  exitNodeIds: string[];

  /** Graph-level parameters (can be overridden at execution time) */
  defaultParameters: Record<string, unknown>;

  /** Graph-level variables (resolved before execution) */
  variables: GraphVariable[];

  /** Status */
  status: GraphStatus;

  /** Who/what created this graph */
  generatedBy: 'AI' | 'HUMAN' | 'HYBRID';

  /** Execution statistics (updated after executions) */
  executionStats?: {
    totalExecutions: number;
    avgDuration: number;
    avgQualityScore: number;
    successRate: number;
  };

  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION RECORD
// ────────────────────────────────────────────────────────────────────────────

/**
 * Execution status enum
 */
export type ExecutionStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/**
 * Per-node execution metrics
 */
export interface NodeExecutionMetrics {
  nodeId: string;
  executorType: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  success: boolean;
  qualityScore?: number;
  error?: string;
  metrics?: Record<string, number>;
  retryCount: number;
}

/**
 * Complete execution record
 */
export interface Execution {
  id: string;
  graphId: string;
  graphVersion: number;
  status: ExecutionStatus;

  /** Input provided at execution start */
  input: unknown;

  /** Variables provided at execution start */
  variables: Record<string, unknown>;

  /** Final output */
  output: unknown;

  /** Path taken through graph */
  pathTaken: string[];

  /** Per-node metrics */
  nodeExecutions: NodeExecutionMetrics[];

  /** Timing */
  startTime: Date;
  endTime?: Date;
  totalDuration?: number;

  /** Final quality score */
  finalQualityScore?: number;

  /** Error if failed */
  error?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// HELPER TYPES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create execution context factory
 */
export function createExecutionContext(
  executionId: string,
  graphId: string,
  input: unknown,
  variables: Record<string, unknown> = {}
): ExecutionContext {
  return {
    executionId,
    graphId,
    input,
    nodeOutputs: new Map(),
    sharedState: new Map(),
    metadata: {},
    startedAt: new Date(),
    variables,
  };
}

/**
 * Create successful node result
 */
export function createSuccessResult(
  output: unknown,
  metadata: Record<string, unknown> = {},
  qualityScore?: number
): NodeExecutionResult {
  return {
    success: true,
    output,
    metadata,
    qualityScore,
    errors: [],
  };
}

/**
 * Create failed node result
 */
export function createErrorResult(
  code: string,
  message: string,
  recoverable: boolean = false
): NodeExecutionResult {
  return {
    success: false,
    output: null,
    metadata: {},
    errors: [{ code, message, recoverable }],
  };
}

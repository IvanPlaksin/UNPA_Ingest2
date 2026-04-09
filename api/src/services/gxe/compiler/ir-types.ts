/**
 * GXE Graph Compiler - Intermediate Representation Types
 *
 * Phase 0: Foundation (Scaffolding for Phase 1)
 *
 * These types define the three intermediate representations (IRs)
 * used in the multi-pass graph compilation pipeline:
 *
 * Pass 1: Text → IntentSpec (what the user wants)
 * Pass 2: IntentSpec → ProcessGraph (abstract business flow)
 * Pass 3: ProcessGraph → ExecutionPlan (concrete tool bindings)
 * Pass 4: ExecutionPlan → Executable DAG (ReactFlow + execution metadata)
 */

import { PortType, PortDefinition, AdapterId } from './compiler-types';

// ═══════════════════════════════════════════════════════════════════════════
// PASS 1 OUTPUT: INTENT SPECIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Goal type classification for the user's intent.
 */
export type GoalType =
  | 'process'        // Business process automation
  | 'pipeline'       // Data processing pipeline
  | 'analysis'       // Analysis/investigation task
  | 'integration'    // System integration
  | 'transformation'; // Data transformation

/**
 * Actor type in a business process.
 */
export type ActorType = 'human' | 'system' | 'external_service';

/**
 * Constraint type for the process.
 */
export type ConstraintType =
  | 'ordering'    // Steps must happen in order
  | 'condition'   // Conditional execution
  | 'timeout'     // Time limit
  | 'retry'       // Retry policy
  | 'security';   // Security requirement

/**
 * Constraint severity.
 */
export type ConstraintSeverity = 'must' | 'should' | 'nice_to_have';

/**
 * Knowledge layer in the system.
 */
export type KnowledgeLayer = 'strategic' | 'business' | 'code';

/**
 * Complexity level of the task.
 */
export type ComplexityLevel = 'simple' | 'moderate' | 'complex' | 'enterprise';

/**
 * Data flow direction.
 */
export type DataFlow = 'input' | 'output' | 'intermediate';

/**
 * Actor in the business process.
 */
export interface Actor {
  /** Unique identifier for the actor */
  id: string;

  /** Type of actor */
  type: ActorType;

  /** Role in the process (e.g., "Initiator", "Approver") */
  role: string;
}

/**
 * Constraint on the process.
 */
export interface Constraint {
  /** Type of constraint */
  type: ConstraintType;

  /** Human-readable description */
  description: string;

  /** How important this constraint is */
  severity: ConstraintSeverity;
}

/**
 * Domain classification.
 */
export interface DomainClassification {
  /** Primary domain (e.g., "hr", "finance", "it_operations") */
  primary: string;

  /** UN systems involved (e.g., ["IMIS", "Umoja"]) */
  unSystems: string[];

  /** Knowledge layer */
  knowledgeLayer: KnowledgeLayer;
}

/**
 * Complexity assessment.
 */
export interface ComplexityAssessment {
  /** Overall complexity level */
  level: ComplexityLevel;

  /** Estimated number of nodes in the graph */
  estimatedNodes: number;

  /** Whether the process has conditional logic */
  hasConditionalLogic: boolean;

  /** Whether the process has parallel execution paths */
  hasParallelPaths: boolean;

  /** Whether external integrations are needed */
  hasExternalIntegrations: boolean;

  /** Whether human-in-the-loop is required */
  requiresHumanInLoop: boolean;

  /** Recommended decomposition depth */
  decompositionDepth: number;
}

/**
 * Data entity identified in the task.
 */
export interface DataEntity {
  /** Name of the entity */
  name: string;

  /** Type of entity (e.g., "document", "status_flag", "date_range") */
  type: string;

  /** Flow direction */
  flow: DataFlow;
}

/**
 * IntentSpec - Output of Pass 1 (Analysis)
 *
 * Captures what the user wants to achieve without specifying how.
 * This is a structured representation of the user's natural language input.
 */
export interface IntentSpec {
  /** Unique identifier for this intent */
  id: string;

  /** Original user input text */
  originalText: string;

  /** Extracted goal description */
  goal: string;

  /** Classification of the goal type */
  goalType: GoalType;

  /** Actors involved in the process */
  actors: Actor[];

  /** Constraints on the process */
  constraints: Constraint[];

  /** Domain classification */
  domain: DomainClassification;

  /** Complexity assessment */
  complexity: ComplexityAssessment;

  /** Data entities extracted from the text */
  dataEntities: DataEntity[];

  /** Timestamp of creation */
  createdAt: string;

  /** Model used for analysis */
  analyzedBy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PASS 2 OUTPUT: PROCESS GRAPH
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type of step in the process graph.
 */
export type ProcessStepType =
  | 'action'     // Do something
  | 'decision'   // Make a choice
  | 'fork'       // Split into parallel branches
  | 'join'       // Merge parallel branches
  | 'start'      // Entry point
  | 'end'        // Exit point
  | 'subprocess'; // Needs further decomposition

/**
 * Estimated complexity of a single step.
 */
export type StepComplexity = 'atomic' | 'composite';

/**
 * A single step in the abstract process.
 */
export interface ProcessStep {
  /** Unique identifier for this step */
  id: string;

  /** Human-readable label */
  label: string;

  /** This is abstract, not bound to a tool yet */
  abstract: true;

  /** WHY this step exists (business purpose) */
  purpose: string;

  /** What data this step needs */
  inputData: string[];

  /** What data this step produces */
  outputData: string[];

  /** Type of step */
  type: ProcessStepType;

  /** Whether this can be directly executed or needs decomposition */
  isLeaf: boolean;

  /** Estimated complexity */
  estimatedComplexity: StepComplexity;

  /** Matched pattern from PatternLibrary (if any) */
  matchedPattern?: string;

  /** Sub-graph for composite steps (populated in Pass 4) */
  subGraph?: ExecutableDAG;
}

/**
 * Flow connection between steps.
 */
export interface ProcessFlow {
  /** Source step ID */
  from: string;

  /** Target step ID */
  to: string;

  /** Condition for this flow (e.g., "approved == true") */
  condition?: string;

  /** Label for conditional edges (e.g., "Yes", "No") */
  label?: string;
}

/**
 * Structural validation results for the process graph.
 */
export interface ProcessGraphValidation {
  /** Whether the graph is a valid DAG */
  isDAG: boolean;

  /** Whether there are unreachable nodes */
  hasUnreachableNodes: boolean;

  /** Whether all paths reach the end */
  allPathsReachEnd: boolean;

  /** List of orphan node IDs */
  orphanNodes: string[];

  /** Validation warnings */
  warnings: string[];
}

/**
 * ProcessGraph - Output of Pass 2 (Design)
 *
 * Abstract representation of the business process as a graph of steps.
 * Steps are NOT bound to specific tools - they describe WHAT to do, not HOW.
 */
export interface ProcessGraph {
  /** Unique identifier */
  id: string;

  /** Back-reference to the intent */
  intentId: string;

  /** Reference to the full IntentSpec */
  intent: IntentSpec;

  /** Steps in the process */
  steps: ProcessStep[];

  /** Flow connections between steps */
  flows: ProcessFlow[];

  /** Structural validation results */
  validation: ProcessGraphValidation;

  /** Timestamp of creation */
  createdAt: string;

  /** Model used for design */
  designedBy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PASS 3 OUTPUT: EXECUTION PLAN
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Input port binding in an execution node.
 */
export interface InputPortBinding {
  /** Port name from tool spec */
  name: string;

  /** Port type */
  type: PortType;

  /** Source: "nodeId:portName" or "__params:paramName" */
  source: string;

  /** Whether this port is required */
  required: boolean;
}

/**
 * Output port binding in an execution node.
 */
export interface OutputPortBinding {
  /** Port name from tool spec */
  name: string;

  /** Port type */
  type: PortType;

  /** Nodes that consume this output: ["nodeId:portName", ...] */
  consumers: string[];
}

/**
 * A concrete execution node with tool binding.
 */
export interface ExecutionNode {
  /** Unique identifier */
  id: string;

  /** Reference to ProcessGraph step (if applicable) */
  stepRef?: string;

  /** Concrete tool ID (e.g., "text.sanitize", "vector.embed") */
  toolId: string;

  /** Tool hierarchy level */
  toolLevel: 1 | 2 | 3 | 4;

  /** Input ports with their sources */
  inputPorts: InputPortBinding[];

  /** Output ports with their consumers */
  outputPorts: OutputPortBinding[];

  /** Tool-specific configuration */
  config: Record<string, unknown>;

  /** Execution timeout in ms */
  timeout: number;

  /** Retry policy */
  retryPolicy: {
    maxRetries: number;
    backoff: 'linear' | 'exponential';
  };

  /** Whether this node was auto-inserted (e.g., adapter node) */
  isAutoInserted?: boolean;
}

/**
 * Edge in the execution plan.
 */
export interface ExecutionEdge {
  /** Source node and port */
  source: {
    nodeId: string;
    port: string;
  };

  /** Target node and port */
  target: {
    nodeId: string;
    port: string;
  };

  /** Whether types are compatible */
  typeCompatible: boolean;

  /** Adapter to apply on this edge (if any) */
  adapter?: AdapterId;

  /** For list adapters: the inner adapter */
  innerAdapter?: AdapterId;
}

/**
 * Parameter specification for user input.
 */
export interface ParamSpec {
  /** Input type */
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select';

  /** Display label */
  label: string;

  /** Placeholder text */
  placeholder?: string;

  /** Options for select type */
  options?: string[];

  /** Default value */
  default?: unknown;

  /** Whether required */
  required: boolean;
}

/**
 * Type check result summary.
 */
export interface ExecutionPlanTypeCheck {
  /** Whether all checks passed */
  passed: boolean;

  /** Number of errors */
  errorCount: number;

  /** Number of warnings */
  warningCount: number;

  /** Number of auto-inserted adapters */
  autoInsertedAdapters: number;

  /** Error details (if any) */
  errors?: Array<{
    nodeId: string;
    port: string;
    message: string;
  }>;
}

/**
 * ExecutionPlan - Output of Pass 3 (Resolution)
 *
 * Concrete execution plan with tool bindings and type-checked edges.
 * This is ready to be transformed into an executable DAG.
 */
export interface ExecutionPlan {
  /** Unique identifier */
  id: string;

  /** Back-reference to process graph */
  processGraphId: string;

  /** Reference to the full ProcessGraph */
  processGraph: ProcessGraph;

  /** Execution nodes with tool bindings */
  nodes: ExecutionNode[];

  /** Type-checked edges */
  edges: ExecutionEdge[];

  /** Required user parameters */
  requiredParams: Record<string, ParamSpec>;

  /** Type check results */
  typeCheck: ExecutionPlanTypeCheck;

  /** Timestamp of creation */
  createdAt: string;

  /** Model used for resolution */
  resolvedBy?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PASS 4 OUTPUT: EXECUTABLE DAG
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Node status during execution.
 */
export type NodeExecutionStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/**
 * Node kind for visualization.
 */
export type NodeKind =
  | 'input'
  | 'output'
  | 'executor'
  | 'ai'
  | 'business'
  | 'actor'
  | 'condition';

/**
 * Node data for ReactFlow rendering.
 */
export interface DAGNodeData {
  /** Display label */
  label: string;

  /** Visual kind */
  kind: NodeKind;

  /** Description */
  description: string;

  /** Bound tool ID */
  toolId: string;

  /** Tool level */
  toolLevel: 1 | 2 | 3 | 4;

  /** Input port definitions */
  inputPorts: PortDefinition[];

  /** Output port definitions */
  outputPorts: PortDefinition[];

  /** Tool configuration */
  config: Record<string, unknown>;

  /** Execution status */
  status: NodeExecutionStatus;

  /** Duration in ms (after execution) */
  duration?: number;

  /** Error message (if failed) */
  error?: string;

  /** Whether auto-inserted by compiler */
  isAutoAdapter?: boolean;

  /** Callback for drill-down (frontend) */
  onDrillDown?: (data: DAGNodeData) => void;

  /** Whether this node has a sub-graph */
  hasSubGraph?: boolean;

  /** Saved sub-graph ID from catalog */
  savedSubGraphId?: string;
}

/**
 * ReactFlow node structure.
 */
export interface DAGNode {
  /** Unique identifier */
  id: string;

  /** Node type for ReactFlow */
  type: string;

  /** Position (set by layout algorithm) */
  position: {
    x: number;
    y: number;
  };

  /** Node data */
  data: DAGNodeData;
}

/**
 * Edge data for execution.
 */
export interface DAGEdgeData {
  /** Whether types are compatible */
  typeCompatible: boolean;

  /** Adapter applied on this edge */
  adapter?: AdapterId;

  /** Label for conditional edges */
  label?: string;
}

/**
 * ReactFlow edge structure.
 */
export interface DAGEdge {
  /** Unique identifier */
  id: string;

  /** Source node ID */
  source: string;

  /** Target node ID */
  target: string;

  /** Source handle (port name) */
  sourceHandle?: string;

  /** Target handle (port name) */
  targetHandle?: string;

  /** Edge data */
  data?: DAGEdgeData;

  /** Whether animated (during execution) */
  animated?: boolean;

  /** Edge style */
  style?: Record<string, unknown>;

  /** Arrow marker */
  markerEnd?: unknown;
}

/**
 * ExecutableDAG - Output of Pass 4 (Emission)
 *
 * Final executable graph ready for ReactFlow rendering and execution.
 */
export interface ExecutableDAG {
  /** Unique identifier */
  id: string;

  /** Back-reference to execution plan */
  executionPlanId: string;

  /** ReactFlow nodes */
  nodes: DAGNode[];

  /** ReactFlow edges */
  edges: DAGEdge[];

  /** Required user parameters */
  requiredParams: Record<string, ParamSpec>;

  /** Topological order for execution */
  topologicalOrder: string[];

  /** Estimated total duration in ms (critical path) */
  estimatedDurationMs: number;

  /** Metadata */
  metadata: {
    /** Generator version */
    version: string;

    /** Generation timestamp */
    generatedAt: string;

    /** Original intent ID */
    intentId: string;

    /** Whether type check passed */
    typeCheckPassed: boolean;

    /** Number of auto-inserted adapters */
    adapterCount: number;
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPILATION RESULT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of the full compilation pipeline.
 */
export interface CompilationResult {
  /** Whether compilation succeeded */
  success: boolean;

  /** The executable DAG (if successful) */
  dag?: ExecutableDAG;

  /** Intermediate results (for debugging) */
  intermediates?: {
    intentSpec?: IntentSpec;
    processGraph?: ProcessGraph;
    executionPlan?: ExecutionPlan;
  };

  /** Errors encountered */
  errors: Array<{
    phase: 'analysis' | 'design' | 'resolution' | 'emission';
    message: string;
    details?: unknown;
  }>;

  /** Warnings */
  warnings: string[];

  /** Compilation timing */
  timing: {
    totalMs: number;
    pass1Ms?: number;
    pass2Ms?: number;
    pass3Ms?: number;
    pass4Ms?: number;
  };
}

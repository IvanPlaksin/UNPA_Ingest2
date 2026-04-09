/**
 * GXE Graph Compiler - Core Type Definitions
 *
 * Phase 0: Foundation
 * Defines the type system for ports, tools, and compatibility checking.
 */

// ═══════════════════════════════════════════════════════════════════════════
// PORT TYPE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base port types supported by the GXE type system.
 * These types define data contracts between nodes in the execution graph.
 */
export type PortType =
  | TextPortType
  | NumberPortType
  | BooleanPortType
  | JsonPortType
  | EmbeddingPortType
  | GraphNodePortType
  | GraphEdgePortType
  | ListPortType
  | RecordPortType
  | BinaryPortType
  | VoidPortType
  | AnyPortType;

export interface TextPortType {
  kind: 'text';
  encoding?: 'utf-8' | 'base64';
}

export interface NumberPortType {
  kind: 'number';
  min?: number;
  max?: number;
  integer?: boolean;
}

export interface BooleanPortType {
  kind: 'boolean';
}

export interface JsonPortType {
  kind: 'json';
  schema?: object; // JSON Schema
}

export interface EmbeddingPortType {
  kind: 'embedding';
  dimensions: number; // e.g., 1024 for TEI model
}

export interface GraphNodePortType {
  kind: 'graph_node';
  labels?: string[]; // e.g., ['Document', 'Entity']
}

export interface GraphEdgePortType {
  kind: 'graph_edge';
  types?: string[]; // e.g., ['RELATES_TO', 'CONTAINS']
}

export interface ListPortType {
  kind: 'list';
  itemType: PortType;
}

export interface RecordPortType {
  kind: 'record';
  fields: Record<string, PortType>;
}

export interface BinaryPortType {
  kind: 'binary';
  mimeType?: string; // e.g., 'application/pdf', 'image/png'
}

export interface VoidPortType {
  kind: 'void';
}

export interface AnyPortType {
  kind: 'any'; // Escape hatch - should trigger warnings
}

// ═══════════════════════════════════════════════════════════════════════════
// PORT DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Definition of a single input or output port for a tool.
 */
export interface PortDefinition {
  /** Port identifier within the tool (e.g., "raw_text", "embedding") */
  name: string;

  /** Data type of the port */
  type: PortType;

  /** Whether this port must have a connection (for inputs) or always produces output */
  required: boolean;

  /** Default value if not connected (only for inputs) */
  default?: unknown;

  /** Human-readable description */
  description: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL PORT SPECIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Side effects that a tool may produce.
 * Used for optimization and safety analysis.
 */
export type ToolSideEffect =
  | 'READ'       // Reads from external storage
  | 'WRITE'      // Writes to external storage
  | 'DELETE'     // Deletes from external storage
  | 'LLM_CALL'   // Makes an LLM API call (expensive)
  | 'EXTERNAL';  // Calls external service/API

/**
 * Execution strategy for a tool.
 */
export interface ToolExecution {
  /** How the tool is executed */
  type: 'service' | 'function' | 'composite' | 'control';

  /** Service ID in SERVICE_CONTAINER (for type: 'service') */
  serviceId?: string;

  /** Method name to call on the service */
  method?: string;

  /** Tool IDs that compose this pattern (for type: 'composite') */
  composedOf?: string[];
}

/**
 * Complete specification of a tool's ports and execution.
 * This is the single source of truth for the GXE type system.
 */
export interface ToolPortSpec {
  /** Unique tool identifier (e.g., "text.sanitize", "vector.embed") */
  toolId: string;

  /** Tool category (e.g., "text", "vector", "graph", "ai", "control") */
  category: string;

  /** Tool hierarchy level (1=primitives, 2=domain, 3=patterns, 4=meta) */
  level: 1 | 2 | 3 | 4;

  /** Input port definitions */
  inputPorts: PortDefinition[];

  /** Output port definitions */
  outputPorts: PortDefinition[];

  /** Execution configuration */
  execution: ToolExecution;

  /** Human-readable description of what the tool does */
  description: string;

  /** Side effects produced by this tool */
  sideEffects: ToolSideEffect[];

  /** Estimated execution duration in milliseconds */
  estimatedDurationMs: number;

  /** Whether the tool can be safely retried on failure */
  retryable: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE COMPATIBILITY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result of type compatibility check between two ports.
 */
export type CompatStatus =
  | 'COMPATIBLE'        // Direct connection, no transformation needed
  | 'NEEDS_ADAPTER'     // Compatible via adapter (auto-inserted on edge)
  | 'NEEDS_NODE_INSERT' // Incompatible, but can be fixed by inserting a node
  | 'INCOMPATIBLE';     // Cannot be connected

/**
 * Available adapter IDs for automatic type conversion.
 * Adapters are lightweight transformations applied on edges, not separate nodes.
 */
export type AdapterId =
  | 'ANY_TO_JSON'           // Adapter A: JSON.stringify
  | 'NUMBER_TO_TEXT'        // Adapter B: String(value)
  | 'BOOLEAN_TO_TEXT'       // Adapter B variant
  | 'NUMBER_TO_BOOLEAN'     // Adapter C: value !== 0
  | 'JSON_TO_TEXT'          // Adapter D: JSON.stringify or passthrough
  | 'JSON_TO_RECORD'        // Adapter E: structural check
  | 'RECORD_TO_JSON'        // Adapter F: upcast (trivial)
  | 'LIST_ITEM_ADAPTER';    // Applies another adapter to each list item

/**
 * Result of checking type compatibility between output and input ports.
 */
export interface CompatResult {
  /** Overall compatibility status */
  status: CompatStatus;

  /** Adapter to apply if status is NEEDS_ADAPTER */
  adapterId?: AdapterId;

  /** For LIST_ITEM_ADAPTER: the inner adapter to apply */
  innerAdapterId?: AdapterId;

  /** Fix suggestion if status is NEEDS_NODE_INSERT */
  fix?: string;

  /** Error message if status is INCOMPATIBLE */
  error?: string;

  /** Warning message (e.g., for 'any' type usage) */
  warning?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE CHECK RESULTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Error found during type checking.
 */
export interface TypeCheckError {
  /** Error type */
  type:
    | 'MISSING_SOURCE'      // Required input has no incoming edge
    | 'PORT_NOT_FOUND'      // Edge references non-existent port
    | 'TYPE_MISMATCH'       // Incompatible types, no fix
    | 'TYPE_MISMATCH_FIXABLE'; // Incompatible types, but can be fixed

  /** Node ID where error occurred */
  nodeId?: string;

  /** Port name involved */
  port?: string;

  /** Edge involved (for edge-related errors) */
  edge?: {
    sourceNodeId: string;
    sourcePort: string;
    targetNodeId: string;
    targetPort: string;
  };

  /** Output type (for type mismatches) */
  outputType?: PortType;

  /** Input type (for type mismatches) */
  inputType?: PortType;

  /** Suggested fix */
  fix?: string;

  /** Human-readable error message */
  message: string;
}

/**
 * Warning found during type checking.
 */
export interface TypeCheckWarning {
  /** Warning type */
  type:
    | 'ANY_TYPE_USED'       // 'any' port type detected
    | 'UNUSED_OUTPUT'       // Output port has no consumers
    | 'SCHEMA_UNKNOWN'      // JSON port without schema
    | 'ADAPTER_APPLIED';    // Adapter was auto-inserted

  /** Node ID where warning occurred */
  nodeId?: string;

  /** Port name involved */
  port?: string;

  /** Edge involved */
  edge?: {
    sourceNodeId: string;
    sourcePort: string;
    targetNodeId: string;
    targetPort: string;
  };

  /** Human-readable warning message */
  message: string;
}

/**
 * Complete result of type checking an execution plan.
 */
export interface TypeCheckResult {
  /** Whether all type checks passed (no errors) */
  passed: boolean;

  /** List of errors found */
  errors: TypeCheckError[];

  /** List of warnings found */
  warnings: TypeCheckWarning[];

  /** Number of adapters automatically applied */
  adaptersApplied: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Helper to create a text port type.
 */
export function textType(encoding?: 'utf-8' | 'base64'): TextPortType {
  return { kind: 'text', encoding };
}

/**
 * Helper to create a number port type.
 */
export function numberType(options?: { min?: number; max?: number; integer?: boolean }): NumberPortType {
  return { kind: 'number', ...options };
}

/**
 * Helper to create a boolean port type.
 */
export function booleanType(): BooleanPortType {
  return { kind: 'boolean' };
}

/**
 * Helper to create a JSON port type.
 */
export function jsonType(schema?: object): JsonPortType {
  return { kind: 'json', schema };
}

/**
 * Helper to create an embedding port type.
 */
export function embeddingType(dimensions: number = 1024): EmbeddingPortType {
  return { kind: 'embedding', dimensions };
}

/**
 * Helper to create a graph node port type.
 */
export function graphNodeType(labels?: string[]): GraphNodePortType {
  return { kind: 'graph_node', labels };
}

/**
 * Helper to create a graph edge port type.
 */
export function graphEdgeType(types?: string[]): GraphEdgePortType {
  return { kind: 'graph_edge', types };
}

/**
 * Helper to create a list port type.
 */
export function listType(itemType: PortType): ListPortType {
  return { kind: 'list', itemType };
}

/**
 * Helper to create a record port type.
 */
export function recordType(fields: Record<string, PortType>): RecordPortType {
  return { kind: 'record', fields };
}

/**
 * Helper to create a binary port type.
 */
export function binaryType(mimeType?: string): BinaryPortType {
  return { kind: 'binary', mimeType };
}

/**
 * Helper to create a void port type.
 */
export function voidType(): VoidPortType {
  return { kind: 'void' };
}

/**
 * Helper to create an any port type (use sparingly!).
 */
export function anyType(): AnyPortType {
  return { kind: 'any' };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default embedding dimensions for TEI model.
 */
export const DEFAULT_EMBEDDING_DIMENSIONS = 1024;

/**
 * Tool levels in the GXE hierarchy.
 */
export const TOOL_LEVELS = {
  PRIMITIVES: 1,
  DOMAIN: 2,
  PATTERNS: 3,
  META: 4,
} as const;

/**
 * Tool categories.
 */
export const TOOL_CATEGORIES = {
  TEXT: 'text',
  EXTRACTION: 'extraction',
  VECTOR: 'vector',
  GRAPH: 'graph',
  AI: 'ai',
  CONTROL: 'control',
  PATTERN: 'pattern',
  META: 'meta',
} as const;

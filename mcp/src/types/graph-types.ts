/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH TYPES - Type definitions for AOPEG workflow graphs
 *
 * Categories:
 * - Standard Operations (control flow, transformations)
 * - Business Process (BPMN-aligned)
 * - CRUD Service (data operations)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// ENUMS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Node categories for classification
 */
export enum NodeCategory {
  EXECUTOR = 'executor',
  CONDITION = 'condition',
  TRANSFORMER = 'transformer',
  AGGREGATOR = 'aggregator',
  EVENT = 'event',
  GATEWAY = 'gateway',
  CONTROL = 'control',
}

/**
 * Domain identifiers
 */
export enum Domain {
  COMMON = 'common',
  INGESTION = 'ingestion',
  RAG = 'rag',
  WORKFLOW = 'workflow',
  INTEGRATION = 'integration',
}

/**
 * Standard operation node types
 */
export enum StandardOpNodeType {
  START = 'common.start',
  END = 'common.end',
  CONDITION = 'common.condition',
  SWITCH = 'common.switch',
  MERGE = 'common.merge',
  SPLIT = 'common.split',
  DELAY = 'common.delay',
  LOOP = 'common.loop',
  PARALLEL = 'common.parallel',
  JOIN = 'common.join',
  // Transformers
  TRANSFORM_MAP = 'common.transform.map',
  TRANSFORM_FILTER = 'common.transform.filter',
  TRANSFORM_REDUCE = 'common.transform.reduce',
  TRANSFORM_FLATTEN = 'common.transform.flatten',
  TRANSFORM_TEMPLATE = 'common.transform.template',
  // Error handling
  RETRY = 'common.retry',
  TIMEOUT = 'common.timeout',
  ERROR_HANDLER = 'common.error_handler',
  // Utility
  LOG = 'common.log',
  CACHE = 'common.cache',
  VALIDATE = 'common.validate',
}

/**
 * Business process node types (BPMN-aligned)
 */
export enum BusinessProcessNodeType {
  BP_START_EVENT = 'workflow.start_event',
  BP_END_EVENT = 'workflow.end_event',
  BP_TASK = 'workflow.task',
  BP_SERVICE_TASK = 'workflow.service_task',
  BP_USER_TASK = 'workflow.user_task',
  BP_DECISION = 'workflow.decision',
  BP_PARALLEL_GATEWAY = 'workflow.parallel_gateway',
  BP_INCLUSIVE_GATEWAY = 'workflow.inclusive_gateway',
  BP_SUBPROCESS = 'workflow.subprocess',
  BP_CALL_ACTIVITY = 'workflow.call_activity',
  BP_TIMER_EVENT = 'workflow.timer_event',
  BP_MESSAGE_EVENT = 'workflow.message_event',
  BP_ERROR_EVENT = 'workflow.error_event',
  BP_COMPENSATION = 'workflow.compensation',
  BP_NOTIFICATION = 'workflow.notification',
  BP_APPROVAL = 'workflow.approval',
}

/**
 * CRUD service node types
 */
export enum CRUDNodeType {
  CRUD_CREATE = 'integration.crud.create',
  CRUD_READ = 'integration.crud.read',
  CRUD_READ_LIST = 'integration.crud.read_list',
  CRUD_UPDATE = 'integration.crud.update',
  CRUD_PATCH = 'integration.crud.patch',
  CRUD_DELETE = 'integration.crud.delete',
  CRUD_UPSERT = 'integration.crud.upsert',
  CRUD_BULK_CREATE = 'integration.crud.bulk_create',
  CRUD_BULK_UPDATE = 'integration.crud.bulk_update',
  CRUD_BULK_DELETE = 'integration.crud.bulk_delete',
  CRUD_QUERY = 'integration.crud.query',
  CRUD_AGGREGATE = 'integration.crud.aggregate',
  CRUD_VALIDATE = 'integration.crud.validate',
  CRUD_AUTHORIZE = 'integration.crud.authorize',
  CRUD_AUDIT = 'integration.crud.audit',
}

/**
 * Edge type identifiers
 */
export enum EdgeTypeId {
  SEQUENCE = 'sequence',
  DATA_FLOW = 'data_flow',
  CONTROL_FLOW = 'control_flow',
  CONDITIONAL = 'conditional',
  DEFAULT = 'default',
  EXCEPTION = 'exception',
  MESSAGE_FLOW = 'message_flow',
  ASSOCIATION = 'association',
  CASCADE = 'cascade',
  DEPENDENCY = 'dependency',
  ERROR_HANDLING = 'error_handling',
  TIMEOUT = 'timeout',
}

// ────────────────────────────────────────────────────────────────────────────
// BASE INTERFACES
// ────────────────────────────────────────────────────────────────────────────

/**
 * Parameter definition for node type
 */
export interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum';
  required: boolean;
  default?: unknown;
  description?: string;
  enumValues?: string[];
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  backoffMultiplier: number;
}

/**
 * Base node type definition
 */
export interface NodeTypeDefinition {
  fullName: string;
  domain: Domain | string;
  name: string;
  category: NodeCategory;
  displayName: string;
  description: string;
  icon: string;
  color: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  parameters: ParameterDefinition[];
  executorClass?: string;
  retryPolicy: RetryPolicy;
  timeout: number;
  namespace: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Edge type definition
 */
export interface EdgeTypeDefinition {
  name: EdgeTypeId | string;
  displayName: string;
  description: string;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  animated: boolean;
  allowedSources: string[];
  allowedTargets: string[];
  dataSchema: Record<string, unknown>;
  namespace: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Domain definition
 */
export interface DomainDefinition {
  name: Domain | string;
  displayName: string;
  description: string;
  color: string;
  icon: string;
  nodeCount?: number;
}

// ────────────────────────────────────────────────────────────────────────────
// STANDARD OPERATION NODE INTERFACES
// ────────────────────────────────────────────────────────────────────────────

export interface StartNodeData {
  executorType: StandardOpNodeType.START;
  displayName: string;
  triggerType?: 'manual' | 'scheduled' | 'event' | 'api';
  scheduleExpression?: string;
  eventType?: string;
}

export interface EndNodeData {
  executorType: StandardOpNodeType.END;
  displayName: string;
  outputMapping?: Record<string, string>;
  terminateAll?: boolean;
}

export interface ConditionNodeData {
  executorType: StandardOpNodeType.CONDITION;
  displayName: string;
  expression: string;
  expressionLanguage?: 'jexl' | 'jsonpath' | 'javascript';
}

export interface SwitchNodeData {
  executorType: StandardOpNodeType.SWITCH;
  displayName: string;
  expression: string;
  cases: Array<{ value: string; label: string }>;
  defaultCase?: string;
}

export interface MergeNodeData {
  executorType: StandardOpNodeType.MERGE;
  displayName: string;
  mergeStrategy: 'first' | 'all' | 'any';
  timeout?: number;
}

export interface ParallelNodeData {
  executorType: StandardOpNodeType.PARALLEL;
  displayName: string;
  branches: string[];
  waitForAll?: boolean;
}

export interface LoopNodeData {
  executorType: StandardOpNodeType.LOOP;
  displayName: string;
  loopType: 'forEach' | 'while' | 'doWhile';
  collection?: string;
  condition?: string;
  maxIterations?: number;
}

export interface TransformNodeData {
  executorType:
    | StandardOpNodeType.TRANSFORM_MAP
    | StandardOpNodeType.TRANSFORM_FILTER
    | StandardOpNodeType.TRANSFORM_REDUCE
    | StandardOpNodeType.TRANSFORM_FLATTEN
    | StandardOpNodeType.TRANSFORM_TEMPLATE;
  displayName: string;
  transformation: string;
  outputField?: string;
}

export interface RetryNodeData {
  executorType: StandardOpNodeType.RETRY;
  displayName: string;
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
  retryOn?: string[];
}

export interface ErrorHandlerNodeData {
  executorType: StandardOpNodeType.ERROR_HANDLER;
  displayName: string;
  errorTypes?: string[];
  fallbackValue?: unknown;
  rethrow?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// BUSINESS PROCESS NODE INTERFACES
// ────────────────────────────────────────────────────────────────────────────

export interface BPTaskNodeData {
  executorType: BusinessProcessNodeType.BP_TASK | BusinessProcessNodeType.BP_SERVICE_TASK;
  displayName: string;
  description?: string;
  implementation?: string;
  documentation?: string;
}

export interface BPUserTaskNodeData {
  executorType: BusinessProcessNodeType.BP_USER_TASK;
  displayName: string;
  description?: string;
  assignee?: string;
  candidateGroups?: string[];
  dueDate?: string;
  priority?: number;
  formKey?: string;
}

export interface BPDecisionNodeData {
  executorType: BusinessProcessNodeType.BP_DECISION;
  displayName: string;
  decisionType: 'exclusive' | 'inclusive' | 'complex';
  expression?: string;
  decisionTable?: string;
}

export interface BPGatewayNodeData {
  executorType:
    | BusinessProcessNodeType.BP_PARALLEL_GATEWAY
    | BusinessProcessNodeType.BP_INCLUSIVE_GATEWAY;
  displayName: string;
  direction: 'diverging' | 'converging';
}

export interface BPSubprocessNodeData {
  executorType: BusinessProcessNodeType.BP_SUBPROCESS;
  displayName: string;
  processRef: string;
  isExpanded?: boolean;
  inputMapping?: Record<string, string>;
  outputMapping?: Record<string, string>;
}

export interface BPEventNodeData {
  executorType:
    | BusinessProcessNodeType.BP_START_EVENT
    | BusinessProcessNodeType.BP_END_EVENT
    | BusinessProcessNodeType.BP_TIMER_EVENT
    | BusinessProcessNodeType.BP_MESSAGE_EVENT
    | BusinessProcessNodeType.BP_ERROR_EVENT;
  displayName: string;
  eventDefinition?: {
    type: 'timer' | 'message' | 'error' | 'signal' | 'escalation';
    timerDefinition?: string;
    messageRef?: string;
    errorRef?: string;
  };
}

export interface BPNotificationNodeData {
  executorType: BusinessProcessNodeType.BP_NOTIFICATION;
  displayName: string;
  channel: 'email' | 'slack' | 'teams' | 'webhook';
  template: string;
  recipients: string[];
}

export interface BPApprovalNodeData {
  executorType: BusinessProcessNodeType.BP_APPROVAL;
  displayName: string;
  approvers: string[];
  approvalType: 'any' | 'all' | 'majority';
  escalationPolicy?: {
    timeout: number;
    escalateTo: string;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CRUD SERVICE NODE INTERFACES
// ────────────────────────────────────────────────────────────────────────────

export interface FilterCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'like' | 'between' | 'isNull';
  value: unknown;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  offset?: number;
}

export interface CRUDNodeData {
  executorType: CRUDNodeType;
  displayName: string;
  entity: string;
  repository?: string;
  schema?: string;
  fields?: string[];
  filters?: FilterCondition[];
  sorting?: SortConfig[];
  pagination?: PaginationConfig;
  transaction?: {
    enabled: boolean;
    isolationLevel?: 'read_committed' | 'repeatable_read' | 'serializable';
  };
  cachePolicy?: {
    enabled: boolean;
    ttl: number;
    invalidateOn?: string[];
  };
}

// ────────────────────────────────────────────────────────────────────────────
// UNION TYPES
// ────────────────────────────────────────────────────────────────────────────

/**
 * All workflow node types combined
 */
export type WorkflowNodeType =
  | StandardOpNodeType
  | BusinessProcessNodeType
  | CRUDNodeType;

/**
 * All node data types combined
 */
export type WorkflowNodeData =
  | StartNodeData
  | EndNodeData
  | ConditionNodeData
  | SwitchNodeData
  | MergeNodeData
  | ParallelNodeData
  | LoopNodeData
  | TransformNodeData
  | RetryNodeData
  | ErrorHandlerNodeData
  | BPTaskNodeData
  | BPUserTaskNodeData
  | BPDecisionNodeData
  | BPGatewayNodeData
  | BPSubprocessNodeData
  | BPEventNodeData
  | BPNotificationNodeData
  | BPApprovalNodeData
  | CRUDNodeData;

// ────────────────────────────────────────────────────────────────────────────
// NODE VISUAL CONFIGURATION
// ────────────────────────────────────────────────────────────────────────────

export interface NodeVisual {
  color: string;
  icon: string;
  shape?: 'box' | 'diamond' | 'circle' | 'ellipse' | 'hexagon';
  size?: number;
}

/**
 * Visual mapping for node types
 */
export const NODE_VISUALS: Partial<Record<WorkflowNodeType, NodeVisual>> = {
  // Standard Operations
  [StandardOpNodeType.START]: { color: '#22c55e', icon: 'play', shape: 'circle' },
  [StandardOpNodeType.END]: { color: '#ef4444', icon: 'stop-circle', shape: 'circle' },
  [StandardOpNodeType.CONDITION]: { color: '#f59e0b', icon: 'git-branch', shape: 'diamond' },
  [StandardOpNodeType.SWITCH]: { color: '#f59e0b', icon: 'git-merge', shape: 'diamond' },
  [StandardOpNodeType.MERGE]: { color: '#8b5cf6', icon: 'git-merge', shape: 'diamond' },
  [StandardOpNodeType.PARALLEL]: { color: '#06b6d4', icon: 'layers', shape: 'box' },
  [StandardOpNodeType.LOOP]: { color: '#ec4899', icon: 'repeat', shape: 'hexagon' },
  [StandardOpNodeType.TRANSFORM_MAP]: { color: '#3b82f6', icon: 'shuffle', shape: 'box' },
  [StandardOpNodeType.ERROR_HANDLER]: { color: '#dc2626', icon: 'alert-triangle', shape: 'box' },
  [StandardOpNodeType.LOG]: { color: '#64748b', icon: 'file-text', shape: 'box' },

  // Business Process
  [BusinessProcessNodeType.BP_START_EVENT]: { color: '#22c55e', icon: 'circle', shape: 'circle' },
  [BusinessProcessNodeType.BP_END_EVENT]: { color: '#ef4444', icon: 'circle-dot', shape: 'circle' },
  [BusinessProcessNodeType.BP_TASK]: { color: '#6366f1', icon: 'square', shape: 'box' },
  [BusinessProcessNodeType.BP_SERVICE_TASK]: { color: '#0ea5e9', icon: 'cog', shape: 'box' },
  [BusinessProcessNodeType.BP_USER_TASK]: { color: '#8b5cf6', icon: 'user', shape: 'box' },
  [BusinessProcessNodeType.BP_DECISION]: { color: '#f59e0b', icon: 'diamond', shape: 'diamond' },
  [BusinessProcessNodeType.BP_NOTIFICATION]: { color: '#10b981', icon: 'bell', shape: 'box' },
  [BusinessProcessNodeType.BP_APPROVAL]: { color: '#f97316', icon: 'check-circle', shape: 'box' },

  // CRUD
  [CRUDNodeType.CRUD_CREATE]: { color: '#22c55e', icon: 'plus-circle', shape: 'box' },
  [CRUDNodeType.CRUD_READ]: { color: '#3b82f6', icon: 'eye', shape: 'box' },
  [CRUDNodeType.CRUD_UPDATE]: { color: '#f59e0b', icon: 'edit', shape: 'box' },
  [CRUDNodeType.CRUD_DELETE]: { color: '#ef4444', icon: 'trash-2', shape: 'box' },
  [CRUDNodeType.CRUD_QUERY]: { color: '#8b5cf6', icon: 'search', shape: 'box' },
};

// ────────────────────────────────────────────────────────────────────────────
// NODE CATEGORY GROUPINGS
// ────────────────────────────────────────────────────────────────────────────

export const NODE_CATEGORIES = {
  CONTROL_FLOW: [
    StandardOpNodeType.START,
    StandardOpNodeType.END,
    StandardOpNodeType.CONDITION,
    StandardOpNodeType.SWITCH,
    StandardOpNodeType.MERGE,
    StandardOpNodeType.SPLIT,
    StandardOpNodeType.PARALLEL,
    StandardOpNodeType.JOIN,
    StandardOpNodeType.LOOP,
  ],
  TRANSFORMERS: [
    StandardOpNodeType.TRANSFORM_MAP,
    StandardOpNodeType.TRANSFORM_FILTER,
    StandardOpNodeType.TRANSFORM_REDUCE,
    StandardOpNodeType.TRANSFORM_FLATTEN,
    StandardOpNodeType.TRANSFORM_TEMPLATE,
  ],
  ERROR_HANDLING: [
    StandardOpNodeType.RETRY,
    StandardOpNodeType.TIMEOUT,
    StandardOpNodeType.ERROR_HANDLER,
  ],
  UTILITY: [
    StandardOpNodeType.LOG,
    StandardOpNodeType.CACHE,
    StandardOpNodeType.VALIDATE,
    StandardOpNodeType.DELAY,
  ],
  BUSINESS_PROCESS: Object.values(BusinessProcessNodeType),
  CRUD: Object.values(CRUDNodeType),
};

export default {
  NodeCategory,
  Domain,
  StandardOpNodeType,
  BusinessProcessNodeType,
  CRUDNodeType,
  EdgeTypeId,
  NODE_VISUALS,
  NODE_CATEGORIES,
};

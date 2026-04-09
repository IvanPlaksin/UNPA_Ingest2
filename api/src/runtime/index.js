/**
 * GXE Runtime Environment
 *
 * P0 Implementation - Core execution components for graph-based workflows.
 *
 * Components:
 * - RuntimeEngine: Main facade for graph execution
 * - ExecutionStateMachine: 10-state FSM for execution lifecycle
 * - NodeStateMachine: 9-state FSM for individual node lifecycle
 * - PortManager: Input/output port management
 * - DataFlowManager: Data propagation through edges
 * - NodeRunner: Stateless node executor
 * - TopologicalScheduler: Kahn's algorithm scheduler with parallel execution
 *
 * @module runtime
 */

const { RuntimeEngine, DEFAULT_CONFIG } = require('./RuntimeEngine');
const { ExecutionStateMachine, ExecutionState, EXECUTION_TRIGGERS } = require('./state/ExecutionStateMachine');
const { NodeStateMachine, NodeState, NODE_TRIGGERS } = require('./state/NodeStateMachine');
const { BaseFSM, InvalidTransitionError } = require('./state/BaseFSM');
const { PortManager, PortState } = require('./dataflow/PortManager');
const { DataFlowManager, EdgeTransform } = require('./dataflow/DataFlowManager');
const { NodeRunner, RunStatus, FailurePhase } = require('./execution/NodeRunner');
const { TopologicalScheduler, SchedulerStrategy, FailureStrategy, Deferred } = require('./scheduler/TopologicalScheduler');
const { RetryPolicy, BackoffType, exponentialBackoff, linearBackoff, fixedDelay, noRetry } = require('./resilience/RetryPolicy');
const { ResourceLimiter, DEFAULT_LIMITS, computeDAGDepth } = require('./safety/ResourceLimiter');
const { ExpressionSandbox, deepFreeze, getByPath, hasPath } = require('./safety/ExpressionSandbox');
const { AOPEGAdapter, GraphFormatConverter, createRuntimeRoutes, EXECUTOR_TO_TOOL_MAP, TOOL_TO_EXECUTOR_MAP, RuntimeErrorCodes } = require('./integration');
const { RuntimeSSEStreamer, SSE_EVENTS } = require('./observability');
const {
  ConditionalBranch, createIfElse, createSwitch, createRangeBranch,
  LoopPattern, LoopType, LoopState, createForEach, createWhile, createDoWhile, createCountLoop
} = require('./control');
const {
  CheckpointManager, MemoryStorage, RecoveryManager, RecoveryStrategy, NodeRecoveryStatus
} = require('./persistence');
const {
  PatternLibrary
} = require('./learning');

module.exports = {
  // Main facade
  RuntimeEngine,
  DEFAULT_CONFIG,

  // State machines
  ExecutionStateMachine,
  ExecutionState,
  EXECUTION_TRIGGERS,
  NodeStateMachine,
  NodeState,
  NODE_TRIGGERS,
  BaseFSM,
  InvalidTransitionError,

  // Data flow
  PortManager,
  PortState,
  DataFlowManager,
  EdgeTransform,

  // Execution
  NodeRunner,
  RunStatus,
  FailurePhase,

  // Scheduling
  TopologicalScheduler,
  SchedulerStrategy,
  FailureStrategy,
  Deferred,

  // Resilience
  RetryPolicy,
  BackoffType,
  exponentialBackoff,
  linearBackoff,
  fixedDelay,
  noRetry,

  // Safety
  ResourceLimiter,
  DEFAULT_LIMITS,
  computeDAGDepth,
  ExpressionSandbox,
  deepFreeze,
  getByPath,
  hasPath,

  // Integration (AOPEG bridge)
  AOPEGAdapter,
  GraphFormatConverter,
  createRuntimeRoutes,
  EXECUTOR_TO_TOOL_MAP,
  TOOL_TO_EXECUTOR_MAP,
  RuntimeErrorCodes,

  // Observability (SSE streaming)
  RuntimeSSEStreamer,
  SSE_EVENTS,

  // Control flow
  ConditionalBranch,
  createIfElse,
  createSwitch,
  createRangeBranch,
  LoopPattern,
  LoopType,
  LoopState,
  createForEach,
  createWhile,
  createDoWhile,
  createCountLoop,

  // Persistence (checkpoint/recovery)
  CheckpointManager,
  MemoryStorage,
  RecoveryManager,
  RecoveryStrategy,
  NodeRecoveryStatus,

  // Learning (pattern library for feedback loop)
  PatternLibrary
};

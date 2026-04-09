/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXAMPLE EXECUTION GRAPHS
 * Demonstrates various graph patterns and use cases
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: Simple Sequential Pipeline
// ────────────────────────────────────────────────────────────────────────────

const simpleSequentialGraph = {
  id: 'example-simple-sequential',
  version: 1,
  name: 'Simple Sequential Pipeline',
  description: 'Basic sequential processing: Log → Delay → Log',
  domain: 'common',
  tags: ['example', 'simple', 'sequential'],
  generatedBy: 'HUMAN',

  nodes: [
    {
      id: 'start-log',
      executorType: 'common.log',
      parameters: { level: 'info', message: 'Starting pipeline', includeInput: true },
      displayName: 'Start Log',
      description: 'Log the start of execution',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'process-delay',
      executorType: 'common.delay',
      parameters: { duration: 500 },
      displayName: 'Processing Delay',
      description: 'Simulate processing time',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 300, y: 200 },
    },
    {
      id: 'end-log',
      executorType: 'common.log',
      parameters: { level: 'info', message: 'Pipeline complete' },
      displayName: 'End Log',
      description: 'Log completion',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 500, y: 200 },
    },
  ],

  edges: [
    { id: 'e1', sourceNodeId: 'start-log', targetNodeId: 'process-delay', condition: null, priority: 1, dataMapping: [], label: '' },
    { id: 'e2', sourceNodeId: 'process-delay', targetNodeId: 'end-log', condition: null, priority: 1, dataMapping: [], label: '' },
  ],

  entryNodeId: 'start-log',
  exitNodeIds: ['end-log'],
  defaultParameters: {},
  variables: [],
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE 2: Parallel Processing
// ────────────────────────────────────────────────────────────────────────────

const parallelProcessingGraph = {
  id: 'example-parallel-processing',
  version: 1,
  name: 'Parallel Processing',
  description: 'Demonstrates parallel execution with aggregation',
  domain: 'common',
  tags: ['example', 'parallel'],
  generatedBy: 'HUMAN',

  nodes: [
    {
      id: 'input',
      executorType: 'common.passthrough',
      parameters: {},
      displayName: 'Input',
      description: 'Receive input',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'branch-a',
      executorType: 'common.log',
      parameters: { level: 'info', message: 'Branch A processing' },
      displayName: 'Branch A',
      description: 'First parallel branch',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 300, y: 100 },
    },
    {
      id: 'branch-b',
      executorType: 'common.log',
      parameters: { level: 'info', message: 'Branch B processing' },
      displayName: 'Branch B',
      description: 'Second parallel branch',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 300, y: 300 },
    },
    {
      id: 'aggregate',
      executorType: 'common.aggregate',
      parameters: { operation: 'merge' },
      displayName: 'Aggregate Results',
      description: 'Merge parallel results',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 500, y: 200 },
    },
  ],

  edges: [
    { id: 'e1', sourceNodeId: 'input', targetNodeId: 'branch-a', condition: null, priority: 1, dataMapping: [], label: '' },
    { id: 'e2', sourceNodeId: 'input', targetNodeId: 'branch-b', condition: null, priority: 1, dataMapping: [], label: '' },
    { id: 'e3', sourceNodeId: 'branch-a', targetNodeId: 'aggregate', condition: null, priority: 1, dataMapping: [], label: '' },
    { id: 'e4', sourceNodeId: 'branch-b', targetNodeId: 'aggregate', condition: null, priority: 1, dataMapping: [], label: '' },
  ],

  entryNodeId: 'input',
  exitNodeIds: ['aggregate'],
  defaultParameters: {},
  variables: [],
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE 3: Conditional Branching
// ────────────────────────────────────────────────────────────────────────────

const conditionalBranchingGraph = {
  id: 'example-conditional-branching',
  version: 1,
  name: 'Conditional Branching',
  description: 'Routes to different paths based on validation results',
  domain: 'validation',
  tags: ['example', 'conditional', 'validation'],
  generatedBy: 'HUMAN',

  nodes: [
    {
      id: 'validate',
      executorType: 'common.validate',
      parameters: { rules: ['not_null', 'not_empty'] },
      displayName: 'Validate Input',
      description: 'Check input validity',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'success-path',
      executorType: 'common.log',
      parameters: { level: 'info', message: 'Validation passed!' },
      displayName: 'Success',
      description: 'Handle valid input',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 300, y: 100 },
    },
    {
      id: 'failure-path',
      executorType: 'common.log',
      parameters: { level: 'warn', message: 'Validation failed!' },
      displayName: 'Failure',
      description: 'Handle invalid input',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 300, y: 300 },
    },
  ],

  edges: [
    {
      id: 'e-success',
      sourceNodeId: 'validate',
      targetNodeId: 'success-path',
      condition: { type: 'success', config: {} },
      priority: 1,
      dataMapping: [],
      label: 'on success',
    },
    {
      id: 'e-failure',
      sourceNodeId: 'validate',
      targetNodeId: 'failure-path',
      condition: { type: 'failure', config: {} },
      priority: 2,
      dataMapping: [],
      label: 'on failure',
    },
  ],

  entryNodeId: 'validate',
  exitNodeIds: ['success-path', 'failure-path'],
  defaultParameters: {},
  variables: [],
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────────────────────────
// ALL EXAMPLE GRAPHS
// ────────────────────────────────────────────────────────────────────────────

const exampleGraphs = [
  simpleSequentialGraph,
  parallelProcessingGraph,
  conditionalBranchingGraph,
];

/**
 * Get example graph by ID
 */
function getExampleGraph(id) {
  return exampleGraphs.find(g => g.id === id);
}

/**
 * Get all example graphs
 */
function getAllExampleGraphs() {
  return [...exampleGraphs];
}

module.exports = {
  exampleGraphs,
  getExampleGraph,
  getAllExampleGraphs,
  simpleSequentialGraph,
  parallelProcessingGraph,
  conditionalBranchingGraph,
};

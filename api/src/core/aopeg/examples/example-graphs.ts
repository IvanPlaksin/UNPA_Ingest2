/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXAMPLE EXECUTION GRAPHS
 * Demonstrates various graph patterns and use cases
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { ExecutionGraph } from '../types/core.types';

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE 1: Simple Sequential Pipeline
// ────────────────────────────────────────────────────────────────────────────

export const simpleSequentialGraph: ExecutionGraph = {
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

export const parallelProcessingGraph: ExecutionGraph = {
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
    // Parallel split
    { id: 'e1', sourceNodeId: 'input', targetNodeId: 'branch-a', condition: null, priority: 1, dataMapping: [], label: '' },
    { id: 'e2', sourceNodeId: 'input', targetNodeId: 'branch-b', condition: null, priority: 1, dataMapping: [], label: '' },
    // Join (both branches lead to aggregate)
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

export const conditionalBranchingGraph: ExecutionGraph = {
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
// EXAMPLE 4: AI Processing Pipeline
// ────────────────────────────────────────────────────────────────────────────

export const aiProcessingGraph: ExecutionGraph = {
  id: 'example-ai-processing',
  version: 1,
  name: 'AI Processing Pipeline',
  description: 'Classify → Extract → Summarize using LLM',
  domain: 'ai',
  tags: ['example', 'ai', 'llm'],
  generatedBy: 'HUMAN',

  nodes: [
    {
      id: 'classify',
      executorType: 'ai.llm_classify',
      parameters: {
        model: 'gemini-flash',
        categories: ['technical', 'business', 'general'],
        multiLabel: false,
      },
      displayName: 'Classify Content',
      description: 'Determine content category',
      timeout: 30000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
      qualityThreshold: 0.6,
      position: { x: 100, y: 200 },
    },
    {
      id: 'extract',
      executorType: 'ai.llm_extract',
      parameters: {
        model: 'gemini-flash',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            keyPoints: { type: 'array', items: { type: 'string' } },
            entities: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      displayName: 'Extract Data',
      description: 'Extract structured information',
      timeout: 60000,
      retryPolicy: { maxRetries: 2, backoffMs: 2000, backoffMultiplier: 2 },
      qualityThreshold: 0.5,
      position: { x: 300, y: 200 },
    },
    {
      id: 'summarize',
      executorType: 'ai.llm_summarize',
      parameters: {
        model: 'gemini-flash',
        maxLength: 100,
        style: 'brief',
      },
      displayName: 'Summarize',
      description: 'Generate brief summary',
      timeout: 30000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
      position: { x: 500, y: 200 },
    },
  ],

  edges: [
    { id: 'e1', sourceNodeId: 'classify', targetNodeId: 'extract', condition: null, priority: 1, dataMapping: [], label: '' },
    { id: 'e2', sourceNodeId: 'extract', targetNodeId: 'summarize', condition: null, priority: 1, dataMapping: [], label: '' },
  ],

  entryNodeId: 'classify',
  exitNodeIds: ['summarize'],
  defaultParameters: {},
  variables: [
    { name: 'text', type: 'string', required: true, description: 'Text to process' },
  ],
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE 5: Quality-Based Routing
// ────────────────────────────────────────────────────────────────────────────

export const qualityRoutingGraph: ExecutionGraph = {
  id: 'example-quality-routing',
  version: 1,
  name: 'Quality-Based Routing',
  description: 'Routes based on quality score thresholds',
  domain: 'validation',
  tags: ['example', 'quality', 'routing'],
  generatedBy: 'HUMAN',

  nodes: [
    {
      id: 'analyze',
      executorType: 'ai.llm_extract',
      parameters: {
        model: 'gemini-flash',
        schema: { type: 'object', properties: { quality: { type: 'number' } } },
      },
      displayName: 'Analyze',
      description: 'Analyze content quality',
      timeout: 30000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'high-quality',
      executorType: 'common.log',
      parameters: { level: 'info', message: 'High quality content - auto-approve' },
      displayName: 'Auto Approve',
      description: 'Quality >= 0.9',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 350, y: 50 },
    },
    {
      id: 'medium-quality',
      executorType: 'common.notify',
      parameters: { channel: 'review-queue', priority: 'medium' },
      displayName: 'Send to Review',
      description: 'Quality 0.6-0.9',
      timeout: 10000,
      retryPolicy: { maxRetries: 2, backoffMs: 500, backoffMultiplier: 2 },
      position: { x: 350, y: 200 },
    },
    {
      id: 'low-quality',
      executorType: 'common.log',
      parameters: { level: 'warn', message: 'Low quality content - rejected' },
      displayName: 'Reject',
      description: 'Quality < 0.6',
      timeout: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 100, backoffMultiplier: 1 },
      position: { x: 350, y: 350 },
    },
  ],

  edges: [
    {
      id: 'e-high',
      sourceNodeId: 'analyze',
      targetNodeId: 'high-quality',
      condition: { type: 'quality', config: { operator: '>=', threshold: 0.9 } },
      priority: 1,
      dataMapping: [],
      label: 'quality >= 0.9',
    },
    {
      id: 'e-medium',
      sourceNodeId: 'analyze',
      targetNodeId: 'medium-quality',
      condition: { type: 'expression', config: { expression: 'quality >= 0.6 && quality < 0.9' } },
      priority: 2,
      dataMapping: [],
      label: '0.6 <= quality < 0.9',
    },
    {
      id: 'e-low',
      sourceNodeId: 'analyze',
      targetNodeId: 'low-quality',
      condition: { type: 'quality', config: { operator: '<', threshold: 0.6 } },
      priority: 3,
      dataMapping: [],
      label: 'quality < 0.6',
    },
  ],

  entryNodeId: 'analyze',
  exitNodeIds: ['high-quality', 'medium-quality', 'low-quality'],
  defaultParameters: {},
  variables: [],
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────────────────────────
// EXAMPLE 6: HTTP Integration Pipeline
// ────────────────────────────────────────────────────────────────────────────

export const httpIntegrationGraph: ExecutionGraph = {
  id: 'example-http-integration',
  version: 1,
  name: 'HTTP Integration',
  description: 'Fetch data from API, process, and send results',
  domain: 'integration',
  tags: ['example', 'http', 'api'],
  generatedBy: 'HUMAN',

  nodes: [
    {
      id: 'fetch',
      executorType: 'common.http_request',
      parameters: {
        url: '{{var.apiUrl}}',
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        timeout: 10000,
      },
      displayName: 'Fetch Data',
      description: 'Get data from API',
      timeout: 15000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
      position: { x: 100, y: 200 },
    },
    {
      id: 'transform',
      executorType: 'ai.llm_transform',
      parameters: {
        model: 'gemini-flash',
        transformation: 'Extract key information and format as structured data',
        outputFormat: 'json',
      },
      displayName: 'Transform',
      description: 'Process fetched data',
      timeout: 30000,
      retryPolicy: { maxRetries: 2, backoffMs: 1000, backoffMultiplier: 2 },
      position: { x: 300, y: 200 },
    },
    {
      id: 'send',
      executorType: 'common.http_request',
      parameters: {
        url: '{{var.webhookUrl}}',
        method: 'POST',
        bodyFromInput: true,
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      },
      displayName: 'Send Results',
      description: 'POST results to webhook',
      timeout: 15000,
      retryPolicy: { maxRetries: 3, backoffMs: 1000, backoffMultiplier: 2 },
      position: { x: 500, y: 200 },
    },
  ],

  edges: [
    { id: 'e1', sourceNodeId: 'fetch', targetNodeId: 'transform', condition: null, priority: 1, dataMapping: [], label: '' },
    { id: 'e2', sourceNodeId: 'transform', targetNodeId: 'send', condition: null, priority: 1, dataMapping: [], label: '' },
  ],

  entryNodeId: 'fetch',
  exitNodeIds: ['send'],
  defaultParameters: {},
  variables: [
    { name: 'apiUrl', type: 'string', required: true, description: 'Source API URL' },
    { name: 'webhookUrl', type: 'string', required: true, description: 'Destination webhook URL' },
  ],
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ────────────────────────────────────────────────────────────────────────────
// ALL EXAMPLE GRAPHS
// ────────────────────────────────────────────────────────────────────────────

export const exampleGraphs: ExecutionGraph[] = [
  simpleSequentialGraph,
  parallelProcessingGraph,
  conditionalBranchingGraph,
  aiProcessingGraph,
  qualityRoutingGraph,
  httpIntegrationGraph,
];

/**
 * Get example graph by ID
 */
export function getExampleGraph(id: string): ExecutionGraph | undefined {
  return exampleGraphs.find(g => g.id === id);
}

/**
 * Get all example graphs
 */
export function getAllExampleGraphs(): ExecutionGraph[] {
  return [...exampleGraphs];
}

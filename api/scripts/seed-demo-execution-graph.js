#!/usr/bin/env node
/**
 * Seed Demo Execution Graph
 * Creates a 15-node executable GXE graph "AI Document Analysis Pipeline"
 * using the new filesystem, session, and script plugins alongside common executors.
 * Stores it in Memgraph under the "core" namespace.
 *
 * Usage: node api/scripts/seed-demo-execution-graph.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH DEFINITION: AI Document Analysis Pipeline
// ═══════════════════════════════════════════════════════════════════════════

const DEMO_GRAPH = {
  name: 'AI Document Analysis Pipeline',
  namespace: 'core',
  type: 'composite',
  description:
    'End-to-end document analysis pipeline: read file → AI analysis → transform → summarize → ' +
    'merge metadata → format report → write output → list results. ' +
    'Demonstrates filesystem, session (AI), script, and common executors working together via RuntimeEngine.',
  version: '1.0.0',
  createdBy: 'system',
  tags: ['demo', 'pipeline', 'core', 'execution', 'filesystem', 'ai', 'script', 'tool-bound'],
  isPublic: true,

  // ── NODES ──────────────────────────────────────────────────────────────
  nodes: [
    // ── Stage 0: Input ──
    {
      id: 'input',
      type: 'graphNode',
      data: {
        label: 'Pipeline Input',
        kind: 'input',
        executorType: 'common.passthrough',
        description: 'Accept input parameters: documentPath, outputFormat',
        toolRef: 'tool-common-passthrough',
        parameters: {},
        inputFormat: {
          documentPath: { type: 'string', description: 'Path to document in Artefacts/' },
          outputFormat: { type: 'string', default: 'markdown', description: 'Output format: markdown | json' },
        },
        outputFormat: {
          documentPath: { type: 'string' },
          outputFormat: { type: 'string' },
        },
      },
      position: { x: 100, y: 300 },
    },

    // ── Stage 1: Validate Input ──
    {
      id: 'validate_input',
      type: 'graphNode',
      data: {
        label: 'Validate Input',
        executorType: 'common.validate',
        description: 'Validate that required parameters are present',
        toolRef: 'tool-common-validate',
        parameters: {
          rules: ['not_null', 'is_object'],
        },
        inputFormat: {
          documentPath: { type: 'string', source: 'input.documentPath' },
          outputFormat: { type: 'string', source: 'input.outputFormat' },
        },
        outputFormat: {
          valid: { type: 'boolean' },
          input: { type: 'object' },
        },
      },
      position: { x: 300, y: 300 },
    },

    // ── Stage 2: Read Document ──
    {
      id: 'read_document',
      type: 'graphNode',
      data: {
        label: 'Read Document',
        executorType: 'filesystem.read',
        description: 'Read the target document from Artefacts directory',
        toolRef: 'tool-filesystem-read',
        parameters: {
          encoding: 'utf-8',
        },
        inputFormat: {
          path: { type: 'string', source: 'validate_input.input.documentPath' },
        },
        outputFormat: {
          content: { type: 'string', description: 'File content' },
          size: { type: 'number', description: 'File size in bytes' },
          path: { type: 'string', description: 'Resolved file path' },
        },
      },
      position: { x: 500, y: 300 },
    },

    // ── Stage 3: AI Analysis ──
    {
      id: 'ai_analyze',
      type: 'graphNode',
      data: {
        label: 'AI Analyze Document',
        executorType: 'session.ai_chat',
        description: 'Use LLM to analyze the document and extract key information',
        toolRef: 'tool-session-ai-chat',
        parameters: {
          prompt: 'Analyze the following document and extract: 1) Main topics, 2) Key entities (people, organizations, technologies), 3) Sentiment. Return as JSON with keys: topics, entities, sentiment.\n\nDocument:\n{{input}}',
          systemPrompt: 'You are a document analysis assistant. Always respond with valid JSON.',
          responseFormat: 'json',
          temperature: 0.3,
          maxTokens: 1500,
        },
        inputFormat: {
          content: { type: 'string', source: 'read_document.content' },
        },
        outputFormat: {
          topics: { type: 'array', description: 'Main topics found' },
          entities: { type: 'array', description: 'Key entities extracted' },
          sentiment: { type: 'string', description: 'Overall sentiment' },
        },
      },
      position: { x: 700, y: 200 },
    },

    // ── Stage 4: Transform to JSON ──
    {
      id: 'transform_json',
      type: 'graphNode',
      data: {
        label: 'Transform to JSON',
        executorType: 'script.execute',
        description: 'Transform AI analysis output into structured format',
        toolRef: 'tool-script-execute',
        parameters: {
          code: `
            var analysis = input;
            var topics = analysis.topics || [];
            var entities = analysis.entities || [];
            result = {
              topicCount: topics.length,
              entityCount: entities.length,
              topics: topics,
              entities: entities,
              sentiment: analysis.sentiment || 'neutral',
              analyzedAt: new Date().toISOString()
            };
          `,
          timeout: 3000,
        },
        inputFormat: {
          analysis: { type: 'object', source: 'ai_analyze' },
        },
        outputFormat: {
          result: { type: 'object', description: 'Structured analysis result' },
          logs: { type: 'array' },
          executionTime: { type: 'number' },
        },
      },
      position: { x: 900, y: 200 },
    },

    // ── Stage 5: Log Analysis ──
    {
      id: 'log_analysis',
      type: 'graphNode',
      data: {
        label: 'Log Analysis Results',
        executorType: 'common.log',
        description: 'Log the analysis results for provenance tracking',
        toolRef: 'tool-common-log',
        parameters: {
          level: 'info',
          message: 'Document analysis complete',
          includeInput: true,
        },
        inputFormat: {
          result: { type: 'object', source: 'transform_json.result' },
        },
        outputFormat: {
          logged: { type: 'boolean' },
        },
      },
      position: { x: 1100, y: 300 },
    },

    // ── Stage 6: AI Summarize ──
    {
      id: 'ai_summarize',
      type: 'graphNode',
      data: {
        label: 'AI Summarize',
        executorType: 'session.ai_chat',
        description: 'Generate a concise summary of the document',
        toolRef: 'tool-session-ai-chat',
        parameters: {
          prompt: 'Provide a concise 2-3 sentence summary of the following document content:\n\n{{input}}',
          temperature: 0.3,
          maxTokens: 300,
        },
        inputFormat: {
          content: { type: 'string', source: 'read_document.content' },
        },
        outputFormat: {
          summary: { type: 'string', description: 'Document summary' },
        },
      },
      position: { x: 700, y: 400 },
    },

    // ── Stage 7: Fetch Metadata (HTTP) ──
    {
      id: 'fetch_metadata',
      type: 'graphNode',
      data: {
        label: 'Fetch Metadata',
        executorType: 'common.http_request',
        description: 'Fetch additional metadata (e.g., from a metadata API). Falls back gracefully.',
        toolRef: 'tool-common-http-request',
        parameters: {
          url: 'https://httpbin.org/json',
          method: 'GET',
          timeout: 5000,
        },
        inputFormat: {},
        outputFormat: {
          data: { type: 'object', description: 'External metadata' },
        },
      },
      position: { x: 900, y: 400 },
    },

    // ── Stage 8: Merge Data ──
    {
      id: 'merge_data',
      type: 'graphNode',
      data: {
        label: 'Merge Data',
        executorType: 'script.execute',
        description: 'Merge analysis results, summary, and metadata into a single report object',
        toolRef: 'tool-script-execute',
        parameters: {
          code: `
            var data = input || {};
            result = {
              analysis: data.analysis || {},
              summary: data.summary || 'No summary available',
              metadata: data.metadata || {},
              mergedAt: new Date().toISOString()
            };
          `,
          timeout: 3000,
        },
        inputFormat: {
          analysis: { type: 'object', source: 'transform_json.result' },
          summary: { type: 'string', source: 'ai_summarize' },
          metadata: { type: 'object', source: 'fetch_metadata' },
        },
        outputFormat: {
          result: { type: 'object', description: 'Merged report data' },
        },
      },
      position: { x: 1100, y: 400 },
    },

    // ── Stage 9: Delay (rate limiting) ──
    {
      id: 'delay_process',
      type: 'graphNode',
      data: {
        label: 'Rate Limit Delay',
        executorType: 'common.delay',
        description: 'Brief delay for rate limiting before final AI formatting',
        toolRef: 'tool-common-delay',
        parameters: {
          duration: 200,
        },
        inputFormat: {
          data: { type: 'object', source: 'merge_data.result' },
        },
        outputFormat: {
          data: { type: 'object', description: 'Pass-through after delay' },
        },
      },
      position: { x: 1300, y: 300 },
    },

    // ── Stage 10: AI Format Report ──
    {
      id: 'ai_format',
      type: 'graphNode',
      data: {
        label: 'AI Format Report',
        executorType: 'session.ai_chat',
        description: 'Use LLM to format the merged data into a readable report',
        toolRef: 'tool-session-ai-chat',
        parameters: {
          prompt: 'Format the following analysis data into a clean, readable markdown report with sections for Summary, Key Topics, Entities Found, and Sentiment Analysis:\n\n{{input}}',
          systemPrompt: 'You are a technical report writer. Format data into clean markdown.',
          temperature: 0.4,
          maxTokens: 2000,
        },
        inputFormat: {
          data: { type: 'object', source: 'delay_process' },
        },
        outputFormat: {
          report: { type: 'string', description: 'Formatted markdown report' },
        },
      },
      position: { x: 1500, y: 300 },
    },

    // ── Stage 11: Write Report ──
    {
      id: 'write_report',
      type: 'graphNode',
      data: {
        label: 'Write Report',
        executorType: 'filesystem.write',
        description: 'Write the formatted report to Artefacts directory',
        toolRef: 'tool-filesystem-write',
        parameters: {
          path: 'reports/analysis-report.md',
          contentFromInput: true,
        },
        inputFormat: {
          content: { type: 'string', source: 'ai_format' },
        },
        outputFormat: {
          bytesWritten: { type: 'number' },
          path: { type: 'string' },
        },
      },
      position: { x: 1700, y: 300 },
    },

    // ── Stage 12: List Output Files ──
    {
      id: 'list_output',
      type: 'graphNode',
      data: {
        label: 'List Output Files',
        executorType: 'filesystem.list',
        description: 'List files in the reports directory to confirm output',
        toolRef: 'tool-filesystem-list',
        parameters: {
          path: 'reports',
          recursive: false,
        },
        inputFormat: {},
        outputFormat: {
          files: { type: 'array', description: 'List of output files' },
          count: { type: 'number' },
        },
      },
      position: { x: 1900, y: 300 },
    },

    // ── Stage 13: Set Result Variable ──
    {
      id: 'set_result',
      type: 'graphNode',
      data: {
        label: 'Set Result',
        executorType: 'common.set_variable',
        description: 'Store the final result in shared state for downstream access',
        toolRef: 'tool-common-set-variable',
        parameters: {
          key: 'pipeline_result',
          fromInput: true,
        },
        inputFormat: {
          result: { type: 'object', source: 'list_output' },
        },
        outputFormat: {
          variableSet: { type: 'string' },
        },
      },
      position: { x: 2100, y: 300 },
    },

    // ── Stage 14: Output ──
    {
      id: 'output',
      type: 'graphNode',
      data: {
        label: 'Pipeline Output',
        kind: 'output',
        executorType: 'common.passthrough',
        description: 'Final pipeline output aggregating all results',
        toolRef: 'tool-common-passthrough',
        parameters: {},
        inputFormat: {
          report: { type: 'object', source: 'set_result' },
        },
        outputFormat: {
          report: { type: 'object', description: 'Final aggregated output' },
        },
      },
      position: { x: 2300, y: 300 },
    },
  ],

  // ── EDGES ──────────────────────────────────────────────────────────────
  edges: [
    // Main flow
    { id: 'e01', source: 'input', target: 'validate_input', label: 'raw params',
      dataContract: {
        fields: { documentPath: 'string', outputFormat: 'string' },
        mapping: { 'input.documentPath': 'validate_input.documentPath' },
      } },
    { id: 'e02', source: 'validate_input', target: 'read_document', label: 'validated params',
      dataContract: {
        fields: { path: 'string' },
        mapping: { 'validate_input.input.documentPath': 'read_document.path' },
      } },

    // Read → AI Analyze (branch up)
    { id: 'e03', source: 'read_document', target: 'ai_analyze', label: 'document text',
      dataContract: {
        fields: { content: 'string' },
        mapping: { 'read_document.content': 'ai_analyze.content' },
      } },
    // Read → AI Summarize (branch down)
    { id: 'e04', source: 'read_document', target: 'ai_summarize', label: 'document text',
      dataContract: {
        fields: { content: 'string' },
        mapping: { 'read_document.content': 'ai_summarize.content' },
      } },

    // AI Analyze → Transform
    { id: 'e05', source: 'ai_analyze', target: 'transform_json', label: 'analysis JSON',
      dataContract: {
        fields: { topics: 'array', entities: 'array', sentiment: 'string' },
        mapping: { 'ai_analyze.*': 'transform_json.analysis' },
      } },

    // Transform → Log
    { id: 'e06', source: 'transform_json', target: 'log_analysis', label: 'structured analysis',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'transform_json.result': 'log_analysis.result' },
      } },

    // Transform → Merge (analysis branch)
    { id: 'e07', source: 'transform_json', target: 'merge_data', label: 'analysis data',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'transform_json.result': 'merge_data.analysis' },
      } },

    // Summarize → Merge (summary branch)
    { id: 'e08', source: 'ai_summarize', target: 'merge_data', label: 'summary text',
      dataContract: {
        fields: { summary: 'string' },
        mapping: { 'ai_summarize.*': 'merge_data.summary' },
      } },

    // Fetch Metadata → Merge (metadata branch)
    { id: 'e09', source: 'fetch_metadata', target: 'merge_data', label: 'external metadata',
      dataContract: {
        fields: { data: 'object' },
        mapping: { 'fetch_metadata.*': 'merge_data.metadata' },
      } },

    // Merge → Delay
    { id: 'e10', source: 'merge_data', target: 'delay_process', label: 'merged report data',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'merge_data.result': 'delay_process.data' },
      } },

    // Delay → AI Format
    { id: 'e11', source: 'delay_process', target: 'ai_format', label: 'report data',
      dataContract: {
        fields: { data: 'object' },
        mapping: { 'delay_process.*': 'ai_format.data' },
      } },

    // AI Format → Write Report
    { id: 'e12', source: 'ai_format', target: 'write_report', label: 'formatted report',
      dataContract: {
        fields: { content: 'string' },
        mapping: { 'ai_format.*': 'write_report.content' },
      } },

    // Write Report → List Output
    { id: 'e13', source: 'write_report', target: 'list_output', label: 'written confirmation',
      dataContract: {
        fields: { bytesWritten: 'number', path: 'string' },
        mapping: { 'write_report.*': 'list_output' },
      } },

    // List Output → Set Result
    { id: 'e14', source: 'list_output', target: 'set_result', label: 'file listing',
      dataContract: {
        fields: { files: 'array', count: 'number' },
        mapping: { 'list_output.*': 'set_result.result' },
      } },

    // Set Result → Output
    { id: 'e15', source: 'set_result', target: 'output', label: 'final result',
      dataContract: {
        fields: { result: 'object' },
        mapping: { 'set_result.*': 'output.report' },
      } },

    // Fetch Metadata also triggers from validate (parallel with read)
    { id: 'e16', source: 'validate_input', target: 'fetch_metadata', label: 'trigger metadata fetch',
      dataContract: {
        fields: {},
        mapping: {},
        note: 'Parallel branch: metadata fetched concurrently with document read',
      } },
  ],

  // ── REQUIRED PARAMS ────────────────────────────────────────────────────
  requiredParams: {
    documentPath: {
      type: 'string',
      description: 'Path to document file in Artefacts/ directory',
      required: true,
      default: 'sample-document.txt',
    },
    outputFormat: {
      type: 'string',
      description: 'Output format: markdown | json',
      default: 'markdown',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE TOOL-REFERENCE NODES + USES_TOOL EDGES
// ═══════════════════════════════════════════════════════════════════════════

const toolRefNodes = DEMO_GRAPH.nodes
  .filter(n => n.type === 'graphNode' && n.data?.toolRef)
  .map(n => {
    const toolId = n.data.toolRef;
    const trefId = `tref-${toolId.replace('tool-', '')}`;
    const xOffset = 260; // Side-by-side: tool-ref to the right of executor
    return {
      id: trefId,
      type: 'graphNode',
      data: {
        label: n.data.label,
        kind: 'tool',
        description: n.data.executorType,
        executorType: n.data.executorType,
        toolNodeId: toolId,
        pluginDomain: n.data.executorType.split('.')[0],
        isToolRef: true,
      },
      position: { x: n.position.x + xOffset, y: n.position.y },
    };
  });

const toolRefEdges = DEMO_GRAPH.nodes
  .filter(n => n.type === 'graphNode' && n.data?.toolRef)
  .map(n => {
    const toolId = n.data.toolRef;
    const trefId = `tref-${toolId.replace('tool-', '')}`;
    return {
      id: `et-${n.id}`,
      source: n.id,
      target: trefId,
      sourceHandle: 'tool-bind',
      targetHandle: 'tool-bind',
      label: 'USES_TOOL',
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5,5' },
      markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
      dataContract: { type: 'tool-binding', description: 'Executor → Tool binding reference' },
    };
  });

DEMO_GRAPH.nodes.push(...toolRefNodes);
DEMO_GRAPH.edges.push(...toolRefEdges);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: Write to Memgraph
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Seed: AI Document Analysis Pipeline → Core                ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Wait for memgraph service to initialize
  const memgraphService = require('../src/services/memgraph.service');

  let connected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (!memgraphService.driver) {
        console.log(`[${attempt}/5] Waiting for Memgraph driver...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      const session = memgraphService.driver.session();
      await session.run('RETURN 1');
      await session.close();
      connected = true;
      console.log(`[OK] Memgraph connected`);
      break;
    } catch (err) {
      console.warn(`[${attempt}/5] Memgraph not ready: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    console.error('[FAIL] Cannot connect to Memgraph. Exiting.');
    process.exit(1);
  }

  const { graphCatalogService } = require('../src/services/graphCatalog.service');

  // Check if graph already exists
  const existing = await graphCatalogService.listGraphs({
    namespace: 'core',
    search: 'AI Document Analysis Pipeline',
  });

  if (existing.data && existing.data.length > 0) {
    const existingGraph = existing.data.find(g => g.name === 'AI Document Analysis Pipeline');
    if (existingGraph) {
      console.log(`[UPDATE] Graph already exists (id: ${existingGraph.id}), updating...`);
      const updated = await graphCatalogService.updateGraph(existingGraph.id, {
        nodes: DEMO_GRAPH.nodes,
        edges: DEMO_GRAPH.edges,
        description: DEMO_GRAPH.description,
        version: DEMO_GRAPH.version,
        tags: DEMO_GRAPH.tags,
        requiredParams: DEMO_GRAPH.requiredParams,
      });
      console.log(`[OK] Graph updated: ${updated.name} (${updated.id})`);
      printSummary(updated);
      await cleanup();
      return;
    }
  }

  // Create new graph
  const created = await graphCatalogService.createGraph(DEMO_GRAPH);
  console.log(`[OK] Graph created: ${created.name} (${created.id})`);
  printSummary(created);
  await cleanup();
}

function printSummary(graph) {
  const nodes = typeof graph.nodes === 'string' ? JSON.parse(graph.nodes) : graph.nodes;
  const edges = typeof graph.edges === 'string' ? JSON.parse(graph.edges) : graph.edges;
  const execNodes = nodes.filter(n => n.type === 'graphNode' && !n.data?.isToolRef);
  const toolNodes = nodes.filter(n => n.data?.isToolRef);
  const dataEdges = edges.filter(e => e.label !== 'USES_TOOL');
  const toolEdges = edges.filter(e => e.label === 'USES_TOOL');

  // Count executors by domain
  const domains = {};
  for (const n of execNodes) {
    const domain = (n.data?.executorType || '').split('.')[0] || 'unknown';
    domains[domain] = (domains[domain] || 0) + 1;
  }

  console.log('\n┌─────────────────────────────────────────────────────────┐');
  console.log(`│ Graph: ${graph.name}`);
  console.log(`│ ID:    ${graph.id}`);
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Executor nodes:  ${execNodes.length}`);
  console.log(`│ Tool-ref badges: ${toolNodes.length}`);
  console.log(`│ Data-flow edges: ${dataEdges.length}`);
  console.log(`│ USES_TOOL edges: ${toolEdges.length}`);
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Domains: ${Object.entries(domains).map(([k, v]) => `${k}(${v})`).join(', ')}`);
  console.log('└─────────────────────────────────────────────────────────┘');
}

async function cleanup() {
  try {
    const memgraphService = require('../src/services/memgraph.service');
    if (memgraphService.driver) {
      await memgraphService.driver.close();
    }
  } catch (_) { /* ignore */ }
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

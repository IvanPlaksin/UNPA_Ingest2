/**
 * OpenAPI Documentation Routes
 *
 * Endpoints:
 *   GET /api/v1/docs          - OpenAPI 3.0 JSON specification
 *   GET /api/v1/docs/yaml     - OpenAPI 3.0 YAML specification
 *   GET /api/v1/docs/swagger  - Swagger UI page
 *   GET /api/v1/docs/redoc    - ReDoc documentation page
 *
 * @module routes/openapi.routes
 */

const express = require('express');
const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// OpenAPI 3.0 Specification
// ═══════════════════════════════════════════════════════════════════════════

const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'UN ProjectAdvisor API',
    description: `Knowledge Graph-powered AI system for legacy code documentation and institutional knowledge preservation.

## Architecture
- **Graph Database**: Memgraph/Neo4j for knowledge storage
- **Vector Store**: Qdrant for semantic search
- **LLM Integration**: Ollama, Gemini, Anthropic for entity extraction
- **Runtime Engine**: GXE DAG execution with AOPEG plugins
- **Real-time**: SSE streaming and WebSocket support

## Authentication
Currently no authentication required (internal use).

## Rate Limits
No enforced rate limits. Batch endpoints have per-request limits.`,
    version: '1.0.0',
    contact: { name: 'UN ProjectAdvisor' },
    license: { name: 'MIT' }
  },
  servers: [
    { url: '/api/v1', description: 'API v1' }
  ],
  tags: [
    { name: 'Query', description: 'Natural language query with hybrid retrieval (vector + graph)' },
    { name: 'Patterns', description: 'Entity & relation pattern management for extraction' },
    { name: 'Graph-RAG', description: 'Knowledge graph CRUD and GNN-RAG retrieval' },
    { name: 'Ingestion', description: 'Document upload, parsing, and extraction pipeline' },
    { name: 'Connectors', description: 'Source connector management (filesystem, TFS, SharePoint)' },
    { name: 'Jobs', description: 'Background job queue management' },
    { name: 'Visualization', description: 'Graph visualization data (D3, Three.js, Cytoscape)' },
    { name: 'Dashboard', description: 'Metrics, analytics, activity, and system overview' },
    { name: 'Export', description: 'Graph export (Cypher, GraphML, JSON-LD, GEXF, CSV, JSON)' },
    { name: 'Reports', description: 'Knowledge graph report generation' },
    { name: 'Runtime', description: 'GXE DAG execution engine with SSE streaming' },
    { name: 'AOPEG', description: 'AOPEG graph management, execution, and pattern library' },
    { name: 'AI Agent', description: 'AI Graph Builder agent sessions and chat' },
    { name: 'GXE', description: 'Graph Execution Engine — tool orchestration and scenarios' },
    { name: 'Graph Catalog', description: 'GXE graph catalog CRUD (atomic, tool, business, composite)' },
    { name: 'Immutable Graph', description: 'Bi-temporal versioned graph with God Mode' },
    { name: 'Tensor', description: 'Real-time performance monitoring and causal graphs' },
    { name: 'Tuning', description: 'Pipeline tuning sessions, configs, metrics, and LLM providers' },
    { name: 'Namespaces', description: 'CoreKnowledge / ProjectKnowledge namespace separation' },
    { name: 'Incremental KG', description: 'Incremental knowledge graph extraction pipeline' },
    { name: 'Knowledge', description: 'Legacy knowledge routes — ingestion, graph, search' },
    { name: 'Graph Types', description: 'Node/edge type definitions from Core KB' },
    { name: 'AI Infrastructure', description: 'AI provider configuration and usage tracking' },
    { name: 'Pipeline Lab', description: 'Interactive pipeline processing with SSE streaming' },
    { name: 'Health', description: 'Health checks, liveness, readiness probes' }
  ],

  // ═════════════════════════════════════════════════════════════════════════
  // PATHS
  // ═════════════════════════════════════════════════════════════════════════
  paths: {

    // ─────────────────────────────────────────────────────────────────────
    // QUERY (12 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/query': {
      post: {
        tags: ['Query'], summary: 'Execute natural language query',
        description: 'Hybrid retrieval: vector search + graph traversal + LLM reranking',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['query'],
          properties: {
            query: { type: 'string', maxLength: 1000, example: 'What is IMIS?' },
            mode: { type: 'string', enum: ['quick', 'full', 'explain'], default: 'full' },
            format: { type: 'string', enum: ['brief', 'detailed', 'structured'], default: 'detailed' },
            noCache: { type: 'boolean', default: false }
          }
        }}}},
        responses: {
          '200': { description: 'Query result with sources and confidence', content: { 'application/json': { schema: { $ref: '#/components/schemas/QueryResult' } } } },
          '400': { description: 'Invalid input' }
        }
      }
    },
    '/query/quick': { post: { tags: ['Query'], summary: 'Quick entity lookup (graph-only)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' } } } } } }, responses: { '200': { description: 'Quick result' } } } },
    '/query/explain': { post: { tags: ['Query'], summary: 'Query with step-by-step explanation', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, format: { type: 'string' } } } } } }, responses: { '200': { description: 'Result with explanation' } } } },
    '/query/batch': { post: { tags: ['Query'], summary: 'Batch queries (max 10)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['queries'], properties: { queries: { type: 'array', items: { type: 'string' }, maxItems: 10 }, mode: { type: 'string' }, format: { type: 'string' } } } } } }, responses: { '200': { description: 'Batch results' } } } },
    '/query/lookup/{entity}': { get: { tags: ['Query'], summary: 'Lookup entity by name', parameters: [{ name: 'entity', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Entity data' } } } },
    '/query/path': { get: { tags: ['Query'], summary: 'Find shortest path between entities', parameters: [{ name: 'from', in: 'query', required: true, schema: { type: 'string' } }, { name: 'to', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Path' } } } },
    '/query/count/{type}': { get: { tags: ['Query'], summary: 'Count entities of type', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Count' } } } },
    '/query/list/{type}': { get: { tags: ['Query'], summary: 'List entities of type', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Entity list' } } } },
    '/query/relations/{entity}': { get: { tags: ['Query'], summary: 'Get entity relationships', parameters: [{ name: 'entity', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Relations' } } } },
    '/query/compare': { get: { tags: ['Query'], summary: 'Compare two entities', parameters: [{ name: 'entity1', in: 'query', required: true, schema: { type: 'string' } }, { name: 'entity2', in: 'query', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Comparison' } } } },
    '/query/stats': { get: { tags: ['Query'], summary: 'Query engine statistics', responses: { '200': { description: 'Stats' } } } },
    '/query/cache/clear': { post: { tags: ['Query'], summary: 'Clear query cache', responses: { '200': { description: 'Cleared' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // PATTERNS (11 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/patterns/entity': {
      get: { tags: ['Patterns'], summary: 'List entity patterns', parameters: [{ name: 'domain', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'Patterns' } } },
      post: { tags: ['Patterns'], summary: 'Create entity pattern', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EntityPatternInput' } } } }, responses: { '201': { description: 'Created' } } }
    },
    '/patterns/entity/{id}': {
      get: { tags: ['Patterns'], summary: 'Get pattern', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Pattern' }, '404': { description: 'Not found' } } },
      put: { tags: ['Patterns'], summary: 'Update pattern', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/EntityPatternInput' } } } }, responses: { '200': { description: 'Updated' } } },
      delete: { tags: ['Patterns'], summary: 'Delete pattern', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } }
    },
    '/patterns/relation': {
      get: { tags: ['Patterns'], summary: 'List relation patterns', responses: { '200': { description: 'Patterns' } } },
      post: { tags: ['Patterns'], summary: 'Create relation pattern', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RelationPatternInput' } } } }, responses: { '201': { description: 'Created' } } }
    },
    '/patterns/subgraph': { get: { tags: ['Patterns'], summary: 'List subgraph patterns', responses: { '200': { description: 'Patterns' } } }, post: { tags: ['Patterns'], summary: 'Create subgraph pattern', responses: { '201': { description: 'Created' } } } },
    '/patterns/match': { post: { tags: ['Patterns'], summary: 'Match patterns against text', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, domain: { type: 'string' } } } } } }, responses: { '200': { description: 'Matches' } } } },
    '/patterns/extract': { post: { tags: ['Patterns'], summary: 'Pattern-based extraction', responses: { '200': { description: 'Extracted entities' } } } },
    '/patterns/learn': { post: { tags: ['Patterns'], summary: 'Learn from feedback', responses: { '200': { description: 'Learning result' } } } },
    '/patterns/export': { get: { tags: ['Patterns'], summary: 'Export all patterns', responses: { '200': { description: 'All patterns JSON' } } } },
    '/patterns/import': { post: { tags: ['Patterns'], summary: 'Import patterns', responses: { '200': { description: 'Import result' } } } },
    '/patterns/stats': { get: { tags: ['Patterns'], summary: 'Pattern library stats', responses: { '200': { description: 'Stats' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // GRAPH-RAG (13 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/graph-rag/stats': { get: { tags: ['Graph-RAG'], summary: 'Graph statistics', responses: { '200': { description: 'Stats' } } } },
    '/graph-rag/nodes': {
      get: { tags: ['Graph-RAG'], summary: 'List nodes', parameters: [{ name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } }, { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }], responses: { '200': { description: 'Nodes' } } },
      post: { tags: ['Graph-RAG'], summary: 'Add nodes', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nodes'], properties: { nodes: { type: 'array', items: { $ref: '#/components/schemas/NodeInput' } } } } } } }, responses: { '201': { description: 'Added' } } }
    },
    '/graph-rag/nodes/{id}': {
      get: { tags: ['Graph-RAG'], summary: 'Get node with edges', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Node' }, '404': { description: 'Not found' } } },
      delete: { tags: ['Graph-RAG'], summary: 'Delete node', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } }
    },
    '/graph-rag/edges': { get: { tags: ['Graph-RAG'], summary: 'List edges', responses: { '200': { description: 'Edges' } } }, post: { tags: ['Graph-RAG'], summary: 'Add edges', responses: { '201': { description: 'Added' } } } },
    '/graph-rag/retrieve': { post: { tags: ['Graph-RAG'], summary: 'GNN-RAG retrieval', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, topK: { type: 'integer', default: 10 }, maxHops: { type: 'integer', default: 2 } } } } } }, responses: { '200': { description: 'Results' } } } },
    '/graph-rag/retrieve/multihop': { post: { tags: ['Graph-RAG'], summary: 'Multi-hop query', responses: { '200': { description: 'Results' } } } },
    '/graph-rag/retrieve/hybrid': { post: { tags: ['Graph-RAG'], summary: 'Hybrid retrieval', responses: { '200': { description: 'Results' } } } },
    '/graph-rag/extract': { post: { tags: ['Graph-RAG'], summary: 'Unified extraction', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', maxLength: 10000 }, method: { type: 'string', enum: ['pattern', 'hybrid', 'gnn'] }, domain: { type: 'string' } } } } } }, responses: { '200': { description: 'Entities' } } } },
    '/graph-rag/extract/gnn': { post: { tags: ['Graph-RAG'], summary: 'GNN-enhanced extraction', responses: { '200': { description: 'Result' } } } },
    '/graph-rag/extract/batch': { post: { tags: ['Graph-RAG'], summary: 'Batch extraction (max 20)', responses: { '200': { description: 'Batch result' } } } },
    '/graph-rag/export': { get: { tags: ['Graph-RAG'], summary: 'Export full graph', responses: { '200': { description: 'Graph JSON' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // INGESTION (6 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/ingestion/text': { post: { tags: ['Ingestion'], summary: 'Ingest text content', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, format: { type: 'string', default: '.txt' }, domain: { type: 'string' }, metadata: { type: 'object' }, clientId: { type: 'string' } } } } } }, responses: { '200': { description: 'Result' }, '400': { description: 'Missing content' } } } },
    '/ingestion/file': { post: { tags: ['Ingestion'], summary: 'Upload and ingest file (max 10MB)', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, domain: { type: 'string' }, clientId: { type: 'string' } } } } } }, responses: { '200': { description: 'Result' } } } },
    '/ingestion/batch': { post: { tags: ['Ingestion'], summary: 'Ingest multiple documents (max 50)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['documents'], properties: { documents: { type: 'array', items: { type: 'object', properties: { content: { type: 'string' }, format: { type: 'string' } } }, maxItems: 50 }, domain: { type: 'string' } } } } } }, responses: { '200': { description: 'Batch result' } } } },
    '/ingestion/queue': { post: { tags: ['Ingestion'], summary: 'Queue for background processing', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' }, format: { type: 'string' }, domain: { type: 'string' } } } } } }, responses: { '202': { description: 'Queued' } } } },
    '/ingestion/formats': { get: { tags: ['Ingestion'], summary: 'Supported document formats', responses: { '200': { description: 'Formats' } } } },
    '/ingestion/stats': { get: { tags: ['Ingestion'], summary: 'Pipeline statistics', responses: { '200': { description: 'Stats' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // CONNECTORS (12 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/connectors': { get: { tags: ['Connectors'], summary: 'List connectors', responses: { '200': { description: 'List' } } } },
    '/connectors/register': { post: { tags: ['Connectors'], summary: 'Register connector', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'type'], properties: { name: { type: 'string' }, type: { type: 'string', enum: ['filesystem', 'tfs', 'sharepoint'] }, config: { type: 'object' } } } } } }, responses: { '201': { description: 'Registered' } } } },
    '/connectors/stats': { get: { tags: ['Connectors'], summary: 'Source manager stats', responses: { '200': { description: 'Stats' } } } },
    '/connectors/search': { post: { tags: ['Connectors'], summary: 'Search across sources', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } }, limit: { type: 'integer' } } } } } }, responses: { '200': { description: 'Results' } } } },
    '/connectors/{name}/status': { get: { tags: ['Connectors'], summary: 'Connector status', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Status' }, '404': { description: 'Not found' } } } },
    '/connectors/{name}/connect': { post: { tags: ['Connectors'], summary: 'Connect', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Connected' } } } },
    '/connectors/{name}/disconnect': { post: { tags: ['Connectors'], summary: 'Disconnect', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Disconnected' } } } },
    '/connectors/{name}/test': { post: { tags: ['Connectors'], summary: 'Test connection', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Test result' } } } },
    '/connectors/{name}/list': { get: { tags: ['Connectors'], summary: 'List items', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'path', in: 'query', schema: { type: 'string' } }, { name: 'depth', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'recursive', in: 'query', schema: { type: 'boolean', default: false } }], responses: { '200': { description: 'Items' } } } },
    '/connectors/{name}/fetch': { get: { tags: ['Connectors'], summary: 'Fetch item content', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'path', in: 'query', required: true, schema: { type: 'string' } }, { name: 'parse', in: 'query', schema: { type: 'boolean', default: true } }], responses: { '200': { description: 'Content' } } } },
    '/connectors/{name}/ingest': { post: { tags: ['Connectors'], summary: 'Fetch and ingest', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, domain: { type: 'string' } } } } } }, responses: { '200': { description: 'Ingested' } } } },
    '/connectors/{name}': { delete: { tags: ['Connectors'], summary: 'Unregister connector', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Removed' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // JOBS (9 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/jobs/extraction': { post: { tags: ['Jobs'], summary: 'Queue extraction job', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' }, domain: { type: 'string' }, options: { type: 'object' } } } } } }, responses: { '202': { description: 'Queued', content: { 'application/json': { schema: { $ref: '#/components/schemas/JobResponse' } } } } } } },
    '/jobs/batch': { post: { tags: ['Jobs'], summary: 'Queue batch job', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: {} }, batchSize: { type: 'integer', default: 5 } } } } } }, responses: { '202': { description: 'Queued' } } } },
    '/jobs/graph-update': { post: { tags: ['Jobs'], summary: 'Queue graph update', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { nodes: { type: 'array' }, edges: { type: 'array' }, operation: { type: 'string', enum: ['add', 'clear'], default: 'add' } } } } } }, responses: { '202': { description: 'Queued' } } } },
    '/jobs/stats': { get: { tags: ['Jobs'], summary: 'Queue statistics', responses: { '200': { description: 'Stats' } } } },
    '/jobs/queue/{name}/status': { get: { tags: ['Jobs'], summary: 'Queue status', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Status' } } } },
    '/jobs/queue/{name}/pause': { post: { tags: ['Jobs'], summary: 'Pause queue', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Paused' } } } },
    '/jobs/queue/{name}/resume': { post: { tags: ['Jobs'], summary: 'Resume queue', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Resumed' } } } },
    '/jobs/{queue}/{jobId}': {
      get: { tags: ['Jobs'], summary: 'Get job status', parameters: [{ name: 'queue', in: 'path', required: true, schema: { type: 'string' } }, { name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Status' }, '404': { description: 'Not found' } } },
      delete: { tags: ['Jobs'], summary: 'Cancel job', parameters: [{ name: 'queue', in: 'path', required: true, schema: { type: 'string' } }, { name: 'jobId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Cancelled' } } }
    },

    // ─────────────────────────────────────────────────────────────────────
    // VISUALIZATION (7 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/visualization/graph': { get: { tags: ['Visualization'], summary: 'Full graph for visualization', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['d3', 'cytoscape', 'vis', 'three'], default: 'd3' } }, { name: 'layout', in: 'query', schema: { type: 'string', enum: ['force', 'hierarchical', 'circular', 'grid'], default: 'force' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }, { name: 'computeLayout', in: 'query', schema: { type: 'boolean', default: true } }], responses: { '200': { description: 'Graph data' } } } },
    '/visualization/subgraph': { post: { tags: ['Visualization'], summary: 'Subgraph around nodes (BFS)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['nodeIds'], properties: { nodeIds: { type: 'array', items: { type: 'string' } }, depth: { type: 'integer', default: 1 }, format: { type: 'string' }, layout: { type: 'string' } } } } } }, responses: { '200': { description: 'Subgraph' } } } },
    '/visualization/filter': { post: { tags: ['Visualization'], summary: 'Filtered graph', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { nodeTypes: { type: 'array', items: { type: 'string' } }, edgeTypes: { type: 'array', items: { type: 'string' } }, search: { type: 'string' }, limit: { type: 'integer' } } } } } }, responses: { '200': { description: 'Filtered data' } } } },
    '/visualization/clusters': { get: { tags: ['Visualization'], summary: 'Graph clusters', parameters: [{ name: 'method', in: 'query', schema: { type: 'string', enum: ['type', 'community'], default: 'type' } }], responses: { '200': { description: 'Clusters' } } } },
    '/visualization/node-types': { get: { tags: ['Visualization'], summary: 'Node type summary', responses: { '200': { description: 'Types' } } } },
    '/visualization/edge-types': { get: { tags: ['Visualization'], summary: 'Edge type summary', responses: { '200': { description: 'Types' } } } },
    '/visualization/stats': { get: { tags: ['Visualization'], summary: 'Visualization stats', responses: { '200': { description: 'Stats' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // DASHBOARD (10 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/dashboard/overview': { get: { tags: ['Dashboard'], summary: 'System overview', responses: { '200': { description: 'Overview' } } } },
    '/dashboard/graph': { get: { tags: ['Dashboard'], summary: 'Graph metrics', responses: { '200': { description: 'Metrics' } } } },
    '/dashboard/queries': { get: { tags: ['Dashboard'], summary: 'Query analytics', responses: { '200': { description: 'Analytics' } } } },
    '/dashboard/extraction': { get: { tags: ['Dashboard'], summary: 'Extraction analytics', responses: { '200': { description: 'Analytics' } } } },
    '/dashboard/top-entities': { get: { tags: ['Dashboard'], summary: 'Top entities', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }, { name: 'sortBy', in: 'query', schema: { type: 'string', enum: ['connections', 'name'], default: 'connections' } }], responses: { '200': { description: 'Entities' } } } },
    '/dashboard/top-relations': { get: { tags: ['Dashboard'], summary: 'Top relations', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } }], responses: { '200': { description: 'Relations' } } } },
    '/dashboard/activity': {
      get: { tags: ['Dashboard'], summary: 'Recent activity', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }, { name: 'type', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Activities' } } },
      post: { tags: ['Dashboard'], summary: 'Log activity', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['type'], properties: { type: { type: 'string' }, data: { type: 'object' } } } } } }, responses: { '201': { description: 'Logged' } } }
    },
    '/dashboard/system': { get: { tags: ['Dashboard'], summary: 'System status', responses: { '200': { description: 'Status' } } } },
    '/dashboard/stats': { get: { tags: ['Dashboard'], summary: 'Dashboard stats', responses: { '200': { description: 'Stats' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // EXPORT (4 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/export/formats': { get: { tags: ['Export'], summary: 'Available formats', responses: { '200': { description: 'cypher, graphml, json-ld, gexf, csv, json' } } } },
    '/export/stats': { get: { tags: ['Export'], summary: 'Export statistics', responses: { '200': { description: 'Stats' } } } },
    '/export/{format}': { post: { tags: ['Export'], summary: 'Export graph', parameters: [{ name: 'format', in: 'path', required: true, schema: { type: 'string', enum: ['cypher', 'graphml', 'json-ld', 'gexf', 'csv', 'json'] } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { nodeTypes: { type: 'array', items: { type: 'string' } }, edgeTypes: { type: 'array', items: { type: 'string' } }, limit: { type: 'integer' }, baseUri: { type: 'string' } } } } } }, responses: { '200': { description: 'Export data' }, '400': { description: 'Unsupported format' } } } },
    '/export/{format}/download': { get: { tags: ['Export'], summary: 'Download export file', parameters: [{ name: 'format', in: 'path', required: true, schema: { type: 'string', enum: ['cypher', 'graphml', 'json-ld', 'gexf', 'csv', 'json'] } }, { name: 'nodeTypes', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'File download' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // REPORTS (8 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/reports/formats': { get: { tags: ['Reports'], summary: 'Available formats and types', responses: { '200': { description: 'Formats' } } } },
    '/reports/stats': { get: { tags: ['Reports'], summary: 'Generation statistics', responses: { '200': { description: 'Stats' } } } },
    '/reports/summary': { get: { tags: ['Reports'], summary: 'Graph summary report', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'markdown', 'html'] } }, { name: 'topN', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'Report' } } } },
    '/reports/entity/{id}': { get: { tags: ['Reports'], summary: 'Entity detail report', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'markdown', 'html'] } }], responses: { '200': { description: 'Report' } } } },
    '/reports/type/{type}': { get: { tags: ['Reports'], summary: 'Type analysis report', parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }, { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'markdown', 'html'] } }], responses: { '200': { description: 'Report' } } } },
    '/reports/relationships': { get: { tags: ['Reports'], summary: 'Relationship report', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'markdown', 'html'] } }], responses: { '200': { description: 'Report' } } } },
    '/reports/comparison': { post: { tags: ['Reports'], summary: 'Compare entities', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['entityIds'], properties: { entityIds: { type: 'array', items: { type: 'string' }, minItems: 2 }, format: { type: 'string' } } } } } }, responses: { '200': { description: 'Comparison' } } } },
    '/reports/timeline': { get: { tags: ['Reports'], summary: 'Activity timeline', parameters: [{ name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'markdown', 'html'] } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'Timeline' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // RUNTIME (10 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/runtime/health': { get: { tags: ['Runtime'], summary: 'Runtime health', responses: { '200': { description: 'Health' } } } },
    '/runtime/executors': { get: { tags: ['Runtime'], summary: 'List AOPEG executors', responses: { '200': { description: 'Executors' } } } },
    '/runtime/execute': { post: { tags: ['Runtime'], summary: 'Start DAG execution', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ExecuteRequest' } } } }, responses: { '200': { description: 'Started' }, '400': { description: 'Invalid DAG' } } } },
    '/runtime/execute-stream': { post: { tags: ['Runtime'], summary: 'Start + SSE combined', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ExecuteRequest' } } } }, responses: { '200': { description: 'SSE stream', content: { 'text/event-stream': {} } } } } },
    '/runtime/execute/{executionId}/stream': { get: { tags: ['Runtime'], summary: 'SSE execution updates', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } }, '404': { description: 'Not found' } } } },
    '/runtime/execute/{executionId}/status': { get: { tags: ['Runtime'], summary: 'Execution status', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Status' }, '404': { description: 'Not found' } } } },
    '/runtime/execute/{executionId}/cancel': { post: { tags: ['Runtime'], summary: 'Cancel execution', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Cancelled' } } } },
    '/runtime/execute/{executionId}/pause': { post: { tags: ['Runtime'], summary: 'Pause execution', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Paused' } } } },
    '/runtime/execute/{executionId}/resume': { post: { tags: ['Runtime'], summary: 'Resume execution', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'Resumed' } } } },
    '/runtime/executions/active': { get: { tags: ['Runtime'], summary: 'Active executions', responses: { '200': { description: 'List' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // AOPEG (22 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/aopeg/health': { get: { tags: ['AOPEG'], summary: 'Health check', responses: { '200': { description: 'Health' } } } },
    '/aopeg/graphs': { get: { tags: ['AOPEG'], summary: 'List graphs', responses: { '200': { description: 'Graphs' } } }, post: { tags: ['AOPEG'], summary: 'Create graph', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AOPEGGraphInput' } } } }, responses: { '201': { description: 'Created' } } } },
    '/aopeg/graphs/{graphId}': { get: { tags: ['AOPEG'], summary: 'Get graph', parameters: [{ name: 'graphId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Graph' } } }, put: { tags: ['AOPEG'], summary: 'Update graph', parameters: [{ name: 'graphId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } }, delete: { tags: ['AOPEG'], summary: 'Delete graph', parameters: [{ name: 'graphId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } } },
    '/aopeg/graphs/{graphId}/activate': { post: { tags: ['AOPEG'], summary: 'Activate graph', parameters: [{ name: 'graphId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Activated' } } } },
    '/aopeg/graphs/{graphId}/validate': { post: { tags: ['AOPEG'], summary: 'Validate graph', parameters: [{ name: 'graphId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Validation' } } } },
    '/aopeg/execute/{graphId}': { post: { tags: ['AOPEG'], summary: 'Execute graph', parameters: [{ name: 'graphId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Result' } } } },
    '/aopeg/executions': { get: { tags: ['AOPEG'], summary: 'List executions', responses: { '200': { description: 'List' } } } },
    '/aopeg/executions/active': { get: { tags: ['AOPEG'], summary: 'Active executions', responses: { '200': { description: 'Active' } } } },
    '/aopeg/executions/{executionId}': { get: { tags: ['AOPEG'], summary: 'Get execution', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Execution' } } } },
    '/aopeg/executions/{executionId}/cancel': { post: { tags: ['AOPEG'], summary: 'Cancel execution', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Cancelled' } } } },
    '/aopeg/stream/{executionId}': { get: { tags: ['AOPEG'], summary: 'SSE stream', parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },
    '/aopeg/registry/executors': { get: { tags: ['AOPEG'], summary: 'Registered executors', responses: { '200': { description: 'Executors' } } } },
    '/aopeg/registry/conditions': { get: { tags: ['AOPEG'], summary: 'Registered conditions', responses: { '200': { description: 'Conditions' } } } },
    '/aopeg/registry/transformers': { get: { tags: ['AOPEG'], summary: 'Registered transformers', responses: { '200': { description: 'Transformers' } } } },
    '/aopeg/stats': { get: { tags: ['AOPEG'], summary: 'Statistics', responses: { '200': { description: 'Stats' } } } },
    '/aopeg/examples': { get: { tags: ['AOPEG'], summary: 'Example graphs', responses: { '200': { description: 'Examples' } } } },
    '/aopeg/examples/{exampleId}/import': { post: { tags: ['AOPEG'], summary: 'Import example', parameters: [{ name: 'exampleId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Imported' } } } },
    '/aopeg/patterns/stats': { get: { tags: ['AOPEG'], summary: 'Pattern stats', responses: { '200': { description: 'Stats' } } } },
    '/aopeg/patterns/warmup': { post: { tags: ['AOPEG'], summary: 'Warmup cache', responses: { '200': { description: 'Warmed' } } } },
    '/aopeg/patterns/{category}': { get: { tags: ['AOPEG'], summary: 'Best pattern', parameters: [{ name: 'category', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Pattern' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // AI AGENT (16 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/ai-agent/health': { get: { tags: ['AI Agent'], summary: 'Health', responses: { '200': { description: 'OK' } } } },
    '/ai-agent/sessions': { post: { tags: ['AI Agent'], summary: 'Start session', responses: { '201': { description: 'Created' } } } },
    '/ai-agent/sessions/{sessionId}': { get: { tags: ['AI Agent'], summary: 'Get session', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Session' } } }, delete: { tags: ['AI Agent'], summary: 'End session', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Final graph' } } } },
    '/ai-agent/sessions/{sessionId}/chat': { post: { tags: ['AI Agent'], summary: 'Send message', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['message'], properties: { message: { type: 'string' } } } } } }, responses: { '200': { description: 'Response' } } } },
    '/ai-agent/sessions/{sessionId}/chat/stream': { post: { tags: ['AI Agent'], summary: 'Chat (SSE)', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },
    '/ai-agent/sessions/{sessionId}/graph/import': { post: { tags: ['AI Agent'], summary: 'Import graph', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Imported' } } } },
    '/ai-agent/sessions/{sessionId}/graph': { get: { tags: ['AI Agent'], summary: 'Export graph', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Graph' } } } },
    '/ai-agent/sessions/{sessionId}/history': { get: { tags: ['AI Agent'], summary: 'History', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'History' } } }, delete: { tags: ['AI Agent'], summary: 'Clear history', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Cleared' } } } },
    '/ai-agent/tools': { get: { tags: ['AI Agent'], summary: 'Available tools', responses: { '200': { description: 'Tools' } } } },
    '/ai-agent/sessions/{sessionId}/tools/{toolName}': { post: { tags: ['AI Agent'], summary: 'Execute tool', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'toolName', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Result' } } } },
    '/ai-agent/models': { get: { tags: ['AI Agent'], summary: 'Available models', responses: { '200': { description: 'Models' } } } },
    '/ai-agent/sessions/{sessionId}/model': { put: { tags: ['AI Agent'], summary: 'Change model', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Changed' } } } },
    '/ai-agent/usage': { get: { tags: ['AI Agent'], summary: 'Usage stats', responses: { '200': { description: 'Stats' } } } },
    '/ai-agent/usage/summary': { get: { tags: ['AI Agent'], summary: 'Usage summary', responses: { '200': { description: 'Summary' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // GXE (15 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/gxe/generate': { post: { tags: ['GXE'], summary: 'Generate graph from text (AI)', responses: { '200': { description: 'Graph' } } } },
    '/gxe/models': { get: { tags: ['GXE'], summary: 'Available models', responses: { '200': { description: 'Models' } } } },
    '/gxe/tools': { get: { tags: ['GXE'], summary: 'Tool hierarchy', responses: { '200': { description: 'Tools' } } } },
    '/gxe/capabilities': { get: { tags: ['GXE'], summary: 'Tool capabilities', responses: { '200': { description: 'Capabilities' } } } },
    '/gxe/execute': { post: { tags: ['GXE'], summary: 'Execute scenario', responses: { '200': { description: 'Result' } } } },
    '/gxe/stream/{sessionId}': { get: { tags: ['GXE'], summary: 'SSE execution stream', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },
    '/gxe/scenarios': { get: { tags: ['GXE'], summary: 'Scenario templates', responses: { '200': { description: 'Scenarios' } } }, post: { tags: ['GXE'], summary: 'Create scenario', responses: { '201': { description: 'Created' } } } },
    '/gxe/history': { get: { tags: ['GXE'], summary: 'Execution history', responses: { '200': { description: 'History' } } } },
    '/gxe/mcp-tools': { get: { tags: ['GXE'], summary: 'MCP tools list', responses: { '200': { description: 'Tools' } } } },
    '/gxe/mcp-settings': { get: { tags: ['GXE'], summary: 'MCP settings profiles', responses: { '200': { description: 'Profiles' } } }, post: { tags: ['GXE'], summary: 'Save MCP settings', responses: { '200': { description: 'Saved' } } } },
    '/gxe/mcp-settings/{settingsId}': { get: { tags: ['GXE'], summary: 'Load settings', parameters: [{ name: 'settingsId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Settings' } } }, delete: { tags: ['GXE'], summary: 'Delete settings', parameters: [{ name: 'settingsId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } } },
    '/gxe/ab-test': { post: { tags: ['GXE'], summary: 'A/B test (SDA vs Legacy)', responses: { '200': { description: 'Results' } } } },
    '/gxe/test-corpus': { get: { tags: ['GXE'], summary: 'Test corpus', responses: { '200': { description: 'Corpus' } } } },
    '/gxe/health': { get: { tags: ['GXE'], summary: 'Health (cached 60s)', responses: { '200': { description: 'Health' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // GRAPH CATALOG (12 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/graph-catalog': { get: { tags: ['Graph Catalog'], summary: 'List graphs', parameters: [{ name: 'namespace', in: 'query', schema: { type: 'string' } }, { name: 'type', in: 'query', schema: { type: 'string', enum: ['atomic', 'tool', 'business', 'composite', 'template'] } }, { name: 'search', in: 'query', schema: { type: 'string' } }, { name: 'tags', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }], responses: { '200': { description: 'Paginated list' } } }, post: { tags: ['Graph Catalog'], summary: 'Create graph', requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/GraphCatalogInput' } } } }, responses: { '201': { description: 'Created' } } } },
    '/graph-catalog/status': { get: { tags: ['Graph Catalog'], summary: 'DB connection status', responses: { '200': { description: 'Status' } } } },
    '/graph-catalog/tree': { get: { tags: ['Graph Catalog'], summary: 'Tree by type', parameters: [{ name: 'namespace', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Tree' } } } },
    '/graph-catalog/namespaces': { get: { tags: ['Graph Catalog'], summary: 'Namespaces with counts', responses: { '200': { description: 'Namespaces' } } } },
    '/graph-catalog/labels': { get: { tags: ['Graph Catalog'], summary: 'Labels/tags (cached 5m)', responses: { '200': { description: 'Labels' } } } },
    '/graph-catalog/types': { get: { tags: ['Graph Catalog'], summary: 'Graph types with counts', responses: { '200': { description: 'Types' } } } },
    '/graph-catalog/{id}': { get: { tags: ['Graph Catalog'], summary: 'Get graph', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Graph' }, '404': { description: 'Not found' } } }, put: { tags: ['Graph Catalog'], summary: 'Update graph', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } }, delete: { tags: ['Graph Catalog'], summary: 'Delete graph', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } } },
    '/graph-catalog/{id}/subgraphs': { get: { tags: ['Graph Catalog'], summary: 'Sub-graphs', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Sub-graphs' } } } },
    '/graph-catalog/{id}/subgraphs/{nodeId}': { get: { tags: ['Graph Catalog'], summary: 'Sub-graph for node', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'nodeId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Sub-graph' } } } },
    '/graph-catalog/{id}/clone': { post: { tags: ['Graph Catalog'], summary: 'Clone graph', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Cloned' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // IMMUTABLE GRAPH (22 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/graph/nodes': { post: { tags: ['Immutable Graph'], summary: 'Create versioned node', responses: { '201': { description: 'Created' } } } },
    '/graph/nodes/{entityId}': { get: { tags: ['Immutable Graph'], summary: 'Get node', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Node' } } }, patch: { tags: ['Immutable Graph'], summary: 'Update (new version)', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'New version' } } } },
    '/graph/nodes/{entityId}/deprecate': { post: { tags: ['Immutable Graph'], summary: 'Deprecate', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deprecated' } } } },
    '/graph/nodes/merge': { post: { tags: ['Immutable Graph'], summary: 'Merge nodes', responses: { '200': { description: 'Merged' } } } },
    '/graph/nodes/{entityId}/lineage': { get: { tags: ['Immutable Graph'], summary: 'Version lineage', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Lineage' } } } },
    '/graph/nodes/{entityId}/verify-chain': { get: { tags: ['Immutable Graph'], summary: 'Verify hash chain', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Verification' } } } },
    '/graph/nodes/{entityId}/edges': { get: { tags: ['Immutable Graph'], summary: 'Connected edges', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Edges' } } } },
    '/graph/edges': { post: { tags: ['Immutable Graph'], summary: 'Create edge', responses: { '201': { description: 'Created' } } } },
    '/graph/edges/{edgeId}': { get: { tags: ['Immutable Graph'], summary: 'Get edge', parameters: [{ name: 'edgeId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Edge' } } } },
    '/graph/edges/{edgeId}/deprecate': { post: { tags: ['Immutable Graph'], summary: 'Deprecate edge', parameters: [{ name: 'edgeId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deprecated' } } } },
    '/graph/query/nodes': { get: { tags: ['Immutable Graph'], summary: 'Temporal node query', responses: { '200': { description: 'Nodes' } } } },
    '/graph/god-mode/activate': { post: { tags: ['Immutable Graph'], summary: 'Activate God Mode', responses: { '200': { description: 'Activated' } } } },
    '/graph/god-mode/deactivate': { post: { tags: ['Immutable Graph'], summary: 'Deactivate God Mode', responses: { '200': { description: 'Deactivated' } } } },
    '/graph/god-mode/status': { get: { tags: ['Immutable Graph'], summary: 'God Mode status', responses: { '200': { description: 'Status' } } } },
    '/graph/god-mode/delete/{entityId}/mark': { post: { tags: ['Immutable Graph'], summary: 'Mark for deletion', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Marked' } } } },
    '/graph/god-mode/delete/{entityId}/confirm': { post: { tags: ['Immutable Graph'], summary: 'Confirm deletion', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } } },
    '/graph/god-mode/audit/{entityId}': { get: { tags: ['Immutable Graph'], summary: 'Entity audit trail', parameters: [{ name: 'entityId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Audit' } } } },
    '/graph/god-mode/session/{sessionId}/audit': { get: { tags: ['Immutable Graph'], summary: 'Session audit', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Audit' } } } },
    '/graph/sse/events': { get: { tags: ['Immutable Graph'], summary: 'Graph SSE stream', responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },
    '/graph/sse/events/god-mode': { get: { tags: ['Immutable Graph'], summary: 'God Mode SSE', responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },

    // ─────────────────────────────────────────────────────────────────────
    // TENSOR (13 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/tensors/status': { get: { tags: ['Tensor'], summary: 'Full status with DB info', responses: { '200': { description: 'Status' } } } },
    '/tensors/metrics': { get: { tags: ['Tensor'], summary: 'All metrics', responses: { '200': { description: 'Metrics' } } } },
    '/tensors/metrics/{name}': { get: { tags: ['Tensor'], summary: 'Metrics by tensor type', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Metrics' } } } },
    '/tensors/active': { get: { tags: ['Tensor'], summary: 'Active tensors', responses: { '200': { description: 'Active' } } } },
    '/tensors/recent': { get: { tags: ['Tensor'], summary: 'Recent tensors', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } }], responses: { '200': { description: 'Recent' } } } },
    '/tensors/alerts': { get: { tags: ['Tensor'], summary: 'Alerts', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }], responses: { '200': { description: 'Alerts' } } } },
    '/tensors/graph': { get: { tags: ['Tensor'], summary: 'Causal graph', responses: { '200': { description: 'Graph' } } } },
    '/tensors/threshold': { post: { tags: ['Tensor'], summary: 'Set threshold', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'thresholdMs'], properties: { name: { type: 'string' }, thresholdMs: { type: 'number' } } } } } }, responses: { '200': { description: 'Set' } } } },
    '/tensors/toggle': { post: { tags: ['Tensor'], summary: 'Toggle monitoring', responses: { '200': { description: 'Toggled' } } } },
    '/tensors/enable': { post: { tags: ['Tensor'], summary: 'Enable', responses: { '200': { description: 'Enabled' } } } },
    '/tensors/disable': { post: { tags: ['Tensor'], summary: 'Disable', responses: { '200': { description: 'Disabled' } } } },
    '/tensors/connections': { get: { tags: ['Tensor'], summary: 'Connection details', responses: { '200': { description: 'Connections' } } } },
    '/tensors/stream': { get: { tags: ['Tensor'], summary: 'SSE stream (2s interval)', responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },

    // ─────────────────────────────────────────────────────────────────────
    // TUNING (26 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/tuning/start': { post: { tags: ['Tuning'], summary: 'Start session', requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { maxIterations: { type: 'integer', default: 50 }, targetMetric: { type: 'string', default: 'f1_score' }, strategy: { type: 'string', enum: ['bayesian', 'random', 'grid'] } } } } } }, responses: { '200': { description: 'Started' } } } },
    '/tuning/auto': { post: { tags: ['Tuning'], summary: 'Auto-tune', responses: { '200': { description: 'Results' } } } },
    '/tuning/status': { get: { tags: ['Tuning'], summary: 'Tuning status', responses: { '200': { description: 'Status' } } } },
    '/tuning/{sessionId}/iterate': { post: { tags: ['Tuning'], summary: 'One iteration', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Result' } } } },
    '/tuning/{sessionId}/history': { get: { tags: ['Tuning'], summary: 'Session history', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'History' } } } },
    '/tuning/{sessionId}/export': { get: { tags: ['Tuning'], summary: 'Export session', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Data' } } } },
    '/tuning/{sessionId}/pause': { post: { tags: ['Tuning'], summary: 'Pause', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Paused' } } } },
    '/tuning/{sessionId}/resume': { post: { tags: ['Tuning'], summary: 'Resume', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Resumed' } } } },
    '/tuning/{sessionId}/stop': { post: { tags: ['Tuning'], summary: 'Stop', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Stopped' } } } },
    '/tuning/config': { get: { tags: ['Tuning'], summary: 'Current config', responses: { '200': { description: 'Config' } } }, put: { tags: ['Tuning'], summary: 'Update config', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { updates: { type: 'object' }, persist: { type: 'boolean', default: true } } } } } }, responses: { '200': { description: 'Updated' }, '400': { description: 'Invalid' } } } },
    '/tuning/config/reset': { post: { tags: ['Tuning'], summary: 'Reset to defaults', responses: { '200': { description: 'Reset' } } } },
    '/tuning/parameters': { get: { tags: ['Tuning'], summary: 'Tunable parameters', responses: { '200': { description: 'Parameters' } } } },
    '/tuning/profiles': { get: { tags: ['Tuning'], summary: 'Config profiles', responses: { '200': { description: 'Profiles' } } } },
    '/tuning/profiles/{name}/load': { post: { tags: ['Tuning'], summary: 'Load profile', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Loaded' } } } },
    '/tuning/profiles/{name}/save': { post: { tags: ['Tuning'], summary: 'Save profile', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Saved' } } } },
    '/tuning/metrics': { get: { tags: ['Tuning'], summary: 'Metric aggregates', responses: { '200': { description: 'Aggregates' } } } },
    '/tuning/metrics/best': { get: { tags: ['Tuning'], summary: 'Best run', parameters: [{ name: 'metric', in: 'query', schema: { type: 'string', default: 'f1_score' } }], responses: { '200': { description: 'Best' } } } },
    '/tuning/metrics/{metricName}/trend': { get: { tags: ['Tuning'], summary: 'Metric trend', parameters: [{ name: 'metricName', in: 'path', required: true, schema: { type: 'string' } }, { name: 'window', in: 'query', schema: { type: 'integer', default: 10 } }], responses: { '200': { description: 'Trend' } } } },
    '/tuning/evaluate': { post: { tags: ['Tuning'], summary: 'Evaluate config', responses: { '200': { description: 'Evaluation' } } } },
    '/tuning/recommendations': { post: { tags: ['Tuning'], summary: 'Recommendations', responses: { '200': { description: 'Recommendations' } } } },
    '/tuning/compare': { post: { tags: ['Tuning'], summary: 'Compare configs', responses: { '200': { description: 'Comparison' } } } },
    '/tuning/extract': { post: { tags: ['Tuning'], summary: 'Extract with config', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string' } } } } } }, responses: { '200': { description: 'Extraction' } } } },
    '/tuning/providers': { get: { tags: ['Tuning'], summary: 'LLM providers', responses: { '200': { description: 'Providers' } } } },
    '/tuning/providers/{name}/select': { post: { tags: ['Tuning'], summary: 'Set active provider', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Switched' } } } },
    '/tuning/providers/{name}/test': { post: { tags: ['Tuning'], summary: 'Test provider', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 10 } } } } } }, responses: { '200': { description: 'Result' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // NAMESPACES (10 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/namespaces': { get: { tags: ['Namespaces'], summary: 'List namespaces', responses: { '200': { description: 'List' } } } },
    '/namespaces/projects': { get: { tags: ['Namespaces'], summary: 'Project namespaces', responses: { '200': { description: 'Projects' } } } },
    '/namespaces/route': { post: { tags: ['Namespaces'], summary: 'Route query to namespace', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['query'], properties: { query: { type: 'string' }, explicitNamespace: { type: 'string' } } } } } }, responses: { '200': { description: 'Routing' } } } },
    '/namespaces/search': { post: { tags: ['Namespaces'], summary: 'Cross-namespace search', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['vector'], properties: { query: { type: 'string' }, vector: { type: 'array', items: { type: 'number' } }, namespaces: { type: 'array', items: { type: 'string' } }, limit: { type: 'integer', default: 10 } } } } } }, responses: { '200': { description: 'Results' } } } },
    '/namespaces/migrate': { post: { tags: ['Namespaces'], summary: 'Migrate nodes (Admin)', responses: { '200': { description: 'Migrated' } } } },
    '/namespaces/validate': { post: { tags: ['Namespaces'], summary: 'Validate consistency', responses: { '200': { description: 'Validation' } } } },
    '/namespaces/init': { post: { tags: ['Namespaces'], summary: 'Initialize collections', responses: { '200': { description: 'Initialized' } } } },
    '/namespaces/{namespace}/stats': { get: { tags: ['Namespaces'], summary: 'Namespace stats', parameters: [{ name: 'namespace', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Stats' } } } },
    '/namespaces/{namespace}/nodes': { get: { tags: ['Namespaces'], summary: 'Namespace nodes', parameters: [{ name: 'namespace', in: 'path', required: true, schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 100 } }, { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } }], responses: { '200': { description: 'Nodes' } } }, post: { tags: ['Namespaces'], summary: 'Create node', parameters: [{ name: 'namespace', in: 'path', required: true, schema: { type: 'string' } }], responses: { '201': { description: 'Created' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // INCREMENTAL KG (20 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/incremental-kg/rounds/start': { post: { tags: ['Incremental KG'], summary: 'Start round', responses: { '200': { description: 'Started' } } } },
    '/incremental-kg/rounds/{runId}/stop': { post: { tags: ['Incremental KG'], summary: 'Stop round', parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Stopped' } } } },
    '/incremental-kg/rounds/{runId}/status': { get: { tags: ['Incremental KG'], summary: 'Run status', parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Status' } } } },
    '/incremental-kg/rounds': { get: { tags: ['Incremental KG'], summary: 'All rounds', responses: { '200': { description: 'Rounds' } } } },
    '/incremental-kg/rounds/{roundNumber}/stats': { get: { tags: ['Incremental KG'], summary: 'Round stats', parameters: [{ name: 'roundNumber', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Stats' } } } },
    '/incremental-kg/process/text': { post: { tags: ['Incremental KG'], summary: 'Process text', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['text'], properties: { text: { type: 'string', minLength: 10 }, sourceId: { type: 'string' }, namespace: { type: 'string' }, model: { type: 'string' }, provider: { type: 'string', enum: ['ollama', 'gemini', 'anthropic'] }, useLLM: { type: 'boolean' }, useRegex: { type: 'boolean' }, minConfidence: { type: 'number' } } } } } }, responses: { '200': { description: 'Result' } } } },
    '/incremental-kg/process/document': { post: { tags: ['Incremental KG'], summary: 'Process document', responses: { '200': { description: 'Result' } } } },
    '/incremental-kg/process/batch': { post: { tags: ['Incremental KG'], summary: 'Process batch', responses: { '200': { description: 'Result' } } } },
    '/incremental-kg/process/extract-only': { post: { tags: ['Incremental KG'], summary: 'Extract only (step 1)', responses: { '200': { description: 'Entities' } } } },
    '/incremental-kg/process/resolve': { post: { tags: ['Incremental KG'], summary: 'Resolve entities (step 2)', responses: { '200': { description: 'Resolution' } } } },
    '/incremental-kg/process/relationships': { post: { tags: ['Incremental KG'], summary: 'Extract relationships (step 3)', responses: { '200': { description: 'Relationships' } } } },
    '/incremental-kg/process/store': { post: { tags: ['Incremental KG'], summary: 'Store to graph (step 4)', responses: { '200': { description: 'Stored' } } } },
    '/incremental-kg/entities': { get: { tags: ['Incremental KG'], summary: 'Get entities', parameters: [{ name: 'round', in: 'query', schema: { type: 'integer' } }, { name: 'type', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }], responses: { '200': { description: 'Entities' } } } },
    '/incremental-kg/relationships': { get: { tags: ['Incremental KG'], summary: 'Get relationships', parameters: [{ name: 'round', in: 'query', schema: { type: 'integer' } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 50 } }], responses: { '200': { description: 'Relationships' } } } },
    '/incremental-kg/graph/stats': { get: { tags: ['Incremental KG'], summary: 'Graph stats', responses: { '200': { description: 'Stats' } } } },
    '/incremental-kg/graph/context': { post: { tags: ['Incremental KG'], summary: 'Graph context for entities', responses: { '200': { description: 'Context' } } } },
    '/incremental-kg/graph/existing': { get: { tags: ['Incremental KG'], summary: 'Existing graph data', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 200 } }, { name: 'currentRound', in: 'query', schema: { type: 'integer' } }], responses: { '200': { description: 'Graph' } } } },
    '/incremental-kg/stats': { get: { tags: ['Incremental KG'], summary: 'Pipeline stats', responses: { '200': { description: 'Stats' } } } },
    '/incremental-kg/provenance/export': { get: { tags: ['Incremental KG'], summary: 'Export provenance', responses: { '200': { description: 'State' } } } },
    '/incremental-kg/provenance/import': { post: { tags: ['Incremental KG'], summary: 'Import provenance', responses: { '200': { description: 'Imported' } } } },
    '/incremental-kg/stream/{runId}': { get: { tags: ['Incremental KG'], summary: 'SSE extraction stream', parameters: [{ name: 'runId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },

    // ─────────────────────────────────────────────────────────────────────
    // GRAPH TYPES (8 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/graph-types/node-types': { get: { tags: ['Graph Types'], summary: 'List node types', parameters: [{ name: 'domain', in: 'query', schema: { type: 'string' } }, { name: 'category', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Types' } } }, post: { tags: ['Graph Types'], summary: 'Create node type', responses: { '201': { description: 'Created' } } } },
    '/graph-types/node-types/{fullName}': { get: { tags: ['Graph Types'], summary: 'Get node type', parameters: [{ name: 'fullName', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Type' }, '404': { description: 'Not found' } } }, put: { tags: ['Graph Types'], summary: 'Update type', parameters: [{ name: 'fullName', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } }, delete: { tags: ['Graph Types'], summary: 'Delete type', parameters: [{ name: 'fullName', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Deleted' } } } },
    '/graph-types/edge-types': { get: { tags: ['Graph Types'], summary: 'List edge types', responses: { '200': { description: 'Types' } } } },
    '/graph-types/edge-types/{name}': { get: { tags: ['Graph Types'], summary: 'Get edge type', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Type' } } } },
    '/graph-types/domains': { get: { tags: ['Graph Types'], summary: 'List domains', responses: { '200': { description: 'Domains' } } } },
    '/graph-types/compatibility/{sourceType}': { get: { tags: ['Graph Types'], summary: 'Compatible types', parameters: [{ name: 'sourceType', in: 'path', required: true, schema: { type: 'string' } }, { name: 'edgeType', in: 'query', schema: { type: 'string' } }], responses: { '200': { description: 'Compatible' } } } },
    '/graph-types/catalog': { get: { tags: ['Graph Types'], summary: 'Full type catalog', responses: { '200': { description: 'Catalog' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // AI INFRASTRUCTURE (10 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/ainfra/status': { get: { tags: ['AI Infrastructure'], summary: 'Full status', responses: { '200': { description: 'Status' } } } },
    '/ainfra/configs': { get: { tags: ['AI Infrastructure'], summary: 'List configs', responses: { '200': { description: 'Configs' } } }, post: { tags: ['AI Infrastructure'], summary: 'Create config', responses: { '201': { description: 'Created' } } } },
    '/ainfra/configs/active': { get: { tags: ['AI Infrastructure'], summary: 'Active config', responses: { '200': { description: 'Config' } } } },
    '/ainfra/configs/{name}': { get: { tags: ['AI Infrastructure'], summary: 'Get config', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Config' } } } },
    '/ainfra/configs/{name}/activate': { put: { tags: ['AI Infrastructure'], summary: 'Activate config', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Activated' } } } },
    '/ainfra/configs/{name}/providers/{provider}': { patch: { tags: ['AI Infrastructure'], summary: 'Update provider', parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }, { name: 'provider', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Updated' } } } },
    '/ainfra/usage/snapshot': { post: { tags: ['AI Infrastructure'], summary: 'Save snapshot', responses: { '200': { description: 'Saved' } } } },
    '/ainfra/usage/history': { get: { tags: ['AI Infrastructure'], summary: 'Usage history', responses: { '200': { description: 'History' } } } },
    '/ainfra/alerts': { get: { tags: ['AI Infrastructure'], summary: 'Recent alerts', responses: { '200': { description: 'Alerts' } } } },
    '/ainfra/alerts/{id}/acknowledge': { post: { tags: ['AI Infrastructure'], summary: 'Acknowledge alert', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Acknowledged' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // PIPELINE LAB (7 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/pipeline-lab/process': { post: { tags: ['Pipeline Lab'], summary: 'Start pipeline', responses: { '200': { description: 'Started' } } } },
    '/pipeline-lab/stream/{sessionId}': { get: { tags: ['Pipeline Lab'], summary: 'SSE stream', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'SSE', content: { 'text/event-stream': {} } } } } },
    '/pipeline-lab/stage/{stageId}/rerun': { post: { tags: ['Pipeline Lab'], summary: 'Rerun stage', parameters: [{ name: 'stageId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Result' } } } },
    '/pipeline-lab/stage/{stageId}/edit': { post: { tags: ['Pipeline Lab'], summary: 'Edit stage output', parameters: [{ name: 'stageId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Edited' } } } },
    '/pipeline-lab/graph/{sessionId}': { get: { tags: ['Pipeline Lab'], summary: 'Session graph', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Graph' } } } },
    '/pipeline-lab/export/{sessionId}': { post: { tags: ['Pipeline Lab'], summary: 'Export graph', parameters: [{ name: 'sessionId', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Export' } } } },
    '/pipeline-lab/health': { get: { tags: ['Pipeline Lab'], summary: 'Health', responses: { '200': { description: 'OK' } } } },

    // ─────────────────────────────────────────────────────────────────────
    // SYSTEM HEALTH (5 endpoints)
    // ─────────────────────────────────────────────────────────────────────
    '/system/health': { get: { tags: ['Health'], summary: 'Health check', responses: { '200': { description: 'Healthy' } } } },
    '/system/live': { get: { tags: ['Health'], summary: 'Liveness probe', responses: { '200': { description: 'Alive' } } } },
    '/system/ready': { get: { tags: ['Health'], summary: 'Readiness probe', responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } } } },
    '/system/status': { get: { tags: ['Health'], summary: 'Full system status', responses: { '200': { description: 'Status' } } } },
    '/system/stats': { get: { tags: ['Health'], summary: 'Aggregated stats', responses: { '200': { description: 'Stats' } } } }
  },

  // ═════════════════════════════════════════════════════════════════════════
  // COMPONENT SCHEMAS
  // ═════════════════════════════════════════════════════════════════════════
  components: {
    schemas: {
      QueryResult: { type: 'object', properties: { success: { type: 'boolean' }, answer: { type: 'string' }, sources: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, score: { type: 'number' } } } }, confidence: { type: 'number' }, cached: { type: 'boolean' }, latencyMs: { type: 'number' } } },
      EntityPatternInput: { type: 'object', required: ['name', 'entityType', 'namePatterns'], properties: { name: { type: 'string' }, entityType: { type: 'string' }, namePatterns: { type: 'array', items: { type: 'string' } }, contextKeywords: { type: 'array', items: { type: 'string' } }, domain: { type: 'string', default: 'general' }, priority: { type: 'integer', default: 5 }, confidence: { type: 'number', default: 0.8 } } },
      RelationPatternInput: { type: 'object', required: ['name', 'relationType', 'verbPatterns'], properties: { name: { type: 'string' }, relationType: { type: 'string' }, verbPatterns: { type: 'array', items: { type: 'string' } }, subjectTypes: { type: 'array', items: { type: 'string' } }, objectTypes: { type: 'array', items: { type: 'string' } } } },
      NodeInput: { type: 'object', required: ['name'], properties: { id: { type: 'string' }, name: { type: 'string' }, type: { type: 'string' }, attributes: { type: 'object' } } },
      ExecuteRequest: { type: 'object', required: ['dag'], properties: { dag: { type: 'object', required: ['nodes'], properties: { nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } } }, inputData: { type: 'object' }, config: { type: 'object' } } },
      JobResponse: { type: 'object', properties: { success: { type: 'boolean' }, job: { type: 'object', properties: { id: { type: 'string' }, queue: { type: 'string' }, status: { type: 'string', enum: ['waiting', 'active', 'completed', 'failed'] } } } } },
      AOPEGGraphInput: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, description: { type: 'string' }, nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } } },
      GraphCatalogInput: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, namespace: { type: 'string' }, type: { type: 'string', enum: ['atomic', 'tool', 'business', 'composite', 'template'] }, description: { type: 'string' }, version: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, nodes: { type: 'array', items: { type: 'object' } }, edges: { type: 'array', items: { type: 'object' } } } }
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// GET / — OpenAPI JSON spec
router.get('/', (req, res) => res.json(openApiSpec));

// GET /yaml — OpenAPI YAML spec (generated from JSON)
router.get('/yaml', (req, res) => {
  try {
    res.type('text/yaml').send(jsonToYaml(openApiSpec));
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate YAML' });
  }
});

// GET /openapi.yaml — Static YAML file download
router.get('/openapi.yaml', (req, res) => {
  const path = require('path');
  const fs = require('fs');
  const yamlPath = path.join(__dirname, '../../docs/openapi.yaml');
  if (fs.existsSync(yamlPath)) {
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Content-Disposition', 'attachment; filename="openapi.yaml"');
    fs.createReadStream(yamlPath).pipe(res);
  } else {
    // Fallback: generate from spec
    res.type('text/yaml').send(jsonToYaml(openApiSpec));
  }
});

// GET /swagger — Swagger UI page
router.get('/swagger', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head>
  <title>ProjectAdvisor API Documentation</title>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css">
  <style>body{margin:0}.swagger-ui .topbar{display:none}</style>
</head><body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script>SwaggerUIBundle({url:'/api/v1/docs',dom_id:'#swagger-ui',presets:[SwaggerUIBundle.presets.apis,SwaggerUIBundle.SwaggerUIStandalonePreset],layout:'BaseLayout',deepLinking:true,docExpansion:'list',filter:true,tagsSorter:'alpha'});</script>
</body></html>`);
});

// GET /redoc — ReDoc documentation page
router.get('/redoc', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html lang="en"><head>
  <title>ProjectAdvisor API — ReDoc</title>
  <meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1">
  <style>body{margin:0}</style>
</head><body>
  <redoc spec-url="/api/v1/docs" hide-hostname></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body></html>`);
});

// GET /stats — API documentation statistics
router.get('/stats', (req, res) => {
  const stats = getSpecStats(openApiSpec);
  res.json({ success: true, stats });
});

// GET /validate — Validate spec structure
router.get('/validate', (req, res) => {
  const validation = validateSpec(openApiSpec);
  res.json({ success: true, validation });
});

// GET /endpoints — List all documented endpoints
router.get('/endpoints', (req, res) => {
  const { tag, method } = req.query;
  const endpoints = [];
  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const [httpMethod, details] of Object.entries(methods)) {
      if (tag && !details.tags?.includes(tag)) continue;
      if (method && httpMethod !== method.toLowerCase()) continue;
      endpoints.push({
        method: httpMethod.toUpperCase(),
        path: `/api/v1${path}`,
        summary: details.summary || '',
        tags: details.tags || []
      });
    }
  }
  res.json({ success: true, count: endpoints.length, endpoints });
});

/**
 * Compute spec statistics
 */
function getSpecStats(spec) {
  const paths = Object.entries(spec.paths || {});
  let totalEndpoints = 0;
  const byTag = {};
  const byMethod = {};

  for (const [, methods] of paths) {
    for (const [method, details] of Object.entries(methods)) {
      totalEndpoints++;
      byMethod[method.toUpperCase()] = (byMethod[method.toUpperCase()] || 0) + 1;
      for (const tag of (details.tags || ['Untagged'])) {
        byTag[tag] = (byTag[tag] || 0) + 1;
      }
    }
  }

  return {
    version: spec.info?.version || '1.0.0',
    totalPaths: paths.length,
    totalEndpoints,
    totalTags: spec.tags?.length || 0,
    totalSchemas: Object.keys(spec.components?.schemas || {}).length,
    byMethod,
    byTag
  };
}

/**
 * Validate spec structure
 */
function validateSpec(spec) {
  const issues = [];
  const warnings = [];

  // Required fields
  if (!spec.openapi) issues.push('Missing openapi version');
  if (!spec.info?.title) issues.push('Missing info.title');
  if (!spec.info?.version) issues.push('Missing info.version');
  if (!spec.paths || Object.keys(spec.paths).length === 0) issues.push('No paths defined');

  // Check each path
  for (const [path, methods] of Object.entries(spec.paths || {})) {
    for (const [method, details] of Object.entries(methods)) {
      if (!details.summary) warnings.push(`${method.toUpperCase()} ${path}: missing summary`);
      if (!details.responses || Object.keys(details.responses).length === 0) {
        warnings.push(`${method.toUpperCase()} ${path}: no responses defined`);
      }
      if (!details.tags || details.tags.length === 0) {
        warnings.push(`${method.toUpperCase()} ${path}: no tags`);
      }
    }
  }

  // Check tags referenced but not defined
  const definedTags = new Set((spec.tags || []).map(t => t.name));
  for (const [, methods] of Object.entries(spec.paths || {})) {
    for (const [, details] of Object.entries(methods)) {
      for (const tag of (details.tags || [])) {
        if (!definedTags.has(tag)) warnings.push(`Tag "${tag}" used but not defined in tags array`);
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    issueCount: issues.length,
    warningCount: warnings.length
  };
}

// Simple JSON to YAML converter
function jsonToYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  let yaml = '';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        const inner = jsonToYaml(item, indent + 1);
        const lines = inner.split('\n').filter(l => l.trim());
        yaml += `${pad}- ${lines[0].trim()}\n`;
        for (let i = 1; i < lines.length; i++) yaml += `${pad}  ${lines[i].trim()}\n`;
      } else yaml += `${pad}- ${fmtVal(item)}\n`;
    }
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) continue;
      if (typeof value === 'object') {
        const inner = jsonToYaml(value, indent + 1);
        yaml += inner.trim() === '[]' || inner.trim() === '{}' ? `${pad}${key}: ${inner.trim()}\n` : `${pad}${key}:\n${inner}`;
      } else yaml += `${pad}${key}: ${fmtVal(value)}\n`;
    }
  }
  return yaml;
}

function fmtVal(v) {
  if (typeof v === 'string') {
    if (/[\n:#{}\[\],*&!|>'"]/.test(v) || v.startsWith(' ') || v.endsWith(' ') || v === '' || ['true','false','null'].includes(v) || !isNaN(v))
      return `"${v.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
    return v;
  }
  return String(v);
}

module.exports = router;
module.exports.openApiSpec = openApiSpec;

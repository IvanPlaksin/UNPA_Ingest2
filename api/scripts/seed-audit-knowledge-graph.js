/**
 * seed-audit-knowledge-graph.js
 *
 * Loads the 10-phase project audit results into Memgraph
 * via GXEMcpServer + ServiceConnector (graph.query tool with Bolt driver).
 *
 * Namespace: GXE
 *
 * Usage:
 *   cd api && node scripts/seed-audit-knowledge-graph.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { GXEMcpServer } = require('../src/mcp/server/GXEMcpServer');
const { QueryTool } = require('../src/mcp/tools/graph/QueryTool');

const NAMESPACE = 'GXE';
const AUDIT_DATE = '2026-02-18';

// ═══════════════════════════════════════════════════════════════════
// Graph Schema:
//   (:AuditReport)  -[:CONTAINS]->  (:SystemComponent)
//   (:SystemComponent)  -[:DEPENDS_ON]->  (:SystemComponent)
//   (:SystemComponent)  -[:HAS_GAP]->  (:Gap)
//   (:SystemComponent)  -[:HAS_DEBT]->  (:TechnicalDebt)
//   (:TechnicalDebt)  -[:FIXED_BY]->  (:QuickWin)
//   (:Gap)  -[:BLOCKS]->  (:BusinessGoal)
//   (:AuditReport)  -[:TARGETS]->  (:BusinessGoal)
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('=== Seed Audit Knowledge Graph (namespace: GXE) ===\n');

  // 1. Init MCP server with graph service only
  const server = new GXEMcpServer({ graph: { provider: 'service' } });
  const queryTool = new QueryTool();
  server.registerTools([queryTool]);

  console.log('[1/7] Initializing ServiceConnector (graph only)...');
  const status = await server.initServices({ graph: true, llm: false, vector: false, embedding: false });
  console.log('  ServiceConnector status:', JSON.stringify(status));

  if (status.error || status.graph?.status === 'error') {
    console.error('Failed to connect to Memgraph. Is it running on bolt://localhost:7687?');
    process.exit(1);
  }

  // Helper: execute write Cypher via graph.query tool
  async function cypher(query, params = {}) {
    const result = await server.executeTool('graph.query', { cypher: query, params, readOnly: false });
    if (result.isError) {
      const msg = result.content?.[0]?.text || 'Unknown error';
      throw new Error(`Cypher failed: ${msg}`);
    }
    const data = JSON.parse(result.content[0]?.text || '{}');
    return data;
  }

  // 2. Create indexes
  console.log('\n[2/7] Creating indexes...');
  const indexes = [
    'CREATE INDEX ON :AuditReport(id)',
    'CREATE INDEX ON :SystemComponent(id)',
    'CREATE INDEX ON :BusinessGoal(id)',
    'CREATE INDEX ON :Gap(id)',
    'CREATE INDEX ON :TechnicalDebt(id)',
    'CREATE INDEX ON :QuickWin(id)',
  ];
  for (const idx of indexes) {
    try { await cypher(idx); } catch (e) { /* index may exist */ }
  }
  console.log('  Indexes created (or already exist)');

  // 3. Create AuditReport root node
  console.log('\n[3/7] Creating AuditReport root node...');
  await cypher(`
    MERGE (r:AuditReport {id: 'audit-2026-02-18'})
    SET r.name = 'UNPA_Ingest 10-Phase Audit',
        r.namespace = $ns,
        r.date = $date,
        r.phases = 10,
        r.componentMaturity = '70-90%',
        r.integrationLevel = '20-30%',
        r.productionReadiness = '30-40%',
        r.mvpEstimate = '7-10 days',
        r.totalCodeLines = 30000,
        r.totalTests = 73,
        r.totalMcpTools = 66,
        r.totalFrontendPages = 18,
        r.totalApiEndpoints = 80,
        r.createdAt = datetime()
    RETURN r.id AS id
  `, { ns: NAMESPACE, date: AUDIT_DATE });
  console.log('  AuditReport node created');

  // 4. Create SystemComponent nodes
  console.log('\n[4/7] Creating SystemComponent nodes...');
  const components = [
    { id: 'comp-ado', name: 'ADO Connector', phase: 2, maturity: 90, status: 'working', description: 'Azure DevOps work items, repos, branches, commits, PRs via azure-devops-node-api', category: 'source' },
    { id: 'comp-tfvc', name: 'TFVC Connector', phase: 2, maturity: 85, status: 'working', description: 'Team Foundation Version Control: changesets, file content, history via ADO API', category: 'source' },
    { id: 'comp-git', name: 'Git Connector', phase: 2, maturity: 80, status: 'working', description: 'Git repos via ADO Git API', category: 'source' },
    { id: 'comp-ingestion', name: 'Ingestion Pipeline', phase: 3, maturity: 75, status: 'partial', description: '4 parallel pipelines (not consolidated): ingestion.service, AOPEG ingestion plugin, MCP pattern.rag, legacy indexing-pipeline', category: 'pipeline' },
    { id: 'comp-extraction', name: 'Entity Extraction', phase: 3, maturity: 80, status: 'working', description: 'ASTExtractor (ts-morph JS/TS), LLMExtractor (Gemini/Ollama), HybridResolver, DSPy EntityExtraction', category: 'extraction' },
    { id: 'comp-entity-resolver', name: 'Entity Resolver', phase: 3, maturity: 70, status: 'partial', description: '3-tier deduplication: exact normalizedForm, Qdrant vector similarity, Levenshtein fuzzy. Single-source only.', category: 'extraction' },
    { id: 'comp-memgraph', name: 'Memgraph Graph DB', phase: 4, maturity: 90, status: 'working', description: 'Neo4j-compatible graph DB. KnowledgeQuantum dual-label, 47 relationship types, ontology schema (3 layers)', category: 'storage' },
    { id: 'comp-qdrant', name: 'Qdrant Vector DB', phase: 4, maturity: 85, status: 'working', description: 'Vector search engine. Collection kg_entities (1024 dim). Used by EntityResolver and RAG', category: 'storage' },
    { id: 'comp-immutable-graph', name: 'ImmutableGraph', phase: 4, maturity: 90, status: 'working', description: 'Bi-temporal versioned graph (tt/vt), SHA-256 Merkle chain, 4 namespaces (CORE/PROJECT/META/COMMON), God Mode', category: 'storage' },
    { id: 'comp-rag', name: 'RAG / Query Engine', phase: 5, maturity: 75, status: 'partial', description: 'QueryParser → QueryPlanner → QueryExecutor → AnswerGenerator. Qdrant search works. No citations.', category: 'retrieval' },
    { id: 'comp-ai-agent', name: 'AI Graph Builder Agent', phase: 6, maturity: 70, status: 'partial', description: '26 in-memory tools, SSE streaming, system prompt with executor catalog. GraphState in-memory only.', category: 'agent' },
    { id: 'comp-mcp-tools', name: 'MCP Tool Server', phase: 6, maturity: 85, status: 'working', description: '66 tools across 7 categories. GXEMcpServer with SafetyGuard (3 levels), MetricsCollector, ToolRegistry (Ajv)', category: 'tools' },
    { id: 'comp-runtime', name: 'RuntimeEngine', phase: 6, maturity: 80, status: 'working', description: 'Supports ReactFlow + AOPEG DAG formats. TopologicalScheduler, NodeRunner, DataFlowManager, CheckpointManager', category: 'execution' },
    { id: 'comp-aopeg', name: 'AOPEG Engine', phase: 6, maturity: 80, status: 'working', description: 'Plugin-based DAG executor with ingestion + RAG plugins. Cypher persistence in Memgraph', category: 'execution' },
    { id: 'comp-gnn', name: 'GNN Service (Python)', phase: 7, maturity: 85, status: 'broken', description: 'PyTorch Geometric: SAGE/GCN/GAT. 15 API endpoints, DSPy modules. No trained models, JS calls wrong endpoints', category: 'ml' },
    { id: 'comp-dspy', name: 'DSPy Modules', phase: 7, maturity: 80, status: 'isolated', description: '12 signatures, MIPROv2 optimization, PiVe verification. Not integrated into production pipeline', category: 'ml' },
    { id: 'comp-frontend', name: 'React Frontend', phase: 8, maturity: 75, status: 'partial', description: '18 pages, MUI 7 + Vite 4 + Three.js. ~40% working, ~53% partial (need populated Memgraph)', category: 'ui' },
    { id: 'comp-singularity', name: 'Singularity 3D Graph', phase: 8, maturity: 90, status: 'working', description: 'Three.js + ForceGraph3D + UnrealBloomPass. 4 layout strategies, BFS crawler, subgraph expansion', category: 'ui' },
    { id: 'comp-docker', name: 'Docker Infrastructure', phase: 9, maturity: 70, status: 'partial', description: '7 services in compose (dev+prod overrides). GNN and TEI missing. 2 conflicting stacks', category: 'infra' },
    { id: 'comp-redis', name: 'Redis Cache/Queue', phase: 9, maturity: 85, status: 'working', description: 'Cache, BullMQ job queue. 256MB LRU in dev, 512MB with RDB persistence in prod', category: 'infra' },
  ];

  for (const c of components) {
    await cypher(`
      MERGE (c:SystemComponent {id: $id})
      SET c.name = $name, c.phase = $phase, c.maturity = $maturity,
          c.status = $status, c.description = $description,
          c.category = $category, c.namespace = $ns,
          c.auditDate = $date, c.createdAt = datetime()
    `, { ...c, ns: NAMESPACE, date: AUDIT_DATE });
  }
  console.log(`  ${components.length} SystemComponent nodes created`);

  // Link components to audit
  await cypher(`
    MATCH (r:AuditReport {id: 'audit-2026-02-18'})
    MATCH (c:SystemComponent) WHERE c.namespace = $ns
    MERGE (r)-[:CONTAINS]->(c)
  `, { ns: NAMESPACE });

  // 5. Create BusinessGoal nodes
  console.log('\n[5/7] Creating BusinessGoal nodes...');
  const goals = [
    { id: 'goal-sources', name: 'Connect all UN legacy sources', coverage: '50%', details: 'ADO/TFVC/Git done (3/6). SharePoint, Exchange, SQL Server missing' },
    { id: 'goal-extraction', name: 'Extract entities from code and docs', coverage: '70%', details: 'AST (JS/TS only), LLM extraction working. No C#/SQL/Python AST' },
    { id: 'goal-cross-source', name: 'Cross-source entity resolution', coverage: '20%', details: 'Single-source deduplication works. Cross-source NOT implemented' },
    { id: 'goal-provenance', name: 'Knowledge with full metadata', coverage: '60%', details: 'Schema ready (KQ + ImmutableGraph). Population incomplete, quality metrics not tracked' },
    { id: 'goal-citations', name: 'Q&A with citations', coverage: '50%', details: 'RAG pipeline works. Citations/evidence NOT implemented' },
    { id: 'goal-visualization', name: '3D knowledge graph visualization', coverage: '90%', details: 'Singularity works (Three.js+ForceGraph3D). Needs populated Memgraph' },
    { id: 'goal-process-graphs', name: 'Auto-build business process graphs', coverage: '40%', details: 'AI Agent generates graphs in memory. No persistence, no bridge to services' },
    { id: 'goal-link-prediction', name: 'GNN link prediction', coverage: '10%', details: 'Models coded. No trained checkpoints, JS integration broken (wrong endpoints)' },
    { id: 'goal-spiral', name: 'Spiral extraction', coverage: '30%', details: 'DSPy IterativeCorrection exists. No orchestration loop' },
    { id: 'goal-self-eval', name: 'Self-evaluation', coverage: '30%', details: 'Verification modules exist (DSPy, HallucinationDetector). Not integrated into pipeline' },
  ];

  for (const g of goals) {
    await cypher(`
      MERGE (g:BusinessGoal {id: $id})
      SET g.name = $name, g.coverage = $coverage,
          g.details = $details, g.namespace = $ns,
          g.auditDate = $date, g.createdAt = datetime()
    `, { ...g, ns: NAMESPACE, date: AUDIT_DATE });
  }
  console.log(`  ${goals.length} BusinessGoal nodes created`);

  // Link goals to audit
  await cypher(`
    MATCH (r:AuditReport {id: 'audit-2026-02-18'})
    MATCH (g:BusinessGoal) WHERE g.namespace = $ns
    MERGE (r)-[:TARGETS]->(g)
  `, { ns: NAMESPACE });

  // 6. Create Gap and TechnicalDebt nodes + relationships
  console.log('\n[6/7] Creating Gap, TechnicalDebt, QuickWin nodes...');

  const gaps = [
    { id: 'gap-sharepoint', name: 'No SharePoint connector', goalId: 'goal-sources', compId: 'comp-ingestion', severity: 'high' },
    { id: 'gap-exchange', name: 'No Exchange connector (only .msg parser)', goalId: 'goal-sources', compId: 'comp-ingestion', severity: 'medium' },
    { id: 'gap-sqlserver', name: 'No SQL Server connector', goalId: 'goal-sources', compId: 'comp-ingestion', severity: 'medium' },
    { id: 'gap-cross-source', name: 'Cross-source entity resolution not implemented', goalId: 'goal-cross-source', compId: 'comp-entity-resolver', severity: 'critical' },
    { id: 'gap-citations', name: 'RAG answers without citations/evidence', goalId: 'goal-citations', compId: 'comp-rag', severity: 'high' },
    { id: 'gap-agent-persist', name: 'AI Agent GraphState in-memory only', goalId: 'goal-process-graphs', compId: 'comp-ai-agent', severity: 'critical' },
    { id: 'gap-gnn-broken', name: 'GNN JS→Python integration broken (wrong endpoints)', goalId: 'goal-link-prediction', compId: 'comp-gnn', severity: 'critical' },
    { id: 'gap-gnn-no-models', name: 'No trained GNN models (.pt files)', goalId: 'goal-link-prediction', compId: 'comp-gnn', severity: 'high' },
    { id: 'gap-spiral-loop', name: 'No spiral extraction orchestration loop', goalId: 'goal-spiral', compId: 'comp-extraction', severity: 'medium' },
    { id: 'gap-verification', name: 'DSPy verification modules not in production pipeline', goalId: 'goal-self-eval', compId: 'comp-dspy', severity: 'high' },
    { id: 'gap-tool-isolation', name: 'Two tool systems (26 GraphBuilder + 66 MCP) isolated', goalId: 'goal-process-graphs', compId: 'comp-mcp-tools', severity: 'high' },
    { id: 'gap-4-pipelines', name: 'Four parallel ingestion pipelines not consolidated', goalId: 'goal-provenance', compId: 'comp-ingestion', severity: 'high' },
  ];

  for (const g of gaps) {
    await cypher(`
      MERGE (gap:Gap {id: $id})
      SET gap.name = $name, gap.severity = $severity,
          gap.namespace = $ns, gap.auditDate = $date, gap.createdAt = datetime()
      WITH gap
      MATCH (goal:BusinessGoal {id: $goalId})
      MERGE (gap)-[:BLOCKS]->(goal)
      WITH gap
      MATCH (comp:SystemComponent {id: $compId})
      MERGE (comp)-[:HAS_GAP]->(gap)
    `, { ...g, ns: NAMESPACE, date: AUDIT_DATE });
  }
  console.log(`  ${gaps.length} Gap nodes created with BLOCKS→Goal and Component→HAS_GAP edges`);

  const techDebt = [
    { id: 'debt-npm-test', name: 'npm test script missing in api/package.json', priority: 'P0', compId: 'comp-docker', effort: '1 min' },
    { id: 'debt-env-outdated', name: '.env.example outdated (CHROMA stale, 5 vars missing)', priority: 'P0', compId: 'comp-docker', effort: '5 min' },
    { id: 'debt-gnn-endpoints', name: 'GNN JS calls /embed/text (not exist) instead of /api/v1/gnn/predict-links', priority: 'P0', compId: 'comp-gnn', effort: '30 min' },
    { id: 'debt-graphstate', name: 'GraphState no persistence to Memgraph', priority: 'P0', compId: 'comp-ai-agent', effort: '2 hours' },
    { id: 'debt-gnn-docker', name: 'GNN service not in docker-compose.yml', priority: 'P1', compId: 'comp-docker', effort: '30 min' },
    { id: 'debt-tei-docker', name: 'TEI embedding service not in docker-compose.yml', priority: 'P1', compId: 'comp-docker', effort: '30 min' },
    { id: 'debt-frontend-dockerfile', name: 'Frontend Dockerfile missing in mcp/', priority: 'P1', compId: 'comp-frontend', effort: '1 hour' },
    { id: 'debt-compose-conflict', name: 'Two docker-compose stacks with conflicting API ports (3010 vs 3001)', priority: 'P1', compId: 'comp-docker', effort: '1 hour' },
    { id: 'debt-ingestion-immutable', name: 'Ingestion not through ImmutableGraph API', priority: 'P1', compId: 'comp-ingestion', effort: '3 days' },
    { id: 'debt-ts-strict', name: 'TypeScript strict: false, all checks OFF', priority: 'P2', compId: 'comp-immutable-graph', effort: '2 days' },
    { id: 'debt-seed-automation', name: '17 seed scripts without automation (no make seed)', priority: 'P2', compId: 'comp-docker', effort: '15 min' },
    { id: 'debt-ast-languages', name: 'AST extraction only JS/TS, no C#/SQL/Python', priority: 'P2', compId: 'comp-extraction', effort: '3 days' },
    { id: 'debt-mock-data', name: 'Mock data in api.js (getWorkItemGraph, fetchRepositories)', priority: 'P2', compId: 'comp-frontend', effort: '2 hours' },
    { id: 'debt-ollama-env', name: 'OLLAMA_API_BASE vs OLLAMA_URL env var name mismatch', priority: 'P2', compId: 'comp-docker', effort: '5 min' },
    { id: 'debt-gnn-port', name: 'GNN service port mismatch: Python 5000 vs Node.js default 5001', priority: 'P1', compId: 'comp-gnn', effort: '5 min' },
    { id: 'debt-dspy-integration', name: 'DSPy verification modules not wired into extraction pipeline', priority: 'P1', compId: 'comp-dspy', effort: '2 days' },
  ];

  for (const d of techDebt) {
    await cypher(`
      MERGE (td:TechnicalDebt {id: $id})
      SET td.name = $name, td.priority = $priority,
          td.effort = $effort, td.namespace = $ns,
          td.auditDate = $date, td.createdAt = datetime()
      WITH td
      MATCH (comp:SystemComponent {id: $compId})
      MERGE (comp)-[:HAS_DEBT]->(td)
    `, { ...d, ns: NAMESPACE, date: AUDIT_DATE });
  }
  console.log(`  ${techDebt.length} TechnicalDebt nodes created`);

  const quickWins = [
    { id: 'qw-npm-test', name: 'Add "test": "jest" to api/package.json', effort: '1 min', impact: 'high', debtId: 'debt-npm-test' },
    { id: 'qw-env-fix', name: 'Update .env.example (remove CHROMA, add TEI/QDRANT/GNN/API_PORT)', effort: '5 min', impact: 'high', debtId: 'debt-env-outdated' },
    { id: 'qw-gnn-urls', name: 'Fix GNN endpoint URLs in gnn-rag.service.js', effort: '30 min', impact: 'critical', debtId: 'debt-gnn-endpoints' },
    { id: 'qw-gnn-docker', name: 'Add GNN + TEI services to docker-compose.yml', effort: '30 min', impact: 'high', debtId: 'debt-gnn-docker' },
    { id: 'qw-make-seed', name: 'Add make seed-all command for DB population', effort: '15 min', impact: 'medium', debtId: 'debt-seed-automation' },
    { id: 'qw-compose-merge', name: 'Merge 2 docker-compose stacks, resolve port conflicts', effort: '1 hour', impact: 'high', debtId: 'debt-compose-conflict' },
    { id: 'qw-graphstate', name: 'GraphState save to Memgraph (persistence)', effort: '2 hours', impact: 'critical', debtId: 'debt-graphstate' },
  ];

  for (const q of quickWins) {
    await cypher(`
      MERGE (qw:QuickWin {id: $id})
      SET qw.name = $name, qw.effort = $effort,
          qw.impact = $impact, qw.namespace = $ns,
          qw.auditDate = $date, qw.createdAt = datetime()
      WITH qw
      MATCH (td:TechnicalDebt {id: $debtId})
      MERGE (td)-[:FIXED_BY]->(qw)
    `, { ...q, ns: NAMESPACE, date: AUDIT_DATE });
  }
  console.log(`  ${quickWins.length} QuickWin nodes created`);

  // 7. Create inter-component DEPENDS_ON relationships
  console.log('\n[7/7] Creating DEPENDS_ON edges between components...');
  const dependencies = [
    ['comp-ingestion', 'comp-ado'],
    ['comp-ingestion', 'comp-tfvc'],
    ['comp-ingestion', 'comp-git'],
    ['comp-ingestion', 'comp-memgraph'],
    ['comp-ingestion', 'comp-qdrant'],
    ['comp-extraction', 'comp-ingestion'],
    ['comp-entity-resolver', 'comp-qdrant'],
    ['comp-entity-resolver', 'comp-memgraph'],
    ['comp-rag', 'comp-qdrant'],
    ['comp-rag', 'comp-memgraph'],
    ['comp-rag', 'comp-extraction'],
    ['comp-ai-agent', 'comp-mcp-tools'],
    ['comp-ai-agent', 'comp-memgraph'],
    ['comp-runtime', 'comp-aopeg'],
    ['comp-runtime', 'comp-mcp-tools'],
    ['comp-aopeg', 'comp-memgraph'],
    ['comp-gnn', 'comp-memgraph'],
    ['comp-gnn', 'comp-qdrant'],
    ['comp-gnn', 'comp-redis'],
    ['comp-dspy', 'comp-gnn'],
    ['comp-frontend', 'comp-rag'],
    ['comp-frontend', 'comp-ai-agent'],
    ['comp-frontend', 'comp-gnn'],
    ['comp-frontend', 'comp-memgraph'],
    ['comp-singularity', 'comp-memgraph'],
    ['comp-immutable-graph', 'comp-memgraph'],
    ['comp-docker', 'comp-redis'],
    ['comp-docker', 'comp-memgraph'],
    ['comp-docker', 'comp-qdrant'],
  ];

  for (const [from, to] of dependencies) {
    await cypher(`
      MATCH (a:SystemComponent {id: $from})
      MATCH (b:SystemComponent {id: $to})
      MERGE (a)-[:DEPENDS_ON]->(b)
    `, { from, to });
  }
  console.log(`  ${dependencies.length} DEPENDS_ON edges created`);

  // Summary
  const stats = await cypher(`
    MATCH (n) WHERE n.namespace = $ns
    RETURN labels(n)[0] AS label, count(n) AS count
    ORDER BY count DESC
  `, { ns: NAMESPACE });

  console.log('\n=== Summary ===');
  console.log('Nodes by label:');
  for (const rec of stats.records || []) {
    console.log(`  ${rec.label}: ${rec.count}`);
  }

  const edgeStats = await cypher(`
    MATCH (a)-[r]->(b)
    WHERE a.namespace = $ns OR b.namespace = $ns
    RETURN type(r) AS relType, count(r) AS count
    ORDER BY count DESC
  `, { ns: NAMESPACE });

  console.log('Edges by type:');
  for (const rec of edgeStats.records || []) {
    console.log(`  ${rec.relType}: ${rec.count}`);
  }

  // Close connection
  if (server.serviceConnector) {
    await server.serviceConnector.close();
  }

  console.log('\nDone! Audit knowledge graph loaded into Memgraph (namespace: GXE)');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

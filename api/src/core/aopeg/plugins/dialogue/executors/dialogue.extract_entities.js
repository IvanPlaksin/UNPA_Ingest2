'use strict';

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

const ENTITY_VOCAB = [
  // Technologies
  { name: 'React', type: 'technology', patterns: ['react', 'jsx', 'usestate', 'useeffect', 'useref', 'usecallback', 'usememo'] },
  { name: 'Vite', type: 'technology', patterns: ['vite', 'vite.config', 'hmr', 'hot module'] },
  { name: 'Node.js', type: 'technology', patterns: ['node.js', 'express.js', 'express route', 'commonjs', 'require('] },
  { name: 'Memgraph', type: 'technology', patterns: ['memgraph', 'cypher', 'neo4j-driver', 'graph database'] },
  { name: 'Qdrant', type: 'technology', patterns: ['qdrant', 'vector collection', 'vector store'] },
  { name: 'Redis', type: 'technology', patterns: ['redis', 'bullmq', 'job queue', 'pub/sub', 'cache ttl'] },
  { name: 'TypeScript', type: 'technology', patterns: ['typescript', '.tsx', 'type-safe', 'interface ', 'enum '] },
  { name: 'Claude API', type: 'technology', patterns: ['claude api', 'anthropic', 'claude haiku', 'claude sonnet', 'llm call', 'model response'] },
  { name: 'Docker', type: 'technology', patterns: ['docker', 'container', 'dockerfile', 'docker-compose'] },
  { name: 'Azure', type: 'technology', patterns: ['azure', 'aca', 'azure container', 'azure devops', 'azure openai'] },
  { name: 'PostgreSQL', type: 'technology', patterns: ['postgresql', 'postgres', 'pgvector', 'sql server', 'mssql'] },
  { name: 'MUI', type: 'technology', patterns: ['material ui', '@mui', 'material-ui', 'chip ', 'paper '] },
  { name: 'Zustand', type: 'technology', patterns: ['zustand', 'usestore', 'store state'] },
  { name: 'ReactFlow', type: 'technology', patterns: ['reactflow', 'react-flow', 'flow canvas', 'graph editor'] },
  // Components
  { name: 'RuntimeEngine', type: 'component', patterns: ['runtimeengine', 'runtime engine', 'noderunner', 'topologicalscheduler', 'graph execution engine'] },
  { name: 'AOPEG', type: 'component', patterns: ['aopeg', 'aopeg graph', 'aopeg executor', 'aopeg plugin'] },
  { name: 'BackLog', type: 'component', patterns: ['backlog', 'backlog task', 'ba-0', 'backlog system'] },
  { name: 'FlowDesk', type: 'component', patterns: ['flowdesk', 'flow desk', 'structural form', 'waitingnode'] },
  { name: 'DataSource', type: 'component', patterns: ['datasource', 'data source framework', 'sql executor', 'kb executor', 'file executor'] },
  { name: 'Workspace', type: 'component', patterns: ['workspace system', 'knowledge workspace', 'ws-0', 'workspace api'] },
  { name: 'Sigillum', type: 'component', patterns: ['sigillum', 'version vector', 'snapshot record', 'branch record', 'seal record'] },
  { name: 'Dialogue System', type: 'component', patterns: ['devdialogue', 'dialogue watcher', 'dialogue pipeline', 'dialogue collector'] },
  { name: 'Codex', type: 'component', patterns: ['codex', 'codex-rule', 'codex system', 'codex rule'] },
  { name: 'GXE', type: 'component', patterns: ['gxe', 'graph catalog', 'graph version', 'gxe manager', 'catalog entry'] },
  // Concepts
  { name: 'Knowledge Graph', type: 'concept', patterns: ['knowledge graph', 'graph schema', 'graph type system'] },
  { name: 'Vector Search', type: 'concept', patterns: ['vector search', 'embedding', 'semantic search', 'similarity search'] },
  { name: 'Testing', type: 'concept', patterns: ['integration test', 'unit test', 'e2e test', 'test coverage', 'jest', 'vitest'] },
  { name: 'Authentication', type: 'concept', patterns: ['api key validation', 'jwt ', 'bearer token', 'whitelist', 'authentication'] },
  { name: 'Performance', type: 'concept', patterns: ['performance', 'latency', 'optimization', 'caching', 'bottleneck', 'timeout'] },
  { name: 'Migration', type: 'concept', patterns: ['migration', 'migrate script', 'schema migration', 'data migration'] },
  { name: 'Error Handling', type: 'concept', patterns: ['error handling', 'graceful degradation', 'fallback', 'resilience'] },
  { name: 'Graph Construction', type: 'concept', patterns: ['graph construction', 'dag ', 'topological', 'back-edge', 'workflow.start'] },
];

function keywordExtract(text) {
  const lower = text.toLowerCase();
  const results = [];
  for (const entity of ENTITY_VOCAB) {
    let matchCount = 0;
    for (const pattern of entity.patterns) {
      if (lower.includes(pattern)) matchCount++;
    }
    if (matchCount === 0) continue;
    const confidence = matchCount === 1 ? 0.35
      : matchCount === 2 ? 0.55
      : matchCount === 3 ? 0.70
      : matchCount === 4 ? 0.80
      : 0.90;
    results.push({ name: entity.name, type: entity.type, confidence });
  }
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 8);
}

const dialogueExtractEntitiesExecutor = createSimpleExecutor({
  type: 'dialogue.extract_entities',
  displayName: 'Dialogue Entity Extraction',
  description: 'Extract technology/component/concept entities from session summary',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string' },
      text: { type: 'string', description: 'Text to extract from (optional — fetches from Memgraph if omitted)' },
    },
  },
  async execute(params) {
    const { sessionId, text } = params;
    let sourceText = text;
    if (!sourceText && sessionId) {
      try {
        const memgraph = require('../../../../../services/memgraph.service');
        const rows = await memgraph.runQuery(
          'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.summary AS summary, s.title AS title',
          { sid: sessionId }
        );
        sourceText = [rows[0]?.title, rows[0]?.summary].filter(Boolean).join(' ');
      } catch (err) {
        return createErrorResult('ENTITY_ERROR', `Failed to fetch session: ${err.message}`, false);
      }
    }
    if (!sourceText) return createSuccessResult({ entities: [] });
    const entities = keywordExtract(sourceText);
    if (sessionId && entities.length > 0) {
      try {
        const memgraph = require('../../../../../services/memgraph.service');
        await memgraph.runQuery(
          'MATCH (s:DialogueSession {sessionId: $sid}) SET s.entities = $ent',
          { sid: sessionId, ent: JSON.stringify(entities) }
        );
      } catch (err) {
        console.warn(`[EntityExtract] Store failed for ${sessionId}: ${err.message}`);
      }
    }
    return createSuccessResult({ entities });
  },
});

module.exports = { dialogueExtractEntitiesExecutor, keywordExtract, ENTITY_VOCAB };

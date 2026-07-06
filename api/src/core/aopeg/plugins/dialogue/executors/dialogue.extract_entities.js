'use strict';

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

// ── ENTITY_VOCAB — keyword-based fallback ────────────────────────────────────

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
  { name: 'Python', type: 'technology', patterns: ['python', 'fastapi', 'uvicorn', 'pydantic', 'numpy', 'scipy', 'umap', 'hdbscan'] },
  { name: 'WebSocket', type: 'technology', patterns: ['websocket', 'ws://', 'socket.io', 'broadcastall', 'broadcast all'] },
  // Components
  { name: 'RuntimeEngine', type: 'component', patterns: ['runtimeengine', 'runtime engine', 'noderunner', 'topologicalscheduler', 'graph execution engine'] },
  { name: 'AOPEG', type: 'component', patterns: ['aopeg', 'aopeg graph', 'aopeg executor', 'aopeg plugin'] },
  { name: 'BackLog', type: 'component', patterns: ['backlog', 'backlog task', 'ba-0', 'backlog system'] },
  { name: 'FlowDesk', type: 'component', patterns: ['flowdesk', 'flow desk', 'structural form', 'waitingnode'] },
  { name: 'DataSource', type: 'component', patterns: ['datasource', 'data source framework', 'sql executor', 'kb executor', 'file executor'] },
  { name: 'Workspace', type: 'component', patterns: ['workspace system', 'knowledge workspace', 'ws-0', 'workspace api'] },
  { name: 'Dialogue System', type: 'component', patterns: ['devdialogue', 'dialogue watcher', 'dialogue pipeline', 'dialogue collector'] },
  { name: 'Codex', type: 'component', patterns: ['codex', 'codex-rule', 'codex system', 'codex rule'] },
  { name: 'GXE', type: 'component', patterns: ['gxe', 'graph catalog', 'graph version', 'gxe manager', 'catalog entry'] },
  { name: 'GNN Service', type: 'component', patterns: ['gnn service', 'gnn-service', 'graph neural', 'umap layout', 'knowledge-map'] },
  { name: 'MCP Server', type: 'component', patterns: ['mcp server', 'mcp tool', 'mcp service', 'model context protocol'] },
  // Concepts
  { name: 'Knowledge Graph', type: 'concept', patterns: ['knowledge graph', 'graph schema', 'graph type system'] },
  { name: 'Vector Search', type: 'concept', patterns: ['vector search', 'embedding', 'semantic search', 'similarity search'] },
  { name: 'Testing', type: 'concept', patterns: ['integration test', 'unit test', 'e2e test', 'test coverage', 'jest', 'vitest'] },
  { name: 'Authentication', type: 'concept', patterns: ['api key validation', 'jwt ', 'bearer token', 'whitelist', 'authentication'] },
  { name: 'Performance', type: 'concept', patterns: ['performance', 'latency', 'optimization', 'caching', 'bottleneck', 'timeout'] },
  { name: 'Migration', type: 'concept', patterns: ['migration', 'migrate script', 'schema migration', 'data migration'] },
  { name: 'Error Handling', type: 'concept', patterns: ['error handling', 'graceful degradation', 'fallback', 'resilience'] },
  { name: 'Graph Construction', type: 'concept', patterns: ['graph construction', 'dag ', 'topological', 'back-edge', 'workflow.start'] },
  { name: 'UMAP', type: 'concept', patterns: ['umap', 'dimensionality reduction', '3d layout', 'knowledge map', 'vector space'] },
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
    const confidence = matchCount === 1 ? 0.40
      : matchCount === 2 ? 0.60
      : matchCount === 3 ? 0.75
      : matchCount >= 4 ? 0.85
      : 0.90;
    results.push({ name: entity.name, type: entity.type, confidence });
  }
  return results.sort((a, b) => b.confidence - a.confidence);
}

// ── LLM extraction ────────────────────────────────────────────────────────────

const LLM_PROMPT = (text) => `You are extracting named entities from a software development conversation.

Extract entities: technologies, frameworks, libraries, databases, tools, system components, architectural concepts, and decisions.
For each entity return: name (proper name, e.g. "React", "Qdrant", "RuntimeEngine"), type (technology|component|concept|decision), confidence (0.0-1.0).

Rules:
- Only extract concrete named entities, not vague terms
- confidence > 0.7 means clearly mentioned and important
- confidence 0.4-0.7 means mentioned but less central
- Skip common words like "function", "variable", "code", "file"

Dialogue text:
${text}

Return a JSON array. Example: [{"name":"React","type":"technology","confidence":0.9},{"name":"RuntimeEngine","type":"component","confidence":0.85}]
If nothing significant found, return [].
JSON:`;

async function llmExtract(llmService, text, model) {
  try {
    const result = await llmService.chat(
      [{ role: 'user', content: LLM_PROMPT(text.slice(0, 5000)) }],
      { model, maxTokens: 600, caller: 'aopeg_dialogue' }
    );
    const rawContent = result.content;
    const raw = (Array.isArray(rawContent)
      ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
      : (rawContent || '')).trim();
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    const parsed = JSON.parse(jsonMatch[1].trim());
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(e => e.name && e.type && ['technology', 'component', 'concept', 'decision'].includes(e.type))
      .map(e => ({ name: String(e.name).trim(), type: e.type, confidence: Number(e.confidence) || 0.5 }));
  } catch {
    return [];
  }
}

// ── Merge & deduplicate by name (case-insensitive) ───────────────────────────

function mergeEntities(keyword, llm) {
  const map = new Map();
  for (const e of keyword) {
    map.set(e.name.toLowerCase(), { ...e });
  }
  for (const e of llm) {
    const key = e.name.toLowerCase();
    if (map.has(key)) {
      const existing = map.get(key);
      existing.confidence = Math.max(existing.confidence, e.confidence);
    } else {
      map.set(key, { ...e });
    }
  }
  return [...map.values()]
    .filter(e => e.confidence >= 0.35)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 20);
}

// ── Vector upsert (fire-and-forget) ──────────────────────────────────────────

async function upsertEntityVectors(entities, sessionId, sourceText) {
  const { EmbeddingService } = require('../../../../../services/structuring/embeddings/EmbeddingService');
  const { knowledgeQdrant } = require('../services/dialogue.knowledge-qdrant');

  const embSvc = new EmbeddingService();

  const texts = entities.map(e => {
    const lower = sourceText.toLowerCase();
    const vocab = ENTITY_VOCAB.find(v => v.name === e.name);
    let snippet = '';
    if (vocab) {
      for (const pat of vocab.patterns) {
        const idx = lower.indexOf(pat);
        if (idx !== -1) {
          snippet = sourceText.slice(Math.max(0, idx - 30), idx + 80).replace(/\s+/g, ' ').trim();
          break;
        }
      }
    }
    if (!snippet) {
      const idx = lower.indexOf(e.name.toLowerCase());
      if (idx !== -1) snippet = sourceText.slice(Math.max(0, idx - 40), idx + 100).replace(/\s+/g, ' ').trim();
    }
    return `${e.type}: ${e.name}${snippet ? ' — ' + snippet : ''}`;
  });

  const vectors = await embSvc.generateBatchEmbeddings(texts);

  await knowledgeQdrant.upsertEntities(
    entities.map((e, i) => ({
      name:           e.name,
      type:           e.type,
      contextSummary: texts[i],
      vector:         vectors[i],
      sessionId,
      confidence:     e.confidence,
    }))
  );
}

// ── Executor ──────────────────────────────────────────────────────────────────

const dialogueExtractEntitiesExecutor = createSimpleExecutor({
  type: 'dialogue.extract_entities',
  displayName: 'Dialogue Entity Extraction',
  description: 'Extract technology/component/concept entities using keyword + LLM analysis',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId:   { type: 'string' },
      useLLM:      { type: 'boolean', description: 'Use LLM for extraction (default: true)' },
      model:       { type: 'string', description: 'LLM model to use' },
      text:        { type: 'string', description: 'Override text (skip Memgraph fetch)' },
    },
  },

  async execute(params) {
    const { sessionId, text: textOverride } = params;
    const useLLM   = params.useLLM !== false;
    const model    = params.model || process.env.SUMMARY_MODEL || 'claude-haiku-4-5-20251001';

    let sourceText = textOverride || '';
    let usedLLM = false;

    // ── 1. Load text ──────────────────────────────────────────────────────────
    if (!sourceText && sessionId) {
      try {
        const memgraph = require('../../../../../services/memgraph.service');

        // Prefer raw messages from JSONL (richer than summary)
        const sessRows = await memgraph.runQuery(
          'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s',
          { sid: sessionId }
        );
        const sessProps = sessRows[0]?.s?.properties || sessRows[0]?.s || sessRows[0];

        if (sessProps?.sourceFile) {
          try {
            const { dialogueNormalizer } = require('../services/dialogue.normalizer');
            const dialogue = dialogueNormalizer.parseClaudeCodeSession(sessProps.sourceFile);
            if (dialogue?.messages?.length) {
              sourceText = dialogue.messages
                .map(m => `${m.role}: ${typeof m.text === 'string' ? m.text : (m.text?.[0]?.text || '')}`)
                .join('\n')
                .slice(0, 12000);
            }
          } catch { /* fallback to summary */ }
        }

        // Fallback: use stored summary + segment summaries from Memgraph
        if (!sourceText) {
          const sumRows = await memgraph.runQuery(
            `MATCH (s:DialogueSession {sessionId: $sid})
             OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
             RETURN s.summary AS sessionSummary, s.title AS title, collect(seg.summary) AS segSummaries`,
            { sid: sessionId }
          );
          const r = sumRows[0] || {};
          const parts = [r.title, r.sessionSummary, ...(r.segSummaries || [])].filter(Boolean);
          sourceText = parts.join('\n\n').slice(0, 8000);
        }
      } catch (err) {
        return createErrorResult('ENTITY_ERROR', `Failed to load session: ${err.message}`, false);
      }
    }

    if (!sourceText.trim()) {
      return createSuccessResult({ entities: [], usedLLM: false, source: 'empty' });
    }

    // ── 2. Keyword extraction ─────────────────────────────────────────────────
    const keywordEntities = keywordExtract(sourceText);

    // ── 3. LLM extraction ─────────────────────────────────────────────────────
    let llmEntities = [];
    if (useLLM) {
      try {
        const { getInstance: getLLMProvider } = require('../../../../../services/llm/LLMProviderService');
        const llmService = getLLMProvider();
        llmEntities = await llmExtract(llmService, sourceText, model);
        usedLLM = llmEntities.length >= 0; // true even if LLM returned 0 (ran successfully)
      } catch (err) {
        console.warn(`[EntityExtract] LLM extraction failed, using keywords only: ${err.message}`);
      }
    }

    // ── 4. Merge ──────────────────────────────────────────────────────────────
    const entities = mergeEntities(keywordEntities, llmEntities);

    // ── 5. Store in Memgraph ─────────────────────────────────────────────────
    if (sessionId && entities.length > 0) {
      try {
        const memgraph = require('../../../../../services/memgraph.service');
        await memgraph.runQuery(
          'MATCH (s:DialogueSession {sessionId: $sid}) SET s.entities = $ent',
          { sid: sessionId, ent: JSON.stringify(entities) }
        );
      } catch (err) {
        console.warn(`[EntityExtract] Memgraph store failed for ${sessionId}: ${err.message}`);
      }
    }

    // ── 6. Vector upsert (fire-and-forget) ───────────────────────────────────
    if (entities.length > 0) {
      upsertEntityVectors(entities, sessionId, sourceText).catch(err =>
        console.warn('[EntityExtract] Knowledge vector upsert failed:', err.message)
      );
    }

    console.log(`[EntityExtract] ${sessionId?.slice(0, 8)}: ${entities.length} entities (keyword:${keywordEntities.length} llm:${llmEntities.length} usedLLM:${usedLLM})`);

    return createSuccessResult({ entities, usedLLM, stats: { keyword: keywordEntities.length, llm: llmEntities.length } });
  },
});

module.exports = { dialogueExtractEntitiesExecutor, keywordExtract, ENTITY_VOCAB };

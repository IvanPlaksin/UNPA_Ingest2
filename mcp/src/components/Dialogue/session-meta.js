/**
 * Shared session metadata helpers — used by TimelineTab, SessionDetailDrawer, ProvenanceChain.
 *
 * parseSmartTitle      — derive a human-readable title from raw title + summary
 * parseTopics          — extract topic chips from summary markdown
 * parseSummaryBlurb    — extract goals/achieved text from structured summary
 * inferSessionType     — keyword-based type classification
 * parseEntities        — extract technology/component/concept tags with confidence
 * SESSION_TYPE_STYLE   — chip styling per type
 * ENTITY_TYPE_COLOR    — chip color per entity type
 */

export function parseSmartTitle(rawTitle, summary) {
  if (rawTitle &&
    !rawTitle.startsWith('<') &&
    !rawTitle.startsWith('In the project') &&
    rawTitle.length <= 80) {
    return rawTitle;
  }
  if (!summary) return rawTitle ? rawTitle.slice(0, 70) : 'Development session';
  const lines = summary
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && !l.startsWith('**') && !l.startsWith('-') && !l.startsWith('*'));
  return lines.length > 0 ? lines[0].replace(/\.$/, '').slice(0, 90) : 'Development session';
}

export function parseTopics(summary, maxLen = 36, maxCount = 3) {
  if (!summary) return [];
  const match = summary.match(/\*\*Main Topics:\*\*\n([\s\S]*?)(?:\n\n|\*\*Key |\*\*Decision|\n#|$)/);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(l => l && l.length > 2)
    .map(l => l.length > maxLen ? l.slice(0, maxLen - 2) + '…' : l)
    .slice(0, maxCount);
}

const TYPE_RULES = [
  { type: 'Architecture',   kw: ['architecture', 'design', 'pattern', 'aopeg', 'graph schema', 'sigillum', 'concept', 'graph type'] },
  { type: 'Debugging',      kw: ['debug', 'fix', 'error', 'resolve', 'issue', 'bug', 'problem', 'fail', 'regression', 'crash'] },
  { type: 'DevOps',         kw: ['docker', 'deploy', 'azure', 'kubernetes', 'container', 'startup', 'configuration', 'proxy'] },
  { type: 'Refactoring',    kw: ['refactor', 'cleanup', 'optimize', 'migrate', 'restructure', 'rename'] },
  { type: 'Analysis',       kw: ['audit', 'analysis', 'review', 'inspect', 'investigate', 'assess', 'verify'] },
  { type: 'Planning',       kw: ['plan', 'roadmap', 'backlog', 'strategy', 'requirement', 'scope'] },
  { type: 'Implementation', kw: ['implement', 'feature', 'add', 'create', 'build', 'develop', 'phase', 'complete'] },
];

export function inferSessionType(title, summary) {
  const text = ((title || '') + ' ' + (summary || '')).toLowerCase();
  for (const { type, kw } of TYPE_RULES) {
    if (kw.some(k => text.includes(k))) return type;
  }
  return 'Technical';
}

function extractSection(summary, heading) {
  const re = new RegExp(`\\*\\*${heading}:\\*\\*\\n([\\s\\S]*?)(?=\\n\\n|\\*\\*|\\n#|$)`);
  const match = summary.match(re);
  if (!match) return [];
  return match[1]
    .split('\n')
    .map(l => l.replace(/^[-*]\s*/, '').trim())
    .filter(l => l.length > 2);
}

export function parseSummaryBlurb(summary) {
  if (!summary) return null;
  const topics = extractSection(summary, 'Main Topics');
  const solved = extractSection(summary, 'Problems Solved');
  const decisions = extractSection(summary, 'Key Decisions');
  const achieved = solved.length ? solved : decisions;
  if (!topics.length && !achieved.length) return null;
  const cap = (s) => s.length > 100 ? s.slice(0, 98) + '…' : s;
  return {
    goals: topics.slice(0, 2).map(cap),
    achieved: achieved.slice(0, 2).map(cap),
  };
}

export const SESSION_TYPE_STYLE = {
  Architecture:   { border: '#7b1fa2', color: '#7b1fa2' },
  Debugging:      { border: '#c62828', color: '#c62828' },
  DevOps:         { border: '#2e7d32', color: '#2e7d32' },
  Refactoring:    { border: '#e65100', color: '#e65100' },
  Analysis:       { border: '#00695c', color: '#00695c' },
  Planning:       { border: '#4527a0', color: '#4527a0' },
  Implementation: { border: '#1565c0', color: '#1565c0' },
  Technical:      { border: '#616161', color: '#616161' },
};

// ── Entity extraction ─────────────────────────────────────────────────────────

export const ENTITY_TYPE_COLOR = {
  technology: 'info',
  component:  'primary',
  concept:    'secondary',
};

const ENTITY_VOCAB = [
  { name: 'React',         type: 'technology', patterns: ['react', 'jsx', 'usestate', 'useeffect', 'useref', 'usecallback'] },
  { name: 'Vite',          type: 'technology', patterns: ['vite', 'vite.config', 'hmr'] },
  { name: 'Node.js',       type: 'technology', patterns: ['node.js', 'express.js', 'express route', 'commonjs'] },
  { name: 'Memgraph',      type: 'technology', patterns: ['memgraph', 'cypher', 'neo4j-driver', 'graph database'] },
  { name: 'Qdrant',        type: 'technology', patterns: ['qdrant', 'vector collection', 'vector store'] },
  { name: 'Redis',         type: 'technology', patterns: ['redis', 'bullmq', 'job queue', 'cache ttl'] },
  { name: 'TypeScript',    type: 'technology', patterns: ['typescript', '.tsx', 'type-safe', 'interface '] },
  { name: 'Claude API',    type: 'technology', patterns: ['claude api', 'anthropic', 'claude haiku', 'claude sonnet', 'llm call'] },
  { name: 'Docker',        type: 'technology', patterns: ['docker', 'dockerfile', 'docker-compose', 'container'] },
  { name: 'Azure',         type: 'technology', patterns: ['azure', 'aca', 'azure container', 'azure devops'] },
  { name: 'PostgreSQL',    type: 'technology', patterns: ['postgresql', 'postgres', 'pgvector', 'sql server', 'mssql'] },
  { name: 'MUI',           type: 'technology', patterns: ['material ui', '@mui', 'material-ui'] },
  { name: 'Zustand',       type: 'technology', patterns: ['zustand', 'usestore'] },
  { name: 'ReactFlow',     type: 'technology', patterns: ['reactflow', 'react-flow', 'flow canvas'] },
  { name: 'RuntimeEngine', type: 'component',  patterns: ['runtimeengine', 'runtime engine', 'noderunner', 'topologicalscheduler'] },
  { name: 'AOPEG',         type: 'component',  patterns: ['aopeg', 'aopeg graph', 'aopeg executor', 'aopeg plugin'] },
  { name: 'BackLog',       type: 'component',  patterns: ['backlog', 'backlog task', 'ba-0'] },
  { name: 'FlowDesk',      type: 'component',  patterns: ['flowdesk', 'flow desk', 'structural form'] },
  { name: 'DataSource',    type: 'component',  patterns: ['datasource', 'data source framework', 'sql executor', 'kb executor'] },
  { name: 'Workspace',     type: 'component',  patterns: ['workspace system', 'knowledge workspace', 'ws-0'] },
  { name: 'Sigillum',      type: 'component',  patterns: ['sigillum', 'version vector', 'snapshot record', 'branch record'] },
  { name: 'Dialogue',      type: 'component',  patterns: ['devdialogue', 'dialogue watcher', 'dialogue pipeline'] },
  { name: 'Codex',         type: 'component',  patterns: ['codex', 'codex-rule', 'codex system'] },
  { name: 'GXE',           type: 'component',  patterns: ['gxe', 'graph catalog', 'gxe manager', 'catalog entry'] },
  { name: 'Knowledge Graph', type: 'concept',  patterns: ['knowledge graph', 'graph schema', 'graph type system'] },
  { name: 'Vector Search',   type: 'concept',  patterns: ['vector search', 'embedding', 'semantic search', 'similarity search'] },
  { name: 'Testing',         type: 'concept',  patterns: ['integration test', 'unit test', 'e2e test', 'test coverage', 'jest', 'vitest'] },
  { name: 'Performance',     type: 'concept',  patterns: ['performance', 'latency', 'optimization', 'caching', 'bottleneck'] },
  { name: 'Migration',       type: 'concept',  patterns: ['migration', 'migrate script', 'schema migration', 'data migration'] },
  { name: 'Error Handling',  type: 'concept',  patterns: ['error handling', 'graceful degradation', 'fallback', 'resilience'] },
  { name: 'Graph Construction', type: 'concept', patterns: ['graph construction', 'dag ', 'topological', 'back-edge', 'workflow.start'] },
];

/**
 * Extract entities from session text (title + summary).
 * Uses stored `session.entities` JSON if available, falls back to keyword matching.
 */
export function parseEntities(session) {
  // Use pre-computed entities if stored
  if (session?.entities) {
    try {
      const parsed = typeof session.entities === 'string'
        ? JSON.parse(session.entities)
        : session.entities;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* fall through to keyword extraction */ }
  }
  const text = ((session?.title || '') + ' ' + (session?.summary || '')).toLowerCase();
  if (!text.trim()) return [];
  const results = [];
  for (const entity of ENTITY_VOCAB) {
    let matchCount = 0;
    for (const pattern of entity.patterns) {
      if (text.includes(pattern)) matchCount++;
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

/** Extract entities from plain text (for decisions). */
export function parseEntitiesFromText(text) {
  return parseEntities({ title: '', summary: text });
}

'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { isAllowed } = require('../llm-access-control.service');

let _client;
function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * Generate LLM narrative interpretation for a path connection.
 *
 * Returns: { paragraphs: [{label, text}], keyInsight }
 *
 * The AI determines section labels from the context itself — labels are not fixed.
 * Minimum 3 paragraphs when sufficient context exists.
 *
 * @param {object}   fromEntity   - full entity object (id, name, type, description, epistemicLayer)
 * @param {object}   toEntity     - full entity object
 * @param {Array}    paths        - filteredPaths from Yen's KSP
 * @param {object}   analysis     - structuralAnalysis
 * @param {Array}    allEntities  - all entities in skeleton
 * @param {object}   bundles      - keyed by "nodeA|nodeB", each with relationships[]{relType, direction, context, confidence}
 */
async function interpretPathConnection(fromEntity, toEntity, paths, analysis, allEntities = [], bundles = {}) {
  const entityById = {};
  for (const e of allEntities) if (e.id) entityById[e.id] = e;

  const entityDesc = (e, descLen = 280) => {
    if (!e) return '';
    const layer = e.epistemicLayer ? ` [${e.epistemicLayer}]` : '';
    const desc  = e.description    ? ` — ${e.description.slice(0, descLen)}` : '';
    return `${e.name} (${e.type || 'unknown'}${layer})${desc}`;
  };

  // ── Intermediate entity roster ───────────────────────────────────────────────
  const intermediateIds = new Set();
  for (const path of (paths || [])) {
    const ids = path.nodeIds || (path.segments || []).map(s => s.id);
    ids.slice(1, -1).forEach(id => intermediateIds.add(id));
  }
  const intermediateRoster = [...intermediateIds]
    .map(id => entityById[id]).filter(Boolean).slice(0, 10)
    .map(e => `  • ${entityDesc(e, 180)}`).join('\n');

  // ── Path descriptions ────────────────────────────────────────────────────────
  const pathDescs = (paths || []).slice(0, 5).map((path, i) => {
    const steps = (path.segments || []).filter(s => s.edge).map(s => {
      const dir = s.edge.direction && s.edge.direction !== 'forward' ? ` (${s.edge.direction})` : '';
      return `${s.name} --[${s.edge.relType}${dir}]-->`;
    }).join(' ');
    return `  Path ${i + 1} | ${(path.pathStrength * 100).toFixed(1)}% strength | ${path.hopCount} hop(s):\n    ${steps} ${toEntity?.name || '?'}`;
  }).join('\n');

  // ── Bundle evidence (full context text) ─────────────────────────────────────
  const evidenceBlocks = [];
  for (const [, bundle] of Object.entries(bundles)) {
    const nameA = entityById[bundle.nodeA]?.name || bundle.nodeA;
    const nameB = entityById[bundle.nodeB]?.name || bundle.nodeB;
    const rels  = (bundle.relationships || []).filter(r => r.context);
    if (!rels.length) continue;
    const lines = rels.slice(0, 5).map(r => {
      const conf = r.confidence != null ? ` [${Math.round(r.confidence * 100)}% conf]` : '';
      const dir  = r.direction && r.direction !== 'forward' ? ` (${r.direction})` : '';
      return `    - [${r.relType}${dir}]${conf}: "${r.context.slice(0, 380)}"`;
    }).join('\n');
    evidenceBlocks.push(`  ${nameA} ↔ ${nameB} (${rels.length} documented rel${rels.length > 1 ? 's' : ''}):\n${lines}`);
    if (evidenceBlocks.length >= 10) break;
  }

  // ── Topology-only relationships (no context) ─────────────────────────────────
  const topoLines = [];
  for (const [, bundle] of Object.entries(bundles)) {
    const nameA = entityById[bundle.nodeA]?.name || bundle.nodeA;
    const nameB = entityById[bundle.nodeB]?.name || bundle.nodeB;
    (bundle.relationships || []).filter(r => !r.context).slice(0, 2).forEach(r => {
      const conf = r.confidence != null ? ` [${Math.round(r.confidence * 100)}% conf]` : '';
      topoLines.push(`  • ${nameA} --[${r.relType}]--> ${nameB}${conf}`);
    });
    if (topoLines.length >= 12) break;
  }

  // ── Articulation points ───────────────────────────────────────────────────────
  const bottlenecks = (analysis?.articulationPoints || []).length
    ? analysis.articulationPoints.map(id => {
        const seg = (paths || []).flatMap(p => p.segments || []).find(s => s.id === id);
        return entityById[id]?.name || seg?.name || id;
      }).join(', ')
    : 'None';

  const structSummary = (analysis?.summary || []).map(s => `  - ${s}`).join('\n');

  const contextRichness = evidenceBlocks.length + (paths?.length || 0);

  const prompt = `You are a senior analyst at the UN specializing in institutional networks. Analyze the connection between two entities in a UN knowledge graph and produce a structured, evidence-grounded interpretation.

═══ ENTITIES ═══

SOURCE: ${entityDesc(fromEntity)}
TARGET: ${entityDesc(toEntity)}

${intermediateRoster ? `INTERMEDIATE NODES IN PATHS:\n${intermediateRoster}` : ''}

═══ CONNECTION PATHS ═══

${pathDescs || '  No paths found'}

═══ RELATIONSHIP EVIDENCE (extracted from source documents) ═══

${evidenceBlocks.length ? evidenceBlocks.join('\n\n') : '  No documentary evidence with context available'}

${topoLines.length ? `Additional topology (no document context):\n${topoLines.join('\n')}` : ''}

═══ STRUCTURAL ANALYSIS ═══

- Connection robustness: ${analysis?.connectionRobustness || 'UNKNOWN'}
- Independent paths: ${analysis?.independentPathCount ?? 0}
- Critical bottleneck nodes: ${bottlenecks}
- Subgraph: ${analysis?.subgraphNodeCount ?? 0} nodes, ${analysis?.subgraphEdgeCount ?? 0} edges, ${((analysis?.subgraphDensity || 0) * 100).toFixed(0)}% density
${structSummary ? `- Pre-computed summary:\n${structSummary}` : ''}

═══ INSTRUCTIONS ═══

Read the context above carefully. Based on what is actually present — the entity types, relationship types, evidence texts, network topology, and structural characteristics — determine the most analytically relevant sections to write about.

Do NOT use fixed generic section names like "Overview" or "Analysis". Instead, derive section titles from the specific content: for example, "Mandate and Authority Chain", "Co-Sponsorship Network", "Single Point of Failure: [Entity Name]", "Funding and Resource Dependencies", etc.

Write ${contextRichness >= 4 ? '4–5' : '3–4'} sections. Each section is a paragraph of 4–6 sentences. At least one section must be grounded in the documentary evidence (quoting or paraphrasing specific "context" excerpts). At least one section must address the structural/topological characteristics.

Format your response as follows — each section starts with ## followed by the title, then a blank line, then the paragraph:

## [Section title derived from content]

[Paragraph text, 4-6 sentences.]

## [Next section title]

[Paragraph text, 4-6 sentences.]

...

KEY_INSIGHT: [Single sentence — the single most important or unexpected finding.]`;

  if (!isAllowed('direct:path_interpreter')) {
    throw new Error('[LLMAccessControl] Path Interpreter (direct SDK) is disabled');
  }

  const msg = await client().messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2400,
    messages:   [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text || '';

  // ── Parse ## sections ─────────────────────────────────────────────────────────
  const paragraphs = [];
  // Split on lines that start with ##
  const parts = text.split(/\n(?=##\s)/);
  for (const part of parts) {
    const headerMatch = part.match(/^##\s+(.+)/);
    if (!headerMatch) continue;
    const label = headerMatch[1].replace(/KEY_INSIGHT.*$/i, '').trim();
    if (!label) continue;
    const body = part
      .slice(headerMatch[0].length)
      .replace(/^KEY_INSIGHT:[\s\S]*/im, '')
      .trim();
    if (body.length > 20) paragraphs.push({ label, text: body });
  }

  const insightMatch = text.match(/KEY_INSIGHT:\s*([\s\S]+?)$/i);
  const keyInsight = (insightMatch?.[1] || '').replace(/^##.*$/gm, '').trim();

  // Fallback: if markdown parsing failed, return whole text as one paragraph
  if (paragraphs.length === 0) {
    const clean = text.replace(/KEY_INSIGHT:[\s\S]*$/i, '').trim();
    if (clean) paragraphs.push({ label: 'Analysis', text: clean });
  }

  return { paragraphs, keyInsight };
}

module.exports = { interpretPathConnection };

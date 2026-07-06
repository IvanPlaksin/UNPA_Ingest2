'use strict';

/**
 * M4 Reducer — global consolidation via single Sonnet call.
 *
 * Tasks:
 *   1. Resolve type conflicts (entity appears with different types in different chunks)
 *   2. Infer cross-chunk relations (entities co-referenced across chunks)
 *   3. Produce document-level summary
 *   4. Calibrate confidence with global context
 */

const Anthropic = require('@anthropic-ai/sdk');
const { ENTITY_TYPES, RELATION_TYPES, EPISTEMIC_LAYERS } = require('../../schemas/canonical');

const DEFAULT_MODEL   = process.env.EXTRACTION_M4_REDUCE_MODEL || 'claude-sonnet-4-6';
const DEFAULT_MAX_TOK = 8192;

let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ── consolidate_knowledge tool ────────────────────────────────────────────────

const REDUCE_TOOL = {
  name: 'consolidate_knowledge',
  description: 'Resolve entity type conflicts, discover cross-chunk relations, and produce a global document summary.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'One-paragraph document-level summary',
      },
      keyProvisions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Up to 10 key provisions, mandates, or findings',
      },
      resolvedEntities: {
        type: 'array',
        description: 'Entities with corrected types (only those that had conflicts or need adjustment)',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string' },
            correctType:    { type: 'string', enum: ENTITY_TYPES },
            epistemicLayer: { type: 'string', enum: EPISTEMIC_LAYERS },
            confidence:     { type: 'number' },
          },
          required: ['name', 'correctType'],
        },
      },
      crossChunkRelations: {
        type: 'array',
        description: 'Relations between entities that appear in different chunks',
        items: {
          type: 'object',
          properties: {
            sourceEntity: { type: 'string' },
            targetEntity: { type: 'string' },
            type:         { type: 'string', enum: RELATION_TYPES },
            confidence:   { type: 'number' },
            evidence:     { type: 'string', description: 'Reasoning for this cross-chunk inference' },
          },
          required: ['sourceEntity', 'targetEntity', 'type', 'confidence'],
        },
      },
    },
    required: ['summary', 'resolvedEntities', 'crossChunkRelations'],
  },
};

/**
 * Run the reduce stage.
 *
 * @param {object} collapsed  — output from collapser.collapse()
 * @param {string} [model]
 * @returns {Promise<ReduceResult>}
 */
async function reduce(collapsed, model = DEFAULT_MODEL) {
  const { entities, relations, conflicts, crossChunkCandidates, chunkSummaries } = collapsed;

  // Build conflict description for prompt
  const conflictDesc = conflicts.length > 0
    ? `\n\n## Type conflicts to resolve (${conflicts.length}):\n` +
      conflicts.map(c =>
        `- "${c.canonical || c.name}": votes=${JSON.stringify(c.typeVotes)} (chunks ${c.chunks.join(', ')})`
      ).join('\n')
    : '';

  // Cross-chunk candidate description
  const crossDesc = crossChunkCandidates.length > 0
    ? `\n\n## Cross-chunk entities (referenced across multiple sections):\n` +
      crossChunkCandidates.map(n => `- ${n}`).join('\n')
    : '';

  // All entity names + types for reference
  const entityListDesc = entities.slice(0, 80).map(e =>
    `${e.canonical} [${e.type}]`
  ).join(', ');

  // Chunk summaries
  const summariesDesc = chunkSummaries.length > 0
    ? `\n\n## Chunk summaries (in order):\n` +
      chunkSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')
    : '';

  const userPrompt =
    `You are reviewing a multi-chunk extraction of a UN document (${chunkSummaries.length} chunks processed).` +
    `\n\n## All extracted entities (${entities.length}):\n${entityListDesc}` +
    conflictDesc +
    crossDesc +
    summariesDesc +
    `\n\nTasks:\n` +
    `1. Resolve any type conflicts listed above — pick the most accurate type\n` +
    `2. Infer cross-chunk relations between the listed cross-chunk entities (only if logically supported)\n` +
    `3. Write a document-level summary\n` +
    `4. Extract up to 10 key provisions/mandates`;

  const response = await client().messages.create({
    model,
    max_tokens: DEFAULT_MAX_TOK,
    system: `You are an expert UN document analyst consolidating knowledge extracted from document chunks into a unified knowledge graph.`,
    tools:      [REDUCE_TOOL],
    tool_choice: { type: 'tool', name: 'consolidate_knowledge' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock) throw new Error('M4: Reducer — Claude did not call consolidate_knowledge');

  const raw = toolBlock.input;
  return {
    summary:             raw.summary         || '',
    keyProvisions:       raw.keyProvisions    || [],
    resolvedEntities:    raw.resolvedEntities || [],
    crossChunkRelations: raw.crossChunkRelations || [],
    inputTokens:         response.usage?.input_tokens  || 0,
    outputTokens:        response.usage?.output_tokens || 0,
  };
}

module.exports = { reduce, REDUCE_TOOL, DEFAULT_MODEL };

'use strict';

/**
 * M4 Mapper — extract entities+relations from a single chunk via Haiku.
 *
 * Each chunk call uses `extract_chunk` tool (forced tool_use).
 * Results include `crossReferences` (entity names likely in other chunks)
 * and `chunkSummary` (context carryover for next chunk).
 */

const Anthropic = require('@anthropic-ai/sdk');
const { ENTITY_TYPES, RELATION_TYPES, EPISTEMIC_LAYERS, EXTRACTION_SYSTEM_PROMPT } = require('../../schemas/canonical');

const DEFAULT_MODEL   = process.env.EXTRACTION_M4_MAP_MODEL || 'claude-haiku-4-5-20251001';
const DEFAULT_MAX_TOK = 4096;
const CONCURRENCY     = parseInt(process.env.M4_CONCURRENCY || '5', 10);

let _client = null;
function client() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}

// ── extract_chunk tool ───────────────────────────────────────────────────────

const MAP_TOOL = {
  name: 'extract_chunk',
  description: 'Extract entities and relations from this document chunk.',
  input_schema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name:           { type: 'string' },
            type:           { type: 'string', enum: ENTITY_TYPES },
            epistemicLayer: { type: 'string', enum: EPISTEMIC_LAYERS },
            confidence:     { type: 'number' },
            evidence:       { type: 'string' },
          },
          required: ['name', 'type', 'confidence'],
        },
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            sourceEntity: { type: 'string' },
            targetEntity: { type: 'string' },
            type:         { type: 'string', enum: RELATION_TYPES },
            confidence:   { type: 'number' },
            evidence:     { type: 'string' },
          },
          required: ['sourceEntity', 'targetEntity', 'type', 'confidence'],
        },
      },
      crossReferences: {
        type: 'array',
        items: { type: 'string' },
        description: 'Names of entities likely referenced in other parts of the document',
      },
      chunkSummary: {
        type: 'string',
        description: 'One sentence summary of main topics in this chunk',
      },
    },
    required: ['entities', 'relations', 'crossReferences', 'chunkSummary'],
  },
};

// ── Single chunk mapper ───────────────────────────────────────────────────────

/**
 * Map a single chunk to entities + relations.
 *
 * @param {object} chunk         - {index, text, start, end, isLast}
 * @param {object} context       - {totalChunks, previousEntities, documentType}
 * @param {string} [model]
 * @returns {Promise<{chunkIndex, entities, relations, crossReferences, chunkSummary, inputTokens, outputTokens}>}
 */
async function mapChunk(chunk, context = {}, model = DEFAULT_MODEL) {
  const { totalChunks = 1, previousEntities = [], documentType = 'UN document' } = context;

  const prevCtx = previousEntities.length > 0
    ? `\n\nEntities found so far (for context, reuse these names exactly):\n` +
      previousEntities.map(e => `- ${e.name} [${e.type}]`).join('\n')
    : '';

  const userPrompt =
    `Document chunk ${chunk.index + 1} of ${totalChunks} from a ${documentType}.` +
    prevCtx +
    `\n\nExtract all entities and relations:\n\n${chunk.text}`;

  const response = await client().messages.create({
    model,
    max_tokens: DEFAULT_MAX_TOK,
    system:     EXTRACTION_SYSTEM_PROMPT,
    tools:      [MAP_TOOL],
    tool_choice: { type: 'tool', name: 'extract_chunk' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock) throw new Error(`M4: chunk ${chunk.index} — Claude did not call extract_chunk`);

  const raw = toolBlock.input;
  return {
    chunkIndex:      chunk.index,
    chunkStart:      chunk.start,
    chunkEnd:        chunk.end,
    entities:        raw.entities        || [],
    relations:       raw.relations       || [],
    crossReferences: raw.crossReferences || [],
    chunkSummary:    raw.chunkSummary    || '',
    inputTokens:     response.usage?.input_tokens  || 0,
    outputTokens:    response.usage?.output_tokens || 0,
  };
}

// ── Batch mapper with concurrency limit ───────────────────────────────────────

/**
 * Map all chunks with bounded concurrency.
 * Passes running entity list to each subsequent batch for context carryover.
 *
 * @param {Array} chunks
 * @param {object} context  — {documentType}
 * @param {string} [model]
 * @returns {Promise<Array>} — array of chunk results in order
 */
async function mapAllChunks(chunks, context = {}, model = DEFAULT_MODEL) {
  const results = new Array(chunks.length);
  const accumulatedEntities = [];

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map((chunk) =>
        mapChunk(chunk, {
          ...context,
          totalChunks:      chunks.length,
          previousEntities: accumulatedEntities.slice(-15), // last 15 for context
        }, model)
      )
    );

    for (const r of batchResults) {
      results[r.chunkIndex] = r;
      // Accumulate unique entity names for next batch context
      for (const e of r.entities) {
        if (!accumulatedEntities.find(x => x.name.toLowerCase() === e.name.toLowerCase())) {
          accumulatedEntities.push({ name: e.name, type: e.type });
        }
      }
    }
  }

  return results;
}

module.exports = { mapChunk, mapAllChunks, MAP_TOOL, DEFAULT_MODEL };

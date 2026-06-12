'use strict';

const { chunkText } = require('../../workspace/extraction/entity.extractor');
const { addLog, startStep, completeStep, skipStep } = require('../pipeline-context');

const MAX_CHUNK_SIZE = 12000;
const CHUNK_OVERLAP  = 500;

module.exports = async function chunkTextStep(ctx) {
  if (!ctx.text || ctx.text.length < 50) {
    skipStep(ctx, 'chunk-text', 'No text to chunk');
    return;
  }

  startStep(ctx, 'chunk-text');
  ctx.chunks = chunkText(ctx.text, MAX_CHUNK_SIZE, CHUNK_OVERLAP);
  ctx.stats.chunksCount = ctx.chunks.length;

  // Build chunk metadata (charOffsets) by finding each chunk in the source text.
  // Used downstream for positional provenance on EntityMention nodes (P1-004).
  ctx.chunkMetadata = _buildChunkMetadata(ctx.text, ctx.chunks);

  addLog(ctx, 'chunk-text', `Split into ${ctx.chunks.length} chunk(s), metadata tracked`);
  completeStep(ctx, 'chunk-text', { chunks: ctx.chunks.length });
};

function _buildChunkMetadata(fullText, chunks) {
  const meta = [];
  let searchFrom = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const trimmed = chunk.trim();
    const start = fullText.indexOf(trimmed, searchFrom > 0 ? Math.max(0, searchFrom - 500) : 0);
    const charOffsetStart = start >= 0 ? start : -1;
    const charOffsetEnd   = start >= 0 ? start + trimmed.length : -1;
    meta.push({ chunkIndex: i, charOffsetStart, charOffsetEnd, sourceLength: fullText.length });
    if (start >= 0) searchFrom = start + Math.floor(trimmed.length * 0.5);
  }
  return meta;
}

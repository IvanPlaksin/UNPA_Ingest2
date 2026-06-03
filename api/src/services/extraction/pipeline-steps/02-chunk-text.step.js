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
  addLog(ctx, 'chunk-text', `Split into ${ctx.chunks.length} chunk(s)`);
  completeStep(ctx, 'chunk-text', { chunks: ctx.chunks.length });
};

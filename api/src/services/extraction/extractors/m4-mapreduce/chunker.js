'use strict';

/**
 * M4 Chunker — smart text splitting with overlap.
 *
 * Break-point priority (to avoid cutting mid-sentence):
 *   1. Paragraph break (\n\n)
 *   2. Sentence break (. ? ! followed by space)
 *   3. Word break (space)
 *   4. Hard cut (fallback)
 */

const CHUNK_SIZE    = parseInt(process.env.M4_CHUNK_SIZE    || '8000',  10);
const CHUNK_OVERLAP = parseInt(process.env.M4_CHUNK_OVERLAP || '500',   10);

/**
 * Find the best break point within `text[start..end]`, searching backwards.
 * Returns the index to end the chunk at (exclusive).
 */
function _findBreakPoint(text, end, minEnd) {
  const searchFrom = Math.max(minEnd, end - 300);

  // 1. Paragraph break
  const para = text.lastIndexOf('\n\n', end);
  if (para >= searchFrom) return para + 2;

  // 2. Sentence break
  for (let i = end - 1; i >= searchFrom; i--) {
    const ch = text[i];
    if ((ch === '.' || ch === '!' || ch === '?') && (i + 1 >= text.length || text[i + 1] === ' ' || text[i + 1] === '\n')) {
      return i + 1;
    }
  }

  // 3. Word break
  const space = text.lastIndexOf(' ', end);
  if (space >= searchFrom) return space + 1;

  // 4. Hard cut
  return end;
}

/**
 * Split text into overlapping chunks.
 *
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.chunkSize]
 * @param {number} [opts.overlap]
 * @returns {Array<{index, text, start, end, isLast}>}
 */
function chunkText(text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  if (!text || text.length === 0) return [];
  if (text.length <= chunkSize) {
    return [{ index: 0, text, start: 0, end: text.length, isLast: true }];
  }

  const chunks = [];
  let pos = 0;
  let idx = 0;

  while (pos < text.length) {
    const idealEnd = pos + chunkSize;

    let end;
    if (idealEnd >= text.length) {
      end = text.length;
    } else {
      end = _findBreakPoint(text, idealEnd, pos + Math.floor(chunkSize * 0.6));
    }

    chunks.push({
      index: idx++,
      text:  text.slice(pos, end),
      start: pos,
      end,
      isLast: end >= text.length,
    });

    if (end >= text.length) break;
    pos = Math.max(pos + 1, end - overlap);
  }

  return chunks;
}

module.exports = { chunkText, CHUNK_SIZE, CHUNK_OVERLAP };

/**
 * Token estimation for the assembly token budget.
 *
 * The budget is a hard constraint on what reaches the model, so the estimate
 * must not under-count. A flat `chars / 4` does exactly that on this corpus:
 * BPE tokenizers split Cyrillic far more finely than Latin — Russian text runs
 * closer to 2 characters per token. Since workspace content here is routinely
 * Russian, a flat /4 would report roughly half the real cost and quietly
 * overflow the budget.
 *
 * So: ASCII is charged at /4, non-ASCII at /2. Still O(n) and dependency-free.
 *
 * TODO R2: replace with a real tokenizer (tiktoken cl100k_base, or the Anthropic
 * tokenizer once it is public) and keep this as the offline fallback.
 *
 * @module services/radix/assembly/token-counter
 */

'use strict';

const ASCII_CHARS_PER_TOKEN = 4;
const NON_ASCII_CHARS_PER_TOKEN = 2;

/**
 * Estimates the token cost of a string.
 *
 * @param {string} text
 * @returns {number} estimated tokens (integer, rounded up)
 */
function estimateTokens(text) {
  if (typeof text !== 'string' || text.length === 0) return 0;

  let ascii = 0;
  let nonAscii = 0;

  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) < 128) ascii += 1;
    else nonAscii += 1;
  }

  return Math.ceil(ascii / ASCII_CHARS_PER_TOKEN + nonAscii / NON_ASCII_CHARS_PER_TOKEN);
}

module.exports = {
  estimateTokens,
  ASCII_CHARS_PER_TOKEN,
  NON_ASCII_CHARS_PER_TOKEN
};

/**
 * Promise timeout utility (PH-006)
 *
 * Wraps any promise with a configurable timeout.
 *
 * Usage:
 *   const result = await withTimeout(fetchData(), 5000, 'FetchData');
 */

'use strict';

class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
    this.code = 'TIMEOUT';
  }
}

/**
 * Wrap a promise with a timeout.
 * @param {Promise} promise
 * @param {number} ms - Timeout in milliseconds
 * @param {string} [operation] - Label for error message
 * @returns {Promise}
 */
function withTimeout(promise, ms, operation = 'Operation') {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(`${operation} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Default timeouts for various operations.
 */
const TIMEOUTS = {
  EMBED_TEXT: 10000,
  EMBED_SUBGRAPH: 15000,
  VECTOR_SEARCH: 5000,
  CATALOG_SEARCH: 10000,
  PATTERN_ANALYZE: 30000,
  PATTERN_MATCH: 15000,
  PATTERN_REPLACE: 20000,
  GRAPH_QUERY: 10000,
  GRAPH_WRITE: 15000,
  AI_COMPLETION: 120000,
  AI_TOOL_CALL: 30000
};

module.exports = { withTimeout, TimeoutError, TIMEOUTS };

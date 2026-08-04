/**
 * Assembly serializers.
 *
 * Only `natural` is implemented. `structured` and `compact` are declared in the
 * config enum but throw when selected: silently falling back to another format
 * would hand a caller a prompt shaped differently from the one they asked for,
 * and they would have no way to tell.
 *
 * The throw is deliberately reachable BEFORE strategies run — the orchestrator
 * resolves the serializer up front, so a bad `assemblyFormat` fails the request
 * immediately instead of after the retrieval work is already paid for.
 *
 * @module services/radix/assembly/serializers
 */

'use strict';

const natural = require('./natural.serializer');

/**
 * @typedef {Object} Serializer
 * @property {string} format
 * @property {string} CONTEXT_HEADER
 * @property {string} CONFLICT_HEADER
 * @property {(candidate: Object, score: number) => string} serializeElement
 * @property {(candidate: Object, score: number) => string} serializeConflict
 */

const ASSEMBLY_FORMATS = Object.freeze(['natural', 'structured', 'compact']);
const IMPLEMENTED_FORMATS = Object.freeze(['natural']);

/**
 * @param {string} [format='natural']
 * @returns {Serializer}
 */
function createSerializer(format = 'natural') {
  if (format === 'natural') return natural;

  // TODO R2: structured (XML-ish blocks for agentic/codegen callers)
  // TODO R2: compact (minimum scaffolding for tight token budgets)
  if (ASSEMBLY_FORMATS.includes(format)) {
    throw new Error(`Assembly format '${format}' is not implemented yet — use 'natural'`);
  }
  throw new Error(`Unknown assembly format: ${format}`);
}

module.exports = {
  ASSEMBLY_FORMATS,
  IMPLEMENTED_FORMATS,
  createSerializer,
  natural
};

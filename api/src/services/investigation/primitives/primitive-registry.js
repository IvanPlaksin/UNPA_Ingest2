'use strict';

/**
 * Registry of all investigative primitive executors.
 * Each primitive: { PRIMITIVE_TYPE, execute(params, context, services) → { content, evidencedBy } }
 */

const PRIMITIVES = {};

function register(primitive) {
  PRIMITIVES[primitive.PRIMITIVE_TYPE] = primitive;
}

function get(primitiveType) {
  const p = PRIMITIVES[primitiveType];
  if (!p) throw new Error(`Unknown primitive: ${primitiveType}`);
  return p;
}

function list() {
  return Object.keys(PRIMITIVES);
}

// Register all primitives on first require
register(require('./connect.primitive'));
register(require('./locate.primitive'));
register(require('./expand.primitive'));
register(require('./synthesize.primitive'));
register(require('./matrix.primitive'));
register(require('./structure.primitive'));
register(require('./timeline.primitive'));
register(require('./resolve.primitive'));
register(require('./text.primitive'));
register(require('./profile.primitive'));
register(require('./impact.primitive'));

module.exports = { register, get, list };

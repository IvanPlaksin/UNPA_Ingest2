/**
 * Renders a graph path as a sentence.
 *
 * The arrow form — `A <--[IMPLEMENTS]-- B --[GOVERNS]--> C` — is compact but
 * asks the model to decode a notation before it can use the fact. Direction in
 * particular is easy to read backwards, and reading one edge backwards inverts
 * the claim: "the rule governs the entity" and "the entity governs the rule" are
 * different statements, and only one of them is in the graph.
 *
 * So each edge is rendered as the verb it actually means, in the direction it
 * was traversed. `A <--[IMPLEMENTS]-- B` becomes "A is implemented by B" — no
 * notation to decode and no way to read the direction backwards.
 *
 * Path strength is stated qualitatively. The underlying number is a product of
 * edge weights, and printing it would imply a precision it does not have; what
 * the model needs is whether to lean on the connection, not its third decimal.
 *
 * @module services/radix/assembly/path-serializer
 */

'use strict';

const { edgeWeight, DEFAULT_EDGE_WEIGHTS } = require('../contracts/context-bundle');

/**
 * Edge type → the verb phrase for each traversal direction.
 *
 * Covers every edge type in the workspace inventory (WORKSPACE_REFERENCE §4).
 * Symmetric relations use the same phrase both ways, which is the honest
 * rendering — "conflicts with" has no meaningful inverse.
 */
const EDGE_VERBS = Object.freeze({
  IMPLEMENTS: { outgoing: 'implements', incoming: 'is implemented by' },
  DEPENDS_ON: { outgoing: 'depends on', incoming: 'is required by' },
  PRODUCES: { outgoing: 'produces', incoming: 'is produced by' },
  CONSUMES: { outgoing: 'consumes', incoming: 'is consumed by' },
  TRIGGERS: { outgoing: 'triggers', incoming: 'is triggered by' },
  GOVERNS: { outgoing: 'governs', incoming: 'is governed by' },
  CONTAINS: { outgoing: 'contains', incoming: 'is part of' },
  REFERENCES: { outgoing: 'references', incoming: 'is referenced by' },
  WORKS_IN: { outgoing: 'works in', incoming: 'is where' },
  EXTENDS: { outgoing: 'extends', incoming: 'is extended by' },
  BELONGS_TO: { outgoing: 'belongs to', incoming: 'owns' },
  RELATES_TO: { outgoing: 'relates to', incoming: 'relates to' },
  CONFLICTS_WITH: { outgoing: 'conflicts with', incoming: 'conflicts with' }
});

/** Used when an edge type has no verb mapping — reads correctly for any relation. */
const FALLBACK_VERB = { outgoing: 'is linked to', incoming: 'is linked from' };

const STRONG_THRESHOLD = 0.7;
const MODERATE_THRESHOLD = 0.4;

/**
 * Verb phrase for one traversed edge.
 *
 * @param {string} edgeType
 * @param {'outgoing'|'incoming'|null} direction
 * @returns {string}
 */
function verbFor(edgeType, direction) {
  const verbs = EDGE_VERBS[edgeType] || FALLBACK_VERB;
  return direction === 'incoming' ? verbs.incoming : verbs.outgoing;
}

/**
 * Product of the edge weights along a path — the same figure the expansion
 * strategy scored it by, so the label never contradicts the ranking.
 *
 * @param {import('../contracts/strategy.interface').PathSegment[]} path
 * @param {Object.<string, number>} [weights]
 * @returns {number}
 */
function pathStrength(path, weights = DEFAULT_EDGE_WEIGHTS) {
  if (!Array.isArray(path) || path.length < 2) return 0;

  return path
    .slice(1)
    .reduce((acc, segment) => acc * edgeWeight(segment.edgeType, weights), 1);
}

/**
 * @param {number} strength
 * @returns {'strong'|'moderate'|'weak'}
 */
function strengthLabel(strength) {
  if (strength >= STRONG_THRESHOLD) return 'strong';
  if (strength >= MODERATE_THRESHOLD) return 'moderate';
  return 'weak';
}

/**
 * Renders the path as a sentence.
 *
 * Two hops read as one clause chained by "which": "A implements B, which
 * governs C" — the model reads a single relationship rather than two facts it
 * has to join itself.
 *
 * @param {import('../contracts/strategy.interface').PathSegment[]} path
 * @returns {string} empty when there is no multi-node path to describe
 */
function narrate(path) {
  if (!Array.isArray(path) || path.length < 2) return '';

  const nameOf = (segment) => (segment && (segment.nodeName || segment.nodeId)) || 'something';

  let sentence = nameOf(path[0]);
  for (let i = 1; i < path.length; i += 1) {
    const segment = path[i];
    const verb = verbFor(segment.edgeType, segment.edgeDirection);
    // From the second hop on, the subject is the previous node — "which" keeps
    // that explicit instead of leaving the model to infer it.
    sentence += `${i === 1 ? '' : ', which'} ${verb} ${nameOf(segment)}`;
  }

  return sentence;
}

/**
 * Full rendering: the narrated path plus its strength.
 *
 * @param {import('../contracts/strategy.interface').PathSegment[]} path
 * @param {Object.<string, number>} [weights]
 * @returns {string} empty when there is no path
 */
function serializePath(path, weights = DEFAULT_EDGE_WEIGHTS) {
  const sentence = narrate(path);
  if (!sentence) return '';

  return `${sentence} (connection: ${strengthLabel(pathStrength(path, weights))})`;
}

module.exports = {
  EDGE_VERBS,
  FALLBACK_VERB,
  serializePath,
  narrate,
  pathStrength,
  strengthLabel,
  verbFor
};

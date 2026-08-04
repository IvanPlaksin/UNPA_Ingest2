/**
 * Natural-language serializer — the default assembly format.
 *
 * Renders retrieved context as prose a model reads without instruction: a titled
 * fact per element, graph paths as one chained statement rather than several
 * disconnected ones, and contradictions in their own trailing block.
 *
 * Structural labels are English on purpose. They are scaffolding addressed to
 * the model, not content: the content itself stays in whatever language the
 * workspace holds. English scaffolding also costs roughly half the tokens of
 * the Russian equivalent under BPE, and the token budget is a hard limit.
 *
 * @module services/radix/assembly/serializers/natural.serializer
 */

'use strict';

const { serializePath: serializeGraphPath } = require('../path-serializer');

const CONTEXT_HEADER = '## Relevant context from this workspace\n';
const CONFLICT_HEADER =
  '\n---\n### Contradictions between sources\n'
  + 'The sources below disagree. Do not present either side as settled fact.\n';

/**
 * Best available human-readable title for a candidate.
 *
 * @param {import('../../fusion/fusion-policy.interface').FusedCandidate} candidate
 * @returns {string}
 */
function titleOf(candidate) {
  const meta = candidate.metadata || {};
  return meta.name || meta.nodeName || meta.entityType || candidate.id;
}

/**
 * Renders provenance as a single trailing line, so the model can attribute a
 * fact when asked where it came from.
 *
 * @param {import('../../contracts/context-bundle').ElementProvenance} provenance
 * @returns {string}
 */
function serializeProvenance(provenance, metadata = {}) {
  if (!provenance) return '';

  // Prefer the document's name over its id — the reader who wants to check the
  // claim needs a filename, not a UUID.
  const label = metadata.sourceRefName
    || [provenance.sourceType, provenance.sourceId].filter(Boolean).join(' ');
  if (!label) return '';

  let line = `Source: ${label}`;
  if (metadata.sectionTitle) {
    line += `, section "${metadata.sectionTitle}"`;
  }
  if (Number.isInteger(provenance.chunkIndex)) {
    line += `, chunk ${provenance.chunkIndex}`;
  }
  return line;
}

/**
 * Renders an expansion path as a sentence — see assembly/path-serializer.js for
 * why the arrow notation was replaced.
 *
 * @param {import('../../contracts/strategy.interface').PathSegment[]} path
 * @returns {string} empty string when there is no multi-hop path to show
 */
function serializePath(path) {
  return serializeGraphPath(path);
}

/**
 * Renders one non-conflict element.
 *
 * No score is printed. Everything that reaches this point already cleared the
 * similarity threshold, and the ordering of the elements already carries the
 * ranking. Printing a number on top of that is worse than silent: scores in a
 * good result set sit in a narrow band, so normalization stretches them to
 * 1.00 / 0.49 / 0.00 and the model is told a perfectly valid fact has
 * "relevance 0.00". The score stays on the element for API consumers.
 *
 * @param {import('../../fusion/fusion-policy.interface').FusedCandidate} candidate
 * @param {number} score - normalized score in [0..1]; kept for other formats
 * @returns {string}
 */
function serializeElement(candidate, score) { // eslint-disable-line no-unused-vars
  const lines = [];
  const meta = candidate.metadata || {};

  // Prefer the precise domain type ('business_rule') over the coarse rendering
  // class ('rule') — the element type exists to pick a layout, not to describe
  // the fact to the model.
  const displayType = meta.draftType || candidate.type;
  lines.push(`**${titleOf(candidate)}** (${displayType})`);

  if (candidate.content) lines.push(candidate.content);

  const path = serializePath(meta.expansionPath);
  if (path) lines.push(`Related: ${path}`);

  const provenance = serializeProvenance(candidate.provenance, meta);
  if (provenance) lines.push(provenance);

  return lines.join('\n');
}

/**
 * Renders one element that was reached over a CONFLICTS_WITH edge.
 *
 * @param {import('../../fusion/fusion-policy.interface').FusedCandidate} candidate
 * @param {number} score - normalized score in [0..1]; kept for other formats
 * @returns {string}
 */
function serializeConflict(candidate, score) { // eslint-disable-line no-unused-vars
  const meta = candidate.metadata || {};
  const conflict = meta.conflict || {};
  const other = conflict.withNodeName || conflict.withNodeId || 'another source';

  const lines = [];
  lines.push(
    `⚠ **${titleOf(candidate)}** conflicts with **${other}**`
    + `${conflict.conflictType ? ` (${conflict.conflictType})` : ''}`
  );

  if (candidate.content) lines.push(candidate.content);

  const provenance = serializeProvenance(candidate.provenance, meta);
  if (provenance) lines.push(provenance);

  return lines.join('\n');
}

module.exports = {
  format: 'natural',
  CONTEXT_HEADER,
  CONFLICT_HEADER,
  serializeElement,
  serializeConflict,
  serializePath,
  serializeProvenance,
  titleOf
};

/**
 * @typedef {Object} Atom
 * @property {string} content - The actual text content.
 * @property {'text' | 'header' | 'code' | 'list_item'} type - The type of content.
 * @property {string[]} context - Hierarchical context (e.g. ['Chapter 1', 'Section A']).
 * @property {Object} metadata - Source metadata.
 * @property {number} [metadata.page] - Page number.
 * @property {number} [metadata.line] - Approximate line number.
 * @property {string} [metadata.source] - Source identifier.
 */

module.exports = {};

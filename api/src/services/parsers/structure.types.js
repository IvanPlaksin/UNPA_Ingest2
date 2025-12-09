/**
 * @typedef {Object} Atom
 * @property {string} id - UUID
 * @property {'paragraph'|'email_message'|'code_block'} type
 * @property {string} content - The actual text content
 * @property {string} context - Parent context (e.g., "Header: Requirements")
 * @property {Object} metadata - { page, author, date, source_file, etc. }
 */
module.exports = {};

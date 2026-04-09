/**
 * GXE Runtime Learning Module
 *
 * Components for pattern-based learning and feedback loop:
 * - PatternLibrary: In-memory cache with LRU eviction
 * - Integration with ImmutableGraph for persistence
 *
 * @module runtime/learning
 */

const { PatternLibrary } = require('./PatternLibrary');

module.exports = {
  PatternLibrary
};

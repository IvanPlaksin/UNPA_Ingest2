/**
 * Pattern Library Module
 *
 * Exports all pattern-related classes and utilities:
 * - EntityPattern - patterns for extracting entities
 * - RelationPattern - patterns for extracting relations
 * - SubgraphPattern - patterns for graph structures
 * - PatternLibrary - main library for pattern management
 *
 * @module services/patterns
 */

'use strict';

const { EntityPattern, RelationPattern, SubgraphPattern } = require('./pattern-types');
const { PatternLibrary, createPatternLibrary, patternLibrary } = require('./pattern-library');

module.exports = {
    // Pattern classes
    EntityPattern,
    RelationPattern,
    SubgraphPattern,

    // Library class and factory
    PatternLibrary,
    createPatternLibrary,

    // Singleton instance
    patternLibrary
};

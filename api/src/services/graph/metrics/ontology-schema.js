/**
 * AOPEG Ontology Schema for Validation
 *
 * Used by Text2KGMetrics for ontology conformance checking.
 * Defines:
 * - Valid entity types
 * - Valid relation types
 * - Domain/range constraints for relations
 * - Required attributes for entity types
 *
 * @module services/graph/metrics/ontology-schema
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// AOPEG ONTOLOGY SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const AOPEG_ONTOLOGY = {
    // ─────────────────────────────────────────────────────────────────────────
    // ENTITY TYPES (from ontology layers)
    // ─────────────────────────────────────────────────────────────────────────

    entityTypes: [
        // Strategic Layer (z=-200)
        'Epic',
        'Feature',
        'BusinessRule',
        'Concept',
        'Goal',
        'Objective',
        'Policy',
        'Regulation',

        // Business Layer (z=0)
        'WorkItem',
        'Person',
        'Team',
        'Organization',
        'Document',
        'Process',
        'Project',
        'Meeting',
        'Decision',

        // Code Layer (z=200)
        'System',
        'Module',
        'API',
        'Database',
        'Technology',
        'File',
        'Commit',
        'Repository',
        'Deployment',

        // Cross-layer
        'Task',
        'Bug',
        'UserStory',
        'DataEntity',
        'Tag',
        'Milestone',
        'Release',
        'Risk',
        'Issue'
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // RELATION TYPES
    // ─────────────────────────────────────────────────────────────────────────

    relationTypes: [
        // Structural relations
        'CONTAINS',
        'PART_OF',
        'BELONGS_TO',

        // Dependency relations
        'DEPENDS_ON',
        'REQUIRES',
        'BLOCKS',

        // Implementation relations
        'IMPLEMENTS',
        'USES',
        'REFERENCES',

        // Assignment relations
        'ASSIGNED_TO',
        'OWNED_BY',
        'MANAGED_BY',

        // Authorship relations
        'AUTHORED_BY',
        'CREATED_BY',
        'MODIFIED_BY',

        // Resolution relations
        'RESOLVES',
        'FIXES',
        'ADDRESSES',

        // Association relations
        'RELATED_TO',
        'ASSOCIATED_WITH',
        'LINKED_TO',

        // Production relations
        'PRODUCES',
        'GENERATES',
        'DELIVERS',

        // Temporal relations
        'FOLLOWS',
        'PRECEDES',
        'SUPERSEDES',

        // Hierarchy relations
        'PARENT_OF',
        'CHILD_OF',
        'DERIVED_FROM'
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // DOMAIN/RANGE CONSTRAINTS
    // ─────────────────────────────────────────────────────────────────────────

    constraints: {
        CONTAINS: {
            domain: ['Epic', 'Feature', 'System', 'Module', 'Document', 'Organization', 'Project', 'Repository'],
            range: ['Feature', 'WorkItem', 'Task', 'Module', 'API', 'File', 'Person', 'Team', 'UserStory', 'Bug']
        },

        PART_OF: {
            domain: ['Person', 'Team', 'Module', 'API', 'File', 'Task', 'Organization', 'Project'],
            range: ['Organization', 'Team', 'System', 'Module', 'Project', 'Epic']
        },

        DEPENDS_ON: {
            domain: ['System', 'Module', 'API', 'WorkItem', 'Task', 'Feature', 'UserStory'],
            range: ['System', 'Module', 'API', 'Database', 'Technology', 'WorkItem', 'Task']
        },

        IMPLEMENTS: {
            domain: ['System', 'Module', 'API', 'Commit', 'WorkItem', 'Task'],
            range: ['Feature', 'BusinessRule', 'WorkItem', 'UserStory', 'Epic']
        },

        USES: {
            domain: ['System', 'Module', 'API', 'Process', 'Person', 'Project'],
            range: ['System', 'Module', 'API', 'Database', 'Technology', 'Document']
        },

        REFERENCES: {
            domain: ['Document', 'WorkItem', 'Commit', 'BusinessRule', 'File'],
            range: ['Document', 'System', 'Person', 'WorkItem', 'BusinessRule', 'Regulation', 'Policy']
        },

        ASSIGNED_TO: {
            domain: ['WorkItem', 'Task', 'Bug', 'UserStory', 'Issue', 'Person'],
            range: ['Person', 'Team', 'Project', 'Task', 'WorkItem']
        },

        OWNED_BY: {
            domain: ['System', 'Project', 'Repository', 'Document', 'Process'],
            range: ['Person', 'Team', 'Organization']
        },

        AUTHORED_BY: {
            domain: ['Document', 'Commit', 'WorkItem', 'File'],
            range: ['Person']
        },

        RESOLVES: {
            domain: ['Commit', 'WorkItem', 'Task'],
            range: ['Bug', 'WorkItem', 'Task', 'Issue']
        },

        RELATED_TO: {
            domain: ['*'], // Any type
            range: ['*']   // Any type
        },

        PRODUCES: {
            domain: ['Process', 'System', 'Person', 'Project', 'Organization', 'Team'],
            range: ['Document', 'DataEntity', 'Commit', 'Release', 'Deployment']
        },

        FOLLOWS: {
            domain: ['Task', 'WorkItem', 'Milestone', 'Release', 'Phase'],
            range: ['Task', 'WorkItem', 'Milestone', 'Release', 'Phase']
        },

        BLOCKS: {
            domain: ['Bug', 'Issue', 'Task', 'WorkItem'],
            range: ['Task', 'WorkItem', 'Feature', 'Release']
        },

        DERIVED_FROM: {
            domain: ['Document', 'System', 'Feature', 'WorkItem'],
            range: ['Document', 'System', 'Feature', 'Epic', 'BusinessRule']
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // REQUIRED ATTRIBUTES FOR ENTITY TYPES
    // ─────────────────────────────────────────────────────────────────────────

    requiredAttributes: {
        Person: ['name'],
        Organization: ['name'],
        Team: ['name'],
        System: ['name'],
        Document: ['title'],
        WorkItem: ['id'],
        Task: ['id'],
        Bug: ['id'],
        UserStory: ['id'],
        Commit: ['hash'],
        File: ['path'],
        API: ['name'],
        Module: ['name'],
        Project: ['name']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // OPTIONAL ATTRIBUTES FOR ENTITY TYPES
    // ─────────────────────────────────────────────────────────────────────────

    optionalAttributes: {
        Person: ['email', 'role', 'department'],
        WorkItem: ['title', 'state', 'priority', 'assignee', 'createdDate'],
        Document: ['author', 'version', 'createdDate', 'modifiedDate'],
        System: ['version', 'status', 'description'],
        Commit: ['message', 'author', 'date', 'files'],
        Bug: ['severity', 'status', 'priority', 'description'],
        Task: ['status', 'priority', 'estimatedHours', 'actualHours']
    },

    // ─────────────────────────────────────────────────────────────────────────
    // CARDINALITY CONSTRAINTS
    // ─────────────────────────────────────────────────────────────────────────

    cardinalityConstraints: {
        ASSIGNED_TO: {
            maxOutgoing: 5,      // WorkItem can be assigned to max 5 people
            maxIncoming: null    // Person can have unlimited assignments
        },
        AUTHORED_BY: {
            maxOutgoing: 10,     // Document can have max 10 authors
            maxIncoming: null
        },
        OWNED_BY: {
            maxOutgoing: 1,      // Entity can have only one owner
            maxIncoming: null
        },
        PARENT_OF: {
            maxOutgoing: null,
            maxIncoming: 1       // Entity can have only one parent
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSITIVE RELATIONS
    // ─────────────────────────────────────────────────────────────────────────

    transitiveRelations: ['PART_OF', 'CONTAINS', 'DEPENDS_ON', 'DERIVED_FROM']
};

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a triple against the ontology
 * @param {Object} triple - Triple to validate
 * @param {Object} ontology - Ontology to validate against
 * @returns {Object} Validation result
 */
function validateTriple(triple, ontology = AOPEG_ONTOLOGY) {
    const errors = [];
    const warnings = [];

    const subjectType = typeof triple.subject === 'object' ? triple.subject.type : null;
    const objectType = typeof triple.object === 'object' ? triple.object.type : null;
    const predicate = triple.predicate || triple.relation;

    // Check entity types
    if (subjectType && !ontology.entityTypes.includes(subjectType)) {
        warnings.push(`Unknown subject type: ${subjectType}`);
    }

    if (objectType && !ontology.entityTypes.includes(objectType)) {
        warnings.push(`Unknown object type: ${objectType}`);
    }

    // Check relation type
    if (predicate && !ontology.relationTypes.includes(predicate)) {
        errors.push(`Unknown relation type: ${predicate}`);
    }

    // Check domain/range constraints
    const constraint = ontology.constraints[predicate];
    if (constraint) {
        // Check domain
        if (subjectType &&
            !constraint.domain.includes('*') &&
            !constraint.domain.includes(subjectType)) {
            errors.push(`Domain violation: ${subjectType} cannot be subject of ${predicate}`);
        }

        // Check range
        if (objectType &&
            !constraint.range.includes('*') &&
            !constraint.range.includes(objectType)) {
            errors.push(`Range violation: ${objectType} cannot be object of ${predicate}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate an entity against the ontology
 * @param {Object} entity - Entity to validate
 * @param {Object} ontology - Ontology to validate against
 * @returns {Object} Validation result
 */
function validateEntity(entity, ontology = AOPEG_ONTOLOGY) {
    const errors = [];
    const warnings = [];

    const entityType = entity.type;

    // Check entity type
    if (!entityType) {
        warnings.push('Entity has no type specified');
    } else if (!ontology.entityTypes.includes(entityType)) {
        warnings.push(`Unknown entity type: ${entityType}`);
    }

    // Check required attributes
    if (entityType && ontology.requiredAttributes[entityType]) {
        for (const attr of ontology.requiredAttributes[entityType]) {
            if (!entity[attr] && entity[attr] !== 0) {
                errors.push(`Missing required attribute: ${attr} for ${entityType}`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Get valid relation types for a pair of entity types
 * @param {string} subjectType - Subject entity type
 * @param {string} objectType - Object entity type
 * @param {Object} ontology - Ontology to check
 * @returns {string[]} Valid relation types
 */
function getValidRelations(subjectType, objectType, ontology = AOPEG_ONTOLOGY) {
    const validRelations = [];

    for (const [relation, constraint] of Object.entries(ontology.constraints)) {
        const domainOk = constraint.domain.includes('*') || constraint.domain.includes(subjectType);
        const rangeOk = constraint.range.includes('*') || constraint.range.includes(objectType);

        if (domainOk && rangeOk) {
            validRelations.push(relation);
        }
    }

    return validRelations;
}

/**
 * Get entity types that can be subjects of a relation
 * @param {string} relationType - Relation type
 * @param {Object} ontology - Ontology to check
 * @returns {string[]} Valid subject types
 */
function getValidSubjectTypes(relationType, ontology = AOPEG_ONTOLOGY) {
    const constraint = ontology.constraints[relationType];
    if (!constraint) return ontology.entityTypes;
    if (constraint.domain.includes('*')) return ontology.entityTypes;
    return constraint.domain;
}

/**
 * Get entity types that can be objects of a relation
 * @param {string} relationType - Relation type
 * @param {Object} ontology - Ontology to check
 * @returns {string[]} Valid object types
 */
function getValidObjectTypes(relationType, ontology = AOPEG_ONTOLOGY) {
    const constraint = ontology.constraints[relationType];
    if (!constraint) return ontology.entityTypes;
    if (constraint.range.includes('*')) return ontology.entityTypes;
    return constraint.range;
}

/**
 * Check if a relation is valid between two entity types
 * @param {string} subjectType - Subject entity type
 * @param {string} relationType - Relation type
 * @param {string} objectType - Object entity type
 * @param {Object} ontology - Ontology to check
 * @returns {boolean} Whether the relation is valid
 */
function isValidRelation(subjectType, relationType, objectType, ontology = AOPEG_ONTOLOGY) {
    const constraint = ontology.constraints[relationType];

    if (!constraint) {
        // Unknown relation - allow by default but log warning
        return true;
    }

    const domainOk = constraint.domain.includes('*') || constraint.domain.includes(subjectType);
    const rangeOk = constraint.range.includes('*') || constraint.range.includes(objectType);

    return domainOk && rangeOk;
}

/**
 * Get ontology statistics
 * @param {Object} ontology - Ontology to analyze
 * @returns {Object} Statistics
 */
function getOntologyStats(ontology = AOPEG_ONTOLOGY) {
    return {
        entityTypeCount: ontology.entityTypes.length,
        relationTypeCount: ontology.relationTypes.length,
        constraintCount: Object.keys(ontology.constraints).length,
        avgDomainSize: Object.values(ontology.constraints)
            .reduce((sum, c) => sum + (c.domain.includes('*') ? ontology.entityTypes.length : c.domain.length), 0) /
            Object.keys(ontology.constraints).length,
        avgRangeSize: Object.values(ontology.constraints)
            .reduce((sum, c) => sum + (c.range.includes('*') ? ontology.entityTypes.length : c.range.length), 0) /
            Object.keys(ontology.constraints).length
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// ONTOLOGY BUILDER (for custom ontologies)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a custom ontology by extending AOPEG
 * @param {Object} customizations - Custom entity types, relations, constraints
 * @returns {Object} Extended ontology
 */
function createCustomOntology(customizations = {}) {
    return {
        entityTypes: [
            ...AOPEG_ONTOLOGY.entityTypes,
            ...(customizations.entityTypes || [])
        ],
        relationTypes: [
            ...AOPEG_ONTOLOGY.relationTypes,
            ...(customizations.relationTypes || [])
        ],
        constraints: {
            ...AOPEG_ONTOLOGY.constraints,
            ...(customizations.constraints || {})
        },
        requiredAttributes: {
            ...AOPEG_ONTOLOGY.requiredAttributes,
            ...(customizations.requiredAttributes || {})
        },
        optionalAttributes: {
            ...AOPEG_ONTOLOGY.optionalAttributes,
            ...(customizations.optionalAttributes || {})
        }
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    // Schema
    AOPEG_ONTOLOGY,

    // Validation functions
    validateTriple,
    validateEntity,

    // Query functions
    getValidRelations,
    getValidSubjectTypes,
    getValidObjectTypes,
    isValidRelation,
    getOntologyStats,

    // Builder
    createCustomOntology
};

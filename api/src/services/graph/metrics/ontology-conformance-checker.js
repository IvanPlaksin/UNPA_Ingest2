/**
 * Ontology Conformance Checker
 *
 * Production-ready conformance checking following:
 * - SHACL (W3C) — Shapes Constraint Language
 * - OWL 2 Profiles — reasoning-based constraints
 * - KGValidator (2024) — production-grade validation
 *
 * Features:
 * - Entity type validation
 * - Relation domain/range validation
 * - Cardinality constraints
 * - Required attribute validation
 * - Transitive closure checking
 * - Custom ontology support
 * - Actionable fix suggestions
 *
 * @module services/graph/metrics/ontology-conformance-checker
 */

'use strict';

const { AOPEG_ONTOLOGY, validateTriple, getValidRelations } = require('./ontology-schema');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
    strictMode: false,
    suggestFixes: true,
    checkCardinality: true,
    checkAttributes: true,
    checkTransitivity: false,
    customOntology: null
};

// Extended cardinality constraints
const CARDINALITY_CONSTRAINTS = {
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
};

// Transitive relations (A→B and B→C implies A→C)
const TRANSITIVE_RELATIONS = ['PART_OF', 'CONTAINS', 'DEPENDS_ON', 'DERIVED_FROM'];

// ═══════════════════════════════════════════════════════════════════════════
// ONTOLOGY CONFORMANCE CHECKER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class OntologyConformanceChecker {
    /**
     * Create an ontology conformance checker
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.options = { ...DEFAULT_CONFIG, ...options };

        // Merge custom ontology with base
        this.ontology = this._mergeOntologies(
            AOPEG_ONTOLOGY,
            this.options.customOntology
        );

        // Add cardinality and transitivity if not present
        this.ontology.cardinalityConstraints = {
            ...CARDINALITY_CONSTRAINTS,
            ...(this.ontology.cardinalityConstraints || {})
        };
        this.ontology.transitiveRelations = [
            ...new Set([
                ...TRANSITIVE_RELATIONS,
                ...(this.ontology.transitiveRelations || [])
            ])
        ];

        this.stats = {
            totalChecks: 0,
            passed: 0,
            failed: 0,
            warnings: 0
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN CHECK METHOD
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check full extraction result against ontology
     * @param {Object} extractionResult - { entities, relations, triples }
     * @returns {Object} ConformanceReport
     */
    check(extractionResult) {
        this.stats.totalChecks++;
        const startTime = Date.now();

        const violations = [];
        const warnings = [];
        const suggestions = [];

        // 1. Check entity types
        const entityResults = this._checkEntities(extractionResult.entities || []);
        violations.push(...entityResults.violations);
        warnings.push(...entityResults.warnings);
        suggestions.push(...entityResults.suggestions);

        // 2. Check relations
        const relationResults = this._checkRelations(
            extractionResult.relations || extractionResult.triples || [],
            extractionResult.entities || []
        );
        violations.push(...relationResults.violations);
        warnings.push(...relationResults.warnings);
        suggestions.push(...relationResults.suggestions);

        // 3. Check cardinality constraints
        if (this.options.checkCardinality) {
            const cardinalityResults = this._checkCardinality(
                extractionResult.entities || [],
                extractionResult.relations || []
            );
            violations.push(...cardinalityResults.violations);
            warnings.push(...cardinalityResults.warnings);
        }

        // 4. Check required attributes
        if (this.options.checkAttributes) {
            const attributeResults = this._checkRequiredAttributes(
                extractionResult.entities || []
            );
            violations.push(...attributeResults.violations);
            warnings.push(...attributeResults.warnings);
        }

        // 5. Check transitive relations
        if (this.options.checkTransitivity) {
            const transitivityResults = this._checkTransitivity(
                extractionResult.relations || []
            );
            warnings.push(...transitivityResults.warnings);
        }

        // Calculate conformance rate
        const totalItems = (extractionResult.entities?.length || 0) +
                          (extractionResult.relations?.length || 0);
        const violationCount = violations.length;
        const conformanceRate = totalItems > 0
            ? Math.max(0, (totalItems - violationCount) / totalItems)
            : 1;

        // Update stats
        if (violations.length === 0) {
            this.stats.passed++;
        } else {
            this.stats.failed++;
        }
        this.stats.warnings += warnings.length;

        return {
            conformant: violations.length === 0,
            conformanceRate,
            grade: this._rateToGrade(conformanceRate),

            summary: {
                totalItems,
                violations: violations.length,
                warnings: warnings.length,
                suggestions: suggestions.length
            },

            violations,
            warnings,
            suggestions,

            byCategory: this._groupByCategory(violations),

            duration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SINGLE ITEM CHECKS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check single entity against ontology
     * @param {Object} entity - Entity to check
     * @returns {Object} Check result
     */
    checkEntity(entity) {
        const violations = [];
        const warnings = [];
        const suggestions = [];

        // Type check
        if (entity.type) {
            if (!this.ontology.entityTypes.includes(entity.type)) {
                violations.push({
                    category: 'entity_type',
                    severity: 'error',
                    message: `Unknown entity type: ${entity.type}`,
                    entity: entity.name,
                    currentValue: entity.type,
                    validTypes: this.ontology.entityTypes.slice(0, 15)
                });

                if (this.options.suggestFixes) {
                    const suggested = this._suggestEntityType(entity);
                    if (suggested) {
                        suggestions.push({
                            type: 'change_type',
                            entity: entity.name,
                            from: entity.type,
                            to: suggested,
                            confidence: 0.7,
                            reason: `"${entity.type}" is not a valid entity type`
                        });
                    }
                }
            }
        } else {
            warnings.push({
                category: 'missing_type',
                severity: 'warning',
                message: `Entity has no type: ${entity.name}`,
                entity: entity.name
            });
        }

        // Attribute check
        if (this.options.checkAttributes && entity.type) {
            const required = this.ontology.requiredAttributes?.[entity.type] || [];
            for (const attr of required) {
                const hasAttr = entity[attr] !== undefined ||
                               entity.attributes?.[attr] !== undefined;

                if (!hasAttr) {
                    warnings.push({
                        category: 'missing_attribute',
                        severity: 'warning',
                        message: `Missing required attribute "${attr}" for ${entity.type}: ${entity.name}`,
                        entity: entity.name,
                        entityType: entity.type,
                        attribute: attr
                    });
                }
            }
        }

        return { violations, warnings, suggestions };
    }

    /**
     * Check single relation against ontology
     * @param {Object} relation - Relation to check
     * @param {Map} entityMap - Map of entity names to entities
     * @returns {Object} Check result
     */
    checkRelation(relation, entityMap = new Map()) {
        const violations = [];
        const warnings = [];
        const suggestions = [];

        const subject = relation.subject || relation.source;
        const predicate = relation.predicate || relation.relation || relation.type;
        const object = relation.object || relation.target;

        // Get entity types
        const subjectType = this._getEntityType(subject, entityMap);
        const objectType = this._getEntityType(object, entityMap);

        // Check predicate exists
        if (!this.ontology.relationTypes.includes(predicate)) {
            violations.push({
                category: 'relation_type',
                severity: 'error',
                message: `Unknown relation type: ${predicate}`,
                relation: `${subject} ${predicate} ${object}`,
                currentValue: predicate,
                validTypes: this.ontology.relationTypes.slice(0, 15)
            });

            if (this.options.suggestFixes && subjectType && objectType) {
                const validRelations = getValidRelations(subjectType, objectType, this.ontology);
                if (validRelations.length > 0) {
                    suggestions.push({
                        type: 'change_relation',
                        relation: `${subject} ${predicate} ${object}`,
                        from: predicate,
                        to: validRelations[0],
                        alternatives: validRelations.slice(0, 3),
                        confidence: 0.6,
                        reason: `"${predicate}" is not a valid relation type`
                    });
                }
            }
        } else {
            // Check domain/range constraints
            const constraint = this.ontology.constraints?.[predicate];

            if (constraint) {
                // Domain check
                if (subjectType && constraint.domain &&
                    !constraint.domain.includes('*') &&
                    !constraint.domain.includes(subjectType)) {
                    violations.push({
                        category: 'domain_violation',
                        severity: 'error',
                        message: `Domain violation: ${subjectType} cannot be subject of ${predicate}`,
                        relation: `${subject} ${predicate} ${object}`,
                        expected: constraint.domain.slice(0, 10),
                        actual: subjectType
                    });

                    if (this.options.suggestFixes) {
                        suggestions.push({
                            type: 'change_subject_type',
                            entity: subject,
                            from: subjectType,
                            to: constraint.domain[0],
                            reason: `${subjectType} not in domain of ${predicate}`
                        });
                    }
                }

                // Range check
                if (objectType && constraint.range &&
                    !constraint.range.includes('*') &&
                    !constraint.range.includes(objectType)) {
                    violations.push({
                        category: 'range_violation',
                        severity: 'error',
                        message: `Range violation: ${objectType} cannot be object of ${predicate}`,
                        relation: `${subject} ${predicate} ${object}`,
                        expected: constraint.range.slice(0, 10),
                        actual: objectType
                    });

                    if (this.options.suggestFixes) {
                        suggestions.push({
                            type: 'change_object_type',
                            entity: object,
                            from: objectType,
                            to: constraint.range[0],
                            reason: `${objectType} not in range of ${predicate}`
                        });
                    }
                }
            }
        }

        // Warn if entities not in extraction
        if (!entityMap.has(this._normalizeEntityName(subject))) {
            warnings.push({
                category: 'missing_entity',
                severity: 'warning',
                message: `Subject entity not in extraction: ${subject}`,
                relation: `${subject} ${predicate} ${object}`,
                entity: subject
            });
        }

        if (!entityMap.has(this._normalizeEntityName(object))) {
            warnings.push({
                category: 'missing_entity',
                severity: 'warning',
                message: `Object entity not in extraction: ${object}`,
                relation: `${subject} ${predicate} ${object}`,
                entity: object
            });
        }

        return { violations, warnings, suggestions };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BATCH CHECKS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check all entities
     */
    _checkEntities(entities) {
        const violations = [];
        const warnings = [];
        const suggestions = [];

        for (const entity of entities) {
            const result = this.checkEntity(entity);
            violations.push(...result.violations);
            warnings.push(...result.warnings);
            suggestions.push(...result.suggestions);
        }

        return { violations, warnings, suggestions };
    }

    /**
     * Check all relations
     */
    _checkRelations(relations, entities) {
        const violations = [];
        const warnings = [];
        const suggestions = [];

        // Build entity map for type lookup
        const entityMap = new Map();
        for (const entity of entities) {
            entityMap.set(this._normalizeEntityName(entity.name), entity);
            if (entity.id) {
                entityMap.set(this._normalizeEntityName(entity.id), entity);
            }
        }

        for (const relation of relations) {
            const result = this.checkRelation(relation, entityMap);
            violations.push(...result.violations);
            warnings.push(...result.warnings);
            suggestions.push(...result.suggestions);
        }

        return { violations, warnings, suggestions };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CARDINALITY CHECKS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check cardinality constraints
     */
    _checkCardinality(entities, relations) {
        const violations = [];
        const warnings = [];

        // Count relations per entity
        const outgoingCount = new Map(); // entity:predicate -> count
        const incomingCount = new Map(); // entity:predicate -> count

        for (const relation of relations) {
            const subject = this._normalizeEntityName(relation.subject || relation.source);
            const object = this._normalizeEntityName(relation.object || relation.target);
            const predicate = relation.predicate || relation.relation;

            const outKey = `${subject}:${predicate}`;
            const inKey = `${object}:${predicate}`;

            outgoingCount.set(outKey, (outgoingCount.get(outKey) || 0) + 1);
            incomingCount.set(inKey, (incomingCount.get(inKey) || 0) + 1);
        }

        // Check cardinality constraints
        const cardinalityConstraints = this.ontology.cardinalityConstraints || {};

        for (const [predicate, constraint] of Object.entries(cardinalityConstraints)) {
            // Check max outgoing
            if (constraint.maxOutgoing !== null && constraint.maxOutgoing !== undefined) {
                for (const [key, count] of outgoingCount) {
                    if (key.endsWith(`:${predicate}`) && count > constraint.maxOutgoing) {
                        const entity = key.split(':')[0];
                        violations.push({
                            category: 'cardinality_violation',
                            severity: 'error',
                            message: `Entity "${entity}" has ${count} outgoing ${predicate} relations, max allowed: ${constraint.maxOutgoing}`,
                            entity,
                            predicate,
                            count,
                            max: constraint.maxOutgoing,
                            direction: 'outgoing'
                        });
                    }
                }
            }

            // Check max incoming
            if (constraint.maxIncoming !== null && constraint.maxIncoming !== undefined) {
                for (const [key, count] of incomingCount) {
                    if (key.endsWith(`:${predicate}`) && count > constraint.maxIncoming) {
                        const entity = key.split(':')[0];
                        violations.push({
                            category: 'cardinality_violation',
                            severity: 'error',
                            message: `Entity "${entity}" has ${count} incoming ${predicate} relations, max allowed: ${constraint.maxIncoming}`,
                            entity,
                            predicate,
                            count,
                            max: constraint.maxIncoming,
                            direction: 'incoming'
                        });
                    }
                }
            }
        }

        return { violations, warnings };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATTRIBUTE CHECKS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check required attributes
     */
    _checkRequiredAttributes(entities) {
        const violations = [];
        const warnings = [];

        for (const entity of entities) {
            if (!entity.type) continue;

            const required = this.ontology.requiredAttributes?.[entity.type] || [];

            for (const attr of required) {
                const hasAttr = entity[attr] !== undefined ||
                               entity.attributes?.[attr] !== undefined;

                if (!hasAttr) {
                    if (this.options.strictMode) {
                        violations.push({
                            category: 'missing_required_attribute',
                            severity: 'error',
                            message: `Missing required attribute "${attr}" for ${entity.type}: ${entity.name}`,
                            entity: entity.name,
                            entityType: entity.type,
                            attribute: attr
                        });
                    } else {
                        warnings.push({
                            category: 'missing_required_attribute',
                            severity: 'warning',
                            message: `Missing required attribute "${attr}" for ${entity.type}: ${entity.name}`,
                            entity: entity.name,
                            entityType: entity.type,
                            attribute: attr
                        });
                    }
                }
            }
        }

        return { violations, warnings };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSITIVITY CHECKS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check transitive relations for completeness
     */
    _checkTransitivity(relations) {
        const warnings = [];
        const transitiveRelations = this.ontology.transitiveRelations || [];

        // Build relation graph per predicate
        const graph = new Map();

        for (const relation of relations) {
            const predicate = relation.predicate || relation.relation;
            if (!transitiveRelations.includes(predicate)) continue;

            const subject = this._normalizeEntityName(relation.subject || relation.source);
            const object = this._normalizeEntityName(relation.object || relation.target);

            if (!graph.has(predicate)) {
                graph.set(predicate, new Map());
            }

            const predicateGraph = graph.get(predicate);
            if (!predicateGraph.has(subject)) {
                predicateGraph.set(subject, new Set());
            }
            predicateGraph.get(subject).add(object);
        }

        // Check for missing transitive edges
        for (const [predicate, predicateGraph] of graph) {
            for (const [a, bSet] of predicateGraph) {
                for (const b of bSet) {
                    const cSet = predicateGraph.get(b);
                    if (cSet) {
                        for (const c of cSet) {
                            // If A→B and B→C exist, check if A→C exists
                            const aTargets = predicateGraph.get(a) || new Set();
                            if (!aTargets.has(c) && a !== c) {
                                warnings.push({
                                    category: 'missing_transitive',
                                    severity: 'info',
                                    message: `Missing transitive relation: ${a} ${predicate} ${c} (implied by ${a}→${b}→${c})`,
                                    predicate,
                                    path: [a, b, c],
                                    suggestion: `Add: ${a} ${predicate} ${c}`
                                });
                            }
                        }
                    }
                }
            }
        }

        return { warnings };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUGGESTION APPLICATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply suggestions to extraction result
     * @param {Object} extractionResult - Original extraction
     * @param {Array} suggestions - Suggestions to apply
     * @returns {Object} Modified extraction
     */
    applySuggestions(extractionResult, suggestions) {
        const result = JSON.parse(JSON.stringify(extractionResult));

        for (const suggestion of suggestions) {
            try {
                switch (suggestion.type) {
                    case 'change_type':
                    case 'change_subject_type':
                    case 'change_object_type':
                        const entity = (result.entities || []).find(
                            e => this._normalizeEntityName(e.name) === this._normalizeEntityName(suggestion.entity)
                        );
                        if (entity) {
                            entity.type = suggestion.to;
                        }
                        break;

                    case 'change_relation':
                        const relStr = suggestion.relation;
                        const rel = (result.relations || []).find(r => {
                            const s = r.subject || r.source;
                            const p = r.predicate || r.relation;
                            const o = r.object || r.target;
                            return `${s} ${p} ${o}` === relStr;
                        });
                        if (rel) {
                            rel.predicate = suggestion.to;
                            if (rel.relation) rel.relation = suggestion.to;
                        }
                        break;
                }
            } catch (error) {
                // Continue with other suggestions
            }
        }

        return result;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPER METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Suggest entity type based on name and context
     */
    _suggestEntityType(entity) {
        const name = (entity.name || '').toLowerCase();
        const type = (entity.type || '').toLowerCase();

        const patterns = [
            { pattern: /^(mr|ms|dr|prof)\./i, type: 'Person' },
            { pattern: /department|division|unit|office|agency/i, type: 'Organization' },
            { pattern: /system|platform|application|app|software/i, type: 'System' },
            { pattern: /api|endpoint|service|interface/i, type: 'API' },
            { pattern: /database|db|storage|repository/i, type: 'Database' },
            { pattern: /document|doc|report|spec|manual/i, type: 'Document' },
            { pattern: /process|workflow|procedure|pipeline/i, type: 'Process' },
            { pattern: /project|initiative|program|mission/i, type: 'Project' },
            { pattern: /task|ticket|issue|item/i, type: 'WorkItem' },
            { pattern: /bug|defect|error|fault/i, type: 'Bug' },
            { pattern: /feature|capability|function/i, type: 'Feature' },
            { pattern: /rule|policy|constraint|regulation/i, type: 'BusinessRule' },
            { pattern: /team|group|squad/i, type: 'Team' },
            { pattern: /meeting|session|conference/i, type: 'Meeting' },
            { pattern: /decision|resolution/i, type: 'Decision' }
        ];

        for (const { pattern, type: suggestedType } of patterns) {
            if (pattern.test(name) || pattern.test(type)) {
                return suggestedType;
            }
        }

        return null;
    }

    /**
     * Get entity type from map or object
     */
    _getEntityType(entityRef, entityMap) {
        const key = this._normalizeEntityName(
            typeof entityRef === 'object' ? entityRef.name || entityRef.id : entityRef
        );

        const entity = entityMap.get(key);
        return entity?.type || (typeof entityRef === 'object' ? entityRef.type : null);
    }

    /**
     * Normalize entity name for comparison
     */
    _normalizeEntityName(name) {
        if (!name) return '';
        return String(name).toLowerCase().trim();
    }

    /**
     * Merge two ontologies
     */
    _mergeOntologies(base, custom) {
        if (!custom) return base;

        return {
            entityTypes: [...new Set([...base.entityTypes, ...(custom.entityTypes || [])])],
            relationTypes: [...new Set([...base.relationTypes, ...(custom.relationTypes || [])])],
            constraints: { ...base.constraints, ...(custom.constraints || {}) },
            requiredAttributes: { ...base.requiredAttributes, ...(custom.requiredAttributes || {}) },
            optionalAttributes: { ...base.optionalAttributes, ...(custom.optionalAttributes || {}) },
            cardinalityConstraints: { ...(base.cardinalityConstraints || {}), ...(custom.cardinalityConstraints || {}) },
            transitiveRelations: [...new Set([
                ...(base.transitiveRelations || TRANSITIVE_RELATIONS),
                ...(custom.transitiveRelations || [])
            ])]
        };
    }

    /**
     * Group violations by category
     */
    _groupByCategory(violations) {
        const grouped = {};

        for (const violation of violations) {
            const category = violation.category || 'other';
            if (!grouped[category]) {
                grouped[category] = [];
            }
            grouped[category].push(violation);
        }

        return grouped;
    }

    /**
     * Convert rate to grade
     */
    _rateToGrade(rate) {
        if (rate >= 0.95) return 'A';
        if (rate >= 0.90) return 'B';
        if (rate >= 0.80) return 'C';
        if (rate >= 0.70) return 'D';
        return 'F';
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            passRate: this.stats.totalChecks > 0
                ? ((this.stats.passed / this.stats.totalChecks) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalChecks: 0,
            passed: 0,
            failed: 0,
            warnings: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an ontology conformance checker
 * @param {Object} options - Configuration options
 * @returns {OntologyConformanceChecker} Checker instance
 */
function createOntologyConformanceChecker(options = {}) {
    return new OntologyConformanceChecker(options);
}

// Singleton with default options
const ontologyConformanceChecker = new OntologyConformanceChecker();

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    OntologyConformanceChecker,
    createOntologyConformanceChecker,
    ontologyConformanceChecker,
    CARDINALITY_CONSTRAINTS,
    TRANSITIVE_RELATIONS,
    DEFAULT_CONFIG
};

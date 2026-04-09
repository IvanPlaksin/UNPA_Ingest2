/**
 * PiVe-pattern Graph Verifier
 *
 * Iterative verification and correction following:
 * - PiVe (2024) — Predict-Verify-Correct iterative refinement
 * - Self-Refine (2023) — LLM self-correction improves output quality
 * - CRITIC (2024) — Tool-augmented self-verification
 *
 * Pipeline: Generate → Verify → Correct → Repeat
 *
 * @module services/graph/metrics/graph-verifier
 */

'use strict';

const { hallucinationDetector } = require('./hallucination-detector');
const { AOPEG_ONTOLOGY, validateTriple } = require('./ontology-schema');

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
    // Iteration settings
    maxIterations: 3,
    qualityThreshold: 0.8,
    improvementThreshold: 0.02,

    // Verification settings
    checkHallucinations: true,
    checkOntology: true,
    checkCompleteness: true,
    checkConsistency: true,

    // Correction settings
    useLLMCorrection: true,
    llmProvider: 'gemini',

    // Stopping criteria
    stopOnNoImprovement: true,
    stopOnThreshold: true,

    // Score weights
    weights: {
        hallucination: 0.30,  // Inverted — lower hallucination rate is better
        ontology: 0.20,
        completeness: 0.25,
        consistency: 0.25
    }
};

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH VERIFIER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class GraphVerifier {
    /**
     * Create a graph verifier
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        this.options = { ...DEFAULT_CONFIG, ...options };
        this.llmService = null;
        this.stats = {
            totalVerifications: 0,
            iterationsPerformed: 0,
            successfulCorrections: 0,
            earlyStops: 0,
            thresholdReached: 0
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN PIPELINE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Verify and iteratively refine extraction result
     * @param {Object} extractionResult - Initial extraction with entities/relations
     * @param {string} sourceText - Original source text
     * @param {Object} context - Additional context
     * @returns {Object} Verification report with refined result
     */
    async verifyAndRefine(extractionResult, sourceText, context = {}) {
        this.stats.totalVerifications++;
        const startTime = Date.now();

        let currentResult = this._cloneResult(extractionResult);
        const iterationHistory = [];
        let previousScore = 0;

        for (let iteration = 0; iteration < this.options.maxIterations; iteration++) {
            this.stats.iterationsPerformed++;

            // 1. VERIFY — compute quality metrics
            const verification = await this._verify(currentResult, sourceText, context);

            iterationHistory.push({
                iteration,
                score: verification.overallScore,
                grade: verification.grade,
                metrics: verification.metrics,
                issues: verification.issues,
                issuesBySeverity: verification.issuesBySeverity,
                timestamp: new Date().toISOString()
            });

            // 2. Check stopping criteria
            const shouldStop = this._checkStoppingCriteria(
                verification.overallScore,
                previousScore,
                iteration
            );

            if (shouldStop.stop) {
                if (shouldStop.reason === 'threshold') {
                    this.stats.thresholdReached++;
                } else {
                    this.stats.earlyStops++;
                }

                return this._buildReport(
                    currentResult,
                    iterationHistory,
                    shouldStop.reason,
                    Date.now() - startTime
                );
            }

            // 3. CORRECT — fix identified issues
            if (verification.issues.length > 0 && this.options.useLLMCorrection) {
                const correctedResult = await this._correct(
                    currentResult,
                    verification.issues,
                    sourceText,
                    context
                );

                if (correctedResult) {
                    this.stats.successfulCorrections++;
                    currentResult = correctedResult;
                }
            }

            previousScore = verification.overallScore;
        }

        // Max iterations reached — do final verification
        const finalVerification = await this._verify(currentResult, sourceText, context);
        iterationHistory.push({
            iteration: this.options.maxIterations,
            score: finalVerification.overallScore,
            grade: finalVerification.grade,
            metrics: finalVerification.metrics,
            issues: finalVerification.issues,
            issuesBySeverity: finalVerification.issuesBySeverity,
            final: true,
            timestamp: new Date().toISOString()
        });

        return this._buildReport(
            currentResult,
            iterationHistory,
            'max_iterations',
            Date.now() - startTime
        );
    }

    /**
     * Single verification pass (no correction)
     * @param {Object} extractionResult - Extraction with entities/relations
     * @param {string} sourceText - Source text
     * @param {Object} context - Additional context
     * @returns {Object} Verification result
     */
    async verify(extractionResult, sourceText, context = {}) {
        return this._verify(extractionResult, sourceText, context);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFICATION LOGIC
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Internal verification logic
     */
    async _verify(extractionResult, sourceText, context) {
        const issues = [];
        const metrics = {};

        // 1. Hallucination check
        if (this.options.checkHallucinations) {
            const hallucinationReport = await hallucinationDetector.verify(
                extractionResult,
                sourceText
            );

            metrics.hallucination = {
                rate: hallucinationReport.summary.hallucinationRate,
                grounded: hallucinationReport.summary.grounded,
                uncertain: hallucinationReport.summary.uncertain,
                hallucinated: hallucinationReport.summary.hallucinated,
                totalClaims: hallucinationReport.summary.totalClaims
            };

            // Add hallucinated claims as issues
            for (const claim of hallucinationReport.hallucinatedClaims || []) {
                issues.push({
                    type: 'hallucination',
                    severity: 'high',
                    description: `Hallucinated claim: ${claim.claim}`,
                    claim: claim.claim,
                    claimType: claim.type,
                    bestMatch: claim.bestMatch,
                    suggestion: 'Remove or find supporting evidence'
                });
            }
        }

        // 2. Ontology conformance check
        if (this.options.checkOntology) {
            const ontologyResult = this._checkOntologyConformance(extractionResult);
            metrics.ontology = {
                conformanceRate: ontologyResult.conformanceRate,
                violations: ontologyResult.violations.length,
                validRelations: ontologyResult.validRelations,
                totalRelations: ontologyResult.totalRelations
            };

            for (const violation of ontologyResult.violations) {
                issues.push({
                    type: 'ontology_violation',
                    severity: 'medium',
                    description: violation.message,
                    triple: violation.triple,
                    suggestion: violation.suggestion
                });
            }
        }

        // 3. Completeness check
        if (this.options.checkCompleteness) {
            const completenessResult = this._checkCompleteness(extractionResult, sourceText);
            metrics.completeness = {
                score: completenessResult.score,
                extractedCount: completenessResult.extractedCount,
                potentialMissingCount: completenessResult.potentialMissing.length
            };

            for (const missing of completenessResult.potentialMissing.slice(0, 5)) {
                issues.push({
                    type: 'missing_entity',
                    severity: 'low',
                    description: `Potentially missed entity: ${missing.text}`,
                    text: missing.text,
                    context: missing.context,
                    suggestion: `Consider extracting: ${missing.text}`
                });
            }
        }

        // 4. Consistency check
        if (this.options.checkConsistency) {
            const consistencyResult = this._checkConsistency(extractionResult);
            metrics.consistency = {
                score: consistencyResult.score,
                duplicates: consistencyResult.duplicates.length,
                conflicts: consistencyResult.conflicts.length
            };

            for (const dup of consistencyResult.duplicates) {
                issues.push({
                    type: 'duplicate',
                    severity: 'medium',
                    description: `Duplicate entity: ${dup.name} (${dup.count} instances)`,
                    entityName: dup.name,
                    instances: dup.instances,
                    suggestion: 'Merge into single entity'
                });
            }

            for (const conflict of consistencyResult.conflicts) {
                issues.push({
                    type: 'conflict',
                    severity: 'high',
                    description: conflict.description,
                    entities: conflict.entities,
                    relations: conflict.relations,
                    suggestion: conflict.resolution
                });
            }
        }

        // Calculate overall score
        const overallScore = this._calculateOverallScore(metrics);

        return {
            overallScore,
            grade: this._scoreToGrade(overallScore),
            metrics,
            issues,
            issuesBySeverity: {
                high: issues.filter(i => i.severity === 'high').length,
                medium: issues.filter(i => i.severity === 'medium').length,
                low: issues.filter(i => i.severity === 'low').length
            }
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ONTOLOGY CONFORMANCE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check ontology conformance
     */
    _checkOntologyConformance(extractionResult) {
        const violations = [];
        let validRelations = 0;
        let totalRelations = 0;

        // Check entity types
        for (const entity of (extractionResult.entities || [])) {
            if (entity.type && !AOPEG_ONTOLOGY.entityTypes.includes(entity.type)) {
                violations.push({
                    type: 'invalid_entity_type',
                    message: `Unknown entity type: ${entity.type} for "${entity.name}"`,
                    entity: entity.name,
                    entityType: entity.type,
                    suggestion: `Valid types: ${AOPEG_ONTOLOGY.entityTypes.slice(0, 10).join(', ')}...`
                });
            }
        }

        // Check relations
        for (const relation of (extractionResult.relations || [])) {
            totalRelations++;

            const subjectType = this._findEntityType(extractionResult, relation.subject);
            const objectType = this._findEntityType(extractionResult, relation.object);
            const predicate = relation.predicate || relation.relation || relation.type;

            const triple = {
                subject: { name: relation.subject, type: subjectType },
                predicate,
                object: { name: relation.object, type: objectType }
            };

            const validation = validateTriple(triple, AOPEG_ONTOLOGY);

            if (validation.valid) {
                validRelations++;
            } else {
                for (const error of validation.errors) {
                    violations.push({
                        type: 'relation_violation',
                        message: error,
                        triple: `${relation.subject} ${predicate} ${relation.object}`,
                        suggestion: this._suggestRelationFix(triple)
                    });
                }
            }
        }

        return {
            conformanceRate: totalRelations > 0 ? validRelations / totalRelations : 1,
            violations,
            validRelations,
            totalRelations
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // COMPLETENESS CHECK
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check completeness (potential missed entities)
     */
    _checkCompleteness(extractionResult, sourceText) {
        const potentialMissing = [];
        const extractedNames = new Set(
            (extractionResult.entities || []).map(e => (e.name || '').toLowerCase())
        );

        // Simple NER patterns for potentially missed entities
        const patterns = [
            // Capitalized multi-word phrases (organizations/systems)
            /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g,
            // Acronyms (2-6 letters)
            /\b([A-Z]{2,6})\b/g,
            // Titles with names
            /\b(Mr\.|Ms\.|Dr\.|Prof\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g
        ];

        const seen = new Set();

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(sourceText)) !== null) {
                const text = match[0].trim();
                const lowerText = text.toLowerCase();

                // Skip if already extracted or already seen
                if (text.length > 2 &&
                    !extractedNames.has(lowerText) &&
                    !seen.has(lowerText)) {

                    seen.add(lowerText);
                    potentialMissing.push({
                        text,
                        context: this._getContext(sourceText, match.index, 40),
                        position: match.index
                    });
                }
            }
        }

        // Score: ratio of extracted to total potential
        const totalPotential = potentialMissing.length + extractedNames.size;
        const score = totalPotential > 0
            ? Math.min(extractedNames.size / totalPotential, 1)
            : 1;

        return {
            score,
            extractedCount: extractedNames.size,
            potentialMissing: potentialMissing.slice(0, 10) // Top 10
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONSISTENCY CHECK
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check consistency (duplicates, conflicts)
     */
    _checkConsistency(extractionResult) {
        const duplicates = [];
        const conflicts = [];

        // Find duplicate entities (same name, different instances)
        const entityNames = new Map();
        for (const entity of (extractionResult.entities || [])) {
            const key = (entity.name || '').toLowerCase();
            if (entityNames.has(key)) {
                entityNames.get(key).push(entity);
            } else {
                entityNames.set(key, [entity]);
            }
        }

        for (const [name, instances] of entityNames) {
            if (instances.length > 1) {
                duplicates.push({
                    name: instances[0].name,
                    count: instances.length,
                    instances: instances.map(i => ({ name: i.name, type: i.type, id: i.id }))
                });
            }
        }

        // Find conflicting relations (same subject-object, contradictory predicates)
        const relationPairs = new Map();
        for (const relation of (extractionResult.relations || [])) {
            const key = `${(relation.subject || '').toLowerCase()}|${(relation.object || '').toLowerCase()}`;
            if (relationPairs.has(key)) {
                relationPairs.get(key).push(relation);
            } else {
                relationPairs.set(key, [relation]);
            }
        }

        for (const [pair, relations] of relationPairs) {
            if (relations.length > 1) {
                const predicates = relations.map(r => r.predicate || r.relation);
                const uniquePredicates = [...new Set(predicates)];

                if (uniquePredicates.length > 1) {
                    const [subject, object] = pair.split('|');
                    conflicts.push({
                        description: `Conflicting relations between "${subject}" and "${object}": ${uniquePredicates.join(' vs ')}`,
                        entities: [subject, object],
                        predicates: uniquePredicates,
                        relations: relations.map(r => ({
                            subject: r.subject,
                            predicate: r.predicate || r.relation,
                            object: r.object
                        })),
                        resolution: 'Review and keep the most accurate relation'
                    });
                }
            }
        }

        // Score based on issues found
        const totalItems = (extractionResult.entities?.length || 0) +
                          (extractionResult.relations?.length || 0);
        const issueCount = duplicates.length + conflicts.length;
        const score = totalItems > 0
            ? Math.max(1 - (issueCount / totalItems), 0)
            : 1;

        return {
            score,
            duplicates,
            conflicts
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CORRECTION LOGIC
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Correct issues (rule-based without LLM for now)
     */
    async _correct(extractionResult, issues, sourceText, context) {
        // Prioritize high-severity issues
        const highPriorityIssues = issues.filter(
            i => i.severity === 'high' || i.severity === 'medium'
        );

        if (highPriorityIssues.length === 0) {
            return null;
        }

        const result = this._cloneResult(extractionResult);
        let correctionsMade = false;

        for (const issue of highPriorityIssues) {
            try {
                switch (issue.type) {
                    case 'hallucination':
                        // Remove hallucinated entities/relations
                        if (this._removeHallucinatedClaim(result, issue)) {
                            correctionsMade = true;
                        }
                        break;

                    case 'duplicate':
                        // Merge duplicate entities
                        if (this._mergeDuplicates(result, issue)) {
                            correctionsMade = true;
                        }
                        break;

                    case 'conflict':
                        // Keep the first relation, remove duplicates
                        if (this._resolveConflict(result, issue)) {
                            correctionsMade = true;
                        }
                        break;

                    case 'ontology_violation':
                        // Try to fix entity types or remove invalid relations
                        if (this._fixOntologyViolation(result, issue)) {
                            correctionsMade = true;
                        }
                        break;
                }
            } catch (error) {
                // Continue with other corrections
            }
        }

        return correctionsMade ? result : null;
    }

    /**
     * Remove hallucinated claim
     */
    _removeHallucinatedClaim(result, issue) {
        const claimText = issue.claim || '';

        // Try to identify and remove the entity or relation
        if (issue.claimType === 'entity') {
            const initialCount = result.entities?.length || 0;
            result.entities = (result.entities || []).filter(e => {
                const entityText = `There is a ${e.type || 'entity'} named "${e.name}"`;
                return !claimText.includes(e.name);
            });
            return (result.entities?.length || 0) < initialCount;
        } else if (issue.claimType === 'relation') {
            const initialCount = result.relations?.length || 0;
            result.relations = (result.relations || []).filter(r => {
                return !claimText.includes(r.subject) || !claimText.includes(r.object);
            });
            return (result.relations?.length || 0) < initialCount;
        }

        return false;
    }

    /**
     * Merge duplicate entities
     */
    _mergeDuplicates(result, issue) {
        if (!issue.instances || issue.instances.length < 2) {
            return false;
        }

        const primaryEntity = issue.instances[0];
        const duplicateNames = issue.instances.slice(1).map(i => i.name);

        // Remove duplicates from entities
        result.entities = (result.entities || []).filter(e => {
            return e.name === primaryEntity.name || !duplicateNames.includes(e.name);
        });

        // Update relations to use primary entity name
        for (const relation of (result.relations || [])) {
            if (duplicateNames.includes(relation.subject)) {
                relation.subject = primaryEntity.name;
            }
            if (duplicateNames.includes(relation.object)) {
                relation.object = primaryEntity.name;
            }
        }

        return true;
    }

    /**
     * Resolve conflicting relations
     */
    _resolveConflict(result, issue) {
        if (!issue.relations || issue.relations.length < 2) {
            return false;
        }

        // Keep only the first relation
        const keepRelation = issue.relations[0];
        const removePredicates = issue.relations.slice(1).map(r => r.predicate);

        const initialCount = result.relations?.length || 0;
        result.relations = (result.relations || []).filter(r => {
            const matches = r.subject?.toLowerCase() === issue.entities[0] &&
                           r.object?.toLowerCase() === issue.entities[1];
            if (matches && removePredicates.includes(r.predicate || r.relation)) {
                return false;
            }
            return true;
        });

        return (result.relations?.length || 0) < initialCount;
    }

    /**
     * Fix ontology violation
     */
    _fixOntologyViolation(result, issue) {
        // For invalid entity types, we could map to closest valid type
        // For now, just mark as corrected (would need more sophisticated logic)
        return false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SCORING
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Calculate overall quality score
     */
    _calculateOverallScore(metrics) {
        const weights = this.options.weights;
        let totalWeight = 0;
        let weightedSum = 0;

        // Hallucination score (inverted — lower rate is better)
        if (metrics.hallucination?.rate !== undefined) {
            weightedSum += (1 - metrics.hallucination.rate) * weights.hallucination;
            totalWeight += weights.hallucination;
        }

        // Ontology conformance
        if (metrics.ontology?.conformanceRate !== undefined) {
            weightedSum += metrics.ontology.conformanceRate * weights.ontology;
            totalWeight += weights.ontology;
        }

        // Completeness
        if (metrics.completeness?.score !== undefined) {
            weightedSum += metrics.completeness.score * weights.completeness;
            totalWeight += weights.completeness;
        }

        // Consistency
        if (metrics.consistency?.score !== undefined) {
            weightedSum += metrics.consistency.score * weights.consistency;
            totalWeight += weights.consistency;
        }

        return totalWeight > 0 ? weightedSum / totalWeight : 0;
    }

    /**
     * Convert score to letter grade
     */
    _scoreToGrade(score) {
        if (score >= 0.9) return 'A';
        if (score >= 0.8) return 'B';
        if (score >= 0.7) return 'C';
        if (score >= 0.6) return 'D';
        return 'F';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STOPPING CRITERIA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Check stopping criteria
     */
    _checkStoppingCriteria(currentScore, previousScore, iteration) {
        // Quality threshold reached
        if (this.options.stopOnThreshold && currentScore >= this.options.qualityThreshold) {
            return { stop: true, reason: 'threshold' };
        }

        // No improvement from previous iteration
        if (this.options.stopOnNoImprovement && iteration > 0) {
            const improvement = currentScore - previousScore;
            if (improvement < this.options.improvementThreshold) {
                return { stop: true, reason: 'no_improvement' };
            }
        }

        return { stop: false };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // REPORT BUILDING
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Build final verification report
     */
    _buildReport(result, history, stopReason, duration) {
        const lastIteration = history[history.length - 1];
        const firstIteration = history[0];
        const improvement = lastIteration.score - firstIteration.score;

        return {
            finalResult: result,
            finalScore: lastIteration.score,
            finalGrade: lastIteration.grade,

            iterations: {
                count: history.length,
                history,
                stopReason,
                improvement,
                improvementPercent: firstIteration.score > 0
                    ? ((improvement / firstIteration.score) * 100).toFixed(1) + '%'
                    : 'N/A'
            },

            issues: {
                initial: firstIteration.issues?.length || 0,
                final: lastIteration.issues?.length || 0,
                resolved: (firstIteration.issues?.length || 0) - (lastIteration.issues?.length || 0)
            },

            metrics: lastIteration.metrics,
            issuesBySeverity: lastIteration.issuesBySeverity,

            duration,
            timestamp: new Date().toISOString()
        };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Deep clone extraction result
     */
    _cloneResult(result) {
        return JSON.parse(JSON.stringify(result));
    }

    /**
     * Find entity type by name
     */
    _findEntityType(extractionResult, entityName) {
        const entity = (extractionResult.entities || []).find(
            e => e.name === entityName || e.id === entityName
        );
        return entity?.type || null;
    }

    /**
     * Suggest relation fix
     */
    _suggestRelationFix(triple) {
        const subjectType = triple.subject?.type;
        const objectType = triple.object?.type;

        if (subjectType && objectType) {
            const validRelations = [];
            for (const [rel, constraint] of Object.entries(AOPEG_ONTOLOGY.constraints || {})) {
                const domainOk = constraint.domain?.includes('*') ||
                                constraint.domain?.includes(subjectType);
                const rangeOk = constraint.range?.includes('*') ||
                               constraint.range?.includes(objectType);
                if (domainOk && rangeOk) {
                    validRelations.push(rel);
                }
            }
            if (validRelations.length > 0) {
                return `Valid relations: ${validRelations.slice(0, 3).join(', ')}`;
            }
        }

        return 'Check entity types and relation constraints';
    }

    /**
     * Get context around position
     */
    _getContext(text, index, windowSize) {
        const start = Math.max(0, index - windowSize);
        const end = Math.min(text.length, index + windowSize);
        return text.slice(start, end);
    }

    /**
     * Set LLM service for advanced corrections
     */
    setLLMService(service) {
        this.llmService = service;
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            ...this.stats,
            avgIterations: this.stats.totalVerifications > 0
                ? (this.stats.iterationsPerformed / this.stats.totalVerifications).toFixed(2)
                : '0',
            correctionSuccessRate: this.stats.iterationsPerformed > 0
                ? ((this.stats.successfulCorrections / this.stats.iterationsPerformed) * 100).toFixed(1) + '%'
                : '0%'
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalVerifications: 0,
            iterationsPerformed: 0,
            successfulCorrections: 0,
            earlyStops: 0,
            thresholdReached: 0
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a graph verifier with options
 * @param {Object} options - Configuration options
 * @returns {GraphVerifier} Verifier instance
 */
function createGraphVerifier(options = {}) {
    return new GraphVerifier(options);
}

// Singleton instance
const graphVerifier = new GraphVerifier();

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    GraphVerifier,
    createGraphVerifier,
    graphVerifier,
    DEFAULT_CONFIG
};

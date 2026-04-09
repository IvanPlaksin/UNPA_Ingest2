/**
 * Iterative Refinement Pipeline
 *
 * Wraps extraction with automatic quality improvement through
 * iterative verification and correction cycles.
 *
 * @module services/graph/metrics/iterative-refinement
 */

'use strict';

const { graphVerifier, createGraphVerifier } = require('./graph-verifier');

// ═══════════════════════════════════════════════════════════════════════════
// ITERATIVE REFINEMENT PIPELINE CLASS
// ═══════════════════════════════════════════════════════════════════════════

class IterativeRefinementPipeline {
    /**
     * Create an iterative refinement pipeline
     * @param {Object} extractor - Extraction service with extract() method
     * @param {Object} options - Pipeline options
     */
    constructor(extractor, options = {}) {
        this.extractor = extractor;
        this.verifier = options.verifier || createGraphVerifier(options.verifierOptions);
        this.options = {
            autoRefine: options.autoRefine !== false,
            targetGrade: options.targetGrade || 'B',
            maxAttempts: options.maxAttempts || 3,
            logProgress: options.logProgress || false,
            ...options
        };
        this.stats = {
            totalExtractions: 0,
            refinedExtractions: 0,
            gradesAchieved: { A: 0, B: 0, C: 0, D: 0, F: 0 },
            avgImprovement: 0,
            totalIterations: 0
        };
    }

    /**
     * Extract with automatic refinement
     * @param {string} sourceText - Text to extract from
     * @param {Object} context - Additional context
     * @returns {Object} Extraction result with refinement metadata
     */
    async extractWithRefinement(sourceText, context = {}) {
        this.stats.totalExtractions++;

        // Initial extraction
        let initialResult;
        if (this.extractor) {
            initialResult = await this.extractor.extract(sourceText, context);
        } else {
            // If no extractor provided, expect result in context
            initialResult = context.extractionResult || { entities: [], relations: [] };
        }

        if (!this.options.autoRefine) {
            return {
                result: initialResult,
                refined: false,
                reason: 'auto_refine_disabled'
            };
        }

        // Verify and refine
        const refinementReport = await this.verifier.verifyAndRefine(
            initialResult,
            sourceText,
            context
        );

        // Update statistics
        this.stats.refinedExtractions++;
        this.stats.gradesAchieved[refinementReport.finalGrade]++;
        this.stats.totalIterations += refinementReport.iterations.count;

        const improvement = refinementReport.iterations.improvement;
        this.stats.avgImprovement =
            (this.stats.avgImprovement * (this.stats.refinedExtractions - 1) + improvement) /
            this.stats.refinedExtractions;

        // Log progress if enabled
        if (this.options.logProgress) {
            console.log(`[Refinement] Score: ${(refinementReport.finalScore * 100).toFixed(1)}% ` +
                       `(${refinementReport.finalGrade}) after ${refinementReport.iterations.count} iterations`);
        }

        return {
            result: refinementReport.finalResult,
            refined: true,
            initialScore: refinementReport.iterations.history[0]?.score || 0,
            finalScore: refinementReport.finalScore,
            grade: refinementReport.finalGrade,
            iterations: refinementReport.iterations.count,
            improvement,
            improvementPercent: refinementReport.iterations.improvementPercent,
            stopReason: refinementReport.iterations.stopReason,
            issuesResolved: refinementReport.issues.resolved,
            report: refinementReport
        };
    }

    /**
     * Refine existing extraction result
     * @param {Object} extractionResult - Existing extraction
     * @param {string} sourceText - Original source text
     * @param {Object} context - Additional context
     * @returns {Object} Refined result
     */
    async refineExisting(extractionResult, sourceText, context = {}) {
        return this.extractWithRefinement(sourceText, {
            ...context,
            extractionResult
        });
    }

    /**
     * Batch extract with refinement
     * @param {Array} texts - Array of texts to extract from
     * @param {Object} context - Shared context
     * @returns {Array} Array of extraction results
     */
    async batchExtractWithRefinement(texts, context = {}) {
        const results = [];

        for (let i = 0; i < texts.length; i++) {
            const text = texts[i];
            try {
                const result = await this.extractWithRefinement(text, {
                    ...context,
                    batchIndex: i,
                    batchTotal: texts.length
                });
                results.push({ success: true, ...result });
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    text: text.substring(0, 100) + '...'
                });
            }
        }

        return results;
    }

    /**
     * Get pipeline statistics
     * @returns {Object} Statistics
     */
    getStats() {
        const totalGrades = Object.values(this.stats.gradesAchieved).reduce((a, b) => a + b, 0);
        return {
            ...this.stats,
            avgIterations: this.stats.refinedExtractions > 0
                ? (this.stats.totalIterations / this.stats.refinedExtractions).toFixed(2)
                : '0',
            avgImprovement: (this.stats.avgImprovement * 100).toFixed(1) + '%',
            gradeDistribution: {
                A: totalGrades > 0 ? ((this.stats.gradesAchieved.A / totalGrades) * 100).toFixed(1) + '%' : '0%',
                B: totalGrades > 0 ? ((this.stats.gradesAchieved.B / totalGrades) * 100).toFixed(1) + '%' : '0%',
                C: totalGrades > 0 ? ((this.stats.gradesAchieved.C / totalGrades) * 100).toFixed(1) + '%' : '0%',
                D: totalGrades > 0 ? ((this.stats.gradesAchieved.D / totalGrades) * 100).toFixed(1) + '%' : '0%',
                F: totalGrades > 0 ? ((this.stats.gradesAchieved.F / totalGrades) * 100).toFixed(1) + '%' : '0%'
            },
            verifierStats: this.verifier.getStats()
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalExtractions: 0,
            refinedExtractions: 0,
            gradesAchieved: { A: 0, B: 0, C: 0, D: 0, F: 0 },
            avgImprovement: 0,
            totalIterations: 0
        };
        this.verifier.resetStats();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create an iterative refinement pipeline
 * @param {Object} extractor - Extraction service
 * @param {Object} options - Pipeline options
 * @returns {IterativeRefinementPipeline} Pipeline instance
 */
function createIterativeRefinementPipeline(extractor, options = {}) {
    return new IterativeRefinementPipeline(extractor, options);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
    IterativeRefinementPipeline,
    createIterativeRefinementPipeline
};

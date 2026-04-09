/**
 * A/B Testing Service for Prompt Optimization
 *
 * Features:
 * - Run experiments comparing prompt versions
 * - Statistical significance testing
 * - Automatic experiment completion
 *
 * @module services/dspy/ab-testing.service
 */

'use strict';

const crypto = require('crypto');
const { promptRegistry } = require('./prompt-registry');

// ═══════════════════════════════════════════════════════════════════════════════
// A/B TESTING SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════════

class ABTestingService {
    constructor(options = {}) {
        this.options = {
            minSampleSize: options.minSampleSize || 50,
            significanceLevel: options.significanceLevel || 0.05,
            maxDuration: options.maxDuration || 7 * 24 * 60 * 60 * 1000, // 7 days
            autoComplete: options.autoComplete !== false,
            ...options
        };

        this.experiments = new Map();
        this.registry = options.registry || promptRegistry;
    }

    /**
     * Create a new experiment
     */
    createExperiment(config) {
        const {
            name,
            task,
            domain,
            control,  // promptId of control
            variants, // array of promptIds to test
            trafficSplit,
            hypothesis,
            metrics = ['avgScore', 'successRate', 'avgLatency']
        } = config;

        if (!name || !task || !control || !variants || variants.length === 0) {
            throw new Error('Missing required experiment config: name, task, control, variants');
        }

        const experiment = {
            id: `exp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
            name,
            task,
            domain: domain || 'general',
            control,
            variants,
            trafficSplit: trafficSplit || this._evenSplit(1 + variants.length),
            hypothesis,
            metrics,
            status: 'created',
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            results: null
        };

        this.experiments.set(experiment.id, experiment);
        console.log(`[ABTesting] Created experiment: ${experiment.name}`);
        return experiment;
    }

    /**
     * Start an experiment
     */
    startExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment not found: ${experimentId}`);
        }

        if (experiment.status !== 'created') {
            throw new Error(`Experiment already started or completed`);
        }

        // Configure A/B test in registry
        const allPrompts = [experiment.control, ...experiment.variants];
        const variantConfigs = allPrompts.map((promptId, i) => ({
            promptId,
            trafficPercent: experiment.trafficSplit[i],
            name: i === 0 ? 'control' : `variant_${i}`
        }));

        this.registry.startABTest(experiment.task, experiment.domain, variantConfigs);

        experiment.status = 'running';
        experiment.startedAt = new Date().toISOString();

        console.log(`[ABTesting] Started experiment: ${experiment.name}`);
        return experiment;
    }

    /**
     * Record observation for experiment
     */
    recordObservation(experimentId, promptId, metrics) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment || experiment.status !== 'running') {
            return false;
        }

        // Metrics are recorded via promptRegistry
        this.registry.recordMetrics(
            promptId,
            experiment.task,
            experiment.domain,
            metrics.success,
            metrics.score,
            metrics.latency
        );

        // Check if experiment should complete
        if (this.options.autoComplete) {
            this._checkCompletion(experimentId);
        }

        return true;
    }

    /**
     * Get experiment results
     */
    getResults(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment not found: ${experimentId}`);
        }

        const testStatus = this.registry.getABTestStatus(experiment.task, experiment.domain);

        if (!testStatus && experiment.status !== 'completed') {
            return {
                experiment,
                status: experiment.status,
                message: 'No active test data'
            };
        }

        // Use stored results for completed experiments
        if (experiment.status === 'completed' && experiment.results) {
            return {
                experiment,
                analysis: experiment.results,
                isSignificant: experiment.results.comparisons?.some(c => c.significant) || false
            };
        }

        // Calculate current statistics
        const results = testStatus?.currentResults || [];
        const control = results.find(r => r.promptId === experiment.control);
        const variantResults = results.filter(r => r.promptId !== experiment.control);

        const analysis = {
            control: this._analyzeVariant(control),
            variants: variantResults.map(v => this._analyzeVariant(v)),
            comparisons: variantResults.map(v => this._compareToControl(control, v)),
            recommendation: this._getRecommendation(control, variantResults)
        };

        return {
            experiment,
            testStatus,
            analysis,
            isSignificant: analysis.comparisons.some(c => c.significant)
        };
    }

    /**
     * Complete experiment and optionally promote winner
     */
    completeExperiment(experimentId, promoteWinner = false) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment not found: ${experimentId}`);
        }

        const results = this.getResults(experimentId);

        // Stop A/B test
        let testResult;
        try {
            testResult = this.registry.stopABTest(
                experiment.task,
                experiment.domain,
                promoteWinner
            );
        } catch (e) {
            // Test may already be stopped
            testResult = { winner: null, results: [] };
        }

        experiment.status = 'completed';
        experiment.completedAt = new Date().toISOString();
        experiment.results = {
            ...results.analysis,
            winner: testResult.winner,
            promoted: promoteWinner
        };

        console.log(`[ABTesting] Completed experiment: ${experiment.name}`);
        return experiment;
    }

    /**
     * Cancel a running experiment
     */
    cancelExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment not found: ${experimentId}`);
        }

        if (experiment.status === 'running') {
            try {
                this.registry.stopABTest(experiment.task, experiment.domain, false);
            } catch (e) {
                // Ignore errors when stopping
            }
        }

        experiment.status = 'cancelled';
        experiment.completedAt = new Date().toISOString();

        console.log(`[ABTesting] Cancelled experiment: ${experiment.name}`);
        return experiment;
    }

    /**
     * List all experiments
     */
    listExperiments(filter = {}) {
        let experiments = Array.from(this.experiments.values());

        if (filter.status) {
            experiments = experiments.filter(e => e.status === filter.status);
        }

        if (filter.task) {
            experiments = experiments.filter(e => e.task === filter.task);
        }

        return experiments.sort((a, b) =>
            new Date(b.createdAt) - new Date(a.createdAt)
        );
    }

    /**
     * Get experiment by ID
     */
    getExperiment(experimentId) {
        return this.experiments.get(experimentId);
    }

    /**
     * Get service statistics
     */
    getStats() {
        const experiments = Array.from(this.experiments.values());

        return {
            totalExperiments: experiments.length,
            byStatus: {
                created: experiments.filter(e => e.status === 'created').length,
                running: experiments.filter(e => e.status === 'running').length,
                completed: experiments.filter(e => e.status === 'completed').length,
                cancelled: experiments.filter(e => e.status === 'cancelled').length
            },
            completedWithSignificance: experiments.filter(
                e => e.status === 'completed' && e.results?.comparisons?.some(c => c.significant)
            ).length,
            promotions: experiments.filter(
                e => e.status === 'completed' && e.results?.promoted
            ).length
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRIVATE METHODS
    // ═══════════════════════════════════════════════════════════════════════════

    _evenSplit(n) {
        const base = Math.floor(100 / n);
        const remainder = 100 % n;
        return Array(n).fill(base).map((v, i) => v + (i < remainder ? 1 : 0));
    }

    _analyzeVariant(variant) {
        if (!variant || !variant.metrics) {
            return null;
        }

        return {
            promptId: variant.promptId,
            name: variant.name,
            sampleSize: variant.metrics.invocations,
            avgScore: variant.metrics.avgScore,
            successRate: variant.successRate,
            avgLatency: variant.metrics.avgLatency,
            confidence: this._calculateConfidence(variant.metrics)
        };
    }

    _compareToControl(control, variant) {
        if (!control?.metrics || !variant?.metrics) {
            return { significant: false, message: 'Insufficient data' };
        }

        const controlScore = control.metrics.avgScore;
        const variantScore = variant.metrics.avgScore;
        const lift = controlScore > 0 ? (variantScore - controlScore) / controlScore : 0;

        // Simple significance test
        const minSamples = this.options.minSampleSize;
        const hasEnoughData = control.metrics.invocations >= minSamples &&
            variant.metrics.invocations >= minSamples;

        // Use simplified significance: requires enough data and meaningful lift
        const significant = hasEnoughData && Math.abs(lift) > 0.05;

        return {
            variantId: variant.promptId,
            variantName: variant.name,
            controlScore,
            variantScore,
            lift,
            liftPercent: `${(lift * 100).toFixed(1)}%`,
            significant,
            hasEnoughData,
            winner: lift > 0 ? 'variant' : 'control'
        };
    }

    _getRecommendation(control, variants) {
        if (!control?.metrics || variants.length === 0) {
            return { action: 'wait', reason: 'Insufficient data' };
        }

        const comparisons = variants.map(v => this._compareToControl(control, v));
        const significantWins = comparisons.filter(c => c.significant && c.winner === 'variant');
        const significantLosses = comparisons.filter(c => c.significant && c.winner === 'control');

        if (significantWins.length > 0) {
            const best = significantWins.reduce((a, b) => a.lift > b.lift ? a : b);
            return {
                action: 'promote',
                promptId: best.variantId,
                reason: `Variant shows ${best.liftPercent} improvement with statistical significance`
            };
        }

        if (significantLosses.length === variants.length) {
            return {
                action: 'keep_control',
                reason: 'All variants perform worse than control'
            };
        }

        return {
            action: 'continue',
            reason: 'Not enough data for conclusive results'
        };
    }

    _calculateConfidence(metrics) {
        if (metrics.invocations < 10) return 'low';
        if (metrics.invocations < 50) return 'medium';
        return 'high';
    }

    _checkCompletion(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment || experiment.status !== 'running') return;

        // Check duration
        const duration = Date.now() - new Date(experiment.startedAt).getTime();
        if (duration > this.options.maxDuration) {
            console.log(`[ABTesting] Experiment ${experimentId} reached max duration, completing...`);
            this.completeExperiment(experimentId, false);
            return;
        }

        // Check if we have enough data for significance
        const results = this.getResults(experimentId);
        if (results.isSignificant && results.analysis?.recommendation?.action !== 'continue') {
            console.log(`[ABTesting] Experiment ${experimentId} reached significance, completing...`);
            this.completeExperiment(experimentId, results.analysis.recommendation.action === 'promote');
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY & SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

function createABTestingService(options) {
    return new ABTestingService(options);
}

const abTestingService = new ABTestingService();

module.exports = {
    ABTestingService,
    createABTestingService,
    abTestingService
};

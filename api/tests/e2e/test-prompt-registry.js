/**
 * E2E Tests for Prompt Registry and A/B Testing Service
 */

'use strict';

const {
    PromptRegistry,
    PromptVersion,
    createPromptRegistry
} = require('../../src/services/dspy/prompt-registry');

const {
    ABTestingService,
    createABTestingService
} = require('../../src/services/dspy/ab-testing.service');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        testResults.passed++;
        testResults.tests.push({ name, status: 'passed' });
    } catch (err) {
        console.log(`  ✗ ${name}: ${err.message}`);
        testResults.failed++;
        testResults.tests.push({ name, status: 'failed', error: err.message });
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT VERSION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testPromptVersion() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing PromptVersion');
    console.log('═══════════════════════════════════════════════════════════════');

    test('PromptVersion instantiation', () => {
        const prompt = new PromptVersion({
            name: 'test_prompt',
            version: '1.0.0',
            content: 'Extract entities...',
            task: 'extraction',
            domain: 'general'
        });

        assert(prompt.name === 'test_prompt', 'Name set');
        assert(prompt.version === '1.0.0', 'Version set');
        assert(prompt.task === 'extraction', 'Task set');
        assert(prompt.id.startsWith('prompt_'), 'ID generated');
    });

    test('PromptVersion metric recording', () => {
        const prompt = new PromptVersion({
            name: 'test_prompt',
            version: '1.0.0',
            content: 'Test'
        });

        // Record some invocations
        prompt.recordInvocation(true, 0.9, 100);
        prompt.recordInvocation(true, 0.8, 150);
        prompt.recordInvocation(false, 0.5, 200);

        assert(prompt.metrics.invocations === 3, 'Invocation count');
        assert(prompt.metrics.successes === 2, 'Success count');
        assert(prompt.metrics.failures === 1, 'Failure count');
        assert(prompt.metrics.avgScore > 0.7, 'Average score calculated');
        assert(prompt.metrics.avgLatency > 0, 'Average latency calculated');
    });

    test('PromptVersion success rate', () => {
        const prompt = new PromptVersion({ name: 'test', content: 'Test' });

        prompt.recordInvocation(true, 0.9, 100);
        prompt.recordInvocation(true, 0.8, 100);
        prompt.recordInvocation(false, 0.3, 100);
        prompt.recordInvocation(false, 0.4, 100);

        const rate = prompt.getSuccessRate();
        assert(rate === 0.5, `Success rate should be 0.5, got ${rate}`);
    });

    test('PromptVersion toJSON', () => {
        const prompt = new PromptVersion({
            name: 'test_prompt',
            version: '1.0.0',
            content: 'Test',
            task: 'extraction'
        });

        const json = prompt.toJSON();
        assert(json.name === 'test_prompt', 'Name in JSON');
        assert(json.version === '1.0.0', 'Version in JSON');
        assert(json.metrics !== undefined, 'Metrics in JSON');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT REGISTRY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testPromptRegistry() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing PromptRegistry');
    console.log('═══════════════════════════════════════════════════════════════');

    test('PromptRegistry instantiation', () => {
        const registry = createPromptRegistry({ enableABTesting: true });
        assert(registry.options.enableABTesting === true, 'A/B testing enabled');
    });

    test('Default prompts loaded', () => {
        const registry = createPromptRegistry();
        const versions = registry.getVersions('extraction', 'general');

        assert(versions.length > 0, 'Has default extraction prompts');

        const relVersions = registry.getVersions('relation', 'general');
        assert(relVersions.length > 0, 'Has default relation prompts');
    });

    test('Register new prompt', () => {
        const registry = createPromptRegistry();

        const prompt = registry.register({
            name: 'custom_extraction',
            version: '1.0.0',
            content: 'Custom extraction prompt',
            task: 'extraction',
            domain: 'custom'
        });

        assert(prompt.id, 'Prompt ID assigned');
        assert(prompt.status === 'active', 'First prompt is active');

        const versions = registry.getVersions('extraction', 'custom');
        assert(versions.length === 1, 'One version registered');
    });

    test('Get active prompt', () => {
        const registry = createPromptRegistry();

        const prompt = registry.getPrompt('extraction', 'general');
        assert(prompt !== null, 'Got prompt');
        assert(prompt.task === 'extraction', 'Correct task');
    });

    test('Record metrics', () => {
        const registry = createPromptRegistry();

        const prompt = registry.register({
            name: 'metrics_test',
            version: '1.0.0',
            content: 'Test',
            task: 'extraction',
            domain: 'metrics_test'
        });

        registry.recordMetrics(prompt.id, 'extraction', 'metrics_test', true, 0.9, 100);
        registry.recordMetrics(prompt.id, 'extraction', 'metrics_test', true, 0.8, 150);

        const updatedPrompt = registry.getPromptById(prompt.id, 'extraction', 'metrics_test');
        assert(updatedPrompt.metrics.invocations === 2, 'Invocations recorded');
        assert(updatedPrompt.metrics.avgScore > 0.8, 'Score recorded');
    });

    test('Promote prompt', () => {
        const registry = createPromptRegistry();

        // Register two prompts
        const prompt1 = registry.register({
            name: 'prompt_v1',
            version: '1.0.0',
            content: 'V1',
            task: 'extraction',
            domain: 'promote_test'
        });

        const prompt2 = registry.register({
            name: 'prompt_v2',
            version: '2.0.0',
            content: 'V2',
            task: 'extraction',
            domain: 'promote_test'
        });

        // First prompt should be active
        assert(prompt1.status === 'active', 'First prompt active');
        assert(prompt2.status === 'draft', 'Second prompt draft');

        // Promote second prompt
        registry.promote(prompt2.id, 'extraction', 'promote_test');

        const updated1 = registry.getPromptById(prompt1.id, 'extraction', 'promote_test');
        const updated2 = registry.getPromptById(prompt2.id, 'extraction', 'promote_test');

        assert(updated1.status === 'deprecated', 'First prompt deprecated');
        assert(updated2.status === 'active', 'Second prompt active');
    });

    test('Export and import', () => {
        const registry1 = createPromptRegistry();

        registry1.register({
            name: 'export_test',
            version: '1.0.0',
            content: 'Test prompt',
            task: 'extraction',
            domain: 'export_test'
        });

        const exported = registry1.export();
        assert(exported.prompts.length > 0, 'Has prompts to export');
        assert(exported.activePrompts, 'Has active prompts map');

        const registry2 = createPromptRegistry();
        registry2.import(exported);

        const imported = registry2.getVersions('extraction', 'export_test');
        assert(imported.length > 0, 'Prompts imported');
    });

    test('Registry stats', () => {
        const registry = createPromptRegistry();
        const stats = registry.getStats();

        assert(stats.totalPrompts > 0, 'Has total prompts');
        assert(stats.byTask, 'Has by task stats');
        assert(stats.byStatus, 'Has by status stats');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A/B TESTING TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testABTesting() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing ABTestingService');
    console.log('═══════════════════════════════════════════════════════════════');

    test('ABTestingService instantiation', () => {
        const service = createABTestingService({ minSampleSize: 30 });
        assert(service.options.minSampleSize === 30, 'Custom min sample size');
    });

    test('Create experiment', () => {
        const registry = createPromptRegistry();
        const service = createABTestingService({ registry });

        // Register test prompts
        const control = registry.register({
            name: 'control_prompt',
            version: '1.0.0',
            content: 'Control',
            task: 'extraction',
            domain: 'ab_test_domain'
        });

        const variant = registry.register({
            name: 'variant_prompt',
            version: '2.0.0',
            content: 'Variant',
            task: 'extraction',
            domain: 'ab_test_domain'
        });

        const experiment = service.createExperiment({
            name: 'Test Experiment',
            task: 'extraction',
            domain: 'ab_test_domain',
            control: control.id,
            variants: [variant.id],
            hypothesis: 'Variant performs better'
        });

        assert(experiment.id, 'Experiment ID generated');
        assert(experiment.status === 'created', 'Status is created');
        assert(experiment.trafficSplit.length === 2, 'Traffic split for 2 variants');
    });

    test('Start experiment', () => {
        const registry = createPromptRegistry();
        const service = createABTestingService({ registry });

        const control = registry.register({
            name: 'start_control',
            version: '1.0.0',
            content: 'Control',
            task: 'extraction',
            domain: 'start_test'
        });

        const variant = registry.register({
            name: 'start_variant',
            version: '2.0.0',
            content: 'Variant',
            task: 'extraction',
            domain: 'start_test'
        });

        const experiment = service.createExperiment({
            name: 'Start Test',
            task: 'extraction',
            domain: 'start_test',
            control: control.id,
            variants: [variant.id]
        });

        service.startExperiment(experiment.id);

        const started = service.getExperiment(experiment.id);
        assert(started.status === 'running', 'Experiment is running');
        assert(started.startedAt, 'Start time recorded');
    });

    test('Record observations', () => {
        const registry = createPromptRegistry();
        const service = createABTestingService({ registry, autoComplete: false });

        const control = registry.register({
            name: 'obs_control',
            version: '1.0.0',
            content: 'Control',
            task: 'extraction',
            domain: 'obs_test'
        });

        const variant = registry.register({
            name: 'obs_variant',
            version: '2.0.0',
            content: 'Variant',
            task: 'extraction',
            domain: 'obs_test'
        });

        const experiment = service.createExperiment({
            name: 'Observation Test',
            task: 'extraction',
            domain: 'obs_test',
            control: control.id,
            variants: [variant.id]
        });

        service.startExperiment(experiment.id);

        // Record observations
        service.recordObservation(experiment.id, control.id, { success: true, score: 0.8, latency: 100 });
        service.recordObservation(experiment.id, variant.id, { success: true, score: 0.9, latency: 90 });

        // Check metrics recorded
        const controlPrompt = registry.getPromptById(control.id, 'extraction', 'obs_test');
        const variantPrompt = registry.getPromptById(variant.id, 'extraction', 'obs_test');

        assert(controlPrompt.metrics.invocations >= 1, 'Control has invocations');
        assert(variantPrompt.metrics.invocations >= 1, 'Variant has invocations');
    });

    test('Get experiment results', () => {
        const registry = createPromptRegistry();
        const service = createABTestingService({ registry, autoComplete: false });

        const control = registry.register({
            name: 'results_control',
            version: '1.0.0',
            content: 'Control',
            task: 'extraction',
            domain: 'results_test'
        });

        const variant = registry.register({
            name: 'results_variant',
            version: '2.0.0',
            content: 'Variant',
            task: 'extraction',
            domain: 'results_test'
        });

        const experiment = service.createExperiment({
            name: 'Results Test',
            task: 'extraction',
            domain: 'results_test',
            control: control.id,
            variants: [variant.id]
        });

        service.startExperiment(experiment.id);

        // Record multiple observations
        for (let i = 0; i < 10; i++) {
            service.recordObservation(experiment.id, control.id, { success: true, score: 0.7, latency: 100 });
            service.recordObservation(experiment.id, variant.id, { success: true, score: 0.85, latency: 80 });
        }

        const results = service.getResults(experiment.id);

        assert(results.analysis, 'Has analysis');
        assert(results.analysis.control, 'Has control analysis');
        assert(results.analysis.variants.length > 0, 'Has variant analysis');
        assert(results.analysis.recommendation, 'Has recommendation');
    });

    test('Complete experiment', () => {
        const registry = createPromptRegistry();
        const service = createABTestingService({ registry, autoComplete: false });

        const control = registry.register({
            name: 'complete_control',
            version: '1.0.0',
            content: 'Control',
            task: 'extraction',
            domain: 'complete_test'
        });

        const variant = registry.register({
            name: 'complete_variant',
            version: '2.0.0',
            content: 'Variant',
            task: 'extraction',
            domain: 'complete_test'
        });

        const experiment = service.createExperiment({
            name: 'Complete Test',
            task: 'extraction',
            domain: 'complete_test',
            control: control.id,
            variants: [variant.id]
        });

        service.startExperiment(experiment.id);
        const completed = service.completeExperiment(experiment.id, false);

        assert(completed.status === 'completed', 'Experiment completed');
        assert(completed.completedAt, 'Completion time recorded');
        assert(completed.results, 'Results stored');
    });

    test('List experiments', () => {
        const registry = createPromptRegistry();
        const service = createABTestingService({ registry });

        // Create a few experiments
        const control = registry.register({
            name: 'list_control',
            content: 'Control',
            task: 'extraction',
            domain: 'list_test'
        });

        const variant = registry.register({
            name: 'list_variant',
            content: 'Variant',
            task: 'extraction',
            domain: 'list_test'
        });

        service.createExperiment({
            name: 'List Test 1',
            task: 'extraction',
            domain: 'list_test',
            control: control.id,
            variants: [variant.id]
        });

        service.createExperiment({
            name: 'List Test 2',
            task: 'extraction',
            domain: 'list_test',
            control: control.id,
            variants: [variant.id]
        });

        const all = service.listExperiments();
        assert(all.length >= 2, 'Has experiments');

        const created = service.listExperiments({ status: 'created' });
        assert(created.length >= 2, 'Has created experiments');
    });

    test('Service stats', () => {
        const service = createABTestingService();
        const stats = service.getStats();

        assert(typeof stats.totalExperiments === 'number', 'Has total count');
        assert(stats.byStatus, 'Has by status breakdown');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testIntegration() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing Integration (Full A/B Test Flow)');
    console.log('═══════════════════════════════════════════════════════════════');

    test('Full A/B test flow with promotion', () => {
        const registry = createPromptRegistry({ enableABTesting: true });
        const service = createABTestingService({
            registry,
            autoComplete: false,
            minSampleSize: 5
        });

        // Register prompts
        const control = registry.register({
            name: 'flow_control',
            version: '1.0.0',
            content: 'Control prompt for flow test',
            task: 'extraction',
            domain: 'flow_test'
        });

        const variant = registry.register({
            name: 'flow_variant',
            version: '2.0.0',
            content: 'Improved variant prompt',
            task: 'extraction',
            domain: 'flow_test'
        });

        // Create and start experiment
        const experiment = service.createExperiment({
            name: 'Flow Test',
            task: 'extraction',
            domain: 'flow_test',
            control: control.id,
            variants: [variant.id],
            hypothesis: 'New variant has better scores'
        });

        service.startExperiment(experiment.id);

        // Simulate traffic - control gets lower scores
        for (let i = 0; i < 20; i++) {
            service.recordObservation(experiment.id, control.id, {
                success: true,
                score: 0.65 + Math.random() * 0.1,
                latency: 100 + Math.random() * 50
            });
        }

        // Variant gets higher scores
        for (let i = 0; i < 20; i++) {
            service.recordObservation(experiment.id, variant.id, {
                success: true,
                score: 0.85 + Math.random() * 0.1,
                latency: 80 + Math.random() * 30
            });
        }

        // Check results
        const results = service.getResults(experiment.id);
        assert(results.analysis.recommendation.action !== 'wait', 'Has recommendation');

        // Complete with promotion
        const completed = service.completeExperiment(experiment.id, true);
        assert(completed.status === 'completed', 'Experiment completed');

        // Check that variant was promoted (it had higher scores)
        const activePrompt = registry.getPrompt('extraction', 'flow_test');
        assert(activePrompt.name === 'flow_variant', 'Variant was promoted');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         Prompt Registry & A/B Testing Tests                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    try {
        testPromptVersion();
        testPromptRegistry();
        testABTesting();
        testIntegration();

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed`);
        console.log('═══════════════════════════════════════════════════════════════');

        if (testResults.failed > 0) {
            console.log('\nFailed tests:');
            testResults.tests
                .filter(t => t.status === 'failed')
                .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
        }

        process.exit(testResults.failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('\nTest suite error:', error);
        process.exit(1);
    }
}

runAllTests();

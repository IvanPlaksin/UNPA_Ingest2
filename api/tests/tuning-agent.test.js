/**
 * @fileoverview Tests for Tuning Agent and Pipeline Configuration
 * @module tests/tuning-agent.test
 */

'use strict';

const path = require('path');
const assert = require('assert');

// Test modules
const {
  DEFAULT_CONFIG,
  getConfig,
  getParameter,
  setParameter,
  validateParameter,
  getTunableParameters
} = require('../src/services/extraction/config/pipeline-config');

const { validateConfig } = require('../src/services/extraction/config/parameter-schema');
const { TuningAgent, OPTIMIZATION_STRATEGIES, SESSION_STATES } = require('../src/services/extraction/tuning/tuning-agent');
const { MetricsCollector } = require('../src/services/extraction/tuning/metrics-collector');
const { QualityEvaluator } = require('../src/services/extraction/evaluation/quality-evaluator');

// Load golden dataset
const goldenDataset = require('./fixtures/golden-dataset.json');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

function describe(name, fn) {
  console.log(`\n📋 ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    throw error;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: Pipeline Configuration
// ═══════════════════════════════════════════════════════════════════════════════

describe('Pipeline Configuration', () => {
  it('should have valid default configuration', () => {
    assert.ok(DEFAULT_CONFIG, 'DEFAULT_CONFIG should exist');
    assert.ok(DEFAULT_CONFIG.version, 'Should have version');
    assert.ok(DEFAULT_CONFIG.entityExtraction, 'Should have entityExtraction');
    assert.ok(DEFAULT_CONFIG.relationshipExtraction, 'Should have relationshipExtraction');
  });

  it('should get configuration with overrides', () => {
    const config = getConfig({ entityExtraction: { minConfidence: 0.8 } });
    assert.strictEqual(config.entityExtraction.minConfidence, 0.8);
    assert.strictEqual(config.version, DEFAULT_CONFIG.version);
  });

  it('should get parameter by path', () => {
    const value = getParameter(DEFAULT_CONFIG, 'entityExtraction.llm.temperature');
    assert.strictEqual(value, 0.1);
  });

  it('should set parameter by path', () => {
    const newConfig = setParameter(DEFAULT_CONFIG, 'entityExtraction.llm.temperature', 0.5);
    assert.strictEqual(getParameter(newConfig, 'entityExtraction.llm.temperature'), 0.5);
    // Original should be unchanged
    assert.strictEqual(getParameter(DEFAULT_CONFIG, 'entityExtraction.llm.temperature'), 0.1);
  });

  it('should validate parameter values', () => {
    const valid = validateParameter('entityExtraction.llm.temperature', 0.5);
    assert.ok(valid.valid, 'Should be valid');

    const invalid = validateParameter('entityExtraction.llm.temperature', 3.0);
    assert.ok(!invalid.valid, 'Should be invalid (out of range)');
  });

  it('should list tunable parameters', () => {
    const params = getTunableParameters();
    assert.ok(Array.isArray(params), 'Should return array');
    assert.ok(params.length > 0, 'Should have tunable parameters');

    const tempParam = params.find(p => p.path === 'entityExtraction.llm.temperature');
    assert.ok(tempParam, 'Should include temperature parameter');
    assert.ok(tempParam.min !== undefined, 'Should have min');
    assert.ok(tempParam.max !== undefined, 'Should have max');
  });
});

describe('Configuration Validation', () => {
  it('should validate correct configuration', () => {
    const result = validateConfig(DEFAULT_CONFIG);
    assert.ok(result.valid, 'Default config should be valid');
    assert.strictEqual(result.errors.length, 0);
  });

  it('should detect invalid values', () => {
    const invalidConfig = {
      ...DEFAULT_CONFIG,
      entityExtraction: {
        ...DEFAULT_CONFIG.entityExtraction,
        minConfidence: 2.0 // Invalid: should be 0-1
      }
    };
    const result = validateConfig(invalidConfig);
    assert.ok(!result.valid, 'Should be invalid');
    assert.ok(result.errors.length > 0, 'Should have errors');
  });

  it('should detect invalid types', () => {
    const invalidConfig = {
      ...DEFAULT_CONFIG,
      chunking: {
        ...DEFAULT_CONFIG.chunking,
        maxTokens: 'not a number' // Invalid type
      }
    };
    const result = validateConfig(invalidConfig);
    assert.ok(!result.valid, 'Should be invalid');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: Metrics Collector
// ═══════════════════════════════════════════════════════════════════════════════

describe('Metrics Collector', () => {
  it('should record metrics from pipeline result', () => {
    const collector = new MetricsCollector();

    const result = {
      entities: [
        { name: 'Test1', type: 'SYSTEM', confidence: 0.9 },
        { name: 'Test2', type: 'DATABASE', confidence: 0.85 }
      ],
      relationships: [
        { source: 'Test1', target: 'Test2', type: 'USES', confidence: 0.8 }
      ]
    };

    const metrics = collector.record('run_001', result);

    assert.ok(metrics.entityCount, 'Should have entityCount');
    assert.strictEqual(metrics.entityCount, 2);
    assert.strictEqual(metrics.relationshipCount, 1);
  });

  it('should compute precision/recall with ground truth', () => {
    const collector = new MetricsCollector();

    const result = {
      entities: [
        { name: 'Found1', type: 'SYSTEM', confidence: 0.9 },
        { name: 'Found2', type: 'DATABASE', confidence: 0.85 },
        { name: 'Extra', type: 'MODULE', confidence: 0.7 }
      ],
      relationships: []
    };

    const groundTruth = {
      entities: [
        { name: 'Found1', type: 'SYSTEM' },
        { name: 'Found2', type: 'DATABASE' },
        { name: 'Missing', type: 'API' }
      ],
      relationships: []
    };

    const metrics = collector.computeMetrics(result, groundTruth);

    assert.ok(metrics.entityPrecision !== undefined, 'Should have precision');
    assert.ok(metrics.entityRecall !== undefined, 'Should have recall');
    // 2 found out of 3 expected = 0.67 recall
    // 2 correct out of 3 predicted = 0.67 precision
  });

  it('should track metric trends', () => {
    const collector = new MetricsCollector();

    // Add multiple runs
    for (let i = 0; i < 15; i++) {
      collector.record(`run_${i}`, {
        entities: [{ name: `E${i}`, type: 'SYSTEM', confidence: 0.7 + i * 0.01 }],
        relationships: []
      });
    }

    const trend = collector.getTrend('entityCount', 5);
    assert.ok(trend.length > 0, 'Should have trend data');
  });

  it('should find best performing run', () => {
    const collector = new MetricsCollector();

    collector.record('run_low', {
      entities: [{ name: 'E1', type: 'SYSTEM', confidence: 0.5 }],
      relationships: []
    }, {
      entities: [{ name: 'E1', type: 'SYSTEM' }, { name: 'E2', type: 'SYSTEM' }]
    });

    collector.record('run_high', {
      entities: [
        { name: 'E1', type: 'SYSTEM', confidence: 0.9 },
        { name: 'E2', type: 'SYSTEM', confidence: 0.85 }
      ],
      relationships: []
    }, {
      entities: [{ name: 'E1', type: 'SYSTEM' }, { name: 'E2', type: 'SYSTEM' }]
    });

    const best = collector.getBestRun('entityRecall');
    assert.ok(best, 'Should find best run');
    assert.strictEqual(best.runId, 'run_high');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: Quality Evaluator
// ═══════════════════════════════════════════════════════════════════════════════

describe('Quality Evaluator', () => {
  it('should evaluate pipeline output', async () => {
    const evaluator = new QualityEvaluator();

    const pipelineResult = {
      entities: [
        { name: 'Memgraph', type: 'DATABASE', confidence: 0.95 },
        { name: 'Qdrant', type: 'DATABASE', confidence: 0.90 }
      ],
      relationships: [
        { source: 'Memgraph', target: 'Qdrant', type: 'RELATED_TO', confidence: 0.7 }
      ]
    };

    const evaluation = await evaluator.evaluate(DEFAULT_CONFIG, { pipelineResult });

    assert.ok(evaluation.overallScore !== undefined, 'Should have overall score');
    assert.ok(evaluation.scores, 'Should have individual scores');
  });

  it('should generate recommendations', async () => {
    const evaluator = new QualityEvaluator();

    const evaluation = {
      scores: {
        entityCoverage: 0.4, // Low
        relationshipQuality: 0.7,
        confidenceDistribution: 0.8
      },
      overallScore: 0.5
    };

    const recommendations = evaluator.generateRecommendations(evaluation);

    assert.ok(Array.isArray(recommendations), 'Should return array');
    assert.ok(recommendations.length > 0, 'Should have recommendations');

    const entityRec = recommendations.find(r => r.area === 'entityExtraction');
    assert.ok(entityRec, 'Should recommend entity extraction improvement');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: Tuning Agent
// ═══════════════════════════════════════════════════════════════════════════════

describe('Tuning Agent', () => {
  itAsync('should start tuning session', async () => {
    const agent = new TuningAgent({ maxIterations: 5 });
    const session = await agent.startSession();

    assert.ok(session.id, 'Should have session ID');
    assert.strictEqual(session.state, SESSION_STATES.IDLE);
    assert.ok(session.initialConfig, 'Should have initial config');
  });

  itAsync('should run single iteration', async () => {
    const agent = new TuningAgent({ maxIterations: 3 });
    await agent.startSession();

    const result = await agent.iterate();

    assert.ok(result.iteration, 'Should have iteration number');
    assert.ok(result.metrics, 'Should have metrics');
    assert.ok(result.score !== undefined, 'Should have score');
  });

  itAsync('should track session status', async () => {
    const agent = new TuningAgent({ maxIterations: 3 });

    let status = agent.getStatus();
    assert.ok(!status.active, 'Should not be active before start');

    await agent.startSession();
    status = agent.getStatus();

    assert.ok(status.active, 'Should be active after start');
    assert.ok(status.sessionId, 'Should have session ID');
  });

  itAsync('should stop session and export results', async () => {
    const agent = new TuningAgent({ maxIterations: 3 });
    await agent.startSession();
    await agent.iterate();

    await agent.stop(false);

    const exportData = agent.exportSession();
    assert.ok(exportData.id, 'Should have session ID');
    assert.ok(exportData.history, 'Should have history');
    assert.ok(exportData.bestConfig, 'Should have best config');
  });

  itAsync('should support different optimization strategies', async () => {
    const strategies = [
      OPTIMIZATION_STRATEGIES.GRID_SEARCH,
      OPTIMIZATION_STRATEGIES.RANDOM_SEARCH,
      OPTIMIZATION_STRATEGIES.BAYESIAN
    ];

    for (const strategy of strategies) {
      const agent = new TuningAgent({ maxIterations: 2, strategy });
      await agent.startSession();
      const result = await agent.iterate();

      assert.ok(result.metrics, `${strategy} should produce metrics`);
      await agent.stop(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: Golden Dataset
// ═══════════════════════════════════════════════════════════════════════════════

describe('Golden Dataset', () => {
  it('should have valid structure', () => {
    assert.ok(goldenDataset.version, 'Should have version');
    assert.ok(Array.isArray(goldenDataset.samples), 'Should have samples array');
    assert.ok(goldenDataset.samples.length >= 10, 'Should have at least 10 samples');
  });

  it('should have required fields in each sample', () => {
    for (const sample of goldenDataset.samples) {
      assert.ok(sample.id, `Sample should have id`);
      assert.ok(sample.text, `Sample ${sample.id} should have text`);
      assert.ok(sample.groundTruth, `Sample ${sample.id} should have groundTruth`);
      assert.ok(Array.isArray(sample.groundTruth.entities), `Sample ${sample.id} should have entities array`);
    }
  });

  it('should have diverse categories', () => {
    const categories = new Set(goldenDataset.samples.map(s => s.category));
    assert.ok(categories.size >= 5, 'Should have at least 5 different categories');
  });

  it('should cover expected entity types', () => {
    const foundTypes = new Set();
    for (const sample of goldenDataset.samples) {
      for (const entity of sample.groundTruth.entities) {
        foundTypes.add(entity.type);
      }
    }

    const expectedTypes = ['SYSTEM', 'DATABASE', 'TECHNOLOGY', 'ORGANIZATION', 'MODULE'];
    for (const type of expectedTypes) {
      assert.ok(foundTypes.has(type), `Should have ${type} entities`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RUN TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n🧪 Running Tuning Agent Tests\n');
  console.log('═'.repeat(60));

  try {
    // Sync tests run immediately in describe blocks

    // Async tests need to be run separately
    const agent = new TuningAgent({ maxIterations: 5 });
    const session = await agent.startSession();
    console.log(`\n  ✅ Tuning session started: ${session.id}`);

    const result = await agent.iterate();
    console.log(`  ✅ Iteration completed with score: ${result.score?.toFixed(4) || 'N/A'}`);

    await agent.stop(false);
    console.log(`  ✅ Session stopped`);

    console.log('\n' + '═'.repeat(60));
    console.log('✅ All tests passed!\n');

  } catch (error) {
    console.log('\n' + '═'.repeat(60));
    console.log('❌ Tests failed:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = { runAllTests };

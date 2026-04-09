#!/usr/bin/env node

/**
 * E2E Pipeline Test CLI
 *
 * Interactive tool for running end-to-end pipeline tests
 * and comparing input/output at each stage.
 *
 * Usage:
 *   node scripts/e2e-test-cli.js [command] [options]
 *
 * Commands:
 *   run           Run all E2E tests
 *   single <id>   Run single test case by ID
 *   compare       Interactive comparison mode
 *   report        Generate detailed report
 *   custom        Test custom input text
 *
 * @module scripts/e2e-test-cli
 */

'use strict';

require('dotenv').config();

const readline = require('readline');
const {
  GOLDEN_DATASET,
  QualityMetrics,
  RoundTripTester
} = require('../tests/e2e/pipeline-e2e.test');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m'
};

function log(msg, color = 'white') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(60));
  log(` ${title}`, 'cyan');
  console.log('='.repeat(60));
}

function subheader(title) {
  console.log('\n' + '-'.repeat(40));
  log(` ${title}`, 'blue');
  console.log('-'.repeat(40));
}

function success(msg) {
  log(`✓ ${msg}`, 'green');
}

function error(msg) {
  log(`✗ ${msg}`, 'red');
}

function warning(msg) {
  log(`⚠ ${msg}`, 'yellow');
}

function info(msg) {
  log(`ℹ ${msg}`, 'cyan');
}

/**
 * Run all E2E tests
 */
async function runAllTests() {
  header('E2E Pipeline Test Suite');

  const tester = new RoundTripTester();
  const results = {
    passed: 0,
    failed: 0,
    details: []
  };

  const startTime = Date.now();

  for (const testCase of GOLDEN_DATASET) {
    process.stdout.write(`  Testing ${testCase.id}... `);

    try {
      const result = await tester.processDocument(testCase);

      if (result.passed) {
        success('PASSED');
        results.passed++;
      } else {
        error('FAILED');
        result.errors.forEach(e => console.log(`    → ${e}`));
        results.failed++;
      }

      results.details.push(result);
    } catch (err) {
      error(`ERROR: ${err.message}`);
      results.failed++;
    }
  }

  const totalTime = Date.now() - startTime;

  subheader('Summary');
  console.log(`  Total tests: ${GOLDEN_DATASET.length}`);
  success(`Passed: ${results.passed}`);
  if (results.failed > 0) {
    error(`Failed: ${results.failed}`);
  }
  console.log(`  Time: ${totalTime}ms`);

  return results;
}

/**
 * Run single test case
 */
async function runSingleTest(testId) {
  const testCase = GOLDEN_DATASET.find(c => c.id === testId);

  if (!testCase) {
    error(`Test case '${testId}' not found`);
    console.log('Available test cases:');
    GOLDEN_DATASET.forEach(c => console.log(`  - ${c.id} (${c.category})`));
    return;
  }

  header(`Test Case: ${testId}`);
  info(`Category: ${testCase.category}`);

  const tester = new RoundTripTester();
  const result = await tester.processDocument(testCase);

  // Show detailed results
  subheader('Input');
  console.log(testCase.input.substring(0, 500) + (testCase.input.length > 500 ? '...' : ''));

  subheader('Stage 1: Sanitization');
  console.log(`  Output length: ${result.stages.sanitization.output.length}`);
  console.log(`  Changes: ${JSON.stringify(result.stages.sanitization.changes)}`);

  subheader('Stage 2: Language Detection');
  console.log(`  Detected: ${result.stages.languageDetection.detected}`);
  console.log(`  Expected: ${result.stages.languageDetection.expected}`);
  console.log(`  Confidence: ${(result.stages.languageDetection.confidence * 100).toFixed(1)}%`);
  if (result.stages.languageDetection.passed) {
    success('Language detection passed');
  } else {
    error('Language detection failed');
  }

  subheader('Stage 3: Chunking');
  console.log(`  Chunks created: ${result.stages.chunking.count}`);
  console.log(`  Expected range: [${testCase.expectedChunks.min}, ${testCase.expectedChunks.max}]`);
  result.stages.chunking.chunks.forEach(c => {
    console.log(`    Chunk ${c.index}: ~${c.tokenEstimate} tokens`);
    console.log(`      "${c.preview}..."`);
  });
  if (result.stages.chunking.passed) {
    success('Chunking passed');
  } else {
    error('Chunking failed');
  }

  subheader('Stage 4: Entity Extraction');
  console.log(`  Entities found: ${result.stages.entityExtraction.count}`);
  result.stages.entityExtraction.entities.slice(0, 10).forEach(e => {
    console.log(`    - [${e.type}] ${e.name || e.text}`);
  });

  subheader('Quality Metrics');

  console.log('\n  Entity Preservation:');
  console.log(`    Rate: ${(result.metrics.entityPreservation.rate * 100).toFixed(1)}%`);
  console.log(`    Found: ${result.metrics.entityPreservation.found}/${result.metrics.entityPreservation.total}`);
  if (result.metrics.entityPreservation.missing.length > 0) {
    console.log(`    Missing: ${result.metrics.entityPreservation.missing.map(m => m.name).join(', ')}`);
  }

  console.log('\n  Term Preservation:');
  console.log(`    Rate: ${(result.metrics.termPreservation.rate * 100).toFixed(1)}%`);
  if (result.metrics.termPreservation.missing.length > 0) {
    console.log(`    Missing: ${result.metrics.termPreservation.missing.join(', ')}`);
  }

  console.log('\n  Information Density:');
  console.log(`    Original tokens: ${result.metrics.informationDensity.originalTokens}`);
  console.log(`    Chunk tokens: ${result.metrics.informationDensity.chunkTokens}`);
  console.log(`    Overlap ratio: ${(result.metrics.informationDensity.overlapRatio * 100).toFixed(1)}%`);

  console.log('\n  Semantic Similarity:');
  console.log(`    Score: ${(result.metrics.semanticSimilarity.score * 100).toFixed(1)}%`);

  subheader('Overall Result');
  if (result.passed) {
    success('TEST PASSED');
  } else {
    error('TEST FAILED');
    result.errors.forEach(e => console.log(`  → ${e}`));
  }
}

/**
 * Test custom input
 */
async function testCustomInput(text) {
  header('Custom Input Test');

  const customCase = {
    id: 'CUSTOM',
    category: 'CUSTOM',
    input: text,
    expectedLanguage: 'en', // Will verify
    expectedEntities: [],
    expectedChunks: { min: 1, max: 100 },
    searchQueries: [],
    semanticIntent: '',
    criticalTerms: []
  };

  const tester = new RoundTripTester();

  subheader('Input');
  console.log(text.substring(0, 500) + (text.length > 500 ? '...' : ''));

  // Run processing
  const result = await tester.processDocument(customCase);

  subheader('Sanitization');
  console.log(`  Original length: ${text.length}`);
  console.log(`  Sanitized length: ${result.stages.sanitization.output.length}`);

  const diff = text.length - result.stages.sanitization.output.length;
  if (diff > 0) {
    warning(`  Removed ${diff} characters`);
  }

  subheader('Language Detection');
  console.log(`  Language: ${result.stages.languageDetection.detected}`);
  console.log(`  Confidence: ${(result.stages.languageDetection.confidence * 100).toFixed(1)}%`);

  subheader('Chunking');
  console.log(`  Chunks: ${result.stages.chunking.count}`);
  result.stages.chunking.chunks.forEach(c => {
    console.log(`\n  Chunk ${c.index} (~${c.tokenEstimate} tokens):`);
    console.log(`    "${c.preview}..."`);
  });

  subheader('Entities Extracted');
  if (result.stages.entityExtraction.entities.length === 0) {
    info('No entities extracted');
  } else {
    // Group by type
    const byType = {};
    for (const e of result.stages.entityExtraction.entities) {
      const type = e.type || 'unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(e.name || e.text);
    }

    for (const [type, entities] of Object.entries(byType)) {
      console.log(`  ${type}: ${entities.join(', ')}`);
    }
  }

  subheader('Reconstruction Comparison');

  const reconstructed = result.stages.chunking.chunks
    .map(c => c.preview + '...')
    .join(' ');

  const similarity = QualityMetrics.semanticSimilarity(
    result.stages.sanitization.output,
    result.stages.chunking.chunks.map(c =>
      result.stages.sanitization.output.substring(0, 100) // approximate
    ).join(' ')
  );

  console.log(`  Semantic similarity: ${(similarity * 100).toFixed(1)}%`);

  if (similarity >= 0.7) {
    success('Good semantic preservation');
  } else if (similarity >= 0.5) {
    warning('Moderate semantic preservation');
  } else {
    error('Low semantic preservation');
  }
}

/**
 * Generate detailed report
 */
async function generateReport() {
  header('E2E Pipeline Quality Report');

  const tester = new RoundTripTester();
  const startTime = Date.now();

  // Run all tests
  const allResults = [];
  for (const testCase of GOLDEN_DATASET) {
    allResults.push(await tester.processDocument(testCase));
  }

  const totalTime = Date.now() - startTime;

  // Aggregate metrics
  const metrics = {
    languageDetection: {
      passed: 0,
      failed: 0
    },
    chunking: {
      passed: 0,
      failed: 0,
      avgChunks: 0
    },
    entityPreservation: {
      rates: [],
      avgRate: 0
    },
    termPreservation: {
      rates: [],
      avgRate: 0
    },
    semanticSimilarity: {
      scores: [],
      avgScore: 0
    }
  };

  for (const result of allResults) {
    // Language detection
    if (result.stages.languageDetection.passed) {
      metrics.languageDetection.passed++;
    } else {
      metrics.languageDetection.failed++;
    }

    // Chunking
    if (result.stages.chunking.passed) {
      metrics.chunking.passed++;
    } else {
      metrics.chunking.failed++;
    }
    metrics.chunking.avgChunks += result.stages.chunking.count;

    // Entity preservation
    metrics.entityPreservation.rates.push(result.metrics.entityPreservation.rate);

    // Term preservation
    metrics.termPreservation.rates.push(result.metrics.termPreservation.rate);

    // Semantic similarity
    metrics.semanticSimilarity.scores.push(result.metrics.semanticSimilarity.score);
  }

  // Calculate averages
  const n = allResults.length;
  metrics.chunking.avgChunks /= n;
  metrics.entityPreservation.avgRate =
    metrics.entityPreservation.rates.reduce((a, b) => a + b, 0) / n;
  metrics.termPreservation.avgRate =
    metrics.termPreservation.rates.reduce((a, b) => a + b, 0) / n;
  metrics.semanticSimilarity.avgScore =
    metrics.semanticSimilarity.scores.reduce((a, b) => a + b, 0) / n;

  // Print report
  subheader('Test Coverage');
  console.log(`  Test cases: ${GOLDEN_DATASET.length}`);
  console.log(`  Categories: ${[...new Set(GOLDEN_DATASET.map(c => c.category))].join(', ')}`);
  console.log(`  Total time: ${totalTime}ms`);

  subheader('Language Detection');
  console.log(`  Accuracy: ${(metrics.languageDetection.passed / n * 100).toFixed(1)}%`);
  console.log(`  Passed: ${metrics.languageDetection.passed}`);
  console.log(`  Failed: ${metrics.languageDetection.failed}`);

  subheader('Chunking');
  console.log(`  Success rate: ${(metrics.chunking.passed / n * 100).toFixed(1)}%`);
  console.log(`  Average chunks per document: ${metrics.chunking.avgChunks.toFixed(1)}`);

  subheader('Entity Preservation');
  console.log(`  Average rate: ${(metrics.entityPreservation.avgRate * 100).toFixed(1)}%`);
  console.log(`  Min rate: ${(Math.min(...metrics.entityPreservation.rates) * 100).toFixed(1)}%`);
  console.log(`  Max rate: ${(Math.max(...metrics.entityPreservation.rates) * 100).toFixed(1)}%`);

  subheader('Term Preservation');
  console.log(`  Average rate: ${(metrics.termPreservation.avgRate * 100).toFixed(1)}%`);
  console.log(`  Min rate: ${(Math.min(...metrics.termPreservation.rates) * 100).toFixed(1)}%`);
  console.log(`  Max rate: ${(Math.max(...metrics.termPreservation.rates) * 100).toFixed(1)}%`);

  subheader('Semantic Similarity');
  console.log(`  Average score: ${(metrics.semanticSimilarity.avgScore * 100).toFixed(1)}%`);
  console.log(`  Min score: ${(Math.min(...metrics.semanticSimilarity.scores) * 100).toFixed(1)}%`);
  console.log(`  Max score: ${(Math.max(...metrics.semanticSimilarity.scores) * 100).toFixed(1)}%`);

  subheader('Detailed Results by Test Case');
  for (const result of allResults) {
    const status = result.passed ? `${colors.green}PASS${colors.reset}` : `${colors.red}FAIL${colors.reset}`;
    console.log(`\n  ${result.id} (${result.category}): ${status}`);
    console.log(`    Language: ${result.stages.languageDetection.detected}`);
    console.log(`    Chunks: ${result.stages.chunking.count}`);
    console.log(`    Entity preservation: ${(result.metrics.entityPreservation.rate * 100).toFixed(0)}%`);
    console.log(`    Term preservation: ${(result.metrics.termPreservation.rate * 100).toFixed(0)}%`);
    console.log(`    Semantic similarity: ${(result.metrics.semanticSimilarity.score * 100).toFixed(0)}%`);

    if (result.errors.length > 0) {
      console.log(`    Errors:`);
      result.errors.forEach(e => console.log(`      - ${e}`));
    }
  }

  subheader('Overall Quality Score');

  const overallScore = (
    (metrics.languageDetection.passed / n) * 0.2 +
    (metrics.chunking.passed / n) * 0.2 +
    metrics.entityPreservation.avgRate * 0.2 +
    metrics.termPreservation.avgRate * 0.2 +
    metrics.semanticSimilarity.avgScore * 0.2
  );

  console.log(`\n  Overall Score: ${(overallScore * 100).toFixed(1)}%`);

  if (overallScore >= 0.9) {
    success('Excellent pipeline quality');
  } else if (overallScore >= 0.8) {
    success('Good pipeline quality');
  } else if (overallScore >= 0.7) {
    warning('Acceptable pipeline quality');
  } else {
    error('Pipeline quality needs improvement');
  }
}

/**
 * Interactive mode
 */
async function interactiveMode() {
  header('E2E Pipeline Test CLI - Interactive Mode');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const prompt = () => {
    rl.question('\n> ', async (input) => {
      const [cmd, ...args] = input.trim().split(' ');

      switch (cmd) {
        case 'run':
          await runAllTests();
          break;

        case 'single':
          if (args[0]) {
            await runSingleTest(args[0]);
          } else {
            console.log('Usage: single <test-id>');
            console.log('Available: ' + GOLDEN_DATASET.map(c => c.id).join(', '));
          }
          break;

        case 'list':
          console.log('\nAvailable test cases:');
          GOLDEN_DATASET.forEach(c => {
            console.log(`  ${c.id.padEnd(15)} ${c.category}`);
          });
          break;

        case 'report':
          await generateReport();
          break;

        case 'custom':
          const text = args.join(' ');
          if (text) {
            await testCustomInput(text);
          } else {
            console.log('Usage: custom <your text here>');
          }
          break;

        case 'help':
          console.log('\nCommands:');
          console.log('  run          Run all E2E tests');
          console.log('  single <id>  Run single test case');
          console.log('  list         List all test cases');
          console.log('  report       Generate detailed report');
          console.log('  custom <text> Test custom input');
          console.log('  exit         Exit CLI');
          break;

        case 'exit':
        case 'quit':
          rl.close();
          process.exit(0);
          break;

        default:
          if (cmd) {
            console.log(`Unknown command: ${cmd}. Type 'help' for available commands.`);
          }
      }

      prompt();
    });
  };

  console.log("Type 'help' for available commands.\n");
  prompt();
}

// Main
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'run':
      await runAllTests();
      break;

    case 'single':
      if (args[1]) {
        await runSingleTest(args[1]);
      } else {
        error('Please provide test case ID');
        console.log('Available: ' + GOLDEN_DATASET.map(c => c.id).join(', '));
      }
      break;

    case 'report':
      await generateReport();
      break;

    case 'custom':
      const text = args.slice(1).join(' ');
      if (text) {
        await testCustomInput(text);
      } else {
        error('Please provide text to test');
      }
      break;

    case 'interactive':
    case 'i':
      await interactiveMode();
      break;

    default:
      console.log('E2E Pipeline Test CLI');
      console.log('\nUsage: node scripts/e2e-test-cli.js <command> [options]\n');
      console.log('Commands:');
      console.log('  run              Run all E2E tests');
      console.log('  single <id>      Run single test case');
      console.log('  report           Generate detailed report');
      console.log('  custom <text>    Test custom input text');
      console.log('  interactive, i   Start interactive mode');
      console.log('\nExamples:');
      console.log('  node scripts/e2e-test-cli.js run');
      console.log('  node scripts/e2e-test-cli.js single UN-001');
      console.log('  node scripts/e2e-test-cli.js custom "Test IMIS leave request"');
  }
}

main().catch(err => {
  error(`Fatal error: ${err.message}`);
  console.error(err);
  process.exit(1);
});

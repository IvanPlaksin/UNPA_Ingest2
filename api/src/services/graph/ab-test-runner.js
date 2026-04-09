/**
 * A/B Test Runner for SDA vs Legacy Pipeline
 *
 * Runs comparison tests between the SDA pipeline and legacy enhanced pipeline
 * using the test corpus to measure quality differences.
 *
 * @module services/graph/ab-test-runner
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (JSDoc)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} TestMetrics
 * @property {string|null} error - Error message if failed
 * @property {number} nodeCount - Number of nodes
 * @property {number} edgeCount - Number of edges
 * @property {number} structuralScore - Structural quality score
 * @property {number} semanticScore - Semantic quality score
 * @property {number} overallScore - Overall quality score
 * @property {string} grade - Quality grade (A+, A, B+, B, C, D, F)
 * @property {number} totalTokens - Total tokens used
 * @property {number} generationTimeMs - Generation time
 */

/**
 * @typedef {Object} TestComparison
 * @property {string} testCaseId - Test case ID
 * @property {string} prompt - Truncated prompt
 * @property {TestMetrics} legacy - Legacy pipeline metrics
 * @property {TestMetrics} sda - SDA pipeline metrics
 * @property {'legacy'|'sda'|'tie'} winner - Which pipeline won
 * @property {Object|null} deltas - Score deltas
 */

/**
 * @typedef {Object} ABTestReport
 * @property {number} totalTests - Total test cases run
 * @property {number} successfulPairs - Tests where both pipelines succeeded
 * @property {Object} errors - Error counts by pipeline
 * @property {Object} wins - Win counts by pipeline
 * @property {Object|null} avgDeltas - Average score deltas
 * @property {TestComparison[]} results - Individual test results
 * @property {string} summary - Human-readable summary
 */

// ═══════════════════════════════════════════════════════════════════════════
// A/B TEST RUNNER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ABTestRunner {
  /**
   * @param {Function} generateGraphFn - Function to call for generation
   */
  constructor(generateGraphFn) {
    this.generateGraph = generateGraphFn;
    this.winThreshold = 0.05; // 5% difference to declare a winner
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN TEST RUNNER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Run full A/B test across test corpus
   * @param {Array} testCases - Test cases from test-corpus.js
   * @param {Object} [options] - Test options
   * @param {boolean} [options.verbose=true] - Log progress
   * @param {number} [options.delayBetweenTests=1000] - Delay between tests (ms)
   * @returns {Promise<ABTestReport>}
   */
  async runFullTest(testCases, options = {}) {
    const { verbose = true, delayBetweenTests = 1000 } = options;
    const results = [];
    const startTime = Date.now();

    if (verbose) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log(`[A/B Test] Starting test run with ${testCases.length} cases`);
      console.log(`${'═'.repeat(60)}\n`);
    }

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const prompt = testCase.prompt || testCase.promptEn || testCase.promptRu || '';

      if (verbose) {
        console.log(`[A/B Test] (${i + 1}/${testCases.length}) ${testCase.id}`);
        console.log(`           "${prompt.substring(0, 60)}..."`);
      }

      let legacyResult = null;
      let sdaResult = null;

      // 1. Run Legacy Enhanced pipeline
      try {
        if (verbose) console.log('           Running Legacy Enhanced...');
        legacyResult = await this.generateGraph({
          task: prompt,
          useEnhanced: true,
          useSDA: false
        });
      } catch (err) {
        legacyResult = { error: err.message };
        if (verbose) console.log(`           Legacy ERROR: ${err.message}`);
      }

      // Small delay between API calls
      if (delayBetweenTests > 0) {
        await this._delay(delayBetweenTests);
      }

      // 2. Run SDA pipeline
      try {
        if (verbose) console.log('           Running SDA...');
        sdaResult = await this.generateGraph({
          task: prompt,
          useSDA: true
        });
      } catch (err) {
        sdaResult = { error: err.message };
        if (verbose) console.log(`           SDA ERROR: ${err.message}`);
      }

      // 3. Compare results
      const comparison = this._compare(testCase, legacyResult, sdaResult);
      results.push(comparison);

      if (verbose) {
        const legacyGrade = comparison.legacy.grade || 'ERROR';
        const sdaGrade = comparison.sda.grade || 'ERROR';
        console.log(`           Result: Legacy=${legacyGrade} SDA=${sdaGrade} Winner=${comparison.winner}`);
        console.log('');
      }

      // Delay between tests to avoid rate limiting
      if (i < testCases.length - 1 && delayBetweenTests > 0) {
        await this._delay(delayBetweenTests);
      }
    }

    // 4. Aggregate results
    const report = this._aggregate(results);
    report.totalTimeMs = Date.now() - startTime;

    if (verbose) {
      console.log(`\n${'═'.repeat(60)}`);
      console.log('[A/B Test] RESULTS');
      console.log(`${'═'.repeat(60)}`);
      console.log(report.summary);
      console.log(`\nTotal time: ${(report.totalTimeMs / 1000).toFixed(1)}s`);
      console.log(`${'═'.repeat(60)}\n`);
    }

    return report;
  }

  /**
   * Run test for a single test case
   * @param {Object} testCase - Single test case
   * @returns {Promise<TestComparison>}
   */
  async runSingleTest(testCase) {
    const report = await this.runFullTest([testCase], { verbose: false, delayBetweenTests: 500 });
    return report.results[0];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPARISON LOGIC
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compare results from both pipelines
   * @private
   */
  _compare(testCase, legacyResult, sdaResult) {
    const legacy = this._extractMetrics(legacyResult);
    const sda = this._extractMetrics(sdaResult);

    let winner = 'tie';
    if (legacy.error && !sda.error) {
      winner = 'sda';
    } else if (!legacy.error && sda.error) {
      winner = 'legacy';
    } else if (!legacy.error && !sda.error) {
      // Both succeeded - compare quality
      if (sda.overallScore > legacy.overallScore + this.winThreshold) {
        winner = 'sda';
      } else if (legacy.overallScore > sda.overallScore + this.winThreshold) {
        winner = 'legacy';
      }
    }

    const deltas = (!legacy.error && !sda.error) ? {
      structural: sda.structuralScore - legacy.structuralScore,
      semantic: sda.semanticScore - legacy.semanticScore,
      overall: sda.overallScore - legacy.overallScore,
      nodeCount: sda.nodeCount - legacy.nodeCount,
      edgeCount: sda.edgeCount - legacy.edgeCount,
      tokenReduction: legacy.totalTokens > 0
        ? 1 - (sda.totalTokens / legacy.totalTokens)
        : 0,
      timeDelta: sda.generationTimeMs - legacy.generationTimeMs
    } : null;

    return {
      testCaseId: testCase.id,
      category: testCase.category,
      complexity: testCase.complexity,
      prompt: (testCase.prompt || testCase.promptEn || '').substring(0, 80),
      expectedProperties: testCase.expectedProperties,
      legacy,
      sda,
      winner,
      deltas
    };
  }

  /**
   * Extract metrics from generation result
   * @private
   */
  _extractMetrics(result) {
    if (!result || result.error) {
      return {
        error: result?.error || 'unknown',
        overallScore: 0,
        grade: null
      };
    }

    const qm = result.qualityMetrics || {};
    const aiStatus = result.aiStatus || {};

    return {
      error: null,
      nodeCount: result.data?.nodes?.length || 0,
      edgeCount: result.data?.edges?.length || 0,
      structuralScore: qm.structural?.compositeScore || 0,
      semanticScore: qm.semantic?.compositeScore || 0,
      overallScore: qm.overall?.score || 0,
      grade: qm.overall?.grade || 'N/A',
      totalTokens: (aiStatus.inputTokens || 0) + (aiStatus.outputTokens || 0),
      generationTimeMs: aiStatus.durationMs || 0,
      dagValid: qm.structural?.dagValidity || 0,
      toolHitRate: qm.structural?.toolIdHitRate || 0,
      source: result.source || 'unknown',
      taskPlanSteps: result.taskPlan?.steps?.length || 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AGGREGATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Aggregate results into final report
   * @private
   */
  _aggregate(results) {
    const valid = results.filter(r => !r.legacy.error && !r.sda.error);

    const wins = { legacy: 0, sda: 0, tie: 0 };
    for (const r of results) {
      wins[r.winner]++;
    }

    const errors = {
      legacy: results.filter(r => r.legacy.error).length,
      sda: results.filter(r => r.sda.error).length
    };

    const avgDeltas = valid.length > 0 ? {
      structural: this._avg(valid, r => r.deltas?.structural || 0),
      semantic: this._avg(valid, r => r.deltas?.semantic || 0),
      overall: this._avg(valid, r => r.deltas?.overall || 0),
      tokenReduction: this._avg(valid, r => r.deltas?.tokenReduction || 0),
      timeDelta: this._avg(valid, r => r.deltas?.timeDelta || 0),
      nodeCountDelta: this._avg(valid, r => r.deltas?.nodeCount || 0),
      edgeCountDelta: this._avg(valid, r => r.deltas?.edgeCount || 0)
    } : null;

    // By category breakdown
    const byCategory = {};
    for (const r of results) {
      const cat = r.category || 'unknown';
      if (!byCategory[cat]) {
        byCategory[cat] = { legacy: 0, sda: 0, tie: 0, total: 0 };
      }
      byCategory[cat][r.winner]++;
      byCategory[cat].total++;
    }

    // By complexity breakdown
    const byComplexity = {};
    for (const r of results) {
      const comp = r.complexity || 'unknown';
      if (!byComplexity[comp]) {
        byComplexity[comp] = { legacy: 0, sda: 0, tie: 0, total: 0 };
      }
      byComplexity[comp][r.winner]++;
      byComplexity[comp].total++;
    }

    return {
      totalTests: results.length,
      successfulPairs: valid.length,
      errors,
      wins,
      avgDeltas,
      byCategory,
      byComplexity,
      results,
      summary: this._generateSummary(wins, avgDeltas, valid.length, errors)
    };
  }

  /**
   * Calculate average
   * @private
   */
  _avg(arr, fn) {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, item) => sum + fn(item), 0) / arr.length;
  }

  /**
   * Generate human-readable summary
   * @private
   */
  _generateSummary(wins, avgDeltas, validCount, errors) {
    const lines = [];

    lines.push(`WINS: SDA ${wins.sda} | Legacy ${wins.legacy} | Tie ${wins.tie}`);

    if (errors.legacy > 0 || errors.sda > 0) {
      lines.push(`ERRORS: Legacy ${errors.legacy} | SDA ${errors.sda}`);
    }

    if (validCount === 0) {
      lines.push('No valid comparisons — both pipelines had errors in all tests');
      return lines.join('\n');
    }

    lines.push('');
    lines.push('AVERAGE DELTAS (SDA - Legacy):');
    lines.push(`  Quality: ${this._formatDelta(avgDeltas.overall * 100)}%`);
    lines.push(`  Structural: ${this._formatDelta(avgDeltas.structural * 100)}%`);
    lines.push(`  Semantic: ${this._formatDelta(avgDeltas.semantic * 100)}%`);
    lines.push(`  Token reduction: ${(avgDeltas.tokenReduction * 100).toFixed(1)}%`);
    lines.push(`  Time: ${this._formatDelta(avgDeltas.timeDelta)}ms`);

    lines.push('');

    // Verdict
    if (wins.sda > wins.legacy) {
      lines.push(`VERDICT: SDA pipeline is BETTER (${wins.sda}/${wins.sda + wins.legacy + wins.tie} wins)`);
    } else if (wins.legacy > wins.sda) {
      lines.push(`VERDICT: Legacy pipeline is BETTER (${wins.legacy}/${wins.sda + wins.legacy + wins.tie} wins)`);
    } else {
      lines.push(`VERDICT: TIE - no clear winner`);
    }

    return lines.join('\n');
  }

  /**
   * Format delta with sign
   * @private
   */
  _formatDelta(value) {
    return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
  }

  /**
   * Delay helper
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REPORT FORMATTING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Format results as markdown table
   * @param {ABTestReport} report
   * @returns {string}
   */
  formatAsTable(report) {
    const lines = [];

    lines.push('| Test Case | Legacy | SDA | Winner | Quality Delta |');
    lines.push('|-----------|--------|-----|--------|---------------|');

    for (const r of report.results) {
      const legacyGrade = r.legacy.grade || 'ERR';
      const sdaGrade = r.sda.grade || 'ERR';
      const qualityDelta = r.deltas
        ? this._formatDelta(r.deltas.overall * 100) + '%'
        : 'N/A';

      lines.push(`| ${r.testCaseId} | ${legacyGrade} | ${sdaGrade} | ${r.winner} | ${qualityDelta} |`);
    }

    return lines.join('\n');
  }

  /**
   * Format results as JSON for logging
   * @param {ABTestReport} report
   * @returns {Object}
   */
  formatForLogging(report) {
    return {
      timestamp: new Date().toISOString(),
      totalTests: report.totalTests,
      successfulPairs: report.successfulPairs,
      wins: report.wins,
      avgDeltas: report.avgDeltas,
      errors: report.errors,
      byCategory: report.byCategory,
      byComplexity: report.byComplexity,
      totalTimeMs: report.totalTimeMs
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create ABTestRunner instance
 * @param {Function} generateGraphFn - Function to call for generation
 * @returns {ABTestRunner}
 */
function createABTestRunner(generateGraphFn) {
  return new ABTestRunner(generateGraphFn);
}

module.exports = {
  ABTestRunner,
  createABTestRunner
};

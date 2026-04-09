/**
 * Codex Consistency Runner
 *
 * Orchestrates execution of consistency check executors.
 * Can run as standalone or be integrated with GXE RuntimeEngine.
 */

const {
  LoadCodexNodesExecutor,
  ValidatePrinciplesExecutor,
  ValidateRulesExecutor,
  ValidateHashChainExecutor,
  ValidateBlackCodexExecutor,
  ValidateSupersededChainsExecutor,
  GenerateReportExecutor
} = require('../../executors/codex/CodexConsistencyExecutors');

class CodexConsistencyRunner {
  constructor() {
    this.checks = {
      'load-nodes': new LoadCodexNodesExecutor(),
      'validate-principles': new ValidatePrinciplesExecutor(),
      'validate-rules': new ValidateRulesExecutor(),
      'validate-hash': new ValidateHashChainExecutor(),
      'validate-blackcodex': new ValidateBlackCodexExecutor(),
      'validate-supersedes': new ValidateSupersededChainsExecutor(),
      'generate-report': new GenerateReportExecutor()
    };
  }

  /**
   * Run full consistency check
   * @param {object} options
   * @param {boolean} options.verbose - Print progress
   * @param {boolean} options.stopOnError - Stop on first ERROR finding
   */
  async run(options = {}) {
    const { verbose = false, stopOnError = false } = options;
    const startTime = Date.now();

    if (verbose) console.log('Starting Codex Consistency Check...\n');

    // Step 1: Load all nodes
    if (verbose) console.log('  [1/7] Loading Codex nodes...');
    const loadResult = await this.checks['load-nodes'].execute();
    if (verbose) console.log(`        Loaded ${loadResult.counts.total} nodes`);

    // Step 2: Validate principles
    if (verbose) console.log('  [2/7] Validating principles...');
    const principlesResult = await this.checks['validate-principles'].execute(loadResult);
    if (verbose) console.log(`        ${principlesResult.findings.length} findings`);
    if (stopOnError && !principlesResult.passed) {
      return this._earlyReturn(loadResult, { 'validate-principles': principlesResult }, startTime);
    }

    // Step 3: Validate rules
    if (verbose) console.log('  [3/7] Validating rules...');
    const rulesResult = await this.checks['validate-rules'].execute(loadResult);
    if (verbose) console.log(`        ${rulesResult.findings.length} findings`);
    if (stopOnError && !rulesResult.passed) {
      return this._earlyReturn(loadResult, {
        'validate-principles': principlesResult,
        'validate-rules': rulesResult
      }, startTime);
    }

    // Step 4: Validate hash chain
    if (verbose) console.log('  [4/7] Validating hash chain...');
    const hashResult = await this.checks['validate-hash'].execute(loadResult);
    if (verbose) console.log(`        ${hashResult.findings.length} findings`);

    // Step 5: Validate BlackCodex
    if (verbose) console.log('  [5/7] Validating BlackCodex...');
    const blackcodexResult = await this.checks['validate-blackcodex'].execute(loadResult);
    if (verbose) console.log(`        ${blackcodexResult.findings.length} findings`);

    // Step 6: Validate SUPERSEDES chains
    if (verbose) console.log('  [6/7] Validating SUPERSEDES chains...');
    const supersedesResult = await this.checks['validate-supersedes'].execute(loadResult);
    if (verbose) console.log(`        ${supersedesResult.findings.length} findings`);

    // Step 7: Generate report
    if (verbose) console.log('  [7/7] Generating report...');
    const report = await this.checks['generate-report'].execute({
      counts: loadResult.counts,
      'validate-principles': principlesResult,
      'validate-rules': rulesResult,
      'validate-hash': hashResult,
      'validate-blackcodex': blackcodexResult,
      'validate-supersedes': supersedesResult
    });

    report.durationMs = Date.now() - startTime;

    if (verbose) {
      console.log(`\n  Status: ${report.status}`);
      console.log(`  Duration: ${report.durationMs}ms`);
      console.log(`  Errors: ${report.summary.errors}, Warnings: ${report.summary.warnings}`);
    }

    return report;
  }

  _earlyReturn(loadResult, checkResults, startTime) {
    const report = new GenerateReportExecutor().execute({
      counts: loadResult.counts,
      ...checkResults
    });
    report.durationMs = Date.now() - startTime;
    report.earlyStop = true;
    return report;
  }

  /**
   * Run a specific check in isolation
   */
  async runCheck(checkName, input = {}) {
    const check = this.checks[checkName];
    if (!check) {
      throw new Error(`Unknown check: ${checkName}. Available: ${this.getAvailableChecks().join(', ')}`);
    }

    // If no input provided, load nodes first
    if (Object.keys(input).length === 0 && checkName !== 'load-nodes') {
      input = await this.checks['load-nodes'].execute();
    }

    return check.execute(input);
  }

  /**
   * Quick health check — only checks basic counts and structure
   */
  async healthCheck() {
    const loadResult = await this.checks['load-nodes'].execute();
    const issues = [];

    if (loadResult.counts.principles === 0) issues.push('No principles found');
    if (loadResult.counts.rules === 0) issues.push('No rules found');
    if (loadResult.counts.principles > 0 && loadResult.counts.rules === 0) {
      issues.push('Principles exist but no rules');
    }

    return {
      status: issues.length === 0 ? 'HEALTHY' : 'ISSUES_FOUND',
      counts: loadResult.counts,
      issues,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get list of available checks
   */
  getAvailableChecks() {
    return Object.keys(this.checks);
  }
}

module.exports = new CodexConsistencyRunner();

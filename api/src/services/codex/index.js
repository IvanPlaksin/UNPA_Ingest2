/**
 * Codex Module - Governance rules and standards
 */

const codexService = require('./codex.service');
const codexValidator = require('./codex-validator.service');
const blackCodexService = require('./blackcodex.service');
const codexGovernance = require('./codex-governance.service');
const codexLoader = require('./codex-loader.service');
const consistencyRunner = require('./codex-consistency-runner');

module.exports = {
  codexService,
  codexValidator,
  blackCodexService,
  codexGovernance,
  codexLoader,
  consistencyRunner
};

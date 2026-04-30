/**
 * dialogue.sanitize executor
 * Removes sensitive data from NormalizedDialogue objects before storage.
 * Required by Codex rule DLG-003: sanitization is mandatory before indexing.
 */

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');
const { SANITIZE_PATTERNS } = require('../config/sanitize.patterns');

function applyPatterns(text, patterns, stats) {
  if (typeof text !== 'string' || text.length === 0) return text;
  // Skip already-redacted spans to avoid double-redaction
  let result = text;
  for (const p of patterns) {
    const before = result;
    result = result.replace(p.regex, (match) => {
      if (match.startsWith('[REDACTED')) return match;
      const category = p.name;
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
      stats.totalRedactions++;
      return p.replacement;
    });
    // Reset regex lastIndex (global flag)
    p.regex.lastIndex = 0;
  }
  return result;
}

function sanitizeMessage(msg, patterns, stats) {
  const before = stats.totalRedactions;

  msg.text = applyPatterns(msg.text, patterns, stats);

  if (Array.isArray(msg.toolUse)) {
    for (const tool of msg.toolUse) {
      if (tool.input && typeof tool.input === 'object') {
        const inputStr = JSON.stringify(tool.input);
        const sanitized = applyPatterns(inputStr, patterns, stats);
        if (sanitized !== inputStr) {
          try { tool.input = JSON.parse(sanitized); } catch { tool.input = { _sanitized: sanitized }; }
        }
      }
      if (typeof tool.result === 'string') {
        tool.result = applyPatterns(tool.result, patterns, stats);
      }
    }
  }

  return stats.totalRedactions > before;
}

const dialogueSanitizeExecutor = createSimpleExecutor({
  type: 'dialogue.sanitize',
  displayName: 'Dialogue Sanitization',
  description: 'Remove sensitive data (API keys, passwords, internal URLs) from dialogues before storage',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      dialogues: {
        type: 'array',
        description: 'Array of NormalizedDialogue objects from dialogue.ingest',
      },
      patterns: {
        type: 'string',
        enum: ['default', 'strict', 'minimal'],
        default: 'default',
        description: 'Pattern set: default=all 11, strict=all+extra, minimal=only api keys',
      },
      logRedactions: {
        type: 'boolean',
        default: true,
        description: 'Log redaction statistics per session',
      },
    },
  },

  async execute(params, context) {
    const dialogues = params.dialogues || context.input?.dialogues;
    if (!Array.isArray(dialogues) || dialogues.length === 0) {
      return createErrorResult('SANITIZE_ERROR', 'Parameter "dialogues" must be a non-empty array', false);
    }

    const patternSet = params.patterns || 'default';
    const logRedactions = params.logRedactions !== false;

    // Select pattern subset
    let activePatterns;
    if (patternSet === 'minimal') {
      activePatterns = SANITIZE_PATTERNS.filter(p =>
        ['anthropic_api_key', 'generic_api_key', 'bearer_token', 'jwt_token'].includes(p.name)
      );
    } else {
      activePatterns = SANITIZE_PATTERNS;
    }

    const globalStats = {
      totalRedactions: 0,
      byCategory: {},
      messagesAffected: 0,
      highRiskFiles: [],
    };

    const sanitizedDialogues = [];

    for (const dialogue of dialogues) {
      const dialogueStats = { totalRedactions: 0, byCategory: {} };
      const localStats = { totalRedactions: 0, byCategory: {} };

      // Deep-copy to avoid mutating input
      const sanitized = JSON.parse(JSON.stringify(dialogue));

      let messagesAffected = 0;
      for (const msg of sanitized.messages) {
        const affected = sanitizeMessage(msg, activePatterns, localStats);
        if (affected) messagesAffected++;
      }

      // Also sanitize title
      sanitized.title = applyPatterns(sanitized.title, activePatterns, localStats);

      sanitized.metadata.sanitized = true;
      sanitized.metadata.redactionCount = localStats.totalRedactions;

      // Merge into global stats
      globalStats.totalRedactions += localStats.totalRedactions;
      globalStats.messagesAffected += messagesAffected;
      for (const [cat, count] of Object.entries(localStats.byCategory)) {
        globalStats.byCategory[cat] = (globalStats.byCategory[cat] || 0) + count;
      }

      if (localStats.totalRedactions > 10) {
        globalStats.highRiskFiles.push(dialogue.metadata.sourceFile || dialogue.sourceId);
      }

      if (logRedactions && localStats.totalRedactions > 0) {
        console.log(`[dialogue.sanitize] ${dialogue.sourceId.slice(0, 8)} — ${localStats.totalRedactions} redactions in ${messagesAffected} messages`);
      }

      sanitizedDialogues.push(sanitized);
    }

    const qualityScore = globalStats.totalRedactions > 0 ? 1.0 : 1.0;

    return createSuccessResult(
      { dialogues: sanitizedDialogues, sanitizationLog: globalStats },
      {
        totalDialogues: sanitizedDialogues.length,
        totalRedactions: globalStats.totalRedactions,
        messagesAffected: globalStats.messagesAffected,
        highRiskFiles: globalStats.highRiskFiles.length,
      },
      qualityScore
    );
  },
});

module.exports = { dialogueSanitizeExecutor };

'use strict';

/**
 * Single source of truth for locating the Claude Code CLI binary.
 *
 * Extracted from the duplicated findClaudeBinary() copies (claude-code-reanalyze,
 * pipeline-advisor, document-ai-extraction, document-index.ai-responder) per
 * CODEX-RULE-073 dedupe. Those call sites may migrate to this util incrementally.
 *
 * @module utils/claude-binary
 */

const path = require('path');
const fs = require('fs');

let _cached;

/**
 * Resolve the Claude Code CLI binary path.
 * Order: CLAUDE_CODE_PATH env → installed @anthropic-ai/claude-code package bin →
 * Windows AnthropicClaude install → bare `claude` on PATH.
 * @param {boolean} [throwIfMissing=true]
 * @returns {string|null}
 */
function findClaudeBinary(throwIfMissing = true) {
  if (_cached) return _cached;

  const binName = process.platform === 'win32' ? 'claude.exe' : 'claude';

  let pkgBin = null;
  try {
    const pkgJson = require.resolve('@anthropic-ai/claude-code/package.json');
    pkgBin = path.join(path.dirname(pkgJson), 'bin', binName);
  } catch { /* package not resolvable from here */ }

  const candidates = [
    process.env.CLAUDE_CODE_PATH,
    pkgBin,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', binName)
      : null,
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) { _cached = p; return p; } } catch { /* skip */ }
  }

  // Bare command on PATH — last resort, not existence-checked.
  if (process.env.CLAUDE_CODE_ON_PATH !== 'false') {
    _cached = 'claude';
    return _cached;
  }

  if (throwIfMissing) {
    throw new Error('claude binary not found. Install @anthropic-ai/claude-code or set CLAUDE_CODE_PATH.');
  }
  return null;
}

/** Test seam: reset the memoized path. */
function _reset() { _cached = undefined; }

module.exports = { findClaudeBinary, _reset };

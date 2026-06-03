'use strict';

/**
 * Dialogue Transcript Builder
 *
 * Two modes for LLM analysis:
 *
 *   buildGoalsTranscript   — text blocks from ALL participants (user + Claude Code + Claude Chat),
 *                            no tool call outputs, sampled across beginning/middle/end of session.
 *                            Goals/tasks can be formulated by any participant, not just the user.
 *
 *   buildSmartTranscript   — text blocks + compact tool markers (1 line each, no outputs),
 *                            sampled. Used for entities/decisions extraction where action
 *                            context (what files changed, what commands ran) matters.
 */

const GOALS_TRANSCRIPT_CHARS  = 40_000;
const SMART_TRANSCRIPT_CHARS  = 60_000;
const MAX_TEXT_BLOCK_CHARS    = 3_000;   // cap per individual text block to prevent dominance

// ── Input normalisation ────────────────────────────────────────────────────────
// Accepts both normalizer messages ({ participant, text, toolUse }) and
// merged-route messages ({ participant, content, timestamp }).

function _toTextEntry(m) {
  const role = m.participant || m.role || 'unknown';
  // normalizer produces m.text; merged route produces m.content
  const raw  = typeof m.text    === 'string' ? m.text
             : typeof m.content === 'string' ? m.content
             : '';
  return { role, text: raw.trim(), toolUse: m.toolUse || [] };
}

// ── Tool summary (1 compact line, no output) ───────────────────────────────────

function _toolSummary(t) {
  const name = t.name || 'tool';
  const inp  = t.input || {};
  if (name === 'Read' || name === 'Edit' || name === 'Write') {
    const fp  = String(inp.file_path || '');
    const base = fp.replace(/\\/g, '/').split('/').pop();
    return `[${name}: ${base}]`;
  }
  if (name === 'Bash' || name === 'PowerShell') {
    const cmd = String(inp.command || inp.description || '').slice(0, 80);
    return `[${name}: ${cmd}]`;
  }
  if (name === 'Grep') return `[Grep: ${String(inp.pattern || '').slice(0, 60)}]`;
  if (name === 'Glob') return `[Glob: ${String(inp.pattern || '').slice(0, 60)}]`;
  if (name === 'Agent') return `[Agent: ${String(inp.description || '').slice(0, 60)}]`;
  if (name === 'TodoWrite') return null; // skip task-tracking noise
  return `[${name}]`;
}

// ── Sampled transcript core ────────────────────────────────────────────────────
// Splits messages into 3 temporal zones: beginning 40% / middle 20% / end 40%.
// Preserves order within each zone. Falls back to full text when small enough.

function _sampledTranscript(entries, totalChars) {
  if (entries.length === 0) return '';

  const lines = entries.map(e => `${e.role}: ${e.text}`);
  const full  = lines.join('\n\n');
  if (full.length <= totalChars) return full;

  const n = entries.length;
  const b = Math.floor(n * 0.40);
  const m = Math.floor(n * 0.60);

  const zones = [
    { label: 'BEGINNING', msgs: entries.slice(0, b)    },
    { label: 'MIDDLE',    msgs: entries.slice(b, m)    },
    { label: 'END',       msgs: entries.slice(m)       },
  ];
  const budgets = [
    Math.floor(totalChars * 0.40),
    Math.floor(totalChars * 0.20),
    totalChars - Math.floor(totalChars * 0.40) - Math.floor(totalChars * 0.20),
  ];

  return zones
    .map(({ label, msgs }, i) => {
      if (msgs.length === 0) return null;
      const zoneText = msgs.map(e => `${e.role}: ${e.text}`).join('\n\n');
      const budget   = budgets[i];
      return `[${label}]\n${zoneText.length > budget ? zoneText.slice(0, budget) + '\n…' : zoneText}`;
    })
    .filter(Boolean)
    .join('\n\n');
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build a goals-focused transcript.
 * Keeps text blocks from ALL participants (user, ClaudeCode, ClaudeChat).
 * Drops all tool_use / tool_result content — goals and task statements live in
 * the conversational text, not in shell output or file contents.
 * Applies uniform B+M+E sampling so the model sees the full arc: what was
 * requested at the start, the progression in the middle, and the outcome at the end.
 *
 * @param {Array}  messages   - normalizer messages or merged-route messages
 * @param {number} totalChars - character budget (default 40k ≈ 10k tokens)
 * @returns {string}
 */
function buildGoalsTranscript(messages, totalChars = GOALS_TRANSCRIPT_CHARS) {
  const entries = messages
    .map(_toTextEntry)
    .filter(e => e.text.length > 0)
    .map(e => ({ ...e, text: e.text.slice(0, MAX_TEXT_BLOCK_CHARS) }));

  return _sampledTranscript(entries, totalChars);
}

/**
 * Build a smart transcript for reanalyze (entities + decisions extraction).
 * Keeps text + compact 1-line tool markers (no outputs).
 * This lets the model understand WHAT actions were taken (edited which files,
 * ran which commands) without the bulk of tool result content.
 *
 * @param {Array}  messages   - normalizer messages (must include .toolUse array)
 * @param {number} totalChars - character budget (default 60k ≈ 15k tokens)
 * @returns {string}
 */
function buildSmartTranscript(messages, totalChars = SMART_TRANSCRIPT_CHARS) {
  const entries = messages
    .map(m => {
      const e      = _toTextEntry(m);
      const tools  = (m.toolUse || []).map(_toolSummary).filter(Boolean);
      const combined = [e.text.slice(0, MAX_TEXT_BLOCK_CHARS), ...tools].filter(Boolean).join('\n');
      return { role: e.role, text: combined };
    })
    .filter(e => e.text.length > 0);

  return _sampledTranscript(entries, totalChars);
}

/**
 * Stats helper — returns coverage info for logging.
 */
function transcriptStats(originalLenOrStr, transcript) {
  const origLen    = typeof originalLenOrStr === 'number' ? originalLenOrStr
                   : typeof originalLenOrStr === 'string' ? originalLenOrStr.length
                   : 0;
  const origTokens = Math.round(origLen / 4);
  const outTokens  = Math.round(transcript.length / 4);
  const pct        = origTokens > 0 ? Math.round((1 - outTokens / origTokens) * 100) : 0;
  return `${origTokens.toLocaleString()}→${outTokens.toLocaleString()} tokens (${pct >= 0 ? pct : 0}% reduction)`;
}

module.exports = { buildGoalsTranscript, buildSmartTranscript, transcriptStats };

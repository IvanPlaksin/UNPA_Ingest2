'use strict';

/**
 * Claude Code CLI Provider.
 *
 * Invokes the locally installed Claude Code CLI (`@anthropic-ai/claude-code`) as an
 * LLM backend via `spawn`. Auth is handled by the local Claude Code installation
 * (subscription/session), so this path does NOT require an ANTHROPIC_API_KEY and is
 * not subject to the Anthropic API credit balance.
 *
 * Reuses findClaudeBinary() from claude-code-reanalyze.service (the existing, working
 * DevDialogue integration) without modifying it.
 *
 * Interface: text-in (stdin) → text-out (final `result` stream-json message).
 *
 * @module services/ai/providers/claude-code.provider
 */

const { spawn } = require('child_process');
const { findClaudeBinary } = require('../../agents/claude-code-reanalyze.service');

const DEFAULT_MODEL = process.env.CLAUDE_CODE_MODEL || 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 90000;

/**
 * Invoke Claude Code CLI for a single text completion (no agent tools, no MCP).
 *
 * @param {Object} params
 * @param {string} [params.systemPrompt]
 * @param {string} params.prompt
 * @param {string} [params.model]
 * @param {number} [params.timeoutMs]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{text: string, cost: number}>}
 */
function invokeClaudeCode({ systemPrompt, prompt, model, timeoutMs, signal } = {}) {
  const binary = findClaudeBinary(); // throws with an actionable message if not installed

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--input-format', 'text',
    '--model', model || DEFAULT_MODEL,
    '--max-turns', '1',          // single completion, no agent loop
    '--no-session-persistence',
    '--verbose',
    '--tools', '',               // disable built-in tools
    '--allowed-tools', '',       // no MCP/allowed tools for pure text→JSON
  ];
  if (systemPrompt) args.push('--system-prompt', systemPrompt);

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      return reject(new Error(`Failed to spawn Claude Code: ${err.message}`));
    }

    let stdoutBuf = '';
    let stderrBuf = '';
    let result = null;
    let cost = 0;
    let settled = false;

    const finish = (fn, val) => { if (!settled) { settled = true; cleanup(); fn(val); } };
    const killProc = () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } };
    const timer = setTimeout(() => { killProc(); finish(reject, new Error('Claude Code timed out')); }, timeoutMs || DEFAULT_TIMEOUT_MS);
    const onAbort = () => { killProc(); finish(reject, new Error('Aborted')); };
    function cleanup() { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); }
    signal?.addEventListener?.('abort', onAbort);

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop(); // keep trailing incomplete line
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'result' && msg.subtype === 'success') {
          result = msg.result || '';
          cost = msg.total_cost_usd || 0;
        } else if (msg.type === 'result') {
          stderrBuf += `\n[result:${msg.subtype}]`;
        }
      }
    });

    proc.stderr.on('data', (d) => { stderrBuf += d.toString('utf8'); });

    proc.on('error', (err) => finish(reject, new Error(`Claude Code spawn error: ${err.message}`)));

    proc.on('close', (code) => {
      if (result !== null) return finish(resolve, { text: result, cost });
      return finish(reject, new Error(`Claude Code exited ${code}: ${stderrBuf.slice(0, 300)}`));
    });

    proc.stdin.write(prompt || '', 'utf8');
    proc.stdin.end();
  });
}

/**
 * Extract a JSON value from free-form model text (multi-level fallback):
 *   1. direct JSON.parse
 *   2. ```json fenced block
 *   3. first {...} object
 *   4. first [...] array
 * @param {string} text
 * @returns {Object|Array|null}
 */
function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;
  const cleaned = text.trim();

  try { return JSON.parse(cleaned); } catch { /* fall through */ }

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    try { return JSON.parse(fenced[1].trim()); } catch { /* fall through */ }
  }

  const obj = cleaned.match(/\{[\s\S]*\}/);
  if (obj) {
    try { return JSON.parse(obj[0]); } catch { /* fall through */ }
  }

  const arr = cleaned.match(/\[[\s\S]*\]/);
  if (arr) {
    try { return JSON.parse(arr[0]); } catch { /* fall through */ }
  }

  return null;
}

module.exports = {
  invokeClaudeCode,
  extractJSON,
  DEFAULT_MODEL,
};

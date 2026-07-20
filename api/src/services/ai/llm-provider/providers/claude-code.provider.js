'use strict';

/**
 * ClaudeCodeProvider — LLMProvider over the local Claude Code CLI (spawn).
 *
 * dev/offline default. Auth via the local Claude Code install (no API key /
 * credit balance). No server-side constrained decoding, so structuredOutput is
 * prompt + retry + ajv-validate.
 *
 * Implements the Contract-4A LLMProvider interface
 * (instances/flowdesk/contracts/llm-provider.types.ts).
 *
 * @module services/ai/llm-provider/providers/claude-code.provider
 */

const { spawn } = require('child_process');
const { findClaudeBinary } = require('../../../../utils/claude-binary');
const { embedViaTei } = require('../embedding');
const { extractJSON, validateSchema, buildStrictJsonSystem } = require('../structured-json');

const DEFAULT_MODEL = process.env.LLM_MODEL || process.env.CLAUDE_CODE_MODEL || 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 90000;

/**
 * Low-level single completion via the CLI. text-in (stdin) → text-out (final
 * stream-json `result`). Kept internal; exposed via completion()/structuredOutput().
 */
function invokeCli({ systemPrompt, prompt, model, timeoutMs, signal, spawnImpl, binaryPath } = {}) {
  const binary = binaryPath || findClaudeBinary();
  const doSpawn = spawnImpl || spawn;

  const args = [
    '--print', '--output-format', 'stream-json', '--input-format', 'text',
    '--model', model || DEFAULT_MODEL,
    '--max-turns', '1', '--no-session-persistence', '--verbose',
    '--tools', '', '--allowed-tools', '',
  ];
  if (systemPrompt) args.push('--system-prompt', systemPrompt);

  return new Promise((resolve, reject) => {
    let proc;
    try { proc = doSpawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); }
    catch (err) { return reject(new Error(`Failed to spawn Claude Code: ${err.message}`)); }

    let stdoutBuf = '', stderrBuf = '', result = null, cost = 0, settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; cleanup(); fn(val); } };
    const killProc = () => { try { proc.kill('SIGTERM'); } catch { /* */ } };
    const timer = setTimeout(() => { killProc(); finish(reject, new Error('Claude Code timed out')); }, timeoutMs || DEFAULT_TIMEOUT_MS);
    const onAbort = () => { killProc(); finish(reject, new Error('Aborted')); };
    function cleanup() { clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); }
    signal?.addEventListener?.('abort', onAbort);

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.type === 'result' && msg.subtype === 'success') {
          result = msg.result || ''; cost = msg.total_cost_usd || 0;
        } else if (msg.type === 'result') { stderrBuf += `\n[result:${msg.subtype}]`; }
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

class ClaudeCodeProvider {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.model]
   * @param {number} [opts.maxRetries=2]
   * @param {Function} [opts.invokeImpl] - test seam: ({systemPrompt,prompt,model,...}) => {text,cost}
   * @param {Function} [opts.embedImpl]  - test seam: (text) => number[]
   * @param {Function} [opts.spawnImpl]  - test seam passed to the default CLI invoker
   * @param {string}   [opts.binaryPath]
   */
  constructor(opts = {}) {
    this.id = 'claude-code';
    this._model = opts.model || DEFAULT_MODEL;
    this._maxRetries = opts.maxRetries ?? 2;
    this._invoke = opts.invokeImpl || ((p) => invokeCli({ ...p, spawnImpl: opts.spawnImpl, binaryPath: opts.binaryPath }));
    this._embed = opts.embedImpl || ((text) => embedViaTei(text));
  }

  async completion(prompt, opts = {}) {
    const { text, cost } = await this._invoke({
      prompt, model: opts.model || this._model,
      timeoutMs: opts.timeoutMs, signal: opts.signal,
    });
    return { text, provider: this.id, tokens: 0, cost };
  }

  async structuredOutput(prompt, schema, opts = {}) {
    const maxAttempts = (opts.maxRetries ?? this._maxRetries) + 1;
    let lastError = 'unknown';
    let totalCost = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const systemPrompt = buildStrictJsonSystem(schema, attempt > 0);
      let text, cost;
      try {
        ({ text, cost } = await this._invoke({
          systemPrompt, prompt, model: opts.model || this._model,
          timeoutMs: opts.timeoutMs, signal: opts.signal,
        }));
      } catch (e) { lastError = e.message; continue; }
      totalCost += cost || 0;

      const data = extractJSON(text);
      if (!data) { lastError = 'no JSON extractable from output'; continue; }
      const { valid, errors } = validateSchema(data, schema);
      if (!valid) { lastError = `schema validation failed: ${errors.join('; ')}`; continue; }
      return { data, raw: text, provider: this.id, tokens: 0, cost: totalCost };
    }
    throw new Error(`[claude-code] structuredOutput failed: ${lastError}`);
  }

  embedding(text) { return this._embed(text); }
}

module.exports = { ClaudeCodeProvider, invokeCli, DEFAULT_MODEL };

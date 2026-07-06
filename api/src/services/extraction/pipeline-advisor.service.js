'use strict';

/**
 * PipelineAdvisorService
 *
 * Diagnostic AI advisor for extraction jobs.
 * Runs a Claude Code subprocess with full job context to analyze extraction
 * performance, MCP call patterns, step timing, and entity quality.
 *
 * Uses the same Claude Code binary as the extractor (no MCP tools, single turn,
 * fast response).
 */

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');

const CLAUDE_BIN = path.resolve(
  __dirname, '..', '..', '..', '..', 'api',
  'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'
);

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Track command usage frequency (in-memory, resets on restart)
const _commandUsage = {};

function recordCommand(cmd) {
  _commandUsage[cmd] = (_commandUsage[cmd] || 0) + 1;
}

function getTopCommands() {
  return Object.entries(_commandUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cmd]) => cmd);
}

// Default commands sorted by intended frequency of use
const DEFAULT_COMMANDS = [
  'Проанализируй эффективность экстракции: оцени длительность каждого шага, найди узкие места и бессмысленные ожидания',
  'Какие MCP-инструменты вызывались в Phase 2? Сколько времени они заняли? Были ли они оптимальны?',
  'Оцени качество извлечённых сущностей: распределение по типам, слоям, уверенность AI',
  'Почему этот шаг занял так много времени? Что можно ускорить?',
  'Найди паттерны ошибок и объясни их причину на основе лога',
  'Сравни фактические результаты с ожидаемыми для документа такого типа',
];

function findClaudeBinary() {
  const candidates = [
    process.env.CLAUDE_CODE_PATH,
    CLAUDE_BIN,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', 'claude.exe')
      : null,
    'claude',
  ].filter(Boolean);
  for (const p of candidates) {
    if (p === 'claude') return p;
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  return null;
}

function fmtMs(ms) {
  if (!ms) return '?';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Build a rich diagnostic context string for the advisor.
 */
async function buildContext(jobData) {
  const mg   = require('../memgraph.service');
  const rv   = jobData.returnvalue || {};
  const stats = rv.stats || {};
  const steps = rv.steps || [];
  const log   = rv.log   || [];
  const pp    = rv.postProcessResults || {};
  const es    = rv.esSync || {};

  const lines = [];

  // ── Job header ──
  lines.push(`=== EXTRACTION JOB DIAGNOSTIC CONTEXT ===`);
  lines.push(`Job ID:    ${jobData.jobId}`);
  lines.push(`Source ID: ${jobData.sourceId}`);
  lines.push(`Status:    ${jobData.status}`);
  lines.push(`Mode:      ${jobData.mode || 'DOCUMENT'}`);
  lines.push(`Attempts:  ${jobData.attemptsMade || 1}`);
  if (jobData.processedOn && jobData.finishedOn) {
    lines.push(`Wall time: ${fmtMs(jobData.finishedOn - jobData.processedOn)}`);
  }

  // ── Document from Memgraph ──
  if (jobData.sourceId) {
    try {
      const rows = await mg.runQuery(
        `MATCH (d:Document {id: $id})
         RETURN d.originalname AS name, d.documentTitle AS title,
                d.unSymbol AS sym, d.documentType AS dtype,
                d.epistemicLayer AS layer, d.storagePath AS path,
                d.status AS status, d.uploadedAt AS uploadedAt`,
        { id: jobData.sourceId }
      );
      if (rows[0]) {
        const d = rows[0];
        lines.push(`\n=== DOCUMENT ===`);
        lines.push(`Name:     ${d.name || '—'}`);
        lines.push(`Title:    ${d.title || '—'}`);
        lines.push(`Symbol:   ${d.sym || '—'}`);
        lines.push(`Type:     ${d.dtype || '—'}`);
        lines.push(`Layer:    ${d.layer || '—'}`);
        lines.push(`Status:   ${d.status || '—'}`);
        lines.push(`Path:     ${d.path || '—'}`);
      }
    } catch { /* non-fatal */ }
  }

  // ── Extraction stats ──
  lines.push(`\n=== EXTRACTION STATISTICS ===`);
  lines.push(`Text chars:      ${(stats.textChars || 0).toLocaleString()}`);
  lines.push(`Chunks:          ${stats.chunksCount || 0}`);
  lines.push(`Entities:        ${stats.entitiesExtracted || 0}`);
  lines.push(`Relations:       ${stats.relationsFound || 0}`);
  lines.push(`Vectors indexed: ${stats.vectorsIndexed || 0}`);
  lines.push(`Vectors attempt: ${stats.vectorsAttempted || 0}`);
  lines.push(`Graph nodes:     ${stats.graphNodesCreated || 0}`);
  lines.push(`Deduplicated:    ${stats.deduplicated || 0}`);
  lines.push(`Pipeline dur:    ${fmtMs(stats.durationMs)}`);
  if (stats.errors && stats.errors.length > 0) {
    lines.push(`Step errors:     ${stats.errors.length}`);
    stats.errors.forEach(e => lines.push(`  ERROR in ${e.step}: ${e.error}`));
  }
  if (jobData.failedReason) {
    lines.push(`\nFAIL REASON: ${jobData.failedReason}`);
  }

  // ── Step timeline ──
  if (steps.length > 0) {
    lines.push(`\n=== STEP TIMELINE ===`);
    lines.push(`Step                   | Status    | Duration  | Result summary`);
    lines.push(`-----------------------|-----------|-----------|-----------------------------------`);
    for (const s of steps) {
      const name = (s.label || s.name || '?').padEnd(22);
      const status = (s.status || '?').padEnd(9);
      const dur = fmtMs(s.duration).padEnd(9);
      let result = '';
      if (s.result) {
        result = Object.entries(s.result)
          .filter(([, v]) => v != null)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
          .slice(0, 60);
      }
      if (s.error) result = `ERROR: ${s.error}`;
      lines.push(`${name} | ${status} | ${dur} | ${result}`);
    }
  }

  // ── Quality metrics ──
  const kqs      = pp.calculateKQSHook?.score;
  const triangle = pp.buildTriangleHook?.edges || {};
  const gaps     = pp.detectGapsHook?.count;
  if (kqs != null || gaps != null) {
    lines.push(`\n=== QUALITY METRICS ===`);
    if (kqs != null) lines.push(`KQS Score: ${kqs.toFixed(3)}`);
    if (pp.calculateKQSHook?.entitiesScored) lines.push(`Entities scored: ${pp.calculateKQSHook.entitiesScored}`);
    const tri = [triangle.governs, triangle.operationalizes, triangle.revealsGapIn].filter(Boolean);
    if (tri.length) lines.push(`Triangle edges: governs=${triangle.governs||0} operationalizes=${triangle.operationalizes||0} revealsGapIn=${triangle.revealsGapIn||0}`);
    if (gaps != null) lines.push(`Gaps detected: ${gaps}`);
  }

  // ── Entity Store sync ──
  if (es.total != null) {
    lines.push(`\n=== ENTITY STORE SYNC ===`);
    lines.push(`Created=${es.created} Linked=${es.linked} Already_synced=${es.skipped} Total=${es.total}`);
    if (es.refsLinked) lines.push(`References linked: ${es.refsLinked}`);
    if (!es.success) lines.push(`SYNC FAILED`);
  }

  // ── Entity type distribution from Memgraph ──
  if (jobData.sourceId) {
    try {
      const typeRows = await mg.runQuery(
        `MATCH (d:Document {id: $id})-[:MENTIONS]->(em:EntityMention)
         RETURN em.type AS type, count(em) AS cnt
         ORDER BY cnt DESC`,
        { id: jobData.sourceId }
      );
      if (typeRows.length > 0) {
        lines.push(`\n=== ENTITY TYPE DISTRIBUTION (Memgraph) ===`);
        typeRows.forEach(r => lines.push(`  ${(r.type || 'null').padEnd(20)} ${r.cnt}`));
      }
    } catch { /* non-fatal */ }
  }

  // ── Full execution log ──
  if (log.length > 0) {
    lines.push(`\n=== EXECUTION LOG (${log.length} entries) ===`);
    log.forEach(entry => {
      const t = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '';
      const lvl = entry.level === 'error' ? 'ERR' : entry.level === 'warn' ? 'WRN' : 'INF';
      lines.push(`[${t}][${lvl}][${entry.step || '?'}] ${entry.message}`);
    });
  }

  // ── Raw Claude Phase 1 output ──
  if (rv.claudeOutput) {
    lines.push(`\n=== CLAUDE CODE RAW OUTPUT (Phase 1, first 8000 chars) ===`);
    lines.push(rv.claudeOutput.slice(0, 8000));
  }

  return lines.join('\n');
}

/**
 * Build the full advisor prompt.
 */
function buildAdvisorPrompt(context, userMessage, history = []) {
  const systemSection = `You are a senior extraction pipeline diagnostic expert for UN document processing systems.

Your role: Analyze Claude Code extraction job performance, identify bottlenecks, evaluate MCP call efficiency,
assess entity quality, and provide actionable recommendations.

You analyze ONE specific extraction job with full context provided below.
Your responses must be in the same language as the user's question (Russian or English).
Be specific and data-driven — reference actual numbers from the context.
Format your analysis with clear sections, use markdown.

Key areas to analyze:
- Step durations: identify which steps are slow and why
- MCP calls in Phase 2 (relationship extraction): count, types, efficiency
- Entity extraction quality: coverage, type distribution, epistemic layer accuracy
- Text handling: chars processed, chunk strategy efficiency
- Error patterns: root causes, not just symptoms
- Optimization opportunities: concrete, actionable suggestions

${context}`;

  const historySection = history.length > 0
    ? `\n=== CONVERSATION HISTORY ===\n` +
      history.map(h => `[${h.role.toUpperCase()}]: ${h.content}`).join('\n\n') +
      `\n\n`
    : '';

  return `${systemSection}

${historySection}=== USER QUESTION ===
${userMessage}

Provide your analysis:`;
}

/**
 * Run the advisor Claude Code instance.
 * Returns { response: string }.
 */
async function runAdvisor(prompt, timeoutMs = 120000) {
  const binary = findClaudeBinary();
  if (!binary) throw new Error('Claude Code binary not found');

  const args = [
    '--print',
    '--output-format', 'stream-json',
    '--input-format',  'text',
    '--model',         'claude-sonnet-4-6',
    '--no-session-persistence',
    '--verbose',
    '--max-turns',     '1',
    '--tools',         '',
    '--strict-mcp-config',
  ];

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(binary, args, {
        env: { ...process.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: os.tmpdir(),
      });
    } catch (err) {
      reject(new Error(`Failed to spawn advisor: ${err.message}`));
      return;
    }

    let stdoutBuf = '';
    let stderr    = '';
    let result    = null;

    proc.stdout.on('data', d => {
      stdoutBuf += d.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'result' && msg.subtype === 'success') {
            result = msg.result || '';
          }
        } catch { /* skip */ }
      }
    });
    proc.stderr.on('data', d => { stderr += d.toString('utf8'); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Advisor timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (result !== null) { resolve(result); return; }
      reject(new Error(`Advisor failed (exit ${code}): ${stderr.slice(0, 400)}`));
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`Spawn error: ${err.message}`));
    });

    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();
  });
}

/**
 * Main entry point: analyze a job and return advisor response.
 */
async function analyzeJob(jobData, userMessage, history = []) {
  recordCommand(userMessage);

  const context = await buildContext(jobData);
  const prompt  = buildAdvisorPrompt(context, userMessage, history);

  const response = await runAdvisor(prompt);
  return { response, contextLength: context.length };
}

/**
 * Returns command suggestions sorted by usage frequency.
 * Top used commands first, followed by defaults not yet in history.
 */
function getSuggestedCommands() {
  const top = getTopCommands();
  const remaining = DEFAULT_COMMANDS.filter(c => !top.includes(c));
  return [...top, ...remaining].slice(0, 8);
}

module.exports = { analyzeJob, getSuggestedCommands, DEFAULT_COMMANDS };

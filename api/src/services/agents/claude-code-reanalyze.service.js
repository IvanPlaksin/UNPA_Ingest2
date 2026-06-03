'use strict';

/**
 * claude-code-reanalyze.service
 *
 * Runs a Claude Code CLI subprocess (`-p --output-format stream-json`) to perform
 * structured re-analysis of a dialogue session transcript.
 *
 * Returns a parsed analysis object { summary, goals, decisions, entities, overallProgress }.
 * The caller (dialogue.route.js) is responsible for persisting the result.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── Binary resolution ─────────────────────────────────────────────────────────

function findClaudeBinary() {
  const candidates = [
    process.env.CLAUDE_CODE_PATH,
    path.resolve(__dirname, '../../../node_modules/@anthropic-ai/claude-code/bin/claude.exe'),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', 'claude.exe')
      : null,
    'claude',
  ].filter(Boolean);

  for (const p of candidates) {
    if (p === 'claude') return p;
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  throw new Error(
    'claude binary not found. Install @anthropic-ai/claude-code or set CLAUDE_CODE_PATH env var.'
  );
}

// ── MCP config ────────────────────────────────────────────────────────────────

function buildMcpConfig() {
  const mcpServerPath = process.env.MCP_SERVER_PATH
    || path.resolve(__dirname, '../../../../../MCP_CLAUDE/mcp-server/dist/index.js');

  return {
    mcpServers: {
      'project-knowledge': {
        type: 'stdio',
        command: 'node',
        args: [mcpServerPath],
        env: {
          NEO4J_URI:      process.env.NEO4J_URI      || process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
          NEO4J_USERNAME: process.env.NEO4J_USERNAME || process.env.MEMGRAPH_USER || 'memgraph',
          NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || process.env.MEMGRAPH_PASSWORD || 'secret_password_123',
          QDRANT_URL:     process.env.QDRANT_URL     || 'http://localhost:6333',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
          API_BASE_URL:   process.env.API_BASE_URL   || `http://localhost:${process.env.PORT || 3010}`,
        },
      },
    },
  };
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software architect analyzing development dialogue sessions for UNPA DevDialogue Collector — an AI-powered institutional knowledge management system. Extract structured information precisely and return ONLY valid JSON.`;

function buildAnalysisPrompt(sessionId, transcript) {
  return `Analyze this development session and return a single JSON object — no markdown, no explanation.

Session ID: ${sessionId}

TRANSCRIPT:
${transcript}

Return ONLY this JSON structure:
{
  "summary": "150-200 word summary: what was discussed, decided, and implemented",
  "overallProgress": "complete|in_progress|blocked|early",
  "goals": [
    { "title": "short goal title", "description": "what the goal is", "status": "achieved|in_progress|blocked|abandoned", "confidence": 0.8 }
  ],
  "decisions": [
    {
      "title": "short title (5-10 words)",
      "context": "why this decision was needed (1-2 sentences)",
      "decision": "what was decided (1-2 sentences)",
      "rationale": "why this option was chosen (1-2 sentences)",
      "alternatives": ["rejected option 1"],
      "consequences": ["implication or tradeoff"],
      "category": "architecture|technology|pattern|convention|rejection",
      "confidence": 0.85
    }
  ],
  "entities": [
    { "name": "React", "type": "technology|component|concept|decision", "confidence": 0.9 }
  ]
}`;
}

// ── Decision ID helper (mirrors dialogue.extract_decisions) ───────────────────

function makeDecisionId(sessionId, segmentId, title) {
  return 'adr_' + crypto.createHash('md5')
    .update(sessionId + ':' + segmentId + ':' + title)
    .digest('hex')
    .slice(0, 12);
}

// ── Stream message handler ────────────────────────────────────────────────────

function parseAnalysisFromResult(raw) {
  if (!raw) return null;
  const cleaned = raw.trim();
  // Try JSON directly
  try { return JSON.parse(cleaned); } catch { /* fall through */ }
  // Try extracting from markdown code block
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
  }
  // Try finding a JSON object in the text
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* fall through */ }
  }
  return null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Run Claude Code CLI to analyze a dialogue session transcript.
 *
 * @param {string} sessionId
 * @param {string} transcript  — pre-fetched merged session transcript
 * @param {object} opts
 * @param {Function} [opts.emit]   — (step, total, label, status, detail?) => void
 * @param {string}   [opts.model]  — Claude model name (default: claude-sonnet-4-6)
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ success: boolean, analysis: object|null, rawResult: string, cost?: number }>}
 */
async function reanalyzeWithClaudeCode(sessionId, transcript, { emit = () => {}, model, signal } = {}) {
  const binary   = findClaudeBinary();
  const mcpCfg   = buildMcpConfig();
  const prompt   = buildAnalysisPrompt(sessionId, transcript.slice(0, 14000));
  const useModel = model || process.env.SUMMARY_MODEL || 'claude-sonnet-4-6';

  const ALLOWED_MCP_TOOLS = [
    'mcp__project-knowledge__query_knowledge_graph',
    'mcp__project-knowledge__search_knowledge',
    'mcp__project-knowledge__find_related',
  ].join(',');

  const args = [
    '--print',
    '--output-format',  'stream-json',
    '--input-format',   'text',
    '--system-prompt',  SYSTEM_PROMPT,
    '--mcp-config',     JSON.stringify(mcpCfg),
    '--tools',          '',            // disable all built-in tools
    '--allowed-tools',  ALLOWED_MCP_TOOLS,
    '--model',          useModel,
    '--no-session-persistence',
    '--verbose',
    '--max-turns',      '8',
    '--max-budget-usd', '1.00',
  ];

  emit(1, 5, 'Starting Claude Code agent…', 'running');
  console.log(`[CCReanalyze] ${sessionId.slice(0, 8)}: binary=${binary}, model=${useModel}`);

  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(binary, args, {
        env: { ...process.env },
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      return reject(new Error(`Failed to spawn claude: ${err.message}`));
    }

    const killProc = () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } };
    signal?.addEventListener('abort', killProc);
    const timeout = setTimeout(killProc, 3 * 60 * 1000);

    // Write prompt to stdin
    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();

    let stdoutBuf = '';
    let stderrBuf = '';
    let step = 1;
    let finalResult = null;
    let hasError    = false;

    proc.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop();                // keep trailing incomplete line
      for (const line of lines) {
        if (!line.trim()) continue;
        try { handleStreamMessage(JSON.parse(line)); } catch { /* skip malformed */ }
      }
    });

    proc.stderr.on('data', (d) => { stderrBuf += d.toString('utf8'); });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', killProc);
      reject(new Error(`Claude Code spawn error: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', killProc);

      if (finalResult) return resolve(finalResult);
      if (hasError)    return reject(new Error(`Claude Code agent error: ${stderrBuf.slice(0, 300)}`));
      reject(new Error(`Claude Code exited ${code}: ${stderrBuf.slice(0, 200)}`));
    });

    // ── Stream event handler ──────────────────────────────────────────────────

    function handleStreamMessage(msg) {
      switch (msg.type) {

        case 'system':
          if (msg.subtype === 'init') {
            const n = msg.tools?.length || 0;
            emit(1, 5, `Claude Code initialized · ${n} tools available`, 'running');
          }
          break;

        case 'assistant': {
          const content = msg.message?.content || [];
          for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
              step = Math.min(step + 1, 4);
              const text = block.text.trim();
              // If this looks like the JSON output, show a clean label instead of raw JSON
              const isJson = text.startsWith('{') || text.startsWith('```');
              const label = isJson
                ? 'Writing analysis result…'
                : text.slice(0, 80) + (text.length > 80 ? '…' : '');
              emit(step, 5, label, 'running');
            } else if (block.type === 'tool_use') {
              step = Math.min(step + 1, 4);
              emit(step, 5, `→ ${block.name}`, 'running');
            }
          }
          break;
        }

        case 'result':
          if (msg.subtype === 'success') {
            const raw      = msg.result || '';
            const analysis = parseAnalysisFromResult(raw);
            const goalCnt  = analysis?.goals?.length     || 0;
            const decCnt   = analysis?.decisions?.length || 0;
            const entCnt   = analysis?.entities?.length  || 0;
            emit(5, 5, 'Claude Code analysis complete', 'done',
              `${goalCnt} goals · ${decCnt} decisions · ${entCnt} entities · cost $${(msg.total_cost_usd || 0).toFixed(3)}`
            );
            console.log(`[CCReanalyze] ${sessionId.slice(0, 8)}: done goals=${goalCnt} dec=${decCnt} ent=${entCnt} cost=$${msg.total_cost_usd?.toFixed(3)}`);
            finalResult = { success: true, analysis, rawResult: raw, cost: msg.total_cost_usd };
          } else {
            hasError = true;
            emit(5, 5, `Analysis failed: ${msg.subtype}`, 'error');
            console.error(`[CCReanalyze] ${sessionId.slice(0, 8)}: error subtype=${msg.subtype}`, stderrBuf.slice(0, 200));
          }
          break;
      }
    }
  });
}

// ── Persist analysis to Memgraph ──────────────────────────────────────────────

/**
 * Store the Claude Code analysis result in Memgraph.
 * Mirrors the storage logic of the individual executor pipeline.
 */
async function persistAnalysis(sessionId, analysis) {
  if (!analysis) return;

  let mg;
  try { mg = require('../memgraph.service'); } catch (e) {
    console.warn('[CCReanalyze] Memgraph unavailable:', e.message);
    return;
  }

  const now = new Date().toISOString();

  // Session summary + metadata
  if (analysis.summary) {
    await mg.runQuery(
      `MATCH (s:DialogueSession {sessionId: $sid})
       SET s.summary = $summary, s.lastReanalyzedAt = $ts, s.goalsProgress = $progress`,
      { sid: sessionId, summary: analysis.summary, ts: now, progress: analysis.overallProgress || 'unknown' }
    ).catch(e => console.warn('[CCReanalyze] summary store:', e.message));
  }

  // Entities
  if (analysis.entities?.length) {
    await mg.runQuery(
      'MATCH (s:DialogueSession {sessionId: $sid}) SET s.entities = $ent',
      { sid: sessionId, ent: JSON.stringify(analysis.entities) }
    ).catch(e => console.warn('[CCReanalyze] entities store:', e.message));
  }

  // Goals
  if (analysis.goals?.length) {
    await mg.runQuery(
      'MATCH (s:DialogueSession {sessionId: $sid}) SET s.goals = $goals',
      { sid: sessionId, goals: JSON.stringify(analysis.goals) }
    ).catch(e => console.warn('[CCReanalyze] goals store:', e.message));
  }

  // Decisions
  for (const dec of (analysis.decisions || [])) {
    if (!dec.title) continue;
    const decisionId = makeDecisionId(sessionId, 'cc-session', dec.title);
    const status     = (dec.confidence ?? 0) >= 0.7 ? 'accepted' : 'proposed';
    await mg.runQuery(
      `MERGE (d:ArchDecision {decisionId: $did})
       ON CREATE SET d.title=$title, d.context=$ctx, d.decision=$dec, d.rationale=$rat,
         d.alternatives=$alt, d.consequences=$cons, d.category=$cat,
         d.confidence=$conf, d.status=$status, d.sessionId=$sid,
         d.segmentId='cc-analysis', d.namespace='DIALOGUE', d.createdAt=$ts
       ON MATCH SET d.confidence=$conf, d.status=$status`,
      {
        did: decisionId, title: dec.title || '', ctx: dec.context || '',
        dec: dec.decision || '', rat: dec.rationale || '',
        alt: JSON.stringify(dec.alternatives || []),
        cons: JSON.stringify(dec.consequences || []),
        cat: dec.category || 'architecture',
        conf: dec.confidence ?? 0.5, status, sid: sessionId, ts: now,
      }
    ).catch(e => console.warn('[CCReanalyze] decision store:', e.message));

    await mg.runQuery(
      `MATCH (d:ArchDecision {decisionId: $did}), (s:DialogueSession {sessionId: $sid})
       MERGE (d)-[:DECIDED_IN_SESSION]->(s)`,
      { did: decisionId, sid: sessionId }
    ).catch(() => { /* non-fatal */ });
  }

  console.log(`[CCReanalyze] persisted: session=${sessionId.slice(0, 8)} goals=${analysis.goals?.length || 0} decisions=${analysis.decisions?.length || 0} entities=${analysis.entities?.length || 0}`);
}

module.exports = { reanalyzeWithClaudeCode, persistAnalysis, findClaudeBinary, makeDecisionId };

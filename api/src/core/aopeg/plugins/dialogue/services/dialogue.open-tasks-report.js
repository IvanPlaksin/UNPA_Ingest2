'use strict';

/**
 * DevCollector Open-Tasks Report
 *
 * Loads all DialogueSession nodes that have un-finished goals, builds a
 * compact text representation, calls an LLM to rank and cross-relate the
 * tasks, then persists the result as a DevCollectorReport node in Memgraph
 * (namespace CORE, section DevCollector).
 */

const MAX_FORMATTED_CHARS = 60_000;
const MAX_SESSIONS        = 100;
const OPEN_STATUSES       = new Set(['in_progress', 'pending', 'blocked']);

// ── LLM prompt ────────────────────────────────────────────────────────────────

const PROMPT = (text) => `You are a senior software architect reviewing an open development task backlog.

Below are all open / incomplete tasks from multiple development sessions.
Your task:
1. Read every task carefully.
2. Identify dependencies (task B requires task A to be done first).
3. Rank ALL tasks by priority — considering importance, urgency, and dependencies.
4. Write a concise overall summary (2-4 sentences) covering: key themes, critical blockers, and recommended focus areas.

For EACH task in the ranked list output:
- rank           : integer starting at 1 (1 = highest priority)
- title          : concise task title (keep original wording)
- description    : what needs to be done — plain language, 1-2 sentences
- importance     : why this task matters to the project (1 sentence)
- order_rationale: why at this rank; mention blocking/enabling dependencies if relevant
- dependencies   : array of other task titles that THIS task depends on (empty [] if none)
- sessionId      : exact session ID string (copy from input)
- sessionTitle   : session title string
- category       : one of "bug_fix" | "feature" | "task" | "research" | "decision" | "analysis"
- status         : one of "in_progress" | "pending" | "blocked"

Return ONLY valid JSON — no markdown fences, no extra text:
{
  "summary": "...",
  "tasks": [
    {
      "rank": 1, "title": "...", "description": "...", "importance": "...",
      "order_rationale": "...", "dependencies": [], "sessionId": "...",
      "sessionTitle": "...", "category": "task", "status": "in_progress"
    }
  ]
}

Sessions and open tasks:
${text}

JSON:`;

// ── LLM call ──────────────────────────────────────────────────────────────────

async function _callLLM(llmService, formattedText, model) {
  let raw = '';
  try {
    const result = await llmService.chat(
      [{ role: 'user', content: PROMPT(formattedText) }],
      { model, maxTokens: 6000 }
    );
    const rawContent = result.content;
    raw = (Array.isArray(rawContent)
      ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
      : (rawContent || '')).trim();

    const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
    const jsonStr = fence ? fence[1].trim() : raw;
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      tasks:   Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch (err) {
    const msg = err.message || '';
    // Distinguish API-level errors from JSON parse errors
    if (msg.includes('credit balance') || msg.includes('insufficient_quota')) {
      console.warn(`[OpenTasksReport] LLM quota exhausted: ${msg}`);
      throw Object.assign(new Error('LLM_QUOTA_EXHAUSTED'), { apiMessage: msg });
    }
    if (msg.includes('401') || msg.includes('authentication')) {
      console.warn(`[OpenTasksReport] LLM auth error: ${msg}`);
      throw Object.assign(new Error('LLM_AUTH_ERROR'), { apiMessage: msg });
    }
    console.warn(`[OpenTasksReport] LLM parse error: ${msg} | raw[:300]=${raw.slice(0, 300)}`);
    return null;
  }
}

// ── Input formatter ───────────────────────────────────────────────────────────

function _formatSessions(sessions) {
  const blocks = [];
  let chars    = 0;
  let sessUsed = 0;

  for (const s of sessions.slice(0, MAX_SESSIONS)) {
    const open = s._openGoals;
    if (!open?.length) continue;

    const date  = s.startedAt ? new Date(s.startedAt).toISOString().split('T')[0] : 'unknown';
    const lines = [
      `[SESSION: "${s.title || 'Untitled'}" | Date: ${date} | ID: ${s.sessionId}]`,
      ...open.map((g, i) =>
        `${i + 1}. [${g.category || 'task'}] "${g.title}" — ${(g.description || '').slice(0, 200)}`
      ),
      '',
    ];
    const block = lines.join('\n');
    if (chars + block.length > MAX_FORMATTED_CHARS) break;
    blocks.push(block);
    chars += block.length;
    sessUsed++;
  }

  return { text: blocks.join('\n'), sessUsed };
}

// ── Memgraph persistence ──────────────────────────────────────────────────────

async function saveReport(report, model, analyzedAt) {
  const mg = require('../../../../../services/memgraph.service');
  await mg.runQuery(
    `MERGE (r:DevCollectorReport {reportId: 'open-tasks-v1'})
     SET r.namespace      = 'CORE',
         r.section        = 'DevCollector',
         r.summary        = $summary,
         r.rankedTasks    = $rankedTasks,
         r.model          = $model,
         r.analyzedAt     = $analyzedAt,
         r.sessionCount   = $sessionCount,
         r.openTaskCount  = $openTaskCount`,
    {
      summary:       report.summary,
      rankedTasks:   JSON.stringify(report.tasks),
      model,
      analyzedAt,
      sessionCount:  report.sessionCount,
      openTaskCount: report.openTaskCount,
    }
  );
}

async function loadReport() {
  const mg = require('../../../../../services/memgraph.service');
  const rows = await mg.runQuery(
    `MATCH (r:DevCollectorReport {reportId: 'open-tasks-v1'})
     RETURN r.summary       AS summary,
            r.rankedTasks   AS rankedTasks,
            r.model         AS model,
            r.analyzedAt    AS analyzedAt,
            r.sessionCount  AS sessionCount,
            r.openTaskCount AS openTaskCount`,
    {}
  );
  if (!rows[0]) return null;
  const row = rows[0];
  try {
    return {
      summary:       row.summary        || '',
      tasks:         JSON.parse(row.rankedTasks || '[]'),
      model:         row.model          || '',
      analyzedAt:    row.analyzedAt     || null,
      sessionCount:  row.sessionCount   || 0,
      openTaskCount: row.openTaskCount  || 0,
    };
  } catch {
    return null;
  }
}

// ── Shared data loader (used by both LLM and Claude Code paths) ───────────────

async function loadOpenTaskSessions() {
  const mg = require('../../../../../services/memgraph.service');
  const rows = await mg.runQuery(
    `MATCH (s:DialogueSession)
     WHERE s.goals IS NOT NULL AND s.goalsProgress <> 'complete'
     RETURN s.sessionId AS sessionId,
            s.title     AS title,
            s.startedAt AS startedAt,
            s.goals     AS goals
     ORDER BY s.startedAt DESC
     LIMIT 100`,
    {}
  );

  const sessions = [];
  for (const row of rows) {
    try {
      const goals     = JSON.parse(row.goals || '[]');
      const openGoals = goals.filter(g => OPEN_STATUSES.has(g.status));
      if (openGoals.length) {
        sessions.push({ sessionId: row.sessionId, title: row.title, startedAt: row.startedAt, _openGoals: openGoals });
      }
    } catch { /* skip */ }
  }
  return sessions;
}

async function prepareAnalysisData() {
  const sessions  = await loadOpenTaskSessions();
  const totalOpen = sessions.reduce((n, s) => n + s._openGoals.length, 0);
  console.log(`[OpenTasksReport] found ${sessions.length} sessions with ${totalOpen} open tasks`);
  if (!sessions.length) return { text: '', sessUsed: 0, sessionCount: 0, openTaskCount: 0, empty: true };
  const { text, sessUsed } = _formatSessions(sessions);
  return { text, sessUsed, sessionCount: sessUsed, openTaskCount: totalOpen, empty: false };
}

async function savePendingRequest(text, sessionCount, openTaskCount) {
  const mg = require('../../../../../services/memgraph.service');
  await mg.runQuery(
    `MERGE (r:DevCollectorAnalysisRequest {requestId: 'current'})
     SET r.status        = 'pending',
         r.formattedData = $text,
         r.sessionCount  = $sessionCount,
         r.openTaskCount = $openTaskCount,
         r.createdAt     = $createdAt`,
    { text, sessionCount, openTaskCount, createdAt: new Date().toISOString() }
  );
}

async function loadPendingRequest() {
  const mg = require('../../../../../services/memgraph.service');
  const rows = await mg.runQuery(
    `MATCH (r:DevCollectorAnalysisRequest {requestId: 'current'})
     RETURN r.status AS status, r.formattedData AS formattedData,
            r.sessionCount AS sessionCount, r.openTaskCount AS openTaskCount,
            r.createdAt AS createdAt`,
    {}
  );
  return rows[0] || null;
}

async function markRequestDone() {
  const mg = require('../../../../../services/memgraph.service');
  await mg.runQuery(
    `MATCH (r:DevCollectorAnalysisRequest {requestId: 'current'}) SET r.status = 'done'`,
    {}
  );
}

// ── Main analysis pipeline ────────────────────────────────────────────────────

async function runOpenTasksAnalysis(model = 'claude-sonnet-4-6') {
  const { getInstance: getLLMProvider } = require('../../../../../services/llm/LLMProviderService');
  const llmService = getLLMProvider();

  const prepared = await prepareAnalysisData();

  if (prepared.empty) {
    return { summary: 'No open tasks found across all analyzed sessions.', tasks: [], sessionCount: 0, openTaskCount: 0 };
  }

  const { text, sessUsed, openTaskCount } = prepared;
  const extracted = await _callLLM(llmService, text, model);

  if (!extracted) {
    return {
      summary:       'LLM analysis failed — no parseable output returned.',
      tasks:         [],
      sessionCount:  sessUsed,
      openTaskCount: openTaskCount,
    };
  }

  const validCategories = new Set(['bug_fix', 'feature', 'task', 'research', 'decision', 'analysis']);
  const validStatuses   = new Set(['in_progress', 'pending', 'blocked']);

  const tasks = extracted.tasks.map((t, i) => ({
    rank:            t.rank            || i + 1,
    title:           t.title           || '',
    description:     t.description     || '',
    importance:      t.importance      || '',
    order_rationale: t.order_rationale || '',
    dependencies:    Array.isArray(t.dependencies) ? t.dependencies : [],
    sessionId:       t.sessionId       || '',
    sessionTitle:    t.sessionTitle    || '',
    category:        validCategories.has(t.category) ? t.category : 'task',
    status:          validStatuses.has(t.status) ? t.status : 'in_progress',
  }));

  return {
    summary:       extracted.summary,
    tasks,
    sessionCount:  sessUsed,
    openTaskCount: totalOpen,
  };
}

module.exports = { runOpenTasksAnalysis, saveReport, loadReport, prepareAnalysisData, savePendingRequest, loadPendingRequest, markRequestDone };

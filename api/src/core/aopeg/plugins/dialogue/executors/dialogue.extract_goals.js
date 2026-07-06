'use strict';

const crypto = require('crypto');
const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

// ── LLM prompt ────────────────────────────────────────────────────────────────

const GOALS_PROMPT = (text) => `You are analyzing a software development dialogue to extract goals and track their completion.

Extract ALL goals/objectives that were set or worked on during this dialogue.
For each goal provide:
- title: concise title (5-10 words)
- description: what was being done (1-2 sentences)
- status: exactly one of: "achieved" | "in_progress" | "pending" | "blocked"
  - "achieved": fully completed and confirmed in the dialogue
  - "in_progress": work started but not yet finished by dialogue end
  - "pending": explicitly waiting for user action, approval, or external response
  - "blocked": explicitly blocked by an obstacle mentioned in the dialogue
- evidence: one sentence explaining how you determined this status
- category: one of: "feature" | "bug_fix" | "research" | "decision" | "task" | "analysis"

Also provide:
- overallProgress: "complete" (all goals achieved) | "partial" (mix of done and open) | "not_started" (nothing done yet)
- pendingActions: array of specific actions still awaiting user or external parties (empty array if none)
- summary: one sentence describing the session's main achievement or outcome

Return ONLY valid JSON — no markdown, no commentary:
{
  "goals": [
    {"title":"...","description":"...","status":"achieved","evidence":"...","category":"task"}
  ],
  "overallProgress": "partial",
  "pendingActions": ["..."],
  "summary": "..."
}

Dialogue (truncated to fit context):
${text}

JSON:`;

// ── LLM call ──────────────────────────────────────────────────────────────────

async function extractGoalsWithLLM(llmService, text, model) {
  let raw = '';
  try {
    const result = await llmService.chat(
      [{ role: 'user', content: GOALS_PROMPT(text) }],
      { model, maxTokens: 3000, caller: 'aopeg_dialogue' }
    );
    const rawContent = result.content;
    raw = (Array.isArray(rawContent)
      ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
      : (rawContent || '')).trim();

    // Strip markdown code fences if present
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/s);
    const jsonStr   = jsonMatch ? jsonMatch[1].trim() : raw;

    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      goals:           Array.isArray(parsed.goals) ? parsed.goals : [],
      overallProgress: parsed.overallProgress || 'partial',
      pendingActions:  Array.isArray(parsed.pendingActions) ? parsed.pendingActions : [],
      summary:         parsed.summary || '',
    };
  } catch (err) {
    console.warn(`[GoalExtract] LLM parse error: ${err.message} | raw[:200]=${raw.slice(0, 200)}`);
    return null;
  }
}

// ── Stable goal ID ────────────────────────────────────────────────────────────

function makeGoalId(sessionId, title) {
  return 'goal_' + crypto.createHash('md5')
    .update(sessionId + ':' + (title || ''))
    .digest('hex')
    .slice(0, 12);
}

// ── Executor ──────────────────────────────────────────────────────────────────

const dialogueExtractGoalsExecutor = createSimpleExecutor({
  type: 'dialogue.extract_goals',
  displayName: 'Goal Extraction',
  description: 'Extract dialogue goals and their achievement status using LLM; stores results on DialogueSession node',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId:  { type: 'string' },
      mergedText: { type: 'string', description: 'Pre-built merged transcript (skips Memgraph load)' },
      model:      { type: 'string', default: 'claude-sonnet-4-6' },
    },
  },

  async execute(params) {
    const { sessionId } = params;
    const model = params.model || process.env.SUMMARY_MODEL || 'claude-sonnet-4-6';

    if (!sessionId) return createErrorResult('GOALS_ERROR', 'Provide "sessionId"', false);

    let memgraphService;
    try { memgraphService = require('../../../../../services/memgraph.service'); } catch (e) {
      return createErrorResult('GOALS_ERROR', `MemgraphService unavailable: ${e.message}`, true);
    }

    let llmService = null;
    try {
      const { getInstance: getLLMProvider } = require('../../../../../services/llm/LLMProviderService');
      llmService = getLLMProvider();
    } catch {
      return createErrorResult('GOALS_ERROR', 'LLM service unavailable', false);
    }

    // ── Load text ─────────────────────────────────────────────────────────────
    let sourceText = params.mergedText || '';

    if (!sourceText && sessionId) {
      try {
        const sessRows = await memgraphService.runQuery(
          'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.sourceFile AS sf, s.summary AS summary',
          { sid: sessionId }
        );
        const row = sessRows[0] || {};
        if (row.sf) {
          const { dialogueNormalizer }   = require('../services/dialogue.normalizer');
          const { buildGoalsTranscript, transcriptStats } = require('../services/dialogue.transcript-builder');
          const dialogue = dialogueNormalizer.parseClaudeCodeSession(row.sf);
          if (dialogue?.messages?.length) {
            const rawJoin = dialogue.messages
              .map(m => `${m.participant || m.role}: ${typeof m.text === 'string' ? m.text : (m.text?.[0]?.text || '')}`)
              .join('\n');
            sourceText = buildGoalsTranscript(dialogue.messages);
            console.log(`[GoalExtract] transcript built: ${transcriptStats(rawJoin, sourceText)}`);
          }
        }
        if (!sourceText && row.summary) sourceText = row.summary;
      } catch (err) {
        return createErrorResult('GOALS_ERROR', `Failed to load session: ${err.message}`, false);
      }
    }

    if (!sourceText.trim()) {
      return createSuccessResult({ goals: [], overallProgress: 'not_started', pendingActions: [], summary: '', goalsFound: 0 });
    }

    // ── LLM extraction ────────────────────────────────────────────────────────
    const extracted = await extractGoalsWithLLM(llmService, sourceText, model);
    if (!extracted) {
      return createSuccessResult({ goals: [], overallProgress: 'not_started', pendingActions: [], summary: '', goalsFound: 0 });
    }

    // Attach stable IDs
    const goals = extracted.goals.map(g => ({
      ...g,
      goalId:   makeGoalId(sessionId, g.title),
      status:   ['achieved', 'in_progress', 'pending', 'blocked'].includes(g.status) ? g.status : 'in_progress',
      category: ['feature', 'bug_fix', 'research', 'decision', 'task', 'analysis'].includes(g.category) ? g.category : 'task',
    }));

    const now = new Date().toISOString();

    // ── Store in Memgraph ─────────────────────────────────────────────────────
    try {
      await memgraphService.runQuery(
        `MATCH (s:DialogueSession {sessionId: $sid})
         SET s.goals = $goals,
             s.goalsProgress = $progress,
             s.goalsSummary = $summary,
             s.goalsPendingActions = $pending,
             s.goalsAnalyzedAt = $now`,
        {
          sid:      sessionId,
          goals:    JSON.stringify(goals),
          progress: extracted.overallProgress,
          summary:  extracted.summary,
          pending:  JSON.stringify(extracted.pendingActions),
          now,
        }
      );
    } catch (err) {
      console.warn(`[GoalExtract] Memgraph store failed for ${sessionId}: ${err.message}`);
    }

    const byStatus = goals.reduce((acc, g) => { acc[g.status] = (acc[g.status] || 0) + 1; return acc; }, {});
    console.log(`[GoalExtract] ${sessionId?.slice(0, 8)}: ${goals.length} goals — progress=${extracted.overallProgress} achieved=${byStatus.achieved || 0} pending=${byStatus.pending || 0}`);

    return createSuccessResult({
      goals,
      overallProgress:  extracted.overallProgress,
      pendingActions:   extracted.pendingActions,
      summary:          extracted.summary,
      goalsFound:       goals.length,
      byStatus,
    });
  },
});

module.exports = { dialogueExtractGoalsExecutor };

/**
 * dialogue.summarize executor
 * Generates CoD-style summaries for dialogue segments and sessions.
 * Uses LLM service (Anthropic) with fallback to heuristic truncation.
 */

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

const SEGMENT_PROMPT = (text) => `Summarize this development dialogue in 2-3 sentences.
Focus on: what was discussed, what was decided, what was implemented.
Be specific about technical details (file names, function names, module names if mentioned).

Dialogue:
${text}

Summary:`;

const SESSION_PROMPT = (segSummaries) => `Create a concise summary of this development session based on its segments.
Include: main topics, key decisions, problems solved, code changes made.
Write 150-200 words.

Segment summaries:
${segSummaries}

Session summary:`;

function truncateSummary(messages, maxChars = 800) {
  const text = messages
    .map(m => `${m.participant || m.role}: ${m.text}`)
    .join('\n')
    .slice(0, maxChars);
  return text.length > 200 ? text.slice(0, 200) + '...' : text;
}

async function summarizeWithLLM(llmService, text, maxTokens = 150) {
  try {
    const result = await llmService.chat(
      [{ role: 'user', content: SEGMENT_PROMPT(text.slice(0, 3000)) }],
      [],
      null,
      { model: process.env.SUMMARY_MODEL || 'claude-haiku-4-5', maxTokens }
    );
    return (result.content || '').trim();
  } catch (err) {
    return null; // trigger fallback
  }
}

const dialogueSummarizeExecutor = createSimpleExecutor({
  type: 'dialogue.summarize',
  displayName: 'Dialogue Summarization',
  description: 'Generate CoD summaries for dialogue segments and sessions using LLM',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session ID to summarize' },
      dialogues: { type: 'array', description: 'NormalizedDialogue array (alternative)' },
      level: { type: 'string', enum: ['segments', 'session', 'both'], default: 'both' },
      maxTokensPerSummary: { type: 'number', default: 150 },
      batchSize: { type: 'number', default: 5, description: 'Concurrent LLM calls' },
      useLLM: { type: 'boolean', default: true },
    },
  },

  async execute(params, context) {
    const level = params.level || 'both';
    const maxTokens = params.maxTokensPerSummary || 150;
    const batchSize = params.batchSize || 5;
    const useLLM = params.useLLM !== false;

    // Load LLM service
    let llmService = null;
    if (useLLM) {
      try {
        llmService = require('../../../../../services/llm.service');
      } catch { /* fallback */ }
    }

    let memgraphService = null;
    try { memgraphService = require('../../../../../services/memgraph.service'); } catch { /* skip */ }

    // Resolve input dialogues
    let dialogues = params.dialogues || context.input?.dialogues;

    if (!dialogues && params.sessionId) {
      if (!memgraphService) {
        return createErrorResult('SUMMARIZE_ERROR', 'MemgraphService unavailable', true);
      }
      const rows = await memgraphService.runQuery(
        'MATCH (s:DialogueSession { sessionId: $sid }) RETURN s',
        { sid: params.sessionId }
      );
      if (!rows?.length) {
        return createErrorResult('SUMMARIZE_ERROR', `Session ${params.sessionId} not found`, false);
      }
      const props = rows[0]?.s?.properties || rows[0]?.s;
      const { dialogueNormalizer } = require('../services/dialogue.normalizer');
      const dialogue = dialogueNormalizer.parseClaudeCodeSession(props.sourceFile);
      if (!dialogue) return createErrorResult('SUMMARIZE_ERROR', 'Cannot parse JSONL', true);
      dialogues = [dialogue];
    }

    if (!dialogues?.length) {
      return createErrorResult('SUMMARIZE_ERROR', 'No dialogues to summarize', false);
    }

    const stats = {
      sessionsProcessed: 0,
      segmentsSummarized: 0,
      llmCalls: 0,
      fallbackUsed: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
    };

    const results = [];

    for (const dialogue of dialogues) {
      const sessionId = dialogue.sourceId;
      const messages = dialogue.messages || [];

      // Load segments from Memgraph if available
      let segmentRanges = [];
      if (memgraphService) {
        try {
          const segRows = await memgraphService.runQuery(
            `MATCH (s:DialogueSession { sessionId: $sid })-[:HAS_SEGMENT]->(seg:DialogueSegment)
             RETURN seg.segmentId AS segId, seg.startTurn AS start, seg.endTurn AS end
             ORDER BY seg.index`,
            { sid: sessionId }
          );
          segmentRanges = segRows.map(r => ({
            segmentId: r.segId,
            start: Number(r.start),
            end: Number(r.end),
          }));
        } catch { /* fallback to whole session */ }
      }

      // If no stored segments, create virtual segments of 12
      if (segmentRanges.length === 0) {
        const chunkSize = 12;
        for (let i = 0; i < messages.length; i += chunkSize) {
          segmentRanges.push({
            segmentId: null,
            start: i,
            end: Math.min(i + chunkSize, messages.length),
          });
        }
      }

      const segSummaries = [];

      if (level === 'segments' || level === 'both') {
        // Process in batches
        for (let b = 0; b < segmentRanges.length; b += batchSize) {
          const batch = segmentRanges.slice(b, b + batchSize);

          await Promise.all(batch.map(async (range) => {
            const segMsgs = messages.slice(range.start, range.end);
            const rawText = segMsgs
              .map(m => `${m.participant || m.role}: ${m.text.slice(0, 500)}`)
              .join('\n');

            let summary;
            if (llmService) {
              summary = await summarizeWithLLM(llmService, rawText, maxTokens);
              if (summary) {
                stats.llmCalls++;
                stats.totalOutputTokens += summary.split(' ').length * 1.3;
              }
            }

            if (!summary) {
              summary = truncateSummary(segMsgs, 300);
              stats.fallbackUsed++;
            }

            segSummaries.push(summary);
            stats.segmentsSummarized++;

            // Update Memgraph segment node
            if (memgraphService && range.segmentId) {
              try {
                await memgraphService.runQuery(
                  `MATCH (seg:DialogueSegment { segmentId: $segId })
                   SET seg.summary = $summary`,
                  { segId: range.segmentId, summary }
                );
              } catch { /* non-fatal */ }
            }
          }));
        }
      }

      // Session-level summary
      let sessionSummary = '';
      if (level === 'session' || level === 'both') {
        const combinedSummaries = segSummaries.slice(0, 40).join('\n\n');

        if (llmService && combinedSummaries.length > 50) {
          try {
            const result = await llmService.chat(
              [{ role: 'user', content: SESSION_PROMPT(combinedSummaries.slice(0, 6000)) }],
              [],
              null,
              { model: process.env.SUMMARY_MODEL || 'claude-haiku-4-5-20251001', maxTokens: 400 }
            );
            sessionSummary = (result.content || '').trim();
            stats.llmCalls++;
          } catch { /* fallback */ }
        }

        if (!sessionSummary) {
          sessionSummary = segSummaries.slice(0, 5).join(' ').slice(0, 500);
          stats.fallbackUsed++;
        }

        // Update Memgraph session node
        if (memgraphService) {
          try {
            await memgraphService.runQuery(
              `MATCH (s:DialogueSession { sessionId: $sid })
               SET s.summary = $summary`,
              { sid: sessionId, summary: sessionSummary }
            );
          } catch { /* non-fatal */ }
        }
      }

      results.push({
        sessionId,
        segmentCount: segmentRanges.length,
        segmentSummarySample: segSummaries.slice(0, 3),
        sessionSummary,
      });

      stats.sessionsProcessed++;
    }

    console.log(`[dialogue.summarize] ${stats.sessionsProcessed} sessions, ${stats.segmentsSummarized} segs, LLM calls: ${stats.llmCalls}, fallback: ${stats.fallbackUsed}`);

    return createSuccessResult({ results, stats }, stats, 1.0);
  },
});

module.exports = { dialogueSummarizeExecutor };

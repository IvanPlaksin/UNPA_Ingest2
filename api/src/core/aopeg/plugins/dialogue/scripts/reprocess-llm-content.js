/**
 * reprocess-llm-content.js
 * Re-runs LLM summarization + decision extraction for sessions that were
 * processed with heuristic fallback due to LLM unavailability during batch ingest.
 *
 * What it touches: dialogue.summarize + dialogue.extract_decisions + dialogue.embed
 * What it does NOT touch: ingest, sanitize, segment, store, link
 *
 * Usage: node api/src/core/aopeg/plugins/dialogue/scripts/reprocess-llm-content.js
 */

'use strict';

require('dotenv').config({ path: 'api/.env' });

const path = require('path');
const fs = require('fs');

const neo4j = require('neo4j-driver');

// ── Config ────────────────────────────────────────────────────────────────────

const SESSION_DELAY_MS = 2000;       // delay between sessions
const RATE_LIMIT_BACKOFF_MS = 30000; // backoff on 429
const MAX_RETRIES = 3;
const REPORT_DIR = path.join('api', 'src', 'core', 'aopeg', 'plugins', 'dialogue', 'scripts');

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, label, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const is429 = err.message?.includes('429') || err.message?.includes('rate_limit') || err.message?.includes('overloaded');
      const is400 = err.message?.includes('400');
      if (is429 && attempt < retries) {
        const backoff = RATE_LIMIT_BACKOFF_MS * attempt;
        console.log(`  [retry] ${label} — rate limited, waiting ${backoff / 1000}s...`);
        await sleep(backoff);
        continue;
      }
      if (is400) {
        console.log(`  [skip] ${label} — API 400 (tool content), using fallback`);
        return null;
      }
      if (attempt < retries) {
        await sleep(3000);
        continue;
      }
      throw err;
    }
  }
}

// ── Core ──────────────────────────────────────────────────────────────────────

async function main() {
  const startedAt = new Date().toISOString();
  console.log('\n=== DevDialogue LLM Reprocessing ===');
  console.log('Started:', startedAt, '\n');

  // Load services (from scripts/ → up 5 levels to src/, then into services/)
  const mg = require('../../../../../services/memgraph.service');
  const llmService = require('../../../../../services/llm.service');
  const { dialogueSummarizeExecutor } = require('../executors/dialogue.summarize');
  const { dialogueExtractDecisionsExecutor } = require('../executors/dialogue.extract_decisions');
  const { dialogueEmbedExecutor } = require('../executors/dialogue.embed');
  const { dialogueNormalizer } = require('../services/dialogue.normalizer');

  // ── Step 1: Identify sessions needing reprocessing ──────────────────────────
  console.log('Step 1: Identifying sessions with fallback summaries...');

  const sessionRows = await mg.runQuery(`
    MATCH (s:DialogueSession)
    OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
    WITH s,
         count(seg) as segCount,
         sum(CASE WHEN seg.summary IS NULL OR size(seg.summary) < 50 OR seg.summary CONTAINS '...' THEN 1 ELSE 0 END) as weakSegs
    WHERE s.summary IS NULL OR size(s.summary) < 100 OR s.summary CONTAINS '...' OR weakSegs > 0
    RETURN s.sessionId AS sessionId, s.sourceFile AS sourceFile,
           s.platform AS platform, s.messageCount AS messageCount,
           segCount, weakSegs,
           size(coalesce(s.summary, '')) AS summaryLen
    ORDER BY s.messageCount ASC
  `);

  const sessions = sessionRows.map(r => ({
    sessionId: r.sessionId,
    sourceFile: r.sourceFile,
    platform: r.platform,
    messageCount: Number(r.messageCount) || 0,
    segCount: Number(r.segCount) || 0,
    weakSegs: Number(r.weakSegs) || 0,
    summaryLen: Number(r.summaryLen) || 0,
  }));

  console.log(`Found ${sessions.length} sessions needing reprocessing`);
  console.log(`Total segments to reprocess: ${sessions.reduce((s, r) => s + r.segCount, 0)}`);
  console.log();

  // ── Step 2: Init metrics ─────────────────────────────────────────────────────
  const metrics = {
    startedAt,
    config: { SESSION_DELAY_MS, MAX_RETRIES },
    sessionsToReprocess: sessions.length,
    sessionsCompleted: 0,
    sessionsFailed: 0,
    sessionsSkipped: 0,
    llmCallsTotal: 0,
    llmCallsFailed: 0,
    llmTokensInput: 0,
    llmTokensOutput: 0,
    estimatedCostUSD: 0,
    fallbackUsed: 0,
    segmentsSummarized: 0,
    decisionsExtracted: 0,
    decisionsUpdated: 0,
    embeddingsUpdated: 0,
    errors: [],
    perSessionStats: [],
  };

  // ── Step 3: Reprocess each session ─────────────────────────────────────────
  for (let i = 0; i < sessions.length; i++) {
    const { sessionId, sourceFile, platform, messageCount, segCount, weakSegs } = sessions[i];
    const sessionStart = Date.now();

    console.log(`[${i + 1}/${sessions.length}] ${sessionId.slice(0, 8)} | msgs:${messageCount} segs:${segCount} weakSegs:${weakSegs}`);

    const sessionStat = {
      sessionId,
      platform,
      messageCount,
      segCount,
      weakSegs,
      llmCalls: 0,
      fallback: 0,
      decisionsFound: 0,
      decisionsNew: 0,
      embeddingsUpdated: 0,
      durationMs: 0,
      success: false,
      error: null,
    };

    try {
      // Load dialogue from JSONL
      let dialogue = null;
      if (sourceFile && fs.existsSync(sourceFile)) {
        dialogue = dialogueNormalizer.parseClaudeCodeSession(sourceFile);
      }

      if (!dialogue) {
        console.log(`  [skip] sourceFile not found: ${sourceFile}`);
        sessionStat.error = 'sourceFile not found';
        metrics.sessionsSkipped++;
        metrics.perSessionStats.push(sessionStat);
        continue;
      }

      // ── 3a: Re-summarize ──────────────────────────────────────────────────
      const summarizeResult = await withRetry(async () => {
        return dialogueSummarizeExecutor.execute({
          dialogues: [dialogue],
          level: 'both',
          maxTokensPerSummary: 150,
          batchSize: 3,
          useLLM: true,
        }, {});
      }, `summarize ${sessionId.slice(0, 8)}`);

      if (summarizeResult?.success) {
        const s = summarizeResult.metadata || {};
        sessionStat.llmCalls += s.llmCalls || 0;
        sessionStat.fallback += s.fallbackUsed || 0;
        sessionStat.segmentsReprocessed = s.segmentsSummarized || 0;

        metrics.llmCallsTotal += s.llmCalls || 0;
        metrics.fallbackUsed += s.fallbackUsed || 0;
        metrics.segmentsSummarized += s.segmentsSummarized || 0;

        // Estimate cost: Haiku input ~$0.80/M, output ~$4/M tokens
        const estimatedInputTokens = (dialogue.messages?.length || 0) * 80;
        const estimatedOutputTokens = (s.llmCalls || 0) * 40;
        metrics.llmTokensInput += estimatedInputTokens;
        metrics.llmTokensOutput += estimatedOutputTokens;
        metrics.estimatedCostUSD += (estimatedInputTokens * 0.0008 + estimatedOutputTokens * 0.004) / 1000;

        console.log(`  summarize: ${s.llmCalls || 0} LLM calls, ${s.fallbackUsed || 0} fallbacks`);
      }

      // ── 3b: Re-extract decisions ──────────────────────────────────────────
      const decisionResult = await withRetry(async () => {
        return dialogueExtractDecisionsExecutor.execute({
          sessionId,
          useLLM: true,
        }, {});
      }, `decisions ${sessionId.slice(0, 8)}`);

      if (decisionResult?.success) {
        const ds = decisionResult.metadata || decisionResult.output?.stats || {};
        const found = ds.decisionsExtracted || 0;

        sessionStat.decisionsFound = found;
        metrics.decisionsExtracted += found;

        console.log(`  decisions: ${found} extracted`);
      }

      // ── 3c: Update embeddings ─────────────────────────────────────────────
      const embedResult = await withRetry(async () => {
        return dialogueEmbedExecutor.execute({
          sessionId,
          targets: ['session_summary', 'segment_summaries'],
        }, {});
      }, `embed ${sessionId.slice(0, 8)}`);

      if (embedResult?.success) {
        const es = embedResult.metadata || {};
        const updated = es.embedded || es.pointsUpserted || 0;
        sessionStat.embeddingsUpdated = updated;
        metrics.embeddingsUpdated += updated;
        console.log(`  embeddings: ${updated} updated`);
      }

      sessionStat.durationMs = Date.now() - sessionStart;
      sessionStat.success = true;
      metrics.sessionsCompleted++;

    } catch (err) {
      console.log(`  [ERROR] ${err.message}`);
      sessionStat.error = err.message;
      sessionStat.durationMs = Date.now() - sessionStart;
      metrics.sessionsFailed++;
      metrics.errors.push({ sessionId, error: err.message });
    }

    metrics.perSessionStats.push(sessionStat);

    // Delay between sessions
    if (i < sessions.length - 1) {
      await sleep(SESSION_DELAY_MS);
    }
  }

  // ── Step 4: Finalize report ─────────────────────────────────────────────────
  metrics.completedAt = new Date().toISOString();
  metrics.totalDurationMs = Date.now() - new Date(startedAt).getTime();
  metrics.estimatedCostUSD = Math.round(metrics.estimatedCostUSD * 10000) / 10000;

  const timestamp = startedAt.replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(REPORT_DIR, `reprocess-report-${timestamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2));

  console.log('\n=== REPROCESSING COMPLETE ===');
  console.log(`Duration: ${(metrics.totalDurationMs / 1000 / 60).toFixed(1)} min`);
  console.log(`Sessions: ${metrics.sessionsCompleted} completed, ${metrics.sessionsFailed} failed, ${metrics.sessionsSkipped} skipped`);
  console.log(`LLM calls: ${metrics.llmCallsTotal} (fallbacks: ${metrics.fallbackUsed})`);
  console.log(`Segments summarized: ${metrics.segmentsSummarized}`);
  console.log(`Decisions extracted: ${metrics.decisionsExtracted} (${metrics.decisionsUpdated} updated)`);
  console.log(`Embeddings updated: ${metrics.embeddingsUpdated}`);
  console.log(`Estimated cost: $${metrics.estimatedCostUSD}`);
  console.log(`Report saved: ${reportPath}`);

  process.exit(metrics.sessionsFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});

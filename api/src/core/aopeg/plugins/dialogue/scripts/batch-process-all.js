/**
 * Batch Process All Dialogue Sessions — Phase 2 intelligence pipeline
 * segment → summarize → embed → extract_decisions → link
 *
 * Usage:
 *   node api/src/core/aopeg/plugins/dialogue/scripts/batch-process-all.js [--limit N] [--skip N]
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../../.env') });

const { dialogueSegmentExecutor } = require('../executors/dialogue.segment');
const { dialogueSummarizeExecutor } = require('../executors/dialogue.summarize');
const { dialogueEmbedExecutor } = require('../executors/dialogue.embed');
const { dialogueExtractDecisionsExecutor } = require('../executors/dialogue.extract_decisions');
const { dialogueLinkExecutor } = require('../executors/dialogue.link');
const memgraphService = require('../../../../../services/memgraph.service');

const args = process.argv.slice(2);
const limitArg = args.indexOf('--limit');
const skipArg = args.indexOf('--skip');
const LIMIT = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : Infinity;
const SKIP = skipArg >= 0 ? parseInt(args[skipArg + 1], 10) : 0;
const DELAY_MS = 500; // between sessions to respect rate limits

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processSession(sessionId, idx, total) {
  const tag = `[${idx + 1}/${total}] ${sessionId.slice(0, 8)}`;
  const result = { sessionId, segments: 0, summaries: 0, llmCalls: 0, qdrantPoints: 0, decisions: 0, links: {} };

  try {
    // Step 1: Segment
    const segRes = await dialogueSegmentExecutor.execute({ sessionId, storeSegments: true }, {});
    result.segments = segRes.output?.stats?.totalSegments || 0;
    if (!segRes.success) throw new Error('segment failed: ' + JSON.stringify(segRes.errors));

    // Step 2: Summarize
    const sumRes = await dialogueSummarizeExecutor.execute(
      { sessionId, level: 'both', useLLM: true, maxTokensPerSummary: 120, batchSize: 5 },
      {}
    );
    result.summaries = sumRes.output?.stats?.segmentsSummarized || 0;
    result.llmCalls += sumRes.output?.stats?.llmCalls || 0;

    // Step 3: Embed
    const embRes = await dialogueEmbedExecutor.execute(
      { sessionId, targets: ['session_summary', 'segment_summaries'] },
      {}
    );
    result.qdrantPoints = embRes.output?.qdrantPointsUpserted || 0;

    // Step 4: Extract decisions
    const decRes = await dialogueExtractDecisionsExecutor.execute(
      { sessionId, useLLM: true, minConfidence: 0.45, model: 'claude-haiku-4-5-20251001' },
      {}
    );
    result.decisions = decRes.output?.stats?.decisionsExtracted || 0;
    result.llmCalls += decRes.output?.stats?.candidateSegments || 0;

    // Step 5: Link
    const lnkRes = await dialogueLinkExecutor.execute(
      { sessionId, linkTypes: ['backlog', 'codex', 'catalog', 'chains'], chainThreshold: 0.60 },
      {}
    );
    result.links = lnkRes.output?.linksCreated || {};

    console.log(`${tag} OK: segs=${result.segments} summ=${result.summaries} pts=${result.qdrantPoints} dec=${result.decisions} chains=${result.links.chains || 0}`);
    return { ...result, ok: true };
  } catch (err) {
    console.error(`${tag} ERROR: ${err.message}`);
    return { ...result, ok: false, error: err.message };
  }
}

async function main() {
  console.log('=== DevDialogue Batch Processor — Phase 2 ===\n');

  const rows = await memgraphService.runQuery(
    'MATCH (s:DialogueSession) RETURN s.sessionId AS sid ORDER BY s.startedAt',
    {}
  );
  const allSids = rows.map(r => r.sid).filter(Boolean).slice(SKIP, SKIP + LIMIT);
  console.log(`Sessions to process: ${allSids.length} (of ${rows.length} total, skip=${SKIP})\n`);

  const startTime = Date.now();
  const totals = { processed: 0, failed: 0, segments: 0, summaries: 0, llmCalls: 0, qdrantPoints: 0, decisions: 0, chains: 0 };
  const errors = [];

  for (let i = 0; i < allSids.length; i++) {
    const result = await processSession(allSids[i], i, allSids.length);
    if (result.ok) {
      totals.processed++;
      totals.segments += result.segments;
      totals.summaries += result.summaries;
      totals.llmCalls += result.llmCalls;
      totals.qdrantPoints += result.qdrantPoints;
      totals.decisions += result.decisions;
      totals.chains += result.links.chains || 0;
    } else {
      totals.failed++;
      errors.push({ sessionId: result.sessionId.slice(0, 8), error: result.error });
    }

    if (i < allSids.length - 1) await sleep(DELAY_MS);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);

  // Memgraph final stats
  const mgStats = await memgraphService.runQuery(
    `MATCH (s:DialogueSession)
     OPTIONAL MATCH (s)-[:HAS_SEGMENT]->(seg:DialogueSegment)
     OPTIONAL MATCH (seg)<-[:DECIDED_IN]-(d:ArchDecision)
     RETURN count(DISTINCT s) AS sessions,
            count(DISTINCT seg) AS segments,
            count(DISTINCT d) AS decisions`,
    {}
  ).catch(() => [{}]);

  const chainCount = await memgraphService.runQuery(
    'MATCH ()-[r:CONTINUES_FROM]->() RETURN count(r) AS chains', {}
  ).catch(() => [{ chains: 0 }]);

  // Qdrant stats
  let qdrantPoints = '?';
  try {
    const { QdrantClient } = require('@qdrant/js-client-rest');
    const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    const info = await client.getCollection('dialogue_embeddings');
    qdrantPoints = info.points_count;
  } catch { /* non-fatal */ }

  console.log('\n=== BATCH PROCESSING COMPLETE ===\n');
  console.log(`Sessions processed: ${totals.processed}/${allSids.length} (failed: ${totals.failed})`);
  console.log(`Total time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
  console.log('');
  console.log(`Segments created:    ${totals.segments}`);
  console.log(`Summaries:           ${totals.summaries}`);
  console.log(`Decisions extracted: ${totals.decisions}`);
  console.log(`Chains detected:     ${totals.chains}`);
  console.log(`Qdrant points:       ${totals.qdrantPoints} (new this run)`);
  console.log(`LLM calls (est):     ${totals.llmCalls}`);
  console.log('');
  console.log('Memgraph totals:');
  const mg = mgStats[0] || {};
  console.log(`  Sessions:   ${mg.sessions || '?'}`);
  console.log(`  Segments:   ${mg.segments || '?'}`);
  console.log(`  Decisions:  ${mg.decisions || '?'}`);
  console.log(`  Chains:     ${chainCount[0]?.chains || 0}`);
  console.log(`  Qdrant:     ${qdrantPoints} total points`);

  if (errors.length) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  ${e.sessionId}: ${e.error}`));
  }

  process.exit(totals.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

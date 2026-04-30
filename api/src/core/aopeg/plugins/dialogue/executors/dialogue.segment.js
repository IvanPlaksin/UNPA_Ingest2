/**
 * dialogue.segment executor
 * Splits NormalizedDialogue sessions into topical segments.
 * Uses hybrid approach: time gaps + message count heuristic.
 * Embeddings-based semantic splitting added in dialogue.embed (P2-003).
 */

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

const TIME_GAP_MS = 30 * 60 * 1000; // 30 minutes hard boundary

function computeSegments(messages, minSize, maxSize) {
  if (messages.length === 0) return [];

  const segments = [];
  let start = 0;

  for (let i = 1; i <= messages.length; i++) {
    const isLast = i === messages.length;
    const segLen = i - start;

    let isBoundary = isLast;

    if (!isLast && segLen >= minSize) {
      // Hard boundary: time gap > 30 min
      const prev = messages[i - 1];
      const curr = messages[i];
      const prevTs = prev?.timestamp ? new Date(prev.timestamp).getTime() : 0;
      const currTs = curr?.timestamp ? new Date(curr.timestamp).getTime() : 0;
      if (currTs > 0 && prevTs > 0 && currTs - prevTs > TIME_GAP_MS) {
        isBoundary = true;
      }

      // Soft boundary: reached maxSize
      if (segLen >= maxSize) {
        isBoundary = true;
      }
    }

    if (isBoundary) {
      segments.push({ start, end: i });
      start = i;
    }
  }

  return segments;
}

function getDominantParticipant(messages) {
  const counts = {};
  for (const m of messages) {
    const p = m.participant || m.role || 'unknown';
    counts[p] = (counts[p] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

const dialogueSegmentExecutor = createSimpleExecutor({
  type: 'dialogue.segment',
  displayName: 'Dialogue Segmentation',
  description: 'Split dialogue sessions into topical segments for summarization and ADR extraction',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session ID to segment' },
      dialogues: { type: 'array', description: 'Array of NormalizedDialogue (alternative to sessionId)' },
      minSegmentSize: { type: 'number', default: 3 },
      maxSegmentSize: { type: 'number', default: 12 },
      storeSegments: { type: 'boolean', default: true, description: 'Persist segments to Memgraph' },
    },
  },

  async execute(params, context) {
    const minSize = params.minSegmentSize || 3;
    const maxSize = params.maxSegmentSize || 12;
    const storeSegments = params.storeSegments !== false;

    // Resolve input
    let dialogues = params.dialogues || context.input?.dialogues;

    if (!dialogues) {
      const sessionId = params.sessionId || context.input?.sessionId;
      if (!sessionId) {
        return createErrorResult('SEGMENT_ERROR', 'Provide "sessionId" or "dialogues"', false);
      }

      // Load from Memgraph + JSONL
      let memgraphService;
      try { memgraphService = require('../../../../../services/memgraph.service'); } catch (e) {
        return createErrorResult('SEGMENT_ERROR', `MemgraphService unavailable: ${e.message}`, true);
      }

      const rows = await memgraphService.runQuery(
        'MATCH (s:DialogueSession { sessionId: $sid }) RETURN s',
        { sid: sessionId }
      );
      if (!rows?.length) {
        return createErrorResult('SEGMENT_ERROR', `Session ${sessionId} not found`, false);
      }
      const props = rows[0]?.s?.properties || rows[0]?.s || rows[0];
      const { dialogueNormalizer } = require('../services/dialogue.normalizer');
      const dialogue = dialogueNormalizer.parseClaudeCodeSession(props.sourceFile);
      if (!dialogue) {
        return createErrorResult('SEGMENT_ERROR', `Cannot parse JSONL for session ${sessionId}`, true);
      }
      dialogues = [dialogue];
    }

    let memgraphService = null;
    if (storeSegments) {
      try { memgraphService = require('../../../../../services/memgraph.service'); } catch { /* skip */ }
    }

    const allSegments = [];
    const stats = { sessionsProcessed: 0, totalSegments: 0, avgSegmentSize: 0 };

    for (const dialogue of dialogues) {
      const messages = dialogue.messages || [];
      const ranges = computeSegments(messages, minSize, maxSize);

      const sessionSegments = [];
      for (let idx = 0; idx < ranges.length; idx++) {
        const { start, end } = ranges[idx];
        const segMsgs = messages.slice(start, end);
        const segId = `seg_${dialogue.sourceId.slice(0, 8)}_${String(idx).padStart(3, '0')}`;

        const segment = {
          segmentId: segId,
          sessionId: dialogue.sourceId,
          index: idx,
          startTurn: start,
          endTurn: end,
          messageCount: segMsgs.length,
          dominantParticipant: getDominantParticipant(segMsgs),
          timeSpan: {
            start: segMsgs[0]?.timestamp || null,
            end: segMsgs[segMsgs.length - 1]?.timestamp || null,
          },
          messages: segMsgs,
        };

        sessionSegments.push(segment);
      }

      // Store to Memgraph
      if (storeSegments && memgraphService && sessionSegments.length > 0) {
        try {
          // Batch upsert segments
          for (const seg of sessionSegments) {
            await memgraphService.runQuery(
              `MERGE (seg:DialogueSegment { segmentId: $segmentId })
               ON CREATE SET
                 seg.sessionId = $sessionId,
                 seg.index = $index,
                 seg.startTurn = $startTurn,
                 seg.endTurn = $endTurn,
                 seg.messageCount = $messageCount,
                 seg.dominantParticipant = $dominantParticipant,
                 seg.timeStart = $timeStart,
                 seg.timeEnd = $timeEnd,
                 seg.namespace = 'DIALOGUE',
                 seg.contributionType = 'mixed'
               ON MATCH SET
                 seg.messageCount = $messageCount`,
              {
                segmentId: seg.segmentId,
                sessionId: seg.sessionId,
                index: seg.index,
                startTurn: seg.startTurn,
                endTurn: seg.endTurn,
                messageCount: seg.messageCount,
                dominantParticipant: seg.dominantParticipant,
                timeStart: seg.timeSpan.start || '',
                timeEnd: seg.timeSpan.end || '',
              }
            );
          }

          // Create HAS_SEGMENT edges (batch via session)
          await memgraphService.runQuery(
            `MATCH (s:DialogueSession { sessionId: $sid })
             WITH s
             UNWIND $segIds AS segId
             MATCH (seg:DialogueSegment { segmentId: segId })
             MERGE (s)-[:HAS_SEGMENT]->(seg)`,
            {
              sid: dialogue.sourceId,
              segIds: sessionSegments.map(s => s.segmentId),
            }
          );
        } catch (err) {
          console.warn(`[dialogue.segment] Memgraph store failed for ${dialogue.sourceId}: ${err.message}`);
        }
      }

      allSegments.push(...sessionSegments);
      stats.sessionsProcessed++;
      stats.totalSegments += sessionSegments.length;
    }

    if (stats.totalSegments > 0) {
      stats.avgSegmentSize = Math.round(
        allSegments.reduce((s, seg) => s + seg.messageCount, 0) / stats.totalSegments
      );
    }

    console.log(`[dialogue.segment] ${stats.sessionsProcessed} sessions → ${stats.totalSegments} segments (avg ${stats.avgSegmentSize} msgs)`);

    return createSuccessResult(
      { segments: allSegments, stats },
      stats,
      1.0
    );
  },
});

module.exports = { dialogueSegmentExecutor };

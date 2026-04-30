/**
 * dialogue.embed executor
 * Generate vector embeddings for dialogue session/segment summaries and content.
 * Uses EmbeddingService (TEI, 1024 dim) and stores in Qdrant dialogue_embeddings collection.
 */

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');
const crypto = require('crypto');

function toUuid(str) {
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

const dialogueEmbedExecutor = createSimpleExecutor({
  type: 'dialogue.embed',
  displayName: 'Dialogue Embedding',
  description: 'Generate embeddings for dialogue summaries and content, store in Qdrant',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session ID to embed (or "all" for batch)' },
      targets: {
        type: 'array',
        items: { type: 'string', enum: ['session_summary', 'segment_summaries', 'segment_content'] },
        default: ['session_summary', 'segment_summaries'],
      },
      batchSize: { type: 'number', default: 32 },
    },
  },

  async execute(params, context) {
    const targets = params.targets || ['session_summary', 'segment_summaries'];
    const batchSize = params.batchSize || 32;
    const sessionId = params.sessionId || context.input?.sessionId;

    if (!sessionId) {
      return createErrorResult('EMBED_ERROR', 'Provide "sessionId"', false);
    }

    // Load services
    let memgraphService;
    try { memgraphService = require('../../../../../services/memgraph.service'); } catch (e) {
      return createErrorResult('EMBED_ERROR', `MemgraphService unavailable: ${e.message}`, true);
    }

    let embeddingService;
    try {
      const { EmbeddingService } = require('../../../../../services/structuring/embeddings/EmbeddingService');
      embeddingService = new EmbeddingService({ batchSize });
    } catch (e) {
      return createErrorResult('EMBED_ERROR', `EmbeddingService unavailable: ${e.message}`, true);
    }

    const { DialogueQdrantService } = require('../services/dialogue.qdrant');
    const qdrantService = new DialogueQdrantService();

    // Resolve session IDs
    let sessionIds = [];
    if (sessionId === 'all') {
      const rows = await memgraphService.runQuery(
        'MATCH (s:DialogueSession) RETURN s.sessionId AS sid', {}
      );
      sessionIds = rows.map(r => r.sid).filter(Boolean);
    } else {
      sessionIds = [sessionId];
    }

    const stats = {
      sessionsProcessed: 0,
      sessionsEmbedded: 0,
      segmentsEmbedded: 0,
      qdrantPointsUpserted: 0,
      errors: 0,
    };

    for (const sid of sessionIds) {
      try {
        const textsToEmbed = [];

        // Load session summary
        if (targets.includes('session_summary')) {
          const sessRows = await memgraphService.runQuery(
            `MATCH (s:DialogueSession { sessionId: $sid })
             RETURN s.summary AS summary, s.platform AS platform, s.startedAt AS startedAt,
                    s.projectPath AS projectPath`,
            { sid }
          );
          if (sessRows[0]?.summary) {
            textsToEmbed.push({
              id: toUuid('session:' + sid),
              text: sessRows[0].summary,
              payload: {
                node_type: 'session',
                sessionId: sid,
                platform: sessRows[0].platform || '',
                startedAt: sessRows[0].startedAt || '',
                projectPath: sessRows[0].projectPath || '',
              },
              vectorTarget: 'summary',
            });
          }
        }

        // Load segment summaries / content
        if (targets.includes('segment_summaries') || targets.includes('segment_content')) {
          const segRows = await memgraphService.runQuery(
            `MATCH (s:DialogueSession { sessionId: $sid })-[:HAS_SEGMENT]->(seg:DialogueSegment)
             RETURN seg.segmentId AS segmentId, seg.summary AS summary,
                    seg.index AS idx, seg.startTurn AS startTurn, seg.endTurn AS endTurn,
                    seg.dominantParticipant AS dp
             ORDER BY seg.index`,
            { sid }
          );

          for (const seg of segRows) {
            if (targets.includes('segment_summaries') && seg.summary) {
              textsToEmbed.push({
                id: toUuid('seg_summary:' + seg.segmentId),
                text: seg.summary,
                payload: {
                  node_type: 'segment',
                  segmentId: seg.segmentId,
                  sessionId: sid,
                  index: Number(seg.idx) || 0,
                  startTurn: Number(seg.startTurn) || 0,
                  endTurn: Number(seg.endTurn) || 0,
                  dominantParticipant: seg.dp || '',
                  vectorType: 'summary',
                },
                vectorTarget: 'summary',
              });
            }
          }
        }

        if (textsToEmbed.length === 0) {
          console.warn(`[dialogue.embed] No texts to embed for session ${sid} (missing summaries?)`);
          stats.sessionsProcessed++;
          continue;
        }

        // Generate embeddings in batches
        const allTexts = textsToEmbed.map(t => t.text);
        const vectors = await embeddingService.generateBatchEmbeddings(allTexts);

        // Build Qdrant points
        const points = textsToEmbed
          .map((t, i) => {
            if (!vectors[i]) return null;
            const point = {
              id: t.id,
              payload: t.payload,
            };
            if (t.vectorTarget === 'summary') {
              point.summaryVector = vectors[i];
            } else {
              point.contentVector = vectors[i];
            }
            return point;
          })
          .filter(Boolean);

        if (points.length > 0) {
          await qdrantService.upsertPoints(points);
          stats.qdrantPointsUpserted += points.length;
        }

        // Mark embedded in Memgraph
        await memgraphService.runQuery(
          `MATCH (s:DialogueSession { sessionId: $sid }) SET s.embeddedAt = $ts`,
          { sid, ts: new Date().toISOString() }
        ).catch(() => {});

        const segCount = textsToEmbed.filter(t => t.payload.node_type === 'segment').length;
        const sessCount = textsToEmbed.filter(t => t.payload.node_type === 'session').length;
        stats.sessionsEmbedded += sessCount;
        stats.segmentsEmbedded += segCount;
        stats.sessionsProcessed++;
      } catch (err) {
        console.error(`[dialogue.embed] Error embedding session ${sid}: ${err.message}`);
        stats.errors++;
        stats.sessionsProcessed++;
      }
    }

    console.log(`[dialogue.embed] ${stats.sessionsProcessed} sessions, ${stats.qdrantPointsUpserted} points upserted (${stats.segmentsEmbedded} segs, ${stats.sessionsEmbedded} sessions), errors: ${stats.errors}`);

    return createSuccessResult(
      {
        sessionIds,
        embedded: { sessions: stats.sessionsEmbedded, segments: stats.segmentsEmbedded },
        qdrantPointsUpserted: stats.qdrantPointsUpserted,
        stats,
      },
      stats,
      1.0
    );
  },
});

module.exports = { dialogueEmbedExecutor };

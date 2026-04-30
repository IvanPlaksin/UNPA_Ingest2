/**
 * dialogue.store executor
 * Stores NormalizedDialogue sessions to Memgraph (graph) and optionally Qdrant.
 * Implements Canonical Write Order: Memgraph → Qdrant → Redis with Saga compensation.
 */

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

const dialogueStoreExecutor = createSimpleExecutor({
  type: 'dialogue.store',
  displayName: 'Dialogue Storage',
  description: 'Store sanitized dialogues in Memgraph (graph) and Qdrant (embeddings) with Saga compensation',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      dialogues: {
        type: 'array',
        description: 'Array of sanitized NormalizedDialogue objects',
      },
      generateEmbeddings: {
        type: 'boolean',
        default: false,
        description: 'Generate and store embeddings in Qdrant (Phase 2 feature)',
      },
      processingRound: {
        type: 'number',
        description: 'Provenance processing round number',
      },
    },
  },

  async execute(params, context) {
    const dialogues = params.dialogues || context.input?.dialogues;
    if (!Array.isArray(dialogues) || dialogues.length === 0) {
      return createErrorResult('STORE_ERROR', 'Parameter "dialogues" must be a non-empty array', false);
    }

    const round = params.processingRound || Math.floor(Date.now() / 1000);
    const generateEmbeddings = params.generateEmbeddings === true;

    // Lazy-load services — non-fatal if unavailable
    let memgraphService;
    try {
      memgraphService = require('../../../../../services/memgraph.service');
    } catch (err) {
      return createErrorResult('STORE_ERROR', `MemgraphService unavailable: ${err.message}`, true);
    }

    let redisService = null;
    try {
      redisService = require('../../../../../services/redis.service');
    } catch { /* non-fatal */ }

    // ─── Phase A: Memgraph ────────────────────────────────────────────
    const createdSessionIds = [];
    const memgraphStats = { created: 0, updated: 0, skipped: 0 };

    const UPSERT_QUERY = `
      MERGE (s:DialogueSession { sessionId: $sessionId })
      ON CREATE SET
        s.platform = $platform,
        s.projectPath = $projectPath,
        s.title = $title,
        s.startedAt = $startedAt,
        s.updatedAt = $updatedAt,
        s.model = $model,
        s.gitBranch = $gitBranch,
        s.messageCount = $messageCount,
        s.totalInputTokens = $totalInputTokens,
        s.totalOutputTokens = $totalOutputTokens,
        s.sourceFile = $sourceFile,
        s.processingRound = $processingRound,
        s.namespace = 'DIALOGUE',
        s.createdAt = $createdAt,
        s._action = 'created'
      ON MATCH SET
        s.updatedAt = $updatedAt,
        s.messageCount = $messageCount,
        s.processingRound = $processingRound,
        s._action = 'updated'
      RETURN s.sessionId AS sid, s._action AS action
    `;

    try {
      for (const dialogue of dialogues) {
        const props = {
          sessionId: dialogue.sourceId,
          platform: dialogue.platform,
          projectPath: dialogue.projectPath || '',
          title: dialogue.title || '',
          startedAt: dialogue.startedAt || new Date().toISOString(),
          updatedAt: dialogue.updatedAt || new Date().toISOString(),
          model: dialogue.model || '',
          gitBranch: dialogue.gitBranch || '',
          messageCount: dialogue.messages?.length || dialogue.metadata?.messageCount || 0,
          totalInputTokens: dialogue.metadata?.totalInputTokens || 0,
          totalOutputTokens: dialogue.metadata?.totalOutputTokens || 0,
          sourceFile: dialogue.metadata?.sourceFile || '',
          processingRound: round,
          createdAt: new Date().toISOString(),
        };

        try {
          const rows = await memgraphService.runQuery(UPSERT_QUERY, props);
          const action = rows[0]?.action || 'created';
          if (action === 'created') {
            memgraphStats.created++;
            createdSessionIds.push(dialogue.sourceId);
          } else {
            memgraphStats.updated++;
          }
        } catch (err) {
          console.warn(`[dialogue.store] Memgraph upsert failed for ${dialogue.sourceId}: ${err.message}`);
          memgraphStats.skipped++;
        }
      }
    } catch (err) {
      return createErrorResult('STORE_ERROR', `Memgraph phase failed: ${err.message}`, true);
    }

    // ─── Phase B: Qdrant ──────────────────────────────────────────────
    const qdrantStats = { upserted: 0 };

    if (generateEmbeddings) {
      try {
        const { dialogueQdrantService } = require('../services/dialogue.qdrant');
        const { EmbeddingService } = require('../../../../../services/structuring/embeddings/EmbeddingService');

        const embeddingService = new EmbeddingService({
          teiUrl: process.env.TEI_URL || 'http://localhost:8081',
          dimension: 1024,
          batchSize: 16,
          enableCache: true,
        });

        await dialogueQdrantService.initCollection();

        const texts = dialogues.map(d => d.title + ' ' + (d.messages[0]?.text || '').slice(0, 500));
        let embeddings;
        try {
          embeddings = await embeddingService.generateBatchEmbeddings(texts);
        } catch {
          embeddings = texts.map(() => new Array(1024).fill(0));
        }

        const points = dialogues.map((d, i) => ({
          id: d.sourceId,
          summaryVector: embeddings[i],
          payload: {
            platform: d.platform,
            sessionId: d.sourceId,
            title: d.title,
            timestamp: d.startedAt,
            namespace: 'DIALOGUE',
            node_type: 'session',
            messageCount: d.metadata?.messageCount || 0,
          },
        }));

        await dialogueQdrantService.upsertPoints(points);
        qdrantStats.upserted = points.length;
      } catch (err) {
        // Saga compensation — rollback Memgraph Phase A
        console.warn(`[dialogue.store] Qdrant phase failed, rolling back Memgraph nodes: ${err.message}`);
        try {
          if (createdSessionIds.length > 0) {
            await memgraphService.runQuery(
              `UNWIND $ids AS id MATCH (s:DialogueSession { sessionId: id }) DELETE s`,
              { ids: createdSessionIds }
            );
            console.log(`[dialogue.store] Rolled back ${createdSessionIds.length} Memgraph nodes`);
          }
        } catch (rollbackErr) {
          console.error(`[dialogue.store] Rollback failed: ${rollbackErr.message}`);
        }
        return createErrorResult('STORE_ERROR', `Qdrant phase failed: ${err.message}`, true);
      }
    }

    // ─── Phase C: Redis cache ─────────────────────────────────────────
    if (redisService) {
      try {
        await redisService.set('dialogue:stats', {
          totalStored: memgraphStats.created + memgraphStats.updated,
          lastProcessedAt: new Date().toISOString(),
          processingRound: round,
        }, 0);
      } catch { /* non-fatal */ }
    }

    const totalStored = memgraphStats.created + memgraphStats.updated;
    const qualityScore = dialogues.length > 0 ? totalStored / dialogues.length : 0;

    return createSuccessResult(
      {
        stored: { memgraph: memgraphStats, qdrant: qdrantStats },
        processingRound: round,
      },
      {
        totalDialogues: dialogues.length,
        memgraphCreated: memgraphStats.created,
        memgraphUpdated: memgraphStats.updated,
        memgraphSkipped: memgraphStats.skipped,
        qdrantUpserted: qdrantStats.upserted,
      },
      qualityScore
    );
  },
});

module.exports = { dialogueStoreExecutor };

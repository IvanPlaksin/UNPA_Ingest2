/**
 * dialogue.link executor
 * Create cross-references between dialogues and existing entities:
 * BackLogTask, CodexRule, CatalogEntry, and conversation chains.
 */

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

// ── Reference patterns ────────────────────────────────────────────────────────

const BACKLOG_PATTERNS = [
  /BACKLOG-(\d{3,})/gi,
  /TASK-([A-Z0-9]+-[A-Z0-9]+-\d+)/gi,
];

const CODEX_PATTERNS = [
  /CODEX-RULE-([A-Z]+-\d+)/gi,
  /codex[:\s]+([A-Z]+-\d+)/gi,
];

const CATALOG_PATTERNS = [
  /executor[:\s"']+([a-z]+\.[a-z_]+)/gi,
];

function extractRefs(text, patterns) {
  const found = new Set();
  for (const pattern of patterns) {
    // Reset lastIndex for global patterns
    const p = new RegExp(pattern.source, pattern.flags);
    let m;
    while ((m = p.exec(text)) !== null) {
      found.add(m[1] || m[0]);
    }
  }
  return [...found];
}

function getSessionText(sessProps, messages) {
  const summary = sessProps.summary || '';
  // Sample messages evenly across session to capture refs throughout
  const msgs = messages || [];
  const step = Math.max(1, Math.floor(msgs.length / 100));
  const sampled = msgs.filter((_, i) => i % step === 0).map(m => m.text.slice(0, 400)).join(' ');
  return summary + ' ' + sampled;
}

const dialogueLinkExecutor = createSimpleExecutor({
  type: 'dialogue.link',
  displayName: 'Dialogue Linking',
  description: 'Create cross-references between dialogues and BackLog/Codex/Catalog entities + chain detection',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session ID (or "all")' },
      linkTypes: {
        type: 'array',
        items: { type: 'string', enum: ['backlog', 'codex', 'catalog', 'chains'] },
        default: ['backlog', 'codex', 'catalog', 'chains'],
      },
      chainThreshold: { type: 'number', default: 0.65 },
    },
  },

  async execute(params, context) {
    const sessionId = params.sessionId || context.input?.sessionId;
    if (!sessionId) {
      return createErrorResult('LINK_ERROR', 'Provide "sessionId"', false);
    }

    const linkTypes = params.linkTypes || ['backlog', 'codex', 'catalog', 'chains'];
    const chainThreshold = params.chainThreshold ?? 0.65;

    let memgraphService;
    try { memgraphService = require('../../../../../services/memgraph.service'); } catch (e) {
      return createErrorResult('LINK_ERROR', `MemgraphService unavailable: ${e.message}`, true);
    }

    // Resolve session IDs
    let sessionIds = [];
    if (sessionId === 'all') {
      const rows = await memgraphService.runQuery(
        'MATCH (s:DialogueSession) WHERE NOT s.linkedAt IS NOT NULL RETURN s.sessionId AS sid',
        {}
      );
      sessionIds = rows.map(r => r.sid).filter(Boolean);
    } else {
      sessionIds = [sessionId];
    }

    const globalStats = {
      sessionsProcessed: 0,
      linksCreated: { backlog: 0, codex: 0, catalog: 0, chains: 0 },
    };
    const allDetails = [];

    for (const sid of sessionIds) {
      const sessRows = await memgraphService.runQuery(
        `MATCH (s:DialogueSession { sessionId: $sid }) RETURN s`,
        { sid }
      );
      if (!sessRows?.length) continue;

      const sessProps = sessRows[0]?.s?.properties || sessRows[0]?.s || sessRows[0];

      // Load messages from JSONL for text scanning
      let messages = [];
      try {
        const { dialogueNormalizer } = require('../services/dialogue.normalizer');
        const dialogue = dialogueNormalizer.parseClaudeCodeSession(sessProps.sourceFile);
        if (dialogue) messages = dialogue.messages;
      } catch { /* non-fatal */ }

      const searchText = getSessionText(sessProps, messages);
      const details = { sessionId: sid, backlogItems: [], codexRules: [], catalogRefs: [], chainedSessions: [] };
      const sessionLinks = { backlog: 0, codex: 0, catalog: 0, chains: 0 };

      // ── Type 1: BackLog references ────────────────────────────────────────
      if (linkTypes.includes('backlog')) {
        const refs = extractRefs(searchText, BACKLOG_PATTERNS);
        for (const ref of refs) {
          try {
            // Try by backlogId numeric suffix
            const numMatch = ref.match(/(\d+)$/);
            let rows = [];
            if (numMatch) {
              rows = await memgraphService.runQuery(
                `MATCH (bl:BackLogTask) WHERE bl.backlogId CONTAINS $ref RETURN bl.backlogId AS bid LIMIT 1`,
                { ref: numMatch[1] }
              );
            }
            if (!rows.length && ref.startsWith('BACKLOG-')) {
              rows = await memgraphService.runQuery(
                `MATCH (bl:BackLogTask) WHERE bl.backlogId = $ref RETURN bl.backlogId AS bid LIMIT 1`,
                { ref }
              );
            }
            if (rows.length) {
              const bid = rows[0].bid;
              await memgraphService.runQuery(
                `MATCH (s:DialogueSession { sessionId: $sid })
                 MATCH (bl:BackLogTask { backlogId: $bid })
                 MERGE (s)-[:DISCUSSES { source: 'text_reference' }]->(bl)`,
                { sid, bid }
              );
              details.backlogItems.push(bid);
              sessionLinks.backlog++;
            }
          } catch { /* non-fatal */ }
        }
      }

      // ── Type 2: Codex references ──────────────────────────────────────────
      if (linkTypes.includes('codex')) {
        const refs = extractRefs(searchText, CODEX_PATTERNS);
        for (const ref of refs) {
          try {
            // Try exact ruleId match
            const ruleKey = ref.toUpperCase().startsWith('CODEX-RULE-') ? ref : 'CODEX-RULE-' + ref;
            const rows = await memgraphService.runQuery(
              `MATCH (r:CodexRule) WHERE r.codexId = $key OR r.ruleId = $key OR r.key = $key RETURN r.codexId AS rid LIMIT 1`,
              { key: ruleKey }
            );
            if (rows.length) {
              const rid = rows[0].rid;
              await memgraphService.runQuery(
                `MATCH (s:DialogueSession { sessionId: $sid })
                 MATCH (r:CodexRule { codexId: $rid })
                 MERGE (s)-[:REFERENCES_RULE { source: 'text_reference' }]->(r)`,
                { sid, rid }
              );
              details.codexRules.push(rid);
              sessionLinks.codex++;
            }
          } catch { /* non-fatal */ }
        }

        // Also link ArchDecisions to CodexRules by scanning decision rationale
        try {
          const decRows = await memgraphService.runQuery(
            `MATCH (s:DialogueSession { sessionId: $sid })-[:DECIDED_IN_SESSION]->(d:ArchDecision)
             RETURN d.decisionId AS did, d.rationale AS rat`,
            { sid }
          );
          for (const dec of decRows) {
            const decRefs = extractRefs((dec.rat || ''), CODEX_PATTERNS);
            for (const ref of decRefs) {
              const ruleKey = ref.toUpperCase().startsWith('CODEX-RULE-') ? ref : 'CODEX-RULE-' + ref;
              const rows = await memgraphService.runQuery(
                `MATCH (r:CodexRule) WHERE r.codexId = $key OR r.ruleId = $key OR r.key = $key RETURN r.codexId AS rid LIMIT 1`,
                { key: ruleKey }
              );
              if (rows.length) {
                await memgraphService.runQuery(
                  `MATCH (d:ArchDecision { decisionId: $did })
                   MATCH (r:CodexRule { codexId: $rid })
                   MERGE (d)-[:FOLLOWS_RULE]->(r)`,
                  { did: dec.did, rid: rows[0].rid }
                );
                sessionLinks.codex++;
              }
            }
          }
        } catch { /* non-fatal */ }
      }

      // ── Type 3: Catalog references ────────────────────────────────────────
      if (linkTypes.includes('catalog')) {
        const refs = extractRefs(searchText, CATALOG_PATTERNS);
        for (const ref of refs) {
          try {
            const rows = await memgraphService.runQuery(
              `MATCH (c:CatalogEntry) WHERE c.name CONTAINS $ref OR c.executorId = $ref RETURN c.name AS name LIMIT 1`,
              { ref }
            );
            if (rows.length) {
              await memgraphService.runQuery(
                `MATCH (s:DialogueSession { sessionId: $sid })
                 MATCH (c:CatalogEntry { name: $name })
                 MERGE (s)-[:REFERENCES_GRAPH { source: 'executor_mention' }]->(c)`,
                { sid, name: rows[0].name }
              );
              details.catalogRefs.push(rows[0].name);
              sessionLinks.catalog++;
            }
          } catch { /* non-fatal */ }
        }
      }

      // ── Type 4: Conversation chains ───────────────────────────────────────
      if (linkTypes.includes('chains')) {
        try {
          const { DialogueQdrantService } = require('../services/dialogue.qdrant');
          const qdrantService = new DialogueQdrantService();

          // Get this session's summary embedding from Qdrant
          const crypto = require('crypto');
          const toUuid = (s) => {
            const h = crypto.createHash('md5').update(s).digest('hex');
            return [h.slice(0,8),h.slice(8,12),'4'+h.slice(13,16),((parseInt(h[16],16)&0x3)|0x8).toString(16)+h.slice(17,20),h.slice(20,32)].join('-');
          };

          const { EmbeddingService } = require('../../../../../services/structuring/embeddings/EmbeddingService');
          const embService = new EmbeddingService();

          const summary = sessProps.summary || sessProps.title || '';
          if (summary.length > 20) {
            const qvec = await embService.generateEmbedding(summary);
            const similar = await qdrantService.search(
              qvec, 'summary',
              { must: [{ key: 'node_type', match: { value: 'session' } }] },
              10
            );

            const sessStartTs = sessProps.startedAt ? new Date(sessProps.startedAt).getTime() : 0;

            for (const hit of similar) {
              const otherSid = hit.payload?.sessionId;
              if (!otherSid || otherSid === sid) continue;
              if (hit.score < chainThreshold) continue;

              // Temporal proximity factor
              const otherTs = hit.payload?.startedAt ? new Date(hit.payload.startedAt).getTime() : 0;
              const hoursDiff = Math.abs(sessStartTs - otherTs) / (1000 * 3600);
              const temporalProximity = Math.exp(-hoursDiff / 48);
              const chainScore = 0.15 * temporalProximity + 0.85 * hit.score;

              if (chainScore >= chainThreshold) {
                await memgraphService.runQuery(
                  `MATCH (s1:DialogueSession { sessionId: $sid1 })
                   MATCH (s2:DialogueSession { sessionId: $sid2 })
                   MERGE (s1)-[:CONTINUES_FROM { score: $score, reason: 'semantic_similarity' }]->(s2)`,
                  { sid1: sid, sid2: otherSid, score: Math.round(chainScore * 1000) / 1000 }
                );
                details.chainedSessions.push({ to: otherSid, score: chainScore });
                sessionLinks.chains++;
              }
            }
          }
        } catch (err) {
          console.warn(`[dialogue.link] Chain detection failed for ${sid}: ${err.message}`);
        }
      }

      // Mark session as linked
      await memgraphService.runQuery(
        `MATCH (s:DialogueSession { sessionId: $sid }) SET s.linkedAt = $ts`,
        { sid, ts: new Date().toISOString() }
      ).catch(() => {});

      for (const k of Object.keys(globalStats.linksCreated)) {
        globalStats.linksCreated[k] += sessionLinks[k];
      }
      globalStats.sessionsProcessed++;
      allDetails.push(details);

      const total = Object.values(sessionLinks).reduce((a, b) => a + b, 0);
      if (total > 0) {
        console.log(`[dialogue.link] ${sid.slice(0, 8)}: +${sessionLinks.backlog}bl +${sessionLinks.codex}cx +${sessionLinks.catalog}cat +${sessionLinks.chains}chain`);
      }
    }

    return createSuccessResult(
      { sessionIds, linksCreated: globalStats.linksCreated, details: allDetails, stats: globalStats },
      globalStats,
      1.0
    );
  },
});

module.exports = { dialogueLinkExecutor };

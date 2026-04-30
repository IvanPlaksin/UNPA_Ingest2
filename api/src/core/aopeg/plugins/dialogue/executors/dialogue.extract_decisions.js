/**
 * dialogue.extract_decisions executor
 * Two-pass ADR extraction from dialogue segments.
 * Pass 1: fast marker scoring to find candidate segments.
 * Pass 2: LLM structured extraction on candidates.
 */

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');
const crypto = require('crypto');

// ── Pass 1: Marker patterns ──────────────────────────────────────────────────

const MARKERS = {
  explicit: [
    /принято решение/i, /решено использовать/i, /выбираем подход/i,
    /договорились/i, /утверждаю/i, /подход выбран/i,
    /let'?s go with/i, /decided to/i, /we'?ll use/i, /going with/i,
    /approach chosen/i, /agreed on/i, /approved/i,
  ],
  comparative: [
    /вместо /i, / а не /i, /\bvs\.?\s/i, /instead of/i,
    /отказываемся от/i, /rejected in favour/i,
  ],
  rejection: [
    /антипаттерн/i, /не использу(ем|ем)/i, /не подходит/i,
    /отклоняем/i, /won'?t use/i, /not going with/i, /dropped/i,
  ],
  convention: [
    /convention:/i, /правило:/i, /всегда использовать/i, /никогда не/i,
    /we always/i, /must (never|always)/i,
  ],
  reference: [
    /BACKLOG-\d{3,}/,
    /TASK-[A-Z]+-[A-Z0-9]+-\d+/,
    /CODEX-RULE-[A-Z]+-\d+/,
    /ADR-\d+/,
  ],
};

const MARKER_WEIGHTS = { explicit: 3, comparative: 2, rejection: 2, convention: 2, reference: 1 };
const CANDIDATE_THRESHOLD = 2;

function scoreSegment(text) {
  let score = 0;
  const matched = [];
  for (const [category, patterns] of Object.entries(MARKERS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        score += MARKER_WEIGHTS[category];
        matched.push(category);
        break; // one match per category per pattern group
      }
    }
  }
  return { score, matched: [...new Set(matched)] };
}

// ── Pass 2: LLM extraction ───────────────────────────────────────────────────

const EXTRACT_PROMPT = (text) => `You are an expert at identifying architecture decisions in development dialogues.

Extract any architecture decisions from this dialogue segment.
For each decision found, return a JSON object with these fields:
- title: short descriptive title (5-10 words)
- context: why this decision was needed (1-2 sentences)
- decision: what was decided (1-2 sentences)
- rationale: why this option was chosen (1-2 sentences)
- alternatives: array of strings — rejected alternatives with brief reasons
- consequences: array of strings — implications or tradeoffs
- category: one of ["architecture","technology","pattern","convention","rejection"]
- confidence: number 0.0-1.0 — how certain this is a real architectural decision

Return a JSON array. If no decisions found, return [].

Dialogue segment:
${text}

JSON:`;

async function extractWithLLM(llmService, text, model) {
  try {
    const result = await llmService.chat(
      [{ role: 'user', content: EXTRACT_PROMPT(text.slice(0, 4000)) }],
      [],
      null,
      { model, maxTokens: 800 }
    );
    const raw = (result.content || '').trim();
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, raw];
    const jsonStr = jsonMatch[1].trim();
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeDecisionId(sessionId, segmentId, title) {
  const hash = crypto.createHash('md5')
    .update(sessionId + ':' + segmentId + ':' + title)
    .digest('hex')
    .slice(0, 12);
  return 'adr_' + hash;
}

const dialogueExtractDecisionsExecutor = createSimpleExecutor({
  type: 'dialogue.extract_decisions',
  displayName: 'Decision Extraction',
  description: 'Extract architecture decisions (ADRs) from dialogue segments using two-pass approach',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: { type: 'string', description: 'Session ID to process' },
      minConfidence: { type: 'number', default: 0.5 },
      categories: { type: 'array', items: { type: 'string' }, description: 'Filter by category' },
      useLLM: { type: 'boolean', default: true },
      model: { type: 'string', default: 'claude-haiku-4-5-20251001' },
    },
  },

  async execute(params, context) {
    const sessionId = params.sessionId || context.input?.sessionId;
    if (!sessionId) {
      return createErrorResult('EXTRACT_ERROR', 'Provide "sessionId"', false);
    }

    const minConfidence = params.minConfidence ?? 0.5;
    const useLLM = params.useLLM !== false;
    const model = params.model || process.env.SUMMARY_MODEL || 'claude-haiku-4-5-20251001';

    let memgraphService;
    try { memgraphService = require('../../../../../services/memgraph.service'); } catch (e) {
      return createErrorResult('EXTRACT_ERROR', `MemgraphService unavailable: ${e.message}`, true);
    }

    let llmService = null;
    if (useLLM) {
      try { llmService = require('../../../../../services/llm.service'); } catch { /* fallback */ }
    }

    // Load segments with their messages from Memgraph + JSONL
    const sessRows = await memgraphService.runQuery(
      `MATCH (s:DialogueSession { sessionId: $sid }) RETURN s`,
      { sid: sessionId }
    );
    if (!sessRows?.length) {
      return createErrorResult('EXTRACT_ERROR', `Session ${sessionId} not found`, false);
    }
    const sessProps = sessRows[0]?.s?.properties || sessRows[0]?.s || sessRows[0];

    // Load the dialogue to get actual message text
    const { dialogueNormalizer } = require('../services/dialogue.normalizer');
    const dialogue = dialogueNormalizer.parseClaudeCodeSession(sessProps.sourceFile);
    if (!dialogue) {
      return createErrorResult('EXTRACT_ERROR', `Cannot parse JSONL for session ${sessionId}`, true);
    }
    const messages = dialogue.messages || [];

    // Load segment ranges
    const segRows = await memgraphService.runQuery(
      `MATCH (s:DialogueSession { sessionId: $sid })-[:HAS_SEGMENT]->(seg:DialogueSegment)
       RETURN seg.segmentId AS segmentId, seg.startTurn AS startTurn, seg.endTurn AS endTurn,
              seg.index AS idx
       ORDER BY seg.index`,
      { sid: sessionId }
    );

    if (!segRows?.length) {
      return createErrorResult('EXTRACT_ERROR', `No segments for session ${sessionId} — run dialogue.segment first`, false);
    }

    const stats = {
      segmentsAnalyzed: segRows.length,
      candidateSegments: 0,
      decisionsExtracted: 0,
      decisionsSkipped: 0,
      byCategory: {},
      byConfidence: { high: 0, medium: 0, low: 0 },
    };

    const allDecisions = [];

    for (const seg of segRows) {
      const start = Number(seg.startTurn);
      const end = Number(seg.endTurn);
      const segMsgs = messages.slice(start, end);

      const rawText = segMsgs
        .map(m => `${m.participant || m.role}: ${m.text.slice(0, 800)}`)
        .join('\n');

      // Pass 1: marker scoring
      const { score, matched } = scoreSegment(rawText);
      if (score < CANDIDATE_THRESHOLD) continue;

      stats.candidateSegments++;

      // Pass 2: LLM extraction
      let extracted = [];
      if (llmService) {
        extracted = await extractWithLLM(llmService, rawText, model);
      }

      // Filter by confidence and optional category filter
      for (const dec of extracted) {
        if ((dec.confidence ?? 0) < minConfidence) {
          stats.decisionsSkipped++;
          continue;
        }
        if (params.categories?.length && !params.categories.includes(dec.category)) {
          stats.decisionsSkipped++;
          continue;
        }

        const decisionId = makeDecisionId(sessionId, seg.segmentId, dec.title || '');
        const status = (dec.confidence ?? 0) >= 0.7 ? 'accepted' : 'proposed';

        // Store in Memgraph
        try {
          await memgraphService.runQuery(
            `MERGE (d:ArchDecision { decisionId: $decisionId })
             ON CREATE SET
               d.title = $title,
               d.context = $context,
               d.decision = $decision,
               d.rationale = $rationale,
               d.alternatives = $alternatives,
               d.consequences = $consequences,
               d.category = $category,
               d.confidence = $confidence,
               d.status = $status,
               d.sessionId = $sessionId,
               d.segmentId = $segmentId,
               d.namespace = 'DIALOGUE',
               d.createdAt = $createdAt
             ON MATCH SET
               d.confidence = $confidence,
               d.status = $status`,
            {
              decisionId,
              title: dec.title || '',
              context: dec.context || '',
              decision: dec.decision || '',
              rationale: dec.rationale || '',
              alternatives: JSON.stringify(dec.alternatives || []),
              consequences: JSON.stringify(dec.consequences || []),
              category: dec.category || 'architecture',
              confidence: dec.confidence ?? 0.5,
              status,
              sessionId,
              segmentId: seg.segmentId,
              createdAt: new Date().toISOString(),
            }
          );

          // DECIDED_IN → segment
          await memgraphService.runQuery(
            `MATCH (d:ArchDecision { decisionId: $did }), (seg:DialogueSegment { segmentId: $segId })
             MERGE (d)-[:DECIDED_IN]->(seg)`,
            { did: decisionId, segId: seg.segmentId }
          );

          // DECIDED_IN_SESSION → session
          await memgraphService.runQuery(
            `MATCH (d:ArchDecision { decisionId: $did }), (s:DialogueSession { sessionId: $sid })
             MERGE (d)-[:DECIDED_IN_SESSION]->(s)`,
            { did: decisionId, sid: sessionId }
          );
        } catch (err) {
          console.warn(`[dialogue.extract_decisions] Memgraph store failed for ${decisionId}: ${err.message}`);
        }

        // Track stats
        stats.byCategory[dec.category] = (stats.byCategory[dec.category] || 0) + 1;
        const conf = dec.confidence ?? 0;
        if (conf >= 0.7) stats.byConfidence.high++;
        else if (conf >= 0.5) stats.byConfidence.medium++;
        else stats.byConfidence.low++;

        stats.decisionsExtracted++;
        allDecisions.push({ decisionId, ...dec, status, sessionId, segmentId: seg.segmentId });
      }
    }

    console.log(`[dialogue.extract_decisions] Session ${sessionId}: ${stats.segmentsAnalyzed} segments analyzed, ${stats.candidateSegments} candidates, ${stats.decisionsExtracted} decisions extracted`);

    return createSuccessResult({ sessionId, decisions: allDecisions, stats }, stats, 1.0);
  },
});

module.exports = { dialogueExtractDecisionsExecutor };

'use strict';
const { createEnvelope, PROJECTION_KIND } = require('../../../constants/canonical-graph.constants');

/**
 * SYNTHESIZE primitive — generate a grounded narrative over existing session evidence.
 * Output: CGE envelope (projection.kind = 'text'), no nodes/edges.
 */

const PRIMITIVE_TYPE = 'SYNTHESIZE';

const inputSchema = {
  focus: { type: 'string' },
  format: { type: 'string', default: 'summary' },
};

function _makeEnvelope(roots, summary) {
  const envelope = createEnvelope({ roots, kind: PROJECTION_KIND.TEXT, hints: {}, producedBy: 'TOOL', toolId: 'investigation.synthesize' });
  envelope.summary = summary;
  return envelope;
}

async function execute(params, context, services) {
  const { anthropicClient } = services;
  const { focus = '', format = 'summary' } = params;

  // Build evidence corpus from existing session artifacts
  const corpus = buildEvidenceCorpus(context.artifactsSummary || []);

  if (!corpus.evidencedBy.length) {
    return {
      content: _makeEnvelope([], {
        narrative: 'No evidence has been collected yet. Run a LOCATE, CONNECT, or EXPAND query first.',
        claimsWithEvidence: [], focus, format, evidenceCount: 0,
      }),
      evidencedBy: [],
    };
  }

  let narrative;
  if (anthropicClient) {
    narrative = await generateNarrative(anthropicClient, corpus, focus, format);
  } else {
    narrative = buildFallbackNarrative(corpus, focus);
  }

  return {
    content: _makeEnvelope(corpus.evidencedBy, {
      narrative:          narrative.text,
      claimsWithEvidence: narrative.claims,
      focus,
      format,
      evidenceCount:      corpus.evidencedBy.length,
    }),
    evidencedBy: corpus.evidencedBy,
  };
}

function buildEvidenceCorpus(artifactsSummary) {
  const allEntityIds = new Set();
  const summaryParts = [];

  for (const artifact of artifactsSummary) {
    if (artifact.evidencedBy) {
      artifact.evidencedBy.forEach(id => allEntityIds.add(id));
    }
    summaryParts.push(`[${artifact.primitiveType}] ${JSON.stringify(artifact.contentSummary || {})}`);
  }

  return {
    evidencedBy: Array.from(allEntityIds),
    summaryText: summaryParts.join('\n'),
  };
}

async function generateNarrative(anthropicClient, corpus, focus, format) {
  const focusClause = focus ? `Focus specifically on: ${focus}.` : '';
  const formatClause = format === 'bullets' ? 'Use bullet points.' : format === 'report' ? 'Write as a formal report.' : 'Write as a concise summary.';

  const prompt = `You are analyzing findings from a knowledge base investigation.
Based ONLY on the following retrieved evidence (do not add external knowledge), synthesize the findings.
${focusClause}
${formatClause}

Evidence collected:
${corpus.summaryText}

Produce:
1. A narrative synthesis (2-4 paragraphs or equivalent bullets)
2. A list of key claims, each grounded in the evidence

Return JSON: { "text": "...", "claims": [{"claim": "...", "evidenceNote": "..."}] }`;

  try {
    const message = await anthropicClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0]?.text || '';
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return { text: parsed.text || responseText, claims: parsed.claims || [] };
    }
    return { text: responseText, claims: [] };
  } catch {
    return { text: buildFallbackNarrative(corpus).text, claims: [] };
  }
}

function buildFallbackNarrative(corpus, focus) {
  return {
    text: `Investigation summary${focus ? ` (focus: ${focus})` : ''}: ${corpus.evidencedBy.length} knowledge base entities examined across collected artifacts.`,
    claims: [],
  };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };

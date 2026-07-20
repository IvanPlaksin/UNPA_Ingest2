'use strict';
const { createEnvelope, PROJECTION_KIND } = require('../../../constants/canonical-graph.constants');

/**
 * TEXT primitive — manual text note / annotation created by the investigator.
 * Output: CGE envelope (projection.kind = 'text'), no nodes/edges.
 */

const PRIMITIVE_TYPE = 'TEXT';

const inputSchema = {
  title:       { type: 'string', required: true },
  body:        { type: 'string', required: true },
  evidencedBy: { type: 'array' },
};

async function execute(params, _context, _services) {
  const { title, body, evidencedBy = [] } = params;
  if (!title?.trim()) throw new Error('TEXT primitive requires a title');
  if (!body?.trim()) throw new Error('TEXT primitive requires a body');

  const wordCount = body.trim().split(/\s+/).length;

  const envelope = createEnvelope({
    roots:      evidencedBy,
    kind:       PROJECTION_KIND.TEXT,
    hints:      {},
    producedBy: 'TOOL',
    toolId:     'investigation.text',
  });

  envelope.summary = {
    title:       title.trim(),
    body:        body.trim(),
    wordCount,
    hasEvidence: evidencedBy.length > 0,
  };

  return { content: envelope, evidencedBy };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };

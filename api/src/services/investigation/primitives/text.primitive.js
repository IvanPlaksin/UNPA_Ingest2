'use strict';

/**
 * TEXT primitive — manual text note / annotation created by the investigator.
 *
 * Does NOT acquire new KB evidence. Does NOT trigger evidentiary versioning.
 * A logical version checkpoint is cut at commit time.
 *
 * Input params:
 *   title       {string} required — short title for the note
 *   body        {string} required — note body (markdown supported)
 *   evidencedBy {string[]} optional — explicit KB entity IDs this note references
 *
 * Output (artifact content):
 *   title:      string
 *   body:       string
 *   wordCount:  number
 *   hasEvidence: boolean
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

  return {
    content: {
      title: title.trim(),
      body: body.trim(),
      wordCount,
      hasEvidence: evidencedBy.length > 0,
    },
    evidencedBy,
  };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };

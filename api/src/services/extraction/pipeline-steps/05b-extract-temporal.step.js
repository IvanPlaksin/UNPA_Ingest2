'use strict';

/**
 * Step 05b — Extract Temporal Data
 *
 * Uses Claude Code CLI (single turn, no MCP) to extract:
 *   1. Document dates (adoption, entry into force, expiry, mandate period, etc.)
 *   2. Supersession relationships (this document supersedes/amends/extends/revokes another)
 *
 * Results are stored on ctx:
 *   ctx.temporalData      — { documentDates: [], mandatePeriod: {} | null }
 *   ctx.supersessionLinks — [{ relationType, targetDocumentRef, scope, effectiveFrom, evidence, confidence }]
 *
 * Auto-registers unknown date types in DateTypeRegistry.
 * Non-fatal: failure is logged and the pipeline continues.
 */

const { addLog, startStep, completeStep, skipStep } = require('../pipeline-context');
const { runClaudeCode, CLAUDE_CODE_MODEL } = require('../../knowledge/document-ai-extraction.service');

const TEMPORAL_TIMEOUT_MS = 120000; // 2 min — simple prompt, should be fast

// ─── Supersession regex patterns (re-used from policy-portal.source.js logic) ─

const SUPERSESSION_PATTERNS = [
  { re: /supersedes?\s+([\w/.()\-\s]{5,60}?)(?=[,;.\s])/gi,  relType: 'SUPERSEDES'  },
  { re: /revokes?\s+([\w/.()\-\s]{5,60}?)(?=[,;.\s])/gi,     relType: 'REVOKES'     },
  { re: /replaces?\s+([\w/.()\-\s]{5,60}?)(?=[,;.\s])/gi,    relType: 'SUPERSEDES'  },
  { re: /cancels?\s+([\w/.()\-\s]{5,60}?)(?=[,;.\s])/gi,     relType: 'REVOKES'     },
  { re: /amends?\s+([\w/.()\-\s]{5,60}?)(?=[,;.\s])/gi,      relType: 'AMENDS'      },
  { re: /shall cease to have effect/gi,                        relType: 'REVOKES', noCapture: true },
];

// ─── AI Prompt ─────────────────────────────────────────────────────────────────

/**
 * Build a text excerpt that covers start + end of document.
 * UN documents often have adoption date/closing formula only in the last paragraphs.
 */
function _buildTextExcerpt(text) {
  const HEAD = 10000;
  const TAIL = 4000;
  if (text.length <= HEAD + TAIL) return text;
  return text.slice(0, HEAD) + '\n\n[... middle section omitted ...]\n\n' + text.slice(-TAIL);
}

function buildTemporalPrompt(text, doc) {
  const meta = [
    doc.documentTitle ? `Title: ${doc.documentTitle}` : '',
    doc.unSymbol      ? `Symbol: ${doc.unSymbol}`      : '',
    doc.documentType  ? `Type: ${doc.documentType}`    : '',
    doc.publishedDate ? `Published: ${doc.publishedDate}` : '',
  ].filter(Boolean).join(' | ');

  const excerpt = _buildTextExcerpt(text);

  return `You are a UN legal document analyst specializing in temporal analysis of official UN documents.

DOCUMENT: ${meta || 'Unknown'}

DOCUMENT TEXT (beginning + closing section included):
${excerpt}

TASK: Extract ALL temporal information from this document. Be thorough — read every sentence.

---

DATE TYPES to look for:

LIFECYCLE:
  ADOPTION_DATE          — when the document was formally adopted by the body
  ENTRY_INTO_FORCE       — when it becomes legally binding (may differ from adoption)
  OPERATIONAL_DATE       — when practical measures take effect (may differ from entry into force)
  PROVISIONAL_APPLICATION — provisional binding before formal entry into force
  SIGNATURE_DATE         — when document was opened for signature
  RATIFICATION_DEADLINE  — deadline for ratification/accession

VALIDITY:
  MANDATE_START          — when a mandate, mission, or authority formally begins
  MANDATE_END            — when a mandate expires unless renewed
  EXPIRY_DATE            — when a document or measure ceases to have legal effect
  EXTENSION_DATE         — new end date after renewal/extension by a subsequent document
  TERMINATION_DATE       — when a mandate was explicitly terminated by decision

REVIEW:
  REVIEW_DATE            — scheduled date for review of the document or measures
  REPORTING_DATE         — deadline by which a report must be submitted
  IMPLEMENTATION_DEADLINE — deadline for implementing specific measures

COVERAGE:
  REPORTING_PERIOD_START — start of period covered by this report/assessment
  REPORTING_PERIOD_END   — end of period covered by this report/assessment

If you find a date type that does not fit any of the above, use a descriptive SNAKE_CASE code of your own.

---

SUPERSESSION RELATIONSHIPS to look for:

relationType values:
  SUPERSEDES           — this document fully replaces another
  REVOKES              — this document explicitly revokes/annuls another (strongest form)
  AMENDS               — this document modifies specific provisions of another
  EXTENDS              — this document extends the validity/mandate of another to a new date
  RENEWS               — this document renews the mandate of another for a new period
  SUPPLEMENTS          — this document adds to another without replacing it
  PARTIALLY_SUPERSEDES — this document partially replaces another (only specific paragraphs/sections)

Language patterns to detect:
  "supersedes resolution X" / "revokes resolution X" / "replaces [document]"
  "decides that resolution X shall cease to have effect"
  "amends paragraph N of resolution X"
  "decides to extend... until [DATE]" → EXTENDS toward the previously authorized document
  "decides to renew... for a period of N months" → RENEWS the mandate
  "supplements... by adding" → SUPPLEMENTS
  "with respect to paragraphs 1-3 of resolution X" → PARTIALLY_SUPERSEDES

---

Return ONLY a JSON object with EXACTLY this structure — no markdown, no explanation:

{
  "documentDates": [
    {
      "dateType": "DATE_TYPE_CODE",
      "dateValue": "ISO 8601 date string (YYYY-MM-DD or YYYY-MM or YYYY) OR duration like 'P12M' OR null if only relative (e.g. '30 days after')",
      "dateText": "verbatim text from document that mentions this date",
      "confidence": 0.0-1.0
    }
  ],
  "mandatePeriod": {
    "startDate": "ISO date or null",
    "endDate": "ISO date or null",
    "durationText": "e.g. '12 months' or null",
    "evidence": "verbatim text"
  },
  "supersessionLinks": [
    {
      "relationType": "SUPERSEDES|REVOKES|AMENDS|EXTENDS|RENEWS|SUPPLEMENTS|PARTIALLY_SUPERSEDES",
      "targetDocumentRef": "exact UN symbol or title of the document being superseded/amended/extended",
      "scope": "full OR description of partial scope (e.g. 'paragraph 3', 'Annex I', 'sections I-III')",
      "effectiveFrom": "ISO date string or null",
      "evidence": "verbatim sentence(s) from the document proving this relationship (up to 400 chars)",
      "confidence": 0.0-1.0
    }
  ]
}

RULES:
- Only extract dates EXPLICITLY stated in the document; do not infer
- Omit entries with confidence < 0.5
- If mandatePeriod is not mentioned, set it to null
- If no documentDates found, return empty array
- If no supersession found, return empty array
- dateValue: use null when the date is clearly described but expressed only as relative offset (e.g. "90 days after signature")`;
}

// ─── Pipeline step ─────────────────────────────────────────────────────────────

module.exports = async function extractTemporalStep(ctx) {
  // Skip if not DOCUMENT mode or no text to analyse
  if (!ctx.text || ctx.text.length < 100) {
    skipStep(ctx, 'extract-temporal', 'No document text available');
    return;
  }

  // Initialise ctx fields even on skip so downstream steps can safely read them
  ctx.temporalData      = { documentDates: [], mandatePeriod: null };
  ctx.supersessionLinks = [];

  // Always run regex-based supersession detection first (fast, no API cost)
  const regexLinks = _detectSupersessionViaRegex(ctx.text);
  if (regexLinks.length > 0) {
    ctx.supersessionLinks = regexLinks;
    addLog(ctx, 'extract-temporal', `Regex supersession: ${regexLinks.length} candidate(s) found`);
  }

  // Skip AI extraction if not a DOCUMENT mode or if explicitly disabled
  if (ctx.mode !== 'DOCUMENT' || ctx.options?.skipTemporalExtraction) {
    skipStep(ctx, 'extract-temporal', 'Temporal AI extraction disabled for this mode/run');
    return;
  }

  startStep(ctx, 'extract-temporal');

  try {
    // Always use the actual model ID — DEFAULT_MODEL ('claude-code') is a UI alias, not a CLI model name
    const model = ctx.options?.temporalModel || CLAUDE_CODE_MODEL;
    const doc   = ctx.sourceRef || {};

    const prompt = buildTemporalPrompt(ctx.text, doc);

    addLog(ctx, 'extract-temporal', `Running temporal AI extraction (model=${model}, textLen=${ctx.text.length})`);
    const rawResponse = await runClaudeCode(prompt, model, TEMPORAL_TIMEOUT_MS);

    const parsed = _parseTemporalResponse(rawResponse);

    // Merge AI results with regex results (AI is authoritative, regex fills gaps)
    ctx.temporalData = {
      documentDates: parsed.documentDates || [],
      mandatePeriod: parsed.mandatePeriod || null,
    };

    // Merge supersession links — AI links override regex, add unique ones
    const aiLinks = parsed.supersessionLinks || [];
    const mergedLinks = [...aiLinks];
    for (const regexLink of regexLinks) {
      const alreadyCovered = aiLinks.some(al =>
        al.targetDocumentRef?.toLowerCase().includes(regexLink.targetDocumentRef?.toLowerCase() || '')
      );
      if (!alreadyCovered) mergedLinks.push(regexLink);
    }
    ctx.supersessionLinks = mergedLinks;

    // Auto-register unknown date types
    await _autoRegisterDateTypes(parsed.documentDates || [], ctx.sourceId);

    const dateCount        = ctx.temporalData.documentDates.length;
    const supersessionCount = ctx.supersessionLinks.length;
    addLog(ctx, 'extract-temporal', `Found ${dateCount} date(s), ${supersessionCount} supersession link(s)`);

    completeStep(ctx, 'extract-temporal', {
      dateCount,
      supersessionCount,
      hasMandatePeriod: !!ctx.temporalData.mandatePeriod,
      dateTypes: ctx.temporalData.documentDates.map(d => d.dateType),
    });
  } catch (err) {
    // Non-fatal — log and skip
    addLog(ctx, 'extract-temporal', `Temporal extraction failed (non-fatal): ${err.message}`, 'warn');
    // Use whatever regex found, or empty
    skipStep(ctx, 'extract-temporal', `AI extraction failed: ${err.message}`);
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _parseTemporalResponse(raw) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

  // Strip markdown fences if present
  const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  // Try to find JSON object
  const objMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!objMatch) return { documentDates: [], mandatePeriod: null, supersessionLinks: [] };

  try {
    const parsed = JSON.parse(objMatch[0]);
    return {
      documentDates:    Array.isArray(parsed.documentDates)    ? parsed.documentDates    : [],
      mandatePeriod:    parsed.mandatePeriod && typeof parsed.mandatePeriod === 'object' ? parsed.mandatePeriod : null,
      supersessionLinks: Array.isArray(parsed.supersessionLinks) ? parsed.supersessionLinks : [],
    };
  } catch {
    return { documentDates: [], mandatePeriod: null, supersessionLinks: [] };
  }
}

function _detectSupersessionViaRegex(text) {
  const links = [];
  const preview = text.slice(0, 8000); // check first 8000 chars where operative clauses appear

  for (const { re, relType, noCapture } of SUPERSESSION_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(preview)) !== null) {
      if (noCapture) {
        // Just note that something is superseded — no specific target
        links.push({
          relationType: relType,
          targetDocumentRef: null,
          scope: 'full',
          effectiveFrom: null,
          evidence: m[0].slice(0, 200),
          confidence: 0.55,
          viaRegex: true,
        });
      } else {
        const ref = (m[1] || '').trim().replace(/\.$/, '');
        if (ref.length >= 5) {
          links.push({
            relationType: relType,
            targetDocumentRef: ref,
            scope: 'full',
            effectiveFrom: null,
            evidence: m[0].slice(0, 200),
            confidence: 0.65,
            viaRegex: true,
          });
        }
      }
    }
  }

  return links;
}

async function _autoRegisterDateTypes(documentDates, documentId) {
  const { dateTypeRegistryService } = require('../../knowledge/date-type-registry.service');
  const BUILT_IN_CODES = new Set([
    'ADOPTION_DATE', 'ENTRY_INTO_FORCE', 'OPERATIONAL_DATE', 'PROVISIONAL_APPLICATION',
    'SIGNATURE_DATE', 'RATIFICATION_DEADLINE', 'MANDATE_START', 'MANDATE_END',
    'EXPIRY_DATE', 'EXTENSION_DATE', 'TERMINATION_DATE', 'REVIEW_DATE',
    'REPORTING_DATE', 'IMPLEMENTATION_DEADLINE', 'REPORTING_PERIOD_START', 'REPORTING_PERIOD_END',
  ]);
  for (const entry of documentDates) {
    if (!entry.dateType) continue;
    const code = String(entry.dateType).toUpperCase().replace(/[\s-]/g, '_');
    if (!BUILT_IN_CODES.has(code)) {
      await dateTypeRegistryService.autoRegister(code, {
        category:   'DISCOVERED',
        documentId,
        evidence:   entry.dateText || null,
      }).catch(() => {});
    } else {
      // Increment usage count for built-in types too
      await dateTypeRegistryService.autoRegister(code, { documentId }).catch(() => {});
    }
  }
}

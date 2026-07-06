'use strict';

/**
 * DateTypeRegistry Service
 *
 * Auto-updating catalog of document date types.
 * Built-in types are seeded at startup.
 * When the AI extracts an unknown date type during temporal extraction,
 * it is automatically registered here.
 *
 * Memgraph node: (:DateTypeRegistry { code, displayName, category, ... })
 */

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

// ─── Built-in Date Types ──────────────────────────────────────────────────────
// Derived from UN document practice, Vienna Convention, SC/GA resolution patterns.

const BUILT_IN_DATE_TYPES = [
  // Document lifecycle
  {
    code:        'ADOPTION_DATE',
    displayName: 'Adoption Date',
    description: 'Date when the document was formally adopted/passed by the relevant body.',
    category:    'LIFECYCLE',
    examples:    ['Adopted on 15 November 2023', 'Passed by the General Assembly on...'],
  },
  {
    code:        'ENTRY_INTO_FORCE',
    displayName: 'Entry into Force',
    description: 'Date when the document becomes legally binding. May differ from adoption date (e.g. requires ratification or a set number of states).',
    category:    'LIFECYCLE',
    examples:    ['Shall enter into force upon adoption', 'Enters into force 30 days after...', 'Entry into force: 1 January 2024'],
  },
  {
    code:        'OPERATIONAL_DATE',
    displayName: 'Operational / Effective Date',
    description: 'Date when the practical measures described in the document take effect — may differ from entry into force.',
    category:    'LIFECYCLE',
    examples:    ['Effective from 1 March 2024', 'Operational from the date of adoption'],
  },
  {
    code:        'PROVISIONAL_APPLICATION',
    displayName: 'Provisional Application Date',
    description: 'Date from which a state gives effect to treaty obligations before completing domestic ratification.',
    category:    'LIFECYCLE',
    examples:    ['Applied provisionally from...', 'Provisional application from signature'],
  },
  {
    code:        'SIGNATURE_DATE',
    displayName: 'Signature Date',
    description: 'Date when the document was opened for signature (treaties) or signed by the authorizing party.',
    category:    'LIFECYCLE',
    examples:    ['Opened for signature on...', 'Signed on 20 September 2023'],
  },
  {
    code:        'RATIFICATION_DEADLINE',
    displayName: 'Ratification Deadline',
    description: 'Deadline by which parties must ratify or express consent to be bound.',
    category:    'LIFECYCLE',
    examples:    ['Open for ratification until...', 'States must ratify by...'],
  },
  // Validity / Duration
  {
    code:        'MANDATE_START',
    displayName: 'Mandate Start Date',
    description: 'Date when a mandate, mission, or operational authority formally begins.',
    category:    'VALIDITY',
    examples:    ['Mandate begins on...', 'Authorization commences from...'],
  },
  {
    code:        'MANDATE_END',
    displayName: 'Mandate End / Expiry Date',
    description: 'Date when a mandate, mission, or operational authority expires unless renewed.',
    category:    'VALIDITY',
    examples:    ['Until 31 December 2024', 'Mandate expires on...', 'Authorization valid until...'],
  },
  {
    code:        'EXPIRY_DATE',
    displayName: 'Expiry / Termination Date',
    description: 'Date when a document, regulation, or measure ceases to have legal effect.',
    category:    'VALIDITY',
    examples:    ['Shall cease to have effect on...', 'Expires on...', 'Sunset clause: 2025'],
  },
  {
    code:        'EXTENSION_DATE',
    displayName: 'Extension / Renewal End Date',
    description: 'New end date after a mandate or measure has been extended/renewed by a subsequent document.',
    category:    'VALIDITY',
    examples:    ['Extended until 30 June 2025', 'Renewed for a period of 12 months until...'],
  },
  {
    code:        'TERMINATION_DATE',
    displayName: 'Termination Date',
    description: 'Date when a mandate was explicitly terminated by decision of the relevant body.',
    category:    'VALIDITY',
    examples:    ['Decides to terminate the mandate of... effective...', 'Terminated as of...'],
  },
  // Review / Reporting
  {
    code:        'REVIEW_DATE',
    displayName: 'Review Date',
    description: 'Scheduled date for reviewing the document, measures, or mandate.',
    category:    'REVIEW',
    examples:    ['The Council will review the situation by...', 'To be reviewed no later than...'],
  },
  {
    code:        'REPORTING_DATE',
    displayName: 'Reporting / Report Deadline',
    description: 'Date by which a report must be submitted to the relevant body.',
    category:    'REVIEW',
    examples:    ['Requests the Secretary-General to report by...', 'Report due not later than...'],
  },
  {
    code:        'IMPLEMENTATION_DEADLINE',
    displayName: 'Implementation Deadline',
    description: 'Deadline for implementing specific measures, reforms, or requirements.',
    category:    'REVIEW',
    examples:    ['Member States shall implement by...', 'Full compliance required by...'],
  },
  // Coverage
  {
    code:        'REPORTING_PERIOD_START',
    displayName: 'Reporting Period Start',
    description: 'Start of the period covered by a report or assessment.',
    category:    'COVERAGE',
    examples:    ['This report covers the period from 1 January 2023'],
  },
  {
    code:        'REPORTING_PERIOD_END',
    displayName: 'Reporting Period End',
    description: 'End of the period covered by a report or assessment.',
    category:    'COVERAGE',
    examples:    ['...to 31 December 2023', 'For the period ending...'],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

class DateTypeRegistryService {
  constructor() {
    this._cache = null; // Map<code, {code, displayName, ...}>
  }

  /**
   * Seed all built-in date types into Memgraph (idempotent — uses MERGE).
   * Call once at startup.
   */
  async seedBuiltIns() {
    const now = new Date().toISOString();
    for (const dt of BUILT_IN_DATE_TYPES) {
      await mg().runQuery(
        `MERGE (r:DateTypeRegistry {code: $code})
         ON CREATE SET
           r.displayName          = $displayName,
           r.description          = $description,
           r.category             = $category,
           r.examplesJson         = $examples,
           r.isBuiltIn            = true,
           r.discoveredAt         = $now,
           r.discoveredByDocument = null,
           r.usageCount           = 0
         ON MATCH SET
           r.displayName = $displayName,
           r.description = $description,
           r.category    = $category,
           r.isBuiltIn   = true`,
        {
          code:        dt.code,
          displayName: dt.displayName,
          description: dt.description,
          category:    dt.category,
          examples:    JSON.stringify(dt.examples || []),
          now,
        }
      ).catch(e => console.warn(`[DateTypeRegistry] Seed ${dt.code}: ${e.message}`));
    }
    console.log(`[DateTypeRegistry] Seeded ${BUILT_IN_DATE_TYPES.length} built-in date types`);
  }

  /**
   * Load all date types from Memgraph.
   * Returns Map<code, record>.
   */
  async loadAll() {
    const rows = await mg().runQuery(
      `MATCH (r:DateTypeRegistry)
       RETURN r.code AS code, r.displayName AS displayName, r.description AS description,
              r.category AS category, r.isBuiltIn AS isBuiltIn, r.usageCount AS usageCount,
              r.discoveredAt AS discoveredAt, r.discoveredByDocument AS discoveredByDocument,
              r.firstEvidence AS firstEvidence, r.examplesJson AS examplesJson
       ORDER BY r.category, r.code`,
      {}
    ).catch(() => []);
    const map = new Map();
    for (const row of rows) {
      if (!row.code) continue;
      map.set(row.code, {
        code:                 row.code,
        displayName:          row.displayName          || row.code,
        description:          row.description          || null,
        category:             row.category             || 'OTHER',
        isBuiltIn:            row.isBuiltIn            ?? false,
        usageCount:           row.usageCount           ?? 0,
        discoveredAt:         row.discoveredAt         || null,
        discoveredByDocument: row.discoveredByDocument || null,
        firstEvidence:        row.firstEvidence        || null,
        examples:             row.examplesJson ? (() => { try { return JSON.parse(row.examplesJson); } catch { return []; } })() : [],
      });
    }
    this._cache = map;
    return map;
  }

  /**
   * Get one date type by code. Checks cache first, then Memgraph.
   */
  async getByCode(code) {
    if (this._cache?.has(code)) return this._cache.get(code);
    const rows = await mg().runQuery(
      `MATCH (r:DateTypeRegistry {code: $code})
       RETURN r.code AS code, r.displayName AS displayName, r.description AS description,
              r.category AS category, r.isBuiltIn AS isBuiltIn, r.usageCount AS usageCount,
              r.discoveredAt AS discoveredAt, r.examplesJson AS examplesJson`,
      { code }
    ).catch(() => []);
    if (!rows[0]?.code) return null;
    const row = rows[0];
    return {
      code: row.code, displayName: row.displayName, description: row.description,
      category: row.category, isBuiltIn: row.isBuiltIn, usageCount: row.usageCount,
      discoveredAt: row.discoveredAt,
      examples: row.examplesJson ? (() => { try { return JSON.parse(row.examplesJson); } catch { return []; } })() : [],
    };
  }

  /**
   * Auto-register a new date type discovered by AI during extraction.
   * If the code already exists, increments usageCount and links to document.
   * Returns true if a new type was created, false if it already existed.
   */
  async autoRegister(code, { displayName, description, category, documentId, evidence } = {}) {
    if (!code || typeof code !== 'string') return false;
    const safeCode = code.toUpperCase().replace(/[\s-]/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 64);
    if (!safeCode) return false;

    const now = new Date().toISOString();
    const rows = await mg().runQuery(
      `MERGE (r:DateTypeRegistry {code: $code})
       ON CREATE SET
         r.displayName          = $displayName,
         r.description          = $description,
         r.category             = $category,
         r.isBuiltIn            = false,
         r.discoveredAt         = $now,
         r.discoveredByDocument = $docId,
         r.firstEvidence        = $evidence,
         r.usageCount           = 1
       ON MATCH SET
         r.usageCount           = r.usageCount + 1,
         r.lastSeenAt           = $now,
         r.lastSeenDocument     = $docId
       RETURN r.usageCount AS cnt, (r.discoveredAt = $now) AS isNew`,
      {
        code:        safeCode,
        displayName: displayName || safeCode.replace(/_/g, ' '),
        description: description || `Auto-discovered date type: ${safeCode}`,
        category:    category    || 'OTHER',
        now,
        docId:   documentId || null,
        evidence: evidence   || null,
      }
    ).catch(() => []);

    const isNew = rows[0]?.isNew === true;
    if (isNew) {
      console.log(`[DateTypeRegistry] New date type discovered: ${safeCode} (from doc ${documentId})`);
      this._cache?.set(safeCode, { code: safeCode, displayName, description, category });
    }
    return isNew;
  }

  /**
   * Get list of all date types grouped by category.
   */
  async listGrouped() {
    const all = await this.loadAll();
    const groups = {};
    for (const [, dt] of all) {
      const cat = dt.category || 'OTHER';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(dt);
    }
    return groups;
  }

  /**
   * Validate / normalize a date type code from AI output.
   * Returns the canonical code if it exists in registry, otherwise returns original (will be auto-registered).
   */
  async normalizeCode(rawCode) {
    if (!rawCode) return null;
    const up = String(rawCode).toUpperCase().replace(/[\s-]/g, '_').replace(/[^A-Z0-9_]/g, '').slice(0, 64);

    // Check built-ins first
    if (BUILT_IN_DATE_TYPES.some(dt => dt.code === up)) return up;

    // Check cache
    if (this._cache?.has(up)) return up;

    // Check Memgraph
    const existing = await this.getByCode(up);
    return existing ? up : up; // return normalized form either way (auto-register will handle unknown ones)
  }
}

const dateTypeRegistryService = new DateTypeRegistryService();

module.exports = { dateTypeRegistryService, BUILT_IN_DATE_TYPES };

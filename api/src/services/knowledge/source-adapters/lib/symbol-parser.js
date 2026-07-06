'use strict';
/**
 * UN Document Symbol Parser
 * ─────────────────────────
 * Decomposes a UN document symbol (e.g. "A/RES/78/1", "S/RES/2235(2015)",
 * "ST/SGB/2024/1/Add.1") into its structural components: issuing organ,
 * series/type code, session, document number, year, and any suffix modifier
 * (Add./Corr./Rev./Amend./Reissue).
 *
 * From those components it derives:
 *   - documentType  (mapped to the DocumentType registry ids seeded by
 *                    api/scripts/seed-un-document-types.js)
 *   - epistemicLayer / normativeWeight (constitutional → strategic)
 *   - deterministic document-to-document relations implied by the suffix
 *     (a corrigendum CORRECTS its base, an addendum is HAD by its base, etc.)
 *
 * Pure module — no I/O. Complements `normalizeSymbol()` in ./parse.js, which
 * only does format cleanup and does NOT decompose the symbol.
 *
 * Grammar coverage (real UN symbols):
 *   GA:      A/RES/78/1  A/78/123  A/C.1/78/L.5  A/HRC/RES/52/1  A/HRC/52/1
 *   SC:      S/RES/2235(2015)  S/2024/100  S/PRST/2024/1
 *   ECOSOC:  E/RES/2024/1  E/2024/15  E/CN.4/2005/L.10
 *   Sec.:    ST/SGB/2024/1  ST/AI/2024/2  ST/IC/2024/3
 *   Oversight: JIU/REP/2024/1
 *   Suffix:  /Add.1  /Corr.2  /Rev.1  /Amend.1  /Reissue  /Rev.1/Add.1 (stacked)
 */

const { normalizeSymbol } = require('./parse');

// ── Issuing-organ prefixes ─────────────────────────────────────
// Maps the leading symbol segment to a canonical organ code + label.
const ORGAN_MAP = {
  A:    { organ: 'GA',      label: 'General Assembly' },
  S:    { organ: 'SC',      label: 'Security Council' },
  E:    { organ: 'ECOSOC',  label: 'Economic and Social Council' },
  T:    { organ: 'TC',      label: 'Trusteeship Council' },
  ST:   { organ: 'SEC',     label: 'Secretariat' },
  JIU:  { organ: 'JIU',     label: 'Joint Inspection Unit' },
  CEB:  { organ: 'CEB',     label: 'Chief Executives Board' },
  DP:   { organ: 'UNDP',    label: 'UN Development Programme' },
  TD:   { organ: 'UNCTAD',  label: 'UN Conference on Trade and Development' },
};

// ── Series / type codes (second-position tokens) ───────────────
// Present when a symbol carries an explicit series code before the numbers.
const SERIES_CODES = new Set([
  'RES',   // resolution
  'DEC',   // decision
  'PRST',  // presidential statement (SC)
  'PV',    // verbatim record (procès-verbal)
  'SR',    // summary record
  'INF',   // information series
  'L',     // limited distribution (draft)
  'CRP',   // conference room paper
  'WP',    // working paper
  'NGO',   // NGO written statement
  'SGB',   // Secretary-General's Bulletin (ST/SGB)
  'AI',    // Administrative Instruction (ST/AI)
  'IC',    // Information Circular (ST/IC)
  'REP',   // report (JIU/REP)
  'ADD',   // addendum used mid-symbol (rare)
]);

// ── Suffix modifiers → relation semantics ──────────────────────
// Direction is expressed as either 'base->this' or 'this->base' so the caller
// never has to guess edge orientation.
const SUFFIX_MAP = {
  ADD:     { suffixType: 'ADDENDUM',    relType: 'HAS_ADDENDUM', direction: 'base->this' },
  CORR:    { suffixType: 'CORRIGENDUM', relType: 'CORRECTS',     direction: 'this->base' },
  REV:     { suffixType: 'REVISION',    relType: 'REVISES',      direction: 'this->base' },
  AMEND:   { suffixType: 'AMENDMENT',   relType: 'AMENDS',       direction: 'this->base' },
  REISSUE: { suffixType: 'REISSUE',     relType: 'REISSUES',     direction: 'this->base' },
};

// ── (organ, series) → DocumentType registry mapping ────────────
// Kept in sync with api/scripts/seed-un-document-types.js.
// Value: [documentType, epistemicLayer, normativeWeight]
const DOC_TYPE_MAP = {
  'SC|RES':   ['SC_RES',  'L0', 0.98],
  'SC|PRST':  ['SC_PRST', 'L1', 0.65],
  'GA|RES':   ['GA_RES',  'L0', 0.95],
  'SEC|SGB':  ['ST_SGB',  'L1', 0.85],
  'SEC|AI':   ['ST_AI',   'L2', 0.70],
  'SEC|IC':   ['ST_IC',   'L2', 0.55],
  'JIU|REP':  ['JIU_REP', 'L4', 0.00],
};

// Matches a trailing suffix token like "Add.1", "Corr.2", "Rev.10",
// "Amend.1", "Reissue" (case-insensitive, optional dot/space, optional number).
const SUFFIX_TOKEN_RE = /^(Add|Corr|Rev|Amend|Reissue)\.?\s*(\d+)?$/i;

// Year in parentheses, e.g. "2235(2015)".
const YEAR_PAREN_RE = /\((\d{4})\)\s*$/;

function _isModifierToken(token) {
  return SUFFIX_TOKEN_RE.test(token.trim());
}

function _blankResult(raw) {
  return {
    raw: raw == null ? '' : String(raw),
    normalized: '',
    valid: false,
    parseErrors: [],
    // structure
    organ: null,
    organPrefix: null,
    subBody: null,
    series: null,
    session: null,
    number: null,
    year: null,
    // suffix
    baseSymbol: null,
    suffix: null,
    suffixType: null,
    suffixNumber: null,
    // derived
    documentType: null,
    epistemicLayer: null,
    normativeWeight: null,
    isChapterVII: null, // cannot be inferred from the symbol alone (content-derived)
  };
}

/**
 * Parse a UN document symbol into components.
 * @param {string} symbol - raw or normalized symbol (filename artifacts tolerated)
 * @returns {object} ParsedSymbol (see _blankResult for shape)
 */
function parseUNSymbol(symbol) {
  const out = _blankResult(symbol);
  if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
    out.parseErrors.push('empty symbol');
    return out;
  }

  const normalized = normalizeSymbol(symbol);
  out.normalized = normalized;

  if (!normalized.includes('/')) {
    out.parseErrors.push('no "/" separator — not a recognizable UN symbol');
    return out;
  }

  let tokens = normalized.split('/').map(t => t.trim()).filter(Boolean);
  if (tokens.length < 2) {
    out.parseErrors.push('too few segments');
    return out;
  }

  // ── 1. Peel off trailing suffix modifiers (may be stacked) ──
  const modifiers = [];
  while (tokens.length > 2 && _isModifierToken(tokens[tokens.length - 1])) {
    modifiers.unshift(tokens.pop());
  }
  if (modifiers.length > 0) {
    // baseSymbol is the symbol with only the final (outermost) modifier removed,
    // so stacked suffixes resolve one level at a time
    // (A/RES/70/1/Rev.1/Add.1 → base A/RES/70/1/Rev.1).
    out.baseSymbol = [...tokens, ...modifiers.slice(0, -1)].join('/');
    const last = modifiers[modifiers.length - 1];
    const m = SUFFIX_TOKEN_RE.exec(last.trim());
    if (m) {
      const key = m[1].toUpperCase();
      const info = SUFFIX_MAP[key] || SUFFIX_MAP[key === 'REISSUE' ? 'REISSUE' : key];
      out.suffix = last.trim();
      out.suffixType = info ? info.suffixType : key;
      out.suffixNumber = m[2] ? parseInt(m[2], 10) : null;
    }
  }

  // ── 2. Organ prefix ──
  const prefix = tokens[0].toUpperCase();
  out.organPrefix = tokens[0];
  const organInfo = ORGAN_MAP[prefix];
  if (organInfo) {
    out.organ = organInfo.organ;
  } else {
    out.parseErrors.push(`unknown organ prefix "${tokens[0]}"`);
  }

  // ── 3. Sub-body detection (e.g. A/HRC, A/C.1, E/CN.4) ──
  // A token in position 1 that is neither a known series code nor purely
  // numeric is treated as a subsidiary-body code.
  let idx = 1;
  const second = tokens[1];
  if (second && !SERIES_CODES.has(second.toUpperCase()) && !/^\d/.test(second) && !YEAR_PAREN_RE.test(second)) {
    out.subBody = second;
    idx = 2;
  }

  // ── 4. Series/type code ──
  if (tokens[idx] && SERIES_CODES.has(tokens[idx].toUpperCase())) {
    out.series = tokens[idx].toUpperCase();
    idx++;
  }

  // ── 5. Remaining numeric-ish tokens: session / number / year ──
  const rest = tokens.slice(idx);
  const numericParts = [];
  for (const tok of rest) {
    const yearM = YEAR_PAREN_RE.exec(tok);
    if (yearM) {
      // e.g. "2235(2015)" → number 2235, year 2015
      out.year = parseInt(yearM[1], 10);
      const numPart = tok.replace(YEAR_PAREN_RE, '').trim();
      if (/^\d+$/.test(numPart)) numericParts.push(parseInt(numPart, 10));
      continue;
    }
    if (/^\d+$/.test(tok)) {
      numericParts.push(parseInt(tok, 10));
      continue;
    }
    // token like "L.5" — a series code fused with its document number
    const seriesNumM = /^([A-Za-z]+)\.?(\d+)$/.exec(tok);
    if (seriesNumM && SERIES_CODES.has(seriesNumM[1].toUpperCase())) {
      if (!out.series) out.series = seriesNumM[1].toUpperCase();
      numericParts.push(parseInt(seriesNumM[2], 10));
      continue;
    }
    // any other token — capture trailing digits as a number
    const dm = /(\d+)\s*$/.exec(tok);
    if (dm) numericParts.push(parseInt(dm[1], 10));
  }

  // Interpret numeric parts by organ convention.
  if (numericParts.length >= 2) {
    // session-based (GA/ECOSOC/Secretariat): first = session/year, second = number
    out.session = numericParts[0];
    out.number = numericParts[1];
  } else if (numericParts.length === 1) {
    // single number-based (SC resolutions: S/RES/2235; dated series carry year in session slot)
    out.number = numericParts[0];
  }

  // ── 6. Derive documentType / layer / weight ──
  if (out.organ && out.series) {
    const key = `${out.organ}|${out.series}`;
    const mapped = DOC_TYPE_MAP[key];
    if (mapped) {
      out.documentType = mapped[0];
      out.epistemicLayer = mapped[1];
      out.normativeWeight = mapped[2];
    }
  }

  out.valid = out.parseErrors.length === 0 && out.organ != null;
  return out;
}

/**
 * Derive deterministic document-to-document relations implied by a symbol's
 * suffix modifier. Returns edges from the perspective of the parsed document.
 *
 * @param {object|string} parsedOrSymbol - result of parseUNSymbol, or a raw symbol
 * @returns {Array<{relType,sourceSymbol,targetSymbol,confidence,evidence,source}>}
 */
function deriveSymbolRelations(parsedOrSymbol) {
  const parsed = typeof parsedOrSymbol === 'string'
    ? parseUNSymbol(parsedOrSymbol)
    : parsedOrSymbol;

  if (!parsed || !parsed.suffixType || !parsed.baseSymbol) return [];

  // Find the SUFFIX_MAP entry by suffixType.
  const info = Object.values(SUFFIX_MAP).find(v => v.suffixType === parsed.suffixType);
  if (!info) return [];

  const thisSymbol = parsed.normalized;
  const baseSymbol = parsed.baseSymbol;
  const [sourceSymbol, targetSymbol] = info.direction === 'base->this'
    ? [baseSymbol, thisSymbol]
    : [thisSymbol, baseSymbol];

  return [{
    relType: info.relType,
    sourceSymbol,
    targetSymbol,
    confidence: 1.0,
    source: 'SYMBOL_DERIVED',
    evidence: `Derived from symbol suffix "${parsed.suffix}" (${parsed.suffixType})`,
  }];
}

module.exports = {
  parseUNSymbol,
  deriveSymbolRelations,
  // exported for tests / reuse
  ORGAN_MAP,
  SERIES_CODES,
  SUFFIX_MAP,
  DOC_TYPE_MAP,
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTRACT UN SOP EXECUTOR
 *
 * Extracts structural elements from UN regulatory document text into
 * schema-defined types: UN_REGULATORY_DOCUMENT, UN_DOCUMENT_SECTION,
 * UN_ROLE_ASSIGNMENT, UN_CROSS_REFERENCE.
 *
 * @see api/src/schemas/un-sop-document.schema.js for enum definitions
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface ExtractUNSOPParameters {
  text?: string;
  documentSymbol?: string;
  overrideIssuingBody?: string;
  overrideDocumentType?: string;
  extractSections?: boolean;
  extractRoles?: boolean;
  extractReferences?: boolean;
  extractObligations?: boolean;
}

interface Obligation {
  text: string;
  modality: string;
  subject: string;
}

interface UNDocumentSection {
  sectionNumber: string;
  title: string;
  content: string;
  obligations: Obligation[];
}

interface UNRoleAssignment {
  role: string;
  responsibilities: string[];
  accountableTo: string;
  sectionRef: string;
}

interface UNCrossReference {
  sourceDocumentSymbol: string;
  targetDocumentSymbol: string;
  referenceType: string;
  context: string;
}

interface UNRegulatoryDocument {
  documentSymbol: string;
  issuingBody: string;
  documentType: string;
  title: string;
  effectiveDate: string;
  replacesDocument: string;
  legalBasis: string;
}

interface ExtractUNSOPResult {
  document: UNRegulatoryDocument;
  sections: UNDocumentSection[];
  roles: UNRoleAssignment[];
  crossReferences: UNCrossReference[];
  stats: {
    sectionsFound: number;
    rolesFound: number;
    referencesFound: number;
    obligationsFound: number;
    confidence: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// REGEX PATTERNS
// ────────────────────────────────────────────────────────────────────────────

// Document symbol patterns
const DOC_SYMBOL_PATTERNS = [
  { re: /\bST\/SGB\/\d{4}\/\d+\b/i,       issuingBody: 'SECRETARIAT', documentType: 'SGB_BULLETIN' },
  { re: /\bST\/AI\/\d{4}\/\d+\b/i,        issuingBody: 'SECRETARIAT', documentType: 'ADMINISTRATIVE_INSTRUCTION' },
  { re: /\bST\/IC\/\d{4}\/\d+\b/i,        issuingBody: 'SECRETARIAT', documentType: 'POLICY' },
  { re: /\bUNHCR\/AI\/\d{4}[\/\-\w]*/i,   issuingBody: 'UNHCR',       documentType: 'ADMINISTRATIVE_INSTRUCTION' },
  { re: /\bIGDS\s*(?:No\.?\s*)?\d+\b/i,   issuingBody: 'ILO',         documentType: 'STANDARD' },
  { re: /\bPOLICY\.\d+\.\d{4}\.\d+\b/i,  issuingBody: 'UNOPS',       documentType: 'POLICY' },
  { re: /\bUNDP\/OHR\/\w+\/\d{4}\b/i,     issuingBody: 'UNDP',        documentType: 'POLICY' },
  { re: /\bWFP\s+\w+\s+Policy\b/i,        issuingBody: 'WFP',         documentType: 'POLICY' },
];

// Section heading patterns
const SECTION_PATTERNS = [
  /^(Section|Part|Chapter|Annex)\s+([IVXLC]+|\d+[A-Z]?|[A-Z])\b[.\s]*(.*)/im,
  /^(\d+(?:\.\d+)*)\s{2,}(.+)$/m,
  /^(\d+)\.\s+([A-Z][^.]{2,60})\s*$/m,
];

// Obligation patterns — subject + action (capture groups: 1=subject, 2=obligation text)
// `m` flag: $ matches end-of-line so multi-line sentences capture up to first line break
const OBLIGATION_PATTERNS = [
  { re: /([A-Z][^,.]{2,60})\s+shall\s+(.+?)(?:[.;]|$)/gim,               modality: 'SHALL' },
  { re: /([A-Z][^,.]{2,60})\s+must\s+(.+?)(?:[.;]|$)/gim,                modality: 'MUST' },
  { re: /([A-Z][^,.]{2,60})\s+is responsible for\s+(.+?)(?:[.;]|$)/gim,  modality: 'IS_RESPONSIBLE_FOR' },
  { re: /([A-Z][^,.]{2,60})\s+(?:must not|shall not)\s+(.+?)(?:[.;]|$)/gim, modality: 'MUST_NOT' },
  { re: /([A-Z][^,.]{2,60})\s+should\s+(.+?)(?:[.;]|$)/gim,              modality: 'SHOULD' },
  { re: /([A-Z][^,.]{2,60})\s+may\s+(.+?)(?:[.;]|$)/gim,                 modality: 'MAY' },
];

// Role / responsibility patterns
const ROLE_PATTERNS = [
  /^(The\s+)?(?:Chief|Head|Director|Manager|Officer|Coordinator|Administrator|Secretary)\s+[A-Z][^\n]{0,80}/m,
  /responsibilities\s+of\s+the\s+([A-Z][^\n]{0,80})/gi,
  /([A-Z][a-zA-Z\s]{3,50}(?:Officer|Manager|Director|Chief|Coordinator))\s+(?:shall|is responsible|must)/gi,
];

// Cross-reference context phrases
const CROSSREF_CONTEXTS: Array<{ re: RegExp; type: string }> = [
  { re: /(?:replaces?|supersedes?|revokes?)\s+([A-Z]{2,}\/\S+)/gi,         type: 'SUPERSEDES' },
  { re: /(?:supplements?|amends?|modifies?)\s+([A-Z]{2,}\/\S+)/gi,         type: 'SUPPLEMENTS' },
  { re: /(?:pursuant to|in accordance with|implementing)\s+([A-Z]{2,}\/\S+)/gi, type: 'IMPLEMENTS' },
  { re: /(?:see also|related? to|in conjunction with)\s+([A-Z]{2,}\/\S+)/gi, type: 'RELATES_TO' },
];

const DATE_RE = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/i;
const LEGAL_BASIS_RE = /(?:pursuant to|under|in accordance with)\s+(Article\s+[IVXLC\d]+[^,.]{0,80}|(?:General Assembly|Security Council)\s+[Rr]esolution[^,.]{0,80}|the\s+Charter[^,.]{0,80})/gi;
const TITLE_RE = /^(?:Title|Subject|Re(?:garding)?)[:\s]+(.+)$/m;

// ────────────────────────────────────────────────────────────────────────────
// EXTRACTION HELPERS
// ────────────────────────────────────────────────────────────────────────────

function detectDocumentMeta(text: string, hint?: string): { symbol: string; issuingBody: string; documentType: string } {
  if (hint) {
    for (const p of DOC_SYMBOL_PATTERNS) {
      if (p.re.test(hint)) {
        return { symbol: hint, issuingBody: p.issuingBody, documentType: p.documentType };
      }
    }
  }
  // Search only in the header area (first 500 chars).
  // Reject symbols that follow a cross-reference phrase (they belong to cited documents).
  const header = text.slice(0, 500);
  const CROSSREF_RE = /(?:pursuant to|in accordance with|replaces?|supersedes?|supplements?|see also|related to)\s*$/i;
  for (const p of DOC_SYMBOL_PATTERNS) {
    const m = header.match(p.re);
    if (m && m.index !== undefined) {
      const before = header.slice(Math.max(0, m.index - 50), m.index);
      if (!CROSSREF_RE.test(before)) {
        return { symbol: m[0].trim(), issuingBody: p.issuingBody, documentType: p.documentType };
      }
    }
  }
  return { symbol: '', issuingBody: 'SECRETARIAT', documentType: 'POLICY' };
}

function extractTitle(text: string): string {
  const m = text.match(TITLE_RE) || text.match(/^([A-Z][A-Z\s]{10,120})\n/m);
  return m ? m[1].trim() : '';
}

function extractDate(text: string): string {
  const m = text.match(DATE_RE);
  if (!m) return '';
  const months: Record<string, string> = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12',
  };
  return `${m[3]}-${months[m[2]]}-${String(m[1]).padStart(2, '0')}`;
}

function extractLegalBasis(text: string): string {
  const m = LEGAL_BASIS_RE.exec(text);
  LEGAL_BASIS_RE.lastIndex = 0;
  return m ? m[1].trim() : '';
}

function extractObligations(sectionText: string): Obligation[] {
  const obligations: Obligation[] = [];
  for (const pat of OBLIGATION_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pat.re.source, pat.re.flags);
    while ((m = re.exec(sectionText)) !== null) {
      obligations.push({
        subject: m[1].trim(),
        modality: pat.modality,
        text: (m[2] || m[0]).trim().slice(0, 300),
      });
      if (obligations.length >= 50) break;
    }
  }
  return obligations;
}

function extractSections(text: string): UNDocumentSection[] {
  const sections: UNDocumentSection[] = [];
  const lines = text.split('\n');
  let current: UNDocumentSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let matched = false;
    for (const re of SECTION_PATTERNS) {
      const m = line.match(re);
      if (m) {
        if (current) {
          current.obligations = extractObligations(current.content);
          sections.push(current);
        }
        current = {
          sectionNumber: (m[1] + (m[2] ? ' ' + m[2] : '')).trim(),
          title: (m[3] || m[2] || '').trim(),
          content: '',
          obligations: [],
        };
        matched = true;
        break;
      }
    }

    if (!matched && current) {
      current.content += (current.content ? '\n' : '') + line;
    }
  }

  if (current) {
    current.obligations = extractObligations(current.content);
    sections.push(current);
  }

  return sections.slice(0, 100);
}

function extractRoles(text: string, sections: UNDocumentSection[]): UNRoleAssignment[] {
  const roleMap = new Map<string, UNRoleAssignment>();

  for (const pat of ROLE_PATTERNS) {
    let m: RegExpExecArray | null;
    const re = new RegExp(pat.source, pat.flags);
    while ((m = re.exec(text)) !== null) {
      const role = (m[1] || m[0]).replace(/^The\s+/i, '').trim().slice(0, 80);
      if (!roleMap.has(role)) {
        roleMap.set(role, { role, responsibilities: [], accountableTo: '', sectionRef: '' });
      }
    }
  }

  // Associate responsibilities from obligations
  for (const sec of sections) {
    for (const obl of sec.obligations) {
      if (obl.modality === 'IS_RESPONSIBLE_FOR') {
        const entry = roleMap.get(obl.subject) || { role: obl.subject, responsibilities: [], accountableTo: '', sectionRef: sec.sectionNumber };
        entry.responsibilities.push(obl.text.slice(0, 200));
        roleMap.set(obl.subject, entry);
      }
    }
  }

  return Array.from(roleMap.values()).filter(r => r.responsibilities.length > 0 || r.role.length > 5);
}

function extractCrossReferences(text: string, sourceSymbol: string): UNCrossReference[] {
  const refs: UNCrossReference[] = [];
  for (const { re, type } of CROSSREF_CONTEXTS) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const target = m[1]?.trim();
      if (target && target !== sourceSymbol) {
        const start = Math.max(0, m.index - 80);
        refs.push({
          sourceDocumentSymbol: sourceSymbol,
          targetDocumentSymbol: target,
          referenceType: type,
          context: text.slice(start, m.index + m[0].length + 80).replace(/\s+/g, ' ').trim().slice(0, 300),
        });
      }
    }
  }
  return refs;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class ExtractUNSOPExecutor extends BaseExecutor {
  readonly type = 'ingestion.extract_un_sop';
  readonly displayName = 'Extract UN SOP Document Structure';
  readonly description = 'Extracts UN_REGULATORY_DOCUMENT, UN_DOCUMENT_SECTION, UN_ROLE_ASSIGNMENT, UN_CROSS_REFERENCE from regulatory document text';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Document text (can also use context.variables.text)',
      },
      documentSymbol: {
        type: 'string',
        description: 'Hint for document symbol if already known (e.g. "ST/SGB/2007/6")',
      },
      overrideIssuingBody: {
        type: 'string',
        description: 'Override detected issuingBody with this enum value',
      },
      overrideDocumentType: {
        type: 'string',
        description: 'Override detected documentType with this enum value',
      },
      extractSections: { type: 'boolean', default: true },
      extractRoles: { type: 'boolean', default: true },
      extractReferences: { type: 'boolean', default: true },
      extractObligations: { type: 'boolean', default: true },
    },
    required: [],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as ExtractUNSOPParameters;

      const text: string =
        (params.text as string) ||
        (context.variables.text as string) ||
        (context.variables.sanitizedText as string) ||
        (context.variables.content as string) || '';

      if (!text || text.trim().length < 50) {
        return this.error('INVALID_INPUT', 'No text provided or text too short for UN SOP extraction', true);
      }

      const meta = detectDocumentMeta(text, params.documentSymbol);
      if (params.overrideIssuingBody) meta.issuingBody = params.overrideIssuingBody;
      if (params.overrideDocumentType) meta.documentType = params.overrideDocumentType;

      const document: UNRegulatoryDocument = {
        documentSymbol: meta.symbol,
        issuingBody: meta.issuingBody,
        documentType: meta.documentType,
        title: extractTitle(text),
        effectiveDate: extractDate(text),
        replacesDocument: '',
        legalBasis: extractLegalBasis(text),
      };

      const doSections = params.extractSections !== false;
      const doRoles = params.extractRoles !== false;
      const doRefs = params.extractReferences !== false;

      const sections = doSections ? extractSections(text) : [];
      const roles = doRoles ? extractRoles(text, sections) : [];
      const crossReferences = doRefs ? extractCrossReferences(text, meta.symbol) : [];

      // Detect replacesDocument from cross-references
      const superseded = crossReferences.find(r => r.referenceType === 'SUPERSEDES');
      if (superseded) document.replacesDocument = superseded.targetDocumentSymbol;

      const totalObligations = sections.reduce((n, s) => n + s.obligations.length, 0);

      const confidence = Math.min(
        0.5 +
        (meta.symbol ? 0.2 : 0) +
        (document.effectiveDate ? 0.1 : 0) +
        (sections.length > 0 ? 0.1 : 0) +
        (totalObligations > 0 ? 0.1 : 0),
        1.0
      );

      const result: ExtractUNSOPResult = {
        document,
        sections,
        roles,
        crossReferences,
        stats: {
          sectionsFound: sections.length,
          rolesFound: roles.length,
          referencesFound: crossReferences.length,
          obligationsFound: totalObligations,
          confidence,
        },
      };

      return this.success(
        result,
        {
          documentSymbol: meta.symbol,
          issuingBody: meta.issuingBody,
          documentType: meta.documentType,
          sectionsFound: sections.length,
          rolesFound: roles.length,
          referencesFound: crossReferences.length,
          obligationsFound: totalObligations,
          duration: Date.now() - startTime,
        },
        confidence
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('EXTRACT_UN_SOP_ERROR', `UN SOP extraction failed: ${message}`, true);
    }
  }
}

export default ExtractUNSOPExecutor;

'use strict';
/**
 * DocumentStructureService
 *
 * Heuristic analysis of document logical structure.
 *
 * Detects sections, preamble paragraphs, operative clauses, annexes, etc.
 * Marks segments as "important" for selective extraction mode.
 *
 * Supports UN document types:
 *   resolution — GA/SC/ECOSOC resolutions with preamble + operative paragraphs
 *   report     — SG / OIOS / JIU reports with executive summary + sections
 *   administrative — ST/SGB, ST/AI, ST/IC instruments
 *   circular   — information circulars
 *   letter     — formal correspondence
 *   unknown    — unstructured / generic
 */

'use strict';

const LOG_PREFIX = '[DocumentStructure]';

// ─── UN Document Pattern Dictionaries ────────────────────────────────────────

const PREAMBLE_VERBS = [
  'noting', 'recalling', 'reaffirming', 'recognizing', 'recognising',
  'acknowledging', 'bearing in mind', 'deeply concerned', 'deeply regretting',
  'welcoming', 'convinced', 'aware', 'conscious', 'considering',
  'having considered', 'taking note', 'emphasizing', 'emphasising',
  'affirming', 'guided by', 'determined', 'stressing', 'underlining',
  'reiterating', 'expressing', 'concerned', 'deploring', 'gravely concerned',
  'mindful', 'commending', 'desiring',
];

const OPERATIVE_VERBS = [
  'decides', 'requests', 'urges', 'encourages', 'calls upon', 'invites',
  'reiterates', 'reaffirms', 'affirms', 'notes', 'stresses', 'emphasizes',
  'emphasises', 'recalls', 'welcomes', 'expresses', 'condemns', 'deplores',
  'demands', 'authorizes', 'authorises', 'endorses', 'approves', 'adopts',
  'directs', 'instructs', 'mandates', 'extends', 'renews', 'terminates',
  'establishes', 'creates', 'appoints', 'commends', 'takes note',
  'acknowledges', 'recognizes', 'recognises', 'determines', 'declares',
  'further decides', 'also decides', 'also requests', 'also invites',
  'further requests', 'further urges',
];

const IMPORTANT_KEYWORDS = [
  'executive summary', 'summary', 'résumé', 'resume',
  'conclusions', 'recommendations', 'key findings', 'main findings',
  'findings', 'key recommendations', 'action required', 'proposed actions',
  'way forward', 'next steps', 'action plan',
];

// Section heading patterns (tested against trimmed lines)
const HEADING_PATTERNS = [
  // Roman numeral: "I.", "II.", "III.", "IV.", "XIV." + space + word
  { re: /^(I{1,3}|IV|V?I{0,3}|IX|X{1,3}|XI{1,4}|XIV|XV|XVI|XIX|XX)\.\s+\S/i, type: 'section', level: 1 },
  // Numbered section: "1.", "2." + space + uppercase
  { re: /^\d{1,2}\.\s+[A-Z]/, type: 'section', level: 2 },
  // Lettered section: "A.", "B." + space + uppercase
  { re: /^[A-Z]\.\s+[A-Z]/, type: 'section', level: 2 },
  // ALL-CAPS short line (likely a heading): 4-80 chars
  { re: /^[A-Z][A-Z\s\-:,.']{3,70}[A-Z\s.,]$/, type: 'section', level: 1 },
];

const ANNEX_RE   = /^(annex(?:e?)\s*(?:[IVXivx]+|\d+|[A-Z])?)\b/i;
const CHAPTER_RE = /^(chapter|part)\s+([IVX\d]+)\b/i;

// ─── Service ──────────────────────────────────────────────────────────────────

class DocumentStructureService {

  /**
   * Analyse document text and return a structural representation.
   *
   * @param {string} text
   * @param {string|null} documentType  — hint from classifier
   * @returns StructureResult
   */
  analyzeStructure(text, documentType = null) {
    if (!text || !text.trim()) return this._empty();

    const format   = this._detectFormat(text, documentType);
    const lines    = text.split(/\r?\n/);
    const segments = [];

    let segId   = 0;
    let curSeg  = null;
    let lineBuf = [];
    let inOperative = false;

    const flush = () => {
      if (curSeg) {
        curSeg.text      = lineBuf.join('\n').trim();
        curSeg.wordCount = curSeg.text.split(/\s+/).filter(Boolean).length;
        segments.push(curSeg);
        lineBuf = [];
        curSeg  = null;
      }
    };

    const newSeg = (type, title, level, important, lineIndex) => {
      flush();
      segId++;
      curSeg = {
        id: `seg_${String(segId).padStart(3, '0')}`,
        type, title, level, important,
        startLine: lineIndex,
        text:      '',
        wordCount: 0,
      };
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) { if (lineBuf.length) lineBuf.push(''); continue; }

      // ── Annex / Chapter ────────────────────────────────────────────────
      if (ANNEX_RE.test(line)) { newSeg('annex', line, 0, false, i); continue; }
      if (CHAPTER_RE.test(line)) { newSeg('section', line, 0, false, i); continue; }

      // ── Section headings ───────────────────────────────────────────────
      const hd = this._heading(line, format);
      if (hd) {
        const imp = IMPORTANT_KEYWORDS.some(kw => line.toLowerCase().includes(kw));
        newSeg(hd.type, line, hd.level, imp, i);
        continue;
      }

      // ── Resolution preamble / operative paragraphs ──────────────────────
      if (format === 'resolution') {
        const opV = this._matchVerb(line, OPERATIVE_VERBS);
        const prV = this._matchVerb(line, PREAMBLE_VERBS);

        if (opV) {
          inOperative = true;
          newSeg('operative', `Operative clause: ${opV}`, 1, true, i);
          lineBuf.push(line);
          continue;
        }
        if (prV && !inOperative) {
          newSeg('preamble', `Preamble: ${prV}`, 1, false, i);
          lineBuf.push(line);
          continue;
        }
      }

      // ── Regular body text ───────────────────────────────────────────────
      if (!curSeg) newSeg('body', null, 0, false, i);
      lineBuf.push(line);
    }

    flush();

    // If nothing was detected, treat the whole text as a single important body segment
    if (!segments.length) {
      segments.push({
        id: 'seg_001', type: 'body', title: null, level: 0, important: true,
        startLine: 0, text: text.trim(),
        wordCount: text.split(/\s+/).filter(Boolean).length,
      });
    }

    const importantCount = segments.filter(s => s.important).length;
    const importantWords = segments.filter(s => s.important).reduce((n, s) => n + s.wordCount, 0);

    console.log(LOG_PREFIX, `format=${format} segments=${segments.length} important=${importantCount}`);

    return {
      format,
      segments,
      stats: {
        totalSegments:    segments.length,
        importantSegments: importantCount,
        importantWordRatio: segments.reduce((n, s) => n + s.wordCount, 0) > 0
          ? Math.round(importantWords / segments.reduce((n, s) => n + s.wordCount, 0) * 100) / 100
          : 0,
        totalChars:  text.length,
        totalWords:  text.split(/\s+/).filter(Boolean).length,
      },
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Extract concatenated text from only "important" segments.
   * Used by selective extraction mode.
   */
  getImportantText(structure) {
    if (!structure?.segments) return '';
    return structure.segments
      .filter(s => s.important && s.text)
      .map(s => [s.title, s.text].filter(Boolean).join('\n'))
      .join('\n\n---\n\n')
      .trim();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _empty() {
    return {
      format: 'unknown', segments: [],
      stats: { totalSegments: 0, importantSegments: 0, importantWordRatio: 0, totalChars: 0, totalWords: 0 },
      analyzedAt: new Date().toISOString(),
    };
  }

  _detectFormat(text, documentType) {
    if (documentType) {
      const dt = documentType.toLowerCase();
      if (dt.includes('res'))                   return 'resolution';
      if (dt.includes('sgb') || dt.includes('st_ai') || dt.includes('st_ic')) return 'administrative';
      if (dt.includes('rep') || dt.includes('report')) return 'report';
    }
    const sample = text.slice(0, 2000).toLowerCase();
    if (/the (general assembly|security council|economic and social council)/i.test(sample)) return 'resolution';
    if (/\bsecretary-general's bulletin\b/.test(sample)) return 'administrative';
    if (/\badministrative instruction\b/.test(sample))   return 'administrative';
    if (/\binformation circular\b/.test(sample))         return 'circular';
    if (/\bexecutive summary\b/.test(sample))            return 'report';
    if (/\bsecretary-general\b.*\breport\b/.test(sample)) return 'report';
    if (/^dear\s+(mr|ms|madam|sir|excellency)/i.test(sample.slice(0, 100))) return 'letter';
    return 'unknown';
  }

  _heading(line, format) {
    if (line.length > 120) return null;
    const lower = line.toLowerCase();
    for (const kw of IMPORTANT_KEYWORDS) {
      if (lower === kw || lower.startsWith(kw + ':') || lower.startsWith(kw + ' ')) {
        return { type: 'section', level: 0 };
      }
    }
    for (const hp of HEADING_PATTERNS) {
      if (hp.re.test(line)) return { type: hp.type, level: hp.level };
    }
    return null;
  }

  _matchVerb(line, verbList) {
    const lower = line.toLowerCase().trimStart();
    // Sort by length desc to match "further decides" before "decides"
    const sorted = verbList.slice().sort((a, b) => b.length - a.length);
    for (const v of sorted) {
      if (lower.startsWith(v)) return v;
    }
    return null;
  }
}

const documentStructureService = new DocumentStructureService();
module.exports = { documentStructureService, DocumentStructureService };

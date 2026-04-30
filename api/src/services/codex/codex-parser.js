/**
 * CodexParser — парсинг MD файлов Кодекса в структурированные объекты
 * для seeding в Memgraph
 *
 * Парсит: docs/codex/standards/*.md, manifesto/, future/, adr/
 * Создаёт: CodexPart, CodexSection, CodexRule, CodexDefinition, CodexPrinciple, CodexADR
 *
 * v2.0 (2026-04-14):
 *   - Таблицы больше НЕ взрываются в cell-level CodexRule
 *   - Каждая таблица → ОДИН CodexDefinition с структурированным `attributes` (JSON)
 *   - Подсекции `#### X.Y.Z TypeName` сохраняются как контекст
 *   - Исправлено извлечение заголовка для нумерованных параграфов
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Mapping: filename → part metadata
const PART_MAP = {
  'CODEX-CRUD':    { order: 1, partId: 'PART-I',    romanNum: 'I',    title: null },
  'CODEX-META':    { order: 2, partId: 'PART-II',   romanNum: 'II',   title: null },
  'CODEX-VERSION': { order: 3, partId: 'PART-III',  romanNum: 'III',  title: null },
  'CODEX-NS':      { order: 4, partId: 'PART-IV',   romanNum: 'IV',   title: null },
  'CODEX-VALID':   { order: 5, partId: 'PART-V',    romanNum: 'V',    title: null },
  'CODEX-CATALOG': { order: 6, partId: 'PART-VI',   romanNum: 'VI',   title: null },
  'CODEX-POLY':    { order: 7, partId: 'PART-VII',  romanNum: 'VII',  title: null },
  'CODEX-DOMAINS': { order: 9, partId: 'PART-IX',   romanNum: 'IX',   title: null },
};

// Column headers that mark attribute-value tables (one-entity-per-table)
const ATTRIBUTE_HEADERS = ['атрибут', 'поле', 'параметр', 'свойство', 'field', 'attribute', 'property', 'key'];

class CodexParser {
  constructor(codexDir) {
    this.codexDir = codexDir || path.join(__dirname, '../../../../docs/codex');
  }

  /**
   * Парсить все части Кодекса
   */
  async parseAll() {
    const result = {
      parts: [],
      sections: [],
      rules: [],
      definitions: [],   // NEW: structured tables as CodexDefinition
      principles: [],
      adrs: [],
      metadata: {
        parsedAt: new Date().toISOString(),
        parserVersion: '2.0.0',
        version: null
      }
    };

    // 1. Parse standards (Parts I-VII, IX)
    const standardsDir = path.join(this.codexDir, 'standards');
    const standardFiles = await this._getFiles(standardsDir, '.md');

    for (const file of standardFiles) {
      const content = await fs.readFile(file, 'utf-8');
      const parsed = this._parseStandardFile(file, content);
      result.parts.push(parsed.part);
      result.sections.push(...parsed.sections);
      result.rules.push(...parsed.rules);
      result.definitions.push(...parsed.definitions);
    }

    // 2. Parse AI Manifesto (Part 0 — principles)
    const manifestoPath = path.join(this.codexDir, 'manifesto/AI_MANIFESTO.md');
    try {
      const manifestoContent = await fs.readFile(manifestoPath, 'utf-8');
      const manifestoPart = {
        partId: 'PART-0',
        title: this._extractTitle(manifestoContent) || 'Манифест для ИИ-агентов',
        fileName: 'AI_MANIFESTO',
        order: 0,
        namespace: 'CODEX',
        hash: this._hash(manifestoContent)
      };
      result.parts.push(manifestoPart);
      result.principles = this._parseManifesto(manifestoContent);

      const manifestoSections = this._extractSections(manifestoContent, 'PART-0');
      result.sections.push(...manifestoSections);
    } catch (err) {
      console.warn('AI Manifesto not found, skipping principles:', err.message);
    }

    // 3. Parse SELF-EVOLUTION (Part VIII)
    const futurePath = path.join(this.codexDir, 'future/SELF-EVOLUTION.md');
    try {
      const futureContent = await fs.readFile(futurePath, 'utf-8');
      const futurePart = {
        partId: 'PART-VIII',
        title: this._extractTitle(futureContent) || 'Будущее: саморазвивающаяся система',
        fileName: 'SELF-EVOLUTION',
        order: 8,
        namespace: 'CODEX',
        hash: this._hash(futureContent)
      };
      result.parts.push(futurePart);

      const futureSections = this._extractSections(futureContent, 'PART-VIII');
      result.sections.push(...futureSections);

      const extracted = this._extractFromSections(futureSections);
      result.rules.push(...extracted.rules);
      result.definitions.push(...extracted.definitions);
    } catch (err) {
      console.warn('SELF-EVOLUTION not found, skipping:', err.message);
    }

    // 4. Parse ADRs
    const adrDir = path.join(this.codexDir, 'adr');
    const adrFiles = await this._getFiles(adrDir, '.md');

    for (const file of adrFiles) {
      if (path.basename(file) === 'README.md') continue;
      const content = await fs.readFile(file, 'utf-8');
      const adr = this._parseADR(file, content);
      if (adr) result.adrs.push(adr);
    }

    // Sort parts by order
    result.parts.sort((a, b) => a.order - b.order);

    return result;
  }

  _parseStandardFile(filePath, content) {
    const fileName = path.basename(filePath, '.md');
    const meta = PART_MAP[fileName] || { order: 99, partId: `PART-${fileName}` };

    const part = {
      partId: meta.partId,
      title: this._extractTitle(content) || fileName,
      fileName,
      order: meta.order,
      namespace: 'CODEX',
      hash: this._hash(content)
    };

    const sections = this._extractSections(content, meta.partId);
    const { rules, definitions } = this._extractFromSections(sections);

    return { part, sections, rules, definitions };
  }

  /**
   * Extract H2 sections from markdown content
   */
  _extractSections(content, partId) {
    const sections = [];
    const lines = content.split('\n');

    let currentSection = null;
    let currentContent = [];
    let sectionIndex = 0;

    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          sections.push(currentSection);
        }

        sectionIndex++;
        const sectionTitle = line.replace('## ', '').trim();

        if (sectionTitle === 'Оглавление') {
          currentSection = null;
          currentContent = [];
          continue;
        }

        currentSection = {
          sectionId: `${partId}-S${sectionIndex}`,
          partId,
          title: sectionTitle,
          order: sectionIndex
        };
        currentContent = [];
      } else if (currentSection) {
        currentContent.push(line);
      }
    }

    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Extract rules AND definitions from parsed sections.
   *
   * Returns { rules: CodexRule[], definitions: CodexDefinition[] }
   */
  _extractFromSections(sections) {
    const rules = [];
    const definitions = [];

    for (const section of sections) {
      if (!section.content) continue;

      // Split section content by subsection headings (### or ####) to preserve context
      const subsections = this._splitBySubheadings(section.content);

      // Per-section counters for codexId generation
      let ruleCounter = 0;
      let defCounter = 0;

      for (const sub of subsections) {
        // === EXTRACT TABLES as CodexDefinition ===
        const tables = this._extractTables(sub.content);
        for (const table of tables) {
          defCounter++;
          const defId = `${section.sectionId}-D${defCounter}`;
          const title = sub.heading || table.firstColName || section.title;

          definitions.push({
            definitionId: defId,
            sectionId: section.sectionId,
            partId: section.partId,
            title: title,
            subsectionHeading: sub.heading || null,
            tableType: table.type,
            columnNames: table.columns,
            attributes: table.rows,  // array of objects keyed by column name
            rowCount: table.rows.length,
            scope: this._inferScope(section.title),
            status: 'active',
            source: 'codex-parser'
          });
        }

        // === EXTRACT NUMBERED PARAGRAPHS as CodexRule (§X.Y: description) ===
        // Fixed: properly extract title from first sentence, skip code blocks
        const contentNoTables = this._stripTables(sub.content);
        const contentNoCode = this._stripCodeBlocks(contentNoTables);

        const numbered = contentNoCode.matchAll(/(?:^|\n)(?:§|)(\d+\.\d+(?:\.\d+)?)\s*[:\-—]\s*(.+?)(?=\n(?:§|\d+\.\d+[:\-— ])|\n\n|$)/gs);
        for (const match of numbered) {
          const code = match[1];
          const body = match[2].trim();
          const title = this._extractFirstSentence(body);
          if (!title || title.length < 5) continue;  // skip garbage

          ruleCounter++;
          rules.push({
            ruleId: `${section.sectionId}-R${code.replace(/\./g, '')}`,
            sectionId: section.sectionId,
            partId: section.partId,
            code: `§${code}`,
            title: title,
            description: body,
            subsectionHeading: sub.heading || null,
            scope: this._inferScope(section.title),
            modality: this._inferModality(body),
            status: 'active',
            source: 'codex-parser'
          });
        }

        // === EXTRACT BOLD BULLETS as CodexRule (**Name**: description) ===
        const boldBullets = contentNoCode.matchAll(/^[-*]\s+\*\*(.+?)\*\*[:\s]+(.+?)(?=\n[-*]\s+\*\*|\n\n|$)/gms);
        for (const match of boldBullets) {
          const title = match[1].trim();
          const description = match[2].trim();
          if (!title || title.length < 2) continue;

          ruleCounter++;
          rules.push({
            ruleId: `${section.sectionId}-B${ruleCounter}`,
            sectionId: section.sectionId,
            partId: section.partId,
            code: null,
            title: title,
            description: description,
            subsectionHeading: sub.heading || null,
            scope: this._inferScope(section.title),
            modality: this._inferModality(title + ' ' + description),
            status: 'active',
            source: 'codex-parser'
          });
        }
      }
    }

    return { rules, definitions };
  }

  /**
   * Split section content by H3/H4 headings to preserve subsection context.
   * Returns [{ heading, content }, ...]
   */
  _splitBySubheadings(content) {
    const parts = [];
    const lines = content.split('\n');
    let currentHeading = null;
    let currentLines = [];

    for (const line of lines) {
      const h3Match = line.match(/^###\s+(.+)/);
      const h4Match = line.match(/^####\s+(.+)/);
      if (h3Match || h4Match) {
        if (currentLines.length > 0) {
          parts.push({ heading: currentHeading, content: currentLines.join('\n') });
        }
        currentHeading = (h3Match || h4Match)[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
    if (currentLines.length > 0 || currentHeading) {
      parts.push({ heading: currentHeading, content: currentLines.join('\n') });
    }
    // If no subheadings found, return single block
    if (parts.length === 0) {
      parts.push({ heading: null, content });
    }
    return parts;
  }

  /**
   * Extract markdown tables from content block.
   * Returns [{ type, columns, rows, firstColName }, ...]
   */
  _extractTables(content) {
    const tables = [];
    const lines = content.split('\n');

    let inTable = false;
    let headerLine = null;
    let separatorSeen = false;
    let rowLines = [];

    const flushTable = () => {
      if (!headerLine || !separatorSeen || rowLines.length === 0) return;

      const columns = this._parseTableRow(headerLine);
      const firstColLower = (columns[0] || '').toLowerCase().replace(/[^a-zа-я]/g, '');
      const isAttrValue = ATTRIBUTE_HEADERS.includes(firstColLower);

      const rows = rowLines.map(line => {
        const cells = this._parseTableRow(line);
        const obj = {};
        for (let i = 0; i < columns.length; i++) {
          obj[columns[i] || `col${i}`] = (cells[i] || '').trim();
        }
        return obj;
      }).filter(r => Object.values(r).some(v => v && v.length > 0));

      if (rows.length > 0) {
        tables.push({
          type: isAttrValue ? 'attribute-value' : 'multi-column',
          columns,
          rows,
          firstColName: columns[0]
        });
      }

      headerLine = null;
      separatorSeen = false;
      rowLines = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('|')) {
        if (inTable) flushTable();
        inTable = false;
        continue;
      }
      // Separator line (|---|---|)
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        separatorSeen = true;
        inTable = true;
        continue;
      }
      // Header line
      if (!headerLine) {
        headerLine = trimmed;
        inTable = true;
        continue;
      }
      // Data row
      if (separatorSeen) {
        rowLines.push(trimmed);
      }
    }
    if (inTable) flushTable();

    return tables;
  }

  _parseTableRow(line) {
    return line.split('|')
      .slice(1, -1)  // skip leading/trailing empty parts
      .map(c => c.trim().replace(/^\*\*|\*\*$/g, ''));  // strip bold markers
  }

  /** Remove table blocks from content so they don't get double-parsed */
  _stripTables(content) {
    return content.split('\n').filter(l => !l.trim().startsWith('|')).join('\n');
  }

  /** Remove fenced code blocks from content */
  _stripCodeBlocks(content) {
    return content.replace(/```[\s\S]*?```/g, '');
  }

  /** Extract first sentence as title (for rules) */
  _extractFirstSentence(text) {
    const cleaned = text.replace(/^[\s\-*—:]+/, '').trim();
    // Skip lines that look like code (start with digit+), bracket)
    if (/^[\d.)\];,]+$/.test(cleaned.split(/\s/)[0])) return null;
    // First sentence: up to . ! ? or newline
    const match = cleaned.match(/^(.{5,200}?)(?:[.!?]\s|\n|$)/);
    return match ? match[1].trim() : cleaned.slice(0, 150).trim();
  }

  /**
   * Parse AI Manifesto into principles
   */
  _parseManifesto(content) {
    const principles = [];
    const lines = content.split('\n');

    let currentPrinciple = null;
    let order = 0;

    for (const line of lines) {
      const principleMatch = line.match(/^##\s+(\d+\.\d+)\s+(.+)/);
      if (principleMatch) {
        if (currentPrinciple) {
          currentPrinciple.description = currentPrinciple.description.trim();
          principles.push(currentPrinciple);
        }

        order++;
        currentPrinciple = {
          principleId: `PRINCIPLE-${principleMatch[1].replace('.', '-')}`,
          title: principleMatch[2].trim(),
          code: principleMatch[1],
          order,
          description: '',
          namespace: 'CODEX'
        };
      } else if (currentPrinciple && line.trim() && !line.startsWith('#')) {
        currentPrinciple.description += line + '\n';
      }
    }

    if (currentPrinciple) {
      currentPrinciple.description = currentPrinciple.description.trim();
      principles.push(currentPrinciple);
    }

    return principles;
  }

  _parseADR(filePath, content) {
    const fileName = path.basename(filePath, '.md');
    const adrMatch = fileName.match(/^(ADR-\d+)-(.+)$/);
    if (!adrMatch) return null;

    const title = this._extractTitle(content) || adrMatch[2].replace(/-/g, ' ');

    const statusMatch = content.match(/\*\*(?:Status|Статус)\*\*[:\s]+(.+)/i);
    const status = statusMatch ? statusMatch[1].trim() : 'ACCEPTED';

    const decisionMatch = content.match(/## (?:Decision|Решение)\s*\n+([\s\S]+?)(?=\n## |$)/);
    const decision = decisionMatch ? decisionMatch[1].trim() : '';

    return {
      adrId: adrMatch[1],
      title,
      fileName,
      status: status.replace(/[🟢🟡🔴]/g, '').trim(),
      decision,
      hash: this._hash(content)
    };
  }

  // ============================================================
  // Helpers
  // ============================================================

  async _getFiles(dir, ext) {
    try {
      const files = await fs.readdir(dir);
      return files.filter(f => f.endsWith(ext)).sort().map(f => path.join(dir, f));
    } catch { return []; }
  }

  _extractTitle(content) {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : null;
  }

  _inferScope(sectionTitle) {
    const lower = (sectionTitle || '').toLowerCase();
    if (lower.includes('namespace'))                              return 'namespace';
    if (lower.includes('validation') || lower.includes('валидац')) return 'validation';
    if (lower.includes('version') || lower.includes('версион'))    return 'versioning';
    if (lower.includes('catalog') || lower.includes('каталог'))    return 'catalog';
    if (lower.includes('tool') || lower.includes('инструмент'))    return 'tooling';
    if (lower.includes('crud') || lower.includes('операц'))        return 'crud';
    if (lower.includes('meta') || lower.includes('метадан'))       return 'metadata';
    if (lower.includes('poly') || lower.includes('транзакц'))      return 'polystore';
    if (lower.includes('information') || lower.includes('тип'))    return 'information-types';
    return 'general';
  }

  _inferModality(text) {
    const lower = (text || '').toLowerCase();
    if (lower.includes('must not') || lower.includes('запрещ') || lower.includes('никогда')) return 'MUST_NOT';
    if (lower.includes('must') || lower.includes('shall') || lower.includes('обязан') || lower.includes('обязательн')) return 'MUST';
    if (lower.includes('should not') || lower.includes('не рекоменд')) return 'SHOULD_NOT';
    if (lower.includes('should') || lower.includes('рекоменд') || lower.includes('следует')) return 'SHOULD';
    if (lower.includes('may') || lower.includes('можно') || lower.includes('допуск')) return 'MAY';
    return 'DESCRIPTIVE';
  }

  _hash(content) {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}

module.exports = { CodexParser };

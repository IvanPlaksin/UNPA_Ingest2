/**
 * CodexParser — парсинг MD файлов Кодекса в структурированные объекты
 * для seeding в Memgraph
 *
 * Парсит: docs/codex/standards/*.md, manifesto/, future/, adr/
 * Создаёт: CodexPart, CodexSection, CodexRule, CodexPrinciple, CodexADR
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
      principles: [],
      adrs: [],
      metadata: {
        parsedAt: new Date().toISOString(),
        version: null // resolved dynamically from CodexMetadata node
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

      // Also extract sections from manifesto
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

      const futureRules = this._extractRulesFromSections(futureSections);
      result.rules.push(...futureRules);
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

  /**
   * Парсить файл стандарта (CODEX-*.md)
   */
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
    const rules = this._extractRulesFromSections(sections);

    return { part, sections, rules };
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
        // Save previous section
        if (currentSection) {
          currentSection.content = currentContent.join('\n').trim();
          sections.push(currentSection);
        }

        sectionIndex++;
        const sectionTitle = line.replace('## ', '').trim();

        // Skip TOC sections
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

    // Save last section
    if (currentSection) {
      currentSection.content = currentContent.join('\n').trim();
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Extract rules from parsed sections
   */
  _extractRulesFromSections(sections) {
    const rules = [];

    for (const section of sections) {
      if (!section.content) continue;

      // Pattern 1: Numbered paragraphs like §X.Y or X.Y.Z
      const numbered = section.content.matchAll(/(?:§|)(\d+\.\d+(?:\.\d+)?)\s*[:\-—]\s*(.+?)(?=\n(?:§|\d+\.\d+)|$)/gs);
      for (const match of numbered) {
        rules.push({
          ruleId: `${section.sectionId}-R${match[1].replace(/\./g, '')}`,
          sectionId: section.sectionId,
          partId: section.partId,
          code: `§${match[1]}`,
          title: match[2].split('\n')[0].trim(),
          description: match[2].trim(),
          scope: this._inferScope(section.title),
          modality: this._inferModality(match[2]),
          status: 'active'
        });
      }

      // Pattern 2: Bold key-value bullets: **Name**: description
      const boldBullets = section.content.matchAll(/^[-*]\s+\*\*(.+?)\*\*[:\s]+(.+?)(?=\n[-*]\s+\*\*|\n\n|$)/gm);
      for (const match of boldBullets) {
        const ruleId = `${section.sectionId}-B${rules.filter(r => r.sectionId === section.sectionId).length + 1}`;
        rules.push({
          ruleId,
          sectionId: section.sectionId,
          partId: section.partId,
          code: null,
          title: match[1].trim(),
          description: match[2].trim(),
          scope: this._inferScope(section.title),
          modality: this._inferModality(match[1] + ' ' + match[2]),
          status: 'active'
        });
      }

      // Pattern 3: Table rows with | Name | Description | ...
      const tableLines = section.content.split('\n').filter(l => l.startsWith('|'));
      if (tableLines.length > 2) {
        // Skip header + separator rows
        for (let i = 2; i < tableLines.length; i++) {
          const cells = tableLines[i].split('|').map(c => c.trim()).filter(Boolean);
          if (cells.length >= 2 && cells[0] && !cells[0].startsWith('-')) {
            const ruleId = `${section.sectionId}-T${rules.filter(r => r.sectionId === section.sectionId).length + 1}`;
            rules.push({
              ruleId,
              sectionId: section.sectionId,
              partId: section.partId,
              code: null,
              title: cells[0].replace(/[`*]/g, ''),
              description: cells.slice(1).join(' — '),
              scope: this._inferScope(section.title),
              modality: 'mapping',
              status: 'active'
            });
          }
        }
      }
    }

    return rules;
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
      // Match ## 0.X Title pattern
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

  /**
   * Parse ADR file
   */
  _parseADR(filePath, content) {
    const fileName = path.basename(filePath, '.md');
    const adrMatch = fileName.match(/^(ADR-\d+)-(.+)$/);
    if (!adrMatch) return null;

    const title = this._extractTitle(content) || adrMatch[2].replace(/-/g, ' ');

    // Extract status
    const statusMatch = content.match(/\*\*(?:Status|Статус)\*\*[:\s]+(.+)/i);
    const status = statusMatch ? statusMatch[1].trim() : 'ACCEPTED';

    // Extract decision
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
      return files
        .filter(f => f.endsWith(ext))
        .sort()
        .map(f => path.join(dir, f));
    } catch {
      return [];
    }
  }

  _extractTitle(content) {
    const match = content.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : null;
  }

  _inferScope(sectionTitle) {
    const lower = (sectionTitle || '').toLowerCase();
    if (lower.includes('namespace'))  return 'namespace';
    if (lower.includes('validation') || lower.includes('валидац')) return 'validation';
    if (lower.includes('version') || lower.includes('версион'))   return 'versioning';
    if (lower.includes('catalog') || lower.includes('каталог'))   return 'catalog';
    if (lower.includes('tool') || lower.includes('инструмент'))   return 'tooling';
    if (lower.includes('crud') || lower.includes('операц'))       return 'crud';
    if (lower.includes('meta') || lower.includes('метадан'))      return 'metadata';
    if (lower.includes('poly') || lower.includes('транзакц'))     return 'polystore';
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

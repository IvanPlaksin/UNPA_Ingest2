/**
 * Document Parser
 * Parses various document formats into text for extraction
 *
 * Supported formats: txt, md, json, csv, log, xml, html, yaml/yml
 *
 * @module services/ingestion/document-parser
 */

const fs = require('fs').promises;
const path = require('path');

class DocumentParser {
  constructor(options = {}) {
    this.options = {
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      supportedFormats: options.supportedFormats || [
        '.txt', '.md', '.json', '.csv', '.log', '.xml', '.html', '.yaml', '.yml'
      ],
      ...options
    };

    this.parsers = {
      '.txt': this._parseText.bind(this),
      '.md': this._parseMarkdown.bind(this),
      '.json': this._parseJSON.bind(this),
      '.csv': this._parseCSV.bind(this),
      '.log': this._parseText.bind(this),
      '.xml': this._parseXML.bind(this),
      '.html': this._parseHTML.bind(this),
      '.yaml': this._parseYAML.bind(this),
      '.yml': this._parseYAML.bind(this)
    };

    this.stats = {
      totalParsed: 0,
      byFormat: {},
      totalBytes: 0,
      errors: 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  async parseFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();

    if (!this.options.supportedFormats.includes(ext)) {
      throw new Error(`Unsupported format: ${ext}`);
    }

    const stat = await fs.stat(filePath);
    if (stat.size > this.options.maxFileSize) {
      throw new Error(`File too large: ${stat.size} bytes (max: ${this.options.maxFileSize})`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return this.parseContent(content, ext, { filePath, fileSize: stat.size });
  }

  async parseContent(content, format, metadata = {}) {
    const ext = format.startsWith('.') ? format : `.${format}`;
    const parser = this.parsers[ext];

    if (!parser) {
      throw new Error(`No parser for format: ${ext}`);
    }

    this.stats.totalParsed++;
    this.stats.byFormat[ext] = (this.stats.byFormat[ext] || 0) + 1;
    this.stats.totalBytes += content.length;

    try {
      const result = await parser(content, metadata);
      return {
        success: true,
        format: ext,
        ...result,
        metadata: {
          ...metadata,
          parsedAt: new Date().toISOString(),
          originalLength: content.length
        }
      };
    } catch (error) {
      this.stats.errors++;
      return {
        success: false,
        format: ext,
        error: error.message,
        metadata
      };
    }
  }

  async parseBuffer(buffer, filename) {
    const ext = path.extname(filename).toLowerCase();
    const content = buffer.toString('utf-8');
    return this.parseContent(content, ext, { filename });
  }

  getSupportedFormats() {
    return this.options.supportedFormats;
  }

  getStats() {
    return this.stats;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FORMAT PARSERS
  // ═══════════════════════════════════════════════════════════════════════

  async _parseText(content) {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(l => l.trim().length > 0);

    return {
      text: content,
      sections: this._extractSections(content),
      stats: {
        lines: lines.length,
        nonEmptyLines: nonEmptyLines.length,
        characters: content.length,
        words: content.split(/\s+/).filter(w => w.length > 0).length
      }
    };
  }

  async _parseMarkdown(content) {
    const sections = [];
    const lines = content.split('\n');
    let currentSection = { title: 'Introduction', level: 0, content: [] };

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

      if (headerMatch) {
        if (currentSection.content.length > 0) {
          sections.push({
            ...currentSection,
            content: currentSection.content.join('\n').trim()
          });
        }
        currentSection = {
          title: headerMatch[2],
          level: headerMatch[1].length,
          content: []
        };
      } else {
        currentSection.content.push(line);
      }
    }

    if (currentSection.content.length > 0) {
      sections.push({
        ...currentSection,
        content: currentSection.content.join('\n').trim()
      });
    }

    // Extract code blocks
    const codeBlocks = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push({ language: match[1] || 'text', code: match[2].trim() });
    }

    // Extract links
    const links = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    while ((match = linkRegex.exec(content)) !== null) {
      links.push({ text: match[1], url: match[2] });
    }

    return {
      text: content,
      sections,
      codeBlocks,
      links,
      stats: {
        sections: sections.length,
        codeBlocks: codeBlocks.length,
        links: links.length
      }
    };
  }

  async _parseJSON(content) {
    const data = JSON.parse(content);
    const text = this._jsonToText(data);

    return {
      text,
      data,
      structure: this._analyzeJSONStructure(data),
      stats: {
        keys: this._countJSONKeys(data),
        depth: this._getJSONDepth(data)
      }
    };
  }

  async _parseCSV(content) {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) {
      return { text: '', rows: [], headers: [] };
    }

    const headers = this._parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = this._parseCSVLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
      rows.push(row);
    }

    const text = rows.map(row =>
      headers.map(h => `${h}: ${row[h]}`).join(', ')
    ).join('\n');

    return {
      text,
      headers,
      rows,
      stats: { columns: headers.length, rows: rows.length }
    };
  }

  async _parseXML(content) {
    const text = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const tagRegex = /<(\w+)[^>]*>/g;
    const tags = new Set();
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      tags.add(match[1]);
    }

    return {
      text,
      tags: [...tags],
      stats: { uniqueTags: tags.size }
    };
  }

  async _parseHTML(content) {
    const text = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : null;

    const links = [];
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      links.push({ url: match[1], text: match[2] });
    }

    return {
      text,
      title,
      links,
      stats: { links: links.length }
    };
  }

  async _parseYAML(content) {
    const lines = content.split('\n');
    const data = {};

    for (const line of lines) {
      if (line.trim().startsWith('#') || !line.trim()) continue;

      const match = line.match(/^(\s*)([^:]+):\s*(.*)$/);
      if (match) {
        const key = match[2].trim();
        const value = match[3].trim();
        data[key] = value || null;
      }
    }

    const text = Object.entries(data)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');

    return {
      text,
      data,
      stats: { keys: Object.keys(data).length }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _extractSections(text) {
    const paragraphs = text.split(/\n\n+/);
    return paragraphs
      .filter(p => p.trim().length > 0)
      .map(p => ({ content: p.trim(), length: p.trim().length }));
  }

  _jsonToText(obj, prefix = '') {
    const parts = [];
    if (Array.isArray(obj)) {
      obj.forEach((item, idx) => {
        parts.push(this._jsonToText(item, `${prefix}[${idx}]`));
      });
    } else if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const p = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null) {
          parts.push(this._jsonToText(value, p));
        } else {
          parts.push(`${p}: ${value}`);
        }
      }
    } else {
      parts.push(`${prefix}: ${obj}`);
    }
    return parts.join('\n');
  }

  _analyzeJSONStructure(obj) {
    if (Array.isArray(obj)) {
      return {
        type: 'array',
        length: obj.length,
        itemType: obj.length > 0 ? this._analyzeJSONStructure(obj[0]) : null
      };
    } else if (obj && typeof obj === 'object') {
      return { type: 'object', keys: Object.keys(obj) };
    }
    return { type: typeof obj };
  }

  _countJSONKeys(obj) {
    let count = 0;
    if (Array.isArray(obj)) {
      obj.forEach(item => { count += this._countJSONKeys(item); });
    } else if (obj && typeof obj === 'object') {
      count += Object.keys(obj).length;
      Object.values(obj).forEach(v => { count += this._countJSONKeys(v); });
    }
    return count;
  }

  _getJSONDepth(obj, depth = 0) {
    if (Array.isArray(obj)) {
      return obj.reduce((max, item) => Math.max(max, this._getJSONDepth(item, depth + 1)), depth);
    } else if (obj && typeof obj === 'object') {
      return Object.values(obj).reduce((max, v) => Math.max(max, this._getJSONDepth(v, depth + 1)), depth);
    }
    return depth;
  }

  _parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values;
  }
}

const documentParser = new DocumentParser();

module.exports = {
  DocumentParser,
  documentParser
};

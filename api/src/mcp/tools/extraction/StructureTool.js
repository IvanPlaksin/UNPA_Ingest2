const { BaseTool } = require('../primitives/BaseTool.js');

class StructureTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.structure',
      name: 'Extract Structure',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Extract structural elements from text (headings, lists, code blocks, etc.)',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
          format: {
            type: 'string',
            enum: ['markdown', 'plain', 'auto'],
            default: 'auto',
            description: 'Text format'
          },
          elements: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['headings', 'lists', 'codeBlocks', 'links', 'tables', 'quotes', 'paragraphs']
            },
            default: ['headings', 'lists', 'codeBlocks'],
            description: 'Elements to extract'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          structure: { type: 'object' },
          outline: { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 500, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { text, format = 'auto', elements = ['headings', 'lists', 'codeBlocks'] } = args;

    if (!text) {
      return this.success({ structure: {}, outline: [] });
    }

    const detectedFormat = format === 'auto' ? this.detectFormat(text) : format;
    const structure = {};
    const outline = [];

    for (const element of elements) {
      switch (element) {
        case 'headings':
          structure.headings = this.extractHeadings(text, detectedFormat);
          outline.push(...structure.headings.map(h => ({ type: 'heading', ...h })));
          break;
        case 'lists':
          structure.lists = this.extractLists(text, detectedFormat);
          break;
        case 'codeBlocks':
          structure.codeBlocks = this.extractCodeBlocks(text, detectedFormat);
          break;
        case 'links':
          structure.links = this.extractLinks(text, detectedFormat);
          break;
        case 'quotes':
          structure.quotes = this.extractQuotes(text, detectedFormat);
          break;
        case 'paragraphs':
          structure.paragraphs = this.extractParagraphs(text);
          break;
      }
    }

    return this.success({ structure, outline, format: detectedFormat });
  }

  detectFormat(text) {
    const mdIndicators = [/^#{1,6}\s/m, /^\s*[-*+]\s/m, /```/m, /\[.*\]\(.*\)/];
    const mdScore = mdIndicators.filter(p => p.test(text)).length;
    return mdScore >= 2 ? 'markdown' : 'plain';
  }

  extractHeadings(text, format) {
    const headings = [];
    if (format === 'markdown') {
      const regex = /^(#{1,6})\s+(.+)$/gm;
      let match;
      while ((match = regex.exec(text)) !== null) {
        headings.push({
          level: match[1].length,
          text: match[2].trim(),
          index: match.index
        });
      }
    } else {
      // Plain text: lines that are short and followed by blank line
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const nextLine = lines[i + 1]?.trim() || '';
        if (line.length > 0 && line.length < 100 && nextLine === '' && !/[.!?]$/.test(line)) {
          headings.push({ level: 1, text: line, lineNumber: i + 1 });
        }
      }
    }
    return headings;
  }

  extractLists(text, format) {
    const lists = [];
    if (format === 'markdown') {
      // Ordered lists
      const olRegex = /^(\d+\.)\s+(.+)$/gm;
      let match;
      let currentList = [];
      while ((match = olRegex.exec(text)) !== null) {
        currentList.push({ marker: match[1], text: match[2] });
      }
      if (currentList.length > 0) {
        lists.push({ type: 'ordered', items: currentList });
      }

      // Unordered lists
      const ulRegex = /^[\s]*[-*+]\s+(.+)$/gm;
      currentList = [];
      while ((match = ulRegex.exec(text)) !== null) {
        currentList.push({ text: match[1] });
      }
      if (currentList.length > 0) {
        lists.push({ type: 'unordered', items: currentList });
      }
    }
    return lists;
  }

  extractCodeBlocks(text, format) {
    const codeBlocks = [];
    if (format === 'markdown') {
      const regex = /```(\w*)\n([\s\S]*?)```/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        codeBlocks.push({
          language: match[1] || 'unknown',
          code: match[2],
          index: match.index
        });
      }
    }
    return codeBlocks;
  }

  extractLinks(text, format) {
    const links = [];
    if (format === 'markdown') {
      const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let match;
      while ((match = regex.exec(text)) !== null) {
        links.push({ text: match[1], url: match[2], index: match.index });
      }
    }
    // Also extract raw URLs
    const urlRegex = /https?:\/\/[^\s<>\"{}|\\^`\[\]]+/g;
    let match;
    while ((match = urlRegex.exec(text)) !== null) {
      if (!links.some(l => l.url === match[0])) {
        links.push({ url: match[0], index: match.index });
      }
    }
    return links;
  }

  extractQuotes(text, format) {
    const quotes = [];
    if (format === 'markdown') {
      const regex = /^>\s*(.+)$/gm;
      let match;
      let currentQuote = [];
      let startIndex = -1;
      while ((match = regex.exec(text)) !== null) {
        if (startIndex === -1) startIndex = match.index;
        currentQuote.push(match[1]);
      }
      if (currentQuote.length > 0) {
        quotes.push({ text: currentQuote.join('\n'), index: startIndex });
      }
    }
    return quotes;
  }

  extractParagraphs(text) {
    return text.split(/\n\s*\n/)
      .map((p, i) => p.trim())
      .filter(p => p.length > 0)
      .map((text, index) => ({ text, index }));
  }
}

module.exports = { StructureTool };

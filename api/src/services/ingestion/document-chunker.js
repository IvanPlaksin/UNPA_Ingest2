/**
 * Document Chunker
 * Splits large documents into chunks for processing
 *
 * Strategies: paragraph, sentence, fixed, semantic
 *
 * @module services/ingestion/document-chunker
 */

class DocumentChunker {
  constructor(options = {}) {
    this.options = {
      chunkSize: options.chunkSize || 1000,
      chunkOverlap: options.chunkOverlap || 100,
      minChunkSize: options.minChunkSize || 100,
      maxChunkSize: options.maxChunkSize || 2000,
      strategy: options.strategy || 'paragraph',
      ...options
    };

    this.stats = {
      totalChunked: 0,
      totalChunks: 0,
      avgChunkSize: 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  chunk(text, options = {}) {
    const strategy = options.strategy || this.options.strategy;
    const chunkSize = options.chunkSize || this.options.chunkSize;
    const overlap = options.chunkOverlap || this.options.chunkOverlap;

    this.stats.totalChunked++;

    let chunks;
    switch (strategy) {
      case 'paragraph':
        chunks = this._chunkByParagraph(text, chunkSize, overlap);
        break;
      case 'sentence':
        chunks = this._chunkBySentence(text, chunkSize, overlap);
        break;
      case 'fixed':
        chunks = this._chunkByFixed(text, chunkSize, overlap);
        break;
      case 'semantic':
        chunks = this._chunkBySemantic(text, chunkSize, overlap);
        break;
      default:
        chunks = this._chunkByParagraph(text, chunkSize, overlap);
    }

    // Ensure at least one chunk
    if (chunks.length === 0) {
      chunks = [this._createChunk({ text }, 0, 0)];
    }

    this.stats.totalChunks += chunks.length;
    const totalSize = chunks.reduce((sum, c) => sum + c.text.length, 0);
    this.stats.avgChunkSize = Math.round(totalSize / chunks.length);

    return {
      chunks,
      metadata: {
        strategy,
        totalChunks: chunks.length,
        originalLength: text.length,
        avgChunkSize: Math.round(totalSize / chunks.length)
      }
    };
  }

  rechunk(chunks, options = {}) {
    const fullText = chunks.map(c => c.text).join('\n\n');
    return this.chunk(fullText, options);
  }

  getStats() {
    return this.stats;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STRATEGIES
  // ═══════════════════════════════════════════════════════════════════════

  _chunkByParagraph(text, targetSize, overlap) {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const chunks = [];
    let currentChunk = { text: '', paragraphs: [] };
    let position = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();

      if (currentChunk.text.length + trimmed.length > targetSize && currentChunk.text.length > 0) {
        chunks.push(this._createChunk(currentChunk, position, chunks.length));

        const overlapText = this._getOverlapText(currentChunk.text, overlap);
        currentChunk = {
          text: overlapText,
          paragraphs: overlapText ? ['[continued]'] : []
        };
        position += currentChunk.text.length - overlapText.length;
      }

      currentChunk.text += (currentChunk.text ? '\n\n' : '') + trimmed;
      currentChunk.paragraphs.push(trimmed.slice(0, 50));
    }

    if (currentChunk.text.length > 0) {
      chunks.push(this._createChunk(currentChunk, position, chunks.length));
    }

    return chunks;
  }

  _chunkBySentence(text, targetSize, overlap) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks = [];
    let currentChunk = { text: '', sentences: [] };
    let position = 0;

    for (const sentence of sentences) {
      const trimmed = sentence.trim();

      if (currentChunk.text.length + trimmed.length > targetSize && currentChunk.text.length > 0) {
        chunks.push(this._createChunk(currentChunk, position, chunks.length));

        const overlapText = this._getOverlapText(currentChunk.text, overlap);
        currentChunk = { text: overlapText, sentences: [] };
        position += currentChunk.text.length - overlapText.length;
      }

      currentChunk.text += (currentChunk.text && !currentChunk.text.endsWith(' ') ? ' ' : '') + trimmed;
      currentChunk.sentences.push(trimmed.slice(0, 30));
    }

    if (currentChunk.text.length > 0) {
      chunks.push(this._createChunk(currentChunk, position, chunks.length));
    }

    return chunks;
  }

  _chunkByFixed(text, chunkSize, overlap) {
    const chunks = [];
    let position = 0;

    while (position < text.length) {
      const end = Math.min(position + chunkSize, text.length);
      let chunkText = text.slice(position, end);

      // Try to break at word boundary
      if (end < text.length) {
        const lastSpace = chunkText.lastIndexOf(' ');
        if (lastSpace > chunkSize * 0.8) {
          chunkText = chunkText.slice(0, lastSpace);
        }
      }

      chunks.push(this._createChunk({ text: chunkText }, position, chunks.length));

      const advance = chunkText.length - overlap;
      // Guard against zero/negative advance to prevent infinite loops
      position += advance > 0 ? advance : chunkText.length;
      if (position >= text.length) break;
    }

    return chunks;
  }

  _chunkBySemantic(text, targetSize, overlap) {
    const headerRegex = /^(#{1,6}\s+.+|[A-Z][A-Z\s]{3,}[A-Z])$/gm;
    const sections = [];
    let lastIndex = 0;
    let match;

    while ((match = headerRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        sections.push({
          header: null,
          content: text.slice(lastIndex, match.index).trim()
        });
      }
      sections.push({
        header: match[0].replace(/^#+\s*/, '').trim(),
        content: ''
      });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      if (sections.length > 0 && !sections[sections.length - 1].content) {
        sections[sections.length - 1].content = text.slice(lastIndex).trim();
      } else {
        sections.push({ header: null, content: text.slice(lastIndex).trim() });
      }
    }

    const chunks = [];
    for (const section of sections) {
      if (!section.content) continue;

      const sectionText = section.header
        ? `${section.header}\n\n${section.content}`
        : section.content;

      if (sectionText.length > targetSize) {
        const subChunks = this._chunkByParagraph(sectionText, targetSize, overlap);
        for (const sub of subChunks) {
          sub.sectionHeader = section.header;
          chunks.push(sub);
        }
      } else if (sectionText.length >= this.options.minChunkSize) {
        chunks.push(this._createChunk(
          { text: sectionText, header: section.header },
          0,
          chunks.length
        ));
      }
    }

    return chunks;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _createChunk(data, position, index) {
    return {
      index,
      text: data.text,
      length: data.text.length,
      position,
      header: data.header || null,
      metadata: {
        paragraphs: data.paragraphs?.length || 0,
        sentences: data.sentences?.length || 0
      }
    };
  }

  _getOverlapText(text, overlapSize) {
    if (overlapSize <= 0 || text.length <= overlapSize) return '';

    const tail = text.slice(-overlapSize * 2);
    const sentenceMatch = tail.match(/[.!?]\s+[A-Z]/);

    if (sentenceMatch) {
      return tail.slice(sentenceMatch.index + 2);
    }

    const wordMatch = tail.slice(-overlapSize).match(/^\s*\S+\s+/);
    if (wordMatch) {
      return tail.slice(-overlapSize + wordMatch[0].length);
    }

    return text.slice(-overlapSize);
  }
}

const documentChunker = new DocumentChunker();

module.exports = {
  DocumentChunker,
  documentChunker
};

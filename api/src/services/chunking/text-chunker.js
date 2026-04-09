/**
 * Semantic Text Chunker
 *
 * Splits text into semantic chunks based on:
 * - Paragraph boundaries
 * - Section headers
 * - Sentence boundaries
 * - Token limits with overlap
 *
 * Optimized for embedding and RAG pipelines.
 *
 * @module services/chunking/text-chunker
 */

/**
 * Default chunking configuration
 */
const DEFAULT_CONFIG = {
  maxTokens: 512,           // Maximum tokens per chunk
  overlapTokens: 50,        // Overlap between chunks
  minChunkSize: 100,        // Minimum chunk size in characters
  preserveParagraphs: true, // Try to keep paragraphs intact
  preserveSentences: true,  // Try to keep sentences intact
  detectHeaders: true,      // Detect and use headers as boundaries
  avgCharsPerToken: 4,      // Average characters per token (approximation)
  includeMetadata: true     // Include position metadata in chunks
};

/**
 * Header detection patterns
 */
const HEADER_PATTERNS = [
  // Markdown headers
  /^#{1,6}\s+.+$/m,
  // Numbered sections (1. Introduction, 2.1 Overview)
  /^\d+(?:\.\d+)*\s+[A-Z].+$/m,
  // ALL CAPS headers
  /^[A-Z][A-Z\s]{10,}$/m,
  // Headers followed by colon
  /^[A-Z][^.!?]*:\s*$/m
];

/**
 * Sentence boundary patterns
 */
const SENTENCE_ENDINGS = /[.!?。！？]\s+(?=[A-Z\u0400-\u04FF\u4E00-\u9FFF])/g;

/**
 * Chunk result type
 * @typedef {Object} Chunk
 * @property {string} content - Chunk text content
 * @property {number} index - Chunk index in sequence
 * @property {number} startOffset - Start position in original text
 * @property {number} endOffset - End position in original text
 * @property {number} tokenEstimate - Estimated token count
 * @property {Object} metadata - Additional metadata
 */

/**
 * TextChunker class
 */
class TextChunker {
  /**
   * @param {Object} config - Chunking configuration
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Split text into semantic chunks
   * @param {string} text - Input text
   * @param {Object} options - Override options for this call
   * @returns {Array<Chunk>} Array of chunks
   */
  chunk(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const opts = { ...this.config, ...options };
    const maxChars = opts.maxTokens * opts.avgCharsPerToken;
    const overlapChars = opts.overlapTokens * opts.avgCharsPerToken;

    // Step 1: Split into initial segments (paragraphs/sections)
    let segments = this._splitIntoSegments(text, opts);

    // Step 2: Merge small segments, split large ones
    segments = this._normalizeSegments(segments, maxChars, overlapChars, opts);

    // Step 3: Create chunks with metadata
    const chunks = this._createChunks(segments, text, opts);

    // Safety fallback: if text is non-empty but produced 0 chunks
    // (e.g. all segments classified as headers), do simple character splitting
    if (chunks.length === 0 && text.trim().length > 0) {
      const fallbackSegments = this._splitLargeSegment(text.trim(), 0, maxChars, overlapChars, opts);
      return this._createChunks(fallbackSegments, text, opts);
    }

    return chunks;
  }

  /**
   * Chunk text for embedding - optimized settings
   * @param {string} text - Input text
   * @returns {Array<Chunk>} Array of chunks
   */
  chunkForEmbedding(text) {
    return this.chunk(text, {
      maxTokens: 512,
      overlapTokens: 50,
      preserveParagraphs: true,
      preserveSentences: true
    });
  }

  /**
   * Chunk text for RAG - larger context windows
   * @param {string} text - Input text
   * @returns {Array<Chunk>} Array of chunks
   */
  chunkForRAG(text) {
    return this.chunk(text, {
      maxTokens: 1024,
      overlapTokens: 100,
      preserveParagraphs: true,
      preserveSentences: true
    });
  }

  /**
   * Chunk document with structure awareness
   * @param {string} text - Input text
   * @param {Object} structure - Document structure metadata
   * @returns {Array<Chunk>} Array of chunks with structure context
   */
  chunkDocument(text, structure = {}) {
    const chunks = this.chunk(text, {
      maxTokens: 512,
      detectHeaders: true
    });

    // Enhance chunks with document structure
    return chunks.map(chunk => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        documentTitle: structure.title,
        documentType: structure.type,
        section: this._findSection(chunk.startOffset, structure.sections || [])
      }
    }));
  }

  /**
   * Get chunk statistics
   * @param {Array<Chunk>} chunks - Array of chunks
   * @returns {Object} Statistics
   */
  getStats(chunks) {
    if (!chunks || chunks.length === 0) {
      return { count: 0 };
    }

    const tokenCounts = chunks.map(c => c.tokenEstimate);

    return {
      count: chunks.length,
      totalTokens: tokenCounts.reduce((a, b) => a + b, 0),
      avgTokens: Math.round(tokenCounts.reduce((a, b) => a + b, 0) / chunks.length),
      minTokens: Math.min(...tokenCounts),
      maxTokens: Math.max(...tokenCounts),
      totalChars: chunks.reduce((a, c) => a + c.content.length, 0)
    };
  }

  // ===== Private Methods =====

  /**
   * Split text into initial segments
   * @private
   */
  _splitIntoSegments(text, opts) {
    const segments = [];
    let currentOffset = 0;

    // Split by double newlines (paragraphs) first
    const paragraphs = text.split(/\n\s*\n/);

    for (const para of paragraphs) {
      if (para.trim().length === 0) {
        currentOffset += para.length + 2; // Account for \n\n
        continue;
      }

      const isHeader = opts.detectHeaders && this._isHeader(para);

      segments.push({
        content: para.trim(),
        startOffset: currentOffset,
        endOffset: currentOffset + para.length,
        isHeader,
        type: isHeader ? 'header' : 'paragraph'
      });

      currentOffset += para.length + 2; // Account for paragraph separator
    }

    return segments;
  }

  /**
   * Check if text is a header
   * @private
   */
  _isHeader(text) {
    const trimmed = text.trim();

    // Must match at least one structural header pattern
    for (const pattern of HEADER_PATTERNS) {
      if (pattern.test(trimmed)) {
        return true;
      }
    }

    // Short single-line text without sentence-ending punctuation — likely a title/header
    // But only if it has no spaces indicating multiple words in a sentence-like structure
    // and is genuinely short (< 60 chars, single line, no commas)
    if (
      trimmed.length < 60 &&
      !trimmed.includes('\n') &&
      !trimmed.includes(',') &&
      !/[.!?]$/.test(trimmed) &&
      trimmed.split(/\s+/).length <= 8
    ) {
      return true;
    }

    return false;
  }

  /**
   * Normalize segments - merge small, split large
   * @private
   */
  _normalizeSegments(segments, maxChars, overlapChars, opts) {
    const normalized = [];
    let buffer = '';
    let bufferStart = 0;
    let lastHeader = null;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // If this is a header, flush buffer and start new section
      if (segment.isHeader) {
        if (buffer.trim().length > 0) {
          normalized.push({
            content: buffer.trim(),
            startOffset: bufferStart,
            endOffset: bufferStart + buffer.length,
            header: lastHeader,
            type: 'content'
          });
        }
        lastHeader = segment.content;
        buffer = '';
        bufferStart = segment.endOffset;
        continue;
      }

      // Check if adding this segment exceeds max size
      const potentialContent = buffer + (buffer ? '\n\n' : '') + segment.content;

      if (potentialContent.length > maxChars) {
        // Flush current buffer
        if (buffer.trim().length > 0) {
          normalized.push({
            content: buffer.trim(),
            startOffset: bufferStart,
            endOffset: bufferStart + buffer.length,
            header: lastHeader,
            type: 'content'
          });
        }

        // If single segment is too large, split it
        if (segment.content.length > maxChars) {
          const subChunks = this._splitLargeSegment(
            segment.content,
            segment.startOffset,
            maxChars,
            overlapChars,
            opts
          );
          for (const sub of subChunks) {
            normalized.push({
              ...sub,
              header: lastHeader,
              type: 'content'
            });
          }
          buffer = '';
          bufferStart = segment.endOffset;
        } else {
          buffer = segment.content;
          bufferStart = segment.startOffset;
        }
      } else {
        // Add to buffer
        if (buffer.length === 0) {
          bufferStart = segment.startOffset;
        }
        buffer = potentialContent;
      }
    }

    // Flush remaining buffer
    if (buffer.trim().length > 0) {
      normalized.push({
        content: buffer.trim(),
        startOffset: bufferStart,
        endOffset: bufferStart + buffer.length,
        header: lastHeader,
        type: 'content'
      });
    }

    return normalized;
  }

  /**
   * Split large segment into smaller chunks
   * @private
   */
  _splitLargeSegment(text, startOffset, maxChars, overlapChars, opts) {
    const chunks = [];

    if (opts.preserveSentences) {
      // Split by sentences
      const sentences = this._splitIntoSentences(text);
      let currentChunk = '';
      let chunkStart = startOffset;

      for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
          chunks.push({
            content: currentChunk.trim(),
            startOffset: chunkStart,
            endOffset: chunkStart + currentChunk.length
          });

          // Start new chunk with overlap
          const overlapText = this._getOverlapText(currentChunk, overlapChars);
          chunkStart = chunkStart + currentChunk.length - overlapText.length;
          currentChunk = overlapText + sentence;
        } else {
          currentChunk += sentence;
        }
      }

      if (currentChunk.trim().length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          startOffset: chunkStart,
          endOffset: chunkStart + currentChunk.length
        });
      }
    } else {
      // Simple character-based splitting
      let pos = 0;
      while (pos < text.length) {
        const end = Math.min(pos + maxChars, text.length);
        chunks.push({
          content: text.slice(pos, end).trim(),
          startOffset: startOffset + pos,
          endOffset: startOffset + end
        });
        pos = end - overlapChars;
      }
    }

    return chunks;
  }

  /**
   * Split text into sentences
   * @private
   */
  _splitIntoSentences(text) {
    // Simple sentence splitting
    const sentences = [];
    let lastEnd = 0;

    const matches = text.matchAll(SENTENCE_ENDINGS);
    for (const match of matches) {
      const end = match.index + match[0].length;
      sentences.push(text.slice(lastEnd, end));
      lastEnd = end;
    }

    // Add remaining text
    if (lastEnd < text.length) {
      sentences.push(text.slice(lastEnd));
    }

    return sentences.filter(s => s.trim().length > 0);
  }

  /**
   * Get overlap text from end of chunk
   * @private
   */
  _getOverlapText(text, overlapChars) {
    if (text.length <= overlapChars) {
      return text;
    }

    // Try to break at word boundary
    const start = text.length - overlapChars;
    const overlapPart = text.slice(start);
    const wordBoundary = overlapPart.search(/\s/);

    if (wordBoundary > 0) {
      return overlapPart.slice(wordBoundary + 1);
    }

    return overlapPart;
  }

  /**
   * Create final chunks with metadata
   * @private
   */
  _createChunks(segments, originalText, opts) {
    return segments.map((segment, index) => {
      const chunk = {
        content: segment.content,
        index,
        startOffset: segment.startOffset,
        endOffset: segment.endOffset,
        tokenEstimate: Math.ceil(segment.content.length / opts.avgCharsPerToken)
      };

      if (opts.includeMetadata) {
        chunk.metadata = {
          header: segment.header || null,
          type: segment.type,
          charCount: segment.content.length,
          wordCount: segment.content.split(/\s+/).length,
          lineCount: segment.content.split('\n').length
        };
      }

      return chunk;
    });
  }

  /**
   * Find section for offset position
   * @private
   */
  _findSection(offset, sections) {
    for (const section of sections) {
      if (offset >= section.start && offset < section.end) {
        return section.title;
      }
    }
    return null;
  }
}

/**
 * Create a chunker instance
 * @param {Object} config - Configuration
 * @returns {TextChunker} Chunker instance
 */
function createChunker(config = {}) {
  return new TextChunker(config);
}

/**
 * Default chunker instance
 */
const defaultChunker = new TextChunker();

/**
 * Quick chunk function
 * @param {string} text - Input text
 * @param {Object} options - Options
 * @returns {Array<Chunk>} Chunks
 */
function chunkText(text, options = {}) {
  return defaultChunker.chunk(text, options);
}

/**
 * Chunk for embedding
 * @param {string} text - Input text
 * @returns {Array<Chunk>} Chunks
 */
function chunkForEmbedding(text) {
  return defaultChunker.chunkForEmbedding(text);
}

/**
 * Chunk for RAG
 * @param {string} text - Input text
 * @returns {Array<Chunk>} Chunks
 */
function chunkForRAG(text) {
  return defaultChunker.chunkForRAG(text);
}

module.exports = {
  TextChunker,
  createChunker,
  chunkText,
  chunkForEmbedding,
  chunkForRAG,
  DEFAULT_CONFIG
};

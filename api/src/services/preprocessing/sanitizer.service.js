/**
 * Text Sanitizer Service
 *
 * Provides text cleaning, normalization, and PII removal functionality
 * for preprocessing text before vectorization and graph extraction.
 *
 * @module services/preprocessing/sanitizer
 */

/**
 * PII Patterns for removal/redaction
 */
const PII_PATTERNS = {
  // Email addresses
  EMAIL: {
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '[EMAIL_REDACTED]',
    preserve: false
  },

  // Phone numbers (international formats)
  PHONE: {
    pattern: /(?:\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    replacement: '[PHONE_REDACTED]',
    preserve: false
  },

  // Social Security Numbers (US format)
  SSN: {
    pattern: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
    replacement: '[SSN_REDACTED]',
    preserve: false
  },

  // Credit Card Numbers
  CREDIT_CARD: {
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: '[CC_REDACTED]',
    preserve: false
  },

  // IP Addresses (internal - preserve external for debugging context)
  INTERNAL_IP: {
    pattern: /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g,
    replacement: '[INTERNAL_IP]',
    preserve: false
  },

  // Passwords in URLs or configs
  PASSWORD_IN_URL: {
    pattern: /(?:password|pwd|passwd|secret|token|api[_-]?key)\s*[=:]\s*['"]?[\w\-!@#$%^&*()+=]+['"]?/gi,
    replacement: '[CREDENTIALS_REDACTED]',
    preserve: false
  },

  // Bearer tokens
  BEARER_TOKEN: {
    pattern: /Bearer\s+[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_.+/=]*/g,
    replacement: '[BEARER_TOKEN_REDACTED]',
    preserve: false
  },

  // Base64 encoded secrets (long base64 strings)
  BASE64_SECRET: {
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    replacement: '[ENCODED_DATA]',
    preserve: false
  }
};

/**
 * HTML entities map for decoding
 */
const HTML_ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&ndash;': '\u2013',  // en-dash
  '&mdash;': '\u2014',  // em-dash
  '&lsquo;': '\u2018',  // left single quote
  '&rsquo;': '\u2019',  // right single quote
  '&ldquo;': '\u201C',  // left double quote
  '&rdquo;': '\u201D',  // right double quote
  '&hellip;': '\u2026', // ellipsis
  '&bull;': '\u2022',   // bullet
  '&copy;': '\u00A9',   // copyright
  '&reg;': '\u00AE',    // registered
  '&trade;': '\u2122'   // trademark
};

/**
 * Sanitizer configuration defaults
 */
const DEFAULT_CONFIG = {
  removeHtml: true,
  normalizeWhitespace: true,
  removePII: false, // Off by default - enable explicitly
  preserveStructure: true,
  removeUrls: false,
  removeEmojis: false,
  maxLength: null,
  trimLines: true,
  removeEmptyLines: true,
  decodeHtmlEntities: true,
  normalizeUnicode: true,
  preserveCodeBlocks: true
};

/**
 * TextSanitizer class for text preprocessing
 */
class TextSanitizer {
  /**
   * @param {Object} config - Sanitizer configuration
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main sanitization method
   * @param {string} text - Input text
   * @param {Object} options - Override options for this call
   * @returns {Object} Sanitized text and metadata
   */
  sanitize(text, options = {}) {
    if (!text || typeof text !== 'string') {
      return {
        text: '',
        original: text,
        changes: [],
        metadata: { isEmpty: true }
      };
    }

    const opts = { ...this.config, ...options };
    const changes = [];
    let result = text;
    const originalLength = text.length;

    // Step 1: Extract and preserve code blocks if needed
    let codeBlocks = [];
    if (opts.preserveCodeBlocks) {
      const extraction = this._extractCodeBlocks(result);
      result = extraction.text;
      codeBlocks = extraction.blocks;
      if (codeBlocks.length > 0) {
        changes.push({ type: 'code_preserved', count: codeBlocks.length });
      }
    }

    // Step 2: Remove HTML tags
    if (opts.removeHtml) {
      const before = result;
      result = this._removeHtml(result);
      if (before !== result) {
        changes.push({ type: 'html_removed' });
      }
    }

    // Step 3: Decode HTML entities
    if (opts.decodeHtmlEntities) {
      const before = result;
      result = this._decodeHtmlEntities(result);
      if (before !== result) {
        changes.push({ type: 'entities_decoded' });
      }
    }

    // Step 4: Normalize Unicode
    if (opts.normalizeUnicode) {
      result = this._normalizeUnicode(result);
    }

    // Step 5: Remove PII
    if (opts.removePII) {
      const piiResult = this._removePII(result);
      result = piiResult.text;
      if (piiResult.redactions.length > 0) {
        changes.push({ type: 'pii_redacted', redactions: piiResult.redactions });
      }
    }

    // Step 6: Remove URLs if configured
    if (opts.removeUrls) {
      const before = result;
      result = this._removeUrls(result);
      if (before !== result) {
        changes.push({ type: 'urls_removed' });
      }
    }

    // Step 7: Remove emojis if configured
    if (opts.removeEmojis) {
      result = this._removeEmojis(result);
    }

    // Step 8: Normalize whitespace
    if (opts.normalizeWhitespace) {
      result = this._normalizeWhitespace(result, opts);
    }

    // Step 9: Trim lines
    if (opts.trimLines) {
      result = this._trimLines(result);
    }

    // Step 10: Remove empty lines
    if (opts.removeEmptyLines) {
      result = this._removeEmptyLines(result, opts.preserveStructure);
    }

    // Step 11: Restore code blocks
    if (opts.preserveCodeBlocks && codeBlocks.length > 0) {
      result = this._restoreCodeBlocks(result, codeBlocks);
    }

    // Step 12: Truncate if max length specified
    if (opts.maxLength && result.length > opts.maxLength) {
      result = result.substring(0, opts.maxLength);
      changes.push({ type: 'truncated', maxLength: opts.maxLength });
    }

    return {
      text: result.trim(),
      original: text,
      changes,
      metadata: {
        originalLength,
        finalLength: result.length,
        compressionRatio: result.length / originalLength,
        hadPII: changes.some(c => c.type === 'pii_redacted'),
        hadHtml: changes.some(c => c.type === 'html_removed'),
        codeBlocksPreserved: codeBlocks.length
      }
    };
  }

  /**
   * Quick sanitize - returns only the cleaned text
   * @param {string} text - Input text
   * @param {Object} options - Override options
   * @returns {string} Sanitized text
   */
  clean(text, options = {}) {
    return this.sanitize(text, options).text;
  }

  /**
   * Sanitize for embedding - optimized for vector search
   * @param {string} text - Input text
   * @returns {string} Cleaned text ready for embedding
   */
  forEmbedding(text) {
    return this.clean(text, {
      removeHtml: true,
      normalizeWhitespace: true,
      removePII: false,
      removeUrls: false,
      removeEmojis: true,
      preserveCodeBlocks: true,
      preserveStructure: false,
      removeEmptyLines: true
    });
  }

  /**
   * Sanitize for graph extraction - preserves more structure
   * @param {string} text - Input text
   * @returns {string} Cleaned text ready for entity extraction
   */
  forGraphExtraction(text) {
    return this.clean(text, {
      removeHtml: true,
      normalizeWhitespace: true,
      removePII: false,
      removeUrls: false,
      preserveCodeBlocks: true,
      preserveStructure: true,
      removeEmptyLines: false
    });
  }

  /**
   * Sanitize for storage - with PII removal
   * @param {string} text - Input text
   * @returns {Object} Sanitized result with metadata
   */
  forStorage(text) {
    return this.sanitize(text, {
      removeHtml: true,
      normalizeWhitespace: true,
      removePII: true,
      preserveCodeBlocks: true,
      preserveStructure: true
    });
  }

  // ===== Private Methods =====

  /**
   * Extract code blocks and replace with placeholders
   * @private
   */
  _extractCodeBlocks(text) {
    const blocks = [];
    let index = 0;

    // Match fenced code blocks (```...```)
    const fencedPattern = /```[\s\S]*?```/g;
    let result = text.replace(fencedPattern, (match) => {
      const placeholder = `__CODE_BLOCK_${index}__`;
      blocks.push({ placeholder, content: match });
      index++;
      return placeholder;
    });

    // Match inline code (`...`)
    const inlinePattern = /`[^`]+`/g;
    result = result.replace(inlinePattern, (match) => {
      const placeholder = `__INLINE_CODE_${index}__`;
      blocks.push({ placeholder, content: match });
      index++;
      return placeholder;
    });

    return { text: result, blocks };
  }

  /**
   * Restore code blocks from placeholders
   * @private
   */
  _restoreCodeBlocks(text, blocks) {
    let result = text;
    for (const block of blocks) {
      result = result.replace(block.placeholder, block.content);
    }
    return result;
  }

  /**
   * Remove HTML tags
   * @private
   */
  _removeHtml(text) {
    // Remove script and style content entirely
    let result = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    result = result.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Replace block elements with newlines
    result = result.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n');
    result = result.replace(/<(br|hr)\s*\/?>/gi, '\n');

    // Remove all remaining tags
    result = result.replace(/<[^>]+>/g, '');

    return result;
  }

  /**
   * Decode HTML entities
   * @private
   */
  _decodeHtmlEntities(text) {
    let result = text;

    // Replace named entities
    for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
      result = result.replace(new RegExp(entity, 'g'), char);
    }

    // Replace numeric entities
    result = result.replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 10))
    );

    // Replace hex entities
    result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16))
    );

    return result;
  }

  /**
   * Normalize Unicode characters
   * @private
   */
  _normalizeUnicode(text) {
    // Normalize to NFC form
    let result = text.normalize('NFC');

    // Replace fancy quotes with standard ones
    result = result.replace(/[\u2018\u2019]/g, "'");
    result = result.replace(/[\u201C\u201D]/g, '"');

    // Replace various dashes with standard hyphen
    result = result.replace(/[\u2013\u2014\u2015]/g, '-');

    // Replace non-breaking spaces
    result = result.replace(/\u00A0/g, ' ');

    return result;
  }

  /**
   * Remove PII from text
   * @private
   */
  _removePII(text) {
    let result = text;
    const redactions = [];

    for (const [type, config] of Object.entries(PII_PATTERNS)) {
      const matches = result.match(config.pattern);
      if (matches && matches.length > 0) {
        redactions.push({ type, count: matches.length });
        result = result.replace(config.pattern, config.replacement);
      }
    }

    return { text: result, redactions };
  }

  /**
   * Remove URLs from text
   * @private
   */
  _removeUrls(text) {
    // Full URLs
    let result = text.replace(/https?:\/\/[^\s<>\"']+/gi, '[URL]');

    // Partial URLs (www.)
    result = result.replace(/www\.[^\s<>\"']+/gi, '[URL]');

    return result;
  }

  /**
   * Remove emojis from text
   * @private
   */
  _removeEmojis(text) {
    // Remove emoji characters
    return text.replace(
      /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
      ''
    );
  }

  /**
   * Normalize whitespace
   * @private
   */
  _normalizeWhitespace(text, opts) {
    // Replace tabs with spaces
    let result = text.replace(/\t/g, '  ');

    // Replace multiple spaces with single space
    result = result.replace(/ {2,}/g, ' ');

    // Normalize line endings to \n
    result = result.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Replace multiple newlines with double newline (preserve paragraph structure)
    if (opts.preserveStructure) {
      result = result.replace(/\n{3,}/g, '\n\n');
    } else {
      result = result.replace(/\n+/g, '\n');
    }

    return result;
  }

  /**
   * Trim whitespace from each line
   * @private
   */
  _trimLines(text) {
    return text
      .split('\n')
      .map(line => line.trim())
      .join('\n');
  }

  /**
   * Remove empty lines
   * @private
   */
  _removeEmptyLines(text, preserveStructure) {
    if (preserveStructure) {
      // Keep one empty line for paragraph separation
      return text.replace(/\n{2,}/g, '\n\n');
    }
    return text
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join('\n');
  }
}

/**
 * Create a new sanitizer instance
 * @param {Object} config - Configuration options
 * @returns {TextSanitizer} Sanitizer instance
 */
function createSanitizer(config = {}) {
  return new TextSanitizer(config);
}

/**
 * Default sanitizer instance
 */
const defaultSanitizer = new TextSanitizer();

/**
 * Quick clean function using default sanitizer
 * @param {string} text - Input text
 * @returns {string} Cleaned text
 */
function cleanText(text) {
  return defaultSanitizer.clean(text);
}

/**
 * Sanitize text for embedding
 * @param {string} text - Input text
 * @returns {string} Cleaned text
 */
function sanitizeForEmbedding(text) {
  return defaultSanitizer.forEmbedding(text);
}

/**
 * Sanitize text for graph extraction
 * @param {string} text - Input text
 * @returns {string} Cleaned text
 */
function sanitizeForGraphExtraction(text) {
  return defaultSanitizer.forGraphExtraction(text);
}

/**
 * Sanitize text for storage (with PII removal)
 * @param {string} text - Input text
 * @returns {Object} Sanitized result with metadata
 */
function sanitizeForStorage(text) {
  return defaultSanitizer.forStorage(text);
}

module.exports = {
  TextSanitizer,
  createSanitizer,
  cleanText,
  sanitizeForEmbedding,
  sanitizeForGraphExtraction,
  sanitizeForStorage,
  PII_PATTERNS,
  DEFAULT_CONFIG
};

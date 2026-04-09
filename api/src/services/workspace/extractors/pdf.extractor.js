/**
 * PDF Text Extractor
 *
 * Extracts text content from PDF files using pdf-parse.
 * Preserves page structure and basic metadata.
 *
 * @module services/workspace/extractors/pdf
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[PDFExtractor]';

/**
 * Extract text from PDF file
 * @param {string} filePath - Path to PDF file
 * @param {Object} options
 * @param {number} [options.maxPages=0] - Limit pages (0 = all)
 * @returns {Promise<ExtractionResult>}
 */
async function extractFromPDF(filePath, options = {}) {
  const { maxPages = 0 } = options;

  // Lazy-load pdf-parse to avoid startup cost
  let pdfParse;
  try {
    pdfParse = require('pdf-parse');
  } catch (err) {
    return {
      success: false,
      error: 'pdf-parse not installed. Run: npm install pdf-parse',
      text: '',
      metadata: {},
      structure: null
    };
  }

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const dataBuffer = fs.readFileSync(filePath);

    const pdfOptions = {};
    if (maxPages > 0) pdfOptions.max = maxPages;

    const data = await pdfParse(dataBuffer, pdfOptions);

    // Split by page breaks if present, otherwise treat as single page
    const rawText = data.text || '';
    const pages = splitIntoPages(rawText, data.numpages);

    const result = {
      success: true,
      text: rawText,
      metadata: {
        pageCount: data.numpages || 1,
        title: data.info?.Title || '',
        author: data.info?.Author || '',
        subject: data.info?.Subject || '',
        creator: data.info?.Creator || '',
        producer: data.info?.Producer || '',
        creationDate: data.info?.CreationDate || '',
        modDate: data.info?.ModDate || '',
        pdfVersion: data.version || ''
      },
      structure: {
        pages: pages.map((content, idx) => ({
          pageNumber: idx + 1,
          content: content.trim(),
          charCount: content.length,
          wordCount: countWords(content)
        })),
        headings: detectHeadings(rawText),
        sections: detectSections(rawText)
      },
      charCount: rawText.length,
      wordCount: countWords(rawText)
    };

    console.log(`${LOG_PREFIX} Extracted ${result.charCount} chars, ${result.metadata.pageCount} pages from ${path.basename(filePath)}`);
    return result;

  } catch (error) {
    console.error(`${LOG_PREFIX} Extraction failed for ${filePath}: ${error.message}`);
    return {
      success: false,
      error: error.message,
      text: '',
      metadata: {},
      structure: null,
      charCount: 0,
      wordCount: 0
    };
  }
}

/**
 * Split text into approximate pages
 * @private
 */
function splitIntoPages(text, expectedPageCount) {
  // pdf-parse sometimes inserts form feed characters between pages
  const formFeedPages = text.split('\f').filter(p => p.trim());
  if (formFeedPages.length > 1) {
    return formFeedPages;
  }

  // If no form feeds, try splitting by double newlines roughly evenly
  if (expectedPageCount > 1) {
    const avgCharsPerPage = Math.ceil(text.length / expectedPageCount);
    const pages = [];
    for (let i = 0; i < text.length; i += avgCharsPerPage) {
      // Try to split at a paragraph boundary near the target position
      let splitPos = i + avgCharsPerPage;
      const nextNewline = text.indexOf('\n\n', splitPos - 200);
      if (nextNewline > 0 && nextNewline < splitPos + 200) {
        splitPos = nextNewline + 2;
      }
      pages.push(text.substring(i, Math.min(splitPos, text.length)));
    }
    return pages;
  }

  return [text];
}

/**
 * Detect potential headings in text
 * @private
 */
function detectHeadings(text) {
  const headings = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Heuristic: short lines (< 100 chars) followed by longer content
    // that are ALL CAPS or start with a number pattern
    const isAllCaps = line.length > 3 && line.length < 100 && line === line.toUpperCase() && /[A-Z]/.test(line);
    const isNumbered = /^(\d+\.)+\s+\S/.test(line) && line.length < 120;
    const isRomanNumbered = /^(I{1,3}|IV|V|VI{0,3}|IX|X)\.\s+\S/i.test(line);

    if (isAllCaps || isNumbered || isRomanNumbered) {
      headings.push({
        text: line,
        lineNumber: i + 1,
        type: isAllCaps ? 'caps' : 'numbered',
        level: isNumbered ? (line.match(/\./g) || []).length : 1
      });
    }
  }

  return headings;
}

/**
 * Detect sections (groups of content between headings)
 * @private
 */
function detectSections(text) {
  const headings = detectHeadings(text);
  if (headings.length === 0) return [];

  const lines = text.split('\n');
  const sections = [];

  for (let i = 0; i < headings.length; i++) {
    const startLine = headings[i].lineNumber - 1;
    const endLine = i < headings.length - 1
      ? headings[i + 1].lineNumber - 2
      : lines.length - 1;

    const sectionLines = lines.slice(startLine, endLine + 1);
    sections.push({
      heading: headings[i].text,
      level: headings[i].level,
      content: sectionLines.join('\n').trim(),
      charCount: sectionLines.join('\n').length
    });
  }

  return sections;
}

/**
 * Count words in text
 * @private
 */
function countWords(text) {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Check if file is PDF by extension or mime type
 * @param {string} filePathOrMime
 * @returns {boolean}
 */
function isPDF(filePathOrMime) {
  if (!filePathOrMime) return false;
  const lower = filePathOrMime.toLowerCase();
  return lower.endsWith('.pdf') || lower === 'application/pdf';
}

module.exports = {
  extractFromPDF,
  isPDF
};

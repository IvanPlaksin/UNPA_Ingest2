/**
 * Unified Text Extractor
 *
 * Auto-detects file format and delegates to the appropriate extractor.
 * Supports: PDF, DOCX, XLSX/XLS/CSV, TXT/MD/JSON/XML, HTML
 *
 * @module services/workspace/extractors
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { extractFromPDF, isPDF } = require('./pdf.extractor');
const { extractFromDOCX, isDOCX } = require('./docx.extractor');
const { extractFromExcel, isExcel } = require('./excel.extractor');

const LOG_PREFIX = '[TextExtractor]';

// Text-based formats that can be read directly
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.csv', '.tsv',
  '.json', '.xml', '.yaml', '.yml',
  '.html', '.htm', '.sql', '.log',
  '.js', '.ts', '.py', '.java', '.cs', '.cpp', '.c', '.h',
  '.sh', '.bash', '.ps1', '.bat',
  '.ini', '.cfg', '.conf', '.env',
  '.cypher', '.graphql'
]);

const TEXT_MIMETYPES = new Set([
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/xml',
  'application/json', 'application/xml', 'application/sql',
  'application/javascript', 'text/javascript'
]);

/**
 * Extract text from any supported file
 * @param {string} filePath - Path to file
 * @param {string} [mimeType] - MIME type hint
 * @param {Object} [options] - Extractor-specific options
 * @returns {Promise<ExtractionResult>}
 */
async function extractText(filePath, mimeType = '', options = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}`, text: '', metadata: {} };
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  console.log(`${LOG_PREFIX} Extracting from ${path.basename(filePath)} (ext=${ext}, mime=${mime})`);

  // PDF
  if (isPDF(ext) || isPDF(mime)) {
    return extractFromPDF(filePath, options);
  }

  // DOCX
  if (isDOCX(ext) || isDOCX(mime)) {
    return extractFromDOCX(filePath, options);
  }

  // Excel / CSV (xlsx handles CSV too)
  if (isExcel(ext) || isExcel(mime)) {
    return extractFromExcel(filePath, options);
  }

  // Plain text formats
  if (TEXT_EXTENSIONS.has(ext) || TEXT_MIMETYPES.has(mime)) {
    return extractFromTextFile(filePath);
  }

  // Fallback: try reading as text
  console.warn(`${LOG_PREFIX} Unknown format ${ext}/${mime}, attempting text read`);
  return extractFromTextFile(filePath);
}

/**
 * Extract from plain text file
 * @param {string} filePath
 * @returns {Promise<ExtractionResult>}
 */
async function extractFromTextFile(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    return {
      success: true,
      text,
      metadata: {
        format: ext.replace('.', '') || 'text',
        encoding: 'utf-8'
      },
      structure: {
        headings: detectMarkdownHeadings(text, ext),
        sections: [],
        lineCount: text.split('\n').length
      },
      charCount: text.length,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length
    };
  } catch (error) {
    return { success: false, error: error.message, text: '', metadata: {}, charCount: 0, wordCount: 0 };
  }
}

/**
 * Detect markdown-style headings
 * @private
 */
function detectMarkdownHeadings(text, ext) {
  if (ext !== '.md' && ext !== '.markdown') return [];

  const headings = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        lineNumber: i + 1
      });
    }
  }
  return headings;
}

/**
 * Get supported formats list
 */
function getSupportedFormats() {
  return {
    pdf: { extensions: ['.pdf'], description: 'PDF documents' },
    docx: { extensions: ['.docx'], description: 'Microsoft Word documents' },
    excel: { extensions: ['.xlsx', '.xls', '.csv'], description: 'Spreadsheets and CSV' },
    text: { extensions: [...TEXT_EXTENSIONS], description: 'Plain text, code, config files' }
  };
}

module.exports = {
  extractText,
  extractFromTextFile,
  getSupportedFormats,
  // Re-export individual extractors
  extractFromPDF,
  extractFromDOCX,
  extractFromExcel,
  isPDF,
  isDOCX,
  isExcel
};

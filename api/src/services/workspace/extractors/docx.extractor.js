/**
 * DOCX Text Extractor
 *
 * Extracts text from DOCX files using mammoth.
 * Preserves basic structure (headings, paragraphs, lists, tables).
 *
 * @module services/workspace/extractors/docx
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[DOCXExtractor]';

/**
 * Extract text from DOCX file
 * @param {string} filePath - Path to DOCX file
 * @param {Object} options
 * @param {boolean} [options.includeHtml=false] - Also return HTML representation
 * @returns {Promise<ExtractionResult>}
 */
async function extractFromDOCX(filePath, options = {}) {
  let mammoth;
  try {
    mammoth = require('mammoth');
  } catch {
    return { success: false, error: 'mammoth not installed. Run: npm install mammoth', text: '', metadata: {} };
  }

  try {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    const buffer = fs.readFileSync(filePath);

    // Extract raw text
    const textResult = await mammoth.extractRawText({ buffer });
    const text = textResult.value || '';

    // Extract HTML for structure analysis
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value || '';
    const warnings = [...(textResult.messages || []), ...(htmlResult.messages || [])];

    // Parse structure from HTML
    const structure = parseStructureFromHtml(html);

    const result = {
      success: true,
      text,
      metadata: {
        format: 'docx',
        warningCount: warnings.length,
        warnings: warnings.slice(0, 10).map(w => w.message || String(w))
      },
      structure: {
        headings: structure.headings,
        sections: structure.sections,
        tableCount: structure.tableCount,
        listCount: structure.listCount,
        imageCount: structure.imageCount
      },
      charCount: text.length,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length
    };

    if (options.includeHtml) {
      result.html = html;
    }

    console.log(`${LOG_PREFIX} Extracted ${result.charCount} chars from ${path.basename(filePath)}`);
    return result;

  } catch (error) {
    console.error(`${LOG_PREFIX} Extraction failed: ${error.message}`);
    return { success: false, error: error.message, text: '', metadata: {}, charCount: 0, wordCount: 0 };
  }
}

/**
 * Parse structure from HTML output
 * @private
 */
function parseStructureFromHtml(html) {
  const headings = [];
  const headingRegex = /<h(\d)>(.*?)<\/h\d>/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      text: stripHtml(match[2]),
      position: match.index
    });
  }

  // Count structural elements
  const tableCount = (html.match(/<table/gi) || []).length;
  const listCount = (html.match(/<[ou]l/gi) || []).length;
  const imageCount = (html.match(/<img/gi) || []).length;

  // Build sections from headings
  const sections = [];
  for (let i = 0; i < headings.length; i++) {
    const startPos = headings[i].position;
    const endPos = i < headings.length - 1 ? headings[i + 1].position : html.length;
    const sectionHtml = html.substring(startPos, endPos);
    sections.push({
      heading: headings[i].text,
      level: headings[i].level,
      content: stripHtml(sectionHtml).trim(),
      charCount: stripHtml(sectionHtml).length
    });
  }

  return { headings, sections, tableCount, listCount, imageCount };
}

/**
 * Strip HTML tags
 * @private
 */
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/**
 * Check if file is DOCX
 */
function isDOCX(filePathOrMime) {
  if (!filePathOrMime) return false;
  const lower = filePathOrMime.toLowerCase();
  return lower.endsWith('.docx') || lower === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

module.exports = { extractFromDOCX, isDOCX };

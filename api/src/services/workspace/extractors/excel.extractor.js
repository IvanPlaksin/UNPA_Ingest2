/**
 * Excel Text Extractor
 *
 * Extracts data from Excel files (.xlsx, .xls, .csv) using xlsx library.
 * Returns structured tabular data + flattened text representation.
 *
 * @module services/workspace/extractors/excel
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[ExcelExtractor]';

/**
 * Extract data from Excel file
 * @param {string} filePath - Path to Excel/CSV file
 * @param {Object} options
 * @param {number} [options.maxRows=5000] - Max rows per sheet
 * @param {boolean} [options.includeFormulas=false] - Extract formulas
 * @returns {Promise<ExtractionResult>}
 */
async function extractFromExcel(filePath, options = {}) {
  const { maxRows = 5000 } = options;

  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch {
    return { success: false, error: 'xlsx not installed. Run: npm install xlsx', text: '', metadata: {} };
  }

  try {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

    const workbook = XLSX.readFile(filePath, { cellDates: true, cellNF: true });
    const sheetNames = workbook.SheetNames;
    const sheets = [];
    const textParts = [];
    let totalRows = 0;
    let totalCols = 0;

    for (const sheetName of sheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
      const rowCount = Math.min(range.e.r + 1, maxRows);
      const colCount = range.e.c + 1;

      // Convert to JSON for structured data
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, range: { s: { r: 0, c: 0 }, e: { r: rowCount - 1, c: range.e.c } } });

      // Extract headers (first row)
      const headers = jsonData[0] ? jsonData[0].map(h => String(h || '').trim()) : [];

      // Convert to text
      const csvText = XLSX.utils.sheet_to_csv(sheet, { RS: '\n' });

      sheets.push({
        name: sheetName,
        rowCount: jsonData.length,
        colCount,
        headers,
        sampleData: jsonData.slice(0, 10), // First 10 rows for preview
        columnTypes: detectColumnTypes(jsonData, headers)
      });

      textParts.push(`=== Sheet: ${sheetName} (${jsonData.length} rows × ${colCount} cols) ===`);
      textParts.push(`Headers: ${headers.join(' | ')}`);
      textParts.push(csvText.substring(0, 10000)); // Cap per sheet
      textParts.push('');

      totalRows += jsonData.length;
      totalCols = Math.max(totalCols, colCount);
    }

    const text = textParts.join('\n');

    const result = {
      success: true,
      text,
      metadata: {
        format: path.extname(filePath).replace('.', ''),
        sheetCount: sheetNames.length,
        sheetNames,
        totalRows,
        maxColumns: totalCols
      },
      structure: {
        sheets,
        headings: sheets.map(s => ({ text: s.name, level: 1 })),
        sections: sheets.map(s => ({
          heading: s.name,
          level: 1,
          content: `${s.rowCount} rows, ${s.colCount} columns. Headers: ${s.headers.join(', ')}`,
          charCount: 0
        }))
      },
      charCount: text.length,
      wordCount: text.split(/\s+/).filter(w => w.length > 0).length
    };

    console.log(`${LOG_PREFIX} Extracted ${sheetNames.length} sheets, ${totalRows} rows from ${path.basename(filePath)}`);
    return result;

  } catch (error) {
    console.error(`${LOG_PREFIX} Extraction failed: ${error.message}`);
    return { success: false, error: error.message, text: '', metadata: {}, charCount: 0, wordCount: 0 };
  }
}

/**
 * Detect column data types from sample data
 * @private
 */
function detectColumnTypes(jsonData, headers) {
  if (!headers.length || jsonData.length < 2) return {};

  const types = {};
  const sampleRows = jsonData.slice(1, Math.min(21, jsonData.length));

  for (let col = 0; col < headers.length; col++) {
    const header = headers[col] || `col_${col}`;
    const values = sampleRows.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== '');

    if (values.length === 0) {
      types[header] = 'empty';
      continue;
    }

    const allNumbers = values.every(v => typeof v === 'number' || !isNaN(parseFloat(v)));
    const allDates = values.every(v => v instanceof Date || (!isNaN(Date.parse(String(v))) && String(v).length > 6));
    const allBooleans = values.every(v => ['true', 'false', 'yes', 'no', '1', '0'].includes(String(v).toLowerCase()));

    if (allBooleans) types[header] = 'boolean';
    else if (allDates) types[header] = 'date';
    else if (allNumbers) types[header] = 'number';
    else types[header] = 'string';
  }

  return types;
}

/**
 * Check if file is Excel/CSV
 */
function isExcel(filePathOrMime) {
  if (!filePathOrMime) return false;
  const lower = filePathOrMime.toLowerCase();
  return lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')
    || lower.includes('spreadsheet') || lower === 'text/csv';
}

module.exports = { extractFromExcel, isExcel };

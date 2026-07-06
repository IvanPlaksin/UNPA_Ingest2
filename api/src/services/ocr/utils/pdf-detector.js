'use strict';

const { minMeaningfulChars } = require('../../../config/ocr.config');

/**
 * Quickly determine if a PDF buffer is image-based (scanned, no text layer).
 * Uses pdf-parse — same lib used by the extraction pipeline.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{ isScanned: boolean, pageCount: number, hasTextLayer: boolean, charCount: number }>}
 */
async function isImageBasedPdf(pdfBuffer) {
  let text = '';
  let numpages = 0;

  try {
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(pdfBuffer, { max: 0 }); // max:0 = all pages
    text = data.text || '';
    numpages = data.numpages || 0;
  } catch {
    // If pdf-parse fails, assume scanned
    return { isScanned: true, pageCount: 0, hasTextLayer: false, charCount: 0 };
  }

  const charCount = text.replace(/\s+/g, '').length;
  const hasTextLayer = charCount >= minMeaningfulChars;

  return {
    isScanned: !hasTextLayer,
    pageCount: numpages,
    hasTextLayer,
    charCount,
  };
}

module.exports = { isImageBasedPdf };

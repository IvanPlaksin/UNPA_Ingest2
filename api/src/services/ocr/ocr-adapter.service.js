'use strict';

const fs        = require('fs');
const path      = require('path');
const os        = require('os');
const { v4: uuid } = require('uuid');

const ocrConfig = require('../../config/ocr.config');
const { isImageBasedPdf } = require('./utils/pdf-detector');

let _providers = null;

function getProviders() {
  if (!_providers) {
    const { TesseractProvider } = require('./providers/tesseract.provider');
    const { RapidOcrProvider }  = require('./providers/rapidocr.provider');
    const { VlmProvider }       = require('./providers/vlm.provider');
    _providers = {
      ocrmypdf: new TesseractProvider(),
      rapidocr: new RapidOcrProvider(),
      vlm:      new VlmProvider(),
    };
  }
  return _providers;
}

/**
 * OcrAdapter — single entry point for all OCR operations.
 *
 * Usage:
 *   const ocrAdapter = require('./ocr-adapter.service');
 *   const result = await ocrAdapter.detectAndProcess(pdfBuffer, storagePath);
 *
 * OcrAdapterResult shape:
 *   {
 *     searchablePdf:    Buffer | null,
 *     text:             string,
 *     blocks:           any[],
 *     confidence:       number,   // 0-100
 *     engine:           string,
 *     engineVersion:    string,
 *     profile:          string,
 *     langsDetected:    string[],
 *     pagesProcessed:   number,
 *     escalationPending?: boolean,
 *     escalationReason?:  string,
 *   }
 */
class OcrAdapter {

  /**
   * Auto-detect if PDF is scanned; if so, run OCR and return result.
   * Returns null if PDF has a text layer (no OCR needed).
   *
   * @param {Buffer}  pdfBuffer    - Raw PDF bytes
   * @param {string}  storagePath  - Path where the PDF is stored on disk (used as input to OCRmyPDF)
   * @param {object}  opts
   * @param {string}  opts.profile - 'portable' | 'quality' | 'heavy' (default: ocrConfig.defaultProfile)
   * @param {string[]} opts.langs  - Override language list
   * @returns {Promise<OcrAdapterResult | null>}
   */
  async detectAndProcess(pdfBuffer, storagePath, opts = {}) {
    const detection = await isImageBasedPdf(pdfBuffer);
    if (!detection.isScanned) return null; // already has text layer

    return this.recognize(storagePath, opts);
  }

  /**
   * Run OCR unconditionally on a PDF file at storagePath.
   *
   * @param {string}  storagePath
   * @param {object}  opts
   * @param {string}  opts.profile
   * @param {string[]} opts.langs
   * @returns {Promise<OcrAdapterResult>}
   */
  async recognize(storagePath, { profile = null, langs = null } = {}) {
    const effectiveProfile = profile || ocrConfig.defaultProfile;
    const profileConfig = ocrConfig.profiles[effectiveProfile];
    if (!profileConfig) {
      throw new Error(`Unknown OCR profile: ${effectiveProfile}`);
    }

    const engine = profileConfig.engine;
    const providers = getProviders();
    const provider = providers[engine];
    if (!provider) throw new Error(`No provider registered for engine: ${engine}`);

    const result = await provider.recognize(storagePath, { langs });
    return result;
  }

  /**
   * Return provenance fields to write onto a Document node in Memgraph.
   * @param {OcrAdapterResult} result
   * @returns {object}
   */
  toProvenance(result) {
    return {
      ocrApplied:        true,
      ocrEngine:         result.engine,
      ocrEngineVersion:  result.engineVersion,
      ocrProfile:        result.profile,
      ocrConfidence:     result.confidence,
      ocrLangs:          (result.langsDetected || []).join(','),
      ocrProcessedAt:    new Date().toISOString(),
      ocrPagesProcessed: result.pagesProcessed || 0,
    };
  }
}

const ocrAdapter = new OcrAdapter();
module.exports = ocrAdapter;
module.exports.OcrAdapter = OcrAdapter;

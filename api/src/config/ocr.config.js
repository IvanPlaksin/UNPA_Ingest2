'use strict';

const path = require('path');

// Defaults to known install paths on dev machine; override via env in prod
const DEFAULT_TESS_PATH = 'C:\\Users\\IPLAKSIN\\AppData\\Local\\Programs\\Tesseract-OCR\\tesseract.exe';
const DEFAULT_OCRMYPDF_PATH = 'C:\\Users\\IPLAKSIN\\AppData\\Local\\Python\\pythoncore-3.14-64\\Scripts\\ocrmypdf.exe';
const DEFAULT_TESSDATA_PATH = 'C:\\Users\\IPLAKSIN\\AppData\\Local\\Programs\\Tesseract-OCR\\tessdata';

module.exports = {
  tesseractPath: process.env.TESSERACT_PATH || DEFAULT_TESS_PATH,
  ocrmypdfPath:  process.env.OCRMYPDF_PATH  || DEFAULT_OCRMYPDF_PATH,
  tessdataPath:  process.env.TESSDATA_PATH   || DEFAULT_TESSDATA_PATH,

  // UN official languages + script detection
  defaultLangs: ['eng', 'fra', 'spa', 'rus', 'ara', 'chi_sim'],
  fallbackLangs: ['eng'],

  profiles: {
    portable: { engine: 'ocrmypdf',  priority: 1, description: 'OCRmyPDF + Tesseract 5' },
    quality:  { engine: 'rapidocr',  priority: 2, description: 'RapidOCR ONNX (not yet available)' },
    heavy:    { engine: 'vlm',       priority: 3, description: 'VLM stub for future use' },
  },

  defaultProfile: 'portable',

  // min chars after whitespace strip before PDF is considered text-bearing
  minMeaningfulChars: 20,

  // OCR quality floor (0-100). Below this → escalate or flag for review
  confidenceThreshold: 60,

  // Max time to wait for OCRmyPDF process (ms)
  timeoutMs: parseInt(process.env.OCR_TIMEOUT_MS || '120000', 10),

  // OCRmyPDF flags for portable profile
  // --clean removed: requires 'unpaper' which is not available on Windows
  // pdfa requires Ghostscript (not available); use pdf (searchable, no PDF/A compliance)
  ocrmypdfFlags: [
    '--deskew',
    '--rotate-pages',
    '--optimize', '1',
    '--output-type', 'pdf',
    '--skip-text',
  ],
};

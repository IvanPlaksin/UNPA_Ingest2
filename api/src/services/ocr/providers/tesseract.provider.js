'use strict';

const { spawn }    = require('child_process');
const fs           = require('fs');
const path         = require('path');
const os           = require('os');
const { v4: uuid } = require('uuid');

const ocrConfig = require('../../../config/ocr.config');

/**
 * TesseractProvider — portable OCR profile using OCRmyPDF + Tesseract 5.
 *
 * Input:  path to a PDF file
 * Output: OcrAdapterResult  { searchablePdf, text, confidence, engine, engineVersion, ... }
 */
class TesseractProvider {
  constructor(config = {}) {
    this.tesseractPath = config.tesseractPath || ocrConfig.tesseractPath;
    this.ocrmypdfPath  = config.ocrmypdfPath  || ocrConfig.ocrmypdfPath;
    this.tessdataPath  = config.tessdataPath  || ocrConfig.tessdataPath;
    this.timeoutMs     = config.timeoutMs     || ocrConfig.timeoutMs;
    this._version      = null;
  }

  async getVersion() {
    if (this._version) return this._version;
    try {
      const out = await _spawn(this.tesseractPath, ['--version'], this.timeoutMs);
      const m = out.match(/tesseract\s+v?(\S+)/i);
      this._version = m ? m[1] : 'unknown';
    } catch {
      this._version = 'unknown';
    }
    return this._version;
  }

  /**
   * Run OCRmyPDF on a PDF file.
   *
   * @param {string} inputPath   - Absolute path to input PDF
   * @param {object} opts
   * @param {string[]} opts.langs  - Tesseract language codes (default: ocrConfig.defaultLangs)
   * @returns {Promise<OcrAdapterResult>}
   */
  async recognize(inputPath, { langs = null } = {}) {
    const effectiveLangs = (langs && langs.length > 0)
      ? langs.filter(l => typeof l === 'string')
      : ocrConfig.defaultLangs;

    // Build lang string — fall back to 'eng' if any lang missing tessdata
    const langStr = await this._buildLangStr(effectiveLangs);

    const tmpOutput = path.join(os.tmpdir(), `ocr-${uuid()}.pdf`);
    const tmpText   = path.join(os.tmpdir(), `ocr-${uuid()}.txt`);

    try {
      // Step 1: OCRmyPDF → searchable PDF
      // OCRmyPDF finds Tesseract via PATH — inject tesseract directory into env
      const tessDir = path.dirname(this.tesseractPath);
      const spawnEnv = {
        ...process.env,
        PATH: `${tessDir}${path.delimiter}${process.env.PATH || ''}`,
        TESSDATA_PREFIX: this.tessdataPath,
      };

      const ocrmypdfArgs = [
        ...ocrConfig.ocrmypdfFlags,
        '-l', langStr,
        '--tesseract-pagesegmode', '1',
        inputPath,
        tmpOutput,
      ];

      await _spawn(this.ocrmypdfPath, ocrmypdfArgs, this.timeoutMs, spawnEnv);

      // Step 2: Extract text from searchable PDF via pdf-parse
      const pdfParse = require('pdf-parse');
      const pdfBuf   = fs.readFileSync(tmpOutput);
      const pdfData  = await pdfParse(pdfBuf, { max: 0 });
      const text     = (pdfData.text || '').trim();

      // Rough confidence estimate: chars per page vs typical OCR output
      const pages      = pdfData.numpages || 1;
      const charsPerPg = text.replace(/\s+/g, '').length / pages;
      const confidence = Math.min(100, Math.round(50 + charsPerPg / 20)); // heuristic

      const version = await this.getVersion();
      const detectedLangs = langStr.split('+');

      return {
        searchablePdf:  pdfBuf,
        text,
        blocks:         [],
        confidence,
        engine:         'tesseract',
        engineVersion:  version,
        profile:        'portable',
        langsDetected:  detectedLangs,
        pagesProcessed: pages,
      };
    } finally {
      _cleanup(tmpOutput, tmpText);
    }
  }

  async _buildLangStr(langs) {
    const available = new Set();
    try {
      const tessEnv = { ...process.env, TESSDATA_PREFIX: this.tessdataPath };
      const out = await _spawn(
        this.tesseractPath,
        ['--tessdata-dir', this.tessdataPath, '--list-langs'],
        10000,
        tessEnv
      );
      for (const l of out.split(/\r?\n/).map(s => s.trim()).filter(Boolean)) {
        available.add(l);
      }
    } catch {
      return 'eng'; // safest fallback
    }

    const usable = langs.filter(l => available.has(l));
    return (usable.length > 0 ? usable : ['eng']).join('+');
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _spawn(cmd, args, timeoutMs = 60000, env = undefined) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { windowsHide: true, env });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`OCR process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0 || code === 6) {
        // OCRmyPDF exit 6 = already has text (--skip-text), treat as success
        resolve(stdout + stderr);
      } else {
        reject(new Error(`OCR process exited ${code}: ${stderr.slice(0, 400)}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(new Error(`Failed to start OCR process: ${err.message}`));
    });
  });
}

function _cleanup(...paths) {
  for (const p of paths) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
}

module.exports = { TesseractProvider };

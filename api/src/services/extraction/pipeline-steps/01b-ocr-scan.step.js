'use strict';

const path = require('path');
const { addLog, startStep, completeStep, failStep, skipStep } = require('../pipeline-context');
const { minMeaningfulChars } = require('../../../config/ocr.config');

/**
 * OCR Scan Step — runs between load-source and chunk-text.
 *
 * Skipped when:
 *  - mode is not DOCUMENT
 *  - text layer is already sufficient (≥ minMeaningfulChars non-whitespace chars)
 *
 * On scanned PDF (insufficient text):
 *  - runs OCRmyPDF via ocrAdapter.recognize()
 *  - replaces ctx.text with OCR output
 *  - stores ctx.ocrResult for downstream use
 *  - writes provenance fields to Document node in Memgraph (non-fatal)
 */
module.exports = async function ocrScanStep(ctx) {
  // OCR only applies to document mode
  if (ctx.mode !== 'DOCUMENT') {
    skipStep(ctx, 'ocr-scan', 'OCR not applicable for workspace mode');
    return;
  }

  const meaningfulChars = (ctx.text || '').replace(/\s+/g, '').length;

  // Text layer is already sufficient — no OCR needed
  if (meaningfulChars >= minMeaningfulChars) {
    skipStep(ctx, 'ocr-scan', `Text layer present (${meaningfulChars} chars) — OCR not needed`);
    return;
  }

  startStep(ctx, 'ocr-scan');
  try {
    const doc = ctx.sourceRef;
    const filename = doc?.originalname || ctx.sourceId;
    const ext = path.extname(filename || '').toLowerCase();

    if (ext !== '.pdf') {
      throw new Error(
        `Insufficient text content (${meaningfulChars} chars) in "${filename}" — OCR is only supported for PDF files`
      );
    }

    if (!doc?.storagePath) {
      throw new Error(`Cannot run OCR: document ${ctx.sourceId} has no storagePath`);
    }

    addLog(ctx, 'ocr-scan',
      `Scanned PDF detected (${meaningfulChars} meaningful chars). ` +
      `Running OCR (profile=${ctx.options?.ocrProfile || 'portable'})...`
    );

    const ocrAdapter = require('../../ocr/ocr-adapter.service');
    const ocrResult = await ocrAdapter.recognize(doc.storagePath, {
      profile: ctx.options?.ocrProfile || 'portable',
      langs:   ctx.options?.ocrLangs   || null,
    });

    const ocrMeaningful = (ocrResult?.text || '').replace(/\s+/g, '').length;
    if (!ocrResult || ocrMeaningful < minMeaningfulChars) {
      throw new Error(
        `OCR produced insufficient text (${ocrMeaningful} chars) from "${filename}" ` +
        `(confidence=${ocrResult?.confidence ?? '?'})`
      );
    }

    ctx.text         = ocrResult.text;
    ctx.ocrResult    = ocrResult;
    ctx.stats.textChars = ctx.text.length;

    // Write OCR provenance to Document node (non-fatal)
    try {
      const mg = require('../../memgraph.service');
      const provenance = ocrAdapter.toProvenance(ocrResult);
      await mg.runQuery(
        `MATCH (d:Document {id: $docId})
         SET d.ocrApplied         = $ocrApplied,
             d.ocrEngine          = $ocrEngine,
             d.ocrEngineVersion   = $ocrEngineVersion,
             d.ocrProfile         = $ocrProfile,
             d.ocrConfidence      = $ocrConfidence,
             d.ocrLangs           = $ocrLangs,
             d.ocrProcessedAt     = $ocrProcessedAt,
             d.ocrPagesProcessed  = $ocrPagesProcessed`,
        { docId: ctx.sourceId, ...provenance }
      );
    } catch { /* provenance write failure is non-fatal */ }

    addLog(ctx, 'ocr-scan',
      `OCR complete: engine=${ocrResult.engine} v${ocrResult.engineVersion || '?'} ` +
      `confidence=${ocrResult.confidence} pages=${ocrResult.pagesProcessed} ` +
      `chars=${ocrMeaningful}`
    );

    completeStep(ctx, 'ocr-scan', {
      engine:     ocrResult.engine,
      confidence: ocrResult.confidence,
      pages:      ocrResult.pagesProcessed,
      chars:      ocrMeaningful,
    });
  } catch (err) {
    // OCR failure is non-fatal — record it and continue with whatever text we have.
    // Downstream steps (chunk-text, extract-entities) will skip if ctx.text is empty.
    addLog(ctx, 'ocr-scan', `OCR failed (non-fatal): ${err.message}`, 'warn');
    failStep(ctx, 'ocr-scan', err);
  }
};

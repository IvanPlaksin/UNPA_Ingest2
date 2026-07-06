'use strict';

class RapidOcrProvider {
  async recognize(_inputPath, _opts) {
    throw new Error('RapidOCR provider not implemented. Use portable profile (OCRmyPDF + Tesseract).');
  }
}

module.exports = { RapidOcrProvider };

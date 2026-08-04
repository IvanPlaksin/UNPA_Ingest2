'use strict';

/**
 * DOC-0-002 — file → content block.
 *
 * The assertions that matter are the ones about the BUDGET and the BLOCK TYPE,
 * because both fail silently in production: an over-budget request comes back
 * as an opaque API error mid-conversation, and a scan sent as a `document`
 * (or a PDF sent as an `image`) is accepted and answered badly.
 */

const {
  MAX_REQUEST_BYTES,
  MAX_FILE_BYTES,
  EXTRACTABLE_TYPES,
  isSupportedForExtraction,
  validateFileSize,
  validateTotalSize,
  prepareContentBlock,
  textBlock,
  base64Size,
} = require('../multimodal');

describe('DOC-0-002: what the model can read', () => {
  test.each([
    ['application/pdf', 'document'],
    ['image/png', 'image'],
    ['image/jpeg', 'image'],
    ['image/gif', 'image'],
    ['image/webp', 'image'],
  ])('%s is extractable, carried as a %s block', (mime, blockType) => {
    expect(isSupportedForExtraction(mime)).toBe(true);
    expect(EXTRACTABLE_TYPES[mime]).toBe(blockType);
  });

  // Altiora's own allow-list permits these, so they upload fine and are then
  // not extractable — the gap is real and this is where it is recorded.
  test.each([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/svg+xml',
    'image/bmp',
    'image/tiff',
  ])('%s is NOT extractable', (mime) => {
    expect(isSupportedForExtraction(mime)).toBe(false);
  });

  test('handles the mime types a real upload actually carries', () => {
    expect(isSupportedForExtraction('IMAGE/PNG')).toBe(true);
    expect(isSupportedForExtraction('application/pdf; charset=binary')).toBe(true);
    expect(isSupportedForExtraction('  image/jpeg  ')).toBe(true);
  });

  test('rejects nothing-at-all rather than throwing on it', () => {
    expect(isSupportedForExtraction(undefined)).toBe(false);
    expect(isSupportedForExtraction(null)).toBe(false);
    expect(isSupportedForExtraction('')).toBe(false);
  });
});

describe('DOC-0-002: the 32 MB budget is on the ENCODED request', () => {
  test('base64 costs 4 bytes per 3', () => {
    expect(base64Size(3)).toBe(4);
    expect(base64Size(1)).toBe(4);      // padded
    expect(base64Size(3 * 1024)).toBe(4 * 1024);
  });

  test('the raw-byte budget is 24 MB, NOT 32 MB', () => {
    expect(MAX_REQUEST_BYTES).toBe(32 * 1024 * 1024);
    expect(MAX_FILE_BYTES).toBe(24 * 1024 * 1024);
    // The whole point: a file at the budget encodes to exactly the limit, and
    // one byte more does not fit.
    expect(base64Size(MAX_FILE_BYTES)).toBe(MAX_REQUEST_BYTES);
    expect(base64Size(MAX_FILE_BYTES + 1)).toBeGreaterThan(MAX_REQUEST_BYTES);
  });

  test('a 30 MB file is REJECTED even though 30 < 32', () => {
    // The bug this exists to prevent: a naive `size > 32MB` check passes this
    // file, and the request then fails at the API with 40 MB of base64.
    expect(() => validateFileSize(30 * 1024 * 1024, 'scan.pdf')).toThrow(/too large/);
  });

  test('accepts a file at the budget, rejects one just past it', () => {
    expect(() => validateFileSize(MAX_FILE_BYTES, 'ok.pdf')).not.toThrow();
    expect(() => validateFileSize(MAX_FILE_BYTES + 4096, 'big.pdf')).toThrow(/too large/);
  });

  test('the message quotes the raw size and the raw limit, not encoded ones', () => {
    let msg = '';
    try { validateFileSize(30 * 1024 * 1024, 'contract.pdf'); } catch (e) { msg = e.message; }
    expect(msg).toContain('contract.pdf');
    expect(msg).toContain('30.0 MB');       // what the user sees on disk
    expect(msg).not.toContain('40');        // never the encoded size
  });

  test('ordinary attachments pass', () => {
    expect(() => validateFileSize(2 * 1024 * 1024, 'small.pdf')).not.toThrow();
    expect(() => validateFileSize(0, 'empty.pdf')).not.toThrow();
  });

  test('a nonsense size is an error, not a silent pass', () => {
    expect(() => validateFileSize(NaN, 'x.pdf')).toThrow(/invalid size/);
    expect(() => validateFileSize(-1, 'x.pdf')).toThrow(/invalid size/);
    expect(() => validateFileSize('big', 'x.pdf')).toThrow(/invalid size/);
  });
});

describe('DOC-0-002: several documents share the one budget', () => {
  test('three files that each pass individually can still fail together', () => {
    const each = 10 * 1024 * 1024;   // 10 MB: individually fine
    const files = [
      { size: each, fileName: 'a.pdf' },
      { size: each, fileName: 'b.pdf' },
      { size: each, fileName: 'c.pdf' },
    ];
    for (const f of files) expect(() => validateFileSize(f.size, f.fileName)).not.toThrow();
    expect(() => validateTotalSize(files)).toThrow(/exceeds/);
  });

  test('a reasonable set passes', () => {
    expect(() => validateTotalSize([{ size: 2e6 }, { size: 3e6 }, { size: 1e6 }])).not.toThrow();
  });

  test('nothing attached is not an error', () => {
    expect(() => validateTotalSize([])).not.toThrow();
    expect(() => validateTotalSize(undefined)).not.toThrow();
  });

  test('tells the user what to do, not just what is wrong', () => {
    let msg = '';
    try { validateTotalSize([{ size: 20e6 }, { size: 20e6 }]); } catch (e) { msg = e.message; }
    expect(msg).toMatch(/fewer documents/i);
  });
});

describe('DOC-0-002: prepareContentBlock', () => {
  const PDF = Buffer.from('%PDF-1.7 fake');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  test('a PDF becomes a document block, a PNG an image block', () => {
    expect(prepareContentBlock(PDF, 'application/pdf')).toEqual({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: PDF.toString('base64') },
    });
    expect(prepareContentBlock(PNG, 'image/png')).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: PNG.toString('base64') },
    });
  });

  test('media_type is normalised into the block, so the API sees a clean value', () => {
    const block = prepareContentBlock(PDF, 'application/pdf; charset=binary');
    expect(block.source.media_type).toBe('application/pdf');
  });

  test('accepts an already-encoded string and strips whitespace the API rejects', () => {
    const b64 = PDF.toString('base64');
    const withNewlines = `${b64.slice(0, 4)}\n  ${b64.slice(4)}\r\n`;
    expect(prepareContentBlock(withNewlines, 'application/pdf').source.data).toBe(b64);
  });

  test('a Buffer over budget is refused here, before it reaches the API', () => {
    const huge = { length: 30 * 1024 * 1024 };
    Object.setPrototypeOf(huge, Buffer.prototype);   // a 30 MB Buffer without allocating one
    expect(() => prepareContentBlock(huge, 'application/pdf')).toThrow(/too large/);
  });

  test('refuses an unsupported type by name', () => {
    expect(() => prepareContentBlock(Buffer.from('x'), 'text/plain'))
      .toThrow(/unsupported file type for extraction: text\/plain/);
  });

  test('refuses missing or wrongly-typed data', () => {
    expect(() => prepareContentBlock(null, 'application/pdf')).toThrow(/no file data/);
    expect(() => prepareContentBlock('', 'application/pdf')).toThrow(/no file data/);
    expect(() => prepareContentBlock({ nope: 1 }, 'application/pdf')).toThrow(/Buffer or a base64 string/);
  });
});

describe('DOC-0-002: textBlock', () => {
  test('wraps the question', () => {
    expect(textBlock('Extract the beneficiary.')).toEqual({
      type: 'text', text: 'Extract the beneficiary.',
    });
  });

  test('never emits a non-string text', () => {
    expect(textBlock(undefined)).toEqual({ type: 'text', text: '' });
    expect(textBlock(null)).toEqual({ type: 'text', text: '' });
    expect(textBlock(42)).toEqual({ type: 'text', text: '42' });
  });
});

describe('DOC-0-002: the assembled turn', () => {
  test('document first, question second — the order completionWithContent needs', () => {
    const content = [
      prepareContentBlock(Buffer.from('%PDF-1.7'), 'application/pdf'),
      textBlock('Extract the beneficiary and the duty station.'),
    ];
    expect(content.map((b) => b.type)).toEqual(['document', 'text']);
  });
});

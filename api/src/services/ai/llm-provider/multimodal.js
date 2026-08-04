'use strict';

/**
 * DOC-0-002 — how a file becomes a content block.
 *
 * `completionWithContent` (anthropic-api.provider) sends blocks; this decides
 * what a block looks like, so the shape of a document is written once instead
 * of at every call site. Nothing here talks to the network or to a provider —
 * it is pure, which is why the limits below can be asserted rather than
 * discovered in production.
 *
 * THE 32 MB LIMIT IS ON THE REQUEST, NOT ON THE FILE, AND IT COUNTS BASE64.
 *
 * That distinction is the whole reason this module exists rather than a
 * one-line `size > 32MB` check at the upload endpoint. Base64 is 4 bytes per 3,
 * so a file weighs 1.33× on the wire and the real budget for raw bytes is
 * exactly 24 MB. A 30 MB PDF passes an innocent-looking file-size check and
 * then fails at the API with a message the user cannot act on. Worse, several
 * documents in one turn share the single budget, so per-file checks can all
 * pass while the request still cannot be sent — hence `validateTotalSize`.
 *
 * PAGE COUNT IS DELIBERATELY NOT CHECKED. A PDF's page count needs a parser,
 * and the ceiling is not ours to know anyway: it is 100 pages on a 200K-context
 * model (Haiku 4.5 — today's chat model) and 600 on a 1M-context one, so the
 * same file is legal or not depending on which model the caller picked. Ratified
 * with the architect: catch the API error, say something the user understands.
 *
 * @module services/ai/llm-provider/multimodal
 */

/** Anthropic's per-request ceiling. Applies to the whole request, base64 included. */
const MAX_REQUEST_BYTES = 32 * 1024 * 1024;

/**
 * What the model can actually read, mapped to the block type that carries it.
 *
 * The mapping is the point: a PDF is a `document` and a scan is an `image`, and
 * sending one as the other is accepted by the API and quietly answered badly.
 * Everything absent from this table is unsupported — .docx and .xlsx among them,
 * which is worth knowing because Altiora's own allow-list permits them, so a
 * file can upload successfully and still not be extractable.
 */
const EXTRACTABLE_TYPES = Object.freeze({
  'application/pdf': 'document',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
});

/** Normalises `image/PNG` and `application/pdf; charset=binary` to the table's keys. */
function normalizeMimeType(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase();
}

/**
 * Can the model read this at all?
 * @param {string} mimeType
 * @returns {boolean}
 */
function isSupportedForExtraction(mimeType) {
  return Object.prototype.hasOwnProperty.call(EXTRACTABLE_TYPES, normalizeMimeType(mimeType));
}

/** Bytes a buffer of `n` raw bytes occupies once base64-encoded. */
function base64Size(rawBytes) {
  return 4 * Math.ceil(rawBytes / 3);
}

/** The raw-byte budget, i.e. what a user may actually attach. Exactly 24 MB. */
const MAX_FILE_BYTES = Math.floor((MAX_REQUEST_BYTES / 4) * 3);

const asMb = (bytes) => (bytes / (1024 * 1024)).toFixed(1);

/**
 * One file against the request budget.
 *
 * Reports the RAW size to the user, not the encoded one — "your 30 MB file is
 * 40 MB" is true and useless. The limit quoted is the raw-byte budget for the
 * same reason.
 *
 * @param {number} sizeBytes raw, pre-encoding
 * @param {string} [fileName] for the message
 * @throws {Error} when the encoded file alone would not fit
 */
function validateFileSize(sizeBytes, fileName) {
  const n = Number(sizeBytes);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`[multimodal] invalid size for ${fileName || 'file'}: ${sizeBytes}`);
  }
  if (base64Size(n) > MAX_REQUEST_BYTES) {
    throw new Error(
      `File "${fileName || 'document'}" is too large (${asMb(n)} MB). Maximum is ${asMb(MAX_FILE_BYTES)} MB.`,
    );
  }
}

/**
 * Several files sharing the one request budget.
 *
 * Each can pass `validateFileSize` and the request still be unsendable; this is
 * the check that catches that, and it is the one the extraction step needs when
 * a user attaches three scans at once.
 *
 * @param {Array<{size:number, fileName?:string}>} files
 * @throws {Error} when the combined encoded payload would not fit
 */
function validateTotalSize(files) {
  const list = Array.isArray(files) ? files : [];
  const rawTotal = list.reduce((sum, f) => sum + Number((f && f.size) || 0), 0);
  if (base64Size(rawTotal) > MAX_REQUEST_BYTES) {
    throw new Error(
      `Attached documents total ${asMb(rawTotal)} MB, which exceeds the ${asMb(MAX_FILE_BYTES)} MB limit for one request. `
      + `Attach fewer documents at a time.`,
    );
  }
}

/**
 * A file → the block that carries it.
 *
 * Accepts a Buffer (the normal case — straight from multer or from Altiora's
 * download endpoint) or an already-encoded base64 string. Whitespace is stripped
 * from a passed-in string because the API rejects base64 containing newlines,
 * and a value that has been through a JSON file or an editor often has them;
 * `Buffer.toString('base64')` never does.
 *
 * @param {Buffer|string} data raw bytes, or base64
 * @param {string} mimeType
 * @returns {{type:string, source:{type:'base64', media_type:string, data:string}}}
 * @throws {Error} on an unsupported type, or a Buffer over the request budget
 */
function prepareContentBlock(data, mimeType) {
  const media = normalizeMimeType(mimeType);
  if (!isSupportedForExtraction(media)) {
    throw new Error(`[multimodal] unsupported file type for extraction: ${mimeType}`);
  }
  if (data === undefined || data === null || data === '') {
    throw new Error('[multimodal] prepareContentBlock: no file data');
  }

  let base64;
  if (Buffer.isBuffer(data)) {
    // Only a Buffer has a size we can trust; a string may already be encoded,
    // and guessing its raw size would reject legitimate input.
    validateFileSize(data.length);
    base64 = data.toString('base64');
  } else if (typeof data === 'string') {
    base64 = data.replace(/\s/g, '');
  } else {
    throw new Error('[multimodal] prepareContentBlock: data must be a Buffer or a base64 string');
  }

  return {
    type: EXTRACTABLE_TYPES[media],
    source: { type: 'base64', media_type: media, data: base64 },
  };
}

/**
 * The question asked about the document.
 *
 * Trivial, and exported anyway: every caller building blocks by hand is a
 * caller who can put the text FIRST, which is the one ordering mistake that
 * does not fail loudly (see completionWithContent).
 */
function textBlock(text) {
  return { type: 'text', text: String(text == null ? '' : text) };
}

module.exports = {
  MAX_REQUEST_BYTES,
  MAX_FILE_BYTES,
  EXTRACTABLE_TYPES,
  isSupportedForExtraction,
  validateFileSize,
  validateTotalSize,
  prepareContentBlock,
  textBlock,
  base64Size,
};

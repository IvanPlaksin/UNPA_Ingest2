/**
 * SHA-256 checksum helpers for UGP package integrity.
 *
 * Checksums file format (one line per file): `<hex-sha256>  <archive-relative-path>`
 */
const { createHash } = require('crypto');

/**
 * SHA-256 hex digest of a string or Buffer.
 * @param {string|Buffer} content
 * @returns {string}
 */
function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}

/**
 * Build the checksums.sha256 file body from a { path: hash } map.
 * @param {Object<string,string>} checksums
 * @returns {string}
 */
function formatChecksums(checksums) {
    return Object.entries(checksums)
        .map(([file, hash]) => `${hash}  ${file}`)
        .join('\n');
}

/**
 * Parse a checksums.sha256 file body into a { path: hash } map.
 * @param {string} content
 * @returns {Object<string,string>}
 */
function parseChecksums(content) {
    const map = {};
    for (const line of String(content).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const idx = trimmed.search(/\s+/);
        if (idx === -1) continue;
        const hash = trimmed.slice(0, idx);
        const file = trimmed.slice(idx).trim();
        map[file] = hash;
    }
    return map;
}

/**
 * Verify a set of extracted entries against a checksums map.
 * @param {Object<string,string>} expected  map { path: hash }
 * @param {Object<string,string|Buffer>} entries  map { path: content }
 * @returns {{ valid: boolean, errors: string[] }}
 */
function verifyChecksums(expected, entries) {
    const errors = [];
    for (const [file, hash] of Object.entries(expected)) {
        if (!(file in entries)) {
            errors.push(`File listed in checksums but missing from package: ${file}`);
            continue;
        }
        if (sha256(entries[file]) !== hash) {
            errors.push(`Checksum mismatch: ${file}`);
        }
    }
    return { valid: errors.length === 0, errors };
}

module.exports = { sha256, formatChecksums, parseChecksums, verifyChecksums };

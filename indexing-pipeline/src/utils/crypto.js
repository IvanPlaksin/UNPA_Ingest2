const crypto = require('crypto');

/**
 * Calculates the SHA-256 hash of a file buffer.
 * @param {Buffer} buffer - The file content buffer.
 * @returns {string} - The hex string of the hash.
 */
function calculateFileHash(buffer) {
    const hashSum = crypto.createHash('sha256');
    hashSum.update(buffer);
    return hashSum.digest('hex');
}

module.exports = {
    calculateFileHash
};

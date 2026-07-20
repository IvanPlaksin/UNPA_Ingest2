/**
 * UGPReader — reads a *.ugp.tar.gz package.
 *
 * Extracts all entries once (packages are bounded logical slices, not full DBs),
 * then exposes manifest / nodes / relationships / vectors as async iterables plus
 * a checksum verifier.
 *
 * Usage:
 *   const r = new UGPReader(filePath);
 *   const { manifest, valid, errors } = await r.readManifest();
 *   for await (const node of r.readNodes()) { ... }
 *   for await (const rel of r.readRelationships()) { ... }
 *   for await (const { collection, point } of r.readVectors()) { ... }
 *   const check = await r.verifyChecksums();
 */
const fs = require('fs');
const { createGunzip } = require('zlib');
const tar = require('tar-stream');
const {
    MANIFEST_PATH,
    NODES_PATH,
    RELATIONSHIPS_PATH,
    VECTORS_DIR,
    CHECKSUMS_PATH,
} = require('../constants');
const { parseManifest, validateManifest } = require('../serializers/manifest');
const { parseChecksums, verifyChecksums } = require('./checksum');

class UGPReader {
    constructor(filePath) {
        this.filePath = filePath;
        this._entries = null; // { path: string content }
    }

    async _extractAll() {
        if (this._entries) return this._entries;
        const entries = {};
        const extract = tar.extract();

        await new Promise((resolve, reject) => {
            extract.on('entry', (header, stream, next) => {
                const chunks = [];
                stream.on('data', (c) => chunks.push(c));
                stream.on('end', () => {
                    entries[header.name] = Buffer.concat(chunks).toString('utf8');
                    next();
                });
                stream.on('error', reject);
                stream.resume();
            });
            extract.on('finish', resolve);
            extract.on('error', reject);

            const src = fs.createReadStream(this.filePath);
            src.on('error', reject);
            src.pipe(createGunzip()).on('error', reject).pipe(extract);
        });

        this._entries = entries;
        return entries;
    }

    async readManifest() {
        const entries = await this._extractAll();
        const content = entries[MANIFEST_PATH];
        if (!content) {
            return { manifest: null, valid: false, errors: ['manifest.json not found'] };
        }
        const manifest = parseManifest(content);
        return { manifest, ...validateManifest(manifest) };
    }

    async *_iterLines(path) {
        const entries = await this._extractAll();
        const content = entries[path];
        if (!content) return;
        for (const line of content.split('\n')) {
            if (line.trim()) yield JSON.parse(line);
        }
    }

    async *readNodes() {
        yield* this._iterLines(NODES_PATH);
    }

    async *readRelationships() {
        yield* this._iterLines(RELATIONSHIPS_PATH);
    }

    async *readVectors() {
        const entries = await this._extractAll();
        for (const [path, content] of Object.entries(entries)) {
            if (path.startsWith(VECTORS_DIR) && path.endsWith('.jsonl')) {
                const collection = path.slice(VECTORS_DIR.length, -'.jsonl'.length);
                for (const line of content.split('\n')) {
                    if (line.trim()) yield { collection, point: JSON.parse(line) };
                }
            }
        }
    }

    /** List vector collection names present in the package. */
    async listVectorCollections() {
        const entries = await this._extractAll();
        return Object.keys(entries)
            .filter((p) => p.startsWith(VECTORS_DIR) && p.endsWith('.jsonl'))
            .map((p) => p.slice(VECTORS_DIR.length, -'.jsonl'.length));
    }

    async verifyChecksums() {
        const entries = await this._extractAll();
        const content = entries[CHECKSUMS_PATH];
        if (!content) return { valid: false, errors: ['checksums.sha256 not found'] };
        return verifyChecksums(parseChecksums(content), entries);
    }

    /**
     * Deterministic content fingerprint of the whole package: SHA-256 of the
     * checksums.sha256 file (which itself is a hash of every section). Two
     * packages with identical content produce the same value — used by the
     * importer for idempotency (manifest.contentHash may be null in v1).
     * @returns {Promise<string|null>}
     */
    async getContentHash() {
        const entries = await this._extractAll();
        const content = entries[CHECKSUMS_PATH];
        if (!content) return null;
        return require('crypto').createHash('sha256').update(content).digest('hex');
    }
}

module.exports = { UGPReader };

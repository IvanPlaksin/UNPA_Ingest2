/**
 * UGPWriter — streaming writer for a *.ugp.tar.gz package.
 *
 * Buffers each JSONL section then commits it as one tar entry (JSONL sections are
 * appended incrementally; the tar entry is written on finalizeX()). Every entry's
 * SHA-256 is recorded and flushed to checksums.sha256 on close().
 *
 * Usage:
 *   const w = new UGPWriter(outPath);
 *   await w.open();
 *   await w.writeManifest(manifest);
 *   for (const line of nodeLines) w.writeNode(line);
 *   await w.finalizeNodes();
 *   for (const line of relLines) w.writeRelationship(line);
 *   await w.finalizeRelationships();
 *   w.writeVectorPoint('documents_entities', pointLine);
 *   await w.finalizeVectors();
 *   await w.close();
 */
const fs = require('fs');
const { createGzip } = require('zlib');
const tar = require('tar-stream');
const {
    MANIFEST_PATH,
    NODES_PATH,
    RELATIONSHIPS_PATH,
    VECTORS_DIR,
    CHECKSUMS_PATH,
} = require('../constants');
const { sha256, formatChecksums } = require('./checksum');

class UGPWriter {
    constructor(outputPath) {
        this.outputPath = outputPath;
        this.pack = null;
        this.gzip = null;
        this.output = null;
        this.checksums = {};

        this._nodeBuffer = [];
        this._relBuffer = [];
        this._vectorBuffers = {}; // collection -> string[]
        this._closed = false;
    }

    async open() {
        this.pack = tar.pack();
        this.gzip = createGzip();
        this.output = fs.createWriteStream(this.outputPath);
        // Surface stream errors instead of leaving close() hanging.
        this._streamError = null;
        const onErr = (e) => { this._streamError = e; };
        this.pack.on('error', onErr);
        this.gzip.on('error', onErr);
        this.output.on('error', onErr);
        this.pack.pipe(this.gzip).pipe(this.output);
    }

    async writeManifest(manifest) {
        const content = JSON.stringify(manifest, null, 2);
        await this._addEntry(MANIFEST_PATH, content);
    }

    writeNode(nodeJsonLine) {
        this._nodeBuffer.push(nodeJsonLine);
    }

    async finalizeNodes() {
        await this._addEntry(NODES_PATH, this._nodeBuffer.join('\n'));
        this._nodeBuffer = [];
    }

    writeRelationship(relJsonLine) {
        this._relBuffer.push(relJsonLine);
    }

    async finalizeRelationships() {
        await this._addEntry(RELATIONSHIPS_PATH, this._relBuffer.join('\n'));
        this._relBuffer = [];
    }

    writeVectorPoint(collection, pointJsonLine) {
        if (!this._vectorBuffers[collection]) this._vectorBuffers[collection] = [];
        this._vectorBuffers[collection].push(pointJsonLine);
    }

    async finalizeVectors() {
        for (const [collection, lines] of Object.entries(this._vectorBuffers)) {
            const filePath = `${VECTORS_DIR}${collection}.jsonl`;
            await this._addEntry(filePath, lines.join('\n'));
        }
        this._vectorBuffers = {};
    }

    async close() {
        if (this._closed) return;
        this._closed = true;

        // checksums.sha256 is itself NOT self-referenced.
        await this._addEntry(CHECKSUMS_PATH, formatChecksums(this.checksums), { skipChecksum: true });

        this.pack.finalize();
        await new Promise((resolve, reject) => {
            if (this._streamError) return reject(this._streamError);
            this.output.on('finish', resolve);
            this.output.on('error', reject);
        });
    }

    async _addEntry(name, content, opts = {}) {
        if (this._streamError) throw this._streamError;
        const buf = Buffer.from(content, 'utf8');
        if (!opts.skipChecksum) this.checksums[name] = sha256(buf);
        await new Promise((resolve, reject) => {
            this.pack.entry({ name, size: buf.length }, buf, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}

module.exports = { UGPWriter };

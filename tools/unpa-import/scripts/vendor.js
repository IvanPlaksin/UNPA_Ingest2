#!/usr/bin/env node
'use strict';

/**
 * Vendor the shared UGP library into this package for standalone deployment.
 * Copies api/src/lib/ugp → src/vendor/ugp (tests excluded). Run: npm run vendor
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../../../api/src/lib/ugp');
const DEST = path.resolve(__dirname, '../src/vendor/ugp');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.isDirectory() && (entry.name === '__tests__' || entry.name === 'node_modules')) continue;
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else if (entry.isFile()) fs.copyFileSync(s, d);
    }
}

if (!fs.existsSync(SRC)) {
    console.error(`✗ Source UGP library not found: ${SRC}`);
    console.error('  This script must run inside the monorepo (api/src/lib/ugp must exist).');
    process.exit(1);
}

if (fs.existsSync(DEST)) fs.rmSync(DEST, { recursive: true, force: true });

console.log(`Copying ${SRC}`);
console.log(`     → ${DEST}`);
copyDir(SRC, DEST);

const required = ['index.js', 'constants.js', 'identity-map.js', 'collection-linkage.js', 'package/reader.js', 'package/writer.js', 'serializers/temporal.js'];
const missing = required.filter((f) => !fs.existsSync(path.join(DEST, f)));
if (missing.length) {
    console.error(`✗ Vendored copy is missing: ${missing.join(', ')}`);
    process.exit(1);
}

console.log('✓ Vendor complete — all required files present');

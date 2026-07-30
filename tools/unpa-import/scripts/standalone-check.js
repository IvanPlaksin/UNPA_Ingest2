#!/usr/bin/env node
'use strict';

/**
 * Prove the CLI is deployment-ready: force STANDALONE mode (no monorepo repo
 * fallback) and confirm the vendored UGP library + all its runtime deps resolve
 * from this package alone. Run: npm run standalone-check
 */

process.env.STANDALONE = '1';

try {
    const ugp = require('../src/lib/ugp-adapter');
    // Touch the pieces that pull the heavy runtime deps (neo4j-driver, tar-stream).
    if (typeof ugp.UGPReader !== 'function') throw new Error('UGPReader missing from vendored lib');
    if (typeof ugp.wrapTemporal !== 'function') throw new Error('temporal serializer missing (neo4j-driver dep?)');
    require('../src/lib/targets'); // exercises neo4j-driver + @qdrant/js-client-rest resolution

    console.log('✓ standalone-check passed');
    console.log('  UGP resolved from:', ugp._resolvedFrom);
    process.exit(0);
} catch (e) {
    console.error('✗ standalone-check FAILED:', e.message);
    console.error('  Run `npm run vendor` and `npm ci` so the vendored library + deps are present.');
    process.exit(1);
}

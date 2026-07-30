'use strict';

/**
 * Resolve the shared UGP library.
 *
 * The exporter (api/) and this importer must (de)serialize UGP packages with
 * byte-identical logic, so they share ONE library.
 *
 * Resolution order:
 *   1. Vendored copy at ../vendor/ugp — created by `npm run vendor`; makes the
 *      CLI self-contained on a bare target server (its own node_modules carries
 *      the UGP runtime deps: neo4j-driver, tar-stream, @qdrant/js-client-rest).
 *   2. In-repo library at <repoRoot>/api/src/lib/ugp — monorepo development.
 *
 * Set STANDALONE=1 to require the vendored copy (disables the repo fallback) —
 * used by `npm run standalone-check` to prove deployment readiness.
 */

const fs = require('fs');
const path = require('path');

const VENDOR_PATH = path.resolve(__dirname, '../vendor/ugp');
const REPO_LIB_PATH = path.resolve(__dirname, '../../../../api/src/lib/ugp');
const STANDALONE = process.env.STANDALONE === '1';

function resolvePath() {
    if (fs.existsSync(VENDOR_PATH)) return VENDOR_PATH;
    if (!STANDALONE && fs.existsSync(REPO_LIB_PATH)) return REPO_LIB_PATH;
    throw new Error(
        STANDALONE
            ? 'STANDALONE=1 but no vendored UGP library at src/vendor/ugp. Run `npm run vendor` first.'
            : 'UGP library not found. Run `npm run vendor`, or ensure api/src/lib/ugp exists in the monorepo.'
    );
}

const resolved = resolvePath();
module.exports = require(resolved);
module.exports._resolvedFrom = resolved;
module.exports._paths = { VENDOR_PATH, REPO_LIB_PATH, standalone: STANDALONE };

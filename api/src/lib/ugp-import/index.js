'use strict';

/**
 * Server-side UGP import engine (Phase 0). Same behaviour as the CLI importer
 * (tools/unpa-import) but callable in-process by the api — the foundation for
 * API-API selective sync. Pure engine: no HTTP, no queue.
 */
module.exports = {
    ...require('./targets'),
    ...require('./planner'),
    ...require('./import-engine'),
    ...require('./import-record'),
};

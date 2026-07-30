'use strict';

const logger = require('../utils/logger');

/** `report <importId>` — show a prior import's report. Implemented in TASK-EXP-010. */
module.exports = async function report(/* importId, options */) {
    logger.warn('`report` is not yet implemented (TASK-EXP-010).');
    process.exit(1);
};

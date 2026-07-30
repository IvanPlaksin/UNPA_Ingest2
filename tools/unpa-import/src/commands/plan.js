'use strict';

const fs = require('fs');
const logger = require('../utils/logger');
const { loadConfig } = require('../config');
const { computePlan, idStr } = require('../lib/planner');

/**
 * `plan <file>` — dry-run diff against the target Memgraph + Qdrant. No writes.
 * Exit 0 = clean plan; exit 1 = hard conflicts.
 */
module.exports = async function plan(file, options = {}) {
    logger.setVerbose(options.verbose);
    if (!fs.existsSync(file)) { logger.error(`File not found: ${file}`); process.exit(1); }

    const config = loadConfig(options);
    logger.info(`Loading package: ${file}`);
    logger.info(`Target Memgraph: ${config.memgraph.uri}`);

    let result;
    try {
        result = await computePlan(file, config, { includeVectors: true, batchSize: options.batchSize });
    } catch (e) {
        logger.error(e.message);
        process.exit(1);
    }

    const { plan, summary, manifest } = result;
    printReport(plan, summary, config);

    if (options.output) {
        const report = { packageFile: file, targetMemgraph: config.memgraph.uri, conflictPolicy: config.conflict, timestamp: new Date().toISOString(), manifest, plan, summary };
        fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
        logger.info(`Plan report written to ${options.output}`);
    }

    process.exit(summary.hasHardConflicts ? 1 : 0);
};

function vectorDetail(plan) {
    const byCol = {};
    for (const v of plan.vectors.upsert) byCol[v.collection] = (byCol[v.collection] || 0) + 1;
    return Object.entries(byCol).map(([c, n]) => `${c} (${n})`).join(', ');
}

function printReport(plan, summary, config) {
    logger.raw('');
    logger.raw('─'.repeat(58));
    logger.raw('                      IMPORT PLAN');
    logger.raw('─'.repeat(58));

    logger.raw('\nNODES');
    logger.table([
        { Action: 'CREATE', Count: summary.nodes.create, Details: `stubs: ${plan.nodes.create.filter((n) => n.stub).length}` },
        { Action: 'UPDATE', Count: summary.nodes.update, Details: `(conflict=${config.conflict})` },
        { Action: 'SKIP', Count: summary.nodes.skip, Details: 'Target exists' },
        { Action: 'CONFLICT', Count: summary.nodes.conflict, Details: summary.nodes.conflict ? '⚠ see below' : '' },
    ]);

    logger.raw('\nRELATIONSHIPS');
    logger.table([
        { Action: 'CREATE', Count: summary.relationships.create, Details: '' },
        { Action: 'SKIP', Count: summary.relationships.skip, Details: 'Already exists' },
        { Action: 'ORPHAN', Count: summary.relationships.orphan, Details: summary.relationships.orphan ? '⚠ endpoint missing' : '' },
    ]);

    logger.raw('\nVECTORS');
    logger.table([
        { Action: 'UPSERT', Count: summary.vectors.upsert, Details: vectorDetail(plan) },
        { Action: 'SKIP', Count: summary.vectors.skip, Details: summary.vectors.skip ? 'missing collection / dim mismatch' : '' },
    ]);

    if (plan.nodes.conflict.length) {
        logger.raw('');
        logger.warn(`HARD CONFLICTS (${plan.nodes.conflict.length}):`);
        plan.nodes.conflict.slice(0, 20).forEach((c, i) => {
            logger.raw(`  ${i + 1}. ${idStr(c.identity)}  [${c.reason}]`);
            logger.raw(`     incoming: [${(c.incomingLabels || []).join(', ')}]  target: [${(c.targetLabels || []).join(', ')}]`);
        });
    }
    if (plan.relationships.orphan.length) {
        logger.raw('');
        logger.warn(`ORPHAN relationships (${plan.relationships.orphan.length}): endpoints absent on target & not in create plan (won't be created).`);
        plan.relationships.orphan.slice(0, 10).forEach((o) => logger.verbose(`${o.type} ${idStr(o.from)} → ${idStr(o.to)} [${o.reason}]`));
    }

    logger.raw('');
    logger.raw('─'.repeat(58));
    if (summary.hasHardConflicts) logger.error(`Plan has ${plan.nodes.conflict.length} hard conflict(s). Use --conflict=overwrite to force, or resolve manually.`);
    else logger.success('Plan is clean — ready to apply.');
}

'use strict';

const chalk = require('chalk');
const Table = require('cli-table3');

let _verbose = false;
function setVerbose(v) { _verbose = !!v; }

const logger = {
    setVerbose,
    raw: (msg = '') => console.log(msg),
    info: (msg) => console.log(chalk.blue('ℹ'), msg),
    success: (msg) => console.log(chalk.green('✓'), msg),
    warn: (msg) => console.log(chalk.yellow('⚠'), msg),
    error: (msg) => console.log(chalk.red('✗'), msg),
    step: (n, total, msg) => console.log(chalk.cyan(`[${n}/${total}]`), msg),
    verbose: (msg) => { if (_verbose || process.env.VERBOSE) console.log(chalk.gray('  ' + msg)); },
    bullet: (msg, color = 'red') => console.log(`  ${chalk[color]('•')} ${msg}`),
    table: (rows) => {
        if (!rows || rows.length === 0) return;
        const t = new Table({ head: Object.keys(rows[0]), style: { head: ['cyan'] } });
        rows.forEach((r) => t.push(Object.values(r)));
        console.log(t.toString());
    },
    chalk,
};

module.exports = logger;

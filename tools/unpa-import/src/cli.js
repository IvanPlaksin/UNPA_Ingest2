'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

program
    .name('unpa-import')
    .description('Import UNPA Graph Packages (.ugp.tar.gz) into Memgraph + Qdrant')
    .version(pkg.version);

program
    .command('validate <file>')
    .description('Validate package integrity (checksums, manifest, nodes, relationships, vectors) — no DB connection')
    .option('--verbose', 'Show detailed validation steps')
    .action(require('./commands/validate'));

program
    .command('plan <file>')
    .description('Dry-run: compute a diff against the target Memgraph + Qdrant, no writes')
    .option('--conflict <policy>', 'Conflict policy: skip|overwrite|newer-wins', 'skip')
    .option('--output <file>', 'Write the full JSON plan report to a file')
    .option('--batch-size <n>', 'Batch size for target lookups', '100')
    .option('--config <path>', 'Path to a JSON config file')
    .option('--verbose', 'Show per-item details')
    .action(require('./commands/plan'));

program
    .command('apply <file>')
    .description('Execute import into the target Memgraph + Qdrant (not yet implemented)')
    .option('--conflict <policy>', 'Conflict policy: skip|overwrite|newer-wins', 'skip')
    .option('--skip-vectors', 'Skip vector import')
    .option('--batch-size <n>', 'Batch size for graph writes', '1000')
    .option('--catalog-channel <mode>', 'Executable graphs channel: api|refuse', 'refuse')
    .option('--output <file>', 'Write the import report to a file')
    .option('--config <path>', 'Path to a JSON config file')
    .option('--dry-run', 'Run `plan` instead of writing (alias)')
    .option('--yes', 'Non-interactive mode (bypass conflict/idempotency prompts)')
    .action(require('./commands/apply'));

program
    .command('report <importId>')
    .description('Show the report for a previous import (not yet implemented)')
    .option('--config <path>', 'Path to a JSON config file')
    .action(require('./commands/report'));

program.parse();

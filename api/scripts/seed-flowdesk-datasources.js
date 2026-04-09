#!/usr/bin/env node
/**
 * Seed FlowDesk DataSources into Memgraph
 *
 * Usage:
 *   node scripts/seed-flowdesk-datasources.js [--dry-run] [--verify]
 */

const { seedFlowDeskDataSources, dutyStationsDS, staffDirectoryDS, equipmentTypesDS } =
  require('../src/db/seeds/flowdesk-datasources.seed');
const { DataSourceService } = require('../src/services/datasource.service');
const { getMemgraphService } = require('../src/services/memgraph.service');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verify = args.includes('--verify');

  console.log('=== FlowDesk DataSources Seed ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);

  if (dryRun) {
    console.log('\nDataSources to be seeded:');
    [dutyStationsDS, staffDirectoryDS, equipmentTypesDS].forEach(ds => {
      console.log(`  - ${ds.graphId} (${ds.sourceType})`);
      console.log(`    ${ds.config.description}`);
      console.log(`    Cache: ${ds.config.cacheStrategy} (TTL: ${ds.config.cacheTTL}s)`);
      console.log(`    Output: ${ds.config.valueField} -> ${ds.config.labelField}`);
    });
    console.log('\nDry run complete. No changes made.');
    return;
  }

  try {
    const memgraph = getMemgraphService();
    const dataSourceService = new DataSourceService(memgraph);

    const results = await seedFlowDeskDataSources(dataSourceService);

    console.log('\nResults:');
    results.forEach(r => {
      const icon = r.action === 'error' ? 'X' : '+';
      console.log(`  ${icon} ${r.graphId}: ${r.action}${r.error ? ` - ${r.error}` : ''}`);
    });

    if (verify) {
      console.log('\nVerification:');
      const all = await dataSourceService.list('FLOWDESK');
      console.log(`  Total FLOWDESK DataSources: ${all.length}`);
      all.forEach(ds => {
        console.log(`    - ${ds.graphId} (${ds.sourceType})`);
      });
    }

    console.log('\nDone.');
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
}

main();

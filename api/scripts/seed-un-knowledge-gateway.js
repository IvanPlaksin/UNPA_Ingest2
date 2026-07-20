'use strict';
/**
 * seed-un-knowledge-gateway.js
 *
 * Adds the UN Knowledge Gateway to the Source Catalog.
 *
 * Usage:
 *   node api/scripts/seed-un-knowledge-gateway.js
 *   node api/scripts/seed-un-knowledge-gateway.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const { resolveAdapter }       = require('../src/services/knowledge/source-adapters/registry');

  console.log('\n  UN Knowledge Gateway Seed');
  console.log(`   Dry run: ${DRY_RUN}\n`);

  const SOURCE_NAME  = 'UN Knowledge Gateway';
  const existing     = await sourceCatalogService.list({});
  const alreadyExists = existing.find(s => s.name === SOURCE_NAME);

  if (alreadyExists) {
    console.log(`  INFO: "${SOURCE_NAME}" already exists (id=${alreadyExists.id}).`);
    console.log('     Re-applying adapter config and capabilities...\n');
  }

  const sourceDefinition = {
    name: SOURCE_NAME,
    description: 'UN Knowledge Gateway — central SharePoint repository for UN system knowledge products, institutional guidelines, best practices, and policy documents. Access via local JSON cache (browser console export). Site: unitednations.sharepoint.com/sites/APP-Gateway.',
    type:      'REST_API',
    namespace: 'UN_SYSTEM',
    tags:      ['sharepoint', 'knowledge-gateway', 'guidelines', 'best-practices', 'institutional', 'cache-file'],
    config: {
      adapterKey:     'un-knowledge-gateway',
      cacheFile:      null,
      maxFileAgeDays: 7,
    },
    methodology: 'M2C',
    enabled:     true,
  };

  if (DRY_RUN) {
    console.log('  ~ (dry) Would create/update:', JSON.stringify(sourceDefinition, null, 2));
    console.log('\n  Dry run complete.\n');
    process.exit(0);
  }

  let sourceId;
  if (alreadyExists) {
    await sourceCatalogService.update(alreadyExists.id, {
      description: sourceDefinition.description,
      tags:        sourceDefinition.tags,
      namespace:   sourceDefinition.namespace,
      config:      { ...(alreadyExists.config || {}), ...sourceDefinition.config },
      methodology: sourceDefinition.methodology,
    });
    sourceId = alreadyExists.id;
    console.log(`  Updated existing entry (id=${sourceId})`);
  } else {
    const created = await sourceCatalogService.create(sourceDefinition);
    sourceId = created.id;
    console.log(`  Created new entry (id=${sourceId})`);
  }

  // Apply adapter capabilities
  const sourceRecord = await sourceCatalogService.get(sourceId);
  const adapter      = resolveAdapter(sourceRecord);
  const caps         = adapter.getCapabilities();

  const path = require('path');
  const fs   = require('fs');
  const researchPath = path.resolve(__dirname, '../src/services/knowledge/source-adapters/research/un-knowledge-gateway.json');
  const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));

  await sourceCatalogService.update(sourceId, {
    config:       { ...(sourceRecord.config || {}), ...research.config, adapterKey: 'un-knowledge-gateway' },
    methodology:  research.methodologyMarkdown || '',
    capabilities: caps,
  });

  const finalRecord = await sourceCatalogService.get(sourceId);
  console.log(`  Adapter config applied: adapterKey=${finalRecord.config?.adapterKey}`);
  console.log(`  Capabilities: [${caps.capabilities.join(', ')}]`);
  console.log(`  Download mode: ${caps.downloadMode}`);
  console.log(`  Namespace: ${finalRecord.namespace}`);
  console.log(`  Tags: ${finalRecord.tags?.join(', ')}`);
  console.log('\n  ─────────────────────────────────────');
  console.log('  UN Knowledge Gateway source seeded successfully.');
  console.log(`  Source ID: ${sourceId}`);
  console.log('');
  console.log('  Next step: populate cache file');
  console.log('  1. Open Chrome → unitednations.sharepoint.com/sites/APP-Gateway (ensure logged in)');
  console.log('  2. DevTools → Console → paste api/scripts/export-kg-docs.js');
  console.log('  3. Wait for "Done!" → save clipboard output to api/data/kg-cache.json');
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});

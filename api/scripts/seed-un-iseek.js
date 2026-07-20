'use strict';
/**
 * seed-un-iseek.js
 *
 * Adds the UN iSeek Intranet to the Source Catalog and wires up
 * the UnIseekAdapter (config, capabilities, methodology).
 *
 * Usage:
 *   node api/scripts/seed-un-iseek.js
 *   node api/scripts/seed-un-iseek.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const { resolveAdapter }       = require('../src/services/knowledge/source-adapters/registry');

  console.log('\n🌱  UN iSeek Intranet Seed');
  console.log(`   Dry run: ${DRY_RUN}\n`);

  const SOURCE_NAME = 'UN iSeek Intranet';
  const existing    = await sourceCatalogService.list({});
  const alreadyExists = existing.find(s => s.name === SOURCE_NAME);

  if (alreadyExists) {
    console.log(`  ℹ  "${SOURCE_NAME}" already exists (id=${alreadyExists.id}).`);
    console.log('     Re-applying adapter config and capabilities...\n');
  }

  const sourceDefinition = {
    name: SOURCE_NAME,
    description: 'UN Headquarters Intranet portal for New York staff. Public layer: 139+ UN Secretariat department pages and all PDF documents at /sites/default/files/. Contains internal memoranda, guidance notes, procedures, and delegation instruments. Auth: OpenID Connect (Azure AD) for protected content.',
    type: 'URL_CATALOG',
    namespace: 'UN_SECRETARIAT',
    tags: ['secretariat', 'intranet', 'iseek', 'UNHQ', 'memoranda', 'guidance', 'procedures', 'iSeek-public'],
    config: {
      adapterKey:  'un-iseek',
      politeDelay: 800,
      maxDepth:    1,
    },
    methodology: 'M2C',
    enabled: true,
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
    console.log(`  ✓ Updated existing entry (id=${sourceId})`);
  } else {
    const created = await sourceCatalogService.create(sourceDefinition);
    sourceId = created.id;
    console.log(`  ✓ Created new entry (id=${sourceId})`);
  }

  // Apply adapter capabilities + research config
  const sourceRecord = await sourceCatalogService.get(sourceId);
  const adapter = resolveAdapter(sourceRecord);
  const caps = adapter.getCapabilities();

  const path = require('path');
  const fs   = require('fs');
  const researchPath = path.resolve(__dirname, '../src/services/knowledge/source-adapters/research/un-iseek.json');
  const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));

  await sourceCatalogService.update(sourceId, {
    config:       { ...(sourceRecord.config || {}), ...research.config, adapterKey: 'un-iseek' },
    methodology:  research.methodologyMarkdown || '',
    capabilities: caps,
  });

  const finalRecord = await sourceCatalogService.get(sourceId);
  console.log(`  ✓ Adapter config applied: adapterKey=${finalRecord.config?.adapterKey}`);
  console.log(`  ✓ Capabilities: [${caps.capabilities.join(', ')}]`);
  console.log(`  ✓ Download mode: ${caps.downloadMode}`);
  console.log(`  ✓ Namespace: ${finalRecord.namespace}`);
  console.log(`  ✓ Tags: ${finalRecord.tags?.join(', ')}`);
  console.log('\n  ─────────────────────────────────────');
  console.log('  UN iSeek Intranet source seeded successfully.');
  console.log(`  Source ID: ${sourceId}`);
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});

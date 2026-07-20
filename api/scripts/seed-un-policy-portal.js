'use strict';
/**
 * seed-un-policy-portal.js
 *
 * Adds the UN Secretariat Policy Portal to the Source Catalog and wires up
 * the UnPolicyPortalAdapter (config, capabilities, methodology).
 *
 * Usage:
 *   node api/scripts/seed-un-policy-portal.js
 *   node api/scripts/seed-un-policy-portal.js --dry-run
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const args   = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const { resolveAdapter }       = require('../src/services/knowledge/source-adapters/registry');

  console.log('\n🌱  UN Policy Portal Seed');
  console.log(`   Dry run: ${DRY_RUN}\n`);

  // ── Check for existing entry ────────────────────────────────
  const existing = await sourceCatalogService.list({});
  const SOURCE_NAME = 'UN Secretariat Policy Portal';
  const alreadyExists = existing.find(s => s.name === SOURCE_NAME);

  if (alreadyExists) {
    console.log(`  ℹ  "${SOURCE_NAME}" already exists (id=${alreadyExists.id}).`);
    console.log('     Re-applying adapter config and capabilities...\n');
  }

  const sourceDefinition = {
    name: SOURCE_NAME,
    description: 'Official policy issuances of the UN Secretariat: Secretary-General\'s Bulletins (ST/SGB), Administrative Instructions (ST/AI), Information Circulars (ST/IC), and Policy Guidelines. Full public access; PDF download via ODS symbol API.',
    type: 'URL_CATALOG',
    namespace: 'UN_SOP',
    tags: ['secretariat', 'SGB', 'AI', 'IC', 'policy-guidelines', 'regulatory', 'IT-governance', 'UN-SOP'],
    config: {
      adapterKey:  'un-policy-portal',
      politeDelay: 1000,
      language:    'en',
    },
    methodology: 'M2C',
    enabled: true,
  };

  let sourceId;

  if (DRY_RUN) {
    console.log('  ~ (dry) Would create/update:', JSON.stringify(sourceDefinition, null, 2));
    console.log('\n  Dry run complete.\n');
    process.exit(0);
  }

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

  // ── Apply adapter capabilities + methodology ────────────────
  const sourceRecord = await sourceCatalogService.get(sourceId);
  const adapter = resolveAdapter(sourceRecord);
  const caps = adapter.getCapabilities();

  // Load methodology from research descriptor
  const path = require('path');
  const fs   = require('fs');
  const researchPath = path.resolve(__dirname, '../src/services/knowledge/source-adapters/research/un-policy-portal.json');
  const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));

  await sourceCatalogService.update(sourceId, {
    config:       { ...(sourceRecord.config || {}), ...research.config, adapterKey: 'un-policy-portal' },
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
  console.log('  UN Secretariat Policy Portal source seeded successfully.');
  console.log(`  Source ID: ${sourceId}`);
  console.log('');

  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});

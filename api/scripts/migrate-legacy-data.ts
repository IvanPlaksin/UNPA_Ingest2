#!/usr/bin/env ts-node

/**
 * Legacy Data Migration Script
 * UN ProjectAdvisor - Migrate existing data to Immutable Graph
 *
 * Usage:
 *   npx ts-node scripts/migrate-legacy-data.ts [options]
 *
 * Options:
 *   --dry-run         Run without making changes
 *   --project=ID      Project ID to migrate to (default: 'default')
 *   --batch=N         Batch size for processing (default: 100)
 */

import { MemgraphClient } from '../src/db/memgraph.client';
import { ImmutableGraphService } from '../src/services/immutable-graph/immutable-graph.service';
import { NamespaceService } from '../src/services/immutable-graph/namespace.service';
import { GodModeService } from '../src/services/immutable-graph/god-mode.service';
import { DataMigrator } from '../src/services/immutable-graph/migration/data-migrator';
import { NodeVersionRepository } from '../src/repositories/node-version.repository';
import { EdgeVersionRepository } from '../src/repositories/edge-version.repository';
import { MergeRecordRepository } from '../src/repositories/merge-record.repository';
import { NamespaceConfigRepository } from '../src/repositories/namespace-config.repository';
import {
  GodModeSessionRepository,
  GodModeAuditRepository,
  TombstoneRepository,
  PendingDeletionRepository
} from '../src/repositories/god-mode.repository';
import { loadConfig, validateConfig } from '../src/config/immutable-graph.config';
import * as fs from 'fs';

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('UN ProjectAdvisor - Legacy Data Migration');
  console.log('═══════════════════════════════════════════════════════════════');

  const config = loadConfig();
  const errors = validateConfig(config);

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const projectId = args.find(a => a.startsWith('--project='))?.split('=')[1] || 'default';
  const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '100');

  console.log(`\nConfiguration:`);
  console.log(`  - Project ID: ${projectId}`);
  console.log(`  - Batch Size: ${batchSize}`);
  console.log(`  - Dry Run: ${dryRun}`);
  console.log(`  - Memgraph URI: ${config.memgraph.uri}`);

  const client = new MemgraphClient({
    uri: config.memgraph.uri,
    username: config.memgraph.username,
    password: config.memgraph.password
  });

  try {
    console.log('\nConnecting to Memgraph...');
    const connected = await client.verifyConnectivity();
    if (!connected) {
      throw new Error('Failed to connect to Memgraph');
    }
    console.log('✓ Connected to Memgraph');

    const nodeRepo = new NodeVersionRepository(client);
    const edgeRepo = new EdgeVersionRepository(client);
    const mergeRecordRepo = new MergeRecordRepository(client);
    const namespaceConfigRepo = new NamespaceConfigRepository(client);
    const sessionRepo = new GodModeSessionRepository(client);
    const auditRepo = new GodModeAuditRepository(client);
    const tombstoneRepo = new TombstoneRepository(client);
    const pendingDeletionRepo = new PendingDeletionRepository(client);

    const namespaceService = new NamespaceService(namespaceConfigRepo);
    const godModeService = new GodModeService(
      sessionRepo,
      auditRepo,
      tombstoneRepo,
      pendingDeletionRepo,
      namespaceService
    );

    const graphService = new ImmutableGraphService(
      nodeRepo,
      edgeRepo,
      mergeRecordRepo,
      namespaceService,
      godModeService
    );

    const migrator = new DataMigrator(graphService, namespaceService, client);

    console.log('\nStarting migration...\n');

    const result = await migrator.migrateFromLegacyGraph(
      { type: 'legacy_graph' },
      {
        projectId,
        batchSize,
        dryRun,
        preserveIds: false,
        includeVectors: false
      }
    );

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Migration Complete');
    console.log('═══════════════════════════════════════════════════════════════');

    const report = await migrator.generateMigrationReport(result);
    console.log(report);

    const reportPath = `./migration-report-${new Date().toISOString().split('T')[0]}.md`;
    fs.writeFileSync(reportPath, report);
    console.log(`\nReport saved to: ${reportPath}`);

    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('\nMigration failed:', (error as Error).message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

main();

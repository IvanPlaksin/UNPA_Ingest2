#!/usr/bin/env node
/**
 * AOPEG-SEED-001: Seed AOPEG Executors as Tool nodes in Memgraph
 *
 * Discovers all AOPEG plugin executors and creates Tool nodes
 * with proper toolNamespace classification.
 *
 * Usage:
 *   node api/scripts/seed-aopeg-executors.js              # Seed to Memgraph
 *   node api/scripts/seed-aopeg-executors.js --dry-run     # Preview only
 *   node api/scripts/seed-aopeg-executors.js --export-json # Export JSON
 */

const path = require('path');
const fs = require('fs');
process.chdir(path.join(__dirname, '..'));

// ─── Plugin → Namespace mapping ─────────────────────────────────────────────
const PLUGIN_NAMESPACE = {
  'common':         'CORE',
  'workflow':        'CORE',
  'notification':    'CORE',
  'subgraph':        'CORE',
  'rag':             'CORE',
  'ingestion':       'CORE',
  'flowdesk':        'PROJECT',
  'sql-extraction':  'PROJECT',
};

// ─── Plugin → Category mapping ──────────────────────────────────────────────
const PLUGIN_CATEGORY = {
  'common':         'aopeg-common',
  'workflow':        'aopeg-workflow',
  'notification':    'aopeg-notification',
  'subgraph':        'aopeg-subgraph',
  'rag':             'aopeg-rag',
  'ingestion':       'aopeg-ingestion',
  'flowdesk':        'aopeg-flowdesk',
  'sql-extraction':  'aopeg-sql',
};

// ─── Category display names ─────────────────────────────────────────────────
const CATEGORY_META = {
  'aopeg-common':       { name: 'AOPEG Common',        emoji: '🔧', color: '#94a3b8' },
  'aopeg-workflow':     { name: 'AOPEG Workflow',       emoji: '⚡', color: '#22d3ee' },
  'aopeg-notification': { name: 'AOPEG Notification',   emoji: '🔔', color: '#fb7185' },
  'aopeg-subgraph':     { name: 'AOPEG Subgraph',       emoji: '🧩', color: '#a78bfa' },
  'aopeg-rag':          { name: 'AOPEG RAG',             emoji: '📖', color: '#34d399' },
  'aopeg-ingestion':    { name: 'AOPEG Ingestion',       emoji: '📥', color: '#fbbf24' },
  'aopeg-flowdesk':     { name: 'AOPEG FlowDesk',       emoji: '🏢', color: '#f472b6' },
  'aopeg-sql':          { name: 'AOPEG SQL Extraction',  emoji: '🗄️', color: '#60a5fa' },
};

// ─── Discover executors from plugin directories ─────────────────────────────

function discoverExecutors() {
  const pluginsDir = path.join(__dirname, '..', 'src', 'core', 'aopeg', 'plugins');
  const executors = [];

  const plugins = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && PLUGIN_NAMESPACE[d.name] !== undefined)
    .map(d => d.name);

  for (const plugin of plugins) {
    const executorsDir = path.join(pluginsDir, plugin, 'executors');
    if (!fs.existsSync(executorsDir)) continue;

    const allFiles = fs.readdirSync(executorsDir)
      .filter(f => f.endsWith('.executor.js') || f.endsWith('.executor.ts'));
    // Prefer .js over .ts to avoid duplicates
    const jsFiles = new Set(allFiles.filter(f => f.endsWith('.js')).map(f => f.replace('.js', '')));
    const files = allFiles.filter(f => {
      if (f.endsWith('.ts')) {
        const base = f.replace('.ts', '');
        return !jsFiles.has(base); // skip .ts if .js exists
      }
      return true;
    });

    for (const file of files) {
      try {
        const fullPath = path.join(executorsDir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');

        // Extract executor metadata from source code
        const typeMatch = content.match(/type\s*[:=]\s*['"]([\w.]+)['"]/);
        const displayMatch = content.match(/displayName\s*[:=]\s*['"]([^'"]+)['"]/);
        const descMatch = content.match(/description\s*[:=]\s*['"]([^'"]+)['"]/);
        const classMatch = content.match(/class\s+(\w+)\s+extends/);

        if (typeMatch || classMatch) {
          const className = classMatch ? classMatch[1] : file.replace(/\.executor\.[jt]s$/, '');
          const executorType = typeMatch ? typeMatch[1] : `${plugin}.${className.toLowerCase()}`;
          // Skip invalid types (e.g., 'string' from parameterSchema parsing)
          if (!executorType.includes('.') || executorType === 'string') continue;
          const displayName = displayMatch ? displayMatch[1] : className.replace(/Executor$/, '').replace(/([A-Z])/g, ' $1').trim();
          const description = descMatch ? descMatch[1] : `AOPEG executor: ${displayName}`;

          executors.push({
            plugin,
            file,
            className,
            executorType,
            displayName,
            description,
            toolNamespace: PLUGIN_NAMESPACE[plugin],
            category: PLUGIN_CATEGORY[plugin],
          });
        }
      } catch (err) {
        console.warn(`  Could not parse ${plugin}/executors/${file}: ${err.message}`);
      }
    }
  }

  // Deduplicate by executorType (keep first occurrence)
  const seen = new Set();
  const unique = [];
  for (const e of executors) {
    if (!seen.has(e.executorType)) {
      seen.add(e.executorType);
      unique.push(e);
    }
  }
  return unique;
}

// ─── Cypher generation ──────────────────────────────────────────────────────

function generateCypher(executors) {
  const statements = [];
  const now = new Date().toISOString();

  // 1. Create AOPEG category nodes
  const categories = [...new Set(executors.map(e => e.category))];

  for (const catId of categories) {
    const meta = CATEGORY_META[catId] || { name: catId, emoji: '🔧', color: '#94a3b8' };
    statements.push(
      `MERGE (cat:ToolCategory:CORE {id: '${catId}'})
       SET cat.name = '${meta.name}',
           cat.categoryKey = '${catId}',
           cat.namespace = 'CORE',
           cat.emoji = '${meta.emoji}',
           cat.color = '${meta.color}',
           cat.description = 'AOPEG plugin executors — ${catId}',
           cat.updatedAt = '${now}'`
    );
    statements.push(
      `MATCH (root:ToolCatalog:CORE {id: 'tool-catalog-root'})
       MATCH (cat:ToolCategory:CORE {id: '${catId}'})
       MERGE (root)-[:HAS_CATEGORY]->(cat)`
    );
  }

  // 2. Create Tool nodes for each executor
  for (const exec of executors) {
    const toolId = `aopeg.${exec.executorType.replace(/\./g, '_')}`;
    const safeName = exec.displayName.replace(/'/g, "\\'");
    const safeDesc = exec.description.replace(/'/g, "\\'");

    statements.push(
      `MERGE (t:Tool:CORE {id: '${toolId}'})
       SET t.name = '${safeName}',
           t.namespace = 'CORE',
           t.toolNamespace = '${exec.toolNamespace}',
           t.category = '${exec.category}',
           t.executorId = '${exec.executorType}',
           t.description = '${safeDesc}',
           t.source = 'aopeg',
           t.plugin = '${exec.plugin}',
           t.className = '${exec.className}',
           t.status = 'active',
           t.version = '1.0.0',
           t.updatedAt = '${now}'`
    );
    statements.push(
      `MATCH (cat:ToolCategory:CORE {id: '${exec.category}'})
       MATCH (t:Tool:CORE {id: '${toolId}'})
       MERGE (t)-[:PART_OF]->(cat)
       MERGE (cat)-[:HAS_TOOL]->(t)`
    );
  }

  return statements;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const exportJson = args.includes('--export-json');

  console.log('=== AOPEG-SEED-001: Seed AOPEG Executors ===\n');

  // Discover
  const executors = discoverExecutors();
  console.log(`Discovered ${executors.length} executors:\n`);

  // Distribution
  const byNamespace = {};
  const byPlugin = {};
  for (const e of executors) {
    byNamespace[e.toolNamespace] = (byNamespace[e.toolNamespace] || 0) + 1;
    byPlugin[e.plugin] = (byPlugin[e.plugin] || 0) + 1;
  }

  console.log('By namespace:');
  for (const [ns, count] of Object.entries(byNamespace)) {
    console.log(`  ${ns}: ${count}`);
  }
  console.log('\nBy plugin:');
  for (const [plugin, count] of Object.entries(byPlugin)) {
    const ns = PLUGIN_NAMESPACE[plugin];
    console.log(`  ${plugin}: ${count} [${ns}]`);
  }

  // List all executors
  console.log('\nExecutors:');
  for (const e of executors) {
    console.log(`  ${e.executorType} — ${e.displayName} [${e.toolNamespace}]`);
  }

  // Generate Cypher
  const statements = generateCypher(executors);
  console.log(`\nGenerated ${statements.length} Cypher statements`);

  if (dryRun) {
    console.log('\n--- DRY RUN (first 5 statements) ---');
    statements.slice(0, 5).forEach((s, i) => console.log(`\n[${i + 1}] ${s}`));
    console.log('\n--- DRY RUN complete ---');
    process.exit(0);
  }

  if (exportJson) {
    const output = JSON.stringify({ executors, categories: Object.keys(CATEGORY_META) }, null, 2);
    const outPath = path.join(__dirname, '..', 'data', 'aopeg-executors-seed.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, 'utf-8');
    console.log(`\nExported to: ${outPath}`);
    process.exit(0);
  }

  // Execute against Memgraph
  console.log('\nConnecting to Memgraph...');
  let memgraph;
  try {
    memgraph = require('../src/services/memgraph.service');
  } catch (err) {
    console.error(`Failed to load memgraph.service: ${err.message}`);
    console.log('Tip: Run with --export-json or --dry-run');
    process.exit(1);
  }

  let success = 0;
  let errors = 0;
  for (const stmt of statements) {
    try {
      await memgraph.runQuery(stmt);
      success++;
    } catch (err) {
      errors++;
      console.error(`  ERROR: ${err.message}`);
      console.error(`  Statement: ${stmt.substring(0, 100)}...`);
    }
  }

  console.log(`\nDone: ${success} succeeded, ${errors} failed out of ${statements.length}`);

  // Verify
  try {
    const nsResult = await memgraph.runQuery(
      `MATCH (t:Tool) WHERE t.source = 'aopeg'
       RETURN t.toolNamespace as namespace, count(t) as count
       ORDER BY count DESC`
    );
    console.log('\nVerification (AOPEG tools by namespace):');
    for (const row of nsResult) {
      console.log(`  ${row.namespace}: ${row.count}`);
    }

    const totalResult = await memgraph.runQuery('MATCH (t:Tool) RETURN count(t) as total');
    console.log(`\nTotal tools in graph: ${totalResult[0]?.total || 0}`);
  } catch (err) {
    console.error(`Verification failed: ${err.message}`);
  }
}

main().catch(console.error);

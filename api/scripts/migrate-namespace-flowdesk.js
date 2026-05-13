#!/usr/bin/env node
/**
 * Namespace Reorganization: FlowDesk → /api/src/instances/flowdesk/
 *
 * Phases executed:
 *   Phase 2 – Move FlowDesk AOPEG plugin
 *   Phase 3 – Move FlowDesk services
 *   Phase 4 – Move FlowDesk routes + controller
 *   Phase 5 – Move FlowDesk UI (mcp)
 *   Phase 6 – Create compatibility shims at old locations
 *             Update plugin-loader.js + api/index.js
 *
 * Safety guarantee: for every moved file, the old path becomes a shim that
 * re-exports from the new path. Nothing breaks during the transition.
 *
 * Usage: node api/scripts/migrate-namespace-flowdesk.js [--dry-run]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '../..');
const DRY_RUN  = process.argv.includes('--dry-run');
const log      = (...a) => console.log('[migrate-ns]', ...a);

// ─── helpers ──────────────────────────────────────────────────────────────────

function abs(...parts) { return path.join(ROOT, ...parts); }

function ensureDir(p) {
  if (!DRY_RUN) fs.mkdirSync(path.dirname(p), { recursive: true });
}

function readFile(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeFile(p, content) {
  ensureDir(p);
  if (!DRY_RUN) fs.writeFileSync(p, content, 'utf8');
  log(`  WRITE  ${p.replace(ROOT, '')}`);
}

function shimContent(newRelPath, isESM) {
  if (isESM) {
    return `// Compatibility shim — file moved to ${newRelPath}\nexport { default } from '${newRelPath}';\nexport * from '${newRelPath}';\n`;
  }
  return `// Compatibility shim — file moved to ${newRelPath}\nmodule.exports = require('${newRelPath}');\n`;
}

/**
 * Rewrite relative require/import paths in file content.
 *
 * moveMap: Map of absoluteOldPath → absoluteNewPath
 * fileOldAbs: absolute path of the file being moved (old location)
 * fileNewAbs: absolute path of the file being moved (new location)
 */
function rewriteImports(content, fileOldAbs, fileNewAbs, moveMap) {
  // Match require('...') and require("...") — also import ... from '...'
  return content.replace(/(?:require\(|from\s+)(['"])(\.\.?\/[^'"]+)\1/g, (match, q, rel) => {
    // Resolve the target from the old file location
    const targetAbs = path.resolve(path.dirname(fileOldAbs), rel);

    // Check if this target is being moved
    // Try exact match and with common extensions
    const candidates = [targetAbs, targetAbs + '.js', targetAbs + '.ts', targetAbs + '.jsx'];
    let newTargetAbs = null;
    for (const c of candidates) {
      if (moveMap.has(c)) { newTargetAbs = moveMap.get(c); break; }
    }
    // Also check if target is inside a moved directory
    if (!newTargetAbs) {
      for (const [oldDir, newDir] of moveMap) {
        if (targetAbs.startsWith(oldDir + path.sep) || targetAbs === oldDir) {
          newTargetAbs = newDir + targetAbs.slice(oldDir.length);
          break;
        }
      }
    }

    const resolvedTarget = newTargetAbs || targetAbs;
    const newRel = path.relative(path.dirname(fileNewAbs), resolvedTarget).replace(/\\/g, '/');
    const newRelWithDot = newRel.startsWith('.') ? newRel : './' + newRel;

    if (newRelWithDot !== rel) {
      log(`    import: ${rel} → ${newRelWithDot}`);
    }
    return match.replace(rel, newRelWithDot);
  });
}

// ─── file move list ───────────────────────────────────────────────────────────

/**
 * Build the complete list of files to move:
 * { oldAbs, newAbs, isESM }
 */
function buildMoveList() {
  const moves = [];

  function addDir(oldBase, newBase, extFilter) {
    if (!fs.existsSync(abs(oldBase))) return;
    const files = fs.readdirSync(abs(oldBase), { withFileTypes: true });
    for (const f of files) {
      const rel = f.name;
      const oldRel = oldBase + '/' + rel;
      const newRel = newBase + '/' + rel;
      if (f.isDirectory()) {
        addDir(oldRel, newRel, extFilter);
      } else {
        const ext = path.extname(rel).toLowerCase();
        if (!extFilter || extFilter.includes(ext)) {
          moves.push({ oldAbs: abs(oldRel), newAbs: abs(newRel), isESM: ext === '.jsx' || ext === '.tsx' });
        }
      }
    }
  }

  function addFile(oldRel, newRel) {
    const oldA = abs(oldRel);
    if (!fs.existsSync(oldA)) { log(`  SKIP (not found): ${oldRel}`); return; }
    const ext = path.extname(oldRel).toLowerCase();
    moves.push({ oldAbs: oldA, newAbs: abs(newRel), isESM: ext === '.jsx' || ext === '.tsx' });
  }

  // Phase 2 – FlowDesk AOPEG plugin
  addDir('api/src/core/aopeg/plugins/flowdesk',
         'api/src/instances/flowdesk/aopeg',
         ['.js', '.ts', '.json']);

  // Phase 3 – FlowDesk services
  addDir('api/src/services/flowdesk',
         'api/src/instances/flowdesk/services',
         ['.js', '.ts', '.json']);

  // Phase 3b – FlowDesk workspace-extraction module
  addDir('api/src/services/workspace/extraction/flowdesk',
         'api/src/instances/flowdesk/services/extraction',
         ['.js', '.ts', '.json']);

  // Phase 4a – FlowDesk controller
  addFile('api/src/controllers/flowdesk.controller.js',
          'api/src/instances/flowdesk/controller/flowdesk.controller.js');

  // Phase 4b – FlowDesk routes
  addFile('api/src/routes/flowdesk.route.js',
          'api/src/instances/flowdesk/routes/flowdesk.route.js');
  addFile('api/src/routes/flowdesk-config.route.js',
          'api/src/instances/flowdesk/routes/flowdesk-config.route.js');

  // Phase 5 – FlowDesk UI
  addFile('mcp/src/pages/FlowDeskPage.jsx',
          'mcp/src/instances/flowdesk/pages/FlowDeskPage.jsx');
  addFile('mcp/src/pages/FlowDeskConfigPage.jsx',
          'mcp/src/instances/flowdesk/pages/FlowDeskConfigPage.jsx');
  addDir('mcp/src/components/FlowDesk',
         'mcp/src/instances/flowdesk/components',
         ['.jsx', '.js', '.css']);
  addFile('mcp/src/stores/flowdeskConfigStore.js',
          'mcp/src/instances/flowdesk/stores/flowdeskConfigStore.js');

  return moves;
}

// ─── main migration ───────────────────────────────────────────────────────────

async function run() {
  log(`Starting FlowDesk namespace migration (dry-run=${DRY_RUN})`);

  const moves = buildMoveList();
  log(`Files to migrate: ${moves.length}`);

  // Build directory-level move map (for rewriteImports)
  const moveMap = new Map();
  // Directory mappings
  const dirMappings = [
    [abs('api/src/core/aopeg/plugins/flowdesk'),              abs('api/src/instances/flowdesk/aopeg')],
    [abs('api/src/services/flowdesk'),                        abs('api/src/instances/flowdesk/services')],
    [abs('api/src/services/workspace/extraction/flowdesk'),   abs('api/src/instances/flowdesk/services/extraction')],
  ];
  for (const [od, nd] of dirMappings) moveMap.set(od, nd);

  // File-level mappings
  for (const { oldAbs, newAbs } of moves) moveMap.set(oldAbs, newAbs);

  // ── Step 1: copy files with rewritten imports ──────────────────────────────
  log('\n── Step 1: copy & rewrite imports ──');
  for (const { oldAbs, newAbs, isESM } of moves) {
    const ext = path.extname(oldAbs).toLowerCase();
    // Only rewrite text files
    if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
      let content = readFile(oldAbs);
      content = rewriteImports(content, oldAbs, newAbs, moveMap);
      writeFile(newAbs, content);
    } else {
      // JSON / CSS — straight copy
      if (!DRY_RUN) {
        ensureDir(newAbs);
        fs.copyFileSync(oldAbs, newAbs);
      }
      log(`  COPY   ${newAbs.replace(ROOT, '')}`);
    }
  }

  // ── Step 2: write compatibility shims at old locations ─────────────────────
  log('\n── Step 2: write shims at old locations ──');
  for (const { oldAbs, newAbs, isESM } of moves) {
    const ext = path.extname(oldAbs).toLowerCase();
    if (!['.js', '.ts', '.jsx', '.tsx'].includes(ext)) continue; // no shim for JSON/CSS
    const relToNew = path.relative(path.dirname(oldAbs), newAbs).replace(/\\/g, '/');
    const relWithDot = relToNew.startsWith('.') ? relToNew : './' + relToNew;
    writeFile(oldAbs, shimContent(relWithDot, isESM));
  }

  // ── Step 3: create instance manifest ──────────────────────────────────────
  log('\n── Step 3: write instance manifest ──');
  const manifestPath = abs('api/src/instances/flowdesk/index.js');
  const manifestContent = `/**
 * FlowDesk Instance Manifest
 *
 * Single registration point for the FlowDesk instance.
 * The platform discovers this file via scanning /instances/<name>/index.js at startup.
 */
'use strict';

const { flowdeskPlugin } = require('./aopeg');
const flowdeskRoutes     = require('./routes/flowdesk.route');
const flowdeskConfigRoutes = require('./routes/flowdesk-config.route');

module.exports = {
  namespace: 'FLOWDESK',
  plugin: flowdeskPlugin,
  routes: [
    { path: '/api/v1/flowdesk',        router: flowdeskRoutes },
    { path: '/api/v1/flowdesk/config', router: flowdeskConfigRoutes },
  ],
  onRegister: async (_platform) => {
    // Instance-specific startup hooks go here
  },
};
`;
  writeFile(manifestPath, manifestContent);

  // ── Step 4: update plugin-loader.js ───────────────────────────────────────
  log('\n── Step 4: update plugin-loader.js ──');
  const plPath = abs('api/src/core/aopeg/plugins/plugin-loader.js');
  let plContent = readFile(plPath);

  // Replace the hardcoded flowdesk require with instance-discovery pattern
  const oldLoaderSnippet = `    const { flowdeskPlugin } = require('./flowdesk');`;
  const newLoaderSnippet = `    const { plugin: flowdeskPlugin } = require('../../../../instances/flowdesk');`;

  if (plContent.includes(oldLoaderSnippet)) {
    plContent = plContent.replace(oldLoaderSnippet, newLoaderSnippet);
    if (!DRY_RUN) fs.writeFileSync(plPath, plContent, 'utf8');
    log(`  PATCH  plugin-loader.js`);
  } else {
    log(`  SKIP   plugin-loader.js (snippet not found — may already be updated)`);
  }

  // ── Step 5: update api/index.js route mounting ────────────────────────────
  log('\n── Step 5: update api/index.js ──');
  const indexPath = abs('api/index.js');
  let indexContent = readFile(indexPath);

  // Replace flowdesk route require
  const oldFdRoute  = `const flowdeskRoutes = require('./src/routes/flowdesk.route');`;
  const newFdRoute  = `const flowdeskRoutes = require('./src/instances/flowdesk/routes/flowdesk.route');`;

  // Add flowdesk-config route mount if not present
  const configRouteImport = `const flowdeskConfigRoutes = require('./src/instances/flowdesk/routes/flowdesk-config.route');`;
  const configRouteMount  = `app.use('/api/v1/flowdesk/config', flowdeskConfigRoutes);`;
  const fdRouteMount      = `app.use('/api/v1/flowdesk', flowdeskRoutes);`;

  if (indexContent.includes(oldFdRoute)) {
    indexContent = indexContent.replace(oldFdRoute, newFdRoute);
    log(`  PATCH  api/index.js — flowdesk route require`);
  }

  // Add config route import after flowdesk route import if missing
  if (!indexContent.includes('flowdeskConfigRoutes')) {
    indexContent = indexContent.replace(newFdRoute, newFdRoute + '\n' + configRouteImport);
    log(`  PATCH  api/index.js — added flowdesk-config route import`);
  }

  // Add config route mount before flowdesk route mount if missing
  if (!indexContent.includes(configRouteMount)) {
    indexContent = indexContent.replace(fdRouteMount, configRouteMount + '\n' + fdRouteMount);
    log(`  PATCH  api/index.js — added flowdesk-config route mount`);
  }

  if (!DRY_RUN) fs.writeFileSync(indexPath, indexContent, 'utf8');

  // ── Step 6: update mcp/src/App.jsx import paths ───────────────────────────
  log('\n── Step 6: update mcp/src/App.jsx ──');
  const appPath = abs('mcp/src/App.jsx');
  if (fs.existsSync(appPath)) {
    let appContent = readFile(appPath);
    appContent = appContent
      .replace(/from ['"]\.\/pages\/FlowDeskPage['"]/g,   `from './instances/flowdesk/pages/FlowDeskPage'`)
      .replace(/from ['"]\.\/pages\/FlowDeskConfigPage['"]/, `from './instances/flowdesk/pages/FlowDeskConfigPage'`);
    if (!DRY_RUN) fs.writeFileSync(appPath, appContent, 'utf8');
    log(`  PATCH  mcp/src/App.jsx`);
  }

  // ── Step 7: update mcp/src/components/Layout/Sidebar.jsx ─────────────────
  // Sidebar only has a navigation link to /flowdesk — no import change needed

  log('\n── Done ──');
  log(`Moved ${moves.length} files`);
  if (DRY_RUN) log('(dry-run — no disk writes)');
}

run().catch(err => {
  console.error('[migrate-ns] Fatal:', err);
  process.exit(1);
});

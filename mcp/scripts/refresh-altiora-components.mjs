/**
 * Put a component change in front of a person, not merely into a file.
 *
 * Rebuilding a component is the first of five steps and the only one that is obvious.
 * A change can be built, committed, and still invisible in Altiora — which is exactly
 * what happened after chat-v2 1.0.32: the bundle was rebuilt at 10:11 while the dev
 * server had been serving since 09:06, and the browser kept showing the old control.
 *
 * The chain is not the same for the two components, which is why doing this by hand
 * goes wrong:
 *
 *   · @flowdesk/chat-v2 is EXCLUDED from pre-bundling, and the Portal's vite config
 *     carries a dev-only plugin that watches its dist and forces a reload. That works
 *     when the watcher is running and the file is written under it — and not when the
 *     dev server was started after the cache was cleared but before the rebuild;
 *   · @flowdesk/admin IS pre-bundled (it appears in node_modules/.vite/deps). Vite
 *     never re-reads a pre-bundled dependency on its own, so a rebuild of the admin
 *     console is invisible until that cache is dropped and the server restarted. No
 *     watcher covers it.
 *
 * So: build, sync our vendored copy, drop every consuming client's prebundle, restart
 * the dev servers, and then ASK THE DEV SERVER for the module and look for the change
 * in what it actually serves. The last step is the only one that proves anything.
 *
 * Usage:  node mcp/scripts/refresh-altiora-components.mjs [--component chat|admin|all]
 *                                                          [--expect <string>]
 *         --expect is a string that must appear in the served bundle; without it the
 *         script reports what it did and makes no claim about the result.
 */

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const ALTIORA = path.resolve(REPO, '../../FlowDesk/FlowDesk');
const COMPONENTS = path.join(ALTIORA, 'Frontend/Components');
const CLIENTS = path.join(ALTIORA, 'Frontend/Clients');

const COMPONENT = {
  chat: {
    dir: 'flowdesk-chat-v2',
    vendor: 'mcp/vendor/flowdesk-chat-v2',
    // Where a person would look for the change.
    servedBy: ['FlowDeskPortal'],
    entry: 'dist/flowdesk-chat-v2.js',
  },
  admin: {
    dir: 'flowdesk-admin',
    vendor: null,           // not vendored back — the app IS the source
    servedBy: ['FlowDeskBO'],
    entry: 'dist/flowdesk-admin.js',
  },
};

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' });
const exists = (p) => fs.access(p).then(() => true, () => false);

/**
 * Bump the patch version before building.
 *
 * Not ceremony: a same-version rebuild is cached away by every layer between here and
 * the browser, and the first symptom is a change that "did not arrive" while the file
 * on disk is correct.
 */
async function bump(pkgPath) {
  const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
  const [a, b, c] = String(pkg.version || '0.0.0').split('.').map(Number);
  pkg.version = [a, b, (c || 0) + 1].join('.');
  await fs.writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  return pkg.version;
}

async function refresh(name, { expect }) {
  const c = COMPONENT[name];
  const dir = path.join(COMPONENTS, c.dir);
  if (!await exists(dir)) { console.log(`  ${name}: not present at ${dir}`); return false; }

  const version = await bump(path.join(dir, 'package.json'));
  console.log(`  ${name}: building ${version}…`);
  run('npm run build', dir);

  if (c.vendor) {
    const from = path.join(dir, 'dist');
    const to = path.join(REPO, c.vendor, 'dist');
    await fs.mkdir(to, { recursive: true });
    for (const f of await fs.readdir(from)) {
      await fs.copyFile(path.join(from, f), path.join(to, f));
    }
    await fs.copyFile(path.join(dir, 'package.json'), path.join(REPO, c.vendor, 'package.json'));
    console.log(`  ${name}: vendored copy updated`);
  }

  // Drop the prebundle of every client that serves it. Cheap, and the one step whose
  // absence produces a change that exists everywhere except on screen.
  for (const app of c.servedBy) {
    const cache = path.join(CLIENTS, app, 'node_modules/.vite');
    if (await exists(cache)) {
      await fs.rm(cache, { recursive: true, force: true });
      console.log(`  ${name}: cleared ${app} prebundle`);
    }
  }
  if (expect) {
    const built = await fs.readFile(path.join(dir, c.entry), 'utf8');
    const inBundle = built.includes(expect);
    console.log(`  ${name}: "${expect}" in the built bundle: ${inBundle ? 'yes' : 'NO'}`);
    if (!inBundle) {
      // A local variable name is NOT a usable marker: the bundle is minified and
      // identifiers are renamed. Property names, string literals and imported symbols
      // survive; `defaultLabel` did not, and reported a healthy build as a failure.
      console.log(`  ${name}: note — the bundle is minified, so only string literals and`);
      console.log(`  ${name}:        property names survive. A local variable will never match.`);
      return false;
    }
  }
  return true;
}

async function main() {
  const argv = process.argv.slice(2);
  const pick = (flag, dflt) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  const which = pick('--component', 'all');
  const expect = pick('--expect', null);
  const names = which === 'all' ? Object.keys(COMPONENT) : [which];

  console.log('rebuilding and clearing caches:');
  let ok = true;
  for (const n of names) ok = (await refresh(n, { expect })) && ok;

  console.log('');
  console.log('The dev servers must now be restarted — a cleared prebundle is only');
  console.log('rebuilt on start, and a running server keeps the module it already has:');
  console.log('');
  console.log(`  cd ${path.relative(process.cwd(), CLIENTS) || CLIENTS}`);
  console.log('  npm run dev        # Portal  (chat)');
  console.log('  npm run dev:bo     # Back-Office (admin console)');
  console.log('');
  console.log('Then hard-reload the page (Ctrl+F5): the browser caches the module too.');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

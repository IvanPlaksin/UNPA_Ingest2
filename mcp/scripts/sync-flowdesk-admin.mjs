/**
 * Keep `@flowdesk/admin` in step with the feature it was extracted from.
 *
 * The component in Altiora is a COPY of `mcp/src/features/flowdesk-admin`, taken by
 * hand and never taken again. Measured on 2026-08-03: the copy held 23 source files
 * against our 48, and its bundle was built on 29 July — so Altiora's Back-Office was
 * showing the prompt editor as it stood before conditions, connections, the context
 * preview, the canvas modes, the graph selector and the tour existed. Nothing was
 * broken; it was simply an older program, and no version number said so (the copy
 * still called itself 1.0.0, and so did ours).
 *
 * A copy taken by hand drifts. This script is the answer to that, and it is
 * deliberately dumb: it mirrors the directory, and it protects the two things that
 * are genuinely different in the embedded build.
 *
 * WHAT IS NOT COPIED, AND WHY
 *
 *   · `api/adminClient.js` — the component reads its base URL and auth headers from
 *     `config/runtime-config` (the host supplies them as props), where the mcp app
 *     reads its own `config/api.config`. That is the seam that makes the component
 *     embeddable, so the file is MERGED rather than overwritten: new exports are
 *     appended, the import line is left alone. A blind copy here breaks the embed
 *     with a module-not-found that points at a file the component does not have.
 *   · `__tests__` — they import vitest and testing-library, which the component's
 *     build does not carry and does not need.
 *
 * Usage:  node mcp/scripts/sync-flowdesk-admin.mjs [--write]
 *         Dry by default: prints what would change and touches nothing.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '../src/features/flowdesk-admin');
const DEST = path.resolve(HERE, '../../../../FlowDesk/FlowDesk/Frontend/Components/flowdesk-admin/src');

/** Files the embedded build owns. Never overwritten from here. */
const HOST_OWNED = new Set(['api/adminClient.js']);
const SKIP_DIR = new Set(['__tests__']);

async function walk(dir, base = '') {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      out.push(...await walk(path.join(dir, e.name), rel));
    } else if (/\.(jsx?|css|d\.ts)$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

const read = (p) => fs.readFile(p, 'utf8').catch(() => null);

/**
 * Bring the component's API client up to date WITHOUT touching how it is configured.
 *
 * Only whole `export const NAME = …` lines that the component lacks are appended, so
 * a new endpoint added in the app reaches the embed while the host's own base-URL and
 * header plumbing survives untouched.
 */
function mergeClient(ours, theirs) {
  if (!theirs) return null;
  // BOTH forms of export. The first version of this understood `export const` only,
  // so `export function promptAssistantChat` was invisible to the "do they already
  // have it" check AND was swallowed into the preceding const's block — appending a
  // second copy and breaking the build with "Identifier has already been declared".
  // The build caught it. A merge that half-understands its input is worse than none.
  const DECL = /^export (?:const|function|async function) (\w+)/;
  const have = new Set(
    [...theirs.matchAll(/^export (?:const|function|async function) (\w+)/gm)].map((m) => m[1]),
  );
  const missing = [];
  // Statements can wrap; take each export through to the line before the next one.
  const blocks = ours.split(/\n(?=export (?:const|function|async function) )/);
  for (const b of blocks) {
    const m = DECL.exec(b);
    if (m && !have.has(m[1])) missing.push({ name: m[1], text: b.trimEnd() });
  }
  if (!missing.length) return { text: theirs, added: [] };
  const banner = '\n\n// ── added by sync-flowdesk-admin (kept in step with the app) ──\n';
  return { text: `${theirs.trimEnd()}${banner}${missing.map((x) => x.text).join('\n')}\n`, added: missing.map((x) => x.name) };
}

async function main() {
  const write = process.argv.includes('--write');
  try { await fs.access(DEST); } catch {
    console.error(`The component is not where this script expects it:\n  ${DEST}`);
    process.exit(1);
  }

  const files = await walk(SRC);
  const added = [];
  const changed = [];
  const same = [];

  for (const rel of files) {
    if (HOST_OWNED.has(rel)) continue;
    const from = path.join(SRC, rel);
    const to = path.join(DEST, rel);
    const [a, b] = await Promise.all([read(from), read(to)]);
    if (b === null) added.push(rel);
    else if (a !== b) changed.push(rel);
    else same.push(rel);
    if (write && a !== b) {
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.writeFile(to, a, 'utf8');
    }
  }

  // The client, merged rather than replaced.
  const merged = mergeClient(await read(path.join(SRC, 'api/adminClient.js')), await read(path.join(DEST, 'api/adminClient.js')));
  if (merged && merged.added.length && write) {
    await fs.writeFile(path.join(DEST, 'api/adminClient.js'), merged.text, 'utf8');
  }

  console.log(`source files in the app : ${files.length}`);
  console.log(`  new in the component  : ${added.length}`);
  console.log(`  differing             : ${changed.length}`);
  console.log(`  already identical     : ${same.length}`);
  if (added.length) console.log(`\nnew:\n  ${added.join('\n  ')}`);
  if (changed.length) console.log(`\nchanged:\n  ${changed.join('\n  ')}`);
  if (merged) {
    console.log(`\napi/adminClient.js — host-owned, merged: ${merged.added.length ? merged.added.join(', ') : 'nothing missing'}`);
  }
  console.log(write ? '\nwritten.' : '\n(dry run — pass --write)');
}

main().catch((e) => { console.error(e); process.exit(1); });

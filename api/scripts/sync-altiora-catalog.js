/**
 * I-2 — sync Altiora's service catalog into Qdrant `flowdesk_services`.
 *
 * Makes Altiora the source of truth for what can be requested, replacing the
 * drifted/fictional intent catalog. Runs as a background job → service account
 * token (no user request in flight).
 *
 * Usage:
 *   node -r dotenv/config api/scripts/sync-altiora-catalog.js              # additive (safe)
 *   node -r dotenv/config api/scripts/sync-altiora-catalog.js --purge-stale # + drop non-altiora points
 *
 * --purge-stale is DESTRUCTIVE: it deletes every point whose payload.source is not
 * 'altiora' (the ~1704 legacy iNeed-era points and the fictional hardware/VPN
 * utterances). Only do this once real services can actually be fulfilled (I-4),
 * or the fixture-based demo flows stop resolving.
 */

const { syncCatalog } = require('../src/instances/flowdesk/services/altiora-catalog-sync');
const { createAltioraClient, createServiceTokenProvider } = require('../src/instances/flowdesk/services/altiora-client');

async function main() {
  const purgeStale = process.argv.includes('--purge-stale');
  console.log(`Altiora catalog → Qdrant sync${purgeStale ? '  [--purge-stale ENABLED]' : '  (additive)'}\n`);

  const client = createAltioraClient({ tokenProvider: createServiceTokenProvider() });
  const res = await syncCatalog({ client, purgeStale, log: (m) => console.log(m) });

  const byDomain = {};
  for (const s of res.services) {
    const d = String(s.serviceCode).split('-').slice(0, 2).join('-');
    byDomain[d] = (byDomain[d] || 0) + 1;
  }
  console.log(`\nfetched ${res.fetched} · upserted ${res.upserted} · purged ${res.purged}`);
  console.log('domains:', JSON.stringify(byDomain));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('SYNC FAILED:', e.message); process.exit(1); });
}

(async () => {
  const { sourceCatalogService } = require('./src/services/knowledge/source-catalog.service');
  const { probeSourceTotal } = require('./src/services/indexing/document-index.count-probe');
  const all = await sourceCatalogService.list({});
  const targets = all.filter(s => /UN ODS|Digital Library|World Bank/.test(s.name)).slice(0,6);
  for (const s of targets) {
    try {
      const t0 = Date.now();
      const res = await probeSourceTotal(s, {});
      console.log(`${s.name} => total=${res.total} method=${res.method} exact=${res.exact} reqs=${res.requests} (${Date.now()-t0}ms)`);
    } catch(e){ console.log(`${s.name} => ERR ${e.message}`); }
  }
  process.exit(0);
})().catch(e=>{console.error('FATAL',e.message);process.exit(1)});

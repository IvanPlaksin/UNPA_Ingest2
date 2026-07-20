'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(label, url, opts = {}) {
  try {
    const r = await axios.get(url, {
      timeout: 15000, httpsAgent: agent,
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*', ...(opts.headers||{}) }
    });
    const t = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    // Count PDF links in HTML
    const pdfLinks = (t.match(/href=[^>]*\.pdf/gi)||[]).length;
    const anyLinks = (t.match(/<a\s/gi)||[]).length;
    console.log(`[${label}] HTTP ${r.status} — ${t.length}B — pdf-links:${pdfLinks} all-links:${anyLinks}`);
  } catch (e) { console.log(`[${label}] ERR: ${e.message}`); }
}

async function main() {
  // IAEA NDS — check link density
  await probe('IAEA NDS /publications/', 'https://www-nds.iaea.org/publications/');

  // IFAD alternatives
  await probe('IFAD /en/publications', 'https://www.ifad.org/en/publications');
  await probe('IFAD /en/knowledge', 'https://www.ifad.org/en/knowledge');
  await probe('IFAD eval IOE', 'https://www.ifad.org/en/ioe-evaluations');

  // UNDP alternatives
  await probe('UNDP /publications', 'https://www.undp.org/publications');
  await probe('UNDP hdr reports', 'https://hdr.undp.org/reports-and-publications');
  await probe('UNDP data.undp.org', 'https://data.undp.org/');

  // UNEP alternatives
  await probe('InforMEA /en/documents', 'https://www.informea.org/en/documents');
  await probe('InforMEA search', 'https://www.informea.org/en/search');
  await probe('UNEP GEO Portal', 'https://www.unep.org/geo/');

  // UNIDO alternatives
  await probe('UNIDO annual reports', 'https://www.unido.org/who-we-are/accountability/annual-reports');
  await probe('UNIDO research', 'https://www.unido.org/our-focus/research-and-statistics');

  // UN Digital Library — recheck
  await probe('UN Digital Lib', 'https://digitallibrary.un.org/search?p=resolution&of=recjson&action_search=Search&rg=5&ln=en', { headers: { Accept: 'application/json' } });
}

main().catch(e => { console.error(e); process.exit(1); });

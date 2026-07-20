'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(label, url, opts = {}) {
  try {
    const r = await axios.get(url, { timeout: 15000, httpsAgent: agent, headers: { 'User-Agent': UA, ...opts.headers }, ...opts });
    const data = r.data;
    if (typeof data === 'string') {
      console.log(`\n[${label}] HTTP ${r.status} — HTML/TEXT ${data.length} bytes`);
      console.log('  Preview:', data.substring(0, 150).replace(/\s+/g, ' '));
    } else if (Array.isArray(data)) {
      console.log(`\n[${label}] HTTP ${r.status} — ARRAY len=${data.length}`);
      if (data[0]) console.log('  Item keys:', Object.keys(data[0]).join(', '));
      console.log('  Sample:', JSON.stringify(data[0]).substring(0, 200));
    } else {
      console.log(`\n[${label}] HTTP ${r.status} — OBJECT keys=[${Object.keys(data).join(', ')}]`);
      for (const k of Object.keys(data).slice(0, 5)) {
        const v = data[k];
        if (Array.isArray(v)) console.log(`  .${k} → ARRAY len=${v.length}`, v[0] ? `first keys: ${Object.keys(v[0]).slice(0,5).join(',')}` : '(empty)');
        else console.log(`  .${k} → ${JSON.stringify(v).substring(0, 80)}`);
      }
    }
  } catch (e) {
    console.log(`\n[${label}] ERR: ${e.message}`);
  }
}

async function main() {
  // UNIDO API
  await probe('UNIDO /api/documents', 'https://open.unido.org/api/documents?rows=5&start=0');

  // IAEA alternatives
  await probe('IAEA NDS pubs', 'https://www-nds.iaea.org/publications/');
  await probe('IAEA news rss', 'https://www.iaea.org/rss/media/en/news.rss', { headers: { Accept: 'application/rss+xml,*/*' } });

  // UNDP open portal
  await probe('UNDP open.undp.org', 'https://open.undp.org/');

  // FAO fix
  await probe('FAO pubs page', 'https://www.fao.org/publications/en/');

  // IFAD alternatives
  await probe('IFAD knowledge-hub', 'https://www.ifad.org/en/knowledge-hub');
  await probe('IFAD evaluation.ifad.org', 'https://evaluation.ifad.org/en/publications');

  // UNEP alternatives
  await probe('WESR article list', 'https://wesr.unep.org/article/list');
}

main().catch(e => { console.error(e); process.exit(1); });

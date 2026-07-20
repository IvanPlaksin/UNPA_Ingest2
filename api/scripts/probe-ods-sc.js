'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function main() {
  // Print all 4 ODS source configs
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const sources = await sourceCatalogService.list({});
  const ods = sources.filter(s => s.name.startsWith('UN ODS'));
  console.log('ODS sources:\n');
  for (const s of ods) {
    console.log(`[${s.name}]`);
    console.log('  type:', s.type);
    console.log('  responseMapping:', JSON.stringify(s.config?.responseMapping));
    console.log('  defaultQuery:', s.config?.defaultQuery);
    console.log();
  }

  // Probe with retry for DL API 202
  const url = 'https://digitallibrary.un.org/search?p=S%2FRES&of=recjson&action_search=Search&rg=3&jrec=1&ln=en';
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const r = await axios.get(url, {
        timeout: 10000, httpsAgent: agent,
        headers: { 'User-Agent': UA, Accept: 'application/json,*/*' }
      });
      console.log(`\nDL attempt ${attempt}: HTTP ${r.status}`);
      if (r.status === 200 && r.data && typeof r.data === 'object') {
        const hits = r.data.hits?.hits;
        if (hits?.length > 0) {
          const h0 = hits[0];
          console.log('_source keys:', Object.keys(h0._source || {}));
          console.log('title[0]:', JSON.stringify(h0._source?.title?.[0]));
          console.log('url[0]:', JSON.stringify(h0._source?.url?.[0]));
          break;
        }
      }
      if (attempt < 5) await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.log(`DL attempt ${attempt}: ERR ${e.response?.status || e.code}`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

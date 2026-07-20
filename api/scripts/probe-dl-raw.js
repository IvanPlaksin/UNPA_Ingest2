'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function main() {
  const baseUrl = 'https://digitallibrary.un.org/search?p=S%2FRES&of=recjson&action_search=Search&rg=3&jrec=1&ln=en';
  for (let i = 0; i < 10; i++) {
    const r = await axios.get(baseUrl, {
      timeout: 10000, httpsAgent: agent,
      headers: { 'User-Agent': UA, Accept: 'application/json,*/*' }
    }).catch(e => ({ status: e.response?.status || 0, data: null }));

    console.log(`Attempt ${i+1}: HTTP ${r.status}`);
    if (r.status === 200 && r.data?.hits?.hits?.[0]) {
      const src = r.data.hits.hits[0]._source;
      console.log('\nRAW _source:');
      console.log(JSON.stringify(src, null, 2).substring(0, 2000));
      break;
    }
    await new Promise(res => setTimeout(res, 500));
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function main() {
  for (let i = 0; i < 15; i++) {
    const r = await axios.get('https://digitallibrary.un.org/search?p=S%2FRES&of=recjson&action_search=Search&rg=2&jrec=1&ln=en', {
      timeout: 10000, httpsAgent: agent,
      headers: { 'User-Agent': UA, Accept: 'application/json,*/*' }
    }).catch(e => ({ status: e.response?.status || 0, data: null }));
    process.stdout.write(`Attempt ${i+1}: HTTP ${r.status}\r`);
    if (r.status === 200 && r.data) {
      const raw = typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2);
      const out = `d:/tmp/dl-response.json`;
      fs.writeFileSync(out, raw);
      console.log(`\nGot 200! Saved to ${out} (${raw.length} bytes)`);
      // Print first item structure
      const arr = Array.isArray(r.data) ? r.data : r.data.hits?.hits || [];
      if (arr[0]) {
        console.log('\nFirst item top-level keys:', Object.keys(arr[0]));
        for (const k of Object.keys(arr[0]).slice(0, 20)) {
          const v = arr[0][k];
          const preview = JSON.stringify(v).substring(0, 120);
          console.log(`  ${k}: ${preview}`);
        }
      }
      break;
    }
    await new Promise(r => setTimeout(r, 600));
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

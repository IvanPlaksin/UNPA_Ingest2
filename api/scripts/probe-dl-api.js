'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

async function main() {
  // Check actual DL search response structure for S/ (Security Council) docs
  const url = 'https://digitallibrary.un.org/search?p=S%2FRES&of=recjson&action_search=Search&rg=3&jrec=1&ln=en';
  const r = await axios.get(url, {
    timeout: 15000, httpsAgent: agent,
    headers: { 'User-Agent': 'Mozilla/5.0 UNPA/1.0', 'Accept': 'application/json' }
  });
  const data = r.data;
  console.log('Top-level keys:', Object.keys(data));
  if (data.hits) {
    console.log('hits keys:', Object.keys(data.hits));
    console.log('hits.total:', data.hits.total);
    const h0 = data.hits.hits?.[0];
    if (h0) {
      console.log('\nFirst hit keys:', Object.keys(h0));
      if (h0._source) {
        console.log('_source keys:', Object.keys(h0._source));
        console.log('title:', JSON.stringify(h0._source.title).substring(0, 200));
        console.log('date:', JSON.stringify(h0._source.date));
        console.log('url:', JSON.stringify(h0._source.url?.slice?.(0,2) || h0._source.url));
        console.log('symbol:', JSON.stringify(h0._source.symbol));
      } else {
        console.log('\nFull first hit:', JSON.stringify(h0).substring(0, 800));
      }
    }
  } else {
    console.log('Full response sample:', JSON.stringify(data).substring(0, 600));
  }
}
main().catch(e => { console.error(e.message); process.exit(1); });

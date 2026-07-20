'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function main() {
  const url = 'https://digitallibrary.un.org/search?p=S%2FRES&of=recjson&action_search=Search&rg=3&jrec=1&ln=en';
  let data = null;
  for (let i = 0; i < 8; i++) {
    try {
      const r = await axios.get(url, {
        timeout: 10000, httpsAgent: agent,
        headers: { 'User-Agent': UA, Accept: 'application/json,*/*' }
      });
      console.log(`Attempt ${i+1}: HTTP ${r.status} | body len: ${JSON.stringify(r.data).length}`);
      if (r.status === 200 && r.data && typeof r.data === 'object') {
        data = r.data;
        break;
      }
    } catch (e) {
      console.log(`Attempt ${i+1}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 800));
  }

  if (!data) { console.log('Never got 200'); process.exit(0); }

  console.log('\nTop keys:', Object.keys(data));
  const hits = data.hits?.hits;
  console.log('hits.hits count:', hits?.length);
  console.log('hits.total:', data.hits?.total);

  if (hits?.[0]) {
    const h = hits[0];
    console.log('\nFirst hit keys:', Object.keys(h));
    const src = h._source || h;
    console.log('_source keys:', Object.keys(src));

    console.log('\ntitle raw:', JSON.stringify(src.title).substring(0, 300));
    console.log('url raw:  ', JSON.stringify(src.url).substring(0, 300));
    console.log('date raw: ', JSON.stringify(src.date));
    console.log('symbol raw:', JSON.stringify(src.symbol));

    // Try the mapping path _source.title.0.value
    const title0 = Array.isArray(src.title) ? src.title[0] : src.title;
    console.log('\ntitle[0]:', JSON.stringify(title0));
    const titleVal = title0?.value !== undefined ? title0.value : title0;
    console.log('title resolved:', titleVal);

    const url0 = Array.isArray(src.url) ? src.url[0] : src.url;
    console.log('\nurl[0]:', JSON.stringify(url0));
    const urlVal = url0?.value !== undefined ? url0.value : url0;
    console.log('url resolved:', urlVal);
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

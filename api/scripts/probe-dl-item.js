'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

async function main() {
  const r = await axios.get('https://digitallibrary.un.org/search?p=S%2FRES&of=recjson&action_search=Search&rg=3&jrec=1&ln=en', {
    timeout: 15000, httpsAgent: agent,
    headers: { 'User-Agent': UA, Accept: 'application/json,*/*' }
  });
  console.log('Status:', r.status, '| type:', typeof r.data, '| isArray:', Array.isArray(r.data));
  if (Array.isArray(r.data)) {
    console.log('Count:', r.data.length);
    const item = r.data[0];
    console.log('\nFirst item keys:', Object.keys(item));
    console.log('\nFull first item:');
    console.log(JSON.stringify(item, null, 2).substring(0, 3000));
  } else {
    console.log('Keys:', Object.keys(r.data || {}));
    console.log(JSON.stringify(r.data).substring(0, 500));
  }
  process.exit(0);
}
main().catch(e => { console.log('ERR:', e.response?.status, e.message); process.exit(1); });

'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const hAgent = new https.Agent({ rejectUnauthorized: false });

// Monkey-patch axios to log requests
const origGet = axios.get.bind(axios);
const origReq = axios.request?.bind(axios) || axios.bind(axios);

// Patch the default instance
const origAdapter = axios.defaults.adapter;
axios.interceptors.request.use(cfg => {
  console.log(`[AXIOS] ${cfg.method?.toUpperCase()} ${cfg.url}`);
  return cfg;
});
axios.interceptors.response.use(resp => {
  const body = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
  console.log(`[AXIOS] → ${resp.status} | body len: ${body.length}`);
  if (resp.status === 200 && body.length > 10) {
    console.log('[AXIOS] body sample:', body.substring(0, 300));
  }
  return resp;
});

async function main() {
  const { sourceCatalogService } = require('../src/services/knowledge/source-catalog.service');
  const sources = await sourceCatalogService.list({});
  const sc = sources.find(s => s.name === 'UN ODS — Security Council');
  console.log('\nConfig:', JSON.stringify(sc.config, null, 2));
  console.log('\n--- Starting browse ---');
  const result = await sourceCatalogService.browse(sc.id, { query: '', page: 1, limit: 5 });
  console.log('\n--- Result ---');
  console.log('Total:', result.total, '| results:', result.results.length);
  if (result.results[0]) {
    console.log('First item:', JSON.stringify(result.results[0]));
  }
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });

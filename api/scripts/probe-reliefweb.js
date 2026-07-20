'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });

async function probe(label, url, method = 'GET', data = null) {
  try {
    const cfg = {
      method, url,
      timeout: 15000, httpsAgent: agent,
      headers: { 'User-Agent': 'UNPA-Ingest/1.0', 'Content-Type': 'application/json' },
    };
    if (data) cfg.data = data;
    const r = await axios(cfg);
    const d = r.data;
    console.log(`\n[${label}] HTTP ${r.status}`);
    if (d && typeof d === 'object') {
      console.log('  totalCount:', d.totalCount);
      console.log('  count:', d.count);
      if (Array.isArray(d.data) && d.data.length > 0) {
        console.log('  first item fields:', Object.keys(d.data[0].fields || d.data[0]).join(', '));
        console.log('  sample title:', (d.data[0].fields || d.data[0]).title);
      }
    } else {
      console.log('  Body:', String(d).substring(0, 200));
    }
  } catch(e) {
    console.log(`\n[${label}] ERR HTTP ${e.response?.status}: ${e.message}`);
    if (e.response?.data) console.log('  Detail:', JSON.stringify(e.response.data).substring(0, 300));
  }
}

async function main() {
  const base = 'https://api.reliefweb.int/v1/reports';

  // Try 1: POST with proper JSON filter
  await probe('POST filter source.shortname', base, 'POST', {
    appname: 'unpa-ingest',
    filter: { field: 'source.shortname', value: ['UNDP'] },
    limit: 5,
    fields: { include: ['title', 'url_alias', 'date'] },
    sort: ['date:desc'],
  });

  // Try 2: POST with organization filter
  await probe('POST filter source (string)', base, 'POST', {
    appname: 'unpa-ingest',
    filter: { field: 'source', value: ['UNDP'] },
    limit: 5,
    fields: { include: ['title', 'url_alias', 'date'] },
  });

  // Try 3: GET with query
  await probe('GET query UNDP', `${base}?appname=unpa-ingest&query[value]=UNDP+report&limit=5&fields[include][]=title&fields[include][]=date.created&sort[]=date:desc`);

  // Try 4: POST with conditions
  await probe('POST conditions', base, 'POST', {
    appname: 'unpa-ingest',
    filter: {
      operator: 'AND',
      conditions: [
        { field: 'source.shortname', value: 'UNDP' }
      ]
    },
    limit: 5,
    fields: { include: ['title', 'url_alias', 'date'] },
  });

  // Check UNIDO too
  await probe('POST UNIDO source.shortname', base, 'POST', {
    appname: 'unpa-ingest',
    filter: { field: 'source.shortname', value: ['UNIDO'] },
    limit: 5,
    fields: { include: ['title', 'url_alias', 'date'] },
  });
}

main().catch(e => { console.error(e.message); process.exit(1); });

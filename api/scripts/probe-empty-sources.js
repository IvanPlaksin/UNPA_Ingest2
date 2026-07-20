'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(label, url) {
  try {
    const r = await axios.get(url, {
      timeout: 15000, httpsAgent: agent,
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }
    });
    const t = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    const pdfs = (t.match(/href=[^>]*\.pdf/gi)||[]).length;
    const links = (t.match(/<a[\s>]/gi)||[]).length;
    const hrefs = (t.match(/href="[^"]+"/gi)||[]).slice(0,3).map(h=>h.substring(0,80));
    console.log(`✓ HTTP ${r.status} | ${t.length}B | ${pdfs}pdf | ${links}links  ${label}`);
    hrefs.forEach(h => console.log(`    ${h}`));
  } catch (e) {
    console.log(`✗ [${e.response?.status||e.code}]  ${label}`);
  }
}

async function main() {
  await probe('IPCC Reports',       'https://www.ipcc.ch/reports/');
  await probe('JIU Reports',        'https://www.unjiu.org/content/reports-notes');
  await probe('UNCCD Resources',    'https://www.unccd.int/resources');
  await probe('UNDRR Publications', 'https://www.undrr.org/publications');
  await probe('UNIDIR Publications','https://unidir.org/publications');
  await probe('UNRISD Publications','https://www.unrisd.org/en/publications');
  await probe('UNU Collections',    'https://collections.unu.edu/');
  await probe('UPU Publications',   'https://www.upu.int/en/Publications');
  await probe('WIPO Publications',  'https://www.wipo.int/publications/en/');
  await probe('WMO Library',        'https://library.wmo.int/');
}
main().catch(e => { console.error(e.message); process.exit(1); });

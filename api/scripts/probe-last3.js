'use strict';
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(label, url, accept = 'text/html,*/*') {
  try {
    const r = await axios.get(url, {
      timeout: 15000, httpsAgent: agent,
      headers: { 'User-Agent': UA, Accept: accept }
    });
    const t = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    const pdfs = (t.match(/href=[^>]*\.pdf/gi)||[]).length;
    const links = (t.match(/<a[\s>]/gi)||[]).length;
    const items = (t.match(/<(?:item|entry|record)[\s>]/gi)||[]).length;
    const hrefs = (t.match(/href="[^"#?][^"]+"/gi)||[])
      .filter(h => !/favicon|css|icon|logo|apple|manifest/i.test(h))
      .slice(0,5).map(h => h.substring(0,90));
    console.log(`✓ HTTP ${r.status} | ${t.length}B | ${pdfs}pdf | ${links}links | ${items}items  ${label}`);
    hrefs.forEach(h => console.log(`    ${h}`));
  } catch (e) {
    console.log(`✗ [${e.response?.status||e.code}]  ${label}`);
  }
}

async function main() {
  console.log('\n=== UNU ===');
  await probe('UNU eserv browse query', 'https://collections.unu.edu/eserv/browse/query/');
  await probe('UNU home',               'https://collections.unu.edu/');
  await probe('UNU view/collections',   'https://collections.unu.edu/view/collections/');
  await probe('UNU search',             'https://collections.unu.edu/search.php?q=environment');

  console.log('\n=== WMO ===');
  await probe('WMO library records',    'https://library.wmo.int/records?ln=en&p=&action_search=Search&of=hb');
  await probe('WMO library home',       'https://library.wmo.int/');
  await probe('WMO doc center',         'https://library.wmo.int/records?of=hb');
  await probe('WMO CSS/doc list',       'https://library.wmo.int/records?c=WMO+Publication&of=hb');

  console.log('\n=== UNRISD ===');
  await probe('UNRISD feed',            'https://www.unrisd.org/feed', 'application/rss+xml,*/*');
  await probe('UNRISD rss',             'https://www.unrisd.org/rss', 'application/rss+xml,*/*');
  await probe('UNRISD publications',    'https://www.unrisd.org/en/publications');
  await probe('UNRISD search',          'https://www.unrisd.org/search?q=report');
  await probe('UNRISD sitemap',         'https://www.unrisd.org/sitemap.xml', 'application/xml,*/*');
}
main().catch(e => { console.error(e.message); process.exit(1); });

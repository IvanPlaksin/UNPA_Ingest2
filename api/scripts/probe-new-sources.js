'use strict';
/**
 * Проверка доступности новых источников из исследования чата.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const axios = require('axios');
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function probe(label, url, isXml = false) {
  try {
    const r = await axios.get(url, {
      timeout: 15000, httpsAgent: agent,
      headers: { 'User-Agent': UA, Accept: isXml ? 'application/xml,text/xml,*/*' : 'text/html,*/*' }
    });
    const t = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    const pdfs = (t.match(/href=[^>]*\.pdf/gi)||[]).length;
    const links = (t.match(/<a[\s>]/gi)||[]).length;
    const items = (t.match(/<(?:item|entry|record)[\s>]/gi)||[]).length;
    const status = `HTTP ${r.status} | ${t.length}B | ${pdfs}pdf | ${links}links | ${items}items`;
    console.log(`✓ ${status.padEnd(48)} ${label}`);
    return true;
  } catch (e) {
    const code = e.response?.status || e.code || '-';
    console.log(`✗ [${String(code).padEnd(5)}]                                        ${label}`);
    return false;
  }
}

async function main() {
  console.log('\n═══ RSS FEEDS ═══');
  await probe('ESCAP Repository RSS',      'https://repository.unescap.org/feed/rss_2.0/site', true);
  await probe('WIPO News RSS',             'https://www.wipo.int/export/sites/www/rss/en/news.xml', true);
  await probe('ReliefWeb RSS',             'https://reliefweb.int/updates/rss.xml', true);

  console.log('\n═══ OAI-PMH ═══');
  await probe('ECLAC OAI-PMH',            'https://repositorio.cepal.org/server/oai/request?verb=Identify', true);
  await probe('ESCAP OAI-PMH',            'https://repository.unescap.org/oai?verb=Identify', true);
  await probe('ECA OAI-PMH',              'https://repository.uneca.org/oai/request?verb=Identify', true);

  console.log('\n═══ REGIONAL COMMISSIONS ═══');
  await probe('ECLAC Browse',             'https://repositorio.cepal.org/home');
  await probe('ESCAP Publications',       'https://www.unescap.org/publications');
  await probe('ESCWA Publications',       'https://www.unescwa.org/publications');
  await probe('UNECE Publications',       'https://unece.org/publications-and-resources');
  await probe('ECA Publications',         'https://repository.uneca.org/handle/10855/1');

  console.log('\n═══ RESEARCH INSTITUTES ═══');
  await probe('UNU Collections',          'https://collections.unu.edu/');
  await probe('UNRISD Publications',      'https://www.unrisd.org/en/publications');
  await probe('UNIDIR Publications',      'https://unidir.org/publications');
  await probe('JIU Reports',             'https://www.unjiu.org/content/reports-notes');

  console.log('\n═══ TRIBUNALS ═══');
  await probe('ITLOS Cases',             'https://www.itlos.org/en/main/cases/list-of-cases/');
  await probe('ICC Cases',               'https://www.icc-cpi.int/cases');
  await probe('ICC Legal Tools',         'https://www.legal-tools.org/');

  console.log('\n═══ SPECIALIZED AGENCIES ═══');
  await probe('WIPO Publications',        'https://www.wipo.int/publications/en/');
  await probe('WMO Library',             'https://library.wmo.int/');
  await probe('WTO Documents',           'https://docs.wto.org/');
  await probe('ITU Publications',        'https://www.itu.int/pub/');
  await probe('IMO Documents',           'https://docs.imo.org/');
  await probe('UPU Publications',        'https://www.upu.int/en/Publications');

  console.log('\n═══ PROGRAMMES & FUNDS ═══');
  await probe('UNFPA Publications',      'https://www.unfpa.org/publications');
  await probe('UN-Habitat Publications', 'https://unhabitat.org/knowledge/publications');
  await probe('UNDRR Publications',      'https://www.undrr.org/publications');
  await probe('PreventionWeb',           'https://www.preventionweb.net/publications');
  await probe('CEB/HLCM',               'https://unsceb.org/content/reports');

  console.log('\n═══ TREATY BODIES ═══');
  await probe('UNFCCC Documents',        'https://unfccc.int/documents');
  await probe('IPCC Reports',            'https://www.ipcc.ch/reports/');
  await probe('CBD Documents',           'https://www.cbd.int/documents');
  await probe('CITES Documents',         'https://cites.org/eng/resources/documents');
  await probe('UNCCD Resources',         'https://www.unccd.int/resources');
  await probe('Montreal Protocol',       'https://ozone.unep.org/treaties/montreal-protocol');
}

main().catch(e => { console.error(e.message); process.exit(1); });

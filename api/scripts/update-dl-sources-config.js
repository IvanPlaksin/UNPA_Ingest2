'use strict';
/**
 * update-dl-sources-config.js
 *
 * Updates UN Digital Library source configs:
 * 1. Adds pageParam/limitParam/pageParamStyle for proper Invenio pagination
 * 2. Saves processing methodology to UN ODS — Security Council
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const neo4j = require('neo4j-driver');
const driver = neo4j.driver(
  'bolt://localhost:7687',
  neo4j.auth.basic('memgraph', 'secret_password_123')
);

const SC_METHODOLOGY = `# UN Digital Library — Security Council Resolutions
## Source Type
UN Digital Library (UNDL) via Invenio REST API

## Browse Method
GET https://digitallibrary.un.org/search?p={query}&of=recjson&action_search=Search&rg={limit}&jrec={offset}&ln=en

Response: Flat JSON array of Invenio record objects

## Record Structure
Each record contains:
- recid: integer — unique record ID (used to construct URLs)
- title: [{value: string, lang: "en"|"ar"|"fr"|...}] — multilingual title array
- date: "YYYY-MM-DD" — document date
- files: [{full_name: "S_RES_NNNN(YEAR)-XX.pdf", eformat: "pdf", ...}] — file attachments
  - Language suffix: -EN (English), -AR (Arabic), -FR (French), -ES (Spanish), -RU (Russian), -ZH (Chinese)

## URL Patterns
- Record detail page: https://digitallibrary.un.org/record/{recid}
- PDF file: https://digitallibrary.un.org/record/{recid}/files/{full_name}
- English PDF: find files[] where full_name contains "-EN." and eformat === "pdf"

## Symbol Normalization
File full_name → UN Symbol:
  S_RES_2319(2016)-EN.pdf → S/RES/2319(2016)
  A_RES_79_1-EN.pdf       → A/RES/79/1

## Metadata Extraction (per document)
1. symbol: normalize filename of English PDF (remove -EN.pdf suffix, replace _ with /)
2. title: title[].find(t => t.lang === "en").value
3. date: record.date field
4. languages: extract all unique lang codes from files[] array
5. pdfUrl: https://digitallibrary.un.org/record/{recid}/files/{english_pdf_filename}

## Import Process
1. Use pdfUrl (English PDF) for download — NOT the record detail page URL
2. Filename: normalize symbol as filename (e.g., S_RES_2319_2016-EN.pdf)
3. Classification: Security Council Resolution
4. Key entities to extract:
   - Resolution number and year (from symbol S/RES/NNNN(YYYY))
   - Adoption date
   - Operative clauses (OP1, OP2, ...)
   - Preambular paragraphs
   - Topic/subject area
   - Voting record (if present)
   - Referenced earlier resolutions

## Document Classification
- Type: Security Council Resolution
- Body: Security Council (SC)
- Topic: derived from title and operative clauses
- Series: S/RES/

## Notes
- The UNDL Invenio search API uses async processing (HTTP 202) and may require retries
- Arabic files often appear first in files[] — always prefer English version
- Some records may only have Arabic or multi-language versions without English
`;

async function main() {
  const session = driver.session();
  const now = new Date().toISOString();

  // Find all DL sources and update their configs
  const dlRows = await session.run(
    `MATCH (s:SourceCatalog)
     WHERE s.config CONTAINS 'digitallibrary.un.org'
     RETURN s.id as id, s.name as name, s.config as config`
  );

  console.log(`Found ${dlRows.records.length} DL sources`);

  for (const rec of dlRows.records) {
    const id   = rec.get('id');
    const name = rec.get('name');
    let cfg;
    try { cfg = JSON.parse(rec.get('config') || '{}'); } catch { cfg = {}; }

    // Add pagination params for Invenio (jrec = 1-based offset, rg = page size)
    cfg.pageParam      = 'jrec';
    cfg.limitParam     = 'rg';
    cfg.pageParamStyle = 'offset-1';

    // Ensure rg is NOT in queryParams (conflicts with limitParam)
    if (cfg.queryParams?.rg) delete cfg.queryParams.rg;

    await session.run(
      `MATCH (s:SourceCatalog {id: $id}) SET s.config = $cfg, s.updatedAt = $now`,
      { id, cfg: JSON.stringify(cfg), now }
    );
    console.log(`Updated config for: ${name}`);
  }

  // Save methodology to Security Council source
  const scRows = await session.run(
    `MATCH (s:SourceCatalog) WHERE s.name CONTAINS 'Security Council' RETURN s.id as id, s.name as name`
  );

  if (scRows.records.length) {
    const scId = scRows.records[0].get('id');
    const scName = scRows.records[0].get('name');
    await session.run(
      `MATCH (s:SourceCatalog {id: $id}) SET s.methodology = $m, s.updatedAt = $now`,
      { id: scId, m: SC_METHODOLOGY, now }
    );
    console.log(`Saved methodology to: ${scName}`);
  } else {
    console.log('Security Council source not found');
  }

  await session.close();
  await driver.close();
  console.log('Done.');
}

main().catch(e => { console.error(e.message); process.exit(1); });

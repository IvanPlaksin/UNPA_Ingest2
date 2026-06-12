'use strict';
const neo4j = require('neo4j-driver');

async function main() {
  const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('memgraph', 'secret_password_123'));
  const session = driver.session();
  try {
    // First, find the UNDL source
    const result = await session.run(
      `MATCH (s:SourceCatalog) WHERE s.config CONTAINS 'digitallibrary' OR s.name CONTAINS 'Digital Library' OR s.name CONTAINS 'UNDL' RETURN s.id, s.name, s.config, s.description LIMIT 5`
    );
    console.log('UNDL sources found:');
    result.records.forEach(r => {
      console.log(JSON.stringify({ id: r.get('s.id'), name: r.get('s.name'), description: r.get('s.description') }, null, 2));
    });

    if (result.records.length > 0) {
      const methodology = `Enrichment methodology: MARCXML via https://digitallibrary.un.org/record/{recid}/export/xm? (WAF-safe, no auth). Extracted fields: recid(001), langCodes(041-split), symbol(191/a), seriesSymbol(191/b), sessionNumber(191/c), normalizedSymbols(191/q), sessionSymbol(191/r), fullTitle(239), title(245), publication(260), dateIssued(269), extent(300), corpSubjects(610), subjects(650), bodies(710), files(856), callNum(930), bodyName(981), hierarchy(989), agendaItems(991/a,b,c+d), dateAdopted(992), relatedDocs(993), votingRecord(996), lastModified(005), systemControlNumber(035), documentClass(091), recordType(980).`;
      const now = new Date().toISOString();

      for (const rec of result.records) {
        const sourceId = rec.get('s.id');
        await session.run(
          `MATCH (s:SourceCatalog {id: $id}) SET s.enrichmentMethodology = $m, s.updatedAt = $now`,
          { id: sourceId, m: methodology, now }
        );
        console.log('Updated methodology for source:', sourceId, rec.get('s.name'));
      }
    } else {
      console.log('No UNDL source found in SourceCatalog.');
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch(console.error);

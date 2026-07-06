'use strict';
/**
 * MARC21 XML parsing + UN Digital Library record fetch.
 * Extracted verbatim from source-catalog-enrichment.service.js so the UNDL/ODS
 * adapters and the enrichment service share one implementation.
 */

const { axios, httpsAgent } = require('./http');

/**
 * Parse a MARC21 XML string → structured metadata object (regex-based, no deps).
 */
function parseMarcXml(xml) {
  const decode = s => s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .trim();

  const getFields = (tag) => {
    const results = [];
    const fieldRe = new RegExp(
      `<datafield[^>]+tag="${tag}"([^>]*)>([\\s\\S]*?)<\\/datafield>`, 'g'
    );
    let fm;
    while ((fm = fieldRe.exec(xml)) !== null) {
      const attrs = fm[1];
      const body  = fm[2];
      const ind1  = (attrs.match(/ind1="([^"]*)"/) || [])[1] || ' ';
      const ind2  = (attrs.match(/ind2="([^"]*)"/) || [])[1] || ' ';
      const subs  = {};
      const sfRe  = /<subfield code="([^"]+)">([\s\S]*?)<\/subfield>/g;
      let sfm;
      while ((sfm = sfRe.exec(body)) !== null) {
        const code = sfm[1];
        const val  = decode(sfm[2]);
        if (!subs[code]) subs[code] = [];
        subs[code].push(val);
      }
      results.push({ ind1, ind2, ...subs });
    }
    return results;
  };

  const first   = (fields, code) => fields[0]?.[code]?.[0] || '';
  const allVals = (fields, code) => fields.flatMap(f => f[code] || []).filter(Boolean);

  const ctrlMatch = /<controlfield tag="001">([\s\S]*?)<\/controlfield>/.exec(xml);
  const recidCtrl = ctrlMatch ? ctrlMatch[1].trim() : '';

  const lastModMatch = /<controlfield tag="005">([\s\S]*?)<\/controlfield>/.exec(xml);
  const lastModifiedRaw = lastModMatch ? lastModMatch[1].trim() : '';
  const lastModified = lastModifiedRaw.length >= 8
    ? `${lastModifiedRaw.slice(0,4)}-${lastModifiedRaw.slice(4,6)}-${lastModifiedRaw.slice(6,8)}`
    : '';

  const f041 = getFields('041');
  const f191 = getFields('191');
  const f239 = getFields('239');
  const f245 = getFields('245');
  const f260 = getFields('260');
  const f269 = getFields('269');
  const f300 = getFields('300');
  const f520 = getFields('520');
  const f610 = getFields('610');
  const f650 = getFields('650');
  const f710 = getFields('710');
  const f856 = getFields('856');
  const f035 = getFields('035');
  const f091 = getFields('091');
  const f930 = getFields('930');
  const f980 = getFields('980');
  const f981 = getFields('981');
  const f989 = getFields('989');
  const f991 = getFields('991');
  const f992 = getFields('992');
  const f993 = getFields('993');
  const f996 = getFields('996');

  const symbol            = allVals(f191, 'a').join('; ');
  const seriesSymbol      = first(f191, 'b');
  const sessionNumber     = first(f191, 'c');
  const normalizedSymbols = allVals(f191, 'q');
  const sessionSymbol     = first(f191, 'r');

  const systemControlNumber = allVals(f035, 'a').join('; ');
  const documentClass       = first(f091, 'a');
  const recordType          = first(f980, 'a');
  const fullTitle    = allVals(f239, 'a').join(' ');
  const titleMain    = allVals(f245, 'a').map(s => s.replace(/\s*\/$/, '').trim()).join(' ');
  const titleSub     = allVals(f245, 'b').map(s => s.replace(/[,;]$/, '').trim()).join(' ');
  const titleStmt    = allVals(f245, 'c').join(' ');
  const pubPlace     = allVals(f260, 'a').map(s => s.replace(/[,:]$/, '').trim()).join(', ');
  const publisher    = allVals(f260, 'b').map(s => s.replace(/[,;]$/, '').trim()).join(', ');
  const pubDateStr   = allVals(f260, 'c').map(s => s.replace(/[,;.]$/, '').trim()).join(', ');
  const dateIssued   = first(f269, 'a');
  const dateAdopted  = first(f992, 'a');
  const extent       = allVals(f300, 'a').join('; ');
  const noteAbstract = allVals(f520, 'a').join(' ');
  const corpSubjects = allVals(f610, 'a');
  const subjects     = allVals(f650, 'a');
  const bodies       = allVals(f710, 'a');
  const bodyName     = first(f981, 'a');
  const callNum      = allVals(f930, 'a').join(', ');
  const votingRecord = allVals(f996, 'a').join('; ');
  const langCodes    = allVals(f041, 'a').flatMap(v => {
    const codes = [];
    for (let i = 0; i + 3 <= v.length; i += 3) codes.push(v.slice(i, i + 3));
    return codes.length > 0 ? codes : [v];
  });

  const files = f856
    .filter(f => f.u?.[0])
    .map(f => ({
      lang:     f.y?.[0] || '',
      url:      f.u?.[0] || '',
      name:     (f.u?.[0] || '').split('/').pop().split('?')[0] || '',
      size:     parseInt(f.s?.[0] || '0', 10) || 0,
      fileType: f.q?.[0] || 'pdf',
    }));

  const hierarchySet = new Set();
  for (const f of f989) {
    for (const code of ['a', 'b', 'c']) {
      if (f[code]) f[code].forEach(v => v && hierarchySet.add(v));
    }
  }
  const hierarchy = [...hierarchySet];

  const agendaItems = f991
    .map(f => ({
      symbol:    f.a?.[0] || '',
      item:      f.b?.[0] || '',
      situation: f.d?.[0] || f.c?.[0] || '',
    }))
    .filter(a => a.symbol || a.situation);

  const relatedDocs = f993
    .filter(f => f.a?.[0])
    .map(f => ({
      type:   f.ind1 === '2' ? 'draft' : f.ind1 === '4' ? 'verbatim' : 'related',
      symbol: f.a[0],
    }));

  const draftDoc       = relatedDocs.find(r => r.type === 'draft')?.symbol || '';
  const verbatimRecord = relatedDocs.find(r => r.type === 'verbatim')?.symbol || '';

  const abstract = noteAbstract
    || [fullTitle, titleStmt].filter(Boolean).join(' ')
    || titleMain
    || '';

  const marcData = {
    recid:          recidCtrl,
    symbol,
    fullTitle,
    titleMain,
    titleSub,
    titleStmt,
    pubPlace,
    publisher,
    pubDate:        pubDateStr,
    dateIssued,
    dateAdopted,
    extent,
    langCodes,
    corpSubjects,
    subjects,
    bodies,
    bodyName,
    callNum,
    votingRecord,
    draftDoc,
    verbatimRecord,
    agendaItems,
    relatedDocs,
    hierarchy,
    files,
    lastModified,
    systemControlNumber,
    documentClass,
    recordType,
    seriesSymbol,
    sessionNumber,
    normalizedSymbols,
    sessionSymbol,
  };

  return {
    abstract,
    subjects,
    bodies,
    reportNumbers: symbol ? [symbol] : [],
    notes:         [votingRecord, callNum].filter(Boolean),
    collections:   hierarchy,
    marcData,
  };
}

/**
 * Fetch a UN Digital Library record as MARC21 XML and parse it.
 * The /export/xm? endpoint is WAF-safe and needs no auth.
 * Returns the parsed metadata object, or null on failure.
 */
async function fetchUNDLRecord(recid, logPrefix = '[MARC]') {
  const recordUrl = `https://digitallibrary.un.org/record/${recid}/export/xm?`;
  let resp;
  try {
    resp = await axios.get(recordUrl, {
      httpsAgent,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://digitallibrary.un.org/',
      },
    });
  } catch (err) {
    console.warn(`${logPrefix} MARCXML fetch failed for recid ${recid}: ${err.message}`);
    return null;
  }

  if (!resp || resp.status !== 200) return null;
  const xml = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
  if (!xml.includes('<datafield')) {
    console.warn(`${logPrefix} No MARC data in response for recid ${recid}`);
    return null;
  }

  try {
    return parseMarcXml(xml);
  } catch (err) {
    console.warn(`${logPrefix} MARCXML parse error for recid ${recid}: ${err.message}`);
    return null;
  }
}

module.exports = { parseMarcXml, fetchUNDLRecord };

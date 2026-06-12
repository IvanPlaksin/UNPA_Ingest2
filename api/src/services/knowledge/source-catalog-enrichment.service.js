'use strict';
/**
 * SourceCatalogEnrichmentService
 *
 * Fetches full MARCXML metadata for SourceDocument nodes from their source.
 * Runs in background; reports progress via EventEmitter so the SSE route
 * can stream it to the frontend.
 *
 * For UN Digital Library sources fetches:
 *   https://digitallibrary.un.org/record/{recid}/export/xm?
 * which returns MARC21 XML and is not blocked by WAF.
 */

const EventEmitter = require('events');
const axios        = require('axios');
const https        = require('https');
const { v4: uuidv4, v5: uuidv5 } = require('uuid');

const LOG_PREFIX = '[SourceEnrich]';

const SOURCE_DOC_NS = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const httpsAgent    = new https.Agent({ rejectUnauthorized: false });

// In-memory job registry — keyed by jobId
const _jobs = new Map();
setInterval(() => {
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, job] of _jobs.entries()) {
    if (job.startedAt < cutoff) _jobs.delete(id);
  }
}, 5 * 60_000);

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

let _sourceSvc = null;
function sourceSvc() {
  if (!_sourceSvc) _sourceSvc = require('./source-catalog.service').sourceCatalogService;
  return _sourceSvc;
}

const progressEmitter = new EventEmitter();
progressEmitter.setMaxListeners(100);

// ── MARC21 XML parser ─────────────────────────────────────────

/**
 * Parse MARC21 XML string → structured metadata object.
 * Uses regex — no external dependencies.
 */
function parseMarcXml(xml) {
  const decode = s => s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .trim();

  // Collect all datafields for a given 3-digit tag
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

  // 005: last modified date
  const lastModMatch = /<controlfield tag="005">([\s\S]*?)<\/controlfield>/.exec(xml);
  const lastModifiedRaw = lastModMatch ? lastModMatch[1].trim() : '';
  // Format "20240304120904.0" → "2024-03-04"
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

  // Files from 856
  const files = f856
    .filter(f => f.u?.[0])
    .map(f => ({
      lang:     f.y?.[0] || '',
      url:      f.u?.[0] || '',
      name:     (f.u?.[0] || '').split('/').pop().split('?')[0] || '',
      size:     parseInt(f.s?.[0] || '0', 10) || 0,
      fileType: f.q?.[0] || 'pdf',
    }));

  // Collection hierarchy from 989
  const hierarchySet = new Set();
  for (const f of f989) {
    for (const code of ['a', 'b', 'c']) {
      if (f[code]) f[code].forEach(v => v && hierarchySet.add(v));
    }
  }
  const hierarchy = [...hierarchySet];

  // Agenda items from 991 — subfield d takes priority over c for situation
  const agendaItems = f991
    .map(f => ({
      symbol:    f.a?.[0] || '',
      item:      f.b?.[0] || '',
      situation: f.d?.[0] || f.c?.[0] || '',
    }))
    .filter(a => a.symbol || a.situation);

  // Related documents from 993 (ind1=2 → draft, ind1=4 → verbatim)
  const relatedDocs = f993
    .filter(f => f.a?.[0])
    .map(f => ({
      type:   f.ind1 === '2' ? 'draft' : f.ind1 === '4' ? 'verbatim' : 'related',
      symbol: f.a[0],
    }));

  const draftDoc       = relatedDocs.find(r => r.type === 'draft')?.symbol || '';
  const verbatimRecord = relatedDocs.find(r => r.type === 'verbatim')?.symbol || '';

  // Abstract: prefer explicit 520, otherwise build from 239/245
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
    // new fields
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

// ── UN Digital Library — fetch via MARCXML ────────────────────

async function _fetchUNDLRecord(recid) {
  const url = `https://digitallibrary.un.org/record/${recid}/export/xm?`;
  let resp;
  try {
    resp = await axios.get(url, {
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
    console.warn(`${LOG_PREFIX} MARCXML fetch failed for recid ${recid}: ${err.message}`);
    return null;
  }

  if (!resp || resp.status !== 200) return null;
  const xml = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
  if (!xml.includes('<datafield')) {
    console.warn(`${LOG_PREFIX} No MARC data in response for recid ${recid}`);
    return null;
  }

  try {
    return parseMarcXml(xml);
  } catch (err) {
    console.warn(`${LOG_PREFIX} MARCXML parse error for recid ${recid}: ${err.message}`);
    return null;
  }
}

async function _fetchGenericMetadata(_url, _cfg) {
  return null;
}

// ── Core enrichment ───────────────────────────────────────────

class SourceCatalogEnrichmentService {

  getProgressEmitter() { return progressEmitter; }

  startEnrichBatch(sourceId, items) {
    const jobId = uuidv4();
    const job = {
      jobId,
      sourceId,
      startedAt: Date.now(),
      total:  items.length,
      done:   0,
      errors: 0,
      items:  items.map(it => ({ id: it.id, title: it.title || it.id, status: 'pending', enriched: null })),
    };
    _jobs.set(jobId, job);

    this._runBatch(jobId, sourceId, items).catch(err => {
      console.error(`${LOG_PREFIX} batch error: ${err.message}`);
      progressEmitter.emit(`enrich:${jobId}`, { type: 'error', error: err.message });
    });

    return jobId;
  }

  getJob(jobId) {
    return _jobs.get(jobId) || null;
  }

  subscribeToProgress(jobId, callback) {
    const key = `enrich:${jobId}`;
    progressEmitter.on(key, callback);
    return () => progressEmitter.off(key, callback);
  }

  async _runBatch(jobId, sourceId, items) {
    const source = await sourceSvc().get(sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    const job  = _jobs.get(jobId);
    const emit = (type, extra = {}) =>
      progressEmitter.emit(`enrich:${jobId}`, { type, jobId, ...extra });

    emit('start', { total: items.length, sourceName: source.name });

    for (let i = 0; i < items.length; i++) {
      const item    = items[i];
      const jobItem = job.items[i];
      jobItem.status = 'fetching';
      emit('item-start', { index: i, id: item.id, title: item.title || item.id });

      try {
        const enriched = await this._enrichOne(source, item);
        jobItem.status   = 'done';
        jobItem.enriched = enriched;
        job.done++;

        if (enriched) {
          await this._saveEnriched(sourceId, item, enriched);
        }

        emit('item-done', {
          index:   i,
          id:      item.id,
          title:   item.title || item.id,
          enriched: !!enriched,
          fields:  enriched ? Object.keys(enriched).filter(k => {
            const v = enriched[k];
            return Array.isArray(v) ? v.length > 0 : Boolean(v);
          }) : [],
          done:  job.done,
          total: job.total,
        });
      } catch (err) {
        jobItem.status = 'error';
        jobItem.error  = err.message;
        job.errors++;
        job.done++;
        emit('item-error', {
          index: i, id: item.id, title: item.title || item.id,
          error: err.message, done: job.done, total: job.total,
        });
      }
    }

    emit('complete', { done: job.done, errors: job.errors, total: job.total });
    console.log(`${LOG_PREFIX} batch ${jobId} done: ${job.done}/${job.total} (${job.errors} errors)`);
  }

  async _enrichOne(source, item) {
    const recid = item.metadata?.recid || item.externalId;
    const isDlSource = source.config?.endpoint?.includes('digitallibrary.un.org')
                    || (source.type === 'REST_API' && source.config?.endpoint?.includes('digitallibrary'));

    if (isDlSource && recid) {
      return _fetchUNDLRecord(recid);
    }

    return _fetchGenericMetadata(item.url, source.config);
  }

  async _saveEnriched(sourceId, item, enriched) {
    if (!enriched) return;

    // Use same externalId logic as _saveSourceDocuments: url takes priority
    // so the uuidv5 docId is consistent across save and enrich
    const externalId = item.url || item.metadata?.recid || item.externalId || item.id;
    const docId = uuidv5(`${sourceId}::${externalId}`, SOURCE_DOC_NS);

    const now    = new Date().toISOString();
    const sets   = [];
    const params = { docId, now };

    if (enriched.abstract)              { sets.push('d.abstract = $abstract');  params.abstract  = enriched.abstract; }
    if (enriched.subjects?.length)      { sets.push('d.subjects = $subjects');  params.subjects  = JSON.stringify(enriched.subjects); }
    if (enriched.bodies?.length)        { sets.push('d.bodies = $bodies');      params.bodies    = JSON.stringify(enriched.bodies); }
    if (enriched.reportNumbers?.length) { sets.push('d.reportNumbers = $rn');   params.rn        = JSON.stringify(enriched.reportNumbers); }
    if (enriched.notes?.length)         { sets.push('d.notes = $notes');        params.notes     = JSON.stringify(enriched.notes); }
    if (enriched.collections?.length)   { sets.push('d.collections = $cols');   params.cols      = JSON.stringify(enriched.collections); }
    if (enriched.marcData)              { sets.push('d.marcData = $marcData');   params.marcData  = JSON.stringify(enriched.marcData); }

    const hasData = enriched.marcData?.symbol
      || enriched.abstract
      || enriched.subjects?.length
      || enriched.marcData?.files?.length;
    sets.push('d.enrichStatus = $enrichStatus', 'd.enrichedAt = $now');
    params.enrichStatus = hasData ? 'full' : 'partial';

    if (sets.length < 2) return;

    await mg().runQuery(
      `MATCH (d:SourceDocument {id: $docId})
       SET ${sets.join(', ')}`,
      params
    ).catch(err => console.warn(`${LOG_PREFIX} save enriched failed: ${err.message}`));
  }

  /** Public wrapper — allows external callers (e.g. document refetch endpoint) to use the UNDL MARC fetcher. */
  async fetchMarcRecord(recid) {
    return _fetchUNDLRecord(recid);
  }
}

const sourceCatalogEnrichmentService = new SourceCatalogEnrichmentService();
module.exports = { sourceCatalogEnrichmentService };

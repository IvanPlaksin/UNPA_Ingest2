'use strict';
/**
 * OaiPmhAdapter — family base for OAI-PMH repositories (bulk harvest protocol).
 *
 * OAI-PMH is the RIGHT way to bulk-harvest large Invenio repositories (UN Digital
 * Library / ODS): unlike the `of=recjson&jrec=` search — which clamps/repeats past
 * ~1000 records — OAI walks the whole corpus via opaque `resumptionToken`s and
 * reports the exact `completeListSize`.
 *
 * Paging is TOKEN-based (not numeric): the first call issues
 *   verb=ListRecords&metadataPrefix=<prefix>[&set=..][&from=..]
 * and each subsequent call passes the previous response's resumptionToken. The
 * caller stores that token as the source's cursor (see the indexer's token-cursor
 * support). marcxml records are parsed for symbol (191$a), title (245$a), recid
 * (001) and file URLs (856$u); a `symbolPrefix` config narrows a shared feed to a
 * scope (GA=`A/`, SC=`S/`, ECOSOC=`E/`, …) client-side.
 *
 * The endpoint throttles aggressively ("Retry after N seconds") — requests are
 * retried transparently with the advertised delay.
 */

const { SourceAdapter } = require('../base.adapter');
const { axios, httpsAgent, BROWSER_HEADERS } = require('../lib/http');
const { parseOaiPmhRecords, normalizeSymbol, findEnglishPdf, getExt } = require('../lib/parse');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

class OaiPmhAdapter extends SourceAdapter {
  static key    = 'oai-pmh';
  static family = 'oai-pmh';
  static capabilities = ['search', 'browseAll', 'paginate', 'resumptionPaging', 'download'];
  static downloadMode = 'record-page';

  /**
   * Fetch one OAI ListRecords page. When `resumptionToken` is given, continues an
   * in-progress harvest; otherwise starts a fresh one.
   * @returns {{results, total, totalExact, nextToken, hasMore, resumptionPaging:true}}
   */
  async search({ query = '', page = 1, limit = 100, filters = {}, resumptionToken = null, cursorToken = null, fromDate = null } = {}) {
    const cfg = this.config;
    if (!cfg.endpoint) throw new Error('OAI-PMH endpoint not configured');
    const token = resumptionToken || cursorToken || null;
    const prefix = cfg.metadataPrefix || 'oai_dc';

    let url;
    if (token) {
      // resumptionToken is exclusive — no other args allowed by the protocol.
      url = `${cfg.endpoint}?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
    } else {
      const p = new URLSearchParams({ verb: 'ListRecords', metadataPrefix: prefix });
      if (cfg.set) p.set('set', cfg.set);
      // Incremental harvest: `fromDate` (the last successful harvest datestamp)
      // makes OAI return ONLY records added/modified since — so a restart/re-open
      // resumes instead of re-walking the whole feed from the start.
      const from = fromDate || (this.supports('filter') && filters.dateFrom) || cfg.from;
      if (from) p.set('from', from);
      const until = (this.supports('filter') && filters.dateTo) || cfg.until;
      if (until) p.set('until', until);
      url = `${cfg.endpoint}?${p.toString()}`;
    }

    const xml = await this._fetchWithRetry(url);

    // OAI protocol error. `noRecordsMatch` is a legitimate empty result (end);
    // any other error (esp. badResumptionToken — an expired token) must NOT be
    // mistaken for end-of-feed. Throw so the caller retries / restarts the walk.
    const errM = /<error[^>]*code="([^"]+)"[^>]*>/i.exec(xml);
    if (errM && errM[1] !== 'noRecordsMatch') {
      const e = new Error(`OAI error: ${errM[1]}`); e.oaiError = errM[1]; throw e;
    }

    const parsed = prefix === 'marcxml'
      ? this._parseMarcListRecords(xml)
      : this._parseDcListRecords(xml);

    // Guard against a malformed/throttled body slipping through as a false "end":
    // a real response either carries records or an explicit resumptionToken element
    // (empty = genuine end) or a noRecordsMatch error. Anything else → retry.
    if (!parsed.records.length && !parsed.hadTokenElement && !(errM && errM[1] === 'noRecordsMatch')) {
      // Almost always a throttle/challenge body that slipped through — TRANSIENT.
      // Word it as a throttle so the error taxonomy classifies it RATE_LIMITED
      // (backoff + retry), NOT PARSE_ERROR (which would wrongly quarantine the source).
      throw new Error('OAI-PMH throttled — empty response (no records, no resumptionToken), retrying');
    }

    let results = parsed.records;
    if (cfg.symbolPrefix) {
      const pref = String(cfg.symbolPrefix).toUpperCase();
      results = results.filter(r => r.symbol && r.symbol.toUpperCase().startsWith(pref));
    }
    // The query arg (used by the manual "search" UI) filters by title substring.
    if (query) {
      const q = query.toLowerCase();
      results = results.filter(r => (r.title || '').toLowerCase().includes(q) || (r.symbol || '').toLowerCase().includes(q));
    }

    return {
      results,
      total: Number.isFinite(parsed.completeListSize) ? parsed.completeListSize : results.length,
      totalExact: Number.isFinite(parsed.completeListSize) && !cfg.symbolPrefix, // scoped total is unknown until walked
      nextToken: parsed.nextToken || null,
      hasMore: !!parsed.nextToken,
      maxDatestamp: parsed.maxDatestamp || null,   // newest OAI header datestamp on this page (incremental checkpoint)
      resumptionPaging: true,
    };
  }

  /**
   * True document count for the source. The OAI feed only exposes a recent subset
   * (UN Digital Library OAI earliestDatestamp is 2017), so its completeListSize is
   * NOT the corpus size. When a `count` config points at the underlying Invenio
   * search, read the authoritative hit count from its `of=hb` HTML ("N records
   * found") — e.g. ECOSOC `191__b:"E/"` → ~172,886. Falls back to the OAI
   * completeListSize (a lower bound) only when no count query is configured.
   */
  async count() {
    const cc = this.config.count;
    if (cc && cc.endpoint) {
      try {
        // Fetch the Invenio search `of=hb` HTML directly (browser-like, 202/WAF
        // retry) — NOT via the OAI-XML _fetchWithRetry, whose XML Accept header +
        // strict throttle heuristics get blocked by the HTML search endpoint.
        const params = { of: 'hb', rg: 1, ln: cc.ln || 'en' };
        if (cc.query) params[cc.searchParam || 'p'] = cc.query;
        // NOTE: use the DEFAULT axios UA — the digitallibrary.un.org AWS-WAF
        // returns a 202 challenge for a browser-like User-Agent but serves the
        // page for the plain client UA (verified empirically).
        const axConf = { method: 'GET', url: cc.endpoint, params, timeout: 30000, httpsAgent, headers: { ...(cc.headers || {}) }, responseType: 'text', validateStatus: () => true };
        let resp = await axios(axConf); let tries = 0;
        while (resp.status === 202 && tries < 5) { await sleep(1500); resp = await axios(axConf); tries++; }
        const html = typeof resp.data === 'string' ? resp.data : '';
        const m = html.match(/<strong>\s*([\d,]+)\s*<\/strong>\s*records?\s+found/i);
        if (m) return { total: parseInt(m[1].replace(/,/g, ''), 10), exact: true, method: 'api' };
      } catch { /* fall through to OAI size */ }
    }
    if (this.config.symbolPrefix) return null;           // a scoped slice's size is unknown up-front
    const prefix = this.config.metadataPrefix || 'oai_dc';
    const p = new URLSearchParams({ verb: 'ListRecords', metadataPrefix: prefix });
    if (this.config.set) p.set('set', this.config.set);
    const xml = await this._fetchWithRetry(`${this.config.endpoint}?${p.toString()}`);
    const parsed = prefix === 'marcxml' ? this._parseMarcListRecords(xml) : this._parseDcListRecords(xml);
    return Number.isFinite(parsed.completeListSize) ? { total: parsed.completeListSize, exact: true, method: 'api' } : null;
  }

  // ── HTTP with throttle-aware retry ─────────────────────────────

  async _fetchWithRetry(url, maxRetries = 6) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let resp;
      try {
        resp = await axios.get(url, {
          timeout: 30000, httpsAgent, responseType: 'text',
          headers: { 'User-Agent': 'Mozilla/5.0 UNPA/1.0', 'Accept': 'application/xml, text/xml, */*' },
          validateStatus: () => true,
        });
      } catch (e) { lastErr = e; await sleep(2000); continue; }

      const body = typeof resp.data === 'string' ? resp.data : '';
      // OAI throttle: a tiny body or a "Retry after N seconds" message.
      const rm = /retry after\s+(\d+)\s*second/i.exec(body);
      if (resp.status === 503 || rm || body.length < 200) {
        const wait = rm ? (parseInt(rm[1], 10) * 1000 + 250) : 2000;
        await sleep(Math.min(wait, 10000));
        continue;
      }
      return body;
    }
    throw lastErr || new Error('OAI-PMH throttled — exhausted retries');
  }

  // ── parsing ────────────────────────────────────────────────────

  _extractEnvelope(xml) {
    // Match both <resumptionToken ...>TOKEN</resumptionToken> and a self-closing
    // <resumptionToken/> (some repos emit the latter at end-of-list).
    const tokenM = /<resumptionToken\b[^>]*>([^<]*)<\/resumptionToken>/i.exec(xml);
    const hadTokenElement = tokenM != null || /<resumptionToken\b[^>]*\/>/i.test(xml);
    const sizeM = /completeListSize="(\d+)"/i.exec(xml);
    return {
      nextToken: tokenM && tokenM[1] ? tokenM[1].trim() : null,
      hadTokenElement,
      completeListSize: sizeM ? parseInt(sizeM[1], 10) : NaN,
    };
  }

  /** Parse a marcxml ListRecords response (marc: namespace). */
  _parseMarcListRecords(xml) {
    const { nextToken, completeListSize, hadTokenElement } = this._extractEnvelope(xml);
    const host = (this.config.recordHost || (this.config.endpoint || '').replace(/\/oai2d.*$/, '')) || '';
    const records = [];
    let maxDatestamp = null;
    const recRe = /<record>([\s\S]*?)<\/record>/gi;
    let rm;
    while ((rm = recRe.exec(xml)) !== null) {
      const rec = rm[1];
      // Track the newest OAI header datestamp — the incremental-harvest checkpoint.
      const dsM = /<datestamp>([^<]+)<\/datestamp>/i.exec(rec);
      if (dsM && (!maxDatestamp || dsM[1] > maxDatestamp)) maxDatestamp = dsM[1];
      if (/<header[^>]+status="deleted"/i.test(rec)) continue;
      const recid = this._mcf(rec, '001');
      const symbol = normalizeSymbol(this._mdf(rec, '191', 'a') || '');
      const rawTitle = this._mdf(rec, '245', 'a') || this._mdf(rec, '245', 'b') || '';
      const title = rawTitle.replace(/\s*[\/:]\s*$/, '').trim().substring(0, 200);
      const fileUrls = this._mdfAll(rec, '856', 'u').filter(u => /^https?:\/\//i.test(u));
      const files = fileUrls.map(u => ({ url: u, name: u.split('/').pop() }));
      const pdfUrl = findEnglishPdf(files, recid) || fileUrls.find(u => /\.pdf($|\?)/i.test(u)) || '';
      const date = this._mdf(rec, '269', 'a') || this._mdf(rec, '260', 'c') || this._year(this._mcf(rec, '008')) || '';
      const langRaw = this._mdf(rec, '041', 'a') || '';
      const languages = (langRaw.match(/.{1,3}/g) || []).map(s => s.toUpperCase()).filter(s => s.length === 3);
      const url = recid && host ? `${host}/record/${recid}` : (fileUrls[0] || '');
      if (!url && !symbol) continue;
      records.push({
        title: title || symbol || 'Untitled',
        symbol: symbol || undefined,
        url,
        pdfUrl: pdfUrl || undefined,
        fileType: pdfUrl ? 'pdf' : (getExt(url) || 'html'),
        date: date || null,
        languages: languages.length ? languages : undefined,
        metadata: { recid, files: files.slice(0, 12) },
      });
    }
    return { records, nextToken, completeListSize, hadTokenElement, maxDatestamp };
  }

  /** Parse an oai_dc ListRecords response (Dublin Core). */
  _parseDcListRecords(xml) {
    const { nextToken, completeListSize, hadTokenElement } = this._extractEnvelope(xml);
    return { records: parseOaiPmhRecords(xml, ''), nextToken, completeListSize, hadTokenElement };
  }

  // MARC helpers (marc: namespace, regex-based like the rest of the lib).
  _mcf(rec, tag) {
    const m = new RegExp(`<marc:controlfield tag="${tag}">([^<]*)</marc:controlfield>`, 'i').exec(rec);
    return m ? m[1].trim() : '';
  }
  _mdf(rec, tag, code) { return this._mdfAll(rec, tag, code)[0] || ''; }
  _mdfAll(rec, tag, code) {
    const out = [];
    const dfRe = new RegExp(`<marc:datafield tag="${tag}"[^>]*>([\\s\\S]*?)</marc:datafield>`, 'gi');
    let dm;
    while ((dm = dfRe.exec(rec)) !== null) {
      const sm = new RegExp(`<marc:subfield code="${code}">([^<]*)</marc:subfield>`, 'i').exec(dm[1]);
      if (sm) out.push(sm[1].trim());
    }
    return out;
  }
  _year(cf008) { const m = /^\d{6}[a-z](\d{4})/i.exec(cf008 || ''); return m ? m[1] : ''; }
}

module.exports = { OaiPmhAdapter };

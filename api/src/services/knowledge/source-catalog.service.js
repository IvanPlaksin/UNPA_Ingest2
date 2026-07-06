'use strict';
/**
 * SourceCatalogService
 *
 * Catalog of external information sources for document discovery.
 * Each entry describes how to browse / search an external repository and can
 * import found files directly into the Documents pipeline.
 *
 * Browsing, per-record enrichment and download resolution are delegated to a
 * capability-based adapter (see ./source-adapters). The service keeps CRUD,
 * the SourceDocument cache, enrichment overlay, and the import pipeline.
 *
 * Supported source types:
 *   URL_CATALOG  — HTML page with document links (link scraping)
 *   REST_API     — Generic REST/JSON API (configurable response mapping)
 *   RSS_FEED     — RSS or Atom feed
 *   ODS_API      — UN Official Document System (documents.un.org)
 *   OIOS_PORTAL  — UN OIOS Reports portal
 *   OAI_PMH      — OAI-PMH protocol (ECLAC, ESCAP, etc.)
 */

const { v4: uuidv4, v5: uuidv5 } = require('uuid');
const path   = require('path');
const url    = require('url');

const { axios, httpsAgent }  = require('./source-adapters/lib/http');
const { parseConfig, serializeConfig } = require('./source-adapters/lib/parse');
const { parseUNSymbol }      = require('./source-adapters/lib/symbol-parser');
const { resolveAdapter }     = require('./source-adapters/registry');
const { normalizeCapabilities, normalizeFilterSchema } = require('./source-adapters/capabilities');

const LOG_PREFIX = '[SourceCatalog]';

const SOURCE_TYPES = ['URL_CATALOG', 'REST_API', 'RSS_FEED', 'ODS_API', 'OIOS_PORTAL', 'OAI_PMH'];

// Namespace for deterministic SourceDocument IDs (uuidv5)
const SOURCE_DOC_NS = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

/**
 * Flatten a UN symbol into the SourceDocument component property set.
 * Best-effort — returns the full key set (nulls when unparseable) so the
 * MERGE param object stays stable. Numeric components stored as plain numbers.
 */
function _sourceDocSymbolComponents(symbol) {
  const blank = {
    organCode: null, seriesCode: null, subBody: null,
    sessionNumber: null, documentNumber: null, documentYear: null,
    baseSymbol: null, suffixType: null, suffixNumber: null
  };
  try {
    if (!symbol) return blank;
    const p = parseUNSymbol(symbol);
    if (!p || !p.organ) return blank;
    return {
      organCode:      p.organ || null,
      seriesCode:     p.series || null,
      subBody:        p.subBody || null,
      sessionNumber:  p.session,
      documentNumber: p.number,
      documentYear:   p.year,
      baseSymbol:     p.baseSymbol || null,
      suffixType:     p.suffixType || null,
      suffixNumber:   p.suffixNumber
    };
  } catch { return blank; }
}

// ── Main service ──────────────────────────────────────────────

class SourceCatalogService {

  // ─── CRUD ─────────────────────────────────────────────────────

  async create({ name, description = '', type, namespace = 'DEFAULT', config = {}, tags = [], methodology = '', capabilities = null, isDefault = false }) {
    if (!name) throw new Error('name is required');
    if (!SOURCE_TYPES.includes(type)) throw new Error(`Unknown type: ${type}`);

    const id  = uuidv4();
    const now = new Date().toISOString();
    await mg().runQuery(
      `CREATE (s:SourceCatalog {
         id: $id, name: $name, description: $desc,
         type: $type, namespace: $ns,
         config: $cfg, tags: $tags,
         methodology: $methodology,
         capabilities: $capabilities,
         enabled: true, documentCount: 0,
         isDefault: $isDefault,
         createdAt: $now, updatedAt: $now, lastBrowsedAt: null
       })`,
      { id, name, desc: description, type, ns: namespace,
        cfg: serializeConfig(config), tags: JSON.stringify(tags),
        methodology: methodology || '',
        capabilities: capabilities ? JSON.stringify(capabilities) : '',
        isDefault: isDefault === true, now }
    );
    console.log(`${LOG_PREFIX} Created "${name}" (${type})`);
    return this.get(id);
  }

  async list({ namespace, type, enabled } = {}) {
    const conds = [];
    const params = {};
    if (namespace) { conds.push('s.namespace = $ns'); params.ns = namespace; }
    if (type)      { conds.push('s.type = $type');    params.type = type; }
    if (enabled != null) { conds.push('s.enabled = $enabled'); params.enabled = enabled; }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog) ${where}
       RETURN ${this._returnFields()}
       ORDER BY s.name`,
      params
    );
    const formatted = rows.map(r => this._format(r));
    // Default source always first
    return formatted.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async get(id) {
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       RETURN ${this._returnFields()}`,
      { id }
    );
    if (!rows.length) return null;
    return this._format(rows[0]);
  }

  async update(id, updates) {
    const now = new Date().toISOString();
    const sets = ['s.updatedAt = $now'];
    const params = { id, now };

    if (updates.name         != null) { sets.push('s.name = $name');                params.name         = updates.name; }
    if (updates.description  != null) { sets.push('s.description = $desc');         params.desc         = updates.description; }
    if (updates.type         != null) { sets.push('s.type = $type');                params.type         = updates.type; }
    if (updates.namespace    != null) { sets.push('s.namespace = $ns');             params.ns           = updates.namespace; }
    if (updates.config       != null) { sets.push('s.config = $cfg');               params.cfg          = serializeConfig(updates.config); }
    if (updates.tags         != null) { sets.push('s.tags = $tags');                params.tags         = JSON.stringify(updates.tags); }
    if (updates.enabled      != null) { sets.push('s.enabled = $enabled');          params.enabled      = updates.enabled; }
    if (updates.methodology  != null) { sets.push('s.methodology = $methodology');  params.methodology  = updates.methodology; }
    if (updates.capabilities != null) { sets.push('s.capabilities = $capabilities');params.capabilities = typeof updates.capabilities === 'string' ? updates.capabilities : JSON.stringify(updates.capabilities); }
    if (updates.isDefault    != null) { sets.push('s.isDefault = $isDefault');      params.isDefault    = updates.isDefault === true; }

    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) SET ${sets.join(', ')}`,
      params
    );
    return this.get(id);
  }

  async setDefault(id) {
    await mg().runQuery(
      `MATCH (s:SourceCatalog) WHERE s.isDefault = true SET s.isDefault = false`,
      {}
    ).catch(() => {});
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) SET s.isDefault = true`,
      { id }
    );
    return this.get(id);
  }

  async getDefault() {
    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {isDefault: true})
       RETURN ${this._returnFields()}
       LIMIT 1`,
      {}
    );
    return rows.length ? this._format(rows[0]) : null;
  }

  async delete(id) {
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})-[:HAS_DOCUMENT]->(d:SourceDocument) DETACH DELETE d`,
      { id }
    ).catch(() => {});
    await mg().runQuery(`MATCH (s:SourceCatalog {id: $id}) DETACH DELETE s`, { id });
    return { deleted: true };
  }

  // ─── Capabilities ──────────────────────────────────────────────

  /**
   * Runtime capability descriptor for a source (the adapter is the source of
   * truth; the stored `capabilities` field is a UI cache).
   */
  async getCapabilities(id) {
    const source = await this.get(id);
    if (!source) return null;
    const adapter = resolveAdapter(source);
    return { sourceId: id, sourceName: source.name, type: source.type, ...adapter.getCapabilities() };
  }

  // ─── Browse ────────────────────────────────────────────────────

  async browse(id, { query = '', page = 1, limit = 20, filters = {}, sort = null } = {}) {
    const source = await this.get(id);
    if (!source) throw new Error(`Source not found: ${id}`);

    const adapter = resolveAdapter(source);
    const result  = await adapter.search({ query, page, limit, filters, sort });

    // Ensure every result item has a stable ID for frontend keying
    if (result.results) {
      result.results = result.results.map(item =>
        item.id ? item : { id: uuidv4(), ...item }
      );
    }

    // Cache discovered documents as SourceDocument nodes (async, non-blocking)
    if (result.results?.length) {
      this._saveSourceDocuments(id, result.results).catch(() => {});
    }

    // Merge enriched metadata (MARC data etc.) from previously enriched nodes
    if (result.results?.length) {
      result.results = await this._mergeEnrichedData(id, result.results);
    }

    // Update lastBrowsedAt
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id}) SET s.lastBrowsedAt = $now`,
      { id, now: new Date().toISOString() }
    ).catch(() => {});

    return {
      sourceId: id, sourceName: source.name, query, page, limit,
      filters, sort,
      capabilities: adapter.getCapabilities(),
      ...result,
    };
  }

  // ─── Source Document Cache ──────────────────────────────────────

  /**
   * Overlay enriched metadata (MARC fields etc.) from cached SourceDocument
   * nodes onto live browse results. Non-enriched items are returned unchanged.
   */
  async _mergeEnrichedData(sourceId, items) {
    const urls = items.map(r => r.url).filter(Boolean);
    if (!urls.length) return items;

    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $sourceId})-[:HAS_DOCUMENT]->(d:SourceDocument)
       WHERE d.url IN $urls AND d.enrichStatus IS NOT NULL AND d.enrichStatus <> 'none'
       RETURN d.url as url,
              d.abstract as abstract, d.subjects as subjects,
              d.bodies as bodies, d.reportNumbers as reportNumbers,
              d.notes as notes, d.collections as collections,
              d.marcData as marcData,
              d.enrichStatus as enrichStatus, d.enrichedAt as enrichedAt`,
      { sourceId, urls }
    ).catch(() => []);

    if (!rows.length) return items;

    const sp = (v, fallback) => { try { return JSON.parse(v || 'null') || fallback; } catch { return fallback; } };
    const map = {};
    for (const r of rows) {
      map[r.url] = {
        abstract:      r.abstract || '',
        subjects:      sp(r.subjects, []),
        bodies:        sp(r.bodies, []),
        reportNumbers: sp(r.reportNumbers, []),
        notes:         sp(r.notes, []),
        collections:   sp(r.collections, []),
        marcData:      sp(r.marcData, null),
        enrichStatus:  r.enrichStatus,
        enrichedAt:    r.enrichedAt || null,
      };
    }

    return items.map(item => {
      const extra = item.url ? map[item.url] : null;
      return extra ? { ...item, ...extra } : item;
    });
  }

  async _saveSourceDocuments(sourceId, docs) {
    const now = new Date().toISOString();
    for (const doc of docs) {
      try {
        const externalId = doc.url || doc.id;
        if (!externalId) continue;
        const docId = uuidv5(`${sourceId}::${externalId}`, SOURCE_DOC_NS);
        const sc = _sourceDocSymbolComponents(doc.symbol);
        await mg().runQuery(`
          MERGE (d:SourceDocument {id: $id})
          SET d.sourceId      = $sourceId,
              d.externalId    = $externalId,
              d.title         = $title,
              d.symbol        = $symbol,
              d.url           = $url,
              d.pdfUrl        = $pdfUrl,
              d.fileType      = $fileType,
              d.date          = $date,
              d.description   = $description,
              d.metadata      = $metadata,
              d.languages     = $languages,
              d.organCode     = $organCode,
              d.seriesCode    = $seriesCode,
              d.subBody       = $subBody,
              d.sessionNumber = $sessionNumber,
              d.documentNumber = $documentNumber,
              d.documentYear  = $documentYear,
              d.baseSymbol    = $baseSymbol,
              d.suffixType    = $suffixType,
              d.suffixNumber  = $suffixNumber,
              d.updatedAt     = $now,
              d.discoveredAt  = coalesce(d.discoveredAt, $now)
          WITH d
          MATCH (s:SourceCatalog {id: $sourceId})
          MERGE (s)-[:HAS_DOCUMENT]->(d)
        `, {
          id:          docId,
          sourceId,
          externalId,
          title:       doc.title || '',
          symbol:      doc.symbol || '',
          url:         doc.url || '',
          pdfUrl:      doc.pdfUrl || '',
          fileType:    doc.fileType || '',
          date:        doc.date || '',
          description: doc.description || '',
          metadata:    JSON.stringify(doc.metadata || {}),
          languages:   JSON.stringify(doc.languages || []),
          now,
          ...sc,
        });
      } catch { /* non-critical: skip individual failures */ }
    }
  }

  async getSourceDocuments(sourceId, { page = 1, limit = 20, importedOnly = false } = {}) {
    const conds = ['d.sourceId = $sourceId'];
    const params = { sourceId };
    if (importedOnly) conds.push('d.importedAt IS NOT NULL');

    const where = `WHERE ${conds.join(' AND ')}`;
    const skip  = (page - 1) * limit;

    const rows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $sourceId})-[:HAS_DOCUMENT]->(d:SourceDocument)
       ${where}
       RETURN d.id as id, d.title as title, d.symbol as symbol,
              d.url as url, d.pdfUrl as pdfUrl,
              d.fileType as fileType, d.date as date,
              d.description as description,
              d.metadata as metadata, d.languages as languages,
              d.importedAt as importedAt, d.importedDocumentId as importedDocumentId,
              d.discoveredAt as discoveredAt,
              d.abstract as abstract, d.subjects as subjects,
              d.bodies as bodies, d.reportNumbers as reportNumbers,
              d.notes as notes, d.collections as collections,
              d.marcData as marcData,
              d.enrichStatus as enrichStatus, d.enrichedAt as enrichedAt
       ORDER BY d.discoveredAt DESC
       SKIP ${skip} LIMIT ${limit}`,
      params
    );

    const countRows = await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $sourceId})-[:HAS_DOCUMENT]->(d:SourceDocument)
       ${where}
       RETURN count(d) as total`,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    return {
      results: rows.map(r => ({
        id:                r.id,
        title:             r.title,
        symbol:            r.symbol,
        url:               r.url,
        pdfUrl:            r.pdfUrl || '',
        fileType:          r.fileType,
        date:              r.date,
        description:       r.description,
        metadata:          parseConfig(r.metadata),
        languages:         (() => { try { return JSON.parse(r.languages || '[]'); } catch { return []; } })(),
        importedAt:        r.importedAt || null,
        importedDocumentId: r.importedDocumentId || null,
        discoveredAt:      r.discoveredAt,
        abstract:          r.abstract || '',
        subjects:          (() => { try { return JSON.parse(r.subjects || '[]'); } catch { return []; } })(),
        bodies:            (() => { try { return JSON.parse(r.bodies || '[]'); } catch { return []; } })(),
        reportNumbers:     (() => { try { return JSON.parse(r.reportNumbers || '[]'); } catch { return []; } })(),
        notes:             (() => { try { return JSON.parse(r.notes || '[]'); } catch { return []; } })(),
        collections:       (() => { try { return JSON.parse(r.collections || '[]'); } catch { return []; } })(),
        marcData:          (() => { try { return r.marcData ? JSON.parse(r.marcData) : null; } catch { return null; } })(),
        enrichStatus:      r.enrichStatus || 'none',
        enrichedAt:        r.enrichedAt || null,
      })),
      total,
      hasMore: skip + limit < total,
    };
  }

  // ─── Import ────────────────────────────────────────────────────

  async importDocument(catalogId, { url: docUrl, title, namespace = 'DEFAULT', meta = {}, pdfUrl }) {
    const source = await this.get(catalogId);

    // Ask the source adapter to resolve the best download URL for this item.
    let resolvedUrl = pdfUrl || meta?.pdfUrl || docUrl;
    if (source) {
      try {
        const adapter = resolveAdapter(source);
        const dl = await adapter.resolveDownload({ url: docUrl, pdfUrl, metadata: meta });
        if (dl?.downloadUrl) resolvedUrl = dl.downloadUrl;
      } catch { /* fall back to the naive resolution above */ }
    }

    const downloadUrl = resolvedUrl;
    if (!downloadUrl) throw new Error('url is required');

    console.log(`${LOG_PREFIX} Importing: ${downloadUrl}`);

    // Resolve filename
    let filename;
    try {
      const parsed = new url.URL(downloadUrl);
      filename = path.basename(parsed.pathname) || 'document';
      if (!path.extname(filename)) filename += '.pdf';
    } catch {
      filename = (title || 'document').replace(/[^a-zA-Z0-9._-]/g, '_') + '.pdf';
    }

    // Download
    const response = await axios.get(downloadUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      httpsAgent,
      headers: { 'User-Agent': 'Mozilla/5.0 UNPA-Ingest/1.0' },
      maxContentLength: 50 * 1024 * 1024,
    });

    const buffer = Buffer.from(response.data);
    const mime   = response.headers['content-type']?.split(';')[0] || 'application/octet-stream';

    if (title) filename = title.substring(0, 120).replace(/[^a-zA-Z0-9._\-\s]/g, '_').trim() + '.' + (path.extname(filename).slice(1) || 'pdf');

    const { documentProcessingService } = require('./document-processing.service');
    const result = await documentProcessingService.uploadDocument(
      buffer, filename, mime,
      namespace,
      { sourceUrl: docUrl, documentTitle: title || null, ...meta }
    );
    console.log(`[TEST-LOG][SourceCatalog] Document node created: id=${result?.documentId} file="${filename}" ns=${namespace} size=${buffer.length}B`);

    // Mark SourceDocument as imported
    if (docUrl) {
      const externalId = docUrl;
      const docId = uuidv5(`${catalogId}::${externalId}`, SOURCE_DOC_NS);
      await mg().runQuery(
        `MATCH (d:SourceDocument {id: $id})
         SET d.importedAt = $now, d.importedDocumentId = $documentId`,
        { id: docId, now: new Date().toISOString(), documentId: result?.documentId || '' }
      ).catch(() => {});
    }

    // Drain any pending REFERENCES / SUPERSEDES links that were waiting for this
    // document to enter the system (deferred-linking loop, see 11-queue-refs.step
    // and document.adapter _persistTemporalData).
    if (result?.documentId) {
      await this._drainPendingLinks(
        result.documentId,
        [meta?.unSymbol, meta?.symbol, title, filename],
        title || meta?.title || ''
      ).catch(() => {});

      // Copy MARC-derived relations (series / agenda / draft-verbatim) from the
      // harvester SourceDocument onto the working Document node.
      if (docUrl) {
        const sourceDocId = uuidv5(`${catalogId}::${docUrl}`, SOURCE_DOC_NS);
        await this._copyMarcEdgesToDocument(sourceDocId, result.documentId).catch(() => {});
      }
    }

    // Bump documentCount on source catalog entry
    await mg().runQuery(
      `MATCH (s:SourceCatalog {id: $id})
       SET s.documentCount = coalesce(s.documentCount, 0) + 1`,
      { id: catalogId }
    ).catch(() => {});

    return result;
  }

  /**
   * Materialize pending document-to-document links now that `newDocId` exists.
   * Scans documents carrying pendingReferencesJson / pendingSupersessionJson,
   * creates the corresponding edge for any entry whose targetRef points at the
   * new document, and rewrites the pending list without the drained entries.
   *
   * @param {string}   newDocId          - the freshly-imported Document.id
   * @param {string[]} symbolCandidates  - possible symbols for the new doc
   * @param {string}   title             - new doc title (for contains-match)
   */
  async _drainPendingLinks(newDocId, symbolCandidates = [], title = '') {
    try {
      if (!newDocId) return { references: 0, supersessions: 0 };
      const now = new Date().toISOString();

      // Normalized symbol forms for matching (parser-normalized + raw candidates).
      const raws = symbolCandidates.filter(Boolean).map(s => String(s).trim());
      let normSym = '';
      for (const c of raws) {
        const p = parseUNSymbol(c);
        if (p && p.organ) { normSym = p.normalized; break; }
      }
      if (!normSym && !raws.length && !title) return { references: 0, supersessions: 0 };

      const titleLower = (title || '').toLowerCase();
      const symForms = [...new Set([normSym, ...raws].filter(Boolean).map(s => s.toLowerCase()))];

      // A pending targetRef points at the new doc if it equals one of the symbol
      // forms, or a symbol form contains it (short refs), or the title contains it.
      const matches = (ref) => {
        if (!ref) return false;
        const r = String(ref).trim().toLowerCase();
        if (!r) return false;
        if (symForms.includes(r)) return true;
        if (r.length >= 5 && symForms.some(s => s.includes(r))) return true;
        if (r.length >= 8 && titleLower && titleLower.includes(r)) return true;
        return false;
      };

      const drainList = async (prop, applyEdge) => {
        let count = 0;
        const rows = await mg().runQuery(
          `MATCH (d:Document)
           WHERE d.${prop} IS NOT NULL AND d.id <> $newId
           RETURN d.id AS id, d.${prop} AS json`,
          { newId: newDocId }
        ).catch(() => []);
        for (const row of rows) {
          let list;
          try { list = JSON.parse(row.json || '[]'); } catch { continue; }
          if (!Array.isArray(list) || list.length === 0) continue;
          const remaining = [];
          for (const entry of list) {
            if (!matches(entry.targetRef)) { remaining.push(entry); continue; }
            try {
              await applyEdge(row.id, entry, now);
              count++;
            } catch { remaining.push(entry); }
          }
          if (remaining.length !== list.length) {
            await mg().runQuery(
              `MATCH (d:Document {id: $id}) SET d.${prop} = $json`,
              { id: row.id, json: remaining.length ? JSON.stringify(remaining) : null }
            ).catch(() => {});
          }
        }
        return count;
      };

      const references = await drainList('pendingReferencesJson', async (srcId, entry, ts) => {
        await mg().runQuery(
          `MATCH (src:Document {id: $srcId}), (tgt:Document {id: $tgtId})
           MERGE (src)-[r:REFERENCES {relType: $relType}]->(tgt)
           SET r.confidence = $conf, r.evidence = $evidence, r.refSymbol = $ref,
               r.extractedAt = $ts, r.drained = true`,
          {
            srcId, tgtId: newDocId,
            relType: entry.relType || 'CITES',
            conf: entry.confidence != null ? entry.confidence : 0.8,
            evidence: (entry.evidence || '').slice(0, 400),
            ref: entry.targetRef, ts,
          }
        );
      });

      const supersessions = await drainList('pendingSupersessionJson', async (srcId, entry, ts) => {
        const relType = entry.relType || 'SUPERSEDES';
        await mg().runQuery(
          `MATCH (src:Document {id: $srcId}), (tgt:Document {id: $tgtId})
           MERGE (src)-[r:SUPERSEDES {relType: $relType}]->(tgt)
           SET r.scope = $scope, r.confidence = $conf, r.evidence = $evidence,
               r.extractedAt = $ts, r.drained = true`,
          {
            srcId, tgtId: newDocId, relType,
            scope: entry.scope || 'full',
            conf: entry.confidence != null ? entry.confidence : 0.7,
            evidence: (entry.evidence || '').slice(0, 400), ts,
          }
        );
        await mg().runQuery(
          `MATCH (t:Document {id: $tgtId})
           SET t.isSuperseded = true, t.supersededBy = $srcId, t.supersededAt = $ts`,
          { tgtId: newDocId, srcId, ts }
        ).catch(() => {});
      });

      // ── Symbol-derived relations (HAS_ADDENDUM/CORRECTS/REVISES/AMENDS) ──
      // These were parked on a suffix document whose base (= new doc) was missing.
      const ALLOWED_SYMBOL_REL = new Set(['HAS_ADDENDUM', 'CORRECTS', 'REVISES', 'AMENDS', 'REISSUES']);
      const symbolRelations = await drainList('pendingSymbolRelationsJson', async (holderId, entry, ts) => {
        const relType = entry.relType;
        if (!ALLOWED_SYMBOL_REL.has(relType)) throw new Error(`disallowed relType ${relType}`);
        // holderId is the suffix document; newDocId is its base.
        const srcId = entry.thisIsSource ? holderId : newDocId;
        const tgtId = entry.thisIsSource ? newDocId : holderId;
        await mg().runQuery(
          `MATCH (src:Document {id: $srcId}), (tgt:Document {id: $tgtId})
           MERGE (src)-[r:${relType} {source: 'SYMBOL_DERIVED'}]->(tgt)
           SET r.relType = $relType, r.confidence = 1.0,
               r.suffixType = $suffixType, r.suffixNumber = $suffixNumber,
               r.createdAt = $ts, r.drained = true`,
          {
            srcId, tgtId, relType,
            suffixType: entry.suffixType || null,
            suffixNumber: entry.suffixNumber != null ? entry.suffixNumber : null,
            ts,
          }
        );
      });

      if (references || supersessions || symbolRelations) {
        console.log(`${LOG_PREFIX} Drained pending links for ${newDocId}: ${references} REFERENCES, ${supersessions} SUPERSEDES, ${symbolRelations} SYMBOL`);
      }
      return { references, supersessions, symbolRelations };
    } catch (e) {
      console.warn(`${LOG_PREFIX} drainPendingLinks error: ${e.message}`);
      return { references: 0, supersessions: 0 };
    }
  }

  /**
   * Copy MARC-derived relations from a harvester SourceDocument to its imported
   * Document, so the working Document graph carries series / agenda membership
   * and draft/verbatim/related links. Series and AgendaItem targets are shared
   * nodes (re-pointed from the Document); 993 doc-to-doc links are re-created
   * between Documents only when the other endpoint has also been imported.
   * Idempotent (MERGE); non-fatal.
   */
  async _copyMarcEdgesToDocument(sourceDocId, documentId) {
    try {
      const now = new Date().toISOString();

      // Shared-target relations: PART_OF_SERIES (989), CONSIDERED_UNDER (991).
      const shared = [
        { rel: 'PART_OF_SERIES',   tgt: 'DocumentSeries', source: 'MARC_989' },
        { rel: 'CONSIDERED_UNDER', tgt: 'AgendaItem',     source: 'MARC_991' },
      ];
      for (const s of shared) {
        await mg().runQuery(
          `MATCH (sd:SourceDocument {id: $sid})-[:${s.rel}]->(tgt:${s.tgt})
           MATCH (d:Document {id: $did})
           MERGE (d)-[r2:${s.rel} {source: $source}]->(tgt)
           SET r2.copiedFrom = $sid, r2.createdAt = $now`,
          { sid: sourceDocId, did: documentId, source: s.source, now }
        ).catch(() => {});
      }

      // 993 doc-to-doc relations: resolve the other SourceDocument to its
      // imported Document (via importedDocumentId) and mirror the edge direction.
      for (const rel of ['DRAFT_OF', 'HAS_VERBATIM', 'RELATED_TO']) {
        // outgoing  (sd)-[rel]->(other)
        await mg().runQuery(
          `MATCH (sd:SourceDocument {id: $sid})-[r:${rel}]->(o:SourceDocument)
           WHERE o.importedDocumentId IS NOT NULL AND o.importedDocumentId <> ''
           MATCH (d:Document {id: $did}), (od:Document {id: o.importedDocumentId})
           MERGE (d)-[r2:${rel} {source: 'MARC_993'}]->(od)
           SET r2.copiedFrom = $sid, r2.marcType = r.marcType, r2.createdAt = $now`,
          { sid: sourceDocId, did: documentId, now }
        ).catch(() => {});
        // incoming  (other)-[rel]->(sd)
        await mg().runQuery(
          `MATCH (o:SourceDocument)-[r:${rel}]->(sd:SourceDocument {id: $sid})
           WHERE o.importedDocumentId IS NOT NULL AND o.importedDocumentId <> ''
           MATCH (d:Document {id: $did}), (od:Document {id: o.importedDocumentId})
           MERGE (od)-[r2:${rel} {source: 'MARC_993'}]->(d)
           SET r2.copiedFrom = $sid, r2.marcType = r.marcType, r2.createdAt = $now`,
          { sid: sourceDocId, did: documentId, now }
        ).catch(() => {});
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} copyMarcEdgesToDocument error: ${e.message}`);
    }
  }

  // ─── Format ────────────────────────────────────────────────────

  _returnFields() {
    return `s.id as id, s.name as name, s.description as description,
            s.type as type, s.namespace as namespace,
            s.config as config, s.tags as tags,
            s.methodology as methodology, s.capabilities as capabilities,
            s.enabled as enabled, s.documentCount as documentCount,
            s.isDefault as isDefault,
            s.indexStatus as indexStatus, s.indexCursor as indexCursor,
            s.indexTotal as indexTotal, s.indexTotalMethod as indexTotalMethod,
            s.indexTotalAt as indexTotalAt, s.lastIndexedAt as lastIndexedAt,
            s.createdAt as createdAt, s.updatedAt as updatedAt,
            s.lastBrowsedAt as lastBrowsedAt`;
  }

  _format(r) {
    const config = parseConfig(r.config);
    let capabilities = null;
    try { capabilities = r.capabilities ? JSON.parse(r.capabilities) : null; } catch { capabilities = null; }
    return {
      id:            r.id,
      name:          r.name,
      description:   r.description || '',
      type:          r.type,
      namespace:     r.namespace,
      config:        config,
      tags:          (() => { try { return JSON.parse(r.tags || '[]'); } catch { return []; } })(),
      methodology:   r.methodology || '',
      capabilities:  capabilities && typeof capabilities === 'object' ? {
        capabilities: normalizeCapabilities(capabilities.capabilities),
        filterSchema: normalizeFilterSchema(capabilities.filterSchema),
        downloadMode: capabilities.downloadMode || null,
        enrichMode:   capabilities.enrichMode || null,
        family:       capabilities.family || null,
        notes:        capabilities.notes || '',
      } : null,
      adapterKey:    config.adapterKey || null,
      enabled:       r.enabled !== false,
      isDefault:     r.isDefault === true,
      documentCount: Number(r.documentCount) || 0,
      indexStatus:   r.indexStatus || 'pending',
      indexCursor:   Number(r.indexCursor) || 0,
      indexTotal:    r.indexTotal != null ? Number(r.indexTotal) : null,
      indexTotalMethod: r.indexTotalMethod || null,
      indexTotalAt:  r.indexTotalAt || null,
      lastIndexedAt: r.lastIndexedAt || null,
      createdAt:     r.createdAt,
      updatedAt:     r.updatedAt,
      lastBrowsedAt: r.lastBrowsedAt || null,
    };
  }
}

const sourceCatalogService = new SourceCatalogService();
module.exports = { sourceCatalogService, SourceCatalogService, SOURCE_TYPES };

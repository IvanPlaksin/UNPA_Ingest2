'use strict';

/**
 * Schema export (ADMIN P8) — builds a downloadable ZIP package for a selection of
 * cached schemas, containing:
 *   - schemas.xlsx : a tabular representation (two sheets: one row per schema, one
 *     row per field) of every selected schema.
 *   - schemas.json : the full hierarchy — each schema with its complete metadata,
 *     phases, all slots (every property) and its AI enrichment (description,
 *     keywords, per-field meanings).
 *
 * All information is exported. XLSX via SheetJS (already a dependency), ZIP via
 * JSZip. Returns a Buffer the controller streams as an attachment.
 *
 * @module instances/flowdesk/services/schema-export.service
 */

const XLSX = require('xlsx');

/** Gather the full detail (snapshot + enrichment) for each requested ousId. */
async function collect(ousIds) {
  const admin = require('./chat-admin.service');
  const out = [];
  for (const ousId of ousIds) {
    try {
      const d = await admin.getSchemaDetail(ousId, {});
      out.push({
        ousId: d.ousId,
        serviceId: d.snapshot?.serviceId,
        title: d.snapshot?.metadata?.title || null,
        fresh: d.fresh ?? null,
        liveVersion: d.liveVersion || null,
        snapshot: d.snapshot || null,
        enrichment: d.enrichment || null,
      });
    } catch (err) {
      out.push({ ousId, error: err.message });
    }
  }
  return out;
}

const joinOpts = (s) => ((s.presentOptions || []).map((o) => `${o.label}${o.value !== o.label ? ` (${o.value})` : ''}`).join(' | '));

/** Build the two-sheet XLSX workbook as a Buffer. */
function buildXlsx(schemas) {
  // Sheet 1 — one row per schema.
  const schemaRows = schemas.map((s) => {
    const m = s.snapshot?.metadata || {};
    const e = s.enrichment || {};
    return {
      ousId: s.ousId,
      serviceId: s.serviceId || '',
      title: s.title || '',
      domain: (s.serviceId || '').split('-').slice(0, 2).join('-'),
      version: s.snapshot?.version ?? '',
      phases: (s.snapshot?.phases || []).join(', '),
      fields: (s.snapshot?.slots || []).length,
      approvalRequired: !!m.approvalRequired,
      slaHours: m.slaHours ?? '',
      altioraOusId: m.altioraOusId ?? '',
      contentHash: m.contentHash || '',
      liveVersion: s.liveVersion?.version ?? '',
      fresh: s.fresh === null ? '' : !!s.fresh,
      hasAiDescription: !!(e && e.text),
      aiDescription: (e && e.text) || '',
      aiKeywords: (e && Array.isArray(e.keywords) ? e.keywords.join(', ') : ''),
      error: s.error || '',
    };
  });

  // Sheet 2 — one row per field across all selected schemas.
  const fieldRows = [];
  for (const s of schemas) {
    const fields = (s.enrichment && s.enrichment.fields) || {};
    (s.snapshot?.slots || []).forEach((slot, i) => {
      fieldRows.push({
        serviceId: s.serviceId || '',
        ousId: s.ousId,
        order: i + 1,
        phase: slot.phase || '',
        slotId: slot.slotId,
        altioraFieldId: slot.altioraFieldId || '',
        type: slot.type,
        required: !!slot.required,
        label: slot.promptHint || '',
        options: slot.type === 'enum' ? joinOpts(slot) : '',
        lovEntity: slot.lov?.entityId || '',
        resolverRef: slot.resolverRef || '',
        dependsOn: (slot.dependsOn || []).join(', '),
        trefCondition: slot.trefCondition || '',
        requiredWhen: slot.requiredWhen || '',
        aiFieldMeaning: fields[slot.slotId] || '',
      });
    });
  }

  const wb = XLSX.utils.book_new();
  const wsSchemas = XLSX.utils.json_to_sheet(schemaRows);
  const wsFields = XLSX.utils.json_to_sheet(fieldRows);
  // Reasonable column widths.
  wsSchemas['!cols'] = Object.keys(schemaRows[0] || { ousId: 1 }).map((k) => ({ wch: k === 'aiDescription' ? 60 : (k === 'title' || k === 'aiKeywords' ? 30 : 14) }));
  wsFields['!cols'] = Object.keys(fieldRows[0] || { slotId: 1 }).map((k) => ({ wch: (k === 'aiFieldMeaning' || k === 'label' || k === 'options' || k === 'trefCondition') ? 42 : 14 }));
  XLSX.utils.book_append_sheet(wb, wsSchemas, 'Schemas');
  XLSX.utils.book_append_sheet(wb, wsFields, 'Fields');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** Build the full-hierarchy JSON (all schema + field information). */
function buildJson(schemas) {
  return {
    exportedAt: new Date().toISOString(),
    source: 'FlowDesk Chat Admin — schema export',
    count: schemas.length,
    schemas: schemas.map((s) => ({
      ousId: s.ousId,
      serviceId: s.serviceId,
      title: s.title,
      fresh: s.fresh,
      liveVersion: s.liveVersion,
      error: s.error || undefined,
      // Full snapshot: metadata, phases, and every slot with all its properties.
      snapshot: s.snapshot || null,
      enrichment: s.enrichment || null,
    })),
  };
}

/**
 * Build the ZIP package (schemas.xlsx + schemas.json) for the given ousIds.
 * @returns {Promise<{buffer:Buffer, filename:string, count:number}>}
 */
async function buildExport(ousIds) {
  const ids = [...new Set((ousIds || []).map((n) => Number(n)).filter((n) => Number.isFinite(n)))];
  if (!ids.length) throw Object.assign(new Error('ousIds[] is required'), { status: 400 });

  const schemas = await collect(ids);
  const xlsx = buildXlsx(schemas);
  const json = Buffer.from(JSON.stringify(buildJson(schemas), null, 2), 'utf8');

  const JSZip = require('jszip');
  const zip = new JSZip();
  zip.file('schemas.xlsx', xlsx);
  zip.file('schemas.json', json);
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return { buffer, filename: `flowdesk-schemas-${schemas.length}-${stamp}.zip`, count: schemas.length };
}

module.exports = { buildExport, buildXlsx, buildJson, collect };

'use strict';
/**
 * DocumentExtractionService
 *
 * Orchestrates the full extraction pipeline for a classified Document:
 *   Parse → Extract Entities/Relations → Build Triangle → Detect Gaps → Calculate KQS → Store Results
 *
 * Progress is written to Redis at each step (key: extraction:progress:{documentId}, TTL: 2h).
 * On completion, an ExtractionResult node is written to Memgraph.
 */

const { v4: uuidv4 } = require('uuid');
const path  = require('path');
const fs    = require('fs');

const LOG_PREFIX = '[DocumentExtraction]';

// Redis key pattern for progress
const PROGRESS_KEY = (docId) => `extraction:progress:${docId}`;
const PROGRESS_TTL  = 7200; // 2 hours

// Pipeline step definitions (order matters)
const PIPELINE_STEPS = [
  { name: 'parse-document',        label: 'Parse Document' },
  { name: 'extract-entities',      label: 'Extract Entities & Relations' },
  { name: 'build-triangle',        label: 'Build Knowledge Triangle' },
  { name: 'detect-gaps',           label: 'Detect Knowledge Gaps' },
  { name: 'calculate-kqs',         label: 'Calculate KQS Scores' },
  { name: 'deduplicate-entities',  label: 'Deduplicate Entities' },
  { name: 'store-results',         label: 'Store Results' },
];

// Lazy deps
let _mg = null, _redis = null;
function mg()    { if (!_mg)    _mg    = require('../memgraph.service');  return _mg; }
function redis() { if (!_redis) _redis = require('../redis.service');     return _redis; }

class DocumentExtractionService {

  // ─── Main entry point ────────────────────────────────────────────────────

  /**
   * Run the full extraction pipeline for a document.
   * Called from DocumentProcessingService after status → EXTRACTING.
   * @param {string} docId
   * @param {{ model?: string }} options  — when model is provided, use AI extraction
   */
  async extractDocument(docId, options = {}) {
    const { model } = options;
    const startedAt = new Date().toISOString();
    const resultId  = uuidv4();

    // Load document metadata
    const doc = await this._loadDoc(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);

    await this._initProgress(docId, startedAt);
    const summary = { entitiesExtracted: 0, relationsFound: 0, processesLinked: 0,
                      triangleEdgesCreated: { governs: 0, operationalizes: 0, revealsGapIn: 0 },
                      gapsDetected: 0, kqsScore: null, errors: [],
                      aiSummary: null, aiModel: model || null };

    // ─── Step 1: Parse ────────────────────────────────────────────────────
    await this._startStep(docId, 'parse-document');
    let text = '';
    try {
      text = await this._readText(doc.storagePath, doc.originalname);
      await this._completeStep(docId, 'parse-document', { chars: text.length });
    } catch (e) {
      await this._failStep(docId, 'parse-document', e.message);
      summary.errors.push({ step: 'parse-document', message: e.message });
    }

    // ─── Step 2: Extract entities/relations ──────────────────────────────
    await this._startStep(docId, 'extract-entities');
    let extractionResult = null;
    const useAI = model && model !== 'regex';
    try {
      if (text) {
        if (useAI) {
          const { documentAIExtractionService } = require('./document-ai-extraction.service');
          try {
            const aiResult = await documentAIExtractionService.extractDocument(docId, text, doc, { model });
            await documentAIExtractionService.persistResults(docId, aiResult, doc);
            extractionResult = {
              entities:  aiResult.entities,
              relations: [],
              summary:   aiResult.summary,
              aiMeta:    { model: aiResult.model, topics: aiResult.topics, provisions: aiResult.keyProvisions },
            };
            summary.entitiesExtracted = aiResult.entities.length;
            summary.aiSummary         = aiResult.summary;
          } catch (aiErr) {
            // AI failed (e.g. no API credits) — fall back to regex with a warning
            console.warn(LOG_PREFIX, `AI extraction failed (${aiErr.message}), falling back to regex`);
            summary.aiModel = `${model}:fallback`;
            extractionResult = await this._extractUNEntities(text, docId, doc);
            summary.entitiesExtracted = (extractionResult.entities || []).length;
            summary.relationsFound    = (extractionResult.relations || []).length;
            summary.errors.push({ step: 'extract-entities', message: `AI fallback: ${aiErr.message}` });
          }
        } else {
          extractionResult = await this._extractUNEntities(text, docId, doc);
          summary.entitiesExtracted = (extractionResult.entities || []).length;
          summary.relationsFound    = (extractionResult.relations || []).length;
        }
      }
      await this._completeStep(docId, 'extract-entities', {
        entities:  summary.entitiesExtracted,
        relations: summary.relationsFound,
        method:    useAI ? `ai:${model}` : 'regex',
      });
    } catch (e) {
      await this._failStep(docId, 'extract-entities', e.message);
      summary.errors.push({ step: 'extract-entities', message: e.message });
    }

    // ─── Step 3: Build Knowledge Triangle ────────────────────────────────
    await this._startStep(docId, 'build-triangle');
    try {
      const triangleResult = await this._buildTriangle(doc, extractionResult);
      summary.processesLinked       = triangleResult.processesLinked;
      summary.triangleEdgesCreated  = triangleResult.edgesCreated;
      await this._completeStep(docId, 'build-triangle', triangleResult);
    } catch (e) {
      await this._failStep(docId, 'build-triangle', e.message);
      summary.errors.push({ step: 'build-triangle', message: e.message });
    }

    // ─── Step 4: Detect Gaps ─────────────────────────────────────────────
    await this._startStep(docId, 'detect-gaps');
    try {
      const { gapDetectionService } = require('./gap-detection.service');
      const stale = await gapDetectionService.findStaleGaps({ daysOld: 90, limit: 100 });
      summary.gapsDetected = stale.length;
      await this._completeStep(docId, 'detect-gaps', { staleGaps: stale.length });
    } catch (e) {
      await this._failStep(docId, 'detect-gaps', e.message);
      summary.errors.push({ step: 'detect-gaps', message: e.message });
    }

    // ─── Step 5: Calculate KQS ────────────────────────────────────────────
    await this._startStep(docId, 'calculate-kqs');
    try {
      const { kqsService } = require('./kqs.service');
      const entityIds = (extractionResult?.entities || []).map(e => e.id).filter(Boolean);
      if (entityIds.length > 0) {
        await kqsService.calculateKQSBatch(entityIds.slice(0, 50), { persist: true });
      }
      // Calculate KQS for the document itself as a KnowledgeNode if it exists
      const docKqsResult = await kqsService.calculateKQSById(docId, { persist: true }).catch(() => null);
      summary.kqsScore = docKqsResult?.kqs ?? null;
      await this._completeStep(docId, 'calculate-kqs', { entitiesScored: entityIds.length, docKqs: summary.kqsScore });
    } catch (e) {
      await this._failStep(docId, 'calculate-kqs', e.message);
      summary.errors.push({ step: 'calculate-kqs', message: e.message });
    }

    // ─── Step 6: Deduplicate entities ────────────────────────────────────────
    await this._startStep(docId, 'deduplicate-entities');
    try {
      const removed = await this._deduplicateEntities(docId);
      await this._completeStep(docId, 'deduplicate-entities', { removed });
    } catch (e) {
      await this._failStep(docId, 'deduplicate-entities', e.message);
      summary.errors.push({ step: 'deduplicate-entities', message: e.message });
    }

    // ─── Step 7: Store results ────────────────────────────────────────────
    await this._startStep(docId, 'store-results');
    const completedAt = new Date().toISOString();
    try {
      const duration = new Date(completedAt) - new Date(startedAt);
      const extractedNodeIds = (extractionResult?.entities || []).map(e => e.id).filter(Boolean);

      // Persist ExtractionResult node
      await mg().runQuery(
        `CREATE (r:ExtractionResult {
           id: $id, documentId: $docId,
           startedAt: $started, completedAt: $completed, duration: $dur,
           entitiesExtracted: $ent, relationsFound: $rel,
           processesLinked: $proc, gapsDetected: $gaps,
           kqsScore: $kqs,
           triangleGoverns: $gov, triangleOperationalizes: $op, triangleRevealsGapIn: $rev,
           errorCount: $errCnt,
           aiModel: $aiModel, aiSummary: $aiSummary
         }) RETURN r.id`,
        {
          id: resultId, docId,
          started: startedAt, completed: completedAt, dur: duration,
          ent: summary.entitiesExtracted, rel: summary.relationsFound,
          proc: summary.processesLinked, gaps: summary.gapsDetected,
          kqs: summary.kqsScore,
          gov: summary.triangleEdgesCreated.governs,
          op:  summary.triangleEdgesCreated.operationalizes,
          rev: summary.triangleEdgesCreated.revealsGapIn,
          errCnt: summary.errors.length,
          aiModel:   summary.aiModel   || null,
          aiSummary: summary.aiSummary || null,
        }
      );

      // Link to Document
      await mg().runQuery(
        `MATCH (d:Document {id: $docId}), (r:ExtractionResult {id: $resId})
         CREATE (d)-[:HAS_EXTRACTION_RESULT]->(r)`,
        { docId, resId: resultId }
      ).catch(() => {});

      // Update Document node
      await mg().runQuery(
        `MATCH (d:Document {id: $id})
         SET d.status = 'COMPLETED', d.extractedNodeIds = $nodeIds,
             d.kqsScore = $kqs, d.processedAt = $now`,
        { id: docId, nodeIds: extractedNodeIds, kqs: summary.kqsScore, now: completedAt }
      );

      await this._completeStep(docId, 'store-results', { resultId });
    } catch (e) {
      await this._failStep(docId, 'store-results', e.message);
      summary.errors.push({ step: 'store-results', message: e.message });
      // Mark doc as FAILED
      await mg().runQuery(
        `MATCH (d:Document {id: $id}) SET d.status = 'FAILED', d.updatedAt = $now`,
        { id: docId, now: new Date().toISOString() }
      ).catch(() => {});
    }

    // Finalize progress
    await this._finalizeProgress(docId, 'completed', summary);
    return { resultId, summary, startedAt, completedAt };
  }

  // ─── Triangle Building ────────────────────────────────────────────────────

  async _buildTriangle(doc, extractionResult) {
    const layer  = doc.epistemicLayer;
    const result = { processesLinked: 0, edgesCreated: { governs: 0, operationalizes: 0, revealsGapIn: 0 } };
    if (!layer) return result;

    const { knowledgeTriangleService } = require('./knowledge-triangle.service');

    // Find existing KnowledgeNode / Process nodes whose names match extracted entities.
    // The document itself is the normative/operational/empirical source.
    const sourceId = doc.id;
    const entities = (extractionResult?.entities || []);
    const entityNames = [...new Set(entities.map(e => e.name).filter(Boolean))];

    if (entityNames.length > 0) {
      // Find any KnowledgeNode in the graph whose name matches an extracted entity
      const matches = await mg().runQuery(
        `UNWIND $names AS n
         MATCH (kn:KnowledgeNode) WHERE toLower(kn.name) CONTAINS toLower(n)
         RETURN kn.id AS id LIMIT 20`,
        { names: entityNames.slice(0, 50) }
      ).catch(() => []);

      for (const m of matches) {
        const targetId = m.id;
        if (!targetId || targetId === sourceId) continue;
        try {
          if (['L0', 'L1', 'L2'].includes(layer)) {
            await knowledgeTriangleService.createGovernsEdge(sourceId, targetId).catch(() => {});
            result.edgesCreated.governs++;
          } else if (layer === 'L3') {
            await knowledgeTriangleService.createOperationalizesEdge(sourceId, targetId).catch(() => {});
            result.edgesCreated.operationalizes++;
          } else if (layer === 'L4') {
            await knowledgeTriangleService.createRevealsGapEdge(sourceId, targetId, {
              gapType: 'COMPLIANCE', severity: 'MEDIUM',
              title: `Gap detected from ${doc.originalname}`
            }).catch(() => {});
            result.edgesCreated.revealsGapIn++;
          }
          result.processesLinked++;
        } catch { /* skip individual edge errors */ }
      }
    }

    return result;
  }

  // ─── Progress helpers ─────────────────────────────────────────────────────

  async _initProgress(docId, startedAt) {
    const progress = {
      documentId:  docId,
      status:      'running',
      startedAt,
      overallProgress: 0,
      currentStep: PIPELINE_STEPS[0].name,
      steps: PIPELINE_STEPS.map(s => ({ ...s, status: 'pending', duration: null, result: null }))
    };
    await redis().set(PROGRESS_KEY(docId), progress, PROGRESS_TTL);
    return progress;
  }

  async _startStep(docId, stepName) {
    const prog = await redis().get(PROGRESS_KEY(docId));
    if (!prog) return;
    const idx  = prog.steps.findIndex(s => s.name === stepName);
    if (idx === -1) return;
    prog.steps[idx].status    = 'running';
    prog.steps[idx].startedAt = new Date().toISOString();
    prog.currentStep          = stepName;
    prog.overallProgress      = Math.round((idx / PIPELINE_STEPS.length) * 100);
    await redis().set(PROGRESS_KEY(docId), prog, PROGRESS_TTL);
  }

  async _completeStep(docId, stepName, result = null) {
    const prog = await redis().get(PROGRESS_KEY(docId));
    if (!prog) return;
    const idx = prog.steps.findIndex(s => s.name === stepName);
    if (idx === -1) return;
    const started = prog.steps[idx].startedAt;
    prog.steps[idx].status   = 'completed';
    prog.steps[idx].result   = result;
    prog.steps[idx].duration = started ? new Date() - new Date(started) : null;
    prog.overallProgress     = Math.round(((idx + 1) / PIPELINE_STEPS.length) * 100);
    await redis().set(PROGRESS_KEY(docId), prog, PROGRESS_TTL);
  }

  async _failStep(docId, stepName, errorMsg) {
    const prog = await redis().get(PROGRESS_KEY(docId));
    if (!prog) return;
    const idx = prog.steps.findIndex(s => s.name === stepName);
    if (idx !== -1) {
      prog.steps[idx].status = 'failed';
      prog.steps[idx].error  = errorMsg;
    }
    await redis().set(PROGRESS_KEY(docId), prog, PROGRESS_TTL);
  }

  async _finalizeProgress(docId, status, summary) {
    const prog = await redis().get(PROGRESS_KEY(docId));
    if (!prog) return;
    prog.status          = status;
    prog.completedAt     = new Date().toISOString();
    prog.overallProgress = 100;
    prog.summary         = summary;
    await redis().set(PROGRESS_KEY(docId), prog, PROGRESS_TTL);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  async getProgress(docId) {
    return redis().get(PROGRESS_KEY(docId));
  }

  async getEntities(docId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $id})-[:MENTIONS]->(e:EntityMention)
       RETURN e.id AS id, e.name AS name, e.type AS type,
              e.category AS category, e.epistemicLayer AS epistemicLayer,
              e.match AS match, e.relevance AS relevance, e.extractedByAI AS extractedByAI
       ORDER BY e.relevance DESC, e.type, e.name`,
      { id: docId }
    );
    return rows.map(r => ({
      id:             r.id,
      name:           r.name,
      type:           r.type,
      category:       r.category || null,
      epistemicLayer: r.epistemicLayer || null,
      match:          r.match || null,
      relevance:      r.relevance || null,
      extractedByAI:  r.extractedByAI || false,
      confidence:     null
    }));
  }

  async getExtractionResult(docId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $id})-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
       RETURN r.id as id, r.documentId as documentId,
              r.startedAt as startedAt, r.completedAt as completedAt, r.duration as duration,
              r.entitiesExtracted as entitiesExtracted, r.relationsFound as relationsFound,
              r.processesLinked as processesLinked, r.gapsDetected as gapsDetected,
              r.kqsScore as kqsScore,
              r.triangleGoverns as triangleGoverns,
              r.triangleOperationalizes as triangleOperationalizes,
              r.triangleRevealsGapIn as triangleRevealsGapIn,
              r.errorCount as errorCount,
              r.aiModel as aiModel, r.aiSummary as aiSummary
       ORDER BY r.completedAt DESC LIMIT 1`,
      { id: docId }
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      id: r.id, documentId: r.documentId,
      startedAt: r.startedAt, completedAt: r.completedAt, duration: r.duration,
      summary: {
        entitiesExtracted:   r.entitiesExtracted,
        relationsFound:      r.relationsFound,
        processesLinked:     r.processesLinked,
        gapsDetected:        r.gapsDetected,
        kqsScore:            r.kqsScore,
        triangleEdgesCreated: {
          governs:           r.triangleGoverns,
          operationalizes:   r.triangleOperationalizes,
          revealsGapIn:      r.triangleRevealsGapIn
        }
      },
      errorCount: r.errorCount,
      aiModel:    r.aiModel   || null,
      aiSummary:  r.aiSummary || null,
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  async _readText(storagePath, originalname) {
    const buf = fs.readFileSync(storagePath);
    const ext = path.extname(originalname).toLowerCase();
    try {
      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const data = await pdfParse(buf, { max: 0 });
        return (data.text || '').slice(0, 200000);
      }
      if (ext === '.docx' || ext === '.doc') {
        const mammoth = require('mammoth');
        const { value } = await mammoth.extractRawText({ buffer: buf });
        return (value || '').slice(0, 200000);
      }
    } catch (e) {
      console.warn(LOG_PREFIX, '_readText parse error for', originalname, e.message);
    }
    return buf.toString('utf-8', 0, Math.min(buf.length, 200000));
  }

  // ─── UN Entity Extraction ─────────────────────────────────────────────────

  async _extractUNEntities(text, docId, doc) {
    const { extractAllEntities } = require('../../config/un-entities.config');
    const { v4: uuid } = require('uuid');
    const raw = extractAllEntities(text);

    // Flatten all categories into a normalized entity array.
    // Deduplicate by (type + match) so the same symbol isn't counted twice.
    const seen = new Set();
    const entities = [];

    // Deduplicate by type + normalized name (case-insensitive)
    const push = (type, name, match, extra = {}) => {
      const normalized = (name || match || '').trim();
      if (!normalized) return;
      const key = `${type}::${normalized.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      entities.push({ id: uuid(), type, name: normalized, match, ...extra });
    };

    // Common short words / noise that technical regex can match falsely
    const NOISE = new Set(['update','where','from','right','left','when','that','this','with','have','been','will','into','about','after','before','while']);

    for (const e of raw.systems)       push('System',       e.name,     e.match, { category: e.category });
    for (const e of raw.documents)     push('DocumentRef',  e.name,     e.match, { category: e.category });
    for (const e of raw.organizations) push('Organization', e.name,     e.match, { fullName: e.fullName, category: e.category });
    for (const e of raw.workItems)     push('WorkItem',     e.match,    e.match, { refId: e.id });
    for (const e of raw.persons)       push('Person',       e.match,    e.match, { category: e.category });
    for (const e of raw.technologies)  push('Technology',   e.name || e.match, e.match, { category: e.category });
    // Technical: skip single-word lowercase noise and very short tokens
    for (const e of raw.technical) {
      const t = (e.match || '').trim();
      if (t.length < 4 || NOISE.has(t.toLowerCase()) || /^[a-z]+$/.test(t)) continue;
      push('Technical', t, t, { category: e.category });
    }

    // Persist entities as EntityMention nodes linked to the Document in Memgraph.
    if (entities.length > 0) {
      await this._persistEntities(entities, docId, doc);
    }

    return { entities, relations: [] };
  }

  async _persistEntities(entities, docId, doc) {
    const now = new Date().toISOString();
    const batch = entities.slice(0, 100);
    for (const e of batch) {
      await mg().runQuery(
        `MATCH (d:Document {id: $docId})
         MERGE (em:EntityMention {type: $type, name: $name, documentId: $docId})
         ON CREATE SET em.id = $id, em.match = $match,
                       em.category = $cat, em.epistemicLayer = $layer, em.createdAt = $now
         ON MATCH  SET em.match = $match, em.category = $cat
         MERGE (d)-[:MENTIONS]->(em)`,
        {
          docId, id: e.id, type: e.type, name: e.name, match: e.match,
          cat: e.category || null, layer: doc.epistemicLayer || null, now
        }
      ).catch(() => {});
    }
  }

  async _deduplicateEntities(docId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $docId})-[:MENTIONS]->(em:EntityMention)
       WITH em.type + '::' + toLower(em.name) AS key, collect(em) AS dups
       WHERE size(dups) > 1
       UNWIND tail(dups) AS dup
       DETACH DELETE dup
       RETURN count(*) AS removed`,
      { docId }
    ).catch(() => [{ removed: 0 }]);
    const raw = rows[0]?.removed;
    return typeof raw === 'object' ? (raw?.low ?? 0) : (raw ?? 0);
  }

  async _loadDoc(docId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $id})
       RETURN d.id as id, d.storagePath as storagePath, d.originalname as originalname,
              d.status as status, d.namespace as namespace,
              d.epistemicLayer as epistemicLayer, d.documentType as documentType`,
      { id: docId }
    );
    return rows[0] || null;
  }
}

const documentExtractionService = new DocumentExtractionService();
module.exports = { documentExtractionService, DocumentExtractionService, PIPELINE_STEPS };

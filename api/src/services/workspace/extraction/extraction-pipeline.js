/**
 * Extraction Pipeline Orchestrator
 *
 * Orchestrates full knowledge extraction from a source:
 * 1. Extract text from source file
 * 2. Extract entities (Step 1)
 * 3. Extract relations (Step 2)
 * 4. Run specialized extractors (business rules, workflows, etc.)
 * 5. Auto-create Draft nodes + edges
 * 6. Log everything
 *
 * @module services/workspace/extraction/extraction-pipeline
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const { extractEntities } = require('./entity.extractor');
const { extractRelations } = require('./relation.extractor');
const { getPrompt, fillPrompt } = require('./prompts');

const LOG_PREFIX = '[ExtractionPipeline]';

let _llm = null;
let _sourceService = null;
let _draftService = null;

function llm() { if (!_llm) _llm = require('../../llm.service'); return _llm; }
function srcSvc() { if (!_sourceService) _sourceService = require('../source.service'); return _sourceService; }
function draftSvc() { if (!_draftService) _draftService = require('../draft.service'); return _draftService; }

/**
 * Run full extraction pipeline for a source
 * @param {string} workspaceId
 * @param {string} sourceId
 * @param {Object} options
 * @param {string[]} [options.extractTypes] - Which types to extract. Default: all
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<PipelineResult>}
 */
async function runExtractionPipeline(workspaceId, sourceId, options = {}) {
  const {
    extractTypes = ['entity', 'relationship', 'business_rule', 'workflow', 'concept', 'anomaly'],
    onProgress
  } = options;

  const startTime = Date.now();
  const pipelineLog = [];
  const chatHistory = [];
  const createdDrafts = [];
  const createdEdges = [];

  const log = (step, message, level = 'info') => {
    const entry = { timestamp: new Date().toISOString(), step, message, level };
    pipelineLog.push(entry);
    console.log(`${LOG_PREFIX} [${step}] ${message}`);
  };

  const addChat = (role, content) => {
    chatHistory.push({ timestamp: new Date().toISOString(), role, content: content.substring(0, 2000) });
  };

  try {
    // ── STEP 0: Get source and extract text ──────────────
    log('INIT', 'Starting extraction pipeline');
    if (onProgress) onProgress({ phase: 'init', message: 'Loading source...' });

    const source = await srcSvc().getSource(workspaceId, sourceId);
    if (!source) throw new Error(`Source not found: ${sourceId}`);

    log('INIT', `Source: ${source.filename} (${source.sourceType})`);

    // Extract text
    const text = await srcSvc()._extractText(source);
    if (!text || text.length < 50) {
      log('TEXT', 'Insufficient text content for extraction', 'warn');
      return buildResult(false, 'Insufficient text content', createdDrafts, createdEdges, pipelineLog, chatHistory, startTime);
    }
    log('TEXT', `Extracted ${text.length} chars`);

    const documentType = source.documentType || 'UNKNOWN';
    const domain = source.domain || 'GENERAL';
    addChat('system', `Starting extraction from "${source.filename}" (${documentType}, ${domain}). Text: ${text.length} chars.`);

    // Update source status
    await srcSvc().updateSourceStatus(workspaceId, sourceId, 'EXTRACTING');

    // ── STEP 1: Entity Extraction ────────────────────────
    let entities = [];
    if (extractTypes.includes('entity')) {
      log('ENTITY', 'Starting entity extraction');
      if (onProgress) onProgress({ phase: 'entities', message: 'Extracting entities...' });

      const entityResult = await extractEntities(text, { documentType, domain, onProgress });

      if (entityResult.success && entityResult.entities.length > 0) {
        entities = entityResult.entities;
        log('ENTITY', `Extracted ${entities.length} entities`);
        addChat('assistant', `Found ${entities.length} entities: ${entities.map(e => e.name).join(', ')}`);

        // Create Draft nodes
        for (const entity of entities) {
          try {
            const draft = await draftSvc().create(workspaceId, {
              type: 'entity',
              name: entity.name,
              description: entity.description,
              content: entity,
              sourceId,
              confidence: entity.confidence || 0.8,
              extractedBy: 'extraction-pipeline'
            });
            createdDrafts.push({ id: draft.id, type: 'entity', name: entity.name });
            entity._draftId = draft.id; // Track for edge creation
          } catch (err) {
            log('ENTITY', `Failed to create draft for "${entity.name}": ${err.message}`, 'warn');
          }
        }
        log('ENTITY', `Created ${createdDrafts.filter(d => d.type === 'entity').length} draft entities`);
      } else {
        log('ENTITY', 'No entities extracted', 'warn');
      }
      pipelineLog.push(...(entityResult.log || []));
    }

    // ── STEP 2: Relation Extraction ──────────────────────
    if (extractTypes.includes('relationship') && entities.length >= 2) {
      log('RELATION', 'Starting relation extraction');
      if (onProgress) onProgress({ phase: 'relations', message: 'Extracting relationships...' });

      const relationResult = await extractRelations(text, entities, { documentType, domain, onProgress });

      if (relationResult.success && relationResult.relations.length > 0) {
        log('RELATION', `Extracted ${relationResult.relations.length} relations`);
        addChat('assistant', `Found ${relationResult.relations.length} relationships`);

        // Create Draft edges
        for (const rel of relationResult.relations) {
          try {
            const srcEntity = entities.find(e => e.name.toLowerCase() === rel.sourceEntity.toLowerCase());
            const tgtEntity = entities.find(e => e.name.toLowerCase() === rel.targetEntity.toLowerCase());

            if (srcEntity?._draftId && tgtEntity?._draftId) {
              const edge = await draftSvc().createEdge(workspaceId, {
                sourceId: srcEntity._draftId,
                targetId: tgtEntity._draftId,
                edgeType: rel.relationshipType,
                confidence: rel.confidence || 0.7
              });
              createdEdges.push(edge);
            }
          } catch (err) {
            log('RELATION', `Failed to create edge: ${err.message}`, 'warn');
          }
        }
        log('RELATION', `Created ${createdEdges.length} edges`);
      }
      pipelineLog.push(...(relationResult.log || []));
    }

    // ── STEP 3: Specialized Extraction ───────────────────
    const specializedTypes = extractTypes.filter(t =>
      ['business_rule', 'workflow', 'calculation', 'concept', 'anomaly'].includes(t)
    );

    for (const extractType of specializedTypes) {
      const prompt = getPrompt(extractType);
      if (!prompt) continue;

      log(extractType.toUpperCase(), `Starting ${extractType} extraction`);
      if (onProgress) onProgress({ phase: extractType, message: `Extracting ${extractType}s...` });

      try {
        const filledPrompt = fillPrompt(prompt, {
          documentType,
          domain,
          entitiesJson: entities.map(e => ({ name: e.name, type: e.type })),
          text: text.substring(0, 12000)
        });

        const response = await llm().chat(
          [{ role: 'user', content: filledPrompt }],
          [], null,
          { maxTokens: 4000, temperature: 0.1 }
        );

        const responseText = response?.content || '';
        addChat('assistant', `${extractType} extraction response (${responseText.length} chars)`);

        // Parse JSON from response
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const items = JSON.parse(jsonMatch[0]);

          if (Array.isArray(items) && items.length > 0) {
            log(extractType.toUpperCase(), `Found ${items.length} ${extractType}(s)`);

            // Map extractType to draft type
            const draftType = extractType;

            for (const item of items) {
              try {
                const name = item.name || item.term || item.title || `${extractType}_${uuidv4().slice(0, 8)}`;
                const draft = await draftSvc().create(workspaceId, {
                  type: draftType,
                  name,
                  description: item.description || item.definition || '',
                  content: item,
                  sourceId,
                  confidence: 0.75,
                  extractedBy: 'extraction-pipeline'
                });
                createdDrafts.push({ id: draft.id, type: draftType, name });
              } catch (err) {
                log(extractType.toUpperCase(), `Failed to create draft: ${err.message}`, 'warn');
              }
            }
          }
        }
      } catch (err) {
        log(extractType.toUpperCase(), `Extraction failed: ${err.message}`, 'error');
      }
    }

    // ── STEP 4: Finalize ─────────────────────────────────
    log('COMPLETE', `Pipeline finished. Created ${createdDrafts.length} drafts, ${createdEdges.length} edges`);
    addChat('system', `Extraction complete. ${createdDrafts.length} knowledge objects extracted.`);

    // Update source
    await srcSvc()._updateSourceFields(workspaceId, sourceId, {
      status: 'EXTRACTED',
      extractedAt: new Date().toISOString(),
      extractionLog: JSON.stringify(pipelineLog),
      chatHistory: JSON.stringify(chatHistory)
    });

    // ── STEP 5: Auto-detect contradictions (WS3-002) ─────
    let contradictionsResult = null;
    const autoDetect = process.env.AUTO_DETECT_CONTRADICTIONS !== 'false';
    if (autoDetect && createdDrafts.length > 0) {
      try {
        if (onProgress) onProgress({
          phase: 'detecting_contradictions',
          message: 'Detecting contradictions across sources…'
        });

        const contradictionService = require('../contradiction.service');
        const detection = await contradictionService.detectContradictions(workspaceId, {
          detectedBy: 'extraction-pipeline'
        });

        // Aggregate stats including pre-existing contradictions
        const stats = await contradictionService.getContradictionStats(workspaceId);

        contradictionsResult = {
          newContradictions: detection.created?.length || 0,
          deduplicated: detection.skipped || 0,
          totalAfter: stats.total,
          openAfter: stats.byStatus?.OPEN || 0,
          blocking: stats.bySeverity?.BLOCKING || 0
        };

        log('CONTRADICTIONS',
          `Auto-detection: ${contradictionsResult.newContradictions} new, ` +
          `${contradictionsResult.deduplicated} deduped, ` +
          `${contradictionsResult.blocking} blocking`
        );

        if (onProgress) onProgress({
          phase: 'contradictions_detected',
          message: `${contradictionsResult.newContradictions} new contradiction(s) found`,
          ...contradictionsResult
        });
      } catch (err) {
        log('CONTRADICTIONS', `Auto-detection failed: ${err.message}`, 'warn');
        contradictionsResult = { error: err.message };
      }
    }

    if (onProgress) onProgress({ phase: 'complete', drafts: createdDrafts.length, edges: createdEdges.length });

    return buildResult(true, null, createdDrafts, createdEdges, pipelineLog, chatHistory, startTime, contradictionsResult);

  } catch (error) {
    log('ERROR', `Pipeline failed: ${error.message}`, 'error');
    addChat('system', `ERROR: ${error.message}`);

    try {
      await srcSvc()._updateSourceFields(workspaceId, sourceId, {
        status: 'ERROR',
        extractionLog: JSON.stringify(pipelineLog),
        chatHistory: JSON.stringify(chatHistory)
      });
    } catch { /* best effort */ }

    return buildResult(false, error.message, createdDrafts, createdEdges, pipelineLog, chatHistory, startTime, null);
  }
}

function buildResult(success, error, drafts, edges, log, chatHistory, startTime, contradictions = null) {
  return {
    success,
    error,
    drafts,
    edges,
    stats: {
      draftsCreated: drafts.length,
      edgesCreated: edges.length,
      draftsByType: drafts.reduce((acc, d) => { acc[d.type] = (acc[d.type] || 0) + 1; return acc; }, {}),
      durationMs: Date.now() - startTime
    },
    contradictions,
    log,
    chatHistory
  };
}

module.exports = { runExtractionPipeline };

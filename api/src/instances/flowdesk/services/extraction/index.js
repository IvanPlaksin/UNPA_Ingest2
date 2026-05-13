/**
 * FlowDesk Extraction Module
 *
 * Orchestrates full extraction of FlowDesk knowledge:
 * service catalog, SLA rules, classification rules, routing rules, dialog graphs.
 *
 * Usage:
 *   const { runFlowDeskExtraction } = require('./flowdesk');
 *   const result = await runFlowDeskExtraction(workspaceId, sourceId, options);
 */

'use strict';

const { extractServiceCatalog } = require('./service-catalog.extractor.js');
const { extractSLARules } = require('./sla-rules.extractor.js');
const { extractClassificationRules } = require('./classification-rules.extractor.js');
const { extractRoutingRules } = require('./routing-rules.extractor.js');
const { extractDialogGraphs } = require('./dialog-graph.extractor.js');

const LOG_PREFIX = '[FlowDeskExtraction]';

/**
 * Run full FlowDesk extraction pipeline
 * @param {string} workspaceId
 * @param {string} sourceId
 * @param {Object} [options]
 * @param {Function} [options.onProgress]
 * @returns {Promise<{success, stats, log[]}>}
 */
async function runFlowDeskExtraction(workspaceId, sourceId, options = {}) {
  const { onProgress } = options;
  const log = [];
  const addLog = (msg) => {
    log.push({ timestamp: new Date().toISOString(), step: 'FLOWDESK_PIPELINE', message: msg });
    console.log(`${LOG_PREFIX} ${msg}`);
  };

  let draftService;
  try {
    draftService = require('../../../../services/workspace/draft.service');
  } catch (err) {
    addLog(`Cannot load draft service: ${err.message}`);
    return { success: false, error: err.message, log };
  }

  const created = { entities: 0, rules: 0, workflows: 0, edges: 0 };

  try {
    addLog('Starting FlowDesk knowledge extraction');

    // ── Step 1: Service Catalog ──────────────────────
    if (onProgress) onProgress({ phase: 'service_catalog', message: 'Extracting service catalog...' });
    const catalogResult = await extractServiceCatalog(options);
    log.push(...(catalogResult.log || []));

    if (catalogResult.success) {
      for (const entity of catalogResult.entities) {
        try {
          await draftService.create(workspaceId, {
            type: 'entity',
            name: entity.name,
            description: entity.description,
            content: entity.content,
            sourceId,
            confidence: entity.confidence,
            extractedBy: 'flowdesk-extractor'
          });
          created.entities++;
        } catch (err) {
          addLog(`Draft entity error: ${err.message}`);
        }
      }
      addLog(`Service catalog: ${created.entities} entities created`);
    }

    // ── Step 2: SLA Rules ────────────────────────────
    if (onProgress) onProgress({ phase: 'sla_rules', message: 'Extracting SLA rules...' });
    const slaResult = await extractSLARules(options);
    log.push(...(slaResult.log || []));

    if (slaResult.success) {
      for (const rule of slaResult.rules) {
        try {
          await draftService.create(workspaceId, {
            type: 'business_rule',
            name: rule.name,
            description: rule.description,
            content: rule.content,
            sourceId,
            confidence: rule.confidence,
            extractedBy: 'flowdesk-extractor'
          });
          created.rules++;
        } catch (err) {
          addLog(`Draft rule error: ${err.message}`);
        }
      }
      addLog(`SLA rules: ${created.rules} rules created`);
    }

    // ── Step 3: Classification Rules ─────────────────
    if (onProgress) onProgress({ phase: 'classification_rules', message: 'Extracting classification rules...' });
    const classResult = await extractClassificationRules(options);
    log.push(...(classResult.log || []));
    const rulesBeforeClass = created.rules;

    if (classResult.success) {
      for (const rule of classResult.rules) {
        try {
          await draftService.create(workspaceId, {
            type: 'business_rule',
            name: rule.name,
            description: rule.description,
            content: rule.content,
            sourceId,
            confidence: rule.confidence,
            extractedBy: 'flowdesk-extractor'
          });
          created.rules++;
        } catch (err) {
          addLog(`Draft classification rule error: ${err.message}`);
        }
      }
      addLog(`Classification rules: ${created.rules - rulesBeforeClass} rules created`);
    }

    // ── Step 4: Routing Rules ────────────────────────
    if (onProgress) onProgress({ phase: 'routing_rules', message: 'Extracting routing rules...' });
    const routingResult = await extractRoutingRules(options);
    log.push(...(routingResult.log || []));
    const rulesBeforeRouting = created.rules;

    if (routingResult.success) {
      for (const rule of routingResult.rules) {
        try {
          await draftService.create(workspaceId, {
            type: 'business_rule',
            name: rule.name,
            description: rule.description,
            content: rule.content,
            sourceId,
            confidence: rule.confidence,
            extractedBy: 'flowdesk-extractor'
          });
          created.rules++;
        } catch (err) {
          addLog(`Draft routing rule error: ${err.message}`);
        }
      }
      addLog(`Routing rules: ${created.rules - rulesBeforeRouting} rules created`);
    }

    // ── Step 5: Dialog Graphs ────────────────────────
    if (onProgress) onProgress({ phase: 'dialog_graphs', message: 'Importing dialog graphs...' });
    const graphResult = await extractDialogGraphs(options);
    log.push(...(graphResult.log || []));

    if (graphResult.success) {
      for (const workflow of graphResult.workflows) {
        try {
          await draftService.create(workspaceId, {
            type: 'workflow',
            name: workflow.name,
            description: workflow.description,
            content: workflow.content,
            sourceId,
            confidence: workflow.confidence,
            extractedBy: 'flowdesk-extractor'
          });
          created.workflows++;
        } catch (err) {
          addLog(`Draft workflow error: ${err.message}`);
        }
      }
      addLog(`Dialog graphs: ${created.workflows} workflows created`);
    }

    // ── Summary ──────────────────────────────────────
    const total = created.entities + created.rules + created.workflows;
    addLog(`FlowDesk extraction complete: ${total} drafts (${created.entities} entities, ${created.rules} rules, ${created.workflows} workflows)`);

    if (onProgress) onProgress({ phase: 'complete', drafts: total });

    return {
      success: true,
      stats: {
        ...created,
        total,
        catalog: catalogResult.stats,
        sla: slaResult.stats,
        classification: classResult.stats,
        routing: routingResult.stats,
        graphs: graphResult.stats
      },
      log
    };
  } catch (error) {
    addLog(`Pipeline error: ${error.message}`);
    return { success: false, error: error.message, stats: created, log };
  }
}

// GXE Graph Generators
const generators = require('./generators');
const catalogIntegration = require('./catalog-integration.js');

module.exports = {
  // Phase FD-1: Extractors
  runFlowDeskExtraction,
  extractServiceCatalog,
  extractSLARules,
  extractClassificationRules,
  extractRoutingRules,
  extractDialogGraphs,

  // Phase FD-2: Generators
  ...generators,

  // Phase FD-2: Catalog Integration
  ...catalogIntegration,

  // GXE Builder
  GxeGraphBuilder: require('./gxe-builder.js').GxeGraphBuilder
};

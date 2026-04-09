/**
 * FlowDesk Classification Rules Extractor
 *
 * Extracts 3-layer classification pipeline rules (L1 keyword, L2 semantic, L3 LLM).
 * Creates DraftBusinessRule nodes for each classification layer.
 *
 * @module services/workspace/extraction/flowdesk/classification-rules
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[ClassificationExtractor]';
const CATALOG_PATH = path.resolve(__dirname, '../../../../services/flowdesk/data/service-catalog.json');

// Default thresholds (from config-loader.service.js)
const DEFAULT_THRESHOLDS = {
  L1: { high: 0.95 },
  L2: { high: 0.80, medium: 0.55 },
  L3: { high: 0.50 }
};

/**
 * Extract classification rules → DraftBusinessRule
 * @param {Object} [options]
 * @param {Object} [options.thresholds] - Override thresholds
 * @returns {Promise<{success, rules[], stats, log[]}>}
 */
async function extractClassificationRules(options = {}) {
  const log = [];
  const addLog = (msg) => log.push({ timestamp: new Date().toISOString(), step: 'CLASSIFICATION', message: msg });
  const thresholds = options.thresholds || DEFAULT_THRESHOLDS;
  const rules = [];

  try {
    // L1: Keyword rules per service
    const catalog = JSON.parse(fs.readFileSync(options.catalogPath || CATALOG_PATH, 'utf-8'));
    addLog(`Loaded ${catalog.length} services for keyword rules`);

    for (const svc of catalog) {
      const keywords = extractKeywordsFromService(svc);
      if (keywords.length > 0) {
        rules.push({
          type: 'business_rule',
          name: `L1 Keyword: ${svc.code}`,
          description: `Keyword-based classification for ${svc.name}`,
          confidence: 1.0,
          content: {
            ruleType: 'DERIVATION',
            classificationLevel: 'L1',
            condition: {
              expression: `message.containsAny(${JSON.stringify(keywords)})`,
              keywords
            },
            action: {
              type: 'CLASSIFY',
              target: 'request.serviceCode',
              value: svc.code,
              confidence: thresholds.L1.high
            },
            scope: { domain: svc.domain_code, serviceCode: svc.code, serviceName: svc.name }
          }
        });
      }
    }
    addLog(`L1: ${rules.length} keyword classification rules`);

    // L2: Semantic thresholds
    const l2Start = rules.length;
    rules.push({
      type: 'business_rule',
      name: 'L2 Semantic: High Confidence Threshold',
      description: `Semantic match score >= ${thresholds.L2.high} → classify with HIGH confidence`,
      confidence: 1.0,
      content: {
        ruleType: 'DERIVATION',
        classificationLevel: 'L2',
        condition: { expression: `semanticScore >= ${thresholds.L2.high}`, threshold: thresholds.L2.high },
        action: { type: 'CLASSIFY', confidence: 'HIGH', proceedToL3: false }
      }
    });
    rules.push({
      type: 'business_rule',
      name: 'L2 Semantic: Medium Confidence Threshold',
      description: `Semantic match score ${thresholds.L2.medium}-${thresholds.L2.high} → tentative, proceed to L3`,
      confidence: 1.0,
      content: {
        ruleType: 'DERIVATION',
        classificationLevel: 'L2',
        condition: {
          expression: `semanticScore >= ${thresholds.L2.medium} AND semanticScore < ${thresholds.L2.high}`,
          thresholdMin: thresholds.L2.medium, thresholdMax: thresholds.L2.high
        },
        action: { type: 'CLASSIFY_TENTATIVE', confidence: 'MEDIUM', proceedToL3: true }
      }
    });
    rules.push({
      type: 'business_rule',
      name: 'L2 Semantic: Low Confidence → L3',
      description: `Semantic match score < ${thresholds.L2.medium} → must proceed to LLM classification`,
      confidence: 1.0,
      content: {
        ruleType: 'DERIVATION',
        classificationLevel: 'L2',
        condition: { expression: `semanticScore < ${thresholds.L2.medium}`, threshold: thresholds.L2.medium },
        action: { type: 'ESCALATE_TO_L3', confidence: 'LOW' }
      }
    });
    addLog(`L2: ${rules.length - l2Start} semantic threshold rules`);

    // L3: LLM classification
    const l3Start = rules.length;
    rules.push({
      type: 'business_rule',
      name: 'L3 LLM Classification Trigger',
      description: 'LLM-based classification for ambiguous cases when L1/L2 insufficient',
      confidence: 1.0,
      content: {
        ruleType: 'DERIVATION',
        classificationLevel: 'L3',
        condition: { expression: 'l2.proceedToL3 == true OR l1.confidence < 0.95' },
        action: {
          type: 'LLM_CLASSIFY',
          model: 'claude-sonnet',
          temperature: 0.1,
          minConfidence: thresholds.L3.high,
          serviceCatalogSize: catalog.length
        }
      }
    });
    rules.push({
      type: 'business_rule',
      name: 'L3 Classification Pipeline Fallback',
      description: 'If all 3 layers fail to classify, escalate to human agent',
      confidence: 1.0,
      content: {
        ruleType: 'TRIGGER',
        classificationLevel: 'FALLBACK',
        condition: { expression: 'l3.confidence < 0.50 AND l2.confidence < 0.55 AND l1.confidence < 0.95' },
        action: { type: 'ESCALATE', target: 'HUMAN_AGENT', description: 'Route to human agent for manual classification' },
        enforcement: 'MANDATORY'
      }
    });
    addLog(`L3: ${rules.length - l3Start} LLM/fallback rules`);
    addLog(`Total classification rules: ${rules.length}`);

    return {
      success: true,
      rules,
      stats: { l1Rules: l2Start, l2Rules: l3Start - l2Start, l3Rules: rules.length - l3Start, totalRules: rules.length },
      log
    };
  } catch (error) {
    addLog(`ERROR: ${error.message}`);
    return { success: false, error: error.message, rules: [], log };
  }
}

function extractKeywordsFromService(svc) {
  const keywords = new Set();
  // From name words
  if (svc.name) {
    svc.name.toLowerCase().split(/\s+/).filter(w => w.length > 3).forEach(w => keywords.add(w));
  }
  // From code parts
  if (svc.code) {
    svc.code.toLowerCase().split('-').filter(w => w.length > 1).forEach(w => keywords.add(w));
  }
  return [...keywords];
}

module.exports = { extractClassificationRules, DEFAULT_THRESHOLDS };

'use strict';

/**
 * Runtime Controller — CaMeL Pattern (Google DeepMind, arxiv 2503.18813)
 *
 * ROLE: Deterministic validation and routing layer between Quarantined NLU and
 * Privileged GXE execution. This is NOT an LLM — it is pure deterministic code.
 *
 * CONTRACT:
 * - Receives typed IntentObject from QuarantinedNLUService
 * - Validates fields against strict schemas
 * - Sanitizes all string values (second sanitization pass)
 * - Routes to appropriate graph based on intent
 * - Passes ONLY validated, typed parameters to GXE — NEVER raw user text
 */

'use strict';

// Minimum confidence required to route to Privileged layer
const MIN_CONFIDENCE = 0.4;

// Maps well-known intent codes to GXE graph entry points (static fast-path)
// All intents route to the universal SR dialog graph (c39d8ac5-a25f-483c-b9ee-bd01433f11f5)
const SR_DIALOG = 'service-request-dialog';
const INTENT_GRAPH_MAP = {
  laptop_request:    { domain: 'IT',  serviceCode: 'IT-LAPTOP',    graphKey: SR_DIALOG },
  equipment_request: { domain: 'IT',  serviceCode: 'IT-EQUIPMENT', graphKey: SR_DIALOG },
  software_request:  { domain: 'IT',  serviceCode: 'IT-SOFTWARE',  graphKey: SR_DIALOG },
  access_request:    { domain: 'IT',  serviceCode: 'IT-ACCESS',    graphKey: SR_DIALOG },
  hr_request:        { domain: 'HR',  serviceCode: 'HR-GENERAL',   graphKey: SR_DIALOG },
  facility_request:  { domain: 'FAC', serviceCode: 'FAC-GENERAL',  graphKey: SR_DIALOG },
};

// Allowed characters in string entity values
const SAFE_STRING_RE = /^[\w\s.,!?:;'"\-()\/€$£¥₹<>\n]{0,200}$/;

class RuntimeController {
  /**
   * Validate and route an IntentObject from QuarantinedNLU.
   * Async: may perform a catalog lookup for graph_execution intent.
   *
   * @param {object} intentObject - From QuarantinedNLUService.parseIntent()
   * @param {object} sessionContext - { sessionId, userId }
   * @returns {Promise<{ action, graphKey, domain, serviceCode, parameters, error? }>}
   */
  async process(intentObject, sessionContext = {}) {
    console.log(`[CONTROLLER] Validated intent: ${intentObject?.intent} (confidence=${intentObject?.confidence})`);

    // 1. Confidence gate
    if (!intentObject || intentObject.confidence < MIN_CONFIDENCE) {
      return {
        action: 'clarify',
        message: "I'm not sure I understood. Could you rephrase what you need?",
        raw_topic: intentObject?.raw_topic || 'unclear',
      };
    }

    // 2. Unknown intent → clarify
    if (intentObject.intent === 'unknown') {
      return {
        action: 'clarify',
        message: "I didn't recognize that request. I can help with laptops, equipment, software, access, HR, or facility requests — or name a specific workflow to run it directly.",
        raw_topic: intentObject.raw_topic,
      };
    }

    // 3. graph_execution — user named a specific workflow; look it up in catalog
    if (intentObject.intent === 'graph_execution') {
      const sanitized = this._sanitizeEntities(intentObject.entities);
      const graphName = sanitized.graph_name;
      if (!graphName) {
        return {
          action: 'clarify',
          message: 'Which workflow would you like to run? Please name it.',
        };
      }
      const graphKey = await this._catalogLookup(graphName);
      if (!graphKey) {
        return {
          action: 'clarify',
          message: `I couldn't find a workflow matching "${graphName}". Please check the name and try again.`,
        };
      }
      const parameters = {
        userId: this._assertSafeId(sessionContext.userId),
        sessionId: this._assertSafeId(sessionContext.sessionId),
        intent: 'graph_execution',
        graph_name: graphName,
        urgency: sanitized.urgency || 'medium',
        confidence: intentObject.confidence,
      };
      console.log(`[CONTROLLER] graph_execution → ${graphKey}`);
      return { action: 'execute', graphKey, domain: 'GRAPH', serviceCode: graphKey, parameters };
    }

    // 4. Static route lookup (fast-path for well-known intents)
    const route = INTENT_GRAPH_MAP[intentObject.intent];
    if (!route) {
      return {
        action: 'unsupported',
        message: `I can't handle "${intentObject.intent}" requests yet.`,
      };
    }

    // 5. Sanitize entities — all values must pass safe-string check
    const sanitized = this._sanitizeEntities(intentObject.entities);

    // 6. Build typed parameter bag — NO raw user text included
    const parameters = {
      userId: this._assertSafeId(sessionContext.userId),
      sessionId: this._assertSafeId(sessionContext.sessionId),
      intent: intentObject.intent,
      for_self: sanitized.for_self,
      use_case: sanitized.use_case,
      budget: sanitized.budget,
      item_type: sanitized.item_type,
      urgency: sanitized.urgency || 'medium',
      serviceCode: route.serviceCode,
      domain: route.domain,
      confidence: intentObject.confidence,
    };

    return {
      action: 'execute',
      graphKey: route.graphKey,
      domain: route.domain,
      serviceCode: route.serviceCode,
      parameters,
    };
  }

  /**
   * Catalog lookup: find graphKey by partial name match.
   * Deterministic DB query — maintains CaMeL CONTROL layer contract.
   * Returns shortest-name match (most specific) or null.
   */
  async _catalogLookup(name) {
    try {
      const mg = require('../memgraph.service');
      const rows = await mg.runQuery(`
        MATCH (c:CatalogEntry)
        WHERE c.graphKey IS NOT NULL
          AND c.type IS NOT NULL
          AND toLower(c.name) CONTAINS toLower($name)
        RETURN c.graphKey AS graphKey, c.name AS name, c.namespace AS namespace
        ORDER BY size(c.name) ASC
        LIMIT 1
      `, { name });
      if (rows.length > 0) {
        console.log(`[CONTROLLER] Catalog lookup: "${name}" → ${rows[0].graphKey} ("${rows[0].name}", ns=${rows[0].namespace})`);
        return rows[0].graphKey;
      }
    } catch (err) {
      console.warn('[CONTROLLER] Catalog lookup failed:', err.message);
    }
    return null;
  }

  _sanitizeEntities(entities) {
    if (!entities || typeof entities !== 'object') return {};
    const result = {};
    for (const [key, val] of Object.entries(entities)) {
      if (val === null || val === undefined) {
        result[key] = null;
        continue;
      }
      if (typeof val === 'boolean') {
        result[key] = val;
        continue;
      }
      if (typeof val === 'string') {
        // Reject values that don't match safe pattern
        result[key] = SAFE_STRING_RE.test(val) ? val : null;
        continue;
      }
      // Drop unknown types
      result[key] = null;
    }
    return result;
  }

  _assertSafeId(id) {
    if (typeof id !== 'string') return null;
    // IDs: alphanumeric + dash + dot + @ only
    return /^[\w.\-@]{1,128}$/.test(id) ? id : null;
  }
}

module.exports = { RuntimeController, INTENT_GRAPH_MAP, MIN_CONFIDENCE };

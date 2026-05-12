/**
 * FlowDesk: Classify User Intent
 * L1 keyword filter → L2 semantic search via Qdrant → L3 LLM classification
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');
const tpl = require('../../services/template-store.js');
const { keywordClassify } = require('../../services/keyword-filter.js');

// KB-driven config loader (lazy init)
let _configLoader = null;
function getConfigLoader() {
  if (!_configLoader) {
    try {
      const { getFlowDeskConfigLoader } = require('../../services/config-loader.service.js');
      _configLoader = getFlowDeskConfigLoader();
    } catch { _configLoader = null; }
  }
  return _configLoader;
}

/** Service categories passed to LLM for structured classification (FALLBACK) */
const SERVICE_CATEGORIES = [
  { code: 'IT-HW-LAP',   name: 'Laptop / Notebook request' },
  { code: 'IT-HW-DSK',   name: 'Desktop computer request' },
  { code: 'IT-HW-MON',   name: 'Monitor / Screen request' },
  { code: 'IT-HW-PRT',   name: 'Printer request' },
  { code: 'IT-HW-PER',   name: 'Peripherals (keyboard, mouse, headset, webcam)' },
  { code: 'IT-HW-REP',   name: 'Hardware repair' },
  { code: 'IT-SW-INS',   name: 'Software installation' },
  { code: 'IT-SW-LIC',   name: 'Software license' },
  { code: 'IT-SW-NEW',   name: 'New software request' },
  { code: 'IT-SW-ISS',   name: 'Software issue / bug' },
  { code: 'IT-NET-VPN',  name: 'VPN access' },
  { code: 'IT-NET-WIFI', name: 'WiFi / Wireless' },
  { code: 'IT-NET-ISS',  name: 'Network issue' },
  { code: 'IT-NET-DRV',  name: 'Shared / Network drive' },
  { code: 'IT-SEC-PWD',  name: 'Password reset' },
  { code: 'IT-SEC-UNL',  name: 'Unlock account' },
  { code: 'IT-SEC-MFA',  name: 'MFA / Two-factor setup' },
  { code: 'IT-SEC-INC',  name: 'Security incident' },
  { code: 'IT-SEC-SYS',  name: 'System access request' },
  { code: 'IT-COL-DL',   name: 'Distribution / Mailing list' },
  { code: 'IT-COL-SMB',  name: 'Shared mailbox' },
  { code: 'IT-COL-SP',   name: 'SharePoint site' },
  { code: 'IT-COL-TMS',  name: 'MS Teams channel / group' },
  { code: 'IT-COL-VID',  name: 'Video conferencing' },
  { code: 'HR-BEN-LEV',  name: 'Leave request / Annual leave' },
  { code: 'HR-BEN-CLM',  name: 'Insurance claim' },
  { code: 'HR-BEN-ENR',  name: 'Benefits enrollment' },
  { code: 'HR-BEN-INQ',  name: 'Benefits inquiry' },
  { code: 'HR-LD-TRN',   name: 'Training request' },
  { code: 'HR-LD-CRT',   name: 'Certification' },
  { code: 'HR-LD-CNF',   name: 'Conference attendance' },
  { code: 'HR-ONB-NEW',  name: 'New employee onboarding' },
  { code: 'HR-ONB-OFF',  name: 'Offboarding / Employee departure' },
  { code: 'HR-ONB-TRF',  name: 'Internal transfer' },
  { code: 'HR-ONB-CON',  name: 'Contractor onboarding' },
  { code: 'SEC-ACC-BDG',  name: 'Badge / Access card' },
  { code: 'SEC-ACC-VIS',  name: 'Visitor registration / badge' },
  { code: 'SEC-ACC-AFT',  name: 'After-hours access' },
  { code: 'SEC-ACC-PRM',  name: 'Access permission' },
  { code: 'FAC-CNF-RM',   name: 'Meeting room booking' },
  { code: 'FAC-CNF-EVT',  name: 'Event space booking' },
  { code: 'FAC-CNF-AV',   name: 'AV equipment' },
  { code: 'FAC-BLD-HVAC', name: 'Air conditioning / HVAC' },
  { code: 'FAC-BLD-LGT',  name: 'Lighting issue' },
  { code: 'FAC-BLD-CLN',  name: 'Cleaning request' },
  { code: 'FAC-BLD-MNT',  name: 'Maintenance request' },
  { code: 'FAC-BLD-FRN',  name: 'Furniture request' },
  { code: 'FAC-WS-HOT',   name: 'Hot desk / Flexible workspace' },
  { code: 'FAC-WS-OFC',   name: 'Office allocation' },
  { code: 'FAC-TRV-AUTH',  name: 'Travel authorization' },
  { code: 'FAC-TRV-FLT',  name: 'Flight booking' },
  { code: 'FAC-TRV-HTL',  name: 'Hotel booking' },
  { code: 'FAC-TRV-VIS',  name: 'Visa support' },
  { code: 'FAC-TRV-EXP',  name: 'Travel expense' },
  { code: 'FIN-AP-EXP',   name: 'Expense reimbursement' },
  { code: 'FIN-AP-INV',   name: 'Invoice submission' },
  { code: 'FIN-AP-STS',   name: 'Payment status' },
  { code: 'FIN-PR-REQ',   name: 'Purchase request' },
  { code: 'LOG-INV-SUP',  name: 'Office supplies' },
  { code: 'LOG-SHP-COR',  name: 'Courier service' },
  { code: 'COM-CRE-DES',  name: 'Graphic design' },
  { code: 'COM-CRE-VID',  name: 'Video production' },
];

const LLM_SYSTEM_PROMPT = `You are a service request classifier for a United Nations organization.
Given a user message, classify it into exactly one service category from the list below.
Respond ONLY with valid JSON: {"service_code":"<CODE>","service_name":"<NAME>","confidence":<0.0-1.0>,"reasoning":"<1 sentence>"}

If the message does not clearly match any category, set service_code to null and confidence to 0.

SERVICE CATEGORIES:
${SERVICE_CATEGORIES.map(c => `- ${c.code}: ${c.name}`).join('\n')}`;

class ClassifyIntentExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.classify_intent';
    this.displayName = 'Classify Intent';
    this.description = 'Classify user text into a service using keyword filter (L1), semantic search (L2), and LLM (L3)';
    this.domain = 'flowdesk';

    this.parameterSchema = {
      type: 'object',
      properties: {
        userInput: { type: 'string', description: 'User message text' },
        sessionId: { type: 'string', description: 'Dialog session ID' },
        useLLM:    { type: 'boolean', description: 'Enable L3 LLM classification (default: true)' },
      },
      required: [],
    };
  }

  async execute(parameters, context) {
    // Already classified in previous turn — pass through
    if (parameters.service_code) {
      return this.success({
        service_code: parameters.service_code,
        service_name: parameters.service_name,
        method: 'cached',
        branch: 'high_confidence',
        response: null,
      });
    }

    const userInput = parameters.userInput;
    if (!userInput) {
      return this.error('NO_INPUT', 'No user input provided', true);
    }

    try {
      // Load confidence thresholds from KB (with hardcoded fallback)
      const loader = getConfigLoader();
      let thresholds = { L1: { highThreshold: 0.95 }, L2: { highThreshold: 0.80, mediumThreshold: 0.55 }, L3: { highThreshold: 0.50 } };
      if (loader) {
        try { thresholds = await loader.getConfidenceThresholds() || thresholds; } catch {}
      }
      const l2High = thresholds.L2?.highThreshold ?? 0.80;
      const l2Medium = thresholds.L2?.mediumThreshold ?? 0.55;

      // ── L1: Keyword (deterministic, <1ms) ──
      const kwMatch = keywordClassify(userInput);

      if (kwMatch) {
        return this.success({
          service_code: kwMatch.service_code,
          method: 'keyword',
          confidence: 'high',
          score: kwMatch.confidence,
          alternatives: [],
          response: await tpl.render('classify_intent.keyword_match', { serviceCode: kwMatch.service_code }),
          branch: 'high_confidence',
        });
      }

      // ── L2: Semantic search via Qdrant ──
      let semanticResult = null;
      try {
        const search = require('../../services/semantic-search.js');
        await search.init();
        semanticResult = await search.classifyUserIntent(userInput);
      } catch (semanticErr) {
        console.warn('[FlowDesk] L2 semantic search failed, proceeding to L3:', semanticErr.message);
      }

      if (semanticResult?.top_match && semanticResult.confidence_score >= l2High) {
        return this.success({
          service_code: semanticResult.top_match.service_code,
          service_name: semanticResult.top_match.service_name,
          method: 'semantic',
          confidence: 'high',
          score: semanticResult.confidence_score,
          alternatives: semanticResult.alternatives || [],
          response: await tpl.render('classify_intent.semantic_match', { serviceName: semanticResult.top_match.service_name }),
          branch: 'high_confidence',
        });
      }

      if (semanticResult?.top_match && semanticResult.confidence_score >= l2Medium) {
        return this.success({
          service_code: semanticResult.top_match.service_code,
          service_name: semanticResult.top_match.service_name,
          method: 'semantic',
          confidence: 'medium',
          score: semanticResult.confidence_score,
          alternatives: semanticResult.alternatives || [],
          response: null,
          branch: 'medium_confidence',
        });
      }

      // ── L3: LLM classification ──
      const useLLM = parameters.useLLM !== false;
      const llm = context?.executionContext?.llm;

      if (useLLM && llm) {
        try {
          const llmResult = await this._llmClassify(llm, userInput, semanticResult);
          if (llmResult) return llmResult;
        } catch (llmErr) {
          console.warn('[FlowDesk] L3 LLM classification failed:', llmErr.message);
        }
      }

      // ── Fallback: low confidence ──
      return this.success({
        service_code: null,
        method: 'none',
        confidence: 'low',
        score: semanticResult?.top_match?.score || 0,
        alternatives: [],
        response: null,
        branch: 'low_confidence',
      });
    } catch (err) {
      return this.error('CLASSIFY_ERROR', err.message, true);
    }
  }

  /**
   * L3: LLM-powered intent classification.
   * Sends user text + service categories to LLM, expects structured JSON response.
   * Enriches with L2 semantic hints when available.
   */
  async _llmClassify(llm, userInput, semanticResult) {
    let userPrompt = userInput;

    // Load service categories from KB (fallback to hardcoded)
    const loader = getConfigLoader();
    let categories = SERVICE_CATEGORIES;
    if (loader) {
      try {
        const kbCategories = await loader.getServiceCategories(3); // L3 service-level
        if (kbCategories?.length > 0) categories = kbCategories;
      } catch {}
    }

    // Load L3 threshold from KB
    let l3Threshold = 0.50;
    if (loader) {
      try {
        const t = await loader.getConfidenceThresholds('L3');
        if (t?.highThreshold) l3Threshold = t.highThreshold;
      } catch {}
    }

    // Build dynamic LLM system prompt from loaded categories
    const categoryList = categories.map(c => `- ${c.code}: ${c.name}`).join('\n');
    const systemPrompt = `You are a service request classifier for a United Nations organization.
Given a user message, classify it into exactly one service category from the list below.
Respond ONLY with valid JSON: {"service_code":"<CODE>","service_name":"<NAME>","confidence":<0.0-1.0>,"reasoning":"<1 sentence>"}

If the message does not clearly match any category, set service_code to null and confidence to 0.

SERVICE CATEGORIES:
${categoryList}`;

    // Provide L2 semantic hints to help LLM when available
    if (semanticResult?.top_match) {
      const hints = [semanticResult.top_match, ...(semanticResult.alternatives || [])].slice(0, 3);
      const hintText = hints.map(h => `${h.service_code} (${h.service_name}, score: ${h.score?.toFixed(2)})`).join(', ');
      userPrompt = `User message: "${userInput}"\n\nSemantic search hints (not authoritative): ${hintText}`;
    }

    const response = await llm.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], { max_tokens: 200 });

    const parsed = JSON.parse(response);

    if (!parsed.service_code || parsed.confidence < l3Threshold) {
      return null; // LLM not confident enough → fall through to low_confidence
    }

    // Validate service_code exists in catalog
    const validCode = categories.find(c => c.code === parsed.service_code);
    if (!validCode) {
      console.warn(`[FlowDesk] LLM returned unknown service_code: ${parsed.service_code}`);
      return null;
    }

    const confidence = parsed.confidence >= 0.80 ? 'high' : 'medium';
    const branch = confidence === 'high' ? 'high_confidence' : 'medium_confidence';

    return this.success({
      service_code: parsed.service_code,
      service_name: parsed.service_name || validCode.name,
      method: 'llm',
      confidence,
      score: parsed.confidence,
      reasoning: parsed.reasoning || null,
      alternatives: semanticResult?.alternatives || [],
      response: confidence === 'high'
        ? await tpl.render('classify_intent.semantic_match', { serviceName: parsed.service_name || validCode.name })
        : null,
      branch,
    });
  }
}

module.exports = { ClassifyIntentExecutor, SERVICE_CATEGORIES, LLM_SYSTEM_PROMPT };

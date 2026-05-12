'use strict';

/**
 * TASK-FLOWDESK-007: L1 Keyword Filter — Deterministic Pre-filter
 *
 * Bypasses Qdrant for obvious requests. <1ms latency.
 * Returns null if no confident match → falls through to L2 Semantic Router.
 */

// Multilingual keyword rules: pattern → service_code
// Order matters: more specific patterns first
const KEYWORD_RULES = [
  // ── IT Security ──
  { pattern: /\b(password\s*reset|reset\s*password|сброс\s*парол|réinitialiser?\s*mot\s*de\s*passe|restablecer\s*contraseña|forgot\s*password|забыл\s*парол)\b/i, service: 'IT-SEC-PWD' },
  { pattern: /\b(unlock\s*account|account\s*locked|разблокировать|débloquer\s*compte|cuenta\s*bloqueada)\b/i, service: 'IT-SEC-UNL' },
  { pattern: /\b(mfa\s*setup|mfa\s*reset|two\s*factor|authenticator)\b/i, service: 'IT-SEC-MFA' },
  { pattern: /\b(security\s*incident|breach|phishing|взлом|incident\s*de\s*sécurité)\b/i, service: 'IT-SEC-INC' },
  { pattern: /\b(system\s*access\s*request|access\s*to\s*system|доступ\s*к\s*систем)\b/i, service: 'IT-SEC-SYS' },

  // ── IT Hardware ──
  { pattern: /\b(laptop|notebook|ноутбук|ordinateur\s*portable|portátil|computadora\s*portátil|笔记本电脑)\b/i, service: 'IT-HW-LAP' },
  { pattern: /\b(desktop\s*(computer|pc|request)|настольн|ordinateur\s*de\s*bureau)\b/i, service: 'IT-HW-DSK' },
  { pattern: /\b(monitor|screen|écran|монитор|экран|pantalla|显示器)\b/i, service: 'IT-HW-MON' },
  { pattern: /\b(printer|принтер|imprimante|impresora|打印机)\b/i, service: 'IT-HW-PRT' },
  { pattern: /\b(keyboard|mouse|headset|webcam|peripher|клавиатур|мыш|наушник)\b/i, service: 'IT-HW-PER' },
  { pattern: /\b(hardware\s*repair|broken\s*hardware|ремонт\s*оборудован)\b/i, service: 'IT-HW-REP' },

  // ── IT Network ──
  { pattern: /\b(vpn\s*access|vpn\s*request|доступ\s*vpn|accès\s*vpn)\b/i, service: 'IT-NET-VPN' },
  { pattern: /\b(wifi|wi-fi|wireless|беспроводн)\b/i, service: 'IT-NET-WIFI' },
  { pattern: /\b(network\s*(issue|problem|down)|сет(ь|евой)\s*(не работа|проблем))\b/i, service: 'IT-NET-ISS' },
  { pattern: /\b(shared\s*drive|network\s*drive|сетевой\s*диск)\b/i, service: 'IT-NET-DRV' },

  // ── IT Software ──
  { pattern: /\b(install\s*software|software\s*install|установить\s*программ)\b/i, service: 'IT-SW-INS' },
  { pattern: /\b(software\s*license|лицензи|licence\s*logiciel)\b/i, service: 'IT-SW-LIC' },
  { pattern: /\b(new\s*software\s*request|request\s*new\s*software|новое\s*по)\b/i, service: 'IT-SW-NEW' },
  { pattern: /\b(software\s*(issue|problem|crash|bug|error)|программ.{0,5}(ошибк|проблем|не\s*работа))\b/i, service: 'IT-SW-ISS' },

  // ── IT Collaboration ──
  { pattern: /\b(distribution\s*list|mailing\s*list|список\s*рассылк|liste\s*de\s*distribution)\b/i, service: 'IT-COL-DL' },
  { pattern: /\b(shared\s*mailbox|общий\s*почтовый\s*ящик)\b/i, service: 'IT-COL-SMB' },
  { pattern: /\b(sharepoint\s*site|sharepoint\s*request)\b/i, service: 'IT-COL-SP' },
  { pattern: /\b(teams\s*(channel|request|group)|ms\s*teams)\b/i, service: 'IT-COL-TMS' },
  { pattern: /\b(video\s*conference|видеоконференц|visioconférence)\b/i, service: 'IT-COL-VID' },

  // ── HR Benefits ──
  { pattern: /\b(leave\s*request|annual\s*leave|отпуск|congé\s*annuel|vacaciones|请假)\b/i, service: 'HR-BEN-LEV' },
  { pattern: /\b(insurance\s*claim|страхов|réclamation\s*d'assurance)\b/i, service: 'HR-BEN-CLM' },
  { pattern: /\b(benefits?\s*enrol|enrollment|подписк.{0,5}льгот)\b/i, service: 'HR-BEN-ENR' },
  { pattern: /\b(benefits?\s*(inquiry|question)|вопрос.{0,5}льгот)\b/i, service: 'HR-BEN-INQ' },

  // ── HR Learning ──
  { pattern: /\b(training\s*request|запрос\s*на\s*обучен|demande\s*de\s*formation)\b/i, service: 'HR-LD-TRN' },
  { pattern: /\b(certification|сертификац)\b/i, service: 'HR-LD-CRT' },
  { pattern: /\b(conference\s*attendance|участие\s*в\s*конференц)\b/i, service: 'HR-LD-CNF' },

  // ── HR Onboarding ──
  { pattern: /\b(new\s*employee\s*setup|onboarding|адаптация\s*нового\s*сотрудник)\b/i, service: 'HR-ONB-NEW' },
  { pattern: /\b(offboarding|employee\s*departure|увольнен)\b/i, service: 'HR-ONB-OFF' },
  { pattern: /\b(internal\s*transfer|перевод\s*сотрудник)\b/i, service: 'HR-ONB-TRF' },
  { pattern: /\b(contractor\s*onboarding|onboard\s*contractor)\b/i, service: 'HR-ONB-CON' },

  // ── Security ──
  { pattern: /\b(badge|access\s*card|пропуск|badge\s*d'accès|tarjeta\s*de\s*acceso|门禁卡)\b/i, service: 'SEC-ACC-BDG' },
  { pattern: /\b(visitor\s*(registration|badge|pass)|гост.{0,5}пропуск|badge\s*visiteur)\b/i, service: 'SEC-ACC-VIS' },
  { pattern: /\b(after.hours\s*access|доступ\s*в\s*нерабоч|accès\s*après\s*les\s*heures)\b/i, service: 'SEC-ACC-AFT' },
  { pattern: /\b(access\s*permission|permission\s*d'accès|разрешение\s*на\s*доступ)\b/i, service: 'SEC-ACC-PRM' },

  // ── Facilities ──
  { pattern: /\b(meeting\s*room|book\s*room|conference\s*room\s*book|забронировать\s*переговорн|salle\s*de\s*réunion)\b/i, service: 'FAC-CNF-RM' },
  { pattern: /\b(event\s*space|book\s*event|мероприятие\s*зал)\b/i, service: 'FAC-CNF-EVT' },
  { pattern: /\b(av\s*equipment|audio\s*visual|аудио\s*оборудован)\b/i, service: 'FAC-CNF-AV' },
  { pattern: /\b(air\s*condition|hvac|ac\s*(not\s*working|broken)|кондиционер|climatisation)\b/i, service: 'FAC-BLD-HVAC' },
  { pattern: /\b(light(s|ing)\s*(issue|broken|flickering)|освещени|éclairage)\b/i, service: 'FAC-BLD-LGT' },
  { pattern: /\b(cleaning\s*request|уборк|nettoyage)\b/i, service: 'FAC-BLD-CLN' },
  { pattern: /\b(maintenance\s*request|ремонт\s*помещен|demande\s*de\s*maintenance)\b/i, service: 'FAC-BLD-MNT' },
  { pattern: /\b(furniture|мебел|mobilier|mueble)\b/i, service: 'FAC-BLD-FRN' },
  { pattern: /\b(hot\s*desk|hotdesk|гибкое\s*рабочее\s*место)\b/i, service: 'FAC-WS-HOT' },
  { pattern: /\b(office\s*allocation|выделение\s*офис)\b/i, service: 'FAC-WS-OFC' },

  // ── Travel ──
  { pattern: /\b(travel\s*authorization|разрешение\s*на\s*поездк|autorisation\s*de\s*voyage)\b/i, service: 'FAC-TRV-AUTH' },
  { pattern: /\b(flight\s*book|book\s*flight|забронировать\s*рейс|réserver\s*un\s*vol)\b/i, service: 'FAC-TRV-FLT' },
  { pattern: /\b(hotel\s*book|book\s*hotel|забронировать\s*гостиниц|réserver\s*hôtel)\b/i, service: 'FAC-TRV-HTL' },
  { pattern: /\b(visa\s*support|visa\s*request|виз.{0,3}поддержк)\b/i, service: 'FAC-TRV-VIS' },
  { pattern: /\b(travel\s*expense|expense\s*claim|командировочн|frais\s*de\s*voyage)\b/i, service: 'FAC-TRV-EXP' },

  // ── Finance ──
  { pattern: /\b(expense\s*reimburse|reimburse\s*expense|возмещение\s*расход)\b/i, service: 'FIN-AP-EXP' },
  { pattern: /\b(invoice\s*submit|submit\s*invoice|подать\s*счёт)\b/i, service: 'FIN-AP-INV' },
  { pattern: /\b(payment\s*status|статус\s*платеж)\b/i, service: 'FIN-AP-STS' },
  { pattern: /\b(purchase\s*request|запрос\s*на\s*закупк|demande\s*d'achat)\b/i, service: 'FIN-PR-REQ' },

  // ── Logistics ──
  { pattern: /\b(office\s*supplies|канцелярск|fournitures\s*de\s*bureau)\b/i, service: 'LOG-INV-SUP' },
  { pattern: /\b(courier|курьер|coursier)\b/i, service: 'LOG-SHP-COR' },

  // ── Communications ──
  { pattern: /\b(graphic\s*design|графическ.{0,5}дизайн|conception\s*graphique)\b/i, service: 'COM-CRE-DES' },
  { pattern: /\b(video\s*production|видеопроизводств|production\s*vidéo)\b/i, service: 'COM-CRE-VID' },
];

// Simple keyword-to-service map for non-Latin languages (Cyrillic, Arabic, Chinese)
// Uses string includes() since \b doesn't work with Unicode
const SIMPLE_KEYWORDS = [
  // Russian
  { kw: 'сброс парол', service: 'IT-SEC-PWD' },
  { kw: 'забыл парол', service: 'IT-SEC-PWD' },
  { kw: 'разблокировать', service: 'IT-SEC-UNL' },
  { kw: 'ноутбук', service: 'IT-HW-LAP' },
  { kw: 'монитор', service: 'IT-HW-MON' },
  { kw: 'принтер', service: 'IT-HW-PRT' },
  { kw: 'клавиатур', service: 'IT-HW-PER' },
  { kw: 'отпуск', service: 'HR-BEN-LEV' },
  { kw: 'больничн', service: 'HR-BEN-LEV' },
  { kw: 'пропуск', service: 'SEC-ACC-BDG' },
  { kw: 'кондиционер', service: 'FAC-BLD-HVAC' },
  { kw: 'переговорн', service: 'FAC-CNF-RM' },
  { kw: 'канцелярск', service: 'LOG-INV-SUP' },
  { kw: 'курьер', service: 'LOG-SHP-COR' },
  { kw: 'обучен', service: 'HR-LD-TRN' },
  // Arabic
  { kw: 'كمبيوتر محمول', service: 'IT-HW-LAP' },
  { kw: 'كلمة المرور', service: 'IT-SEC-PWD' },
  { kw: 'إجازة', service: 'HR-BEN-LEV' },
  // Chinese
  { kw: '笔记本电脑', service: 'IT-HW-LAP' },
  { kw: '密码重置', service: 'IT-SEC-PWD' },
  { kw: '请假', service: 'HR-BEN-LEV' },
  { kw: '显示器', service: 'IT-HW-MON' },
  { kw: '打印机', service: 'IT-HW-PRT' },
];

// ── KB-driven keyword rules (loaded once, cached) ──

let _kbRulesCache = null;
let _kbRulesCacheTs = 0;
const KB_CACHE_TTL_MS = 300000; // 5 min

async function loadKBKeywordRules() {
  if (_kbRulesCache && (Date.now() - _kbRulesCacheTs) < KB_CACHE_TTL_MS) {
    return _kbRulesCache;
  }
  try {
    const { getFlowDeskConfigLoader } = require('./config-loader.service.js');
    const loader = getFlowDeskConfigLoader();
    const rules = await loader.getKeywordRules('en');
    if (rules?.length > 0) {
      _kbRulesCache = rules.map(r => ({
        pattern: new RegExp(r.pattern, 'i'),
        service: r.category,
      }));
      _kbRulesCacheTs = Date.now();
      return _kbRulesCache;
    }
  } catch { /* fallback to hardcoded */ }
  return null;
}

/**
 * Classify user text using deterministic keyword matching.
 * Returns match object or null (→ fallback to L2 Semantic Router).
 *
 * @param {string} text - User input
 * @returns {{ service_code: string, confidence: number, match_type: string, matched_pattern: string } | null}
 */
function keywordClassify(text) {
  if (!text || text.length < 2) return null;

  const normalized = text.toLowerCase().trim();

  // Check regex patterns (Latin-friendly with \b)
  for (const rule of KEYWORD_RULES) {
    const match = normalized.match(rule.pattern);
    if (match) {
      return {
        service_code: rule.service,
        confidence: 0.95,
        match_type: 'keyword',
        matched_pattern: match[0],
      };
    }
  }

  // Check simple keywords (Unicode/Cyrillic/Arabic/Chinese — \b doesn't work)
  for (const rule of SIMPLE_KEYWORDS) {
    if (normalized.includes(rule.kw)) {
      return {
        service_code: rule.service,
        confidence: 0.95,
        match_type: 'keyword',
        matched_pattern: rule.kw,
      };
    }
  }

  return null;
}

/**
 * Async version: tries KB rules first, falls back to hardcoded.
 * @param {string} text
 * @returns {Promise<object|null>}
 */
async function keywordClassifyAsync(text) {
  if (!text || text.length < 2) return null;

  const normalized = text.toLowerCase().trim();

  // Try KB-loaded rules first
  const kbRules = await loadKBKeywordRules();
  if (kbRules) {
    for (const rule of kbRules) {
      const match = normalized.match(rule.pattern);
      if (match) {
        return {
          service_code: rule.service,
          confidence: 0.95,
          match_type: 'keyword_kb',
          matched_pattern: match[0],
        };
      }
    }
  }

  // Fallback to hardcoded rules
  return keywordClassify(text);
}

module.exports = { keywordClassify, keywordClassifyAsync, KEYWORD_RULES };

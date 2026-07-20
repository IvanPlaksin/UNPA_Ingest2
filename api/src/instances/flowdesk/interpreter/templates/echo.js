'use strict';

/**
 * Echo preamble templates (F9.3b/R7). Builds a short "understood: …" acknowledgment
 * of what the interpreter extracted from the user's message this turn, shown
 * before the question/interactive component. Localized (F9.3e fills the stubs).
 *
 * @module instances/flowdesk/interpreter/templates/echo
 */

const ECHO_TEMPLATES = {
  en: {
    understood: 'Got it:',
    forWord: 'for',
    locationWord: 'location',
    assets: { laptop_standard: 'a laptop', laptop_engineering: 'an engineering laptop', desktop: 'a desktop', monitor: 'a monitor' },
    fallbackItem: 'a device',
  },
  ru: {
    understood: 'Понял:',
    forWord: 'для',
    locationWord: 'локация',
    assets: { laptop_standard: 'ноутбук', laptop_engineering: 'мощный ноутбук', desktop: 'рабочая станция', monitor: 'монитор' },
    fallbackItem: 'устройство',
  },
  fr: {
    understood: 'Compris :', forWord: 'pour', locationWord: 'lieu',
    assets: { laptop_standard: 'un ordinateur portable', laptop_engineering: 'un portable puissant', desktop: 'un poste de travail', monitor: 'un écran' },
    fallbackItem: 'un appareil',
  },
  es: {
    understood: 'Entendido:', forWord: 'para', locationWord: 'ubicación',
    assets: { laptop_standard: 'un portátil', laptop_engineering: 'un portátil de alto rendimiento', desktop: 'una estación de trabajo', monitor: 'un monitor' },
    fallbackItem: 'un dispositivo',
  },
  ar: {
    understood: 'فهمت:', forWord: 'لصالح', locationWord: 'الموقع',
    assets: { laptop_standard: 'حاسوب محمول', laptop_engineering: 'حاسوب محمول عالي الأداء', desktop: 'محطة عمل', monitor: 'شاشة' },
    fallbackItem: 'جهاز',
  },
  zh: {
    understood: '明白了：', forWord: '给', locationWord: '地点',
    assets: { laptop_standard: '笔记本电脑', laptop_engineering: '高性能笔记本电脑', desktop: '工作站', monitor: '显示器' },
    fallbackItem: '设备',
  },
};

function tpl(lang) { return ECHO_TEMPLATES[lang] || ECHO_TEMPLATES.en; }

/**
 * @param {Object} extracted - { assetType?, beneficiaryName?, location?, other?: string[] }
 *   `other` = display strings for any additional slots extracted this turn, so
 *   the echo covers EVERYTHING understood (ADCC-089, no silent interpretation).
 * @param {string} [lang='ru']
 * @returns {string|null} preamble, or null when nothing was extracted
 */
// Never echo an unresolved placeholder or the bare self-marker as if it were a
// real name (surfaced by live extraction returning "<UNKNOWN>"/"self").
const isEchoable = (v) => v && !/^<?\s*unknown\s*>?$/i.test(String(v).trim()) && String(v).trim().toLowerCase() !== 'self';

function buildPreamble(extracted, lang = 'ru') {
  const T = tpl(lang);
  const parts = [];
  if (extracted.assetType) parts.push(T.assets[extracted.assetType] || T.fallbackItem);
  if (isEchoable(extracted.beneficiaryName)) parts.push(`${T.forWord} ${extracted.beneficiaryName}`);
  if (isEchoable(extracted.location)) parts.push(`${T.locationWord} ${extracted.location}`);
  for (const o of extracted.other || []) if (isEchoable(o)) parts.push(String(o));
  if (!parts.length) {
    // Something was extracted but not specifically templated → generic ack so the
    // grounding is never silent (ADCC-089).
    return extracted.hasAny ? T.understood.replace(/[:：]\s*$/, '.') : null;
  }
  return `${T.understood} ${parts.join(' ')}.`;
}

class GroundingViolationError extends Error {
  constructor(slots) {
    super(`ADCC-089: silent interpretation detected — extracted [${slots.join(', ')}] without an echo`);
    this.name = 'GroundingViolationError';
    this.code = 'GROUNDING_VIOLATION';
    this.slots = slots;
  }
}

/**
 * Enforce mandatory grounding (ADCC-089): if any value was extracted from the
 * user's text this turn, the turn MUST carry a non-empty preamble echoing it.
 * @throws {GroundingViolationError}
 */
function validateGrounding(extractedSlotIds, preamble) {
  if ((extractedSlotIds || []).length > 0 && !preamble) {
    throw new GroundingViolationError(extractedSlotIds);
  }
  return true;
}

module.exports = { buildPreamble, ECHO_TEMPLATES, validateGrounding, GroundingViolationError };

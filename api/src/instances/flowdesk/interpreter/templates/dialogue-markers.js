'use strict';

/**
 * Dialogue meta-markers (F10b / ADCC-096, ADCC-087) — the deterministic,
 * language-agnostic dictionary the REPAIR_ROUTER uses to recognise the SIX
 * universal actions and user-initiated repair markers BEFORE any LLM sees the
 * message. Detection is deterministic (ADCC-099): no model call, no ambiguity.
 *
 * Coverage: the 6 UN official languages (en/ru/fr/es/ar/zh). Matching is
 * whole-token for space-delimited scripts (Unicode lookaround, since \b is
 * ASCII-only and fails after Cyrillic/Arabic) and substring for CJK, which has
 * no word boundaries.
 *
 * @module instances/flowdesk/interpreter/templates/dialogue-markers
 */

// The six universal actions (ADCC-096). Order is the escalation-neutral list.
const UNIVERSAL_ACTIONS = {
  repeat: [
    'repeat', 'say again', 'again', 'come again',
    'повтори', 'повторите', 'ещё раз', 'еще раз',
    'répéter', 'répète', 'redis',
    'repite', 'repetir', 'otra vez', 'de nuevo',
    'أعد', 'كرر', 'مرة أخرى',
    '重复', '再说一遍', '再说',
  ],
  rephrase: [
    'rephrase', 'reword', 'what do you mean', 'i dont understand', "i don't understand",
    'i do not understand', 'explain', 'clarify', 'not clear',
    'переформулируй', 'не понимаю', 'что значит', 'поясни', 'непонятно', 'объясни',
    'reformuler', 'que voulez-vous dire', "je ne comprends pas", 'expliquer', 'clarifier',
    'reformular', 'no entiendo', 'qué significa', 'que significa', 'explica', 'aclarar',
    'لم أفهم', 'ماذا تعني', 'وضح', 'اشرح',
    '没听懂', '什么意思', '解释', '不明白',
  ],
  skip: [
    'skip', 'skip this', 'next', 'pass', 'leave it', 'not now',
    'пропусти', 'пропустить', 'дальше', 'потом', 'следующий',
    'passer', 'ignorer', 'plus tard', 'suivant',
    'saltar', 'omitir', 'siguiente', 'más tarde', 'mas tarde',
    'تخطى', 'تجاوز', 'تخط', 'لاحقا',
    '跳过', '下一个', '略过', '稍后',
  ],
  cancel: [
    'cancel', 'stop', 'never mind', 'nevermind', 'forget it', 'abort', 'quit',
    'отмена', 'отменить', 'отмени', 'стоп', 'забудь', 'прекрати', 'прекратить',
    'annuler', 'arrêter', 'arrete', 'laisse tomber', 'stop',
    'cancelar', 'detener', 'olvídalo', 'olvidalo', 'para',
    'إلغاء', 'ألغ', 'توقف', 'انس الأمر',
    '取消', '停止', '算了', '别管了',
  ],
  capabilities: [
    'what can you do', 'help', 'capabilities', 'what can you help', 'options',
    'what do you do', 'menu',
    'что ты умеешь', 'помощь', 'возможности', 'что ты можешь', 'помоги', 'меню',
    'que peux-tu faire', 'aide', 'capacités', 'options', 'aidez-moi',
    'qué puedes hacer', 'que puedes hacer', 'ayuda', 'opciones', 'capacidades',
    'ماذا يمكنك', 'مساعدة', 'ساعدني', 'الخيارات',
    '你能做什么', '帮助', '功能', '选项',
  ],
  restart: [
    'start over', 'restart', 'reset', 'begin again', 'start again', 'from scratch',
    'начать заново', 'сначала', 'заново', 'сброс', 'начни заново', 'с начала',
    'recommencer', 'redémarrer', 'redemarrer', 'depuis le début', 'tout recommencer',
    'empezar de nuevo', 'reiniciar', 'de cero', 'volver a empezar',
    'ابدأ من جديد', 'إعادة', 'من البداية', 'أعد البدء',
    '重新开始', '重来', '从头开始', '重置',
  ],
};

// User-initiated repair markers (ADCC-087). Kept conservative — explicit
// correction cues only; the full correction machinery lands in F10c.
const REPAIR_MARKERS = [
  'actually', 'i meant', 'i mean', 'no wait', 'not that', 'rather', 'instead', 'correction',
  'на самом деле', 'я имел в виду', 'я имею в виду', 'вообще-то', 'не то', 'нет, я',
  'en fait', 'je voulais dire', 'non attends', 'plutôt', 'au lieu',
  'en realidad', 'quería decir', 'queria decir', 'no espera', 'más bien', 'mas bien',
  'في الحقيقة', 'قصدت', 'بل', 'لا أقصد',
  '其实', '我是说', '不对', '我的意思是',
];

const CJK_RE = /[㐀-鿿]/;

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Whole-token (or CJK-substring) match of `phrase` inside normalized `text`. */
function phraseMatches(text, phrase) {
  if (CJK_RE.test(phrase)) return text.includes(phrase);
  // Unicode lookaround: no letter immediately adjacent (handles Cyrillic/Arabic).
  return new RegExp(`(?<![\\p{L}])${escapeRe(phrase)}(?![\\p{L}])`, 'iu').test(text);
}

function matchAny(text, phrases) {
  return phrases.some((p) => phraseMatches(text, p));
}

/** @returns {string|null} the universal-action id (repeat/rephrase/skip/cancel/capabilities/restart) or null. */
function detectUniversalAction(message) {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return null;
  for (const [action, phrases] of Object.entries(UNIVERSAL_ACTIONS)) {
    if (matchAny(text, phrases)) return action;
  }
  return null;
}

// The "not X — Y" / "нет, X - Y" correction form (ADCC-087): a negation token
// followed later by a dash separator. Kept narrow (requires the dash) to avoid
// firing on ordinary negated statements.
const CORRECTION_FORM_RE = /(?<![\p{L}])(not|нет|non|no|لا|不)(?![\p{L}])[^.!?]*[—–-]/iu;

/** @returns {boolean} true if the message carries an explicit repair/correction marker. */
function detectRepairMarker(message) {
  const text = String(message || '').trim();
  if (!text) return false;
  if (CORRECTION_FORM_RE.test(text)) return true;
  return matchAny(text.toLowerCase(), REPAIR_MARKERS);
}

/** Any meta-marker (universal action OR repair marker) → not a plain answer. */
function isMetaMarker(message) {
  return detectUniversalAction(message) !== null || detectRepairMarker(message);
}

module.exports = {
  UNIVERSAL_ACTIONS,
  REPAIR_MARKERS,
  detectUniversalAction,
  detectRepairMarker,
  isMetaMarker,
  phraseMatches,
};

'use strict';

/**
 * Disambiguation voice utilities (VF-2) — turn a set of near-tie candidates (a
 * service cluster, or directory matches for a slot) into a SPEAKABLE enumeration:
 * announce the count, then read each option out with only the attributes that
 * actually DISTINGUISH it, so a voice user can pick. Hybrid design (PO+architect):
 * this code computes the structured content (which fields differ, ordered for
 * voice) and the phrasing comes from a localized guidance object that the Prompt
 * Editor graph can override (see getDisambiguationGuidance in the engine).
 *
 * @module instances/flowdesk/interpreter/disambiguation-utils
 */

const { numberToWords } = require('./voice-formatters');

/** Fields that differ across options, ordered by discrimination power (most unique first). */
function computeDistinguishingFields(options, candidateFields) {
  if (!Array.isArray(options) || options.length <= 1) return [];
  const scored = [];
  for (const field of candidateFields) {
    const values = options.map((o) => o && o[field]).filter((v) => v != null && v !== '');
    const unique = new Set(values.map((v) => String(v).toLowerCase()));
    if (unique.size > 1) scored.push([field, unique.size]);
  }
  return scored.sort((a, b) => b[1] - a[1]).map(([f]) => f);
}

// Voice recognizability order (lower = spoken first). Covers people/location/service.
const VOICE_FIELD_PRIORITY = {
  name: 1, department: 2, unit: 2, title: 3, email: 4, location: 5,
  building: 6, city: 6, category: 2, service: 2, status: 2, ref: 1, createdAt: 7,
};

/**
 * Pick the fields to speak for voice: ALWAYS lead with the primary identifier
 * (`always`, e.g. 'name' — so an option is nameable even when the name itself is
 * not what distinguishes it), then the top distinguishing fields. If nothing
 * distinguishes, fall back to `fallback`.
 */
function selectVoiceFields(distinguishing, { maxFields = 3, fallback = ['name'], always = ['name'] } = {}) {
  const pool = (distinguishing && distinguishing.length) ? distinguishing : fallback;
  const ordered = [...pool].sort((a, b) => (VOICE_FIELD_PRIORITY[a] || 99) - (VOICE_FIELD_PRIORITY[b] || 99));
  const merged = [];
  for (const f of [...always, ...ordered]) if (!merged.includes(f)) merged.push(f);
  return merged.slice(0, maxFields);
}

/** One option → "John Smith, in OICT, email j.smith@un.org" using the guidance field formatters. */
function formatOption(option, fields, formatters = {}) {
  return fields
    .map((f) => ({ f, v: option ? option[f] : null }))
    .filter(({ v }) => v != null && v !== '')
    .map(({ f, v }) => (formatters[f] || '{value}').replace('{value}', String(v)))
    .join(', ');
}

/**
 * Build the spoken enumeration. `options` are already normalized to flat objects.
 * `guidance` is the localized phrasing set (English defaults in DEFAULT_GUIDANCE).
 * @returns {string} speech
 */
function buildDisambiguationSpeech(options, fields, guidance, { query = '', numberWords } = {}) {
  const g = guidance || DEFAULT_GUIDANCE.en;
  const list = Array.isArray(options) ? options : [];
  if (list.length === 0) return g.none.replace('{query}', query);
  if (list.length === 1) return g.single.replace('{option}', formatOption(list[0], fields, g.fieldFormatters));

  const n = numberToWords(list.length, numberWords);
  const parts = [g.intro.replace('{count}', n)];
  const shown = list.slice(0, g.maxSpoken || 5);
  shown.forEach((opt, i) => {
    const ordinal = (g.ordinals && g.ordinals[i]) || `${i + 1}`;
    parts.push(g.item.replace('{ordinal}', ordinal).replace('{fields}', formatOption(opt, fields, g.fieldFormatters)));
  });
  if (list.length > shown.length) {
    parts.push(g.more.replace('{remaining}', numberToWords(list.length - shown.length, numberWords)));
  }
  parts.push(g.ask);
  return parts.join(' ');
}

// ── Localized phrasing (Prompt Editor may override per node/lang) ──────────────
const FF = { // English field formatters
  name: '{value}', title: '{value}', service: '{value}', category: 'in {value}',
  department: 'in {value}', unit: 'in {value}', email: 'email {value}',
  location: 'at {value}', building: 'building {value}', city: 'in {value}',
  status: 'status {value}', ref: '{value}',
};
const DEFAULT_GUIDANCE = {
  en: { intro: 'I found {count} options.', item: '{ordinal}: {fields}.', more: 'There are {remaining} more.', ask: 'Which one did you mean?', single: 'I found one match: {option}.', none: 'I could not find any matches for {query}.', ordinals: ['First', 'Second', 'Third', 'Fourth', 'Fifth'], maxSpoken: 5, fieldFormatters: FF },
  ru: { intro: 'Я нашёл {count} варианта.', item: '{ordinal}: {fields}.', more: 'Есть ещё {remaining}.', ask: 'Какой из них вы имели в виду?', single: 'Найден один вариант: {option}.', none: 'Ничего не найдено по запросу «{query}».', ordinals: ['Первый', 'Второй', 'Третий', 'Четвёртый', 'Пятый'], maxSpoken: 5, fieldFormatters: { name: '{value}', title: '{value}', service: '{value}', category: 'в {value}', department: 'в {value}', unit: 'в {value}', email: 'почта {value}', location: 'в {value}', building: 'здание {value}', city: 'в {value}', status: 'статус {value}', ref: '{value}' } },
  fr: { intro: 'J’ai trouvé {count} options.', item: '{ordinal} : {fields}.', more: 'Il y en a {remaining} de plus.', ask: 'Laquelle vouliez-vous dire ?', single: 'J’ai trouvé une correspondance : {option}.', none: 'Aucune correspondance pour {query}.', ordinals: ['Premier', 'Deuxième', 'Troisième', 'Quatrième', 'Cinquième'], maxSpoken: 5, fieldFormatters: { name: '{value}', title: '{value}', service: '{value}', category: 'dans {value}', department: 'à {value}', unit: 'à {value}', email: 'courriel {value}', location: 'à {value}', building: 'bâtiment {value}', city: 'à {value}', status: 'statut {value}', ref: '{value}' } },
  es: { intro: 'Encontré {count} opciones.', item: '{ordinal}: {fields}.', more: 'Hay {remaining} más.', ask: '¿A cuál se refería?', single: 'Encontré una coincidencia: {option}.', none: 'No encontré coincidencias para {query}.', ordinals: ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta'], maxSpoken: 5, fieldFormatters: { name: '{value}', title: '{value}', service: '{value}', category: 'en {value}', department: 'en {value}', unit: 'en {value}', email: 'correo {value}', location: 'en {value}', building: 'edificio {value}', city: 'en {value}', status: 'estado {value}', ref: '{value}' } },
  ar: { intro: 'وجدت {count} خيارات.', item: '{ordinal}: {fields}.', more: 'يوجد {remaining} أخرى.', ask: 'أيها تقصد؟', single: 'وجدت نتيجة واحدة: {option}.', none: 'لم أجد نتائج لـ {query}.', ordinals: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس'], maxSpoken: 5, fieldFormatters: { name: '{value}', title: '{value}', service: '{value}', category: 'في {value}', department: 'في {value}', unit: 'في {value}', email: 'البريد {value}', location: 'في {value}', building: 'مبنى {value}', city: 'في {value}', status: 'الحالة {value}', ref: '{value}' } },
  zh: { intro: '我找到 {count} 个选项。', item: '第{ordinal}：{fields}。', more: '还有 {remaining} 个。', ask: '您指的是哪一个？', single: '找到一个匹配：{option}。', none: '未找到与 {query} 匹配的结果。', ordinals: ['一', '二', '三', '四', '五'], maxSpoken: 5, fieldFormatters: { name: '{value}', title: '{value}', service: '{value}', category: '（{value}）', department: '（{value}）', unit: '（{value}）', email: '邮箱 {value}', location: '在 {value}', building: '楼 {value}', city: '在 {value}', status: '状态 {value}', ref: '{value}' } },
};
function defaultGuidance(lang) { return DEFAULT_GUIDANCE[String(lang || 'en').split('-')[0]] || DEFAULT_GUIDANCE.en; }

// ── Normalizers: candidate shapes → flat option objects for enumeration ────────
const flatUser = (u) => (u && typeof u === 'object' ? {
  name: u.name || u.displayName, email: u.email,
  department: (u.unit && (u.unit.name || u.unit)) || u.department || u.orgUnit,
  title: u.title || u.jobTitle,
  location: u.location && (u.location.name || u.location.code || u.location),
} : { name: String(u) });
const flatLocation = (l) => (l && typeof l === 'object' ? {
  name: l.name || l.code, building: l.building, city: l.city, ref: l.code,
} : { name: String(l) });
const flatService = (c) => ({ name: c.title || c.name, category: c.domain || c.category, ref: c.serviceId });

const USER_CANDIDATE_FIELDS = ['name', 'department', 'title', 'email', 'location'];
const LOCATION_CANDIDATE_FIELDS = ['name', 'building', 'city', 'ref'];
const SERVICE_CANDIDATE_FIELDS = ['name', 'category'];

module.exports = {
  computeDistinguishingFields, selectVoiceFields, formatOption, buildDisambiguationSpeech,
  defaultGuidance, DEFAULT_GUIDANCE,
  flatUser, flatLocation, flatService,
  USER_CANDIDATE_FIELDS, LOCATION_CANDIDATE_FIELDS, SERVICE_CANDIDATE_FIELDS,
};

'use strict';

/**
 * AltioraSchemaMaterializer (I-4a) — Altiora's opaque form `SchemaJson` →
 * our `SchemaSnapshot`.
 *
 * This is the seam where Altiora stops being a black box. Altiora stores a form as
 * `{ fields[], tabs[], rules[] }` authored by its React form builder; the server
 * never parses it (spec §6a). Our interpreter needs the opposite: an explicit,
 * ordered slot list with typed values and declarative conditionality. Everything
 * here is that translation, and nothing else in the chat should know Altiora's
 * field shape.
 *
 * What the real dev schema (ousId 59) proved, and why the code looks like this:
 *
 *   - `type:"section"` fields are LAYOUT, not inputs — real inputs point back at
 *     them via `sectionId`. Emitting a slot for a section would make the agent ask
 *     "Details of Request / Enquiry?" as if it were a question. They are dropped.
 *   - Conditionality lives in `rules[]`, not on the field: a field carries
 *     `hidden:true` and a rule reveals it (`actions:[{type:"show_field"}]`) when
 *     `conditions.checks` pass. That is exactly our `trefCondition`, so rules are
 *     compiled into the tref dialect rather than re-invented.
 *   - Altiora field ids are opaque (`field_1781818964641`). They are preserved on
 *     `altioraFieldId` + `metadata.fieldIdMapping` because I-7 must post
 *     `FormDataJson` keyed by THEM, while the dialogue needs readable slotIds.
 *
 * Quoting is deliberate: the tref tokenizer has no escape sequences, so a value
 * containing an apostrophe ("Driver's license") would produce an unterminated
 * string literal — and since evalTref is strict, that is a hard failure at every
 * turn, not a soft one. `quoteLiteral` picks single quotes, falls back to double,
 * and refuses values containing both rather than emit a tref that cannot parse.
 *
 * @module instances/flowdesk/services/altiora-schema-materializer
 */

/** A form that cannot be materialized into a runnable snapshot (e.g. a rule cycle). */
class MaterializeError extends Error {
  constructor(message, detail = null) {
    super(message);
    this.name = 'MaterializeError';
    this.detail = detail;
  }
}

/** Layout-only field types: they structure the form, they are not questions. */
const LAYOUT_TYPES = new Set(['section', 'divider', 'heading', 'html', 'spacer', 'label', 'info', 'paragraph']);

/** Altiora field type → SchemaSnapshot slot type (schema enum is closed). */
const TYPE_MAP = {
  text: 'string',
  textarea: 'text',
  email: 'string',
  phone: 'string',
  url: 'string',
  number: 'number',
  currency: 'number',
  date: 'date',
  datetime: 'date',
  checkbox: 'boolean',
  toggle: 'boolean',
  options_group: 'enum',
  radio: 'enum',
  select: 'enum',
  dropdown: 'enum',
  multiselect: 'enum',
  checklist: 'enum',
  lookup: 'enum', // LOV — options resolved at runtime via /FormLookup (I-4b)
};

/**
 * Altiora field types that accept MORE THAN ONE value (P1-13). They map to `enum`
 * like their single-valued siblings — same presentOptions, same validation domain —
 * and are distinguished by the `multi` flag rather than a separate slot type, so
 * every existing enum consumer keeps working unchanged.
 */
const MULTI_TYPES = new Set(['checklist', 'multiselect']);

/** Altiora rule operator → tref comparison operator. */
const OP_MAP = {
  equals: '==', eq: '==', is: '==',
  not_equals: '!=', notEquals: '!=', ne: '!=', is_not: '!=',
  contains: 'contains',
  starts_with: 'startsWith', startsWith: 'startsWith',
  greater_than: '>', gt: '>',
  less_than: '<', lt: '<',
  greater_or_equal: '>=', gte: '>=',
  less_or_equal: '<=', lte: '<=',
  in: 'in', one_of: 'in',
};

/**
 * Quote a value as a tref literal. Returns null when it cannot be represented,
 * so the caller drops the rule instead of emitting an unparseable condition.
 */
function quoteLiteral(v) {
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v == null ? '' : v);
  if (!s.includes("'")) return `'${s}'`;
  if (!s.includes('"')) return `"${s}"`;
  return null; // both quote kinds present and the tokenizer has no escapes
}

/**
 * Label → camelCase slotId matching the schema pattern `^[a-z][a-zA-Z0-9]*$`.
 * Uniqueness is enforced against `used`, since Altiora labels are free text and
 * may repeat or collapse to the same slug.
 */
function camelSlotId(label, fallbackId, used = new Set()) {
  const words = String(label || '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let base = words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
    .slice(0, 48);
  if (!/^[a-z]/.test(base)) base = `f${base.replace(/^[^a-zA-Z0-9]+/, '')}`;
  if (!/^[a-z][a-zA-Z0-9]*$/.test(base) || !base) {
    base = `field${String(fallbackId || '').replace(/[^a-zA-Z0-9]/g, '')}`.slice(0, 48);
  }
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}${n}`;
  used.add(id);
  return id;
}

function mapType(f) {
  const t = String(f.type || '').toLowerCase();
  if (TYPE_MAP[t]) return TYPE_MAP[t];
  if (Array.isArray(f.options) && f.options.length) return 'enum';
  return 'string';
}

/** Altiora option (string | {value,label}) → our presentOptions entry. */
function mapOption(o) {
  if (o && typeof o === 'object') {
    const value = o.value !== undefined ? o.value : o.label;
    return { value: String(value), label: String(o.label !== undefined ? o.label : value) };
  }
  return { value: String(o), label: String(o) };
}

/** Altiora `dictionaryFilters` entry → FormLookup flat filter, tolerating casing. */
function mapDictFilter(f) {
  if (!f || typeof f !== 'object') return null;
  const fieldId = f.fieldId || f.FieldId || f.field || f.dictionaryFieldId;
  const value = f.value !== undefined ? f.value : f.Value;
  if (!fieldId || value === undefined || value === null || value === '') return null;
  const op = f.operator || f.Operator || f.op;
  return { fieldId: String(fieldId), operator: op ? String(op) : 'eq', value: String(value) };
}

/**
 * P1-12 — CASCADE dictionary. Altiora binds some fields to a dictionary filtered by
 * ANOTHER field's value (`dictionaryFilterTree` with a `form_field` valueSource): the
 * user types an index number and the staff member's name / grade / duty station resolve
 * from it. For the text-ish types this is AUTOFILL rather than option-picking
 * (DynamicForm.tsx `DICT_AUTOFILL_FIELD_TYPES`), so it can only be resolved during the
 * conversation — unlike `lov`, which is baked once at materialization.
 *
 * FAIL-CLOSED by design: any filter we cannot reproduce faithfully — a source or
 * operator we do not implement, an OR group, a reference to a field we did not
 * materialize — drops the whole descriptor. The slot then degrades to honest manual
 * entry instead of querying the dictionary with a silently weakened filter, which would
 * hand back someone else's record.
 */
const CASCADE_SOURCE = 'form_field';
const CASCADE_OPERATOR = 'eq';

/** dictionaryFilterTree → flat cascade filters, or null when not faithfully expressible. */
function parseFilterTree(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'group') {
    // Only AND is expressible: an OR of cascade filters has no single-row semantics.
    if (String(node.logic || 'AND').toUpperCase() !== 'AND') return null;
    const out = [];
    for (const item of Array.isArray(node.items) ? node.items : []) {
      const part = parseFilterTree(item);
      if (!part) return null;
      out.push(...part);
    }
    return out;
  }
  if (node.type !== 'filter') return null;
  const vs = node.valueSource || {};
  if (String(vs.type) !== CASCADE_SOURCE) return null;             // static / current_user: not implemented
  if (String(node.operator || CASCADE_OPERATOR) !== CASCADE_OPERATOR) return null;
  if (!node.dictionaryFieldId || !vs.fieldId) return null;
  return [{ fieldId: String(node.dictionaryFieldId), operator: CASCADE_OPERATOR, fieldRef: String(vs.fieldId) }];
}

/**
 * A cascade-dictionary field → runtime `dictRef`, or undefined when it is not one.
 * `filters[].fieldRef` holds the raw Altiora field id; it is translated to a slotId
 * once every slot is known (see materializeSchema).
 */
function dictRefOf(f) {
  const entityId = f && (f.dictionaryEntityId || f.DictionaryEntityId);
  if (!entityId) return undefined;
  const filters = parseFilterTree(f.dictionaryFilterTree);
  // A dependency on another FIELD is what makes this a cascade. A static or unfiltered
  // dictionary stays the existing baked-`lov` case and is left alone.
  if (!filters || !filters.length) return undefined;
  const rawDisplay = Array.isArray(f.dictionaryDisplayFields) ? f.dictionaryDisplayFields.filter(Boolean) : [];
  const display = rawDisplay.length ? rawDisplay : (f.dictionaryFieldId ? [f.dictionaryFieldId] : []);
  if (!display.length) return undefined;
  const ref = { entityId: String(entityId), displayFieldIds: display.map(String), filters };
  const valueField = f.dictionaryValueField || f.DictionaryValueField;
  if (valueField) ref.valueFieldId = String(valueField);
  return ref;
}

/**
 * A dictionary-backed field (Altiora dynamic `select`/`lookup`) → durable LOV
 * descriptor, or null when the field carries no resolvable dictionary reference.
 *
 * `dictionaryDisplayFields` is often empty even when the field is a real LOV; the
 * single `dictionaryFieldId` is the display column in that case, so we fall back to
 * it. Without at least one display field FormLookup cannot build a label, so such a
 * field is not a usable LOV and returns null (the caller degrades it to free text).
 */
function lovDescriptorOf(f) {
  const entityId = f.dictionaryEntityId || f.DictionaryEntityId;
  if (!entityId) return null;
  const rawDisplay = Array.isArray(f.dictionaryDisplayFields) ? f.dictionaryDisplayFields.filter(Boolean) : [];
  const display = rawDisplay.length ? rawDisplay : (f.dictionaryFieldId ? [f.dictionaryFieldId] : []);
  if (!display.length) return null;
  const lov = { entityId: String(entityId), displayFieldIds: display.map(String) };
  const valueField = f.dictionaryValueField || f.DictionaryValueField;
  if (valueField) lov.valueFieldId = String(valueField);
  const filters = (Array.isArray(f.dictionaryFilters) ? f.dictionaryFilters : []).map(mapDictFilter).filter(Boolean);
  if (filters.length) lov.filters = filters;
  return lov;
}

/** One rule `check` → a tref comparison, or null if it cannot be expressed. */
function checkToExpr(check, fieldToSlot) {
  const slotId = fieldToSlot.get(check.field);
  if (!slotId) return null; // condition references a field we did not materialize
  const rawOp = String(check.operator || 'equals');
  if (/^is_?empty$/i.test(rawOp)) return `slots.${slotId} is empty`;
  if (/^is_?not_?empty$/i.test(rawOp)) return `slots.${slotId} is not empty`;
  const op = OP_MAP[rawOp] || OP_MAP[rawOp.toLowerCase()];
  if (!op) return null;
  if (op === 'in') {
    const arr = Array.isArray(check.value) ? check.value : [check.value];
    const lits = arr.map(quoteLiteral);
    if (lits.some((l) => l === null)) return null;
    return `slots.${slotId} in [${lits.join(', ')}]`;
  }
  const lit = quoteLiteral(check.value);
  if (lit === null) return null;
  return `slots.${slotId} ${op} ${lit}`;
}

/** `conditions{logic, checks[]}` → a single tref expression (or null). */
function conditionsToTref(conditions, fieldToSlot) {
  const checks = (conditions && conditions.checks) || [];
  if (!checks.length) return null;
  const parts = checks.map((c) => checkToExpr(c, fieldToSlot));
  if (parts.some((p) => p === null)) return null; // all-or-nothing: never emit a half condition
  const joiner = String((conditions && conditions.logic) || 'AND').toUpperCase() === 'OR' ? ' || ' : ' && ';
  return parts.length === 1 ? parts[0] : parts.map((p) => `(${p})`).join(joiner);
}

/** Grammar-valid, always-false tref (an unset path never equals true). */
const ALWAYS_FALSE = 'service.neverShown == true';

const negate = (expr) => `!(${expr})`;
/** OR-combine repeat rules on the same target (either rule revealing it suffices). */
const orJoin = (a, b) => (a ? `(${a}) || (${b})` : b);

/** Option label/value that marks an "Other (please specify)"-style choice. */
const OTHER_RE = /other|please specify|specify/i;

/** Altiora choice field types (single- or multi-valued). */
const CHOICE_TYPES = new Set(['options_group', 'radio', 'select', 'dropdown', 'multiselect', 'checklist']);
const isChoiceField = (f) =>
  CHOICE_TYPES.has(String(f && f.type || '').toLowerCase()) || (Array.isArray(f && f.options) && f.options.length > 0);

/** The VALUE of a choice field's "Other"-like option, or null when it has none. */
function otherOptionValueOf(field) {
  const opts = Array.isArray(field && field.options) ? field.options.map(mapOption) : [];
  const m = opts.find((o) => OTHER_RE.test(o.label) || OTHER_RE.test(o.value));
  return m ? m.value : null;
}

/**
 * Gate `targetSlot` on a reference slot's value: visible + required-when-visible
 * only when the condition holds (Altiora "Other → please specify" semantics).
 *   - otherValue set  → `slots.ref == 'Other…'`  (single) / `slots.ref contains 'Other…'` (multi)
 *   - otherValue null → `slots.ref is not empty`  (plain belonging: ask once the parent is answered)
 * Returns false (and gates nothing) when the value cannot be represented as a tref literal.
 */
function gateOnReference(targetSlot, refSlotId, otherValue, multi) {
  let cond;
  if (otherValue != null) {
    const lit = quoteLiteral(otherValue);
    if (lit === null) return false;
    cond = multi ? `slots.${refSlotId} contains ${lit}` : `slots.${refSlotId} == ${lit}`;
  } else {
    cond = `slots.${refSlotId} is not empty`;
  }
  targetSlot.trefCondition = orJoin(targetSlot.trefCondition, cond);
  targetSlot.requiredWhen = orJoin(targetSlot.requiredWhen, cond);
  targetSlot.required = false; // conditional, not unconditional
  return true;
}

/** slotIds referenced inside a tref expression. */
function refsIn(expr, known) {
  const out = new Set();
  if (!expr) return out;
  const re = /slots\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(expr)) !== null) if (known.has(m[1])) out.add(m[1]);
  return out;
}

/**
 * Order slots so a condition never references a slot gathered later, and record
 * `dependsOn` (merged from IP-1b). The linter's early-ref rules (R2/R5/R6) check
 * ARRAY position, and storeSchema lints before caching, so author order alone is
 * not enough: a hidden field declared before the field that reveals it would be
 * rejected.
 *
 * This is a STABLE topological sort (Kahn, ties broken by original author index):
 * when the author order is already a valid ordering — the common case, and what
 * the real ousId-59 form does — it is returned unchanged, so the ratified
 * "order = fields[] index" still holds there. It only reorders when a reference
 * demands it. A dependency cycle is unrunnable and rejected.
 */
function orderSlots(slots) {
  const known = new Set(slots.map((s) => s.slotId));
  const authorIdx = new Map(slots.map((s, i) => [s.slotId, i]));
  const bySlot = new Map(slots.map((s) => [s.slotId, s]));

  for (const s of slots) {
    const refs = new Set();
    for (const r of refsIn(s.trefCondition, known)) refs.add(r);
    for (const r of refsIn(s.requiredWhen, known)) refs.add(r);
    for (const f of s.optionFilters || []) for (const r of refsIn(f.condition, known)) refs.add(r);
    // P1-12: a cascade slot cannot be resolved until the slot its dictionary filters on
    // is filled — that is an ordering dependency, and it also gives the interpreter the
    // "blocked" semantics Altiora's own resolveFilters() expresses by returning null.
    for (const f of (s.dictRef && s.dictRef.filters) || []) if (known.has(f.slotId)) refs.add(f.slotId);
    refs.delete(s.slotId); // a self-reference is not an ordering dependency
    if (refs.size) s.dependsOn = [...refs];
  }

  const indeg = new Map(slots.map((s) => [s.slotId, 0]));
  const dependents = new Map(slots.map((s) => [s.slotId, []]));
  for (const s of slots) {
    for (const dep of s.dependsOn || []) {
      dependents.get(dep).push(s.slotId);
      indeg.set(s.slotId, indeg.get(s.slotId) + 1);
    }
  }

  const ready = slots.filter((s) => indeg.get(s.slotId) === 0).map((s) => s.slotId);
  const ordered = [];
  while (ready.length) {
    ready.sort((a, b) => authorIdx.get(a) - authorIdx.get(b)); // stable: earliest author first
    const id = ready.shift();
    ordered.push(bySlot.get(id));
    for (const d of dependents.get(id)) {
      indeg.set(d, indeg.get(d) - 1);
      if (indeg.get(d) === 0) ready.push(d);
    }
  }
  if (ordered.length !== slots.length) {
    const stuck = slots.filter((s) => !ordered.includes(s)).map((s) => s.slotId);
    throw new MaterializeError(`condition dependency cycle among slots: ${stuck.join(', ')}`, 'cycle');
  }
  return ordered;
}

/**
 * @param {Object} p
 * @param {Object|string} p.schemaJson  - Altiora `{fields,tabs,rules}` (raw or JSON string)
 * @param {string} p.serviceCode        - our serviceId (e.g. 'EO-HR-SA-SS-ISP')
 * @param {number} p.ousId              - OrganizationUnitServiceId (the form's real key)
 * @param {string} [p.contentHash]      - from getSchemaVersion (I-5 invalidation)
 * @param {string} [p.title]
 * @param {boolean} [p.approvalRequired]
 * @param {number} [p.slaHours]
 * @param {number} [p.version]
 * @param {string} [p.phase='detail']   - ratified: single phase, order = fields[] index
 * @returns {{snapshot:Object, warnings:string[]}}
 */
/**
 * Machine artifacts Altiora's form builder writes into `description` that are NOT
 * user-facing help (e.g. "Auto-generated field for LK_DutyStations.Name"). Letting
 * these reach the LLM prompt pollutes questions and can leak into the reply.
 */
const HELP_NOISE_PATTERNS = [
  /^Auto-generated field for /i,
];

/** Trim, drop empties, and reject machine artifacts. Returns null when unusable. */
function cleanHelpText(text) {
  if (text == null) return null;
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  if (HELP_NOISE_PATTERNS.some((re) => re.test(trimmed))) return null;
  return trimmed;
}

/**
 * TASK-PROMPT-005 — the only "constraint-like" attributes Altiora actually authors
 * are `description` (what the field is for / rules that apply) and `placeholder`
 * (an example input). Neither was carried before. They serve different purposes, so
 * when both are present they are merged with the example labelled.
 * @returns {string|undefined} helpText, or undefined when nothing usable remains
 */
function helpTextOf(f) {
  const desc = cleanHelpText(f && f.description);
  const example = cleanHelpText(f && f.placeholder);
  if (desc && example) return `${desc}\n\nExample: ${example}`;
  return desc || example || undefined;
}

function materializeSchema(p) {
  const warnings = [];
  const raw = typeof p.schemaJson === 'string' ? JSON.parse(p.schemaJson) : (p.schemaJson || {});
  const fields = Array.isArray(raw.fields) ? raw.fields : [];
  const phase = p.phase || 'detail';

  // Raw field lookup — needed to resolve sectionId references (grouping + the
  // conditional "Other → please specify" belonging link, step 2b).
  const byId = new Map(fields.filter((f) => f && f.id).map((f) => [f.id, f]));

  // Section grouping: every `type:section` field → a stable slug + its label. An
  // input's sectionId points here (the Altiora author's semantic grouping).
  const usedSections = new Set();
  const sectionById = new Map();
  for (const f of fields) {
    if (String(f && f.type || '').toLowerCase() === 'section' && f.id) {
      const slug = camelSlotId(f.label || 'section', f.id, usedSections);
      sectionById.set(f.id, { slug, label: f.label ? String(f.label).trim() : null });
    }
  }

  // 1. Inputs only, in author order (= ask order).
  const inputs = fields.filter((f) => f && f.id && !LAYOUT_TYPES.has(String(f.type || '').toLowerCase()));

  const used = new Set();
  const fieldToSlot = new Map();
  const slots = inputs.map((f) => {
    const slotId = camelSlotId(f.label, f.id, used);
    fieldToSlot.set(f.id, slotId);
    const type = mapType(f);
    const slot = {
      slotId,
      type,
      required: !!f.required,
      phase,
      altioraFieldId: f.id,
    };
    // A label is what the field is ASKED by, so a field without one costs a model
    // call every time it comes up (turn-router condition 6). Altiora leaves it empty
    // on a handful of fields out of hundreds; the slotId is a poor question and a
    // much better one than none. Takes effect on re-materialisation, not retroactively.
    slot.promptHint = f.label ? String(f.label).trim() : String(slot.slotId || '').trim() || undefined;
    // Section grouping — only when sectionId points at an actual section field.
    // (A sectionId pointing at a CHOICE field is the conditional link, handled in 2b.)
    const sec = f.sectionId ? sectionById.get(f.sectionId) : null;
    if (sec) { slot.section = sec.slug; if (sec.label) slot.sectionLabel = sec.label; }
    const help = helpTextOf(f);
    if (help) slot.helpText = help;
    if (type === 'enum') {
      const opts = (Array.isArray(f.options) ? f.options : []).map(mapOption).filter((o) => o.value !== '');
      if (opts.length) {
        slot.presentOptions = opts;
      } else {
        // No static options: a dictionary-backed LOV whose values live in Altiora's
        // BI store (spec §6b), resolved separately via /FormLookup. Capture the
        // durable descriptor and hold the slot as free-text `string` until the LOV
        // baker (I-4b) resolves it into presentOptions and upgrades it back to enum —
        // an enum with no presentOptions would violate the SchemaSnapshot contract.
        const lov = lovDescriptorOf(f);
        if (lov) {
          slot.type = 'string';
          slot.lov = lov;
        } else {
          slot.type = 'string';
          warnings.push(`${slotId}: enum with no options and no dictionary reference — degraded to free text`);
        }
      }
    }
    // P1-13: a checklist/multiselect keeps enum's option domain but accepts an ARRAY
    // of those options. Only meaningful once the slot really is an enum (a LOV that
    // degraded to free text has no option domain to multi-select from).
    // `checklistMultiple:false` configures a checklist as SINGLE-select — Altiora then
    // renders radios and stores a plain scalar (DynamicForm.tsx), so it is NOT multi.
    if (slot.type === 'enum'
      && MULTI_TYPES.has(String(f.type || '').toLowerCase())
      && f.checklistMultiple !== false) slot.multi = true;
    // P1-12: cascade dictionary applies to ANY field type — these are predominantly
    // `text`/`date` autofill fields, which never reach the enum-only `lov` path above.
    const dictRef = dictRefOf(f);
    if (dictRef) slot.dictRef = dictRef;
    return slot;
  });
  const bySlotId = new Map(slots.map((s) => [s.slotId, s]));

  // P1-12: cascade filters reference Altiora FIELD ids; now that every slot is known,
  // translate them to slotIds. An unresolvable reference drops the descriptor
  // (fail-closed) so the slot simply becomes ordinary manual entry.
  for (const s of slots) {
    if (!s.dictRef) continue;
    const translated = [];
    for (const flt of s.dictRef.filters) {
      const depSlotId = fieldToSlot.get(flt.fieldRef);
      if (!depSlotId || depSlotId === s.slotId) { translated.length = 0; break; }
      translated.push({ fieldId: flt.fieldId, operator: flt.operator, slotId: depSlotId });
    }
    if (translated.length) {
      s.dictRef.filters = translated;
    } else {
      delete s.dictRef;
      warnings.push(`${s.slotId}: cascade dictionary filter is not expressible — falling back to manual entry`);
    }
  }

  // 2. rules[] → declarative conditionality on the target slots.
  for (const rule of Array.isArray(raw.rules) ? raw.rules : []) {
    if (!rule || rule.enabled === false) continue;
    const expr = conditionsToTref(rule.conditions, fieldToSlot);
    if (!expr) { warnings.push(`rule ${rule.id || rule.name}: conditions not expressible — skipped`); continue; }
    for (const action of Array.isArray(rule.actions) ? rule.actions : []) {
      const target = bySlotId.get(fieldToSlot.get(action.targetField));
      if (!target) { warnings.push(`rule ${rule.id || rule.name}: unknown targetField ${action.targetField}`); continue; }
      switch (String(action.type || '').toLowerCase()) {
        case 'show_field':
          // A rule-revealed field is VISIBLE when the show-condition holds and,
          // per the ratified engine semantics, REQUIRED while visible — otherwise
          // the interpreter (which asks only required-now slots) would never ask
          // it. Visibility → trefCondition; required-when-shown → requiredWhen.
          target.trefCondition = orJoin(target.trefCondition, expr);
          target.requiredWhen = orJoin(target.requiredWhen, expr);
          target.required = false; // it is conditional, not unconditional
          break;
        case 'hide_field':
          target.trefCondition = orJoin(target.trefCondition, negate(expr));
          break;
        case 'require_field':
        case 'set_required':
          target.requiredWhen = orJoin(target.requiredWhen, expr);
          // A conditionally-required field is not unconditionally required.
          target.required = false;
          break;
        case 'filter_options': {
          const filter = { condition: expr };
          if (Array.isArray(action.include)) filter.include = action.include.map(String);
          if (Array.isArray(action.exclude)) filter.exclude = action.exclude.map(String);
          if (!filter.include && !filter.exclude) { warnings.push(`rule ${rule.id}: filter_options without include/exclude`); break; }
          (target.optionFilters = target.optionFilters || []).push(filter);
          break;
        }
        default:
          warnings.push(`rule ${rule.id || rule.name}: unsupported action '${action.type}' — ignored`);
      }
    }
  }

  // 2b. Conditional "Other (please specify)" belonging. Two triggers, both express
  //     the specify field as visible + required-only-when the parent choice selected
  //     an "Other"-like value — via trefCondition/requiredWhen, not topology. Runs
  //     BEFORE the hidden-no-reveal pass (3) so a specify field authored `hidden`
  //     gets its reveal condition instead of ALWAYS_FALSE.
  //
  //  Trigger 1 — explicit: an input whose `sectionId` points at a NON-section CHOICE
  //  field (the author's convention: sectionId as a belonging attribute). The slot is
  //  gated by that choice's "Other" value (or, when it has none, by "parent answered").
  for (const f of inputs) {
    if (!f.sectionId) continue;
    const ref = byId.get(f.sectionId);
    if (!ref || String(ref.type || '').toLowerCase() === 'section' || !isChoiceField(ref)) continue;
    const refSlotId = fieldToSlot.get(ref.id);
    const target = bySlotId.get(fieldToSlot.get(f.id));
    if (!refSlotId || !target || refSlotId === target.slotId) continue;
    const refSlot = bySlotId.get(refSlotId);
    const ok = gateOnReference(target, refSlotId, otherOptionValueOf(ref), refSlot && refSlot.multi === true);
    if (ok) {
      // The specify field belongs to the choice's group, not a section of its own.
      if (refSlot && refSlot.section && !target.section) {
        target.section = refSlot.section;
        if (refSlot.sectionLabel) target.sectionLabel = refSlot.sectionLabel;
      }
      warnings.push(`${target.slotId}: conditional on ${refSlotId} (sectionId belonging link)`);
    }
  }

  //  Trigger 2 — heuristic (current forms encode no structured link): an enum slot
  //  carrying an "Other"-like option, paired with a FREE-TEXT sibling in the SAME
  //  section whose label reads like a specify field. Conservative on purpose (strong
  //  label match only, same section, not already conditional) to avoid false gating;
  //  when no such sibling exists nothing is asked and nothing is synthesized. Toggle
  //  off with FLOWDESK_OTHER_SPECIFY_HEURISTIC=0.
  if (process.env.FLOWDESK_OTHER_SPECIFY_HEURISTIC !== '0') {
    for (const slot of slots) {
      if (slot.type !== 'enum' || !Array.isArray(slot.presentOptions) || !slot.section) continue;
      const otherOpt = slot.presentOptions.find((o) => OTHER_RE.test(o.label) || OTHER_RE.test(o.value));
      if (!otherOpt) continue;
      const target = slots.find((s) => s !== slot
        && s.section === slot.section
        && (s.type === 'string' || s.type === 'text')
        && !s.trefCondition
        && OTHER_RE.test(s.promptHint || ''));
      if (!target) continue;
      const ok = gateOnReference(target, slot.slotId, otherOpt.value, slot.multi === true);
      if (ok) warnings.push(`${target.slotId}: conditional-specify on ${slot.slotId}=="${otherOpt.value}" (heuristic)`);
    }
  }

  // 3. A field authored hidden with no rule to reveal it can never be asked;
  //    keeping it required would make the flow unfillable.
  //
  //    ALWAYS_FALSE must satisfy the tref grammar (`path cmp_op value` — a bare
  //    `false == true` is a parse error, and evalTref is strict, so a malformed
  //    sentinel would throw on every turn instead of quietly hiding the slot).
  //    An unset path compares false, which is exactly the semantics we want.
  for (const f of inputs) {
    const slot = bySlotId.get(fieldToSlot.get(f.id));
    if (f.hidden && slot && !slot.trefCondition) {
      slot.trefCondition = ALWAYS_FALSE;
      slot.required = false;
      warnings.push(`${slot.slotId}: hidden with no reveal rule — permanently inactive`);
    }
  }

  // 4. Order dependencies before dependents so conditions never look forward
  //    (merged from IP-1b) — otherwise storeSchema's lint gate would reject the
  //    snapshot. Stable: unchanged when author order is already valid.
  const orderedSlots = orderSlots(slots);

  const fieldIdMapping = {};
  for (const s of orderedSlots) fieldIdMapping[s.slotId] = s.altioraFieldId;

  // SCH-001 — every field the Altiora schema has, including the ones the chat will
  // never ask and never render.
  //
  // Until now a layout field was read for its side effects (a `section` became a
  // grouping label) and then discarded. Nothing was lost from THIS catalogue — 72 of
  // the 73 live schemas translate field-for-field, and the only gap was one stale
  // cache — but the materializer's contract was "the fields we intend to use" rather
  // than "the schema". Those differ the day Altiora adds a divider, a paragraph of
  // guidance, or a `label` that its own form autofills from a dictionary: we would
  // hand the wizard a request built from a schema we had only partly read, and
  // nothing would report the difference.
  //
  // They are kept OUT of `slots` deliberately. A slot is a question; putting a
  // paragraph of static text in the queue would make the assistant ask it.
  const presentation = fields
    .filter((f) => f && f.id && LAYOUT_TYPES.has(String(f.type || '').toLowerCase()))
    .map((f) => {
      const sect = sectionById.get(f.sectionId);
      return {
        fieldId: String(f.id),
        type: String(f.type).toLowerCase(),
        ...(f.label ? { label: String(f.label).trim() } : {}),
        ...(f.description ? { description: String(f.description).trim() } : {}),
        ...(f.html ? { html: String(f.html) } : {}),
        ...(sect ? { section: sect.slug, sectionLabel: sect.label } : {}),
        // A presentation field can carry a dictionary too: Altiora autofills a
        // `label` from one and shows the resolved text. Carried so the value we send
        // the wizard can be reconciled with what it will display.
        ...(f.dictionaryEntityId ? { dictionaryEntityId: String(f.dictionaryEntityId) } : {}),
      };
    });

  const snapshot = {
    serviceId: p.serviceCode,
    version: p.version || 1,
    phases: [phase],
    ...(presentation.length ? { presentation } : {}),
    metadata: {
      title: p.title || p.serviceCode,
      approvalRequired: !!p.approvalRequired,
      ...(p.slaHours != null ? { slaHours: p.slaHours } : {}),
      altioraOusId: p.ousId,
      ...(p.contentHash ? { contentHash: p.contentHash } : {}),
      fieldIdMapping,
      // SCH-001 — the count the source had, against the count we translated. A
      // difference is a materializer that stopped understanding its input, and this
      // is the number that makes that visible instead of leaving it to be discovered
      // by a required field nobody was ever asked for.
      sourceFieldCount: (fields || []).filter((f) => f && f.id).length,
      translatedFieldCount: orderedSlots.length + presentation.length,
    },
    slots: orderedSlots,
  };
  return { snapshot, warnings };
}

module.exports = {
  materializeSchema,
  camelSlotId,
  mapType,
  mapOption,
  lovDescriptorOf,
  mapDictFilter,
  quoteLiteral,
  checkToExpr,
  conditionsToTref,
  orderSlots,
  MaterializeError,
  ALWAYS_FALSE,
  LAYOUT_TYPES,
  TYPE_MAP,
  OP_MAP,
  OTHER_RE,
  isChoiceField,
  otherOptionValueOf,
  gateOnReference,
};

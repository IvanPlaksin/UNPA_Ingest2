'use strict';

/**
 * Dialogue Gym — PersonaLibrary + ScenarioBank service (Phase 1, ШАГ 2).
 *
 * Platform subsystem (CORE namespace) that stores the two authoring
 * entities of the system-prompt optimizer:
 *   - Persona  : a simulated user with behavioural parameters
 *   - Scenario : a test case carrying a verifiable ground-truth outcome
 *
 * Design:
 *   - Business logic (validation, defaults, ids, timestamps, JSON (de)serialization,
 *     filtering, pagination, random-pair) lives HERE and is fully unit-tested.
 *   - Persistence is delegated to an injectable `repo`. The default repo talks to
 *     the shared platform Memgraph driver (services/memgraph.service). Tests inject
 *     an in-memory repo, so the suite never needs a live database.
 *   - The pure filter helpers (personaMatches / scenarioMatches) are the single
 *     source of truth for list filtering and are reused by both repos.
 *
 * @module services/dialogue-gym/dialogue-gym.service
 */

const crypto = require('crypto');

// ── enums ─────────────────────────────────────────────────────────────────────
const DOMAIN_KNOWLEDGE = ['none', 'symptom_only', 'partial', 'expert'];
const VERBOSITY = ['terse', 'normal', 'verbose'];
const COOPERATIVENESS = ['cooperative', 'neutral', 'withholding', 'adversarial'];
const LANGUAGES = ['en', 'fr', 'es', 'ar', 'zh', 'ru'];
const CATEGORIES = ['typical', 'edge_case', 'red_team', 'regression'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const SOURCES = ['catalog_generated', 'real_dialogue', 'manual', 'evolved'];

const PERSONA_LABEL = 'DialogueGymPersona';
const SCENARIO_LABEL = 'DialogueGymScenario';
const NAMESPACE = 'CORE';

// ── helpers ─────────────────────────────────────────────────────────────────
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function assertEnum(field, value, allowed, { required = false } = {}) {
  if (value == null) {
    if (required) throw new Error(`Dialogue Gym: "${field}" is required`);
    return;
  }
  if (!allowed.includes(value)) {
    throw new Error(`Dialogue Gym: invalid "${field}" = ${JSON.stringify(value)}; allowed: ${allowed.join(', ')}`);
  }
}

function assertNonEmpty(field, value) {
  if (value == null || String(value).trim() === '') {
    throw new Error(`Dialogue Gym: "${field}" is required`);
  }
}

const jsonParse = (s) => {
  if (s == null || s === '') return null;
  try { return JSON.parse(s); } catch { return null; }
};
const jsonStr = (v) => (v == null ? null : JSON.stringify(v));

// ── pure filter helpers (shared by real + fake repos) ──────────────────────────
function personaMatches(p, f = {}) {
  if (!p) return false;
  if (f.enabled !== undefined && Boolean(p.enabled) !== Boolean(f.enabled)) return false;
  if (f.isBuiltin !== undefined && Boolean(p.isBuiltin) !== Boolean(f.isBuiltin)) return false;
  if (f.domainKnowledge && p.domainKnowledge !== f.domainKnowledge) return false;
  if (f.cooperativeness && p.cooperativeness !== f.cooperativeness) return false;
  if (f.language && p.language !== f.language) return false;
  return true;
}

function scenarioMatches(s, f = {}) {
  if (!s) return false;
  if (f.enabled !== undefined && Boolean(s.enabled) !== Boolean(f.enabled)) return false;
  if (f.isBuiltin !== undefined && Boolean(s.isBuiltin) !== Boolean(f.isBuiltin)) return false;
  if (f.category && s.category !== f.category) return false;
  if (f.domain && s.domain !== f.domain) return false;
  if (f.difficulty && s.difficulty !== f.difficulty) return false;
  if (f.groundTruthVerified !== undefined && Boolean(s.groundTruthVerified) !== Boolean(f.groundTruthVerified)) return false;
  if (f.tags) {
    const want = Array.isArray(f.tags) ? f.tags : [f.tags];
    const have = Array.isArray(s.tags) ? s.tags : [];
    if (!want.every((t) => have.includes(t))) return false;
  }
  return true;
}

// ── normalization (domain object ⇆ stored node props) ──────────────────────────
function normalizePersonaInput(data = {}) {
  assertNonEmpty('name', data.name);
  assertEnum('domainKnowledge', data.domainKnowledge, DOMAIN_KNOWLEDGE, { required: true });
  assertEnum('verbosity', data.verbosity, VERBOSITY, { required: true });
  assertEnum('cooperativeness', data.cooperativeness, COOPERATIVENESS, { required: true });
  assertEnum('language', data.language, LANGUAGES, { required: true });
  let patience = data.patience == null ? 5 : parseInt(data.patience, 10);
  if (Number.isNaN(patience)) throw new Error('Dialogue Gym: "patience" must be an integer 1..10');
  patience = Math.min(10, Math.max(1, patience));
  return {
    name: String(data.name).trim(),
    description: data.description ? String(data.description) : '',
    domainKnowledge: data.domainKnowledge,
    patience,
    verbosity: data.verbosity,
    cooperativeness: data.cooperativeness,
    language: data.language,
    persona: data.persona ? String(data.persona) : '',
  };
}

function normalizeScenarioInput(data = {}) {
  assertNonEmpty('name', data.name);
  assertNonEmpty('userGoal', data.userGoal);
  assertNonEmpty('initialMessage', data.initialMessage);
  assertEnum('category', data.category, CATEGORIES, { required: true });
  assertEnum('difficulty', data.difficulty, DIFFICULTIES, { required: true });
  assertEnum('source', data.source, SOURCES, { required: false });
  let maxTurns = data.maxTurns == null ? 20 : parseInt(data.maxTurns, 10);
  if (Number.isNaN(maxTurns) || maxTurns < 1) maxTurns = 20;
  return {
    name: String(data.name).trim(),
    description: data.description ? String(data.description) : '',
    userGoal: String(data.userGoal),
    initialMessage: String(data.initialMessage),
    expectedServiceCode: data.expectedServiceCode || null,
    expectedRoute: data.expectedRoute || null,
    expectedSlots: data.expectedSlots ?? null,
    successCriteria: data.successCriteria ?? {},
    maxTurns,
    requiredControls: Array.isArray(data.requiredControls) ? data.requiredControls : [],
    category: data.category,
    domain: data.domain ? String(data.domain) : 'EO-HR',
    difficulty: data.difficulty,
    tags: Array.isArray(data.tags) ? data.tags : [],
    source: data.source || 'manual',
    sourceRef: data.sourceRef || null,
  };
}

// stored node props → domain object (parse JSON, coerce numbers)
function personaFromNode(n) {
  if (!n) return null;
  return {
    personaId: n.personaId,
    name: n.name,
    description: n.description || '',
    domainKnowledge: n.domainKnowledge,
    patience: typeof n.patience === 'number' ? n.patience : parseInt(n.patience, 10),
    verbosity: n.verbosity,
    cooperativeness: n.cooperativeness,
    language: n.language,
    persona: n.persona || '',
    namespace: n.namespace || NAMESPACE,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    createdBy: n.createdBy || 'system',
    isBuiltin: Boolean(n.isBuiltin),
    enabled: Boolean(n.enabled),
  };
}

function scenarioFromNode(n) {
  if (!n) return null;
  return {
    scenarioId: n.scenarioId,
    name: n.name,
    description: n.description || '',
    userGoal: n.userGoal,
    initialMessage: n.initialMessage,
    expectedServiceCode: n.expectedServiceCode ?? null,
    expectedRoute: n.expectedRoute ?? null,
    expectedSlots: jsonParse(n.expectedSlotsJson),
    successCriteria: jsonParse(n.successCriteriaJson) ?? {},
    maxTurns: typeof n.maxTurns === 'number' ? n.maxTurns : parseInt(n.maxTurns, 10) || 20,
    requiredControls: Array.isArray(n.requiredControls) ? n.requiredControls : [],
    category: n.category,
    domain: n.domain,
    difficulty: n.difficulty,
    tags: Array.isArray(n.tags) ? n.tags : [],
    source: n.source || 'manual',
    sourceRef: n.sourceRef ?? null,
    groundTruthVerified: Boolean(n.groundTruthVerified),
    groundTruthNotes: n.groundTruthNotes ?? null,
    verifiedAt: n.verifiedAt ?? null,
    verifiedBy: n.verifiedBy ?? null,
    namespace: n.namespace || NAMESPACE,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    isBuiltin: Boolean(n.isBuiltin),
    enabled: Boolean(n.enabled),
  };
}

// ── default repo: shared platform Memgraph driver ──────────────────────────────
function memgraphRepo() {
  let _mg = null;
  const mg = () => (_mg || (_mg = require('../memgraph.service')));
  const rows = (res) => (Array.isArray(res) ? res : []);
  const propsOf = (rows_, key) => rows_.map((r) => (r[key] && r[key].properties) || r[key]).filter(Boolean);

  return {
    async ensureIndexes() {
      const stmts = [
        `CREATE CONSTRAINT ON (p:${PERSONA_LABEL}) ASSERT p.personaId IS UNIQUE`,
        `CREATE CONSTRAINT ON (s:${SCENARIO_LABEL}) ASSERT s.scenarioId IS UNIQUE`,
        `CREATE INDEX ON :${PERSONA_LABEL}(enabled)`,
        `CREATE INDEX ON :${SCENARIO_LABEL}(enabled)`,
        `CREATE INDEX ON :${SCENARIO_LABEL}(category)`,
        `CREATE INDEX ON :${SCENARIO_LABEL}(domain)`,
      ];
      for (const s of stmts) {
        try { await mg().runQuery(s); } catch (e) { /* already-exists / unsupported: ignore */ }
      }
    },
    async savePersona(node) {
      await mg().runQuery(
        `MERGE (p:${PERSONA_LABEL} {personaId: $personaId}) SET p += $node RETURN p`,
        { personaId: node.personaId, node }
      );
      return node;
    },
    async getPersona(id) {
      const r = rows(await mg().runQuery(`MATCH (p:${PERSONA_LABEL} {personaId: $id}) RETURN p`, { id }));
      return propsOf(r, 'p')[0] || null;
    },
    async listPersonas() {
      const r = rows(await mg().runQuery(`MATCH (p:${PERSONA_LABEL}) RETURN p`));
      return propsOf(r, 'p');
    },
    async saveScenario(node) {
      await mg().runQuery(
        `MERGE (s:${SCENARIO_LABEL} {scenarioId: $scenarioId}) SET s += $node RETURN s`,
        { scenarioId: node.scenarioId, node }
      );
      return node;
    },
    async getScenario(id) {
      const r = rows(await mg().runQuery(`MATCH (s:${SCENARIO_LABEL} {scenarioId: $id}) RETURN s`, { id }));
      return propsOf(r, 's')[0] || null;
    },
    async listScenarios() {
      const r = rows(await mg().runQuery(`MATCH (s:${SCENARIO_LABEL}) RETURN s`));
      return propsOf(r, 's');
    },
    async putEdge(personaId, scenarioId, props) {
      await mg().runQuery(
        `MATCH (p:${PERSONA_LABEL} {personaId: $personaId}), (s:${SCENARIO_LABEL} {scenarioId: $scenarioId})
         MERGE (p)-[r:SUITABLE_FOR]->(s) SET r += $props RETURN r`,
        { personaId, scenarioId, props }
      );
    },
    async delEdge(personaId, scenarioId) {
      await mg().runQuery(
        `MATCH (p:${PERSONA_LABEL} {personaId: $personaId})-[r:SUITABLE_FOR]->(s:${SCENARIO_LABEL} {scenarioId: $scenarioId})
         DELETE r`,
        { personaId, scenarioId }
      );
    },
    async personasForScenario(scenarioId) {
      const r = rows(await mg().runQuery(
        `MATCH (p:${PERSONA_LABEL})-[r:SUITABLE_FOR]->(s:${SCENARIO_LABEL} {scenarioId: $scenarioId})
         RETURN p, r.weight AS weight, r.notes AS notes`,
        { scenarioId }
      ));
      return r.map((row) => ({
        persona: (row.p && row.p.properties) || row.p,
        weight: typeof row.weight === 'number' ? row.weight : 1.0,
        notes: row.notes || null,
      })).filter((x) => x.persona);
    },
    async scenariosForPersona(personaId) {
      const r = rows(await mg().runQuery(
        `MATCH (p:${PERSONA_LABEL} {personaId: $personaId})-[r:SUITABLE_FOR]->(s:${SCENARIO_LABEL})
         RETURN s, r.weight AS weight, r.notes AS notes`,
        { personaId }
      ));
      return r.map((row) => ({
        scenario: (row.s && row.s.properties) || row.s,
        weight: typeof row.weight === 'number' ? row.weight : 1.0,
        notes: row.notes || null,
      })).filter((x) => x.scenario);
    },
  };
}

// ── service factory ────────────────────────────────────────────────────────────
function createDialogueGymService(deps = {}) {
  const repo = deps.repo || memgraphRepo();
  const rand = deps.rand || Math.random;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  function paginate(items, { limit = 100, offset = 0 } = {}) {
    const total = items.length;
    const lim = Math.max(1, parseInt(limit, 10) || 100);
    const off = Math.max(0, parseInt(offset, 10) || 0);
    return { items: items.slice(off, off + lim), total };
  }

  // ── Persona CRUD ──
  async function createPersona(data, { createdBy = 'system', isBuiltin = false } = {}) {
    const clean = normalizePersonaInput(data);
    const ts = now();
    const node = {
      ...clean,
      personaId: data.personaId || uuid(),
      namespace: NAMESPACE,
      createdAt: ts,
      updatedAt: ts,
      createdBy,
      isBuiltin: Boolean(isBuiltin),
      enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    };
    await repo.savePersona(node);
    return personaFromNode(node);
  }

  async function getPersona(personaId) {
    return personaFromNode(await repo.getPersona(personaId));
  }

  async function listPersonas(filters = {}) {
    const all = (await repo.listPersonas()).map(personaFromNode).filter(Boolean);
    const filtered = all.filter((p) => personaMatches(p, filters));
    filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return paginate(filtered, filters);
  }

  async function updatePersona(personaId, updates = {}) {
    const existing = await repo.getPersona(personaId);
    if (!existing) return null;
    const merged = { ...personaFromNode(existing), ...updates };
    const clean = normalizePersonaInput(merged);
    const node = {
      ...existing,
      ...clean,
      personaId,
      updatedAt: now(),
      enabled: updates.enabled === undefined ? Boolean(existing.enabled) : Boolean(updates.enabled),
    };
    await repo.savePersona(node);
    return personaFromNode(node);
  }

  async function deletePersona(personaId) {
    const existing = await repo.getPersona(personaId);
    if (!existing) return false;
    await repo.savePersona({ ...existing, enabled: false, updatedAt: now() });
    return true;
  }

  // ── Scenario CRUD ──
  async function createScenario(data, { isBuiltin = false } = {}) {
    const clean = normalizeScenarioInput(data);
    const ts = now();
    const node = {
      name: clean.name,
      description: clean.description,
      userGoal: clean.userGoal,
      initialMessage: clean.initialMessage,
      expectedServiceCode: clean.expectedServiceCode,
      expectedRoute: clean.expectedRoute,
      expectedSlotsJson: jsonStr(clean.expectedSlots),
      successCriteriaJson: jsonStr(clean.successCriteria),
      maxTurns: clean.maxTurns,
      requiredControls: clean.requiredControls,
      category: clean.category,
      domain: clean.domain,
      difficulty: clean.difficulty,
      tags: clean.tags,
      source: clean.source,
      sourceRef: clean.sourceRef,
      groundTruthVerified: Boolean(data.groundTruthVerified),
      groundTruthNotes: data.groundTruthNotes || null,
      verifiedAt: data.verifiedAt || null,
      verifiedBy: data.verifiedBy || null,
      scenarioId: data.scenarioId || uuid(),
      namespace: NAMESPACE,
      createdAt: ts,
      updatedAt: ts,
      isBuiltin: Boolean(isBuiltin),
      enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    };
    // strip null props (Memgraph SET += with null removes; keep payload clean)
    Object.keys(node).forEach((k) => node[k] === null && delete node[k]);
    await repo.saveScenario(node);
    return scenarioFromNode(node);
  }

  /**
   * Ratify a scenario's ground truth (ШАГ 3.6). Sets expectedServiceCode +
   * groundTruthVerified=true + audit fields, preserving the rest of the scenario.
   * @param {string} scenarioId
   * @param {{expectedServiceCode?:string|null, groundTruthNotes?:string, verifiedBy?:string}} v
   */
  async function verifyGroundTruth(scenarioId, v = {}) {
    const existing = await repo.getScenario(scenarioId);
    if (!existing) return null;

    // Ratification used to accept any service code without looking at it. Three
    // of nine scenarios were ratified against services that could not answer
    // their goal — one of them "Change the bank account" against "Request for
    // Salary Advance" — and every run on them was scored as an agent failure.
    // A code that is not in the catalogue is now refused outright; a weak match
    // is surfaced so the human decides, because that call needs judgement.
    const validator = deps.scenarioValidator || require('./scenario-validator.service');
    const check = await validator.validate(
      { ...existing, scenarioId }, v.expectedServiceCode ?? null,
      { acknowledgedServiceTitle: v.acknowledgedServiceTitle }
    );
    if (!check.ok) {
      const err = new Error(check.blocking.map((b) => b.message).join('; '));
      err.status = 400;
      err.validation = check;
      throw err;
    }

    const node = {
      ...existing,
      scenarioId,
      groundTruthVerified: true,
      groundTruthNotes: v.groundTruthNotes || null,
      verifiedAt: now(),
      verifiedBy: v.verifiedBy || 'cli',
      updatedAt: now(),
    };
    // Drop other null props so `SET s += $node` doesn't wipe unrelated fields...
    Object.keys(node).forEach((k) => node[k] === null && delete node[k]);
    // ...but expectedServiceCode is always set EXPLICITLY (a string sets it; null
    // clears it — verified "no single service"). `SET s += {k:null}` removes the prop.
    node.expectedServiceCode = v.expectedServiceCode ?? null;
    await repo.saveScenario(node);
    const saved = scenarioFromNode(await repo.getScenario(scenarioId));
    // The service's real NAME travels back with the result. Showing a human the
    // code alone is what let "Change the bank account" be ratified against
    // "Request for Salary Advance" — the mismatch is only visible in the title.
    return { ...saved, validation: { serviceTitle: check.serviceTitle, warnings: check.warnings, similarity: check.similarity } };
  }

  async function getScenario(scenarioId) {
    return scenarioFromNode(await repo.getScenario(scenarioId));
  }

  async function listScenarios(filters = {}) {
    const all = (await repo.listScenarios()).map(scenarioFromNode).filter(Boolean);
    const filtered = all.filter((s) => scenarioMatches(s, filters));
    filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    return paginate(filtered, filters);
  }

  async function updateScenario(scenarioId, updates = {}) {
    const existing = await repo.getScenario(scenarioId);
    if (!existing) return null;
    const merged = { ...scenarioFromNode(existing), ...updates };
    const clean = normalizeScenarioInput(merged);
    const node = {
      ...existing,
      name: clean.name,
      description: clean.description,
      userGoal: clean.userGoal,
      initialMessage: clean.initialMessage,
      expectedServiceCode: clean.expectedServiceCode,
      expectedRoute: clean.expectedRoute,
      expectedSlotsJson: jsonStr(clean.expectedSlots),
      successCriteriaJson: jsonStr(clean.successCriteria),
      maxTurns: clean.maxTurns,
      requiredControls: clean.requiredControls,
      category: clean.category,
      domain: clean.domain,
      difficulty: clean.difficulty,
      tags: clean.tags,
      source: clean.source,
      sourceRef: clean.sourceRef,
      scenarioId,
      updatedAt: now(),
      enabled: updates.enabled === undefined ? Boolean(existing.enabled) : Boolean(updates.enabled),
    };
    Object.keys(node).forEach((k) => node[k] === null && delete node[k]);
    await repo.saveScenario(node);
    return scenarioFromNode(node);
  }

  async function deleteScenario(scenarioId) {
    const existing = await repo.getScenario(scenarioId);
    if (!existing) return false;
    await repo.saveScenario({ ...existing, enabled: false, updatedAt: now() });
    return true;
  }

  // ── Assignment ──
  async function assignPersonaToScenario(personaId, scenarioId, weight = 1.0, notes = null) {
    const p = await repo.getPersona(personaId);
    if (!p) throw new Error(`Dialogue Gym: persona ${personaId} not found`);
    const s = await repo.getScenario(scenarioId);
    if (!s) throw new Error(`Dialogue Gym: scenario ${scenarioId} not found`);
    const w = Number.isFinite(Number(weight)) ? Number(weight) : 1.0;
    await repo.putEdge(personaId, scenarioId, { weight: w, notes: notes || '' });
    return { personaId, scenarioId, weight: w, notes: notes || null };
  }

  async function unassignPersonaFromScenario(personaId, scenarioId) {
    await repo.delEdge(personaId, scenarioId);
    return true;
  }

  async function getPersonasForScenario(scenarioId) {
    const rows = await repo.personasForScenario(scenarioId);
    return rows.map((r) => ({ ...personaFromNode(r.persona), _weight: r.weight, _notes: r.notes }));
  }

  async function getScenariosForPersona(personaId) {
    const rows = await repo.scenariosForPersona(personaId);
    return rows.map((r) => ({ ...scenarioFromNode(r.scenario), _weight: r.weight, _notes: r.notes }));
  }

  // ── Utility: draw a (persona, scenario) pair for the ArenaRunner ──
  async function getRandomPair(filters = {}) {
    const { items: scenarios } = await listScenarios({ enabled: true, ...filters });
    if (!scenarios.length) return null;
    const scenario = pick(scenarios);

    // Prefer weighted SUITABLE_FOR personas; fall back to any enabled persona.
    const suited = (await getPersonasForScenario(scenario.scenarioId)).filter((p) => p.enabled);
    let persona;
    if (suited.length) {
      persona = weightedPick(suited, rand);
    } else {
      const { items: personas } = await listPersonas({ enabled: true });
      if (!personas.length) return null;
      persona = pick(personas);
    }
    return { persona, scenario };
  }

  return {
    // persona
    createPersona, getPersona, listPersonas, updatePersona, deletePersona,
    // scenario
    createScenario, getScenario, listScenarios, updateScenario, deleteScenario, verifyGroundTruth,
    // assignment
    assignPersonaToScenario, unassignPersonaFromScenario,
    getPersonasForScenario, getScenariosForPersona,
    // utility
    getRandomPair,
    ensureIndexes: () => repo.ensureIndexes(),
    // introspection
    enums: { DOMAIN_KNOWLEDGE, VERBOSITY, COOPERATIVENESS, LANGUAGES, CATEGORIES, DIFFICULTIES, SOURCES },
  };
}

function weightedPick(items, rand = Math.random) {
  const total = items.reduce((sum, it) => sum + (Number(it._weight) > 0 ? Number(it._weight) : 1), 0);
  let r = rand() * total;
  for (const it of items) {
    r -= (Number(it._weight) > 0 ? Number(it._weight) : 1);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

// default singleton (real Memgraph-backed)
const singleton = createDialogueGymService();

module.exports = singleton;
module.exports.createDialogueGymService = createDialogueGymService;
module.exports.memgraphRepo = memgraphRepo;
module.exports.personaMatches = personaMatches;
module.exports.scenarioMatches = scenarioMatches;
module.exports.PERSONA_LABEL = PERSONA_LABEL;
module.exports.SCENARIO_LABEL = SCENARIO_LABEL;
module.exports.ENUMS = { DOMAIN_KNOWLEDGE, VERBOSITY, COOPERATIVENESS, LANGUAGES, CATEGORIES, DIFFICULTIES, SOURCES };

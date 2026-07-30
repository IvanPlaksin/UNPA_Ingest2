'use strict';

/**
 * Ground-truth validator — the check that ratification was missing.
 *
 * WHY THIS EXISTS. Three of the nine ratified scenarios pointed at services that
 * cannot answer their goal, and one of them at a service that does not resemble
 * it at all: "Change the bank account used for salary payment" was ratified
 * against EO-HR-BE-SRA-SA, whose real title is "Request for Salary Advance".
 * Those scenarios were unwinnable, and every run against them was scored as an
 * agent failure. A third of the golden set was measuring nothing.
 *
 * The reason the mistake was easy to make is that ratification showed a CODE.
 * Nobody was shown the service's NAME next to the goal, so nobody could see the
 * mismatch. This module supplies exactly that, and refuses codes that do not
 * exist at all.
 *
 * Two controls, neither of them a similarity score:
 *
 *   - HARD (blocks):  the code is not in the catalogue. No judgement call —
 *                     a scenario expecting a nonexistent service can never pass.
 *
 *   - ACKNOWLEDGEMENT: the caller may pass `acknowledgedServiceTitle`, and it
 *                     must equal the catalogue's own title. A ratifier who has
 *                     to echo "Request for Salary Advance" cannot fail to notice
 *                     that the goal said "change the bank account". When it is
 *                     absent the title is still returned and flagged, so no path
 *                     ratifies a pairing without the name being put in front of
 *                     someone.
 *
 * WHY NOT A SIMILARITY SCORE. The first version of this module warned when the
 * goal and the title shared little vocabulary. Measured against the nine real
 * scenarios, that heuristic does not work — the good and bad pairs occupy the
 * same range:
 *
 *     0.600  Submit an education grant claim      -> Education Grant Claim(s)   GOOD
 *     0.250  Determine eligibility ... dependency -> Dependency Allowances      GOOD
 *     0.250  remaining ANNUAL leave balance       -> Advance HOME Leave Queries BAD
 *     0.200  Obtain a travel advance              -> Travel Related Entitlements GOOD
 *     0.200  Change the BANK ACCOUNT for salary   -> Request for SALARY ADVANCE BAD
 *     0.143  travel advance after mentioning leave-> Travel Related Entitlements GOOD
 *     0.000  Resolve a problem with their pay     -> Payment Inquiry            GOOD
 *
 * A good pair scores 0.000 and a bad one 0.250. No threshold separates them,
 * and "annual leave" vs "home leave" — two different entitlements sharing a
 * word — is exactly what lexical overlap cannot see. Tuning the number until
 * the known cases passed would have fitted the sample, not built a check.
 * `overlap()` is kept and exported because it is informative to display, but
 * nothing gates on it.
 *
 * @module services/dialogue-gym/scenario-validator.service
 */

/** Words that carry no discriminating signal when comparing a goal to a title. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'of', 'to', 'in', 'on', 'at', 'by', 'with',
  'my', 'your', 'their', 'his', 'her', 'its', 'our', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'be', 'been', 'get', 'got', 'find', 'out', 'about',
  'request', 'requests', 'query', 'queries', 'service', 'services', 'form',
  'submit', 'update', 'change', 'obtain', 'apply', 'need', 'want', 'would', 'like',
  'staff', 'member', 'un', 'please',
]);

const tokens = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}\s.]/gu, ' ')
  .split(/\s+/)
  .filter((w) => w.length > 2 && !STOPWORDS.has(w));

/** Jaccard-ish overlap: how much of the goal's vocabulary the title accounts for. */
function overlap(goal, title) {
  const g = new Set(tokens(goal));
  const t = new Set(tokens(title));
  if (!g.size || !t.size) return 0;
  let hits = 0;
  for (const w of g) {
    // Prefix match so "allowance"/"allowances" and "claim"/"claims" count.
    for (const x of t) {
      if (w === x || w.startsWith(x) || x.startsWith(w)) { hits += 1; break; }
    }
  }
  return hits / g.size;
}

/** Compare titles ignoring case, spacing and trailing punctuation. */
const sameTitle = (a, b) => String(a || '').replace(/\s+/g, ' ').trim().toLowerCase()
  === String(b || '').replace(/\s+/g, ' ').trim().toLowerCase();

function createScenarioValidator(deps = {}) {
  const read = deps.read || require('../../instances/flowdesk/schema-graph/driver').read;

  /** The catalogue's own name for a code, or null when it does not exist. */
  async function serviceTitle(serviceCode) {
    const rows = await read('MATCH (sd:ServiceDef {serviceId:$c}) RETURN sd.title AS t', { c: serviceCode });
    return rows.length ? rows[0].get('t') : null;
  }

  /**
   * Validate one scenario's ground truth against the live catalogue.
   * @param {{scenarioId?, name?, userGoal?, initialMessage?}} scenario
   * @param {string|null} expectedServiceCode  null = deflection, always valid
   * @param {{acknowledgedServiceTitle?:string}} [opts]
   * @returns {Promise<{ok, blocking, warnings, serviceTitle, similarity}>}
   */
  async function validate(scenario, expectedServiceCode, opts = {}) {
    const blocking = [];
    const warnings = [];

    // A deflection scenario asserts that NO service fits. Nothing to check.
    if (expectedServiceCode == null || expectedServiceCode === '') {
      return { ok: true, blocking, warnings, serviceTitle: null, similarity: null, deflection: true };
    }

    const title = await serviceTitle(expectedServiceCode);
    if (!title) {
      blocking.push({
        code: 'SERVICE_NOT_IN_CATALOG',
        message: `"${expectedServiceCode}" is not in the service catalogue. A scenario expecting a service that does not exist can never pass, and every run against it would be scored as an agent failure.`,
      });
      return { ok: false, blocking, warnings, serviceTitle: null, similarity: null };
    }

    const goal = `${scenario.userGoal || ''} ${scenario.initialMessage || ''}`.trim();
    const similarity = overlap(goal, title); // reported, never gated on — see the header

    const ack = opts.acknowledgedServiceTitle;
    if (ack != null && ack !== '') {
      // The ratifier claims to have read the service name. If what they read is
      // not what the catalogue says, they ratified a different service than they
      // think — refuse rather than record a confident mistake.
      if (!sameTitle(ack, title)) {
        blocking.push({
          code: 'TITLE_ACKNOWLEDGEMENT_MISMATCH',
          message: `The acknowledged service name does not match the catalogue.\n  acknowledged: "${ack}"\n  catalogue:    "${title}" (${expectedServiceCode})`,
        });
      }
    } else {
      // No acknowledgement: allowed (scripts and the CLI use this path), but the
      // name is put in front of the caller. Showing only a CODE is what let
      // "Change the bank account" be ratified against "Request for Salary Advance".
      warnings.push({
        code: 'SERVICE_TITLE_UNACKNOWLEDGED',
        message: `Confirm this is the right service:\n  goal:    ${scenario.userGoal || '(none)'}\n  service: "${title}" (${expectedServiceCode})`,
        serviceTitle: title,
        similarity,
      });
    }

    return { ok: blocking.length === 0, blocking, warnings, serviceTitle: title, similarity };
  }

  /** Validate every scenario in a list — the sweep that found the three errors. */
  async function validateAll(scenarios) {
    const out = [];
    for (const s of scenarios || []) {
      const r = await validate(s, s.expectedServiceCode);
      out.push({ scenarioId: s.scenarioId, name: s.name, ...r });
    }
    return {
      total: out.length,
      blocked: out.filter((r) => !r.ok).length,
      warned: out.filter((r) => r.ok && r.warnings.length).length,
      results: out,
    };
  }

  return { validate, validateAll, serviceTitle, overlap: (g, t) => overlap(g, t), sameTitle };
}

module.exports = createScenarioValidator();
module.exports.createScenarioValidator = createScenarioValidator;
module.exports.overlap = overlap;
module.exports.tokens = tokens;
module.exports.sameTitle = sameTitle;

'use strict';

const SOURCE_RELIABILITY = {
  A: { code: 'A', name: 'COMPLETELY_RELIABLE',          weight: 1.0 },
  B: { code: 'B', name: 'USUALLY_RELIABLE',             weight: 0.8 },
  C: { code: 'C', name: 'FAIRLY_RELIABLE',              weight: 0.6 },
  D: { code: 'D', name: 'NOT_USUALLY_RELIABLE',         weight: 0.4 },
  E: { code: 'E', name: 'UNRELIABLE',                   weight: 0.2 },
  F: { code: 'F', name: 'RELIABILITY_CANNOT_BE_JUDGED', weight: 0.5 },
};

const INFORMATION_ACCURACY = {
  1: { code: '1', name: 'CONFIRMED',                 weight: 1.0 },
  2: { code: '2', name: 'PROBABLY_TRUE',             weight: 0.8 },
  3: { code: '3', name: 'POSSIBLY_TRUE',             weight: 0.6 },
  4: { code: '4', name: 'DOUBTFULLY_TRUE',           weight: 0.4 },
  5: { code: '5', name: 'IMPROBABLE',                weight: 0.2 },
  6: { code: '6', name: 'TRUTH_CANNOT_BE_JUDGED',    weight: 0.5 },
};

// Source type heuristics → default reliability code
const SOURCE_TYPE_DEFAULTS = {
  official_document: 'A',
  legal_contract:    'A',
  audited_report:    'A',
  technical_doc:     'B',
  policy:            'B',
  verified_report:   'B',
  wiki:              'C',
  meeting_notes:     'C',
  team_comms:        'C',
  email:             'D',
  chat:              'D',
  unverified_claim:  'D',
  rumor:             'E',
  anonymous:         'E',
  unknown:           'F',
};

function calculateAdmiraltyWeight(sourceCode, accuracyCode) {
  const s = SOURCE_RELIABILITY[sourceCode];
  const a = INFORMATION_ACCURACY[String(accuracyCode)];
  if (!s || !a) return null;
  return Math.sqrt(s.weight * a.weight);
}

function parseAdmiraltyCode(combined) {
  if (!combined || combined.length !== 2) return null;
  const source   = combined[0].toUpperCase();
  const accuracy = combined[1];
  const s = SOURCE_RELIABILITY[source];
  const a = INFORMATION_ACCURACY[String(accuracy)];
  if (!s || !a) return null;
  return { source, accuracy, weight: calculateAdmiraltyWeight(source, accuracy) };
}

function formatAdmiraltyCode(sourceCode, accuracyCode) {
  return `${sourceCode}${accuracyCode}`;
}

function compareAdmiraltyCodes(codeA, codeB) {
  const a = parseAdmiraltyCode(codeA);
  const b = parseAdmiraltyCode(codeB);
  if (!a || !b) return 0;
  return a.weight - b.weight;
}

function validateCode(sourceCode, accuracyCode) {
  if (!SOURCE_RELIABILITY[sourceCode]) return `Invalid source reliability code: ${sourceCode}`;
  if (!INFORMATION_ACCURACY[String(accuracyCode)]) return `Invalid information accuracy code: ${accuracyCode}`;
  return null;
}

module.exports = {
  SOURCE_RELIABILITY,
  INFORMATION_ACCURACY,
  SOURCE_TYPE_DEFAULTS,
  calculateAdmiraltyWeight,
  parseAdmiraltyCode,
  formatAdmiraltyCode,
  compareAdmiraltyCodes,
  validateCode,
};

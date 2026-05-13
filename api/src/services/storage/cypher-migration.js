'use strict';

/**
 * Cypher compatibility checker and AGE migration utility.
 *
 * Detects Memgraph-specific constructs that are incompatible with
 * Apache AGE v1.6.0 and classifies query complexity for migration planning.
 */

// ─── Incompatibility rules ────────────────────────────────────────────────────

const RULES = [
  {
    code: 'FOREACH',
    severity: 'HIGH',
    pattern: /\bFOREACH\b/i,
    message: 'FOREACH not supported in AGE v1.6.0. Split into two queries with MATCH + conditional CREATE/MERGE.',
    migration: 'Replace FOREACH(x IN CASE WHEN n IS NOT NULL THEN [1] ELSE [] END | ...) with a separate MATCH + MERGE/CREATE query.',
  },
  {
    code: 'CALL_MG',
    severity: 'HIGH',
    pattern: /\bCALL\s+mg\./i,
    message: 'mg.* procedures are Memgraph-specific (MAGE). Not available in AGE.',
    migration: 'Remove or replace with application-layer logic (e.g. community_detection fallback in JS).',
  },
  {
    code: 'CALL_DB',
    severity: 'HIGH',
    pattern: /\bCALL\s+db\./i,
    message: 'db.* procedures are Memgraph-specific. Not available in AGE.',
    migration: 'Replace db.labels() / db.schema() with application-layer schema cache built at startup.',
  },
  {
    code: 'CALL_GDS',
    severity: 'HIGH',
    pattern: /\bCALL\s+gds\./i,
    message: 'gds.* procedures (Graph Data Science) are not available in AGE.',
    migration: 'Use existing JS fallback (e.g. shortestPath() in FindPathTool).',
  },
  {
    code: 'CALL_PROC',
    severity: 'HIGH',
    pattern: /\bCALL\s+[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*\s*\(/i,
    message: 'Procedure CALL (namespace.proc()) not supported in AGE.',
    migration: 'Replace with application-layer equivalent or remove.',
  },
  {
    code: 'SHOW_INDEX',
    severity: 'HIGH',
    pattern: /\bSHOW\s+INDEX\b/i,
    message: 'SHOW INDEX INFO is Memgraph-specific, not standard openCypher/AGE.',
    migration: 'Use PostgreSQL information_schema or pg_indexes to query index metadata.',
  },
  {
    code: 'CREATE_CONSTRAINT',
    severity: 'MEDIUM',
    pattern: /\bCREATE\s+CONSTRAINT\b/i,
    message: 'CREATE CONSTRAINT uses Memgraph syntax. Not supported in AGE.',
    migration: 'Use PostgreSQL DDL: CREATE UNIQUE INDEX or ALTER TABLE ADD CONSTRAINT.',
  },
  {
    code: 'ASSERT_UNIQUE',
    severity: 'MEDIUM',
    pattern: /\bASSERT\s+.*\bIS\s+UNIQUE\b/i,
    message: 'ASSERT ... IS UNIQUE is Memgraph-specific constraint syntax.',
    migration: 'Use PostgreSQL CREATE UNIQUE INDEX on the properties JSON column.',
  },
  {
    code: 'CREATE_INDEX_ON',
    severity: 'LOW',
    pattern: /\bCREATE\s+INDEX\s+ON\b/i,
    message: 'CREATE INDEX ON is Memgraph syntax. Minor difference from AGE/standard.',
    migration: 'AGE properties are stored as JSON in PostgreSQL — use GIN or B-tree indexes on the properties column.',
  },
  {
    code: 'WITH_STAR',
    severity: 'LOW',
    pattern: /\bWITH\s+\*/i,
    message: 'WITH * may have unexpected behavior in AGE. Consider listing explicit variables.',
    migration: 'Replace WITH * with explicit variable list.',
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check a Cypher query string for AGE v1.6.0 compatibility issues.
 *
 * @param {string} cypher
 * @returns {{ compatible: boolean, complexity: 'TRIVIAL'|'MODERATE'|'COMPLEX', issues: Array }}
 */
function checkCompatibility(cypher) {
  if (!cypher || typeof cypher !== 'string') {
    return { compatible: true, complexity: 'TRIVIAL', issues: [] };
  }

  const issues = [];
  for (const rule of RULES) {
    if (rule.pattern.test(cypher)) {
      issues.push({
        code: rule.code,
        severity: rule.severity,
        message: rule.message,
        migration: rule.migration,
      });
    }
  }

  const highCount = issues.filter(i => i.severity === 'HIGH').length;
  const medCount = issues.filter(i => i.severity === 'MEDIUM').length;

  return {
    compatible: highCount === 0 && medCount === 0,
    complexity: highCount > 0 ? 'COMPLEX' : medCount > 0 ? 'MODERATE' : 'TRIVIAL',
    issues,
  };
}

/**
 * Check whether a string looks like a Cypher query (not just any string).
 * Used by the audit script to filter template literals.
 */
function looksLikeCypher(str) {
  if (!str || str.length < 10) return false;
  return /\b(MATCH|CREATE|MERGE|RETURN|WITH|UNWIND|DELETE|SET|REMOVE|WHERE)\b/i.test(str);
}

module.exports = { checkCompatibility, looksLikeCypher, RULES };

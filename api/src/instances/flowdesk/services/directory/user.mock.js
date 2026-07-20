'use strict';

/**
 * Mock user directory (F9.1b) — beneficiary lookup (stand-in for Unite Identity).
 *
 * MCP-like signatures; swap for a real MCP tool later via a single import change.
 * NOT production data — a fixture for the pilot flow.
 *
 * @module instances/flowdesk/services/directory/user.mock
 */

// Org hierarchy (F9.2a): managerId links to the direct supervisor; role ∈
// {staff, manager, director}. Approver = manager of the beneficiary/author.
//   U004 (director) → U001 (manager) → U003 (staff)
//   U005 (director) → U002 (staff)
const MOCK_USERS = [
  { userId: 'U001', name: 'Ivan Petrov', email: 'petrov@un.org', location: { code: 'NY-HQ', name: 'New York HQ' }, department: 'OICT', role: 'manager', managerId: 'U004', aliases: ['Иван Петров', 'Петров'] },
  { userId: 'U002', name: 'Maria Ivanova', email: 'ivanova@un.org', location: { code: 'GVA', name: 'Geneva' }, department: 'HR', role: 'staff', managerId: 'U005', aliases: ['Мария Иванова', 'Иванова'] },
  { userId: 'U003', name: 'Ahmed Hassan', email: 'hassan@un.org', location: { code: 'NBO', name: 'Nairobi' }, department: 'OICT', role: 'staff', managerId: 'U001', aliases: ['Ахмед Хассан', 'Хассан'] },
  { userId: 'U004', name: 'Li Wei', email: 'li.wei@un.org', location: { code: 'VIE', name: 'Vienna' }, department: 'OICT', role: 'director', managerId: null, aliases: ['Ли Вэй'] },
  { userId: 'U005', name: 'Sofia Rossi', email: 'rossi@un.org', location: { code: 'ROM', name: 'Rome' }, department: 'HR', role: 'director', managerId: null, aliases: ['София Росси', 'Росси'] },
];

// The signed-in demo user (used for "self" beneficiary).
const CURRENT_USER = MOCK_USERS[0];

function norm(s) { return String(s || '').trim().toLowerCase(); }

/** Combined lowercased search index for a user (name + aliases + email + id). */
function haystack(u) {
  return norm([u.name, ...(u.aliases || []), u.email, u.userId].join(' '));
}

/**
 * Fuzzy resolve by name / alias (incl. Cyrillic) / email / userId.
 * Matches when the query is a substring of the user's search index, or equals
 * one of its whitespace tokens. Empty query → [].
 * @returns {Promise<Array>} matching users (typed directory records)
 */
async function resolveUser(query) {
  const q = norm(query);
  if (!q) return [];
  return MOCK_USERS.filter((u) => {
    const hay = haystack(u);
    if (hay.includes(q)) return true;
    return hay.split(/\s+/).some((t) => t === q);
  }).map((u) => ({ ...u, location: { ...u.location }, aliases: undefined }));
}

/** Resolve a specific user by id. */
async function getUser(userId) {
  const hit = MOCK_USERS.find((u) => u.userId === userId);
  return hit ? { ...hit, location: { ...hit.location } } : null;
}

/** The current signed-in user (for self-requests). */
async function getCurrentUser() {
  return { ...CURRENT_USER, location: { ...CURRENT_USER.location } };
}

/** Users eligible to approve (managers + directors) as typed records. */
async function listManagers() {
  return MOCK_USERS
    .filter((u) => u.role === 'manager' || u.role === 'director')
    .map((u) => ({ userId: u.userId, name: u.name, email: u.email, location: { ...u.location }, role: u.role, department: u.department }));
}

/** Direct supervisor of a user (org hierarchy). Null for top-level directors. */
async function getManager(userId) {
  const u = MOCK_USERS.find((x) => x.userId === userId);
  if (!u || !u.managerId) return null;
  return getUser(u.managerId);
}

/**
 * Approver for a request, by administrative affiliation (F9.2a/R5): the manager
 * of the given user (beneficiary or author). A top-level director has no
 * approver (returns null → the flow asks the user to pick one).
 */
async function resolveApprover(userId) {
  return getManager(userId);
}

module.exports = { resolveUser, getUser, getCurrentUser, getManager, resolveApprover, listManagers, MOCK_USERS, CURRENT_USER };

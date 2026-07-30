'use strict';

/**
 * Voice-friendly formatters (V3) — turn section-query results (tasks/requests/mail)
 * into short, speakable sentences: brief for lists, detailed on request. No visual
 * markup; small counts spoken as words; lists capped (offer "more"). Templates are
 * parameterized via `s` (localized strings; English defaults) so V3-014 can swap in
 * the 6 UN languages without touching the shaping logic.
 *
 * @module instances/flowdesk/interpreter/voice-formatters
 */

const NUM_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function numberToWords(n, words = NUM_EN) {
  const i = Number(n);
  return Number.isInteger(i) && i >= 0 && i < words.length ? words[i] : String(n);
}
function truncate(str, max) {
  const t = str == null ? '' : String(str).trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}
const clean = (v) => (v == null || v === '' ? null : String(v));

const DEFAULTS = {
  numberWords: NUM_EN,
  tasksNone: 'You have no tasks matching that.',
  tasksList: (n, summary, more) => `You have ${n} ${n === 'one' ? 'task' : 'tasks'}. ${summary}.${more} Want details on any of them?`,
  tasksMore: (total) => ` ${total} in total.`,
  taskItem: (i, t) => `${i}. ${t.title}${t.status ? `, ${t.status}` : ''}${t.priority ? `, ${t.priority} priority` : ''}`,
  taskDetail: (t) => `Task: ${t.title}.${t.status ? ` Status: ${t.status}.` : ''}${t.priority ? ` Priority: ${t.priority}.` : ''}${t.service ? ` Related to: ${t.service}.` : ''}${t.dueDate ? ` Due ${t.dueDate}.` : ''}${t.description ? ` ${truncate(t.description, 240)}` : ''}`,

  requestsNone: 'You have no requests matching that.',
  requestsList: (n, summary, more) => `You have ${n} ${n === 'one' ? 'request' : 'requests'}. ${summary}.${more} Want details on any of them?`,
  requestItem: (i, r) => `${i}. ${r.ref || r.title}${r.status ? `, ${r.status}` : ''}${r.service ? `, ${r.service}` : ''}`,
  requestDetail: (r) => `Request ${r.ticketNumber || ''}: ${r.title}.${r.status ? ` Status: ${r.status}.` : ''}${r.service ? ` Service: ${r.service}.` : ''}${r.assignedTo ? ` Assigned to ${r.assignedTo}.` : ' Not yet assigned.'}${r.approver ? ` Approver: ${r.approver}.` : ''}${r.description ? ` ${truncate(r.description, 240)}` : ''}`,

  mailNone: (folder) => `You have no messages in ${folder}.`,
  mailList: (n, folder, summary) => `You have ${n} ${n === 'one' ? 'message' : 'messages'} in ${folder}. ${summary}. Want me to read any of them?`,
  mailItem: (i, m) => `${i}. From ${m.from || 'unknown'}${m.subject ? `, ${truncate(m.subject, 60)}` : ''}${m.read ? '' : ', unread'}`,
  mailDetail: (m) => `Message from ${m.from || 'unknown'}${m.date ? `, ${m.date}` : ''}. Subject: ${m.subject || '(no subject)'}. ${truncate(m.body, 500)}`,
  mailCounts: (unread) => `You have ${unread} unread ${unread === 'one' ? 'message' : 'messages'} in your inbox.`,
};

function withStrings(s) { return { ...DEFAULTS, ...(s || {}) }; }

function formatTaskList(result, s) {
  const S = withStrings(s);
  const tasks = (result && result.tasks) || [];
  if (tasks.length === 0) return S.tasksNone;
  const shown = tasks.slice(0, 5);
  const n = numberToWords(shown.length, S.numberWords);
  const summary = shown.map((t, i) => S.taskItem(i + 1, t)).join('. ');
  const total = (result && result.totalCount) || tasks.length;
  const more = total > shown.length ? S.tasksMore(total) : '';
  return S.tasksList(n, summary, more);
}
function formatTaskDetail(task, s) { return withStrings(s).taskDetail(task || {}); }

function formatRequestList(result, s) {
  const S = withStrings(s);
  const tickets = (result && result.tickets) || [];
  if (tickets.length === 0) return S.requestsNone;
  const shown = tickets.slice(0, 5);
  const n = numberToWords(shown.length, S.numberWords);
  const summary = shown.map((r, i) => S.requestItem(i + 1, r)).join('. ');
  const total = (result && result.totalCount) || tickets.length;
  const more = total > shown.length ? S.tasksMore(total) : '';
  return S.requestsList(n, summary, more);
}
function formatRequestDetail(req, s) { return withStrings(s).requestDetail(req || {}); }

function formatMailList(result, s) {
  const S = withStrings(s);
  const messages = (result && result.messages) || [];
  const folder = (result && result.folder) || 'inbox';
  if (messages.length === 0) return S.mailNone(folder);
  const shown = messages.slice(0, 5);
  const n = numberToWords(shown.length, S.numberWords);
  const summary = shown.map((m, i) => S.mailItem(i + 1, m)).join('. ');
  return S.mailList(n, folder, summary);
}
function formatMailDetail(msg, s) { return withStrings(s).mailDetail(msg || {}); }
function formatMailCounts(result, s) {
  const S = withStrings(s);
  const unread = (result && result.inboxUnread) || 0;
  return S.mailCounts(numberToWords(unread, S.numberWords));
}

module.exports = {
  numberToWords, truncate, clean,
  formatTaskList, formatTaskDetail,
  formatRequestList, formatRequestDetail,
  formatMailList, formatMailDetail, formatMailCounts,
  DEFAULTS,
};

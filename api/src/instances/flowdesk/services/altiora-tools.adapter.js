'use strict';

/**
 * AltioraToolsAdapter (F9.4/N3) — the single gated access point through which the
 * FlowDesk/Altiora chat agent reaches the knowledge base and platform services.
 *
 * "Knowledge base" here is the COMPLEX of high-level services over the vector DB
 * (Qdrant) AND the graph DB (Memgraph), not a single store. This adapter:
 *   - enforces an ALLOWLIST — only Altiora-relevant tools (KB / catalog / SR /
 *     directory); everything else (backlog, codex-admin, ingestion, raw graph)
 *     is denied;
 *   - applies the Altiora ISOLATION filter to every read: namespace='Altiora'
 *     on the vector side, scope/domain='altiora' on the graph side;
 *   - audit-logs every call.
 *
 * It calls the underlying services directly (same process — no stdio/MCP spawn
 * overhead) but keeps an MCP-like `call(tool, params)` surface so it can be
 * swapped for a real MCP client (Claude Agent SDK) later without touching callers.
 *
 * @module instances/flowdesk/services/altiora-tools.adapter
 */

const NAMESPACE = process.env.FLOWDESK_KB_NAMESPACE || 'Altiora';
const CODEX_SCOPE = process.env.FLOWDESK_CODEX_SCOPE || 'altiora';

// Only these tools are reachable by the Altiora chat agent.
const ALLOWLIST = new Set([
  // Knowledge base (services over vector + graph)
  'kb.search',
  // Service catalog
  'catalog.search',
  'catalog.getSchema',
  'catalog.browse',
  // Service requests
  'sr.status',
  'sr.list',
  'sr.metadata',
  // V3 section queries (acting-user scoped): tasks / requests-detail / mail
  'tasks.list', 'tasks.get', 'tasks.metadata',
  'requests.get',
  'mail.list', 'mail.get', 'mail.counts',
  // Directory (resolvers)
  'directory.resolveUser', 'directory.getUser', 'directory.listLocations',
  'directory.resolveLocation', 'directory.resolveApprover', 'directory.getCurrentUser',
]);

class ToolNotAllowedError extends Error {
  constructor(tool) {
    super(`[Altiora] tool "${tool}" is not in the Altiora allowlist`);
    this.name = 'ToolNotAllowedError';
    this.code = 'TOOL_NOT_ALLOWED';
    this.tool = tool;
  }
}

function createAltioraTools(deps = {}) {
  const namespace = deps.namespace || NAMESPACE;
  const codexScope = deps.codexScope || CODEX_SCOPE;
  const log = deps.logger || ((e) => { try { console.log(`[Altiora tools] ${e.tool} (ns=${e.namespace})`); } catch { /* ignore */ } });

  // Lazily built underlying services (KB=Qdrant, catalog, sr, directory).
  // All overridable via deps for testing.
  const lazy = {};
  const articleBackend = () => (lazy.article || (lazy.article = deps.articleBackend || require('./backends/article.backend').makeArticleBackend({ namespace })));
  const serviceBackend = () => (lazy.service || (lazy.service = deps.serviceBackend || require('./backends/service.backend').makeServiceBackend()));
  const srBackend = () => (lazy.sr || (lazy.sr = deps.srBackend || require('./backends/sr-status.backend').makeSRStatusBackend()));
  const ticketListBackend = () => (lazy.ticketList || (lazy.ticketList = deps.ticketListBackend || require('./backends/ticket-list.backend').makeTicketListBackend()));
  const tasksBackend = () => (lazy.tasks || (lazy.tasks = deps.tasksBackend || require('./backends/tasks.backend').makeTasksBackend()));
  const mailBackend = () => (lazy.mail || (lazy.mail = deps.mailBackend || require('./backends/mail.backend').makeMailBackend()));
  const catalogBrowseBackend = () => (lazy.catalogBrowse || (lazy.catalogBrowse = deps.catalogBrowseBackend || require('./backends/catalog-browse.backend').makeCatalogBrowseBackend()));
  const directory = () => (lazy.dir || (lazy.dir = deps.directory || require('./directory')));
  const compile = () => (deps.compile || require('../schema-graph/schema-compiler').compile);

  const isAllowed = (tool) => ALLOWLIST.has(tool);

  async function call(tool, params = {}) {
    if (!isAllowed(tool)) throw new ToolNotAllowedError(tool);
    log({ tool, namespace, params: Object.keys(params) });

    switch (tool) {
      // Knowledge base — vector search, ALWAYS namespace=Altiora (isolation).
      case 'kb.search':
        return articleBackend()(params.query, { ...params.context, namespace });

      case 'catalog.search':
        return serviceBackend()(params.query, params.context);
      case 'catalog.getSchema':
        return compile()(params.serviceId);
      // Hierarchical catalog drill-down (parentId=null → root categories).
      case 'catalog.browse':
        return catalogBrowseBackend().browse(params.parentId || null);

      case 'sr.status':
        return srBackend()(params.srNumber, params.context);
      // The current user's ticket list (acting-user scoped) + filter-option metadata.
      case 'sr.list':
        return ticketListBackend().listTickets(params.filters || params);
      case 'sr.metadata':
        return ticketListBackend().metadata();

      // V3 — /tasks: list + filter (acting-user scoped) + detail + filter options.
      case 'tasks.list':
        return tasksBackend().listTasks(params.filters || params);
      case 'tasks.get':
        return tasksBackend().getTask(params.taskId || params.id);
      case 'tasks.metadata':
        return tasksBackend().metadata();
      // V3 — /requests: detail by number (list stays on sr.list).
      case 'requests.get':
        return ticketListBackend().getTicketByNumber(params.requestNumber || params.number);
      // V3 — /mail: list + filter, detail, unread/stats summary.
      case 'mail.list':
        return mailBackend().listMail(params.filters || params);
      case 'mail.get':
        return mailBackend().getMail(params.messageId || params.id);
      case 'mail.counts':
        return mailBackend().counts();

      case 'directory.resolveUser': return directory().resolveUser(params.query);
      case 'directory.getUser': return directory().getUser(params.userId);
      case 'directory.getCurrentUser': return directory().getCurrentUser();
      case 'directory.listLocations': return directory().listLocations();
      case 'directory.resolveLocation': return directory().resolveLocation(params.code);
      case 'directory.resolveApprover': return directory().resolveApprover(params.userId);

      default:
        throw new ToolNotAllowedError(tool);
    }
  }

  return {
    call,
    isAllowed,
    namespace,
    codexScope,
    allowlist: () => Array.from(ALLOWLIST),
    // Convenience wrappers used by resolve.search backends (F9.4e).
    searchServices: (query, context) => call('catalog.search', { query, context }),
    searchArticles: (query, context) => call('kb.search', { query, context }),
    getSRStatus: (srNumber, context) => call('sr.status', { srNumber, context }),
    // Chat-agent read tools (user's tickets + catalog drill-down).
    listMyTickets: (filters) => call('sr.list', { filters }),
    ticketMetadata: () => call('sr.metadata', {}),
    browseCatalog: (parentId) => call('catalog.browse', { parentId }),
    // V3 section queries.
    listMyTasks: (filters) => call('tasks.list', { filters }),
    getMyTask: (taskId) => call('tasks.get', { taskId }),
    getMyRequest: (requestNumber) => call('requests.get', { requestNumber }),
    listMyMail: (filters) => call('mail.list', { filters }),
    getMyMail: (messageId) => call('mail.get', { messageId }),
    mailCounts: () => call('mail.counts', {}),
  };
}

let _default;
function getAltioraTools() {
  if (!_default) _default = createAltioraTools();
  return _default;
}

module.exports = { createAltioraTools, getAltioraTools, ALLOWLIST, ToolNotAllowedError };

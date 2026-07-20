/**
 * MCP Tools for FlowDesk Chat Admin
 *
 * Exposes the full FlowDesk Chat Admin REST surface (Chat V2 ↔ Altiora
 * observability) to MCP clients, so an agent can READ and WORK WITH the chat
 * AI-agent sessions from http://localhost:5173/alt-chat-demo:
 *   - browse / inspect / replay sessions (transcript, node trace, draft, LLM)
 *   - the negative-experience quality loop (triage → BackLog)
 *   - the P5 session-analysis AI agent + prompt overlays (global / per-service)
 *   - catalog, schemas, sync, tickets, LLM telemetry
 *
 * Proxies to the UNPA_Ingest backend at UNPA_API_URL (default
 * http://localhost:3010) under /api/v1/flowdesk/admin/*.
 *
 * NOTE: unlike pipeline-tools, the FlowDesk admin controller does NOT use the
 * `{ ok, data }` envelope — it returns the raw payload and signals errors via
 * HTTP status + `{ error }`. Hence the status-based helpers below.
 */

const UNPA_API = process.env.UNPA_API_URL ?? 'http://localhost:3010';
const ADMIN_BASE = '/api/v1/flowdesk/admin';

function adminHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  // Admin gate is OPEN when the backend has neither FLOWDESK_ADMIN_TOKEN nor
  // FLOWDESK_ADMIN_USERS set; when a token is configured, forward it.
  if (process.env.FLOWDESK_ADMIN_TOKEN) h['X-FlowDesk-Admin-Token'] = process.env.FLOWDESK_ADMIN_TOKEN;
  return h;
}

async function adminGet(path: string): Promise<unknown> {
  const res = await fetch(`${UNPA_API}${ADMIN_BASE}${path}`, { headers: adminHeaders() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? `API error ${res.status}`);
  return json;
}

async function adminSend(method: 'POST' | 'PATCH', path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${UNPA_API}${ADMIN_BASE}${path}`, {
    method,
    headers: adminHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? `API error ${res.status}`);
  return json;
}

/** Build a query string from defined values only. */
function qs(params: Record<string, unknown>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `?${pairs.join('&')}` : '';
}

// ── tool definitions ──────────────────────────────────────────────────────────

export function getFlowdeskAdminToolDefinitions() {
  return [
    // ── Sessions (P1) ────────────────────────────────────────────────────────
    {
      name: 'flowdesk_admin_list_sessions',
      description: `List FlowDesk Chat V2 sessions (the AI intake chat used at /alt-chat-demo), newest first, with filters and paging.
        Each row carries outcome (active|completed|escalated|parked|parked_abandoned|abandoned|submit_failed), derived quality flags, service, user, turn/repair counts, LLM cost and ticket ref.
        Use free-text 'q' to full-text search across transcripts. Start here to find sessions to inspect.`,
      inputSchema: {
        type: 'object',
        properties: {
          q: { type: 'string', description: 'Full-text search across user+agent turn text' },
          outcome: { type: 'string', description: "Filter by outcome, or 'active' for non-terminal" },
          serviceId: { type: 'string', description: 'Filter by resolved service code (e.g. EO-HR-SA-SS-ISP)' },
          userId: { type: 'string', description: 'Filter by userId or display-name substring' },
          channel: { type: 'string', enum: ['text', 'voice'], description: 'Filter by channel' },
          flagged: { type: 'boolean', description: 'true = negative sessions only (bad outcome or quality flag)' },
          qualityStatus: { type: 'string', enum: ['new', 'reviewed', 'actioned', 'dismissed'], description: 'Filter by triage status' },
          repairMin: { type: 'number', description: 'Only sessions with repair.session >= N' },
          from: { type: 'string', description: 'ISO start date (startedAt >=)' },
          to: { type: 'string', description: 'ISO end date (startedAt <=)' },
          page: { type: 'number', description: '1-based page (default 1)' },
          pageSize: { type: 'number', description: 'Rows per page (default 25, max 200)' },
        },
      },
    },
    {
      name: 'flowdesk_admin_get_session',
      description: `Get one chat session's node plus its live DraftSR (or the final draft snapshot if expired): slots, provenance, patch journal, repair counters, outcome, ticket ref, triage/analysis state.`,
      inputSchema: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: 'Chat session id' } },
        required: ['sessionId'],
      },
    },
    {
      name: 'flowdesk_admin_get_session_turns',
      description: `Get the full ordered transcript of a session for replay: each turn's user text, agent reply, route, node trace (with per-node durations), LLM calls, errors. Voice-channel raw transcript entries are merged in. This is how you READ what the user and the AI agent actually said.`,
      inputSchema: {
        type: 'object',
        properties: { sessionId: { type: 'string', description: 'Chat session id' } },
        required: ['sessionId'],
      },
    },
    {
      name: 'flowdesk_admin_session_stats',
      description: `Dashboard aggregates over a trailing window: session/turn counts, completion rate, funnel (started → intent resolved → submitted), outcome mix, per-day trend, per-service breakdown, LLM cost.`,
      inputSchema: {
        type: 'object',
        properties: { days: { type: 'number', description: 'Trailing window in days (default 7, max 90)' } },
      },
    },

    // ── Quality (P2) ─────────────────────────────────────────────────────────
    {
      name: 'flowdesk_admin_list_negative_sessions',
      description: `The negative-experience feed: sessions auto-flagged as problematic (bad outcome OR a quality flag such as repair_heavy / out_of_scope_loop / error_turns / negative_csat). Same filters as list_sessions. Use this to find sessions where the user did NOT get what they needed.`,
      inputSchema: {
        type: 'object',
        properties: {
          qualityStatus: { type: 'string', enum: ['new', 'reviewed', 'actioned', 'dismissed'] },
          outcome: { type: 'string' },
          serviceId: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
          page: { type: 'number' },
          pageSize: { type: 'number' },
        },
      },
    },
    {
      name: 'flowdesk_admin_quality_meta',
      description: 'Get the allowed enum values for triage: qualityStatus values, rootCause values, and the list of "bad" outcomes. Call before triaging to use valid values.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flowdesk_admin_triage_session',
      description: `Triage a session: set its quality status, root cause and a review note. Root cause must be one of the values from flowdesk_admin_quality_meta.`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Chat session id' },
          qualityStatus: { type: 'string', enum: ['new', 'reviewed', 'actioned', 'dismissed'] },
          rootCause: { type: 'string', description: 'Root-cause label (see quality_meta.rootCauses)' },
          reviewNote: { type: 'string', description: 'Free-text reviewer note' },
        },
        required: ['sessionId'],
      },
    },
    {
      name: 'flowdesk_admin_create_backlog',
      description: `Convert a triaged negative session into a BackLog task (closes the improvement loop). Auto-builds a FIX/SERVICE item with a transcript excerpt and permalink, stamps the session backlogId + qualityStatus='actioned'. Returns the created item.`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Chat session id' },
          title: { type: 'string', description: 'Optional custom title (auto-generated if omitted)' },
          description: { type: 'string', description: 'Optional custom description (auto-generated if omitted)' },
          rootCause: { type: 'string', description: 'Override root cause for the task' },
        },
        required: ['sessionId'],
      },
    },

    // ── Session-analysis AI agent + prompt overlays (P5) ─────────────────────
    {
      name: 'flowdesk_admin_analyze_session',
      description: `Run (or return the cached) AI analysis of a session: reviews the transcript, final draft state and the invoked form schema, and returns a strict verdict — successAssessment (userGoalAchieved + score + summary), classified problems[], generalPromptRecommendation (system-wide fix), schemaPromptRecommendation (this service's schema only) and per-field schemaClarityFindings[]. Pass force=true to re-run. This is the AI agent that assesses chat success and proposes prompt changes.`,
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Chat session id' },
          force: { type: 'boolean', description: 'Re-run even if a cached analysis exists (default false)' },
        },
        required: ['sessionId'],
      },
    },
    {
      name: 'flowdesk_admin_list_prompt_overlays',
      description: `List operator prompt overlays — guidance that tunes the chat without a deploy. Scope 'global' applies to every conversation (ROUTER/INFO/planner); scope 'service' applies only to one service's question planning. Filter by scope/serviceId/active.`,
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['global', 'service'] },
          serviceId: { type: 'string' },
          active: { type: 'boolean' },
        },
      },
    },
    {
      name: 'flowdesk_admin_apply_prompt_overlay',
      description: `Apply (create) a prompt overlay to improve the chat. Use scope='global' for a general-functionality fix (affects all conversations), or scope='service' + serviceId for a schema-specific fix (affects only that service's question phrasing). Typically fed from analyze_session recommendations. Active immediately, no deploy.`,
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['global', 'service'], description: 'global = system-wide; service = one schema only' },
          serviceId: { type: 'string', description: 'Required when scope=service (e.g. EO-HR-SA-SS-ISP)' },
          text: { type: 'string', description: 'The guidance instruction block (10..2000 chars)' },
          rationale: { type: 'string', description: 'Why this overlay was applied' },
          sourceSessionId: { type: 'string', description: 'The session that motivated it (provenance)' },
        },
        required: ['scope', 'text'],
      },
    },
    {
      name: 'flowdesk_admin_set_prompt_overlay_active',
      description: 'Activate or deactivate a prompt overlay by id. Deactivating is a soft revert — the chat stops applying it on the next turn.',
      inputSchema: {
        type: 'object',
        properties: {
          overlayId: { type: 'string', description: 'Overlay id (e.g. POV-xxxxxxxx)' },
          active: { type: 'boolean', description: 'true = activate, false = deactivate' },
        },
        required: ['overlayId', 'active'],
      },
    },

    // ── Catalog (P3) ─────────────────────────────────────────────────────────
    {
      name: 'flowdesk_admin_list_catalog',
      description: `List the mirrored Altiora service catalog (deduped by service code): code, name, domain, approval, materialization state (cached|stale|never) and per-service usage (sessions/completed/negative).`,
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flowdesk_admin_catalog_providers',
      description: 'Live provider resolution for a catalog service (Altiora ServiceDistribution/detect + our re-ranking) — shows which OrganizationUnitService (ousId) would be chosen.',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Service code (e.g. EO-HR-SA-SS-ISP)' },
          locationPath: { type: 'string', description: "Optional user location path to bias detection" },
        },
        required: ['code'],
      },
    },
    {
      name: 'flowdesk_admin_sync_catalog',
      description: 'Trigger a catalog sync from live Altiora into Qdrant. Returns {fetched, upserted, purged}. purgeStale=true also deletes non-altiora points.',
      inputSchema: {
        type: 'object',
        properties: { purgeStale: { type: 'boolean', description: 'Delete stale (non-altiora) points (default false)' } },
      },
    },
    {
      name: 'flowdesk_admin_catalog_sync_runs',
      description: 'List recent catalog-sync run results (history), newest first.',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max runs (default 50)' } },
      },
    },
    {
      name: 'flowdesk_admin_resolve_intent',
      description: `Intent-resolution diagnostics: given a user phrase, return the chat's candidate services with scores (what the chat would resolve it to). Useful to debug catalog recall. Query must be >= 2 chars.`,
      inputSchema: {
        type: 'object',
        properties: { q: { type: 'string', description: 'A user utterance to resolve (>=2 chars)' } },
        required: ['q'],
      },
    },

    // ── Schemas (P3) ─────────────────────────────────────────────────────────
    {
      name: 'flowdesk_admin_list_schemas',
      description: 'List cached materialized form schemas (SchemaSnapshots) from the registry: ousId, serviceId, title, freshness state (cached|stale), contentHash, approvalRequired.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flowdesk_admin_get_schema',
      description: `Get a cached schema by ousId: the full SchemaSnapshot (slots, phases, conditionality, LOV, options) + a live version/freshness probe. includeSource=true also fetches the raw Altiora SchemaJson for a diff. Use to inspect whether a form is clear/well-structured.`,
      inputSchema: {
        type: 'object',
        properties: {
          ousId: { type: 'number', description: 'OrganizationUnitService id (integer)' },
          includeSource: { type: 'boolean', description: 'Also fetch raw Altiora SchemaJson (default false)' },
        },
        required: ['ousId'],
      },
    },
    {
      name: 'flowdesk_admin_invalidate_schema',
      description: 'Mark a cached schema stale (lazy invalidation) — it re-materializes on next use.',
      inputSchema: {
        type: 'object',
        properties: { ousId: { type: 'number', description: 'OrganizationUnitService id' } },
        required: ['ousId'],
      },
    },
    {
      name: 'flowdesk_admin_schema_enrich',
      description: 'Run the AI enrichment agent (Claude Haiku) on a schema: generate an AI-readable service description + per-field meanings from the service name/category/fields, and PERSIST them — the description is embedded into the intent-resolution vector store (improves free-text/voice service matching) and graph-linked to the schema; field meanings attach to the card. Returns the generated content.',
      inputSchema: {
        type: 'object',
        properties: { ousId: { type: 'number', description: 'OrganizationUnitService id of the cached schema' } },
        required: ['ousId'],
      },
    },
    {
      name: 'flowdesk_admin_schema_enrichment',
      description: 'Get the stored AI enrichment (service description, keywords, per-field meanings) for a service by its service code.',
      inputSchema: {
        type: 'object',
        properties: { serviceId: { type: 'string', description: 'Service code (e.g. EO-HR-BE-TRE-TRE)' } },
        required: ['serviceId'],
      },
    },
    {
      name: 'flowdesk_admin_rematerialize_schema',
      description: 'Re-materialize a schema from live Altiora now (by ousId of a cached schema). Returns the fresh slot count and warnings.',
      inputSchema: {
        type: 'object',
        properties: { ousId: { type: 'number', description: 'OrganizationUnitService id' } },
        required: ['ousId'],
      },
    },

    // ── Sync & Integration (P3) ──────────────────────────────────────────────
    {
      name: 'flowdesk_admin_sync_status',
      description: 'Integration status: schema-sync poller running?, SignalR connected?, session sweeper state + last run, and a read-only snapshot of the FlowDesk env flags.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flowdesk_admin_sync_events',
      description: 'Persisted schema-sync event history (mark_stale / poll_done / signalr_* …), newest first, filterable by event/time.',
      inputSchema: {
        type: 'object',
        properties: {
          event: { type: 'string', description: 'Filter by event name' },
          from: { type: 'string', description: 'ISO from' },
          to: { type: 'string', description: 'ISO to' },
          limit: { type: 'number', description: 'Max rows (default 200, max 1000)' },
        },
      },
    },
    {
      name: 'flowdesk_admin_sync_poll',
      description: 'Trigger one schema version-poll pass now. Returns {checked, stale, errors}.',
      inputSchema: { type: 'object', properties: {} },
    },

    // ── System-prompt graph editor (P6) ──────────────────────────────────────
    {
      name: 'flowdesk_admin_prompt_active',
      description: 'Get the currently ACTIVE chat system prompt (compiled from the active rules-graph version): text, ruleCount, source graph entry/version, appliedAt.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flowdesk_admin_prompt_default_graph',
      description: 'Get the starter rules graph (one rule = one node) for the system-prompt editor — a sensible default encoding identity/domain/routing/dialogue/tone/safety rules.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flowdesk_admin_prompt_list_graphs',
      description: 'List saved system-prompt rules graphs (namespace CHAT_PROMPT) from the versioned graph catalog.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'flowdesk_admin_prompt_get_graph',
      description: 'Load a saved system-prompt rules graph (its nodes/edges) by catalog entryId, optionally a specific version. Use before editing to see the current rules.',
      inputSchema: {
        type: 'object',
        properties: {
          entryId: { type: 'string', description: 'Catalog entry id' },
          version: { type: 'number', description: 'Optional version number (default: latest)' },
        },
        required: ['entryId'],
      },
    },
    {
      name: 'flowdesk_admin_prompt_save_graph',
      description: 'Save a full rules graph as a NEW VERSION (or create a new graph). Persists to the versioned catalog (namespace CHAT_PROMPT). Validate/sandbox first.',
      inputSchema: {
        type: 'object',
        properties: {
          entryId: { type: 'string', description: 'Existing entry to version (omit to create a new graph)' },
          name: { type: 'string', description: 'Graph name' },
          nodes: { type: 'array', items: { type: 'object' }, description: 'Rule nodes' },
          edges: { type: 'array', items: { type: 'object' }, description: 'Edges' },
          changelog: { type: 'string' },
        },
        required: ['nodes'],
      },
    },
    {
      name: 'flowdesk_admin_prompt_mutate_graph',
      description: 'EDIT a rules graph directly: apply add/update/remove mutation ops to an inline graph or a saved {entryId}. With save:true, persists the result as a NEW VERSION and returns it. This is how you edit/save prompt graphs autonomously. Validate/sandbox before saving.',
      inputSchema: {
        type: 'object',
        properties: {
          entryId: { type: 'string', description: 'Saved graph to edit (alternative to graph)' },
          version: { type: 'number', description: 'Base version when using entryId' },
          graph: { type: 'object', description: 'Inline graph { nodes, edges } to edit (alternative to entryId)' },
          mutations: {
            type: 'array',
            description: 'Ops: {op:"add",node:{key,title,category,text,appliesTo}} | {op:"update",key,patch:{...}} | {op:"remove",key}',
            items: { type: 'object' },
          },
          save: { type: 'boolean', description: 'Persist the edited graph as a new version (default false = preview only)' },
          name: { type: 'string', description: 'Graph name when saving a new graph' },
        },
        required: ['mutations'],
      },
    },
    {
      name: 'flowdesk_admin_prompt_compile',
      description: 'Compile a rules graph {nodes,edges} into the system-prompt text (+ per-chat-node scoped text). Does not apply anything.',
      inputSchema: {
        type: 'object',
        properties: {
          graph: { type: 'object', description: 'Rules graph { nodes:[], edges:[] } (ReactFlow shape; node.data has kind/key/title/text/category/appliesTo/enabled)' },
        },
        required: ['graph'],
      },
    },
    {
      name: 'flowdesk_admin_prompt_validate',
      description: 'Validate a rules graph (structure/DAG + rules checks: non-empty text, unique keys, valid categories, identity present). Returns {ok, errors, warnings, stats}. Run BEFORE recommending apply.',
      inputSchema: {
        type: 'object',
        properties: { graph: { type: 'object', description: 'Rules graph { nodes, edges }' } },
        required: ['graph'],
      },
    },
    {
      name: 'flowdesk_admin_prompt_sandbox',
      description: 'Sandbox-test a candidate prompt against real chat turns with ZERO side effects (no Redis/Memgraph writes, no real Altiora tickets). Drives the given user messages and returns the transcript. Use to verify a prompt change before applying.',
      inputSchema: {
        type: 'object',
        properties: {
          graph: { type: 'object', description: 'Candidate rules graph { nodes, edges } (compiled to the prompt under test)' },
          systemPromptText: { type: 'string', description: 'Alternatively, a raw candidate prompt text (skips compile)' },
          messages: { type: 'array', items: { type: 'string' }, description: 'User utterances to drive, in order (max 12)' },
          serviceId: { type: 'string', description: 'Optional service to bias resolution' },
          lang: { type: 'string', description: 'Language (default en)' },
        },
        required: ['messages'],
      },
    },
    {
      name: 'flowdesk_admin_prompt_apply',
      description: 'Apply a rules graph as the ACTIVE chat system prompt (materializes it live for all conversations). Accepts an inline graph, or a catalog {entryId, version} to promote+apply. This changes production chat behavior — validate/sandbox first.',
      inputSchema: {
        type: 'object',
        properties: {
          graph: { type: 'object', description: 'Rules graph to apply { nodes, edges }' },
          entryId: { type: 'string', description: 'Catalog entry id (alternative to graph)' },
          version: { type: 'number', description: 'Catalog version number (with entryId)' },
          label: { type: 'string', description: 'Optional label for this applied prompt' },
        },
      },
    },

    // ── Tickets + LLM + health (P4) ──────────────────────────────────────────
    {
      name: 'flowdesk_admin_list_tickets',
      description: 'List chat submissions (sessions that produced a local SR or a real Altiora ticket), joined to the session. Paged.',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          page: { type: 'number' },
          pageSize: { type: 'number' },
        },
      },
    },
    {
      name: 'flowdesk_admin_get_ticket_live',
      description: 'Fetch the live Altiora ticket (TicketDetailsDto) for a ticketId created by the chat (service-account passthrough, 60s cached).',
      inputSchema: {
        type: 'object',
        properties: { ticketId: { type: 'number', description: 'Altiora ticket id' } },
        required: ['ticketId'],
      },
    },
    {
      name: 'flowdesk_admin_llm_stats',
      description: 'LLM telemetry for chat over a window: per-day cost/tokens/latency, per-model/method breakdown, slowest-turn outliers.',
      inputSchema: {
        type: 'object',
        properties: { days: { type: 'number', description: 'Trailing window in days (default 7, max 90)' } },
      },
    },
    {
      name: 'flowdesk_admin_health',
      description: 'Composite FlowDesk Chat Admin health: Altiora API, Memgraph, Redis, Qdrant reachability + schema-sync/sweeper state + env flags.',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
}

/** Every tool name this module handles (for the index.ts dispatcher / sanity). */
export const FLOWDESK_ADMIN_TOOL_NAMES = getFlowdeskAdminToolDefinitions().map((t) => t.name);

// ── dispatcher ────────────────────────────────────────────────────────────────

export async function handleFlowdeskAdminToolCall(
  name: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  const text = (data: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
  const err = (msg: string) => ({ content: [{ type: 'text', text: `Error: ${msg}` }], isError: true });
  const sid = () => encodeURIComponent(String(args.sessionId));

  try {
    switch (name) {
      // Sessions
      case 'flowdesk_admin_list_sessions':
        return text(await adminGet(`/sessions${qs(args)}`));
      case 'flowdesk_admin_get_session':
        if (!args.sessionId) return err('sessionId is required');
        return text(await adminGet(`/sessions/${sid()}`));
      case 'flowdesk_admin_get_session_turns':
        if (!args.sessionId) return err('sessionId is required');
        return text(await adminGet(`/sessions/${sid()}/turns`));
      case 'flowdesk_admin_session_stats':
        return text(await adminGet(`/sessions/stats${qs({ days: args.days })}`));

      // Quality
      case 'flowdesk_admin_list_negative_sessions':
        return text(await adminGet(`/quality/negative${qs(args)}`));
      case 'flowdesk_admin_quality_meta':
        return text(await adminGet('/quality/meta'));
      case 'flowdesk_admin_triage_session': {
        if (!args.sessionId) return err('sessionId is required');
        const { sessionId, ...body } = args;
        void sessionId;
        return text(await adminSend('PATCH', `/quality/${sid()}`, body));
      }
      case 'flowdesk_admin_create_backlog': {
        if (!args.sessionId) return err('sessionId is required');
        const { sessionId, ...body } = args;
        void sessionId;
        return text(await adminSend('POST', `/quality/${sid()}/backlog`, body));
      }

      // Session-analysis agent + prompt overlays (P5)
      case 'flowdesk_admin_analyze_session':
        if (!args.sessionId) return err('sessionId is required');
        return text(await adminSend('POST', `/sessions/${sid()}/analyze`, { force: args.force === true }));
      case 'flowdesk_admin_list_prompt_overlays':
        return text(await adminGet(`/prompt-overlays${qs(args)}`));
      case 'flowdesk_admin_apply_prompt_overlay':
        if (!args.scope || !args.text) return err('scope and text are required');
        if (args.scope === 'service' && !args.serviceId) return err('serviceId is required for scope=service');
        return text(await adminSend('POST', '/prompt-overlays', args));
      case 'flowdesk_admin_set_prompt_overlay_active':
        if (!args.overlayId) return err('overlayId is required');
        return text(await adminSend('PATCH', `/prompt-overlays/${encodeURIComponent(String(args.overlayId))}`, { active: args.active !== false }));

      // Catalog
      case 'flowdesk_admin_list_catalog':
        return text(await adminGet('/catalog'));
      case 'flowdesk_admin_catalog_providers':
        if (!args.code) return err('code is required');
        return text(await adminGet(`/catalog/${encodeURIComponent(String(args.code))}/providers${qs({ locationPath: args.locationPath })}`));
      case 'flowdesk_admin_sync_catalog':
        return text(await adminSend('POST', '/catalog/sync', { purgeStale: args.purgeStale === true }));
      case 'flowdesk_admin_catalog_sync_runs':
        return text(await adminGet(`/catalog/sync-runs${qs({ limit: args.limit })}`));
      case 'flowdesk_admin_resolve_intent':
        if (!args.q || String(args.q).trim().length < 2) return err('q (>=2 chars) is required');
        return text(await adminGet(`/intent/resolve${qs({ q: args.q })}`));

      // Schemas
      case 'flowdesk_admin_list_schemas':
        return text(await adminGet('/schemas'));
      case 'flowdesk_admin_get_schema':
        if (args.ousId == null) return err('ousId is required');
        return text(await adminGet(`/schemas/${encodeURIComponent(String(args.ousId))}${qs({ includeSource: args.includeSource })}`));
      case 'flowdesk_admin_invalidate_schema':
        if (args.ousId == null) return err('ousId is required');
        return text(await adminSend('POST', `/schemas/${encodeURIComponent(String(args.ousId))}/invalidate`));
      case 'flowdesk_admin_rematerialize_schema':
        if (args.ousId == null) return err('ousId is required');
        return text(await adminSend('POST', `/schemas/${encodeURIComponent(String(args.ousId))}/rematerialize`));
      case 'flowdesk_admin_schema_enrich':
        if (args.ousId == null) return err('ousId is required');
        return text(await adminSend('POST', `/schemas/${encodeURIComponent(String(args.ousId))}/enrich`));
      case 'flowdesk_admin_schema_enrichment':
        if (!args.serviceId) return err('serviceId is required');
        return text(await adminGet(`/schemas/enrichment?serviceId=${encodeURIComponent(String(args.serviceId))}`));

      // Sync
      case 'flowdesk_admin_sync_status':
        return text(await adminGet('/sync/status'));
      case 'flowdesk_admin_sync_events':
        return text(await adminGet(`/sync/events${qs(args)}`));
      case 'flowdesk_admin_sync_poll':
        return text(await adminSend('POST', '/sync/poll'));

      // System-prompt graph editor (P6)
      case 'flowdesk_admin_prompt_active':
        return text(await adminGet('/prompt/active'));
      case 'flowdesk_admin_prompt_default_graph':
        return text(await adminGet('/prompt/default-graph'));
      case 'flowdesk_admin_prompt_list_graphs':
        return text(await adminGet('/prompt/graphs'));
      case 'flowdesk_admin_prompt_get_graph':
        if (!args.entryId) return err('entryId is required');
        return text(await adminGet(`/prompt/graphs/${encodeURIComponent(String(args.entryId))}${args.version != null ? `?version=${args.version}` : ''}`));
      case 'flowdesk_admin_prompt_save_graph':
        if (!Array.isArray(args.nodes)) return err('nodes[] is required');
        return text(await adminSend('POST', '/prompt/graphs', args));
      case 'flowdesk_admin_prompt_mutate_graph':
        if (!Array.isArray(args.mutations)) return err('mutations[] is required');
        if (!args.graph && !args.entryId) return err('graph or entryId is required');
        return text(await adminSend('POST', '/prompt/graphs/mutate', args));
      case 'flowdesk_admin_prompt_compile':
        if (!args.graph) return err('graph is required');
        return text(await adminSend('POST', '/prompt/compile', { graph: args.graph }));
      case 'flowdesk_admin_prompt_validate':
        if (!args.graph) return err('graph is required');
        return text(await adminSend('POST', '/prompt/validate', { graph: args.graph }));
      case 'flowdesk_admin_prompt_sandbox':
        if (!Array.isArray(args.messages) || !args.messages.length) return err('messages[] is required');
        return text(await adminSend('POST', '/prompt/sandbox', args));
      case 'flowdesk_admin_prompt_apply':
        if (!args.graph && !args.entryId) return err('graph or entryId is required');
        return text(await adminSend('POST', '/prompt/apply', args));

      // Tickets + LLM + health
      case 'flowdesk_admin_list_tickets':
        return text(await adminGet(`/tickets${qs(args)}`));
      case 'flowdesk_admin_get_ticket_live':
        if (args.ticketId == null) return err('ticketId is required');
        return text(await adminGet(`/tickets/${encodeURIComponent(String(args.ticketId))}/live`));
      case 'flowdesk_admin_llm_stats':
        return text(await adminGet(`/llm/stats${qs({ days: args.days })}`));
      case 'flowdesk_admin_health':
        return text(await adminGet('/health'));

      default:
        return err(`Unknown FlowDesk admin tool: ${name}`);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(msg);
  }
}

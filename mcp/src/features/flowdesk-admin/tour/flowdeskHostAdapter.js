/**
 * The reference implementation of Host Adapter Protocol v1.0 — for this React SPA.
 *
 * This is the file a second host would write for itself. An ASP.NET MVC application
 * would implement the same five methods with a form post and a full page load; a
 * legacy HTML page would implement three of them and declare the rest unsupported.
 * Nothing above this line changes — that is the entire point of the protocol.
 *
 * The rule this file exists to honour: **the tour never touches our router, our tabs
 * or our DOM.** It says "the Sessions tab", and we decide what that means here.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never guesses at markup. Selecting a row in a
 * list is done by calling a function the LIST ITSELF registered on its anchor, because
 * the list knows what a row is and this adapter does not. Reaching into somebody's
 * table with `querySelector('tr')` would be the selector problem again, one layer down.
 *
 * @module features/flowdesk-admin/tour/flowdeskHostAdapter
 */

import { getSessions, promptGetGraph } from '../api/adminClient';

const ADMIN = '/flowdesk-admin';

/** Tabs this application has, by the name a tour uses. */
const TABS = {
  overview: '', sessions: 'sessions', quality: 'quality', prompt: 'prompt',
  catalog: 'catalog', schemas: 'schemas', sync: 'sync', tickets: 'tickets',
  llm: 'llm', permissions: 'permissions',
};

/** Named routes, so a scenario never contains a URL. */
const ROUTES = {
  'session-detail': (p) => `${ADMIN}/sessions/${encodeURIComponent(p.id)}`,
  'schema-detail': (p) => `${ADMIN}/schemas/${encodeURIComponent(p.ousId)}`,
  'prompt-rule': (p) => `${ADMIN}/prompt?node=${encodeURIComponent(p.nodeId)}`,
};

const ok = (extra = {}) => ({ ok: true, ...extra });
const no = (reason, message, extra = {}) => ({ ok: false, reason, message, ...extra });

/**
 * @param {{navigate:Function, getPath:() => string, registry:object}} deps
 *   `navigate` and `getPath` come from the host's router; `registry` is the tour's own
 *   anchor registry, which is how this adapter reaches a component's declared helpers
 *   without knowing anything about its markup.
 */
export function createFlowdeskHostAdapter(deps) {
  const { navigate, getPath, registry } = deps;

  const anchorMeta = (anchorId) => {
    const r = registry.resolve(anchorId);
    return r.ok ? { element: r.element, meta: r.meta || {} } : null;
  };

  return {
    hostType: 'react-spa',

    capabilities: () => ({
      navigation: {
        routes: true,
        tabs: true,
        // No global modal router here; drawers are how this application shows detail.
        modals: false,
        drawers: true,
        anchors: true,
      },
      query: {
        // Full-text over recorded turns — this is what answers "the session where
        // someone asked about X".
        sessions: true,
        rules: true,
      },
      interact: { select: true, expand: true, focus: true, highlight: true },
      constraints: {
        requiresPageReload: false,
        maxQueryResults: 10,
        asyncNavigationTimeout: 6000,
      },
    }),

    async navigate(intent) {
      const { type, target, params = {} } = intent;

      if (type === 'tab') {
        const seg = TABS[target];
        if (seg === undefined) return no('target_not_found', `There is no “${target}” tab here.`);
        const path = `${ADMIN}${seg ? `/${seg}` : ''}`;
        // Rule 4: already there is a success, not a re-navigation that throws away
        // whatever the user had open.
        if (getPath().startsWith(path) && (seg || getPath() === ADMIN || getPath() === `${ADMIN}/`)) {
          return ok({ alreadyThere: true });
        }
        navigate(path);
        return ok();
      }

      if (type === 'route') {
        const build = ROUTES[target];
        if (!build) return no('target_not_found', `There is no route called “${target}” here.`);
        let path;
        try { path = build(params); } catch (e) { return no('target_not_found', `“${target}” needs different parameters: ${e.message}`); }
        if (getPath() === path) return ok({ alreadyThere: true });
        navigate(path);
        return ok();
      }

      if (type === 'drawer') {
        // The session drawer is a route in this application; another host might open a
        // real drawer. The tour does not need to know which.
        if (target === 'session' && params.id) {
          const path = ROUTES['session-detail']({ id: params.id });
          if (getPath() === path) return ok({ alreadyThere: true });
          navigate(path);
          return ok();
        }
        return no('target_not_found', `There is no “${target}” drawer here.`);
      }

      if (type === 'anchor') {
        const found = anchorMeta(target);
        if (!found) return no('target_not_found', `“${target}” is not on screen.`);
        if (found.element.scrollIntoView) found.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return ok();
      }

      return no('not_supported', `Navigation type “${type}” is not implemented here.`);
    },

    /**
     * Search the application's DATA. No screen changes here — that is `reveal`.
     */
    async query(intent) {
      const { domain, criteria = {}, limit = 10 } = intent;

      if (domain === 'sessions') {
        try {
          const res = await getSessions({
            q: criteria.text || undefined,
            pageSize: limit,
            ...(criteria.filters || {}),
          });
          const items = (res.items || []).map((s) => ({
            id: s.sessionId,
            domain: 'sessions',
            title: `${s.userDisplayName || s.userId || 'unknown user'} · ${s.serviceId || 'no service'}`,
            snippet: `${(s.startedAt || '').slice(0, 16)} · ${s.turns || 0} turns · ${s.outcome || 'in progress'}`,
            // Handed back ready to use, so the caller never assembles one itself.
            revealIntent: { domain: 'sessions', id: s.sessionId, select: true, highlight: true },
          }));
          return { ok: true, items, total: res.total ?? items.length, truncated: (res.total || 0) > items.length };
        } catch (e) {
          return { ok: false, reason: 'query_failed', message: e.message, items: [], total: 0 };
        }
      }

      if (domain === 'rules') {
        try {
          const entryId = import.meta.env?.VITE_AGENT_PROMPT_ENTRY || undefined;
          const g = await promptGetGraph(entryId || (await firstGraphId()));
          const needle = String(criteria.text || '').toLowerCase();
          const items = (g.nodes || [])
            .map((n) => ({ n, text: bodyOf(n) }))
            .filter(({ n, text }) => !needle
              || text.toLowerCase().includes(needle)
              || String(n.title || '').toLowerCase().includes(needle))
            .slice(0, limit)
            .map(({ n, text }) => ({
              id: n.nodeId || n.id,
              domain: 'rules',
              title: n.title || n.nodeId,
              snippet: text.slice(0, 140),
              revealIntent: { domain: 'rules', id: n.nodeId || n.id, select: true },
            }));
          return { ok: true, items, total: items.length, truncated: false };
        } catch (e) {
          return { ok: false, reason: 'query_failed', message: e.message, items: [], total: 0 };
        }
      }

      return { ok: false, reason: 'not_supported', message: `Cannot search ${domain}.`, items: [], total: 0 };
    },

    /**
     * Show a found object. Navigation plus selection — a mutation, by the standard.
     *
     * TOUR-002 — this is the assistant's answer to "where is it?". It used to know
     * two domains and to say nothing about WHERE it had put the thing, so a caller
     * could not tell a successful reveal from a no-op: the tour had to guess which
     * anchor to point at next. It now names the anchor it made visible, and reports
     * `alreadyVisible` rather than navigating on the spot the user is already on.
     */
    async reveal(intent) {
      const { domain, id, highlight } = intent;
      const land = (path, anchorId) => {
        const already = getPath() === path;
        if (!already) navigate(path);
        if (highlight) {
          // Best effort: the element may not be mounted for a frame or two.
          setTimeout(() => { this.interact({ type: 'highlight', anchorId }).catch(() => {}); }, 350);
        }
        return ok({ anchorId, alreadyVisible: already });
      };

      if (!id) return no('target_not_found', 'No id was given to show.');

      if (domain === 'sessions') return land(ROUTES['session-detail']({ id }), 'session.turn.rules');
      if (domain === 'rules') return land(ROUTES['prompt-rule']({ nodeId: id }), 'editor.properties');
      if (domain === 'schemas') return land(ROUTES['schema-detail']({ ousId: id }), 'admin.tab.schemas');
      // A version and a graph are both reached through the editor, which is where
      // their controls live — the selector for one, the history menu for the other.
      if (domain === 'versions') return land(`${ADMIN}/prompt?version=${encodeURIComponent(id)}`, 'editor.save');
      if (domain === 'graphs') return land(`${ADMIN}/prompt?graph=${encodeURIComponent(id)}`, 'editor.graphSelector');

      return no('not_supported', `This application cannot show a “${domain}”.`);
    },

    /**
     * Touch one declared element.
     *
     * `select` calls the component's own `meta.select(index)`. If a list did not
     * declare one, the honest answer is that this application cannot select inside it
     * — not a guess at which DOM node is a row.
     */
    async interact(intent) {
      const { type, anchorId, params = {} } = intent;
      const found = anchorMeta(anchorId);
      if (!found) return no('target_not_found', `“${anchorId}” is not on screen.`);
      const { element, meta } = found;

      if (type === 'select') {
        if (typeof meta.select !== 'function') {
          return no('not_supported',
            `This list has not told the tour how to select inside it.`,
            { fallback: 'Click the row you want and the tour will carry on.' });
        }
        try {
          const r = await meta.select(params.value != null ? params.value : (params.index ?? 0));
          return r === false
            ? no('target_not_found', 'There was nothing to select.')
            : ok({ selected: r });
        } catch (e) {
          return no('unknown', `Selecting failed: ${e.message}`);
        }
      }

      if (type === 'expand') {
        if (typeof meta.expand !== 'function') return no('not_supported', 'This element cannot be expanded by the tour.');
        try { await meta.expand(true); return ok(); } catch (e) { return no('unknown', e.message); }
      }

      if (type === 'focus') {
        if (element.focus) { element.focus({ preventScroll: false }); return ok(); }
        return no('not_supported', 'This element cannot take focus.');
      }

      if (type === 'highlight') {
        // Purely visual and self-reverting — the one interaction with no consequence.
        const prev = element.style ? element.style.outline : null;
        if (element.style) {
          element.style.outline = '2px solid #38bdf8';
          setTimeout(() => { element.style.outline = prev || ''; }, params.duration || 1500);
        }
        return ok();
      }

      return no('not_supported', `Interaction “${type}” is not implemented here.`);
    },
  };
}

const bodyOf = (n) => n.assertion || n.framing || n.register || n.rule || n.usage || n.text || '';

/** The first prompt graph, when no entry id is configured. */
async function firstGraphId() {
  const { promptListGraphs } = await import('../api/adminClient');
  const list = await promptListGraphs();
  const g = (list || [])[0];
  if (!g) throw new Error('no prompt graph is available');
  return g.id || g.entryId;
}

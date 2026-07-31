/**
 * Host Adapter Protocol v1.0 — how a tour ASKS an application to move.
 *
 * The anchor registry answers "is it there?". This answers "put me there" — and it is
 * the second and last place where the tour touches the outside world.
 *
 * WHY A PROTOCOL AND NOT A FEW CALLBACKS.
 *
 * The hosts are not alike. A React SPA changes a route and re-renders; an ASP.NET MVC
 * page posts and reloads; a legacy HTML page may only be able to scroll. If the tour
 * knew any of that, it would work on exactly one of them. So the tour states an
 * INTENT — "the Sessions tab", "the session with this id" — and the host decides how,
 * with its own routing, its own tabs, its own everything.
 *
 * SEVEN RULES, ALL OF THEM PAID FOR ELSEWHERE IN THIS PROJECT:
 *
 *  1. The host declares, the tour asks. No selector, no router, no store ever crosses
 *     this line. The moment it does, the tour is claiming to know somebody else's
 *     markup again — the exact failure the anchor registry exists to prevent.
 *
 *  2. Every action returns an OUTCOME. Never void. "I switched your tab" that silently
 *     did nothing is the same defect this codebase has now shipped six times: the call
 *     was accepted, the field was set, the effect never happened.
 *
 *  3. An action resolves when the target is REALLY ready, not when the call returns.
 *     Routing, lazy mounting and animation all sit between "clicked" and "visible".
 *
 *  4. Idempotent. Asking for a tab that is already open is a no-op success, not a
 *     re-open that throws away what the user typed.
 *
 *  5. Capabilities are discoverable, and absence degrades OUT LOUD: "I can tell you
 *     where it is, but I cannot take you there" beats a button that does nothing.
 *
 *  6. `query` (find the thing in the data) and `reveal` (show the thing on screen) are
 *     different operations. Fusing them makes every host reinvent search inside
 *     navigation.
 *
 *  7. Every action carries a SAFETY CLASS, and the assistant is confined to the
 *     harmless ones. Giving a model hands in an admin screen where "promote to
 *     production" is two clicks away is not a UX decision.
 *
 * @module @guided-ux/tour/core/host-adapter
 */

/**
 * @typedef {'navigation'|'query'|'mutation'} SafetyClass
 *
 * navigation — moves the view. Nothing the user owns changes.
 * query      — reads data. Nothing changes at all.
 * mutation   — changes selection or UI state. NOT available to the assistant.
 */

/**
 * The safety class of every action in the protocol.
 *
 * `reveal` and `interact.select` are mutations even though they look navigational:
 * selecting a row changes what the next thing the user does applies to. The assistant
 * may PROPOSE them as a button; it may not perform them.
 */
const ACTION_SAFETY = {
  'navigate.route': 'navigation',
  'navigate.tab': 'navigation',
  'navigate.modal': 'navigation',
  'navigate.drawer': 'navigation',
  'navigate.anchor': 'navigation',
  'interact.focus': 'navigation',
  'interact.highlight': 'navigation',
  query: 'query',
  reveal: 'mutation',
  'interact.select': 'mutation',
  'interact.expand': 'mutation',
};

/** An action nobody classified is refused. Unknown blast radius is not a default. */
function safetyOf(action) {
  return ACTION_SAFETY[action] || null;
}

const NAV_TYPES = ['route', 'tab', 'modal', 'drawer', 'anchor'];
const INTERACT_TYPES = ['select', 'expand', 'focus', 'highlight'];

/** Capabilities of a host that can do nothing — the honest floor. */
const NO_CAPABILITIES = {
  navigation: { routes: false, tabs: false, modals: false, drawers: false, anchors: false },
  query: {},
  interact: { select: false, expand: false, focus: false, highlight: false },
  constraints: { requiresPageReload: false, maxQueryResults: 0, asyncNavigationTimeout: 0 },
};

/**
 * Check an adapter before it is used. A half-implemented adapter must fail at wiring
 * time, in a developer's face, and not halfway through a user's tour.
 * @returns {{ok:boolean, missing:string[]}}
 */
function checkAdapter(a) {
  const required = ['capabilities', 'navigate', 'query', 'reveal', 'interact'];
  const missing = required.filter((m) => !a || typeof a[m] !== 'function');
  return { ok: missing.length === 0, missing };
}

const fail = (reason, message, extra = {}) => ({ ok: false, reason, message, ...extra });

/**
 * Wrap a host adapter so the protocol's guarantees hold whatever the host does.
 *
 * This is where rules 2, 3, 5 and 7 stop being documentation. A host that throws, or
 * returns undefined, or hangs, still produces a well-formed outcome — because the
 * alternative is a tour that dies inside somebody else's navigation code.
 *
 * @param {object} adapter
 * @param {{timeoutMs?:number, registry?:object, allow?:SafetyClass[], onAction?:Function}} [opts]
 */
function createNavigator(adapter, opts = {}) {
  const { ok, missing } = checkAdapter(adapter);
  if (!ok) throw new TypeError(`host adapter is missing: ${missing.join(', ')}`);

  const timeoutMs = opts.timeoutMs ?? 8000;
  const registry = opts.registry || null;
  // Rule 7. The default is everything, because the TOUR is trusted — it is authored
  // content reviewed by whoever publishes it. The assistant gets a narrowed copy.
  const allow = new Set(opts.allow || ['navigation', 'query', 'mutation']);
  const onAction = opts.onAction || (() => {});

  let caps = null;
  const capabilities = () => {
    if (caps) return caps;
    try {
      const c = adapter.capabilities() || {};
      caps = {
        ...NO_CAPABILITIES, ...c,
        navigation: { ...NO_CAPABILITIES.navigation, ...(c.navigation || {}) },
        query: { ...(c.query || {}) },
        interact: { ...NO_CAPABILITIES.interact, ...(c.interact || {}) },
        constraints: { ...NO_CAPABILITIES.constraints, ...(c.constraints || {}) },
      };
    } catch {
      caps = { ...NO_CAPABILITIES };
    }
    return caps;
  };

  /** Rule 3: a host promise that never settles must not hang the tour. */
  const withTimeout = async (p, ms, what) => {
    let timer = null;
    try {
      return await Promise.race([
        p,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(fail('timeout', `The host did not finish ${what} in ${ms}ms.`)), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  /** Normalise whatever the host returned into an ActionResult. */
  const normalise = (r, what) => {
    if (r === true) return { ok: true };
    if (!r || typeof r !== 'object') {
      // Rule 2, enforced: a host that returns nothing has told us nothing, and
      // "probably worked" is not an outcome we are willing to show a user.
      return fail('unknown', `The host gave no answer for ${what}.`);
    }
    if (typeof r.ok !== 'boolean') return fail('unknown', `The host's answer for ${what} had no outcome.`);
    return r;
  };

  const guard = (action) => {
    const cls = safetyOf(action);
    if (!cls) return fail('not_supported', `"${action}" is not a protocol action.`);
    if (!allow.has(cls)) {
      return fail('not_permitted',
        `This caller may not perform ${cls} actions.`,
        { safetyClass: cls, proposable: cls === 'mutation' });
    }
    return null;
  };

  const run = async (action, what, fn) => {
    const denied = guard(action);
    if (denied) { onAction({ action, result: denied }); return denied; }
    let result;
    try {
      result = normalise(await withTimeout(Promise.resolve().then(fn), timeoutMs, what), what);
    } catch (e) {
      // A host that throws is a host that failed; it is not a reason for the tour to.
      result = fail('unknown', `The host failed while ${what}: ${e.message}`);
    }
    onAction({ action, result });
    return result;
  };

  return {
    capabilities,
    safetyOf,

    /**
     * Move the view. `waitForAnchor` is what makes rule 3 real: the action is not
     * finished when the host says so, it is finished when the thing is on screen.
     * @param {{type:string, target:string, params?:object, waitForAnchor?:string}} intent
     */
    async navigate(intent = {}) {
      const type = intent.type;
      if (!NAV_TYPES.includes(type)) return fail('not_supported', `Unknown navigation type "${type}".`);
      const key = { route: 'routes', tab: 'tabs', modal: 'modals', drawer: 'drawers', anchor: 'anchors' }[type];
      if (!capabilities().navigation[key]) {
        return fail('not_supported',
          `This application cannot ${type === 'tab' ? 'switch tabs' : `open a ${type}`} for you.`,
          { fallback: intent.target ? `Open “${intent.target}” yourself and the tour will carry on.` : undefined });
      }

      const res = await run(`navigate.${type}`, `navigating to ${intent.target}`, () => adapter.navigate(intent));
      if (!res.ok || !intent.waitForAnchor || !registry) return res;

      // Rule 3. The host reported success; that is not the same as the element being
      // there. Wait for the anchor, and say so when it never arrives.
      const anchor = await registry.waitFor(intent.waitForAnchor, { timeoutMs });
      return anchor.ok
        ? { ...res, anchorReady: true }
        : fail('timeout', `The application navigated, but “${intent.waitForAnchor}” did not appear.`, { navigated: true });
    },

    /**
     * Find something in the host's DATA. Never touches the screen — that is `reveal`.
     * @param {{domain:string, criteria:object, limit?:number}} intent
     */
    async query(intent = {}) {
      // A QueryResult always carries `items`, success or not: a caller that has to
      // check two shapes will eventually forget, and `undefined.length` is a crash in
      // the middle of someone's tour.
      const empty = { items: [], total: 0, truncated: false };
      if (!intent.domain) return { ...fail('query_failed', 'A query needs a domain.'), ...empty };
      if (!capabilities().query[intent.domain]) {
        return { ...fail('not_supported', `This application cannot search ${intent.domain}.`), ...empty };
      }
      const max = capabilities().constraints.maxQueryResults || 10;
      const res = await run('query', `searching ${intent.domain}`,
        () => adapter.query({ ...intent, limit: Math.min(intent.limit || max, max) }));
      if (!res.ok) return { ...res, items: [], total: 0 };
      return { items: [], total: 0, truncated: false, ...res };
    },

    /** Show a found object. A mutation: it moves the view AND changes the selection. */
    reveal(intent = {}) {
      return run('reveal', `revealing ${intent.domain}/${intent.id}`, () => adapter.reveal(intent));
    },

    /**
     * Touch one declared element. `select` with no index means the FIRST item — the
     * case the standard calls out by name, and the one a tour uses to show a list
     * without picking anything meaningful out of the user's data.
     */
    interact(intent = {}) {
      const type = intent.type;
      if (!INTERACT_TYPES.includes(type)) return Promise.resolve(fail('not_supported', `Unknown interaction "${type}".`));
      if (!capabilities().interact[type]) {
        return Promise.resolve(fail('not_supported', `This application cannot ${type} for you.`));
      }
      const params = type === 'select' && (!intent.params || intent.params.index == null) && !(intent.params || {}).value
        ? { ...(intent.params || {}), index: 0 }
        : intent.params;
      return run(`interact.${type}`, `${type} on ${intent.anchorId}`, () => adapter.interact({ ...intent, params }));
    },

    /** A navigator confined to a safety class set — what the assistant is handed. */
    restrictedTo(classes) {
      return createNavigator(adapter, { ...opts, allow: classes, registry, timeoutMs });
    },
  };
}

/** A host that can do nothing, stated honestly. Used when no adapter is supplied. */
function nullAdapter() {
  const no = async () => fail('not_supported', 'This application has not enabled tour navigation.');
  return {
    hostType: 'none',
    capabilities: () => ({ ...NO_CAPABILITIES }),
    navigate: no,
    query: async () => ({ ok: false, reason: 'not_supported', items: [], total: 0 }),
    reveal: no,
    interact: no,
  };
}

export {
  createNavigator, checkAdapter, nullAdapter, safetyOf,
  ACTION_SAFETY, NAV_TYPES, INTERACT_TYPES, NO_CAPABILITIES,
};

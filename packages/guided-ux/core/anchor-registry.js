/**
 * The anchor registry — the whole boundary of this system in one file.
 *
 * A tour has to point at things on someone else's screen. The obvious way is a CSS
 * selector in the tour content, and it is the wrong way: the tour then CLAIMS to know
 * the host's markup, and every rename, re-render or conditional branch turns that
 * claim into a confident lie — a spotlight over empty space, or over the wrong
 * control entirely.
 *
 * So the direction is inverted. The HOST declares what exists:
 *
 *   registry.register('prompt-editor.rule-explorer', {
 *     element: () => ref.current,
 *     label: 'Rule explorer',
 *     available: () => activeTab === 'prompt',
 *   })
 *
 * and the tour ASKS. An id that was never registered, or whose `available()` says no,
 * is not an error to be swallowed — it is an answer, and the runner is required to
 * handle it (see tour-runner: a step whose anchor is missing is skipped out loud, with
 * a reason the user can read).
 *
 * The registry never touches the DOM itself. `element()` is the host's function; this
 * file only calls it and reports what came back. That is what lets the same core run
 * in a test with no DOM at all.
 *
 * @module @guided-ux/tour/core/anchor-registry
 */

/**
 * @typedef {object} AnchorDefinition
 * @property {() => any} element   Returns the host element (or null when not mounted).
 * @property {string} [label]      Human name, used when explaining a skipped step.
 * @property {() => boolean} [available]  Extra condition beyond "the element exists".
 * @property {string} [route]      Where the host must be for this anchor to appear.
 * @property {object} [meta]       Anything the host wants to carry along.
 */

/**
 * @typedef {object} AnchorResolution
 * @property {string} id
 * @property {boolean} ok
 * @property {'ready'|'not_registered'|'not_mounted'|'unavailable'|'threw'} status
 * @property {any} [element]
 * @property {string} [label]
 * @property {string} [route]
 * @property {string} [reason]  Sentence explaining a non-ready status.
 */

class AnchorRegistry {
  constructor() {
    /** @type {Map<string, AnchorDefinition>} */
    this._anchors = new Map();
    /** @type {Set<(ids:string[])=>void>} */
    this._listeners = new Set();
  }

  /**
   * Declare an anchor. Returns an unregister function, so a component can hand it
   * straight to a cleanup hook and never leak a stale element.
   * @param {string} id
   * @param {AnchorDefinition} def
   * @returns {() => void}
   */
  register(id, def) {
    if (!id || typeof id !== 'string') throw new TypeError('anchor id must be a non-empty string');
    if (!def || typeof def.element !== 'function') {
      // Deliberately strict: an anchor registered with a live element instead of a
      // getter would capture the FIRST render's node and keep pointing at it after a
      // re-render replaced it — a spotlight on a detached node, which looks like a
      // spotlight on nothing.
      throw new TypeError(`anchor "${id}" must provide element() as a function`);
    }
    this._anchors.set(id, def);
    this._emit();
    return () => this.unregister(id, def);
  }

  /**
   * Remove an anchor. The definition is compared so a late unmount cannot delete the
   * registration a newer mount just made under the same id.
   */
  unregister(id, def) {
    if (def && this._anchors.get(id) !== def) return;
    if (this._anchors.delete(id)) this._emit();
  }

  /** Ids currently declared — not necessarily available. */
  ids() { return [...this._anchors.keys()]; }

  has(id) { return this._anchors.has(id); }

  /**
   * Ask about one anchor. NEVER throws: a host predicate that blows up is itself an
   * answer ("we cannot tell, so treat it as absent"), and a tour that dies because a
   * host's `available()` had a typo would be worse than one that skips a step.
   * @param {string} id
   * @returns {AnchorResolution}
   */
  resolve(id) {
    const def = this._anchors.get(id);
    if (!def) {
      return {
        id, ok: false, status: 'not_registered',
        reason: 'This part of the interface has not been declared to the tour.',
      };
    }
    let element = null;
    try {
      element = def.element();
    } catch (e) {
      return { id, ok: false, status: 'threw', label: def.label, reason: `The host could not produce this element: ${e.message}` };
    }
    if (!element) {
      return {
        id, ok: false, status: 'not_mounted', label: def.label, route: def.route,
        reason: def.route
          ? `“${def.label || id}” is not on screen — it lives on ${def.route}.`
          : `“${def.label || id}” is not on screen right now.`,
      };
    }
    if (typeof def.available === 'function') {
      let ok = false;
      try { ok = !!def.available(); } catch (e) {
        return { id, ok: false, status: 'threw', label: def.label, reason: `The host could not say whether this is available: ${e.message}` };
      }
      if (!ok) {
        return {
          id, ok: false, status: 'unavailable', label: def.label, route: def.route,
          reason: `“${def.label || id}” exists but is not usable right now.`,
        };
      }
    }
    // `meta` carries whatever the host attached — including, for a list, the
    // component's OWN way of selecting inside itself. The tour must not work that out
    // from the DOM: the component knows, and the protocol asks it.
    return { id, ok: true, status: 'ready', element, label: def.label, route: def.route, meta: def.meta };
  }

  /** Subscribe to registration changes (a step waiting on a late-mounting anchor). */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /**
   * Wait for an anchor to become ready, up to `timeoutMs`.
   *
   * Lazy rendering, route changes and animations mean "not there yet" is the normal
   * case, not the exceptional one — resolving immediately would make every tour a race
   * it usually loses. Resolves with the final resolution either way; the caller
   * decides what a timeout means.
   *
   * @param {string} id
   * @param {{timeoutMs?:number, pollMs?:number, setTimeout?:Function, clearTimeout?:Function}} [opts]
   * @returns {Promise<AnchorResolution>}
   */
  waitFor(id, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 4000;
    const pollMs = opts.pollMs ?? 120;
    const setT = opts.setTimeout || setTimeout;
    const clearT = opts.clearTimeout || clearTimeout;

    const first = this.resolve(id);
    if (first.ok || timeoutMs <= 0) return Promise.resolve(first);

    return new Promise((resolve) => {
      let done = false;
      let pollTimer = null;
      let deadlineTimer = null;
      let unsub = () => {};

      const finish = (res) => {
        if (done) return;
        done = true;
        if (pollTimer) clearT(pollTimer);
        if (deadlineTimer) clearT(deadlineTimer);
        unsub();
        resolve(res);
      };

      // Two independent signals, because neither alone is enough: a registration event
      // catches a component that mounts, polling catches an element that appears
      // without one (a route transition, an animation finishing).
      unsub = this.subscribe(() => {
        const r = this.resolve(id);
        if (r.ok) finish(r);
      });

      const tick = () => {
        if (done) return;
        const r = this.resolve(id);
        if (r.ok) finish(r);
        else pollTimer = setT(tick, pollMs);
      };

      deadlineTimer = setT(() => finish(this.resolve(id)), timeoutMs);
      pollTimer = setT(tick, pollMs);
    });
  }

  clear() {
    this._anchors.clear();
    this._emit();
  }

  _emit() {
    const ids = this.ids();
    for (const fn of this._listeners) {
      try { fn(ids); } catch { /* a listener must not break a registration */ }
    }
  }
}

export { AnchorRegistry };

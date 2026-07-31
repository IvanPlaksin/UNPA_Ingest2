/**
 * The tour runner — walks a scenario, one step at a time, and never asserts anything
 * about the host's screen that it has not just checked.
 *
 * WHAT MAKES THIS DIFFERENT FROM A LIST OF STEPS.
 *
 * A scenario is a graph, not an array: each step names its successors, and a step can
 * branch on what the host reports. The runner resolves the NEXT step at the moment it
 * is needed, against the registry as it is right then — because between authoring the
 * scenario and running it, the screen has changed, the user has navigated, and half
 * the interface may not exist.
 *
 * A step whose anchor is missing is therefore an ordinary outcome, not a crash:
 *
 *   - if the step is `optional`, the runner skips to the successor and says why;
 *   - if it is required, the runner stops on that step and reports the reason, so the
 *     panel can offer "take me there" or "skip" rather than pointing at nothing.
 *
 * That is the whole design principle, stated once: THE TOUR DOES NOT KNOW WHAT IS ON
 * SCREEN — IT ASKS, AND IT SAYS WHAT IT WAS TOLD.
 *
 * The runner is deliberately free of DOM, React, timers-by-default and I/O. It takes a
 * scenario and a registry; everything visual belongs to whoever renders `state`.
 *
 * @module @guided-ux/tour/core/tour-runner
 */

import { validateScenario } from './scenario.js';

/** @typedef {import('./anchor-registry').AnchorRegistry} AnchorRegistry */

/**
 * @typedef {object} RunnerState
 * @property {'idle'|'running'|'blocked'|'paused'|'finished'} status
 * @property {import('./scenario').TourStep|null} step
 * @property {import('./anchor-registry').AnchorResolution|null} anchor
 * @property {number} index      1-based position among reachable steps, for "3 of 7".
 * @property {number} total
 * @property {string|null} notice  Why a step was skipped or is blocked.
 * @property {string[]} visited
 */

const EMPTY = {
  status: 'idle', step: null, anchor: null, index: 0, total: 0, notice: null, visited: [],
  // Set when the host was asked to navigate and refused, so the panel can say what
  // the user should do by hand.
  navigation: null,
  // True while the step is on screen but its anchor has not been found yet — the
  // spotlight is still coming. The panel is fully usable meanwhile.
  resolving: false,
};

class TourRunner {
  /**
   * @param {{scenario:object, registry:AnchorRegistry, lang?:string,
   *          waitMs?:number, onState?:(s:RunnerState)=>void, now?:()=>number}} p
   */
  constructor(p) {
    const { errors } = validateScenario(p.scenario);
    if (errors.length) {
      // Refusing a malformed scenario here is the cheap failure. The expensive one is
      // a tour that starts confidently and dead-ends on step four.
      throw new Error(`invalid scenario: ${errors.map((e) => e.message).join('; ')}`);
    }
    this.scenario = p.scenario;
    this.registry = p.registry;
    this.lang = p.lang || 'en';
    this.waitMs = p.waitMs ?? 4000;
    // Host Adapter Protocol v1.0 — optional. Without it the tour still runs; it just
    // asks the user to move instead of moving them.
    this.navigator = p.navigator || null;
    this.onState = p.onState || (() => {});
    this._now = p.now || (() => Date.now());

    this._byId = new Map(this.scenario.steps.map((s) => [s.id, s]));
    this._state = { ...EMPTY, total: this.scenario.steps.length };
    /** Steps entered, in order — the honest record of what the user was actually shown. */
    this._visited = [];
    this._startedAt = null;
    /** Monotonic entry counter: a background resolution that lost the race is dropped. */
    this._entry = 0;
    this._pending = null;
  }

  get state() { return this._state; }

  /** Text for a step in the running language, falling back to English then to any. */
  text(step, field = 'text') {
    const c = (step && step.content) || {};
    const byLang = c[field];
    if (typeof byLang === 'string') return byLang;
    if (!byLang || typeof byLang !== 'object') return '';
    return byLang[this.lang] || byLang.en || Object.values(byLang)[0] || '';
  }

  async start() {
    this._visited = [];
    this._startedAt = this._now();
    return this._enter(this.scenario.entry || this.scenario.steps[0].id, null);
  }

  /** Advance past the current step, following its `next`. */
  async next() {
    const cur = this._state.step;
    if (!cur) return this._state;
    const target = this._resolveNext(cur);
    if (!target) return this._finish();
    return this._enter(target, null);
  }

  /** Go back to the previously VISITED step — not to the authored predecessor.
   *  With branching those are different, and the user means "undo what I just saw". */
  async back() {
    if (this._visited.length < 2) return this._state;
    this._visited.pop();
    const prev = this._visited.pop();
    return this._enter(prev, null);
  }

  /** Jump to a named step (a panel's step list, or a deep link into the tour). */
  async goTo(stepId) {
    if (!this._byId.has(stepId)) return this._state;
    return this._enter(stepId, null);
  }

  /**
   * Pause — for the assistant taking over, or the user stepping away.
   * The step is kept, so resuming does not restart anything.
   */
  pause(reason) {
    if (this._state.status === 'finished') return this._state;
    return this._set({ status: 'paused', notice: reason || null });
  }

  resume() {
    if (this._state.status !== 'paused') return this._state;
    return this._set({ status: this._state.anchor && this._state.anchor.ok ? 'running' : 'blocked' });
  }

  stop() {
    return this._set({ status: 'finished', step: null, anchor: null, notice: null });
  }

  /** What the caller should record when the tour ends — plain data, no analytics here. */
  summary() {
    return {
      scenarioId: this.scenario.id,
      visited: [...this._visited],
      completed: this._state.status === 'finished',
      startedAt: this._startedAt,
      endedAt: this._now(),
    };
  }

  // ── internals ───────────────────────────────────────────────────────────────

  /**
   * Enter a step and show it IMMEDIATELY.
   *
   * This used to await the anchor before rendering anything, and that was wrong twice
   * over. A step whose element is on another route waited the full timeout — four
   * seconds of a dead "Next" button, which reads as a broken tour, and the user clicks
   * again into the gap. And the narration could not start until the wait was over, so
   * the first step of a tour was silent for as long as its anchor took to appear.
   *
   * Now the text is on screen on the same tick. The anchor is resolved in the
   * background, and the spotlight lands when the element does — or the step turns out
   * to be blocked and says so, a moment later. Nothing about the user's sense of
   * "the button responded" depends on the DOM cooperating.
   */
  _enter(stepId, carriedNotice) {
    const step = this._byId.get(stepId);
    if (!step) return this._finish();

    this._visited.push(step.id);
    const seq = ++this._entry;

    // Position in the SCENARIO, not the number of steps looked at. Counting visits
    // gave "STEP 15 OF 12" the moment anyone pressed Back — the count only ever grew.
    const index = this._indexOf(step.id);

    const shown = this._set({
      status: 'running', step, anchor: null, index,
      notice: carriedNotice || null,
      // A narration step is complete as it stands; an anchored one is still looking.
      resolving: !!step.anchorId,
    });
    if (!step.anchorId) return shown;

    // Already there? Then skip the await entirely — the common case, and the one that
    // must not cost even a microtask of flicker.
    const now = this.registry.resolve(step.anchorId);
    if (now.ok) {
      return this._set({ status: 'running', step, anchor: now, index, notice: carriedNotice || null, resolving: false });
    }

    // Not yet. If the step says where it lives and the host can get us there, ASK —
    // this is the difference between "the tour tells you to click the Sessions tab"
    // and "the tour opens it". The request goes through the protocol, never through
    // the host's router, and its failure is an ordinary outcome that the panel shows.
    this._pending = this._maybeNavigate(step)
      .then(() => this.registry.waitFor(step.anchorId, { timeoutMs: this.waitMs }))
      .then((anchor) => {
        // The user moved on while we were waiting; that step's outcome is no longer
        // this tour's business.
        if (seq !== this._entry) return this._state;
        if (anchor.ok) {
          return this._set({ status: 'running', step, anchor, index, notice: carriedNotice || null, resolving: false });
        }
        // Optional steps step aside and SAY SO — silently skipping would leave the
        // user with a numbered tour that quietly loses steps.
        if (step.optional) {
          const target = this._resolveNext(step);
          const notice = `Skipped “${this.text(step, 'title') || step.id}”: ${anchor.reason}`;
          if (!target) return this._finish(notice);
          return this._enter(target, notice);
        }
        return this._set({ status: 'blocked', step, anchor, index, notice: anchor.reason, resolving: false });
      });

    return shown;
  }

  /**
   * Ask the host to go where this step lives, if the step says so and the host can.
   *
   * Never throws and never blocks the step from being shown: navigation is an
   * improvement on waiting, not a precondition for it. A refusal is recorded on the
   * state so the panel can say "open the Sessions tab yourself and I will carry on"
   * instead of pointing at nothing in silence.
   */
  async _maybeNavigate(step) {
    if (!this.navigator || !step.navigate) return null;
    try {
      const res = await this.navigator.navigate({ ...step.navigate, waitForAnchor: step.anchorId });
      if (!res.ok) {
        this._set({ navigation: { ok: false, message: res.message, fallback: res.fallback, reason: res.reason } });
      } else {
        this._set({ navigation: null });
      }
      return res;
    } catch {
      return null;
    }
  }

  /** 1-based position of a step in the authored order. */
  _indexOf(stepId) {
    const i = this.scenario.steps.findIndex((s) => s.id === stepId);
    return i < 0 ? 0 : i + 1;
  }

  /** Test seam: await whatever background resolution is in flight. */
  settled() { return this._pending || Promise.resolve(this._state); }

  /**
   * Which step comes next. `next` may be a plain id or a list of guarded branches;
   * a guard is evaluated against the registry, never against the DOM directly.
   */
  _resolveNext(step) {
    const n = step.next;
    if (!n) return null;
    if (typeof n === 'string') return n;
    if (!Array.isArray(n)) return null;
    for (const branch of n) {
      if (!branch || !branch.to) continue;
      if (!branch.when) return branch.to;                    // unguarded = default
      if (branch.when.anchorAvailable) {
        const r = this.registry.resolve(branch.when.anchorAvailable);
        if (r.ok) return branch.to;
      }
      if (branch.when.anchorMissing) {
        const r = this.registry.resolve(branch.when.anchorMissing);
        if (!r.ok) return branch.to;
      }
    }
    return null;
  }

  _finish(notice) {
    return this._set({ status: 'finished', step: null, anchor: null, notice: notice || null });
  }

  _set(patch) {
    this._state = { ...this._state, ...patch, visited: [...this._visited] };
    try { this.onState(this._state); } catch { /* a renderer must not break the run */ }
    return this._state;
  }
}

export { TourRunner };

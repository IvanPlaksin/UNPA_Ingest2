/**
 * React bindings — the thin part.
 *
 * NO JSX, ON PURPOSE. Everything here is `React.createElement`, so the package ships
 * as plain CommonJS with no build step, no bundler config and no transform for the
 * host to arrange. A tour meant to drop into somebody else's site should not begin by
 * asking them to change their build.
 *
 * NO CSS FILE, for the same reason. Styles are inline objects: nothing to import,
 * nothing to load in the right order, and nothing that can lose a specificity fight
 * with the host's stylesheet. The one thing that does need to win — sitting above the
 * host's own layers — is handled by an explicit z-index the host can raise.
 *
 * What lives here: registration (`useTourAnchor`), the shared runner (`TourProvider`),
 * and three pieces of chrome (spotlight, panel, assistant). What does not: any
 * knowledge of the host's markup, any speech vendor, any store.
 *
 * @module @guided-ux/tour/react/context
 */

import React from 'react';
import { AnchorRegistry, TourRunner, createNavigator, nullAdapter } from '../core/index.js';

const h = React.createElement;
const { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } = React;

const TourContext = React.createContext(null);

const Z = 2147483000; // above anything a host is likely to have chosen

// ── colours kept in one place so a host can restyle by passing `theme` ──────────
const THEME = {
  panelBg: '#0f172a',
  panelFg: '#e2e8f0',
  muted: '#94a3b8',
  accent: '#38bdf8',
  warn: '#fbbf24',
  ring: '#38bdf8',
  backdrop: 'rgba(8, 12, 24, 0.62)',
};

/**
 * Provider — owns the registry, the runner and (optionally) the narrator.
 *
 * The REGISTRY is created here and lives as long as the app, because anchors register
 * as components mount, long before any tour starts. The RUNNER is created per tour.
 *
 * @param {{children:any, provider:object, narrator?:object, lang?:string,
 *          theme?:object, onEvent?:(e:object)=>void, waitMs?:number}} props
 */
function TourProvider(props) {
  const registryRef = useRef(null);
  if (!registryRef.current) registryRef.current = new AnchorRegistry();

  const [state, setState] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [error, setError] = useState(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const runnerRef = useRef(null);
  const lang = props.lang || 'en';
  const theme = useMemo(() => ({ ...THEME, ...(props.theme || {}) }), [props.theme]);
  const emit = props.onEvent || (() => {});

  /**
   * Whether narration is on, AS REACT STATE.
   *
   * It used to be read straight off the narrator object. Clicking the speaker mutated
   * that object and nothing re-rendered: the button kept its old icon and looked
   * broken — which it was, from where the user sat. Anything the interface draws has
   * to live somewhere React watches.
   */
  const [narrating, setNarrating] = useState(!!(props.narrator && props.narrator.enabled));

  /**
   * Host Adapter Protocol v1.0 — the bridge that lets the tour MOVE the application
   * rather than only describe it.
   *
   * Two navigators from one adapter: the tour gets all three safety classes, because
   * a scenario is reviewed content; the assistant gets a narrowed copy, because it is
   * a model acting on a sentence somebody typed. Narrowing here rather than at the
   * call site means a forbidden action never even reaches the host.
   */
  const navigator = useMemo(() => {
    const adapter = props.adapter
      || (typeof props.makeAdapter === 'function' ? props.makeAdapter(registryRef.current) : null)
      || nullAdapter();
    try {
      return createNavigator(adapter, { registry: registryRef.current, onAction: (e) => emit({ type: 'host_action', ...e }) });
    } catch (e) {
      // A malformed adapter must not take the tour down: it degrades to "this
      // application cannot navigate", which the panel says out loud.
      emit({ type: 'adapter_invalid', message: e.message });
      return createNavigator(nullAdapter(), { registry: registryRef.current });
    }
  }, [props.adapter, props.makeAdapter]); // eslint-disable-line react-hooks/exhaustive-deps

  const assistantNavigator = useMemo(
    () => navigator.restrictedTo(props.assistantAllows || ['navigation', 'query']),
    [navigator, props.assistantAllows],
  );

  const setNarrating2 = useCallback((on) => {
    const n = props.narrator;
    if (!n) return;
    n.setEnabled(on);
    setNarrating(!!on);
    // Turning it on mid-tour should speak the step you are looking at, not wait for
    // the next one — otherwise the button appears to do nothing until you click Next.
    const run = runnerRef.current;
    if (on && run && run.state && run.state.step) n.speak(run.text(run.state.step));
  }, [props.narrator]);

  const narrate = useCallback((runState, run) => {
    const n = props.narrator;
    if (!n || !runState || !runState.step) return;
    n.speak(run.text(runState.step));
    // The next step's audio is fetched while this one is being read — the measured
    // 0.5–1.3s start delay would otherwise sit between the click and any sound.
    const nextId = typeof runState.step.next === 'string'
      ? runState.step.next
      : (Array.isArray(runState.step.next) && runState.step.next[0] ? runState.step.next[0].to : null);
    const nextStep = nextId && (run.scenario.steps || []).find((s) => s.id === nextId);
    if (nextStep) n.prefetch(run.text(nextStep));
  }, [props.narrator]);

  const start = useCallback(async (scenarioId) => {
    setError(null);
    let sc;
    try {
      sc = await props.provider.getScenario(scenarioId, { lang });
    } catch (e) {
      // Loud, because there is nothing to show: an empty tour on screen would be worse.
      setError(`This tour could not be loaded: ${e.message}`);
      emit({ type: 'tour_load_failed', scenarioId, message: e.message });
      return null;
    }
    let run;
    try {
      run = new TourRunner({
        scenario: sc, registry: registryRef.current, lang,
        waitMs: props.waitMs,
        navigator,
        onState: (s) => setState(s),
      });
    } catch (e) {
      setError(`This tour is not usable: ${e.message}`);
      emit({ type: 'tour_invalid', scenarioId, message: e.message });
      return null;
    }
    runnerRef.current = run;
    setScenario(sc);
    const s = await run.start();
    emit({ type: 'tour_started', scenarioId });
    narrate(s, run);
    return s;
  }, [props.provider, lang, props.waitMs, narrate, emit, navigator]);

  const advance = useCallback(async (fn) => {
    const run = runnerRef.current;
    if (!run) return null;
    const s = await fn(run);
    narrate(s, run);
    return s;
  }, [narrate]);

  const stop = useCallback(() => {
    const run = runnerRef.current;
    if (!run) return;
    if (props.narrator) props.narrator.stop();
    const summary = run.summary();
    run.stop();
    runnerRef.current = null;
    setScenario(null);
    setState(null);
    setAssistantOpen(false);
    emit({ type: 'tour_ended', ...summary });
  }, [props.narrator, emit]);

  /** Opening the assistant PAUSES and SILENCES the tour. Talking over a question
   *  is the rudest thing this system could do. */
  const openAssistant = useCallback(() => {
    const run = runnerRef.current;
    // stop() halts the sound but leaves narration ENABLED: the user has not asked to
    // mute the tour, only to interrupt it, and it resumes speaking on the next step.
    if (props.narrator) props.narrator.stop();
    if (run) run.pause('you asked a question');
    setAssistantOpen(true);
    emit({ type: 'assistant_opened', stepId: run && run.state.step ? run.state.step.id : null });
  }, [props.narrator, emit]);

  /** Resuming is always an explicit act — never automatic after an answer. */
  const closeAssistant = useCallback(() => {
    const run = runnerRef.current;
    setAssistantOpen(false);
    if (run) run.resume();
  }, []);

  const value = useMemo(() => ({
    registry: registryRef.current,
    provider: props.provider,
    narrator: props.narrator || null,
    lang, theme, error, scenario, state, assistantOpen,
    // Watched by React, so the speaker button reflects reality.
    narrating,
    setNarrating: setNarrating2,
    // The full bridge for the tour, and the narrowed one for the assistant.
    navigator,
    assistantNavigator,
    runner: () => runnerRef.current,
    text: (step, field) => (runnerRef.current ? runnerRef.current.text(step, field) : ''),
    start,
    next: () => advance((r) => r.next()),
    back: () => advance((r) => r.back()),
    goTo: (id) => advance((r) => r.goTo(id)),
    stop,
    openAssistant,
    closeAssistant,
    dismissError: () => setError(null),
  }), [props.provider, props.narrator, lang, theme, error, scenario, state, assistantOpen,
    narrating, setNarrating2, navigator, assistantNavigator,
    start, advance, stop, openAssistant, closeAssistant]);

  return h(TourContext.Provider, { value }, props.children);
}

function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}

/** Safe variant for hosts that render a component both inside and outside a tour. */
function useTourOptional() { return useContext(TourContext); }

/**
 * Declare a part of the interface to the tour.
 *
 * The host says what exists; the tour asks. Returns a ref to attach. `available` is
 * optional and defaults to "the element is mounted" — which is the truthful default,
 * because a mounted element is exactly what a spotlight can point at.
 *
 * @param {string} id
 * @param {{label?:string, available?:()=>boolean, route?:string, meta?:object}} [opts]
 */
function useTourAnchor(id, opts = {}) {
  const ctx = useContext(TourContext);
  const ref = useRef(null);
  // Kept in a ref so a changing predicate does not re-register on every render.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!ctx || !id) return undefined;
    return ctx.registry.register(id, {
      element: () => ref.current,
      get label() { return optsRef.current.label; },
      available: () => (typeof optsRef.current.available === 'function' ? optsRef.current.available() : true),
      get route() { return optsRef.current.route; },
      get meta() { return optsRef.current.meta; },
    });
  }, [ctx, id]);

  return ref;
}

export { TourContext, TourProvider, useTour, useTourOptional, useTourAnchor, THEME, Z, h };

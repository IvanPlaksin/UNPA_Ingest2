/**
 * The assistant — a question asked in the middle of a tour, answered from the same
 * knowledge the tour is built from.
 *
 * THREE RULES, AND THEY ARE THE COMPONENT.
 *
 * 1. Opening it SILENCES the tour. Narration stops mid-sentence and the tour pauses;
 *    talking over someone asking a question is the rudest thing this system could do.
 *    Resuming is an explicit click, never automatic after an answer.
 *
 * 2. It says WHERE the answer came from, and it says when it could not look. A static
 *    provider cannot search beyond the tour's own words; an assistant that answers
 *    confidently anyway is the failure this package keeps refusing to ship. So the
 *    capability is on screen, not buried.
 *
 * 3. A hit that corresponds to a step becomes an OFFER TO GO THERE. The user asked
 *    because they want to be somewhere; the best answer is often to take them.
 *
 * The host supplies `ask`. Without one the assistant still works — it retrieves and
 * shows what it found, plainly labelled as passages rather than an answer. That is a
 * worse experience and an honest one, and it means the package needs no model to run.
 *
 * @module @guided-ux/tour/react/TourAssistant
 */

import React from 'react';
import { useTour } from './context.js';

const h = React.createElement;
const { useCallback, useEffect, useRef, useState } = React;

/** Browser speech recognition, when the browser has it. Absence is not an error. */
function getRecognizer() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function TourAssistant(props) {
  const t = useTour();
  const { theme, provider, narrator, lang, state, assistantOpen } = t;
  const ask = props.ask || (t.assistant && t.assistant.ask) || null;

  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);   // {text, hits[], spoken}
  const [listening, setListening] = useState(false);
  /** Objects the HOST found — real records, offered as somewhere to go. */
  const [hostHits, setHostHits] = useState([]);
  const recogRef = useRef(null);
  const caps = provider && provider.capabilities ? provider.capabilities() : { vectorSearch: false };

  useEffect(() => {
    if (!assistantOpen) { setAnswer(null); setQuestion(''); setHostHits([]); }
  }, [assistantOpen]);

  /**
   * Ask the HOST for objects matching the question — "the session where someone
   * asked about vacation", "the rule about escalation".
   *
   * Runs through the RESTRICTED navigator (Host Adapter Protocol v1.0, rule 7): the
   * assistant may look, and may move the view, but may not select or reveal on its
   * own. Anything found is offered as a button for the user to press.
   *
   * Every declared domain is asked, rather than guessing from the wording which one
   * the user meant. Two extra requests are cheaper than confidently searching the
   * wrong thing and reporting nothing found.
   */
  const askHost = useCallback(async (q) => {
    const nav = t.assistantNavigator;
    if (!nav) return [];
    const caps = nav.capabilities();
    const domains = Object.keys(caps.query || {}).filter((d) => caps.query[d]);
    if (!domains.length) return [];
    const results = await Promise.all(domains.map((domain) =>
      nav.query({ domain, criteria: { text: q }, limit: 3 }).catch(() => ({ items: [] }))));
    return results.flatMap((r) => (r.items || []).map((it) => ({ ...it, _host: true })));
  }, [t.assistantNavigator]);

  const submit = useCallback(async (raw) => {
    const q = String(raw ?? question).trim();
    if (!q || busy) return;
    setBusy(true);
    setAnswer(null);
    try {
      const stepId = state && state.step ? state.step.id : null;
      const scenarioId = t.scenario ? t.scenario.id : null;
      const [hits, found] = await Promise.all([
        provider.search(q, { lang, limit: 5, scenarioId }),
        askHost(q),
      ]);
      setHostHits(found);

      let text = null;
      if (ask) {
        const r = await ask({
          question: q, hits, lang,
          // The step being looked at IS the context: the same question means different
          // things on different steps.
          step: state && state.step ? { id: stepId, text: t.text(state.step) } : null,
          scenarioId,
        });
        text = typeof r === 'string' ? r : (r && r.answer) || null;
      }
      setAnswer({ text, hits, asked: q });
      if (text && narrator && narrator.enabled) narrator.speak(text);
    } catch (e) {
      setAnswer({ text: null, hits: [], error: e.message, asked: q });
    } finally {
      setBusy(false);
    }
  }, [question, busy, provider, ask, lang, state, t, narrator, askHost]);

  const toggleVoice = useCallback(() => {
    if (listening) {
      if (recogRef.current) { try { recogRef.current.stop(); } catch { /* ignore */ } }
      setListening(false);
      return;
    }
    const r = getRecognizer();
    if (!r) { setAnswer({ text: null, hits: [], error: 'This browser cannot listen; type the question instead.' }); return; }
    recogRef.current = r;
    r.lang = ({ en: 'en-US', ru: 'ru-RU', fr: 'fr-FR', es: 'es-ES', ar: 'ar-SA', zh: 'zh-CN' })[lang] || 'en-US';
    r.interimResults = false;
    r.maxAlternatives = 1;
    r.onresult = (e) => {
      const said = e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : '';
      setQuestion(said);
      setListening(false);
      if (said) submit(said);       // spoken questions do not need a second click
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    try { r.start(); setListening(true); } catch { setListening(false); }
  }, [listening, lang, submit]);

  if (!assistantOpen) return null;

  const box = {
    position: 'fixed', right: 24, bottom: 24, width: 380, maxWidth: 'calc(100vw - 48px)',
    maxHeight: '70vh', overflow: 'auto',
    background: theme.panelBg, color: theme.panelFg, borderRadius: 12, padding: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)', zIndex: 2147483004,
    fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
  };
  const button = (kind) => ({
    border: `1px solid ${kind === 'primary' ? theme.accent : '#334155'}`,
    background: kind === 'primary' ? theme.accent : 'transparent',
    color: kind === 'primary' ? '#06283d' : theme.panelFg,
    borderRadius: 6, padding: '6px 12px', fontSize: 13, cursor: 'pointer',
  });

  return h('div', { style: box },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      h('strong', { style: { fontSize: 13 } }, 'Ask about this tour'),
      h('span', { style: { flex: 1 } }),
      h('button', { style: { ...button(), padding: '2px 8px' }, onClick: t.closeAssistant }, '×'),
    ),

    state && state.step
      ? h('div', { style: { fontSize: 11, color: theme.muted, marginBottom: 8 } },
        `The tour is paused on: ${t.text(state.step, 'title') || state.step.id}`)
      : null,

    h('div', { style: { display: 'flex', gap: 6 } },
      h('input', {
        value: question, autoFocus: true, placeholder: 'What does this do?',
        onChange: (e) => setQuestion(e.target.value),
        onKeyDown: (e) => { if (e.key === 'Enter') submit(); },
        style: {
          flex: 1, background: '#1e293b', color: theme.panelFg, border: '1px solid #334155',
          borderRadius: 6, padding: '7px 9px', fontSize: 13, outline: 'none',
        },
      }),
      h('button', {
        style: { ...button(), background: listening ? '#7f1d1d' : 'transparent' },
        onClick: toggleVoice, title: listening ? 'Stop listening' : 'Ask out loud',
      }, listening ? '● …' : '🎙'),
      h('button', { style: button('primary'), onClick: () => submit(), disabled: busy }, busy ? '…' : 'Ask'),
    ),

    // The limitation is stated up front, where it changes what the user expects.
    !caps.vectorSearch ? h('div', { style: { fontSize: 11, color: theme.muted, marginTop: 6 } },
      caps.note || 'This tour can only search its own steps.') : null,

    answer ? h('div', { style: { marginTop: 12 } },
      answer.error
        ? h('div', { style: { fontSize: 12, color: theme.warn } }, answer.error)
        : null,
      answer.text
        ? h('div', { style: { fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' } }, answer.text)
        : (!answer.error && !answer.hits.length
          // Not knowing is a real answer, and a better one than a plausible invention.
          ? h('div', { style: { fontSize: 13, color: theme.muted } },
            'Nothing in this tour covers that. Try the words you saw on screen.')
          : null),

      // Found in the APPLICATION, not in the tour text. Revealing is a mutation, so
      // the assistant proposes it and the USER presses the button — the standard's
      // rule 7, made visible rather than argued about.
      hostHits.length ? h('div', { style: { marginTop: 10 } },
        h('div', { style: { fontSize: 11, color: theme.muted, marginBottom: 4 } }, 'Found in this application'),
        hostHits.map((hit) => h('div', {
          key: `${hit.domain}:${hit.id}`,
          style: { padding: '6px 8px', background: '#0b3a4a', borderRadius: 6, marginBottom: 4, fontSize: 12 },
        },
        h('div', { style: { color: theme.panelFg, fontWeight: 600 } }, hit.title),
        hit.snippet ? h('div', { style: { color: theme.muted, fontSize: 11 } }, hit.snippet) : null,
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
          h('span', { style: { fontSize: 10, color: theme.muted } }, hit.domain),
          h('span', { style: { flex: 1 } }),
          h('button', {
            style: { ...button('primary'), padding: '2px 8px', fontSize: 11 },
            // The FULL navigator: this is a user action, not the model's.
            onClick: async () => {
              const r = await t.navigator.reveal(hit.revealIntent || { domain: hit.domain, id: hit.id });
              if (!r.ok) setAnswer((a) => ({ ...(a || { hits: [] }), error: r.message }));
              else t.closeAssistant();
            },
          }, 'Show me'),
        ))),
      ) : null,

      answer.hits && answer.hits.length ? h('div', { style: { marginTop: 10 } },
        h('div', { style: { fontSize: 11, color: theme.muted, marginBottom: 4 } },
          answer.text ? 'Based on' : 'Found in the tour'),
        answer.hits.map((hit) => h('div', {
          key: hit.id,
          style: { padding: '6px 8px', background: '#1e293b', borderRadius: 6, marginBottom: 4, fontSize: 12 },
        },
        h('div', { style: { color: theme.panelFg } }, String(hit.text || '').slice(0, 180)),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 } },
          h('span', { style: { fontSize: 10, color: theme.muted } }, `${hit.kind}${hit.source ? ` · ${hit.source}` : ''}`),
          h('span', { style: { flex: 1 } }),
          // The best answer to "where is that" is usually to go there.
          hit.stepId ? h('button', {
            style: { ...button(), padding: '2px 8px', fontSize: 11 },
            onClick: () => { t.closeAssistant(); t.goTo(hit.stepId); },
          }, 'Take me there') : null,
        ))),
      ) : null,

      h('div', { style: { display: 'flex', gap: 8, marginTop: 12 } },
        h('button', { style: button('primary'), onClick: t.closeAssistant }, 'Continue the tour'),
        h('button', { style: button(), onClick: t.stop }, 'End tour'),
      ),
    ) : null,
  );
}

export { TourAssistant };

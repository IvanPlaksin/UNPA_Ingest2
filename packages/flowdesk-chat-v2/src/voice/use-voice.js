import { useCallback, useEffect, useRef, useState } from 'react';
import { useChatStore, useChatActions } from '../store/chat-store';
import { getConfig } from '../config/runtime-config';
import { VoiceSession, VoiceState } from './voice-session';

/**
 * useVoice — React binding for a live voice session.
 *
 * Returns { state, error, isActive, start, stop, toggle }. Transcripts (both the
 * user's utterances and the assistant's replies) are appended to the same chat
 * history as text messages, tagged metadata.source='voice', so the timeline is
 * unified across modalities.
 */
export function useVoice({ userId, lang, voice } = {}) {
  const [state, setState] = useState(VoiceState.IDLE);
  const [error, setError] = useState(null);
  const [level, setLevel] = useState(0); // Phase 6: TTS amplitude [0,1] for the orb
  const sessionRef = useRef(null);
  const rafRef = useRef(null);
  const actions = useChatActions();
  const sessionId = useChatStore((s) => s.session.id);

  // Phase 6: poll the live session's output amplitude on each frame while a
  // session is active, so the voice orb can pulse with the agent's TTS.
  useEffect(() => {
    const active = state !== VoiceState.IDLE && state !== VoiceState.ERROR;
    if (!active) { setLevel(0); return undefined; }
    let mounted = true;
    const tick = () => {
      if (!mounted) return;
      setLevel(sessionRef.current ? sessionRef.current.getLevel() : 0);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { mounted = false; if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state]);

  const stop = useCallback(async () => {
    const sess = sessionRef.current;
    sessionRef.current = null;
    if (sess) await sess.stop();
    setState(VoiceState.IDLE);
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current) return;
    setError(null);
    const sess = new VoiceSession({
      sessionId,
      userId: userId || getConfig().userId,
      lang,
      voice,
      onState: setState,
      onTranscript: (role, content, extra) => {
        // Carry the assistant turn-contract (controls[]/resolveChoices/responseType/
        // preamble) into the message metadata so Live Chat renders the same embedded
        // choice/confirm/autocomplete controls as the text chat. ControlRenderer
        // dispatches clicks over the shared-session REST path.
        const metadata = { source: 'voice' };
        if (role === 'assistant' && extra && extra.meta) Object.assign(metadata, extra.meta);
        actions.addMessage(role, content, metadata);
      },
      onError: (err) => {
        setError(err);
        setState(VoiceState.ERROR);
        // Surface as a system line so the user sees what happened, then fall back to text.
        // The raw technical detail (e.g. "voice token failed (HTTP 404)") goes to the
        // console, not the chat — metadata.kind lets the bubble show a mic icon instead
        // of chat-v2's generic warning glyph.
        // eslint-disable-next-line no-console
        console.error('[flowdesk-chat-v2] voice session failed:', err);
        const text = "I couldn't connect to the voice assistant. Please try again in a moment.";
        const debugDetail = getConfig().debug ? err.message : null;
        actions.addMessage('system', text, { kind: 'voice-error', debugDetail });
        sessionRef.current = null;
      },
    });
    sessionRef.current = sess;
    await sess.start();
  }, [sessionId, userId, lang, voice, actions]);

  const toggle = useCallback(() => {
    if (sessionRef.current) return stop();
    return start();
  }, [start, stop]);

  // Clean up on unmount.
  useEffect(() => () => { if (sessionRef.current) sessionRef.current.stop(); }, []);

  const isActive = state !== VoiceState.IDLE && state !== VoiceState.ERROR;
  return { state, error, level, isActive, start, stop, toggle };
}

export { VoiceState };

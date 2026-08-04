import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoice, VoiceState } from '../voice/use-voice';
import VoiceOrb from './VoiceOrb.jsx';
import { useAIPrefs } from '../prefs/ai-prefs';
import { effectiveVoice } from '../prefs/voice-options';

/** Map the voice-session state to a VoiceOrb visual state. */
const ORB_STATE = {
  [VoiceState.CONNECTING]: 'thinking',
  [VoiceState.LISTENING]: 'listening',
  [VoiceState.PROCESSING]: 'thinking',
  [VoiceState.SPEAKING]: 'speaking',
};

/**
 * LiveChatButton (F6) — "Live Chat" affordance in the composer toolbar.
 *
 * Wired to a live Voice Live session (browser → backend proxy → Azure). Click to
 * start a spoken conversation; click again to stop. The button reflects the
 * session state (connecting / listening / speaking) and reports mic/connection
 * errors inline via the chat history (see useVoice).
 */
export function LiveChatButton({ userId, onActiveChange }) {
  const { t } = useTranslation();
  // CS-1: the GLOBAL AI-Settings language (single source of truth) governs the
  // voice agent — recognition AND output — with no auto-detect. CS-2 adds voice.
  const [prefs] = useAIPrefs();
  const { state, level, isActive, toggle } = useVoice({ userId, lang: prefs.language, voice: effectiveVoice(prefs, prefs.language) });

  // Lets the host (which owns content outside this component, e.g. the Home hero's
  // catalog button) blur/disable it while a voice session is connecting or live —
  // this overlay is confined to .fdv2-conversation, so it can't reach siblings.
  useEffect(() => { onActiveChange?.(isActive); }, [isActive, onActiveChange]);

  const label = t('liveChat');
  const busy = state === VoiceState.CONNECTING;
  const statusText = {
    [VoiceState.IDLE]: label,
    [VoiceState.CONNECTING]: t('liveChatConnecting', 'Connecting…'),
    [VoiceState.LISTENING]: t('liveChatListening', 'Listening…'),
    [VoiceState.PROCESSING]: t('liveChatProcessing', 'Thinking…'),
    [VoiceState.SPEAKING]: t('liveChatSpeaking', 'Speaking…'),
    [VoiceState.ERROR]: label,
  }[state] || label;

  // CS-3: round FAB matching the voice-launcher activation button, sized to the
  // composer tool height. Colour + motion are state-driven (data-voice-state):
  // CONNECTING = grey + "connecting" tooltip; LISTENING/PROCESSING = accent + ring;
  // SPEAKING = pulse, amplitude-driven (--fdv2-level) while the assistant's audio plays.
  const speaking = state === VoiceState.SPEAKING;
  const button = (
    <button
      type="button"
      className={`fdv2-livechat-fab${isActive ? ' is-active' : ''}`}
      data-voice-state={state}
      style={speaking ? { '--fdv2-level': level || 0 } : undefined}
      onClick={toggle}
      aria-pressed={isActive}
      title={statusText}
      aria-label={statusText}
    >
      {busy ? (
        // spinner
        <svg className="fdv2-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : isActive ? (
        // active → tap to stop voice and go back to typing (crossed-out mic)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19v3" />
          <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
          <path d="M16.95 16.95A7 7 0 0 1 5 12v-2" />
          <path d="M18.89 13.23A7 7 0 0 0 19 12v-2" />
          <path d="m2 2 20 20" />
          <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
        </svg>
      ) : (
        // idle → tap to start voice (mic)
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19v3" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <rect x="9" y="2" width="6" height="13" rx="3" />
        </svg>
      )}
    </button>
  );

  // Phase 6: while a session is live, show the pulsing voice orb as an overlay. NOT
  // portaled — position:absolute (see .fdv2-voice-overlay) resolves against the
  // nearest positioned ancestor (.fdv2-conversation), so it covers whichever
  // AltioraChat instance actually triggered it (the Home panel, or a floating window
  // like Help) instead of always centering on the full page regardless of context.
  const overlay = isActive
    ? (
        <div className="fdv2-voice-overlay" role="presentation" onClick={toggle}>
          <div className="fdv2-voice-stage" onClick={(e) => e.stopPropagation()}>
            <VoiceOrb state={ORB_STATE[state] || 'idle'} amplitude={level} size={14} label={statusText} />
            <div className="fdv2-voice-status">{statusText}</div>
            <button type="button" className="fdv2-voice-end" onClick={toggle}>{t('liveChatEnd', 'End')}</button>
          </div>
        </div>
      )
    : null;

  return (<>{button}{overlay}</>);
}
